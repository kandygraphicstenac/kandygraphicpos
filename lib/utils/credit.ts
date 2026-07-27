import type { CustomerRecord } from '@/lib/types/customer';

/**
 * Whether `customer` can use Credit as a payment method for a sale that
 * would add `saleAmountPaise` to their balance. Mirrors the server-side
 * check in saleService.completeSale — this is the UX gate only; the
 * transaction re-validates with a row lock and is the actual authority.
 */
export function isCreditAvailable(customer: CustomerRecord | null, saleAmountPaise: number): boolean {
  if (!customer?.creditEnabled) return false;
  if (customer.creditLimit == null) return true;
  const limit = parseFloat(customer.creditLimit);
  const projectedBalance = parseFloat(customer.balance) + saleAmountPaise / 100;
  return projectedBalance <= limit;
}
