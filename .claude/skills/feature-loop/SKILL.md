---
name: feature-loop
description: >-
  The autonomous Feature Loop driver. A state machine that owns the whole
  feature lifecycle — generate 3 candidates from GOAL.md + a recommendation,
  then (after one human pick) design, slice, build in parallel, review, and
  auto-merge. Runtime-agnostic: uses Orca workers when Orca is running, else
  Claude Code sub-agents + git worktrees. Runs one stage per invocation. Reuses
  /grill-with-docs, /to-spec, /to-tickets, /implement, /code-review. See ADR 0022.
disable-model-invocation: true
---

# Feature Loop

Advance the autonomous Feature Loop by **one stage**, run it to completion, then
exit. You are running **unattended** (no human answering mid-run), whatever
fired you — an Orca automation, a `cron`+`claude` launcher, a Claude routine, or
a human typing `/feature-loop`. Architecture + rationale:
`docs/adr/0022-autonomous-feature-loop.md`.

## Runtime modes (auto-detected)

The loop needs two runtime primitives: a way to run **isolated workers** (for
DESIGN and parallel BUILD) and a **run-lock**. It picks a mode automatically;
everything else in this skill is identical across modes.

- **Orca mode** — if `orca status --json` reports a ready runtime. Workers are
  Orca worktrees + agents, coordinated via the `/orchestration` skill. You get a
  UI and cross-session lifecycle.
- **Local mode** — otherwise (no Orca). Workers are `git worktree add` checkouts
  driven by **Claude Code sub-agents** (the Agent tool, launched concurrently in
  one message). No Orca, no extra setup — runs anywhere Claude Code runs.

Detect once: run `orca status --json`; if it errors or the runtime isn't ready,
use local mode. Mode-specific steps are tagged ‹orca› / ‹local› below.

### Worker primitive — "run `<brief>` on branch `<branch>` in isolation"

- ‹orca›:
  `orca worktree create --name <name> --base-branch <branch> --agent claude --prompt "<brief>" --json`,
  then track via `/orchestration` (`dispatch --inject`, wait for `worker_done`).
- ‹local›: `git worktree add <path> <branch>` (creating the branch if needed),
  then launch a **sub-agent** (Agent tool, `general-purpose`) whose prompt is:
  "Work only in `<path>`. `<brief>`. Commit to `<branch>`. Report what you
  changed and any assumptions." Launch several in one message for concurrency.

### Run-lock primitive (Step 0)

- Portable default: a lockfile at `.git/feature-loop.lock` holding PID +
  timestamp. If it exists, is fresh (< 2h), and its PID is alive → **BUSY,
  exit**. Otherwise write it, and delete it on exit.
- ‹orca› additionally: a live `feature/<slug>` worktree in `orca worktree ps`
  also counts as BUSY.

## Headless override (applies to every stage)

The stage skills (`/grill-with-docs`, `/to-spec`, `/to-tickets`, `/implement`)
are written for a human and will try to ask the operator questions. **There is
no operator mid-run.** Wherever a sub-skill would consult the human — grill
questions, `/to-spec` confirming seams, `/to-tickets` quizzing the breakdown —
you stand in as the **headless answerer**:

1. **Ground in this order:** `GOAL.md` (the anchor) → ADRs + `CONTEXT.md` → the
   codebase. Reason from the goal first.
2. **"I don't know, here's my assumption" beats a confident guess.** When a
   question isn't determined by the artifacts, record an explicit **assumption**
   with a goal-aligned default and proceed.
3. **Escalate only on the irreversible.** If an ungroundable choice touches a
   schema/data migration, a destructive op, or a public/external contract,
   **park** the feature and ask (see PARKED). Everything else proceeds.
4. The grill's output is a **design record** — decisions, assumptions, open
   questions — that feeds `/to-spec`.

## Step 0 — detect mode, take the lock, read the world

1. Detect the runtime mode (above).
2. Acquire the **run-lock**. If held → exit immediately, no-op.
3. Read state once:

```bash
gh issue list --state open --json number,title,body,labels   # per docs/agents/issue-tracker.md
gh pr list --state open --json number,headRefName,labels
git log -n 10 --oneline
```

## The priority ladder — derive the one current state

Check top-down. **First match wins**, so exactly one state is selected. The
_active feature_ is the set of issues + PR + branch tied to one feature
**milestone** (named `<slug>`). Candidates are _not_ yet in a milestone — the
key is created only when one is picked (DESIGN), so the label namespace never
grows.

| #   | Condition (first match wins)                                                         | State → action                      |
| --- | ------------------------------------------------------------------------------------ | ----------------------------------- |
| 0   | Run-lock already held (see Step 0)                                                   | **BUSY** → exit, no-op              |
| 1   | Active feature has an unanswered `ready-for-human` escalation                        | **PARKED** → exit, no-op            |
| 2   | Open PR exists for the active feature                                                | **SHIP** → review / merge / retry   |
| 3   | Open tickets in the active feature milestone remain                                  | **BUILD** → parallel implement      |
| 4   | A spec issue exists for the active feature, no tickets yet                           | **SLICE** → `/to-tickets`           |
| 5   | Feature issue has `approved`, no spec yet                                            | **DESIGN** → grill + `/to-spec`     |
| 6   | Candidate slate exists (`feature-candidate` + `needs-approval`), none `approved` yet | **WAIT** → exit, no-op              |
| 7   | Nothing active and no candidate slate awaiting a pick                                | **GENERATE** → propose 3 candidates |

Run the matched stage to completion, then exit. (State lives in GitHub, not this
process — if a run dies mid-stage, the next invocation re-derives and resumes:
e.g. BUILD with 2 of 5 tickets closed re-runs for the remaining 3.)

## State playbooks

### GENERATE

Read `GOAL.md`. Derive "done so far" from closed issues + recent commits + ADRs.
Propose **three distinct** feature candidates — genuinely different options
(different Pillars or angles, not three flavours of one idea) — each of which
moves a Pillar toward the North-star, respects the **Non-goals**, never proposes
anything in the **Horizon** (not-now) list, and is a **single demoable
tracer-bullet slice** (no epics). Open **one GitHub issue per candidate**; label
each `feature-candidate` + `needs-approval`, and record a short **kebab slug**
in the issue body (a `Slug: <slug>` line). No per-feature label or milestone yet
— the correlation key is created only when a candidate is picked (DESIGN), so
the label namespace stays fixed.

Then **rank the slate and recommend one** (as grilling always ships a
recommended answer — the operator still decides). Add the `recommended` label to
the top pick and post a `## Feature Loop recommendation` comment on **each**
candidate naming the pick (`#N`), a 2–3 sentence rationale, and the main
trade-off. Rank by:

1. **North-star + high-pillar alignment.**
2. **Tracer-bullet foundational value** — prefer a slice that lays a seam the
   others would extend over one that presupposes it.
3. **Risk-adjustment (reversibility / blast radius)** — down-rank
   schema/data-migration or wide multi-entity rewrites. Weighs **most heavily
   when few features have merged yet** (an unproven pipeline earns trust on safe
   slices first); relaxes as the track record grows.
4. **Demoability.**

Exit — the operator picks one by adding `approved` (usually, not necessarily,
the `recommended` one); that choice is the one human gate.

### WAIT / PARKED

No-op and exit. The operator picks one candidate (adds `approved`) or answers a
parked escalation (comment + flip `ready-for-human` back to `approved`) on their
own time; a later invocation picks it up.

### DESIGN

**First, clear the slate:** close the other open `feature-candidate` +
`needs-approval` issues (the unpicked candidates) with a brief "not selected
this round" comment — regenerable from `GOAL.md` later.

Read the picked candidate's `Slug: <slug>` (else derive one from its title).
**Create the feature milestone** `<slug>` and assign the feature issue to it —
this is the correlation key from here on:

```bash
gh api repos/{owner}/{repo}/milestones -f title="<slug>" -f description="Feature Loop: <slug>"
gh issue edit <feature#> --milestone "<slug>"
```

Then run one **worker** on branch `feature/<slug>` with the brief: run
`/grill-with-docs` (headless answerer) then `/to-spec`. Publish the spec as a
GitHub issue referencing the feature issue, **assigned to milestone `<slug>`** +
labelled `ready-for-agent`, with the design record captured in it. Any
ADRs/`CONTEXT.md` the grill produces are committed on the feature branch. Exit.

### SLICE

Run `/to-tickets` against the spec (headless answerer approves the breakdown).
Publish the tickets in dependency order, each **assigned to milestone `<slug>`**
(`gh issue edit <n> --milestone "<slug>"`) with their **Blocked by** field
populated. Exit.

### BUILD

Read the ticket **Blocked by** DAG. Dispatch every currently-unblocked ticket
as a **worker** (see primitive), each on a branch off the current
`feature/<slug>` tip, brief = run `/implement` (TDD at agreed seams) for that
ticket. Cap concurrency at **3** (‹orca›: `--max-concurrent 3`; ‹local›: at most
3 sub-agents per wave). As each worker finishes, **merge its branch into
`feature/<slug>`** (`/resolving-merge-conflicts` on a conflict, or dispatch a
fix worker), close the ticket, and release the next now-unblocked wave. When all
tickets in milestone `<slug>` are closed, exit.

### SHIP

Open **one PR** `feature/<slug>` → `main` (`gh pr create`). Run the merge bar:

- **Hard:** `npm run test` green, `npm run typecheck` clean, lint/build green,
  and `/code-review` **Spec axis** reports no missing/wrong requirement.
- **Advisory:** `/code-review` **Standards axis** (log findings; never blocks).

Bar green → **auto-merge** (`gh pr merge --squash --delete-branch`) and **close
the milestone**
(`gh api repos/{owner}/{repo}/milestones/<number> -X PATCH -f state=closed`) so
it drops out of the active view. Next invocation GENERATEs the next slate. Bar
red → run `/implement` to fix, up to **3 attempts**; still red → **park**: label
the feature `ready-for-human`, comment the `/code-review` findings, notify the
operator (‹orca› inbox/push, ‹local› the comment is the notification), and exit
so the loop advances (the milestone stays open until resolved).

## Labels

The loop's vocabulary. Use `gh` per `docs/agents/issue-tracker.md`; shared
triage roles are in `docs/agents/triage-labels.md`.

| Label               | Meaning                                                                    | Set by       | Applied at                                   |
| ------------------- | -------------------------------------------------------------------------- | ------------ | -------------------------------------------- |
| `feature-candidate` | One of 3 auto-generated proposals                                          | Loop         | GENERATE                                     |
| `needs-approval`    | Candidate awaiting the operator's pick                                     | Loop         | GENERATE                                     |
| `recommended`       | The loop's suggested pick of the slate (reasoning in a comment)            | Loop         | GENERATE (exactly one per slate)             |
| `approved`          | The candidate the operator chose — the one human action                    | **Operator** | the gate                                     |
| `ready-for-agent`   | Spec / tickets are AFK-ready (existing triage label)                       | Loop         | DESIGN, SLICE                                |
| `ready-for-human`   | Parked: blocked / failed / escalated, needs the operator; also triage role | Loop         | PARK (SHIP retry-exhaust, DESIGN escalation) |

The operator clears `ready-for-human` by commenting an answer and flipping the
label back to `approved`; the next invocation resumes that feature.

**Feature correlation is a milestone, not a label.** Each picked feature gets a
GitHub **milestone** named `<slug>` (created at DESIGN; feature issue + spec +
tickets assigned to it; PR correlates via its `feature/<slug>` branch). It
is **closed** at merge, so it drops out of the active view — the label list
above never grows per-feature. This is the whole set of labels the loop uses.

## How it's triggered (heartbeat)

The skill runs **one stage per invocation** and is trigger-agnostic. Pick any:

- **Manual** — type `/feature-loop` in a Claude Code session.
- **`cron` + `claude`** (local, no Orca) — `ralph/feature-loop.sh` runs
  `claude -p "/feature-loop"`; schedule it with `cron`/`launchd`.
- **Claude routine** — a scheduled trigger firing `/feature-loop`.
- **Orca automation** —
  `orca automations create ... --prompt "Run /feature-loop"`.

The run-lock makes overlapping fires safe: a fire that lands while a stage is
running just no-ops.

## Notes

- **One stage per invocation, run to completion.** Long stages (DESIGN, BUILD)
  hold the run open; the lock keeps concurrent fires from colliding.
- **Labels:** see the **Labels** section above.
- **Worker mechanics:** ‹orca› see the `orca-cli` + `orchestration` skills;
  ‹local› see the worker primitive above (git worktree + Agent tool).
