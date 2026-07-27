import { notFound, redirect } from 'next/navigation';
import bwipjs from 'bwip-js/node';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { AutoPrint } from './AutoPrint';
import { ReceiptToolbar } from './ReceiptToolbar';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const LKR = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' });

function lkr(v: { toString(): string } | null | undefined): string {
  if (v == null) return '—';
  return LKR.format(parseFloat(v.toString()));
}

function formatColomboDT(d: Date): string {
  return d.toLocaleString('en-LK', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Colombo',
  });
}

const BARCODE_ID = 'receipt-barcode';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ invoiceId: string }>;
  searchParams: Promise<{ autoprint?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || user.role === 'CUTTER') redirect('/');

  const { invoiceId } = await params;
  const { autoprint } = await searchParams;

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      company: true,
      user: { select: { name: true } },
      customer: { select: { name: true } },
      items: {
        include: {
          part: { select: { name: true, sku: true } },
          set: { select: { name: true, sku: true } },
        },
        orderBy: { id: 'asc' },
      },
    },
  });

  if (!invoice) notFound();

  // Generate Code 128 barcode as a base64 PNG on the server so it's
  // immediately available — no separate network request, no CORS risk.
  let barcodeDataUrl = '';
  try {
    const png = await bwipjs.toBuffer({
      bcid: 'code128',
      text: invoice.id,
      scale: 2,
      height: 12,
      includetext: true,
      textxalign: 'center',
      textsize: 9,
    });
    barcodeDataUrl = `data:image/png;base64,${png.toString('base64')}`;
  } catch {
    // barcode is best-effort; receipt still renders without it
  }

  const subtotal   = parseFloat(invoice.subtotal.toString());
  const discountPct = parseFloat(invoice.discountPct.toString());
  const discountAmt = parseFloat(invoice.discountAmt.toString());
  const total      = parseFloat(invoice.total.toString());
  const tendered   = invoice.tendered ? parseFloat(invoice.tendered.toString()) : null;
  const change     = tendered != null ? tendered - total : null;
  const hasDiscount = discountPct > 0 || discountAmt > 0;
  const isCash     = invoice.payment === 'CASH';
  const paymentReference = invoice.paymentReference ?? null;
  const cardLast4  = invoice.cardLast4 ?? null;
  const { company } = invoice;

  const PAYMENT_LABELS: Record<string, string> = {
    CASH: 'Cash',
    CARD: 'Card',
    BANK_TRANSFER: 'Bank transfer',
  };

  return (
    <>
      {/* AutoPrint is a client component — only mounted when ?autoprint=1 */}
      {autoprint === '1' && <AutoPrint barcodeId={BARCODE_ID} />}

      {/* Screen-only toolbar (hidden by @media print rule in layout) */}
      <ReceiptToolbar invoiceId={invoice.id} />

      {/* Desaturate logo on thermal print so it renders as greyscale dots */}
      <style>{`
        @media print {
          .receipt-logo { filter: grayscale(1); }
        }
      `}</style>

      {/* ── Receipt body ── */}
      <div style={{
        fontFamily: "'Courier New', Courier, monospace",
        fontSize: '12px',
        lineHeight: '1.5',
        color: '#000',
        background: '#fff',
        width: '72mm',
        padding: '4mm 0',
        margin: '0 auto',
      }}>

        {/* Company header */}
        <div style={{ textAlign: 'center', marginBottom: '3mm' }}>
          {company.logoUrl && (
            <img
              src={company.logoUrl}
              alt={company.name}
              className="receipt-logo"
              style={{ maxWidth: '50mm', height: 'auto', display: 'block', margin: '0 auto 2mm' }}
            />
          )}
          <div style={{ fontWeight: 'bold', fontSize: '14px', letterSpacing: '0.5px' }}>
            {company.name.toUpperCase()}
          </div>
          {company.address && (
            <div style={{ fontSize: '11px', marginTop: '1mm', whiteSpace: 'pre-wrap' }}>
              {company.address}
            </div>
          )}
          {company.phone && (
            <div style={{ fontSize: '11px' }}>{company.phone}</div>
          )}
          {company.regNo && (
            <div style={{ fontSize: '10px', color: '#555' }}>Reg: {company.regNo}</div>
          )}
        </div>

        <Divider />

        {/* Invoice meta */}
        <Row left={invoice.id} right={formatColomboDT(invoice.createdAt)} />
        <Row left="Cashier" right={invoice.user.name} />
        {invoice.customer && (
          <Row left="Customer" right={invoice.customer.name} />
        )}

        <Divider />

        {/* Line items */}
        {invoice.items.map((item) => {
          const itemName = item.part?.name ?? item.set?.name ?? '—';
          const unitLKR  = parseFloat(item.unitPrice.toString());
          const lineLKR  = parseFloat(item.lineTotal.toString());
          return (
            <div key={item.id} style={{ marginBottom: '2mm' }}>
              <div style={{
                fontWeight: 'bold',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {itemName}
              </div>
              <Row
                left={`  ${item.qty} × ${LKR.format(unitLKR)}`}
                right={LKR.format(lineLKR)}
              />
            </div>
          );
        })}

        <Divider />

        {/* Totals */}
        <Row left="Subtotal" right={lkr(invoice.subtotal)} />
        {discountPct > 0 && (
          <Row
            left={`Discount (${discountPct}%)`}
            right={`−${LKR.format(subtotal * discountPct / 100)}`}
          />
        )}
        {discountAmt > 0 && (
          <Row left="Discount" right={`−${LKR.format(discountAmt)}`} />
        )}
        {hasDiscount && <Divider style="dashed" />}
        <Row left="TOTAL" right={LKR.format(total)} bold />

        {/* Cash tendered / change — only when tendered was recorded */}
        {isCash && tendered != null && (
          <>
            <Divider style="dashed" />
            <Row left="Cash" right={LKR.format(tendered)} />
            <Row left="Change" right={LKR.format(change!)} bold />
          </>
        )}

        {/* Payment method + reference */}
        <Divider style="dashed" />
        <Row
          left="Payment"
          right={
            cardLast4
              ? `${PAYMENT_LABELS[invoice.payment] ?? invoice.payment} ••••${cardLast4}`
              : (PAYMENT_LABELS[invoice.payment] ?? invoice.payment)
          }
        />
        {paymentReference && (
          <Row left="Ref" right={paymentReference} />
        )}

        <Divider />

        {/* Barcode */}
        {barcodeDataUrl && (
          <div style={{ textAlign: 'center', margin: '3mm 0' }}>
            <img
              id={BARCODE_ID}
              src={barcodeDataUrl}
              alt={`Barcode ${invoice.id}`}
              style={{ maxWidth: '100%', height: 'auto', display: 'block', margin: '0 auto' }}
            />
          </div>
        )}

        <Divider />

        {/* Footer */}
        {company.footerMessage && (
          <div style={{ textAlign: 'center', fontSize: '11px', marginTop: '2mm' }}>
            {company.footerMessage}
          </div>
        )}
        {company.warrantyLine && (
          <div style={{ textAlign: 'center', fontSize: '10px', color: '#555', marginTop: '1mm' }}>
            {company.warrantyLine}
          </div>
        )}

        {/* Feed past cutter */}
        <div style={{ height: '8mm' }} />
      </div>
    </>
  );
}

// ─── Receipt primitives ───────────────────────────────────────────────────────

function Row({ left, right, bold }: { left: string; right: string; bold?: boolean }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      fontWeight: bold ? 'bold' : 'normal',
      fontSize: bold ? '13px' : '12px',
    }}>
      <span>{left}</span>
      <span style={{ marginLeft: '4px', textAlign: 'right' }}>{right}</span>
    </div>
  );
}

function Divider({ style: s = 'solid' }: { style?: 'solid' | 'dashed' }) {
  return (
    <div style={{
      borderBottom: s === 'dashed' ? '1px dashed #888' : '1px solid #000',
      margin: '2mm 0',
    }} />
  );
}
