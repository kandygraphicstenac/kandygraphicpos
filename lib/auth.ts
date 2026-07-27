import { jwtVerify } from 'jose';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { Role } from '@prisma/client';
import { prisma } from './db';

export type { Role };

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: Role;
}

// ─── LRU user cache (keyed by Supabase JWT sub) ───────────────────────────────
// Skips the DB round-trip for repeat requests within the TTL window.
// Map preserves insertion order, so the first key is always the oldest entry.

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_MAX = 256;

type CacheEntry = { user: AuthUser; expiresAt: number };
const userCache = new Map<string, CacheEntry>();

function cacheGet(sub: string): AuthUser | null {
  const entry = userCache.get(sub);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { userCache.delete(sub); return null; }
  return entry.user;
}

function cacheSet(sub: string, user: AuthUser): void {
  if (userCache.size >= CACHE_MAX) {
    const oldest = userCache.keys().next().value;
    if (oldest !== undefined) userCache.delete(oldest);
  }
  userCache.set(sub, { user, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ─── Local JWT verification ───────────────────────────────────────────────────
// Replaces the network call to supabase.auth.getUser() with a local HMAC-SHA256
// verify using SUPABASE_JWT_SECRET (Settings → API → JWT Secret in your project).

const jwtSecret = process.env.SUPABASE_JWT_SECRET
  ? new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET)
  : null;

async function verifyToken(token: string): Promise<{ sub: string; email: string } | null> {
  if (!jwtSecret) {
    // Secret not configured: fall back to trusting the session (dev/misconfiguration guard)
    return null;
  }
  try {
    const { payload } = await jwtVerify(token, jwtSecret, { algorithms: ['HS256'] });
    const { sub, email } = payload;
    if (typeof sub !== 'string' || typeof email !== 'string') return null;
    return { sub, email };
  } catch {
    return null;
  }
}

// ─── getCurrentUser ───────────────────────────────────────────────────────────

/**
 * Resolves the authenticated user without a Supabase network call:
 *   1. Reads the session access token from the session cookie (local, no network).
 *   2. Verifies the JWT locally with SUPABASE_JWT_SECRET (local crypto).
 *   3. Returns the DB User from an in-memory LRU cache keyed by JWT sub (5-min TTL).
 *   4. On cache miss only, queries the DB and populates the cache.
 *
 * Add SUPABASE_JWT_SECRET to .env — found at Supabase Dashboard → Settings → API → JWT Secret.
 * Returns null for both unauthenticated users and authenticated users with no active DB row.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {}, // route handlers can't set cookies; proxy.ts handles refresh
      },
    },
  );

  // getSession() reads from the cookie only — no Supabase network call.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;

  // Verify the JWT locally. If SUPABASE_JWT_SECRET is unset, returns null
  // and we fall through to the legacy getUser() path below.
  const claims = await verifyToken(session.access_token);

  if (!claims) {
    // Fallback: SUPABASE_JWT_SECRET not set — use the network-verified path
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return null;
    return prisma.user.findUnique({
      where: { email: user.email, active: true },
      select: { id: true, email: true, name: true, role: true },
    });
  }

  // Cache hit: skip DB round-trip entirely
  const cached = cacheGet(claims.sub);
  if (cached) return cached;

  // DB lookup (only on cache miss or TTL expiry)
  const user = await prisma.user.findUnique({
    where: { email: claims.email, active: true },
    select: { id: true, email: true, name: true, role: true },
  });
  if (user) cacheSet(claims.sub, user);
  return user;
}

// ─── Route-handler helpers ────────────────────────────────────────────────────

export function unauthorizedResponse() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export function forbiddenResponse() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
