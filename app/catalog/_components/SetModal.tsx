'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { suggestSetSku } from '@/lib/utils/skuGen';
import { LocationPicker } from './LocationPicker';
import { ImageUpload } from '@/components/ImageUpload';
import { useDebounced } from '@/lib/hooks/useDebounced';
import { yearLabel } from '@/lib/utils/modelLabel';

type BikeModel = { id: number; brand: string; model: string; year: number; yearEnd: number | null; country: string | null };
// `color` matters here: several parts share a name ("tank left") and differ
// only by colour, which was previously readable only by decoding the SKU.
type Part = {
  id: number; sku: string; name: string;
  price: string | null; finishedStock: number; color: string | null;
};

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

/**
 * Pre-filled name for a NEW set — nearly every set is this product, so the
 * owner would otherwise retype it for each of ~3,000 entries.
 *
 * A real editable value, not a placeholder: tab past it and save. Applied once
 * in the useState initialiser, so clearing or changing it sticks.
 *
 * Note this feeds the SKU suggestion — its initials become the SKU's last
 * segment ("Full Sticker Kit" -> FSK). Changing this string changes suggested
 * SKUs for new sets; skuGen.test.ts pins that link.
 */
export const DEFAULT_SET_NAME = 'Full Sticker Kit';

export function SetModal({ existing, onClose }: Props) {
  const qc = useQueryClient();
  const isEdit = !!existing;

  const [bikeModelId, setBikeModelId] = useState(existing?.bikeModelId?.toString() ?? '');
  // `existing?.name ?? ...` — the default can only apply when there is no
  // existing set, so an Edit modal always shows the saved name.
  const [name, setName] = useState(existing?.name ?? DEFAULT_SET_NAME);
  const [sku, setSku] = useState(existing?.sku ?? '');
  const [setPrice, setSetPrice] = useState(existing?.setPrice ?? '');
  const [color, setColor] = useState(existing?.color ?? '');
  const [imageUrl, setImageUrl] = useState<string | null>(existing?.imageUrl ?? null);
  const [active, setActive] = useState(existing?.active ?? true);
  const [locationCode, setLocationCode] = useState<string | null>(existing?.locationCode ?? null);
  const [skuManual, setSkuManual] = useState(isEdit);
  const [components, setComponents] = useState<ComponentRow[]>(
    existing?.components ?? [],
  );
  const [partSearch, setPartSearch] = useState('');
  const [colorFilter, setColorFilter] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const firstRef = useRef<HTMLSelectElement>(null);

  useEffect(() => { firstRef.current?.focus(); }, []);

  // /options, not the paginated list — see PartModal.
  const { data: bikeModels = [] } = useQuery<BikeModel[]>({
    queryKey: ['bike-models', 'options'],
    queryFn: () => fetch('/api/catalog/bike-models/options').then((r) => r.json()),
    staleTime: 60_000,
  });

  const numModelId = parseInt(bikeModelId, 10);
  const debouncedPartSearch = useDebounced(partSearch, 300);

  // Search AND colour are applied on the SERVER, alongside the existing
  // pageSize clamp. With no search and no colour this returns the model's
  // parts, which is what makes the list browsable before any typing.
  const partParams = new URLSearchParams({ modelId: String(numModelId), pageSize: '100' });
  if (debouncedPartSearch.trim()) partParams.set('q', debouncedPartSearch.trim());
  if (colorFilter) partParams.set('color', colorFilter);

  const { data: allPartsData, isFetching: partsFetching } = useQuery<{ parts: Part[]; total: number }>({
    queryKey: ['parts', { modelId: bikeModelId, q: debouncedPartSearch, color: colorFilter, picker: true }],
    queryFn: () =>
      fetch(`/api/catalog/parts?${partParams}`).then((r) => r.json()) as Promise<{ parts: Part[]; total: number }>,
    enabled: !!bikeModelId && !isNaN(numModelId),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  // Option list for the colour filter — the colours actually on this model's
  // parts, from the server, not scraped off the current page of results.
  const { data: colorOptions = [] } = useQuery<string[]>({
    queryKey: ['part-colors', bikeModelId],
    queryFn: () =>
      fetch(`/api/catalog/parts/colors?modelId=${numModelId}`).then((r) => r.json()) as Promise<string[]>,
    enabled: !!bikeModelId && !isNaN(numModelId),
    staleTime: 60_000,
  });

  const selectedModel = bikeModels.find((m) => m.id === numModelId);

  // The SKU suggestion derives from model + name + colour. Colour is included
  // because a red kit and a blue kit are different products with their own
  // barcode — without it the second one collides on "SKU already exists".
  // skuManual is true for the whole life of an edit modal, so a saved SKU is
  // never rewritten by any of these.
  function handleModelChange(val: string) {
    setBikeModelId(val);
    setComponents([]);
    setPartSearch('');
    setColorFilter(''); // colours are per-model, so the old selection is meaningless
    if (!skuManual && name) {
      const m = bikeModels.find((bm) => bm.id === parseInt(val, 10));
      if (m) setSku(suggestSetSku(m.model, m.year, name, color));
    }
    setErr(null);
  }

  function handleNameChange(val: string) {
    setName(val);
    if (!skuManual && selectedModel) {
      setSku(suggestSetSku(selectedModel.model, selectedModel.year, val, color));
    }
    setErr(null);
  }

  function handleColorChange(val: string) {
    setColor(val);
    if (!skuManual && selectedModel && name) {
      setSku(suggestSetSku(selectedModel.model, selectedModel.year, name, val));
    }
    setErr(null);
  }

  // Matching is done by the query above. Already-added parts stay in the list
  // marked "Added" rather than disappearing, so rows don't shift under the
  // cursor while picking and the owner can see what's already in the kit.
  const browseParts = allPartsData?.parts ?? [];
  const addedIds = new Set(components.map((c) => c.partId));

  function addComponent(part: Part) {
    setComponents((cs) => [...cs, { partId: part.id, qty: 1, part }]);
    // Search is deliberately NOT cleared: the list is browsable now, so
    // clearing it would throw away the filtering the user just applied and
    // reset the panel after every single add.
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
        imageUrl: imageUrl || null,
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
              onChange={(e) => handleColorChange(e.target.value)}
              className={inputCls}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[12px] font-medium text-text-2">Location</label>
            <LocationPicker value={locationCode} onChange={setLocationCode} />
          </div>

          {/* A kit is the thing most customers actually buy, so the photo
              matters more here than on a loose part. Optional, like everywhere. */}
          <ImageUpload
            label="Kit image"
            value={imageUrl}
            onChange={(url) => { setImageUrl(url); setErr(null); }}
          />

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
                    {/* Colour shown after adding too, so a wrong-colour pick is
                        still visible once it's in the kit. */}
                    <span className="flex-1 min-w-0 text-[13px] text-text truncate">
                      {c.part.name}
                      {c.part.color && (
                        <span className="text-text-2"> · {c.part.color}</span>
                      )}
                    </span>
                    <span className="text-[11px] text-text-3 font-mono shrink-0">{c.part.sku}</span>
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
              <div className="space-y-2 pt-1">
                <p className="text-[11px] font-medium text-text-2 uppercase tracking-wide">Add parts</p>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Search parts…"
                    value={partSearch}
                    onChange={(e) => setPartSearch(e.target.value)}
                    className={`${inputCls} flex-1`}
                  />
                  {/* Options come from this model's parts (server-side); the
                      filter itself is applied in the query, not on the array. */}
                  <select
                    value={colorFilter}
                    onChange={(e) => setColorFilter(e.target.value)}
                    className="h-9 px-2 bg-bg border border-border rounded-lg text-[13px] text-text focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-colors max-w-40"
                    aria-label="Filter parts by colour"
                  >
                    <option value="">Any colour</option>
                    {colorOptions.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {/* Browsable by default: with no search and no colour this is
                    simply the model's parts. */}
                <div className="border border-border rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                  {browseParts.length === 0 ? (
                    <p className="px-3 py-4 text-[13px] text-text-3 text-center">
                      {partsFetching
                        ? 'Loading…'
                        : partSearch || colorFilter
                          ? 'No parts match this search or colour'
                          : 'This bike model has no parts yet'}
                    </p>
                  ) : (
                    browseParts.map((p) => {
                      const added = addedIds.has(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          disabled={added}
                          onClick={() => addComponent(p)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] border-b border-border last:border-b-0
                                     enabled:hover:bg-bg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <span className="flex-1 min-w-0 truncate">
                            {p.name}
                            {/* The whole point: several parts share a name and
                                differ only by colour. No dangling separator
                                when colour is empty. */}
                            {p.color && <span className="text-text-2"> · {p.color}</span>}
                          </span>
                          <span className="text-[11px] font-mono text-text-3 shrink-0">{p.sku}</span>
                          <span className="text-[11px] text-text-3 tabular-nums shrink-0 w-8 text-right">
                            ×{p.finishedStock}
                          </span>
                          <span className="text-[11px] shrink-0 w-10 text-right">
                            {added ? <span className="text-text-3">Added</span> : <span className="text-accent">Add</span>}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>

                {allPartsData && allPartsData.total > browseParts.length && (
                  <p className="text-[11px] text-text-3">
                    Showing {browseParts.length} of {allPartsData.total} — narrow with search or colour.
                  </p>
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
