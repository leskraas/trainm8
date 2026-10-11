# Agent building blocks for a trainm8-owned agent layer

The libraries and protocols trainm8 could build its own agent layer from, if it
carries Builder.io agent-native's principles into the Epic Stack codebase rather
than adopting the framework: shared typed actions, shared state, an agent that
knows what is on screen, and agent writes that are visible and undoable in the
UI. Ends with a recommended minimal stack and what trainm8's zod 3 pin means for
each piece.

> **Research note · 2026-10-11.** Written from **primary sources**: official
> docs, official repositories, specifications and the npm registry, with the URL
> inline at each claim. The trainm8 side was read at commit `6638406`. A
> verification pass the same day re-ran `npm view` for every package version and
> date below (all matched), re-fetched 15 of the cited pages for the key API
> claims, and checked the zod claims in the packages themselves: run against
> trainm8's installed `@anthropic-ai/sdk` 0.102.0 and zod 3.25.76, and read in
> the published source of `@modelcontextprotocol/server` 2.3.1 and
> `@ai-sdk/provider-utils` 5.0.58. Corrections were made in place.
>
> **Sibling documents.** [`agent-native.md`](agent-native.md) analyses the
> agent-native framework itself, which is out of scope here, and asks whether to
> adopt it. [`mcp-server-for-trainm8.md`](mcp-server-for-trainm8.md) is the MCP
> deep-dive, which is why MCP gets only a short summary in §2.
> [`agent-layer-trainm8-surface.md`](agent-layer-trainm8-surface.md) inventories
> the repo side: the write paths, read paths and safety rails these blocks would
> wrap.
>
> **Later research.** [`agent-native-open-stack.md`](agent-native-open-stack.md)
> re-asks adopt, fork or build with the stack open.
> [`agent-platforms.md`](agent-platforms.md) compares other foundations.
> [`stack-migration.md`](stack-migration.md) sequences Better Auth, MCP OAuth,
> Postgres and Drizzle. [`watch-data-sources.md`](watch-data-sources.md) and
> [`watch-data-trainm8-ingest.md`](watch-data-trainm8-ingest.md) cover watch
> data, each vendor's AI and MCP terms, and import provenance.
> [`ai-product-privacy-cost.md`](ai-product-privacy-cost.md) covers privacy,
> regulation, model residency and cost. [`agent-strategy.md`](agent-strategy.md)
> pulls the notes into one strategy.

**Method.** Some doc pages came back through a summarising fetcher, so excerpts
marked _condensed_ are trimmed; their identifiers and shapes match the source.
Versions and dates come from the npm registry (`npm view <pkg> version time`,
2026-10-11). Statements marked _inference_ or _assessment_ are this note's
reasoning, not a source's.

**trainm8 baseline** (`package.json`, `.nvmrc`, `other/Dockerfile`):

- `react-router` and `@react-router/express` ^7.13.0, `react` ^19.2.4, Node
  ^22.18.0 on `node:22-bookworm-slim`.
- `zod` ^3.25.76, installed 3.25.76. All 81 zod imports in `app/`, `server/` and
  `.sandcastle/` are `from 'zod'`, which on zod 3.25 is the **zod 3 API**. The
  same package also ships the zod 4 API at the `zod/v4` subpath; nothing in the
  repo uses it yet. `@conform-to/zod` is 1.16.0 (peer `zod ^3.21.0 || ^4.0.0`,
  with a `/v4` entry point).
- `@anthropic-ai/sdk` ^0.102.0, unused (latest is 0.133.0). On a 0.x version the
  caret admits only 0.102.x, so reaching 0.133 is an explicit edit.

---

## 1. Anthropic Claude API + `@anthropic-ai/sdk` (TypeScript)

**Problem it solves.** It calls Claude with tools you define
(https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview). The
basic loop:

- Claude replies with `stop_reason: "tool_use"` and one or more `tool_use`
  blocks.
- "Your code executes the operation and sends back a `tool_result`."
- Server tools such as `web_search`, `code_execution` and `tool_search` run on
  Anthropic's infrastructure instead.

**Tool runner (beta).** The SDK can drive this loop for you.

- It "handles the agentic loop, error wrapping, and type safety". It runs tools,
  manages conversation state and validates input. It is "in beta" in all seven
  SDKs.
  (https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-runner)
- Zod tools use `betaZodTool` from `@anthropic-ai/sdk/helpers/beta/zod`, which
  the docs say "requires Zod 3.25.0 or higher". A JSON Schema variant,
  `betaTool` from `@anthropic-ai/sdk/helpers/beta/json-schema`, needs no Zod.
  (same page;
  https://github.com/anthropics/anthropic-sdk-typescript/blob/main/helpers.md)
- **What "Zod 3.25.0 or higher" means in practice.** The helper imports `zod/v4`
  and types its input as a zod 4 `ZodType` (`helpers/beta/zod.d.ts` in the
  installed 0.102.0). On zod 3.25.x, `zod/v4` is the zod 4 API bundled inside
  the zod 3 package, while plain `zod` is still the zod 3 API. So the docs' own
  example, which imports `z` from `"zod"`, only works as written on zod 4.
  Tested against trainm8's install: `betaZodTool` with a schema from `'zod'`
  (trainm8's house style) throws
  `Cannot read properties of undefined (reading 'def')`; the same schema built
  from `'zod/v4'` produces a correct JSON Schema. trainm8's **package version
  qualifies, but its existing schemas do not**.

Excerpt, _condensed_ from the tool-runner page:

<!-- prettier-ignore -->
```ts
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
const getWeatherTool = betaZodTool({
  name: "get_weather", description: "Get the current weather in a given location",
  inputSchema: z.object({ location: z.string().describe("The city and state, e.g. San Francisco, CA") }),
  run: async (input) => JSON.stringify({ temperature: "20°C", condition: "Sunny" }),
});
const finalMessage = await client.beta.messages.toolRunner({
  model: "claude-opus-5-5", max_tokens: 1024, tools: [getWeatherTool],
  messages: [{ role: "user", content: "What's the weather like in Paris?" }] });
```

On trainm8 today, the `z` in that excerpt must be `import * as z from 'zod/v4'`.

**Loop control.** All of these come from
https://github.com/anthropics/anthropic-sdk-typescript/blob/main/helpers.md
unless noted.

- **Iteration.** `for await (const message of runner)` yields each turn, and
  `max_iterations` bounds the loop.
- **Taking over history.** `setMessagesParams()` / `pushMessages()` let you take
  over the message history, for example to retry or inject a message.
- **Editing results.** `generateToolResponse()` gets the tool response for the
  last assistant message, so you can modify it before it is sent, for example to
  add `cache_control`.
- **Errors.** `ToolError` returns structured error blocks with `is_error: true`.
- **Cancellation.** An `AbortSignal` is passed to both the API calls and the
  tool `run` methods.
- **Streaming.** `stream: true` yields a `BetaMessageStream` per turn.
- **Holding a call.** With `runToolsEagerly: true`, `runner.deferToolCall()`
  holds a call until your loop body ends. The doc's example asks `confirm(held)`
  and `break`s, so the held call never runs. Warning: "A tool that has started
  runs to the end".
- **Changing tools mid-run.** "Changing `tools` in the middle of a conversation
  misses the prompt cache for everything sent so far." Under the
  `inline-tools-2026-09-15` beta, `addTools()` / `removeTools()` send the change
  as a message instead; "The runner doesn't add the beta for you".
- **Compaction.** `compactBeforeNextTurn()` provides on-demand compaction. The
  client-side compaction option is deprecated in favour of server-side
  `context_management`. (tool-runner page, "Automatic context management")

**Human in the loop.** The tool-runner page says: "When you need
human-in-the-loop approval, custom logging, or conditional execution, use the
manual loop instead"
(https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls).
For a web app this has a consequence (_inference_). An approval that arrives in
a later HTTP request means persisting the messages, ending the request, then
resuming. You would write that state machine yourself.

**Structured outputs (GA).** (Sources:
https://platform.claude.com/docs/en/build-with-claude/structured-outputs,
helpers.md.)

- JSON outputs use `output_config.format`. Strict tool use (`strict: true`) is
  to "Guarantee schema validation on tool names and inputs".
- "The `output_format` parameter has moved to `output_config.format`, and beta
  headers are no longer required." The old `output_format` is deprecated.
- TypeScript: `client.messages.parse()` + `zodOutputFormat()` from
  `@anthropic-ai/sdk/helpers/zod`, with the result in `parsed_output`. Like
  `betaZodTool`, that helper imports `zod/v4`, and a `'zod'` schema throws there
  too (tested on 0.102.0). `jsonSchemaOutputFormat()` takes plain JSON Schema
  instead.
- Limits: objects need `additionalProperties: false`. Recursive schemas, numeric
  min/max and string-length constraints are not supported on the wire. The SDK
  helpers strip them from the wire schema into the field description and still
  enforce them when validating the response.

**Prompt caching.** (Source:
https://platform.claude.com/docs/en/build-with-claude/prompt-caching)

- **Prefix and breakpoints.** The prefix order is `tools` → `system` →
  `messages`. You can add an automatic top-level `cache_control` or up to 4
  explicit breakpoints.
- **Lifetimes.** The default TTL is 5 min, refreshed on use. A 1 h TTL is also
  available.
- **Pricing.** Writes cost 1.25× (5 min) or 2× (1 h). Reads cost 0.1×, and 0.05×
  on Opus 5.5 and Sonnet 5.5.
- **Minimum size.** The minimum cacheable prompt is 512 tokens on Opus 5.5 and
  Haiku 5.5.
- **What breaks the cache.** "Modifying tool definitions (names, descriptions,
  parameters) invalidates the entire cache."

Design implication for trainm8 (_inference_): keep the tool list built from the
action registry stable and deterministically ordered. Put per-request screen
context last, after the cache breakpoint.

**MCP connector (beta).** The Messages API can call a remote MCP server itself.
(Source: https://platform.claude.com/docs/en/agents-and-tools/mcp-connector)

- It uses beta header `mcp-client-2025-11-20` with `mcp_servers` +
  `mcp_toolset`.
- "only tool calls are currently supported", and "The server must be publicly
  exposed through HTTP".

This means a trainm8 in-app agent could, in principle, use trainm8's own public
MCP server as its toolset. The MCP note advises against it: no approval step,
not ZDR-eligible, and a round trip over the public internet
([`mcp-server-for-trainm8.md`](mcp-server-for-trainm8.md) §8.2).

**Facts.** MIT; **0.133.0**, published 2026-10-09; peer `zod ^3.25.0 || ^4.0.0`
(https://registry.npmjs.org/@anthropic-ai/sdk). Lock-in: Claude only, by design.
React Router 7 / SSR: a server-only library that runs inside a React Router
`action`/`loader`, so there are no UI concerns.

**What trainm8's pinned 0.102.0 already has** (checked in its type
declarations): `beta.messages.toolRunner`, `betaZodTool`/`betaTool`,
`ToolError`, `max_iterations`,
`setMessagesParams`/`pushMessages`/`generateToolResponse`, structured outputs
(`output_config`, `zodOutputFormat`, `jsonSchemaOutputFormat`), the
`mcp-client-2025-11-20` header type, and the deprecated client-side compaction.
It lacks `deferToolCall`, `runToolsEagerly`, `addTools`/`removeTools` and
`compactBeforeNextTurn`, so the holding-a-call and mid-run tool changes above
need an upgrade.

## 1b. Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`)

**What it is.** "A library that runs the Claude Code binary". It comes with
Claude Code's built-in tools (file, shell, web), hooks, subagents, MCP,
permissions, sessions, and skills loaded from `.claude/`
(https://code.claude.com/docs/en/agent-sdk/overview).

**Custom tools.** You define them with
`tool(name, description, zodShape, handler)` and wrap them in an in-process MCP
server via `createSdkMcpServer`.

- Tools are named `mcp__{server}__{tool}` and pre-approved via `allowedTools`.
- `tools: []` removes all built-ins.
- MCP annotations such as `readOnlyHint` and `destructiveHint` are supported.
  (https://code.claude.com/docs/en/agent-sdk/custom-tools)

Excerpt, _condensed_ from the custom-tools page:

<!-- prettier-ignore -->
```ts
import { tool, createSdkMcpServer, query } from "@anthropic-ai/claude-agent-sdk";
const getTemperature = tool("get_temperature", "Get the current temperature at a location",
  { latitude: z.number(), longitude: z.number() },
  async (args) => ({ content: [{ type: "text", text: `Temperature: ...` }] }));
const weatherServer = createSdkMcpServer({ name: "weather", version: "1.0.0", tools: [getTemperature] });
for await (const message of query({ prompt: "What's the temperature in San Francisco?",
  options: { mcpServers: { weather: weatherServer }, allowedTools: ["mcp__weather__get_temperature"] } })) {}
```

**Does it fit a web-app backend?** Poorly for interactive in-app chat on
trainm8's Fly/LiteFS setup (_assessment_), based on
https://code.claude.com/docs/en/agent-sdk/hosting:

- "The Agent SDK spawns and supervises a `claude` CLI subprocess that owns a
  shell, a working directory, and session files on disk".
- "One agent session maps to one subprocess". The suggested starting point is "1
  GiB RAM, 5 GiB disk, and 1 CPU per agent", and that is "a floor, not the
  ceiling".
- Transcripts are lost on restart unless a `SessionStore` adapter is configured.
- Multi-tenant use needs `settingSources: []`,
  `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`, a per-tenant `CLAUDE_CONFIG_DIR` and a
  per-tenant `cwd`.
- The docs suggest Managed Agents if you don't need to run the loop yourself.

It suits background or batch jobs better than per-request chat.

**Facts.** Licence: "SEE LICENSE IN README.md"; use is "governed by Anthropic's
Commercial Terms of Service", and third parties may not offer claude.ai login
"unless previously approved" (overview page). **0.3.296**, published 2026-10-09.
Peers: `zod ^4.0.0`, `@anthropic-ai/sdk >=0.93.0` and
`@modelcontextprotocol/sdk ^1.29.0`
(https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk). trainm8's zod
3.25.76 does not satisfy the zod peer, so adopting it means upgrading zod first.

---

## 2. Model Context Protocol (MCP), short summary

Covered in depth in [`mcp-server-for-trainm8.md`](mcp-server-for-trainm8.md).

**What it is.** An open protocol for exposing an app's tools, resources and
prompts to any MCP client, such as Claude, IDEs or other agents.

**Current spec.** Revision **2026-07-28**. Authorization is optional, but an
HTTP server that requires it "SHOULD conform" to the OAuth 2.1-based flow
(https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization):

- MCP servers "MUST implement OAuth 2.0 Protected Resource Metadata (RFC9728)".
- Clients "SHOULD support" Client ID Metadata Documents. Dynamic Client
  Registration "is deprecated" and kept for compatibility.
- Clients "MUST implement" RFC 8707 `resource` indicators.

**TypeScript SDK v2.** Released 2026-07-27. It splits into
`@modelcontextprotocol/server` and `@modelcontextprotocol/client`, implements
spec 2026-07-28, and has optional Express, Node.js HTTP, Hono and Fastify
adapters. (Source:
https://github.com/modelcontextprotocol/typescript-sdk/blob/main/README.md)

- v1 (`@modelcontextprotocol/sdk`) gets fixes "for at least six months after the
  v2 release (2026-07-27)".
- Licence: "Apache License 2.0 for new contributions, with existing code under
  MIT".
- Schemas: "Tool and prompt schemas use Standard Schema … bring Zod v4, Valibot,
  ArkType, or any compatible library."

Excerpt, from the README greeting example (its `z` is imported from `'zod/v4'`):

<!-- prettier-ignore -->
```ts
const server = new McpServer({ name: 'greeting-server', version: '1.0.0' });
server.registerTool('greet',
    { description: 'Greet someone by name', inputSchema: z.object({ name: z.string() }) },
    async ({ name }) => ({ content: [{ type: 'text', text: `Hello, ${name}!` }] }));
```

**Versions.** `@modelcontextprotocol/server` 2.3.1 (2026-10-05) has `zod ^4.2.0`
as a regular dependency (not a peer) and needs Node ≥20
(https://registry.npmjs.org/@modelcontextprotocol/server). v1
`@modelcontextprotocol/sdk` 1.32.1 (2026-10-05) accepts `zod ^3.25 || ^4.0`
(https://registry.npmjs.org/@modelcontextprotocol/sdk).

The MCP Apps extension (`@modelcontextprotocol/ext-apps`, 2.0.3, MIT) exists for
UI in MCP hosts. It was not researched here.

**What v2 does with trainm8's schemas.** Read from the 2.3.1 package source.
`registerTool` is typed to take a `StandardSchemaWithJSON`: a schema whose
`~standard` carries both `validate` and `jsonSchema`, which zod has had since
4.2.0. Its converter (`standardSchemaToJsonSchema`) then does one of three
things:

- **A zod 3 schema** (trainm8's `from 'zod'`) throws "Schema appears to be from
  zod 3, which the SDK cannot convert to JSON Schema. Upgrade to zod >=4.2.0, or
  wrap your JSON Schema with fromJsonSchema()".
- **A zod 4 schema without `~standard.jsonSchema`**, which includes zod
  3.25.76's `zod/v4` (checked: its `~standard` has only `validate`, `vendor` and
  `version`), falls back to `z.toJSONSchema()` and logs a one-time warning to
  upgrade. Expect the TypeScript signature to reject it too (_inference from the
  type_).
- **zod ≥ 4.2, Valibot or ArkType** work as documented.

**One registry for both the in-app agent and MCP?** Yes. `registerTool` takes a
name, a description, a schema and an async handler. That is the same shape as
`betaZodTool`, AI SDK `tool()` and Agent SDK `tool()`, so one schema-typed
action definition can be adapted to every surface (_inference from the excerpts
above_). Which zod each adapter accepts differs; §9.3 sorts that out.

---

## 3. Vercel AI SDK (`ai`, `@ai-sdk/react`), now v7

**Problem it solves.** A provider-agnostic toolkit:

- Server side: `generateText`/`streamText` with tools and a multi-step loop.
- Client side: a UI message-stream protocol plus `useChat` for React, Vue,
  Svelte and Angular (https://ai-sdk.dev/docs/ai-sdk-ui/overview).

**Tools and the loop.**
`tool({ description, inputSchema: z.object(...), execute })`. Multi-step runs
are bounded by `stopWhen: isStepCount(5)`; `hasToolCall()` and
`isLoopFinished()` are other stop conditions. (Source:
https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)

- `execute` is optional, so calls can be forwarded to the client.
- `dynamicTool()` handles runtime-defined tools, for example MCP tools.
- "In most cases, you should define your own AI SDK tools for production
  applications." The reason given: "They provide full control, type safety, and
  optimal performance." MCP tools suit "rapid development iteration and
  scenarios where users bring their own tools".
- **Zod 3 and zod 4 both work.** `@ai-sdk/provider-utils` 5.0.58 (what `ai`
  7.0.137 depends on) checks for `_zod` and converts a zod 4 schema with
  `toJSONSchema` and a zod 3 schema with its own bundled converter
  (`zodSchema()` → `zod3Schema()` / `zod4Schema()`). trainm8's existing
  `from 'zod'` schemas can be a tool's `inputSchema` as they are.

Excerpt, verbatim fragment from that page plus the `toolApproval` option from
the same page:

```ts
tools: {
  weather: tool({
    description: 'Get the current weather in a location',
    inputSchema: z.object({ location: z.string().describe('The location to get the weather for') }),
    execute: async ({ location }) => ({ location, temperature: 72 + Math.floor(Math.random() * 21) - 10 }),
  }),
},
stopWhen: isStepCount(5),
toolApproval: { runCommand: 'user-approval' },
```

**Human in the loop.**

- `toolApproval` on `streamText`, `generateText` or `ToolLoopAgent` takes
  per-tool `'not-applicable' | 'approved' | 'denied' | 'user-approval'`.
- "The older `needsApproval` property on `tool()` definitions is deprecated."
- The call returns `tool-approval-request` parts; you add a
  `tool-approval-response` to the messages and call the model again. There is no
  long-lived paused process
  (https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling).

On the client (https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage):

- Tool parts are typed `tool-<name>`, with states `input-streaming`,
  `input-available`, `approval-requested`, `approval-responded`,
  `output-available`, `output-error` and `output-denied`.
- You answer with
  `addToolApprovalResponse({ id: part.approval.id, approved: true })`,
  optionally with a reason.
- Browser-executed tools go through `onToolCall` + `addToolOutput`.
- `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls` resubmits
  automatically.

**Generative UI.** "Generative UI is the process of connecting the results of a
tool call to a React component". You render by switching on
`part.type`/`part.state`
(https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces).

**React Router 7.** ai-sdk.dev has no React Router guide. Its getting-started
pages list Next.js, TanStack Start, Expo, Node, Express, Hono, Fastify and Nest
(https://ai-sdk.dev/docs/getting-started). It is nevertheless compatible
(_inference_):

- The server helper `createUIMessageStreamResponse` returns a standard web
  `Response`
  (https://ai-sdk.dev/docs/reference/ai-sdk-ui/create-ui-message-stream-response).
- In React Router, a route module that exports `action` without a default
  component is a resource route that returns a `Response`
  (https://reactrouter.com/how-to/resource-routes).

**Provider lock-in.** It is designed to be low.

- **Hidden default.** "By default, the global provider is set to the Vercel AI
  Gateway" for plain model strings like `"anthropic/claude-sonnet-5.5"`. You can
  override it via `globalThis.AI_SDK_DEFAULT_PROVIDER`
  (https://ai-sdk.dev/docs/ai-sdk-core/provider-management).
- **Calling Claude directly.** Use the `@ai-sdk/anthropic` provider. It supports
  prompt caching via
  `providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } }` with
  `ttl: '1h'`. It also supports Anthropic server tools and `mcpServers`
  (https://ai-sdk.dev/providers/ai-sdk-providers/anthropic).

**Facts** (https://registry.npmjs.org/ai, `/@ai-sdk/react`,
`/@ai-sdk/anthropic`). Apache-2.0. `ai` **7.0.137** (2026-10-09),
`@ai-sdk/react` 4.0.140, `@ai-sdk/anthropic` 4.0.78. Peer
`zod ^3.25.76 || ^4.1.8`, whose lower bound is exactly trainm8's version; Node
≥22 (trainm8 runs 22.18). Release pace: 6.0.0 on 2025-12-22, then 7.0.0 on
2026-06-25, so majors move fast.

---

## 4. CopilotKit (+ AG-UI protocol)

**Problem it solves.** An "SDK for building full-stack agentic applications,
Generative UI, and chat applications". CopilotKit is "the company behind the
AG-UI Protocol" (https://github.com/CopilotKit/CopilotKit/blob/main/README.md).
The v2 hooks live at `@copilotkit/react-core/v2`:

- **`useAgentContext`** is screen context. It "registers a dynamic context
  object with the active Copilot runtime for the lifetime of the component",
  adding it on mount and removing it on unmount, and the agent gets
  `{ description, value }` with `value` as a JSON string. The page calls itself
  "the v2 equivalent of `useCopilotReadable`"
  (https://docs.copilotkit.ai/reference/hooks/useAgentContext).
- **`useFrontendTool`** is a frontend action with Zod `parameters`. Its handler
  "executes in the browser", and an optional `render` shows progress and results
  (https://docs.copilotkit.ai/reference/hooks/useFrontendTool).
- **`useHumanInTheLoop`** is a tool with no handler. It "pauses the agent until
  the user responds", and the render gets `respond()`
  (https://docs.copilotkit.ai/reference/hooks/useHumanInTheLoop).
- **`useAgent`** is shared state. `agent.state` and `agent.setState()` are
  "immediately available to both app and agent"
  (https://docs.copilotkit.ai/reference/hooks/useAgent).

Excerpt, _condensed_ from the useAgentContext and useFrontendTool reference
pages:

<!-- prettier-ignore -->
```tsx
useAgentContext({ description: "The currently logged-in user", value: { name: user.name, role: user.role } });
useFrontendTool({
  name: "addTodo", description: "Add a new item to the user's todo list",
  parameters: z.object({ text: z.string().describe("The todo item text") }),
  handler: async ({ text }) => { setTodos((prev) => [...prev, text]); return `Added "${text}"`; },
}, []);
```

**Backend.**

- `CopilotRuntime({ agents: { default: new BuiltInAgent({ model: "openai:gpt-5.4-mini" }) } })`.
  The docs say the React components work with "Next.js, React Router, Remix,
  TanStack Start, Vite" (https://docs.copilotkit.ai/built-in-agent/quickstart).
- The Express handler is `createCopilotExpressHandler` from
  `@copilotkit/runtime/v2/express`, with `hooks.onRequest` for auth
  (https://docs.copilotkit.ai/backend/runtime-endpoints;
  https://docs.copilotkit.ai/guides/self-hosting).

**AG-UI** is the event protocol underneath.

- Event types include `TOOL_CALL_*`, `STATE_SNAPSHOT`, `STATE_DELTA` (JSON
  Patch, RFC 6902) and `MESSAGES_SNAPSHOT`, plus `interrupt` outcomes on
  `RunFinished` for human-in-the-loop. "Frontends should apply these patches in
  sequence to maintain an accurate state representation"
  (https://docs.ag-ui.com/concepts/events).
- It positions itself as the agent↔user layer, next to MCP (agent↔tools) and A2A
  (agent↔agent) (https://docs.ag-ui.com/introduction).
- `@ag-ui/core` is 1.0.2, MIT (https://registry.npmjs.org/@ag-ui/core).

**Licence and self-hosting.** "The open-source SDKs and runtime use MIT": the
SDK, runtime, AG-UI and Built-in Agent. (Source:
https://docs.copilotkit.ai/deepagents/concepts/oss-vs-enterprise)

- Persistence is "Framework-native or application-owned".
- "CopilotKit Intelligence" adds saved threads, memories, analytics and channels
  (Slack, Teams). It can be cloud-hosted or self-hosted on Kubernetes or AWS
  ECS. The page does not call it paid (its navbar reads "Get CopilotKit
  Intelligence free") and states no pricing.

**Facts.** From https://registry.npmjs.org/@copilotkit/react-core and
`/@copilotkit/runtime`.

- `@copilotkit/react-core` / `runtime` **1.78.0**, published 2026-10-09. The
  v1.50.0 release was 2025-12-11. `react-core` peers `zod >=3.25`; the runtime
  depends on `zod ^3.25.18`.
- Weight (_observation_): the runtime's dependencies include `graphql-yoga`,
  `hono`, `@modelcontextprotocol/sdk`, `@segment/analytics-node`,
  `@scarf/scarf`, `@copilotkit/license-verifier`, and **`ai ^6.0.104` with
  `@ai-sdk/anthropic ^3`**, plus the OpenAI and Google AI SDK providers. That is
  AI SDK **6**, so alongside an AI SDK 7 agent loop trainm8 would carry two
  majors of `ai`.
- **Unverified:** what telemetry or licence checks the Segment, Scarf and
  licence-verifier packages perform. The dependency list also suggests
  (_unverified_) that BuiltInAgent is built on the AI SDK.

---

## 5. assistant-ui (`@assistant-ui/react`)

**Problem it solves.** Chat-UI primitives only, with no model loop. (Source:
https://github.com/assistant-ui/assistant-ui/blob/main/README.md)

- You compose a chat UI from parts such as `Thread`, `Message`, `Composer`,
  `ThreadList` and `ActionBar`. "Style every pixel yourself, or start from a
  polished shadcn/ui theme that the CLI copies into your project."
- Runtimes: Vercel AI SDK (`useChatRuntime`, the default), LangGraph, AG-UI,
  A2A, Google ADK, or a custom backend.
- Tool calls render as components, with inline approvals.
- Licence: "MIT, with optional Assistant Cloud for managed thread persistence
  and analytics." The README lists Assistant Cloud as "Managed thread history,
  telemetry, and file storage" and does not say whether it is paid.

**Screen context.** "Model Context" lets mounted components contribute
instructions and tools
(https://www.assistant-ui.com/docs/copilots/model-context):

- `useAssistantInstructions` adds static instructions.
- `useAssistantContext` takes a callback evaluated at send time.
- `makeAssistantVisible` provides a component's HTML as context, and an optional
  click tool.

**Shared state.**
`unstable_useInteractable(name, { stateSchema, initialState })` gives the model
an auto-generated `update_{name}` tool. "Model updates re-render the UI as they
stream, and user edits reach the model as state snapshots on the next message".
The API is marked `unstable_`
(https://www.assistant-ui.com/docs/tools/interactables).

**Bring your own backend.**
`useExternalStoreRuntime({ messages, convertMessage, onNew })`. It supports
`onEdit`, `onReload`, branching and `onAddToolResult`
(https://www.assistant-ui.com/docs/runtimes/custom/external-store). With the AI
SDK, the route passes browser tools through `frontendTools(...)` into
`streamText` (https://www.assistant-ui.com/docs/tools/backend).

Excerpt, _condensed_ from the interactables and external-store pages:

<!-- prettier-ignore -->
```tsx
const [state, { setState }] = unstable_useInteractable("taskBoard", {
  stateSchema: taskBoardSchema,
  initialState: { tasks: [] },
});
const runtime = useExternalStoreRuntime({
  messages: myMessages,
  convertMessage,
  onNew,
});
```

**React Router 7.** An official `with-react-router` example ("React Router v7
integration") exists (https://www.assistant-ui.com/docs/cli). SSR behaviour
under trainm8's server rendering was **not verified**.

**Facts.** From https://registry.npmjs.org/@assistant-ui/react.

- **0.15.27**, published 2026-10-10. Still pre-1.0.
- Peer dependencies: `react ^18 || ^19`. `@assistant-ui/react-ai-sdk` is 1.4.17.
- Provider lock-in: none at the UI layer.

---

## 6. Google A2A (short note)

**Does agent-native use it?** Yes. agent-native's README says one action "powers
every app surface: UI, agent, HTTP, MCP, A2A, and CLI"
(https://github.com/BuilderIO/agent-native/blob/main/README.md).

**What A2A is.** An open agent-to-agent standard, donated by Google to the Linux
Foundation, Apache-2.0 (https://a2a-protocol.org/latest/).

- Spec "Latest Released Version `1.0.0`".
- Core objects: Agent Card, Task, Message, Artifact.
- Bindings: JSON-RPC, gRPC, HTTP+JSON/REST.
- Source: https://a2a-protocol.org/latest/specification/
- On MCP vs A2A: "They solve two different problems and are designed to work
  together" (https://a2a-protocol.org/latest/).
- JS SDK: `@a2a-js/sdk` 1.3.0, Apache-2.0
  (https://registry.npmjs.org/@a2a-js/sdk).

**Relevance (_assessment_).** Low for trainm8 now. MCP already reaches Claude
Desktop, Claude.ai and other assistants, and A2A only matters if third-party
_agents_ (not assistants) must delegate tasks to trainm8.

---

## 7. Mapping onto agent-native's principles

| Principle                                                      | Anthropic SDK                                                                                   | Agent SDK                        | MCP                                       | AI SDK 7                                                         | CopilotKit                                  | assistant-ui                                             |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------- | ----------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------- |
| **Shared typed actions** (UI and agent call the same function) | `betaZodTool` wraps a registry action; the UI calls the same action via a React Router `action` | `tool()` + in-process MCP server | `registerTool` (external agents)          | `tool()` server-side; client tools via `onToolCall`              | `useFrontendTool` (browser) + runtime agent | Frontend `tool()`/toolkit; backend via the AI SDK route  |
| **Agent knows the screen**                                     | Do it yourself: send route and IDs in the request and put them in the prompt                    | Do it yourself                   | n/a (the host app owns its screen)        | Do it yourself (request body); no dedicated hook                 | `useAgentContext` (built in)                | `useAssistantContext`, `makeAssistantVisible` (built in) |
| **Shared state / sync**                                        | Do it yourself                                                                                  | Do it yourself                   | Resources/notifications (see the MCP doc) | Tool parts stream to the UI; app state is yours                  | `useAgent().state` + AG-UI `STATE_DELTA`    | `unstable_useInteractable`                               |
| **Human in the loop**                                          | Manual loop recommended; `deferToolCall` + `confirm` within a stream                            | Permissions / `allowedTools`     | Client-side (host decides)                | `toolApproval` + `addToolApprovalResponse` (built in, stateless) | `useHumanInTheLoop`, AG-UI interrupts       | Inline approvals in tool UIs                             |
| **Undo of agent writes**                                       | None found                                                                                      | None found                       | None found                                | None found                                                       | None found                                  | Message edit/branch only (not app data)                  |

React Router 7 helps with "agent writes visible in UI". After an action, "all
loader data on the page is revalidated", and fetchers submit to actions "without
causing a navigation" (https://reactrouter.com/start/framework/actions). If
agent tools run the same React Router actions, or the client revalidates after a
tool part completes, the screen updates for free (_inference_).

**Undo** was not found as a built-in in any primary source checked. It must be
trainm8's own audit log plus inverse actions. trainm8 already has the inverse
actions for I dag's writes (ADR 0088; see
[`agent-layer-trainm8-surface.md`](agent-layer-trainm8-surface.md) §4).

---

## 8. Comparison table

|                           | Anthropic SDK (tool runner)                                  | Claude Agent SDK                          | MCP TS SDK v2                                                                | Vercel AI SDK 7                                             | CopilotKit 1.78                                           | assistant-ui 0.15                                  |
| ------------------------- | ------------------------------------------------------------ | ----------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------- |
| **Role**                  | Model client + agent loop                                    | Claude Code as a library                  | Expose actions to external agents                                            | Loop + streaming protocol + React hooks                     | Full stack: UI hooks + runtime + AG-UI                    | Chat UI primitives                                 |
| **Key primitive**         | `betaZodTool`, `beta.messages.toolRunner`                    | `query()`, `tool()`, `createSdkMcpServer` | `McpServer.registerTool`                                                     | `tool()`, `streamText`, `useChat`                           | `useAgentContext`, `useFrontendTool`, `useHumanInTheLoop` | `Thread`, `useExternalStoreRuntime`, Model Context |
| **Licence**               | MIT                                                          | Anthropic Commercial ToS                  | Apache-2.0 (new) / MIT (old)                                                 | Apache-2.0                                                  | MIT (+ optional CopilotKit Intelligence)                  | MIT (+ optional managed Assistant Cloud)           |
| **Latest version**        | 0.133.0 (2026-10-09)                                         | 0.3.296 (2026-10-09)                      | 2.3.1 (2026-10-05)                                                           | 7.0.137 (2026-10-09)                                        | 1.78.0 (2026-10-09)                                       | 0.15.27 (2026-10-10)                               |
| **Maturity notes**        | Tool runner is beta                                          | Pre-1.0; subprocess model                 | v2 since 2026-07-27                                                          | Majors every ~6 months                                      | Large v1→v2 API shift; runtime still on AI SDK 6          | Pre-1.0; `unstable_` APIs                          |
| **React Router 7 / SSR**  | Server-only, fits `action`                                   | Separate process; poor fit                | Express adapter fits `@react-router/express`                                 | `Response`-based, fits a resource route (no official guide) | React Router listed as supported                          | Official React Router v7 example; SSR unverified   |
| **Provider lock-in**      | Claude only                                                  | Claude only                               | None                                                                         | Low (default AI Gateway; override)                          | Low–medium (runtime + AG-UI)                              | None                                               |
| **trainm8's zod 3.25.76** | Package OK; schemas must be `zod/v4` (`'zod'` schemas throw) | Unmet peer `zod ^4.0.0`                   | `'zod'` schemas throw; `zod/v4` falls back with a warning; clean on zod ≥4.2 | OK, existing `'zod'` schemas work as they are               | OK (`>=3.25`)                                             | n/a                                                |

---

## 9. Recommended minimal stack for a trainm8-owned agent layer

> **Update 2026-10-11 (later research).**
>
> - The provenance filter in §9.1 is now per origin platform, not Strava-only.
>   trainm8 no longer uses Strava, and each watch vendor's terms bind
>   ([`watch-data-sources.md` §6](watch-data-sources.md#6-ai-and-mcp-terms-per-source)).
>   The origin platform is a new provenance column
>   ([`watch-data-trainm8-ingest.md`](watch-data-trainm8-ingest.md) §3).
> - The in-app agent (proposed ADR 0095) goes on Bedrock `eu-north-1`, which
>   lacks structured outputs
>   ([`ai-product-privacy-cost.md`](ai-product-privacy-cost.md) §3.4, §5).
> - MCP OAuth comes from Better Auth's `mcp` + `cimd` plugins
>   ([`stack-migration.md`](stack-migration.md) §4.3).
>
> The library choices are otherwise unchanged:
> [`agent-native-open-stack.md`](agent-native-open-stack.md) and
> [`agent-platforms.md`](agent-platforms.md) keep AI SDK 7 and MCP SDK v2 in the
> target stack.

**Assumption.** trainm8 will expose an MCP server, so everything hangs off **one
action registry**: `defineAction` in `app/actions/`, proposed ADR 0092 (MCP note
§8). **Order:** the MCP server is the first surface; the in-app agent loop in
§9.2 is the last, optional phase (proposed ADR 0095;
[`agent-native.md`](agent-native.md) §7.2). Later research puts that agent on
Bedrock `eu-north-1` behind a paid tier, after a DPIA
([`ai-product-privacy-cost.md`](ai-product-privacy-cost.md) §5).

### 9.1 The registry, owned by trainm8 with no framework

```ts
// app/actions/<name>.server.ts (sketch; full field list in the MCP note §8.1)
export const logWorkout = defineAction({
  name: "log_workout", description: "…",
  input: z.object({ … }),
  annotations: { readOnly: false, destructive: false },
  confirm: "none",            // or "host" | "athlete"
  run: async (ctx /* userId, caller: web|agent|mcp */, input) => { /* Prisma */ },
});
```

- `input` is a Zod object, which is already the house style (Conform + zod).
  Which zod it is matters; see §9.3.
- `annotations` mirror MCP's `readOnlyHint`/`destructiveHint`
  (https://code.claude.com/docs/en/agent-sdk/custom-tools).
- `run(ctx, input)` does authz and writes an audit row,
  `{source, actionName, input, inverse}`, which powers "visible and undoable"
  (_design_).
- **A data-provenance filter, per origin platform** (revised 2026-10-11; it was
  Strava-only). Every action's output carries the origin platform, and the
  device where known, of each value. The registry applies that platform's terms
  to what a model-facing adapter (in-app agent or MCP, not the UI) returns
  ([`watch-data-sources.md` §6](watch-data-sources.md#6-ai-and-mcp-terms-per-source);
  proposed ADR 0098):
  - Garmin-sourced or Garmin-derived values carry Garmin's attribution, and from
    a direct Garmin integration they reach an MCP client only after Garmin's
    written §5.2(o) approval.
  - Polar values need the athlete's explicit permission.
  - A value whose terms forbid the surface goes out as an Unavailable Metric
    with reason `source-terms`.

  If Strava returns, or for Strava-sourced rows still stored, every
  Strava-derived value is `source-terms`. Strava's API Policy forbids exposing
  Strava Data through any MCP server (§5.16(b)) and using it, or anything
  derived from it, in any AI Application, context windows included (§5.3)
  ([`mcp-server-for-trainm8.md` §6.1](mcp-server-for-trainm8.md#61-the-strava-gate-a-new-reason-for-an-unavailable-metric)).
  `ActivityImport.externalProvider` stores only the transport (for example
  `intervalsicu`), not the origin platform. The origin platform, device and FIT
  key are new provenance columns, backfilled from `rawJson`
  ([`watch-data-trainm8-ingest.md`](watch-data-trainm8-ingest.md) §3; proposed
  ADR 0096).

**Adapters, each a few lines:**

1. **UI.** One React Router resource route (`action`) per action, or a `$name`
   dispatcher, called via `useFetcher`. Revalidation then refreshes loaders.
2. **In-app agent.**
   `registry.map(a => tool({ description, inputSchema: a.input, execute: i => a.run(ctx, i) }))`.
   Map `confirm: "host"` to `toolApproval: 'user-approval'`.
   `confirm: "athlete"` is never a chat approval: the action records a proposal,
   and the athlete answers it on the Ukeskiftet card (MCP note §6.2).
3. **MCP.**
   `registry.forEach(a => server.registerTool(a.name, { description, inputSchema: a.input, annotations }, h))`.
   Every surface shares the same `run`, so authz and the provenance filter live
   in one place.

### 9.2 The pieces

**Agent loop and transport: Vercel AI SDK 7 with `@ai-sdk/anthropic` set
explicitly.** Do not use bare model strings, which route through Vercel AI
Gateway by default.

_Why:_ human-in-the-loop is a stateless request/response cycle (`toolApproval` →
`tool-approval-request` → re-call). That fits a React Router `action` per chat
turn, with no paused server process. The typed tool-part states and client-side
tools (`onToolCall`/`addToolOutput`) give you "UI actions the agent can call"
(navigate, open a sheet) for free. It also meets trainm8's zod and Node versions
as they stand: its peer range starts at exactly zod 3.25.76, and it converts zod
3 schemas itself, so it is the one recommended piece that needs no zod change.

_Cost:_ fast major-version churn and an abstraction over Anthropic features.
Prompt caching (`cacheControl`) and Anthropic server tools are supported. Newer
betas, such as the `inline-tools` tool changes, may lag (_inference_).

_Residency (added 2026-10-11; packages verified the same day):_ Anthropic's
first-party API offers only US or `global` inference, and Anthropic is not on
the DPF list. So the later recommendation puts the in-app agent on Claude in
Bedrock `eu-north-1` ([`ai-product-privacy-cost.md`](ai-product-privacy-cost.md)
§3.4–3.5, §5). There **`@ai-sdk/amazon-bedrock`** takes the place of
`@ai-sdk/anthropic`: 5.0.113 is npm `latest` for AI SDK 7 (the 4.x line is
tagged `ai-v6`). Use its `@ai-sdk/amazon-bedrock/anthropic` entry
(`createBedrockAnthropic`), which sends Anthropic's own request body through
Bedrock's InvokeModel on `bedrock-runtime` and reuses `@ai-sdk/anthropic`; the
root `bedrock` provider uses the Converse API, and `/mantle` serves only
OpenAI-compatible models
([provider docs](https://ai-sdk.dev/providers/ai-sdk-providers/amazon-bedrock)).
For Sonnet 5.5 and Haiku 5.5, AWS lists the EU only through the `eu.anthropic.…`
geo profile on `bedrock-runtime`, not in-region, and no structured outputs on
either endpoint
([model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-5-5.html)).
That includes strict tool use: AWS counts `strict: true` as structured outputs
([AWS](https://docs.aws.amazon.com/bedrock/latest/userguide/structured-output.html)),
and the provider ignores it with a warning. Plain tool use works. With no Batch
or MCP connector either, the registry's zod schemas validate every tool input
and every model-written proposal server-side.

**Fallback: `@anthropic-ai/sdk` directly.** It is already a dependency; bump the
pin from `^0.102.0` to the current 0.133.x for `deferToolCall` and mid-run tool
changes (§1). Write a manual loop, which the docs recommend for
human-in-the-loop, behind your own SSE route.

_When to choose it:_ if you want zero new runtime dependencies or day-one access
to Claude betas. You then own the stream protocol, the client state and the
approval resume logic. Both paths can consume the same registry, but
`betaZodTool` only takes zod 4 schemas: `zod/v4` today, or plain `zod` after an
upgrade. With zod 3 schemas, use `betaTool` and a JSON Schema converter. On
Bedrock the fallback is **`@anthropic-ai/bedrock-sdk`** (0.34.4, 2026-10-08),
Anthropic's Bedrock client. It wraps `@anthropic-ai/sdk` (`>=0.115.1 <1`) and
exports `AnthropicBedrock` (InvokeModel on `bedrock-runtime`, the EU route for
the 5.5 models) and `AnthropicBedrockMantle` (the Messages API on
`bedrock-mantle`). `@anthropic-ai/sdk` 0.133.0 has no Bedrock class of its own:
its plain client reaches Bedrock only with a `baseURL` and a Bedrock bearer
token, and SigV4 signing needs the Bedrock package
([Claude in Amazon Bedrock](https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock)).

**Chat UI: start with `useChat` + trainm8's own components.** The design system
(ADR 0085) and the Emil Kowalski craft rules suggest owning the markup. Screen
context then means sending `{ routeId, params, visibleEntityIds }` in the
request body and putting it after the prompt-cache breakpoint.

Consider **assistant-ui** (MIT, AI SDK runtime, React Router v7 example) if
thread lists, branching or editing become needed.
`makeAssistantVisible`/`useAssistantContext` and `unstable_useInteractable` are
the closest off-the-shelf match to agent-native's "agent sees and edits the
screen". Treat its pre-1.0 and `unstable_` APIs as churn risk.

**External agents: an MCP server** from the same registry. See
[`mcp-server-for-trainm8.md`](mcp-server-for-trainm8.md) for transport and
OAuth. OAuth now comes from Better Auth's `@better-auth/mcp` +
`@better-auth/cimd` ([`stack-migration.md`](stack-migration.md) §4.3). Don't
point the in-app agent at that server through Anthropic's MCP connector: it is
beta and tools-only, has no approval step and is not ZDR-eligible (MCP note
§8.2).

**Not recommended now:**

- **CopilotKit.** It is the most complete match for the principles: screen
  context, frontend tools, human-in-the-loop and AG-UI shared state. But it
  brings a second runtime (GraphQL/Hono, analytics and licence-verifier
  dependencies), pins AI SDK 6 underneath an AI SDK 7 loop, and comes with an
  ecosystem aimed at LangGraph-style external agents. trainm8 has a single
  Claude agent. Revisit if AG-UI state sync is wanted. A registry would plug in
  via `useFrontendTool` (browser) and the runtime agent's tools.
- **Claude Agent SDK.** One subprocess per session, at least 1 GiB per agent,
  filesystem state, and a zod 4 peer dependency. That makes it a poor fit for
  per-request chat on Fly/LiteFS. It might suit offline batch jobs; its custom
  `tool()` takes the same Zod shape, so the registry still applies.
- **A2A.** Only if third-party agents must delegate tasks.

### 9.3 Zod 3 or zod 4: what each piece needs

trainm8 pins `zod ^3.25.76`, and every one of its 81 zod imports uses the zod 3
API (`from 'zod'`). The pieces disagree about that:

| Piece                                                 | Takes trainm8's `'zod'` (v3) schemas? | Takes `'zod/v4'` from zod 3.25.76?                           | Needs zod ≥ 4.2?                                                         |
| ----------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Vercel AI SDK 7 `tool()`                              | **Yes** (own v3 converter)            | Yes                                                          | No                                                                       |
| `@anthropic-ai/sdk` `betaZodTool` / `zodOutputFormat` | **No**: throws (tested on 0.102.0)    | **Yes** (tested)                                             | No                                                                       |
| MCP TS SDK v2 `registerTool`                          | **No**: throws by design              | Runs with a warning; the type expects `~standard.jsonSchema` | **Yes**, for a clean fit                                                 |
| MCP TS SDK v1 (`@modelcontextprotocol/sdk` 1.32.1)    | Yes (peer `^3.25 \|\| ^4.0`)          | Yes                                                          | No, but fixes are promised only for at least six months after 2026-07-27 |
| Claude Agent SDK                                      | **No**: unmet peer `zod ^4.0.0`       | —                                                            | zod 4                                                                    |

**Recommendation.**

1. **Write the registry's input schemas with zod 4 from day one**, as
   `import * as z from 'zod/v4'`. That works today without touching the pin,
   because zod 3.25.76 ships it. These are new schemas anyway: the existing
   route schemas are form-shaped, and the surface inventory says a domain-input
   layer is needed under each route
   ([`agent-layer-trainm8-surface.md`](agent-layer-trainm8-surface.md) §7). The
   AI SDK loop and the Anthropic SDK fallback both accept them. Don't nest an
   existing zod 3 schema inside a `zod/v4` object, because the two APIs don't
   mix; re-declare the domain schema in v4 instead.
2. **Upgrade zod to ≥ 4.2 before the MCP server ships.** MCP v2's clean path
   needs `~standard.jsonSchema`, which zod has only from 4.2.0, and v1's support
   window is short. zod 4 keeps the old API at `zod/v3`, and `@conform-to/zod`
   1.16 already accepts `zod ^4.0.0` and has a `/v4` entry point. The 81
   existing imports can therefore move in one mechanical step (to `zod/v3`) and
   migrate to the v4 API file by file afterwards (_inference from the package
   exports; not tested on trainm8_). After the upgrade, `zod/v4` still resolves,
   so the registry schemas from step 1 need no change.
3. **Don't take a dependency on zod 4 semantics in the first slice** beyond the
   registry. The first slice runs no model at all (the registry behind its own
   route, [`agent-native.md`](agent-native.md) §7.2 Phase 1); the AI SDK loop
   that may come later is indifferent to the zod major, and the MCP server is
   the first piece that needs ≥ 4.2.

---

## 10. Could not verify or flagged

- **AI SDK and React Router.** There is no official React Router guide on
  ai-sdk.dev. Compatibility is inferred from `createUIMessageStreamResponse`
  returning a standard `Response`.
- **Full AI SDK server example.** The fetcher refused to return the complete
  `app/api/chat/route.ts` example verbatim. The pieces it did confirm:
  `convertToModelMessages`, `streamText`, and
  `createUIMessageStreamResponse({ stream: toUIMessageStream({ stream: result.stream }) })`.
- **CopilotKit v1 hooks.** Whether `useCopilotAction`/`useCopilotReadable` are
  formally deprecated is unconfirmed. The v2 docs only call them the "v1
  equivalent", and the `useAgentContext` page does not call `useCopilotReadable`
  deprecated.
- **CopilotKit internals.** BuiltInAgent internals, the server-tool API, and
  what `@segment/analytics-node`, `@scarf/scarf` and `license-verifier` do at
  runtime were not checked. Whether CopilotKit Intelligence is paid is not
  stated on the page read.
- **MCP v2 types with zod 3.25's `zod/v4`.** The runtime fallback was read in
  the source; the TypeScript rejection is inferred from the declared type, not
  compiled.
- **The zod upgrade path on trainm8.** `zod/v3` and Conform's zod 4 support come
  from the package exports; nobody has run the codemod or the test suite.
- **assistant-ui SSR.** Behaviour under React Router 7 server rendering is
  unknown. Only the existence of the `with-react-router` example was confirmed.
- **AG-UI transport.** The concrete transport (SSE vs WebSocket) is not stated
  on the pages read.
- **Undo.** No library documents undo of application data.
- **GitHub release pages.** The GitHub API to non-attached repos was blocked in
  the first session, so release pages were not read. All versions and dates come
  from the npm registry instead.
- **Not re-fetched in the verification pass:** the AG-UI, A2A, React Router and
  assistant-ui docs pages, CopilotKit's other hook and runtime pages, and the AI
  SDK generative-UI, getting-started, `createUIMessageStreamResponse` and
  Anthropic-provider pages. Their claims stand as first recorded.

## ADRs this research challenges

| ADR                                                                            | What it decided                                                                                                                                                        | What the sources say                                                                                                                                                                                                                                                                                                           | Verdict                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0016** AI plan generation                                                    | §8: a hosted Claude model via the Anthropic SDK with forced tool use, a key and model latency in the request path. Superseded by 0044; 0053 marks §8 not in force      | The recommended agent stack reaches Claude through `@ai-sdk/anthropic`, not the `@anthropic-ai/sdk` that §8 named and that `package.json` still pins at an unused, stale `^0.102.0`. A chat agent also wants things §8 never covered: multi-turn tool loops, approvals and streaming UI                                        | **Confirm** the supersession. Don't revive §8 for the agent; record the agent's provider and runtime in a new ADR (proposed 0095). Later research names Bedrock `eu-north-1` behind a paid tier, after a DPIA, so the provider is Bedrock's rather than `@ai-sdk/anthropic` ([`ai-product-privacy-cost.md`](ai-product-privacy-cost.md)) |
| **0053** Season generation is deterministic behind the seam                    | The `SeasonGenerator` seam is synchronous (§1) and pure (§2); approval regenerates rather than trusting a posted payload; nothing unapproved reaches the calendar (§8) | Every model client surveyed is asynchronous, as §1 foresaw. Structured outputs can force a model to emit the payload's shape, but a model is not deterministic, so §2's approve-by-regenerating cannot hold for a model generator. The AI SDK's stateless approval round trip fits §8 well                                     | **Amend** when a model implementation lands: widen §1 to a Promise, and bind approval to the stored preview (for example ADR 0084's digest) rather than regenerating                                                                                                                                                                     |
| **0080** Week Replan proposes, and the athlete's own sessions need a yes       | §6: "AI later writes the same proposals on the same surface"; only the author changes                                                                                  | Strict tool use and `output_config.format` can make a model emit `ProposalPayloadSchema`-shaped proposals, but numeric and length constraints are not enforced on the wire, so the server must still parse every model proposal with the domain schema. That schema is zod 3, so `zodOutputFormat` cannot take it as is (§9.3) | **Amend** §6: a model author is asynchronous, must be re-validated server-side, needs a zod 4 (or JSON Schema) twin of the payload union, and its proposals should record their author (proposed ADR 0093). On Bedrock, the planned host, there are no structured outputs at all, so server-side parsing is the only guard               |
| **0088** Every write on I dag is undone from its toast and from its landed row | One undo per write, shown for 10 s, through an owner-scoped delete or a compare-and-set token                                                                          | No library surveyed offers undo of application data; all of them give a place to render a tool's result (AI SDK tool parts, CopilotKit `render`, assistant-ui tool UIs). That tool part is the natural "landed row" for an agent's write                                                                                       | **Amend** (in proposed ADR 0093): extend §1's rule to agent writes. The tool result says what changed and carries _Angre_ with the same token, held behind an opaque server-side handle because it passes through a model (MCP note §6.4), and the ADR should state the bound for an undo offered in a conversation                      |
