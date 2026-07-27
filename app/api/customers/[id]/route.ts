import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { CustomerBodySchema } from '@/lib/validators/customer';

/**
 * GET /api/customers/[id]
 * Customer profile + recent purchase history (up to 50 invoices) + total
 * spend + credit balance/limit + ledger history (up to 200 most recent
 * rows). Cost/profit are never selected here — purchase history shows the
 * same fields as the invoice list (no margin data) for both roles.
 * OWNER + CASHIER; CUTTER blocked.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (user.role === 'CUTTER') return forbiddenResponse();

  const { id: idParam } = await params;
  const id = parseInt(idParam, 10);
  if (isNaN(id)) return NextResponse.json({ error: 'Invalid customer id' }, { status: 400 });

  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });

  const [invoices, agg, ledger] = await Promise.all([
    prisma.invoice.findMany({
      where: { customerId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        createdAt: true,
        total: true,
        deliveryFee: true,
        status: true,
        payment: true,
        company: { select: { code: true } },
      },
    }),
    prisma.invoice.aggregate({
      where: { customerId: id, status: { in: ['PAID', 'PARTIAL_REFUND'] } },
      _sum: { total: true, deliveryFee: true },
      _count: true,
    }),
    prisma.customerLedger.findMany({
      where: { customerId: id },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        type: true,
        amount: true,
        invoiceId: true,
        note: true,
        createdAt: true,
        user: { select: { name: true } },
      },
    }),
  ]);

  return NextResponse.json({
    ...customer,
    createdAt: customer.createdAt.toISOString(),
    creditLimit: customer.creditLimit?.toString() ?? null,
    balance: customer.balance.toString(),
    purchaseCount: agg._count,
    totalSpend: (agg._sum.total ?? new Prisma.Decimal(0)).toString(),
    totalDeliveryPaid: (agg._sum.deliveryFee ?? new Prisma.Decimal(0)).toString(),
    invoices: invoices.map((inv) => ({
      id: inv.id,
      createdAt: inv.createdAt.toISOString(),
      total: inv.total.toString(),
      deliveryFee: inv.deliveryFee.toString(),
      status: inv.status,
      payment: inv.payment,
      company: inv.company,
    })),
    ledger: ledger.map((l) => ({
      id: l.id,
      type: l.type,
      amount: l.amount.toString(),
      invoiceId: l.invoiceId,
      note: l.note,
      userName: l.user.name,
      createdAt: l.createdAt.toISOString(),
    })),
  });
}

/**
 * PATCH /api/customers/[id]
 * Full-replace update (the edit drawer always submits the whole form).
 * OWNER + CASHIER; CUTTER blocked. 409 on duplicate phone.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (user.role === 'CUTTER') return forbiddenResponse();

  const { id: idParam } = await params;
  const id = parseInt(idParam, 10);
  if (isNaN(id)) return NextResponse.json({ error: 'Invalid customer id' }, { status: 400 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = CustomerBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
  }

  if (parsed.data.active !== undefined && user.role !== 'OWNER') {
    return NextResponse.json({ error: 'Only an owner can reactivate a customer' }, { status: 403 });
  }

  try {
    const customer = await prisma.customer.update({ where: { id }, data: parsed.data });
    return NextResponse.json({
      ...customer,
      createdAt: customer.createdAt.toISOString(),
      creditLimit: customer.creditLimit?.toString() ?? null,
      balance: customer.balance.toString(),
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') {
        return NextResponse.json({ error: 'A customer with this phone number already exists' }, { status: 409 });
      }
      if (err.code === 'P2025') {
        return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
      }
    }
    throw err;
  }
}

/**
 * DELETE /api/customers/[id]
 * Mirrors the parts/users lifecycle pattern: deactivates (sets active=false)
 * if the customer has any invoices or ledger history, otherwise permanently
 * deletes. OWNER only.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (user.role !== 'OWNER') return forbiddenResponse();

  const { id: idParam } = await params;
  const id = parseInt(idParam, 10);
  if (isNaN(id)) return NextResponse.json({ error: 'Invalid customer id' }, { status: 400 });

  const target = await prisma.customer.findUnique({
    where: { id },
    select: { id: true, _count: { select: { invoices: true, ledger: true } } },
  });
  if (!target) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });

  if (target._count.invoices > 0 || target._count.ledger > 0) {
    const updated = await prisma.customer.update({ where: { id }, data: { active: false } });
    return NextResponse.json({ deactivated: true, id: updated.id });
  }

  await prisma.customer.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
