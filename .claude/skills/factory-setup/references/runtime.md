# Runtime facts

What Bredvid/skills#19 found on 2026-10-29 with Claude Code 2.1.312, by
trying where it could and otherwise from the official docs. The full write-up
is the comment "Funn fra #19: runtime" on Bredvid/skills#15. Setup's own
probe overrides the `/design` verdict per repo, so rerun it when Claude Code
changes.

## `/design`: doesn't hold yet, so the designer uses `prototype`

The default in `scripts/readiness.py` (`DESIGN_DEFAULT`) is `prototype`: the
designer publishes `bredvid-design-engineering:prototype` as an artifact.

- `/design` is an artifact template. Headless runs (`claude -p`), the Agent
  SDK and the GitHub Action don't have it. A headless probe with
  `enableArtifact: true` found neither `/design` nor the `Artifact` tool. A
  cloud routine is unattended, so it can't use `/design` either until the
  probe below holds there.
- In an interactive CLI or Desktop session, a publish you prompt for needs no
  approval, and a republish updates the same URL. Human edits to an artboard
  save on the canvas. Claude reads an artifact by URL as a summary, with the
  full source saved locally. Nobody has yet confirmed that an edit made on an
  artboard shows up in that source. The probe in SKILL.md tests exactly that.
- `DesignSync` is not a way in. It syncs design-system projects for
  `/design-sync`, and every write needs a permission prompt.
- An artifact can't publish headless either. In an unattended run the design
  task writes its canvas as an HTML file, and `conductor.py apply` commits it
  to the `agent-evidence` branch.

## Scheduled tasks: what they can do (updated 2026-11-05)

From the docs ("Automate work with scheduled tasks", formerly routines):

- A GitHub trigger takes pull request events (opened, labeled, synchronized
  and so on), with filters on labels and draft state, and issue events
  (opened, labeled, closed and so on), without filters. Every event starts a
  new session. There is no comment event, so a human's answer on an issue is
  picked up by the next scheduled run, not at once.
- Schedules run at most hourly. Runs, API fires and GitHub events each have
  hourly caps per account.
- A scheduled task runs in auto mode as its owner, and the Agent tool works
  in it. The `Artifact` tool is not documented there, so the factory treats a
  scheduled run as unattended: the design task draws one variant, and
  evidence goes to the `agent-evidence` branch instead of an artifact.
- Sessions started by another session through `create_session` were refused
  GitHub writes by the auto-mode classifier in Bredvid/tavla (its message
  "doesn't count as your approval"). The factory therefore runs its tasks as
  subagents of one session, typed by a human or started by a scheduled task
  whose saved prompt authorises the work (ADR-0011).
- Subagents could not start subagents of their own in every Tavla run. Tasks
  that need parallel parts (review, design) list them as **Parts**, and the
  orchestrator runs them.
- Tried on 2026-11-07: a scheduled task that creates a fresh session per run
  starts it with no repository and without `add_repo` or `create_session`, so
  `/factory-dispatch` can't run there. Bind the task to a dispatcher session
  made with `create_session` (the repo as source, a cheap model) instead, and
  replace that session when its history has grown: a dispatcher kept for two
  days on Opus cost $27, almost all of it reading its own history.

## Playwright in the cloud: preinstalled, but not for the repo's version

Tried in a cloud session on 2026-10-31 (Node 22.23.4):

- The image has a global Playwright 1.63.0 on `NODE_PATH`, and its Chromium
  (revision 1243) in `/opt/pw-browsers`, which `PLAYWRIGHT_BROWSERS_PATH`
  points at. `require('playwright')` therefore resolves in any directory,
  including a repo with no Playwright of its own. The `playwright` fact in
  SKILL.md clears `NODE_PATH` for that reason.
- A repo pinning another version (1.62.1 and 1.64.1 tried) fails to launch:
  `Executable doesn't exist at
  /opt/pw-browsers/chromium_headless_shell-1248/...`, since each Playwright
  version expects its own Chromium revision.
- `playwright install chromium` from the repo downloads that revision from
  `cdn.playwright.dev` through the proxy (about 20 seconds), and Chromium
  then launches. The system libraries are already there, so `--with-deps` is
  not needed. This is what the wizard's setup script does.
- `executablePath: '/opt/pw-browsers/chromium'` (a link to the image's
  Chromium) or `channel: 'chrome'` also launches under a pinned 1.62.1 or
  1.64.1, but Playwright supports only the revision it ships with, and the
  repo's own tests don't pass that option.

## GitHub from a cloud session: REST only, repo-scoped

Tried in a cloud session on 2026-10-31. The proxy blocks GraphQL with
`HTTP 403: GitHub GraphQL is not available from Claude Code sessions`, so
every `gh` command built on it fails: `gh repo clone`, `gh repo view`,
`gh label list`, `gh issue list/view/create`, `gh pr list/create`,
`gh search`. REST through `gh api repos/<owner>/<repo>/...` works for the
repos attached to the session. Paths outside a repo are blocked too:
`users/<login>`, `search/issues` and `repos/<owner>/<repo>/collaborators`
answer 403. `repos/<owner>/<repo>/assignees/<login>` works (204, or 404 for
someone who can't be assigned). So does a label name with `:` in the path,
as in `repos/<owner>/<repo>/labels/factory:spec`.

`gh api --paginate` fails from the second page on: GitHub's `Link` header
names the next page `repositories/<id>/...`, and the proxy answers
`Numeric-ID repository paths (repositories/{id}/...) are not supported`
(403). Ask for `?per_page=100&page=2` and so on instead; `conductor.py list`
does that.

GitHub's REST API can't mark a PR ready for review or turn it back into a
draft (the proxy adds `POST repos/<owner>/<repo>/pulls/<n>/ccr/ready_for_review`
in a cloud session, but the auto-mode classifier refused it in several Tavla
runs). The factory therefore opens its PRs ready, and its labels say where
each stands (ADR-0011).

The factory's skills therefore use only `gh api` REST calls, `conductor.py`
(which wraps them) and `git`, and run the same locally and in the cloud.

## Plugin `dependencies`: supported, but each must be synced too

`dependencies` in `plugin.json` is a documented field. Bare names resolve in
the plugin's own marketplace and are installed with the plugin.
`claude plugin validate plugins/factory` passes it without a warning.

Found in a cloud session on 2026-11-01: a plugin synced from claude.ai loads
only when every dependency is synced in the organisation too. The plugin then
named `bredvid-fabrikk` failed with `Dependency "bredvid-produkteier" is not
installed`, and none of its skills appeared. The factory therefore depends
only on `bredvid-engineering` and `bredvid-design-engineering`, and carries
what it used from `bredvid-produkteier` (the ownership test) itself. Keep
new dependencies to plugins the organisation already syncs.
