// Integration test — runs real SQL against the live database (lib/db.ts),
// unlike the rest of the suite which mocks Prisma. Raw-SQL join/aggregation
// bugs (e.g. a JOIN duplicating rows) can't be caught by mocking $queryRaw,
// since the mock never actually executes join semantics — only a real
// Postgres engine can prove the fix. Uses delta assertions (aggregate before
// vs. after inserting a known fixture) so it's safe to run against a shared
// dev database with pre-existing rows, and cleans up its fixture in
// `finally` regardless of outcome.
import 'dotenv/config';
import { randomUUID } from 'crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db';
import { getSalesSummaryAggregate, getDailyBreakdownAggregate } from '../salesAggregation';

let companyId: number;
let userId: number;

beforeAll(async () => {
  const company = await prisma.company.findFirst({ where: { active: true }, select: { id: true } });
  const user = await prisma.user.findFirst({ select: { id: true } });
  if (!company || !user) {
    throw new Error('Integration test requires at least one Company and one User to already exist in the DB');
  }
  companyId = company.id;
  userId = user.id;
});

describe('sales aggregation — multi-line invoice (real DB)', () => {
  it('counts a 3-item, Rs 3000 invoice once toward gross sales — not once per line item', async () => {
    const invoiceId = `TEST-AGG-${randomUUID()}`;
    const createdAt = new Date();
    const colomboDate = createdAt.toLocaleDateString('sv-SE', { timeZone: 'Asia/Colombo' });

    const before = await getSalesSummaryAggregate({});
    const beforeDaily = await getDailyBreakdownAggregate({});
    const beforeDayRow = beforeDaily.find((r) => r.date === colomboDate);
    const beforeDayGross = beforeDayRow ? parseFloat(beforeDayRow.gross) : 0;

    try {
      await prisma.invoice.create({
        data: {
          id: invoiceId,
          companyId,
          userId,
          subtotal: new Prisma.Decimal('3000.00'),
          total: new Prisma.Decimal('3000.00'),
          payment: 'CASH',
          status: 'PAID',
          createdAt,
        },
      });
      // 3 line items of Rs 1000 each — the bug summed `i.total` (3000) once
      // per joined item row, inflating this invoice's contribution to 9000.
      await prisma.invoiceItem.createMany({
        data: [
          { invoiceId, qty: 1, unitPrice: new Prisma.Decimal('1000.00'), lineTotal: new Prisma.Decimal('1000.00') },
          { invoiceId, qty: 1, unitPrice: new Prisma.Decimal('1000.00'), lineTotal: new Prisma.Decimal('1000.00') },
          { invoiceId, qty: 1, unitPrice: new Prisma.Decimal('1000.00'), lineTotal: new Prisma.Decimal('1000.00') },
        ],
      });

      const after = await getSalesSummaryAggregate({});
      const grossDelta = parseFloat(after.grossSales) - parseFloat(before.grossSales);
      const countDelta = after.invoiceCount - before.invoiceCount;

      expect(countDelta).toBe(1);
      expect(grossDelta).toBeCloseTo(3000, 5); // would be 9000 with the bug (3000 × 3 items)

      const afterDaily = await getDailyBreakdownAggregate({});
      const afterDayRow = afterDaily.find((r) => r.date === colomboDate);
      expect(afterDayRow).toBeDefined();
      const afterDayGross = parseFloat(afterDayRow!.gross);
      expect(afterDayGross - beforeDayGross).toBeCloseTo(3000, 5);
    } finally {
      await prisma.invoiceItem.deleteMany({ where: { invoiceId } });
      await prisma.invoice.delete({ where: { id: invoiceId } }).catch(() => { /* already gone */ });
    }
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
