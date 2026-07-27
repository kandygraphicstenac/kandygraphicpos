'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BikeModelModal } from './BikeModelModal';
import { yearLabel } from '@/lib/utils/modelLabel';

type BikeModel = {
  id: number;
  brand: string;
  model: string;
  year: number;
  yearEnd: number | null;
  country: string | null;
  _count: { parts: number; sets: number };
};

export function BikeModelsTab() {
  const qc = useQueryClient();
  const [modalState, setModalState] = useState<
    { type: 'create' } | { type: 'edit'; model: BikeModel } | null
  >(null);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  const { data: models = [], isLoading } = useQuery<BikeModel[]>({
    queryKey: ['bike-models'],
    queryFn: () => fetch('/api/catalog/bike-models').then((r) => r.json()),
    staleTime: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/catalog/bike-models/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? 'Delete failed');
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['bike-models'] });
      setDeleteErr(null);
    },
    onError: (e: Error) => setDeleteErr(e.message),
  });

  const brandOptions = [...new Set(models.map((m) => m.brand))].sort();
  const countryOptions = [...new Set(models.map((m) => m.country).filter(Boolean) as string[])].sort();

  if (isLoading) return <div className="py-16 text-center text-text-3 text-[13px]">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-text-2">{models.length} bike model{models.length !== 1 ? 's' : ''}</p>
        <button
          type="button"
          onClick={() => setModalState({ type: 'create' })}
          className="h-8 px-4 rounded-lg bg-accent text-accent-fg text-[13px] font-medium hover:opacity-90 transition-opacity"
        >
          + New model
        </button>
      </div>

      {deleteErr && (
        <div className="px-4 py-2.5 bg-danger-bg border border-danger-fg/20 rounded-xl text-[12px] text-danger-fg">
          {deleteErr}
        </div>
      )}

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        {models.length === 0 ? (
          <div className="py-16 text-center text-text-3 text-[13px]">No bike models yet. Add one to start cataloguing parts.</div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-text-3 text-[11px] uppercase tracking-wide">
                <th className="text-left px-4 py-3 font-medium">Brand</th>
                <th className="text-left px-4 py-3 font-medium">Model</th>
                <th className="text-left px-4 py-3 font-medium">Year(s)</th>
                <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Market</th>
                <th className="text-right px-4 py-3 font-medium">Parts</th>
                <th className="text-right px-4 py-3 font-medium hidden sm:table-cell">Sets</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.id} className="border-b border-border last:border-b-0 hover:bg-bg transition-colors duration-75">
                  <td className="px-4 py-3 font-medium">{m.brand}</td>
                  <td className="px-4 py-3 text-text">{m.model}</td>
                  <td className="px-4 py-3 text-text-2 tabular-nums">{yearLabel(m.year, m.yearEnd)}</td>
                  <td className="px-4 py-3 text-text-3 hidden sm:table-cell">{m.country ?? '—'}</td>
                  <td className="px-4 py-3 text-right text-text-2 tabular-nums">{m._count.parts}</td>
                  <td className="px-4 py-3 text-right text-text-2 tabular-nums hidden sm:table-cell">{m._count.sets}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => { setDeleteErr(null); setModalState({ type: 'edit', model: m }); }}
                        className="text-[12px] text-text-2 hover:text-text transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={m._count.parts > 0 || deleteMutation.isPending}
                        title={m._count.parts > 0 ? `${m._count.parts} part(s) reference this model` : 'Delete'}
                        onClick={() => {
                          if (confirm(`Delete "${m.brand} ${m.model} ${yearLabel(m.year, m.yearEnd)}"?`)) {
                            deleteMutation.mutate(m.id);
                          }
                        }}
                        className="text-[12px] text-danger-fg hover:opacity-75 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalState && (
        <BikeModelModal
          existing={modalState.type === 'edit' ? modalState.model : undefined}
          brandOptions={brandOptions}
          countryOptions={countryOptions}
          onClose={() => setModalState(null)}
        />
      )}
    </div>
  );
}
