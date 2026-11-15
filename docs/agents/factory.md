# Factory

Settings for `/factory` (the `bredvid-factory` plugin from
[Bredvid/skills](https://github.com/Bredvid/skills)), written by
`/factory-setup`. The factory reads the fenced `factory` block below; the keys
are described in the `factory` skill's `references/config.md`, and
`conductor.py config leskraas/trainm8` prints the block as the factory reads it,
with defaults filled in.

How QA starts and drives the app lives next to this file, in
[`verify/`](verify/README.md).

```factory
tracker: github
autonomy: full
phase: poc
prod-urls: trainm8.no, trainm8-085d.fly.dev
merge: agent
merge-method: merge
budget: 6000000
parallel: 10
build-parallel: 6
serial: qa, design-scan
human-paths: .github/, .claude/, CLAUDE.md, fly.toml, other/
human-edits: eslint.config.js, tsconfig.json, playwright.config.ts
scan-every: 10
scans: architecture, design, retro
design: prototype
po: leskraas
dev: leskraas
fallback: leskraas
start: npm run dev
check: npm run lint && npm run typecheck && npx vitest run
regenerate: npx prisma generate --sql
schedule: none
models: update-branch=sonnet, qa=sonnet, design-scan=sonnet, *=opus
effort: update-branch=medium, qa=medium, implement=medium, review-fix=medium, *=high
```

## Focus: the App Lab only (ADR 0125)

From 2026-11-15 the factory works **only** on the App Lab until the owner picks
a direction (`GOAL.md`, "Right now"). For every task and scan:

- **Scope.** Work lives in `app/lab/**` and `app/routes/lab/**`, plus new
  actions under `app/actions/` when a Lab App needs a write that doesn't exist.
  The classic app (`/`, `/training`, `/settings`, ...) gets a change only when
  it is broken or a Lab App needs a shared action.
- **Issues.** Lab work is labelled `lab` plus `lab:<key>` (`lab:brev`,
  `lab:prat`, `lab:sti`, `lab:tommel`, `lab:hovedbok`, or `lab:ny` for a
  new app). Older `agent:*` issues on the classic app were moved to `parked`
  with a comment naming their label; leave them parked. A spec for an issue
  without a `lab` label stops with `agent:needs-human` and the question "Is this
  App Lab work?".
- **Scans.** The design scan audits the Lab Apps (each against its own idea in
  `app/lab/variants.ts`, never against the classic design system), and files
  `lab:<key>` proposals. The architecture scan looks only at `app/lab/**`,
  `app/routes/lab/**` and the actions they read. The retro asks whether a Lab
  App should be deleted or a new one tried.
- **Bold.** Each Lab App is an experiment in a whole different journey; a change
  that makes one app look more like another, or like Klassisk, is the wrong
  change. Proposals for a new app must differ in journey, not only in look.
- **Honest.** Every number a Lab App shows comes from the Lab Snapshot or a
  typed action; a null is shown as missing. Demo data is labelled as such.
- **One axis each** (from the `prototype-ui` skill). Every app in
  `app/lab/variants.ts` names the `axis` it diverges on, `winsWhen` and `costs`.
  A new app must take a position on an axis no other app holds; two apps that
  would differ only in look are one app. Keep the set at six or fewer, Klassisk
  included: more dilutes the comparison.
- **The owner's three words.** An issue or comment from the owner saying
  - `riff <key>`: start a new round around that app: spec two or three new apps
    that keep what the owner liked in it and diverge from it on other axes, and
    propose deleting the apps the owner has stopped opening;
  - `drop <key>`: delete that app (its routes and registry entry), after pushing
    it to the branch `lab-archive/<key>` and linking that branch on the issue,
    so the experiment is kept as a primary source but not on `main`;
  - `keep <key>`: the direction is chosen. Write the ADR that makes it the app,
    then specs that move it to `/` and delete every other Lab App (each archived
    as above) and the switch. The parked issues are re-triaged against it.
- **The switch is chrome, not a contestant.** `app/lab/lab-switcher.tsx` looks
  the same in every app and is never restyled to fit one; switching apps never
  animates.

## Why these values

- **Autonomy `full`, merge `agent`**: a solo project; the factory decides,
  merges, and logs its decisions in the `Factory log` issue.
- **Phase `poc`: quick and bold.** The factory builds the quickest thing that
  proves each idea, writes every shortcut as a `Debt:` line, and routes around
  blocks with stand-ins. No door the conductor finds in a diff (a migration, a
  new dependency, a changed ADR) holds a merge in this phase; the files in
  `human-paths` and `human-edits` still wait for leskraas. Move to `build`, or
  `live` once people outside the project use trainm8.no, when the retro proposes
  it.
- **The guard hook** (`.claude/hooks/factory-guard.py`, run from
  `.claude/settings.json`) makes the agent rules a check in every phase: no
  `.env*`, no `--no-verify`, no force push, no `npx` fetch without an exact
  version (an installed `npx vitest` runs), and nothing against `prod-urls`. It
  reads a whole Bash line, so a commit message or PR body naming a production
  host is blocked too: pass it with `-F`/`--body-file`. Making `.env` from
  `.env.example` passes; reading it does not. The `fly` and `flyctl` CLIs are
  denied in `.claude/settings.json` (`permissions.deny`), since they reach
  production without a URL. Update the guard with the skills.
- **Migrations in `poc`**: `deploy.yml` deploys `main`, and LiteFS runs
  `prisma migrate deploy` on production, so in `poc` a migration the factory
  merges reaches trainm8.no with nobody seeing it, a destructive one included.
  The owner chose this (yolo). Move to `live` once real users' data is there:
  then a migration that loses data waits at every autonomy level.
- **Capacity**: above the Team premium row (3/2), raised to `parallel: 10`,
  `build-parallel: 6` on 2026-11-07 at the owner's request to spend the week's
  remaining quota before it resets. Runs are started by hand or by
  `/factory-dispatch`, not by a schedule. Bredvid/tavla spent a five-hour limit
  in 2.5 hours at fifteen parallel sessions; lower it again if runs stop on a
  usage limit.
- **`serial: qa, design-scan`**: QA's instance runs beside a dev server on its
  own port and database ([`verify/`](verify/README.md#isolate)), but every run
  shares the same defaults (`PORT=3100`, `/tmp/trainm8-verify`), so only one QA
  run or design scan drives the app at a time.
- **`human-paths`**: CI (`.github/`), the agents' own rules (`CLAUDE.md`,
  `.claude/`), and deploy infrastructure (`fly.toml`, `other/` with the
  Dockerfile and LiteFS config). A PR touching these waits for a human at the
  merge even under `full`.
- **`human-edits`**: lint, type and e2e config: a new file merges, an edit to an
  existing one waits.
- **`schedule: none`**: no scheduled task until three issues have gone through
  `/factory` by hand without the flow needing a fix. Rerun `/factory-setup` then
  to add it.
- **`models` and `effort`** (factory 3.6): the retro of the factory on
  Bredvid/tavla (7 November 2026) found that a third of the tokens went to
  mechanical work. `update-branch`, `qa` and the design scan run on Sonnet;
  everything else (explore, spec, design, architecture, implement, both parts of
  review, and the other scans) on Opus, where a mistake costs the most. Effort
  is medium for `update-branch`, QA, implement and the review's fix, high
  elsewhere. `*=opus` stays named, so a `/factory` started on Sonnet still gives
  the judging tasks Opus. Move QA back to Opus if more bugs reach `main` after
  its merges.
- **`design: prototype`**: the `/design` probe was not run (cloud session); this
  is the default from `factory-setup`'s runtime findings.
