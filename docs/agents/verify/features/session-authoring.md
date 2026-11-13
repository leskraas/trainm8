# Session authoring

Creating and editing a Workout Session: the composer on I dag, and the full
Token Sentence editor behind it (ADR 0027, ADR 0088). Spec to copy from:
`tests/e2e/session-authoring.test.ts`. Proven by setup on 2026-11-07.

## Sub-features

- The composer: _Ny økt_ on the timeline's top line opens it on today (a drawer
  on a phone, the day pane on a large screen), with a sport, _Gjør grundigere_
  and _Åpne hele editoren_.
- The full editor at `/training/sessions/new?…&discipline=<sport>`: archetype
  seeds, then a stanza of tappable tokens (duration, intensity) edited in one
  shared popover.
- The session's detail page `/training/sessions/:id`, where a scheduled session
  is edited inline, and its log page `/training/sessions/:id/log`.
- A session copied from a Catalogue row (generated, placed from the Catalogue,
  or swapped) states its **Session Provenance** in one line at the end of the
  card's prose block (`[data-provenance]`, ADR 0117 §5): _Kilde: …_ for a corpus
  row, _Publisert av …_ with the non-vouch for a community row (and _Fjernet av
  en moderator_ once taken down), led by _Endret av deg ·_ when `adoptedAt` is
  set. A session with no Catalogue source shows no line. To see one, place a
  session from `/training/catalogue` (_Legg i kalenderen_).

## How to get to it

Log in, open `/season` (_Se hele sesongen_ from I dag), tap _Ny økt_ in the top
line, pick _Løping_, then _Gjør grundigere_, then _Åpne hele editoren_. Saving
with _Lag økta_ lands on `/training/sessions/<id>`.

## Driving it with Playwright

```js
await page.goto(`${BASE}/season`)
const create = page
	.getByTestId('timeline-top')
	.getByRole('button', { name: 'Ny økt' })
await hydrated(create)
await create.click()
const composer = page.locator('[data-composer]').filter({ visible: true })
await composer.getByRole('button', { name: 'Løping' }).click()
await composer.getByRole('button', { name: 'Gjør grundigere' }).click()
await composer.getByRole('link', { name: 'Åpne hele editoren' }).click()
await page.waitForURL(/\/training\/sessions\/new\?.*discipline=run/)
await page.locator('[data-seed="easy"]').click()
await page.getByLabel('Tittel').fill('Verify Easy Run')
await page.getByRole('button', { name: /min varighet/ }).click()
await page.locator('[data-slot="token-popover"] input').first().fill('40 min')
await page.keyboard.press('Escape')
await page.getByRole('button', { name: /40 min varighet/ }).waitFor()
await page.getByRole('button', { name: 'Lag økta' }).click()
await page.waitForURL(/\/training\/sessions\/[a-z0-9]+$/i)
```

Side effect: a `WorkoutSession` row with the id from the URL and
`status = 'scheduled'`. The title lives on the linked `Workout`, not on
`WorkoutSession`.

## Gotchas

- A new session opens empty on purpose: pick a seed (`[data-seed="easy"]`)
  before any token exists.
- While the token popover traps focus, everything outside it is `aria-hidden`:
  find those elements by attribute, not by role.
- `getByLabel('Duration')` matches both a classic field and token labels; use
  the token's accessible name (`/min varighet/`) or
  `input[name="blocks[0].steps[0].duration"]`.
- Live-region announcements are debounced about 350 ms: wait before reading
  `[role="status"]`.
- To edit inline, you need a scheduled session id:
  `select id from WorkoutSession where status='scheduled' limit 1`.
- A session whose Workout a Week Pattern day picked can still be deleted: the
  day holds the plan's own copy (ADR 0113), so the delete succeeds and the plan
  is unchanged. Before #665 it failed on `WeekPatternDay_kind_fields`.
