# Audit round 2: Bibliotek and the workout pages

main @ 326fc7f. Production build with MOCKS on port 3602, against a **copy** of the database
(`scratchpad/db3602/`), so starting StrongLifts and logging sets did not touch the shared `prisma/data.db`.
Screenshots are `scratchpad/shots/r2-bibliotek-*.png` (390×844 touch and 1280×860, light and dark, plus 320px).
Scope follows the coordinator's note. The editor (`/training/sessions/new`, inline token editing, placing from
the catalogue, copy week) belongs to `audit-create-session.md` and is only mentioned here. The token-popover
keyframe issue is noted only, because a separate PR is fixing it.

## 1. Kort oppsummering

1. The **Bibliotek hub** (`library.tsx`, `library_.exercises.tsx`) is Norwegian and clean. Every page it opens is still English: the catalogue, programs, starting weights, the program overview, exercise history/lift-over-time, the Workout Detail View, the runner and its outcome. One tap from Norwegian I dag ("Se økta", "Logg sett for sett") lands in English.
2. Real bugs:
   - **(a)** The strength runner ignores a block's repeat count: a 5× circuit gets 1 circle per lift.
   - **(b)** The starting-weight field silently turns `62,5` into `625` (`type=number`), so a Norwegian decimal becomes ten times the weight.
   - **(c)** Session notes are cut with "…" at 11ch on phones (`score-stanza.tsx:313`), against story 32.
   - **(d)** The detail header says "Threshold" while the card below says "This session has no archetype".
3. Arket M (currency first) is missing on these surfaces:
   - Catalogue cards show prose and a citation, but not the session itself (no Token Sentence, minutes or km).
   - The detail view has no km/time summary.
   - Strength pages say `62.5 kg` with a dot and in monospace, and there is no "neste: +2,5 kg".
   - Q's library side pane, "legg på <dag>" from a chosen day, is not built at all.
4. Design system:
   - Every page outside the hub still uses the Epic marketing type scale (`text-body-*`, `text-h5/h6`) and `rounded-lg/xl/2xl`.
   - `text-muted-foreground/70` is ~3:1, which fails AA.
   - There are hand-rolled sheets and panels with tw-animate keyframes (`__block-editor-sheet.tsx`, `__lift-help-panel.tsx`) and transitions on built-in curves.
   - Controls are under 44px: RPE 36px, "Delete session" 32px, the archetype token 18px.
5. Performance is fine (4× CPU: no CLS, longest task 536 ms on the 798-row exercise list). The fix work splits into 5 PRs that can run in parallel; the biggest is the English → Norwegian pass on the detail view (2,641 lines).

## 2. Spec-tabell

| Ref | Verdict | Evidence | Note |
|---|---|---|---|
| #505 story 58: catalogue, programs, exercises in Bibliotek | **Built** (hub) / **Partial** (pages) | `app/routes/library.tsx:86-105`, `library_.exercises.tsx`, `app/utils/app-tabs.ts` | The hub names all three and lists "Dine løft". The pages behind it are the old English pages with back links to Bibliotek. |
| ADR 0083 §6: hub with catalogue, programs, every exercise (server search) and recent lifts | **Built** | `library.tsx:28-41`, `library_.exercises.tsx:170-187` | The search does not find Norwegian names: `knebøy`/`benkpress` give 0 hits, because aliases have no reader (ADR 0061 Consequences). "Dine løft" lists lifts that were put in a session but never logged, so they open on "First time on this lift". |
| ADR 0083 §4/§8: pages deep in a tab mark it and back out to the tab | **Built** | catalogue `:578-580`, programs `:73-77` | The comment at `programs.tsx:68-72` ("Back to Home, not /training") is stale: it goes to `/library`. |
| Arket Q: library in a side pane next to the chosen day, with a reason when a day cannot be filled | **Missing** | `_home/timeline/stream.tsx:1563` (links removed); no catalogue entry in `CREATE_MENU_LABELS` (`labels.ts:1608`) | Catalogue placing goes through a date picker (`catalogue.place.$workoutId.tsx`). See audit-create-session for the flow. |
| Arket M: currency first (km/fart, timer/soner, sett/kilo) | **Partial** | catalogue `EntryCard` `catalogue.tsx:324-397`; detail header `sessions.$sessionId.tsx`; lift `exercises.$exerciseId.tsx` | No catalogue card says how long or how far. The detail view shows the steps and a shape, but no "1 t 50 min · ~18 km". The strength pages have no "neste: +2,5 kg" per lift (M's lift table). |
| #505 story 32: full text, never "…" | **Deviates** | `app/components/score-stanza.tsx:313` (`max-w-[22ch] truncate … max-sm:max-w-[11ch]`) | Seen as "“Steady aer…”", "“Tempo surg…”", "“Rest betwe…”" at 390px. The runner eyebrow also truncates ("STRONGLIFTS 5×5 · W…" at 320px, `sessions.$sessionId_.log.tsx` header). |
| #505 stories 35–38 (writing) on the editor | n/a here | the inline editor on `sessions.$sessionId.tsx` | → `audit-create-session.md`. The detail view renders the sentence in English (`warm-up`, `rest`, `Easy`/`Endurance` chips) even when the session was typed in Norwegian on I dag. **Owner decision:** ADR 0027 A3 (English glue words) vs ADR 0081 (Norwegian surfaces). |
| #505 story 83: short strength log, pre-filled from the plan | **Built** on I dag | `_home/timeline/strength-log-panel.tsx`, `QUICK_LOG_LABELS` `labels.ts:1228` | Its "Logg sett for sett" link hands off to the English runner. |
| #505 story 84: one tap "som planlagt" + change what differed | **Built** on I dag (reps only) | ADR 0064 "As built (#505 S16)" | The weight cannot be changed (ADR 0064 §2's stated cost); still true. |
| ADR 0027 §4: read view = edit view (sentence on the detail view) | **Built** | `__workout-detail-editor.tsx`, `__token-sentence-editor.tsx` | Drag handles (⋮⋮) and "+ block" show on phone in read mode. See the create-session audit. |
| ADR 0027 §8: exercise combobox with filter chips and recents | **Built** (with defects) | `__exercise-combobox.tsx:51,224` | Trigger `h-8` (32px) and `transition-[color,box-shadow] duration-200` on a built-in curve, while the shared select is 44px with `pressable`. |
| ADR 0060 §1/0064 §1: one scroll, circles, 60px tall | **Built** | runner screenshots | Circles are 56×60 at 390 and **42×60 at 320** (width under 44). |
| ADR 0060: prescribed sets as authored, including repeats | **Deviates (bug)** | `app/utils/strength-log.server.ts:268-310,358-366` (`blocks` select has no `repeatCount`; `rowCount = max(step.sets.length, …, 1)`) | Seed "Strength Circuit" is `5×` (Back Squat 1×45 s, Push-up 1×45 s). The detail view shows "5×"; the runner shows "0 of 1 logged" for each lift, so 4 of 5 rounds cannot be logged. |
| ADR 0060 §2: no gym, no plate line; absence stated once | **Partial** | `__runner-presenter.ts:1001,1026`; runner screenshot | "Tell us what your gym has and every weight gets a plate line" is repeated **under every lift**. The help panel says "No gym is described, so no plates are solved" again. That is the same absence 2× per lift, which is #434's defect again (ADR 0064 §3). |
| ADR 0060 §4: rest as a deadline, ±15 s, never blocking | **Built** | `__rest-bar.tsx` | The rest bar is still running over the outcome panel after "Finish workout". |
| ADR 0060 §6: finish needs ≥1 working set | **Built** | `sessions.$sessionId_.log.tsx:285` | After 3 of 15 sets and Finish, the outcome reads "62.5 kg is held: a session came up short … Stall Count 1". Untapped sets are read as missed. That follows the program's rule, but nothing warns "12 sett er ikke logget" before Finish. **Owner decision.** |
| ADR 0060 §7: Stall Cut as a notice, no offer | **Built** | `__outcome-panel.tsx` | Shows "Stall Count 1", which is jargon in English. |
| ADR 0063: lift-over-time marks the Stall Cut, no tonnage | **Built** | `exercises.$exerciseId.tsx`, `__lift-chart.tsx` | With one session the chart is a single full-width bar (break-ui: 1 item). Figures use `font-mono` (`62.5 kg`) instead of Public Sans `tabular-nums`. |
| ADR 0064 §1: circle tap cycle, 120 ms colour / press | **Built** | `sessions.$sessionId_.log.tsx:934` | `[transition:…120ms,…transform_80ms] active:scale-[0.97]`. ADR says `scale(.94)`; the house rule is `pressable` (0.97/160ms/ease-out). The curve here is the browser default `ease`. |
| ADR 0083 (tabs) on the session pages | **Built** | detail and runner | Pages under no tab mark none. The detail back link is Norwegian ("Tilbake til I dag") and everything under it is English. |
| ADR 0081 §1/§4: #505 surfaces Norwegian; Round 2 brings Bibliotek and workout pages in | **Missing** | §6 below | Owner already agreed (BRIEF Round 2). |
| ADR 0085: luma radius/type/motion on these pages | **Partial** | §3–4 | The primitives are luma. The page code still uses the marketing scale and old radii. |

## 3. Design-avvik vs Arket + designsystem

| # | Where | Today | Should be (ADR 0085 / design-system.md / Arket) |
|---|---|---|---|
| D1 | Type scale on every page except the hub | `text-body-2xs/xs/sm/md`, `text-h5`/`text-h6`, `text-button` (e.g. 11× `text-body-2xs` in the runner, 7× `text-h5` in the detail view). Card titles in `text-h5` (24px) are bigger than the page title "Session" (18px), so the hierarchy is inverted. | `text-title` page, `text-heading` section, `text-callout` row title, `text-footnote`, `text-caption`, `text-overline`. The design-system doc keeps the marketing scale for marketing/auth only. |
| D2 | Radius | `rounded-lg/xl/2xl/md/sm` on cards, chips, inputs and panels (detail: lg ×3, xl ×2, md ×3; exercise page 2xl/3xl/lg; runner 2xl/xl; start field `rounded-2xl` + `h-13`; programs buttons `h-12 rounded-2xl`) | Luma steps: cards/buttons `rounded-4xl`, controls/popups `rounded-3xl`, items `rounded-2xl`, pills `rounded-full`. The owner wants page-by-page migration inside each area PR. |
| D3 | Contrast | `text-muted-foreground/70` (programs `:228,256,267,274`, measured `oklab(0.52 … / 0.7)` at 12px, ~3.0:1). `/60` and `/50` text in the detail view and popovers. `/85` on the start hints. | Plain `muted-foreground` (doc: "/70 is 3.0, do not dim further"). |
| D4 | Hand-rolled bottom sheet | `__block-editor-sheet.tsx:89,97`: Base UI Dialog + tw-animate `animate-in slide-in-from-bottom-4 … duration-150` | `ui/drawer` (phone) / `ui/sheet` (≥md), ADR 0085 §6. |
| D5 | Hand-rolled disclosure panel | `__lift-help-panel.tsx:84`: `animate-in fade-in-0 slide-in-from-top-1 duration-150` (keyframes, built-in curve) | `ui/collapsible` with `motion-collapse`. |
| D6 | Native checkbox | catalogue `In my list`: `<input type=checkbox className="size-4">` (`catalogue.tsx:540-546`) | `ui/checkbox` (44px row is fine) or a `Toggle` "Lagret" in the filter row. |
| D7 | `<details>` for "Source" | programs `:262-280`: 12px `/70` summary with `py-1` (~20px target) and chevron `transition-transform` on the default curve | `Collapsible`, with the trigger at a 44px hit area. |
| D8 | Many primaries per screen | catalogue: a green "Add to my calendar" on every card (24 per page). Detail: "Log your sets" plus "Save Session Log". | One primary per screen (design-system: `primary`). Catalogue card actions as outline/ghost, or the whole card tappable to a detail. |
| D9 | Catalogue card content | Title, meta, a long description (raw markdown `*shrinking the recovery*`, `*result*`), then the provenance. On convention rows the "Coaching convention…" sentence appears twice, once in the description and once in the slot. | Arket Q/M: name, **the Token Sentence**, `min · nivå` (and km for a run), then provenance as one footnote. |
| D10 | Catalogue badge position | `CardHeader flex-wrap`: the tier badge sits right of the title on some cards and wraps under it on others (390px) | Fixed slot (`CardAction`) or put the badge in the meta line. |
| D11 | Detail view top actions | "Delete session" is a red pill in the first row, beside "Mark as missed" | The destructive action belongs in an overflow menu or at the end of the page. The I dag day pane already uses quiet pills for "Se økta"/"Rediger". |
| D12 | Detail view on desktop | One 608px column at 1280; the Recording grid and telemetry squeezed | Q-style: recording/telemetry beside the prescription at `lg`. |
| D13 | Zone chips | small-caps `Easy`/`Endurance`/`Tempo` on old `zone-*` tokens. The workout shape colour per zone differs from the track hue elsewhere. | The design doc lists `zone-*` as temporary. Decide the zone palette (dataviz) and the label words (Norwegian I1–I5 / "rolig"). |
| D14 | Monospace figures | lift page "62.5 kg", "62.5 kg × 5" in `font-mono` | Public Sans + `tabular-nums` (design-system Type). |
| D15 | Kilos format | `formatKg` (`app/utils/strength-log.ts:363`) returns `62.5`; rep lists `5,5,5,4` (`__runner-presenter.ts:1140`) | Owner decision (BRIEF Round 2): `82,5 kg × 5 · 5 · 5 · 4`. Needs an `formatNbKg` beside `formatNbVolumeFigure` (`format.ts:667`). Recording "31.2 km" also needs `formatNbVolumeFigure`. |
| D16 | Hub list rows | `library.tsx:59` `transition-colors` (built-in curve), no press. Recent-lift rows `hover:underline`. | `pressable` (or an instant `active:` tint) on the rows. |

## 4. Håndverk (Emil-format)

| Before | After | Why |
|---|---|---|
| `HubLink` `transition-colors` with no duration or curve (`library.tsx:59`) | `pressable` (scale .97, 160ms `--ease-out`) | Press must answer on pointer-down; one curve app-wide |
| Runner circle `[transition:…120ms…,transform_80ms] active:scale-[0.97]` default `ease` (`sessions.$sessionId_.log.tsx:934`) | `pressable` + `duration-press ease-out`, or record that the circle is a deliberate exception (ADR 0064 says .94/80ms) | The ADR and the code disagree with each other and with the house scale |
| `__lift-help-panel.tsx:84` tw-animate keyframes `animate-in slide-in-from-top-1 duration-150` | `Collapsible` + `motion-collapse` (200/150, reduced motion keeps the fade) | Keyframes restart when the panel is interrupted; the content below jumps |
| `__block-editor-sheet.tsx:97` keyframe slide, 150ms, `bg-black/40` backdrop | `ui/drawer` (Base UI Drawer, `--ease-drawer`, swipe-to-dismiss, safe areas) | ADR 0085 §6; a flick should dismiss it |
| `__exercise-combobox.tsx:224` `transition-[color,box-shadow] duration-200` (built-in), `h-8` | Shared `SelectTrigger` styling: `pressable`, `h-11`, `text-base md:text-sm` | 44px + iOS 16px + one curve (same as #505 S8) |
| `programs.$programId.start.tsx:210` `transition-[color,box-shadow] duration-200` on the field wrapper | `duration-press ease-out` | Same rule |
| `token-popover.tsx:35,138,205`: `animate-in zoom-in-90`, 130ms, `transition-[left]` on the arrow | Being fixed in the separate PR. Noted only. `left` is a layout property. | — |
| RPE buttons 36×36 (`sessions.$sessionId.tsx`, Session Log); "Delete session" 32px; "Take it off this plan" 32px; archetype token "Threshold" 66×18 | `h-11` targets or `after:` hit areas (ADR 0028 §2) | 44px on touch |
| Runner circles 42px wide at 320px | Allow a wrap to 2 rows, or `min-w-11` with horizontal gap reduction | 44px |
| Rest bar keeps running over the outcome after Finish | Dismiss or pause the bar on finish | The bar is for between sets; after Finish it is noise |
| Drag handles and "+ block" visible in read mode on phone | Show only when editing, or behind "Rediger" | The read surface carries editing chrome. See the create-session audit. |
| `<details>` "Source" chevron `transition-transform` default curve | `motion-collapse` / `ease-out` | Same rule |
| Mobile-native: starting-weight input `type=number inputMode=decimal` | `type="text" inputMode="decimal"` + parse `,`/`.` on the server | Norwegian keyboards type a comma; see break-ui B2 |

## 5. break-ui-funn

| Sev | Value / condition | Where | What happens |
|---|---|---|---|
| **High** | A block repeat (`5×` circuit) on a strength session | `strength-log.server.ts:268-310,358-366` | The runner shows 1 set per lift. 4 of 5 rounds cannot be logged, and Finish folds a partial session. |
| **High** | `62,5` typed in starting weight (Chromium, `pressSequentially`) | `programs.$programId.start.tsx` (`type=number`) | The value becomes **`625`** silently. Program overview "Save weight" (`programs.run.$instanceId.tsx:358`) is the same kind of field. Confirm on an iOS nb keyboard. |
| **High** | Notes longer than 11ch at 390px | `score-stanza.tsx:313` | Cut with "…": story 32. |
| Med | Archetype "read" but not "stated" | `sessions.$sessionId.tsx:928-939` vs `:1510-1528` | The header says "Threshold" and the card says "This session has no archetype". Both are deliberate, but to the athlete they contradict each other. |
| Med | Catalogue description with markdown | `catalogue.tsx:356-359` | Literal `*shrinking the recovery*`, `*result*` |
| Med | Finish after 3 of 15 sets | runner → outcome | "Held … Stall Count 1" with no warning that 12 sets were untapped. Untapped ≠ failed? (owner) |
| Med | Search in Norwegian (`knebøy`, `benkpress`) | `library_.exercises.tsx:173-185` | "Ingen øvelse heter noe med «knebøy»". 836 corpus rows are English. Aliases exist (ADR 0061) but have no reader. |
| Med | Many identical "Back Squat" rows | `Exercise` table (40 rows named "Back Squat" in the db copy, mostly custom/test rows) | Not visible to kody (filtered by owner), but the corpus has "Back Squat" and "Barbell Squat" side by side. Search returns 62 squats with no equipment/muscle filter. |
| Low | One session on a lift | `__lift-chart.tsx` | One 300px-wide bar fills the chart |
| Low | Long program name in the runner eyebrow at 320px | `sessions.$sessionId_.log.tsx` header | "STRONGLIFTS 5×5 · W…" truncated |
| Low | 798 exercises, unpaginated | `library_.exercises.tsx:221-246` | 4,082 DOM nodes; longest task 536 ms at 4× CPU. OK today, but no paging or `content-visibility`. |
| Low | Dark mode | all shot pages | No invisible text found. The zone chip and shape colours hold. |
| Low | Exclamation copy | lift page "first time!" | Tone; Norwegian pass |

## 6. Engelsk tekst på norske flater

All of these are reached from Bibliotek or from I dag's "Se økta"/"Rediger"/"Logg sett for sett". Representative exact
strings follow. **Every visible string in these files is English.** The fix moves them into `labels.ts` (ADR 0081 §2).

| File:line | String(s) |
|---|---|
| `training/catalogue.tsx:102,578,584` | `The Catalogue`, `Sessions to retrieve from — trainm8's, other athletes', and your own.` |
| `catalogue.tsx:151,153,347` | `Suits …`, `Saved`, `… and up` |
| `catalogue.tsx:316` | `Adapted from … — that source belongs to the session this was forked from, not to this one.` |
| `catalogue.tsx:368,383,391` | `Add to my calendar`, `Saved`/`Save`, `Report` |
| `catalogue.tsx:460,464,469` | `Search sessions`, `Search`, `Filters`/`All sessions` |
| `catalogue.tsx:474-539` | `Discipline`, `Any discipline`, `Kind of session`, `Any kind`, `Phase`, `Goal event`, `Suits`, `Written by`, `Anyone` |
| `catalogue.tsx:546,550-557,597-610` | `In my list`, `Apply`, `Clear all`, `N sessions match your filters · showing N`, `Nothing matches …` |
| `catalogue.tsx:635,642-650,672-692` | `Show more`, `Your sessions`, the publishing sentence, `In the Catalogue`/`Withdrawn by you`/`Removed by a moderator`/`Not published`, `Manage`/`Publish` |
| `utils/labels.ts:144-…` (`SESSION_ARCHETYPE_LABELS`), `:157` (`Race simulation`), `CATALOGUE_*_LABELS`, `DISCIPLINE_LABELS`; `utils/training.ts` `getDisciplineLabel` (`'Ride'`) | Run, Ride, Easy, Long, Threshold, Intermediate, trainm8/… tier names |
| `utils/plan-generation/provenance.ts` | `Source: …`, `Coaching convention — trainm8 claims no published source for this session.` |
| `training/programs.tsx:51,74,80,87-98,143,176,185,196,270` | `Strength programs`, `Each one runs on the last weight you lifted — never on the calendar.`, empty state, `Running`, `Open your run`, `Correct a weight or end this program`, `Start {name}`, `Source`, `Unattributed` |
| `training/__programs-list-presenter.ts` | `on the first stall`, `after N stalls`, `rollback N sessions`, `of the last top set`, `doubled at ≥N reps`, `N day shapes · Workout A / Workout B` |
| `utils/strength-program*` (provenance notes, seed) | `Increments and the three-session −10 % Stall Cut are StrongLifts' own published defaults…` |
| `training/programs.$programId.start.tsx:32,147,159,161-162,…` | `Start … `, `Back to programs`, `Starting weights`, `One number per lift. After this the program decides the weight from what you log.`, the hints (`StrongLifts 5×5 publishes 20 kg here — the empty bar.`) |
| `training/programs.run.$instanceId.tsx:145,163,198,242-243,254,262,278-281,358,369` | `Running. The next weight comes from your last log…`, `Today: Workout A`, `Next after today:`, `Open today’s session`, `Your weights`, `Save weight`, `Stop this program`, `Stopping keeps every set you logged under it.` |
| `training/sessions.$sessionId_.log.tsx:94,285,450,505,518,643,706,1087,1123` | `Log · …`, `Log a working set first — there is nothing to finish yet.`, `This session has no lifts to log.`, `Back to today`, `Run your workout`, `Working sets`, `That set did not save — tap it again.`, `Finish workout`, `Already recorded.` |
| `training/__runner-presenter.ts:179,342,387,405,1001,1026,1032,1140-1141` | `Your gym makes … kg, not … kg.`, `Stall Count N`, `Could not be read`, `Lighter than prescribed`, `The rest timer survives a locked phone, but not a closed tab.`, `No gym is described, so no plates are solved.`, `This lift over time`, `Last time …`; sub-line `no load is prescribed for this lift, and a tap cannot invent one`; `N of 5 logged` |
| `training/__lift-help-panel.tsx:54,147`, `__outcome-panel.tsx:71,81,111`, `__rest-bar.tsx:96,149` | `About {lift}`, `Tell us what your gym has`, `What you lift next time`, `Back to today`, `Back to your sets`, `Rest timer`, `rest`, `Dismiss the rest timer` |
| `training/exercises.$exerciseId.tsx:167,221,235,279,318,405` | `Working weight`, `First time on this lift`, `Log a working set and this page fills in.`, `Your numbers for this lift`, `Records`, `Heaviest ever`, `Best 5-rep set`, `first time!`, `No estimated 1RM: …`, `Every session on this lift`, `N working sets`, `We could not find that exercise.` |
| `training/sessions.$sessionId.tsx:670-688` | `Delete session`, `Delete this session?`, `Keep session` |
| `sessions.$sessionId.tsx:746,753,937,981-982` | `Sets logged`/`Log your sets`, `Mark as missed`, `No archetype`, `Read from this session`/`Not enough to name it` |
| `sessions.$sessionId.tsx:1119,1342,1406,1416` | `Replan note:`, `Structure adherence`, `Planned vs actual`, `How the recorded effort compared…` |
| `sessions.$sessionId.tsx:1527-1528,1579-1588,1786-1837` | `vs last time` texts, `Telemetry overlay`, `Telemetry not available`, `Planned target`, `Move across the recording…` |
| `sessions.$sessionId.tsx:1970,2308-2328,2369` | `Heart rate`, `Moving time`, `Avg pace`, `Max speed`, `Avg power`, `Max power`, `Avg cadence`, `Recording` |
| `sessions.$sessionId.tsx:2451-2481,2510,2570,2577` | `Wrong session?`, `Move this recording to`, `Move recording`, `Take it off this plan`, `Session Log`, `Log your reflection`/`Update your reflection`, `How did the session go?`, `RPE (Rate of Perceived Exertion)`, `Save Session Log`, page title `Session`, status `Scheduled`/`Completed` |
| Token Sentence (`app/utils/workout-notation.ts`, `score-stanza.tsx`) | `warm-up`, `rest`, `block`, `+ block`, zone chips `Easy`/`Endurance`/`Tempo`. **Owner decision** (ADR 0027 A3 vs 0081). Shared with the create-session audit. |

Mixed already: the detail back link is `Tilbake til I dag`, and the hub plus "Alle øvelser" are Norwegian.

## 7. Ytelse (4× CPU, 390 touch, production build)

| Page | Load (ms) | FCP | Longest task | CLS | DOM |
|---|---|---|---|---|---|
| /library | 3044 | 1384 | 378 | 0 | 131 |
| /library/exercises (798 rows) | 4724 | 1008 | **536** | 0 | **4082** |
| /training/catalogue | 3450 | 684 | 375 | 0 | 766 |
| /training/programs | 2484 | 588 | 215 | 0 | 204 |
| detail, completed ride (telemetry) | 3698 | 1528 | **507** | 0 | 597 |
| detail, planned run | 2348 | 672 | 176 | 0 | 299 |
| runner | 2380 | 452 | 247 | 0 | 159 |
| lift-over-time | 2850 | 808 | 345 | 0 | 150 |

There are no layout shifts. The two 500 ms tasks are the unpaginated exercise list and telemetry chart hydration.
Neither is urgent. The exercise list can take paging (`?count=` like the catalogue) or `content-visibility: auto` on rows.

## 8. Prioritert fiksliste

| # | What | Files | Effort | Owner decision? |
|---|---|---|---|---|
| 1 | Runner honours block `repeatCount`: one circle per round per lift, with orderIndex across rounds. Covers the I dag quick log too, since it reads the same view. Add a test with the 5× circuit. | `utils/strength-log.server.ts`, `__runner-presenter.ts` (+tests), check `_home/timeline/strength-log-panel` | M | No |
| 2 | Kilo fields accept a comma: `type=text inputMode=decimal`, normalise `,` → `.` on the server (zod preprocess) | `programs.$programId.start.tsx`, `programs.run.$instanceId.tsx` | S | No |
| 3 | Story 32: drop the `truncate`/`max-w-[11ch]` on notes and let them wrap | `components/score-stanza.tsx:313` (+ test) | S | No |
| 4 | Norwegian kilo format `formatNbKg` (`82,5`), reps joined with ` · `; use it in programs, start, overview, runner, outcome, lift page, quick log. Recording km via `formatNbVolumeFigure`. | `utils/strength-log.ts`, `utils/format.ts`, presenters | M | Already decided (Round 2) |
| 5 | Bibliotek pages to Norwegian + design system: catalogue (cards show the Token Sentence + min/km, one primary, render markdown or strip it, drop the duplicate convention line, `Checkbox`/`Toggle`, `Collapsible` filters, type steps, luma radii), programs (contrast `/70` → plain, `Collapsible` "Kilde", presenter words), exercise list (paging), hub `pressable` | `catalogue.tsx`, `catalogue.place/publish/report`, `programs.tsx`, `__programs-list-presenter.ts`, `library*.tsx`, `labels.ts` (CATALOGUE_*, SESSION_ARCHETYPE_LABELS, DISCIPLINE) | L | Archetype/level words in Norwegian; whether exercise **names** get Norwegian aliases (ADR 0027 A3 says names are content) |
| 6 | Strength surfaces to Norwegian + design system: starting weights, program overview, runner, rest bar, help panel (→ `Collapsible`), outcome (`Stall Count` → plain words), lift page (`tabular-nums` not mono, a 1-session chart that is not one giant bar, "neste: +2,5 kg"). Say the gym absence once, not per lift. Rest bar stops on Finish. | `programs.$programId.start.tsx`, `programs.run.$instanceId.tsx`, `sessions.$sessionId_.log.tsx`, `__runner-presenter.ts`, `__rest-bar.tsx`, `__lift-help-panel.tsx`, `__outcome-panel*.ts(x)`, `exercises.$exerciseId.tsx`, `__lift-chart.tsx`, `__exercise-history-presenter.ts`, `labels.ts` (new STRENGTH_* block) | L | Warn before Finish when sets are untapped? Does untapped count as missed? ADR 0064 says circles scale .94/80 ms vs house `pressable`. |
| 7 | Workout Detail View as a reading surface: Norwegian, type steps, radii; "Slett økta" into an overflow; 44px RPE/actions; summary line in the track's currency (Arket M: `1 t 50 min · ~18 km`, strength `sett · kg`); resolve the archetype contradiction (say "lest av økta" in the card too); desktop two-column at `lg` | `sessions.$sessionId.tsx` (2,641 lines; split into `__session-*.tsx` while touching), `labels.ts` | L | Zone-chip words and colours (I1–I5 vs rolig/terskel); the Token Sentence glue words (shared with the create-session audit) |
| 8 | Replace the hand-rolled sheet with `ui/drawer`/`ui/sheet`; combobox trigger to the shared 44px select styling | `__block-editor-sheet.tsx`, `__exercise-combobox.tsx` | M | No (coordinate with the create-session PR: same files) |
| 9 | Exercise search finds Norwegian words: read `ExerciseAlias` in `getExerciseCatalog`; add equipment/muscle chips | `utils/workout.server.ts`, `library_.exercises.tsx` | M | Seed Norwegian aliases (owner) |
| 10 | Arket Q library side pane ("Bibliotek · legg på <dag>") from a chosen day on I dag ≥lg | `_home/timeline/day-pane.tsx`, catalogue loader seam | L | Yes: scope and whether it is in #505 v1 |
| 11 | Stale comment `programs.tsx:68-72`; "Dine løft" lists lifts that were never logged (rename "Løft i øktene dine", or list logged only) | `programs.tsx`, `library.tsx`, `labels.ts` | S | Wording |

**Proposed PR split (parallel, no shared files except `labels.ts`, where each PR adds its own new block):**

- **PR A, runner correctness:** #1, #2, #3. Files: `strength-log.server.ts`, `__runner-presenter.ts`, start/overview inputs, `score-stanza.tsx`. Small; ship first.
- **PR B, Bibliotek catalogue + programs list + hub + exercise list:** #5, #9, #11.
- **PR C, strength surfaces:** #4, #6. It touches `__runner-presenter.ts` after PR A, so rebase on A or land second.
- **PR D, Workout Detail View:** #7. It touches only `sessions.$sessionId.tsx` and new `__session-*` files.
- **PR E, primitives in the editor chrome:** #8. Belongs with or after the create-session audit's PR, because the files overlap.
- **Later:** #10 (Q side pane), after an owner decision.

`labels.ts` conflicts are append-only blocks and rebase cleanly. `format.ts` (`formatNbKg`) is owned by PR C. PR B and PR D
should call the existing `formatNbVolumeFigure` only, or wait for C.
