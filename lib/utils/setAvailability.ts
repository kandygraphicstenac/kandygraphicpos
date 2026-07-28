/**
 * Single source of truth for how many of a sticker set are sellable.
 *
 * A packed kit is a physical thing with its own count: the shop packs EITHER
 * loose parts OR a complete kit out of uncut stock, so a set's availability is
 * its own `packedStock` and is never derived from component part stock.
 * `SetComponent` rows are a reference/contents list only.
 *
 * Used by the POS gate, the catalog list, and the server-side guard in
 * `saleService` — never re-implement this inline (see CLAUDE.md).
 */
export function setAvailability(set: { packedStock: number }): number {
  return set.packedStock;
}
