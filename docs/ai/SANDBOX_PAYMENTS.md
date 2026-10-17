# Sandbox payment foundation

Date: 2026-10-17. This is a persistence/query foundation, not a runnable checkout integration. The user confirmed South Korea, no test account, and finally retained the existing USD pricing. Read [PAYMENT_READINESS.md](PAYMENT_READINESS.md) before implementing a provider.

## Implemented

- PaymentModule/PaymentService/PaymentResolver register private `payments` and `paymentEvents` models and an owner-only local status query. No create/update mutation, REST webhook or provider client exists.
- PaymentStatus is independent: PENDING, SUCCEEDED, FAILED, CANCELLED, EXPIRED, UNKNOWN. These are representable records, not an implemented transition/verification engine. Orders retain PAUSE, PROCESS, FINISHED. No callbacks, order changes, stock deductions or points are added.
- Only SANDBOX is representable. Every status read also filters environment=SANDBOX. This does not prove an external account is a sandbox; external verification remains required before checkout exists.
- Required member/order/shop references, provider/merchant/environment, currency, positive safe-integer amount, server request key/fingerprint and pricing policy version. Optional provider payment/session identifiers, verification/outcome/expiry/check timestamps and private failure fields prepare later adapters.
- Immutable source snapshots store actual USD order/item amounts in cents, product references/names/quantities, order reference/status, fulfillment type, subtotal/shipping/total. Item sums and shipping must match source totals; USD charges must equal that source total. No constructor reads orders or calculates a payment yet. No address, raw provider payload, secret or card field is stored.
- Currency is explicit with no default: USD cents or KRW whole won. Current pricing remains USD. Representing KRW does not authorize conversion or repricing. A future writer must obtain all prices from trusted complete MongoDB order data and record the actual approved pricing policy; a version field alone is not an implemented FX snapshot/calculation.
- Ownership/pricing/request/source fields are immutable through Mongoose; schema strict mode rejects extra fields. Default projections hide provider data, keys, snapshots and failure details. Internal failure text must be sanitized by the future adapter; there is no provider adapter copying raw errors today.
- ReconciliationStatus NONE/REQUIRED/RESOLVED and private reason/resolution date are independent of payment success. A verified successful payment must remain successful even when order fulfillment needs review. No worker detects or repairs such mismatches yet.

## Indexes and duplicate scope

Payments uniquely index `(environment, memberId, idempotencyKey)`. Assigned provider payment IDs uniquely index `(provider, environment, merchantId, providerPaymentId)`; a partial string filter permits multiple unassigned IDs. Owner/date, order/date and reconciliation/date indexes support inspection.

Payment events uniquely index `(provider, environment, merchantId, providerEventId)` and store a SHA-256 payload hash, allowlisted type/identity, optional local payment reference, state, attempts, due date, processing date and failure code. Payment/date and state/due indexes prepare future consumers. There is no raw webhook body storage or event TTL.

These indexes prevent duplicate records with those identities, including competing inserts. They do not deduplicate different request keys for one order, bind reused keys to a fingerprint, verify signatures or serialize business effects. Those checks and any active-payment-per-order strategy must be implemented with the checkout lifecycle. Creating an event record must occur only after signature/authenticity validation; a future handler must detect conflicting payload hashes for a repeated identity.

## GraphQL

Use the normal Authorization bearer token. `paymentId` is the local Payment `_id`, not a provider identifier. Identity comes only from AuthMember; there is no member/shop override or admin bypass.

```graphql
query PaymentStatus($paymentId: String!) {
  getPaymentStatus(paymentId: $paymentId) {
    _id
    orderId
    shopId
    status
    environment
    currency
    amountMinor
    reconciliationStatus
    verifiedAt
    expiresAt
    createdAt
    updatedAt
  }
}
```

An unknown payment and another member's payment both return `Payment not found`. Invalid IDs fail before a database read. The query reads stored facts only and does not refresh a provider. It will have no application payment records to return until an approved server-side creator is implemented. No browser success response can change a status.

`amountMinor` uses GraphQL Float because GraphQL Int is only 32-bit; persistence still requires a JavaScript safe integer. For a USD record, 5500 means $55.00. Keep currency attached when rendering any amount. The query never returns merchant/provider IDs, request keys/fingerprints, snapshots or raw failure text.

## Required before checkout and production

Before checkout implementation: establish an eligible provider/PG/payment method with a confirmed zero-real-money test channel, USD support for the South Korean merchant and an explicit platform-versus-shop test merchant arrangement. No account exists yet. Configure test credentials privately. No SDK was installed and no provider requests, cards or real payments were used here.

The approved next increment must implement server-owned checkout intents/session data, persisted-order completeness/ownership/single-shop/amount checks, fingerprint-bound request reuse and concurrent payment prevention; server-side provider retrieval with exact amount/currency/merchant/environment binding; raw-body signed webhooks and duplicate/conflict handling; and durable safe cancellation/timeout/failure/reconciliation processing. Never trust browser payment-success responses. Keep uncertain outcomes UNKNOWN until verified. Do not auto-advance PROCESS, award points or blindly refund on an order/notification failure.

Provider tests remain blocked: sandbox success/decline/cancellation/timeout, forged webhooks, amount/currency/merchant/environment mismatches, concurrent checkout, duplicate provider events and payment/order reconciliation failures. Synthetic database fixtures do not satisfy those tests.

Production additionally needs a reviewed solution for existing nontransactional order/item creation and PROCESS-before-stock/points partial writes, no stock reservation at PAUSE, manual-only recovery, refund/reconciliation operations, deployed index verification and actual merchant onboarding. This foundation does not make paid fulfillment safe in production. Existing application data/indexes were not migrated or synchronized; only fresh test database indexes were exercised.

## Validation

Run the usual full Jest suite, both app TypeScript checks and `npm run build`. The focused payment suites exercise real Nest GraphQL/guards with a model stub, schema validation and private projections. `PAYMENT_TEST_MONGO_URI` opts into the MongoDB suite, which overrides the URI database with a fresh random `gx_payment_test_*` name and guards exact-name cleanup. It creates only synthetic payment/event records and does not call providers, send mail or touch marketplace collections. See COMPLETED_TASKS for executed results.
