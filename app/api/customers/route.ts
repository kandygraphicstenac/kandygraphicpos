import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { CustomerBodySchema, CustomerQuerySchema } from '@/lib/validators/customer';

/**
 * GET /api/customers?q=&cursor=&pageSize=
 * Cursor-paginated, searchable by name or phone (contains, case-insensitive).
 * Sorted newest first. OWNER + CASHIER; CUTTER blocked.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (user.role === 'CUTTER') return forbiddenResponse();

  const { searchParams } = new URL(request.url);
  const parsed = CustomerQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid query' }, { status: 400 });
  }
  const { q, cursor, pageSize } = parsed.data;

  let cursorCreatedAt: Date | undefined;
  let cursorId: number | undefined;
  if (cursor) {
    try {
      const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
        createdAt: string;
        id: number;
      };
      cursorCreatedAt = new Date(decoded.createdAt);
      cursorId = decoded.id;
    } catch {
      return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 });
    }
  }

  const conditions: Prisma.CustomerWhereInput[] = [];
  if (q) {
    conditions.push({
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
      ],
    });
  }
  if (cursorCreatedAt && cursorId != null) {
    conditions.push({
      OR: [
        { createdAt: { lt: cursorCreatedAt } },
        { createdAt: cursorCreatedAt, id: { lt: cursorId } },
      ],
    });
  }

  const where: Prisma.CustomerWhereInput =
    conditions.length === 0 ? {} : conditions.length === 1 ? conditions[0] : { AND: conditions };

  const rows = await prisma.customer.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: pageSize + 1,
  });

  const hasMore = rows.length > pageSize;
  const customers = hasMore ? rows.slice(0, pageSize) : rows;
  const last = customers.at(-1);
  const nextCursor =
    hasMore && last
      ? Buffer.from(JSON.stringify({ createdAt: last.createdAt.toISOString(), id: last.id })).toString('base64url')
      : null;

  return NextResponse.json({
    customers: customers.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      creditLimit: c.creditLimit?.toString() ?? null,
      balance: c.balance.toString(),
    })),
    nextCursor,
  });
}

/**
 * POST /api/customers
 * Create a customer — used by both the /customers page and the POS quick-create flow.
 * OWNER + CASHIER; CUTTER blocked. 409 on duplicate phone.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (user.role === 'CUTTER') return forbiddenResponse();

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = CustomerBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const customer = await prisma.customer.create({ data: parsed.data });
    return NextResponse.json({
      ...customer,
      createdAt: customer.createdAt.toISOString(),
      creditLimit: customer.creditLimit?.toString() ?? null,
      balance: customer.balance.toString(),
    }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json({ error: 'A customer with this phone number already exists' }, { status: 409 });
    }
    throw err;
  }
}
