/**
 * The badge shown on a Part, derived from `soldSeparately`.
 *
 * There is deliberately no stored `isKit` field: "this part only goes inside a
 * kit" is exactly "Sold separately is unticked". Two checkboxes meaning
 * overlapping things made data entry ambiguous, so the label is computed from
 * the one control that actually drives behaviour (price requirement + POS
 * visibility).
 *
 * Single source of truth — used by the catalog table and the POS product card.
 * Never hardcode either string at a call site.
 */
export function partBadgeLabel(soldSeparately: boolean): string {
  return soldSeparately ? 'Part' : 'Kit part';
}
