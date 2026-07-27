import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { PosShell } from './_components/PosShell';

export const metadata = { title: 'POS — Kandy Graphics' };

export default async function PosPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role === 'CUTTER') redirect('/cut-issue');

  return <PosShell user={user} />;
}
