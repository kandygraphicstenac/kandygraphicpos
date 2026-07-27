'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { CompanyRecord } from '@/lib/types/company';
import type { SummaryResponse } from '@/app/api/reports/summary/route';
import type { ByCompanyResponse } from '@/app/api/reports/by-company/route';
import type { PaymentMixResponse } from '@/app/api/reports/payment-mix/route';
import type { BestSellersResponse } from '@/app/api/reports/best-sellers/route';
import type { LowStockResponse } from '@/app/api/reports/low-stock/route';
import type { DeadStockResponse } from '@/app/api/reports/dead-stock/route';
import type { DailyBreakdownResponse, DailyBreakdownRow } from '@/app/api/reports/daily-breakdown/route';
import type { DiscountsReportResponse } from '@/app/api/reports/discounts/route';
import type { RefundsReportResponse } from '@/app/api/reports/refunds/route';
import type { ReceivablesResponse } from '@/app/api/reports/receivables/route';
import Link from 'next/link';

// ─── Date helpers ─────────────────────────────────────────────────────────────

const LKR = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' });
function lkr(v: string | number) { return LKR.format(typeof v === 'string' ? parseFloat(v) : v); }

function todayYMD() { return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Colombo' }); }
function colomboMidnight(ymd: string) { return new Date(`${ymd}T00:00:00+05:30`); }
function addDays(ymd: string, n: number) {
  const d = new Date(`${ymd}T00:00:00+05:30`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Colombo' });
}
function firstOfMonth() { return todayYMD().slice(0, 8) + '01'; }

type DateRange = { dateFrom: string; dateTo: string };

function presetRange(key: string): DateRange | null {
  const today = todayYMD();
  switch (key) {
    case 'today':
      return { dateFrom: colomboMidnight(today).toISOString(), dateTo: colomboMidnight(addDays(today, 1)).toISOString() };
    case 'yesterday':
      return { dateFrom: colomboMidnight(addDays(today, -1)).toISOString(), dateTo: colomboMidnight(today).toISOString() };
    case '7d':
      return { dateFrom: colomboMidnight(addDays(today, -7)).toISOString(), dateTo: colomboMidnight(addDays(today, 1)).toISOString() };
    case 'month':
      return { dateFrom: colomboMidnight(firstOfMonth()).toISOString(), dateTo: colomboMidnight(addDays(today, 1)).toISOString() };
    default:
      return null;
  }
}

const DATE_PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: '7 days' },
  { key: 'month', label: 'This month' },
  { key: 'custom', label: 'Custom' },
] as const;

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  BANK_TRANSFER: 'Bank transfer',
  CREDIT: 'Credit',
  SPLIT: 'Split',
};

const AGING_LABELS: Record<string, string> = { current: 'Current', '30+': '30+ days', '60+': '60+ days' };
const AGING_STYLES: Record<string, string> = {
  current: 'bg-border text-text-2',
  '30+': 'bg-warn-bg text-warn-fg',
  '60+': 'bg-danger-bg text-danger-fg',
};

// ─── CSV export ───────────────────────────────────────────────────────────────

function downloadCsv(rows: DailyBreakdownRow[], label: string) {
  const headers = ['Date', 'Invoices', 'Gross (LKR)', 'Returns (LKR)', 'Net (LKR)'];
  const lines = rows.map((r) =>
    [r.date, r.invoiceCount, r.gross, r.returns, r.net].join(','),
  );
  const csv = [headers.join(','), ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sales-${label}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4 text-text-3 shrink-0" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function SectionCard({ title, children, loading, action }: {
  title: string;
  children: React.ReactNode;
  loading?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-[13px] font-medium text-text">{title}</h2>
        <div className="flex items-center gap-2">
          {loading && <Spinner />}
          {action}
        </div>
      </div>
      {children}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="px-4 py-8 text-center text-[13px] text-text-3">{message}</p>;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ReportsClient({ companies }: { companies: CompanyRecord[] }) {
  const [preset, setPreset] = useState<string>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);

  // Compute date range from preset or custom inputs
  const dateRange: DateRange | null = useMemo(() => {
    if (preset === 'custom') {
      return customFrom && customTo
        ? { dateFrom: colomboMidnight(customFrom).toISOString(), dateTo: colomboMidnight(addDays(customTo, 1)).toISOString() }
        : null;
    }
    return presetRange(preset);
  }, [preset, customFrom, customTo]);

  // URL query string shared by all filter-aware endpoints
  const filterQs = useMemo(() => {
    const p = new URLSearchParams();
    if (dateRange?.dateFrom) p.set('dateFrom', dateRange.dateFrom);
    if (dateRange?.dateTo) p.set('dateTo', dateRange.dateTo);
    if (selectedCompanyId != null) p.set('companyId', String(selectedCompanyId));
    return p.toString();
  }, [dateRange, selectedCompanyId]);

  const csvLabel = useMemo(() => {
    if (preset !== 'custom') return `${preset}-${todayYMD()}`;
    return customFrom && customTo ? `${customFrom}_${customTo}` : todayYMD();
  }, [preset, customFrom, customTo]);

  // ── Queries ─────────────────────────────────────────────────────────────────

  const summaryQ = useQuery<SummaryResponse>({
    queryKey: ['reports-summary', filterQs],
    queryFn: () => fetch(`/api/reports/summary?${filterQs}`).then((r) => r.json()),
    staleTime: 60_000,
  });

  const byCompanyQ = useQuery<ByCompanyResponse>({
    queryKey: ['reports-by-company', filterQs],
    queryFn: () => fetch(`/api/reports/by-company?${filterQs}`).then((r) => r.json()),
    staleTime: 60_000,
  });

  const paymentMixQ = useQuery<PaymentMixResponse>({
    queryKey: ['reports-payment-mix', filterQs],
    queryFn: () => fetch(`/api/reports/payment-mix?${filterQs}`).then((r) => r.json()),
    staleTime: 60_000,
  });

  const bestSellersQ = useQuery<BestSellersResponse>({
    queryKey: ['reports-best-sellers', filterQs],
    queryFn: () => fetch(`/api/reports/best-sellers?${filterQs}`).then((r) => r.json()),
    staleTime: 60_000,
  });

  const dailyQ = useQuery<DailyBreakdownResponse>({
    queryKey: ['reports-daily-breakdown', filterQs],
    queryFn: () => fetch(`/api/reports/daily-breakdown?${filterQs}`).then((r) => r.json()),
    staleTime: 60_000,
  });

  const discountsQ = useQuery<DiscountsReportResponse>({
    queryKey: ['reports-discounts', filterQs],
    queryFn: () => fetch(`/api/reports/discounts?${filterQs}`).then((r) => r.json()),
    staleTime: 60_000,
  });

  const refundsQ = useQuery<RefundsReportResponse>({
    queryKey: ['reports-refunds', filterQs],
    queryFn: () => fetch(`/api/reports/refunds?${filterQs}`).then((r) => r.json()),
    staleTime: 60_000,
  });

  // Receivables — a point-in-time snapshot of who owes what, not a period
  // report, so it ignores filterQs (no date/company dimension; see CLAUDE.md).
  const receivablesQ = useQuery<ReceivablesResponse>({
    queryKey: ['reports-receivables'],
    queryFn: () => fetch('/api/reports/receivables').then((r) => r.json()),
    staleTime: 60_000,
  });

  // Stock sections ignore date/company filters — always current state
  const lowStockQ = useQuery<LowStockResponse>({
    queryKey: ['reports-low-stock'],
    queryFn: () => fetch('/api/reports/low-stock').then((r) => r.json()),
    staleTime: 5 * 60_000,
  });

  const deadStockQ = useQuery<DeadStockResponse>({
    queryKey: ['reports-dead-stock'],
    queryFn: () => fetch('/api/reports/dead-stock').then((r) => r.json()),
    staleTime: 5 * 60_000,
  });

  // ── Chip style helper ────────────────────────────────────────────────────────

  const chip = (active: boolean) =>
    [
      'h-8 px-3 rounded-full text-[12px] font-medium transition-colors duration-100 whitespace-nowrap',
      active
        ? 'bg-accent text-accent-fg'
        : 'border border-border text-text-2 hover:border-border-hover hover:text-text',
    ].join(' ');

  const summary = summaryQ.data;
  const byCompany = byCompanyQ.data;
  const paymentMix = paymentMixQ.data;
  const bestSellers = bestSellersQ.data;
  const daily = dailyQ.data;

  // ── Total bar for payment mix visual ─────────────────────────────────────
  const paymentTotal = paymentMix?.rows.reduce((s, r) => s + parseFloat(r.total), 0) ?? 0;

  return (
    <div className="min-h-screen bg-bg text-text p-6">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* ── Page header ── */}
        <div>
          <h1 className="text-[20px] font-semibold">Reports</h1>
          <p className="text-[13px] text-text-3 mt-0.5">OWNER view — sales data, profit, and stock health</p>
        </div>

        {/* ── Filters ── */}
        <div className="space-y-3">
          {/* Company chips */}
          <div className="flex items-center flex-wrap gap-2">
            <button type="button" onClick={() => setSelectedCompanyId(null)} className={chip(selectedCompanyId === null)}>
              All
            </button>
            {companies.map((c) => (
              <button key={c.id} type="button" onClick={() => setSelectedCompanyId(c.id)} className={chip(selectedCompanyId === c.id)}>
                {c.code}
              </button>
            ))}
          </div>

          {/* Date preset chips */}
          <div className="flex items-center flex-wrap gap-2">
            {DATE_PRESETS.map(({ key, label }) => (
              <button key={key} type="button" onClick={() => setPreset(key)} className={chip(preset === key)}>
                {label}
              </button>
            ))}
            {(summaryQ.isFetching || byCompanyQ.isFetching || dailyQ.isFetching) && <Spinner />}
          </div>

          {/* Custom date pickers */}
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
        </div>

        {/* ── Summary cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              label: 'Total sales',
              value: summary ? lkr(summary.grossSales) : '—',
              sub: summary ? `${summary.invoiceCount} invoice${summary.invoiceCount !== 1 ? 's' : ''}` : null,
            },
            {
              label: 'Net sales',
              value: summary ? lkr(summary.netSales) : '—',
              sub: summary ? `After ${lkr(summary.returnsTotal)} returns` : null,
            },
            {
              label: 'Profit',
              value: summary ? (summary.profitIsApprox ? '~ ' : '') + lkr(summary.profit) : '—',
              sub: summary?.profitIsApprox ? 'Approx — some items pre-date cost capture' : null,
              accent: true,
            },
            {
              label: 'Returns',
              value: summary ? lkr(summary.returnsTotal) : '—',
              sub: null,
              danger: summary && parseFloat(summary.returnsTotal) > 0,
            },
          ].map(({ label, value, sub, accent, danger }) => (
            <div key={label} className="bg-surface border border-border rounded-xl p-4">
              <p className="text-[11px] text-text-3 uppercase tracking-wide mb-1">{label}</p>
              <p className={[
                'text-[18px] font-semibold tabular-nums leading-none',
                summaryQ.isLoading ? 'text-text-3 animate-pulse' : '',
                accent ? 'text-accent' : '',
                danger ? 'text-danger-fg' : '',
              ].filter(Boolean).join(' ')}>
                {summaryQ.isLoading ? '—' : value}
              </p>
              {sub && !summaryQ.isLoading && (
                <p className="text-[11px] text-text-3 mt-1.5">{sub}</p>
              )}
            </div>
          ))}
        </div>

        {/* ── Delivery collected — deliberately separate from Sales/Profit above ── */}
        <div className="bg-surface border border-border rounded-xl p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] text-text-3 uppercase tracking-wide mb-1">Delivery collected</p>
            <p className="text-[11px] text-text-3">Pass-through — not counted toward Sales or Profit above</p>
          </div>
          <p className={`text-[18px] font-semibold tabular-nums leading-none shrink-0 ${summaryQ.isLoading ? 'text-text-3 animate-pulse' : ''}`}>
            {summaryQ.isLoading ? '—' : summary ? lkr(summary.deliveryCollected) : '—'}
          </p>
        </div>

        {/* ── Outstanding balances (receivables) — "who owes what", a snapshot of
            right-now state, not a period figure. Credit sales already counted
            as sales in the cards above are NOT cash collected — this is the
            uncollected portion sitting on customer accounts. ── */}
        <SectionCard title="Outstanding balances" loading={receivablesQ.isFetching && !receivablesQ.isLoading}>
          {receivablesQ.isLoading ? (
            <div className="p-6 flex justify-center"><Spinner /></div>
          ) : !receivablesQ.data || receivablesQ.data.rows.length === 0 ? (
            <EmptyState message="No customers currently owe a balance" />
          ) : (
            <>
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <p className="text-[12px] text-text-3">Total receivable — not cash in hand</p>
                <p className="text-[16px] font-semibold tabular-nums text-warn-fg">
                  {lkr(receivablesQ.data.totalReceivable)}
                </p>
              </div>
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border text-[11px] text-text-3 uppercase tracking-wide">
                    <th className="text-left px-4 py-2.5 font-medium">Customer</th>
                    <th className="text-left px-4 py-2.5 font-medium">Aging</th>
                    <th className="text-right px-4 py-2.5 font-medium hidden sm:table-cell">Limit</th>
                    <th className="text-right px-4 py-2.5 font-medium">Owes</th>
                  </tr>
                </thead>
                <tbody>
                  {receivablesQ.data.rows.map((r) => (
                    <tr key={r.customerId} className="border-b border-border last:border-b-0">
                      <td className="px-4 py-2.5">
                        <Link href={`/customers/${r.customerId}`} className="text-text hover:underline underline-offset-2">
                          {r.customerName}
                        </Link>
                        {r.phone && <span className="text-[11px] text-text-3 font-mono ml-1.5">{r.phone}</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center h-5 px-2 rounded text-[10px] font-medium ${AGING_STYLES[r.agingBucket]}`}>
                          {AGING_LABELS[r.agingBucket]}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-text-2 hidden sm:table-cell">
                        {r.creditLimit == null ? 'No limit' : lkr(r.creditLimit)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium text-warn-fg">{lkr(r.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </SectionCard>

        {/* ── By company + Payment mix (side by side on wider screens) ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* By company */}
          <SectionCard title="By company" loading={byCompanyQ.isFetching && !byCompanyQ.isLoading}>
            {byCompanyQ.isLoading ? (
              <div className="p-6 flex justify-center"><Spinner /></div>
            ) : !byCompany || byCompany.rows.length === 0 ? (
              <EmptyState message="No sales in this period" />
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border text-[11px] text-text-3 uppercase tracking-wide">
                    <th className="text-left px-4 py-2.5 font-medium">Company</th>
                    <th className="text-right px-4 py-2.5 font-medium">Invoices</th>
                    <th className="text-right px-4 py-2.5 font-medium">Sales</th>
                  </tr>
                </thead>
                <tbody>
                  {byCompany.rows.map((r) => (
                    <tr key={r.companyId} className="border-b border-border last:border-b-0">
                      <td className="px-4 py-2.5 text-text">
                        <span className="inline-flex items-center h-5 px-1.5 rounded text-[10px] font-semibold bg-border text-text-2 mr-1.5">
                          {r.companyCode}
                        </span>
                        {r.companyName}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-text-2">{r.invoiceCount}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium">{lkr(r.salesAmount)}</td>
                    </tr>
                  ))}
                  {byCompany.rows.length > 1 && (
                    <tr className="bg-bg/50">
                      <td className="px-4 py-2.5 text-[12px] font-semibold text-text-2">Combined</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-[12px] font-semibold">{byCompany.combined.invoiceCount}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-[12px] font-semibold">{lkr(byCompany.combined.salesAmount)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </SectionCard>

          {/* Payment mix */}
          <SectionCard title="Payment mix" loading={paymentMixQ.isFetching && !paymentMixQ.isLoading}>
            {paymentMixQ.isLoading ? (
              <div className="p-6 flex justify-center"><Spinner /></div>
            ) : !paymentMix || paymentMix.rows.length === 0 ? (
              <EmptyState message="No sales in this period" />
            ) : (
              <div className="px-4 py-3 space-y-3">
                {paymentMix.rows.map((r) => {
                  const pct = paymentTotal > 0 ? (parseFloat(r.total) / paymentTotal) * 100 : 0;
                  return (
                    <div key={r.payment}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[13px] text-text">{PAYMENT_LABELS[r.payment] ?? r.payment}</span>
                        <div className="text-right">
                          <span className="text-[13px] font-medium tabular-nums">{lkr(r.total)}</span>
                          <span className="text-[11px] text-text-3 ml-1.5 tabular-nums">{r.invoiceCount}×</span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-border rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent rounded-full transition-all duration-300"
                          style={{ width: `${pct.toFixed(1)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </div>

        {/* ── Best sellers ── */}
        <SectionCard title="Best sellers — top 10 by qty" loading={bestSellersQ.isFetching && !bestSellersQ.isLoading}>
          {bestSellersQ.isLoading ? (
            <div className="p-6 flex justify-center"><Spinner /></div>
          ) : !bestSellers || bestSellers.rows.length === 0 ? (
            <EmptyState message="No sales in this period" />
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border text-[11px] text-text-3 uppercase tracking-wide">
                  <th className="text-left px-4 py-2.5 font-medium w-6">#</th>
                  <th className="text-left px-4 py-2.5 font-medium">Item</th>
                  <th className="text-right px-4 py-2.5 font-medium">Qty</th>
                  <th className="text-right px-4 py-2.5 font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {bestSellers.rows.map((r, i) => (
                  <tr key={r.sku} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-2.5 text-text-3 tabular-nums text-[12px]">{i + 1}</td>
                    <td className="px-4 py-2.5">
                      <p className="text-text leading-snug">{r.name}</p>
                      <p className="text-[11px] font-mono text-text-3 mt-0.5">
                        {r.sku}
                        <span className="ml-1.5 text-[10px] uppercase tracking-wide">{r.type}</span>
                      </p>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium text-accent">{r.qtySold}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{lkr(r.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>

        {/* ── Stock health ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Low stock */}
          <SectionCard title="Low stock" loading={lowStockQ.isFetching}>
            {lowStockQ.isLoading ? (
              <div className="p-6 flex justify-center"><Spinner /></div>
            ) : !lowStockQ.data || lowStockQ.data.rows.length === 0 ? (
              <EmptyState message="All parts above reorder level" />
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border text-[11px] text-text-3 uppercase tracking-wide">
                    <th className="text-left px-4 py-2.5 font-medium">Part</th>
                    <th className="text-right px-4 py-2.5 font-medium">Stock</th>
                    <th className="text-right px-4 py-2.5 font-medium">Reorder</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStockQ.data.rows.map((r) => (
                    <tr key={r.id} className="border-b border-border last:border-b-0">
                      <td className="px-4 py-2.5">
                        <p className="text-text leading-snug">{r.name}</p>
                        <p className="text-[11px] font-mono text-text-3 mt-0.5">{r.sku}</p>
                      </td>
                      <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${r.finishedStock === 0 ? 'text-danger-fg' : 'text-warn-fg'}`}>
                        {r.finishedStock}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-text-2">{r.reorderLevel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>

          {/* Dead stock */}
          <SectionCard title="Dead stock — no sales in 60 days" loading={deadStockQ.isFetching}>
            {deadStockQ.isLoading ? (
              <div className="p-6 flex justify-center"><Spinner /></div>
            ) : !deadStockQ.data || deadStockQ.data.rows.length === 0 ? (
              <EmptyState message="No dead stock — all parts have recent activity" />
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border text-[11px] text-text-3 uppercase tracking-wide">
                    <th className="text-left px-4 py-2.5 font-medium">Part</th>
                    <th className="text-right px-4 py-2.5 font-medium">Stock</th>
                    <th className="text-right px-4 py-2.5 font-medium">Last sold</th>
                  </tr>
                </thead>
                <tbody>
                  {deadStockQ.data.rows.map((r) => (
                    <tr key={r.id} className="border-b border-border last:border-b-0">
                      <td className="px-4 py-2.5">
                        <p className="text-text leading-snug">{r.name}</p>
                        <p className="text-[11px] font-mono text-text-3 mt-0.5">{r.sku}</p>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-text-2">{r.finishedStock}</td>
                      <td className="px-4 py-2.5 text-right text-[12px] text-text-3">
                        {r.lastSaleAt
                          ? new Date(r.lastSaleAt).toLocaleDateString('en-LK', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Colombo' })
                          : 'Never'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>
        </div>

        {/* ── Discounts & refunds (loss tracking) ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SectionCard title="Discounts given" loading={discountsQ.isFetching && !discountsQ.isLoading}>
            {discountsQ.isLoading ? (
              <div className="p-6 flex justify-center"><Spinner /></div>
            ) : !discountsQ.data || discountsQ.data.byReason.length === 0 ? (
              <EmptyState message="No authorized discounts in this period" />
            ) : (
              <div className="px-4 py-3 space-y-4">
                <div>
                  <p className="text-[11px] text-text-3 uppercase tracking-wide mb-1.5">By reason</p>
                  <div className="space-y-1.5">
                    {discountsQ.data.byReason.map((r) => (
                      <div key={r.reason} className="flex items-center justify-between text-[13px]">
                        <span className="text-text truncate">{r.reason}</span>
                        <span className="tabular-nums text-text-2 shrink-0 ml-2">
                          {lkr(r.totalDiscount)} <span className="text-text-3">· {r.count}×</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] text-text-3 uppercase tracking-wide mb-1.5">By manager</p>
                  <div className="space-y-1.5">
                    {discountsQ.data.byManager.map((r) => (
                      <div key={r.managerId} className="flex items-center justify-between text-[13px]">
                        <span className="text-text truncate">{r.managerName}</span>
                        <span className="tabular-nums text-text-2 shrink-0 ml-2">
                          {lkr(r.totalDiscount)} <span className="text-text-3">· {r.count}×</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Refunds processed" loading={refundsQ.isFetching && !refundsQ.isLoading}>
            {refundsQ.isLoading ? (
              <div className="p-6 flex justify-center"><Spinner /></div>
            ) : !refundsQ.data || refundsQ.data.byReason.length === 0 ? (
              <EmptyState message="No refunds in this period" />
            ) : (
              <div className="px-4 py-3 space-y-4">
                <div>
                  <p className="text-[11px] text-text-3 uppercase tracking-wide mb-1.5">By reason</p>
                  <div className="space-y-1.5">
                    {refundsQ.data.byReason.map((r) => (
                      <div key={r.reason} className="flex items-center justify-between text-[13px]">
                        <span className="text-text truncate">{r.reason}</span>
                        <span className="tabular-nums text-danger-fg shrink-0 ml-2">
                          −{lkr(r.totalRefund)} <span className="text-text-3">· {r.count}×</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] text-text-3 uppercase tracking-wide mb-1.5">By manager</p>
                  <div className="space-y-1.5">
                    {refundsQ.data.byManager.map((r) => (
                      <div key={r.managerId} className="flex items-center justify-between text-[13px]">
                        <span className="text-text truncate">{r.managerName}</span>
                        <span className="tabular-nums text-danger-fg shrink-0 ml-2">
                          −{lkr(r.totalRefund)} <span className="text-text-3">· {r.count}×</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </SectionCard>
        </div>

        {/* ── Daily breakdown ── */}
        <SectionCard
          title="Daily breakdown"
          loading={dailyQ.isFetching && !dailyQ.isLoading}
          action={
            daily && daily.rows.length > 0 ? (
              <button
                type="button"
                onClick={() => downloadCsv(daily.rows, csvLabel)}
                className="h-7 px-3 rounded-lg border border-border text-[12px] text-text-2
                           hover:border-border-hover hover:text-text transition-colors duration-100"
              >
                CSV
              </button>
            ) : undefined
          }
        >
          {dailyQ.isLoading ? (
            <div className="p-6 flex justify-center"><Spinner /></div>
          ) : !daily || daily.rows.length === 0 ? (
            <EmptyState message="No data for this period" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] min-w-120">
                <thead>
                  <tr className="border-b border-border text-[11px] text-text-3 uppercase tracking-wide">
                    <th className="text-left px-4 py-2.5 font-medium">Date</th>
                    <th className="text-right px-4 py-2.5 font-medium">Invoices</th>
                    <th className="text-right px-4 py-2.5 font-medium">Gross</th>
                    <th className="text-right px-4 py-2.5 font-medium">Returns</th>
                    <th className="text-right px-4 py-2.5 font-medium">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {daily.rows.map((r) => (
                    <tr key={r.date} className="border-b border-border last:border-b-0">
                      <td className="px-4 py-2.5 font-mono text-[12px] text-text-2">{r.date}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-text-2">{r.invoiceCount}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{lkr(r.gross)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-danger-fg">
                        {parseFloat(r.returns) > 0 ? `−${lkr(r.returns)}` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium">{lkr(r.net)}</td>
                    </tr>
                  ))}
                  {/* Totals row */}
                  {daily.rows.length > 1 && (() => {
                    const tot = daily.rows.reduce(
                      (a, r) => ({ count: a.count + r.invoiceCount, gross: a.gross + parseFloat(r.gross), returns: a.returns + parseFloat(r.returns), net: a.net + parseFloat(r.net) }),
                      { count: 0, gross: 0, returns: 0, net: 0 },
                    );
                    return (
                      <tr className="bg-bg/50 font-semibold text-[12px]">
                        <td className="px-4 py-2.5 text-text-2">Total</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{tot.count}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{lkr(tot.gross)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-danger-fg">
                          {tot.returns > 0 ? `−${lkr(tot.returns)}` : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{lkr(tot.net)}</td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

      </div>
    </div>
  );
}
