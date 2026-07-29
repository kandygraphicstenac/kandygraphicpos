'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BikeModelModal } from './BikeModelModal';
import { Pagination, DEFAULT_PAGE_SIZE } from '@/components/Pagination';
import { useDebounced } from '@/lib/hooks/useDebounced';
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

type BikeModelsPage = {
  bikeModels: BikeModel[];
  total: number; page: number; pageSize: number; pageCount: number;
};

/** Slim row from /options — used for the brand/country datalists. */
type BikeModelOption = { brand: string; country: string | null };

/** Only delete is role-gated here — see PartsTab. */
interface Props { canDelete: boolean }

export function BikeModelsTab({ canDelete }: Props) {
  const qc = useQueryClient();
  const [modalState, setModalState] = useState<
    { type: 'create' } | { type: 'edit'; model: BikeModel } | null
  >(null);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const debouncedQ = useDebounced(q, 300);

  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (debouncedQ) params.set('q', debouncedQ);

  const { data, isLoading } = useQuery<BikeModelsPage>({
    queryKey: ['bike-models', { q: debouncedQ, page, pageSize }],
    queryFn: () => fetch(`/api/catalog/bike-models?${params}`).then((r) => r.json()),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const models = data?.bikeModels ?? [];

  const { data: allOptions = [] } = useQuery<BikeModelOption[]>({
    queryKey: ['bike-models', 'options'],
    queryFn: () => fetch('/api/catalog/bike-models/options').then((r) => r.json()),
    staleTime: 60_000,
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

  // Datalist suggestions come from /options, not the current page — otherwise
  // the brand/country hints would only reflect whichever 25 rows are on screen.
  const brandOptions = [...new Set(allOptions.map((m) => m.brand))].sort();
  const countryOptions = [...new Set(allOptions.map((m) => m.country).filter(Boolean) as string[])].sort();

  if (isLoading && !data) return <div className="py-16 text-center text-text-3 text-[13px]">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-3 pointer-events-none" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="6.5" cy="6.5" r="4.5" /><path d="M10.5 10.5l3 3" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            placeholder="Search brand or model…"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            className="pl-8 pr-3 h-9 w-52 bg-surface border border-border rounded-lg text-[13px] text-text placeholder:text-text-3 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-colors"
          />
        </div>
        <button
          type="button"
          onClick={() => setModalState({ type: 'create' })}
          className="ml-auto h-8 px-4 rounded-lg bg-accent text-accent-fg text-[13px] font-medium hover:opacity-90 transition-opacity"
        >
          + New model
        </button>
      </div>

      {deleteErr && (
        <div className="px-4 py-2.5 bg-danger-bg border border-danger-fg/20 rounded-xl text-[12px] text-danger-fg">
          {deleteErr}
        </div>
      )}

      {/* overflow-x-auto (not -hidden): actions column is pinned right so it
          stays reachable while the rest of the table scrolls. */}
      <div className="bg-surface border border-border rounded-xl overflow-x-auto">
        {models.length === 0 ? (
          <div className="py-16 text-center text-text-3 text-[13px]">
            {q ? 'No bike models match this search' : 'No bike models yet. Add one to start cataloguing parts.'}
          </div>
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
                <th className="px-4 py-3 sticky right-0 bg-surface shadow-[-1px_0_0_0_var(--border)]" />
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.id} className="group border-b border-border last:border-b-0 hover:bg-bg transition-colors duration-75">
                  <td className="px-4 py-3 font-medium">
                    <div className="truncate max-w-36" title={m.brand}>{m.brand}</div>
                  </td>
                  <td className="px-4 py-3 text-text">
                    <div className="truncate max-w-56" title={m.model}>{m.model}</div>
                  </td>
                  <td className="px-4 py-3 text-text-2 tabular-nums">{yearLabel(m.year, m.yearEnd)}</td>
                  <td className="px-4 py-3 text-text-3 hidden sm:table-cell">{m.country ?? '—'}</td>
                  <td className="px-4 py-3 text-right text-text-2 tabular-nums">{m._count.parts}</td>
                  <td className="px-4 py-3 text-right text-text-2 tabular-nums hidden sm:table-cell">{m._count.sets}</td>
                  {/* Actions pinned right so horizontal scrolling can never put
                      these out of reach. */}
                  <td className="px-4 py-3 sticky right-0 bg-surface group-hover:bg-bg shadow-[-1px_0_0_0_var(--border)] transition-colors duration-75">
                    <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => { setDeleteErr(null); setModalState({ type: 'edit', model: m }); }}
                        className="text-[12px] text-text-2 hover:text-text transition-colors"
                      >
                        Edit
                      </button>
                      {/* OWNER only — CUTTER never sees this. */}
                      {canDelete && (
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
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {data && (
        <Pagination
          page={data.page}
          pageCount={data.pageCount}
          total={data.total}
          pageSize={data.pageSize}
          onPageChange={setPage}
          onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
          itemLabel="bike model"
        />
      )}

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
