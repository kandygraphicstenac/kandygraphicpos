import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { DELIVERY_STATUS_FLOW } from '@/lib/constants/delivery';

const BodySchema = z.object({ status: z.enum(DELIVERY_STATUS_FLOW) });

/**
 * PATCH /api/invoices/[id]/delivery-status
 * Sets the delivery status on a DELIVERY-type invoice. Not a stock-changing
 * operation (purely informational packing/shipping tracker), so this is a
 * plain update — no $transaction/StockTxn needed.
 * OWNER + CASHIER (whoever is packing/shipping); CUTTER blocked.
 * Any value in the flow may be set (not just the "next" one) so a mistake
 * can be corrected — the UI only ever exposes the next-step action.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (user.role === 'CUTTER') return forbiddenResponse();

  const { id } = await params;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    select: { orderType: true },
  });
  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  if (invoice.orderType !== 'DELIVERY') {
    return NextResponse.json({ error: 'Not a delivery order' }, { status: 400 });
  }

  const updated = await prisma.invoice.update({
    where: { id },
    data: { deliveryStatus: parsed.data.status },
    select: { id: true, deliveryStatus: true },
  });

  return NextResponse.json(updated);
}
