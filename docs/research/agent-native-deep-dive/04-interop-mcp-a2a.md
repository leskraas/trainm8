# Appendix 04 — Interop: MCP, MCP Apps, WebMCP, A2A, embedding, workspaces, cross-app identity

> **Appendix to [agent-native-deep-dive.md](../agent-native-deep-dive.md).**
> The MCP server and its OAuth server, the MCP client, MCP Apps, WebMCP, A2A,
> embedding and workspaces. Read at agent-native commit `a03f638` (2026-10-20,
> `@agent-native/core` 0.210.0); baseline `1284000325bf` (0.206.0). Compiled
> 2026-10-20. Citations as in the main document.

Spot-check of the live site (`curl https://www.agent-native.com/docs/<slug>/`,
2026-10-20): `mcp-protocol`, `external-agents-catalog`, `a2a-protocol` render the
same text as the repo `.mdx` — e.g. "hosted wait is capped at 25 seconds",
"Refresh tokens are stored only as hashes and are not rotated", the "always
included regardless of the declared list" builtins sentence, the
"`A2A_SECRET`-signed JWT" connect-token sentence, "A shared `A2A_SECRET` is mounted
into every app", and no mention of the `actions/invoke` JSON-RPC method. No
site/repo mismatch found. None of the 26 assigned pages changed since 0.206.0
except `multi-app-workspace` (a `builtinAgents.urls` override, +10/−3) and the new
`recorder` page (git `f99e655`); the code underneath changed a lot (MCP/A2A code:
81 files, +27,120/−3,241 lines, mostly specs).

---

## 0. The ten things that matter most

1. **The MCP server is a per-request, stateless MCP SDK v2 server.** Every
   `POST /mcp` builds a fresh `Server` from the verified caller and drives it
   through `createMcpHandler(..., { legacy: "stateless", responseMode: "auto" })`,
   which "serves native 2026-07-28 envelopes and stateless 2025-era traffic from
   the same factory" (`AN packages/core/src/mcp/server.ts:323–340`,
   `AN packages/core/src/mcp/fetch-handler.ts:100–103`). Pinned to
   `@modelcontextprotocol/server` and `/client` **2.0.0** exactly, `core ^2.2.0`,
   `ext-apps` 2.0.3 (`AN packages/core/package.json:682–686`, `AN pnpm-lock.yaml:11010–11040`);
   npm `latest` for `server` is 2.3.1.
2. **Approval over MCP is the 2026 `input_required` elicitation, not the agent
   loop.** A `needsApproval` call returns `inputRequired({ inputRequests: {
   actionApproval: elicit({ decision: approve|deny }) }, requestState })`; the
   request state comes from the SDK's `createRequestStateCodec` keyed with the auth secret and bound to method + caller, and a DB nonce in
   `mcp_action_approvals` binds caller + action + args hash and is consumed once
   (`AN packages/core/src/mcp/build-server.ts:2988–3117`,
   `AN packages/core/src/mcp/execute-action-call.ts:805–909`). Only a verified
   **user** identity can approve. This was already the mechanism at 0.206.0; the
   docs still never describe it.
3. **Five different human-approval mechanisms exist, one per surface** (§8):
   in-app chat card (with "always allow"), MCP elicitation, an A2A browser review
   page `/_agent-native/a2a/approvals/:id` that needs the task owner's live
   session, WebMCP refusal (409), and none at all for UI/HTTP/CLI and for remote
   MCP-server tools the app consumes (unless the app installs a resolver).
4. **OAuth 2.1 AS is home-grown, symmetric and long-lived.** RFC 9728 PRM, RFC 8414
   metadata with `client_id_metadata_document_supported: true` and RFC 9207
   `iss`, DCR for public clients only, PKCE S256 only, HS256 JWT access tokens
   signed with `A2A_SECRET` (or the Better Auth secret) and a **30-day default
   TTL**, refresh tokens hashed and, as documented, not rotated and without a
   fixed expiry (docs mcp-protocol L383). A live org-membership + retired-email
   check runs on every request (`AN packages/core/src/mcp/oauth-route.ts`,
   `oauth-store.ts:37–60,674`, `build-server.ts:4134–4216`). We noted
   security-relevant gaps in this area; they are recorded separately in
   a private note.
5. **Catalog tiers are the main external-exposure control**: compact (6 builtins
   plus opt-ins) by default, connector/authenticated-reads, `app`, `directory`, and
   `full` (a deploy env var or a token claim, per the docs). We noted
   security-relevant gaps in this area; they are recorded separately in
   a private note.
6. **MCP Apps inline UI is off by default.** Resources and `_meta.ui` are only
   advertised when `AGENT_NATIVE_MCP_APPS_INLINE=1`, an email allow-list, a
   directory profile, or a first-party sibling call sets
   `x-agent-native-mcp-inline-apps` (`AN packages/core/src/mcp/build-server.ts:361–379,2342–2353`,
   `AN packages/core/changelog/archive/CHANGELOG.md:8560–8565`).
7. **A2A is JSON-RPC A2A 0.3 with Agent-Native extensions** (`type` parts,
   `processing` state, a non-standard `actions/invoke` method, async self-fired
   processor, idempotency keys, owner-scoped tasks, approval review pages,
   `agent-native/agent-activity` data parts) and a client that also speaks A2A
   1.0 (`SendMessage`, `ROLE_USER`, `TASK_STATE_*`)
   (`AN packages/core/src/a2a/agent-card.ts:21`, `handlers.ts:1639–1687`,
   `client.ts:1329–1400,1633–1707`).
8. **One symmetric secret is the root of cross-app trust.** `A2A_SECRET` signs
   A2A user assertions, MCP OAuth access tokens, the OAuth consent token,
   `ask_app` task handles, the identity-SSO assertion, first-party sibling MCP
   tokens, and the async processor HMAC (MCP tokens, the consent token and task
   handles fall back to the Better Auth secret when `A2A_SECRET` is unset). Org
   secrets verify only an organization principal; a user assertion verified
   only by an org secret is "demoted" (`AN packages/core/src/a2a/server.ts:423–616`).
   We noted security-relevant gaps in this area; they are recorded separately
   in a private note.
9. **The app as an MCP client** keeps one `McpClientManager` per (user, org)
   principal (LRU 32, idle 15 min, config refresh 60 s), namespaces tools as
   `mcp__<serverId>__<tool>` with `user_<emailhash10>_` / `org_<orgId>_` /
   `hub_<orgId>_` prefixes, encrypts secret-looking headers in `app_secrets`,
   runs its own OAuth 2.1 client (DCR + PKCE + RFC 8707 + RFC 9207, SSRF-guarded),
   and gives stdio children only a 7-variable env allow-list
   (`AN packages/core/src/server/agent-chat/mcp-glue.ts:23–149`,
   `AN packages/core/src/mcp-client/remote-store.ts:75–128,723–750`,
   `manager.ts:491–505`, `oauth-client.ts`).
10. **The docs are behind the code in several load-bearing places** (§20): MCP
    approval, the 25 s vs 20 s wait, tool-search's reach, the builtins list,
    connect-token format, "no JWT signing between siblings", `actions/invoke`,
    and `publicMcp` (parsed, never wired).

---

## 1. Versions, packages and spec targets

| Thing                           | Value                                                                                                                            | Source                                                                                  |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| MCP server SDK                  | `@modelcontextprotocol/server` `2.0.0` (exact pin; npm latest 2.3.1 on 2026-10-20)                                               | `AN packages/core/package.json:686`; `npm view`                                         |
| MCP client SDK                  | `@modelcontextprotocol/client` `2.0.0` (exact)                                                                                   | `AN packages/core/package.json:683`                                                     |
| MCP core types                  | `@modelcontextprotocol/core ^2.2.0`                                                                                              | `AN packages/core/package.json:684`                                                     |
| MCP Apps ext                    | `@modelcontextprotocol/ext-apps` 2.0.3 (catalog)                                                                                 | `AN pnpm-lock.yaml:11022–11040`                                                         |
| WebMCP polyfill                 | `@mcp-b/webmcp-polyfill ^5.1.0`                                                                                                  | `AN packages/core/package.json:682`                                                     |
| JWT                             | `jose ^6.2.2` (HS256 everywhere)                                                                                                 | `AN packages/core/package.json:709`                                                     |
| MCP protocol versions served    | "native 2026-07-28 envelopes and stateless 2025-era traffic"                                                                     | `AN packages/core/src/mcp/server.ts:327–329`                                            |
| MCP Apps bridge `ui/initialize` | `protocolVersion: "2026-01-26"`                                                                                                  | `AN packages/core/src/mcp/embed-app.ts:2521–2528`                                       |
| A2A served                      | agent card `protocolVersion: "0.3"`                                                                                              | `AN packages/core/src/a2a/agent-card.ts:21`                                             |
| A2A client                      | 0.3 wire + 1.0 mapping (`SendMessage`, `GetTask`, `CancelTask`, `ROLE_*`, `TASK_STATE_*`)                                        | `AN packages/core/src/a2a/client.ts:1329–1414,1683–1707`                                |
| MCP Registry                    | `server.json` per public app, schema `2025-12-11`, namespace `io.github.BuilderIO/agent-native-*`, remote type `streamable-http` | `AN mcp-registry/README.md`, `AN scripts/mcp-registry.ts:16–80`                         |
| AgentKit                        | `@agent-native/agentkit` 0.210.0, versioned protocol `AGENTKIT_PROTOCOL_VERSION`                                                 | `AN packages/agentkit/package.json:3`, `AN packages/agentkit/src/protocol/index.ts:8–9` |

The skill shipped to app agents states the same targets in prose: "The framework
serves MCP `2026-07-28` natively over stateless, per-request HTTP and keeps the
established stateless path for 2025-era clients. New MCP client code uses the
split `@modelcontextprotocol/client` package with `versionNegotiation: { mode:
"auto" }`" (`AN packages/core/src/templates/workspace-core/.agents/skills/external-agents/SKILL.md:44–55`).
No doc page under `docs/content/` names an MCP protocol version.

---

## 2. The MCP server endpoint: routes, transport, request lifecycle

### What it is

Every app that loads the agent-chat plugin auto-mounts an MCP server, a legacy
alias, an optional "directory" profile, OAuth endpoints, a Connect page, and a
fetch-first HTTP catalog (docs mcp-protocol L26–32, L34–49).

### How it works

**Routes** (`AN packages/core/src/mcp/route-paths.ts:1–8`,
`AN packages/core/src/mcp/server.ts:527–551`,
`AN packages/core/src/server/core-routes-plugin.ts:2966–3035`):

| Path                                                                           | Purpose                                                          |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `POST/GET /mcp`                                                                | Streamable HTTP MCP (public prefix)                              |
| `/_agent-native/mcp`                                                           | Legacy alias, same handler                                       |
| `/mcp/directory`                                                               | Only when `mcp.directoryProfile` is set; separate closed catalog |
| `/.well-known/oauth-protected-resource[/<path>]`                               | RFC 9728 PRM (prefix-mounted, so path form works)                |
| `/.well-known/oauth-authorization-server`, `/.well-known/openid-configuration` | RFC 8414 metadata (same handler for both)                        |
| `/mcp/oauth/{register,authorize,token}` (+ legacy prefix)                      | DCR, consent, token                                              |
| `/mcp/connect[/...]`                                                           | Connect page, device flow, token list/revoke, `/identity`        |
| `GET /.well-known/mcp.json`, `POST /mcp/tool/:name`                            | Agent-Native "fetch-first" compat catalog (not MCP)              |

**Mounting.** The agent-chat plugin calls `mountMCP(nitroApp, { name, appId,
actions: externalActions, productionActions: externalFullActions,
widgetRead/WriteActions, catalogMode, connectorCatalog, directoryProfile,
externalAgents, askAgent, createLocalAgentTaskClient })`
(`AN packages/core/src/server/agent-chat-plugin.ts:3367–3409`). `actions` is the
"sparse, dev-toggled surface" in local dev; `productionActions` is the full set
served to an authenticated real caller (`AN packages/core/src/mcp/build-server.ts:153–165`).

**Request lifecycle** (`AN packages/core/src/mcp/server.ts:341–482`):

1. Sub-paths fall through (`subpath` non-empty → `undefined`) so
   `/mcp/connect`, `/mcp/oauth` handle themselves.
2. `deriveRequestMeta` reads `x-forwarded-proto/host`, `x-agent-native-open-target`
   (`browser|desktop|terminal`), `user-agent`, `x-agent-native-mcp-client`,
   `x-agent-native-mcp-retry-token`, a catalog hint and
   `x-agent-native-mcp-inline-apps` (`:65–118`).
3. `verifyAuth(authHeader, ownerEmailHeader, { allowDevOpen, resourceUrl:
getMcpOAuthAudiences(...), requestOrigin })` (§3). `allowDevOpen` only when
   the request is loopback **and** the origin is loopback **and** (an owner-email
   hint is present or `mcp.allowDevOpen`) (`:386–394`).
4. Outcomes: identity lookup unavailable → **503 + `Retry-After: 5`, no
   challenge** ("re-authenticating would not help"); refused → **401** with
   `WWW-Authenticate: Bearer resource_metadata="…", scope="mcp:read mcp:write mcp:apps"`
   plus `error="invalid_token"` and a recovery description when a token was
   presented; the JSON body adds `npx -y @agent-native/core@latest reconnect <issuer>`
   instructions (`:170–222,294–317,404–423`; challenge built at
   `AN packages/core/src/mcp/oauth-route.ts:292–309`).
5. Org resolution from `org_domain` when the identity has no `org_id`
   (ambiguous domain → refused) (`:425–444`, `AN build-server.ts:4381–4419`).
6. Body is read once; `serverRequestMeta` gets `fullSurface`, `fullCatalog`,
   `inlineMcpApps` (only when header **and** `identity.firstPartyMcp`) (`:446–463`).
7. Directory profile is validated per request (503 `MCP_DIRECTORY_PROFILE_INVALID`
   on misconfiguration) (`:464–475`).
8. `handleMcpFetchRequest` → `createMcpHandler(() => createMCPServerForRequest(config,
identity, requestMeta), { legacy: "stateless", responseMode: "auto" })`,
   passing the already-parsed body; `initialize` is observed for analytics
   (`clientInfo`, `protocolVersion`) without coupling transport to telemetry
   (`AN packages/core/src/mcp/fetch-handler.ts:89–136`,
   `AN packages/core/src/mcp/framework-fetch-handler.ts:23–75`).

**Statelessness and retries.** There is no MCP session. The JSON-RPC id cannot
identify a replay, so a caller that wants retry safety sends
`x-agent-native-mcp-retry-token`; the action run gets `mcpRequestId =
stateless:<token>` (or `<sessionId>:<id>` when the SDK reports a session)
(`AN packages/core/src/mcp/build-server.ts:3382–3393`).

**Cache hints.** The `Server` is created with `cacheHints` of `ttlMs: 0,
cacheScope: "private"` for `server/discover`, `tools/list`, `resources/*`
(`AN build-server.ts:3040–3046`) — catalogs are per-caller **(inference: the
2026 `server/discover` method is answered by the SDK)**.

**Stdio.** `npx @agent-native/core mcp serve` is a thin stdio proxy to the
running app's `/mcp` (probes `/mcp` then `/_agent-native/mcp`), forwarding
`ACCESS_TOKEN`/`AGENT_NATIVE_MCP_TOKEN` as Bearer, `AGENT_NATIVE_OWNER_EMAIL` as
`X-Agent-Native-Owner-Email`, and a full-catalog hint
(`AN packages/core/src/mcp/stdio.ts:25–37,61–80`; docs
external-agents-catalog L464–489).

**Fetch-native handler (new).** Since git `38ccdb4` (2026-10-16, external
contributor) the transport is "Web Standard on every runtime. H3 owns the Node
response when one exists, avoiding the double-write race"; a framework adapter
and a portable `handleMcpFetchRequest(request, { createServer, parsedBody })`
are exported (`AN packages/core/src/mcp/fetch-handler.ts:80–136`).

### Principle

"Builds one request-scoped MCP `Server` from the verified caller identity …
so protocol generations cannot drift apart" (`AN server.ts:326–329`). Auth and
server construction "remain with the host, which supplies a factory only after
applying its existing request policy" (`AN fetch-handler.ts:83–88`).

### Changes since 0.206.0

`38ccdb4` Fetch-native handler; `b0493c6` import fix; `19092a7` beta server names
(`beta-agent-native-<app>`).

### Gaps / sharp edges

- Per-request server construction resolves org, discovery predicates and
  schema conversions on every call **(inference: cost scales with catalog
  size; the code converts lazily per request, `AN build-server.ts:428–466`)**.
- Dev-open needs loopback request + loopback origin; a reverse proxy that sets
  `x-forwarded-host: localhost` on a non-loopback socket would still fail the
  socket check (`isLoopbackRequest`) **(inference)**.

---

## 3. MCP caller authentication: the `verifyAuth` ladder and identity assurance

### What it is

One function decides who an MCP (and action-route bearer) caller is, how sure
the server is about it, and which surface it gets
(`AN packages/core/src/mcp/build-server.ts:4244–4348`).

### How it works

`MCPCallerIdentity` (`AN build-server.ts:250–260`):

```ts
interface MCPCallerIdentity {
  userEmail: string | undefined;
  identityAssurance?: "user" | "organization" | "service";
  mcpCredentialIssuedAtMs?: number; // signed grant time, or iat
  orgId?: string | null; // null = personal scope
  orgDomain: string | undefined;
  oauthScopes?: string[];
  oauthClientId?: string;
  firstPartyMcp?: boolean; // sibling Agent-Native app calling as MCP client
}
```

Order of checks:

1. **Credentials this app issued** are classified by what they claim to be,
   before any A2A rule runs: `typ === "agent-native-mcp-oauth"` → MCP OAuth
   access token (also what Connect mints now); `scope === "mcp-connect"`
   without the first-party flag → legacy Connect token (A2A-shaped, verified
   with `A2A_SECRET`). A token claiming to be one of these that
   fails verification is `"unverified"` and never falls through to A2A rules
   (`:3997–4039`).
2. Admission (`:4048–4216`): a Connect token must have a live, unrevoked row in
   `mcp_connect_tokens` whose owner/org match the claims; the email must not be
   **retired** after the token's issue time; if the credential names an org the
   subject must **still be a member** (no caching, "a removal on any instance
   takes effect on the next request everywhere",
   `AN packages/core/src/mcp/credential-membership.ts:1–12`); service principals
   must be active. DB/identity-authority errors → `unavailable` → 503, never 401.
   Admitted issued credentials get `fullSurface: true` and `fullCatalog` from the
   `catalog_scope: "full"` claim.
3. No token, no `ACCESS_TOKEN(S)`, no `A2A_SECRET` → dev-open (only if
   `allowDevOpen`), identity from `AGENT_NATIVE_OWNER_EMAIL` env or the
   `X-Agent-Native-Owner-Email` header (env wins); `fullSurface` only with an
   owner hint (`:4273–4282`, `:3705–3742`).
4. **A2A JWT** (`verifyA2AJwtForMcp`, `:3769–3888`): verified with the deploy
   `A2A_SECRET` (audience rules: see the token-verification steps in §13);
   if `org_domain` resolves to an org whose stored secret equals the deploy
   secret, the claims are reduced to an organization principal; otherwise the
   org claim is bound to local metadata. If only an **org secret** verifies, the
   result is an organization principal (no email). Only `scope` absent or
   `mcp-connect` is accepted (`:4301–4305`). `sub` present → `identityAssurance:
"user"`.
5. `ACCESS_TOKEN` / comma-separated `ACCESS_TOKENS`, constant-time compare,
   identity from owner env/header (`:4358–4379`). A presented bearer that failed
   JWT checks can still match a static token (`:4259–4270,4340–4347`).

`hasMcpOAuthScope(undefined, …)` returns `true` (`AN packages/core/src/mcp/oauth-token.ts:86–92`):
only OAuth/Connect credentials carry scopes; A2A JWTs and static tokens are
unscoped (full read/write).

### Principle

"Credentials this app issued are recognized and verified before any A2A rule
runs, so a change to cross-app trust cannot reclassify them" (`AN build-server.ts:4231–4233`).
"A static `ACCESS_TOKEN` is a shared bearer secret; letting a request header
override a server-configured owner would let anyone holding a leaked token act
as any user" (`:3722–3728`). Unavailable ≠ refused: "re-authenticating would not
help, and the client must keep its tokens and retry" (`AN server.ts:405–407`).

### Changes since 0.206.0

None structural in `verifyAuth`; `9156c9d` keeps service-token minting out of
agent/MCP tools.

### Gaps / sharp edges

- Static-token mode is single-tenant by design; the code comment says
  multi-tenant deployments "must use A2A JWT … not a static token".
- We noted security-relevant gaps in this area; they are recorded separately
  in a private note.

---

## 4. The MCP OAuth 2.1 authorization server

### What it is

Each app is its own OAuth AS and its own protected resource for "standard
remote MCP OAuth" (docs mcp-protocol L283–387; docs external-agents L363–389).

### How it works

**Issuer & audiences.** Issuer = first of `WORKSPACE_OAUTH_ORIGIN`,
`VITE_WORKSPACE_OAUTH_ORIGIN`, `APP_URL`, `VITE_APP_URL`, `BETTER_AUTH_URL`,
`VITE_BETTER_AUTH_URL`, else request origin, plus the app base path
(`AN packages/core/src/mcp/oauth-route.ts:130–195`). Accepted audiences are the
resource URLs (`/mcp`, `/_agent-native/mcp`; `/mcp/directory` separately) for
**both** the configured and the request-derived issuer, so deploy previews and
proxies verify (`:221–273`).

**Metadata** (`:350–419`):

```json
// GET /.well-known/oauth-protected-resource[/mcp|?resource=/mcp/directory]
{ "resource": "<issuer>/mcp", "authorization_servers": ["<issuer>"],
  "scopes_supported": ["mcp:read","mcp:write","mcp:apps"],
  "resource_documentation": "<issuer>" }
// GET /.well-known/oauth-authorization-server (also served at openid-configuration)
{ "issuer": "...", "authorization_endpoint": ".../mcp/oauth/authorize",
  "token_endpoint": ".../mcp/oauth/token", "registration_endpoint": ".../mcp/oauth/register",
  "response_types_supported": ["code"], "grant_types_supported": ["authorization_code","refresh_token"],
  "code_challenge_methods_supported": ["S256"], "token_endpoint_auth_methods_supported": ["none"],
  "scopes_supported": ["mcp:read","mcp:write","mcp:apps","offline_access"],
  "authorization_response_iss_parameter_supported": true,
  "client_id_metadata_document_supported": true }
```

No `jwks_uri` (tokens are HS256).

**DCR** (`POST /mcp/oauth/register`, `:427–522`): 1–20 redirect URIs, each
`https:`, loopback `http:`, or a custom scheme (not `javascript:/data:/file:/blob:/about:/vbscript:`);
grants only `authorization_code`/`refresh_token`; `token_endpoint_auth_method`
must be `none` ("Only public OAuth clients are supported"); `application_type`
inferred `native` if any redirect is loopback/non-https. Client id
`agent-native-oauth-client-<uuid>`. Registration is rate-limited
(`AN packages/core/src/mcp/oauth-store.ts:62–63,329–351`).

**CIMD** (Client ID Metadata Documents): a `client_id` that looks like a URL is
fetched instead of looked up (`:878–880`). Rules: HTTPS, non-root path, no
fragment/userinfo/dot segments, ≤2048 chars; fetched through `ssrfSafeFetch`,
≤64 KB, 5 s, ≤2 redirects, cached ≤5 min / 128 entries honoring
`Cache-Control`; document `client_id` must equal the URL, `client_name` 1–120
chars no control chars, `redirect_uris` valid; unknown grant types tolerated
("Claude.ai's CIMD document lists `urn:ietf:params:oauth:grant-type:jwt-bearer`")
(`AN packages/core/src/mcp/oauth-client-metadata.ts:3–7,39–78,175–293,411–442`).
Loopback redirects match ignoring port for native clients (RFC 8252 §7.3)
(`:105–155`).

**Authorize** (`GET|POST /mcp/oauth/authorize`, `:830–1068`):

1. `response_type=code`, `client_id`, `redirect_uri`, `resource` (defaults to
   this server's `/mcp`; must be one of the accepted audiences), PKCE **S256
   required**.
2. Not signed in → the app's login HTML at the same URL (or
   `login_required` redirect with `prompt=none`).
3. Scope normalization: empty request → **all four scopes**; unknown scopes
   dropped; nothing valid → `invalid_scope` (`AN oauth-token.ts:66–77`).
4. GET renders a consent page listing app, account email, client name,
   redirect URI, scopes and an **organization selector**; hidden fields include
   a `consent_token` = HMAC-SHA256(`A2A_SECRET` or auth secret) over
   `{email, clientId, redirectUri, resource, scope, codeChallenge, exp: +10 min}`
   (`:582–648,677–744`).
5. POST must be same-origin (absent `Origin` is allowed) and carry a valid
   consent token; `decision !== "approve"` → `access_denied`.
6. Code creation runs inside `withMcpCredentialIssuance` (membership re-check
   under a lock); code = 32 random bytes, 10-min TTL, bound to owner
   (`owner_email` = `issued_for_email`) (`AN oauth-store.ts:16,405–470`).
7. Native-scheme redirects (`cursor://`, `vscode://`) get a "You're all set"
   page that re-fires the deep link; others get a 302 with `code`, `state`,
   `iss` (`:1038–1067`).

**Token** (`POST /mcp/oauth/token`, `:1070–1296`):

- `authorization_code`: verifier 43–128 chars, client id + redirect must match
  the code row, `SHA256(verifier)` compared in constant time, code consumed with
  an owner-bound `UPDATE … WHERE consumed_at IS NULL`; returns access JWT +
  new opaque refresh token; emits a one-time `agent_connected` event
  (`AN packages/core/src/mcp/agent-connected.ts`, git `a78486`).
- `refresh_token`: client id must match; `touchOAuthRefreshToken` sets
  `last_used_at` and **clears `expires_at`**; returns a new access token and
  **the same refresh token** (`:1238–1261`, `AN oauth-store.ts:668–690`).
  Removed member → refresh token revoked + `invalid_grant`; DB trouble → 503
  `temporarily_unavailable` + `Retry-After: 5`.

**Access-token JWT** (`AN packages/core/src/mcp/oauth-token.ts:93–148`):

```ts
// HS256, key = A2A_SECRET || BETTER_AUTH secret; verify tries both
{ typ: "agent-native-mcp-oauth", credential_version: 2 /* 3 = service */,
  sub: ownerEmail, org_id?: string|null, org_domain?, scope, client_id,
  resource, grant_created_at_ms?, catalog_scope?: "full",
  iss: issuer, aud: resource, jti, iat, exp /* default 30d, MCP_OAUTH_ACCESS_TOKEN_TTL */ }
```

Verification requires `typ`, a known `credential_version`, `aud` ∈ accepted
audiences **and** embedded `resource` ∈ audiences, at least one MCP scope, a
well-formed `org_id` claim (`:167–266`). Version 3 exists so "verifiers
predating service identity assurance reject" service tokens that could otherwise
"approve gated actions" (`:24–30`).

**Tables** (`AN oauth-store.ts:64–148`):

```sql
mcp_oauth_clients(client_id PK, client_name, redirect_uris JSON, grant_types JSON,
  response_types JSON, token_endpoint_auth_method, application_type, created_at)
mcp_oauth_codes(code PK, client_id, client_name, redirect_uri, code_challenge,
  code_challenge_method, owner_email, issued_for_email, org_id, org_domain, scope,
  resource, created_at, expires_at, consumed_at)
mcp_oauth_refresh_tokens(id PK, token_hash UNIQUE /* sha256 b64url */, client_id,
  owner_email, issued_for_email, org_id, org_domain, scope, resource, created_at,
  expires_at, last_used_at, revoked_at, replaced_by_hash)
```

Access tokens are never stored ("Access tokens are signed JWTs and are never
persisted", `:1–7`).

**Scopes → permissions.** `mcp:read` for actions where `isMcpReadOnlyTool`
(`readOnly === true`, plan-mode effect read, and `mcpAnnotations.readOnlyHint
!== false`), else `mcp:write`; `ask-agent` needs `mcp:write`
(`AN packages/core/src/mcp/execute-action-call.ts:114–123`,
`AN packages/core/src/action-call-classification.ts:100–111`,
`AN build-server.ts:3431–3445`).

### Principle

"Access tokens are signed JWTs whose audience is the exact MCP resource URL"
(docs mcp-protocol L375); "Every request and every refresh re-checks that the
user still belongs to the token's organization" (docs mcp-protocol L383). The
skill: "URL-like client ids never fall back to dynamic registration"
(`AN …/skills/external-agents/SKILL.md:51–53`).

### Changes since 0.206.0

No protocol change to the AS. The OAuth/Connect files were touched only by
`a78486` (emit one `agent_connected` event per email/app/client after the
credential commits), `4e49b3a` (store-table refactor) and `19092a7` (server
names). `836c535` fixed MCP OAuth _client_ callbacks for workspace apps (§11).

### Gaps / sharp edges

- We noted security-relevant gaps in this area; they are recorded separately
  in a private note.
- One HS256 key signs both A2A user assertions and MCP access tokens
  (`signingSecret()` prefers `A2A_SECRET`); the `typ` claim separates them and
  A2A's verifier rejects MCP credentials (`AN packages/core/src/a2a/server.ts:178–182`).

---

## 5. Connect page, device flow, and org service principals

### What it is

A fallback for hosts that cannot do remote MCP OAuth (Codex, Cowork, stdio): a
logged-in browser mints a per-user, revocable bearer (docs external-agents
L249–361; docs external-agents-catalog L534–545).

### How it works

- `mintConnectToken` → `signConnectToken` = **an MCP OAuth access token** with
  `client_id: "agent-native-connect"`, default scopes, `resource` = this
  `/mcp`, TTL default **365 days** (1–365; service tokens up to 3,650), and a
  `jti` row in `mcp_connect_tokens` used for revocation and `last_used_at`
  (`AN packages/core/src/mcp/connect-route.ts:215–292`,
  `AN packages/core/src/mcp/connect-store.ts:26–38`). Comment: "Do not sign them
  as A2A JWTs again: that format let cross-app trust rules reinterpret a
  credential this app issued" (`connect-route.ts:262–267`).
- Device flow: `/mcp/connect/device/start` (rate-limited 20/min),
  `/device/authorize` (needs session, org pick), `/device/poll`; codes live 10 min
  in `mcp_device_codes(device_code, user_code, owner_email, org_id, status,
token_jti, catalog_scope, client, purpose, …)` (`connect-route.ts:1572–1810`,
  `connect-store.ts:40–111`).
- Org **service principals**: `svc-<name>@service.<orgId>` identities, minted
  only by owners/admins through a non-agent action (`agentTool: false`,
  `toolCallable: false`), credential_version 3, governed by a policy row with
  `allowedActions` patterns (`null` = unrestricted, trailing `*` prefix match),
  checked at admission, at `tools/list`, and per call
  (`AN packages/core/src/mcp/actions/create-org-service-token.ts:1–25`,
  `connect-store.ts:135–145`, `AN packages/core/src/org/service-principal-policy.ts:382–393`,
  `AN build-server.ts:3119–3169,3397–3418`).
- Tables: `mcp_connect_tokens(id, jti UNIQUE, owner_email, org_id, label,
kind 'personal'|'service', service_name, created_by, created_at, last_used_at,
revoked_at)`.

### Principle

"A logged-in user mints a per-user, scoped, revocable MCP bearer token here …
so they never copy a shared deployment secret" (`AN core-routes-plugin.ts:3010–3015`).
"Minting a long-lived credential must be an explicit human/HTTP/CLI act, never
a prompt-injection target" (`create-org-service-token.ts:13–16`).

### Changes since 0.206.0

`9156c9d` "Stop agents from minting organization service tokens".

### Gaps

- Docs still describe Connect tokens as "an `A2A_SECRET`-signed JWT carrying the
  caller's `sub` + `org_domain`" (docs external-agents-catalog L542); code mints
  MCP OAuth-format tokens (legacy A2A-format tokens are still accepted).

---

## 6. How actions become MCP tools: exposure, catalog tiers, descriptors

### What it is

`tools/list` is computed per request from the action registry, the caller's
identity, its OAuth scopes, its service grant, app policy and the catalog tier.

### How it works

**Step 1 — is the action external at all?** `isActionExposedToExternalAgents`
(`AN packages/core/src/action.ts:1386–1399`):
```ts
if (entry.uiOnly === true) return false;
if (entry.endsTurn === true) return entry.mcpTool === true;  // in-app forms stay in-app
return typeof entry.mcpTool === "boolean" ? entry.mcpTool : entry.agentTool !== false;
```
`mcpTool: true` is also "the action-owned form of `mcp.connectorCatalog`
membership"; `mcpTool: true` + `agentTool: false` = MCP-only
(`AN action.ts:773–801`). "Membership is not permission: an external caller still
passes the OAuth scope, `externalAgents` policy, and `publicAgent` checks."

**Step 2 — the surface.** `selectMcpActionSurface`: `productionActions` when the
caller was admitted with `fullSurface` (issued credentials, A2A JWTs, static
tokens, dev-open with owner hint), else the sparse dev `actions`
(`AN build-server.ts:477–485`).

**Step 3 — catalog tier** (`AN build-server.ts:2862–2987`):

| Tier | How chosen | What is advertised |
| --- | --- | --- |
| compact (default) | no connector list, no `mcpTool: true`, no auto-reads | builtins `list_apps`, `open_app`, `ask_app`, `ask_app_status`, `create_embed_session`, `tool-search` (`:875–884`) + actions with `mcpApp.compactCatalog: true` (+ widget actions when builtins are off) |
| connector | `mcp.connectorCatalog`, any `mcpTool: true`, or `externalAgents.authenticatedReads: "auto"` | builtins + listed/declared names + auto-reads − `denyActions`; with `writes: "ask_app_only"` (default when auto-reads is on) only read-only tools (`:2936–2980,1004–1010`) |
| `app` (`mcp.catalog: "app"`) | config | whole registry flat, minus denies, no builtins, no tool-search |
| `directory` (`/mcp/directory`) | `mcp.directoryProfile` | closed allow-list; every action must declare boolean `readOnlyHint`, `destructiveHint`, `openWorldHint` and `readOnlyHint` must equal `readOnly`; reserved names (`ask_app`, `db-*`, `seed-*`, `provider-api-*`) refused; HTTPS `widgetDomain` required (`:523–832`) |
| full | `AGENT_NATIVE_MCP_FULL_CATALOG=1`, token claim `catalog_scope: "full"` | everything visible incl. `ask-agent`; "~105 tools (100k+ tokens)" (`:904–941`) |

Automatic authenticated reads require `http.method === "GET"`, `readOnly`,
`publicAgent: { expose, readOnly, requiresAuth: true }`, and the name is not
`db-query|db-schema|db-exec|db-patch|context-*|seed-*|*extension*|*browser-session*`
(`AN build-server.ts:943–994`).

Filters applied to every tier: OAuth scope visibility, the action's
`agentDiscoveryAvailable(context)` predicate (evaluated once per predicate per
request), schema usability, and the service-principal grant at list time
(`:2887–2913,3171–3181`).

**Step 4 — the descriptor** (`AN build-server.ts:3182–3294`):

| Tool field | Source |
| --- | --- |
| `name` | action name (sorted lexicographically) |
| `title` (in `annotations`) | `tool.title` or name humanized (`AN packages/core/src/shared/agent-mcp-metadata.ts:20–29`) |
| `description` | `tool.description`; with a `link` builder: `+ ' After calling, surface the returned "Open in … →" link to the user.'`; directory profiles may override |
| `inputSchema` | `mcpToolInputSchema(name, parameters)` (below) |
| `outputSchema` | only `entry.mcpOutputContract.response` (opt-in), or `{type:"object", additionalProperties:true}` for directory widgets |
| `annotations` | declared `mcpAnnotations`, else `mcpAnnotationDefaults`, else derived `{ readOnlyHint: isMcpReadOnlyTool, destructiveHint: publicAgent.isConsequential \|\| needsApproval !== undefined, openWorldHint: false }`; plus `"agent-native/producesOpenLink": true` when `link` exists |
| `_meta` | tool `_meta`, plus when inline MCP Apps are on: `ui: { resourceUri, visibility }`, `ui/resourceUri`, `openai/outputTemplate`, `openai/toolInvocation/*`, `openai/widgetAccessible`, `openai/widgetCSP` |

`ask-agent` (full tier only, needs `mcp:write`) declares
`{ readOnlyHint: false, destructiveHint: true, openWorldHint: true }`
(`:3305–3345`).

**Input-schema transform** (`AN packages/core/src/mcp/tool-input-schema.ts:52–168`).
"The input schema an MCP host forwards verbatim to its model provider, where one
rejected tool fails every request in the session. Each step only widens what the
schema accepts": strip provider-rejected keywords, move non-string enums and
`maxItems` into descriptions, flatten root `anyOf/oneOf/allOf` ("Anthropic rejects
one"), replace boolean subschemas / missing `items` with a recursive `JsonValue`
`$defs` entry ("Codex lowers both to `{ type: "string" }`"), turn string `const`
into one-value `enum` (Gemini), throw on unresolvable refs. A schema that fails
is reported and the tool is **left out of every set in that request**, including
`tools/call` resolution (`AN build-server.ts:428–466`). Each rule records its
provider and evidence in `provider-schema-conformance.ts` (git `ca67d21`).

**Output schema** (opt-in, git `fab1c27`): `mcpOutputSchema: true` requires an
`outputSchema` and `outputErrorStrategy: "strict"`; the MCP response contract is
derived from the semantic schema through the same transport transform (array root
→ `{ items }`, open-link fields added) (`AN action.ts:756–763,1265–1279`,
`AN packages/core/src/action-output-contract.ts:536–575`), compiled with Ajv 2020
`strict: true` + formats before `run`, and checked against the serialized
`structuredContent` (`AN packages/core/src/mcp/output-contract.ts:80–141`). A
mismatch throws `ActionOutputContractError` (`errorCode
output_contract_violation`) carrying the call's effect. Five template actions opt
in (`plan` search-pr-recaps, list-plan-components; `forms` preview-form;
`analytics` list-connected-database-tables, get-first-party-analytics-health).

**Instructions** sent in `initialize` (`AN agent-mcp-metadata.ts:1–18`):
> "This Agent-Native app exposes focused action tools. When the host supports
> page-local WebMCP, prefer the page's named tools over browser click/type
> automation … You, the connected model, are the author: when the user asks for new
> content — a design, a deck, a form, a document, a plan — write it yourself and
> persist it with the app's create/update tools; do not delegate the authoring to
> the app's built-in agent … use ask_app only when no named tool covers the
> capability."
plus `Key tools for this app: … Call tool-search for anything not listed.` and
app-specific guidance. A catalog spec checks that every backticked tool name in
static instructions is actually advertised (git `9c277b7`).

**tool-search on MCP** is rebound to search only `advertisable(advertised)` —
the tools this caller already sees (`AN build-server.ts:392–416,2981–2984`;
same scoping existed at 0.206.0).

**Server capabilities** advertised: `tools: {}` always; `resources: {}` +
`extensions: { "io.modelcontextprotocol/ui": { mimeTypes: ["text/html;profile=mcp-app"] } }`
when MCP Apps apply; no `prompts`, no `logging`, no `completions`
(`AN build-server.ts:3023–3039`).

### Principle

Compact by default: "Full catalog is a deliberate, rare opt-in — NEVER a default,
and NEVER inferred from the client name / user-agent … Dumping ~105 tool schemas
(100k+ tokens) into a context window just because a client called itself
"code"/"cursor"/"codex" was a recurring footgun" (`AN build-server.ts:907–918`).
"one flag stays one decision" (`AN action.ts:776–778`).

### Changes since 0.206.0

`ca67d21` provider-conformant schemas (widening-only transform, per-provider
rule ledger); `fab1c27` audited output schemas; `9c277b7` catalog guards —
every mutating tool must declare `destructiveHint` except a frozen baseline of
**1,517** legacy unreviewed tools in `legacy-unreviewed-destructive-hint.json`
that "may only shrink" (AGENTS.md: "`no-new-legacy-mcp-hints` has none [opt-out]",
`AN AGENTS.md:146–147`); `774af36` truncation notices ("Never advise re-calling a
mutating tool when MCP text is truncated"); `c3e3063`/`a9e3e21` org-member tools
in curated catalogs and compact tools preserved when `mcpTool` declarations
activate a connector tier.

### Gaps / sharp edges

- We noted security-relevant gaps in this area; they are recorded separately
  in a private note.

---

## 7. The `tools/call` pipeline: shared core + direct adapter

### What it is

Since git `3d6a9d3` (2026-10-17) a call is split into a transport-free core
(`executeMcpActionCall` / `runMcpActionCallUnredacted`) and the "direct adapter"
that turns an outcome into the wire result
(`AN packages/core/src/mcp/execute-action-call.ts:47–53`,
`AN packages/core/src/mcp/direct-action-call.ts:75–83`).

### How it works

```
tools/call(name,args)
 ├─ service-principal grant (403 → isError, audit denial)        build-server.ts:3397–3418
 ├─ ask-agent (full tier only, mcp:write) → hosted ask_app        :3420–3469
 ├─ directory create_embed_session renewal                       :3471–3497
 └─ directActionCall
     ├─ outputContract compiled first (fails before any write)   direct-action-call.ts:171–250
     ├─ runMcpActionCallUnredacted                                execute-action-call.ts:575–668
     │   ├─ unknown tool (not advertisable → unknown, like tools/list)
     │   ├─ OAuth scope check
     │   ├─ actionCallIntent: validate + defaults → argumentsHash
     │   ├─ authorizeApproval (§8)
     │   └─ runPreparedActionCall(entry, prepared, {caller:"mcp", mcpClient})
     ├─ change marker on writes (also after a failed write that entered its handler)
     ├─ classify result (proxied MCP result → raw/text/upstream status)
     ├─ JSON-normalize, directory projection, MCP App embed start, images
     ├─ structuredContent + concise text + link block
     └─ modelVisibleToolResponse: embed-credential redaction over everything
```

**Result shaping** (`AN direct-action-call.ts:322–597`, `AN build-server.ts:2471–2806`):
- `structuredContent` is sent when the action has an output contract, an MCP
  App resource, app-only visibility, or `returnsQueryPayload` (readOnly or GET)
  / `mcpApp.structuredContent`. Arrays become `{ items: [...] }`; an `openLink`
  object and `url` are merged in; empty non-contracted objects become
  `{ status: "ok" }`.
- Text is concise: success-only objects become `"<name> completed."`; long text
  is cut on code points with a paging notice that never suggests re-calling a
  mutating tool (`:2652–2806`).
- `link` → markdown `[label →](url)` block + `_meta["agent-native/openLink"] =
  { label, view, webUrl, desktopUrl, vscodeUrl }`; desktop URL when
  `x-agent-native-open-target: desktop` (`AN build-server.ts:1846–1886`).
- An upstream MCP result with unreadable status says "ran, but whether it
  succeeded could not be read; check before retrying" (`:2613–2622`).
- After the action ran, a failure to build the response reports a **write as
  success** ("rather than invite a retry") and a read as failure, unless the
  action is contracted (typed output error) (`AN direct-action-call.ts:322–327,598–689`).

**Embed-credential redaction.** An embed start URL carries "a single-use ticket
that signs its holder in as the user, so it may travel only in `_meta`"
(`AN execute-action-call.ts:277–302`). The guard reads every string in every
escaped layer (percent/HTML/JS escapes, dot segments), hides start URLs as
`[hidden embed URL]` and echoes of tickets as `[hidden embed ticket]`, drops
images that carry one, and withholds a result it cannot fully read; only
`_meta["agent-native/embedStart"]` and `["agent-native/widgetSource"]` may carry
a credential (`AN build-server.ts:2518–2610`). A lint guard
(`guard:mcp-unredacted-call-boundary`) allows only `direct-action-call.ts` to
import the unredacted runner (`AN execute-action-call.ts:565–574`).

**Audit attribution.** Each call records `mcpClient: { name, version }` from
`clientInfo` (for 2026-07-28 requests read from the envelope the SDK lifts out of
`_meta`) and `oauthClientId` from the credential, plus approval evidence
(`"agent-chat"`, `"mcp-elicitation"`, `"a2a-review"`)
(`AN packages/core/src/mcp/call-attribution.ts:17–40`, git `d0f6950`, `108b9d9`).

### Principle

"Plain, frozen JSON data in which every string has had embed session credentials
removed" (`AN execute-action-call.ts:511–515`). "A missed refresh would hide a
committed change; a spurious one is harmless" (`AN direct-action-call.ts:678–679`).

### Changes since 0.206.0

`3d6a9d3` split, `c19512c` redaction of nested start URLs on the direct path,
`774af36` truncation notices, `fab1c27` output contracts, `578c558` shows agents
the details `fail()` attaches (`structuredContent.error` mirrors the message),
`108b9d9`/`d0f6950` audit client + approval columns.

### Gaps / sharp edges

- The redaction machinery is very large relative to the threat (a ticket leaking
  into the transcript); action code that transforms a credential "on purpose …
  is out of scope: action code is trusted" (`AN execute-action-call.ts:298–301`).
- Reporting a write as success when its result could not be built is a
  deliberate trade (no retry) but hides real response bugs from hosts **(inference)**.

---

## 8. Human approval, surface by surface

| Surface | What happens to a call whose `needsApproval` trips | Evidence on audit row | Source |
| --- | --- | --- | --- |
| In-app agent loop (chat, sub-agents) | `approval_required` event with `approvalKey` + `argumentsHash`; Approve/Deny in chat; "always allow" unless `allowPersistentApproval: false`; predicate throw → approve required | `agent-chat` | `AN packages/core/src/agent/production-agent.ts:8829–8885` |
| MCP `tools/call` (direct) | `inputRequired` elicitation `{ decision: approve\|deny }`, request state sealed by the SDK's `createRequestStateCodec` (key = Better Auth secret, TTL 10 min, bound to `method\0principal`), DB nonce in `mcp_action_approvals` bound to caller key + action + SHA-256(canonical args ‖ prepared args hash), consumed atomically; `maxRounds: 2`, round timeout 10 min; only `identityAssurance === "user"`; no codec → fail closed | `mcp-elicitation` | `AN build-server.ts:2988–3117`, `AN execute-action-call.ts:55–63,805–909`, `AN approval-store.ts` |
| MCP `ask_app` / `ask-agent` → app agent run | runs as an A2A task (§9, §13); a gated tool → task `input-required` + browser review URL **(inference from routing)** | `a2a-review` | `AN builtin-tools.ts:1136–1296` |
| A2A `message/send` (agent loop) | task stops `input-required`; row in `a2a_approvals`; message carries `/_agent-native/a2a/approvals/<id>`; the **task owner's live browser session** (same org) opens a review page and POSTs same-origin; runs once under an execution lease | `a2a-review` | `AN server/agent-chat-plugin.ts:3080–3129`, `AN a2a/server.ts:683–849`, `AN server/agent-chat/action-filters-a2a.ts:618–663` |
| A2A `actions/invoke` (direct) | only read-only, approval-free, `publicAgent`-exposed actions are listed or callable | — | `AN action-filters-a2a.ts:112–145`, `AN a2a/handlers.ts:1545–1637` |
| WebMCP & `POST /mcp/tool/:name` | predicate evaluated on real args; trips → 409 `approval_required`: "ask the user to confirm this action in chat" | — | `AN packages/core/src/server/action-routes.ts:1550–1576` |
| Browser-session WebMCP tools (agent → page) | `run-browser-session-webmcp-tool` has `needsApproval: () => true` | `agent-chat` | `AN packages/core/src/browser-sessions/actions.ts:243–247` |
| Remote MCP-server tools in the in-app agent | none by default; app can supply `resolveMcpActionEntry(tool) → { needsApproval, authorize }` | — | `AN agent-chat-plugin.ts:1410–1419`, `AN mcp-client/index.ts:218–283` |
| Embedded host client actions | `destructive`/`approval` actions need `approve` or `commands.requestApproval`; registration fails closed | host's | docs webmcp L200–206; docs embedding-sdk L646–658 |
| UI hooks / HTTP / CLI | not gated ("Approval is about the agent") | — | docs actions-access-control L410 |

The MCP elicitation message (verbatim, `AN build-server.ts:3096–3112`):
> "Action "<name>" requires your approval before it can run. Review the exact
> tool arguments in your MCP client, then explicitly choose Approve or Deny." —
> field `decision`, title "Run <name>?", description "Approve runs this exact call
> once. Deny leaves it unexecuted."

### Principle

The skill states the contract: "Actions marked `needsApproval` use MCP 2026
`input_required` elicitation. The approval is bound to the authenticated caller,
exact action, exact arguments, and expiry, and its durable grant is consumed
atomically before the action runs … the action fails closed"
(`AN …/skills/external-agents/SKILL.md:57–62`). For A2A: "The opaque id is a
lookup handle, not authorization: every read and mutation also requires the task
owner's live browser session. Ordinary A2A bearer tokens never reach this control
plane and cannot approve themselves" (`AN a2a/server.ts:683–686`).

### Changes since 0.206.0

Only attribution (`d0f6950`, `108b9d9`: approved A2A replays get the paused
task's run and network ids). The mechanisms predate 0.206.0; the earlier note's
table ([agent-native.md](../agent-native.md) §2.9.5) missed the elicitation transport and the A2A
review page, and its "A2A delegated capability: gated actions are filtered out"
row describes only the direct-read surface.

### Gaps / sharp edges

- Hosts that do not implement 2026 `input_required` (2025-era stateless clients)
  cannot approve; what the SDK sends them is not visible in the repo **(not verified)**.
- The docs still say approval "works the same way for … A2A, and MCP callers,
  because every agent surface routes through the same loop" (docs
  actions-access-control L167) and that the in-app loop is "the only surface that
  can run its actual human approval flow" (docs webmcp L49–50) — both false for
  direct MCP; mcp-protocol.mdx never mentions approval.
- Remote MCP-server tools have no approval by default, so a Zapier or Stripe MCP
  write runs unattended in the in-app agent unless the app adds a resolver
  **(inference)**.

---

## 9. Delegating to the app's own agent over MCP: `ask_app`, `ask-agent`, durable tasks

### What it is

A natural-language entry point into the app's full agent loop for MCP hosts,
plus cross-app routing (docs mcp-protocol L233–281; docs external-agents-catalog
L274–312).

### How it works

- `ask_app({ app?, message, async?, maxWaitMs? })` is a builtin in every
  non-flat tier; `ask-agent` is the same thing exposed only in the full tier
  (both call the hosted `ask_app`) (`AN packages/core/src/mcp/builtin-tools.ts:1136–1296`,
  `AN build-server.ts:3420–3469`).
- Routing order: a named workspace app (local workspace resolution) → the org
  directory (`GET <hub>/_agent-native/org/apps` with an org A2A token, 60 s cache
  keyed by caller scope) → self. Cross-app = A2A to
  `<origin>/_agent-native/a2a`; self = an A2A task on its own endpoint through a
  `localAgentTaskClient`, or an in-process inline task when there is no origin
  (`AN builtin-tools.ts:1033–1135`, `AN packages/core/src/mcp/org-directory.ts:1–60,326–337`).
- Hosted calls are durable: submit `message/send` with `async: true` and an
  idempotency key, wait inline **at most 20 s** (default 20 s,
  `ASK_APP_MAX_INLINE_WAIT_MS = 20_000`), poll every 1.5 s, then return
  `{ taskId, taskHandle, status, pollAfterMs, poll: { tool: "ask_app_status",
  arguments: { app, taskId, taskHandle } } }` (`AN builtin-tools.ts:47–58,233–336`).
- `taskHandle` is a JWE (`CompactEncrypt`) with a key derived by
  HMAC(`A2A_SECRET` or auth secret, `"agent-native:ask-app-task-handle:v1"`),
  binding issuer app, issuer audience, organization, subject, route and task id,
  TTL 1 h (`AN packages/core/src/mcp/ask-app-task-handle.ts:7–60`).
- Status reads retry `[250, 750, 1500] ms` on transport/timeout/5xx/429, then
  answer `status: "unknown", statusRead: "unavailable", retryable: true` — "Never
  resubmit `ask_app` to recover, because submission can duplicate work" (docs
  mcp-protocol L274–281).
- Completed answers carry `verification: "unverified"`: "A completed response is
  an agent claim, not proof of a write" (`AN builtin-tools.ts:1140–1145`).
- Dispatch overrides `ask_app`/`open_app` with versions filtered to the user's
  granted apps (§14).

### Principle

"Do not design an external agent integration around a ten-minute blocking
`tools/call` … The task must be created before the first response can time out"
(docs external-agents-catalog L294–302).

### Gaps

- Docs say 25 s; code clamps to 20 s (`AN build-server.ts:332–343`,
  `AN builtin-tools.ts:47–48`; docs mcp-protocol L241) — unchanged since the
  earlier note.
- Hiding `ask-agent` behind the full tier is cosmetic: `ask_app` without `app`
  reaches the same local agent in the compact tier **(inference)**.

---

## 10. MCP Apps (server side): `ui://` resources that embed the real app

### What it is

The official `io.modelcontextprotocol/ui` extension: a tool points at a `ui://`
HTML resource the host renders inline; Agent-Native's resource is a shell that
loads a signed route of the real React app (docs mcp-apps L18–40, L141–240).

### How it works

**Authoring.** `mcpApp: { resource: embedApp({...}) }` or `embedRoute({ title,
openLabel, path })` which returns matching `link` + `mcpApp`
(`AN packages/core/src/mcp/embed-route.ts:39–76`). Config shape
(`AN action.ts:662–721`):
```ts
const MCP_APP_EXTENSION_ID = "io.modelcontextprotocol/ui";
const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";
interface ActionMcpAppConfig { structuredContent?: boolean; compactCatalog?: boolean;
  visibility?: Array<"model" | "app">; resource?: { uri?, name?, title?, description?,
  html: string | ((ctx) => string), csp?: { connectDomains?, resourceDomains?,
  frameDomains?, baseUriDomains? } | builder, permissions?: { camera?, microphone?,
  geolocation?, clipboardWrite? }, domain?, prefersBorder?, _meta? } }
```

**Gate (off by default).** Resources, `_meta.ui` on tools, and embed starts are
produced only when `requestMeta.inlineMcpApps` is true:
`AGENT_NATIVE_MCP_APPS_INLINE=1`, the caller's email in
`AGENT_NATIVE_MCP_APPS_INLINE_ALLOW_EMAILS`, a directory profile, or a verified
first-party sibling sending `x-agent-native-mcp-inline-apps`
(`AN build-server.ts:361–379,2828–2835,2342–2353`; `AN server.ts:457–461`).
Changelog: "Adds a deploy-toggleable kill switch for inline MCP App embeds, **off
by default** … When disabled, no `ui://` resource is advertised or referenced and
tool results fall back to their deep-link text"
(`AN packages/core/changelog/archive/CHANGELOG.md:8560–8565`). The
`resources` capability itself is advertised whenever widgets *could* apply.

**Resources.** URI = `resource.uri` or `ui://<appId>/<action>`, versioned with a
shell suffix (`/shell-v65`; directory widgets share `ui://<app>/shell-v69`), with
legacy URIs still matched (`AN build-server.ts:1969–2086`). `resources/list`,
`resources/templates/list` (empty for directory) and `resources/read` are
filtered by the service grant; `read` returns `{ uri, mimeType, text: html, _meta }`
where `_meta.ui` carries CSP/permissions/domain/prefersBorder and the
`openai/widget*` mirrors (`:2125–2230,3526–3684`).

**Embed flow.**
1. The tool call (e.g. `open_app({ path, embed: true })`) mints a one-time embed
   ticket and returns the signed start URL only in `_meta["agent-native/embedStart"]`.
2. Otherwise the shell calls the app-only tool `create_embed_session({ url|path,
   chrome })` (`_meta.ui.visibility: ["app"]`), which requires an authenticated
   MCP caller and a same-origin path and stores a hashed ticket
   (`AN builtin-tools.ts:956–1031`).
3. `GET /_agent-native/embed/start?ticket=…` consumes it and sets a short-lived,
   route-scoped, iframe-safe session (plus `__an_embed_token` fallback for
   blocked third-party cookies) (docs external-agents-catalog L538).
   Table: `agent_native_embed_tickets(ticket_hash PK, owner_email, org_id,
   target_path, scope, created_at, expires_at, consumed_at, renewal_expires_at,
   session_active_until)`; ticket TTL 5 min, embed token TTL 1 h
   (`AN packages/core/src/server/embed-session.ts:37–39,205–238,799–930`).
4. Claude: "single-frame transplant" (fetch the signed HTML and hydrate inside
   the host iframe); ChatGPT: controlled route iframe using `window.openai`;
   bridge methods `ui/initialize` (protocolVersion `2026-01-26`),
   `ui/update-model-context`, `ui/message`, `ui/open-link`,
   `ui/request-display-mode`, or the `agentNative.mcpHost.*` postMessage relay
   (`AN packages/core/src/mcp/embed-app.ts:40–60,2505–2535`; docs mcp-apps L207–240).
5. Height clamps 320–900 px (default 560, 44 px chrome) (`embed-app.ts:48–52`).

**Directory widgets** (ChatGPT/Codex plugin listings): only profile
`widgetTargets` attach a widget; per-call scoped *capabilities* allow listed
read/write actions bound to exact resource ids; renewals up to 30 days
(`AN build-server.ts:1475–1845`, `AN embed-session.ts:39`).

### Principle

"Every MCP App is a **real React route**, not a separate plain-HTML widget"
(docs mcp-apps L18); "Do not hand-write one-off plain HTML MCP Apps for product
UI" (docs mcp-apps L40), enforced by `scripts/guard-no-one-off-mcp-app-html.mjs`.
"The iframe never receives raw OAuth tokens; the host mediates calls" (docs
external-agents L378).

### Changes since 0.206.0

`c19512c` keeps start URLs out of model-visible results; `590252b` declares
annotations on the directory `create_embed_session`.

### Gaps / sharp edges

- Docs present inline rendering as a working default ("In hosts that support MCP
  Apps, Analytics can render real dashboard and analysis routes inline", docs
  external-agents L247) and mention the gate only once ("When inline MCP Apps are
  enabled", docs mcp-apps L24) without naming the env switch.
- `create_embed_session` is `readOnly: false`, so an `mcp:read`-only grant
  cannot start an embed **(inference from `isActionVisibleForOAuthScope`)**.
- We noted security-relevant gaps in this area; they are recorded separately
  in a private note.

---

## 11. The app as an MCP client of other servers

### What it is

The in-app agent (and automations, extensions, MCP App renderers) can use tools
from local stdio servers, remote HTTP servers, workspace-shared servers and sibling
Agent-Native apps (docs mcp-clients L24–603).

### How it works

**Config sources, merged per principal** (`buildMergedConfig`,
`AN packages/core/src/mcp-client/routes.ts:226–331`):
1. Base: workspace-root `mcp.config.json` (found via `agent-native.workspaceCore`)
   → else app-root `mcp.config.json` → else `MCP_SERVERS` env JSON → else
   auto-detected `claude-in-chrome-mcp` (`AN packages/core/src/mcp-client/config.ts:100–238`).
   Entry shapes: `{ command, args?, env?, cwd? }` (stdio) or `{ type: "http",
   url, headers? }`.
2. Personal servers: settings key `u:<email>:mcp-servers-remote`; team servers:
   `o:<orgId>:mcp-servers-remote` (owners/admins write).
3. Built-in local-dev capabilities (chrome-devtools, playwright, computer-use on
   macOS), skipped when `NODE_ENV === "production"`
   (`AN packages/core/src/mcp-client/builtin-capabilities.ts:55–75`).
4. Dispatch workspace resources `mcp-servers/<name>.json` (kind `mcp-server`,
   HTTP only, `${keys.NAME}` placeholders resolved from the secret store, all-app
   or granted per app) (`AN packages/core/src/mcp-client/workspace-servers.ts:17–20,192`).
5. Legacy hub: `GET <AGENT_NATIVE_MCP_HUB_URL>/_agent-native/mcp/hub/servers`
   with `AGENT_NATIVE_MCP_HUB_TOKEN`, org-scope rows only, full headers included.

**Namespacing & isolation** (`AN packages/core/src/mcp-client/remote-store.ts:715–750`,
`AN mcp-client/manager.ts:135–154`, `AN mcp-client/visibility.ts:1–41`):
```
mcp__<serverId>__<tool>
serverId = <fileId>                         process-wide (visible to everyone)
         | user_<sha256(email)[0:10]>_<name>
         | org_<sanitized orgId>_<name>
         | hub_<orgId>_<name>
```
`isMcpToolAllowedForRequest` hides a user/org tool unless the request's email
hash / org id matches; with no request context it **denies in production** and
allows in dev. The run wrapper re-checks before every call.

**Managers.** One `McpClientManager` per normalized `(userEmail, orgId)`,
LRU-bounded to 32, evicted after 15 min idle, re-hydrated every 60 s; anonymous
principals get none (`AN packages/core/src/server/agent-chat/mcp-glue.ts:23–149`).
Static registries stay MCP-free; MCP entries are resolved per request
(`AN agent-chat-plugin.ts:1435–1494`).

**Connection** (`AN manager.ts:435–587`): `StreamableHTTPClientTransport` or
`StdioClientTransport`; client `{ name: "agent-native-mcp-client" }` declaring the
MCP Apps extension capability and `versionNegotiation: { mode: "auto" }`; 5 s
connect + list timeout; expired-session reconnect with replay. Stdio children get
only `PATH, HOME, TMPDIR, LANG, LC_ALL, USER, SHELL` plus their configured `env`
("We previously merged the entire `process.env` into the child, which exposed every
deployment secret", `:482–505`). Tools whose input schema fails `assertUsableSchema`
are held back and reported in `/_agent-native/mcp/status` (`:52–125`).

**Wrapping as actions** (`AN packages/core/src/mcp-client/index.ts:186–299`):
```ts
{ tool: { description, parameters: tool.inputSchema }, http: false, fromMcpServer: true,
  planMode: { effect: (args) => classify(tool, args).effect },  // read | write | unknown
  ...(annotations.readOnlyHint === true ? { readOnly: true } : {}),
  ...resolveMcpActionEntry?.(tool),            // app hook: needsApproval, authorize
  run: guard → read-only policy → manager.callTool(name, args, { context, authorize }) }
```
Plan-mode classification uses `readOnlyHint`, then verbs in the tool name or a
runtime `action` argument (`click/fill/navigate/…` = write,
`get/list/snapshot/…` = read) (`AN packages/core/src/mcp-client/tool-policy.ts:21–173`).
`callTool` re-runs the authorization callback per attempt and refuses if the
server or tool changed while authorizing (git `459b1eb`, external contributor)
(`AN manager.ts:876–938`). Results are flattened to text (structured JSON
preferred for read-only tools), images extracted, and a `ui://` resource read so
the in-app `McpAppRenderer` can render third-party MCP Apps
(`AN mcp-client/index.ts:301–565`; `readResource` only allows `ui://`, `manager.ts:940–966`).

**Credentials.**
- Static headers: names matching `/authorization|api[-_]?key|token|secret|bearer|x-.*-key/i`
  are moved to `app_secrets` (AES-256-GCM via `writeAppSecret`); the settings
  row stores only `headerSecretKey` (`AN remote-store.ts:1–21,75–104,382–440`).
- Interactive OAuth (`/_agent-native/mcp/servers/oauth/{start,callback}`):
  SDK v2 `auth()` with discovery (`discoverOAuthServerInfo`), DCR with branded
  client metadata (app name/logo), PKCE, RFC 8707 `resource` validated to equal
  the server URL or origin, RFC 9207 `iss` check, all fetches through an SSRF
  guard (`AGENT_NATIVE_MCP_OAUTH_PRIVATE_ORIGINS` allow-list), flow state in an
  encrypted chunked cookie (≤8×2.8 KB); tokens stored via the `oauth-tokens`
  lifecycle with refresh (issuer-bound) and 60 s skew
  (`AN packages/core/src/mcp-client/oauth-client.ts:34–37,366–470,615–770,835–1212`,
  `oauth-flow-cookie.ts:1–41`, `oauth-routes.ts:230–300`). Google Workspace MCP
  endpoints use a hard-coded Google OAuth path with per-host scopes
  (`oauth-client.ts:39–100`). The client does **not** publish its own CIMD URL:
  if an AS supports only CIMD, start fails with
  `McpOAuthRegistrationUnsupportedError` (`:774–857`).
- **First-party siblings**: an org-scope server marked `firstParty` whose URL
  matches the org directory gets every request re-signed with a 5-minute A2A JWT
  (`scope: "mcp-connect"`, `agent_native_first_party_mcp: true`, `aud` = the
  sibling's `/mcp`) and `x-agent-native-mcp-inline-apps: 1`; static
  `Authorization` headers are stripped (`AN manager.ts:1026–1218`,
  `AN remote-store.ts:468–543`).

**Other consumers.** Extensions call `agentNative.mcp.listTools()` /
`callTool(serverId, tool, args)` through the host's action surface and never see
URLs or tokens (docs mcp-clients L355–392; `AN mcp-client/app-api.ts:59–191`).

### Principle

"Individual MCP server failures never take down the agent" (docs mcp-clients
L584–592). "Defense-in-depth: even if a cross-scope MCP tool somehow makes it into
the LLM's visible tool list, reject invocation here so we never execute a user's
credentials on behalf of another user" (`AN mcp-client/index.ts:241–243`).

### Changes since 0.206.0

`459b1eb` per-call authorization hook for connected MCP tools; `836c535` OAuth
callbacks for workspace apps; `3a73a99` HubSpot OAuth guidance.

### Gaps / sharp edges

- Each of up to 32 principal managers spawns its own stdio children
  **(inference)**.
- We noted security-relevant gaps in this area; they are recorded separately
  in a private note.
- Docs say the Atlassian/OAuth-only providers need "the provider's OAuth flow
  instead of a static header" and that the generic form "does not replace
  Atlassian's interactive OAuth consent flow" (docs mcp-clients L328–333, L353);
  the code now has that interactive OAuth client. Docs also name tools
  `mcp__<scope>-<name>__*` (L351, L419) where the code uses
  `mcp__<scope>_<owner>_<name>__*`.
- No approval by default on remote tools (§8).

---

## 12. WebMCP: the page as a tool provider and consumer

### What it is

Browser-local tools on `document.modelContext` (WebMCP proposal), polyfilled with
`@mcp-b/webmcp-polyfill` (docs webmcp L11–65).

### How it works

- **Producer, automatic.** On authenticated pages `AppProviders` runs
  `createAgentNativeServerActionWebMcpRegistration`: fetch
  `/_agent-native/webmcp/manifest` (session cookie, `X-Agent-Native-Browser-Tab`),
  register each action with `registerTool`, execute by POSTing to
  `/_agent-native/webmcp/actions/:name`, then dispatch
  `agentNative:refresh-data` after non-read-only calls
  (`AN packages/core/src/client/webmcp.ts:1144–1223`, started from `AN packages/toolkit/src/app/providers/AppProviders.tsx`). Limits: 1,000 tools, 10,000-char
  descriptions, 500,000-char inputs/results/manifests (`:121–126`).
- **Server routes** (`AN packages/core/src/server/action-routes.ts:1832–1990`):
  eligible = `isActionExposedToExternalAgents && !uiOnly` and name matching
  `/^[A-Za-z0-9_.-]{1,128}$/`; agent-only (`http: false`) actions included;
  `caller: "webmcp"`, forced POST, no delegated callers. Unauthenticated callers
  see only public actions or capability-scoped ones.
- **Approval**: refused with 409 when the predicate trips (§8).
- **Page helper** `window.__agentNativeWebMcp` (`ready`, `tools`, `call` with
  stale-descriptor retry and `{ state: "pending", id }` beyond `waitMs`) for
  evaluator-driven agents (`AN client/webmcp.ts:665–1097`; docs webmcp L67–107).
- **Explicit page tools**: `createAgentNativeWebMcpRegistration({ actions,
  exposedTo, getContext })`; sensitive actions without an approval path fail
  registration (docs webmcp L149–211).
- **Consumer**: `createAgentNativeWebMcpClient({ fromOrigins })` passed to
  `AgentNativeEmbedded`/`AgentNativeFrame`; the chat gets
  `list-browser-session-webmcp-tools` / `run-browser-session-webmcp-tool`
  (always approval) (docs webmcp L213–288).
- **Fetch-first compat**: `GET /.well-known/mcp.json` with
  `schema_version: "v1"`, `protocol: "WebMCP"`, endpoints (`mcp`, `httpTools`,
  `authenticatedWebMcp`, `a2a`), and every eligible action's
  `{ name, title, description, inputSchema, endpoint: /mcp/tool/:name, method:
  POST, readOnly, requiresAuth }`; `POST /mcp/tool/:name` uses the WebMCP
  dispatcher (`AN action-routes.ts:1776–1830,1857–1882`).

### Principle

"WebMCP is not a network MCP server and does not make a closed app globally
discoverable" (docs webmcp L25–27). "The strict polyfill makes the page API
available, but it does not inject the relay embed script automatically. This
separation prevents every deployed app from opening a local connection without the
app owner's opt-in" (docs webmcp L145–147).

### Gaps / sharp edges

- We noted security-relevant gaps in this area; they are recorded separately
  in a private note.
- The automatic producer exposes the full eligible registry to any page-level
  agent the browser lets in; restriction is via action flags only (docs webmcp
  L60–61).

---

## 13. A2A: agent cards, JSON-RPC tasks, claims, approvals

### What it is

Agent-to-agent delegation where the receiving app runs its own LLM loop
("Use A2A when the receiving side should think; use MCP when it should just
execute", docs a2a-protocol L12). It is the substrate for `ask_app`, Dispatch
routing, `@`-mentions of connected agents, and `agent-native invoke`.

### How it works

**Endpoints** (`AN packages/core/src/a2a/server.ts:618–1101`; mounted by the
agent-chat plugin with `publicSkillsOnly: true`,
`AN agent-chat-plugin.ts:2443–2457`):
| Route | Auth | Purpose |
| --- | --- | --- |
| `GET /.well-known/agent-card.json` | public; an A2A bearer with a user unlocks `authenticatedSkills` | card |
| `GET/POST /_agent-native/a2a/approvals/:id` | owner's browser session, same-origin POST | human review of a paused tool call |
| `POST /_agent-native/a2a/_process-task` | HMAC token bound to task id (5 min, `A2A_SECRET`); 503 in production without the secret | async worker |
| `POST /_agent-native/a2a` (and legacy `/a2a` on the client side) | JWT or legacy `apiKeyEnv` | JSON-RPC |

**Agent card** (`AN packages/core/src/a2a/agent-card.ts:5–55`):
`{ name, description, url: <base>/_agent-native/a2a, version, protocolVersion:
"0.3", capabilities: { streaming, pushNotifications: false,
stateTransitionHistory: true, connect? }, skills, securitySchemes: { jwtBearer?,
apiKey? }, security }`. Public skills drop `mcp__user_*`/`mcp__org_*` ids
("fingerprinting the tenant"), `public === false`, `requiresAuth`,
`isConsequential`, and with `publicSkillsOnly` anything not
`publicAgent.{expose, readOnly, !requiresAuth, !isConsequential}`
(`server.ts:1103–1132`). Authenticated skills = direct reads (read-only,
approval-free, `publicAgent.requiresAuth`, raw `sql/code/script/expression`
inputs only if allowed) plus delegated writes (`publicAgent.readOnly === false`)
(`AN server/agent-chat/action-filters-a2a.ts:112–236`).

**JSON-RPC methods** (`AN packages/core/src/a2a/handlers.ts:1639–1687`):
`message/send` (sync or `async: true` → enqueue + self-POST to `_process-task`),
`message/stream` (SSE; only if `streaming`), `tasks/get`, `tasks/cancel`, and the
non-standard **`actions/invoke` `{ action, input }`** — direct read-only action
execution that requires "A verified, audience-bound user identity" and a stable
org identity (`:1545–1637`).

**Messages** use `type`-discriminated parts (`text | file{name,mimeType,bytes,uri} |
data`); states add `processing` to the A2A set
(`AN packages/core/src/a2a/types.ts:11–56`). The client normalizes `kind`-style
parts, v1 `raw/url/mediaType`, and maps `auth-required` → `input-required`,
`rejected` → `failed` (`AN a2a/client.ts:1633–1707`). Status messages may carry a
`data` part `kind: "agent-native/agent-activity"` (bounded reasoning summaries, tool
names/states, progressive text — "never … tool inputs, tool results, credentials")
(docs a2a-protocol L587–600) and `kind: "agent-native/approval-required"`.

**Task store** (`AN packages/core/src/a2a/task-store.ts:36–114`):
```sql
a2a_tasks(id PK, context_id, status_state DEFAULT 'submitted', status_message,
  status_timestamp, history JSON, artifacts JSON, metadata, owner_email,
  owner_scope DEFAULT '', idempotency_key, created_at, updated_at)
  UNIQUE (owner_email, owner_scope, idempotency_key)
  UNIQUE (owner_scope, idempotency_key) WHERE owner_email IS NULL
  INDEX (created_at) WHERE status_state IN ('submitted','working','processing')
a2a_approvals(id PK, task_id UNIQUE, owner_email, org_id, tool_name, tool_input,
  approval_key, call_id, status DEFAULT 'pending', result, expires_at, created_at, updated_at)
```
`owner_scope` is `__personal__` or `__a2a_org_id__:<orgId>`; `tasks/get` answers
"Task not found" unless the verified email **and** org scope match, or an
organization principal matches an org-owned task (`AN a2a/handlers.ts:1330–1423`).
Sensitive metadata keys (`apiKey`, `Authorization`, …) are stripped
from responses (`:1281–1293`).

**Auth policy** (`AN packages/core/src/a2a/auth-policy.ts:6–61`):
production runtime = `NODE_ENV=production` or a deploy marker (Netlify, CF Pages,
Vercel, Render, Fly, Cloud Run), unless a local emulator. In production with no
secret and no API key → 503; with a secret, a missing/invalid bearer → 401. A
bearer that fails JWT checks only passes as an exact `apiKeyEnv` match.

**Token verification** (`verifyA2ATokenInternal`, `AN a2a/server.ts:423–616`):
1. Peek unverified `org_domain`, `aud`, `iss`.
2. Audience check against this receiver's canonical audience
   (`APP_URL|URL|DEPLOY_URL|BETTER_AUTH_URL` or host, `APP_BASE_PATH`, route
   prefix); if the receiver cannot compute one → reject ("fail closed"). When
   the check applies is among the security-relevant gaps we recorded separately,
   in a private note.
3. Try the deploy `A2A_SECRET`: MCP credentials are rejected; if the org's
   stored secret equals the deploy secret the identity is demoted to an
   organization principal; otherwise the `org_domain`/`org_id` claim is bound to
   local org metadata and the **`sub` email is accepted as the user**.
4. Else try the org secret found via `org_domain`: success yields an
   **organization principal only** (`email: null`), logged once as "user token
   verified only with org secret".
5. Service principals are admitted against their governance record.

**Signing** (`AN a2a/client.ts:185–287`, `AN a2a/caller-auth.ts:22–117`):
`signA2AToken(email, orgDomain, orgSecret, { audience, expiresIn = "15m",
preferGlobalSecret, extraClaims })` → HS256 `{ ...extra, sub, org_domain?, iss:
APP_URL, iat, exp, aud? }`; `signA2AOrganizationToken` (5 min) strips any identity
claims from `extraClaims`. `callAgent` builds attempts: user JWT with the global
secret, then org JWT, then caller-supplied keys, each bound to the target's
canonical audience (`AN a2a/client.ts:2123–2170`).

**Continuations & reliability.** Async tasks: enqueue → self-fire → claim with an
execution lease → sweeper re-fires stuck ones; Slack/email continuations poll
remote tasks ≤~20 min / 30 attempts (docs a2a-protocol L223–285, L666–687).
Idempotency keys (≤128 chars) dedupe submissions.

**Delegation limits.** `delegationDepth` and `visitedApps` travel in metadata,
`MAX_A2A_DELEGATION_HOPS = 3` (`AN packages/core/src/a2a/correlation.ts:4–84`).

**Other peers.** Hosted agents with `auth: { type: "bearer", credentialRef }` or
`oauth-client-credentials` (token cached, SSRF-guarded) (`AN a2a/remote-agent-auth.ts`);
Microsoft Foundry and Gemini Enterprise via the generic client (docs a2a-protocol
L367–471); Anthropic Managed Agents via an adapter that maps blocking
`agent.tool_use`/`agent.mcp_tool_use` to `input-required` and resumes with
`user.tool_confirmation` (header `managed-agents-2026-04-01`)
(`AN packages/core/src/a2a/anthropic-managed-agents.ts:26,427,739–793`).

**`a2a-claims`.** `verifyA2ATokenWithClaims` (`AN packages/core/src/a2a-claims.ts:14–64`)
wraps the verifier for HTTP action routes: requires a user email, a non-empty
`aud`, a matching `org_domain` (and `org_id` if claimed), and a `jti`; returns
`scope[]`. Used for feature-flag delegation (`flags:read`/`flags:write`,
one-time `jti` for writes) (`AN server/action-routes.ts:171–205`).

### Principle

"Bearer validation runs at the request boundary … before the agent loop ever sees
the message … Putting the bearer check inside the loop, or relying on a tool to
enforce it, would let prompt-injection or a buggy handler bypass auth" (docs
a2a-protocol L640–650). "Org-secret tokens carry an organization principal and
never supply a user identity" (`AN a2a/server.ts:90–95`). From the agents'
skill: "Use A2A only on request or for required peer-owned data, credentials, or
capabilities. Availability or enrichment alone doesn't qualify; artifacts stay in
their owning app" (`AN AGENTS.md:251–254`).

### Changes since 0.206.0

`108b9d9` approved A2A replays get the paused task's ids; `41f86eb` durable runs
survive worker restarts; `517fade` names causes of workspace 503s; `bc7309d`
aligned org-directory audiences.

### Gaps / sharp edges

- We noted security-relevant gaps in this area; they are recorded separately
  in a private note.
- The docs list four JSON-RPC methods; `actions/invoke` and the `processing`
  state are undocumented.
- The docs say external peers use "the bearer-token model (`apiKeyEnv`)"; the
  client also signs audience-bound user JWTs (`AN a2a/client.ts:2123–2170`).

---

## 14. Multi-app workspaces, Dispatch as gateway, cross-app identity

### 14.1 Workspace shape and trust

- **Unified deploy**: one origin, one path per app (`/mail/*`, `/calendar/*`),
  shared cookie, shared `DATABASE_URL`, shared `A2A_SECRET`/`BETTER_AUTH_SECRET`
  (docs workspace-deployment L10–124; docs multi-app-workspace L336). Production
  workspace deploys **refuse to run without `A2A_SECRET`** and tell the operator
  to `netlify env:set A2A_SECRET "$(openssl rand -hex 32)"`
  (`AN packages/core/src/deploy/workspace-deploy.ts:2142–2160`). Self-hosted
  Docker Compose passes the same secret to every container (docs
  workspace-deployment L271–324).
- Sibling A2A targets on loopback are allowed past the SSRF guard only for origins
  this deployment configured for itself: "Trust only origins this deployment
  configured for itself — never a value that arrived on a request"
  (`AN packages/core/src/a2a/workspace-private-origins.ts:3–39`).
- Layering of code-level resources: app-local → `packages/shared` → framework,
  merged by file name (docs multi-app-workspace "What you override where").
  Runtime resources (skills, instructions, agent profiles, MCP servers) come from
  Dispatch "All apps" or "Selected apps" scope.
- Built-in first-party agents (`agent-native.builtinAgents: { mode, include,
  urls }`, passed as `AGENT_NATIVE_BUILTIN_AGENTS_JSON`) feed discovery; "MCP app
  access stays a separate routing permission" (docs multi-app-workspace
  L253–278; the `urls` override is new since 0.206.0).

### 14.2 Dispatch as the single MCP gateway

- One connector (`https://dispatch.agent-native.com/mcp`) reaches granted apps;
  Dispatch's Agents page stores `dispatch-mcp-app-access = { mode: "all-apps" |
  "selected-apps", selectedAppIds }` in org (owner/admin-only, membership
  re-checked with fail-closed SQL) or user settings
  (`AN packages/dispatch/src/server/lib/mcp-access-store.ts:13–141`).
- `ask_app` → A2A `message/send` to the target with a user JWT (`A2A_SECRET`)
  and org context, `async: true`, an idempotency key, and the same 20 s inline
  budget (`AN packages/dispatch/src/server/lib/mcp-gateway.ts:57–61,813–870`).
- `open_app({ embed: true })` for another app: Dispatch becomes an **MCP client**
  of the target's `/mcp`, authenticating with a 5-minute `A2A_SECRET` user JWT
  (`aud` = target `/mcp`, `org_id` claim), and calls the target's
  `create_embed_session` (3 attempts, 95 s budget); "Cross-app embed sessions
  require A2A_SECRET to preserve the authenticated user identity; an
  organization-only A2A credential cannot create a user-owned session"
  (`mcp-gateway.ts:1123–1190`).

### 14.3 Cross-app identity (SSO federation)

- Dispatch is the identity hub (`AGENT_NATIVE_IDENTITY_HUB_URL`). Target app:
  exact registered client (`IDENTITY_SSO_APP_REGISTRY_JSON` on self-hosted hubs),
  one-time code + PKCE + state/nonce, server-to-server exchange, signed assertion
  "never appears in a browser URL", JIT link/create by **verified email**,
  append-only identity links; silent `prompt=none` behind `browser.identity-sso`
  (docs cross-app-sso L30–71, L104–191).
- In code the assertion is verified with **`A2A_SECRET`** (HS256) with
  `aud` = redirect URI, `scope: "identity"`, exact client id/redirect/authority,
  ≤5 min age, `jti` replay table (`AN packages/core/src/server/identity-sso.ts:61–80,449–500`;
  tables `identity_sso_flow_state`, `identity_sso_jti` in
  `AN server/identity-sso-store.ts:320–345`).
- Organization federation (flag `organization.cross-app-federation`, off by
  default) uses per-app secrets `AGENT_NATIVE_IDENTITY_FEDERATION_SECRET[_<APP>]`
  — "Do not reuse `A2A_SECRET` for this authority boundary" (docs cross-app-sso
  L72–98). Join key = `(identity_authority, identity_id)`, never names, domains or
  cookies.
- "Connect apps (labs)" (`labs.connectApps`): Dispatch `/connect` reads
  `https://www.agent-native.com/apps.json`, fetches each target's agent card, and
  offers Connect only if `capabilities.connect: true`; it then opens the target's
  `/_agent-native/identity/login?prompt=none`. No hub-side registration, consent
  records, or revocation yet (docs cross-app-connect-design L42–58, L92–100). The cookie
  boundary: no wildcard `*.agent-native.com` cookie, because "A compromised app
  could use that bearer cookie to take over every other app's session"
  (docs cross-app-connect-design L60–66).

### 14.4 Org directory (sibling discovery in production)

`GET <hub>/_agent-native/org/apps` with an org A2A token returns allow-listed
first-party apps `{ id, name, url, a2aUrl, capabilities? }`; inactive unless
`AGENT_NATIVE_ORG_DIRECTORY_URL` or `AGENT_NATIVE_IDENTITY_HUB_URL` is set; cached
60 s per caller scope (`AN packages/core/src/mcp/org-directory.ts:1–60`).

### 14.5 Workspace connections (connect once, grant apps)

Provider metadata + per-app grants + `credentialRefs` that point at vault keys,
never values (docs workspace-connections). Tables
(`AN packages/core/src/workspace-connections/migrations.ts:10–102`):
```sql
workspace_connections(id PK, provider, label, account_id, account_label, status,
  scopes_json, config_json, allowed_apps_json, allowed_users_json,
  allowed_user_groups_json, credential_refs_json, owner_email, org_id,
  created_at, updated_at, last_used_at, last_checked_at, last_error)
workspace_connection_grants(id PK, connection_id, provider, app_id, scopes_json,
  config_json, credential_refs_json, granted_by_email, owner_email, org_id, …)
  UNIQUE (connection_id, app_id)
workspace_user_groups(id PK, org_id, name, normalized_name, member_emails_json, …)
```
Credential resolution reads the granted ref through the vault in the request
scope (`AN packages/core/src/workspace-connections/credentials.ts:1–60`).
`allowedApps: []` means "every app in the same scope" (legacy).

### Principle

"Prefer many one-job apps in a workspace over one oversized app … Call a peer only
when the user asks or the outcome requires data, credentials, or a capability only
that peer can provide" (`AN packages/core/src/templates/workspace-core/.agents/skills/composable-mini-apps/SKILL.md:11–19`).
"Keep the boundary strict: provider metadata is safe to show; credential values
stay in the vault" (docs workspace-connections L488).

### Gaps / sharp edges

- Docs: "zero-config cross-app A2A … no CORS, no JWT signing between siblings"
  (docs workspace-deployment L78; docs multi-app-workspace L336). Code signs a JWT
  on every sibling call and refuses production deploys without `A2A_SECRET`.
- We noted security-relevant gaps in this area; they are recorded separately
  in a private note.
- The workspace-connections data model in the docs omits
  `allowed_users_json` / `allowed_user_groups_json` and the user-groups table.

---

## 15. Agent teams and delegation limits

- In-app sub-agents ("custom agent" profiles in `agents/<slug>.md`) run in their
  own thread with their own prompt and tools, appear as chips, persist state in
  `application_state` under `agent-task:<taskId>`, and support follow-ups both
  ways; the `agent-teams` tool has `spawn | status | read-result | send | list`
  (docs agent-teams L11–200).
- Depth guard: default max depth 2, `AGENT_NATIVE_MAX_SUBAGENT_DEPTH` 0–16,
  ambient via AsyncLocalStorage, pure `evaluateSubagentDepth(parentDepth)`
  (`AN packages/core/src/server/agent-teams.ts:143–162`; docs agent-teams L254–288).
- Cross-app: A2A carries `delegationDepth`/`visitedApps`, capped at 3 hops
  (`AN a2a/correlation.ts:4,46–83`); the selected receiver hides
  `describe-workspace-apps` and `call-agent` from its tool surface when it owns the
  objective (`AN action-filters-a2a.ts:682–712`).
- Principle: "Sub-agents can spawn sub-agents, which is a runaway/cost risk …
  enforced server-side, independent of any tool-level guard" (docs agent-teams
  L254).

---

## 16. Embedding SDK: what lands in the host page

### What it is

Ways to put an Agent-Native agent inside another product (docs embedding-sdk).

### How it works

- **Batteries-included**: server `createAgentNativeEmbeddedPlugin({ databaseUrl,
  auth: (event) => hostSession, actions, agentChat })` mounts auth (host session
  normalized to `{ email: email ?? userId, userId, orgId, orgRole }`, Google OAuth
  routes off), core routes, resources, optional org/onboarding/integrations/terminal,
  and the agent chat — i.e. `/_agent-native/*` routes and framework tables inside the
  host's server and database (`AN packages/core/src/server/embedded.ts:1–230`).
  Client `<AgentNativeEmbedded getContext actions onRefresh onNavigate onRemount>`
  renders the sidebar in the host React tree (docs embedding-sdk L64–167).
- **Host bridge** `<AgentNative agentUrl … />`: an iframe sidecar plus a
  postMessage bridge that answers context requests (`route`, `resource`,
  `selection`, `user`, `organization`, optional visible text/DOM), runs host
  **client actions** (`defineClientAction` with JSON schema, `destructive`,
  `approval`) and **commands** (`navigate`, `refreshData`, `remountView`,
  `hardReload`, `openResource`, `requestApproval` — no default handler for the
  last); messages accepted only from `agentUrl`'s origin (docs embedding-sdk
  L287–416, L635–648).
- **Server-mediated browser sessions**: the sidecar registers the tab; backend
  tools (`list-browser-sessions`, `view-browser-session`,
  `list-browser-session-actions`, `run-browser-session-action`,
  `send-browser-session-command`) enqueue requests that the live tab claims, so
  Slack/A2A runs can still touch an open tab (docs embedding-sdk L418–489).
- **`@agent-native/embedding`** (0.2.0) is a thin re-export of core: `EmbeddedApp`
  picker iframe with envelope `{ protocol: "agent-native.embed", version: 1,
  type: ready|message|request|response|error, name, payload, requestId }`,
  origin allow-lists (`"*"` permitted), `getMcpUrl`/`getA2AUrl`/`sendMessage`
  (A2A stream with polling fallback)
  (`AN packages/core/src/embedding/protocol.ts:1–120`,
  `AN packages/core/src/embedding/agent.ts:1–149`, `AN packages/embedding/src/agent.ts:1`).
- **Portable extension slot**: sandboxed Alpine.js iframes without
  `allow-same-origin`; manifest `requestedActions/requestedCommands/storageScopes/slots`
  enforced in the host; `extensionData` defaults to `localStorage` unless a backend
  storage adapter is passed (docs embedding-sdk L504–627).

### Principle

"Host auth is server-side. Do not pass identity from the browser as the source of
truth" (docs embedding-sdk L167); "host approval is useful UX, not the security
boundary" (docs embedding-sdk L652).

### Gaps

- When the host has no email, `userId` becomes the "email" owner key everywhere —
  including A2A `sub`, org membership, and the MCP-client email hash **(inference)**.
- Embedded mode creates framework tables in the host DB unless a dedicated
  `databaseUrl` is passed (docs embedding-sdk L169–181).

---

## 17. Peripheral surfaces (skimmed; interop-relevant facts only)

- **Extensions** — sandboxed iframe mini-apps with `appAction`, `appFetch`
  (framework `/_agent-native/*` only), read-only `dbQuery`, legacy `dbExec`,
  `extensionFetch` (server-side `${keys.NAME}` substitution, each key locked to a
  URL allow-list, private network blocked), `extensionData` (`tool_data`), and
  `agentNative.mcp.*` (docs extensions L263–305, L688–703; iframe CSP from
  `AN packages/core/src/extensions/iframe-csp.ts:1–41`).
- **Public Agent Web** — robots/sitemap/llms.txt/Markdown twins/JSON-LD from route
  access settings (`AN packages/core/src/agent-web/config.ts`, `generator.ts`).
  `agentWeb.publicMcp` is parsed (default `false`) but **no server code reads it**
  (grep finds only `agent-web/config.ts:35,46,86` and `packages/docs/package.json:83`);
  the docs say it "additionally exposes opted-in actions as a public MCP endpoint"
  (docs agent-web-surfaces L20, L126, L154).
- **AgentKit** — the provider-neutral chat protocol/client/HTTP transport/
  conformance suite (`@agent-native/agentkit`); capability descriptors with
  `available|degraded|unavailable|unsupported|unknown`; the host authenticates
  before the handler and "The adapter … never turns a thread id, action id, or
  widget payload into an authorization grant" (docs agentkit, HTTP transport
  section). It is the conversation interop boundary, distinct from MCP/A2A.
- **Portal** — pairs a computer via `POST /_agent-native/integrations/remote/register`;
  device token in `~/.agent-native/remote-device.json`; Local / Computer / Cloud
  (waitlisted) execution modes (docs portal L10–43).
- **Recorder** (new, git `f99e655`) — a 2-minute in-browser ring buffer of actions,
  state writes, routes, errors, toasts; redacted; exposed at
  `window.__agentNativeRecorder.report()` for the Clips extension and attached to
  Sentry; "makes no network requests of its own" (docs recorder L6–16, L212–239).
- **Plan plugin / PR visual recap** — skills + a URL-only MCP connector packaged as
  a Claude Code/Codex plugin; the GitHub Action authors recaps by calling the Plan
  MCP tool with an org **service token** (`PLAN_RECAP_TOKEN`) (docs plan-plugin
  L16–21, L199–261; `AN mcp/actions/create-org-service-token.ts:1–5`).
- **MCP Registry** — CI publishes one `server.json` per public app (remote
  `streamable-http`, immutable versions, `mcp-publisher` v1.8.1 pinned with
  checksum, GitHub OIDC) (`AN mcp-registry/README.md`; `AN scripts/mcp-registry.ts`,
  git `cfc5b59`).
- **Browser extensions** — `agent-chrome-extension` (MV3, `debugger` +
  `nativeMessaging`, "operate explicitly assigned Chrome tabs" for Desktop) and
  `agent-browser-extension` (side panel, `externally_connectable` to any https
  page, pairing accepted only with a pending nonce from session storage)
  (`AN packages/agent-chrome-extension/public/manifest.json`,
  `AN packages/agent-browser-extension/public/manifest.json`,
  `AN packages/agent-browser-extension/src/background.ts:437–466`, `pairing.ts:30–90`);
  shared `browser-control-extension-core` validates every command
  (`AN packages/browser-control-extension-core/src/policy.ts`).
- **VS Code extension** — opens Plan/Design/MCP handoff links
  (`vscode://builder.agent-native/open?url=…`, built by `toVsCodeOpenUrl`).
- **Blueprint installer / cloneable SaaS / code-agents UI** — no protocol
  mechanisms beyond the above (blueprints print Markdown recipes; templates store
  per-user MCP servers in SQL; Code UI has a "Remote Dispatch" run mode).

---

## 18. Changes since 0.206.0 (2026-10-11 → 2026-10-20), interop only

| Commit | Date | What changed |
| --- | --- | --- |
| `a78486` | 10-11 | `agent_connected` event on MCP token, device-flow and OAuth success |
| `19092a7` | 10-11 | Beta MCP server names `beta-agent-native-<app>` |
| `459b1eb` | 10-14 | Per-call authorization hook for connected (client-side) MCP tools; re-authorize on session-expiry replay (external contributor) |
| `836c535` | 10-14 | MCP OAuth (client) callbacks for workspace apps |
| `38ccdb4` | 10-16 | Fetch-native, runtime-portable MCP handler (external contributor) |
| `d0f6950` | 10-16 | Audit rows record MCP `clientInfo`, OAuth client id, approval evidence |
| `774af36` | 10-17 | Truncation notices; never advise re-calling a mutating tool |
| `3d6a9d3` | 10-17 | `tools/call` split into shared execution core + direct adapter |
| `9c277b7` | 10-17 | Catalog guards: mutating tools must declare `destructiveHint` (1,517-tool frozen baseline), write tools need `mcp:write`, instructions name only advertised tools |
| `ca67d21` | 10-18 | Provider-conformant (widening-only) input schemas with a per-provider rule ledger |
| `fab1c27` | 10-18 | Opt-in, enforced MCP `outputSchema` (5 audited actions) |
| `c19512c` | 10-19 | Embed start URLs kept out of model-visible direct results |
| `108b9d9` | 10-19 | Audit attribution fixes for MCP and A2A (approved A2A replays) |
| `9156c9d` | 10-19 | Agents cannot mint org service tokens |
| `c3e3063`, `a9e3e21` | 10-19 | Org-member tools in curated catalogs; compact tools preserved |
| `41f86eb` | 10-19 | Durable agent execution survives worker restarts (A2A runs) |
| `3a73a99` | 10-20 | HubSpot MCP OAuth setup guidance |

Docs: only `multi-app-workspace` (`builtinAgents.urls`) and the new `recorder` page.

Corrections to the earlier note ([`agent-native.md`](../agent-native.md) §2.9):
- §2.9.1 "approval is a one-time grant stored in `mcp_action_approvals`" — true but
  incomplete: the transport is the MCP 2026 `inputRequired` elicitation with a
  sealed request state (§8 here).
- §2.9.4/§2.9.5 "A2A delegated capability: gated actions are filtered out" —
  only for the direct-read surface; agent-loop A2A runs pause and hand the owner a
  browser approval page (§8, §13).
- §2.9.2 "Stdio servers … no-op in edge runtimes" — still true; add that the
  client now has its own OAuth 2.1 flow and per-principal managers.
- §2.9.1 "compact catalog … about 20–30 tools" — the compact tier itself is 6
  builtins; the 20–30 figure applies once a template declares a connector catalog.
- §2.9.3 WebMCP — add the fetch-first `/.well-known/mcp.json` catalog, and that
  `/mcp/tool/:name` shares the WebMCP path.

---

## 19. Principles list

1. **One action registry, many protocols.** MCP tools, A2A skills, WebMCP tools and
   the fetch-first catalog are projections of `defineAction` entries; exposure is a
   property of the action ("one flag stays one decision", `AN action.ts:776–778`).
2. **Membership is not permission.** Being in a catalog never grants access; scope,
   `externalAgents` policy, `publicAgent`, `authorize`/`access` still run
   (`AN action.ts:794–797`; docs external-agents-catalog L131–135).
3. **Compact by default, never inferred from the client.** (`AN build-server.ts:907–918`).
4. **Request-scoped everything.** A fresh MCP server per request; catalogs, schema
   verdicts and grants are recomputed and never cached (`AN server.ts:326–329`,
   `AN build-server.ts:428–435,3119–3120`).
5. **Live re-verification over long-lived revocation.** Long tokens, but org
   membership and email retirement are checked on every use, with no cache
   (`AN mcp/credential-membership.ts:1–12`).
6. **Unavailable is not refused.** Lookup failures return 503 + `Retry-After`,
   never a 401 that would make clients drop tokens (`AN server.ts:404–414`;
   `AN oauth-route.ts:1110–1115`).
7. **Fail closed on approval.** Predicate throws, missing codec, invalid or
   replayed state, or storage errors all refuse
   (`AN execute-action-call.ts:869–898`; `…/external-agents/SKILL.md:57–62`).
8. **Approval binds the exact call.** Caller + action + canonical args + prepared
   args hash + expiry, consumed once (`AN execute-action-call.ts:815–863`).
9. **Only a person can approve.** Service and organization principals never
   satisfy approval (`AN execute-action-call.ts:823–832,888–892`; A2A review page
   needs the owner's browser session, `AN a2a/server.ts:683–686`).
10. **Auth at the boundary, before the LLM.** (docs a2a-protocol L640–650).
11. **Org secrets assert organizations, not people.** (`AN a2a/server.ts:90–95,568–616`).
12. **Issued credentials are classified before cross-app trust rules.**
    (`AN build-server.ts:4231–4233`; `AN connect-route.ts:262–267`).
13. **Links are pointers; identity comes from the browser.** The deep link
    "carries no privileged state", the `navigate` write is scoped to the browser
    session (docs external-agents-catalog L435–437).
14. **The connected model is the author.** External agents write content with the
    app's tools rather than delegating to the app's agent (`AN agent-mcp-metadata.ts:2`;
    `…/external-agents/SKILL.md:20`).
15. **Real routes, not widget re-implementations.** (docs mcp-apps L18, L40; guard
    `scripts/guard-no-one-off-mcp-app-html.mjs`).
16. **Credentials never reach the model or the iframe.** Embed tickets travel only
    in `_meta`; host-mediated OAuth for MCP Apps; vault refs, not values
    (`AN execute-action-call.ts:277–302`; docs external-agents L378; docs
    workspace-connections L488).
17. **Widen, never narrow, advertised schemas.** The action still validates
    (`AN tool-input-schema.ts:52–56`).
18. **Ratchets for safety debt.** A frozen 1,517-tool destructiveHint baseline that
    may only shrink, with no opt-out pragma (`AN AGENTS.md:146–147`).
19. **Durable tasks over long calls.** Bounded inline wait, task handles,
    idempotency keys, never resubmit to recover (docs external-agents-catalog
    L292–312).
20. **Minimal inheritance into child processes.** Stdio MCP servers get a 7-var env
    allow-list (`AN mcp-client/manager.ts:482–505`).
21. **Many one-job apps; delegate only for peer-exclusive needs.**
    (`…/composable-mini-apps/SKILL.md:11–19`; `AN AGENTS.md:251–254`).
22. **Verified email and exact ids are the only join keys across apps.** (docs
    cross-app-sso L129–137; docs cross-app-connect-design L75–80).

---

## 20. Docs vs code

| # | Docs claim | Code | Sources |
| --- | --- | --- | --- |
| 1 | Hosted `ask-agent` wait "capped at 25 seconds" | 20 s (`ASK_AGENT_MAX_INLINE_WAIT_MS`, `ASK_APP_MAX_INLINE_WAIT_MS`, Dispatch too) | docs mcp-protocol L241; `AN build-server.ts:332–333`, `AN builtin-tools.ts:47–48` |
| 2 | Approval "works the same way for … A2A, and MCP callers, because every agent surface routes through the same loop" | Direct MCP uses `inputRequired` elicitation; A2A uses a browser review page; WebMCP refuses | docs actions-access-control L167; §8 |
| 3 | "the in-app agent loop is the only surface that can run its actual human approval flow" | MCP elicitation also approves | docs webmcp L49–50; `AN build-server.ts:3088–3117` |
| 4 | *(Recorded separately in a private note.)* | | |
| 5 | *(Recorded separately in a private note.)* | | |
| 6 | *(Recorded separately in a private note.)* | | |
| 7 | `tool-search` "discovers full-tier tools on demand" / "call it with no query for the full menu" | on MCP it searches only tools already advertised to the caller | docs external-agents-catalog L49–51, L93–97; `AN build-server.ts:392–416,2981–2984` |
| 8 | Builtins incl. `create_workspace_app`, `list_templates` "are always included regardless of the declared list" | compact/connector tiers advertise only `list_apps, open_app, ask_app, ask_app_status, create_embed_session, tool-search` | docs external-agents-catalog L202; `AN build-server.ts:875–884,2961–2979` |
| 9 | Connect tokens are "an `A2A_SECRET`-signed JWT carrying the caller's `sub` + `org_domain`" | MCP OAuth-format tokens (`client_id: agent-native-connect`), legacy format still accepted | docs external-agents-catalog L542; `AN connect-route.ts:262–292` |
| 10 | Same-origin siblings: "no JWT signing between siblings" | every sibling call signs a JWT; production workspace deploys require `A2A_SECRET` | docs workspace-deployment L78, docs multi-app-workspace L336; `AN a2a/client.ts:2123–2170`, `AN deploy/workspace-deploy.ts:2142–2160` |
| 11 | *(Recorded separately in a private note.)* | | |
| 12 | Four JSON-RPC methods | plus `actions/invoke`; states include `processing` | docs a2a-protocol L157–166; `AN a2a/handlers.ts:1680–1683`, `AN a2a/types.ts:41–48` |
| 13 | `agentWeb.publicMcp: true` "exposes opted-in actions as a public MCP endpoint" | flag parsed, never consumed | docs agent-web-surfaces L20, L126; `AN agent-web/config.ts:35,46,86` |
| 14 | MCP Apps render inline in capable hosts (presented as default) | off by default; env / allow-list / first-party / directory only | docs external-agents L247, docs mcp-apps L18–20; `AN build-server.ts:361–379,2342–2353` |
| 15 | Generic remote-server form "does not replace Atlassian's interactive OAuth consent flow" | the app has a full interactive MCP OAuth client | docs mcp-clients L328–333; `AN mcp-client/oauth-client.ts`, `oauth-routes.ts` |
| 16 | Remote tools named `mcp__<scope>-<name>__*` | `mcp__user_<hash>_<name>__*` / `mcp__org_<orgId>_<name>__*` | docs mcp-clients L351, L419; `AN mcp-client/remote-store.ts:723–750` |
| 17 | *(Recorded separately in a private note.)* | | |
| 18 | Workspace-connections data model (two tables, listed fields) | also `allowed_users_json`, `allowed_user_groups_json`, `workspace_user_groups` | docs workspace-connections DataModel; `AN workspace-connections/migrations.ts:10–102` |
| 19 | MCP endpoint table: "Supported by … other agent-native apps" for A2A; MCP docs never state the protocol version or the approval transport | code serves 2026-07-28 + 2025 stateless and uses `input_required` | docs mcp-protocol; `AN server.ts:327–329`; skill `…/external-agents/SKILL.md:44–62` |

(Items 1–3 were already in the earlier note; they are unchanged at 0.210.0.)

---

## 21. Not verified

- What the MCP SDK v2.0.0 actually sends to a 2025-era stateless client when the
  server returns `inputRequired` (approval) — SDK source is not in the clone.
- That `createRequestStateCodec` is an HMAC/AEAD construction and how it binds
  `bind(ctx)`; inferred from usage only (`AN build-server.ts:3004–3008`).
- Whether hosted `*.agent-native.com` deployments set `AGENT_NATIVE_MCP_APPS_INLINE`
  (would explain docs presenting inline MCP Apps as working).
- Whether Claude, ChatGPT, Cursor, Codex actually render the shells as described
  (docs-only claims about host behavior).
- The 2026-07-28 MCP spec contents (`server/discover`, `input_required`,
  envelope `_meta`) — taken from code comments and the skill, not from the spec.
- Whether `ask_app`-routed runs that hit approval surface the review URL to the
  MCP host user correctly (code path read, not traced end to end).
- Any per-IP/per-subject rate limiting in front of `/mcp` (none found in core).

---

## 22. Open questions

1. *(Recorded separately in a private note.)*
2. *(Recorded separately in a private note.)*
3. *(Recorded separately in a private note.)*
4. When will cross-app trust move from one shared `A2A_SECRET` to per-app keys
   (the stated marketplace direction)?
5. *(Recorded separately in a private note.)*
6. *(Recorded separately in a private note.)*
7. Will the in-app agent get default approval for remote MCP tools with
   `destructiveHint: true`, mirroring what the app demands of its own tools?
8. Is `agentWeb.publicMcp` planned, or should the docs drop it?
