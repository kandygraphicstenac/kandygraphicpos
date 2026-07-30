'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MIN_MODEL_YEAR, maxModelYear } from '@/lib/validators/catalog';

type BikeModelForm = { brand: string; model: string; year: string; yearEnd: string; country: string };

interface Props {
  existing?: { id: number; brand: string; model: string; year: number; yearEnd?: number | null; country: string | null };
  brandOptions: string[];
  countryOptions: string[];
  onClose: () => void;
}

export function BikeModelModal({ existing, brandOptions, countryOptions, onClose }: Props) {
  const qc = useQueryClient();
  const isEdit = !!existing;

  // Same bounds the server enforces — imported rather than repeated so the
  // browser tooltip and the API can never disagree about what's valid.
  const maxYear = maxModelYear();

  const [form, setForm] = useState<BikeModelForm>({
    brand: existing?.brand ?? '',
    model: existing?.model ?? '',
    year: existing?.year?.toString() ?? new Date().getFullYear().toString(),
    yearEnd: existing?.yearEnd?.toString() ?? '',
    country: existing?.country ?? '',
  });
  const [err, setErr] = useState<string | null>(null);

  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => { firstRef.current?.focus(); }, []);

  const mutation = useMutation({
    mutationFn: async () => {
      const url = isEdit
        ? `/api/catalog/bike-models/${existing!.id}`
        : '/api/catalog/bike-models';
      const yearEnd = form.yearEnd ? parseInt(form.yearEnd, 10) : null;
      const body = {
        brand: form.brand.trim(),
        model: form.model.trim(),
        year: parseInt(form.year, 10),
        yearEnd: yearEnd || null,
        country: form.country.trim() || null,
      };
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? 'Save failed');
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['bike-models'] });
      onClose();
    },
    onError: (e: Error) => setErr(e.message),
  });

  function set(field: keyof BikeModelForm, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setErr(null);
  }

  const inputCls =
    'w-full h-9 px-3 bg-bg border border-border rounded-lg text-[13px] text-text placeholder:text-text-3 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-colors';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-surface rounded-2xl shadow-xl w-full max-w-sm border border-border">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border">
          <h2 className="text-[15px] font-semibold">{isEdit ? 'Edit Bike Model' : 'New Bike Model'}</h2>
          <button type="button" onClick={onClose} className="text-text-3 hover:text-text transition-colors">
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <form
          className="p-5 space-y-4"
          onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}
        >
          <datalist id="brand-opts">
            {brandOptions.map((b) => <option key={b} value={b} />)}
          </datalist>
          <datalist id="country-opts">
            {countryOptions.map((c) => <option key={c} value={c} />)}
          </datalist>

          <div className="space-y-1">
            <label className="text-[12px] font-medium text-text-2">Brand</label>
            <input
              ref={firstRef}
              type="text"
              list="brand-opts"
              placeholder="e.g. Bajaj"
              value={form.brand}
              onChange={(e) => set('brand', e.target.value)}
              className={inputCls}
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-[12px] font-medium text-text-2">Model</label>
            <input
              type="text"
              placeholder="e.g. Pulsar 150"
              value={form.model}
              onChange={(e) => set('model', e.target.value)}
              className={inputCls}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[12px] font-medium text-text-2">Year from</label>
              <input
                type="number"
                min={MIN_MODEL_YEAR}
                max={maxYear}
                value={form.year}
                onChange={(e) => set('year', e.target.value)}
                className={inputCls}
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-[12px] font-medium text-text-2">
                Year to
                <span className="ml-1.5 font-normal text-text-3">(optional)</span>
              </label>
              <input
                type="number"
                min={MIN_MODEL_YEAR}
                max={maxYear}
                placeholder="e.g. 2019"
                value={form.yearEnd}
                onChange={(e) => set('yearEnd', e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[12px] font-medium text-text-2">Market / Country</label>
            <input
              type="text"
              list="country-opts"
              placeholder="e.g. LK"
              value={form.country}
              onChange={(e) => set('country', e.target.value)}
              className={inputCls}
            />
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
              disabled={mutation.isPending}
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
