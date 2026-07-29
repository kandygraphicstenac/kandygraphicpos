const CONSONANTS = new Set('BCDFGHJKLMNPQRSTVWXYZ');

function abbr3(text: string): string {
  const clean = text.replace(/[^a-zA-Z]/g, '').toUpperCase();
  if (clean.length === 0) return 'XXX';
  if (clean.length <= 3) return clean.padEnd(3, clean[clean.length - 1]!);
  let result = clean[0]!;
  for (let i = 1; i < clean.length && result.length < 3; i++) {
    if (CONSONANTS.has(clean[i]!)) result += clean[i];
  }
  return (result.length === 3 ? result : (result + clean.slice(1, 4 - result.length)).slice(0, 3));
}

function modelToken(model: string): string {
  const words = model.trim().split(/\s+/).filter(Boolean);
  if (words.length === 1) return (words[0]!).toUpperCase().slice(0, 8);
  const letters = words[0]!.replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase();
  const digits = words.slice(1).join('').replace(/[^0-9]/g, '');
  return (letters + digits).slice(0, 8);
}

function nameInitials(name: string): string {
  return name
    .replace(/[^a-zA-Z\s]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w[0] ?? '').toUpperCase())
    .join('')
    .slice(0, 4);
}

// ─── Colour codes ─────────────────────────────────────────────────────────────
// The same product often exists in several colour schemes — genuinely different
// products with their own stock and barcode — so the suggestion has to
// distinguish them or every second save collides on "SKU already exists".
//
// Fixed two-letter codes, deliberately chosen so lookalikes stay apart:
// black BK vs blue BL, green GN vs grey GY.

const COLOR_CODES: Record<string, string> = {
  black: 'BK', blue: 'BL', red: 'RD', green: 'GN', grey: 'GY', gray: 'GY',
  white: 'WH', yellow: 'YL', orange: 'OR', pink: 'PK', purple: 'PU',
  violet: 'VI', brown: 'BN', maroon: 'MR', navy: 'NV', teal: 'TL',
  cyan: 'CY', magenta: 'MG', beige: 'BG', cream: 'CM', silver: 'SV',
  gold: 'GD', chrome: 'CR', bronze: 'BZ', copper: 'CP',
  holographic: 'HO', holo: 'HO', matte: 'MT', gloss: 'GL', clear: 'CL',
  carbon: 'CB', neon: 'NE', fluro: 'FL', fluorescent: 'FL',
};

/** Words that join colours rather than naming one. */
const JOINERS = new Set(['and', 'with', 'on', 'n', 'or']);

/** Combinations are common here ("red and green"), but past two the SKU bloats. */
const MAX_COLORS = 2;

/**
 * Short code for a colour description, for use as a SKU suffix.
 *
 * Lowercases, splits on any non-letter, drops joining words, maps each colour
 * through the fixed table (unknown → first two letters), de-duplicates, keeps
 * the order typed, caps at two colours and concatenates.
 *
 * Returns '' when there is nothing usable, so callers append no separator.
 *
 *   'red'            -> 'RD'
 *   'red and green'  -> 'RDGN'
 *   'pink/green'     -> 'PKGN'
 *   'Blue/Red'       -> 'BLRD'
 *   ''               -> ''
 *
 * Order is preserved rather than normalised: 'pink/green' and 'green/pink'
 * yield different codes, matching what was typed. Uniqueness is still enforced
 * by the SKU unique constraint, not by this code.
 */
export function colorCode(color: string | null | undefined): string {
  if (!color) return '';

  const tokens = color.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const codes: string[] = [];

  for (const token of tokens) {
    if (JOINERS.has(token)) continue;
    const code = COLOR_CODES[token] ?? token.slice(0, 2).toUpperCase();
    if (code.length < 2) continue;          // single stray letter carries no signal
    if (codes.includes(code)) continue;     // 'red red' -> RD
    codes.push(code);
    if (codes.length === MAX_COLORS) break;
  }

  return codes.join('');
}

/** Appends '-CODE' only when there is a colour; never leaves a trailing dash. */
function withColor(base: string, color?: string | null): string {
  const code = colorCode(color);
  return code ? `${base}-${code}` : base;
}

export function suggestPartSku(
  brand: string,
  model: string,
  year: number,
  name: string,
  color?: string | null,
): string {
  const b = abbr3(brand);
  const m = modelToken(model);
  const y = String(year).slice(-2);
  const n = nameInitials(name) || 'X';
  return withColor(`${b}-${m}${y}-${n}`, color);
}

export function suggestSetSku(
  model: string,
  year: number,
  name: string,
  color?: string | null,
): string {
  const m = modelToken(model);
  const y = String(year).slice(-2);
  const n = nameInitials(name) || 'SET';
  return withColor(`SET-${m}${y}-${n}`, color);
}
