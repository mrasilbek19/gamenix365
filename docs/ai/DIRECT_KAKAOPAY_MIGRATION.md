# Direct KakaoPay correction — 2026-10-29

## Direct configuration and domain recheck — 2026-11-02

The remaining checkout blocker is external application configuration. A fresh, real TEST ready request returned HTTP 400 / error_code -400: KakaoPay says the application has no registered Web site domain and cannot validate the callback. No TID was returned, no approval was attempted, and the diagnostic did not write application or production records. The current saved KRW 428863 order also contains this rejected preparation, with no TID/capture. No completed sandbox payment is claimed.

Runtime checks confirmed:

- Nest `ConfigModule.forRoot()` loads the backend working directory's `.env`; inherited process variables take precedence. CID is `TC0ONETIME`, API URL is `https://open-api.kakaopay.com`, sandbox mode is selected, and the existing nonempty secret is read server-side. The running API recognizes these settings; that response alone does not verify provider setup.
- The API process started on November 2 after the latest `.env` edit on October 29. An additional restart is not the fix for this domain rejection. No environment file was modified.
- The actual Next server responds over HTTP on port 3000; the API responds on port 3007. Configured callback origin is exactly `http://localhost:3000`. All three callbacks use `/orders/process`, the saved order reference and a private callback state, differing only by `kakaoReturn=approve`, `cancel` or `fail`. KakaoPay adds the actual `pg_token` on approval return. Callback state/tokens are not included in this report.
- Frontend environment/configuration does not receive the backend secret. The existing backend uses the official JSON ready/approve API with the `SECRET_KEY` authorization scheme; the saved TID, owner, order, amount and callback state remain bound. Test CID enforcement and production blocking remain unchanged. The key's application-console label cannot be independently inspected without account access.

In the KakaoPay Developers application that issued the existing **Secret key(dev)**, open **Application → Platform → Web → Site domains**, add exactly **`http://localhost:3000`**, and save. Do not register the backend port, `/orders/process`, query parameters or a trailing slash. The user confirmed saving this origin, but the subsequent browser attempt still returns the same domain-registration error and stores no TID/capture. The API launch environment has no inherited payment key/CID/origin override, and the configured key has the development prefix. No authenticated developer-console connection is available here to verify the saved Web entry and key-to-application association. Privately compare the existing key with that application's Secret key(dev) at `developers.kakaopay.com`, reload Platform → Web, and confirm the origin remains listed. If both match and persist, this needs provider-side investigation. Once the provider accepts registration, refresh the existing order and retry **Pay with KakaoPay**. Do not create another order. No domain-validation bypass is implemented. See [Web domain rules](https://developers.kakaopay.com/docs/getting-started/applications/platform) and [official single-payment contract](https://developers.kakaopay.com/docs/payment/online/single-payment).

Minimal changes in this increment (all paths already existed; none created or deleted):

| Tree | Modified paths | Purpose |
|---|---|---|
| Backend | `apps/gamenix-api/src/components/payment/direct-kakaopay.service.ts` and `.spec.ts` | Show the actual configured origin; distinguish missing/mismatched domain, callback URL, CID, amount, key, API permission, transport and documented approval errors using fixed safe messages. |
| Backend | `apps/gamenix-api/src/components/payment/direct-kakao-checkout.service.ts` and `.spec.ts` | Surface sanitized preparation/approval errors after preserving uncertainty and authoritative recovery. Keep same-order claims and no-repeat approval protection. |
| Frontend | `libs/components/payment/KakaoPayCheckout.tsx` | Replace the environment-based configured claim with “Continue to KakaoPay to request a test payment.” |
| Frontend | `public/locales/en/common.json`, `public/locales/kr/common.json`, `public/locales/ru/common.json` | Translate the neutral instruction without changing layout. |
| Frontend | `scripts/test-payments.cjs` | Check neutral wording for initial and ready states. |
| Documentation | Backend `docs/ai/DIRECT_KAKAOPAY_MIGRATION.md`, `COMPLETED_TASKS.md`, `BACKEND_MIGRATION.md`, `NEXT_STEPS.md`; frontend `docs/KAKAOPAY_SETUP.md` | Record runtime evidence, exact manual setup, scope and verification limits. |

Both trees were archived and every included file checksum verified before edits: `.tmp/kakaopay-config-backups/20261102T015417Z/` (254 backend / 368 frontend files, including private environment backups; excludes dependencies, Git internals, generated builds/caches and earlier backups). Existing OrderService, OrderItem, pricing, KRW, free delivery from ₩50,000, fulfillment, stock, points, roles and authentication remain untouched. No commit or push was created.

Validation for this increment: API and batch TypeScript PASS; API build PASS; frontend TypeScript, payment regressions and production build PASS (91 pages). Actual AppModule DI/schema and all 75 installed frontend GraphQL documents PASS, with zero database/provider connections in schema tests. The final focused payment suite passes 190 cases. Full-suite results and preservation checks are recorded in the newest completion entry. These are code checks; actual provider checkout, approval and successful return remain blocked by the missing Web registration.

The earlier sections below describe prior increments; their counts and saved-order states are historical.

## Current debugging result: provider rejects the callback domain

The real TEST ready API returns **HTTP400 / error_code -400** because the selected KakaoPay application has **no Web site domain registered**. The requested callback origin is `http://localhost:3000`. The exact provider message was inspected without printing the key, callback nonce or full token URL. Register this origin under the application that issued the dev key: **Platform → Web → Site domains**, then save. Use only scheme/host/port, with no path or trailing slash. [Official Web platform guide](https://developers.kakaopay.com/docs/getting-started/applications/platform).

The example saved order (KRW 428863) is PAUSE with one item at the correct server price; its payment is PENDING/UNCERTAIN with no TID and approval WAITING. The backend previously converted every ready rejection into this permanent state and hid the provider error. The frontend then blocked payment and polled a reference that could not be queried. GraphQL verification requests had no client deadline, so a held request could leave checking/manual controls locked indefinitely. Environment-variable presence was incorrectly shown as sandbox availability.

Current changes are limited to existing payment files. Backend: direct-kakaopay.service.ts/spec preserve safe typed provider status/code and mapped domain/key/API errors and accept the exact current sandbox hostname; direct-kakao-checkout.service.ts/spec distinguish definite rejection and fenced explicit same-record retry; payment.service.ts/spec project preparationRetryable/preparationError; payment.resolver.spec.ts validates those fields; libs/dto/payment/kakao-checkout.ts and libs/schemas/KakaoPayPayment.model.ts add the private preparation diagnostics/public retry projection and conditional callback rotation. No module, worker or payment provider was added.

Frontend: existing libs/payment/kakaopay.ts, KakaoPayCheckout.tsx, payment query/mutation documents and test-payments.cjs now use finite request/poll deadlines, AbortSignal and late-result guards; READY/retryable no-TID preparation is not automatically polled. Three locale dictionaries add six error/status messages. Current UI layout/classes and original order creation remain. Only backend-flagged unexposed preparations can retry; the server retains the same order/payment ID and immutable owner/shop/amount, rotates callback nonce/expiry under an atomic claim and rejects stale responses. Any saved TID, approval claim, capture, cancellation or returned checkout URL blocks this preparation-retry path. Uncertain approval/refund recovery still only queries the existing TID.

Validation: both backend TypeScript checks/builds PASS; 488 backend cases PASS/four opt-in DB cases SKIP (171 focused payment cases). Generated API DI/schema and all 75 frontend documents PASS. Frontend typecheck/build PASS (91 pages), payment/basket regressions PASS. Offline real React/Apollo/StrictMode checks confirm zero READY auto-verification, finite pending checks, and manual refresh enabled after a never-settling verification times out. Individual requests are bounded to 20 seconds; pending checks to ten calls/45 seconds. These offline checks do not prove a real provider payment.

Two actual ready diagnostics were definitively rejected; **no real checkout/QR/payment/approval/refund was completed**. No application records were changed by diagnostics, no provider success was simulated in the product, and the user must complete the external domain setup and provider UI. No production data/index operation or commit was performed. Backups: `.tmp/kakaopay-debug-backups/20261029-211634/` for both trees.

Installed-source verification: all ten reviewed frontend payment/document paths match their built source checksums, installed frontend TypeScript/payment regressions pass, and the running API exposes both retry/error projection fields. All 35 protected order/auth/member/environment files remain unchanged; Git HEAD/staging and secrets are preserved. Final scope is 14 backend and ten frontend source/document paths. The provider-domain registration question is still pending; no actual completed checkout/QR/payment/refund is claimed.

Earlier implementation history follows and is superseded where it conflicts with this diagnosis.

## Current instruction

The user clarified that the real backend environment contains KakaoPay's own development key and explicitly requested direct KakaoPay instead of PortOne, then requested continuation. This supersedes [PETORA_PORTONE_MIGRATION.md](PETORA_PORTONE_MIGRATION.md), which remains as a historical report.

Read the existing `KAKAOPAY_SECRET_KEY` only on the backend, keep `KAKAOPAY_CID=TC0ONETIME` and `KAKAOPAY_API_URL=https://open-api.kakaopay.com`, and do not print, copy, overwrite or commit the secret. No PortOne merchant/channel/V2 secret/independent proof transaction or SDK is required. The correct key name for this increment is `KAKAOPAY_SECRET_KEY`, not the earlier placeholder `KAKAOPAY_SECRET_KEY_DEV`.

## Backup and preservation

Both current working trees were archived and checksum-verified before this correction:

`.tmp/direct-kakaopay-backups/20261029-162620/`

The backups contain 181 backend and 364 frontend source entries, their manifests and staged/unstaged patches. Existing real environment files are protected by checksums and are not copied into source archives. Existing Order/OrderItem, fulfillment, shipping, stock, points, auth and historical payment data are outside the change scope. Historical PortOne claims stay read-only and cannot be bypassed by creating a new direct transaction for the same order. No data/collection/index cleanup is authorized.

## Direct flow

Reuse the earlier direct implementation within the existing NestJS payment module/service/resolver pattern:

1. Prepare an existing authenticated owner's saved single-shop KRW order using its backend item/total snapshots.
2. Claim preparation before calling `/online/v1/payment/ready`, persist its TID and official PC/mobile redirect URLs, and reuse the saved transaction on retries.
3. Return to the saved order with an opaque state and `pg_token`. Keep callback secrets ephemeral and clear them from browser/Next history before guest/loading/error states finish.
4. Authenticate the owner and verify saved state before a serialized `/approve` request. A repeated/uncertain approval is recovered by querying its saved TID rather than blindly issuing another charge.
5. Persist PAID only after `/order` matches the saved CID/TID/order/opaque owner/amount and full capture evidence. Browser callbacks, localStorage and fulfillment status cannot establish paid status.
6. Owner-requested full cancellation is kept separate from order fulfillment and confirmed through authoritative order lookup. Partial/uncertain results require status checks or manual review; they do not authorize a replacement charge.

Requests use JSON and `Authorization: SECRET_KEY <backend development key>` only against KakaoPay's official API host. Production/live execution remains disabled. No payment action advances PROCESS/FINISHED, deducts/restores stock, awards points or rewrites the existing order flow.

## Current setup

Use the existing environment; do not replace its secret with the blank example. Set or retain the three documented names above. Optional `KAKAOPAY_ENVIRONMENT=SANDBOX` and `KAKAOPAY_FRONTEND_ORIGIN` describe the development environment and callback origin. If the provider rejects the flow, check the selected KakaoPay application's Online Payment API, its Secret key(dev), and the exact origin registered in Platform → Web. No key should be requested in chat.

Detailed application/domain and checkout instructions: [frontend setup guide](../../../gamenix365-next/docs/KAKAOPAY_SETUP.md).

Official references: [one-time payments](https://developers.kakaopay.com/docs/payment/online/single-payment), [authentication](https://developers.kakaopay.com/docs/getting-started/api-common-guide/authentication), [order inquiry](https://developers.kakaopay.com/docs/payment/online/payment-detail), [cancellation](https://developers.kakaopay.com/docs/payment/online/cancellation), [Web platform](https://developers.kakaopay.com/docs/getting-started/applications/platform).

## File inventory for this correction

Backend source paths are relative to `apps/gamenix-api/src/`:

| Action | Paths | Purpose |
|---|---|---|
| Created | `components/payment/direct-kakaopay.service.ts`, `components/payment/direct-kakaopay.service.spec.ts` | Direct ready/approve/order/cancel HTTP API and test-only/secret/error boundary tests. |
| Created | `components/payment/direct-kakao-checkout.service.ts`, `components/payment/direct-kakao-checkout.service.spec.ts` | Durable owned-order ready/approval/capture/refund flow and focused concurrency/recovery tests. |
| Modified | `components/payment/payment.service.ts`, `components/payment/payment.service.spec.ts` | Reuse owned-order/server-price/history/index/status boundary without executing PortOne. |
| Modified | `components/payment/payment.resolver.ts`, `components/payment/payment.resolver.spec.ts`, `components/payment/payment.module.ts` | Direct-only DI and authenticated prepare/approve/status/verify/cancel operations. |
| Modified | `libs/dto/payment/kakao-checkout.ts`, `libs/schemas/KakaoPayPayment.model.ts` | Direct redirect response and compatible stored TID/callback/approval/refund evidence; existing records retained. |
| Deleted | `components/payment/portone.service.ts`, `components/payment/portone.service.spec.ts` | Remove superseded PortOne provider execution/tests. |

Frontend paths are relative to `../gamenix365-next/`:

| Action | Paths | Purpose |
|---|---|---|
| Created | `libs/payment/kakaopay.ts` | Direct provider URL selection, private callback parsing/cleanup and bounded status verification. |
| Modified | `libs/components/payment/KakaoPayCheckout.tsx`, `pages/orders/process.tsx`, `apollo/user/mutation.ts` | Existing checkout UI and saved-order return now call direct preparation/owner-bound approval/verification/cancellation. |
| Modified | `package.json`, `yarn.lock`, `scripts/test-payments.cjs` | Remove the PortOne SDK dependency and update offline direct-payment regressions. |
| Deleted | `libs/payment/portone.ts` | Remove the superseded PortOne SDK/helper path. |

The existing frontend query document file does not change. Documentation/example changes are `.env.example`, the seven current AI handoff files, this report, the historical banner on `PETORA_PORTONE_MIGRATION.md`, and the frontend `docs/KAKAOPAY_SETUP.md` / `docs/ai/COMPLETED_TASKS.md`. Only those two frontend documentation files require publication in addition to the eight frontend source/package/test paths. The real `.env` is unchanged.

## Validation for this correction

- API and batch TypeScript checks: PASS.
- `npm run build` and batch build: PASS.
- Complete backend Jest suite: **429 PASS / four opt-in database cases SKIP**, 16 passing suites. Includes **112 focused payment cases across four suites**.
- Actual AppModule dependency injection/schema: PASS, **31 queries / 47 mutations**. All **75 frontend GraphQL documents validate**. Ten missing/invalid-auth requests fail before data reads; five valid-owner operations use owner-scoped reads. Database/provider connections: zero.
- Frontend Node 20 + Yarn TypeScript, `scripts/test-payments.cjs`, `scripts/test-basket.cjs` and production build: PASS, **91 pages**. Coverage is offline component/payment regression plus the compiled build; no browser suite was run for this correction.
- Read-only recognition of the existing backend environment: `provider=DIRECT`, `enabled=true`, `blockers=[]`, `providerCalls=0`, `secretValuesDisplayed=false`. Actual environment contents remain unchanged. This proves the code recognizes the existing settings, not that KakaoPay accepted the credential or completed a transaction.

Earlier PortOne/direct browser and test totals describe older source states and are not used as evidence for this correction.

No real KakaoPay payment/refund, accepted-credential test, live database/index operation, production activation, commit or push is claimed by this report. Configuration presence alone does not prove key validity or provider success.

## Installed source and local runtime

The ten reviewed frontend source/document paths were installed into gamenix365-next after before/after and built-source checksum checks. The installed frontend TypeScript check passes. A read-only query to the running local API on port 3007 returns `provider=DIRECT`, `enabled=true`, `currency=KRW`, `blockers=[]`. This checks local configuration only; the query sends no request to KakaoPay and does not establish accepted credentials or a completed payment.

Final audit: 35 protected order/auth/member/environment files match the pre-correction checksums; no real secret was copied into changed files. Git HEAD and staging remain unchanged, and both repositories pass `git diff --check`. Source scope is 23 backend and ten frontend paths (including payment documentation). No application/production data or index mutation, real payment/refund, commit or push occurred.
