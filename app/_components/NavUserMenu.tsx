'use client';

import { useEffect, useRef, useState } from 'react';
import { logoutAction } from '@/app/_actions/auth';

type UserInfo = { name: string; email: string; role: string };

const ROLE_LABEL: Record<string, string> = {
  OWNER: 'Owner',
  CASHIER: 'Cashier',
  CUTTER: 'Cutter',
};

export function NavUserMenu({ user }: { user: UserInfo }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const initials = user.name
    .split(' ')
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div ref={ref} className="relative ml-2 shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 h-8 px-1.5 rounded-lg hover:bg-border transition-colors"
        aria-label="User menu"
      >
        <span className="w-6 h-6 rounded-full bg-accent text-accent-fg text-[10px] font-bold flex items-center justify-center select-none">
          {initials}
        </span>
        <span className="text-[12px] text-text-2 hidden sm:block max-w-[96px] truncate leading-none">
          {user.name}
        </span>
        <svg
          className={`w-3 h-3 text-text-3 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <path d="M2 4l4 4 4-4" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-52 bg-surface border border-border rounded-xl shadow-lg z-50 overflow-hidden">
          {/* User info header */}
          <div className="px-3 py-2.5 border-b border-border">
            <p className="text-[13px] font-medium text-text truncate">{user.name}</p>
            <p className="text-[11px] text-text-3 truncate">{user.email}</p>
            <p className="text-[10px] text-text-3 mt-0.5 font-medium uppercase tracking-wide">
              {ROLE_LABEL[user.role] ?? user.role}
            </p>
          </div>

          {/* Sign out */}
          <form
            action={logoutAction}
            onSubmit={() => setOpen(false)}
          >
            <button
              type="submit"
              className="w-full text-left px-3 py-2 text-[13px] text-danger-fg hover:bg-bg transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
