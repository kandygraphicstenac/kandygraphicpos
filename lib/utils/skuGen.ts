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

export function suggestPartSku(brand: string, model: string, year: number, name: string): string {
  const b = abbr3(brand);
  const m = modelToken(model);
  const y = String(year).slice(-2);
  const n = nameInitials(name) || 'X';
  return `${b}-${m}${y}-${n}`;
}

export function suggestSetSku(model: string, year: number, name: string): string {
  const m = modelToken(model);
  const y = String(year).slice(-2);
  const n = nameInitials(name) || 'SET';
  return `SET-${m}${y}-${n}`;
}
