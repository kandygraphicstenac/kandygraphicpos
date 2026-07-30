// 'thermal' was previously called 'roll'; getLabelFormat() still accepts it.
export type LabelFormat = 'a4' | 'thermal';

/**
 * The label format is NOT stored here any more.
 *
 * It used to live in window.localStorage, which made it per browser profile:
 * a newly created account had never written the key, silently fell back to A4,
 * and printed an A4 grid to the shop's thermal printer. It is now a shop-wide
 * AppSetting, read server-side by /catalog/labels (see getLabelFormat in
 * settingsService) and changeable only by an OWNER in Settings.
 *
 * Because the page resolves the format on the server, printing can never race
 * an unresolved fetch and fall back to a built-in default.
 */

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
  // No `format` param — the page resolves the shop-wide setting server-side.
  printViaIframe(new URLSearchParams({
    type,
    ids: ids.join(','),
    qty: String(opts.qty ?? 1),
    autoprint: '1',
  }));
}

/** Prints location barcode labels (one per code). Codes are shelf/rack codes, e.g. "A-1". */
export function printLocationLabels(codes: string[]): void {
  if (codes.length === 0) return;
  printViaIframe(new URLSearchParams({
    type: 'location',
    ids: codes.join(','),
    qty: '1',
    autoprint: '1',
  }));
}
