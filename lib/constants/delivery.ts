export const DELIVERY_STATUS_FLOW = ['TO_PACK', 'PACKED', 'SHIPPED', 'DELIVERED'] as const;

export type DeliveryStatusValue = (typeof DELIVERY_STATUS_FLOW)[number];

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatusValue, string> = {
  TO_PACK: 'To pack',
  PACKED: 'Packed',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
};

/** Pill colors progress from "needs attention" (amber) to "done" (green). */
export const DELIVERY_STATUS_STYLES: Record<DeliveryStatusValue, string> = {
  TO_PACK: 'bg-warn-bg text-warn-fg',
  PACKED: 'bg-accent/15 text-accent',
  SHIPPED: 'bg-accent text-accent-fg',
  DELIVERED: 'bg-ok-bg text-ok-fg',
};

/** Next status in the flow, or null once already DELIVERED. */
export function nextDeliveryStatus(current: DeliveryStatusValue): DeliveryStatusValue | null {
  const idx = DELIVERY_STATUS_FLOW.indexOf(current);
  return idx === -1 || idx === DELIVERY_STATUS_FLOW.length - 1 ? null : DELIVERY_STATUS_FLOW[idx + 1];
}
