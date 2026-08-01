'use client';

import { useEffect, useState } from 'react';
import type { SetDetailResult } from '@/lib/types/pos';
import type { PosSearchResult } from '@/lib/types/pos';
import { yearLabel } from '@/lib/utils/modelLabel';

const LKR = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' });

function stockPillCls(stock: number, reorderLevel: number) {
  if (stock === 0) return 'bg-danger-bg text-danger-fg';
  if (stock <= reorderLevel) return 'bg-warn-bg text-warn-fg';
  return 'bg-ok-bg text-ok-fg';
}

type Props = {
  setId: number;
  onAddToCart: (result: PosSearchResult) => void;
  onClose: () => void;
};

export function SetDetailModal({ setId, onAddToCart, onClose }: Props) {
  const [detail, setDetail] = useState<SetDetailResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/pos/set/${setId}`)
      .then((r) => r.json())
      .then((d: SetDetailResult) => { if (!cancelled) { setDetail(d); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [setId]);

  // Close on Esc
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function handleAdd() {
    if (!detail) return;
    // Reconstruct a SetResult shape for the cart
    const setResult: PosSearchResult = {
      type: 'set',
      id: detail.id,
      sku: detail.sku,
      name: detail.name,
      bikeModel: detail.bikeModel,
      color: detail.color,
      price: detail.price,
      imageUrl: detail.imageUrl,
      packedStock: detail.packedStock,
      availability: detail.availability,
      locationCode: detail.locationCode ?? null,
      exactMatch: false,
    };
    onAddToCart(setResult);
    onClose();
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-text/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Panel */}
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="text-[15px] font-medium text-text">Set details</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-text-3
                       hover:text-text hover:bg-border transition-colors duration-100"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
              <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="p-5 space-y-3 animate-pulse">
              <div className="aspect-[4/3] w-full rounded-xl bg-border" />
              <div className="h-5 w-3/4 rounded bg-border" />
              <div className="h-4 w-1/2 rounded bg-border" />
            </div>
          )}

          {!loading && detail && (
            <>
              {/* Set image */}
              <div className="aspect-[4/3] w-full overflow-hidden bg-pill-set-bg">
                {detail.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={detail.imageUrl}
                    alt={detail.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-pill-set-fg text-5xl font-medium select-none">
                      {detail.bikeModel.brand[0]?.toUpperCase()}
                    </span>
                  </div>
                )}
              </div>

              <div className="p-5 space-y-4">
                {/* Set info */}
                <div>
                  <h3 className="text-[16px] font-medium text-text">{detail.name}</h3>
                  <p className="text-[13px] text-text-2 mt-0.5">
                    {detail.bikeModel.brand} {detail.bikeModel.model} {yearLabel(detail.bikeModel.year, detail.bikeModel.yearEnd)}
                  </p>
                  <p className="text-[18px] font-medium tabular-nums text-text mt-2">
                    {LKR.format(parseFloat(detail.price))}
                  </p>
                  {detail.savingsPaise != null && (
                    <p className="text-[12px] text-ok-fg mt-0.5">
                      Save {LKR.format(detail.savingsPaise / 100)} vs individual parts
                    </p>
                  )}
                </div>

                {/* Components */}
                <div>
                  <p className="text-[11px] font-medium text-text-3 uppercase tracking-wide mb-2">
                    Includes {detail.components.length} parts
                  </p>
                  <div className="space-y-2">
                    {detail.components.map((c) => (
                      <div
                        key={c.part.id}
                        className="flex items-center gap-3 py-2 border-b border-border last:border-b-0"
                      >
                        {/* Thumbnail */}
                        <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-pill-part-bg flex items-center justify-center">
                          {c.part.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={c.part.imageUrl}
                              alt={c.part.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-pill-part-fg text-sm font-medium">
                              {detail.bikeModel.brand[0]}
                            </span>
                          )}
                        </div>

                        {/* Name + qty */}
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] text-text truncate">{c.part.name}</p>
                          <p className="text-[11px] text-text-3 font-mono tabular-nums">
                            {c.part.sku} · qty {c.qty}
                          </p>
                        </div>

                        {/* Stock pill */}
                        <span
                          className={`shrink-0 text-[11px] font-medium px-1.5 py-0.5 rounded-md tabular-nums ${stockPillCls(c.part.finishedStock, c.part.reorderLevel)}`}
                        >
                          {c.part.finishedStock === 0
                            ? 'Out'
                            : `Ready ${c.part.finishedStock}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Availability note */}
                <p className="text-[12px] text-text-3">
                  In stock: {detail.availability} packed kit{detail.availability !== 1 ? 's' : ''}
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!loading && detail && (
          <div className="px-5 py-4 border-t border-border shrink-0">
            <button
              type="button"
              onClick={handleAdd}
              disabled={detail.availability <= 0}
              className="w-full h-11 rounded-xl bg-accent text-accent-fg text-[14px] font-medium
                         disabled:opacity-40 disabled:cursor-not-allowed
                         enabled:hover:opacity-90 transition-opacity duration-100"
            >
              {detail.availability <= 0 ? 'Out of stock' : 'Add to cart'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
