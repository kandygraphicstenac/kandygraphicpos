'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import type { CustomerRecord, CustomerLedgerEntry } from '@/lib/types/customer';
import { CustomerDrawer } from '../CustomerDrawer';
import { CreditSettingsModal } from '../CreditSettingsModal';
import { RecordPaymentModal } from '../RecordPaymentModal';

type Me = { id: number; name: string; email: string; role: string };

type InvoiceSummary = {
  id: string;
  createdAt: string;
  total: string;
  deliveryFee: string;
  status: string;
  payment: string;
  company: { code: string };
};

type CustomerDetail = CustomerRecord & {
  purchaseCount: number;
  totalSpend: string;
  totalDeliveryPaid: string;
  invoices: InvoiceSummary[];
  ledger: CustomerLedgerEntry[];
};

const LKR = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' });
const lkr = (v: string) => LKR.format(parseFloat(v));

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
  PARTIAL_REFUND: 'Partial refund',
};
const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Cash', CARD: 'Card', BANK_TRANSFER: 'Bank', CREDIT: 'Credit', SPLIT: 'Split',
};
const LEDGER_LABELS: Record<string, string> = {
  CREDIT_SALE: 'Credit sale', PAYMENT: 'Payment', ADJUSTMENT: 'Adjustment',
};

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [creditSettingsOpen, setCreditSettingsOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);

  const { data: me } = useQuery<Me>({
    queryKey: ['me'],
    queryFn: () => fetch('/api/me').then((r) => r.json()),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const isOwner = me?.role === 'OWNER';

  const { data: customer, isLoading, error } = useQuery<CustomerDetail>({
    queryKey: ['customer', id],
    queryFn: async () => {
      const res = await fetch(`/api/customers/${encodeURIComponent(id)}`);
      if (res.status === 404) throw new Error('Customer not found');
      if (!res.ok) throw new Error('Failed to load customer');
      return res.json();
    },
    staleTime: 30_000,
  });

  function handleSaved() {
    setEditOpen(false);
    void queryClient.invalidateQueries({ queryKey: ['customer', id] });
    void queryClient.invalidateQueries({ queryKey: ['customers'] });
  }

  function handleCreditSaved() {
    setCreditSettingsOpen(false);
    void queryClient.invalidateQueries({ queryKey: ['customer', id] });
  }

  function handlePaymentRecorded() {
    setPaymentOpen(false);
    void queryClient.invalidateQueries({ queryKey: ['customer', id] });
  }

  async function handleLifecycleAction() {
    if (!customer) return;
    // The server decides deactivate vs. permanent delete based on whether
    // this customer has any invoices or ledger history — never the client.
    if (!confirm(
      `Remove ${customer.name}? Customers with sales or payment history are deactivated ` +
      `(history kept, hidden from new sales); customers with none are deleted permanently.`,
    )) {
      return;
    }
    const res = await fetch(`/api/customers/${customer.id}`, { method: 'DELETE' });
    if (!res.ok) return;
    if (res.status === 204) {
      router.push('/customers');
      return;
    }
    void queryClient.invalidateQueries({ queryKey: ['customer', id] });
  }

  async function handleReactivate() {
    if (!customer) return;
    // CustomerBodySchema expects strings (not null) for optional fields —
    // mirrors CustomerDrawer's toForm() null→'' normalization.
    await fetch(`/api/customers/${customer.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: customer.name,
        phone: customer.phone ?? '',
        addressLine1: customer.addressLine1 ?? '',
        addressLine2: customer.addressLine2 ?? '',
        city: customer.city ?? '',
        postalCode: customer.postalCode ?? '',
        bikeInfo: customer.bikeInfo ?? '',
        notes: customer.notes ?? '',
        active: true,
      }),
    });
    void queryClient.invalidateQueries({ queryKey: ['customer', id] });
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <svg className="animate-spin w-6 h-6 text-text-3" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="min-h-screen bg-bg flex flex-col items-center justify-center gap-4">
        <p className="text-text-2 text-[14px]">{error?.message ?? 'Customer not found'}</p>
        <button
          type="button"
          onClick={() => router.push('/customers')}
          className="h-9 px-4 rounded-lg border border-border text-[13px] text-text-2
                     hover:border-border-hover hover:text-text transition-colors"
        >
          ← Back to customers
        </button>
      </div>
    );
  }

  const addressLines = [customer.addressLine1, customer.addressLine2, [customer.city, customer.postalCode].filter(Boolean).join(' ')]
    .filter(Boolean);

  return (
    <div className="min-h-screen bg-bg text-text p-6">
      <div className="max-w-3xl mx-auto space-y-5">

        <div>
          <Link href="/customers" className="text-[12px] text-text-3 hover:text-text-2 transition-colors mb-3 inline-block">
            ← Customers
          </Link>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-[20px] font-medium">{customer.name}</h1>
                {!customer.active && (
                  <span className="inline-flex items-center h-5 px-2 rounded text-[10px] font-medium bg-border text-text-2">
                    Inactive
                  </span>
                )}
              </div>
              {customer.phone && <p className="text-[13px] text-text-2 mt-0.5 font-mono">{customer.phone}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="h-9 px-4 rounded-lg border border-border text-[13px] text-text-2
                           hover:border-border-hover hover:text-text transition-colors"
              >
                Edit
              </button>
              {isOwner && (
                customer.active ? (
                  <button
                    type="button"
                    onClick={handleLifecycleAction}
                    title="Deactivates if this customer has history, otherwise deletes permanently"
                    className="h-9 px-4 rounded-lg border border-border text-[13px] text-text-2
                               hover:border-danger-fg/40 hover:text-danger-fg transition-colors"
                  >
                    Remove
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleReactivate}
                    className="h-9 px-4 rounded-lg border border-border text-[13px] text-text-2
                               hover:border-border-hover hover:text-text transition-colors"
                  >
                    Reactivate
                  </button>
                )
              )}
            </div>
          </div>
        </div>

        {/* ── Contact / address / bikes ── */}
        <div className="bg-surface border border-border rounded-xl px-4 py-3 grid grid-cols-2 gap-4 text-[13px]">
          <div>
            <p className="text-[11px] text-text-3 uppercase tracking-wide mb-0.5">Address</p>
            {addressLines.length > 0 ? (
              addressLines.map((line, i) => <p key={i} className="text-text">{line}</p>)
            ) : (
              <p className="text-text-3">—</p>
            )}
          </div>
          <div>
            <p className="text-[11px] text-text-3 uppercase tracking-wide mb-0.5">Bikes</p>
            <p className="text-text">{customer.bikeInfo || '—'}</p>
          </div>
          {customer.notes && (
            <div className="col-span-2">
              <p className="text-[11px] text-text-3 uppercase tracking-wide mb-0.5">Notes</p>
              <p className="text-text whitespace-pre-wrap">{customer.notes}</p>
            </div>
          )}
        </div>

        {/* ── Spend summary ── */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-surface border border-border rounded-xl p-4">
            <p className="text-[11px] text-text-3 uppercase tracking-wide mb-1">Purchases</p>
            <p className="text-[18px] font-semibold tabular-nums">{customer.purchaseCount}</p>
          </div>
          <div className="bg-surface border border-border rounded-xl p-4">
            <p className="text-[11px] text-text-3 uppercase tracking-wide mb-1">Total spend</p>
            <p className="text-[18px] font-semibold tabular-nums">{lkr(customer.totalSpend)}</p>
          </div>
          <div className="bg-surface border border-border rounded-xl p-4">
            <p className="text-[11px] text-text-3 uppercase tracking-wide mb-1">Delivery paid</p>
            <p className="text-[18px] font-semibold tabular-nums">{lkr(customer.totalDeliveryPaid)}</p>
          </div>
        </div>

        {/* ── Credit (accounts receivable) ── */}
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-[13px] font-medium text-text">Credit</p>
            <div className="flex items-center gap-2">
              {parseFloat(customer.balance) > 0 && (
                <button
                  type="button"
                  onClick={() => setPaymentOpen(true)}
                  className="h-8 px-3 rounded-lg bg-accent text-accent-fg text-[12px] font-medium
                             hover:opacity-90 transition-opacity duration-100"
                >
                  Record payment
                </button>
              )}
              {isOwner && (
                <button
                  type="button"
                  onClick={() => setCreditSettingsOpen(true)}
                  className="h-8 px-3 rounded-lg border border-border text-[12px] text-text-2
                             hover:border-border-hover hover:text-text transition-colors duration-100"
                >
                  Credit settings
                </button>
              )}
            </div>
          </div>

          {customer.creditEnabled ? (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-[11px] text-text-3 uppercase tracking-wide mb-0.5">Balance owed</p>
                <p className={`text-[18px] font-semibold tabular-nums ${parseFloat(customer.balance) > 0 ? 'text-warn-fg' : ''}`}>
                  {lkr(customer.balance)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-text-3 uppercase tracking-wide mb-0.5">Credit limit</p>
                <p className="text-[18px] font-semibold tabular-nums">
                  {customer.creditLimit == null ? 'No limit' : lkr(customer.creditLimit)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-text-3 uppercase tracking-wide mb-0.5">Available</p>
                <p className="text-[18px] font-semibold tabular-nums text-ok-fg">
                  {customer.creditLimit == null
                    ? 'Unlimited'
                    : lkr((parseFloat(customer.creditLimit) - parseFloat(customer.balance)).toFixed(2))}
                </p>
              </div>
            </div>
          ) : parseFloat(customer.balance) > 0 ? (
            // Credit was disabled after sales were made on it — balance still owed and payable.
            <div>
              <p className="text-[11px] text-text-3 uppercase tracking-wide mb-0.5">Balance owed</p>
              <p className="text-[18px] font-semibold tabular-nums text-warn-fg">{lkr(customer.balance)}</p>
              <p className="text-[11px] text-text-3 mt-1">Credit is currently disabled for this customer</p>
            </div>
          ) : (
            <p className="text-[13px] text-text-3">Not enabled for credit</p>
          )}
        </div>

        {/* ── Ledger history ── */}
        {customer.ledger.length > 0 && (
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <p className="text-[13px] font-medium text-text">Credit ledger</p>
            </div>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border text-text-3 text-[11px] uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-medium">Date</th>
                  <th className="text-left px-4 py-3 font-medium">Type</th>
                  <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Note</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">By</th>
                  <th className="text-right px-4 py-3 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {customer.ledger.map((l) => {
                  const amt = parseFloat(l.amount);
                  return (
                    <tr key={l.id} className="border-b border-border last:border-b-0">
                      <td className="px-4 py-3 text-text-2 text-[12px] whitespace-nowrap">
                        {new Date(l.createdAt).toLocaleDateString('en-LK', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Colombo' })}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-text">{LEDGER_LABELS[l.type] ?? l.type}</span>
                        {l.invoiceId && (
                          <Link href={`/invoices/${encodeURIComponent(l.invoiceId)}`} className="ml-1.5 text-[11px] font-mono text-text-3 hover:text-accent hover:underline underline-offset-2">
                            {l.invoiceId}
                          </Link>
                        )}
                      </td>
                      <td className="px-4 py-3 text-text-2 hidden sm:table-cell">{l.note ?? '—'}</td>
                      <td className="px-4 py-3 text-text-2 hidden md:table-cell">{l.userName}</td>
                      <td className={`px-4 py-3 text-right font-medium tabular-nums ${amt > 0 ? 'text-warn-fg' : 'text-ok-fg'}`}>
                        {amt > 0 ? '+' : ''}{lkr(l.amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Purchase history ── */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-[13px] font-medium text-text">Purchase history</p>
          </div>
          {customer.invoices.length === 0 ? (
            <div className="py-10 text-center text-text-3 text-[13px]">No purchases yet</div>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border text-text-3 text-[11px] uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-medium">Invoice</th>
                  <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Date</th>
                  <th className="text-left px-4 py-3 font-medium">Co</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Payment</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-right px-4 py-3 font-medium">Total</th>
                  <th className="text-right px-4 py-3 font-medium hidden sm:table-cell">Delivery</th>
                </tr>
              </thead>
              <tbody>
                {customer.invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-border last:border-b-0 hover:bg-bg transition-colors duration-75">
                    <td className="px-4 py-3 font-mono text-[12px]">
                      <Link href={`/invoices/${encodeURIComponent(inv.id)}`} className="hover:underline underline-offset-2">
                        {inv.id}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-text-2 text-[12px] hidden sm:table-cell">
                      {new Date(inv.createdAt).toLocaleDateString('en-LK', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Colombo' })}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center h-5 px-2 rounded text-[10px] font-semibold tracking-wide bg-border text-text-2">
                        {inv.company.code}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-text-2 hidden md:table-cell">
                      {PAYMENT_LABELS[inv.payment] ?? inv.payment}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center h-5 px-2 rounded text-[10px] font-medium ${STATUS_STYLES[inv.status] ?? 'bg-border text-text-2'}`}>
                        {STATUS_LABELS[inv.status] ?? inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{lkr(inv.total)}</td>
                    <td className="px-4 py-3 text-right text-text-2 tabular-nums hidden sm:table-cell">
                      {parseFloat(inv.deliveryFee) > 0 ? lkr(inv.deliveryFee) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {editOpen && (
        <CustomerDrawer
          mode="edit"
          customer={customer}
          onClose={() => setEditOpen(false)}
          onSaved={handleSaved}
        />
      )}

      {creditSettingsOpen && (
        <CreditSettingsModal
          customer={customer}
          onClose={() => setCreditSettingsOpen(false)}
          onSaved={handleCreditSaved}
        />
      )}

      {paymentOpen && (
        <RecordPaymentModal
          customerId={customer.id}
          customerName={customer.name}
          balance={customer.balance}
          isOwner={isOwner}
          onClose={() => setPaymentOpen(false)}
          onRecorded={handlePaymentRecorded}
        />
      )}
    </div>
  );
}
