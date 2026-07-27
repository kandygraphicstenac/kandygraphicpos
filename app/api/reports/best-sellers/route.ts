import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { parseReportQuery, buildSqlFilters } from '@/lib/reports/filters';

type RawRow = {
  name: string;
  sku: string;
  itemType: string;
  qtySold: number;
  revenue: string;
};

export type BestSellerRow = {
  name: string;
  sku: string;
  type: 'part' | 'set';
  qtySold: number;
  revenue: string;
};

export type BestSellersResponse = { rows: BestSellerRow[] };

/**
 * GET /api/reports/best-sellers?dateFrom=&dateTo=&companyId=
 * Top 10 parts + sets by net qty sold in the period.
 * OWNER only.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (user.role !== 'OWNER') return forbiddenResponse();

  const filters = parseReportQuery(request);
  if ('error' in filters) return NextResponse.json({ error: filters.error }, { status: 400 });

  const { dateWhere, companyWhere } = buildSqlFilters(filters);

  const rows = await prisma.$queryRaw<RawRow[]>`
    SELECT
      COALESCE(p.name, s.name)                                AS "name",
      COALESCE(p.sku, s.sku)                                  AS "sku",
      CASE WHEN ii."partId" IS NOT NULL THEN 'part' ELSE 'set' END AS "itemType",
      SUM(GREATEST(0, ii.qty - ii."returnedQty"))::int        AS "qtySold",
      COALESCE(SUM(ii."lineTotal"), 0)                        AS "revenue"
    FROM "Invoice" i
    JOIN "InvoiceItem" ii ON ii."invoiceId" = i.id
    LEFT JOIN "Part" p ON p.id = ii."partId"
    LEFT JOIN "StickerSet" s ON s.id = ii."setId"
    WHERE i.status IN ('PAID', 'PARTIAL_REFUND')
    ${dateWhere}
    ${companyWhere}
    GROUP BY ii."partId", ii."setId", p.name, p.sku, s.name, s.sku
    ORDER BY SUM(GREATEST(0, ii.qty - ii."returnedQty")) DESC
    LIMIT 10
  `;

  return NextResponse.json<BestSellersResponse>({
    rows: rows.map((r) => ({
      name: r.name,
      sku: r.sku,
      type: r.itemType as 'part' | 'set',
      qtySold: r.qtySold,
      revenue: parseFloat(r.revenue).toFixed(2),
    })),
  });
}
