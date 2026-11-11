# Petora / PortOne payment migration — 2026-10-29

> Historical report: superseded later on 2026-10-29 when the user explicitly selected direct KakaoPay with the existing development key. PortOne setup and execution are no longer the current flow. See [DIRECT_KAKAOPAY_MIGRATION.md](DIRECT_KAKAOPAY_MIGRATION.md). The inventory and validation below describe the earlier PortOne implementation only.

## Scope and source

Approved by the user after the file/dependency review. Source is the actual local `../petora-backend/apps/petora-api/src/components/payment/{payment.module,portone.service}.ts`, its payment fields/method enum and order verification call sites, and `../petora-next/libs/payment/portone.ts` plus its checkout interaction. Petora has no separate payment resolver, schema or payment-status enum: those Gamenix integration files cannot be copied from the reference.

Petora's PortOne V2 `getPayment`, `verifyPaid`, best-effort `cancelPayment`, `toPaymentMethod` and on-demand `requestPayment` flow are retained. The payment-method mapping and phone-number normalization preserve the original statements. Compatibility changes use existing Nest HttpService, authenticate saved-order operations, require backend amounts/owner bindings and TEST channel evidence, sanitize provider errors, and serialize durable payment/cancellation claims. No generic provider framework, worker or webhook was introduced.

## Reversible backup

Before the first edit, both working trees were archived and every archived source file was checksum-verified:

`/Users/asilbek/Desktop/gamenix365/.tmp/payment-migration-backups/20261029-111259`

Each project backup contains `worktree.tar.gz`, a per-file SHA-256/deletion manifest, original staged/unstaged binary patches, original HEAD source archive and Git index. It preserves 171 backend source files and four preexisting deletions, and 364 frontend source files. Ignored secrets/runtime/dependency files were not copied; unchanged environment files and existing order/auth/member code are protected by before/after checksums. No commit, push, checkout, reset or stash was performed.

## Files created/restored by this session

Backend paths are relative to `apps/gamenix-api/src/`:

| Path | Change |
|---|---|
| `components/payment/payment.module.ts` | Recreated the preexisting deleted module from Petora; added only HTTP/auth/model/service/resolver dependencies. Fixes ComponentsModule's broken import. |
| `components/payment/portone.service.ts` | Recreated from Petora with all four provider methods, TEST-only verification and secret-safe errors. |
| `components/payment/payment.resolver.ts` | Recreated authenticated prepare/status/verify/cancel operations for existing orders. Availability remains a public read-only readiness query. |
| `components/payment/portone.service.spec.ts` | Replaced the preexisting deleted tests with copied-method/provider-boundary tests. |
| `components/payment/payment.service.ts` | New existing-order compatibility service; does not inject or call OrderService. |
| `components/payment/payment.service.spec.ts` | New order/amount/ownership/history/concurrency/refund/schema tests. |
| `components/payment/payment.resolver.spec.ts` | New real GraphQL/JWT boundary tests. |
| `libs/enums/payment.enum.ts` | Petora PaymentMethod values plus existing local verification-state values, separate from fulfillment. |
| `libs/schemas/KakaoPayPayment.model.ts` | Compatible private mapping of existing `kakaoPayPayments`, retaining unique index identities and immutable snapshots. Automatic index/collection writes disabled. |

Frontend paths are relative to `../gamenix365-next/`:

| Path | Change |
|---|---|
| `libs/payment/portone.ts` | New adapted Petora SDK/storage helper; server-owned payment details, scoped pending order identity and existing bounded verification/callback cleanup. |

## Existing files modified by this session

| Project | Path | Change |
|---|---|---|
| Backend | `apps/gamenix-api/src/libs/dto/payment/kakao-checkout.ts` | Kept existing PortOne response contracts; removed obsolete direct-session DTO; added payment method and cancellation-pending projection. |
| Backend | `apps/gamenix-api/src/libs/interceptor/Logging.interceptor.ts` | Added cancellation operations to the existing private payment logging pattern. |
| Backend | `.env.example` | PortOne TEST configuration placeholders and direct-key distinction; real environment files unchanged. |
| Frontend | `libs/components/payment/KakaoPayCheckout.tsx` | Existing layout/classes retained; copied Petora SDK request, backend verification and owner-confirmed cancellation; removed direct API flow. |
| Frontend | `pages/orders/process.tsx` | Existing createOrder flow retained; payment callback markers cleaned, saved-order recovery retained, obsolete direct approval handoff removed. |
| Frontend | `apollo/user/mutation.ts` | Retained prepare/verify operations; added cancellation; removed the two direct-provider operations; unrelated documents unchanged. |
| Frontend | `apollo/user/query.ts` | Added payment-method/cancellation fields to the existing payment status document only. |
| Frontend | `package.json`, `yarn.lock` | Added only Petora's `@portone/browser-sdk@^0.1.9` dependency; Yarn resolves 0.1.13. Existing locked dependency versions retained. |
| Frontend | `scripts/test-payments.cjs` | Adapted existing offline regressions to the copied SDK; added owner-scoped storage/cancellation/history cases. |
| Frontend | `public/locales/en/common.json`, `public/locales/kr/common.json`, `public/locales/ru/common.json` | Added four cancellation labels/messages in each existing locale. |
| Frontend | `docs/KAKAOPAY_SETUP.md`, `docs/ai/COMPLETED_TASKS.md` | Exact current setup and completion evidence. |
| Backend | `docs/ai/BACKEND_MIGRATION.md`, `docs/ai/DECISIONS.md`, `docs/ai/COMPLETED_TASKS.md`, `docs/ai/NEXT_STEPS.md`, `docs/ai/FRONTEND_MIGRATION.md`, `docs/ai/KAKAOPAY_KRW_PLAN.md`, `docs/ai/PAYMENT_READINESS.md` | Current approved provider/scope/results, preserving earlier entries as history. |
| Backend | `docs/ai/PETORA_PORTONE_MIGRATION.md` | This detailed session inventory and evidence report. |

## Files deleted by this session

- Frontend `libs/payment.ts`: superseded direct/provider-switch/old SDK implementation; all callers moved to `libs/payment/portone.ts`. Reusable payment-only polling/return-URL behavior was retained in the copied helper.
- No additional backend file was deleted. The preexisting payment-folder deletions were replaced by the copied module/provider, resolver and focused tests. No database record, collection or index was deleted.

## Preserved contracts and behavior

`Order`, `OrderItem`, all OrderService/OrderResolver/OrderModule code, order/item schemas/DTOs/enums, auth/guards/member/points code and real environment files are unchanged from the session backup. Existing createOrder/updateOrder/getMyOrders documents remain compatible. One-shop ownership, server pricing, approved KRW delivery/pickup fees, stock deduction at PROCESS and existing points timing remain independent of payment. Payment never advances PROCESS/FINISHED, adjusts stock, awards points or changes existing invoices/notifications.

Preparation requires a saved owned PAUSE order, active buyer/shop, complete server-owned KRW item snapshots and one-shop product ownership. It uses one stable payment ID and checks the existing unique order/payment indexes before upsert. Existing DIRECT/captured/cancelled/pending claims cannot be replaced; retired `payments` records also block a replacement charge without being modified. Historical USD records stay readable and unchanged.

Only provider retrieval with matching identity/store/TEST KakaoPay channel/KRW/amount/member/order and full capture evidence can persist PAID. Browser flags, prices, localStorage and fulfillment status cannot approve payment. Compare-and-set versions protect newer results from stale writes. A full cancellation is owner-only and restricted to an order observed in PAUSE; its durable claim precedes the provider write. Petora's best-effort method is followed by authoritative retrieval, and an ambiguous refund is never automatically posted again. Partial refunds and unresolved historical claims require manual review. Cancellation does not cancel the order or restore stock.

The original separate-write order implementation and its lack of inventory reservation remain as requested. Payment does not introduce an atomic transaction across payment, order and fulfillment. No production/live integration, webhook or automatic reconciliation was enabled.

## Configuration finding

The existing backend contains direct `KAKAOPAY_CID`, `KAKAOPAY_SECRET_KEY` and `KAKAOPAY_API_URL` entries, but no PortOne configuration. Presence was inspected without outputting values or sending them anywhere. They do not authenticate PortOne. The replacement uses **PortOne V2**, always reports provider PORTONE, and ignores the old KAKAOPAY_PROVIDER selector. Its unconfigured readiness is disabled.

Obtain the PortOne Store ID, direct KakaoPay **TEST** channel **key**, and separately issued server-only **V2 API Secret**. Add PORTONE_ENVIRONMENT=SANDBOX, PORTONE_STORE_ID, PORTONE_TEST_CHANNEL_KEY, PORTONE_V2_API_SECRET and PORTONE_TEST_CHANNEL_PROOF_PAYMENT_ID to the existing backend environment privately. The proof is one independently completed TEST transaction for this store/channel, created with the official SDK playground. Existing unique `kakao_order_unique`/`kakao_payment_unique` indexes must be present; no index provisioning was executed. Exact console steps, official links, readiness errors and desktop/mobile/refund verification instructions are in `../gamenix365-next/docs/KAKAOPAY_SETUP.md`.

Official verification: [PortOne authentication](https://developers.portone.io/api/rest-v2) explicitly requires a PortOne V2 API Secret rather than a PG secret. [Setup](https://developers.portone.io/opi/ko/integration/ready/readme?v=v2) documents test channel creation, Store ID and V2 secret issuance. [KakaoPay](https://developers.portone.io/opi/ko/integration/pg/v2/kakaopay?v=v2) supports KRW/EASY_PAY with PC IFRAME/mobile REDIRECTION. The official OpenAPI schema was downloaded and checked for channel keys, capture/cancellation fields and full-refund request semantics.

## Validation

- `npx tsc -p apps/gamenix-api/tsconfig.app.json --noEmit`: PASS.
- `npx tsc -p apps/gamenix-batch/tsconfig.app.json --noEmit`: PASS.
- `npm run build` and `npx nest build gamenix-batch`: PASS.
- `npm test -- --runInBand --silent`: **406 PASS, four opt-in database cases SKIP**, 15 passing suites. Includes 89 focused payment/provider/GraphQL tests and existing order/auth/community regressions.
- Actual AppModule dependency injection and schema generation with only database dependencies replaced offline: **31 queries / 46 mutations; all 74 frontend GraphQL documents validate**, including existing upload/order/auth operations. Missing/invalid auth rejected before data reads; valid owner scoped correctly. No database/provider connection.
- Frontend Yarn TypeScript and production build: PASS, **91 pages**. Only the required SDK dependency was added.
- Frontend `yarn node scripts/test-payments.cjs` and `yarn node scripts/test-basket.cjs`: PASS. Cover server-owned amounts, copied SDK invocation, saved-order/mobile recovery, duplicates, forged callbacks, owner changes/unmount, pending-refund display, cancellation confirmation and stock/cart/order preservation.
- Isolated compiled-browser fixtures confirmed unavailable gating and actual packaged SDK loading/verified-success/duplicate-click suppression. Further fixture results are recorded separately if completed; no full browser-suite completion is claimed here.
- Final source publication: all 14 reviewed frontend paths and the required SDK installed/checksum-verified in gamenix365-next; installed frontend TypeScript/payment regressions PASS. Both repositories pass git diff --check. The baseline audit shows exactly 20 backend / 14 frontend source/document changes; all protected order/auth/member/environment files are unchanged. The extended optional browser harness stalled after its completed cases and its isolated Chrome instance was closed; no full browser-suite pass is claimed.

Real PortOne/KakaoPay transactions/refunds and live MongoDB concurrency were **not** tested. All provider/browser responses were mocked or intercepted; four opt-in database tests were not enabled. No application/production data changes, real provider charge/refund, environment secret changes, commit, push or deployment were performed.
