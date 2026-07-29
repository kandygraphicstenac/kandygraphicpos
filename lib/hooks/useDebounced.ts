'use client';

import { useEffect, useState } from 'react';

/**
 * Debounces a rapidly-changing value (a search box) so it can be used in a
 * TanStack query key without firing a request per keystroke.
 *
 * 300ms for catalog lists. The POS search box uses a tighter 150ms inline in
 * PosShell, since a barcode scanner types a whole SKU in a few milliseconds
 * and the cashier is waiting.
 */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
