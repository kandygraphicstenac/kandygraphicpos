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

/**
 * Full bike-model label: "Bajaj Pulsar 150 2019", "Honda PSX 2015–2019".
 *
 * Built on yearLabel so year ranges render the same everywhere. The market /
 * country is deliberately NOT included — this is used on printed labels where
 * horizontal space is the binding constraint, and brand + model + year is
 * already enough to identify the bike on a rack.
 */
export function modelLabel(
  brand: string,
  model: string,
  year: number,
  yearEnd?: number | null,
): string {
  return `${brand} ${model} ${yearLabel(year, yearEnd)}`.trim();
}
