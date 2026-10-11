# agent-native (Builder.io): adopt it, or build our own?

What Builder.io's **agent-native** framework is, how it is built, how mature it
is, and whether trainm8 should adopt it directly or carry its principles into
the existing Epic Stack codebase.

Research note. Compiled 2026-10-11. Written from **primary sources only**: the
framework's source at commit `1284000325bfd1f9f79c75eb4ea143d36fce6017`
(2026-10-11 08:24 −0400, `@agent-native/core` 0.206.0), its full commit history
(7,301 commits, cloned commits-only), the npm registry, and the pages of
`www.agent-native.com`. The trainm8 side was read at `6638406` (2026-10-11).

> **Sibling documents.** The owner's main interest is MCP. The MCP
> specification, remote MCP with OAuth, the Claude/ChatGPT connectors, MCP Apps,
> a proposed trainm8 MCP tool surface and Strava's API Policy are in
> [`mcp-server-for-trainm8.md`](mcp-server-for-trainm8.md).
> [`agent-layer-trainm8-surface.md`](agent-layer-trainm8-surface.md) inventories
> trainm8's write paths, read paths and safety rails, and
> [`agent-layer-building-blocks.md`](agent-layer-building-blocks.md) surveys the
> libraries a trainm8-owned layer would be built from. This note covers only
> **how agent-native itself uses MCP** (§2.9) and treats "trainm8 as an MCP
> server" as an option (§6, §7). It deliberately has no MCP primer and no
> trainm8 tool list.
>
> **Later research.** [`agent-native-open-stack.md`](agent-native-open-stack.md)
> re-asks adopt, fork or build now that the stack is open, and prices the forks.
> [`agent-platforms.md`](agent-platforms.md) compares other foundations.
> [`stack-migration.md`](stack-migration.md) sequences Better Auth, MCP OAuth,
> Postgres and Drizzle. [`watch-data-sources.md`](watch-data-sources.md) and
> [`watch-data-trainm8-ingest.md`](watch-data-trainm8-ingest.md) cover watch
> data and each vendor's AI and MCP terms.
> [`ai-product-privacy-cost.md`](ai-product-privacy-cost.md) covers privacy,
> regulation and cost. [`agent-strategy.md`](agent-strategy.md) pulls the notes
> into one strategy.

### How claims are cited

- **`AN path:L–L`**: the agent-native repository at the commit above.
- **`TM path:L–L`**: this repository at `6638406`.
- **Docs URLs.** `https://www.agent-native.com/docs/<slug>/` is generated from
  `AN packages/core/docs/content/<slug>.mdx` (`AN agent-native.json:1–20` maps
  the docs root). I checked a sample of 19 pages against the repo files and they
  match. Line numbers point at the `.mdx` source.
- **npm** means `npm view @agent-native/<pkg>` run on 2026-10-11. **git** means
  the full history clone.
- A claim marked **(inference)** is my reasoning, not something a source says.
- Code excerpts are verbatim. This repo's formatter may restyle them (quotes,
  semicolons, indentation) without changing what they mean.

---

## TL;DR

> **Update 2026-10-11 (later research).** The owner has opened the stack:
> trainm8 will move to Better Auth, Postgres (Neon or another EU host) and
> Drizzle. The stack conflicts this note leaned on (§5.2, §7) no longer decide
> the question. The verdict (don't adopt, don't fork) holds for the reasons that
> remain:
>
> - agent-native strips the session cookie from every SSR request, which forces
>   client-side fetching;
> - its server runtime is the Nitro 3 beta;
> - it ships about 6–7 app-facing breaks a month;
> - its ownership model is a team tool's;
> - adopting it (A) would take about 6–10 months;
> - a fork would own about 887 k lines.
>
> The recommendation becomes **C+ with E**: our own layer on agent-native's
> stack minus the framework, MCP server first
> ([`agent-native-open-stack.md`](agent-native-open-stack.md),
> [`stack-migration.md`](stack-migration.md)). Strava is no longer used, so each
> origin platform's terms bind, and the Strava analysis here applies only if
> Strava returns ([`watch-data-sources.md`](watch-data-sources.md),
> [`watch-data-trainm8-ingest.md`](watch-data-trainm8-ingest.md),
> [`ai-product-privacy-cost.md`](ai-product-privacy-cost.md)). Proposed ADRs are
> now numbered 0092–0098 (§7.2).

- **agent-native is a full-stack TypeScript app framework, not a library.** Its
  core idea is one `defineAction()` per capability. The same action becomes an
  agent tool, a typed React hook, an HTTP endpoint, a CLI command, an MCP tool
  and an A2A skill (`AN README.md:18,36–40,63`). Shared SQL data and an
  `application_state` table that records what the user is looking at complete
  the model (`AN packages/core/docs/content/key-concepts.mdx:134–140`).
- **The stack conflicts with trainm8's at almost every layer.** It is
  **PostgreSQL-only**: support for every other database was removed on
  2026-09-04 (git `cc2a915a`, "Remove non-Postgres database support"). The other
  layers are Drizzle, Nitro 3 (beta), React Router **8**, zod 4, Better Auth,
  and TanStack Query over a public, CDN-cached SSR shell. trainm8 is
  SQLite/LiteFS, Prisma, Express, React Router 7, zod 3, its own auth, and
  loaders that read the session. (That is against today's stack. The owner has
  since opened it. The conflicts that remain are the session-free SSR shell, the
  Nitro 3 beta, team-tool tenancy and the Radix chat UI; see
  [`agent-native-open-stack.md`](agent-native-open-stack.md) §2.)
- **It is young and moves very fast.** The first commit was 2026-03-12. It has
  had **1,014 stable npm releases in seven months** and publishes a nightly
  build every three hours. It is pre-1.0 and calls itself alpha, aiming for
  "beta by mid-October 2026 and 1.0 by the end of 2026"
  (`AN versioning-and-stability.mdx:56–58`). A stray `1.0.0` was published by
  mistake and then deprecated (npm). One author wrote 54 % of all commits.
  `packages/core/src` holds about 588 k lines of non-test TypeScript. The agent
  loop alone (`production-agent.ts`) is 13,386 lines.
- **Vendor coupling is real but optional.** The license is MIT. You can bring
  your own key for Anthropic, OpenAI, Gemini, Groq, Mistral, Cohere, OpenRouter
  or Ollama. Builder.io is the default "easy button": free credits through the
  Builder gateway, a hosted "managed frame", and a planned managed Postgres. The
  pricing page states the business model plainly: "We make money if you choose
  our backend." The CLI sends install telemetry unless you set `DO_NOT_TRACK=1`.
- **Its MCP support is the most mature part, and the part most worth copying.**
  Every app automatically serves `/mcp` over Streamable HTTP, with OAuth 2.1,
  PKCE and dynamic client registration. Each action's `readOnly` flag decides
  whether it needs the `mcp:read` or the `mcp:write` scope (`mcp:apps` covers
  inline UI). Callers get a compact catalog by default and reach the rest
  through `tool-search`. An `ask-agent` meta-tool (full catalog only) hands work
  to the app's own agent loop. Approvals are bound to the exact arguments and
  use a one-time nonce. MCP Apps can render UI inline. Apps also consume MCP
  servers. A2A (JSON-RPC) connects apps to each other.
- **"The agent can do anything the UI can do" is a convention, not something the
  framework enforces.** It rests on a four-area checklist, a CI guard against
  duplicate routes, and a hand-kept **parity matrix** in the Content template
  (39 rows) with evals behind it (§2.14).
- **trainm8 already has most of the hard parts in its own idiom.** It has typed,
  owner-scoped server functions that return result unions. It has two seams
  built for "AI later": `SeasonGenerator` (ADR 0053) and `ProposalAuthor` (ADR
  0080 §6). Its ownership gate (`session-ownership.ts`) is the rule every
  machine write must pass. Writes are preview-first, and undo is built in (ADR
  0088). No LLM runs in the request path today.
- **Recommendation: (C+ with E) build our own agent-native layer in trainm8, on
  agent-native's stack minus the framework, with "trainm8 as an MCP server" as
  its first external surface.** Do not adopt the framework, do not embed it, and
  do not fork it. Each origin platform's terms decide what the MCP server and
  any in-app agent may show a model, and Strava's would again if it returned
  (§7). The first vertical slice is the **Ukeskiftet / Week Replan** proposals:
  read them, and answer them, built in the registry behind the existing route.
  The agent's answers go through ADR 0080's own "needs the athlete's yes" gate,
  and the athlete gives that yes on the Ukeskiftet card. In front of a model,
  proposal reasons that read TSB carry their origin platform's terms (Garmin's
  attribution, for example), and the provenance to apply them does not exist
  yet. So the I dag composer is still the cleaner slice to expose first (§7.2).
  §7 has the phased plan.

---

## 1. What agent-native is

**In its own words:** "Agent-Native is an open-source TypeScript framework for
building agents that pair autonomous work with a purpose-built UI. Define each
capability once as an action: the agent uses it as a tool, and the UI calls it
from code." (`AN README.md:18`). The product brief puts it more strongly: "a
framework for building applications where the user interface and AI agent are
equal partners" (`AN PRODUCT.md:15`). The repository's own agent instructions
open with "everything the UI can do, the agent can do through the same SQL data
and action surface" (`AN AGENTS.md:3–5`).

**In plain terms:** it is a scaffold plus runtime for a web app that has a chat
sidebar built in. Every server operation is a file in `actions/`. The framework
finds each file and wires it everywhere: the React UI calls it through hooks,
the in-app LLM agent calls it as a tool, and outside agents (Claude, ChatGPT,
Cursor) call it over MCP. The UI records what the user is looking at in a
database table, so the agent can see it. Writes the agent makes show up in the
UI without a refresh. It ships with auth, orgs, a chat UI, skills and memory,
scheduled jobs, and sixteen template apps (three of them hidden).

### 1.1 The principles, as the project states them

| Principle                                     | Where it is stated                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI and agent are equal partners               | "UI and agents are equal product surfaces." (`AN PRODUCT.md:46`)                                                                                                                                                                                                                                                                                                                    |
| Shared actions are the single source of truth | "Define capabilities once and make them reusable everywhere." (`AN PRODUCT.md:47`). "Actions are the single source of truth for anything your app does … No surface gets its own copy" (`AN actions-overview.mdx:8`)                                                                                                                                                                |
| Shared data                                   | "Work done by the agent appears in the UI, and work done in the UI is available to the agent." (`AN README.md:37`)                                                                                                                                                                                                                                                                  |
| Shared application state                      | "The agent receives relevant UI state, such as the current page, selected record, or active view." (`AN README.md:38`)                                                                                                                                                                                                                                                              |
| No UI automation                              | "The agent does not click through the UI. It works through the same action layer as the UI." (`AN README.md:40`)                                                                                                                                                                                                                                                                    |
| The five rules                                | "1. Data lives in PostgreSQL … 2. All AI goes through the agent: no inline LLM calls … 3. Actions for agent operations … 4. Live sync keeps the UI in sync: database changes stream over SSE, with polling as the universal fallback. 5. Application state in PostgreSQL: ephemeral UI state lives in the database, readable by both agent and UI." (`AN key-concepts.mdx:134–140`) |
| The four-area checklist                       | "Every user-facing feature should update all applicable areas … UI … Action … Skills … App-State … A feature with only UI is invisible to the agent. A full UI feature with only actions is invisible to the user. A feature without app-state means the agent is blind to what the user is doing." (`AN key-concepts.mdx:142–151`)                                                 |
| When _not_ to use it                          | "If you only need a single generated response, call a model directly. If the work follows a fixed, predictable sequence, ordinary application logic or automation is simpler." (`AN what-is-agent-native.mdx:73–76`, [docs](https://www.agent-native.com/docs/what-is-agent-native/))                                                                                               |

One more rule is worth quoting because trainm8 already lives by it in another
form. From the framework's own contributor rules: "A `catch`, default, or
coercion that returns a value callers cannot distinguish from success is a bug …
'Absent' and 'unreadable' must be different values … Prefer a loud, typed
failure over a plausible-looking normal state." (`AN AGENTS.md:90–96`). This is
the code-level twin of trainm8's **Unavailable Metric** rule
(`TM GOAL.md:40–42`).

---

## 2. Architecture in depth

### 2.1 Packages

The repository is a pnpm monorepo of `packages/*`, `templates/*` and
`community-templates/*` (`AN pnpm-workspace.yaml:1–7`). The public packages at
this commit (from each `package.json`; licenses are MIT unless marked private):

| Package                                                                                                                                         | Version                                     | Role                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `@agent-native/core`                                                                                                                            | 0.206.0                                     | The framework: actions, DB helpers, auth, agent loop, MCP/A2A servers, client hooks, CLI (`bin/agent-native.js`). npm unpacked size 32.5 MB |
| `@agent-native/toolkit`                                                                                                                         | 0.206.0                                     | Optional UI and product kits: chat sidebar, editors, sharing, history, settings (Radix-based)                                               |
| `@agent-native/agentkit`                                                                                                                        | 0.206.0                                     | Provider-neutral chat protocol, headless client and HTTP transport. First published on npm 2026-09-14                                       |
| `@agent-native/core-corpus`                                                                                                                     | 0.206.0                                     | Generated source corpus (optional peer of core)                                                                                             |
| `@agent-native/dispatch`, `scheduling`, `pinpoint`, `creative-context`, `embedding`, `otel`, `skills`, `recap-cli`, `migrate`, `code-agents-ui` | various                                     | Workspace control plane, calendar scheduling, annotation, media context, iframe embedding, OpenTelemetry, skills installer, PR recaps       |
| Desktop app, mobile app, Chrome and VS Code extensions                                                                                          | private (VS Code: MIT, publisher `Builder`) | Shells around the same apps                                                                                                                 |

### 2.2 The stack

Read from `AN packages/core/package.json` (dependencies and peers),
`AN pnpm-workspace.yaml` (`catalog:`) and `AN templates/chat/`:

| Layer          | What agent-native uses                                                                                                                                                                                                                                |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web framework  | React Router **8.1** in framework mode, `ssr: true` (`AN templates/chat/react-router.config.ts`, `pnpm-workspace.yaml` catalog `react-router: 8.1.0`); core declares `react-router >=8` as a peer                                                     |
| Build          | Vite **8.1**, plus an `agentNative()` Vite plugin (`AN templates/chat/vite.config.ts`)                                                                                                                                                                |
| Server runtime | **Nitro 3** (`nitro: 3.0.260903-beta`) over **h3 2** (`AN packages/core/package.json`). "Agent-Native apps run on Nitro" (`AN deployment.mdx:9`)                                                                                                      |
| Database       | **PostgreSQL only.** PGlite (Postgres compiled to WASM) for local development, which is "local-only storage and must not be used for production" (`AN server-database.mdx:10,80–81`)                                                                  |
| ORM            | Drizzle 0.45 (`AN packages/core/package.json`; `AN AGENTS.md:202–209`)                                                                                                                                                                                |
| Auth           | Better Auth 1.7.6, magic link first, with orgs and RBAC, or bring your own through a `getSession` callback (`AN authentication.mdx:10,23`)                                                                                                            |
| UI data        | TanStack Query via `useActionQuery` / `useActionMutation` over `/_agent-native/actions/<name>` (`AN packages/core/src/client/use-action.ts:1096–1271`)                                                                                                |
| SSR policy     | "Every SSR HTML and React Router `.data` response is one impersonal, public shell, hard-cached at the CDN … Never add … session/cookie reads, or auth branches to the SSR path — personalization is client-side after load." (`AN AGENTS.md:329–333`) |
| Validation     | Any Standard Schema; zod 4 in practice (catalog `zod: ^4.3.6`)                                                                                                                                                                                        |
| UI kit         | shadcn on Radix, Tabler icons, assistant-ui, tiptap (`AN packages/toolkit/package.json`)                                                                                                                                                              |
| Node           | `>=22.22.0` (`AN packages/core/package.json` `engines`)                                                                                                                                                                                               |

### 2.3 The action primitive

The canonical example, verbatim (`AN README.md:46–61`):

```ts
import { defineAction } from '@agent-native/core/action'
import { z } from 'zod'

// One action powers every app surface: UI, agent, HTTP, MCP, A2A, and CLI.
export default defineAction({
	description: 'Return a friendly greeting.',
	schema: z.object({
		name: z.string().default('world').describe('Name to greet'),
	}),
	http: { method: 'GET' },
	run: async ({ name }) => {
		return { message: `Hello, ${name}!` }
	},
})
```

**Discovery.** "`actions/` itself is a flat folder. Each file is one action …
The framework scans this folder on startup and mounts every file it finds. There
is no registration step" (`AN actions-overview.mdx:127`). The scan is
`autoDiscoverActions` (`AN packages/core/src/server/action-discovery.ts:359`). A
Vite plugin writes `action-types.d.ts`. That file adds every action's parameter
and result types to a global `ActionRegistry`, which is how
`useActionQuery("hello")` gets typed
(`AN packages/core/src/vite/action-types-plugin.ts:620–646`).

**What `defineAction` does** (`AN packages/core/src/action.ts:610–700`), in
order:

1. It converts the schema to JSON Schema once, for the model's tool definition.
   An undocumented `agentInputSchema` option lets the tool schema differ from
   the validating schema (`:377`, `:614–622`).
2. It wraps `run` in the declared `authorize` / `access` guards (`:642–645`).
3. It refuses non-frontend callers when `uiOnly` is set (`:646–657`).
4. It validates input (`:659–661`) and, optionally, the output (`:663–679`).
5. It adds an automatic audit record for mutating actions (`:695–698`) and usage
   tracking (`:699–701`).

`readOnly` is inferred from `http: { method: "GET" }` (`:681–691`).

**The options that decide who can call what**
(`AN actions-access-control.mdx:16–22`):

| Flag            | Default       | Effect                                                                                             |
| --------------- | ------------- | -------------------------------------------------------------------------------------------------- |
| `agentTool`     | `true`        | `false` hides the action from the model, MCP and A2A. The UI, HTTP and CLI can still call it       |
| `mcpTool`       | = `agentTool` | `false` keeps it for the app's own agent but hides it from MCP and A2A                             |
| `publicAgent`   | off           | `{ expose: true }` adds it to **public**, unauthenticated MCP/A2A/OpenAPI surfaces                 |
| `needsApproval` | `false`       | `true` or a predicate. The agent loop pauses before `run()` until a human approves this exact call |
| `access`        | none          | A declared role on a resource, checked on every dispatch path                                      |
| `authorize`     | none          | A guard function, checked on every dispatch path                                                   |

**The failure contract.** "An action reports failure by throwing. Returning
`{ error: "..." }` instead looks like success to every part of the framework, so
the agent's retry breakers never count it and the call is recorded as a
completed side effect." (`AN actions-defining.mdx:302`).
`fail(message, { errorCode, statusCode })` is the typed refusal. The agent sees
the message followed by `(errorCode: …)` (`:389`). This matters for trainm8: its
server functions return `{ ok: false, reason }` unions (§5.1), and an agent
adapter has to turn those into errors.

**Keep the tool surface small.** The docs advise one CRUD-style `update` with a
patch over many per-field actions, `agentTool: false` for UI-only actions, and
`deferLoading` so that only a starter set of schemas goes into the first model
request. Everything else is found through `tool-search`
(`AN actions-defining.mdx:391–399`).

**Descriptions do the prompt engineering.** Real template actions carry long,
defensive descriptions. Forms' `update-form` says, for example, "A form open in
<current-screen> is context, not a target: never reuse its id for a new form
request" (`AN templates/forms/actions/update-form.ts:37–39`). (inference) An
agent-operable action costs more than a typed function: its description is a
prompt that has to be maintained.

### 2.4 How the UI and the agent call the same action

**From the UI** (`AN getting-started.mdx:126–151`, abridged to the call):

```tsx
import { useActionQuery } from '@agent-native/core/client/hooks'
// …
const { data } = useActionQuery('hello', { name })
```

The hooks are TanStack Query wrappers keyed `["action", name, params]`. Reads
retry on 429, 502 and 503 (`AN use-action.ts:78–80`; the docs also list 504,
`AN actions-defining.mdx:385`). Mutations never retry. A successful mutation
invalidates action queries (`AN use-action.ts:1096–1271`).

**From the agent:** the action is a tool. The loop runs `run()` in the same
process, through the same validated, guarded, audited wrapper
(`AN actions-defining.mdx:389`). Every caller is tagged with an `ActionCaller`
(`"tool" | "http" | "frontend" | "mcp-widget" | "mcp-widget-write" | "cli" | "mcp" | "webmcp" | "a2a" | "automation"`,
`AN packages/core/src/action.ts:23–33`). So `run(args, ctx)` can tell a click
from a tool call from an MCP call.

**From anywhere else:** `POST /_agent-native/actions/<name>` with a session
cookie or a bearer token (`AN actions-defining.mdx:254–298`).
`pnpm action <name>` runs it from the CLI (`AN actions-overview.mdx:186–193`).

### 2.5 The agent loop, engines, and approvals

**Engines.** The built-in engine registry
(`AN packages/core/src/agent/engine/builtin.ts:33–129`) contains:

- `builder`, the Builder.io gateway. It needs `BUILDER_PRIVATE_KEY` and
  `BUILDER_PUBLIC_KEY`, or deploy-injected gateway tokens.
- `anthropic`, the Anthropic SDK.
- `ai-sdk:<provider>` through the Vercel AI SDK for anthropic, openai,
  openrouter, google, groq, mistral, cohere and ollama ("Local Ollama models …
  No API key required").
- A ChatGPT-plan engine behind a labs flag.

An app can narrow the set with `agent.builtInEngines` (`:138–155`). The default
model belongs to the organization, and only admins change it
(`AN packages/core/src/agent/default-agent-engine.ts:1–8`). The getting-started
guide lists the prerequisites as "Builder.io, an Anthropic or OpenAI API key, or
a local Ollama model", and its first prompt is "Select **Use Builder.io** to use
free credits, or select **Custom keys**" (`AN getting-started.mdx:23–24,69–71`).

**The loop** is `runAgentLoop`
(`AN packages/core/src/agent/production-agent.ts:5849`) in a 13,386-line module.
The chat plugin that mounts it is another 8,820 lines
(`AN packages/core/src/server/agent-chat-plugin.ts`). The repository has durable
background runs, resume after a crash, sub-agents ("agent teams"), processors
and a run manager under `AN packages/core/src/agent/`. I did not trace these end
to end.

**Approval is enforced in the loop, not in `run()`**
(`AN production-agent.ts:7584–7596`):

```ts
const approvalKey = toolCallCacheKey(toolCall.name, toolCall.input);
// …
const requestedApproval = approvedToolCallKeys.delete(approvalKey);
const wasApproved =
  requestedApproval && opts.consumeApproval
    ? await opts.consumeApproval(approvalBinding)
    : requestedApproval;
if (actionEntry.needsApproval && !wasApproved) {
```

If `needsApproval` is truthy and the call has not been approved, the loop emits
`approval_required` with the tool, the input and a content-addressed
`approvalKey`, then stops the turn. A predicate that throws counts as "needs
approval" (fail closed, `:7614–7615`). Approve resends the turn with
`approvedToolCalls: [approvalKey]`. Because the key is a hash of the name and
the input, approving one call never approves a different one
(`AN actions-access-control.mdx:185,202–205`). The docs ask for restraint: "Keep
approvals rare. Every gated action is a hard stop in the agent loop"
(`:127–131`).

> `needsApproval` **does not gate the UI or plain HTTP.** "It never restricts
> who may call, only whether the agent may proceed unattended"
> (`AN actions-access-control.mdx:404–410`). §2.9 shows how each agent surface
> handles it differently.

**Proposals and undo.** Approval is not the only human-in-the-loop primitive.

- **Resource suggestions.** Core has a store for these. Each suggestion records
  an actor kind (`human | agent | system`), a `baseRevision`, a status
  (`pending | accepted | rejected | stale | superseded | withdrawn`) and a list
  of operations with `before`/`after` values
  (`AN packages/core/src/review/suggestions/types.ts:2–44`). The Content
  template uses it for document edits that the agent suggests and a human
  accepts (`AN templates/content/actions/suggest-document-edit.ts:11,357`). It
  is not described on any docs page I read.
- **Undo for data.** The History Kit provides versioned resources, an audit log
  "of human and agent actions" and app-local inverse operations
  (`AN toolkit-history.mdx:21–32`).
- **Chat revert checkpoints** are git commits of _source code_, not data
  (`AN packages/core/src/checkpoints/service.ts:1–16`).

(inference) The suggestion shape is close to trainm8's `WeekReplanProposal`.
trainm8's version also encodes silence, move scope and load direction, and
agent-native's has nothing like them.

### 2.6 Context: what the agent knows about the screen

Six patterns (`AN context-awareness.mdx:22–29`,
[docs](https://www.agent-native.com/docs/context-awareness/)):

1. A `navigation` key, which the UI writes to `application_state` on every route
   change.
2. `__url__`, which holds the path and query params and is kept in sync by the
   framework.
3. A `selection` key for durable semantic selection: stable ids, a label, a
   short excerpt.
4. A `view-screen` action, "the agent's eyes". It reads those keys and hydrates
   them into fresh records from SQL (`:247,281`).
5. `sendToAgentChat()`, which turns a click into a chat turn. It takes a visible
   `message`, hidden `context`, and a choice between submitting and prefilling.
6. `navigate`, a one-shot command the agent writes and the UI consumes and
   deletes.

The framework's system prompt says the current screen and the current URL go
into **every** message as `<current-screen>` and `<current-url>` blocks
(`AN packages/core/src/server/prompts/framework-core.ts:117`).
`application_state` is an ordinary table keyed by `(session_id, key)` with a
JSON `value` (`AN packages/core/src/application-state/store.ts:19–42`). Writes
are tagged with a request source, so a tab ignores sync events for its own
writes, a technique the docs call "jitter prevention"
(`AN context-awareness.mdx:422`). The route hook `useAgentRouteState` "assumes
React Router" (`:420`).

The minimal Chat template's `view-screen` is 22 lines
(`AN templates/chat/actions/view-screen.ts:5–22`). (inference) The table holds
this state because the framework assumes a serverless host where the agent may
run in a different process from the browser's last request
(`AN key-concepts.mdx:444,485`: "never assume a persistent server process"). A
long-lived single server could send the same context with each chat turn
instead.

### 2.7 UI ↔ agent sync

- A chat run invalidates the affected action queries "after each side-effecting
  tool and again at run end, so single-user agent edits need no background
  polling" (`AN key-concepts.mdx:372`).
- For changes the current user did not cause, a page opts in with
  `useDbSync({ realtime: { reason } })`. The server emits change events, which
  travel over SSE at `/_agent-native/events` on a long-lived host, or over
  `/_agent-native/poll` (polling at 1 → 2 → 5 minutes while idle; paused when
  the tab is hidden) on serverless (`AN key-concepts.mdx:372–394`;
  `AN packages/core/src/client/use-db-sync.ts:1424`).
- A hosted Realtime Sync Gateway is opt-in. Builder-hosted apps get it
  automatically (`AN real-time-collaboration.mdx:602–614`).

### 2.8 Instructions, skills, memory

There are three building blocks: `AGENTS.md`, loaded on every turn;
`.agents/skills/<name>/SKILL.md`, loaded on demand; and `actions/<name>.ts`,
listed as tools on every turn (`AN key-concepts.mdx:95–132`). In a running app,
these "agent resources" are **rows in Postgres, not files**. The rows cover
instructions, skills, `LEARNINGS.md`, personal `memory/MEMORY.md`, custom
sub-agents, scheduled jobs and MCP server configs, in personal, organization and
workspace scopes. This gives every user of a multi-tenant SaaS
"Claude-Code-level customization" without running a container per user
(`AN agent-resources.mdx:10–12,89–105`). AI work goes through the chat, and "UIs
do not call LLMs directly" (`AN AGENTS.md:258`). A button hands work to the
agent with `sendToAgentChat()` (`AN key-concepts.mdx:306–322`).

### 2.9 MCP and A2A in agent-native

agent-native uses MCP **in both directions**, plus WebMCP in the browser. The
MCP code under `AN packages/core/src/mcp/` and `mcp-client/` is about 28 k lines
of non-test TypeScript (67.5 k with specs).

#### 2.9.1 Each app is an MCP server

- **Auto-mounted.** "every app gets `/mcp` for free, no setup required", served
  over Streamable HTTP (`AN mcp-protocol.mdx:26–28`,
  [docs](https://www.agent-native.com/docs/mcp-protocol/)). The chat plugin
  calls `mountMCP`
  (`AN packages/core/src/server/agent-chat-plugin.ts:3128–3132`,
  `AN packages/core/src/mcp/server.ts:543`). A `GET /.well-known/mcp.json`
  catalog with `POST /mcp/tool/:name` is a fetch-first convenience that the
  framework itself labels non-standard (`AN mcp-protocol.mdx:34–45`).
- **Action → tool.** The action name becomes the tool name, `tool.description`
  becomes `description`, and `tool.parameters` becomes `inputSchema`
  (`AN mcp-protocol.mdx:223–229`). In code, `tools/list` filters the advertised
  actions by the caller's grant and derives annotations when the action does not
  declare them: `readOnlyHint` comes from `readOnly`, and `destructiveHint` from
  `needsApproval` or `publicAgent.isConsequential`
  (`AN packages/core/src/mcp/build-server.ts:3112–3230`, `:3200–3206`). An
  action with a `link(result)` gets the text "surface the returned 'Open in … →'
  link" added to its description (`:3216–3219`).
- **Compact catalog by default.** "The MCP server serves a **compact catalog by
  default to every caller** … The full action surface is served only on explicit
  opt-in. The catalog is never inferred from the client name"
  (`AN external-agents-catalog.mdx:17–21`). That means about 20–30 tools: the
  template's declared actions, the cross-app builtins (`list_apps`, `open_app`,
  `ask_app`, `create_embed_session`) and `tool-search`. The full tier is about
  105 tools. `mcpTool: true` makes an action part of the curated catalog
  (`AN actions-access-control.mdx:44–63`).
- **`ask-agent`.** This meta-tool sends natural language to the app's own agent
  loop. It is served only in the opt-in full tier; a compact-catalog caller gets
  "Unknown tool" (`AN build-server.ts:3244,3343–3350`). The docs say hosted
  calls wait at most 25 seconds inline, then return a task handle to poll with
  `ask_app_status` (`AN mcp-protocol.mdx:29,241`); the code caps the wait at 20
  seconds (`AN build-server.ts:371–372`). It needs `mcp:write`
  (`AN build-server.ts:3246–3247,3354–3363`).
- **Auth.** Standard remote MCP OAuth (RFC 9728 protected-resource metadata,
  dynamic client registration, authorization code with PKCE, refresh tokens),
  with static `ACCESS_TOKEN(S)`, Connect-minted JWTs or `A2A_SECRET` as
  fallbacks. Loopback local development needs no auth
  (`AN mcp-protocol.mdx:31–32,283`). Access tokens are JWTs bound to the exact
  MCP resource URL. **Scopes are derived from the action:** `mcp:read` for
  read-only actions, `mcp:write` for mutating ones and `ask-agent`, and
  `mcp:apps` for `ui://` resources (`:379–381`). In code:
  `entry.readOnly === true || readOnlyOverride ? "mcp:read" : "mcp:write"`
  (`AN build-server.ts:422–431`). Refresh tokens are stored hashed and are not
  rotated. Every request re-checks organization membership, so "a removed member
  loses MCP access on their next request" (`AN mcp-protocol.mdx:383`).
- **Approvals over MCP are a separate path from the in-app loop.** An MCP call
  to a `needsApproval` action returns an input-required response. The approval
  is a **one-time grant** stored in `mcp_action_approvals`, bound to the caller,
  the action name and a **hash of the arguments**, with an expiry
  (`AN packages/core/src/mcp/approval-store.ts:7–38`). Only a verified **user**
  identity can approve. A mismatched, expired or already-used grant is refused
  (`AN build-server.ts:2940–2995`).
- **MCP Apps.** An action with `mcpApp` metadata advertises the
  `io.modelcontextprotocol/ui` extension and serves a `ui://` resource (the real
  app route, embedded), with ChatGPT Apps SDK metadata alongside
  (`AN mcp-protocol.mdx:200–205`).

#### 2.9.2 Each app is also an MCP client

`mcp.config.json` (workspace or app root) lists stdio or remote HTTP servers.
Users or organizations can also add remote servers at runtime. Every tool lands
in the agent's registry as `mcp__<server-id>__<tool>`, and `tool-search` can
find it (`AN mcp-clients.mdx:26–28`). Stdio servers "are intended for **local
development** — they are a no-op in edge runtimes" (`:210`). Built-in Chrome
DevTools, Playwright and Computer Use servers are switched off in production
(`AN mcp-clients.mdx:108`).

#### 2.9.3 WebMCP (in the browser)

On authenticated pages, eligible actions are registered on
`document.modelContext`, using a polyfill when the browser has none. **An action
that needs approval is refused over WebMCP** when its predicate trips, because
"the in-app agent loop is the only surface that can run its actual human
approval flow" (`AN webmcp.mdx:48–55`;
`AN packages/core/src/server/action-routes.ts:1403–1436`, which returns 409
`approval_required`).

#### 2.9.4 A2A

Each app serves an agent card at `/.well-known/agent-card.json` and a JSON-RPC
endpoint at `/_agent-native/a2a`. Each message creates a task with a lifecycle.
Production needs `A2A_SECRET` (JWT), and without it the app fails closed
(`AN a2a-protocol.mdx:24–27,107,111`). The docs put the split this way: MCP is
"tool-to-agent", with direct tool calls and no extra LLM; A2A is
"agent-to-agent", where a full agent loop reasons on the other side
(`AN mcp-protocol.mdx:123`; `AN a2a-protocol.mdx:12`). A2A capability filters
drop approval-gated actions from what other apps may call directly
(`AN packages/core/src/server/agent-chat/action-filters-a2a.ts:120–134`).

#### 2.9.5 How approval works on each surface

| Surface                  | What happens to a `needsApproval` action                                                  | Source                                  |
| ------------------------ | ----------------------------------------------------------------------------------------- | --------------------------------------- |
| In-app agent loop        | Pauses. Approve/Deny in chat, keyed by a hash of name + input                             | `AN production-agent.ts:7584–7650`      |
| MCP (`/mcp`)             | Input-required round trip. One-time nonce bound to caller + args hash. Verified user only | `AN build-server.ts:2940–2995`          |
| WebMCP                   | Refused (409) when the predicate trips                                                    | `AN action-routes.ts:1403–1436`         |
| A2A delegated capability | Gated actions are filtered out                                                            | `AN action-filters-a2a.ts:132`          |
| UI hook / HTTP / CLI     | **Not gated.** Approval is about the agent, not about who may call                        | `AN actions-access-control.mdx:404–410` |

The docs and the code disagree here. `actions-access-control.mdx:167` says
approval "works the same way for … A2A, and MCP callers, because every agent
surface routes through the same loop" (the same page's table says "The agent
loop only", `:408`). But direct MCP tool calls do not run the loop ("Direct tool
calls (no extra LLM)", `AN mcp-protocol.mdx:123`), and the code gives them a
separate nonce-based approval (§2.9.1). `AN webmcp.mdx:49–50` goes the other
way: "the in-app agent loop is the only surface that can run its actual human
approval flow", which the MCP code also contradicts.

### 2.10 Auth and multi-tenancy

Better Auth with orgs, members and roles is wired into every template. There is
"no dev auth bypass", though local development creates a throwaway account
automatically (`AN authentication.mdx:10–23,92–98`). Tables that use
`ownableColumns()` need scoped reads through `accessFilter`, `resolveAccess` or
`assertAccess` (`AN AGENTS.md:291–293`). An app can bring its own auth through
`getSession` (`AN authentication.mdx:23`). Embedded mode takes the host's
session through an `auth: (event) => session` callback
(`AN embedding-sdk.mdx:64–110`).

### 2.11 Hosting and deploy

The supported targets are any Nitro preset: Node, Docker, Vercel, Netlify,
Cloudflare, Render, Koyeb, Deno Deploy, Azure SWA, AWS Lambda and Amplify. Every
deployed app "needs a persistent PostgreSQL database"
(`AN deployment.mdx:9,29`). Builder's own beta and production sites run on
Netlify through GitHub Actions (`AN AGENTS.md:53–65`). A Builder-managed
Postgres is "_Planned (not yet available)_" (`AN server-database.mdx:121`).
Fly.io appears only as an example of a managed Postgres provider
(`AN postgres.mdx:9`).

### 2.12 Testing

- 1,209 co-located `*.spec.ts(x)` files in `packages/core/src`.
- Playwright suites under `AN e2e/`.
- **Evals** (`*.eval.ts`) run the real agent loop against fixed inputs, score
  the output and gate CI. A production trace can be promoted into an eval case
  (`AN evals.mdx:1–15`).
- About 80 `guard-*` scripts run in CI, among them `guard-no-action-twin-routes`
  (`AN scripts/`; `AN AGENTS.md:142–156`).

### 2.13 Who builds it

| Measure          | Value                                                                                                                                                       | Source      |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| First commit     | 2026-03-12 ("initial commit")                                                                                                                               | git         |
| Commits          | 7,301. Per month: Mar 437, Apr 416, May 670, Jun 880, Jul 1,202, Aug 1,257, Sep 1,743, Oct (to 10/11) 696                                                   | git         |
| Distinct authors | 87                                                                                                                                                          | git         |
| Concentration    | Steve Sewell 3,935 (54 %), release bot 1,196, Alice Alexandra Moore 641, "Builder.io" 255, then a long tail. Since 2026-09-11: Sewell 1,377 of 1,997 (69 %) | git         |
| Stars            | The site header shows a GitHub badge reading **7.1k**. The GitHub API was not reachable from this session, so this is not verified                          | site header |

### 2.14 How "the agent can do anything the UI can do" is actually implemented

It is **a discipline the framework supports, not a guarantee it gives.** Nothing
stops a component from mutating data without an action. What exists:

- **Architecture rules.** Normal app data must flow through actions. New
  `/api/*` CRUD routes that duplicate an action fail
  `guard:no-action-twin-routes` (`AN AGENTS.md:226–231`).
- **The four-area checklist** (`AN key-concepts.mdx:142–151`).
- **A parity matrix with tests, in one template.** Content keeps
  `templates/content/parity/matrix.ts`. Each of its 39 rows names a UI
  entrypoint, its actions, a status (32 `action-backed`, 3 `host-only`, 2
  `client-only-ephemeral`, …) and an `exception` field. Deterministic meta-tests
  fail when a priority row loses coverage, and opt-in agent evals exist
  (`AN templates/content/parity/README.md:1–25`; `matrix.ts:1–33`). One
  exception shows why the UI and the agent cannot simply be equal:
  `record-content-visit` is `agentTool: false` "so agent reads and edits cannot
  manufacture human visit history" (`matrix.ts:24–25`).

### 2.15 Where the docs and the code disagree

- `AN PRODUCT.md:39` still promises "backend-agnostic database support", while
  the code has been Postgres-only since 2026-09-04 (git `cc2a915a`).
- `drop-in-agent.mdx:34` says the drop-in components are "all exported from
  `@agent-native/core/client`". `migration-manifest.json` records that
  `AgentSidebar` and `AgentPanel` moved to `@agent-native/toolkit/app/chat`
  (`AN packages/core/migration-manifest.json`, `moves`).
- `needsApproval` on MCP: see §2.9.5.
- Small numbers: the `ask-agent` inline wait (docs 25 s, code 20 s, §2.9.1) and
  the read-retry statuses (docs include 504, code does not, §2.4).
- `agentInputSchema` exists in code (`AN action.ts:377,617–622`) and in no doc
  page I read.

---

## 3. Templates

`AN packages/shared-app-config/templates.ts:20–225` is the catalog. The action
counts are non-test files directly in each `templates/<name>/actions/` (the
folder is flat by convention). The site marks every public app **alpha**
([apps](https://www.agent-native.com/apps/)).

| Template      | Hint (verbatim, from `templates.ts`)                                                        | Actions | Public | What it demonstrates                                                                          |
| ------------- | ------------------------------------------------------------------------------------------- | ------- | ------ | --------------------------------------------------------------------------------------------- |
| **chat**      | "Minimal chat-first app with durable threads, actions, and the app-agent loop"              | 5       | yes    | The smallest app: `hello`, `navigate`, `view-screen`, `provider-api-request`                  |
| **forms**     | "Agent-Native form builder — create, edit, and manage forms"                                | 20      | yes    | The repo calls it the reference for UI density. Shows `access`/`authorize` on a CRUD resource |
| **tasks**     | "Task-list-first workspace — inbox capture, custom fields, and drag-and-drop ordering"      | 29      | hidden | List CRUD with ordering. The closest shape to a training calendar (inference)                 |
| **calendar**  | "Agent-Native Google Calendar — manage events, sync, and public booking"                    | 60      | yes    | External provider sync plus scheduling                                                        |
| **mail**      | "Agent-Native Superhuman — email client with keyboard shortcuts and AI triage"              | 85      | yes    | Realtime (`useDbSync`) and `needsApproval` on send                                            |
| **content**   | "Open-source Obsidian for MDX — edit local docs with agent assistance"                      | 243     | yes    | Local File Mode, suggested edits (agent proposes, human accepts), the parity matrix           |
| **slides**    | "Agent-Native Google Slides — generate and edit React presentations"                        | 87      | yes    | Collaborative editing (Yjs) shared with the agent                                             |
| **design**    | "Agent-Native design tool — create and edit visual designs with agent assistance"           | 184     | yes    | Canvas plus embedding                                                                         |
| **analytics** | "Agent-Native Amplitude/Mixpanel — connect data sources, prompt for charts"                 | 188     | yes    | Read-only agent SQL over scoped views. Dashboards                                             |
| **clips**     | "Screen recording, meeting notes, and voice dictation — all with AI"                        | 147     | yes    | Media, transcripts, voice                                                                     |
| **brain**     | "Cited company knowledge from Slack, meetings, transcripts, and decisions"                  | 60      | yes    | Cited retrieval                                                                               |
| **assets**    | "Digital asset manager — upload, organize, search, and generate on-brand images and videos" | 85      | yes    | Generation plus a human picker over MCP Apps                                                  |
| **plan**      | "Structured visual plans and PR recaps with diagrams, wireframes, prototypes …"             | 51      | yes    | Review workflow for coding-agent plans                                                        |
| **dispatch**  | "Central Slack/Telegram router with jobs, memory, approvals, and A2A delegation"            | 19      | yes    | Control plane: one MCP connector that fans out to apps over A2A                               |
| **crm**       | "Agent-Native CRM over native SQL, HubSpot, or Salesforce …"                                | 73      | hidden | Typed attributes over external CRMs                                                           |
| **factory**   | "Build agent factories with gates you control"                                              | 48      | hidden | Gated pipelines                                                                               |
| videos        | (not in the catalog)                                                                        | 0       | —      | —                                                                                             |

`community-templates/` adds GTM-flavoured examples (account tiering, churn
warning, win/loss memo, …). None of them is close to a training, calendar-plan
or health domain.

---

## 4. Maturity and risk

| Dimension             | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| License               | MIT. The README says "MIT" (`AN README.md:285–287`). There is **no root `LICENSE` file** at this commit; the license is declared in each package's `license` field (npm: `MIT`) and in `packages/vscode-extension/LICENSE.md` ("Copyright (c) Builder.io"). The pricing FAQ: "We could change it for future versions. We cannot revoke it on code you already have" ([pricing](https://www.agent-native.com/pricing/))                                                                                                                                                                                                                                                                                |
| Age                   | 7 months (first commit 2026-03-12, git; npm `time.created` 2026-03-12)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Stage                 | "Agent-Native packages are pre-1.0 … Alpha and beta are release stages, not service-level commitments. The current targets are beta by mid-October 2026 and 1.0 by the end of 2026. These dates are goals only." (`AN versioning-and-stability.mdx:8–10,56–58`)                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Release cadence       | A nightly every three hours when source changed. Scheduled stable patch releases Monday to Thursday (`:14–23`). npm lists **1,811** versions of `@agent-native/core`: 1,014 stable and 740 nightlies. `0.100.0` came out 2026-07-14, `0.200.0` on 2026-10-02, `0.206.0` on 2026-10-09. Stable releases have since thinned (34 in September, 10 in October to 10/11) while commits rose, with about 6–7 app-facing breaks a month ([`agent-native-open-stack.md`](agent-native-open-stack.md) §3, §6)                                                                                                                                                                                                  |
| Version accidents     | `1.0.0` was published 2026-08-28 and deprecated: "Published in error … a stray major-type changeset promoted 0.176.1 to 1.0.0" (npm). The core `CHANGELOG.md` still opens with a `## 1.0.0` section above `0.206.0`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Breaking changes      | Allowed in minor releases before 1.0 (`AN versioning-and-stability.mdx:27–31`). The migration manifest records **107 moved import paths (about 1,800 re-homed symbols) and 11 removed exports since 0.110.0** (`AN packages/core/migration-manifest.json`; a later re-count reads 1,973 moved symbols and 65 removed symbols in 5 modules, [`agent-native-open-stack.md`](agent-native-open-stack.md) §3). Examples: non-Postgres databases removed (git `cc2a915a`, 2026-09-04); UI moved from Core to Toolkit (0.198.0); AgentKit protocol v2 "intentionally rejects v1-only" clients; `createProductionAgentHandler` now requires `assertAiSetupReady` (0.206.0) (`AN packages/core/CHANGELOG.md`) |
| Size                  | ~588 k lines of non-test TS/TSX in `packages/core/src`. The core tarball unpacks to 32.5 MB (npm)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Bus factor            | 87 authors, but 54 % of commits come from one person, who wrote 69 % of the last 30 days' commits. Very large machine-assembled commits are routine ("chore: publish branch work in … (1081 files)", git `cc2a915a`), so most of the code is probably agent-written (inference)                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Builder.io coupling   | **Optional, but the default path.** The getting-started flow offers "Use Builder.io to use free credits" first (`AN getting-started.mdx:69`). `builder` is the first registered engine (`AN builtin.ts:70–89`). "In the cloud, Builder.io hosts the identical loop as a managed frame" (`AN key-concepts.mdx:93`). A managed Postgres is planned (`AN server-database.mdx:121`). The Builder Code starter is a patch layer over Chat (`AN AGENTS.md:371–376`). Nothing I read **requires** a Builder account                                                                                                                                                                                          |
| Business model        | "The framework is MIT licensed. We make money if you choose our backend. That's the whole business model." and "Do I have to use Builder's backend? No." ([pricing](https://www.agent-native.com/pricing/)). The hosted apps run under separate Hosted Services Terms that "do not govern the framework source code, forks … or self-hosted versions" ([terms](https://www.agent-native.com/terms/))                                                                                                                                                                                                                                                                                                  |
| Telemetry             | **CLI:** install-funnel events go to `analytics.agent-native.com/track` with an embedded public key, plus a hard-coded Sentry DSN for crashes. Opt out with `DO_NOT_TRACK=1` or `AGENT_NATIVE_TELEMETRY_DISABLED=1` (`AN packages/core/src/cli/telemetry.ts:1–31,63–70`; `cli/sentry-telemetry.ts:61`; `AN observability.mdx:616`). **Browser:** the framework's own events are sent only when an analytics public key is configured (`AN packages/core/src/client/analytics.ts:2318–2335`). The server never hard-codes a DSN                                                                                                                                                                        |
| LLM provider coupling | Low: nine engine families, BYO key, local Ollama (§2.5). Every AI feature assumes **some** LLM is configured. A turn without a provider is refused before dispatch (`AN packages/core/CHANGELOG.md`, 0.206.0 `assertAiSetupReady`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Cost model            | Framework $0. "AI tokens are not free. Your agent runs on your API key … If you're already on a Claude or ChatGPT subscription, you're already paid up." Hosting is your own. Builder's all-in-one backend costs money ([pricing](https://www.agent-native.com/pricing/))                                                                                                                                                                                                                                                                                                                                                                                                                             |

---

## 5. Fit with trainm8

### 5.1 What trainm8 already has that matters here

- **No LLM in the request path.** `@anthropic-ai/sdk` is a dependency
  (`TM package.json:41`), but nothing in the repository imports it. Two env vars
  remain, `ANTHROPIC_API_KEY` and `CLAUDE_CODE_OAUTH_TOKEN`, and their comment
  refers to an `anthropic-client.ts` that no longer exists
  (`TM app/utils/env.server.ts:16–27`). ADR 0053 rejected "a key, a latency
  budget and a dependency in the request path" for generation
  (`TM docs/adr/0053-…:198–202`).
- **Two seams built for "AI later".**
  - `SeasonGenerator` (`TM app/utils/plan-generation/generator.ts:43–71`) is
    pure and synchronous. Its header says "a model later is a _second_
    implementation of an interface that already has a working one" (`:14–15`).
  - `ProposalAuthor = (facts: WeekChangeFacts) => WeekChange`
    (`TM app/utils/load/propose-week-change.ts:114`), where "AI later becomes a
    second author of the same type, and the apply rules … do not move" (`:8–9`).
    ADR 0080 §6 says the same: "AI later writes the same proposals on the same
    surface" (`TM docs/adr/0080-…:50–52`).
- **An ownership gate for every machine write.**
  `sessionOwner({ source, adoptedAt, releasedAt })` and `MACHINE_OWNED_SESSION`
  decide whether a session belongs to the athlete or to the machine
  (`TM app/utils/session-ownership.ts:1–50`). ADR 0080 adds: silence never
  applies to the athlete's sessions, and "A proposal that adds load always needs
  an explicit yes, even on the machine's own sessions"
  (`TM docs/adr/0080-…:38–44,84–88`).
- **Preview first.** "Nothing reaches the calendar unapproved … The loader
  previews and writes nothing … One POST writes" (`TM docs/adr/0053-…:165–170`).
  Approval regenerates on the server and never trusts a posted payload
  (`:61–74`).
- **Undo for every write.** On I dag, "the toast says what changed and carries
  _Angre_; so does the landed row", with a 10-second window. An undo is an
  owner-scoped delete, or a token-guarded restore that "takes back only the
  write whose stamp is still there" (`TM docs/adr/0088-…:43–59,119–128`).
- **Typed, owner-scoped server functions that return result unions.** The
  Ukeskiftet resource route is 70 lines. It parses one zod discriminated union,
  dispatches on `intent` to `answerProposal`, `acceptRoundWithFactor` or
  `easeWeek`, and maps the `{ ok: false, reason }` it gets back to a 404 or 409
  (`TM app/routes/resources/week-change.tsx:29–69`;
  `app/utils/load/week-change-schema.ts:48–60`;
  `app/utils/load/week-replan-answers.server.ts:38–68`). 70 route modules export
  an `action`, and home's action dispatches on intents such as `stamp-day`,
  `write-session`, `place-session` and `undo-stamp`
  (`TM app/routes/_home/index.tsx:291–518`).
- **Per-athlete live invalidation already exists.** An SSE stream is scoped by
  `requireUserId` and revalidates when an import lands
  (`TM app/routes/resources/imports-events.tsx:15–27`).
- **Words come from one place.** `labels.ts` "still owns every athlete-facing
  enum→label map", and the planning surfaces speak Norwegian
  (`TM docs/adr/0081-…:26–35`).

### 5.2 Stack overlap and conflict

> **Superseded in part (2026-10-11).** The owner has since opened the stack, so
> the database, ORM, auth, validation, router and deploy rows below are planned
> moves, not conflicts ([`stack-migration.md`](stack-migration.md)). The rows
> that still decide are the session-free SSR shell (enforced in code), the Nitro
> 3 beta server and the UI kit
> ([`agent-native-open-stack.md`](agent-native-open-stack.md) §2).

| Layer              | agent-native 0.206.0                                               | trainm8                                                                          | Verdict                                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database           | PostgreSQL only (PGlite local), git `cc2a915a`                     | SQLite on LiteFS (`TM prisma/schema.prisma:10`, `package.json:98`; decision 003) | **Hard conflict.** "Using SQLite is an _enormous_ simplification" (`TM docs/decisions/003-sqlite.md:61–65`); "Limit Services" (`TM docs/guiding-principles.md:6–8`) |
| ORM                | Drizzle                                                            | Prisma 6 (`TM package.json:62`); 56 models, 58 migrations                        | Conflict                                                                                                                                                            |
| Server             | Nitro 3 beta / h3 2                                                | Express 5 (`TM server/index.ts:7,23`)                                            | Conflict. Embedding needs a Nitro host (`AN packages/core/src/server/embedded.ts:221–231`)                                                                          |
| Router             | React Router 8.1                                                   | React Router 7.13 (`TM package.json:109`)                                        | Version conflict (core peer `>=8`)                                                                                                                                  |
| Data model in UI   | TanStack Query over actions; SSR is a public shell with no session | Loaders and actions that read the session cookie; Conform forms                  | **Philosophical conflict** (`AN AGENTS.md:329–333`)                                                                                                                 |
| Auth               | Better Auth (or a custom `getSession`)                             | Epic Stack session cookie, passkeys, TOTP, GitHub OAuth                          | Bridgeable through `getSession` / embedded `auth` (`AN authentication.mdx:23`)                                                                                      |
| Validation         | Standard Schema, zod 4                                             | zod 3.25 + Conform (`TM package.json:122`)                                       | Conflict until trainm8 moves to zod 4                                                                                                                               |
| UI kit             | shadcn/Radix, assistant-ui, tiptap                                 | shadcn base-luma on Base UI (ADR 0085)                                           | Conflict for any imported chat UI                                                                                                                                   |
| Icons, toasts, CSS | Tabler, Sonner, Tailwind 4                                         | Tabler, Sonner, Tailwind 4                                                       | Overlap                                                                                                                                                             |
| Build              | Vite 8.1                                                           | Vite 7.3 (`TM package.json:172`)                                                 | Version gap                                                                                                                                                         |
| Node               | `>=22.22`                                                          | `^22.18` (`TM package.json:177`)                                                 | Minor gap                                                                                                                                                           |
| Deploy             | Nitro presets, Netlify in practice                                 | Fly.io + Docker + LiteFS (`TM fly.toml`)                                         | Node/Docker presets would run on Fly (inference). LiteFS has no counterpart                                                                                         |
| LLM                | Required for any AI feature; nine engine families                  | None in the request path                                                         | trainm8's stance is stricter (ADR 0053)                                                                                                                             |

### 5.3 What "adopting agent-native directly" would actually mean

Three shapes are possible. None of them is a drop-in.

1. **Migrate trainm8 into it (the app framework).** trainm8 would move to
   Postgres and Drizzle (56 models, 58 migrations, 117 `*.server.ts` modules),
   Express to Nitro, React Router 7 to 8, zod 3 to 4, loaders to TanStack Query
   behind a session-free SSR shell, and its own auth to Better Auth or a custom
   `getSession`. Its 70 route actions would be rewritten as `actions/*.ts`. It
   would take on a release train that averaged about five stable versions a day
   (fewer since September, but with about 6–7 app-facing breaks a month) and
   records 107 moved import paths (about 1,800 symbols) since 0.110. (inference)
   That is a rewrite, not an adoption, and it gives up decision 003 and LiteFS.
   With the stack open,
   [`agent-native-open-stack.md`](agent-native-open-stack.md) §5 re-prices this
   at about 6–10 months, most of it the move to client-side data.
2. **Embed it as a sidecar** (`createAgentNativeEmbeddedPlugin` and
   `<AgentNativeEmbedded>`). The plugin is a **Nitro plugin**
   (`AN embedded.ts:221–231`). It uses "the configured `DATABASE_URL` to manage
   its own framework tables", and the docs recommend a "dedicated Agent-Native
   database/schema" (`AN embedding-sdk.mdx:64–77,171–183`). That database must
   be Postgres. trainm8 would run a second runtime and a second database next to
   Express and SQLite. Its actions would need to reach trainm8's Prisma code
   either in the same process (no documented Express mount, inference) or over
   HTTP. The drop-in chat brings Radix, assistant-ui and tiptap UI into a Base
   UI app.
3. **Use only AgentKit.** `@agent-native/agentkit` is "provider-neutral so
   another backend can implement the transport contract directly instead of
   adopting the whole framework" (`AN agentkit.mdx:8–15`). It is the most
   library-like piece. But it was first published on 2026-09-14 (npm), its
   protocol already had a breaking v2, and its React bindings are in Toolkit
   (Radix). It provides the chat protocol only, not actions, context or
   approvals.

### 5.4 The principles, carried into trainm8 (sketch)

**(a) One typed operation registry behind route actions, agent tools and MCP.**
trainm8's server functions already have the right shape: they are owner-scoped,
take typed inputs, and return typed result unions. What is missing is a
**registry** that names each one, describes it for a model, declares its kind,
and gives it a JSON-native input schema. The form schema (strings, because
"every form value is" a string, `TM week-change-schema.ts:29–41`) and the agent
schema (numbers) can differ. agent-native solved the same problem with
`agentInputSchema` (`AN action.ts:377,617–622`). A proposal sketch follows. It
uses the sibling notes' names, `defineAction` in `app/actions/`; this note says
_operation_ for one registry entry, to keep it apart from a route's `action`.
The full field list (scopes, `confirm`, output schema, provenance) is the MCP
note's §8.1, which proposed ADR 0092 would fix. It is **not code that exists**:

```ts
// app/actions/define.server.ts — PROPOSED, does not exist
export type ActionCaller = 'web' | 'agent' | 'mcp'
export type ActionKind = 'read' | 'propose' | 'write' // as in the MCP note §8.1
export function defineAction<I extends z.ZodTypeAny, R>(op: {
	name: string // 'answer-week-proposal'
	description: string // what a model reads; English, like the code
	kind: ActionKind // read → training:read; else a write scope (MCP note §3.4)
	input: I // JSON-native; the Conform form schema maps onto it
	needsAthleteYes?: (input: z.infer<I>, userId: string) => Promise<boolean>
	run: (
		ctx: { userId: string; caller: ActionCaller },
		input: z.infer<I>,
	) => Promise<{ ok: true; value: R } | { ok: false; reason: string }>
}) {
	/* register, return op */
}
```

Route actions keep Conform and call
`runAction(name, { userId, caller: 'web' }, input)`. The agent and MCP adapters
turn `{ ok: false, reason }` into a **tool error**. agent-native's failure
contract (§2.3) is the reason: a refusal returned as data reads like success.
Refusal text comes from `labels.ts`, as the route's does today
(`TM week-change.tsx:56–59`).

**(b) Screen context without a state table.** (inference) trainm8 runs one
long-lived Express server per region. The client can send
`{ pathname, search, focusedSessionId? }` with each chat turn. A read operation,
`view-screen`, then hydrates the current I dag week or Sesong block from the
database, which is agent-native's "agent's eyes"
(`AN context-awareness.mdx:247`) without its `application_state` table. That
table exists for serverless hosts and outside agents (§2.6). An MCP client has
no screen at all, so the operations must work without context, and a deep link
(agent-native's `link`) should send the athlete back to the right place.

**(c) Agent writes go through ADR 0080 and 0053, not around them.**

- The agent is a **second `ProposalAuthor`** and a **caller** of the
  deterministic `SeasonGenerator`. It is never a second writer of sessions. What
  it produces lands as `WeekReplanProposal` rows, so silence, scope and load
  direction keep working unchanged (`TM docs/adr/0080-…:92–129`).
- **An agent's "Ok" is not the athlete's yes.** ADR 0080 §3 requires "an
  explicit yes" for the athlete's own sessions, and the load rule requires one
  for added load. When an `agent` or `mcp` caller answers a proposal that
  touches an athlete-owned session or adds load, the result should be
  `needs-athlete-yes`. The athlete then confirms on the Ukeskiftet card. An MCP
  approval round trip bound to the arguments (agent-native's content-addressed
  approval, §2.5, §2.9.1) would be a second route, but neither Claude nor
  ChatGPT documents in-call confirmation or elicitation (MCP note §6.6, §10.4),
  and a host's tool-approval click is not the athlete's yes (MCP note §6.2).
  Plan for the card, or for the MCP note's app-only widget (§5.2 there).
- **Undo travels with the result.** ADR 0088's tokens (`markedDoneAt`,
  `linkAnsweredAt`, a stamp id) should come back in the operation's result, and
  each write should have an `undo-*` operation. Then an MCP client or a chat
  reply can offer _Angre_. A toast cannot exist there, and a 10-second window
  makes no sense in a conversation (`TM docs/adr/0088-…:65–72`). Wherever the
  result passes through a model, the token stays server-side behind an opaque,
  user-bound handle, because the browser's token carries prior state that a
  model could alter (MCP note §6.4).

**(d) "Never fabricate a number" is trainm8's job alone.** agent-native has no
domain guard for this. Its closest rule is the "absent vs unreadable" one
(`AN AGENTS.md:90–96`). (inference) What trainm8 would need:

- Every operation that returns a metric returns `unavailable` members the way
  `GeneratedSeason` does (`TM docs/adr/0053-…:84–90`). An absent number is never
  a zero or a gap.
- Numbers in a proposal's `reason` are filled from the payload by `labels.ts`
  templates, never written by the model. ADR 0080 already reads load direction
  "off the payload … never authored" (`TM docs/adr/0080-…:96–98`).
- Evals in the spirit of `AN evals.mdx` check that the agent says _Unavailable_
  when a tool says unavailable.

### 5.5 trainm8 as an MCP server

This is the cheapest way to make trainm8 agent-operable in running cost (not in
build effort: its OAuth work is L on today's auth, or about 1–2 weeks after a
3–5 week move to Better Auth, §6), and it fits trainm8's stance:

- The athlete's own Claude or ChatGPT subscription pays for the tokens. That is
  the same argument agent-native's pricing page makes, and it means no key and
  no model latency in trainm8's request path (ADR 0053).
- The registry in §5.4(a) is the tool source, so the "same operation, every
  surface" property holds.

What to copy from agent-native's MCP server:

- scopes derived from the kind (`AN build-server.ts:422–431`);
- `readOnlyHint` and `destructiveHint` annotations derived from the operation
  (`:3200–3206`);
- a compact catalog with a search tool;
- a deep link back into the app on every write result;
- a one-time approval bound to the caller and the arguments hash
  (`AN approval-store.ts`), once hosts can carry one (§5.4c);
- membership re-checked on every request.

What to leave out: `ask-agent`, A2A, `publicAgent`, WebMCP. They need an in-app
agent, other apps, or public exposure, and trainm8 has none of these.

The limit to keep in mind (inference): trainm8 does not control the host's
prose. A host model can still restate a number wrongly. Mitigations are explicit
`unavailable` fields, MCP Apps UI that renders trainm8's own numbers, and links
back to the app. A harder limit is legal, not technical: each origin platform's
terms decide what may cross this surface, and Strava's API Policy would keep
Strava-derived data off it entirely if Strava returned (§7). The protocol, OAuth
and host details are in
[`mcp-server-for-trainm8.md`](mcp-server-for-trainm8.md).

---

## 6. Options

Effort is a T-shirt size for one developer working with agents. It is
**inference**, based on the counts above. E's follows the MCP note's own phase
estimates (§9 there), whose OAuth work alone is L on today's auth. C+ re-bases
it on [`stack-migration.md`](stack-migration.md) §7, where MCP OAuth takes about
1–2 weeks after a 3–5 week Better Auth move.

| Option                                                                                                                                                                                                        | Effort                                                                                                                                  | Risk       | What we gain                                                                                                                                                                 | What we lose                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Adopt agent-native as the app framework**                                                                                                                                                                | XL (about 6–10 months, [open-stack note](agent-native-open-stack.md) §5)                                                                | Very high  | Chat UI, MCP server with OAuth, A2A, skills and memory in SQL, approvals, audit log, evals, automations, a parity discipline. All of it maintained by someone else           | The loader/session SSR model: the session cookie is stripped from every SSR request, so every logged-in page fetches client-side. A Nitro 3 beta runtime; about 6–7 app-facing breaks a month; a team-tool ownership model; Base UI chrome; much of the ADR body that depends on them. (SQLite, LiteFS, Prisma and React Router 7 were losses too, until the owner opened the stack.) trainm8 would be tied to an alpha framework that breaks APIs in minors, with one dominant author |
| **B. Embed or use parts as a library** (sidecar plugin, or AgentKit only)                                                                                                                                     | L                                                                                                                                       | High       | In-app chat and an MCP server without writing them; AgentKit's chat protocol                                                                                                 | A second runtime (Nitro) and, until trainm8 is on Postgres, a second database next to Express and SQLite, which contradicts "Limit Services". Two auth systems bridged. An imported Radix chat UI. An upgrade tax on every release. AgentKit alone gives a chat protocol and none of the hard parts. With Postgres it collapses into a companion app ([open-stack note](agent-native-open-stack.md) §8)                                                                                |
| **C. Build a small agent-native layer in trainm8**: an operation registry, screen context, the agent as `ProposalAuthor`, undo tokens, an honesty guard                                                       | S–M per phase                                                                                                                           | Low–medium | Principles that fit trainm8's existing seams (ADR 0053, 0080, 0088). No new services. Reuses the zod schemas and result unions already there. Every step can ship on its own | We write and own what agent-native gives free: tool-schema derivation, an approval handshake, an eventual chat UI and loop. A chat UI is real work if we ever want one                                                                                                                                                                                                                                                                                                                 |
| **C+. C on agent-native's stack minus the framework** (recommended, with E): Better Auth first (with `@better-auth/mcp` + `@better-auth/cimd` for MCP OAuth), Postgres on a trigger, Drizzle after its 1.0 GA | Better Auth about 3–5 weeks, then MCP OAuth about 1–2 weeks; Postgres and Drizzle later ([`stack-migration.md`](stack-migration.md) §7) | Low–medium | C's gains, plus maintained auth and a bought MCP authorization server. The stack converges on agent-native's, so adopting it at 1.0 stays possible                           | C's costs, plus Better Auth's breaking minors and one forced sign-in (2FA users re-enrol). Postgres on Neon or Fly MPG moves the app out of `arn` ([`stack-migration.md`](stack-migration.md) §5.1, §8)                                                                                                                                                                                                                                                                                |
| **D. Do nothing**                                                                                                                                                                                             | 0                                                                                                                                       | Low now    | No LLM cost, no risk of fabricated numbers, focus stays on the North-star                                                                                                    | No agent can operate trainm8. The "AI later" seams stay unused. Route actions remain the only API, and the intents scattered across route files make a later agent layer harder                                                                                                                                                                                                                                                                                                        |
| **E. trainm8 as an MCP server** (built on C's registry, no in-app agent at first)                                                                                                                             | L on today's auth; about 1–2 weeks of MCP OAuth after Better Auth (C+)                                                                  | Medium     | Claude and ChatGPT users can operate trainm8 now, paid by their own subscription. No model key in trainm8. It tests the operation registry against a real outside caller     | OAuth and connector work: ~4–8 weeks with the reads and writes on today's auth (MCP note §9); with Better Auth first, MCP OAuth with Claude lands at about weeks 4–7 from today ([`stack-migration.md`](stack-migration.md) §1.3). Each origin platform's terms decide what may cross (§7). No control over the host's prose. Undo UX happens outside trainm8; the athlete's yes comes back to its own card                                                                            |

**Recommended: C+ with E** (§7). A′ (a fresh scaffold with the domain ported)
and the forks F1–F3 are priced in the verdict table of
[`agent-native-open-stack.md`](agent-native-open-stack.md#verdict-table): a hard
fork would own about 887 k lines, and only small leaf modules are worth
transplanting.

**Origin-platform terms bound every option that puts a model near the data**
(§7): Garmin's written approval and attribution, Polar's explicit permission,
and, for any health data, GDPR's explicit consent and a DPIA. If Strava returns,
A, B, C's agent and E may expose or feed a model only non-Strava data (Strava
API Policy §5.16(b), §5.3). Even D is bound by Policy §6.2's seven-day cache for
the Strava rows still stored (MCP note §6.1).

---

## 7. Recommendation

**Build our own layer (C+), on agent-native's stack minus the framework, and
make the MCP server (E) its first external surface. Do not adopt, embed or fork
agent-native.** This note first rested the verdict on stack conflicts: Postgres,
Nitro and React Router 8 against SQLite, Express and React Router 7. Those are
gone, because the owner will move to Better Auth, Postgres and Drizzle in that
order: Better Auth on today's Prisma + SQLite, then MCP OAuth through
`@better-auth/mcp` + `@better-auth/cimd` + `jwt()`, then Postgres when a trigger
fires, then Drizzle after its 1.0 GA
([`stack-migration.md`](stack-migration.md)). What still settles it
([`agent-native-open-stack.md`](agent-native-open-stack.md)):

- agent-native strips the session cookie from every SSR request, so every
  logged-in page would fetch client-side;
- its server runtime is the Nitro 3 beta;
- it ships about 6–7 app-facing breaks a month;
- its ownership model is a team tool's;
- adopting it (A) would take about 6–10 months;
- a fork would own about 887 k lines.

And everything that makes its principles valuable already has a trainm8-shaped
home: the `ProposalAuthor` and `SeasonGenerator` seams, the ownership gate,
preview-first approval and token-guarded undo. A small registry connects them to
an agent.

**Origin-platform terms decide what C+ and E may show a model.** trainm8 no
longer uses Strava. Data comes straight from the watch vendors, with
Intervals.icu as a temporary bridge, and each one's terms bind
([`watch-data-sources.md`](watch-data-sources.md) §6; the per-vendor summary is
in
[`mcp-server-for-trainm8.md` §6.1](mcp-server-for-trainm8.md#61-the-strava-gate-a-new-reason-for-an-unavailable-metric)):

- **Garmin:** a direct integration needs written §5.2(o) approval naming the MCP
  clients, and its brand guidelines require attribution on AI output, preserved
  downstream, for Garmin data from any route, Intervals.icu included. Its
  program has been closed to new applicants since 2026-03-25, and Intervals.icu,
  trainm8's only Garmin source, expects to block Garmin data soon.
- **Polar** needs the athlete's explicit permission.
- **Health data:** training data is Art. 9 health data, so an agent needs
  explicit consent and a DPIA
  ([`ai-product-privacy-cost.md`](ai-product-privacy-cost.md) §3).

Proposed ADR 0096 records the origin platform behind every value, and the
registry applies that platform's terms (proposed ADR 0098). A value the terms
forbid goes out as an Unavailable Metric with a `source-terms` reason.

**If Strava returns, its terms are stricter still.** They also bind today for
Strava-sourced rows still stored, for Strava data still arriving through a
connection made before Strava was hidden, and for stubs arriving through
Intervals.icu ([`watch-data-trainm8-ingest.md`](watch-data-trainm8-ingest.md)
§6.2–6.3). The MCP note verified Strava's API Policy (effective 2026-06-01;
[`mcp-server-for-trainm8.md` §6.1](mcp-server-for-trainm8.md#61-the-strava-gate-a-new-reason-for-an-unavailable-metric)).
§5.16(b) forbids operating any MCP server that exposes Strava Data. §5.3 forbids
Strava Data, or anything derived from it, in the operation of any AI
Application, ingestion into a context window included. §5.10 says the athlete's
consent does not cure it. So the MCP server, any in-app agent and any LLM
`ProposalAuthor` may only see non-Strava data: plan data the athlete wrote,
their own logs and uploaded files, and Intervals.icu imports (a direct Garmin
integration would need Garmin's written approval first, its §5.2(o)). Every
Strava-derived value goes out as an Unavailable Metric with a `source-terms`
reason. For Strava data itself, the legitimate path is Strava's own MCP, which a
Strava subscriber can connect to the same assistant beside trainm8's (Policy
§3.5). The verdict stands either way; the terms narrow what the first slice can
show a model (§7.2, Phase 1).

### 7.1 What to borrow

| From agent-native                                                          | Why                                                                          | Source                                                     |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------- |
| One definition per capability, with every surface derived from it          | A capability cannot drift between the UI and the agent                       | `AN actions-overview.mdx:8`                                |
| A failure contract: refusals are typed errors, never success-shaped data   | A refusal returned as data reads as success to an agent                      | `AN actions-defining.mdx:302,389`                          |
| `readOnly` / kind drives MCP scopes and annotations                        | One flag, no second policy                                                   | `AN build-server.ts:422–431,3200–3206`                     |
| Approval bound to name + arguments, one-time, failing closed               | An approval cannot be replayed onto a different call                         | `AN production-agent.ts:7584–7615`; `AN approval-store.ts` |
| A small tool surface: patch-style updates, UI-only flags, deferred schemas | Model accuracy and token cost                                                | `AN actions-defining.mdx:391–399`                          |
| A parity matrix with tests                                                 | Turns "the agent can do what the UI can" from a hope into a checked artifact | `AN templates/content/parity/`                             |
| Evals that run the real loop, gated in CI                                  | The only way to test "never fabricate" end to end                            | `AN evals.mdx:1–15`                                        |
| "UIs do not call LLMs directly"                                            | One AI surface to audit. Fits ADR 0053's no-model-in-request-path stance     | `AN AGENTS.md:258`                                         |

**What not to borrow:**

- Postgres `application_state` (trainm8 does not need it, §5.4b).
- The public-shell SSR rule.
- Agent resources stored in SQL. trainm8 has one athlete per account and needs
  no per-user skills.
- A2A.
- Agent-editable app code (`AN AGENTS.md:274`).

### 7.2 Phased plan

**Phase 0: the decisions, written down (two ADRs, proposed 0092 and 0093; 0091
is the newest in `docs/adr/`).**

1. **0092**, _"Operations are the one typed surface behind route actions, agent
   tools and MCP."_ It defines `defineAction` in `app/actions/`, its kinds, the
   failure contract (`{ ok: false, reason }` becomes a tool error with a
   `labels.ts` message), JSON-native input beside the Conform form schema, and
   the `Reading` union with its `source-terms` reason and provenance gate, which
   keys on each value's origin platform (0096) and applies that platform's terms
   (0098). The MCP note's §8.4 is its fuller outline.
2. **0093**, _"An agent is a proposal author and a generator's caller, never a
   session writer; its 'Ok' is not the athlete's yes."_ It **amends ADR 0080 §3
   and §6** by naming the agent author and the `needs-athlete-yes` result. It
   **amends ADR 0053 §1**: a model may arrive as a _caller_ of the seam through
   an operation, not only as a second implementation. It **amends ADR 0088** so
   that undo tokens are part of an operation's result (as opaque, server-held
   handles wherever a model sees them). The MCP note's §8.4 items 5–6 are the
   same amendments.

The later ADRs, numbered the same way across the research notes:

- **0094**: Better Auth owns login and is the MCP authorization server, with
  node-oidc-provider as the fallback (MCP note §3.3, §8.4;
  [`stack-migration.md`](stack-migration.md)).
- **0095**: the in-app agent, on Bedrock `eu-north-1`, behind a paid tier, after
  a DPIA ([`ai-product-privacy-cost.md`](ai-product-privacy-cost.md) §5).
- **0096**: activity provenance and cross-provider identity
  ([`watch-data-trainm8-ingest.md`](watch-data-trainm8-ingest.md)).
- **0097**: workout export (same note).
- **0098**: source terms per origin platform (same note).

**Phase 1: the first vertical slice, Ukeskiftet (read and answer).**

Why this slice:

- It is the North-star surface: "your plan adapts to what you actually did"
  (`TM GOAL.md:86–98`).
- ADR 0080 §6 has already decided that AI writes here.
- Every piece is already typed: the zod union
  (`TM week-change-schema.ts:48–60`), the result unions
  (`TM week-replan-answers.server.ts:38–68`), the ownership gate and the
  proposal storage.
- It is small: one 70-line resource route with three intents.
- Answers are the riskiest writes ADR 0080 regulates. Getting the agent's gate
  right here sets the pattern for the rest.

**Origin-platform caveat** (revised 2026-10-11; this was a Strava caveat). Week
Replan proposals are computed from Weekly Plan Adherence and TSB
(`decideWeekReplan`, `TM app/utils/load/week-replan.ts:250`), and the reason
prints the TSB. Building the slice behind its own route is untouched by that,
because no model sees it.

In front of a model, those inputs carry their origin platform's terms. For
Garmin-sourced load, Garmin's attribution goes on the output ("Insights derived
in part from Garmin device-sourced data"), and a direct Garmin integration also
needs written §5.2(o) approval. Polar-sourced load needs explicit permission.
For athletes whose data is not from Strava, that is no longer a grey zone. The
MCP note's §6.1 analysis ("generated using Strava Data"; treat as no) applies
only if Strava returns, or to Strava-sourced rows still stored.

Applying origin-platform terms needs the origin platform on every value
(proposed ADR 0096), and that does not exist yet. Until it does, the cleanest
slice to put in front of a model is still athlete-authored plan data, the I dag
composer ([`agent-layer-trainm8-surface.md`](agent-layer-trainm8-surface.md) §7,
re-ranked there).

Operations in the slice:

- `get-week-change` (read; wraps `readWeekChange`)
- `answer-week-proposal` (write; wraps `answerProposal`, with `needsAthleteYes`
  when the target is athlete-owned or the payload adds load)
- `accept-round` (write; same gate, since a factor above 1 adds load)
- `ease-week` (write; it reduces load, but it scales every planned session in
  the week, the athlete's own included, so ADR 0080 §3's gate applies whenever
  an athlete-owned session is in that week. ADR 0080 calls this tap "the
  athlete's own yes", which an agent cannot give on their behalf)

Where the code lives:

- `app/actions/` for `define.server.ts`, `registry.server.ts` and
  `week-change.server.ts`. The MCP adapter goes in `app/mcp/` (MCP note §8.3).
- `app/routes/resources/week-change.tsx`, which keeps Conform and calls through
  the registry.

Tests:

- One vitest file per operation, covering owner scoping (404), every refusal
  reason, and the gate for each caller.
- A **parity test** that every `intent` in `WeekChangeActionSchema` maps to an
  operation. This is the trainm8 version of agent-native's parity matrix.

**Phase 2: MCP (E), which is the MCP note's Phases 0–2.** Read-only on a dev
token, then OAuth and the Claude connector, then proposals and the composer's
writes with undo handles: about 4–8 weeks in that note's original estimates (§9
there), most of it the authorization server. With Better Auth first, the
authorization server takes about 1–2 weeks after a 3–5 week login move, and MCP
OAuth with Claude lands at about weeks 4–7 from today
([`stack-migration.md`](stack-migration.md) §1.3, §7). Expose the Phase 1
operations, using the auth and transport the sibling doc recommends, behind the
provenance gate (§7): `get-week-change` as a tool, the answering operations
app-only (the MCP note's `answer_proposal`, §7 there), so the model never
answers. The athlete answers on the Ukeskiftet card or in that widget, not
through an in-call approval round trip (§5.4c). Write results carry a deep link
to I dag. Read-only scope first. The wider tool surface is designed in
[`mcp-server-for-trainm8.md`](mcp-server-for-trainm8.md), not here.

**Phase 3: more operations, then undo.** The composer's `write-session`, _Gjort_
and their undo reach MCP in Phase 2. Add the rest of the I dag composer intents
(`stamp-day`, `undo-stamp`) to the registry. Each write returns its undo (ADR
0088's token, or an opaque handle wherever a model sees it, §5.4c), and each has
an `undo-*` operation. Then add `view-screen` (§5.4b) for whenever an in-app
chat exists.

**Phase 4 (only if wanted): an LLM `ProposalAuthor`, proposed ADR 0095 (the MCP
note's Phase 3).** Its facts (adherence, TSB) carry their origin platform's
terms (§7), and any Strava-derived fact would reach it only as `source-terms`.
Later research puts it on Bedrock `eu-north-1`, behind a paid tier, after a DPIA
([`ai-product-privacy-cost.md`](ai-product-privacy-cost.md) §5). It needs an
async `ProposalAuthor` (the widening ADR 0053 §1 foresaw). Its output is
validated by the existing proposal union. Reasons are rendered from `labels.ts`
templates filled from the payload. Evals check its honesty. Whether trainm8
should hold a model key at all, or leave all reasoning to the athlete's MCP
host, is the owner's call (see Open questions).

---

## 8. Open questions

1. **Does the athlete want an in-app chat at all,** or is an MCP host (Claude,
   ChatGPT) the whole agent story? That decides whether Phase 4 and any chat UI
   exist. It is an owner call, like ADR 0016 §8's provider.
2. **Who confirms a `needs-athlete-yes` that comes from MCP?** Only the
   Ukeskiftet card, or also the host's approval prompt? Is an MCP approval an
   "explicit yes" in the sense of ADR 0080 §3? The MCP note's answer: not the
   host's prompt (it approves a call, not a change, and "Always allow" exists,
   §6.2 there); the card, or an app-only widget button. Claude's and ChatGPT's
   support for elicitation is unverified (§10.4 there).
3. **zod 3.25 → JSON Schema.** Tool schemas need JSON Schema. trainm8 is on zod
   3.25.76 (`TM package.json:122`). It ships a `zod/v4` subpath whose
   `toJSONSchema` converts v4 schemas only, and trainm8's schemas use the v3 API
   (`from 'zod'`). `zod-to-json-schema` 3.25.2 is installed, but only
   transitively (through `shadcn`'s `@modelcontextprotocol/sdk`). Answered in
   [`agent-layer-building-blocks.md`](agent-layer-building-blocks.md) §9.3:
   write the registry's new schemas in `'zod/v4'` now (zod 3.25.76 ships it, so
   the pin need not move), and upgrade to zod ≥ 4.2 before the MCP server ships,
   because MCP SDK v2 needs a schema's `~standard.jsonSchema`.
4. **Does a proposal's `reason` stay template-only** when an LLM authors
   proposals (ADR 0081), or may a model write free prose there?
5. **How long does undo last on an agent or MCP surface?** ADR 0088's 10 seconds
   is a UI clock. A conversation needs a different bound, or none.
6. **Is an agent or MCP write a "machine" write** for ownership (ADR 0080), even
   when the athlete asked for it in chat?

---

## ADRs this research challenges

Each ADR below was read before being cited.

| ADR                                                                                    | What it decided                                                                                                     | What the evidence says                                                                                                                                                                                                                                                                                                                                                                                                 | Verdict                                                                                                                                                               |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0016** AI plan generation: native, typed, Event-anchored, preview-first (superseded) | Typed output, preview → approve → persist; §8 a hosted Claude provider (not in force)                               | Preview-first and typed output are what agent-native also arrives at: approvals before side effects, schemas as contracts (§2.3, §2.5). §8 is not in force; if a provider ever returns, it need not mean "trainm8 holds a key": with BYO-key engines and MCP hosts, the provider can be the athlete's (§5.5). Whether trainm8 holds a key at all is the owner's call (§7.2 Phase 4)                                    | **Confirm** (§5); §8 stays not in force. An in-app provider is proposed ADR 0095's: Bedrock `eu-north-1` ([`ai-product-privacy-cost.md`](ai-product-privacy-cost.md)) |
| **0053** Season generation is deterministic behind the seam                            | A pure `SeasonGenerator`; a model arrives later as a second implementation; nothing reaches the calendar unapproved | Purity and preview are confirmed. agent-native suggests another place for a model: as a **caller** of a deterministic operation (the agent picks inputs, the rules generate), not only as a replacement implementation. That keeps §2's purity and regenerate-on-approve, and §8's preview-first rule, intact                                                                                                          | **Amend** (§1), in proposed ADR 0093                                                                                                                                  |
| **0080** Week Replan proposes, and the athlete's sessions need a yes                   | Proposals; silence applies only machine, load-reducing changes; §6 "AI later writes the same proposals"             | Confirmed as the right landing place for agent writes. It needs one extension that agent-native's `needsApproval` makes concrete: when an agent or MCP caller answers, that is **not** the athlete's yes. The athlete answers on the Ukeskiftet card; content-addressed, single-use approval (§2.5, §2.9.1) waits on host support (§5.4c)                                                                              | **Confirm** (and extend §3, §6 in proposed ADR 0093)                                                                                                                  |
| **0088** Every write on I dag is undone from its toast and its landed row              | Toast + landed row carry _Angre_ for 10 s; undo is an owner-scoped delete or a token-guarded restore                | The rule is right and its mechanism is UI-only. Agent and MCP writes have no toast and no visible row. The undo token must be part of the write's **result**, with an `undo-*` operation, so every surface can offer the way back (behind an opaque handle wherever a model sees it, §5.4c)                                                                                                                            | **Amend** (in proposed ADR 0093)                                                                                                                                      |
| **0081** The planning redesign speaks Norwegian and `labels.ts` owns every word        | Every athlete-facing word comes from `labels.ts`                                                                    | Holds for an operation layer: refusals and reasons come from `labels.ts`. It becomes a live question the day an LLM authors a proposal `reason` (Open question 4)                                                                                                                                                                                                                                                      | **Confirm** (with a pending question)                                                                                                                                 |
| **Decision 003** SQLite                                                                | SQLite on LiteFS as a deliberate simplification                                                                     | agent-native keeps all state in SQL because it assumes stateless serverless hosts (`AN key-concepts.mdx:444,485`). The docs I read do not say why that SQL must be Postgres. Nothing in the _principles_ needs Postgres (inference). The conflict is with the framework, not with the idea The owner has since opened the stack: Postgres comes when a trigger fires ([`stack-migration.md`](stack-migration.md) §1.2) | **Confirm** until a trigger fires; then superseded by Postgres ([`stack-migration.md`](stack-migration.md))                                                           |
| **0085** The design system is shadcn base-luma on Base UI                              | Base UI primitives, one motion scale                                                                                | agent-native's chat and toolkit UI is Radix-based (`AN packages/toolkit/package.json`). Importing it would split the design system. One more reason against B                                                                                                                                                                                                                                                          | **Confirm**                                                                                                                                                           |

---

## Sources

**agent-native repository** (`github.com/BuilderIO/agent-native` at
`1284000325bfd1f9f79c75eb4ea143d36fce6017`):

- `README.md`, `PRODUCT.md`, `AGENTS.md`, `pnpm-workspace.yaml`,
  `agent-native.json`
- `packages/*/package.json`; `packages/core/CHANGELOG.md`,
  `packages/core/changelog/archive/CHANGELOG.md`,
  `packages/core/migration-manifest.json`
- `packages/core/src/action.ts`; `server/action-discovery.ts`,
  `server/action-routes.ts`, `server/agent-chat-plugin.ts`,
  `server/embedded.ts`, `server/prompts/framework-core.ts`,
  `server/agent-chat/action-filters-a2a.ts`
- `packages/core/src/agent/production-agent.ts`, `agent/engine/builtin.ts`,
  `agent/default-agent-engine.ts`
- `packages/core/src/mcp/build-server.ts`, `mcp/server.ts`,
  `mcp/approval-store.ts`
- `packages/core/src/application-state/store.ts`, `script-helpers.ts`
- `packages/core/src/client/use-action.ts`, `client/use-db-sync.ts`,
  `client/analytics.ts`
- `packages/core/src/vite/action-types-plugin.ts`
- `packages/core/src/cli/telemetry.ts`, `cli/sentry-telemetry.ts`
- `packages/core/src/checkpoints/service.ts`, `review/suggestions/types.ts`
- `packages/shared-app-config/templates.ts`
- `templates/chat/` (`package.json`, `vite.config.ts`, `react-router.config.ts`,
  `actions/view-screen.ts`, `actions/navigate.ts`)
- `templates/forms/actions/update-form.ts`,
  `templates/forms/app/hooks/use-forms.ts`
- `templates/content/parity/` (`README.md`, `matrix.ts`)
- `scripts/guard-*`

**agent-native docs** (`packages/core/docs/content/*.mdx`, served at
`https://www.agent-native.com/docs/<slug>/`): `what-is-agent-native`,
`key-concepts`, `getting-started`, `actions-overview`, `actions-defining`,
`actions-access-control`, `context-awareness`, `server-database`, `deployment`,
`authentication`, `agent-resources`, `drop-in-agent`, `embedding-sdk`,
`agentkit`, `mcp-protocol`, `mcp-clients`, `external-agents-catalog`, `webmcp`,
`a2a-protocol`, `real-time-collaboration`, `evals`, `tracking`, `observability`,
`versioning-and-stability`, `toolkit-history`, `postgres`.

**agent-native.com pages** (fetched 2026-10-11):

- https://www.agent-native.com/
- https://www.agent-native.com/docs/
- https://www.agent-native.com/apps/
- https://www.agent-native.com/pricing/
- https://www.agent-native.com/about/
- https://www.agent-native.com/terms/

**git history.** A commits-only clone of `BuilderIO/agent-native` (7,301
commits): first commit `9a2cf431` (2026-03-12); `cc2a915a` "Remove non-Postgres
database support" (2026-09-04); `33499706` release 0.206.0 (2026-10-09).

**npm registry** (2026-10-11):

- `npm view @agent-native/core versions | time | dist-tags | license`
- `npm view @agent-native/core@1.0.0 deprecated`
- `npm view @agent-native/toolkit`
- `npm view @agent-native/agentkit`

**trainm8** (`6638406`):

- `GOAL.md`, `CLAUDE.md`, `package.json`, `fly.toml`, `prisma/schema.prisma`,
  `server/index.ts`
- `docs/adr/0016-…`, `0053-…`, `0080-…`, `0081-…`, `0088-…`
- `docs/decisions/003-sqlite.md`, `docs/guiding-principles.md`, `GLOSSARY.md`
  (Session Source, Session Adoption, Unavailable Metric, Tab Bar)
- `app/utils/env.server.ts`, `app/utils/plan-generation/generator.ts`,
  `app/utils/session-ownership.ts`, `app/utils/load/propose-week-change.ts`,
  `app/utils/load/week-replan-answers.server.ts`,
  `app/utils/load/week-change-schema.ts`
- `app/routes/resources/week-change.tsx`,
  `app/routes/resources/imports-events.tsx`, `app/routes/_home/index.tsx`

### Not verified from a primary source

- **The GitHub star count (7.1k)** is read from the agent-native.com header
  badge. The GitHub REST API was not reachable from this session (HTTP 403), so
  stars, open issues and the GitHub contributor list were not checked against
  GitHub itself.
- **The roles of the people in the commit history** (for example, whether the
  top committer is a Builder.io executive) are not stated in any source I read
  and are not claimed here.
- **Whether `createAgentNativeEmbeddedPlugin` can be mounted inside Express.**
  No doc describes it. The statement that it needs a Nitro host is read from the
  plugin's signature.
- **Effort sizes** in §6 are estimates (inference), not measurements.
