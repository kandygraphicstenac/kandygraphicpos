import { describe, it, expect, vi } from 'vitest';
import { getShippingLabelData } from '../shippingLabelService';

function buildMockDb(invoice: unknown) {
  const mockDb = {
    invoice: {
      findUnique: vi.fn().mockResolvedValue(invoice),
    },
  };
  return mockDb as unknown as import('@prisma/client').PrismaClient;
}

describe('getShippingLabelData', () => {
  it('builds shipTo from the invoice delivery snapshot and shipFrom from the company', async () => {
    const mockDb = buildMockDb({
      id: 'KG-2026-00001',
      deliveryAddress: {
        name: 'Nimal Perera',
        phone: '0771234567',
        line1: '12 Galle Rd',
        line2: null,
        city: 'Colombo',
        postalCode: '00300',
      },
      company: { name: 'Kandy Graphics', address: 'No. 1, Peradeniya Rd, Kandy', phone: '0812223456' },
    });

    const data = await getShippingLabelData('KG-2026-00001', mockDb);

    expect(data).not.toBeNull();
    expect(data!.invoiceId).toBe('KG-2026-00001');
    expect(data!.shipTo).toEqual({
      name: 'Nimal Perera',
      phone: '0771234567',
      line1: '12 Galle Rd',
      line2: null,
      city: 'Colombo',
      postalCode: '00300',
    });
    expect(data!.shipFrom).toEqual({
      name: 'Kandy Graphics',
      address: 'No. 1, Peradeniya Rd, Kandy',
      phone: '0812223456',
    });
  });

  it('returns null when the invoice has no deliveryAddress (not a delivery sale)', async () => {
    const mockDb = buildMockDb({
      id: 'KG-2026-00002',
      deliveryAddress: null,
      company: { name: 'Kandy Graphics', address: null, phone: null },
    });

    const data = await getShippingLabelData('KG-2026-00002', mockDb);
    expect(data).toBeNull();
  });

  it('returns null when the invoice does not exist', async () => {
    const mockDb = buildMockDb(null);
    const data = await getShippingLabelData('NOPE-0000', mockDb);
    expect(data).toBeNull();
  });
});
