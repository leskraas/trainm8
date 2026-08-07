# Map — the plan builder on a phone

Owner's report, verbatim: _"the manual training plan is a bit hard to use, especially
on mobile… maybe it's because I want to have more templates/library/drag and drop
stuff."_ Asked which friction was real, the owner named three and **did not** name a
fourth:

| Named | Not named |
| --- | --- |
| Lost the overview | Rearranging is fiddly |
| Too much repetition | |
| Don't know what to do next | |

That omission is load-bearing: the one pain drag-and-drop solves is the one pain the
owner does not have. See §5.

This is the second pass at this complaint. ADR 0048 was written on the owner's earlier
report that _"making a plan is hard, it is hard to get an overview — especially on a
phone"_ and took the page from 4,284 px to ~2,900 px at 390 px. The overview problem
survived that fix, so this map goes after the cause ADR 0048 did not touch.

**Status: awaiting the owner's cut. No code written. Nothing filed on GitHub yet.**

---

## 1. What the owner decided

| Decision | Answer |
| --- | --- |
| Scope | All three tracks, sequenced |
| Sequence | Overview → catalogue → reuse |
| Delivery | This map first; issues filed after the cut |
| Catalogue ownership | Own, community, **and** trainm8's own |
| Calendar reach | _"Consider this more thoroughly"_ → recommendation in §3, still open |

## 2. What the research decided, against our first instincts

Three positions taken early in the session were overturned by the corpus that landed in
`c441a77`. `docs/agents/domain.md` now states that _"an ADR is a record of a decision,
not a constraint on the next one"_ and that a research asset can supersede one, so these
are recorded rather than quietly dropped.

- **Drag-and-drop is not a rejected idea.** It lost three prototype rounds for #366, but
  the capability inventory ranks the calendar grid **#2 of 15** partly because of it:
  _"Planning without drag-to-reschedule is planning people abandon in week three."_ It is
  out of this map for a different reason — see §5.
- **A workout library is not blocked.** `workout-taxonomy.md` amends ADR 0003: _"the
  deferred template library is now the binding constraint: an archetype vocabulary
  without a catalogue to filter is a dropdown, not a feature."_
- **Densifying the season chart cannot fix the overview.** The chart already renders a
  whole 18-week season at 390 px (~16 px/week). It contains **no actuals** — every series
  on it is authored plan. It can only ever show what was planned, never how the season is
  going.

## 3. The calendar question — recommendation

**Build the season overview as a fourth zoom on the Dashboard (`Season`, beside Week /
Trends / History). Do not open `/training/calendar`. Do not supersede ADR 0017.**

Three findings drive this.

**The glossary already picked the shape, and it is not a grid.** `CONTEXT.md:745` defines
**The Tape** — one horizontal scrubbable timeline, past left, planned right — with
_Avoid_: _"Calendar, grid; do not treat as built."_ The **Dashboard** entry adds:
_"Long-term it is a zoom level of the Tape, not a separate concept."_ A calendar route
would build the other shape, under the banned word, immediately before the intended one.

**ADR 0017's Revisit note does not cover this complaint.** It says Supersede, but the
inventory body qualifies it: _"Its reasoning was about **reading** — and on that
reasoning it was right and remains right. Planning is a **writing** surface."_ Losing the
overview is a reading complaint. The supersede is reserved for rescheduling.

**Four of the six capabilities that justify a grid are blocked by something other than
the surface.** Wellness rows and injury markers are forbidden by `GOAL.md:54` (_"No
general-wellness tracking"_); weather has no data source; notes days have no model. What
remains is month rhythm and drag-to-reschedule — not enough to supersede an ADR.

**Layout: week-rows, not month-pages.** 390 − 32 px padding, with the `-mx-5/px-5` bleed
from `week-timeline.tsx` reclaiming the Tile padding, minus six 2 px gaps → **49.4 px per
cell**, clear of the 44 px floor. At that width the content budget is one two-digit day
number and one load-coloured mark; everything else goes to the inspect panel below, which
is already the house contract (ADR 0030 rule 3). Eighteen weeks is eighteen rows ≈ 900 px
— one thumb-flick of native vertical scroll, no zoom control, no horizontal scroll.

Note that `grid-cols-7` appears exactly once in the app (`week-timeline.tsx:20`) and is
gated behind `md:`. The house has never drawn seven columns at phone width, and week-rows
is how it can.

Cost: **1.5–2.5 days**, ~6 source files, 0 ADRs superseded — against **4–6 days** plus
3–5 for touch drag, 10–14 files, and ADR 0017 superseded for the route.

> **Owner's call.** Confirm the fourth-tab recommendation, or override it. Everything in
> Track A assumes it.

## 4. The catalogue model

The owner asked for sessions that can be _"egne, andres (community), eller trainm8 sine"_.
Those are not three stores and not one enum.

**A tier is viewer-relative and derived, never stored.** The same row is *saved* to its
author and *shared* to everyone else, so "community" is a query, not a column:

```ts
type CatalogueTier = 'stock' | 'saved' | 'shared' // derived
tier = authorship === 'system' ? 'stock'
     : ownerId === viewerId    ? 'saved'
     :                           'shared'
```

Three orthogonal axes, only two of which this map owns:

| Axis | Field | Answers | Owned by |
| --- | --- | --- | --- |
| Authorship | `Workout.authorship` + nullable `ownerId` | who wrote it | this map |
| Membership | existence of a `CatalogueEntry` row | is it offered for reuse | this map |
| Visibility | `Workout.visibility` (ADR 0037) | who may read it | #337, untouched |

**One Block/Step tree, not two.** Reject a separate `WorkoutTemplate` model:
`copyWorkout` already implements deep-copy-on-instantiate
(`app/utils/workout.server.ts:214`); `WeekPatternDay.workoutId` already points at a
Workout that is deep-copied at stamp (`stamp.server.ts:354`) — template semantics,
shipped; and ADR 0003 promised the reuse (_"we want to reuse it when templates land"_).

**Ship the model for three tiers, the surfaces for two.** `system` + `athlete` need
**zero** of #337 — both are owner-scoped or global-read-only and cross no ownership
boundary. The `shared` tier needs four things and none of #337's mass: a `public`
visibility value, a read path that is not owner-scoped (_"the biggest architectural
ripple to chart"_, per #337), a public author identity, and report-and-takedown. No feed,
no following, no kudos.

The seam goes in the server module, not the UI: one
`listCatalogue(viewerId, { tiers, archetype, phase, level })`, where `shared` is a `WHERE`
branch returning `[]` today. **Do not ship a Community tab that cannot fill** — ADR 0037
is the cautionary precedent, having landed a field with "no consumer, no flow, no UI now"
that then sat unread through an entire map.

**Provenance is asymmetric and must stay that way.** A **Stock Workout** carries a
structured **Citation** (author, work, year, DOI/ISBN) because trainm8 vouches for what it
wrote. A **Shared Workout** carries an **Attribution** and an explicit non-vouch, never a
Citation. A nullable citation field that community authors may fill is the worst outcome:
it lets someone type "Daniels 2013" onto a session Daniels never wrote, in the same slot
as real authority. Enforce structurally: citation non-null **only** when
`authorship = 'system'`.

## 5. Explicitly out, and why

| Out | Reason | Returns when |
| --- | --- | --- |
| `/training/calendar` route | §3 — reading complaint, and the glossary bans the word | Rescheduling becomes the complaint |
| Drag-to-reschedule | Owner did not name it; it lives in the month grid, which isn't built | The grid is built |
| `Plan Template` (#375) | Closed `not_planned`; the inventory hands 6.5 back to it | Its own map |
| Community publish flow | Needs the #337 slice in §4 | #337 |
| Block / reverse periodization shapes | Deferred on evidence; _"a constants-only change"_ later | Evidence changes |

## 6. Track A — Overview

Assumes the §3 recommendation. Two independent defects first.

| # | Work | Effort |
| --- | --- | --- |
| **A1** | **Defect: `PhaseSpark` is invisible on phones.** `__plan-chrome.tsx:320` puts every `DisclosureCard` aside behind `hidden shrink-0 sm:block`, and the phase sparkline rides in that aside. The one mark showing a phase's rhythm does not render at the width the owner complained about. | XS |
| **A2** | **Defect: N+1 in `recentWeeklySessions`** (`training.server.ts:1344`) — one Prisma query per week in a loop; 8 today, 26 at season length. One range query bucketed in memory. Strict improvement regardless of the rest. | XS |
| **A3** | Widen the Dashboard windows to the season span: `getSessionLedger` trailing/horizon days, `getRecentWeeklyBuild(userId, SEASON_WEEKS)`. Blocked by A2. | S |
| **A4** | `buildSeasonZoom()` in `cockpit/presenter.ts` → weeks × 7 day cells `{ date, state, load, band }` plus phase grouping. Reuses the existing `buildPhaseBands`, `weeklyLoad`, `AdherenceBand`. | M |
| **A5** | New `cockpit/season-grid.tsx` — week-rows, 49 px glyph cells, the `-mx-5/px-5` bleed, `useChartInspect` + fixed inspect panel, `ChartUnavailableMark` for weeks with no trustworthy actual. | M |
| **A6** | Wire `'season'` into `DASHBOARD_TABS` (`cockpit.tsx:97`) — one array entry, one tab, one panel. **Resolve the naming collision**: the home header already carries a `Season` pill → `/training/plan`, and `plan.tsx`'s header reads "Season plan". Either rename the pill to `Plan`, or name the tab `Horizon`. Do not ship two meanings of Season on one screen. | S |
| **A7** | **Honesty boundary.** Backward weeks carry real actual TSS. Forward weeks carry planned TSS **only where sessions are stamped**; unstamped future weeks are an honest gap, not a conversion of the Outline's volume target into TSS. `weekly-build.tsx` already states the current rule. Converting outline volume → TSS forward is a real capability and a **separate slice**. | S |
| **A8** | Tests: `presenter.test.ts`, `index.dashboard.test.tsx`, `tests/e2e/tabbed-dashboard.test.ts`, and extend `tests/e2e/mobile-dashboard.test.ts` (which already runs the 390 px overflow assertion per tab) rather than `mobile-overflow.test.ts`. | S |
| **A9** | **ADR 0050 — the season overview is a Dashboard zoom, not a route.** Records the *decline*, names ADR 0017 as standing, and states what would change our mind. Without it this is re-litigated every quarter, since two research documents recommend the opposite. | S |

## 7. Track B — Catalogue

| # | Work | Effort |
| --- | --- | --- |
| **B1** | **Defect: `copyWorkout` copies `visibility` from its source** (`workout.server.ts:226`). The moment `public` exists, copying a community workout silently makes the copier's session public. The copy must reset visibility to `private`, set `authorship = 'athlete'`, set `ownerId` to the copier, and record `copiedFromId`. File now — it is a latent bug today and a privacy bug the day #337 lands. | XS |
| **B2** | **Defect: the Week Pattern picker is unusable.** `getAuthoredWorkouts` (`training.server.ts:1023`) returns *every* Workout the athlete owns — including all session-bound ones. Its own docstring admits the app "has no Workout library yet". | S |
| **B3** | Schema: nullable `ownerId`, explicit `authorship` with `CHECK (authorship <> 'system' OR ownerId IS NULL)`, `archetype`, `copiedFromId`, and the `CatalogueEntry` model with `level` / `citation` / `intensityFidelity` / `retiredAt` / `progressesTo` / `regressesTo` / phases / goal events. Invariant: **a catalogued Workout is always sessionless**, so ADR 0003's private-1:1 rule survives untouched. | M |
| **B4** | `listCatalogue(viewerId, …)` returning a discriminated `CatalogueEntryReading` with the derived tier. `shared` returns `[]`. | M |
| **B5** | Saved tier: save-to-catalogue **copies** rather than promotes, so deleting a session never removes the template. Widen `addWeekPatternDay`'s owner check (`authoring.server.ts:2369`), which today refuses a Stock Workout because `ownerId` is null. | M |
| **B6** | Seed the Stock catalogue — ~50 cited sessions, migration-seeded exactly as ADR 0007 seeds `Exercise`. **Read the caveat in §8 first.** | M |
| **B7** | Catalogue surface: search, archetype / phase / level filter, folders (capability 6.3, _"a library of 200 workouts is useless unstructured"_, effort S). | M |
| **B8** | The pain-#3 payoff: _"'Add a threshold session' resolves to eight cited candidates rather than an empty form."_ Wires the catalogue into the builder. | M |
| **B9** | **ADR 0051 — the Workout Catalogue is one model with three tiers derived by query.** Supersedes ADR 0003's no-template-library clause; confirms its private-1:1 and copy-not-share rules. | S |
| **B10** | **ADR 0052 — a Stock Workout carries a Citation; a Shared Workout carries an Attribution and no vouch.** Owns `intensityFidelity`, the tier badge surviving a copy, and the moderation preconditions gating the community tier. Extends ADR 0033's honesty bar from detection to provenance. | S |
| **B11** | **ADR 0053 — an archetype is derived for a completed session and cited for a Stock Workout.** The catalogue is unfilterable without `archetype`, but ADR 0042 forbids authoring it. A Stock Workout's archetype comes from its published source — neither derivation nor guessing. **Amends ADR 0042.** | S |
| **B12** | _Deferred._ Community tier: the #337 slice from §4, plus a merge gate — report-on-content, hide-on-report, hard delete, blocking, and defined semantics when a publishing author deletes their account (ADR 0012 is the precedent for deciding retain-anonymised vs withdraw deliberately). #337's fog list already names this; the work is to sharpen it into a gate. Consider curated or invite-only publishing first: it costs no moderation infrastructure and still fills the tab. | — |

## 8. Sequencing caveat on the seed

B6 is gated by three existing Revisit notes, all already recorded:

- **ADR 0007 (Amend)** — without `pacePct` and a race-pace kind, _"~⅓ of the running
  library — all of Canova, the whole Norwegian sub-threshold family — is unauthorable."_
- **ADR 0027 A3 (Amend)** — Norwegian session names are content, not chrome; the en-GB
  rule is wrong for _langtur_, _terskel_, _bakkedrag_.
- **ADR 0002 (Amend)** — without `verticalM` and `gradePct`, archetypes H and G cannot be
  seeded.

Either sequence the anchor work ahead of B6, or seed the expressible subset and **say
which rows are missing and why**. Seeding a lactate-anchored protocol as a pace session is
exactly the failure `intensityFidelity` exists to prevent — and per
`workout-taxonomy.md:983`, _"do not let the app generate a session named after a protocol
it did not reproduce."_

## 9. Track C — Reuse

| # | Work | Effort |
| --- | --- | --- |
| **C1** | Illustrated shapes at **phase** level — the unbuilt second third of #366's _"templates at three levels… all picked from an illustration of what they produce rather than a sentence describing it."_ Code constants, apply-then-own, no schema. | M |
| **C2** | Illustrated shapes at **Week Pattern** level — the unbuilt third third. Renders as seven days of intensity. | M |
| **C3** | The plan page's "Start from a shape" still uses the old gallery, not ADR 0048's radio cards. ADR 0048 left this open by name: _"whether a shape should be offered on the plan page in the same illustrated form the creation step now uses."_ | S |
| **C4** | Surface `Copy Week` and Week Pattern stamping out of their disclosures. Both already exist and are rated **Have** — _"building 20 weeks by hand is the reason people quit planning."_ The gap is discoverability, not capability. | S |
| **C5** | **Flag 3:1 as convention, not evidence.** The research is explicit: _"I found no controlled trial establishing 3:1 as superior to 2:1 or to autoregulated recovery. Flag it as such in any UI that defaults to it."_ The shape picker is that UI. One sentence. | XS |
| **C6** | A fixed Week Pattern day should point at a **Workout Template**, not "the athlete's own Workouts, newest first". Consequence amendment to ADR 0044. Depends on Track B. | S |

## 10. Documentation debt found along the way

| # | Work |
| --- | --- |
| **D1** | **ADR 0003 has no Revisit note** despite two research documents rating it Amend. Twenty other ADRs have one; the annotation pass missed this. |
| **D2** | **ADR 0037 has no Revisit note.** Should record three things: visibility is orthogonal to membership and authorship; its claim that _"`workout.findMany` does not exist"_ is now false; and the field's own history is the argument against adding `public` before a publish flow consumes it. |
| **D3** | **ADR 0044 has no Revisit note** despite the planning research rating it Amend on taper depth (_"2 weeks, exponential, 41–60 % volume cut, intensity held, A-events only"_). |
| **D4** | `CONTEXT.md`'s **Workout Template** entry describes a feature ADR 0003 says does not exist. It is a glossary lie today and must ship corrected **with** B3, not after. New entries drafted: **Workout Catalogue**, **Catalogue Tier**, **Workout Authorship**, **Stock Workout**, **Saved Workout**, **Shared Workout**, **Citation**, **Attribution**. `Catalogue` is canonical; `library` is demoted to a recognised synonym, since "library" is already banned in two neighbourhoods. |
| **D5** | Unticketed product bug from #431: **stamping week 1 when it is the current week writes sessions onto days already past**, so the Dashboard immediately renders them missed. `stampWeekPattern` never consults `now`. |
| **D6** | `app/styles/tailwind.css` has duplicated `@import` lines (`tw-animate-css` and `shadcn/tailwind.css` three times each) — merge artefact. |
| **D7** | Three prototype branches still on origin, undeleted: `claude/wayfinder-billett-366-za4bst`, `claude/manual-planning-design-exploration-vxqgr4`, `claude/manual-planning-variants-366-l4x8ha`. |

## 11. How to cut this

Reply with the numbers to drop. Some sensible smaller cuts:

- **Thinnest useful slice** — A1, A2, C4, C5. Half a day, no schema, no ADRs. Fixes the
  invisible sparkline, the N+1, and makes the two reuse features that already exist
  findable.
- **Overview only** — Track A. ~2.5 days, one new ADR, nothing else moves.
- **Skip the seed** — Track B without B6/B8, deferring §8's anchor dependency. Gives the
  saved tier and the fixed picker without waiting on ADR 0007.
- **Everything** — roughly 3 tracks × ~1 week, plus the deferred B12.
