import { z } from 'zod';

export const AuthorizeBodySchema = z.object({
  password: z.string().min(1).max(200),
  action: z.enum(['discount', 'refund', 'credit_payment']),
  reason: z.string().trim().min(1, 'Reason is required').max(200),
});

export type AuthorizeBody = z.infer<typeof AuthorizeBodySchema>;
