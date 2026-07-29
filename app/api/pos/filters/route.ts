import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import type { FiltersResponse } from '@/lib/types/pos';
import { canUsePos } from '@/lib/permissions';

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (!canUsePos(user.role)) return forbiddenResponse();

  const bikeModels = await prisma.bikeModel.findMany({
    select: { id: true, brand: true, model: true, year: true, yearEnd: true },
    orderBy: [{ brand: 'asc' }, { model: 'asc' }, { year: 'desc' }],
  });

  // Group by brand (order preserved from DB)
  const brandMap = new Map<string, { id: number; model: string; year: number; yearEnd: number | null }[]>();
  for (const bm of bikeModels) {
    const entry = { id: bm.id, model: bm.model, year: bm.year, yearEnd: bm.yearEnd };
    const existing = brandMap.get(bm.brand);
    if (existing) existing.push(entry);
    else brandMap.set(bm.brand, [entry]);
  }

  const brands = Array.from(brandMap.entries()).map(([brand, models]) => ({
    brand,
    models,
  }));

  return NextResponse.json<FiltersResponse>({ brands });
}
