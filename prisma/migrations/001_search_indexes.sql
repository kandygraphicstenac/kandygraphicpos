-- GIN trigram indexes for POS search endpoint.
-- Enables fast ILIKE '%q%' patterns on Part.sku, Part.name, StickerSet.name.
-- The bikeModelId btree index already exists from prisma db push.
--
-- Apply with:
--   npx prisma db execute --file prisma/migrations/001_search_indexes.sql --schema prisma/schema.prisma

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "idx_part_sku_trgm"
  ON "Part" USING GIN (sku gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "idx_part_name_trgm"
  ON "Part" USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "idx_stickerset_name_trgm"
  ON "StickerSet" USING GIN (name gin_trgm_ops);
