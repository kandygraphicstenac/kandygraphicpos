import { Prisma } from '@prisma/client';
import { describe, it, expect, vi } from 'vitest';
import { recordPayment, CreditError, RecordPaymentInput } from '../creditService';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

const D = (v: string | number) => new Prisma.Decimal(v);

function buildMockDb(customer: { id: number; balance: Prisma.Decimal }) {
  const mockTx = {
    $executeRaw: vi.fn().mockResolvedValue(0),
    customer: {
      findUnique: vi.fn().mockResolvedValue(customer),
      update: vi.fn().mockImplementation(({ data }: { data: { balance: { decrement: Prisma.Decimal } } }) =>
        Promise.resolve({ ...customer, balance: customer.balance.sub(data.balance.decrement) }),
      ),
    },
    customerLedger: {
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'ledger-1', createdAt: new Date(), ...data }),
      ),
    },
    managerAuthorization: {
      findUnique: vi.fn().mockResolvedValue(null), // no grant by default — tests opt in
      update: vi.fn().mockResolvedValue({}),
    },
  };

  const mockDb = {
    $transaction: vi.fn().mockImplementation((cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx)),
  };

  return { mockDb: mockDb as unknown as import('@prisma/client').PrismaClient, mockTx };
}

const BASE_INPUT: Omit<RecordPaymentInput, 'amount'> = {
  customerId: 99,
  method: 'CASH',
  userId: 1,
  requiresAuth: false,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('recordPayment', () => {
  it('decreases balance and writes a PAYMENT ledger row', async () => {
    const { mockDb, mockTx } = buildMockDb({ id: 99, balance: D('1000.00') });

    const result = await recordPayment({ ...BASE_INPUT, amount: D('400.00') }, mockDb);

    const updateCall = mockTx.customer.update.mock.calls[0][0];
    expect(updateCall.where).toEqual({ id: 99 });
    expect((updateCall.data.balance.decrement as Prisma.Decimal).toString()).toBe('400');

    const ledgerCall = mockTx.customerLedger.create.mock.calls[0][0];
    expect(ledgerCall.data.type).toBe('PAYMENT');
    // Ledger amount is negative — it reduces the balance owed
    expect((ledgerCall.data.amount as Prisma.Decimal).toString()).toBe('-400');

    expect(result.customer.balance.toString()).toBe('600');
  });

  it('includes the payment method in the ledger note', async () => {
    const { mockDb, mockTx } = buildMockDb({ id: 99, balance: D('1000.00') });

    await recordPayment({ ...BASE_INPUT, amount: D('100.00'), method: 'BANK_TRANSFER', note: 'ref #1234' }, mockDb);

    const ledgerCall = mockTx.customerLedger.create.mock.calls[0][0];
    expect(ledgerCall.data.note).toBe('Bank transfer — ref #1234');
  });

  it('blocks overpayment beyond the current balance', async () => {
    const { mockDb, mockTx } = buildMockDb({ id: 99, balance: D('200.00') });

    await expect(
      recordPayment({ ...BASE_INPUT, amount: D('250.00') }, mockDb),
    ).rejects.toThrow(/exceeds the outstanding balance/i);

    expect(mockTx.customer.update).not.toHaveBeenCalled();
    expect(mockTx.customerLedger.create).not.toHaveBeenCalled();
  });

  it('rejects a zero or negative amount before touching the database', async () => {
    const { mockDb } = buildMockDb({ id: 99, balance: D('200.00') });

    await expect(recordPayment({ ...BASE_INPUT, amount: D('0') }, mockDb)).rejects.toThrow(CreditError);
    await expect(recordPayment({ ...BASE_INPUT, amount: D('-50') }, mockDb)).rejects.toThrow(CreditError);
  });

  it('throws CreditError when the customer is not found', async () => {
    const { mockDb, mockTx } = buildMockDb({ id: 99, balance: D('200.00') });
    mockTx.customer.findUnique.mockResolvedValue(null);

    await expect(
      recordPayment({ ...BASE_INPUT, amount: D('50.00') }, mockDb),
    ).rejects.toThrow(/customer not found/i);
  });

  it('requires a valid authorization grant when requiresAuth is true', async () => {
    const { mockDb } = buildMockDb({ id: 99, balance: D('1000.00') });

    await expect(
      recordPayment({ ...BASE_INPUT, amount: D('100.00'), requiresAuth: true }, mockDb),
    ).rejects.toThrow(CreditError);
  });

  it('succeeds with requiresAuth when a valid grant is consumed', async () => {
    const { mockDb, mockTx } = buildMockDb({ id: 99, balance: D('1000.00') });
    const grant = {
      id: 'tok-1',
      action: 'credit_payment',
      authorizedById: 7,
      reason: 'Customer payment confirmed',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
    };
    mockTx.managerAuthorization.findUnique.mockResolvedValue(grant);

    const result = await recordPayment(
      { ...BASE_INPUT, amount: D('100.00'), requiresAuth: true, authToken: 'tok-1' },
      mockDb,
    );

    expect(result.customer.balance.toString()).toBe('900');
    expect(mockTx.managerAuthorization.update).toHaveBeenCalledWith({
      where: { id: 'tok-1' },
      data: { usedAt: expect.any(Date) },
    });
  });

  it('balance reconciles from the ledger: increments and decrements sum to the final balance', async () => {
    // Simulates a customer who had a 700 credit sale then a 300 payment —
    // the same invariant saleService/creditService both maintain: balance
    // must always equal SUM(amount) over CustomerLedger.
    const ledger = [D('700.00'), D('-300.00')];
    const reconciled = ledger.reduce((sum, amt) => sum.add(amt), D('0'));
    expect(reconciled.toString()).toBe('400');

    const { mockDb } = buildMockDb({ id: 99, balance: reconciled });
    const result = await recordPayment({ ...BASE_INPUT, amount: D('400.00') }, mockDb);
    expect(result.customer.balance.toString()).toBe('0');
  });
});
