import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../db';
import type { LabelFormat } from '../utils/printLabels';

const DISCOUNT_THRESHOLD_KEY = 'discountApprovalThresholdPct';
const DEFAULT_THRESHOLD_PCT = 0; // all discounts need approval until the owner raises this

const LABEL_STOCK_KEY = 'labelStock';
const LABEL_FORMAT_KEY = 'labelFormat';

/**
 * The shop has one physical label printer (Zebra ZD230, 50x25mm, 2-across), so
 * thermal is the correct default rather than A4. This also preserves the
 * owner's existing choice during the move off per-browser storage: the setting
 * previously lived in localStorage, so there is no row to migrate, and
 * defaulting to A4 here would silently flip every till to the wrong format.
 */
const DEFAULT_LABEL_FORMAT: LabelFormat = 'thermal';

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

// ── Label format ────────────────────────────────────────────────────────────────

/**
 * Which stock labels are printed on — a fact about the shop's hardware, not a
 * per-user preference, so it lives in AppSetting alongside the stock dimensions
 * rather than in each browser's localStorage (where a new account never found
 * it and silently fell back to A4).
 *
 * AppSetting is a key/value table, so adding this key needed no migration.
 */
export async function getLabelFormat(db: Db = defaultPrisma): Promise<LabelFormat> {
  const row = await db.appSetting.findUnique({ where: { key: LABEL_FORMAT_KEY } });
  // 'roll' is the legacy name for 'thermal'; anything unrecognised falls back.
  if (row?.value === 'a4') return 'a4';
  if (row?.value === 'thermal' || row?.value === 'roll') return 'thermal';
  return DEFAULT_LABEL_FORMAT;
}

export async function setLabelFormat(
  format: LabelFormat,
  db: PrismaClient = defaultPrisma,
): Promise<void> {
  await db.appSetting.upsert({
    where: { key: LABEL_FORMAT_KEY },
    create: { key: LABEL_FORMAT_KEY, value: format },
    update: { value: format },
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
