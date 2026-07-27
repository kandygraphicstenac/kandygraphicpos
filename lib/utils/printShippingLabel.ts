export type ShippingLabelFormat = '100x150mm' | 'A6';

export const SHIPPING_LABEL_FORMAT_KEY = 'shippingLabelFormat';

export function getSavedShippingLabelFormat(): ShippingLabelFormat {
  if (typeof window === 'undefined') return '100x150mm';
  const v = window.localStorage.getItem(SHIPPING_LABEL_FORMAT_KEY);
  return v === 'A6' ? 'A6' : '100x150mm';
}

export function saveShippingLabelFormat(f: ShippingLabelFormat): void {
  if (typeof window !== 'undefined') window.localStorage.setItem(SHIPPING_LABEL_FORMAT_KEY, f);
}

/**
 * Prints a parcel shipping label via a hidden iframe (same pattern as
 * reprintInvoice / printLabels) so the print dialog appears over the
 * current page without navigating away.
 */
export function printShippingLabel(invoiceId: string): void {
  const format = getSavedShippingLabelFormat();
  const params = new URLSearchParams({ format, autoprint: '1' });

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;width:0;height:0;border:0;left:-9999px;top:-9999px;';

  let done = false;
  let fallback: ReturnType<typeof setTimeout> | undefined;

  function cleanup() {
    if (done) return;
    done = true;
    clearTimeout(fallback);
    try { document.body.removeChild(iframe); } catch { /* already removed */ }
  }

  iframe.onload = () => {
    iframe.contentWindow?.addEventListener('afterprint', cleanup, { once: true });
  };

  document.body.appendChild(iframe);
  iframe.src = `/shipping-label/${encodeURIComponent(invoiceId)}?${params}`;
  fallback = setTimeout(cleanup, 60_000);
}
