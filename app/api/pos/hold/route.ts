import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { HoldSaleBodySchema } from '@/lib/validators/pos';
import { canUsePos } from '@/lib/permissions';

const MAX_HELD = 5;

// GET /api/pos/hold — return the calling user's held sales (newest first)
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (!canUsePos(user.role)) return forbiddenResponse();

  const rows = await prisma.heldSale.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: MAX_HELD,
    select: { id: true, label: true, lines: true, createdAt: true },
  });

  return NextResponse.json(
    rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
  );
}

// POST /api/pos/hold — park the current cart
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (!canUsePos(user.role)) return forbiddenResponse();

  const body = await request.json().catch(() => null);
  const parsed = HoldSaleBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  // Enforce max 5 held sales per user — evict oldest if at limit
  const count = await prisma.heldSale.count({ where: { userId: user.id } });
  if (count >= MAX_HELD) {
    const oldest = await prisma.heldSale.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (oldest) await prisma.heldSale.delete({ where: { id: oldest.id } });
  }

  const held = await prisma.heldSale.create({
    // `lines` comes straight from request.json(), so every element is already a
    // JSON-safe value; Zod only guarantees it's a non-empty array (see
    // HoldSaleBodySchema), hence the cast to Prisma's JSON input type.
    data: {
      userId: user.id,
      label: parsed.data.label,
      lines: parsed.data.lines as Prisma.InputJsonValue,
    },
    select: { id: true, label: true, lines: true, createdAt: true },
  });

  return NextResponse.json(
    { ...held, createdAt: held.createdAt.toISOString() },
    { status: 201 },
  );
}
