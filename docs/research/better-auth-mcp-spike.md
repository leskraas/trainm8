# Better Auth's MCP plugin against Claude's connector, on both MCP eras: the spike

Prototype verdict for **#552** (map #541) · **2026-10-24** · a throwaway
prototype run locally and driven by scripts, the official SDK clients and the
MCP Inspector CLI. The one step left is the owner's click in Claude's connector
UI, scripted in [§10](#10-owners-click).

**Question.** Can Better Auth be the OAuth authorization server for trainm8's
`/mcp` while that endpoint serves **both** protocol eras, and does it pass
Claude's stricter OAuth client? The four sub-questions are the open ones from
[`stack-migration.md`](stack-migration.md) §9 and #541: `requireMcpAuth` behind
`legacy: 'stateless'`, Claude's canonical `aud`, the PRM's `scopes_supported`,
and whether an Epic Stack session can issue a Better Auth session so MCP OAuth
can ship before the Phase 1 login move.

**Verdict: Better Auth passes every check that can be run without the click, on
both eras. The node-oidc-provider fallback is not triggered.** The fixes it
needs are configuration and app code, not a fork. Four gaps carry into the build
tickets: deleting a consent does not revoke tokens, the token endpoint's rate
limit is per IP, `requireMcpAuth`'s default JWKS URL loops out through the
public URL, and two upstream bugs are still open
([§8](#8-what-failed-or-surprised)). #554 is unblocked on the technical
question. The bridge in [§7](#7-an-epic-session-can-issue-a-better-auth-session)
also takes it off MCP's critical path, if the owner wants that.

**Code and raw output.** The prototype is in
[`better-auth-mcp-spike/`](better-auth-mcp-spike/) as `.mts` reference files.
They are not app code, and `tsc` and ESLint skip them. The redacted output of
every run is in
[`better-auth-mcp-spike/evidence.md`](better-auth-mcp-spike/evidence.md), cited
below as **Run n**.

---

## 1. Setup and versions

All versions are exact pins, checked in the npm registry on 2026-10-24
([`package.json`](better-auth-mcp-spike/package.json)).

| Package                                                                                           | Version      | Note                                                       |
| ------------------------------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------- |
| `better-auth`, `@better-auth/mcp`, `cimd`, `oauth-provider`, `prisma-adapter`, `core`; CLI `auth` | **1.7.12**   | `latest` since 2026-10-20; `1.8.0-beta.2` exists           |
| `better-call`                                                                                     | 1.4.4        | exact peer of `@better-auth/mcp`                           |
| `@modelcontextprotocol/server`, `/client`                                                         | **2.4.0**    | `latest`, published 2026-10-23 (the MCP note read 2.3.1)   |
| `@modelcontextprotocol/sdk` (v1, the 2025-era client)                                             | 1.32.2       | `LATEST_PROTOCOL_VERSION` is `2025-11-25`                  |
| `@modelcontextprotocol/inspector`                                                                 | 2.12.0       | CLI mode                                                   |
| `prisma`, `@prisma/client`                                                                        | 6.19.2       | trainm8's version, SQLite                                  |
| `react-router`                                                                                    | 7.13.0       | trainm8's version, for Epic's `createCookieSessionStorage` |
| `zod`                                                                                             | 4.6.5        | trainm8's version                                          |
| `@hono/node-server`, `jose`                                                                       | 2.1.5, 6.1.3 | Node adapter, JWT decode                                   |
| Node                                                                                              | 22.22.0      | runs `.mts` by type stripping                              |
| `oidc-provider` (the fallback, not installed)                                                     | 9.13.0       | for §9                                                     |

**The prototype** ([`auth.mts`](better-auth-mcp-spike/auth.mts),
[`server.mts`](better-auth-mcp-spike/server.mts)):

- **Better Auth** on Prisma and SQLite, sharing **Epic's own `User` table**
  ([`schema.prisma`](better-auth-mcp-spike/schema.prisma)). Its session, account
  and verification tables sit beside Epic's as `baSession`, `baAccount` and
  `baVerification`.
- **Plugins:** `jwt()`, then
  `mcp({ resource: '<base>/mcp', loginPage, consentPage })` with both DCR flags
  and `clientRegistrationDefaultApplicationType: 'infer'`, then
  `cimd({ fetchClientMetadataResource, metadataProfile: 'mcp-2026-07-28' })`.
  `fetchClientMetadataResource` is the SSRF-pinned Node transport.
- **Scopes:**
  `openid offline_access training:read training:propose training:log`.
- **The MCP route:**
  `createMcpHandler(factory, { legacy: 'stateless', responseMode: 'json' })`
  behind
  `requireMcpAuth(auth, handler, { resource, requiredScopes: ['training:read'] })`.
- **Two tools:** `get_week` and `propose_week_change`. The second needs
  `training:propose` through a step-up gate.
- **Pages:** bare login and consent pages, and the Epic-session bridge.

**The clients**, each of which walks the whole flow and records every response:

- [`claude-sim.mts`](better-auth-mcp-spike/claude-sim.mts) does what
  [Claude's authentication page](https://claude.com/docs/connectors/building/authentication)
  says Claude does. It sends a `401` probe, reads the PRM and then the AS
  metadata, picks CIMD only if both flags are present and DCR otherwise, and
  runs PKCE S256 with `resource`. It asks for the scopes in the `401` plus
  `offline_access`, then exchanges the code form-urlencoded, calls `/mcp` on
  2025-06-18, 2025-11-25 and 2026-07-28, and refreshes.
- The client ids are **Claude's real CIMD documents**: claude.ai's
  (`https://claude.ai/oauth/mcp-oauth-client-metadata`, redirect
  `https://claude.ai/api/mcp/auth_callback`, grant types including `jwt-bearer`)
  and Claude Code's (loopback redirect on any port). Both were fetched live on
  2026-10-24.
- [`sdk-clients.mts`](better-auth-mcp-spike/sdk-clients.mts) runs the official
  v1 and v2 SDK clients with their own OAuth implementations.
- [`negative.mts`](better-auth-mcp-spike/negative.mts) and
  [`stepup.mts`](better-auth-mcp-spike/stepup.mts) run the checks that should
  fail.

## 2. Verdict per check

| #   | Check (#552, MCP §3.1–3.2)                                                                                    | Verdict                                                                      | Evidence          |
| --- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------- |
| 1   | `requireMcpAuth` behind `legacy: 'stateless'`: 2025-06-18 and 2025-11-25                                      | **Works**                                                                    | Runs 1–3, 8, 9    |
| 2   | The same token on 2026-07-28 (v2 client pinned)                                                               | **Works**                                                                    | Runs 1–3, 8       |
| 3   | `legacy: 'reject'` (Better Auth's advice) with a 2025-era client                                              | **Fails**, as the MCP note predicted: `-32022`                               | Run 7             |
| 4   | 401 with `WWW-Authenticate: Bearer resource_metadata=…, scope=…`                                              | **Works**                                                                    | Run 1 §1          |
| 5   | PRM `resource` equals the URL exactly, including `/mcp`                                                       | **Works**                                                                    | Run 1 §2          |
| 6   | PRM `scopes_supported` has no `offline_access`                                                                | **Works**: `training:read training:propose training:log`                     | Run 1 §2          |
| 7   | AS metadata at the RFC 8414 path-inserted URL, and `issuer` equals the fetch URL                              | **Works** (`/.well-known/oauth-authorization-server/api/auth`)               | Run 1 §3          |
| 8   | Claude's CIMD trigger: `client_id_metadata_document_supported` and `"none"`                                   | **Works**: both advertised                                                   | Run 1 §3          |
| 9   | CIMD with claude.ai's real document (it includes `jwt-bearer`)                                                | **Works**: fetched, validated, stored, token issued                          | Run 2             |
| 10  | CIMD with Claude Code's document, loopback on a random port (`localhost`, `127.0.0.1`)                        | **Works**                                                                    | Runs 3, 3b        |
| 11  | DCR fallback as Claude registers (public client, claude.ai callback)                                          | **Works**: `201`, `token_endpoint_auth_method: none`                         | Run 1 §4          |
| 12  | PKCE: S256 only; missing or `plain` refused                                                                   | **Works**                                                                    | Run 5 D2, D3      |
| 13  | `iss` in the authorization response (RFC 9207)                                                                | **Works**                                                                    | Run 1 §6          |
| 14  | Token endpoint accepts form-urlencoded; latency                                                               | **Works**: 24–148 ms locally                                                 | Runs 1–3          |
| 15  | `aud` is the canonical resource; non-canonical forms refused                                                  | **Works**, by exact string match (§4)                                        | Run 1 §7; Run 5 A |
| 16  | Tokens that are not ours (id_token, edited `aud`, garbage, opaque) → 401                                      | **Works**                                                                    | Run 5 A, C        |
| 17  | Refresh rotates; replay in 30 s returns the same response; later replay → `invalid_grant` and the family dies | **Works**                                                                    | Run 1 §9          |
| 18  | 403 `insufficient_scope` naming every missing scope, both eras, per tool                                      | **Works**, with a pre-dispatch gate (§6)                                     | Runs 5 B, 6       |
| 19  | Revocation (RFC 7009) of a refresh token                                                                      | **Works**; the 1 h JWT lives on                                              | Run 5 E1          |
| 20  | "Disconnect" (delete consent) stops refresh                                                                   | **Fails**: refresh still succeeds                                            | Run 5 E2          |
| 21  | Epic session → Better Auth session → consent → code                                                           | **Works**, also for a user with no Better Auth account row                   | Runs 4, 4c        |
| 22  | Behind a TLS front that keeps `Host`, as a tunnel or Fly's edge does                                          | **Works** once `jwksUrl` points inside; the default gives `500` (§8, item 8) | Run 11            |
| 23  | Claude's real client end to end, over a public HTTPS URL                                                      | **Untested**: the owner's click (§10)                                        | —                 |

## 3. Both eras: `requireMcpAuth` is protocol-agnostic

`requireMcpAuth` reads only the `Authorization` header and never the JSON-RPC
body. It verifies signature, `iss`, `aud`, `exp` and a required `azp` against
the JWKS, and then calls the handler (pkg `@better-auth/mcp@1.7.12`
`dist/index.mjs:226-249`). Nothing in it depends on the protocol era.

- **With `legacy: 'stateless'`, one token served all three revisions** (Runs
  1–3):
  - `initialize` on 2025-06-18 and on 2025-11-25 returned `200` with no
    `Mcp-Session-Id`;
  - a bare `tools/call` on 2025-era headers returned `200`, because each legacy
    request gets a fresh instance;
  - a 2025-era `GET /mcp` returned `405`;
  - the v2 client pinned to `2026-07-28` negotiated `2026-07-28`, listed the
    tools and called them.
- **The server log shows the factory's `era`:** `legacy` for the first two
  revisions and `modern` for 2026-07-28.
- **The official clients pass too** (Runs 8, 9):
  - the v1 SDK client (1.32.2), with its own OAuth over DCR, negotiated
    `2025-11-25`;
  - the v2 client (2.4.0), with its own OAuth over CIMD, negotiated
    `2026-07-28`;
  - the MCP Inspector CLI (2.12.0, a 2025-era client) listed and called the
    tools with a bearer token.
- **With `legacy: 'reject'`, the same 2025-era requests fail** with
  `400 {"code":-32022,"message":"Unsupported protocol version: 2025-06-18","data":{"supported":["2026-07-28"]}}`,
  and the modern client still works (Run 7). This is the failure the
  [MCP note §2.2](mcp-server-for-trainm8.md#22-stateless-versus-session-mode-and-why-both-eras-matter)
  predicted for Claude if its hosted client is still 2025-era.

**Decision for ADR 0094:** keep the SDK's default `legacy: 'stateless'` and
disregard Better Auth's `legacy: "reject"` advice. That advice belongs to the
MCP 2026-07-28 profile Better Auth documents; it is not something the plugin
needs. Bredvid/tavla reached the same conclusion for its catalogue
(Bredvid/tavla `docs/research/anc-mcp-katalog.md`, F5 consequence 2). The click
records which era claude.ai actually speaks (§10, step 6).

## 4. PRM `scopes_supported`, and Claude's canonical `aud`

**PRM.**

- `mcp()` builds `scopes_supported` from the provider's `scopes` and drops the
  authorization-server-only scopes: `openid`, `profile`, `email`, `phone`,
  `address` and `offline_access` (`dist/index.mjs:89-124`).
- In the spike that leaves `["training:read","training:propose","training:log"]`
  (Run 1 §2). The AS metadata still lists `offline_access`, so Claude appends
  it, as its docs say.
- **Without `offline_access` Better Auth issues no refresh token** (Run 10), so
  the AS must keep listing it.
- **The challenge carries a scope.** `requireMcpAuth`'s
  `challengeScopes: ['training:read']` puts `scope="training:read"` on the
  `401`. Claude prefers that over the PRM, so Claude asks for `training:read`
  and nothing more.

The MCP note (§3.4) wanted only `training:read` in `scopes_supported`. Two ways
to get there:

- The scope in the `401` already gives the least-privilege request, so the PRM
  list is only a fallback.
- Or set `advertisedMetadata.scopes_supported`, which `mcp()` reads first. That
  also changes the AS metadata.

Bredvid/tavla cites the security guide's warning against "Publishing all
possible scopes in `scopes_supported`" (Bredvid/tavla
`docs/research/anc-rettigheter.md`). **Recommendation:** rely on the challenge
scope, and decide on `advertisedMetadata` in ADR 0094.

**`aud`.** Better Auth binds `resource` to `aud` by **exact string match**
against the configured resource:

- `validateMcpResource` returns the string unchanged, and `requireMcpAuth`
  passes it to `jose` as `audience` (`dist/index.mjs:14-27`, `:53-70`).
- The canonical URL passes (`aud: "http://localhost:3000/mcp"`, Run 1 §7).
- `…/mcp/`, an uppercase host and a foreign path each come back to the client as
  `invalid_target` (Run 5 A).
- With no `resource` at all, the token is opaque, and `/mcp` rejects it with
  `401`.

So Better Auth accepts Claude's canonical `aud` **if the configured `resource`
is itself canonical**: lowercase host, no trailing slash, no default port. The
user must also type it into Claude in that form, because the PRM `resource` has
to equal the URL as entered.

**Rule for the build:** set `resource` from one constant, `https://<host>/mcp`,
and print that exact string on the connected-assistants page.

## 5. What Claude's stricter client needs, and what the spike shows

| Claude requirement ([authentication](https://claude.com/docs/connectors/building/authentication)) | Better Auth 1.7.12                                                                                                 |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `401` to start sign-in, never `WWW-Authenticate` on `200`                                         | `requireMcpAuth` answers `401` with a JSON-RPC error body and the challenge                                        |
| Uses only the first `authorization_servers` entry                                                 | One entry, the issuer `<base>/api/auth`                                                                            |
| CIMD only with both flags, otherwise DCR                                                          | Both flags, so Claude takes CIMD. DCR stays on as the fallback, or for "Register automatically" in Claude's dialog |
| Hosted apps' callback `https://claude.ai/api/mcp/auth_callback`                                   | From claude.ai's CIMD document (Run 2) or the DCR body (Run 1)                                                     |
| Claude Code: loopback on any port, `localhost` and `127.0.0.1`                                    | Port-agnostic match for both (Runs 3, 3b)                                                                          |
| PKCE S256 on every request                                                                        | S256 only (Run 5 D2, D3)                                                                                           |
| Form-urlencoded token endpoint; `invalid_grant` for a dead refresh token; under 10 s and 30 s     | Yes (Run 1 §9); 24–148 ms locally                                                                                  |
| Rotate refresh tokens for public clients                                                          | Yes, with a 30 s replay window that returns the same response (`refreshTokenReuseInterval`)                        |
| Requests come from `160.79.104.0/21`                                                              | **Watch:** Better Auth's rate limits are per IP (§8)                                                               |

Bredvid/tavla had not verified `@better-auth/mcp` with CIMD against claude.ai
(Bredvid/tavla `docs/research/anc-r3-bibliotek.md`, K1 "V3"). Run 2 verifies it
against claude.ai's live CIMD document, short of claude.ai itself making the
calls.

## 6. Per-tool step-up on both eras

`requiredScopes` on `requireMcpAuth` applies to the whole endpoint. To step up
per tool, the gate must run **before** the SDK dispatches, because a throw
inside a tool handler becomes a tool error, not an HTTP `403`.

The spike reads the tool names and throws Better Auth's
`createInsufficientScopeError`
([`server.mts`](better-auth-mcp-spike/server.mts), `TOOL_SCOPES`, `toolNames`):

- from every `tools/call` in the JSON-RPC body, batches included, on both eras,
  because dispatch runs the body's `params.name`;
- plus the `Mcp-Name` header when it disagrees with the body. The 2025 era
  ignores the header, and 2026-07-28 decodes `=?base64?…?=` before its own
  cross-check, so a header-first gate could be lied to.

Run 6 sends four bypasses with a `training:read` token: a legacy call with
`Mcp-Name: get_week`, a legacy batch `[get_week, propose_week_change]`, and a
2026-07-28 call with a Base64-encoded or lying `Mcp-Name`. All four get the
`403`. Before 50960a4, the first three ran the proposal (Run 6, before the fix).

`requireMcpAuth` turns the throw into
`403 Bearer error="insufficient_scope", scope="training:read training:propose", resource_metadata=…`
on both eras. The v2 client raises its own `InsufficientScopeError`, and the
same calls succeed once the token carries `training:propose` (Run 6).

**For the registry (ADR 0092):** derive `TOOL_SCOPES` from each action's kind,
as the MCP note's §3.4 table already does.

## 7. An Epic session can issue a Better Auth session

**Works** (Runs 4, 4c).

`mcp()`'s `loginPage` is trainm8's own route. When it finds a live Epic session
(the `en_session` cookie plus a `Session` row, which is Epic's `getUserId`), it
calls a 25-line server-only Better Auth endpoint,
[`epic-bridge.mts`](better-auth-mcp-spike/epic-bridge.mts). That endpoint calls
`ctx.context.internalAdapter.createSession(userId)` and `setSessionCookie`.
oauth-provider's own after-hook sees the new session cookie and the stored
`oauth_query`, and resumes `/oauth2/authorize` straight to the consent page (pkg
`@better-auth/oauth-provider@1.7.12` `dist/authorize-D_jy3s-1.mjs`,
`hooks.before` and `hooks.after` around `:4581-4630`).

The trace was
`authorize → /login → (Epic login) → /login → /consent → callback`. It worked
for a user created the Epic way: cuid id, `name` null, no Better Auth `account`
row.

**What it costs, in the spike's schema:**

- **Better Auth shares Epic's `User`.** It adds two columns, `emailVerified` and
  `baImage`. `image` is mapped away from Epic's `UserImage` relation.
- **`username` becomes an `additionalField`.**
- **Better Auth's own tables sit beside Epic's:** `baSession`, `baAccount`,
  `baVerification`, `jwks` and the five `oauth*` tables.
- **Nothing in Epic's auth changes.** `getUserId` and `requireUserId` stay as
  they are, and passkey, TOTP and GitHub sign-in keep working, because they all
  end in an Epic session.
- **Refresh does not need the Better Auth session.** The refresh grant checks
  client, row, expiry, revocation and that the user exists, not the session (pkg
  `oauth-provider@1.7.12` `dist/introspect-DeWu79D4.mjs`,
  `handleRefreshTokenGrant` around `:2110-2190`). So the bridged session can be
  short-lived.

**The price:**

- `internalAdapter` and `setSessionCookie` are plugin-facing APIs, but Better
  Auth breaks APIs in minors.
- Two session systems run side by side until Phase 1.
- **`auth.api` calls into oauth-provider must carry `request`**, or the
  authorize continuation fails with `401 "request not found"`
  (`authorize-D_jy3s-1.mjs:5656`).

**What it means for the plan.** MCP OAuth (Phase 2) no longer has to wait for
the full login move (Phase 1, 3–5 weeks). Better Auth can be installed as the
authorization server only, with Epic still owning login. The bridge is a
supported option, not a recommendation. Whether to take it is the owner's call
in ADR 0094; it trades a temporary second session system for shipping MCP
earlier.

## 8. What failed or surprised

1. **`legacy: 'reject'` breaks 2025-era clients** (Run 7). Keep `stateless`
   (§3).
2. **Deleting a consent does not revoke anything** (Run 5 E2).
   - After `POST /oauth2/delete-consent`, the refresh token still refreshes
     (`200`), and the old JWT still reads `/mcp` until it expires.
   - Bredvid/tavla found the same in the source (Bredvid/tavla
     `docs/research/anc-r3-bibliotek.md`, K4).
   - **The connected-assistants page must delete the `(user, client)` rows in
     `oauthRefreshToken` and `oauthAccessToken` as well**, in one transaction.
   - Either check the consent per call, or shorten `accessTokenExpiresIn`. The
     spike's `ACCESS_TTL` shows the setting works (Run 10).
3. **JWT access tokens cannot be revoked** (Run 5 E1). This is documented, and
   it makes item 2's per-call check or a short lifetime necessary.
4. **The rate limits are per IP and switch on only in production** (Run 5b;
   `authorize-D_jy3s-1.mjs:5383-5414`).
   - The defaults per 60 s are: token 20, authorize 30, register 5, revoke 30.
   - All Claude traffic leaves from one `/21`, so 20 token or refresh calls a
     minute would be shared across every athlete.
   - Raise `rateLimit.token`, or key it per client, before a second athlete
     connects. Also set Better Auth's IP header to `fly-client-ip`.
   - This is MCP §6.8's problem showing up again in Better Auth's limiter.
5. **Two upstream bugs are open on 2026-10-24.**
   - [#11949](https://github.com/better-auth/better-auth/issues/11949): refused
     CIMD client ids spend the shared fetch budget (120 a minute globally, 30
     per origin), so a flood can make claude.ai's re-fetch return `429`. The
     fix, PR #11964, is unmerged. Workaround: a `hooks.before` that rejects
     non-allow-listed `https://` client ids.
   - [#11629](https://github.com/better-auth/better-auth/issues/11629):
     `invalidateRefreshFamily` is not atomic. The fix, PR #11704, is unmerged.
   - Bredvid/tavla tracks both (Bredvid/tavla
     `docs/research/anc-r3-bibliotek.md`, risk section).
6. **`npx auth generate` (`auth@1.7.12`) wrote a Prisma schema that does not
   validate on SQLite.**
   - It emitted `clientCredentialsScopes String? @default([])` (P1012).
   - It also added `@@map("user")` to Epic's `User`. That is harmless on SQLite,
     where table names are case-insensitive, but wrong on Postgres.
   - Both edits are noted in
     [`schema.prisma`](better-auth-mcp-spike/schema.prisma). Review the
     generated schema by hand in #554.
7. **Better Auth chooses between a JSON `{redirect,url}` and a `302` by request
   headers.** Node's `fetch` always sends `sec-fetch-mode: cors`, which gets
   JSON (`authorize-D_jy3s-1.mjs:5483-5491`). Real browsers navigate and get
   `302`. Test harnesses must use `node:http`, as
   [`browser.mts`](better-auth-mcp-spike/browser.mts) does, or they will see
   JSON. trainm8's login and consent actions should handle both shapes, as
   `asRedirect` in [`server.mts`](better-auth-mcp-spike/server.mts) does.
8. **`requireMcpAuth`'s defaults point at the wrong places**
   (`dist/index.mjs:231-233`).
   - It defaults `resource` to Better Auth's base URL (`<base>/api/auth`), not
     `/mcp`. Always pass `resource`.
   - It fetches the JWKS from itself at `${BASE_URL}/api/auth/jwks`, so behind a
     tunnel or Fly's edge the request goes out through the public URL and back.
   - When that fetch fails, **every `/mcp` call answers `500`, not `401`** (Run
     11, before the fix).
   - The spike sets `jwksUrl` to `http://127.0.0.1:<port>/api/auth/jwks`
     ([`server.mts`](better-auth-mcp-spike/server.mts)). Do the same in the
     build.
9. **Consent is remembered per `(user, client)`.**
   - With CIMD every claude.ai connection shares one `client_id`, so a second
     connection skips the consent page (Run 4b).
   - Bredvid/tavla wanted consent every time and sketched a `prompt=consent`
     hook for it (Bredvid/tavla `docs/research/anc-r3-bibliotek.md`, K5).
   - Decide this in ADR 0094.
10. **Unauthenticated DCR is open** (Run 5 F: 40 registrations, all `201`,
    outside production).
    - Claude uses CIMD when both flags are present, so DCR is only a fallback.
    - Keep it on for "Register automatically" and older clients, or turn it off
      once the click shows CIMD works. Turning it off removes
      `registration_endpoint` from discovery (`DCR=off` in
      [`auth.mts`](better-auth-mcp-spike/auth.mts)).

## 9. Fallback verdict: node-oidc-provider

The fallback ([MCP §3.3](mcp-server-for-trainm8.md#33-what-trainm8-would-build),
option A, `oidc-provider` 9.13.0) was to take over if `@better-auth/mcp` failed
against Claude's client. **No check failed that the fallback would fix.**

- **Era handling (§3)** is the SDK's `legacy` setting, so it is the same under
  either authorization server.
- **The open items in §8** are revocation semantics and rate limits that trainm8
  must configure under either library.
- **node-oidc-provider would handle consent revocation better.** Bredvid/tavla
  found that revoking a grant there deletes its tokens and that refresh checks
  the account (Bredvid/tavla `docs/research/anc-r3-bibliotek.md`, K4). But it
  costs about 2–4 weeks, and it would still need the same login and consent
  pages.

**Recommendation: proceed with option D (Better Auth as the authorization
server) and draft ADR 0094 after the click.** Fall back only if the click fails
in a way §10 cannot fix in configuration. The candidates are a claude.ai refusal
of the CIMD flow, or a protocol era the server cannot serve. Record the failing
step in #552 if it comes to that.

**What ADR 0094 should record:**

- `legacy: 'stateless'`;
- scopes `training:read`, `training:propose` and `training:log`, with the
  challenge scope `training:read`;
- the canonical `resource` constant, passed with an internal `jwksUrl`;
- the disconnect semantics (item 8.2) and the access-token lifetime;
- the per-client rate limit;
- consent-every-time or remembered;
- the bridge or a cutover;
- DCR on or off.

## 10. Owner's click

This is the only step left in #552. It takes about 15 minutes, needs Node 22.18
or later (for `.mts`) and `cloudflared` (or ngrok), and works on a claude.ai
Free, Pro or Max account.

1. **Copy the spike out of the repo and install it.**

   ```sh
   cp -r docs/research/better-auth-mcp-spike /tmp/ba-spike && cd /tmp/ba-spike
   npm install
   ```

2. **Start the tunnel first**, so the server can be told its public URL:

   ```sh
   cloudflared tunnel --url http://localhost:3000
   ```

   Note the `https://<random>.trycloudflare.com` it prints. ngrok works the same
   way: `ngrok http 3000`.

3. **In a second terminal, start the server on that URL.** Use lowercase and no
   trailing slash. `ACCESS_TTL=120` makes Claude's refresh visible within
   minutes.

   ```sh
   export BASE_URL=https://<random>.trycloudflare.com
   export SPIKE_PASSWORD='<pick one>' BETTER_AUTH_SECRET=$(openssl rand -hex 32) ACCESS_TTL=120
   npm run setup && npm start | tee server.log
   ```

4. **Smoke-test the public URL before clicking.** Every section should print
   `200`s, `"cimdOk": true` and `"negotiated": "2026-07-28"`, the same as Run 1.

   ```sh
   MCP_URL=$BASE_URL/mcp CLIENT=dcr SKIP_REFRESH_WAIT=1 SPIKE_PASSWORD='<same>' npm run smoke
   ```

   Use the disposable DCR client here, not `CLIENT=claude-web`. Consent is saved
   per `(user, client)`, so a preflight as claude.ai's CIMD client would save
   consent for the athlete and the click in step 5 would skip the consent page
   that step 6 checks (Run 4b).

5. **Add the connector in Claude.**
   - Go to **Customize → Connectors → Add custom connector**. On a Team or
     Enterprise plan it is **Organization settings → Connectors → Add →
     Custom**.
   - Name it `trainm8 spike`, and paste exactly
     `https://<random>.trycloudflare.com/mcp`.
   - If the dialog asks, choose **Sign in now** and **Use Claude's published
     identity** (CIMD).
   - Leave the OAuth client id and secret empty, then click **Add** and
     **Connect**.

6. **What success looks like.**
   - A browser tab opens `<tunnel>/login`. Sign in as `athlete@example.com` with
     `SPIKE_PASSWORD`.
   - `/consent` shows "Allow Claude?", scope `training:read offline_access`, and
     "Returns to **claude.ai**". Click **Allow**.
   - Claude shows the connector as connected, with the tools `get_week` and
     `propose_week_change`.
   - In a new chat with the connector on, ask "Call get_week from trainm8
     spike". The answer reads `week for athlete (era=…, client=…, …)`:
     - `era=` answers which protocol claude.ai speaks: `legacy` (2025) or
       `modern` (2026-07-28);
     - `client=` shows `https://claude.ai/oauth/mcp-oauth-client-metadata` for
       CIMD, or a random id for DCR.
   - After 2–5 minutes, ask again. `server.log` should show
     `POST /api/auth/oauth2/token` (the refresh) and no new sign-in.

7. **Step-up (optional).** Ask Claude to call `propose_week_change`. The server
   answers `403 insufficient_scope`. Record whether Claude asks you to
   re-authorize with `training:propose`, and whether the call then succeeds.
8. **DCR (optional).** Remove the connector, then add it again choosing
   **Register automatically**. `server.log` should show
   `POST /api/auth/oauth2/register`.
9. **Record and close.** Paste into #552:
   - the `mcp era=… client=…` lines from `server.log`;
   - any non-`2xx` line;
   - the answers to steps 6–8.

   If it all works, #552 closes and ADR 0094 is drafted. If a step fails, name
   it; §9 says whether the fallback applies.

10. **Clean up.** Stop the tunnel, then delete `/tmp/ba-spike` and the
    connector.

**Troubleshooting:**

- **"Couldn't reach the MCP server"** means the tunnel is down, or `BASE_URL`
  does not match the tunnel host. Check
  `curl $BASE_URL/.well-known/oauth-protected-resource/mcp`.
- **`invalid_target`** means the pasted URL differs from `BASE_URL/mcp`: case, a
  trailing slash, or a port.

The bridge link on `/login` exists only on `localhost`, because it would let
anyone sign in on a public URL.

## 11. Reproduce locally

The locally runnable part of §10 needs no tunnel.

In the first terminal, install, set up and start the server in the foreground:

```sh
cp -r docs/research/better-auth-mcp-spike /tmp/ba-spike && cd /tmp/ba-spike
npm install && npm run setup && npm start        # http://localhost:3000
```

Once it logs that it is listening, run the clients from a second terminal:

```sh
cd /tmp/ba-spike
CLIENT=claude-web node claude-sim.mts            # Run 2; also claude-code, dcr
LOGIN=epic CLIENT=dcr node claude-sim.mts        # Run 4, the bridge
LEGACY=reject npm start                          # restart, then claude-sim: Run 7
node negative.mts; node stepup.mts; node sdk-clients.mts
npx mcp-inspector --cli http://localhost:3000/mcp --method tools/list --header "Authorization: Bearer <token>"
```

## Sources

**Primary.**

- The published tarballs of `@better-auth/mcp`, `@better-auth/cimd`,
  `@better-auth/oauth-provider` and `better-auth`, all 1.7.12, read from
  `node_modules`; the file and line cites are above.
- `@modelcontextprotocol/server` and `/client` 2.4.0 type declarations
  (`createMcpHandler` `legacy`, `versionNegotiation`).
- The npm registry, 2026-10-24.
- [Better Auth MCP plugin](https://www.better-auth.com/docs/plugins/mcp).
- [Claude: Authentication for connectors](https://claude.com/docs/connectors/building/authentication)
  and
  [Add a connector that isn't in the directory](https://claude.com/docs/connectors/custom/add-unlisted).
- Claude's CIMD documents: <https://claude.ai/oauth/mcp-oauth-client-metadata>
  and <https://claude.ai/oauth/claude-code-client-metadata>, fetched 2026-10-24.
- Better Auth issues
  [#11949](https://github.com/better-auth/better-auth/issues/11949) and
  [#11629](https://github.com/better-auth/better-auth/issues/11629), read
  2026-10-24.

**Sibling project.** Bredvid/tavla, a project by the same team, written in
Norwegian:

- Bredvid/tavla `docs/research/anc-r3-bibliotek.md`: Better Auth against
  node-oidc-provider, Hydra and Keycloak as the authorization server for `/mcp`;
- Bredvid/tavla `docs/research/anc-mcp-katalog.md`: the `legacy: 'stateless'`
  conclusion;
- Bredvid/tavla `docs/research/anc-rettigheter.md`: `scopes_supported` and the
  scope model;
- Bredvid/tavla `docs/research/anc-r4-websesjon.md`: Better Auth's advisory
  history.

**This repo.**

- [`mcp-server-for-trainm8.md`](mcp-server-for-trainm8.md) §2.2, §3;
- [`stack-migration.md`](stack-migration.md) §4.3–4.4, §9;
- [`agent-strategy.md`](agent-strategy.md);
- `app/utils/session.server.ts` and `app/utils/auth.server.ts` (Epic's session,
  mirrored in the bridge);
- `prisma/schema.prisma` (`User`, `Session`).
