import { z } from 'zod';

export const ReturnBodySchema = z.object({
  lines: z
    .array(
      z.object({
        itemId: z.number().int().positive(),
        qty: z.number().int().positive(),
      }),
    )
    .min(1, 'Select at least one item to return'),
  /** One-time manager authorization grant id — every refund requires one. */
  refundAuthToken: z.string().min(1, 'Manager authorization required'),
});

export type ReturnBody = z.infer<typeof ReturnBodySchema>;
