# Verifying a change in the running app

How QA starts trainm8, drives it the way an athlete does, and captures evidence.
It is written for an agent that has never seen the app. The repo's
`.claude/skills/verify/SKILL.md` covers the same ground for an interactive
session; this guide adds an isolated instance, a doctor check, evidence and
cleanup. The feature map is in [`features/`](features/).

- **Surface:** a web UI (React Router + Express, an installable PWA), in
  Norwegian. Also: the MCP endpoint `/mcp` (see
  [`../mcp-dev.md`](../mcp-dev.md)) and webhooks (`/webhook/strava`). This guide
  drives the web UI.
- **Run:** `npm run dev` (`MOCKS=true`, so Strava, GitHub, Resend and
  Intervals.icu calls are mocked by MSW in `tests/mocks/`).
- **Drive:** Playwright, the repo's own `@playwright/test` (pinned 1.56.1).
- **Observe:** screenshots, the server log, and rows in the SQLite database.

All commands below run from the repo root.

## Isolate

QA runs its own instance and never drives someone's dev server. The server reads
`PORT`, `DATABASE_URL`, `DATABASE_PATH` and `CACHE_DATABASE_PATH` from the
environment, and `dotenv` does not override variables that are already set. So
QA's instance is a port of its own plus a database outside the repo:

```bash
export VERIFY_DIR="${VERIFY_DIR:-/tmp/trainm8-verify}"
export VERIFY_EVIDENCE_DIR="${VERIFY_EVIDENCE_DIR:-$VERIFY_DIR/evidence}"
export PORT="${PORT:-3100}"
export DATABASE_URL="file:$VERIFY_DIR/db/data.db?connection_limit=1"
export DATABASE_PATH="$VERIFY_DIR/db/data.db"
export CACHE_DATABASE_PATH="$VERIFY_DIR/db/cache.db"
export BASE_URL="http://localhost:$PORT"
```

This runs next to a normal dev instance on port 3000 with `prisma/data.db`, and
neither touches the other. One caveat: in development the server falls back to
the next free port if `PORT` is taken (`server/index.ts`, `getPort`). Read the
real port from the `Local:` line of the log (see Launch) instead of assuming it.

## Launch

From an empty data dir. This is the local dev database only: never run
`prisma db seed` against production (see
[`../production-seed-data.md`](../production-seed-data.md)).

```bash
[ -f .env ] || cp .env.example .env   # dev secrets and MOCK_ keys; git-ignored
npm ci                                # if node_modules is missing
rm -rf "$VERIFY_DIR/db" && mkdir -p "$VERIFY_DIR/db" "$VERIFY_EVIDENCE_DIR"
npx prisma migrate deploy             # "All migrations have been successfully applied."
npx prisma generate --sql
npx prisma db seed                    # kody's real training data, about 7 s
nohup npm run dev > "$VERIFY_DIR/server.log" 2>&1 &
```

The app is ready when the login form renders, not when a process answers. The
first request pays Vite's cold transform, about 30 s:

```bash
for i in $(seq 1 60); do
  curl -sf -o /dev/null "$BASE_URL/login" && break; sleep 2
done
grep -m1 'Local:' "$VERIFY_DIR/server.log"   # Local: http://localhost:3100
```

Then, in the browser, wait for the form controls to hydrate (see Drive).
Stopping is under Cleanup.

## Doctor

A read-only check that the running instance is worth driving:

```bash
lsof -nP -iTCP:"$PORT" -sTCP:LISTEN     # one node process listens on our port
grep -m1 'Local:' "$VERIFY_DIR/server.log"
git rev-parse --short HEAD; git branch --show-current; git status --short
ls "$VERIFY_DIR/db/data.db"             # our database, outside the repo
curl -s -o /dev/null -w '%{http_code}\n' "$BASE_URL/login"   # 200
```

The dev server serves the working tree, so the branch, commit and `git status`
above are the build under test. If the port's listener isn't the process you
started, stop and pick another `PORT`.

## Drive

Use the repo's own Playwright. In a cloud session its pinned version has no
matching Chromium: either launch the image's Chromium with
`executablePath: '/opt/pw-browsers/chromium'` (below), or run
`npx playwright install chromium` once and drop that option. Do not run
`playwright install --with-deps`.

A script kept outside the repo resolves Playwright from it:

```js
import { createRequire } from 'node:module'
const require = createRequire('/path/to/trainm8/package.json')
const { chromium } = require('@playwright/test')

const BASE = process.env.BASE_URL ?? 'http://localhost:3100'
const OUT = process.env.VERIFY_EVIDENCE_DIR ?? '/tmp/trainm8-verify/evidence'
const browser = await chromium.launch({
	executablePath: '/opt/pw-browsers/chromium',
})
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })

// A control works only once React has hydrated it (tests/playwright-utils.ts).
async function hydrated(locator) {
	for (let i = 0; i < 60; i++) {
		if (
			await locator.evaluate((el) =>
				Object.keys(el).some((k) => k.startsWith('__reactProps$')),
			)
		)
			return
		await page.waitForTimeout(250)
	}
	throw new Error('not hydrated')
}

await page.goto(`${BASE}/login`)
await hydrated(page.getByLabel('Username'))
await page.getByLabel('Username').fill('kody')
await page.getByLabel('Password').fill('kodylovesyou')
await page.getByRole('button', { name: /log in/i }).click()
await page.waitForURL((u) => !u.pathname.startsWith('/login'))
```

Run it with `NODE_PATH= node drive.mjs`. The empty `NODE_PATH` keeps the cloud
image's global Playwright out of the way.

- **Login:** `kody` / `kodylovesyou`, the seeded athlete with real history.
- **Tabs:** `getByRole('navigation', { name: 'Hovedmeny' })` holds the links _I
  dag_ (`/`), _Plan_ (`/training/plan`) and _Meg_ (`/me`)
  (`app/utils/app-tabs.ts`).
- **Handles:** prefer roles and the Norwegian labels, `data-testid`
  (`timeline-top`, `timeline-stream`), and the editor's data attributes
  (`[data-composer]`, `[data-token-sentence-editor]`, `[data-seed="easy"]`,
  `[data-slot="token-popover"]`).
- **Phone and desktop:** the app is a PWA. Check `390×844` as well as a desktop
  viewport. For reduced motion, pass `reducedMotion: 'reduce'` to
  `browser.newContext`.
- The dev server never goes network-idle (HMR socket): wait for selectors, never
  `networkidle`.
- The repo's e2e specs in `tests/e2e/` are the best recipe book: each feature
  file names the spec to copy from.

## Evidence

Everything goes to `$VERIFY_EVIDENCE_DIR` (default
`/tmp/trainm8-verify/evidence`), outside the repo.

- Use the real user path: log in through the form and click through the UI. No
  test-only endpoints, no `prisma` writes to set state up, and no
  `tests/playwright-utils.ts` `login()` fixture, which inserts a user directly.
- Capture the action and the state after it: a screenshot before the decisive
  click and one of the result, numbered in order (`01-…png`, `02-…png`).
- Check side effects as well as the screen: the row the action wrote, read from
  `$DATABASE_PATH`, for example
  `python3 -c "import sqlite3; print(sqlite3.connect('$DATABASE_PATH').execute(\"select id, status from WorkoutSession where id='<id from the URL>'\").fetchall())"`,
  and anything unusual in `$VERIFY_DIR/server.log`.
- Collect `pageerror` events and report any.
- Mocks are fine only where production talks to an outside system (Strava,
  Intervals.icu, Resend, GitHub): `MOCKS=true` already does that.

## Cleanup

Stop the process that owns the port's listener. Never stop by name
(`pkill node`), and don't rely on `$!`, which is the `npm` wrapper:

```bash
kill "$(lsof -nP -t -iTCP:"$PORT" -sTCP:LISTEN)"
sleep 2; lsof -nP -iTCP:"$PORT" -sTCP:LISTEN || echo "port $PORT free"
rm -rf "$VERIFY_DIR/db"            # QA's database; the evidence stays
ls "$VERIFY_EVIDENCE_DIR"          # the screenshots are still there
```

Stopping the listener also ends the `npm run dev` wrapper. Leave `.env` alone:
it is git-ignored and other runs reuse it.
