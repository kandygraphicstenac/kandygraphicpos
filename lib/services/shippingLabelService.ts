import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../db';
import type { DeliveryAddressSnapshot } from '../types/customer';

export type ShipFrom = {
  name: string;
  address: string | null;
  phone: string | null;
  logoUrl: string | null;
};

export type ShippingLabelData = {
  invoiceId: string;
  shipTo: DeliveryAddressSnapshot;
  shipFrom: ShipFrom;
};

/**
 * Builds ship-to/ship-from data for a parcel label.
 * ship-TO comes from the invoice's frozen deliveryAddress snapshot (never
 * the live Customer record, which may have changed since the sale).
 * ship-FROM comes from the selling company's own record.
 * Returns null when the invoice doesn't exist or wasn't a delivery sale
 * (no deliveryAddress captured).
 */
export async function getShippingLabelData(
  invoiceId: string,
  db: PrismaClient = defaultPrisma,
): Promise<ShippingLabelData | null> {
  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      deliveryAddress: true,
      company: { select: { name: true, address: true, phone: true, logoUrl: true } },
    },
  });

  if (!invoice || !invoice.deliveryAddress) return null;

  return {
    invoiceId: invoice.id,
    shipTo: invoice.deliveryAddress as unknown as DeliveryAddressSnapshot,
    shipFrom: {
      name: invoice.company.name,
      address: invoice.company.address,
      phone: invoice.company.phone,
      logoUrl: invoice.company.logoUrl,
    },
  };
}
