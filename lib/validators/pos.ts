import { z } from 'zod';
import { DeliveryAddressSchema } from './customer';

// ─── Search ───────────────────────────────────────────────────────────────────

/** Query-string schema for GET /api/pos/search */
export const PosSearchQuerySchema = z.object({
  q: z.string().trim().max(100).default(''),
  brand: z.string().trim().max(100).optional(),
  modelId: z.coerce.number().int().positive().optional(),
  cursor: z.string().max(1000).optional(),
});

export type PosSearchQuery = z.infer<typeof PosSearchQuerySchema>;

// ─── Sale ─────────────────────────────────────────────────────────────────────

const priceString = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, 'Price must be a positive decimal with up to 2 places');

/** Request body for POST /api/pos/sale */
export const PosSaleBodySchema = z.object({
  companyId: z.number().int().positive(),
  lines: z
    .array(
      z.discriminatedUnion('type', [
        z.object({
          type: z.literal('part'),
          partId: z.number().int().positive(),
          qty: z.number().int().positive(),
          unitPrice: priceString,
        }),
        z.object({
          type: z.literal('set'),
          setId: z.number().int().positive(),
          qty: z.number().int().positive(),
          unitPrice: priceString,
        }),
      ]),
    )
    .min(1, 'Cart is empty'),
  payment: z.enum(['CASH', 'CARD', 'BANK_TRANSFER', 'CREDIT']),
  /** Chosen at the start of the sale. DELIVERY requires customer + address + a fee > 0 (enforced below and again in saleService). */
  orderType: z.enum(['COUNTER', 'DELIVERY']),
  /** Whole-sale discount percentage, 0–100. Defaults to 0. */
  discountPct: z.number().min(0).max(100).default(0),
  /** Cash tendered by customer (LKR). Only meaningful for CASH payments. */
  tendered: z.number().positive().optional(),
  /** EDC terminal approval code or bank transfer reference (card / bank transfer only). */
  paymentReference: z.string().trim().max(100).optional(),
  /** Last 4 digits of card number (card payments only). */
  cardLast4: z.string().regex(/^\d{4}$/).optional(),
  /** One-time manager authorization grant id — required server-side whenever discountPct exceeds the configured threshold. */
  discountAuthToken: z.string().min(1).optional(),
  /** Optional existing customer to attach to the invoice. Walk-in (omitted) is the default and must stay fast. */
  customerId: z.number().int().positive().optional(),
  /** Pass-through fee — added to what the customer pays but never counted as product sales. */
  deliveryFee: priceString.optional(),
  /** Frozen at sale time; required whenever deliveryFee > 0 (enforced below). */
  deliveryAddress: DeliveryAddressSchema.optional(),
}).superRefine((data, ctx) => {
  if (data.deliveryFee && parseFloat(data.deliveryFee) > 0 && !data.deliveryAddress) {
    ctx.addIssue({
      code: 'custom',
      message: 'deliveryAddress is required when deliveryFee > 0',
      path: ['deliveryAddress'],
    });
  }
  if (data.orderType === 'DELIVERY') {
    if (!data.customerId) {
      ctx.addIssue({ code: 'custom', message: 'A customer is required for delivery orders', path: ['customerId'] });
    }
    if (!data.deliveryAddress) {
      ctx.addIssue({ code: 'custom', message: 'A delivery address is required for delivery orders', path: ['deliveryAddress'] });
    }
    if (!data.deliveryFee || parseFloat(data.deliveryFee) <= 0) {
      ctx.addIssue({ code: 'custom', message: 'A delivery fee greater than zero is required for delivery orders', path: ['deliveryFee'] });
    }
  }
  if (data.payment === 'CREDIT' && !data.customerId) {
    ctx.addIssue({ code: 'custom', message: 'A customer is required for credit sales', path: ['customerId'] });
  }
});

export type PosSaleBody = z.infer<typeof PosSaleBodySchema>;

// ─── Hold ─────────────────────────────────────────────────────────────────────

export const HoldSaleBodySchema = z.object({
  label: z.string().trim().min(1).max(120),
  lines: z.array(z.unknown()).min(1), // CartItem[] — validated structurally client-side
});

export type HoldSaleBody = z.infer<typeof HoldSaleBodySchema>;
