import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { canEditCatalog } from '@/lib/permissions';

/**
 * GET /api/catalog/parts/names
 *
 * Distinct part names across EVERY bike model, for the Name autocomplete.
 *
 * Deliberately not scoped to the selected model: the same names recur across
 * bikes ("Tank left", "Mudguard decal"), and when adding parts to a brand-new
 * model a model-scoped query would return nothing — precisely when the help is
 * most useful.
 *
 * DISTINCT is done by the database (groupBy), never by shipping every part to
 * the browser. A few hundred distinct names is a few KB, so the client fetches
 * this once, caches it, and filters as the user types — no request per keystroke.
 *
 * Casing: the catalogue contains both "tank left" and "Tank left". Names are
 * de-duplicated case-insensitively and the MOST-USED spelling wins, so the
 * suggestion nudges entry toward whichever form the shop actually uses rather
 * than entrenching whichever happens to sort first.
 *
 * OWNER + CUTTER — same guard as the parts list this feeds.
 */
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (!canEditCatalog(user.role)) return forbiddenResponse();

  // Grouped and counted in Postgres; ordered so the most-used spelling of a
  // name is seen first by the de-duplication below.
  const rows = await prisma.part.groupBy({
    by: ['name'],
    _count: { name: true },
    orderBy: { _count: { name: 'desc' } },
  });

  const seen = new Set<string>();
  const names: string[] = [];
  for (const row of rows) {
    const value = row.name.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(value);
  }

  // Alphabetical for display; frequency only decided which spelling survived.
  names.sort((a, b) => a.localeCompare(b));

  return NextResponse.json(names);
}
