import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { AdjustBodySchema } from '@/lib/validators/catalog';
import { adjustStock, StockAdjustError } from '@/lib/services/stockAdjustService';

/**
 * POST /api/catalog/sets/[id]/adjust
 * Body: { delta: number, reason: 'INITIAL'|'RECOUNT'|'DAMAGE'|'OTHER', note?: string }
 *
 * Adjusts a set's own packedStock (never its component parts) and writes a
 * matching StockTxn in the same transaction. OWNER only.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (user.role !== 'OWNER') return forbiddenResponse();

  const { id } = await params;
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = AdjustBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 });
  }

  const { delta, reason, note, locationCode } = parsed.data;

  try {
    const result = await adjustStock({
      target: 'set',
      id: numId,
      delta,
      reason,
      note,
      locationCode,
      userId: user.id,
    });
    return NextResponse.json({ id: result.id, packedStock: result.stock });
  } catch (err: unknown) {
    if (err instanceof StockAdjustError) {
      if (err.code === 'NOT_FOUND') return NextResponse.json({ error: err.message }, { status: 404 });
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    throw err;
  }
}
