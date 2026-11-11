# KakaoPay sandbox and native KRW pricing plan — 2026-10-21

## Direct KakaoPay correction; KRW rules unchanged — 2026-10-29

The user now explicitly requires direct KakaoPay using the existing backend `KAKAOPAY_SECRET_KEY`, `KAKAOPAY_CID=TC0ONETIME` and official `KAKAOPAY_API_URL`. PortOne credentials/channel proof/SDK are not required for this path. Keep the existing native KRW products/order snapshots, approved shipping/pickup fees and historical USD data unchanged; no FX, repricing or currency migration is authorized. Direct owner-bound ready/approve/order/full-cancel verification must remain separate from fulfillment, stock and points. The correction passes API/batch checks/builds, 429 backend tests (four DB skips), all 75 frontend GraphQL documents and frontend typecheck/build/payment/basket regressions. Existing direct environment settings are recognized without a provider call; no real payment/refund or provider acceptance is claimed. Current setup is `../gamenix365-next/docs/KAKAOPAY_SETUP.md`; older PortOne-only/direct `_DEV` key instructions below are historical.

## Current provider implementation — 2026-10-29

The approved replacement copies Petora/PortOne V2 and keeps existing native KRW pricing/shipping and historical USD data unchanged. Direct KakaoPay execution is retired; KAKAOPAY_CID/SECRET_KEY/API_URL remain private and untouched but cannot authenticate PortOne. Configure the PortOne test merchant/channel/V2 secret/proof as documented in ../gamenix365-next/docs/KAKAOPAY_SETUP.md. No FX, repricing, data migration or fulfillment change was performed. See PETORA_PORTONE_MIGRATION.md; earlier direct setup descriptions below are historical.

## Direct KakaoPay TEST implementation — 2026-10-28

The latest direct-API request supersedes PortOne-only setup for the chosen development path. DirectKakaoPayService uses KakaoPay's documented JSON ready/approve/order APIs with fixed TC0ONETIME and a server-only development secret. Product orders remain one-time; no TCSUBSCRIP/SID recurring billing is created. PortOne remains an optional separate provider, sharing the unique order ledger to prevent cross-provider duplication. Callback nonces, saved TIDs, serialized approval, exact provider facts and CAS capture persistence replace callback-only success. The current development configuration selects DIRECT/SANDBOX and localhost; missing KAKAOPAY_SECRET_KEY_DEV keeps actual availability disabled. Register the application's Web origin and supply its Secret key(dev), following gamenix365-next/docs/KAKAOPAY_SETUP.md. Unknown preparation/approval outcomes and expired sessions require reconciliation; do not blindly recreate an order/transaction. No real provider test was possible without the user's key.

## Sandbox integration delivered — 2026-10-28

This section supersedes the earlier planning-only/unimplemented descriptions below. Native KRW pricing and the user-approved product conversion are complete (KRW_MIGRATION.md). PortOne V2 KakaoPay checkout is implemented through authenticated order-owned prepare/status/verify operations and the official browser SDK. Attempts have stable IDs and immutable server totals/bindings; paid requires trusted full-capture evidence persisted by the backend. Retries, callbacks, redirects, version conflicts and cancelled payment recovery are covered without altering order stock/points/status behavior.

Merchant activation still requires PORTONE_ENVIRONMENT=SANDBOX, PORTONE_STORE_ID, PORTONE_TEST_CHANNEL_KEY, server-only PORTONE_V2_API_SECRET and PORTONE_TEST_CHANNEL_PROOF_PAYMENT_ID. The proof is an independently created TEST transaction on the merchant's own KakaoPay channel (for example through PortOne's official SDK playground), verified via the documented authenticated payment lookup. Environment strings or preregistration alone do not establish channel type. The real local environment has none of these credentials, so enabled=false remains correct until setup. Production/live payments stay disabled. See gamenix365-next/docs/KAKAOPAY_SETUP.md for exact console/playground steps, the blank backend .env.example, and the newest COMPLETED_TASKS entry for all validation. No actual merchant payment was attempted.

## Implementation update — 2026-10-21

Native KRW fields/validation, approved shipping and locale-aware UI for new records are implemented. Historical native-price approval and actual sandbox integration remain outstanding. KRW_MIGRATION.md supersedes the current-state/planning-only descriptions below; no historical data was converted.

## Approved direction and current limit

The user selected **Plan native KRW product prices**. This authorizes the plan, not invented prices or an automatic conversion. Current catalog, delivery fees, order snapshots, displays and emails stay USD. No migration, environment edits, live database/index operation or provider payment occurred.

PortOne V2's official KakaoPay guide requires KRW. Desktop supports IFRAME, mobile REDIRECTION; do not force an unsupported popup. An official QR may be shown by the provider, but its availability has not been verified for this merchant's actual test channel. No PortOne API secret, store ID or test-channel ID was configured in the inspected Gamenix environments. Petora was a source reference only; its booking amounts, credentials and callback-only success handling cannot establish Gamenix payment safety.

## Safe implementation now

- Confirm Order still sends only fulfillment/address and product IDs/quantities to the existing OrderService. Single-shop, server prices, stock, points and status behavior are unchanged.
- After successful creation, the frontend shows the saved order number, fulfillment, server-calculated USD total and a disabled KakaoPay method. The basket is cleared only after the order acknowledgement, as before. Readiness failures can be retried without creating another order. Account changes hide/clear the old confirmation; a page reload uses My Orders rather than recreating it automatically.
- Public read-only getKakaoPayTestAvailability exposes only enabled=false, current/required currencies and nonsecret blocker codes. Environment flags cannot enable it. No charge/session/SDK/QR generation, payment mutation or order-paid transition exists. URL callbacks are ignored.
- Existing PortoneService remains nonproduction TEST/USD read verification only. Its matching reference/store/channel/currency, captured amounts/evidence and member/order bindings are covered offline. It is deliberately disconnected from KakaoPay and orders; switching its currency to KRW now would misinterpret historical USD orders.
- Duplicate clicks during one order request are guarded. Existing createOrder is not server-idempotent: ambiguous network failures still require checking My Orders before manually retrying. Durable payment-attempt/charge idempotency is not implemented because no payment can be initiated.

## Concrete repricing plan before implementation

1. Obtain a merchant-approved native KRW price list keyed by existing product ID, including every active product and its shop owner. Each price must be a positive safe integer number of won. Do not multiply USD prices by a guessed rate or reinterpret an existing number as won. Products lacking a price must remain unavailable for KRW checkout.
2. Obtain approved integer KRW delivery policies: ordinary fee, furniture fee, free-delivery threshold and pickup=0. Current USD 5/15/100 values are not KRW equivalents. Points remain the existing one-point status action; currency repricing must not change when stock/points are applied.
3. Add explicit currency to catalog/order contracts and immutable currency/price/delivery snapshots on newly created orders, adapting existing DTOs/schemas rather than introducing another commerce system. Treat existing records without currency as legacy USD. Keep old USD order/item amounts unchanged and readable; reject mixed-currency baskets and payment/order currency mismatches.
4. Prepare a reviewed migration with dry-run output showing product IDs, owner, old USD amount and supplied KRW price. Back up affected records, define a rollback, verify complete coverage, and deploy coordinated backend/frontend currency contracts. No migration should run as part of this planning task.
5. Update existing shop/admin product editors and validators, catalog filters/sorts, basket estimates, order summaries/history and mail formatting together. Use zero fractional digits and the won sign for explicit KRW records; keep two-decimal USD formatting for historical orders. Test old orders and partially repriced catalogs. Keep single-shop, server pricing and existing lifecycle semantics.
6. Configure a real PortOne sandbox store and KakaoPay test channel in the merchant console. Confirm channel identity/provider/type through authoritative provider data and a real sandbox checkout; configuration strings alone are not proof. Keep API secret server-only; store/channel public identifiers may be returned only by a future authenticated, order-bound checkout operation. Production/live calls must stay disabled.
7. Only then implement the narrow supported provider flow: persisted owner-bound KRW order, stable server-generated payment reference, atomic reuse of active attempts/idempotency across retries/tabs, server amount/currency, official SDK IFRAME/REDIRECTION and verified provider capture. Reject foreign orders, mismatched amounts/currency/store/channel, replays, nonpaid/cancelled/partial captures and frontend-only success. Preserve recoverable failed/cancelled/pending states. Do not infer paid from the existing PROCESS status or client customData alone; match against the server's persisted attempt.
8. Test new/returning flows, duplicate/retry/concurrent attempts, provider failure/cancel, lost callback, forged callback, capture verification and desktop/mobile sandbox behavior. Confirm whether the actual official desktop interface supplies a QR; never generate one independently. Record provider evidence without credentials. Enable sandbox checkout only after these checks; live payments remain outside scope.

Required inputs remaining: native KRW product prices and delivery policy, deployment/migration review, actual sandbox credentials/channel access and supported official checkout/QR evidence. Current UI is an honest unavailable state, not a working KakaoPay payment flow.

## Official references

- https://developers.portone.io/opi/ko/integration/pg/v2/kakaopay?v=v2 — KRW only; desktop IFRAME/mobile REDIRECTION.
- https://developers.portone.io/opi/ko/console/guide/channel-manage — merchant channel setup.
