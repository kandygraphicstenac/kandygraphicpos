import { describe, it, expect } from 'vitest';
import { canEditCatalog, canDeleteCatalog, canViewCatalogCost } from '../permissions';

// The rule, stated once: OWNER does everything; CUTTER does everything except
// delete; CASHIER has no catalog access at all.

describe('canEditCatalog — view / create / edit / adjust / label', () => {
  it('allows OWNER', () => expect(canEditCatalog('OWNER')).toBe(true));
  it('allows CUTTER', () => expect(canEditCatalog('CUTTER')).toBe(true));
  it('blocks CASHIER (unchanged)', () => expect(canEditCatalog('CASHIER')).toBe(false));
});

describe('canDeleteCatalog — delete stays OWNER-only', () => {
  it('allows OWNER', () => expect(canDeleteCatalog('OWNER')).toBe(true));
  it('blocks CUTTER', () => expect(canDeleteCatalog('CUTTER')).toBe(false));
  it('blocks CASHIER', () => expect(canDeleteCatalog('CASHIER')).toBe(false));
});

describe('canViewCatalogCost', () => {
  it('follows catalog edit access', () => {
    expect(canViewCatalogCost('OWNER')).toBe(true);
    expect(canViewCatalogCost('CUTTER')).toBe(true);
    expect(canViewCatalogCost('CASHIER')).toBe(false);
  });
});

describe('delete is never a superset of edit', () => {
  it('anyone who can delete can also edit', () => {
    for (const role of ['OWNER', 'CASHIER', 'CUTTER'] as const) {
      if (canDeleteCatalog(role)) expect(canEditCatalog(role)).toBe(true);
    }
  });
});
