import 'dotenv/config';
import { prisma } from '../lib/db';

async function main() {
  const rows = await prisma.$queryRaw<
    { tablename: string; indexname: string; indexdef: string }[]
  >`
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename IN ('Part','StickerSet','BikeModel','Location')
    ORDER BY tablename, indexname
  `;
  let current = '';
  for (const r of rows) {
    if (r.tablename !== current) { console.log(`\n=== ${r.tablename} ===`); current = r.tablename; }
    console.log(`  ${r.indexdef.replace(/^CREATE /, '')}`);
  }

  const counts = await prisma.$queryRaw<{ t: string; n: bigint }[]>`
    SELECT 'Part' AS t, COUNT(*) AS n FROM "Part"
    UNION ALL SELECT 'StickerSet', COUNT(*) FROM "StickerSet"
    UNION ALL SELECT 'BikeModel', COUNT(*) FROM "BikeModel"
    UNION ALL SELECT 'Location', COUNT(*) FROM "Location"
  `;
  console.log('\n=== row counts ===');
  for (const c of counts) console.log(`  ${c.t.padEnd(12)} ${c.n}`);

  const ext = await prisma.$queryRaw<{ extname: string }[]>`
    SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'
  `;
  console.log('\npg_trgm installed:', ext.length > 0);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
