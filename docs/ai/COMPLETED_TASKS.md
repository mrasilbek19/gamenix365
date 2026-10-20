# Completed tasks and evidence ledger

## Mail and password recovery copied from Petora — 2026-10-20

Copied actual Petora mail.module/service/templates, PasswordReset schema/type and the three MemberService/Resolver recovery methods. Adapted names to memberNick, current password rules, private optional memberEmail, existing PENDING SHOP eligibility and Gamenix USD order fields. Mail files keep source tabs; inserted member/order code follows adjacent four-space indentation. Preserved JWT/login/shopName/approval, email privacy and original order pricing/single-shop/status/stock/points statements.

Removed the custom email-verification/shared AuthToken system from 39931bd, durable order-email queue/worker from 8fae64c and expanded recovery machinery from 1e5d377, including superseded supporting DTOs/enums/config/tests. The copied PasswordReset collection replaces authTokens; no live records or indexes were deleted/migrated. Standalone verification is absent in Petora: requestEmailVerification/verifyEmail are removed, while private optional memberEmail/memberEmailVerified fields stay compatible. Recovery now accepts the matching optional account email without requiring the removed verifier.

Necessary safety adaptations stay inside copied methods/model: bcrypt code/password storage, SHA-256 reset tokens, expiry, atomic guess/code/token claims, exact current email/stored-password binding and best-effort invalidation on profile changes. SMTP failure invalidates the new grant and retains the same public response as a missing account. No transaction, rate-limit map, shared token framework or worker. Reset claim/password write remain separate: a write failure can consume a grant and requires a fresh request; Petora has no request throttling.

Order creation sends an optional direct invoice/summary as Petora does. It uses escaped product/address text, stored USD line prices/shipping/total and states that order status does not confirm payment. Optional recipient lookup/delivery failure does not fail checkout. There are no status emails, durable retries or capture transport. SMTP uses SMTP_HOST/PORT/USER/PASS and MAIL_FROM; environment files remain untouched. Existing three password-reset GraphQL inputs/results are preserved; no frontend or real SMTP action.

Validation: 199 focused tests pass across five existing member/order suites; four opt-in member-email MongoDB cases skip without their explicit test URI. API TypeScript and diff whitespace checks pass under Node 20.19.0. Real SMTP and concurrent database behavior were not exercised.

## Payment replaced with Petora's two-file implementation — 2026-10-20

Read the actual local Petora payment/order sources and Git history. Recreated only payment.module.ts and portone.service.ts while preserving the user's preexisting payment-folder deletions. Removed foundation/workflow files introduced in 2e8ce8f/4284f30 and expanded in 5438a22/64e1ec8: Payment/PaymentEvent schemas, DTOs/enums, snapshot/workflow/verification helpers, GraphQL resolver, webhook, batch worker and obsolete tests. Removed their registration and reporting-only order hook; original order stock/points/status statements remain unchanged.

PortoneService follows Petora getPayment/verifyPaid with existing Nest HttpModule, fixed provider URL and sanitized failures. Necessary adaptations enforce nonproduction SANDBOX configuration, TEST store/channel, exact USD integer cents, PAID/capture evidence and member/order binding. No charge/session/refund method or order coupling is exposed. Petora lacks durable duplicate/replay protections; this read-only integration cannot provide checkout and remains test-only. Removed getPaymentStatus/getTestCheckoutAvailability/createTestCheckoutSession; frontend source is untouched. No dependency, environment, live provider or database change.

Validation: 44 temporary offline provider-stub checks, real PaymentModule DI and focused TypeScript compilation pass under Node 20.19.0. Actual provider/account compatibility, real sandbox transactions and durable charge/replay behavior remain unverified; no production-readiness claim.

## Direct Petora payment verification methods copied — 2026-10-17

Copied Petora's actual verifyPaid(paymentId, expectedAmount) implementation into existing PortoneService. getPayment now returns the provider payment object as Petora does; verifyPaid requires PAID and the exact server-calculated USD integer-cent total. Retained TEST identity, capture, binding and sanitized-error checks. Existing record normalization is named getPaymentFacts and its existing workflow caller/tests were adapted. No new files, module, collection, dependency, checkout operation, order rule or payment-state transition. The compatible-account gate remains unchanged; no real provider call/payment or automatic cancellation/refund.

Validation: 487 tests pass, including all 49 isolated MongoDB payment cases; 52 unrelated opt-in MongoDB cases skipped. Both app TypeScript checks and Nest builds pass under Node 20.19.0. Extended the existing test file for the copied raw response/verifyPaid contract, unpaid results, mismatched totals/currency and invalid expected amounts. Synthetic provider responses only; diff reviewed and relevant files staged in one focused commit.

## Petora PortOne client adaptation and final validation — 2026-10-17

Adapted Petora's PortoneService authenticated V2 REST lookup using the existing Nest HttpModule (no dependency/SDK added). Lookup requires nonproduction SANDBOX configuration, a server-generated gamenix-test ID, exact merchant/store/TEST-channel/PG pins, V2/USD positive integer cents, server fingerprint binding and complete capture evidence. Workflow still compares facts with the persisted snapshot. Redirects are disabled and provider errors never expose credentials. Cancelled/partially cancelled/unknown facts stay uncertain; failed attempts do not prove permanent nonchargeability. No Petora booking, KRW fees, automatic payment cancellation or order effects were copied.

Replaced the generic provider token/default with concrete PortoneService and consolidated PaymentCoreModule into existing PaymentModule after replacing all callers. API resolver/webhook registration is in ComponentsModule; the shared batch module exposes no payment routes. Kept the used snapshot/verification/reconciliation services, indexes, status names, owner-scoped operations and order-failure reporting. Existing MailModule/Service, escaped USD templates, verification/reset mail and durable order-mail retries already fit the reusable Petora pattern and remain intact.

Account/hosted-profile compatibility is still unverified. verifiedSandbox returns null; checkout and actual webhook verification remain unavailable even with flags. Lookup configuration names are PORTONE_ENVIRONMENT=SANDBOX, PORTONE_V2_API_SECRET, PORTONE_MERCHANT_ID, PORTONE_STORE_ID, PORTONE_TEST_CHANNEL_ID and PORTONE_TEST_PG_MERCHANT_ID; these do not activate checkout. No environment values changed, SDK installed, real provider request/transaction, actual provider signature, receipt/payment mail or refund enabled. Complete the same service only after the existing eligibility gate is resolved.

Validation: **536/536 tests pass in 27 suites**, including all **101 existing opt-in MongoDB cases** and new review, private-socket, TEST/USD lookup and real API/batch module-graph checks. All integration databases were freshly named and isolated; fixed an existing member-email harness name exceeding the server's 38-byte limit and added exact-name cleanup guards. Separate isolated review MongoDB smoke passes actual concurrent unique-index insertion, foreign-owner rejection, rating/pagination aggregation, moderation, author-field privacy, SHOP target and unchanged stock/points. API/batch TypeScript --noEmit --incremental false, npm run build and npx nest build gamenix-batch pass under Node 20.19.0. Mail captured; provider responses synthetic. Diff reviewed and focused backend commits only; no frontend, secret, dependency, application-data migration or generated output changes.

## Petora private notification delivery adapted — 2026-10-17

Copied Petora's NotificationModule/Service → exported SocketGateway sendNotification wiring into the existing modules. Persist first; unique-key duplicates emit nothing; socket failures never reverse notification persistence or marketplace operations. WAIT/READ, owner-scoped GraphQL and all trigger recipients remain unchanged. Private events reach only matching authenticated open recipient tabs with unexpired JWT claims, never public chat/history. Inbox queries remain the recovery path after reconnect or missed delivery.

Privacy inspection before implementation found token query logging, full decoded-member public broadcasts and no post-connect token-expiry check. Removed token logging, allowlisted public identity (_id/memberNick/memberImage/memberType), and enforce expiry for private delivery. Guest/public chat remains available. Existing query-token transport and proxy access-log handling remain deployment considerations; existing JWT revocation/status policy is unchanged. Validation: 14 notification/socket tests pass (extended existing test file); API/batch TypeScript and both Nest builds pass. No new collection/dependency/worker.

## Petora review module copied and adapted — 2026-10-17

Copied Petora's ReviewModule/Resolver/Service, three DTO files, enum and Review schema. Adapted targets to PRODUCT/SHOP, current ACTIVE authors/shops and PROCESS products; no pet/service/agent logic or new rating fields on existing collections. Preserved Petora's public paginated ratings/distribution, owner edits and ADMIN moderation/removal of DELETE reviews. Added atomic unique author/group/target index, integer stars, bounded input and private-author-field exclusion. No purchase-verification claim, points, stock, order or authentication change.

Operations: createNewReview, updateReview, getReviews, updateReviewByAdmin and removeReviewByAdmin. Reviews use the necessary new reviews collection; comments remain unchanged. Validation: 12 focused review tests pass; API/batch TypeScript and both Nest builds pass under Node 20.19.0. No live database/provider/email used in these checks.

## Petora comparison and copied password recovery — 2026-10-17

Read Petora's actual MemberService/Resolver/DTOs, PasswordReset schema, MailService/templates, notification/socket delivery, PortoneService/order integration and AuthService. Kept working Gamenix functionality and implemented the simplest missing feature only: Petora's requestPasswordReset → verifyPasswordResetCode → resetPassword flow.

| Feature | Actual Petora implementation | Gamenix action |
|---|---|---|
| Nodemailer | components/mail/mail.service.ts | Existing Gamenix MailService retained; added its password-reset send method. |
| Email verification | No standalone verification flow found; Google token email_verified is an OAuth claim | Existing Gamenix verification retained. |
| Forgot/reset password | components/member/member.service.ts + member.resolver.ts + member.input.ts; PasswordReset.model.ts; passwordResetHtml | Copied/adapted the three operations and code/token generation into existing Gamenix Member/Mail files. Reused authTokens instead of adding Petora's separate collection/module. |
| Notifications | Persistent owner-scoped queries/updates plus socket sendNotification(receiverId, notification) | Existing Gamenix persistent system retained; no new socket integration or public-chat delivery. |
| PortOne | components/payment/portone.service.ts, called by OrderService | Existing Gamenix payment work preserved and disabled. No configured compatible test account/channel/profile or payment configuration names were found; no provider calls, SDK or fake success added. |
| Payment email | sendOrderInvoice called after verifyPaid in Petora's createOrder | Existing USD order emails retained. Payment-confirmation mail remains blocked on actual verified payments. |
| Authentication | bcrypt/JWT and Google login | Kept Gamenix JWT/memberNick/roles and corrected password-update paths. Did not import Petora's plaintext update, role escalation or automatic Google account linking. |

Adaptations: memberUserName → case-sensitive memberNick; existing 5–12-character password policy; normalized optional email must already be verified. ACTIVE members and verified PENDING SHOP accounts can recover; approval/status/type never change. Reused the existing authTokens TTL/unique index and MongoDB transaction support. No new module, service, worker, collection, dependency or frontend change.

Security fixes directly required for the copy: cryptographic six-digit codes hashed with bcrypt; three-minute code and ten-minute reset-token expiry; SHA-256 opaque-token storage; one-time code exchange and transactionally atomic password/token consumption. Email snapshot/version and a fingerprint of the stored credential invalidate recovery after email/password changes. Account resend cooldown is 60 seconds with five requests/hour; atomic five-guess limit prevents concurrent bypass. IP limits are per API process (20 requests and 60 verify/reset attempts per operation/15 minutes), use req.ip/socket, and never trust a raw forwarded header. Missing/unverified/blocked/deleted/mismatched/throttled accounts and SMTP failure receive the same true response; actual SMTP duration is not timing-equalized. SMTP failure invalidates the code where storage is available. Request/response logging redacts codes, reset tokens and new passwords, including mixed/aliased operations. Rate counters stay out of GraphQL/default projections/JWTs. JWT issuance, expiry and existing-session policy remain unchanged; password recovery does not automatically sign in or revoke old JWTs.

GraphQL operations (public by necessity, no client member/role override): requestPasswordReset(input: {memberNick, memberEmail}): Boolean; verifyPasswordResetCode(input: {memberNick, code}): String (opaque resetToken); resetPassword(input: {resetToken, memberPassword}): Boolean. Frontend should retain the token only for the reset form and log in normally after completion. Existing MailService configuration/capture behavior applies; no real mailbox delivery was exercised. Frontend remains untouched.

Validation: **434 tests pass; 61 unrelated opt-in MongoDB cases skipped**. This run includes **22 new offline reset cases, 22 isolated MongoDB reset cases and 18 existing MongoDB email-verification cases**. Fresh gx_reset_test_*/gx_email_test_* databases used guarded exact-name cleanup and captured mail; no application data migration, real SMTP or provider transaction. Coverage includes normalization/DTOs, public GraphQL boundaries, optional/unverified email, pending SHOP recovery, expiry, wrong/replayed codes, concurrent resends/guesses/token consumption, budgets, changed identity/credentials/status, wrong token purpose, SMTP failure, transactional DB rollback, normal login and private logs/JWTs. API/batch TypeScript --noEmit --incremental false, npm run build and npx nest build gamenix-batch pass. Existing tests only received the two new MemberService dependency arguments. Git diff reviewed; only related backend source/tests/handoffs staged. Frontend, payment, order, event and community behavior are unchanged.

## Provider-independent sandbox workflow and guarded frontend — 2026-10-17

Implemented the current request's explicit fallback because actual account/channel eligibility could not be verified. The user conditionally approved PortOne V2 hosted checkout, PayPal sandbox, USD and one central test merchant; this settles the intended design, not actual compatibility. No matching payment configuration names were present in backend/frontend local environments or the process environment at inspection. No values were displayed or changed. **No PortOne SDK, real provider adapter, runtime simulator, provider request, real transaction, actual PortOne signature verification, receipt, payment email/notification or refund was added. Actual checkout remains disabled and Phase 7 remains blocked.**

Extended the existing collections, enums and getPaymentStatus. New shared PaymentCoreModule provides exact persisted-order USD snapshots, guarded createTestCheckoutSession/getTestCheckoutAvailability, request fingerprint/key reuse and an active-per-order partial unique index. Creation validates owned PAUSE order, ACTIVE buyer/SHOP, persisted item/shop/stock/fulfillment/totals and exact safe integer cents; it reads stored item prices and shipping, never frontend amounts/current repricing. Unique-index presence is checked before session/event creation. Historical foundation rows have no active default and uncertain/captured/manual-review rows still block recharge. Only the insert winner can create a hosted session through the provider port. Timeouts/DB failures retain the claim and never cancel/recreate blindly.

Default UnconfiguredPaymentProvider is permanently unavailable until a separately reviewed adapter replaces it. Flags alone cannot enable it; production mode is rejected. Generic verification binds provider ID, exact amount/USD, merchant/store/channel/PG identity, SANDBOX and server fingerprint; success requires matching capture ID/date and an atomic status/private-evidence persistence. getPaymentStatus explicitly whitelists owner fields plus computed verifiedSuccess; legacy SUCCEEDED/date fixtures alone are insufficient. Stale outcomes cannot downgrade capture or replace the original proof with a different transaction reference. Reconciliation remains separate and never auto-resolves.

Added rawBody HTTP webhook boundary, signature-verifier interface, durable allowlisted event metadata/hash/identity and duplicate/conflicting-event protection. Events schedule local trusted provider retrieval rather than apply browser/webhook status claims. Unknown local bindings are audited/ignored. Shared batch worker uses bounded attempts, five-minute CAS leases, recovery after lost webhooks/persistence failures and manual-review outcomes; a scheduling revision prevents an older in-flight retrieval from erasing a newer event schedule. Provider calls have a 65-second deadline; elapsed time never proves cancellation or accepts late responses. No worker creates sessions.

The narrowly authorized OrderService catch reports PROCESS stock/items/points failures to existing active/successful payments as REQUIRED and rethrows the original exception, swallowing only reporting failures. Every pre-existing stock/points/status write, single-shop/ownership/auth rule and separate-write policy is preserved. Database loss can still leave a reporting gap; no compensation or automatic repair was added.

Frontend commit **b9823ff — feat: prepare guarded sandbox checkout** independently adds availability, same-order/key resume identifiers, a PortOne URL allowlist and bounded no-cache authenticated status polling within the existing page. Disabled availability preserves existing order confirmation with no payment collected. Owner switches/unmount suppress stale payment results. Only persisted backend verifiedSuccess enables confirmation; no browser callback claim is trusted. Existing basket regression checks and new synthetic polling/session-retry checks pass. No redesign or frontend dependency change.

Final validation under Node 20.19.0:

- Full Jest suite with PAYMENT_TEST_MONGO_URI enabled: **421 passed, 30 unrelated opt-in MongoDB cases skipped; 21 passing suites**. Includes **49 real-Mongo payment cases** across the existing foundation and new workflow suites. Every database uses a fresh random gx_payment_test_* name and guarded exact-name cleanup; no marketplace application collection is written. Synthetic provider protocol/HMAC only; no provider/SMTP traffic.
- Coverage: USD/pickup/delivery/precision, owner/shop/order validation, concurrent same/different keys, conflicting reuse, missing unique index, capture/failure/cancel/expiry/unknown/late outcomes, incomplete/wrong amount/currency/merchant/store/channel/PG/environment/binding facts, forged/duplicate/conflicting events, absent local payment, stale capture results, event/retrieval races, deadlines, DB recovery, event/payment lease crashes/retries and reporting failure isolation.
- API and batch TypeScript --noEmit --incremental false: PASS. npm run build and npx nest build gamenix-batch: PASS.
- Frontend Yarn tsc --noEmit --incremental false, scripts/test-payments.cjs and scripts/test-basket.cjs: PASS. The basket harness includes the disabled flow plus synthetic same-order/key checkout retry. No real browser/provider E2E claim.
- Reviewed backend/frontend diffs; only relevant source/tests/handoffs staged. No env, secret, dependency, migration, generated build output or unrelated application edits.

Remaining gate: actual eligible merchant/store/PayPal TEST channel/PG/checkout TEST profile and buyer-country/USD verification; official SDK adapter with real raw-body signature/replay verification and strict retrieval; real sandbox transactions, redirect and signed delivery/recovery tests. Production additionally remains blocked by nontransactional/incomplete order creation, unreserved stock, PROCESS-before-stock/points, non-idempotent order creation, missing inventory-effect ledger and approved refund/repair policy. Read PAYMENT_READINESS and SANDBOX_PAYMENTS before enabling or beginning Phase 7. Earlier foundation-only entries below describe the previous commit.

## Sandbox payment persistence/query foundation — 2026-10-17

Completed the pre-checkout audit of current OrderService and Petora's PortOne integration, documented provider/currency/stock/refund/consistency decisions, and implemented the independently approved record/query foundation. The user confirmed South Korea, unchanged inventory timing and manual sandbox reconciliation, reported no test account, then retained USD with “or just keep $ as it is”. This supersedes the earlier KRW pricing proposal. Existing products, fees, emails and order business rules are unchanged. Full Phase 6 checkout integration remains blocked by provider/PG/account/channel/merchant compatibility, not by missing approval for those settled decisions.

Added PaymentModule/Service/Resolver, Payment and private persistence DTOs, independent payment/environment/currency/reconciliation/event enums, and private payments/paymentEvents schemas. Payment records require immutable member/order/shop identity, explicit safe-integer amount/currency, server request key/fingerprint, pricing version and USD source snapshot; source subtotal/shipping/total and USD charge consistency are validated. Optional provider IDs, timestamps and failure/reconciliation metadata prepare future processing. The only environment is SANDBOX. Unique indexes cover member request keys, assigned provider payment identities and provider event identities; owner/order/reconciliation and event due-work indexes are included. Mongoose strict schemas reject unrelated/card/raw-payload fields. No creator, fingerprint comparison, order reader/calculator, transition engine or event consumer exists yet.

Authenticated getPaymentStatus(paymentId) includes the current authenticated member and SANDBOX in its MongoDB predicate and uses an explicit public projection. Unknown/foreign records receive the same not-found response. Private keys, provider/merchant IDs, snapshots and raw failure text are absent from GraphQL. No payment creation/update mutation, provider SDK/request, webhook, cancellation/refund/retry/reconciliation worker, payment notification trigger or order/stock/point effect was added. This does not satisfy the provider checkout/security scenarios or make production payment/fulfillment safe.

Files: components/payment/*, components/components.module.ts, libs/dto/payment/*, libs/enums/payment.enum.ts, schemas/Payment.model.ts, schemas/PaymentEvent.model.ts and docs/ai/PAYMENT_READINESS.md, SANDBOX_PAYMENTS.md plus the four current handoffs. No dependency, environment, credential, frontend, order, product, mail or batch source change.

Validation on the final source: `npx jest --runInBand --silent` — 326 pass, 37 opt-in Mongo cases skipped by default (15 passing suites). The seven new payment Mongo cases also passed separately in a fresh random gx_payment_test_* database with guarded exact-name cleanup; only synthetic payment/event data was written and the database was removed. Together this increment executes 333 passing tests, including 44 offline payment cases and seven real-Mongo payment cases; the other 30 opt-in Mongo cases were not enabled in this phase. Coverage includes authentication, ownership, malformed/missing/foreign IDs, private GraphQL fields, integer/currency/source-total validation, pickup snapshot, immutable pricing/ownership, concurrent duplicate request/provider-payment/event records, missing provider IDs and separate reconciliation metadata. Synthetic success records are not provider verification tests. Both app TypeScript `--noEmit --incremental false`, `npm run build` and `npx nest build gamenix-batch` pass. No live database/index migration, provider request, real email or payment occurred.

Still unimplemented: a confirmed provider/merchant/channel, checkout sessions and server-calculated intents from complete persisted orders, provider verification with amount/currency/merchant/environment binding, signed raw-body webhooks, semantic replay/concurrency protection, cancellation/timeout/failure/reconciliation processing and all actual provider scenario tests. Existing order partial-write/stock/points limitations also block production. See [SANDBOX_PAYMENTS.md](SANDBOX_PAYMENTS.md) for the query and exact remaining work.

## Order confirmation and status emails — 2026-10-17

Studied Petora invoice/template/order code read-only and reused Gamenix Phase 2 MailService. Added ORDER_CREATED and ORDER_STATUS_CHANGED HTML/text messages with escaped reference/product/address content, quantities, stored prices/line totals, shipping and total in storefront USD formatting. Pickup omits delivery address and uses zero shipping. PAUSE/PROCESS/FINISHED describe processing only, with no paid/shipped/delivered claims or card fields.

OrderService now enqueues only after successful creation/items or complete successful PROCESS/FINISHED work. Buyer identity comes from authentication; only a valid current verified email is eligible. No-email/unverified accounts remain compatible. New private EmailDelivery schema/DTO/enums store recipient/version, template/status, unique event key, state, attempts, retry time, lease/token and explicit frozen snapshot. Worker reads actual MongoDB order/items/products and checks stored totals; no SMTP occurs in the API request. Enqueue/storage failures never reverse successful orders.

OrderEmailModule/Service is shared with gamenix-batch. The worker polls every 30 seconds, claims at most 20 rows atomically, prevents local overlap, and coordinates multiple workers with five-minute leases. It rechecks verified recipient/version before SMTP and uses up to five attempts with 1/5/15/60-minute retry delays. Failed/exhausted and skipped recipients have terminal states. Unique event keys preserve existing records on repeated triggers; stable Message-ID supports identifying recovery duplicates. Production batch script now explicitly sets NODE_ENV=production. Separate order/queue and SMTP/acknowledgement gaps are documented, without changing transaction policy or adding unsafe repair scans.

Files: components/order-email/*; components/mail/mail.service.ts, mail.templates.ts and order-email.templates.spec.ts; components/order/order.{service,module}.ts and order-email.spec.ts; libs/dto/mail/email-delivery.ts, libs/enums/email-delivery.enum.ts, libs/order-email.config.ts; schemas/EmailDelivery.model.ts; gamenix-batch/src/order-email.worker{,.spec}.ts and batch.module.ts; package.json batch production script; docs/ai/ORDER_EMAILS.md and the four current handoff docs. No dependency, frontend, auth/guard, stock/points/single-shop/lifecycle/transaction, payment, environment credential or real SMTP change.

Validation: full offline Jest — 282 pass, 30 opt-in Mongo cases skipped. Eight new order-mail integration cases then passed using the development connection only through a fresh gx_order_mail_test_* database with exact-name cleanup; no application collections were used and all mail was captured. This verifies concurrent dedupe, competing claims, actual persisted item prices, restart retries, frozen snapshots, email-reset suppression, crashed/exhausted leases and optional email. The other 22 legacy Mongo cases were not enabled. API and batch TypeScript --noEmit --incremental false, npm run build and npx nest build gamenix-batch pass. Focused offline tests additionally cover pickup/delivery totals, HTML escaping, SMTP failure/retry delays, queue isolation, correct buyer, creation/item/stock/point failure, duplicate transitions, module DI and private schema fields. See [ORDER_EMAILS.md](ORDER_EMAILS.md) for runtime and delivery limits.

## Persistent notifications — 2026-10-17

Implemented the notification phase on the existing `notifications` collection. Added `NotificationModule`, `NotificationService`, `NotificationResolver` and object/query/update DTOs. Existing WAIT/READ states and LIKE/COMMENT values remain. Added order/shop/event/account types and groups, nullable authorId for system notices, orderId/eventId refs, a server-generated unique dedupe key, and recipient/status/date indexes. No notification create mutation is exposed.

GraphQL operations are `getNotifications(input)`, `getUnreadNotificationsCount`, `updateNotification(input)` and `markAllNotificationsRead`. Authenticated recipient identity is always supplied by AuthMember. Lists paginate up to 100 and filter by group/status/createdAt bounds, with allowlisted timestamp sorting. Single-item and bulk read changes include receiverId in their MongoDB predicates.

Triggers: SHOP PENDING → ACTIVE/BLOCK sends approval/rejection to that SHOP; a completed order/item creation and each successful buyer-driven order status transition notify the owning SHOP; admin Event PENDING → PROCESS/PAUSED sends approval/rejection to the organizer; successful email verification notifies the verified account. All notification persistence is best-effort, recipient existence is checked, duplicate keys are ignored, and system-generated notices have no human author. No payment system or notification WebSocket delivery was added.

Files: `apps/gamenix-api/src/components/notification/*`, `apps/gamenix-api/src/libs/dto/notification/*`, `libs/enums/notification.enum.ts`, `libs/config.ts`, `schemas/Notification.model.ts`, plus service/module wiring in Components, Member, Order, Event and EmailVerification. The email-verification module test fixture now provides the extra Notification model.

Validation: `npx jest --runInBand` — 234 passed, 22 skipped across 8 suites; the skipped cases require explicitly configured test MongoDB URIs. API and batch TypeScript checks pass; `npm run build` passes. Focused notification cases cover GraphQL operation exposure, recipient-scoped filters and updates, unread count, pagination, mark-all, dedupe, missing recipient and trigger recipient mapping. No live index migration/deployment was performed.

Socket privacy review: gateway accepts unauthenticated guests; globally broadcasts chat messages and presence; sends the same in-memory message history to every connection; logs token query parameters. Notifications remain persistent-only. Do not use the public chat broadcast for private notifications.

## SMTP email verification — 2026-10-16

Implemented backend Phase 2 with MailModule/MailService, Nodemailer SMTP and bounded development/test capture, escaped templates, purpose-scoped hashed authentication tokens and owner-request/public-token GraphQL mutations. requestEmailVerification has no client-selected member/email/redirect; verifyEmail checks purpose, hash, expiry, unused state, current email/version and current eligible status. ACTIVE accounts and PENDING SHOP accounts are supported; verification does not approve shops or change username/password login.

Read-only MongoDB hello confirmed the development replica set supports transactions; no dedicated test URI was configured initially. Authentication-only transactions now serialize resend budgets and atomically consume a grant/update verification. Startup rejects unsupported topology and waits for token indexes. Added unique hash, expiry TTL and member/purpose/consumed indexes. Private email-version increments on explicit self/admin email updates invalidate old links even after address restoration; no member migration/backfill is required. Resends: 60-second cooldown/5 per account per hour persisted on Member, plus bounded per-process IP request/verification limits. Failed deliveries invalidate the grant without verifying the member. Token-bearing GraphQL request bodies are not logged; internal state is absent from GraphQL/JWT payloads.

Files/purpose: components/mail/* provides reusable transport/templates/tests; components/email-verification/* provides module/resolver/service and offline/isolated-MongoDB tests; schemas/AuthToken.model.ts and libs/dto/auth/*/libs/enums/auth-token.enum.ts define private grants/input; existing Member schema/output-internal fields, service and one email test support atomic version invalidation; AuthService excludes new private fields; ComponentsModule wires the feature; Logging.interceptor.ts hides only the two verification request bodies. package.json/package-lock.json add only nodemailer 10.1.2 and @types/nodemailer 8.0.2 and declare Node >=20. The older Node-compatible mailer release was rejected due to npm advisories; no machine runtime setting changed. docs/ai/EMAIL_VERIFICATION.md documents environment variables, GraphQL, limits, topology, tests and later frontend requirements; migration/next-step notes point to it.

Final validation under installed Node 20.19.0: 242 tests PASS across 8 suites, including 61 new cases (43 offline, 18 actual MongoDB transaction/index/concurrency cases). Four existing member-email Mongo tests skipped because MEMBER_TEST_MONGO_URI was unset. New integration tests used the development cluster only through a fresh gx_email_test_* database, with exact-name guarded cleanup; temporary database creation/deletion succeeded. API and batch TypeScript --noEmit --incremental false PASS; npm run build PASS; added Nodemailer release has no npm-reported advisory. No real SMTP emails, application-record writes, credentials/environment edits, migrations, frontend changes, guard changes, password recovery or unrelated feature work. Real SMTP delivery/frontend completion remains unverified. Existing event/product edits, removed tests and prior handoff additions are excluded from this task's commit.

## Password update security — 2026-10-16

Fixed the two existing member update paths without changing signup, login, AuthService, guards, JWT policy, DTOs, schemas or frontend code. MemberService.updateMember and updateMemberByAdmin now reject supplied null/non-string/empty/whitespace-only passwords and call the existing AuthService.hashPassword once before passing a new password to Mongoose. Omitted passwords are untouched. Intentional spaces in a nonblank password are preserved; the existing DTO length rule remains 5–12 characters. Existing role/status restrictions, SHOP approval, shopName and email behavior are unchanged.

Files:

- apps/gamenix-api/src/components/member/member.service.ts: minimal validation and bcrypt preparation in both update methods.
- apps/gamenix-api/src/components/member/member-password.spec.ts: 37 offline cases using real bcrypt/JWT with an in-memory model stub, covering signup, USER/SHOP username login, both password updates, old/new comparisons, single hashing, profile-only updates, invalid values, preserved spaces, hashing failure, self-role restrictions and existing DTO length boundaries.
- docs/ai/COMPLETED_TASKS.md: this task's evidence only; pre-existing ledger additions remain unstaged.

Validation executed:

- Before the fix, the new password suite reproduced the vulnerability: 22 failed / 15 passed.
- env -u MEMBER_TEST_MONGO_URI -u EVENT_TEST_MONGO_URI ./node_modules/.bin/jest --runInBand --silent --cacheDirectory /private/tmp/gamenix-password-phase1/jest-cache — PASS: 181 tests across 5 suites, including all 37 new cases. Four MongoDB integration tests / one suite were skipped explicitly to avoid database writes.
- ./node_modules/.bin/tsc -p apps/gamenix-api/tsconfig.app.json --noEmit --incremental false — PASS.
- ./node_modules/.bin/tsc -p apps/gamenix-batch/tsconfig.app.json --noEmit --incremental false — PASS.
- npm --cache /private/tmp/gamenix-password-phase1/npm-cache run build — PASS (API webpack build).

No dependencies, collections, migrations, live database writes, new authentication flows or unrelated fixes were introduced. This prevents new plaintext writes through these update methods; it does not repair previously saved plaintext passwords or revoke existing JWTs. Existing password policy and other audited concerns remain separately scoped. Source/ledger changes are isolated from pre-existing event/product edits and deleted tests; only this ledger section is included in the task commit.

## Separate SHOP username and public shop name — 2026-10-15

Completed backend and frontend using the existing Member collection, resolver/service/DTO architecture, Apollo documents and account/public components. memberNick remains the login username; shopName is the optional public business name, trimmed and validated at DTO/service/schema boundaries (1–100 characters when supplied). SHOP signup stays PENDING; existing approval, auth/passwords, guards, USER registration and private-email rules remain intact. Legacy accounts need no backfill and use their existing public display fallback until configured. Self-name writes enforce authenticated identity plus current SHOP/ACTIVE ownership; the existing admin mutation can name resulting SHOP records and removes the field on authorized role changes away from SHOP. Public directory search also accepts the public name.

Backend files and purpose:

- apps/gamenix-api/src/schemas/Member.model.ts: optional trimmed SHOP-only persisted shopName with length validation, including Mongoose update validation.
- apps/gamenix-api/src/libs/dto/member/member.input.ts, member.update.ts, member.ts: expose the field through existing signup/update inputs and nullable Member output.
- apps/gamenix-api/src/components/member/member.service.ts: normalize/restrict signup and owner/admin name writes, preserve approval/legacy flows, support business-name directory search.
- apps/gamenix-api/src/components/member/member.resolver.ts: reject foreign IDs on name-bearing self-updates before existing authenticated-ID handling.
- apps/gamenix-api/src/components/member/member-shop-name.spec.ts: 62 schema/DTO/service/actual Nest GraphQL authorization, bcrypt/JWT/login/approval/legacy and Mongoose query validation cases.
- docs/ai/BACKEND_MIGRATION.md, FRONTEND_MIGRATION.md and this COMPLETED_TASKS.md entry: document the contract, client behavior, rollout order and validation. Pre-existing unrelated documentation/source edits remain outside this task's commit.

Frontend files and purpose:

- apollo/user/query.ts, apollo/user/mutation.ts, apollo/admin/query.ts, apollo/admin/mutation.ts: add shopName to existing Member selections; private email/verification selected only by owner-protected GET_MEMBER, with no duplicate operation.
- libs/types/member/member.ts, member.input.ts, member.update.ts and libs/types/customJwtPayload.ts: represent optional name in existing contracts and private email output for the account form.
- apollo/store.ts and libs/auth/index.ts: carry/reset the public name in existing auth state and submit it only for SHOP signup; preserve username/password-only login.
- pages/account/join.tsx: SHOP-only Shop Name input, separate Username and trimmed/blank/length validation; USER form unchanged.
- libs/components/mypage/MyProfile.tsx, MyMenu.tsx and scss/pc/mypage/myProfile.scss: Shop Information section with separate read-only username, editable business name, owner-only read-only email, existing photo; safe existing-member mutation and matching responsive styling.
- libs/components/common/ShopCard.tsx, libs/components/homepage/TopShopCard.tsx and pages/shop/detail.tsx: public business names with legacy fallbacks.
- libs/components/product/ProductCard.tsx and pages/product/detail.tsx: product seller business names without changing product/basket logic or links.
- libs/components/member/MemberMenu.tsx, MemberFollowers.tsx and MemberFollowings.tsx: SHOP public identities while retaining ordinary USER names.
- libs/components/common/CommunityCard.tsx, pages/community/detail.tsx, libs/components/product/Comments.tsx, Review.tsx and libs/components/shop/ReviewCard.tsx: SHOP community/review labels use business names; ordinary USER identities remain unchanged.
- scripts/test-shop-name.cjs: offline actual auth-helper payload/JWT checks and rendered public-card legacy/SHOP/USER/link checks, without new dependencies.

Verification: backend API/batch TypeScript and API build PASS; full Jest run PASS (144 offline tests, including 62 new shop-name cases, with four existing email Mongo cases skipped because MEMBER_TEST_MONGO_URI is unset). Frontend yarn tsc --noEmit --incremental false, yarn node scripts/test-shop-name.cjs, yarn node scripts/test-basket.cjs and yarn node scripts/test-product-categories.cjs PASS (Node20). Apollo AST checks parse all 54 existing documents; all 22 Member selections containing memberNick include shopName, private email selections occur only in GET_MEMBER. Isolated Next/Chrome with intercepted GraphQL and mocked sockets verified separate SHOP signup payload, username-only login, owner name trim/save without memberNick/email, read-only owner email/username, legacy omission, unchanged USER signup/profile, public shop/product cards/details, light/dark desktop/mobile forms and tablet profile without horizontal overflow. Screenshots inspected and no browser runtime exceptions. Diff/whitespace and selective staging reviewed.

No live MongoDB writes, migrations/backfills, real account/signup/approval mutations, emails, dependencies, collections or product/basket/order business changes. Existing unrelated backend work is preserved. Backend must be deployed before frontend requests the new GraphQL field.

## Member email fields and verification status — 2026-10-13

Implemented the requested backend-only member email foundation after reading the four handoff files and inspecting Member schema/DTOs/service/resolver, signup/login/JWT behavior, existing uniqueness rules, shared/nested member results and dependencies. Preserved the NestJS resolver/service/module pattern and existing optional-email account behavior. No schema relocation or duplicate DTO was introduced.

Modified source files, relative to apps/gamenix-api/src:

- schemas/Member.model.ts: optional string memberEmail with trim/lowercase/email validation; default-false memberEmailVerified; select:false for both; unique partial email index including only strings, excluding missing/null values. Existing phone/nick indexes are unchanged.
- libs/dto/member/member.input.ts: optional nullable memberEmail with class-transformer normalization and class-validator IsEmail for signup; no client verification field.
- libs/dto/member/member.update.ts: the same optional normalized/validated email for existing self/admin update inputs; no client verification field or new DTO.
- libs/dto/member/member.ts: optional nullable email and verification output fields on the existing shared Member TypeScript/GraphQL type.
- libs/enums/common.enum.ts: safe USED_MEMBER_EMAIL error message; existing nickname/phone duplicate message remains.
- components/member/member.service.ts: validate/normalize raw email before persistence, reject client verification writes, reset verification together with explicit email submissions/clears, enable Mongoose update validators and map email duplicate-key errors on signup/self/admin updates. Explicit backend email projection supports current owner reads. Shop/admin list aggregation excludes both private fields. Removed full shop-result/error logging that could include member email. Existing role/status restrictions, hashing, nickname/password login and statistics remain.
- components/member/member.resolver.ts: Member field resolvers return private fields only to the authenticated owner, including nested Member data produced by aggregations; fetch current database values via the service. Anonymous/other-account fields are null. Legacy owner email is null and missing verification is false. Existing operations/guards/upload implementation remain.
- components/auth/auth.service.ts: omit email and verification from JWT payloads, preventing new private data from appearing in decoded tokens and existing socket member broadcasts. Signing/verification/password behavior is unchanged.

Added tests:

- components/member/member-email.spec.ts: 61 offline cases covering DTO/schema format/normalization/optionality/index/default contracts, raw service validation and verification spoofing, duplicate-error handling on all write paths, optional-email USER/SHOP signup, USER/SHOP/ADMIN nickname/password login, same-write reset/clear/resubmission, unrelated-update preservation and backend projections. A real Nest GraphQL application schema executes existing guards, global ValidationPipe and field resolvers without opening an HTTP listener or connecting MongoDB; tests cover public member/shop/nested-product privacy, owner/legacy reads, rejected verification inputs and private-field exclusion from plain/document JWT payloads.
- components/member/member-email.integration.spec.ts: four opt-in real-MongoDB tests for missing/null emails, concurrent normalized uniqueness, duplicate update atomicity, reset/preservation, admin clearing and legacy records. Requires MEMBER_TEST_MONGO_URI; creates/drops only a fresh gamenix_member_email_test_* database. Never uses the application database URI.

Behavior: omitting memberEmail preserves it and its status; null clears it; empty/whitespace/invalid email is rejected. Every explicit email submission, including the same normalized address, resets verification=false. Authenticated owners select the fields with existing getMember(memberId: ownId). Signup/login return a token; use that token for the owner query, since those unauthenticated mutations do not authenticate field resolution. Backend verification is not implemented and normal admin updates also cannot set verification=true.

Validation:

- npx tsc -p apps/gamenix-api/tsconfig.app.json --noEmit — PASS.
- npx tsc -p apps/gamenix-batch/tsconfig.app.json --noEmit — PASS.
- npm run build — PASS (API).
- npm test -- --runInBand --silent — PASS: 95 tests across 4 suites; 4 MongoDB tests / 1 suite skipped because MEMBER_TEST_MONGO_URI is unset. Includes 61 new offline cases and all 34 pre-existing tests.
- Git diff/staged scope review and git diff --check — PASS. Only task-specific source/tests and documentation additions are staged; pre-existing event/product changes, removed tests and unrelated documentation edits remain outside the commit.

Updated this ledger, BACKEND_MIGRATION, DECISIONS and NEXT_STEPS with current behavior, rollout limits and later verification design. No SMTP/Gmail/provider, token endpoints, verification sending, password reset, order/payment email, payment processing, frontend changes, dependency installation or live member migration was performed. No live MongoDB/index/concurrency or HTTP/e2e test ran; offline duplicate-key mocks/index definitions do not prove deployed enforcement. Check index installation before rollout. Next verification work requires a provider plus secure single-use expiring tokens bound to the current email and trusted conditional verification writes; see NEXT_STEPS.

## Original homepage video restored — 2026-10-13

Completed in gamenix365-next commit 549352c (fix: restore homepage video section). Inspected current Home/Advertisement/homepage SCSS, recovered the pre-redesign Advertisement JSX and desktop/mobile video-frame styling from commit 6e69b2f, and compared original nestar-next Advertisement and homepage video styles. Restored the original HTML5 video markup in Advertisement.tsx with autoPlay, muted, loop, playsInline, preload auto, no browser controls and 100% width/height with objectFit cover. Both old device branches contained identical JSX; one shared return retains that behavior without a redundant hook.

Source is exactly /video/Home%20Video%204.mp4 for the user's expected public/video/Home Video 4.mp4. That file is not present yet; no video was downloaded, generated, renamed or substituted, and the existing ads.mov remains untouched. Kept the original rounded/clipped frame and 360px desktop/220px phone heights; scoped width/max-width and bottom spacing align it with the current premium homepage, with a black background matching the original Nestar frame. Moved the existing Level Up Your Setup markup unchanged into SetupEditorial.tsx and placed restored Advertisement after ShopByCategory and before Events. Hero/header/footer, all other sections, Apollo queries, backend source and shared marketplace behavior remain unchanged. Trending is not restored.

Validation: Yarn TypeScript (yarn tsc --noEmit --incremental false, Node 20.19.0), TSX Prettier check and git diff --check PASS. Source comparisons confirm the editorial copy is identical except for its component name, original SCSS prefix is preserved, and other homepage sections/layout/header/footer/Apollo/product/event pages/mobile styles are untouched. Isolated Next/Chrome with intercepted query fixtures and mocked sockets verified section order, exact encoded source and MP4 type, autoplay/muted/defaultMuted/loop/playsInline, hidden controls, cover sizing, original heights/10px rounded clipping, matching category/content widths and no horizontal overflow at 1440/1024/800/600/390/320px. Screenshot inspected; no runtime exceptions or mutations. The expected source returned 404 because the user has not uploaded the file, so actual playback/autoplay decoding remains unverified until upload. Reviewed/staged only four explicit relevant frontend paths; frontend working tree clean. Required sibling handoff update remains separate. Temporary preview/browser processes cleaned up; user servers and backend data preserved. No production build or new dependencies.

## Premium homepage product sections — 2026-10-13

Completed in gamenix365-next commit 64d551b (fix: redesign homepage product sections). Read backend AI handoff notes, original nestar-next Home/PopularProperties/TopProperties/Advertisement components and existing current homepage, cards, Apollo queries, catalog routing/filters/category constants, SCSS and public event service rules before editing. Kept Pages Router, existing layout wrapper, simple MUI/React local-state/query/handler patterns and existing dependencies.

Homepage now renders Popular Products -> Level Up Your Setup -> Editor's Picks / Top Products -> Shop by Category -> Gaming Events between the unchanged hero and footer. Removed only homepage TopShops/CommunityBoards placement to match the requested sequence; those shared components and related pages remain. Trending is not restored. Desktop/mobile use one section sequence with scoped responsive SCSS rather than duplicate markup.

Popular Products reuses GET_PRODUCTS sorted productViews DESC, with backend pagination limit 4 for a compact four-column desktop grid. Top Products retains GET_PRODUCTS sorted productRank DESC and its original like handler, with limit 3 to display one larger featured product and two smaller supporting products; no new recommendation algorithm or client sorting/filtering. Both reuse the existing shared ProductCard productPage presentation and unchanged AddToBasket, displaying backend image/name/shop/price/views/likes and Add to Cart. Popular adds the existing Top Products mutation/refetch/auth-error pattern using the unchanged LIKE_TARGET_PRODUCT document. Loading, empty and GraphQL-error messages use existing MUI patterns, without sample products.

Replaced the old Advertisement video presentation with one cinematic setup photo, short LEVEL UP YOUR SETUP copy and an Explore Equipment link to /product. Reuses the existing hero/about photo as a local editorial asset; original hero image/code remains unchanged. Added homepage-only ShopByCategory with four photographic tiles for KEYBOARD, MOUSE, HEADPHONES and the existing components group (CPU/GPU/RAM). Links use the existing Next Link pathname/query input JSON structure and supported typeList filter, page 1/limit 9/createdAt DESC. No new URL scheme, query definition, category taxonomy or catalog-page change. Local editorial category photos and source links are under public/img/homepage; they illustrate equipment/categories and are never used to fabricate marketplace product records.

Gaming Events retains the exact existing GET_EVENTS options: page 1, limit 4, eventDate ASC, PROCESS, network-only. Public getEvents/getEvent still enforce PROCESS/nondeleted records on the unchanged backend. Redesigned image/title/type/date/description cards show two per desktop row and one on mobile, linking to actual /events/detail?id values. The section is now visible on mobile. Preserved View All Events and loading/empty/error behavior, with subtle CSS fade/hover and reduced-motion support. No fake events, authorization workaround or approval changes.

Scoped all new styles to the homepage store-home class under the existing desktop/mobile wrappers and preserved the previous homepage SCSS prefix, including hero search/filter/modal styling. Source comparisons verified untouched LayoutHome/Top/Footer/HeaderFilter, Apollo operations, product/event pages, shared ProductCard, basket/order/auth logic, existing mobile homepage styles and header/footer SCSS. No backend source, new dependency, custom hook, provider integration or unrelated page changes. Reviewed/staged only 13 explicit relevant homepage component/style/photo/source paths; frontend working tree clean after commit. Required sibling handoff update remains separate and preserves pre-existing backend documentation work.

Validation (Node 20.19.0): Yarn TypeScript checks during section phases and final yarn tsc --noEmit --incremental false PASS; new TSX/project-format SCSS checks and git diff --check PASS; existing yarn node scripts/test-basket.cjs PASS. An intermediate MUI Box generic union diagnostic was resolved by using the original explicit component='div' pattern. Isolated Next/Chrome with intercepted GraphQL fixtures and mocked sockets verified required section order, exact existing sorting/public-event request options, real fixture field/image/shop/price rendering, four-column Popular grid, compact 1+2 featured layout, actual product/event detail IDs, existing Add to Cart and like mutation/refetch, all four category filter destinations, loading/empty/error states, desktop/mobile light/dark bounds without horizontal document overflow at 1440/1280/1024/900/800/600/390/320px, and reduced-motion event animation override. Screenshots reviewed; portrait-photo intrinsic sizing was constrained to keep featured cards compact. No runtime exceptions or unexpected mutations. Fixture records and browser scripts are only in temporary files, not application code. Read-only anonymous calls to the running port-3007 API using unchanged query documents returned 4 public Popular products, 3 public ranked products and 1 public nondeleted PROCESS event with these options. No live mutations, real chat messages, stock/orders/accounts or backend data changed. No production build was requested/run. Temporary preview/browser processes cleaned up; user servers preserved.


## Homepage Trending removal, Community public chat and AI assistant interface — 2026-10-13

Completed in gamenix365-next as three separate requested commits: 5efee1c (fix: remove homepage trending products), e3b2c42 (fix: move open chatting to community), and 6e69b2f (feat: add AI shopping assistant interface). Read the backend AI handoff notes and inspected original nestar-next homepage, Community navigation and Chat state/handlers, current frontend layouts/chat/community/product queries and backend product resolver/socket gateway before editing. Followed existing local React state, MUI, layout wrappers and SCSS patterns; no dependencies, custom hooks, backend source or new GraphQL operations.

Removed only the TrendProducts import/rendering from both homepage branches. PopularProducts and TopProducts, the shared TrendProducts file and all homepage SCSS remain unchanged; existing section padding naturally provides spacing. The hero, advertisement, shops, events and board sections keep their existing placement and design.

Community list and detail navigation now end with Open Chatting after Free Board, Recommendation, News and Humor. A separate styled Button opens the existing Chat component without selecting a fictitious article category or changing board requests. Removed the global floating chat button and all three global Chat mounts. Reused Chat's existing socketVar/userVar, online count, history, incoming messages, send payload and input handlers unchanged. Local open/onClose props and an existing MUI Dialog provide a responsive popup, close button, Escape/backdrop close and normal focus handling. Labelled it Public Open Chatting and explicitly stated that messages are visible to everyone; no private messaging claim, authentication change, new socket connection or WebSocket protocol/authorization change. Existing gateway remains Guest-capable global broadcast with five in-memory messages, as documented previously.

Mounted ShoppingAssistant in the existing Home/Basic/Full public layouts on desktop and mobile. Its small bottom-right cyan MUI robot icon opens the Gamenix365 AI Assistant panel, with message area, clearly visible Not connected status, editable budget/needs draft, disabled Send and Close buttons. Scoped SCSS supports current light/dark palettes, hover/focus/reduced-motion behavior, safe-area spacing and short-screen status visibility. It produces no replies or product recommendations and makes no API/provider calls. No AI integration was found in current frontend/backend source or backend dependency manifest. The existing GET_PRODUCTS document already includes productName, productType, productPrice, productLeftCount, productStatus and productDesc, with category/price pagination filters in ProductsInquiry. A backend AI endpoint and real, availability-aware catalog recommendation logic are still missing; structured specifications have no dedicated current product field. These are future work requiring separate authorization.

Validation: Yarn TypeScript checks after each phase, final yarn tsc --noEmit --incremental false, new-file Prettier check, git diff --check and existing yarn node scripts/test-basket.cjs all PASS (Node 20.19.0). Reviewed/staged only explicit relevant frontend paths for each commit; frontend working tree clean. Source comparisons confirmed unchanged Popular/Top/shared Trending components, homepage SCSS, Apollo/auth/cart/basket/orders and existing Chat socket/message handlers. Isolated Chrome/Next preview with intercepted GraphQL fixtures and mocked sockets verified homepage section order and fixture product rendering, absence of Trending/old floating chat, Community list/detail navigation order and existing article content, unchanged board selection, no board request on chat open, public history/incoming/send payload behavior, close/Escape, assistant draft/disabled-send without requests or fake replies, one assistant in all three public layouts, light/dark panel bounds at 1440/1024/800/390/320px and short-height status visibility. Screenshots inspected; no runtime exceptions or unexpected mutations. Responsive assertions concern the new panels/buttons: an existing TopShops carousel overflow was observed at a narrower desktop viewport and left unchanged because the user explicitly excluded other homepage changes. No live messages, account/product/order data, backend source, approval rules, production build or AI service were changed. Temporary scripts/screenshots/previews are outside the repository; owned preview/browser processes were cleaned up, preserving the user's running servers.


## Homepage Events connected to public backend data — 2026-10-13

Connected only libs/components/homepage/Events.tsx in gamenix365-next. Inspected the original nestar-next Events/TopProperties components, current homepage and homepage query patterns, EventBoard/detail route, shared GET_EVENTS document and GamingEvent type, plus backend resolver/input/output/enums/EventService and existing event-public.spec.ts. Kept the Nestar-style local EventCard/Events structure, MUI Stack/Box and existing SCSS classes.

Removed the static tourism-event array and its local EventData shape. The component now calls the existing GET_EVENTS via Apollo useQuery with page 1, limit 4, eventDate ASC and search.eventStatus PROCESS, using network-only like the public event listing. Pagination/sorting happen on the backend; no duplicate operation, fetch-all/manual filtering, custom hook, dependency or backend change. Cards use GamingEvent data and the existing imageUrl helper for eventImage, display eventTitle, Tournament/Giveaway, scheduled eventDate and existing hover description, and link to /events/detail?id=<actual event ID>. Root links retain the existing card classes/background layout and allow normal text wrapping. Added View All Events -> /events using the existing homepage more-box styling because this component had no such link. Loading, GraphQL error and empty messages preserve the section heading/container without fake cards.

Public visibility is enforced by backend getEvents/getEvent, which fix eventStatus PROCESS and deletedAt null; findEvents combines client status filters without replacing those constraints. Creation fixes PENDING and only ADMIN may change pending approval status. No insecure frontend-only visibility workaround was added. Read-only anonymous calls to the running port-3007 API using the unchanged GET_EVENTS document returned one active/nondeleted event for PROCESS and zero for PENDING, PAUSED and FINISHED; limit, chronological sorting and image/title/date output passed checks. Existing backend public-visibility tests were inspected, not rerun. These checks concern the current local API/source and do not claim deployment-wide authorization verification.

Preserved pages/index.tsx, hero, product/shop/community sections, header/footer, authentication, event creation/registration/list/detail, all GraphQL definitions and SCSS. The current homepage omits the Events section on actual mobile devices; that placement remains unchanged. Staged only that frontend source file and committed as d2a0a27 (fix: connect homepage events to backend). This required backend handoff update is separate and preserves existing backend work.

Validation: yarn tsc --noEmit --incremental false PASS at baseline and after implementation (Node 20.19.0); Yarn Prettier check and git diff --check PASS. Isolated Chrome with intercepted query fixtures verified the exact existing GET_EVENTS request/options, four date-sorted public cards from a larger fixture set with pending/paused/finished/deleted entries excluded by the simulated public API, image URLs, titles/types/dates, actual event-ID detail navigation and View All Events navigation. Deferred responses verified loading without cards; empty/error cases retain the section and no samples. Compared before/after geometry and computed color/background/padding/display snapshots for header/hero, all existing homepage sections and footer at 1440/1024px and actual iPhone user agent at 390px: equal snapshots, including unchanged mobile omission of Events. Screenshot inspected. No runtime exceptions, unexpected mutations or live data writes. No production build. Temporary preview/browser tests/screenshots are outside the repository; owned processes are cleaned up and user servers left running.


## Frontend basket and order processing separated — 2026-10-13

Implemented the user's two-step shopping request in gamenix365-next. Inspected the original nestar-next MyPage/MyProfile/PropertyCard patterns and current Basket/Orders/cart/auth/Apollo documents, plus backend OrderInput/OrderItemInput/enums/OrderService before editing. Nestar has no existing order-processing route; the current /orders page combined history and inline checkout. Added the smallest separate /orders/process page using the same NextPage, layout wrapper, MUI, SCSS, reactive variables and simple handlers.

Basket now contains product images/names/unit prices, quantity controls, removal, subtotal and Place order, retaining the existing clear-basket action. Removed fulfillment, address, shipping, estimated total and direct createOrder submission. Place order checks empty/auth/active status and navigates to /orders/process without changing basket contents or persistence. Guest login now returns to that processing route. AddToBasket silently updates the basket on success, clears stale errors and retains existing stock/unavailable/single-shop failures; product-card styling is unchanged.

Processing displays compact product rows with quantities/unit prices/line totals, existing DELIVERY/PICKUP options, address only for delivery, existing shipping estimates, subtotal/final estimated total and an explicit payment-coming-soon placeholder. No payment provider, sensitive fields, fake payment transaction or payment-success claim. Only final Confirm order invokes the unchanged CREATE_ORDER document with fulfillment/address/productId/itemQuantity. Existing active-account/address checks, duplicate-submit ref, order-history cache eviction and clearPurchasedCart behavior are retained. Failures keep all items and show the server message for retry. Success clears only the captured purchased quantities for the originating account and navigates to /orders, whose existing Awaiting confirmation tab shows the new order. Additional quantities/products added while pending remain saved; an old-account response cannot clear or navigate the new account.

Removed the duplicate inline checkout from /orders. Its getMyOrders query, pagination, history display and status-update handler remain; the status handler is byte-identical to HEAD. Existing PAUSE creation, later stock/status/points transitions, calculations and auth rules are unchanged. No backend source, GraphQL operation, enum/type, cart persistence helper, dependency or custom hook changed. Added responsive processing styles in the existing order SCSS and a route title in LayoutBasic; the existing light/dark palette is supported.

Seven frontend paths: libs/components/basket/Basket.tsx, libs/components/basket/AddToBasket.tsx, libs/components/layout/LayoutBasic.tsx, pages/orders/index.tsx, pages/orders/process.tsx, scss/pc/order/order.scss and scripts/test-basket.cjs. Staged only those explicit paths and committed as 9f62f79 (fix: separate basket and order processing). This backend handoff entry is separate from the frontend commit and preserves unrelated backend working-tree changes.

Validation: Yarn TypeScript check (yarn tsc --noEmit --incremental false, Node 20.19.0) PASS at baseline, after flow implementation and after UI/final formatting. Updated yarn node scripts/test-basket.cjs PASS for original SSR/storage/malformed/single-shop/auth/account/cross-tab checks plus product-only basket navigation/quantity/remove/clear, processing shipping and trimmed/required address, pickup without address, payment placeholder, final mutation/cache eviction, failure/retry, purchased-only clearing, duplicate guard, pending account isolation and silent-add/error behavior. git diff --check PASS; reviewed scope and confirmed cart/auth/Apollo/enums/types/product card unchanged. Isolated Chrome using intercepted GraphQL verified actual add/quantity/remove, no success notice, useful stock/single-shop errors, basket-to-processing navigation/refresh/return without mutations, delivery/pickup/address/fee/summary/placeholder, failed creation and refresh/retry, successful creation/history navigation/storage removal, duplicate submit and additional-quantity preservation during pending requests. Desktop layout uses two columns above 800px and one below; no document overflow at 1440/1024/800/390/320px, including actual iPhone user agents at 390/320. Light/dark desktop/mobile screenshots inspected. No final browser runtime exceptions or unexpected mutations. An initial temporary symlinked preview had duplicate React instances; using a cloned local dependency directory resolved the test setup without changing repository configuration. No live orders, stock, payments, accounts or backend data changed, and no production build was run. Temporary tests/previews/screenshots remain outside the repository; owned preview/browser processes are cleaned up and user servers left running.


## Frontend persistent light/dark mode beside language controls — 2026-10-12

Added the requested moon/sun button between the existing notification and flag controls in gamenix365-next, including the mobile header. Reused the existing Apollo themeVar with typed light/dark values and the current MUI ThemeProvider; no new state library, dependency, custom hook, backend contract or route. Labels/tooltips are translated in English, Korean and Russian, with keyboard focus and pressed-state support.

Light remains the default. The preference is saved as gamenix365.theme, restored on refresh and synchronized across tabs through the existing app storage listener without reloading. Storage failures retain an in-memory working toggle. A small document-head script applies the saved SCSS palette before paint. The existing auth/basket initialization and storage branches remain intact; the basket test harness now supports useMemo for the app theme.

Connected the existing fixed SCSS and inline neutral colors to semantic CSS variables with their exact original light values as fallbacks. Dark mode supplies readable text, muted text, charcoal surfaces, borders, cyan accents, hero gradients and the notice highlight. Cyan branding, header/footer and current layout/interaction patterns remain. Adjusted two homepage search icons for dark backgrounds and the event CTA/hero hover text for contrast. Changes are uncommitted; no commit was requested for this task. This required backend documentation entry preserves unrelated backend work.

Validation: yarn tsc --noEmit --incremental false PASS after each implementation phase and final adjustments (Node 20.19.0); yarn node scripts/test-basket.cjs PASS; git diff --check PASS. Isolated Chrome with intercepted GraphQL fixtures verified button order/labels and both palettes, dark mode across Home/Shops/Events/Products/Orders/My Page/CS/Join, refresh persistence, real cross-tab updates without reload, Korean language switching, storage-write failure fallback and desktop header fit at 1440/1100/1024/800/700px. Actual iPhone user-agent checks verified mobile controls at 390/320px with no document overflow. Visible text checks across the eight routes found no contrast ratios below 3 in the final dark fixtures; screenshots were inspected, including mobile and corrected homepage icons. No runtime exceptions or unexpected mutations. No production build or live backend persistence test. Temporary fixtures/previews/screenshots remain outside the repository; user frontend/backend servers were untouched.


## Frontend Shops directory and public shop cards — 2026-10-12

Completed in gamenix365-next commit c4311f6 (fix: improve shops page design). Read the backend AI handoff notes, current shop/member/product queries, existing shop detail route and original nestar-next agent/property listing components and SCSS before editing. Preserved the existing simple MUI/Next Link/SCSS patterns and Apollo integration.

The shop directory now uses three desktop columns above 1024px, two tablet columns above 700px and one mobile column, with a centered 1200px container, 24px desktop gaps and a 384px maximum card width. Single results retain their grid-column width. Search and sorting align with the cards; directory padding, pagination and loading/error/empty states are compact. Real memberImage paths render in a contained 16:9 area with object-fit:cover and subtle corners. Cards show the existing public shop display name (memberFullName or memberNick), optional description, memberProducts, memberViews and memberLikes, plus a small View Shop link. A full-card link and the CTA both reuse /shop/detail?shopId=...; the existing like button retains its handler and does not trigger navigation.

The user's explicit instruction to exclude shop following and owner account information supersedes earlier frontend entries describing public shop-follow UI. Removed the follower count from cards, and removed the follower count, Follow/Unfollow control and associated unused subscription handler from the existing public shop profile. Removed its account phone display and replaced that area with the existing product count. Shared member/community follow operations, GraphQL documents and types remain untouched. The existing shop profile still loads its information, scoped products, category filtering, pagination and reviews; no duplicate profile or backend feature was created.

Exactly four frontend files changed: libs/components/common/ShopCard.tsx, pages/shop/index.tsx, pages/shop/detail.tsx and scss/pc/shop/shop.scss. Search/sort/pagination/like handlers and directory Apollo requests remain unchanged. No backend source, dependency, custom hook or unrelated feature was changed. Staged only these explicit paths.

Validation: yarn tsc --noEmit --incremental false PASS with Node 20.19.0 before changes and after the Shops phase; final frontend typecheck also PASS. Git diff/staged scope review and git diff --check PASS. Isolated Chrome with intercepted GraphQL responses verified 3/2/1 columns, maximum card widths, consistent 16:9 cover images, no document/card overflow at 1440/1100/1024/800/701/700/390/320px, single and empty results, names/product counts, full-card and View Shop navigation, product queries scoped to the selected shop, absence of follower/account UI, likes without navigation, Enter search, sorting and pagination. An actual iPhone user agent also verified the mobile wrapper. Desktop/mobile screenshots inspected. No browser runtime exceptions or live data mutations; no production build or live backend persistence verification was performed.


## Frontend public Gaming Events cards and subtle motion — 2026-10-12

Completed in gamenix365-next commit a0312a5 (fix: improve events page design). Reused EventBoard and the existing public/detail/management/registration routes. The shared Gaming Events header remains; removed its duplicate public body heading. Existing role-specific All events / My events / My registrations / Manage events links remain, with the public navigation styled as tabs and All events marked as the current page. The public type filter has readable Tournament/Giveaway labels while retaining its exact enum values and page-reset callback.

Public cards now use two equal columns above 700px and one mobile column within a centered 1200px maximum container. A single event retains one desktop column. Each card is one link to its existing detail route and contains a 16:9 cover image, title, readable event type/status, game, scheduled date, start/end date and time, eventMaxParticipants labelled as capacity, optional prize and a compact View Event CTA. No registered-participant count or other unsupported field was invented. Text wraps within cards, including the enclosing link's inherited white-space rule. Empty results and pagination use compact spacing.

CSS supplies a 300ms fade/6px entrance, 200ms hover transitions with a 3px lift and soft shadow, and 1.025 image zoom inside hidden overflow. Hover motion is limited to fine hover pointers. Reduced-motion preferences disable entrance, card/image/tab transitions and hover transforms; image transition specificity was verified in Chrome. All new card/layout/motion rules are scoped to the public EventBoard; SHOP/ADMIN cards and management controls retain their existing rendering and styles.

Exactly two frontend files changed: libs/components/events/EventBoard.tsx and scss/pc/events/events.scss. No dependencies, custom hooks, helper files or backend code were added. Source comparisons verified byte-identical state, authorization, Apollo setup, lifecycles and handlers, equivalent unchanged creation/editing form, and identical JSX onClick/onChange/onSubmit callbacks. GraphQL documents, event detail, registration and participant components are unchanged. Public requests still select eventStatus PROCESS through the existing query; approval and registration rules were not modified. Staged only the two explicit paths.

Validation: yarn tsc --noEmit --incremental false PASS with Node 20.19.0 after Events implementation and final changes; git diff/staged scope review and git diff --check PASS. Isolated Chrome using intercepted responses verified 2/1 columns, normal-width single results, empty results, 16:9 images, readable labels/date/time/capacity/optional prize, no document/card overflow at 1440/1100/1024/800/701/700/390/320px, preserved public PROCESS inputs, type filtering/page reset, pagination, detail navigation, existing application/cancellation inputs and refetch behavior, USER registrations navigation, SHOP My events/All events navigation and retained management filters. Computed styles confirmed 300ms entrance, 200ms hover, card lift/image zoom, and reduced-motion behavior. Actual iPhone user-agent checks passed for both pages. Desktop/mobile screenshots inspected; no browser runtime exceptions or unexpected mutations. No actual accounts/events/registrations were changed, and no production build or live backend persistence verification ran. Temporary checks, fixtures and screenshots are outside the repository; owned preview/browser processes are cleaned up, while user servers remain running. This backend documentation update is separate from the frontend commits and preserves existing backend working-tree changes.


## Frontend basket persistence in Nestar style — 2026-10-12

Implemented the user's approved basket-reliability plan in gamenix365-next. Inspected the backend AI handoff notes, existing cart/Basket/Orders/auth/reactive state/tests and original nestar-next auth/storage/layout patterns before editing. Nestar has no basket implementation to copy. The existing basket script referenced the absent syncBasketStorage function; updated the script to exercise actual persistence and handlers instead of recreating that obsolete API. Frontend changes remain uncommitted; no commit was requested for this task.

Kept CartItem, cartVar, useBasket and existing add/decrement/delete/clear functions. Small saveCart/restoreCart/clearPurchasedCart functions use one localStorage record, gamenix365.basket, containing memberId and existing items. Empty baskets remove the record. Restoration validates usable product fields, positive integer quantities within saved stock, unique products and one shop, and ignores malformed/mismatched records without crashing. Storage read/write failures leave the in-memory basket usable. Saved price/stock fields are display snapshots; backend checkout validation remains authoritative.

The existing app lifecycle initializes identity and restoration once and installs one storage listener. Matching basket updates restore without write-back; authentication changes reload other tabs. Added only narrowly scoped basket calls to existing auth handlers: guest items follow login, logout or account switching clears the basket, and failed guest login preserves guest items. Token decoding/storage, API operations and existing authentication navigation are preserved. The unused Session component remains unmounted; no new hook or account synchronization system was added.

Orders quantity/remove/clear handlers now persist through the shared functions. Both existing checkout entry points capture submitted items and account before awaiting the unchanged createOrder mutation. Failure retains the basket for retry; success subtracts only submitted quantities from that account's current basket, retaining additional quantities/new products added meanwhile. Responses from an old account cannot clear another account's basket. Existing order inputs, shipping calculations, status updates, cache/refetch behavior and navigation are preserved.

Exactly six frontend files changed: libs/cart.ts, libs/auth/index.ts, pages/_app.tsx, libs/components/basket/Basket.tsx, pages/orders/index.tsx and scripts/test-basket.cjs. No GraphQL documents, backend source, styles, routes, dependencies, product/event/shop/member implementation or state library changed. This required handoff entry is separate from the frontend changes and preserves pre-existing backend working-tree changes.

Validation: yarn tsc --noEmit --incremental false and yarn node scripts/test-basket.cjs PASS with Node 20.19.0. Offline checks cover SSR/storage failures, valid/malformed restoration, stock/quantity/unique/single-shop rules, all basket writes, guest/login/logout/account isolation, app storage-event cleanup and no write-back, both checkout handlers' delivery/pickup inputs and shipping estimates, failure/retry, pending quantity/product/account changes, successful clearing, post-success refetch failure, and existing header gates/duplicate-order guard. Git diff scope review and git diff --check PASS. Isolated Chrome with intercepted GraphQL responses verified actual add/increase/decrease/delete/clear and Orders quantity/remove/clear controls, refresh, guest failed/successful login, cross-tab basket changes, logout/account switching, both checkout buttons' failure/retry/success and additions during pending requests. A genuine close and reopening of the isolated browser profile restored the signed-in basket. Malformed saved JSON did not crash the page; desktop and mobile screenshots were inspected, with the basket fitting at 390px. No browser runtime exceptions, real order/account mutations or production build. Temporary browser checks/previews/screenshots are outside the repository; owned test servers/browser and copied environment files are cleaned up after validation. User frontend/backend servers are left running.


## Frontend SHOP event management toolbar and card layout — 2026-10-11

Completed in gamenix365-next commit 4a6ab12 (fix: event management layout and duplicate fields). Read backend AI handoff notes and inspected existing EventBoard, event types/queries and current approval rules before editing. Compared the component/handler/layout patterns with nestar-next MyProperties, PropertyCard, property listing and their SCSS.

The second Type/Status pair was an existing event-list filter, not duplicate form content. Preserved its state, options, query inputs and page-reset behavior. SHOP management now places it in a labelled Your events toolbar with Filter by type / Filter by status labels, outside the existing creation/editing form. Filters wrap into full-width controls on narrow phones so the labels remain readable.

SHOP cards now use two equal desktop columns and one column at widths up to 700px. A single result retains one column's desktop width. Compact cards show the existing image, wrapping title, type, status, game, scheduled/start/end dates, participant limit and prize, with the original management actions aligned at the bottom of each desktop row. Participant limit uses eventMaxParticipants; no registration count or unsupported field was invented. New styles are scoped to event-management-page in the existing SHOP stylesheet, retaining the current cyan/gray theme. Avoided an existing event-detail page CSS class collision by naming the new information rows event-info-row.

Only libs/components/events/EventBoard.tsx and scss/pc/events/manage.scss changed in the frontend commit. Imports, state, Apollo requests, lifecycle, all existing handlers and the entire form are byte-identical to the previous commit. Management action conditions/callbacks and pagination are unchanged apart from an added container CSS class. New events remain PENDING, SHOP pending creation/editing exposes no approval-status selector or Approve action, and approved-event pause/activate editing remains available. No backend source, GraphQL document/mutation, dependency, hook, route or unrelated page changed. This documentation update is separate from the frontend commit.

Validation: Yarn TypeScript check (yarn tsc --noEmit --incremental false, Node 20.19.0) PASS after implementation and final adjustments. Prettier check, Git diff/staged scope review and whitespace checks PASS; exactly the two relevant paths were staged explicitly. Isolated Chrome checks with intercepted GraphQL verified separate form/list controls, combined type/status filters, empty results, page reset/pagination, upload/create/edit/pause/activate/finish/remove handlers, PENDING creation/editing and SHOP approval restrictions. Layout checks at 1440/1024/800/701/700/390/320px confirmed desktop/mobile columns, equal row heights, aligned actions and no document/card overflow. Actual mobile user agents at 390/320px confirmed readable stacked filter labels; desktop/mobile screenshots inspected. Public/admin DOM, text, geometry and computed-style snapshots matched the previous implementation at 1440/1024/390px. No runtime exceptions or live data writes; persistence was not tested. Temporary scripts/screenshots remain outside the repository; owned preview/Chrome processes and copied environment files were cleaned up. The user's frontend/backend servers were left running.


## Frontend missing Korean/Russian translations and language picker — 2026-10-11

Completed in gamenix365-next commit 7ffc558 (fix: complete Korean and Russian translations), following the user's request for a small language-switcher update, including missing Orders and Events labels. Read the backend handoff notes first. Kept this increment to existing translation coverage and the shared header; did not undertake a full localization rewrite of hardcoded page-body text.

Added 24 matching common.json entries to en / kr / ru, covering the 21 previously missing keys used by existing navigation, language-menu labels and LayoutBasic banners, plus shared-header Logout, Change language and the announcement. All 20 prior entries/values in each catalog are preserved. Catalogs now contain the same 44 nonempty keys. Header announcement, logout and account/language accessibility labels use the existing useTranslation('common') function.

Fixed the language handler to read the MenuItem currentTarget.id once, removing duplicate nested-image handlers and the Korean image's incorrect uz identifier. Existing router.push(router.asPath, router.asPath, { locale }) navigation is retained. The displayed flag and stored locale now follow router.locale, including direct localized links and refresh. Kept existing en / kr / ru route codes and locale configuration. Added next-i18next's existing reloadOnPrerender option only in development: the running frontend initially served the old 20-key cached catalogs; triggering Next.js's normal next.config.js change watcher with an unchanged-content timestamp update loaded the new setting. Read-only requests then confirmed all 44 entries and translated Orders/Events on the user's running port-3000 frontend. No manual stop/replacement of that server occurred; production translation reload remains disabled.

Only five frontend files changed: libs/components/Top.tsx, next-i18next.config.js and public/locales/{en,kr,ru}/common.json. No backend source, Apollo document/data-fetching implementation, auth handler, page component, stylesheet, dependency or custom abstraction changed. This backend documentation update is separate from the frontend commit.

Validation: Yarn TypeScript check (yarn tsc --noEmit --incremental false with Node 20.19.0) PASS after implementation and final edits. JSON syntax/key parity checks PASS; static source scan confirms coverage for all 37 currently used literal translation keys and dynamic banner strings, and before/after checks confirm preservation of every pre-existing translation. Git diff/staged scope review and diff whitespace checks PASS. Isolated Chrome checks with intercepted GraphQL responses verified en/kr/ru switching via flag images and menu text, translated nav/language names/announcement/logout, Korean/Russian order/event/shop banners, preserved product JSON inquiries, direct localized links, refresh, flag/storage synchronization and actual mobile agents at 390/320px without document overflow or runtime exceptions. Settled desktop/mobile screenshots inspected. No mutations or live data writes occurred; no production build ran. Temporary scripts/previews remain outside the repo; isolated preview/Chrome processes and copied environment files were cleaned up. The user's frontend remains running with updated translations.


## Frontend admin event access and date selection — 2026-10-11

Completed in gamenix365-next commit 718b6b7 (fix: add admin event access and improve date selection), following the user's report that created events had no visible admin management entry and the creation form's date choosing was poor. Kept the existing design, architecture, EventBoard, upload flow and Apollo operations. Read the backend handoff notes and current event service/enum before editing. A read-only introspection request to the running localhost:3007/graphql confirmed EventStatus PENDING / PAUSED / PROCESS / FINISHED; historical notes describing PAUSED creation are superseded by the inspected current backend source, which forces PENDING and reserves approval-status changes for ADMIN.

AdminMenuList now includes Events -> List linking to the existing /_admin/events route with the same menu/submenu structure and installed icon library. Its existing route lifecycle updates the selected section when pathname or device changes, so Events is active after client navigation and refresh. Added the existing backend PENDING value to the frontend event enum and new-form default. Existing status filters can now select PENDING; the ADMIN edit status selector handles it correctly. Pending events show Edit / Approve / Remove to ADMIN and Edit / Remove to SHOP. Approve reuses the existing updateEventByAdmin mutation with PROCESS and the existing confirmation/refetch handler. Approval or activation of an event whose start has passed is disabled; administrators can reschedule through Edit. Approved pause/activate/finish/removal actions remain. Pending creation/editing explains that admin approval is required. Only PROCESS titles link to public detail, matching the backend public-detail restriction; other management cards retain Edit for review.

Replaced the three native datetime-local inputs with the already-installed MUI DateTimePicker and AdapterDateFns, using calendar and 24-hour clock views, cancel/OK actions, desktop popovers and mobile dialogs. Scheduled date / Start / End keep their existing DateTime meanings and GraphQL fields. The schedule section states the browser's local timezone and explains that applications close at the start. Fields appear in three columns on desktop and stack on narrow screens. The picker prevents choosing an end at/before start and constrains new/rescheduled/activated starts to the future. Save validates missing/invalid dates before conversion and preserves backend start/end/future rules. Unchanged past starts remain editable for unrelated changes where the backend permits it. Removed the old manual timezone-offset shift when editing: existing ISO timestamps feed Date objects directly, display locally and serialize correctly to UTC, retaining unchanged timestamp precision and the existing omission of unchanged eventStart from updates. No new dependency, hook, routing layer, backend source or GraphQL document was introduced.

Only three frontend files changed: libs/components/admin/AdminMenuList.tsx, libs/components/events/EventBoard.tsx and libs/enums/event.enum.ts. Account/profile, product, shop, order and authentication implementation files were not modified. This required backend documentation update is separate from the frontend commit.

Validation: Yarn TypeScript check (yarn tsc --noEmit --incremental false, Node 20.19.0) PASS after admin changes, after date-picker implementation and after final formatting. Git diff/staged diff scope review and git diff --check PASS. Isolated Chrome checks with intercepted GraphQL responses verified admin sidebar navigation/direct refresh, PENDING filtering, edit/approve/pause/activate/finish/remove inputs and refetches, finished controls, SHOP pending restrictions, existing upload/create/edit flows and USER/inactive SHOP access restrictions. Invalid/impossible typed dates, past new starts, equal and reversed time ranges are blocked before mutation. Existing milliseconds/seconds survive unchanged edits, and unchanged eventStart is omitted. Local Seoul inputs save to the expected UTC timestamps and restore correctly on editing. Actual calendar day/hour/minute selection and saves passed at 1440px in Asia/Seoul and at 390px in America/Los_Angeles. Actual mobile user agents at 390px and 320px open fitting calendar dialogs without document overflow; settled desktop/mobile screenshots inspected. No browser runtime exceptions, real event/account mutations, live uploads, backend source changes or production build. Live persistence/transaction behavior was not tested. Temporary scripts, fixtures and preview are outside the repository; the preview environment copies and test servers are cleaned up.


## Frontend SHOP account design and existing event navigation — 2026-10-11

Completed in gamenix365-next commit 4d3cd72 (fix: improve shop profile design and event navigation). The user's latest request authorizes SHOP-only account/profile presentation and navigation to the existing event creation/management flow. Regular USER account appearance and functionality remain unchanged.

Read the backend AI handoff notes and current event creation/authorization source, then compared nestar-next/pages/mypage/index.tsx, libs/components/mypage/MyMenu.tsx, libs/components/mypage/MyProfile.tsx and original SCSS with the current Gamenix account/profile, event pages, EventBoard, uploads and Apollo documents. Current backend source forces new events to PENDING and forbids owners from changing event approval status; no backend source or event statuses were changed. Older handoff notes describing PAUSED creation are historical and do not describe the current inspected source.

MyMenu now has a simple SHOP-only return using the existing MUI Stack/List/ListItem, installed MUI icons and Next Link/category patterns. Navigation is grouped as SHOP MANAGEMENT (Add Product, My Products, Create Event, My Events), ACTIVITY (My Favorites, Recently Visited, My Followers), COMMUNITY (Articles, Write Article) and ACCOUNT (My Profile, Logout). My Followers retains the existing member-level getMemberFollowers destination; no shop-following/subscription feature, mutation, field or route was added. The original USER/ADMIN menu return and shared logout handler are unchanged.

A SHOP-only shop-account class scopes all appended account/profile SCSS. The seller sidebar uses a 248px desktop width, compact identity panel, section headings, aligned 19px icons, subtle cyan active state and hover/focus styles. Mobile stacks the sidebar above the profile and uses two navigation columns. Profile styling balances the existing 96px image, upload control, username/phone/address fields, 44px controls and compact update row. The entire shared MyProfile.tsx, including image upload, update handler, validation and GraphQL mutation, remains byte-for-byte unchanged; existing USER SCSS is preserved.

Create Event links to the existing /events/manage pathname with category=createEvent. That page reads router.query.category and passes one boolean to the existing EventBoard. A short shop-only lifecycle opens/resets the existing form, and returning to the normal My Events view closes it. My Events links to the same management route. There is no duplicate form, new page, custom hook, routing helper, dependency or GraphQL operation. SHOP creation/pending editing hides the status selector; pending SHOP event cards omit activation/finish controls. Existing approved-event controls and ADMIN controls remain. All original EventBoard query/mutation setup and handlers, including uploads, save/edit/change and authorization checks, are unchanged.

Only six frontend files changed: pages/mypage/index.tsx, libs/components/mypage/MyMenu.tsx, scss/pc/mypage/mypage.scss, scss/pc/mypage/myProfile.scss, pages/events/manage.tsx and libs/components/events/EventBoard.tsx. Product creation/management, authentication, schemas and unrelated pages were not modified. The required backend documentation update is separate from the frontend commit.

Validation: Yarn typecheck (yarn tsc --noEmit --incremental false with Node 20.19.0) PASS after both implementation phases. Git diff/staged diff scope review and git diff --check PASS; staged only the six explicit paths. Source comparisons confirm the unchanged original USER/ADMIN menu return, logout handler, entire shared profile component, original event Apollo setup and all original event handlers. Before/after intercepted-browser snapshots of all seven USER account views (profile, favorites, visited, followers, followings, articles, write article) match exactly in DOM, computed styles and geometry at 1440px and an actual mobile user agent at 390px.

Isolated Chrome checks verified all SHOP sidebar destinations and active states, unchanged logout confirmation/cancel, existing Create Event/My Events navigation, a single reused form, refresh/direct creation links, and closing the form through the existing My events link. Pending cards expose only Edit/Remove to SHOP, while approved event controls and ADMIN controls remain. USER and inactive SHOP cannot access the creation form under the unchanged authorization checks. Existing event multipart upload/save was exercised once with a mocked PENDING creation response. Existing USER and SHOP profile multipart uploads, required-field disabling, updateMember inputs and refreshed profile/token behavior passed using intercepted responses. No actual accounts were updated, files uploaded or events created. Widths 1440/1024/800/390/320 fit without account overflow, all fields/buttons measure 44px, sidebar contents fit, and actual mobile agents at 390/320 open the existing event form. Desktop and mobile screenshots inspected; no runtime exceptions. No production build was run. Temporary test scripts, fixture data and previews remain outside the repository.


## Frontend product search, JSON links and filter layout — 2026-10-11

Completed in gamenix365-next commit feaa1cf (fix: product search and filter layout). The user's latest request keeps the cyan storefront design and limits implementation to product listing search, routing, filters and layout. It explicitly requires search and sorting to update the JSON inquiry URL, superseding the earlier literal Nestar behavior where those two interactions only changed local state.

Studied nestar-next/pages/property/index.tsx, libs/components/property/Filter.tsx and libs/components/homepage/HeaderFilter.tsx, plus the property detail route, current product page/filter/categories, ProductsInquiry and backend product inquiry DTO. The page still owns searchFilter, initializes from JSON.parse(router.query.input) or initialInput, and passes it directly to the unchanged GET_PRODUCTS useQuery. Navigation retains direct repeated /product?input=${JSON.stringify(...)} href/as strings and scroll:false. No custom hook, URL serializer, alternative query parameters, dependency, GraphQL document/schema or backend source was added or changed; useProductBrowse.ts remains untouched.

Search icon, Enter and clear share one straightforward searchHandler. Product-list searches reset page to 1 while preserving category/price and other inquiry fields; clearing updates text, results and URL. The existing updateUrl:false consumer still updates local filters without product-route navigation. The router lifecycle now restores inquiry, current page and sort label from the newly parsed input, including resetting defaults when history returns to /product. Filter restores its visible search text from inquiry changes. Pagination copies the inquiry before updating page so initialInput is not mutated, and retains the existing explicit refetch. Sorting uses the existing switch/options and directly pushes its updated inquiry. Empty typeList is omitted before navigation; removing the extra lifecycle push prevents an additional history entry when clearing the last selected category or parent.

Only three frontend files changed: pages/product/index.tsx, libs/components/product/Filter.tsx and scss/pc/product/product.scss. Removed the All filters toggle; the sidebar is permanently displayed at 260px on desktop and stacks above results on mobile. Categories flow vertically with left-aligned checkboxes and indented children. Existing category definitions, independent parent expansion, child selection and 300ms ease-in-out Collapse behavior are unchanged. The product count and existing sorting dropdown now share the results header, with sorting on the right. Grid spacing remains 24px on desktop, with three columns beside the sidebar and two columns at narrower widths. Theme, typography and product cards remain unchanged.

Validation: Yarn typecheck (yarn tsc --noEmit --incremental false with Node 20.19.0) PASS. Git diff/staged diff and scope review, git diff --check PASS; staged only the three explicit paths. Source comparisons confirmed unchanged GET_PRODUCTS useQuery, like/refetch handler, price guards/reset handler, ProductCard component and exact desktop/mobile card CSS. Isolated Chrome checks used the running local GraphQL API for initial catalog, keyboard search by icon/Enter, clear/reset and JSON URLs. Intercepted 36-product fixtures verified page-specific results, page-1 search reset, Monitor/category/price filtering, all sorting options, preserved combined filters, direct saved links, refresh and multi-step Back/Forward synchronization of controls and results, including clearing the last selected child/parent. Parent expansion selects no children, and closing it removes only its own selected types. Widths 1440/1024/800/390/320 fit without document/category overflow; placeholder text fits, sorting/count align correctly, and mobile search/clear/reset work. Settled desktop/mobile screenshots were inspected with all five PC children visible. No browser runtime exceptions, live mutation, checkout, upload, authentication change or production build was performed. Temporary checks/previews are outside the repository; this backend documentation update is separate from the frontend commit.


## Frontend reference redesign — 2026-10-11

Completed in gamenix365-next commit 39c04ba (style: redesign frontend with cyan storefront theme). Implemented the user's expanded request to redesign the entire frontend from the supplied Logitech catalog/footer screenshots and https://www.logitechg.com/en-us/software/ghub. This design request supersedes the earlier product-only/dark-design restriction for presentation changes. Gamenix365 branding, original product data/images, routes, architecture and business behavior remain in place.

The existing MUI theme now uses a light canvas, dark readable text, cyan controls and light-gray surfaces. Page styles carry that palette through the homepage, catalog and product details, shop/member pages, community/editor, support/about, login, account forms, orders/basket, events and admin screens. Large panels use simpler corner radii; input/icons/selected states were adjusted for light backgrounds. No dependencies or new styling framework were introduced.

The shared header has a cyan announcement strip and black navigation. The homepage uses a full-width editorial hero, larger typography, the existing gaming image displayed in grayscale, and a capsule search control. The responsive charcoal footer keeps existing destinations and contact information, adds a cyan catalog CTA band, and ends with a large Gamenix365 wordmark. The CTA links to the existing catalog; no newsletter submission or other unsupported backend feature was added.

The product catalog now has a centered search field in its gray heading band, a four-column desktop/two-column mobile grid, larger contained product images, corner likes/counts and compact cart controls. One simple showFilters boolean controls the All filters button. Filter stays mounted, so hiding the panel preserves selections and text. Search remains visible. The existing parent/child categories, 300ms Collapse, price handlers, raw JSON input URLs, page-owned inquiry, sorting, pagination/refetch, likes and basket logic are unchanged. No serializers, custom hooks or routing parameters were added. useProductBrowse.ts remains untouched.

Validation: yarn tsc --noEmit --incremental false PASS using Node 20.19.0 after the theme phase and final changes; git diff --check PASS. Temporary TypeScript AST comparison verified unchanged existing hooks, router.push/replace calls, handlers and JSX event bindings in every modified TSX file, except the intentionally added local filter-visibility state/click. Apollo documents/client/store, shared hooks, authentication, types, enums and all backend source remain unchanged.

Chrome live read checks covered 10 public routes at 1440px and with an actual mobile user agent at 390px, including the homepage, catalog, product details, shops, events, community, support/about, login and order access state. There were no runtime exceptions or document overflow. Authenticated visual checks used intercepted responses for 46 desktop/mobile account, shop/member detail, populated order/event/community, shop management and admin views. Existing member category normalization and horizontally scrollable product/admin tables remain. A final targeted check covered admin pagination at 390px and 320px.

Catalog browser interaction checks passed for filter visibility without navigation/refetch, independent 300ms ease-in-out parent expansion, clearing only a closed parent's selected children, raw JSON URL and refresh restoration, search/clear, prices, sorting, page-specific pagination input, all-type reset, two-line product names, likes/current-inquiry refetch and client basket quantities. Widths 1440/1024/800/390/320 fit without document overflow; the full search placeholder fits. Screenshots of the public shell, catalog, footer, account and admin layouts were inspected. Like responses were intercepted, and no live mutation, order submission, file upload or authentication change was performed. No production build was run. Temporary fixtures, screenshots and preview files are outside the repository; backend documentation is updated separately from the frontend commit.


## Frontend product-page UI and cards — 2026-10-11

Completed in gamenix365-next commit 9eb166d (fix: improve product page UI and cards). The latest user request supersedes the earlier default-PC and retain-children-on-collapse behavior for the product listing sidebar: /product now starts without typeList, shows all product types, and starts with all five category groups collapsed. Existing valid URL selections remain checked and open their groups. Expanding a parent only opens its children; closing a parent removes that group's selected types while retaining other groups. MUI Collapse supplies a 300ms ease-in-out transition with no custom animation code. The sidebar shows the five main categories without a redundant All products row; Reset filters returns the query to all types.

References inspected before editing: nestar-next/libs/components/property/PropertyCard.tsx, libs/components/property/Filter.tsx and original listing/SCSS patterns, plus current Gamenix product components, inquiry, query and backend Member/Product relationship. Changed seven frontend files: pages/product/index.tsx, libs/components/product/Filter.tsx, libs/components/product/ProductCategories.tsx, libs/components/product/ProductCard.tsx, libs/components/basket/AddToBasket.tsx, apollo/user/query.ts and scss/pc/product/product.scss.

Search now uses the installed MUI SearchRounded icon and adjusted input/adornment spacing. The full placeholder fits without widening the 250px desktop sidebar. Listing cards use a productPage prop to keep their new presentation limited to this page; the existing card return for other consumers and horizontal category markup remain unchanged. Cards have no image borders, strong outlines, shadows, separate image background or public status/TOP badge. Original image paths/proportions are preserved with object-fit:contain. Information order is image, two-line name, shop name, price, views/likes and a small centered Add to Cart button. Mobile uses two compact columns below 600px. AddToBasket accepts an optional display label with its existing default; cart/availability/error handling is unchanged.

Shop data uses the existing product.memberData relationship to a SHOP Member. Added only the existing nullable memberFullName field to GET_PRODUCTS. Cards follow the current public shop profile display name (memberFullName, otherwise memberNick), and display no USER/ADMIN member name or ID. There is no separate shopName field in the current backend. Live local SHOP records have memberFullName:null and the public name "shop", which is displayed from the response. No shop name was hardcoded and no backend schema/source, GraphQL mutation, auth, order, event or unrelated page was modified. Nestar raw JSON input routing, search/price handling, sorting, pagination and likes are preserved; the shared useProductBrowse hook remains untouched.

Validation: yarn tsc --noEmit --incremental false PASS with Node 20.19.0; git diff --check and staged diff/scope review PASS. Temporary source comparison verified unchanged listing sorting/pagination/like handlers, legacy ProductCard return and horizontal category return. Isolated Chrome verified the live API's four products, original uploaded images and real shop-name fallback. Fixture checks verified selected URL/refresh restoration, independent expansion, clearing only the collapsed parent's children, long names wrapping/clamping to two lines, search/clear, all-types reset, client basket quantity changes and mocked like mutation/refetch. Measured 300ms ease-in-out opening/closing, equal normal card heights of 318px, zero card/image borders and compact centered buttons. Desktop/mobile screenshots inspected; widths 1440/1024/800/390/320 had no document overflow and the full search placeholder fit. No runtime exceptions. No live like/order mutation, production build, image generation or dependency change was performed. Temporary test scripts and fixtures remain outside the repository. Backend handoff documentation is updated separately from the frontend commit.


## Frontend Phase 1 correction — original Nestar JSON links — 2026-10-11

Completed in gamenix365-next commit 42a2e91 (fix: simplify product listing using nestar logic). This correction supersedes the encoded URL, default merging, and uniform search/sort navigation described in the earlier Phase 1 entry below. Studied nestar-next/pages/property/index.tsx, libs/components/property/Filter.tsx, libs/components/homepage/HeaderFilter.tsx and pages/property/detail.tsx, plus their directly related navigation and Apollo code.

Only three frontend files changed: pages/product/index.tsx, libs/components/product/Filter.tsx and libs/components/product/ProductCategories.tsx. ProductList initializes its page-owned ProductsInquiry directly from JSON.parse(router.query.input) or initialInput, and its [router] effect assigns the parsed inquiry directly. Removed the encoding wrapper, readiness gate, default merging and generic changeFilterHandler. Navigation uses the same repeated /product?input=${JSON.stringify(...)} href/as strings as Nestar, with scroll:false. No new query parameters, router.replace, serializer or custom hook was added.

Filter now owns the Nestar-style checkbox handler, reading e.target.checked/value and directly pushing added/removed typeList values. ProductCategories supplies the event through one optional sidebar callback; its horizontal behavior is unchanged. Parent expansion remains local and independent of child selection. Empty type lists are deleted and pushed in the Filter lifecycle, matching Nestar; the backend treats both an empty and an absent typeList as all products. Existing five category groups, all 13 product types, initial PC selection and the dark responsive design remain.

Search Enter/clear and sorting directly update page state, as in Nestar; they do not immediately navigate or reset the page. A later category, price or pagination action serializes that current inquiry. Reload restores the last serialized inquiry to Apollo; the search field and sort label initialize from Nestar's local defaults rather than being synchronized from the URL. Price handlers retain existing integer/nonnegative/range-order checks and supply a missing opposite bound because homepage inquiries can omit pricesRange while GraphQL requires both Int bounds. The existing updateUrl:false Filter consumer still updates local state.

Pagination retains Nestar's searchFilter.page assignment, raw JSON push and setCurrentPage. Added one direct getProductsRefetch({ input: searchFilter }) because browser verification showed that the installed Apollo retained the previous page's results after the in-place assignment. This uses the existing refetch function and follows the explicit refetch style seen in Nestar detail comment pagination. Likes still refetch the current inquiry. GraphQL operations/types, shared useProductBrowse.ts, shop/member/event/order/authentication source, stylesheets and dependencies are unchanged. No backend source changed.

Validation: yarn tsc --noEmit --incremental false PASS with Node 20.19.0; git diff --check and staged scope/diff review PASS. Isolated headless Chrome with intercepted GraphQL fixtures PASS for raw JSON URL state with only input, independent expansion, child add/remove and last-child cleanup, local search/sort, price/pagination serialization, invalid prices, page-specific results, Back/Forward requests/results, likes/current-inquiry refetch, reload, reset, and missing-range min/max edits. Desktop/mobile screenshots inspected; no mobile document overflow or runtime exceptions. Live backend persistence and production build were not verified. Temporary browser fixtures/scripts were kept outside the repository. Frontend working tree was clean after the commit; this backend handoff note is updated separately and is not part of the frontend commit.


## Frontend Phase 1 — Nestar-style product listing — 2026-10-11

Completed the user's approved product-listing-only phase in the sibling gamenix365-next repository, committed as 6e35e60 (fix: simplify product listing using nestar logic). Main references were nestar-next/pages/property/index.tsx and libs/components/property/Filter.tsx.

Frontend files changed: pages/product/index.tsx, libs/components/product/Filter.tsx and libs/components/product/ProductCategories.tsx. The page now owns ProductsInquiry with useState and restores router.query.input in one effect. Pagination, sorting, product types, text search and prices use direct router.push calls with the Nestar input JSON parameter. Built-in encodeURIComponent protects search characters such as & and #. Default PC types, explicit All products, current-filter like refetches and the dark gaming appearance are preserved. Parent expansion is local UI state; only child checkboxes change search.typeList. Collapsing a parent retains selected children. The shared horizontal category view was reformatted but its TypeScript/JSX structure is unchanged.

useProductBrowse.ts remains unchanged for shop/member consumers. No shop, member, event, order, authentication, GraphQL document, stylesheet, dependency or backend source was modified. The product listing now reads the input JSON format only; the former separate category/subcategory/q parameters are not decoded on this page.

Validation: yarn tsc --noEmit --incremental false PASS using installed Node 20.19.0; yarn node scripts/test-product-categories.cjs PASS; git diff --check and staged diff review PASS. Isolated headless Chrome checks with intercepted GraphQL fixtures PASS for independent parent expansion, CPU/RAM checkbox selection and collapse retention, encoded search, valid/invalid price ranges, sorting, pagination, like mutation plus current-inquiry refetch, refresh, clear, Back/Forward, reset, malformed JSON fallback and retained memberId scope. Desktop/mobile screenshots inspected; no document overflow at 390px and no runtime exceptions. Shared horizontal category JSX/TypeScript structure comparison against the prior HEAD PASS. No live backend persistence, real authenticated mutations or production build was verified; the backend was unreachable during checks. No permanent browser test or fixture was added to the frontend repository.


## Five product browsing groups and additional types — 2026-10-11

Added CPU, RAM and PLAYSTATION to ProductType while preserving all previous values, including HEADPHONES. Existing DTOs, GraphQL registration and ProductSchema use this enum; no new API field, persisted group, resolver or data migration was introduced. Added components/product/product-types.spec.ts with input/schema compatibility coverage for all 13 types. Order shipping rules are unchanged.

The sibling gamenix365-next frontend now uses PC / Mobile / Console / PC Components / Furniture tabs and type icons in public/shop catalogs and homepage selection. Shop create/edit forms derive their group from productType. Existing typeList filters represent groups; URL state preserves pagination, sorting and combined filters, including mixed-group legacy links through All products. See the frontend COMPLETED_TASKS for implementation and browser verification.

Validation: both backend TypeScript checks and npm run build PASS; npm test -- --runInBand PASS (34 tests across 3 suites, including 13 product-type cases). Frontend yarn tsc --noEmit --incremental false, yarn node scripts/test-product-categories.cjs and yarn build PASS (92 static pages; isolated preview copy with Node 20). Browser fixtures verified tab/subtype requests, all-category/all-products, URL refresh/back, combined filters, shop scope, homepage navigation, keyboard operation, mobile overflow and shop form/edit restoration. No live product creation/update, database migration or deployment was performed. Deploy backend enum support before exposing the new types in frontend.

## Public events restricted to active status — 2026-10-10

Public getEvents/getEvent now require PROCESS and deletedAt: null. Client status filters intersect the public restriction, so conflicting filters return an empty list/metaCounter. Shop/admin management and registration history are unchanged; no date filter or GraphQL input/schema change was added. This supersedes earlier descriptions of public queries excluding only deleted events.

Changed components/event/event.service.ts and added components/event/event-public.spec.ts under apps/gamenix-api/src. The focused suite covers active visibility, pending/paused/finished/deleted exclusions, status-filter overrides, pagination/type filters and shop/admin visibility. Existing deleted event/order test files were left untouched.

Validation: both backend TypeScript checks and npm run build PASS; npm test -- --runInBand PASS (21 tests across 2 suites, including 16 public-event tests). Existing shop/admin management paths were checked: they do not call the public getEvents/getEvent methods. Focused tests also verify pending edits, owner authorization, admin approval and rejected shop self-approval. Checks ran against the working tree, which includes the earlier uncommitted PENDING lifecycle implementation; the visibility-only commit leaves those earlier changes unstaged. No live MongoDB or HTTP/e2e verification was performed.

## Events and EventParticipant operations — 2026-10-10

COMPLETED after approval of the Events proposal and eventStart deadline clarification. Working tree was clean before this increment. Auth/guards, ProductService, OrderService, MemberService and community code are unchanged.

Modified source files, relative to apps/gamenix-api/src:

- components/event/event.module.ts: register existing EventParticipant/Member models and import AuthModule.
- components/event/event.resolver.ts: 6 queries and 9 mutations, existing role decorators and AuthMember identity.
- components/event/event.service.ts: SHOP management, public/owner/admin queries, USER applications/cancellation/history, SHOP/ADMIN review, current-member authorization and transactional capacity coordination.
- libs/dto/event/event.input.ts: nested filters, pagination, sorting and shop/admin includeDeleted inquiries; organizer stays internal.
- libs/dto/event/event.ts: nullable deletedAt and Events list/metaCounter wrapper.
- libs/dto/event-participant/event-participant.input.ts: registration exposes eventId only; add participant inquiries and nested status/event filters.
- libs/dto/event-participant/event-participant.update.ts: require REGISTERED or REJECTED for review.
- libs/dto/event-participant/event-participant.ts: list/metaCounter wrapper and optional eventData/memberData history details.
- libs/enums/participant.enum.ts: add PENDING/REJECTED, preserving REGISTERED/CANCELLED.
- schemas/Event.model.ts: add deletedAt with null default; existing fields/collection remain.
- schemas/EventParticipant.model.ts: default new applications PENDING; refs and unique pair index remain.
- libs/config.ts: add availableEventSorts.

Created components/event/event.service.spec.ts with 55 offline cases covering roles, ownership, required fields/dates/capacity, lifecycle, application/review, cancellation/reapplication, duplicate errors, moderation, list pipelines, DTO/schema contracts, GraphQL generation and real module DI. Mocks test business decisions/session wiring, not MongoDB isolation.

Created components/event/event.integration.spec.ts with 5 opt-in cases for concurrent duplicates/approvals, capacity-decrease contention, rollback and actual filter/pagination/history queries. Requires EVENT_TEST_MONGO_URI pointing to a transaction-capable test server; creates and drops only a fresh gamenix_event_test_* database. Never uses the application's configured database URI.

Validation executed:

- npx tsc -p apps/gamenix-api/tsconfig.app.json --noEmit — PASS.
- npx tsc -p apps/gamenix-batch/tsconfig.app.json --noEmit — PASS.
- npm run build — PASS (API).
- ./node_modules/.bin/nest build gamenix-batch — PASS.
- ./node_modules/.bin/jest --runInBand --silent — PASS: 88 tests / 3 suites; 5 integration tests / 1 suite skipped because no dedicated URI is configured. Includes 55 event tests and 33 existing tests.
- Full offline API GraphQL schema generation — PASS: 8 resolvers / 25 queries / 33 mutations. Real EventModule DI also PASS in the event suite.
- git diff --check — PASS.

Updated all six docs/ai handoff files, preserving earlier migration history and decisions. No live DB, HTTP/e2e or image upload tests ran; concurrency/rollback/topology remain unverified against MongoDB. Event-image directory/target integration remains separate work, as described in BACKEND_MIGRATION. No data migration, dependency installation, auto-fixing lint, schema relocation or commit was performed. Stop after Events; other modules require a new request.

## OrderService aligned with existing services — 2026-10-10

Reviewed ProductService, MemberService, BoardArticleService, CommentService and LikeService. Refactored all four existing OrderService methods to use their formatting, input destructuring, search/match objects, targetOrder/result naming, explicit model result types and fluent Mongoose queries ending in exec(). Expanded the aggregation lookups and item data for readability; named the product-only sum subtotal. Kept existing exception classes/messages, query filters, write ordering, shipping, ownership, status/stock/points behavior and separate writes. No helpers, methods, transactions, validations, dependencies or GraphQL changes were added. Existing tests required no changes.

Recorded the user's ongoing refactoring style preference in DECISIONS.md. Only OrderService and these two handoff docs changed in this increment; pre-existing changes were preserved. Validation: all 33 tests across 2 suites PASS (including offline GraphQL checks); API/batch TypeScript checks with --noEmit PASS; npm run build PASS (API); git diff --check PASS. No live MongoDB or HTTP/e2e tests were run.

## Clearer updateOrder flow — 2026-10-10

Simplified updateOrder only: replaced canProcess/canFinish flags with an explicit next-status mapping, returned immediately after FINISHED and flattened the PROCESS stock/points steps. Added short comments explaining the flow. Existing checks cover business rules rather than duplicated DTO input validation, so ownership, active member/shop, allowed transitions, conditional status claiming, nonempty items and conditional stock deductions remain. No sessions, helpers, GraphQL changes or new behavior were introduced. Separate-write failure limitations documented below still apply.

Expanded transition tests to cover skipped and backward changes without status, stock or point writes. Validation: all 33 tests across 2 suites PASS (including offline GraphQL checks); API and batch TypeScript checks with --noEmit PASS; npm run build PASS (API); git diff --check PASS. No live database or HTTP/e2e tests were run. Only OrderService, its existing order-delivery test file and this ledger were edited in this increment; pre-existing changes were preserved.

## Simplified Express-style OrderService — 2026-10-10

COMPLETED after the user explicitly approved removal of transactions as well as unnecessary service validation. Existing uncommitted migration changes were preserved.

Changes:

- components/order/order.service.ts: only four original methods remain. Removed sessions, withTransaction, assertActiveMember, service-level enum/address/cart checks duplicated by DTOs/schemas, safe-integer/finite-number checks and duplicate-product Set rejection. Creation follows find → map → reduce → create → recordOrderItem; item persistence follows map/Promise.all/create. Current member/shop checks are inline; database prices, ownership, stock checks, status transitions and shipping rules remain.
- components/member/member.service.ts: reverted only the earlier session-support hunks in memberStatsEditor. It again takes the original StatisticModifier argument and performs its existing $inc. No other member logic changed.
- components/order/order-delivery.spec.ts: mocks now reflect separate writes; input validation is tested at its DTO/schema boundary. Added duplicate-line totals and six status/stock/points cases, including repeated/competing requests and the explicit partial-write consequence.
- Updated this file, BACKEND_MIGRATION, DECISIONS and NEXT_STEPS. Schemas, DTOs, enums, GraphQL operations, auth/guards, modules and product services were not changed in this increment.

Without transactions, updateOrder first claims the old status using a conditional update, then deducts stock and grants one point using MemberService. This prevents competing requests from applying the same transition twice. A failed later write does not roll back the status or earlier writes. Creation may leave incomplete items; retrying the same PROCESS status does not repair failures. These limits are intentional under the user's latest decision, not guarantees of atomicity.

Validation: npx tsc for apps/gamenix-api/tsconfig.app.json and apps/gamenix-batch/tsconfig.app.json with --noEmit PASS; npm run build PASS (API); ./node_modules/.bin/jest --runInBand --silent PASS, 2 suites / 30 tests (25 order tests and 5 existing guard tests); git diff --check PASS. Offline GraphQL schema checks are included. No auto-fixing lint, live MongoDB tests or HTTP/e2e tests were run. Competing-update tests use an atomic mock and do not replace database concurrency verification.

## Delivery pricing, order address and pickup — 2026-10-10

COMPLETED under the user's clarified delivery/address request and confirmed fee rules. Added orderAddress, restored orderDelivery as a numeric price and introduced PICKUP / DELIVERY fulfillment choices. DELIVERY is the default and requires an address; PICKUP has free shipping and may omit it.

Pricing in USD, once per order: any delivered CHAIR or DESK costs 15, including mixed same-shop orders; other delivery costs 5 below subtotal 100 and 0 at/above 100; pickup costs 0 for every category. Totals use database product prices times quantities plus the delivery fee, rounded to two decimals. No discount is applied.

Files changed for this increment (source paths relative to apps/gamenix-api/src):

- schemas/Order.model.ts: numeric nonnegative fee, separate conditionally required address and fulfillment enum/default.
- libs/enums/order.enum.ts: registered OrderDeliveryType PICKUP / DELIVERY; OrderStatus unchanged.
- libs/dto/order/order.ts: fee/address/fulfillment output fields; address nullable for pickup.
- libs/dto/order/order.input.ts: fulfillment choice and conditionally required address; fee/total remain server-controlled.
- components/order/order.service.ts: address/fulfillment checks and simple shipping calculation in createOrder. Method names are unchanged; item persistence, history, stock/status/points and authorization method bodies remain unchanged.
- components/order/order-delivery.spec.ts: 19 focused schema, validation, GraphQL and service fee tests.
- This file plus BACKEND_MIGRATION, DECISIONS and NEXT_STEPS: current semantics, rules, validation and compatibility notes. No guard, authentication, product service, MemberService, resolver, OrderUpdate or module wiring changes were made in this increment. Pre-existing working-tree changes were preserved.

Example delivery creation input: {orderDeliveryType: DELIVERY, orderAddress: "Seoul address", orderItems: [{productId: "<product-id>", itemQuantity: 1}]}. For pickup use PICKUP and omit orderAddress. The server returns orderDelivery and orderTotal.

Validation:

- npx tsc -p apps/gamenix-api/tsconfig.app.json --noEmit: PASS.
- npx tsc -p apps/gamenix-batch/tsconfig.app.json --noEmit: PASS.
- npm run build: PASS (API).
- ./node_modules/.bin/nest build gamenix-batch: PASS.
- ./node_modules/.bin/jest --runInBand --silent: PASS, 2 suites / 24 tests (19 new order tests and the existing 5 guard tests).
- Offline GraphQL schema generation, field types, default choice and server-controlled input contract: PASS within the tests.
- Method/body comparison: item persistence, order history, status/stock/points and authorization logic preserved.
- git diff --check: PASS. No auto-fixing lint was run.

Tests cover numeric/negative/free shipping, required delivery address, pickup without address, default fulfillment, quantity-based threshold, 99.99/100 boundary, chair/desk fees, mixed orders, total calculation, stored item prices and supplied-fee spoofing. Service database calls are mocked. Live MongoDB transactions/rollback/concurrency and HTTP/e2e behavior were not tested. Existing order documents and frontend requests using the old string orderDelivery contract require a reviewed migration; none was executed.

## Perfumia-style order implementation — 2026-10-09

COMPLETED under the new order implementation request. The working tree was clean before this task. Read Perfumia's order service/controller/types/enums/schemas/router as a reference; no Perfumia files were modified. Preserved Gamenix ER schemas, string delivery address and product-only totals as explicitly selected by the user.

Files changed (all source paths relative to `apps/gamenix-api/src`):

- `components/order/order.module.ts`: register existing OrderItem, Product and Member models alongside Order; import AuthModule.
- `components/order/order.resolver.ts`: authenticated createOrder, getMyOrders and updateOrder following existing decorators and DI patterns.
- `components/order/order.service.ts`: server-side price snapshots/totals, active member/shop checks, one-shop validation, paginated buyer order joins, owned forward-only status changes, transactional stock decrement and one-point reward on PROCESS, same-state retry handling and session cleanup.
- `libs/dto/order/order.input.ts`: creation address/items and OrdersInquiry pagination/status filter.
- `libs/dto/order/order.update.ts`: only order ID and required status; remove client-controlled total/address from status commands.
- `libs/dto/order/order.ts`: optional aggregation fields orderItems/productData.
- `libs/dto/order-item/order-item.input.ts`: only quantity/product ID; prices and parent order IDs are assigned server-side.
- Added `components/order/order.service.spec.ts` and `components/order/order.resolver.spec.ts`.
- Updated this file, BACKEND_MIGRATION, DECISIONS and NEXT_STEPS. No schemas, guards, auth implementation, product services, event components, dependencies or database configuration changed.

New GraphQL input examples:

```graphql
# createOrder(input: OrderInput!): Order!
# input: {orderDelivery: "Seoul address", orderItems: [{productId: "<product-id>", itemQuantity: 2}]}
# getMyOrders(input: OrdersInquiry!): [Order!]!
# input: {page: 1, limit: 10, orderStatus: PROCESS} # status is optional
# updateOrder(input: OrderUpdate!): Order!
# input: {_id: "<order-id>", orderStatus: PROCESS} # then FINISHED
```

Validation:

- `npx tsc -p apps/gamenix-api/tsconfig.app.json --noEmit`: PASS. Subsequent API and batch checks using the installed `./node_modules/.bin/tsc` also PASS.
- `npx tsc -p apps/gamenix-batch/tsconfig.app.json --noEmit`: PASS.
- `npm run build`: PASS (API).
- `./node_modules/.bin/nest build gamenix-batch`: PASS.
- `./node_modules/.bin/jest --runInBand`: PASS, 3 suites / 32 tests (27 order tests plus the existing 5 guard tests).
- GraphQL schema generation and actual OrderModule dependency resolution: PASS offline within those tests.
- `git diff --check`: PASS. No auto-fixing lint was run.

Coverage includes database-derived prices/ownership, mixed shops, invalid/duplicate items, stock and approval checks, buyer-only listing/update filters, transitions, repeat PROCESS, same-session writes, failed item writes and later-item stock failure, nested DTO validation and GraphQL input exposure. Database operations are mocked: no live MongoDB rollback/concurrency, deployment topology, payment or HTTP/e2e verification occurred.

Operational limits: MongoDB transactions require a replica set or sharded cluster. PAUSE does not reserve stock; availability is rechecked on PROCESS. PROCESS is not payment verification. Create retries can create separate orders. No cancellation/restock, shop/admin order management or event business logic was added. The separate catalog approval gap remains unchanged.

## Event and order component scaffolds — 2026-10-09

COMPLETED: created six files under `apps/gamenix-api/src/components`:

- `event/event.module.ts`, `event/event.resolver.ts`, `event/event.service.ts`
- `order/order.module.ts`, `order/order.resolver.ts`, `order/order.service.ts`

Modified `components/components.module.ts` to import/register both modules. Kept existing singular domain naming, @Module/@Resolver/@Injectable decorators, constructor injection, Mongoose model registration and service-export conventions. Event and Order reuse existing schemas and DTO types in place. Related OrderItem/EventParticipant models are not registered here.

No application operations or business logic were introduced. Authentication, guards, uploads, product/member logic, schemas and DTOs remain unchanged. Existing event/order data definitions now have modules/services/resolvers, but CRUD, checkout and registration operations remain unimplemented. Updated BACKEND_MIGRATION, COMPLETED_TASKS and NEXT_STEPS to distinguish scaffolding from feature completion.

Validation: both app `npx tsc -p .../tsconfig.app.json --noEmit` checks PASS; `npm run build` PASS (API); `npm test -- --runInBand --watch=false --silent` PASS (1 suite / 5 tests currently present). An offline Nest TestingModule with mocked model providers resolved EventResolver/EventService and OrderResolver/OrderService successfully. No live database connection, deployed index or runtime feature behavior was tested.

## Guard preservation correction — 2026-10-09

At the user's request, reverted only the agent's RolesGuard changes and the dependent AuthModule Member-model registration/export. No user changes existed in those diffs. Production `roles.guard.ts`, `auth.guard.ts`, `without.guard.ts` and `auth.module.ts` now match HEAD exactly (verified with git diff --exit-code).

Retained service changes: SHOP/PENDING signup, public ADMIN signup rejection and prevention of self-service role/status writes. The user's PENDING enum addition is preserved. Existing ADMIN operations and all other architecture remain unchanged.

Updated the newly created `components/auth/guards/shop-approval.spec.ts` to test unchanged role-based behavior instead of the removed current-member checks. The test explicitly records that PENDING SHOP tokens are still allowed by the original guard. No production guard modifications or replacement authorization feature remains. Updated these four handoff docs to distinguish the remaining approval-enforcement gap from the historical completed implementation below.

Current validation:

- API TypeScript check: PASS.
- Batch TypeScript check: PASS.
- npm run build: PASS (API).
- nest build gamenix-batch: PASS.
- npm test -- --runInBand --watch=false --silent: PASS, 3 suites / 38 tests.
- Production guards/AuthModule compared with HEAD: identical.

SHOP operational status restrictions and current-database authorization freshness are NOT implemented after this reversal. Existing admin status updates still work, but PENDING accounts are not prevented from SHOP role-protected operations. No alternative solution was introduced automatically. Earlier 44-test and enforcement claims below describe the superseded state.

## Earlier records — latest correction takes precedence

## Minimal Phase 2 SHOP approval — 2026-10-09

COMPLETED after the user approved the revised minimal file list. Only the user's existing MemberStatus.PENDING addition was uncommitted at the start; it was preserved without edits. The broader earlier auth/upload changes were not present and were not restored.

Source files modified:

- `apps/gamenix-api/src/components/member/member.service.ts` — reject public ADMIN signup; set SHOP signup to PENDING before the unchanged hash/create/token sequence; reject self-updates of role/status to prevent approval bypass. Existing login and admin update implementation are unchanged.
- `apps/gamenix-api/src/components/auth/guards/roles.guard.ts` — after unchanged JWT verification, load current Member and require the current role; require ACTIVE for SHOP/ADMIN. Missing current members are denied. Existing JWTs reflect approval/blocking/demotion at the next role-protected request. Ordinary USER status rules were not expanded.
- `apps/gamenix-api/src/components/auth/auth.module.ts` — register/export the existing Member model so consumer-module RolesGuards can query it; AuthService remains unchanged.

Test files created:

- `apps/gamenix-api/src/components/member/shop-approval.spec.ts`
- `apps/gamenix-api/src/components/auth/guards/shop-approval.spec.ts`

Documentation modified:

- `docs/ai/BACKEND_MIGRATION.md`
- `docs/ai/DECISIONS.md`
- `docs/ai/COMPLETED_TASKS.md`
- `docs/ai/NEXT_STEPS.md`

Existing operations used, without new mutations/DTOs:

- signup(input: MemberInput) and login(input: LoginInput).
- getAllMembersByAdmin(input: MembersInquiry), with SHOP/PENDING search filters, lists pending shops.
- updateMemberByAdmin(input: MemberUpdate) with {_id: shopId, memberStatus: ACTIVE} approves the account under existing ADMIN/RolesGuard authorization.

USER remains ACTIVE by the existing schema default. SHOP begins PENDING and may log in under the existing login rules, but cannot perform SHOP role-protected operations. Admin approval sets ACTIVE through existing trusted status management; no separate rejection workflow was implemented. Self role/status writes are rejected even though MemberUpdate retains these fields for the existing admin operation.

| Validation command | Result |
|---|---|
| `npx tsc -p apps/gamenix-api/tsconfig.app.json --noEmit` | PASS — no compilation errors |
| `npx tsc -p apps/gamenix-batch/tsconfig.app.json --noEmit` | PASS — no compilation errors |
| `npm run build` | PASS — API webpack |
| `./node_modules/.bin/nest build gamenix-batch` | PASS — batch webpack |
| `npm test -- --runInBand --watch=false --silent` | PASS — 3 suites, 44 tests |
| `git diff --check` | PASS |

The existing 20 ER tests were preserved. New tests cover unchanged USER signup/defaults, real bcrypt/JWT helpers, SHOP/PENDING signup/login, active login, existing credential/block rejection, public ADMIN rejection, self-approval/promotion denial, unchanged ordinary profile/image-path updates, existing admin filters/status updates, pending/active/blocked SHOP authorization, non-admin approval denial, stale-token approval/demotion behavior and cross-module Member-model injection.

Limitations: no live MongoDB or HTTP/e2e tests ran. Existing GraphQL upload mutations/static /uploads serving remain untouched; no HTTP upload endpoint was found in this checkout, so Axios upload compatibility is NOT VERIFIED. Existing ACTIVE-only profile-update behavior means a pending shop cannot save memberImage through updateMember before approval; the external/missing HTTP endpoint's persistence behavior is unknown. No new upload or signup-image requirement was added. No new admin bootstrap or existing-account reclassification was performed.

AuthService, AuthGuard/WithoutGuard, password hashing, JWT payload/signing, member resolvers/DTOs, schemas, product/order/event/community/socket source, app paths, dependency/config files and other handoff files were not changed. No lint auto-fix, commits or further phase work was performed. npm log-directory sandbox warnings did not affect successful checks.

Earlier phase records below retain historical decisions and validation; this revised minimal implementation is the current source of truth for shop approval.

## Earlier phase records

## EventParticipant completion — 2026-10-09

COMPLETED: the user confirmed ParticipantStatus REGISTERED / CANCELLED and authorized the remaining Phase 1 data definitions. Phase 1 ER schemas/DTOs/enums are now complete. Earlier partial-status records below describe the state before this follow-up.

Created (paths relative to `apps/gamenix-api/src`):

- `schemas/EventParticipant.model.ts`: exactly the ER fields plus standard Mongoose metadata, timestamps, collection `eventParticipants`, required Event/Member ObjectId refs, default REGISTERED, enum validation and unique compound `(eventId, memberId)` index.
- `libs/enums/participant.enum.ts`: ParticipantStatus REGISTERED / CANCELLED and GraphQL enum registration.
- `libs/dto/event-participant/event-participant.ts`: GraphQL output with IDs, status and timestamps.
- `libs/dto/event-participant/event-participant.input.ts`: required eventId, optional status, internal memberId for future authenticated assignment, matching existing ownership DTO conventions.
- `libs/dto/event-participant/event-participant.update.ts`: required `_id` and optional validated status; Event/Member references stay fixed in this DTO.

Modified: `apps/gamenix-api/src/libs/dto/er-model.spec.ts` with participant enum/GraphQL/ref/index/default/invalid-state/invalid-ID coverage, plus the six `docs/ai/*.md` handoff files to close the participant dependency and retain migration history. All other pre-existing working-tree changes were preserved. No schemas were relocated; no auth, guards, product services, orders, community or batch source was changed in this follow-up.

Validation after implementation:

| Command | Result |
|---|---|
| `npx tsc -p apps/gamenix-api/tsconfig.app.json --noEmit` | PASS — no compilation errors |
| `npx tsc -p apps/gamenix-batch/tsconfig.app.json --noEmit` | PASS — no compilation errors |
| `npm run build` | PASS — API webpack |
| `./node_modules/.bin/nest build gamenix-batch` | PASS — batch webpack |
| `npm test -- --runInBand --watch=false` | PASS — 1 suite, 20 tests |

The unique index covers CANCELLED records too; future registration code must decide how to reuse an existing pair. Only offline schema/index definitions and DTO validation were tested; no live database/index deployment or duplicate-write integration test was run. npm log-directory sandbox warnings did not affect successful results.

No registration services, GraphQL registration operations or application model providers were added. Future authentication assignment, authorization, reference existence checks, capacity/deadlines, re-registration and duplicate-key handling remain business work requiring Phase 2 approval. Phase 2 has not started.

## Earlier ER Phase 1 increment — before participant completion, 2026-10-09

The working tree was clean before this increment. Completed: MemberType AGENT → SHOP, memberProducts schema/output/counters; Product schema, enum, DTOs, module/resolver/service rename and required lifecycle adaptations; Order, OrderItem and Event schemas/object/input/update DTOs/enums; directly dependent comment/like/view/notification/config/batch references. Product fields/categories match the ER; housing fields/filters and the old unique index are removed. Auth/JWT/guards/password behavior, community operations and sockets were preserved.

ProductStatus mapping was explicitly approved by the user: active PROCESS, sold FINISHED, deletion through deletedAt. PAUSE remains editable without a counter decrement. Sale and deletion paths now persist Date values; the focused tests exposed the old Moment default-import incompatibility, so these directly affected timestamp paths use native `new Date()`.

PARTIAL: EventParticipant requires confirmation of participantStatus values. No participant enum/schema/DTO files have been invented. Phase 1 is not declared fully complete. No order/event services, checkout, payment, inventory deduction, event registration, new WebSocket or frontend behavior has been implemented. New Order/OrderItem/Event schemas/DTOs are definitions, not runtime endpoints/providers.

### Validation for this increment

- Both API and batch TypeScript checks: PASS (no compilation errors).
- `npm run build`: PASS (API webpack).
- `./node_modules/.bin/nest build gamenix-batch`: PASS.
- `npm test -- --runInBand --watch=false`: PASS, 1 suite / 16 tests in the final working tree. Covers offline GraphQL DTO generation and Mongoose shape/reference/default/validation checks. Earlier, an additional lifecycle suite passed (23 total tests) after three timestamp tests exposed Moment default-import interop; the directly affected code was corrected. That lifecycle spec disappeared from the working tree during final review, so its removal was preserved and the remaining suite rerun. The file is not part of the final inventory.
- No lint auto-fix, live database migration, database integration, full-app HTTP/GraphQL authorization/e2e, frontend or socket testing was performed. Model refs/index definitions are not proof of deployed indexes or authorization. npm log-directory sandbox warnings did not prevent successful commands.

### Remaining compatibility and business work

Stored AGENT/PROPERTY data, old collection/field names, client documents and JWTs are not migrated automatically. Existing member-counter writes are nontransactional. No new SHOP enforcement services or one-shop order validation exist for the new definitions. EventParticipant remains the Phase 1 dependency; new operations and all Phase 2 work require separate approval.

### File inventory for this increment

The removed Property paths below are superseded by their corresponding Product files; no unrelated functionality/files were removed. No app directories were renamed. All paths are relative to the repository root.

#### Created

- `apps/gamenix-api/src/components/product/product.module.ts`
- `apps/gamenix-api/src/components/product/product.resolver.ts`
- `apps/gamenix-api/src/components/product/product.service.ts`
- `apps/gamenix-api/src/libs/dto/er-model.spec.ts`
- `apps/gamenix-api/src/libs/dto/event/event.input.ts`
- `apps/gamenix-api/src/libs/dto/event/event.ts`
- `apps/gamenix-api/src/libs/dto/event/event.update.ts`
- `apps/gamenix-api/src/libs/dto/order-item/order-item.input.ts`
- `apps/gamenix-api/src/libs/dto/order-item/order-item.ts`
- `apps/gamenix-api/src/libs/dto/order-item/order-item.update.ts`
- `apps/gamenix-api/src/libs/dto/order/order.input.ts`
- `apps/gamenix-api/src/libs/dto/order/order.ts`
- `apps/gamenix-api/src/libs/dto/order/order.update.ts`
- `apps/gamenix-api/src/libs/dto/product/product.input.ts`
- `apps/gamenix-api/src/libs/dto/product/product.ts`
- `apps/gamenix-api/src/libs/dto/product/product.update.ts`
- `apps/gamenix-api/src/libs/enums/event.enum.ts`
- `apps/gamenix-api/src/libs/enums/order.enum.ts`
- `apps/gamenix-api/src/libs/enums/product.enum.ts`
- `apps/gamenix-api/src/schemas/Event.model.ts`
- `apps/gamenix-api/src/schemas/Order.model.ts`
- `apps/gamenix-api/src/schemas/OrderItem.model.ts`
- `apps/gamenix-api/src/schemas/Product.model.ts`

#### Modified

- `apps/gamenix-api/src/components/comment/comment.module.ts`
- `apps/gamenix-api/src/components/comment/comment.service.ts`
- `apps/gamenix-api/src/components/components.module.ts`
- `apps/gamenix-api/src/components/like/like.service.ts`
- `apps/gamenix-api/src/components/member/member.resolver.ts`
- `apps/gamenix-api/src/components/member/member.service.ts`
- `apps/gamenix-api/src/components/view/view.service.ts`
- `apps/gamenix-api/src/libs/config.ts`
- `apps/gamenix-api/src/libs/dto/member/member.ts`
- `apps/gamenix-api/src/libs/enums/comment.enum.ts`
- `apps/gamenix-api/src/libs/enums/like.enum.ts`
- `apps/gamenix-api/src/libs/enums/member.enum.ts`
- `apps/gamenix-api/src/libs/enums/notification.enum.ts`
- `apps/gamenix-api/src/libs/enums/view.enum.ts`
- `apps/gamenix-api/src/schemas/Member.model.ts`
- `apps/gamenix-api/src/schemas/Notification.model.ts`
- `apps/gamenix-batch/src/batch.controller.ts`
- `apps/gamenix-batch/src/batch.module.ts`
- `apps/gamenix-batch/src/batch.service.ts`
- `apps/gamenix-batch/src/lib/config.ts`
- `docs/ai/BACKEND_MIGRATION.md`
- `docs/ai/COMPLETED_TASKS.md`
- `docs/ai/DECISIONS.md`
- `docs/ai/FRONTEND_MIGRATION.md`
- `docs/ai/NEXT_STEPS.md`
- `docs/ai/PROMPTS.md`

#### Superseded Property paths

- `apps/gamenix-api/src/components/property/property.module.ts`
- `apps/gamenix-api/src/components/property/property.resolver.ts`
- `apps/gamenix-api/src/components/property/property.service.ts`
- `apps/gamenix-api/src/libs/dto/property/property.input.ts`
- `apps/gamenix-api/src/libs/dto/property/property.ts`
- `apps/gamenix-api/src/libs/dto/property/property.update.ts`
- `apps/gamenix-api/src/libs/enums/property.enum.ts`
- `apps/gamenix-api/src/schemas/Property.model.ts`

## Historical snapshot — retained for migration history

The following records describe earlier repository states and proposals. Current status and accepted decisions above take precedence. Earlier validation records remain historical.

Snapshot: 2026-10-09 (Asia/Seoul).

## Status definitions and provenance

- **COMPLETED**: confirmed source/documentation exists or a recorded action finished; runtime success requires its own evidence.
- **IN PROGRESS**: work actually started and unfinished.
- **PLANNED / NOT STARTED**: requested target without implementation evidence.
- **NOT VERIFIED**: no executed validation result or insufficient runtime evidence.

This session contains the user instructions, attached documentation request, repository inspection, and creation of these six handoff files. It contains no prior backend implementation work. Pre-existing code below is not attributed to this session. Initial `git status --short` was clean; latest inspected commit was `1420cfd` (`feat: create Agents and Skills for AI agents`). The referenced handoff folder did not exist before this task.

## COMPLETED in this session

| Work | Evidence |
|---|---|
| Read attached request and repository instructions | `AGENTS.md`; user attachment |
| Inspect actual application/configuration/domain/test sources | `package.json`, `nest-cli.json`, `tsconfig.json`, both apps and sources listed below |
| Identify target/current discrepancies and validation boundaries | App names, AGENT role, property catalog, absent product/order/event/frontend sources |
| Create backend migration snapshot | `docs/ai/BACKEND_MIGRATION.md` |
| Record confirmed requirements versus pending mechanisms | `docs/ai/DECISIONS.md` |
| Create phased frontend plan without invented paths | `docs/ai/FRONTEND_MIGRATION.md` |
| Record evidence and validation status | `docs/ai/COMPLETED_TASKS.md` |
| Prioritize remaining work | `docs/ai/NEXT_STEPS.md` |
| Save reusable next-session prompts | `docs/ai/PROMPTS.md` |

The initial documentation task changed only the six handoff files. The subsequent authorized project rename is recorded below. No dependency was installed and no database migration was executed.

## Existing functionality confirmed in source, runtime NOT VERIFIED

| Area | Exact source evidence | Scope |
|---|---|---|
| API/batch monorepo | `nest-cli.json`, `apps/gamenix-api/src/app.module.ts`, `apps/gamenix-batch/src/batch.module.ts` | Gamenix app names/configuration now applied; original domain logic preserved |
| Authentication | `apps/gamenix-api/src/components/auth/auth.service.ts`; `components/member/member.service.ts` under the same `src` | bcrypt signup/login, JWT creation/verification; not a role migration |
| Member roles | `apps/gamenix-api/src/libs/enums/member.enum.ts` | USER / AGENT / ADMIN, no SHOP |
| Catalog module/resolver/service | `apps/gamenix-api/src/components/property/property.module.ts`, `property.resolver.ts`, `property.service.ts` | Property creation/read/update, agent/admin listing/actions, favorites/visited/likes |
| Catalog DTOs/enums/schema | `apps/gamenix-api/src/libs/dto/property/property.ts`, `property.input.ts`, `property.update.ts`; `libs/enums/property.enum.ts`; `schemas/Property.model.ts` under the same `src` | Real-estate fields and categories; no product stock |
| Member inquiries/updates/schema | `apps/gamenix-api/src/libs/dto/member/member.input.ts`, `member.update.ts`; `apps/gamenix-api/src/schemas/Member.model.ts` | AgentsInquiry, member counters and role/status inputs remain |
| Community | `apps/gamenix-api/src/components/board-article/board-article.resolver.ts`, `comment/comment.resolver.ts`, `follow/follow.resolver.ts`, `like/like.service.ts`, `view/view.service.ts` | Existing article/comment/follow operations, generic interactions and property-specific dependencies |
| Socket | `apps/gamenix-api/src/socket/socket.gateway.ts`, `apps/gamenix-api/src/main.ts` | Optional URL-token auth, client Map, global broadcast, five in-memory messages |
| Batch | `apps/gamenix-batch/src/batch.service.ts` | Property/agent rank reset and calculation; shared API model imports |
| Notifications/notices | `apps/gamenix-api/src/schemas/Notification.model.ts`, `Notice.model.ts` | Schema presence only; dedicated feature implementation not established |

## Migration completion ledger

| Target | Status | Evidence / missing work |
|---|---|---|
| Backend app naming/configuration rename | COMPLETED | Gamenix app folders, config/scripts/package metadata/imports and name labels |
| Property module/file/class/interface migration | PLANNED / NOT STARTED | Property domain names remain |
| Product GraphQL operation/input/output migration | PLANNED / NOT STARTED | Current operations are property-based |
| Gaming category DTO/enum/schema/filter migration | PLANNED / NOT STARTED | APARTMENT / VILLA / HOUSE and housing filters remain |
| AGENT → SHOP auth/member/permission migration | PLANNED / NOT STARTED | No SHOP enum; privileged-field policy needs review |
| Product ownership and inventory | PLANNED / NOT STARTED | Property owner predicate exists; no productLeftCount/product model |
| Order/order-item and single-shop validation | PLANNED / NOT STARTED | No implementation found |
| Event/participant and duplicate prevention | PLANNED / NOT STARTED | No implementation found |
| Community reuse for products | PLANNED | Existing community code needs PROPERTY references updated |
| Private customer/shop chat | PLANNED / NOT STARTED | Global chat exists; conversation routing/persistence absent |
| Next.js frontend migration | PLANNED / NOT STARTED here | Frontend checkout not found |

No application migration task is recorded as IN PROGRESS; this session completed documentation only.

## Initial documentation-task validation record

Read-only checks executed: `git status --short`, `git log -5 --oneline`, `rg --files`, targeted `rg -n`, directory listing, and source/config/test reads. These support implementation inventory, not compilation/runtime correctness. Documentation was checked for the six expected files, valid relative documentation links, and absence of tracked application changes.

| Command / check | Result this session |
|---|---|
| `npx tsc -p apps/gamenix-api/tsconfig.app.json --noEmit` | NOT VERIFIED during the initial documentation task — not run; paths were absent then |
| `npx tsc -p apps/gamenix-batch/tsconfig.app.json --noEmit` | NOT VERIFIED during the initial documentation task — not run; paths were absent then |
| Current-path API/batch TypeScript checks | NOT VERIFIED — not run |
| `npm run build` | NOT VERIFIED — not run; targeted Nestar API by default at that time |
| Unit/e2e, GraphQL, authorization, inventory/order, event, socket tests | NOT VERIFIED — not run |
| `npm run lint` | Not run; script uses `--fix` |

To preserve the six-file-only scope, builds and compiler checks that may emit build metadata/output were not run. Existing e2e files are `apps/gamenix-api/test/app.e2e-spec.ts` and `apps/gamenix-batch/test/app.e2e-spec.ts`; each checks a root greeting against `Hello World!`. No focused product/order/event/socket tests were found in the inspected source inventory. Test files do not establish passing tests.

## Known gaps and source findings

- App naming now matches `AGENTS.md`; target schema placement still differs from current `src/schemas`.
- Signup and ordinary member update expose `memberType`; member update also exposes `memberStatus`. Services pass these through, creating a privileged-field risk requiring tests and a focused fix.
- `RolesGuard` dereferences `authMember.memberType` before checking `authMember` for absence.
- Property update/admin update compute local `soldAt` / `deletedAt` values without copying them into the persisted input; timestamp behavior needs correction/verification.
- Socket gateway logs connection tokens, permits guests to send global messages, and has no private conversation authorization or durable history.
- Product stock, checkout, orders, tournaments/giveaways and registrations are absent from the inspected implementation.
- Deployed database contents, deployed API schema, frontend code, payment/shipping policy and historical validation outcomes are unknown.

These findings are from static inspection; runtime reproduction is NOT VERIFIED.

## Subsequent session work: project rename to Gamenix (2026-10-09)

COMPLETED: user requested `gamenix` naming, preserving existing structure and application logic. Renamed `apps/nestar-api` → `apps/gamenix-api` and `apps/nestar-batch` → `apps/gamenix-batch`. Updated `package.json`, root package names in `package-lock.json`, `nest-cli.json`, both `tsconfig.app.json` output paths, API/batch absolute imports, API/batch greeting labels and batch e2e describe label. Updated `AGENTS.md`, `SKILLS.md` and the handoff documentation to use Gamenix and current paths. Historical Nestar mentions remain only in documentation.

No domain refactor, schema relocation, dependency installation or database change was included. Validation executed successfully after the rename:

| Command / check | Result |
|---|---|
| `npx tsc -p apps/gamenix-api/tsconfig.app.json --noEmit` | PASS |
| `npx tsc -p apps/gamenix-batch/tsconfig.app.json --noEmit` | PASS |
| `npm run build` | PASS — default Gamenix API webpack compilation |
| `./node_modules/.bin/nest build gamenix-batch` | PASS — batch webpack compilation |
| Compare all moved application files to HEAD with only name/path substitutions | PASS |
| Package/lockfile root names and Nest project path consistency | PASS |

npm emitted a sandbox warning about writing its log directory; compilation/builds still exited successfully. No runtime/GraphQL/e2e tests were executed for this naming-only change.


## Full-stack integration blockers — 2026-10-10

The latest full-stack request authorizes minimal integration fixes beyond Events. Guards, JWT logic, schemas and operation names are preserved. MemberService.assertActiveShop checks current role/status for createProduct, updateProduct and getShopProducts. getMember permits PENDING/DELETE only for the signed-in member reading their own profile. Upload targets are allowlisted (member/article/property/product/event); directories are created before existing multipart writes. Validation is recorded in frontend docs/INTEGRATION.md; source changes alone do not establish live correctness. No database records migrated.

JWT environment integration correction — 2026-10-10: direct inspection of normal AppModule import confirmed JwtModule.register captured the literal "undefined" before ConfigModule loaded .env. Changed only registration to registerAsync/useFactory so the existing SECRET_TOKEN is read at Nest initialization. Token payload/signing/verification and all guards remain unchanged. Existing tokens issued with the previous misconfiguration require login again. No secret values were printed or modified.
