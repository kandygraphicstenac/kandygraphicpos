'use client';

import { useState } from 'react';
import { ManagerAuthModal, type ManagerAuthResult } from '@/app/_components/ManagerAuthModal';
import { CREDIT_PAYMENT_REASONS } from '@/lib/constants/reasons';

const LKR = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' });

type Method = 'CASH' | 'CARD' | 'BANK_TRANSFER';

type Props = {
  customerId: number;
  customerName: string;
  balance: string; // Decimal as string — current amount owed
  /** OWNER records directly; any other role must clear a manager auth gate first. */
  isOwner: boolean;
  onClose: () => void;
  onRecorded: (newBalance: string) => void;
};

const METHODS: Array<{ value: Method; label: string }> = [
  { value: 'CASH', label: 'Cash' },
  { value: 'CARD', label: 'Card' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
];

/**
 * Records a payment against a customer's credit balance. OWNER submits
 * directly; any other role must clear a manager authorization gate first
 * (password + reason), mirroring the discount/refund flow — the actual
 * grant is consumed server-side in creditService.recordPayment, never
 * trusted from the client.
 */
export function RecordPaymentModal({ customerId, customerName, balance, isOwner, onClose, onRecorded }: Props) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<Method>('CASH');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const amountNum = parseFloat(amount) || 0;
  const balanceNum = parseFloat(balance);
  const exceedsBalance = amountNum > balanceNum;
  const canSubmit = amountNum > 0 && !exceedsBalance && !pending;

  async function submitPayment(authToken?: string) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/customers/${customerId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amountNum,
          method,
          note: note.trim() || undefined,
          ...(authToken ? { authToken } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not record payment');
        setAuthModalOpen(false);
        return;
      }
      onRecorded(data.balance as string);
    } catch {
      setError('Network error — please retry');
      setAuthModalOpen(false);
    } finally {
      setPending(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    if (isOwner) {
      void submitPayment();
    } else {
      setAuthModalOpen(true);
    }
  }

  function handleAuthApprove(result: ManagerAuthResult) {
    void submitPayment(result.authToken);
  }

  const inputCls =
    'w-full bg-bg border border-border rounded-xl px-3 py-2.5 text-[14px] text-text ' +
    'focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-colors duration-100';

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-text/40 backdrop-blur-sm"
        onClick={(e) => { if (e.target === e.currentTarget && !authModalOpen) onClose(); }}
      >
        <div className="bg-surface rounded-2xl w-full max-w-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div>
              <h2 className="text-[15px] font-medium text-text">Record payment</h2>
              <p className="text-[12px] text-text-3 mt-0.5">
                {customerName} · owes {LKR.format(balanceNum)}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-text-3
                         hover:text-text hover:bg-border transition-colors duration-100"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="px-5 pb-5 space-y-4">
            {error && (
              <p className="text-[12px] text-danger-fg bg-danger-bg border border-danger-fg/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div>
              <label className="block text-[12px] text-text-2 mb-1.5">Amount (LKR)</label>
              <input
                autoFocus
                type="number"
                min={0}
                step={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={inputCls}
              />
              {exceedsBalance && (
                <p className="text-[11px] text-danger-fg mt-1">Cannot exceed the outstanding balance</p>
              )}
            </div>

            <div>
              <label className="block text-[12px] text-text-2 mb-1.5">Method</label>
              <div className="grid grid-cols-3 gap-2">
                {METHODS.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMethod(m.value)}
                    className={[
                      'h-9 rounded-lg text-[12px] font-medium transition-colors duration-100',
                      method === m.value
                        ? 'bg-accent text-accent-fg'
                        : 'border border-border text-text-2 hover:border-border-hover hover:text-text',
                    ].join(' ')}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[12px] text-text-2 mb-1.5">Note (optional)</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. receipt #, reference"
                className={inputCls}
              />
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full h-11 rounded-xl bg-accent text-accent-fg text-[14px] font-medium
                         disabled:opacity-50 disabled:cursor-not-allowed
                         enabled:hover:opacity-90 transition-opacity duration-100"
            >
              {pending ? 'Saving…' : isOwner ? 'Record payment' : 'Continue — manager authorization required'}
            </button>
          </form>
        </div>
      </div>

      {authModalOpen && (
        <ManagerAuthModal
          action="credit_payment"
          actionLabel="Record payment"
          amountPaise={Math.round(amountNum * 100)}
          reasonOptions={CREDIT_PAYMENT_REASONS}
          onApprove={handleAuthApprove}
          onClose={() => setAuthModalOpen(false)}
        />
      )}
    </>
  );
}
