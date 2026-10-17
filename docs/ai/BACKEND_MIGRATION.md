# Backend migration: Nestar → Gamenix

## Provider-independent sandbox workflow; provider adapter still blocked — 2026-10-17

Extended the existing payment foundation with trusted persisted-order USD snapshots, idempotent active attempts, strict verification evidence, guarded GraphQL session/availability operations, raw-body webhook/event boundary and batch reconciliation. Default provider is unconfigured and cannot be enabled by flags; no PortOne SDK, external provider call or actual provider signature integration exists. The conditionally approved account/PayPal TEST channel/USD profile remains unverified. getPaymentStatus now exposes verifiedSuccess only from persisted matching capture evidence.

The approved reporting-only order-failure hook leaves stock/points/status behavior intact. Frontend retains its checkout and adds a disabled-by-default session path, same-order resume and owner-safe backend status polling. No Phase 7 work, data migration or live payment. See PAYMENT_READINESS, SANDBOX_PAYMENTS and the newest completion ledger entry; earlier foundation-only descriptions below are historical.

## Sandbox payment record foundation; checkout blocked — 2026-10-17

After the readiness audit and user approval, added independent Payment/PaymentEvent persistence, sandbox-only environment values, explicit currency/integer amounts, immutable owner/order/shop and USD source snapshots, provider/idempotency/event identities, separate reconciliation metadata and an authenticated owner-only getPaymentStatus query. No payment creation/update API or provider execution exists. Current catalog/shipping/emails stay USD per the user's latest instruction; no currency migration, order business-rule change, stock/point effect or credential change occurred.

The user has no sandbox account/channel. Provider/PG USD compatibility for the South Korean merchant and platform-versus-shop merchant arrangement must be confirmed before checkout/SDK/webhooks. Payment verification, cancellation/timeout/reconciliation workers and provider scenario tests remain unimplemented. This is a partial Phase 6 foundation, not a working payment checkout. See [PAYMENT_READINESS.md](PAYMENT_READINESS.md), [SANDBOX_PAYMENTS.md](SANDBOX_PAYMENTS.md) and the completion ledger for validation and production blockers.

## Order confirmation/status email delivery implemented — 2026-10-17

Phase 5 adds private durable `emailDeliveries` records, confirmation/status HTML and text templates, and a gamenix-batch worker using the existing MailService. Successful OrderService creation and PROCESS/FINISHED operations enqueue the authenticated buyer's current verified email; optional/missing/unverified email never fails checkout. SMTP runs only in batch. Templates use stored order/item data, USD formatting and pickup/delivery details; processing states do not claim payment. Existing order writes, stock, points and transitions are unchanged.

Unique event keys deduplicate records. The worker uses atomic expiring leases, saved snapshots, recipient email-version rechecks and five attempts with 1/5/15/60-minute retry delays. Separate order/queue writes retain an enqueue gap; SMTP acceptance/acknowledgement can also produce recovery duplicates. See [ORDER_EMAILS.md](ORDER_EMAILS.md) for policy, operational requirements and limits.

Validation: 282 offline tests and eight isolated real-MongoDB order-mail cases pass; 22 older MongoDB cases remain unexecuted. Both TypeScript checks and both app builds pass. The isolated test database was cleaned up, all mail was captured, and no application-data migration or real SMTP sending occurred. Production batch startup now explicitly selects NODE_ENV=production.

## Persistent notifications implemented — 2026-10-17

Added recipient-scoped GraphQL inbox operations over the existing `notifications` collection. Existing `WAIT` / `READ` status values remain; the schema now supports optional system authors, order/event refs, server-generated unique deduplication keys and recipient/status/date indexes. `NotificationModule`, service, resolver and DTOs are wired into the API. Queries and updates always derive the recipient from AuthMember; no client notification-create mutation exists.

Triggers run after shop approval/rejection, order creation/status changes, event approval/rejection and successful email verification. Notification writes check the recipient, ignore duplicate keys and catch storage failures so completed business operations remain successful. Payment notifications and WebSocket delivery were not added.

The existing socket gateway has privacy concerns: unauthenticated guests are accepted, chat messages and connection presence are broadcast to every socket, the in-memory chat history is sent to every connection, and token query values are logged. Notifications remain persistent-only and are not sent through that public channel. Validation: 234 tests pass, 22 integration cases are skipped without their explicit test Mongo URIs; both app TypeScript checks and API build pass. No live database/index deployment was performed. See COMPLETED_TASKS for the contract and limitations.

## SMTP email verification implemented — 2026-10-16

Phase 2 now provides reusable Nodemailer SMTP/capture mail, owner-requested verification and public token consumption using auth-only MongoDB transactions. Private email versions invalidate old grants on self/admin email changes. Username/password login, optional email, SHOP approval and existing guard/order/event policies remain unchanged. Tokens are hashed, expiring and single-use; account resend limits persist in MongoDB and IP limits are per process. Node 20+ is required by patched Nodemailer. Development transaction support and 18 isolated real-MongoDB cases were verified; all 242 executed tests, both TypeScript checks and API build pass. No application data migration or real SMTP sending occurred. See [EMAIL_VERIFICATION.md](EMAIL_VERIFICATION.md) for the actual contract/configuration and deployment limits. Earlier email-foundation-only descriptions below are historical.

## Separate SHOP username and public shop name — 2026-10-15

The existing Member schema, MemberInput, MemberUpdate and Member output now support optional shopName. Supplied names are trimmed strings of 1–100 characters; spaces are allowed, blank/null/overlong values are rejected. Omitted names remain valid for legacy accounts and clients. Only SHOP records can store the field; no Shop collection, migration, backfill, nickname rename or uniqueness index was added. memberNick/password login and password hashing remain unchanged. The existing token serializer naturally carries the public shopName and still omits private email fields.

Self-updates use the existing authenticated member ID and ACTIVE-only rule. Name-bearing requests with another _id are rejected before the resolver removes that ID; the service checks the current SHOP/ACTIVE record and repeats those constraints in its update predicate. Ordinary USER accounts cannot write shopName. Existing ADMIN mutation/guard permissions remain; the resulting account must be SHOP to receive a name, and an authorized change away from SHOP unsets it. New SHOP signup remains PENDING and existing approval/status protections remain. No guard, auth service or approval rewrite was made.

Public getAgents search now matches shopName and the existing memberFullName/memberNick fallbacks while retaining ACTIVE SHOP filtering and private-email projections. Frontend public business labels prefer shopName; legacy fallbacks remain until a shop configures its name. Deploy this backend GraphQL contract before the updated frontend documents.

Validation: API/batch TypeScript, API build, 144 offline tests across four suites (including 62 shop-name cases), frontend Yarn TypeScript/regression scripts and mocked desktop/tablet/mobile browser checks pass. Four existing email Mongo integration cases are skipped without MEMBER_TEST_MONGO_URI. No live database, account creation, name migration or approval mutation was performed.

## Member email foundation — 2026-10-13

Added optional memberEmail and default-false memberEmailVerified to the existing Member schema and GraphQL contract. Email is trimmed, lowercased and validated in DTOs, the member service and schema. A unique partial index covers string-valued emails only, excluding missing/null fields; existing nickname/phone uniqueness is unchanged. Signup remains optional-email and nickname/password login is unchanged for USER/SHOP/ADMIN. No data backfill, fake email, migration or live database write was performed.

Signup, self-update and existing admin update cannot accept client verification status. Each explicit email submission, including resubmission of the same normalized value or null to clear it, writes verification=false in the same update; omitting email preserves both existing fields. No input exposes memberEmailVerified. Future trusted backend verification must bind its update to the exact current email.

Both fields use Mongoose select:false. MemberResolver field resolvers return null to anonymous/other accounts across all Member results, including nested aggregation lookups. Owners read fresh private values through an explicit backend projection; legacy owners get null email/false verification. Use authenticated getMember(memberId: ownId), selecting memberEmail and memberEmailVerified. Signup/login do not establish request authentication for these fields: authenticate with the returned accessToken and query the owner profile. Shop/admin list aggregates exclude both fields; JWT payloads omit them so the existing socket member broadcasts do not carry email. Backend operations may explicitly select the private fields when authorized.

Validation: both app TypeScript checks and npm run build PASS; 95 offline tests PASS across 4 suites, including 61 new member-email cases with actual Nest GraphQL resolver/guard/ValidationPipe execution. Four isolated-MongoDB integration tests are skipped because MEMBER_TEST_MONGO_URI is unset. Partial-index definition and duplicate-key handling are tested offline; deployed index enforcement and real MongoDB writes remain unverified. No email provider, verification token/process, sending, payment or frontend integration was added. See NEXT_STEPS for the later verification work.

## Events and participant approval implemented — 2026-10-10

Implemented the approved Events scope in the existing Event component. This supersedes earlier event-scaffold-only and REGISTERED/CANCELLED-only descriptions. Schemas remain in src/schemas. Auth, guards, ProductService, OrderService, MemberService and community code are unchanged.

ACTIVE SHOP members create and manage their own events, with organizer assigned from authentication. ACTIVE USER members apply as PENDING, cancel before start and view their history. The owning ACTIVE SHOP or ACTIVE ADMIN approves/rejects pending applicants. EventService checks current Member role/status in addition to the existing role guards. ADMIN has separate event listing/update/removal operations and can inspect/review participants across shops.

EventStatus remains PAUSED / PROCESS / FINISHED. Creation defaults PAUSED, permits explicit PROCESS and rejects FINISHED. Owners use updateEvent for PAUSED ↔ PROCESS and finishEvent for PAUSED/PROCESS → FINISHED. ADMIN updates may also finish events. Finished events cannot reopen or be edited, but can be soft-removed. Nullable deletedAt is the only added persisted event field. Public queries exclude deleted events; owner/admin lists can opt into them. Participant history survives deletion.

User-confirmed dates: eventDate is the scheduled date; eventStart/eventEnd are start/end timestamps. Existing GraphQL DateTime types remain: clients send complete timestamps with timezone offsets. Start must precede end; creation, activation and rescheduling require a future start. Applications/reviews close at eventStart. PENDING/REGISTERED cancellation is allowed before start, including while PAUSED, but closes at start/finish/deletion. CANCELLED → PENDING reuses the record and needs approval again; REJECTED cannot reapply. Pending applications may wait even when confirmed capacity is full.

Only REGISTERED counts toward eventMaxParticipants. Event registration, cancellation, review and management changes use transactions. Incrementing existing event __v coordinates competing changes before counting capacity; withTransaction retries write conflicts. Lock-only writes do not change event updatedAt. Capacity cannot be reduced below the confirmed count. No counter field, collection, dependency or database configuration was added; the existing unique (eventId, memberId) index remains. Replica set/sharded MongoDB is required; no unsafe fallback exists. This events-only approval does not restore transactions to orders.

Queries: getEvents, getEvent, getMyEvents, getMyRegistrations, getEventParticipants, getAllEventsByAdmin. Mutations: createEvent, updateEvent, finishEvent, removeEvent, registerEvent, cancelEventRegistration, updateEventParticipant, updateEventByAdmin, removeEventByAdmin. Lists follow list/metaCounter, page/limit (1–100), allowlisted sorting and nested filters. See FRONTEND_MIGRATION for the contract.

Image integration remains incomplete: existing imageUploader/imagesUploader use GraphQL multipart, not REST, and no uploads/event directory exists. Event operations accept the uploaded path as eventImage. Minimal separate integration: provide uploads/event, restrict upload target to approved directories and confirm Axios uses the existing multipart contract and returned path. Upload code/directories were not changed.

Validation: both app TypeScript checks/builds PASS; 55 offline event tests PASS; full Jest run has 88 passing tests across 3 suites. Full API schema generation PASS (8 resolvers, 25 queries, 33 mutations); real EventModule DI resolves offline. Five opt-in integration tests were skipped because EVENT_TEST_MONGO_URI is not configured. No live DB, HTTP/e2e, upload or deployment-topology verification ran. Existing authentication/configuration issues remain outside this increment; this is not a production-readiness claim.

## OrderService simplified to the Express flow — 2026-10-10

The user requested only the original four methods and explicitly chose to remove MongoDB transactions. This latest instruction supersedes earlier transaction-preservation decisions. OrderService now has createOrder, recordOrderItem, getMyOrders and updateOrder only. Removed sessions/withTransaction, assertActiveMember, safe-integer/finite-number checks, duplicate-line Set validation and service-level validation already supplied by DTOs/schemas. Removed the earlier optional session argument from MemberService.memberStatsEditor because no caller needs it; its original statistics implementation is restored.

Creation uses find, map, reduce, create and recordOrderItem. Item persistence uses map/Promise.all with individual create calls, matching Perfumia. DTOs/GraphQL validate delivery choice, address, quantities, IDs and cart limits; schemas validate persisted data. Repeated product lines are now accepted and included in totals. Kept current ACTIVE member/SHOP checks inline, single-shop enforcement, database prices, conditional stock deductions, ownership and PAUSE → PROCESS → FINISHED transitions. Delivery/pickup fields and pricing remain unchanged.

To prevent repeat PROCESS stock/points effects without sessions, updateOrder conditionally claims the status transition before its stock and MemberService writes. Competing requests cannot both claim the old state. This is deliberately the one ordering difference from Perfumia's final status update. Writes are separate: creation can leave an order with incomplete items; stock/point failure can leave PROCESS set and earlier stock changes committed. Same-state retries do not repair partial failures; reconciliation is manual. No rollback, recovery workflow, payment integration or live database change was added.

Validation: API/batch TypeScript checks, API build and all 30 tests across 2 suites pass. Offline tests cover shipping, duplicate lines, DTO/schema/GraphQL contracts, conditional stock, repeat/competing status requests and the documented partial-write limitation. No live MongoDB/concurrency or HTTP/e2e testing was performed.

## Delivery price, address and fulfillment — 2026-10-10

COMPLETED: the user clarified that orderDelivery is the delivery price and requested separate address and pickup/delivery options. This supersedes the 2026-10-09 address interpretation below. Order schema/output DTO now contain numeric nonnegative orderDelivery, string orderAddress and registered OrderDeliveryType PICKUP / DELIVERY. DELIVERY is the default; its address is required by both service and schema validation. PICKUP may omit the address, so the GraphQL address field is nullable.

User-confirmed USD rules, applied once per order: pickup costs 0; delivery containing any CHAIR or DESK (the catalog's table category) costs 15 regardless of subtotal; other delivery costs 5 below a product subtotal of 100 and 0 at or above 100. A mixed same-shop furniture order uses the 15 fee. The server computes fees from product categories and quantities; customers cannot supply orderDelivery or orderTotal. orderTotal is the product subtotal plus delivery, rounded to two decimal places. No discount was added.

OrderInput accepts orderDeliveryType, orderAddress and orderItems. Method names and existing item persistence, history, status/stock/points and authorization logic are preserved; only createOrder adds the fulfillment checks and a simple fee calculation. Existing transaction handling remains. OrderUpdate stays a status-only command.

Validation: both backend TypeScript checks and both builds pass; all 24 tests pass across 2 suites, including 19 delivery/schema/DTO/GraphQL tests. No live MongoDB, concurrent checkout or HTTP/e2e tests were run. Existing documents with an address string in orderDelivery need a reviewed migration to orderAddress, numeric delivery price and fulfillment type before reuse; no records were migrated and historical fees must not be guessed.

## Order flow adapted from Perfumia — 2026-10-09

The user authorized adapting `/Users/asilbek/Desktop/perfumia/src/models/Order.service.ts` to Gamenix using the existing NestJS module/resolver/service style. The reference repository was read only. This supersedes earlier statements that orders are scaffolds only; events remain scaffolds.

OrderModule now registers Order, OrderItem, Product and Member models and imports the existing AuthModule. OrderResolver exposes authenticated `createOrder(input: OrderInput)`, `getMyOrders(input: OrdersInquiry)` and `updateOrder(input: OrderUpdate)`. Identity comes from AuthMember, following other components. No guard, authentication, product service, event, community or database configuration was changed. Schemas remain in their existing locations and were not modified.

The user explicitly chose to preserve the ER fields: `orderDelivery` is the delivery address, `orderTotal` is the rounded sum of server-side product prices times quantities. Perfumia's discount, delivery charge and extra subtotal/discount fields are not copied. Order creation derives the shop from products, rejects mixed shops, unavailable/deleted products, invalid quantities and duplicate lines, checks current ACTIVE buyer and ACTIVE SHOP records, snapshots item prices, and atomically writes the PAUSE order and its items.

The buyer can list their own orders, optionally filter by status and paginate (maximum 100); results include orderItems and current productData. The buyer can update only their own order, following PAUSE → PROCESS → FINISHED. PROCESS rechecks active shop, product ownership/status and sufficient stock, then conditionally decrements stock and awards the buyer one point as in Perfumia. Same-status retries do not repeat deductions/rewards. Invalid/backward/skipped transitions are rejected. No DELETE state, cancellation/restocking, shop/admin order management or payment verification was introduced.

MongoDB transactions cover order/item creation and the complete status/stock/reward update. A replica set or sharded cluster supporting transactions is required; there is no unsafe nontransactional fallback. PAUSE does not reserve stock, so processing can fail if another order consumes it. PROCESS is a buyer-requested status, not proof of payment. New createOrder requests are not deduplicated by an idempotency key.

Validation: both backend TypeScript checks, API and batch builds, and 32 tests across 3 suites pass. GraphQL schema generation and real OrderModule DI are tested offline. No live MongoDB transaction, concurrent checkout or HTTP/e2e test was performed; mocked failure/session tests do not prove database rollback or deployment topology. Existing catalog SHOP approval enforcement remains a separate unresolved issue; the current-member checks here apply only to new order operations.

## Event and order scaffolding — 2026-10-09

The user requested component modules with resolvers/services matching existing style. Added `components/event/event.{module,resolver,service}.ts` and `components/order/order.{module,resolver,service}.ts` under the existing API src directory. ComponentsModule imports EventModule and OrderModule. Each registers its existing primary Mongoose schema, provides its resolver/service and exports its service; services inject Model<Event>/Model<Order>, and resolvers inject the corresponding service.

This is scaffolding only: no GraphQL queries/mutations, checkout, inventory, order calculations or event registration behavior was added. OrderItem and EventParticipant model providers are not registered by these scaffolds. Existing schemas/DTOs, authentication and guards remain unchanged. Earlier statements that Event/Order have no application modules are superseded by this section; their business operations still do not exist.

Both app TypeScript checks and the API build pass. All 5 tests currently present pass; an offline Nest testing-module check resolved both services, resolvers and their model dependencies. No live database/startup test was run. Registering these modules makes Event and Order models available at runtime using their existing collection configuration.

## Current correction — guards preserved, 2026-10-09

The user subsequently instructed: do not change guard files. The agent's RolesGuard changes were reverted, along with the AuthModule Member-model registration/export that existed only to support that guard change. All production guards and AuthModule now match HEAD exactly.

Retained: SHOP signup sets PENDING, public ADMIN signup is rejected, and self-update cannot change role/status. Existing ADMIN listing and status-update operations remain available. No alternative authorization implementation was added.

IMPORTANT remaining gap: original RolesGuard checks the JWT role only. A PENDING SHOP token can therefore pass SHOP role checks; current-database status restrictions and immediate approval/blocking effects are NOT implemented. Minimal shop approval enforcement is incomplete under the new guard constraint. Earlier statements below claiming enforced restrictions or 44 passing tests are historical and superseded by this correction.

Validation after reversal: both app TypeScript checks and both builds pass; all 38 tests pass (3 suites). Guard tests now document the actual unchanged role-only behavior, including the pending-status limitation. No HTTP upload endpoint was found; upload code remains unchanged.

## Earlier records — latest correction takes precedence

## Current Phase 2 state — minimal SHOP approval, 2026-10-09

The revised minimal request supersedes the earlier broader authentication/upload proposal. The user approved exactly three source files, two focused test files and four handoff docs. Before this increment, the working tree contained only the user's MemberStatus.PENDING enum addition; it was preserved unchanged.

SHOP signup now sets memberStatus=PENDING in the existing MemberService.signup before the existing hash/create/token sequence. Public signup accepts USER or SHOP and rejects ADMIN. USER signup retains schema defaults and existing credentials. Login, password hashing, JWT creation/verification, AuthService, AuthGuard, WithoutGuard, decorators, DTOs and resolvers are unchanged.

Existing admin operations provide the whole workflow:

- Pending list: getAllMembersByAdmin with search {memberType: SHOP, memberStatus: PENDING}.
- Approval: updateMemberByAdmin with input {_id: shopId, memberStatus: ACTIVE} using the existing MemberUpdate type and ADMIN RolesGuard metadata.
- No dedicated approval/rejection mutations, new DTOs, shop modules or application collections were added. Existing trusted admin member management remains as before.

RolesGuard still verifies the same JWT, then loads the current Member by its signed ID. It checks the current role; SHOP and ADMIN must be ACTIVE. PENDING/BLOCK/DELETE shops cannot use protected SHOP operations, and non-admin members cannot use admin approval. Approval/demotion/blocking affects existing JWTs at the next RolesGuard-protected request. No new status restriction was added for ordinary USER roles. AuthModule registers/exports the existing Member model for this lookup; AuthService is unchanged.

Self-update rejects memberType/memberStatus writes at the service boundary, because otherwise an ordinary account could promote itself to ADMIN and bypass approval. MemberInput and MemberUpdate GraphQL shapes are unchanged; trusted ADMIN updates retain privileged fields. Other profile updates, including memberImage paths, retain their existing behavior.

Validation: API/batch TypeScript checks and builds pass; all 44 tests pass (3 suites, including the existing 20 ER tests). See COMPLETED_TASKS for exact commands/files. No production MongoDB or HTTP/e2e test was run.

Upload limitation: repository inspection found existing GraphQL imageUploader/imagesUploader and static GET /uploads serving, but no HTTP POST upload endpoint. No upload code, scalars, dependencies or frontend code were added or modified. The stated Axios HTTP upload flow remains unverified until its actual endpoint is located. Existing member profile updates require ACTIVE status, so a PENDING shop cannot save a picture via updateMember before approval; an external HTTP endpoint's behavior is unknown. No image requirement was added to signup.

This increment completes only minimal pending-shop approval. No broader auth redesign, product/order/event/community/socket changes or further phase work was performed. Earlier phase records below are retained as history; this current section takes precedence.

## Earlier phase records

## Current Phase 1 state — 2026-10-09

This section supersedes the historical snapshot below. The latest attached Phase 1 request authorizes ER schemas, GraphQL data definitions, enums and directly dependent Property → Product references. Application paths remain `apps/gamenix-api` and `apps/gamenix-batch`. Schemas remain in `src/schemas`; the user's explicit instruction not to relocate them overrides the placement guidance in AGENTS.md.

- Member now uses USER / ADMIN / SHOP and `memberProducts`; authentication fields and behavior are preserved.
- Product replaces Property in the existing module/resolver/service, DTOs, enums and model registration. The persisted fields match the supplied ER model, with ten product categories and integer, nonnegative `productLeftCount`. Housing fields, housing filters and the cross-shop housing unique index are removed.
- Existing catalog operations now use Product names: `createProduct`, `getProduct`, `updateProduct`, `getProducts`, `getShopProducts`, `likeTargetProduct`, `getAllProductsByAdmin`, `updateProductByAdmin`, `removeProductByAdmin`. `getFavorites` and `getVisited` retain their names and return Products. Ownership is still assigned from authenticated context and checked on ordinary updates.
- User-approved lifecycle mapping: PROCESS means active, FINISHED means sold, and `deletedAt` means deleted. PAUSE remains an editable, nondeleted listing. Public listing/detail/like and batch ranking select PROCESS with `deletedAt: null`. Sale/deletion timestamps are persisted. Existing admin purge only removes already soft-deleted records. No inventory deduction or checkout was added.
- Order, OrderItem and Event schemas, object DTOs, input/update DTOs and enums exist. Their collections are `order`, `orderItems`, and `events`. They have no application modules, registered providers, resolvers or business services yet; these definitions do not expose new order/event operations.
- EventParticipant schema, object/input/update DTOs and registered ParticipantStatus enum are complete. The user confirmed REGISTERED / CANCELLED; new records default to REGISTERED. `eventId` refs Event and `memberId` refs Member. Collection `eventParticipants` has a unique `(eventId, memberId)` index, including cancelled records. Member assignment is internal to the input, consistent with existing ownership DTOs; updates expose only `_id` and optional status. No registration module/service/resolver or application model provider was added.
- Comment/like/view/notification targets and product joins/counters/batch references were adapted directly. Community and socket behavior were preserved. `getAgents`, `AgentsInquiry`, `availableAgentSorts`, `batchTopAgents` and `BATCH_TOP_AGENTS` intentionally retain their existing names and now select SHOP.

Relationships: Product.memberId → Member; Order.memberId/shopId → Member; OrderItem.orderId → Order and productId → Product; Event.eventOrganizer → Member; EventParticipant.eventId → Event and memberId → Member; Notification.productId → Product. Mongoose refs do not enforce SHOP membership, item/order consistency or single-shop orders by themselves; new order/event authorization belongs to the next approved phase.

Compatibility: this is a breaking source/GraphQL contract change. No live database or client migration was executed. Existing AGENT documents/JWTs, properties collections, memberProperties counters, PROPERTY groups and notification propertyId fields need an explicitly reviewed migration before reuse. Existing authentication/guard weaknesses remain outside this phase. Catalog/member counters retain their existing nontransactional behavior.

Validation and the complete file inventory are recorded in [COMPLETED_TASKS.md](COMPLETED_TASKS.md). Phase 1 ER data definitions are complete and validated. Registration behavior and all Phase 2 work remain unimplemented. Phase 2 has not started.

## Historical snapshot — retained for migration history

The following records describe earlier repository states and proposals. Current status and accepted decisions above take precedence. Earlier validation records remain historical.

Snapshot: 2026-10-09 (Asia/Seoul). Source: repository inspection, `AGENTS.md`, and the attached documentation request. No earlier implementation session history was supplied. Source presence is not runtime verification; see [COMPLETED_TASKS.md](COMPLETED_TASKS.md).

## Context and status

Nestar is the original real estate marketplace using NestJS, code-first GraphQL/Apollo, MongoDB/Mongoose, and a separately described Next.js frontend. Gamenix targets a multi-shop gaming equipment marketplace and community: users buy products, independent shops manage stock and organize tournaments/giveaways, and members retain articles, comments, likes, views, follows, and real-time communication.

**Project naming is now Gamenix.** The apps are `gamenix-api` / `gamenix-batch`; package metadata, scripts, configuration, absolute imports and greeting labels were renamed without restructuring or changing domain logic. The catalog still uses properties and AGENT. No product/order/event/participant implementation was found. Domain migration remains PLANNED. Both TypeScript checks and API/batch builds passed after the rename; runtime behavior is NOT VERIFIED.

## Existing structure and naming plan

| Current evidence | Target / action | Status |
|---|---|---|
| `apps/nestar-api/src` | `apps/gamenix-api/src` | COMPLETED |
| `apps/nestar-batch/src` | `apps/gamenix-batch/src` | COMPLETED |
| `package.json`: former name `nestar`, Nestar start/output paths | Gamenix package and scripts; lockfile root metadata updated | COMPLETED |
| `nest-cli.json`: former Nestar projects and tsconfig paths | Coordinated app/config rename | COMPLETED |
| `components/property/property.{module,resolver,service}.ts` | Product module/resolver/service | PLANNED |
| `libs/dto/property/`, `libs/enums/property.enum.ts` | Product DTOs/enums under `libs` | PLANNED |
| `src/schemas/Property.model.ts` | Product schema | PLANNED; schema placement needs reconciliation |
| `MemberType.AGENT`, `AgentsInquiry`, `getAgents` | `MemberType.SHOP`, `ShopsInquiry`, `getShops` | PLANNED |
| `memberProperties`, `batchTopProperties`, `batchTopAgents` | Product counters and product/shop ranking | PLANNED; exact names pending |

Paths in the table are relative to `apps/gamenix-api/src` unless an app/root path is given. Both apps retain NestJS modules, dependency injection, controllers/services, and API resolvers. `components/components.module.ts` imports member, auth, property, board-article, comment, like, view, and follow modules. `app.module.ts` adds database, code-first GraphQL (`autoSchemaFile: true`), and socket modules. API `main.ts` installs validation, uploads, static uploads, and `WsAdapter`.

Current schemas live in `src/schemas`, whereas `AGENTS.md` directs DTOs, enums, and schemas under the target API `src/libs`. Resolve placement before a coordinated code change; documentation does not move files.

## Catalog, DTOs, enums, and service behavior

| Existing property contract | Target product contract | Migration note |
|---|---|---|
| `Property`, `Properties` | `Product`, `Products` | Proposed names; preserve pagination/enrichment patterns |
| `PropertyInput`, `PropertyUpdate` | `ProductInput`, `ProductUpdate` | Replace validation and GraphQL fields together |
| `PropertiesInquiry`, `AgentPropertiesInquiry`, `AllPropertiesInquiry` | Product, shop-product, admin inquiries | Rename clients and sort allowlists together |
| `propertyType`: APARTMENT / VILLA / HOUSE | `productType`: gaming category enum | Confirmed target values below |
| Title, price, images, description | Product title, price, images, description | Proposed `product*` names |
| Rooms, beds, square, rent, barter, construction date, property address/location | Remove real-estate fields | Shipping/shop address is a separate design question |
| `propertyStatus`: ACTIVE / SOLD / DELETE | Product lifecycle | Exact target statuses pending; SOLD is not stock management |
| `memberId` → Member | Shop ownership → Member with SHOP role | Owner field name pending |
| No stock field | `productLeftCount` | Confirmed target; implementation absent |

Target categories: `KEYBOARD`, `MOUSE`, `MONITOR`, `AUDIO`, `CHAIR`, `DESK`, `CONTROLLER`, `ACCESSORY`, `GPU`, `GAMING_PHONE`.

`components/property/property.service.ts` currently creates properties, updates member property counts, restricts ordinary updates to the owning member and ACTIVE status, builds real-estate filters, tracks views/likes, and supports favorites, visits, agent listings, and admin operations. Reuse these patterns while replacing domain semantics. Filters currently include location, rooms, beds, types, dates, prices, squares, text, and rent/barter options. Product filters and indexes need a new contract; they have not been implemented.

The current compound unique property index uses type/location/title/price without ownership. Do not copy it unchanged into a multi-shop catalog: independent shops must be able to list similar equipment.

## GraphQL operation migration

All target names below are proposed, not available operations. Current code-first DTOs define inputs/outputs; no running schema was introspected.

| Current resolver operation | Proposed Gamenix operation |
|---|---|
| `createProperty`, `getProperty`, `updateProperty` | `createProduct`, `getProduct`, `updateProduct` |
| `getProperties` | `getProducts` |
| `getAgentProperties` | `getShopProducts` |
| `likeTargetProperty(propertyId)` | `likeTargetProduct(productId)` |
| `getAllPropertiesByAdmin` | `getAllProductsByAdmin` |
| `updatePropertyByAdmin`, `removePropertyByAdmin` | `updateProductByAdmin`, `removeProductByAdmin` |
| `getAgents` | `getShops` |
| `getFavorites`, `getVisited` returning `Properties` | Preserve names if useful; return product DTOs |

Coordinate field/argument names, inquiry types, enum registration names, resolver return types, service signatures, and frontend documents. Preserve auth/member/community operations where semantics stay valid. Orders/events will need new contracts; none exist to rename.

## MongoDB collections and relationships

This is a schema/source audit, not a live database inventory.

| Current source | Intended collection | Evidence / gap |
|---|---|---|
| `schemas/Member.model.ts`: `members` | `members` | USER / AGENT / ADMIN today; SHOP pending |
| `schemas/Property.model.ts`: `properties` | `products` | `memberId` refs Member; all catalog migration pending |
| None found | `order` | Single-shop order header planned; singular name supplied by user |
| None found | `orderItems` | Order/product/quantity relationship planned |
| None found | `events` | Shop organizer and tournament/giveaway kind planned |
| None found | `eventParticipants` | Event/member relationship planned |
| `schemas/BoardArticle.model.ts`: `boardArticles` | `boardArticles` | Preserve community |
| `schemas/Comment.model.ts`: `comments` | `comments` | Property comment group/service coupling needs migration |
| `schemas/Like.model.ts`: `likes` | `likes` | Unique member/reference index; PROPERTY group needs migration |
| `schemas/View.model.ts`: `views` | `views` | Unique member/reference index; PROPERTY group needs migration |
| `schemas/Follow.model.ts`, registered as Follow | `follows` | Default Mongoose naming, no explicit collection option |
| `schemas/Notification.model.ts`: `notifications` | `notifications` | Schema exists with Property ref; no dedicated feature module found |
| `schemas/Notice.model.ts`: `notices` | `notices` | Schema exists; no dedicated feature module found |

No collection/data migration ran. Decide whether existing records must be retained before changing collection names, enum values, group discriminators, or references. Like/view aggregation joins currently use literal `properties`; notification references and comment counters also depend on Property. Batch imports API models directly and ranks properties/agents, so both apps must change together.

## Ownership, inventory, and orders

Confirmed target: independent SHOP members own products. Current creation is AGENT-only via `PropertyResolver`; the resolver injects the authenticated owner, and ordinary updates filter by owner. SHOP authorization is not implemented.

Confirmed target: an order can contain multiple products, all from one shop. There is no cart/order/stock implementation. Proposed approach: resolve products server-side, verify availability and common owner, calculate authoritative prices, and validate positive integral quantities. Maintain nonnegative `productLeftCount` through conditional stock updates and an agreed atomic order-writing strategy. Order item price snapshots, checkout idempotency, reservation/decrement timing, cancellation/restocking, and transaction support remain pending decisions.

## Events and participants

Confirmed target: shops organize tournaments and giveaways, users register, duplicate registration is prevented. No event enum/DTO/schema/module/resolver/service or participant implementation was found. Proposed reusable architecture: event module with SHOP ownership, participant module with authenticated registration, event eligibility checks, and a database unique event/member index. Capacity, deadlines, cancellation/re-registration, giveaway winner selection, and exact fields/operation names remain pending.

## WebSockets

Existing `socket/socket.gateway.ts` uses NestJS WebSockets with `ws`; `main.ts` installs `WsAdapter`. It verifies a token from the connection URL, stores client/member associations in a Map, permits Guest connections, broadcasts `info` and `message`, and sends `getMessages` with the last five in-memory messages. It logs the token. There are no customer/shop rooms, persistent conversations, or per-conversation authorization in this gateway.

Customer/shop chat is PLANNED. Preserve reusable gateway/auth infrastructure, then define conversation membership, recipient routing, guest policy, message validation, persistence/retention, reconnect behavior, and secure token handling. Existing global broadcast is not private customer/shop chat.

## Compatibility and blockers

Legacy real-estate references remain in property DTOs/enums/models, member counters/agent search, community groups/joins, notification refs and batch ranking. Active project/config/import/greeting references now use Gamenix; Nestar is retained in documentation as migration history. No compatibility aliases or deployment/data conversion policy was found.

Additional static findings requiring focused follow-up: signup accepts caller-supplied `memberType`; ordinary `MemberUpdate` exposes role/status and the service forwards input to MongoDB. This creates a privilege-change risk. `RolesGuard` accesses `authMember.memberType` before its null check. Property status updates compute local timestamps without assigning them to the persisted update input. These are source findings, not reproduced runtime results.

See [DECISIONS.md](DECISIONS.md) for pending choices and [NEXT_STEPS.md](NEXT_STEPS.md) for dependency order.
