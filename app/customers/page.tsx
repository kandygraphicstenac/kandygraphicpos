'use client';

import { useState, useCallback, useRef } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import type { CustomerRecord } from '@/lib/types/customer';
import { CustomerDrawer } from './CustomerDrawer';

type CustomersPage = {
  customers: CustomerRecord[];
  nextCursor: string | null;
};

export default function CustomersPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleSearch = useCallback((value: string) => {
    setQInput(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setQ(value.trim()), 300);
  }, []);

  const { data, fetchNextPage, hasNextPage, isFetching, isFetchingNextPage } =
    useInfiniteQuery<CustomersPage>({
      queryKey: ['customers', { q }],
      queryFn: async ({ pageParam }) => {
        const p = new URLSearchParams({ pageSize: '25' });
        if (q) p.set('q', q);
        if (pageParam) p.set('cursor', pageParam as string);
        const res = await fetch(`/api/customers?${p}`);
        if (!res.ok) throw new Error('Failed to fetch');
        return res.json();
      },
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      initialPageParam: undefined as string | undefined,
      staleTime: 30_000,
    });

  const allCustomers = data?.pages.flatMap((p) => p.customers) ?? [];

  function handleCreated() {
    setDrawerOpen(false);
    void queryClient.invalidateQueries({ queryKey: ['customers'] });
  }

  return (
    <div className="min-h-screen bg-bg text-text p-6">
      <div className="max-w-4xl mx-auto space-y-5">
        <header className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-semibold">Customers</h1>
            <p className="text-[13px] text-text-3 mt-0.5">Contacts, addresses, and purchase history</p>
          </div>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="h-9 px-4 rounded-lg bg-accent text-accent-fg text-[13px] font-medium
                       hover:opacity-90 transition-opacity duration-100 whitespace-nowrap"
          >
            + New customer
          </button>
        </header>

        {/* Search */}
        <div className="relative max-w-xs">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-3 pointer-events-none"
            viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
          >
            <circle cx="6.5" cy="6.5" r="4.5" />
            <path d="M10.5 10.5l3 3" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            placeholder="Search name or phone"
            value={qInput}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full pl-8 pr-3 h-9 bg-surface border border-border rounded-lg
                       text-[13px] text-text placeholder:text-text-3
                       focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent
                       transition-colors duration-100"
          />
          {isFetching && (
            <svg className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin w-3.5 h-3.5 text-text-3" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
        </div>

        {/* Table */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          {allCustomers.length === 0 && !isFetching ? (
            <div className="py-16 text-center text-text-3 text-[13px]">
              {q ? 'No customers match this search' : 'No customers yet'}
            </div>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border text-text-3 text-[11px] uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-medium">Name</th>
                  <th className="text-left px-4 py-3 font-medium">Phone</th>
                  <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">City</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Added</th>
                </tr>
              </thead>
              <tbody>
                {allCustomers.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => router.push(`/customers/${c.id}`)}
                    className="border-b border-border last:border-b-0 hover:bg-bg transition-colors duration-75 cursor-pointer"
                  >
                    <td className="px-4 py-3 font-medium text-text">
                      {c.name}
                      {!c.active && (
                        <span className="ml-1.5 inline-flex items-center h-5 px-1.5 rounded text-[10px] font-medium bg-border text-text-2">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-2 font-mono text-[12px]">{c.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-text-2 hidden sm:table-cell">{c.city ?? '—'}</td>
                    <td className="px-4 py-3 text-text-2 text-[12px] hidden md:table-cell">
                      {new Date(c.createdAt).toLocaleDateString('en-LK', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Colombo' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {hasNextPage && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => void fetchNextPage()}
              disabled={isFetchingNextPage}
              className="h-9 px-6 rounded-lg border border-border text-[13px] text-text-2
                         disabled:opacity-40 enabled:hover:border-border-hover enabled:hover:text-text
                         transition-colors duration-100"
            >
              {isFetchingNextPage ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </div>

      {drawerOpen && (
        <CustomerDrawer
          mode="create"
          onClose={() => setDrawerOpen(false)}
          onSaved={handleCreated}
        />
      )}
    </div>
  );
}
