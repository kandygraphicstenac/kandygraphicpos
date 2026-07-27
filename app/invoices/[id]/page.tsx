'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { reprintInvoice } from '@/lib/utils/reprintInvoice';
import { printShippingLabel } from '@/lib/utils/printShippingLabel';
import { ManagerAuthModal, type ManagerAuthResult } from '@/app/_components/ManagerAuthModal';
import { REFUND_REASONS } from '@/lib/constants/reasons';
import {
  DELIVERY_STATUS_LABELS,
  DELIVERY_STATUS_STYLES,
  nextDeliveryStatus,
  type DeliveryStatusValue,
} from '@/lib/constants/delivery';

// ─── Types ────────────────────────────────────────────────────────────────────

type InvoiceItem = {
  id: number;
  partId: number | null;
  setId: number | null;
  part: { name: string; sku: string } | null;
  set: { name: string; sku: string } | null;
  qty: number;
  returnedQty: number;
  unitPrice: string;
  lineTotal: string;
};

type ReturnRecord = {
  id: number;
  refundReason: string;
  refundAmount: string;
  createdAt: string;
  authorizedByName: string;
  processedByName: string;
};

type InvoiceDetail = {
  id: string;
  createdAt: string;
  company: { id: number; code: string; name: string; address: string | null; phone: string | null; regNo: string | null };
  user: { name: string };
  customer: { name: string; phone: string | null } | null;
  subtotal: string;
  discountPct: string;
  discountAmt: string;
  discountReason: string | null;
  discountAuthorizedBy: { name: string } | null;
  total: string;
  deliveryFee: string;
  deliveryAddress: { name: string; phone: string | null; line1: string; line2: string | null; city: string | null; postalCode: string | null } | null;
  orderType: 'COUNTER' | 'DELIVERY';
  deliveryStatus: DeliveryStatusValue | null;
  tendered: string | null;
  payment: string;
  paymentReference: string | null;
  cardLast4: string | null;
  status: string;
  items: InvoiceItem[];
  returns: ReturnRecord[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const LKR = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' });
const lkr = (v: string | null | undefined) =>
  v == null ? '—' : LKR.format(parseFloat(v));

function formatColomboDT(iso: string) {
  return new Date(iso).toLocaleString('en-LK', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
    timeZone: 'Asia/Colombo',
  });
}

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
  CASH: 'Cash',
  CARD: 'Card',
  BANK_TRANSFER: 'Bank transfer',
  SPLIT: 'Split',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [returnMode, setReturnMode] = useState(false);
  const [returnQtys, setReturnQtys] = useState<Record<number, number>>({});
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'ok' | 'error' } | null>(null);

  // Dismiss toast after 3.5 s
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const { data: invoice, isLoading, error } = useQuery<InvoiceDetail>({
    queryKey: ['invoice', id],
    queryFn: async () => {
      const res = await fetch(`/api/invoices/${encodeURIComponent(id)}`);
      if (res.status === 404) throw new Error('Invoice not found');
      if (!res.ok) throw new Error('Failed to load invoice');
      return res.json();
    },
    staleTime: 30_000,
  });

  const returnMutation = useMutation({
    mutationFn: async (vars: { lines: Array<{ itemId: number; qty: number }>; refundAuthToken: string }) => {
      const res = await fetch(`/api/invoices/${encodeURIComponent(id)}/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vars),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Return failed');
      return json;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      setReturnMode(false);
      setReturnQtys({});
      setAuthModalOpen(false);
      setToast({ message: 'Return processed successfully', type: 'ok' });
    },
    onError: (err: Error) => {
      setAuthModalOpen(false);
      setToast({ message: err.message, type: 'error' });
    },
  });

  function handleRefundApprove(result: ManagerAuthResult) {
    returnMutation.mutate({ lines: returnLines, refundAuthToken: result.authToken });
  }

  const advanceStatus = useMutation({
    mutationFn: async (status: DeliveryStatusValue) => {
      const res = await fetch(`/api/invoices/${encodeURIComponent(id)}/delivery-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Failed to update delivery status');
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
    onError: () => {
      setToast({ message: 'Could not update delivery status', type: 'error' });
    },
  });

  // Lines to submit: only items with qty > 0
  const returnLines = invoice?.items
    .filter((item) => (returnQtys[item.id] ?? 0) > 0)
    .map((item) => ({ itemId: item.id, qty: returnQtys[item.id] })) ?? [];

  const refundTotal = invoice?.items.reduce((sum, item) => {
    const qty = returnQtys[item.id] ?? 0;
    return sum + qty * parseFloat(item.unitPrice);
  }, 0) ?? 0;

  const canReturn =
    invoice &&
    invoice.status !== 'HELD' &&
    invoice.status !== 'REFUNDED';

  // ── Loading / error states ──────────────────────────────────────────────────
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

  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-bg flex flex-col items-center justify-center gap-4">
        <p className="text-text-2 text-[14px]">{error?.message ?? 'Invoice not found'}</p>
        <button
          type="button"
          onClick={() => router.push('/invoices')}
          className="h-9 px-4 rounded-lg border border-border text-[13px] text-text-2
                     hover:border-border-hover hover:text-text transition-colors"
        >
          ← Back to invoices
        </button>
      </div>
    );
  }

  const subtotal = parseFloat(invoice.subtotal);
  const discountPct = parseFloat(invoice.discountPct);
  const discountAmt = parseFloat(invoice.discountAmt);
  const total = parseFloat(invoice.total);
  const deliveryFee = parseFloat(invoice.deliveryFee);
  const amountDue = total + deliveryFee; // what the customer actually paid — never used for sales/profit
  const tendered = invoice.tendered ? parseFloat(invoice.tendered) : null;
  const hasDiscount = discountPct > 0 || discountAmt > 0;

  // ── Return-mode helpers (invoice is guaranteed non-null here) ───────────────
  const isSingleLine = invoice.items.length === 1;

  const allReturnableItems = invoice.items.filter((i) => i.qty - i.returnedQty > 0);
  const allAtMax =
    allReturnableItems.length > 0 &&
    allReturnableItems.every((i) => (returnQtys[i.id] ?? 0) === (i.qty - i.returnedQty));

  function enterReturnMode() {
    if (isSingleLine) {
      // Pre-fill single-line invoice to its full returnable qty (commonly 1)
      const item = invoice!.items[0];
      const available = item.qty - item.returnedQty;
      setReturnQtys(available > 0 ? { [item.id]: available } : {});
    }
    // Multi-line stays at 0 — user uses + or "Return all"
    setReturnMode(true);
  }

  function handleReturnAll() {
    if (allAtMax) {
      setReturnQtys({});
    } else {
      const filled: Record<number, number> = {};
      for (const item of invoice!.items) {
        const available = item.qty - item.returnedQty;
        if (available > 0) filled[item.id] = available;
      }
      setReturnQtys(filled);
    }
  }

  return (
    <div className="min-h-screen bg-bg text-text p-6">
      <div className="max-w-3xl mx-auto space-y-5">

        {/* ── Back link + header ── */}
        <div>
          <Link
            href="/invoices"
            className="text-[12px] text-text-3 hover:text-text-2 transition-colors mb-3 inline-block"
          >
            ← Invoices
          </Link>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="font-mono text-[20px] font-medium">{invoice.id}</h1>
              <p className="text-[13px] text-text-2 mt-0.5">
                {formatColomboDT(invoice.createdAt)}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              <span className="inline-flex items-center h-6 px-2 rounded text-[10px] font-semibold tracking-wide bg-border text-text-2">
                {invoice.company.code}
              </span>
              <span className={`inline-flex items-center h-6 px-2.5 rounded text-[11px] font-medium ${STATUS_STYLES[invoice.status] ?? 'bg-border text-text-2'}`}>
                {STATUS_LABELS[invoice.status] ?? invoice.status}
              </span>
              {invoice.orderType === 'DELIVERY' && invoice.deliveryStatus && (
                <span className={`inline-flex items-center h-6 px-2.5 rounded text-[11px] font-medium ${DELIVERY_STATUS_STYLES[invoice.deliveryStatus]}`}>
                  {DELIVERY_STATUS_LABELS[invoice.deliveryStatus]}
                </span>
              )}
            </div>
          </div>
          {invoice.orderType === 'DELIVERY' && invoice.deliveryStatus && nextDeliveryStatus(invoice.deliveryStatus) && (
            <button
              type="button"
              onClick={() => advanceStatus.mutate(nextDeliveryStatus(invoice.deliveryStatus!)!)}
              disabled={advanceStatus.isPending}
              className="mt-2 h-8 px-3 rounded-lg border border-border text-[12px] font-medium text-text-2
                         enabled:hover:border-border-hover enabled:hover:text-text transition-colors disabled:opacity-40"
            >
              Mark as {DELIVERY_STATUS_LABELS[nextDeliveryStatus(invoice.deliveryStatus)!]}
            </button>
          )}
        </div>

        {/* ── Metadata ── */}
        <div className="bg-surface border border-border rounded-xl px-4 py-3 grid grid-cols-2 sm:grid-cols-3 gap-3 text-[13px]">
          <div>
            <p className="text-[11px] text-text-3 uppercase tracking-wide mb-0.5">Company</p>
            <p className="text-text">{invoice.company.name}</p>
          </div>
          <div>
            <p className="text-[11px] text-text-3 uppercase tracking-wide mb-0.5">Cashier</p>
            <p className="text-text">{invoice.user.name}</p>
          </div>
          <div>
            <p className="text-[11px] text-text-3 uppercase tracking-wide mb-0.5">Payment</p>
            <p className="text-text">
              {PAYMENT_LABELS[invoice.payment] ?? invoice.payment}
              {invoice.cardLast4 && (
                <span className="font-mono ml-1 text-text-2"> ••••{invoice.cardLast4}</span>
              )}
            </p>
            {invoice.paymentReference && (
              <p className="text-[12px] font-mono text-text-3 mt-0.5">Ref: {invoice.paymentReference}</p>
            )}
          </div>
          {invoice.customer && (
            <div>
              <p className="text-[11px] text-text-3 uppercase tracking-wide mb-0.5">Customer</p>
              <p className="text-text">{invoice.customer.name}</p>
              {invoice.customer.phone && (
                <p className="text-[12px] text-text-2">{invoice.customer.phone}</p>
              )}
            </div>
          )}
        </div>

        {/* ── Delivery address (frozen at sale time) ── */}
        {invoice.deliveryAddress && (
          <div className="bg-surface border border-border rounded-xl px-4 py-3 text-[13px]">
            <p className="text-[11px] text-text-3 uppercase tracking-wide mb-1">Deliver to</p>
            <p className="text-text font-medium">{invoice.deliveryAddress.name}</p>
            <p className="text-text">{invoice.deliveryAddress.line1}</p>
            {invoice.deliveryAddress.line2 && <p className="text-text">{invoice.deliveryAddress.line2}</p>}
            {(invoice.deliveryAddress.city || invoice.deliveryAddress.postalCode) && (
              <p className="text-text">{[invoice.deliveryAddress.city, invoice.deliveryAddress.postalCode].filter(Boolean).join(' ')}</p>
            )}
            {invoice.deliveryAddress.phone && (
              <p className="text-text-2 font-mono mt-0.5">{invoice.deliveryAddress.phone}</p>
            )}
          </div>
        )}

        {/* ── Line items ── */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          {/* Return-mode hint — multi-line only (single-line is pre-filled, no guidance needed) */}
          {returnMode && !isSingleLine && (
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border text-[12px] text-text-3">
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 shrink-0 text-accent">
                <path d="M7.5 1a6.5 6.5 0 100 13A6.5 6.5 0 007.5 1zM6.5 4.5a1 1 0 112 0V8a1 1 0 01-.553.894l-2 1a1 1 0 01-.894-1.788L6.5 7.382V4.5z"/>
              </svg>
              <span>
                Use <span className="font-semibold text-text">+</span> to select quantities to return
              </span>
              <button
                type="button"
                onClick={handleReturnAll}
                className="ml-auto text-[12px] font-medium text-accent hover:opacity-75 transition-opacity whitespace-nowrap"
              >
                {allAtMax ? 'Clear' : 'Return all'}
              </button>
            </div>
          )}
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-text-3 text-[11px] uppercase tracking-wide">
                <th className="text-left px-4 py-3 font-medium">Item</th>
                <th className="text-right px-4 py-3 font-medium">Qty</th>
                <th className="text-right px-4 py-3 font-medium">Unit</th>
                <th className="text-right px-4 py-3 font-medium">Line total</th>
                {returnMode && (
                  <th className="text-center px-4 py-3 font-medium text-accent">Return</th>
                )}
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item) => {
                const name = item.part?.name ?? item.set?.name ?? '—';
                const sku = item.part?.sku ?? item.set?.sku ?? '';
                const available = item.qty - item.returnedQty;
                const returnQty = returnQtys[item.id] ?? 0;

                return (
                  <tr key={item.id} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-3">
                      <p className="text-text font-medium leading-snug">{name}</p>
                      {sku && <p className="text-[11px] font-mono text-text-3 mt-0.5">{sku}</p>}
                      {item.returnedQty > 0 && (
                        <p className="text-[11px] text-warn-fg mt-0.5">
                          {item.returnedQty} returned
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-text-2">
                      {item.qty}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-text-2">
                      {lkr(item.unitPrice)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {lkr(item.lineTotal)}
                    </td>
                    {returnMode && (
                      <td className="px-4 py-3">
                        {available > 0 ? (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                setReturnQtys((prev) => ({
                                  ...prev,
                                  [item.id]: Math.max(0, (prev[item.id] ?? 0) - 1),
                                }))
                              }
                              disabled={returnQty <= 0}
                              className="w-7 h-7 flex items-center justify-center rounded border border-border
                                         text-text disabled:opacity-30 enabled:hover:border-border-hover
                                         text-[14px] transition-colors"
                            >
                              −
                            </button>
                            <span className="w-6 text-center tabular-nums text-[13px] font-medium">
                              {returnQty}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setReturnQtys((prev) => ({
                                  ...prev,
                                  [item.id]: Math.min(available, (prev[item.id] ?? 0) + 1),
                                }))
                              }
                              disabled={returnQty >= available}
                              className="w-7 h-7 flex items-center justify-center rounded border border-border
                                         text-text disabled:opacity-30 enabled:hover:border-border-hover
                                         text-[14px] transition-colors"
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          <p className="text-center text-[11px] text-text-3">—</p>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Totals ── */}
        <div className="bg-surface border border-border rounded-xl px-4 py-3 space-y-1.5 text-[13px]">
          <div className="flex justify-between text-text-2">
            <span>Subtotal</span>
            <span className="tabular-nums">{LKR.format(subtotal)}</span>
          </div>
          {discountPct > 0 && (
            <div className="flex justify-between text-danger-fg">
              <span>Discount ({discountPct}%)</span>
              <span className="tabular-nums">−{LKR.format(subtotal * discountPct / 100)}</span>
            </div>
          )}
          {discountAmt > 0 && (
            <div className="flex justify-between text-danger-fg">
              <span>Discount</span>
              <span className="tabular-nums">−{LKR.format(discountAmt)}</span>
            </div>
          )}
          {hasDiscount && invoice.discountReason && (
            <p className="text-[11px] text-text-3">
              Reason: {invoice.discountReason}
              {invoice.discountAuthorizedBy && ` — approved by ${invoice.discountAuthorizedBy.name}`}
            </p>
          )}
          {hasDiscount && <hr className="border-border" />}
          <div className="flex justify-between font-semibold text-[14px] pt-0.5">
            <span>Total</span>
            <span className="tabular-nums">{LKR.format(total)}</span>
          </div>
          {deliveryFee > 0 && (
            <>
              <div className="flex justify-between text-text-2">
                <span>Delivery fee</span>
                <span className="tabular-nums">{LKR.format(deliveryFee)}</span>
              </div>
              <div className="flex justify-between font-semibold text-[14px]">
                <span>Amount due</span>
                <span className="tabular-nums">{LKR.format(amountDue)}</span>
              </div>
            </>
          )}
          {invoice.payment === 'CASH' && tendered != null && (
            <>
              <hr className="border-border" />
              <div className="flex justify-between text-text-2">
                <span>Cash</span>
                <span className="tabular-nums">{LKR.format(tendered)}</span>
              </div>
              <div className="flex justify-between font-medium text-accent">
                <span>Change</span>
                <span className="tabular-nums">{LKR.format(tendered - amountDue)}</span>
              </div>
            </>
          )}
        </div>

        {/* ── Returns history (owner-only) ── */}
        {invoice.returns.length > 0 && (
          <div className="bg-surface border border-border rounded-xl px-4 py-3 space-y-3">
            <p className="text-[11px] text-text-3 uppercase tracking-wide">Returns</p>
            {invoice.returns.map((r) => (
              <div key={r.id} className="text-[13px] flex items-start justify-between gap-3 border-b border-border last:border-b-0 pb-3 last:pb-0">
                <div>
                  <p className="text-text">{r.refundReason}</p>
                  <p className="text-[11px] text-text-3 mt-0.5">
                    Approved by {r.authorizedByName} · processed by {r.processedByName} · {formatColomboDT(r.createdAt)}
                  </p>
                </div>
                <span className="tabular-nums font-medium text-danger-fg shrink-0">
                  −{lkr(r.refundAmount)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ── Return mode: refund bar — always visible while in return mode ── */}
        {returnMode && (
          <div className="bg-surface border border-border rounded-xl px-4 py-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-[12px] text-text-3">Refund total</p>
              {returnLines.length > 0 ? (
                <p className="text-[18px] font-semibold tabular-nums text-text">
                  {LKR.format(refundTotal)}
                </p>
              ) : (
                <p className="text-[13px] text-text-3">Select items to return</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setAuthModalOpen(true)}
              disabled={returnLines.length === 0}
              className="h-10 px-5 rounded-xl bg-danger-fg text-white text-[13px] font-medium
                         hover:opacity-90 transition-opacity
                         disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Confirm return
            </button>
          </div>
        )}

        {/* ── Actions ── */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => reprintInvoice(invoice.id)}
            className="h-9 px-4 rounded-lg border border-border text-[13px] text-text-2
                       hover:border-border-hover hover:text-text transition-colors"
          >
            Print receipt
          </button>

          <a
            href={`/receipt/${encodeURIComponent(invoice.id)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="h-9 px-4 rounded-lg border border-border text-[13px] text-text-2
                       hover:border-border-hover hover:text-text transition-colors
                       inline-flex items-center"
          >
            Preview receipt
          </a>

          {invoice.deliveryAddress && (
            <button
              type="button"
              onClick={() => printShippingLabel(invoice.id)}
              className="h-9 px-4 rounded-lg border border-border text-[13px] text-text-2
                         hover:border-border-hover hover:text-text transition-colors"
            >
              Print shipping label
            </button>
          )}

          {canReturn && !returnMode && (
            <button
              type="button"
              onClick={enterReturnMode}
              className="h-9 px-4 rounded-lg border border-border text-[13px] text-text-2
                         hover:border-border-hover hover:text-text transition-colors"
            >
              Return items
            </button>
          )}

          {returnMode && (
            <button
              type="button"
              onClick={() => {
                setReturnMode(false);
                setReturnQtys({});
              }}
              className="h-9 px-4 rounded-lg border border-border text-[13px] text-text-2
                         hover:border-border-hover hover:text-text transition-colors"
            >
              Cancel return
            </button>
          )}
        </div>

      </div>

      {/* ── Manager authorization for the refund ── */}
      {authModalOpen && (
        <ManagerAuthModal
          action="refund"
          actionLabel="Refund"
          amountPaise={Math.round(refundTotal * 100)}
          reasonOptions={REFUND_REASONS}
          onApprove={handleRefundApprove}
          onClose={() => setAuthModalOpen(false)}
        />
      )}

      {/* ── Toast ── */}
      {toast && (
        <div
          className={[
            'fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-xl text-[13px] font-medium',
            'shadow-lg z-50 pointer-events-none',
            toast.type === 'ok'
              ? 'bg-ok-bg text-ok-fg border border-ok-fg/20'
              : 'bg-danger-bg text-danger-fg border border-danger-fg/20',
          ].join(' ')}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
