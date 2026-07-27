import { Invoice, InvoiceStatus, Prisma, PrismaClient, TxnType, Return as ReturnRecord } from '@prisma/client';
import { prisma as defaultPrisma } from '../db';
import { consumeAuthorizationGrant, AuthorizationError } from './authorizationService';

export class ReturnError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReturnError';
  }
}

export interface ReturnLine {
  itemId: number;
  qty: number;
}

export interface ProcessReturnInput {
  invoiceId: string;
  lines: ReturnLine[];
  userId: number;
  /** One-time manager authorization grant id — every refund requires one; the reason is read back from the grant. */
  refundAuthToken?: string;
}

export type ProcessReturnResult = {
  invoice: Invoice;
  return: ReturnRecord;
};

/**
 * Atomically processes a full or partial return:
 *  - Validates quantities against sold minus already-returned
 *  - Restores finishedStock for each part (set lines restore all components)
 *  - Writes RETURN StockTxn rows (positive qty = back into stock)
 *  - Increments InvoiceItem.returnedQty
 *  - Sets status REFUNDED (all items fully returned) or PARTIAL_REFUND
 *
 * Throws ReturnError on validation failure; never silently overshoots returnedQty.
 */
export async function processReturn(
  input: ProcessReturnInput,
  db: PrismaClient = defaultPrisma,
): Promise<ProcessReturnResult> {
  if (input.lines.length === 0) throw new ReturnError('No items selected for return');

  return db.$transaction(async (tx) => {
    // ── 0. Manager authorization — every refund requires a valid grant ───────
    // The reason and authorizer are read back from the grant row, never from
    // client-supplied fields, so a forged authorizedById can't be persisted.
    let grant: { authorizedById: number; reason: string };
    try {
      grant = await consumeAuthorizationGrant(tx, {
        authToken: input.refundAuthToken,
        action: 'refund',
      });
    } catch (err) {
      if (err instanceof AuthorizationError) throw new ReturnError(err.message);
      throw err;
    }

    // ── 1. Fetch invoice with items and set components ──────────────────────
    const invoice = await tx.invoice.findUnique({
      where: { id: input.invoiceId },
      include: {
        items: {
          include: {
            set: { include: { components: true } },
          },
        },
      },
    });

    if (!invoice) throw new ReturnError('Invoice not found');
    if (invoice.status === InvoiceStatus.HELD) {
      throw new ReturnError('Cannot return a held sale');
    }
    if (invoice.status === InvoiceStatus.REFUNDED) {
      throw new ReturnError('Invoice is already fully refunded');
    }

    const itemsById = new Map(invoice.items.map((i) => [i.id, i]));

    // ── 2. Validate return quantities ───────────────────────────────────────
    for (const line of input.lines) {
      if (line.qty <= 0) throw new ReturnError('Return quantity must be positive');
      const item = itemsById.get(line.itemId);
      if (!item) {
        throw new ReturnError(`Item ${line.itemId} not found on invoice ${input.invoiceId}`);
      }
      const available = item.qty - item.returnedQty;
      if (line.qty > available) {
        throw new ReturnError(
          `Cannot return ${line.qty} — only ${available} available for return`,
        );
      }
    }

    // ── 3. Collect net restorations per part ────────────────────────────────
    const netRestorations = new Map<number, number>(); // partId → qty to restore

    for (const line of input.lines) {
      const item = itemsById.get(line.itemId)!;

      if (item.partId !== null) {
        netRestorations.set(item.partId, (netRestorations.get(item.partId) ?? 0) + line.qty);
      } else if (item.setId !== null && item.set) {
        for (const comp of item.set.components) {
          const restoration = comp.qty * line.qty;
          netRestorations.set(comp.partId, (netRestorations.get(comp.partId) ?? 0) + restoration);
        }
      }
    }

    // ── 4. Pessimistic row-locks ────────────────────────────────────────────
    for (const partId of netRestorations.keys()) {
      await tx.$executeRaw`SELECT id FROM "Part" WHERE id = ${partId} FOR UPDATE`;
    }

    // ── 5. Restore stock + write RETURN StockTxn per part ──────────────────
    for (const [partId, qty] of netRestorations) {
      await tx.part.update({
        where: { id: partId },
        data: { finishedStock: { increment: qty } },
      });
      await tx.stockTxn.create({
        data: {
          type: TxnType.RETURN,
          partId,
          qty, // positive = returned back into finished stock
          reference: input.invoiceId,
          userId: input.userId,
        },
      });
    }

    // ── 6. Increment InvoiceItem.returnedQty ────────────────────────────────
    for (const line of input.lines) {
      await tx.invoiceItem.update({
        where: { id: line.itemId },
        data: { returnedQty: { increment: line.qty } },
      });
    }

    // ── 7. Compute new status (in-memory, no extra DB round-trip) ───────────
    const updatedReturned = new Map(invoice.items.map((i) => [i.id, i.returnedQty]));
    for (const line of input.lines) {
      updatedReturned.set(line.itemId, (updatedReturned.get(line.itemId) ?? 0) + line.qty);
    }
    const allFullyReturned = invoice.items.every(
      (i) => (updatedReturned.get(i.id) ?? 0) >= i.qty,
    );
    const newStatus = allFullyReturned ? InvoiceStatus.REFUNDED : InvoiceStatus.PARTIAL_REFUND;

    // ── 8. Update invoice status ────────────────────────────────────────────
    const updatedInvoice = await tx.invoice.update({
      where: { id: input.invoiceId },
      data: { status: newStatus },
    });

    // ── 9. Record the Return — reason + authorizer come from the grant only ──
    let refundAmount = new Prisma.Decimal(0);
    for (const line of input.lines) {
      const item = itemsById.get(line.itemId)!;
      refundAmount = refundAmount.add(item.unitPrice.mul(line.qty));
    }

    const returnRecord = await tx.return.create({
      data: {
        invoiceId: input.invoiceId,
        refundReason: grant.reason,
        refundAuthorizedById: grant.authorizedById,
        userId: input.userId,
        refundAmount,
      },
    });

    for (const line of input.lines) {
      await tx.returnItem.create({
        data: { returnId: returnRecord.id, invoiceItemId: line.itemId, qty: line.qty },
      });
    }

    return { invoice: updatedInvoice, return: returnRecord };
  });
}
