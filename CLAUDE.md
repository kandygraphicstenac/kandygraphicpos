# CLAUDE.md — Bike Sticker POS

Web POS + inventory system for a bike sticker (motorcycle decal) shop in Sri Lanka.
Full-cloud architecture. Read SPEC.md for complete business logic before building any feature.

## Stack

- Next.js (App Router) + TypeScript (strict mode)
- Prisma + PostgreSQL (Supabase) — schema already defined in `prisma/schema.prisma`
- Tailwind CSS
- Built as a PWA (offline emergency mode comes in a later phase — design with it in mind)
- Deploy target: Vercel or small VPS

## Hard rules

1. **Every stock-changing operation runs inside a single `prisma.$transaction`** that
   writes (a) the stock field update, (b) the `StockTxn` audit row(s), and
   (c) any invoice/sheet rows — atomically. Never update a stock number without
   a matching `StockTxn` row. Stock must always be reconstructable from the txn log.
2. **Money is `Decimal`**, never `number` floats. Use Prisma Decimal; format with
   `Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' })` in the UI.
3. **A StickerSet has its OWN stock — `packedStock` — and parts and sets are
   independent stock pools.** Everything is printed on sheets and held as uncut
   stock; from there the shop packs EITHER loose parts OR a complete kit, so a
   packed kit is a physical item with its own count, not something assembled
   from loose selling stock at sale time. Therefore:
   - Set availability = `StickerSet.packedStock`, never derived from components.
     `lib/utils/setAvailability.ts` is the single source of truth — the POS gate,
     the catalog list, and the `saleService` guard all call it. Never re-implement
     the formula inline (including in the POS raw SQL).
   - Selling a set decrements `packedStock` and writes a SALE `StockTxn` carrying
     `setId`; it **never** touches any component part's `finishedStock`.
     Returns mirror this against `packedStock`.
   - `SetComponent` rows are a **reference/contents list only** — they say what's
     inside the kit for staff, and are read at sale time solely to snapshot
     `InvoiceItem.unitCost`. They do not affect stock or availability.
   - `StockTxn` identifies what moved via exactly one of `partId` / `setId` /
     `sheetId`.
4. **Partial cutting:** issuing from a sheet decrements `SheetContent.remainingQty`
   and increments `Part.finishedStock`. When all remainingQty on a sheet hit 0,
   set sheet status to CONSUMED and clear its location. If some remain, status PARTIAL.
5. **Never oversell:** validate stock inside the transaction (re-read with
   `SELECT ... FOR UPDATE` semantics / Prisma interactive transaction), not just in the UI.
6. SKUs double as barcode values (Code 128). Sheet IDs (`SH-YYYY-NNNNN`) are also barcodes.
7. Invoice IDs are sequential per year: `INV-YYYY-NNNNN`. Generate inside the transaction.
8. All list endpoints paginate. POS search endpoint must answer in <100ms:
   index-backed `contains` on sku/name/model, limit 30.
9. **Multi-company invoicing, shared stock.** The shop operates two companies
   (Kandy Graphics "KG", U&D "UD" — Company table, extensible). Companies exist
   ONLY at the invoice layer: every Invoice has a required companyId, and invoice
   numbers are per-company per-year sequences `{prefix}-{YYYY}-{NNNNN}` generated
   inside the sale transaction. Stock, catalog, sheets, and StockTxns are shared
   and have NO company dimension — never add one. The cashier chooses the company
   per sale via the POS toggle (sticky last choice); returns always inherit the
   original invoice's company. Receipts render the company's own header details
   from the DB. Sales reports support per-company and combined views; stock
   reports are company-agnostic.

## Conventions

- Route handlers under `app/api/*` return typed JSON; validate every body with Zod.
  Shared Zod schemas live in `lib/validators/`.
- Server-only logic (stock services) in `lib/services/` — e.g. `saleService.ts`,
  `cutIssueService.ts`, `kitService.ts`. Route handlers stay thin.
- Auth: Supabase Auth. Roles: OWNER (everything), CASHIER (POS, no cost prices),
  CUTTER (cut & issue + sheets only). Enforce role checks server-side in services.
- UI components in `components/`, pages: `/pos`, `/cut-issue`, `/sheets`, `/catalog`,
  `/reports`, `/settings`.
- Barcode generation: `bwip-js`. Receipt printing: print-CSS first (80mm), QZ Tray later.
- Use Sri Lanka locale defaults: currency LKR, date format DD/MM/YYYY, timezone Asia/Colombo.

## Auth / user sync

Users live in **two tables linked by email** — Supabase `auth.users` (login/password) and
`public.User` (role, active flag). Every user create/deactivate must keep both in sync via
the service-role admin client (`lib/supabase/admin.ts`). Never trust a Supabase session
without a matching active `User` row. A session with no active row triggers signout +
"Account not provisioned" at the login page. Use `npm run seed:auth` to create auth
accounts for existing `public.User` rows.

**Caution:** `npm run seed:auth` resets the password for *every* seeded account back to
its hardcoded default (see `DEFAULT_PASSWORDS` in `scripts/seedAuth.ts`), including
real accounts like the owner's actual login — not just newly created ones. Don't run it
on an environment where passwords have since been changed. When verifying auth manually,
prefer signing in with existing known credentials over re-running the seed.

## Profit / cost tracking

10. **`InvoiceItem.unitCost` is snapshotted at sale time** inside `saleService.completeSale`:
    - Part lines: snapshot `Part.cost` at the moment of sale.
    - Set lines: snapshot the sum of `(component.cost × component.qty)` for all set components;
      set to `null` if any component lacks a cost.
    - `unitCost` is nullable — rows created before this rule was added have `null`.
    - Profit = `SUM(lineTotal − unitCost × qty)`. For rows with `null unitCost`, fall back to
      the current `Part.cost` (approximate). Always label such profit figures "~approx" in the UI.
    - Never compute profit by loading invoice rows into the application layer — use SQL aggregates.

## Manager authorization

Discounts and refunds require manager authorization (password + reason), re-verified
server-side in `saleService`/`returnService` — never trust a client-supplied authorizer id.
Reasons are stored and reported. Mechanics: `POST /api/auth/authorize` re-checks the password
against active OWNER accounts via a throwaway Supabase Auth client (never touches the
cashier's session) and returns a one-time, 5-minute `ManagerAuthorization` grant id. The
service layer (`consumeAuthorizationGrant`) row-locks and consumes that grant inside the same
`$transaction` as the sale/return, reading `authorizedById` and `reason` back from the grant
row — not from the request body. A discount needs a grant whenever its percentage exceeds
`AppSetting.discountApprovalThresholdPct` (default 0 — every discount needs approval; raise it
in Settings) or whenever a flat `discountAmt` is used. Every refund always needs a grant,
recorded on its own `Return` row (`refundReason`, `refundAuthorizedById`) since one invoice can
have multiple partial returns over time.

## Customers / delivery

Every sale has an explicit `orderType` (`COUNTER` | `DELIVERY`), chosen by the cashier at the
start of the sale in the POS. `COUNTER` is the unchanged fast walk-in flow — customer optional,
no delivery fields. `DELIVERY` requires a customer, a delivery address, and a delivery fee
greater than zero before the sale can complete — the POS disables the payment buttons until all
three are set, and `saleService.completeSale` re-validates the same requirement server-side
(never trust the client-side gate alone). Delivery fee/address are exclusively a delivery-order
concept — a `COUNTER` sale never carries them. Delivery orders get a `deliveryStatus`
(`TO_PACK` → `PACKED` → `SHIPPED` → `DELIVERED`), defaulted to `TO_PACK` at sale time and advanced
via `PATCH /api/invoices/[id]/delivery-status`; `COUNTER` invoices always have `deliveryStatus
= null`. Advancing status is a plain `prisma.invoice.update` (not stock-changing, no
`$transaction`/`StockTxn` needed) and any value in the flow may be set so a mistake can be
corrected, though the UI only ever exposes the next step.

Delivery fee is pass-through, never counted as sales or profit. Customer is optional on every
counter sale; walk-in is default there. Delivery address is snapshotted on the invoice. Mechanics:
`Invoice.total` is product sales only — `completeSale` never adds `deliveryFee` to it.
`Invoice.deliveryFee` is a separate `Decimal` column; the customer pays `total + deliveryFee`,
computed at display time (receipt, invoice detail, POS), never persisted as a third stored
total. Reports read `total` for Sales/Profit and `deliveryFee` separately for the "Delivery
collected" line — the two must never be summed together in the same aggregate. `customerId` is
nullable on every Invoice; no UI may force customer selection before a sale can complete.
`Invoice.deliveryAddress` (Json) is captured from the POS form at sale time and is independent
of the `Customer` record — editing a customer's address later never changes past invoices'
shipping labels or delivery snapshots.

## Credit (accounts receivable)

Credit sales increase customer balance via a ledger row; payments decrease it via a ledger
row; balance must always reconcile from `CustomerLedger`. Credit sales are sales but not cash
collected — keep receivable separate from cash in all money reports.

Mechanics: `Customer.creditEnabled`/`creditLimit`/`balance` plus the append-only
`CustomerLedger` table (`CREDIT_SALE` | `PAYMENT` | `ADJUSTMENT`, signed `amount`) apply the
same discipline as `StockTxn` — every balance change writes a matching ledger row in the same
`$transaction`, never a bare `balance` update. `PaymentMethod.CREDIT` on an `Invoice` means no
cash was captured for that sale; `saleService.completeSale` row-locks the `Customer` (mirrors
the `Part` `FOR UPDATE` pattern), re-validates `creditEnabled` and `balance + (total +
deliveryFee) <= creditLimit` (no limit = unlimited) server-side — the POS only shows the Credit
button when eligible, but that's UX only. The full `total + deliveryFee` is charged to the
balance, since neither is collected as cash on credit. `lib/utils/credit.ts` (`isCreditAvailable`)
is the single eligibility formula shared by the POS gate and its last-chance guard — never
duplicate it. Recording a payment (`creditService.recordPayment`) decrements balance and writes
a `PAYMENT` row atomically; overpayment beyond the current balance is blocked, not allowed
negative. OWNER may record a payment directly; any other role must clear a manager
authorization grant first (action `credit_payment`), consumed server-side exactly like
discount/refund grants — never trust a client-supplied authorizer id. Outstanding-balance
reporting (`/api/reports/receivables`) is a point-in-time snapshot, not a period report — it
has no date or company filter, since stock/customers/credit have no company dimension (see
above).

## Testing

- Vitest. Every service in `lib/services/` gets unit tests covering: overselling blocked,
  set sale deducts the set's own `packedStock` and leaves component parts untouched,
  partial cut math, sheet auto-CONSUMED, txn log written.

## Migration pattern

**We do NOT use `prisma migrate`.** Schema changes are applied as raw SQL files:

1. Edit `prisma/schema.prisma` to match the intended end-state.
2. Write the DDL change as `prisma/migrations/NNN_short_name.sql`.
3. Apply to the DB: `psql $DATABASE_URL -f prisma/migrations/NNN_short_name.sql`
   (or paste into Supabase Studio → SQL editor).
4. Regenerate the client: `npx prisma generate`
   — **stop the Next.js dev server first on Windows** (the query engine DLL is locked
   while the server runs; `generate` will fail with EPERM rename).

Prisma FK constraint directives (`onUpdate`/`onDelete`) are limited. When you need
`ON UPDATE CASCADE ON DELETE SET NULL` (e.g. Location → Part FK) put it directly in
the SQL migration — Prisma's client still reflects the correct field types.

## Rack/shelf locations

`Location.code` (e.g. "A-1") is the **primary key** — a string code, not a numeric id.
The `locationCode` FK on `Part` and `StickerSet` uses `ON UPDATE CASCADE ON DELETE SET NULL`
enforced in the SQL migration (`003_part_location.sql`), not in Prisma schema.
The API `DELETE /api/locations/[code]` blocks deletion when any Part, StickerSet, or Sheet
still references it — surface that error rather than cascading a delete.

## POS search raw SQL rule

`app/api/pos/search/route.ts` uses `prisma.$queryRaw` for performance (<100 ms).
Any new column added to `Part` or `StickerSet` that should appear in POS search results
**must be added in three places manually**:
1. The `SELECT` clause in the relevant raw SQL query.
2. The `RawPartRow` or `RawSetRow` TypeScript type in that file.
3. The result-mapping object (`partResults` / `setResults`).
This also applies to `app/api/pos/set/[id]/route.ts` if the field is needed in the
set detail modal.

## Barcode scanner behaviour

The POS search box doubles as the scan target. Scanners must be configured to:
- Emit the barcode value as keystrokes, **no prefix**.
- Append a single **Enter** (`\n`) suffix — this triggers the exact-SKU match
  in `PosShell.tsx` which instantly adds the item without requiring a click.
- If a scanner is configured with Tab or another suffix, auto-add will not trigger.
Sheet barcodes (`SH-YYYY-NNNNN`) and location barcodes are also Code 128
and will be handled by whichever screen is active at scan time.

## Thermal receipt / label printing gotchas

- **Never apply `brightness(0)` or high `contrast()` CSS filters to logos on receipts.**
  These collapse the image to a solid black rectangle on thermal printers.
  The correct rule is `@media print { .receipt-logo { filter: grayscale(1); } }` — 
  greyscale only, so the thermal head renders actual dots.
- `<img>` elements are foreground content and print regardless of the browser's
  "Background graphics" toggle — the toggle only affects CSS backgrounds.
- Label printing uses a hidden `<iframe>` (`printViaIframe` in `lib/utils/printLabels.ts`).
  The iframe loads `/catalog/labels?...` which auto-triggers `window.print()` via `<AutoPrint>`.
  The iframe is cleaned up after `afterprint` fires or after a 60 s fallback.
- Thermal label dimensions are stored in `AppSetting` (`labelWidth`, `labelHeight`,
  `labelGap`) and read via `getLabelStockSettings()` in `settingsService.ts`.

## Build status

Features **complete and in production use**:

- **Auth & roles** — Supabase Auth + `public.User` two-table sync, middleware, 3 roles
  (OWNER / CASHIER / CUTTER), admin user management (`/api/admin/users`), login page,
  "Account not provisioned" guard. `scripts/seedAuth.ts` (`npm run seed:auth`).
- **Catalog** — BikeModels, Parts, StickerSets (CRUD, activate/deactivate, images via
  Supabase Storage). SKU auto-suggest. Adjust-stock modal with StockTxn ADJUST row.
  A4 + thermal barcode label printing via bwip-js.
- **Rack/shelf locations** — Location CRUD (`/catalog` → Locations tab), `LocationPicker`
  combobox (pick or create inline), location column in Parts/Sets catalog tables,
  `📍` tag on POS product cards, location barcode labels.
- **POS** — Index-backed search (<100 ms raw SQL, keyset cursor pagination), product cards,
  cart with qty/discounts, hold/park sales, cash/card/bank-transfer/split tender,
  manager auth modal for discounts, set detail modal. Barcode-scan via search box.
- **Sales & invoices** — `saleService.completeSale`: per-company per-year invoice ID
  generation inside `$transaction`, stock deductions + StockTxn SALE rows, `unitCost`
  snapshot. Invoice list + detail page. Partial returns with manager auth
  (`returnService.processReturn`). Reprint from invoice detail.
- **Multi-company invoicing** — Company table (KG + UD). KG/UD toggle in POS cart.
  Per-company invoice sequences. Company details on receipts.
- **Receipts** — 80 mm print-CSS receipt; company logo (greyscale thermal-safe);
  company name/address/reg no/footer; auto-print on sale; reprinting. Receipt toolbar
  (print, WhatsApp placeholder, shipping label link).
- **Shipping labels** — For delivery orders; company logo + ship-from; delivery address
  snapshot; 100 × 150 mm print CSS.
- **Company logos** — `logoUrl` on Company; upload endpoint (`/api/settings/companies/[id]/logo`)
  to Supabase Storage `logos/companies/{id}/logo.{ext}`; shown on receipts and shipping labels.
- **Manager authorization** — `ManagerAuthorization` grants; `POST /api/auth/authorize`;
  `consumeAuthorizationGrant` server-side in `saleService`/`returnService`/`creditService`;
  configurable threshold in Settings.
- **Customer module** — Customer DB (name/phone/address/bike info); customer picker in POS;
  customer detail page with invoice history and ledger.
- **Delivery orders** — `orderType` (COUNTER/DELIVERY), delivery section in POS,
  `deliveryFee`, `deliveryAddress` snapshot, `deliveryStatus` progression, shipping label.
- **Credit customers** — `CustomerLedger` append-only ledger, credit eligibility
  (`lib/utils/credit.ts`), CREDIT payment method, record-payment flow with manager auth
  for non-OWNER, receivables report.
- **Reports** — Daily summary, best sellers, dead stock, low stock, discounts, refunds,
  payment mix, by-company breakdown, daily trend, receivables. Profit shows
  "~approx" when `unitCost` is null.
- **Settings** — Company details + logo; discount approval threshold; label stock dimensions.

Features **not yet built** (schema stubs exist):

- **Print layouts** (`PrintLayout`, `LayoutItem`) — schema defined; no UI, no API routes.
- **Sheets & cut & issue** (`Sheet`, `SheetContent`) — schema defined; no cut-issue screen,
  no CUTTER UI, no sheet creation, no `SH-YYYY-NNNNN` sequencing. The Location model
  is already extended for sheet use (the `sheets` back-relation is wired up).
- **Kitting** (`KIT`/`UNKIT` TxnType) — `packedStock` column exists; no kit/unkit service.
- **Stocktake mode** — not started.
- **Custom orders** — not started.
- **WhatsApp PDF** — not started.
- **PWA offline queue** — not started; StockTxn UUIDs are in place as designed.
