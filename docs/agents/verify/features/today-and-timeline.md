# I dag and the Home Timeline

The athlete's landing page and the whole season as one bi-directional stream
(spec #558, ADR 0101). Specs to copy from: `tests/e2e/home-timeline.test.ts`,
`tests/e2e/home-reading-position.test.ts` (runs in WebKit too),
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
- The **Load Recompute Notice** above the stream on `/season`
  (`load-recompute-notice`): a kicker (`h2`), an optional movement line
  (_Kondisjonen steg/falt med opptil N — A → B på det meste_), the explanation
  and _Skjønner_, which dismisses that kind only. A notice with no CTL pair
  (ADR 0117) shows no movement line at all.
- The weather (#433, ADR 0115): with a Home Place set (_Meg_ › _Hjemsted_, see
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

- Only one-shot backfills write a Load Recompute Notice, so the seed has none.
  To see one, insert a `LoadRecomputeNotice` row for kody in QA's own database
  (`kind` `swim-rest-left-the-pace` or `strength-left-the-triad`; `ctlBefore`
  and `ctlAfter` both set or both NULL, a CHECK refuses one alone). The newest
  outstanding notice shows; after _Skjønner_ and a reload the next one does.
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
- Each week of the stream hydrates on its own, after the frame (ADR 0125): a
  week's controls answer once the week carries React's props. Wait with
  `untilHydrated` on the control before a tap that writes.
- The server renders this week and the next ahead only; the rest of the first
  chunk ahead mounts after hydration (ADR 0125). Wait for a week further ahead
  rather than reading it off the first HTML.
- Opened by URL, the list stays unpainted until the landing script has parked it
  on today (`landingHoldScript`, #503 criterion 5): a check of where today sits
  must read only frames where the stream is not `visibility: hidden`, and must
  watch every frame from the first, since a check made once the document is
  parsed cannot see a jump. Serving the document slowly (CDP
  `Network.emulateNetworkConditions`) makes the parser yield where it would on a
  phone.
- Whether a row moved (criterion 7) is judged in painted frames: read it after a
  frame (`requestAnimationFrame`, then a task), never straight after writing
  `scrollTop`. Weeks just scrolled into view still carry their
  `content-visibility` estimate in a layout read before the next frame, and a
  row measured there "moves" by the estimate's error (2px) in a frame the reader
  never saw. Scroll in small steps and count your own scrolling against the row,
  as `home-reading-position.test.ts` does.
- How fast the full view opens on a long season is measured, not driven:
  `scripts/measure-home-stream.ts` (by URL, and `--nav` from _Se hele sesongen_)
  against a database prepared with `scripts/home-stream-fixture.ts`.
