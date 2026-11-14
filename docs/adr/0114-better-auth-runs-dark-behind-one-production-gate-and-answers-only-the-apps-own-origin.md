# Better Auth runs dark behind one production gate and answers only the app's own origin

Status: Accepted · Ticket #680 (ticket 0 of #554) · Builds on
[ADR 0094](./0094-better-auth-owns-login-and-is-the-mcp-authorization-server.md)
§1–§2 · Backed by a probe of `better-auth@1.7.12`, `@better-auth/core@1.7.12`
and `@better-auth/passkey@1.7.12` (the published `dist/` files, read
2026-11-07).

## Context

ADR 0094 puts Better Auth beside Epic's login for several tickets before the
cutover. During that time Better Auth is configured, migrated and tested, and no
athlete may reach it. Four things in the pinned version make "mounted but dark"
harder than it looks:

- Better Auth checks a request's `Origin` only when the request carries a
  cookie, and skips the check altogether when `NODE_ENV` is `test`
  (`context/create-context.mjs`, `skipOriginCheck: … isTest() ? true : false`).
  A cookie-less, cross-site `POST /api/auth/sign-up/email` passes, and a test of
  the origin rule passes whether or not the rule exists.
- It refuses its built-in default secret only in production, so constructing the
  `auth` object in production before `BETTER_AUTH_SECRET` is set throws at boot.
- `user.additionalFields` are writable from the client (sign-up, update-user)
  unless the field says `input: false`.
- `AuthVerification` rows have no foreign key to `User`. They name their user
  inside `identifier` (`sign-in-otp-<email>`) or `value` (the user id, or JSON
  that holds it), so a `User` cascade misses them and a schema walk over foreign
  keys does not see the table.

## Decision

1. **One gate, in code, with no switch.** The resource route for `/api/auth/*`
   answers 404 when `NODE_ENV` is `production`, before it imports the module
   that constructs `auth`. Production never constructs Better Auth, so it needs
   no `BETTER_AUTH_SECRET` until the cutover. There is no environment flag to
   turn it on: only the cutover PR, which deletes the gate, makes Better Auth
   reachable in production. Nothing else that runs in production (export,
   erasure) imports the `auth` object; it reads the tables through Prisma.
2. **The route refuses a foreign `Origin` itself.** Any request other than
   `GET`, `HEAD` or `OPTIONS` whose `Origin` header is not the app's own origin
   gets 403 before `auth.handler` sees it, cookie or not. A request with no
   `Origin` (a server-to-server call, such as Phase 2's token endpoint) goes on
   to Better Auth's own checks. `advanced.disableOriginCheck` is set to `false`
   explicitly, so tests run the same check production does.
3. **The app's own origin is configured, never read from the request.** One
   value, `APP_ORIGIN` (the constant ADR 0094 §9 already names), feeds
   `baseURL`, `trustedOrigins`, and the passkey plugin's `rpID` (its hostname)
   and `origin`. A passkey is bound to its RP ID for life, so `APP_ORIGIN`'s
   host in production must be the host Epic registers passkeys under today, or
   every migrated passkey stops working at the cutover.
4. **Sign-up is closed in the configuration from the start.**
   `emailAndPassword.disableSignUp`, `emailOTP`'s `disableSignUp` and the GitHub
   provider's `disableImplicitSignUp` are all `true`. #554's verify-first
   sign-up is built on top of a closed configuration, never by closing an open
   one.
5. **Flags Better Auth must not let a client set are `input: false`.**
   `mustReenrolTwoFactor` is a `user.additionalFields` entry with
   `input: false`, so no sign-up or update-user body can clear it.
6. **The configured tables are the list, for export and erasure.** The export
   test takes its tables from the foreign-key walk **and** from Better Auth's
   own `getAuthTables(authOptions)`, so a plugin or upgrade that adds a table
   fails the test until the export carries it or names why not. Each auth table
   is exported through a `select` allow-list, never an `omit` list, so a new
   secret column stays out by default. Erasure deletes `AuthVerification` rows
   by what names the user (their id in `value`, their email in an email-code
   `identifier`, and the two-factor rows keyed off a row that holds their id),
   in `deleteAccount`'s transaction, with a test per flow that writes such a
   row; an upgrade that changes a format fails that test.

## Considered options

- **An environment flag (`BETTER_AUTH_ENABLED`) instead of the `NODE_ENV`
  gate.** Rejected: a Fly secret could then make the auth API live in production
  without a reviewed change, and it would be a second login live beside Epic,
  which ADR 0094 §1 rules out.
- **Relying on Better Auth's origin check.** Rejected: it lets cookie-less
  requests through and is off in tests (above).
- **Inferring the origin from the `Host` header**, as `getDomainUrl` does for
  Epic today. Rejected: a header the client sends would decide `baseURL`, the
  links in emails and the passkey RP ID.
- **Leaving `AuthVerification` rows to expire** (all expire within an hour).
  Rejected: erasure would hold an email address after the account is gone, and
  ADR 0105 lists verifications as deleted with the account.

## Consequences

- The cutover PR deletes the gate, sets `BETTER_AUTH_SECRET` and `APP_ORIGIN` as
  required in production, and keeps the origin check.
- End-to-end tests that run the production build (`start:mocks`) cannot reach
  `/api/auth` until the cutover; the dark tickets test through Vitest.
- Epic's own `Verification` rows have the same gap today, which ADR 0105's
  retention table does not mention: they have no foreign key and survive erasure
  until they expire. They are dropped with Epic's tables (#554, ticket 5).
