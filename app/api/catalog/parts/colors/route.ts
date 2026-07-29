import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { canEditCatalog } from '@/lib/permissions';

/**
 * GET /api/catalog/parts/colors?modelId=N
 *
 * Distinct, non-empty colours actually present on that bike model's parts —
 * the option list for the kit-contents colour filter.
 *
 * Deliberately NOT derived from a page of search results: that list is capped
 * and narrowed by `q`, so the available colours would shift as the user typed.
 * And deliberately not a hardcoded palette — the shop invents colour names.
 *
 * Spellings vary in the data ("Blue/Red" vs "blue/red"), so values are
 * de-duplicated case-insensitively, keeping the first spelling seen. The parts
 * filter matches case-insensitively too, so either spelling is caught.
 *
 * OWNER + CUTTER, matching the parts list this feeds.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (!canEditCatalog(user.role)) return forbiddenResponse();

  const raw = request.nextUrl.searchParams.get('modelId');
  const modelId = raw ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(modelId)) return NextResponse.json([]);

  const rows = await prisma.part.findMany({
    where: { bikeModelId: modelId, color: { not: null } },
    select: { color: true },
    distinct: ['color'],
    orderBy: { color: 'asc' },
  });

  const seen = new Set<string>();
  const colors: string[] = [];
  for (const r of rows) {
    const value = r.color?.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    colors.push(value);
  }

  return NextResponse.json(colors);
}
