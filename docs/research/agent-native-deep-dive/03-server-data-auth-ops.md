# Appendix 03 — Server, data, identity, security, automations and deployment

> **Appendix to [agent-native-deep-dive.md](../agent-native-deep-dive.md).**
> Nitro/h3, route mounting, request context, SSR, the database, stores and
> migrations, tenancy, the SQL sandbox, auth, background work and deployment.
> Read at agent-native commit `a03f638` (2026-10-20, `@agent-native/core`
> 0.210.0); compiled 2026-10-20. Citations as in the main document.

- **Repo:** `BuilderIO/agent-native` clone at HEAD `a03f638`
  (2026-10-20 17:01 +0200), `@agent-native/core` **0.210.0**
  (`AN packages/core/package.json:3`). Baseline for "changes since":
  `1284000` (core 0.206.0, 2026-10-11). 406 commits lie between the two.
- **Citations:** `AN path:L–L` = repo file at `a03f638`; `docs <slug> L–L` =
  `packages/core/docs/content/<slug>.mdx`; `git <sha>` = commit;
  **(inference)** = my reasoning, not a stated fact.
- **Live-site spot check:** `server-overview`, `ssr-caching`, `recurring-jobs`
  and `multi-tenancy` fetched from `https://www.agent-native.com/docs/<slug>/`
  on 2026-10-20 (HTTP 200). Distinctive sentences from each repo page
  ("coordination: apply app-owned database migrations", the SSR
  `cache-control` value, "A warm instance doesn't run schedules", "planned as
  post-1.0 hardening") are present on the live pages. No mismatch found.
- **Third-party code read:** the published `nitro@3.0.260903-beta` tarball
  (`npm pack`, unpacked into an empty directory, read only) to confirm how Nitro 3
  orders middleware and plugins. Cited as `nitro-3 dist/<path>:L`.

---

## 0. The server model in one page (start here)

The owner asked to make `/docs/server-overview/` crystal clear. The doc says
the server is "coordination only" (docs server-overview 90, 120–124). The code
shows what that means concretely:

1. **Runtime.** An app is a **Nitro 3** server (`nitro` pinned exactly to
   `3.0.260903-beta`) on **h3 2.0.1** (srvx underneath), built by Vite 8 via
   Nitro's own Vite plugin (`nitro/vite`), which core wraps inside its
   `agentNative()` Vite preset with `serverDir: "./server"`
   (`AN packages/core/package.json:703,713`; `AN pnpm-lock.yaml:19655,21240`;
   `AN packages/core/src/vite/client.ts:289–293,3660–3720`).
2. **Two kinds of routes.** (a) The app's own Nitro **file routes** in
   `server/routes/**` (including the SSR catch-all `[...page].get.ts`) and
   **file middleware** in `server/middleware/*` (the auth guard). (b) The
   framework's routes under `/_agent-native/*`, `/.well-known/*` and `/mcp`.
   These are **not** Nitro file routes. Framework plugins push them into h3's
   internal middleware array `nitroApp.h3["~middleware"]` as prefix-matched,
   prefix-stripping middleware (`getH3App(nitroApp).use(path, handler)`;
   `AN packages/core/src/server/framework-request-handler.ts:192–287,661–848`).
3. **Plugins do the mounting.** `server/plugins/*.ts` run once at boot. An app
   ships `auth.ts` and `agent-chat.ts`. Any of 11 "default plugin" slots the
   app does not provide is **auto-mounted** by the first `getH3App()` call:
   `agent-chat, auth, context-xray, core-routes, integrations,
observational-memory, onboarding, org, resources, sentry, terminal`
   (`AN packages/core/src/deploy/route-discovery.ts:113–125,389–408`;
   `AN …/framework-request-handler.ts:850–950`). Actions are mounted by the
   **agent-chat plugin**, as one grouped middleware layer at
   `/_agent-native/actions/:name` (`AN packages/core/src/server/action-routes.ts:668–1773`).
4. **Readiness gates.** Plugin init is async and Nitro does not await it, so
   framework prefixes get "wait until ready" gates that hold a request up to
   25 s (`AGENT_NATIVE_ROUTE_READY_TIMEOUT_MS`), then answer 503
   `retry-after: 5` (`AN …/framework-request-handler.ts:411–455,493–548`).
5. **Every request runs inside an AsyncLocalStorage `RequestContext`.** A
   boundary middleware at index 0 opens an **identity-free** context for every
   request. Handlers that know the caller (action routes, MCP, A2A,
   integrations) nest `runWithRequestContext({ userEmail, orgId, … })`
   (`AN …/framework-request-handler.ts:289–344`;
   `AN packages/core/src/server/request-context.ts:106–198,406–511`). Everything
   downstream (access helpers, credential resolvers, agent SQL scoping) reads
   identity **from that context, not from parameters**.
6. **SSR is anonymous.** The SSR catch-all deletes `cookie` and
   `authorization`, renders with `{ userEmail: undefined, orgId: undefined }`,
   strips `Set-Cookie` and credential `Vary`, and stamps a public CDN cache
   policy. The auth guard deliberately lets **all HTML document and `.data`
   GETs through** without a session; private UI is gated client-side
   (`AN packages/core/src/server/ssr-handler.ts:171–185,332–380,516–580`;
   `AN packages/core/src/server/auth.ts:4296–4326`).
7. **One Postgres, many owners.** One `DATABASE_URL` holds ~167 framework
   tables (in `public`, generic names), plus the app's tables. Framework schema
   is owned by **stores** (`defineStore()` + ledger `_an_store_migrations`),
   app schema by the app's `server/plugins/db.ts`; production applies both in
   a **release step** (`pnpm migrate:production`), not at request time
   (`AN packages/core/src/db/store-registry.ts:1–14`;
   `AN packages/core/src/db/schema-snapshot.generated.ts`).
8. **Tenant isolation is application-level.** `owner_email` / `org_id` /
   `visibility` columns + SQL predicates built by `accessFilter()`, checks by
   `assertAccess()`, a CI/static guard, and per-user **temporary views** for
   the agent's raw SQL. No Postgres RLS ("planned as post-1.0 hardening",
   docs multi-tenancy 130–134).
9. **No long-lived process is assumed.** Background work is (a) a SQL row,
   (b) an HMAC-signed self-POST to a processor route on the same deployment
   ("fresh execution"), and (c) a once-a-minute platform trigger (Netlify
   scheduled function, Vercel Cron, Cloudflare Cron Trigger) that sweeps due
   jobs, queued events and stuck work. A long-running Node server instead
   runs an in-process 60 s timer
   (`AN packages/core/src/server/self-dispatch.ts:156–242`;
   `AN packages/core/src/deploy/build.ts:484–560,3960–4044`;
   docs recurring-jobs 157–176).

```text
Platform entry (node server | Netlify fn | Vercel fn | CF Worker | …)
  └─ Nitro 3 app: new H3Core(...)                         nitro-3 dist/_build/common.mjs:5811–5833
       h3["~middleware"], in the order it ends up:
        [0..k] plugin-ready placeholders (prepended later by trackPluginInit)
        [ ]    RequestContext boundary  (ALS, identity-free; CF per-request DB pool scope)
        [ ]    readiness gates: auth early paths, /mcp, /.well-known, /_agent-native
        [ ]    route-rules middleware                      (Nitro)
        [ ]    app global middleware: server/middleware/auth.ts → runAuthGuard()   (Nitro)
        [ ]    routed middleware                           (Nitro)
        [ ]    CSRF middleware (state-changing /_agent-native/* and /mcp with cookies)
        [ ]    framework mounts, in plugin registration order:
                 /_agent-native/auth/*, /org/*, /actions/* (one grouped layer),
                 /agent-chat, /mcp, /a2a, /poll, /runs, /automations, …
       h3 router (~findRoute): server/routes/** file routes, incl. [...page].get.ts SSR
```

The middleware order is my reconstruction from two sources **(inference
from code)**: Nitro 3 builds the h3 app and pushes `globalMiddleware`
(`server/middleware/*`) **before** it runs plugins, and runs every plugin
synchronously without awaiting it (`nitro-3 dist/_build/common.mjs:5811–5833`);
core then `unshift`s its boundary and gates and `push`es CSRF and mounts
(`AN …/framework-request-handler.ts:217–283,661–698`). So the app's auth
guard runs **before** framework mounts and before CSRF.

---

## 1. Runtime and build wiring

### What it is

Nitro 3 (beta) on h3 v2, configured through core's Vite preset.

### How it works

- `packages/core/package.json` dependencies: `"nitro": "3.0.260903-beta"`
  (exact pin), `"h3": "^2.0.1"`, `drizzle-orm ^0.45.2`, `postgres ^3.4.9`,
  `@neondatabase/serverless ^1.1.0`, `better-auth 1.7.6` and
  `@better-auth/core 1.7.6` (exact), `cron-parser ^5.5.0`, `jose ^6.2.2`.
  PGlite `^0.5.9`, `@better-auth/sso` and `@better-auth/scim` 1.7.6 are
  optional peers. `engines.node >=22.22.0`
  (`AN packages/core/package.json:675–720,804–807,973–974`).
- Lockfile resolves `h3@2.0.1(crossws@0.4.15(srvx@1.0.5))`, `nitro@3.0.260903-beta`,
  `drizzle-orm@0.45.2/0.45.3`, `postgres@3.4.9`, `@neondatabase/serverless@1.1.0`,
  `@electric-sql/pglite@0.5.9` (`AN pnpm-lock.yaml:19655,21240,18458,21838,11226,9256,36993`).
- The app's `vite.config.ts` is `plugins: [...reactRouter(), ...agentNative({...})]`
  (`AN templates/chat/vite.config.ts`). `agentNative()` includes
  `createNitroDevPlugin()`, which calls `nitro/vite`'s `nitro()` with
  `serverDir: "./server"`, an optional `ssr-entry.ts` as the Vite SSR service
  entry, build-time `replace` of `process.env.AGENT_NATIVE_RELEASE_MIGRATIONS`,
  `AGENT_NATIVE_BETA_SCHEMA_OWNER` and the recurring-jobs build marker, and
  `ignore` for spec/test files (`AN packages/core/src/vite/client.ts:3660–3720`).
  Release-migration ownership is therefore **baked in at build time**.
- Preset: `NITRO_PRESET` env, or a marker file `.agent-native/nitro-preset`
  written by the build (`AN packages/core/src/deploy/nitro-preset.ts:1–50`).
- Core re-exports a no-op `defineNitroPlugin(def) => def` from
  `@agent-native/core/server` so templates need no `nitro` import
  (`AN packages/core/src/server/index.ts:933–936`; used in
  `AN templates/chat/server/plugins/otel.ts`).

What a scaffolded app's `server/` contains (Chat template):

```text
server/middleware/auth.ts      → export default defineEventHandler(e => runAuthGuard(e))
server/plugins/auth.ts         → createToolkitAuthPlugin({ workspaceAppPublicPaths: ["/"], rootAuth: true, marketing: false })
server/plugins/agent-chat.ts   → createAgentChatPlugin({ appId, actions: loadActionsFromStaticRegistry(registry),
                                    initialToolNames, resolveOrgId: e => getOrgContext(e).orgId, systemPrompt })
server/plugins/otel.ts         → defineNitroPlugin(() => startAgentNativeOtel())
server/routes/[...page].get.ts → createH3SSRHandler(() => import("virtual:react-router/server-build"))
ssr-entry.ts                   → createRequestHandler(...) for Vite dev SSR
```

(`AN templates/chat/server/**`, `AN templates/chat/ssr-entry.ts`). Templates
with tables add `server/plugins/db.ts`, `server/db/schema.ts`,
`server/db/index.ts` (`createGetDb(schema)`), and often `drizzle.config.ts`
(`AN templates/tasks/server/plugins/db.ts`, `AN templates/tasks/drizzle.config.ts`).

### Principle

"Most product behavior belongs in Actions. The server is what makes those
actions available." (docs server-overview 10). "There is no separate agent
backend or UI backend" (docs server-overview 193).

### Changes since 0.206

Version bump only for the runtime deps; `@better-auth/core 1.7.6` became a
direct dependency and PGlite moved to `^0.5.9` (`git diff 1284000..a03f638 --
packages/core/package.json`).

### Gaps / sharp edges

- The server runs on a **beta** of Nitro 3, pinned exactly. The docs still
  tell authors to `import { defineNitroPlugin } from "nitropack/runtime"`
  (docs server-plugins 157), the **Nitro 2** package name; Nitro 3's
  package is `nitro`, and core ships its own shim (see Docs vs code).
- core reaches into **h3 internals** (`h3["~middleware"]`,
  `h3["~getMiddleware"]`, `~middleware` index 0) and patches the
  middleware dispatcher (`AN …/framework-request-handler.ts:371–405`). Any h3
  minor that renames these breaks every app **(inference)**.

---

## 2. How routes are mounted

### What it is

A shim over h3's middleware array that mounts framework handlers at path
prefixes, plus a readiness protocol for async plugin init.

### How it works

`getH3App(nitroApp)` returns `{ use(path, handler), useGroup(entries) }`
(`AN …/framework-request-handler.ts:159–166,192–216`). On first call per
`nitroApp` it:

1. marks the server runtime started, kicks off
   `bootstrapDefaultPlugins(nitroApp)` in a promise (auto-mounts the missing
   default slots; a workspace-core package may supply its own impl per slot);
2. prepends a **readiness gate** for `/_agent-native`, `/.well-known`, `/mcp`
   and the auth entry paths (`/`, `/sign-in`, `/login`, `/signup`, …);
3. appends the global **CSRF** middleware;
4. `unshift`s the **request-context boundary** to `h3["~middleware"][0]`;
5. adds a Nitro `request` hook that rewrites a public framework prefix to the
   internal one and waits for readiness on framework paths
   (`AN …/framework-request-handler.ts:217–283`).

`createMountedMiddleware(path, handler)` matches `reqPath === path ||
startsWith(path + "/")` (also under `APP_BASE_PATH`), **strips the prefix**
from `event.url.pathname`, stores the original in
`event.context._mountedPathname`, calls the handler, and passes through
(`next()`) when the handler returns `undefined`. Thrown errors become JSON
`{ error, code? }` with the error's status; 5xx is sent to `captureError`
(`AN …/framework-request-handler.ts:723–848`). `useGroup` puts many routes
behind **one** layer because "with one layer per action (hundreds of them)
that overflows the stack in dev" (`AN …/framework-request-handler.ts:693–721`).

Readiness: each framework plugin calls `trackPluginInit(nitroApp, initPromise,
{ paths })`. That installs prepended placeholders on those paths that await
the bootstrap and plugin promises (raced against 25 s), then answer 503 with
`retry-after: 5` if init has not finished or has failed
(`AN …/framework-request-handler.ts:411–548`). The agent-chat plugin tracks
`/_agent-native/agent-chat`, `/_agent-native/actions`, `/_agent-native/mcp`,
`/mcp`, `/.well-known/agent-card.json`, `/_agent-native/a2a` and the
recurring-jobs sweep path, because "a platform scheduler usually lands on a
cold instance. Without the gate the first sweep 404s"
(`AN packages/core/src/server/agent-chat-plugin.ts:10009–10024`). The auth
plugin mounts `/_agent-native/auth/session` synchronously and marks it ready
before bootstrap, so session checks do not wait for unrelated plugins
(`AN packages/core/src/server/auth-plugin.ts:15–64`).

Framework route prefix: default `/_agent-native`, configurable as a public
namespace via `runtime.frameworkRoutePrefix`; public paths are translated to
internal ones per request, and retired internal paths 404
(`AN …/framework-request-handler.ts:128–155,307–320`; docs agent-native-config 104,419).

Route families (non-exhaustive):

- **core-routes plugin** mounts, among others: `/agents`, `/application-state`,
  `/automations` (+ `/automations/email-unsubscribe`), `/avatar`, `/builder/*`,
  `/can-see`, `/connections/oauth/`, `/env-status`, `/env-vars`, `/extensions`
  (+ legacy `/tools`), `/file-upload` (+ `/status`), `/health`, `/identity`,
  `/notifications`, `/oauth/popup`, `/open`, `/ping`, `/poll`, `/realtime-token`,
  `/runs`, `/secrets` (+ `/adhoc`), `/settings`, `/slots`, `/speak`,
  `/speculation-rules.json`, `/track`, `/transcribe-*`, `/usage`
  (`AN packages/core/src/server/core-routes-plugin.ts`, `${P}/…` uses).
- **auth**: `/_agent-native/auth/*` (Better Auth under `/_agent-native/auth/ba/*`),
  `/sign-in`, `/login`, `/signup`, Google OAuth routes
  (`AN packages/core/src/server/auth.ts:6269`; docs authentication 142–153).
- **org**: `/_agent-native/org/*` (docs organizations-teams-permissions 54–77).
- **agent-chat plugin**: `/_agent-native/agent-chat`, `/_agent-native/actions/*`,
  MCP (`/mcp`, legacy `/_agent-native/mcp`), A2A (`/_agent-native/a2a`,
  `/.well-known/agent-card.json`), the sweep route
  (`AN …/agent-chat-plugin.ts:10009–10024`).
- **integrations**: `/_agent-native/integrations/<platform>/webhook`,
  `/process-task`, `/retry-stuck-tasks`, remote-device routes (docs messaging-internals 17–24).
- **observability**: `/_agent-native/observability/*` (docs observability 291–315).

### Principle

"Plugins run at startup, not per-request, so they cannot enforce per-request
auth … Middleware in `server/middleware/` is the one place that runs for
every request regardless of path." (docs server-middleware 125–129).
"Normal app data must flow through actions. If you are about to write a
handler under `server/routes/api/`, or middleware to guard one, stop and
write an action instead. The only exceptions are uploads, streaming, inbound
webhooks, OAuth callbacks, public unauthenticated URLs, and non-JSON
responses." (`AN AGENTS.md:224–229`).

### Changes since 0.206

`useGroup` (one middleware layer for all actions) and batching of path
mounts into dispatch layers of 64 are new (`git diff 1284000..a03f638 --
packages/core/src/server/framework-request-handler.ts`, 94 changed lines; commits git
`d302491`, `1b84641`, both 2026-10-19). Before, every `use()` added its own
layer.

### Gaps

- Framework routes are invisible to Nitro's router, route rules and
  OpenAPI/prerender tooling **(inference)**.
- `createMountedMiddleware` mutates `event.url.pathname`; on runtimes where it
  is read-only it silently does not strip (comment at
  `AN …/framework-request-handler.ts:781–785`).

---

## 3. Request context (identity plumbing)

### What it is

A process-global `AsyncLocalStorage<RequestContext>` that carries the caller's
identity, org, capability, run and integration lineage to every code path
that serves a request.

### How it works

- Storage: Node's `AsyncLocalStorage` via `process.getBuiltinModule`, else a
  stack-based fallback that is **not** isolated across overlapping async
  requests. Run-scoped action surfaces refuse to work on the fallback
  (`assertRequestActionSurfaceIsolation`)
  (`AN packages/core/src/server/request-context.ts:14–55,374–384`).
- Shape (abridged; `AN …/request-context.ts:106–193`):

```ts
export interface RequestContext {
  isSyntheticTraffic?: boolean; mcpRequestId?: string;
  userEmail?: string;            // the principal
  credentialScope?: "org";        // keep data-source credentials within the org
  verifiedServiceIdentity?: { userEmail: string; orgId: string }; // set only after a service token is verified
  identityAuthenticatedAtMs?: number; identitySessionToken?: string;
  authUserId?: string; userName?: string;
  orgId?: string; orgScope?: "personal";
  authCapability?: string;        // embed capability, deliberately not identity
  isLoopbackRequest?: boolean; isIntegrationCaller?: boolean;
  integration?: { taskId; incoming; installationId?; principalType?: "user" | "service"; lineage?… };
  run?: RequestRunContext;        // threadId, runId, engine, allowedActionNames, actionScope…
}
```

- The boundary (index 0 middleware) runs each request in an **identity-free**
  context plus a per-request DB pool scope on Cloudflare
  (`AN …/framework-request-handler.ts:289–344`). Its comment states the rule:
  hand-written `/api/*` routes used to answer `getRequestUserEmail()` with
  `AGENT_USER_EMAIL`, "a process-wide ambient identity standing in for the
  caller, which fails open toward more privilege … This store is deliberately
  identity-free: resolving the session here would mean reading cookies on the
  SSR path, which must stay one impersonal cached shell."
- Action routes, after resolving the caller, call
  `runWithRequestContext({ userEmail, orgId, authUserId, authCapability,
timezone, … })` (`AN packages/core/src/server/action-routes.ts:1225–1260`).
  Custom routes must do the same (docs server-routes 141–178).
- Getters fall back to env only **outside** any context:
  `getRequestUserEmail()` returns `AGENT_USER_EMAIL` and logs a warning once if
  a request boundary exists (`AN …/request-context.ts:541–563`);
  `getRequestOrgId()` falls back to `AGENT_ORG_ID` (`:574–581`). This is the
  CLI/script identity path.

### Principle

Identity is ambient but request-scoped, and a missing identity must fail
closed, not borrow the process identity (comment above).

### Changes since 0.206

`request-context.ts` grew by 51 lines: verified-MCP-credential and
MCP-credential-issue-time markers, used to attribute MCP calls in the audit
log and to revoke derived widget grants (git `108b9d9`, 2026-10-19; fields
`mcpCredentialIssuedAtMs`, `markVerifiedMcpCredentialForEvent`,
`AN …/request-context.ts:226–256`). The identity-free boundary itself
predates 0.206.

### Gaps

- `getRequestOrgId()` still falls back to `AGENT_ORG_ID` without the warning
  that guards the email fallback (`AN …/request-context.ts:574–581`)
  **(inference: asymmetry)**.

---

## 4. The SSR rule (today)

### What it is

Every SSR HTML and React Router `.data` response is one anonymous, public,
CDN-cacheable shell; personalisation happens in the browser after load.

### How it works

- Rule text: "Every SSR HTML and React Router `.data` response is one
  impersonal, public shell, hard-cached at the CDN for every visitor. Never add
  `private`, `no-store`, `Vary: Cookie`, session/cookie reads, or auth
  branches to the SSR path — personalization is client-side after load.
  Enforced by `guard:ssr-cache-shell` and `ssr-handler.spec.ts`"
  (`AN AGENTS.md:328–333`).
- `createH3SSRHandler(getBuild)`: returns 404 for framework/asset paths,
  builds `requestForAnonymousSsr(...)` (copies the request, **deletes
  `cookie` and `authorization`**, keeps method and body), and runs React
  Router's handler inside `runWithRequestContext({ userEmail: undefined,
orgId: undefined })` (`AN …/ssr-handler.ts:171–185,516–580`).
- `rewriteMountedResponse` stamps the cache policy, deletes `set-cookie`,
  filters `Vary` down to non-credential values, prefixes base paths, strips the
  document CSP, and injects client config scripts (Sentry, PostHog, realtime,
  app origin). On `/` only, it injects an **auth-redirect script** that reads
  a non-httpOnly `<session cookie>_hint=1` cookie and, if present,
  `location.replace`s to the app home; without it, it probes
  `/_agent-native/auth/session` from the browser
  (`AN …/ssr-handler.ts:332–380,440–515`;
  `AN packages/core/src/shared/ssr-auth-redirect.ts:1–60`).
- Default policy: `cache-control: public, max-age=600,
stale-while-revalidate=604800, stale-if-error=3600`, mirrored on
  `cdn-cache-control`; `netlify-cdn-cache-control: public, durable,
s-maxage=31536000, …`. `AGENT_NATIVE_SSR_CACHE` changes **duration only**,
  deployment-wide (docs ssr-caching 8–39).
- The **auth guard** treats any HTML document request or `.data` read on a
  non-`/api`, non-`/_agent-native` path as public: it may auto-create a local
  dev session, otherwise returns without checking a session. The comment:
  "`createH3SSRHandler` renders both under an explicitly anonymous request
  context … `AppProviders` resolves the browser session and gates private UI
  after hydration." (`AN packages/core/src/server/auth.ts:4296–4326`).
- Consequence for React Router `action`s: a POST to a route reaches the
  handler without cookies, so a route `action` cannot know the user. Templates
  export no route `action`s (earlier note, [`agent-native-open-stack.md`](../agent-native-open-stack.md) §2.2).

### Principle

Cacheability over per-request rendering: "if you need the SSR output to
differ per user, the fix is to move that work client-side, not to disable
caching here" (`AN …/ssr-handler.ts:292–331`). "A per-route or per-request
cache override is how one visitor's payload ends up in another visitor's
shared CDN entry, so the framework does not offer one." (docs ssr-caching 38).

### Changes since 0.206

None: `git diff 1284000..a03f638 -- packages/core/src/server/ssr-handler.ts
security-headers.ts csrf.ts` is empty.

### Gaps

- The session-hint cookie is readable by page JS by design; it only decides a
  redirect, "never decides signed out" (`AN …/ssr-auth-redirect.ts:7–9`).
- The server-middleware doc still says unauthenticated page requests are
  redirected to sign-in (see Docs vs code).

---

## 5. Database layer: driver, ORM, client

### What it is

PostgreSQL only. Drizzle ORM over one of three drivers chosen from the URL,
plus a raw `DbExec` interface.

### How it works

- **URL resolution** (`AN packages/core/src/db/client.ts:102–245`):
  test PGlite URL → `<APP_NAME>_DATABASE_URL` → `DATABASE_URL` →
  `NETLIFY_DATABASE_URL` → fallback `pglite:./data/pglite`. On serverless, a
  Neon host gets `-pooler` inserted; migrations use `*_DATABASE_URL_UNPOOLED`
  and strip `-pooler` (`getMigrationDatabaseUrl`, `:239–245`). `APP_NAME`
  comes from app config `workspaceId || name`.
- **Driver choice** (`AN packages/core/src/db/create-get-db.ts:995–1101`):
  - `pglite:` → `@electric-sql/pglite` + `drizzle-orm/pglite`, one in-process
    client guarded by a process lock file (`AN …/client.ts:477–707`);
  - host matching `/\.neon\.tech([:/?]|$)/` → `@neondatabase/serverless` `Pool`
    (WebSocket) + `drizzle-orm/neon-serverless`; background functions also get
    the HTTP `neon()` client (`AN …/client.ts:1793–1806`);
  - anything else → `postgres` (postgres.js) + `drizzle-orm/postgres-js`
    with `prepare: false` when the URL contains `supabase`
    (`AN …/client.ts:1307–1328`).
- **`createGetDb(schema)`** returns `getDb()`: lazy singleton bound to a shared
  pool, with a Proxy that defers a query chain until the client is ready, and
  a special path that binds to the active PGlite transaction
  (`AN …/create-get-db.ts:999–1190`). Apps export
  `getDb = createGetDb(schema)` from `server/db/index.ts`; the core export is
  untyped (docs server-database 212–225).
- **Raw SQL**: `getDbExec().execute({ sql, args })` converts `?` to `$n`
  (`toPostgresParams`) (docs server-database 476–489).
- **Pool size**: `databasePoolMax()` returns **1 on any serverless runtime**
  and `AGENT_NATIVE_DB_POOL_MAX ?? 20` otherwise; serverless pools also set
  `idle_in_transaction_session_timeout: 30_000`
  (`AN …/client.ts:1307–1348`; `AN packages/core/src/app-config/runtime.ts:8–11`
  doc string: "Serverless runtimes always use one connection").
  `isServerlessRuntime()` = `NETLIFY`, `NETLIFY_FUNCTION_NAME`, `VERCEL`,
  `AWS_LAMBDA_FUNCTION_NAME`, `LAMBDA_TASK_ROOT`, `CF_PAGES` or a Cloudflare
  global (`AN …/client.ts:1196–1206`).
- **Hosted refusal**: a deployed server whose URL resolves to local PGlite
  refuses every DB open with `HostedRuntimeLocalDatabaseError`; the sign-in
  page is replaced by a setup page; release scripts and the embedded desktop
  host are exempt (`AN …/client.ts:1210–1266`).
- **Schema-mutation guard**: in a production serverless request, any
  `CREATE|ALTER|DROP|TRUNCATE|COMMENT|REINDEX|GRANT|REVOKE` throws unless the
  migration runtime is active (`AN …/client.ts:1269–1296`).
- **Sync**: writes bump `sync_version` / append `sync_events`; the client
  `useDbSync()` polls `/_agent-native/poll` (SSE with polling fallback)
  (docs server-database 414–474; tables in the appendix).

### Principle

"Agent-Native does not rely on filesystem watchers or sticky in-memory state …
This works across serverless and multi-instance deployments because the
database is the coordination point." (docs server-database 416–418).
"Keep schemas PostgreSQL-specific." (`AN AGENTS.md:200–206`).

### Changes since 0.206

None material in driver selection (not diffed in full).

### Gaps

- Docs promise pool defaults of 20 / 2 / 4 / 1 and an override "for both Neon
  and standard PostgreSQL clients"; the code uses **1** on every serverless
  runtime and ignores the override there (Docs vs code).
- Every warm function instance owns its own pool; with max 1 per pool, any
  code that holds a connection while awaiting another query on the same pool
  can self-deadlock (`AN packages/core/src/db/pool-self-deadlock.ts` exists for
  that) **(inference)**.

---

## 6. Framework-owned schema: stores, ledger, snapshot

### What it is

Every framework table belongs to a **store** declared with `defineStore({ id,
migrations: [{ name, sql | run, kind?, legacy? }], after?, releaseOnly? })`.
A generated registry lists 74 stores (recounted in editing; the first draft
said 70); a ledger table records applied migrations; a generated snapshot
installs a fresh database in one pass.

### How it works

- **Registry**: `scripts/gen-store-registry.ts` writes
  `store-registry.generated.ts`, an explicit list of `[id, () => import(...)]`
  (74 entries, e.g. `a2a_tasks`, `agent_runs`, `app_secrets`,
  `application_state`, `audit`, `auth_sessions`, `better_auth`,
  `chat_threads`, `mcp_oauth`, `oauth_tokens`, `observability`, `resources`,
  `settings`, `sync_events`, `workspace_connections`, …). "Registration is
  never a module side effect" (`AN packages/core/src/db/store-registry.ts:1–14`;
  `AN packages/core/src/db/store-registry.generated.ts`).
- **Ledger** (`AN …/store-registry.ts:36–50`):

```sql
CREATE TABLE IF NOT EXISTS _an_store_migrations (
  store_id TEXT NOT NULL, name TEXT NOT NULL, applied_at BIGINT NOT NULL,
  checksum TEXT, kind TEXT, source TEXT, core_version TEXT,
  PRIMARY KEY (store_id, name))
```

`source` is `step`, `legacy` (an old `runMigrations` table already recorded
it) or `snapshot`. Checksums hash SQL text only ("`run` bodies are not
hashed because minifiers rewrite them") (`:183–204,397–415`).

- **Readiness modes** decide what `store.ready()` does
  (`AN …/store-registry.ts:153–172,797–882`):

| Mode            | When                                                                      | Effect                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `apply`         | release step (`withMigrationRuntime`), local dev, tests, self-hosted Node | create ledger once; run pending migrations; record each                                                                                    |
| `trust`         | hosted function **and** `appMigratesAtRelease()`                          | nothing — zero schema queries                                                                                                              |
| `hosted-replay` | hosted function, app does **not** migrate at release (**the default**)    | replay idempotent schema migrations (`kind !== "data"`, no legacy entries) inside `withMigrationExecutionRuntime`; never writes the ledger |
| `skip`          | `AGENT_NATIVE_SKIP_ENSURE_TABLES`                                         | nothing                                                                                                                                    |

`appMigratesAtRelease()` = `AGENT_NATIVE_RELEASE_MIGRATIONS` or
`AGENT_NATIVE_BETA_SCHEMA_OWNER=production`
(`AN packages/core/src/db/migration-policy.ts:1–14`;
`AN packages/core/src/app-config/migration.ts:3–20`). Hosted =
`NETLIFY_FUNCTION_NAME`, `AWS_LAMBDA_*`, `VERCEL_FUNCTION_ID`/`VERCEL_REGION`,
a Cloudflare production global (`AN packages/core/src/db/migration-runtime.ts:85–118`).

- **Why only the release step writes the ledger**: "PR previews share the
  production database, and a request's writes can roll back with the caller's
  transaction, so a ledger row written there could claim a migration that
  production never kept." (`AN …/store-registry.ts:153–157`).
- **Release lock**: a lease row in `_an_store_migration_lock` (15-minute
  lease, renewed every 5 min), not `pg_advisory_lock`, because "session locks
  do not survive transaction poolers such as Neon's"
  (`AN …/store-registry.ts:698–795`).
- **Release flow**: `runFrameworkReleaseMigrations()` asserts the target is a
  remote DB when `CONTEXT=production`, takes the lock, runs every store's
  `ready()` in `after`-dependency order, records a database identity, ensures
  sharing indexes, then **verifies** the ledger covers the registry or throws
  `SchemaNotMigratedError` to fail the deploy
  (`AN packages/core/src/server/release-migrations.ts:1–61`;
  `AN packages/core/src/server/release-schema.ts:51–97`).
- **Snapshot install** (Phase 2): on a fresh database (no ledger and none of
  the snapshot's tables), the release step executes
  `schema-snapshot.generated.ts` (167 `CREATE TABLE`s, sequences, indexes) in
  one transaction and records every covered migration with `source =
'snapshot'`; data migrations still run (`AN …/store-registry.ts:517–620`).
- **Better Auth's own tables** are a store too (`better_auth`), folded into the
  ledger (git `e19fce1`).

The **complete table list with columns**, generated from the snapshot, is in
the appendix at the end. Domains (counts approximate):
auth & identity (`user`, `session`, `account`, `verification`, `jwks`,
`twoFactor`, legacy `sessions`, `sso_provider`, 12 `scim_*`,
`identity_*`); orgs (`organizations`, `org_members`, `org_invitations`,
`app_member_roles`, `app_permission_overrides`, `org_scim_memberships`,
`workspace_user_groups`, `service_principal_policies`, plus Better Auth's
unused `organization`/`member`/`invitation`); agent runtime (`agent_runs`,
`agent_run_events`, `agent_execution_leases`, `agent_execution_steps`,
`agent_chat_submission_inbox`, `agent_turn_initiators`, `agent_tool_*`,
`chat_threads`, `observational_memory`, `context_directives`, …); MCP/A2A
(`mcp_oauth_*`, `mcp_connect_tokens`, `mcp_device_codes`,
`mcp_action_approvals`, `a2a_tasks`, `a2a_approvals`); automations
(`automation_runs`, `automation_trigger_event_queue`, `automation_webhook_tokens`,
`automation_scheduler_health`); integrations (24 `integration_*`); state
(`settings`, `application_state`, `resources`, `sync_events`, `sync_version`,
`app_resource_changes`); security (`app_secrets`, `oauth_tokens`,
`agent_audit_log`, `custom_api_providers`); review/comments (14
`agent_review_*`); observability (`agent_trace_*`, `agent_evals`,
`agent_feedback`, `agent_experiment*`, `token_usage`, `usage_alert_*`);
extensions (`tools`, `tool_*`); data programs, search, collab, email log.

### Principle

"Never do heavy work at serverless cold start — migrations, backfills …"
(`AN AGENTS.md:266–271`). The design doc states the goal as "Zero DDL, zero
backfills, and zero per-object probes on any hosted request path. One
schema-related query per process on hosted runtimes, total"
(`AN docs/plans/2026-09-28-store-registry-schema-ownership.md:237–248`), and
measured ~220 statements per cold start before (`:118–135`). "Core framework
tables belong to `defineStore()` migration lists: append, never edit"
(`AN AGENTS.md:282–283`).

### Changes since 0.206

**All of it is new.** At `1284000` there is no `defineStore` and no
`_an_store_migrations` anywhere in `packages/core/src` (`git grep` count 0 at
0.206; 81 files at HEAD). Sequence: store refactor (git `4e49b3a`,
2026-10-15), ledger outside hosted runtimes (`deb1f92`), release-only lists
folded into stores (`429e5fe`), boot-time lists folded (`dd55f83`), Better
Auth migrations folded (`e19fce1`), snapshot install (`bf54dc3`, 2026-10-16).
New tables since 0.206 include `agent_execution_leases`,
`agent_execution_steps` (durable execution, git `41f86eb`) and
`agent_chat_submission_inbox` (not present at 0.206 by `git grep`).

### Gaps

- Framework tables live in `public` with generic names (`settings`,
  `resources`, `notifications`, `tools`, `user`, `session`); an app table of
  the same name collides. The design doc lists namespacing as unscheduled
  future work and notes "A fresh database has about 180 tables"
  (`AN docs/plans/2026-09-28-store-registry-schema-ownership.md:997–1015`).
- "Every app gets every framework table" is also listed as future work
  (`:1051–1062`): there is no opt-out per feature today **(as stated there)**.
- Default hosted apps (no `AGENT_NATIVE_RELEASE_MIGRATIONS` at build time)
  still replay schema DDL per cold start, per store, lazily. The docs say
  managed serverless "skip this boot-time check in production" (see Docs vs
  code).

---

## 7. App migrations (framework vs app)

### What it is

Three app-side mechanisms that coexist with stores: `runMigrations([...],
{ table })`, `runDrizzleMigrations(dir, { table })`, and
`ensureAdditiveColumns({ tables })`.

### How it works

- `runMigrations(entries, { table })` returns a Nitro plugin. Bookkeeping:
  `<table>(version BIGINT PRIMARY KEY)` (gates unnamed entries by
  `MAX(version)`) and `<table>_named(name, version, applied_at)` (gates named
  entries by name). Entries may be `{ version, name?, sql }` or a `run(exec)`
  that can return `MIGRATION_DEFERRED`. It serialises per URL with an
  in-process lock, uses the unpooled migration URL, retries DDL races, and on a
  permission error **halts** remaining migrations with a warning (throws only
  in the migration runtime). In a serverless request of an app that migrates
  at release it skips itself
  (`AN packages/core/src/db/migrations.ts:1–447`).
- Named migrations exist because "if two branches each add their own
  migrations at, say, `version: 4`, whichever branch deploys first 'uses up'
  that version number … and the other branch's DDL silently never runs"
  (docs server-database 315–327).
- `runDrizzleMigrations(new URL("./migrations", import.meta.url), { table })`
  feeds Drizzle Kit's generated `.sql` files into the same runner; Node-only
  (needs a filesystem) (docs server-database 268–301).
- `ensureAdditiveColumns()` diffs each Drizzle table's declared columns
  against `information_schema` after the real migrations and adds missing
  columns only, never touching existing ones, adding `NOT NULL` only with a
  renderable literal default — "belt-and-braces" for forgotten `ADD COLUMN`
  migrations (`AN packages/core/src/db/ensure-additive-columns.ts:1–54`;
  used in `AN templates/tasks/server/plugins/db.ts`).
- **Production**: `pnpm migrate:production` →
  `withMigrationRuntime(async () => { await runFrameworkReleaseMigrations();
await runAppReleaseMigrations(); })`
  (`AN templates/chat/scripts/migrate-production.ts`).
  `runAppReleaseMigrations()` imports `server/plugins/db.ts` and calls its
  default export, **unless a `drizzle.config.{ts,js,json}` exists**, in which
  case it returns `managed-drizzle` and does nothing ("`db:migrate` owns its
  tables") (`AN packages/core/src/server/app-release-migrations.ts:1–46`,
  git `579d66c`). Templates with `drizzle.config.ts` (tasks, forms, mail, …)
  call their own `runXMigrations` explicitly in their script
  (`AN templates/tasks/scripts/migrate-production.ts`).
- Netlify templates run the release step inside the build command when
  `CONTEXT=production` and set `AGENT_NATIVE_RELEASE_MIGRATIONS=1` for
  production so request functions "skip migration probes"
  (`AN templates/chat/netlify.toml`).
- Never `drizzle-kit push` production: framework tables are absent from the
  app schema and would be dropped (docs server-database 329–335; guard
  `no-drizzle-push`).

### Principle

"Schema changes must be additive. Never drop, rename, truncate, or
destructively alter tables or columns in migrations or startup code."
(`AN AGENTS.md:279–281`). "Do not give one schema two independent migration
owners." (docs server-database 303–307).

### Changes since 0.206

`runAppReleaseMigrations` is new (git `579d66c`, 2026-10-16); before it, a
release-owned hosted function skipped the app list and "a starter app's
tables are never created in production" (`AN …/app-release-migrations.ts:16–21`).

### Gaps

- The docs recommend `drizzle.config.ts` **and** re-exporting
  `runDrizzleMigrations` from `server/plugins/db.ts` (docs server-database
  284–297,337–342). An app that follows both and uses the starter
  `migrate-production.ts` gets `managed-drizzle` and its tables are **not**
  migrated at release; nothing in the docs mentions a `db:migrate` script
  **(inference from the two sources)**.
- The docs say framework helpers coordinate async setup but
  "`runMigrations` has no equivalent coordination: nothing blocks an action
  or route from querying the database before `db.ts` finishes" (docs
  server-plugins 172–178). True for local/self-hosted apply mode.

---

## 8. Tenant isolation

### What it is

Row ownership columns plus SQL predicates the application must apply, a
static guard that checks it does, and per-user temporary views for agent SQL.
No RLS, no query rewriting at the ORM layer, no database per tenant.

### How it works

**Columns.** `ownableColumns()` adds
`owner_email TEXT NOT NULL DEFAULT 'local@localhost'`, `org_id TEXT`,
`visibility TEXT NOT NULL DEFAULT 'private'` (`private|org|public`);
`createSharesTable(name)` creates `{ id, resource_id, principal_type
(user|group|org), principal_id, role (viewer|commenter|editor|admin),
created_by, created_at, notified_at }`. Role rank: viewer 1, commenter 2,
editor 3, admin 4, owner 5 (`AN packages/core/src/sharing/schema.ts:3–69`).

**Where the active org comes from.** Not from Better Auth. `getSession()`
resolves the user, then `backfillSessionOrg` asks the org module:
memberships from `org_members ⨝ organizations` (excluding
`federation_removal_pending_at`), the user setting `active-org-id` (stored in
`settings` as `u:<email>:active-org-id`), first membership as fallback; an
explicit `{ orgId: null }` means personal scope
(`AN packages/core/src/server/auth.ts:4748–4758`;
`AN packages/core/src/org/context.ts:615–700`;
`AN packages/core/src/org/active-org.ts:26–38`). If a user has no membership
the framework creates a personal org by default (`AUTO_CREATE_DEFAULT_ORG`)
(docs organizations-teams-permissions 130–136).

**List predicate.** `accessFilter(resourceTable, sharesTable, ctx =
currentAccess(), minRole = "viewer", { includePublic = false })` ORs
(`AN packages/core/src/sharing/access.ts:255–361`):

```ts
lower(owner_email) = :me AND (org_id = :org OR org_id IS NULL)      // owner, in active org or personal
visibility = 'public'                                               // only if includePublic && allowPublic
visibility = 'org' AND org_id = :org AND <membership guard>         // viewer only
EXISTS (shares WHERE resource_id = id AND principal_type='user'  AND lower(principal_id)=:me  AND role ≥ min)
EXISTS (shares WHERE resource_id = id AND principal_type='org'   AND principal_id=:org AND <membership guard> AND role ≥ min)
EXISTS (shares … principal_type='group' … group in this org, caller in group JSON and in org_members)   // if supportsGroupShares
-- no clause matched → `1=0`
```

The membership guard is `1=1` for a normal user, because `ctx.orgId` was
itself derived from membership. For synthetic service identities
(`svc-<name>@service.<orgId>`) it requires a verified service identity whose
org matches, and an org with no federation link (`:98–152`).

**Single-resource check.** `resolveAccess(type, id)` loads the row via the
registry and returns `owner` (owner email + active-org match), `admin`
(`canManageAccess` hook), host-resolver role, public role, org-visibility
viewer (after a live `org_members` check, with cross-app federation
validation for linked orgs), or the highest share role; `assertAccess(type,
id, minRole)` throws `ForbiddenError` (403) below `minRole`
(`AN …/access.ts:596–762,892–928`). Note: `accessFilter` hides public rows
from lists, but `resolveAccess` grants them by direct id — "reachable by
direct link, but it does not show up in other users' … lists" (docs sharing 28).

**Registration.** `registerShareableResource({ type, resourceTable,
sharesTable, displayName, getDb, allowPublic?, requireOrgMemberForUserShares?,
supportsGroupShares?, ownerAccessIgnoresOrg?, resolveAccessContext?,
canManageAccess?, agentReadable?, … })` (`AN packages/core/src/sharing/registry.ts:11–207`).
`allowPublic: false` + `requireOrgMemberForUserShares: true` is the hardening
pair for code-executing resources (extensions, data programs)
(docs sharing 338–357; `AN packages/core/src/data-programs/store.ts:89–96`).

**Declarative action access.** `defineAction({ access: { scope: "resource",
resource: { type, idFrom, level } } })` runs the same resolution before
`run()` on every surface; order is `validate input -> access -> authorize ->
run -> validate output -> audit` (docs actions-access-control 264–345;
`AN packages/core/src/authorization/check-action.ts`).

**Static guard.** `no-unscoped-queries` scans `actions/` and `server/` for
statements touching a table that spreads `...ownableColumns()` without
`accessFilter`/`resolveAccess`/`assertAccess` or an explicit
`ownerEmail`/`userEmail`/`orgId` filter in the enclosing block; opt-out comment
`// guard:allow-unscoped — reason` (`AN packages/core/src/guards/no-unscoped-queries.ts:1–60`).
It runs in `pnpm guards`, `agent-native doctor`, and as a hard pre-step of
`agent-native build` (docs doctor 50–69,118–124).

**Other scoping conventions.** Core KV tables scope by key prefix:
`settings.key` = `u:<email>:<key>` (user) or `o:<orgId>:<key>` (org)
(`AN packages/core/src/settings/org-settings.ts:13`;
`AN packages/core/src/scripts/db/scoping.ts:5`).

**Per-database, not per-org.** A workspace can point an app at its own
database with `<APP_NAME>_DATABASE_URL`; there is no per-tenant database
(docs deployment 78–79; `AN …/client.ts:102–113`).

### Principle

"Hiding a button in React is useful UX, but it is not authorization. The
server-side action or access guard must enforce the rule." (docs
organizations-teams-permissions 38–40). "PostgreSQL row-level security (RLS)
is not currently part of the framework enforcement path. It is planned as
post-1.0 hardening." (docs multi-tenancy 130–132; same in docs
administered-deployments 145–151).

### Changes since 0.206

Not diffed in detail; `sharing/` and `org/` changed in several commits
(e.g. git `e48e8b5` org member tools, `c3e3063`).

### Gaps

- Correctness depends on every query using the helpers. The guard is a regex
  scan of the enclosing block, so a filter on an unrelated `orgId` in the
  same block satisfies it **(inference from the pattern list at
  `AN …/no-unscoped-queries.ts:33–60`)**.
- Identity is the **email string**. "This email-based model is not an
  immutable cross-provider principal ID. Principal-ID migration remains a
  post-1.0 design item." (docs administered-deployments 86). An `identity rekey` command rewrites every registered
  identity column (`AN packages/core/src/identity/rekey.ts`; guard
  `identity-columns-registered`).
- `owner_email` defaults to `'local@localhost'`, so an insert that forgets the
  owner lands in a sentinel tenant; the guard `no-localhost-fallback` and the
  db-script refusal exist because of it (`AN …/sharing/schema.ts:5`;
  `AN …/scripts/db/scoping.ts:19–41`).

---

## 9. The agent's SQL sandbox (`agent-sql` + `scripts/db`)

### What it is

Framework tools `db-schema`, `db-query` (default) and, when enabled,
`db-exec` and `db-patch`, which let the model run raw SQL against the app's
own database, confined to the caller's rows.

### How it works

- **Exposure.** `frameworkTools.database` (`"read"` default, `"write"`/`true`,
  `"off"`/`false`) → `normalizeDatabaseToolsMode`; `"minimal"` preset turns it
  off (`AN packages/core/src/scripts/db/tool-mode.ts:1–23`;
  `AN packages/core/src/framework-tools.ts:117–180`). Tools are CLI scripts
  wrapped as action entries and run in-process
  (`AN packages/core/src/server/agent-chat/script-entries.ts:51–200`). The tool
  description tells the model results are "auto-scoped to the current
  user/org" and to never use it for users, roles or ownership.
- **Per-call flow (`db-query`)** (`AN packages/core/src/scripts/db/query.ts:92–139`):
  1. `readRawDbReadStatement(sql)`: lex with the agent-SQL lexer, exactly one
     statement, keyword `select|with|explain`, token policy, no sensitive
     framework table names;
  2. optional `LIMIT`; `finalRawDbSql` converts `?`→`$n` and **re-reads** the
     final text so guards see what executes;
  3. open a **new** Postgres client, `BEGIN`;
  4. `buildScopingPostgres()`: read `information_schema.columns` for
     `public`, then `CREATE OR REPLACE TEMPORARY VIEW "<t>" AS SELECT * FROM
public."<t>" WHERE <predicate> WITH LOCAL CHECK OPTION` for **every**
     public table;
  5. `SET TRANSACTION READ ONLY`;
  6. `verifyRawDbStatement`: inside the transaction, every referenced relation
     must resolve to `pg_my_temp_schema()`; no app-defined functions,
     operators or types; `standard_conforming_strings` must be on;
  7. execute with `singleStatement: true`; always roll back.
- **View predicates** (`AN packages/core/src/scripts/db/scoping.ts:1–180`):

| Table shape                 | Predicate                                                           |
| --------------------------- | ------------------------------------------------------------------- |
| `settings`                  | `key LIKE 'u:<email>:%' AND key NOT LIKE 'u:<email>:credential:%'`  |
| `application_state`         | `session_id = '<email>'`                                            |
| `oauth_tokens`, `resources` | `owner = '<email>'`                                                 |
| `sessions`                  | `email = '<email>'`                                                 |
| `tool_data`                 | `(scope='user' AND owner_email=me) OR (scope='org' AND org_id=org)` |
| has `owner_email`           | `owner_email = me` `[AND (org_id = org OR org_id IS NULL)]`         |
| has only `org_id`           | `org_id = org` (or `1 = 0` without an org)                          |
| neither                     | `1 = 0`                                                             |

Values are escaped literals; the identity comes from `getRequestUserEmail()`
and the script **refuses** without one or with `local@localhost`.

- **Token policy** (`AN packages/core/src/agent-sql/postgres.ts:96–175`):
  denies identifiers matching `^pg_` (except `pg_typeof`, `pg_column_size`,
  `pg_size_pretty`), `^lo_`, `^dblink`, `_to_xml`, `set_config`,
  `current_setting`, sequence functions, `ts_stat`, `ts_rewrite`,
  `json(b)_populate_record*`, `*_in/_recv`; identifiers over 63 bytes;
  any schema-qualified name in `public|main|pg_catalog|information_schema|pg_temp*|…`
  ("bypass the per-user data scoping").
- **Sensitive tables** are refused by name for read and write: `app_secrets`,
  `oauth_tokens`, `mcp_oauth_*`, `mcp_connect_tokens`, `mcp_device_codes`,
  `user(s)`, `session(s)`, `chat_threads`, `account(s)`, `verification`,
  `jwks`, `organization`, `member`, `invitation`, `org_members`,
  `org_invitations`, catalogs (`AN packages/core/src/scripts/db/safety.ts:58–119`).
- **Writes (`db-exec`)**: only `INSERT|UPDATE|DELETE` (no `CREATE/ALTER`,
  `DROP`, `TRUNCATE`, `GRANT`); no writes to access-control-named tables or
  columns (`role`, `owner_email`, `permissions`, `admin`, …); an `INSERT`
  without a column list into a table with such a column is refused;
  `owner_email`/`org_id` are **injected** into `INSERT … (cols) VALUES (…)`
  when absent; batches run in one transaction; the `WITH LOCAL CHECK OPTION`
  views reject rows that would land outside the caller's scope
  (`AN packages/core/src/scripts/db/exec.ts:80–262`; `AN …/safety.ts:145–598`).
- **Reuse**: `@agent-native/core/agent-sql` exports the lexer, statement
  reader, policy checks, and `readAgentSqlQuery()` /
  `rewriteAgentSqlQuerySources()` for apps building their own guarded SQL
  surfaces (`AN packages/core/src/agent-sql/index.ts:1–35`; docs security 247).

### Principle

Scope at the database, not in the prompt: "Agent SQL never touches base
tables directly — it reads through a temporary view scoped to the current
identity" (docs security 159). Hide secrets even
from the owner: credential rows are excluded as "defense-in-depth: it removes
a prompt-injection exfiltration channel (read own secret → send to attacker
URL)" (`AN …/scoping.ts:114–123`).

### Changes since 0.206

`db-query`, `db-exec` and `db-patch` now run every statement of the
transaction under one shared deadline: `withPostgresStatementDeadline()`
issues `SET LOCAL statement_timeout = <remaining ms>` before each statement
and fails the transaction once the budget is spent (git `de17c2f`,
2026-10-19; `AN packages/core/src/scripts/db/postgres-client.ts:30–55`).
Before, view setup and the query ran without a per-transaction deadline. The
`agent-sql/` lexer and policy files are unchanged since 0.206 (`git diff
--stat` lists none).

### Gaps

- The views expose only rows the caller **owns** (plus org-only tables). Rows
  shared with the caller, or `visibility='org'` rows owned by teammates, are
  invisible to raw SQL even though the UI shows them **(inference from the
  predicates)**. Docs describe the view as `WHERE owner_email = ? AND org_id
= ?`; the code also admits `org_id IS NULL`.
- Each call opens a fresh connection and creates one temp view per public
  table (~180 on a standard database) **(inference: cost per tool call)**.
- The DB tools are wrapped CLI scripts, not `defineAction`s; I did not find
  evidence they pass through the audit-log seam (Not verified).
- "reviewed schema defaults, constraints, triggers, casts and type I/O remain
  trusted database behavior" (docs security 247): a trigger on an app table
  runs with full privileges.

---

## 10. Authentication

### What it is

Better Auth 1.7.6 for browser sessions, a legacy framework session table,
several bearer-token kinds, and an optional custom `getSession`.

### How it works

**Better Auth configuration** (`AN packages/core/src/server/better-auth-instance.ts`):

- Drizzle adapter on the shared DB (`:2742–2795`).
- `session.expiresIn = sessionMaxAge ?? 30 days`, `updateAge` ≤ 1 day,
  `cookieCache` 5 min (`:2603–2612`).
- Cookies: `cookiePrefix` per app namespace; over HTTPS
  `sameSite: "none", secure: true, partitioned: true`; cross-subdomain only
  with an effective `COOKIE_DOMAIN` (`:2613–2639`).
- Plugins: `magicLink` (5-minute links), `jwt` (issuer = app URL,
  `expirationTime: "15m"`, JWKS rotation recovery), `bearer`, `twoFactor`
  (passwordless allowed, lockout), optional `sso` and `scim` from optional
  peers when `AUTH_SSO`/`AUTH_SCIM` are on **at build and runtime**, then app
  `plugins` (`:2125–2200,2640–2690`). **No `organization` plugin and no
  passkey plugin** (0 matches for `passkey`).
- Hooks: Google account tokens are mirrored into `oauth_tokens`; sign-up
  admission (invite-only policy), domain auto-join (`:2560–2600`).
- Secret: `BETTER_AUTH_SECRET` → hosted-workspace secret derived from
  `A2A_SECRET` → `.env.local` → in dev only, a random secret persisted at
  `.agent-native/dev-auth-secret` (0600). In production a missing secret
  **fails the boot** (`:570–640`).

**Session resolution** — `getSession(event)` is cached per event and calls
`resolveSessionUncached` in this order
(`AN packages/core/src/server/auth.ts:4760–4895`):

1. embed session (iframe/MCP App ticket), unless it is a capability-only scope;
2. if `ACCESS_TOKEN(S)` are configured, the legacy framework session cookie;
3. custom `getSession` (BYOA) — with bearer and desktop SSO as fallbacks;
   otherwise:
4. bearer: legacy `sessions`-table token, or on **action routes only** a
   verified MCP OAuth/connect JWT (`getMcpOAuthBearerSession`, audience-bound
   to `{appUrl}/mcp`) (`:1171–1310`);
5. Better Auth `api.getSession` (cookie);
6. legacy cookie session (`sessions` table: `token, email, created_at`);
7. desktop SSO broker (Electron UA + loopback + non-production only);
8. `?_session=<token>` query param, which is **promoted to a cookie**
   (`:4912–4925`);
9. `AUTH_DISABLED` shared user `dev@local.test`.
   Then `backfillSessionOrg` adds `orgId` (section 8). The result:

```ts
interface AuthSession {
  email: string;
  userId?;
  authUserId?;
  token?;
  name?;
  image?;
  emailVerified?: boolean;
  orgId?: string;
  orgRole?: string;
} // auth.ts:367–377
```

**The auth guard** (`runAuthGuard` → `createAuthGuardFn`,
`AN …/auth.ts:3095–3100,3897–4380`) applies CORS (allowlist via
`CORS_ALLOWED_ORIGINS`; ChatGPT origins for the MCP directory route), then
exempts: Better Auth and Google OAuth routes, `/open`, embed start, inbound
webhooks, `/automations/webhook/<token>`, self-dispatch processors
(`/integrations/process-task`, `/jobs/_process-sweep`,
`/agent-chat/_process-run`, `/agent-teams/_process-run`,
`/sandbox/_process-execution`, `/a2a/_process-task`), `/a2a`, MCP protocol and
OAuth endpoints, remote-device relay routes, identity SSO entry points,
static assets, health/ping, and configured `publicPaths`. **Page requests
pass** (section 4). Everything else under `/api/*` or `/_agent-native/*`
needs a session or gets `401 {"error":"Unauthorized"}`; with a session, a
workspace-app access check can 403/503.

**Other credentials** (verified elsewhere, not by the guard):

- **MCP OAuth 2.1** — the app is its own authorization server, implemented in
  core (`mcp_oauth_clients`, `mcp_oauth_codes`, `mcp_oauth_refresh_tokens`),
  not Better Auth's MCP plugin. Dynamic client registration (rate-limited to
  60/min), PKCE, `grant_types` `authorization_code` + `refresh_token`. Access
  tokens are JWTs signed with `A2A_SECRET` or `BETTER_AUTH_SECRET`,
  audience-bound to the resource URL, TTL **30 days** by default
  (`MCP_OAUTH_ACCESS_TOKEN_TTL`). Refresh tokens are stored hashed, **not
  rotated** (the same token is returned), re-check org membership on refresh
  and revoke on `not-member`
  (`AN packages/core/src/mcp/oauth-store.ts:36–63`;
  `AN packages/core/src/mcp/oauth-route.ts:400–460,1200–1295`;
  docs authentication 301–379).
- **Connect tokens** — personal (365 days default via device flow) or **org
  service tokens** for `svc-<name>@service.<orgId>` (1–3650 days), JWTs with a
  revocable `jti` (`mcp_connect_tokens`) (docs http-api 34–63,222–229).
- **A2A** — JWT signed with `A2A_SECRET` (or a per-org secret in
  `organizations.a2a_secret`); `sub` becomes the request identity; without
  `A2A_SECRET` in production A2A endpoints return 503 (docs security 340–353).
- **Internal handoff tokens** — `HMAC-SHA256(A2A_SECRET, "<taskId>:<ts>")`,
  5-minute max age, 60 s future skew, timing-safe compare
  (`AN packages/core/src/integrations/internal-token.ts:1–71`).
- **Static `ACCESS_TOKEN(S)`** — bearer fallback for MCP clients that cannot do
  OAuth; "not browser auth" (docs authentication 287–299).
- **Vercel cron** — `CRON_SECRET` bearer on the sweep route
  (`AN packages/core/src/server/agent-chat/sweep-trigger-auth.ts`).

**Cookie realm** per deployment shape: per-app slug, one shared realm in
workspace mode, `COOKIE_DOMAIN` opt-in, first-party hosted apps isolated and
federated through Dispatch ("Cross-App SSO") (docs authentication 155–173).

**Local dev**: no bypass, but an auto-created real Better Auth account
`dev@local.test` with a random password on loopback in development/test
(docs authentication 92–128; `AN …/auth.ts:4378–4430`).

### Principle

"The browser flow is the same Better Auth flow everywhere — there is **no
dev auth bypass**, and `getSession()` never falls back to a `local@localhost`
sentinel. What changes between environments is signup friction, not the login
wall" (docs authentication 92). Credentials that are present but invalid are a
hard reject, not a fall-through: "THROW to hard-reject … so a valid
same-origin session cookie can't be used to execute the request as the
logged-in user" (`AN packages/core/src/server/action-routes.ts:351–371`).

### Changes since 0.206

Better Auth migrations moved into the store ledger (git `e19fce1`). MCP
audit attribution and output schemas changed (git `d0f6950`, `108b9d9`,
`fab1c27`). Not diffed further.

### Gaps

- Two parallel session stores (Better Auth `session` and framework
  `sessions`), and a `?_session=` URL token path, increase the surface
  **(inference)**.
- MCP access tokens live 30 days by default; revocation of a removed member is
  by live membership checks, not token expiry (docs authentication 372).
- We noted security-relevant gaps in this area; they are recorded separately
  in a private note.

---

## 11. Request-level security controls

### What it is

CSRF middleware, CORS, security headers, SSRF guard, webhook verification.

### How it works

- **CSRF** (`AN packages/core/src/server/csrf.ts:1–197`): for
  `POST|PUT|PATCH|DELETE` to `/_agent-native/*` or `/mcp` (base-path aware),
  if the request carries **any** cookie and is not on the allowlist, require
  one first-party marker: `Sec-Fetch-Site: same-origin|none`, an
  `X-Agent-Native-CSRF` header, or `Content-Type: application/json`;
  otherwise 403. Allowlist: `/integrations/` (except `/integrations/remote/`),
  `/agent-teams/`, `/sandbox/_process-execution`, `/a2a`, `/auth/`,
  `/billing/webhook`, `/share/`, `/oauth/`, `/builder/callback`, and valid
  automation webhook tokens. The rationale is explicit: the session cookie is
  "configured with `SameSite=None; Secure; Partitioned` so the iframe editor
  (and other cross-site embeds) can authenticate".
- **Security headers** on framework responses: HSTS (https only), `nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, a Permissions-Policy
  allowing camera/microphone, COOP `same-origin-allow-popups`, CORP
  `same-site`; COEP only for validated MCP embed loads; **no
  `X-Frame-Options`** because apps run inside iframe hosts
  (`AN packages/core/src/server/security-headers.ts:1–58`).
- **SSRF**: `ssrfSafeFetch()` blocks private/metadata targets, re-checks the
  resolved IP at connect time, re-validates every redirect (docs security 135–145).
- **Inbound webhooks**: Slack HMAC, Teams Bot Framework JWT, Discord Ed25519,
  Telegram secret token, WhatsApp signature, email Svix/basic-auth; a missing
  secret **refuses** in production unless
  `AGENT_NATIVE_ALLOW_UNVERIFIED_WEBHOOKS=1`
  (`AN packages/core/src/integrations/adapters/email.ts:369–391`; docs
  security 355–359).

### Principle

"Defense-in-depth CSRF check … We need a server-side check that proves
first-party intent before running the action." (`AN …/csrf.ts:33–37`).

### Gaps

- We noted security-relevant gaps in this area; they are recorded separately
  in a private note.

---

## 12. Organizations, roles, service principals

### What it is

The framework's own org module (not Better Auth's), with three role systems:
org role, app role, resource role.

### How it works

- Tables: `organizations(id, name, created_by, created_at, allowed_domain,
a2a_secret, workspace_url, required_auth_provider, identity_authority,
identity_id, icon_json, icon_revision, federation_roster_initialized_at)`,
  `org_members(id, org_id, email, role, joined_at,
federation_removal_pending_at)`, `org_invitations`, `app_member_roles`,
  `app_permission_overrides`, `org_scim_memberships`
  (`AN packages/core/src/org/schema.ts:10–80`).
- Org roles `owner|admin|member` with helpers `orgRoleAtLeast`,
  `canInviteOrgMembers`, `canManageOrg` (docs organizations-teams-permissions
  138–165). App roles: `defineAppRoles({ appId, roles, defaultRole,
permissions })` → `requireAny(...)`, `requirePermission(...)`; unordered
  sets, `defaultRole` is display only, membership and assignment resolved in
  one statement, a failed lookup throws (docs organizations-teams-permissions
  168–330).
- **Service principals**: org service tokens authenticate as
  `svc-<name>@service.<orgId>`, are never inserted into `org_members`, and
  get an **implicit `member` role** only when the signed `org_id` claim
  matches the request org (`AN packages/core/src/org/service-identity.ts:1–60`).
  `service_principal_policies(org_id, service_name, owner_email, team,
risk_tier, purpose, lifecycle active|suspended|retired, allowed_actions …)`
  governs them: no row = legacy "ungoverned", an unreadable row → 503 (fail
  closed), a list of `allowedActions` is deny-by-default with trailing-`*`
  prefixes (`AN packages/core/src/org/service-principal-policy.ts:1–60`;
  `AN packages/core/src/org/service-principal-guard.ts:1–50`; docs http-api 245–262).
- Administered deployments: `AUTH_SIGNUP=invited`, `ORG_CREATION=closed`,
  `AUTO_CREATE_DEFAULT_ORG=0`, `AUTH_BOOTSTRAP_ADMINS`, SSO/SCIM flags (docs
  administered-deployments 17–24).

### Principle

"An organization is the team boundary for application data. A workspace is a
deployment and customization concept" (docs organizations-teams-permissions
18–20). "One org per workspace is the intended pattern" because "vault
credentials are per-organization, so a second org orphans every key synced
under the first" (`AN AGENTS.md:308–312`; `AN …/org/active-org.ts:8–21`).

### Gaps

- Better Auth's `organization`, `member`, `invitation` tables are still
  created (`AN packages/core/src/server/better-auth-migrations.ts:107–135`) and
  `session.active_organization_id` exists, but the plugin is "intentionally
  not registered" (docs authentication 276–278). Dead schema **(inference)**.

---

## 13. Secrets and credentials

### What it is

Encrypted storage for per-user/per-org provider keys (`settings` rows
`u:<email>:credential:<KEY>`), the shared vault `app_secrets`, provider OAuth
tokens `oauth_tokens`, and ad-hoc automation keys.

### How it works

- AES-256-GCM, values tagged `v1:<iv>:<ct>:<tag>`. App-local key:
  `<APP_NAME>_SECRETS_ENCRYPTION_KEY` → `SECRETS_ENCRYPTION_KEY` →
  `BETTER_AUTH_SECRET`. Workspace vault: `WORKSPACE_SECRETS_ENCRYPTION_KEY` →
  legacy `SECRETS_ENCRYPTION_KEY` → derived from `A2A_SECRET` → compatibility
  candidates; `_PREVIOUS` for rotation; production refuses to start without key
  material (`AN packages/core/src/secrets/crypto.ts:1–30`; docs security 315–325).
- `app_secrets(id, scope, scope_id, key, encrypted_value,
shared_encrypted_value, description, url_allowlist, …)`. `${keys.NAME}`
  placeholders are resolved server-side after the model emits a tool call;
  an API-created key can carry an origin allowlist (docs automations 313–320).
- `resolveCredential(key, { userEmail, orgId })` searches one org; the guard
  `no-unscoped-credentials` rejects the one-argument form, and
  `no-env-credentials` rejects `process.env` reads outside an allowlist
  (`AN AGENTS.md:301–307`; docs doctor 60–69).
- **Deployment LLM keys**: `readDeployCredentialEnv()` lets
  `ANTHROPIC_API_KEY` and peers fall back app-wide on standalone deployments
  (local DB or not a hosted workspace), but not for synthetic or anonymous
  runs, and not on hosted workspaces in production
  (`AN packages/core/src/server/credential-provider.ts:160–267`).

### Changes since 0.206

The LLM-key fallback policy changed in git `7f11f95` (2026-10-11, inside a PR
titled "Add a Get started landing page to the Chat template"; sub-commits
"fix: share deployment LLM key fallback", "fix: guard deployment provider
credential scope"). Before: "In multi-tenant deploys, the framework refuses
to fall back to this when the user has no per-user key". After: "Any
signed-in user without a scoped key can use the deployment account across
organizations, and usage is billed to that account" (docs
deployment-environment-variables 65, before/after).

### Gaps

- We noted security-relevant gaps in this area; they are recorded separately
  in a private note.

---

## 14. Audit log

### What it is

One row in `agent_audit_log` per mutating action call, captured in the
`defineAction` wrapper.

### How it works

- Columns: `id, created_at, action, caller (tool|frontend|http|cli|mcp|webmcp|a2a),
actor_kind (agent|human|system|service), actor_email, org_id, thread_id,
turn_id, target_type, target_id, status (success|error|denied), summary,
input (redacted), error_code, owner_email, visibility, run_id, task_id,
parent_task_id, source_*, network_*, app, reported_client_name/version,
oauth_client_id, approval` (appendix; docs audit-log 24–148).
- Inputs are redacted for credential-shaped keys/values; reads
  (`list-audit-events`, `get-audit-event`, `export-audit-events`) are scoped
  in SQL; OCSF 1.9.0 export for owners/admins; retention purge
  (`AGENT_NATIVE_AUDIT_RETENTION_DAYS`, default 365) (docs audit-log 186–233).
- Write path: `recordActionAudit` builds the event and inserts it
  (`AN packages/core/src/audit/record.ts:200–273`).

### Principle

"An audit log that's sampled or shipped off to an analytics provider is
useless — the whole point is that it's complete, local, and queryable"
(docs audit-log 22).

### Changes since 0.206

MCP client name/version, OAuth client id and an approval signal per row
(git `d0f6950`, `108b9d9`; docs audit-log +41 lines).

### Gaps

- We noted security-relevant gaps in this area; they are recorded separately
  in a private note.

---

## 15. Automations and recurring jobs without a long-lived process

### What it is

"An automation is an agent-executed task that fires on a schedule, when an
event occurs, or when a webhook is called" (docs automations 8–13). All three
share one background runner.

### How it works

**Storage.** An automation is a Markdown resource `jobs/<name>.md` in the
`resources` table (per owner, or an org owner), with YAML frontmatter:
`schedule`, `enabled`, `runAs`, `createdBy`, `orgId`, `model`, `mcpTools`,
`triggerType (schedule|event|webhook)`, `event`, `condition`, and
scheduler-managed `lastRun/lastStatus/lastError/nextRun` (docs
recurring-jobs 64–80; docs automations 159–175; `AN packages/core/src/automations/service.ts:1–40`).
Run history is `automation_runs`.

**Scheduler tick** — `processRecurringJobs(deps)`
(`AN packages/core/src/jobs/scheduler.ts:183–420`):

1. acquire a scheduler **lease** row (`automation_scheduler_health.lease_owner /
lease_expires_at`), renewed on an interval; abort if lost;
2. clean upload receipts; `reapStaleWork()` closes stale automation runs and
   A2A tasks;
3. record scheduler health;
4. `resourceListAllOwners("jobs/")`, parse every job, keep this app's jobs;
5. settle or resume jobs whose `lastStatus` is `running`; collect due jobs by
   `nextRun`; dispatch them through the shared background runner (identity
   checks: creator still exists and is still a member for org jobs); write
   frontmatter outcome and recompute `nextRun`.

**What fires the tick** (docs recurring-jobs 157–176; per-host docs):

| Host                                    | Trigger                                                                                                                                                                                                         | Notes                                                                                                                                 |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Long-running Node/Docker/Fly/Render/VPS | in-process timer, every 60 s, 10 s after boot                                                                                                                                                                   | off in dev/test or localhost URLs unless `AGENT_NATIVE_ENABLE_LOCAL_RECURRING_JOBS=1`                                                 |
| Netlify                                 | build emits a **scheduled function** (`* * * * *`) that POSTs, with an HMAC token, to the build-emitted **background function** `server-agent-background`, which routes to `/_agent-native/jobs/_process-sweep` | published deploys only; needs `A2A_SECRET` (`AN packages/core/src/deploy/build.ts:3960–4044,4046–4150`)                               |
| Vercel                                  | build adds a Vercel **cron** to `/_agent-native/jobs/_process-sweep`                                                                                                                                            | production only; `CRON_SECRET`; Hobby = once a day; job cut at function max duration (`AN …/build.ts:3720–3836`; docs vercel 202–230) |
| Cloudflare Workers                      | build adds a `* * * * *` **Cron Trigger** to `wrangler.json`; the `scheduled` handler calls the sweep with an `A2A_SECRET` HMAC token                                                                           | Paid plan for CPU; up to 15 min to start firing (`AN …/build.ts:484–560,760–772`; docs cloudflare 209–235)                            |
| AWS Lambda                              | **nothing**                                                                                                                                                                                                     | "Scheduled automations don't fire"                                                                                                    |

The same tick drains the event-trigger queue, cleans up cut-off runs and runs
app sweeps (e.g. Mail snooze). "A warm instance doesn't run schedules"
(docs recurring-jobs 242).

**Event triggers.** Integrations `registerEvent({ name, payloadSchema })` and
`emit(name, payload, { owner, … })`. `handleEvent` finds enabled automations
for that event name and app, and **enqueues** one row per match in
`automation_trigger_event_queue` (unique on `(trigger_id, event_id)`,
`status`, `attempts`, `failure_attempts`, `available_at`, `claimed_at`,
claim lease = 1.5 × background-run hard timeout, max 8 failures). On a
long-running server it drains immediately in-process; on production serverless
it only enqueues and the next sweep drains
(`AN packages/core/src/triggers/dispatcher.ts:897–1007`;
`AN packages/core/src/triggers/event-queue.ts:1–80`). Event automations
match only events emitted for their `createdBy` identity (docs automations 178–190).

**Conditions** are a yes/no model call on the payload (truncated to 4000
chars), cached 5 min (500 entries); an unevaluable condition never runs the
automation; three missing-key errors in a row pause an event automation
(docs automations 251–261; `AN packages/core/src/triggers/condition-evaluator.ts`).

**Webhook triggers** get `/_agent-native/automations/webhook/<token>` (token
hashed in `automation_webhook_tokens`), 64 KB payload, dedupe by
`X-Webhook-Event-Id` / `X-Event-Id` / `X-GitHub-Delivery` / JSON `id`,
answer `202` and run in the background; they and **Run now** dispatch on their
own, so they work on hosts without a trigger (docs automations 77–89;
docs recurring-jobs 170–176).

**Self-dispatch ("fresh execution").** `fireInternalDispatch({ path, taskId,
body })` POSTs to the deployment's own URL
(`AGENT_NATIVE_SELF_DISPATCH_URL` → `DEPLOY_PRIME_URL` → `DEPLOY_URL` → `URL`
→ app URL; throws in production without one) with
`Authorization: Bearer <HMAC(A2A_SECRET, taskId:ts)>`, races a 250 ms settle
timer so the request leaves the box before it freezes, or awaits the response
when chaining from a finishing function ("the Lambda freezes and a
still-in-flight dispatch fetch is killed WITHOUT rejecting")
(`AN packages/core/src/server/self-dispatch.ts:32–242`).

**`runInBackground(work, waitUntil)`** hands best-effort work to the
platform's `waitUntil` (Cloudflare, Netlify's invocation context) or awaits it
for at most 250 ms (`AN packages/core/src/server/background-work.ts:1–58`).
In-process backstop sweeps are disabled on production serverless
(`AN packages/core/src/server/sweep-runtime.ts:1–41`).

### Principle

"Serverless functions freeze the moment the response is sent … The only way
to keep an agent loop alive is to start a **new** function execution for it"
and "The SQL-queue + self-webhook + retry-job combination is the only thing
that works identically on every supported host" (docs messaging-internals
137–148). "Agent runs do not depend on the function that started them staying
alive. Each run is tracked in your database" (docs deployment 27–35).

### Changes since 0.206

Docs added the durable-agents section to deployment (+10 lines); durable
execution survives worker restarts (git `41f86eb`, new tables
`agent_execution_leases` / `agent_execution_steps`); job edits no longer
revert in-flight run state (git `6ed8f2b`). The host trigger table already
existed at 0.206 (`git show 1284000:…/recurring-jobs.mdx` lines 164–167).

### Gaps

- Every tick reads and parses **all** `jobs/*.md` resources across all owners
  (a 60 s in-memory "no jobs" cache aside) **(inference from
  `AN …/scheduler.ts:286–300`)**.
- Vercel Hobby: daily sweep means event automations wait up to a day.
- The framework itself now uses a Netlify Background Function for durable
  runs and sweeps, while the messaging doc says "Do NOT use … Netlify
  Background Functions" (Docs vs code).

---

## 16. Messaging and inbound integrations (pipeline only)

1. Platform POSTs `/_agent-native/integrations/<platform>/webhook`; handler
   verifies the signature, parses an `IncomingMessage`, inserts
   `integration_pending_tasks` (dedupe unique on `(platform,
external_event_key)`), self-dispatches `/process-task`, returns 200 within
   Slack's 3 s SLA.
2. The processor claims `pending → processing`, runs the agent loop, posts the
   reply via the adapter, marks `completed`.
3. A 60 s retry job re-fires tasks stuck `pending` > 90 s or `processing` >
   75 s on serverless (> 5 min elsewhere), 3 attempts max.
   (docs messaging-internals 17–24,329–334). External threads map to internal
   chat threads (`integration_thread_mappings`); users link by email
   (`integration_identity_links`). Adapters implement `PlatformAdapter`
   (`verifyWebhook`, `parseIncomingMessage`, `formatAgentResponse`,
   `sendResponse`, `getStatus`) (docs messaging-internals 215–311).
   Workflow connectors (n8n; Zapier blueprint-only) invoke a configured workflow
   by ID with static origins, and accept callbacks with a durable idempotency
   claim plus a queue handoff (docs automation-connectors 89–118).

---

## 17. Data programs and file uploads (data-adjacent primitives)

- **Data programs**: stored agent-authored JS (`data_programs`) run in the
  same `executeSandboxCode` sandbox as `run-code`, calling `emit(rows,
schema)` once; results cached in `data_program_runs` per `(program, params
hash ⊕ viewer ⊕ org)`; caps 10,000 rows / 4 MiB / 200 programs / TTL ≥ 60 s;
  `background: true` serves stale and enqueues a 10-minute durable execution;
  provider credentials are always the **viewer's**; registered with
  `allowPublic: false` (docs data-programs 15–228;
  `AN packages/core/src/data-programs/execute.ts:167–179`;
  `AN packages/core/src/data-programs/store.ts:89–96`).
- **File uploads**: `POST /_agent-native/file-upload` → first configured
  provider (`registerFileUploadProvider`, built-in S3-compatible, or Builder.io
  hosting); 25 MB, blocked executable MIME types; **no provider = 503 and no
  binary in SQL** (docs file-uploads 8–125). Rule: "Do not store large raw
  payloads … in SQL tables" (`AN AGENTS.md:284–289`).

---

## 18. Observability and tracking (briefly)

- **Observability** stores agent quality data in the app DB:
  `agent_trace_spans`, `agent_trace_summaries`, `agent_evals`,
  `agent_feedback`, `agent_satisfaction_scores`, `agent_experiment*`; prompt,
  tool-argument and tool-result capture are **off** by default; routes under
  `/_agent-native/observability/*`; dashboards scoped to the signed-in user
  ("there is no cross-user admin view today") (docs observability 24–118,265–315).
  OTel providers are flushed from the response hook on serverless, bounded by
  a shared 2 s timeout or handed to `waitUntil` (docs observability 478–486).
- **Tracking** is product analytics fan-out (`track()`) to PostHog, Mixpanel,
  Amplitude or a webhook via raw `fetch`, batched every 10 s or 50 events,
  best-effort (docs tracking 6–30,79–92,374–380).

---

## 19. Configuration and environment

- Two config systems: public `agent-native.config.ts`
  (`defineAgentNativeConfig`, serialized into the browser bundle, with
  `AGENT_NATIVE_CONFIG_<PATH>` env aliases) and server-only
  `defineAppConfig()` — "one zod schema" under `packages/core/src/app-config/`
  where every env var is a `.meta({ env })` alias and "Consumer code never
  reads `process.env` — four resolvers do"
  (docs agent-native-config 9–30,115–168; `AN AGENTS.md:261–266`;
  e.g. `AN packages/core/src/app-config/migration.ts:3–20`).
- Production readiness diagnostics (auth secret, remote DB, declared env
  names) are reported at `/_agent-native/ping?configuration=1`
  (docs agent-native-config 258–300).
- `agent-native doctor` runs portable guards (`no-drizzle-push`,
  `no-empty-migrations`, `no-unscoped-credentials`, `no-unscoped-queries`,
  `no-env-credentials`, `db-tool-scoping`, `no-env-mutation`,
  `no-localhost-fallback`, `explicit-collab-access`,
  `identity-columns-registered`, `resource-action-access`,
  `feature-dependencies`, `server-plugin-default-export`,
  `migration-manifest`) and is a **hard gate** in `agent-native build`
  (docs doctor 19–124; `AN packages/core/src/guards/index.ts:1–25`).

---

## 20. Deployment

- Same app code everywhere; only `NITRO_PRESET` and the deploy command change:
  `node`, Docker (Node), `vercel`, `netlify`, `cloudflare_module`,
  `aws-lambda`, `aws_amplify`, `azure-swa`, `deno_deploy`, `koyeb`,
  `render_com` (per-host docs). Steps on every host: set `DATABASE_URL` and
  `BETTER_AUTH_SECRET` (+ `A2A_SECRET` for workspaces/background handoffs),
  run `pnpm migrate:production` **before** the new version goes live, build,
  deploy (docs deployment 37–72; docs deploy-an-app 34–100).
- Per-host differences:

| Host                                                          | Runtime / preset                                | DB notes                                                                                                          | Background & scheduling                                                                          | Limits noted                                                                          |
| ------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Node.js / Docker / Koyeb / Render                             | Node server (`node`, `koyeb`, `render_com`)     | pool max 20 (`AGENT_NATIVE_DB_POOL_MAX`)                                                                          | in-process 60 s timer                                                                            | Render can run migrations as pre-deploy                                               |
| Netlify                                                       | Netlify Functions + emitted background function | Neon pooled URL; `NETLIFY_DATABASE_URL` honoured                                                                  | scheduled function → background fn → sweep; optional keep-warm (`AGENT_NATIVE_ENABLE_KEEP_WARM`) | build env decides recurring jobs and keep-warm                                        |
| Vercel                                                        | Vercel Functions                                | pool max 1                                                                                                        | Vercel cron + `CRON_SECRET`                                                                      | 300 s default max duration; Hobby daily cron                                          |
| Cloudflare Workers                                            | `cloudflare_module`                             | per-request pool scope; no filesystem (no `runDrizzleMigrations` at runtime)                                      | Cron Trigger + `A2A_SECRET` secret                                                               | Free plan 10 ms CPU per cron                                                          |
| AWS Lambda                                                    | `aws-lambda` + CloudFront/S3                    | —                                                                                                                 | **no scheduler**                                                                                 | 60 s CloudFront timeout in guide                                                      |
| AWS Amplify                                                   | `aws_amplify`                                   | —                                                                                                                 | optional `amplify-stream` Lambda with 15-min streaming URL for chat                              | —                                                                                     |
| Azure SWA                                                     | `azure-swa`                                     | —                                                                                                                 | —                                                                                                | 45 s request limit, no WebSockets; chat turns end ~40 s and continue from the browser |
| Deno Deploy                                                   | `deno_deploy`                                   | —                                                                                                                 | not stated                                                                                       | —                                                                                     |
| Neon / Supabase / RDS / Cloud SQL / Azure PG / plain Postgres | DB guides                                       | Neon: pooled runtime URL + `DATABASE_URL_UNPOOLED` for migrations; Supabase: transaction pooler, `prepare: false` | —                                                                                                | PgBouncer suggested for many processes                                                |

(docs netlify 195–251; vercel 202–230; cloudflare 205–235; azure-static-web-apps 237–243;
aws-amplify 295–321; aws-lambda 152–232; neon 13–40; supabase 14–32; postgres 20–34).

- "Builder.io managed database" is "_Planned (not yet available)_"
  (docs server-database 119–121).
- Updating UI in production is Builder.io's separate workflow; the deployed
  agent has no filesystem access unless production code execution is enabled
  (docs updating-ui-in-production 8–14).
- Upgrades: `agent-native upgrade` (packages, codemods via a
  `migration-manifest.json`) and `agent-native template sync` (per-file
  three-way merge against a pristine template baseline) (docs
  syncing-template-changes 6–51; docs upgrading-core-ui 6–30).

---

## 21. Corrections to the earlier trainm8 notes

- [`agent-native.md`](../agent-native.md) §2.10: "Better Auth with orgs, members and roles is wired
  into every template." Orgs, members and roles are the **framework's own
  `org/` module**; Better Auth's organization plugin is "intentionally not
  registered" (docs authentication 278; `AN …/better-auth-instance.ts:2640–2690`).
- [`agent-native.md`](../agent-native.md) §2.11 / open-stack §6: the scheduler story is richer than
  "a Long-running server keeps its in-process timer". Netlify, Vercel and
  Cloudflare have build-emitted platform triggers; AWS Lambda has none. This
  was already true at 0.206 (section 15).
- [`agent-native-open-stack.md`](../agent-native-open-stack.md) §2.1 (Better Auth row) still holds at 0.210:
  plugins are magic link, JWT, bearer, two-factor, optional SSO/SCIM; no
  passkey.
- Schema ownership changed completely since 0.206 (section 6). Any statement
  that framework tables are created by `ensure*Table` calls on the request
  path describes 0.206, not 0.210.
- The LLM-key fallback policy flipped on 2026-10-11 (section 13).

---

## Principles list

1. Actions first; the server only coordinates — docs server-overview 90,218–228; `AN AGENTS.md:224–229`.
2. One middleware runs for every request; plugins are startup-only — docs server-middleware 125–129.
3. Identity is request-scoped ambient context and must never fall back to process identity — `AN …/framework-request-handler.ts:289–306`.
4. SSR is one impersonal, CDN-cached shell; personalization is client-side — `AN AGENTS.md:328–333`; docs ssr-caching 37–39.
5. The database is the coordination point (sync, queues, leases, ledgers) — docs server-database 416–418.
6. PostgreSQL-only, Drizzle for normal queries, reviewed raw SQL via `getDbExec` — `AN AGENTS.md:200–206`.
7. Schema is a release artifact, not request-time work — `AN …/store-registry.ts:1–14`; `AN AGENTS.md:266–271`.
8. Only the release step writes the migration ledger — `AN …/store-registry.ts:153–157`.
9. Schema changes are additive only; framework migrations are append-only — `AN AGENTS.md:279–283`.
10. Tenant isolation is enforced in application SQL plus static guards; RLS is post-1.0 — docs multi-tenancy 78–134.
11. Hiding UI is not authorization; the server check is — docs organizations-teams-permissions 38–40.
12. Agent SQL sees only scoped temporary views and never raw secrets — docs security 147–247; `AN …/scoping.ts:114–123`.
13. Present-but-invalid credentials hard-reject; they never fall through to a cookie — `AN …/action-routes.ts:351–371`.
14. Fail closed when governance or membership cannot be read (503, not admit) — `AN …/service-principal-policy.ts:1–20`.
15. Per-organization credentials; one org per workspace — `AN AGENTS.md:301–312`.
16. Serverless freezes after the response; long work runs in a fresh, self-dispatched execution backed by a SQL queue and a retry sweep — docs messaging-internals 137–148.
17. Every deployment-specific value is a declared config field with an env alias — `AN AGENTS.md:261–266`.
18. Security checks ship as code guards that block the build — docs doctor 118–124.
19. Email is the identity key until a post-1.0 principal-ID migration — docs administered-deployments 86.

## Docs vs code

1. **Pool sizes.** docs server-database 101–109 (and postgres 27–30): defaults
   20 / 2 / 4 / 1 and an override "for both Neon and standard PostgreSQL
   clients". Code: 1 on any serverless runtime, override ignored there; 20 or
   the override elsewhere (`AN packages/core/src/db/client.ts:1345–1348`;
   `AN packages/core/src/app-config/runtime.ts:8–11`).
2. **Auth guard and pages.** docs server-middleware 123: "If the request is
   unauthenticated and the path is not in `publicPaths`, it redirects to the
   sign-in page." Code: HTML document and `.data` read requests always pass;
   only `/api/*`, `/_agent-native/*` and other non-page requests get 401
   (`AN packages/core/src/server/auth.ts:4296–4380`). The client
   (`AppProviders`) redirects (docs authentication 490–494, which is right).
3. *(Recorded separately in a private note.)*
4. *(Recorded separately in a private note.)*
5. **Serverless schema checks.** docs deployment-environment-variables
   36–39: "Managed serverless deployments skip this
   boot-time check in production." Code: hosted functions **replay** schema
   DDL ("hosted-replay", the default) unless the app was built with
   `AGENT_NATIVE_RELEASE_MIGRATIONS` (`AN …/store-registry.ts:162–172,454–475`;
   design doc calls hosted-replay "the default",
   `AN docs/plans/2026-09-28-store-registry-schema-ownership.md:393–397`).
6. **Plugin import path.** docs server-plugins 157: `import { defineNitroPlugin }
from "nitropack/runtime"` (Nitro 2). Core depends on Nitro 3 (`nitro`) and
   exports its own `defineNitroPlugin` (`AN packages/core/src/server/index.ts:933–936`).
7. **Better Auth secret.** docs authentication 517 (env table): `BETTER_AUTH_SECRET`
   "auto-generated if not set". Code: generated only in local development;
   production boot fails without it (`AN …/better-auth-instance.ts:570–640`).
   (docs deployment-environment-variables says "Hard-required", which matches.)
8. **Email webhooks without a secret.** docs messaging-internals 204: "If the
   secret is unset, the webhook is accepted but a warning is logged." Code
   refuses in production unless `AGENT_NATIVE_ALLOW_UNVERIFIED_WEBHOOKS=1`
   (`AN packages/core/src/integrations/adapters/email.ts:369–391`), as docs
   security 355–359 says.
9. **Netlify Background Functions.** docs messaging-internals 143: "Do NOT
   use … Netlify Background Functions — Netlify-only … breaks on every other
   host." The Netlify build emits one (`server-agent-background`,
   `background: true`) for durable runs and the recurring sweep
   (`AN packages/core/src/deploy/build.ts:3960–4044,4046–4150`). Not a bug —
   the build abstracts it per host — but the stated principle is stale.
10. **Agent SQL view predicate.** docs security 251 (Per-Org Scoping): "scoped by
    both: `WHERE owner_email = ? AND org_id = ?`". Code: `owner_email = me
AND (org_id = org OR org_id IS NULL)` (`AN …/scoping.ts:155–163`). Docs
    security 55 also says agent SQL "is rewritten"; it is shadowed by
    temporary views, not rewritten.
11. **Drizzle migrations at release.** docs server-database 284–297,337–344
    recommend `drizzle.config.ts` plus `runDrizzleMigrations` re-exported from
    `server/plugins/db.ts`; `runAppReleaseMigrations()` skips `db.ts`
    whenever a `drizzle.config.*` exists (`AN …/app-release-migrations.ts:103–121`).
12. *(Recorded separately in a private note.)*

## Not verified

- Whether the agent's `db-exec` / `db-patch` writes are recorded in
  `agent_audit_log` (they are not `defineAction`s; I did not trace the
  tool-call wrapper).
- The exact runtime position of Nitro file middleware relative to framework
  mounts on every preset (reconstructed from the Nitro 3 build template, not
  observed at runtime).
- Whether `nitroApp.h3["~composed"]` caching in h3 2.0.1 could miss mounts
  added after the first request (core's async bootstrap pushes middleware
  later; I did not read h3's dispatcher).
- Default-on vs off for the in-process recurring timer on every non-Node
  preset other than those listed (Deno Deploy, Azure SWA, Amplify are not
  covered by the docs table).
- MCP OAuth membership re-check "on every request" (cited from docs; I read
  only the refresh path).
- Live-site parity beyond the four spot-checked pages.

## Open questions

1. Is hosted-replay (DDL probes on cold start) meant to remain the default for
   Netlify/Vercel deploys built without `AGENT_NATIVE_RELEASE_MIGRATIONS`, or
   will the build set it automatically?
2. Should agent raw SQL see rows shared with the caller, or is owner-only a
   deliberate narrowing?
3. Why keep Better Auth's `organization` / `member` / `invitation` tables and
   the legacy `sessions` table and `?_session=` promotion?
4. *(Recorded separately in a private note.)*
5. When will framework tables move to their own Postgres schema (design doc
   recommends `agent_native.*`)?
6. *(Recorded separately in a private note.)*
7. AWS Lambda has no scheduler trigger. Is EventBridge planned?

---

## Appendix A — every framework table and its columns

Generated from `AN packages/core/src/db/schema-snapshot.generated.ts`
(167 `CREATE TABLE` statements at `a03f638`; column names only, in
declaration order). Types, defaults and indexes are in that file.

- `_better_auth_migrations`: version
- `_better_auth_migrations_named`: name, version, applied_at
- `_collab_awareness`: doc_id, client_id, state, last_seen
- `_collab_docs`: doc_id, yjs_state, text_snapshot, version, updated_at
- `_context_xray_migrations`: version
- `_context_xray_migrations_named`: name, version, applied_at
- `_observational_memory_migrations`: version
- `_observational_memory_migrations_named`: name, version, applied_at
- `_org_migrations`: version
- `_org_migrations_named`: name, version, applied_at
- `a2a_approvals`: id, task_id, owner_email, org_id, tool_name, tool_input, approval_key, call_id, status, result, expires_at, created_at, updated_at
- `a2a_tasks`: id, context_id, status_state, status_message, status_timestamp, history, artifacts, metadata, owner_email, owner_scope, idempotency_key, created_at, updated_at
- `account`: id, account_id, provider_id, user_id, access_token, refresh_token, id_token, access_token_expires_at, refresh_token_expires_at, scope, password, created_at, updated_at
- `agent_audit_log`: id, created_at, action, caller, actor_kind, actor_email, org_id, thread_id, turn_id, target_type, target_id, status, summary, input, error_code, owner_email, visibility, run_id, task_id, parent_task_id, source_kind, source_platform, source_id, source_url, network_protocol, network_id, network_peer, app, reported_client_name, reported_client_version, oauth_client_id, approval
- `agent_chat_submission_inbox`: thread_id, message_id, state, actor_email, actor_auth_user_id, actor_identity_authenticated_at_ms, actor_name, actor_org_id, actor_org_scope, actor_anonymous, payload_hash, payload_json, interrupt_active_run, submitted_run_id, queue_order, move_to_top_at, retry_after, created_at, updated_at, interrupt_run_id
- `agent_checkpoints`: id, thread_id, run_id, commit_sha, message, created_at
- `agent_eval_datasets`: id, name, description, entries, created_at, updated_at, user_id, idempotency_key
- `agent_evals`: id, run_id, thread_id, user_id, eval_type, criteria, score, reasoning, metadata, created_at
- `agent_execution_leases`: thread_id, turn_id, generation, owner_run_id, lease_expires_at, updated_at
- `agent_execution_steps`: thread_id, turn_id, step_id, operation_id, tool_name, input_json, replay_policy, status, run_id, generation, result_json, receipt_json, error_json, dispatched_at, completed_at, created_at, updated_at
- `agent_experiment_assignments`: experiment_id, user_id, variant_id, assigned_at
- `agent_experiment_results`: id, experiment_id, variant_id, metric, value, sample_size, confidence_low, confidence_high, computed_at
- `agent_experiments`: id, name, status, variants, metrics, assignment_level, started_at, ended_at, created_at, owner_email
- `agent_feedback`: id, run_id, thread_id, message_seq, feedback_type, value, idempotency_key, user_id, org_id, source, created_at
- `agent_harness_sessions`: id, harness_name, thread_id, run_id, provider_session_id, status, resume_state, workspace_ref, pending_approval, resolved_approval_ids, owner_email, org_id, generation, created_at, updated_at, stopped_at
- `agent_human_review_summaries`: run_id, org_id, ask, outcome, artifacts, created_by, created_at, updated_at
- `agent_instruction_updates`: id, run_id, thread_id, target, instruction, feedback, status, user_id, org_id, created_at, updated_at
- `agent_native_browser_session_requests`: owner_email, session_id, request_id, type, name, command, payload_json, status, created_at, claimed_at, completed_at, expires_at, result_json, error
- `agent_native_browser_sessions`: owner_email, session_id, label, url, session_json, context_json, actions_json, connected_at, last_seen_at, expires_at
- `agent_native_embed_session_revocations`: owner_hash, revoked_before
- `agent_native_embed_tickets`: ticket_hash, owner_email, org_id, target_path, scope, created_at, expires_at, consumed_at, renewal_expires_at, session_active_until
- `agent_resource_versions`: id, resource_type, resource_id, version_number, created_at, created_by, actor_kind, owner_email, org_id, visibility, title, summary, snapshot_json, metadata_json
- `agent_review_comment_reactions`: comment_id, actor_email, reaction, created_at
- `agent_review_comments`: id, resource_type, resource_id, thread_id, parent_comment_id, target_id, kind, status, anchor_json, body, author_email, author_name, created_by, resolution_target, reply_route_target, notification_completed_at, mentions_json, owner_email, org_id, visibility, resolved_by, resolved_at, consumed_at, deleted_by, deleted_at, created_at, updated_at, metadata_json
- `agent_review_notification_deliveries`: comment_id, recipient_email, claim_token, claimed_at, sent_at
- `agent_review_statuses`: id, resource_type, resource_id, status, note, updated_by, updated_at, owner_email, org_id, visibility, metadata_json
- `agent_review_suggestion_amendments`: idempotency_key, suggestion_id, revision, author_email, owner_email, org_id, visibility, request_json, before_json, after_json, created_at
- `agent_review_suggestion_creations`: idempotency_key, suggestion_id, author_email, actor_kind, request_hash, created_at, receipt_version
- `agent_review_suggestion_decisions`: id, suggestion_id, idempotency_key, reviewer, decision, observed_base, outcome, detail, created_at
- `agent_review_suggestion_operations`: id, suggestion_id, ordinal, operation_kind, target_id, before_json, after_json, anchor_json, dependencies_json, schema_version
- `agent_review_suggestion_proposal_creations`: idempotency_key, proposal_id, author_email, actor_kind, request_hash, suggestion_ids_json
- `agent_review_suggestion_proposal_decisions`: idempotency_key, proposal_id, reviewer, decision, request_json, suggestion_ids_json, created_at
- `agent_review_suggestion_proposals`: id, resource_type, resource_id, adapter_kind, summary, author_email, actor_kind, created_at
- `agent_review_suggestions`: id, resource_type, resource_id, adapter_kind, adapter_version, thread_id, author_email, actor_kind, base_revision, status, summary, owner_email, org_id, visibility, created_at, updated_at, metadata_json, revision, proposal_id
- `agent_review_thread_preferences`: thread_id, user_email, muted, unread, updated_at
- `agent_run_events`: run_id, seq, event_at, event_data
- `agent_run_outcome_daily`: day, status, terminal_reason, run_count
- `agent_runs`: id, thread_id, status, abort_reason, started_at, completed_at, heartbeat_at, last_progress_at, turn_id, error_code, error_detail, terminal_reason, dispatch_mode, diag_stage, dispatch_payload, peak_rss_mb, continuation_order, thread_projection_pending, worker_stage, in_flight_since, auto_continue_of, worker_generation
- `agent_satisfaction_scores`: id, thread_id, user_id, frustration_score, rephrasing_score, abandonment_score, sentiment_score, length_trend_score, computed_at
- `agent_team_run_queue`: task_id, thread_id, run_id, status, owner_email, org_id, payload, continuation_count, attempts, created_at, updated_at, reconciliation_attempted_at
- `agent_tool_approval_policies`: id, owner_email, org_id, tool_name, enabled, created_at, updated_at, tool_revision
- `agent_tool_approvals`: id, owner_email, org_id, thread_id, turn_id, tool_name, call_id, approval_key_hash, status, expires_at, consumed_at, created_at, updated_at, tool_revision, arguments_hash
- `agent_tool_ledger`: thread_id, tool_key, result_summary, result_is_string, artifacts_json, chat_ui_result_json, completed_at, arguments_hash
- `agent_trace_spans`: id, run_id, thread_id, user_id, org_id, parent_span_id, span_type, name, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_cents_x100, duration_ms, status, error_message, metadata, created_at, ended_at
- `agent_trace_summaries`: run_id, thread_id, user_id, org_id, total_spans, llm_calls, tool_calls, successful_tools, failed_tools, total_duration_ms, total_cost_cents_x100, total_input_tokens, total_output_tokens, model, created_at
- `agent_turn_initiators`: thread_id, turn_id, principal_email, auth_user_id, org_id, org_scope, is_anonymous, first_run_id, created_at
- `app_member_roles`: id, org_id, app_id, email, role, updated_by, updated_at
- `app_permission_overrides`: org_id, app_id, permission, roles_json, updated_by, updated_at
- `app_resource_change_consumers`: app, resource_type, consumer, registered_at
- `app_resource_changes`: consumer, app, resource_type, resource_id, reason, seq, changed_at, available_at, attempts, failed_at
- `app_secrets`: id, scope, scope_id, key, encrypted_value, shared_encrypted_value, description, url_allowlist, created_at, updated_at
- `application_state`: session_id, key, value, updated_at
- `automation_runs`: id, owner, automation, path, scope, org_id, app_id, run_id, thread_id, status, started_at, finished_at, error, error_code, notification_email, failure_alerted, failure_alert_state, failure_alert_attempts, failure_alert_next_attempt_at, failure_alert_claimed_at, failure_alert_provider, failure_alert_first_attempt_at, failure_alert_unsubscribe_token, claimed_at, dispatch_pending
- `automation_scheduler_health`: id, app_id, org_id, last_checked_at, last_dispatched_at, last_error, runtime, updated_at, lease_owner, lease_expires_at
- `automation_trigger_event_queue`: id, sequence_id, trigger_id, trigger_owner, trigger_path, app_id, event_name, event_id, payload, event_owner, emitted_at, status, attempts, failure_attempts, available_at, claimed_at, created_at, completed_at, last_error
- `automation_trigger_event_queue_sweep_state`: scope_key, last_trigger_id, purge_after, updated_at
- `automation_webhook_tokens`: token_hash, automation_id, owner, path, secret_scope, secret_scope_id, secret_key, created_at, updated_at
- `chat_thread_shares`: id, resource_id, principal_type, principal_id, role, created_by, created_at, notified_at
- `chat_threads`: id, owner_email, title, preview, thread_data, message_count, created_at, updated_at, scope_type, scope_id, scope_label, pinned_at, archived_at, share_token_hash, source_platform, source_app_id, source_url, org_id, visibility
- `context_directives`: id, thread_id, segment_id, action, summary_text, created_by, active, origin_turn, created_at, updated_at, owner_email, org_id, visibility
- `custom_api_providers`: id, scope, scope_id, label, base_url, auth_json, docs_urls_json, allowed_host_suffixes_json, default_headers_json, notes, created_at, updated_at
- `data_program_runs`: id, program_id, params_hash, params_json, status, rows_json, schema_json, truncated, row_count, byte_size, error_code, error_message, logs_tail, execution_id, triggered_by, started_at, finished_at, duration_ms
- `data_program_shares`: id, resource_id, principal_type, principal_id, role, created_by, created_at, notified_at
- `data_programs`: id, app_id, name, title, description, code, params_schema, default_params, output_columns, refresh_mode, refresh_ttl_ms, background, created_at, updated_at, archived_at, owner_email, org_id, visibility
- `email_log`: id, org_id, template_id, app, recipient, sender, subject, status, error, provider, request_payload, response_status, response_body, html_body, text_body, created_at
- `identity_rekeys`: id, old_email, new_email, status, error, actor_email, counts_json, created_at, updated_at, completed_at
- `identity_retired_emails`: email, retired_at
- `identity_sso_flow_state`: state, return_path, app_id, client_id, redirect_uri, authority, code_challenge, created_at, expires_at, consumed_at
- `identity_sso_jti`: jti, seen_at
- `integration_a2a_continuations`: id, integration_task_id, platform, external_thread_id, incoming_payload, placeholder_ref, progress_ref, progress_ref_claimed, owner_email, org_id, agent_name, agent_url, dedupe_key, a2a_task_id, a2a_auth_token, verified_artifact_checkpoint, terminal_delivery_kind, terminal_delivery_confirmed_at, terminal_history_payload, status, attempts, next_check_at, error_message, created_at, updated_at, completed_at
- `integration_awaiting_inputs`: platform, external_thread_id, requester_id, expires_at, created_at, updated_at
- `integration_campaigns`: id, integration_task_id, thread_id, turn_id, status, chunk_count, current_run_id, lease_token, lease_expires_at, next_run_at, progress_ref, checkpoint, error_message, created_at, updated_at, completed_at
- `integration_computer_approvals`: id, owner_email, org_id, device_id, task_id, run_id, operation_class, approval_scope, action_hash, status, decision_result_json, decided_by, decided_at, expires_at, consumed_at, created_at, updated_at
- `integration_configs`: platform, config_key, config_data, owner, updated_at
- `integration_controls`: id, action, owner_email, org_id, requester_id, team_id, api_app_id, channel_id, message_ts, run_id, approval_key, incoming_json, status, expires_at, created_at, claimed_at
- `integration_conversation_scopes`: id, platform, tenant_id, conversation_id, conversation_type, trust_level, owner_email, org_id, installation_id, service_owner_email, default_model, require_mention, allow_direct_messages, allow_guests, allow_external_shared, allow_unknown_trust, created_at, updated_at
- `integration_identity_links`: id, platform, tenant_id, external_user_id, user_email, org_id, created_at, updated_at
- `integration_installations`: id, platform, installation_key, team_id, team_name, enterprise_id, enterprise_name, is_enterprise_install, api_app_id, bot_user_id, scopes_json, installed_by_external_user_id, owner_email, org_id, token_secret_key, secret_scope, secret_scope_id, status, health, last_error, health_checked_at, last_healthy_at, token_expires_at, created_at, updated_at, disconnected_at
- `integration_pending_tasks`: id, platform, external_thread_id, payload, owner_email, org_id, status, attempts, dispatch_attempts, last_dispatch_at, last_dispatch_outcome, dispatch_scope, error_message, created_at, updated_at, completed_at, external_event_key
- `integration_remote_commands`: id, device_id, owner_email, org_id, kind, params_json, status, result_json, platform, external_thread_id, computer_task_id, computer_run_id, computer_sequence, idempotency_key, operation_class, approval_scope, action_hash, lease_expires_at, attempts, next_check_at, claimed_at, completed_at, error_message, created_at, updated_at
- `integration_remote_devices`: id, owner_email, org_id, label, platform, app_version, host_name, metadata_json, device_token_hash, last_seen_at, status, revoked_at, created_at, updated_at
- `integration_remote_push_notifications`: id, owner_email, org_id, registration_id, payload_json, status, attempts, provider_ticket_id, next_attempt_at, last_error, delivered_at, created_at, updated_at
- `integration_remote_push_registrations`: id, owner_email, org_id, provider, platform, client_device_id, label, token, token_hash, status, last_seen_at, created_at, updated_at
- `integration_remote_run_events`: device_id, remote_run_id, seq, event_json, created_at
- `integration_thread_mappings`: platform, external_thread_id, internal_thread_id, platform_context, created_at, updated_at
- `integration_usage_budget_events`: id, budget_id, window_start, threshold_bps, observed_micros, created_at
- `integration_usage_budget_windows`: budget_id, window_start, used_micros, reserved_micros, updated_at
- `integration_usage_budgets`: id, partition_key, subject_type, subject_id, period, limit_micros, threshold_bps, owner_email, org_id, created_at, updated_at
- `integration_usage_reservations`: id, reservation_key, budget_id, window_start, estimated_cost_micros, settled_cost_micros, status, created_at, updated_at
- `invitation`: id, organization_id, email, role, status, expires_at, inviter_id, created_at, updated_at
- `jwks`: id, public_key, private_key, created_at, expires_at, alg, crv
- `mcp_action_approvals`: nonce, caller_key, action_name, arguments_hash, expires_at, consumed_at
- `mcp_connect_tokens`: id, jti, owner_email, org_id, label, kind, service_name, created_by, created_at, last_used_at, revoked_at
- `mcp_device_codes`: device_code, user_code, owner_email, org_id, status, token_jti, catalog_scope, created_at, expires_at, consumed_at, client, purpose
- `mcp_oauth_clients`: client_id, client_name, redirect_uris, grant_types, response_types, token_endpoint_auth_method, application_type, created_at
- `mcp_oauth_codes`: code, client_id, redirect_uri, code_challenge, code_challenge_method, owner_email, issued_for_email, org_id, org_domain, scope, resource, created_at, expires_at, consumed_at, client_name
- `mcp_oauth_refresh_tokens`: id, token_hash, client_id, owner_email, issued_for_email, org_id, org_domain, scope, resource, created_at, expires_at, last_used_at, revoked_at, replaced_by_hash
- `member`: id, organization_id, user_id, role, created_at, updated_at
- `notification_delivery_state`: notification_id, delivery_key, state, claim_token, lease_expires_at, completed_at
- `notifications`: id, owner, severity, title, body, metadata, delivered_channels, created_at, read_at
- `oauth_tokens`: provider, account_id, owner, tokens, updated_at, revision, display_name
- `observational_memory`: id, thread_id, tier, text, token_estimate, source_start_index, source_end_index, source_message_count, created_at, updated_at, owner_email, org_id, visibility
- `org_invitations`: id, org_id, email, invited_by, created_at, status, role, app_roles_json
- `org_members`: id, org_id, email, role, joined_at, federation_removal_pending_at
- `org_scim_memberships`: id, org_id, user_id, created_membership, created_at, member_id
- `organization`: id, name, slug, logo, metadata, created_at, updated_at
- `organizations`: id, name, created_by, created_at, allowed_domain, a2a_secret, workspace_url, required_auth_provider, identity_authority, identity_id, federation_roster_initialized_at, icon_json, icon_revision
- `private_icon_assets`: id, owner_email, org_id, mime_type, filename, alt, size, sha256, blob_handle_json, created_at, updated_at
- `progress_runs`: id, owner, title, step, percent, status, metadata, started_at, updated_at, completed_at
- `provider_api_cooldowns`: quota_key, provider_id, scope_key, cooldown_until, status, reason, updated_at
- `provider_corpus_job_hits`: job_id, hit_index, hit_data
- `provider_corpus_jobs`: id, app_id, owner_email, name, mode, status, provider, request_json, pagination_json, batch_json, search_json, limits_json, checkpoint_json, pages_processed, batches_processed, items_processed, matched_items, total_hits, stored_hits, error, next_resume_at, created_at, updated_at
- `recap_images`: token, png_base64, content_type, byte_length, owner_email, created_at
- `resource_access_requests`: id, resource_type, resource_id, requester_email, requester_name, owner_email, note, state, generation, requested_at, created_at, decided_by, decided_at, granted_role, delivery
- `resources`: id, path, owner, content, mime_type, size, created_at, updated_at, created_by, visibility, thread_id, run_id, expires_at, metadata
- `sandbox_executions`: id, owner, org_id, thread_id, runtime, code, status, timeout_ms, max_output_chars, attempt_count, max_attempts, claim_token, lease_expires_at, stdout, stderr, stdout_truncated, stderr_truncated, exit_code, timed_out, error, bridge_tools_used, allowed_action_names, created_at, started_at, finished_at, updated_at
- `scim_connection_binding`: id, connection_id, connection_key, provisioning_domain_id, created_at, decommissioned_at, decommission_status, decommission_cursor_user_id, decommission_reconciled_user_count, decommission_batch_count, decommission_revision, decommission_completed_at, decommission_lease_id, decommission_lease_expires_at
- `scim_group`: id, connection_id, provisioning_domain_id, revision, display_name, display_name_key, external_id, external_id_key, order_key, created_at, updated_at
- `scim_group_member`: id, connection_id, group_id, scim_user_id, membership_key, created_at
- `scim_identity_tombstone`: id, connection_id, provisioning_domain_id, external_id, external_id_key, user_id, profile, deleted_at
- `scim_managed_connection`: id, creation_request_id, connection_id, provisioning_domain_id, status, revision, created_at, created_by, decommission_started_at, decommission_started_by, decommissioned_at, decommissioned_by
- `scim_managed_connection_event`: id, connection_record_id, event_key, sequence, type, actor_id, credential_id, created_at
- `scim_managed_credential`: id, connection_record_id, credential_id, token_digest, hash_version, active_slot_key, status, serialized_scopes, expires_at, created_at, created_by, last_used_at, revoked_at, revoked_by, decommissioned_at
- `scim_projection_grant`: id, connection_id, provisioning_domain_id, scim_user_id, user_id, source_kind, source_id, source_value, role, grant_key, created_at, updated_at
- `scim_subject`: id, user_id, profile_source_id, revision, created_at, updated_at
- `scim_user`: id, connection_id, provisioning_domain_id, user_id, connection_user_key, user_name, user_name_key, primary_email, work_email_value_index, email_value_index, display_name, formatted_name, given_name, family_name, serialized_emails, serialized_attributes, external_id, external_id_key, active, order_key, created_at, updated_at
- `search_index_state`: app, resource_type, target_version, index_version, rebuild_high_seq, rebuild_started_at, rebuild_completed_at
- `search_resources`: app, resource_type, resource_id, title, title_norm, summary_norm, doc_vector, positions_complete, modified_at, content_hash, index_version, indexed_seq, indexed_at
- `service_principal_policies`: org_id, service_name, owner_email, team, risk_tier, purpose, lifecycle, allowed_actions, lifecycle_reason, lifecycle_changed_by, lifecycle_changed_at, created_at, updated_at
- `session`: id, expires_at, token, created_at, updated_at, ip_address, user_agent, user_id, active_organization_id
- `sessions`: token, email, created_at
- `settings`: key, value, updated_at
- `sso_provider`: id, issuer, oidc_config, saml_config, user_id, provider_id, organization_id, domain, domain_verified
- `staged_dataset_rows`: dataset_id, row_index, row_data
- `staged_datasets`: id, app_id, owner_email, name, columns, row_count, byte_size, byte_size_utf8_updated_at, created_at, updated_at
- `sync_events`: id, version, event_json, source, type, event_key, owner, org_id, resource_type, resource_id, created_at
- `sync_events_prune_state`: id, cursor_version, lease_owner, lease_expires_at, last_run_at, last_checked_at, last_success_at, last_deleted, total_deleted, backlog, consecutive_failures, last_error, last_error_at
- `sync_version`: id, v
- `token_usage`: id, owner_email, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_cents_x100, builder_credits_used, engine_name, cost_source, model, label, app, ref_id, org_id, run_id, thread_id, task_id, integration_scope_id, source_platform, source_id, created_at
- `tool_consents`: viewer_email, tool_id, content_hash, granted_at
- `tool_data`: id, tool_id, collection, item_id, data, owner_email, scope, org_id, scope_key, created_at, updated_at
- `tool_hidden_extensions`: id, tool_id, owner_email, created_at
- `tool_history`: id, tool_id, version, operation, summary, name, description, content, icon, actor_email, owner_email, org_id, visibility, created_at
- `tool_shares`: id, resource_id, principal_type, principal_id, role, created_by, created_at, notified_at
- `tool_slot_installs`: id, tool_id, slot_id, owner_email, org_id, position, config, created_at, updated_at
- `tool_slots`: id, tool_id, slot_id, config, created_at
- `tools`: id, name, description, content, icon, created_at, updated_at, archived_at, hidden_at, hidden_by, owner_email, org_id, visibility
- `twoFactor`: id, secret, backup_codes, user_id, verified, failed_verification_count, locked_until
- `usage_alert_events`: id, rule_id, window_start, notification_id, created_at
- `usage_alert_rules`: id, scope, owner_email, org_id, app_id, unit, period, limit_value, channels, enabled, is_default, dismissed_window_start, created_at, updated_at
- `user`: id, name, email, email_verified, image, created_at, updated_at, onboarding_role, two_factor_enabled, first_touch_utm_source, first_touch_utm_medium, first_touch_utm_campaign, first_touch_utm_term, first_touch_gclid, first_touch_msclkid, first_touch_vector_source, first_touch_referrer
- `verification`: id, identifier, value, expires_at, created_at, updated_at
- `workspace_app_shares`: id, resource_id, principal_type, principal_id, role, created_at, created_by, notified_at
- `workspace_apps`: id, owner_email, org_id, visibility, name, description, path, created_at, updated_at, org_enabled
- `workspace_connection_grants`: id, connection_id, provider, app_id, scopes_json, config_json, credential_refs_json, granted_by_email, owner_email, org_id, created_at, updated_at, last_used_at
- `workspace_connections`: id, provider, label, account_id, account_label, status, scopes_json, config_json, allowed_apps_json, allowed_users_json, allowed_user_groups_json, credential_refs_json, owner_email, org_id, created_at, updated_at, last_used_at, last_checked_at, last_error
- `workspace_user_groups`: id, org_id, name, normalized_name, member_emails_json, created_by_email, created_at, updated_at

## Appendix B — the 74 registered framework stores

From `AN packages/core/src/db/store-registry.generated.ts` (store id → owning module is in that file):

`a2a_continuations`, `a2a_tasks`, `agent_harness_sessions`, `agent_runs`, `agent_team_run_queue`, `agent_tool_approval_policies`, `agent_tool_approvals`, `app_resource_changes`, `app_secrets`, `application_state`, `audit`, `auth_sessions`, `automation_run_history`, `automation_trigger_events`, `automation_webhook_tokens`, `awaiting_inputs`, `better_auth`, `browser_sessions`, `chat_threads`, `checkpoints`, `collab_awareness`, `collab_docs`, `computer_approvals`, `context_xray`, `conversation_scopes`, `custom_api_providers`, `data_programs`, `email_log`, `embed_sessions`, `extension_slots`, `extensions`, `identity_links`, `identity_retired_emails`, `identity_sso`, `integration_campaigns`, `integration_configs`, `integration_controls`, `integration_installations`, `mcp_approvals`, `mcp_connect`, `mcp_oauth`, `notifications`, `oauth_tokens`, `observability`, `observational_memory`, `org`, `pending_tasks`, `progress`, `provider_corpus_jobs`, `provider_quota_cooldowns`, `recap_images`, `remote_commands`, `remote_devices`, `remote_push`, `remote_run_events`, `resource_access_requests`, `resource_versions`, `resources`, `review`, `review_suggestions`, `sandbox_executions`, `scheduler_health`, `search_resources`, `service_principal_policies`, `settings`, `staged_datasets`, `sync_events`, `sync_events_prune_state`, `thread_mappings`, `usage`, `usage_alerts`, `usage_budgets`, `workspace_connections`, `workspace_user_groups`

(Recounted in editing: the first draft listed 70 and missed `audit`, `org`,
`review` and `usage`.)

Plus two framework bookkeeping tables created outside stores: `_an_store_migrations` (ledger) and `_an_store_migration_lock` (release lease) (`AN packages/core/src/db/store-registry.ts:36–50,698–760`).
