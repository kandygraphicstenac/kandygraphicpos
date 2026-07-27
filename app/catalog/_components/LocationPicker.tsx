'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { LocationRecord } from '@/lib/types/location';

interface Props {
  value: string | null;
  onChange: (code: string | null) => void;
  placeholder?: string;
  inputClassName?: string;
}

/**
 * Combobox for picking or inline-creating a stock location code.
 * Typing a code that doesn't exist shows "Create 'X'" — creates the location
 * immediately and selects it. Clear button removes the assignment.
 */
export function LocationPicker({
  value,
  onChange,
  placeholder = 'e.g. A-1',
  inputClassName,
}: Props) {
  const qc = useQueryClient();
  const [inputVal, setInputVal] = useState(value ?? '');
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync when parent clears/changes value
  useEffect(() => { setInputVal(value ?? ''); }, [value]);

  const { data: locations = [] } = useQuery<LocationRecord[]>({
    queryKey: ['locations'],
    queryFn: () => fetch('/api/locations').then((r) => r.json()),
    staleTime: 60_000,
  });

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setInputVal(value ?? '');
        setCreateError(null);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [value]);

  const activeLocations = locations.filter((l) => l.active);
  const typed = inputVal.trim().toUpperCase();
  const filtered = activeLocations.filter(
    (l) =>
      !inputVal ||
      l.code.toUpperCase().includes(typed) ||
      (l.description?.toLowerCase().includes(inputVal.toLowerCase())),
  );
  const exactMatch = activeLocations.find((l) => l.code.toUpperCase() === typed);
  const showCreate = typed.length > 0 && !exactMatch;

  function handleSelect(code: string) {
    onChange(code);
    setInputVal(code);
    setOpen(false);
    setCreateError(null);
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange(null);
    setInputVal('');
    setOpen(false);
    inputRef.current?.focus();
  }

  async function handleCreate() {
    if (!typed) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: typed }),
      });
      const data = await res.json() as { code?: string; error?: string };
      if (!res.ok) { setCreateError(data.error ?? 'Create failed'); return; }
      void qc.invalidateQueries({ queryKey: ['locations'] });
      handleSelect(data.code ?? typed);
    } catch {
      setCreateError('Network error — please retry');
    } finally {
      setCreating(false);
    }
  }

  const baseCls =
    'w-full h-9 px-3 bg-bg border border-border rounded-lg text-[13px] text-text ' +
    'placeholder:text-text-3 focus:outline-none focus:ring-2 focus:ring-accent/40 ' +
    'focus:border-accent transition-colors';

  return (
    <div ref={containerRef} className="relative">
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          value={inputVal}
          onChange={(e) => { setInputVal(e.target.value); setOpen(true); setCreateError(null); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setOpen(false); setInputVal(value ?? ''); }
            if (e.key === 'Enter') {
              e.preventDefault();
              if (exactMatch) handleSelect(exactMatch.code);
              else if (showCreate && !creating) void handleCreate();
            }
          }}
          placeholder={placeholder}
          className={`${inputClassName ?? baseCls} pr-8 font-mono uppercase`}
          autoComplete="off"
        />
        {value && (
          <button
            type="button"
            onClick={handleClear}
            tabIndex={-1}
            className="absolute right-2.5 text-text-3 hover:text-text transition-colors"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
            </svg>
          </button>
        )}
      </div>

      {open && (filtered.length > 0 || showCreate) && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-surface border border-border rounded-xl shadow-lg overflow-hidden max-h-44 overflow-y-auto">
          {filtered.map((l) => (
            <button
              key={l.code}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(l.code); }}
              className="w-full text-left px-3 py-2 text-[13px] hover:bg-bg transition-colors flex items-center gap-2"
            >
              <span className="font-mono text-text">{l.code}</span>
              {l.description && (
                <span className="text-text-3 text-[12px] truncate">{l.description}</span>
              )}
            </button>
          ))}
          {showCreate && (
            <button
              type="button"
              disabled={creating}
              onMouseDown={(e) => { e.preventDefault(); void handleCreate(); }}
              className="w-full text-left px-3 py-2 text-[12px] text-accent hover:bg-bg transition-colors border-t border-border disabled:opacity-50"
            >
              {creating ? 'Creating…' : `+ Create "${typed}"`}
            </button>
          )}
        </div>
      )}

      {createError && (
        <p className="text-[11px] text-danger-fg mt-1">{createError}</p>
      )}
    </div>
  );
}
