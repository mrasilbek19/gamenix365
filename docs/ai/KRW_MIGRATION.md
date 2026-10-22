# Native KRW migration — 2026-10-21

## Implemented for new records

New products are created server-side with currency=KRW and nonnegative safe-integer prices. Product create/update DTOs reject fractions and unsafe integers. Both SHOP and ADMIN price updates require an already-KRW product; ordinary edits cannot silently convert legacy prices. Public catalog queries select explicit KRW products. Direct legacy links, favorites and management cards show a repricing notice instead of relabeling the old amount; basket addition/restoration/mixed-currency guards reject legacy snapshots.

New orders and every order item snapshot carry explicit KRW currency. Orders also store orderSubtotal. OrderService obtains prices from persisted products, rejects legacy products and arithmetic overflow, and ignores caller-supplied amounts/currency. Existing single-shop, active shop/member, stock, status and one-point behavior is unchanged. No payment is inferred from order status.

No Mongoose currency default is defined: hydrating an old record must not turn it into KRW. GraphQL resolves absent legacy product/order currency to USD without writing to MongoDB. Legacy order item output inherits the original order currency only in memory. Historical USD order history and invoices retain their original amounts; this is the intentional historical exception to the new KRW marketplace UI.

Frontend libs/money.ts supplies consistent integer-won formatting with the selected English/Korean/Russian locale. Updated homepage/catalog/detail/cards, price filters and assistant example, basket/checkout, order confirmation/history, SHOP creation/editing/cards, ADMIN product tables, Apollo selections/types and email invoices. No monetary notification payload exists in the current notification code. No exchange-rate service or new dependency. Deploy/restart the updated backend before the frontend, because the frontend now selects currency/subtotal and queries getShippingPolicy.

## Approved delivery policy

The user specified: “50 to normal products 70 to furniture”. These are implemented literally as **KRW 50 and KRW 70**, not 50,000/70,000. The backend policy is in apps/gamenix-api/src/libs/money.ts. Frontend estimates read getShippingPolicy rather than duplicating the fee values.

| Fulfillment/subtotal | Delivery fee |
| --- | --- |
| Pickup, any subtotal | ₩0 |
| Delivery below ₩50,000, no chair/desk | ₩50 |
| Delivery below ₩50,000, contains chair/desk | ₩70 |
| Delivery at least ₩50,000, including furniture | ₩0 |

Examples: normal ₩49,999 → ₩50,049 total; furniture ₩49,999 → ₩50,069; ₩50,000 and ₩75,000 → free shipping. The threshold uses product subtotal before shipping.

## Read-only database audit and pending decisions

The configured development database was read without writes. Before/after audit IDs, currency fields and financial amounts match exactly: **4 products, 5 orders, 7 order items; no payments/paymentEvents collections**. All 16 records lack explicit currency and are treated as legacy USD according to the previous application contract. Production databases were not inspected. Full local audit artifact: /private/tmp/gamenix-currency-audit.json (not committed).

Legacy product prices requiring explicit native KRW decisions:

| Product ID | Name | Original USD price | Approved KRW price |
| --- | --- | ---: | --- |
| 6ac9c60b7f368a0d7d7e167b | KEYboard | 3234 | Pending |
| 6aca0d93b68185e183e5f3ae | bouse | 32 | Pending |
| 6aca10b3b68185e183e5f3b6 | qirioqwrywqiry | 44 | Pending |
| 6aca10d1b68185e183e5f3bc | qweqe | 323 | Pending |

Original orders (no conversion or relabeling approved):

| Order ID | Original USD total | Original USD delivery |
| --- | ---: | ---: |
| 6ac9ca147f368a0d7d7e16e4 | 3234 | 0 |
| 6ac9d4817f368a0d7d7e1759 | 3234 | 0 |
| 6aca5e7c8f7223ad6df84634 | 3445 | 15 |
| 6ad838690d07136d81afc3c1 | 323 | 0 |
| 6ad84a9de5de294db5131396 | 323 | 0 |

Original order item IDs (all amounts preserved):

- 6ac9ca147f368a0d7d7e16e6 — USD 3234 × 1; order 6ac9ca147f368a0d7d7e16e4
- 6ac9d4817f368a0d7d7e175b — USD 3234 × 1; order 6ac9d4817f368a0d7d7e1759
- 6aca5e7c8f7223ad6df84637 — USD 32 × 2; order 6aca5e7c8f7223ad6df84634
- 6aca5e7c8f7223ad6df84636 — USD 44 × 3; order 6aca5e7c8f7223ad6df84634
- 6aca5e7c8f7223ad6df84638 — USD 3234 × 1; order 6aca5e7c8f7223ad6df84634
- 6ad838690d07136d81afc3c3 — USD 323 × 1; order 6ad838690d07136d81afc3c1
- 6ad84a9de5de294db5131398 — USD 323 × 1; order 6ad84a9de5de294db5131396

## Proposed migration policy — approval required before writes

1. Supply native KRW prices keyed by the four product IDs. No exchange rate, multiplication, rounding or numerical relabeling is inferred. Existing entries stay excluded from the public KRW catalog until repriced/replaced.
2. Prefer replacement KRW listings while retaining original USD product records and old order references. If in-place repricing is requested instead, first approve a durable original-value audit/backup and a reviewed compare-and-set plan matching product ID, old price and old currency. No apply script or data write is included here.
3. Keep all five historical orders, seven item snapshots and any subsequently discovered legacy payment evidence in their original currency/amounts permanently. Any explicit USD metadata backfill is a separately reviewed operation; none ran. Recalculate neither historical shipping nor historical totals.
4. Back up and run the same read-only audit against the intended deployment database before applying an approved plan. Do not assume development counts describe production. Review partial failures/rollback and verify references, single-shop ownership and native KRW coverage before exposing replacement listings.

Use the read-only tool from the backend root under Node 20+: `node scripts/audit-currency.cjs /tmp/currency-audit.json [approved-prices.json]`. The optional file is a JSON map of product ID to approved integer KRW amount. It generates proposedRepricing entries only; there are no update/insert/delete/index calls. Keep output files outside version control. The tool fails on unknown IDs, already-KRW products and invalid amounts.

## KakaoPay status

PortoneService TEST lookup/verification now expects integer KRW totals directly (no ×100 cents conversion), matching paid/total/cancelled evidence and existing store/test-channel/member/order bindings. USD provider responses are rejected. No existing payment record was changed; none were found.

getKakaoPayTestAvailability returns currency=KRW and no longer reports a currency blocker. It remains enabled=false with CHECKOUT_NOT_INTEGRATED and TEST_CHANNEL_NOT_CONFIGURED: inspected Gamenix environments have no PortOne sandbox secret/store/test channel. Actual merchant sandbox/channel identity, supported interface and QR availability remain unverified. Desktop IFRAME and mobile REDIRECTION are the official supported flows. No SDK, session creation, fake QR, frontend-paid transition or live payment was enabled. Backend verification helper tests are not end-to-end KakaoPay verification.

The remaining integration must bind an authenticated persisted KRW order to atomic, reusable payment attempts before requesting the provider. Durable duplicate-charge/replay recovery and verified provider success UI are still unimplemented while actual sandbox access is absent. Current Confirm Order creates an unpaid KRW order and shows the honest unavailable state. Existing createOrder itself is not server-idempotent for ambiguous network failures.

Official guide: https://developers.portone.io/opi/ko/integration/pg/v2/kakaopay?v=v2

## Validation

- API/batch TypeScript and API build pass. Full Jest: 322 passing cases, four opt-in database cases skipped. Covers thresholds, furniture, pickup, multiple quantities, server totals/snapshots, decimal/overflow rejection, legacy hydration/price guards, KRW/legacy invoices and payment currency/amount evidence.
- Offline Nest DI/schema: 30 queries/43 mutations. All 71 frontend GraphQL documents validate.
- Frontend currency, basket, shop-name, dates and product-category regressions pass. Basket fixtures now model the current i18n hooks, shipping query and saved-order confirmation.
- Isolated browser fixtures pass KRW listing/detail, checkout/server total, approved fee, payload allowlist, unavailable sandbox, original USD history, English/Korean/Russian formatting and 390px layout. ADMIN product tables show won prices and legacy repricing notices; SHOP integer/fractional price editing is checked separately. No live orders/provider/SMTP operations.
- Frontend Yarn TypeScript and build were attempted; both stop at the preexisting pages/_error.tsx:17 getInitialProps wrapper typing error. No unrelated fix or build bypass was introduced. Dev/build output writers were run sequentially to avoid the previously diagnosed .next mismatch.
- Before/after read-only development database audits prove historical record IDs, currencies and amounts unchanged. No migration, environment/dependency change, commit or push.
