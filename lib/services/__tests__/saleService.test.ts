import { Prisma, PaymentMethod, InvoiceStatus } from '@prisma/client';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { completeSale, SaleError, CompleteSaleInput } from '../saleService';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

// `price` mirrors the real Prisma row: the key is always present, and is null
// only for a genuinely no-price (non-sellable) part. Omit it to get a priced
// part; pass `price: null` to exercise the no-price rejection path.
type MockPart = {
  id: number;
  finishedStock: number;
  name: string;
  sku: string;
  price?: Prisma.Decimal | null;
  cost?: Prisma.Decimal | null;
};
type MockSet = {
  id: number;
  sku: string;
  packedStock: number;
  active: boolean;
  components: Array<{ setId: number; partId: number; qty: number }>;
};

/** A grant that consumeAuthorizationGrant will accept as valid for a 'discount' action. */
function validDiscountGrant(overrides: Partial<{ id: string; authorizedById: number; reason: string }> = {}) {
  return {
    id: overrides.id ?? 'tok-discount-1',
    action: 'discount',
    authorizedById: overrides.authorizedById ?? 7,
    reason: overrides.reason ?? 'Loyal customer',
    usedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
  };
}

function buildMockDb(parts: MockPart[], sets: MockSet[] = []) {
  // Real Prisma rows always carry `price`; default it so fixtures that don't
  // care about pricing aren't rejected by the no-price guard in completeSale.
  const dbParts = parts.map((p) => ({
    ...p,
    price: p.price !== undefined ? p.price : new Prisma.Decimal('100.00'),
    cost: p.cost !== undefined ? p.cost : new Prisma.Decimal('60.00'),
  }));

  const mockTx = {
    $executeRaw: vi.fn().mockResolvedValue(0),
    $queryRaw: vi.fn().mockResolvedValue([]), // no prior invoices → KG-YYYY-00001
    company: {
      findUnique: vi.fn().mockResolvedValue({
        id: 1, code: 'KG', name: 'Kandy Graphics', invoicePrefix: 'KG',
        address: null, phone: null, regNo: null, active: true,
      }),
    },
    part: {
      findMany: vi.fn().mockResolvedValue(dbParts),
      update: vi.fn().mockResolvedValue({}),
    },
    customer: {
      // Default: any customerId looked up is found. Tests for the "not found"
      // path override this with mockResolvedValue(null). Credit tests override
      // with a full record (creditEnabled/creditLimit/balance).
      findUnique: vi.fn().mockResolvedValue({ id: 99 }),
      update: vi.fn().mockResolvedValue({}),
    },
    customerLedger: {
      create: vi.fn().mockResolvedValue({}),
    },
    stickerSet: {
      findMany: vi.fn().mockResolvedValue(sets),
    },
    invoice: {
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...data }),
      ),
    },
    invoiceItem: {
      create: vi.fn().mockResolvedValue({}),
    },
    stockTxn: {
      create: vi.fn().mockResolvedValue({}),
    },
    appSetting: {
      // No row → getDiscountApprovalThresholdPct() falls back to its default (0)
      findUnique: vi.fn().mockResolvedValue(null),
    },
    managerAuthorization: {
      findUnique: vi.fn().mockResolvedValue(null), // no grant by default — tests opt in
      update: vi.fn().mockResolvedValue({}),
    },
  };

  const mockDb = {
    $transaction: vi.fn().mockImplementation((cb: (tx: typeof mockTx) => Promise<unknown>) =>
      cb(mockTx),
    ),
  };

  return { mockDb: mockDb as unknown as import('@prisma/client').PrismaClient, mockTx };
}

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const D = (v: string | number) => new Prisma.Decimal(v);

const BASE_INPUT: Omit<CompleteSaleInput, 'lines'> = {
  payment: PaymentMethod.CASH,
  orderType: 'COUNTER',
  userId: 1,
  companyId: 1,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('completeSale — part sales', () => {
  it('creates invoice, deducts part stock, and writes StockTxn on success', async () => {
    const { mockDb, mockTx } = buildMockDb([
      { id: 10, finishedStock: 5, name: 'Tank decal left', sku: 'CB125-TDL' },
    ]);

    const invoice = await completeSale(
      { ...BASE_INPUT, lines: [{ type: 'part', partId: 10, qty: 2, unitPrice: D('350.00') }] },
      mockDb,
    );

    // Invoice ID generated from this year, prefixed by company code
    expect(invoice.id).toMatch(/^KG-\d{4}-\d{5}$/);

    // Stock decremented by 2
    expect(mockTx.part.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { finishedStock: { decrement: 2 } },
    });

    // StockTxn row: type SALE, qty -2, reference = invoice id
    expect(mockTx.stockTxn.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'SALE',
          partId: 10,
          qty: -2,
          reference: invoice.id,
          userId: 1,
        }),
      }),
    );
  });

  it('throws SaleError when part has insufficient finishedStock', async () => {
    const { mockDb } = buildMockDb([
      { id: 10, finishedStock: 2, name: 'Tank decal left', sku: 'CB125-TDL' },
    ]);

    await expect(
      completeSale(
        { ...BASE_INPUT, lines: [{ type: 'part', partId: 10, qty: 3, unitPrice: D('350.00') }] },
        mockDb,
      ),
    ).rejects.toThrow(SaleError);
  });

  it('throws SaleError with a helpful message on oversell', async () => {
    const { mockDb } = buildMockDb([
      { id: 10, finishedStock: 1, name: 'Tank decal left', sku: 'CB125-TDL' },
    ]);

    await expect(
      completeSale(
        { ...BASE_INPUT, lines: [{ type: 'part', partId: 10, qty: 2, unitPrice: D('350.00') }] },
        mockDb,
      ),
    ).rejects.toThrow(/not enough stock/i);
  });

  it('computes subtotal and total correctly without discounts', async () => {
    const { mockDb, mockTx } = buildMockDb([
      { id: 10, finishedStock: 10, name: 'Tank decal left', sku: 'CB125-TDL' },
      { id: 11, finishedStock: 10, name: 'Tank decal right', sku: 'CB125-TDR' },
    ]);

    await completeSale(
      {
        ...BASE_INPUT,
        lines: [
          { type: 'part', partId: 10, qty: 2, unitPrice: D('350.00') },
          { type: 'part', partId: 11, qty: 1, unitPrice: D('350.00') },
        ],
      },
      mockDb,
    );

    const invoiceCreateCall = mockTx.invoice.create.mock.calls[0][0].data;
    expect(Number(invoiceCreateCall.subtotal)).toBe(1050);
    expect(Number(invoiceCreateCall.total)).toBe(1050);
    expect(invoiceCreateCall.status).toBe(InvoiceStatus.PAID);
  });

  it('applies percentage and flat discounts to total when authorized', async () => {
    const { mockDb, mockTx } = buildMockDb([
      { id: 10, finishedStock: 10, name: 'Part A', sku: 'A' },
    ]);
    mockTx.managerAuthorization.findUnique.mockResolvedValue(validDiscountGrant());

    await completeSale(
      {
        ...BASE_INPUT,
        lines: [{ type: 'part', partId: 10, qty: 1, unitPrice: D('1000.00') }],
        discountPct: D('10'),   // 10% → 100
        discountAmt: D('50'),   // flat → 50
        discountAuthToken: 'tok-discount-1',
      },
      mockDb,
    );

    const { total } = mockTx.invoice.create.mock.calls[0][0].data;
    // 1000 - 100 (10%) - 50 (flat) = 850
    expect(Number(total)).toBe(850);
  });

  it('throws SaleError when a line references a part with no price', async () => {
    const { mockDb, mockTx } = buildMockDb([
      { id: 10, finishedStock: 10, name: 'Part A', sku: 'A', price: null },
    ]);

    await expect(
      completeSale(
        {
          ...BASE_INPUT,
          lines: [{ type: 'part', partId: 10, qty: 1, unitPrice: D('1000.00') }],
        },
        mockDb,
      ),
    ).rejects.toThrow(SaleError);

    // Rejected before any stock or invoice write.
    expect(mockTx.part.update).not.toHaveBeenCalled();
    expect(mockTx.invoice.create).not.toHaveBeenCalled();
    expect(mockTx.stockTxn.create).not.toHaveBeenCalled();
  });

  it('still sells a priced part when another no-price part exists in the catalog', async () => {
    const { mockDb, mockTx } = buildMockDb([
      { id: 10, finishedStock: 10, name: 'Part A', sku: 'A' },
      { id: 11, finishedStock: 10, name: 'Part B', sku: 'B', price: null },
    ]);

    await completeSale(
      {
        ...BASE_INPUT,
        lines: [{ type: 'part', partId: 10, qty: 1, unitPrice: D('1000.00') }],
      },
      mockDb,
    );

    expect(Number(mockTx.invoice.create.mock.calls[0][0].data.total)).toBe(1000);
  });
});

describe('completeSale — discount authorization', () => {
  it('throws SaleError when a discount is given without a discountAuthToken', async () => {
    const { mockDb } = buildMockDb([
      { id: 10, finishedStock: 10, name: 'Part A', sku: 'A' },
    ]);

    await expect(
      completeSale(
        {
          ...BASE_INPUT,
          lines: [{ type: 'part', partId: 10, qty: 1, unitPrice: D('1000.00') }],
          discountPct: D('10'),
          // no discountAuthToken
        },
        mockDb,
      ),
    ).rejects.toThrow(/authoriz/i);
  });

  it('throws SaleError when the authorization grant is invalid, expired, or already used', async () => {
    const { mockDb, mockTx } = buildMockDb([
      { id: 10, finishedStock: 10, name: 'Part A', sku: 'A' },
    ]);
    // Grant exists but was already consumed
    mockTx.managerAuthorization.findUnique.mockResolvedValue({
      ...validDiscountGrant(),
      usedAt: new Date(),
    });

    await expect(
      completeSale(
        {
          ...BASE_INPUT,
          lines: [{ type: 'part', partId: 10, qty: 1, unitPrice: D('1000.00') }],
          discountPct: D('10'),
          discountAuthToken: 'tok-discount-1',
        },
        mockDb,
      ),
    ).rejects.toThrow(/invalid or expired/i);
  });

  it('rejects a grant issued for the wrong action (e.g. a refund grant used for a discount)', async () => {
    const { mockDb, mockTx } = buildMockDb([
      { id: 10, finishedStock: 10, name: 'Part A', sku: 'A' },
    ]);
    mockTx.managerAuthorization.findUnique.mockResolvedValue({
      ...validDiscountGrant(),
      action: 'refund',
    });

    await expect(
      completeSale(
        {
          ...BASE_INPUT,
          lines: [{ type: 'part', partId: 10, qty: 1, unitPrice: D('1000.00') }],
          discountPct: D('10'),
          discountAuthToken: 'tok-discount-1',
        },
        mockDb,
      ),
    ).rejects.toThrow(SaleError);
  });

  it('persists discountReason and discountAuthorizedById from the consumed grant, and marks it used', async () => {
    const { mockDb, mockTx } = buildMockDb([
      { id: 10, finishedStock: 10, name: 'Part A', sku: 'A' },
    ]);
    mockTx.managerAuthorization.findUnique.mockResolvedValue(
      validDiscountGrant({ authorizedById: 42, reason: 'Bulk order' }),
    );

    await completeSale(
      {
        ...BASE_INPUT,
        lines: [{ type: 'part', partId: 10, qty: 1, unitPrice: D('1000.00') }],
        discountPct: D('15'),
        discountAuthToken: 'tok-discount-1',
      },
      mockDb,
    );

    const invoiceData = mockTx.invoice.create.mock.calls[0][0].data;
    expect(invoiceData.discountReason).toBe('Bulk order');
    expect(invoiceData.discountAuthorizedById).toBe(42);

    expect(mockTx.managerAuthorization.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tok-discount-1' },
        data: expect.objectContaining({ usedAt: expect.any(Date) }),
      }),
    );
  });

  it('does not require authorization when discountPct is within the configured threshold', async () => {
    const { mockDb, mockTx } = buildMockDb([
      { id: 10, finishedStock: 10, name: 'Part A', sku: 'A' },
    ]);
    // Owner raised the threshold to 20% — a 10% discount needs no grant
    mockTx.appSetting.findUnique.mockResolvedValue({ key: 'discountApprovalThresholdPct', value: '20' });

    const invoice = await completeSale(
      {
        ...BASE_INPUT,
        lines: [{ type: 'part', partId: 10, qty: 1, unitPrice: D('1000.00') }],
        discountPct: D('10'),
        // no discountAuthToken — should succeed because 10 <= threshold 20
      },
      mockDb,
    );

    expect(invoice.id).toMatch(/^KG-\d{4}-\d{5}$/);
    expect(mockTx.invoice.create.mock.calls[0][0].data.discountReason).toBeNull();
  });
});

describe('completeSale — virtual set sales', () => {
  const mockSet: MockSet = {
    id: 1,
    sku: 'CB125-FULL',
    packedStock: 0,
    active: true,
    components: [
      { setId: 1, partId: 10, qty: 1 },
      { setId: 1, partId: 11, qty: 2 },
    ],
  };

  it('deducts each component part by qty × line qty', async () => {
    const { mockDb, mockTx } = buildMockDb(
      [
        { id: 10, finishedStock: 5, name: 'Tank L', sku: 'CB125-TL' },
        { id: 11, finishedStock: 5, name: 'Tank R', sku: 'CB125-TR' },
      ],
      [mockSet],
    );

    // Sell 2 sets — expects partId 10 deducted by 1×2=2 and partId 11 by 2×2=4
    await completeSale(
      { ...BASE_INPUT, lines: [{ type: 'set', setId: 1, qty: 2, unitPrice: D('800.00') }] },
      mockDb,
    );

    expect(mockTx.part.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { finishedStock: { decrement: 2 } },
    });
    expect(mockTx.part.update).toHaveBeenCalledWith({
      where: { id: 11 },
      data: { finishedStock: { decrement: 4 } },
    });
  });

  it('writes one StockTxn row per component part', async () => {
    const { mockDb, mockTx } = buildMockDb(
      [
        { id: 10, finishedStock: 5, name: 'Tank L', sku: 'CB125-TL' },
        { id: 11, finishedStock: 5, name: 'Tank R', sku: 'CB125-TR' },
      ],
      [mockSet],
    );

    await completeSale(
      { ...BASE_INPUT, lines: [{ type: 'set', setId: 1, qty: 1, unitPrice: D('800.00') }] },
      mockDb,
    );

    // One txn per component part
    expect(mockTx.stockTxn.create).toHaveBeenCalledTimes(2);
    expect(mockTx.stockTxn.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'SALE', partId: 10, qty: -1 }) }),
    );
    expect(mockTx.stockTxn.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'SALE', partId: 11, qty: -2 }) }),
    );
  });

  it('throws SaleError when a component part has insufficient stock', async () => {
    const { mockDb } = buildMockDb(
      [
        { id: 10, finishedStock: 5, name: 'Tank L', sku: 'CB125-TL' },
        { id: 11, finishedStock: 1, name: 'Tank R', sku: 'CB125-TR' }, // only 1 available
      ],
      [mockSet],
    );

    // Selling 1 set needs partId 11 qty 2 → should fail
    await expect(
      completeSale(
        { ...BASE_INPUT, lines: [{ type: 'set', setId: 1, qty: 1, unitPrice: D('800.00') }] },
        mockDb,
      ),
    ).rejects.toThrow(SaleError);
  });

  it('aggregates demand correctly when a part appears in both a part line and a set component', async () => {
    // partId 10 needed: 3 (direct) + 1 (via set) = 4, but only 4 available → exact boundary
    const { mockDb, mockTx } = buildMockDb(
      [
        { id: 10, finishedStock: 4, name: 'Tank L', sku: 'CB125-TL' },
        { id: 11, finishedStock: 5, name: 'Tank R', sku: 'CB125-TR' },
      ],
      [mockSet],
    );

    await completeSale(
      {
        ...BASE_INPUT,
        lines: [
          { type: 'part', partId: 10, qty: 3, unitPrice: D('350.00') },
          { type: 'set', setId: 1, qty: 1, unitPrice: D('800.00') },
        ],
      },
      mockDb,
    );

    expect(mockTx.part.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { finishedStock: { decrement: 4 } }, // 3 + 1
    });
  });

  it('throws SaleError when aggregated demand across part line + set exceeds stock', async () => {
    // partId 10: stock 4, direct 3 + set 1×2 = 5 needed → oversell
    const setWith2 = { ...mockSet, components: [{ setId: 1, partId: 10, qty: 2 }, { setId: 1, partId: 11, qty: 1 }] };
    const { mockDb } = buildMockDb(
      [
        { id: 10, finishedStock: 4, name: 'Tank L', sku: 'CB125-TL' },
        { id: 11, finishedStock: 5, name: 'Tank R', sku: 'CB125-TR' },
      ],
      [setWith2],
    );

    await expect(
      completeSale(
        {
          ...BASE_INPUT,
          lines: [
            { type: 'part', partId: 10, qty: 3, unitPrice: D('350.00') },
            { type: 'set', setId: 1, qty: 1, unitPrice: D('800.00') },
          ],
        },
        mockDb,
      ),
    ).rejects.toThrow(SaleError);
  });
});

describe('completeSale — customer + delivery', () => {
  it('attaches customerId, stores deliveryFee and deliveryAddress, and keeps total product-only', async () => {
    const { mockDb, mockTx } = buildMockDb([
      { id: 10, finishedStock: 10, name: 'Part A', sku: 'A' },
    ]);

    const invoice = await completeSale(
      {
        ...BASE_INPUT,
        lines: [{ type: 'part', partId: 10, qty: 1, unitPrice: D('1000.00') }],
        customerId: 99,
        deliveryFee: D('250.00'),
        deliveryAddress: { name: 'Nimal Perera', phone: '0771234567', line1: '12 Galle Rd', city: 'Colombo' },
      },
      mockDb,
    );

    expect(mockTx.customer.findUnique).toHaveBeenCalledWith({ where: { id: 99 }, select: { id: true } });

    const invoiceData = mockTx.invoice.create.mock.calls[0][0].data;
    expect(invoiceData.customerId).toBe(99);
    expect(Number(invoiceData.deliveryFee)).toBe(250);
    expect(invoiceData.deliveryAddress).toEqual({
      name: 'Nimal Perera', phone: '0771234567', line1: '12 Galle Rd', city: 'Colombo',
    });

    // total (product sales) must exclude the delivery fee entirely
    expect(Number(invoiceData.total)).toBe(1000);
    expect(Number(invoice.total)).toBe(1000);
  });

  it('defaults deliveryFee to 0 and deliveryAddress to JsonNull when no delivery is given', async () => {
    const { mockDb, mockTx } = buildMockDb([
      { id: 10, finishedStock: 10, name: 'Part A', sku: 'A' },
    ]);

    await completeSale(
      { ...BASE_INPUT, lines: [{ type: 'part', partId: 10, qty: 1, unitPrice: D('500.00') }] },
      mockDb,
    );

    const invoiceData = mockTx.invoice.create.mock.calls[0][0].data;
    expect(Number(invoiceData.deliveryFee)).toBe(0);
    expect(invoiceData.customerId).toBeNull();
  });

  it('throws SaleError when customerId does not reference an existing customer', async () => {
    const { mockDb, mockTx } = buildMockDb([
      { id: 10, finishedStock: 10, name: 'Part A', sku: 'A' },
    ]);
    mockTx.customer.findUnique.mockResolvedValue(null);

    await expect(
      completeSale(
        {
          ...BASE_INPUT,
          lines: [{ type: 'part', partId: 10, qty: 1, unitPrice: D('500.00') }],
          customerId: 12345,
        },
        mockDb,
      ),
    ).rejects.toThrow(/customer not found/i);
  });
});

describe('completeSale — order type', () => {
  it('COUNTER sale: orderType stored as COUNTER, deliveryStatus stays null', async () => {
    const { mockDb, mockTx } = buildMockDb([
      { id: 10, finishedStock: 10, name: 'Part A', sku: 'A' },
    ]);

    await completeSale(
      { ...BASE_INPUT, orderType: 'COUNTER', lines: [{ type: 'part', partId: 10, qty: 1, unitPrice: D('500.00') }] },
      mockDb,
    );

    const invoiceData = mockTx.invoice.create.mock.calls[0][0].data;
    expect(invoiceData.orderType).toBe('COUNTER');
    expect(invoiceData.deliveryStatus).toBeNull();
  });

  it('DELIVERY order with customer + address + fee: completes, orderType DELIVERY, deliveryStatus TO_PACK', async () => {
    const { mockDb, mockTx } = buildMockDb([
      { id: 10, finishedStock: 10, name: 'Part A', sku: 'A' },
    ]);

    await completeSale(
      {
        ...BASE_INPUT,
        orderType: 'DELIVERY',
        lines: [{ type: 'part', partId: 10, qty: 1, unitPrice: D('500.00') }],
        customerId: 99,
        deliveryFee: D('300.00'),
        deliveryAddress: { name: 'Nimal Perera', line1: '12 Galle Rd' },
      },
      mockDb,
    );

    const invoiceData = mockTx.invoice.create.mock.calls[0][0].data;
    expect(invoiceData.orderType).toBe('DELIVERY');
    expect(invoiceData.deliveryStatus).toBe('TO_PACK');
  });

  it('DELIVERY order without a customer: throws SaleError (never trust the client-side gate alone)', async () => {
    const { mockDb } = buildMockDb([{ id: 10, finishedStock: 10, name: 'Part A', sku: 'A' }]);

    await expect(
      completeSale(
        {
          ...BASE_INPUT,
          orderType: 'DELIVERY',
          lines: [{ type: 'part', partId: 10, qty: 1, unitPrice: D('500.00') }],
          deliveryFee: D('300.00'),
          deliveryAddress: { name: 'Nimal Perera', line1: '12 Galle Rd' },
        },
        mockDb,
      ),
    ).rejects.toThrow(/require a customer/i);
  });

  it('DELIVERY order without a delivery address: throws SaleError', async () => {
    const { mockDb } = buildMockDb([{ id: 10, finishedStock: 10, name: 'Part A', sku: 'A' }]);

    await expect(
      completeSale(
        {
          ...BASE_INPUT,
          orderType: 'DELIVERY',
          lines: [{ type: 'part', partId: 10, qty: 1, unitPrice: D('500.00') }],
          customerId: 99,
          deliveryFee: D('300.00'),
        },
        mockDb,
      ),
    ).rejects.toThrow(/require a delivery address/i);
  });

  it('DELIVERY order with a zero delivery fee: throws SaleError (fee can never be forgotten)', async () => {
    const { mockDb } = buildMockDb([{ id: 10, finishedStock: 10, name: 'Part A', sku: 'A' }]);

    await expect(
      completeSale(
        {
          ...BASE_INPUT,
          orderType: 'DELIVERY',
          lines: [{ type: 'part', partId: 10, qty: 1, unitPrice: D('500.00') }],
          customerId: 99,
          deliveryFee: D('0'),
          deliveryAddress: { name: 'Nimal Perera', line1: '12 Galle Rd' },
        },
        mockDb,
      ),
    ).rejects.toThrow(/delivery fee greater than zero/i);
  });
});

describe('completeSale — edge cases', () => {
  it('throws SaleError on empty cart', async () => {
    const { mockDb } = buildMockDb([]);
    await expect(completeSale({ ...BASE_INPUT, lines: [] }, mockDb)).rejects.toThrow(SaleError);
  });

  it('throws SaleError when set does not exist', async () => {
    const { mockDb } = buildMockDb([], []); // no sets in DB

    await expect(
      completeSale(
        { ...BASE_INPUT, lines: [{ type: 'set', setId: 99, qty: 1, unitPrice: D('800.00') }] },
        mockDb,
      ),
    ).rejects.toThrow(SaleError);
  });

  it('generates sequential invoice IDs from prior invoices in the same year', async () => {
    const { mockDb, mockTx } = buildMockDb([
      { id: 10, finishedStock: 5, name: 'Part A', sku: 'A' },
    ]);

    // Simulate an existing invoice KG-2026-00042
    mockTx.$queryRaw.mockResolvedValue([{ id: 'KG-2026-00042' }]);

    const invoice = await completeSale(
      { ...BASE_INPUT, lines: [{ type: 'part', partId: 10, qty: 1, unitPrice: D('100.00') }] },
      mockDb,
    );

    expect(invoice.id).toBe('KG-2026-00043');
  });
});

describe('completeSale — credit payment', () => {
  function mockCreditCustomer(overrides: Partial<{
    id: number; creditEnabled: boolean; creditLimit: Prisma.Decimal | null; balance: Prisma.Decimal;
  }> = {}) {
    return {
      id: overrides.id ?? 99,
      creditEnabled: overrides.creditEnabled ?? true,
      creditLimit: overrides.creditLimit !== undefined ? overrides.creditLimit : D('10000.00'),
      balance: overrides.balance ?? D('0.00'),
    };
  }

  it('increases customer balance, writes a CREDIT_SALE ledger row, and deducts stock atomically', async () => {
    const { mockDb, mockTx } = buildMockDb([
      { id: 10, finishedStock: 5, name: 'Part A', sku: 'A' },
    ]);
    mockTx.customer.findUnique.mockResolvedValue(
      mockCreditCustomer({ balance: D('500.00'), creditLimit: D('5000.00') }),
    );

    const invoice = await completeSale(
      {
        ...BASE_INPUT,
        payment: PaymentMethod.CREDIT,
        lines: [{ type: 'part', partId: 10, qty: 2, unitPrice: D('350.00') }],
        customerId: 99,
      },
      mockDb,
    );

    expect(invoice.payment).toBe(PaymentMethod.CREDIT);

    // Stock deducted in the same transaction
    expect(mockTx.part.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { finishedStock: { decrement: 2 } },
    });
    expect(mockTx.stockTxn.create).toHaveBeenCalled();

    // Balance incremented by the full sale total (no delivery fee here)
    const updateCall = mockTx.customer.update.mock.calls[0][0];
    expect(updateCall.where).toEqual({ id: 99 });
    expect((updateCall.data.balance.increment as Prisma.Decimal).toString()).toBe('700');

    // Ledger row written for the same amount, referencing this invoice
    const ledgerCall = mockTx.customerLedger.create.mock.calls[0][0];
    expect(ledgerCall.data.customerId).toBe(99);
    expect(ledgerCall.data.type).toBe('CREDIT_SALE');
    expect((ledgerCall.data.amount as Prisma.Decimal).toString()).toBe('700');
    expect(ledgerCall.data.invoiceId).toBe(invoice.id);
  });

  it('charges the full total + deliveryFee to the balance on a credit delivery order', async () => {
    const { mockDb, mockTx } = buildMockDb([
      { id: 10, finishedStock: 5, name: 'Part A', sku: 'A' },
    ]);
    mockTx.customer.findUnique.mockResolvedValue(mockCreditCustomer({ balance: D('0.00') }));

    await completeSale(
      {
        ...BASE_INPUT,
        payment: PaymentMethod.CREDIT,
        orderType: 'DELIVERY',
        lines: [{ type: 'part', partId: 10, qty: 1, unitPrice: D('500.00') }],
        customerId: 99,
        deliveryFee: D('300.00'),
        deliveryAddress: { name: 'Nimal Perera', line1: '12 Galle Rd' },
      },
      mockDb,
    );

    const ledgerCall = mockTx.customerLedger.create.mock.calls[0][0];
    expect((ledgerCall.data.amount as Prisma.Decimal).toString()).toBe('800');
  });

  it('throws SaleError when a credit sale would exceed the customer credit limit', async () => {
    const { mockDb, mockTx } = buildMockDb([
      { id: 10, finishedStock: 5, name: 'Part A', sku: 'A' },
    ]);
    mockTx.customer.findUnique.mockResolvedValue(
      mockCreditCustomer({ balance: D('4800.00'), creditLimit: D('5000.00') }),
    );

    await expect(
      completeSale(
        {
          ...BASE_INPUT,
          payment: PaymentMethod.CREDIT,
          lines: [{ type: 'part', partId: 10, qty: 1, unitPrice: D('300.00') }],
          customerId: 99,
        },
        mockDb,
      ),
    ).rejects.toThrow(/exceed/i);

    // Nothing should have been mutated — the limit check fails before stock/balance changes
    expect(mockTx.part.update).not.toHaveBeenCalled();
    expect(mockTx.customer.update).not.toHaveBeenCalled();
    expect(mockTx.customerLedger.create).not.toHaveBeenCalled();
  });

  it('allows a credit sale of any size when the customer has no credit limit', async () => {
    const { mockDb, mockTx } = buildMockDb([
      { id: 10, finishedStock: 5, name: 'Part A', sku: 'A' },
    ]);
    mockTx.customer.findUnique.mockResolvedValue(
      mockCreditCustomer({ balance: D('999999.00'), creditLimit: null }),
    );

    await expect(
      completeSale(
        {
          ...BASE_INPUT,
          payment: PaymentMethod.CREDIT,
          lines: [{ type: 'part', partId: 10, qty: 1, unitPrice: D('100.00') }],
          customerId: 99,
        },
        mockDb,
      ),
    ).resolves.toBeTruthy();
  });

  it('throws SaleError when the customer is not enabled for credit', async () => {
    const { mockDb, mockTx } = buildMockDb([
      { id: 10, finishedStock: 5, name: 'Part A', sku: 'A' },
    ]);
    mockTx.customer.findUnique.mockResolvedValue(mockCreditCustomer({ creditEnabled: false }));

    await expect(
      completeSale(
        {
          ...BASE_INPUT,
          payment: PaymentMethod.CREDIT,
          lines: [{ type: 'part', partId: 10, qty: 1, unitPrice: D('100.00') }],
          customerId: 99,
        },
        mockDb,
      ),
    ).rejects.toThrow(/not enabled for credit/i);
  });

  it('throws SaleError when a credit sale has no customer attached', async () => {
    const { mockDb } = buildMockDb([
      { id: 10, finishedStock: 5, name: 'Part A', sku: 'A' },
    ]);

    await expect(
      completeSale(
        {
          ...BASE_INPUT,
          payment: PaymentMethod.CREDIT,
          lines: [{ type: 'part', partId: 10, qty: 1, unitPrice: D('100.00') }],
        },
        mockDb,
      ),
    ).rejects.toThrow(/credit sales require a customer/i);
  });
});
