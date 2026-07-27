'use client';

import { useState } from 'react';
import type { CustomerRecord } from '@/lib/types/customer';

type FormState = {
  name: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postalCode: string;
  bikeInfo: string;
  notes: string;
};

function toForm(c?: CustomerRecord): FormState {
  return {
    name: c?.name ?? '',
    phone: c?.phone ?? '',
    addressLine1: c?.addressLine1 ?? '',
    addressLine2: c?.addressLine2 ?? '',
    city: c?.city ?? '',
    postalCode: c?.postalCode ?? '',
    bikeInfo: c?.bikeInfo ?? '',
    notes: c?.notes ?? '',
  };
}

type Props = {
  mode: 'create' | 'edit';
  customer?: CustomerRecord;
  onClose: () => void;
  onSaved: (customer: CustomerRecord) => void;
};

/**
 * Shared create/edit drawer for customers. Slides in from the right —
 * distinct from the app's centered modals, since this is a heavier form.
 */
export function CustomerDrawer({ mode, customer, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(() => toForm(customer));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function field<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Name is required'); return; }
    setPending(true);
    setError(null);
    try {
      const url = mode === 'create' ? '/api/customers' : `/api/customers/${customer!.id}`;
      const method = mode === 'create' ? 'POST' : 'PATCH';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Save failed');
        return;
      }
      onSaved(data as CustomerRecord);
    } catch {
      setError('Network error — please retry');
    } finally {
      setPending(false);
    }
  }

  const inputCls =
    'w-full bg-bg border border-border rounded-xl px-3 py-2.5 text-[14px] text-text ' +
    'focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-colors duration-100';
  const labelCls = 'block text-[12px] text-text-2 mb-1.5';

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-text/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="animate-slide-in-right relative w-full max-w-md h-full bg-surface border-l border-border shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border shrink-0">
          <h2 className="text-[15px] font-medium text-text">
            {mode === 'create' ? 'New customer' : 'Edit customer'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-text-3
                       hover:text-text hover:bg-border transition-colors duration-100"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
              <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
            </svg>
          </button>
        </div>

        <form id="customer-drawer-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {error && (
            <p className="text-[12px] text-danger-fg bg-danger-bg border border-danger-fg/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div>
            <label className={labelCls}>Name</label>
            <input
              autoFocus
              type="text"
              value={form.name}
              onChange={(e) => field('name', e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Phone</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => field('phone', e.target.value)}
              placeholder="07XXXXXXXX"
              className={inputCls}
            />
          </div>

          <div className="pt-2 border-t border-border">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-3 mb-3">Address</p>
            <div className="space-y-3">
              <input
                type="text"
                value={form.addressLine1}
                onChange={(e) => field('addressLine1', e.target.value)}
                placeholder="Address line 1"
                className={inputCls}
              />
              <input
                type="text"
                value={form.addressLine2}
                onChange={(e) => field('addressLine2', e.target.value)}
                placeholder="Address line 2 (optional)"
                className={inputCls}
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  value={form.city}
                  onChange={(e) => field('city', e.target.value)}
                  placeholder="City"
                  className={inputCls}
                />
                <input
                  type="text"
                  value={form.postalCode}
                  onChange={(e) => field('postalCode', e.target.value)}
                  placeholder="Postal code"
                  className={inputCls}
                />
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-border">
            <label className={labelCls}>Bikes</label>
            <input
              type="text"
              value={form.bikeInfo}
              onChange={(e) => field('bikeInfo', e.target.value)}
              placeholder="e.g. Honda Dio 2022, Bajaj Pulsar 150"
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => field('notes', e.target.value)}
              rows={3}
              className={inputCls + ' resize-none'}
            />
          </div>
        </form>

        <div className="px-5 py-4 border-t border-border shrink-0">
          <button
            type="submit"
            form="customer-drawer-form"
            disabled={pending}
            className="w-full h-11 rounded-xl bg-accent text-accent-fg text-[14px] font-medium
                       disabled:opacity-50 disabled:cursor-not-allowed
                       enabled:hover:opacity-90 transition-opacity duration-100"
          >
            {pending ? 'Saving…' : mode === 'create' ? 'Create customer' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
