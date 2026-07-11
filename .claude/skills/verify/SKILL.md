---
name: verify
description: 'Build, run, and drive this Epic Stack app to verify a change at its surface: dev server with mocks, seeded login, Playwright driving.'
---

# Verifying trainm8 changes in the running app

## Setup (once per fresh environment)

```bash
cp .env.example .env            # SESSION_SECRET etc.
npm install
npx prisma migrate deploy
npx prisma db seed              # kody's real training data, ~6 s
```

## Launch

```bash
npm run dev                     # MOCKS=true, http://localhost:3000
```

The dev server never goes network-idle (HMR socket) — wait for
selectors, not `networkidle`.

## Drive (Playwright)

Chromium is pre-installed; do NOT `playwright install`:

```js
import { chromium } from '/path/to/repo/node_modules/playwright/index.mjs'
const browser = await chromium.launch({
	executablePath: '/opt/pw-browsers/chromium',
})
```

- **Login:** username `kody`, password `kodylovesyou`.
- **Editor surfaces:** `/training/sessions/new` (create) and
  `/training/sessions/:id` for a scheduled session (inline edit).
  Find a scheduled id:
  `python3 -c "import sqlite3;print(sqlite3.connect('prisma/data.db').execute(\"select id from WorkoutSession where status='scheduled' limit 1\").fetchone())"`
- **Token Sentence editor:** tokens are buttons with
  `data-token-editor` marks; the shared popover is
  `[data-slot="token-popover"]`. While it traps focus, outside
  elements are aria-hidden — locate them by attribute, not role.
- Touch pass: viewport `390×844`; reduced motion:
  `reducedMotion: 'reduce'` on the context.

## Gotchas

- `getByLabel('Duration')` is ambiguous (classic field + token
  aria-labels): use `input[name="blocks[0].steps[0].duration"]`.
- Live-region announcements debounce ~350 ms — wait before reading
  `[role="status"]`.
