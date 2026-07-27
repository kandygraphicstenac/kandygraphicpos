import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { NextRequest } from 'next/server';

export const ReportQuerySchema = z.object({
  dateFrom: z.string().datetime({ offset: true }).optional(),
  dateTo: z.string().datetime({ offset: true }).optional(),
  companyId: z.coerce.number().int().positive().optional(),
});

export type ReportFilters = z.infer<typeof ReportQuerySchema>;

export function parseReportQuery(request: NextRequest): ReportFilters | { error: string } {
  const sp = new URL(request.url).searchParams;
  const parsed = ReportQuerySchema.safeParse({
    dateFrom: sp.get('dateFrom') ?? undefined,
    dateTo: sp.get('dateTo') ?? undefined,
    companyId: sp.get('companyId') ?? undefined,
  });
  return parsed.success ? parsed.data : { error: 'Invalid query params' };
}

export function buildSqlFilters(f: ReportFilters): {
  dateWhere: Prisma.Sql;
  companyWhere: Prisma.Sql;
} {
  const dateWhere =
    f.dateFrom && f.dateTo
      ? Prisma.sql`AND i."createdAt" >= ${new Date(f.dateFrom)} AND i."createdAt" < ${new Date(f.dateTo)}`
      : Prisma.empty;

  const companyWhere =
    f.companyId != null
      ? Prisma.sql`AND i."companyId" = ${f.companyId}`
      : Prisma.empty;

  return { dateWhere, companyWhere };
}
