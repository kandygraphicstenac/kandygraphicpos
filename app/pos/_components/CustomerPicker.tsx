'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { CustomerRecord } from '@/lib/types/customer';

type Props = {
  selectedCustomer: CustomerRecord | null;
  onSelect: (customer: CustomerRecord) => void;
  onClear: () => void;
  /** Called when the picker collapses (whether by selection or dismiss). */
  onClose?: () => void;
  /** Delivery orders require a customer — skips the collapsed "+ Add customer"
   * link and goes straight to the search box, with a required hint. */
  required?: boolean;
};

/** Below this, we don't even query — avoids dumping the whole customer list
 * into the dropdown for an empty or single-character box. */
const MIN_QUERY_LENGTH = 2;
const RESULT_LIMIT = 8;

/**
 * "Add customer" control for the POS cart. Collapsed (a single text link)
 * by default for counter sales — the common case — so walk-in sales are
 * never slowed down. Expands to a search box; selecting a match or
 * quick-creating collapses back to a compact chip. When `required` (a
 * delivery order), the search box is shown immediately instead of the link.
 */
export function CustomerPicker({ selectedCustomer, onSelect, onClear, onClose, required = false }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(true);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickPhone, setQuickPhone] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (expanded || required) inputRef.current?.focus();
  }, [expanded, required]);

  // The component stays mounted across order-type toggles (only `required`
  // changes), so re-entering delivery mode needs to reopen the dropdown —
  // otherwise it'd silently stay closed from a previous outside-click.
  useEffect(() => {
    if (required) setDropdownOpen(true);
  }, [required]);

  // Close the dropdown (and cancel any in-progress quick-create) on an
  // outside click. Uses mousedown + containment rather than the input's
  // onBlur so that clicking a result button doesn't race the blur event.
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setQuickCreateOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const queryLongEnough = debouncedQuery.length >= MIN_QUERY_LENGTH;

  const { data } = useQuery<{ customers: CustomerRecord[]; nextCursor: string | null }>({
    queryKey: ['pos-customer-search', debouncedQuery],
    queryFn: async () => {
      const p = new URLSearchParams({ pageSize: String(RESULT_LIMIT), q: debouncedQuery });
      const res = await fetch(`/api/customers?${p}`);
      if (!res.ok) throw new Error('Search failed');
      return res.json();
    },
    // `required` mode renders the search box without ever flipping `expanded`
    // (the collapsed "+ Add customer" link is skipped entirely) — gate on
    // whichever condition actually makes the box visible, not just `expanded`.
    enabled: (expanded || required) && queryLongEnough,
    staleTime: 10_000,
  });

  // Gate display on the live `query`, not the debounced one — shrinking the
  // box below the threshold hides results immediately rather than flashing
  // whatever the previous (now-stale) debounced fetch returned.
  const showResults = query.trim().length >= MIN_QUERY_LENGTH;
  const results = showResults ? data?.customers ?? [] : [];
  const hasMoreThanLimit = showResults && results.length >= RESULT_LIMIT && data?.nextCursor != null;

  function reset() {
    setExpanded(false);
    setQuery('');
    setDebouncedQuery('');
    setDropdownOpen(false);
    setQuickCreateOpen(false);
    setQuickName('');
    setQuickPhone('');
    setCreateError(null);
    onClose?.();
  }

  function handlePick(customer: CustomerRecord) {
    onSelect(customer);
    reset();
  }

  function openQuickCreate() {
    setQuickCreateOpen(true);
    setQuickName(query);
  }

  async function handleQuickCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!quickName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: quickName.trim(), phone: quickPhone.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) {
        setCreateError(json.error ?? 'Could not create customer');
        return;
      }
      handlePick(json as CustomerRecord);
    } catch {
      setCreateError('Network error — please retry');
    } finally {
      setCreating(false);
    }
  }

  // ── Selected: compact chip ──────────────────────────────────────────────────
  if (selectedCustomer) {
    return (
      <div className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-border text-[12px] text-text">
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 text-text-3 shrink-0">
          <path d="M8 8a3 3 0 100-6 3 3 0 000 6zM2 14a6 6 0 1112 0H2z" />
        </svg>
        <span className="truncate max-w-32">{selectedCustomer.name}</span>
        {selectedCustomer.phone && <span className="text-text-3 font-mono">{selectedCustomer.phone}</span>}
        <button
          type="button"
          onClick={onClear}
          aria-label="Remove customer"
          className="text-text-3 hover:text-danger-fg transition-colors duration-100 ml-0.5"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
            <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
          </svg>
        </button>
      </div>
    );
  }

  // ── Collapsed: single link (counter sales only — delivery skips straight
  // to the search box below since a customer is mandatory) ──────────────────
  if (!expanded && !required) {
    return (
      <button
        type="button"
        onClick={() => { setExpanded(true); setDropdownOpen(true); }}
        className="text-[12px] text-text-3 hover:text-accent transition-colors duration-100"
      >
        + Add customer
      </button>
    );
  }

  // ── Expanded: search + results / quick-create ──────────────────────────────
  return (
    <div ref={containerRef} className="relative">
      {required && (
        <p className="text-[11px] font-medium text-warn-fg mb-1">Customer required for delivery</p>
      )}
      <div className="flex items-center gap-1.5">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setDropdownOpen(true); }}
          onFocus={() => { if (query.trim()) setDropdownOpen(true); }}
          onKeyDown={(e) => { if (e.key === 'Escape' && !required) reset(); }}
          placeholder="Search name or phone…"
          className="h-7 w-44 bg-bg border border-border rounded-lg px-2 text-[12px] text-text
                     focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent
                     transition-colors duration-100"
        />
        {!required && (
          <button type="button" onClick={reset} className="text-text-3 hover:text-text transition-colors duration-100">
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
            </svg>
          </button>
        )}
      </div>

      {dropdownOpen && (!quickCreateOpen ? (
        <div className="absolute z-20 top-full left-0 mt-1 w-56 bg-surface border border-border rounded-xl shadow-lg overflow-hidden">
          {results.length > 0 && (
            <ul className="max-h-48 overflow-y-auto">
              {results.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => handlePick(c)}
                    className="w-full text-left px-3 py-2 text-[12px] hover:bg-bg transition-colors duration-75"
                  >
                    <span className="text-text">{c.name}</span>
                    {c.phone && <span className="text-text-3 ml-1.5 font-mono">{c.phone}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {hasMoreThanLimit && (
            <p className="px-3 py-1.5 text-[11px] text-text-3 border-t border-border">Keep typing to narrow…</p>
          )}
          {showResults && results.length === 0 && (
            <p className="px-3 py-2 text-[12px] text-text-3">No matches</p>
          )}
          <button
            type="button"
            onClick={openQuickCreate}
            className="w-full text-left px-3 py-2 text-[12px] text-accent hover:bg-bg transition-colors duration-75 border-t border-border"
          >
            + Quick create{query.trim() ? ` "${query.trim()}"` : ''}
          </button>
        </div>
      ) : (
        <form
          onSubmit={handleQuickCreate}
          className="absolute z-20 top-full left-0 mt-1 w-56 bg-surface border border-border rounded-xl shadow-lg p-3 space-y-2"
        >
          {createError && <p className="text-[11px] text-danger-fg">{createError}</p>}
          <input
            autoFocus
            type="text"
            value={quickName}
            onChange={(e) => setQuickName(e.target.value)}
            placeholder="Name"
            className="w-full h-7 bg-bg border border-border rounded-lg px-2 text-[12px] text-text
                       focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
          />
          <input
            type="tel"
            value={quickPhone}
            onChange={(e) => setQuickPhone(e.target.value)}
            placeholder="Phone (optional)"
            className="w-full h-7 bg-bg border border-border rounded-lg px-2 text-[12px] text-text
                       focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
          />
          <button
            type="submit"
            disabled={creating || !quickName.trim()}
            className="w-full h-7 rounded-lg bg-accent text-accent-fg text-[12px] font-medium
                       disabled:opacity-50 enabled:hover:opacity-90 transition-opacity duration-100"
          >
            {creating ? 'Saving…' : 'Save & select'}
          </button>
        </form>
      ))}
    </div>
  );
}
