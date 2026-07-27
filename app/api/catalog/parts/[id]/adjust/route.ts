import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { AdjustBodySchema } from '@/lib/validators/catalog';
import { TxnType } from '@prisma/client';

/**
 * POST /api/catalog/parts/[id]/adjust
 * Body: { delta: number, reason: 'INITIAL'|'RECOUNT'|'DAMAGE'|'OTHER', note?: string }
 * Atomically updates finishedStock and writes a StockTxn. OWNER only.
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
  const txnType: TxnType = reason === 'DAMAGE' ? TxnType.DAMAGE : TxnType.ADJUST;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const part = await tx.part.findUnique({ where: { id: numId }, select: { id: true, finishedStock: true } });
      if (!part) throw { code: 'NOT_FOUND' };

      const newStock = part.finishedStock + delta;
      if (newStock < 0) throw { code: 'BELOW_ZERO', newStock };

      const [updated] = await Promise.all([
        tx.part.update({
          where: { id: numId },
          data: {
            finishedStock: newStock,
            ...(locationCode !== undefined ? { locationCode } : {}),
          },
        }),
        tx.stockTxn.create({
          data: {
            type: txnType,
            partId: numId,
            qty: delta,
            reference: note ?? reason,
            userId: user.id,
          },
        }),
      ]);

      return updated;
    });

    return NextResponse.json({ id: result.id, finishedStock: result.finishedStock });
  } catch (err: unknown) {
    const e = err as { code?: string; newStock?: number };
    if (e.code === 'NOT_FOUND') return NextResponse.json({ error: 'Part not found' }, { status: 404 });
    if (e.code === 'BELOW_ZERO') {
      return NextResponse.json(
        { error: `Stock cannot go below 0. Current stock would be ${e.newStock}.` },
        { status: 422 },
      );
    }
    throw err;
  }
}
