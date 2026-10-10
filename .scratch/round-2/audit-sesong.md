# Audit: Sesong-fanen (round 2)

Main 326fc7f, production build (build/ is fresh: only e2e files changed after it), `MOCKS=true`, port 3601.
Writes (edits, an open-ended plan, a test event) went to a **copy** of `prisma/data.db` in
`scratchpad/sesong/data.db`. The shared DB and the repo were not touched. Screenshots: `scratchpad/shots/r2-sesong-*.png`
(390×844 touch and 1280×860, light and dark). Scripts: `scratchpad/sesong/*.mjs`.

Area: `/training/plan` (+ `?tab=weeks`, `?outline=`, `?edit=`), `/training/plan/new`, `/training/plan/new/$eventId`,
`/training/plan/generate/$eventId`, `/training/events`, `/events/new`, `/events/$id`, `/events/$id/edit`, plus the
`__*` modules they use.

## 1. Kort oppsummering

- **The function is built and mostly right.** Open-ended plans, all five philosophies, the switch with a digest-tied preview,
  the four Sesong edits with preview, the "held" sentence and the toast, attaching a race, and the Events card all work
  in the running app. The Norwegian message after an edit (`Uke 42: mål 36,9 → 60 km. Fasen og de andre ukene står som før.`) matches ADR 0084 §4.
- **The surface is still the pre-#505 English plan page.** About 80 % of the visible words on `/training/plan` are
  English, and the Events pages, `plan.new.$eventId` and `plan.generate` are fully English. Decimals use a point (`55.0 km/wk`).
  Phase names are raw (`Base/Build/Peak/Taper`) although `nbPhaseName` exists and I dag already uses it. The same
  philosophy has two names in one tab (`Classic 3:1 linear` vs `Klassisk 3:1`).
- **Design system: not migrated.** The page uses its own `PlanCard`/`DisclosureCard`/`PillLink`/`SegmentedNav`
  (rounded-3xl + border + shadow-xs, `transition-colors` on the built-in curve, 36px segments) instead of `ui/card`,
  `SegmentedControl`, `Collapsible` and `pressable`. The radios are native and render **browser blue**. The chart has 9–11px text,
  and the events detail page uses the marketing type scale (`text-body-*`).
- **Real bugs:** (a) nested disclosure chevrons point "open" while closed (`group-open` leaks from the outer card).
  (b) The Filosofi card names no philosophy on a race plan whose last phase is a taper. (c) *Hold meg aktiv* from Sesong
  makes a "Klassisk 3:1" plan with no climb and no hard sessions. It also starts in the week that has already begun.
  (d) The `/training/plan/provenance-prototype` route **ships to production** (HTTP 200, stub data, under the Sesong tab).
- **Arket gap:** the season chart has no today line, no horizon, no done bars and no ISO week numbers. The Weeks reading
  shows only the target, with no planned or done figure and no "this week" mark. The Weeks reading says `Week 10` while *Endre sesongen*
  says `Uke 42` for the same week.

## 2. Spec-tabell

| Ref | Verdict | Evidence | Note |
|---|---|---|---|
| #505 s1 plan uten løp | Built | `plan.new.tsx:109` → `createOpenEndedPlan` (`utils/plan-outline/authoring.server.ts:597ff`); verified: `?outline=…` shows `HOLD MEG AKTIV / blokk 1 av ∞` | Starts `weekMonday(now)`, i.e. the week already begun (`authoring.server.ts:652`). The first run deliberately uses the first unbegun week (ADR 0079 S14). Sessions can then land on past days as *ikke gjort*. |
| s2 navngitte runder | Built | `Blokk 1` phase; chart band `BLOKK 1` | — |
| s3 rytme fra filosofi | **Deviates** | `authoring.server.ts:647-670`: without `input.family`, `round = null` and `family: 'classic'` is stored. Sesong's *Hold meg aktiv* passes no family (`plan.new.tsx:109-112`). | The plan reads "Planen følger Klassisk 3:1 … De harde øktene blir flere og hardere", but the chart table shows `+0%` and `No quality sessions` in every week. The words and the plan disagree. |
| s4–6 neste rundes volum | Partial | Proposal and factor UI live on I dag only (`routes/resources/week-change.tsx`, `_home/timeline/week-change.ts`). Nothing in `plan.tsx`. | Sesong never shows a pending next round. That is acceptable under ADR 0080 (one proposal surface), but Sesong should at least say "neste runde venter på svar". |
| s7–8 legg til løp | Built | `__attach-event.tsx`; `Legg til et løp` form on the open-ended hero | A resting open-ended plan is reachable only via `?outline=`. Sesong's landing always shows the race plan, and nothing links to the resting plan. |
| s9 blokk n av ∞ | Built | hero `blokk 1 av ∞` | Same hero has `fra 5 Oct 2026` (English date). |
| s10 velg filosofi | Partial | `__philosophy-switch.tsx:93-103` shows "Planen følger X" only when `family` is set. `training.server.ts:260` derives it from the **last** phase's rhythm. | Kody's race plan (last phase = taper, `rhythm none`, `family null`) names **no** philosophy. Shape gallery and preset names are English and hardcoded in `presets.ts:364-378` (`Classic 3:1 linear, long run-in`), while the card says `Klassisk 3:1`. |
| s11 alle filosofier åpne | Built (domain) / Deviates (Sesong entry) | `openEndedRound(family)` exists. *Hold meg aktiv* in Sesong cannot pick a family (see s3). | — |
| s12–13 bytt + forhåndsvisning | Built | verified: Masters 2:1 preview, digest confirm `Bytt til Masters 2:1` | The preview mixes English: `fra uka som starter 12 Oct 2026`, `12 Oct`, `50.0 km · 0 sets`, phase `Taper` (`__philosophy-switch.tsx:222,259,321` use `formatDate`/`formatDayMonth`/`formatVolumeTotal` instead of the `formatNb*` family). |
| s14 behold historikk og egne økter | Built | ADR 0079 S7; note line in preview | — |
| s15 styrkespor fra historikk | Built | `strength-offer.server.ts`; offer only when no strength track | Not exercised (kody already has a strength track). |
| s57 Løp og planlegging i Sesong | Partial | `__season-events.tsx` card (Norwegian) + `/training/events*` in `TAB_PREFIXES` (`app-tabs.ts:43`) | The card is Norwegian, but every Events page is English: `Events`, `+ New Event`, `Upcoming`, `Planned`, `Race · 24 Oct 2026`, `Cancel event`, `Set result`, `Create Event`. ADR 0083 §5 requires Sesong's landing to be Norwegian, and the round-2 owner decision covers the rest. |
| s72 endre ukemål | Built | `__season-edits.tsx`; verified 36,9 → 60 → 50 km with a toast `Sesongen er endret` | Only unbegun weeks get a link (correct). The Weeks reading labels the override `Hand-set` (`plan.tsx:3864,3941`). |
| s73 fasens navn og lengde | Built | verified: `«Taper» heter nå «Nedtrapping» og varer 2 uker (var 1). …` | The phase select shows the raw name (`Taper · 1 uke`). |
| s74 velg lett uke | Built | `?edit=easy-week`; ADR 0084 §2 | Not exercisable on kody (every block is lived). |
| s75 forhåndsvisning først | Built | preview → `Bruk endringen`; the digest refuses `preview-stale` | **Outside v1** edits under *Avansert* still apply directly (ADR 0084 §1, documented). |
| s76 advarsel >10 % | Built (code) | `ramp-guard.ts weekRiseWarnings`; `RiseWarningNotice` `__season-edits.tsx:782` | Not triggered here (only the taper week is unbegun). The notice uses raw `amber-500` instead of `status-under`. |
| s77 hva som ikke flyttet seg | Built | `[data-season-edit-message]` text above | Matches ADR 0084 §4. |
| ADR 0079 S5 «plan page says it is resting» | Built | `Planen hviler mens planen mot løpet ditt er i gang… Åpne løpsplanen` | — |
| ADR 0080 (Sesong side) | Partial | `plan.tsx:2465-2470` *What's next*: "Nothing is scheduled until you stamp it" | Stale. The week change now fills the horizon automatically (ADR 0080 §1, ADR 0079 S6). |
| ADR 0081/0083 §5 Norwegian | **Deviates** | §6 below | — |
| ADR 0084 §1 *Avansert* labelled | Built | `Avansert · Disse endringene gjelder med en gang, uten forhåndsvisning.` | Its contents are English. |
| ADR 0066 / 0029 chart primitive | Built | `SeasonChart` on `ChartFigure`, data table present | Text is `text-[9–11px]` (`__season-chart.tsx:767,779,792,837,853,918,941`). `PhaseSpark` floors bars at 3px (`__plan-chrome.tsx:384`). It is a glyph, so ADR 0066 §3 does not bind it, but zero and tiny look the same. |
| ADR 0087 (Sesong untouched) | Built | "`SeasonChart` … read only by Sesong" | Sesong now carries the older English chart that I dag replaced. |
| ADR 0085 page migration | Missing | §3 | — |
| Prototype routes | **Ships** | `plan_.provenance-prototype.tsx` has no loader gate. `GET /training/plan/provenance-prototype` → 200 in production, Sesong tab highlighted. `plan.prototype.tsx:72` is gated (404). | Delete, or gate it like `/training/plan/prototype`. |

## 3. Design-avvik vs Arket + designsystem

| Where | Now | Should be | Ref |
|---|---|---|---|
| `PlanCard`, `DisclosureCard` (`__plan-chrome.tsx:167,292`) | `rounded-3xl border border-border/70 shadow-xs` | `ui/card` (luma: `rounded-4xl`, `shadow-md`, `ring-foreground/5`, tone not hairline) | ADR 0085, design-system.md Radius/Elevation |
| `PillLink` (`:108`) | `transition-colors` on the default curve, no press, 36px + after | `Button variant="secondary" size="sm" className="rounded-full"` rendered as a Link (`pressable`, hit area) | design-system Motion |
| `SegmentedNav` Blocks/Weeks (`:448`) | Hand-made, `min-h-9` (36px), **no** hit-area extension | `SegmentedControl` (or `Tabs`) with links | measured 76×36 |
| `Disclosure`/`DisclosureCard` | native `<details>`, chevron `transition-transform` on the built-in curve, no panel motion | Keep `<details>` (no-JS) but use `ease-out duration-collapse`, or move to `Collapsible` (`motion-collapse`) | ADR 0077/0085 |
| Season chart toggles (`__season-chart.tsx:467-490`) | 12 `Button size=sm` (32px) as pseudo-toggles | Track and Read in → `SegmentedControl`; Layers → `ToggleGroup multiple variant="outline"` | design-system Components |
| Radios: philosophy, plan.new, plan.new.$eventId, generate (`plan.new.tsx:301,390`, `plan.new.$eventId.tsx:890`, `plan.generate.$eventId.tsx:248,278`) | native `<input type=radio>`, **browser-blue** accent | `accent-primary` at minimum, or a RadioGroup primitive (`npx shadcn add radio-group`) | screenshot `r2-sesong-philosophy-preview-mobile-light.png` |
| Type | `text-2xl`/`text-xs uppercase tracking-widest` (PlanHero `__plan-chrome.tsx:72-77`), ~400 raw `text-sm/xs` across the area, `text-body-*` marketing scale in `events.$eventId.tsx:149-221` | `text-title`, `text-overline`, `text-heading`, `text-footnote`, `text-caption` | design-system Type |
| Radius stragglers | `rounded-lg/xl` in `plan.tsx`, `__season-edits.tsx:598`, `__philosophy-switch.tsx:105`, `__attach-event.tsx`, `events.$eventId.tsx` (3×); `rounded-md/sm` in `__phase-editor.tsx`, `plan.generate` | luma steps (`rounded-3xl` controls, `rounded-4xl` cards) | Round-2 decision |
| Colour | `border-amber-500/40 bg-amber-500/10` (`__season-edits.tsx:782`) | `status-under` token | design-system Colour roles |
| Numbers | `55.0 km/wk`, `596.9 km`, `Timer i uka 0.1` | `formatNbVolumeFigure`, `55,0 km/uke` | D2 (round 1) |
| Season chart vs Arket C | Target bars only. Weeks 1–10. No today line, horizon, done bars, `→ fortsetter` for open-ended, or event flag in kody's plan (the plan ends a week before the race week) | Arket C: phase band + I dag + horisont + ⚑ + plan vs done. The I dag large-screen curve (ADR 0087, `season-table.ts`) already draws most of this | Arket C, desktop-planner T4/P3 |
| Weeks reading vs Arket E/N/Q | `Week n · date · target` per track. No planned Σ, done, `≠` or current-week outline | Q's season table: ISO week, phase chip, rhythm, `mål · gjort`, `≠`, this week outlined. Reuse `season-table.ts` | Arket Q, N (N itself is out of scope) |
| Desktop 1280 | A single ~600px column (`r2-sesong-plan-desktop-light.png`) | E/N: settings pane left + season sheet right. At least a two-column layout (chart+table / edits) from `lg` | desktop-planner.md "Best desktop planner" §1 |
| Information order | Hero → events → English chart → "What this plan comes to" → Filosofi → Endre sesongen → a 3-paragraph "cannot tell you" essay → "What's next" → blocks | Arket C/E lead with the season picture and the week numbers. The honesty essay belongs behind a disclosure | #505 Look, story 86 |

## 4. Håndverk (Emil)

| Before | After | Why |
|---|---|---|
| Nested `Disclosure` chevrons use `group-open:rotate-180` (`__plan-chrome.tsx:249,334`; `plan.tsx:4075`) and inherit the **outer** open card → they point up while closed (see Peak card in `r2-sesong-plan-mobile-light-part3.png`) | Named groups: `group/disclosure` + `group-open/disclosure:rotate-180` | The affordance lies about state |
| `transition-colors` / `transition-transform` with no easing token (`__plan-chrome.tsx:108,231,249,317,334,448`, `events.tsx`, `plan.new.$eventId.tsx`) | `duration-press ease-out` or `pressable` | One curve app-wide (ADR 0077/0085) |
| No press feedback on PillLink, the segmented nav, summary rows or event cards | `pressable` (scale 0.97, 160ms) or an instant `active:` tint on rows | Every tappable thing answers on pointer-down |
| Text links as the only way into an edit: `Endre navn eller lengde på en fase` (324×20), `Velg hvilken uke som er lett` (20px), `Til Bytt filosofi` (16px), `Alle løp` (20px) | Button-like rows ≥44px, or an `after:` hit area | 44px (ADR 0028 §2) |
| Blocks/Weeks segments 36px with no hit area; compact buttons reach ~42px with `after` | `SegmentedControl` (44px hit area) | measured |
| Radios 13×16 inside labels (OK target) but blue native | `accent-primary` / primitive | Brand and contrast consistency in dark |
| Chart axis and band labels 9–11px muted | ≥12px (`text-caption`), or drop to fewer ticks | Legibility; I dag sets 12px as its floor (ADR 0082 §9) |
| Hover is globally gated (`@media (hover:hover)`) | — (OK) | Verified in design-system.md |
| *Avansert* and the long forms open with no motion | `motion-collapse` (height + opacity, 200/150) | The one sanctioned layout animation |

## 5. break-ui-funn

| # | Severity | Finding | Repro |
|---|---|---|---|
| B1 | High | `/training/plan/provenance-prototype` is live in production with fake data, under the Sesong tab | `GET` → 200; `plan_.provenance-prototype.tsx` has no `NODE_ENV` gate |
| B2 | High | *Hold meg aktiv* plan says "Klassisk 3:1 … harde øktene blir flere" but has a 0 % ramp and no quality sessions | `/training/plan/new` → *Lag planen* → Filosofi card vs chart table |
| B3 | Med | *Hold meg aktiv* starts in the already-begun week (`fra 5 Oct` on Sat 10 Oct) → machine sessions possible on past days | as above |
| B4 | Med | Filosofi card is blank (no "Planen følger …") on a race plan ending in a taper with `family null` | kody `/training/plan` |
| B5 | Med | Nested chevrons show "open" while closed | Peak card (current phase, default open) |
| B6 | Med | One week, two names: Weeks reading `Week 10 · 12 Oct 2026`, edit `Uke 42 · 12. okt`, chart `10` | `?tab=weeks` |
| B7 | Med | Philosophy names differ across the tab: `Classic 3:1 linear, long run-in` / `Big base / pyramidal` (plan.new.$eventId) vs `Klassisk 3:1` / `Stor base` (Filosofi) | — |
| B8 | Med | *What's next*: "Nothing is scheduled until you stamp it" / "2 steps left" in week 9 of a 10-week plan, while ADR 0080 fills the horizon on its own | kody `/training/plan` |
| B9 | Low | The track list orphans its separator: `Strength` on one line, `· authored in sets/wk` on the next (`plan.tsx` track summary) | 390px |
| B10 | Low | `Tilbake til planens mål` is offered when no override exists | `?edit=week-target` on an un-overridden week |
| B11 | Low | Pre-fills look implausible for kody: `Timer i uka 0.1`, generate anchor `1.6 kilometres per week` vs a 55 km/wk plan | Probably seed history; verify `readAnchorContext` before blaming UI |
| B12 | Low | A resting open-ended plan has no way in from Sesong (only `?outline=` after creation) | — |
| B13 | Low | Philosophy switch on a race plan extends the taper into the race week (`slutt` → `36.9 km`). Possibly correct (fit ends on the Event's week) but surprising next to "Your plan ends 1 week before your event's week" | Masters preview |

## 6. Engelsk tekst på norske flater (selection, exact strings)

Plan page (`/training/plan`):
- `plan.tsx:2163` "You’re building toward" · `:2184` "Change what you’re building toward" · hero meta "24 Oct 2026 · 10 weeks from 10 Aug 2026"
- `__season-chart.tsx:304` "Your season"; `:173-178` Volume/Fitness/Rhythm/Ramp/Emphasis/Form; `:401,415,436` Track/Read in/Layers; "derived"; `:519-525` table headers Week/Starts/Block/Week role/Change/Emphasis; `:536` "No change to read"; `:856` "Event"; `:904` aria "Projected fitness (CTL)…"; `:1054` "Tap a week to read it…"; `:1275-1289` derivation names; `:1373` "Form does not draw here"
- `plan.tsx:2252` "What this plan comes to" (+ "Where you start to your peak loading week…"); `:2998` "What this plan cannot tell you" (3 paragraphs); `:2490-2491` "What’s next", "n steps left"; `:2445-2470` step titles and "Set it up", "Stamp your weeks"; `:301` "Blocks"/"Weeks"; `:4026` "Week by week"; `:3864-3941` "Hand-set"; `:4150` "Fill the weeks"; `:1290-1349` every refusal message (`PHASE_GONE`, `PLAN_RESTING`, …)
- `__phase-editor.tsx:80-81` "Move earlier/later"; `:137-138` "Current", "Tapers"; `:145` "Weeks n–m"; `:164-165` "Rename or resize this block…"; `:282` "Loading rhythm"; `:321` "This phase tapers"; `:374-376`; `:407` "At the start"; `:450` "Where it goes"; `:514,531,545` "Delete this plan", "Keep plan"; `labels.ts:2654,2672` "No recovery weeks"/"No recovery"
- `__season-anchor-editor.tsx:126,134,157,247,387-401,509-510` ("Season anchors", "Season opening", "Re-anchored", "From week", "Pick a week")
- `__strength-segment-editor.tsx:401` "Lifting blocks" and the whole block form; `__stamp-pattern.tsx:169,267-295`; `__copy-week.tsx:140,149,252`; `__preset-gallery.tsx:107,300`; `__week-pattern-editor.tsx` (all)
- Phase names shown raw (`Base`, `Build`, `Peak`, `Taper`) on the plan page, chart band, edit selects and philosophy preview; `nbPhaseName` (`labels.ts:1773`) is used only by I dag and `/start`
- Dates/units in the Norwegian philosophy preview: `__philosophy-switch.tsx:222,259,321` → "12 Oct 2026", "50.0 km · 0 sets"; the open-ended hero "fra 5 Oct 2026"

Creation and events:
- `plan.new.$eventId.tsx` whole page ("Lay out your season", "Or let trainm8 build it", "Generate my season", "How should your season be built?", "n weeks · runs 1 week past your event…", "Loads 3:1 — every 4th week recovers."); preset names `presets.ts:364-378…` (hardcoded outside `labels.ts`, against ADR 0081 §2)
- `plan.generate.$eventId.tsx` whole page ("Your season, ready to review", "Where are you right now?", the three radios, "Rebuild the season", "Run 1.6 kilometres per week", weekday names "Tuesday · Run · Steady · zone 3")
- `events.tsx:107` "+ New Event", "Events", "Upcoming", "Planned"; `events.new.tsx:29,96,269` "New Event", "Create Event", labels Name/Kind/Priority/Start date/End date (optional)/Disciplines/Location/Notes, placeholders; `events.$eventId.tsx:149-221` "Event", "Edit", "Cancel event", "Delete", "TARGET Time:", "Set result", "Set as result", "Result", "Linked session"; meta titles `Plan | Trainm8` (`plan.tsx:291`), `New Event | Trainm8`

Already Norwegian (keep): `/training/plan/new`, `__season-events.tsx`, *Filosofi*, *Endre sesongen* and its preview and toast, `__attach-event.tsx`, the open-ended hero, *Avansert* headers.

## 7. Ytelse (390×844 touch, production build)

| Page | 1× load / FCP | 4× CPU long tasks | Nodes / HTML |
|---|---|---|---|
| `/training/plan` | 1771 / 724 ms | 150, 336, 198, **1016 ms** | 1457 / 308 KB |
| `?tab=weeks` | 1991 / 728 | 9 tasks 54–294 | 878 / 140 KB |
| `/plan/new` | 1660 / 784 | 208, 188, 186 | 156 / 41 KB |
| `/plan/new/$eventId` | 1790 / 976 | 8 tasks 73–175 | **2281** / 152 KB |

- CLS 0–0.002 everywhere.
- Chart toggles at 4× CPU: the first tap on **Fitness** took 862 ms (one 715 ms long task, the CTL replay on the client). Run/Strength took 149–256 ms, and Volume 80–94 ms. At 1× all were 15–28 ms once settled.
- Cost drivers: every closed `<details>` still renders its forms (by design, `__plan-chrome.tsx:198`). That is 300 KB of HTML and a 1 s hydration task at 4×. Rendering the *Avansert* and Season-anchor bodies lazily, or splitting the Weeks and Blocks forms by tab, would cut most of it. `plan.new.$eventId` renders 15 presets × 24-row hidden tables, about 2300 nodes.

## 8. Prioritert fiksliste

| # | What | Files | Effort | Owner decision? |
|---|---|---|---|---|
| 1 | Gate or delete the provenance prototype (and `__provenance-*`) | `plan_.provenance-prototype.tsx`, `__provenance-week.tsx`, `__provenance-prototype-data.ts` | S | No |
| 2 | *Hold meg aktiv* in Sesong: pass the family (`classic`, or a choice) so the round gets its climb and mix. Start on `readFirstUnbegunWeekKey` | `plan.new.tsx`, `authoring.server.ts` (+ test) | S | Pick a family in Sesong? (yes/no) |
| 3 | Filosofi card: resolve the family from the first non-taper phase (or the stored one). Show "ingen filosofi valgt" instead of nothing | `training.server.ts:260,975`, `presets.ts:690` | S | No |
| 4 | Nested chevron fix (named groups) | `__plan-chrome.tsx`, `plan.tsx:4047-4075` | S | No |
| 5 | Norwegian pass on the plan page: hero, chart words, readings, phase editor, anchors, lifting blocks, patterns, copy/stamp, refusals → `labels.ts` (+ completeness tests); `nbPhaseName` everywhere a phase name shows; `formatNb*` dates; `formatNbVolumeFigure` + `km/uke`, `t/uke`, `sett/uke` | `plan.tsx`, `__season-chart.tsx`, `__phase-editor.tsx`, `__season-anchor-editor.tsx`, `__strength-segment-editor.tsx`, `__stamp-pattern.tsx`, `__copy-week.tsx`, `__week-pattern-editor.tsx`, `__philosophy-switch.tsx`, `labels.ts` | L | Wording review |
| 6 | Norwegian pass on creation: preset names into `labels.ts` and the same names as Filosofi (`Klassisk 3:1, lang innkjøring`); `plan.new.$eventId`, `plan.generate`, `__preset-gallery` | `presets.ts`, `labels.ts`, `plan.new.$eventId.tsx`, `plan.generate.$eventId.tsx`, `__preset-gallery.tsx` | M | No |
| 7 | Norwegian + design system on Events: list, new, detail, edit | `events*.tsx`, `labels.ts` (events block) | M | No |
| 8 | Chrome → primitives: `PlanCard`/`DisclosureCard` on `ui/card`; `PillLink` → `Button` link; `SegmentedNav` → `SegmentedControl`; chart toggles → `SegmentedControl`/`ToggleGroup`; luma radii; type tokens; `status-under`; `accent-primary` or RadioGroup on radios | `__plan-chrome.tsx`, `__season-chart.tsx` (toggles only), `__season-edits.tsx:782`, radio sites | M | Add `radio-group` from shadcn? |
| 9 | One week numbering: ISO `Uke 41` in the Weeks reading, chart axis and blocks (`Uke 33–36`, not `Weeks 1–4`) | `plan.tsx` WeeksReading, `__season-chart.tsx`, `__phase-editor.tsx:145` | S | No |
| 10 | Season picture per Arket C/Q: today line, horizon, done bars, ISO weeks, open-ended "fortsetter". Either extend `SeasonChart` or reuse I dag's compact curve and `season-table.ts` (planned/done/`≠`, this week outlined) at the top of Sesong. Drop or retire Read-in/Layers, or move them under *Avansert* | `__season-chart.tsx` or `_home/timeline/season-table.ts` + a new Sesong pane, `plan.tsx` | L | **Yes**: keep the analytical SeasonChart or replace it with the I dag curve and table |
| 11 | Remove or rewrite stale *What's next* (stamp vs horizon fill); move "What this plan cannot tell you" behind a disclosure | `plan.tsx:2428-2547, 2990-3017` | S | Yes (does stamping remain a user step?) |
| 12 | Desktop: two columns from `lg` (picture + table / edits + philosophy) | `plan.tsx` layout | M | Yes (how far toward E/N) |
| 13 | Perf: lazy *Avansert*/anchor/lifting bodies (render on open), and Fitness projection memo or a web worker | `__plan-chrome.tsx`, `plan.tsx`, `__season-chart.tsx` | M | No |
| 14 | Show a pending next round on Sesong (read-only, links to Ukeskiftet); a way back to a resting open-ended plan | `plan.tsx`, `__season-events.tsx` | S | No |
| 15 | Small: separator orphan; hide `Tilbake til planens mål` without an override; 44px on text-link edits | `plan.tsx`, `__season-edits.tsx` | S | No |

**Proposed PR split (parallel-safe):**
- **PR A (S, now):** 1 + 4 + 15. Touches the prototype files, `__plan-chrome.tsx` chevrons and `__season-edits.tsx`.
- **PR B (S):** 2 + 3. Touches `plan.new.tsx`, `authoring.server.ts`, `training.server.ts`, `presets.ts:690` and the domain tests.
- **PR C (M):** 7. Events only: `events*.tsx` and the events block in `labels.ts`.
- **PR D (M):** 6. Creation: `plan.new.$eventId.tsx`, `plan.generate.$eventId.tsx`, `__preset-gallery.tsx`, preset names in `presets.ts`/`labels.ts`. Coordinate `presets.ts` with B: B touches only `outlineFamily`, so merge B first.
- **PR E (L), after A:** 5 + 8 + 9 + 11 + 15 remainder. Plan page words, primitives and week numbering. It owns `plan.tsx`, `__plan-chrome.tsx` and the `__*` editors, so run it alone, with no other PR touching `plan.tsx`.
- **PR F (L), after E and the owner's decision on 10/12:** season picture and desktop layout, plus 13 and 14.
- C and D share only `labels.ts` (separate blocks), so they can run alongside A and B. E and F are sequential.
