import { NextRequest, NextResponse } from 'next/server';
import { prisma, TXN_OPTIONS } from '@/lib/db';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { SetUpdateSchema } from '@/lib/validators/catalog';
import { canEditCatalog, canDeleteCatalog } from '@/lib/permissions';
import { Decimal } from '@prisma/client/runtime/library';

/** OWNER + CUTTER. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (!canEditCatalog(user.role)) return forbiddenResponse();

  const { id } = await params;
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = SetUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 });
  }

  const d = parsed.data;

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const set = await tx.stickerSet.findUnique({ where: { id: numId } });
      if (!set) throw { code: 'NOT_FOUND' };

      if (d.components !== undefined) {
        await tx.setComponent.deleteMany({ where: { setId: numId } });
      }

      return tx.stickerSet.update({
        where: { id: numId },
        data: {
          ...(d.sku !== undefined ? { sku: d.sku } : {}),
          ...(d.name !== undefined ? { name: d.name } : {}),
          ...(d.bikeModelId !== undefined ? { bikeModelId: d.bikeModelId } : {}),
          ...(d.setPrice !== undefined ? { setPrice: new Decimal(d.setPrice) } : {}),
          ...(d.color !== undefined ? { color: d.color ?? null } : {}),
          ...(d.imageUrl !== undefined ? { imageUrl: d.imageUrl ?? null } : {}),
          ...(d.locationCode !== undefined ? { locationCode: d.locationCode ?? null } : {}),
          ...(d.components !== undefined
            ? { components: { create: d.components.map((c) => ({ partId: c.partId, qty: c.qty })) } }
            : {}),
        },
        include: {
          components: { include: { part: { select: { name: true, sku: true, price: true, color: true } } } },
          bikeModel: { select: { id: true, brand: true, model: true, year: true, yearEnd: true } },
        },
      });
    }, TXN_OPTIONS);

    return NextResponse.json({
      ...updated,
      setPrice: updated.setPrice.toString(),
      components: updated.components.map((c) => ({
        partId: c.partId,
        qty: c.qty,
        part: { ...c.part, price: c.part.price != null ? c.part.price.toString() : null },
      })),
    });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === 'NOT_FOUND') return NextResponse.json({ error: 'Set not found' }, { status: 404 });
    if (e.code === 'P2002') return NextResponse.json({ error: 'SKU already exists' }, { status: 409 });
    throw err;
  }
}

/** OWNER only — CUTTER may edit sets but never delete them. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (!canDeleteCatalog(user.role)) return forbiddenResponse();

  const { id } = await params;
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const invoiceCount = await prisma.invoiceItem.count({ where: { setId: numId } });
  if (invoiceCount > 0) {
    const updated = await prisma.stickerSet.update({ where: { id: numId }, data: { active: false } });
    return NextResponse.json({ deactivated: true, id: updated.id });
  }

  await prisma.$transaction([
    prisma.setComponent.deleteMany({ where: { setId: numId } }),
    prisma.stickerSet.delete({ where: { id: numId } }),
  ]);

  return new NextResponse(null, { status: 204 });
}
