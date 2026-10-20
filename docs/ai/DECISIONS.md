# Architectural decisions

## Latest instruction: copy Petora and remove extra infrastructure — 2026-10-20

Use the actual local Petora source and existing Gamenix style. This supersedes earlier decisions retaining generic payment workflows, payment/paymentEvent persistence, custom verification/authTokens, queued order-email delivery and notification wrappers/deduplication. Keep only required copied dependencies; no new framework, worker, dependency, frontend change, database cleanup or live payment.

Preserve USER/SHOP/ADMIN, memberNick/JWT, shopName/approval and existing catalog/order/event/community business rules. Keep copied payment lookup TEST-only and disconnected from orders: Petora lacks safe durable duplicate/replay handling, so it does not supply a working checkout. Copy its PasswordReset model in place of the removed shared token system; retain hashed secrets, expiry, atomic token/guess claims and current email/password binding as small safety adaptations. Keep existing inbox APIs/WAIT/READ/private sockets; repeated notifications can now be stored as in Petora.

- 2026-10-17 copy/adapt request: reuse Petora's PRODUCT/SHOP review module and recipient-only notification delivery; retain existing reusable MailService and marketplace/auth rules. Replace the payment provider token/default and extra core module with concrete PortoneService/shared PaymentModule, preserving all used verification, snapshot and recovery code. REST lookup is pinned TEST/USD; account/profile and hosted-session/signature integration remain unverified and checkout stays disabled. No SDK, live payment, automatic cancellation/refund, new payment collection or duplicate module.

## Copy-and-adapt scope; password recovery — 2026-10-17

Follow the user's simplify request: copy only missing Petora functionality into existing resolver/service/model files and retain working Gamenix features. Password recovery uses Petora's three operations with memberNick, Gamenix password limits and verified optional email, reusing authTokens/MailService/transactions. No new service, worker, module, collection or dependency. Pending SHOP recovery preserves approval state. Account/code limits, atomic consumption and email/password snapshot binding close the copied flow's direct security gaps. Preserve existing JWT/session policy; global session invalidation or OAuth/account linking needs separate approval. Existing payments stay disabled pending an actual compatible sandbox; do not add another provider layer or fabricate payment confirmation mail.

## Conditional sandbox integration; provider-independent fallback — 2026-10-17

- The new request conditionally approves PortOne V2 hosted checkout, PayPal sandbox, USD and one central Gamenix test merchant. Preserve each order's SHOP and all stock/points/fulfillment rules. Actual account/channel/TEST profile/USD cross-border compatibility is a prerequisite to a real adapter. No compatible account/configuration was available, so execute the explicitly authorized provider-independent fallback. No SDK, alternate provider or runtime simulator; default checkout/webhook/worker execution fails closed even if a flag is set.
- Extend existing payments/paymentEvents/status/query. Persist exact server-owned USD snapshots, immutable identity/binding, one active attempt per order and idempotent key reuse; verify required indexes before creation. No browser price/status/provider inputs. Timeout keeps the claim uncertain; recovery never recreates sessions or cancels automatically.
- Capture requires strict server retrieval checks and persisted matching evidence. Expose verifiedSuccess while retaining current status names; old SUCCEEDED/date fixtures alone are not proof. Keep original capture on stale/conflicting later results. Signed-event metadata queues retrieval, not fulfillment.
- Reuse batch with bounded retries/expiring CAS leases. Reporting-only PROCESS-failure hook preserves all order effects/exceptions and marks payments REQUIRED where storage is available. No automatic compensation, receipts, notifications, emails or refunds in Phase 6. See SANDBOX_PAYMENTS for recovery gaps and the remaining account/adapter/end-to-end gate. Historical foundation-only entries below describe the earlier commit.

## Sandbox payment foundation and remaining gate — 2026-10-17

- The user approved South Korea, unchanged inventory timing, separate payment records and manual sandbox reconciliation. Their later “or just keep $ as it is” retains USD catalog/shipping/email amounts; no native KRW migration or FX policy is authorized now. A future provider must support USD for the actual South Korean merchant/payment method. No test account exists, so provider/PG/channel/merchant compatibility is still unresolved.
- Implement independent records and an authenticated local status query under that approval. Stop before checkout, provider SDK installation/calls and webhook handling until compatibility and the actual zero-real-money test channel/merchant arrangement are confirmed. Do not select PortOne merely from the reference.
- Separate PaymentStatus from OrderStatus and reconciliation status from payment outcome. Store explicit currency/integer minor units, immutable ownership/source snapshots, provider/environment/merchant metadata, request fingerprints/keys, timestamps and sanitized failure/reconciliation details. Only SANDBOX is representable. Preserve current USD source amounts in cents; a USD payment must match its source total. KRW is a representable currency, not an enabled conversion flow.
- Keep provider/event ledgers private, use partial unique provider-payment identity plus unique member/idempotency and provider-event identities, and expose only an owner-filtered public status projection. No create/update mutation. Indexes alone do not supply verification, lifecycle or exactly-once handling.
- No payment event changes orders, stock or points. Keep current order writes, single-shop rules, database prices and processing transitions. Do not silently compensate partial stock writes, auto-refund, convert timeouts into a trusted failure or copy Petora's catch-all cancellation. Actual provider verification, cancellation and reconciliation logic remain gated work. See PAYMENT_READINESS and SANDBOX_PAYMENTS.

## Durable order email delivery — 2026-10-17

- Reuse Phase 2 MailService, its SMTP/capture policy and escaped templates. Confirmation and status mail use the storefront's `$0.00` USD format. PAUSE/PROCESS/FINISHED are processing states; no template claims payment, shipment or delivery and no payment/card fields are persisted.
- Queue only from successful existing order paths: after all creation items, after PROCESS stock/points work, or after FINISHED. Preserve all marketplace rules and separate-write transaction policy. Same-status retries do not backfill partial failed operations.
- Use the authenticated buyer's current verified private database email. Missing/unverified email skips queueing without failing checkout. Save recipient and email version; recheck both plus verified/current account eligibility before each attempt. Suppress changed/unverified recipients rather than redirecting old events.
- Use private `emailDeliveries` records with unique server event keys, template/status, state, attempts, due date, lease/token and saved explicit order snapshots. Read order/item prices, shipping and totals from MongoDB; freeze product names on first attempt. No GraphQL mail creation/inspection operation is added.
- Send only from the existing batch app, every 30 seconds, at most 20 claims/poll. Use atomic five-minute leases and at most five attempts, with 1/5/15/60-minute delays. Exhausted work becomes FAILED; invalidated recipients become SKIPPED. Production batch startup explicitly sets NODE_ENV=production so it cannot default to development capture.
- Preserve checkout success when email enqueue/delivery fails. Existing separate order/queue writes cannot guarantee atomic enqueue; no automatic repair scan is authorized because partial marketplace writes exist. SMTP plus database acknowledgement also cannot guarantee exactly-once delivery; reuse a deterministic Message-ID and document recovery duplicate risk.

## Persistent member notifications — 2026-10-17

- Reuse the existing `notifications` collection and preserve `NotificationStatus.WAIT` / `READ` and prior LIKE/COMMENT types/groups. Add ORDER, SHOP, EVENT and ACCOUNT notification groups/types for the initial marketplace/account triggers.
- Only trusted business services create notifications. There is no GraphQL create operation and no client-supplied recipient, author, reference or dedupe key. Resolve recipient only from the triggering business record; system-generated notices may omit authorId.
- Scope inbox reads/counts/updates to the authenticated recipient. Inbox supports page/limit (maximum 100), status/group/date filters and allowlisted createdAt/updatedAt sort. `updateNotification` changes status only; `markAllNotificationsRead` only changes the caller's WAIT rows.
- Generate unique keys server-side from notification type, reference, recipient and (for order transitions) target status. Duplicate writes are ignored. Notification persistence is best-effort and must not reverse successful business operations.
- Initial triggers: pending SHOP → ACTIVE/BLOCK; pending Event → PROCESS/PAUSED (approval/rejection); completed order/item creation; successful order status transition; successful email verification. Orders/events point to their existing documents. Payment notices wait for a payment system.
- 2026-10-17 Petora module adaptation supersedes the earlier private-socket hold after privacy review: persist notifications first, then send only to matching authenticated open recipient sockets with unexpired JWT claims. Remove token logging and limit public chat/presence/history member data to _id/memberNick/memberImage/memberType. Guests remain public-chat participants only; inbox queries recover missed private events. Keep existing JWT policy and deployment-level query-token/log precautions.

## Member email and verification preparation — 2026-10-13

- Add optional memberEmail using the existing Member collection/schema/DTOs; normalize with trim/lowercase and validate email format. Null explicitly clears email; undefined/omitted leaves it alone. Keep existing signup and nickname/password login compatible, including email-less USER/SHOP/ADMIN documents.
- Use a unique partial index on memberEmail with partialFilterExpression {memberEmail: {$type: 'string'}}. Missing/null values are excluded; existing nickname/phone indexes remain. Map email duplicate-key errors to a safe member-email-specific error. Do not migrate, delete or fabricate member data.
- Default memberEmailVerified to false. Never expose it in MemberInput or MemberUpdate; reject direct service attempts too, including the existing generic admin update. Every explicit email submission resets verification to false in the same write, even if the normalized address is unchanged. Other profile/status updates preserve verification. Only separately implemented trusted verification logic may mark it true.
- Hide both fields by default in Mongoose and protect their nullable GraphQL fields with an authenticated-owner identity check for every Member result, including nested members. Owner reads use current database values, never JWT verification status. Shop/admin list aggregates exclude the fields. Omit both from JWTs because tokens are decoded and reused in existing public socket member payloads. Existing guards and role/status behavior remain unchanged.
- No provider or verification implementation exists in the inspected backend. This task authorizes only data, validation, privacy and supporting logic/tests. SMTP/Gmail/SendGrid/Resend, token endpoints, sending, password reset, order/payment emails, payment processing and frontend modifications require a later request. Future payment mail may contain summaries, transaction references, status and receipts, never card numbers/CVVs/payment credentials.

## Product grouping and additional product types — 2026-10-11

The user approved frontend-only groups in this order: PC (KEYBOARD, MONITOR, MOUSE, HEADPHONES, ACCESSORY), Mobile (GAMING_PHONE), Console (PLAYSTATION, CONTROLLER), PC Components (CPU, GPU, RAM), Furniture (CHAIR, DESK). Add CPU / RAM / PLAYSTATION to backend and frontend ProductType without renaming existing values. This supersedes the earlier ten-category restriction. Groups are mappings to existing search.typeList, not stored fields or new GraphQL enums. New catalog visits default to PC; existing mixed-type links retain their results in All products. Keep the compact sort control, search/price/shop filters and history behavior. No database migration is required. Deploy backend support first.

## Approved Events lifecycle and consistency — 2026-10-10

- Keep participant operations in the existing Event module/service/resolver, and schemas in src/schemas. Register existing Member/EventParticipant models and AuthModule. Do not edit guards/JWT, orders, catalog or community.
- Assign organizer/applicant identity from authentication. Require current ACTIVE SHOP for ownership management, ACTIVE USER for applications/history, ACTIVE ADMIN for cross-shop moderation. EventService queries current database role/status locally.
- Preserve PAUSED / PROCESS / FINISHED. Default creation PAUSED; permit explicit PROCESS, reject FINISHED creation. Owners activate/pause via updateEvent and finish via finishEvent; ADMIN may finish via updateEventByAdmin. Finished events are read-only except soft removal. Add only nullable deletedAt and preserve participant history.
- User-confirmed dates: eventDate is the scheduled date; eventStart/eventEnd are actual start/end timestamps. Keep DateTime types. Start < end; creation/activation/rescheduling requires a future start. Applications/reviews close at eventStart. PENDING/REGISTERED cancellation is allowed before start, including while PAUSED, but closes at start/finish/deletion.
- Add PENDING and REJECTED to ParticipantStatus; default new records PENDING. Review only PENDING as REGISTERED/REJECTED. CANCELLED may reapply as PENDING on the same document; REJECTED cannot reapply. Clients cannot choose applicant identity or initial status. Existing stored REGISTERED records remain unchanged; no data migration ran.
- Count only REGISTERED toward capacity; pending applications may still wait when confirmed places are full. Keep the unique event/member index and avoid a counter field. Increment existing event __v inside a transaction before counting/updating; coordinate registration, cancellation, review and event changes through this write. Lock-only writes preserve event updatedAt. Capacity reduction cannot go below confirmed participants.
- The user approved transactions specifically for Events. withTransaction retries write conflicts; replica set/sharded MongoDB is required, with no separate-write fallback. OrderService retains the earlier deliberate separate writes. Offline mocks do not prove database concurrency or rollback.
- Public lists/details omit deleted events. Owner/admin lists support includeDeleted; own registrations and authorized participant lists retain history. Lists use list/metaCounter, stable allowlisted sorting, nested filters and page sizes up to 100.
- Keep eventImage as an uploaded path. Existing uploader needs the separately scoped event directory/target/Axios integration. Do not add upload systems, brackets, automated winners or prize distribution.

## Refactoring style preference — 2026-10-10

The user explicitly requested that future refactoring follow their existing service coding style. Read nearby services first, especially ProductService, MemberService, BoardArticleService, CommentService and LikeService. Follow their four-space indentation, public/private async methods, input destructuring, search/match objects, target/result names, explicit model types where useful and readable Mongoose chains ending in exec(). Preserve existing business rules and error responses when making style changes. Use existing methods and dependency injection; avoid new helpers, layers or validation without a concrete need. The accepted separate-write order behavior remains unchanged.

## Latest user decision — simple separate order writes, 2026-10-10

The user explicitly answered: "Remove transactions too, matching Express’s separate writes". This supersedes prior requirements to preserve sessions and atomic multi-document writes.

- Retain only createOrder, recordOrderItem, getMyOrders and updateOrder, using existing NestJS injection and Perfumia's straightforward Mongoose flow.
- Remove duplicated input validation and safe-integer/finite-value checks from the service. Keep validation in existing DTOs, GraphQL inputs and schemas. Remove duplicate-product rejection; repeated lines contribute to totals and are saved separately.
- Keep current active member/shop, single-shop, database-price, ownership, stock availability and forward-status checks. Keep shipping fees, delivery address and pickup behavior.
- Use map/Promise.all/create for order items, and reuse the original MemberService.memberStatsEditor signature for points. Remove its no-longer-used session argument; do not alter other member logic or guards.
- Claim a status transition with a conditional findOneAndUpdate before deducting stock/awarding points, so repeat/concurrent requests cannot apply the transition twice. No new methods, fields, dependencies or layers are introduced.

Accepted consequence: writes are no longer atomic across documents. Failures can leave incomplete order items or a PROCESS order with partial stock/point effects. Same-state retries return the order and do not complete partial writes. There is no automatic rollback/recovery; future reconciliation requires separate authorization. No live database verification was performed.

## Accepted delivery semantics and options — 2026-10-10

The user corrected the earlier delivery-address interpretation and supplied these rules:

- orderDelivery stores the server-calculated numeric delivery fee in USD; orderAddress stores the delivery address separately.
- Add OrderDeliveryType PICKUP / DELIVERY, default DELIVERY. Require an address for DELIVERY; allow PICKUP without one. Keep the existing OrderStatus and ProductStatus values.
- PICKUP always has zero shipping. DELIVERY with any CHAIR or DESK costs 15 once per order, including mixed orders, regardless of subtotal. DESK represents the user's table category.
- Other DELIVERY orders cost 5 below product subtotal 100, and zero at or above 100. Include quantity in the subtotal. orderTotal equals subtotal plus shipping, rounded to two decimals; no discounts.
- Keep all current service methods, single-shop enforcement, ownership checks, transactions, stock deduction and MemberService points updates. Expose fulfillment choice/address in OrderInput; do not expose client-controlled fees or totals. OrderUpdate remains status-only.

These decisions supersede earlier string-orderDelivery and product-only-total decisions. Existing clients must send orderAddress for delivery. Existing data requires a separately reviewed migration; do not invent historical fees or run a live migration automatically. Payment verification, cancellation/restocking and frontend UI implementation remain separate work.

## Accepted order adaptation — 2026-10-09

Latest order request authorizes implementation based on Perfumia while retaining NestJS DI, code-first GraphQL, current schema locations and unchanged guards. Earlier order-scaffold-only restrictions are superseded for this request; event behavior remains deferred.

- User-selected pricing: preserve all ER schema fields; use orderDelivery as the delivery address and charge product totals only. Do not add Perfumia's 20% discount, numeric delivery fee or subtotal/discount fields.
- Creation accepts an address plus productId/itemQuantity lines. Prices, totals, buyer and shop are determined server-side. Retain collection `order`, collection `orderItems` and the single-shop rule.
- Preserve OrderStatus PAUSE / PROCESS / FINISHED. PAUSE stores a draft without reserving stock; PROCESS conditionally deducts stock and awards one point as in the reference; FINISHED closes it. Only the buyer updates their order. Same-state retries are harmless; backward and skipped transitions are rejected. Perfumia's FINISH/DELETE names are not introduced.
- Register existing models in OrderModule and use transactions for atomic order/item writes and status/inventory/reward writes. Require a supported MongoDB topology and propagate transaction failures. No database configuration is changed.
- Check current ACTIVE buyer and ACTIVE SHOP at the order-service boundary; preserve all guards, AuthModule and existing catalog behavior. These checks are specific to the newly authorized order flow and do not resolve the wider catalog approval gap.

Deferred: live transaction/concurrency verification, request idempotency for order creation, payment confirmation, cancellation/restocking and shop/admin fulfillment operations. PROCESS currently represents a customer-requested transition; there is no payment integration.

## Latest constraint — preserve all production guards, 2026-10-09

The user's latest instruction supersedes the previously approved RolesGuard adjustment. Restore RolesGuard unchanged and remove its now-unused Member-model registration/export from AuthModule. Preserve the service signup/self-update changes and existing PENDING enum addition. Do not replace the removed authorization logic elsewhere without further direction.

Consequence: existing JWT role checks do not enforce PENDING SHOP restrictions or reload current database status. This remains unresolved; earlier current-state guard-enforcement decisions below describe the superseded implementation. Production guard files and AuthModule now match HEAD.

## Earlier records — latest correction takes precedence

## Current accepted decision — minimal SHOP approval, 2026-10-09

The user approved the revised minimal file list. This supersedes the earlier broader Phase 2 authentication/upload plan.

- Keep existing signup/login, bcrypt, JWT structure/signing/verification, AuthService, AuthGuard, decorators, MemberInput/MemberUpdate and resolvers. USER registration/login retain existing behavior.
- Preserve the user's PENDING enum addition. New SHOP signup sets PENDING; public ADMIN signup is rejected. Do not create application collections or require a new picture/upload argument.
- Reuse getAllMembersByAdmin with SHOP/PENDING filters and updateMemberByAdmin with memberStatus ACTIVE. Existing ADMIN metadata and trusted member management remain; no new operations or DTOs.
- Make the smallest necessary RolesGuard change: after existing JWT verification, load the current Member and check its current role. SHOP and ADMIN require ACTIVE. Other USER status behavior remains as before. AuthModule makes the existing Member model available to the guard without changing AuthService or creating a MemberService dependency cycle.
- Prevent self-service memberType/memberStatus updates in MemberService, because those fields would permit self-approval or ADMIN promotion. Keep DTO fields for existing trusted ADMIN updates; do not split DTOs or refactor other fields.
- Preserve all upload code. No HTTP upload endpoint was found; do not invent one or claim the Axios flow works. Existing ACTIVE-only profile updates remain unchanged, including for pending applicants.

Still pending: locating/verifying the stated HTTP uploader and its pending-shop image persistence behavior, live client/data compatibility, and any separately approved order/event/chat/frontend work. No further phase is authorized by this increment. Earlier Phase 1 decisions remain below as history.

## Earlier phase records

## Current accepted decisions — ER Phase 1, 2026-10-09

These decisions supersede conflicting proposals in the historical record below.

- Preserve `gamenix-api` / `gamenix-batch`, NestJS DI and the existing module/resolver/service pattern. Keep schemas in `src/schemas` as explicitly required by the latest request; DTOs/enums remain under `src/libs`.
- Use MemberType USER / ADMIN / SHOP and `memberProducts`. Preserve `getAgents`, `AgentsInquiry` and `availableAgentSorts`; changing these names is unnecessary for this data-model migration.
- Use the exact Product fields and ten categories specified in the attached request. Remove housing fields/filters and the old unique housing index; independent shops can sell similar equipment.
- ProductStatus is PAUSE / PROCESS / FINISHED. The user explicitly approved PROCESS for active listings, FINISHED for sold listings and `deletedAt` for deletion. Default PROCESS preserves existing creation behavior. PAUSE is not deletion. Existing owner checks, counters and admin purge behavior remain, with the required status/date adaptations.
- OrderStatus is PAUSE / PROCESS / FINISHED, default PAUSE. EventType is TOURNAMENT / GIVEAWAY; EventStatus is PAUSED / PROCESS / FINISHED, default PAUSED. These are data defaults, not new lifecycle services.
- Use the ER's `order`, `orderItems` and `events` collections and exact owner/reference names. Keep customer `memberId` and event organizer internal to input assignment, following the existing catalog ownership pattern.
- Product stock is a nonnegative integer. Item quantity and event capacity are positive integers. Money fields are nonnegative numbers. No inventory deduction, totals calculation, checkout, event registration or new WebSocket functionality is authorized in Phase 1.
- ParticipantStatus values confirmed by the user: REGISTERED / CANCELLED. EventParticipant defaults to REGISTERED and uses collection `eventParticipants`, Event/Member refs and a unique `(eventId, memberId)` index across both states. Re-registration policy is deferred; cancellation does not free the unique pair. Input `memberId` is internal for future authenticated assignment; update DTO only exposes `_id` and optional status, preserving references.
- New Order/OrderItem/Event/EventParticipant definitions are not wired to application operations. Future services must enforce SHOP/customer identity, one shop per order and reference existence; refs alone provide no such checks.

Still pending: existing-data/client compatibility; shop enrollment/security policy; atomic order/inventory writes; payment, shipping, cancellation and event registration rules; private chat. No live data migration or Phase 2 work is authorized by this increment.

## Historical snapshot — retained for migration history

The following records describe earlier repository states and proposals. Current status and accepted decisions above take precedence. Earlier validation records remain historical.

Snapshot: 2026-10-09 (Asia/Seoul). Confirmed means explicitly required by the user/`AGENTS.md`, not necessarily implemented. Proposed alternatives below are tradeoffs for future review; this session did not establish a historical alternatives discussion.

## Confirmed target decisions

User naming update (2026-10-09): use **Gamenix** / `gamenix`, including `gamenix-api` and `gamenix-batch`. The project rename is completed; keep the existing directory/module structure and domain logic. This supersedes the earlier name ending in 365.

| Decision | Reason | Technical implications | Risks | Alternatives for comparison |
|---|---|---|---|---|
| Reuse Nestar architecture and preserve NestJS, GraphQL, MongoDB/Mongoose | Short timeline and reusable working features | Keep resolver/service/module DI patterns and code-first DTOs | Old domain assumptions can survive renames | Full rewrite; different persistence/API stack |
| Replace properties with gaming products | New marketplace domain | Rename catalog contracts; remove real-estate fields and filters; update joins/indexes/batch | Breaking GraphQL and stored-data changes | Parallel property/product catalogs |
| Use USER, SHOP, ADMIN; replace AGENT with independent SHOP | Separate buyers, sellers, administration | Update enums, guards, signup policy, searches, counters, token/data compatibility | Caller-controlled roles and old JWTs/data | Separate shop accounts/role system |
| Support multiple independent shops; products owned by SHOP members | Marketplace requires seller independence | Server assigns owner; enforce owner predicates on writes; revisit catalog uniqueness | Cross-shop writes and data exposure | Single central seller |
| Restrict each order to products from one shop | Clear seller responsibility per order | Validate all item owners server-side; split checkout if needed | Mixed carts and concurrent edits | Multi-shop orders with seller suborders |
| Maintain stock in `productLeftCount` | Equipment has purchasable quantities | Integer validation and conditional decrement; consistency with order lifecycle | Overselling and failed-order stock loss | Separate inventory ledger/reservation model |
| Use the ten specified product categories | Consistent gaming catalog contract | KEYBOARD, MOUSE, MONITOR, AUDIO, CHAIR, DESK, CONTROLLER, ACCESSORY, GPU, GAMING_PHONE in DTO/schema/client enums | Hardcoded taxonomy needs future evolution | Dynamic category collection |
| Support shop tournaments and giveaways | Gaming community engagement | Owned events and participant relationships | Eligibility/capacity/winner rules unspecified | Separate unrelated feature stacks |
| Prevent duplicate event registrations | One registration per member/event | Enforce uniqueness against concurrent requests, not just pre-checks | Cancellation/re-registration semantics | Allow multiple entries |
| Reuse articles, comments, likes, views, follows, auth/member modules | Preserve existing community functionality | Replace catalog-specific groups/joins while retaining community APIs | Counter/reference drift | Rebuild community separately |
| Use NestJS WebSockets for real-time customer/shop communication | Reuse existing gateway and auth integration | Add authorized conversation routing | Existing broadcast/Guest behavior is unsuitable for private messages | Polling or external chat service |
| Preserve API/batch app separation with Gamenix names | Existing monorepo responsibilities | Rename paths/config/scripts/imports together | Batch imports API models directly | Merge apps or extract shared library |

## Proposed and pending decisions

| Topic / status | Proposed direction and reason | Technical implications | Risks | Alternatives / unresolved choice |
|---|---|---|---|---|
| Schema placement — PENDING | Reconcile `AGENTS.md` target `src/libs` with existing `src/schemas` before edits | Update module and batch imports if moved | Large unnecessary path churn | Keep existing schemas path with an explicitly accepted instruction change |
| Data and GraphQL compatibility — PENDING | Inventory clients and existing data first | Map AGENT/PROPERTY values, references, collection names, deployed tokens and operations | Data loss or client breakage | Clean new database, explicit migration, temporary aliases |
| Product contract — PROPOSED | Product-prefixed names and validated category/price/stock filters | New DTOs/schema/indexes; remove housing fields | Inconsistent type/input/output fields | Final field names, status values, SKU/brand/specification model still open |
| Order consistency — PENDING | Conditional stock writes plus atomic multi-item/order strategy | May require MongoDB transactions and supported topology | Partial writes, retries, overselling | Reservations or compensating updates; choose decrement timing, idempotency, cancellation/restock rules |
| Order data — PENDING | Server-calculated totals and item snapshots for historical accuracy | Define status, quantity, currency, shipping and payment fields | Price changes and ambiguous fulfillment | Snapshot detail level, payment provider and status transitions undecided |
| Collection names — PENDING details | Use user target list as planning baseline, including singular `order` | Explicit Mongoose collection options if adopted | Naming drift | Confirm `order` versus `orders`; exact owner/reference field names |
| Registration uniqueness — PROPOSED mechanism | Unique `(eventId, memberId)` index plus service checks | Handle duplicate-key races; define eligibility | Soft deletion may block re-registration | Partial unique index or retained registration state |
| Event lifecycle — PENDING | Shared event concept with tournament/giveaway type | Define organizer, schedule, capacity and registration states | Unclear cancellation and winner selection | Separate subtype models or modules |
| Private chat — PENDING details | Authenticated participant-authorized conversations over existing `ws` adapter | Replace global routing for private messages; remove token logging | Privacy, token leakage, lost history | Persistent messages versus ephemeral chat; HTTP token/session handshake versus URL token; Guest access policy |
| Shop enrollment — PENDING | Restrict privileged role changes and explicitly define SHOP enrollment | Separate self-service fields from admin-controlled role/status | Privilege escalation or stale token roles | Open SHOP signup, approval workflow, invitation model |
| Frontend source — PENDING | Locate actual Next.js checkout before implementation | Audit router, components, GraphQL client, styling and auth | Invented paths or incompatible client assumptions | Repo location and access not provided |

No pending mechanism in this table has been implemented by this documentation task. See [BACKEND_MIGRATION.md](BACKEND_MIGRATION.md) for current source evidence.
