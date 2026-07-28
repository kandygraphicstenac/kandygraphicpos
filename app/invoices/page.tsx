'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { CompanyRecord } from '@/lib/types/company';
import {
  DELIVERY_STATUS_FLOW,
  DELIVERY_STATUS_LABELS,
  DELIVERY_STATUS_STYLES,
  nextDeliveryStatus,
  type DeliveryStatusValue,
} from '@/lib/constants/delivery';

type Me = { id: number; name: string; email: string; role: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

const LKR = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' });

function colomboMidnight(ymd: string): Date {
  return new Date(`${ymd}T00:00:00+05:30`);
}
function todayYMD(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Colombo' });
}
function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00+05:30`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Colombo' });
}
function firstOfMonthYMD(): string {
  const today = todayYMD();
  return today.slice(0, 8) + '01';
}

type DateRange = { dateFrom: string; dateTo: string } | null;

function presetRange(preset: string): DateRange {
  const today = todayYMD();
  switch (preset) {
    case 'today':
      return {
        dateFrom: colomboMidnight(today).toISOString(),
        dateTo: colomboMidnight(addDays(today, 1)).toISOString(),
      };
    case 'yesterday':
      return {
        dateFrom: colomboMidnight(addDays(today, -1)).toISOString(),
        dateTo: colomboMidnight(today).toISOString(),
      };
    case '7d':
      return {
        dateFrom: colomboMidnight(addDays(today, -7)).toISOString(),
        dateTo: colomboMidnight(addDays(today, 1)).toISOString(),
      };
    case 'month':
      return {
        dateFrom: colomboMidnight(firstOfMonthYMD()).toISOString(),
        dateTo: colomboMidnight(addDays(today, 1)).toISOString(),
      };
    default:
      return null;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type InvoiceRow = {
  id: string;
  createdAt: string;
  total: string;
  payment: string;
  status: string;
  orderType: 'COUNTER' | 'DELIVERY';
  deliveryStatus: DeliveryStatusValue | null;
  company: { id: number; code: string };
  _count: { items: number };
};

type InvoicesPage = {
  invoices: InvoiceRow[];
  nextCursor: string | null;
};

const STATUS_STYLES: Record<string, string> = {
  PAID: 'bg-ok-bg text-ok-fg',
  HELD: 'bg-warn-bg text-warn-fg',
  REFUNDED: 'bg-danger-bg text-danger-fg',
  PARTIAL_REFUND: 'bg-warn-bg text-warn-fg',
};
const STATUS_LABELS: Record<string, string> = {
  PAID: 'Paid',
  HELD: 'Held',
  REFUNDED: 'Refunded',
  PARTIAL_REFUND: 'Part Refund',
};
const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  BANK_TRANSFER: 'Bank',
  SPLIT: 'Split',
};

const ORDER_TYPE_LABELS: Record<'COUNTER' | 'DELIVERY', string> = {
  COUNTER: 'Counter',
  DELIVERY: 'Delivery',
};

const DATE_PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: '7 days' },
  { key: 'month', label: 'This month' },
  { key: 'custom', label: 'Custom' },
] as const;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InvoicesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: me } = useQuery<Me>({
    queryKey: ['me'],
    queryFn: () => fetch('/api/me').then((r) => r.json()),
    staleTime: 5 * 60_000,
    retry: false,
  });
  // CASHIER gets a scoped view (today only, optional "my sales"); date range
  // browsing is OWNER-only. This is UX only — the server enforces the same
  // scoping independently and ignores any dateFrom/dateTo a CASHIER sends.
  const isCashier = me?.role === 'CASHIER';

  const [company, setCompany] = useState<string | null>(null);
  const [preset, setPreset] = useState<string | null>(null);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [mine, setMine] = useState(false);
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [orderType, setOrderType] = useState<'COUNTER' | 'DELIVERY' | null>(null);
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatusValue | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  useEffect(() => {
    fetch('/api/companies')
      .then((r) => r.json())
      .then(setCompanies)
      .catch(() => {});
  }, []);

  const dateRange: DateRange =
    preset === 'custom'
      ? customFrom && customTo
        ? {
            dateFrom: colomboMidnight(customFrom).toISOString(),
            dateTo: colomboMidnight(addDays(customTo, 1)).toISOString(),
          }
        : null
      : preset
        ? presetRange(preset)
        : null;

  const { data, fetchNextPage, hasNextPage, isFetching, isFetchingNextPage } =
    useInfiniteQuery<InvoicesPage>({
      queryKey: ['invoices', { company, q, mine, orderType, deliveryStatus, dateRange: isCashier ? null : dateRange }],
      queryFn: async ({ pageParam }) => {
        const p = new URLSearchParams({ pageSize: '25' });
        if (company) p.set('company', company);
        if (q) p.set('q', q);
        if (orderType) p.set('orderType', orderType);
        if (deliveryStatus) p.set('deliveryStatus', deliveryStatus);
        if (isCashier) {
          // Never send a date range as CASHIER — the list is locked to today
          // server-side regardless. "My sales" is the only extra scoping knob.
          if (mine) p.set('mine', 'true');
        } else {
          if (dateRange?.dateFrom) p.set('dateFrom', dateRange.dateFrom);
          if (dateRange?.dateTo) p.set('dateTo', dateRange.dateTo);
        }
        if (pageParam) p.set('cursor', pageParam as string);
        const res = await fetch(`/api/invoices?${p}`);
        if (!res.ok) throw new Error('Failed to fetch');
        return res.json();
      },
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      initialPageParam: undefined as string | undefined,
      staleTime: 30_000,
    });

  const allInvoices = data?.pages.flatMap((p) => p.invoices) ?? [];

  const advanceStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: DeliveryStatusValue }) => {
      const res = await fetch(`/api/invoices/${encodeURIComponent(id)}/delivery-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Failed to update delivery status');
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
  });

  const handleSearch = useCallback((value: string) => {
    setQInput(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setQ(value.trim()), 300);
  }, []);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && qInput.trim()) {
      router.push(`/invoices/${encodeURIComponent(qInput.trim())}`);
    }
  };

  const chipCls = (active: boolean) =>
    [
      'h-8 px-3 rounded-full text-[12px] font-medium transition-colors duration-100 whitespace-nowrap',
      active
        ? 'bg-accent text-accent-fg'
        : 'border border-border text-text-2 hover:border-border-hover hover:text-text',
    ].join(' ');

  return (
    <div className="min-h-screen bg-bg text-text p-6">
      <div className="max-w-5xl mx-auto space-y-5">
        <header>
          <h1 className="text-[20px] font-semibold">{isCashier ? "Today's sales" : 'Invoices'}</h1>
          {isCashier && (
            <p className="text-[13px] text-text-3 mt-0.5">
              Search by invoice number to find and open any past sale.
            </p>
          )}
        </header>

        {/* ── Filters ── */}
        <div className="space-y-3">
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
              placeholder="Invoice # — Enter to open"
              value={qInput}
              onChange={(e) => handleSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="w-full pl-8 pr-3 h-9 bg-surface border border-border rounded-lg
                         text-[13px] text-text placeholder:text-text-3
                         focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent
                         transition-colors duration-100"
            />
          </div>

          {/* Company chips */}
          <div className="flex items-center flex-wrap gap-2">
            <button type="button" onClick={() => setCompany(null)} className={chipCls(company === null)}>
              All
            </button>
            {companies.map((c) => (
              <button key={c.id} type="button" onClick={() => setCompany(c.code)} className={chipCls(company === c.code)}>
                {c.code}
              </button>
            ))}
          </div>

          {/* Date scope — CASHIER: locked to today + optional "my sales" toggle.
              OWNER: full date-range browsing (all dates / presets / custom). */}
          {isCashier ? (
            <div className="flex items-center flex-wrap gap-2">
              <span className={chipCls(true) + ' cursor-default'}>Today</span>
              <button
                type="button"
                onClick={() => setMine((v) => !v)}
                className={chipCls(mine)}
              >
                My sales only
              </button>
              {isFetching && (
                <svg className="animate-spin w-4 h-4 text-text-3 ml-1 shrink-0" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center flex-wrap gap-2">
                <button type="button" onClick={() => setPreset(null)} className={chipCls(preset === null)}>
                  All dates
                </button>
                {DATE_PRESETS.map(({ key, label }) => (
                  <button key={key} type="button" onClick={() => setPreset(key)} className={chipCls(preset === key)}>
                    {label}
                  </button>
                ))}
                {isFetching && (
                  <svg className="animate-spin w-4 h-4 text-text-3 ml-1 shrink-0" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
              </div>

              {/* Custom date inputs */}
              {preset === 'custom' && (
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="h-9 px-2 bg-surface border border-border rounded-lg text-[13px] text-text
                               focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
                  />
                  <span className="text-text-3 text-[13px]">→</span>
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="h-9 px-2 bg-surface border border-border rounded-lg text-[13px] text-text
                               focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
                  />
                </div>
              )}
            </>
          )}

          {/* Order type chips */}
          <div className="flex items-center flex-wrap gap-2">
            <button type="button" onClick={() => setOrderType(null)} className={chipCls(orderType === null)}>
              All orders
            </button>
            <button type="button" onClick={() => setOrderType('COUNTER')} className={chipCls(orderType === 'COUNTER')}>
              {ORDER_TYPE_LABELS.COUNTER}
            </button>
            <button type="button" onClick={() => setOrderType('DELIVERY')} className={chipCls(orderType === 'DELIVERY')}>
              {ORDER_TYPE_LABELS.DELIVERY}
            </button>
          </div>

          {/* Delivery status chips — only meaningful for delivery rows */}
          <div className="flex items-center flex-wrap gap-2">
            <button type="button" onClick={() => setDeliveryStatus(null)} className={chipCls(deliveryStatus === null)}>
              Any status
            </button>
            {DELIVERY_STATUS_FLOW.map((s) => (
              <button key={s} type="button" onClick={() => setDeliveryStatus(s)} className={chipCls(deliveryStatus === s)}>
                {DELIVERY_STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {/* ── Table ── */}
        {/* overflow-x-auto (not -hidden) so a narrow window scrolls the table
            instead of silently clipping the Total column. */}
        <div className="bg-surface border border-border rounded-xl overflow-x-auto">
          {allInvoices.length === 0 && !isFetching ? (
            <div className="py-16 text-center text-text-3 text-[13px]">
              {q || company || preset || mine || orderType || deliveryStatus
                ? 'No invoices match these filters'
                : isCashier
                  ? 'No sales yet today'
                  : 'No invoices yet'}
            </div>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border text-text-3 text-[11px] uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-medium">Invoice</th>
                  <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Date / Time</th>
                  <th className="text-left px-4 py-3 font-medium">Co</th>
                  <th className="text-right px-4 py-3 font-medium hidden sm:table-cell">Items</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Payment</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Delivery</th>
                  <th className="text-right px-4 py-3 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {allInvoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="border-b border-border last:border-b-0 hover:bg-bg transition-colors duration-75"
                  >
                    <td className="px-4 py-3 font-mono text-[12px] text-text">
                      <Link
                        href={`/invoices/${encodeURIComponent(inv.id)}`}
                        className="hover:underline underline-offset-2"
                      >
                        {inv.id}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-text-2 tabular-nums text-[12px] whitespace-nowrap hidden sm:table-cell">
                      {new Date(inv.createdAt).toLocaleString('en-LK', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: 'numeric', minute: '2-digit', hour12: true,
                        timeZone: 'Asia/Colombo',
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center h-5 px-2 rounded text-[10px] font-semibold tracking-wide bg-border text-text-2">
                        {inv.company.code}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-text-2 tabular-nums hidden sm:table-cell">
                      {inv._count.items}
                    </td>
                    <td className="px-4 py-3 text-text-2 hidden md:table-cell">
                      {PAYMENT_LABELS[inv.payment] ?? inv.payment}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center h-5 px-2 rounded text-[10px] font-medium ${STATUS_STYLES[inv.status] ?? 'bg-border text-text-2'}`}>
                        {STATUS_LABELS[inv.status] ?? inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {inv.orderType === 'DELIVERY' && inv.deliveryStatus ? (
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-flex items-center h-5 px-2 rounded text-[10px] font-medium whitespace-nowrap ${DELIVERY_STATUS_STYLES[inv.deliveryStatus]}`}>
                            {DELIVERY_STATUS_LABELS[inv.deliveryStatus]}
                          </span>
                          {nextDeliveryStatus(inv.deliveryStatus) && (
                            <button
                              type="button"
                              disabled={advanceStatus.isPending}
                              onClick={() => {
                                const next = nextDeliveryStatus(inv.deliveryStatus!);
                                if (next) advanceStatus.mutate({ id: inv.id, status: next });
                              }}
                              className="text-[11px] text-accent hover:underline underline-offset-2 disabled:opacity-40 whitespace-nowrap"
                            >
                              → {DELIVERY_STATUS_LABELS[nextDeliveryStatus(inv.deliveryStatus)!]}
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-text-3 text-[11px]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">
                      {LKR.format(parseFloat(inv.total))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Load more ── */}
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
    </div>
  );
}
