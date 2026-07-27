'use client';

import { useEffect, useRef, useState } from 'react';

const LKR = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' });

type Props = {
  totalPaise: number;
  onConfirm: (paymentReference: string, cardLast4: string) => void;
  onClose: () => void;
};

export function CardPaymentModal({ totalPaise, onConfirm, onClose }: Props) {
  const [ref, setRef] = useState('');
  const [last4, setLast4] = useState('');
  const refInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { refInputRef.current?.focus(); }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'Enter') { e.preventDefault(); onConfirm(ref.trim(), last4.trim()); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, onConfirm, ref, last4]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-text/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface rounded-2xl w-full max-w-sm overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <h2 className="text-[15px] font-medium text-text">Card payment</h2>
            <p className="text-[13px] text-text-3 tabular-nums mt-0.5">{LKR.format(totalPaise / 100)}</p>
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

        <div className="px-5 pb-5 space-y-4">
          {/* Approval / reference no. */}
          <div>
            <label className="block text-[12px] text-text-2 mb-1.5">
              Approval / reference no.{' '}
              <span className="text-text-3">(optional)</span>
            </label>
            <input
              ref={refInputRef}
              type="text"
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="e.g. 004821"
              className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-[14px]
                         text-text font-mono
                         focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent
                         transition-colors duration-100"
            />
          </div>

          {/* Card last 4 */}
          <div>
            <label className="block text-[12px] text-text-2 mb-1.5">
              Card last 4 digits{' '}
              <span className="text-text-3">(optional)</span>
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={last4}
              onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="4321"
              className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-[18px]
                         text-center tracking-[0.4em] font-mono text-text
                         focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent
                         transition-colors duration-100"
            />
          </div>

          {/* Confirm */}
          <button
            type="button"
            onClick={() => onConfirm(ref.trim(), last4.trim())}
            className="w-full h-11 rounded-xl bg-accent text-accent-fg text-[14px] font-medium
                       hover:opacity-90 transition-opacity duration-100"
          >
            Confirm sale · Enter
          </button>
        </div>
      </div>
    </div>
  );
}
