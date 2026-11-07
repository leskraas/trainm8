# The project's settings

Each project sets the factory up in `docs/agents/factory.md`, in one fenced
block tagged `factory`. `/factory-setup` writes it; `conductor.py config`
prints it as the factory reads it, with the defaults filled in.

````markdown
```factory
tracker: github
autonomy: doors
merge: agent
budget: 6000000
parallel: 3
build-parallel: 2
serial: qa, design-scan
human-paths: .github/, AGENTS.md
human-edits: test/security/
scan-every: 10
scans: architecture, design, retro
design: prototype
po: mats
dev: lars
fallback: lars
start: pnpm dev
check: pnpm check
regenerate: pnpm db:generate
deploy-check: pnpm test:image
schedule: hourly
models: qa=sonnet, update-branch=sonnet, design-scan=sonnet, *=opus
effort: update-branch=low, qa=medium, implement=medium, review-fix=medium, *=high
session-model: claude-sonnet-5-5
```
````

| Key | Values | Default | What it sets |
|---|---|---|---|
| `tracker` | `github`, `local` | `github` | Where issues live. `github`: GitHub Issues. `local`: one folder per issue in `tracker-dir`, for a repo whose tickets live elsewhere (Linear, Jira) or whose GitHub Issues are off; GitHub sees only the PR, its pushes, checks and merge: the factory's labels, comments and evidence stay in the folder. A local tracker runs only by `/factory` in the clone that holds the folder. |
| `tracker-dir` | path | `.scratch` | With `tracker: local`: the folder, from the main clone's root, that holds `<key>-<slug>/factory/` per issue. |
| `autonomy` | `supervised`, `doors`, `full` | `doors` | When an issue stops for a human. `supervised`: the spec, every one-way door, and the merge. `doors`: every one-way door. `full`: never on purpose. |
| `merge` | `human`, `agent` | `human` under `supervised`, else `agent` | Who merges once QA passes. `agent` merges only on the head QA verified, with every check green. |
| `merge-method` | `merge`, `squash`, `rebase` | `merge` | How the factory merges. Use one the repo allows: GitHub refuses the others. |
| `budget` | tokens | 6000000 | Tokens per issue, its PR included, before it stops for a human. |
| `parallel` | number | 3 | Sessions `/factory-dispatch` keeps working at once, and tasks one `/factory` batch runs at once. |
| `build-parallel` | number | 2 | Of those, tasks that write code (`implement`, `update-branch`). |
| `serial` | task names | – | Tasks that run one at a time, because they share one running app or one set of ports (QA, the design scan). |
| `human-paths` | globs, a directory ending in `/` | – | Paths a human reads before a merge: a PR that changes one waits for a human's answer at the merge, at every autonomy level. Keep it to the files whose change reaches past the repo (CI workflows, infrastructure, database roles, registry config) or rewrites the agents' rules. Guard tests and lint config go in `human-edits` instead. |
| `human-edits` | globs, a directory ending in `/` | – | Paths where a change to an existing file (an edit, a removal, a rename) waits for a human at the merge, while a new file merges like any other: guard tests and lint config, where adding a test only makes the guard stricter. |
| `scan-every` | merges | 10 | Merges to the default branch between scans. `0` turns scans off. |
| `scans` | `architecture`, `design`, `retro`, or `none` | all three | Which scans run on their own every `scan-every` merges. `/factory --scan <scan>` runs any of them on demand, listed or not. |
| `design` | `prototype`, `design`, `off` | `prototype` | The designer's tool in an interactive run; `off` skips the design task. |
| `po`, `dev`, `fallback` | GitHub logins | – | Who a wait is for: `po` for product calls, `dev` for the rest, `fallback` when a role has nobody. |
| `start` | command | from the README | Starts the app for QA and the design scan. |
| `check` | command | what CI runs | The checks every code-writing task runs before it returns. |
| `regenerate` | command | – | Regenerates numbered files (migrations) after `update-branch` merges the default branch. |
| `deploy-check` | command | – | Proves the change runs as deployed: build the image, run the migrations against data shaped like production. QA runs it when the PR touches what it covers. |
| `schedule` | `hourly`, `none` | `none` | Whether a scheduled task runs `/factory-dispatch` every hour; always `none` with `tracker: local`. Every [handoff](handoff.md) says from this whether the next task runs on its own or waits for someone to type `/factory`. |
| `models` | `task=model` pairs, `*` for the rest; models `haiku`, `sonnet`, `opus`, `fable` | – (the session's) | The model each task's subagent runs on, passed to the Agent tool. Review's parts can be set apart as `review-read` and `review-fix`. Name `*` whenever you name any, or the tasks you leave out inherit the session's model, which may be the cheap one. Put the cheaper model where the work is mechanical: `update-branch`, `qa`, `design-scan`. Keep the strongest where a mistake costs the most: `spec`, `design`, `architecture`, `implement`, `review`. |
| `effort` | `task=effort` pairs, `*` for the rest; `low`, `medium`, `high`, `xhigh`, `max` | – (the session's) | The reasoning effort of each task's subagent. Lower it where the task follows a recipe (`update-branch`, the review's fix), keep it high where it judges. |
| `session-model` | a model ID | – (the dispatcher's) | The model of each session `/factory-dispatch` starts: the orchestrator, which only runs `conductor.py` and writes briefs. Its subagents take `models`. |

How QA starts and drives the app lives next to this file, in
`docs/agents/verify/` (`factory-setup`'s `references/verify.md`).

## A local issue

With `tracker: local`, `conductor.py` keeps each issue in
`<tracker-dir>/<key>-<slug>/factory/`, beside whatever else the ticket's
folder holds:

- `issue.md`: `# <title>`, then the `Labels:`, `State:`, `Created:`,
  `Author:` and `Assignees:` lines, a blank line, and the body. A human
  starts the factory on an issue by adding `agent:spec` to `Labels:`.
- `comments.md`: the factory's comments, each between `<!-- comment ... -->`
  and `<!-- end -->`. A human answers a wait by typing below the last one;
  the next read stamps their text as a comment.
- `events.jsonl`: label events, for claims and stale locks.
- `pr-<n>/`: what the factory writes about the issue's PR `n`, kept off
  GitHub so the rest of the team sees only the PR: `state.json` (its labels
  and assignees), `comments.md` (runs, review findings, waits; a human
  answers there the same way) and `events.jsonl`.
- `evidence/<task>-<time>/`, in the issue's or the PR's folder: the
  screenshots and recordings a run captured, linked by path from its comment.

The key is the ticket's id in lowercase (`seal-522`), or `local-<n>` for an
issue the factory files itself (a ticket, a proposal, the log). The factory's
PR names its issue with `<!-- agent-issue: seal-522 -->` and no closing word,
and the conductor closes the local issue once the PR has merged.

