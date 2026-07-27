import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';

const QuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
});

export type CompanyDailySummary = {
  companyId: number;
  companyCode: string;
  companyName: string;
  invoiceCount: number;
  totalPaise: number;
};

export type DailyReportResponse = {
  date: string;
  breakdown: CompanyDailySummary[];
  combined: { invoiceCount: number; totalPaise: number };
};

/**
 * GET /api/reports/daily?date=YYYY-MM-DD
 * Returns per-company and combined sales totals for the given date.
 * OWNER role only.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (user.role !== 'OWNER') return forbiddenResponse();

  const { searchParams } = new URL(request.url);
  const parsed = QuerySchema.safeParse({ date: searchParams.get('date') ?? '' });
  if (!parsed.success) {
    return NextResponse.json({ error: 'date param required (YYYY-MM-DD)' }, { status: 400 });
  }

  const { date } = parsed.data;

  // Build UTC date range matching Asia/Colombo midnight–midnight (+05:30)
  // Colombo is UTC+5:30, so midnight Colombo = 18:30 UTC previous day
  const colomboOffsetMs = 5.5 * 60 * 60 * 1000;
  const localMidnight = new Date(`${date}T00:00:00+05:30`);
  const startUtc = new Date(localMidnight.getTime());
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);

  // Aggregate per company using raw SQL for a single round-trip
  const rows = await prisma.$queryRaw<
    { companyId: number; companyCode: string; companyName: string; invoiceCount: bigint; totalPaise: bigint }[]
  >`
    SELECT
      c.id              AS "companyId",
      c.code            AS "companyCode",
      c.name            AS "companyName",
      COUNT(i.id)::bigint       AS "invoiceCount",
      COALESCE(SUM((i.total * 100)::bigint), 0)::bigint AS "totalPaise"
    FROM "Company" c
    LEFT JOIN "Invoice" i
      ON i."companyId" = c.id
      AND i."createdAt" >= ${startUtc}
      AND i."createdAt" < ${endUtc}
      AND i.status = 'PAID'
    WHERE c.active = true
    GROUP BY c.id, c.code, c.name
    ORDER BY c.id
  `;

  const breakdown: CompanyDailySummary[] = rows.map((r) => ({
    companyId: r.companyId,
    companyCode: r.companyCode,
    companyName: r.companyName,
    invoiceCount: Number(r.invoiceCount),
    totalPaise: Number(r.totalPaise),
  }));

  const combined = breakdown.reduce(
    (acc, r) => ({
      invoiceCount: acc.invoiceCount + r.invoiceCount,
      totalPaise: acc.totalPaise + r.totalPaise,
    }),
    { invoiceCount: 0, totalPaise: 0 },
  );

  return NextResponse.json<DailyReportResponse>({ date, breakdown, combined });
}
