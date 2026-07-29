/**
 * Route-level authorization for the Catalog.
 *
 * These exercise the real route handlers with getCurrentUser mocked, because
 * hiding a button in the UI is presentation only — the security boundary is the
 * server-side role check in each handler. A CUTTER calling DELETE directly must
 * still receive a 403.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Role } from '@prisma/client';
import { NextRequest } from 'next/server';

// ── Mocks ────────────────────────────────────────────────────────────────────
// getCurrentUser is swapped per-test; the response helpers stay real so the
// tests assert on genuine status codes.
const mockGetCurrentUser = vi.fn();

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, getCurrentUser: () => mockGetCurrentUser() };
});

// Permissive DB stub: every call resolves to something harmless, so an
// authorized request gets past the gate and returns a non-403 status. These
// tests assert on authorization only, never on business behaviour.
vi.mock('@/lib/db', () => {
  const zero = () => Promise.resolve(0);
  const model = {
    count: vi.fn(zero),
    findMany: vi.fn(() => Promise.resolve([])),
    findUnique: vi.fn(() => Promise.resolve(null)),
    findFirst: vi.fn(() => Promise.resolve(null)),
    create: vi.fn(() => Promise.resolve({ id: 1 })),
    update: vi.fn(() => Promise.resolve({ id: 1 })),
    delete: vi.fn(() => Promise.resolve({ id: 1 })),
    deleteMany: vi.fn(() => Promise.resolve({ count: 0 })),
  };
  const prisma = {
    part: { ...model }, stickerSet: { ...model }, bikeModel: { ...model },
    location: { ...model }, stockTxn: { ...model }, invoiceItem: { ...model },
    setComponent: { ...model }, sheet: { ...model },
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

const req = (url = 'http://localhost/api/x') => new NextRequest(url);
const idParams = { params: Promise.resolve({ id: '1' }) };
const codeParams = { params: Promise.resolve({ code: 'A-1' }) };

beforeEach(() => { mockGetCurrentUser.mockReset(); });

// ── DELETE: OWNER only, on every catalog resource ────────────────────────────

describe('catalog DELETE routes reject CUTTER server-side', () => {
  it('parts', async () => {
    const { DELETE } = await import('@/app/api/catalog/parts/[id]/route');
    asRole('CUTTER');
    expect((await DELETE(req(), idParams)).status).toBe(403);
  });

  it('sets', async () => {
    const { DELETE } = await import('@/app/api/catalog/sets/[id]/route');
    asRole('CUTTER');
    expect((await DELETE(req(), idParams)).status).toBe(403);
  });

  it('bike models', async () => {
    const { DELETE } = await import('@/app/api/catalog/bike-models/[id]/route');
    asRole('CUTTER');
    expect((await DELETE(req(), idParams)).status).toBe(403);
  });

  it('locations', async () => {
    const { DELETE } = await import('@/app/api/locations/[code]/route');
    asRole('CUTTER');
    expect((await DELETE(req(), codeParams)).status).toBe(403);
  });
});

describe('catalog DELETE routes still allow OWNER', () => {
  it('parts', async () => {
    const { DELETE } = await import('@/app/api/catalog/parts/[id]/route');
    asRole('OWNER');
    expect((await DELETE(req(), idParams)).status).not.toBe(403);
  });

  it('sets', async () => {
    const { DELETE } = await import('@/app/api/catalog/sets/[id]/route');
    asRole('OWNER');
    expect((await DELETE(req(), idParams)).status).not.toBe(403);
  });

  it('bike models', async () => {
    const { DELETE } = await import('@/app/api/catalog/bike-models/[id]/route');
    asRole('OWNER');
    expect((await DELETE(req(), idParams)).status).not.toBe(403);
  });

  it('locations', async () => {
    const { DELETE } = await import('@/app/api/locations/[code]/route');
    asRole('OWNER');
    expect((await DELETE(req(), codeParams)).status).not.toBe(403);
  });
});

describe('catalog DELETE routes reject CASHIER (unchanged)', () => {
  it('parts', async () => {
    const { DELETE } = await import('@/app/api/catalog/parts/[id]/route');
    asRole('CASHIER');
    expect((await DELETE(req(), idParams)).status).toBe(403);
  });
});

// ── GET / POST / PATCH: OWNER + CUTTER, never CASHIER ────────────────────────

describe('CUTTER may read and write the catalog', () => {
  it('GET parts', async () => {
    const { GET } = await import('@/app/api/catalog/parts/route');
    asRole('CUTTER');
    expect((await GET(req('http://localhost/api/catalog/parts'))).status).not.toBe(403);
  });

  it('GET bike-model options', async () => {
    const { GET } = await import('@/app/api/catalog/bike-models/options/route');
    asRole('CUTTER');
    expect((await GET()).status).not.toBe(403);
  });

  it('PATCH a part', async () => {
    const { PATCH } = await import('@/app/api/catalog/parts/[id]/route');
    asRole('CUTTER');
    const r = new NextRequest('http://localhost/api/catalog/parts/1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Renamed' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect((await PATCH(r, idParams)).status).not.toBe(403);
  });

  it('PATCH a location', async () => {
    const { PATCH } = await import('@/app/api/locations/[code]/route');
    asRole('CUTTER');
    const r = new NextRequest('http://localhost/api/locations/A-1', {
      method: 'PATCH',
      body: JSON.stringify({ description: 'Top shelf' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect((await PATCH(r, codeParams)).status).not.toBe(403);
  });

  it('adjust part stock', async () => {
    const { POST } = await import('@/app/api/catalog/parts/[id]/adjust/route');
    asRole('CUTTER');
    const r = new NextRequest('http://localhost/api/catalog/parts/1/adjust', {
      method: 'POST',
      body: JSON.stringify({ delta: 5, reason: 'RECOUNT' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect((await POST(r, idParams)).status).not.toBe(403);
  });

  it('adjust set stock', async () => {
    const { POST } = await import('@/app/api/catalog/sets/[id]/adjust/route');
    asRole('CUTTER');
    const r = new NextRequest('http://localhost/api/catalog/sets/1/adjust', {
      method: 'POST',
      body: JSON.stringify({ delta: 2, reason: 'RECOUNT' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect((await POST(r, idParams)).status).not.toBe(403);
  });
});

describe('CASHIER catalog access is unchanged (blocked)', () => {
  it('GET parts', async () => {
    const { GET } = await import('@/app/api/catalog/parts/route');
    asRole('CASHIER');
    expect((await GET(req('http://localhost/api/catalog/parts'))).status).toBe(403);
  });

  it('GET bike-models list', async () => {
    const { GET } = await import('@/app/api/catalog/bike-models/route');
    asRole('CASHIER');
    expect((await GET(req('http://localhost/api/catalog/bike-models'))).status).toBe(403);
  });

  it('POST a set', async () => {
    const { POST } = await import('@/app/api/catalog/sets/route');
    asRole('CASHIER');
    const r = new NextRequest('http://localhost/api/catalog/sets', {
      method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' },
    });
    expect((await POST(r)).status).toBe(403);
  });
});

describe('unauthenticated requests are rejected', () => {
  it('401 on GET parts', async () => {
    const { GET } = await import('@/app/api/catalog/parts/route');
    mockGetCurrentUser.mockResolvedValue(null);
    expect((await GET(req('http://localhost/api/catalog/parts'))).status).toBe(401);
  });

  it('401 on DELETE part', async () => {
    const { DELETE } = await import('@/app/api/catalog/parts/[id]/route');
    mockGetCurrentUser.mockResolvedValue(null);
    expect((await DELETE(req(), idParams)).status).toBe(401);
  });
});
