import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getCurrentUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { PosSearchQuerySchema } from '@/lib/validators/pos';
import type {
  PartResult,
  SetResult,
  PosSearchResult,
  PosSearchResponse,
} from '@/lib/types/pos';

export type { PartResult, SetResult, PosSearchResult, PosSearchResponse };

const LIMIT = 30;

// ─── Cursor encode / decode ───────────────────────────────────────────────────

type CursorData = { n: string; t: 'part' | 'set'; id: number };

function encodeCursor(item: PosSearchResult): string {
  return Buffer.from(JSON.stringify({ n: item.name, t: item.type, id: item.id })).toString('base64url');
}

function decodeCursor(raw: string): CursorData | null {
  try {
    const obj = JSON.parse(Buffer.from(raw, 'base64url').toString());
    if (typeof obj.n === 'string' && (obj.t === 'part' || obj.t === 'set') && typeof obj.id === 'number')
      return obj as CursorData;
    return null;
  } catch { return null; }
}

// ─── Raw row types returned by $queryRaw ─────────────────────────────────────

type RawPartRow = {
  id: number;
  sku: string;
  name: string;
  colorScheme: string | null;
  price: string;    // NUMERIC cast ::text
  cost: string | null;
  finishedStock: number;
  reorderLevel: number;
  imageUrl: string | null;
  soldSeparately: boolean;
  isKit: boolean;
  brand: string;
  model: string;
  year: number;
  yearEnd: number | null;
  country: string | null;
  uncutQty: number; // LATERAL SUM cast ::int
  locationCode: string | null;
};

type RawSetRow = {
  id: number;
  sku: string;
  name: string;
  price: string;    // NUMERIC cast ::text
  imageUrl: string | null;
  packedStock: number;
  brand: string;
  model: string;
  year: number;
  yearEnd: number | null;
  country: string | null;
  availability: number; // packedStock + virtual, cast ::int
  locationCode: string | null;
};

// ─── SQL condition builders ───────────────────────────────────────────────────

/** Base WHERE for parts — no cursor. Used for both data and totalCount queries. */
function partBaseConditions(q: string, brand?: string, modelId?: number): Prisma.Sql {
  const conds: Prisma.Sql[] = [
    Prisma.sql`p.active = true`,
    Prisma.sql`p."soldSeparately" = true`,
    Prisma.sql`p.price IS NOT NULL`,
  ];
  if (modelId !== undefined) {
    conds.push(Prisma.sql`p."bikeModelId" = ${modelId}`);
  } else if (brand) {
    conds.push(Prisma.sql`bm.brand = ${brand}`);
  }
  if (q) {
    conds.push(Prisma.sql`(p.sku ILIKE ${'%' + q + '%'} OR p.name ILIKE ${'%' + q + '%'})`);
  }
  return Prisma.join(conds, ' AND ');
}

/** Base WHERE for sets — no cursor. */
function setBaseConditions(q: string, brand?: string, modelId?: number): Prisma.Sql {
  const conds: Prisma.Sql[] = [Prisma.sql`s.active = true`];
  if (modelId !== undefined) {
    conds.push(Prisma.sql`s."bikeModelId" = ${modelId}`);
  } else if (brand) {
    conds.push(Prisma.sql`bm.brand = ${brand}`);
  }
  if (q) {
    conds.push(Prisma.sql`(s.sku ILIKE ${'%' + q + '%'} OR s.name ILIKE ${'%' + q + '%'})`);
  }
  return Prisma.join(conds, ' AND ');
}

/**
 * Append keyset-pagination cursor condition for parts.
 * Combined sort order: (name ASC, type ASC, id ASC) — 'part' < 'set' alphabetically.
 */
function withPartCursor(base: Prisma.Sql, cursor: CursorData | null): Prisma.Sql {
  if (!cursor) return base;
  // If last item was a set, all same-name parts come before it and are already fetched.
  const extra = cursor.t === 'part'
    ? Prisma.sql`(p.name > ${cursor.n} OR (p.name = ${cursor.n} AND p.id > ${cursor.id}))`
    : Prisma.sql`p.name > ${cursor.n}`;
  return Prisma.join([base, extra], ' AND ');
}

/** Append keyset-pagination cursor condition for sets. */
function withSetCursor(base: Prisma.Sql, cursor: CursorData | null): Prisma.Sql {
  if (!cursor) return base;
  // If last item was a part, same-name sets come after it and haven't been fetched yet.
  const extra = cursor.t === 'part'
    ? Prisma.sql`s.name >= ${cursor.n}`
    : Prisma.sql`(s.name > ${cursor.n} OR (s.name = ${cursor.n} AND s.id > ${cursor.id}))`;
  return Prisma.join([base, extra], ' AND ');
}

// ─── Route handler ────────────────────────────────────────────────────────────

/**
 * GET /api/pos/search?q=&brand=&modelId=&cursor=
 *
 * Three SQL queries (run in parallel):
 *   1. Parts  — JOIN BikeModel + LATERAL aggregate for uncutQty, keyset-paginated
 *   2. Sets   — JOIN BikeModel + LATERAL MIN for virtual availability, keyset-paginated
 *   3. Count  — combined COUNT(*) for totalCount (cursor-independent)
 *
 * Returns { items, nextCursor, totalCount, query }.
 * Cursor encodes (name, type, id) as base64url JSON for stable keyset pagination.
 * Fetching LIMIT+1 items per table lets us detect whether a next page exists
 * without a separate existence check.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (user.role === 'CUTTER') return forbiddenResponse();

  const { searchParams } = new URL(request.url);
  const parsed = PosSearchQuerySchema.safeParse({
    q: searchParams.get('q') ?? '',
    brand: searchParams.get('brand') ?? undefined,
    modelId: searchParams.get('modelId') ?? undefined,
    cursor: searchParams.get('cursor') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { q, brand, modelId, cursor: cursorParam } = parsed.data;
  const cursor = cursorParam ? decodeCursor(cursorParam) : null;

  const showCost = user.role === 'OWNER';
  const qLower = q.toLowerCase();
  const fetchLimit = LIMIT + 1; // one extra sentinel to detect if more items exist

  const pBase = partBaseConditions(q, brand, modelId);
  const sBase = setBaseConditions(q, brand, modelId);
  const pPage = withPartCursor(pBase, cursor);
  const sPage = withSetCursor(sBase, cursor);

  const label = process.env.NODE_ENV !== 'production'
    ? `[pos-search] q="${q}" cursor=${cursorParam ? 'yes' : 'no'}${brand ? ` brand=${brand}` : ''}${modelId ? ` model=${modelId}` : ''}`
    : null;
  if (label) console.time(label);

  // Three queries, run in parallel
  const [rawParts, rawSets, countResult] = await Promise.all([

    // Query 1 — Parts with uncutQty aggregated in a LATERAL subquery
    prisma.$queryRaw<RawPartRow[]>`
      SELECT
        p.id,
        p.sku,
        p.name,
        p."colorScheme",
        p.price::text           AS price,
        p.cost::text            AS cost,
        p."finishedStock"::int  AS "finishedStock",
        p."reorderLevel"::int   AS "reorderLevel",
        p."imageUrl",
        p."soldSeparately",
        p."isKit",
        p."locationCode",
        bm.brand,
        bm.model,
        bm.year::int            AS year,
        bm."yearEnd",
        bm.country,
        COALESCE(sc_lat."uncutQty", 0)::int AS "uncutQty"
      FROM "Part" p
      JOIN "BikeModel" bm ON bm.id = p."bikeModelId"
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM("remainingQty"), 0)::int AS "uncutQty"
        FROM   "SheetContent"
        WHERE  "partId" = p.id AND "remainingQty" > 0
      ) sc_lat ON true
      WHERE ${pPage}
      ORDER BY p.name ASC, p.id ASC
      LIMIT ${fetchLimit}
    `,

    // Query 2 — Sets with virtual availability via LATERAL MIN
    prisma.$queryRaw<RawSetRow[]>`
      SELECT
        s.id,
        s.sku,
        s.name,
        s."setPrice"::text   AS price,
        s."imageUrl",
        s."packedStock"::int AS "packedStock",
        s."locationCode",
        bm.brand,
        bm.model,
        bm.year::int         AS year,
        bm."yearEnd",
        bm.country,
        (s."packedStock" + COALESCE(va.qty, 0))::int AS availability
      FROM "StickerSet" s
      JOIN "BikeModel" bm ON bm.id = s."bikeModelId"
      LEFT JOIN LATERAL (
        SELECT FLOOR(MIN(p."finishedStock"::float / NULLIF(sc.qty, 0)))::int AS qty
        FROM   "SetComponent" sc
        JOIN   "Part" p ON p.id = sc."partId"
        WHERE  sc."setId" = s.id
      ) va ON true
      WHERE ${sPage}
      ORDER BY s.name ASC, s.id ASC
      LIMIT ${fetchLimit}
    `,

    // Query 3 — Combined totalCount, cursor-independent (for "Showing X of Y" display)
    prisma.$queryRaw<[{ totalCount: number }]>`
      SELECT (
        (SELECT COUNT(*)::int FROM "Part" p JOIN "BikeModel" bm ON bm.id = p."bikeModelId" WHERE ${pBase})
        +
        (SELECT COUNT(*)::int FROM "StickerSet" s JOIN "BikeModel" bm ON bm.id = s."bikeModelId" WHERE ${sBase})
      ) AS "totalCount"
    `,
  ]);

  if (label) console.timeEnd(label);

  const partResults: PartResult[] = rawParts.map((p) => ({
    type: 'part',
    id: p.id,
    sku: p.sku,
    name: p.name,
    bikeModel: { brand: p.brand, model: p.model, year: p.year, yearEnd: p.yearEnd, country: p.country },
    colorScheme: p.colorScheme,
    price: p.price,
    cost: showCost && p.cost != null ? p.cost : null,
    finishedStock: p.finishedStock,
    reorderLevel: p.reorderLevel,
    uncutQty: p.uncutQty,
    imageUrl: p.imageUrl,
    soldSeparately: p.soldSeparately,
    isKit: p.isKit,
    exactMatch: p.sku.toLowerCase() === qLower,
    locationCode: p.locationCode,
  }));

  const setResults: SetResult[] = rawSets.map((s) => ({
    type: 'set',
    id: s.id,
    sku: s.sku,
    name: s.name,
    bikeModel: { brand: s.brand, model: s.model, year: s.year, yearEnd: s.yearEnd, country: s.country },
    price: s.price,
    imageUrl: s.imageUrl,
    packedStock: s.packedStock,
    availability: s.availability,
    exactMatch: s.sku.toLowerCase() === qLower,
    locationCode: s.locationCode,
  }));

  // Merge sort: stable natural order (name ASC, type ASC ['part' < 'set'], id ASC).
  // This order must be consistent with the cursor conditions above.
  const merged = [...partResults, ...setResults].sort((a, b) => {
    const nc = a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    if (nc !== 0) return nc;
    if (a.type !== b.type) return a.type < b.type ? -1 : 1;
    return a.id - b.id;
  });

  // The (LIMIT+1)th item is a sentinel proving more rows exist — don't include it.
  const hasMore = merged.length > LIMIT;
  const pageItems = merged.slice(0, LIMIT);
  const nextCursor = hasMore ? encodeCursor(pageItems[LIMIT - 1]) : null;

  // Float exact matches to top only on page 1 (cursor present = subsequent page).
  const items = !cursor
    ? [...pageItems.filter((r) => r.exactMatch), ...pageItems.filter((r) => !r.exactMatch)]
    : pageItems;

  const totalCount = countResult[0]?.totalCount ?? 0;

  return NextResponse.json<PosSearchResponse>({ items, nextCursor, totalCount, query: q });
}
