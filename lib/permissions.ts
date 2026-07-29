import type { Role } from '@prisma/client';

/**
 * Role capabilities — the single source of truth for who may reach what.
 *
 * ## Every check here is an ALLOW-LIST, deliberately.
 *
 * Guards used to be written as denials (`if (role === 'CUTTER') return 403`),
 * which means "everyone except CUTTER". That is safe only until the Role enum
 * grows: a newly added role falls straight through into access nobody granted
 * it. Adding SALES and ACCOUNT would have handed them the POS sale endpoint,
 * refunds, and credit payments.
 *
 * So: never write `role !== 'X'` or `role === 'X'` as a denial at a call site.
 * Add a named capability here and list the roles that HAVE it. A role not
 * named in a list gets nothing — which is the correct default for a new role.
 *
 * Current roles:
 *   OWNER   — everything.
 *   CASHIER — POS, invoices, customers. No catalog, no reports, no settings.
 *   CUTTER  — catalog (not delete), labels. No POS, no invoices, no customers.
 *   SALES   — nothing yet. Reserved for the stock-approval workflow.
 *   ACCOUNT — nothing yet. Reserved for the stock-approval workflow.
 */

/** Roles assignable in Settings → Staff. Imported by the Zod schemas and the UI. */
export const ASSIGNABLE_ROLES = ['OWNER', 'CASHIER', 'CUTTER', 'SALES', 'ACCOUNT'] as const;

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: 'Owner',
  CASHIER: 'Cashier',
  CUTTER: 'Cutter',
  SALES: 'Sales',
  ACCOUNT: 'Account',
};

// ─── POS ──────────────────────────────────────────────────────────────────────

/** Search, product grid, cart, held sales, completing a sale. */
export function canUsePos(role: Role): boolean {
  return role === 'OWNER' || role === 'CASHIER';
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

/** Invoice list + detail, returns/refunds, delivery status. */
export function canViewInvoices(role: Role): boolean {
  return role === 'OWNER' || role === 'CASHIER';
}

// ─── Customers ────────────────────────────────────────────────────────────────

/** Customer list/detail/create/edit and recording credit payments. */
export function canManageCustomers(role: Role): boolean {
  return role === 'OWNER' || role === 'CASHIER';
}

// ─── Catalog ──────────────────────────────────────────────────────────────────

/** View, create, edit, adjust stock, print labels, upload images. */
export function canEditCatalog(role: Role): boolean {
  return role === 'OWNER' || role === 'CUTTER';
}

/**
 * Delete a catalog record. OWNER only, and deliberately not escalatable —
 * there is no manager-password path. Governs WHO may delete, independent of
 * WHEN (a Part with sales history is never deletable by anyone).
 */
export function canDeleteCatalog(role: Role): boolean {
  return role === 'OWNER';
}

/** Cost prices in the catalog follow catalog edit access. */
export function canViewCatalogCost(role: Role): boolean {
  return canEditCatalog(role);
}

// ─── Printing ─────────────────────────────────────────────────────────────────

/** Receipts and shipping labels — counter and packing staff. */
export function canPrintSalesDocs(role: Role): boolean {
  return role === 'OWNER' || role === 'CASHIER';
}

/** Barcode label sheets: catalog staff print them, POS staff reprint them. */
export function canPrintLabels(role: Role): boolean {
  return role === 'OWNER' || role === 'CASHIER' || role === 'CUTTER';
}

// ─── Locations ────────────────────────────────────────────────────────────────

/**
 * Reading shelf codes. Historically ungated (any authenticated user); kept open
 * to all three original roles so nothing changes for them, but closed to new ones.
 */
export function canReadLocations(role: Role): boolean {
  return role === 'OWNER' || role === 'CASHIER' || role === 'CUTTER';
}

// ─── Reports & settings ───────────────────────────────────────────────────────

export function canViewReports(role: Role): boolean {
  return role === 'OWNER';
}

export function canManageSettings(role: Role): boolean {
  return role === 'OWNER';
}

// ─── Landing ──────────────────────────────────────────────────────────────────

/** True when the role can reach at least one module. */
export function hasAnyModuleAccess(role: Role): boolean {
  return (
    canUsePos(role) ||
    canViewInvoices(role) ||
    canManageCustomers(role) ||
    canEditCatalog(role) ||
    canViewReports(role) ||
    canManageSettings(role)
  );
}

/**
 * Where a role lands after login, and where to send it when it hits a module
 * it may not use. Must never point at a page that redirects straight back —
 * roles with no modules go to /no-access, which is reachable by everyone.
 */
export function landingPathFor(role: Role): string {
  if (canUsePos(role)) return '/pos';
  if (role === 'CUTTER') return '/cut-issue';
  return '/no-access';
}
