# Wizard stages

The human steps `/factory-setup` hands to a wizard, one stage per step, in this
order. Include a stage only when its check is red with `fix: wizard`, or, for
**Guard files**, when the setup PR left a path out. The cloud environment and
the routine are the exception: they belong to phase 1b and come together,
when the human asks for them (see those sections). The wizard captures no
secrets and writes no `.env`, so the stages use `say`, `step`, `open_url`,
`pause` and `confirm`.

## Agent rules (`agent-rules`)

AGENTS.md is a guard file, so a human writes the rules (Q25).

- Open `https://github.com/<owner>/<repo>/edit/<default branch>/AGENTS.md`,
  or `.../new/<default branch>?filename=AGENTS.md` when the file is missing.
- Add a section "Rules for agents" covering the gaps the check named: one line
  that lists every guard file as backticked globs (always `.github/**`,
  `.claude/**`, `AGENTS.md` and `CLAUDE.md`, plus the repo's own), one line
  that bans `--no-verify`, and one line that requires new dependencies to have
  an exact version.
- Commit through a PR. Then press Enter.

## Guard files (paths the setup PR left out)

For each path `readiness.py guarded` held back: show the change setup wanted to
make (print the file content or a diff), and ask the human to make it on a
branch of their own.

## CI runs the tests (`ci-tests`)

`.github/**` is a guard file (Q18).

- Open `https://github.com/<owner>/<repo>/tree/<default branch>/.github/workflows`.
- In the workflow that runs on pull requests, add a step after the build
  that runs the repo's test command (print it: for example `pnpm test` from
  `package.json` `scripts.test`).
- Print what the tests need besides the command, read from the test config
  and the README: a database service, environment variables such as a test
  database URL, a build first. Show the job as YAML the human can paste, for
  example a `services: postgres:` block with the same image as the repo's
  `compose.yaml`, so the step passes on its first run.
- Commit through a PR, and confirm that the check runs on that PR.

## Claude GitHub App (`github-app`)

- Open `https://github.com/apps/claude/installations/new`.
- Choose the owner, then **Only select repositories** and add `<repo>`, or
  check that it is already listed. Save.
- Confirm. The next setup run sees the app on the check suites of the next
  commit.

## Cloud environment setup script (`playwright`)

Include it when a cloud run found `playwright` red with `fix: wizard`, or with
the routine stage, and before it. Leave it out while the repo has no
Playwright (`fix: issue`): the script has nothing to install until the
factory's first task adds it. The cloud image's Chromium matches only its own
global Playwright, so a repo that pins another version needs this script (see
[runtime.md](runtime.md)).

- Open `https://claude.ai/code`. In the environment selector under the
  message box, hover over the environment the factory uses and select its
  settings icon, or select **New environment**.
- Select **Setup script** and paste the script the wizard prints. It installs
  Chromium for the repo's locked Playwright version, and must exit 0 within
  about five minutes. For a pnpm repo:

  ```bash
  #!/bin/bash
  [ "$CLAUDE_CODE_REMOTE" = "true" ] || exit 0
  cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || true
  corepack enable || true
  pnpm install --frozen-lockfile || true
  pnpm exec playwright install chromium || true
  ```

- If **Network access** is not **Trusted**, add `cdn.playwright.dev`, where
  Chromium downloads from.
- Save with **Save changes**. Then start a cloud session on the repo and run
  `/factory-setup <owner>/<repo>` there. That run checks Playwright for real.

## The scheduled tasks

Q38: the factory runs unattended only after three issues have gone through
`/factory` by hand without the flow needing a fix. Include this stage when the
human says that point is reached (setup asks), and put a `confirm` gate first.
Each task runs as the human who creates it, on their subscription: use the
schedule from [capacity.md](capacity.md).

**The factory.**

- Open `https://claude.ai/code/routines` and select **New scheduled task**.
- **Repositories**: `<owner>/<repo>`, and `Bredvid/skills` as a second
  repository when the repo doesn't carry the factory's skills in its own
  `.claude/skills/`. **Environment**: the one with the setup script.
- **Prompt**: `/factory-dispatch`, the command alone. Each run starts one
  cloud session per issue the factory can move (and per due scan), up to
  `parallel` at once, so issues never share a container. The project's
  `docs/agents/factory.md` authorises the rest: pushing the factory's
  branches, opening and labelling PRs, commenting, and merging where `merge`
  is `agent`.
- **Trigger**: **Schedule**, at the interval from capacity.md. Optionally add
  a GitHub event **Issue**, action **labeled**, so a human's label starts a run
  at once; the run finds nothing to do for other labels and ends.
- Save.

**The review of every other PR.**

- A second scheduled task, on the same repositories and environment.
- **Prompt**: "/review-pr <owner>/<repo>".
- **Trigger**: GitHub event **Pull request**, actions **opened**,
  **synchronize** and **ready_for_review** (or every action, with the filter
  **Is draft** = false). `review-pr` skips the factory's own PRs (label
  `agent`), PRs a run holds (`agent:in-progress`) and heads it already
  reviewed, so duplicate events cost a few seconds each.
- Save.
