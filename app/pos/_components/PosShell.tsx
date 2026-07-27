'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useInfiniteQuery, useQuery, keepPreviousData } from '@tanstack/react-query';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import type { PosSearchResult, PosSearchResponse, FiltersResponse } from '@/lib/types/pos';
import type { CompanyRecord } from '@/lib/types/company';
import type { CartItem, SaleStatus, HeldSaleRecord, Toast } from './_types';
import { ProductCard } from './ProductCard';
import { CartPanel } from './CartPanel';
import { BrandTabs } from './BrandTabs';
import { SetDetailModal } from './SetDetailModal';
import { CashTenderModal } from './CashTenderModal';
import { ToastContainer } from './Toast';
import { NavUserMenu } from '@/app/_components/NavUserMenu';
import { CardPaymentModal } from './CardPaymentModal';
import { BankPaymentModal } from './BankPaymentModal';
import { ManagerAuthModal, type ManagerAuthResult } from '@/app/_components/ManagerAuthModal';
import { DISCOUNT_REASONS } from '@/lib/constants/reasons';
import type { CustomerRecord } from '@/lib/types/customer';
import { EMPTY_DELIVERY_ADDRESS, type DeliveryAddressForm } from './DeliverySection';
import { isCreditAvailable } from '@/lib/utils/credit';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getAvailability(p: PosSearchResult): number {
  return p.type === 'part' ? p.finishedStock : p.availability;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0].slice(0, 2).toUpperCase();
}

function makeHoldLabel(items: CartItem[]): string {
  const time = new Date().toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit' });
  const first = items[0]?.product.name ?? 'Cart';
  return `${time} · ${first.slice(0, 28)}`;
}

// ─── Query helpers ────────────────────────────────────────────────────────────

function searchUrl(q: string, brand: string | null, modelId: number | null, cursor?: string | null): string {
  const p = new URLSearchParams();
  if (q) p.set('q', q);
  if (brand) p.set('brand', brand);
  if (modelId !== null) p.set('modelId', String(modelId));
  if (cursor) p.set('cursor', cursor);
  return `/api/pos/search?${p}`;
}

function fetchSearchPage(q: string, brand: string | null, modelId: number | null) {
  return async ({ signal, pageParam }: { signal: AbortSignal; pageParam: string | null }): Promise<PosSearchResponse> => {
    const res = await fetch(searchUrl(q, brand, modelId, pageParam), { signal });
    if (!res.ok) throw new Error('Search failed');
    return res.json();
  };
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function ScanIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path strokeLinecap="round" d="M3 7V4.5A1.5 1.5 0 014.5 3H7M13 3h2.5A1.5 1.5 0 0117 4.5V7M17 13v2.5a1.5 1.5 0 01-1.5 1.5H13M7 17H4.5A1.5 1.5 0 013 15.5V13" />
      <path strokeLinecap="round" d="M6 10h8" />
    </svg>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="4" />
      <path d="M3 12h1m8-9v1m8 8h1m-9 8v1M5.6 5.6l.7.7m12.1-.7-.7.7m0 11.4.7.7-12.1-.7-.7.7" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z" />
    </svg>
  );
}

// ─── Theme toggle ─────────────────────────────────────────────────────────────

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === 'dark';

  // Placeholder keeps layout stable before hydration
  if (!mounted) return <div className="w-10 h-10 shrink-0" aria-hidden />;

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      className="w-10 h-10 flex items-center justify-center rounded-lg border border-transparent
                 text-text-2 hover:text-text hover:border-border hover:bg-border
                 transition-colors duration-100 shrink-0"
    >
      {/* key forces remount on theme change, triggering the entry animation */}
      <span key={isDark ? 'sun' : 'moon'} className="animate-theme-icon flex items-center">
        {isDark
          ? <SunIcon className="w-5 h-5" />
          : <MoonIcon className="w-5 h-5" />}
      </span>
    </button>
  );
}

// ─── Skeleton card ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden animate-pulse">
      <div className="aspect-4/3 w-full bg-border" />
      <div className="p-3 space-y-2">
        <div className="flex justify-between gap-2">
          <div className="h-4 w-14 rounded-md bg-border" />
          <div className="h-3 w-20 rounded bg-border" />
        </div>
        <div className="h-4 w-4/5 rounded bg-border" />
        <div className="h-3 w-1/2 rounded bg-border" />
        <div className="flex justify-between">
          <div className="h-4 w-16 rounded bg-border" />
          <div className="h-4 w-12 rounded-md bg-border" />
        </div>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

type Props = {
  user: { name: string; email: string; role: string };
};

export function PosShell({ user }: Props) {
  // ── Search state ────────────────────────────────────────────────────────────
  // inputQuery: live, controlled input value (updates on every keystroke)
  // debouncedQuery: drives the query key; updated 150ms after typing stops
  // Category state: updates immediately (no debounce needed)

  const [inputQuery, setInputQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<number | null>(null);

  // Debounce text input at 150ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(inputQuery.trim()), 150);
    return () => clearTimeout(timer);
  }, [inputQuery]);

  // ── TanStack Query: search (infinite / paginated) ──────────────────────────
  // Always enabled — the default (empty q, no filters) fetches the full product
  // list on mount. placeholderData: keepPreviousData keeps old cards visible while
  // refetching so category switches never flash skeletons after the first visit.
  // Key change resets to page 1 automatically.

  const {
    data: searchData,
    isFetching,
    isFetchingNextPage,
    isPending,
    isSuccess,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    queryKey: ['pos-search', debouncedQuery, selectedBrand, selectedModelId] as const,
    initialPageParam: null as string | null,
    queryFn: fetchSearchPage(debouncedQuery, selectedBrand, selectedModelId),
    getNextPageParam: (lastPage: PosSearchResponse) => lastPage.nextCursor ?? undefined,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const isSearching = isFetching && !isFetchingNextPage;

  // ── TanStack Query: filters (prefetched on mount, cached 5 min) ─────────────
  const { data: filters } = useQuery({
    queryKey: ['pos-filters'] as const,
    queryFn: async (): Promise<FiltersResponse> => {
      const res = await fetch('/api/pos/filters');
      if (!res.ok) throw new Error('Filters failed');
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  // ── TanStack Query: companies (cached indefinitely — companies rarely change) ─
  const { data: companies = [] } = useQuery({
    queryKey: ['companies'] as const,
    queryFn: async (): Promise<CompanyRecord[]> => {
      const res = await fetch('/api/companies');
      if (!res.ok) throw new Error('Failed to load companies');
      return res.json();
    },
    staleTime: Infinity,
  });

  // ── Company state (sticky — persisted in localStorage) ────────────────────
  // Null until either the stored value is read or companies have loaded.
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('pos-company');
    if (stored) {
      const id = parseInt(stored, 10);
      if (!isNaN(id)) { setSelectedCompanyId(id); return; }
    }
    // No stored value — default to first active company once list loads
    if (companies.length > 0) {
      setSelectedCompanyId(companies[0].id);
    }
  }, [companies]);

  function handleSelectCompany(id: number) {
    setSelectedCompanyId(id);
    localStorage.setItem('pos-company', String(id));
  }

  const results = searchData?.pages.flatMap((p) => p.items) ?? [];
  const totalCount = searchData?.pages[0]?.totalCount ?? 0;

  // ── Cart state ──────────────────────────────────────────────────────────────
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discountPct, setDiscountPct] = useState(0);
  const [saleStatus, setSaleStatus] = useState<SaleStatus>({ type: 'idle' });

  // ── Order type (chosen at the start of the sale) + customer + delivery ─────
  // COUNTER: unchanged fast walk-in flow, customer optional, no delivery.
  // DELIVERY: customer + delivery address + a fee > 0 are all mandatory —
  // gated client-side here (CartPanel disables payment) and re-verified
  // server-side in saleService (never trust the client-side gate alone).
  const [orderType, setOrderType] = useState<'COUNTER' | 'DELIVERY'>('COUNTER');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRecord | null>(null);
  const [deliveryFeeLKR, setDeliveryFeeLKR] = useState(0);
  const [deliveryAddr, setDeliveryAddr] = useState<DeliveryAddressForm>(EMPTY_DELIVERY_ADDRESS);

  // ── Discount authorization ──────────────────────────────────────────────────
  // discountAuth tracks the last manager approval; authorizedForPct lets us
  // detect when the cashier changes the % after approval, which invalidates it.
  // Authorization is triggered by committing the discount itself (on blur),
  // entirely decoupled from payment — payment buttons never check or wait on it.
  const [discountAuth, setDiscountAuth] = useState<(ManagerAuthResult & { authorizedForPct: number }) | null>(null);
  const [discountModalOpen, setDiscountModalOpen] = useState(false);

  const { data: discountThresholdData } = useQuery({
    queryKey: ['discount-threshold'] as const,
    queryFn: async (): Promise<{ thresholdPct: number }> => {
      const res = await fetch('/api/settings/discount-threshold');
      if (!res.ok) throw new Error('Failed to load threshold');
      return res.json();
    },
    staleTime: 5 * 60_000,
  });
  const discountThresholdPct = discountThresholdData?.thresholdPct ?? 0;

  // ── Held sales ──────────────────────────────────────────────────────────────
  const [heldSales, setHeldSales] = useState<HeldSaleRecord[]>([]);

  // ── Modals ──────────────────────────────────────────────────────────────────
  const [openSetId, setOpenSetId] = useState<number | null>(null);
  const [cashTenderOpen, setCashTenderOpen] = useState(false);
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [bankModalOpen, setBankModalOpen] = useState(false);

  // ── Toasts ──────────────────────────────────────────────────────────────────
  const [toasts, setToasts] = useState<Toast[]>([]);

  // ── Arrow-key navigation ────────────────────────────────────────────────────
  const [focusedCardIdx, setFocusedCardIdx] = useState(-1);
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const gridRef = useRef<HTMLDivElement>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // ─── Toast helpers ──────────────────────────────────────────────────────────

  const addToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, type, message }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ─── Load held sales on mount ───────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/pos/hold')
      .then((r) => r.ok ? r.json() : [])
      .then((rows: HeldSaleRecord[]) => setHeldSales(rows))
      .catch(() => null);
  }, []);

  // ─── Global "/" shortcut ────────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === '/' && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // ─── Clear success state when user starts typing again ─────────────────────

  useEffect(() => {
    if (inputQuery && saleStatus.type === 'success') setSaleStatus({ type: 'idle' });
  }, [inputQuery, saleStatus.type]);

  // ─── Arrow-key navigation in grid ──────────────────────────────────────────

  function getColCount(): number {
    if (!gridRef.current) return 3;
    return Math.max(1, Math.floor((gridRef.current.offsetWidth + 12) / (210 + 12)));
  }

  const navigate = useCallback(
    (currentIdx: number, dir: 'left' | 'right' | 'up' | 'down') => {
      const count = results.length;
      const cols = getColCount();
      let next = currentIdx;
      if (dir === 'left') next = currentIdx - 1;
      if (dir === 'right') next = currentIdx + 1;
      if (dir === 'up') next = currentIdx - cols;
      if (dir === 'down') next = currentIdx + cols;
      next = Math.max(0, Math.min(count - 1, next));
      if (next === currentIdx) return;
      setFocusedCardIdx(next);
      cardRefs.current[next]?.focus();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [results.length],
  );

  // ─── ArrowDown from search → focus first card ───────────────────────────────

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' && results.length > 0) {
      e.preventDefault();
      setFocusedCardIdx(0);
      cardRefs.current[0]?.focus();
      return;
    }

    if (e.key !== 'Enter') return;
    e.preventDefault();

    // Read from the DOM directly: a fast scanner can flood onChange events
    // faster than React re-renders, leaving inputQuery state a frame behind.
    const q = (inputRef.current?.value ?? inputQuery).trim();
    if (!q) return;

    // Sync debounced value immediately so the infinite query key updates, then
    // do a direct fetch of page 1 for instant barcode / exact-SKU detection.
    setDebouncedQuery(q);
    fetch(searchUrl(q, selectedBrand, selectedModelId))
      .then((res) => res.ok ? res.json() as Promise<PosSearchResponse> : null)
      .then((page) => {
        if (!page) return;
        const exact = page.items.find((r) => r.exactMatch);
        if (exact) {
          addToCart(exact);
          // flushSync forces React to commit the clear to the DOM synchronously
          // before returning, so the input is visually empty before focus() and
          // before the next scan's characters can land in the box.
          flushSync(() => {
            setInputQuery('');
            setDebouncedQuery('');
          });
          inputRef.current?.focus();
        }
      })
      .catch(() => null);
  }

  // ─── Query / category change handlers ──────────────────────────────────────

  function handleInputChange(value: string) {
    setInputQuery(value);
    // Typing clears the category filter (spec requirement)
    if (value.trim()) {
      setSelectedBrand(null);
      setSelectedModelId(null);
    }
  }

  function handleSelectBrand(b: string | null) {
    setSelectedBrand(b);
    setSelectedModelId(null);
    // Category click fires immediately — no debounce needed on brand/modelId
  }

  function handleSelectModel(id: number | null) {
    setSelectedModelId(id);
    // Category click fires immediately
  }

  function clearSearch() {
    setInputQuery('');
    setDebouncedQuery('');
    setSelectedBrand(null);
    setSelectedModelId(null);
    inputRef.current?.focus();
  }

  // Reset card focus when search parameters change
  useEffect(() => {
    setFocusedCardIdx(-1);
  }, [debouncedQuery, selectedBrand, selectedModelId]);

  // ─── Cart operations ────────────────────────────────────────────────────────

  const addToCart = useCallback(
    (product: PosSearchResult) => {
      const key = `${product.type}-${product.id}`;
      const avail = getAvailability(product);
      if (avail <= 0) return;

      setCart((prev) => {
        const idx = prev.findIndex((i) => i.key === key);
        if (idx >= 0) {
          if (prev[idx].qty >= avail) return prev;
          return prev.map((item, n) => (n === idx ? { ...item, qty: item.qty + 1 } : item));
        }
        return [...prev, { key, product, qty: 1, unitPrice: product.price }];
      });

      addToast(`Added: ${product.name}`, 'success');
      inputRef.current?.focus();
    },
    [addToast],
  );

  function handleUpdateQty(key: string, delta: number) {
    setCart((prev) =>
      prev.map((item) => {
        if (item.key !== key) return item;
        const avail = getAvailability(item.product);
        return { ...item, qty: Math.min(Math.max(1, item.qty + delta), avail) };
      }),
    );
  }

  function handleRemove(key: string) {
    setCart((prev) => prev.filter((i) => i.key !== key));
  }

  // ─── Customer + delivery ────────────────────────────────────────────────────

  function addressFromCustomer(customer: CustomerRecord): DeliveryAddressForm {
    return {
      name: customer.name,
      phone: customer.phone ?? '',
      line1: customer.addressLine1 ?? '',
      line2: customer.addressLine2 ?? '',
      city: customer.city ?? '',
      postalCode: customer.postalCode ?? '',
    };
  }

  function handleSelectCustomer(customer: CustomerRecord) {
    setSelectedCustomer(customer);
    if (orderType === 'DELIVERY') setDeliveryAddr(addressFromCustomer(customer));
  }

  function handleClearCustomer() {
    setSelectedCustomer(null);
  }

  function handleSetOrderType(type: 'COUNTER' | 'DELIVERY') {
    setOrderType(type);
    if (type === 'COUNTER') {
      // Delivery fee/address are exclusively a delivery-order concept now —
      // clear them so they can never be silently carried into a counter sale.
      setDeliveryFeeLKR(0);
      setDeliveryAddr(EMPTY_DELIVERY_ADDRESS);
      // selectedCustomer is intentionally kept — still optional/useful for a counter sale.
    } else if (selectedCustomer) {
      setDeliveryAddr(addressFromCustomer(selectedCustomer));
    }
  }

  function resetCustomerAndDelivery() {
    setOrderType('COUNTER');
    setSelectedCustomer(null);
    setDeliveryFeeLKR(0);
    setDeliveryAddr(EMPTY_DELIVERY_ADDRESS);
  }

  // ─── Held sales ─────────────────────────────────────────────────────────────

  async function handleHold() {
    if (cart.length === 0) return;
    const label = makeHoldLabel(cart);
    try {
      const res = await fetch('/api/pos/hold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, lines: cart }),
      });
      if (!res.ok) throw new Error();
      const held: HeldSaleRecord = await res.json();
      setHeldSales((prev) => [held, ...prev].slice(0, 5));
      setCart([]);
      setDiscountPct(0);
      setDiscountAuth(null);
      resetCustomerAndDelivery();
      addToast('Sale held', 'info');
    } catch {
      addToast('Could not hold sale', 'error');
    }
  }

  async function handleRestoreHeld(id: number) {
    const held = heldSales.find((h) => h.id === id);
    if (!held) return;
    setCart(held.lines);
    setDiscountPct(0);
    setDiscountAuth(null);
    resetCustomerAndDelivery();
    try {
      await fetch(`/api/pos/hold/${id}`, { method: 'DELETE' });
    } catch { /* non-blocking */ }
    setHeldSales((prev) => prev.filter((h) => h.id !== id));
    addToast('Sale restored', 'info');
  }

  // ─── Discount authorization ─────────────────────────────────────────────────

  function handleDiscountChange(v: number) {
    setDiscountPct(v);
    if (v === 0) setDiscountAuth(null);
  }

  /** True once the *current* discountPct is above the threshold and has no matching approval yet. */
  function discountNeedsAuth(): boolean {
    return discountPct > discountThresholdPct && discountAuth?.authorizedForPct !== discountPct;
  }

  // Commits the discount for authorization — called on blur, Enter, or the
  // explicit Apply button. This is the ONLY thing that opens the auth modal;
  // payment buttons never trigger it, so a payment click can never be the
  // gesture that gets "eaten" by the modal opening.
  function handleDiscountCommit() {
    if (discountPct === 0) return;
    if (discountNeedsAuth()) setDiscountModalOpen(true);
  }

  // Focuses the scan input only when no other text field is actively focused.
  // Safe to call from any modal/picker close handler — won't interrupt the
  // cashier mid-entry in a delivery address or discount field.
  function focusSearchIfSafe() {
    const active = document.activeElement;
    const typingElsewhere =
      active !== null &&
      active !== document.body &&
      active !== inputRef.current &&
      (active instanceof HTMLInputElement ||
       active instanceof HTMLTextAreaElement ||
       active instanceof HTMLSelectElement);
    if (!typingElsewhere) inputRef.current?.focus();
  }

  function handleDiscountAuthApprove(result: ManagerAuthResult) {
    setDiscountAuth({ ...result, authorizedForPct: discountPct });
    setDiscountModalOpen(false);
    inputRef.current?.focus();
  }

  function handleDiscountAuthClose() {
    // Cancelling reverts to the last approved value (or 0 if never approved).
    setDiscountPct(discountAuth?.authorizedForPct ?? 0);
    setDiscountModalOpen(false);
    inputRef.current?.focus();
  }

  // CustomerPicker still owns DOM focus when onClose fires (the input hasn't
  // unmounted yet), so defer one frame — after the picker unmounts the browser
  // moves focus to body, then focusSearchIfSafe() redirects it to the scan box.
  function handleCustomerPickerClose() {
    requestAnimationFrame(() => focusSearchIfSafe());
  }

  // ─── Payment ────────────────────────────────────────────────────────────────
  // Payment buttons are disabled in the UI while a discount is locked
  // (CartPanel handles this via discountLocked), so a plain mouse click can
  // never reach this handler in that state. The check below only matters for
  // the F1/F2/F3 keyboard shortcuts, which bypass the disabled attribute —
  // it opens the auth modal instead of silently doing nothing.

  function openPaymentDialog(payment: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'CREDIT') {
    if (payment === 'CASH') {
      setCashTenderOpen(true);
    } else if (payment === 'CARD') {
      setCardModalOpen(true);
    } else if (payment === 'BANK_TRANSFER') {
      setBankModalOpen(true);
    } else {
      // Credit has nothing to collect (no tender, no card/bank reference) —
      // selecting it completes the sale directly, same as the spec describes.
      void submitSale('CREDIT');
    }
  }

  function handlePaymentClick(payment: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'CREDIT') {
    if (cart.length === 0) return;
    if (discountNeedsAuth()) {
      setDiscountModalOpen(true);
      return;
    }
    openPaymentDialog(payment);
  }

  async function submitSale(
    payment: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'CREDIT',
    opts: { tenderedPaise?: number; paymentReference?: string; cardLast4?: string } = {},
  ) {
    // Last-chance guard: the discount may have been edited (or never
    // authorized) since the payment dialog was opened. No auto-resume here by
    // design — the cashier re-authorizes, then clicks payment again.
    if (discountPct > 0 && discountAuth?.authorizedForPct !== discountPct) {
      addToast('Discount needs manager approval — please re-authorize and try the payment again', 'error');
      setDiscountModalOpen(true);
      return;
    }

    const deliveryFeePaise = orderType === 'DELIVERY' ? Math.round(deliveryFeeLKR * 100) : 0;
    // Last-chance guard mirroring CartPanel's deliveryRequirementsMet — the
    // payment dialog could only have opened if this already passed once,
    // but re-check here too since this is the actual point of no return
    // before the request goes to the server (which re-validates again).
    if (orderType === 'DELIVERY' && (!selectedCustomer || deliveryFeePaise <= 0 || !deliveryAddr.name.trim() || !deliveryAddr.line1.trim())) {
      addToast('Select a customer and complete the delivery details first', 'error');
      return;
    }

    // Last-chance guard mirroring CartPanel's creditAvailable — selecting
    // Credit submits immediately with no intervening dialog, so this is the
    // only client-side check before the request goes to the server (which
    // re-validates with a row lock regardless).
    if (payment === 'CREDIT' && !isCreditAvailable(selectedCustomer, amountDuePaise)) {
      addToast('Credit is not available for this sale', 'error');
      return;
    }

    const { tenderedPaise, paymentReference, cardLast4 } = opts;
    const effectiveCompanyId = selectedCompanyId ?? companies[0]?.id ?? 1;
    setSaleStatus({ type: 'loading', payment });
    const subPaise = cart.reduce((s, i) => s + Math.round(parseFloat(i.unitPrice) * 100) * i.qty, 0);
    const discPaise = Math.round(subPaise * discountPct / 100);
    const totalPaise = subPaise - discPaise;

    try {
      const res = await fetch('/api/pos/sale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: effectiveCompanyId,
          lines: cart.map((item) =>
            item.product.type === 'part'
              ? { type: 'part', partId: item.product.id, qty: item.qty, unitPrice: item.unitPrice }
              : { type: 'set', setId: item.product.id, qty: item.qty, unitPrice: item.unitPrice },
          ),
          payment,
          orderType,
          discountPct,
          ...(tenderedPaise != null ? { tendered: tenderedPaise / 100 } : {}),
          ...(paymentReference ? { paymentReference } : {}),
          ...(cardLast4 ? { cardLast4 } : {}),
          ...(discountPct > 0 && discountAuth?.authToken ? { discountAuthToken: discountAuth.authToken } : {}),
          ...(selectedCustomer ? { customerId: selectedCustomer.id } : {}),
          ...(deliveryFeePaise > 0 ? {
            deliveryFee: (deliveryFeePaise / 100).toFixed(2),
            deliveryAddress: {
              name: deliveryAddr.name.trim(),
              ...(deliveryAddr.phone.trim() ? { phone: deliveryAddr.phone.trim() } : {}),
              line1: deliveryAddr.line1.trim(),
              ...(deliveryAddr.line2.trim() ? { line2: deliveryAddr.line2.trim() } : {}),
              ...(deliveryAddr.city.trim() ? { city: deliveryAddr.city.trim() } : {}),
              ...(deliveryAddr.postalCode.trim() ? { postalCode: deliveryAddr.postalCode.trim() } : {}),
            },
          } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const message = data.error ?? 'Sale failed — please retry';
        const requestId = typeof data.requestId === 'string' ? data.requestId : null;
        addToast(requestId ? `${message} (ref: ${requestId.slice(0, 8)})` : message, 'error');
        setSaleStatus({ type: 'idle' });
      } else {
        setSaleStatus({
          type: 'success',
          invoiceId: data.invoiceId,
          totalPaise,
          deliveryFeePaise: deliveryFeePaise > 0 ? deliveryFeePaise : undefined,
          companyName: data.companyName ?? '',
          tenderedPaise,
          paymentRef: paymentReference,
        });
        setCart([]);
        setDiscountPct(0);
        setDiscountAuth(null);
        resetCustomerAndDelivery();
        inputRef.current?.focus();
      }
    } catch {
      addToast('Network error — please retry', 'error');
      setSaleStatus({ type: 'idle' });
    }
  }

  function handleNewSale() {
    setSaleStatus({ type: 'idle' });
    inputRef.current?.focus();
  }

  // ─── Derived display state ──────────────────────────────────────────────────

  // isPending   — true only before the very first fetch resolves (show skeletons)
  // isSuccess   — true once data exists; keepPreviousData keeps it true across refetches
  // hasFilter   — determines which empty-state copy to show
  const hasFilter =
    debouncedQuery.length > 0 || selectedBrand !== null || selectedModelId !== null;
  const showSkeletons  = isPending;
  const showGrid       = isSuccess && results.length > 0;
  const showEmptySearch   = isSuccess && results.length === 0 && hasFilter;
  const showEmptyDefault  = isSuccess && results.length === 0 && !hasFilter;

  const cartSubPaise = cart.reduce(
    (s, i) => s + Math.round(parseFloat(i.unitPrice) * 100) * i.qty,
    0,
  );
  const cartTotalPaise = cartSubPaise - Math.round(cartSubPaise * discountPct / 100);
  // What the customer actually pays — product total + pass-through delivery.
  // Payment dialogs (tender/change, card ref, bank ref) use this, never cartTotalPaise alone.
  const deliveryFeePaise = orderType === 'DELIVERY' ? Math.round(deliveryFeeLKR * 100) : 0;
  const amountDuePaise = cartTotalPaise + deliveryFeePaise;

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col bg-bg overflow-hidden">

      {/* ── Top bar ── */}
      <header className="relative z-10 bg-surface border-b border-border px-4 py-2 flex items-center gap-4 shrink-0">
        <img
          src="/logos/kgpos-logo.png"
          alt="KGpos"
          className="h-7 w-auto dark:invert select-none shrink-0"
        />

        {/* Search */}
        <div className="flex-1 max-w-2xl relative flex items-center">
          <span className="absolute left-3 pointer-events-none text-text-3">
            <ScanIcon className="w-4 h-4" />
          </span>
          <input
            ref={inputRef}
            autoFocus
            type="search"
            value={inputQuery}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Scan barcode or search by name, model, brand…"
            className="w-full bg-bg border border-border rounded-lg pl-9 pr-16 py-2 text-[13px] text-text
                       placeholder:text-text-3
                       focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent
                       transition-colors duration-100"
          />
          <span className="absolute right-3 pointer-events-none flex items-center">
            {isSearching ? (
              <svg className="animate-spin w-4 h-4 text-text-3" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <kbd className="text-[11px] text-text-3 bg-border px-1.5 py-0.5 rounded font-mono leading-none">
                /
              </kbd>
            )}
          </span>
        </div>

        {/* Invoices + customers + theme toggle + user menu */}
        <div className="flex items-center gap-1 shrink-0 ml-auto">
          <Link
            href="/invoices"
            className="text-[13px] font-medium px-3 py-1.5 rounded-lg text-text-2
                       hover:text-text hover:bg-border transition-colors duration-100 whitespace-nowrap"
          >
            Invoices
          </Link>
          <Link
            href="/customers"
            className="text-[13px] font-medium px-3 py-1.5 rounded-lg text-text-2
                       hover:text-text hover:bg-border transition-colors duration-100 whitespace-nowrap"
          >
            Customers
          </Link>
          <ThemeToggle />
          <NavUserMenu user={user} />
        </div>
      </header>

      {/* ── Brand / model filter tabs ── */}
      {filters && (
        <BrandTabs
          filters={filters}
          selectedBrand={selectedBrand}
          selectedModelId={selectedModelId}
          onSelectBrand={handleSelectBrand}
          onSelectModel={handleSelectModel}
        />
      )}

      {/* ── Two-column body ── */}
      <div className="flex-1 flex min-h-0">

        {/* Left: product grid
            flex flex-col so the grid starts at the top and centered empty
            states use flex-1 to fill remaining space without affecting layout */}
        <section className="flex-1 overflow-y-auto p-4 min-w-0 flex flex-col">

          {/* Skeleton grid — only on the very first load (isPending) */}
          {showSkeletons && (
            <div ref={gridRef} className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
              {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          )}

          {/* Showing X of Y — visible when totalCount exceeds currently loaded items */}
          {isSuccess && results.length > 0 && totalCount > results.length && (
            <p className="text-[12px] text-text-3 mb-3">
              Showing {results.length} of {totalCount}
            </p>
          )}

          {/* Product grid — anchored to top, spinner in search bar shows background refetch */}
          {showGrid && (
            <div ref={gridRef} className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
              {results.map((r, idx) => (
                <ProductCard
                  key={`${r.type}-${r.id}`}
                  ref={(el) => { cardRefs.current[idx] = el; }}
                  result={r}
                  index={idx}
                  onAdd={addToCart}
                  onOpenSetDetail={setOpenSetId}
                  onNavigate={(dir) => navigate(idx, dir)}
                />
              ))}
            </div>
          )}

          {/* Load more button — hidden when all pages are loaded */}
          {showGrid && hasNextPage && (
            <div className="mt-4 pb-2 flex justify-center">
              <button
                type="button"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="h-9 px-5 rounded-lg border border-border text-[13px] text-text-2
                           hover:border-border-hover hover:text-text
                           disabled:opacity-50 disabled:cursor-not-allowed
                           transition-colors duration-100"
              >
                {isFetchingNextPage
                  ? 'Loading…'
                  : `Load more · ${Math.max(0, totalCount - results.length)} remaining`}
              </button>
            </div>
          )}

          {/* Empty: search/filter returned no matches */}
          {showEmptySearch && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-text-3 select-none">
              <ScanIcon className="w-10 h-10" />
              <p className="text-[14px]">No products matching &ldquo;{inputQuery || debouncedQuery}&rdquo;</p>
              <button
                type="button"
                onClick={clearSearch}
                className="text-[12px] text-accent hover:underline focus:outline-none"
              >
                Clear search
              </button>
            </div>
          )}

          {/* Empty: catalog has no products at all */}
          {showEmptyDefault && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-text-3 select-none">
              <ScanIcon className="w-10 h-10" />
              <p className="text-[14px]">No products yet</p>
              <p className="text-[12px] opacity-70">
                Add products in the{' '}
                <a href="/catalog" className="text-accent hover:underline">catalog</a>
              </p>
            </div>
          )}
        </section>

        {/* Right: cart panel */}
        <aside className="w-90 shrink-0 border-l border-border bg-surface flex flex-col min-h-0">
          <CartPanel
            items={cart}
            discountPct={discountPct}
            onDiscountChange={handleDiscountChange}
            onDiscountCommit={handleDiscountCommit}
            discountLocked={discountNeedsAuth()}
            discountAuthReason={discountAuth?.authorizedForPct === discountPct ? discountAuth.reason : null}
            onUpdateQty={handleUpdateQty}
            onRemove={handleRemove}
            onPayment={handlePaymentClick}
            saleStatus={saleStatus}
            onNewSale={handleNewSale}
            heldSales={heldSales}
            onHold={handleHold}
            onRestoreHeld={handleRestoreHeld}
            companies={companies}
            selectedCompanyId={selectedCompanyId}
            onSelectCompany={handleSelectCompany}
            orderType={orderType}
            onSetOrderType={handleSetOrderType}
            selectedCustomer={selectedCustomer}
            onSelectCustomer={handleSelectCustomer}
            onClearCustomer={handleClearCustomer}
            onCustomerPickerClose={handleCustomerPickerClose}
            deliveryFeeLKR={deliveryFeeLKR}
            onDeliveryFeeChange={setDeliveryFeeLKR}
            deliveryAddress={deliveryAddr}
            onDeliveryAddressChange={setDeliveryAddr}
          />
        </aside>
      </div>

      {/* ── Modals ── */}
      {openSetId !== null && (
        <SetDetailModal
          setId={openSetId}
          onAddToCart={(result) => { addToCart(result); }}
          onClose={() => { setOpenSetId(null); inputRef.current?.focus(); }}
        />
      )}

      {cashTenderOpen && (
        <CashTenderModal
          totalPaise={amountDuePaise}
          onConfirm={(tenderedPaise) => { setCashTenderOpen(false); submitSale('CASH', { tenderedPaise }); }}
          onClose={() => { setCashTenderOpen(false); inputRef.current?.focus(); }}
        />
      )}

      {cardModalOpen && (
        <CardPaymentModal
          totalPaise={amountDuePaise}
          onConfirm={(ref, last4) => {
            setCardModalOpen(false);
            submitSale('CARD', { paymentReference: ref || undefined, cardLast4: last4 || undefined });
          }}
          onClose={() => { setCardModalOpen(false); inputRef.current?.focus(); }}
        />
      )}

      {bankModalOpen && (
        <BankPaymentModal
          totalPaise={amountDuePaise}
          onConfirm={(ref) => {
            setBankModalOpen(false);
            submitSale('BANK_TRANSFER', { paymentReference: ref || undefined });
          }}
          onClose={() => { setBankModalOpen(false); inputRef.current?.focus(); }}
        />
      )}

      {discountModalOpen && (
        <ManagerAuthModal
          action="discount"
          actionLabel="Discount"
          amountPaise={Math.round(cartSubPaise * discountPct / 100)}
          reasonOptions={DISCOUNT_REASONS}
          onApprove={handleDiscountAuthApprove}
          onClose={handleDiscountAuthClose}
        />
      )}

      {/* ── Toasts ── */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
