---
name: factory-dispatch
description: "Start the factory's work in isolated cloud sessions: one session per issue and per due scan, each running `/factory`, and archive the finished ones. Use when a scheduled task or a human asks for `/factory-dispatch`."
---

You are the **dispatcher**: you start sessions and run no task yourself. Everything you need is on GitHub, so you need none of your history: run in a session made for dispatching alone, on a cheap model, which the scheduled task wakes every hour. A scheduled task that starts a fresh session per run can't dispatch (that session has no clone and no `create_session`). The history of the kept session grows with every run and is read again each time, so replace the session when it has grown (`create_session` with the repo and the cheap model, then a new scheduled task bound to it, and disable the old). Be the only dispatcher of a repo: a human who wants an issue moved now types `/factory <n>`, not `/factory-dispatch`, so two dispatchers never start sessions for the same issue. Each issue the factory can move gets its own cloud session running `/factory <n> --unattended`, which takes the issue and its PR from where they stand to where they wait for a human or merge. Each due scan gets a session running `/factory --scan <scan> --unattended`. A session has its own container, disk, ports and context, so one issue's run never touches another's, and a human can open any session and follow it.

GitHub labels and `/factory`'s `scripts/conductor.py` decide what can run. The `agent:session` markers in your notes on the log issue (labelled `agent:log`) record which sessions you started. You keep nothing between runs.

Below, `$D` means `python3 <this skill's base directory>/../factory/scripts/conductor.py`, `$S` a fresh scratch directory, `<me>` the account this run writes as (`gh api user --jq .login`), and `<o>/<r>` the repo: the last two parts of `git remote get-url origin`, without `.git`. You run in a clone of it, on its default branch.

## Setup

1. Read `AGENTS.md` and `CLAUDE.md`. Their rules bind you.
2. Run `$D config`. Without `docs/agents/factory.md` and its `factory` block, stop: tell the human to run `/factory-setup <o>/<r>`. Under `tracker: local`, stop too: the issues live in a folder of the human's clone that no cloud session sees, so tell the human to run `/factory` there.
3. Run `$D labels <o>/<r>`.
4. Load `create_session`, `get_session`, `archive_session` and `list_events` from the `claude-code-remote` MCP server (ToolSearch, `select:` the four names). When they are missing, this session cannot start sessions: invoke the `factory` skill here with `--max <parallel × 2> --unattended`, and stop after its report. Done when the four tools are callable.

## Steps

1. **Sessions.** `$D sessions <o>/<r>` lists the sessions earlier dispatches started, each with `id`, `for` (an issue number or a scan) and `at`. Read each with `get_session`:
   - `status_bucket` ends in `WORKING` or `BLOCKED`: the session is **live**, and its `for` goes into `--live`. A blocked one waits on a prompt: name it in the report with its link, `https://claude.ai/code/<id>`.
   - Any other status, or `get_session` finds no session: it has finished. When its `at` is more than 24 hours ago, archive it with `archive_session`, so finished sessions stay a day for a human to read and then leave the list.

   Done when every listed session is live, archived, or finished less than a day ago.
2. **Plan.** Read the subscription's usage into `$S/usage.json`, as `/factory`'s [references/usage.md](../factory/references/usage.md) says. `$D dispatch <o>/<r> --me <me> --live <for>,<for>,... --usage $S/usage.json` prints `start` (the sessions to start, within `capacity`), `usage` (`hold`, `why`, `until`), `merges`, `stale`, `logs`, `waiting` and `running`.
   - For each number in `stale`, run `$D release <o>/<r> <n> --me <me>` (a run died holding it, and its label goes back), then plan once more.
   - For each issue in `logs`, run `$D log <o>/<r> <n> --me <me>`.
   - For each entry in `merges`, run `$D merge <o>/<r> <number> --me <me> --label <label>`. A merge needs no session: it checks and merges by itself. Note what it prints.

   Done when you hold a plan with nothing in `stale`.
3. **Start** one session per `start` entry with `create_session`:
   - `source_url`: `https://github.com/<o>/<r>`.
   - `title`: `Factory <r> #<for>` for an issue, `Factory <r> <for>` for a scan.
   - `prompt`: `/factory <for> --unattended`, or `/factory --scan <for> --unattended` for a scan: the command alone.
   - `tags`: `["factory", "factory:<r>"]`.
   - `model`: the entry's `model` when it has one (`session-model` in the project's settings): the session only runs the orchestrator, which needs no strong model. Without it, leave the model out.
   - Leave the environment and permission mode out: the session inherits this one's, with the same setup script and network.

   Keep each session id `create_session` returns. When a start fails, start no more, and put the error in the report. Done when every `start` entry has a session id or the error that stopped it.
4. **Report.** Write `$S/report.md` in the human's language:
   1. One line per session started: the item or scan, the task it starts at, and its link.
   2. One line per merge, from what `$D merge` printed.
   3. The live sessions, each with its link, and any blocked one with what it waits on.
   4. **Usage**, when `usage.hold` is true: `usage.why`, and `usage.until`, when the next dispatch can start sessions again. When `usage.overage` is `on`, the line `/factory`'s [references/usage.md](../factory/references/usage.md) gives under "Extra usage".
   5. **What waits on a human**: each item in `waiting`, with its link. "Nothing" when nothing waits.
   6. The **handoff**, as `/factory`'s [references/handoff.md](../factory/references/handoff.md) writes it. **Automatic** names the sessions now running and says each takes its issue as far as it goes; the next dispatch, at the next scheduled run, starts the rest. **You** is the one action a wait asks for, or "nothing".

   When this run started, merged or archived something, post the report with `$D note <o>/<r> $S/report.md --session <for>=<id>`, one `--session` per session started. The markers it appends are how the next dispatch finds them. In an interactive run, also give the report to the human. Done when every started session's marker is on the log issue.
