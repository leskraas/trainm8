# Plan: season plan, events and Bibliotek

The _Plan_ tab: the season plan, the events it builds toward, plan creation and
generation, and Bibliotek (catalogue, programs, exercises). Specs to copy from:
`tests/e2e/plan-authoring.test.ts`, `tests/e2e/plan-generate.test.ts`,
`tests/e2e/season-edits.test.ts`, `tests/e2e/tab-bar.test.ts`,
`tests/e2e/strength-screens.test.ts`.

## Sub-features

- The season plan at `/training/plan`, with its closed _Avansert_ section
  holding the season editors (ADR 0101 §2).
- Plan creation at `/training/plan/new`: a dated goal (_Mål_, _Dato_, _Lag målet
  og gå videre_), then _Legg opp sesongen_ (base, units, start volume).
- Events: the region _Løp og arrangementer_, _Alle løp_ (`/training/events`),
  `/training/events/new`, `/training/events/:id`.
- An Event's result (#670, ADR 0112): on a run-only _Løp_ or _Testløp_, the
  form's _Distanse_ pills (`1500 m` … `Maraton`, _Annen_ with _Distanse i km_).
  On a done Event, the _Resultat_ section shows the watch's time, pace and _Målt
  av klokka_ with the platform's credit, or says why there is none (_Hvor langt
  var løpet?_, _Klokka målte … men løpet er …_, _Venter på klokka_) with _Lagre
  distansen_ / _Endre distansen_. The result also shows on _Løpsresultater_
  (`/settings/training/resultater`) with the Event's name as a link and no
  _Slett_.
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
const events = page.getByRole('region', { name: 'Løp og arrangementer' })
await events.getByRole('link', { name: 'Alle løp' }).click()
// creating a season from a goal (a user without one lands on /training/plan/new):
await page.getByRole('textbox', { name: 'Mål' }).fill('Verify 10K')
await page.getByLabel('Dato', { exact: true }).fill('2027-05-01')
await page.getByRole('button', { name: /lag målet og gå videre/i }).click()
await page.getByRole('heading', { name: 'Legg opp sesongen' }).waitFor()
```

An Event's result needs a done run Event whose result session holds a run
Recording within ±5 % of its distance. Seed it rather than drive it: create the
Event on `/training/events/new` (Løp, Løping, _10 km_), upload a run file on
`/imports/upload` dated the Event's day, then _Bruk som resultat_ on the Event's
page.

```js
await page.goto(`${BASE}/training/events/new`)
await page.getByRole('radio', { name: 'Løp' }).check()
await page.getByRole('checkbox', { name: 'Løping' }).click()
await page.getByRole('button', { name: '10 km' }).click()
// on a done Event with no distance:
await page.getByText('Hvor langt var løpet?').waitFor()
await page.getByRole('button', { name: 'Halvmaraton' }).click()
await page.getByRole('button', { name: 'Lagre distansen' }).click()
```

## Gotchas

- The first tap after a load can race hydration: wait for the link to hydrate,
  or retry the click until the URL changes, as the spec does.
- The e2e spec creates a fresh user with no season. kody's seed may already have
  one, so `Plan` may land on the plan rather than on creation; check the URL
  before you drive creation.
- Season editors are inside _Avansert_, closed by default: open it with one tap
  on its heading (`openPlanAdvanced` in `tests/playwright-utils.ts`).
- The _Distanse_ row shows only for _Løp_ or _Testløp_ with exactly _Løping_
  ticked; it opens with `motion-collapse`, so wait for the pills before you tap.
