import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser, unauthorizedResponse } from '@/lib/auth';
import { LocationCreateSchema } from '@/lib/validators/catalog';
import type { LocationRecord } from '@/lib/types/location';

/**
 * GET /api/locations
 * Returns all locations (active and inactive) ordered by code.
 * Any authenticated user can read — staff need to see locations in pickers.
 */
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();

  const locations = await prisma.location.findMany({
    orderBy: { code: 'asc' },
    select: { code: true, rack: true, shelf: true, slot: true, description: true, active: true },
  });

  return NextResponse.json(locations satisfies LocationRecord[]);
}

/**
 * POST /api/locations
 * Creates a new location. Any authenticated non-CUTTER user (LocationPicker uses this
 * inline when a cashier types a new code during catalog edit — OWNER only in practice
 * since catalog is OWNER-only, but CASHIER is allowed to create locations for the POS).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (user.role === 'CUTTER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = LocationCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 });
  }

  const d = parsed.data;

  try {
    const loc = await prisma.location.create({
      data: {
        code: d.code,
        rack: d.rack ?? null,
        shelf: d.shelf ?? null,
        slot: d.slot ?? null,
        description: d.description ?? null,
      },
    });
    return NextResponse.json(loc satisfies LocationRecord, { status: 201 });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === 'P2002') return NextResponse.json({ error: 'Location code already exists' }, { status: 409 });
    throw err;
  }
}
