# Frontend migration plan

## KRW formatting and server shipping policy — 2026-10-21

Frontend now selects currency/subtotal fields, uses shared locale-aware integer KRW formatting, reads getShippingPolicy for estimates and blocks old/mixed-currency basket snapshots. SHOP price input has integer won steps. Active KRW pricing UI has no USD or dollar labels; historical USD order views preserve original money. Public legacy products require approved repricing. Payment confirmation shows a saved unpaid KRW order and honest provider blocker. See KRW_MIGRATION.md.

## Auth dialogs, Google button and blocked KakaoPay confirmation — 2026-10-21

The latest request adds shared responsive MUI/SCSS auth dialogs, official GIS button and existing Apollo/JWT adoption. Google requires configured client IDs. Successful order creation now shows its server USD total and disabled KakaoPay method with readiness/error retry, retaining existing cart/order semantics. It never treats callbacks as paid. No provider checkout exists while KRW pricing and test-channel evidence are missing. Native KRW planning was selected; see KAKAOPAY_KRW_PLAN.md.

## Existing backend integrations completed — 2026-10-20

The current implementation request supersedes the earlier frontend exclusion. gamenix365-next now connects password recovery, optional private email/profile fields, fresh approval/session state, notifications/private socket frames, PRODUCT/SHOP ratings, owner article editing/deletion, contextual comment/review moderation and historical event participants. Unpaid orders remain; all references to removed payment operations were removed from active frontend code. See the latest COMPLETED_TASKS entry for the exact files, operations and validation. Earlier plans below are historical.

Petora supplied interaction references, not its incompatible booking/payment/notification fields. Preserve Gamenix WAIT/READ, notificationDesc/individual refs, memberNick, PRODUCT/SHOP reviews, single-shop orders and event approval rules. Article category is create-only; content remains limited to 250 characters including HTML by the existing backend DTO. Unsupported review uploads, private messaging, support APIs, shop/admin order management and full review-moderation listing remain in NEXT_STEPS.

> Backend compatibility change, 2026-10-20: the Petora simplification removes requestEmailVerification, verifyEmail, getPaymentStatus, getTestCheckoutAvailability and createTestCheckoutSession. Frontend source was not changed. Earlier checkout/verification contracts below are historical.

## Guarded sandbox checkout and payment polling — 2026-10-17

Frontend commit b9823ff adds only the required flow to the existing /orders/process page and existing Apollo documents/client: backend availability check, future approved country selection, same-order/key session retry, allowlisted PortOne hosted redirect and owner-safe local payment-status polling. The actual provider is unconfigured, so ordinary order confirmation still collects no payment. No layout, SCSS, stock, points, order status buttons, provider SDK or dependencies changed.

Return to /orders/process?paymentId=<local-payment-id>. Poll getPaymentStatus with no-cache and queryDeduplication=false, every three seconds for at most 40 nonoverlapping requests; owner changes/unmount suppress old results. Only backend verifiedSuccess together with SUCCEEDED may display confirmed payment. Browser callback flags and sessionStorage identifiers prove nothing. Session failure preserves the existing order and key; unknown createOrder outcomes still require My Orders inspection because that pre-existing operation is not server-idempotent.

Files: apollo/client.ts, apollo/user/query.ts, apollo/user/mutation.ts, libs/payment.ts, pages/orders/process.tsx, scripts/test-basket.cjs and scripts/test-payments.cjs. Node 20.19.0 with Yarn: tsc --noEmit --incremental false and both scripts passed. These are offline component/polling fixtures, not real browser/provider checkout tests. Deploy the backend GraphQL changes first. Actual PortOne account/TEST profile/PayPal USD compatibility, SDK adapter and signed sandbox deliveries remain required before activation or Phase 7.

## SHOP username and shop name integration — 2026-10-15

SHOP registration now has separate Username (memberNick) and Shop Name (shopName) inputs. Login still submits only memberNick/memberPassword. USER registration remains unchanged. The backend field is optional for older clients/accounts; the new SHOP signup UI requires a nonblank name and sends its trimmed value.

Existing SHOP MyProfile adds Shop Information with read-only Username, editable Shop Name, read-only owner email and the existing photo/upload controls. It uses the existing authenticated GET_MEMBER query for the current public name and private email; those email values are never copied into JWT/reactive auth state or sent during profile saves. Only data matching the current owner's ID can appear in the email field. Existing UPDATE_MEMBER saves the name with the owner's ID and omits memberNick for SHOP; ordinary USER saves omit shopName. Legacy shops with no name can continue other profile edits without sending an empty name. Pending shops retain the existing backend ACTIVE-only update restriction.

Existing shop cards/details, product seller cards/details, member/follow lists and SHOP community/review identities prefer shopName and retain their existing display-name fallback. Ordinary USER names, ID-based navigation, filtering, basket/order logic, approval and email privacy rules remain unchanged. No duplicate queries/mutations, custom hooks, new collections or dependencies were introduced. Deploy the backend shopName contract before these GraphQL documents.

Validated with Yarn TypeScript, the focused test-shop-name.cjs plus existing basket/category scripts, and isolated browser GraphQL fixtures for signup/login, owner profile rename, private email display, legacy/USER behavior, public shop/product names, light/dark desktop/mobile forms and tablet account layout. No live accounts or orders were created.

## Current Events contract — 2026-10-10

Backend Events operations now exist; frontend work is still NOT STARTED. Historical ER-only descriptions below are superseded. Checkout operations also exist; follow current order decisions rather than the historical definition-only snapshot.

Queries: getEvents(input: EventsInquiry), getEvent(eventId: String), getMyEvents(input: ShopEventsInquiry), getMyRegistrations(input: EventParticipantsInquiry), getEventParticipants(eventId: String, input: EventParticipantsInquiry), getAllEventsByAdmin(input: AllEventsInquiry). Lists return list and metaCounter [{ total }], with an empty counter array when no results match.

Event inquiries accept page (>=1), limit (1–100), optional sort (createdAt/updatedAt/eventDate/eventStart/eventEnd), direction (ASC/DESC), and search { eventType, eventStatus, eventOrganizer }. getMyEvents always uses authenticated organizer ownership. Shop/admin inquiries accept includeDeleted, default false. Participant inquiries use page/limit, optional createdAt/updatedAt sorting, direction and search { eventId, participantStatus }; getEventParticipants fixes its scope to the eventId argument and checks ownership/ADMIN.

Mutations: createEvent(input: EventInput), updateEvent(input: EventUpdate), finishEvent(eventId), removeEvent(eventId), registerEvent(input: { eventId }), cancelEventRegistration(eventId), updateEventParticipant(input: { _id, participantStatus }), updateEventByAdmin(input: EventUpdate), removeEventByAdmin(eventId). IDs use GraphQL String. Applicant/organizer identity is server controlled; new applications are PENDING. Review accepts only REGISTERED or REJECTED, for pending applicants.

Event fields/types are unchanged except nullable deletedAt in output. Creation defaults PAUSED; explicit PROCESS is allowed. Owners activate/pause via updateEvent and finish via finishEvent. FINISHED cannot reopen. eventDate is the scheduled date; eventStart/eventEnd remain complete DateTime values with timezone offsets. Applications/reviews close at eventStart. PENDING/REGISTERED may cancel before start, including while PAUSED; started/finished/deleted events reject cancellation. CANCELLED reapplication reuses its ID as PENDING; REJECTED cannot reapply. Only REGISTERED occupies capacity; full events may still receive pending applications. History includes optional eventData/memberData and survives soft deletion.

Protected operations use existing Bearer-token role guards plus current database member checks in EventService. Event images still need integration: Axios must use the existing GraphQL multipart upload contract and pass its returned path as eventImage. No REST image endpoint or uploads/event directory exists yet. No upload or frontend code was changed.

## Historical backend contract — ER Phase 1

Frontend work remains NOT STARTED. The backend catalog source now uses Product fields/types/operations and ten gaming categories. Clients must use `productName`, `productPrice`, `productLeftCount` and PRODUCT targets; housing inputs/filters are removed. ProductStatus is PAUSE / PROCESS / FINISHED, with deletion represented by `deletedAt`. Member outputs expose `memberProducts` and roles USER / ADMIN / SHOP.

`getAgents` and `AgentsInquiry` intentionally retain their existing names while selecting SHOP. Favorites/visits retain their operation names and return Products. Order/OrderItem/Event DTOs exist only as definitions; no new checkout/event/registration API is available. EventParticipant data definitions are complete with REGISTERED / CANCELLED; no registration endpoint exists. Do not build UI against unimplemented operations. Existing clients and stored data require a separate compatibility review.

The conceptual frontend plan below remains future work, not authorization to begin Phase 2.

## Historical snapshot — retained for migration history

The following records describe earlier repository states and proposals. Current status and accepted decisions above take precedence. Earlier validation records remain historical.

Snapshot: 2026-10-09 (Asia/Seoul). Status: PLANNED / NOT STARTED in this checkout.

## Evidence boundary

The user describes a Next.js Nestar frontend. No frontend package, Next.js configuration, pages/app routes, React components, GraphQL client, generated client types, or styling system was found among the inspected repository files. This checkout contains two NestJS apps; `package.json` does not declare Next.js/React. Current frontend architecture, exact pages/components, router version, and frontend validation commands are NOT VERIFIED. The mappings below describe conceptual Nestar features, not verified filenames or routes.

Reuse existing frontend components once located. Do not introduce a new framework, GraphQL client, state library, or design system without inspecting the existing frontend.

## Conceptual page/component mapping

| Nestar feature to locate | Gamenix destination | Reuse / required change |
|---|---|---|
| Home, navigation, hero, footer | Gaming marketplace home | Keep layout; replace branding, copy, imagery and navigation |
| Property listing, cards, grid, pagination | Product catalog/cards | Reuse grid/loading states; remove beds/rooms/square/location/rent fields |
| Property filter/search panel | Category, price, text and shop filters | Keep query-state behavior; bind approved product filters |
| Property details/gallery | Product details/gallery | Reuse image UI, owner links and community actions; add stock/quantity/cart controls |
| Agent directory/profile | Shop directory/profile | Reuse member profiles/follows; display shop catalog and events |
| Agent property dashboard/editor | Shop product dashboard/editor | Reuse forms/uploads/table patterns; add category/price/stock validation |
| Favorites and visited listings | Favorite/visited products | Reuse list views with product result types |
| Member profile/auth | Buyer/shop account | Keep working auth/profile; align USER/SHOP/ADMIN permissions |
| Community board/article/comments | Gaming community | Preserve components and operations; update branding/catalog links |
| Existing chat UI, if any | Customer/shop conversations | Reuse UI only after backend conversation authorization exists |
| No verified equivalent | Cart, checkout, order history/detail | Add using existing UI conventions and approved backend contracts |
| No verified equivalent | Tournament/giveaway list/detail/registration | Add using existing list/detail/form patterns |

## Priority phases and acceptance conditions

### Phase 0 — Locate and audit frontend (P0)

1. Obtain the real frontend checkout and read its instructions.
2. Inventory package scripts, Next.js router, routes, components, styling, authentication storage, GraphQL documents/cache/code generation, uploads, and socket client.
3. Replace conceptual mappings above with actual paths. Record working baseline checks without claiming checks from this backend session.
4. Agree the backend product/role contract and compatibility policy before replacing frontend operations.

Exit: concrete reuse map and approved API contracts; frontend baseline recorded.

### Phase 1 — Branding and reusable shell (P1)

1. Update Nestar naming, metadata, navigation, home copy and visible real-estate terminology to Gamenix.
2. Provide navigation for catalog, shops, events, community, account and cart using the existing router.
3. Preserve responsive layouts, accessibility, shared UI and auth flows. Render seller/admin controls according to roles, with server enforcement as the authority.

Exit: consistent shell, correct role display, functioning existing community navigation.

### Phase 2 — Product catalog and shop profiles (P1; requires migrated backend)

1. Migrate property TypeScript interfaces, enums, fragments, query variables and response handling together. Use the ten target categories: KEYBOARD, MOUSE, MONITOR, AUDIO, CHAIR, DESK, CONTROLLER, ACCESSORY, GPU, GAMING_PHONE.
2. Reuse listing/cards/pagination/gallery components. Replace housing attributes with approved product fields, price and availability.
3. Wire category, price, text and shop filters to the backend contract; preserve URL state if already supported. Add further filters only when the backend supports them.
4. Migrate agent directory/profile into shop pages, preserving follows, likes and catalog ownership links.
5. Rebind favorites/visited results, comments/likes/views and uploads to products. Update Apollo or other existing cache identity policies if applicable; the client library is currently unknown.

Exit: catalog/detail/shop pages work with product contracts and no real-estate fields.

### Phase 3 — Shop product management (P1)

1. Adapt existing agent listing table and create/edit forms to SHOP product management.
2. Validate category, price and nonnegative integer `productLeftCount`; display server errors and upload progress.
3. Restrict ordinary management UI to owned products, verify server rejection of cross-shop updates, and preserve separate admin flows.

Exit: a shop can manage its own products; another shop cannot modify them.

### Phase 4 — Cart, checkout and orders (P2; backend contract required)

1. Add quantity-aware cart state using existing state conventions.
2. Maintain one shop per checkout. Decide whether adding another shop's product starts a new cart or requires explicit replacement; explain behavior in the UI.
3. Submit product IDs and quantities for authoritative server pricing/stock validation; handle sold-out items, changed prices and duplicate submissions.
4. Add checkout, confirmation, order history and detail pages after agreeing order/payment/shipping/status contracts. Add shop fulfillment views only for supported backend actions.

Exit: one-shop checkout succeeds, mixed-shop orders are rejected server-side, and errors preserve useful cart state.

### Phase 5 — Events and community (P2)

1. Preserve gaming community article creation/detail, comments, likes, views and follows.
2. Add tournament/giveaway list/detail pages, shop-owned event management and authenticated registration.
3. Show registration status and handle duplicate, closed, full or ineligible registration responses according to backend rules.
4. Add cancellation/winner views only after those contracts are decided.

Exit: supported events and registrations work without disrupting community features.

### Phase 6 — Customer/shop chat and regression checks (P2)

1. Inspect any existing socket client. Match the actual backend `ws` protocol rather than assuming Socket.IO from installed dependencies.
2. Integrate authenticated conversation routing, membership checks, history policy and reconnect handling after backend support exists.
3. Confirm private messages are visible only to participants. The existing global broadcast gateway cannot supply this behavior.
4. Run actual frontend type/build checks and focused auth/catalog/shop/cart/event/community/chat tests; record exact commands/results once known.

## GraphQL migration checklist

| Current backend operation/type | Proposed frontend replacement |
|---|---|
| `getProperties`, `getProperty(propertyId)` | `getProducts`, `getProduct(productId)` |
| `createProperty`, `updateProperty` | `createProduct`, `updateProduct` |
| `getAgentProperties`, `getAgents` | `getShopProducts`, `getShops` |
| `likeTargetProperty` | `likeTargetProduct` |
| `*PropertyByAdmin`, `getAllPropertiesByAdmin` | Corresponding product admin operations |
| `getFavorites`, `getVisited` → `Properties` | Product return DTOs; operation names may remain |
| Property DTOs/inquiries and housing enums | Product DTOs/inquiries and gaming categories |
| `MemberType.AGENT`, `AgentsInquiry`, `memberProperties` | SHOP, shop inquiry, approved product counter name |

Target names are proposals until implemented. Preserve community/member operations where semantics remain valid. Regenerate client types if the existing project supports it, update fragments and cache keys, then verify error/loading/empty states. Cart/order/event operations have no existing backend contract to reuse.
