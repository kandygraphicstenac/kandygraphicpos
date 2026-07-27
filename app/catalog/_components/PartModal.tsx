'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { suggestPartSku } from '@/lib/utils/skuGen';
import { LocationPicker } from './LocationPicker';
import { yearLabel } from '@/lib/utils/modelLabel';

type BikeModel = { id: number; brand: string; model: string; year: number; yearEnd: number | null; country: string | null };

type PartData = {
  id: number; sku: string; name: string; bikeModelId: number;
  colorScheme: string | null; color: string | null; material: string | null;
  price: string | null; cost?: string | null;
  reorderLevel: number; soldSeparately: boolean; isKit: boolean;
  imageUrl: string | null; active: boolean;
  locationCode: string | null;
};

interface Props {
  existing?: PartData;
  isOwner: boolean;
  onClose: () => void;
}

type FormState = {
  bikeModelId: string; name: string; sku: string; price: string; cost: string;
  reorderLevel: string; soldSeparately: boolean; isKit: boolean; colorScheme: string;
  color: string; material: string; active: boolean; imageUrl: string;
  locationCode: string | null;
};

export function PartModal({ existing, isOwner, onClose }: Props) {
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
    isKit: existing?.isKit ?? false,
    colorScheme: existing?.colorScheme ?? '',
    color: existing?.color ?? '',
    material: existing?.material ?? '',
    active: existing?.active ?? true,
    imageUrl: existing?.imageUrl ?? '',
    locationCode: existing?.locationCode ?? null,
  });
  const [skuManual, setSkuManual] = useState(isEdit);
  const [err, setErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const firstRef = useRef<HTMLSelectElement>(null);

  const { data: bikeModels = [] } = useQuery<BikeModel[]>({
    queryKey: ['bike-models'],
    queryFn: () => fetch('/api/catalog/bike-models').then((r) => r.json()),
    staleTime: 60_000,
  });

  useEffect(() => { firstRef.current?.focus(); }, []);

  const selectedModel = bikeModels.find((m) => m.id === parseInt(form.bikeModelId, 10));

  function set<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((f) => {
      const next = { ...f, [field]: value };
      if (!skuManual && (field === 'bikeModelId' || field === 'name')) {
        const m = bikeModels.find((bm) => bm.id === parseInt(next.bikeModelId, 10));
        if (m && next.name) {
          next.sku = suggestPartSku(m.brand, m.model, m.year, next.name);
        }
      }
      return next;
    });
    setErr(null);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/catalog/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr((d as { error?: string }).error ?? 'Upload failed');
        return;
      }
      const { url } = await res.json() as { url: string };
      setForm((f) => ({ ...f, imageUrl: url }));
    } finally {
      setUploading(false);
    }
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
        reorderLevel: parseInt(form.reorderLevel, 10) || 0,
        soldSeparately: form.soldSeparately,
        colorScheme: form.colorScheme.trim() || null,
        color: form.color.trim() || null,
        material: form.material.trim() || null,
        isKit: form.isKit,
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
            {isOwner && (
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
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
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
            <div className="space-y-1">
              <label className="text-[12px] font-medium text-text-2">Color Scheme</label>
              <input
                type="text"
                placeholder="e.g. Red/Black"
                value={form.colorScheme}
                onChange={(e) => set('colorScheme', e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[12px] font-medium text-text-2">Color</label>
              <input
                type="text"
                placeholder="e.g. Red, Chrome, Holographic"
                value={form.color}
                onChange={(e) => set('color', e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[12px] font-medium text-text-2">Material</label>
              <input
                type="text"
                placeholder="e.g. Laminated vinyl"
                value={form.material}
                onChange={(e) => set('material', e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[12px] font-medium text-text-2">Location</label>
            <LocationPicker
              value={form.locationCode}
              onChange={(code) => set('locationCode', code)}
            />
          </div>

          {/* Toggles */}
          <div className="flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.soldSeparately}
                onChange={(e) => set('soldSeparately', e.target.checked)}
                className="w-4 h-4 accent-accent"
              />
              <span className="text-[13px] text-text">Sold separately</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isKit}
                onChange={(e) => set('isKit', e.target.checked)}
                className="w-4 h-4 accent-accent"
              />
              <span className="text-[13px] text-text">This is a kit</span>
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

          {/* Image upload */}
          <div className="space-y-2">
            <label className="text-[12px] font-medium text-text-2">Image</label>
            <div className="flex items-center gap-3">
              {form.imageUrl && (
                <img
                  src={form.imageUrl}
                  alt="Part thumbnail"
                  className="w-12 h-12 object-cover rounded-lg border border-border shrink-0"
                />
              )}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="h-9 px-4 rounded-lg border border-border text-[13px] text-text-2 hover:text-text hover:border-border-hover transition-colors disabled:opacity-40"
              >
                {uploading ? 'Uploading…' : form.imageUrl ? 'Change image' : 'Upload image'}
              </button>
              {form.imageUrl && (
                <button
                  type="button"
                  onClick={() => set('imageUrl', '')}
                  className="text-[12px] text-danger-fg hover:opacity-75 transition-opacity"
                >
                  Remove
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileChange} />
          </div>

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
