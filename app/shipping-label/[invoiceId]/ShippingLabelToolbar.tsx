'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  getSavedShippingLabelFormat,
  saveShippingLabelFormat,
  type ShippingLabelFormat,
} from '@/lib/utils/printShippingLabel';

const FORMAT_OPTS: { value: ShippingLabelFormat; label: string }[] = [
  { value: '100x150mm', label: '100 × 150 mm' },
  { value: 'A6', label: 'A6' },
];

// @page rules must live in <head> to affect the print dialog — JSX <style>
// tags render in <body>, so we inject directly (same pattern as LabelViewer).
function usePageCss(format: ShippingLabelFormat) {
  const styleEl = useRef<HTMLStyleElement | null>(null);

  useEffect(() => {
    if (!styleEl.current) {
      const el = document.createElement('style');
      el.id = 'shipping-label-page-rule';
      document.head.appendChild(el);
      styleEl.current = el;
    }
    const size = format === 'A6' ? 'A6' : '100mm 150mm';
    styleEl.current.textContent = `
      @page { size: ${size}; margin: 5mm; }
      @media print {
        html, body { margin: 0 !important; padding: 0 !important; }
      }
    `;
  }, [format]);

  useEffect(() => {
    return () => { styleEl.current?.remove(); };
  }, []);
}

export function ShippingLabelToolbar({ invoiceId, initialFormat }: { invoiceId: string; initialFormat: ShippingLabelFormat }) {
  const router = useRouter();
  const [format, setFormat] = useState<ShippingLabelFormat>(initialFormat);

  useEffect(() => {
    const stored = getSavedShippingLabelFormat();
    if (stored !== initialFormat) setFormat(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  usePageCss(format);

  function handleFormatChange(f: ShippingLabelFormat) {
    setFormat(f);
    saveShippingLabelFormat(f);
    router.replace(`/shipping-label/${invoiceId}?format=${f}`, { scroll: false });
  }

  return (
    <div
      className="no-print-toolbar"
      style={{
        display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12,
        padding: '10px 16px', background: '#fff', borderBottom: '1px solid #e4e4e0',
      }}
    >
      <span style={{ fontSize: 12, color: '#6b6b66' }}>Label size</span>
      {FORMAT_OPTS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => handleFormatChange(o.value)}
          style={{
            height: 30, padding: '0 12px', borderRadius: 999, fontSize: 12, fontWeight: 500,
            border: format === o.value ? 'none' : '1px solid #e4e4e0',
            background: format === o.value ? '#0F6E56' : 'transparent',
            color: format === o.value ? '#fff' : '#6b6b66',
            cursor: 'pointer',
          }}
        >
          {o.label}
        </button>
      ))}
      <span style={{ fontSize: 11, color: '#9c9c96' }}>{invoiceId}</span>
      <button
        type="button"
        onClick={() => window.print()}
        style={{
          marginLeft: 'auto', height: 32, padding: '0 20px', borderRadius: 8,
          background: '#0F6E56', color: '#fff', border: 'none',
          fontSize: 13, fontWeight: 500, cursor: 'pointer',
        }}
      >
        Print
      </button>
    </div>
  );
}
