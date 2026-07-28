'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { suggestSetSku } from '@/lib/utils/skuGen';
import { LocationPicker } from './LocationPicker';
import { yearLabel } from '@/lib/utils/modelLabel';

type BikeModel = { id: number; brand: string; model: string; year: number; yearEnd: number | null; country: string | null };
type Part = { id: number; sku: string; name: string; price: string | null; finishedStock: number };

type SetData = {
  id: number; sku: string; name: string; bikeModelId: number;
  setPrice: string; color: string | null; imageUrl: string | null; active: boolean;
  locationCode: string | null;
  components: { partId: number; qty: number; part: Part }[];
};

interface Props {
  existing?: SetData;
  onClose: () => void;
}

type ComponentRow = { partId: number; qty: number; part: Part };

export function SetModal({ existing, onClose }: Props) {
  const qc = useQueryClient();
  const isEdit = !!existing;

  const [bikeModelId, setBikeModelId] = useState(existing?.bikeModelId?.toString() ?? '');
  const [name, setName] = useState(existing?.name ?? '');
  const [sku, setSku] = useState(existing?.sku ?? '');
  const [setPrice, setSetPrice] = useState(existing?.setPrice ?? '');
  const [color, setColor] = useState(existing?.color ?? '');
  const [active, setActive] = useState(existing?.active ?? true);
  const [locationCode, setLocationCode] = useState<string | null>(existing?.locationCode ?? null);
  const [skuManual, setSkuManual] = useState(isEdit);
  const [components, setComponents] = useState<ComponentRow[]>(
    existing?.components ?? [],
  );
  const [partSearch, setPartSearch] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const firstRef = useRef<HTMLSelectElement>(null);

  useEffect(() => { firstRef.current?.focus(); }, []);

  const { data: bikeModels = [] } = useQuery<BikeModel[]>({
    queryKey: ['bike-models'],
    queryFn: () => fetch('/api/catalog/bike-models').then((r) => r.json()),
    staleTime: 60_000,
  });

  const numModelId = parseInt(bikeModelId, 10);
  const { data: allPartsData } = useQuery<{ parts: Part[] }>({
    queryKey: ['parts', { modelId: bikeModelId, pageSize: 200 }],
    queryFn: () =>
      fetch(`/api/catalog/parts?modelId=${numModelId}&pageSize=200`).then((r) => r.json()) as Promise<{ parts: Part[] }>,
    enabled: !!bikeModelId && !isNaN(numModelId),
    staleTime: 30_000,
  });

  const selectedModel = bikeModels.find((m) => m.id === numModelId);

  function handleModelChange(val: string) {
    setBikeModelId(val);
    setComponents([]);
    setPartSearch('');
    if (!skuManual && name) {
      const m = bikeModels.find((bm) => bm.id === parseInt(val, 10));
      if (m) setSku(suggestSetSku(m.model, m.year, name));
    }
    setErr(null);
  }

  function handleNameChange(val: string) {
    setName(val);
    if (!skuManual && selectedModel) {
      setSku(suggestSetSku(selectedModel.model, selectedModel.year, val));
    }
    setErr(null);
  }

  const availableParts = (allPartsData?.parts ?? []).filter(
    (p) =>
      !components.some((c) => c.partId === p.id) &&
      (partSearch === '' ||
        p.name.toLowerCase().includes(partSearch.toLowerCase()) ||
        p.sku.toLowerCase().includes(partSearch.toLowerCase())),
  );

  function addComponent(part: Part) {
    setComponents((cs) => [...cs, { partId: part.id, qty: 1, part }]);
    setPartSearch('');
  }

  function removeComponent(partId: number) {
    setComponents((cs) => cs.filter((c) => c.partId !== partId));
  }

  function setQty(partId: number, qty: number) {
    if (qty < 1) return;
    setComponents((cs) => cs.map((c) => (c.partId === partId ? { ...c, qty } : c)));
  }

  // Sum of component prices — null when any component has no price, so the
  // comparison is suppressed rather than understated by treating null as 0.
  const missingPrice = components.some((c) => c.part.price == null);
  const sumOfParts = missingPrice
    ? null
    : components.reduce((sum, c) => sum + parseFloat(c.part.price!) * c.qty, 0);
  const setPriceNum = parseFloat(setPrice) || 0;
  const discount =
    sumOfParts != null && sumOfParts > 0
      ? ((sumOfParts - setPriceNum) / sumOfParts) * 100
      : 0;

  const LKR = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' });

  const mutation = useMutation({
    mutationFn: async () => {
      const url = isEdit ? `/api/catalog/sets/${existing!.id}` : '/api/catalog/sets';
      const body = {
        bikeModelId: numModelId,
        name: name.trim(),
        sku: sku.trim(),
        setPrice,
        components: components.map((c) => ({ partId: c.partId, qty: c.qty })),
        color: color.trim() || null,
        locationCode: locationCode ?? null,
        ...(isEdit ? { active } : {}),
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
      void qc.invalidateQueries({ queryKey: ['sets'] });
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
      <div className="bg-surface rounded-2xl shadow-xl w-full max-w-xl border border-border max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border shrink-0">
          <h2 className="text-[15px] font-semibold">{isEdit ? 'Edit Set' : 'New Sticker Set'}</h2>
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
              value={bikeModelId}
              onChange={(e) => handleModelChange(e.target.value)}
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

          {/* Name + SKU */}
          <div className="space-y-1">
            <label className="text-[12px] font-medium text-text-2">Set Name</label>
            <input
              type="text"
              placeholder="e.g. Full Graphics Kit"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              className={inputCls}
              required
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[12px] font-medium text-text-2">SKU / Barcode</label>
              {!skuManual && selectedModel && name && (
                <span className="text-[11px] text-accent">Auto-suggested</span>
              )}
            </div>
            <input
              type="text"
              value={sku}
              onChange={(e) => { setSkuManual(true); setSku(e.target.value); setErr(null); }}
              className={`${inputCls} font-mono`}
              required
            />
          </div>

          {/* Price + indicator */}
          <div className="space-y-1">
            <label className="text-[12px] font-medium text-text-2">Set Price (LKR)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={setPrice}
              onChange={(e) => { setSetPrice(e.target.value); setErr(null); }}
              className={inputCls}
              required
            />
            {components.length > 0 && missingPrice && (
              <p className="text-[12px] text-text-3 mt-1">
                Sum of parts unavailable — some components have no price.
              </p>
            )}
            {components.length > 0 && sumOfParts != null && sumOfParts > 0 && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[12px] text-text-3">Sum of parts: {LKR.format(sumOfParts)}</span>
                {setPriceNum > 0 && (
                  <span className={`text-[12px] font-medium ${discount > 0 ? 'text-ok-fg' : discount < 0 ? 'text-danger-fg' : 'text-text-3'}`}>
                    {discount > 0 ? `${discount.toFixed(1)}% discount` : discount < 0 ? `${Math.abs(discount).toFixed(1)}% above parts` : 'Same as parts'}
                  </span>
                )}
              </div>
            )}
          </div>

          {isEdit && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="w-4 h-4 accent-accent"
              />
              <span className="text-[13px] text-text">Active</span>
            </label>
          )}

          <div className="space-y-1">
            <label className="text-[12px] font-medium text-text-2">Color</label>
            <input
              type="text"
              placeholder="e.g. Red, Chrome, Holographic"
              value={color}
              onChange={(e) => { setColor(e.target.value); setErr(null); }}
              className={inputCls}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[12px] font-medium text-text-2">Location</label>
            <LocationPicker value={locationCode} onChange={setLocationCode} />
          </div>

          {/* Component picker */}
          <div className="space-y-2">
            <label className="text-[12px] font-medium text-text-2">Kit contents</label>
            <p className="text-[11px] text-text-3 -mt-0.5">
              For reference only — a kit has its own stock, so this list does not
              affect availability and selling a kit never deducts these parts.
            </p>

            {components.length > 0 && (
              <div className="space-y-1.5">
                {components.map((c) => (
                  <div key={c.partId} className="flex items-center gap-2 px-3 py-2 bg-bg border border-border rounded-lg">
                    <span className="flex-1 text-[13px] text-text truncate">{c.part.name}</span>
                    <span className="text-[11px] text-text-3 font-mono">{c.part.sku}</span>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => setQty(c.partId, c.qty - 1)}
                        className="w-6 h-6 rounded border border-border text-text-2 hover:text-text hover:bg-surface transition-colors text-[13px] leading-none">−</button>
                      <span className="w-6 text-center text-[13px] tabular-nums">{c.qty}</span>
                      <button type="button" onClick={() => setQty(c.partId, c.qty + 1)}
                        className="w-6 h-6 rounded border border-border text-text-2 hover:text-text hover:bg-surface transition-colors text-[13px] leading-none">+</button>
                    </div>
                    <button type="button" onClick={() => removeComponent(c.partId)}
                      className="text-danger-fg hover:opacity-75 transition-opacity text-[12px]">✕</button>
                  </div>
                ))}
              </div>
            )}

            {bikeModelId && (
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search parts to add…"
                  value={partSearch}
                  onChange={(e) => setPartSearch(e.target.value)}
                  className={inputCls}
                />
                {partSearch && availableParts.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-surface border border-border rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                    {availableParts.slice(0, 20).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => addComponent(p)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-bg transition-colors text-[13px]"
                      >
                        <span className="flex-1 truncate">{p.name}</span>
                        <span className="text-[11px] font-mono text-text-3">{p.sku}</span>
                        <span className="text-[11px] text-text-3">×{p.finishedStock}</span>
                      </button>
                    ))}
                  </div>
                )}
                {partSearch && availableParts.length === 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-surface border border-border rounded-xl shadow-lg px-3 py-2 text-[13px] text-text-3">
                    No parts found
                  </div>
                )}
              </div>
            )}

            {!bikeModelId && (
              <p className="text-[12px] text-text-3">Select a bike model first to pick components.</p>
            )}
          </div>

          {err && <p className="text-[12px] text-danger-fg">{err}</p>}

          <div className="flex justify-end gap-2 pt-1 shrink-0">
            <button type="button" onClick={onClose}
              className="h-9 px-4 rounded-lg border border-border text-[13px] text-text-2 hover:text-text hover:border-border-hover transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={mutation.isPending || components.length === 0}
              className="h-9 px-5 rounded-lg bg-accent text-accent-fg text-[13px] font-medium hover:opacity-90 transition-opacity disabled:opacity-40">
              {mutation.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
