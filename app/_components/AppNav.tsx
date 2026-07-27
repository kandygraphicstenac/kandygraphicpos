import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { NavLinks } from './NavLinks';
import { NavUserMenu } from './NavUserMenu';

export async function AppNav() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-40 bg-surface border-b border-border">
      <div className="max-w-7xl mx-auto px-4 h-12 flex items-center gap-1">
        <Link href="/pos" className="mr-3 shrink-0 flex items-center">
          <img
            src="/logos/kgpos-logo.png"
            alt="KGpos"
            className="h-7 w-auto dark:invert select-none"
          />
        </Link>

        <nav className="flex items-center gap-0.5 overflow-x-auto scrollbar-none flex-1 min-w-0">
          <NavLinks />
        </nav>

        {user && (
          <NavUserMenu user={{ name: user.name, email: user.email, role: user.role }} />
        )}
      </div>
    </header>
  );
}
