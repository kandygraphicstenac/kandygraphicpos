import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { canViewInvoices } from '@/lib/permissions';

const QuerySchema = z.object({
  cursor: z.string().optional(),
  company: z.string().trim().max(10).optional(),
  dateFrom: z.string().optional(), // ISO timestamp (UTC) — OWNER only; ignored for CASHIER browsing
  dateTo: z.string().optional(),   // ISO timestamp (UTC), exclusive upper bound — OWNER only
  q: z.string().trim().max(50).optional(), // search by invoice ID (contains)
  mine: z.coerce.boolean().optional(), // CASHIER: scope to invoices they personally processed
  orderType: z.enum(['COUNTER', 'DELIVERY']).optional(),
  deliveryStatus: z.enum(['TO_PACK', 'PACKED', 'SHIPPED', 'DELIVERED']).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

/** Midnight-to-midnight UTC bounds for "today" in Asia/Colombo. */
function colomboTodayRangeUtc(): { start: Date; end: Date } {
  const todayYmd = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Colombo' });
  const start = new Date(`${todayYmd}T00:00:00+05:30`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/**
 * GET /api/invoices
 * Cursor-paginated invoice list. Sorted newest first (createdAt DESC, id DESC).
 * CUTTER role is blocked.
 *
 * Role scoping:
 *   OWNER   – unrestricted: any dateFrom/dateTo/company, all cashiers.
 *   CASHIER – when no search query (`q`) is supplied, the list is locked to
 *             today (Asia/Colombo) regardless of any client-supplied
 *             dateFrom/dateTo, which are ignored entirely for this role —
 *             cashiers cannot browse arbitrary historical ranges. Supplying
 *             `q` (looking up a specific invoice, e.g. by scanned barcode)
 *             searches across all history, since a return can be started on
 *             any past invoice. `mine=true` further scopes to invoices they
 *             personally processed.
 *
 * Query params:
 *   cursor     – opaque base64url cursor from previous response
 *   company    – filter by company code (e.g. "KG")
 *   dateFrom   – ISO UTC timestamp, inclusive lower bound on createdAt (OWNER only)
 *   dateTo     – ISO UTC timestamp, exclusive upper bound on createdAt (OWNER only)
 *   q          – partial match on invoice ID
 *   mine       – CASHIER only: restrict to invoices processed by the current user
 *   pageSize   – default 25, max 100
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (!canViewInvoices(user.role)) return forbiddenResponse();

  const { searchParams } = new URL(request.url);
  const parsed = QuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid query' }, { status: 400 });
  }

  const { cursor, company, dateFrom, dateTo, q, mine, orderType, deliveryStatus, pageSize } = parsed.data;
  const isCashier = user.role === 'CASHIER';

  // ── Decode cursor ──────────────────────────────────────────────────────────
  let cursorCreatedAt: Date | undefined;
  let cursorId: string | undefined;
  if (cursor) {
    try {
      const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
        createdAt: string;
        id: string;
      };
      cursorCreatedAt = new Date(decoded.createdAt);
      cursorId = decoded.id;
    } catch {
      return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 });
    }
  }

  // ── Build WHERE conditions ─────────────────────────────────────────────────
  const conditions: Prisma.InvoiceWhereInput[] = [];

  if (company) conditions.push({ company: { code: company } });
  if (q) conditions.push({ id: { contains: q, mode: 'insensitive' } });
  if (orderType) conditions.push({ orderType });
  if (deliveryStatus) conditions.push({ deliveryStatus });

  if (isCashier) {
    if (mine) conditions.push({ userId: user.id });
    // Browsing without a search query is locked to today, server-side —
    // dateFrom/dateTo are never honored for this role, no matter what the
    // client sends. Searching by invoice id (q) is exempt: a cashier must be
    // able to find any past invoice to start a return on it.
    if (!q) {
      const { start, end } = colomboTodayRangeUtc();
      conditions.push({ createdAt: { gte: start, lt: end } });
    }
  } else {
    // OWNER: unrestricted — honor any client-supplied range.
    if (dateFrom) conditions.push({ createdAt: { gte: new Date(dateFrom) } });
    if (dateTo) conditions.push({ createdAt: { lt: new Date(dateTo) } });
  }

  if (cursorCreatedAt && cursorId) {
    conditions.push({
      OR: [
        { createdAt: { lt: cursorCreatedAt } },
        { createdAt: cursorCreatedAt, id: { lt: cursorId } },
      ],
    });
  }

  const where: Prisma.InvoiceWhereInput =
    conditions.length === 0 ? {} : conditions.length === 1 ? conditions[0] : { AND: conditions };

  // ── Query ──────────────────────────────────────────────────────────────────
  const rows = await prisma.invoice.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: pageSize + 1, // fetch one extra to determine if there is a next page
    select: {
      id: true,
      createdAt: true,
      total: true,
      payment: true,
      status: true,
      orderType: true,
      deliveryStatus: true,
      company: { select: { id: true, code: true } },
      _count: { select: { items: true } },
    },
  });

  const hasMore = rows.length > pageSize;
  const invoices = hasMore ? rows.slice(0, pageSize) : rows;

  const last = invoices.at(-1);
  const nextCursor =
    hasMore && last
      ? Buffer.from(
          JSON.stringify({ createdAt: last.createdAt.toISOString(), id: last.id }),
        ).toString('base64url')
      : null;

  return NextResponse.json({
    invoices: invoices.map((inv) => ({
      ...inv,
      total: inv.total.toString(),
      createdAt: inv.createdAt.toISOString(),
    })),
    nextCursor,
  });
}
