# Verification guide

How QA starts the app, drives it the way a user does, and captures evidence
(Q43). Setup writes it once per repo, in `docs/agents/verify/`, and the
developer keeps its feature map current. It is written for an agent that has
never seen the app and reads it cold, mid-task.

Adapted from `create-verification-skill` and `maintain-verification-skill` in
pstack ([cursor/plugins](https://github.com/cursor/plugins/tree/main/pstack),
MIT, © 2026 Lauren Tan). It lives under `docs/agents/` rather than as a skill
in `.claude/skills/`, because `.claude/**` is a guard file.

## 1. Learn the app from the repo

Answer these from the code, and ask the human only what you can't observe:

- **Surface**: what a user touches: a web UI, a CLI, an API. Pick the main one and name the rest.
- **Run**: the repo's own dev command (package scripts, Makefile, README), with ports, env vars, seed data and auth.
- **Drive**: the repo's Playwright setup and existing specs first. Only then a generic recipe: Playwright for web, a PTY for a CLI, plain HTTP for an API. A repo without Playwright gets none from setup (new dependencies need a human or the factory's first task): drive with one pinned outside the repo, such as the cloud image's global copy with `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`, and say in the guide that the repo's own replaces it.
- **Observe**: screenshots, terminal output, response bodies, logs, exit codes, database state.
- **Isolate**: whether two instances can run side by side (ports, data dirs). When the dev command uses fixed ports or a shared database volume, build QA's own instance from the repo's own overrides (env vars for ports and database URL, a separately named container) and prove it runs beside a normal dev instance. If no override exists, say so: refusing to drive a shared instance beats corrupting it.

If the checkout doesn't build or start as it is, report exactly what fails and stop. A guide written against a broken base teaches wrong steps.

## 2. Write `docs/agents/verify/README.md`

Every section holds what you found in this repo, with no placeholders left:

- **Launch**: the exact command, from an empty data dir with migrations and seed data, and how to tell the app is ready to use, not just that a process answers. Then how to stop it.
- **Doctor**: one read-only check that the running instance is worth driving: process up, the right build (for a dev server that serves the working tree: the branch, commit and `git status`), the port is ours.
- **Drive**: the recipe with real selectors and routes from this repo. Prefer stable handles (roles, labels, `data-testid`, routes) over coordinates.
- **Evidence**: what to capture and where: a directory outside the repo, set by one env var with a default, so the guide has no placeholder. The proof standard: use the real user path, never test-only endpoints or internal setters; capture the action and the state after it, not only the last screen; check side effects (rows written, requests sent) as well as the screen; mock only where production already isolates the external system.
- **Budgets** (`## Budgets`): the qualities QA measures on every run
  (`factory`'s `references/qualities.md`, "Budgets"), each with the command
  that measures it and its limit. For a web UI, start with data requests per
  navigation (a Playwright walk of the main flow there and back that counts
  `page.on('request')` to the app's data endpoints, the return within the
  cache window), axe findings (`serious` and `critical`) and console errors.
  Add bundle size or queries per request when the repo can measure them.
  Set each limit from what the app does today, and say which limits that
  makes, so a bad number is not taken as the target.
- **Cleanup**: stop what you started, never by process name. A dev command that starts a process tree (pnpm, npm scripts) doesn't pass signals on from `$!`, so record the pid of the process that owns the port's listener, or its launcher, and stop that. Cleanup removes instances and scratch state, never the evidence.

## 3. Seed the feature map

Write `docs/agents/verify/features/<feature>.md`, in the language of the repo's docs, for the three to five main user-facing features you can find in routes, menus and docs. Each file answers, from the user's side:

- `## Sub-features` (keep these four headings in English, so QA finds them in any repo)
- `## How to get to it`
- `## Driving it with Playwright` (or the harness the repo uses)
- `## Gotchas`: a precondition the seed data lacks goes here, as the reason the journey fails. Never weaken a journey to make it pass.

## 4. Prove it before the PR

Run the guide end to end once: launch, doctor, drive one mapped feature, measure every budget, capture evidence, clean up. Check the evidence still exists after cleanup. Fix what fails, and run cleanup after each failed try. Put the commands and what they printed in the setup PR body, and publish the screenshots as an artifact the PR links to (Q44). A guide nobody ran is a draft.

In a cloud session, Docker needs two steps first: start the daemon (`nohup dockerd >/tmp/dockerd.log 2>&1 &`), and pull images from a mirror when Docker Hub answers `429 Too Many Requests` (`docker pull mirror.gcr.io/library/<image>` and `docker tag` it to the name the repo uses). Put both in the guide's launch section when the repo needs Docker.

## Keeping it current

The developer adds or updates a feature file in the same PR when an issue adds or changes a user-facing feature. QA names any criterion it had to drive without a feature file, so the next round can add one.
