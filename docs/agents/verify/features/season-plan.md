# Plan: season plan, events and Bibliotek

The _Plan_ tab: the season plan, the events it builds toward, plan creation and
generation, and Bibliotek (catalogue, programs, exercises). Specs to copy from:
`tests/e2e/plan-authoring.test.ts`, `tests/e2e/plan-generate.test.ts`,
`tests/e2e/season-edits.test.ts`, `tests/e2e/tab-bar.test.ts`,
`tests/e2e/strength-screens.test.ts`.

## Sub-features

- The season plan at `/training/plan`, with its closed _Avansert_ section
  holding the season editors (ADR 0101 §2).
- _Ukevolum_ in the lead (#673): one row per endurance track with a Season
  Anchor, and _Endre volumet_, which opens _Endre startnivået_ (the
  `season-anchor` Sesong edit, ADR 0112) inside _Avansert_, scrolled to it:
  three acts (_Start på nytt fra en uke_, _Endre tallet i et startnivå_, _Fjern
  et nytt startnivå_), a preview, a confirm in a sticky footer.
- Plan creation at `/training/plan/new`: a dated goal (_Mål_, _Dato_, _Lag målet
  og gå videre_), then _Legg opp sesongen_ (base, units, start volume).
- Events: the region _Løp og arrangementer_, _Alle løp_ (`/training/events`),
  `/training/events/new`, `/training/events/:id`.
- Plan generation from an event: `/training/plan/generate/:eventId` (uses the
  deterministic stub model client when `ANTHROPIC_API_KEY` is empty).
- Bibliotek, the region _Bibliotek_: catalogue (`/training/catalogue`), programs
  (`/training/programs`), exercises (`/library/exercises`).

## How to get to it

Log in, then the _Plan_ link in `navigation` _Hovedmeny_. A user with no season
lands on `/training/plan/new`; one with a season lands on `/training/plan`.

## Driving it with Playwright

```js
const tabs = page.getByRole('navigation', { name: 'Hovedmeny' })
await hydrated(tabs.getByRole('link', { name: 'Plan' }))
await tabs.getByRole('link', { name: 'Plan' }).click()
await page.getByRole('heading', { name: 'Plan', level: 1 }).waitFor()
// changing a track's volume from the lead (#673):
await page.locator('[data-plan-lead-volume-row="run"] a').click()
const anchor = page.getByRole('form', { name: 'Endre startnivået' })
await anchor.getByRole('button', { name: 'Vis forhåndsvisning' }).click()
await page.locator('[data-season-edit-preview]').waitFor()
const events = page.getByRole('region', { name: 'Løp og arrangementer' })
await events.getByRole('link', { name: 'Alle løp' }).click()
// creating a season from a goal (a user without one lands on /training/plan/new):
await page.getByRole('textbox', { name: 'Mål' }).fill('Verify 10K')
await page.getByLabel('Dato', { exact: true }).fill('2027-05-01')
await page.getByRole('button', { name: /lag målet og gå videre/i }).click()
await page.getByRole('heading', { name: 'Legg opp sesongen' }).waitFor()
```

## Gotchas

- The first tap after a load can race hydration: wait for the link to hydrate,
  or retry the click until the URL changes, as the spec does.
- The e2e spec creates a fresh user with no season. kody's seed may already have
  one, so `Plan` may land on the plan rather than on creation; check the URL
  before you drive creation.
- Season editors are inside _Avansert_, closed by default: open it with one tap
  on its heading (`openPlanAdvanced` in `tests/playwright-utils.ts`).
- _Endre startnivået_ writes when confirmed: kody's run track gains a segment.
  Reset it between runs (delete the `SeasonAnchorSegment` row on the first
  unbegun week) or the edit opens on _Endre tallet_ instead of a fresh start.
- Each act's fields are all in the form; the inactive acts' are `hidden`, so
  fill `input[name="addValue"]` only while _Start på nytt_ is the chosen act.
