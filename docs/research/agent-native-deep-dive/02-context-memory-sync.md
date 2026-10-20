# Appendix 02 — What the agent knows, and how the UI and agent stay in sync

> **Appendix to [agent-native-deep-dive.md](../agent-native-deep-dive.md).**
> Context awareness, `application_state`, handoff and commands, live sync, Yjs,
> instructions, skills, resources and memory. Read at agent-native commit
> `a03f638` (2026-10-20, `@agent-native/core` 0.210.0); compiled 2026-10-20.
> Citations as in the main document.

## Sources and method

- Repo clone at HEAD `a03f638` (2026-10-20, `@agent-native/core` 0.210.0).
  Citations `AN <path>:<lines>` are relative to the repo root at that HEAD.
  "Since 0.206.0" means `git 1284000325bf..HEAD` (406 commits).
- Docs: `docs <slug> L–L` are line numbers in
  `packages/core/docs/content/<slug>.mdx` (original file numbering).
- Live-site spot check (2026-10-20): `context-awareness`, `observational-memory`,
  `client-sync-internals`, `agent-resources` were fetched from
  `https://www.agent-native.com/docs/<slug>/`. Distinctive phrases checked
  ("tab-scoped plus a global fallback key", "hard convention across all
  templates", `AGENT_NATIVE_OM_RECENT_RAW_MESSAGE_COUNT`, "additively",
  "2s polling tick", "off by design", `u:<email>`, "Every turn") are all present
  on the live pages. **No mismatch found between the live site and the repo
  `.mdx` files.**
- I read every assigned doc page (context-awareness, agent-resources,
  observational-memory, skills-guide, writing-agent-instructions,
  agent-mentions, generative-ui, client-overview/data/routing/advanced/
  agent-chat/entry-points/sync-internals, native-chat-ui, components (chat and
  composer sections), real-time-collaboration, voice-input, notifications,
  onboarding, internationalization, toolkit-context-knowledge/history), plus the
  repo's own `.agents/skills/real-time-sync/SKILL.md` and the `recorder` page
  (new since 0.206.0). Everything was followed into code.
- My own reasoning is marked **(inference)**.

---

## 0. The map in one picture

There are exactly four channels between the open UI and the agent. Everything
in this area is one of them, or storage behind them.

```
             UI (browser tab, TAB_ID)                         Agent (server run)
 ┌─────────────────────────────────────┐            ┌──────────────────────────────────┐
 │ useAgentRouteState → navigation:TAB │──PUT──┐    │ per turn, before the model call: │
 │ URLSync            → __url__:TAB    │──PUT──┤    │  <current-time>                  │
 │ Cmd+I              → pending-sel..  │──PUT──┤    │  <current-screen> = view-screen()│
 │ app code           → selection, ... │──PUT──┤    │  <current-url>                   │
 └─────────────────────────────────────┘       ▼    │  <selection> (Cmd+I text)        │
                                   ┌───────────────┐│  all appended to the USER message│
   (1) ambient state  ───────────▶ │application_   ││                                  │
                                   │state (SQL KV) │◀─ writeAppState("navigate"), ... │
   (3) agent→UI commands ◀──────── │session=email  ││  set-url-path / set-search-params│
       navigate:TAB, __set_url__   └───────────────┘│  refresh-screen                  │
                                                    │                                  │
   (2) explicit handoff: sendToAgentChat()  ──postMessage──▶ composer ──POST chat──▶ run│
       message + <context>…</context>                                                 │
                                                    │                                  │
   (4) data changes: run SSE stream "tool_done"(completedSideEffect) ──▶ window event  │
       → useDbSync invalidates ["action",…] React Query caches (250 ms coalesce)        │
       other tabs/users: __action_change__ marker → sync_events → /events SSE or /poll │
```

The design rule behind all four: **the database is the meeting point, not the
process.** The framework assumes the agent may run in a different serverless
invocation from the browser's last request, so even ephemeral UI state goes
through a SQL table: "never assume a persistent server process. Serverless and
edge are stateless, so keep all state in SQL" (`docs key-concepts 485`). The code
below follows that rule consistently.

---

## 1. `application_state`: the shared blackboard

### What it is

A per-user SQL key/value table that both the UI and the agent read and write.
It carries navigation, URL, selection, one-shot commands, drafts, measurement
data, mailbox-style RPC between server and browser, and the change markers that
drive sync.

### How it works

**Table** (`AN packages/core/src/application-state/store.ts:19–57`):

```sql
CREATE TABLE IF NOT EXISTS application_state (
  session_id TEXT NOT NULL,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,          -- JSON
  updated_at BIGINT NOT NULL,        -- Date.now()
  PRIMARY KEY (session_id, key)
);
CREATE INDEX app_state_updated_at_idx  ON application_state (updated_at);
CREATE INDEX app_state_key_updated_idx ON application_state (key, updated_at);
```

- **`session_id` is not a chat session. It is the user's email.** HTTP handlers
  resolve it from the auth session (`getSession(event).email`), falling back to
  an anonymous-owner resolver, else 401
  (`AN packages/core/src/application-state/handlers.ts:31–44`). Server-side
  helpers use the request's user email, then `capability:<token>`, then
  `AGENT_USER_EMAIL` (`AN packages/core/src/application-state/script-helpers.ts:17–36`).
  The earlier note's "keyed by `(session_id, key)`" is correct but hides this:
  it is per-user state, shared by every tab and device of that user unless the
  key itself is tab-suffixed.
- **Writes** are an upsert that stamps `updated_at = Date.now()` and then
  emits an in-process event `{source:"app-state", type:"change", key, owner,
requestSource}` (`store.ts:109–123`, `emitter.ts:49–62`).
- **Compare-and-set** exists for single keys and transactional multi-key
  batches (`store.ts:141–292`). CAS compares the stored JSON string exactly
  (`WHERE … AND value = ?`, `store.ts:212–224`), so it is byte-equality on
  `JSON.stringify` output.
- **Size guard**: on a non-local database a value over 1 MiB throws, and inline
  image bytes are rejected (`store.ts:9`, `227–242`): "Store large files,
  base64, or blobs in file storage and write only a URL or handle."
- **HTTP surface**: `GET/PUT/DELETE /_agent-native/application-state/:key`, a
  batch `GET ?keys=a,b` (max 100 keys, returns `{values, missing}`), and a CAS
  route (`handlers.ts:65–170`). Keys are sanitized to `[a-zA-Z0-9_:-]`
  (`handlers.ts:46–48`). The `X-Request-Source` header becomes the event's
  `requestSource` (`handlers.ts:128`).
- **Client helpers** `readClientAppState / writeClientAppState /
setClientAppState / deleteClientAppState / readClientAppStateMany`. Every
  request carries `X-Agent-Native-Browser-Tab: <getBrowserTabId()>`
  (`AN packages/core/src/client/application-state.ts:34,43`); reads issued in
  the same tick are coalesced into one batch request
  (`docs client-advanced 81`; batching code at `application-state.ts:189–270`).
- **Agent helpers** `readAppState / writeAppState / compareAndSetAppState /
listAppState …`. Agent writes are always tagged `requestSource: "agent"`
  (`script-helpers.ts:44–102`).

**Tab scoping.** Six "ambient" keys are automatically suffixed with the browser
tab id, on both sides:

```ts
// AN packages/core/src/application-state/script-helpers.ts:105–112 (same set in handlers.ts:50–57)
const TAB_SCOPED_AMBIENT_KEYS = new Set([
  "navigation",
  "navigate",
  "__url__",
  "__set_url__",
  "settings-view",
  "pending-selection-context",
]);
// key "navigation" + tab "3f2a…" → stored as "navigation:3f2a…"
```

The browser side gets the tab from the request header; the agent side gets it
from the run context, which the chat request body fills (`browserTabId`
field, `AN packages/core/src/agent/production-agent.ts:12185–12192`). The tab
id is a `crypto.randomUUID()` in `sessionStorage`, reused only on reload or
back/forward navigation, so a new tab or a fresh navigation gets a new id
(`AN packages/core/src/client/browser-tab-id.ts:20–54`).

### Principle

"The short version: URL query params are the source of truth for shareable
filters, `navigation` stores semantic IDs and view names, `view-screen` turns
those state layers into useful data, and `sendToAgentChat()` turns UI intent
into a chat message" (`docs context-awareness 106`). And: "Keep `navigation`
and `selection` small. Store IDs plus short labels, not whole records.
`view-screen` fetches the source of truth on demand, so stale or bulky state
never reaches the agent" (`docs context-awareness 285`).

### Changes since 0.206.0

The table creation moved into the `defineStore` migration registry (named
migrations `baseline`, `widen-bigint`, `indexes`) instead of a lazy
`ensureTable()` promise (`git diff 1284000325bf..HEAD -- application-state/store.ts`;
commits `4e49b3ac3`, `deb1f926a`, `dd55f834c`). Schema unchanged.

### Gaps / sharp edges

- **No pruning.** The only deletes are explicit key deletes
  (`store.ts:125–139, 330–355`); nothing expires `navigation:<tab>` or
  `__url__:<tab>` rows. Every new tab id adds rows that live forever
  **(inference from a repo-wide grep for `DELETE FROM application_state`)**.
- `selection` is **not** tab-scoped. Two tabs of the same user share one
  `selection` row unless the template scopes it itself (Slides ships its own
  `_tab-state.js` helper, `AN templates/slides/actions/view-screen.ts:25`).
- Every app-state write by any user becomes a sync event and, with durable
  events on, a `sync_events` row (§5). Route changes are therefore not free
  **(inference)**.

---

## 2. What the agent sees about the screen on every turn

### What it is

Before every model call the server builds up to four context blocks from
`application_state` and the clock, and **appends them to the current user
message** (not to the system prompt).

### How it works — exact flow and payload

1. **The UI writes `navigation:<TAB>`** on every route change via
   `useAgentRouteState` (React Router) or `useSemanticNavigationState`
   (router-agnostic). The app supplies `getNavigationState(location)`; the hook
   dedupes by JSON and PUTs with `keepalive` and `requestSource = TAB_ID`
   (`AN packages/core/src/client/route-state.ts:226–316, 381–508`). Optional
   `writeDebounceMs` (Mail uses 500 ms, `AN templates/mail/app/hooks/use-navigation-state.ts`).
   Example payload from the Chat template:
   `{view:"chat", path:"/chat/abc", publicPath:<path with the app mount prefix>, threadId:"abc"}`
   (`AN templates/chat/app/hooks/use-navigation-state.ts`).
2. **The sidebar writes `__url__:<TAB>`** (and an untagged `__url__`) on every
   pathname/search/hash change: `{pathname, search, hash, searchParams}`
   (`AN packages/toolkit/src/app/chat/agent-sidebar-url-sync.tsx:31–76`). It is
   mounted only while the agent panel is enabled
   (`AN packages/toolkit/src/app/chat/AgentSidebar.tsx:1873–1877`).
3. **Cmd/Ctrl+I** reads the page selection and writes
   `pending-selection-context:<TAB> = {text, capturedAt}`, then focuses chat
   (`AgentSidebar.tsx:1462–1485`). The composer shows it as a chip and clears it
   (`AN packages/toolkit/src/app/chat/AgentKitAssistantChat.tsx:3021–3037`).
4. **The user sends a message.** The chat request body includes
   `browserTabId` (`AN packages/core/src/client/chat/agentkit-agent-native.ts:231`)
   and an `x-user-timezone` header.
5. **The server runs five context thunks in parallel** with the system-prompt
   build (`production-agent.ts:13457–13520`):

| Block                                  | Source                                                                                     | Built by                                                                                | Cap                                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `<current-time>`                       | clock + `x-user-timezone`                                                                  | `buildCurrentTimeUserContext` (`AN packages/core/src/agent/runtime-context.ts:108–118`) | —                                                                                                              |
| `<current-screen>`                     | **runs the app's `view-screen` action**; if none is surfaced, the tab's `navigation` JSON  | `screenContextThunk` (`production-agent.ts:13179–13223`)                                | 10,000 chars, then a truncation note telling the model to call `view-screen` (`production-agent.ts:2273–2278`) |
| `<current-url>`                        | `__url__:<TAB>`; adds `extensionId` and, under `/settings`, a resolved `settingsPage` line | `urlContextThunk` (`13225–13276`)                                                       | —                                                                                                              |
| `<selection>`                          | `pending-selection-context:<TAB>` if younger than 5 min                                    | `selectionContextThunk` (`13278–13307`)                                                 | 8,000 chars (`2225, 2280–2283`)                                                                                |
| `<available-files/skills/agents/jobs>` | resource inventory, **first turn only, and only if `skipFilesContext` is off**             | `filesContextThunk` (`13309–13424`)                                                     | 40 items per list, 160-char descriptions (`2226–2227, 2285–2299`)                                              |

The rendered text, verbatim shapes:

```text
<current-screen>
{ …JSON returned by view-screen… }
</current-screen>

<current-url>
pathname: /adhoc/revenue
search: ?f_region=west&q=renewal
searchParams:
  f_region: west
  q: renewal
</current-url>

The user has selected the following text and pressed Cmd I to focus the agent. Treat this as the immediate context to act on:
<selection>
…
</selection>
```

6. **Assembly order inside the user message** (`production-agent.ts:13546, 13695–13709`):

```ts
// timeBlock + screenBlock + urlBlock + selectionBlock
text: enrichedMessage            // references + applied skills + the user's text
    + screenContext              // current-time, current-screen, current-url, selection
    + prefetchNote               // only when Jev prefetch degraded
    + priorConnectionContextNote(priorConnection)
    + filesContext               // first turn, if enabled
    + planModeAgentNote
    + (prior-chat-image-context note)
    + requestContextNote,
```

Code comment on the placement: "Per-turn, so the stable system prompt prefix
keeps caching" (`production-agent.ts:13637`). The system prompt has a
zero-width-space cache split (`AN packages/core/src/agent/engine/prompt-cache.ts:1–21`);
see §7 "Caching mechanics" for where the cache breakpoints actually sit.

7. **Failure semantics.** "`empty` (no navigation yet) stays silent; a timeout
   or a throw adds a note, because the model would otherwise read it as an app
   with no page" (`production-agent.ts:13160–13161`). If screen and URL fail the
   same way, the note is not repeated (`13544–13545`). The status lands in
   `runContext.contextStatus.screen` for traces (`13631–13636`).

**`view-screen` is not just "the agent's eyes on demand"; core runs it on every
turn.** The docs frame it as a tool the agent should call ("This is a hard
convention across all templates", `docs context-awareness 281`); the code calls
`surfacedRequestActions["view-screen"].run({}, {caller:"tool"})` in every
request's setup (`production-agent.ts:13183–13198`). The template skill says so
explicitly: "Core builds the `<current-screen>` block for each agent turn by
running the surfaced `view-screen` action"
(`AN packages/core/src/templates/default/.agents/skills/context-awareness/SKILL.md:163–168`).
Real `view-screen` actions are large: 22 lines in Chat, 636 in Slides, 1,022 in
Content (`wc -l templates/*/actions/view-screen.ts`). Slides' version even reads
a browser-measured slide-fit record the UI writes into app state, so the agent
sees layout overflow it cannot compute server-side
(`AN templates/slides/actions/view-screen.ts:36–60`).

**Timeouts only apply to background workers.** `presendCap` wraps each thunk
with `resolvePresendWithCap({enabled: isBackgroundWorker, …})`; when not a
background worker it simply awaits the thunk (`production-agent.ts:13426–13443,
10769–10776`). In a foreground chat request a slow `view-screen` delays the
first token with no cap **(inference from the code path)**.

### Principle

"Without context awareness, the agent is blind. It asks 'which email?' when the
user is staring at one" (`docs context-awareness 18`). The template skill adds
the operational rule: "Use the auto-injected `<current-screen>` block for basic
context — call `view-screen` only when you need richer data"
(`…/context-awareness/SKILL.md:258`).

### Changes since 0.206.0

None to the thunks. The compact framework prompt's rule 12 changed wording
around the tool index (commit `aecef0c62`, 2026-10-17), not context.

### Gaps / sharp edges

- Screen context is computed per request from the tab that sent it. Runs with
  no `browserTabId` (messaging integrations, A2A) read the untagged
  `navigation` key, which `useAgentRouteState` does not write unless
  `writeGlobalNavigation: true` (`route-state.ts:397`) — so those runs normally
  have no `<current-screen>` **(inference)**.
- The `pending-selection-context` TTL is 5 minutes; until the composer clears
  it, a second turn within 5 minutes would inject the same selection again
  **(inference; the clear is client-side, `AgentKitAssistantChat.tsx:3021`)**.
- The i18n doc says "The active locale is mirrored into application state as
  ambient context so agents can see the current interface language"
  (`docs internationalization 136`). The UI does write a `localization` key
  (`AN packages/core/src/client/i18n.tsx:620–628`), but no context thunk reads it;
  the agent sees it only if `view-screen` or a tool reads it **(inference)**.

---

## 3. UI → agent: explicit handoff

### What it is

A click that should become an agent turn, with a visible message and hidden
context.

### How it works

- `sendToAgentChat({message, context, submit, newTab, openSidebar, background,
type:"code", …})` builds `{type:"agentNative.submitChat", data:{…, tabId,
submitMessageId}}` and `postMessage`s it to the same window (buffered via
  `bufferSelfSubmit`), to the parent frame (Builder/desktop), or to an MCP App
  host bridge (`AN packages/core/src/client/agent-chat.ts:1242–1378`). It opens
  the sidebar by dispatching `agent-panel:open` unless `openSidebar:false` or
  `background:true`.
- The hidden `context` is appended to the message text, HTML-entity-escaped,
  inside a marked block:

```ts
// AN packages/agentkit/src/chat-context.ts:22–29
return `${escapeContextMarkup(message)}\n\n<context data-agentkit-context-encoding="entities-v1">\n${escapeContextMarkup(trimmedContext)}\n</context>`;
```

The UI splits it back out for display (`chat-context.ts:31–60`). So the
"hidden" context is part of the stored user turn and is replayed with history
on later turns **(inference)**.

- With `submit:false`, the context is staged as a composer chip (a
  `contextItem`) rather than written into the draft (`docs client-agent-chat 186`;
  `AN packages/toolkit/src/app/chat/MultiTabAssistantChat.tsx:2523–2546`).
- `useAgentChatContext()` stages keyed context "nuggets" that ride the next
  submit (`docs client-agent-chat 252–309`).
- `askUserQuestion()` renders a 2–4 option question in the agent panel through
  an application-state key (default `guided-questions`) and awaits the answer
  (`docs client-agent-chat 42–118`).
- `startBackgroundAgentSession()` starts a normal authenticated run with a fresh
  thread and no foreground tab (`docs client-advanced 101–131`).
- Dynamic suggestion chips are computed client-side from `navigation`,
  `selection`, `pending-selection-context` and the URL
  (`AN packages/core/src/client/dynamic-suggestions.ts:384`;
  `docs client-agent-chat 218–233`).

### Principle

"That click is an instruction. In browser UI, hand it to the agent with
`sendToAgentChat()`" (`docs context-awareness 291`). Server code should not
call it: "if an action needs the open UI to ask the agent something, write a
small request into `application_state` and let a UI bridge send it from the
browser" (`docs context-awareness 329`). The root rule behind the whole path:
"All AI work goes through the agent chat. UIs do not call LLMs directly"
(`AN AGENTS.md:256`).

### Gaps

None found beyond the persistence point above.

---

## 4. Agent → UI: commands

### What it is

One-shot commands the agent writes into `application_state`, which the UI
consumes and deletes.

### How it works

| Command              | Written by                                                                                                                                      | Key                  | Consumed by                                                                                                                                                                                                                     | How fast                                      |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Navigate to a view   | app's `navigate` action, `writeAppStateForCurrentTab("navigate", {view, path, threadId, _writeId})` (`AN templates/chat/actions/navigate.ts`)   | `navigate:<TAB>`     | `useSemanticNavigationState`: a React Query on `["navigate-command", tab, "navigate"]` with **`refetchInterval` 15,000 ms**; on data, delete the key then call `onCommand`; dedup by `_writeId` (`route-state.ts:233, 318–371`) | see below                                     |
| Change URL / filters | framework tools `set-search-params`, `set-url-path` (both `readOnly: true`) (`AN packages/core/src/server/agent-chat/context-tools.ts:288–396`) | `__set_url__:<TAB>`  | `URLSync` query `["__set_url__", tab]`; applies `navigate(url,{replace:true})` and DELETEs the key (`agent-sidebar-url-sync.tsx:78–186`)                                                                                        | immediate for `set-search-params` (see below) |
| Refresh the screen   | `refresh-screen` tool writes `__screen_refresh__ = {nonce, scope?}` (`context-tools.ts:242–276`)                                                | `__screen_refresh__` | `ScreenRefreshBoundary` bumps a React `key`, **remounting the whole main content subtree**, and marks all queries stale (`agent-sidebar-url-sync.tsx:188–203`; `AgentSidebar.tsx:1891–1901`)                                    | immediate (tool-done event)                   |
| Ask a question       | `ask-question` tool                                                                                                                             | `show-questions`     | agent panel                                                                                                                                                                                                                     | immediate                                     |

**How each reaches the UI.** The chat run's SSE stream emits a `tool_done`
frame per tool call; the client dispatches a window event
`agent-native:tool-done` (`AN packages/core/src/client/sse-event-processor.ts:1997–2009`).
`useDbSync` maps tool names to synthetic sync events:

```ts
// AN packages/core/src/client/use-db-sync.ts:1816–1834
const eventsForTool = (tool, completedSideEffect, failed) => {
  const events = [];
  if (completedSideEffect)
    events.push({ source: "action", key: tool, version: 0 });
  if (["__set_url__", "set-url", "set-search-params"].includes(tool))
    events.push({ source: "app-state", key: "__set_url__", version: 0 });
  if (tool === "refresh-screen" && !failed)
    events.push({ source: "screen-refresh", key: tool, version: 0 });
  return events;
};
```

`app-state` events for `navigate`, `show-questions` and `__set_url__` are
"interaction critical" and skip the 250 ms coalescing window
(`use-db-sync.ts:434–451, 1506–1517`).

- `set-search-params` → immediate `__set_url__` invalidation → `URLSync`
  refetches → navigates. Latency ≈ one app-state GET.
- **`set-url-path` is not in that list** (the list says `"set-url"`, a tool
  name that does not exist; the real tool is `"set-url-path"`,
  `context-tools.ts:341`). It is `readOnly`, so no `action` event either. On a
  page without a realtime opt-in, nothing invalidates the `__set_url__` query
  after it; the URL query has no `refetchInterval` and the house query client
  sets `staleTime: 30_000, refetchOnWindowFocus: false`
  (`AN packages/core/src/client/create-query-client.ts:20–36`) **(inference:
  likely bug; the realtime-sync skill also lists `set-url`,
  `AN .agents/skills/real-time-sync/SKILL.md:115–118`)**.
- **An app `navigate` action has no tool-done mapping.** It is a normal
  non-readOnly action, so it produces an `action` event that invalidates
  `["action", …]` queries, not `["navigate-command", …]`. On a page that has not
  opted into realtime (the Chat template's root does not,
  `AN templates/chat/app/root.tsx:94–100`), the command is applied on the next
  15-second refetch of the command query **(inference from
  `route-state.ts:233` and `use-db-sync.ts:1732–1748`; I found no other path)**.
  On an opted-in page the server-side `app-state` event for `navigate:<TAB>`
  arrives over SSE/poll and triggers an immediate refetch.

### Principle

"`navigate` is the mirror image of `navigation`… The `navigation` key belongs
to the UI; the agent must never write to it directly. The agent writes
`navigate`, the UI performs the move, and that move is what updates
`navigation`" (`docs context-awareness 344–355`). "Keep app navigation
single-channel: do not write both `navigate` and `__set_url__` for the same
move" (`docs context-awareness 359–361`).

### Gaps

- The docs say `useNavigationState` "polls the `navigate` command"
  (`docs context-awareness 371`) — accurate, but they do not say the poll is
  15 s. The prompt tells the model "navigate first, then fetch/display data"
  (`AN packages/core/src/server/prompts/framework-core-compact.ts:91`).
- `refresh-screen` remounts the main subtree, losing local component state
  (scroll positions, unsaved inputs) **(inference from the `key` bump)**.

---

## 5. Agent data edits → the open UI (live sync)

### What it is

How a row the agent writes shows up in the UI without a reload, for (a) the
user who is chatting, (b) the same user's other tabs, (c) other users.

### How it works

**(a) The chatting tab — "run-scoped invalidation", no background request.**

1. The agent calls a tool. After it settles, the server classifies the call:
   `invocationEffect()` returns `committed | unknown | none` from write
   evidence, `readOnly`, receipts and errors
   (`AN packages/core/src/action.ts:377–417`; wired at
   `production-agent.ts:8414–8421, 9832–9835`).
2. It emits `tool_done {…, completedSideEffect: callEffect === "committed"}` on
   the run's SSE stream (`production-agent.ts:9940–9958`).
3. The client fires `agent-native:tool-done`; `useDbSync` (mounted in every
   template root, with or without realtime) turns it into
   `{source:"action", key:<tool>}`, bumps local change counters and queues an
   invalidation (`use-db-sync.ts:1816–1900`).
4. After a 250 ms coalescing window (`INVALIDATE_COALESCE_MS`,
   `use-db-sync.ts:71`) it calls
   `queryClient.invalidateQueries({queryKey:["action"]}, {cancelRefetch:false})`
   — or a narrower predicate when every action event names a `resourceType`
   (`use-db-sync.ts:1550–1700`). It schedules a trailing refresh if a fetch was
   already in flight.
5. When the run ends (`agentNative.chatRunning` with `isRunning:false`), it
   re-applies the same events for every side-effecting tool seen in that run
   (`use-db-sync.ts:1901–1928`).

Latency: ≈ 250 ms + one action round trip after the tool finishes. "A local
agent edit does not meet this rule [for opting into realtime]. The chat run
stream already invalidates action queries and source counters after each
side-effecting tool and again at run end, without opening a background poll"
(`AN .agents/skills/real-time-sync/SKILL.md:20–22`).

**(b, c) Everyone else — change events.**

1. **Server write side.** After a committed tool call, the agent loop calls
   `notifyActionChangeInBackground({actionName, owner, orgId, resourceType?,
resourceId?})` (`production-agent.ts:9880–9902`). That does two things
   (`AN packages/core/src/server/action-change-marker-write.ts:42–61`):
   - **fast path, same process**: `recordChange({source:"action",
type:"change", key:actionName, owner, …})` on the in-process
     `AppSyncState` (`AN packages/core/src/server/poll.ts:2058–2075`);
   - **durable marker, cross process**: an upsert of key `__action_change__`
     into `application_state`, under session `owner` (or `__org__:<id>`, plus a
     resource suffix), with a nonce.
     HTTP action calls from the UI do the same and await the marker "in full …
     polling clients read the marker right after the response"
     (`action-change-marker-write.ts:63–69`).
     Every `application_state` and `settings` write is also recorded, via
     emitters wired once (`poll.ts:572–588`).
2. **`AppSyncState.recordChange`** assigns a monotonic version
   (`max(version+1, Date.now())`, or a DB-allocated version on the hosted
   transport), appends to a 200-event in-memory ring buffer, emits
   `poll-change` to live SSE listeners, and persists to `sync_events`
   (`poll.ts:62, 1010–1039, 1122–1132`).
3. **Cross-process discovery.** On each `/poll` request (and when a collab doc
   loads its state baseline, `AN packages/core/src/collab/routes.ts:49–52`),
   `checkExternalDbChanges()` — rate-limited to once per 1 s, or once per 30 s
   when durable events are on — reads `MAX(updated_at)` of `application_state`,
   the action-marker rows, `settings` and `tools`, and converts newer rows into
   change events (`poll.ts:86–87, 1702–1931`). This is table-watermark polling,
   driven by client polls. With durable events on (the default unless
   `AGENT_NATIVE_SYNC_EVENTS_DISABLE=1`), each `/poll` also reads `sync_events`
   rows written by other processes and merges them with the in-memory buffer
   (`poll.ts:163–169, 1485–1560`); the watermark scan is then a 30-second
   backstop for writes that bypassed `recordChange`. The SSE handler only relays
   its own process's in-memory emitter, so on a multi-instance long-lived
   deployment a cross-instance change reaches an SSE-connected tab on that tab's
   slow fallback poll (≥ 60 s, idle backoff to 5 min) **(inference from
   `poll-events.ts:54–163` and `use-db-sync.ts:741–830`)**.
   On a production serverless host whose schema migrates at release, this scan
   is skipped entirely and `/poll` "trusts sync_events" (`poll.ts:1994–2010,
2135–2143`).
4. **Delivery to a browser** happens only on pages that opt in with
   `useDbSync({realtime:{reason}})`. One `SyncTransport` per tab
   (`use-db-sync.ts:515`):
   - **Leader election across tabs** with `navigator.locks` on
     `agent-native-sync:<pollUrl>`; the leader opens the one `EventSource` and
     re-broadcasts frames on a `BroadcastChannel`
     (`use-db-sync.ts:854–940`).
   - **SSE** `GET /_agent-native/events?poll_live=1` (alias
     `/_agent-native/poll-events`). Heartbeat every 10 s; per-event visibility
     check before push (`AN packages/core/src/server/poll-events.ts:54–163`;
     routes `AN packages/core/src/server/core-routes-plugin.ts:1381–1389, 3897–3937`).
   - **On production serverless the SSE route answers 204** when `poll_live=1`,
     because "A serverless invocation holding this stream never ends on its
     own … one open tab becomes a steady stream of fresh cold containers"
     (`core-routes-plugin.ts:3899–3923`). The client then reports capability
     `poll-live` and polls.
   - **Poll** `GET /_agent-native/poll?since=<v>&cursor=<v>.<id>` →
     `{version, events, cursor}`. Composite cursors `(version, id)` make
     delivery exactly-ordered and idempotent (`use-db-sync.ts:238–340`).
   - **Cadence** (`use-db-sync.ts:59–76, 741–830`): during an active chat run
     in the tab, `interval` (default 2 s); otherwise idle 60 s × backoff
     `[1, 2, 5]` → 1, 2, 5 minutes, reset on activity or a local mutation;
     hidden tab: at least 10 s or paused (`pauseWhenHidden` default true);
     errors: exponential up to 300 s; **collab boost 2.5 s** while another
     person is present in a collab doc and no stream is connected.
5. **Visibility.** Events carry `owner`, `orgId`, and optionally
   `resourceType/resourceId`. `canSeeChangeForUser` delivers to the owner/org,
   or to anyone `resolveAccess()` admits for the resource; a cache miss fires a
   background check and returns "not yet" — "we NEVER deliver to a user before
   their access has been affirmatively confirmed" (`poll.ts:886–916`). An action
   declares `changeResource: (input, result) => ({resourceType, resourceId})`
   to fan an event out to sharees; otherwise "an `action` event reaches the
   actor alone" (`AN .agents/skills/real-time-sync/SKILL.md:79–88`).
6. **Client application.** `invalidateForEvents` drops `action` events whose
   `requestSource` equals this tab's id and events matching `ignoreSource`
   ("jitter prevention"), bumps `useChangeVersion(source)` counters, and
   invalidates `["action"]`, `["app-state", key]`, `["navigate-command", tab]`,
   `["__set_url__", tab]`, extension keys, etc. (`use-db-sync.ts:1550–1773`).

**Durable tables** (`poll.ts:68–84, 97–117, 171–208`;
`AN packages/core/src/server/sync-events-prune.ts:5`):

```sql
CREATE TABLE sync_events (
  id TEXT PRIMARY KEY, version BIGINT NOT NULL, event_json TEXT NOT NULL,
  source TEXT NOT NULL, type TEXT NOT NULL, event_key TEXT,
  owner TEXT, org_id TEXT, resource_type TEXT, resource_id TEXT,
  created_at BIGINT NOT NULL);               -- index on (version); retention 24 h
CREATE TABLE sync_version (id INT PRIMARY KEY, v BIGINT NOT NULL);   -- hosted allocator
CREATE TABLE sync_events_prune_state (id INT PRIMARY KEY, cursor_version BIGINT, lease_owner TEXT, …);
-- hosted allocation:
-- UPDATE sync_version SET v = GREATEST(v+1, epoch_ms, ?) … RETURNING v; INSERT INTO sync_events …
```

**What is NOT used:** no Postgres `LISTEN/NOTIFY`, no websockets, and no DB
triggers for UI sync (repo-wide grep for `LISTEN `, `pg_notify`, `NOTIFY `
finds nothing). Row triggers do exist, but only for the separate
`app_resource_changes` feed that keeps search indexes fresh: "Producers call one
SQL function … Today the producers are row triggers that core generates for a
registered table … Consumers never poll"
(`AN packages/core/src/resource-changes/store.ts:1–26, 92, 279`).

**Hosted Realtime Sync Gateway** (opt-in, Builder-hosted by default for
Builder deploys): the gateway tails the app's `sync_events` from its own
network and fans out; the browser mints a 10-minute subscribe token at
`/_agent-native/realtime-token`; the gateway calls `/_agent-native/can-see`
per event; versions come from `sync_version` so app instances and gateway agree
(`docs real-time-collaboration 602–740`; client binding `use-db-sync.ts:357–390,
555–601`; `poll.ts:1934–1952`). "Self-registration means sending Builder your
PostgreSQL connection string … The connection is not read-only"
(`docs real-time-collaboration 705–710`). Every failure falls back to local
polling.

### Latency summary (my synthesis from the constants above)

| Who sees the agent's write          | Long-lived Node host                                            | Production serverless, no gateway                             | With hosted gateway        |
| ----------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------- |
| The chatting tab                    | ~250 ms + refetch (tool-done path)                              | same                                                          | same                       |
| Same user, other tab, page opted in | SSE push ≈ immediate if same process; cross-process ≤ next poll | next poll: 2 s during an active run in that tab, else 1–5 min | gateway stream ≈ immediate |
| Other user, opted-in page           | same, if `changeResource` declared                              | same                                                          | same                       |
| Page not opted in                   | only on refetch/navigation                                      | same                                                          | same                       |

### Principle

"Opt in only when both are true: 1. The data can change without the current
user acting. 2. The user needs to see that change before refreshing or
navigating" (`AN .agents/skills/real-time-sync/SKILL.md:13–18`). "Do not create
manual polling loops or a second `EventSource`" (`…:140`). The `realtime`
option throws without a reason string: "useDbSync realtime opt-in requires a
short reason" (`use-db-sync.ts:1445–1451`) — cost made visible in code review.
This opt-in model dates from `6d1b545c7` (2026-09-29), before 0.206.0.

### Changes since 0.206.0

- `useDbSync` now bumps an `app-state:*` change counter for app-state events
  without a key (`git diff 1284000325bf..HEAD -- client/use-db-sync.ts`).
- `poll.ts` (+178/−) and `sync_events` stores moved into `defineStore`
  (`4e49b3ac3`, `deb1f926a`, `dd55f834c`).

### Gaps / sharp edges

- On serverless with no gateway, a cross-user change on an idle opted-in page
  can take up to 5 minutes.
- Durable events are written for every app-state write, including UI
  `navigation` writes on every route change, retained for 24 h
  **(inference)**.
- "release-owned serverless polling trusts sync_events; route direct SQL writes
  through recordChange instead of restoring marker scans" (`poll.ts:2142`): a
  direct SQL write (a raw `db-exec`, a cron job writing without `recordChange`)
  is invisible to sync there.
- Docs inconsistency on cadence: `client-sync-internals` diagram says "the ~2s
  polling tick as fallback" (`docs client-sync-internals 96`); `key-concepts`/`client-data` say idle 1/2/5 min.
  Code: 2 s only while a chat run is active in that tab.

---

## 6. People and the agent editing the same document

### What it is

Yjs CRDT documents for character-level co-editing, with the agent as a peer,
persisted in Postgres and transported over the same `/poll` + SSE channel.

### How it works

**Storage** (`AN packages/core/src/collab/storage.ts:5–31, 102–124`):

```sql
CREATE TABLE _collab_docs (
  doc_id TEXT PRIMARY KEY,
  yjs_state TEXT NOT NULL,              -- base64 Y.encodeStateAsUpdate
  text_snapshot TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 0,   -- optimistic concurrency
  updated_at TEXT NOT NULL DEFAULT NOW()::text);
-- save = UPDATE … SET version = version + 1 WHERE doc_id = ? AND version = ?
```

**Server**: an LRU cache of up to 50 `Y.Doc`s, an in-process per-doc write
lock, and CAS retries (5) against `version` (`AN packages/core/src/collab/ydoc-manager.ts:32,
111–132, 209–253`). Routes under `/_agent-native/collab/:docId/` — `state`
(with `?stateVector=` for diffs), `update`, `text`, `search-replace`, `json`,
`patch`, `awareness`, `users` (`docs real-time-collaboration 572–589`). Every
applied update is emitted as `{source:"collab", type:"yjs-update", docId,
update:<base64>, requestSource}` and, via the collab plugin, recorded as a sync
event tagged with the resource's owner/org and `resourceType/resourceId`
(`AN packages/core/src/server/collab-plugin.ts:340–405`). **Yjs updates
therefore live in `sync_events.event_json` for 24 h.**

**Client** (`useCollaborativeDoc`): local Yjs updates are debounced 80 ms and
merged with `Y.mergeUpdates` before `POST /update`
(`AN packages/core/src/collab/client.ts:155, 740–790`). Remote updates arrive as
`collab` sync events and are applied with origin `"remote"`; own-tab echoes
are dropped by `requestSource`; an update from `requestSource:"agent"` marks the
agent active in presence (`client.ts:925–951`). The collab client polls
`/_agent-native/poll` itself — 2 s without SSE, 12 s with SSE or `poll-live` —
and also subscribes to the shared transport, which runs regardless of any
realtime opt-in (`client.ts:1089–1130, 893–923`; `use-db-sync.ts:1397–1422`).
A state-vector catch-up runs on reconnect, gaps, or every 15th poll
(`docs real-time-collaboration 596`).

**The agent edits through one of two paths** — the docs describe only the
second as "the" mechanism:

1. **Server-side Yjs mutation (Design template).** `withPreparedYDocMutation`
   loads the latest stored state into a candidate `Y.Doc`, lets the action
   mutate it, persists it **inside the app's own DB transaction** with CAS on
   `_collab_docs.version`, then emits the diff as a collab update with
   `requestSource:"agent"` (`ydoc-manager.ts:134–196`; used at
   `AN templates/design/server/source-workspace.ts:1171`). Clients merge it like
   any peer's update.
2. **SQL content + lead-client reconcile (Content, Plan).** The action edits
   the document's SQL content column and bumps `updatedAt`
   (`docs real-time-collaboration 119–124`). The open editor refetches the
   record; exactly one tab — the visible peer with the lowest Yjs `clientID`,
   never the agent (`AGENT_CLIENT_ID = 2147483647`) — applies it into the
   shared doc (`AN packages/core/src/collab/lead-client.ts:5–40`,
   `agent-identity.ts:1`). Before the agent edits, the server asks the open
   editor to save via an **application_state mailbox RPC**: CAS-write
   `flush-request-<docId> = {requestId, status:"pending"}` into the editor
   user's session, poll every 200 ms for `status:"success"|"error"` (20 s if
   the editor advertises `canFlushDocument`, else 4 s best effort), then CAS it
   away (`AN templates/content/actions/_document-flush.ts:14–21, 92–214`).
   The editor applies newer server content with a **block-level three-way
   merge**: diff base→live and base→server by top-level ProseMirror nodes; if
   hunks overlap it returns `conflict` (or, with `overlapPolicy:"prefer-live"`,
   drops the overlapping server hunks); otherwise it applies the server hunks
   as one non-undoable transaction
   (`AN packages/toolkit/src/editor/surgical-apply.ts:191–290`). Non-lead tabs
   wait 2.5 s, then fail over after 5 s if the lead never converged
   (`AN packages/toolkit/src/editor/useCollabReconcile.ts:53–59`).

**Structured documents** avoid CRDT body edits altogether with
"granular server-side merge" actions — Slides `patch-deck`, Forms
`patch-form-fields` with per-item upsert/remove/reorder ops
(`docs real-time-collaboration 801–833`).

**Presence/awareness**: throttled POST within 150 ms; server stores awareness
per process and forwards `AWARENESS_CHANGE_EVENT` over SSE
(`docs real-time-collaboration 426–431`). Agent presence via
`agentEnterDocument/agentUpdateSelection/agentLeaveDocument`; any server-side
Yjs write with `requestSource:"agent"` also touches agent presence
(`ydoc-manager.ts:34–47`).

**Undo**: `Y.UndoManager` with `trackedOrigins` = local origin only, so
"Remote peer edits and agent edits are never undone by a user's Cmd+Z"
(`docs real-time-collaboration 838–870`); `useLocalOpUndo` for non-Yjs ops.

### Principle

"That peer might be a teammate. It might be the agent. From the framework's
perspective they are identical: both produce Yjs operations that merge
conflict-free into the shared document" (`docs real-time-collaboration 14–19`).

### Changes since 0.206.0

- Collab client: non-collab application events now reach subscribers through
  the same transport (`onEvent`), plus poll-generation guards against stale
  overlapping polls (`git diff … -- collab/client.ts`; commits `dfb4ffb45`,
  `7028ea51f`).
- `createLocalOpUndoController` apply callbacks may now return `false` or
  `"conflict"`, and failed applies are discarded from the stack
  (`git diff … -- collab/undo.ts`; `9d865288d` "Fix Slides undo/redo history").

### Gaps / sharp edges

- The documented "known limitation" says same-region rewrites are
  last-write-wins (`docs real-time-collaboration 877`). For Content the code now
  detects overlap at top-level-block granularity and reports a conflict instead
  (`surgical-apply.ts:239–246`); the docs did not catch up.
- Compaction: the docs say tombstone compaction runs "when the stored blob
  exceeds 4× the freshly encoded state" (`docs real-time-collaboration 113`);
  `buildStateToStore` returns `Y.encodeStateAsUpdate(doc)` on both branches of
  that check (`ydoc-manager.ts:198–207`), i.e. it always stores the fresh
  encoding. Harmless, but the 4× rule is dead code.
- Awareness and write locks are per-process
  (`docs real-time-collaboration 881–891`).

---

## 7. Instructions, skills and resources: how they are layered into the prompt

### What it is

The agent's standing knowledge comes from two stores that are layered at
request time:

1. **Build-time files**: the app's `AGENTS.md` and `.agents/skills/*/SKILL.md`,
   inlined into the server bundle as a Vite virtual module.
2. **Run-time SQL resources**: rows in a `resources` table, per owner
   (workspace / organization or app / personal).

### How it works

**Build-time bundle.** `virtual:agents-bundle` is generated by
`agentsBundlePlugin`; it JSON-inlines `AGENTS.md` (or the paths configured in
`instructions.runtime` / `instructions.development`), every
`.agents/skills/<name>/SKILL.md` (plus `.agent/skills` legacy), readable
sub-files ≤ 64 KB each / 256 KB per skill, and a workspace-core AGENTS.md and
skills dir if present (`AN packages/core/src/vite/agents-bundle-plugin.ts:19–60`;
`AN packages/core/src/server/agents-bundle.ts:121–128, 254–361`). Dev mode
invalidates it on file change (HMR); production reads the baked copy. The
runtime and development instruction files can differ
(`docs agent-native-config 109–110, 209–219`).

**Skill visibility.** Frontmatter `scope: runtime | dev | both` (default
`both`); `dev` and any unrecognized value are hidden from the runtime agent
(`AN packages/core/src/server/agent-chat/skill-frontmatter.ts:36–69`). Optional
`requires-lab` gates a skill on a per-user Labs toggle
(`agents-bundle.ts:369–420`). Example: the default template ships 24 skills,
18 marked `scope: dev`; only `agent-engines`, `build-an-app`,
`frontend-design`, `inline-embeds`, `notifications`, `progress` reach the
runtime agent (`grep scope: AN packages/core/src/templates/default/.agents/skills/*/SKILL.md`).
The repo-root `skills/` directory (`an`, `assets`, `content`, `context-xray`,
`visual-plans`, …) holds **exported marketplace skills for external coding
agents** (`metadata.visibility: exported`), not runtime skills
(`AN skills/context-xray/SKILL.md:1–8`).

**SQL resources** (`AN packages/core/src/resources/store.ts:1152–1170`):

```sql
CREATE TABLE resources (
  id TEXT PRIMARY KEY, path TEXT NOT NULL, owner TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '', mime_type TEXT NOT NULL DEFAULT 'text/markdown',
  size BIGINT NOT NULL DEFAULT 0, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL,
  created_by TEXT NOT NULL DEFAULT 'user',
  visibility TEXT NOT NULL DEFAULT 'workspace',   -- or 'agent_scratch' (24 h TTL)
  thread_id TEXT, run_id TEXT, expires_at BIGINT, metadata TEXT,
  UNIQUE(path, owner));
```

Owner encoding (`store.ts:43–105`): personal = **the plain email**;
app-wide = `__shared__`; organization = `__organization__:<orgId>`; workspace
= `__workspace__` or `__workspace__:__organization__:<orgId>`. Path conventions
decide behaviour: `AGENTS.md`, `instructions/*.md`, `skills/<n>/SKILL.md`,
`context/*.md`, `agents/*.md`, `remote-agents/*.json`, `jobs/*`, `memory/*`,
`LEARNINGS.md`, `mcp-servers/*.json` (`docs agent-resources 97–107`).
On first prompt load, each user is seeded with a personal `AGENTS.md`,
`LEARNINGS.md` and a `skills/learn/SKILL.md` (`store.ts:459–493, 617–640,
1486–1580`).

**The layering function** is `loadResourcesForPrompt(owner, compact, appId,
orgId)` (`AN packages/core/src/server/agent-chat/prompt-resources.ts:1585–1915`).
Sections are appended in this exact order, each wrapped as
`<resource name=… scope=… path=…>…</resource>` and tagged with a governance
tier (`required` sections are never dropped by the budget):

| #   | Section                                                                                                                               | Source                          | Governance    | Full mode                                                                   | Compact mode (default)                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1   | Workspace-core `AGENTS.md`                                                                                                            | bundle                          | required      | ≤30k chars                                                                  | ≤6k chars                                                                                                   |
| 2   | Template `AGENTS.md`                                                                                                                  | bundle                          | **inherited** | ≤30k                                                                        | ≤6k                                                                                                         |
| 3   | Skills block                                                                                                                          | bundle                          | inherited     | `<skills>` with every runtime skill: name, dir, description, sub-file slugs | `<skills-summary>`: first 40 skills, descriptions ≤180 chars, "Read with `docs-search --slug skill-<name>`" |
| 4   | Workspace SQL `AGENTS.md`                                                                                                             | `workspaceResourceOwner(orgId)` | required      | ≤30k                                                                        | ≤6k                                                                                                         |
| 5   | Workspace `instructions/*.md`                                                                                                         | same                            | inherited     | full text each                                                              | **only a list of paths with a read hint**                                                                   |
| 6   | App-default (`__shared__`) `AGENTS.md`                                                                                                | SQL                             | required      |                                                                             |                                                                                                             |
| 7   | App-default `instructions/*.md`                                                                                                       | SQL                             | inherited     | full                                                                        | list only                                                                                                   |
| 8   | Organization `AGENTS.md` (if org)                                                                                                     | SQL                             | required      |                                                                             |                                                                                                             |
| 9   | Organization `instructions/*.md`                                                                                                      | SQL                             | inherited     | full                                                                        | list only                                                                                                   |
| 10  | Personal `AGENTS.md`                                                                                                                  | SQL                             | required      |                                                                             |                                                                                                             |
| 11  | Personal `instructions/*.md`                                                                                                          | SQL                             | user          | full                                                                        | list only                                                                                                   |
| 12  | Personal `memory/INSTRUCTIONS.md`                                                                                                     | SQL                             | required      |                                                                             |                                                                                                             |
| 13  | `<resource-skills>`: SQL skills (personal → org → shared → workspace, newest first)                                                   | SQL                             | inherited     | first 40, each with a `resources read` hint                                 | same                                                                                                        |
| 14  | Shared `LEARNINGS.md` (org, else app)                                                                                                 | SQL                             | inherited     | ≤30k                                                                        | ≤6k                                                                                                         |
| 15  | Personal `memory/MEMORY.md`                                                                                                           | SQL                             | user          | ≤30k                                                                        | **not loaded**; replaced by a `<context-note>` saying `resources` reads memory                              |
| 16  | `<workspace-resources>` indexes (workspace, shared, org): first 40 text resources with frontmatter title/description or first heading | SQL                             | inherited     |                                                                             |                                                                                                             |
| 17  | `<prompt-context-provider>` blocks from registered providers, sorted by id                                                            | code                            | inherited     | ≤8k chars each                                                              |                                                                                                             |
| 18  | `<available-apps>`: up to 30 A2A peers with a "default to local" policy                                                               | discovery                       | required      |                                                                             |                                                                                                             |

Citations: section order `prompt-resources.ts:1622–1907`; caps `50–53,
153–157`; compact instructions list `678–745` (text: "Detailed instruction
files are loaded on demand so the first model request stays compact", `708`);
compact skills summary `429–447`; memory note `1798`; resource index `844–888`;
providers `84–146`.

In compact mode the whole set must fit **48,000 characters**:
`selectPromptSectionsWithinBudget` keeps all `required` sections, then adds
the others in order while they fit, and appends a `<context-budget-note>`
listing what was dropped: "Treat them as unread, not as absent"
(`prompt-resources.ts:527–593`). Required context alone over budget is sent
over budget with a warning (`1893–1910`).

**Is compact mode the default?** Yes: `lazyContext = options?.lazyContext !==
false && !leanPrompt` (`AN packages/core/src/server/agent-chat-plugin.ts:1635`),
and no template sets `lazyContext:false` (grep). `skipFilesContext` defaults to
`lazyContext`, so the per-turn `<available-*>` inventories in §2 are also off by
default (`agent-chat-plugin.ts:1636–1637`). Templates with `leanPrompt:true`
(Factory, Forms; Analytics on serverless) also load resources compact and drop
the framework core prompt entirely, keeping only the app's own system prompt,
the lean actions list and a run-policy block
(`agent-chat-plugin.ts:3338–3350, 5080–5113`; `AN templates/forms/server/plugins/agent-chat.ts:57`).
The compact default dates from at least 2026-04-23 (`git 11d9c12a8`); the
list-only instructions from 2026-07-11 (`git 38ca6faf9`).

**Final system prompt** (standard, non-lean path,
`agent-chat-plugin.ts:5050–5164`):

```
PROD_FRAMEWORK_PROMPT_COMPACT (filtered to the surfaced tools)  ┐ cached prefix
+ actions prompt (tool index)                                   ┘
+ SYSTEM_PROMPT_CACHE_SPLIT (U+200B zero-width space)
+ resources (the 18 sections above, ≤48k chars compact)
+ schemaBlock ("" in lazy mode; the agent calls db-schema)
+ code-editing restriction / code-exec mode / hosted-harness notes
+ extra (app runtime context hook)
+ model overlay (GPT/Gemini nudges)
+ <runtime-context> (date, timezone, delegation depth)   — "appended LAST"
+ <jev-prefetched-context> (≤16k compact / 24k full)     — added per request, production-agent.ts:13626
(+ PLAN_MODE_SYSTEM_PROMPT in plan mode)
```

The code comment on order: "Stable-first ordering … runtimeContext only
changes once per calendar day … putting it last means a day rollover
invalidates as little of the prefix as possible" (`agent-chat-plugin.ts:5072–5079`).
**Caching mechanics.** The Anthropic and Builder engines put cache breakpoints
on (1) the last tool schema, (2) the stable system block before the split, and
(3) the last block of the last user message
(`AN packages/core/src/agent/engine/anthropic-engine.ts:144–176`;
`builder-engine.ts:287–326`). So resources, runtime context and history are
cached only through breakpoint (3): reused across iterations of one run, and
across turns only while the volatile system text stays byte-identical. Because
`<jev-prefetched-context>` is appended to the system prompt per request, a
change in what Jev selects invalidates the cached history prefix for that turn
**(inference from the breakpoint positions)**.

**Slash-invoked skills** are inlined into the user message as
`<applied-skill name=… path=… source=…>` (≤40,000 chars each), under "Applied
skills (read and follow before acting):" (`production-agent.ts:2228, 4004–4078`).

**Context X-Ray** shows the user every section with provenance/governance
labels (`emitContextXraySystemSections`, `agent-chat-plugin.ts:4873–4980`) and
lets the user pin, evict or summarize message segments per thread; directives
persist in `context_directives (thread_id, segment_id, action, summary_text,
active, …)` and are applied to the message array before every model iteration
(`AN packages/core/src/agent/context-xray/migrations.ts:6–30`;
`apply-directives.ts:55–80`; `production-agent.ts:7392–7400`).

### Principle

"Instead of cramming every rule into one system prompt, you split knowledge
into focused files the agent loads only when a task actually needs them —
keeping the default context small while still letting the agent go deep on
demand" (`docs skills-guide 8`). "The `description` is the only thing the agent
sees when deciding whether to read a skill… Keep it under ~40 words; it is
loaded into context on every conversation" (`docs writing-agent-instructions
113–128`). And the multi-tenant economics: "it's PostgreSQL/PGlite rows, not
filesystem files … A multi-tenant SaaS can give every user a
fully-customizable agent for essentially free, because all of it is rows"
(`docs agent-resources 12`).

### Changes since 0.206.0

- The `<available-apps>` block now carries an explicit "default to local"
  delegation policy (`7c4669b17`, 2026-10-19), mirrored in
  `WORKSPACE_APP_DELEGATION_GUIDANCE`
  (`AN packages/core/src/server/prompts/shared-rules.ts:24–25`).
- Compact core rule 12 now points to "the Tool index" (`aecef0c62`).
- `resources/store.ts` (+254/−) refactor into `defineStore`.

### Gaps / sharp edges

- **In the default (compact) mode, "loaded every turn" is not true for
  `instructions/*.md` guardrails, personal `memory/MEMORY.md`, or any AGENTS.md
  beyond 6,000 characters.** The model gets a list or a truncation note and must
  choose to read the rest.
- The template's own `AGENTS.md` is `inherited`, not `required`, so under budget
  pressure it can be dropped while SQL AGENTS.md files survive
  (`prompt-resources.ts:1639–1651`).
- AGENTS.md from multiple scopes is concatenated, not overridden; "later scope
  wins" (`docs agent-resources 107`) applies to `resource-effective` reads of a
  path such as `context/brand.md`, not to instruction injection.
- Editing the repo `AGENTS.md` in production requires a rebuild (it is baked
  into `virtual:agents-bundle`); editing the SQL `AGENTS.md` in the Resources tab
  takes effect next turn (`docs agent-resources 189`).

---

## 8. Memory: three different things

The word "memory" names three unrelated mechanisms in this codebase.

### 8.1 Structured user memory (`save-memory` → resources)

**What it is.** Durable facts about a user or organization, saved by the agent
as Markdown resources.

**How it works.** The `save-memory` tool (`AN packages/core/src/scripts/resources/save-memory.ts:34–182`):

- requires `name`, `type ∈ {user, feedback, project, reference}`,
  `description`, `content`; `scope ∈ {personal, current-org}` (org needs the
  shared-resource admin check);
- writes `memory/<name>.md` with frontmatter `type/description/updated` and
  upserts one line in `memory/MEMORY.md`:
  `- [<name>](<name>.md) — <description>` (`save-memory.ts:93–126`);
- commits the files and index together with
  `resourcePutSnapshotBatchIfCurrent` (optimistic, 5 attempts) and warns when
  the index exceeds 200 lines (`save-memory.ts:98–173`).

The framework prompt tells the agent: "Use `save-memory` proactively when you
learn preferences, corrections, or project context. At the end of a meaningful
multi-turn task, review the thread for durable new learnings and save only what
should help future conversations" (`framework-core-compact.ts:94`). A seeded
`/learn` skill drives it (`resources/store.ts:459–493`); `/learn-shared` writes
shared `LEARNINGS.md` only with explicit approval: "A generic request to
remember something does not authorize sharing it" (`store.ts:494–528`).

**How it is recalled (default compact mode):** not by injecting `MEMORY.md`.
Instead the **Jev prefetch** (§8.2) ranks memory index entries against the
request and injects up to two memory _bodies_.

### 8.2 Jev prefetch: per-request retrieval of skills and memories

**What it is.** "Jev" is a Builder-hosted ranking model (`JEV_MODEL =
"jev-latest"`, 750 ms timeout, reached through the Builder gateway or a Jev API
key) that picks the few skills, memories and analytics references most relevant
to the current request (`AN packages/core/src/agent/jev-tool-prefetch.ts:19–31`;
credentials `production-agent.ts:894–919`).

**How it works** (`prompt-resources.ts:1244–1555`):

1. Candidates, within a 1.3 s budget: every runtime skill (only if Jev is
   configured) and up to 8 memory entries parsed from personal and
   current-org `memory/MEMORY.md`, pre-sorted by a lexical score (word overlap
   via `Intl.Segmenter`, terms ≥3 chars or ≥2 for CJK, weight = length capped
   3–8) (`prompt-resources.ts:944–1093`).
2. With Jev: one question per category — "Which skills are relevant to this
   task? Choose at most 3." / "Which prior user memories are important for this
   task? Choose at most 2 based only on their short summaries." (`1366–1380`).
3. Without Jev (or if it fails): the top lexical memory with score ≥ 3 is
   selected ("ponytail: lexical recall catches indexed terms without a Jev call;
   use embeddings or a reranker when semantic misses justify the added cost",
   `1075`).
4. Selected memory bodies are loaded and injected as
   `<jev-prefetched-context>` (≤6k per item / ≤16k total in compact; 10k/24k
   full) appended to the system prompt, with the preamble "Mandatory AGENTS.md
   instructions remain authoritative. Treat stored memories as prior context and
   verify time-sensitive facts" (`165–170, 1508–1555`; `production-agent.ts:13626`).

So a deployment without Builder/Jev credentials gets at most one
lexically-matched memory per turn, and no skill prefetch.

### 8.3 Observational Memory: compaction of long threads

**What it is.** Automatic summarisation of the older part of one chat thread
into "observations" and "reflections" that replace the raw prefix in context.

**How it works.**

Table (`AN packages/core/src/agent/observational-memory/store.ts:27–80`):

```sql
CREATE TABLE observational_memory (
  id TEXT PRIMARY KEY, thread_id TEXT NOT NULL,
  tier TEXT NOT NULL,                       -- 'observation' | 'reflection'
  text TEXT NOT NULL, token_estimate BIGINT NOT NULL DEFAULT 0,
  source_start_index BIGINT, source_end_index BIGINT,   -- message indices
  source_message_count BIGINT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL,
  owner_email TEXT NOT NULL, org_id TEXT, visibility TEXT NOT NULL DEFAULT 'private');
-- indexes (thread_id, tier, created_at), (thread_id, owner_email)
```

Defaults (`observational-memory/config.ts:1–9`): observe at 30,000 unobserved
tokens; reflect at 40,000 observation-log tokens; keep the last 12 messages
raw; outputs capped at 4,000 / 2,000 tokens. Env overrides
`AGENT_NATIVE_OM_{OBSERVATION_TOKEN_THRESHOLD,REFLECTION_TOKEN_THRESHOLD,RECENT_RAW_MESSAGE_COUNT}`.

**Producer** — fire-and-forget after a clean turn
(`production-agent.ts:10210–10232`, under `waitUntil` when available):

- **Observer** (`observer.ts:36–111`): cursor = `MAX(source_end_index)` of
  existing observations; window = all messages after it (including the latest
  turn); if the window is ≥ 30k tokens, render it as text
  (`user: …`, `[tool:name] {json}`, `[tool-result] …`; images dropped,
  `message-text.ts:4–25`) and call the app's default engine with
  `reasoningEffort:"low", temperature:0`, 60 s timeout, no tools
  (`internal-run.ts:8–56`). Prompt:

  > "You are the Observer for a long-running agent thread. You compress a span
  > of raw conversation into a single DENSE, DATED observation log that will
  > REPLACE those raw messages in future context. … Preserve precisely: task
  > status …, proper names …, exact dates, numbers, and decisions with their
  > rationale. … Never invent facts." (`prompts.ts:1–8`)

  The prior observation log is passed "for continuity — do NOT repeat it". The
  result is inserted as one `observation` row with
  `source_end_index = messages.length - 1`.

- **Reflector** (`reflector.ts:33–102`): if the _sum_ of all observation
  tokens ≥ 40k, condense all observations (plus prior reflections) into one new
  `reflection` row.

**Consumer** — before every model iteration, after Context X-Ray directives
(`production-agent.ts:7392–7420, 4606–4652`): if the thread has any OM rows,
build one synthetic user message:

```text
[Observational Memory] The earlier part of this long conversation has been compacted into the dated reflections and observations below. Treat these as an authoritative record of what already happened — do not redo completed work, and trust the recorded decisions, names, dates, and status. The most recent turns follow verbatim after this block.

## Reflections (highest-level)
…all reflection rows…

## Observations (dense, dated)
…all observation rows…
```

(`read.ts:28–53`), then send `[omMessage, ...messages.slice(safeStart)]` where
`safeStart` = first non-tool-result message at or after `length - 12`. If no
safe start exists, it prepends the block without trimming.

**Principle.** "Short threads are unaffected … OM is a no-op and the context is
byte-for-byte what it would be without it" (`docs observational-memory 10`).
"Because OM replaces the volatile raw prefix with stable compacted text, it also
keeps the prompt cache-stable across turns of a long thread"
(`docs observational-memory 126`).

**Gaps / sharp edges (all inference from the code above):**

- **Messages between the observed cursor and the 12-message tail are dropped.**
  The read side trims to the last 12 messages whenever _any_ OM row exists, but
  the Observer only folds a window once it reaches 30k tokens. After the first
  observation, up to ~30k tokens of newer, not-yet-observed messages older than
  the tail are silently removed from context until the next observation pass.
- **Reflections never shrink the log.** No code deletes or supersedes
  observation rows (`grep` finds no DELETE on `observational_memory`), and the
  read side injects _all_ observations _and all_ reflections. Once the summed
  observation tokens pass 40k, the threshold stays exceeded, so the Reflector
  runs and inserts a new reflection after **every** subsequent clean turn.
- The cursor is a message _index_. If the history the client sends is shaped
  differently from the in-loop array (merged tool messages, truncated history,
  an edited earlier message), the cursor drifts; there is only a warning when it
  passes the end (`observer.ts:48–54`).
- The Observer uses the app's default engine and stored model, not a cheap
  model (`internal-run.ts:20–27`).
- "OM data … is never shared across users" (`docs observational-memory 128`):
  correct, every query filters `owner_email` and `org_id`
  (`store.ts:124–137`).

**Changes since 0.206.0:** store moved to `defineStore` with a versioned
migration ledger (`dd55f834c`, `deb1f926a`); no behaviour change.

### 8.4 Thread history itself

`chat_threads (id, owner_email, title, preview, thread_data TEXT JSON,
message_count, created_at, updated_at, scope_type/id/label, pinned_at,
archived_at, share_token_hash, source_platform, source_app_id, source_url,
org_id, visibility)` (`AN packages/core/src/chat-threads/store.ts:105–126`).
Context X-Ray directives and OM rows hang off `thread_id`.

---

## 9. The full prompt for one turn — order and size budget

Putting §2, §7 and §8 together, for a default (compact, non-lean) app:

| Layer                                                                                                                                                                                                                                        | Where                        | Typical cap                                      | Cached?                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------ | ------------------------ |
| Framework core (compact) + actions/tool index                                                                                                                                                                                                | system, before split         | —                                                | breakpoint on the stable block |
| Resources: AGENTS.md ×(1–6 scopes), skills summary, instruction lists, LEARNINGS, memory note, resource indexes, providers, available-apps                                                                                                   | system, after split          | 6k per resource; 48k total (required can exceed) | only via the last-user-message breakpoint, while byte-identical |
| `extra`, model overlay, `<runtime-context>`                                                                                                                                                                                                  | system, end                  | —                                                | same; `<runtime-context>` changes daily |
| `<jev-prefetched-context>` (≤2 memories, ≤3 skills, ≤2 analytics refs)                                                                                                                                                                       | system, appended per request | 16k                                              | changes per request → breaks the shared prefix when it changes |
| `[Observational Memory]` block                                                                                                                                                                                                               | first message                | grows unbounded (see §8.3)                       | stable between OM passes |
| History (last 12 raw if OM active, else all), after Context X-Ray evict/summarize                                                                                                                                                            | messages                     | —                                                | via the last-user-message breakpoint |
| Current user message: references, `<applied-skill>` (≤40k each), `Responses from other agents:` (`@`-mention results), the text, `<context>` from handoff, `<current-time>`, `<current-screen>` (≤10k), `<current-url>`, `<selection>` (≤8k) | last user message            | —                                                | breakpoint at its end; reused by later iterations of the same run |

Sources: `agent-chat-plugin.ts:5050–5164`; `prompt-resources.ts:1585–1915`;
`production-agent.ts:13457–13730, 14820–14830`; §8.

---

## 10. Mentions (`@`) and slash skills (`/`)

### How it works

`enrichMessage(message, references)` prefixes the user's text with blocks per
reference type (`production-agent.ts:4004–4078`):

- **files** → `Referenced files:\n- <path> (resource)` — paths only;
- **skills** → `<applied-skill>` with the full skill content (≤40k);
- **custom agents** → listed, then _run_: each `agents/*.md` profile runs a
  sub-agent loop with its own instructions and optional model, and its answer is
  prepended to the user message as
  `Responses from other agents:\n\n<agent-response name="…" id="…" type="custom-agent">…</agent-response>`
  (`production-agent.ts:14740–14830`);
- **connected agents** (`remote-agents/*.json`) → called over A2A with progress
  relayed as `agent_call*` events, same `<agent-response>` wrapping
  (`3768–3960, 14840–14880`);
- **custom `MentionProvider` items** → `- [<refType>] <name> (id: …)` reference
  lines (`docs agent-mentions 246`).

### Docs vs code

- "Codebase files — … The file contents are included in the agent's context"
  (`docs agent-mentions 107`). Code inlines only the path.
- Docs show `<agent-response agent="analytics">` (`docs agent-mentions 136`);
  code emits `name="…" id="…"`.

---

## 11. Generative UI and native chat widgets (how the agent renders UI in chat)

### How it works

Two separate paths, both keyed by metadata on the tool result, never by shape
inference:

1. **Native widgets** — an action declares `outputSchema` and
   `chatUI: {renderer}`; the server attaches `chatUI` and `chatUIResult` to the
   `tool_done` frame (`production-agent.ts:9954–9955`), and `<AssistantChat>`
   mounts a registered React component (`registerActionChatRenderer`). Built-ins:
   `data-chart`, `data-table`, `data-insights`; a `chatUI.when(args,result)`
   predicate runs server-side and is never sent to the browser
   (`docs native-chat-ui 89–160, 249–283`). "It never shape-infers arbitrary
   objects and never executes HTML or JavaScript from tool results"
   (`docs native-chat-ui 149`).
2. **Generative UI** — `render-inline-extension` (transient),
   `create-extension` (saved), `show-extension-inline`. The result declares
   `chatUI:{renderer:"core.inline-extension"}`; the chat mounts a sandboxed
   Alpine/Tailwind iframe **without `allow-same-origin`**; inputs arrive as
   `window.slotContext`; the iframe talks to the app only via a path-allowlisted
   bridge (`appAction`, `appFetch` under `/_agent-native/*`, `extensionData`,
   read-only `dbQuery`) (`docs generative-ui 105–270`). Passive outputs go to
   application state at `inline-ui:<extensionId>:output`, which the agent reads
   with `readAppState`; active outputs go through
   `agentNative.chat.send` = `sendToAgentChat`, draft-only unless
   `submit:true` (`docs generative-ui 178–240`).

### Principle

Prefer a typed action with a native renderer; use generative UI only for
one-off controls; "Prefer `appAction` for domain data. Actions carry
validation, access checks, and business rules" (`docs generative-ui 167–168`).

### Gaps

Transient inline UI state lives in host `localStorage` and "is not visible to
the agent or backend" (`docs generative-ui 170–176`).

---

## 12. History, checkpoints and undo

- **Resource versions** — `agent_resource_versions (id, resource_type,
resource_id, version_number, created_at, created_by, actor_kind
'human'|'agent'|'system', owner_email, org_id, visibility, title, summary,
snapshot_json, metadata_json)`, unique on `(resource_type, resource_id,
version_number)` (`AN packages/core/src/history/store.ts:36–80`). Apps register
  `registerVersionedResource({type, resolveAccess, getSnapshot,
restoreSnapshot})` (`history/types.ts:39–50`). UX rules: "History should
  identify human vs agent edits. Restore is a new action, not a silent database
  rewind" (`docs toolkit-history 72–73`). An `onAgentTurnComplete` hook runs only
  when the turn has a committed side effect, for autosave snapshots
  (`agent-chat-plugin.ts:597–618`).
- **Checkpoints** — Code-mode git commits per agent turn:
  `agent_checkpoints (id, thread_id, run_id, commit_sha, message, created_at)`
  plus a filesystem lock beside the git index; restore = reset the working tree
  to a commit (`AN packages/core/src/checkpoints/store.ts:5–33`,
  `service.ts:27–85, 116, 328`). This is about app source, not app data.
- **Undo** — Yjs `UndoManager` scoped to local origins; `useLocalOpUndo` for
  app-local inverse ops (§6).

---

## 13. Peripheral pieces in this area

- **Notifications.** `notify(input, {owner})` always writes
  `notifications (id, owner, severity, title, body, metadata,
delivered_channels, created_at, read_at)`, fans out to `email`, `slack`,
  `webhook` and custom channels best-effort with a delivery-state table
  `notification_delivery_state` (lease + claim token), calls `recordChange()`
  so opted-in pages refresh, and emits `notification.sent` on the event bus
  (`AN packages/core/src/notifications/store.ts:27–56`; `docs notifications
125–140, 350–372`). The agent tool is `manage-notifications`.
- **Event bus.** An in-process `EventEmitter` stored on `globalThis` under a
  `Symbol.for` key so duplicate module copies share it; used by automations
  (`AN packages/core/src/event-bus/bus.ts:14–80`). It is not a cross-process bus.
- **Voice.** Dictation POSTs audio to `/_agent-native/transcribe-voice`
  (Builder-proxied Gemini Flash-Lite by default, BYOK Gemini/Groq/OpenAI, else
  browser Web Speech); provider preference is the app-state key
  `voice-transcription-prefs` so the agent can change it (`docs voice-input
14–22, 138–140`). Realtime speech uses WebRTC to an OpenAI realtime model with
  the same authenticated tools; priority tools are `navigate`, `set-url-path`,
  `set-search-params`, `view-screen`, `chat-history`, `tool-search`
  (`AN packages/core/src/server/realtime-voice.ts:90–97`).
- **Onboarding.** `registerOnboardingStep({id, order, title, methods[],
isComplete})`; a method of kind `agent-task` hands setup to the chat with a
  prompt (`docs onboarding 167–205`).
- **i18n.** Locale preference persisted in user-scoped SQL `settings` under
  `localization` and mirrored to app state (§2 gap)
  (`docs internationalization 121–137`).
- **Browser context (`browser-context.v1`).** A zod schema for what the browser
  extension captures from _third-party_ pages: `readable` (text ≤64k chars,
  blocks, links), `design` (elements with computed styles, tokens,
  screenshots), `control` (accessibility nodes, ephemeral with expiry); total
  ≤96 KB, ≤3 projections (`AN packages/core/src/browser-context/index.ts:3–18`).
  It is not used for the app's own screen. Unchanged since 2026-07-29
  (`git 24a5a2020`).
- **Recorder (new since 0.206.0, `f99e65543`, 2026-10-15).** A redacted,
  in-memory, two-minute record of actions, app-state writes (diffed), route
  changes, errors and toasts, turned into a report for "Report a problem",
  Sentry or Clips; "Nothing is stored on the server and nothing leaves the
  browser until a report is sent somewhere" (`docs recorder 6–16`). It is not
  injected into ordinary agent turns.

---

## 14. What is persisted where (tables in this area)

| Table                                                    | Purpose                                                                              | Key columns                                      | Source                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------ | ------------------------------------------- |
| `application_state`                                      | UI↔agent blackboard, commands, mailboxes, change markers                             | `(session_id=email, key)`, `value`, `updated_at` | `application-state/store.ts:19–57`          |
| `sync_events`, `sync_version`, `sync_events_prune_state` | durable change feed for poll/SSE/gateway, 24 h                                       | `version`, `event_json`, owner/org/resource      | `server/poll.ts:68–208`                     |
| `_collab_docs`                                           | Yjs state per doc                                                                    | `doc_id`, `yjs_state`, `version`                 | `collab/storage.ts:5–31`                    |
| `resources`                                              | AGENTS.md, instructions, skills, memory, context, agents, jobs, MCP configs, scratch | `UNIQUE(path, owner)`                            | `resources/store.ts:1152–1170`              |
| `observational_memory`                                   | thread compaction                                                                    | `thread_id`, `tier`, indices                     | `agent/observational-memory/store.ts:27–80` |
| `context_directives`                                     | Context X-Ray evict/summarize/pin                                                    | `thread_id`, `segment_id`, `action`              | `agent/context-xray/migrations.ts:6–30`     |
| `chat_threads`                                           | thread transcript JSON                                                               | `owner_email`, `thread_data`                     | `chat-threads/store.ts:105–126`             |
| `agent_resource_versions`                                | app data version history                                                             | `(resource_type, resource_id, version_number)`   | `history/store.ts:36–80`                    |
| `agent_checkpoints`                                      | git checkpoints per turn                                                             | `thread_id`, `commit_sha`                        | `checkpoints/store.ts:5–33`                 |
| `notifications`, `notification_delivery_state`           | bell inbox + fan-out                                                                 | `owner`                                          | `notifications/store.ts:27–56`              |
| `app_resource_changes`, `app_resource_change_consumers`  | trigger-fed change feed for search consumers                                         | `(consumer, app, resource_type, resource_id)`    | `resource-changes/store.ts:36–77`           |
| `settings`                                               | user/org settings incl. `localization`                                               | —                                                | (settings store)                            |

Browser-only: `sessionStorage` tab id; transient inline-UI `extensionData` in
`localStorage`; recorder ring buffer in memory.

---

## Principles list

1. **The database is the rendezvous point between UI and agent, even for
   ephemeral state** — `application_state` for screen/selection/commands, a
   mailbox protocol for server→browser requests (`docs context-awareness 22–29`;
   `templates/content/actions/_document-flush.ts:92–214`).
2. **State keys are small and semantic; fresh records are fetched at read time**
   — "Store IDs plus short labels, not whole records" (`docs context-awareness 285`).
3. **The agent sees the user's current screen on every turn without asking** —
   `view-screen` runs per request and its result rides in the user message
   (`production-agent.ts:13179–13223`; `context-awareness/SKILL.md:163–168`).
4. **Volatile context goes in the user message; stable context goes first in the
   system prompt** — "Per-turn, so the stable system prompt prefix keeps caching"
   (`production-agent.ts:13637`; `agent-chat-plugin.ts:5072–5079`).
5. **Ownership is single-channel and one-way per key** — the UI owns
   `navigation`, the agent owns `navigate`; never write both `navigate` and
   `__set_url__` for one move (`docs context-awareness 355–361`).
6. **A click is an instruction; hand it to the agent, don't call an LLM from UI**
   (`docs context-awareness 291`).
7. **The chat run stream refreshes the actor's UI; background sync is an opt-in
   with a written reason** (`.agents/skills/real-time-sync/SKILL.md:13–22`;
   `use-db-sync.ts:1445–1451`).
8. **Sync is pull-friendly so it works on serverless** — durable `sync_events`,
   cursors, watermark scans; SSE is an optimisation that serverless refuses
   (`core-routes-plugin.ts:3899–3923`).
9. **Never deliver a change before access is confirmed** (`poll.ts:886–916`).
10. **The agent is a CRDT peer, not a privileged writer** — same Yjs channel,
    never the reconcile lead, never on the user's undo stack
    (`docs real-time-collaboration 14–19`; `lead-client.ts:20`).
11. **Progressive disclosure for instructions** — names and descriptions always,
    bodies on demand, with an explicit budget and a "treat as unread, not absent"
    note for what was cut (`docs skills-guide 8, 14`; `prompt-resources.ts:527–536`).
12. **Customisation is rows, scoped per owner, so per-user agents cost nothing
    extra in a multi-tenant app** (`docs agent-resources 12`).
13. **Memory is explicit and reviewable** — Markdown files in the Resources tab,
    one index line per memory; sharing org-wide requires approval
    (`save-memory.ts:93–126`; `resources/store.ts:494–528`).
14. **Long threads are compacted in the background, never on the hot path**
    (`docs observational-memory 75`; `production-agent.ts:10210–10232`).
15. **Tool results render as UI only by explicit declaration, never by shape**
    (`docs native-chat-ui 149`).
16. **Agent edits are labelled as agent edits** — `requestSource:"agent"`,
    `actor_kind`, agent presence (`script-helpers.ts:44–102`; `history/types.ts:3`).

---

## Docs vs code

1. **Personal resource owner format.** Docs: personal scope is
   `u:<email>` (`docs agent-resources 81, 332`; also on the live page). Code:
   personal owner is the bare email (`resources/store.ts:43–105`;
   `save-memory.ts:71–89`; `packScopeFromOwner` compares `owner === userEmail`).
2. **"Loaded every turn"** for `instructions/*.md` and `memory/MEMORY.md`
   (`docs agent-resources 101, 269, 297–298`; `docs skills-guide 341`). In the
   default compact mode, instructions are listed by path only
   (`prompt-resources.ts:690–710`) and `MEMORY.md` is not injected
   (`prompt-resources.ts:1786–1800`); AGENTS.md is cut at 6,000 characters.
3. **Skill scope default for unknown values.** Docs: "When `scope` is absent (or
   set to an unrecognized value) it defaults to `both`" (`docs skills-guide 233`).
   Code: an unrecognized value is `"invalid"` and hidden from the runtime agent
   (`skill-frontmatter.ts:52–69`; since `44ac2c4ac`, 2026-08-11).
4. **"Every skill's name and description are always injected"**
   (`docs skills-guide 14`). Compact mode lists the first 40 only, with
   descriptions truncated to 180 chars (`prompt-resources.ts:154–157, 429–447`).
5. **Navigation writes "tab-scoped plus a global fallback key"**
   (`docs context-awareness 412`). Code writes only the tab-scoped key unless
   `writeGlobalNavigation:true` (`route-state.ts:397–403`; default since
   `96cb0c59e`, 2026-09-04).
6. **`view-screen` as a tool the agent must call** ("hard convention",
   `docs context-awareness 281`) vs core running it automatically every turn
   (`production-agent.ts:13179–13198`).
7. **Action descriptions "Every turn, as the tool list"**
   (`docs writing-agent-instructions 204`). The compact core prompt says "Most app
   actions and connected MCP tools load on demand; find exact names via the Tool
   index or search the registry with `tool-search`" (`framework-core-compact.ts:100`).
8. **`application_state` "Every turn, as live app state"**
   (`docs writing-agent-instructions 205`). Only `navigation` (via
   `view-screen`), `__url__` and `pending-selection-context` are injected;
   `selection` reaches the agent only if `view-screen` returns it.
9. **@-mentioned files**: "file contents are included" (`docs agent-mentions 107`)
   vs path only (`production-agent.ts:4010–4024`).
10. **`<agent-response agent="…">`** (`docs agent-mentions 136, 148`) vs
    `<agent-response name="…" id="…">` (`production-agent.ts:14793, 14850`).
11. **Collab agent-edit path**: "Agent actions do not push into Yjs in-process"
    (`docs real-time-collaboration 119`). Design does exactly that, server-side
    and transactionally (`ydoc-manager.ts:134–196`;
    `templates/design/server/source-workspace.ts:1171`).
12. **Same-region rewrite is last-write-wins** (`docs real-time-collaboration 877`)
    vs Content's block-level three-way merge with conflict detection
    (`surgical-apply.ts:191–290`).
13. **Collab SSE path** `/_agent-native/poll-events` (`docs real-time-collaboration
139, 431`) — code's primary route is `/_agent-native/events`; `poll-events` is
    a legacy alias (`core-routes-plugin.ts:370–371, 1381–1389`).
14. **Tombstone compaction at 4×** (`docs real-time-collaboration 113`) — both
    branches store the same fresh encoding (`ydoc-manager.ts:198–207`).
15. **"~2s polling tick as fallback"** (`docs client-sync-internals 96`) vs
    idle 1/2/5-minute polling, 2 s only during an active run
    (`use-db-sync.ts:59–76, 741–830`; `docs client-data 354, 411`).
16. **"use focus/navigation refetches"** for non-realtime pages
    (`docs client-data 431`) — the house query client disables
    `refetchOnWindowFocus` (`create-query-client.ts:28`).
17. **Locale "mirrored into application state as ambient context so agents can
    see"** (`docs internationalization 136`) — written, but not injected
    (§2).
18. **Real-time skill**: URL commands "(`__set_url__`, `set-url`, and
    `set-search-params`)" flow through local chat events
    (`.agents/skills/real-time-sync/SKILL.md:115`) — the code list contains the
    non-existent `set-url` and omits `set-url-path` (`use-db-sync.ts:1825`).
19. **Observational Memory replaces "the raw older prefix"** and "keeps the
    recent-raw window intact" (`docs observational-memory 71`). Code drops every
    message before the 12-message tail once any OM row exists, including messages
    the Observer has not folded yet (`production-agent.ts:4606–4652`;
    `observer.ts:56–64`).
20. **Reflections "condensed from the observation log"** sit above the
    observations (`docs observational-memory 18, 77–78`). Code never removes
    reflected observations and injects both tiers in full
    (`read.ts:28–53`; no DELETE on `observational_memory`), so the block only grows.

Corrections to the earlier trainm8 note ([`agent-native.md`](../agent-native.md) §2.6–2.8):

- §2.6: "`application_state` is an ordinary table keyed by `(session_id,
key)`" — the `session_id` is the user's email, and six keys are tab-suffixed.
- §2.6: the screen block is not in the system prompt; it is appended to the
  user message on every turn, and it is the _output of `view-screen`_, not the
  raw `navigation` key (raw `navigation` only as a fallback).
- §2.8: "AGENTS.md, loaded on every turn" — true for SQL AGENTS.md (up to 6k
  chars); the repo AGENTS.md is baked into the build, also capped at 6k in
  compact mode, and droppable under budget. Instruction files and personal
  memory are not loaded every turn in the default mode.

---

## Not verified

- Whether the client sends the full thread history every turn (affects OM
  cursor stability); I did not trace the client's history builder.
- Real-world latency of the navigate path on a non-realtime page; the 15 s
  bound is from code constants, not a measurement.
- Whether `pending-selection-context` is cleared after every submit in all chat
  surfaces (`AgentKitAssistantChat` clears it; I did not check
  `MultiTabAssistantChat`/mobile).
- The `/learn` and capture-learnings flows in practice (how often the model
  calls `save-memory` unprompted).
- Hosted gateway internals (Builder's service) — only the client/app side is in
  the repo.
- Whether prior turns' `<current-screen>` blocks are stored in thread history
  (I believe not; the block is added to the request copy of the message).

## Open questions

1. Is the `set-url-path` omission in `eventsForTool` a bug, or is there another
   path that applies it on non-realtime pages?
2. Is the 15 s `navigate` command poll intended for templates without realtime
   (Chat, default)? A `tool-done` mapping for the app's `navigate` tool would make
   it immediate.
3. Does Observational Memory intend to drop unobserved middle messages, and to
   re-run the Reflector every turn after the first crossing of 40k? A
   "superseded_by" column or deletion of reflected observations would fix both.
4. Why is the template `AGENTS.md` governance `inherited` rather than `required`
   (`prompt-resources.ts:1639–1651`) when SQL AGENTS.md files are `required`?
5. Is there a plan to expire tab-scoped `application_state` rows?
6. Why is the per-request `<jev-prefetched-context>` appended to the system
   prompt (ahead of the history in the cache prefix) instead of to the user
   message, where the per-turn screen context goes? Whenever Jev picks a
   different memory or skill, the cached prefix covering resources and history
   no longer matches.

Relevance to trainm8 (one line): the patterns most transferable are the
per-turn `<current-screen>` from a server-side `view-screen`, run-stream
invalidation for the actor's own UI, and the opt-in-with-reason rule for
background sync.
