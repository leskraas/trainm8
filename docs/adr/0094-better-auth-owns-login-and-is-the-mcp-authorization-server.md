# Better Auth owns login and is the MCP authorization server

Status: Proposed · Ticket #554 (map #541, Phase 1) · Backed by
[`stack-migration.md` §1.2, §4.5, §7, §8 R4–R8](../research/stack-migration.md#7-phased-plan),
[`mcp-server-for-trainm8.md` §3](../research/mcp-server-for-trainm8.md) and the
spike for #552 (`docs/research/better-auth-mcp-spike.md` on
`claude/spike-better-auth-mcp`). Decisions marked _Proposed, owner to confirm_
were delegated and are the agent's recommendation.

Supersedes Epic decisions [007](../decisions/007-sessions.md) (implementation;
the principle of a revocable session table stands),
[014](../decisions/014-totp.md), [028](../decisions/028-permissions-rbac.md),
[029](../decisions/029-remix-auth.md) and [030](../decisions/030-github-auth.md)
(the model; the "connections" idea stands). Amends
[013](../decisions/013-email-code.md) and [039](../decisions/039-passkeys.md).
Each supersession takes effect on the login cutover, not on acceptance of this
record.

## Context

The MCP consent page needs a Better Auth session, and Epic's `en_session` cookie
is invisible to Better Auth. The spike (#552) found that Better Auth 1.7.12 with
`jwt()`, `mcp()` and `cimd()` passes every check Claude's OAuth client needs
that can be run without the owner's click, on both MCP protocol eras, and that
the node-oidc-provider fallback is not triggered. It also found that an Epic
session can mint a Better Auth session (the "bridge"), and four gaps: deleting a
consent revokes nothing, rate limits are per IP, `requireMcpAuth`'s default JWKS
URL loops through the public URL, and two upstream bugs are open.

## Decision

### 1. Better Auth owns login, on today's Prisma and SQLite

- `betterAuth` on `prismaAdapter(prisma, { provider: 'sqlite' })`, mounted at
  `/api/auth` by a resource route, with `username`, `emailOTP`, `twoFactor`,
  `@better-auth/passkey`, `admin` and the GitHub social provider.
- **Exact pins**, no carets: `better-auth`, `@better-auth/core`,
  `@better-auth/passkey`, `@better-auth/prisma-adapter` and the CLI `auth` at
  `1.7.12` (Phase 2 adds `@better-auth/mcp`, `@better-auth/oauth-provider` and
  the CIMD plugin package, pinned at the same version, as in the spike);
  `better-call` `1.4.4`; `@better-fetch/fetch` `1.3.2`; `@better-auth/utils`
  `0.5.0`. An upgrade is its own PR that reads the release notes and regenerates
  the schema (§8 R6).
- **`getUserId`, `requireUserId`, `requireAnonymous` and `requireUserWithRole`
  keep their signatures.** They read `auth.api.getSession({ headers })` instead
  of `en_session`; the ~90 files that call them (139 call sites) do not change.
- **One login cutover.** Sessions cannot carry over, so every athlete signs in
  once more on cutover day. No dual-read of `en_session` after the cutover: a
  second session system is a second thing to revoke.

### 2. Schema and data migration

- **Better Auth shares Epic's `User`.** Its user-level columns are added to it
  (`emailVerified`, `twoFactorEnabled`, `role`, `banned`, `banReason`,
  `banExpires`, `displayUsername`); `image` is mapped to a new column so Epic's
  `UserImage` relation stays. No `@@map("user")`: the CLI adds it, and it is
  wrong on a case-sensitive database.
- Better Auth's own tables get names that do not collide with Epic's (`Session`,
  `Verification`, `Passkey`): `AuthSession`, `AuthAccount`, `AuthVerification`,
  `AuthPasskey`, `TwoFactor`. The Epic tables are dropped in a later migration,
  one release after the cutover, so a rollback has its data.
- **The data moves in a Prisma migration, as SQL `INSERT … SELECT`**, never a
  seed (`docs/agents/production-seed-data.md`):
  - `Password.hash` →
    `AuthAccount(providerId 'credential', accountId = userId, password = hash)`,
    verbatim;
  - `Connection(providerName 'github', providerId)` →
    `AuthAccount(providerId 'github', accountId = providerId, issuer = 'https://github.com')`;
  - `Passkey` → `AuthPasskey` with the public key re-encoded from bytes to
    base64 and the RP ID kept;
  - `Role 'admin'` membership → `User.role = 'admin'`, else `'user'`.
- **Bcrypt hashes are kept, and bcrypt stays the hash.** Better Auth's default
  is scrypt, but `emailAndPassword.password.hash` and `.verify` are overridable.
  Both are set to `bcryptjs` (cost 10, as today), so every migrated hash
  verifies with no rehash-on-login, and the rollback below can copy a new hash
  back. Moving to scrypt or argon2 is a later, separate decision.
- **A rollback copies the current credentials back before Epic serves a
  request.** The Epic tables are a snapshot from the cutover, so serving them as
  they are would accept a password the athlete has since changed or reset, and
  reject the new one. The rollback release therefore starts with a Prisma
  migration, in one transaction, that:
  - sets `Password.hash` from `AuthAccount(providerId 'credential').password`,
    inserts a `Password` row for a user who set a password after the cutover,
    and deletes the row of a user who no longer has a credential account;
  - rebuilds `Connection` (GitHub) and `Passkey` from `AuthAccount` and
    `AuthPasskey`, so a link or passkey removed after the cutover does not come
    back;
  - deletes every Epic `Session` row, so no pre-cutover session revives;
  - deletes the Epic `2fa` verification of every user whose Better Auth 2FA
    changed after the cutover (re-enrolled or turned off). Only a user still
    flagged `mustReenrolTwoFactor` keeps the Epic secret they had.

  A test runs the cutover and this migration on a fixture database: a password
  reset after the cutover leaves the old password rejected and the new one
  accepted on Epic. **Without that migration, rollback is not allowed** once any
  athlete has signed in on Better Auth. The re-enrolled users who lose 2FA on a
  rollback are listed under Deferred hardening.

- **A test diffs `npx auth generate` output against `prisma/schema.prisma`**,
  after normalising the two known CLI faults (the invalid `@default([])` on a
  SQLite `String?`, P1012, and `@@map("user")`).

### 3. 2FA is enforced on every sign-in path, as Epic does today

- Better Auth's `twoFactor` gates only `/sign-in/email`, `/sign-in/username` and
  `/sign-in/phone-number`. trainm8 adds a `hooks.after` on every other path that
  creates a session: the email-code sign-in (`/sign-in/email-otp`, which
  `emailOTP` exposes and `disableSignUp` does not close), the passkey sign-in
  (`/passkey/verify-authentication`), the social callback (`/callback/:id`) and
  any verification that signs the user in. For a user with `twoFactorEnabled` or
  `mustReenrolTwoFactor`, it does what the plugin's own hook does: delete the
  fresh session, set the signed `two_factor` cookie with a verification row, and
  send the browser to the 2FA page. An email code is a first factor, never a way
  past the second.
- **The gate fails closed on a new path.** The hook lives in one module with a
  test per path, and a test walks every endpoint of the configured `auth` and
  fails if one that sets a session cookie is neither gated by `twoFactor` nor in
  the hook's list. A plugin or upgrade that adds a sign-in path breaks that
  test, not 2FA.
- **Trusted device: off.** Epic re-asks for 2FA after two hours of a new
  verification window; Better Auth's 30-day trusted device is a weaker default
  and is not offered (_Proposed, owner to confirm_).
- **Existing 2FA users must re-enrol.** Epic's HMAC key is the base32-decoded 10
  random bytes; Better Auth's is the UTF-8 bytes of a 32-character string
  (`stack-migration.md` §4.5). Writing a legacy-TOTP verify path would keep a
  second 2FA implementation alive in the most security-sensitive code, so it is
  rejected. On the migration, each user with an Epic `2fa` verification gets
  `twoFactorEnabled = false` and a `mustReenrolTwoFactor` flag. Their sign-in
  after the cutover is a primary sign-in (password, passkey or GitHub) followed
  by an email code as the second factor, through `twoFactor`'s OTP method
  (`/two-factor/send-otp`, `/two-factor/verify-otp`), which is bound to the
  `two_factor` cookie that only a successful primary sign-in sets. The email
  code is never both of their factors: `/sign-in/email-otp` is refused for a
  flagged user, and `/two-factor/verify-otp` is refused for a user with
  `twoFactorEnabled`, so it can never stand in for their TOTP. They then land on
  the 2FA set-up page until they re-enrol or dismiss it. Tests prove that a
  flagged user cannot get a session with email codes alone, and that a user with
  `twoFactorEnabled` cannot get one without TOTP or a backup code. _Proposed,
  owner to confirm_; it is a weaker window, listed under Deferred hardening.

### 4. Email codes (amends 013)

`emailOTP` sends a six-digit numeric code, valid 300 s, three attempts, stored
hashed (`storeOTP: 'hashed'`), and `disableSignUp: true` so a code never creates
an account by itself. The email carries the code only, not a link.

### 5. Roles (supersedes 028)

The `admin` plugin's role string replaces `Role` ↔ `Permission`; only `admin` is
checked today. `requireUserWithRole(request, 'admin')` keeps its signature.
Impersonation is not enabled.

### 6. MCP OAuth waits for the cutover; no Epic-session bridge

The bridge works, but it runs two session systems side by side on
plugin-internal APIs (`internalAdapter.createSession`) that Better Auth breaks
in minors, and it makes the consent page trust a cookie Better Auth cannot
revoke. MCP OAuth (Phase 2) ships on the Better Auth session after this cutover.
**Exception:** if Phase 1 slips past four weeks from acceptance, the bridge may
ship for the owner's account only, behind a flag, and is removed at the cutover.
_Proposed, owner to confirm._

### 7. Consent is asked on every new connection (H9)

Better Auth remembers consent per `(user, client)`, and with CIMD every
claude.ai connection shares one `client_id`, so a second connection would skip
the page. trainm8 sends `prompt=consent` semantics for every authorization that
is not a refresh: a `hooks.before` on `/oauth2/authorize` sends the request to
the consent page whatever the stored consent says. It does not delete or change
the `(user, client)` `oauthConsent` row, because that row is the live grant of
every existing connection and §8 checks it on each call. The row is written only
when the athlete approves, and a denied or abandoned request leaves it and every
existing connection as they were. If the pinned plugin cannot be made to show
the page without deleting the row, the hook keeps its own "consent asked" marker
per authorization request instead; deleting the live row is not an option. A
test starts a second authorization, denies it and abandons another, and proves
the first connection's next `/mcp` call still succeeds. The connected-assistants
page lists every live grant. This is the stricter of H9's two options.

### 8. Disconnect revokes at once (H8)

Disconnect on the connected-assistants page deletes, in one transaction, the
`(user, client)` rows in `oauthConsent`, `oauthRefreshToken` and
`oauthAccessToken`, and records the disconnect time for `(user, client)` in a
trainm8 table (`McpGrantRevocation`, one row per pair, only ever moved forward).
Because a JWT access token cannot be revoked, `/mcp` checks per call that a live
consent for `(sub, azp)` exists **and** that the token's `iat` is later than the
recorded disconnect time; a token issued in the same second as the disconnect is
rejected. The consent check alone is not enough: an athlete who disconnects and
reconnects within the token lifetime gets a new consent row for the same
`(sub, azp)`, and an old JWT would pass again. `accessTokenExpiresIn` is 600 s.
Tests prove a disconnected client gets 401 on its next call, and that a JWT from
before the disconnect still gets 401 after the athlete reconnects, while the new
connection's token succeeds.

### 9. Canonical URLs (H11)

One constant, `MCP_RESOURCE = new URL('/mcp', env.APP_ORIGIN)` with a lowercase
host, no trailing slash and no default port, feeds `mcp({ resource })`,
`requireMcpAuth({ resource })` and the connected-assistants page. `jwksUrl`
points inside the machine (`http://127.0.0.1:${PORT}/api/auth/jwks`). Production
refuses to boot if `APP_ORIGIN` is not canonical; a test pins both values.

### 10. Upstream bugs (H10)

- **#11949** (refused CIMD ids spend the fetch budget): a `hooks.before` on the
  CIMD fetch accepts only allow-listed `https://` client-id hosts (`claude.ai`,
  `claude.com`, and loopback for Claude Code), until a pinned release contains
  PR #11964.
- **#11629** (refresh-family revocation not atomic): the family can survive even
  serial requests, because a cleanup delete can fail after the successor token
  is written. A transaction in a `hooks.before` does not cover the grant
  handler's later writes, so the fix sits where the token rows are written,
  until a pinned release contains PR #11704:
  - On a reuse, the family is revoked durably **before** any cleanup: one
    `UPDATE` sets `revoked` on every `oauthRefreshToken` row of the
    `(user, client)` family, and a failure there fails the request. Cleanup runs
    afterwards and may fail without reopening anything.
  - The refresh grant refuses a token whose row has `revoked` set, or whose
    family has a revoked row, whatever the cleanup did. This check is in the
    adapter that reads the row, so it does not depend on the handler.
  - Tests: a serial replay with a failure injected into the cleanup delete
    leaves the successor token rejected; a concurrent replay of one token yields
    at most one success and then a revoked family.
- Each workaround is removed in the upgrade PR that pins the fixed version.

### 11. MCP transport and scopes (recorded from the spike)

- `createMcpHandler(..., { legacy: 'stateless' })`: Better Auth's
  `legacy: 'reject'` advice is not taken, because a 2025-era client fails
  against it.
- Scopes `training:read`, `training:propose`, `training:log`; the 401 challenge
  scope is `training:read`; `offline_access` stays in the AS metadata and out of
  the PRM. `advertisedMetadata` is not overridden.
- DCR stays on, both flags, until the owner's click shows claude.ai uses CIMD;
  then it is turned off.

## Consequences

- 39 auth files are rewritten behind the unchanged seam; ~60 loader tests that
  build an Epic cookie move to a test helper that signs a Better Auth session
  cookie.
- One forced sign-in for everyone, and 2FA users re-enrol: the notice is the
  owner's to send (#554, "Needs a human").
- The Epic `Session`, `Password`, `Connection`, `Passkey`, `Verification`,
  `Role` and `Permission` tables stay one release, then go.

## Deferred hardening

Each item is a shortcut or a known gap to be tracked on #639.

1. **H12. The re-enrolment window.** Between the cutover and a 2FA user's
   re-enrolment, their account is protected by password plus an email code, not
   TOTP. Closes when every flagged user has re-enrolled, or when the flag blocks
   sign-in after a set date.
2. **H13. Rate limits stay per IP for login.** Better Auth's limiter keys on the
   client IP (`fly-client-ip`, set explicitly). Per-account lockout beyond
   `twoFactor`'s own counter is not added. Closes with H7.
3. **H14. Workarounds for #11949 and #11629 are app code over plugin
   internals.** The #11629 one wraps the adapter's refresh-token reads and
   writes (§10), the plugin's own table layout. They break silently on an
   upgrade, which is why each has a test that fails if the workaround stops
   applying. Closes when a pinned version carries both fixes and the workarounds
   are deleted.
4. **H15. The bridge exception in §6**, if it is ever used, runs a second
   session system for the owner's account. Closes when it is deleted at the
   cutover.
5. **H16. bcrypt at cost 10** is kept for continuity. Closes when a rehash on
   sign-in moves hashes to a stronger cost or algorithm.
6. **H31. A rollback drops 2FA for users who re-enrolled after the cutover.**
   Epic cannot read a Better Auth TOTP secret, and reviving the Epic secret they
   replaced is worse, so §2's rollback deletes it. Those users have
   password-only accounts on Epic until they set up 2FA again. Closes when the
   Epic tables are dropped one release after the cutover, which ends the
   rollback window.

## Open for the owner

- §3 trusted device off — Proposed, owner to confirm.
- §3 re-enrolment instead of a legacy-TOTP verify path — Proposed, owner to
  confirm.
- §6 no bridge, with the four-week exception — Proposed, owner to confirm.
- §7 consent on every new connection — Proposed, owner to confirm.
- §8 access-token lifetime 600 s — Proposed, owner to confirm.
