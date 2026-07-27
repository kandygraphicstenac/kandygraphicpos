import { Prisma, PrismaClient, Role } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import { prisma as defaultPrisma } from '../db';

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

/** Roles whose password can authorize a discount/refund. Extend with MANAGER if that role is added. */
const MANAGER_ROLES: Role[] = ['OWNER'];

const GRANT_TTL_MS = 5 * 60 * 1000; // 5 minutes, one-time use

export type AuthorizeAction = 'discount' | 'refund' | 'credit_payment';

/**
 * Verifies a password against every active manager-eligible user via a
 * throwaway Supabase Auth client (autoRefreshToken/persistSession: false).
 * This client is never wired to the request's cookies, so a successful or
 * failed check never touches the current cashier's session.
 *
 * No email field exists in the UI (manager just enters their password), so
 * each active manager-eligible user is tried in turn — fine for a small
 * shop with one or two owners.
 */
export async function verifyManagerPassword(
  password: string,
  db: PrismaClient = defaultPrisma,
): Promise<{ id: number; name: string } | null> {
  const managers = await db.user.findMany({
    where: { role: { in: MANAGER_ROLES }, active: true },
    select: { id: true, name: true, email: true },
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  for (const manager of managers) {
    const throwaway = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await throwaway.auth.signInWithPassword({
      email: manager.email,
      password,
    });
    if (!error && data.session) {
      return { id: manager.id, name: manager.name };
    }
  }
  return null;
}

/** Creates a one-time, short-lived authorization grant after a successful password check. */
export async function createAuthorizationGrant(
  input: { action: AuthorizeAction; authorizedById: number; reason: string },
  db: PrismaClient = defaultPrisma,
) {
  return db.managerAuthorization.create({
    data: {
      action: input.action,
      authorizedById: input.authorizedById,
      reason: input.reason,
      expiresAt: new Date(Date.now() + GRANT_TTL_MS),
    },
  });
}

/**
 * Consumes a one-time authorization grant inside an existing transaction.
 * Row-locks the grant first (mirrors the FOR UPDATE pattern used for stock
 * rows elsewhere) so concurrent requests can't both consume the same token.
 *
 * Never trusts a client-supplied authorizer id or reason — both are read
 * back from this DB row, which was only ever written by the authorize route
 * after a real password check.
 */
export async function consumeAuthorizationGrant(
  tx: Prisma.TransactionClient,
  input: { authToken: string | undefined; action: AuthorizeAction },
): Promise<{ authorizedById: number; reason: string }> {
  if (!input.authToken) {
    throw new AuthorizationError(`Manager authorization required for this ${input.action}`);
  }

  await tx.$executeRaw`SELECT id FROM "ManagerAuthorization" WHERE id = ${input.authToken} FOR UPDATE`;
  const grant = await tx.managerAuthorization.findUnique({ where: { id: input.authToken } });

  if (
    !grant ||
    grant.action !== input.action ||
    grant.usedAt !== null ||
    grant.expiresAt.getTime() < Date.now()
  ) {
    throw new AuthorizationError('Authorization invalid or expired — please re-authorize');
  }

  await tx.managerAuthorization.update({
    where: { id: grant.id },
    data: { usedAt: new Date() },
  });

  return { authorizedById: grant.authorizedById, reason: grant.reason };
}
