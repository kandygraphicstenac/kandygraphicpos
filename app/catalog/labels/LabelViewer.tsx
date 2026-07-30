'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSavedLabelFormat, saveLabelFormat, type LabelFormat } from '@/lib/utils/printLabels';
import { labelRowFill, MAX_COPIES } from '@/lib/utils/labelLayout';
import type { LabelStockSettings } from '@/lib/services/settingsService';

export type LabelItem = {
  id: number;
  sku: string;
  name: string;
  price: string;
  /**
   * Printed in full so two variants of the same part can be told apart on the
   * rack. Several parts share a name ("tank left") and differ only by colour,
   * which was otherwise readable only by decoding the SKU suffix (-RDBK/-BLBK).
   * Absent for location labels; omitted from the layout entirely when empty.
   */
  color?: string | null;
  /**
   * "Bajaj Pulsar 150 2019" — built with modelLabel() so year ranges match the
   * rest of the app. Shares one line with the colour to keep the label at four
   * lines. Optional: location labels construct LabelItem without it.
   */
  model?: string | null;
  barcodeUrl: string;
};

interface Props {
  items: LabelItem[];
  initialQty: number;
  initialFormat: LabelFormat;
  type: string;
  ids: string;
  /** Populated when format === 'thermal'; null for A4. */
  labelStock: LabelStockSettings | null;
}

const FORMAT_OPTS: { value: LabelFormat; label: string; hint: string }[] = [
  { value: 'a4',      label: 'A4 sheet',       hint: '5-up grid, cut lines' },
  { value: 'thermal', label: 'Thermal printer', hint: 'Uses configured label stock (default: 50×25mm, 2-up)' },
];

// Inject format-specific @page CSS into <head>.
// JSX <style> tags land in <body>; @page rules must be in <head> to reliably
// affect the print dialog. !important beats inline style="" in the cascade.
function usePageCss(format: LabelFormat, stock: LabelStockSettings | null) {
  const styleEl = useRef<HTMLStyleElement | null>(null);

  useEffect(() => {
    if (!styleEl.current) {
      const el = document.createElement('style');
      el.id = 'label-page-rule';
      document.head.appendChild(el);
      styleEl.current = el;
    }

    if (format === 'thermal' && stock) {
      // Total page width = sum of all label columns + gaps between them.
      // Each page-row (= one .label-row div) maps to one label-tape advance on
      // the Zebra, so break-after:page goes on rows, NOT on individual labels.
      const pageW = stock.columns * stock.widthMm + (stock.columns - 1) * stock.columnGapMm;

      styleEl.current.textContent = `
        @page { size: ${pageW}mm ${stock.heightMm}mm; margin: 0; }
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; }

          .label-grid {
            display: block !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          /* Each row = one physical label-tape advance */
          .label-row {
            display: grid !important;
            grid-template-columns: repeat(${stock.columns}, ${stock.widthMm}mm) !important;
            column-gap: ${stock.columnGapMm}mm !important;
            width: ${pageW}mm !important;
            height: ${stock.heightMm}mm !important;
            page-break-after: always !important;
            break-after: page !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            overflow: hidden !important;
          }
          .label-row:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }

          .label {
            width: ${stock.widthMm}mm !important;
            height: ${stock.heightMm}mm !important;
            padding: ${stock.paddingMm}mm !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            overflow: hidden !important;
            box-sizing: border-box !important;
          }
        }
      `;
    } else {
      // A4: 5-column grid, each label 38×25mm, 1.5mm gap
      styleEl.current.textContent = `
        @page { size: A4; margin: 8mm; }
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; }

          .label-grid {
            display: grid !important;
            grid-template-columns: repeat(5, 38mm) !important;
            gap: 1.5mm !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          /* For A4, .label-row is a display:contents wrapper so the labels
             flow into the outer grid as if the rows didn't exist */
          .label-row { display: contents !important; }

          .label {
            width: 38mm !important;
            height: 25mm !important;
            padding: 1mm 1mm 0.8mm !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `;
    }
  }, [format, stock]);

  useEffect(() => {
    return () => { styleEl.current?.remove(); };
  }, []);
}

// ── Individual label card ─────────────────────────────────────────────────────

function LabelCard({
  item,
  labelStyle,
  showBorder,
}: {
  item: LabelItem;
  labelStyle: React.CSSProperties;
  showBorder: boolean;
}) {
  return (
    <div
      className="label"
      style={{
        ...labelStyle,
        ...(showBorder ? { border: '0.3mm solid #ccc', borderRadius: '1mm' } : {}),
      }}
    >
      {item.barcodeUrl ? (
        <img
          className="label-barcode"
          src={item.barcodeUrl}
          alt=""
          aria-hidden="true"
        />
      ) : (
        <div className="label-sku-fallback">{item.sku}</div>
      )}
      <div className="label-sku">{item.sku}</div>

      {/* Bike model on its own line: the same name recurs across hundreds of
          models ("Full Sticker Kit" exists for every bike), so this is a
          primary identifier. Omitted entirely when absent — no blank line. */}
      {item.model?.trim() && <div className="label-model">{item.model}</div>}

      {/* Name + colour share the bottom line, keeping the label at four lines.
          When colour is present this is a flex row where the NAME truncates and
          the colour never does (see .label-meta in the stylesheet) — colour is
          the fastest discriminator between otherwise-identical labels.
          With no colour the name renders as a plain block exactly as before,
          which is what location labels (no colour, no model) still get. */}
      {item.color?.trim() ? (
        <div className="label-meta">
          {item.name.trim() && <span className="label-name">{item.name}</span>}
          {item.name.trim() && <span className="label-meta-sep">·</span>}
          <span className="label-color">{item.color}</span>
        </div>
      ) : (
        item.name.trim() && <div className="label-name">{item.name}</div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function LabelViewer({ items, initialQty, initialFormat, type, ids, labelStock }: Props) {
  const router = useRouter();
  const [qty, setQty] = useState(initialQty);
  const [format, setFormat] = useState<LabelFormat>(initialFormat);

  // Sync from localStorage on mount (client may differ from URL default)
  useEffect(() => {
    const stored = getSavedLabelFormat();
    if (stored !== initialFormat) {
      setFormat(stored);
      const params = new URLSearchParams({ type, ids, format: stored, qty: String(qty) });
      router.replace(`/catalog/labels?${params}`, { scroll: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  usePageCss(format, labelStock);

  function handleFormatChange(f: LabelFormat) {
    setFormat(f);
    saveLabelFormat(f);
    const params = new URLSearchParams({ type, ids, format: f, qty: String(qty) });
    router.replace(`/catalog/labels?${params}`, { scroll: false });
  }

  function handleQtyChange(v: number) {
    const clamped = Math.max(1, Math.min(MAX_COPIES, v));
    setQty(clamped);
    const params = new URLSearchParams({ type, ids, format, qty: String(clamped) });
    router.replace(`/catalog/labels?${params}`, { scroll: false });
  }

  // Expand: each item repeated qty times, CONSECUTIVELY (A, A, B, B) so copies
  // come off the roll grouped and are easy to separate onto one rack bin.
  // Done here, before row grouping, so pagination and the @page rules below
  // treat a 200-label batch exactly like any other list.
  const expanded: LabelItem[] = [];
  for (const item of items) {
    for (let i = 0; i < qty; i++) expanded.push(item);
  }

  // Dimensions for screen preview (inline style per format)
  const isThermal = format === 'thermal' && labelStock != null;
  const labelStyle: React.CSSProperties = isThermal
    ? { width: `${labelStock.widthMm}mm`, height: `${labelStock.heightMm}mm`, padding: `${labelStock.paddingMm}mm` }
    : { width: '38mm', height: '25mm', padding: '1mm 1mm 0.8mm' };

  // Group labels into rows of `columns` for thermal; for A4 keep flat.
  // `columns` comes from the saved Thermal label stock setting — never a
  // hardcoded 2 — so changing the stock in Settings changes this with it.
  const columns = isThermal ? labelStock.columns : 5;
  const rows: LabelItem[][] = [];
  for (let i = 0; i < expanded.length; i += columns) {
    rows.push(expanded.slice(i, i + columns));
  }

  // How the batch lands on the stock. Informational only — the quantity is
  // never rounded up and no filler label is ever added; the user decides
  // whether a part-empty last row is acceptable.
  const totalLabels = expanded.length;
  const { totalRows, blanks } = labelRowFill(totalLabels, columns);

  // Hint string for thermal format toolbar
  const thermalHint = labelStock
    ? `${labelStock.widthMm}×${labelStock.heightMm}mm, ${labelStock.columns}-across, ${labelStock.columnGapMm}mm gap`
    : '';

  return (
    <>
      {/* Screen-only toolbar */}
      <div className="no-print-toolbar" style={{
        display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12,
        padding: '10px 16px', background: '#fff', borderBottom: '1px solid #e4e4e0',
      }}>
        {/* Format selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: '#6b6b66', marginRight: 4 }}>Format</span>
          {FORMAT_OPTS.map((o) => (
            <button
              key={o.value}
              type="button"
              title={o.hint}
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
          {isThermal && (
            <span style={{ fontSize: 11, color: '#9c9c96', marginLeft: 2 }}>{thermalHint}</span>
          )}
        </div>

        {/* Qty input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: '#6b6b66' }}>Copies each</span>
          <button type="button" onClick={() => handleQtyChange(qty - 1)}
            style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e4e4e0', background: 'none', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>
            −
          </button>
          <input
            type="number" min={1} max={MAX_COPIES} value={qty}
            onChange={(e) => handleQtyChange(parseInt(e.target.value, 10) || 1)}
            style={{ width: 44, height: 28, borderRadius: 6, border: '1px solid #e4e4e0', textAlign: 'center', fontSize: 13, padding: '0 4px' }}
          />
          <button type="button" onClick={() => handleQtyChange(qty + 1)}
            style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e4e4e0', background: 'none', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>
            +
          </button>
        </div>

        {/* Summary + how it lands on the stock */}
        <span style={{ fontSize: 12, color: '#9c9c96' }}>
          {items.length} item{items.length !== 1 ? 's' : ''} × {qty} = {totalLabels} label{totalLabels !== 1 ? 's' : ''}
          {totalLabels > 0 && (
            <>
              {' — '}
              {blanks === 0 ? (
                <span style={{ color: '#6b6b66' }}>
                  fills {totalRows} row{totalRows !== 1 ? 's' : ''} of {columns}
                </span>
              ) : (
                <span style={{ color: '#8a6d1f', fontWeight: 500 }}>
                  {totalRows} row{totalRows !== 1 ? 's' : ''} of {columns}, last row has{' '}
                  {blanks} blank{blanks !== 1 ? 's' : ''}
                </span>
              )}
            </>
          )}
        </span>

        <span style={{ fontSize: 11, color: '#b0b0aa', marginLeft: 4 }}>
          · In Chrome: disable <em>Headers and footers</em>
        </span>

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

      {/* Label grid
          Thermal: rows of `columns` labels — each row is a .label-row div.
            @media print: break-after:page on .label-row → one tape advance per row.
          A4: same .label-row wrappers but print CSS sets display:contents so they
              dissolve into the 5-column grid (labels flow naturally across pages). */}
      <div
        className="label-grid"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: isThermal ? `${labelStock.columnGapMm}mm` : '4px',
          padding: 16,
          alignItems: 'flex-start',
        }}
      >
        {rows.length === 0 && (
          <p style={{ padding: 32, color: '#9c9c96', fontSize: 13 }}>No labels to display.</p>
        )}
        {rows.map((row, rowIdx) => (
          <div
            key={rowIdx}
            className="label-row"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: isThermal ? `${labelStock.columnGapMm}mm` : '4px',
            }}
          >
            {row.map((label, labelIdx) => (
              <LabelCard
                key={`${label.id}-${rowIdx}-${labelIdx}`}
                item={label}
                labelStyle={labelStyle}
                showBorder={!isThermal}
              />
            ))}
            {/* Pad the last row with an invisible filler to keep the grid balanced */}
            {isThermal && row.length < columns && (
              <div style={{ ...labelStyle, visibility: 'hidden' }} aria-hidden="true" />
            )}
          </div>
        ))}
      </div>
    </>
  );
}
