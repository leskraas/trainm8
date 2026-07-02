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
   two). To make that pick cheap, GENERATE also **ranks the slate and recommends
   one** (`recommended` label + reasoning comment) — a recommendation, not a
   decision. After the pick the loop designs, slices, builds, reviews, and
   **auto-merges to `main`** with no further human stop. On merge it loops back
   to generate the next slate of candidates — a perpetual feature factory.

2. **A single, runtime-agnostic Driver skill, not inline automation config.**
   The loop's behaviour lives in a version-controlled, project-local skill
   (`/feature-loop`), so it is reviewable and editable as a diff. The trigger
   prompt is thin: `Run /feature-loop`. The Driver reuses the existing stage
   skills **unchanged** and carries a **headless override** — wherever a
   sub-skill would consult the human, it instead answers itself, grounded (see
   5). It is **runtime-agnostic**: two primitives (isolated worker + run-lock)
   are abstracted so the same skill runs under **Orca** (worktree workers +
   `/orchestration`) or in **local mode** with plain **Claude Code sub-agents +
   `git worktree`** — no Orca required. Detection is automatic.

3. **Heartbeat polling, not events; state derived, not stored.** A heartbeat
   fires the Driver — trigger-agnostic: an Orca automation, `cron`+`claude`, a
   Claude routine, or a human. Each invocation **re-derives** the current state
   from observable facts (GitHub issues/labels/PRs + a run-lock) via a
   deterministic **priority ladder** (first match wins, so exactly one state is
   ever selected) and runs **one stage to completion**, then exits; the run-lock
   makes overlapping fires safe. Because state lives in GitHub and not in a
   process, a crashed or half-finished run is simply re-derived and resumed by
   the next one (e.g. BUILD with 2 of 5 issues closed re-runs for the remaining
   3), and a sleeping machine costs latency, never correctness. Events
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

8. **Feature correlation is a milestone, not a per-feature label.** A feature's
   artifacts (feature issue, PRD, impl issues) are grouped by a GitHub
   **milestone** named `<slug>`, created when a candidate is picked (DESIGN) and
   **closed at merge**; the PR correlates via its `feature/<slug>` branch, and
   candidates carry no per-feature key (the slug lives in the issue body). A
   per-slug _label_ was rejected: labels have no "done" state, so they
   accumulate forever and clutter every issue's label picker. Milestones close
   and drop out of the active view, keeping the label namespace fixed at the ~7
   state labels.

## Consequences

- **Latency, not urgency.** A feature crosses ~5 transitions; at an hourly
  heartbeat that is several hours wall-clock. Acceptable for a background
  factory; tighten the cron if desired.
- **Bad assumptions can ship.** With auto-merge and no human diff review, an
  ungrounded-but-not-irreversible assumption can reach `main`; `/review`'s Spec
  axis cannot catch it because the PRD encoded the assumption. The cost is a
  revert next cycle — the deliberate price of full autonomy below the
  irreversible threshold.
- **Requires the machine awake.** The heartbeat only fires while the host is
  running (Orca app, or `cron`/`claude` on the laptop); a missed fire costs
  latency, not correctness. By design until/unless an always-on host is stood
  up.
- **Loop vocabulary stays out of `CONTEXT.md`.** Feature Loop, Driver,
  Heartbeat, Feature Candidate, Design Record, etc. are automation/tooling
  terms; they live here and in the `/feature-loop` skill, not in the
  training-domain glossary.
