'use client';

import { useEffect } from 'react';

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
