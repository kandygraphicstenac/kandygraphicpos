import { AppNav } from '@/app/_components/AppNav';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppNav />
      {children}
    </>
  );
}
