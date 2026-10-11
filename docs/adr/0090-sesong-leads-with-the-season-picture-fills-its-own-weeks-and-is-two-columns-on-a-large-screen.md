# Sesong leads with the season picture, fills its own weeks, and is two columns on a large screen

Status: Accepted · Owner decisions 12, 13 and 14 (round 2, 2026-10-10)

**Amends
[ADR 0087](./0087-on-a-large-screen-i-dag-is-three-panes-the-season-the-list-and-the-day.md)**
§2 ("The plan page's `SeasonChart` is not changed") and its consequence that
`SeasonChart` is read only by Sesong as the page's primary object. **Amends
[ADR 0044](./0044-plan-outline-is-relational.md) §6** (stamping a Week Pattern
is the athlete's step) on the plan page. **Follows
[ADR 0081](./0081-the-planning-redesign-speaks-norwegian-and-labels-ts-still-owns-every-word.md)**
(the words live in `labels.ts`) and
[ADR 0085](./0085-the-design-system-is-shadcn-base-luma-on-base-ui-and-motion-follows-one-scale.md)
(the design system). Round-2 Sesong audit (`audit-sesong.md`), fix list items 5
and 8–15, PRs E and F.

## Context

The round-2 audit found Sesong (`/training/plan`) still the pre-#505 plan page:
about 80 % of its words English, phase names raw (`Base`, `Taper`), decimals
with a point (`55.0 km/wk`), one week named twice (`Week 10` in the Weeks
reading, `Uke 42` in _Endre sesongen_), its own card, pill, segmented and
disclosure components beside the design system's, native radios in browser blue,
9–11px chart text and sub-44px text links. Its top was the English analytical
`SeasonChart`, with no today line, horizon, done bars or ISO weeks, which I
dag's large-screen season pane (ADR 0087) had already drawn better. A "What's
next" card told the athlete that nothing is scheduled until they stamp it,
though the week change had filled the horizon itself since #505 (ADR 0080 §1).
At 1280 it was a single 600px column. On a throttled phone, every closed section
still rendered its forms: 309 KB of HTML and a second of main-thread work on
load, and 862 ms on the first tap on the chart's Fitness layer.

The owner decided (2026-10-10): I dag's compact curve and season table go on top
and the analytical chart moves under _Avansert_ (12); two columns on a large
screen, picture and table beside the edits and the philosophy, not the full
spreadsheet of Arket variant N (13); week stamping is removed as a user step and
_Kopier uke_ stays (14).

## Decision

### 1. The season picture is I dag's table and curve, read for this plan

The top card is `SeasonCurveView` and `SeasonTableView` from
`_home/timeline/season-pane.tsx`, exported for the purpose, built by the same
`buildTimelineSeason` → `buildSeasonTable` / `buildSeasonCurve` (ADR 0087 §2).
Sesong may show a plan that is not the active one (`?event=`, `?outline=`, a
resting plan), so the plan is read by `getPlanForOutline` — the same reading as
`getActivePlan`, for any Outline the athlete owns — and the ledger over I dag's
reach (`__season-picture.server.ts`). The page receives the table and the curve
as data, never the season's day rows; the curve's formatter is rebuilt on the
client from the lead track's currency. So `Uke 41` reads the same `mål · gjort`
on both tabs.

A row does what Sesong is for: it opens that week's target in _Endre sesongen_
pre-filled and scrolled to (the URL `SeasonEditLink` builds), behind its preview
(ADR 0084 §1). A week already begun is history: its row reads and does not act
(`rowActs`). An open-ended plan's table ends with _→ fortsetter_ (ADR 0079). A
next round waiting in Ukeskiftet is said read-only above the curve, with a link
there: the proposal keeps one surface (ADR 0080).

The analytical `SeasonChart` — layers, read-in, the derivation per week — is
kept, in Norwegian, under the Blokker reading's _Avansert_ as _Sesongdiagram_.
It mounts only when opened.

### 2. The page's order, and two columns from `lg`

Hero; then the picture, _Endre sesongen_, _Filosofi_, _Løp og arrangementer_,
_Hva planen består av_, _Det som gjenstår_, _Hva planen ikke kan si_ (behind a
closed line that names it) and the Blokker / Uker readings. From `lg` the page
is up to `max-w-6xl` and two columns: the season — picture, what it comes to,
the readings — on the left (7fr), the edits, the philosophy and the Events on
the right (5fr). One DOM order serves both widths, so a phone's reading order
and a keyboard's are the same: the right column is one grid item spanning every
row, the left items flow down beside it, and the last row is `1fr`, so a tall
right column grows the readings' row instead of opening gaps between cards.

### 3. The weeks fill themselves; stamping is not the athlete's step

The Uker reading loses _Put it on your calendar_. The week change lays each week
as the horizon reaches it (ADR 0080 §1), and a typical week that gains its days
(`start-week-pattern`, `add-week-pattern-day`) now lays the weeks up to the
horizon at once (`fillPlanWeeksToHorizon`, contained and logged like every relay
after a plan write). The mix notices that lived in the stamp section move onto
the Uker reading. _Det som gjenstår_ asks for a climb and a typical week and,
with both there, gives way to one line: _n av m uker har økter i kalenderen.
Resten fylles når horisonten når dem._ The `stamp-week-pattern` action stays and
answers in Norwegian; its component is no longer mounted. (Both since removed;
see Consequences.)

### 4. One numbering, one language, the design system

Every week the page names is an ISO week (`Uke 41`, `Uke 33–36`): the Uker
reading, the chart's axis and tables, phase cards, anchors, lifting blocks, copy
week, the pattern preview, the notices and the philosophy preview. Every word is
in the bannered Sesong section of `labels.ts`; phase names go through
`nbPhaseName`, dates through `formatNb*`, weekly figures read `km/uke`, `t/uke`,
`sett/uke`. A shape under _Avansert_ is named as the Filosofi card names its
family (`Klassisk 3:1, lang innkjøring`).

`__plan-chrome.tsx` is built on the primitives: `PlanCard` on `ui/card`,
sections on `ui/collapsible` (`CollapsibleSection`, `DisclosureCard`: a 44px row
with an instant press tint, a chevron keyed to its own trigger,
`motion-collapse`, a body rendered only while open), `PillLink` a secondary
`Button` link, Blokker / Uker the `SegmentedControl` with link items, the
chart's Spor and Les i `SegmentedControl`s and its layers an outlined
multi-select `ToggleGroup`. The philosophy and attach-event choices are
`ui/radio-group` cards (`RadioGroupField`). The rise warning reads in
`status-under`. The native `Disclosure` stays for the creation flow and the
catalogue.

### 5. What a closed section costs, and the Fitness layer

A closed section renders nothing until opened, and the chart's Fitness layer is
replayed by the loader (`seasonFitnessOf`) rather than on the tap. Measured on
production builds at 390×844 touch and 4× CPU against the round-2 base: summed
long tasks while loading ~1050 → ~520 ms, the longest ~320 → ~200 ms, HTML 309 →
105 KB, DOM nodes 1460 → 652, the longest task on the first Fitness tap ~110 →
~75 ms (drawing the second chart).

## Alternatives considered

- **Extend `SeasonChart` with today, horizon and done bars, and keep it on
  top.** Two season charts in one app with different numbers on the same week is
  what ADR 0087 avoided on I dag; reusing its table and curve is less code than
  bending the analytical chart, and the instrument stays for those who open it.
- **Answer the next round on Sesong too.** A second Ja/Nei is a second surface
  for one proposal, which ADR 0080 rules out.
- **CSS `order` to reorder one column into two.** It would put the phone's
  visual order and its keyboard order out of step.
- **Keep native `<details>` for no-JS.** Every closed section rendering its
  forms was the page's main cost on a phone, and those forms post through React
  Router anyway.
- **The full spreadsheet season (variant N).** Out of scope (decision 13).

## Consequences

- `season-pane.tsx` exports the table and the curve; the table's `rowLabel` and
  `rowActs` are additive, and I dag passes neither.
- `getPlanForOutline` (`training.server.ts`) reads any of the athlete's plans as
  `getActivePlan` reads the active one; the two share `activePlanOf`.
- `__stamp-pattern.tsx` and its jsdom test are unmounted dead code until the
  owner decides to delete them. _Amended in the same round (r2-plan-new):_ they
  are deleted, and so is the plan route's `stamp-week-pattern` action, its test
  and `SESONG_STAMP_LABELS`, since nothing posted to it any more. The horizon
  fill and the open-ended round still stamp through `stampWeekPattern`.
- The creation flow keeps the English anchor sentence and the English shape
  table until that page is translated (`nbAnchorSentence`, `LoadProfile`'s `nb`
  are Sesong's). _Amended (r2-plan-new):_ the creation flow is Norwegian and on
  the same primitives; the English `anchorSentence`, `rhythmSentence` and
  `LoadProfile`'s English branch are gone, and the native `Disclosure` is no
  longer used by it (only the catalogue imports it).
- A resting plan's picture shows a horizon the active plan fills; the resting
  plan's weeks fill only once it is active again (ADR 0079).
