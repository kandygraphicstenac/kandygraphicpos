import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { LocationUpdateSchema } from '@/lib/validators/catalog';

/**
 * PATCH /api/locations/[code]
 * Updates rack/shelf/slot/description/active. OWNER only.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (user.role !== 'OWNER') return forbiddenResponse();

  const { code } = await params;

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = LocationUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 });
  }

  try {
    const loc = await prisma.location.update({
      where: { code },
      data: {
        ...(parsed.data.rack !== undefined ? { rack: parsed.data.rack } : {}),
        ...(parsed.data.shelf !== undefined ? { shelf: parsed.data.shelf } : {}),
        ...(parsed.data.slot !== undefined ? { slot: parsed.data.slot } : {}),
        ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
        ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
      },
    });
    return NextResponse.json(loc);
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === 'P2025') return NextResponse.json({ error: 'Location not found' }, { status: 404 });
    throw err;
  }
}

/**
 * DELETE /api/locations/[code]
 * Hard-deletes if no products are assigned; rejects otherwise.
 * Use PATCH { active: false } to deactivate instead.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (user.role !== 'OWNER') return forbiddenResponse();

  const { code } = await params;

  const [partCount, setCount, sheetCount] = await Promise.all([
    prisma.part.count({ where: { locationCode: code } }),
    prisma.stickerSet.count({ where: { locationCode: code } }),
    prisma.sheet.count({ where: { locationCode: code } }),
  ]);

  if (partCount + setCount + sheetCount > 0) {
    return NextResponse.json(
      { error: `Cannot delete — ${partCount + setCount} product(s) and ${sheetCount} sheet(s) are assigned to this location. Deactivate it instead.` },
      { status: 409 },
    );
  }

  try {
    await prisma.location.delete({ where: { code } });
    return new NextResponse(null, { status: 204 });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === 'P2025') return NextResponse.json({ error: 'Location not found' }, { status: 404 });
    throw err;
  }
}
