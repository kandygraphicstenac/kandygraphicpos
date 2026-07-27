import { notFound, redirect } from 'next/navigation';
import bwipjs from 'bwip-js/node';
import { getCurrentUser } from '@/lib/auth';
import { getShippingLabelData } from '@/lib/services/shippingLabelService';
import { AutoPrint } from './AutoPrint';
import { ShippingLabelToolbar } from './ShippingLabelToolbar';
import type { ShippingLabelFormat } from '@/lib/utils/printShippingLabel';

async function makeBarcodeDataUrl(text: string): Promise<string> {
  try {
    const png = await bwipjs.toBuffer({
      bcid: 'code128',
      text,
      scale: 2,
      height: 10,
      includetext: true,
      textxalign: 'center',
      textsize: 8,
    });
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch {
    return '';
  }
}

export default async function ShippingLabelPage({
  params,
  searchParams,
}: {
  params: Promise<{ invoiceId: string }>;
  searchParams: Promise<{ format?: string; autoprint?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || user.role === 'CUTTER') redirect('/');

  const { invoiceId } = await params;
  const { format: fmtParam, autoprint } = await searchParams;
  const format: ShippingLabelFormat = fmtParam === 'A6' ? 'A6' : '100x150mm';

  const data = await getShippingLabelData(invoiceId);
  if (!data) notFound();

  const { shipTo, shipFrom } = data;
  const barcodeDataUrl = await makeBarcodeDataUrl(data.invoiceId);

  return (
    <>
      <style>{`
        @media print {
          header, .no-print-toolbar { display: none !important; }
          body { background: white !important; }
        }
        .shipping-label {
          width: 90mm;
          margin: 8mm auto;
          padding: 5mm;
          border: 0.3mm solid #ccc;
          font-family: system-ui, sans-serif;
          color: #111;
          background: #fff;
        }
        @media print {
          .shipping-label { margin: 0; border: none; width: 100%; }
        }
        .ship-from {
          font-size: 8.5pt;
          color: #555;
          border-bottom: 1px dashed #999;
          padding-bottom: 3mm;
          margin-bottom: 4mm;
        }
        .ship-from-logo {
          max-height: 12mm;
          max-width: 40mm;
          width: auto;
          display: block;
          margin-bottom: 1.5mm;
          object-fit: contain;
        }
        .ship-from-label {
          font-size: 7pt;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #888;
          margin-bottom: 1mm;
        }
        .ship-to-label {
          font-size: 8pt;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #888;
          margin-bottom: 1.5mm;
        }
        .ship-to-name {
          font-size: 15pt;
          font-weight: 700;
          margin-bottom: 1mm;
        }
        .ship-to-line {
          font-size: 12pt;
          line-height: 1.4;
        }
        .ship-to-phone {
          font-size: 11pt;
          margin-top: 2mm;
          font-family: 'Courier New', Courier, monospace;
        }
        .label-barcode-wrap {
          margin-top: 5mm;
          padding-top: 3mm;
          border-top: 1px dashed #999;
          text-align: center;
        }
        .label-barcode-wrap img {
          max-width: 100%;
          height: auto;
        }
      `}</style>

      {autoprint === '1' && <AutoPrint />}
      <ShippingLabelToolbar invoiceId={data.invoiceId} initialFormat={format} />

      <div className="shipping-label">
        <div className="ship-from">
          {shipFrom.logoUrl && (
            <img src={shipFrom.logoUrl} alt={shipFrom.name} className="ship-from-logo" />
          )}
          <div className="ship-from-label">From</div>
          <div>{shipFrom.name}</div>
          {shipFrom.address && <div style={{ whiteSpace: 'pre-wrap' }}>{shipFrom.address}</div>}
          {shipFrom.phone && <div>{shipFrom.phone}</div>}
        </div>

        <div className="ship-to">
          <div className="ship-to-label">Deliver to</div>
          <div className="ship-to-name">{shipTo.name}</div>
          <div className="ship-to-line">{shipTo.line1}</div>
          {shipTo.line2 && <div className="ship-to-line">{shipTo.line2}</div>}
          {(shipTo.city || shipTo.postalCode) && (
            <div className="ship-to-line">{[shipTo.city, shipTo.postalCode].filter(Boolean).join(' ')}</div>
          )}
          {shipTo.phone && <div className="ship-to-phone">{shipTo.phone}</div>}
        </div>

        {barcodeDataUrl && (
          <div className="label-barcode-wrap">
            <img src={barcodeDataUrl} alt={`Barcode ${data.invoiceId}`} />
          </div>
        )}
      </div>
    </>
  );
}
