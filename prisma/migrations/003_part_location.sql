-- 003_part_location.sql
-- Extends the Location table for finished-stock tracking and links it to
-- Part and StickerSet.
-- Apply with:
--   npx prisma db execute --file prisma/migrations/003_part_location.sql --schema prisma/schema.prisma
-- Then:
--   npx prisma generate

-- 1. Make rack/shelf optional (they were required for sheet-storage locations;
--    simpler product-location codes like "A-1" don't need the breakdown).
ALTER TABLE "Location" ALTER COLUMN rack DROP NOT NULL;
ALTER TABLE "Location" ALTER COLUMN shelf DROP NOT NULL;

-- 2. Drop the unique constraint on (rack, shelf, slot) — nulls make it
--    ambiguous, and the code PK already guarantees uniqueness.
ALTER TABLE "Location" DROP CONSTRAINT IF EXISTS "Location_rack_shelf_slot_key";

-- 3. Add new fields to Location.
ALTER TABLE "Location" ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE "Location" ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

-- 4. Add locationCode FK to Part and StickerSet.
ALTER TABLE "Part"
  ADD COLUMN IF NOT EXISTS "locationCode" TEXT
  REFERENCES "Location"(code) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE "StickerSet"
  ADD COLUMN IF NOT EXISTS "locationCode" TEXT
  REFERENCES "Location"(code) ON UPDATE CASCADE ON DELETE SET NULL;

-- 5. Indexes for fast location-filter queries.
CREATE INDEX IF NOT EXISTS "Part_locationCode_idx"       ON "Part"("locationCode");
CREATE INDEX IF NOT EXISTS "StickerSet_locationCode_idx" ON "StickerSet"("locationCode");
