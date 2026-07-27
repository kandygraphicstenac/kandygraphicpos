import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { parseReportQuery, buildSqlFilters } from '@/lib/reports/filters';

type ByReasonRow = { reason: string; count: number; totalDiscount: string };
type ByManagerRow = { managerId: number; managerName: string; count: number; totalDiscount: string };

export type DiscountsReportResponse = {
  byReason: ByReasonRow[];
  byManager: ByManagerRow[];
};

/**
 * GET /api/reports/discounts?dateFrom=&dateTo=&companyId=
 * Discounts given (manager-authorized only), grouped by reason and by authorizing manager.
 * Feeds loss tracking. OWNER only.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (user.role !== 'OWNER') return forbiddenResponse();

  const filters = parseReportQuery(request);
  if ('error' in filters) return NextResponse.json({ error: filters.error }, { status: 400 });

  const { dateWhere, companyWhere } = buildSqlFilters(filters);

  const byReasonRaw = await prisma.$queryRaw<{ reason: string; count: number; totalDiscount: string }[]>`
    SELECT
      i."discountReason"                                                          AS "reason",
      COUNT(i.id)::int                                                            AS "count",
      COALESCE(SUM(i.subtotal * i."discountPct" / 100 + i."discountAmt"), 0)::numeric AS "totalDiscount"
    FROM "Invoice" i
    WHERE i."discountAuthorizedById" IS NOT NULL
    ${dateWhere}
    ${companyWhere}
    GROUP BY i."discountReason"
    ORDER BY "totalDiscount" DESC
  `;

  const byManagerRaw = await prisma.$queryRaw<{ managerId: number; managerName: string; count: number; totalDiscount: string }[]>`
    SELECT
      u.id                                                                         AS "managerId",
      u.name                                                                       AS "managerName",
      COUNT(i.id)::int                                                            AS "count",
      COALESCE(SUM(i.subtotal * i."discountPct" / 100 + i."discountAmt"), 0)::numeric AS "totalDiscount"
    FROM "Invoice" i
    JOIN "User" u ON u.id = i."discountAuthorizedById"
    WHERE i."discountAuthorizedById" IS NOT NULL
    ${dateWhere}
    ${companyWhere}
    GROUP BY u.id, u.name
    ORDER BY "totalDiscount" DESC
  `;

  return NextResponse.json<DiscountsReportResponse>({
    byReason: byReasonRaw.map((r) => ({ reason: r.reason, count: r.count, totalDiscount: parseFloat(r.totalDiscount).toFixed(2) })),
    byManager: byManagerRaw.map((r) => ({ managerId: r.managerId, managerName: r.managerName, count: r.count, totalDiscount: parseFloat(r.totalDiscount).toFixed(2) })),
  });
}
