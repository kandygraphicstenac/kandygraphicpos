import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { BikeModelUpdateSchema } from '@/lib/validators/catalog';
import { canEditCatalog, canDeleteCatalog } from '@/lib/permissions';

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

  const parsed = BikeModelUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 });
  }

  try {
    const updated = await prisma.bikeModel.update({
      where: { id: numId },
      data: parsed.data,
    });
    return NextResponse.json(updated);
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (e.code === 'P2002') return NextResponse.json({ error: 'Duplicate bike model' }, { status: 409 });
    throw err;
  }
}

/** OWNER only — CUTTER may edit bike models but never delete them. */
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

  const partCount = await prisma.part.count({ where: { bikeModelId: numId } });
  if (partCount > 0) {
    return NextResponse.json(
      { error: `Cannot delete: ${partCount} part(s) reference this bike model. Reassign or deactivate them first.` },
      { status: 409 },
    );
  }

  try {
    await prisma.bikeModel.delete({ where: { id: numId } });
    return new NextResponse(null, { status: 204 });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    throw err;
  }
}
