import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { BikeModelCreateSchema } from '@/lib/validators/catalog';
import { canEditCatalog } from '@/lib/permissions';

/**
 * GET /api/catalog/bike-models
 * Query params: q (brand/model), page (1-based), pageSize (default 25)
 *
 * Paginated list for the Bike Models tab. Dropdowns/pickers must NOT use this —
 * they'd silently truncate to one page. They use /api/catalog/bike-models/options,
 * which returns every row with only the fields a picker needs.
 * OWNER only.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (!canEditCatalog(user.role)) return forbiddenResponse();

  const sp = request.nextUrl.searchParams;
  const q = sp.get('q')?.trim() ?? '';
  const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(sp.get('pageSize') ?? '25', 10)));

  const where = q
    ? {
        OR: [
          { brand: { contains: q, mode: 'insensitive' as const } },
          { model: { contains: q, mode: 'insensitive' as const } },
        ],
      }
    : {};

  const [bikeModels, total] = await prisma.$transaction([
    prisma.bikeModel.findMany({
      where,
      orderBy: [{ brand: 'asc' }, { model: 'asc' }, { year: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { _count: { select: { parts: true, sets: true } } },
    }),
    prisma.bikeModel.count({ where }),
  ]);

  return NextResponse.json({
    bikeModels,
    total,
    page,
    pageSize,
    pageCount: Math.ceil(total / pageSize),
  });
}

/**
 * POST /api/catalog/bike-models
 * Creates a new bike model. OWNER only.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (!canEditCatalog(user.role)) return forbiddenResponse();

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = BikeModelCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 });
  }

  try {
    const bikeModel = await prisma.bikeModel.create({
      data: {
        brand: parsed.data.brand,
        model: parsed.data.model,
        year: parsed.data.year,
        yearEnd: parsed.data.yearEnd ?? null,
        country: parsed.data.country ?? null,
      },
    });
    return NextResponse.json(bikeModel, { status: 201 });
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'P2002') {
      return NextResponse.json({ error: 'A bike model with the same brand, model, year, and country already exists.' }, { status: 409 });
    }
    throw err;
  }
}
