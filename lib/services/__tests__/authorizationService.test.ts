import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import {
  verifyManagerPassword,
  consumeAuthorizationGrant,
  AuthorizationError,
} from '../authorizationService';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

const mockedCreateClient = createClient as unknown as ReturnType<typeof vi.fn>;

function buildMockUserDb(managers: Array<{ id: number; name: string; email: string }>) {
  return {
    user: { findMany: vi.fn().mockResolvedValue(managers) },
  } as unknown as import('@prisma/client').PrismaClient;
}

beforeEach(() => {
  mockedCreateClient.mockReset();
});

describe('verifyManagerPassword', () => {
  it('returns null when the password matches no active manager (wrong password rejected)', async () => {
    const db = buildMockUserDb([{ id: 1, name: 'Owner One', email: 'owner@example.com' }]);
    mockedCreateClient.mockReturnValue({
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({
          data: { session: null },
          error: { message: 'Invalid login credentials' },
        }),
      },
    });

    const result = await verifyManagerPassword('wrong-password', db);
    expect(result).toBeNull();
  });

  it('returns the manager id/name when the password matches an active OWNER', async () => {
    const db = buildMockUserDb([{ id: 1, name: 'Owner One', email: 'owner@example.com' }]);
    mockedCreateClient.mockReturnValue({
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({
          data: { session: { access_token: 'x' } },
          error: null,
        }),
      },
    });

    const result = await verifyManagerPassword('correct-password', db);
    expect(result).toEqual({ id: 1, name: 'Owner One' });
  });

  it('only queries active manager-eligible users (never CASHIER/CUTTER)', async () => {
    const db = buildMockUserDb([]);
    mockedCreateClient.mockReturnValue({ auth: { signInWithPassword: vi.fn() } });

    await verifyManagerPassword('anything', db);

    expect(db.user.findMany).toHaveBeenCalledWith({
      where: { role: { in: ['OWNER'] }, active: true },
      select: { id: true, name: true, email: true },
    });
  });
});

describe('consumeAuthorizationGrant', () => {
  function buildMockTx(grant: unknown) {
    return {
      $executeRaw: vi.fn().mockResolvedValue(0),
      managerAuthorization: {
        findUnique: vi.fn().mockResolvedValue(grant),
        update: vi.fn().mockResolvedValue({}),
      },
    } as unknown as import('@prisma/client').Prisma.TransactionClient;
  }

  it('throws AuthorizationError when no authToken is supplied', async () => {
    const tx = buildMockTx(null);
    await expect(
      consumeAuthorizationGrant(tx, { authToken: undefined, action: 'discount' }),
    ).rejects.toThrow(AuthorizationError);
  });

  it('throws AuthorizationError when the grant does not exist', async () => {
    const tx = buildMockTx(null);
    await expect(
      consumeAuthorizationGrant(tx, { authToken: 'missing', action: 'discount' }),
    ).rejects.toThrow(/invalid or expired/i);
  });

  it('throws AuthorizationError when the grant has already been used', async () => {
    const tx = buildMockTx({
      id: 'tok1', action: 'discount', authorizedById: 1, reason: 'x',
      usedAt: new Date(), expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(
      consumeAuthorizationGrant(tx, { authToken: 'tok1', action: 'discount' }),
    ).rejects.toThrow(AuthorizationError);
  });

  it('throws AuthorizationError when the grant has expired', async () => {
    const tx = buildMockTx({
      id: 'tok1', action: 'discount', authorizedById: 1, reason: 'x',
      usedAt: null, expiresAt: new Date(Date.now() - 1000),
    });
    await expect(
      consumeAuthorizationGrant(tx, { authToken: 'tok1', action: 'discount' }),
    ).rejects.toThrow(AuthorizationError);
  });

  it('throws AuthorizationError when the grant action does not match', async () => {
    const tx = buildMockTx({
      id: 'tok1', action: 'refund', authorizedById: 1, reason: 'x',
      usedAt: null, expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(
      consumeAuthorizationGrant(tx, { authToken: 'tok1', action: 'discount' }),
    ).rejects.toThrow(AuthorizationError);
  });

  it('returns authorizedById/reason and marks the grant used on success', async () => {
    const tx = buildMockTx({
      id: 'tok1', action: 'discount', authorizedById: 9, reason: 'Loyal customer',
      usedAt: null, expiresAt: new Date(Date.now() + 60_000),
    });

    const result = await consumeAuthorizationGrant(tx, { authToken: 'tok1', action: 'discount' });

    expect(result).toEqual({ authorizedById: 9, reason: 'Loyal customer' });
    expect(tx.managerAuthorization.update).toHaveBeenCalledWith({
      where: { id: 'tok1' },
      data: { usedAt: expect.any(Date) },
    });
  });
});
