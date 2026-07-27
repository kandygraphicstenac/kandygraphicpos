import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, unauthorizedResponse } from '@/lib/auth';
import { AuthorizeBodySchema } from '@/lib/validators/auth';
import { verifyManagerPassword, createAuthorizationGrant } from '@/lib/services/authorizationService';
import { checkRateLimit } from '@/lib/utils/rateLimiter';

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 5 * 60 * 1000;

/**
 * POST /api/auth/authorize
 * Body: { password, action: 'discount' | 'refund', reason }
 *
 * Verifies the password belongs to an active manager-eligible user (OWNER)
 * WITHOUT touching the requesting cashier's session — see
 * authorizationService.verifyManagerPassword for how that isolation works.
 * On success, creates a one-time, 5-minute authorization grant. The grant id
 * (authToken), not the raw authorizedById, is what callers must pass through
 * to saleService/returnService — those re-verify server-side and never trust
 * a client-supplied authorizer id.
 *
 * Rate-limited per requesting (logged-in) user to slow down password guessing.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();

  if (!checkRateLimit(`authorize:${user.id}`, MAX_ATTEMPTS, WINDOW_MS)) {
    return NextResponse.json(
      { error: 'Too many attempts — wait a few minutes and try again' },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = AuthorizeBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const manager = await verifyManagerPassword(parsed.data.password);
  if (!manager) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
  }

  const grant = await createAuthorizationGrant({
    action: parsed.data.action,
    authorizedById: manager.id,
    reason: parsed.data.reason,
  });

  return NextResponse.json({
    authToken: grant.id,
    authorizedById: manager.id,
    authorizedByName: manager.name,
    reason: parsed.data.reason,
    expiresAt: grant.expiresAt.toISOString(),
  });
}
