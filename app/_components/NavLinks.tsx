'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';

type Me = { id: number; name: string; email: string; role: string };

export function NavLinks() {
  const pathname = usePathname();
  const { data: me } = useQuery<Me>({
    queryKey: ['me'],
    queryFn: () => fetch('/api/me').then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const role = me?.role ?? null;

  const links = [
    { href: '/pos',       label: 'POS',         roles: ['OWNER', 'CASHIER'] },
    { href: '/invoices',  label: 'Invoices',     roles: ['OWNER', 'CASHIER'] },
    { href: '/customers', label: 'Customers',    roles: ['OWNER', 'CASHIER'] },
    { href: '/catalog',   label: 'Catalog',      roles: ['OWNER'] },          // CASHIER: no catalog
    { href: '/cut-issue', label: 'Cut & Issue',  roles: ['OWNER', 'CUTTER'] },
    { href: '/sheets',    label: 'Sheets',       roles: ['OWNER', 'CUTTER'] },
    { href: '/reports',   label: 'Reports',      roles: ['OWNER'] },
    { href: '/settings',  label: 'Settings',     roles: ['OWNER'] },
  ].filter((l) => role === null || l.roles.includes(role));

  const linkCls = (href: string) => {
    const active = pathname === href || (href !== '/pos' && pathname.startsWith(href));
    return [
      'text-[13px] font-medium px-3 py-1.5 rounded-lg transition-colors duration-100 whitespace-nowrap',
      active
        ? 'bg-accent text-accent-fg'
        : 'text-text-2 hover:text-text hover:bg-border',
    ].join(' ');
  };

  return (
    <>
      {links.map((l) => (
        <Link key={l.href} href={l.href} className={linkCls(l.href)}>
          {l.label}
        </Link>
      ))}
    </>
  );
}
