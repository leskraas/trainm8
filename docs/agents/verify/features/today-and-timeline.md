# I dag and the Home Timeline

The athlete's landing page and the whole season as one bi-directional stream
(spec #558, ADR 0101). Specs to copy from: `tests/e2e/home-timeline.test.ts`,
`tests/e2e/dashboard.test.ts`, `tests/e2e/writing-line.test.ts`,
`tests/e2e/mobile-dashboard.test.ts`.

## Sub-features

- I dag at `/`: today's calm view, the session(s) for today and the _Juster_
  chips.
- The full Home Timeline at `/season`: the top line (`timeline-top`), the stream
  of weeks and sessions (`timeline-stream`) with today's marker
  (`[data-timeline-today]`, `[data-today-pill]`), and the writing line.
- Marking a session done (_Merk <tittel> som gjort_) and answering an import's
  question (_Hva var dette?_).
- The weather (#433, ADR 0114): with a Home Place set (_Meg_ › _Hjemsted_, see
  `me-settings-and-imports.md`), one weather line on the today card
  (`[data-calm-weather]`), a weather column on this week's rows from tomorrow on
  (`[data-calm-day-weather]`) and _Værvarsel fra MET Norway_ under the week.
  Without a Home Place none of it renders.

## How to get to it

Log in; the _I dag_ tab (`/`) is where login lands. _Se hele sesongen_ on I dag
opens `/season`; the tab bar keeps _I dag_ current there.

## Driving it with Playwright

```js
await page.goto(`${BASE}/season`)
const stream = page.getByTestId('timeline-stream')
await stream.waitFor()
await page.locator('[data-timeline-today]').waitFor()
await stream.getByText('Verify Easy Run').first().waitFor() // a session you created
const tabs = page.getByRole('navigation', { name: 'Hovedmeny' })
await tabs.getByRole('link', { name: 'I dag' }).click()
```

## Gotchas

- The weather comes from MET Norway, called by the server. Start the server with
  `MOCK_WEATHER=true` for the mock's fixed pattern
  (`tests/mocks/ met-norway.ts`, from the current hour); without it the real MET
  answers. It is cached per rounded point in `$CACHE_DATABASE_PATH`, so a fresh
  cache database is a fresh forecast.
- The weather column is hidden below a 20rem row (a 320px phone, or 200% text):
  the weather then sits in the stacked day line
  (`[data-calm-day-weather-inline]`). Check both widths.

- The stream scrolls in both directions and loads weeks as it goes: scroll the
  `timeline-stream` element itself to reach a week, or the rows are not rendered
  yet.
- No athlete-facing number may render as an unrounded float (`/\d+\.\d{4,}/`);
  check what you capture.
- What I dag shows depends on today's date against kody's seeded history and
  plan, so a journey that needs a session today should create one first (see
  `session-authoring.md`).
