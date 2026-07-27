import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { parseReportQuery } from '@/lib/reports/filters';

type ByReasonRow = { reason: string; count: number; totalRefund: string };
type ByManagerRow = { managerId: number; managerName: string; count: number; totalRefund: string };

export type RefundsReportResponse = {
  byReason: ByReasonRow[];
  byManager: ByManagerRow[];
};

/**
 * GET /api/reports/refunds?dateFrom=&dateTo=&companyId=
 * Refunds processed, grouped by reason and by authorizing manager. Filtered
 * by when the REFUND happened (Return.createdAt), not the original sale date.
 * Feeds loss tracking. OWNER only.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (user.role !== 'OWNER') return forbiddenResponse();

  const filters = parseReportQuery(request);
  if ('error' in filters) return NextResponse.json({ error: filters.error }, { status: 400 });

  const dateWhere =
    filters.dateFrom && filters.dateTo
      ? Prisma.sql`AND r."createdAt" >= ${new Date(filters.dateFrom)} AND r."createdAt" < ${new Date(filters.dateTo)}`
      : Prisma.empty;
  const companyWhere =
    filters.companyId != null
      ? Prisma.sql`AND i."companyId" = ${filters.companyId}`
      : Prisma.empty;

  const byReasonRaw = await prisma.$queryRaw<{ reason: string; count: number; totalRefund: string }[]>`
    SELECT
      r."refundReason"                       AS "reason",
      COUNT(r.id)::int                       AS "count",
      COALESCE(SUM(r."refundAmount"), 0)::numeric AS "totalRefund"
    FROM "Return" r
    JOIN "Invoice" i ON i.id = r."invoiceId"
    WHERE 1=1
    ${dateWhere}
    ${companyWhere}
    GROUP BY r."refundReason"
    ORDER BY "totalRefund" DESC
  `;

  const byManagerRaw = await prisma.$queryRaw<{ managerId: number; managerName: string; count: number; totalRefund: string }[]>`
    SELECT
      u.id                                    AS "managerId",
      u.name                                  AS "managerName",
      COUNT(r.id)::int                        AS "count",
      COALESCE(SUM(r."refundAmount"), 0)::numeric AS "totalRefund"
    FROM "Return" r
    JOIN "Invoice" i ON i.id = r."invoiceId"
    JOIN "User" u ON u.id = r."refundAuthorizedById"
    WHERE 1=1
    ${dateWhere}
    ${companyWhere}
    GROUP BY u.id, u.name
    ORDER BY "totalRefund" DESC
  `;

  return NextResponse.json<RefundsReportResponse>({
    byReason: byReasonRaw.map((r) => ({ reason: r.reason, count: r.count, totalRefund: parseFloat(r.totalRefund).toFixed(2) })),
    byManager: byManagerRaw.map((r) => ({ managerId: r.managerId, managerName: r.managerName, count: r.count, totalRefund: parseFloat(r.totalRefund).toFixed(2) })),
  });
}
