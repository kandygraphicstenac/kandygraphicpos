import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// @supabase/ssr v0.6 doesn't propagate the setAll callback parameter type through
// TypeScript's inference in strict mode, so we annotate it explicitly here.
type CookieEntry = { name: string; value: string; options?: Record<string, unknown> };

/**
 * Creates a Supabase client for use in server components, server actions, and
 * route handlers. Reads AND writes cookies (needed for session refresh /
 * sign-in / sign-out). proxy.ts handles refresh for page routes; this
 * client handles it inside server actions.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieEntry[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              cookieStore.set(name, value, options as any),
            );
          } catch {
            // setAll was called from a Server Component (render), where cookie
            // writes aren't allowed. Safe to ignore — proxy.ts already
            // refreshes the session on every request, so this client never
            // needs to write cookies itself in that context.
          }
        },
      },
    },
  );
}
