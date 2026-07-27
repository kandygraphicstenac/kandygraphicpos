import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../db';

const DISCOUNT_THRESHOLD_KEY = 'discountApprovalThresholdPct';
const DEFAULT_THRESHOLD_PCT = 0; // all discounts need approval until the owner raises this

const LABEL_STOCK_KEY = 'labelStock';

type Db = PrismaClient | Prisma.TransactionClient;

// ── Label stock settings ────────────────────────────────────────────────────────

export type LabelStockSettings = {
  /** Individual label width in mm (e.g. 50 for Zebra ZD230) */
  widthMm: number;
  /** Individual label height in mm (e.g. 25 for Zebra ZD230) */
  heightMm: number;
  /** Labels per row — 2 means "2-across" stock */
  columns: number;
  /** Horizontal gap between columns in mm */
  columnGapMm: number;
  /** Inner padding inside each label in mm */
  paddingMm: number;
};

export const DEFAULT_LABEL_STOCK: LabelStockSettings = {
  widthMm: 50,
  heightMm: 25,
  columns: 2,
  columnGapMm: 2,
  paddingMm: 1,
};

export async function getLabelStockSettings(db: Db = defaultPrisma): Promise<LabelStockSettings> {
  const row = await db.appSetting.findUnique({ where: { key: LABEL_STOCK_KEY } });
  if (!row) return DEFAULT_LABEL_STOCK;
  try {
    return { ...DEFAULT_LABEL_STOCK, ...(JSON.parse(row.value) as Partial<LabelStockSettings>) };
  } catch {
    return DEFAULT_LABEL_STOCK;
  }
}

export async function setLabelStockSettings(
  settings: LabelStockSettings,
  db: PrismaClient = defaultPrisma,
): Promise<void> {
  await db.appSetting.upsert({
    where: { key: LABEL_STOCK_KEY },
    create: { key: LABEL_STOCK_KEY, value: JSON.stringify(settings) },
    update: { value: JSON.stringify(settings) },
  });
}

/** Discount % above which manager authorization is required. Default 0 = every discount needs approval. */
export async function getDiscountApprovalThresholdPct(db: Db = defaultPrisma): Promise<number> {
  const row = await db.appSetting.findUnique({ where: { key: DISCOUNT_THRESHOLD_KEY } });
  if (!row) return DEFAULT_THRESHOLD_PCT;
  const n = parseFloat(row.value);
  return Number.isFinite(n) ? n : DEFAULT_THRESHOLD_PCT;
}

export async function setDiscountApprovalThresholdPct(
  pct: number,
  db: PrismaClient = defaultPrisma,
): Promise<void> {
  await db.appSetting.upsert({
    where: { key: DISCOUNT_THRESHOLD_KEY },
    create: { key: DISCOUNT_THRESHOLD_KEY, value: String(pct) },
    update: { value: String(pct) },
  });
}
