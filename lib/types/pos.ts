// Shared types consumed by both the /api/pos/* route handlers and the
// /pos client page.  Kept in lib/ so client components can import them without
// pulling in any server-only route-handler code.

export type BikeModelInfo = {
  brand: string;
  model: string;
  year: number;
  yearEnd: number | null;
  country: string | null;
};

export type PartResult = {
  type: 'part';
  id: number;
  sku: string;
  name: string;
  bikeModel: BikeModelInfo;
  /**
   * Shown on the product card and cart line. Hundreds of products share a name
   * ("Full Set", "Tank left"); bike model and colour are what tell them apart,
   * so the till needs both to avoid selling the wrong variant.
   */
  color: string | null;
  price: string;
  /** Included only when the authenticated user is OWNER; null for CASHIER. */
  cost: string | null;
  finishedStock: number;
  reorderLevel: number;
  /** Sum of SheetContent.remainingQty across all live sheets for this part. */
  uncutQty: number;
  imageUrl: string | null;
  soldSeparately: boolean;
  exactMatch: boolean;
  locationCode: string | null;
};

export type SetResult = {
  type: 'set';
  id: number;
  sku: string;
  name: string;
  bikeModel: BikeModelInfo;
  /** See PartResult.color — kits collide on name even more than parts do. */
  color: string | null;
  price: string;
  imageUrl: string | null;
  packedStock: number;
  /**
   * The set's own sellable quantity — equals packedStock. A packed kit is a
   * physical item with its own count and is NOT assembled from component part
   * stock at sale time. See lib/utils/setAvailability.ts.
   */
  availability: number;
  exactMatch: boolean;
  locationCode: string | null;
};

export type PosSearchResult = PartResult | SetResult;

export type PosSearchResponse = {
  items: PosSearchResult[];
  /** Opaque cursor for the next page; null when this is the last page. */
  nextCursor: string | null;
  /** Total items matching the current filters (independent of pagination position). */
  totalCount: number;
  /** The trimmed query string that produced these results. */
  query: string;
};

// ─── Filters ──────────────────────────────────────────────────────────────────

export type BrandModel = {
  id: number;
  model: string;
  year: number;
  yearEnd: number | null;
};

export type BrandEntry = {
  brand: string;
  models: BrandModel[];
};

export type FiltersResponse = {
  brands: BrandEntry[];
};

// ─── Set detail (for the set detail modal) ────────────────────────────────────

export type SetComponentDetail = {
  qty: number;
  part: {
    id: number;
    sku: string;
    name: string;
    imageUrl: string | null;
    finishedStock: number;
    reorderLevel: number;
    price: string | null; // null when the component part has no price set
  };
};

export type SetDetailResult = {
  id: number;
  sku: string;
  name: string;
  bikeModel: BikeModelInfo;
  /** Carried so a kit added from this modal reaches the cart with its colour. */
  color: string | null;
  price: string;
  imageUrl: string | null;
  packedStock: number;
  availability: number;
  locationCode: string | null;
  components: SetComponentDetail[];
  /** Paise saved vs buying components individually. null when no saving. */
  savingsPaise: number | null;
};
