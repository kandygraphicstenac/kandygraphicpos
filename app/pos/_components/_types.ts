import type { PosSearchResult } from '@/lib/types/pos';

/** One line in the cart. unitPrice is the Decimal string from the API ("1500.00"). */
export type CartItem = {
  /** Stable key: `part-{id}` or `set-{id}`. One entry per product. */
  key: string;
  product: PosSearchResult;
  qty: number;
  unitPrice: string;
};

export type SaleStatus =
  | { type: 'idle' }
  | { type: 'loading'; payment: string }
  | { type: 'success'; invoiceId: string; totalPaise: number; deliveryFeePaise?: number; companyName: string; tenderedPaise?: number; paymentRef?: string }
  | { type: 'error'; message: string };

export type HeldSaleRecord = {
  id: number;
  label: string;
  lines: CartItem[];
  createdAt: string;
};

export type Toast = {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
};
