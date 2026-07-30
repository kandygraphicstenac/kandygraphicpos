import { redirect } from 'next/navigation';
import bwipjs from 'bwip-js/node';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getLabelStockSettings, type LabelStockSettings } from '@/lib/services/settingsService';
import { canPrintLabels } from '@/lib/permissions';
import { modelLabel } from '@/lib/utils/modelLabel';
import { LabelViewer, type LabelItem } from './LabelViewer';
import { AutoPrint } from './AutoPrint';
import type { LabelFormat } from '@/lib/utils/printLabels';

const LKR = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' });

// Barcode PNG — no includetext so we render SKU ourselves below the image.
// scale=5 for thermal (targets 203 DPI — more pixels than the CSS display size so
// the printer scales DOWN rather than UP, keeping bars sharp).
// scale=3 for A4 (printed at screen-equivalent DPI on laser/inkjet, 38mm labels).
async function makeBarcodeDataUrl(text: string, scale: number): Promise<string> {
  try {
    const png = await bwipjs.toBuffer({
      bcid: 'code128',
      text,
      scale,
      height: 8,
      includetext: false,
    });
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch {
    return '';
  }
}

export default async function LabelsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; ids?: string; qty?: string; format?: string; autoprint?: string }>;
}) {
  const user = await getCurrentUser();
  // OWNER and CUTTER print from the catalog, CASHIER reprints from the POS.
  // Allow-listed so newly added roles don't inherit label printing.
  if (!user || !canPrintLabels(user.role)) redirect('/');

  const { type, ids: idsParam, qty: qtyParam, format: fmtParam, autoprint } = await searchParams;

  const rawIds = (idsParam ?? '')
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n > 0)
    .slice(0, 200);

  // Kept in step with MAX_COPIES in LabelViewer — a hand-edited ?qty= in the
  // URL must be clamped the same way the control is.
  const qty = Math.max(1, Math.min(200, parseInt(qtyParam ?? '1', 10) || 1));
  // Accept 'roll' as a legacy alias for 'thermal'
  const format: LabelFormat = (fmtParam === 'thermal' || fmtParam === 'roll') ? 'thermal' : 'a4';

  // Thermal format reads label stock dimensions from AppSetting (DB).
  // A4 format uses hardcoded 38×25mm grid — no DB read needed.
  const labelStock: LabelStockSettings | null = format === 'thermal'
    ? await getLabelStockSettings()
    : null;

  const barcodeScale = format === 'thermal' ? 5 : 3;

  // Location labels use codes (strings), not integer ids
  if (type === 'location') {
    const rawCodes = (idsParam ?? '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 200);
    if (rawCodes.length === 0) {
      return (
        <div style={{ padding: 40, textAlign: 'center', color: '#888', fontFamily: 'system-ui', fontSize: 10 }}>
          No location codes selected.
        </div>
      );
    }
    const locations = await prisma.location.findMany({
      where: { code: { in: rawCodes } },
      select: { code: true, description: true },
    });
    const locItems: LabelItem[] = await Promise.all(
      locations.map(async (l, i) => ({
        id: i,
        sku: l.code,
        name: l.description ?? '',
        price: '',
        barcodeUrl: await makeBarcodeDataUrl(l.code, barcodeScale),
      })),
    );
    return (
      <>
        <style>{`
          @media print {
            header, .no-print-toolbar { display: none !important; }
            body { background: white !important; }
          }
          .label { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:1mm; box-sizing:border-box; overflow:hidden; background:white; font-family:system-ui,sans-serif; }
          .label-barcode { width:90%; max-height:12mm; object-fit:contain; flex-shrink:0; display:block; image-rendering:pixelated; }
          .label-sku { font-size:7pt; font-family:'Courier New',Courier,monospace; color:#333; text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; letter-spacing:0.02em; line-height:1; flex-shrink:0; }
          .label-name { font-size:6pt; color:#222; text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; line-height:1.2; flex-shrink:0; }
        `}</style>
        <LabelViewer items={locItems} initialQty={qty} initialFormat={format} type="location" ids={idsParam ?? ''} labelStock={labelStock} />
        {autoprint === '1' && <AutoPrint />}
      </>
    );
  }

  if (rawIds.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#888', fontFamily: 'system-ui', fontSize: 10 }}>
        No items selected. Close this tab and select parts or sets to print.
      </div>
    );
  }

  let items: LabelItem[] = [];

  if (type === 'set') {
    const sets = await prisma.stickerSet.findMany({
      where: { id: { in: rawIds } },
      select: {
        id: true, sku: true, name: true, setPrice: true, color: true,
        bikeModel: { select: { brand: true, model: true, year: true, yearEnd: true } },
      },
    });
    items = await Promise.all(
      sets.map(async (s) => ({
        id: s.id,
        sku: s.sku,
        name: s.name,
        price: LKR.format(parseFloat(s.setPrice.toString())),
        color: s.color,
        model: modelLabel(s.bikeModel.brand, s.bikeModel.model, s.bikeModel.year, s.bikeModel.yearEnd),
        barcodeUrl: await makeBarcodeDataUrl(s.sku, barcodeScale),
      })),
    );
  } else {
    const parts = await prisma.part.findMany({
      where: { id: { in: rawIds } },
      select: {
        id: true, sku: true, name: true, price: true, color: true,
        bikeModel: { select: { brand: true, model: true, year: true, yearEnd: true } },
      },
    });
    items = await Promise.all(
      parts.map(async (p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        price: p.price != null ? LKR.format(parseFloat(p.price.toString())) : '',
        color: p.color,
        model: modelLabel(p.bikeModel.brand, p.bikeModel.model, p.bikeModel.year, p.bikeModel.yearEnd),
        barcodeUrl: await makeBarcodeDataUrl(p.sku, barcodeScale),
      })),
    );
  }

  return (
    <>
      {/*
       * Base label styles — no hardcoded width/height (set per format in LabelViewer).
       * LabelViewer injects a <head><style> for the @page rule + print layout overrides
       * (dimensions, grid columns, page-break-after per row for thermal).
       */}
      <style>{`
        @media print {
          header, .no-print-toolbar { display: none !important; }
          body { background: white !important; }
        }

        /*
         * Vertical budget, A4 (the tighter format): 25mm − 1.8mm padding =
         * 23.2mm. barcode 12.00 + 3 gaps 2.10 + sku 3.00 + name 2.96 +
         * colour 2.91 = 22.97mm. The gap was reduced 1mm -> 0.7mm and the SKU
         * 10pt -> 8.5pt to make room for the colour line; the barcode's
         * width and max-height are deliberately UNCHANGED so it keeps scanning.
         */
        .label {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.7mm;
          box-sizing: border-box;
          overflow: hidden;
          background: white;
          font-family: system-ui, sans-serif;
        }

        /* pixelated keeps barcode bars razor-sharp when browser scales the PNG */
        .label-barcode {
          width: 90%;
          max-height: 12mm;
          object-fit: contain;
          flex-shrink: 0;
          display: block;
          image-rendering: -webkit-optimize-contrast;
          image-rendering: crisp-edges;
          image-rendering: pixelated;
        }

        .label-sku {
          /* 8.5pt, down from 10pt: still plainly legible, and this line is a
             human-readable convenience — the same value is encoded in the
             barcode directly above it. */
          font-size: 8.5pt;
          font-family: 'Courier New', Courier, monospace;
          color: #333;
          text-align: center;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 100%;
          letter-spacing: 0.02em;
          line-height: 1;
          flex-shrink: 0;
        }

        .label-sku-fallback {
          font-size: 10px;
          font-family: monospace;
          color: #555;
          text-align: center;
        }

        .label-name {
          font-size: 7pt;
          color: #222;
          text-align: center;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 100%;
          line-height: 1.2;
          flex-shrink: 0;
        }

        /*
         * Bike model on its own line, directly under the SKU.
         * A primary identifier, not secondary text: the same name recurs across
         * hundreds of models, so this is often the only thing distinguishing
         * two labels. Hence 7pt/500 in near-black rather than the faint 6.5pt
         * grey it used when it shared a line with the colour.
         * A full line to itself means realistic models no longer truncate.
         */
        .label-model {
          font-size: 7pt;
          font-weight: 500;
          color: #222;
          text-align: center;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 100%;
          line-height: 1.15;
          flex-shrink: 0;
        }

        /*
         * Bottom line: name + colour together, keeping the label at four lines.
         * Flex so the halves shrink independently — the NAME ellipsises and the
         * colour never does (flex-shrink: 0 below). Colour is the fastest
         * discriminator between otherwise-identical labels, so it is the half
         * that must always survive a squeeze.
         */
        .label-meta {
          display: flex;
          align-items: baseline;
          justify-content: center;
          gap: 0.6mm;
          max-width: 100%;
          min-width: 0;
          line-height: 1.1;
          flex-shrink: 0;
        }

        /* Flex-child overrides, scoped so .label-name still works as a plain
           block when there is no colour (the location-label case). */
        .label-meta .label-name {
          min-width: 0;
          flex-shrink: 1;
          max-width: none;
        }

        .label-meta-sep {
          font-size: 6.5pt;
          color: #999;
          flex-shrink: 0;
        }

        /*
         * The heaviest text on the label. Uppercased in CSS only — it aids
         * glance-reading off a rack and evens out inconsistent source casing
         * ("Blue/Red" vs "red and green") without altering the stored value.
         */
        .label-color {
          font-size: 7.5pt;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          color: #000;
          white-space: nowrap;
          flex-shrink: 0;
        }
      `}</style>

      <LabelViewer
        items={items}
        initialQty={qty}
        initialFormat={format}
        type={type ?? 'part'}
        ids={idsParam ?? ''}
        labelStock={labelStock}
      />
      {autoprint === '1' && <AutoPrint />}
    </>
  );
}
