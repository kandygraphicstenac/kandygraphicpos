import { AppNav } from '@/app/_components/AppNav';

export default function CustomersLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppNav />
      {children}
    </>
  );
}
