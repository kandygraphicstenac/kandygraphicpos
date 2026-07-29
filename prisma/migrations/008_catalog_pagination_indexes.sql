-- 008_catalog_pagination_indexes.sql
--
-- Indexes for the paginated + server-side-searched catalog lists.
-- Everything here is IF NOT EXISTS, so it is safe to re-run.
--
-- Inspected against the live DB first (scripts/inspectIndexes.ts). What already
-- existed:
--   Part        pkey, sku unique, bikeModelId, locationCode
--   StickerSet  pkey, sku unique, locationCode
--   BikeModel   pkey, (brand, model), unique(brand, model, year, country)
--   Location    pkey(code), unique(rack, shelf, slot)
--
-- IMPORTANT: the three GIN trigram indexes from 001_search_indexes.sql were
-- NOT present in the database — pg_trgm was installed but the indexes were
-- never created. They are re-asserted below, because without them the POS
-- search (documented <100ms) degrades to a sequential scan on every ILIKE.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── Trigram indexes for ILIKE '%q%' search ──────────────────────────────────
-- Btree cannot serve a leading-wildcard LIKE; GIN trigram can.

-- Re-asserted from 001 (verified missing):
CREATE INDEX IF NOT EXISTS "idx_part_sku_trgm"
  ON "Part" USING GIN (sku gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "idx_part_name_trgm"
  ON "Part" USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "idx_stickerset_name_trgm"
  ON "StickerSet" USING GIN (name gin_trgm_ops);

-- New: the Sets list searches sku as well as name, but only name was indexed.
CREATE INDEX IF NOT EXISTS "idx_stickerset_sku_trgm"
  ON "StickerSet" USING GIN (sku gin_trgm_ops);

-- ── Composite indexes matching each list's filter + ORDER BY ────────────────
-- Both list queries are `WHERE "bikeModelId" = $1 ORDER BY "bikeModelId", name`.
-- A (bikeModelId, name) composite serves the filter AND supplies rows already
-- sorted, so Postgres can skip the sort and read straight off the index for
-- LIMIT/OFFSET paging.
--
-- The leftmost prefix also covers a plain "bikeModelId" lookup, so StickerSet
-- needs no separate single-column index (it had none).

CREATE INDEX IF NOT EXISTS "idx_part_bikemodel_name"
  ON "Part" ("bikeModelId", name);

CREATE INDEX IF NOT EXISTS "idx_stickerset_bikemodel_name"
  ON "StickerSet" ("bikeModelId", name);

-- Note: "Part_bikeModelId_idx" (single column) is now redundant for reads,
-- since the composite above covers it by leftmost prefix. It is deliberately
-- NOT dropped — it is declared as @@index([bikeModelId]) in schema.prisma, so
-- a future `prisma db push` would recreate it anyway. Catalog writes are
-- low-volume, so the extra write cost is negligible.
--
-- Deliberately NOT indexed: BikeModel.brand/model and Location.code/description
-- for search. Those tables stay in the hundreds of rows, where a sequential
-- scan beats a GIN lookup. Add trigram indexes there only if bike models or
-- locations ever reach the thousands.
