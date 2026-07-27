import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// @supabase/ssr v0.6 doesn't propagate the setAll callback parameter type
// through TypeScript strict-mode inference — annotate explicitly.
type CookieEntry = { name: string; value: string; options?: Record<string, unknown> };

/**
 * Proxy responsibilities (formerly the `middleware` file convention —
 * renamed in Next.js 16, see https://nextjs.org/docs/messages/middleware-to-proxy):
 *   1. Refresh the Supabase session cookie (PKCE token rotation) on every request.
 *   2. Redirect unauthenticated users to /login for page routes.
 *   3. Redirect authenticated users away from /login to /pos.
 *   4. API routes are not redirected — route handlers return 401 JSON.
 *
 * DEV_SKIP_AUTH=true bypasses everything (development only).
 */
export async function proxy(request: NextRequest) {
  if (
    process.env.DEV_SKIP_AUTH === 'true' &&
    process.env.NODE_ENV !== 'production'
  ) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  // Build a mutable response so Supabase can set refreshed session cookies.
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieEntry[]) {
          // Mirror cookies onto the request so downstream handlers see them.
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as Record<string, unknown>),
          );
        },
      },
    },
  );

  // IMPORTANT: do NOT add code between createServerClient and getUser().
  // getUser() both validates and refreshes the session.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // API routes: don't redirect — each route handler returns 401 JSON.
  if (pathname.startsWith('/api/')) {
    return supabaseResponse;
  }

  // /login: always pass through — the page itself redirects authenticated users
  // to /pos, and handles orphan Supabase sessions that have no active DB row.
  if (pathname.startsWith('/login')) {
    return supabaseResponse;
  }

  // All other pages: require authentication.
  if (!user) {
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/') loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}

export const config = {
  // Run on all routes except static assets and Next.js internals.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
