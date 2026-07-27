# SPEC.md — Bike Sticker POS & Inventory System

## 1. Business context

A shop that designs, prints, cuts, and sells motorcycle decal stickers.

- Catalog is organized: **Brand → Model → Year (+ country/market version) → parts and full sets**
- A **full set** (e.g. "CB125 full graphics kit") is a bundle of individual **parts**
  (tank left, tank right, mudguard, etc.). Customers buy either a full set or single parts.
- Manufacturing is **gang-printed**: one printed sheet contains parts for *different*
  bikes mixed together (cost-effective layout). Sheets are stored uncut in racks,
  then cut on demand and issued to the sales counter.

## 2. Two-level stock model (core concept)

1. **Uncut sheet stock (WIP)** — tracked by sheet, stored in coded rack locations.
2. **Finished goods stock** — tracked per part SKU, sellable at POS.

A part's total availability = `finishedStock` + SUM(`remainingQty`) across live sheets.
The POS shows both: "Ready: 4 | Uncut: 12 (R03-S02)".

### Print layouts
A PrintLayout is a reusable recipe: which parts and how many fit on one sheet.
Printing N copies of a layout creates N Sheet records (or one batch — see batch trick),
each initialized with SheetContent rows (remainingQty = printedQty).

### Sheets & barcodes
Every sheet gets an ID `SH-YYYY-NNNNN` printed as a Code 128 barcode label showing
layout code, content summary, and print date. Optional batch mode: one record with
quantity for stacks of identical sheets (less scanning, slightly less precision).

### Rack locations
Coded `R03-S02-B05` (rack-shelf-slot). Slot labels are barcodes too.
Storing = scan sheet, scan slot. Tip: keep all copies of one layout in the same slot.
Start at rack+shelf granularity; add slot level only if needed.

### Cut & issue (handles PARTIAL cutting — critical)
Workers often cut only some parts from a sheet and return the rest to the rack.
Flow: scan sheet → system shows remaining contents → worker enters what was cut →
in ONE transaction: SheetContent.remainingQty decreases, Part.finishedStock increases,
StockTxn CUT_ISSUE rows written, sheet status updated (PARTIAL or CONSUMED;
CONSUMED frees the location). Issued stacks get part-SKU barcode labels.

## 3. Selling sets — two modes (support both)

- **Virtual set (default):** selling deducts each component part's finishedStock.
  Availability = min over components. Maximum flexibility.
- **Pre-packed set (kitting):** KIT transaction converts component parts into
  packedStock of the set (physical sleeves with a set barcode). UNKIT reverses.

## 4. POS sale screen (already prototyped — match this behavior)

- One search box: barcode scanner types SKU + Enter → exact match adds to cart
  instantly; free text searches name/model/SKU. No separate scan mode.
- Product cards show: part/set badge, price, Ready stock (color-coded:
  red 0, amber <3), Uncut count for parts.
- Cart: qty +/-, per-line and whole-sale discount, blocks qty above availability.
- Set lines note "(deducts each component part)".
- Payments: cash, card, bank transfer, split. Hold/park sale. Returns reverse
  stock against an invoice number.
- On payment: atomic transaction → invoice + items + stock deductions + StockTxn SALE
  rows. Then receipt print (80mm print CSS; QZ Tray for silent ESC/POS later)
  and WhatsApp PDF option (WhatsApp Business Cloud API, later phase).

## 5. Stock transactions (audit log)

Types: PRINT, CUT_ISSUE, KIT, UNKIT, SALE, RETURN, ADJUST, DAMAGE.
Every stock number must be explainable from this log (theft/miscount detection).
UUID ids (idempotency-ready for the future offline queue). Monthly reconciliation
report: stored stock vs txn-derived stock.

## 6. Finding stickers (search answers both pools)

"Where are CB125 tank stickers?" →
Finished: 4 pcs at counter. Uncut: 12 across sheets SH-…, grouped by location.

## 7. Other features

- Customer DB with their bike(s) saved → repeat sales, SMS/WhatsApp promos.
- Custom order module: design approval, advance payment, balance, due date.
- Fitment search: "everything that fits a 2020 FZ-S".
- Photo per part/set (designs are visual — thumbnails in POS search).
- Reports: daily sales, best sellers, profit (OWNER only), dead stock,
  layout profitability (which gang layouts sell through vs leave parts stuck uncut),
  wastage %, salesperson performance.
- Roles: OWNER / CASHIER / CUTTER (cashier never sees cost prices).
- Stocktake mode: scan slot → count sheets → flag mismatches.
- Low-stock alerts on reorderLevel.

## 8. Offline emergency mode (later phase — design for it now)

PWA: cache catalog in IndexedDB; if network drops, keep selling from cache and
queue completed sales locally (UUID idempotent), flush on reconnect.
This is why StockTxn uses UUIDs from day one.

## 9. Build status

### ✅ Complete

**Auth & roles**
Supabase Auth + `public.User` two-table sync. Middleware enforces active-row check;
missing row → signout + "Account not provisioned". Three roles: OWNER (everything),
CASHIER (POS, no cost prices), CUTTER (cut & issue only — not yet surfaced in UI).
Admin user management at `/settings`. Seeding via `npm run seed:auth` (resets all
passwords — do not run in production after passwords have been changed).

**Catalog**
BikeModels (brand/model/year/country). Parts and StickerSets: CRUD, activate/deactivate,
images via Supabase Storage, SKU auto-suggestion (skuGen). Adjust-stock modal writes
StockTxn ADJUST row in the same transaction. A4 + thermal barcode label printing via
bwip-js. Rack/shelf location tags shown in catalog and on POS cards.

**Rack/shelf locations**
`Location` table (code PK, optional rack/shelf/bin breakdown, description, active flag).
Optional `locationCode` FK on `Part` and `StickerSet`. Location picker combobox (pick
existing or create inline). Location column in Parts/Sets catalog tables. `📍 A-1` tag
on POS product cards. Location barcode labels via the existing label print flow.
Location management tab in Catalog (create, edit, deactivate, delete, print label).

**POS**
Index-backed search (<100 ms, raw SQL, keyset cursor pagination, limit 30). Product
cards: part/set badge, price, ready stock (colour-coded), uncut count, location tag.
One search box handles both typed search and barcode scanner (scanner types SKU + Enter
→ exact match added instantly). Cart: qty ±, per-line and whole-sale discount, blocks
over-availability. Payment: cash tender with change, card (last 4 + EDC ref), bank
transfer (ref), split. Hold/park sales. Set detail modal. Manager auth modal for
discounts. Company KG/UD toggle.

**Sales, invoices & returns**
`saleService.completeSale`: per-company per-year invoice ID inside `$transaction`, stock
deductions, StockTxn SALE rows, `unitCost` snapshot. Invoice list + detail. Partial
returns with manager auth (`returnService.processReturn`) — multiple partial returns per
invoice, each with its own reason and authorizer.

**Multi-company invoicing**
Company table (KG, UD). Per-company per-year invoice sequences (KG-2026-NNNNN,
UD-2026-NNNNN). KG/UD segmented control in POS cart header (sticky last choice).
Returns inherit original invoice's company. Receipts render issuing company's details.

**Receipts & printing**
80 mm print-CSS receipt: company logo (greyscale, thermal-safe), company name/address/
reg no/footer/warranty line, items, discount line, delivery fee line, payment method.
Auto-print on sale; reprint from invoice detail. WhatsApp link placeholder.

**Shipping labels**
100 × 150 mm print CSS. Company logo + ship-from details. Delivery address snapshot.
Linked from receipt toolbar on delivery orders.

**Company logos**
`logoUrl` on Company record. Upload via Settings (multipart → Supabase Storage
`logos/companies/{id}/logo.{ext}`). Shown on receipts (greyscale CSS for thermal) and
shipping labels.

**Manager authorization**
`ManagerAuthorization` one-time grants (5 min TTL). `POST /api/auth/authorize` re-checks
manager password via throwaway Supabase client (never touches cashier session).
`consumeAuthorizationGrant` row-locks and consumes inside the sale/return/credit
`$transaction`. Configurable `discountApprovalThresholdPct` in Settings (default 0).

**Customer module**
Customer DB (name, phone, address, bike info, notes). Customer picker in POS
(`CustomerPicker` combobox). Customer list + detail page with invoice history and
credit ledger. Credit settings modal (enable/disable, limit).

**Delivery orders**
`orderType` COUNTER / DELIVERY. Delivery section in POS: customer required, address
form, delivery fee (> 0 enforced server-side). `deliveryStatus` TO_PACK → PACKED →
SHIPPED → DELIVERED, advanced via PATCH. `deliveryFee` excluded from `Invoice.total`
and all sales/profit aggregates.

**Credit (accounts receivable)**
`CustomerLedger` append-only ledger (CREDIT_SALE / PAYMENT / ADJUSTMENT). `balance`
always reconcilable from ledger. CREDIT payment method in POS (no cash collected).
`isCreditAvailable` single eligibility formula. Record-payment flow: OWNER direct,
CASHIER needs manager auth grant (`credit_payment` action). Receivables snapshot
report (no date/company filter — credit has no company dimension).

**Reports**
Daily summary (sales, cash collected, credit, delivery fees, profit ~approx),
best sellers, dead stock, low stock, discounts log, refunds log, payment mix,
by-company breakdown, daily trend chart, receivables. Profit uses `unitCost` snapshot;
falls back to current `Part.cost` with "~approx" label for pre-snapshot rows.

**Settings**
Company name/address/phone/reg no/footer/warranty/logo per company. Discount approval
threshold. Label stock dimensions (width, height, gap) for thermal rolls.

### ⏳ Next: Phase 2 — sheets & cut-issue

The schema (`PrintLayout`, `LayoutItem`, `Sheet`, `SheetContent`) is already defined.
Nothing in this layer has been built yet:

- **Print layouts** — create/edit layouts specifying which parts and how many fit on
  one printed sheet. Layout barcode labels.
- **Sheet creation** — printing N copies of a layout creates N `Sheet` records
  (`SH-YYYY-NNNNN` ID, barcode sticker). Batch mode (one record + quantity) as option.
- **Rack storage** — scan sheet barcode + scan location barcode to assign/move sheets.
- **Cut & issue screen** (`/cut-issue`, CUTTER role) — scan sheet → see remaining
  contents → enter how many of each part were cut → one transaction: decrement
  `SheetContent.remainingQty`, increment `Part.finishedStock`, write StockTxn
  CUT_ISSUE rows, auto-CONSUMED when all remaining hit zero.
- **Kitting** — KIT transaction: deduct component parts → increment `packedStock`
  on the set. UNKIT reverses. Barcode label for the pre-packed sleeve.

### 🔮 Later phases

- Stocktake mode (scan slot → count sheets → flag mismatches)
- Custom orders (design approval, advance payment, due date)
- WhatsApp PDF invoice (WhatsApp Business Cloud API)
- PWA offline queue (IndexedDB catalog cache, UUID-idempotent sale queue, flush on reconnect)
- SMS/WhatsApp marketing promos
- Salesperson performance report
- Layout profitability report (which gang layouts sell through vs leave parts stuck)

## 10. Locale

Sri Lanka: LKR currency, DD/MM/YYYY, Asia/Colombo. UI in English (Sinhala later maybe).

## 11. Multi-company invoicing

The business operates two registered companies selling from one shop and one
shared stock pool: Kandy Graphics (prefix KG) and U&D (prefix UD).

- Company table: code, name, invoicePrefix, address, phone, regNo, active.
  Built as data, not constants — a third company must require zero code changes.
- Which company a sale bills under is the cashier's decision, made via a
  segmented KG/UD control in the cart header. The control is always visible,
  defaults to the last-used company, and the chosen company appears on the
  sale confirmation and receipt.
- Invoice numbering: independent per-company per-year sequences
  (KG-2026-00123, UD-2026-00045), generated atomically inside the sale txn.
- Returns/refunds inherit the original invoice's company automatically.
- Receipts and invoice PDFs render the issuing company's name, address,
  phone, and registration number from the Company record.
- Reporting: every sales report filters All / KG / UD; daily summary shows
  per-company totals plus combined. Stock and manufacturing views have no
  company filter — inventory is shared by design and must stay that way.
- Existing invoices from before this feature are backfilled to KG.

## 12. Key technical decisions & gotchas

These are non-obvious choices made during implementation that future work must respect.

### Migration discipline
Prisma migrations (`prisma migrate`) are **not used**. All schema changes are:
1. Applied as raw SQL in `prisma/migrations/NNN_name.sql` (via `psql` or Supabase Studio).
2. Reflected in `prisma/schema.prisma` for type generation only.
3. Followed by `npx prisma generate` to regenerate the client.
On Windows, stop the Next.js dev server before running `prisma generate` — the query
engine DLL is file-locked while the server runs and the rename step will fail (EPERM).

### POS search uses raw SQL — new columns need manual updates in three places
`app/api/pos/search/route.ts` bypasses Prisma's ORM layer and uses `$queryRaw` for
the <100 ms target. Adding a new column from `Part` or `StickerSet` to search results
requires editing: (1) the SQL SELECT, (2) the `RawPartRow`/`RawSetRow` TS type,
(3) the result-mapping object. The same applies to `app/api/pos/set/[id]/route.ts`
for the set detail modal.

### Thermal printer logo rendering
CSS `brightness(0)` on a logo image collapses it to solid black on thermal printers —
the print head sees maximum dot density everywhere. The correct filter for thermal
greyscale receipts is `filter: grayscale(1)` only. `<img>` elements are foreground
content and always print regardless of browser "Background graphics" setting.

### Barcode scanner Enter-suffix requirement
The POS search box is the scan target. Scanners must be configured with a single
Enter (`\n`) suffix — this is what fires the exact-SKU match in `PosShell.tsx` that
auto-adds the item. Scanners with Tab, no suffix, or multi-character suffixes will
not trigger the auto-add. Sheet and location barcodes follow the same rule.

### Location codes are string primary keys, not numeric IDs
`Location.code` (e.g. "A-1") is the `@id`. The FK on `Part` and `StickerSet` uses
`ON UPDATE CASCADE ON DELETE SET NULL` written in the SQL migration, not in Prisma
schema (Prisma doesn't emit these clauses for FK constraints). Renaming a location
code in SQL cascades correctly; the API prevents deletion when products are assigned.

### Delivery fee is never added to Invoice.total
`Invoice.total` = product sales only. `Invoice.deliveryFee` is a separate Decimal
column. Customer pays `total + deliveryFee`, computed at display time (receipt, POS,
invoice detail). Reports read the two columns separately — never aggregate them
together. This is enforced in `saleService.completeSale`.

### Credit balance = `total + deliveryFee` (not total alone)
When paying by CREDIT, the full amount the customer owes — including delivery — is
debited to `Customer.balance`. This mirrors what a cash customer pays at the door.
`isCreditAvailable` in `lib/utils/credit.ts` is the single source of truth for
eligibility; never reimplement the formula elsewhere.

### `unitCost` is nullable; profit figures may be approximate
`InvoiceItem.unitCost` was added after initial invoices were created. Rows without a
snapshot fall back to current `Part.cost` for profit estimates. The UI must label
any such figure "~approx". Never silently omit these rows from profit totals.

### `seed:auth` resets all passwords, not just new accounts
`npm run seed:auth` (`scripts/seedAuth.ts`) iterates every `public.User` row and
resets their Supabase Auth password to the hardcoded default. Running it on a live
environment after real passwords have been set will lock out real users.
