-- 010_drop_part_iskit.sql
--
-- Removes Part.isKit. The badge is now derived from `soldSeparately`:
-- unticked => "Kit part" (no price required, hidden from POS), ticked =>
-- "Part". Two checkboxes meaning overlapping things made data entry ambiguous,
-- which matters with ~3,000 products about to be entered.
--
-- Verified safe before writing this (scripts/checkIsKitRows.ts): isKit was a
-- perfect mirror of NOT "soldSeparately" across every row —
--   17 rows  isKit=false, soldSeparately=true   -> badge "Part"      (unchanged)
--    6 rows  isKit=true,  soldSeparately=false  -> badge "Kit part"  (was "Kit")
--    0 rows  contradictory (isKit=true AND soldSeparately=true)
-- so no row's meaning changes when the column goes.
--
-- Nothing else reads this column; 004_add_color_and_kit.sql is left as-is
-- because it is an applied historical record.

ALTER TABLE "Part" DROP COLUMN IF EXISTS "isKit";
