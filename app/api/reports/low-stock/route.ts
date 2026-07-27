import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';

type RawRow = {
  id: number;
  sku: string;
  name: string;
  finishedStock: number;
  reorderLevel: number;
};

export type LowStockRow = {
  id: number;
  sku: string;
  name: string;
  finishedStock: number;
  reorderLevel: number;
};

export type LowStockResponse = { rows: LowStockRow[] };

/**
 * GET /api/reports/low-stock
 * Parts at or below their reorder level (current state — ignores date filter).
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
      p."reorderLevel"
    FROM "Part" p
    WHERE p.active = true
      AND p."reorderLevel" > 0
      AND p."finishedStock" <= p."reorderLevel"
    ORDER BY (p."finishedStock"::float / p."reorderLevel") ASC, p.name ASC
    LIMIT 50
  `;

  return NextResponse.json<LowStockResponse>({
    rows: rows.map((r) => ({
      id: r.id,
      sku: r.sku,
      name: r.name,
      finishedStock: r.finishedStock,
      reorderLevel: r.reorderLevel,
    })),
  });
}
