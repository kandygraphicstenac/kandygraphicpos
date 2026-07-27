import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';

// DELETE /api/pos/hold/[id] — restore or discard a held sale
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (user.role === 'CUTTER') return forbiddenResponse();

  const { id } = await params;
  const heldId = parseInt(id, 10);
  if (!Number.isFinite(heldId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  // Verify ownership before deleting
  const held = await prisma.heldSale.findUnique({
    where: { id: heldId },
    select: { id: true, userId: true },
  });
  if (!held) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (held.userId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await prisma.heldSale.delete({ where: { id: heldId } });
  return new NextResponse(null, { status: 204 });
}
