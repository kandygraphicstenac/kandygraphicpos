-- 011_drop_part_dead_fields.sql
--
-- Removes two Part fields the shop never used:
--   colorScheme — redundant now that `color` exists and feeds the SKU suggestion
--   material    — everything printed is the same laminated vinyl
--
-- Removing them shortens a form that is about to be filled ~3,000 times.
--
-- Verified before writing this (scripts/checkDeadPartFields.ts), across all
-- 29 parts:
--   colorScheme non-empty: 0
--   material    non-empty: 0
-- so no data is lost. Neither field appeared on labels, receipts, reports,
-- exports, or in any search/WHERE clause. `colorScheme` was carried through the
-- POS search payload but never rendered by any component.
--
-- `color` is deliberately KEPT — it is the field actually in use.

ALTER TABLE "Part" DROP COLUMN IF EXISTS "colorScheme";

ALTER TABLE "Part" DROP COLUMN IF EXISTS "material";
