import 'dotenv/config';
import { prisma } from '../lib/db';

/**
 * Reports which raw-SQL migrations are actually present in the connected
 * database. We don't use `prisma migrate`, so there is no _prisma_migrations
 * ledger — this probes for the schema objects each migration creates.
 */
async function main() {
  const cols = await prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        (table_name = 'StockTxn'   AND column_name = 'setId')
     OR (table_name = 'Part'       AND column_name IN ('color','isKit','soldSeparately','colorScheme','material'))
     OR (table_name = 'StickerSet' AND column_name = 'color')
     OR (table_name = 'BikeModel'  AND column_name = 'yearEnd')
      )
  `;
  const has = (t: string, c: string) => cols.some((r) => r.table_name === t && r.column_name === c);

  const idx = await prisma.$queryRaw<{ indexname: string }[]>`
    SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
  `;
  const hasIdx = (n: string) => idx.some((r) => r.indexname === n);

  const nullable = await prisma.$queryRaw<{ is_nullable: string }[]>`
    SELECT is_nullable FROM information_schema.columns
    WHERE table_schema='public' AND table_name='Part' AND column_name='price'
  `;

  const roleVals = await prisma.$queryRaw<{ enumlabel: string }[]>`
    SELECT e.enumlabel
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'Role'
  `;
  const hasRole = (v: string) => roleVals.some((r) => r.enumlabel === v);

  const rows: [string, boolean][] = [
    ['001 idx_part_sku_trgm',            hasIdx('idx_part_sku_trgm')],
    ['001 idx_part_name_trgm',           hasIdx('idx_part_name_trgm')],
    ['001 idx_stickerset_name_trgm',     hasIdx('idx_stickerset_name_trgm')],
    // 004 also added Part.isKit, but 010 drops it again — probe only the part
    // of 004 that still exists, or this would report MISSING forever.
    ['004 Part.color',                   has('Part', 'color')],
    ['004 StickerSet.color',             has('StickerSet', 'color')],
    ['005 Part.price nullable',          nullable[0]?.is_nullable === 'YES'],
    ['006 BikeModel.yearEnd',            has('BikeModel', 'yearEnd')],
    ['007 StockTxn.setId',               has('StockTxn', 'setId')],
    ['008 idx_stickerset_sku_trgm',      hasIdx('idx_stickerset_sku_trgm')],
    ['008 idx_part_bikemodel_name',      hasIdx('idx_part_bikemodel_name')],
    ['008 idx_stickerset_bikemodel_name', hasIdx('idx_stickerset_bikemodel_name')],
    ['009 Role.SALES',                    hasRole('SALES')],
    ['009 Role.ACCOUNT',                  hasRole('ACCOUNT')],
    // Inverted: these DROP columns, so "applied" means they are gone.
    ['010 Part.isKit dropped',            !has('Part', 'isKit')],
    ['011 Part.colorScheme dropped',      !has('Part', 'colorScheme')],
    ['011 Part.material dropped',         !has('Part', 'material')],
  ];

  for (const [label, ok] of rows) {
    console.log(`${ok ? '  APPLIED ' : '! MISSING'}  ${label}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
