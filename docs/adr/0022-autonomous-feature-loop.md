# Autonomous Feature Loop: a heartbeat-driven, single-gate feature factory

trainm8 already runs **Ralph** (`ralph/once.sh`) — a single-task autonomous loop
that reads open issues, picks one, implements it red-green, commits, and closes
it. This ADR records a larger ambition: a **Feature Loop** that owns the _whole_
feature lifecycle — discover a feature, design it, slice it, build it, review
it, and merge it — running perpetually with exactly **one** human touchpoint.

The pieces already exist as separate, human-facing skills: `/grill-with-docs`
(interview + ADRs/glossary), `/to-prd`, `/to-issues`, `/implement`, `/review`,
and Orca's `/orchestration` (multi-agent coordination). The problem is that
those skills expect a human to answer, and Orca **automations are time-scheduled
and fire-and-forget** (`hourly`/`daily`/cron, local-first) — they cannot pause
mid-run to wait for a human, nor wake on a GitHub event. This ADR records how we
assemble those pieces into one self-driving loop.

## Decision

1. **One human gate; everything else is autonomous.** The athlete-operator's
   only blocking action is **picking one of three generated Feature Candidates**
   (adding `approved` to one of three GitHub issues; the loop closes the other
   two). After the pick the loop designs, slices, builds, reviews, and
   **auto-merges to `main`** with no further human stop. On merge it loops back
   to generate the next slate of candidates — a perpetual feature factory.

2. **A single state-machine Driver skill, not inline automation config.** The
   loop's behaviour lives in a version-controlled, project-local skill
   (`/feature-loop`), so it is reviewable and editable as a diff. The Orca
   automation prompt is thin: `Run /feature-loop`. The Driver reuses the
   existing stage skills **unchanged** and carries a **headless override** — a
   preamble stating that wherever a sub-skill would consult the human, it
   instead consults a grounded `/orchestration` answerer (see 5).

3. **Heartbeat polling, not events; state derived, not stored.** A scheduled
   automation fires the Driver on a cron heartbeat. Each tick **re-derives** the
   current state from observable facts (GitHub issues/labels/PRs + what Orca
   reports running) via a deterministic **priority ladder** (first match wins,
   so exactly one state is ever selected), does **at most one transition**, and
   exits — dispatching long stages (DESIGN, BUILD) to detached Orca workers
   rather than holding the tick open. Because state lives in GitHub and not in a
   process, a crashed or half-finished tick is simply resumed by the next one,
   and a sleeping laptop costs latency, never correctness. Events
   (webhooks/Actions) were rejected for now: they require an always-on,
   network-reachable `orca serve`, they are lossy (a missed `labeled` delivery
   wedges the loop silently), and they do not remove the need to derive state
   anyway. Events remain available later as an optional latency _nudge_ on top
   of the polling backbone, once always-on infra exists.

4. **One active feature; park, don't freeze.** Serialization applies to _active_
   work: at most one feature progresses through DESIGN/SLICE/BUILD/SHIP at a
   time, and the loop will not generate a new slate while one still awaits a
   pick (so the _approval_ queue is always at most one slate of three; on the
   pick, the unpicked candidates are closed). A feature that escalates or
   exhausts its retries is **parked** (`ready-for-human`) — set aside onto the
   operator's queue and removed from the active slot — so the loop is free to
   advance. A single stuck feature never halts the factory; the _parked_ queue
   may grow to N.

5. **`GOAL.md` is the anchor; the agent grounds, records, and escalates only on
   the irreversible.** A new structured `GOAL.md` (vision + ordered Pillars +
   Non-goals + North-star) is the primary source the loop reasons from;
   ADRs/`CONTEXT.md`/code are corroborating. "Done so far" is _derived_ from
   closed issues + commits + ADRs, never hand-maintained. At every checkpoint a
   single grounded **headless answerer** stands in for the human. When a
   question cannot be grounded, it records an explicit **assumption** with a
   goal-aligned default and proceeds — _except_ when the unresolved choice is
   irreversible (schema/data migration, destructive op, public/external
   contract), in which case it parks and asks. The grill's output is a **design
   record** (decisions, assumptions, open questions) feeding `/to-prd`.

6. **The merge bar is the only safety net, so it is explicit.** Auto-merge fires
   only when: full test suite green, typecheck clean, lint/build green, and
   `/review`'s **Spec axis** finds no missing/wrong requirement. `/review`'s
   **Standards axis** is advisory (style nits never wedge the line). On a red
   bar the loop retries via `/implement` up to **3 times** (matching Ralph's
   circuit breaker); still red → park as `ready-for-human` with the findings,
   notify, advance.

7. **Parallel build, single PR.** BUILD reads the slice dependency DAG from
   `/to-issues` and dispatches currently-unblocked issues as
   **concurrency-capped parallel waves**, each in its own worktree branched off
   one long-lived `feature/<slug>` **integration branch**. The coordinator
   merges each finished slice back (resolving sibling conflicts) and releases
   the next wave. When all slices are closed, SHIP opens **one PR**
   `feature/<slug>` → `main` and runs `/review` against the whole-feature diff.

## Consequences

- **Latency, not urgency.** A feature crosses ~5 transitions; at an hourly
  heartbeat that is several hours wall-clock. Acceptable for a background
  factory; tighten the cron if desired.
- **Bad assumptions can ship.** With auto-merge and no human diff review, an
  ungrounded-but-not-irreversible assumption can reach `main`; `/review`'s Spec
  axis cannot catch it because the PRD encoded the assumption. The cost is a
  revert next cycle — the deliberate price of full autonomy below the
  irreversible threshold.
- **Requires the machine awake.** Polling on a laptop runs only while Orca runs;
  this is by design until/unless an always-on `orca serve` is stood up.
- **Loop vocabulary stays out of `CONTEXT.md`.** Feature Loop, Driver,
  Heartbeat, Feature Candidate, Design Record, etc. are automation/tooling
  terms; they live here and in the `/feature-loop` skill, not in the
  training-domain glossary.
