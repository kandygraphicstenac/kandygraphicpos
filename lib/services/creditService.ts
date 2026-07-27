import { Customer, CustomerLedger, Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../db';
import { consumeAuthorizationGrant, AuthorizationError } from './authorizationService';

export class CreditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CreditError';
  }
}

const PAYMENT_METHOD_LABELS: Record<'CASH' | 'CARD' | 'BANK_TRANSFER', string> = {
  CASH: 'Cash',
  CARD: 'Card',
  BANK_TRANSFER: 'Bank transfer',
};

export interface RecordPaymentInput {
  customerId: number;
  /** Positive amount being paid down against the balance. */
  amount: Prisma.Decimal;
  method: 'CASH' | 'CARD' | 'BANK_TRANSFER';
  note?: string;
  userId: number;
  /** OWNER may record directly; CASHIER must supply a valid grant — the route decides which applies and sets this accordingly. */
  requiresAuth: boolean;
  /** One-time manager authorization grant id — required when requiresAuth is true. */
  authToken?: string;
}

export type RecordPaymentResult = {
  customer: Customer;
  ledgerEntry: CustomerLedger;
};

/**
 * Atomically records a payment against a customer's credit balance: row-locks
 * the customer, validates the amount, decrements balance, and writes a
 * PAYMENT CustomerLedger row — balance must always reconcile from the ledger
 * (see CLAUDE.md). Overpayment beyond the current balance is blocked rather
 * than allowed into a negative ("credit balance") state.
 */
export async function recordPayment(
  input: RecordPaymentInput,
  db: PrismaClient = defaultPrisma,
): Promise<RecordPaymentResult> {
  if (input.amount.lessThanOrEqualTo(0)) {
    throw new CreditError('Payment amount must be greater than zero');
  }

  return db.$transaction(async (tx) => {
    if (input.requiresAuth) {
      try {
        await consumeAuthorizationGrant(tx, {
          authToken: input.authToken,
          action: 'credit_payment',
        });
      } catch (err) {
        if (err instanceof AuthorizationError) throw new CreditError(err.message);
        throw err;
      }
    }

    await tx.$executeRaw`SELECT id FROM "Customer" WHERE id = ${input.customerId} FOR UPDATE`;
    const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
    if (!customer) throw new CreditError('Customer not found');

    if (input.amount.greaterThan(customer.balance)) {
      throw new CreditError('Payment exceeds the outstanding balance');
    }

    const methodLabel = PAYMENT_METHOD_LABELS[input.method];
    const note = input.note?.trim() ? `${methodLabel} — ${input.note.trim()}` : methodLabel;

    const updatedCustomer = await tx.customer.update({
      where: { id: input.customerId },
      data: { balance: { decrement: input.amount } },
    });

    const ledgerEntry = await tx.customerLedger.create({
      data: {
        customerId: input.customerId,
        type: 'PAYMENT',
        amount: input.amount.neg(),
        note,
        userId: input.userId,
      },
    });

    return { customer: updatedCustomer, ledgerEntry };
  });
}
