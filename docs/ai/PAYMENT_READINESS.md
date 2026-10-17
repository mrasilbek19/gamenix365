# Phase 6 payment-readiness decision report

Date: 2026-10-17. Status: **Provider-independent records/query implemented; provider checkout blocked**.

Latest decisions: the user confirmed South Korea and approved the proposed unchanged inventory timing, separate payment ledger and manual sandbox reconciliation. They subsequently confirmed that no test account exists, considered entering new prices directly in KRW, then instructed “or just keep $ as it is”. The latest currency direction preserves USD catalog prices, shipping and emails, with no FX conversion or KRW repricing. Do not repeat approvals already received. No provider, underlying PG, merchant arrangement or test channel has been selected or confirmed compatible.

Reviewed Gamenix OrderService/resolver/schemas, current AI handoffs, Phase 5 mail integration, and Petora's PortOne service/order integration. Following approval, added Payment/PaymentEvent persistence schemas, independent enums/private DTOs and an owner-only local status query. No checkout, provider SDK, provider request, webhook endpoint, refund, order lifecycle change or application-record migration was implemented. Credentials were not displayed or changed; isolated synthetic persistence tests use a fresh database through the existing development connection.

| Decision | Confirmed current state | Required before checkout implementation |
|---|---|---|
| Provider and merchant eligibility | South Korea is confirmed; the user has no test account. Petora uses PortOne V2 REST through Axios. Business/account eligibility, platform-versus-shop merchant arrangement and sandbox channel remain unknown. | Confirm the intended provider and exact PG/payment method/test channel, merchant arrangement, USD compatibility and a zero-real-money sandbox. PortOne's presence in the reference does not establish account compatibility. |
| Currency | Latest instruction retains USD. Catalog prices, delivery fees and existing order/email totals remain USD; orders have no persisted currency field. | A selected sandbox must support USD for the actual merchant/payment method. Store integer cents and the immutable USD source order snapshot. Do not relabel prices as KRW, invent an exchange rate or migrate old data. The model can represent KRW, but KRW conversion/checkout is not enabled. |
| Inventory timing | PAUSE checks availability but reserves nothing. The buyer's PAUSE→PROCESS request claims PROCESS, then conditionally deducts each product and awards one point. FINISHED changes status only. | Preserve that timing as instructed. Payment verification must never invoke PROCESS, deduct stock or award points. Accept that availability can change after a payment and that existing PROCESS can still occur without a payment. |
| Payment succeeds, stock work fails | No handling exists. PROCESS and earlier stock writes can already be committed when a later item/points write fails. | Approved sandbox policy: retain the verified payment outcome and record a separate reconciliation-required condition for manual review. Do not mark a successful provider payment FAILED or blindly restore stock. |
| Refund and reconciliation | No refund API, cancellation/restocking lifecycle, inventory-effect ledger or reconciliation worker exists. | Approved initial sandbox policy: manual reconciliation for order/payment mismatches; no automatic refund or inventory compensation. Any separately authorized cancellation/refund needs durable intent, idempotency and trusted result verification. Provider timeouts remain uncertain until rechecked. |
| Existing order consistency | Order and items are separate writes; partial creation is possible. PROCESS is saved before stock/points. Same-state retries do not repair partial effects. Repeated product lines are allowed and checked individually at creation. createOrder has no request idempotency. | Payment checkout must validate ownership, one shop and complete consistent persisted items/totals; persist its own immutable snapshot and idempotency. Existing order rules and transaction policy remain unchanged. These limitations block production payment/fulfillment guarantees. |

## Petora patterns to avoid

- Existing paymentId orders are returned before checking the requesting member's ownership.
- A pre-check plus unique insert can race: the losing request's broad catch can cancel the same payment used by the winning order. The catch also covers failures after order persistence.
- Currency is checked only when present; merchant/store, channel and sandbox identity are not verified. Browser-supplied customData is not a substitute for a server-owned payment intent.
- Cancellation is best-effort with logged failure, without a durable retry/reconciliation record. No signed webhook handler or durable webhook deduplication was found in the reference backend.

## Official provider findings

- PortOne documents development test channels before a production PG contract, but that does not establish this account's eligibility for a particular provider/channel. See [merchant onboarding](https://developers.portone.io/opi/ko/console/guide/reg?v=v2) and [channel preparation](https://developers.portone.io/opi/ko/integration/ready/readme).
- Currency support depends on the underlying PG/payment method. For example, the documented Toss Payments integration uses KRW by default and permits USD through its PayPal method, with additional setup requirements. This is compatibility evidence, not a provider selection. See [Toss Payments V2](https://developers.portone.io/opi/ko/integration/pg/v2/tosspayments?v=v2).
- PortOne documents separate test/live webhook secrets and signature verification over the original request body. After approval, signed webhook validation must be combined with server-side payment retrieval and strict local amount, currency, merchant, owner and environment checks. See [V2 webhooks](https://developers.portone.io/opi/ko/integration/webhook/readme-v2?v=v2).

## Implemented foundation

PaymentModule registers private `payments` and `paymentEvents` schemas and exposes only authenticated `getPaymentStatus(paymentId)`. Every read includes the authenticated member and SANDBOX environment in its MongoDB predicate, with an explicit public projection. No payment creation/update mutation exists. Unknown and foreign payments return the same not-found response. Storage uses safe integer amounts, immutable ownership/pricing/source snapshots and unique member-request/provider-payment/provider-event identities. Reconciliation state is separate from payment success. Indexes and fields prepare later processing; they do not implement provider verification, webhook handling or a retry/reconciliation worker. See [SANDBOX_PAYMENTS.md](SANDBOX_PAYMENTS.md) for the exact contract and limits.

## Remaining checkout gate

1. Confirm a provider/PG payment method compatible with a South Korean merchant and the retained USD currency; do not choose one solely because Petora uses PortOne.
2. Obtain the compatible test account/channel, establish platform-versus-shop test merchant identity and confirm its test mode cannot charge real money. Configure test credentials privately, never in chat or source control.

Until that gate is resolved, checkout sessions, server verification, signed webhooks, cancellation/timeout processing and provider scenario tests remain unimplemented under the user's stop-before-checkout rule. No SDK has been installed or used. The foundation can be committed independently without claiming the whole Phase 6 integration is complete.

Baseline before this phase: 282 existing tests passed; 30 opt-in MongoDB cases skipped; both TypeScript checks and API/batch builds passed. Foundation validation and remaining provider tests are recorded in [COMPLETED_TASKS.md](COMPLETED_TASKS.md).
