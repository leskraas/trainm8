# An assistant proposes and never gives the athlete's yes, and every write it makes can be undone

Status: Accepted · owner confirmed 2026-10-24 · Ticket #550 (map #541) · Backed
by
[`mcp-server-for-trainm8.md` §5.2, §6.2–6.4, §6.6, §6.7](../research/mcp-server-for-trainm8.md#62-adr-0080-the-model-is-a-proposal-author-never-the-yes),
[`agent-native.md` §5.4(c), §7.2, §8](../research/agent-native.md#72-phased-plan),
[`agent-layer-trainm8-surface.md` §4 and its ADR table](../research/agent-layer-trainm8-surface.md#adrs-this-research-challenges)
and
[`agent-layer-building-blocks.md`'s ADR table](../research/agent-layer-building-blocks.md#adrs-this-research-challenges).
The owner asked the agent to answer #550's grilling from the research
(2026-10-24) and confirmed every recommendation the same day; see
[Owner's decisions](#owners-decisions). The shortcuts among them are tracked
under [Deferred hardening](#deferred-hardening) and #639, among them the owner's
two questions on #550.

Where this ADR borrows from the sibling project Bredvid/tavla, which worked
through the same proposal and undo questions later than trainm8's research, it
cites "Bredvid/tavla `<path>`". Where tavla chose differently, the choice and
its reason are stated in place.

**Amends
[ADR 0080](./0080-week-replan-proposes-and-the-athletes-sessions-need-a-yes.md)
§3 and §6**: a proposal records its author, and for an assistant's proposal the
apply rules change, not only the author. **Answers the question
[ADR 0100](./0100-the-autopilot-lays-out-each-week-and-every-write-it-makes-says-what-it-did-and-can-be-undone.md)
left open**: the autopilot never applies an assistant's proposal. **Amends
[ADR 0053](./0053-season-generation-is-deterministic-behind-the-seam.md) §1**: a
model may arrive as a _caller_ of the `SeasonGenerator` seam, not only as a
second implementation. **Amends
[ADR 0088](./0088-every-write-on-i-dag-is-undone-from-its-toast-and-from-its-landed-row.md)**:
a write a model caller makes returns an opaque, server-held **Undo Handle**, and
its window is stated. **Confirms
[ADR 0076](./0076-an-undone-stamp-leaves-nothing-behind.md) §2–3**: `undo` is a
real, owner-scoped delete or restore, and idempotent. Builds on
[ADR 0092](./0092-every-athlete-operation-is-one-typed-action-and-the-routes-the-mcp-server-and-an-agent-are-its-readers.md)'s
kinds, callers and result union.

## Context

ADR 0080 §6 said "AI later writes the same proposals on the same surface … Only
the author of step 1 changes". The store is nearly ready for that: it accepts a
proposal with no closed week (`recordProposals(…, weekReplanId = null)`), and
`ProposalAuthor` is injectable. Three things are missing
([MCP §6.2](../research/mcp-server-for-trainm8.md#62-adr-0080-the-model-is-a-proposal-author-never-the-yes),
[SF §4](../research/agent-layer-trainm8-surface.md#4-safety-primitives-an-agent-layer-must-reuse)):

- **Nothing records who wrote a proposal.** A rule's proposal and a model's are
  the same row after the fact.
- **Silence and the autopilot do not ask.** `applyDueProposals`, called without
  `weekReplanIds`, takes every pending proposal; and since ADR 0100, the
  autopilot "applies every proposal written at the close, whoever wrote it". ADR
  0100 left the author gate to this ADR.
- **The yes has a new impostor.** A host's tool-approval click looks like a yes,
  but it approves a call, not a change to a session; "Always allow" exists; and
  hosts treat annotations as untrusted. COROS, AI Endurance and Tredict already
  write plans over MCP with no preview and no yes
  ([AI §1.3](../research/ai-product-privacy-cost.md#13-what-the-pattern-says-inference)).
  That is the gap trainm8 owns.

Undo has the same shape of problem. ADR 0088's undo is a toast and a landed row
for ten seconds, and its tokens carry the prior state back from the browser. A
conversation has no toast, and a token that passes through a model is input the
model can alter
([MCP §6.4](../research/mcp-server-for-trainm8.md#64-adr-0088-every-direct-write-returns-an-undo-handle)).

## Decision

### 1. A model is a proposal author, a caller of read seams, and a writer only of the athlete's own acts

Through the registry (ADR 0092), a model caller (`mcp`, `agent`) may:

- **read**, through the provenance gate;
- **propose** changes to the plan, which land as pending **Week Replan
  Proposals** (`propose_week_change`);
- **write the athlete's own acts**, on the athlete's say-so in the conversation:
  write a session on a day (`write_session`), mark one _Gjort_
  (`mark_session_done`), log sets (`log_strength_session`), and `undo`.

It never changes the prescription or placement of an existing session directly;
that is always a proposal. It never answers a proposal, eases a week, releases a
session or approves a season.

### 2. A proposal records its author

`WeekReplanProposal` gains `author`: `rules` | `athlete` | `assistant`, and for
`assistant` the OAuth client that wrote it (`authorClientId`). A migration sets
`rules` on every row with a `weekReplanId` and `athlete` on the rest (today
those are _Gjør uka lettere_'s accepted scales). The **Proposal Author** is
stored, never inferred from `weekReplanId`.

`ProposalAuthor` (`app/utils/load/propose-week-change.ts`) stays the rules
author's seam for the Week Change. An assistant does not plug into it: it
reaches the store through `propose_week_change`, whose input is
`ProposalPayloadSchema` plus a reason, parsed again on the server with the
domain schema whatever the model's tool schema said.

### 3. Only the athlete's explicit yes applies an assistant's proposal

- **Silence never applies it**, in either mode. **The autopilot never applies
  it.** Both filter on `author = 'rules'` in the query, so this is a rule of the
  data, not of a call site, and `applyDueProposals` without `weekReplanIds` can
  no longer reach one.
- It needs a yes **whatever its load direction and whoever's session it
  targets**. The autopilot's guards stand in for a yes only for the rules' own,
  tested proposals; an assistant's is text from outside, which a prompt
  injection may have written.
- **The yes is the athlete's tap in trainm8, on their own session (the cookie
  session, no bearer).** The answering actions are `callers: ['web']` (ADR 0092
  §3). A model caller that reaches one gets `refused`, code
  **`needs-athlete-yes`**, `next: 'ask-athlete'`, with the deep link to where
  the athlete answers.
- **A host's tool-approval click is not the yes.** Neither is an elicitation
  answer, nor a button inside an MCP App: all of them reach trainm8 with the
  assistant's token, and a host can be set to answer them by itself. No
  answering tool exists on MCP, app-only or otherwise.
- **The yes is bound to what was shown.** The card posts the proposal id and a
  digest of the payload it rendered; the server applies the stored payload only
  if the digest matches, the proposal is still pending, and its target session
  has not changed since the proposal was written. Otherwise it refuses (`stale`
  or `already-answered`) and writes nothing. A yes is consumed once, and there
  is no standing "always yes".

_The MCP note let an app-only `answer_proposal` button in an MCP App widget be
the yes
([§5.2](../research/mcp-server-for-trainm8.md#52-can-trainm8-render-a-week-plan-preview-with-accept-and-reject-yes-with-care)).
Tavla rejected the same widget: the tap would arrive with the agent's token, and
a client can answer by itself (Bredvid/tavla
`docs/adr/0001-agent-native-kjerne.md` "Forkastede alternativer", first row;
`docs/research/anc-forslag.md` F7). Tavla's reasoning is taken: a widget may at
most show the proposal and link into trainm8. The binding to the shown payload
is tavla's D10, on ADR 0084's digest pattern._

### 4. An assistant's proposal is a question, labelled as the assistant's

- It shows on I dag as a question in both modes — under autopilot too, where the
  rules' own proposals are statements — with _Ok_ / _Nei takk_, the assistant's
  name from the client registry, and the deep link the result carried.
- Its `reason` is the assistant's prose: plain text, at most 280 characters,
  stored with its author and rendered as written by the assistant, never in the
  app's voice. What the proposal **does** (the headline, the numbers, _din økt_,
  the load direction) is rendered from the payload by `labels.ts`, as for every
  proposal (ADR 0080 as built).
- An `add` names a Stock Workout or one of the athlete's own workouts, never a
  Shared Workout (ADR 0053 §4's non-vouch), and never a workout the model
  describes. Load direction is read off the payload, as today.
- At most one pending assistant proposal per target session: a newer one
  supersedes the older, which reads _Erstattet_. A proposal whose target has
  passed reads _For sent_, as today.
- Rate: at most 10 pending assistant proposals per athlete per day, counted from
  the store; the eleventh is `not-run`, `rate-limited`.

_Superseding and the daily cap are tavla's P6 and P15
(`docs/adr/0001-agent-native-kjerne.md`)._

### 5. A write on the athlete's say-so is the athlete's

A session an assistant writes for the athlete is **the athlete's**: Session
Source `authored`, so the autopilot and silence never touch it. A _Gjort_ or a
set log by an assistant is the athlete's act, as if tapped. Who made the call is
recorded beside the data, not in it: the model-facing audit row (ADR 0092 §11)
names the caller and the client. Session Source keeps meaning where a session
came from.

_GOAL.md's non-goal ("no coach- or team-managed workflows") is why: a token is
always one athlete acting for themselves, so the assistant is the athlete's tool
([MCP ADR table](../research/mcp-server-for-trainm8.md#adrs-this-research-challenges)).
If such a write were the machine's, the autopilot could rewrite a session the
athlete asked for minutes earlier. Tavla records the agent as
`(person, client.id)` for the same reason
(`docs/adr/0001-agent-native-kjerne.md` D13)._

### 6. Every write a model caller makes returns an Undo Handle

- **Opaque and server-held.** `UndoHandle` is a row: a random id, `userId`, the
  client that made the write, `action`, the payload today's undo functions need
  (the stamp id, the `markedAt` stamp, the `setLogIds`), `createdAt`,
  `expiresAt` and `usedAt`. The result carries only
  `undo: { handle, expiresAt }`. The handle is looked up by
  `(ctx.userId, handle)`, never by possession: another athlete's handle is
  `not-found`.
- **`undo` is one action** (`write`, `destructiveHint: true`,
  `idempotentHint: true`) that dispatches to the existing functions:
  `undoDayStamp`, `undoMarkSessionDone`, `undoQuickLog`. Their refusals carry
  over unchanged: `not-undoable` once something has landed on top, and no handle
  at all when the load recompute rewrote another session
  (`recomputeRewroteSince`). A used handle answers `not-undoable`, idempotently.
- **The window is 24 hours from the write**, or less when the domain refuses
  first. The `undo` tool's description states it, and so does each write's
  result (`expiresAt`).
- **The athlete can undo from either surface.** The handle's write is listed on
  the connected-assistants page with _Angre_ while it is open (Phase 2). Any
  client of the same athlete may call `undo` with it.
- **One undo per write.** `undo` returns no new handle; there is no redo (ADR
  0088's rejected multi-step undo).
- **The result says what changed**, as ADR 0088's toast does: the week's sum
  before → after against the Week Target (`withWeekSumToast`), as Readings, and
  a deep link to the day.
- **The web keeps its tokens.** ADR 0088's compare-and-set tokens and ten-second
  toast stay for `caller: 'web'`. Handles are for results that pass through a
  model.

_Tavla's window is the same 24 hours for every actor, and its undo returns a
redo handle (`docs/research/anc-undo-audit.md` A1). trainm8 keeps the web's ten
seconds, because a toast is a different promise from a conversation, and keeps
one undo per write, because ADR 0088 already rejected a history._

### 7. A model is a caller of `SeasonGenerator`, through a read

ADR 0053 §1 expected a model to arrive as a second implementation behind the
seam. It may first arrive as a **caller**: `preview_season` is a `read` that
takes the First Run's answers and runs the deterministic generator, writing
nothing (§8). Approval stays in trainm8, `callers: ['web']`, and still
regenerates from the answers (§2), so purity and "nothing unapproved" hold. A
model implementation behind the seam is ADR 0095's, and when one arrives, §2's
approval must bind to the stored preview rather than regenerate
([SF ADR table](../research/agent-layer-trainm8-surface.md#adrs-this-research-challenges)).

## Considered options

- **The host's tool approval, or an elicitation, as the yes.** Rejected; see §3.
  Elicitation is undocumented in Claude and ChatGPT and, under MRTR, needs its
  own integrity protection
  ([MCP §6.6](../research/mcp-server-for-trainm8.md#66-elicitation-not-the-confirmation-mechanism-for-now)).
  URL-mode elicitation may later **navigate** the athlete to trainm8, where the
  yes still happens.
- **An app-only answer button in an MCP App.** Rejected; see §3.
- **Let silence or the autopilot apply an assistant's proposal that reduces load
  on the machine's sessions.** Rejected: it would make "the assistant changed my
  week overnight" possible, and a reducing proposal is still a change the
  athlete did not see.
- **An assistant's write is the machine's** (Session Source `generated`).
  Rejected; see §5.
- **A new Session Source value, `assistant`.** Rejected: Session Source is where
  a session came from, and every ownership reader would have to learn a fifth
  value. The caller is recorded in the audit row.
- **Pass ADR 0088's tokens through to the model.** Rejected: they carry prior
  state a model could alter, and MCP says a handle is "a name, not a
  capability".
- **No window, only the domain's refusals.** Rejected: an open handle keeps the
  undo payload alive indefinitely, and "you can still undo this" a week later is
  not a promise a conversation should make.
- **A presence check (a passkey per yes), as tavla requires for high risk.** Not
  now; see Owner's decisions.

## Consequences

- `WeekReplanProposal` gains `author` and `authorClientId`, with a migration.
  `applyDueProposals` and `applyAtClose` filter on `author = 'rules'`, and a
  test proves an assistant's proposal survives both untouched.
- An Ok gains a digest and a stale check, for every author.
- I dag gains a place for an assistant's questions under autopilot; its design
  is the Phase 3 ticket's, held to the design system.
- `UndoHandle` is a new table, written in the write's transaction; a nightly
  sweep clears expired payloads.
- `propose_week_change`, the three writes and `undo` ship in Phase 3, after
  OAuth (ADR 0094). Phase 0 has none of them.
- ADR 0080 §6's "only the author changes" no longer holds for an assistant: the
  author changes, and so do the apply rules.

## Owner's decisions

Confirmed by the owner on 2026-10-24, as recommended. Each answer is in place
above.

1. **Is an agent's write on the athlete's say-so the athlete's or the
   machine's?** (#550; §5.) Recommended: the athlete's. The session is
   `authored`, the caller is in the audit row, and the Undo Handle is the way
   back. The cost: an injected assistant could write sessions the autopilot then
   steps around, until the athlete undoes them.
2. **How long does undo last in a conversation?** (#550; §6.) Recommended: 24
   hours from the write, or less when the domain refuses first.
3. **An assistant's proposal always needs a yes, even under autopilot** (§3).
   Recommended: yes. The autopilot was chosen so the athlete need not review the
   rules' week; an assistant's proposal is a question the athlete started in
   chat.
4. **No presence check on the yes** (§3). Tavla requires a passkey per high-risk
   approval, because a browser agent with the cookie can click
   (`docs/adr/0001-agent-native-kjerne.md` D9). Recommended: not in v1. A yes
   here changes one athlete's own plan and keeps a before-image, so it can be
   undone; revisit if trainm8 ever exposes a yes with a larger blast radius.
5. **One switch that stops every model write and proposal** while reads go on,
   for the owner when something runs away (tavla D22). Recommended: yes, as an
   environment flag that makes them `not-run`, `switched-off`.
6. **The caps**: 280 characters for an assistant's reason, 10 pending assistant
   proposals a day, one pending per target session.

## Deferred hardening

Shortcuts taken on purpose. Each is safe while the owner is the only athlete
with an assistant and must close, or be re-accepted by the owner with a date and
a reason here, before anyone else connects one. Tracked in #639.

- **No presence check on the yes** (decision 4). Anything driving the athlete's
  browser with their cookie can tap yes. Closes with step-up or a user-presence
  check on a yes to an assistant's proposal (#639 H1). Decide again at once if a
  yes ever reaches beyond the athlete's own plan.
- **A model's write on the athlete's say-so is the athlete's** (decision 1). An
  injected assistant can write `authored` sessions the ownership gate then
  protects. Closes when such sessions name their client in the UI and one action
  undoes or revokes everything a client wrote (#639 H3).
- **The kill switch is an environment flag** (decision 5). It needs a secret
  change and a restart, and it is all or nothing. Closes with a switch stored in
  the database plus revocation per client and per athlete (#639 H4).
