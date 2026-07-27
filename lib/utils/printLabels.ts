// 'thermal' was previously called 'roll' — we migrate the stored value on read.
export type LabelFormat = 'a4' | 'thermal';

export const LABEL_FORMAT_KEY = 'labelFormat';

export function getSavedLabelFormat(): LabelFormat {
  if (typeof window === 'undefined') return 'a4';
  const v = window.localStorage.getItem(LABEL_FORMAT_KEY);
  // Migrate legacy 'roll' value to 'thermal'
  return v === 'thermal' || v === 'roll' ? 'thermal' : 'a4';
}

export function saveLabelFormat(f: LabelFormat): void {
  if (typeof window !== 'undefined') window.localStorage.setItem(LABEL_FORMAT_KEY, f);
}

function printViaIframe(params: URLSearchParams): void {
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
  iframe.src = `/catalog/labels?${params}`;
  fallback = setTimeout(cleanup, 60_000);
}

/**
 * Prints labels via a hidden iframe so the print dialog appears over the current
 * page (same pattern as reprintInvoice). The iframe is removed after afterprint
 * fires or after a 60 s fallback.
 */
export function printLabels(
  type: 'part' | 'set',
  ids: number[],
  opts: { qty?: number } = {},
): void {
  if (ids.length === 0) return;
  const format = getSavedLabelFormat();
  printViaIframe(new URLSearchParams({
    type,
    ids: ids.join(','),
    format,
    qty: String(opts.qty ?? 1),
    autoprint: '1',
  }));
}

/** Prints location barcode labels (one per code). Codes are shelf/rack codes, e.g. "A-1". */
export function printLocationLabels(codes: string[]): void {
  if (codes.length === 0) return;
  const format = getSavedLabelFormat();
  printViaIframe(new URLSearchParams({
    type: 'location',
    ids: codes.join(','),
    format,
    qty: '1',
    autoprint: '1',
  }));
}
