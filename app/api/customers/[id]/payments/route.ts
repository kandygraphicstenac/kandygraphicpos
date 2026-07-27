import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { RecordPaymentBodySchema } from '@/lib/validators/customer';
import { recordPayment, CreditError } from '@/lib/services/creditService';

/**
 * POST /api/customers/[id]/payments
 * Records a payment against a customer's credit balance. OWNER may record
 * directly; CASHIER must supply a manager authorization grant (authToken)
 * obtained via POST /api/auth/authorize with action "credit_payment" — the
 * service re-verifies that grant server-side. CUTTER is blocked.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (user.role === 'CUTTER') return forbiddenResponse();

  const { id: idParam } = await params;
  const customerId = parseInt(idParam, 10);
  if (isNaN(customerId)) return NextResponse.json({ error: 'Invalid customer id' }, { status: 400 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = RecordPaymentBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const result = await recordPayment({
      customerId,
      amount: new Prisma.Decimal(parsed.data.amount),
      method: parsed.data.method,
      note: parsed.data.note,
      userId: user.id,
      requiresAuth: user.role !== 'OWNER',
      authToken: parsed.data.authToken,
    });
    return NextResponse.json({
      balance: result.customer.balance.toString(),
      ledgerEntry: {
        id: result.ledgerEntry.id,
        type: result.ledgerEntry.type,
        amount: result.ledgerEntry.amount.toString(),
        note: result.ledgerEntry.note,
        createdAt: result.ledgerEntry.createdAt.toISOString(),
      },
    }, { status: 201 });
  } catch (err) {
    if (err instanceof CreditError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
