import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import type { LocationRecord } from '@/lib/types/location';
import { canReadLocations } from '@/lib/permissions';

/**
 * GET /api/locations/options
 *
 * Every location, for LocationPicker. Exists because the list endpoint is
 * paginated, and a picker fed from a paginated endpoint would silently hide
 * shelves past page 1.
 *
 * Only active locations: the picker is for assigning stock to a shelf, and a
 * deactivated shelf should not be assignable. The Locations tab still lists
 * inactive ones so they can be reactivated.
 *
 * OWNER + CASHIER + CUTTER — explicit allow-list so newly added roles are
 * denied by default rather than inheriting access.
 */
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (!canReadLocations(user.role)) return forbiddenResponse();

  const locations = await prisma.location.findMany({
    where: { active: true },
    orderBy: { code: 'asc' },
    select: { code: true, rack: true, shelf: true, slot: true, description: true, active: true },
  });

  return NextResponse.json(locations satisfies LocationRecord[]);
}
