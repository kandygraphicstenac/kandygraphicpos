import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../db';
import { buildSqlFilters, type ReportFilters } from './filters';

type SummaryRawRow = {
  invoiceCount: number;
  grossSales: string;
  deliveryCollected: string;
  returnsTotal: string;
  profit: string;
  profitIsApprox: boolean;
};

export type SalesSummaryAggregate = {
  invoiceCount: number;
  grossSales: string;
  deliveryCollected: string;
  returnsTotal: string;
  netSales: string;
  profit: string;
  profitIsApprox: boolean;
};

/**
 * Invoice-level sales summary for /api/reports/summary.
 *
 * Item-level metrics (returns, profit) are pre-aggregated to ONE row per
 * invoice in the `item_agg` CTE before joining. Joining "Invoice" directly
 * to "InvoiceItem" in the same SELECT duplicates each invoice row once per
 * line item, which would inflate SUM(i.total)/COUNT(i.id) for any
 * multi-line invoice — that was the bug. With the CTE, each invoice's
 * `total` and `deliveryFee` are summed exactly once regardless of how many
 * line items it has.
 */
export async function getSalesSummaryAggregate(
  filters: ReportFilters,
  db: PrismaClient = defaultPrisma,
): Promise<SalesSummaryAggregate> {
  const { dateWhere, companyWhere } = buildSqlFilters(filters);

  const rows = await db.$queryRaw<SummaryRawRow[]>`
    WITH item_agg AS (
      SELECT
        ii."invoiceId",
        SUM(ii."returnedQty"::numeric * ii."unitPrice")                                                AS "returnsTotal",
        SUM(ii."lineTotal" - (COALESCE(ii."unitCost", COALESCE(p.cost, 0::numeric)) * ii.qty::numeric)) AS "profit",
        BOOL_OR(ii."unitCost" IS NULL)                                                                  AS "hasApprox"
      FROM "InvoiceItem" ii
      LEFT JOIN "Part" p ON p.id = ii."partId"
      GROUP BY ii."invoiceId"
    )
    SELECT
      COUNT(i.id)::int                            AS "invoiceCount",
      COALESCE(SUM(i.total), 0)::numeric           AS "grossSales",
      COALESCE(SUM(i."deliveryFee"), 0)::numeric    AS "deliveryCollected",
      COALESCE(SUM(ia."returnsTotal"), 0)::numeric  AS "returnsTotal",
      COALESCE(SUM(ia."profit"), 0)::numeric        AS "profit",
      COALESCE(BOOL_OR(ia."hasApprox"), false)     AS "profitIsApprox"
    FROM "Invoice" i
    LEFT JOIN item_agg ia ON ia."invoiceId" = i.id
    WHERE i.status IN ('PAID', 'PARTIAL_REFUND')
    ${dateWhere}
    ${companyWhere}
  `;

  const r = rows[0];
  const gross = r?.grossSales ?? '0';
  const returns_ = r?.returnsTotal ?? '0';
  const net = (parseFloat(gross) - parseFloat(returns_)).toFixed(2);

  return {
    invoiceCount: r?.invoiceCount ?? 0,
    grossSales: parseFloat(gross).toFixed(2),
    deliveryCollected: parseFloat(r?.deliveryCollected ?? '0').toFixed(2),
    returnsTotal: parseFloat(returns_).toFixed(2),
    netSales: net,
    profit: parseFloat(r?.profit ?? '0').toFixed(2),
    profitIsApprox: r?.profitIsApprox ?? false,
  };
}

type DailyRawRow = {
  date: string;
  invoiceCount: number;
  gross: string;
  returns: string;
};

export type DailyBreakdownRow = {
  date: string; // YYYY-MM-DD (Colombo)
  invoiceCount: number;
  gross: string;
  returns: string;
  net: string;
};

/**
 * Day-by-day breakdown for /api/reports/daily-breakdown. Same fix as
 * getSalesSummaryAggregate above: returns are pre-aggregated to one row per
 * invoice in `invoice_returns` before joining, so `gross` (SUM(i.total))
 * counts each invoice exactly once per day regardless of line-item count.
 */
export async function getDailyBreakdownAggregate(
  filters: ReportFilters,
  db: PrismaClient = defaultPrisma,
): Promise<DailyBreakdownRow[]> {
  const { dateWhere, companyWhere } = buildSqlFilters(filters);

  // Invoice.createdAt is `timestamp without time zone` in Postgres, but
  // Prisma writes it as literal UTC clock digits (no offset applied). A bare
  // `createdAt AT TIME ZONE 'Asia/Colombo'` would misinterpret those UTC
  // digits AS IF they were already Colombo local time and shift them
  // *backward* by another 5:30 — landing invoices in the wrong day bucket
  // (most visibly for the 00:00–05:29 Colombo window). The fix is the
  // standard two-step idiom: reinterpret the naive value as UTC first
  // (`AT TIME ZONE 'UTC'`, naive → timestamptz, no shift), then convert that
  // real instant to Colombo civil time (`AT TIME ZONE 'Asia/Colombo'`,
  // timestamptz → naive, +5:30).
  const rows = await db.$queryRaw<DailyRawRow[]>`
    WITH invoice_returns AS (
      SELECT ii."invoiceId", SUM(ii."returnedQty"::numeric * ii."unitPrice") AS "returnsTotal"
      FROM "InvoiceItem" ii
      GROUP BY ii."invoiceId"
    )
    SELECT
      TO_CHAR((i."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Colombo', 'YYYY-MM-DD') AS "date",
      COUNT(i.id)::int                                                   AS "invoiceCount",
      COALESCE(SUM(i.total), 0)::numeric                                 AS "gross",
      COALESCE(SUM(ir."returnsTotal"), 0)::numeric                       AS "returns"
    FROM "Invoice" i
    LEFT JOIN invoice_returns ir ON ir."invoiceId" = i.id
    WHERE i.status IN ('PAID', 'PARTIAL_REFUND')
    ${dateWhere}
    ${companyWhere}
    GROUP BY TO_CHAR((i."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Colombo', 'YYYY-MM-DD')
    ORDER BY "date" ASC
  `;

  return rows.map((r) => {
    const gross = parseFloat(r.gross).toFixed(2);
    const returns_ = parseFloat(r.returns).toFixed(2);
    const net = (parseFloat(gross) - parseFloat(returns_)).toFixed(2);
    return { date: r.date, invoiceCount: r.invoiceCount, gross, returns: returns_, net };
  });
}
