import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { landingPathFor } from '@/lib/permissions';

export default async function RootPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  // OWNER/CASHIER → /pos, CUTTER → /cut-issue, roles with no modules → /no-access.
  redirect(landingPathFor(user.role));
}
