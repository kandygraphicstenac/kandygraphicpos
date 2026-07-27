'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReasonOption } from '@/lib/constants/reasons';

const LKR = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' });

export type ManagerAuthResult = {
  authorizedById: number;
  authorizedByName: string;
  reason: string;
  authToken: string;
};

type Props = {
  action: 'discount' | 'refund' | 'credit_payment';
  actionLabel: string; // e.g. "Discount" / "Refund"
  amountPaise: number;
  reasonOptions: ReasonOption[];
  onApprove: (result: ManagerAuthResult) => void;
  onClose: () => void;
};

/**
 * Shared manager password + reason gate for discounts and refunds.
 * Calls POST /api/auth/authorize; the server re-checks the password against
 * active OWNER accounts without touching the current cashier's session.
 * Wrong password shows an inline error and keeps the modal open.
 */
export function ManagerAuthModal({ action, actionLabel, amountPaise, reasonOptions, onApprove, onClose }: Props) {
  const [password, setPassword] = useState('');
  const [reasonValue, setReasonValue] = useState(reasonOptions[0]?.value ?? 'other');
  const [otherReason, setOtherReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => { passwordRef.current?.focus(); }, []);

  const isOther = reasonValue === 'other';
  const effectiveReason = isOther ? otherReason.trim() : (reasonOptions.find((r) => r.value === reasonValue)?.label ?? reasonValue);
  const canSubmit = password.length > 0 && effectiveReason.length > 0 && !pending;

  async function submit() {
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, action, reason: effectiveReason }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Authorization failed');
        setPassword('');
        passwordRef.current?.focus();
        return;
      }
      onApprove({
        authorizedById: data.authorizedById,
        authorizedByName: data.authorizedByName,
        reason: data.reason,
        authToken: data.authToken,
      });
    } catch {
      setError('Network error — please retry');
    } finally {
      setPending(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void submit();
  }

  // Escape-to-close only — Enter-to-submit is now native <form> behavior.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-text/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface rounded-2xl w-full max-w-sm overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <h2 className="text-[15px] font-medium text-text">Manager authorization</h2>
            <p className="text-[13px] text-text-3 tabular-nums mt-0.5">
              {actionLabel} · {LKR.format(amountPaise / 100)}
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

          {/* Reason */}
          <div>
            <label className="block text-[12px] text-text-2 mb-1.5">Reason</label>
            <select
              value={reasonValue}
              onChange={(e) => setReasonValue(e.target.value)}
              className="w-full bg-bg border border-border rounded-xl px-3 py-2.5 text-[14px] text-text
                         focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent
                         transition-colors duration-100"
            >
              {reasonOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {isOther && (
              <input
                type="text"
                value={otherReason}
                onChange={(e) => setOtherReason(e.target.value)}
                placeholder="Describe the reason"
                autoFocus
                className="mt-2 w-full bg-bg border border-border rounded-xl px-4 py-2.5 text-[14px]
                           text-text focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent
                           transition-colors duration-100"
              />
            )}
          </div>

          {/* Manager password */}
          <div>
            <label className="block text-[12px] text-text-2 mb-1.5">Manager password</label>
            <input
              ref={passwordRef}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
              className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-[14px]
                         text-text focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent
                         transition-colors duration-100"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full h-11 rounded-xl bg-accent text-accent-fg text-[14px] font-medium
                       disabled:opacity-50 disabled:cursor-not-allowed
                       enabled:hover:opacity-90 transition-opacity duration-100"
          >
            {pending ? 'Checking…' : 'Authorize · Enter'}
          </button>
        </form>
      </div>
    </div>
  );
}
