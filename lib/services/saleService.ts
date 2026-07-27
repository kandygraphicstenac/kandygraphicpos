import { Company, Customer, Invoice, InvoiceStatus, OrderType, PaymentMethod, Prisma, PrismaClient, TxnType } from '@prisma/client';
import { prisma as defaultPrisma } from '../db';
import { consumeAuthorizationGrant, AuthorizationError } from './authorizationService';
import { getDiscountApprovalThresholdPct } from './settingsService';

export class SaleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaleError';
  }
}

export interface PartCartLine {
  type: 'part';
  partId: number;
  qty: number;
  unitPrice: Prisma.Decimal;
}

export interface SetCartLine {
  type: 'set';
  setId: number;
  qty: number;
  unitPrice: Prisma.Decimal;
}

export type CartLine = PartCartLine | SetCartLine;

export interface CompleteSaleInput {
  companyId: number;
  lines: CartLine[];
  payment: PaymentMethod;
  /** Chosen at the start of the sale. DELIVERY requires customerId + deliveryAddress + deliveryFee > 0 (validated below — never trust the client-side gate alone). */
  orderType: OrderType;
  /** Whole-sale percentage discount (0–100) */
  discountPct?: Prisma.Decimal;
  /** Whole-sale flat discount amount in LKR */
  discountAmt?: Prisma.Decimal;
  /** Cash tendered by customer — stored for receipt change calculation */
  tendered?: Prisma.Decimal;
  /** EDC approval code or bank transfer reference */
  paymentReference?: string;
  /** Last 4 digits of card number */
  cardLast4?: string;
  /** One-time manager authorization grant id — required whenever discountPct exceeds the configured threshold (or discountAmt > 0) */
  discountAuthToken?: string;
  customerId?: number;
  /** Pass-through fee — added to what the customer pays but NEVER folded into `total` (sales/profit aggregates read `total` only). */
  deliveryFee?: Prisma.Decimal;
  /** Frozen at sale time; independent of the Customer record, which may be edited later. */
  deliveryAddress?: { name: string; phone?: string; line1: string; line2?: string; city?: string; postalCode?: string };
  userId: number;
}

export type SaleResult = Invoice & {
  company: Pick<Company, 'id' | 'code' | 'name' | 'address' | 'phone' | 'regNo'>;
};

// ─── Invoice ID generation ────────────────────────────────────────────────────

/**
 * Generates the next invoice ID for the given company prefix + year.
 * Format: {prefix}-{YYYY}-{NNNNN} (e.g. KG-2026-00001)
 * Must run inside an existing transaction for collision safety.
 */
async function generateInvoiceId(
  tx: Prisma.TransactionClient,
  invoicePrefix: string,
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `${invoicePrefix}-${year}-`;

  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Invoice"
    WHERE id LIKE ${prefix + '%'}
    ORDER BY id DESC
    LIMIT 1
  `;

  const next = rows.length === 0 ? 1 : parseInt(rows[0].id.slice(prefix.length), 10) + 1;
  return `${prefix}${String(next).padStart(5, '0')}`;
}

// ─── Main service ─────────────────────────────────────────────────────────────

/**
 * Atomically: validates the company is active, generates a per-company invoice ID,
 * validates stock inside the transaction (FOR UPDATE row-locks), creates the
 * Invoice + InvoiceItem rows, deducts finishedStock, and writes SALE StockTxn
 * audit rows. Returns the invoice with company details for receipt rendering.
 *
 * Virtual set sales deduct each component part per SetComponent.qty × line qty.
 * Throws SaleError on insufficient stock or invalid company (never oversells).
 */
export async function completeSale(
  input: CompleteSaleInput,
  db: PrismaClient = defaultPrisma,
): Promise<SaleResult> {
  if (input.lines.length === 0) throw new SaleError('Cart is empty');

  return db.$transaction(async (tx) => {
    const ZERO = new Prisma.Decimal(0);

    // ── 0. Validate company ──────────────────────────────────────────────────
    const company = await tx.company.findUnique({
      where: { id: input.companyId },
      select: { id: true, code: true, name: true, address: true, phone: true, regNo: true, active: true, invoicePrefix: true },
    });
    if (!company || !company.active) {
      throw new SaleError('Selected company is not available');
    }

    const partLines = input.lines.filter((l): l is PartCartLine => l.type === 'part');
    const setLines = input.lines.filter((l): l is SetCartLine => l.type === 'set');

    // ── 1. Fetch sets with their components ──────────────────────────────────
    const setIds = setLines.map((l) => l.setId);
    const sets =
      setIds.length > 0
        ? await tx.stickerSet.findMany({
            where: { id: { in: setIds } },
            include: { components: true },
          })
        : [];

    const setsById = new Map(sets.map((s) => [s.id, s]));

    for (const line of setLines) {
      if (!setsById.has(line.setId)) throw new SaleError(`Set ${line.setId} not found`);
    }

    // ── 2. Collect every part ID we will touch ───────────────────────────────
    const allPartIds = new Set<number>();
    for (const l of partLines) allPartIds.add(l.partId);
    for (const l of setLines) {
      for (const comp of setsById.get(l.setId)!.components) allPartIds.add(comp.partId);
    }

    // ── 3. Pessimistic row-locks (SELECT … FOR UPDATE) ───────────────────────
    for (const partId of allPartIds) {
      await tx.$executeRaw`SELECT id FROM "Part" WHERE id = ${partId} FOR UPDATE`;
    }

    // ── 4. Re-read locked part stocks ────────────────────────────────────────
    const parts = await tx.part.findMany({
      where: { id: { in: Array.from(allPartIds) } },
    });
    const partsById = new Map(parts.map((p) => [p.id, p]));

    // ── 4b. Reject any part line whose price is null (non-sellable item) ────
    for (const l of partLines) {
      const part = partsById.get(l.partId);
      if (part && part.price == null) {
        throw new SaleError(`"${part.name}" has no price and can't be sold`);
      }
    }

    // ── 5. Accumulate net deductions per part ────────────────────────────────
    const netDeductions = new Map<number, number>();

    for (const l of partLines) {
      netDeductions.set(l.partId, (netDeductions.get(l.partId) ?? 0) + l.qty);
    }

    for (const l of setLines) {
      for (const comp of setsById.get(l.setId)!.components) {
        const needed = comp.qty * l.qty;
        netDeductions.set(comp.partId, (netDeductions.get(comp.partId) ?? 0) + needed);
      }
    }

    // ── 6. Oversell validation ───────────────────────────────────────────────
    for (const [partId, needed] of netDeductions) {
      const part = partsById.get(partId);
      if (!part) throw new SaleError(`Part ${partId} not found`);
      if (part.finishedStock < needed) {
        throw new SaleError(
          `Not enough stock for ${part.name} — ${part.finishedStock} available`,
        );
      }
    }

    // ── 6b. Validate customer, if attached ────────────────────────────────────
    // CREDIT sales row-lock the customer (mirrors the Part FOR UPDATE pattern
    // above) since they mutate balance — without the lock, two near-simultaneous
    // credit sales could both pass the limit check before either commits.
    let creditCustomer: Customer | null = null;
    if (input.customerId) {
      if (input.payment === PaymentMethod.CREDIT) {
        await tx.$executeRaw`SELECT id FROM "Customer" WHERE id = ${input.customerId} FOR UPDATE`;
        creditCustomer = await tx.customer.findUnique({ where: { id: input.customerId } });
        if (!creditCustomer) throw new SaleError('Selected customer not found');
      } else {
        const customer = await tx.customer.findUnique({ where: { id: input.customerId }, select: { id: true } });
        if (!customer) throw new SaleError('Selected customer not found');
      }
    }

    // ── 7. Generate per-company sequential invoice ID ────────────────────────
    const invoiceId = await generateInvoiceId(tx, company.invoicePrefix);

    // ── 8. Compute totals (all Decimal — no floats) ──────────────────────────
    const discountPct = input.discountPct ?? ZERO;
    const discountAmt = input.discountAmt ?? ZERO;

    let subtotal = ZERO;
    for (const l of input.lines) {
      subtotal = subtotal.add(new Prisma.Decimal(l.qty).mul(l.unitPrice));
    }

    const pctOff = subtotal.mul(discountPct).div(100);
    // `total` is product sales only — deliveryFee is NEVER added here. The
    // customer pays total + deliveryFee, but reports/profit must read `total`
    // alone, so deliveryFee stays a separate column (see CLAUDE.md).
    const total = subtotal.sub(pctOff).sub(discountAmt);
    const deliveryFee = input.deliveryFee ?? ZERO;
    // Full amount this sale adds to the customer's balance when paid on
    // credit — product total AND the delivery fee, since on CREDIT no cash
    // is collected for either.
    const creditChargeAmount = total.add(deliveryFee);

    // ── 8a0. Credit payment requirements ──────────────────────────────────────
    // The POS UI only shows the Credit button when eligible, but that's a UX
    // convenience only — re-verify here against a row-locked balance so two
    // concurrent sales can't both slip past the limit.
    if (input.payment === PaymentMethod.CREDIT) {
      if (!creditCustomer) throw new SaleError('Credit sales require a customer');
      if (!creditCustomer.creditEnabled) throw new SaleError('This customer is not enabled for credit');
      if (creditCustomer.creditLimit != null) {
        const projectedBalance = creditCustomer.balance.add(creditChargeAmount);
        if (projectedBalance.greaterThan(creditCustomer.creditLimit)) {
          throw new SaleError('This sale would exceed the customer\'s credit limit');
        }
      }
    }

    // ── 8a. Delivery order requirements ──────────────────────────────────────
    // The POS UI disables the complete button until these are set, but that's
    // a UX convenience only — re-verify server-side so the fee (and the
    // address/customer it ships to) can never be silently skipped.
    if (input.orderType === OrderType.DELIVERY) {
      if (!input.customerId) throw new SaleError('Delivery orders require a customer');
      if (!input.deliveryAddress) throw new SaleError('Delivery orders require a delivery address');
      if (!input.deliveryFee || input.deliveryFee.lessThanOrEqualTo(ZERO)) {
        throw new SaleError('Delivery orders require a delivery fee greater than zero');
      }
    }

    // ── 8b. Manager authorization for discounts ──────────────────────────────
    // Flat discounts always need approval (no configurable threshold for them);
    // percentage discounts need approval only above the owner-configured threshold.
    const thresholdPct = await getDiscountApprovalThresholdPct(tx);
    const needsDiscountAuth = discountAmt.greaterThan(ZERO) || discountPct.greaterThan(thresholdPct);

    let discountReason: string | null = null;
    let discountAuthorizedById: number | null = null;

    if (needsDiscountAuth) {
      try {
        const grant = await consumeAuthorizationGrant(tx, {
          authToken: input.discountAuthToken,
          action: 'discount',
        });
        discountReason = grant.reason;
        discountAuthorizedById = grant.authorizedById;
      } catch (err) {
        if (err instanceof AuthorizationError) throw new SaleError(err.message);
        throw err;
      }
    }

    // ── 9. Create Invoice ────────────────────────────────────────────────────
    const invoice = await tx.invoice.create({
      data: {
        id: invoiceId,
        companyId: company.id,
        customerId: input.customerId ?? null,
        subtotal,
        discountPct,
        discountAmt,
        discountReason,
        discountAuthorizedById,
        total,
        deliveryFee,
        deliveryAddress: input.deliveryAddress ?? Prisma.JsonNull,
        orderType: input.orderType,
        deliveryStatus: input.orderType === OrderType.DELIVERY ? 'TO_PACK' : null,
        tendered: input.tendered ?? null,
        paymentReference: input.paymentReference ?? null,
        cardLast4: input.cardLast4 ?? null,
        payment: input.payment,
        status: InvoiceStatus.PAID,
        userId: input.userId,
      },
    });

    // ── 10. Create InvoiceItem rows ──────────────────────────────────────────
    for (const l of input.lines) {
      const lineTotal = new Prisma.Decimal(l.qty).mul(l.unitPrice);
      if (l.type === 'part') {
        // Snapshot cost at sale time so profit reports are accurate even if Part.cost changes later
        const unitCost = partsById.get(l.partId)?.cost ?? null;
        await tx.invoiceItem.create({
          data: { invoiceId, partId: l.partId, qty: l.qty, unitPrice: l.unitPrice, lineTotal, unitCost },
        });
      } else {
        // Set cost = sum of (component.cost × component.qty); null if any component lacks a cost
        const setDef = setsById.get(l.setId)!;
        let setCost: Prisma.Decimal | null = new Prisma.Decimal(0);
        for (const comp of setDef.components) {
          const compPart = partsById.get(comp.partId);
          if (compPart?.cost == null) { setCost = null; break; }
          setCost = setCost!.add(compPart.cost.mul(comp.qty));
        }
        await tx.invoiceItem.create({
          data: { invoiceId, setId: l.setId, qty: l.qty, unitPrice: l.unitPrice, lineTotal, unitCost: setCost },
        });
      }
    }

    // ── 11. Deduct stock + write StockTxn audit rows (atomically) ────────────
    for (const [partId, deduction] of netDeductions) {
      await tx.part.update({
        where: { id: partId },
        data: { finishedStock: { decrement: deduction } },
      });

      await tx.stockTxn.create({
        data: {
          type: TxnType.SALE,
          partId,
          qty: -deduction, // negative = out of finished stock
          reference: invoiceId,
          userId: input.userId,
        },
      });
    }

    // ── 12. Credit sale: increase balance + write CustomerLedger row ────────
    // Same transaction as the stock deduction above — balance must always be
    // reconstructable as SUM(amount) over CustomerLedger (see CLAUDE.md).
    if (input.payment === PaymentMethod.CREDIT && creditCustomer) {
      await tx.customer.update({
        where: { id: creditCustomer.id },
        data: { balance: { increment: creditChargeAmount } },
      });
      await tx.customerLedger.create({
        data: {
          customerId: creditCustomer.id,
          type: 'CREDIT_SALE',
          amount: creditChargeAmount,
          invoiceId,
          userId: input.userId,
        },
      });
    }

    // Return invoice + company snapshot (used by route to render confirmation/receipt)
    return { ...invoice, company };
  });
}
