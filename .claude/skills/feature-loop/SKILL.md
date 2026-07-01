---
name: feature-loop
description: >-
  The autonomous Feature Loop driver. A heartbeat-fired state machine that owns
  the whole feature lifecycle — generate a Feature Candidate from GOAL.md, then
  (after one human approval) design, slice, build in parallel, review, and
  auto-merge — one transition per tick. Reuses /grill-with-docs, /to-prd,
  /to-issues, /implement, /review, /orchestration. See ADR 0022.
disable-model-invocation: true
---

# Feature Loop

You are running **unattended**. There is no human in this session. Your job is
to advance the autonomous Feature Loop by **exactly one transition**, then exit.
The architecture and rationale are in `docs/adr/0022-autonomous-feature-loop.md`
— read it if anything here is ambiguous.

## Headless override (applies to every stage)

The stage skills you invoke (`/grill-with-docs`, `/to-prd`, `/to-issues`,
`/implement`) are written for a human and will try to ask the operator
questions. **There is no operator.** Wherever a sub-skill would consult the
human — `/grill-with-docs` asking interview questions, `/to-prd` confirming test
seams, `/to-issues` quizzing the slice breakdown — you stand in as the
**headless answerer** under these grounding rules:

1. **Ground in this order:** `GOAL.md` (the anchor) → ADRs + `CONTEXT.md` → the
   codebase. Reason from the goal first; drop to the others to check consistency
   and fill detail.
2. **"I don't know, here's my assumption" beats a confident guess.** When a
   question is not determined by the artifacts, record an explicit
   **assumption** with a goal-aligned default and proceed.
3. **Escalate only on the irreversible.** If an ungroundable choice touches a
   schema/data migration, a destructive operation, or a public/external
   contract, **park** the feature and ask (see PARKED). Everything else proceeds
   on a recorded assumption.
4. The grill's output is a **design record** — decisions, assumptions, open
   questions — that feeds `/to-prd`.

## Step 0 — preconditions and the lock

```bash
orca status --json          # runtime must be up
orca worktree ps --json     # is a loop worker already live?
```

**Row 0 of the ladder is the lock.** If a `feature/<slug>` worktree or a
dispatched loop worker is already alive in Orca, **another tick is mid-flight —
exit immediately and do nothing.** State is derived, not stored, so there is
nothing to clean up.

Also read the world once:

```bash
gh issue list --state open --json number,title,body,labels --jq '...'   # per docs/agents/issue-tracker.md
gh pr list --state open --json number,headRefName,labels
git log -n 10 --oneline
```

## The priority ladder — derive the one current state

Check top-down. **First match wins**, so exactly one state is selected. The
_active feature_ is the set of issues/PR/branch sharing one `feature:<slug>`
label.

| #   | Condition (first match wins)                                                         | State → action                      |
| --- | ------------------------------------------------------------------------------------ | ----------------------------------- |
| 0   | A loop worker / `feature/<slug>` worktree is **live** in Orca                        | **BUSY** → exit, no-op              |
| 1   | Active feature has an unanswered `ready-for-human` escalation                        | **PARKED** → exit, no-op            |
| 2   | Open PR exists for the active feature                                                | **SHIP** → review / merge / retry   |
| 3   | Open `feature:<slug>` impl issues remain                                             | **BUILD** → parallel implement      |
| 4   | A PRD issue exists for the active feature, no impl issues yet                        | **SLICE** → `/to-issues`            |
| 5   | Feature issue has `approved`, no PRD yet                                             | **DESIGN** → grill + `/to-prd`      |
| 6   | Candidate slate exists (`feature-candidate` + `needs-approval`), none `approved` yet | **WAIT** → exit, no-op              |
| 7   | Nothing active and no candidate slate awaiting a pick                                | **GENERATE** → propose 3 candidates |

Do the matched state's playbook **once**, then exit.

## State playbooks

### GENERATE

Read `GOAL.md`. Derive "done so far" from closed issues + recent commits + ADRs.
Propose **three distinct** feature candidates — genuinely different options
(different Pillars or different angles, not three flavours of one idea) — each
of which moves a Pillar toward the North-star, respects the **Non-goals**, never
proposes anything in the **Horizon** (not-now) list, and is a **single demoable
tracer-bullet slice** (no epics). Open **one GitHub issue per candidate**; label
each `feature-candidate`, `needs-approval`, and its own `feature:<slug>` (coin a
short kebab slug per candidate). Then exit — the operator picks exactly one by
adding `approved` to it; that choice is the one human gate.

### WAIT / PARKED

No-op and exit. The operator picks one candidate from the slate (adds `approved`
to it) or answers a parked escalation (comment + flip `ready-for-human` back to
`approved`) on their own time; a later heartbeat picks it up.

### DESIGN

**First, clear the slate:** close the other open `feature-candidate` +
`needs-approval` issues (the unpicked candidates) with a brief "not selected
this round" comment — they can be regenerated from `GOAL.md` later. Then
dispatch a detached worker on a fresh `feature/<slug>` worktree (the approved
candidate's slug) to run `/grill-with-docs` (headless answerer) then `/to-prd`.
The PRD is published as a GitHub issue referencing the feature issue, carrying
`feature:<slug>` and `ready-for-agent`. Capture the design record in the PRD.
Exit; subsequent ticks no-op (row 0) until the worker finishes.

### SLICE

Run `/to-issues` against the PRD (headless answerer approves the breakdown).
Publish impl issues in dependency order, each labelled `feature:<slug>` with
their **Blocked by** field populated. Exit.

### BUILD

Coordinate with `/orchestration`. Read the impl-issue **Blocked by** DAG.
Dispatch currently-unblocked issues as a **concurrency-capped** wave
(`--max-concurrent 3`), each worker in its own worktree branched off the current
`feature/<slug>` tip, running `/implement` (TDD at agreed seams). As each
`worker_done` lands, merge its branch into `feature/<slug>` (resolve or dispatch
a fix for sibling conflicts), close the issue, and release the next
now-unblocked wave. When all `feature:<slug>` impl issues are closed, exit —
next tick is SHIP.

### SHIP

Open **one PR** `feature/<slug>` → `main`. Run the merge bar:

- **Hard:** `npm run test` green, `npm run typecheck` clean, lint/build green,
  and `/review` **Spec axis** reports no missing/wrong requirement.
- **Advisory:** `/review` **Standards axis** (log findings; never blocks).

Bar green → **auto-merge** the PR, delete the branch. Next tick GENERATEs the
next feature. Bar red → loop into `/implement` to fix, up to **3 attempts**;
still red → **park**: label the feature `ready-for-human`, comment the `/review`
findings, notify the operator (Orca inbox / push), and exit so the loop
advances.

## Labels

The loop's own vocabulary. Use `gh` per `docs/agents/issue-tracker.md`; shared
triage roles are in `docs/agents/triage-labels.md`.

| Label               | Meaning                                                                    | Set by       | Applied at                                   |
| ------------------- | -------------------------------------------------------------------------- | ------------ | -------------------------------------------- |
| `feature-candidate` | One of 3 auto-generated proposals                                          | Loop         | GENERATE                                     |
| `needs-approval`    | Candidate awaiting the operator's pick                                     | Loop         | GENERATE                                     |
| `approved`          | The candidate the operator chose — the one human action                    | **Operator** | the gate                                     |
| `feature:<slug>`    | Correlation key tying issue → PRD → impl issues → PR for one feature       | Loop         | GENERATE (a distinct slug per candidate)     |
| `ready-for-agent`   | PRD / impl issues are AFK-ready (existing triage label)                    | Loop         | DESIGN, SLICE                                |
| `ready-for-human`   | Parked: blocked / failed / escalated, needs the operator; also triage role | Loop         | PARK (SHIP retry-exhaust, DESIGN escalation) |

The operator clears `ready-for-human` by commenting an answer and flipping the
label back to `approved`; the next heartbeat resumes that feature.

## Notes

- **One transition per tick.** Never chain stages within a single tick; dispatch
  long work to detached workers and exit. This keeps ticks cheap,
  non-overlapping, and crash-safe.
- **Labels:** see the **Labels** section above.
- **Dispatch patterns:**
  `orca worktree create --name <slug> --agent claude --prompt "<brief>" --json`
  for detached stage workers; `/orchestration` (`task-create` /
  `dispatch --inject` / `check --wait`) for the BUILD wave coordinator. See the
  `orca-cli` and `orchestration` skills.
