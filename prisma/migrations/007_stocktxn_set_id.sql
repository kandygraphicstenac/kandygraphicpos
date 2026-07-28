-- 007_stocktxn_set_id.sql
--
-- Sticker sets get their own stock (StickerSet.packedStock, which already
-- exists). Selling/returning/adjusting a set is therefore a stock movement in
-- its own right and needs a StockTxn row, but StockTxn could previously only
-- reference a Part or a Sheet.
--
-- This adds a nullable setId, mirroring the existing partId/sheetId pattern, so
-- set stock stays reconstructable as SUM(qty) over its StockTxn rows.
--
-- ON DELETE SET NULL matches the Location -> Part precedent (003): deleting a
-- set must never destroy its audit history. Prisma's schema directives can't
-- express this, so it lives here (see CLAUDE.md "Migration pattern").

ALTER TABLE "StockTxn"
  ADD COLUMN IF NOT EXISTS "setId" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StockTxn_setId_fkey'
  ) THEN
    ALTER TABLE "StockTxn"
      ADD CONSTRAINT "StockTxn_setId_fkey"
      FOREIGN KEY ("setId") REFERENCES "StickerSet"("id")
      ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "StockTxn_setId_createdAt_idx"
  ON "StockTxn"("setId", "createdAt");
