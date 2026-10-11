# Foundations for an agent-native trainm8: platforms and sync layers

Which full-stack platform or data-sync layer could carry trainm8's agent-native
principles: one typed action for the UI, an in-app agent and MCP; live shared
state; an agent that knows the screen; previewable and undoable agent writes.
Ends with candidate stacks and a ranked recommendation that matches the
sequencing in [`stack-migration.md`](stack-migration.md).

> **Research note · 2026-10-11.** Written from **primary sources only**:
> official docs (fetched as Markdown where the site serves it), official
> repositories (`raw.githubusercontent.com`), the npm registry
> (`npm view <pkg> version time license peerDependencies dist-tags`, run
> 2026-10-11) and `api.npmjs.org`. **TM** cites this repository at `33c10f5`.
> **(inference)** marks this note's reasoning. The claims re-checked while
> promoting this note from a scratch draft, and what changed, are in §10.
>
> **Sibling documents.** [`agent-native.md`](agent-native.md) is the framework
> read from source (cited **AN §n**).
> [`agent-native-open-stack.md`](agent-native-open-stack.md) re-asks "adopt,
> fork or build" now that the stack is open, and answers the owner's question
> head-on. [`stack-migration.md`](stack-migration.md) sequences Better Auth,
> Postgres and Drizzle and owns their effort figures.
> [`agent-layer-building-blocks.md`](agent-layer-building-blocks.md) covers AI
> SDK 7, the Anthropic SDK, CopilotKit, assistant-ui, the registry sketch and
> the zod plan (cited **BB §n**).
> [`mcp-server-for-trainm8.md`](mcp-server-for-trainm8.md) covers MCP
> 2026-07-28, OAuth and the provenance gate (cited **MCP note**), and
> [`agent-layer-trainm8-surface.md`](agent-layer-trainm8-surface.md) inventories
> trainm8's write paths and safety rails. Not repeated here: the agent-loop
> libraries, the MCP protocol, the provenance gate. Every option below still
> needs that gate in its action layer, keyed on each value's origin platform
> (proposed ADRs 0096, 0098), with Strava's terms only if Strava returns; none
> supplies one
> ([MCP note §6.1](mcp-server-for-trainm8.md#61-the-strava-gate-a-new-reason-for-an-unavailable-metric)).

---

## TL;DR

1. **No platform gives all five principles.** Convex gives _live shared state_
   and _typed functions_. Cloudflare gives _per-user actors with synced state_
   and first-party _MCP OAuth_. Better Auth gives _MCP OAuth_ on any stack.
   Screen context and undo are app code everywhere, except Cloudflare's
   experimental Code Mode `revert` and agent-native's own History Kit (AN §2.5).
2. **Convex** (`convex` 1.46.0, Apache-2.0 client, FSL-1.1 backend) is the
   cleanest fit for "agent writes appear live". Its MCP server is a developer
   tool; an app-level MCP server is a community component that needs an external
   OAuth provider. Its Better Auth component peers `better-auth <1.7.0`, so the
   MCP 2026-07-28 profile is out of reach there today. EU means Ireland, at a 30
   % surcharge.
3. **The Cloudflare Agents SDK** (`agents` 0.28.0, MIT) makes each agent a
   Durable Object whose state is broadcast to every connected client.
   **`McpAgent` is deprecated and feature-frozen** (page dated 2026-07-27); new
   servers use `createMcpHandler` on MCP SDK v2. `workers-oauth-provider` 1.2.3
   targets MCP authorization 2026-07-28 with CIMD. It is the most experimental
   and most locked-in option.
4. **Mastra** (`@mastra/core` 1.75.0) is an agent _layer_, not a foundation. Its
   `MCPServer` speaks MCP 2026-07-28, but its OAuth middleware only validates
   tokens that a separate authorization server issues.
5. **Supabase** has an OAuth 2.1 server **in beta**, Realtime, and Stockholm
   (`eu-north-1`). Its docs do not mention CIMD.
6. **Better Auth 1.7** ships `@better-auth/mcp` + `@better-auth/cimd`, whose
   `metadataProfile: "mcp-2026-07-28"` pins MCP's CIMD profile. It has Prisma
   and SQLite adapters, so **the MCP-auth decision is separable from the
   database decision**.
7. **Sync engines.** Zero is GA (March 2026) but needs Postgres ≥ 15 with
   logical replication, has no SSR, and brings a second write registry. Electric
   is read-path only, which suits a trainm8-owned registry. **InstantDB is
   out**: signups are closed and its cloud shuts down on 2027-08-31. LiveStore
   and Jazz are local-first and pre-1.0.
8. **trainm8 already has the seed of live sync.** A per-athlete SSE stream
   revalidates the screen when an import lands (TM
   `app/routes/resources/imports-events.tsx:15–27`). It runs on an in-process
   emitter whose own comment names Postgres `LISTEN/NOTIFY` as the
   multi-instance swap (TM `app/utils/imports-events.server.ts:17–20`). For one
   athlete per account, that is enough for agent and MCP writes to show up, as
   long as every write emits (inference).
9. **Ranking:** **(1)** an own layer, **(2)** Convex, **(3)** Cloudflare,
   **(4)** agent-native, revisited at its 1.0.
   - **(1)'s end state** is agent-native's stack minus the framework: React
     Router 8, an EU Postgres, Drizzle, Better Auth with `@better-auth/mcp` and
     `@better-auth/cimd`, trainm8's own action registry, AI SDK 7, MCP SDK v2,
     and SSE over Postgres `NOTIFY`.
   - **Its order:** Better Auth on today's Prisma + SQLite → the MCP server →
     Postgres when a trigger fires → Drizzle after its 1.0 GA. Drizzle 1.0 is
     still an RC: npm `latest` is 0.45.4 and the `rc` tag `1.0.0-rc.4` (§8A).

---

## 0. What the foundation must carry

| Need                                                                                                                                                                            | Source                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| One `defineAction` registry feeding React Router actions, AI SDK tools and MCP tools                                                                                            | [BB §9.1](agent-layer-building-blocks.md)                                                                                                                          |
| An OAuth 2.1 authorization server for MCP: PRM, CIMD + DCR, PKCE, RFC 8707                                                                                                      | [MCP note, TL;DR](mcp-server-for-trainm8.md)                                                                                                                       |
| The agent proposes; the athlete's yes stays in trainm8 (ADR 0080); writes carry undo (ADR 0088), server-held for MCP                                                            | [MCP note §6.2–6.4](mcp-server-for-trainm8.md)                                                                                                                     |
| Values whose origin platform's terms forbid the surface (Garmin before approval, Polar without opt-in; Strava if it returns) leave model-facing surfaces as Unavailable Metrics | [MCP note §6.1](mcp-server-for-trainm8.md#61-the-strava-gate-a-new-reason-for-an-unavailable-metric), [WS §6](watch-data-sources.md#6-ai-and-mcp-terms-per-source) |
| EU residency: production runs in Stockholm today                                                                                                                                | TM `fly.toml:2` (`primary_region = "arn"`)                                                                                                                         |
| Today: React Router `^7.13.0`, Express 5, Prisma 6 on SQLite/LiteFS, own auth (TOTP, WebAuthn), zod 3                                                                           | TM `package.json:52,62,65,70,89,98,109,122`                                                                                                                        |
| 56 Prisma models; activity streams are downsampled JSON-in-`String` columns                                                                                                     | TM `prisma/schema.prisma:1683–1694`                                                                                                                                |

---

## 1. Convex

- **Core primitive.** TypeScript `query` / `mutation` / `action` functions.
  Queries re-run when their data changes and every subscribed client gets the
  same snapshot ([realtime](https://docs.convex.dev/realtime)). Mutations run as
  transactions; only actions call external APIs
  ([functions](https://docs.convex.dev/functions)).
- **Agent component** (`@convex-dev/agent` 0.7.7, 2026-10-08, peers
  `ai ^7.0.0`). Threads and messages live-update on every client
  ([agents](https://docs.convex.dev/agents)). `createTool` wraps the AI SDK's
  `tool`, and its `ctx` carries `runQuery`, `runMutation` and `runAction`
  ([tools](https://docs.convex.dev/agents/tools)). `needsApproval` "can be a
  boolean or an async function"; "generation pauses and the
  `tool-approval-request` is persisted in the thread", and `approveToolCall` /
  `denyToolCall` resume it
  ([tool approval](https://docs.convex.dev/agents/tool-approval)).
- **MCP.** `npx convex mcp start` gives _coding agents_ tools against a
  deployment
  ([Convex MCP server](https://docs.convex.dev/ai/convex-mcp-server)). For an
  app-level server, the components directory lists `convex-mcp-gateway`
  ("Auth-aware MCP server for Convex that exposes functions as MCP tools with
  OAuth 2.1 discovery"), from the `tfohlmeister` GitHub account. The page does
  not say Convex maintains it, and it relies on "any OAuth 2.1/OIDC provider
  that Convex supports"
  ([component](https://www.convex.dev/components/convex-mcp-gateway)).
- **Auth.** Better Auth runs as a Convex component
  ([Better Auth × Convex](https://better-auth.com/docs/integrations/convex)).
  But `@convex-dev/better-auth` 0.12.5 (2026-06-27) peers
  `better-auth >=1.6.11 <1.7.0`, and `@better-auth/mcp` has no 1.6.x release: it
  went from 1.4.x and 1.5 betas (January 2026) straight to the 1.7 line (npm).
  So the MCP 2026-07-28 profile is not reachable on Convex through Better Auth
  yet (inference from npm).

| Item      | Value                                                                                                                                                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| License   | `convex` client Apache-2.0 (npm). Backend FSL-1.1, converting to Apache-2.0 two years after creation ([LICENSE.md](https://raw.githubusercontent.com/get-convex/convex-backend/main/LICENSE.md))                                           |
| Versions  | `convex` 1.46.0 (2026-09-16); `@convex-dev/agent` 0.7.7 (npm)                                                                                                                                                                              |
| Self-host | Same code as the cloud; SQLite by default, or Postgres/MySQL ([self-hosted README](https://raw.githubusercontent.com/get-convex/convex-backend/main/self-hosted/README.md))                                                                |
| EU        | `aws-eu-west-1` (Ireland) with a "30% regional surcharge"; "An existing deployment's region cannot be changed" ([regions](https://docs.convex.dev/production/regions)). Self-hosting on Fly `arn` would keep data in Stockholm (inference) |
| Limits    | 1 MiB per document; per query or mutation 16 MiB read, 32,000 documents scanned, 1 s of user code ([limits](https://docs.convex.dev/production/state/limits)). Season-long load maths belongs in actions or precomputed tables (inference) |
| Framework | Quickstarts for Remix, TanStack Start and Next.js; **no React Router page** in the index ([llms.txt](https://docs.convex.dev/llms.txt))                                                                                                    |
| Lock-in   | High at the code level: the data model, `v` validators, `ctx.db` and the reactivity contract are Convex-specific; softened by the open-source backend (inference)                                                                          |

---

## 2. Cloudflare Agents SDK (with Workers, Durable Objects, D1, Hyperdrive)

- **Core primitive.** Agents _are_ Durable Objects. State is "Automatically
  saves to SQLite", "Changes are broadcast to all connected WebSocket clients
  instantly" and "Both server and clients can update state"
  ([state](https://developers.cloudflare.com/agents/runtime/lifecycle/state/)).
  `@callable()` methods are WebSocket RPC for browsers.
- **MCP.** "`McpAgent` remains available only for existing legacy servers while
  they migrate. It is deprecated and feature-frozen", and "Migrate to
  `createMcpHandler` at your earliest convenience"; the page was last updated
  2026-07-27
  ([McpAgent](https://developers.cloudflare.com/agents/model-context-protocol/apis/agent-api/)).
  `createMcpHandler` is "stateless with legacy compatibility by default", built
  on `@modelcontextprotocol/server`, and the docs say to "Use the exact MCP
  versions required by your installed Agents release"
  ([handler API](https://developers.cloudflare.com/agents/model-context-protocol/apis/handler-api/)).
  `agents` 0.28.0 peers `@modelcontextprotocol/server` **2.0.0** exactly and
  `zod ^4.0.0` (npm).
- **OAuth.** `@cloudflare/workers-oauth-provider` 1.2.3 (2026-10-07, MIT) "needs
  a KV namespace bound as `OAUTH_KV`", accepts Client ID Metadata Documents, and
  implements "MCP authorization 2026-07-28", RFC 8707, RFC 9728 and CIMD
  draft-00. "Tokens, codes and secrets are stored only as hashes"
  ([README](https://raw.githubusercontent.com/cloudflare/workers-oauth-provider/main/README.md)).
- **Approvals and undo.** `AIChatAgent` supports tool approvals
  ([chat agents](https://developers.cloudflare.com/agents/communication-channels/chat/chat-agents/)).
  Code Mode: "Rollback walks applied connector calls in reverse order. It
  invokes the `revert` implementation for every applied method that provides
  one", under a caution that "Code Mode is experimental and may have breaking
  changes"
  ([how it works](https://developers.cloudflare.com/agents/tools/codemode/how-it-works/)).
  It is the only built-in undo of agent writes in this survey.
- **Limits.** 1 GB of state per agent; 30 s of CPU, "refreshed per HTTP request
  / incoming WebSocket message"
  ([limits](https://developers.cloudflare.com/agents/platform/limits/)).
- **React Router.** C3 scaffolds "a full-stack app with React Router v8"; "SPA
  mode and prerendering are not currently supported when using the Cloudflare
  Vite plugin"
  ([guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/react-router/)).
  trainm8's Express middleware would move into the Worker's `fetch` (inference).

| Item     | Value                                                                                                                                                                                                                                                          |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| License  | `agents`, `workers-oauth-provider` and `@cloudflare/think` are MIT (npm). The `workerd` runtime is open source                                                                                                                                                 |
| Versions | `agents` 0.28.0 (2026-10-09; 201 releases without a pre-release suffix since 2025-03-17, after 2012–2015 releases of an unrelated package under the same name); `workers-oauth-provider` 1.2.3; `@cloudflare/ai-chat` 0.12.1; `@cloudflare/think` 0.20.2 (npm) |
| EU       | `jurisdiction: "eu"` for Durable Objects, D1 and Agents, set at creation ([DO data location](https://developers.cloudflare.com/durable-objects/reference/data-location/))                                                                                      |
| Lock-in  | The highest here: Durable Objects, bindings and hibernation are Cloudflare APIs. Whether self-hosted `workerd` gives production-grade Durable Object storage is **unverified**                                                                                 |

---

## 3. Mastra

- **What it is.** An agent framework: agents, workflows (suspend and resume),
  memory, MCP, evals and tracing ([llms.txt](https://mastra.ai/llms.txt)).
  `@mastra/core` 1.75.0 (2026-10-07; 1.0.0 was 2026-01-20), Apache-2.0 except
  directories named `ee/`
  ([LICENSE.md](https://raw.githubusercontent.com/mastra-ai/mastra/main/LICENSE.md)).
  It peers `zod ^3.25.0 || ^4.0.0` (npm).
- **MCP.** "Both speak the MCP `2026-07-28` revision"; servers are served at
  `/api/mcp/:serverId/mcp`, and a tool's `context.suspend()` becomes an
  `input_required` round ([MCP](https://mastra.ai/docs/connections/mcp)).
  `@mastra/mcp` 2.2.0 pins `@modelcontextprotocol/server` 2.0.0 (npm).
- **OAuth.** `createOAuthMiddleware` serves protected-resource metadata and
  calls your validator; "Without a validator, the middleware accepts an
  unvalidated token", which "isn't production protection". The page describes
  the authorization server as a separate component
  ([MCP auth](https://mastra.ai/docs/guides/mcp-authentication-authorization)).
  The tokens must come from elsewhere, for example Better Auth (inference).
- **Embedding.** `@mastra/express` peers `express ^5.1.0` (npm), which matches
  trainm8's Express 5 (TM `package.json:89`).

**Fit.** An alternative to AI SDK 7 as the loop inside 8A, adding workflows and
evals at the cost of a second set of `/api/*` endpoints and its own storage
tables (inference). Not a foundation.

---

## 4. Supabase

- **Core.** Managed Postgres plus Auth, Realtime and Edge Functions.
  `@supabase/supabase-js` 2.117.3 (2026-10-07); `@supabase/server` 1.9.1 (npm).
- **OAuth 2.1 server: beta.** "OAuth 2.1 server is in beta and available on all
  Supabase plans"; dynamic client registration is an optional setting
  ([getting started](https://supabase.com/docs/guides/auth/oauth-server/getting-started)).
  Access tokens are Supabase JWTs that existing Row Level Security applies to
  ([OAuth server](https://supabase.com/docs/guides/auth/oauth-server)). **CIMD
  and RFC 8707 are not mentioned** on these pages.
- **Regions.** "North EU (Stockholm), `eu-north-1`" is a specific region. The
  "Europe" general region "includes London and Zurich, which are not EU member
  states" ([regions](https://supabase.com/docs/guides/platform/regions)).
- **Other.** Supabase's own MCP server manages Supabase projects; it is
  developer tooling
  ([MCP](https://supabase.com/docs/guides/getting-started/mcp)). Zero rates
  Supabase "⚠️" (§5).

**Fit.** A credible Postgres host for 8A, in the same city as today's Fly
region. Its Auth is weaker than Better Auth for trainm8: beta, no documented
CIMD.

---

## 5. Sync engines for shared live state

| Engine               | How a server-side write reaches the UI                                                                                                                                                 | Requirements and status                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | For trainm8 (inference)                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Zero** (Rocicorp)  | Any Postgres write is replicated into `zero-cache`. Mutators run optimistically on the client and authoritatively on your server ([mutators](https://zero.rocicorp.dev/docs/mutators)) | "As of March 2026, Zero is generally available and fully-supported"; SSR is under "Soon" ([status](https://zero.rocicorp.dev/docs/status)). "Zero requires Postgres v15.0 or higher, and support for logical replication"; `wal_level` must be `logical`; Fly MPG and Supabase rated "⚠️"; on Neon, "as long as zero-cache is running, Postgres will be running and you will be charged" ([Postgres](https://zero.rocicorp.dev/docs/connecting-to-postgres)). `@rocicorp/zero` 1.10.0 (2026-10-09) | Its mutators become a second write registry, competing with `defineAction`; no SSR conflicts with loaders |
| **Electric**         | "consumes the logical replication stream and fans out data into Shapes"; writes "go through your existing backend" ([Postgres Sync](https://electric.ax/sync/postgres-sync.md))        | A separate Elixir service. `@electric-sql/client` 1.5.28 (2026-09-09); `@tanstack/react-db` 0.5.8 (npm)                                                                                                                                                                                                                                                                                                                                                                                            | Fits a trainm8-owned registry: writes stay in the registry and Electric only streams                      |
| **InstantDB**        | Client database plus admin SDK                                                                                                                                                         | "New signups are closed"; "On August 31st, 2027, all cloud apps will shut down"; "All of Instant is open source" ([essay](https://www.instantdb.com/essays/instant_team_joins_openai)). `@instantdb/react` 1.0.67 (2026-08-31)                                                                                                                                                                                                                                                                     | **Do not choose**                                                                                         |
| **LiveStore / Jazz** | Local-first event log / relational CRDT                                                                                                                                                | `@livestore/livestore` 0.4.0 (2026-06-02); `jazz-tools` 0.20.19 (2026-07-03), `2.0.0-alpha.59` on `alpha` (npm)                                                                                                                                                                                                                                                                                                                                                                                    | Client-authoritative state is the opposite of trainm8's server-gated proposals (ADR 0080)                 |

With Zero or Electric, writes from MCP and the agent appear without explicit
emit calls. With trainm8's SSE stream, every registry write must emit, which a
registry makes a one-place rule (inference).

---

## 6. App frameworks as hosts

| Framework                     | Version (npm)                                                                                                     | Who requires or prefers it                                                                                                                                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| React Router (framework mode) | 8.4.0 (2026-09-15; 8.0.0 was 2026-06-17); 7.18.4 patched the same day. v8 needs Node ≥ 22.22.0 and React ≥ 19.2.7 | agent-native requires v8 (AN §2.2). Cloudflare's C3 scaffolds v8. Better Auth documents a "React Router v7 Integration" ([llms.txt](https://better-auth.com/docs/llms.txt)). Convex has only a Remix quickstart |
| TanStack Start                | 1.168.61 (2026-10-10)                                                                                             | "TanStack Start is currently in the Release Candidate stage!" ([overview](https://tanstack.com/start/latest/docs/framework/react/overview)). Convex has a quickstart for it                                     |
| Next.js                       | 16.4.0 (2026-10-06)                                                                                               | First-class in Convex and Mastra docs; no platform here requires it                                                                                                                                             |

**Takeaway (inference).** Nothing forces trainm8 off React Router. Moving 7 → 8
on trainm8's own schedule keeps it aligned with agent-native and Cloudflare.
Convex and Zero push towards client-side data hooks instead of loaders.

---

## 7. Comparison tables

### 7.1 Facts

Maturity and lock-in are this note's assessment, drawn from the sections above.

| Option                                   | Core primitive                                                     | License                                                                                       | Latest (npm, 2026-10-11)                                                                                  | Maturity                                                    | EU residency                                            | Lock-in              |
| ---------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------- | -------------------- |
| **agent-native** ([AN](agent-native.md)) | `defineAction` → hook, tool, HTTP, CLI, MCP, A2A                   | MIT in `package.json`; no LICENSE file ships ([open-stack §8A.2](agent-native-open-stack.md)) | `@agent-native/core` 0.206.0                                                                              | Alpha; 1,014 stable releases in 7 months; Nitro 3 beta host | Your Postgres's region                                  | Medium (framework)   |
| **Own layer** (§8A)                      | trainm8 `defineAction` ([BB §9.1](agent-layer-building-blocks.md)) | MIT / Apache-2.0 parts                                                                        | `better-auth` 1.7.7; `ai` 7.0.137; `@modelcontextprotocol/server` 2.3.1; `drizzle-orm` 0.45.4 (1.0 at RC) | Stable parts; the registry is new code                      | Supabase Stockholm; Fly MPG `ams`/`fra`; Neon Frankfurt | Low                  |
| **Convex**                               | Reactive `query` / `mutation` / `action`; Agent                    | Apache-2.0 client; FSL backend                                                                | `convex` 1.46.0; `@convex-dev/agent` 0.7.7                                                                | Platform mature; Agent component 0.x                        | Ireland +30 %, or self-host                             | High (code)          |
| **Cloudflare Agents SDK**                | Agent = Durable Object with synced state                           | MIT                                                                                           | `agents` 0.28.0; `workers-oauth-provider` 1.2.3                                                           | Pre-1.0; `McpAgent` deprecated; Code Mode experimental      | `jurisdiction: "eu"`                                    | Highest              |
| **Mastra**                               | `Agent`, `createTool`, workflows, `MCPServer`                      | Apache-2.0 (+ `ee/`)                                                                          | `@mastra/core` 1.75.0                                                                                     | 1.x since 2026-01                                           | n/a (a library)                                         | Low–medium           |
| **Supabase**                             | Postgres + Auth (OAuth 2.1 server) + Realtime                      | Apache-2.0                                                                                    | `supabase-js` 2.117.3                                                                                     | Platform mature; OAuth server beta                          | Stockholm and others                                    | Low (it is Postgres) |
| **Zero**                                 | Query-driven sync; client + server mutators                        | Apache-2.0                                                                                    | `@rocicorp/zero` 1.10.0                                                                                   | GA since 2026-03; no SSR                                    | Follows your Postgres and cache host                    | Medium               |
| **Electric**                             | Read-path Shapes over HTTP                                         | Apache-2.0                                                                                    | `@electric-sql/client` 1.5.28                                                                             | 1.x; TanStack DB 0.5                                        | Self-host; cloud region **unverified**                  | Low                  |

**MCP SDK pins.** `@modelcontextprotocol/server`'s `latest` is 2.3.1, but
`agents` 0.28.0, `@mastra/mcp` 2.2.0 and `@agent-native/core` 0.206.0 all pin
**2.0.0** exactly (npm). An own layer chooses its SDK version itself
(inference).

### 7.2 Mapping to the agent-native principles

| Option       | Shared typed actions (UI = agent = MCP)             | Agent knows the screen             | Live shared state                           | MCP server + OAuth AS                                        | Approvals                            | Undo of agent writes                    |
| ------------ | --------------------------------------------------- | ---------------------------------- | ------------------------------------------- | ------------------------------------------------------------ | ------------------------------------ | --------------------------------------- |
| agent-native | Built in                                            | Built in (`application_state`)     | SSE + polling fallback (AN §2.7)            | Built in; refresh tokens not rotated (open-stack §4)         | Built in, argument-bound             | History Kit (AN §2.5)                   |
| Own layer    | Registry (to build, small)                          | Request body or a table (to build) | Existing per-athlete SSE → `NOTIFY` (§8A.2) | MCP SDK v2 + `@better-auth/mcp` / `cimd`                     | AI SDK approvals; ADR 0080 proposals | ADR 0088 tokens, server-held (to build) |
| Convex       | Functions (MCP via adapter)                         | To build (table)                   | **Automatic**                               | Community gateway; external IdP; Better Auth component < 1.7 | `needsApproval` (durable)            | None                                    |
| Cloudflare   | `@callable` + `action()` + MCP (three declarations) | Bidirectional agent state          | Agent state yes; database rows no           | `createMcpHandler` + `workers-oauth-provider`                | Yes                                  | Code Mode `revert` (experimental)       |
| Mastra       | `createTool` → agent + `MCPServer`                  | None                               | None                                        | Server yes; validates tokens only                            | `requireApproval`, `suspend()`       | None                                    |
| Supabase     | None (RLS + your code)                              | None                               | Realtime                                    | OAuth 2.1 server (beta, DCR)                                 | None                                 | None found                              |
| Zero         | Mutators (client + server)                          | None                               | **Automatic** (WAL)                         | None                                                         | None                                 | None                                    |
| Electric     | None (writes are yours)                             | None                               | **Automatic** read path                     | None                                                         | None                                 | None                                    |

---

## 8. Candidate stacks

The letters 8A–8D label this section's stacks; they are not the options A–F in
[`agent-native.md`](agent-native.md) and
[`agent-native-open-stack.md`](agent-native-open-stack.md).

### 8A. Own layer: agent-native's stack minus the framework

**End state:** React Router 8 (framework mode, Express, Fly), an EU Postgres,
Drizzle, Better Auth (`@better-auth/mcp` + `@better-auth/cimd` + `jwt()`, plus
passkey and 2FA), trainm8's `defineAction` registry, AI SDK 7, MCP SDK v2, and
the per-athlete SSE stream over `NOTIFY`.

**Order** ([stack-migration.md §1.2, §7](stack-migration.md)):

1. **Better Auth on today's Prisma + SQLite** (about 3–5 weeks). Its Prisma
   adapter accepts `provider: "sqlite"`, so auth does not wait for the database.
2. **The MCP server** from the registry, with OAuth through `@better-auth/mcp` +
   `cimd` (about 1–2 weeks for the OAuth part). zod ≥ 4.2 first (BB §9.3).
3. **Postgres, still on Prisma, when a trigger fires**: a second machine,
   point-in-time recovery, preview databases, or wanting off LiteFS (about 3–5
   weeks). `NOTIFY` replaces the in-process emitter at the same time (§8A.2).
4. **Drizzle after its 1.0 GA** (about 6–10 weeks), as its own step after
   Postgres, because 1.0 is still an RC. npm `latest` is 0.45.4 (2026-10-08),
   the `rc` dist-tag is `1.0.0-rc.4`, the newest RC build is
   `1.0.0-rc.5-5935859` (2026-09-09), and RCs have run since 2026-04-30.
   Starting now means migrating the ORM twice (inference;
   [stack-migration.md §6](stack-migration.md)).
5. **React Router 8** on trainm8's own schedule; an in-app agent only if the
   owner wants one (AN §8, question 1).

- **Gains.** Every principle maps onto an existing seam: the registry (BB §9.1),
  ADR 0080 proposals, ADR 0088 undo, and the SSE stream. Better Auth closes the
  MCP note's largest item, the authorization server. Converging on
  agent-native's stack keeps borrowing its MIT code, or adopting it at 1.0,
  possible (inference).
- **Costs.** Three migrations, staged so each ships alone. Screen context, sync
  wiring and undo are hand-built. A managed database adds a vendor against
  "Limit Services" (`docs/guiding-principles.md:6–8`).
- **Risks.** Better Auth 1.7.0 (2026-08-18) broke APIs in a minor
  (stack-migration.md §4.1). Neon or Fly MPG means leaving `arn` (§8A.1).
- **Right choice when** the owner wants the principles, MCP first, low lock-in,
  and ADR-encoded behaviour kept exactly.

#### 8A.1 Where the database can live

| Host                     | EU regions                                                                                                                                                                        | Consequence for trainm8 (app in `arn`)                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Fly Managed Postgres** | MPG is marked for `ams`, `fra` and `lhr`; **not `arn`** ("MPG" regions "can host Managed Postgres clusters", [regions](https://docs.fly.io/reference/regions))                    | Move the app to `fra` or `ams`, or query across cities. `lhr` is outside the EU                 |
| **Neon**                 | AWS Frankfurt (`aws-eu-central-1`) and London (`aws-eu-west-2`); "You can no longer create new projects in Azure regions" ([regions](https://neon.com/docs/introduction/regions)) | Move the app to `fra` ([stack-migration.md §5.1](stack-migration.md)). London is outside the EU |
| **Supabase**             | Stockholm `eu-north-1`, plus Ireland, Paris and Frankfurt (§4)                                                                                                                    | The app stays in `arn`; same metro, different provider (inference)                              |

[`stack-migration.md`](stack-migration.md) §5.1 defaults to Neon in Frankfurt
with the app moved to `fra`, and to Supabase if staying in Stockholm matters.

#### 8A.2 SSE over `NOTIFY`: the live-update seam trainm8 already has

- **Today.** `resources/imports-events` opens an event stream per athlete and
  sends a timestamp whenever `subscribeActivityImportCreated` fires; the browser
  revalidates (TM `app/routes/resources/imports-events.tsx:15–27`; ADR 0049 made
  it refresh the home surface). The publisher is "a single-process publisher … a
  multi-instance future would swap the emitter for a shared transport (e.g.
  Postgres LISTEN/NOTIFY or Redis pub/sub) behind the same `publish` /
  `subscribe` surface" (TM `app/utils/imports-events.server.ts:17–20`).
- **What `NOTIFY` gives.** It "sends a notification event together with an
  optional 'payload' string to each client application that has previously
  executed LISTEN"; inside a transaction, events "are not delivered until and
  unless the transaction is committed"; the payload "must be shorter than 8000
  bytes" by default
  ([NOTIFY](https://www.postgresql.org/docs/current/sql-notify.html)). So a
  registry write can `NOTIFY` the athlete's channel in the same transaction, and
  listeners hear it only after it commits (inference).
- **The pooler catch.** Neon lists `LISTEN` / `NOTIFY` as "Not supported with
  pooled connections" and says to use a direct connection
  ([pooling](https://neon.com/docs/connect/connection-pooling)). The one
  long-lived listener per app machine needs the non-`-pooler` hostname
  (inference).
- **When it is needed.** Only with a second app machine. On today's single
  machine the in-process emitter already works for agent and MCP writes, as long
  as each registry write publishes (inference).

**8A plus a sync engine, later.** Add Electric (writes stay in the registry) or
Zero (takes over writes) only if instant optimistic UI or multi-device
collaboration becomes a goal. Either needs Postgres ≥ 15 with logical
replication. For one athlete per dataset, SSE invalidation is enough
(inference).

### 8B. Convex

React Router with client hooks, or TanStack Start; Convex in `aws-eu-west-1` or
self-hosted on Fly `arn`; Convex functions as the registry; the Agent component;
an MCP HTTP-action adapter.

- **Gains.** Live shared state with no code; transactions, scheduler, durable
  approvals and persisted threads; one typed function surface.
- **Costs.** Rewrite the 56-model domain and every loader and action; fit
  training-load analytics into the 1 s / 16 MiB limits; no native MCP
  authorization server, and the Better Auth component is pinned below 1.7; +30 %
  for the cloud EU region.
- **Risks.** Code-level lock-in; Agent component 0.x; whether MCP SDK v2 runs in
  Convex's default runtime or only in Node actions is **unverified**.
- **Right choice when** real-time multi-user collaboration (coach and athlete)
  becomes core and a rewrite is acceptable.

### 8C. Cloudflare Workers + Agents SDK

React Router 8 on Workers; one Agent per athlete; `createMcpHandler`;
`workers-oauth-provider` or Better Auth; `jurisdiction: "eu"`.

- **Gains.** A per-athlete actor matches a single-user product: synced state,
  per-athlete schedules, screen context through bidirectional state; first-party
  MCP handler and OAuth library.
- **Costs.** Port Express and Node APIs to Workers; rewrite the data layer; zod
  4 required; cross-athlete queries (corpus, benchmarks) get harder with
  per-object databases (inference).
- **Risks.** Churn (`McpAgent` deprecated within the SDK's 0.x life);
  experimental Think and Code Mode; 1 GB per agent; the deepest lock-in here.
- **Right choice when** the owner wants edge hosting and per-athlete background
  agents, and accepts Cloudflare as a long-term dependency.

### 8D. agent-native

The framework itself: Postgres, Drizzle, Nitro 3 beta, React Router 8, Better
Auth. All principles out of the box. Rejected for now in
[`agent-native-open-stack.md`](agent-native-open-stack.md): it strips the
session from every server render, runs on a beta Nitro, and broke app code about
11 times in 50 days. **Right choice when** it reaches 1.0 and trainm8 has
already moved to 8A's layers, which makes the switch small.

---

## 9. Recommendation (ranked)

1. **8A: own layer**, ordered as in §8A. Reasoning:
   - **(a) MCP is the owner's main interest**, and its hardest part is the
     authorization server (MCP note, TL;DR). Only Better Auth and Cloudflare's
     library give a first-party, MCP-2026-07-28-aware server, and only Better
     Auth does it without changing runtime.
   - **(b) trainm8's differentiators are app-level in every option** (§7.2):
     proposals gated by the athlete's yes, undo tokens and the per-origin
     provenance gate. A platform buys only live sync, and trainm8 has a seam for
     that.
   - **(c) Convergence** with agent-native's stack hedges towards 8D.
   - **(d) EU residency**: Stockholm on Supabase, or Frankfurt/Amsterdam on Neon
     or Fly MPG with the app moved (§8A.1).
2. **8B: Convex**, if collaboration or real-time becomes the product. It loses
   to 8A on rewrite cost, the MCP auth gap and the EU surcharge.
3. **8C: Cloudflare.** The most elegant fit for per-athlete agents, with the
   most experimental surface and the deepest lock-in.
4. **8D: agent-native.** Revisit at 1.0.

**Not recommended as foundations:** Mastra (a loop library; consider it inside
8A if workflows or evals are wanted); Supabase as a platform (use it as a
Postgres host, not for its Auth); Zero as a first step; InstantDB; LiveStore and
Jazz.

---

## 10. Verification log

50 claims were re-checked against npm, the vendors' pages and this repository
while promoting the scratch draft: 44 held, 5 were corrected or softened, and 1
open item was resolved. Five more stay unverified (Sources, Not verified).

| Draft said                                                       | Now says                                                                                                                         | Evidence                                             |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Order: Better Auth → MCP → "Postgres + Drizzle" → NOTIFY         | Better Auth → MCP → Postgres on a trigger (with `NOTIFY`) → Drizzle after 1.0 GA                                                 | `npm view drizzle-orm dist-tags`; §8A                |
| Fly MPG runs in `ams` and `fra`                                  | `ams`, `fra` and `lhr`; not `arn`                                                                                                | [Fly regions](https://docs.fly.io/reference/regions) |
| `@better-auth/mcp` "jumps from 1.5 betas to 1.7"                 | 1.4.13–1.4.17 and 1.5 betas (January), then the 1.7 line from June; no 1.6.x either way                                          | `npm view @better-auth/mcp time`                     |
| Better Auth's MCP profile gives "RFC 8707 resource-bound tokens" | `metadataProfile: "mcp-2026-07-28"` is a `cimd()` option; tokens carry the `resource` as `aud` (the page does not name RFC 8707) | Better Auth docs                                     |
| Mastra's OAuth: "something else must issue" the tokens           | The docs describe a separate authorization server; I found no Mastra token issuer                                                | Mastra MCP auth page                                 |
| Unverified: whether Neon's pooled endpoint supports `LISTEN`     | It does not; use the direct connection                                                                                           | Neon pooling docs                                    |

The 44 that held include every npm version and date in §§1–8, the `McpAgent`
notice and its date, the `workers-oauth-provider` README, Supabase's beta label
and regions, Zero's GA and Postgres requirements, the InstantDB notice, Neon's
regions, Convex's regions, limits and Better Auth peer pin, the Cloudflare and
Convex quotes in §§1–2, the NOTIFY semantics, and the trainm8 citations.

---

## Open questions

1. **Which trigger moves the database, and does the app leave `arn`?** Neon and
   Fly MPG mean `fra`; Supabase keeps Stockholm but is another provider in the
   request path.
2. **Does the owner want an in-app agent at all?** Without one, live sync only
   has to cover MCP writes, which the SSE stream already does if each write
   publishes.
3. **Does Better Auth's passkey plugin take the existing `@simplewebauthn`
   credentials unchanged?** stack-migration.md §4.5 says passkeys migrate; that
   should be proven on a staging copy.
4. **Will `@convex-dev/better-auth` lift its `<1.7` peer range?** Until it does,
   Convex has no first-party route to the MCP profile.
5. **Does MCP SDK v2 run in Convex's default runtime,** and does self-hosted
   `workerd` give production-grade Durable Object storage?

## Sources

**npm registry** (2026-10-11): `convex`, `@convex-dev/agent`,
`@convex-dev/better-auth`, `agents`, `@cloudflare/workers-oauth-provider`,
`@cloudflare/ai-chat`, `@cloudflare/think`, `@mastra/core`, `@mastra/mcp`,
`@mastra/express`, `@supabase/supabase-js`, `@supabase/server`,
`@rocicorp/zero`, `@electric-sql/client`, `@tanstack/react-db`,
`@instantdb/react`, `@livestore/livestore`, `jazz-tools`, `react-router`,
`@tanstack/react-start`, `next`, `drizzle-orm`, `better-auth`,
`@better-auth/mcp`, `@better-auth/cimd`, `ai`, `@modelcontextprotocol/server`,
`@agent-native/core`.

**Convex:** [realtime](https://docs.convex.dev/realtime),
[functions](https://docs.convex.dev/functions),
[agents](https://docs.convex.dev/agents),
[tools](https://docs.convex.dev/agents/tools),
[tool approval](https://docs.convex.dev/agents/tool-approval),
[MCP server](https://docs.convex.dev/ai/convex-mcp-server),
[regions](https://docs.convex.dev/production/regions),
[limits](https://docs.convex.dev/production/state/limits),
[llms.txt](https://docs.convex.dev/llms.txt),
[convex-mcp-gateway](https://www.convex.dev/components/convex-mcp-gateway),
[backend LICENSE](https://raw.githubusercontent.com/get-convex/convex-backend/main/LICENSE.md),
[self-hosted README](https://raw.githubusercontent.com/get-convex/convex-backend/main/self-hosted/README.md).

**Cloudflare:**
[state](https://developers.cloudflare.com/agents/runtime/lifecycle/state/),
[McpAgent](https://developers.cloudflare.com/agents/model-context-protocol/apis/agent-api/),
[handler API](https://developers.cloudflare.com/agents/model-context-protocol/apis/handler-api/),
[chat agents](https://developers.cloudflare.com/agents/communication-channels/chat/chat-agents/),
[Code Mode](https://developers.cloudflare.com/agents/tools/codemode/how-it-works/),
[limits](https://developers.cloudflare.com/agents/platform/limits/),
[DO data location](https://developers.cloudflare.com/durable-objects/reference/data-location/),
[React Router guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/react-router/),
[workers-oauth-provider README](https://raw.githubusercontent.com/cloudflare/workers-oauth-provider/main/README.md).

**Mastra:** [llms.txt](https://mastra.ai/llms.txt),
[MCP](https://mastra.ai/docs/connections/mcp),
[MCP auth](https://mastra.ai/docs/guides/mcp-authentication-authorization),
[LICENSE.md](https://raw.githubusercontent.com/mastra-ai/mastra/main/LICENSE.md).

**Supabase:**
[OAuth server](https://supabase.com/docs/guides/auth/oauth-server),
[getting started](https://supabase.com/docs/guides/auth/oauth-server/getting-started),
[regions](https://supabase.com/docs/guides/platform/regions),
[MCP](https://supabase.com/docs/guides/getting-started/mcp).

**Sync engines:** [Zero status](https://zero.rocicorp.dev/docs/status),
[Zero Postgres](https://zero.rocicorp.dev/docs/connecting-to-postgres),
[Zero mutators](https://zero.rocicorp.dev/docs/mutators),
[Electric Postgres Sync](https://electric.ax/sync/postgres-sync.md),
[InstantDB essay](https://www.instantdb.com/essays/instant_team_joins_openai).

**Better Auth:** [mcp](https://www.better-auth.com/docs/plugins/mcp),
[cimd](https://www.better-auth.com/docs/plugins/cimd),
[llms.txt](https://better-auth.com/docs/llms.txt),
[Convex integration](https://better-auth.com/docs/integrations/convex).

**Hosting and Postgres:** [Fly regions](https://docs.fly.io/reference/regions),
[Neon regions](https://neon.com/docs/introduction/regions),
[Neon pooling](https://neon.com/docs/connect/connection-pooling),
[PostgreSQL NOTIFY](https://www.postgresql.org/docs/current/sql-notify.html),
[TanStack Start](https://tanstack.com/start/latest/docs/framework/react/overview).

**trainm8** (`33c10f5`): `fly.toml`, `package.json`, `prisma/schema.prisma`,
`app/routes/resources/imports-events.tsx`, `app/utils/imports-events.server.ts`;
`docs/adr/0013`, `0049`, `0053`, `0080`, `0088`; `docs/decisions/003-sqlite.md`,
`009-region-selection.md`; `docs/guiding-principles.md`.

### Not verified

- Convex and Cloudflare pricing (not re-read in this pass).
- Who maintains `convex-mcp-gateway`, and how good it is.
- Whether self-hosted `workerd` provides production-grade Durable Object
  storage.
- Supabase's OAuth server with CIMD or RFC 8707, and when self-hosted.
- The Electric Cloud and Instant Cloud regions; Mastra platform and Cloud Zero
  pricing.

## ADRs this research challenges

Each ADR and decision below was read before being cited.

| ADR / decision                                                   | What it decided                                                                           | What the evidence says                                                                                                                                                                                        | Verdict                                                                |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **0049** Every import auto-saves; there is no inbox              | The Live Imports Stream (per-athlete SSE) refreshes the home surface when an import lands | The same stream is the cheapest live-sync seam for agent and MCP writes; no platform here beats it for one athlete per account (§8A.2). Its scope widens from "an import landed" to "a registry write landed" | **Amend** (widen the stream's trigger)                                 |
| **0013** Activity ingest trigger model                           | A SQLite-backed `Job` table polled by an in-process worker; one process                   | 8A keeps it. On Postgres the table moves with the database; only a platform switch (Convex, Cloudflare) would replace it (inference)                                                                          | **Confirm**                                                            |
| **0080** Week Replan proposes; the athlete's sessions need a yes | Proposals; AI writes the same proposals later                                             | Approvals in Convex, Cloudflare and Mastra approve a tool call, not a change. The athlete's yes stays app code on every platform (§7.2)                                                                       | **Confirm**                                                            |
| **0088** Every write on I dag is undone                          | Toast and landed row carry _Angre_; token-guarded restore                                 | Only Cloudflare's experimental Code Mode has built-in undo; everywhere else it is trainm8 code, so the ADR's tokens are the mechanism (§7.2)                                                                  | **Confirm**                                                            |
| **0053** Season generation is deterministic behind the seam      | A pure `SeasonGenerator`; a model arrives later                                           | No platform changes this; all of them call app code for domain rules                                                                                                                                          | **Confirm**                                                            |
| **Decision 003** SQLite                                          | SQLite on LiteFS for zero latency; "SQLite does not support subscriptions"                | Live updates do not need database subscriptions here: SSE plus `NOTIFY` covers it once Postgres arrives. Postgres comes only on a trigger, and Neon or Fly MPG would move the app out of `arn` (§8A.1)        | **Confirm, with exit triggers**                                        |
| **Decision 009** Region selection                                | Pick one region close to users; trainm8 chose `arn`                                       | A managed Postgres in the EU is not offered in `arn` by Fly or Neon; only Supabase keeps Stockholm                                                                                                            | **Amend when Postgres arrives** (the region follows the database host) |
