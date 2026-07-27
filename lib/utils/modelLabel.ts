/**
 * Formats the year portion of a bike model label.
 * Single year when yearEnd is absent or equals year; range otherwise.
 *
 * Examples:
 *   yearLabel(2015)           → "2015"
 *   yearLabel(2015, null)     → "2015"
 *   yearLabel(2015, 2015)     → "2015"
 *   yearLabel(2015, 2019)     → "2015–2019"
 */
export function yearLabel(year: number, yearEnd?: number | null): string {
  if (!yearEnd || yearEnd <= year) return String(year);
  return `${year}–${yearEnd}`; // en dash
}
