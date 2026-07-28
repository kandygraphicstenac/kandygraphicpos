import { PrismaClient, TxnType } from '@prisma/client';
import { prisma as defaultPrisma, TXN_OPTIONS } from '../db';

/**
 * Manual stock adjustment for either stock pool.
 *
 * Parts and sets are independent pools (see CLAUDE.md): 'part' moves
 * `Part.finishedStock`, 'set' moves the kit's own `StickerSet.packedStock`.
 * Both obey the same rules — the stock field and its matching StockTxn row are
 * written in one `$transaction`, and stock may never go below zero.
 */
export type AdjustTarget = 'part' | 'set';

export type AdjustReason = 'INITIAL' | 'RECOUNT' | 'DAMAGE' | 'OTHER';

export class StockAdjustError extends Error {
  constructor(
    message: string,
    readonly code: 'NOT_FOUND' | 'BELOW_ZERO',
    readonly newStock?: number,
  ) {
    super(message);
    this.name = 'StockAdjustError';
  }
}

export interface AdjustStockInput {
  target: AdjustTarget;
  id: number;
  /** Signed: + into stock, − out of stock. */
  delta: number;
  reason: AdjustReason;
  note?: string;
  /** Optional shelf move applied in the same transaction. */
  locationCode?: string | null;
  userId: number;
}

export async function adjustStock(
  input: AdjustStockInput,
  db: PrismaClient = defaultPrisma,
): Promise<{ id: number; stock: number }> {
  const { target, id, delta, reason, note, locationCode, userId } = input;
  const txnType: TxnType = reason === 'DAMAGE' ? TxnType.DAMAGE : TxnType.ADJUST;
  const label = target === 'part' ? 'Part' : 'Set';

  return db.$transaction(async (tx) => {
    // Read current stock, compute the new value, and reject before any write.
    const current =
      target === 'part'
        ? (await tx.part.findUnique({ where: { id }, select: { finishedStock: true } }))?.finishedStock
        : (await tx.stickerSet.findUnique({ where: { id }, select: { packedStock: true } }))?.packedStock;

    if (current === undefined) {
      throw new StockAdjustError(`${label} not found`, 'NOT_FOUND');
    }

    const newStock = current + delta;
    if (newStock < 0) {
      throw new StockAdjustError(
        `Stock cannot go below 0. Current stock would be ${newStock}.`,
        'BELOW_ZERO',
        newStock,
      );
    }

    const locationPatch = locationCode !== undefined ? { locationCode } : {};

    if (target === 'part') {
      const updated = await tx.part.update({
        where: { id },
        data: { finishedStock: newStock, ...locationPatch },
      });
      await tx.stockTxn.create({
        data: { type: txnType, partId: id, qty: delta, reference: note ?? reason, userId },
      });
      return { id: updated.id, stock: updated.finishedStock };
    }

    const updated = await tx.stickerSet.update({
      where: { id },
      data: { packedStock: newStock, ...locationPatch },
    });
    await tx.stockTxn.create({
      data: { type: txnType, setId: id, qty: delta, reference: note ?? reason, userId },
    });
    return { id: updated.id, stock: updated.packedStock };
  }, TXN_OPTIONS);
}
