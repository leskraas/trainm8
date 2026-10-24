# Every athlete operation is one typed action, and the routes, the MCP server and an agent are its readers

Status: Accepted · owner confirmed 2026-10-24 · Ticket #550 (map #541) · Backed
by
[`mcp-server-for-trainm8.md` §6.1, §6.5, §6.7, §7, §8](../research/mcp-server-for-trainm8.md#8-one-registry-three-consumers),
[`agent-layer-building-blocks.md` §9.1](../research/agent-layer-building-blocks.md#91-the-registry-owned-by-trainm8-with-no-framework),
[`agent-native.md` §5.4, §7.1](../research/agent-native.md#71-what-to-borrow)
and
[`agent-native-deep-dive.md` §3, §11.5, §18](../research/agent-native-deep-dive.md#18-what-this-means-for-trainm8s-own-agent-layer).
The owner asked the agent to answer #550's grilling from the research
(2026-10-24) and confirmed every recommendation the same day; see
[Owner's decisions](#owners-decisions). The shortcuts among them are tracked
under [Deferred hardening](#deferred-hardening) and #639.

Where this ADR borrows from the sibling project Bredvid/tavla, which worked
through the same registry questions later than trainm8's research, it cites
"Bredvid/tavla `<path>`". Where tavla chose differently, the choice and its
reason are stated in place.

**Cites [ADR 0098](./0098-source-terms-bind-per-origin-platform.md)** for the
`source-terms` reason and widens the model-facing gate from Strava to every
Origin Platform, as 0098 asked. **Keys on
[ADR 0096](./0096-every-import-records-its-origin-platform-and-one-activity-is-one-row.md)**'s
Origin Platform. **Confirms
[ADR 0014](./0014-integrations-per-folder-no-interface.md)**: MCP is an inbound
surface, not a provider, so it lives in `app/mcp/`, not `app/integrations/`.
**Confirms
[ADR 0081](./0081-the-planning-redesign-speaks-norwegian-and-labels-ts-still-owns-every-word.md)**
and scopes it for model-facing output (§10). The proposal author, the athlete's
yes and undo handles are
[ADR 0093](./0093-an-assistant-proposes-and-never-gives-the-athletes-yes-and-every-write-it-makes-can-be-undone.md);
authorization and transport are ADR 0094.

## Context

trainm8 already has most of an agent layer in its own idiom: owner-scoped
services that return result unions, proposals that need the athlete's yes (ADR
0080), undo (ADR 0088) and the **Unavailable Metric**. A model can reach none of
it. About 70 action modules dispatch string intents with `if` and `switch`, and
nothing lists the operations, so there is nothing to generate a tool from
([`agent-layer-trainm8-surface.md` §7](../research/agent-layer-trainm8-surface.md#7-readiness-verdict)).

Map #541 decided to build our own small layer on agent-native's principles
rather than adopt or fork it, and to serve it first over MCP to the athlete's
own assistant ([`agent-strategy.md`](../research/agent-strategy.md)). Three
readers will call the same operations: the routes, the MCP server, and later an
in-app agent (ADR 0095). If each reader had its own path to the data, a
capability could drift between them, and so could the rules that keep a model
honest: owner scoping, refusals, the building principle and each platform's
terms.

"Unavailable" is also said four ways today: `ReviewMetric`'s nulls, `TsbTrust`'s
"building baseline", `UNAVAILABLE_READINGS`, and free-text reasons formatted by
`nbUnavailableReason`. `PlannedMetric<T>` (`app/utils/planned-discipline.ts`) is
already the right shape for one number. A model needs one shape for all of them.

## Decision

### 1. One action per operation, in `app/actions/`

An **action** is one athlete operation, defined once with `defineAction`, one
per file in `app/actions/`, and listed in one registry. It has:

- `name`: stable `snake_case`, at most 64 characters, `[a-z0-9_]`. It is the MCP
  tool name too, so one word names the operation everywhere. A removed name is
  never reused.
- `revision`: a number, bumped when the action's meaning or its input changes in
  a way that is not additive.
- `kind`: `read`, `propose` or `write` (§2).
- `callers`: which callers may run it (§3).
- `title`: the athlete's words, from `labels.ts`. `description`: English, for a
  model, written as a template with no data in it.
- `input` and `output`: `zod/v4` schemas, JSON-native. Route forms keep their
  Conform schemas (strings, `'on'`, decimal commas) and map onto `input`.
- `run(ctx, input)`: the only place the operation's work happens. It calls the
  existing owner-scoped services; it does not move them.

`runAction(ctx, name, input)` is the one entry. It validates `input` once,
checks the caller and scope, runs the action, and returns an `ActionResult`
(§5). It never throws for a refusal.

_Bredvid/tavla `docs/adr/0001-agent-native-kjerne.md` D2–D3 and
`docs/research/anc-register.md` A1, A6 reach the same shape: a stable name, a
revision, and adapters that are loops over the registry with no code per
action._

### 2. Three kinds, fixed per action

| Kind      | What it does                                                                                                     | Scope              |
| --------- | ---------------------------------------------------------------------------------------------------------------- | ------------------ |
| `read`    | Writes nothing.                                                                                                  | `training:read`    |
| `propose` | Records a pending **Week Replan Proposal** and nothing else. It never applies without the athlete's yes (0093).  | `training:propose` |
| `write`   | Changes the athlete's data. Open to a model only for the athlete's own acts, and then it returns an undo (0093). | `training:log`     |

A kind is fixed per action and never depends on the input. An operation whose
effect would change with its arguments is split into two actions.

_Tavla chose `effect: read | write` with a static `risk: low | high`, and made
"propose" the outcome of an agent calling a high-risk write
(`docs/adr/0001-agent-native-kjerne.md` D3, D8). trainm8 keeps three kinds,
because its proposal is its own domain object with its own rules (ADR 0080), not
a deferred write: `propose_week_change` creates something the athlete answers on
a card, whose load direction and ownership decide how it may apply. Tavla's
underlying rule is kept: kind, like risk there, is static, so the tool list
never depends on the arguments (`docs/research/anc-register.md` A1)._

### 3. Callers come from the credential, and the athlete's yes is web-only

`ctx` holds `userId`, `now`, `timezone` and `caller`. The caller is one of:

- `web`: the athlete's cookie session, on a request with no `Authorization`
  header;
- `mcp`: a bearer token at `/mcp`;
- `agent`: an in-app agent running in process (ADR 0095).

The caller is derived at the boundary from the credential that authenticated the
request, never from a header, a query parameter or an argument the client sets.
**`userId` comes from `ctx` only**: no action input has a user, athlete or owner
id, and every lookup inside `run` is scoped by `ctx.userId`.

An action lists its `callers`. Actions that **are** the athlete's yes —
`answer_proposal`, `accept_round`, `ease_week`, `release_session`, and later
season approval — list `web` only. A model caller that reaches one gets
`refused` with the code `needs-athlete-yes` (0093 §3).

_Tavla derives `human` only from a cookie session with no `Authorization` header
for the same reason (`docs/research/anc-forslag.md` TL;DR, D9)._

### 4. The catalog is built from the registry and the caller, and scope is checked at the call

The MCP server lists every action whose `callers` include `mcp`, whatever scopes
the token carries. It never varies the list by a request header or anything else
the client sends. When a token lacks an action's scope, the call answers `403`
with `insufficient_scope`, which is how a client steps up.

_The MCP note had the server register only the tools a token's scopes allow
([§8.2](../research/mcp-server-for-trainm8.md#82-the-three-consumers)) and also
step up through `403`
([§3.4](../research/mcp-server-for-trainm8.md#34-scopes-and-per-user-isolation)).
The two contradict each other: a model never calls a tool it cannot see, so
step-up never fires. Tavla's answer is taken: filter by caller, enforce scope at
the call (`docs/research/anc-rettigheter.md` F2,
`docs/research/anc-mcp-katalog.md` F6, `docs/adr/0001-agent-native-kjerne.md`
D18)._

Annotations are derived, never written by hand:

| Kind      | `readOnlyHint` | `destructiveHint`                        | `idempotentHint`            | `openWorldHint` |
| --------- | -------------- | ---------------------------------------- | --------------------------- | --------------- |
| `read`    | `true`         | —                                        | —                           | `false`         |
| `propose` | `false`        | `false`                                  | `false`                     | `false`         |
| `write`   | `false`        | `true`, unless declared `additive: true` | only if declared and tested | `false`         |

A write is hinted non-destructive only when it only adds (writing a session,
marking one _Gjort_, logging sets) and a test says so. `undo` is
`destructiveHint: true, idempotentHint: true` (ADR 0076 §2–3). Annotations are
hints for the host's own prompt, not a control: everything that keeps the
athlete safe is enforced in `runAction` and the domain
([MCP §1.2](../research/mcp-server-for-trainm8.md#12-tool-annotations-and-structured-output)).

### 5. One result union, and refusals are typed

```ts
type ActionResult<O> =
	| {
			outcome: 'done'
			value: O
			undo?: UndoRef
			link?: string
			credits: Credit[]
	  }
	| { outcome: 'proposed'; proposalIds: string[]; link: string }
	| { outcome: 'refused'; code: RefusalCode; next: Next; message: string }
	| { outcome: 'not-run'; reason: 'rate-limited' | 'switched-off' | 'internal' }
	| { outcome: 'unknown'; message: string } // writes only: may have happened; read first

type Next = 'fix-input' | 'ask-athlete' | 'reread' | 'stop'
```

- **`refused`** means nothing happened and the same call will not succeed.
  `code` comes from one closed list in `app/actions/refusals.ts`, and each code
  has a fixed `next`, so every reader gives the same advice. The existing
  services' `{ ok: false, reason }` values map onto these codes in the action.
  `message` is the athlete's words from `labels.ts`, the same sentence the route
  shows today. The seed list: `invalid-input`, `not-found`, `not-allowed`,
  `needs-athlete-yes`, `needs-scope`, `stale`, `too-late`, `already-answered`,
  `not-undoable`, `undo-expired`, and the domain's own codes as each slice lands
  (`not-the-coming-week`, `no-before-image`).
- **`not-run`** means nothing happened and the same call may succeed later.
- **`unknown`** is only for a write whose handler started and then failed: it
  may have committed, so the model reads before it retries. A failed read is
  `not-run`.
- `ok: true` does not exist. A `proposed` result is not success-shaped, so a
  model cannot read "proposed" as "done".
- `UndoRef` (an opaque handle id and its expiry) is ADR 0093 §6's.

The MCP reader returns `refused`, `not-run` and `unknown` as tool results with
`isError: true`, and `done` and `proposed` with `isError: false`. Every result's
`structuredContent` is the whole envelope, and `outputSchema` describes the
whole envelope, so an error validates too. The first text block is one English
sentence from a template (what happened and what to do next) followed by the
serialised envelope; no data is interpolated into trainm8's own voice.

_Agent-native's failure contract is the reason for typed refusals: a refusal
returned as data reads as success
([AN §7.1](../research/agent-native.md#71-what-to-borrow)). The envelope, `next`
and the text block follow Bredvid/tavla `docs/research/anc-register.md` A2–A3
and `docs/research/anc-mcp-katalog.md` F4. Tavla calls the transient outcome
`unavailable`; trainm8 calls it `not-run`, because `unavailable` is a
**Reading**'s word (§6)._

### 6. Every number a model sees is a Reading

```ts
type Reading<T> =
	| { status: 'available'; value: T }
	| {
			status: 'unavailable'
			reason: UnavailableReason
			label: string // labels.ts, the athlete's words
			platforms?: OriginPlatform[] // only with 'source-terms'
	  }
```

- **One `UnavailableReason`** for the whole app, in `app/actions/reading.ts`.
  Today's local vocabularies become subsets of it: `PlannedMetric`'s
  `simple-activity` and `not-resolved`; `UNAVAILABLE_READINGS`
  (`hours-calendar-cost`, `combined-cross-track-load`, `strength-ctl`); the
  volume-conversion reasons (`sets-has-no-reading`,
  `not-an-endurance-discipline`, `no-zone-recipe`, `no-intensity-source`,
  `no-heart-rate-anchor`, `no-threshold-pace`, …); `no-season-anchor`; and three
  that are prose or flags today: `no-recording`, `building-baseline` (the 42-day
  TSB gate) and `insufficient-data`. **`source-terms`** is ADR 0098's.
  `PlannedMetric<T>` becomes `Reading<T>` narrowed to its two reasons. One
  `labels.ts` map words every reason, with a completeness test.
- **No bare number crosses to a model.** Every number field in an output schema
  that a model caller can receive is a `Reading`, and a test walks the schemas
  to prove it. `0`, `null` and an omitted field never mean "unknown". An entity
  that does not exist (no active plan) is `null`, which is not a number.
- `Reading` is one number. A **Workout Reading** is a whole account of a
  session; its numbers are Readings.

### 7. The provenance gate is one helper, and every model-facing number goes through it

An action builds each number with `reading(value | reason, bindingSet, ctx)`.
For a model caller (`mcp`, `agent`) the helper asks
`sourceTerms(bindingSet, 'model')` (`app/utils/source-terms.ts`, ADR 0098):

- closed: the value is never sent; the Reading is `unavailable`, reason
  `source-terms`, naming the platforms;
- open with attributions: the value is sent, and the result's `credits`
  (`{ platform, text }[]`) gains each platform's credit, in the platform's own
  wording (Garmin's derived-data line stays in English, ADR 0098 §3).

For `web` the same helper asks `screen`. The binding set is ADR 0098 §1's: an
import's Origin Platform plus its aliases'; for a derived value, every import
the computation read (for CTL/ATL/TSB, the load model's whole input window);
empty for plan-side and athlete-entered values. No action decides terms on its
own.

**Free text is never trainm8's voice.** Text the athlete wrote (Session Log, own
workout titles, event names) crosses as `AthleteText`
(`{ by: 'athlete', text }`), one field, length-capped, never concatenated into a
sentence of trainm8's. Provider text (`ActivityImport.rawJson`, activity names,
upload file names) and other athletes' Shared Workout descriptions never cross.
An assistant's proposal reason is `{ by: 'assistant', text }` (0093 §4)
([MCP §6.7](../research/mcp-server-for-trainm8.md#67-prompt-injection-whose-text-reaches-the-model);
Bredvid/tavla `docs/adr/0001-agent-native-kjerne.md` S19–S20).

### 8. The MCP server is a reader, not a second app

`app/mcp/` holds a factory on the MCP TypeScript SDK v2's `createMcpHandler`,
mounted at `/mcp`, that loops over the registry and registers each action with
its `title`, `description`, `input`, the envelope as `outputSchema` and the
derived annotations. It holds no per-action code, and so no business logic. It
also holds the bearer check and (ADR 0094) the OAuth glue.

Before OAuth exists (Phase 0) the bearer is a static per-user development token.
It is read only when `NODE_ENV` is `development` or `test`, and the server
refuses to start in production with one configured. There is no unauthenticated
catalog: `tools/list` needs a valid bearer like every other call.

_No separate MCP-server ADR exists, by decision of the strategy
([MCP §8.4](../research/mcp-server-for-trainm8.md#84-what-an-adr-would-decide)):
the server is this registry's reader, and its authorization and transport are
0094's._

### 9. Routes are readers too, and parity is tested

A route keeps the HTTP concerns (Conform, the toast, the redirect, the 400, 404
and 409 mapping) and calls `runAction` with `caller: 'web'` for every intent the
registry covers. No route keeps a second path to the same write. The registry
grows slice by slice, starting with Ukeskiftet
(`app/routes/resources/week-change.tsx`).

**The parity test** (`app/actions/parity.test.ts`):

1. **Intents.** For each route on the registry, every value of its intent
   discriminator (for Ukeskiftet, `WeekChangeActionSchema`'s `answer`,
   `accept-round`, `ease`) maps to exactly one action, and every action listed
   for that route has an intent. The map is a constant in the route module.
2. **Callers.** For every action × caller it allows, plus one caller it does
   not: run its fixture through the reader's adapter and through `runAction`
   directly. The `outcome` and refusal `code` must be equal, and equal to an
   oracle table written by hand from `kind` and `callers` that does not call the
   runner's own code. A `web`-only action through `mcp` gives
   `needs-athlete-yes`.
3. **Fixtures.** Every action has one. A new action costs one fixture.
4. **Schemas.** No input has a user, athlete or owner id; every number in a
   model-facing output schema is a `Reading`; every name matches
   `^[a-z0-9_]{1,64}$`.
5. **Catalog.** A snapshot of `tools/list` per scope profile, checked in. A
   later compatibility test against `origin/main` fails on a removed tool, a new
   required input field or a narrowed type unless `revision` was bumped.

_The test shape is Bredvid/tavla `docs/research/anc-paritet-vakter.md` F3–F4,
cut to trainm8's two readers and no `system` caller; the intent half is
[AN §7.2](../research/agent-native.md#72-phased-plan)'s._

### 10. Language

Names, enum values, codes and the model-facing `description` are English. Every
word the athlete reads — `title`, a refusal's `message`, a Reading's `label` —
comes from `labels.ts` in Norwegian (ADR 0081 §2). An assistant's prose is never
`labels.ts`-owned and is always marked as the assistant's.

### 11. Model-facing calls are audited, in the same transaction

From Phase 2, before any athlete but the owner connects an assistant, every call
from a model caller writes one audit row: user, caller, OAuth client, action,
revision, outcome, a digest of the input, and the ids of any proposal or undo
handle it created. A write's row is written in the write's transaction, so there
is no write without its row and no row without its write. Athlete-entered free
text is not copied into the row.
([MCP §6.9](../research/mcp-server-for-trainm8.md#69-audit-log); Bredvid/tavla
`docs/adr/0001-agent-native-kjerne.md` D4, D12.)

## The first slice: six reads and Ukeskiftet (#553)

Every number below is a `Reading`. `link` is a deep link into trainm8. Durations
are seconds, distances metres. `owner` is **Session Ownership**.

```ts
type SessionSummary = {
	id: string
	date: string // YYYY-MM-DD, Athlete Timezone
	discipline: Discipline
	title: AthleteText | string // athlete's text when theirs, else labels.ts
	status: 'planned' | 'done' | 'missed' | 'recording-only'
	owner: 'athlete' | 'machine'
	planned: {
		durationS: Reading<number>
		distanceM: Reading<number>
		tss: Reading<number>
	}
	actual: {
		durationS: Reading<number>
		distanceM: Reading<number>
		tss: Reading<number>
	}
	link: string
}
```

| Action                | Input                              | Output                                                                                                                                                                                                                    |
| --------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_today`           | none                               | `{ date, sessions: SessionSummary[], load: { ctl, atl, tsb: Reading<number> }, week: { tracks: { discipline, planned, actual, target: Reading<number> }[] }, openProposals: number }`                                     |
| `list_sessions`       | `{ from, to, cursor? }`, ≤ 28 days | `{ sessions: SessionSummary[], nextCursor: string \| null }`                                                                                                                                                              |
| `get_session`         | `{ sessionId }`                    | `SessionSummary & { workout: { title, blocks } \| null, recording: { originPlatform, device: string \| null } \| null, rpe: Reading<number>, log: AthleteText \| null }`                                                  |
| `get_session_vs_plan` | `{ sessionId }`                    | `{ tss, durationS, distanceM: { planned, actual: Reading<number> }, band: Reading<AdherenceBand>, structure: Reading<StructureAdherence>, vsLast: { sessionId, date, deltas: Record<string, Reading<number>> } \| null }` |
| `get_training_load`   | `{ weeks: 1–26 }`                  | `{ days: { date, tss, ctl, atl, tsb: Reading<number> }[], weeks: { weekKey, plannedTss, actualTss: Reading<number>, adherence: Reading<AdherenceBand> }[], tsbTrust: { trustworthy, daysOfHistory, requiredDays } }`      |
| `get_season`          | none                               | `{ plan: { name, openEnded, event: { name, date } \| null } \| null, weeks: { weekKey, phase, tracks: { discipline, target, planned, actual: Reading<number> }[] }[] }`                                                   |

`get_week_change` (read) wraps `readWeekChange` and the card model, which moves
out of `app/routes/_home/timeline/week-change.ts` into `app/utils/load/`. The
answering intents (`answer_proposal`, `accept_round`, `ease_week`) are `write`,
`callers: ['web']`. Three lifts out of route modules are part of the slice:
`buildWeekChangeCard`, `buildSessionNudge` (`app/routes/_home/presenter.ts`) and
the session-vs-plan computations in `training/sessions.$sessionId.tsx`.

## Considered options

- **Adopt agent-native's `defineAction`, or fork it.** Rejected by the strategy
  ([`agent-strategy.md`](../research/agent-strategy.md#why-not-agent-native-and-why-not-a-fork)).
  Three MIT leaves may be copied with their notice
  ([OS §7.1](../research/agent-native-open-stack.md#71-f3-what-each-module-drags-in)).
- **An MCP layer that calls the services directly, with no registry.** Rejected:
  routes and MCP would hold two copies of each operation's checks, and the
  in-app agent a third.
- **Static risk on writes, and "propose" as an outcome (tavla).** Rejected for
  trainm8; see §2.
- **Filter the catalog by the token's scopes.** Rejected; see §4.
- **A `basis` and `confidence` on every available Reading**
  ([MCP §6.5](../research/mcp-server-for-trainm8.md#65-the-building-principle-as-an-output-schema)).
  Deferred: no reader needs them yet, and adding an optional field is additive.
- **Attribution on each value rather than on the result.** Rejected: ADR 0098
  requires the credit on every result carrying the value, and the union over a
  result is that; per-value credits would repeat one sentence a hundred times.
- **Route background jobs (the Week Change, the autopilot) through `runAction`
  as a `system` caller, as tavla does** (`docs/adr/0001-agent-native-kjerne.md`
  D19). Not now: they are the rules author, already once-only and claimed, and
  no model reaches them. Revisit when a job runs a model (ADR 0095).

## Consequences

- A new operation costs one `defineAction` and one fixture, and appears on every
  reader its `callers` allow, with no adapter code.
- The four "unavailable" vocabularies converge on one enum as each slice touches
  them; `nbUnavailableReason`'s free-text reasons get tokens.
- `PlannedMetric<T>` is the first `Reading<T>`; the screens keep working because
  the shape is the same.
- Annotations, scopes and the catalog follow from the registry, so a review of a
  new action is a review of its `kind`, `callers` and `additive` flag.
- Phase 0 has no model in trainm8's request path; the model belongs to the
  athlete's assistant (ADR 0053's "no key and no model latency" holds).
- `app/mcp/` exists before OAuth does; the dev token is the only way in until
  ADR 0094 lands.

## Owner's decisions

Confirmed by the owner on 2026-10-24, as recommended. Each answer is in place
above.

1. **A model sees `rpe` and the Session Log as athlete text** (§7,
   `get_session`). They are health data under Art. 9 and need the consent the
   DPIA (#549) decides. Recommended: in the Phase 0 reads on the owner's own dev
   token; behind the per-purpose consent before any other athlete connects.
2. **Model-facing calls are audited; the athlete's own web calls are not**
   (§11). Recommended: yes for v1. Auditing web writes too would answer "was
   that me or Claude?" for every write, at the cost of a row per tap.

## Deferred hardening

Shortcuts taken on purpose. Each is safe while the owner is the only athlete
with an assistant and must close, or be re-accepted by the owner with a date and
a reason here, before anyone else connects one. Tracked in #639.

- **No audit of the athlete's own web calls** (decision 2). Together with ADR
  0093's missing presence check, a write made by a browser agent holding the
  athlete's cookie cannot be told from the athlete's own. Closes when web writes
  are audited too, or a web yes is proven to be the athlete's (#639 H2).
- **`rpe` and the Session Log reach a model without consent** (decision 1). Art.
  9 health data, acceptable only on the owner's own dev token. Closes when
  #549's per-purpose consent gates them and an unconsented token gets
  `unavailable` with a reason (#639 H5).
- **A static dev bearer token is the only way into `/mcp` in Phase 0.** No
  expiry, rotation or scope. Closes when Phase 2's OAuth replaces it; until then
  a test proves production refuses it (#639 H6).
- **The rate limiter keys on IP.** Every Anthropic call shares one `/21`. Closes
  with Phase 2's limit per token subject (#639 H7).

## As built in #553

Where the first slice departs from the text above, and why:

- **SDK.** `@modelcontextprotocol/server` 2.3.1, pinned exactly (2.4.0 was a day
  old); `createMcpHandler` with `legacy: 'stateless'` and
  `responseMode: 'json'`, tested on both eras with
  `@modelcontextprotocol/client` 2.3.1. The factory registers every action
  through `McpServer.registerTool` with pass-through Standard Schemas (JSON
  Schema from `zod/v4`, identity validation) so `runAction` validates once and
  an invalid input is a `refused`/`invalid-input` envelope. `web`-only actions
  are registered too, so a model calling one hears `needs-athlete-yes` (§9.2);
  `tools/list` is answered from the registry filtered by caller, so they never
  appear in it. The envelope's JSON Schema root carries `type: object` beside
  its `oneOf`.
- **`ActionCtx` gains `origin` and `scopes`.** Deep links must be absolute for a
  model; scopes come from the credential (absent for `web`).
- **`refused` gains an optional `link`**, which ADR 0093 §3 already requires on
  `needs-athlete-yes`. Ukeskiftet's service reasons are refusal codes one to
  one, so the route's replies are unchanged.
- **New Unavailable reasons:** `outside-plan`, `no-plan`, `not-logged`,
  `structure-not-verifiable`.
- **Counts are Readings too** (`openProposals`, `daysOfHistory`,
  `requiredDays`), so the "every number is a Reading" walk has no exceptions.
  Week tracks carry their `currency`; `vsLast.deltas` has the keys `tss` and
  `durationS`.
- **Lifts.** Only `resolveStructureAdherence` moved out of a route
  (`app/utils/session-structure-adherence.ts`). `get_week_change` projects
  `readWeekChange` (already in `app/utils/load/`); `buildWeekChangeCard` and
  `buildSessionNudge` are Norwegian screen models no action reads, so they stay.
- **`/mcp` is 404 in production** until OAuth, and accepts only localhost-class
  Host and Origin. The catalog snapshot is one file, since the list does not
  vary by scope; the compatibility test against `origin/main` is still later.
- **Over-closing by week.** A week's actual volume binds to every Recording in
  that week, so a Strava ride in Annet closes that week's run track for a model.
