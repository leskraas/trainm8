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

- The stream scrolls in both directions and loads weeks as it goes: scroll the
  `timeline-stream` element itself to reach a week, or the rows are not rendered
  yet.
- No athlete-facing number may render as an unrounded float (`/\d+\.\d{4,}/`);
  check what you capture.
- What I dag shows depends on today's date against kody's seeded history and
  plan, so a journey that needs a session today should create one first (see
  `session-authoring.md`).
- Each week of the stream hydrates on its own, after the frame (ADR 0113): a
  week's controls answer once the week carries React's props. Wait with
  `untilHydrated` on the control before a tap that writes.
- The server renders this week and the next ahead only; the rest of the first
  chunk ahead mounts after hydration (ADR 0113). Wait for a week further ahead
  rather than reading it off the first HTML.
- How fast the full view opens on a long season is measured, not driven:
  `scripts/measure-home-stream.ts` (by URL, and `--nav` from _Se hele sesongen_)
  against a database prepared with `scripts/home-stream-fixture.ts`.
