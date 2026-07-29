import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { canViewInvoices } from '@/lib/permissions';
import { ReturnBodySchema } from '@/lib/validators/invoice';
import { processReturn, ReturnError } from '@/lib/services/returnService';

/**
 * POST /api/invoices/[id]/return
 * Body: { lines: [{ itemId: number, qty: number }] }
 * Allowed roles: OWNER, CASHIER.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (!canViewInvoices(user.role)) return forbiddenResponse();

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = ReturnBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 422 },
    );
  }

  try {
    const result = await processReturn(
      {
        invoiceId: id,
        lines: parsed.data.lines,
        userId: user.id,
        refundAuthToken: parsed.data.refundAuthToken,
      },
      prisma,
    );
    return NextResponse.json({
      id: result.invoice.id,
      status: result.invoice.status,
      returnId: result.return.id,
    });
  } catch (err) {
    if (err instanceof ReturnError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    throw err;
  }
}
