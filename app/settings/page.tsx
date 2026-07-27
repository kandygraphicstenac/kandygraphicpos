import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { SettingsClient } from './SettingsClient';

export const metadata = { title: 'Settings — KGpos' };

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role !== 'OWNER') redirect('/pos'); // CASHIER and CUTTER: no access

  return <SettingsClient />;
}
