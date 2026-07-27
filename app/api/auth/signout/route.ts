import { type NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * GET /api/auth/signout?error=<key>
 *
 * Signs the current Supabase session out, then redirects to /login.
 * Used by the login page when it detects an authenticated Supabase session
 * that has no matching active public.User row (orphan or deactivated account).
 * Route handlers can safely set cookies; server components cannot.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  const { searchParams } = new URL(request.url);
  const error = searchParams.get('error');

  const loginUrl = new URL('/login', request.url);
  if (error) loginUrl.searchParams.set('error', error);

  return NextResponse.redirect(loginUrl);
}
