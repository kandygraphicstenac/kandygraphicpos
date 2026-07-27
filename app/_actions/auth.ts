'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/db';

export type LoginState = { error: string } | undefined;

/**
 * Server action: sign in with email + password.
 * On success: redirects to /pos (throws NEXT_REDIRECT — handled by React).
 * On failure: returns { error: string } so the form can display it.
 *
 * Signature matches useActionState<LoginState, FormData>.
 */
export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = formData.get('email')?.toString().trim() ?? '';
  const password = formData.get('password')?.toString() ?? '';

  if (!email || !password) {
    return { error: 'Email and password are required.' };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Supabase error messages are user-friendly (e.g. "Invalid login credentials")
    return { error: error.message };
  }

  // Guard: Supabase accepted the credentials, but the account must also have
  // an active row in public.User. Without this check, orphan auth accounts
  // (or deactivated staff) would end up in an auth loop.
  const dbUser = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, active: true },
  });

  if (!dbUser) {
    await supabase.auth.signOut();
    return { error: 'Account not provisioned — contact the owner.' };
  }

  if (!dbUser.active) {
    await supabase.auth.signOut();
    return { error: 'Account deactivated — contact the owner.' };
  }

  redirect('/pos');
}

/**
 * Server action: sign out the current user and redirect to /login.
 * Called as a form action from NavUserMenu.
 */
export async function logoutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/login');
}
