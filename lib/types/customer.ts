// Shared types consumed by both /api/customers route handlers and client pages.

export type CustomerRecord = {
  id: number;
  name: string;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postalCode: string | null;
  bikeInfo: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  /** Accounts receivable — see lib/utils/credit.ts for eligibility math. */
  creditEnabled: boolean;
  creditLimit: string | null; // Decimal as string; null = no limit
  balance: string; // Decimal as string; current amount owed
};

export type CustomerLedgerEntry = {
  id: string;
  type: 'CREDIT_SALE' | 'PAYMENT' | 'ADJUSTMENT';
  amount: string; // signed Decimal as string
  invoiceId: string | null;
  note: string | null;
  userName: string;
  createdAt: string;
};

/**
 * Frozen at sale time onto Invoice.deliveryAddress — independent of the
 * Customer record, which may be edited later. name/phone are captured here
 * too since a delivery's contact may differ from the customer profile.
 */
export type DeliveryAddressSnapshot = {
  name: string;
  phone: string | null;
  line1: string;
  line2: string | null;
  city: string | null;
  postalCode: string | null;
};
