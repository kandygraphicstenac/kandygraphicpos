'use client';

import { useEffect } from 'react';
import type { CartItem, SaleStatus, HeldSaleRecord } from './_types';
import { yearLabel } from '@/lib/utils/modelLabel';
import type { CompanyRecord } from '@/lib/types/company';
import type { CustomerRecord } from '@/lib/types/customer';
import { CustomerPicker } from './CustomerPicker';
import { DeliverySection, type DeliveryAddressForm } from './DeliverySection';
import { printShippingLabel } from '@/lib/utils/printShippingLabel';
import { isCreditAvailable } from '@/lib/utils/credit';

const LKR = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' });

function toPaise(price: string): number {
  return Math.round(parseFloat(price) * 100);
}
function fmtPaise(p: number): string {
  return LKR.format(p / 100);
}

const PAYMENT_BUTTONS = [
  { method: 'CASH', label: 'Cash', subtitle: 'F1' },
  { method: 'CARD', label: 'Card', subtitle: 'F2' },
  { method: 'BANK_TRANSFER', label: 'Bank', subtitle: 'F3' },
] as const satisfies Array<{ method: 'CASH' | 'CARD' | 'BANK_TRANSFER'; label: string; subtitle: string }>;

const CREDIT_BUTTON = { method: 'CREDIT', label: 'Credit', subtitle: 'On account' } as const;

type OrderType = 'COUNTER' | 'DELIVERY';
type PaymentMethodChoice = 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'CREDIT';

type Props = {
  items: CartItem[];
  discountPct: number;
  onDiscountChange: (pct: number) => void;
  /** Commits the discount for authorization — called on blur, Enter, or the Apply button. */
  onDiscountCommit: () => void;
  /** True while discountPct > 0 and not yet manager-approved for that exact value. Disables payment until resolved. */
  discountLocked: boolean;
  discountAuthReason: string | null;
  onUpdateQty: (key: string, delta: number) => void;
  onRemove: (key: string) => void;
  onPayment: (method: PaymentMethodChoice) => void;
  saleStatus: SaleStatus;
  onNewSale: () => void;
  heldSales: HeldSaleRecord[];
  onHold: () => void;
  onRestoreHeld: (id: number) => void;
  companies: CompanyRecord[];
  selectedCompanyId: number | null;
  onSelectCompany: (id: number) => void;
  /** Chosen at the start of the sale. DELIVERY makes customer + delivery details mandatory and disables payment until they're set. */
  orderType: OrderType;
  onSetOrderType: (type: OrderType) => void;
  selectedCustomer: CustomerRecord | null;
  onSelectCustomer: (customer: CustomerRecord) => void;
  onClearCustomer: () => void;
  deliveryFeeLKR: number;
  onDeliveryFeeChange: (v: number) => void;
  deliveryAddress: DeliveryAddressForm;
  onDeliveryAddressChange: (address: DeliveryAddressForm) => void;
  /** Called when the customer picker collapses so PosShell can return focus to the scan input. */
  onCustomerPickerClose?: () => void;
};

export function CartPanel({
  items,
  discountPct,
  onDiscountChange,
  onDiscountCommit,
  discountLocked,
  discountAuthReason,
  onUpdateQty,
  onRemove,
  onPayment,
  saleStatus,
  onNewSale,
  heldSales,
  onHold,
  onRestoreHeld,
  companies,
  selectedCompanyId,
  onSelectCompany,
  orderType,
  onSetOrderType,
  selectedCustomer,
  onSelectCustomer,
  onClearCustomer,
  deliveryFeeLKR,
  onDeliveryFeeChange,
  deliveryAddress,
  onDeliveryAddressChange,
  onCustomerPickerClose,
}: Props) {
  const subtotalPaise = items.reduce((s, i) => s + toPaise(i.unitPrice) * i.qty, 0);
  const discountPaise = Math.round((subtotalPaise * discountPct) / 100);
  const totalPaise = subtotalPaise - discountPaise;
  const isDelivery = orderType === 'DELIVERY';
  // Pass-through — added on top of totalPaise for what the customer pays,
  // but kept out of the product Subtotal/Discount/Total math above.
  const deliveryFeePaise = isDelivery ? Math.round(deliveryFeeLKR * 100) : 0;
  const amountDuePaise = totalPaise + deliveryFeePaise;

  // Credit only shows up as a payment option once it's actually usable for
  // this sale — the server re-validates with a row lock regardless.
  const creditAvailable = isCreditAvailable(selectedCustomer, amountDuePaise);
  const creditBlockedByLimit = !!selectedCustomer?.creditEnabled && !creditAvailable;

  // Delivery orders cannot complete without a customer + address + a real fee.
  // The server re-validates this independently — this is the UX-side gate.
  const deliveryRequirementsMet =
    !isDelivery ||
    (selectedCustomer != null &&
      deliveryFeeLKR > 0 &&
      deliveryAddress.name.trim().length > 0 &&
      deliveryAddress.line1.trim().length > 0);

  const isEmpty = items.length === 0;
  const isProcessing = saleStatus.type === 'loading';
  const paymentDisabled = isEmpty || isProcessing || discountLocked || !deliveryRequirementsMet;

  // F1/F2/F3 shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isEmpty || isProcessing) return;
      if (e.key === 'F1') { e.preventDefault(); onPayment('CASH'); }
      if (e.key === 'F2') { e.preventDefault(); onPayment('CARD'); }
      if (e.key === 'F3') { e.preventDefault(); onPayment('BANK_TRANSFER'); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isEmpty, isProcessing, onPayment]);

  return (
    <div className="relative flex flex-col h-full">

      {/* ── Sale confirmation panel ── */}
      {saleStatus.type === 'success' && (
        <div className="animate-slide-in-right absolute inset-0 bg-surface z-10 flex flex-col items-center justify-center gap-5 p-8">
          <div className="text-center w-full">
            <div className="w-12 h-12 rounded-full bg-ok-bg flex items-center justify-center mx-auto mb-4">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6 text-ok-fg">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="text-[11px] text-text-3 tracking-wide uppercase mb-1">
              {saleStatus.companyName}
            </p>
            <p className="text-[13px] text-text-2">Sale complete</p>
            <p className="font-mono text-[18px] font-medium text-text mt-1 tabular-nums">
              {saleStatus.invoiceId}
            </p>
            <p className="text-[15px] font-medium tabular-nums text-text-2 mt-1">
              {fmtPaise(saleStatus.totalPaise)}
            </p>
            {/* Delivery fee — pass-through, shown as its own line */}
            {!!saleStatus.deliveryFeePaise && (
              <p className="text-[12px] text-text-3 tabular-nums mt-0.5">
                + {fmtPaise(saleStatus.deliveryFeePaise)} delivery
              </p>
            )}
            {/* Tendered / change — only for cash sales with tendered recorded */}
            {saleStatus.tenderedPaise != null && saleStatus.tenderedPaise > 0 && (
              <div className="mt-3 pt-3 border-t border-border text-[13px] tabular-nums space-y-1">
                <div className="flex justify-between text-text-2">
                  <span>Cash</span>
                  <span>{fmtPaise(saleStatus.tenderedPaise)}</span>
                </div>
                <div className="flex justify-between font-medium text-accent">
                  <span>Change</span>
                  <span>{fmtPaise(saleStatus.tenderedPaise - saleStatus.totalPaise - (saleStatus.deliveryFeePaise ?? 0))}</span>
                </div>
              </div>
            )}
            {/* Payment reference — for card/bank sales */}
            {saleStatus.paymentRef && (
              <p className="mt-3 text-[11px] text-text-3 font-mono">
                Ref: {saleStatus.paymentRef}
              </p>
            )}
          </div>
          <div className="flex gap-3 w-full">
            <button
              type="button"
              onClick={() => {
                const iframe = document.createElement('iframe');
                iframe.setAttribute('aria-hidden', 'true');
                iframe.style.cssText =
                  'position:fixed;width:0;height:0;border:0;left:-9999px;top:-9999px;';

                let done = false;
                let fallback: ReturnType<typeof setTimeout> | undefined;

                function cleanup() {
                  if (done) return;
                  done = true;
                  clearTimeout(fallback);
                  try { document.body.removeChild(iframe); } catch { /* already removed */ }
                }

                // Attach afterprint listener once the receipt page has loaded
                iframe.onload = () => {
                  iframe.contentWindow?.addEventListener('afterprint', cleanup, { once: true });
                };

                document.body.appendChild(iframe);
                iframe.src = `/receipt/${saleStatus.invoiceId}?autoprint=1`;
                fallback = setTimeout(cleanup, 60_000);
              }}
              className="flex-1 h-11 rounded-xl border border-border text-text text-[13px] font-medium
                         hover:bg-border transition-colors duration-100"
            >
              Print
            </button>
            {!!saleStatus.deliveryFeePaise && (
              <button
                type="button"
                onClick={() => printShippingLabel(saleStatus.invoiceId)}
                className="flex-1 h-11 rounded-xl border border-border text-text text-[13px] font-medium
                           hover:bg-border transition-colors duration-100"
              >
                Ship. label
              </button>
            )}
            <button
              type="button"
              onClick={onNewSale}
              className="flex-1 h-11 rounded-xl bg-accent text-accent-fg text-[13px] font-medium
                         hover:opacity-90 transition-opacity duration-100"
            >
              New sale
            </button>
          </div>
          <a
            href={`/receipt/${saleStatus.invoiceId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] text-text-3 hover:text-text-2 transition-colors duration-100 underline underline-offset-2"
          >
            Reprint / preview
          </a>
        </div>
      )}

      {/* ── Header: company selector + order type + title + Hold ── */}
      <div className="px-4 pt-3 pb-2 border-b border-border shrink-0 space-y-2">

        {/* Company selector — full-width, prominent, chosen every sale */}
        {companies.length > 0 && (
          <div className="grid grid-cols-2 gap-1.5">
            {companies.map((company) => {
              const isActive = selectedCompanyId === company.id;
              const isUD = company.code === 'UD';
              return (
                <button
                  key={company.id}
                  type="button"
                  onClick={() => onSelectCompany(company.id)}
                  // Inactive UD: border-color opacity not available as a Tailwind
                  // utility on a custom token, so we set it via inline style.
                  style={
                    isUD && !isActive
                      ? { borderColor: 'color-mix(in srgb, var(--company-ud) 50%, transparent)' }
                      : undefined
                  }
                  className={[
                    'h-11 rounded-xl flex flex-col items-center justify-center transition-colors duration-100',
                    isActive
                      ? isUD
                        ? 'bg-company-ud text-company-ud-fg'
                        : 'bg-accent text-accent-fg'
                      : isUD
                        ? 'border text-company-ud hover:bg-company-ud-subtle'
                        : 'border border-accent/50 text-accent hover:bg-accent/10',
                  ].join(' ')}
                >
                  <span className="text-[15px] font-bold leading-none">{company.code}</span>
                  <span className="text-[10px] leading-none mt-0.5 opacity-75">{company.name}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Order type — chosen at the start of the sale; switches the whole flow */}
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => onSetOrderType('COUNTER')}
            className={[
              'h-8 rounded-lg text-[12px] font-medium transition-colors duration-100',
              !isDelivery
                ? 'bg-accent text-accent-fg'
                : 'border border-border text-text-2 hover:border-border-hover hover:text-text',
            ].join(' ')}
          >
            Counter sale
          </button>
          <button
            type="button"
            onClick={() => onSetOrderType('DELIVERY')}
            className={[
              'h-8 rounded-lg text-[12px] font-medium transition-colors duration-100',
              isDelivery
                ? 'bg-accent text-accent-fg'
                : 'border border-border text-text-2 hover:border-border-hover hover:text-text',
            ].join(' ')}
          >
            Delivery order
          </button>
        </div>

        {/* Title + Hold */}
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[13px] font-medium text-text">
            Current sale
            {items.length > 0 && (
              <span className="text-text-3 font-normal">
                {' '}· {items.length} item{items.length !== 1 ? 's' : ''}
              </span>
            )}
          </h2>
          <button
            type="button"
            onClick={onHold}
            disabled={isEmpty}
            title="Park this sale (hold)"
            className="h-8 px-3 rounded-lg border border-border text-[12px] font-medium text-text-2
                       disabled:opacity-30 disabled:cursor-not-allowed
                       enabled:hover:border-border-hover enabled:hover:text-text transition-colors duration-100"
          >
            Hold
          </button>
        </div>

        {/* Customer — optional for counter sales (collapsed by default so
            walk-in stays fast), mandatory for delivery orders. Delivery
            details only exist for delivery orders at all. */}
        <div className="flex items-start gap-2 flex-wrap">
          <CustomerPicker
            selectedCustomer={selectedCustomer}
            onSelect={onSelectCustomer}
            onClear={onClearCustomer}
            onClose={onCustomerPickerClose}
            required={isDelivery}
          />
        </div>
        {isDelivery && (
          <DeliverySection
            feeLKR={deliveryFeeLKR}
            onFeeChange={onDeliveryFeeChange}
            address={deliveryAddress}
            onAddressChange={onDeliveryAddressChange}
          />
        )}
      </div>

      {/* ── Held sale chips ── */}
      {heldSales.length > 0 && (
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border overflow-x-auto scrollbar-none shrink-0">
          {heldSales.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => onRestoreHeld(h.id)}
              title={`Restore: ${h.label}`}
              className="shrink-0 h-7 px-2.5 rounded-full border border-border text-[11px] text-text-2
                         hover:border-border-hover hover:text-text hover:bg-border
                         transition-colors duration-100 whitespace-nowrap max-w-35 truncate"
            >
              {h.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Item list ── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {isEmpty ? (
          <div className="flex items-center justify-center h-24 text-text-3 text-[13px] select-none">
            Cart is empty
          </div>
        ) : (
          items.map((item) => {
            const avail =
              item.product.type === 'part'
                ? item.product.finishedStock
                : item.product.availability;
            const linePaise = toPaise(item.unitPrice) * item.qty;

            return (
              <div key={item.key} className="px-4 py-3 border-b border-border last:border-b-0">
                {/* Name + unit price + remove */}
                <div className="flex items-start gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-text leading-snug truncate">{item.product.name}</p>
                    {/* Bike model + colour: without these, a red and a blue kit —
                        or the same kit for two bikes — are indistinguishable
                        lines right before payment. The panel is narrow, so the
                        MODEL truncates and the colour never does. Renders
                        nothing at all when both are absent. */}
                    {(item.product.bikeModel || item.product.color?.trim()) && (
                      <div className="flex items-baseline gap-1 text-[11px] mt-0.5 min-w-0">
                        {item.product.bikeModel && (
                          <span className="text-text-3 truncate min-w-0">
                            {item.product.bikeModel.brand} {item.product.bikeModel.model}{' '}
                            {yearLabel(item.product.bikeModel.year, item.product.bikeModel.yearEnd)}
                          </span>
                        )}
                        {item.product.bikeModel && item.product.color?.trim() && (
                          <span className="text-text-3 shrink-0">·</span>
                        )}
                        {item.product.color?.trim() && (
                          <span className="font-semibold uppercase tracking-wide text-text-2 shrink-0">
                            {item.product.color}
                          </span>
                        )}
                      </div>
                    )}
                    <p className="text-[11px] text-text-3 tabular-nums mt-0.5">
                      {LKR.format(parseFloat(item.unitPrice))} each
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(item.key)}
                    aria-label={`Remove ${item.product.name}`}
                    className="shrink-0 w-10 h-10 -mr-2 -mt-1 flex items-center justify-center
                               text-text-3 hover:text-danger-fg transition-colors duration-100"
                  >
                    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                      <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
                    </svg>
                  </button>
                </div>

                {/* Qty stepper + line total */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onUpdateQty(item.key, -1)}
                      disabled={item.qty <= 1}
                      aria-label="Decrease quantity"
                      className="w-10 h-10 flex items-center justify-center rounded-lg border border-border text-text text-[15px]
                                 disabled:opacity-30 enabled:hover:border-border-hover transition-colors duration-100"
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-[13px] font-medium text-text tabular-nums select-none">
                      {item.qty}
                    </span>
                    <button
                      type="button"
                      onClick={() => onUpdateQty(item.key, +1)}
                      disabled={item.qty >= avail}
                      aria-label="Increase quantity"
                      className="w-10 h-10 flex items-center justify-center rounded-lg border border-border text-text text-[15px]
                                 disabled:opacity-30 enabled:hover:border-border-hover transition-colors duration-100"
                    >
                      +
                    </button>
                  </div>
                  <span className="text-[13px] font-medium tabular-nums text-text">
                    {fmtPaise(linePaise)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Footer: discount · totals · payment ── */}
      <div className="shrink-0 border-t border-border">
        {/* Discount % */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border">
          <label htmlFor="pos-discount" className="text-[12px] text-text-2 shrink-0">
            Discount %
          </label>
          <input
            id="pos-discount"
            type="number"
            min={0}
            max={100}
            step={1}
            value={discountPct}
            onChange={(e) => {
              const v = Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0));
              onDiscountChange(v);
            }}
            onBlur={onDiscountCommit}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              onDiscountCommit();
            }}
            className="w-16 bg-bg border border-border rounded-lg px-2 py-1.5 text-[13px] text-center
                       text-text tabular-nums focus:outline-none focus:ring-2 focus:ring-accent/40
                       focus:border-accent transition-colors duration-100"
          />
          {discountLocked && (
            <button
              type="button"
              onClick={onDiscountCommit}
              className="h-7 px-3 rounded-lg bg-accent text-accent-fg text-[12px] font-medium
                         hover:opacity-90 transition-opacity duration-100"
            >
              Apply
            </button>
          )}
          {discountPct > 0 && discountAuthReason && (
            <span className="text-[11px] text-text-3 truncate" title={`Authorized — ${discountAuthReason}`}>
              ✓ {discountAuthReason}
            </span>
          )}
        </div>

        {/* Totals */}
        <div className="px-4 py-3 space-y-1 border-b border-border">
          <div className="flex justify-between text-[12px] text-text-2 tabular-nums">
            <span>Subtotal</span>
            <span>{fmtPaise(subtotalPaise)}</span>
          </div>
          {discountPct > 0 && (
            <div className="flex justify-between text-[12px] text-danger-fg tabular-nums">
              <span>Discount ({discountPct}%)</span>
              <span>−{fmtPaise(discountPaise)}</span>
            </div>
          )}
          <div className="flex justify-between items-baseline pt-1">
            <span className="text-[13px] text-text-2">Total</span>
            <span className="text-[18px] font-medium tabular-nums text-text">
              {fmtPaise(totalPaise)}
            </span>
          </div>
          {/* Delivery — pass-through, deliberately separate from product Total above */}
          {deliveryFeePaise > 0 && (
            <>
              <div className="flex justify-between text-[12px] text-text-2 tabular-nums">
                <span>Delivery fee</span>
                <span>{fmtPaise(deliveryFeePaise)}</span>
              </div>
              <div className="flex justify-between items-baseline pt-1 border-t border-border">
                <span className="text-[13px] text-text-2">Amount due</span>
                <span className="text-[18px] font-medium tabular-nums text-text">
                  {fmtPaise(amountDuePaise)}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Delivery requirements hint — only when blocking payment */}
        {isDelivery && !deliveryRequirementsMet && !isEmpty && (
          <p className="px-4 pt-2 text-[11px] text-warn-fg">
            Before completing: {[
              !selectedCustomer && 'select a customer',
              !(deliveryFeeLKR > 0) && 'set a delivery fee',
              !(deliveryAddress.name.trim() && deliveryAddress.line1.trim()) && 'fill in the delivery address',
            ].filter(Boolean).join(', ')}
          </p>
        )}

        {/* Credit unavailable hint — only shown for a credit-enabled customer who'd exceed their limit */}
        {creditBlockedByLimit && !isEmpty && (
          <p className="px-4 pt-2 text-[11px] text-warn-fg">
            Credit unavailable — this sale would exceed {selectedCustomer!.name}&rsquo;s credit limit
          </p>
        )}

        {/* Payment buttons — Credit only appears once it's actually usable for this sale */}
        <div className={`px-4 py-3 grid gap-2 ${creditAvailable ? 'grid-cols-2' : 'grid-cols-3'}`}>
          {[...PAYMENT_BUTTONS, ...(creditAvailable ? [CREDIT_BUTTON] : [])].map(({ method, label, subtitle }, i) => {
            const isActive = saleStatus.type === 'loading' && saleStatus.payment === method;
            const isCash = i === 0;
            const isCredit = method === 'CREDIT';
            return (
              <button
                key={method}
                type="button"
                onClick={() => onPayment(method)}
                disabled={paymentDisabled}
                title={
                  discountLocked
                    ? 'Apply and authorize the discount first'
                    : !deliveryRequirementsMet
                      ? 'Complete the delivery details first'
                      : undefined
                }
                className={[
                  'h-11 rounded-xl text-[12px] font-medium transition-all duration-100',
                  'flex flex-col items-center justify-center gap-0.5',
                  paymentDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
                  isCash
                    ? 'bg-accent text-accent-fg enabled:hover:opacity-90'
                    : isCredit
                      ? 'border border-warn-fg/40 text-warn-fg enabled:hover:bg-warn-bg'
                      : 'border border-border text-text enabled:hover:border-border-hover',
                  isActive ? 'opacity-60' : '',
                ].join(' ')}
              >
                <span>{isActive ? '…' : label}</span>
                <span className={`text-[10px] tabular-nums ${isCash ? 'text-accent-fg/60' : 'text-text-3'}`}>
                  {subtitle}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
