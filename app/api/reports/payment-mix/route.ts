import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { parseReportQuery, buildSqlFilters } from '@/lib/reports/filters';

type RawRow = {
  payment: string;
  invoiceCount: number;
  total: string;
};

export type PaymentMixRow = {
  payment: string;
  invoiceCount: number;
  total: string;
};

export type PaymentMixResponse = { rows: PaymentMixRow[] };

/**
 * GET /api/reports/payment-mix?dateFrom=&dateTo=&companyId=
 * Cash / Card / Bank totals for the period.
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
      i.payment::text                AS "payment",
      COUNT(i.id)::int               AS "invoiceCount",
      COALESCE(SUM(i.total), 0)      AS "total"
    FROM "Invoice" i
    WHERE i.status IN ('PAID', 'PARTIAL_REFUND')
    ${dateWhere}
    ${companyWhere}
    GROUP BY i.payment
    ORDER BY SUM(i.total) DESC NULLS LAST
  `;

  return NextResponse.json<PaymentMixResponse>({
    rows: rows.map((r) => ({
      payment: r.payment,
      invoiceCount: r.invoiceCount,
      total: parseFloat(r.total).toFixed(2),
    })),
  });
}
