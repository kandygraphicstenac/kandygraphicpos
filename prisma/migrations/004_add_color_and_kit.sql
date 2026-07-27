-- Task A: color on parts and sets
ALTER TABLE "Part"       ADD COLUMN IF NOT EXISTS "color" TEXT;
ALTER TABLE "StickerSet" ADD COLUMN IF NOT EXISTS "color" TEXT;

-- Task B: kit flag on parts
ALTER TABLE "Part"       ADD COLUMN IF NOT EXISTS "isKit" BOOLEAN NOT NULL DEFAULT false;
