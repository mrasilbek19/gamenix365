# Google authentication — 2026-10-21

## Implementation

Adapted Petora's Google Identity Services interaction and OAuth2Client verification inside the existing Gamenix AuthService, MemberService and MemberResolver. No Passport module, OAuth worker or account-linking system. Frontend uses Google's official https://accounts.google.com/gsi/client script directly, rather than adding another React/UI library. loginAndSignupWithGoogle(input: GoogleLoginInput!) accepts only idToken. The server uses google-auth-library to verify Google signatures/audience/issuer/token times and requires nonexpired claims, a stable nonempty sub and verified valid email before accessing accounts.

Returning identities are looked up by private googleSubject, never email. New identities create USER/ACTIVE/GOOGLE accounts only, with a random 11-character Gamenix nickname, verified Google email and no password or phone. Existing local-email conflicts are rejected without merging. Existing ADMIN/SHOP, blocked, removed and deleted accounts cannot use the new Google path. Password signup cannot claim GOOGLE. The existing phone/nickname/password login and SHOP approval flows remain; Google-only username/password login returns an understandable Google-login message until the owner intentionally sets a real password through the existing profile update.

The schema declares an immutable, select:false googleSubject with a unique partial index for strings. Existing email/phone/nickname indexes remain. No data backfill, index cleanup, syncIndexes or live database action was run. Check deployment's normal Mongoose index creation and verify the new unique googleSubject index before enabling sign-in; source declarations/offline tests are not proof of deployed indexes. googleSubject/password/private email do not enter the existing JWT or GraphQL identity output. Member.phone stays a non-null string in GraphQL: the resolver returns an empty string for a Google account that has not added a real phone.

The official Google button is below the password submit button in both login/signup modes. Success sends the credential through Apollo, adopts Gamenix's existing JWT/reactive state, closes the header modal and keeps the current page. The direct join route retains its validated local referrer. Without a client ID, the button is visibly unavailable. Script/network/verification errors remain local; no token is logged or saved as a Google session.

## Google Cloud Console configuration required

1. Create/select the intended project in Google Cloud Console / Google Auth Platform.
2. Configure Branding (Gamenix365 name, support email, authorized domains and required app links). Set Audience appropriately; for External/testing add the Google accounts that will test the application.
3. In Clients, create an OAuth 2.0 client of type Web application.
4. Add the exact frontend origins to Authorized JavaScript origins. For the usual local frontend add http://localhost and http://localhost:3000; add any actual alternate frontend port/hostname you use. Add the exact HTTPS production origin before production use. Origins have no route/path. The 3021 test preview used during development is separate from normal deployment.
5. Set frontend NEXT_PUBLIC_GOOGLE_CLIENT_ID to that public web client ID in your ignored local/deployment environment. Set backend GOOGLE_CLIENT_ID to the exact same client ID. Restart the backend and restart/rebuild the frontend. No client secret is required by this popup ID-token flow; never expose a client secret through NEXT_PUBLIC values.
6. This implementation uses the GIS popup JavaScript callback. It does not require a custom redirect callback URL. If deployment adds CSP, allow the official GIS script/frame/connect endpoints as described by Google; if a restrictive Cross-Origin-Opener-Policy blocks non-FedCM popups, use Google's documented same-origin-allow-popups policy.
7. Verify the deployed unique subject/email indexes and test a new USER, returning USER, invalid credential, conflicting local-email account and blocked account. Do not enable automatic email linking.

Both Gamenix environment-file inspections found no configured Google client ID. No actual account consent/sign-in or live database creation was tested. Only the local preview process received a temporary fixture client-ID value; no environment file was edited and no reference-project credentials were copied.

## Evidence

24 focused offline Google cases use real RSA-signed JWTs and Google's actual verifyIdToken with intercepted certificate retrieval: valid signatures, forged signatures, malformed credentials, audience/issuer/expiration/future-issued-time failures, unverified email/missing subject, missing configuration, USER-only creation, stable-sub returning identity, private JWT fields, email conflicts, blocked/deleted/SHOP/ADMIN rejection, duplicate-subject race handling, passwordless login and conditional schema requirements/unique index declaration.

Isolated Chrome exercises the configured script/button callback using intercepted GIS and GraphQL fixtures: invalid credentials show errors, successful Gamenix JWT state closes the modal while preserving the current page. The unconfigured button and original modal/recovery tests also pass. These are fixture tests, not successful real Google authentication.

## Official references

- https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid
- https://developers.google.com/identity/gsi/web/guides/display-button
- https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
