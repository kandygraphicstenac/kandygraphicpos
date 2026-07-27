'use client';

import { useEffect } from 'react';

interface Props {
  /** id of the barcode <img> — AutoPrint waits for it before opening the dialog. */
  barcodeId: string;
}

/**
 * Triggers window.print() once the page is fully ready (fonts loaded, barcode decoded).
 *
 * Only fires when the component is running inside an iframe (window.self !== window.top).
 * This prevents accidentally auto-printing if someone opens the ?autoprint=1 URL directly
 * in a browser tab; the POS's hidden-iframe flow is the only intended trigger.
 */
export function AutoPrint({ barcodeId }: Props) {
  useEffect(() => {
    // Guard: only auto-print inside the hidden POS iframe.
    if (window.self === window.top) return;

    let cancelled = false;

    async function go() {
      // Wait for all fonts so text is fully rendered before the dialog captures the page.
      await document.fonts.ready;
      if (cancelled) return;

      // Wait for the barcode image (data-URL, so usually already complete,
      // but guard for async decoding on slower hardware).
      const img = document.getElementById(barcodeId) as HTMLImageElement | null;
      if (img && !img.complete) {
        await new Promise<void>((resolve) => {
          img.addEventListener('load',  () => resolve(), { once: true });
          img.addEventListener('error', () => resolve(), { once: true });
        });
      }
      if (cancelled) return;

      window.print();
    }

    go();
    return () => { cancelled = true; };
  }, [barcodeId]);

  return null;
}
