import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { canEditCatalog } from '@/lib/permissions';

/**
 * GET /api/catalog/bike-models/options
 *
 * Every bike model, slim: only the fields a dropdown renders — no `_count`
 * joins, no pagination. This exists because the list endpoint is paginated, and
 * a picker fed from a paginated endpoint would silently hide models past page 1
 * (you could not assign a part to the 26th model).
 *
 * Bike models number in the hundreds, not thousands, so returning all of them
 * is a few KB. If that ever stops being true, this is the endpoint to convert
 * to a type-ahead search.
 *
 * OWNER + CUTTER — same guard as the list endpoint it replaces.
 */
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (!canEditCatalog(user.role)) return forbiddenResponse();

  const bikeModels = await prisma.bikeModel.findMany({
    orderBy: [{ brand: 'asc' }, { model: 'asc' }, { year: 'asc' }],
    select: { id: true, brand: true, model: true, year: true, yearEnd: true, country: true },
  });

  return NextResponse.json(bikeModels);
}
