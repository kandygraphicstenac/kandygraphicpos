import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { PartCreateSchema } from '@/lib/validators/catalog';
import { canEditCatalog, canViewCatalogCost } from '@/lib/permissions';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * GET /api/catalog/parts
 * Query params: q, modelId, page (1-based), pageSize (default 25)
 * OWNER + CUTTER. CASHIER blocked.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (!canEditCatalog(user.role)) return forbiddenResponse();

  const sp = request.nextUrl.searchParams;
  const q = sp.get('q')?.trim() ?? '';
  const modelId = sp.get('modelId') ? parseInt(sp.get('modelId')!, 10) : undefined;
  const color = sp.get('color')?.trim() ?? '';
  const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(sp.get('pageSize') ?? '25', 10)));

  const where = {
    ...(q
      ? {
          OR: [
            { sku: { contains: q, mode: 'insensitive' as const } },
            { name: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
    ...(modelId ? { bikeModelId: modelId } : {}),
    // Case-insensitive so "Blue/Red" and "blue/red" — both present in this
    // catalog — are treated as the same colour. Combines with `q` (AND), so
    // search and colour filter narrow together.
    ...(color ? { color: { equals: color, mode: 'insensitive' as const } } : {}),
  };

  const [parts, total] = await prisma.$transaction([
    prisma.part.findMany({
      where,
      orderBy: [{ bikeModelId: 'asc' }, { name: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        bikeModel: { select: { id: true, brand: true, model: true, year: true, yearEnd: true } },
        _count: { select: { stockTxns: true, invoiceItems: true } },
        location: { select: { code: true, description: true } },
      },
    }),
    prisma.part.count({ where }),
  ]);

  const showCost = canViewCatalogCost(user.role);

  return NextResponse.json({
    parts: parts.map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      bikeModelId: p.bikeModelId,
      bikeModel: p.bikeModel,
      color: p.color,
      price: p.price?.toString() ?? null,
      cost: showCost ? (p.cost?.toString() ?? null) : undefined,
      finishedStock: p.finishedStock,
      reorderLevel: p.reorderLevel,
      soldSeparately: p.soldSeparately,
      imageUrl: p.imageUrl,
      active: p.active,
      hasTransactions: p._count.stockTxns > 0 || p._count.invoiceItems > 0,
      locationCode: p.locationCode,
      location: p.location ?? null,
    })),
    total,
    page,
    pageSize,
    pageCount: Math.ceil(total / pageSize),
  });
}

/**
 * POST /api/catalog/parts
 * Creates a new part. OWNER + CUTTER.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (!canEditCatalog(user.role)) return forbiddenResponse();

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = PartCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 });
  }

  const d = parsed.data;

  try {
    const part = await prisma.part.create({
      data: {
        sku: d.sku,
        name: d.name,
        bikeModelId: d.bikeModelId,
        color: d.color ?? null,
        price: d.price ? new Decimal(d.price) : null,
        cost: d.cost ? new Decimal(d.cost) : null,
        reorderLevel: d.reorderLevel ?? 0,
        soldSeparately: d.soldSeparately ?? true,
        imageUrl: d.imageUrl ?? null,
        locationCode: d.locationCode ?? null,
      },
    });
    return NextResponse.json(part, { status: 201 });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === 'P2002') return NextResponse.json({ error: 'SKU already exists' }, { status: 409 });
    if (e.code === 'P2003') return NextResponse.json({ error: 'Bike model not found' }, { status: 422 });
    throw err;
  }
}
