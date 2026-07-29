import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { canUsePos, landingPathFor } from '@/lib/permissions';
import { PosShell } from './_components/PosShell';

export const metadata = { title: 'POS — Kandy Graphics' };

export default async function PosPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  // CUTTER still goes to /cut-issue; roles with no modules go to /no-access.
  if (!canUsePos(user.role)) redirect(landingPathFor(user.role));

  return <PosShell user={user} />;
}
