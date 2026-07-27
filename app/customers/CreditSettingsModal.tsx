'use client';

import { useState } from 'react';
import type { CustomerRecord } from '@/lib/types/customer';

type Props = {
  customer: CustomerRecord;
  onClose: () => void;
  onSaved: (customer: CustomerRecord) => void;
};

/**
 * OWNER-only credit settings: enable/disable credit and set the limit.
 * Posts to a dedicated endpoint (not the general profile PATCH) so a
 * CASHIER's normal edit flow can never reach credit terms.
 */
export function CreditSettingsModal({ customer, onClose, onSaved }: Props) {
  const [enabled, setEnabled] = useState(customer.creditEnabled);
  const [limitInput, setLimitInput] = useState(customer.creditLimit ?? '');
  const [noLimit, setNoLimit] = useState(customer.creditLimit == null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/customers/${customer.id}/credit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creditEnabled: enabled,
          creditLimit: noLimit ? null : parseFloat(limitInput) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Save failed');
        return;
      }
      onSaved(data as CustomerRecord);
    } catch {
      setError('Network error — please retry');
    } finally {
      setPending(false);
    }
  }

  const inputCls =
    'w-full bg-bg border border-border rounded-xl px-3 py-2.5 text-[14px] text-text ' +
    'focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-colors duration-100';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-text/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface rounded-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-[15px] font-medium text-text">Credit settings</h2>
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

          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <span className="text-[13px] text-text">Allow credit (on-account) sales</span>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="w-4 h-4 accent-accent"
            />
          </label>

          {enabled && (
            <div className="space-y-2 pt-2 border-t border-border">
              <label className="flex items-center gap-2 text-[12px] text-text-2">
                <input
                  type="checkbox"
                  checked={noLimit}
                  onChange={(e) => setNoLimit(e.target.checked)}
                  className="w-3.5 h-3.5 accent-accent"
                />
                No credit limit
              </label>
              {!noLimit && (
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={limitInput}
                  onChange={(e) => setLimitInput(e.target.value)}
                  placeholder="Credit limit (LKR)"
                  className={inputCls}
                />
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full h-11 rounded-xl bg-accent text-accent-fg text-[14px] font-medium
                       disabled:opacity-50 disabled:cursor-not-allowed
                       enabled:hover:opacity-90 transition-opacity duration-100"
          >
            {pending ? 'Saving…' : 'Save'}
          </button>
        </form>
      </div>
    </div>
  );
}
