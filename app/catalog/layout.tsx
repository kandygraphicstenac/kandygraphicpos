import { AppNav } from '@/app/_components/AppNav';

export const metadata = { title: 'Catalog — KGpos' };

export default function CatalogLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppNav />
      {children}
    </>
  );
}
