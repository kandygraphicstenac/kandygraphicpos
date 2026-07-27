import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { completeSale, SaleError } from '@/lib/services/saleService';
import { PosSaleBodySchema } from '@/lib/validators/pos';

/**
 * POST /api/pos/sale
 *
 * Thin route handler — all business logic lives in saleService.completeSale().
 * Validates the body, maps strings → Prisma.Decimal, calls the service, and
 * returns { invoiceId } on success or a typed error payload on failure.
 *
 * Roles: OWNER, CASHIER.  CUTTER is blocked (403).
 * Returns 400 on stock/cart errors (SaleError — user-visible message); 500 with requestId for unexpected errors.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── Auth ─────────────────────────────────────────────────────────────────────
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (user.role === 'CUTTER') return forbiddenResponse();

  // ── Validate body ─────────────────────────────────────────────────────────────
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = PosSaleBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const {
    companyId, lines, payment, orderType, discountPct, tendered, paymentReference, cardLast4, discountAuthToken,
    customerId, deliveryFee, deliveryAddress,
  } = parsed.data;

  // ── Call service ──────────────────────────────────────────────────────────────
  try {
    const invoice = await completeSale({
      companyId,
      lines: lines.map((l) =>
        l.type === 'part'
          ? {
              type: 'part' as const,
              partId: l.partId,
              qty: l.qty,
              unitPrice: new Prisma.Decimal(l.unitPrice),
            }
          : {
              type: 'set' as const,
              setId: l.setId,
              qty: l.qty,
              unitPrice: new Prisma.Decimal(l.unitPrice),
            },
      ),
      payment,
      orderType,
      discountPct: new Prisma.Decimal(discountPct),
      tendered: tendered != null ? new Prisma.Decimal(tendered) : undefined,
      paymentReference: paymentReference ?? undefined,
      cardLast4: cardLast4 ?? undefined,
      discountAuthToken: discountAuthToken ?? undefined,
      customerId: customerId ?? undefined,
      deliveryFee: deliveryFee != null ? new Prisma.Decimal(deliveryFee) : undefined,
      deliveryAddress: deliveryAddress ?? undefined,
      userId: user.id,
    });

    return NextResponse.json(
      { invoiceId: invoice.id, companyName: invoice.company.name },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof SaleError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const requestId = crypto.randomUUID();
    console.error(`[POST /api/pos/sale] requestId=${requestId}`, err);
    return NextResponse.json(
      { error: 'Sale failed — nothing was charged or deducted', requestId },
      { status: 500 },
    );
  }
}
