import { AppNav } from '@/app/_components/AppNav';

export const metadata = { title: 'Reports — KGpos' };

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppNav />
      {children}
    </>
  );
}
