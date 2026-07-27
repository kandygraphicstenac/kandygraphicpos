import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { CatalogClientPage } from './_components/CatalogClientPage';

export const metadata = { title: 'Catalog — KGpos' };

export default async function CatalogPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role !== 'OWNER') redirect('/pos'); // CASHIER and CUTTER: no access

  return <CatalogClientPage />;
}
