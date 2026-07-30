'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { printLabels, type LabelFormat } from '@/lib/utils/printLabels';
import { labelRowFill, columnsForFormat, MAX_COPIES } from '@/lib/utils/labelLayout';

type LabelStock = { widthMm: number; heightMm: number; columns: number; columnGapMm: number; paddingMm: number };

interface Props {
  type: 'part' | 'set';
  ids: number[];
  /** Singular noun for the count line, e.g. "part". */
  itemLabel: string;
  onClose: () => void;
}

/**
 * Asks for copies before printing.
 *
 * printLabels() renders /catalog/labels inside a hidden 0x0 iframe and fires
 * window.print() immediately, so the toolbar on that page — including its
 * copies control — is never visible from the catalog tabs. This dialog collects
 * the quantity first and passes it through as `opts.qty`, keeping the fast
 * print-over-the-current-page behaviour instead of opening a new tab.
 */
export function PrintLabelsModal({ type, ids, itemLabel, onClose }: Props) {
  const [qty, setQty] = useState(1);
  const qtyRef = useRef<HTMLInputElement>(null);

  useEffect(() => { qtyRef.current?.select(); }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Both are shop-wide settings; GET on each is auth-only (only PUT is
  // OWNER-gated), so a CASHIER or CUTTER can read them to print correctly.
  const { data: stock } = useQuery<LabelStock>({
    queryKey: ['label-stock'],
    queryFn: () => fetch('/api/settings/label-stock').then((r) => r.json()),
    staleTime: 5 * 60_000,
  });

  const { data: formatData } = useQuery<{ format: LabelFormat }>({
    queryKey: ['label-format'],
    queryFn: () => fetch('/api/settings/label-format').then((r) => r.json()),
    staleTime: 5 * 60_000,
  });

  // Only affects the row-fill preview below. The print itself never depends on
  // this resolving: /catalog/labels reads the format server-side, so a slow
  // fetch here can't cause a fallback-to-A4 print.
  const format = formatData?.format;
  const columns = columnsForFormat(format ?? 'thermal', stock?.columns);
  const totalLabels = ids.length * qty;
  const { totalRows, blanks } = labelRowFill(totalLabels, columns);

  function clamp(v: number) { return Math.max(1, Math.min(MAX_COPIES, v)); }

  function handlePrint() {
    printLabels(type, ids, { qty });
    onClose();
  }

  const stepBtn =
    'w-8 h-8 rounded-lg border border-border text-text-2 hover:text-text hover:bg-bg ' +
    'transition-colors text-[15px] leading-none disabled:opacity-30 disabled:cursor-not-allowed';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface rounded-2xl shadow-xl w-full max-w-sm border border-border">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border">
          <div>
            <h2 className="text-[15px] font-semibold">Print labels</h2>
            <p className="text-[12px] text-text-3 mt-0.5">
              {ids.length} {itemLabel}{ids.length !== 1 ? 's' : ''} selected
              {format && ` · ${format === 'thermal' ? 'thermal' : 'A4'} format`}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-text-3 hover:text-text transition-colors">
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <form
          className="p-5 space-y-4"
          onSubmit={(e) => { e.preventDefault(); handlePrint(); }}
        >
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-text-2">Copies each</label>
            <div className="flex items-center gap-2">
              <button type="button" className={stepBtn} disabled={qty <= 1}
                onClick={() => setQty((q) => clamp(q - 1))} aria-label="One fewer copy">−</button>
              <input
                ref={qtyRef}
                type="number"
                min={1}
                max={MAX_COPIES}
                value={qty}
                onChange={(e) => setQty(clamp(parseInt(e.target.value, 10) || 1))}
                className="w-16 h-8 bg-bg border border-border rounded-lg text-[13px] text-text text-center
                           focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-colors"
              />
              <button type="button" className={stepBtn} disabled={qty >= MAX_COPIES}
                onClick={() => setQty((q) => clamp(q + 1))} aria-label="One more copy">+</button>
              <span className="text-[12px] text-text-3 ml-1">of each {itemLabel}</span>
            </div>
          </div>

          {/* How the batch lands on the stock — informational; the quantity is
              never rounded up and no filler label is added. */}
          <div className="px-3 py-2.5 bg-bg border border-border rounded-xl">
            <p className="text-[13px] text-text tabular-nums">
              {totalLabels} label{totalLabels !== 1 ? 's' : ''}
            </p>
            <p className={`text-[12px] mt-0.5 ${blanks === 0 ? 'text-text-3' : 'text-warn-fg font-medium'}`}>
              {blanks === 0
                ? `Fills ${totalRows} row${totalRows !== 1 ? 's' : ''} of ${columns}`
                : `${totalRows} row${totalRows !== 1 ? 's' : ''} of ${columns} — last row has ${blanks} blank${blanks !== 1 ? 's' : ''}`}
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 rounded-lg border border-border text-[13px] text-text-2 hover:text-text hover:border-border-hover transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="h-9 px-5 rounded-lg bg-accent text-accent-fg text-[13px] font-medium hover:opacity-90 transition-opacity"
            >
              Print
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
