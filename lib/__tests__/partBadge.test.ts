import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { partBadgeLabel } from '../utils/partBadge';
import { PartCreateSchema } from '../validators/catalog';

describe('partBadgeLabel — derived from soldSeparately', () => {
  it('renders "Part" for a sold-separately part', () => {
    expect(partBadgeLabel(true)).toBe('Part');
  });

  it('renders "Kit part" when not sold separately', () => {
    expect(partBadgeLabel(false)).toBe('Kit part');
  });
});

describe('price rules are unchanged by removing isKit', () => {
  const base = { sku: 'A-1', name: 'Tank L', bikeModelId: 1, reorderLevel: 0 };

  it('a kit component saves with no price', () => {
    const r = PartCreateSchema.safeParse({ ...base, soldSeparately: false });
    expect(r.success).toBe(true);
  });

  it('a kit component saves with an explicit null price', () => {
    const r = PartCreateSchema.safeParse({ ...base, soldSeparately: false, price: null });
    expect(r.success).toBe(true);
  });

  it('a sold-separately part with no price is rejected', () => {
    const r = PartCreateSchema.safeParse({ ...base, soldSeparately: true });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes('price'))).toBe(true);
    }
  });

  it('a sold-separately part with a price is accepted', () => {
    const r = PartCreateSchema.safeParse({ ...base, soldSeparately: true, price: '450.00' });
    expect(r.success).toBe(true);
  });

  it('soldSeparately defaults to true, so an unflagged part still needs a price', () => {
    expect(PartCreateSchema.safeParse(base).success).toBe(false);
    expect(PartCreateSchema.safeParse({ ...base, price: '10.00' }).success).toBe(true);
  });
});

describe('isKit is gone from the codebase', () => {
  // Guards against a stray reference creeping back in — the column no longer
  // exists on Part, so any code still reading it is a bug.
  //
  // Comments are stripped first: several files legitimately *explain* that the
  // field was removed and why. The claim under test is "no code reads it", not
  // "the name is never written down".
  const ROOT = resolve(__dirname, '../..');
  const SEARCH_DIRS = ['app', 'lib', 'components'];
  const EXTS = ['.ts', '.tsx'];

  function stripComments(src: string): string {
    return src
      .replace(/\/\*[\s\S]*?\*\//g, '')       // /* */ and /** */ blocks
      .replace(/(^|[^:"'`])\/\/.*$/gm, '$1'); // // and /// lines (leaves :// in URLs)
  }

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === '.next') continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (EXTS.some((e) => full.endsWith(e))) out.push(full);
    }
    return out;
  }

  it('no code under app/, lib/ or components/ reads isKit', () => {
    const offenders: string[] = [];
    for (const dir of SEARCH_DIRS) {
      for (const file of walk(join(ROOT, dir))) {
        // This file names the field in its own assertions; skip itself.
        if (file.endsWith('partBadge.test.ts')) continue;
        if (stripComments(readFileSync(file, 'utf8')).includes('isKit')) {
          offenders.push(file.slice(ROOT.length + 1).replace(/\\/g, '/'));
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the Prisma schema no longer declares isKit on Part', () => {
    const schema = readFileSync(join(ROOT, 'prisma/schema.prisma'), 'utf8');
    const partModel = stripComments(
      schema.slice(schema.indexOf('model Part {'), schema.indexOf('model StickerSet {')),
    );
    expect(partModel).not.toContain('isKit');
    expect(partModel).toContain('soldSeparately');
  });
});
