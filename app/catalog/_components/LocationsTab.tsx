'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { LocationRecord } from '@/lib/types/location';
import { printLocationLabels } from '@/lib/utils/printLabels';

type EditForm = { rack: string; shelf: string; slot: string; description: string };
type CreateForm = { code: string } & EditForm;

const EMPTY_CREATE: CreateForm = { code: '', rack: '', shelf: '', slot: '', description: '' };

function toEditForm(l: LocationRecord): EditForm {
  return { rack: l.rack ?? '', shelf: l.shelf ?? '', slot: l.slot ?? '', description: l.description ?? '' };
}

export function LocationsTab() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_CREATE);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editCode, setEditCode] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ rack: '', shelf: '', slot: '', description: '' });
  const [editError, setEditError] = useState<string | null>(null);

  const { data: locations = [], isLoading } = useQuery<LocationRecord[]>({
    queryKey: ['locations'],
    queryFn: () => fetch('/api/locations').then((r) => r.json()),
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: async (data: CreateForm) => {
      const res = await fetch('/api/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: data.code.trim().toUpperCase(),
          rack: data.rack.trim() || null,
          shelf: data.shelf.trim() || null,
          slot: data.slot.trim() || null,
          description: data.description.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error((json as { error?: string }).error ?? 'Create failed');
      return json;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['locations'] });
      setShowCreate(false);
      setCreateForm(EMPTY_CREATE);
      setCreateError(null);
    },
    onError: (e: Error) => setCreateError(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ code, data }: { code: string; data: EditForm }) => {
      const res = await fetch(`/api/locations/${encodeURIComponent(code)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rack: data.rack.trim() || null,
          shelf: data.shelf.trim() || null,
          slot: data.slot.trim() || null,
          description: data.description.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error((json as { error?: string }).error ?? 'Update failed');
      return json;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['locations'] });
      setEditCode(null);
      setEditError(null);
    },
    onError: (e: Error) => setEditError(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ code, active }: { code: string; active: boolean }) => {
      const res = await fetch(`/api/locations/${encodeURIComponent(code)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? 'Toggle failed');
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['locations'] }),
    onError: (e: Error) => alert(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await fetch(`/api/locations/${encodeURIComponent(code)}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? 'Delete failed');
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['locations'] }),
    onError: (e: Error) => alert(e.message),
  });

  const inputCls =
    'w-full h-8 px-2 bg-bg border border-border rounded-lg text-[12px] text-text ' +
    'placeholder:text-text-3 focus:outline-none focus:ring-2 focus:ring-accent/40 ' +
    'focus:border-accent transition-colors';

  function GridFields({
    form,
    onChange,
    showCode,
  }: {
    form: CreateForm | EditForm;
    onChange: (key: string, val: string) => void;
    showCode?: boolean;
  }) {
    const cols = showCode ? 'grid-cols-2 sm:grid-cols-5' : 'grid-cols-2 sm:grid-cols-4';
    return (
      <div className={`grid ${cols} gap-2`}>
        {showCode && (
          <div className="sm:col-span-1">
            <label className="block text-[11px] text-text-2 mb-1">Code *</label>
            <input
              type="text"
              required
              placeholder="A-1"
              value={(form as CreateForm).code ?? ''}
              onChange={(e) => onChange('code', e.target.value)}
              className={`${inputCls} font-mono uppercase`}
              autoFocus
            />
          </div>
        )}
        <div>
          <label className="block text-[11px] text-text-2 mb-1">Rack</label>
          <input type="text" placeholder="A" value={form.rack}
            onChange={(e) => onChange('rack', e.target.value)} className={inputCls} autoFocus={!showCode} />
        </div>
        <div>
          <label className="block text-[11px] text-text-2 mb-1">Shelf</label>
          <input type="text" placeholder="1" value={form.shelf}
            onChange={(e) => onChange('shelf', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-[11px] text-text-2 mb-1">Bin</label>
          <input type="text" placeholder="optional" value={form.slot}
            onChange={(e) => onChange('slot', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-[11px] text-text-2 mb-1">Description</label>
          <input type="text" placeholder="optional" value={form.description}
            onChange={(e) => onChange('description', e.target.value)} className={inputCls} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-text-3">
          Shelf and rack codes for finding finished stock. Staff see these on product cards.
        </p>
        <button
          type="button"
          onClick={() => { setShowCreate(true); setCreateError(null); setCreateForm(EMPTY_CREATE); }}
          className="h-8 px-4 rounded-lg bg-accent text-accent-fg text-[13px] font-medium hover:opacity-90 transition-opacity"
        >
          + New location
        </button>
      </div>

      {showCreate && (
        <form
          onSubmit={(e) => { e.preventDefault(); createMutation.mutate(createForm); }}
          className="border border-border rounded-xl p-4 space-y-3 bg-surface"
        >
          <p className="text-[13px] font-medium text-text">New location</p>
          {createError && <p className="text-[12px] text-danger-fg">{createError}</p>}
          <GridFields
            form={createForm}
            showCode
            onChange={(key, val) => setCreateForm((f) => ({ ...f, [key]: val }))}
          />
          <div className="flex items-center gap-2">
            <button type="submit" disabled={createMutation.isPending}
              className="h-8 px-4 rounded-lg bg-accent text-accent-fg text-[12px] font-medium disabled:opacity-50 hover:opacity-90">
              {createMutation.isPending ? 'Creating…' : 'Create'}
            </button>
            <button type="button" onClick={() => { setShowCreate(false); setCreateError(null); }}
              className="h-8 px-4 rounded-lg border border-border text-[12px] text-text-2 hover:text-text transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="py-10 text-center text-text-3 text-[13px]">Loading…</div>
        ) : locations.length === 0 ? (
          <div className="py-10 text-center text-text-3 text-[13px]">
            No locations yet — create one above to start tracking stock positions
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-text-3 text-[11px] uppercase tracking-wide">
                <th className="text-left px-4 py-3 font-medium">Code</th>
                <th className="text-left px-3 py-3 font-medium hidden sm:table-cell">Rack / Shelf / Bin</th>
                <th className="text-left px-3 py-3 font-medium hidden md:table-cell">Description</th>
                <th className="px-3 py-3 font-medium text-center">Active</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {locations.map((l) => (
                <tr
                  key={l.code}
                  className={`border-b border-border last:border-b-0 ${editCode === l.code ? 'bg-bg' : 'hover:bg-bg'} transition-colors duration-75`}
                >
                  {editCode === l.code ? (
                    <td colSpan={5} className="px-4 py-3">
                      <form
                        onSubmit={(e) => { e.preventDefault(); updateMutation.mutate({ code: l.code, data: editForm }); }}
                        className="space-y-2"
                      >
                        {editError && <p className="text-[12px] text-danger-fg">{editError}</p>}
                        <GridFields
                          form={editForm}
                          onChange={(key, val) => setEditForm((f) => ({ ...f, [key]: val }))}
                        />
                        <div className="flex items-center gap-2">
                          <button type="submit" disabled={updateMutation.isPending}
                            className="h-7 px-3 rounded-lg bg-accent text-accent-fg text-[12px] font-medium disabled:opacity-50 hover:opacity-90">
                            {updateMutation.isPending ? 'Saving…' : 'Save'}
                          </button>
                          <button type="button" onClick={() => { setEditCode(null); setEditError(null); }}
                            className="h-7 px-3 rounded-lg border border-border text-[12px] text-text-2 hover:text-text">
                            Cancel
                          </button>
                        </div>
                      </form>
                    </td>
                  ) : (
                    <>
                      <td className={`px-4 py-3 font-mono font-medium ${!l.active ? 'text-text-3' : 'text-text'}`}>
                        {l.code}
                      </td>
                      <td className={`px-3 py-3 hidden sm:table-cell text-[12px] ${!l.active ? 'text-text-3' : 'text-text-2'}`}>
                        {[l.rack, l.shelf, l.slot].filter(Boolean).join(' / ') || '—'}
                      </td>
                      <td className={`px-3 py-3 hidden md:table-cell text-[12px] ${!l.active ? 'text-text-3' : 'text-text-2'}`}>
                        {l.description || '—'}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`inline-flex items-center h-5 px-2 rounded text-[10px] font-medium
                          ${l.active ? 'bg-ok-bg text-ok-fg' : 'bg-border text-text-3'}`}>
                          {l.active ? 'Active' : 'Off'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                          <button type="button" onClick={() => printLocationLabels([l.code])}
                            className="text-[12px] text-text-3 hover:text-text transition-colors"
                            title="Print barcode label for this shelf location">
                            Label
                          </button>
                          <button type="button"
                            onClick={() => { setEditCode(l.code); setEditForm(toEditForm(l)); setEditError(null); }}
                            className="text-[12px] text-text-2 hover:text-text transition-colors">
                            Edit
                          </button>
                          <button type="button" disabled={toggleMutation.isPending}
                            onClick={() => toggleMutation.mutate({ code: l.code, active: !l.active })}
                            className={`text-[12px] transition-colors disabled:opacity-30 ${
                              l.active ? 'text-text-2 hover:text-warn-fg' : 'text-ok-fg hover:opacity-75'
                            }`}>
                            {l.active ? 'Deactivate' : 'Activate'}
                          </button>
                          <button type="button" disabled={deleteMutation.isPending}
                            onClick={() => {
                              if (confirm(`Delete location "${l.code}"?\n\nThis will fail if any products or sheets are still assigned to it.`)) {
                                deleteMutation.mutate(l.code);
                              }
                            }}
                            className="text-[12px] text-danger-fg hover:opacity-75 transition-opacity disabled:opacity-30">
                            Delete
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
