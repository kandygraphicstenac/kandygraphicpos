'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CompanyRecord } from '@/lib/types/company';
import {
  getSavedLabelFormat,
  saveLabelFormat,
  type LabelFormat,
} from '@/lib/utils/printLabels';
import type { LabelStockSettings } from '@/lib/services/settingsService';

// ─── Company form ─────────────────────────────────────────────────────────────

type CompanyFields = Pick<
  CompanyRecord,
  'id' | 'code' | 'name' | 'address' | 'phone' | 'regNo' | 'footerMessage' | 'warrantyLine' | 'logoUrl'
>;

function CompanyForm({ company }: { company: CompanyFields }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Omit<CompanyFields, 'id' | 'code'>>({
    name: company.name,
    address: company.address ?? '',
    phone: company.phone ?? '',
    regNo: company.regNo ?? '',
    footerMessage: company.footerMessage ?? '',
    warrantyLine: company.warrantyLine ?? '',
    logoUrl: company.logoUrl ?? '',
  });
  const [saved, setSaved] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    setLogoUploadError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/settings/companies/${company.id}/logo`, {
        method: 'POST',
        body: fd,
      });
      const data = await res.json() as { logoUrl?: string; error?: string };
      if (!res.ok) { setLogoUploadError(data.error ?? 'Upload failed'); return; }
      setForm((f) => ({ ...f, logoUrl: data.logoUrl ?? '' }));
      void qc.invalidateQueries({ queryKey: ['companies'] });
    } catch {
      setLogoUploadError('Upload failed — please retry');
    } finally {
      setUploadingLogo(false);
      e.target.value = '';
    }
  }

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await fetch(`/api/settings/companies/${company.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name || null,
          address: data.address || null,
          phone: data.phone || null,
          regNo: data.regNo || null,
          footerMessage: data.footerMessage || null,
          warrantyLine: data.warrantyLine || null,
          logoUrl: data.logoUrl || null,
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['companies'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  function field(
    label: string,
    key: keyof typeof form,
    opts?: { placeholder?: string; hint?: string },
  ) {
    return (
      <div>
        <label className="block text-[12px] text-text-2 mb-1">{label}</label>
        <input
          type="text"
          value={(form[key] as string) ?? ''}
          placeholder={opts?.placeholder}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-[13px] text-text
                     focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent
                     transition-colors duration-100"
        />
        {opts?.hint && <p className="text-[11px] text-text-3 mt-1">{opts.hint}</p>}
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }}
      className="bg-surface border border-border rounded-xl p-5 space-y-4"
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="inline-flex items-center h-6 px-2 rounded bg-border text-text-2 text-[11px] font-semibold tracking-wide">
          {company.code}
        </span>
        <h2 className="text-[14px] font-medium text-text">{company.name}</h2>
      </div>

      {field('Business name', 'name')}
      {field('Address', 'address', { placeholder: 'No. 12, Peradeniya Road, Kandy 20000' })}
      {field('Phone', 'phone', { placeholder: '+94812223456' })}
      {field('Registration No.', 'regNo', { placeholder: 'PV/00123456' })}
      {field('Receipt footer message', 'footerMessage', {
        placeholder: 'Thank you for your purchase!',
        hint: 'Printed at the bottom of every receipt for this company.',
      })}
      {field('Warranty / returns line', 'warrantyLine', {
        placeholder: 'All sales are final. No returns.',
        hint: 'Second footer line — leave blank to omit.',
      })}

      {/* Logo */}
      <div>
        <label className="block text-[12px] text-text-2 mb-2">Company logo</label>
        <div className="flex items-center gap-3 flex-wrap">
          {form.logoUrl && (
            <div className="h-12 flex items-center justify-center bg-bg border border-border rounded-lg px-2 shrink-0">
              <img
                src={form.logoUrl}
                alt="Logo preview"
                className="h-full w-auto max-w-30 object-contain"
              />
            </div>
          )}
          <label
            className={`h-8 px-3 rounded-lg border border-border text-[12px] text-text-2
                        hover:text-text hover:border-accent/50 transition-colors duration-100
                        cursor-pointer inline-flex items-center gap-1.5
                        ${uploadingLogo ? 'opacity-50 pointer-events-none' : ''}`}
          >
            {uploadingLogo ? 'Uploading…' : 'Upload logo'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleLogoUpload}
              disabled={uploadingLogo}
            />
          </label>
          {!form.logoUrl && !uploadingLogo && (
            <span className="text-[11px] text-text-3">No logo set</span>
          )}
        </div>
        {logoUploadError && (
          <p className="text-[11px] text-danger-fg mt-1.5">{logoUploadError}</p>
        )}
        <p className="text-[11px] text-text-3 mt-1.5">
          PNG, JPG, SVG · Max 2&nbsp;MB · Displayed on receipts and shipping labels
        </p>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={mutation.isPending}
          className="h-9 px-5 rounded-lg bg-accent text-accent-fg text-[13px] font-medium
                     disabled:opacity-50 hover:opacity-90 transition-opacity duration-100"
        >
          {mutation.isPending ? 'Saving…' : 'Save'}
        </button>
        {saved && <span className="text-[12px] text-ok-fg">Saved</span>}
        {mutation.isError && (
          <span className="text-[12px] text-danger-fg">Save failed — please retry</span>
        )}
      </div>
    </form>
  );
}

// ─── Label format settings ─────────────────────────────────────────────────────

const FORMAT_OPTS: { value: LabelFormat; label: string; description: string }[] = [
  {
    value: 'a4',
    label: 'A4 sheet',
    description: 'Grid of 38×25mm labels, 5 columns, printed on A4 paper and cut.',
  },
  {
    value: 'thermal',
    label: 'Thermal label printer',
    description: 'Uses the label stock dimensions configured below. Default: 50×25mm, 2-across (Zebra ZD230).',
  },
];

function LabelFormatSettings() {
  const [format, setFormat] = useState<LabelFormat>('a4');
  const [saved, setSaved] = useState(false);

  useEffect(() => { setFormat(getSavedLabelFormat()); }, []);

  function handleSave(f: LabelFormat) {
    setFormat(f);
    saveLabelFormat(f);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
      <h2 className="text-[14px] font-medium text-text">Label format</h2>
      <p className="text-[12px] text-text-3 -mt-2">
        Default format used when printing from the Catalog.
      </p>
      <div className="space-y-2">
        {FORMAT_OPTS.map((o) => (
          <label key={o.value} className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="labelFormat"
              value={o.value}
              checked={format === o.value}
              onChange={() => handleSave(o.value)}
              className="mt-0.5 accent-accent"
            />
            <div>
              <span className="text-[13px] font-medium text-text">{o.label}</span>
              <p className="text-[12px] text-text-3 mt-0.5">{o.description}</p>
            </div>
          </label>
        ))}
      </div>
      {saved && <p className="text-[12px] text-ok-fg">Saved to this browser</p>}
    </div>
  );
}

// ─── Label stock dimensions (thermal only) ─────────────────────────────────────

const ZEBRA_ZD230_PRESET: LabelStockSettings = {
  widthMm: 50,
  heightMm: 25,
  columns: 2,
  columnGapMm: 2,
  paddingMm: 1,
};

function LabelStockSettingsForm() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<LabelStockSettings>({
    queryKey: ['label-stock'],
    queryFn: () => fetch('/api/settings/label-stock').then((r) => r.json()),
    staleTime: 60_000,
  });

  const [form, setForm] = useState<LabelStockSettings>(ZEBRA_ZD230_PRESET);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const mutation = useMutation({
    mutationFn: async (settings: LabelStockSettings) => {
      const res = await fetch('/api/settings/label-stock', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error ?? 'Save failed');
      }
      return res.json() as Promise<LabelStockSettings>;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['label-stock'] });
      setSaved(true);
      setSaveError(null);
      setTimeout(() => setSaved(false), 2500);
    },
    onError: (err) => setSaveError(err instanceof Error ? err.message : 'Save failed'),
  });

  function numField(
    label: string,
    key: keyof LabelStockSettings,
    opts: { min?: number; max?: number; step?: number; suffix?: string; hint?: string },
  ) {
    const { min = 0, max = 999, step = 0.5, suffix, hint } = opts;
    return (
      <div>
        <label className="block text-[12px] text-text-2 mb-1">{label}</label>
        <div className="flex items-center gap-2">
          <div className="relative">
            <input
              type="number"
              min={min}
              max={max}
              step={step}
              value={form[key]}
              disabled={isLoading}
              onChange={(e) => setForm((f) => ({ ...f, [key]: parseFloat(e.target.value) || 0 }))}
              className="w-24 bg-bg border border-border rounded-lg pl-3 pr-7 py-2 text-[13px] text-text
                         tabular-nums focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent
                         transition-colors duration-100 disabled:opacity-50"
            />
            {suffix && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-text-3 pointer-events-none">
                {suffix}
              </span>
            )}
          </div>
        </div>
        {hint && <p className="text-[11px] text-text-3 mt-1">{hint}</p>}
      </div>
    );
  }

  const pageWidthMm = form.columns * form.widthMm + (form.columns - 1) * form.columnGapMm;

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }}
      className="bg-surface border border-border rounded-xl p-5 space-y-4"
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-[14px] font-medium text-text">Thermal label stock</h2>
        <button
          type="button"
          onClick={() => setForm(ZEBRA_ZD230_PRESET)}
          className="h-7 px-3 rounded-lg border border-border text-[11px] text-text-2
                     hover:border-border-hover hover:text-text transition-colors duration-100"
        >
          Zebra ZD230 defaults
        </button>
      </div>
      <p className="text-[12px] text-text-3 -mt-2">
        Dimensions of the label stock loaded in your thermal printer.
        Changing these affects the print layout for the &ldquo;Thermal label printer&rdquo; format above.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {numField('Label width', 'widthMm',     { min: 10, max: 300, step: 0.5, suffix: 'mm', hint: 'Single label, e.g. 50' })}
        {numField('Label height', 'heightMm',   { min: 8,  max: 300, step: 0.5, suffix: 'mm', hint: 'Single label, e.g. 25' })}
        {numField('Columns', 'columns',         { min: 1,  max: 10,  step: 1,   hint: 'Labels per row (2 = 2-across)' })}
        {numField('Column gap', 'columnGapMm',  { min: 0,  max: 50,  step: 0.5, suffix: 'mm', hint: 'Gap between columns' })}
        {numField('Inner padding', 'paddingMm', { min: 0,  max: 20,  step: 0.5, suffix: 'mm', hint: 'Margin inside each label' })}
      </div>

      <p className="text-[11px] text-text-3 bg-bg border border-border rounded-lg px-3 py-2 font-mono">
        @page size: {pageWidthMm.toFixed(1)}mm × {form.heightMm}mm
        &nbsp;·&nbsp;{form.columns} label{form.columns !== 1 ? 's' : ''} per row
        &nbsp;·&nbsp;{form.paddingMm}mm inner padding
      </p>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={mutation.isPending || isLoading}
          className="h-9 px-5 rounded-lg bg-accent text-accent-fg text-[13px] font-medium
                     disabled:opacity-50 hover:opacity-90 transition-opacity duration-100"
        >
          {mutation.isPending ? 'Saving…' : 'Save'}
        </button>
        {saved && <span className="text-[12px] text-ok-fg">Saved</span>}
        {saveError && <span className="text-[12px] text-danger-fg">{saveError}</span>}
      </div>
    </form>
  );
}

// ─── Discount approval threshold ───────────────────────────────────────────────

function DiscountThresholdSettings() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ thresholdPct: number }>({
    queryKey: ['discount-threshold'],
    queryFn: () => fetch('/api/settings/discount-threshold').then((r) => r.json()),
    staleTime: 60_000,
  });
  const [value, setValue] = useState('0');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) setValue(String(data.thresholdPct));
  }, [data]);

  const mutation = useMutation({
    mutationFn: async (thresholdPct: number) => {
      const res = await fetch('/api/settings/discount-threshold', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thresholdPct }),
      });
      if (!res.ok) throw new Error('Save failed');
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['discount-threshold'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); mutation.mutate(Math.max(0, Math.min(100, parseFloat(value) || 0))); }}
      className="bg-surface border border-border rounded-xl p-5 space-y-3"
    >
      <h2 className="text-[14px] font-medium text-text">Discount approval threshold</h2>
      <p className="text-[12px] text-text-3 -mt-1">
        Discounts at or below this percentage don&apos;t need manager authorization.
        Default is 0% — every discount needs approval. Refunds always need approval regardless of this setting.
      </p>
      <div className="flex items-center gap-3">
        <div className="relative">
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={value}
            disabled={isLoading}
            onChange={(e) => setValue(e.target.value)}
            className="w-24 bg-bg border border-border rounded-lg pl-3 pr-7 py-2 text-[13px] text-text
                       tabular-nums focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent
                       transition-colors duration-100"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-text-3">%</span>
        </div>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="h-9 px-5 rounded-lg bg-accent text-accent-fg text-[13px] font-medium
                     disabled:opacity-50 hover:opacity-90 transition-opacity duration-100"
        >
          {mutation.isPending ? 'Saving…' : 'Save'}
        </button>
        {saved && <span className="text-[12px] text-ok-fg">Saved</span>}
      </div>
    </form>
  );
}

// ─── User management ──────────────────────────────────────────────────────────

type DbUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  active: boolean;
  hasActivity: boolean;
};

const ROLES = ['OWNER', 'CASHIER', 'CUTTER'] as const;
const ROLE_LABEL: Record<string, string> = { OWNER: 'Owner', CASHIER: 'Cashier', CUTTER: 'Cutter' };

const EMPTY_FORM = { email: '', name: '', role: 'CASHIER' as const, password: '' };

function UserManagement() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: users = [], isLoading } = useQuery<DbUser[]>({
    queryKey: ['admin-users'],
    queryFn: () => fetch('/api/admin/users').then((r) => r.json()),
    staleTime: 60_000,
  });

  const patchMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: number; role?: string; active?: boolean }) => {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error ?? 'Update failed');
      }
      return res.json() as Promise<DbUser>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
    onError: (err) => alert(err instanceof Error ? err.message : 'Update failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error ?? 'Delete failed');
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
    onError: (err) => alert(err instanceof Error ? err.message : 'Delete failed'),
  });

  function handleDelete(u: DbUser) {
    if (!confirm(`Delete ${u.name} (${u.email})?\n\nThis permanently removes their account and cannot be undone.`)) return;
    deleteMutation.mutate(u.id);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setCreateError(data.error ?? 'Create failed'); return; }
      void qc.invalidateQueries({ queryKey: ['admin-users'] });
      setShowCreate(false);
      setForm(EMPTY_FORM);
    } finally {
      setCreating(false);
    }
  }

  const inputCls =
    'w-full bg-bg border border-border rounded-lg px-3 py-2 text-[13px] text-text ' +
    'focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-colors';

  return (
    <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-medium text-text">Users</h2>
        <button
          type="button"
          onClick={() => { setShowCreate(true); setCreateError(null); }}
          className="h-8 px-3 rounded-lg bg-accent text-accent-fg text-[12px] font-medium hover:opacity-90 transition-opacity"
        >
          + New user
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="border border-border rounded-xl p-4 space-y-3 bg-bg"
        >
          <p className="text-[13px] font-medium text-text">Create user</p>

          {createError && (
            <p className="text-[12px] text-danger-fg bg-surface border border-danger-fg/20 rounded-lg px-3 py-2">
              {createError}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-text-2 mb-1">Email</label>
              <input
                type="email" required value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-[11px] text-text-2 mb-1">Full name</label>
              <input
                type="text" required value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-[11px] text-text-2 mb-1">Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as typeof form.role }))}
                className={inputCls}
              >
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-text-2 mb-1">
                Temporary password{' '}
                <span className="text-text-3">(min 8 chars)</span>
              </label>
              <input
                type="password" required minLength={8} value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                autoComplete="new-password"
                className={inputCls}
              />
            </div>
          </div>

          <p className="text-[11px] text-text-3">
            Requires <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code> in your
            environment (Supabase Dashboard → Project Settings → API → service_role).
          </p>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={creating}
              className="h-8 px-4 rounded-lg bg-accent text-accent-fg text-[12px] font-medium
                         disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => { setShowCreate(false); setCreateError(null); setForm(EMPTY_FORM); }}
              className="h-8 px-4 rounded-lg border border-border text-[12px] text-text-2 hover:text-text transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* User table */}
      <div className="rounded-xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="py-10 text-center text-text-3 text-[13px]">Loading…</div>
        ) : users.length === 0 ? (
          <div className="py-10 text-center text-text-3 text-[13px]">No users yet</div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-text-3 text-[11px] uppercase tracking-wide">
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-3 py-3 font-medium hidden sm:table-cell">Email</th>
                <th className="text-left px-3 py-3 font-medium">Role</th>
                <th className="text-left px-3 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  className={`border-b border-border last:border-b-0 ${!u.active ? 'opacity-50' : ''}`}
                >
                  <td className="px-4 py-3 font-medium text-text">{u.name}</td>
                  <td className="px-3 py-3 text-text-2 text-[12px] hidden sm:table-cell">{u.email}</td>
                  {/* Role selector */}
                  <td className="px-3 py-3">
                    <select
                      value={u.role}
                      disabled={patchMutation.isPending}
                      onChange={(e) =>
                        patchMutation.mutate({ id: u.id, role: e.target.value })
                      }
                      className="h-7 px-2 bg-bg border border-border rounded-lg text-[12px] text-text
                                 focus:outline-none focus:ring-1 focus:ring-accent/30 transition-colors"
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                  </td>
                  {/* Active badge */}
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex items-center h-5 px-2 rounded text-[10px] font-medium ${
                        u.active ? 'bg-ok-bg text-ok-fg' : 'bg-border text-text-3'
                      }`}
                    >
                      {u.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  {/* Actions */}
                  <td className="px-4 py-3 text-right">
                    {u.hasActivity ? (
                      <button
                        type="button"
                        disabled={patchMutation.isPending}
                        onClick={() => patchMutation.mutate({ id: u.id, active: !u.active })}
                        title="Has activity — deactivate instead"
                        className={`text-[12px] transition-colors disabled:opacity-30 ${
                          u.active
                            ? 'text-danger-fg hover:opacity-75'
                            : 'text-ok-fg hover:opacity-75'
                        }`}
                      >
                        {u.active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={deleteMutation.isPending}
                        onClick={() => handleDelete(u)}
                        className="text-[12px] text-danger-fg hover:opacity-75 transition-colors disabled:opacity-30"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Main settings client component ──────────────────────────────────────────

export function SettingsClient() {
  const { data: companies = [], isLoading } = useQuery<CompanyRecord[]>({
    queryKey: ['companies'],
    queryFn: () => fetch('/api/companies').then((r) => r.json()),
    staleTime: Infinity,
  });

  return (
    <div className="min-h-screen bg-bg text-text p-6">
      <div className="max-w-xl mx-auto">
        <header className="mb-6">
          <h1 className="text-[20px] font-semibold">Settings</h1>
          <p className="text-[13px] text-text-3 mt-0.5">Company details and printing preferences</p>
        </header>

        {isLoading && <div className="text-[13px] text-text-3">Loading…</div>}

        <div className="space-y-8">
          <section className="space-y-4">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-text-3">
              Companies
            </h2>
            {companies.map((c) => (
              <CompanyForm key={c.id} company={c} />
            ))}
          </section>

          <section className="space-y-4">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-text-3">
              Printing
            </h2>
            <LabelFormatSettings />
            <LabelStockSettingsForm />
          </section>

          <section className="space-y-4">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-text-3">
              Staff
            </h2>
            <UserManagement />
          </section>

          <section className="space-y-4">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-text-3">
              Discounts &amp; refunds
            </h2>
            <DiscountThresholdSettings />
          </section>
        </div>
      </div>
    </div>
  );
}
