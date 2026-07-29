'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { suggestPartSku } from '@/lib/utils/skuGen';
import { LocationPicker } from './LocationPicker';
import { ImageUpload } from '@/components/ImageUpload';
import { yearLabel } from '@/lib/utils/modelLabel';

type BikeModel = { id: number; brand: string; model: string; year: number; yearEnd: number | null; country: string | null };

type PartData = {
  id: number; sku: string; name: string; bikeModelId: number;
  color: string | null;
  price: string | null; cost?: string | null;
  reorderLevel: number; soldSeparately: boolean;
  imageUrl: string | null; active: boolean;
  locationCode: string | null;
};

interface Props {
  existing?: PartData;
  onClose: () => void;
}

type FormState = {
  bikeModelId: string; name: string; sku: string; price: string; cost: string;
  reorderLevel: string; soldSeparately: boolean;
  color: string; active: boolean; imageUrl: string;
  locationCode: string | null;
};

export function PartModal({ existing, onClose }: Props) {
  const qc = useQueryClient();
  const isEdit = !!existing;

  const [form, setForm] = useState<FormState>({
    bikeModelId: existing?.bikeModelId?.toString() ?? '',
    name: existing?.name ?? '',
    sku: existing?.sku ?? '',
    price: existing?.price ?? '',  // empty string = null on save
    cost: existing?.cost ?? '',
    reorderLevel: existing?.reorderLevel?.toString() ?? '0',
    soldSeparately: existing?.soldSeparately ?? true,
    color: existing?.color ?? '',
    active: existing?.active ?? true,
    imageUrl: existing?.imageUrl ?? '',
    locationCode: existing?.locationCode ?? null,
  });
  const [skuManual, setSkuManual] = useState(isEdit);
  const [err, setErr] = useState<string | null>(null);
  const firstRef = useRef<HTMLSelectElement>(null);

  // /options, not the paginated list — a dropdown fed from page 1 could not
  // reach the 26th model. Nested key so ['bike-models'] invalidations still hit it.
  const { data: bikeModels = [] } = useQuery<BikeModel[]>({
    queryKey: ['bike-models', 'options'],
    queryFn: () => fetch('/api/catalog/bike-models/options').then((r) => r.json()),
    staleTime: 60_000,
  });

  useEffect(() => { firstRef.current?.focus(); }, []);

  const selectedModel = bikeModels.find((m) => m.id === parseInt(form.bikeModelId, 10));

  function set<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((f) => {
      const next = { ...f, [field]: value };
      // Colour is part of the suggestion: the same part in red and in blue are
      // different products with different barcodes. skuManual is true for the
      // whole life of an edit modal, so a saved SKU is never rewritten here.
      if (!skuManual && (field === 'bikeModelId' || field === 'name' || field === 'color')) {
        const m = bikeModels.find((bm) => bm.id === parseInt(next.bikeModelId, 10));
        if (m && next.name) {
          next.sku = suggestPartSku(m.brand, m.model, m.year, next.name, next.color);
        }
      }
      return next;
    });
    setErr(null);
  }


  const mutation = useMutation({
    mutationFn: async () => {
      const url = isEdit ? `/api/catalog/parts/${existing!.id}` : '/api/catalog/parts';
      const body = {
        bikeModelId: parseInt(form.bikeModelId, 10),
        name: form.name.trim(),
        sku: form.sku.trim(),
        price: form.price || null,
        cost: form.cost || null,
        // Sent even when their inputs are hidden (kit components): hiding is
        // presentational, so a stored shelf code / reorder level survives a
        // round-trip instead of being silently wiped.
        reorderLevel: parseInt(form.reorderLevel, 10) || 0,
        soldSeparately: form.soldSeparately,
        color: form.color.trim() || null,
        imageUrl: form.imageUrl || null,
        locationCode: form.locationCode ?? null,
        ...(isEdit ? { active: form.active } : {}),
      };
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error ?? 'Save failed');
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['parts'] });
      onClose();
    },
    onError: (e: Error) => setErr(e.message),
  });

  const inputCls =
    'w-full h-9 px-3 bg-bg border border-border rounded-lg text-[13px] text-text placeholder:text-text-3 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-colors';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface rounded-2xl shadow-xl w-full max-w-lg border border-border max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border shrink-0">
          <h2 className="text-[15px] font-semibold">{isEdit ? 'Edit Part' : 'New Part'}</h2>
          <button type="button" onClick={onClose} className="text-text-3 hover:text-text transition-colors">
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <form
          className="p-5 space-y-4 overflow-y-auto"
          onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}
        >
          {/* Bike model */}
          <div className="space-y-1">
            <label className="text-[12px] font-medium text-text-2">Bike Model</label>
            <select
              ref={firstRef}
              value={form.bikeModelId}
              onChange={(e) => set('bikeModelId', e.target.value)}
              className={inputCls}
              required
            >
              <option value="">Select a bike model…</option>
              {bikeModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.brand} {m.model} {yearLabel(m.year, m.yearEnd)}{m.country ? ` (${m.country})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Name */}
          <div className="space-y-1">
            <label className="text-[12px] font-medium text-text-2">Name</label>
            <input
              type="text"
              placeholder="e.g. Tank Left"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              className={inputCls}
              required
            />
          </div>

          {/* SKU */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[12px] font-medium text-text-2">SKU / Barcode</label>
              {!skuManual && selectedModel && form.name && (
                <span className="text-[11px] text-accent">Auto-suggested</span>
              )}
            </div>
            <input
              type="text"
              placeholder="e.g. BJJ-PLS15019-TL"
              value={form.sku}
              onChange={(e) => { setSkuManual(true); set('sku', e.target.value); }}
              onBlur={() => { if (!form.sku.trim() && selectedModel && form.name) setSkuManual(false); }}
              className={`${inputCls} font-mono`}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[12px] font-medium text-text-2">
                Price (LKR)
                {!form.soldSeparately && (
                  <span className="ml-1.5 font-normal text-text-3">(optional)</span>
                )}
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={form.price}
                onChange={(e) => set('price', e.target.value)}
                className={inputCls}
                required={form.soldSeparately}
              />
              {form.soldSeparately && !form.price && (
                <p className="text-[11px] text-warn-fg">Sold-separately item needs a price</p>
              )}
            </div>
            {/* Cost is visible to everyone with catalog access (OWNER + CUTTER).
                To hide it from CUTTER, gate this on canViewCatalogCost(role)
                and narrow that helper in lib/permissions.ts. */}
            <div className="space-y-1">
              <label className="text-[12px] font-medium text-text-2">Cost (LKR)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={form.cost}
                onChange={(e) => set('cost', e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          {/* Reorder Level and Location apply only to a part sold loose.
              A kit component goes from uncut sheet straight into a packed kit,
              so it is never racked and never holds loose selling stock —
              a shelf code and a low-stock threshold are both meaningless.
              Hidden only: the stored values are still submitted below, so
              nothing is wiped and they reappear if this is re-ticked. */}
          <div className="grid grid-cols-2 gap-3">
            {form.soldSeparately && (
              <div className="space-y-1">
                <label className="text-[12px] font-medium text-text-2">Reorder Level</label>
                <input
                  type="number"
                  min="0"
                  value={form.reorderLevel}
                  onChange={(e) => set('reorderLevel', e.target.value)}
                  className={inputCls}
                />
              </div>
            )}
            {/* Colour spans the row when Reorder Level is hidden. */}
            <div className={form.soldSeparately ? 'space-y-1' : 'space-y-1 col-span-2'}>
              <label className="text-[12px] font-medium text-text-2">Color</label>
              <input
                type="text"
                placeholder="e.g. Red, Blue/Red"
                value={form.color}
                onChange={(e) => set('color', e.target.value)}
                className={inputCls}
              />
              <p className="text-[11px] text-text-3">Included in the suggested SKU.</p>
            </div>
          </div>

          {form.soldSeparately && (
            <div className="space-y-1">
              <label className="text-[12px] font-medium text-text-2">Location</label>
              <LocationPicker
                value={form.locationCode}
                onChange={(code) => set('locationCode', code)}
              />
            </div>
          )}

          {/* Toggles */}
          <div className="flex flex-wrap items-center gap-6">
            {/* The only control for this: unticked means the part is a kit
                component — no price needed, hidden from the POS, and badged
                "Kit part". There is no separate "is a kit" flag. */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.soldSeparately}
                onChange={(e) => set('soldSeparately', e.target.checked)}
                className="w-4 h-4 accent-accent"
              />
              <span className="text-[13px] text-text">Sold separately</span>
            </label>
            {isEdit && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => set('active', e.target.checked)}
                  className="w-4 h-4 accent-accent"
                />
                <span className="text-[13px] text-text">Active</span>
              </label>
            )}
          </div>

          {/* Kit components never reach the POS, so they don't need a photo.
              Hidden only — imageUrl is still submitted below, so a stored image
              survives and reappears if "Sold separately" is re-ticked. */}
          {form.soldSeparately && (
            <ImageUpload
              label="Product image"
              value={form.imageUrl || null}
              onChange={(url) => set('imageUrl', url ?? '')}
            />
          )}

          {err && <p className="text-[12px] text-danger-fg">{err}</p>}

          <div className="flex justify-end gap-2 pt-1 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 rounded-lg border border-border text-[13px] text-text-2 hover:text-text hover:border-border-hover transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending || (form.soldSeparately && !form.price)}
              className="h-9 px-5 rounded-lg bg-accent text-accent-fg text-[13px] font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {mutation.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
