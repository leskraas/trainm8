---
name: factory
description: "Run the factory: take what `agent:*` labels ask for on issues and PRs, run each task in a fresh subagent, write every result back, and repeat until nothing can run. Use when a human, a scheduled task or `/factory-dispatch` asks for `/factory`. Takes an optional issue or PR number, `--scan <scan>`, `--max <n>` and `--unattended`."
---

You are the **orchestrator**, and you stay thin. GitHub labels say what work exists (`agent:spec`, `agent:review`, ...); `scripts/conductor.py` says what can run now, claims it, and writes every result back; a fresh subagent does each task. You hold the queue and the results. Every GitHub write goes through `$D`, every task's work through its subagent, and every result reaches `apply` exactly as the subagent returned it.

Below, `$D` means `python3 <this skill's base directory>/scripts/conductor.py`, `$S` a fresh scratch directory, `<me>` the account this run writes as (`gh api user --jq .login`), and `<o>/<r>` the repo: the last two parts of `git remote get-url origin`, without `.git`. You run in a clone of it, on its default branch.

The run is **unattended** when its arguments carry `--unattended` (`/factory-dispatch` passes it to every session it starts) or the `Artifact` tool is missing, and **interactive** otherwise (a human typed `/factory`). Both take the same steps.

With an issue or PR number, the run takes that issue and its PRs as far as they go: a session `/factory-dispatch` started holds one issue from spec to merge. Under `tracker: local` an issue is a key such as `SEAL-522` instead of a number. With `--scan <scan>`, it runs that one scan.

## Setup

1. Read `AGENTS.md`, `CLAUDE.md` and `docs/agents/*.md`. Their rules bind you and every task.
2. Run `$D config`. Without `docs/agents/factory.md` and its `factory` block, stop: tell the human to run `/factory-setup <o>/<r>`. The output is the project's settings, for the briefs.
3. Run `$D labels <o>/<r>`, which creates any `agent:*` label that is missing.
4. Under `tracker: local`, with a key as argument that `$D fetch <o>/<r> <key> --me <me>` can't find: fetch the ticket as `docs/agents/issue-tracker.md` says ("fetch the relevant ticket"), write its description to `$S/ticket.md`, and run `$D new <o>/<r> <key> --title <title> --body-file $S/ticket.md --me <me> --label agent:spec`. Done when `$D fetch` finds the key; the issue's files are in `<tracker-dir>/<key>-<slug>/factory/` ([references/config.md](references/config.md), "A local issue").

## Loop

Repeat until a step sends you to **Report**.

1. **Usage.** Read the subscription's usage into `$S/usage.json`, as [references/usage.md](references/usage.md) says. Without the `claude-code-remote` tools (a local run), skip this step and leave `--usage` out below. Done when the file is written, or the tools are missing.
2. **Queue.** `$D queue <o>/<r> --me <me> [--only <n>] [--skip <numbers>] [--usage $S/usage.json]` prints `run` (what can run, in order), `batch` (what to run at once, within `parallel` and `build-parallel`), `waiting`, `running`, `stale` and `logs`.
   - With an issue or PR number as argument, pass it as `--only <n>`: the queue then holds the issue and its PRs. With `--scan <scan>`, pass `--scan <scan>` instead.
   - Pass in `--skip` every merge that printed `pending: true` in this run; a later run takes it.
   - For each number in `stale`, run `$D release <o>/<r> <n> --me <me>` (a run died holding it, and its label goes back), then queue again.
   - For each issue in `logs`, run `$D log <o>/<r> <n> --me <me>`.
   - When `usage.hold` is true, `batch` holds only merges: run them, then go to **Report**, which gives `usage.why` and `usage.until`. When only `usage.hold_new` is true, `batch` leaves out new work and started work runs on.
   - When `usage.overage` is `on`, the report carries the line [references/usage.md](references/usage.md) gives under "Extra usage".
   - When `batch` is empty, or `--max` tasks have run, go to **Report**.

   Done when you hold a batch with no stale item in it.
3. **Merge and update.** An entry with `deterministic: true` is a merge: `$D merge <o>/<r> <n> --me <me> --label <label>` claims, checks and merges by itself. Note what it prints. An entry with `try_update: true` is a PR that is only behind the default branch: run `$D update <o>/<r> <n> --me <me> --label <label> --resume <resume>` first. `updated: true` means it is done without a run: drop the entry. `agent: true` means a run must do it: keep the entry for step 4.
4. **Claim** each other entry: `$D claim <o>/<r> <n> --label <label> --me <me>`. A scan has no number and no label, and needs no claim. `claimed: false` means another run took it: drop the entry. Done when every remaining entry is yours.
5. **Run.** For each claimed entry, start one subagent with the brief in [references/brief.md](references/brief.md), all in one message so they run side by side, each with `run_in_background: false`: the turn then lasts until every subagent has returned with its `<usage>`, while a turn that ends with subagents still running can leave the session idle, holding its items. Give the Agent tool the entry's `model` and `effort` when the entry has them: the project chose them per task in `models` and `effort`, to spend less where a task needs less. A task file with a **Parts** section runs as several subagents: send its first part with the batch, and each next part once the one before has returned, each with the model and effort its part names in the entry's `parts`. Done when every subagent has returned.
6. **Apply** each result:
   1. Set its `tokens` to the sum, over the task's subagents, of the `total_tokens` (or `subagent_tokens`) in the `<usage>` the Agent tool reported when each returned, in its result or its task notification. Read it there for every subagent; the budget per issue counts on it. Only when no usage came back at all, put your estimate and `"tokens_estimated": true`. `apply` marks a count that is a whole multiple of 10,000 as estimated, since a real count almost never is.
   2. `$D apply <o>/<r> <result file> --me <me> --from <label> --repo-dir <the task's worktree, or .>`. It checks the whole result before it writes anything.
   3. When `apply` refuses the result, or the subagent returned none, write a result yourself: `outcome` `blocked`, the task, the item, and a `comment` quoting the error. Apply that.

   Done when no item from this batch carries `agent:in-progress`.
7. **Clean.** Remove the batch's worktrees (`git worktree remove --force <path>`), and go back to step 1.

A usage limit that stops a subagent anyway stops the loop: run `$D release` for every item this run still holds, so its label goes back, then report.

## Report

In the human's language, readable in thirty seconds:

1. One line per item this run touched: its number and title, the tasks it ran (`spec → architecture → implement`), and where it stands.
2. **What waits on a human**: each `agent:needs-human` and `agent:blocked` item from this run or from `waiting`, with its link (under `tracker: local`, the path of the issue's or PR's `comments.md`), what the wait asks, and who it waits for when the config names one. "Nothing" when nothing waits.
3. **Proposals** any scan filed, with links: those `apply` printed under `started` go to `spec` on their own; the rest wait for a human to choose, and belong in the handoff's **You**.
4. The **handoff**, as [references/handoff.md](references/handoff.md) writes it: what the next run takes on its own, and the one action that is the human's, from item 2 or "type `/factory`" when work remained past `--max`.

Interactive: give the report to the human. Unattended, without a number or `--scan`: when the run did something, write it to `$S/report.md` and post it with `$D note <o>/<r> $S/report.md`. Unattended with a number or `--scan`, the run comments on the item and the scan report on the log issue already say what it did: end with the report in the session.
