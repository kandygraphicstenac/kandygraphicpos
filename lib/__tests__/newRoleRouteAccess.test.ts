/**
 * Server-side denial for the newly added SALES and ACCOUNT roles.
 *
 * These exercise the real route handlers. Before the allow-list conversion,
 * every route below was guarded by `if (role === 'CUTTER') return 403`, which
 * means "everyone except CUTTER" — so a freshly added role would have been
 * granted the POS sale endpoint, refunds and credit payments. These tests fail
 * loudly if a denylist guard is ever reintroduced.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Role } from '@prisma/client';
import { NextRequest } from 'next/server';

const mockGetCurrentUser = vi.fn();

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, getCurrentUser: () => mockGetCurrentUser() };
});

vi.mock('@/lib/db', () => {
  const model = {
    count: vi.fn(() => Promise.resolve(0)),
    findMany: vi.fn(() => Promise.resolve([])),
    findUnique: vi.fn(() => Promise.resolve(null)),
    findFirst: vi.fn(() => Promise.resolve(null)),
    create: vi.fn(() => Promise.resolve({ id: 1 })),
    update: vi.fn(() => Promise.resolve({ id: 1 })),
    upsert: vi.fn(() => Promise.resolve({ id: 1 })),
    delete: vi.fn(() => Promise.resolve({ id: 1 })),
    deleteMany: vi.fn(() => Promise.resolve({ count: 0 })),
  };
  const prisma = {
    part: { ...model }, stickerSet: { ...model }, bikeModel: { ...model },
    location: { ...model }, stockTxn: { ...model }, invoiceItem: { ...model },
    setComponent: { ...model }, sheet: { ...model }, invoice: { ...model },
    customer: { ...model }, heldSale: { ...model }, company: { ...model },
    appSetting: { ...model },
    $queryRaw: vi.fn(() => Promise.resolve([])),
    $transaction: vi.fn((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: unknown) => Promise<unknown>)(prisma)
        : Promise.resolve([[], 0]),
    ),
  };
  return { prisma, TXN_OPTIONS: { maxWait: 10_000, timeout: 20_000 } };
});

function asRole(role: Role) {
  mockGetCurrentUser.mockResolvedValue({ id: 1, email: 'a@b.c', name: 'T', role });
}

const NEW_ROLES: Role[] = ['SALES', 'ACCOUNT'];
const get = (url: string) => new NextRequest(url);
const post = (url: string, body: unknown = {}) =>
  new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

beforeEach(() => { mockGetCurrentUser.mockReset(); });

// Each entry: label → invoke the handler and return the response status.
const PROTECTED: { module: string; label: string; call: () => Promise<Response> }[] = [
  {
    module: 'POS', label: 'GET /api/pos/search',
    call: async () => (await import('@/app/api/pos/search/route'))
      .GET(get('http://localhost/api/pos/search')),
  },
  {
    module: 'POS', label: 'GET /api/pos/filters',
    call: async () => (await import('@/app/api/pos/filters/route')).GET(),
  },
  {
    module: 'POS', label: 'POST /api/pos/sale',
    call: async () => (await import('@/app/api/pos/sale/route'))
      .POST(post('http://localhost/api/pos/sale')),
  },
  {
    module: 'POS', label: 'GET /api/pos/hold',
    call: async () => (await import('@/app/api/pos/hold/route')).GET(),
  },
  {
    module: 'Invoices', label: 'GET /api/invoices',
    call: async () => (await import('@/app/api/invoices/route'))
      .GET(get('http://localhost/api/invoices')),
  },
  {
    module: 'Invoices', label: 'POST /api/invoices/[id]/return',
    call: async () => (await import('@/app/api/invoices/[id]/return/route'))
      .POST(post('http://localhost/api/invoices/KG-1/return'), { params: Promise.resolve({ id: 'KG-1' }) }),
  },
  {
    module: 'Customers', label: 'GET /api/customers',
    call: async () => (await import('@/app/api/customers/route'))
      .GET(get('http://localhost/api/customers')),
  },
  {
    module: 'Customers', label: 'POST /api/customers/[id]/payments',
    call: async () => (await import('@/app/api/customers/[id]/payments/route'))
      .POST(post('http://localhost/api/customers/1/payments'), { params: Promise.resolve({ id: '1' }) }),
  },
  {
    module: 'Catalog', label: 'GET /api/catalog/parts',
    call: async () => (await import('@/app/api/catalog/parts/route'))
      .GET(get('http://localhost/api/catalog/parts')),
  },
  {
    module: 'Catalog', label: 'GET /api/catalog/bike-models/options',
    call: async () => (await import('@/app/api/catalog/bike-models/options/route')).GET(),
  },
  {
    module: 'Catalog', label: 'GET /api/locations',
    call: async () => (await import('@/app/api/locations/route'))
      .GET(get('http://localhost/api/locations')),
  },
  {
    module: 'Catalog', label: 'GET /api/locations/options',
    call: async () => (await import('@/app/api/locations/options/route')).GET(),
  },
  {
    module: 'Reports', label: 'GET /api/reports/summary',
    call: async () => (await import('@/app/api/reports/summary/route'))
      .GET(get('http://localhost/api/reports/summary')),
  },
  {
    module: 'Reports', label: 'GET /api/reports/receivables',
    call: async () => (await import('@/app/api/reports/receivables/route'))
      .GET(get('http://localhost/api/reports/receivables')),
  },
  {
    module: 'Settings', label: 'GET /api/settings/discount-threshold',
    call: async () => (await import('@/app/api/settings/discount-threshold/route')).GET(),
  },
  {
    module: 'Settings', label: 'GET /api/admin/users',
    call: async () => (await import('@/app/api/admin/users/route')).GET(),
  },
];

// ── Label format: readable by everyone who prints, writable by OWNER only ────
// It describes the shop's one printer, so CASHIER/CUTTER must be able to READ
// it without Settings access — but must not be able to change how the whole
// shop prints.

describe('label format is readable by every authenticated role', () => {
  for (const role of ['OWNER', 'CASHIER', 'CUTTER', 'SALES', 'ACCOUNT'] as Role[]) {
    it(`${role} can GET it`, async () => {
      const { GET } = await import('@/app/api/settings/label-format/route');
      asRole(role);
      expect((await GET()).status).not.toBe(403);
    });
  }
});

describe('only OWNER may change the shop-wide label format', () => {
  const put = () => new NextRequest('http://localhost/api/settings/label-format', {
    method: 'PUT',
    body: JSON.stringify({ format: 'a4' }),
    headers: { 'Content-Type': 'application/json' },
  });

  for (const role of ['CASHIER', 'CUTTER', 'SALES', 'ACCOUNT'] as Role[]) {
    it(`${role} gets 403`, async () => {
      const { PUT } = await import('@/app/api/settings/label-format/route');
      asRole(role);
      expect((await PUT(put())).status).toBe(403);
    });
  }

  it('OWNER is allowed', async () => {
    const { PUT } = await import('@/app/api/settings/label-format/route');
    asRole('OWNER');
    expect((await PUT(put())).status).not.toBe(403);
  });

  it('unauthenticated gets 401', async () => {
    const { PUT } = await import('@/app/api/settings/label-format/route');
    mockGetCurrentUser.mockResolvedValue(null);
    expect((await PUT(put())).status).toBe(401);
  });
});

for (const role of NEW_ROLES) {
  describe(`${role} is refused by every module endpoint`, () => {
    for (const { module, label, call } of PROTECTED) {
      it(`${module} — ${label}`, async () => {
        asRole(role);
        expect((await call()).status).toBe(403);
      });
    }
  });
}

describe('the same endpoints still admit the roles that had them', () => {
  it('CASHIER keeps POS', async () => {
    const { POST } = await import('@/app/api/pos/sale/route');
    asRole('CASHIER');
    expect((await POST(post('http://localhost/api/pos/sale'))).status).not.toBe(403);
  });

  it('CASHIER keeps invoices', async () => {
    const { GET } = await import('@/app/api/invoices/route');
    asRole('CASHIER');
    expect((await GET(get('http://localhost/api/invoices'))).status).not.toBe(403);
  });

  it('CASHIER keeps customers', async () => {
    const { GET } = await import('@/app/api/customers/route');
    asRole('CASHIER');
    expect((await GET(get('http://localhost/api/customers'))).status).not.toBe(403);
  });

  it('CUTTER keeps the catalog', async () => {
    const { GET } = await import('@/app/api/catalog/parts/route');
    asRole('CUTTER');
    expect((await GET(get('http://localhost/api/catalog/parts'))).status).not.toBe(403);
  });

  it('CUTTER is still refused the POS', async () => {
    const { POST } = await import('@/app/api/pos/sale/route');
    asRole('CUTTER');
    expect((await POST(post('http://localhost/api/pos/sale'))).status).toBe(403);
  });

  it('OWNER keeps reports', async () => {
    const { GET } = await import('@/app/api/reports/summary/route');
    asRole('OWNER');
    expect((await GET(get('http://localhost/api/reports/summary'))).status).not.toBe(403);
  });
});

describe('new roles can still authenticate', () => {
  for (const role of NEW_ROLES) {
    it(`${role} resolves to a session user`, async () => {
      asRole(role);
      const user = await mockGetCurrentUser();
      expect(user).toMatchObject({ role, email: 'a@b.c' });
    });
  }
});
