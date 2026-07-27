/**
 * Opens the receipt for the given invoiceId in a hidden iframe and auto-prints it.
 * The iframe is removed after printing (afterprint event) or after a 60s timeout.
 * Can be called from any client component that has access to document.
 */
export function reprintInvoice(invoiceId: string): void {
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
  iframe.src = `/receipt/${invoiceId}?autoprint=1`;
  fallback = setTimeout(cleanup, 60_000);
}
