import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { ASSIGNABLE_ROLES } from '@/lib/permissions';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

/**
 * GET /api/admin/users
 * Lists all users in the Prisma DB. OWNER only.
 */
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (user.role !== 'OWNER') return forbiddenResponse();

  const users = await prisma.user.findMany({
    select: {
      id: true, name: true, email: true, role: true, active: true,
      _count: { select: { invoices: true, stockTxns: true } },
    },
    orderBy: { id: 'asc' },
  });

  return NextResponse.json(
    users.map(({ _count, ...u }) => ({
      ...u,
      hasActivity: _count.invoices > 0 || _count.stockTxns > 0,
    })),
  );
}

const CreateSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().min(1).max(100),
  role: z.enum(ASSIGNABLE_ROLES),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

/**
 * POST /api/admin/users
 * Creates a user in Supabase Auth and in the Prisma DB atomically.
 * Requires SUPABASE_SERVICE_ROLE_KEY in environment.
 * OWNER only.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (user.role !== 'OWNER') return forbiddenResponse();

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const { email, name, role, password } = parsed.data;

  // Reject if email already in DB
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
  }

  // Create in Supabase Auth
  let admin;
  try {
    admin = getSupabaseAdmin();
  } catch {
    return NextResponse.json(
      {
        error:
          'SUPABASE_SERVICE_ROLE_KEY is not configured. ' +
          'Add it from Supabase Dashboard → Project Settings → API → service_role.',
      },
      { status: 501 },
    );
  }

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // skip the confirmation email flow
  });

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 });
  }

  // Create in Prisma DB — if this fails, clean up the Supabase auth record.
  try {
    const newUser = await prisma.user.create({
      data: { email, name, role },
      select: { id: true, name: true, email: true, role: true, active: true },
    });
    return NextResponse.json(newUser, { status: 201 });
  } catch (err) {
    // Compensate: remove the orphaned Supabase auth user
    if (authData.user?.id) {
      await admin.auth.admin.deleteUser(authData.user.id).catch(() => null);
    }
    throw err;
  }
}
