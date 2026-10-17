# Guarded sandbox payment workflow

Date: 2026-10-17. **Provider-independent implementation only. Actual checkout is disabled; Phase 6 provider verification and Phase 7 remain blocked.** Read [PAYMENT_READINESS.md](PAYMENT_READINESS.md).

## Account gate and runtime configuration

The user conditionally approved PortOne V2 hosted checkout, PayPal sandbox, USD, and one central Gamenix test merchant. No actual merchant/store/PayPal TEST channel/checkout TEST profile or credentials were available to verify. No SDK was installed and there is no PortOne adapter or runtime simulator. The default UnconfiguredPaymentProvider always returns no verified sandbox and rejects provider methods. Setting PAYMENTS_ENABLED=true cannot enable it. NODE_ENV=production is also rejected.

The generic orchestration can run only with an account-verified server adapter AND PAYMENTS_ENABLED=true AND a nonproduction environment. Synthetic tests inject a separate fake provider; that is not account compatibility or a provider sandbox transaction. No environment files, credentials, order status names or payment status names changed.

## Persistence and checkout creation

Reuses payments/paymentEvents. PaymentCoreModule is shared by the API and gamenix-batch without importing resolvers/auth into batch. Authenticated session creation accepts only orderId, buyerCountry and idempotencyKey. Identity always comes from AuthMember. No amount, member, shop, currency, provider identifier or success flag is accepted from the browser.

Snapshot creation reads the owned PAUSE order, ACTIVE buyer/SHOP, all persisted items and current products. It validates one shop, product availability, integer quantities, aggregate stock per repeated product and fulfillment details. Amounts come from persisted item prices and shipping, not current product prices or frontend totals. Decimal USD converts exactly to safe integer cents; fractional cents, overflow, empty items, inconsistent totals and zero-total charges are rejected. Pickup must have zero shipping; delivery requires an address. Existing stored delivery fees are retained. No FX or KRW checkout is enabled.

The immutable snapshot contains source USD line names/prices/quantities, fulfillment, subtotal, shipping, total and order reference/status, without addresses or card data. The server hashes the trusted request/snapshot and allocates a provider payment ID before external calls. Immutable expected merchant/store/channel/PG and country fields bind later verification. The provider port receives the local payment ID so its future adapter can build the fixed trusted return URL.

Unique indexes cover (environment,memberId,idempotencyKey), assigned provider payment identities, and (environment,orderId,active) with active=true. The last has no field default, so old foundation rows are not activated on deployment. Existing PENDING/UNKNOWN/SUCCEEDED or reconciliation-required rows still block a new charge. Required payment/event unique indexes are checked before a session or signed event is created; missing indexes fail closed. No live index migration/synchronization was performed.

Same-key retries validate order and country and return the existing safe metadata. They never recreate a provider session. Different keys contend for one active order claim. The insert winner alone calls createSession. The returned URL must use HTTPS, the verified adapter's exact host, no credentials/custom port and a valid future expiry. A provider timeout or persistence failure leaves the durable claim UNKNOWN and scheduled for retrieval, without cancellation, compensation or a second session.

## GraphQL contract

All operations use the existing Authorization bearer token. paymentId is the local MongoDB Payment ID. Unknown and foreign IDs both return Payment not found; there is no owner override or payment-update mutation.

```graphql
query CheckoutAvailability {
  getTestCheckoutAvailability { enabled reason buyerCountries }
}

mutation TestCheckout($input: TestCheckoutInput!) {
  createTestCheckoutSession(input: $input) {
    paymentId status environment currency checkoutUrl expiresAt
  }
}

query PaymentStatus($paymentId: String!) {
  getPaymentStatus(paymentId: $paymentId) {
    _id orderId shopId status verifiedSuccess environment currency amountMinor
    reconciliationStatus verifiedAt expiresAt createdAt updatedAt
  }
}
```

Example input: {orderId: "<owned-order-id>", buyerCountry: "<verified-allowed-ISO-country>", idempotencyKey: "<random-16-to-100-character-key>"}. Repeat the same key/order/country after interruption. The current runtime returns enabled=false, reason=SANDBOX_NOT_VERIFIED and no buyer countries; session creation raises a controlled unavailable error without creating records.

The status query reads local persisted facts and never calls a provider. amountMinor is GraphQL Float because Int is 32-bit, but storage enforces a safe integer. USD 5500 means $55.00. Private keys, snapshots, checkout URLs, provider IDs, verification proof and raw failure details never appear in this query. verifiedSuccess requires a SUCCEEDED record plus matching persisted capture evidence, not dates/status alone. Future Phase 7 consumers must use that verification predicate, not merely OrderStatus or PaymentStatus.

## Webhook boundary and event processing

POST /payments/webhook preserves Nest's rawBody bytes; no JSON reserialization fallback exists. The default runtime rejects the endpoint with unavailable. A future configured adapter must verify the official signed webhook, including replay/timestamp checks, before returning allowlisted event metadata. There is no client notification/payment creation endpoint and no JWT substitute for signature verification.

The generic boundary rejects absent/oversized raw bytes, bad signatures, missing IDs or a foreign store. It stores only identity/type/server SHA-256 hash and scheduling metadata. Unique provider/environment/merchant/event identity deduplicates deliveries; a different hash for the same event is rejected, preserving the original and flagging its bound payment for review. Unknown local payment IDs are audited and ignored, never created or fetched arbitrarily.

A signed event is first RECEIVED. Batch atomically leases it and schedules the corresponding local payment for provider retrieval. PROCESSED means that scheduling is durable, not proof of capture. Scheduling failures retry; exhausted/crashed final attempts become FAILED for manual inspection. A crash after scheduling and before event acknowledgement can schedule another safe retrieval, never another checkout or financial effect. Synthetic HMAC tests validate this generic boundary only; they do not implement PortOne signatures.

## States and capture evidence

| Payment status | Meaning in the generic workflow |
|---|---|
| PENDING | Durable attempt or trusted provider reports still pending. Link/browser expiry alone changes no payment outcome. |
| SUCCEEDED | Exact matching provider retrieval proves capture, and the matching private capture proof/status are persisted together. |
| FAILED | Provider proves an uncaptured, permanently closed failure. |
| CANCELLED | Provider proves an uncaptured, permanently closed cancellation. |
| EXPIRED | Provider proves an uncaptured payment cannot capture after expiry. A browser clock/link expiry is insufficient. |
| UNKNOWN | Timeout, ambiguous provider outcome, missing/mismatched facts, database uncertainty or exhausted pending checks. |

Verification compares payment ID, exact safe-integer amount, USD, merchant, store, channel, PG merchant, SANDBOX and server fingerprint. Success also requires a capture transaction ID/date. Live or incomplete facts fail closed. An active claim is released only on a verified permanently nonchargeable uncaptured terminal outcome. A future adapter must be conservative if its provider cannot prove that condition.

Late signed events can schedule re-verification of UNKNOWN outcomes. Verified capture is never downgraded by stale/pending/failure events. Conflicting subsequent capture references preserve original evidence and require review. Refund-like or cancellation-after-capture outcomes also retain success and require review; no refund is issued. Reconciliation NONE/REQUIRED/RESOLVED stays independent; this increment never automatically clears REQUIRED or exposes a client resolution operation.

## Recovery and existing order limitations

PaymentWorker runs every 30 seconds, processes up to 20 events then 20 payments and prevents local overlap. MongoDB leases/tokens coordinate multiple workers for five minutes. Claims persist before retrieval; updates require the same lease token. Stale workers cannot overwrite newer claims. A scheduling revision also invalidates results from retrievals started before a newly queued event, preserving that event's due date. A crash on the final attempt is swept to manual review when its lease expires.

Provider session/retrieval calls have a 65-second deadline, shorter than the worker lease; a timeout never cancels the underlying financial operation or accepts its late response. Account-gate/signature verification are bounded separately. At most five provider retrieval attempts use 30/60/120/240-second retry delays. Mismatch stops automatically with REQUIRED; exhaustion leaves UNKNOWN/REQUIRED. New distinct signed events can restart trusted retrieval; duplicate deliveries cannot reset the retry budget. Lost webhooks are covered by the durable attempt's own due date. Recovery never creates sessions or interprets a network failure as cancellation. If both provider-result persistence and its error write fail, the original due claim/lease remains recoverable.

Payment success never calls OrderService, transitions PAUSE/PROCESS/FINISHED, deducts stock, awards points, sends receipts/emails/notifications or issues refunds. The narrow OrderService catch reports PROCESS item/stock/points failures to existing active/successful payments as REQUIRED, then rethrows the exact original exception; reporting errors never replace it. No compensation runs. If reporting also loses database access, that separate-write gap requires manual audit. Existing partial order creation, no stock reservation, PROCESS-before-stock and same-state nonrepair behavior remain production blockers. Snapshot validation cannot prove completeness of missing zero-priced lines without a transactional order-completeness marker; none is added here.

## Frontend integration

The existing Next Pages checkout /orders/process and Apollo/MUI/SCSS structure are retained. Disabled/error availability keeps existing order confirmation and the no-payment-collected message. No checkout redesign or provider SDK was added.

For a future verified adapter, availability supplies approved buyer countries. The page creates the existing order, saves member-scoped sessionStorage resume identifiers, sends the session mutation and permits only https://checkout.portone.io redirects. A session failure retries the same order/key instead of creating another order. Storage identifiers and browser return parameters never establish payment success.

The return path is /orders/process?paymentId=<local-payment-id>, before the empty-basket branch. It polls the authenticated query every three seconds, at most 40 requests, with no cache or request deduplication. Requests do not overlap. Owner changes/unmount suppress stale results and stop timers. Pending, verified success, failed and unknown UI states come only from backend responses. A manual refresh can recheck; it cannot change a payment. The actual adapter must configure the trusted fixed return URL; none exists yet. Apollo/backend logs redact payment requests and responses, including mixed GraphQL operations on the backend.

Current order creation lacks server idempotency. An unknown createOrder network outcome still needs My Orders inspection before retrying; payment idempotency cannot repair that pre-existing gap. Real browser-hosted checkout, provider redirects, TLS and deployed webhook delivery remain untested.

## Validation and next gate

Run the full Jest suite, isolated payment MongoDB suites, both backend TypeScript checks, API/batch builds, frontend Yarn TypeScript check and scripts/test-payments.cjs plus scripts/test-basket.cjs. Mongo tests create fresh gx_payment_test_* databases, verify indexes/concurrency/leases and guard exact-name cleanup. No marketplace application collection is written and no real SMTP/provider request occurs. Executed results are recorded in COMPLETED_TASKS.

Before Phase 7: verify actual account/channel/profile eligibility, implement/review the official SDK adapter, execute real zero-money sandbox success/failure/cancellation and signed webhook/retrieval/recovery scenarios, and approve any provider-specific gaps. Payment receipts, emails, notifications and refunds are deliberately not implemented in this increment.
