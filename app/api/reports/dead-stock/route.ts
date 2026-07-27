import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';

type RawRow = {
  id: number;
  sku: string;
  name: string;
  finishedStock: number;
  lastSaleAt: Date | null;
};

export type DeadStockRow = {
  id: number;
  sku: string;
  name: string;
  finishedStock: number;
  lastSaleAt: string | null;
};

export type DeadStockResponse = { rows: DeadStockRow[] };

/**
 * GET /api/reports/dead-stock
 * Active parts with stock on hand but zero SALE txns in the last 60 days
 * (current state — ignores date/company filters; stock is company-agnostic).
 * OWNER only.
 */
export async function GET(_request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (user.role !== 'OWNER') return forbiddenResponse();

  const rows = await prisma.$queryRaw<RawRow[]>`
    SELECT
      p.id,
      p.sku,
      p.name,
      p."finishedStock",
      (
        SELECT MAX(st."createdAt")
        FROM "StockTxn" st
        WHERE st."partId" = p.id AND st.type = 'SALE'
      ) AS "lastSaleAt"
    FROM "Part" p
    WHERE p.active = true
      AND p."finishedStock" > 0
      AND NOT EXISTS (
        SELECT 1 FROM "StockTxn" st
        WHERE st."partId" = p.id
          AND st.type = 'SALE'
          AND st."createdAt" >= NOW() - INTERVAL '60 days'
      )
    ORDER BY p."finishedStock" DESC, p.name ASC
    LIMIT 50
  `;

  return NextResponse.json<DeadStockResponse>({
    rows: rows.map((r) => ({
      id: r.id,
      sku: r.sku,
      name: r.name,
      finishedStock: r.finishedStock,
      lastSaleAt: r.lastSaleAt ? r.lastSaleAt.toISOString() : null,
    })),
  });
}
