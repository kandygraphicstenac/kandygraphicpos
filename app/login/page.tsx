import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { LoginForm } from './LoginForm';

export const metadata = { title: 'Sign in — KGpos' };

const ERROR_MESSAGES: Record<string, string> = {
  not_provisioned: 'Account not provisioned or deactivated — contact the owner.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  // If there's a live Supabase session, decide what to do with it.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user: supabaseUser },
  } = await supabase.auth.getUser();

  if (supabaseUser) {
    const dbUser = await getCurrentUser();
    if (dbUser) redirect('/pos'); // properly provisioned — go to POS

    // Supabase session exists but no active public.User row.
    // Sign them out via the signout route (which can safely set cookies)
    // so the /login page renders cleanly with an error message.
    redirect('/api/auth/signout?error=not_provisioned');
  }

  const { error } = await searchParams;
  const initialError = error ? (ERROR_MESSAGES[error] ?? undefined) : undefined;

  return <LoginForm initialError={initialError} />;
}
