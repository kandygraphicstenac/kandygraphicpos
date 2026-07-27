'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { printLabels } from '@/lib/utils/printLabels';
import { PartModal } from './PartModal';
import { AdjustStockModal } from './AdjustStockModal';
import { yearLabel } from '@/lib/utils/modelLabel';

type BikeModel = { id: number; brand: string; model: string; year: number; yearEnd: number | null; country: string | null };

type Part = {
  id: number; sku: string; name: string; bikeModelId: number;
  bikeModel: BikeModel; colorScheme: string | null; color: string | null;
  material: string | null; price: string | null; cost?: string | null;
  finishedStock: number; reorderLevel: number;
  soldSeparately: boolean; isKit: boolean; imageUrl: string | null;
  active: boolean; hasTransactions: boolean;
  locationCode: string | null;
};

type PartsPage = {
  parts: Part[];
  total: number; page: number; pageSize: number; pageCount: number;
};

interface Props { isOwner: boolean }

const LKR = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' });

export function PartsTab({ isOwner }: Props) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [modelId, setModelId] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [modal, setModal] = useState<
    | { type: 'create' }
    | { type: 'edit'; part: Part }
    | { type: 'adjust'; part: Part }
    | null
  >(null);

  const { data: bikeModels = [] } = useQuery<BikeModel[]>({
    queryKey: ['bike-models'],
    queryFn: () => fetch('/api/catalog/bike-models').then((r) => r.json()),
    staleTime: 60_000,
  });

  const params = new URLSearchParams({ page: String(page), pageSize: '25' });
  if (q) params.set('q', q);
  if (modelId) params.set('modelId', modelId);

  const partsQueryKey = ['parts', { q, modelId, page }] as const;

  const { data, isLoading } = useQuery<PartsPage>({
    queryKey: partsQueryKey,
    queryFn: () => fetch(`/api/catalog/parts?${params}`).then((r) => r.json()),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/catalog/parts/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error ?? 'Delete failed');
      }
      return res.json().catch(() => null);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['parts'] });
      void qc.invalidateQueries({ queryKey: ['pos-search'] });
      void qc.invalidateQueries({ queryKey: ['pos-filters'] });
    },
  });

  const activateMutation = useMutation({
    mutationFn: async ({ id, active }: { id: number; active: boolean }) => {
      const res = await fetch(`/api/catalog/parts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error ?? 'Toggle failed');
      }
    },
    // Optimistic update: flip in cache immediately
    onMutate: async ({ id, active }) => {
      await qc.cancelQueries({ queryKey: ['parts'] });
      const prev = qc.getQueryData<PartsPage>(partsQueryKey);
      qc.setQueryData<PartsPage>(partsQueryKey, (old) =>
        old
          ? { ...old, parts: old.parts.map((p) => (p.id === id ? { ...p, active } : p)) }
          : old,
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(partsQueryKey, ctx.prev);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['parts'] });
      void qc.invalidateQueries({ queryKey: ['pos-search'] });
      void qc.invalidateQueries({ queryKey: ['pos-filters'] });
    },
  });

  const parts = data?.parts ?? [];
  const allOnPageIds = parts.map((p) => p.id);
  const allSelected = allOnPageIds.length > 0 && allOnPageIds.every((id) => selected.has(id));

  function toggleAll() {
    setSelected((s) => {
      const next = new Set(s);
      if (allSelected) allOnPageIds.forEach((id) => next.delete(id));
      else allOnPageIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function toggleOne(id: number) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const chipCls = (active: boolean) =>
    [
      'h-8 px-3 rounded-full text-[12px] font-medium transition-colors whitespace-nowrap',
      active
        ? 'bg-accent text-accent-fg'
        : 'border border-border text-text-2 hover:border-border-hover hover:text-text',
    ].join(' ');

  // Content cells are muted when part is inactive; action cells (toggle, buttons) stay opaque.
  const contentMuted = (active: boolean) => (active ? '' : 'text-text-3');

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-3 pointer-events-none" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="6.5" cy="6.5" r="4.5" /><path d="M10.5 10.5l3 3" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            placeholder="Search SKU or name…"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            className="pl-8 pr-3 h-9 w-52 bg-surface border border-border rounded-lg text-[13px] text-text placeholder:text-text-3 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-colors"
          />
        </div>

        <select
          value={modelId}
          onChange={(e) => { setModelId(e.target.value); setPage(1); }}
          className="h-9 px-3 bg-surface border border-border rounded-lg text-[13px] text-text focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-colors"
        >
          <option value="">All models</option>
          {bikeModels.map((m) => (
            <option key={m.id} value={m.id}>
              {m.brand} {m.model} {yearLabel(m.year, m.yearEnd)}
            </option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-2">
          {selected.size > 0 && (
            <button
              type="button"
              onClick={() => printLabels('part', [...selected])}
              className="h-8 px-4 rounded-lg border border-border text-[12px] text-text-2 hover:text-text hover:border-border-hover transition-colors"
            >
              Print labels ({selected.size})
            </button>
          )}
          {isOwner && (
            <button
              type="button"
              onClick={() => setModal({ type: 'create' })}
              className="h-8 px-4 rounded-lg bg-accent text-accent-fg text-[13px] font-medium hover:opacity-90 transition-opacity"
            >
              + New part
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center text-text-3 text-[13px]">Loading…</div>
        ) : parts.length === 0 ? (
          <div className="py-16 text-center text-text-3 text-[13px]">
            {q || modelId ? 'No parts match this filter' : 'No parts yet'}
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-text-3 text-[11px] uppercase tracking-wide">
                <th className="pl-4 pr-2 py-3">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="w-3.5 h-3.5 accent-accent" />
                </th>
                <th className="text-left px-3 py-3 font-medium w-10" />
                <th className="text-left px-3 py-3 font-medium">SKU</th>
                <th className="text-left px-3 py-3 font-medium">Name</th>
                <th className="text-left px-3 py-3 font-medium hidden xl:table-cell">Color</th>
                <th className="text-left px-3 py-3 font-medium hidden md:table-cell">Model</th>
                <th className="text-right px-3 py-3 font-medium">Price</th>
                {isOwner && <th className="text-right px-3 py-3 font-medium hidden lg:table-cell">Cost</th>}
                <th className="text-right px-3 py-3 font-medium">Stock</th>
                <th className="text-right px-3 py-3 font-medium hidden sm:table-cell">Reorder</th>
                <th className="text-left px-3 py-3 font-medium hidden lg:table-cell">Location</th>
                <th className="px-3 py-3 font-medium text-center hidden sm:table-cell">Active</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {parts.map((p) => {
                const lowStock = p.finishedStock <= p.reorderLevel;
                const muted = contentMuted(p.active);
                return (
                  // No opacity on the tr — toggle and Edit must remain at full opacity
                  <tr key={p.id} className="border-b border-border last:border-b-0 hover:bg-bg transition-colors duration-75">
                    <td className="pl-4 pr-2 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => toggleOne(p.id)}
                        className="w-3.5 h-3.5 accent-accent"
                      />
                    </td>
                    {/* Thumbnail — fade image to 50% when inactive */}
                    <td className="px-3 py-3">
                      {p.imageUrl ? (
                        <img
                          src={p.imageUrl}
                          alt=""
                          className={`w-8 h-8 object-cover rounded border border-border ${!p.active ? 'opacity-50' : ''}`}
                        />
                      ) : (
                        <div className={`w-8 h-8 rounded border border-border bg-bg ${!p.active ? 'opacity-50' : ''}`} />
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className={`flex items-center gap-1.5 font-mono text-[12px] ${muted || 'text-text'}`}>
                        {p.isKit && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-pill-set-bg text-pill-set-fg shrink-0">
                            Kit
                          </span>
                        )}
                        {p.sku}
                      </div>
                    </td>
                    <td className={`px-3 py-3 ${muted || 'text-text'}`}>{p.name}</td>
                    <td className={`px-3 py-3 hidden xl:table-cell text-[12px] ${muted || 'text-text-2'}`}>
                      {p.color ?? '—'}
                    </td>
                    <td className={`px-3 py-3 hidden md:table-cell text-[12px] ${muted || 'text-text-2'}`}>
                      {p.bikeModel.brand} {p.bikeModel.model} {yearLabel(p.bikeModel.year, p.bikeModel.yearEnd)}
                    </td>
                    <td className={`px-3 py-3 text-right tabular-nums ${muted}`}>
                      {p.price
                        ? LKR.format(parseFloat(p.price))
                        : <span className="text-[11px] font-medium text-warn-fg bg-warn-bg px-1.5 py-0.5 rounded">No price</span>
                      }
                    </td>
                    {isOwner && (
                      <td className={`px-3 py-3 text-right tabular-nums hidden lg:table-cell ${muted || 'text-text-2'}`}>
                        {p.cost ? LKR.format(parseFloat(p.cost)) : '—'}
                      </td>
                    )}
                    <td className={`px-3 py-3 text-right tabular-nums font-medium ${muted || (lowStock ? 'text-warn-fg' : '')}`}>
                      {p.finishedStock}
                    </td>
                    <td className={`px-3 py-3 text-right tabular-nums hidden sm:table-cell ${muted || 'text-text-3'}`}>
                      {p.reorderLevel}
                    </td>
                    <td className="px-3 py-3 hidden lg:table-cell">
                      {p.locationCode && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-text-3 font-mono">
                          <span>📍</span>{p.locationCode}
                        </span>
                      )}
                    </td>
                    {/* Active toggle — sole activate/deactivate control; always full opacity */}
                    <td className="px-3 py-3 text-center hidden sm:table-cell">
                      <button
                        type="button"
                        disabled={!isOwner || activateMutation.isPending}
                        onClick={() => activateMutation.mutate({ id: p.id, active: !p.active })}
                        title={
                          p.hasTransactions && p.active
                            ? 'Has sales history — deactivate instead'
                            : p.active
                              ? 'Deactivate (hides from POS)'
                              : 'Reactivate (restores to POS)'
                        }
                        className={`w-8 h-5 rounded-full transition-colors duration-200 ${p.active ? 'bg-accent' : 'bg-border'} disabled:cursor-not-allowed`}
                      >
                        <span className={`block w-3.5 h-3.5 rounded-full bg-white shadow transition-transform duration-200 mx-0.75 ${p.active ? 'translate-x-3' : 'translate-x-0'}`} />
                      </button>
                    </td>
                    {/* Actions — always full opacity */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => printLabels('part', [p.id])}
                          className="text-[12px] text-text-3 hover:text-text transition-colors"
                          title="Open label preview (set qty + format, then print)"
                        >
                          Label
                        </button>
                        {isOwner && (
                          <button
                            type="button"
                            onClick={() => setModal({ type: 'adjust', part: p })}
                            className="text-[12px] text-text-2 hover:text-text transition-colors"
                          >
                            Adjust
                          </button>
                        )}
                        {isOwner && (
                          <button
                            type="button"
                            onClick={() => setModal({ type: 'edit', part: p })}
                            className="text-[12px] text-text-2 hover:text-text transition-colors"
                          >
                            Edit
                          </button>
                        )}
                        {/* Delete only shown for parts with no history; use toggle to deactivate */}
                        {isOwner && !p.hasTransactions && (
                          <button
                            type="button"
                            disabled={deleteMutation.isPending}
                            title="No sales history — permanently removes this part"
                            onClick={() => {
                              if (confirm(`Permanently delete "${p.name}"?\n\nThis part has no sales history and will be removed completely. This cannot be undone.`)) {
                                deleteMutation.mutate(p.id);
                              }
                            }}
                            className="text-[12px] text-danger-fg hover:opacity-75 transition-opacity disabled:opacity-30"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {data && data.pageCount > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-[12px] text-text-3">
            {data.total} part{data.total !== 1 ? 's' : ''} · Page {data.page} of {data.pageCount}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className={chipCls(false) + ' disabled:opacity-30 disabled:cursor-not-allowed'}
            >
              ← Prev
            </button>
            <button
              type="button"
              disabled={page >= data.pageCount}
              onClick={() => setPage((p) => p + 1)}
              className={chipCls(false) + ' disabled:opacity-30 disabled:cursor-not-allowed'}
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {modal?.type === 'create' && (
        <PartModal isOwner={isOwner} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'edit' && (
        <PartModal existing={modal.part} isOwner={isOwner} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'adjust' && (
        <AdjustStockModal part={modal.part} onClose={() => setModal(null)} />
      )}
    </div>
  );
}
