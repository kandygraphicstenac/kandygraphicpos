'use client';

export type DeliveryAddressForm = {
  name: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  postalCode: string;
};

export const EMPTY_DELIVERY_ADDRESS: DeliveryAddressForm = {
  name: '', phone: '', line1: '', line2: '', city: '', postalCode: '',
};

type Props = {
  feeLKR: number;
  onFeeChange: (v: number) => void;
  address: DeliveryAddressForm;
  onAddressChange: (address: DeliveryAddressForm) => void;
};

const inputCls =
  'w-full h-7 bg-bg border border-border rounded-lg px-2 text-[12px] text-text ' +
  'focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-colors duration-100';

/**
 * Delivery fee + address capture. Only ever rendered when the cashier has
 * chosen the "Delivery order" order type — at that point these fields are
 * mandatory (the sale cannot complete without them), so unlike the rest of
 * the cart's optional add-ons, there's no collapse/remove affordance here.
 * The fee is free-entry for now (zone presets later).
 */
export function DeliverySection({ feeLKR, onFeeChange, address, onAddressChange }: Props) {
  function field<K extends keyof DeliveryAddressForm>(key: K, value: DeliveryAddressForm[K]) {
    onAddressChange({ ...address, [key]: value });
  }

  const feeMissing = feeLKR <= 0;
  const nameMissing = !address.name.trim();
  const line1Missing = !address.line1.trim();

  return (
    <div className="space-y-2 border border-border rounded-xl p-2.5 bg-bg/50">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-text-2 uppercase tracking-wide">Delivery details</span>
        <span className="text-[11px] text-warn-fg font-medium">Required</span>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-[12px] text-text-2 shrink-0">Fee (LKR)</label>
        <input
          type="number"
          min={0}
          step={1}
          value={feeLKR || ''}
          onChange={(e) => onFeeChange(Math.max(0, parseFloat(e.target.value) || 0))}
          className={[
            'w-24 h-7 bg-bg border rounded-lg px-2 text-[12px] text-center text-text tabular-nums',
            'focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-colors duration-100',
            feeMissing ? 'border-warn-fg/50' : 'border-border',
          ].join(' ')}
        />
        {feeMissing && <span className="text-[11px] text-warn-fg">required</span>}
      </div>

      <input
        type="text"
        value={address.name}
        onChange={(e) => field('name', e.target.value)}
        placeholder="Recipient name"
        className={inputCls + (nameMissing ? ' border-warn-fg/50' : '')}
      />
      <input
        type="tel"
        value={address.phone}
        onChange={(e) => field('phone', e.target.value)}
        placeholder="Recipient phone"
        className={inputCls}
      />
      <input
        type="text"
        value={address.line1}
        onChange={(e) => field('line1', e.target.value)}
        placeholder="Address line 1"
        className={inputCls + (line1Missing ? ' border-warn-fg/50' : '')}
      />
      <input
        type="text"
        value={address.line2}
        onChange={(e) => field('line2', e.target.value)}
        placeholder="Address line 2 (optional)"
        className={inputCls}
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          value={address.city}
          onChange={(e) => field('city', e.target.value)}
          placeholder="City"
          className={inputCls}
        />
        <input
          type="text"
          value={address.postalCode}
          onChange={(e) => field('postalCode', e.target.value)}
          placeholder="Postal code"
          className={inputCls}
        />
      </div>
    </div>
  );
}
