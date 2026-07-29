import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { canEditCatalog, canDeleteCatalog, landingPathFor } from '@/lib/permissions';
import { CatalogClientPage } from './_components/CatalogClientPage';

export const metadata = { title: 'Catalog — KGpos' };

export default async function CatalogPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  // OWNER + CUTTER. CASHIER has no catalog access.
  if (!canEditCatalog(user.role)) redirect(landingPathFor(user.role));

  // Resolved from the session server-side and passed down — the tabs must never
  // infer permissions themselves. Server routes re-check regardless.
  return <CatalogClientPage canDelete={canDeleteCatalog(user.role)} />;
}
