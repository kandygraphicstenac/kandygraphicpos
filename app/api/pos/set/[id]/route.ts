import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import type { SetDetailResult } from '@/lib/types/pos';
import { setAvailability } from '@/lib/utils/setAvailability';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (user.role === 'CUTTER') return forbiddenResponse();

  const { id } = await params;
  const setId = parseInt(id, 10);
  if (!Number.isFinite(setId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const s = await prisma.stickerSet.findUnique({
    where: { id: setId, active: true },
    select: {
      id: true,
      sku: true,
      name: true,
      setPrice: true,
      imageUrl: true,
      packedStock: true,
      locationCode: true,
      bikeModel: { select: { brand: true, model: true, year: true, yearEnd: true, country: true } },
      components: {
        select: {
          qty: true,
          part: {
            select: {
              id: true,
              sku: true,
              name: true,
              imageUrl: true,
              finishedStock: true,
              reorderLevel: true,
              price: true,
            },
          },
        },
      },
    },
  });

  if (!s) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // A packed kit has its own stock; components are a contents list only.
  const availability = setAvailability(s);

  // Sum of individual part prices × qty; null if any component has no price
  let componentSumPaise: number | null = 0;
  for (const c of s.components) {
    if (c.part.price == null) { componentSumPaise = null; break; }
    componentSumPaise += Math.round(parseFloat(c.part.price.toString()) * 100) * c.qty;
  }
  const setPricePaise = Math.round(parseFloat(s.setPrice.toString()) * 100);
  const savingsPaise = componentSumPaise != null ? componentSumPaise - setPricePaise : null;

  const result: SetDetailResult = {
    id: s.id,
    sku: s.sku,
    name: s.name,
    bikeModel: s.bikeModel,
    price: s.setPrice.toString(),
    imageUrl: s.imageUrl,
    packedStock: s.packedStock,
    availability,
    locationCode: s.locationCode,
    components: s.components.map((c) => ({
      qty: c.qty,
      part: {
        id: c.part.id,
        sku: c.part.sku,
        name: c.part.name,
        imageUrl: c.part.imageUrl,
        finishedStock: c.part.finishedStock,
        reorderLevel: c.part.reorderLevel,
        price: c.part.price?.toString() ?? null,
      },
    })),
    savingsPaise: savingsPaise != null && savingsPaise > 0 ? savingsPaise : null,
  };

  return NextResponse.json<SetDetailResult>(result);
}
