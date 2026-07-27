import { createClient } from '@supabase/supabase-js';

/**
 * Returns a Supabase client authenticated with the service-role key.
 * Required for admin operations: creating users with passwords, deleting auth
 * accounts, etc.
 *
 * Add SUPABASE_SERVICE_ROLE_KEY to .env — found at:
 *   Supabase Dashboard → Project Settings → API → service_role (secret)
 *
 * Never expose this key client-side.
 */
export function getSupabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set. ' +
        'Add it from Supabase Dashboard → Project Settings → API → service_role.',
    );
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
