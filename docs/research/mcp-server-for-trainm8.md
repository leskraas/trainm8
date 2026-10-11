# An MCP server for trainm8: the athlete's training, reachable from their own assistant

Research note · **2026-10-11** · written from primary sources.

**Spec revision read:** MCP **2026-07-28**, the current revision
([versioning](https://modelcontextprotocol.io/specification/versioning));
2025-11-25 and 2025-06-18 too, because the clients still document against them.
**SDK versions observed** in the npm registry on 2026-10-11:
`@modelcontextprotocol/server` **2.3.1** (2026-10-05), `/express` 2.0.2, `/node`
2.1.1, `/ext-apps` 2.0.3; the v1 line `@modelcontextprotocol/sdk` **1.32.1**
(<https://registry.npmjs.org/@modelcontextprotocol%2Fserver>).

**Scope:** MCP only. Sibling notes: [`agent-native.md`](agent-native.md)
(Builder.io's agent-native framework: adopt it, or build our own),
[`agent-layer-trainm8-surface.md`](agent-layer-trainm8-surface.md) (the repo's
write paths, read paths and safety rails) and
[`agent-layer-building-blocks.md`](agent-layer-building-blocks.md) (the agent
libraries, the recommended stack and the zod plan). Repo claims cite `file:line`
as read on 2026-10-11. One non-MCP source decides the scope — **Strava's API
Policy** (effective 2026-06-01, §6.1). Not legal advice. Unverifiable claims are
marked _unverified_ and listed in §10.4.

---

## TL;DR

1. **The protocol changed shape on 2026-07-28.** It is stateless: no
   `initialize`, no `Mcp-Session-Id`, version and capabilities in every
   request's `_meta`, a mandatory `server/discover`, and server-to-client
   requests replaced by **Multi Round-Trip Requests** (the server returns
   `input_required`; the client retries). Roots, Sampling, Logging and **Dynamic
   Client Registration** are deprecated
   ([changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)).
2. **The clients have not all caught up, so trainm8 must serve both eras.**
   Claude documents its OAuth client against the 2025-03-26, 2025-06-18 and
   2025-11-25 authorization specs
   ([Claude](https://claude.com/docs/connectors/building)). The v2 TypeScript
   SDK's `createMcpHandler` serves 2025-era clients statelessly **by default**
   ([legacy clients](https://ts.sdk.modelcontextprotocol.io/v2/serving/legacy-clients.html)).
3. **Strava's API Policy is the binding constraint, not MCP.** Strava's §5.16(b)
   forbids operating "any MCP Server … that exposes … Strava Data, or any subset
   thereof". §5.3 forbids "ingestion into a context window" of Strava Data **and
   of data derived from it**
   ([Strava API Policy](https://www.strava.com/legal/api_policy)). Every actual
   that came through the Strava API, and every number or proposal computed from
   one (a Week Replan reason quotes the TSB), must cross the MCP boundary as an
   **Unavailable Metric** with a `source-terms` reason. Files the athlete
   uploads, Strava bulk exports included, and Intervals.icu imports are not
   "Strava Data" as the API Agreement defines it (§6.1). That is the building
   principle doing exactly its job.
4. **Hosting is easy, because v2 serves Fetch requests.** `createMcpHandler()`
   returns `{ fetch(request, { authInfo }) }`
   ([web-standard](https://ts.sdk.modelcontextprotocol.io/v2/serving/web-standard.html)).
   A React Router resource route at `/mcp` can hand its `request` straight to
   it.
5. **Auth is the bulk of the work.** trainm8 owns the users and the login
   (password, passkey, TOTP, GitHub), so it must run an OAuth 2.1 authorization
   server or federate to one: Protected Resource Metadata (RFC 9728), AS
   metadata (RFC 8414), CIMD **and DCR** (Claude falls back to DCR), PKCE S256,
   `resource`-bound audiences (RFC 8707), rotating refresh tokens. The SDK
   "never issues" tokens and recommends a dedicated identity provider
   ([SDK authorization](https://ts.sdk.modelcontextprotocol.io/v2/serving/authorization.html)).
6. **ADR 0080 §6 already describes the write path.** It says: "AI later writes
   the same proposals on the same surface … Only the author of step 1 changes."
   The storage already accepts a proposal with `weekReplanId = null`, and
   silence never applies one (§6.2). The model **proposes**. The athlete's yes
   stays in trainm8.
7. **Each direct write returns an undo handle, as ADR 0088 asks** (writing a
   session, marking it _Gjort_, logging sets). Over MCP the handle must be
   **opaque, server-held and bound to the user**. The browser's
   `MarkDoneUndoToken` carries the prior state the client sends back, which is
   fine for a form post and wrong for a model.
8. **Clients differ.** **Claude** runs read-only tools without per-call
   confirmation and always prompts for destructive ones; it takes tools, prompts
   and resources, not sampling or subscriptions; ~150,000 characters and 240 s
   per call; MCP Apps render on web, desktop and mobile. **ChatGPT** treats a
   tool without `readOnlyHint` as a write and asks for confirmation. **The
   Messages API MCP connector** is tools-only, beta, not ZDR-eligible.
9. **trainm8's existing rate limiter would throttle Claude users who share an
   Anthropic egress IP as one.** It is keyed by `fly-client-ip`
   (`server/index.ts:99-156`), and all of Anthropic's traffic comes from
   `160.79.104.0/21`
   ([network reference](https://claude.com/docs/connectors/building/authentication#network-reference)).
   MCP needs a limit per token subject.
10. **Build one typed action registry with three readers** (`defineAction` in
    `app/actions/`, proposed ADR 0092, §8): the route actions, the MCP server
    and a future in-app agent. Calling the model in-process beats routing
    trainm8's own agent through Anthropic's MCP connector, which calls back over
    the public internet.

---

## 1. MCP in brief, as of 2026-07-28

### 1.1 Architecture and primitives

MCP is JSON-RPC 2.0 between **hosts** (LLM applications such as claude.ai), the
**clients** inside them, and **servers** (here trainm8). As of this revision the
base protocol is "Stateless, self-contained requests" with "Per-request
capability negotiation"
([spec overview](https://modelcontextprotocol.io/specification/2026-07-28)).

| Primitive     | Who decides when it is used                                                                                                                                                                     | Fit for trainm8                                                          |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Tools**     | Model-controlled; there "SHOULD always be a human in the loop with the ability to deny" ([tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools#user-interaction-model)) | Almost everything. It is the only primitive every client below supports. |
| **Resources** | Application-driven; the host decides how to include them ([resources](https://modelcontextprotocol.io/specification/2026-07-28/server/resources#user-interaction-model))                        | Static context (the vocabulary) and `ui://` widget templates.            |
| **Prompts**   | User-controlled, "for example, as slash commands" ([prompts](https://modelcontextprotocol.io/specification/2026-07-28/server/prompts#user-interaction-model))                                   | Named rituals: the weekly review, the trip replan, the session debrief.  |

Clients offer **one** non-deprecated feature to servers: **elicitation**, in
form mode (flat, primitive-only schemas) or URL mode (out-of-band, for anything
sensitive)
([elicitation](https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation)).
**Sampling** and **Roots** are deprecated as of 2026-07-28, removable in the
first revision on or after 2027-07-28
([deprecated registry](https://modelcontextprotocol.io/specification/2026-07-28/deprecated)).

### 1.2 Tool annotations and structured output

These are the annotations, with their defaults, quoted from the normative schema
([schema.ts L1912–L1954](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/schema/2026-07-28/schema.ts#L1912-L1954)):

| Hint              | Default | Meaning                                                                                                  |
| ----------------- | ------- | -------------------------------------------------------------------------------------------------------- |
| `readOnlyHint`    | `false` | "If true, the tool does not modify its environment."                                                     |
| `destructiveHint` | `true`  | "may perform destructive updates"; if false, "only additive updates". Only meaningful when not read-only |
| `idempotentHint`  | `false` | Repeated calls with the same arguments have no further effect. Only meaningful when not read-only        |
| `openWorldHint`   | `true`  | Whether the tool interacts with an "open world" of external entities                                     |

Two consequences follow:

- **trainm8 must set `openWorldHint: false` on every tool explicitly.** The
  domain is closed (the athlete's own training data), and the default says
  otherwise.
- **Annotations are claims, not controls.** Clients "MUST consider tool
  annotations to be untrusted unless they come from trusted servers"
  ([tools § Tool](https://modelcontextprotocol.io/specification/2026-07-28/server/tools#tool)).
  OpenAI warns that write actions "can occur even if the MCP server has tagged
  the action as read only"
  ([OpenAI MCP](https://developers.openai.com/api/docs/mcp)).

**Structured output.** A tool may declare an `outputSchema`. If it does,
"Servers **MUST** provide structured results that conform to this schema". A
tool returning `structuredContent` "SHOULD also return the serialized JSON in a
TextContent block"
([output schema](https://modelcontextprotocol.io/specification/2026-07-28/server/tools#output-schema)).
Since 2026-07-28, `outputSchema` may use any JSON Schema 2020-12 keyword, and
`structuredContent` may be any JSON value (SEP-2106,
[changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)).
That is what lets a tool return a discriminated `available | unavailable` union
(§6.5).

**Errors.** Validation and business-logic failures are returned as
`isError: true` results that the model can correct from. Protocol errors are
reserved for malformed requests
([error handling](https://modelcontextprotocol.io/specification/2026-07-28/server/tools#error-handling)).

### 1.3 What changed in the recent revisions

| Revision                                                                         | Change                                                                                                                                                                                                                                                                                                        | Why it matters to a web app like trainm8                                                                                                                                            |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/changelog) | Structured tool output. Servers became **OAuth resource servers** with Protected Resource Metadata. Clients MUST send RFC 8707 `resource`. Elicitation, resource links and the `MCP-Protocol-Version` header added. JSON-RPC batching removed                                                                 | The auth model trainm8 has to implement dates from here.                                                                                                                            |
| [2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/changelog) | **CIMD** recommended (SEP-991). URL-mode elicitation. Incremental scope consent via `WWW-Authenticate` (SEP-835). Input-validation failures become tool errors (SEP-1303). Experimental tasks                                                                                                                 | This is the revision Claude's and ChatGPT's auth docs cite.                                                                                                                         |
| [2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/changelog) | **Stateless.** No `initialize`, no sessions; `server/discover`. The GET stream is replaced by `subscriptions/listen`. MRTR. No SSE resumability. `Mcp-Method`/`Mcp-Name` headers required. `ttlMs`/`cacheScope` on list results. Roots, Sampling, Logging and **DCR** deprecated. Tasks moved to an extension | Easiest yet to host on one Fly machine, because nothing is held between requests. List results must declare `cacheScope` (`private` for trainm8, because the list varies by token). |

---

## 2. Remote MCP: Streamable HTTP inside trainm8

### 2.1 The transport

The server exposes **one endpoint that accepts POST**. Every JSON-RPC message is
its own POST, answered with `application/json` or an SSE stream scoped to that
request
([Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)).
Normative points that touch trainm8:

- **`Origin` validation.** Servers "MUST validate the `Origin` header … to
  prevent DNS rebinding attacks", and must answer an invalid `Origin` with `403`
  (same page, "Security & Endpoint").
- **Required headers.** Every POST carries `MCP-Protocol-Version`, `Mcp-Method`
  and, for `tools/call`, `resources/read` and `prompts/get`, `Mcp-Name`. A
  header that disagrees with the body is a `400` `HeaderMismatch` (`-32020`)
  ([server validation](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#server-validation)).
  The SDK does this.
- **Legacy traffic.** A modern-only server answers GET or DELETE with `405`, and
  ignores `Mcp-Session-Id` and `Last-Event-ID`
  ([earlier revisions](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#earlier-streamable-http-revisions)).
- **HTTP+SSE is Deprecated.** The 2024-11-05 HTTP+SSE transport is Deprecated
  under SEP-2596. trainm8 should not build it. Claude still supports it
  ([Claude](https://claude.com/docs/connectors/building)), and so does ChatGPT
  ([OpenAI custom MCP](https://developers.openai.com/api/docs/guides/custom-mcp-server)),
  but neither requires it.

### 2.2 Stateless versus session mode, and why both eras matter

**Before 2026-07-28** a Streamable HTTP server could mint `Mcp-Session-Id`, hold
a GET stream and send requests on SSE. **In 2026-07-28** none of that exists:
cross-call state travels as "explicit, server-minted handles passed as ordinary
tool arguments" (SEP-2567). The rules for those handles — "a handle is a name,
not a capability", authorize on every call, state the lifetime in the tool
description
([stateful tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools#stateful-tools))
— are exactly what trainm8's undo handles and proposal ids need.

**Serve both eras.** The compatibility matrix says a **legacy client against a
modern-only server "Fails"**, while a legacy client against a **dual-era**
server "Works"
([compatibility matrix](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning#backward-compatibility-with-initialization-based-versions)).
Claude's docs do not say which protocol revision the hosted client speaks
(_unverified_). So trainm8 must be dual-era.

The v2 SDK's default does this. `legacy: 'stateless'` gives each legacy request
a fresh instance with no sessions and answers legacy GET or DELETE with `405`.
`legacy: 'reject'` makes the endpoint modern-only
([legacy clients](https://ts.sdk.modelcontextprotocol.io/v2/serving/legacy-clients.html)).

### 2.3 SDK choice, and a Zod mismatch to resolve first

**v2 is the stable line.** `main` is v2 and implements 2026-07-28. v1.x
"continues to receive bug fixes and security updates for at least six months
after the v2 release (2026-07-27)"
([SDK README](https://github.com/modelcontextprotocol/typescript-sdk)).

**The Zod mismatch.** `@modelcontextprotocol/server@2.3.1` depends on
`zod ^4.2.0` (npm registry). Its schemas must be "any **Standard Schema** that
can produce JSON Schema"
([schema libraries](https://ts.sdk.modelcontextprotocol.io/v2/advanced/schema-libraries.html)).
trainm8 is on **`zod` 3.25.76** (`package-lock.json`).

[`agent-layer-building-blocks.md`](agent-layer-building-blocks.md#93-zod-3-or-zod-4-what-each-piece-needs)
§9.3 read the 2.3.1 source: a `'zod'` (v3) schema throws; 3.25.x's bundled
`zod/v4` runs only on a fallback that logs a warning, because its `~standard`
has no `jsonSchema`; zod ≥ 4.2 is the clean path. The plan across these notes:
write the registry's schemas in `'zod/v4'` now, and upgrade trainm8 to zod ≥ 4.2
before the server ships (Phase 1 at the latest; Phase 0 can run on the
fallback). The v1 SDK accepts `zod ^3.25 || ^4.0`, but it is on a maintenance
clock.

### 2.4 The official shape: `McpServer` + `registerTool` + Streamable HTTP

This is the SDK's own example, verbatim apart from the repo's Prettier
formatting (tabs, no semicolons)
([web-standard runtimes](https://ts.sdk.modelcontextprotocol.io/v2/serving/web-standard.html);
source
[`docs/serving/web-standard.md`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/serving/web-standard.md)):

```ts
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import * as z from 'zod/v4'

const handler = createMcpHandler(() => {
	const server = new McpServer({ name: 'notes', version: '1.0.0' })
	server.registerTool(
		'add-note',
		{
			description: 'Append a note',
			inputSchema: z.object({ text: z.string() }),
		},
		async ({ text }) => ({
			content: [{ type: 'text', text: `Saved: ${text}` }],
		}),
	)
	return server
})

export default handler
```

**The factory runs once per request.** It receives
`{ era, authInfo, requestInfo }`. Tools registered from `authInfo` can therefore
differ per caller, and `responseMode: 'json'` turns off SSE
([HTTP](https://ts.sdk.modelcontextprotocol.io/v2/serving/http.html)). The spec
allows that per-caller difference: `tools/list` "MAY vary by the authorization
presented on the request"
([tools § capabilities](https://modelcontextprotocol.io/specification/2026-07-28/server/tools#capabilities)).

**The handler validates neither `Host` nor `Origin` itself.** Put
`hostHeaderValidationResponse` and `originValidationResponse` in front of it
(web-standard page, "Protect against DNS rebinding").

**It never reads auth from headers.** Verify the token yourself and pass it in
as `handler.fetch(request, { authInfo })`. Tool handlers then read it as
`ctx.http.authInfo`.

### 2.5 Where it mounts in trainm8

The **recommended mount is a React Router resource route**, `app/routes/mcp.ts`,
whose `action` verifies the bearer token, runs the two validation helpers and
returns `handler.fetch(request, { authInfo })`, and whose `loader` answers
`405`. The repo already streams from a resource route: the Live Imports Stream's
SSE `loader` (`app/routes/resources/imports-events.tsx:15`).

The alternative is to mount it at the Express layer with `createMcpExpressApp`
and `requireBearerAuth`
([Express](https://ts.sdk.modelcontextprotocol.io/v2/serving/express.html)). If
you do, note the SDK's caveat: `@modelcontextprotocol/express` 2.0.1 "does not
pass `expectedResource` on, so nothing is compared"
([SDK authorization](https://ts.sdk.modelcontextprotocol.io/v2/serving/authorization.html)).
Upgrade it together with the server package.

This is a sketch of trainm8 code, not SDK code:

```ts
// app/routes/mcp.ts — sketch
export async function action({ request }: Route.ActionArgs) {
	const rejected =
		hostHeaderValidationResponse(request, [env.HOST]) ??
		originValidationResponse(request, ALLOWED_ORIGINS)
	if (rejected) return rejected
	const authInfo = await verifyMcpBearer(request) // 401 + WWW-Authenticate on failure
	return mcpHandler.fetch(request, { authInfo }) // factory reads authInfo.extra.userId
}
export const loader = () => new Response(null, { status: 405 })
```

Four repo facts change the plan:

1. **The rate limiter keys on IP.** `server/index.ts:99-156` puts every non-GET
   request under `strongRateLimit`, 100 per minute per `fly-client-ip`. All
   Claude traffic comes from one `/21`. `/mcp` must be exempted there and
   limited per token subject after auth (§6.8).
2. **`compression()` runs globally** (`server/index.ts:63`). The spec says SSE
   responses SHOULD carry `X-Accel-Buffering: no`. `responseMode: 'json'`
   sidesteps the question for tools that do not stream.
3. **LiteFS runs on a static lease, one node, always primary**
   (`other/litefs.yml`). Statelessness costs nothing today. If the app is ever
   scaled out, every MCP call is a POST, reads included; how the LiteFS proxy
   routes POSTs to the primary was not re-verified for this note.
4. **The `/.well-known/…` discovery documents (§3) need routes.** The repo
   already serves dotted paths through escaped route files
   (`app/routes/_seo/robots[.]txt.ts`).

---

## 3. Authorization: letting Claude into _one athlete's_ trainm8

### 3.1 What the spec requires

Authorization is optional, but an HTTP server that implements it "SHOULD
conform"
([authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)).
trainm8 must implement it: the data is per-athlete.

| Requirement                                                                                                                                                                                                                       | Who                  | Source                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Serve **Protected Resource Metadata** (RFC 9728) with at least one `authorization_servers` entry. Point at it from a `401`'s `WWW-Authenticate: Bearer resource_metadata=…` or from `/.well-known/oauth-protected-resource[/mcp]` | MCP server           | [§ overview](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization#overview), [AS location](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/authorization-server-discovery#authorization-server-location) |
| Serve AS metadata (RFC 8414) or OIDC discovery. `issuer` must equal the URL it was fetched by                                                                                                                                     | Authorization server | [AS metadata discovery](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/authorization-server-discovery#authorization-server-metadata-discovery)                                                                                  |
| OAuth 2.1, with **PKCE S256**. Clients "MUST refuse to proceed" if `code_challenge_methods_supported` is absent                                                                                                                   | AS / client          | [code protection](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/security-considerations#authorization-code-protection)                                                                                                         |
| The client sends `resource` (RFC 8707) on both the authorize and the token request. The server MUST check the token's **audience** and "MUST NOT accept or transit any other tokens"                                              | Client / MCP server  | [resource parameter](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization#resource-parameter-implementation), [token handling](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization#token-handling)           |
| Client registration: CIMD (SHOULD), pre-registration, or DCR (**deprecated**, kept for back-compat)                                                                                                                               | AS / client          | [client registration](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration)                                                                                                                                       |
| The AS **SHOULD** send `iss` in the authorization response (RFC 9207). Clients MUST validate it when present                                                                                                                      | AS / client          | [response validation](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization#authorization-response-validation)                                                                                                                         |
| Short-lived access tokens. For public clients the AS **MUST** rotate refresh tokens                                                                                                                                               | AS                   | [token theft](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/security-considerations#token-theft)                                                                                                                               |
| Insufficient scope → `403` with `error="insufficient_scope"`, `scope=…` and `resource_metadata`. Servers "SHOULD include all scopes required for the current operation in a single challenge"                                     | MCP server           | [scope challenge](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization#scope-challenge-handling)                                                                                                                                      |
| Servers "SHOULD NOT include `offline_access`" in the PRM `scopes_supported`                                                                                                                                                       | MCP server           | [refresh tokens](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization#refresh-tokens)                                                                                                                                                 |
| An AS that fetches CIMD documents should defend against SSRF                                                                                                                                                                      | AS                   | [SSRF against AS](https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices#server-side-request-forgery-ssrf)                                                                                                                |

### 3.2 Where Claude's client is stricter

These points are from
[Claude authentication](https://claude.com/docs/connectors/building/authentication):

- **Status codes.** A `401` is required to start sign-in. Claude "doesn't honor
  a `WWW-Authenticate` header on a `200` response".
- **Authorization servers.** Claude uses **only the first** entry in
  `authorization_servers`.
- **Resource.** The PRM `resource` must equal the URL exactly as the user enters
  it, including `/mcp`.
- **Registration.** Claude uses CIMD only when the AS advertises both
  `"client_id_metadata_document_supported": true` **and** `"none"` in
  `token_endpoint_auth_methods_supported`. Otherwise it falls back to DCR. Under
  DCR, Claude "register[s] a new client on every fresh connection".
- **Callback URLs.** The hosted apps (web, Desktop, mobile, Cowork) use exactly
  `https://claude.ai/api/mcp/auth_callback`. Claude Code uses a loopback
  redirect on any port, for both `localhost` and `127.0.0.1`.
- **PKCE.** Claude sends S256 on every request. Scopes come from the `401`'s
  `scope`, otherwise from PRM `scopes_supported`. Claude appends
  `offline_access` when the AS lists it.
- **Token endpoint.** Claude refreshes on a `401` and proactively up to five
  minutes before expiry. The endpoint must:
  - return `invalid_grant` for a dead refresh token;
  - accept `application/x-www-form-urlencoded`;
  - answer discovery, registration and token calls within 10 s, and refresh
    calls within 30 s.
- **Audience.** Accept the canonical form of the URL when checking `aud`
  (lowercase host, no trailing slash, no default port)
  ([troubleshooting](https://claude.com/docs/connectors/building/troubleshooting)).

ChatGPT recommends CIMD, with `none` or `private_key_jwt`, and still supports
DCR "when configured"
([OpenAI MCP](https://developers.openai.com/api/docs/mcp)).

### 3.3 What trainm8 would build

**Endpoints:** `/.well-known/oauth-protected-resource/mcp` (PRM);
`/.well-known/oauth-authorization-server`; `/oauth/authorize`, a **consent
page** on top of the existing cookie login (`getUserId` / `requireUserId`,
`app/utils/auth.server.ts:29-68`), so passkey, TOTP and GitHub sign-in keep
working; `/oauth/token`; `/oauth/register` (DCR, because Claude falls back to
it); an SSRF-hardened, cached CIMD fetcher; revocation.

**Storage** (none exists; `prisma/schema.prisma` has no OAuth-server or audit
models — `Connection` and `AccountConnection` hold only GitHub login identities
and outbound provider tokens): OAuth clients, consent grants, authorization
codes, hashed access and refresh tokens with their rotation family.
**Settings:** a "connected assistants" page that lists grants and revokes them.

**Three ways to get an authorization server:**

| Option                                                                     | For                                                                                                                                                                                                                                                                                                         | Against                                                                                                                                                                                                    |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. In-app AS on a certified library** such as `panva/node-oidc-provider` | It reuses trainm8's login and sessions, so there is one user identity. The library lists RFC 7591, 7636, 8414, **8707**, **9207** and 9068, with CIMD as experimental ([README](https://github.com/panva/node-oidc-provider)). MIT-licensed and actively released (`oidc-provider` 9.12.2, 2026-09-05, npm) | trainm8 then operates an AS: key rotation, token storage and a consent UI. CIMD support is experimental (Draft 02). It is built on Koa, but the README documents mounting it into an existing Express app. |
| **B. Hosted identity provider** (the SDK's recommendation)                 | "Use a dedicated identity provider for new servers" ([SDK authorization](https://ts.sdk.modelcontextprotocol.io/v2/serving/authorization.html))                                                                                                                                                             | trainm8's users live in its own `User` table. The provider must federate to trainm8's login, or users get a second account. It is a new vendor in the auth path.                                           |
| **C. v1 `mcpAuthRouter` / `ProxyOAuthServerProvider`**                     | Already in npm                                                                                                                                                                                                                                                                                              | "frozen in `@modelcontextprotocol/server-legacy/auth`" (same page). Do not build on it.                                                                                                                    |

**Recommendation: option A.** The consent page is just another Epic Stack route
behind `requireUserId`. The library carries the RFC surface. Decide in an ADR
(proposed **0094**, §8.4).

### 3.4 Scopes and per-user isolation

| Scope              | Grants                                                                                    | Exposed tools (§7)                                                   |
| ------------------ | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `training:read`    | Reads of the athlete's plan, sessions and load, through the Strava gate (§6.1)            | All `get_*` / `list_*`, plus `preview_season`                        |
| `training:propose` | Creating **pending** Week Replan Proposals. They never apply without the athlete          | `propose_week_change`                                                |
| `training:log`     | Recording the athlete's own acts: write a session, mark it _Gjort_, log sets, plus `undo` | `write_session`, `mark_session_done`, `log_strength_session`, `undo` |

**Choosing scopes.**

- Put only `training:read` in `scopes_supported`. Step up to the others with
  `403 insufficient_scope`. That is the least-privilege pattern the security
  guide recommends
  ([scope minimization](https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices#scope-minimization)).
- v2 supports per-tool step-up with `scopeChallenge: requireScopes(…)`
  ([SDK authorization](https://ts.sdk.modelcontextprotocol.io/v2/serving/authorization.html)).
- There is **no delete scope and no coach scope**. GOAL.md's non-goal ("No
  coach- or team-managed workflows") means a token is always one athlete acting
  for themselves.

**Isolation.**

- **The `userId` comes only from the verified token's subject.** No tool takes
  an `athleteId` argument.
- **The repo already scopes every read and write by owner.** For example,
  `getSessionByIdForUser(userId, id)` (`app/utils/training.server.ts:1833`),
  `deleteWorkoutSession(userId, sessionId)` (`app/utils/workout.server.ts:431`)
  and `answerProposal(userId, proposalId, …)`
  (`app/utils/load/week-replan-answers.server.ts:61`). The registry (§8) makes
  `userId` a required context field, never an input.
- **Handles are bound to their user.** "MCP servers **MUST NOT** treat
  possession of a state handle as authentication". Key stored state by
  `<user_id>:<handle>`
  ([state handle hijacking](https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices#state-handle-hijacking)).

---

## 4. The clients that would consume it

### 4.1 Feature support

| Client                                                                                                                  | Tools | Resources                                      | Prompts        | Elicitation                   | Sampling                               | MCP Apps (UI)                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------- | ----- | ---------------------------------------------- | -------------- | ----------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **claude.ai, Desktop, mobile, Cowork** ([build](https://claude.com/docs/connectors/building))                           | Yes   | Yes, text and binary                           | Yes            | Not documented (_unverified_) | **No**; resource subscriptions also no | Yes. Mobile uses a native WebView ([design](https://claude.com/docs/connectors/building/mcp-apps/design-guidelines#mobile-guidelines)) |
| **Messages API MCP connector** ([docs](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector#limitations)) | Yes   | No ("only tool calls are currently supported") | No             | No                            | No                                     | No                                                                                                                                     |
| **ChatGPT**, developer mode / plugins ([OpenAI](https://developers.openai.com/api/docs/guides/custom-mcp-server))       | Yes   | `ui://` templates for UI                       | Not documented | Not documented                | Not documented                         | Yes. The MCP Apps standard is recommended ([ChatGPT UI](https://developers.openai.com/plugins/build/chatgpt-ui))                       |
| **VS Code Copilot, Cursor, Goose, M365 Copilot** ([matrix](https://modelcontextprotocol.io/extensions/client-matrix))   | Yes   | Not checked                                    | Not checked    | Not checked                   | Not checked                            | Yes, per the community matrix                                                                                                          |

### 4.2 How each client connects

| Client                 | Who can add it                                                                                                                                                                                                                                                                                                        | Authentication                                                                                                                                                  | How write tools are confirmed                                                                                                                                                                                                                | Limits                                                                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude hosted apps     | Free (**one** custom connector), Pro, Max, Team and Enterprise (an Owner adds it) ([add-unlisted](https://claude.com/docs/connectors/custom/add-unlisted)). Mobile only shows connectors added on web or desktop ([design](https://claude.com/docs/connectors/building/mcp-apps/design-guidelines#mobile-guidelines)) | OAuth with DCR or CIMD by default. Static headers are in beta for a limited set of organizations                                                                | "Read-only tools can run without per-call confirmation, and destructive tools always prompt" ([review criteria](https://claude.com/docs/connectors/building/review-criteria#provide-tool-annotations)). A user can mark any tool **Blocked** | ~150,000 characters per result; 240 s per call ([build](https://claude.com/docs/connectors/building#design-within-the-size-and-timeout-limits)) |
| Claude Code            | The developer, from the CLI                                                                                                                                                                                                                                                                                           | Its own CIMD, with a loopback redirect                                                                                                                          | Not covered here                                                                                                                                                                                                                             | 25,000 tokens, configurable with `MAX_MCP_OUTPUT_TOKENS`                                                                                        |
| Messages API connector | API key holder; beta header `mcp-client-2025-11-20`, or `mcp-client-2026-09-15` to pin tool lists                                                                                                                                                                                                                     | The caller obtains the OAuth token and passes `authorization_token` ([auth](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector#authentication)) | None in the API. Denylisting write tools is recommended "when you want a human confirmation step before state changes"                                                                                                                       | Beta; **not ZDR-eligible**; calls come from Anthropic's infrastructure                                                                          |
| ChatGPT                | _Unverified_: the help article answers HTTP 403 (§10.4)                                                                                                                                                                                                                                                               | OAuth (CIMD recommended, DCR supported) or none                                                                                                                 | "Write actions by default require confirmation". Tools without `readOnlyHint` "are treated as write actions"                                                                                                                                 | "Use ChatGPT on the web" is the only route the guide describes                                                                                  |

### 4.3 What the client matrix means for trainm8

- **Design for tools first.** Tools are the only primitive every row supports.
  Prompts and resources are extras for Claude.
- **Do not depend on elicitation.** Neither Claude's nor OpenAI's docs say it is
  supported (§6.6).
- **Claude Code is the cheapest Phase 0 test client**, with MCP Inspector: it is
  a native OAuth client with a loopback redirect. (Whether it can send a static
  dev bearer header was not checked for this note.)
- **The Messages API connector is a poor fit for trainm8's own agent.** It
  supports tools only, has no approval step and is not ZDR-eligible (§8).

---

## 5. Interactive UI over MCP: MCP Apps

### 5.1 The spec

**MCP Apps is an official extension**, identifier `io.modelcontextprotocol/ui`.
Its status is **"Stable (2026-01-26)"** (SEP-1865,
[spec](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx);
[overview](https://modelcontextprotocol.io/extensions/apps/overview)).

**Mechanics.** A tool declares `_meta.ui.resourceUri` pointing to a `ui://`
resource of MIME type `text/html;profile=mcp-app`. The host renders it in a
sandboxed iframe (on Claude mobile, a native WebView), and the view talks to the
host over postMessage JSON-RPC: `tools/call`, `ui/message`,
`ui/update-model-context`, `ui/open-link`. `_meta.ui.visibility` defaults to
`["model","app"]`; a tool without `"model"` is **app-only** — hosts "MUST NOT
include" it "in the agent's tool list" and reject app calls to tools without
`"app"`. Servers "SHOULD provide text-only fallback behavior".

**Who renders it:** Claude (web, Desktop, mobile), ChatGPT, VS Code Copilot,
Cursor, Goose and others
([matrix](https://modelcontextprotocol.io/extensions/client-matrix)). **Claude**
requires `ui.domain` = first 32 hex characters of SHA-256(server URL) +
`.claudemcpcontent.com`
([getting started](https://claude.com/docs/connectors/building/mcp-apps/getting-started#set-uidomain-for-claude)).
**ChatGPT** now treats `window.openai` and `openai/outputTemplate` as
compatibility aliases and recommends the standard
([ChatGPT UI](https://developers.openai.com/plugins/build/chatgpt-ui)).

**MCP-UI** (`@mcp-ui/client`) is now a **host-side** renderer for MCP Apps views
([overview](https://modelcontextprotocol.io/extensions/apps/overview)). trainm8,
as a server, does not need it.

### 5.2 Can trainm8 render a week-plan preview with Accept and Reject? Yes, with care

Claude's design guidelines describe the fit: an inline card holds "at most 2
actions" and "at most 4-5 data points", and "Confirming or executing a prepared
action" belongs in the app while free-text refinement belongs in chat
([design guidelines](https://claude.com/docs/connectors/building/mcp-apps/design-guidelines#decide-between-app-and-chat-interactions)).

**The design** is a `ui://trainm8/forslag.html` card with one row per proposal —
headline, reason, _din økt_ marker, **Ok / Nei takk** — whose buttons call an
**app-only** `answer_proposal` tool. That is the cleanest way to keep ADR 0080
§3's "explicit yes" a human act: the model never sees the tool; the athlete taps
it.

**Three caveats:**

1. **Only hosts that negotiate the extension enforce app-only visibility.**
   Register `answer_proposal` only when the request declares
   `io.modelcontextprotocol/ui` (the spec tells servers to check UI capability
   before registering UI tools), and fall back to a deep link into I dag's Week
   Change Card. _Unverified:_ whether 2026-07-28's "MUST NOT vary
   per-connection" permits varying `tools/list` by declared capabilities rather
   than by authorization.
2. **The visual system changes.** Claude asks apps to use host style variables
   and "never hardcode colors"; ADR 0085's shadcn base-luma tokens do not apply
   inside the widget.
3. **Mobile constraints apply** (same guidelines): capped inline height,
   vertical pans go to the conversation, 44 pt tap targets, nothing interactive
   outside `safeAreaInsets` — trainm8's own `mobile-native` rules, inside
   someone else's app.

---

## 6. Safety design for trainm8

### 6.1 The Strava gate: a new reason for an Unavailable Metric

**What the terms say, verbatim.** Read on 2026-10-11: the
[API Policy](https://www.strava.com/legal/api_policy) and the
[API Agreement](https://www.strava.com/legal/api), both "Effective Date: June 1,
2026". The Policy "is incorporated by reference into, and forms part of" the
Agreement (Policy §1). The
[Brand Guidelines](https://developers.strava.com/guidelines/) (last revised
2025-09-29) say nothing about AI.

- **Policy §5.16** ("No Abstraction Layers, Pass-Through Proxies, or
  Unauthorized Agent Interfaces"): "You may not, and may not authorize any third
  party to: … (b) operate any MCP Server, agent-mediated interface, or analogous
  mechanism that exposes the Strava API Materials, Strava Data, or any subset
  thereof; … The Strava MCP is the sole authorized first-party agent-mediated
  interface to the Strava Platform. The restrictions in this Section apply to
  any successor or analogous protocol or technology that performs a function
  comparable to an MCP Server, regardless of name."
- **Policy §5.3** ("No AI/ML Training, Fine-Tuning, Grounding, Evaluation,
  Embedding, or Retrieval-Augmented Generation"): "You may not use the Strava
  API Materials or Strava Data, directly or indirectly, in connection with the
  development, training, evaluation, or operation of any AI Application. This
  prohibition extends to: Any data derived from, aggregated from, anonymized
  from, or generated using Strava Data, in any form (including original,
  derivative, aggregated, anonymized, de-identified, or model-output form); and
  Any of the following activities with respect to an AI Application: training,
  pre-training, post-training, fine-tuning, reinforcement learning, alignment,
  grounding, evaluation, benchmarking, embedding generation, retrieval-augmented
  generation, ingestion into a context window or working memory, and any other
  activity intended or reasonably likely to develop, improve, evaluate, or
  operate an AI Application. This prohibition does not extend to use of the
  Strava MCP, as discussed above in Section 3.5."
- **Policy §5.10:** "You may not transfer or disclose Strava Data — including
  publicly viewable Strava Data — to any third party, except as expressly
  permitted by this Agreement and your then-current privacy policy and in full
  compliance with applicable law (including Section 28 of the GDPR and Section
  28 of the UK GDPR). You may not, directly or indirectly, disclose, market,
  sell, license, lease, or make available in exchange for monetary or other
  valuable consideration, any Strava Data to any third party — including
  advertisers, data brokers, AI Application providers, or model developers —
  even if a user of your Developer Application consents." Whether "in exchange
  for … consideration" also qualifies "disclose" is ambiguous; §5.3 has no
  consent exception either way.
- **Policy §3.5:** "Subscribers to Strava may access the Strava MCP in
  connection with their personal use of their own Strava data … and may bring
  their own AI Application to interact with their own data through the Strava
  MCP. The Strava MCP is not authorized for, and may not be used to enable, any
  commercial or third-party access to the Strava API Materials or Strava Data
  outside the developer's own personal use."
- **Policy §6.2:** "You may not retain Strava Data in your cache for longer than
  seven (7) days. … Except for such limited caching, you may not store Strava
  Data, or provide or display Strava Data or any associated service, to any
  third party other than the Strava user using your Developer Application."
- **Policy §5.5:** "You may not store Strava Data, or any data derived from
  Strava Data, in any Persistent Index. The foregoing prohibits indefinite
  storage in vector stores, embedding stores, search indexes, knowledge graphs,
  retrieval-augmented data stores, archives, and any other storage configured to
  enable subsequent retrieval, query, or use."
- **Policy §5.4** (on analytics): "You may not combine Strava Data with other
  customer data for these or any other purposes. The restrictions in this
  Section 5.4 apply to data derived from Strava Data and to output that
  incorporates or was generated using Strava Data."
- **Policy §6.6:** "Each Strava user has the right to access and export the
  user's own Strava data, free of charge, through the Bulk Data Export Tool …
  Nothing in this Agreement is intended to limit or condition that user-facing
  right."
- **Agreement §2.3(i):** "'Strava Data' means all data you access or collect
  from the Strava API Materials, including without limitation Strava user
  personal and activity data and Strava segment and leaderboard data".

"AI Application" and "Persistent Index" are capitalised but defined in neither
document. "AI Application" appears only in Policy §3.5, §5.3 and §5.10.

**What Strava's terms permit** (a reading, not legal advice):

| Case                                                                                                                          | Permitted?                                    | Why                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| An MCP tool returns what came from the Strava API: duration, HR, power, streams, activity name                                | **No**                                        | §5.16(b): "Strava Data, or any subset thereof"                                                                                                                                                                                   |
| An MCP tool returns what trainm8 computed from Strava-sourced data: TSS, CTL/ATL/TSB, adherence, detection                    | **No**                                        | §5.16(b) names only Strava Data and its subsets, but §5.3 adds "data derived from … Strava Data, in any form" and "ingestion into a context window", and every MCP client is an AI Application                                   |
| The same, with the athlete's explicit consent                                                                                 | **No**                                        | §5.10: "even if a user … consents"; §5.3 has no consent exception                                                                                                                                                                |
| An in-app agent: trainm8 sends Strava-derived data to an LLM it calls itself                                                  | **No**                                        | §5.3 "operation of any AI Application"; §5.10 names "AI Application providers"                                                                                                                                                   |
| Plan data the athlete wrote, or trainm8 placed from stock rows, with no actual as an input                                    | Yes                                           | Not Strava Data; nothing derived                                                                                                                                                                                                 |
| Plan data the rules computed from Strava-sourced actuals (Week Replan proposals and reasons, the First Run's starting volume) | Unclear; treat as no                          | §5.3 "generated using Strava Data"                                                                                                                                                                                               |
| A file the athlete uploads (FIT/GPX), including one from their own Strava bulk export                                         | Not restricted by Strava's API terms          | Strava Data is defined by API origin (§2.3(i)); §6.6 protects the user's export. Untested against Strava's intent; an upload that duplicates a Strava API import is still that import                                            |
| The athlete connects Strava's own MCP to Claude beside trainm8's                                                              | Yes, for Strava subscribers, for personal use | §3.5. trainm8 itself may not use the Strava MCP ("commercial or third-party access")                                                                                                                                             |
| Deterministic trainm8: import, compute, show the athlete their own data                                                       | Yes, within §6.2, §6.4 and §5.5               | The AI and MCP clauses do not apply. §6.2's seven-day cache does, and §5.4's "combine" sentence, read literally, reaches further than its analytics heading                                                                      |
| Intervals.icu imports                                                                                                         | Yes                                           | Its [API Terms](https://forum.intervals.icu/t/intervals-icu-api-terms-and-conditions/114087) (effective 2025-10-23) have no AI or MCP clause; §1.1 asks for Garmin attribution. Its API returns no Strava-sourced activities     |
| Garmin, if integrated directly (planned)                                                                                      | Ask Garmin first                              | The public Garmin Connect Developer Program Agreement has no AI ban, but §5.2(o) forbids an API that provides "End User Data to third-party … platforms, services, or products that have not been approved by Garmin in writing" |

**Verdict.** For an MCP server and for an in-app agent, the constraint binds on
every Strava-sourced byte and everything computed from one. For a deterministic
trainm8 the AI clauses fall away, but §6.2 still binds (below).

**Conservative reading:** nothing trainm8 received from Strava, and nothing
computed from it, may reach any model, whether through MCP or through a future
in-app agent.

**What this means per reading.** The provenance is already in the schema:
`ActivityImport.externalProvider` (`prisma/schema.prisma:1625`).

| Reading                                                                                                                                                                                                                                                                                                                                                   | Strava-derived when                                                                                                                                                                              | Over MCP                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Plan side the athlete wrote or trainm8 placed from stock rows: sessions as prescribed, Planned TSS, events                                                                                                                                                                                                                                                | Never                                                                                                                                                                                            | Available                                                                                                                        |
| Plan side the rules computed from actuals: Week Replan proposals and their reasons (`decideWeekReplan` reads Weekly Plan Adherence and TSB, `app/utils/load/week-replan.ts:250`, and the reason prints the TSB); the First Run's anchors and Weekly Capacity (`readAnchorContext` sums completed sessions, `app/utils/plan-outline/history.server.ts:59`) | When a Strava-derived actual was an input                                                                                                                                                        | Proposal reasons and inputs Unavailable. Whether a season shaped by such inputs stays "derived" is a question for Strava (§10.1) |
| A session's actual: duration, distance, HR, power, TSS, stream, detection, Structure Adherence                                                                                                                                                                                                                                                            | Its Recording's import has `externalProvider = 'strava'`                                                                                                                                         | **Unavailable**, reason `source-terms`                                                                                           |
| CTL, ATL and TSB; Weekly Plan Adherence                                                                                                                                                                                                                                                                                                                   | Any Strava-derived TSS in the window. Note that CTL is an EWMA, so the window is in practice ~3τ ≈ 126 days ([load model](training-load-and-fitness-model.md))                                   | Unavailable while a Strava-derived input is in the window. A Strava-free recompute is possible, but it is not built              |
| Strength set logs, _Gjort_ by hand, file uploads, RPE and the Session Log                                                                                                                                                                                                                                                                                 | Never (athlete-entered or file-sourced)                                                                                                                                                          | Available                                                                                                                        |
| Intervals.icu imports                                                                                                                                                                                                                                                                                                                                     | Never: Intervals.icu's API does not supply Strava-sourced activities ("Intervals.icu cannot supply Strava activities via the API", its developer, [forum](https://forum.intervals.icu/t/113828)) | Available, with Garmin attribution where the data is Garmin-sourced (Intervals.icu API Terms §1.1)                               |
| A direct Garmin integration (planned)                                                                                                                                                                                                                                                                                                                     | Never                                                                                                                                                                                            | Hold until Garmin approves (Garmin agreement §5.2(o), table above)                                                               |

**This is the building principle working, not a workaround.** "Strava's terms
don't let trainm8 send this to an assistant" is a truthful reason for an absent
number, in the same family as "no threshold set".

> **Out of scope but urgent: §6.2 binds trainm8 today, with or without AI.**
> Strava's §6.2 caps cached Strava Data at **seven days**. Meanwhile
> `ActivityImport.rawJson` keeps the "full provider payload, verbatim"
> (`prisma/schema.prisma:1645`) with no time limit (a row goes only on
> disconnect, `app/utils/account-connection.server.ts:168`, or a source-side
> delete of an auto-save mirror, `app/utils/activity-import.server.ts:222`), and
> CTL wants ~126 days of TSS. §6.2 names Strava Data, not derived data, so a
> computed TSS is arguably outside it; but §5.5 bars derived data from any
> "Persistent Index", a term the documents never define. This concerns the
> Strava integration that ships today, not MCP: it needs its own decision
> whether or not anything in this note is built.

### 6.2 ADR 0080: the model is a proposal author, never the yes

**The mapping is nearly one-to-one.** ADR 0080 §6: "AI later writes the same
proposals on the same surface … Only the author of step 1 changes, not the rules
in steps 2–5." What already exists:

- **The store accepts a proposal with no closed week.**
  `recordProposals(tx, userId, drafts, weekReplanId = null)`
  (`app/utils/load/week-replan-proposals.server.ts:73`). The column is nullable
  "for a change the athlete asked for themselves"
  (`prisma/schema.prisma:1878-1881`).
- **Such a proposal is never applied by silence**, because the only caller
  passes the claimed week ids (`app/utils/load/week-change.server.ts:159`).
- **There is a latent trap.** Called _without_ `weekReplanIds`,
  `applyDueProposals` takes every pending proposal
  (`week-replan-proposals.server.ts:114-130`). The amendment should store an
  `author` (`rules` | `athlete` | `assistant`) and make "silence never applies
  an assistant proposal" a rule of the data, not of a call site.
- **The model cannot set load direction.** `loadDirectionOf` reads it off the
  payload (`app/utils/load/week-replan-proposal.ts:147`).
- **The model cannot invent a session.** An `add` names an existing `workoutId`
  (`week-replan-proposal.ts`, `AddPayload`). Restrict assistant `add`s to Stock
  Workouts and the athlete's own workouts, on ADR 0053 §4's non-vouch. That also
  keeps other athletes' text out of the loop (§6.7).
- **The reason is prose and must be labelled.** `reason` is "The only prose
  field: why the app proposes this, in plain Norwegian" (`schema.prisma:1854`).
  An assistant's reason must render as written by the assistant, not in the
  app's voice. It must be length-capped, rendered as plain text, and stored with
  its author.
- **The yes stays human.** For the athlete's own sessions, "only an explicit yes
  applies" (ADR 0080 §3). Claude's tool-approval click does **not** count as
  that yes:
  - it approves a call, not a specific change to a specific session;
  - "Always allow" exists;
  - hosts treat annotations as untrusted.

  So the yes happens on I dag's Week Change Card, or in the app-only widget
  button (§5.2).

### 6.3 ADR 0053: preview is a read, approval regenerates

`previewSeason` writes nothing; ADR 0053 §8 says "The loader previews and writes
nothing" (`app/utils/plan-generation/generate.server.ts:402`). It is a safe
`training:read` tool.

`approveSeason` (`generate.server.ts:482`) stays in trainm8. ADR 0053 §2 already
says why: approval regenerates server-side from the answers, so "An athlete
cannot approve a season the app never produced". If approval ever crosses MCP,
its input is the **answers**, never a model-posted payload.

MCP adds **no model to trainm8's request path**. The model belongs to the
athlete's assistant. ADR 0053's synchronous seam and "no key and no model
latency" ([ADR 0016](../adr/0016-ai-plan-generation.md) note) survive Phases 0–2
intact.

### 6.4 ADR 0088: every direct write returns an undo handle

**Direct writes are the athlete's own acts**, which need no proposal:

- writing a session (`writeSessionOnDay`, `app/utils/day-stamp.server.ts:112`);
- marking one _Gjort_ (`markSessionDone`, `app/utils/workout.server.ts:550`);
- logging sets (`logStrengthSession`,
  `app/utils/strength-quick-log.server.ts:138`).

Each already has an undo function:

- `undoDayStamp` (`day-stamp.server.ts:155`): ADR 0076 §2's owner-scoped delete,
  idempotent per §3;
- `undoMarkSessionDone` (`workout.server.ts:646`);
- `undoQuickLog` (`strength-quick-log.server.ts:253`).

**Three changes for MCP:**

1. **Make the handle opaque.** `MarkDoneUndoToken` (`workout.server.ts:484-489`)
   carries the prior status and stamp, and the browser posts them back. Over MCP
   that state goes in an `UndoHandle` row (random id, `userId`, kind, payload,
   `expiresAt`), and the tool returns only the id. This follows the spec's
   handle guidance ("a name, not a capability") and the MRTR rule that state
   passing through a client is "attacker-controlled input"
   ([MRTR](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/mrtr#server-requirements-basic-workflow)).
2. **State the window.** ADR 0088 §2's ten seconds is a UI bound; a conversation
   has no toast. The tool description must state the handle's lifetime
   ([stateful tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools#stateful-tools)).
   The existing refusals carry over unchanged:
   - `not-undoable` once something has landed on top;
   - no undo when `recomputeRewroteSince` (`workout.server.ts:516`) shows that
     the recompute rewrote another session.
3. **Return what the toast says.** `withWeekSumToast`
   (`app/utils/writing-line.server.ts:75`) computes the week's sum before and
   after. Return it in `structuredContent`, so the assistant can say what
   changed against the Week Target, as ADR 0088 §1's toast does.

### 6.5 The building principle as an output schema

Every metric field is a discriminated union. `0` and an omitted field are never
allowed to mean "unknown":

```ts
// sketch — one shape for every number crossing MCP
const Reading = <T extends z.ZodTypeAny>(value: T) =>
	z.discriminatedUnion('status', [
		z.object({
			status: z.literal('available'),
			value,
			basis: z.string(),
			confidence: Confidence.nullable(),
		}),
		z.object({ status: z.literal('unavailable'), reason: UnavailableReason }),
	])
// UnavailableReason: 'no-threshold' | 'no-recording' | 'building-baseline'
//   | 'no-planned-load' | 'strength-has-no-tss' | 'source-terms' | …
```

**The repo already returns honest nulls, but in four different vocabularies:**

- `ReviewMetric` keeps `planned`/`actual` as `null`
  (`app/utils/session-review.ts:12-24`);
- `TsbTrust` says "building baseline" (`app/utils/load/trustworthiness.ts:12`);
- `UNAVAILABLE_READINGS` (`app/utils/plan-outline/unavailable-readings.ts:49`);
- free-text reasons such as "X is not configured", formatted by
  `nbUnavailableReason` (`app/utils/labels.ts:6190`).

The registry needs **one** `UnavailableReason` enum. That is ADR material (§8).

### 6.6 Elicitation: not the confirmation mechanism, for now

Elicitation looks like a confirmation dialog, but three reasons keep it out of
v1:

- **Neither host documents it.** Claude's connector docs list what Claude
  supports and do not mention elicitation (_unverified_ either way). OpenAI's
  guides do not mention it either.
- **The SDK has two code paths.** On 2026-07-28 connections,
  `ctx.mcpReq.elicitInput` "throws" and the handler must return an
  input-required result instead
  ([SDK elicitation](https://ts.sdk.modelcontextprotocol.io/v2/servers/elicitation.html)).
- **It needs integrity protection.** Under MRTR, `requestState` must be HMAC- or
  AEAD-protected and bound to the principal, request and TTL.

The spec's own security rules point at proposals anyway: "Servers **MUST** bind
elicitation requests to the client and user identity"
([elicitation security](https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation#security-considerations)).

**Decision for v1:** honest annotations for the host's own prompt, plus
proposals for anything that touches the athlete's sessions. Revisit when Claude
documents elicitation.

### 6.7 Prompt injection: whose text reaches the model

Tool outputs are model input. The spec makes `Sanitize tool outputs` a server
**MUST**
([tools security](https://modelcontextprotocol.io/specification/2026-07-28/server/tools#security-considerations)).
Claude's directory also rejects tool _descriptions_ that "Direct Claude to pull
behavioral instructions from external sources"
([review criteria](https://claude.com/docs/connectors/building/review-criteria#avoid-prompt-injection-patterns)).

trainm8's free-text sources, by trust:

| Source                                                                                                                                                                            | Author                                   | Rule                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Shared Workouts**: `Workout.title`/`description` from the community tier (ADR 0052)                                                                                             | **Another athlete**                      | Never returned by default tools. If the Catalogue is ever exposed: stock rows only, titles length-capped, descriptions omitted. This is the only cross-user vector |
| `ActivityImport.rawJson`, which includes the Strava activity `name` (`app/integrations/strava/types.ts:54`) and upload `fileName` (`app/utils/activity-file-ingest.server.ts:95`) | Provider or file                         | **Never** exposed. It is also Strava Data (§6.1)                                                                                                                   |
| `SessionLog.content`, `Event` names, own workout titles, athlete-created exercises                                                                                                | The athlete                              | Returned in a dedicated `athleteText` field, length-capped, never concatenated into instructions                                                                   |
| Assistant-written proposal `reason`s (§6.2)                                                                                                                                       | A model                                  | Stored with its author, and shown as assistant text when read back                                                                                                 |
| Seeded exercise names, Stock Workout citations                                                                                                                                    | Third-party corpora, reviewed into seeds | Low risk                                                                                                                                                           |

**The real mitigation is structural.** No write reachable by the model changes
the athlete's sessions without their yes (§6.2). A successful injection can at
worst create a pending proposal, or an undoable entry of the athlete's own kind.

### 6.8 Rate limiting

The spec makes rate-limiting a server **MUST** ("Rate limit tool invocations",
same section). Apply it in three places:

- **Exempt `/mcp` from the IP limiter.** Exempt it from
  `server/index.ts:130-156`, then limit after auth, keyed by token subject.
  Anthropic's whole egress is `160.79.104.0/21`.
- **Add budgets per scope.** Writes get a far lower limit than reads, and
  `propose_week_change` is capped per week.
- **Charge the OAuth endpoints too.** Add `/oauth/` to the `strongPaths` list
  (`server/index.ts:131-141`) so its POSTs get the existing `strongestRateLimit`
  (10 per minute).

### 6.9 Audit log

No audit model exists (`prisma/schema.prisma`). Add `McpAuditEvent` with:

- `userId`, OAuth `clientId` and `clientName`;
- tool name and scope;
- input digest, outcome, and the ids of the proposal or undo handle created;
- latency.

The spec asks clients to "Log tool usage for audit purposes". trainm8 should
keep its own record, because the athlete will ask "what did Claude change?". The
connected-assistants settings page (§3.3) can show the last 30 days.

---

## 7. A concrete trainm8 MCP surface

**All tools set:** `openWorldHint: false`, an `outputSchema` built from §6.5,
`title`s for Claude review, and snake_case names under 64 characters
([review criteria](https://claude.com/docs/connectors/building/review-criteria#keep-tool-names-short)).

**Abbreviations:** R = read, P = propose, W = write.

| Name                   | Kind | Annotations                           | Wraps (file:line)                                                                                                                                                                                                                                                                                                                                                                  | Confirmation                                                                  |
| ---------------------- | ---- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `get_today`            | R    | readOnly                              | The home loader's composition (`app/routes/_home/index.tsx:86-198`): `getSessionLedger` (`training.server.ts:1560`), `getCurrentLoad` / `getTsbTrust` (`load/snapshot.server.ts:440/393`), `readWeekChange` (`load/week-change-card.server.ts:68`), the nudge `buildSessionNudge` (**in a route module**: `app/routes/_home/presenter.ts:288`)                                     | None                                                                          |
| `list_sessions`        | R    | readOnly                              | `getLedgerWeek` / `getSessionLedger` (`training.server.ts:1585/1560`). Paginated: Claude caps results at ~150k characters                                                                                                                                                                                                                                                          | None                                                                          |
| `get_session`          | R    | readOnly                              | `getSessionByIdForUser` (`training.server.ts:1833`), through the Strava gate                                                                                                                                                                                                                                                                                                       | None                                                                          |
| `get_session_vs_plan`  | R    | readOnly                              | `buildReviewComparison` (`session-review.ts:43`), `structureAdherence` / `describeStructureAdherence` (`structure-adherence.ts:238/292`), `buildVsLastComparison` (`session-comparison.ts:45`) and `getLastSimilarSession` (`training.server.ts:1974`). The two middle ones run in the **route component today** (`training/sessions.$sessionId.tsx:1492,1735`) and must be lifted | None                                                                          |
| `get_training_load`    | R    | readOnly                              | `getLoadSnapshots` (`load/snapshot.server.ts:343`), `getWeeklyAdherence` (`training.server.ts:1608`), `getRecentWeeklyBuild` (`:1683`), `projectFitnessToRace` (`load/fitness-projection.ts:61`)                                                                                                                                                                                   | None                                                                          |
| `get_season`           | R    | readOnly                              | `getActivePlan` / `getActiveSeason` (`training.server.ts:220/785`), `getWeekVolumes` (`plan-outline/week-volumes.server.ts:22`)                                                                                                                                                                                                                                                    | None                                                                          |
| `get_week_change`      | R    | readOnly                              | `readWeekChange` plus the card model `buildWeekChangeCard` (`app/routes/_home/timeline/week-change.ts:169`, a route module)                                                                                                                                                                                                                                                        | None                                                                          |
| `list_events`          | R    | readOnly                              | `getEventsForUser` (`event.server.ts:98`)                                                                                                                                                                                                                                                                                                                                          | None                                                                          |
| `get_lift_history`     | R    | readOnly                              | `getExerciseHistoryView` (`strength-records.server.ts:584`), `getStrengthLogView` (`strength-log.server.ts:262`)                                                                                                                                                                                                                                                                   | None                                                                          |
| `preview_season`       | R    | readOnly                              | `previewSeason` (`plan-generation/generate.server.ts:402`). It writes nothing (ADR 0053 §8)                                                                                                                                                                                                                                                                                        | None. Approval stays in trainm8                                               |
| `propose_week_change`  | P    | destructive false, idempotent false   | `ProposalPayloadSchema` (`load/week-replan-proposal.ts:118`) → `recordProposals(…, null)` (`load/week-replan-proposals.server.ts:73`), plus the `author` amendment                                                                                                                                                                                                                 | Host prompt. **Applies only on the athlete's Ok** in trainm8 or in the widget |
| `write_session`        | W    | destructive false                     | `writeSessionOnDay` (`day-stamp.server.ts:112`), `finishComposerWrite` (`:225`), `withWeekSumToast` (`writing-line.server.ts:75`)                                                                                                                                                                                                                                                  | Host prompt, plus an undo handle                                              |
| `mark_session_done`    | W    | destructive false                     | `markSessionDone` (`workout.server.ts:550`); undo with `undoMarkSessionDone` (`:646`)                                                                                                                                                                                                                                                                                              | Host prompt, plus an undo handle                                              |
| `log_strength_session` | W    | destructive false                     | `logStrengthSession` (`strength-quick-log.server.ts:138`) or `saveLoggedSet` (`strength-log.server.ts:768`); undo with `undoQuickLog` (`:253`) / `clearLoggedSet` (`:1066`)                                                                                                                                                                                                        | Host prompt, plus an undo handle                                              |
| `undo`                 | W    | **destructive true, idempotent true** | Dispatches an `UndoHandle` to the functions above (ADR 0076 §2–3)                                                                                                                                                                                                                                                                                                                  | Claude always prompts on destructive tools                                    |
| `answer_proposal`      | W    | app-only (`visibility: ["app"]`)      | `answerProposal` (`load/week-replan-answers.server.ts:61`)                                                                                                                                                                                                                                                                                                                         | **The athlete's own tap in the widget.** Invisible to the model               |

**Deliberately not exposed:** deleting a session; season edits and
`approveSeason`; threshold writes (`setDisciplineThresholds`,
`app/utils/athlete.server.ts:157`); account connections; Catalogue publishing;
answering _hva var dette?_ (`answerImportQuestion`,
`app/utils/import-link.server.ts:149`), which waits on the Strava gate.

**Resources:**

- **`trainm8://vocabulary`** (static, `cacheScope: public`): a compact glossary
  for the model. It covers Adherence Band, Week Target, Unavailable Metric and
  Session Ownership (_din økt_ / _appens økt_), drawn from `GLOSSARY.md`, so the
  model speaks trainm8's words.
- **`ui://trainm8/forslag.html`**: the proposal card (§5.2).

**Prompts** (of the clients checked, only Claude documents prompt support; they
are user-invoked):

1. **`weekly_review(week?)`.** Reads `get_week_change` and `get_training_load`
   and summarises plan against done in each track's own unit. It ends by asking
   whether to propose next week.
2. **`plan_around_trip(from, to, constraints)`.** Reads the season and the
   affected weeks, then calls `propose_week_change` with `move`/`scale`/`keep`
   proposals. Each one names whose session it is.
3. **`session_debrief(sessionId)`.** Answers "how did today's intervals compare
   to the plan?" through `get_session_vs_plan`. It quotes unavailable readings
   as reasons, never as numbers.

---

## 8. One registry, three consumers

### 8.1 The shape

```ts
// sketch — app/actions/ (one file per action, one index)
type Action<I, O> = {
	name: string
	title: string
	description: string
	kind: 'read' | 'propose' | 'write'
	scope: 'training:read' | 'training:propose' | 'training:log'
	input: z.ZodType<I>
	output: z.ZodType<O>
	annotations: {
		readOnlyHint: boolean
		destructiveHint?: boolean
		idempotentHint?: boolean
	}
	confirm: 'none' | 'host' | 'athlete' // 'athlete' = only trainm8's UI or an app-only widget
	run(
		ctx: {
			userId: string
			now: Date
			timezone: string
			caller: 'web' | 'mcp' | 'agent'
		},
		input: I,
	): Promise<O & { undo?: UndoHandleId }>
}
```

### 8.2 The three consumers

1. **Routes.** Today the writes dispatch on a form `intent` inside route
   modules:
   - home's action: `stamp-day`, `write-session`, `place-session`,
     `copy-session`, `undo-stamp` (`app/routes/_home/index.tsx:291-553`);
   - the Week Change resource route: `answer`, `accept-round`, `ease`
     (`app/routes/resources/week-change.tsx`).

   Each intent becomes `action.run` behind Conform's `parseWithZod`. The route
   keeps only the HTTP concerns: the toast, the redirect and the 400/404/409
   mapping.

2. **The MCP server.** One loop: for each action the token's scopes allow, call
   `registerTool(name, { title, description, inputSchema, outputSchema, annotations }, …)`.
   Return `structuredContent` plus its JSON text. Pass the output through the
   Strava gate (§6.1) and the injection rules (§6.7).
3. **An in-app agent.** The same registry becomes Claude tool definitions,
   **executed in-process**. The Anthropic SDK's tool runner and its
   `mcpTools(tools, mcpClient)` helpers convert MCP tools for it
   ([client-side helpers](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector#client-side-mcp-helpers)).
   `@anthropic-ai/sdk ^0.102.0` is already a dependency (`package.json:41`),
   though unused at runtime. The installed 0.102.0 ships them:
   `@anthropic-ai/sdk/helpers/beta/mcp` exports `mcpTools`
   (`node_modules/@anthropic-ai/sdk/helpers/beta/mcp.d.ts:164`). The loop itself
   is chosen in
   [`agent-layer-building-blocks.md`](agent-layer-building-blocks.md) §9.2: the
   Vercel AI SDK 7 with `@ai-sdk/anthropic`, or this SDK's manual loop as the
   fallback. Its tool results pass the same Strava gate as MCP's, because an
   in-app model is an AI Application too (§6.1).

   **Not the Messages API connector.** It would make Anthropic call trainm8's
   public `/mcp` with a token trainm8 mints for itself. It has no approval step
   and is not ZDR-eligible.

### 8.3 Where it lives

`app/actions/`, beside `app/utils/`: one `defineAction(…)` of the §8.1 shape per
file, plus an index.

**Not in `app/integrations/`.** ADR 0014 is about _outbound_ providers that
produce `ActivityImportInput`. MCP is an _inbound_ protocol surface. The MCP
adapter itself goes in `app/mcp/`: the factory, the bearer gate, the Strava gate
and the audit writer.

**The registry forces three lifts out of route modules:**

- `buildSessionNudge` (`app/routes/_home/presenter.ts:288`);
- `buildWeekChangeCard` (`app/routes/_home/timeline/week-change.ts:169`);
- the session-vs-plan computations now done in a component
  (`sessions.$sessionId.tsx:1492,1735`).

### 8.4 What an ADR would decide

Working title: _"Every athlete operation is one typed action, and the routes,
the MCP server and the agent are its three readers"_. Proposed **0092**.

1. **Inputs and context.** One Zod input and output per operation. `userId`
   comes from context, never from input.
2. **Kinds.** `read` / `propose` / `write`, and which kinds may run without the
   athlete:
   - `propose` never applies without the athlete's yes;
   - a `write` covers only the athlete's own acts and returns an undo handle.
3. **Readings.** One `Reading`/`UnavailableReason` vocabulary for every number
   (§6.5), including `source-terms`.
4. **Provenance gate.** Strava-derived data never leaves through a model-facing
   reader (§6.1).
5. **Proposal author.** An `author` column on proposals; silence never applies
   an `assistant` proposal (amends 0080).
6. **Undo handles.** Opaque, server-held, user-bound, with a stated lifetime
   (amends 0088).
7. **Language.** Data keys and enums are English. Norwegian labels stay in
   `labels.ts` (ADR 0081). An assistant's prose is stored with its author.

**Numbering across the sibling notes.** 0091 is the newest ADR in `docs/adr/`.
Items 5 and 6 amend ADRs 0080 and 0088, so they go in a companion **0093**, _"an
agent is a proposal author, never the athlete's yes"_, which
[`agent-native.md`](agent-native.md) §7.2 also proposes. The authorization
server (§3.3) is **0094**, and Phase 3's in-app agent is **0095**.

---

## 9. Phased plan

Effort figures are estimates for one developer familiar with the repo.

These are the MCP track's phases. In the overall plan
([`agent-native.md`](agent-native.md) §7.2) they follow ADRs 0092–0093 and the
registry's first slice (its Phases 0–1) and together make up its Phase 2; this
note's Phase 3 is its Phase 4. For an athlete who imports from Strava, Phase 0's
actual-side reads (`get_session_vs_plan`, `get_training_load`) come back mostly
`source-terms`; the plan-side reads are what works for everyone (§6.1).

| Phase                                             | Scope                                                                                                            | Deliverables                                                                                                                                                                                                                                                                                                                                             | Effort           | Main risk                                                                                           |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------- |
| **0. Read-only, dev token**                       | Six reads: `get_today`, `list_sessions`, `get_session`, `get_session_vs_plan`, `get_training_load`, `get_season` | `app/actions/` for those six; `app/mcp/` factory on v2 `createMcpHandler` at `/mcp`; a static per-user dev bearer token (development only), tested from MCP Inspector and Claude Code; the **Strava gate** and the `Reading` union; Host/Origin guards                                                                                                   | S–M (~1–2 weeks) | On zod 3.25's `zod/v4` fallback until zod ≥ 4.2 (§2.3); the size of the Strava gate on load metrics |
| **1. OAuth + Claude custom connector, read-only** | The same reads, from claude.ai, Desktop and mobile                                                               | In-app AS (option A): PRM, AS metadata, CIMD **and** DCR, PKCE S256, `resource` audience, rotating refresh, consent page on `requireUserId`, revocation, connected-assistants settings page; rate limit per subject; `McpAuditEvent`; `get_week_change`, `list_events`, `get_lift_history`, `preview_season`; the vocabulary resource; the three prompts | L (~2–4 weeks)   | OAuth correctness against Claude's stricter client (§3.2); the 10 s endpoint budget                 |
| **2. Proposal writes and logs with undo**         | `propose_week_change`, `write_session`, `mark_session_done`, `log_strength_session`, `undo`                      | The ADR 0080 amendment (`author`, assistant reason provenance); the `UndoHandle` model; step-up scopes; per-scope budgets; I dag shows assistant proposals as assistant-written                                                                                                                                                                          | M (~1–2 weeks)   | Proposal UX: a proposal created in chat must be findable and answerable in trainm8                  |
| **3. In-app agent; optional widget**              | The registry as in-process Claude tools; the `ui://trainm8/forslag.html` card with app-only `answer_proposal`    | ADR 0095, revisiting 0016/0053 (a model now enters the request path: key, latency, cost, data processing); host-token styling; text and deep-link fallback                                                                                                                                                                                               | L (~2–4 weeks)   | Turns "no runtime model calls" off; app-only tool listing semantics (§5.2)                          |

---

## 10. Risks and open questions

### 10.1 Legal and terms

- **Strava** (§6.1). The conservative reading removes most actual-side numbers
  for Strava users, which is the heart of "how did my intervals compare?". The
  owner should read Policy §3.5, §5.3, §5.4, §5.5, §5.10, §5.16 and §6.2 and
  decide. Asking Strava is also an option, in particular whether a plan shaped
  by Strava-derived load stays "derived" under §5.3.
- **Strava §6.2's seven-day cache** against `rawJson` kept indefinitely is a
  separate question, raised in §6.1. It binds trainm8 with or without MCP.
- **Intervals.icu** API Terms (effective 2025-10-23) have no AI or MCP clause
  and ask only for Garmin attribution. **Garmin's** public developer agreement
  has no AI ban, but §5.2(o) needs Garmin's written approval before End User
  Data reaches a third-party platform. Its China edition (2026-03) adds §15.10:
  an "AI Transparency Statement" and explicit consent before AI processing. The
  agreement a licensee actually signs sits behind Garmin's portal and was not
  read.
- **Data protection.** Training data, including heart rate, would flow to
  Anthropic or OpenAI at the athlete's request. trainm8's privacy policy and any
  GDPR assessment of health-adjacent data are not covered here.

### 10.2 Product

- **Proposals made in chat must be easy to answer.** If they land only on
  Sunday's Week Change Card, the athlete waits days. ADR 0080 has no answer
  surface for "an ad-hoc proposal on a Wednesday".
- **Language.** The athlete may talk to Claude in English, while trainm8's
  stored reasons and labels are Norwegian (ADR 0081).

### 10.3 Technical

- **Zod 3 against v2's `zod ^4.2.0`** (§2.3).
- **The size limit.** Claude caps results at ~150k characters, so lists must
  paginate. The 2026-07-28 list results also need `ttlMs`/`cacheScope`
  (SEP-2549).
- **DCR churn.** Claude "registers a new client on every fresh connection" under
  DCR. CIMD support in the AS avoids it.

### 10.4 Claims this note could not verify

- **Which MCP protocol revision** Claude's hosted client and ChatGPT speak on
  the wire. Only their _authorization_ spec citations were read.
- **Elicitation** support in claude.ai and ChatGPT. It is not documented.
- **ChatGPT plan availability** for developer mode and custom MCP. The help
  article (`help.openai.com/en/articles/12584461`) answered HTTP 403. A search
  summary said full MCP, including writes, is beta on Business, Enterprise and
  Edu, and Pro is read/fetch only. That summary was not read at its source.
- **Prompts and resources in ChatGPT.** Not documented in the pages read.
- **Whether OpenAI's "Apps SDK" was renamed to "Plugins".**
  `developers.openai.com/apps-sdk` now leads to a Plugins index, but no page
  states a rename.
- **Whether a 2026-07-28 server may vary `tools/list` by declared client
  capabilities** (§5.2). The spec allows varying by authorization; whether
  capabilities count is unclear.
- **How Strava defines "AI Application"** — the term is used in §3.5, §5.3 and
  §5.10 but defined in neither the API Policy nor the API Agreement.
- **How the LiteFS proxy routes POSTs** if the app is scaled out (§2.5), and
  whether Claude Code can send a static dev bearer header (§4.3).
- **How Claude treats non-destructive, non-read-only tools.** Only the read-only
  and destructive cases are stated.
- **Whether Claude's model sees a tool result's `_meta`.** OpenAI says `_meta`
  is "hidden from the model"
  ([OpenAI MCP server](https://developers.openai.com/plugins/build/mcp-server)).

---

## Sources

- **MCP spec 2026-07-28:**
  [versioning](https://modelcontextprotocol.io/specification/versioning) ·
  [overview](https://modelcontextprotocol.io/specification/2026-07-28) ·
  [changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
  ·
  [deprecated](https://modelcontextprotocol.io/specification/2026-07-28/deprecated)
  ·
  [versioning & compatibility](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning)
  ·
  [Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)
  ·
  [MRTR](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/mrtr)
  ·
  [tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)
  ·
  [resources](https://modelcontextprotocol.io/specification/2026-07-28/server/resources)
  ·
  [prompts](https://modelcontextprotocol.io/specification/2026-07-28/server/prompts)
  ·
  [elicitation](https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation)
  ·
  [authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
  ·
  [client registration](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration)
  ·
  [AS discovery](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/authorization-server-discovery)
  ·
  [auth security considerations](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/security-considerations)
  ·
  [security best practices](https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices)
  ·
  [schema.ts](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/schema/2026-07-28/schema.ts)
- **Earlier revisions:**
  [2025-11-25 changelog](https://modelcontextprotocol.io/specification/2025-11-25/changelog)
  ·
  [2025-06-18 changelog](https://modelcontextprotocol.io/specification/2025-06-18/changelog)
- **MCP Apps:**
  [overview](https://modelcontextprotocol.io/extensions/apps/overview) ·
  [client matrix](https://modelcontextprotocol.io/extensions/client-matrix) ·
  [spec 2026-01-26](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx)
- **TypeScript SDK:**
  [README](https://github.com/modelcontextprotocol/typescript-sdk) · v2 docs:
  [HTTP](https://ts.sdk.modelcontextprotocol.io/v2/serving/http.html) ·
  [Express](https://ts.sdk.modelcontextprotocol.io/v2/serving/express.html) ·
  [web-standard](https://ts.sdk.modelcontextprotocol.io/v2/serving/web-standard.html)
  ·
  [legacy clients](https://ts.sdk.modelcontextprotocol.io/v2/serving/legacy-clients.html)
  ·
  [authorization](https://ts.sdk.modelcontextprotocol.io/v2/serving/authorization.html)
  ·
  [sessions/state/scaling](https://ts.sdk.modelcontextprotocol.io/v2/serving/sessions-state-scaling.html)
  · [tools](https://ts.sdk.modelcontextprotocol.io/v2/servers/tools.html) ·
  [elicitation](https://ts.sdk.modelcontextprotocol.io/v2/servers/elicitation.html)
  ·
  [schema libraries](https://ts.sdk.modelcontextprotocol.io/v2/advanced/schema-libraries.html)
  ·
  [protocol versions](https://ts.sdk.modelcontextprotocol.io/v2/protocol-versions.html)
  · npm registry entries for
  `@modelcontextprotocol/{server,sdk,express,node,ext-apps}`, `@mcp-ui/server`,
  `zod`
- **Anthropic:**
  [build an MCP server](https://claude.com/docs/connectors/building) ·
  [authentication](https://claude.com/docs/connectors/building/authentication) ·
  [custom connectors](https://claude.com/docs/connectors/custom/add-unlisted) ·
  [review criteria](https://claude.com/docs/connectors/building/review-criteria)
  ·
  [troubleshooting](https://claude.com/docs/connectors/building/troubleshooting)
  ·
  [MCP Apps getting started](https://claude.com/docs/connectors/building/mcp-apps/getting-started)
  ·
  [MCP Apps design guidelines](https://claude.com/docs/connectors/building/mcp-apps/design-guidelines)
  ·
  [Messages API MCP connector](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector)
- **OpenAI:** [building MCP servers](https://developers.openai.com/api/docs/mcp)
  ·
  [add custom MCP server](https://developers.openai.com/api/docs/guides/custom-mcp-server)
  ·
  [plugins: MCP server](https://developers.openai.com/plugins/build/mcp-server)
  ·
  [plugins: ChatGPT UI](https://developers.openai.com/plugins/build/chatgpt-ui)
  ·
  [connect to ChatGPT](https://developers.openai.com/plugins/deploy/connect-chatgpt)
  ·
  [help: developer mode](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt)
  (_HTTP 403, not read_)

- **Other:** [Strava API Policy](https://www.strava.com/legal/api_policy) and
  [API Agreement](https://www.strava.com/legal/api) (both effective 2026-06-01)
  · [Strava Brand Guidelines](https://developers.strava.com/guidelines/) ·
  [Strava Terms of Service](https://www.strava.com/legal/terms) ·
  [Intervals.icu API Terms](https://forum.intervals.icu/t/intervals-icu-api-terms-and-conditions/114087)
  ·
  [Intervals.icu: Strava activities not in the API](https://forum.intervals.icu/t/113828)
  ·
  [Garmin Connect Developer Program Agreement](https://developerportal.garmin.com/sites/default/files/Garmin%20Connect%20Developer%20Program%20Agreement.pdf)
  and its
  [China edition](https://www8.garmin.com/en-US/GARMINCONNECTDEVELOPERPROGRAMAGREEMENT/GARMINCONNECTDEVELOPERPROGRAMAGREEMENT_EN.pdf)
  · [panva/node-oidc-provider](https://github.com/panva/node-oidc-provider)
- **Repo:** `GOAL.md`, `GLOSSARY.md`; ADRs 0014, 0016, 0053, 0076, 0080, 0081,
  0085, 0088; `server/index.ts`, `other/litefs.yml`, `prisma/schema.prisma`; the
  `app/utils/…` and `app/routes/…` files cited inline.

---

## ADRs this research challenges

| ADR                                                                          | What it decided                                                                                                                            | What the evidence says                                                                                                                                                                                                                                                                                                     | Verdict                          |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| **0080** Week Replan proposes; the athlete's sessions need a yes             | Proposals with reasons. Silence applies only to the machine's sessions when load keeps or drops. "AI later writes the same proposals" (§6) | The MCP write path is §6 exactly, and the store already accepts `weekReplanId = null`. It needs an `author` column, a rule that silence never applies an assistant proposal (`applyDueProposals` with no ids would do it today), labelled assistant prose in `reason`, and an answer surface for ad-hoc mid-week proposals | **Amend**                        |
| **0088** Every write on I dag is undone from its toast and its landed row    | A ten-second _Angre_ from the toast and the row; restore tokens posted back by the client                                                  | MCP has no toast. The undo must be an opaque, server-held, user-bound handle with a lifetime stated in the tool description, and it must never be a client-carried token. The refusal rules (`not-undoable`, `recomputeRewroteSince`) carry over unchanged                                                                 | **Amend**                        |
| **0076** An undone stamp leaves nothing behind                               | §2: undo is a real owner-scoped delete. §3: it is idempotent                                                                               | Maps onto `undo` with `destructiveHint: true, idempotentHint: true`. No change                                                                                                                                                                                                                                             | **Confirm**                      |
| **0053** Season generation is deterministic behind the seam                  | Preview writes nothing; approval regenerates server-side; generation places stock rows only                                                | `preview_season` is safely read-only, and an MCP approve must post answers, never a payload. §4's stock-only rule should also bound assistant `add` proposals. MCP adds no model to the request path                                                                                                                       | **Confirm**                      |
| **0016** AI plan generation (superseded, as amended by 0053)                 | A model enters only behind the seam; "no key and no model latency" today                                                                   | Phases 0–2 keep it true, because the model is the athlete's. Phase 3's in-app agent reopens it and must be its own ADR (0095)                                                                                                                                                                                              | **Confirm** (Phase 3 reopens it) |
| **0008** / GOAL.md building principle: the Unavailable Metric                | Never fabricate; degrade to an honest gap                                                                                                  | It becomes the MCP output contract: a `Reading` union in every `outputSchema`. It gains a new reason, `source-terms`, for Strava-derived data (§6.1). Today four separate vocabularies express "unavailable" and need unifying                                                                                             | **Confirm** (extend)             |
| **0014** Integrations live in per-provider folders                           | Outbound providers map to `ActivityImportInput`                                                                                            | MCP is an inbound protocol surface, not a provider. It belongs in `app/mcp/` over `app/actions/`, not in `app/integrations/`                                                                                                                                                                                               | **Confirm** (scope note)         |
| **0081** The planning redesign speaks Norwegian; `labels.ts` owns every word | Every shown word comes from `labels.ts`, in Norwegian                                                                                      | Model-facing output needs stable English enums plus optional labels, and assistant-written prose is not `labels.ts`-owned. The ADR should say which words a model may write and how they are marked                                                                                                                        | **Amend** (scope)                |
| **0085** The design system is shadcn base-luma on Base UI                    | One design system and one motion scale                                                                                                     | Inside an MCP App, Claude requires host style variables and "never hardcode colors". A widget is outside the design system by construction                                                                                                                                                                                 | **Amend** (scope)                |
| **0028** Mobile-first UI standard                                            | 390×844 first                                                                                                                              | Claude mobile renders MCP Apps in a native WebView with 44 pt targets, safe areas and capped inline height. Same standard, someone else's chrome                                                                                                                                                                           | **Confirm**                      |
| **GOAL.md** non-goal: no coach- or team-managed workflows                    | trainm8 is for the Self-Coaching Athlete                                                                                                   | Per-athlete OAuth with no delete scope and no "share" scope keeps MCP from becoming a coach backdoor. An assistant acting for the athlete is the athlete's tool                                                                                                                                                            | **Confirm**                      |
