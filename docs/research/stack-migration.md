# Stack migration for trainm8: Better Auth first, then MCP, then Postgres, then Drizzle

Where trainm8's stack should end up now that the owner has opened it, and in
what order to get there: Epic Stack auth → Better Auth, MCP OAuth on top of it,
SQLite/LiteFS → Postgres (Neon, Fly Managed Postgres or Supabase), and Prisma →
Drizzle. Ends with a phased plan, a migration risk register and the ADRs the
move would reopen.

> **Research note · 2026-10-11.** Written from **primary sources**: the Better
> Auth, Drizzle, Neon, Fly.io, Supabase, Prisma and PostgreSQL documentation;
> the published npm tarballs of `better-auth`, `@better-auth/mcp`,
> `@better-auth/cimd`, `@better-auth/oauth-provider`, `@better-auth/passkey`,
> `@better-auth/prisma-adapter`, `@better-auth/utils` (all 1.7.7, utils 0.4.2)
> and `drizzle-orm@1.0.0-rc.5-5935859`; and the npm registry (`npm view`,
> 2026-10-11). The trainm8 side is **this repository at commit `33c10f5`**. A
> verification pass the same day re-ran every count with `grep`, rebuilt a
> SQLite database from the 58 migrations to count live constraints and date
> formats, re-read the tarball lines cited, and re-fetched the docs pages: 88
> checks, 64 held, 17 were corrected or softened in place, and 7 claims stay
> unverified (§10).
>
> **Sibling documents.** [`agent-platforms.md`](agent-platforms.md) ranks the
> **target end state**;
> [`agent-native-open-stack.md`](agent-native-open-stack.md) argues for
> **sequencing** the moves; [`agent-native.md`](agent-native.md) (the
> framework); [`mcp-server-for-trainm8.md`](mcp-server-for-trainm8.md) (the
> **MCP note**: OAuth checklist §3, phases §9);
> [`agent-layer-building-blocks.md`](agent-layer-building-blocks.md) (libraries,
> zod plan); [`agent-layer-trainm8-surface.md`](agent-layer-trainm8-surface.md)
> (write paths and safety rails).

**How claims are cited.** Repo claims are `path:line` at `33c10f5`. **npm** is
the registry on 2026-10-11. **pkg `name@ver` `file:line`** is a line of the
published tarball. External claims link the page that owns them. **(inference)**
marks this note's reasoning. Every effort figure is inference, for one developer
who knows the repo, in the MCP note's §9 units.

---

## TL;DR

- **Target end state: agent-native's stack minus the framework.** React Router
  8, Postgres in the EU, Drizzle, Better Auth (passkey, 2FA, `mcp` + `cimd`) and
  trainm8's own action registry. That is rank 1 in
  [`agent-platforms.md`](agent-platforms.md) §9 and matches agent-native's own
  layers ([`agent-native.md`](agent-native.md) §2.2). The owner has opened the
  stack: _"we're happy to move to Drizzle, Neon or similar, Better Auth — we're
  not locked to anything."_
- **Order: Better Auth → MCP OAuth → Postgres → Drizzle.** The auth layer, not
  the database, is on MCP's critical path. Better Auth's MCP server needs Better
  Auth to own the login session. It does not need Postgres: the Prisma adapter
  accepts `provider: "sqlite"` (pkg `@better-auth/prisma-adapter@1.7.7`
  `dist/index.d.mts:9`).
- **Postgres waits for a trigger:** a second machine, point-in-time recovery,
  preview databases, or wanting off LiteFS. **Drizzle waits for its 1.0 GA.**
- **The owner's intuitive order (Postgres + Drizzle first) delays MCP OAuth by
  9–15 weeks.** It lands at 13–22 weeks instead of 4–7, and the start date
  depends on Drizzle shipping 1.0. It saves only re-pointing Better Auth at a
  Drizzle adapter later, a few days of work (§1.3).
- **Better Auth 1.7.7 covers almost all of the MCP note's §3 checklist:** PRM
  (RFC 9728), S256-only PKCE, `resource` → `aud`, RFC 9207 `iss`, rotating
  refresh tokens with family revocation, and CIMD behind an SSRF-hardened
  fetcher. DCR is opt-in. One conflict remains: the docs say `legacy: "reject"`,
  but trainm8 must serve both MCP protocol eras (§4.4).
- **Drizzle 1.0 is not GA.** `latest` is `0.45.4` (2026-10-08). `@rc` installs
  `1.0.0-rc.4` (2026-06-27); the newest RC build is `1.0.0-rc.5-5935859`
  (2026-09-09). 1.0 removes RQB v1, `journal.json` and the 0.x Prisma bridge.
- **Region: neither Neon nor Fly MPG has Stockholm.** Either one means moving
  the app from `arn` to `fra`. Supabase offers `eu-north-1` (Stockholm) (§5.1).
- **Postgres changes semantics, not just syntax.** Read Committed can let the
  quick-log claim (`app/utils/strength-quick-log.server.ts:189-197`) and the
  one-open-ended-plan check pass twice (inference). There are 59 transactions to
  audit, 63 live CHECK constraints to port (95 written across migrations),
  integer-ms dates with 92 text values mixed in, and 1,734 SQLite-only
  `INSERT OR IGNORE` corpus statements.
- **Users:** 2FA users re-enrol, because the TOTP secret formats differ, and
  everyone signs in once. bcrypt hashes, passkeys and GitHub links migrate.
  Better Auth does not gate passkey or GitHub sign-in with 2FA by default; Epic
  does.

---

## 1. The consolidated position

### 1.1 Target end state

| Layer            | Today                                                    | Target                                                                  |
| ---------------- | -------------------------------------------------------- | ----------------------------------------------------------------------- |
| Router / server  | React Router `^7.13.0` on Express 5 (`package.json:109`) | React Router 8 (8.0.0 on 2026-06-17, `latest` 8.4.0, npm), same Express |
| Database         | SQLite on LiteFS 0.5.11, `arn` (`fly.toml:2`)            | Postgres in an EU region (§5.1)                                         |
| ORM              | Prisma `^6.19.2` (`package.json:62,105`)                 | Drizzle 1.x                                                             |
| Auth             | Epic Stack: own sessions, bcrypt, TOTP, SimpleWebAuthn   | Better Auth: `username`, `emailOTP`, `twoFactor`, `passkey`, `admin`    |
| MCP authz server | none (MCP note §3.3 proposed node-oidc-provider)         | `@better-auth/mcp` + `@better-auth/cimd` + `jwt()`                      |
| Agent surface    | route actions                                            | trainm8 `defineAction` registry (proposed ADR 0092, MCP note §8.4)      |

This is agent-native's stack (React Router 8.1, Postgres only, Drizzle, Better
Auth 1.7.6; [`agent-native.md`](agent-native.md) §2.2) without Nitro and without
its public-shell SSR rule. Borrowing its code or adopting it at 1.0 stays cheap
([`agent-platforms.md`](agent-platforms.md) §8A, §9).

### 1.2 The order, and why

1. **Better Auth on today's Prisma + SQLite.** MCP's consent page runs on a
   Better Auth session: the `oauth2Consent` endpoint "requires session cookies",
   and a user who is not signed in is sent to the login page
   ([oauth-provider](https://www.better-auth.com/docs/plugins/oauth-provider)).
   Epic's `en_session` cookie (`app/utils/session.server.ts:3-12`) is invisible
   to Better Auth (inference). So the login moves first.
2. **MCP OAuth via `@better-auth/mcp` + `cimd`.** This is the MCP note's §9
   Phase 1 with the authorization server bought rather than built.
3. **Postgres, still on Prisma, when a trigger fires:** a second machine, PITR,
   preview DBs, or wanting off LiteFS. Fly's LiteFS page says "We are not able
   to provide support or guidance for this product. Use with caution." and "The
   project is still pre-1.0 so APIs may change and features could be removed"
   ([Fly LiteFS](https://docs.fly.io/litefs)). trainm8 runs it as a static,
   single-node lease (`other/litefs.yml:17-29`), where it adds little.
4. **Drizzle after 1.0 GA**, optional: once on Postgres, module by module.

React Router 8 and zod 4 move on their own schedule. MCP SDK v2 needs zod ≥ 4.2
anyway ([`agent-layer-building-blocks.md`](agent-layer-building-blocks.md)
§9.3).

### 1.3 What the owner's intuitive order costs

The intuitive order is to build the foundation first: Postgres + Drizzle, then
Better Auth, then MCP. Effort comes from §7.

| Milestone               | Recommended order           | Postgres + Drizzle first                           |
| ----------------------- | --------------------------- | -------------------------------------------------- |
| Better Auth live        | weeks 3–5                   | weeks 12–20                                        |
| MCP OAuth with Claude   | **weeks 4–7**               | **weeks 13–22**                                    |
| Earliest start          | now                         | Drizzle 1.0 GA (no date), or start on an RC (§6)   |
| Auth tables created     | once in SQLite, then copied | once, in the final dialect                         |
| Rework the order avoids | —                           | the Drizzle schema for Better Auth's tables, ~days |

- **The delay is 9–15 weeks** (Phases 3 + 4) before any MCP value (inference).
- **The saving is small.** Phase 1 is DB-agnostic. Better Auth's tables move to
  Postgres with the bulk data copy, and `drizzle-kit pull --init` generates
  their Drizzle schema with everything else
  ([pull](https://orm.drizzle.team/docs/drizzle-kit-pull)). Switching the
  adapter is a config change over the same tables (inference).
- **Building the MCP authorization server on node-oidc-provider instead** costs
  L, ~2–4 weeks (MCP note §9 Phase 1). That is quicker today, but the work is
  thrown away when Better Auth arrives.

---

## 2. Component decisions

| Component            | Keep vs switch                                   | Gain                                                                                   | Cost                                                                            | Risk                                                    | Recommendation                                                                              |
| -------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Auth**             | Epic Stack → Better Auth                         | Maintained passkey, 2FA, OTP and admin flows; the path to MCP OAuth                    | ~3–5 weeks; 39 files rewritten; 2FA re-enrolment; one forced sign-in            | Login regressions; breaking minors; 2FA gating gap (§8) | **Switch now**, on Prisma + SQLite                                                          |
| **MCP authz server** | build on node-oidc-provider → `@better-auth/mcp` | PRM, CIMD + SSRF-hardened fetch, S256, `aud`, RFC 9207, rotation, `insufficient_scope` | ~1–2 weeks after Auth                                                           | Young 1.7 API (2026-08-18); `legacy: "reject"` advice   | **Better Auth**, right after Phase 1                                                        |
| **Database**         | SQLite/LiteFS → Postgres                         | PITR, more machines, preview branches, external tooling, off LiteFS                    | ~3–5 weeks plus a cutover window; $19–38/month (§5)                             | Concurrency, dates, cutover outage, latency             | **On a trigger** (§1.2)                                                                     |
| **Host / region**    | Fly volume in `arn` → Neon / Fly MPG / Supabase  | Neon: branching, history. Fly MPG: private network, HA. Supabase: Stockholm            | Neon / Fly MPG move the app to `fra`                                            | A vendor in the critical path                           | **Neon `aws-eu-central-1` + app in `fra`** by default; Supabase if Stockholm matters (§5.1) |
| **ORM**              | Prisma 6 → Drizzle                               | SQL-shaped queries, CHECKs and partial indexes in the schema, `drizzle-orm/zod`        | ~6–10 weeks: 114 files, ~665 calls, 59 transactions                             | RC churn; two ORMs during the move                      | **After 1.0 GA**, after Postgres. Upgrade Prisma 6 → 7 inside Phase 3                       |
| **Router**           | React Router 7 → 8                               | Target stack parity                                                                    | Not sized here                                                                  | —                                                       | Own schedule                                                                                |
| **Cache**            | `cache.db` on LiteFS → local file or LRU only    | One less replicated file                                                               | Trivial: one `cachified` call site (`app/utils/providers/github.server.ts:108`) | —                                                       | With Phase 3                                                                                |

---

## 3. Repo inventory

### 3.1 Prisma and SQLite footprint

| Item              | Count / fact                                                                                                                                             | Where                                                                     |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Datasource        | `sqlite`; `prisma-client-js` with `previewFeatures = ["typedSql"]`, but `prisma/sql/` holds only `.gitkeep`                                              | `prisma/schema.prisma:4-11`                                               |
| Models            | **56** models, 0 enums, 102 `DateTime` fields                                                                                                            | `grep -c '^model '`                                                       |
| Migrations        | **58** directories, 6,377 lines of SQL; 23 use the `PRAGMA` table-rebuild pattern                                                                        | `prisma/migrations/`                                                      |
| Client users      | **114** non-test files import `db.server` (40 under `app/routes`), ~44.5k LOC; 38 files import `@prisma/client`                                          | `grep -l`                                                                 |
| Query shape       | ~665 model calls, 614 `select: {`; 7 `P2002` handlers                                                                                                    | e.g. `app/utils/plan-outline/authoring.server.ts:384`                     |
| Transactions      | **59** interactive `$transaction(` sites (58 in `app/utils`, 18 of them in `plan-outline/authoring.server.ts`; 1 in `settings/profile/photo.tsx`)        | `grep -rn`                                                                |
| CHECK constraints | **95** `CHECK (` clauses written across 11 migrations; table rebuilds repeat them, so **63 are live**, on 21 tables                                      | DB rebuilt from the 58 migrations                                         |
| SQLite-only SQL   | `lower(hex(randomblob(16)))`; `json_each` / `json_extract`; **1,734 `INSERT OR IGNORE`** statements (1,656 in the exercise corpus)                       | `…20260808173119…:54`, `…20260817140000…:72-81`, `…20260818120000…:65-68` |
| Dates             | Prisma stores `DateTime` as integer epoch ms. 92 values are text: `ExerciseVariant.createdAt/updatedAt`, written with `CURRENT_TIMESTAMP` by a migration | `…20260814120000…/migration.sql:338-363`                                  |
| Case semantics    | Catalogue search uses `contains`; SQLite `LIKE` is case-insensitive for ASCII, Postgres is not without `mode: 'insensitive'`                             | `app/utils/catalogue.server.ts:181`                                       |

The date finding comes from a database rebuilt from the 58 migrations and from
the local backup `prisma/data.db.bak-20260819083410`. Both hold the same 92 text
values, and every other date is an integer. Production ran the same migrations,
so it holds them too (inference).

### 3.2 Tests

- **One SQLite file per Vitest worker, copied from `base.db` before each test**
  (`tests/setup/db-setup.ts:12,33`); `VITEST_DB_TAG` isolates parallel agents
  (`:7-11`). `base.db` comes from
  `prisma migrate reset --force --skip-seed --skip-generate`
  (`tests/setup/global-setup.ts:27-28`).
- **~123 of 330 test files touch the DB** (`grep -l`); the suite is "DB-heavy"
  (`vite.config.ts:79`).
- **SQLite-only tests:** a `CREATE TRIGGER … RAISE(ABORT …)`
  (`app/utils/strength-quick-log.server.test.ts:607`); three that execute SQLite
  migration files (`app/utils/plan-outline/constraints.test.ts:39`,
  `stamp.server.test.ts:703`, `app/utils/exercise-seed.server.test.ts:358`);
  integer date arithmetic in SQL (`stamp.server.test.ts:715`).
- **CI resets with `npx prisma migrate reset --force`**
  (`.github/workflows/deploy.yml:107`) and deploys only staging and production,
  with no preview apps (`deploy.yml:170-208`).

### 3.3 LiteFS and Fly

- Region `arn` (`fly.toml:2`), a `/litefs/health` check (`fly.toml:61`), LiteFS
  0.5.11 as the CMD (`other/Dockerfile:90-96`) with `fuse3` (`Dockerfile:10`).
- `other/litefs.yml`: static lease (`:29`), `prisma migrate deploy` (`:34`), WAL
  via `sqlite3` (`:38-42`), `prisma generate --sql` at every boot (`:46`).
- **7 files import `app/utils/litefs.server.ts`:** `app/entry.server.tsx`,
  `app/utils/cache.server.ts`, four under `app/routes/admin/cache/`, and the
  GitHub callback's `ensurePrimary()`
  (`app/routes/_auth/auth.$provider/callback.ts:34`).

### 3.4 Auth in use (Epic Stack)

| Feature         | Implementation                                                                                                                                                                                                              |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session         | Signed cookie `en_session` → `Session` row, 30 days (`app/utils/session.server.ts:3-12`, `app/utils/auth.server.ts:14`)                                                                                                     |
| Password        | `bcryptjs` (`auth.server.ts:242-260`); login by **username** (`app/routes/_auth/login.tsx:30`)                                                                                                                              |
| Email codes     | `generateTOTP` with SHA-256 and a 6-char alphabet without 0/O/I (`app/routes/_auth/verify.server.ts:90-95`)                                                                                                                 |
| TOTP 2FA        | `generateTOTP()` defaults (`app/routes/settings/profile/two-factor/index.tsx:30`): SHA-1, 6 digits, 30 s, a base32 secret of 10 random bytes (`@epic-web/totp` 4.0.1 `index.js:19-23,170-173`)                              |
| 2FA enforcement | Password, GitHub and passkey sign-in all go through `handleNewSession`, which checks for a `2fa` verification (`app/routes/_auth/login.server.ts:17-45`; `auth.$provider/callback.ts:196`; `webauthn/authentication.ts:85`) |
| Passkeys        | `@simplewebauthn/server` (`package.json:70`), `Passkey` model (`prisma/schema.prisma:153`)                                                                                                                                  |
| GitHub          | `remix-auth` 4 + `remix-auth-github` 3 (`package.json:110-111`), `Connection` model (`schema.prisma:139`)                                                                                                                   |
| Roles           | Only `requireUserWithRole(request, 'admin')`, 6 sites in `app/routes/admin/`; the permission helpers have no other callers                                                                                                  |
| Surface         | **39 files, ~4.7k LOC**: 18 in `app/routes/_auth/`, 10 in `app/routes/settings/profile/` (password, passkeys, connections, change-email, two-factor), 11 in `app/utils/`                                                    |
| Seam            | **72** non-test files reference `getUserId` / `requireUserId` (`auth.server.ts:29-66`), 70 outside `auth.server.ts` and `permissions.server.ts`                                                                             |

---

## 4. Better Auth

### 4.1 Versions and churn

- **npm:** `better-auth` **1.7.7** (2026-09-30); a maintained `release-1.6` line
  (1.6.33, 2026-09-14). `@better-auth/mcp`, `cimd`, `oauth-provider`, `passkey`
  and `prisma-adapter` are all 1.7.7.
- **Dependencies (npm):** `zod ^4.5.4` is a normal dependency. Peers include
  `@prisma/client ^5 || ^6 || ^7` and
  `drizzle-orm ^0.45.2 || >=1.0.0-rc.1 <2.0.0`.
- **v1.7.0 (2026-08-18) broke a lot in a minor release**
  ([release](https://github.com/better-auth/better-auth/releases/tag/v1.7.0)):
  "Removed the deprecated `oidcProvider` plugin"; moved MCP into
  `@better-auth/mcp` (`withMcpAuth` → `requireMcpAuth`); "`oauthApplication`
  becomes `oauthClient`"; "Accounts now require `Account.issuer`"; and changed
  `enableTwoFactor`, resource binding and error redirects.
- **`@better-auth/mcp`** has been on npm since 2026-01-14 (`1.5.0-beta.7`, 25
  versions). Its current, OAuth-provider-based API dates from 1.7.0.

### 4.2 Feature mapping

| trainm8 feature (§3.4) | Better Auth                                                                                                                                                                                                                                                            | Gap                                                                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Session in DB          | `session` table (`id`, `token`, `userId`, `expiresAt`, `ipAddress`, `userAgent`); "expires after 7 days by default"; `session.cookieCache`; `auth.api.getSession({ headers })` ([sessions](https://www.better-auth.com/docs/concepts/session-management))              | Re-implement `getUserId` on `getSession`; the 70 callers stay untouched (inference)                                                           |
| Username + password    | `username` plugin; passwords in `account` with `providerId: "credential"`; `password.hash` / `verify` overridable                                                                                                                                                      | Keep bcrypt hashes behind a bcrypt `verify` (inference)                                                                                       |
| Email codes            | `emailOTP`: 6 digits, 300 s, 3 attempts, `storeOTP` plain by default; sign-in auto-registers unless `disableSignUp`; change-email "disabled by default" ([email OTP](https://www.better-auth.com/docs/plugins/email-otp))                                              | Numeric codes; no link in the same email (decision 013); onboarding must be re-flowed                                                         |
| TOTP 2FA               | `twoFactor`: TOTP, OTP, backup codes, trusted device "for 30 days" ([2FA](https://www.better-auth.com/docs/plugins/2fa))                                                                                                                                               | Gates only credential sign-in (§8 R5). "By default, enabling 2FA requires a password"; GitHub- or passkey-only users need `allowPasswordless` |
| Passkeys               | `@better-auth/passkey`, "powered by SimpleWebAuthn", conditional UI ([passkey](https://www.better-auth.com/docs/plugins/passkey))                                                                                                                                      | `publicKey` stored base64 (pkg `@better-auth/passkey@1.7.7` `dist/index.mjs:386`); lookup by `credentialID` (`:466`)                          |
| GitHub                 | Built-in social provider; `account` keyed on `(issuer, accountId)` since 1.7.0                                                                                                                                                                                         | Replaces `remix-auth`                                                                                                                         |
| Roles                  | `admin` plugin                                                                                                                                                                                                                                                         | `requireUserWithRole('admin')` maps directly; drop the unused `Permission` table (inference)                                                  |
| Mounting               | Resource route `api.auth.$.ts` whose `loader` and `action` return `auth.handler(request)` ([React Router](https://www.better-auth.com/docs/integrations/react-router))                                                                                                 | Runs inside the existing Express + React Router server                                                                                        |
| Prisma adapter         | Types accept `"sqlite" \| "cockroachdb" \| "mysql" \| "postgresql" \| "sqlserver" \| "mongodb"` (pkg `dist/index.d.mts:9`). The CLI "updates your Prisma schema but does not apply the migration" ([Prisma adapter](https://www.better-auth.com/docs/adapters/prisma)) | The docs page shows only `"postgresql"`; `sqlite` rests on the types                                                                          |

### 4.3 The OAuth provider, the MCP plugin and CIMD

**`@better-auth/oauth-provider`**
([docs](https://www.better-auth.com/docs/plugins/oauth-provider)):

- "By default, PKCE is required for all clients"; public clients always;
  "`code_challenge_method: "plain"` will not be supported". Discovery advertises
  `code_challenge_methods_supported: ["S256"]` (pkg `oauth-provider@1.7.7`
  `dist/authorize-K1WHCNih.mjs:725`).
- "sending `resource` results in a JWT access token with the selected resource
  in the `aud` claim" (RFC 8707).
- "All authorization responses (success and error) include the `iss` parameter"
  (RFC 9207); `authorization_response_iss_parameter_supported: true` (`:726`).
- "issues a new refresh token for every refresh request"; after the reuse
  interval, the old token "is treated as replay and invalidates the
  refresh-token family". The provider's own default interval is `0`.
- DCR needs `allowDynamicClientRegistration: true`; registration without a
  Better Auth session additionally needs
  `allowUnauthenticatedClientRegistration: true`.
- "a JWT `access_token` cannot be revoked individually".
- Defaults: code 600 s, access token 3600 s, refresh token 30 days
  (`:4201-4204`).

**`@better-auth/mcp`** ([docs](https://www.better-auth.com/docs/plugins/mcp)):

- `mcp({ resource, loginPage, consentPage })` "is the OAuth provider" and
  "cannot be combined with a separate" `oauthProvider` (pkg `mcp@1.7.7`
  `dist/index.d.mts:84-104`). "The JWT plugin is required".
- PRM is "served automatically at the well-known root" plus a
  resource-path-inserted alias.
- `refreshTokenReuseInterval` defaults to 30 s, "allowing a retried refresh to
  recover a rotated response".
- "MCP deprecates Dynamic Client Registration (DCR), so Better Auth never
  enables DCR implicitly."
- `requireMcpAuth(auth, handler, { requiredScopes })` answers 401 with an RFC
  9728 `WWW-Authenticate`, or 403 `insufficient_scope` "naming every missing
  scope" (`dist/index.d.mts:150-197`).
- Tables: `oauthClient`, `oauthAccessToken`, `oauthRefreshToken`,
  `oauthConsent`, `oauthClientAssertion`.
- **Transport advice:** "Configure servers with `legacy: "reject"`", accepting
  "only the MCP 2026-07-28 protocol".

**`@better-auth/cimd`** ([docs](https://www.better-auth.com/docs/plugins/cimd)):

- "Generic CIMD validation follows draft-02";
  `metadataProfile: "mcp-2026-07-28"` adds MCP's draft-00 requirements.
- The Node transport "never follows redirects", rejects non-public DNS results,
  supports "only `GET` and `HEAD`", and enforces "a streaming 5 KB
  metadata-document limit" and "a five-second timeout".
- Discovery then carries `client_id_metadata_document_supported: true` (pkg
  `cimd@1.7.7` `dist/index.mjs:731`), and `"none"` joins
  `token_endpoint_auth_methods_supported` once a client discovery is installed
  (`oauth-provider` `authorize-K1WHCNih.mjs:740-749`). Claude needs both flags
  before it uses CIMD (MCP note §3.2).

### 4.4 The MCP note's §3 checklist

| Requirement (MCP note §3.1–3.3)                                  | Better Auth 1.7.7                                                    | Work left                                                                                                                              |
| ---------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| PRM (RFC 9728) and the 401 `resource_metadata` challenge         | **Yes**: `mcp()` serves PRM; `requireMcpAuth` sends the challenge    | With Better Auth at `/api/auth`, root `/.well-known/*` routes must forward to `auth.handler` (inference)                               |
| AS metadata (RFC 8414); `issuer` equals the fetch URL            | **Yes**                                                              | Check the issuer string end to end                                                                                                     |
| PKCE S256                                                        | **Yes**, S256 only                                                   | —                                                                                                                                      |
| `resource` (RFC 8707) → `aud`                                    | **Yes**                                                              | Claude's canonical-URL rule (lowercase host, no trailing slash) is **unverified** against Better Auth                                  |
| CIMD, DCR fallback                                               | **Yes**: `cimd()`; DCR opt-in                                        | Enable both DCR flags too, because Claude falls back to DCR (MCP note §3.2)                                                            |
| `iss` in the authorization response (RFC 9207)                   | **Yes**                                                              | —                                                                                                                                      |
| Short-lived tokens; rotating refresh                             | **Yes**: 1 h JWT; rotation with family revocation; 30 s retry window | JWTs cannot be revoked; shorten `accessTokenExpiresIn` if needed                                                                       |
| 403 `insufficient_scope`                                         | **Yes**: `requiredScopes`                                            | Per-tool step-up lives in the MCP handler                                                                                              |
| Consent page on the existing login                               | **Partial**: redirects to your `consentPage` / `loginPage`           | **Needs a Better Auth session**, hence Phase 1 first                                                                                   |
| SSRF defence for CIMD fetches                                    | **Yes**: `@better-auth/cimd/node`                                    | —                                                                                                                                      |
| Revocation, "connected assistants" page                          | Revocation **yes** (RFC 7009)                                        | Build the page over `oauthConsent` and refresh tokens                                                                                  |
| Per-subject rate limit, audit log, provenance gate, undo handles | No                                                                   | App work, unchanged (MCP note §6)                                                                                                      |
| PRM `scopes_supported` without `offline_access`                  | Not verified                                                         | Test the PRM output                                                                                                                    |
| Dual-era MCP transport (MCP note §2.2)                           | Docs advise `legacy: "reject"`                                       | **Conflict.** Token checks look protocol-agnostic, so keep the SDK's `legacy: 'stateless'` and test with a 2025-era client (inference) |

### 4.5 Migrating existing users

| Data          | Epic                                                          | Better Auth                                                                                                                                                                                      | Path                                                                                            |
| ------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Users         | `User` (`schema.prisma:14`)                                   | `user` + `emailVerified`, `image`, `role`, `twoFactorEnabled`, `username`                                                                                                                        | Map onto the table with `modelName` / `fields`; keep ids (inference)                            |
| Passwords     | `Password.hash`, bcrypt (`schema.prisma:60`)                  | `account.password`, `providerId: "credential"`                                                                                                                                                   | Copy verbatim; bcrypt `verify`                                                                  |
| GitHub links  | `Connection(providerName, providerId)`                        | `account(providerId, accountId, issuer)`                                                                                                                                                         | SQL copy; set `issuer`                                                                          |
| Passkeys      | `Passkey`: credential id, `publicKey` bytes, `counter` BigInt | `passkey`: `credentialID`, base64 `publicKey`, `counter`, …                                                                                                                                      | Copy with bytes → base64; keep the RP ID                                                        |
| TOTP secrets  | HMAC key = `base32Decode(secret)`, 10 random bytes            | Secret = `generateRandomString(32)`, encrypted (pkg `better-auth@1.7.7` `dist/plugins/two-factor/index.mjs:134`); HMAC key = its UTF-8 bytes (pkg `@better-auth/utils@0.4.2` `dist/hmac.mjs:10`) | **Not portable** (inference from source): random bytes are rarely valid UTF-8. Re-enrol (§8 R4) |
| Sessions      | `Session` row + `en_session`                                  | `session.token` + Better Auth cookie                                                                                                                                                             | Sign everyone out once                                                                          |
| Verifications | `Verification`                                                | `verification`, another shape                                                                                                                                                                    | Drop; in-flight codes expire                                                                    |

**Name clashes.** Epic's `Session`, `Verification` and `Passkey` models
(`schema.prisma:67,108,153`) differ from Better Auth's. Give Better Auth's
tables new `modelName`s, copy, then drop the old tables (inference).

---

## 5. Postgres

### 5.1 Region decision

trainm8 runs in `arn`, Stockholm (`fly.toml:2`). Neon's first latency advice is
"ensuring that your application and database are hosted in the same region"
([Neon latency](https://neon.com/docs/connect/connection-latency)). SQLite's "0
latency" (`docs/decisions/003-sqlite.md:15`) ends either way: every sequential
query becomes a round trip, as in the per-set loop inside the quick-log
transaction (`strength-quick-log.server.ts:198-205`).

| Option                                           | Region facts                                                                                                                                       | For                                                                                                                                                 | Against                                                                                                                                                                     |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Neon `aws-eu-central-1`, app → `fra`**      | Neon's European regions are Frankfurt and London only; Azure regions "are deprecated" ([Neon regions](https://neon.com/docs/introduction/regions)) | Branching for preview DBs; Launch: $0.106/CU-hour, $0.35/GB-month, "no monthly minimum", up to 7 days history ([pricing](https://neon.com/pricing)) | App moves away from Stockholm. Scale-to-zero after "5 minutes", fixed on Free ([scale to zero](https://neon.com/docs/introduction/scale-to-zero))                           |
| **B. Fly MPG `fra` (or `ams`), app → same**      | MPG regions in Europe: `ams`, `fra`, `lhr`; `arn` is not marked ([Fly regions](https://docs.fly.io/reference/regions))                             | Same provider, private network; "All plans include high availability, backups, and connection pooling"                                              | Basic $38/month ([Fly MPG](https://docs.fly.io/mpg)); no branching; version upgrades and alerting still "under development"                                                 |
| **C. Supabase `eu-north-1`, app stays in `arn`** | "North EU (Stockholm), `eu-north-1`" ([Supabase regions](https://supabase.com/docs/guides/platform/regions))                                       | Same metro as today; Pro "from $25/month"                                                                                                           | Cross-provider over the public internet (inference); PITR "$100 per month per 7 days retention"; bundles an auth we would not use ([pricing](https://supabase.com/pricing)) |
| D. Neon or MPG, app stays in `arn`               | Cross-region on every query                                                                                                                        | —                                                                                                                                                   | Rejected                                                                                                                                                                    |

**Trade-offs.**

- **Where the users are.** trainm8 speaks Norwegian (ADR 0081), and decision 009
  asks for "the region that's closest to the most critical/closest users". Oslo
  → Frankfurt versus Oslo → Stockholm is **not measured** here. Measure it from
  a Norwegian network before choosing.
- **Residency.** Frankfurt, Amsterdam and Stockholm are in the EU. London (Neon
  `aws-eu-west-2`, Fly `lhr`) is not, so it does not meet "EU Postgres".
- **The in-app agent's Bedrock region.** Co-location with Bedrock `eu-north-1`
  holds only if the app stays in `arn` (plain SQLite or option C), while
  residency holds either way: Bedrock's `eu-central-1` (Frankfurt) serves Sonnet
  5.5 and Haiku 5.5 through the same EU geo profile, which AWS lists as their
  only EU route from Stockholm too
  ([model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-5-5.html);
  [`ai-product-privacy-cost.md`](ai-product-privacy-cost.md) §3.4, §5; the
  owner's decisions in
  [`agent-strategy.md`](agent-strategy.md#risks-open-questions-and-the-owners-decisions)).
- **Moving is cheapest at the cutover.** Off LiteFS the app holds no database
  volume, so the region change rides on the Phase 3 deploy (inference).
- **The trigger decides.** Preview DBs and cheap history point to Neon. HA
  without another vendor points to Fly MPG. Staying in Stockholm points to
  Supabase.
- **`LISTEN`/`NOTIFY` needs a direct connection on Neon.** Its pooler runs
  PgBouncer in transaction mode and lists `LISTEN` / `NOTIFY` as unsupported;
  migrations also go direct
  ([pooling](https://neon.com/docs/connect/connection-pooling)). That matters
  for the SSE-over-`NOTIFY` plan in [`agent-platforms.md`](agent-platforms.md)
  §8A.
- **Cost (inference).** 0.25 CU always on × 730 h × $0.106 ≈ **$19/month** on
  Neon Launch plus storage; Fly MPG Basic $38 plus $0.28/GB; Supabase Pro $25
  before PITR. Neon Free means cold starts of "a few hundred milliseconds".

**Default: A**, Neon in Frankfurt with the app in `fra`: the cheapest path to
the preview-DB and history triggers. **Choose C** if a measurement shows the
move hurts Norwegian users.

### 5.2 Data migration SQLite → Postgres

- **One new baseline**, not a replay of the 58 migrations: they use `PRAGMA`
  rebuilds, `randomblob`, `json_each` and `INSERT OR IGNORE` (§3.1). Generate
  the schema with `prisma migrate diff` from empty, then hand-port the **63 live
  CHECKs** (inference).
- **Copy the data**, which brings the corpus rows along. Convert integer-ms
  _and_ text dates to `timestamptz`, 0/1 to `boolean`, `Bytes` to `bytea`. A
  small `node:sqlite` → `COPY` script that branches on `typeof()` is safer than
  a generic loader cast (inference).
- **Future corpus migrations** use `ON CONFLICT DO NOTHING`, and
  `docs/agents/production-seed-data.md` gets a Postgres procedure.
- **Cutover:** rehearse on a branch; freeze writes; copy; compare row counts and
  checksums; flip `DATABASE_URL`; deploy without LiteFS.

### 5.3 Local dev and CI

**Docker Postgres** gives parity: a CI service container, and a per-worker
`CREATE DATABASE … TEMPLATE base` in place of the file copy at
`tests/setup/db-setup.ts:33` (inference). It adds Docker to every dev and agent
sandbox. **PGlite** could pair with Drizzle later (`drizzle-orm/pglite` is in
the RC tarball); its fit is an open question (§9).

---

## 6. Drizzle

| Question         | Finding                                                                                                                                                                                                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Versions (npm)   | `latest` **0.45.4** (2026-10-08). `rc` tag **1.0.0-rc.4** (2026-06-27); `rc5` tag `1.0.0-rc.5-5935859` (2026-09-09); no plain `1.0.0-rc.5`. The RC line began with `1.0.0-rc.1` on 2026-04-30. `drizzle-kit` `latest` 0.31.11                                                                                            |
| Is 1.0 out?      | **No.** The upgrade guide installs `drizzle-orm@rc` and `drizzle-kit@rc` ([upgrade-v1](https://orm.drizzle.team/docs/upgrade-v1))                                                                                                                                                                                        |
| Breaking changes | "RQBv1 has been removed" (use `defineRelations()`); validators move to `drizzle-orm/zod` etc.; the `casing` option is replaced by a table-level API; "No more `journal.json`"; `drizzle-kit drop` and `--strict` removed; push/pull manage all schemas by default ([v0→v1](https://orm.drizzle.team/docs/v0-v1-changes)) |
| Drivers          | The RC tarball has `node-postgres`, `postgres-js`, `neon-http`, `neon-serverless`, `pglite`, `node-sqlite` and `zod`. Peer `zod ^3.25.0 \|\| ^4.0.0`                                                                                                                                                                     |
| Constraints      | `check()` for CHECKs; `unique().nullsNotDistinct()` on Postgres 15+; `.where()` on an index for partial indexes ([constraints](https://orm.drizzle.team/docs/indexes-constraints))                                                                                                                                       |
| Prisma bridge    | `drizzle-orm@0.45.4` exports `./prisma/pg` and `./prisma/sqlite` (npm). The 1.0 RC tarball has neither, so the bridge is 0.x-only                                                                                                                                                                                        |
| Path from Prisma | `drizzle-kit pull --init` introspects the live database to `schema.ts` and marks it as an applied migration ([pull](https://orm.drizzle.team/docs/drizzle-kit-pull)). Drizzle's "Migrate from Prisma to Drizzle" guide is still search-indexed, but both its URLs return 404 and `llms.txt` does not list it             |
| Verdict          | Widely used, but starting now means an RC or a second migration (0.45 → 1.0) (inference)                                                                                                                                                                                                                                 |

---

## 7. Phased plan

| Phase                                    | Scope                                                                                                                                                                                                                                                                                                                         | Ships as                                                                                     | Effort                | Main risk                                          |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------- | -------------------------------------------------- |
| **0. Prerequisites** (parallel)          | zod ≥ 4.2; the registry's first slice; MCP note Phase 0 (read-only tools on a dev token)                                                                                                                                                                                                                                      | Independent PRs                                                                              | per the MCP note      | —                                                  |
| **1. Better Auth on Prisma + SQLite**    | `prismaAdapter(prisma, { provider: "sqlite" })` with `username`, `emailOTP`, `twoFactor`, `passkey`, `admin`, GitHub. Schema + data migration as a Prisma migration (§4.5). Rewrite the 39 files; keep `getUserId` / `requireUserId` / `requireUserWithRole` signatures. 2FA hooks for passkey and GitHub. Pin exact versions | **One login cutover**; the 70 callers stay put behind the seam                               | **M–L, ~3–5 weeks**   | Login regressions; 2FA re-enrolment; onboarding UX |
| **2. MCP OAuth**                         | `jwt()` + `mcp({ resource: "https://<host>/mcp" })` + `cimd()` + both DCR flags; consent page; root `.well-known` forwarding; connected-assistants page; `requireMcpAuth` around the v2 handler; test against Claude                                                                                                          | Incremental                                                                                  | **S–M, ~1–2 weeks**   | Dual-era transport; canonical `aud`                |
| **3. Postgres on Prisma** (on a trigger) | Region decision (§5.1); Prisma 6 → 7; `provider = "postgresql"`; baseline + 63 CHECKs + partial unique indexes (ADRs 0061, 0079); transaction audit (§8 R1); `contains` case; Docker-PG test harness; drop LiteFS (7 importers, `litefs.yml`, Dockerfile, health check); data copy and cutover                                | Code lands incrementally; **the data cutover is one window**                                 | **M–L, ~3–5 weeks**   | Concurrency regressions; latency; mixed dates      |
| **4. Drizzle** (after 1.0 GA, optional)  | `drizzle-kit pull --init`; convert module by module (~665 calls, 59 transactions); map `P2002` to Postgres `23505`; switch Better Auth to the Drizzle adapter; drop Prisma; optionally PGlite tests                                                                                                                           | Incremental: both ORMs share one database, but no transaction spans both clients (inference) | **L–XL, ~6–10 weeks** | RC churn; double maintenance                       |

**The fallback if Phase 1 slips:** the MCP note's node-oidc-provider route (L,
~2–4 weeks) on the existing session. **If Postgres never triggers:** drop LiteFS
for plain SQLite on the Fly volume (a few days, inference) and upgrade to
Prisma 7. Its documented SQLite driver adapter is
`@prisma/adapter-better-sqlite3`
([Prisma 7 upgrade](https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7)).

---

## 8. Migration risk register

| #   | Risk                                                   | Phase | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Mitigation                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **Read Committed concurrency**: quick-log double claim | 3     | The claim is `UPDATE "WorkoutSession" … WHERE NOT EXISTS (SELECT … FROM "ExerciseSetLog" …)` (`strength-quick-log.server.ts:189-197`). Postgres re-checks `WHERE` on the locked row but "does not see effects of those commands on other rows" ([isolation](https://www.postgresql.org/docs/current/transaction-iso.html)), so two claims can both pass (inference). The same shape: the one-open-ended-plan check-then-insert (`plan-outline/authoring.server.ts:363-371`), which no constraint backs (ADR 0079). The job claim is a same-row compare-and-set (`jobs/queue.server.ts:50-57`) and stays safe | Audit all **59** transactions. Lock the parent row with `SELECT … FOR UPDATE`, then check in a new statement; or `isolationLevel: 'serializable'` with retry on `40001`; or a partial unique index. Race tests on a real Postgres |
| R2  | **CHECK constraints** lost in the baseline             | 3     | 95 clauses written across 11 migrations, **63 live** on 21 tables; table rebuilds have dropped them before (ADR 0044 §8). Three tests execute SQLite migration files (§3.2)                                                                                                                                                                                                                                                                                                                                                                                                                                  | Port from `sqlite_master`, not from the migrations; assert 63 in `pg_constraint`; run `constraints.test.ts` against Postgres                                                                                                      |
| R3  | **Millisecond dates**                                  | 3     | `DateTime` is stored as integer epoch ms; 92 values are `CURRENT_TIMESTAMP` text (§3.1); one test does integer date arithmetic in SQL (`stamp.server.test.ts:715`)                                                                                                                                                                                                                                                                                                                                                                                                                                           | Copy script branches on `typeof()`; compare row checksums after conversion; rewrite the test                                                                                                                                      |
| R4  | **TOTP re-enrolment**                                  | 1     | Epic's HMAC key is the base32-decoded 10 bytes; Better Auth's is the UTF-8 bytes of a 32-char string (§4.5)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Email 2FA users before the cutover and walk them through re-enrolment; or verify legacy secrets in a custom hook until they re-enrol (inference)                                                                                  |
| R5  | **2FA not enforced on passkey and GitHub** by default  | 1     | Enforcement "applies to the credential-based sign-in endpoints: `/sign-in/email`, `/sign-in/username`, and `/sign-in/phone-number`"; OAuth/social and passkey are excluded, and the docs say to "add custom hook handling" ([2FA](https://www.better-auth.com/docs/plugins/2fa)). Epic gates all three paths (§3.4)                                                                                                                                                                                                                                                                                          | Hooks on the social callback and passkey sign-in that redirect 2FA users to verification; e2e tests for all three paths                                                                                                           |
| R6  | **Better Auth breaking minors**                        | 1–4   | 1.7.0 removed a plugin, renamed a table and required a column in a minor (§4.1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Pin exact versions; read release notes; regenerate the schema per upgrade; a test that diffs `npx auth generate` output                                                                                                           |
| R7  | **`legacy: "reject"` vs serving both MCP eras**        | 2     | Better Auth's MCP docs say "Configure servers with `legacy: "reject"`"; the MCP note requires dual-era because a legacy client against a modern-only server "Fails" (MCP note §2.2)                                                                                                                                                                                                                                                                                                                                                                                                                          | Keep the SDK's `legacy: 'stateless'`; test `requireMcpAuth` with a 2025-era client; record the choice in proposed ADR 0094                                                                                                        |
| R8  | Login regression; one forced sign-in for everyone      | 1     | Sessions cannot carry over (§4.5)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Staging soak; announce the sign-out                                                                                                                                                                                               |
| R9  | SQLite-only migration SQL                              | 3     | 1,734 `INSERT OR IGNORE`, `randomblob`, `json_each` (§3.1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Baseline + data copy, not replay; Postgres dialect from then on                                                                                                                                                                   |
| R10 | Latency and case semantics                             | 3     | Sequential awaits in transactions; `contains` becomes case-sensitive                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `Promise.all` where safe; `mode: 'insensitive'` in catalogue search                                                                                                                                                               |
| R11 | Drizzle RC churn                                       | 4     | §6                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Wait for GA                                                                                                                                                                                                                       |

---

## 9. Open questions

1. **Does `requireMcpAuth` work behind an MCP handler on
   `legacy: 'stateless'`**, serving both eras? And what does PRM put in
   `scopes_supported`?
2. **Does Better Auth accept Claude's canonical `aud`** (lowercase host, no
   trailing slash, no default port)?
3. **Oslo → `fra` versus Oslo → `arn` latency**, measured; and which trigger
   fires first. Together they pick the host (§5.1).
4. **Can PGlite carry this suite** (one connection; race tests still need a real
   Postgres), and is Docker in every agent sandbox acceptable?
5. **Does Prisma 7 keep `--skip-generate` on `migrate reset`** (used at
   `tests/setup/global-setup.ts:28`)? The upgrade guide names only `migrate dev`
   and `db push`. Does TypedSQL survive? trainm8 has no `.sql` files.
6. **Bridge or cut over?** Issuing a Better Auth session from an Epic session
   would let MCP ship before Phase 1, through internal APIs. Unexplored.

---

## 10. Verification log

**Corrected in place** (14), relative to the first draft:

- Drizzle `@rc` is `1.0.0-rc.4`; `1.0.0-rc.5` exists only as the tagged build
  `1.0.0-rc.5-5935859`. `1.0.0-rc.1` is from 2026-04-30 (UTC), not 2026-05-01.
- `@better-auth/mcp` dates from 2026-01-14 (`1.5.0-beta.7`), not 2026-06-26.
- Transactions: 59, not 57. `select: {`: 614, not 644. DB tests: ~123, not 127.
  Auth surface: ~4.7k LOC, not ~4.9k.
- CHECKs: 95 written, **63 live**.
- Corpus: not "74 INSERTs in 26 migrations" (28 of those are rebuild copies) but
  1,780 statements in 9 migrations, 1,734 of them `INSERT OR IGNORE`.
- Dates: the local copy is mixed (92 text values), not "none mixed".
- Neon's page says "the same region", without "or as close as possible".
- Fly never says LiteFS is "unsupported": it cannot "provide support or
  guidance", calls it pre-1.0, and says it "is stable and running in production
  environments".
- Prisma 7 dropped `--skip-generate` from `migrate dev` and `db push`; the guide
  is silent on `migrate reset`.
- Drizzle's Prisma migration guide did exist, but it returns 404 today.

Also softened (3): Better Auth's 2FA wording is quoted from the page; Drizzle
lists DDL snapshots and commutativity checks as features, not breaking changes;
the Prisma adapter's `sqlite` rests on its types, not its docs page.

**Unverified** (7): §9 questions 1, 2 and 5; whether production holds text dates
beyond the 92 from migrations; the Postgres double claim (inference from the
documented semantics, not reproduced); every effort figure; the TOTP
non-portability (read from source, not tested).

---

## ADRs this research challenges

Each was read before being cited. `docs/decisions/` holds the decisions
inherited from the Epic Stack; `docs/adr/` holds trainm8's own.

| ADR                                                    | What it decided                                                                                             | What the evidence says                                                                                                                                                            | Verdict                                                           |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Decision 003** SQLite                                | SQLite for "0 latency" (`:15`); LiteFS or Turso for multiple instances (`:55-60`)                           | Right for one machine. LiteFS is now pre-1.0 without Fly support (§1.2), and the target end state is Postgres                                                                     | **Supersede at Phase 3**; Confirm until a trigger fires           |
| **Decision 007** Sessions                              | A sessions table for revocation; a lookup per request is fine because SQLite has "0 latency"                | Better Auth keeps a revocable `session` table, so the principle holds. On Postgres the per-request lookup is a round trip; `session.cookieCache` exists for that                  | **Supersede** the implementation (Phase 1); Confirm the principle |
| **Decision 009** Region selection                      | Pick the region closest to the critical users                                                               | The region is now coupled to the database host: Neon and Fly MPG are not in `arn` (§5.1)                                                                                          | **Amend** at Phase 3                                              |
| **Decision 013** Email code                            | Email carries a code and a link                                                                             | `emailOTP` sends a numeric code; magic link is a separate plugin                                                                                                                  | **Amend** (Phase 1)                                               |
| **Decision 014** TOTP                                  | `@epic-web/totp` for email codes and 2FA                                                                    | Replaced by Better Auth's OTP and `twoFactor`; 2FA secrets do not port (§4.5)                                                                                                     | **Supersede** (Phase 1)                                           |
| **Decision 028** RBAC                                  | `Role` ↔ `Permission` with action/entity/access                                                             | Only the `admin` role is checked (6 sites); the permission helpers are unused. The `admin` plugin's role string covers it                                                         | **Supersede** (Phase 1)                                           |
| **Decision 029** Remix Auth                            | Own password handling; `remix-auth` kept for GitHub                                                         | Better Auth handles both                                                                                                                                                          | **Supersede** (Phase 1)                                           |
| **Decision 030** GitHub auth                           | A `Connection` model for providers                                                                          | Becomes `account(providerId, accountId, issuer)`; the "connections" idea survives                                                                                                 | **Supersede** the model (Phase 1)                                 |
| **Decision 039** Passkeys                              | SimpleWebAuthn, a `Passkey` model, passkeys as first-class login                                            | Better Auth's plugin is "powered by SimpleWebAuthn". Storage changes (base64 key, `credentialID`), and 2FA no longer gates passkey sign-in without a hook (§8 R5)                 | **Confirm** the library; **Amend** storage and gating             |
| **Decision 042** `node:sqlite`                         | Node's built-in SQLite over `better-sqlite3`                                                                | After Phase 3 it serves only `cache.db`. If SQLite stays, Prisma 7's documented SQLite adapter is `@prisma/adapter-better-sqlite3`                                                | **Amend**                                                         |
| **0013** Ingest trigger model (#74 amendment)          | A SQLite-backed `Job` table polled in-process; claim by id                                                  | The claim is a same-row compare-and-set, which Read Committed re-checks, so it is safe on Postgres. With several machines, `FOR UPDATE SKIP LOCKED` avoids contention (inference) | **Confirm**                                                       |
| **0044** Plan Outline is relational, §8                | Vocabularies are CHECKs; a trigger rejected because "SQLite rebuilds tables on `ALTER`"                     | That reason is SQLite's. Postgres alters in place, and Drizzle's `check()` puts constraints in the schema file. §8 should move with the database                                  | **Amend** at Phase 3–4                                            |
| **0059 / 0060** idempotent finish                      | A unique index on `ProgramSessionApplication` inside the advancing transaction                              | Portable: a unique violation rolls back on Postgres too. On Drizzle, `P2002` becomes SQLSTATE `23505` at 7 sites                                                                  | **Confirm**                                                       |
| **0061** Exercise database                             | The un-angled variant relies on seed ids, because NULLs are distinct in a unique index                      | Postgres 15 offers `NULLS NOT DISTINCT`; Drizzle has `nullsNotDistinct()` and partial indexes                                                                                     | **Amend** at Phase 3                                              |
| **0079** Open-ended plans                              | "At most one open-ended plan" lives in the creating transaction, "since Prisma has no partial unique index" | Under Read Committed that check can pass twice (§8 R1). A partial unique index on `athleteId WHERE eventId IS NULL` is needed before Postgres                                     | **Amend** before Phase 3                                          |
| **Proposed 0094** (MCP note §8.4) authorization server | node-oidc-provider in-app, on the existing session                                                          | `@better-auth/mcp` covers the same checklist with less code, once Phase 1 lands; node-oidc-provider stays the fallback                                                            | **Amend the proposal** before it is written                       |

---

## Sources

**npm registry** (`npm view <pkg> dist-tags`, `time`, `dependencies`,
`peerDependencies`, `exports`, 2026-10-11): `drizzle-orm`, `drizzle-kit`,
`better-auth`, `@better-auth/mcp`, `@better-auth/cimd`,
`@better-auth/oauth-provider`, `@better-auth/passkey`,
`@better-auth/prisma-adapter`, `@prisma/client`, `prisma`, `react-router`.

**Package tarballs read** (files cited inline): `better-auth`,
`@better-auth/mcp`, `cimd`, `oauth-provider`, `passkey`, `prisma-adapter` (all
1.7.7), `@better-auth/utils@0.4.2`, `drizzle-orm@1.0.0-rc.5-5935859`;
`@epic-web/totp@4.0.1` from `node_modules`.

**Better Auth docs:** [MCP](https://www.better-auth.com/docs/plugins/mcp) ·
[OAuth provider](https://www.better-auth.com/docs/plugins/oauth-provider) ·
[CIMD](https://www.better-auth.com/docs/plugins/cimd) ·
[2FA](https://www.better-auth.com/docs/plugins/2fa) ·
[passkey](https://www.better-auth.com/docs/plugins/passkey) ·
[email OTP](https://www.better-auth.com/docs/plugins/email-otp) ·
[sessions](https://www.better-auth.com/docs/concepts/session-management) ·
[Prisma adapter](https://www.better-auth.com/docs/adapters/prisma) ·
[React Router](https://www.better-auth.com/docs/integrations/react-router) ·
[v1.7.0 release](https://github.com/better-auth/better-auth/releases/tag/v1.7.0).

**Drizzle:** [upgrade to v1](https://orm.drizzle.team/docs/upgrade-v1) ·
[v0→v1 changes](https://orm.drizzle.team/docs/v0-v1-changes) ·
[indexes and constraints](https://orm.drizzle.team/docs/indexes-constraints) ·
[pull](https://orm.drizzle.team/docs/drizzle-kit-pull).

**Hosting:** [Neon regions](https://neon.com/docs/introduction/regions) ·
[Neon latency](https://neon.com/docs/connect/connection-latency) ·
[Neon pooling](https://neon.com/docs/connect/connection-pooling) ·
[Neon scale to zero](https://neon.com/docs/introduction/scale-to-zero) ·
[Neon pricing](https://neon.com/pricing) ·
[Fly regions](https://docs.fly.io/reference/regions) ·
[Fly Managed Postgres](https://docs.fly.io/mpg) ·
[Fly LiteFS](https://docs.fly.io/litefs) ·
[Supabase regions](https://supabase.com/docs/guides/platform/regions) ·
[Supabase pricing](https://supabase.com/pricing) ·
[PostgreSQL transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html)
·
[Prisma 7 upgrade guide](https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7).

**This repository at `33c10f5`:** files cited inline; `docs/decisions/003`,
`007`, `009`, `013`, `014`, `028`, `029`, `030`, `039`, `042`; `docs/adr/0013`,
`0044`, `0059`, `0060`, `0061`, `0079`; a SQLite database rebuilt from
`prisma/migrations/` with `node:sqlite`, and the local backup
`prisma/data.db.bak-20260819083410`.
