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
```

## Why these values

- **Autonomy `full`, merge `agent`**: a solo project; the factory decides,
  merges, and logs its decisions in the `Factory log` issue.
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
- **`design: prototype`**: the `/design` probe was not run (cloud session); this
  is the default from `factory-setup`'s runtime findings.
