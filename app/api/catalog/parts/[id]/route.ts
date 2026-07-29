import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { PartUpdateSchema } from '@/lib/validators/catalog';
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

  const parsed = PartUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 });
  }

  const { price, cost, ...rest } = parsed.data;
  const updateData: Record<string, unknown> = { ...rest };
  if (price !== undefined) updateData.price = price ? new Decimal(price) : null;
  if (cost !== undefined) updateData.cost = cost ? new Decimal(cost) : null;

  try {
    const updated = await prisma.part.update({ where: { id: numId }, data: updateData });
    return NextResponse.json({ ...updated, price: updated.price?.toString() ?? null, cost: updated.cost?.toString() ?? null });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === 'P2025') return NextResponse.json({ error: 'Part not found' }, { status: 404 });
    if (e.code === 'P2002') return NextResponse.json({ error: 'SKU already exists' }, { status: 409 });
    throw err;
  }
}

/** OWNER-only DELETE: deactivates instead of hard-deleting when transactions exist. */
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

  const [txnCount, itemCount] = await Promise.all([
    prisma.stockTxn.count({ where: { partId: numId } }),
    prisma.invoiceItem.count({ where: { partId: numId } }),
  ]);

  if (txnCount > 0 || itemCount > 0) {
    const updated = await prisma.part.update({ where: { id: numId }, data: { active: false } });
    return NextResponse.json({ deactivated: true, id: updated.id });
  }

  try {
    await prisma.part.delete({ where: { id: numId } });
    return new NextResponse(null, { status: 204 });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === 'P2025') return NextResponse.json({ error: 'Part not found' }, { status: 404 });
    throw err;
  }
}
