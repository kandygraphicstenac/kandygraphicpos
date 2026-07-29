import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { canManageSettings, landingPathFor } from '@/lib/permissions';
import { SettingsClient } from './SettingsClient';

export const metadata = { title: 'Settings — KGpos' };

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  // CASHIER, CUTTER, and any role with no modules: no access.
  if (!canManageSettings(user.role)) redirect(landingPathFor(user.role));

  return <SettingsClient />;
}
