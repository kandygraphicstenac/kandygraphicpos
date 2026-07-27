import { Prisma, InvoiceStatus } from '@prisma/client';
import { describe, it, expect, vi } from 'vitest';
import { processReturn, ReturnError, ProcessReturnInput } from '../returnService';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

type MockItem = {
  id: number;
  invoiceId: string;
  partId: number | null;
  setId: number | null;
  set: { id: number; components: Array<{ setId: number; partId: number; qty: number }> } | null;
  qty: number;
  returnedQty: number;
  unitPrice: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
};

function buildMockInvoice(
  status: InvoiceStatus,
  items: MockItem[],
) {
  return { id: 'KG-2026-00001', status, items };
}

/** A grant that consumeAuthorizationGrant will accept as valid for a 'refund' action. */
function validRefundGrant(overrides: Partial<{ id: string; authorizedById: number; reason: string }> = {}) {
  return {
    id: overrides.id ?? 'tok-refund-1',
    action: 'refund',
    authorizedById: overrides.authorizedById ?? 7,
    reason: overrides.reason ?? 'Defective product',
    usedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
  };
}

function buildMockDb(invoice: ReturnType<typeof buildMockInvoice>) {
  const mockTx = {
    $executeRaw: vi.fn().mockResolvedValue(0),
    invoice: {
      findUnique: vi.fn().mockResolvedValue(invoice),
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: invoice.id, ...data }),
      ),
    },
    invoiceItem: {
      update: vi.fn().mockResolvedValue({}),
    },
    part: {
      update: vi.fn().mockResolvedValue({}),
    },
    stockTxn: {
      create: vi.fn().mockResolvedValue({}),
    },
    managerAuthorization: {
      // Default: a valid refund grant — most tests are about the return math,
      // not the auth gate. Auth-specific tests override this per-call.
      findUnique: vi.fn().mockResolvedValue(validRefundGrant()),
      update: vi.fn().mockResolvedValue({}),
    },
    return: {
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 501, ...data }),
      ),
    },
    returnItem: {
      create: vi.fn().mockResolvedValue({}),
    },
  };

  const mockDb = {
    $transaction: vi.fn().mockImplementation(
      (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx),
    ),
  };

  return { mockDb: mockDb as unknown as import('@prisma/client').PrismaClient, mockTx };
}

const D = (v: string | number) => new Prisma.Decimal(v);
const AUTH = { refundAuthToken: 'tok-refund-1' };

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('processReturn — partial return math', () => {
  it('returns correct qty, updates returnedQty, and sets status PARTIAL_REFUND', async () => {
    const items: MockItem[] = [
      {
        id: 1, invoiceId: 'KG-2026-00001', partId: 10, setId: null, set: null,
        qty: 3, returnedQty: 0, unitPrice: D('350.00'), lineTotal: D('1050.00'),
      },
      {
        id: 2, invoiceId: 'KG-2026-00001', partId: 11, setId: null, set: null,
        qty: 2, returnedQty: 0, unitPrice: D('400.00'), lineTotal: D('800.00'),
      },
    ];
    const { mockDb, mockTx } = buildMockDb(buildMockInvoice(InvoiceStatus.PAID, items));

    const result = await processReturn(
      { invoiceId: 'KG-2026-00001', lines: [{ itemId: 1, qty: 2 }], userId: 1, ...AUTH },
      mockDb,
    );

    // Stock restored for partId 10 by 2
    expect(mockTx.part.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { finishedStock: { increment: 2 } },
    });

    // InvoiceItem.returnedQty incremented
    expect(mockTx.invoiceItem.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { returnedQty: { increment: 2 } },
    });

    // Invoice 2 not fully returned → PARTIAL_REFUND
    expect(result.invoice.status).toBe(InvoiceStatus.PARTIAL_REFUND);
  });
});

describe('processReturn — double-return blocked', () => {
  it('throws ReturnError when requested qty exceeds available for return', async () => {
    const items: MockItem[] = [
      {
        id: 1, invoiceId: 'KG-2026-00001', partId: 10, setId: null, set: null,
        qty: 2, returnedQty: 1, // only 1 left to return
        unitPrice: D('350.00'), lineTotal: D('700.00'),
      },
    ];
    const { mockDb } = buildMockDb(buildMockInvoice(InvoiceStatus.PARTIAL_REFUND, items));

    await expect(
      processReturn(
        { invoiceId: 'KG-2026-00001', lines: [{ itemId: 1, qty: 2 }], userId: 1, ...AUTH },
        mockDb,
      ),
    ).rejects.toThrow(ReturnError);
  });

  it('throws ReturnError with a helpful message', async () => {
    const items: MockItem[] = [
      {
        id: 1, invoiceId: 'KG-2026-00001', partId: 10, setId: null, set: null,
        qty: 2, returnedQty: 2, // already fully returned
        unitPrice: D('350.00'), lineTotal: D('700.00'),
      },
    ];
    const { mockDb } = buildMockDb(buildMockInvoice(InvoiceStatus.PARTIAL_REFUND, items));

    await expect(
      processReturn(
        { invoiceId: 'KG-2026-00001', lines: [{ itemId: 1, qty: 1 }], userId: 1, ...AUTH },
        mockDb,
      ),
    ).rejects.toThrow(/only 0 available for return/i);
  });
});

describe('processReturn — set component restoration', () => {
  it('restores each set component part by componentQty × returnQty', async () => {
    const items: MockItem[] = [
      {
        id: 1, invoiceId: 'KG-2026-00001', partId: null, setId: 5, set: {
          id: 5,
          components: [
            { setId: 5, partId: 20, qty: 1 },
            { setId: 5, partId: 21, qty: 2 },
          ],
        },
        qty: 2, returnedQty: 0,
        unitPrice: D('800.00'), lineTotal: D('1600.00'),
      },
    ];
    const { mockDb, mockTx } = buildMockDb(buildMockInvoice(InvoiceStatus.PAID, items));

    await processReturn(
      { invoiceId: 'KG-2026-00001', lines: [{ itemId: 1, qty: 1 }], userId: 1, ...AUTH },
      mockDb,
    );

    // Returning 1 set: partId 20 restored by 1×1=1, partId 21 by 2×1=2
    expect(mockTx.part.update).toHaveBeenCalledWith({
      where: { id: 20 },
      data: { finishedStock: { increment: 1 } },
    });
    expect(mockTx.part.update).toHaveBeenCalledWith({
      where: { id: 21 },
      data: { finishedStock: { increment: 2 } },
    });
  });

  it('marks REFUNDED when all set items fully returned', async () => {
    const items: MockItem[] = [
      {
        id: 1, invoiceId: 'KG-2026-00001', partId: null, setId: 5, set: {
          id: 5, components: [{ setId: 5, partId: 20, qty: 1 }],
        },
        qty: 1, returnedQty: 0,
        unitPrice: D('800.00'), lineTotal: D('800.00'),
      },
    ];
    const { mockDb, mockTx } = buildMockDb(buildMockInvoice(InvoiceStatus.PAID, items));

    const result = await processReturn(
      { invoiceId: 'KG-2026-00001', lines: [{ itemId: 1, qty: 1 }], userId: 1, ...AUTH },
      mockDb,
    );

    expect(result.invoice.status).toBe(InvoiceStatus.REFUNDED);
    // Row-lock issued for part 20
    expect(mockTx.$executeRaw).toHaveBeenCalled();
  });
});

describe('processReturn — StockTxn audit rows', () => {
  it('writes one RETURN StockTxn per part with positive qty and invoice reference', async () => {
    const items: MockItem[] = [
      {
        id: 1, invoiceId: 'KG-2026-00001', partId: 10, setId: null, set: null,
        qty: 3, returnedQty: 0, unitPrice: D('350.00'), lineTotal: D('1050.00'),
      },
    ];
    const { mockDb, mockTx } = buildMockDb(buildMockInvoice(InvoiceStatus.PAID, items));

    await processReturn(
      { invoiceId: 'KG-2026-00001', lines: [{ itemId: 1, qty: 2 }], userId: 99, ...AUTH },
      mockDb,
    );

    expect(mockTx.stockTxn.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'RETURN',
          partId: 10,
          qty: 2,           // positive = back into stock
          reference: 'KG-2026-00001',
          userId: 99,
        }),
      }),
    );
  });
});

describe('processReturn — HELD invoice blocked', () => {
  it('throws ReturnError for a held sale', async () => {
    const items: MockItem[] = [
      {
        id: 1, invoiceId: 'KG-2026-00001', partId: 10, setId: null, set: null,
        qty: 1, returnedQty: 0, unitPrice: D('350.00'), lineTotal: D('350.00'),
      },
    ];
    const { mockDb } = buildMockDb(buildMockInvoice(InvoiceStatus.HELD, items));

    await expect(
      processReturn(
        { invoiceId: 'KG-2026-00001', lines: [{ itemId: 1, qty: 1 }], userId: 1, ...AUTH },
        mockDb,
      ),
    ).rejects.toThrow(/held/i);
  });

  it('throws ReturnError for an already fully-refunded invoice', async () => {
    const items: MockItem[] = [
      {
        id: 1, invoiceId: 'KG-2026-00001', partId: 10, setId: null, set: null,
        qty: 1, returnedQty: 1, unitPrice: D('350.00'), lineTotal: D('350.00'),
      },
    ];
    const { mockDb } = buildMockDb(buildMockInvoice(InvoiceStatus.REFUNDED, items));

    await expect(
      processReturn(
        { invoiceId: 'KG-2026-00001', lines: [{ itemId: 1, qty: 1 }], userId: 1, ...AUTH },
        mockDb,
      ),
    ).rejects.toThrow(/already fully refunded/i);
  });
});

describe('processReturn — manager authorization', () => {
  it('throws ReturnError when no refundAuthToken is provided', async () => {
    const items: MockItem[] = [
      {
        id: 1, invoiceId: 'KG-2026-00001', partId: 10, setId: null, set: null,
        qty: 1, returnedQty: 0, unitPrice: D('350.00'), lineTotal: D('350.00'),
      },
    ];
    const { mockDb } = buildMockDb(buildMockInvoice(InvoiceStatus.PAID, items));

    await expect(
      processReturn(
        { invoiceId: 'KG-2026-00001', lines: [{ itemId: 1, qty: 1 }], userId: 1 },
        mockDb,
      ),
    ).rejects.toThrow(/authoriz/i);
  });

  it('throws ReturnError when the grant is invalid, expired, or already used', async () => {
    const items: MockItem[] = [
      {
        id: 1, invoiceId: 'KG-2026-00001', partId: 10, setId: null, set: null,
        qty: 1, returnedQty: 0, unitPrice: D('350.00'), lineTotal: D('350.00'),
      },
    ];
    const { mockDb, mockTx } = buildMockDb(buildMockInvoice(InvoiceStatus.PAID, items));
    mockTx.managerAuthorization.findUnique.mockResolvedValue({
      ...validRefundGrant(),
      usedAt: new Date(), // already consumed
    });

    await expect(
      processReturn(
        { invoiceId: 'KG-2026-00001', lines: [{ itemId: 1, qty: 1 }], userId: 1, ...AUTH },
        mockDb,
      ),
    ).rejects.toThrow(/invalid or expired/i);
  });

  it('rejects a grant issued for the wrong action (e.g. a discount grant used for a refund)', async () => {
    const items: MockItem[] = [
      {
        id: 1, invoiceId: 'KG-2026-00001', partId: 10, setId: null, set: null,
        qty: 1, returnedQty: 0, unitPrice: D('350.00'), lineTotal: D('350.00'),
      },
    ];
    const { mockDb, mockTx } = buildMockDb(buildMockInvoice(InvoiceStatus.PAID, items));
    mockTx.managerAuthorization.findUnique.mockResolvedValue({
      ...validRefundGrant(),
      action: 'discount',
    });

    await expect(
      processReturn(
        { invoiceId: 'KG-2026-00001', lines: [{ itemId: 1, qty: 1 }], userId: 1, ...AUTH },
        mockDb,
      ),
    ).rejects.toThrow(ReturnError);
  });

  it('creates a Return record with refundReason/refundAuthorizedById from the grant and marks the grant used', async () => {
    const items: MockItem[] = [
      {
        id: 1, invoiceId: 'KG-2026-00001', partId: 10, setId: null, set: null,
        qty: 3, returnedQty: 0, unitPrice: D('350.00'), lineTotal: D('1050.00'),
      },
    ];
    const { mockDb, mockTx } = buildMockDb(buildMockInvoice(InvoiceStatus.PAID, items));
    mockTx.managerAuthorization.findUnique.mockResolvedValue(
      validRefundGrant({ authorizedById: 42, reason: 'Wrong item sold' }),
    );

    const result = await processReturn(
      { invoiceId: 'KG-2026-00001', lines: [{ itemId: 1, qty: 2 }], userId: 1, ...AUTH },
      mockDb,
    );

    expect(mockTx.return.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        invoiceId: 'KG-2026-00001',
        refundReason: 'Wrong item sold',
        refundAuthorizedById: 42,
        userId: 1,
      }),
    });

    // 2 units × 350.00 = 700.00
    const createCall = mockTx.return.create.mock.calls[0][0].data as { refundAmount: Prisma.Decimal };
    expect(createCall.refundAmount.toString()).toBe('700');

    expect(mockTx.returnItem.create).toHaveBeenCalledWith({
      data: { returnId: 501, invoiceItemId: 1, qty: 2 },
    });

    expect(mockTx.managerAuthorization.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tok-refund-1' },
        data: expect.objectContaining({ usedAt: expect.any(Date) }),
      }),
    );

    expect(result.return.refundReason).toBe('Wrong item sold');
  });
});
