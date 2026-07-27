'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { printLabels } from '@/lib/utils/printLabels';
import { SetModal } from './SetModal';
import { yearLabel } from '@/lib/utils/modelLabel';

type Part = { id: number; sku: string; name: string; price: string | null; finishedStock: number };
type BikeModel = { id: number; brand: string; model: string; year: number; yearEnd: number | null; country: string | null };

type StickerSet = {
  id: number; sku: string; name: string;
  bikeModelId: number; bikeModel: BikeModel;
  setPrice: string; packedStock: number;
  color: string | null;
  imageUrl: string | null; active: boolean; hasInvoices: boolean;
  locationCode: string | null;
  components: { partId: number; qty: number; part: Part }[];
};

interface Props { isOwner: boolean }

const LKR = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' });

function setAvailability(set: StickerSet): number {
  if (set.components.length === 0) return set.packedStock;
  const fromComponents = Math.min(
    ...set.components.map((c) => Math.floor(c.part.finishedStock / c.qty)),
  );
  return set.packedStock + fromComponents;
}

export function SetsTab({ isOwner }: Props) {
  const qc = useQueryClient();
  const [modal, setModal] = useState<{ type: 'create' } | { type: 'edit'; set: StickerSet } | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [modelId, setModelId] = useState('');

  const { data: bikeModels = [] } = useQuery<BikeModel[]>({
    queryKey: ['bike-models'],
    queryFn: () => fetch('/api/catalog/bike-models').then((r) => r.json()),
    staleTime: 60_000,
  });

  const params = new URLSearchParams();
  if (modelId) params.set('modelId', modelId);

  const { data: sets = [], isLoading } = useQuery<StickerSet[]>({
    queryKey: ['sets', { modelId }],
    queryFn: () => fetch(`/api/catalog/sets?${params}`).then((r) => r.json()),
    staleTime: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/catalog/sets/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error ?? 'Delete failed');
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sets'] }),
  });

  const allIds = sets.map((s) => s.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));

  function toggleAll() {
    setSelected((s) => {
      const next = new Set(s);
      if (allSelected) allIds.forEach((id) => next.delete(id));
      else allIds.forEach((id) => next.add(id));
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
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
              onClick={() => printLabels('set', [...selected])}
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
              + New set
            </button>
          )}
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center text-text-3 text-[13px]">Loading…</div>
        ) : sets.length === 0 ? (
          <div className="py-16 text-center text-text-3 text-[13px]">
            {modelId ? 'No sets for this model' : 'No sticker sets yet'}
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-text-3 text-[11px] uppercase tracking-wide">
                <th className="pl-4 pr-2 py-3">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="w-3.5 h-3.5 accent-accent" />
                </th>
                <th className="text-left px-3 py-3 font-medium">SKU</th>
                <th className="text-left px-3 py-3 font-medium">Name</th>
                <th className="text-left px-3 py-3 font-medium hidden xl:table-cell">Color</th>
                <th className="text-left px-3 py-3 font-medium hidden md:table-cell">Model</th>
                <th className="text-right px-3 py-3 font-medium">Set Price</th>
                <th className="text-right px-3 py-3 font-medium hidden sm:table-cell">Parts</th>
                <th className="text-right px-3 py-3 font-medium">Avail.</th>
                <th className="text-left px-3 py-3 font-medium hidden lg:table-cell">Location</th>
                <th className="px-3 py-3 font-medium text-center hidden sm:table-cell">Active</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {sets.map((s) => {
                const avail = setAvailability(s);
                const muted = !s.active ? 'text-text-3' : '';
                return (
                  // No opacity on tr — Edit must remain operable for reactivation
                  <tr key={s.id} className="border-b border-border last:border-b-0 hover:bg-bg transition-colors duration-75">
                    <td className="pl-4 pr-2 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(s.id)}
                        onChange={() => toggleOne(s.id)}
                        className="w-3.5 h-3.5 accent-accent"
                      />
                    </td>
                    <td className={`px-3 py-3 font-mono text-[12px] ${muted}`}>{s.sku}</td>
                    <td className={`px-3 py-3 ${muted || 'text-text'}`}>{s.name}</td>
                    <td className={`px-3 py-3 text-[12px] hidden xl:table-cell ${muted || 'text-text-2'}`}>
                      {s.color ?? '—'}
                    </td>
                    <td className={`px-3 py-3 text-[12px] hidden md:table-cell ${muted || 'text-text-2'}`}>
                      {s.bikeModel.brand} {s.bikeModel.model} {yearLabel(s.bikeModel.year, s.bikeModel.yearEnd)}
                    </td>
                    <td className={`px-3 py-3 text-right tabular-nums ${muted}`}>
                      {LKR.format(parseFloat(s.setPrice))}
                    </td>
                    <td className={`px-3 py-3 text-right tabular-nums hidden sm:table-cell ${muted || 'text-text-3'}`}>
                      {s.components.length}
                    </td>
                    <td className={`px-3 py-3 text-right tabular-nums font-medium ${muted || (avail === 0 ? 'text-danger-fg' : avail <= 3 ? 'text-warn-fg' : '')}`}>
                      {avail}
                    </td>
                    <td className="px-3 py-3 hidden lg:table-cell">
                      {s.locationCode && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-text-3 font-mono">
                          <span>📍</span>{s.locationCode}
                        </span>
                      )}
                    </td>
                    {/* Active pill — always visible at full opacity */}
                    <td className="px-3 py-3 text-center hidden sm:table-cell">
                      <span className={`inline-flex items-center h-5 px-2 rounded text-[10px] font-medium ${s.active ? 'bg-ok-bg text-ok-fg' : 'bg-border text-text-3'}`}>
                        {s.active ? 'Active' : 'Off'}
                      </span>
                    </td>
                    {/* Actions — always full opacity */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => printLabels('set', [s.id])}
                          className="text-[12px] text-text-3 hover:text-text transition-colors"
                          title="Open label preview (set qty + format, then print)"
                        >
                          Label
                        </button>
                        {isOwner && (
                          <button
                            type="button"
                            onClick={() => setModal({ type: 'edit', set: s })}
                            className="text-[12px] text-text-2 hover:text-text transition-colors"
                            title={s.hasInvoices && s.active ? 'Has sales history — deactivate via Edit' : undefined}
                          >
                            Edit
                          </button>
                        )}
                        {/* Delete only shown for sets with no invoice history; use Edit → active toggle otherwise */}
                        {isOwner && !s.hasInvoices && (
                          <button
                            type="button"
                            disabled={deleteMutation.isPending}
                            title="No sales history — permanently removes this set"
                            onClick={() => {
                              if (confirm(`Permanently delete "${s.name}"?\n\nThis set has no sales history and will be removed completely. This cannot be undone.`)) {
                                deleteMutation.mutate(s.id);
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

      {modal?.type === 'create' && <SetModal onClose={() => setModal(null)} />}
      {modal?.type === 'edit' && <SetModal existing={modal.set} onClose={() => setModal(null)} />}
    </div>
  );
}
