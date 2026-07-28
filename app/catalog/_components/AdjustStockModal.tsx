'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LocationPicker } from './LocationPicker';

type Reason = 'INITIAL' | 'RECOUNT' | 'DAMAGE' | 'OTHER';

interface Props {
  /**
   * Which stock pool is being adjusted. Parts and sets are independent pools:
   * 'part' adjusts Part.finishedStock, 'set' adjusts StickerSet.packedStock.
   */
  kind: 'part' | 'set';
  item: { id: number; sku: string; name: string; stock: number; locationCode: string | null };
  onClose: () => void;
}

const REASONS: { value: Reason; label: string }[] = [
  { value: 'INITIAL', label: 'Initial stock' },
  { value: 'RECOUNT', label: 'Recount' },
  { value: 'DAMAGE', label: 'Damage / write-off' },
  { value: 'OTHER', label: 'Other' },
];

export function AdjustStockModal({ kind, item, onClose }: Props) {
  const qc = useQueryClient();
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState<Reason>('RECOUNT');
  const [note, setNote] = useState('');
  const [locationCode, setLocationCode] = useState<string | null>(item.locationCode);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const deltaNum = parseInt(delta, 10);
  const preview = isNaN(deltaNum) ? null : item.stock + deltaNum;

  const resource = kind === 'part' ? 'parts' : 'sets';

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/catalog/${resource}/${item.id}/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          delta: deltaNum,
          reason,
          note: note.trim() || undefined,
          locationCode: locationCode ?? null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? 'Adjustment failed');
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [resource] });
      void qc.invalidateQueries({ queryKey: ['pos-search'] });
      onClose();
    },
    onError: (e: Error) => setErr(e.message),
  });

  const inputCls =
    'w-full h-9 px-3 bg-bg border border-border rounded-lg text-[13px] text-text placeholder:text-text-3 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-colors';

  const canSubmit = !isNaN(deltaNum) && deltaNum !== 0 && (preview ?? -1) >= 0 && !mutation.isPending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface rounded-2xl shadow-xl w-full max-w-sm border border-border">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border">
          <div>
            <h2 className="text-[15px] font-semibold">Adjust Stock</h2>
            <p className="text-[12px] text-text-3 mt-0.5">{item.sku} — {item.name}</p>
          </div>
          <button type="button" onClick={onClose} className="text-text-3 hover:text-text transition-colors">
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <form className="p-5 space-y-4" onSubmit={(e) => { e.preventDefault(); if (canSubmit) mutation.mutate(); }}>
          <div className="flex items-center gap-4 px-4 py-3 bg-bg rounded-xl border border-border">
            <div>
              <p className="text-[11px] text-text-3 uppercase tracking-wide">Current stock</p>
              <p className="text-[24px] font-semibold tabular-nums">{item.stock}</p>
            </div>
            {preview !== null && (
              <>
                <svg className="w-4 h-4 text-text-3 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M3 8h10M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div>
                  <p className="text-[11px] text-text-3 uppercase tracking-wide">New stock</p>
                  <p className={`text-[24px] font-semibold tabular-nums ${preview < 0 ? 'text-danger-fg' : ''}`}>
                    {preview}
                  </p>
                </div>
              </>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-[12px] font-medium text-text-2">Delta (+ or −)</label>
            <input
              ref={inputRef}
              type="number"
              placeholder="+5 or -2"
              value={delta}
              onChange={(e) => { setDelta(e.target.value); setErr(null); }}
              className={inputCls}
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-[12px] font-medium text-text-2">Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as Reason)}
              className={inputCls}
            >
              {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>

          {reason === 'OTHER' && (
            <div className="space-y-1">
              <label className="text-[12px] font-medium text-text-2">Note</label>
              <input
                type="text"
                placeholder="Explain the adjustment…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className={inputCls}
              />
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[12px] font-medium text-text-2">
              Location
              <span className="ml-1.5 font-normal text-text-3">(optional — update shelf position)</span>
            </label>
            <LocationPicker value={locationCode} onChange={setLocationCode} />
          </div>

          {err && <p className="text-[12px] text-danger-fg">{err}</p>}

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
              disabled={!canSubmit}
              className="h-9 px-5 rounded-lg bg-accent text-accent-fg text-[13px] font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {mutation.isPending ? 'Saving…' : 'Apply'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
