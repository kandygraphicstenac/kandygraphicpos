import { z } from 'zod';

// Empty strings from form inputs are normalized to undefined so optional
// fields don't get persisted as "" instead of null.
const optionalTrimmed = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal('')).transform((v) => (v ? v : undefined));

export const CustomerBodySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  phone: optionalTrimmed(20),
  addressLine1: optionalTrimmed(200),
  addressLine2: optionalTrimmed(200),
  city: optionalTrimmed(80),
  postalCode: optionalTrimmed(20),
  bikeInfo: optionalTrimmed(500),
  notes: optionalTrimmed(1000),
  /** Reactivation toggle — OWNER only; the route rejects this field from CASHIER. */
  active: z.boolean().optional(),
});

export type CustomerBody = z.infer<typeof CustomerBodySchema>;

/** OWNER-only: PATCH /api/customers/[id]/credit */
export const CustomerCreditBodySchema = z.object({
  creditEnabled: z.boolean(),
  /** null = no limit. Omit to leave the limit unchanged when merely toggling creditEnabled. */
  creditLimit: z.number().positive().nullable().optional(),
});

export type CustomerCreditBody = z.infer<typeof CustomerCreditBodySchema>;

/** POST /api/customers/[id]/payments */
export const RecordPaymentBodySchema = z.object({
  amount: z.number().positive(),
  method: z.enum(['CASH', 'CARD', 'BANK_TRANSFER']),
  note: z.string().trim().max(500).optional(),
  /** One-time manager authorization grant id — required when the acting user is not OWNER. */
  authToken: z.string().min(1).optional(),
});

export type RecordPaymentBody = z.infer<typeof RecordPaymentBodySchema>;

export const CustomerQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  cursor: z.string().optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

/** Shape of Invoice.deliveryAddress, sent by the POS at sale time. */
export const DeliveryAddressSchema = z.object({
  name: z.string().trim().min(1, 'Recipient name is required').max(120),
  phone: z.string().trim().max(20).optional(),
  line1: z.string().trim().min(1, 'Address line 1 is required').max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().max(80).optional(),
  postalCode: z.string().trim().max(20).optional(),
});
