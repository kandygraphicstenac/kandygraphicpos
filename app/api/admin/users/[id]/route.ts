import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { ASSIGNABLE_ROLES } from '@/lib/permissions';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const PatchSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  role: z.enum(ASSIGNABLE_ROLES).optional(),
  active: z.boolean().optional(),
});

/**
 * PATCH /api/admin/users/[id]
 * Updates name, role, or active status. OWNER only.
 * An owner cannot deactivate themselves (guard below).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return unauthorizedResponse();
  if (currentUser.role !== 'OWNER') return forbiddenResponse();

  const { id } = await params;
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 });
  }

  // Prevent an owner from deactivating their own account
  if (numId === currentUser.id && parsed.data.active === false) {
    return NextResponse.json({ error: 'You cannot deactivate your own account' }, { status: 400 });
  }

  try {
    const updated = await prisma.user.update({
      where: { id: numId },
      data: parsed.data,
      select: { id: true, name: true, email: true, role: true, active: true },
    });
    return NextResponse.json(updated);
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'P2025') {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    throw err;
  }
}

/**
 * DELETE /api/admin/users/[id]
 * Permanently removes a user from public.User and from Supabase Auth.
 * Only allowed when the user has zero invoices and zero StockTxns.
 * OWNER only; cannot delete yourself.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return unauthorizedResponse();
  if (currentUser.role !== 'OWNER') return forbiddenResponse();

  const { id } = await params;
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  if (numId === currentUser.id) {
    return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id: numId },
    select: {
      id: true,
      email: true,
      _count: { select: { invoices: true, stockTxns: true } },
    },
  });

  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  if (target._count.invoices > 0 || target._count.stockTxns > 0) {
    return NextResponse.json(
      { error: 'User has activity history — deactivate instead of deleting' },
      { status: 409 },
    );
  }

  // Remove from DB first
  await prisma.user.delete({ where: { id: numId } });

  // Remove from Supabase Auth (best-effort — DB removal already blocks login)
  try {
    const admin = getSupabaseAdmin();
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const authUser = (data?.users ?? []).find(
      (u) => u.email?.toLowerCase() === target.email.toLowerCase(),
    );
    if (authUser) {
      await admin.auth.admin.deleteUser(authUser.id);
    }
  } catch {
    // Non-fatal: the public.User row is gone so login is blocked regardless
  }

  return new NextResponse(null, { status: 204 });
}
