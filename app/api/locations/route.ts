import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { LocationCreateSchema } from '@/lib/validators/catalog';
import { canEditCatalog, canReadLocations } from '@/lib/permissions';
import type { LocationRecord } from '@/lib/types/location';

/**
 * GET /api/locations
 * Query params: q (code/description), page (1-based), pageSize (default 25)
 *
 * Paginated list for the Locations tab. LocationPicker must NOT use this — it
 * would silently truncate to one page. It uses /api/locations/options.
 * OWNER + CASHIER + CUTTER (was ungated; explicit allow-list so newly added
 * roles are denied by default rather than inheriting access).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (!canReadLocations(user.role)) return forbiddenResponse();

  const sp = request.nextUrl.searchParams;
  const q = sp.get('q')?.trim() ?? '';
  const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(sp.get('pageSize') ?? '25', 10)));

  const where = q
    ? {
        OR: [
          { code: { contains: q, mode: 'insensitive' as const } },
          { description: { contains: q, mode: 'insensitive' as const } },
        ],
      }
    : {};

  const [locations, total] = await prisma.$transaction([
    prisma.location.findMany({
      where,
      orderBy: { code: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { code: true, rack: true, shelf: true, slot: true, description: true, active: true },
    }),
    prisma.location.count({ where }),
  ]);

  return NextResponse.json({
    locations: locations satisfies LocationRecord[],
    total,
    page,
    pageSize,
    pageCount: Math.ceil(total / pageSize),
  });
}

/**
 * POST /api/locations
 * Creates a new location. OWNER + CUTTER — LocationPicker uses this inline when
 * a new shelf code is typed during a catalog edit.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (!canEditCatalog(user.role)) return forbiddenResponse();

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = LocationCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 });
  }

  const d = parsed.data;

  try {
    const loc = await prisma.location.create({
      data: {
        code: d.code,
        rack: d.rack ?? null,
        shelf: d.shelf ?? null,
        slot: d.slot ?? null,
        description: d.description ?? null,
      },
    });
    return NextResponse.json(loc satisfies LocationRecord, { status: 201 });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === 'P2002') return NextResponse.json({ error: 'Location code already exists' }, { status: 409 });
    throw err;
  }
}
