import { z } from 'zod';

// ── Bike Models ───────────────────────────────────────────────────────────────

/**
 * Oldest enterable model year. Classic motorcycles well older than the previous
 * 1990 floor are still on the road here and customers want stickers for them,
 * so the bound exists only to catch obvious typos ("197", "19").
 *
 * Exported so the form's `min` attribute and this validator share one value —
 * a client-only fix is not a fix, and two copies would drift.
 */
export const MIN_MODEL_YEAR = 1900;

/**
 * Newest enterable model year: next year's models are announced ahead of time,
 * so the current year alone would hit the same wall from the other direction.
 * +2 gives headroom while still rejecting nonsense like 2999 — which the old
 * hardcoded 2100 ceiling happily accepted.
 *
 * A function, not a constant: evaluated per parse rather than at module load,
 * so a long-running process can't freeze the ceiling at its start year across
 * a New Year boundary.
 */
export function maxModelYear(): number {
  return new Date().getFullYear() + 2;
}

const BikeModelObjectSchema = z.object({
  brand: z.string().min(1).max(80).trim(),
  model: z.string().min(1).max(80).trim(),
  // Upper bound is applied in the refine below so it stays current.
  year: z.number().int().min(MIN_MODEL_YEAR),
  yearEnd: z.number().int().min(MIN_MODEL_YEAR).nullable().optional(),
  country: z.string().max(10).trim().nullable().optional(),
});

function yearEndRefine(
  data: { year?: number; yearEnd?: number | null },
  ctx: z.RefinementCtx,
) {
  const max = maxModelYear();

  for (const field of ['year', 'yearEnd'] as const) {
    const value = data[field];
    if (value != null && value > max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Year must be ${max} or earlier`,
        path: [field],
      });
    }
  }

  if (data.year != null && data.yearEnd != null && data.yearEnd < data.year) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'End year must be the same as or after the start year',
      path: ['yearEnd'],
    });
  }
}

export const BikeModelCreateSchema = BikeModelObjectSchema.superRefine(yearEndRefine);
export const BikeModelUpdateSchema = BikeModelObjectSchema.partial().superRefine(yearEndRefine);

export type BikeModelCreate = z.infer<typeof BikeModelCreateSchema>;
export type BikeModelUpdate = z.infer<typeof BikeModelUpdateSchema>;

// ── Parts ─────────────────────────────────────────────────────────────────────

// Base object used by both create and update schemas so .partial() stays on ZodObject.
const PartObjectSchema = z.object({
  sku: z.string().min(1).max(60).trim(),
  name: z.string().min(1).max(120).trim(),
  bikeModelId: z.number().int().positive(),
  color: z.string().max(60).trim().nullable().optional(),
  // Optional for kit components; required when soldSeparately=true (superRefine below)
  price: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid price').nullable().optional(),
  cost: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid cost').nullable().optional(),
  reorderLevel: z.number().int().min(0).default(0),
  soldSeparately: z.boolean().default(true),
  imageUrl: z.string().url().nullable().optional(),
  locationCode: z.string().trim().toUpperCase().max(20).nullable().optional(),
});

// Price is required only when soldSeparately=true — that item is bought by
// customers on its own. Unticked means it's a kit component: no price needed,
// hidden from POS, and badged "Kit part" (derived, not stored).
function soldSeparatelyPriceRefine(
  data: { soldSeparately?: boolean; price?: string | null },
  ctx: z.RefinementCtx,
) {
  if (data.soldSeparately === true && !data.price) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Sold-separately items require a price',
      path: ['price'],
    });
  }
}

export const PartCreateSchema = PartObjectSchema.superRefine(soldSeparatelyPriceRefine);

// PartUpdateSchema extends the create schema with `active` (toggle-only field)
export const PartUpdateSchema = PartObjectSchema.partial().extend({
  active: z.boolean().optional(),
}).superRefine(soldSeparatelyPriceRefine);

export type PartCreate = z.infer<typeof PartCreateSchema>;
export type PartUpdate = z.infer<typeof PartUpdateSchema>;

// ── Sets ──────────────────────────────────────────────────────────────────────

export const SetComponentSchema = z.object({
  partId: z.number().int().positive(),
  qty: z.number().int().min(1),
});

export const SetCreateSchema = z.object({
  sku: z.string().min(1).max(60).trim(),
  name: z.string().min(1).max(120).trim(),
  bikeModelId: z.number().int().positive(),
  setPrice: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid price'),
  color: z.string().max(60).trim().nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  components: z.array(SetComponentSchema).min(1, 'Add at least one component'),
  locationCode: z.string().trim().toUpperCase().max(20).nullable().optional(),
});

export const SetUpdateSchema = SetCreateSchema.partial().extend({
  active: z.boolean().optional(),
});

export type SetCreate = z.infer<typeof SetCreateSchema>;
export type SetUpdate = z.infer<typeof SetUpdateSchema>;

// ── Stock Adjustment ──────────────────────────────────────────────────────────

export const AdjustReasonSchema = z.enum(['INITIAL', 'RECOUNT', 'DAMAGE', 'OTHER']);

export const AdjustBodySchema = z.object({
  delta: z.number().int().refine((v) => v !== 0, 'Delta must be non-zero'),
  reason: AdjustReasonSchema,
  note: z.string().max(255).trim().optional(),
  locationCode: z.string().trim().toUpperCase().max(20).nullable().optional(),
});

// ── Locations ─────────────────────────────────────────────────────────────────

export const LocationCreateSchema = z.object({
  code: z.string().min(1).max(20).trim().toUpperCase(),
  rack: z.string().max(20).trim().nullable().optional(),
  shelf: z.string().max(20).trim().nullable().optional(),
  slot: z.string().max(20).trim().nullable().optional(),
  description: z.string().max(200).trim().nullable().optional(),
});

export const LocationUpdateSchema = z.object({
  rack: z.string().max(20).trim().nullable().optional(),
  shelf: z.string().max(20).trim().nullable().optional(),
  slot: z.string().max(20).trim().nullable().optional(),
  description: z.string().max(200).trim().nullable().optional(),
  active: z.boolean().optional(),
});

export type AdjustReason = z.infer<typeof AdjustReasonSchema>;
export type AdjustBody = z.infer<typeof AdjustBodySchema>;
