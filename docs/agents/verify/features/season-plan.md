# Plan: season plan, events and Bibliotek

The _Plan_ tab: the season plan, the events it builds toward, plan creation and
generation, and Bibliotek (catalogue, programs, exercises). Specs to copy from:
`tests/e2e/plan-authoring.test.ts`, `tests/e2e/plan-generate.test.ts`,
`tests/e2e/season-edits.test.ts`, `tests/e2e/tab-bar.test.ts`,
`tests/e2e/strength-screens.test.ts`.

## Sub-features

- The season plan at `/training/plan`, with its closed _Avansert_ section
  holding the season editors (ADR 0101 §2). Its Week Pattern editor: a day picks
  the Workout of one of the athlete's own sessions (fixed) or a shape for a
  share day (_formet etter <tittel>_).
- The plan's **Guard Notices** (Ramp Guard, availability fit, band fit) in
  _Plan_'s lead, under the card and before _Bibliotek_, as `role="note"`
  notices in `[data-plan-guards]`, each closable by its button _Lukk merknaden
  om …_ (ADR 0118). None renders inside _Avansert_.
- Plan creation at `/training/plan/new`: a dated goal (_Mål_, _Dato_, _Lag målet
  og gå videre_), then _Legg opp sesongen_ (base, units, start volume).
- Events: the region _Løp og arrangementer_, _Alle løp_ (`/training/events`),
  `/training/events/new`, `/training/events/:id`.
- Plan generation from an event: `/training/plan/generate/:eventId` (uses the
  deterministic stub model client when `ANTHROPIC_API_KEY` is empty). With a
  **Weekly Capacity** set on the Athlete Profile, the preview states **Placed
  Hours** (ADR 0116): a week whose placed sessions alone take longer than the
  capacity carries an amber line on its card (`[data-placed="over"]`,
  `Øktene alene tar minst ≈ 7,5 t, kapasiteten din er 6 t/uke.`), a line under
  _Sesongen_ names the weeks (`[data-placed="season"]`), and the closed _N uker
  til_ row names the hidden ones (`[data-placed="remaining"]`). To see it, set
  kody's `weeklyCapacityHours` a little under a week's placed hours (a 20-week
  10 km run season with a 4:30/km threshold reads about 3,9 t a week, so 3,8
  shows a mix) and open the preview.
- The preview's placed rows (ADR 0121, #475): each is one button
  (`[data-session-row] > button`, `aria-expanded`) that carries the plan and no
  provenance line. Tapping it opens its **Session Provenance** in a panel below
  it (`[data-provenance-panel]`): _Kilde: …_ with a locator link for a corpus
  row, or the convention or hand-written notice. One panel is open across the
  season; a second tap, Escape or opening another row closes it. Unfilled rows
  are not buttons. Needs the corpus: `prisma db seed` on a fresh local database,
  or every slot reads as unfilled.
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

## Gotchas

- The first tap after a load can race hydration: wait for the link to hydrate,
  or retry the click until the URL changes, as the spec does.
- The e2e spec creates a fresh user with no season. kody's seed may already have
  one, so `Plan` may land on the plan rather than on creation; check the URL
  before you drive creation.
- A plan with no warnings shows no Guard Notice at all. To see them, author a
  ramp over +8 %, few trainable weekdays, or a strength session outside its
  block's band; `tests/e2e/mobile-overflow.test.ts` builds all three.
- Season editors are inside _Avansert_, closed by default: open it with one tap
  on its heading (`openPlanAdvanced` in `tests/playwright-utils.ts`).
- A Week Pattern day holds the plan's own copy of what it picked, a **Held
  Workout** (ADR 0113): the row is `Workout.heldByOutlineId = <plan id>`, never
  the session's own `workoutId`. After picking, deleting or editing that session
  succeeds and the day keeps its title. The copies never show in the picker or
  in Bibliotek's "your sessions" list; a crafted publish of one is refused.
