# Next steps

## Current external blocker reconfirmed — 2026-11-02

The latest runtime and real provider request reconfirm http://localhost:3000 as the exact callback origin and HTTP400/-400 as missing Web registration. Backend restart/environment loading is already verified. Add http://localhost:3000 under the KakaoPay application issuing the existing Secret key(dev) → Platform → Web → Site domains; save, refresh the existing saved order and retry Pay with KakaoPay. The user confirmed saving the origin but then reported the same rejection; the latest saved attempt still has no TID. There is no inherited key override. No authenticated console access is available to verify whether the persistent Web entry and existing dev key belong to the same KakaoPay application. Privately check that association at developers.kakaopay.com and confirm the entry remains after reload; if correct, contact KakaoPay support about the continuing HTTP400/-400 no-domain response. Stop external payment testing at this blocker; do not bypass validation, generate a token/QR or claim success. Then verify the actual official checkout, provider TEST completion, real pg_token callback, backend approval/capture, refresh and duplicate protection. Precise errors and neutral UI wording are installed; details are in DIRECT_KAKAOPAY_MIGRATION.md.

## Register KakaoPay Web origin, then finish the real sandbox flow — current

The exact current external blocker is HTTP400/-400: no site domain is registered for the KakaoPay application issuing the existing dev key. In KakaoPay Developers select that application → Platform → Web → Site domains, add http://localhost:3000 (scheme/host/port only, no path/trailing slash), and save. Do not change or share the existing key. The user was asked to confirm this setup; confirmation has not been received. After the installed fix, refresh the existing awaiting-confirmation KRW order and explicitly retry Pay with KakaoPay. The owner-safe server reclaims only an unexposed/no-TID preparation and retains its order/payment identity. Then verify actual official checkout/QR if supplied, user approval, callback, backend capture and refresh/replay/cancellation. Current real TEST ready requests are rejected, so no complete sandbox success is claimed. The separate PROCESS order is not reset; fulfillment/stock/points are untouched. No webhook configuration is needed by the current return-plus-order-query flow.

## Exercise the validated direct KakaoPay TEST integration — 2026-10-29

Use the user's existing `KAKAOPAY_SECRET_KEY`, `KAKAOPAY_CID=TC0ONETIME` and `KAKAOPAY_API_URL=https://open-api.kakaopay.com`; do not request PortOne configuration or ask for the key in chat. Direct-only backend/frontend TypeScript/builds, 429 backend tests (four opt-in DB skips), 75 GraphQL documents and payment/basket regressions pass. The read-only existing-env recognition check returns DIRECT/enabled with no blockers and no provider call or displayed secret. Restart the API to load the corrected integration, then complete an authorized desktop/mobile provider TEST flow. If KakaoPay rejects a real test flow, check that the application's Online Payment API is enabled, the value is its Secret key(dev), and its Platform → Web settings contain the exact frontend origin. Follow `../gamenix365-next/docs/KAKAOPAY_SETUP.md`.

A real desktop/mobile TEST purchase/refund still requires the user to complete KakaoPay's provider UI; no such transaction has been claimed. Saved/uncertain TIDs and historical PortOne claims require lookup/manual review rather than issuing another charge. Preserve current unique payment indexes and all order/fulfillment/stock/points behavior. Do not execute a data/index migration or production payment. The older PortOne activation steps below are historical.

## Configure the copied Petora / PortOne test merchant — 2026-10-29

The approved migration is implemented and locally validated; do not restore the removed direct flow. Obtain the intended PortOne Store ID, KakaoPay TEST channel key, separately issued V2 API Secret and an independent TEST proof payment. Set the five PORTONE_* values in the existing environment privately and restart, following ../gamenix365-next/docs/KAKAOPAY_SETUP.md. KakaoPay direct keys cannot authenticate PortOne. Confirm existing unique payment indexes in deployment before enabling; no automatic provisioning/data writes ran. Then perform genuine desktop/mobile test checkout, saved-order return, duplicate/verification/refund retries and owner rejection against that merchant. No real transaction or live-MongoDB concurrency proof exists yet. Historical DIRECT/retired payment claims remain preserved and require review before replacement charging. See PETORA_PORTONE_MIGRATION.md.

## Activate the direct KakaoPay TEST application — 2026-10-28

Direct ready/approve/order integration is now installed and selected; do not rebuild it or require PortOne credentials for DIRECT. The remaining external setup is a KakaoPay Developers application with Online Payment enabled, its Secret key(dev) set as KAKAOPAY_SECRET_KEY_DEV in the backend, and the exact frontend origin registered under Platform→Web. Follow gamenix365-next/docs/KAKAOPAY_SETUP.md and restart the API after adding the key. Then validate genuine desktop/mobile TEST checkout, saved-order return, repeat callbacks and ambiguous-response recovery. Existing PortOne setup remains available only when explicitly selected. Neither recurring subscription billing nor production/live charges were requested/activated. Unknown or expired direct sessions require reconciliation rather than automatic new provider transactions.

## KakaoPay merchant activation — 2026-10-28

The newly requested sandbox checkout implementation is complete; do not rebuild it or restore removed payment workers. The next external input is the user's own PortOne store, direct KakaoPay TEST channel, V2 API secret and independent proof transaction. Follow gamenix365-next/docs/KAKAOPAY_SETUP.md, set the backend variables from .env.example and restart the API. Then verify one real desktop/mobile TEST checkout, duplicate/retry and saved-order return against that merchant, without claiming browser flags prove payment. Current local availability correctly stays disabled, and production/live payments remain off. Automatic webhook/refund/reconciliation processing and the preexisting ambiguous createOrder network-retry issue remain separately scoped. See the newest COMPLETED_TASKS entry for completed implementation and validation.

## Approve legacy product prices and configure sandbox access — 2026-10-21

New records now use KRW with approved ₩50/₩70 shipping below ₩50,000. Remaining decisions: native prices for the four audited legacy product IDs and the replacement/in-place backup policy in KRW_MIGRATION.md. Do not convert the five legacy orders/seven items or infer an exchange rate. Audit deployment databases separately. KakaoPay still needs actual sandbox credentials, compatible channel/interface/QR proof and order-bound idempotent payment integration; no SDK/payment-success flow exists. Frontend build remains blocked by the preexisting _error.tsx wrapper type error.

## Configuration and KRW decisions before external checkout — 2026-10-21

Configure matching backend GOOGLE_CLIENT_ID/frontend NEXT_PUBLIC_GOOGLE_CLIENT_ID and Google Cloud origins/audience as described in GOOGLE_AUTHENTICATION.md; verify deployed unique identity indexes before real-user tests. For KakaoPay, supply native KRW prices and delivery policy and follow KAKAOPAY_KRW_PLAN.md. Current getKakaoPayTestAvailability is always false; only saved unpaid-order UI/readiness and existing lookup boundaries are tested. Merchant sandbox/channel/QR, actual provider execution, durable charge idempotency and coordinated currency migration remain unimplemented. Earlier exclusions below are historical for this new explicit request.

## Frontend integration scope and API gaps — 2026-10-20

The current request authorizes connecting existing backend operations to gamenix365-next. It supersedes the earlier frontend exclusion. Preserve unpaid orders; removed payment operations must not be restored.

Implemented and validated: see the newest COMPLETED_TASKS entry. Existing recovery/profile/approval, inbox/socket, ratings/moderation, article/comment and historical participant operations are connected. The remaining items below are API gaps, not unconnected working endpoints. Real SMTP delivery and live database/end-to-end verification remain unexecuted.

The source audit found no SHOP order inbox/detail API, ADMIN order management/statistics API, private messaging API, customer-support inquiry/FAQ/notice APIs, email-verification operations, or review-image upload target. Review moderation supports a known review ID but has no ADMIN query for hidden/deleted reviews. These need separate backend scope before implementing complete frontend workflows. Public chat, existing order history/status actions, rating text/stars, contextual moderation and existing event/member/product/article management can use the current contract. No new backend system is authorized here.

## Current state after Petora simplification — 2026-10-20

Use the latest COMPLETED_TASKS entry. The historical implementation plans below no longer authorize restoring removed architecture. Petora lacks standalone email verification, status-email delivery and payment reconciliation; do not invent replacements. SMTP uses SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and MAIL_FROM directly, with no capture transport or durable retries. Password recovery retains its three existing GraphQL operations and accepts the matching optional account email without requiring the now-absent verifier.

Payment remains a read-only nonproduction TEST/USD service; no checkout, charge, refund, payment ledger, duplicate-charge guarantee or payment/order success coupling is implemented. Actual provider/account compatibility and real SMTP/provider delivery were not exercised. Preserve the user's existing order stock/points/status behavior, including its separate-write limitations.

Removed GraphQL operations: requestEmailVerification, verifyEmail, getPaymentStatus, getTestCheckoutAvailability and createTestCheckoutSession. Frontend source is untouched; clients still calling these removed operations need a separately scoped compatibility update. No live data/index cleanup or migration ran; preexisting retired collections/documents/indexes are left in place.

## Petora password recovery copied; existing features retained — 2026-10-17

Forgot/reset password is now implemented in the existing Member resolver/service and MailService using authTokens. Do not recreate it. See the newest COMPLETED_TASKS entry for the three GraphQL operations, limits, verified-email requirement and executed tests. Frontend integration and real SMTP mailbox delivery were not performed. Existing JWT/session behavior remains unchanged. No notification/payment/order/event/community rewrite was made; payment checkout and payment-confirmation emails still require the actual compatible sandbox account/channel/profile and trusted provider verification. Earlier notes describing password recovery as unimplemented are historical.

## Actual provider verification required after generic workflow — 2026-10-17

The latest conditional approval selects PortOne V2 hosted checkout + PayPal sandbox + USD + one central test merchant. Generic backend and guarded frontend workflow are implemented, but the actual account/channel/TEST profile was unavailable. Default checkout remains disabled; flags alone cannot activate it. Do not repeat the settled USD/merchant/inventory decisions, install an SDK blindly, substitute another provider or begin Phase 7.

1. Verify actual merchant/store/PayPal TEST channel/PG merchant/profile identity and USD cross-border buyer-country compatibility. Configure secrets privately after verification.
2. Complete the existing concrete PortoneService after account/profile verification. Petora’s TEST/USD REST lookup is adapted; hosted sessions and real signature validation remain gated. Retain exact USD units, TEST identity, fixed trusted frontend return URL, signature/replay validation and provider retrieval; do not add another provider abstraction or SDK without approval. Prove permanent nonchargeability before releasing a closed failed/cancelled/expired attempt. Review index deployment; missing required unique indexes intentionally block creation.
3. Execute genuine sandbox transactions and signed webhook delivery, delayed/lost events, timeouts and database/order reconciliation tests. Synthetic fake-provider/Mongo tests do not satisfy provider verification.
4. Only after persisted actual verified capture is proven should Phase 7 add receipts/emails/notifications/refunds using private verification evidence, separate refund rules and durable deduplication. No automatic fulfillment, stock/points/refund effects.

Existing order creation and PROCESS effects remain nontransactional and non-idempotent; no inventory reservation or repair ledger exists. Reporting may fail during a database outage and requires manual audit. See SANDBOX_PAYMENTS for implemented operations and exact limitations. Historical Phase 6 foundation-only notes below are superseded by this increment.

## Phase 6 foundation complete; checkout blocked — 2026-10-17

See the pre-checkout [PAYMENT_READINESS.md](PAYMENT_READINESS.md) and implemented [SANDBOX_PAYMENTS.md](SANDBOX_PAYMENTS.md). South Korea, unchanged inventory timing, separate payment records and manual sandbox reconciliation are approved. The user confirmed no test account exists; their latest currency instruction, “or just keep $ as it is”, preserves USD prices/shipping/emails and supersedes the earlier KRW pricing proposal. No FX, repricing or order business-rule changes were made. Do not repeat those decisions or choose a provider from the Petora reference automatically.

Payment/PaymentEvent models, private DTOs/enums, unique identity indexes and authenticated owner-only getPaymentStatus are implemented. There is no payment writer or provider integration. Before implementing checkout/SDK/webhooks, confirm a compatible USD sandbox provider/PG for the South Korean merchant, its actual test channel and platform-versus-shop merchant arrangement. No live credentials or real payments. Preserve no reservation at PAUSE, existing PROCESS stock/points timing and separate order writes; payment success must never invoke PROCESS. Production remains blocked by existing partial-order/stock-write consistency, missing cancellation/refund/reconciliation processing and the unimplemented provider security/test suite.

## Order email backend complete — 2026-10-17

Confirmation and successful PROCESS/FINISHED status events now queue persistent email for the authenticated buyer's verified address. Optional/unverified email skips safely. The existing batch app delivers and retries using Phase 2 MailService. See [ORDER_EMAILS.md](ORDER_EMAILS.md) for templates, record/state/lease policy and failure limits; no frontend contract changes are needed.

Deployment follow-up: build and run gamenix-batch with the same intended MongoDB and SMTP configuration as the API. The production batch script now explicitly selects production mode. Confirm unique eventKey and due-work/lease indexes in deployment; monitor pending/failed delivery rows privately. Real SMTP mailbox delivery was not exercised. Saved retry schedules survive restarts; failed queue insertion has no automatic recovery scan, and uncertain SMTP acknowledgements can duplicate delivery.

Validation: 282 offline tests plus eight isolated real-MongoDB order-mail tests pass, with 22 older Mongo cases not enabled. API/batch TypeScript and both builds pass. No real SMTP, application-data migration, payment integration, marketplace-policy or frontend work occurred.

## Persistent notifications backend complete — 2026-10-17

Use the authenticated GraphQL contract for the existing frontend bell:

- `getUnreadNotificationsCount` supplies the badge number.
- `getNotifications(input: { page, limit, search })` returns `list` and `metaCounter`; send `search.notificationStatus: WAIT` for unread-only or omit it for all notifications. Optional group and createdAt bounds are supported.
- Call `updateNotification(input: { notificationId, notificationStatus: READ })` when one item is opened, or `markAllNotificationsRead` for the bulk action. Send the access token in the Authorization header. There is no create operation; the backend supplies recipient and event content.

Initial backend triggers are implemented for shop approval/rejection, order created/status changed, event approved/rejected and successful email verification. Payment notices await a payment system. Persistent queries are ready for frontend integration, which has not been done here. Both TypeScript checks, API build and 234 tests pass; 22 existing Mongo cases are skipped without their explicit URIs.

The socket gateway must not carry private notifications in its current form: guests connect without authentication, chat/presence/history are broadcast to every socket, and token query values are logged. Keep notifications persistent-only until a separately reviewed socket privacy change.

## Email verification backend complete — 2026-10-16

SMTP/capture and requestEmailVerification/verifyEmail are implemented and tested; do not repeat the earlier planned verification work below. See [EMAIL_VERIFICATION.md](EMAIL_VERIFICATION.md). Backend requires Node 20+ and transaction-capable MongoDB. Real SMTP delivery still needs operator-configured credentials/sender and FRONTEND_ORIGIN; none were added to .env or exercised against a real mailbox. Development capture is the non-production default.

Separately scoped frontend follow-up: owner email editing/status/resend controls and /account/verify-email, reading/clearing the token fragment and calling verifyEmail once. Keep memberNick login, private owner-only email and SHOP approval unchanged. Validate real sender delivery only after explicit authorization. Account budgets are MongoDB-backed; multi-instance deployment needs shared edge/IP limits and an intentional proxy-trust configuration. Password recovery, notifications, OAuth and payments remain unimplemented separate phases. Current backend validation: 242 passing tests (18 real MongoDB cases), four legacy Mongo tests skipped, both TypeScript checks and API build pass.

## Member email verification follow-up — 2026-10-13

The member email foundation is complete. Email remains optional, private and unverified by default; authenticated owners can select memberEmail/memberEmailVerified through their existing getMember query. Explicit email submissions (including an unchanged value or null removal) reset verification; omitting email preserves it. No verification/sending integration is authorized by this completion.

Separately scoped follow-up:

- Set MEMBER_TEST_MONGO_URI to a dedicated MongoDB test server and run member-email.integration.spec.ts. It creates/drops only a fresh gamenix_member_email_test_* database and never reads the app database URI. Four cases cover real partial-index behavior for missing/null values, concurrent normalized-email uniqueness, duplicate updates, verification resets/preservation and legacy accounts. These tests were skipped in this task; deployed MongoDB enforcement is not yet verified.
- Confirm the partial unique index is installed successfully before rollout. If any existing documents already contain email strings, review their normalization, validity and duplicates before index creation. Do not run syncIndexes, drop indexes or mutate existing records automatically. No live migration was performed.
- After a new request, choose a mail provider and store credentials in environment/secret configuration. Design cryptographically random, hashed-at-rest, expiring, single-use verification tokens, resend/rate limits and enumeration-safe responses. Bind tokens to member identity and the exact normalized email; atomically set memberEmailVerified=true only when that address is still current, and consume the token. Email changes/removal must invalidate prior verification attempts. Never expose or log tokens. No fake verification or token endpoint was added here.
- Later order/receipt notifications should use the intended current verified recipient and appropriate order summaries, transaction references, payment status and receipts. Do not send card numbers, CVVs or payment credentials. Payment processing and frontend work remain separate tasks.

Validation for this increment: API/batch TypeScript checks and API build PASS; all 95 offline tests PASS across 4 suites, including real Nest GraphQL field privacy/validation execution. Four MongoDB tests are skipped without the explicit test URI. Earlier unrelated event/order/catalog follow-ups below remain unchanged.

## Current Events state and follow-up — 2026-10-10

Events are implemented, replacing historical scaffold-only descriptions below. SHOP management, USER pending applications/cancellation/history, owner/ADMIN review, ADMIN moderation, queries and soft deletion are complete in source. ParticipantStatus is PENDING / REGISTERED / REJECTED / CANCELLED. See COMPLETED_TASKS for exact files/checks, FRONTEND_MIGRATION for the contract and DECISIONS for lifecycle/capacity rules.

Both app TypeScript checks/builds pass; 88 offline tests pass, including 55 event cases. Five live MongoDB tests are skipped. Full API schema generation and EventModule DI pass offline. Remaining verification/integration, separately scoped:

- Set EVENT_TEST_MONGO_URI for an isolated transaction-capable test server and run the event integration suite. It creates/drops a fresh gamenix_event_test_* database only. Verify concurrent last-place approvals, capacity decreases, duplicates, rollback and history queries. Mocks are not deployment proof. Preserve Events transactions and OrderService's separate writes.
- Confirm the unique eventId/memberId index exists in deployment; review legacy duplicates before index installation. Existing REGISTERED records remain approved; no records were changed by this task. New applications default PENDING.
- Integrate event images with the existing uploader: provide uploads/event, restrict target to approved directories and confirm the Axios GraphQL-multipart request/returned-path contract. No REST image endpoint exists in this repository. Upload code was not changed.
- Frontend work has not started. Send complete DateTime timestamps; applications/reviews close at eventStart. Use the documented approval states and includeDeleted history options.
- No brackets, automated winners/prizes, payment, new modules, authentication fixes or catalog/order changes were authorized by this completion. Stop after Events; older prompts do not authorize further work.

## Latest state — simple Express-style order writes, 2026-10-10

The user explicitly approved removing transactions. OrderService now has only createOrder, recordOrderItem, getMyOrders and updateOrder. Validation belongs to existing DTOs/GraphQL/schemas; active member/shop, one-shop ownership, database prices, conditional stock and forward-status checks remain. Item writes use map/Promise.all/create, and points reuse the original MemberService statistics method. Shipping/pickup rules are unchanged. Repeated product lines are allowed.

Both backend TypeScript checks, API build and all 30 tests pass. GraphQL contract checks are offline. No live DB, real competing checkout or HTTP/e2e testing was run.

Operational follow-up, separately scoped:

- Account for the user-approved separate-write behavior: an item failure can leave an incomplete order; a stock/point failure can leave PROCESS and earlier stock writes committed. Same-status retries do not repair these states. No rollback or recovery workflow exists; review/reconcile failures before treating PROCESS as a completed purchase.
- Conditional status claiming prevents duplicate transition effects; test this and stock contention against an isolated database if deployment verification is requested.
- Existing address-string records still need the separately reviewed delivery-price/address/fulfillment data migration. Frontend pickup/delivery UI, payment verification, cancellation/restocking and create-request idempotency remain separate work.

Earlier transaction/atomicity claims below describe superseded implementations and must not be treated as current guarantees.

## Latest state — delivery price/address and pickup complete, 2026-10-10

OrderDeliveryType now supports PICKUP / DELIVERY, default DELIVERY. orderDelivery is a numeric USD fee; orderAddress is separate and required only for delivery. Pickup shipping is free. Delivered CHAIR/DESK orders cost 15 once per order; other delivery costs 5 below subtotal 100 and is free at or above 100. orderTotal includes shipping. The same service methods, transactions, ownership rules, stock updates and MemberService points behavior are preserved.

Both app TypeScript checks/builds and all 24 currently present tests pass. GraphQL schema/input/output validation is covered offline. No live MongoDB, concurrent checkout or HTTP/e2e test was run.

Follow-up work:

- Update frontend creation inputs to orderDeliveryType and orderAddress; offer pickup/delivery in the UI. Display orderDelivery as the fee and orderTotal as the inclusive total. Clients cannot submit either price. No frontend source was changed here.
- Review and migrate old order records before reading them through the new contract. Move old address strings from orderDelivery to orderAddress, establish the correct numeric fee and populate fulfillment type. Do not guess historical charges or execute a live migration automatically.
- Verify transaction-capable topology, checkout rollback and concurrency against an isolated database. Payment confirmation, create-request idempotency, cancellation/restocking and shop/admin fulfillment remain separate work.
- Event behavior and wider catalog approval enforcement remain outside this task. Preserve guards and existing architecture.

Earlier order-address-only and product-only-total records below are historical and superseded by this section.

## Latest state — order flow implemented, 2026-10-09

The new user request authorized adapting Perfumia's order flow. createOrder, getMyOrders and updateOrder now exist using NestJS GraphQL and existing schemas. User-selected pricing preserves string delivery addresses and product-only totals. OrderItem is registered; orders enforce one shop, server prices, active buyer/shop, ownership and PAUSE → PROCESS → FINISHED. Transactional PROCESS updates deduct stock and award one point; same-status retries do not repeat effects. Events remain scaffolds. Earlier order-scaffold-only records below are historical.

Both app TypeScript checks, API/batch builds and all 32 tests pass. Offline schema/module wiring is validated. No live DB, transaction rollback/concurrency or HTTP/e2e verification was performed.

Follow-up work needs separately scoped authorization:

- Verify transaction-capable MongoDB topology and test multi-item rollback, concurrent PROCESS and competing-stock behavior against an isolated database before deployment. No database configuration was modified.
- Integrate the frontend using the new inputs documented in COMPLETED_TASKS. Input prices/totals/owner IDs are not accepted. PAUSE is not a stock reservation; processing may fail on availability.
- Decide payment confirmation/fulfillment permissions before treating PROCESS as paid. There is currently no payment provider or webhook; the buyer requests the status transition, matching the reference ownership flow.
- Decide create-request idempotency, cancellation/restocking and shop/admin order management. Existing FINISHED enum is retained; Perfumia's DELETE state and pricing promotions were not imported.
- Event/participant services, wider catalog shop-approval enforcement, uploads and private chat remain outside this task. Preserve guard files and existing architecture.

## Latest scaffold status — 2026-10-09

EventModule and OrderModule, each with a resolver and service, are created under components and imported by ComponentsModule. Existing Event/Order schemas are registered. Both app TypeScript checks, API build, all 5 currently present tests and an offline DI smoke check pass.

These are scaffolds without GraphQL operations or business logic. Stop at the requested generation task. Future event/order behavior needs its own approved requirements; do not infer checkout, stock deduction, registration, OrderItem/EventParticipant provider wiring or ownership rules from empty services. Existing guard-preservation constraints and unresolved shop-approval enforcement remain unchanged.

## Latest state — guard changes removed, 2026-10-09

The user prohibited guard-file changes. RolesGuard and its supporting AuthModule changes have been reverted. SHOP/PENDING signup, public ADMIN rejection and self-update privilege-write rejection remain; existing ADMIN operations still update member status.

Pending task: choose an explicitly approved way to enforce active-SHOP permissions while leaving guards unchanged. No replacement was implemented. Original role-only guards permit PENDING SHOP tokens, so approval enforcement must not be marked complete. Current-database blocking/approval effects are also absent.

Both TypeScript checks, API/batch builds and all 38 tests pass. Guard tests document the original behavior and its limitation. Upload endpoint discovery remains pending. Earlier next steps and completion claims below are historical where they conflict with this correction.

## Earlier records — latest correction takes precedence

## Current next steps — minimal SHOP approval complete

The approved minimal implementation is complete: SHOP signup starts PENDING; existing ADMIN list/status-update operations support approval; RolesGuard checks current role and ACTIVE SHOP/ADMIN status; self-updates cannot alter role/status. USER signup/login, JWT/password helpers, DTOs/resolvers and upload implementation remain unchanged. Both app TypeScript checks/builds and all 44 tests pass.

Stop implementation until a new task is approved. Remaining follow-up:

- Locate the actual Axios-compatible HTTP upload endpoint. This checkout has GraphQL upload mutations and static file serving, but no HTTP POST upload handler. Do not implement a replacement automatically or mark HTTP upload validation complete.
- Confirm how a pending applicant's uploaded image path is saved: existing updateMember requires ACTIVE, and the missing HTTP endpoint may have a separate persistence path. No pending-profile/image feature was added.
- Review actual client documents and live MongoDB/index deployment before rollout. No new data migration or deployment was run. Existing SHOP accounts were not reclassified; only new signups start PENDING.
- Orders/payments/inventory, event services/registration, frontend and private chat remain separately approved future work. Do not resume the broader superseded authentication/upload proposal.

Exact file inventory, validation and limitations are in COMPLETED_TASKS. Earlier next-step records below describe prior phases and do not override this scope.

## Earlier phase records

## Current next steps — after ER Phase 1 work

1. Phase 1 ER definitions are complete: EventParticipant now has REGISTERED / CANCELLED, Event/Member refs, object/input/update DTOs and the unique `(eventId, memberId)` index. Both TypeScript checks, both builds and all 20 tests pass. No further implementation is authorized in this phase.
2. Review existing-data and frontend compatibility before deployment: AGENT → SHOP, Property → Product fields/collections/GraphQL contracts, member counters and PRODUCT group/reference values. Do not execute a live migration automatically.
3. Stop after Phase 1. Obtain explicit approval before order, checkout, inventory, payment, event/registration services or frontend changes.
4. In a later approved phase, wire Order/OrderItem/Event/Participant models and operations using existing Nest patterns. Enforce authenticated ownership, SHOP organizers and single-shop orders; calculate totals server-side and choose atomic inventory/idempotency/cancellation rules. Existing DTOs are data definitions, not trusted checkout commands.
5. Later address known auth/self-update role risks, guard null handling, counter atomicity and private socket authorization separately. They were deliberately preserved in this phase.

The product catalog rename, member roles/counters, housing-filter removal and dependent community/batch references are implemented; do not repeat the historical rename tasks below. Keep `getAgents`, `AgentsInquiry`, `availableAgentSorts` and agent-named shop ranking methods unless a later task explicitly approves their rename. Schema placement is settled for this phase: `src/schemas`.

See [COMPLETED_TASKS.md](COMPLETED_TASKS.md) for exact validation and file inventory. No Phase 2 work has started.

## Historical snapshot — retained for migration history

The following records describe earlier repository states and proposals. Current status and accepted decisions above take precedence. Earlier validation records remain historical.

Snapshot: 2026-10-09 (Asia/Seoul). Remaining implementation tasks below are PLANNED; the project naming/configuration rename is COMPLETED. See [COMPLETED_TASKS.md](COMPLETED_TASKS.md) for current validation limits.

## Priority and dependency order

1. P0: resolve contracts/compatibility and privileged member-field handling; locate frontend.
2. P1: coordinate app/role/catalog migration across API, batch, schemas and community references.
3. P1: validate the reusable product/shop foundation; migrate frontend catalog/shop UI against the actual contract.
4. P2: implement atomic inventory/orders, then checkout/order UI.
5. P2: implement events/participants, then event UI.
6. P2: authorize private customer/shop conversations, then chat UI.

Reuse existing auth/member/catalog/community/layout patterns. Avoid unrelated rewrites to keep the short timeline achievable.

## Backend cleanup

| Priority | Task | Completion evidence |
|---|---|---|
| P0 | Decide existing-data/client compatibility, schema placement, shop enrollment, product fields/statuses, and exact owner/collection names | Accepted decisions recorded before dependent code/data changes |
| P0 | Restrict signup/self-update role/status writes; review token role freshness and RolesGuard null handling | Focused privilege-escalation and invalid-token tests |
| COMPLETED | Project naming/configuration rename to Gamenix; preserve internal structure and logic | See COMPLETED_TASKS for validation results |
| P1 | Replace property module/classes/DTOs/enums/schema with products; use all ten categories | Consistent GraphQL inputs/outputs, model, validation and service fields |
| P1 | Replace agent role/inquiries/search/counters with SHOP equivalents; preserve USER/ADMIN behavior | Shop-only creation and owner-restricted updates, admin tests |
| P1 | Replace housing filters and sort/options allowlists; review unique index for multiple shops | Category/text/price/shop filtering works; similar products can belong to different shops |
| P1 | Remove catalog-specific legacy names from likes/views/comments/groups/joins, notification refs and batch rankings | Source audit plus community regression checks |
| P1 | Verify status timestamp persistence and counters during transitions | Focused transition tests; no counter drift |
| P2 | Implement productLeftCount and order/orderItems with one shop per order | Quantity/owner/availability/price validation; race-safe stock and consistent multi-item writes |
| P2 | Define idempotency, payment/shipping/status, cancellation/restock and atomicity strategy | Approved lifecycle contract and failure-path tests |
| P2 | Implement owned tournament/giveaway events and participants | Registration eligibility, unique member/event constraint, duplicate-race tests |
| P2 | Review socket auth; remove token logging; define authorized conversations and history | Participant-only routing, guest policy, payload/reconnect tests |

Do not remove ordinary identifier words such as JavaScript “property” blindly; audit domain references and preserve valid language/API usage. Do not execute database migrations without a reviewed plan for real data.

## Frontend migration

| Priority | Task | Dependency |
|---|---|---|
| P0 | Locate Next.js repo; inventory actual pages/components/client/types/style/auth | Frontend currently unavailable in this checkout |
| P1 | Update branding/navigation and reuse shared layout/components | Frontend baseline established |
| P1 | Migrate property cards/list/detail/filter UI into product components and GraphQL documents/types | Approved and implemented product contract |
| P1 | Migrate agent pages to shop profiles and owned product management | SHOP permissions and shop queries |
| P1 | Preserve articles/comments/likes/views/follows and account flows | Community contract compatibility |
| P2 | Add single-shop cart, checkout and order history/detail | Atomic order and stock APIs plus lifecycle decisions |
| P2 | Add event list/detail/management/registration | Event and participant APIs |
| P2 | Integrate private customer/shop chat | Authorized backend conversation protocol |

Full phases and conceptual mappings: [FRONTEND_MIGRATION.md](FRONTEND_MIGRATION.md). Replace mappings with real paths after frontend inspection.

## Testing

1. Establish baseline on the actual current app paths before future code edits, using installed tooling only. Avoid treating missing target paths as source compilation failures.
2. For the renamed apps, run the mandated checks:

   ```bash
   npx tsc -p apps/gamenix-api/tsconfig.app.json --noEmit
   npx tsc -p apps/gamenix-batch/tsconfig.app.json --noEmit
   npm run build
   ```

   App paths now use `gamenix-api` and `gamenix-batch`. Record which paths were tested. `npm run build` currently builds the default API project; explicitly build batch as well when batch code changes.

3. Add focused GraphQL input/output/filter and query/mutation tests as contracts change.
4. Test USER/SHOP/ADMIN role restrictions, self-service privileged fields, owner spoofing and cross-shop updates.
5. Test invalid quantities, mixed-shop orders, unavailable products, insufficient stock, concurrent checkout, retries, partial failure and the agreed cancellation/restock behavior.
6. Test event ownership, duplicate/concurrent registration, eligibility and the agreed capacity/deadline/cancellation rules.
7. Test WebSocket valid/invalid auth, guest policy, unauthorized conversation access, routing, malformed messages and reconnect/history behavior.
8. Run community regression checks and actual frontend checks once available. Update stale greeting-only e2e assertions when appropriate; record exact results.

No tests were run in the documentation session. `npm run lint` rewrites files with `--fix`; choose a non-mutating lint invocation when rewriting is outside the task scope.

## Documentation

- Keep all six handoff files synchronized after each major implementation increment.
- Record exact files changed and validation commands/results in COMPLETED_TASKS; distinguish inherited source from session work.
- Update DECISIONS when pending questions are resolved; do not silently turn proposals into accepted decisions.
- Record unresolved blockers: unavailable frontend, unknown live data/client deployment, transaction topology, payment/shipping rules, event lifecycle and chat policy.
- Revise backend/frontend operation mappings to the actual implemented names and retire superseded proposals.
