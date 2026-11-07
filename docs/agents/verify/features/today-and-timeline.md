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
- The **Load Recompute Notice** above the stream on `/season`
  (`load-recompute-notice`): a kicker (`h2`), an optional movement line
  (_Kondisjonen steg/falt med opptil N — A → B på det meste_), the explanation
  and _Skjønner_, which dismisses that kind only. A notice with no CTL pair
  (ADR 0112) shows no movement line at all.

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
- The stream scrolls in both directions and loads weeks as it goes: scroll the
  `timeline-stream` element itself to reach a week, or the rows are not rendered
  yet.
- No athlete-facing number may render as an unrounded float (`/\d+\.\d{4,}/`);
  check what you capture.
- What I dag shows depends on today's date against kody's seeded history and
  plan, so a journey that needs a session today should create one first (see
  `session-authoring.md`).
