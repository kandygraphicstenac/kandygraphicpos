import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';

export default async function RootPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role === 'CUTTER') redirect('/cut-issue');
  redirect('/pos');
}
