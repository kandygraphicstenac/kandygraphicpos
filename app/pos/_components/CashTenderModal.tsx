'use client';

import { useEffect, useRef, useState } from 'react';

const LKR = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' });

type Props = {
  totalPaise: number;
  onConfirm: (tenderedPaise: number) => void;
  onClose: () => void;
};

const QUICK_AMOUNTS_LKR = [1000, 2000, 5000, 10000];

export function CashTenderModal({ totalPaise, onConfirm, onClose }: Props) {
  const totalLKR = totalPaise / 100;
  const [receivedLKR, setReceivedLKR] = useState(totalLKR);
  const inputRef = useRef<HTMLInputElement>(null);

  const changeLKR = receivedLKR - totalLKR;
  const changeReady = changeLKR >= 0;

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter' && changeReady) { e.preventDefault(); onConfirm(Math.round(receivedLKR * 100)); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, onConfirm, changeReady]);

  function handleInput(raw: string) {
    const n = parseFloat(raw);
    setReceivedLKR(Number.isFinite(n) && n >= 0 ? n : 0);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-text/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface rounded-2xl w-full max-w-sm overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-[15px] font-medium text-text">Cash payment</h2>
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
          {/* Total due */}
          <div className="text-center py-2">
            <p className="text-[12px] text-text-3 uppercase tracking-wide">Total due</p>
            <p className="text-[28px] font-medium tabular-nums text-text mt-0.5">
              {LKR.format(totalLKR)}
            </p>
          </div>

          {/* Amount received input */}
          <div>
            <label className="block text-[12px] text-text-2 mb-1.5">Amount received (LKR)</label>
            <input
              ref={inputRef}
              type="number"
              min={0}
              step={1}
              value={receivedLKR || ''}
              onChange={(e) => handleInput(e.target.value)}
              className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-[18px]
                         text-center tabular-nums text-text font-medium
                         focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent
                         transition-colors duration-100"
            />
          </div>

          {/* Quick amount buttons */}
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setReceivedLKR(totalLKR)}
              className="h-10 rounded-xl border border-border text-[12px] font-medium text-text
                         hover:border-border-hover hover:bg-border transition-colors duration-100"
            >
              Exact
            </button>
            {QUICK_AMOUNTS_LKR.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => setReceivedLKR(amt)}
                className="h-10 rounded-xl border border-border text-[12px] font-medium text-text
                           hover:border-border-hover hover:bg-border transition-colors duration-100"
              >
                {(amt / 1000).toFixed(0)}K
              </button>
            ))}
          </div>

          {/* Change due */}
          <div className="text-center py-2 border-t border-border">
            <p className="text-[12px] text-text-3 uppercase tracking-wide">Change due</p>
            <p
              className={[
                'text-[24px] font-medium tabular-nums mt-0.5 transition-colors duration-150',
                changeReady ? 'text-accent' : 'text-danger-fg',
              ].join(' ')}
            >
              {changeLKR < 0 ? '−' : ''}{LKR.format(Math.abs(changeLKR))}
            </p>
          </div>

          {/* Confirm */}
          <button
            type="button"
            onClick={() => onConfirm(Math.round(receivedLKR * 100))}
            disabled={!changeReady}
            className="w-full h-11 rounded-xl bg-accent text-accent-fg text-[14px] font-medium
                       disabled:opacity-40 disabled:cursor-not-allowed
                       enabled:hover:opacity-90 transition-opacity duration-100"
          >
            Confirm sale · Enter
          </button>
        </div>
      </div>
    </div>
  );
}
