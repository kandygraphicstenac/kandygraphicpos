import { AppNav } from '@/app/_components/AppNav';

export default function InvoicesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppNav />
      {children}
    </>
  );
}
