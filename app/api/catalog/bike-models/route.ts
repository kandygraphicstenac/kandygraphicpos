import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { BikeModelCreateSchema } from '@/lib/validators/catalog';

/**
 * GET /api/catalog/bike-models
 * Returns all bike models with part/set counts.
 * OWNER + CASHIER allowed.
 */
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (user.role !== 'OWNER') return forbiddenResponse();

  const models = await prisma.bikeModel.findMany({
    orderBy: [{ brand: 'asc' }, { model: 'asc' }, { year: 'asc' }],
    include: { _count: { select: { parts: true, sets: true } } },
  });

  return NextResponse.json(models);
}

/**
 * POST /api/catalog/bike-models
 * Creates a new bike model. OWNER only.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (user.role !== 'OWNER') return forbiddenResponse();

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = BikeModelCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 });
  }

  try {
    const bikeModel = await prisma.bikeModel.create({
      data: {
        brand: parsed.data.brand,
        model: parsed.data.model,
        year: parsed.data.year,
        yearEnd: parsed.data.yearEnd ?? null,
        country: parsed.data.country ?? null,
      },
    });
    return NextResponse.json(bikeModel, { status: 201 });
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'P2002') {
      return NextResponse.json({ error: 'A bike model with the same brand, model, year, and country already exists.' }, { status: 409 });
    }
    throw err;
  }
}
