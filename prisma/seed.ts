import { PrismaClient, Role, TxnType } from "@prisma/client";

const prisma = new PrismaClient();

// Seed data: common Sri Lankan market bikes.
// Initial stock is entered the "correct" way — finishedStock update + ADJUST StockTxn
// in one transaction — so the audit log explains every number from day one.

type PartSeed = {
  sku: string;
  name: string;
  price: number;
  cost: number;
  stock: number;
  reorderLevel?: number;
};

type ModelSeed = {
  brand: string;
  model: string;
  year: number;
  country: string;
  parts: PartSeed[];
  set?: { sku: string; name: string; setPrice: number; componentSkus: string[] };
};

const models: ModelSeed[] = [
  {
    brand: "Bajaj",
    model: "Pulsar 150",
    year: 2019,
    country: "LK",
    parts: [
      { sku: "BJJ-PLS150-19-TKL", name: "Tank decal left", price: 950, cost: 320, stock: 8 },
      { sku: "BJJ-PLS150-19-TKR", name: "Tank decal right", price: 950, cost: 320, stock: 8 },
      { sku: "BJJ-PLS150-19-STR", name: "Side stripe kit", price: 650, cost: 210, stock: 14 },
      { sku: "BJJ-PLS150-19-MGD", name: "Mudguard decal", price: 450, cost: 150, stock: 10 },
    ],
    set: {
      sku: "SET-PLS150-19-FULL",
      name: "Pulsar 150 full graphics kit",
      setPrice: 2600,
      componentSkus: [
        "BJJ-PLS150-19-TKL",
        "BJJ-PLS150-19-TKR",
        "BJJ-PLS150-19-STR",
        "BJJ-PLS150-19-MGD",
      ],
    },
  },
  {
    brand: "Yamaha",
    model: "FZ-S V3",
    year: 2020,
    country: "LK",
    parts: [
      { sku: "YMH-FZS3-20-SDL", name: "Side panel left", price: 1200, cost: 410, stock: 5 },
      { sku: "YMH-FZS3-20-SDR", name: "Side panel right", price: 1200, cost: 410, stock: 4 },
      { sku: "YMH-FZS3-20-TNK", name: "Tank pad decal", price: 800, cost: 260, stock: 9 },
    ],
    set: {
      sku: "SET-FZS3-20-FULL",
      name: "FZ-S V3 full graphics kit",
      setPrice: 2900,
      componentSkus: ["YMH-FZS3-20-SDL", "YMH-FZS3-20-SDR", "YMH-FZS3-20-TNK"],
    },
  },
  {
    brand: "TVS",
    model: "Apache RTR 160 4V",
    year: 2021,
    country: "LK",
    parts: [
      { sku: "TVS-APC160-21-TKL", name: "Tank decal left", price: 1050, cost: 360, stock: 6 },
      { sku: "TVS-APC160-21-TKR", name: "Tank decal right", price: 1050, cost: 360, stock: 6 },
      { sku: "TVS-APC160-21-FRG", name: "Fairing graphic", price: 1350, cost: 470, stock: 3, reorderLevel: 3 },
      { sku: "TVS-APC160-21-STR", name: "Racing stripe kit", price: 700, cost: 230, stock: 12 },
    ],
    set: {
      sku: "SET-APC160-21-FULL",
      name: "Apache RTR 160 full graphics kit",
      setPrice: 3700,
      componentSkus: [
        "TVS-APC160-21-TKL",
        "TVS-APC160-21-TKR",
        "TVS-APC160-21-FRG",
        "TVS-APC160-21-STR",
      ],
    },
  },
  {
    brand: "Honda",
    model: "Dio",
    year: 2022,
    country: "LK",
    parts: [
      { sku: "HND-DIO-22-BDL", name: "Body decal left", price: 850, cost: 280, stock: 11 },
      { sku: "HND-DIO-22-BDR", name: "Body decal right", price: 850, cost: 280, stock: 11 },
      { sku: "HND-DIO-22-FRT", name: "Front panel sticker", price: 550, cost: 180, stock: 7 },
    ],
    set: {
      sku: "SET-DIO-22-FULL",
      name: "Dio full body kit",
      setPrice: 2050,
      componentSkus: ["HND-DIO-22-BDL", "HND-DIO-22-BDR", "HND-DIO-22-FRT"],
    },
  },
  {
    brand: "Honda",
    model: "CB125",
    year: 2018,
    country: "LK",
    parts: [
      { sku: "HND-CB125-18-TKL", name: "Tank decal left", price: 950, cost: 320, stock: 4, reorderLevel: 3 },
      { sku: "HND-CB125-18-TKR", name: "Tank decal right", price: 950, cost: 320, stock: 5, reorderLevel: 3 },
      { sku: "HND-CB125-18-MGD", name: "Mudguard decal", price: 450, cost: 150, stock: 9 },
    ],
    set: {
      sku: "SET-CB125-18-FULL",
      name: "CB125 full graphics kit",
      setPrice: 2100,
      componentSkus: ["HND-CB125-18-TKL", "HND-CB125-18-TKR", "HND-CB125-18-MGD"],
    },
  },
];

async function main() {
  console.log("Seeding companies...");
  const kg = await prisma.company.upsert({
    where: { code: "KG" },
    update: {
      footerMessage: "Thank you for choosing Kandy Graphics!",
      warrantyLine: "All sales are final. No returns or exchanges.",
    },
    create: {
      code: "KG",
      name: "Kandy Graphics",
      invoicePrefix: "KG",
      address: "No. 12, Peradeniya Road, Kandy 20000",
      phone: "+94812223456",
      regNo: "PV/00123456",
      active: true,
      footerMessage: "Thank you for choosing Kandy Graphics!",
      warrantyLine: "All sales are final. No returns or exchanges.",
    },
  });
  await prisma.company.upsert({
    where: { code: "UD" },
    update: {
      footerMessage: "Thank you for your purchase!",
      warrantyLine: "All sales are final.",
    },
    create: {
      code: "UD",
      name: "U&D",
      invoicePrefix: "UD",
      address: "No. 12, Peradeniya Road, Kandy 20000",
      phone: "+94812223456",
      active: true,
      footerMessage: "Thank you for your purchase!",
      warrantyLine: "All sales are final.",
    },
  });

  // Backfill any invoices created before multi-company support (old INV-* format) to KG.
  await prisma.invoice.updateMany({
    where: { id: { startsWith: "INV-" } },
    data: { companyId: kg.id },
  });

  console.log("Seeding users...");
  const owner = await prisma.user.upsert({
    where: { email: "owner@shop.lk" },
    update: {},
    create: { name: "Shop Owner", email: "owner@shop.lk", role: Role.OWNER },
  });
  await prisma.user.upsert({
    where: { email: "cashier@shop.lk" },
    update: {},
    create: { name: "Counter Cashier", email: "cashier@shop.lk", role: Role.CASHIER },
  });
  await prisma.user.upsert({
    where: { email: "cutter@shop.lk" },
    update: {},
    create: { name: "Cutting Room", email: "cutter@shop.lk", role: Role.CUTTER },
  });

  console.log("Seeding catalog...");
  for (const m of models) {
    const bikeModel = await prisma.bikeModel.upsert({
      where: {
        brand_model_year_country: {
          brand: m.brand,
          model: m.model,
          year: m.year,
          country: m.country,
        },
      },
      update: {},
      create: { brand: m.brand, model: m.model, year: m.year, country: m.country },
    });

    for (const p of m.parts) {
      // Stock entered correctly: part row + ADJUST txn atomically (CLAUDE.md rule 1)
      await prisma.$transaction(async (tx) => {
        const part = await tx.part.upsert({
          where: { sku: p.sku },
          update: {},
          create: {
            sku: p.sku,
            name: p.name,
            bikeModelId: bikeModel.id,
            price: p.price,
            cost: p.cost,
            finishedStock: p.stock,
            reorderLevel: p.reorderLevel ?? 2,
          },
        });
        const existingTxn = await tx.stockTxn.findFirst({
          where: { partId: part.id, type: TxnType.ADJUST, reference: "SEED" },
        });
        if (!existingTxn && p.stock > 0) {
          await tx.stockTxn.create({
            data: {
              type: TxnType.ADJUST,
              partId: part.id,
              qty: p.stock,
              reference: "SEED",
              userId: owner.id,
            },
          });
        }
      });
    }

    if (m.set) {
      const set = await prisma.stickerSet.upsert({
        where: { sku: m.set.sku },
        update: {},
        create: {
          sku: m.set.sku,
          name: m.set.name,
          bikeModelId: bikeModel.id,
          setPrice: m.set.setPrice,
        },
      });
      for (const compSku of m.set.componentSkus) {
        const part = await prisma.part.findUniqueOrThrow({ where: { sku: compSku } });
        await prisma.setComponent.upsert({
          where: { setId_partId: { setId: set.id, partId: part.id } },
          update: {},
          create: { setId: set.id, partId: part.id, qty: 1 },
        });
      }
    }
  }

  console.log("Seeding sample customers...");
  const customers = [
    { name: "Kasun Perera", phone: "+94771234567", bikeInfo: "Bajaj Pulsar 150 2019" },
    { name: "Nuwan Silva", phone: "+94712345678", bikeInfo: "Yamaha FZ-S V3 2020" },
    { name: "Dilani Fernando", phone: "+94765432109", bikeInfo: "Honda Dio 2022" },
  ];
  for (const c of customers) {
    await prisma.customer.upsert({
      where: { phone: c.phone },
      update: {},
      create: c,
    });
  }

  const counts = {
    companies: await prisma.company.count(),
    models: await prisma.bikeModel.count(),
    parts: await prisma.part.count(),
    sets: await prisma.stickerSet.count(),
    txns: await prisma.stockTxn.count(),
    customers: await prisma.customer.count(),
  };
  console.log("Seed complete:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
