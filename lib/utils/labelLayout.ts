/**
 * How a batch of labels lands on the stock.
 *
 * Shared by the print-options dialog (before printing) and the label page
 * toolbar (on the page itself) so the two can never disagree about how many
 * rows a batch fills.
 *
 * Informational only — nothing in the app rounds a quantity up or pads a batch
 * with a filler label. The user decides whether a part-empty last row is fine.
 */
export function labelRowFill(totalLabels: number, columns: number): {
  totalRows: number;
  blanks: number;
} {
  if (columns <= 0 || totalLabels <= 0) return { totalRows: 0, blanks: 0 };
  const totalRows = Math.ceil(totalLabels / columns);
  const remainder = totalLabels % columns;
  return { totalRows, blanks: remainder === 0 ? 0 : columns - remainder };
}

/** Columns per row for a format: thermal comes from settings, A4 is a fixed 5-up grid. */
export function columnsForFormat(
  format: 'a4' | 'thermal',
  stockColumns: number | undefined,
): number {
  return format === 'thermal' && stockColumns ? stockColumns : 5;
}

/** Upper bound on copies-per-item, so a mistyped number can't queue thousands. */
export const MAX_COPIES = 200;
