'use client';

import { useEffect } from 'react';

/**
 * Triggers window.print() once fonts are ready. Only fires inside the
 * hidden iframe the POS/invoice pages use (mirrors the receipt page's
 * AutoPrint) — opening ?autoprint=1 directly in a tab does nothing.
 */
export function AutoPrint() {
  useEffect(() => {
    if (window.self === window.top) return;
    let cancelled = false;

    async function go() {
      await document.fonts.ready;
      if (cancelled) return;
      window.print();
    }

    go();
    return () => { cancelled = true; };
  }, []);

  return null;
}
