import { describe, it, expect } from 'vitest';
import {
  BikeModelCreateSchema,
  BikeModelUpdateSchema,
  MIN_MODEL_YEAR,
  maxModelYear,
} from '../validators/catalog';

const base = { brand: 'Honda', model: 'CB 125', country: null };
const parse = (year: number, yearEnd?: number | null) =>
  BikeModelCreateSchema.safeParse({ ...base, year, ...(yearEnd !== undefined ? { yearEnd } : {}) });

const issuePaths = (r: ReturnType<typeof parse>) =>
  r.success ? [] : r.error.issues.flatMap((i) => i.path);

describe('minimum model year', () => {
  it('is 1900', () => expect(MIN_MODEL_YEAR).toBe(1900));

  it('accepts 1900', () => expect(parse(1900).success).toBe(true));

  it('accepts a classic that the old 1990 floor rejected', () => {
    // The reported bug: real bikes older than 1990 could not be entered.
    expect(parse(1975).success).toBe(true);
    expect(parse(1965, 1972).success).toBe(true);
  });

  it('still rejects obvious typos below the floor', () => {
    expect(parse(197).success).toBe(false);
    expect(parse(19).success).toBe(false);
    expect(parse(0).success).toBe(false);
  });
});

describe('maximum model year', () => {
  const currentYear = new Date().getFullYear();

  it('allows at least next year, so announced models fit', () => {
    expect(maxModelYear()).toBeGreaterThanOrEqual(currentYear + 1);
    expect(parse(currentYear + 1).success).toBe(true);
  });

  it('derives from the current year rather than a fixed ceiling', () => {
    expect(maxModelYear()).toBe(currentYear + 2);
  });

  it('rejects a far-future typo', () => {
    // The old hardcoded 2100 ceiling accepted 2099; this does not.
    expect(parse(2099).success).toBe(false);
    expect(parse(9999).success).toBe(false);
  });

  it('applies the ceiling to yearEnd too, and reports it on that field', () => {
    const r = parse(2020, 9999);
    expect(r.success).toBe(false);
    expect(issuePaths(r)).toContain('yearEnd');
  });
});

describe('rules that must not have changed', () => {
  it('yearEnd stays optional — omitted means a single-year model', () => {
    expect(parse(1985).success).toBe(true);
  });

  it('yearEnd may be null', () => {
    expect(parse(1985, null).success).toBe(true);
  });

  it('yearEnd must be >= year, with the existing message', () => {
    const r = parse(2019, 2015);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) =>
        i.message === 'End year must be the same as or after the start year',
      )).toBe(true);
    }
  });

  it('an equal yearEnd is allowed', () => {
    expect(parse(2015, 2015).success).toBe(true);
  });
});

describe('update schema shares the same bounds', () => {
  it('accepts a pre-1990 year', () => {
    expect(BikeModelUpdateSchema.safeParse({ year: 1975 }).success).toBe(true);
  });

  it('rejects a far-future year', () => {
    expect(BikeModelUpdateSchema.safeParse({ year: 9999 }).success).toBe(false);
  });

  it('still enforces yearEnd >= year when both are given', () => {
    expect(BikeModelUpdateSchema.safeParse({ year: 2019, yearEnd: 2015 }).success).toBe(false);
  });
});
