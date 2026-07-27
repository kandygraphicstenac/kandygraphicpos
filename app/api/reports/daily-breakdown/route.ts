import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { parseReportQuery } from '@/lib/reports/filters';
import { getDailyBreakdownAggregate, type DailyBreakdownRow } from '@/lib/reports/salesAggregation';

export type { DailyBreakdownRow };
export type DailyBreakdownResponse = { rows: DailyBreakdownRow[] };

/**
 * GET /api/reports/daily-breakdown?dateFrom=&dateTo=&companyId=
 * Day-by-day table: count, gross, returns, net — scoped to filter range.
 * OWNER only.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (user.role !== 'OWNER') return forbiddenResponse();

  const filters = parseReportQuery(request);
  if ('error' in filters) return NextResponse.json({ error: filters.error }, { status: 400 });

  const rows = await getDailyBreakdownAggregate(filters);
  return NextResponse.json<DailyBreakdownResponse>({ rows });
}
