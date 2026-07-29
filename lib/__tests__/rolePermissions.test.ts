import { describe, it, expect } from 'vitest';
import type { Role } from '@prisma/client';
import {
  ASSIGNABLE_ROLES,
  ROLE_LABELS,
  canUsePos,
  canViewInvoices,
  canManageCustomers,
  canEditCatalog,
  canDeleteCatalog,
  canPrintSalesDocs,
  canPrintLabels,
  canReadLocations,
  canViewReports,
  canManageSettings,
  hasAnyModuleAccess,
  landingPathFor,
} from '../permissions';

/** Every capability in the module, so "new role gets nothing" can be asserted wholesale. */
const ALL_CAPABILITIES = [
  canUsePos, canViewInvoices, canManageCustomers, canEditCatalog, canDeleteCatalog,
  canPrintSalesDocs, canPrintLabels, canReadLocations, canViewReports, canManageSettings,
] as const;

const NEW_ROLES: Role[] = ['SALES', 'ACCOUNT'];

describe('SALES and ACCOUNT exist and are assignable', () => {
  it('appear in the assignable list', () => {
    expect(ASSIGNABLE_ROLES).toContain('SALES');
    expect(ASSIGNABLE_ROLES).toContain('ACCOUNT');
  });

  it('have display labels', () => {
    expect(ROLE_LABELS.SALES).toBe('Sales');
    expect(ROLE_LABELS.ACCOUNT).toBe('Account');
  });

  it('did not displace the original roles', () => {
    expect(ASSIGNABLE_ROLES).toContain('OWNER');
    expect(ASSIGNABLE_ROLES).toContain('CASHIER');
    expect(ASSIGNABLE_ROLES).toContain('CUTTER');
  });
});

describe('new roles have NO module access', () => {
  for (const role of NEW_ROLES) {
    it(`${role} is denied by every capability`, () => {
      for (const can of ALL_CAPABILITIES) {
        expect(can(role), `${can.name} should deny ${role}`).toBe(false);
      }
    });

    it(`${role} reports no module access`, () => {
      expect(hasAnyModuleAccess(role)).toBe(false);
    });

    it(`${role} lands on /no-access, not a module page`, () => {
      expect(landingPathFor(role)).toBe('/no-access');
    });
  }
});

describe('existing roles are unchanged', () => {
  it('OWNER keeps everything', () => {
    for (const can of ALL_CAPABILITIES) expect(can('OWNER')).toBe(true);
    expect(landingPathFor('OWNER')).toBe('/pos');
  });

  it('CASHIER: POS, invoices, customers, sales docs, labels, locations — nothing else', () => {
    expect(canUsePos('CASHIER')).toBe(true);
    expect(canViewInvoices('CASHIER')).toBe(true);
    expect(canManageCustomers('CASHIER')).toBe(true);
    expect(canPrintSalesDocs('CASHIER')).toBe(true);
    expect(canPrintLabels('CASHIER')).toBe(true);
    expect(canReadLocations('CASHIER')).toBe(true);

    expect(canEditCatalog('CASHIER')).toBe(false);
    expect(canDeleteCatalog('CASHIER')).toBe(false);
    expect(canViewReports('CASHIER')).toBe(false);
    expect(canManageSettings('CASHIER')).toBe(false);
    expect(landingPathFor('CASHIER')).toBe('/pos');
  });

  it('CUTTER: catalog (not delete), labels, locations — nothing else', () => {
    expect(canEditCatalog('CUTTER')).toBe(true);
    expect(canPrintLabels('CUTTER')).toBe(true);
    expect(canReadLocations('CUTTER')).toBe(true);

    expect(canDeleteCatalog('CUTTER')).toBe(false);
    expect(canUsePos('CUTTER')).toBe(false);
    expect(canViewInvoices('CUTTER')).toBe(false);
    expect(canManageCustomers('CUTTER')).toBe(false);
    expect(canPrintSalesDocs('CUTTER')).toBe(false);
    expect(canViewReports('CUTTER')).toBe(false);
    expect(canManageSettings('CUTTER')).toBe(false);
    expect(landingPathFor('CUTTER')).toBe('/cut-issue');
  });
});

describe('capability checks are allow-lists, not denylists', () => {
  // A denylist (`role !== 'X'`) would return true for a role it has never heard
  // of. Probing with a bogus role catches that shape regardless of the enum.
  const unknown = '__FUTURE_ROLE__' as unknown as Role;

  it('an unrecognised role is denied everywhere', () => {
    for (const can of ALL_CAPABILITIES) {
      expect(can(unknown), `${can.name} must deny an unknown role`).toBe(false);
    }
    expect(hasAnyModuleAccess(unknown)).toBe(false);
    expect(landingPathFor(unknown)).toBe('/no-access');
  });
});

describe('landing paths never dead-end', () => {
  it('every assignable role lands somewhere it is allowed to be', () => {
    for (const role of ASSIGNABLE_ROLES) {
      const path = landingPathFor(role);
      if (path === '/pos') expect(canUsePos(role)).toBe(true);
      if (path === '/no-access') expect(hasAnyModuleAccess(role)).toBe(false);
    }
  });
});
