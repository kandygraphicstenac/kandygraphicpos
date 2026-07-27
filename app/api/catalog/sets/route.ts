import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { SetCreateSchema } from '@/lib/validators/catalog';
import { Decimal } from '@prisma/client/runtime/library';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (user.role !== 'OWNER') return forbiddenResponse();

  const sp = request.nextUrl.searchParams;
  const modelId = sp.get('modelId') ? parseInt(sp.get('modelId')!, 10) : undefined;
  const q = sp.get('q')?.trim() ?? '';

  const sets = await prisma.stickerSet.findMany({
    where: {
      ...(modelId ? { bikeModelId: modelId } : {}),
      ...(q
        ? {
            OR: [
              { sku: { contains: q, mode: 'insensitive' } },
              { name: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: [{ bikeModelId: 'asc' }, { name: 'asc' }],
    include: {
      bikeModel: { select: { id: true, brand: true, model: true, year: true, yearEnd: true } },
      components: {
        include: {
          part: { select: { id: true, name: true, sku: true, finishedStock: true, price: true } },
        },
      },
      _count: { select: { invoiceItems: true } },
      location: { select: { code: true, description: true } },
    },
  });

  return NextResponse.json(
    sets.map((s) => ({
      id: s.id,
      sku: s.sku,
      name: s.name,
      bikeModelId: s.bikeModelId,
      bikeModel: s.bikeModel,
      setPrice: s.setPrice.toString(),
      packedStock: s.packedStock,
      color: s.color,
      imageUrl: s.imageUrl,
      active: s.active,
      hasInvoices: s._count.invoiceItems > 0,
      locationCode: s.locationCode,
      location: s.location ?? null,
      components: s.components.map((c) => ({
        partId: c.partId,
        qty: c.qty,
        part: {
          ...c.part,
          price: c.part.price != null ? c.part.price.toString() : null,
        },
      })),
    })),
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (user.role !== 'OWNER') return forbiddenResponse();

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = SetCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 });
  }

  const d = parsed.data;

  try {
    const set = await prisma.stickerSet.create({
      data: {
        sku: d.sku,
        name: d.name,
        bikeModelId: d.bikeModelId,
        setPrice: new Decimal(d.setPrice),
        color: d.color ?? null,
        imageUrl: d.imageUrl ?? null,
        locationCode: d.locationCode ?? null,
        components: {
          create: d.components.map((c) => ({ partId: c.partId, qty: c.qty })),
        },
      },
      include: {
        components: { include: { part: { select: { name: true, sku: true } } } },
        bikeModel: { select: { id: true, brand: true, model: true, year: true, yearEnd: true } },
      },
    });
    return NextResponse.json(set, { status: 201 });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === 'P2002') return NextResponse.json({ error: 'SKU already exists' }, { status: 409 });
    if (e.code === 'P2003') return NextResponse.json({ error: 'Bike model or part not found' }, { status: 422 });
    throw err;
  }
}
