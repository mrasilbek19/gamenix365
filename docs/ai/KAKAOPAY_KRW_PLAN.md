# KakaoPay sandbox and native KRW pricing plan — 2026-10-21

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
