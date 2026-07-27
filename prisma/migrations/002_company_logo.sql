-- 002_company_logo.sql
-- Adds logoUrl column to Company and seeds default logo paths for KG and UD.
-- Apply with:
--   npx prisma db execute --file prisma/migrations/002_company_logo.sql --schema prisma/schema.prisma
-- Then regenerate the client:
--   npx prisma generate

ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "logoUrl" TEXT;

UPDATE "Company" SET "logoUrl" = '/logos/kandy-graphics-logo.png'
WHERE code = 'KG' AND "logoUrl" IS NULL;

UPDATE "Company" SET "logoUrl" = '/logos/ud-logo.png'
WHERE code = 'UD' AND "logoUrl" IS NULL;
