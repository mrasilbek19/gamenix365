# SMTP email verification

> Historical implementation, superseded on 2026-10-20 by the Petora simplification. The custom system described below was removed; use the latest COMPLETED_TASKS and NEXT_STEPS for current behavior.

Implemented in the existing NestJS API architecture. Username/password login, SHOP approval, private email fields and optional-email legacy accounts remain unchanged. Password recovery is not implemented.

## Runtime and environment

Use Node 20 or newer. Nodemailer 10.1.2 and its TypeScript declarations are the only added dependencies. The older Node-compatible mailer release was rejected after npm reported security advisories. No machine-wide Node setting was changed.

| Variable | Behavior |
|---|---|
| NODE_ENV | Existing environment selector. Production forbids capture; test forbids SMTP. |
| MAIL_TRANSPORT | `capture` or `smtp`. Defaults to capture outside production and SMTP in production. |
| SMTP_HOST | Required SMTP hostname in SMTP mode; do not supply a connection URL. |
| SMTP_PORT | Integer 1–65535, default 587. Port 465 uses immediate TLS; other ports require STARTTLS. Certificate verification stays enabled. |
| SMTP_USER / SMTP_PASS | Required server-side SMTP credentials in SMTP mode. |
| MAIL_FROM | Plain sender email address; required in SMTP mode. Capture default: no-reply@gamenix365.test. |
| FRONTEND_ORIGIN | Single trusted origin, without a path/query/fragment/credentials. Production requires HTTPS. Outside production, loopback HTTP is allowed and defaults to http://localhost:3000. |
| EMAIL_VERIFICATION_TEST_MONGO_URI | Optional test-server URI. Integration tests override its database with a fresh gx_email_test_* database and drop only that exact generated database. |

Existing MONGO_DEV/MONGO_PROD and SECRET_TOKEN settings are unchanged. Never put SMTP credentials in frontend or NEXT_PUBLIC variables. The real .env was not modified.

Example configuration; replace placeholders locally:

```dotenv
MAIL_TRANSPORT=smtp
SMTP_HOST=smtp.your-provider.example
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
MAIL_FROM=no-reply@your-domain.example
FRONTEND_ORIGIN=https://your-frontend.example
```

For local development/tests use MAIL_TRANSPORT=capture. Capture uses Nodemailer's JSON transport without SMTP. The last 20 messages remain only in MailService memory and can be inspected with getCapturedMessages() in a test/debugger. No capture endpoint, token response or message/token logging is exposed. Restart/destruction clears captured messages. Invalid configuration fails startup; delivery errors return a generic error without provider credentials/content.

## GraphQL contract

Authenticated owner request, using the existing Bearer access token:

```graphql
mutation RequestEmailVerification {
  requestEmailVerification
}
```

There are no recipient, member ID or redirect arguments. The server reads the authenticated member's current email. ACTIVE accounts and PENDING SHOP accounts may request; blocked/deleted/ineligible accounts cannot. Missing email is an error. Already verified email returns true without sending again.

Verification does not require login; possession of the secret link is the proof:

```graphql
mutation VerifyEmail($input: VerifyEmailInput!) {
  verifyEmail(input: $input)
}
```

Variables have shape `{ "input": { "token": "64-character-lowercase-hex-token" } }`. Success returns true. Invalid, expired, reused, wrong-purpose or outdated-email grants return the same invalid-link error. Tokens never appear in mutation results or public Member fields.

## Token lifecycle and concurrency

The backend generates 32 cryptographically random bytes and stores only their SHA-256 hash in authTokens. Fields: memberId, purpose EMAIL_VERIFICATION, emailSnapshot, emailVersion, tokenHash, expiresAt and consumedAt. Indexes: unique tokenHash; TTL expiresAt; member/purpose/consumed lookup. Expiry is checked in queries independently of TTL cleanup.

Links always use the configured origin and fixed path `/account/verify-email#token=...`. The fragment keeps tokens out of normal web access logs/Referer headers. GraphQL request-body logging is suppressed for both new operations.

Startup checks MongoDB hello for replica-set/sharded transaction support and waits for the token model/index initialization. Unsupported topology fails closed; there is no nontransactional fallback. The development replica set was checked read-only before implementation. New real-MongoDB tests also exercised transactions successfully. Order/Event services and their transaction policies were not modified.

Request transactions serialize each account's resend budget, invalidate earlier verification grants and insert the new hash. Verification transactions conditionally consume an unexpired unused grant and update only memberEmailVerified for the matching member/current email/version. A failure rolls both writes back. Concurrent verification permits one successful consumption.

Explicit self/admin email submissions atomically reset verification and increment private memberEmailVersion. This invalidates older grants even if an address changes back to its previous value. Legacy missing versions mean zero; no migration or automatic verification is needed. Resubmitting the same address also invalidates previous grants, consistent with the existing verification-reset rule.

Private member state also stores resend time/window/count. It is not in GraphQL inputs/outputs or JWTs. Limits: 60-second resend cooldown and 5 emails/account/hour persisted in MongoDB; 20 request attempts/IP/15 minutes and 60 verification attempts/IP/15 minutes in bounded process memory. Email changes do not reset the account budget. Delivery failures consume budget and invalidate the failed grant.

IP limits use Express request.ip/socket address, not a client-provided forwarded header. They are per API process; account limits are shared through MongoDB. Multiple instances need a shared edge/IP limiter, and proxy trust must be deliberately configured before using forwarded client addresses.

## Frontend integration later

1. Keep existing memberNick/password login. Add email editing with the existing updateMember mutation where current approval/status rules allow it.
2. After signup/login, use the returned access token to fetch the owner's memberEmail/memberEmailVerified through the existing getMember query.
3. Add a request/resend button calling requestEmailVerification; display cooldown/limit errors without exposing other accounts.
4. Add `/account/verify-email`. Read token from URL hash, immediately clear the fragment from browser history, and call verifyEmail once. Do not put it in analytics, logs or localStorage.
5. Render success or invalid/expired-link state. Refetch the owner profile when authenticated.

Pending shops remain pending after verification. Existing ACTIVE-only profile editing remains unchanged. No frontend files or page were implemented in this backend phase.

## Validation

Validated under installed Node 20.19.0: API/batch TypeScript checks, API build, and 242 passing tests across eight suites. This includes 61 new tests: 43 offline mail/config/GraphQL/privacy/module/abuse checks and 18 real MongoDB cases for token/index behavior, expiry/purpose/reuse, email-change invalidation, cooldown/hourly limits, missing email, approval, concurrent consumption/resends, rollback and delivery failure. Four older opt-in MongoDB tests were skipped because MEMBER_TEST_MONGO_URI was unset.

The final run enabled EMAIL_VERIFICATION_TEST_MONGO_URI in process memory using the development cluster connection; it created/dropped a fresh gx_email_test_* database only. Application records, SMTP credentials and environment files were untouched. All mail was captured; real SMTP authentication/delivery and the future frontend page remain unverified.

Reproduce offline checks with `npm test -- --runInBand --silent`. Enable the new isolated integration suite with EMAIL_VERIFICATION_TEST_MONGO_URI set to an approved test server; do not use a production connection. Typecheck both apps with `--noEmit --incremental false`; build with `npm run build` under Node 20+.
