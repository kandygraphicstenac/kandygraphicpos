import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';

type AgingBucket = 'current' | '30+' | '60+';

type RawRow = {
  id: number;
  name: string;
  phone: string | null;
  balance: string;
  creditLimit: string | null;
  oldestUnpaidAt: Date | null;
};

export type ReceivablesRow = {
  customerId: number;
  customerName: string;
  phone: string | null;
  balance: string;
  creditLimit: string | null;
  agingBucket: AgingBucket;
  oldestUnpaidAt: string | null;
};

export type ReceivablesResponse = {
  totalReceivable: string;
  rows: ReceivablesRow[];
};

function agingBucket(oldestUnpaidAt: Date | null): AgingBucket {
  if (!oldestUnpaidAt) return 'current';
  const days = (Date.now() - oldestUnpaidAt.getTime()) / 86_400_000;
  if (days >= 60) return '60+';
  if (days >= 30) return '30+';
  return 'current';
}

/**
 * GET /api/reports/receivables
 * "Who owes what" — total receivable, per-customer balance sorted by amount
 * owed, and a simple "balance-forward" aging: for each customer with a
 * positive balance, the oldest CREDIT_SALE since their running balance last
 * touched zero (or since their first transaction, if it never has) anchors
 * the aging bucket for their entire current balance. Company-agnostic and
 * not date-filtered — this is a snapshot of right-now state, not a period
 * report (see CLAUDE.md: stock/customers/credit have no company dimension).
 * OWNER only.
 */
export async function GET(_request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (user.role !== 'OWNER') return forbiddenResponse();

  const rows = await prisma.$queryRaw<RawRow[]>`
    WITH running AS (
      SELECT
        "customerId",
        "createdAt",
        type,
        SUM(amount) OVER (PARTITION BY "customerId" ORDER BY "createdAt", id) AS running_balance
      FROM "CustomerLedger"
    ),
    last_zero AS (
      SELECT "customerId", MAX("createdAt") AS "lastZeroAt"
      FROM running
      WHERE running_balance <= 0
      GROUP BY "customerId"
    ),
    oldest_unpaid AS (
      SELECT r."customerId", MIN(r."createdAt") AS "oldestUnpaidAt"
      FROM running r
      LEFT JOIN last_zero z ON z."customerId" = r."customerId"
      WHERE r.type = 'CREDIT_SALE'
        AND (z."lastZeroAt" IS NULL OR r."createdAt" > z."lastZeroAt")
      GROUP BY r."customerId"
    )
    SELECT
      c.id,
      c.name,
      c.phone,
      c.balance::text       AS "balance",
      c."creditLimit"::text AS "creditLimit",
      ou."oldestUnpaidAt"   AS "oldestUnpaidAt"
    FROM "Customer" c
    LEFT JOIN oldest_unpaid ou ON ou."customerId" = c.id
    WHERE c.balance > 0
    ORDER BY c.balance DESC
  `;

  const totalReceivable = rows.reduce((sum, r) => sum + parseFloat(r.balance), 0).toFixed(2);

  return NextResponse.json<ReceivablesResponse>({
    totalReceivable,
    rows: rows.map((r) => ({
      customerId: r.id,
      customerName: r.name,
      phone: r.phone,
      balance: parseFloat(r.balance).toFixed(2),
      creditLimit: r.creditLimit != null ? parseFloat(r.creditLimit).toFixed(2) : null,
      agingBucket: agingBucket(r.oldestUnpaidAt),
      oldestUnpaidAt: r.oldestUnpaidAt?.toISOString() ?? null,
    })),
  });
}
