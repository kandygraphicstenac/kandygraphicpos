import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { CustomerCreditBodySchema } from '@/lib/validators/customer';

/**
 * PATCH /api/customers/[id]/credit
 * Enables/disables credit and sets the credit limit. OWNER only — this is
 * deliberately a separate endpoint from the general profile PATCH so a
 * CASHIER's normal edit flow can never touch credit terms.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (user.role !== 'OWNER') return forbiddenResponse();

  const { id: idParam } = await params;
  const id = parseInt(idParam, 10);
  if (isNaN(id)) return NextResponse.json({ error: 'Invalid customer id' }, { status: 400 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = CustomerCreditBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
  }

  const { creditEnabled, creditLimit } = parsed.data;

  try {
    const customer = await prisma.customer.update({
      where: { id },
      data: {
        creditEnabled,
        ...(creditLimit !== undefined ? { creditLimit: creditLimit === null ? null : new Prisma.Decimal(creditLimit) } : {}),
      },
    });
    return NextResponse.json({
      ...customer,
      createdAt: customer.createdAt.toISOString(),
      creditLimit: customer.creditLimit?.toString() ?? null,
      balance: customer.balance.toString(),
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }
    throw err;
  }
}
