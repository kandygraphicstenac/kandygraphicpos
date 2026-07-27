import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { parseReportQuery } from '@/lib/reports/filters';
import { getSalesSummaryAggregate, type SalesSummaryAggregate } from '@/lib/reports/salesAggregation';

export type SummaryResponse = SalesSummaryAggregate;

/**
 * GET /api/reports/summary?dateFrom=&dateTo=&companyId=
 * Summary cards: invoice count, gross sales, returns, net, profit, delivery.
 * OWNER only.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (user.role !== 'OWNER') return forbiddenResponse();

  const filters = parseReportQuery(request);
  if ('error' in filters) return NextResponse.json({ error: filters.error }, { status: 400 });

  const summary = await getSalesSummaryAggregate(filters);
  return NextResponse.json<SummaryResponse>(summary);
}
