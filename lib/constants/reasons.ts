export type ReasonOption = { value: string; label: string };

export const DISCOUNT_REASONS: ReasonOption[] = [
  { value: 'loyal_customer', label: 'Loyal customer' },
  { value: 'bulk_order', label: 'Bulk order' },
  { value: 'price_match', label: 'Price match' },
  { value: 'goodwill', label: 'Staff error / goodwill' },
  { value: 'other', label: 'Other' },
];

export const REFUND_REASONS: ReasonOption[] = [
  { value: 'wrong_item', label: 'Wrong item sold' },
  { value: 'defective', label: 'Defective / damaged product' },
  { value: 'changed_mind', label: 'Customer changed mind' },
  { value: 'duplicate_charge', label: 'Duplicate charge' },
  { value: 'other', label: 'Other' },
];

export const CREDIT_PAYMENT_REASONS: ReasonOption[] = [
  { value: 'customer_payment', label: 'Customer payment confirmed' },
  { value: 'other', label: 'Other' },
];
