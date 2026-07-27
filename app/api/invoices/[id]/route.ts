import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';

/**
 * GET /api/invoices/[id]
 * Returns the full invoice detail: company, cashier, customer, line items (with returnedQty),
 * totals, tendered/change.
 * CUTTER role is blocked. CASHIER may open ANY invoice by id regardless of date —
 * unlike the list endpoint, detail lookup is never date-restricted, since a
 * cashier must be able to find and start a return on an old sale (e.g. via a
 * scanned barcode or invoice number). Cost/margin fields are never selected
 * here for any role; refund reason + authorizer on `returns` are owner-only.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (user.role === 'CUTTER') return forbiddenResponse();

  const { id } = await params;

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      company: {
        select: { id: true, code: true, name: true, address: true, phone: true, regNo: true },
      },
      user: { select: { name: true } },
      customer: { select: { name: true, phone: true } },
      discountAuthorizedBy: { select: { name: true } },
      items: {
        include: {
          part: { select: { name: true, sku: true } },
          set: { select: { name: true, sku: true } },
        },
        orderBy: { id: 'asc' },
      },
      returns: {
        include: {
          refundAuthorizedBy: { select: { name: true } },
          user: { select: { name: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  return NextResponse.json({
    id: invoice.id,
    createdAt: invoice.createdAt.toISOString(),
    company: invoice.company,
    user: invoice.user,
    customer: invoice.customer,
    subtotal: invoice.subtotal.toString(),
    discountPct: invoice.discountPct.toString(),
    discountAmt: invoice.discountAmt.toString(),
    discountReason: invoice.discountReason ?? null,
    discountAuthorizedBy: invoice.discountAuthorizedBy ? { name: invoice.discountAuthorizedBy.name } : null,
    total: invoice.total.toString(),
    deliveryFee: invoice.deliveryFee.toString(),
    deliveryAddress: invoice.deliveryAddress,
    orderType: invoice.orderType,
    deliveryStatus: invoice.deliveryStatus,
    tendered: invoice.tendered?.toString() ?? null,
    payment: invoice.payment,
    paymentReference: invoice.paymentReference ?? null,
    cardLast4: invoice.cardLast4 ?? null,
    status: invoice.status,
    items: invoice.items.map((item) => ({
      id: item.id,
      partId: item.partId,
      setId: item.setId,
      part: item.part,
      set: item.set,
      qty: item.qty,
      returnedQty: item.returnedQty,
      unitPrice: item.unitPrice.toString(),
      lineTotal: item.lineTotal.toString(),
    })),
    // Refund reason + authorizer are owner-only visible
    returns: user.role === 'OWNER'
      ? invoice.returns.map((r) => ({
          id: r.id,
          refundReason: r.refundReason,
          refundAmount: r.refundAmount.toString(),
          createdAt: r.createdAt.toISOString(),
          authorizedByName: r.refundAuthorizedBy.name,
          processedByName: r.user.name,
        }))
      : [],
  });
}
