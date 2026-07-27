import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { parseReportQuery, buildSqlFilters } from '@/lib/reports/filters';

type RawRow = {
  companyId: number;
  companyCode: string;
  companyName: string;
  invoiceCount: number;
  salesAmount: string | null;
};

export type CompanyBreakdownRow = {
  companyId: number;
  companyCode: string;
  companyName: string;
  invoiceCount: number;
  salesAmount: string;
};

export type ByCompanyResponse = {
  rows: CompanyBreakdownRow[];
  combined: { invoiceCount: number; salesAmount: string };
};

/**
 * GET /api/reports/by-company?dateFrom=&dateTo=&companyId=
 * Per-company sales breakdown. All active companies always shown.
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
      c.id            AS "companyId",
      c.code          AS "companyCode",
      c.name          AS "companyName",
      COALESCE(t."invoiceCount", 0)::int  AS "invoiceCount",
      COALESCE(t."salesAmount", 0)        AS "salesAmount"
    FROM "Company" c
    LEFT JOIN (
      SELECT
        i."companyId",
        COUNT(i.id)::int   AS "invoiceCount",
        SUM(i.total)       AS "salesAmount"
      FROM "Invoice" i
      WHERE i.status IN ('PAID', 'PARTIAL_REFUND')
      ${dateWhere}
      ${companyWhere}
      GROUP BY i."companyId"
    ) t ON t."companyId" = c.id
    WHERE c.active = true
    ORDER BY c.id
  `;

  const mapped: CompanyBreakdownRow[] = rows.map((r) => ({
    companyId: r.companyId,
    companyCode: r.companyCode,
    companyName: r.companyName,
    invoiceCount: r.invoiceCount,
    salesAmount: parseFloat(r.salesAmount ?? '0').toFixed(2),
  }));

  const combined = mapped.reduce(
    (acc, r) => ({
      invoiceCount: acc.invoiceCount + r.invoiceCount,
      salesAmount: (parseFloat(acc.salesAmount) + parseFloat(r.salesAmount)).toFixed(2),
    }),
    { invoiceCount: 0, salesAmount: '0.00' },
  );

  return NextResponse.json<ByCompanyResponse>({ rows: mapped, combined });
}
