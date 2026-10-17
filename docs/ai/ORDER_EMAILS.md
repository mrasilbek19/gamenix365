# Order confirmation and status emails

Implemented on 2026-10-17 using the existing MailService and gamenix-batch application. There is no client-facing mail creation endpoint. OrderService queues mail only after successful order/item creation, after PROCESS stock/points work succeeds, or after a successful FINISHED transition. Same-status requests and failed operations do not queue additional events. Existing separate writes, stock, points, ownership, single-shop restrictions and PAUSE → PROCESS → FINISHED rules are preserved.

## Templates and data

`ORDER_CREATED` produces an order confirmation; `ORDER_STATUS_CHANGED` produces a status update. Both include the MongoDB order ID as the reference, product names, quantities, stored unit prices, line totals, stored shipping fee and stored total. USD formatting matches the storefront: `$12.34`, with two decimal places. PAUSE is labelled Received, PROCESS Processing, and FINISHED Finished. These states do not establish payment, shipping or delivery. Both templates explicitly say that order-processing status does not confirm payment.

Pickup shows pickup at the shop, a zero shipping fee, and no delivery address. Delivery includes the stored orderAddress. Product/reference/address HTML is escaped; a plain-text alternative is included. The explicit snapshot schema has no payment-card or unrelated member fields. No trusted payment model exists and none was added.

At its first attempt, the worker reads the owning order, orderItems and product names from MongoDB. Prices come from orderItems.itemPrice, never the current catalog price. It checks that item amounts plus shipping agree with the stored rounded orderTotal. Missing/inconsistent order data causes a retry rather than an incorrect confirmation. Current product names are frozen when the first snapshot is saved; existing OrderItem documents do not retain historical names. A removed product uses its product reference with “name unavailable”. Subsequent attempts use the saved snapshot, preserving the original retry content. The event's successful target status is retained even if the order has since advanced.

## Verified recipient policy

The API supplies the authenticated buyer ID, then loads that account's current private email from MongoDB. Only ACTIVE, nondeleted members with a valid verified email qualify. Missing, invalid or unverified addresses simply skip queue insertion; checkout still succeeds. Later verification does not backfill old events.

A delivery stores the verified recipient and private email version. Every attempt rechecks the same address/version, memberEmailVerified and current account eligibility. An email change, verification reset or deleted/blocked account changes the delivery to SKIPPED. The worker never redirects an old event to a new address. Recipients and snapshots remain private server data, absent from GraphQL/JWTs and application logs.

## Durable records

Collection: `emailDeliveries`. Fields include memberId, orderId, recipient, emailVersion, template, orderStatus, eventKey, state, attempts, nextAttemptAt, lockedUntil, lockToken, snapshot, sentAt, lastError and timestamps.

Server-generated keys are `order:<id>:created` and `order:<id>:status:<PROCESS|FINISHED>`. A unique eventKey index and setOnInsert upsert prevent repeated/concurrent triggers from creating another record or resetting sent/failed work. Startup waits for model/index initialization. Additional indexes support due work, expired leases and order history. No live application-data backfill or index migration was performed.

| State | Meaning |
|---|---|
| PENDING | Waiting for nextAttemptAt, including scheduled retries. |
| SENDING | Claimed with an expiring lease and random ownership token. |
| SENT | MailService transport accepted the message, or captured it in development/test. This does not prove mailbox delivery. |
| FAILED | Attempt budget exhausted. No automatic further delivery. |
| SKIPPED | The original verified recipient is no longer eligible. |

Only fixed generic failure codes are stored: DELIVERY_FAILED, RECIPIENT_CHANGED and ATTEMPTS_EXHAUSTED. SMTP credentials, provider errors and message contents are not logged.

## Batch worker and retries

The API awaits the small durable queue write; SMTP is entirely outside the order request. The shared OrderEmailModule has no timer. Only gamenix-batch registers OrderEmailWorker, polling every 30 seconds and claiming at most 20 records per poll. A local guard prevents overlapping polls; atomic MongoDB claims and ownership-token checks coordinate multiple batch processes.

There are at most five claimed attempts. Failures after attempts 1–4 are scheduled for 1, 5, 15 and 60 minutes later. Attempt 5 becomes FAILED. A five-minute lease permits recovery after worker crashes, including converting expired fifth-attempt leases to FAILED. The worker refreshes/checks ownership immediately before SMTP. Saved records and schedules survive restarts. A stable Message-ID derived from the delivery record is reused on retries.

SMTP acceptance and MongoDB acknowledgement are separate operations. A crash/timeout after acceptance can cause another delivery on recovery; the unique event key prevents intentional duplicate records, not every possible SMTP duplicate. A deterministic Message-ID helps identify duplicates but does not guarantee provider deduplication.

Queue persistence is also separate from marketplace writes, as required by the existing order policy. A crash/database failure between successful order work and queue insertion can leave no delivery record. Enqueue failures log a generic error and never reverse checkout. Do not automatically scan all PAUSE/PROCESS orders to repair this gap: existing separate-write failures can leave incomplete orders or a partially processed PROCESS state. Those cases need reviewed reconciliation.

## Runtime

Both apps must use the same intended MongoDB environment. The batch process needs the same MAIL_TRANSPORT, MAIL_FROM and SMTP_* configuration as Phase 2; see [EMAIL_VERIFICATION.md](EMAIL_VERIFICATION.md). Development/test capture remains available and production forbids capture. No .env or credentials were changed.

Build API with `npm run build` and batch with `npx nest build gamenix-batch`. Run development batch with `npm run start:dev:batch`; deploy/run production batch with `npm run start:prod:batch`, which now explicitly sets NODE_ENV=production. Keep the batch application running for deliveries/retries. No new dependency, queue broker or cron endpoint is required.

## Validation

- Full offline Jest run: 282 passing tests; 30 opt-in MongoDB cases skipped without explicit URIs.
- New order-mail MongoDB suite: all eight cases passed separately using the configured development connection only through a fresh `gx_order_mail_test_*` database. Exact-name cleanup dropped that database. Tests cover concurrent event-key upserts, competing workers, actual order/item prices, persisted retries, snapshot reuse, recipient resets, crashed leases, exhaustion, missing/unverified email. All messages were captured. The remaining 22 older MongoDB cases were not enabled in this task.
- Both app TypeScript checks with `--noEmit --incremental false`, API build and batch build passed.
- New offline tests cover pickup/delivery fees/totals, HTML escaping, template status semantics, MailService reuse, queue failure isolation, bounded retry delays, lease ownership, optional email, order/item/stock/points failures, repeated transitions, private persistence fields and module wiring.

To repeat the isolated suite, set ORDER_EMAIL_TEST_MONGO_URI to an approved development/test server and run `npx jest --runInBand apps/gamenix-api/src/components/order-email/order-email.integration.spec.ts`. The suite overrides the supplied database with a new test name and guards cleanup. No application records, real SMTP messages, frontend work or marketplace-rule changes were made.
