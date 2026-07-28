import { describe, it, expect, vi } from 'vitest';
import { adjustStock, StockAdjustError } from '../stockAdjustService';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function buildMockDb(opts: { partStock?: number | null; setStock?: number | null } = {}) {
  const mockTx = {
    part: {
      findUnique: vi.fn().mockResolvedValue(
        opts.partStock == null ? null : { finishedStock: opts.partStock },
      ),
      update: vi.fn().mockImplementation(({ where, data }: { where: { id: number }; data: { finishedStock: number } }) =>
        Promise.resolve({ id: where.id, finishedStock: data.finishedStock }),
      ),
    },
    stickerSet: {
      findUnique: vi.fn().mockResolvedValue(
        opts.setStock == null ? null : { packedStock: opts.setStock },
      ),
      update: vi.fn().mockImplementation(({ where, data }: { where: { id: number }; data: { packedStock: number } }) =>
        Promise.resolve({ id: where.id, packedStock: data.packedStock }),
      ),
    },
    stockTxn: {
      create: vi.fn().mockResolvedValue({}),
    },
  };

  const mockDb = {
    $transaction: vi.fn().mockImplementation(
      (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx),
    ),
  } as unknown as Parameters<typeof adjustStock>[1];

  return { mockDb, mockTx };
}

const BASE = { reason: 'RECOUNT' as const, userId: 1 };

// ─── Sets ─────────────────────────────────────────────────────────────────────

describe('adjustStock — sets', () => {
  it('increments the set\'s own packedStock and writes a matching ADJUST StockTxn', async () => {
    const { mockDb, mockTx } = buildMockDb({ setStock: 4 });

    const result = await adjustStock({ ...BASE, target: 'set', id: 7, delta: 6 }, mockDb);

    expect(mockTx.stickerSet.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { packedStock: 10 },
    });
    expect(mockTx.stockTxn.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'ADJUST', setId: 7, qty: 6, userId: 1 }),
    });
    expect(result).toEqual({ id: 7, stock: 10 });
  });

  it('decrements on a negative delta and logs the signed qty', async () => {
    const { mockDb, mockTx } = buildMockDb({ setStock: 10 });

    await adjustStock({ ...BASE, target: 'set', id: 7, delta: -3 }, mockDb);

    expect(mockTx.stickerSet.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { packedStock: 7 },
    });
    expect(mockTx.stockTxn.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ setId: 7, qty: -3 }),
    });
  });

  it('never touches part stock when adjusting a set', async () => {
    const { mockDb, mockTx } = buildMockDb({ setStock: 4 });

    await adjustStock({ ...BASE, target: 'set', id: 7, delta: 2 }, mockDb);

    expect(mockTx.part.update).not.toHaveBeenCalled();
  });

  it('rejects an adjustment that would push set stock below zero, before any write', async () => {
    const { mockDb, mockTx } = buildMockDb({ setStock: 2 });

    await expect(
      adjustStock({ ...BASE, target: 'set', id: 7, delta: -5 }, mockDb),
    ).rejects.toThrow(StockAdjustError);

    expect(mockTx.stickerSet.update).not.toHaveBeenCalled();
    expect(mockTx.stockTxn.create).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND for an unknown set', async () => {
    const { mockDb } = buildMockDb({ setStock: null });

    await expect(
      adjustStock({ ...BASE, target: 'set', id: 999, delta: 1 }, mockDb),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('uses DAMAGE txn type for a write-off', async () => {
    const { mockDb, mockTx } = buildMockDb({ setStock: 5 });

    await adjustStock({ target: 'set', id: 7, delta: -1, reason: 'DAMAGE', userId: 1 }, mockDb);

    expect(mockTx.stockTxn.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'DAMAGE', setId: 7 }),
    });
  });
});

// ─── Parts (unchanged behaviour — guards the shared extraction) ───────────────

describe('adjustStock — parts', () => {
  it('adjusts finishedStock and writes a part-scoped StockTxn', async () => {
    const { mockDb, mockTx } = buildMockDb({ partStock: 8 });

    const result = await adjustStock({ ...BASE, target: 'part', id: 3, delta: -2 }, mockDb);

    expect(mockTx.part.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { finishedStock: 6 },
    });
    expect(mockTx.stockTxn.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'ADJUST', partId: 3, qty: -2 }),
    });
    expect(mockTx.stickerSet.update).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 3, stock: 6 });
  });

  it('blocks a below-zero part adjustment', async () => {
    const { mockDb, mockTx } = buildMockDb({ partStock: 1 });

    await expect(
      adjustStock({ ...BASE, target: 'part', id: 3, delta: -4 }, mockDb),
    ).rejects.toMatchObject({ code: 'BELOW_ZERO' });

    expect(mockTx.part.update).not.toHaveBeenCalled();
    expect(mockTx.stockTxn.create).not.toHaveBeenCalled();
  });
});
