# Cross-app inventory: design-system debt, English on Norwegian surfaces, shared files

Repo `/home/user/trainm8`, `main` at `326fc7f` (I dag redesign, #537). Read-only audit: no repo file was changed. Sources: ADR 0085, `docs/design/design-system.md`, ADR 0081, ADR 0083 (`app/utils/app-tabs.ts` for which URL belongs to which tab), ADR 0028, BRIEF Round 2, issue #505.

## Summary

- **Design debt is in the parts of the app that #537 did not rebuild.** I dag has 30 radius hits, but they are almost all hand-typed `rounded-[9/10/14px]` (written to luma numbers before the scale existed), plus 26 hand-rolled Button-like `<button>`s. The rest of I dag is clean. The **session/workout editor** (no tab) has most of the raw colour (44 of 77) and raw motion (24 of 69), including the last tw-animate keyframes (`__block-editor-sheet`, `__lift-help-panel`, `token-popover`). **Sesong** and **Meg** owe mostly radius, `<details>` and small targets.
- **No hand-written `:hover` exists** (the only CSS `:hover` is the gated `@custom-variant` in `tailwind.css:31-37`). The chart's hover uses `onPointerEnter` with `pointerType === 'mouse'` (`chart.tsx:194`). Nothing needs migrating here.
- **English:** I dag, the first run, the Meg and Bibliotek hubs (`me.tsx`, `library.tsx`, `library_.exercises.tsx`) and Ukeskiftet are Norwegian in their JSX. The English that still reaches I dag comes from **the server and the DB**: legacy `replanReason` chips, recording titles (`45 min run`), generated workout titles (`Run`, `Strength`, `… · Workout A`), and the 404/400 error text. The tabs' sub-pages are almost entirely English: Sesong about 350 strings, Meg about 250, Bibliotek about 125, and sessions/editor about 200. `labels.ts` has about 33 English maps, in two blocks: lines 130–460 and 2500–2752.
- **Shared files:** `labels.ts`, `tailwind.css`, `format.ts`/`strength-log.ts`, `page-header.tsx`, `forms.tsx`, `chart.tsx`, `__plan-chrome.tsx` and the `__workout-detail-editor` subtree. Plan: one small "foundation" PR first (label sections, token additions, `formatNbKg`, ADR number reservations), then the area PRs in parallel, each owning disjoint files and its own `labels.ts` section.

### Method and caveats

- Scanned every non-test `.ts/.tsx` under `app/routes` and `app/components`, excluding `components/ui/` and `*prototype*`. Comments were stripped before matching. The scripts are in `scratchpad/inv/` (`scan.py`, `english.py`, `english_jsx.py`, `tests_assert.py`, `gen.py`). The raw JSON is beside them.
- **Tab assignment** follows `app-tabs.ts` `TAB_PREFIXES`. Route-local `__*.tsx` modules were assigned to the tab of the route that imports them. `__plan-chrome.tsx` (Sesong and Bibliotek) and `__workout-detail-editor.tsx` (I dag and the session page) are flagged as cross-area.
- Several of the counts are heuristics, and should be read as a floor:
  - **Btn** means a `<button>` with Button-like classes. Many on I dag are deliberately bespoke (day cells, strip bars, the I dag pill) and are not Button candidates. Each one needs a judgement call.
  - **T** (target) is a static guess. It does not see sizes that come from a parent, or `className` built by a helper.
  - The English detector is a word-list classifier, tuned against Norwegian markers. It misses English split across JSX expressions, and single ambiguous words (`Plan`, `Form`, `Start`).
  - Test references are substring matches. They are limited to tests that import or are named after the source file, to e2e tests (strings of 12+ characters only), and to `labels.test.ts`. Short single words can still match by coincidence.
- I read "Text below 44px targets on phones" as **tap targets below 44px**. Raw text sizes (`text-[12px]` and the like) were not counted.

## 1. Design-system debt per area

Counts per file. **R** radius (`rounded-lg`/`rounded-xl` incl. side variants, plus `rounded-[Npx]`), **C** raw colour (Tailwind palette, `white`/`black`, hex), **M** motion (raw `transition*`, `duration-<n>`/`duration-[..]`, `animate-*`, tw-animate keyframe classes, `ease-in`/`ease-linear`), **Btn** `<button>` with Button-like classes, **Txt** unstyled/text `<button>`, **Sel** native `<select>`, **D/P** dialog or popover not on `ui/` (direct `@base-ui/react` import or `role="dialog"`), **Det** `<details>` (candidate for `ui/collapsible`), **In** raw `<input type=checkbox|radio|text|number|date>`, **T** tap target likely under 44px (explicit `h-3…h-10`/`size-…`/`py-0…1.5`/`min-h-9/10` without an `after:`/`before:` hit area, or a text-sized button/summary/link with no height at all). `hover`: no hand-written `:hover` anywhere (see §1.3).

### I dag

| File | R | C | M | Btn | Txt | Sel | D/P | Det | In | T | Note |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `routes/_home/index.tsx` | · | 4 | 8 | · | · | · | · | · | · | 1 | radius/colour/motion hits are all in `MarketingLanding` (logged-out Epic Stack page, L440–510), not I dag |
| `routes/_home/timeline/day-stamp-cell.tsx` | 5 | · | · | 4 | · | · | · | · | · | · |  |
| `routes/_home/timeline/home-timeline.tsx` | · | · | · | 2 | · | · | · | · | · | 1 |  |
| `routes/_home/timeline/import-actions.tsx` | · | · | · | 1 | 1 | · | · | · | · | · |  |
| `routes/_home/timeline/season-pane.tsx` | 2 | · | · | 2 | · | · | · | · | · | 1 |  |
| `routes/_home/timeline/stream.tsx` | · | · | · | 2 | · | · | · | · | · | · |  |
| `routes/_home/timeline/strength-log-panel.tsx` | 3 | · | · | 4 | · | · | · | · | · | 1 |  |
| `routes/_home/timeline/week-change-card.tsx` | 9 | · | · | 5 | · | · | · | · | · | · |  |
| `routes/_home/timeline/week-strip.tsx` | 6 | · | · | 2 | · | · | · | · | · | · |  |
| `routes/_home/timeline/writing-line.tsx` | 5 | · | · | 4 | · | · | · | · | 2 | 1 |  |
| **Total** | **30** | **4** | **8** | **26** | **1** | **0** | **0** | **0** | **2** | **5** | |

<details><summary>Line-level detail</summary>

- **`routes/_home/index.tsx`**
  - colour: 501 `bg-violet-600/10`, 501 `hover:bg-violet-600/15`, 501 `dark:bg-violet-200`, 501 `dark:hover:bg-violet-100`
  - motion: 450 `animate-slide-top`, 450 `xl:animate-slide-left`, 466 `animate-slide-top`, 466 `xl:animate-slide-left`, 472 `animate-slide-top`, 472 `xl:animate-slide-left`, 492 `animate-roll-reveal`, 501 `transition`
  - targets: 475 `<a> no height/hit area (probable <44px)`
- **`routes/_home/timeline/day-stamp-cell.tsx`**
  - radius: 174 `rounded-[10px]`, 186 `rounded-[10px]`, 196 `rounded-[10px]`, 373 `rounded-[9px]`, 380 `rounded-[9px]`
  - controls: 170 `<button> styled like Button`, 200 `<button> styled like Button`, 369 `<button> styled like Button`, 384 `<button> styled like Button`
- **`routes/_home/timeline/home-timeline.tsx`**
  - controls: 605 `<button> styled like Button`, 664 `<button> styled like Button`
  - targets: 664 `<button> py-1`
- **`routes/_home/timeline/import-actions.tsx`**
  - controls: 172 `<button> (unstyled/text)`, 221 `<button> styled like Button`
- **`routes/_home/timeline/season-pane.tsx`**
  - radius: 416 `rounded-[2px]`, 643 `rounded-[1px]`
  - controls: 183 `<button> styled like Button`, 399 `<button> styled like Button`
  - targets: 210 `<Link> no height/hit area (probable <44px)`
- **`routes/_home/timeline/stream.tsx`**
  - controls: 1018 `<button> styled like Button`, 1498 `<button> styled like Button`
- **`routes/_home/timeline/strength-log-panel.tsx`**
  - radius: 44 `rounded-[10px]`, 46 `rounded-[10px]`, 316 `rounded-[10px]`
  - controls: 176 `<button> styled like Button`, 183 `<button> styled like Button`, 284 `<button> styled like Button`, 287 `<button> styled like Button`
  - targets: 93 `<Link> no height/hit area (probable <44px)`
- **`routes/_home/timeline/week-change-card.tsx`**
  - radius: 132 `rounded-[14px]`, 173 `rounded-[10px]`, 335 `rounded-[12px]`, 342 `rounded-[6px]`, 348 `rounded-[6px]`, 398 `rounded-[10px]`, 419 `rounded-[10px]`, 428 `rounded-[10px]`, 554 `rounded-[10px]`
  - controls: 96 `<button> styled like Button`, 170 `<button> styled like Button`, 415 `<button> styled like Button`, 423 `<button> styled like Button`, 551 `<button> styled like Button`
- **`routes/_home/timeline/week-strip.tsx`**
  - radius: 361 `rounded-xl`, 389 `rounded-lg`, 470 `rounded-lg`, 544 `rounded-t-[2px]`, 559 `rounded-t-[2px]`, 570 `rounded-[2px]`
  - controls: 460 `<button> styled like Button`, 507 `<button> styled like Button`
- **`routes/_home/timeline/writing-line.tsx`**
  - radius: 159 `rounded-[10px]`, 223 `rounded-[9px]`, 271 `rounded-[9px]`, 389 `rounded-[9px]`, 465 `rounded-[10px]`
  - controls: 136 `<input type=text>`, 211 `<button> styled like Button`, 294 `<button> styled like Button`, 380 `<input type=date>`, 424 `<button> styled like Button`, 461 `<button> styled like Button`
  - targets: 294 `<button> no height/hit area (probable <44px)`

</details>

### Sesong

| File | R | C | M | Btn | Txt | Sel | D/P | Det | In | T | Note |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `routes/training/__attach-event.tsx` | 1 | · | · | · | · | · | · | 1 | · | · |  |
| `routes/training/__philosophy-switch.tsx` | 2 | · | · | · | · | · | · | 1 | · | · |  |
| `routes/training/__plan-chrome.tsx` | 1 | · | 6 | · | · | · | · | 2 | · | 1 | shared by Sesong and Bibliotek (`catalogue.tsx`) |
| `routes/training/__season-chart.tsx` | 1 | · | · | · | · | · | · | · | · | · |  |
| `routes/training/__season-edits.tsx` | 2 | 2 | · | · | · | · | · | 1 | · | 1 |  |
| `routes/training/__stamp-pattern.tsx` | · | · | · | · | · | · | · | · | 1 | · |  |
| `routes/training/__week-pattern-editor.tsx` | · | · | · | · | · | · | · | · | · | 1 |  |
| `routes/training/events.$eventId.edit.tsx` | · | · | · | · | · | · | · | · | 1 | · |  |
| `routes/training/events.$eventId.tsx` | 3 | · | · | · | · | · | · | · | · | 1 |  |
| `routes/training/events.new.tsx` | · | · | · | · | · | · | · | · | 1 | · |  |
| `routes/training/events.tsx` | · | · | 1 | · | · | · | · | · | · | · |  |
| `routes/training/plan.generate.$eventId.tsx` | · | · | · | · | · | · | · | · | 3 | · |  |
| `routes/training/plan.new.$eventId.tsx` | · | · | 1 | · | · | · | · | · | 1 | 1 |  |
| `routes/training/plan.new.tsx` | · | · | · | · | · | · | · | · | 2 | 3 |  |
| `routes/training/plan.tsx` | 1 | · | 1 | · | · | · | · | 1 | · | 5 |  |
| **Total** | **11** | **2** | **9** | **0** | **0** | **0** | **0** | **6** | **9** | **13** | |

<details><summary>Line-level detail</summary>

- **`routes/training/__attach-event.tsx`**
  - radius: 47 `rounded-xl`
  - controls: 46 `<details>`
- **`routes/training/__philosophy-switch.tsx`**
  - radius: 105 `rounded-xl`, 351 `rounded-xl`
  - controls: 104 `<details>`
- **`routes/training/__plan-chrome.tsx`**
  - radius: 230 `rounded-xl`
  - motion: 108 `transition-colors`, 231 `transition-colors`, 249 `transition-transform`, 297 `transition-colors`, 334 `transition-transform`, 448 `transition-colors`
  - controls: 224 `<details>`, 293 `<details>`
  - targets: 443 `<Link> min-h-9`
- **`routes/training/__season-chart.tsx`**
  - radius: 1370 `rounded-xl`
- **`routes/training/__season-edits.tsx`**
  - radius: 598 `rounded-xl`, 782 `rounded-xl`
  - colour: 782 `border-amber-500/40`, 782 `bg-amber-500/10`
  - controls: 597 `<details>`
  - targets: 167 `<Link> no height/hit area (probable <44px)`
- **`routes/training/__stamp-pattern.tsx`**
  - controls: 206 `<input type=checkbox>`
- **`routes/training/__week-pattern-editor.tsx`**
  - targets: 957 `<Link> no height/hit area (probable <44px)`
- **`routes/training/events.$eventId.edit.tsx`**
  - controls: 225 `<input type=checkbox>`
- **`routes/training/events.$eventId.tsx`**
  - radius: 148 `rounded-lg`, 174 `rounded-lg`, 215 `rounded-lg`
  - targets: 177 `<Link> no height/hit area (probable <44px)`
- **`routes/training/events.new.tsx`**
  - controls: 165 `<input type=checkbox>`
- **`routes/training/events.tsx`**
  - motion: 47 `transition-colors`
- **`routes/training/plan.generate.$eventId.tsx`**
  - controls: 247 `<input type=radio>`, 277 `<input type=radio>`, 306 `<input type=number>`
- **`routes/training/plan.new.$eventId.tsx`**
  - motion: 884 `transition-colors`
  - controls: 889 `<input type=radio>`
  - targets: 459 `<Link> no height/hit area (probable <44px)`
- **`routes/training/plan.new.tsx`**
  - controls: 300 `<input type=radio>`, 389 `<input type=radio>`
  - targets: 190 `<Link> no height/hit area (probable <44px)`, 200 `<Link> no height/hit area (probable <44px)`, 370 `<Link> no height/hit area (probable <44px)`
- **`routes/training/plan.tsx`**
  - radius: 4048 `rounded-xl`
  - motion: 4075 `transition-transform`
  - controls: 4047 `<details>`
  - targets: 2165 `<Link> no height/hit area (probable <44px)`, 2223 `<Link> no height/hit area (probable <44px)`, 2901 `<Link> no height/hit area (probable <44px)`, 2951 `<Link> no height/hit area (probable <44px)`, 3236 `<a> no height/hit area (probable <44px)`

</details>

### Bibliotek

| File | R | C | M | Btn | Txt | Sel | D/P | Det | In | T | Note |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `routes/library.tsx` | · | · | 1 | · | · | · | · | · | · | · |  |
| `routes/training/catalogue.publish.$workoutId.tsx` | 1 | · | · | · | · | · | · | · | · | 1 |  |
| `routes/training/catalogue.report.$workoutId.tsx` | 2 | · | · | · | · | · | · | · | 1 | · |  |
| `routes/training/catalogue.tsx` | · | · | · | · | · | · | · | · | 1 | · |  |
| `routes/training/exercises.$exerciseId.tsx` | 2 | · | · | · | · | · | · | · | · | 1 |  |
| `routes/training/programs.$programId.start.tsx` | · | · | 2 | · | · | · | · | · | · | · |  |
| `routes/training/programs.run.$instanceId.tsx` | · | · | · | · | · | · | · | · | · | 1 |  |
| `routes/training/programs.tsx` | · | · | 2 | · | · | · | · | 1 | · | 3 |  |
| **Total** | **5** | **0** | **5** | **0** | **0** | **0** | **0** | **1** | **2** | **6** | |

<details><summary>Line-level detail</summary>

- **`routes/library.tsx`**
  - motion: 59 `transition-colors`
- **`routes/training/catalogue.publish.$workoutId.tsx`**
  - radius: 308 `rounded-xl`
  - targets: 273 `<Link> no height/hit area (probable <44px)`
- **`routes/training/catalogue.report.$workoutId.tsx`**
  - radius: 202 `rounded-xl`, 235 `rounded-xl`
  - controls: 204 `<input type=radio>`
- **`routes/training/catalogue.tsx`**
  - controls: 539 `<input type=checkbox>`
- **`routes/training/exercises.$exerciseId.tsx`**
  - radius: 343 `rounded-lg`, 380 `rounded-lg`
  - targets: 241 `<Link> py-1`
- **`routes/training/programs.$programId.start.tsx`**
  - motion: 210 `transition-[color,box-shadow]`, 210 `duration-200`
- **`routes/training/programs.run.$instanceId.tsx`**
  - targets: 319 `<Link> no height/hit area (probable <44px)`
- **`routes/training/programs.tsx`**
  - motion: 264 `transition-colors`, 273 `transition-transform`
  - controls: 260 `<details>`
  - targets: 89 `<Link> no height/hit area (probable <44px)`, 93 `<Link> no height/hit area (probable <44px)`, 261 `<summary> py-1`

</details>

### Meg

| File | R | C | M | Btn | Txt | Sel | D/P | Det | In | T | Note |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `routes/imports.upload.tsx` | · | · | · | · | · | · | · | · | · | 1 |  |
| `routes/me.tsx` | · | · | 1 | 1 | · | · | · | · | · | · |  |
| `routes/settings/profile/connections.tsx` | · | · | · | · | · | · | · | · | · | 1 |  |
| `routes/settings/profile/index.tsx` | · | · | · | 1 | · | · | · | · | 1 | · |  |
| `routes/settings/profile/two-factor/index.tsx` | · | · | · | · | · | · | · | · | · | 1 |  |
| `routes/settings/training/analyze.tsx` | 2 | · | · | · | · | · | · | 1 | · | 2 |  |
| `routes/settings/training/history.tsx` | 1 | · | · | · | · | · | · | · | · | · |  |
| `routes/settings/training/lifts.$exerciseId.tsx` | 2 | · | · | · | · | · | · | · | · | 3 |  |
| `routes/settings/training/lifts.$exerciseId_.propose.tsx` | 2 | · | · | · | · | · | · | 1 | · | 3 |  |
| **Total** | **7** | **0** | **1** | **2** | **0** | **0** | **0** | **2** | **1** | **11** | |

<details><summary>Line-level detail</summary>

- **`routes/imports.upload.tsx`**
  - targets: 131 `<Link> no height/hit area (probable <44px)`
- **`routes/me.tsx`**
  - motion: 125 `transition-colors (w/ duration token)`
  - controls: 237 `<button> styled like Button`
- **`routes/settings/profile/connections.tsx`**
  - targets: 175 `<a> no height/hit area (probable <44px)`
- **`routes/settings/profile/index.tsx`**
  - controls: 235 `<button> styled like Button`, 430 `<input type=checkbox>`
- **`routes/settings/profile/two-factor/index.tsx`**
  - targets: 70 `<a> no height/hit area (probable <44px)`
- **`routes/settings/training/analyze.tsx`**
  - radius: 270 `rounded-lg`, 290 `rounded-lg`
  - controls: 318 `<details>`
  - targets: 220 `<Link> no height/hit area (probable <44px)`, 319 `<summary> no height/hit area (probable <44px)`
- **`routes/settings/training/history.tsx`**
  - radius: 130 `rounded-lg`
- **`routes/settings/training/lifts.$exerciseId.tsx`**
  - radius: 336 `rounded-lg`, 371 `rounded-lg`
  - targets: 282 `<Link> no height/hit area (probable <44px)`, 311 `<Link> no height/hit area (probable <44px)`, 339 `<Link> no height/hit area (probable <44px)`
- **`routes/settings/training/lifts.$exerciseId_.propose.tsx`**
  - radius: 211 `rounded-lg`, 229 `rounded-lg`
  - controls: 270 `<details>`
  - targets: 181 `<Link> no height/hit area (probable <44px)`, 271 `<summary> no height/hit area (probable <44px)`, 329 `<Link> no height/hit area (probable <44px)`

</details>

### No tab: sessions / workout editor

| File | R | C | M | Btn | Txt | Sel | D/P | Det | In | T | Note |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `routes/training/__block-editor-sheet.tsx` | · | 1 | 15 | · | · | · | 1 | · | · | · |  |
| `routes/training/__empty-state.tsx` | · | · | · | 1 | · | · | · | · | · | 1 |  |
| `routes/training/__exercise-combobox.tsx` | · | · | 3 | 1 | 1 | · | · | · | · | 2 |  |
| `routes/training/__intensity-popover.tsx` | 4 | · | · | 3 | · | · | · | · | 1 | 1 |  |
| `routes/training/__lift-help-panel.tsx` | 1 | · | 4 | 1 | · | · | · | · | · | 1 |  |
| `routes/training/__outcome-panel.tsx` | · | · | · | · | 1 | · | · | · | · | · |  |
| `routes/training/__sets-popover.tsx` | 5 | · | · | 1 | 2 | · | · | · | 5 | 2 |  |
| `routes/training/__token-editor-controls.tsx` | 3 | · | · | · | · | · | · | · | 1 | · |  |
| `routes/training/__token-sentence-editor.tsx` | 1 | · | 1 | · | 1 | · | 1 | · | 1 | 1 |  |
| `routes/training/__validation-summary.tsx` | · | · | · | · | 1 | · | · | · | · | 1 |  |
| `routes/training/__workout-editor.tsx` | 2 | · | · | · | · | · | · | · | · | · |  |
| `routes/training/sessions.$sessionId.tsx` | 5 | 43 | · | · | · | · | · | · | · | 1 |  |
| `routes/training/sessions.$sessionId_.log.tsx` | 1 | · | 1 | 2 | · | · | · | · | · | · |  |
| **Total** | **22** | **44** | **24** | **9** | **6** | **0** | **2** | **0** | **8** | **10** | |

<details><summary>Line-level detail</summary>

- **`routes/training/__block-editor-sheet.tsx`**
  - colour: 89 `bg-black/40`
  - motion: 89 `data-open:animate-in`, 89 `data-open:fade-in-0`, 89 `data-closed:animate-out`, 89 `data-closed:fade-out-0`, 97 `data-open:animate-in`, 97 `data-open:fade-in-0`, 97 `data-open:slide-in-from-bottom-4`, 97 `data-closed:animate-out`, 97 `data-closed:fade-out-0`, 97 `data-closed:slide-out-to-bottom-4`, 97 `md:data-open:slide-in-from-bottom-0`, 97 `md:data-open:motion-safe:slide-in-from-right-4`, 97 `md:data-closed:slide-out-to-bottom-0`, 97 `md:data-closed:slide-out-to-right-4`, 97 `duration-150`
  - controls: 15 `direct @base-ui/react import: import { Dialog } from '@base-ui/react/dialog'`
- **`routes/training/__empty-state.tsx`**
  - controls: 179 `<button> styled like Button`
  - targets: 179 `<button> py-1.5`
- **`routes/training/__exercise-combobox.tsx`**
  - motion: 51 `transition-colors`, 224 `transition-[color,box-shadow]`, 224 `duration-200`
  - controls: 46 `<button> styled like Button`, 360 `<button> (unstyled/text)`
  - targets: 46 `<button> py-0.5`, 360 `<button> no height/hit area (probable <44px)`
- **`routes/training/__intensity-popover.tsx`**
  - radius: 646 `rounded-lg`, 784 `rounded-lg`, 795 `rounded-lg`, 803 `rounded-lg`
  - controls: 238 `<button> styled like Button`, 339 `<button> styled like Button`, 649 `<button> styled like Button`, 788 `<input type=text>`
  - targets: 649 `<button> min-h-10`
- **`routes/training/__lift-help-panel.tsx`**
  - radius: 58 `rounded-xl`
  - motion: 84 `animate-in`, 84 `fade-in-0`, 84 `slide-in-from-top-1`, 84 `duration-150`
  - controls: 51 `<button> styled like Button`
  - targets: 97 `<Link> no height/hit area (probable <44px)`
- **`routes/training/__outcome-panel.tsx`**
  - controls: 68 `<button> (unstyled/text)`
- **`routes/training/__sets-popover.tsx`**
  - radius: 427 `rounded-lg`, 438 `rounded-lg`, 454 `rounded-lg`, 576 `rounded-lg`, 601 `rounded-lg`
  - controls: 290 `<button> (unstyled/text)`, 431 `<input type=text>`, 495 `<button> (unstyled/text)`, 648 `<input type=number>`, 659 `<input type=number>`, 679 `<input type=number>`, 690 `<input type=number>`, 774 `<button> styled like Button`
  - targets: 290 `<button> no height/hit area (probable <44px)`, 495 `<button> no height/hit area (probable <44px)`
- **`routes/training/__token-editor-controls.tsx`**
  - radius: 219 `rounded-lg`, 229 `rounded-lg`, 239 `rounded-lg`
  - controls: 223 `<input type=text>`
- **`routes/training/__token-sentence-editor.tsx`**
  - radius: 1821 `rounded-lg`
  - motion: 1555 `transition-colors`
  - controls: 29 `direct @base-ui/react import: import { Popover as PopoverPrimitive } from '@base-ui/react/popover'`, 1814 `<input type=text>`, 2418 `<button> (unstyled/text)`
  - targets: 2418 `<button> no height/hit area (probable <44px)`
- **`routes/training/__validation-summary.tsx`**
  - controls: 193 `<button> (unstyled/text)`
  - targets: 193 `<button> no height/hit area (probable <44px)`
- **`routes/training/__workout-editor.tsx`**
  - radius: 123 `rounded-lg`, 143 `rounded-lg`
- **`routes/training/sessions.$sessionId.tsx`**
  - radius: 1421 `rounded-xl`, 1565 `rounded-xl`, 1585 `rounded-lg`, 2396 `rounded-lg`, 2530 `rounded-lg`
  - colour: 1118 `border-amber-500/40`, 1118 `bg-amber-500/10`, 1165 `bg-sky-400`, 1166 `text-sky-700`, 1166 `dark:text-sky-400`, 1167 `bg-sky-500/10`, 1170 `bg-emerald-500`, 1171 `text-emerald-700`, 1171 `dark:text-emerald-400`, 1172 `bg-emerald-500/10`, 1175 `bg-rose-500`, 1176 `text-rose-700`, 1176 `dark:text-rose-400`, 1177 `bg-rose-500/10`, 1312 `bg-emerald-500`, 1313 `text-emerald-700`, 1313 `dark:text-emerald-400`, 1314 `bg-emerald-500/10`, 1317 `bg-amber-500`, 1318 `text-amber-700`, 1318 `dark:text-amber-400`, 1319 `bg-amber-500/10`, 1836 `bg-emerald-500/25`, 1836 `ring-emerald-500/40`, 1962 `stroke-sky-500`, 1963 `bg-sky-500`, 1964 `bg-sky-500`, 1965 `text-sky-600`, 1965 `dark:text-sky-400`, 1972 `stroke-rose-500`, 1973 `bg-rose-500`, 1974 `bg-rose-500`, 1975 `text-rose-600`, 1975 `dark:text-rose-400`, 1982 `stroke-amber-500`, 1983 `bg-amber-500`, 1984 `bg-amber-500`, 1985 `text-amber-600`, 1985 `dark:text-amber-400`, 2143 `fill-emerald-500/15`, 2143 `stroke-emerald-500/40`, 2285 `text-emerald-600`, 2285 `dark:text-emerald-400`
  - targets: 1145 `<Link> no height/hit area (probable <44px)`
- **`routes/training/sessions.$sessionId_.log.tsx`**
  - radius: 1019 `rounded-xl`
  - motion: 934 `transition`
  - controls: 923 `<button> styled like Button`, 1007 `<button> styled like Button`

</details>

### No tab: first run

| File | R | C | M | Btn | Txt | Sel | D/P | Det | In | T | Note |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `routes/start/__first-run-fields.tsx` | · | · | · | · | · | · | · | · | 2 | · |  |
| `routes/start/__first-run-frame.tsx` | 2 | · | · | · | · | · | · | · | · | · |  |
| `routes/start/funn.tsx` | 2 | · | · | · | · | · | · | 1 | · | · |  |
| `routes/start/plan.tsx` | 1 | · | · | · | · | · | · | 1 | 1 | · |  |
| `routes/start/sporsmal.tsx` | · | · | · | · | · | · | · | · | 2 | · |  |
| `routes/start/uker.tsx` | · | · | · | · | 1 | · | · | · | · | · |  |
| **Total** | **5** | **0** | **0** | **0** | **1** | **0** | **0** | **2** | **5** | **0** | |

<details><summary>Line-level detail</summary>

- **`routes/start/__first-run-fields.tsx`**
  - controls: 44 `<input type=checkbox>`, 79 `<input type=radio>`
- **`routes/start/__first-run-frame.tsx`**
  - radius: 43 `rounded-xl`, 47 `rounded-xl`
- **`routes/start/funn.tsx`**
  - radius: 131 `rounded-xl`, 157 `rounded-xl`
  - controls: 156 `<details>`
- **`routes/start/plan.tsx`**
  - radius: 176 `rounded-xl`
  - controls: 175 `<details>`, 190 `<input type=radio>`
- **`routes/start/sporsmal.tsx`**
  - controls: 154 `<input type=radio>`, 172 `<input type=radio>`
- **`routes/start/uker.tsx`**
  - controls: 195 `<button> (unstyled/text)`

</details>

### No tab: other

| File | R | C | M | Btn | Txt | Sel | D/P | Det | In | T | Note |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `routes/$.tsx` | · | · | · | · | · | · | · | · | · | 1 |  |
| `routes/__design-tokens.tsx` | 2 | · | 2 | · | · | · | · | · | · | · | `/design` sheet: shows the old radii on purpose |
| `routes/admin/cache/index.tsx` | · | · | · | 1 | · | 1 | · | · | · | · |  |
| `routes/admin/moderation.tsx` | 1 | · | · | · | · | · | · | · | · | 1 |  |
| `routes/training/__provenance-week.tsx` | 8 | 2 | 4 | 6 | · | · | 1 | · | · | 2 | prototype (`/training/plan/provenance-prototype`), delete candidate |
| **Total** | **11** | **2** | **6** | **7** | **0** | **1** | **1** | **0** | **0** | **4** | |

<details><summary>Line-level detail</summary>

- **`routes/$.tsx`**
  - targets: 42 `<Link> no height/hit area (probable <44px)`
- **`routes/__design-tokens.tsx`**
  - radius: 285 `rounded-lg`, 286 `rounded-xl`
  - motion: 436 `transition`, 462 `ease-in`
- **`routes/admin/cache/index.tsx`**
  - controls: 108 `<button> styled like Button`, 146 `<select>`
- **`routes/admin/moderation.tsx`**
  - radius: 159 `rounded-xl`
  - targets: 210 `<Link> no height/hit area (probable <44px)`
- **`routes/training/__provenance-week.tsx`**
  - radius: 156 `rounded-xl`, 213 `rounded-xl`, 226 `rounded-lg`, 243 `rounded-[1px]`, 337 `rounded-xl`, 380 `rounded-xl`, 431 `rounded-xl`, 535 `rounded-xl`
  - colour: 618 `text-emerald-600`, 618 `dark:text-emerald-400`
  - motion: 76 `transition-colors`, 156 `transition-colors`, 226 `transition-colors`, 431 `transition-colors`
  - controls: 282 `hand-rolled dialog`, 73 `<button> styled like Button`, 151 `<button> styled like Button`, 224 `<button> styled like Button`, 275 `<button> styled like Button`, 296 `<button> styled like Button`, 428 `<button> styled like Button`
  - targets: 224 `<button> min-h-9`, 275 `<button> no height/hit area (probable <44px)`

</details>

### Shared components (app/components)

| File | R | C | M | Btn | Txt | Sel | D/P | Det | In | T | Note |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `components/chart/chart.tsx` | 1 | · | · | · | · | · | · | · | · | · |  |
| `components/dev-athlete-switcher.tsx` | · | 4 | · | 3 | · | · | · | · | · | 3 | dev only |
| `components/floating-toolbar.tsx` | 1 | · | · | · | · | · | · | · | · | · | no importer: dead, delete |
| `components/load-metric-badge.tsx` | · | 12 | · | · | · | · | · | · | · | · | no importer: dead, delete |
| `components/overlay-header.tsx` | · | · | · | · | · | · | 1 | · | · | · |  |
| `components/profile-bars.tsx` | 2 | 9 | · | · | · | · | · | · | · | · |  |
| `components/progress-bar.tsx` | · | · | 8 | · | · | · | · | · | · | · |  |
| `components/shape-strip.tsx` | 1 | · | · | · | · | · | · | · | · | · |  |
| `components/token-popover.tsx` | 1 | · | 8 | · | · | · | 1 | · | · | · |  |
| **Total** | **6** | **25** | **16** | **3** | **0** | **0** | **2** | **0** | **0** | **3** | |

<details><summary>Line-level detail</summary>

- **`components/chart/chart.tsx`**
  - radius: 443 `rounded-xl`
- **`components/dev-athlete-switcher.tsx`**
  - colour: 69 `border-amber-500`, 70 `text-amber-600`, 70 `dark:text-amber-400`, 132 `border-amber-500`
  - controls: 79 `<button> styled like Button`, 115 `<button> styled like Button`, 127 `<button> styled like Button`
  - targets: 79 `<button> py-1.5`, 115 `<button> py-1.5`, 127 `<button> py-0.5`
- **`components/floating-toolbar.tsx`**
  - radius: 12 `rounded-lg`
- **`components/load-metric-badge.tsx`**
  - colour: 19 `bg-sky-500/10`, 19 `text-sky-700`, 19 `dark:text-sky-300`, 20 `bg-rose-500/10`, 20 `text-rose-700`, 20 `dark:text-rose-300`, 39 `bg-amber-500/10`, 39 `text-amber-700`, 39 `dark:text-amber-300`, 40 `bg-emerald-500/10`, 40 `text-emerald-700`, 40 `dark:text-emerald-300`
- **`components/overlay-header.tsx`**
  - controls: 7 `direct @base-ui/react import: import { Dialog } from '@base-ui/react/dialog'`
- **`components/profile-bars.tsx`**
  - radius: 85 `rounded-[1px]`, 180 `rounded-t-[2px]`
  - colour: 10 `bg-sky-400`, 10 `dark:bg-sky-500`, 11 `bg-emerald-400`, 11 `dark:bg-emerald-500`, 12 `bg-amber-400`, 12 `dark:bg-amber-500`, 13 `bg-orange-500`, 14 `bg-rose-500`, 14 `dark:bg-rose-600`
- **`components/progress-bar.tsx`**
  - motion: 9 `transition`, 35 `animate-pulse`, 40 `duration-500`, 41 `transition`, 44 `transition-all`, 45 `transition`, 46 `transition`, 54 `animate-spin`
- **`components/shape-strip.tsx`**
  - radius: 65 `rounded-t-[3px]`
- **`components/token-popover.tsx`**
  - radius: 35 `rounded-xl`
  - motion: 35 `motion-safe:data-open:animate-in`, 35 `motion-safe:data-open:fade-in-0`, 35 `motion-safe:data-open:zoom-in-90`, 35 `duration-[130ms]`, 138 `motion-safe:transition-[transform]`, 138 `motion-safe:duration-[180ms]`, 205 `motion-safe:transition-[left]`, 205 `motion-safe:duration-[180ms]`
  - controls: 24 `direct @base-ui/react import: import { Popover as PopoverPrimitive } from '@base-ui/react/popover'`

</details>

### Resource routes (no UI)

| File | R | C | M | Btn | Txt | Sel | D/P | Det | In | T | Note |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `routes/resources/theme-switch.tsx` | · | · | · | · | 1 | · | · | · | · | · |  |
| **Total** | **0** | **0** | **0** | **0** | **1** | **0** | **0** | **0** | **0** | **0** | |

<details><summary>Line-level detail</summary>

- **`routes/resources/theme-switch.tsx`**
  - controls: 89 `<button> (unstyled/text)`

</details>

**All areas:** R 97, C 77, M 69, Btn 47, Txt 9, Sel 1, DP 5, Det 11, In 27, T 52

### 1.1 What the counts mean per area (reading guide)

| Area | Main debt | Note for the PR |
|---|---|---|
| **I dag** | 22 hand-typed `rounded-[Npx]`: `[10px]` maps to `rounded-2xl` (10.8), `[14px]` to `rounded-3xl`/`4xl`, `[9px]` to `rounded-2xl`, `[6px]` to `rounded-lg`, `[1–2px]` (bars) can stay. Also 26 Button-like `<button>`s in `week-change-card`, `writing-line`, `strength-log-panel`, `day-stamp-cell`. 6 old `rounded-lg/xl` sit in `week-strip.tsx` (361, 389, 470). | Ukeskiftet Ok/Nei takk (`week-change-card.tsx:415,423,551`) and the quick-log buttons (`strength-log-panel.tsx` `PRIMARY`/`SECONDARY` constants) are the clear `Button` candidates. Day cells and strip bars stay bespoke. `_home/index.tsx` hits are the logged-out `MarketingLanding`, which should be handled with marketing, not with I dag. |
| **Sesong** | 13 likely small targets: text `Link`s in `plan.tsx` 2165, 2223, 2901, 2951, 3236, and `plan.new.tsx` 190, 200, 370. Also 6 `<details>` and 9 raw radios/checkboxes. `__plan-chrome.tsx` carries 6 raw `transition-colors/transform`. | `__plan-chrome.tsx` is also imported by `catalogue.tsx` (Bibliotek), so it belongs to the Sesong PR and Bibliotek waits for it. |
| **Bibliotek** | `exercises.$exerciseId.tsx` (2 `rounded-lg`, a `py-1` link), `programs.tsx` (2 `<details>` with raw transitions), `programs.$programId.start.tsx:210` (`transition-[color,box-shadow] duration-200`, a copy of the old Select trigger), `catalogue.tsx` (native `<select>` is only in a comment; 1 raw checkbox). | Small. The rest of its look comes through `__plan-chrome`. |
| **Meg** | The settings sub-pages: `settings/training/*` uses `rounded-lg` (analyze 270/290, history 130, lifts 336/371, propose 211/229). There are 11 probable small targets (text links in lifts, propose, analyze, connections, two-factor), and `settings/profile/index.tsx:172` has a `size-10` avatar link. | The hub `me.tsx` is clean apart from one `<button>` (237) and a `transition-colors` that already uses a duration token. |
| **No tab: sessions / workout editor** | Raw colour: `sessions.$sessionId.tsx` has 46 palette classes (zone/compliance chips: sky, emerald, rose, amber), which should use `status-*`/`zone-*`/`track-*`. Keyframes: `__block-editor-sheet.tsx:89,97` (a hand-built Dialog sheet on tw-animate, which should become `ui/drawer`/`ui/sheet`), `__lift-help-panel.tsx:84`, `components/token-popover.tsx:35` (Popover on raw `@base-ui/react`, `duration-[130ms]`, `zoom-in-90`). `__exercise-combobox.tsx:224` copies the old Select `transition-[color,box-shadow] duration-200`. | These three keyframe users are the last reason `tw-animate-css` is imported (`tailwind.css:2-11`). Removing that import is a follow-up after this PR. |
| **No tab: first run** | `__first-run-frame.tsx:43,47`, `funn.tsx:131,157`, `plan.tsx:176` `rounded-xl`. 5 raw radios/checkboxes, 2 `<details>`. | Tiny. |
| **No tab: other** | `admin/*` (1 native `<select>`, `admin/cache/index.tsx:146`), `__design-tokens.tsx` (shows the old radii on purpose), and `__provenance-week.tsx` (a prototype with a hand-rolled `role="dialog"` at 282, which can be deleted rather than migrated). | Out of the tab PRs. |
| **Shared components** | `load-metric-badge.tsx` (12 palette classes, **no importer**) and `floating-toolbar.tsx` (no importer): delete both. `profile-bars.tsx` uses a palette ramp (sky/emerald/amber/orange/rose, 10–14), imported by I dag `stream.tsx` and the session page. `progress-bar.tsx` (root nav progress) has `transition-all`, `duration-500`, `animate-pulse` and `animate-spin`. `dev-athlete-switcher` is dev only. `chart.tsx:443` and `shape-strip.tsx:65` have one radius each. | `profile-bars`, `chart` and `shape-strip` are cross-area (see §3). |

### 1.2 Hover

- `hover:` utilities are gated app-wide by `@custom-variant hover` (`tailwind.css:31-37`, `(hover: hover) and (pointer: fine)`). There is **no hand-written `:hover` CSS** and no `[&:hover]` arbitrary variant outside that definition. `onMouseEnter` exists only in prototypes (`__prototype-variant-h.tsx:701`, `-j.tsx:1874`). `chart.tsx:194` uses `onPointerEnter`, guarded by `pointerType === 'mouse'`. **No migration item.**

### 1.3 File-overlap check for splitting by area

All counted files map to exactly one area. The exceptions are the shared files in §3: `__plan-chrome.tsx`, the `__workout-detail-editor.tsx` subtree, `profile-bars.tsx`, `score-stanza.tsx`, `chart.tsx`, `shape-strip.tsx`, `page-header.tsx`, `forms.tsx`, `error-boundary.tsx`, plus `labels.ts`, `tailwind.css` and `format.ts`.

## 2. English on Norwegian surfaces (ADR 0081)

Scope as briefed: the #505 surfaces (I dag list, week headers, ownership mark, Ukeskiftet, writing line, tabs, first run, Sesong edits, import and strength-log prompts) plus every page under the four tabs (Round 2 owner decision: bring Sesong, Bibliotek, workout pages, first run and imports to Norwegian). Pages under no tab (sessions, workout editor, auth, admin) are listed separately.

### 2.1 Server-generated and DB-stored English (known cases first)

| # | String (example) | Where it is made (file:line) | Stored? | Where the athlete sees it | Tests asserting the English |
|---|---|---|---|---|---|
| S1 | **Week Replan reasons**: `Last week has no measurable Plan Adherence — no adjustment, not enough data.`, `Last week ran N% under plan — bank the planned work; …`, `Last week matched the plan — …`, `…, but your Form reading is reliable after 42 days — day n/42 — no adjustment yet.`, `… Form is unavailable …`, `… you're absorbing it …`, `… nothing in the coming week can be softened …`, `softenedSentence`. | `app/utils/load/week-replan.ts:185,199,236-237,245,253,262,269,276,283,295` (`decideWeekReplan`) | **Yes**: `WeekReplan.reason` through `propose-week-change.ts:296-300`, then `week-replan.server.ts:140`, for every *hold* outcome (`no-change`/`insufficient-data`), still written today | **Today hidden**: `week-change.ts:194-198` sets `summary=null` when a week-level `keep` exists. **Visible** for a legacy pre-#505 `adjusted` row with no proposals: `summary` is rendered at `week-change-card.tsx:141-143` on I dag. `getLatestWeekReplan` (`training.server.ts:1611`) has no caller (dead). | `app/utils/load/week-replan.test.ts`, `week-replan.server.test.ts` |
| S2 | **Legacy Replan Notes** on sessions: `Last week ran 32% over plan and Form was −12 — softened this session ~24%.` | written by the pre-#505 applier. Today's applier writes the Norwegian `proposal.reason` (`week-replan-proposals.server.ts:460-588`). | **Yes**: `WorkoutSession.replanReason` (old rows) | I dag row facts: `row-content.ts:153-154`, then `stream.tsx:1151` and `day-pane.tsx:258`. Session page: `sessions.$sessionId.tsx:1117-1119` (with the English label `Replan note:`). | `app/routes/_home/index.dashboard.test.tsx:757-767`, `app/routes/training/sessions.$sessionId.route.test.tsx:1080,1093`, `app/utils/workout.server.test.ts`, `app/utils/load/session-nudge.server.test.ts` |
| S3 | **Session Nudge reasons**: `Over your plan N weeks`, `Form is low (TSB …)`, `You missed Tue's session`, `… — easing your next session.`, `Next session is strength — no Form-based ease yet.`, `… eased Thu's session to a 45-minute Z2 endurance session …`, `Your Form reading is reliable after …`, `… — your next session stands.` | `app/utils/load/session-nudge.ts:163-167,177,181-182,187,196,206,211-212,267,274-276,284,290-292,299,307`, and `_home/presenter.ts:352` (`missEasePendingReason`) | No (computed per request, and the eased *prescription* is written) | **Not rendered**: the I dag coach line is built from the decision's fields with `VERDICT_LABELS` (`timeline/presenter.ts:1385-1430`). The English still ships in the loader payload (`_home/index.tsx:156-178`). | `app/utils/load/session-nudge.test.ts`, `app/routes/_home/presenter.test.ts` (`your next session stands`, `Your Form reading is reliable`, `You missed`) |
| S4 | **Coach lines**: `Overreaching` / `Over your plan N weeks running — Form is diving. Ease back before it costs you.`, `Drifting` / `Under your plan …`, readiness `Fresh`/`Fatigued`/`Neutral` + `rested — go for the session` … | `app/utils/load/coach.ts:92-93,103-104`, `app/utils/load/readiness.ts:38-52` | No | **Not rendered** on I dag or Meg: they use `VERDICT_LABELS`, `NB_READINESS_LABELS` and `NB_READINESS_ADVICE` (`timeline/presenter.ts:1424-1430`, `__me-form-records-presenter.ts:148`) | `app/utils/load/coach.test.ts`, `app/utils/load/session-nudge.test.ts` |
| S5 | **Generated workout titles**: the discipline fallback `Run` / `Ride` / `Swim` / `Strength` | `app/utils/session-title.ts:98,122`, through `getDisciplineLabel` (`labels.ts:228-231`, `DISCIPLINE_LABELS` 130-135) | **Yes**: `Workout.title` at materialise, in `plan-outline/stamp.server.ts:468`, `day-stamp.ts:109`, `workout.server.ts:1320,1382` | I dag rows (`timeline/presenter.ts:1153` uses `entry.title` when present), day pane, session page | `app/utils/session-title.test.ts` |
| S6 | **Recording titles**: `45 min run`, `8.2 km ride` (also English `.` decimal) | `app/utils/session-title.ts:131-146`, called at `app/utils/training.ts:163-171` | No (derived at read) | I dag rows for an unplanned import, and the session page | `app/utils/training.test.ts`, `app/utils/session-title.test.ts`, `sessions.$sessionId.route.test.tsx` (`min run`) |
| S7 | **Strength program workout titles**: `5/3/1 · Workout A`; the description falls back to `Lift` | `app/utils/strength-program-seed.server.ts:415,419` | **Yes**: `Workout.title` (program days) | I dag rows, `programs.run`, the session page | `app/utils/strength-program.server.test.ts`, `app/routes/training/programs.route.test.tsx` |
| S8 | **Strength progression reasons** (program engine): `No working sets were logged for this lift, so nothing moved.`, `Rolled back N sessions to … kg …`, `An Anchor Re-estimate …` | `app/utils/strength/program-engine.ts:566,935,962,1053,1078,1106,1124,1142` | No (computed) | Session log outcome panel `__outcome-panel.tsx:154` (no tab), `programs.run` | `app/routes/training/__outcome-panel-presenter.test.ts:123`, `app/utils/strength/program-engine.test.ts` |
| S9 | **I dag error text**: `We could not find your training.` (404), and the 400s `That discipline needs the full editor` and `The sentence could not be read`, which `GeneralErrorBoundary` prints verbatim (`components/error-boundary.tsx:23`) | `app/routes/_home/index.tsx:536,275,309,338` | No | I dag error boundary | none found |
| S10 | **Unrendered I dag presenter English**: `Log your sets` (a type key mapped through `NB_SESSION_CTA_LABELS`), `${discipline} session` fallback, `Week n of N · X phase`, `n days to race`, `n% of planned endurance load` / `Planned endurance load unavailable` | `app/routes/_home/presenter.ts:92,117-118,216,478,489-496` | No | **Not rendered**: `buildTodayRow` reads only `cta` (Norwegian via `NB_SESSION_CTA_LABELS`). `plan.blockLabel` and `planWeekLabel` are used, and `arcLabel`/`weekLoadLabel`/`arcChipLabel` have no reader. Dead code, and delete candidates (the BRIEF's hero cleanup list). | `app/routes/_home/presenter.test.ts:287,420-505` |
| S11 | Catalogue corpus names and descriptions (`catalogue-corpus.*.ts`), shipped as migration `INSERT`s | `app/utils/catalogue-corpus.*.ts` | Yes (migration data) | Bibliotek → Katalog | `catalogue-corpus.test.ts`. This is content, not chrome, so whether to translate it is an **owner decision**. A change needs a new data migration (`docs/agents/production-seed-data.md`). |

**Fixing S1/S2 in the DB**, if wanted, means a one-off data migration that clears or translates the legacy `replanReason` and `WeekReplan.reason`. Without one, S1 still writes English for holds today: the fix in code is to store `keepReason(...)` (Norwegian) instead of `decision.reason` at `propose-week-change.ts:299`, and to keep `decideWeekReplan`'s `why` enum. S5 and S7 need a backfill for titles that are already stored, or a display-time mapping (`nbSessionNoun` already exists, at `timeline/presenter.ts:1153`).

### 2.2 `labels.ts` entries that are English, with where they render

`labels.ts` is Norwegian from about line 498 to 2499 (#505 work). English sits in **lines 130–460** (the legacy enum maps) and **2500–2752** (Sesong's season-chart and plan internals). Maps that never reach a rendered surface are marked as unused or internal. `QUALITY_ZONE_LABELS` (294-298: `tempo`, `threshold`, `VO₂ max`), `VOLUME_CURRENCY_UNITS` (464: `km/wk`, `h/wk`, `sets/wk`) and `VOLUME_UNITS` (475: `sets`) are also English: they render in Sesong (`plan.tsx`, `__season-chart.tsx`, `__track-editor.tsx`).

| Export (labels.ts line) | English entries (line: text) | Rendered by (area: file) | Tests asserting the English |
|---|---|---|---|
| `DISCIPLINE_LABELS` (130) | 131: “Run”; 132: “Bike”; 133: “Swim”; 134: “Strength” | Bibliotek: catalogue.tsx<br>Meg: analyze.tsx, history.tsx, index.tsx<br>Sesong: __season-anchor-editor.tsx, __season-chart.tsx, __stamp-pattern.tsx, __strength-segment-editor.tsx, __track-editor.tsx…<br>utils: workout-schema.ts | `routes/training/plan.route.test.tsx`, `utils/labels.test.ts`, `utils/session-title.test.ts` |
| `SESSION_ARCHETYPE_LABELS` (144) | 145: “Recovery”; 146: “Easy”; 147: “Long”; 148: “Steady”; 149: “Tempo”; 150: “Threshold” (+7) | Bibliotek: catalogue.place.$workoutId.tsx, catalogue.publish.$workoutId.tsx, catalogue.tsx<br>No tab: sessions / workout editor: sessions.$sessionId.tsx<br>Sesong: plan.generate.$eventId.tsx | `routes/training/catalogue.place.route.test.tsx`, `routes/training/catalogue.route.test.tsx`, `routes/training/sessions.$sessionId.route.test.tsx` |
| `CATALOGUE_PHASE_LABELS` (172) | 173: “Base”; 174: “Build”; 175: “Peak”; 176: “Taper”; 177: “Race week” | Bibliotek: catalogue.tsx | `routes/training/catalogue.route.test.tsx`, `utils/labels.test.ts` |
| `CATALOGUE_GOAL_EVENT_LABELS` (184) | 189: “Half marathon”; 190: “Marathon”; 191: “Trail” | Bibliotek: catalogue.tsx | — |
| `CATALOGUE_LEVEL_LABELS` (196) | 197: “Beginner”; 198: “Intermediate”; 199: “Advanced” | Bibliotek: catalogue.tsx | — |
| `CATALOGUE_TIER_LABELS` (207) | 209: “Community”; 210: “Yours” | Bibliotek: catalogue.tsx | `routes/training/catalogue.route.test.tsx` |
| `getDisciplineLabel` (228) | 229: “Ride” | Bibliotek: catalogue.place.$workoutId.tsx, catalogue.publish.$workoutId.tsx, catalogue.report.$workoutId.tsx, catalogue.tsx<br>I dag: presenter.ts<br>Meg: imports.upload.tsx<br>No tab: other: moderation.tsx<br>No tab: sessions / workout editor: __token-sentence-editor.tsx, sessions.$sessionId.tsx, sessions.new.tsx<br>Sesong: __week-pattern-editor.tsx, events.$eventId.edit.tsx, events.$eventId.tsx, events.new.tsx, events.tsx<br>utils: session-title.ts, step-kind-reconciliation.ts, training.ts | `routes/training/sessions.new.absent-facets.route.test.tsx`, `routes/training/sessions.new.intensity-popover.route.test.tsx`, `utils/labels.test.ts`, `utils/session-title.test.ts`, `utils/training.test.ts` |
| `INTENT_LABELS` (237) | 238: “Recovery”; 239: “Endurance”; 240: “Tempo”; 241: “Threshold”; 243: “Anaerobic”; 244: “Neuromuscular” (+7) | No tab: sessions / workout editor: sessions.$sessionId.tsx, sessions.new.tsx<br>Sesong: plan.generate.$eventId.tsx<br>utils: workout-schema.ts | `routes/training/sessions.$sessionId.route.test.tsx`, `routes/training/sessions.new.absent-facets.route.test.tsx`, `routes/training/sessions.new.empty-state.route.test.tsx`, `routes/training/sessions.new.intensity-popover.route.test.tsx`, `routes/training/sessions.new.route.test.tsx` (+5) |
| `STEP_KIND_LABELS` (259) | 260: “Cardio”; 261: “Strength”; 262: “Rest” | No tab: sessions / workout editor: __block-editor-sheet.tsx, __empty-state.tsx, __token-sentence-editor.tsx<br>utils: workout-schema.ts | `utils/labels.test.ts` |
| `INTENSITY_KIND_LABELS` (265) | 266: “Zone”; 270: “Power (W)”; 271: “Power (%)”; 272: “Pace”; 273: “Pace (%)”; 275: “Race pace” | No tab: sessions / workout editor: __intensity-editor.tsx<br>utils: workout-schema.ts | — |
| `EVENT_KIND_LABELS` (304) | 305: “Race”; 306: “Time Trial”; 307: “Fitness Goal” | Sesong: events.$eventId.edit.tsx, events.$eventId.tsx, events.new.tsx, events.tsx<br>utils: event-schema.ts | `routes/training/events.$eventId.test.ts` |
| `EVENT_STATUS_LABELS` (310) | 311: “Planned”; 312: “Completed”; 313: “Cancelled” | Sesong: events.$eventId.tsx, events.tsx<br>utils: event-schema.ts | `utils/labels.test.ts` |
| `EVENT_PRIORITY_LABELS` (322) | 323: “Priority A”; 324: “Priority B”; 325: “Priority C” | Sesong: events.$eventId.edit.tsx, events.new.tsx<br>utils: event-schema.ts | — |
| `TARGET_KIND_LABELS` (334) | 335: “No target”; 336: “Finish”; 338: “Pace”; 339: “Distance”; 340: “Placement”; 341: “Qualitative” | utils: event-schema.ts | `utils/labels.test.ts` |
| `UNIT_LABELS` (362) | 363: “Metric (km, kg)”; 364: “Imperial (mi, lb)” | Meg: index.tsx | — |
| `WEEKDAY_LABELS` (387) | 388: “Sunday”; 389: “Monday”; 390: “Tuesday”; 391: “Wednesday”; 392: “Thursday”; 393: “Friday” (+1) | Meg: index.tsx<br>utils: week-pattern.ts | `routes/_home/index.dashboard.test.tsx`, `routes/_home/index.writing-line.test.ts`, `utils/labels.test.ts` |
| `PATTERN_DAY_KIND_LABELS` (438) | 439: “Fixed session”; 440: “Share of the week” | Sesong: __week-pattern-editor.tsx | — |
| `VOLUME_CURRENCY_LABELS` (452) | 453: “Kilometres per week”; 454: “Hours per week”; 455: “TSS per week”; 456: “Working sets per week” | Sesong: __season-chart.tsx, __track-editor.tsx, plan.generate.$eventId.tsx, plan.new.$eventId.tsx | `routes/training/__season-chart.route.test.tsx`, `routes/training/plan.new.$eventId.route.test.tsx`, `tests/e2e/plan-authoring.test.ts` |
| `WEEK_ROLE_LABELS` (2500) | 2501: “Loading”; 2502: “Recovery”; 2503: “Taper” | Sesong: __phase-editor.tsx, __preset-gallery.tsx, __season-chart.tsx, plan.tsx | `routes/training/__phase-editor.route.test.tsx`, `routes/training/__season-chart.route.test.tsx`, `routes/training/plan.route.test.tsx`, `routes/training/plan.test.ts`, `utils/plan-outline/season-chart.test.ts` |
| `STRENGTH_GOAL_LABELS` (2519) | 2520: “Hypertrophy”; 2521: “Maximal strength”; 2522: “Power” | Sesong: __strength-segment-editor.tsx | `routes/training/plan.route.test.tsx`, `utils/labels.test.ts` |
| `STRENGTH_GOAL_SENTENCE_LABELS` (2537) | 2539: “maximal strength” | Sesong: plan.tsx | `routes/training/plan.route.test.tsx`, `utils/labels.test.ts` |
| `UNAVAILABLE_READING_LABELS` (2558) | 2562: “One training load across both your tracks reads Unavailable — lifting …”; 2564: “Your Fitness, Fatigue and Form read your endurance training only, and …” | Sesong: __season-chart.tsx, plan.tsx | — |
| `NO_CONTRIBUTION_LABELS` (2586) | 2588: “working sets carry no training load, and never convert into one”; 2590: “lifting carries no training load, and never converts into one”; 2591: “no zone system is set for that discipline”; 2592: “that zone system prices no intensity to read”; 2594: “those zones are read off max HR, and no max HR or threshold HR is stor…”; 2595: “no threshold pace is stored for that discipline” (+3) | Sesong: __season-chart.tsx<br>utils: season-chart.ts | `routes/training/__season-chart.route.test.tsx` |
| `CONVERSION_CONVENTION_LABELS` (2609) | 2610: “minutes in zone per quality session”; 2611: “the easy-pace ratio” | Sesong: __season-chart.tsx | `routes/training/__season-chart.route.test.tsx`, `utils/plan-outline/season-chart.test.ts` |
| `ACCUMULATED_SPAN_LABELS` (2629) | 2630: “Added up across your endurance tracks, because a TSS is the same hour …”; 2632: “Added up across your endurance tracks as what the week costs you in ti…” | Sesong: plan.tsx | — |
| `THRESHOLD_FIELD_LABELS` (2645) | 2646: “your stored threshold pace”; 2647: “your stored critical swim speed” | Sesong: __season-chart.tsx | — |
| `RHYTHM_LABELS` (2651) | 2652: “3:1 — every 4th week recovers”; 2653: “2:1 — every 3rd week recovers”; 2654: “No recovery weeks” | Sesong: __phase-editor.tsx, __preset-gallery.tsx | — |
| `RHYTHM_SUMMARY_LABELS` (2669) | 2672: “No recovery” | Sesong: __phase-editor.tsx | `utils/labels.test.ts` |
| `BOUNDARY_STEP_OUT_OF_FORCE_LABELS` (2715) | 2719: “Your season opens here, so there is no boundary to step at.” | Sesong: __strength-segment-editor.tsx, plan.tsx | — |
| `STRUCTURE_MODE_LABELS` (2730) | 2731: “Simple”; 2732: “Structured” | (internal to labels.ts / unused) | — |
| `PROVIDER_LABELS` (2745) | 2746: “Manual”; 2748: “Intervals.icu” | (internal to labels.ts / unused) | `tests/mocks/index.ts`, `tests/mocks/intervalsicu.ts`, `utils/labels.test.ts` |

### 2.3 Inline JSX / route-module English, per area

Strings in route and component files: JSX text, string attributes (`label`, `title`, `aria-label`, `placeholder`, `description`, …), object fields (`title:`, `description:`, `message:`, toasts, `meta`), and ternary branches. Each string carries its source file:line. **Source** is inline unless noted. The labels.ts maps are in §2.2 and the server strings in §2.1. **I dag and first run have no rendered inline English.** I dag's 6 hits are the logged-out marketing page (`_home/index.tsx:468,478`), the 404 (S9) and unrendered presenter strings (S10), and the first-run hit is a false positive. The hubs `me.tsx`, `library.tsx` and `library_.exercises.tsx` have none.

| Area | Files | Strings |
|---|---|---|
| I dag | 2 | 6 |
| Sesong | 16 | 351 |
| Bibliotek | 10 | 127 |
| Meg | 28 | 249 |
| No tab: sessions / workout editor | 16 | 197 |
| No tab: first run | 1 | 1 |
| No tab: auth / marketing | 14 | 69 |
| No tab: other | 5 | 42 |
| Shared components (app/components) | 6 | 7 |

#### I dag

<details><summary><code>routes/_home/index.tsx</code> — 3</summary>

- L468 (jsx-text) “The Epic Stack”
- L478 (jsx-text) “Getting Started guide”
- L536 (jsx-text) “We could not find your training.”

</details>

<details><summary><code>routes/_home/presenter.ts</code> — 3</summary>

- L117 (ternary) “Log session” — tests: `app/routes/_home/presenter.test.ts:503`, `app/routes/_home/presenter.test.ts:505`
- L118 (ternary) “View session” — tests: `app/routes/_home/presenter.test.ts:420`, `app/routes/_home/presenter.test.ts:486`, `app/routes/_home/presenter.test.ts:497`, `app/routes/_home/presenter.test.ts:499` (+7)
- L496 (ternary) “Planned endurance load unavailable” — tests: `app/routes/_home/presenter.test.ts:287`

</details>

#### Sesong

<details><summary><code>routes/training/__copy-week.tsx</code> — 13</summary>

- L84 (jsx-text) “Copy a week you liked”
- L90 (jsx-text) “, so the two weeks are separate from the moment they exist — edit one and the other does not move.” — tests: `app/routes/training/__copy-week.route.test.tsx:58`
- L90 (jsx-text) “own workout” — tests: `app/routes/training/__copy-week.route.test.tsx:58`
- L93 (jsx-text) “A week is copied”
- L94 (jsx-text) “exactly as you wrote it”
- L101 (jsx-text) “Your plan has one week, so there is no other week to copy it onto.”
- L140 (attr) “Copy this week”
- L149 (attr) “Onto this week” — tests: `app/routes/training/__copy-week.route.test.tsx:102`
- L157 (jsx-text) “Copy the week” — tests: `app/routes/training/__copy-week.route.test.tsx:79`, `app/routes/training/__copy-week.route.test.tsx:105`, `app/routes/training/__copy-week.route.test.tsx:117`, `app/routes/training/__copy-week.route.test.tsx:148`
- L197 (ternary) “Week” — tests: `app/routes/training/__copy-week.route.test.tsx:104`
- L245 (jsx-text) “Nothing has been written yet.” — tests: `app/routes/training/__copy-week.route.test.tsx:138`
- L283 (jsx-text) “Replace and copy” — tests: `app/routes/training/__copy-week.route.test.tsx:174`
- L287 (jsx-text) “Or pick an empty week instead.”

</details>

<details><summary><code>routes/training/__phase-editor.tsx</code> — 22</summary>

- L137 (jsx-text) “Current”
- L228 (jsx-text) “Remove”
- L282 (jsx-text) “Loading rhythm” — tests: `app/routes/training/__phase-editor.route.test.tsx:124`
- L321 (jsx-text) “This phase tapers” — tests: `app/routes/training/__phase-editor.route.test.tsx:121`
- L355 (attr) “Week roles” — tests: `app/routes/training/__phase-editor.route.test.tsx:88`
- L376 (ternary) “No recovery weeks in this phase.”
- L407 (object-field) “At the start”
- L410 (object-field) “After ${phase.name}”
- L418 (jsx-text) “Add a phase”
- L423 (ternary) “Name” — tests: `app/routes/training/__phase-editor.route.test.tsx:127`
- L428 (object-field) “e.g. Off-season”
- L434 (ternary) “Weeks”
- L450 (jsx-text) “Where it goes”
- L471 (jsx-text) “Your plan grows forward — adding a phase never moves the week your plan starts on.”
- L484 (jsx-text) “Add phase” — tests: `app/routes/training/__phase-editor.route.test.tsx:128`
- L513 (jsx-text) “Delete this plan”
- L518 (ternary) “Every”
- L524 (jsx-text) “Delete plan”
- L531 (jsx-text) “Delete this plan?”
- L537 (ternary) “It does not touch any session you have already trained.”
- L545 (jsx-text) “Keep plan”
- L546 (jsx-text) “Delete plan”

</details>

<details><summary><code>routes/training/__preset-gallery.tsx</code> — 5</summary>

- L91 (jsx-text) “Start from a shape”
- L107 (attr) “Season shapes”
- L132 (jsx-text) “A shape says how your season is built, never how big your weeks are. Your start week, your training tracks and the volume you start at are u”
- L142 (jsx-text) “Weeks come off your base first, then forward through your season, and your taper is never shortened.”
- L405 (attr) “${preset.name}: the load profile it lays down, each week as a percentage of your opening week”

</details>

<details><summary><code>routes/training/__season-anchor-editor.tsx</code> — 24</summary>

- L126 (object-field) “How much a week are you starting from?”
- L134 (object-field) “Type a weekly volume, e.g. 45”
- L246 (jsx-text) “Season anchors”
- L251 (jsx-text) “list of dated segments”
- L253 (jsx-text) “, and the weeks you already lived are left exactly as they were.”
- L253 (jsx-text) “from this week on, I am starting from here”
- L256 (jsx-text) “A re-anchor is a”
- L257 (jsx-text) “fresh start, not a discount”
- L260 (jsx-text) “stay hand-set, and stay revertible.”
- L315 (attr) “${DISCIPLINE_LABELS[track.discipline]} season anchors”
- L336 (jsx-text) “: no anchor covers them, and the app will not make a number up for a week it cannot derive.”
- L387 (ternary) “Outside your plan’s weeks”
- L396 (ternary) “Season opening”
- L401 (ternary) “This anchor takes effect from a week your plan no longer covers — a segment is dated, so shortening your season leaves it where it was. Remo”
- L432 (jsx-text) “Save”
- L438 (jsx-text) “Your season keeps this one: every week up to your next re-anchor is derived from it. Change the number here rather than removing it.”
- L458 (jsx-text) “Remove this re-anchor”
- L495 (jsx-text) “Every week of this plan already carries an anchor, so there is no week left to re-anchor from.”
- L506 (jsx-text) “Re-anchor from a week”
- L509 (ternary) “From week”
- L510 (attr) “Pick a week”
- L513 (object-field) “Week ${week.weekInPlan} · ${formatDate(week.startsAt, timezone)}” — tests: `tests/e2e/season-edits.test.ts:37`, `tests/e2e/plan-authoring.test.ts:164`, `tests/e2e/plan-authoring.test.ts:177`, `tests/e2e/mobile-overflow.test.ts:170`
- L531 (jsx-text) “Your ramp restarts here: the week you pick”
- L532 (jsx-text) “this number, and the loading weeks after it climb from it. Everything before it is untouched.”

</details>

<details><summary><code>routes/training/__season-chart.tsx</code> — 30</summary>

- L151 (jsx-text) “weeks: Array”
- L174 (ternary) “Fitness”
- L304 (attr) “Your season”
- L415 (attr) “Read in” — tests: `app/routes/training/__season-chart.route.test.tsx:234`, `app/routes/training/__season-chart.route.test.tsx:239`, `app/routes/training/__season-chart.route.test.tsx:244`, `app/routes/training/__season-chart.route.test.tsx:284` (+3)
- L536 (ternary) “No change to read”
- L858 (jsx-text) “Event”
- L926 (jsx-text) “Tap a week to read the fitness your plan projects for it.”
- L1053 (jsx-text) “Tap a week to read it — its values, and where a derived number came from.”
- L1125 (ternary) “Season Anchor” — tests: `app/utils/labels.test.ts:293`, `app/routes/training/__season-chart.route.test.tsx:385`, `tests/e2e/plan-authoring.test.ts:11`
- L1181 (jsx-text) “Where this number comes from” — tests: `app/routes/training/__season-chart.route.test.tsx:343`, `app/routes/training/__season-chart.route.test.tsx:368`
- L1217 (jsx-text) “This week decomposed into intensity buckets”
- L1225 (jsx-text) “Hours”
- L1228 (jsx-text) “Distance”
- L1231 (jsx-text) “Load”
- L1275 (ternary) “You authored”
- L1276 (ternary) “Quality time in zone”
- L1277 (ternary) “Quality distance”
- L1278 (ternary) “Quality load”
- L1279 (ternary) “Easy time”
- L1280 (ternary) “Easy distance”
- L1281 (ternary) “Easy load”
- L1282 (ternary) “Easy-pace ratio”
- L1283 (ternary) “Easy speed”
- L1285 (ternary) “Easy intensity”
- L1286 (ternary) “Easy load per hour”
- L1287 (ternary) “The week, in km”
- L1288 (ternary) “The week, in hours”
- L1289 (ternary) “The week, in TSS”
- L1373 (jsx-text) “Form does not draw here” — tests: `app/routes/training/__season-chart.route.test.tsx:174`
- L1374 (jsx-text) “Your plan says how much a week holds and not which days hold it, so a replay has to spread each week evenly. Fitness survives that — it read”

</details>

<details><summary><code>routes/training/__stamp-pattern.tsx</code> — 12</summary>

- L112 (jsx-text) “Put it on your calendar” — tests: `tests/e2e/plan-authoring.test.ts:176`
- L116 (jsx-text) “into the weeks you pick. They are ordinary sessions from that moment on — edit one, move it, delete it, log it. Nothing stays linked to the ” — tests: `tests/e2e/plan-authoring.test.ts:185`
- L116 (jsx-text) “real sessions” — tests: `tests/e2e/plan-authoring.test.ts:185`
- L121 (jsx-text) “Stamp as few or as many weeks as you like. The figures above are derived from your anchor and your ramps and do not change with how far ahea”
- L128 (jsx-text) “Add days to a pattern above, and you can stamp it from here.”
- L195 (jsx-text) “Weeks”
- L223 (jsx-text) “Stamp these weeks” — tests: `app/routes/training/__stamp-pattern.route.test.tsx:93`, `tests/e2e/plan-authoring.test.ts:178`
- L268 (ternary) “Some of those weeks already have sessions” — tests: `app/routes/training/__stamp-pattern.route.test.tsx:130`
- L270 (jsx-text) “Nothing has been written yet.” — tests: `app/routes/training/__stamp-pattern.route.test.tsx:132`
- L321 (jsx-text) “Replace and stamp” — tests: `app/routes/training/__stamp-pattern.route.test.tsx:162`
- L325 (jsx-text) “Or untick those weeks above and stamp the rest.”
- L344 (jsx-text) “Weeks that differ from your mix”

</details>

<details><summary><code>routes/training/__strength-segment-editor.tsx</code> — 22</summary>

- L156 (object-field) “Type a percentage, or leave it blank”
- L210 (object-field) “A whole number of weeks, or blank for the convention”
- L407 (jsx-text) “no lifting” — tests: `app/routes/training/plan.route.test.tsx:221`, `app/routes/training/plan.route.test.tsx:3029`, `app/routes/training/plan.route.test.tsx:3039`, `app/routes/training/plan.route.test.tsx:3292` (+1)
- L407 (jsx-text) “— something you said, not a gap in your plan.” — tests: `app/routes/training/plan.route.test.tsx:221`, `app/routes/training/plan.route.test.tsx:3029`, `app/routes/training/plan.route.test.tsx:3039`, `app/routes/training/plan.route.test.tsx:3292` (+1)
- L422 (jsx-text) “, counted across your whole body rather than per muscle group or per movement. There is no published number to hold that against: nobody mea” — tests: `app/routes/training/plan.route.test.tsx:2954`
- L422 (jsx-text) “total working sets” — tests: `app/routes/training/plan.route.test.tsx:2954`
- L445 (jsx-text) “. Add one below when you know which weeks you are in the gym.” — tests: `app/routes/training/plan.route.test.tsx:221`, `app/routes/training/plan.route.test.tsx:3029`, `app/routes/training/plan.route.test.tsx:3039`, `app/routes/training/plan.route.test.tsx:3292` (+1)
- L445 (jsx-text) “no lifting” — tests: `app/routes/training/plan.route.test.tsx:221`, `app/routes/training/plan.route.test.tsx:3029`, `app/routes/training/plan.route.test.tsx:3039`, `app/routes/training/plan.route.test.tsx:3292` (+1)
- L495 (ternary) “Outside your plan’s weeks” — tests: `app/routes/training/plan.route.test.tsx:3305`, `app/routes/training/__strength-segment-editor.route.test.tsx:249`
- L694 (ternary) “Opens on”
- L695 (attr) “Pick a week”
- L698 (object-field) “Week ${week.weekInPlan} · ${formatDate(week.startsAt, timezone)}” — tests: `app/routes/training/plan.route.test.tsx:279`, `app/routes/training/plan.route.test.tsx:1014`, `app/routes/training/plan.route.test.tsx:1025`, `app/routes/training/plan.route.test.tsx:1117` (+10)
- L703 (ternary) “Weeks” — tests: `app/routes/training/plan.route.test.tsx:1014`, `app/routes/training/plan.route.test.tsx:1025`, `app/routes/training/plan.route.test.tsx:2784`
- L717 (attr) “Pick a goal”
- L725 (ternary) “Sessions a week”
- L744 (attr) “Volume ramp, % a loading week”
- L785 (ternary) “Deload weeks at the end”
- L854 (jsx-text) “Load band, derived” — tests: `app/routes/training/plan.route.test.tsx:2974`
- L856 (ternary) “Pick a goal”
- L860 (jsx-text) “Reps, derived” — tests: `app/routes/training/plan.route.test.tsx:2976`
- L862 (ternary) “Pick a goal”
- L866 (jsx-text) “Both come from the goal you picked above and there is nothing to type: change the goal and the band moves with it. How much lifting is a sep”

</details>

<details><summary><code>routes/training/__track-editor.tsx</code> — 11</summary>

- L154 (attr) “Training tracks” — tests: `tests/e2e/plan-authoring.test.ts:133`
- L196 (attr) “Add a training track”
- L231 (attr) “Remove the ${label} track”
- L232 (jsx-text) “Remove”
- L252 (jsx-text) “Keep track”
- L253 (jsx-text) “Remove track”
- L326 (jsx-text) “Add a training track”
- L379 (attr) “Pick the unit you plan in”
- L383 (ternary) “Pick the unit you plan in”
- L402 (jsx-text) “Proposed from your own history.”
- L445 (jsx-text) “Add track”

</details>

<details><summary><code>routes/training/__week-pattern-editor.tsx</code> — 40</summary>

- L146 (ternary) “Earlier in the day”
- L147 (ternary) “Later in the day”
- L187 (jsx-text) “Your typical week” — tests: `tests/e2e/plan-authoring.test.ts:172`
- L190 (jsx-text) “Describe the week you actually train once, instead of scheduling every week by hand. A day is either a”
- L192 (jsx-text) “fixed session”
- L192 (jsx-text) “— prescribed as you authored it, the same intervals in a big week and a small one — or a”
- L213 (attr) “Week patterns”
- L293 (jsx-text) “Read this week”
- L301 (ternary) “Week”
- L378 (jsx-text) “No days yet. Add the sessions you train in a normal week.”
- L464 (ternary) “Unknown track”
- L466 (ternary) “Workout removed”
- L595 (ternary) “The workout this day prescribed is gone, so there is nothing to read a volume off.”
- L631 (attr) “Week target”
- L640 (attr) “Prescribed by fixed days”
- L647 (attr) “Left for the share days”
- L655 (attr) “Taken by no day”
- L829 (jsx-text) “This plan has no training track yet, and a pattern day draws its volume from one.”
- L838 (jsx-text) “Add a day”
- L872 (jsx-text) “Training track” — tests: `tests/e2e/plan-authoring.test.ts:133`
- L890 (jsx-text) “A swim day draws swim volume, so the day says which track it belongs to.”
- L898 (jsx-text) “What kind of day”
- L924 (ternary) “A relative weight, normalised across the week — this day absorbs its part of whatever the fixed sessions leave.”
- L931 (ternary) “Relative weight”
- L957 (jsx-text) “author a session”
- L966 (ternary) “Workout”
- L982 (jsx-text) “No shape — volume only”
- L998 (ternary) “A shape is scaled to the share this day takes. Leave it out for volume with no structure.”
- L1003 (jsx-text) “Add day”
- L1012 (ternary) “Training track” — tests: `tests/e2e/plan-authoring.test.ts:133`
- L1049 (jsx-text) “Add a week pattern”
- L1058 (ternary) “Name”
- L1063 (object-field) “e.g. Weekday base week”
- L1068 (jsx-text) “Add pattern”
- L1102 (jsx-text) “No pattern yet.”
- L1108 (jsx-text) “Build me a typical week”
- L1111 (jsx-text) “Or name your own below and add the days yourself.”
- L1129 (jsx-text) “Delete pattern”
- L1156 (jsx-text) “Keep pattern”
- L1157 (jsx-text) “Delete pattern”

</details>

<details><summary><code>routes/training/events.$eventId.edit.tsx</code> — 17</summary>

- L36 (ternary) “Edit Event \| Trainm8”
- L157 (attr) “Edit Event”
- L158 (object-field) “Event”
- L202 (ternary) “Start date”
- L250 (ternary) “Target (optional)”
- L259 (ternary) “Target time (seconds)”
- L262 (object-field) “e.g. 10800 for 3 hours”
- L271 (ternary) “Target pace (seconds per km)”
- L274 (object-field) “e.g. 255 for 4:15/km”
- L283 (ternary) “Target distance (meters)”
- L286 (object-field) “e.g. 42195 for marathon”
- L295 (ternary) “Target placement (position)”
- L298 (object-field) “e.g. 1 for first place”
- L307 (ternary) “Target description”
- L317 (ternary) “Notes (optional)”
- L320 (object-field) “Any notes about this event...”
- L329 (jsx-text) “Save changes”

</details>

<details><summary><code>routes/training/events.$eventId.tsx</code> — 19</summary>

- L62 (ternary) “Event \| Trainm8”
- L149 (jsx-text) “Target”
- L176 (jsx-text) “Linked session”
- L180 (jsx-text) “View session” — tests: `tests/e2e/cta-semantics.test.ts:8`, `tests/e2e/cta-semantics.test.ts:17`
- L186 (jsx-text) “Unlink result”
- L197 (jsx-text) “Set result”
- L232 (jsx-text) “Set as result”
- L248 (jsx-text) “Cancel event”
- L255 (jsx-text) “Cancel this event?”
- L256 (jsx-text) “The event stays in your list with a cancelled status, so your planning history stays intact. To remove the event entirely, use Delete instea”
- L265 (jsx-text) “Keep event”
- L266 (jsx-text) “Cancel event”
- L279 (jsx-text) “Delete”
- L286 (jsx-text) “Delete this event?” — tests: `tests/e2e/cta-semantics.test.ts:94`
- L298 (jsx-text) “Keep event”
- L299 (jsx-text) “Delete event” — tests: `tests/e2e/cta-semantics.test.ts:110`
- L325 (attr) “Event” — tests: `app/routes/training/events.$eventId.test.ts:176`
- L326 (object-field) “Events”
- L342 (jsx-text) “Edit”

</details>

<details><summary><code>routes/training/events.new.tsx</code> — 17</summary>

- L29 (object-field) “New Event \| Trainm8”
- L96 (attr) “New Event”
- L97 (object-field) “Events”
- L142 (ternary) “Start date”
- L189 (ternary) “Target (optional)”
- L198 (ternary) “Target time (seconds)”
- L201 (object-field) “e.g. 10800 for 3 hours”
- L210 (ternary) “Target pace (seconds per km)”
- L213 (object-field) “e.g. 255 for 4:15/km”
- L222 (ternary) “Target distance (meters)”
- L225 (object-field) “e.g. 42195 for marathon”
- L234 (ternary) “Target placement (position)”
- L237 (object-field) “e.g. 1 for first place”
- L246 (ternary) “Target description”
- L256 (ternary) “Notes (optional)”
- L259 (object-field) “Any notes about this event...”
- L268 (jsx-text) “Create Event”

</details>

<details><summary><code>routes/training/events.tsx</code> — 6</summary>

- L27 (object-field) “Events \| Trainm8”
- L99 (attr) “Events”
- L106 (jsx-text) “+ New Event”
- L116 (jsx-text) “No events yet”
- L117 (jsx-text) “Events are race dates, time trials, and fitness goals that anchor your training plan.”
- L124 (jsx-text) “Create your first event”

</details>

<details><summary><code>routes/training/plan.generate.$eventId.tsx</code> — 18</summary>

- L75 (object-field) “Your season \| Trainm8”
- L87 (ternary) “This is my first structured season”
- L88 (ternary) “I am coming back from injury or a long break”
- L89 (ternary) “I am training consistently and building”
- L190 (attr) “Your season”
- L209 (attr) “Your season, ready to review”
- L212 (object-field) “Lay it out myself”
- L223 (jsx-text) “Every session is retrieved from the Catalogue and shows where it came from. Nothing is on your calendar until you add it.”
- L235 (jsx-text) “Where are you right now?”
- L266 (attr) “The shape of the season”
- L269 (jsx-text) “A default and never a recommendation — a shape that fits your calendar is not thereby the right season for you.”
- L322 (jsx-text) “Pre-filled from your own recent training, and yours to change.”
- L329 (jsx-text) “Rebuild the season”
- L335 (jsx-text) “The season”
- L352 (attr) “The remaining ${weeks.length - WEEKS_SHOWN} weeks”
- L379 (jsx-text) “Everything lands editable, like any other session — and each one keeps a pointer back to the Catalogue row it came from.”
- L403 (jsx-text) “What this season does not include”
- L454 (jsx-text) “Race week”

</details>

<details><summary><code>routes/training/plan.new.$eventId.tsx</code> — 17</summary>

- L122 (object-field) “Lay out your season \| Trainm8”
- L164 (object-field) “Pick the unit you plan in”
- L167 (object-field) “A starting volume is required”
- L419 (attr) “Lay out your season” — tests: `tests/e2e/plan-authoring.test.ts:85`
- L428 (jsx-text) “Goal created” — tests: `tests/e2e/plan-authoring.test.ts:90`
- L441 (jsx-text) “Or let trainm8 build it”
- L442 (jsx-text) “A whole season with real sessions in it, each retrieved from the Catalogue and showing where it came from. Nothing reaches your calendar unt”
- L450 (jsx-text) “Generate my season”
- L459 (jsx-text) “Add one to the event”
- L470 (jsx-text) “How should your season be built?”
- L510 (attr) “${rest.length} more lengths” — tests: `tests/e2e/plan-authoring.test.ts:97`
- L598 (jsx-text) “A shape is a fixed length, so it is never stretched to reach your event. Whichever you pick, your plan says where it ends and you decide whe”
- L633 (jsx-text) “Which week does your plan start?”
- L646 (ternary) “Plan start week”
- L661 (jsx-text) “Create plan”
- L738 (attr) “Pick the unit you plan in”
- L756 (jsx-text) “Proposed from your own history.”

</details>

<details><summary><code>routes/training/plan.tsx</code> — 78</summary>

- L291 (object-field) “Plan \| Trainm8”
- L301 (ternary) “Blocks” — tests: `app/routes/training/plan.route.test.tsx:1014`, `app/routes/training/plan.route.test.tsx:1025`, `app/routes/training/plan.route.test.tsx:2784`, `app/routes/training/plan.new.$eventId.route.test.tsx:415`
- L301 (ternary) “Weeks” — tests: `app/routes/training/plan.route.test.tsx:1014`, `app/routes/training/plan.route.test.tsx:1025`, `app/routes/training/plan.route.test.tsx:2784`, `app/routes/training/plan.new.$eventId.route.test.tsx:415`
- L344 (object-field) “Type a percentage, or leave it blank”
- L406 (object-field) “A whole number of sessions, or blank for none”
- L413 (object-field) “Between 0 and ${MAX_QUALITY_SESSIONS_PER_WEEK} sessions a week” — tests: `app/routes/training/plan.route.test.tsx:1912`, `app/routes/training/plan.route.test.tsx:1924`, `app/routes/training/plan.route.test.tsx:1939`, `app/routes/training/plan.route.test.tsx:1962` (+5)
- L719 (object-field) “How many weeks is this phase?”
- L733 (object-field) “Pick how this phase recovers”
- L747 (object-field) “Pick which discipline this track measures”
- L750 (object-field) “Pick the unit you plan this track in”
- L756 (object-field) “A starting volume is required”
- L779 (object-field) “Which day of the week?”
- L788 (object-field) “How big is this day next to the others? e.g. 1, or 2.5”
- L940 (object-field) “A week to start from”
- L1102 (object-field) “Copied into your plan” — tests: `app/routes/training/plan.test.ts:904`
- L1103 (object-field) “It’s yours now — edit anything. Nothing stays linked to the shape you picked.”
- L1104 (ternary) “It’s yours now — edit anything. Nothing stays linked to the shape you picked.”
- L1121 (object-field) “Your plan lands on your event” — tests: `app/routes/training/plan.test.ts:1017`
- L1152 (toast/data) “/training/plan?event=${attached.eventId}” — tests: `app/routes/training/plan.attach-event.test.ts:175`, `app/routes/training/plan.route.test.tsx:1027`, `app/routes/training/plan.route.test.tsx:1031`, `app/routes/training/plan.route.test.tsx:2782` (+5)
- L1281 (object-field) “Plan deleted”
- L1282 (object-field) “Your event and your trained sessions are untouched.”
- L1366 (toast/data) “as const }, { status: 400 }) } function philosophyReply({ result = null, confirmResult = null, preview = null, }: { result?: SubmissionResul”
- L1411 (ternary) “That is not a value this phase can take.”
- L1638 (object-field) “On your calendar”
- L1672 (ternary) “A fixed day whose workout is gone was left out — pick a session for it.”
- L1674 (ternary) “A share day was left out where the week has no derived target for its track.”
- L1676 (ternary) “A share day was left out where your fixed sessions already spend the week. Those stay exactly as you wrote them.”
- L1678 (ternary) “A share day was left out because its track’s unit is not something a session can prescribe — give the day a shape and it will stamp.”
- L1749 (object-field) “Week copied”
- L1781 (ternary) “A session with no workout behind it was left out — there was nothing to copy.”
- L2183 (jsx-text) “Change what you’re building toward”
- L2252 (attr) “What this plan comes to”
- L2358 (attr) “Season views” — tests: `tests/e2e/season-edits.test.ts:36`, `tests/e2e/plan-authoring.test.ts:163`
- L2448 (object-field) “Give your weeks a climb”
- L2452 (ternary) “Set a climb”
- L2457 (object-field) “Say what your typical week looks like”
- L2459 (ternary) “Which days you train on, and which of them is the long one. Your week’s volume divides itself between them.”
- L2461 (ternary) “Set it up”
- L2466 (object-field) “Put your weeks on the calendar”
- L2468 (ternary) “Nothing is scheduled until you stamp it. Sessions land as ordinary sessions you can edit one by one.”
- L2470 (ternary) “Stamp your weeks”
- L2490 (attr) “What’s next”
- L2690 (attr) “Dismiss the ${name}” — tests: `app/routes/training/plan.route.test.tsx:1837`, `app/routes/training/plan.route.test.tsx:1838`, `app/routes/training/plan.route.test.tsx:1839`, `app/routes/training/plan.route.test.tsx:1849` (+3)
- L2890 (ternary) “Those are two separate comparisons — sessions against the weekdays you train, and hours against the capacity you set — and a week can miss o”
- L2892 (ternary) “That is days against days: sessions against the weekdays you train.”
- L2893 (ternary) “That is hours against hours: the hours your endurance weeks work out to, against the capacity you set.”
- L2901 (jsx-text) “athlete profile” — tests: `app/utils/labels.test.ts:342`, `app/routes/training/plan.route.test.tsx:2129`
- L2964 (jsx-text) “That band is” — tests: `app/routes/training/plan.route.test.tsx:1833`, `app/routes/training/plan.route.test.tsx:1861`, `app/routes/training/plan.route.test.tsx:3176`, `app/routes/training/plan.route.test.tsx:3220`
- L2997 (jsx-text) “What this plan cannot tell you” — tests: `app/routes/training/plan.route.test.tsx:3250`, `app/routes/training/plan.route.test.tsx:3277`, `app/routes/training/plan.route.test.tsx:3290`
- L3114 (attr) “Phases” — tests: `app/routes/training/plan.route.test.tsx:805`, `app/routes/training/plan.route.test.tsx:1040`, `app/routes/training/plan.route.test.tsx:1588`, `app/routes/training/plan.route.test.tsx:2009` (+2)
- L3232 (jsx-text) “Start from a shape” — tests: `app/routes/training/plan.route.test.tsx:2203`, `app/routes/training/plan.route.test.tsx:2219`, `app/routes/training/plan.route.test.tsx:2260`, `app/routes/training/plan.route.test.tsx:2276`
- L3245 (attr) “Start from a shape” — tests: `app/routes/training/plan.route.test.tsx:2203`, `app/routes/training/plan.route.test.tsx:2219`, `app/routes/training/plan.route.test.tsx:2260`, `app/routes/training/plan.route.test.tsx:2276`
- L3257 (attr) “Season anchors” — tests: `app/routes/training/plan.route.test.tsx:2203`, `app/routes/training/plan.route.test.tsx:3394`
- L3286 (attr) “Add a phase” — tests: `app/routes/training/plan.route.test.tsx:2203`
- L3294 (attr) “Delete this plan”
- L3297 (ternary) “Your event and the sessions you have already trained stay.”
- L3298 (ternary) “The sessions you have already trained stay.”
- L3324 (ternary) “A four-day week as a starting point — you have not set your training days, so nothing was read from them”
- L3604 (attr) “Volume ramp, % a loading week”
- L3644 (attr) “Recovery week cut, %”
- L3662 (attr) “Taper cut by the event, %”
- L3762 (jsx-text) “Sessions a week in each quality zone.”
- L3763 (jsx-text) “Blank or 0”
- L3811 (jsx-text) “Quality sessions a week, derived” — tests: `app/routes/training/plan.route.test.tsx:1912`, `app/routes/training/plan.route.test.tsx:1924`
- L3864 (ternary) “Hand-set. The rule has no number for this week.”
- L3872 (attr) “${SEASON_EDIT_LABELS.weekTargetOpen}: week ${week.weekInPlan} ${discipline}”
- L3925 (jsx-text) “No lifting” — tests: `app/routes/training/plan.route.test.tsx:3041`, `app/routes/training/plan.route.test.tsx:3321`
- L3941 (jsx-text) “Hand-set” — tests: `app/routes/training/plan.route.test.tsx:835`, `app/routes/training/plan.route.test.tsx:894`, `app/routes/training/plan.route.test.tsx:899`, `app/routes/training/plan.route.test.tsx:928`
- L4026 (attr) “Week by week” — tests: `tests/e2e/mobile-overflow.test.ts:170`
- L4031 (attr) “Training weeks” — tests: `app/routes/training/plan.route.test.tsx:819`, `app/routes/training/plan.route.test.tsx:830`, `app/routes/training/plan.route.test.tsx:848`, `app/routes/training/plan.route.test.tsx:888` (+6)
- L4107 (jsx-text) “Open a week to change its target in”
- L4112 (jsx-text) “is a week without training, which is a plan and not a gap.”
- L4150 (jsx-text) “Fill the weeks”
- L4151 (jsx-text) “Author the week you usually train and stamp it across the season, or copy a week you already liked. Both write ordinary sessions you can edi”
- L4162 (attr) “Your typical week” — tests: `tests/e2e/plan-authoring.test.ts:172`
- L4187 (attr) “Put it on your calendar” — tests: `tests/e2e/plan-authoring.test.ts:176`
- L4206 (attr) “Copy a week you liked”
- L4277 (ternary) “Add”

</details>

#### Bibliotek

<details><summary><code>routes/training/__exercise-history-presenter.ts</code> — 3</summary>

- L64 (ternary) “Other” — tests: `app/utils/labels.test.ts:162`
- L376 (ternary) “No bar — no comparable kilo” — tests: `app/routes/training/__exercise-history-presenter.test.ts:822`, `app/routes/training/exercises.$exerciseId.route.test.tsx:323`
- L472 (object-field) “All variants” — tests: `app/routes/training/__exercise-history-presenter.test.ts:345`, `app/routes/training/__exercise-history-presenter.test.ts:360`, `app/routes/training/exercises.$exerciseId.route.test.tsx:408`

</details>

<details><summary><code>routes/training/catalogue.place.$workoutId.tsx</code> — 9</summary>

- L39 (object-field) “Add to my calendar \| Trainm8”
- L86 (ternary) “Pick a day.”
- L87 (ternary) “That session is no longer in the Catalogue.”
- L111 (attr) “Add to my calendar”
- L140 (jsx-text) “Which day?”
- L151 (jsx-text) “Scheduled at your default training time.”
- L163 (jsx-text) “Add to my calendar”
- L164 (jsx-text) “Cancel”
- L170 (jsx-text) “You get your own copy. Editing it never changes the Catalogue's.”

</details>

<details><summary><code>routes/training/catalogue.publish.$workoutId.tsx</code> — 24</summary>

- L59 (object-field) “Publish to the Catalogue \| Trainm8”
- L75 (object-field) “Say what kind of session this is”
- L135 (ternary) “A moderator removed this session from the Catalogue. It cannot be published again.”
- L137 (ternary) “This is not your session to publish.”
- L140 (ternary) “That session no longer exists.”
- L183 (attr) “Publish to the Catalogue”
- L209 (jsx-text) “Where this came from” — tests: `app/routes/training/catalogue.publish.route.test.tsx:96`
- L216 (jsx-text) “That source stays with the original. Your published session shows it as”
- L218 (jsx-text) “adapted from”
- L218 (jsx-text) “and never as its own — a session an athlete publishes can never carry a citation.”
- L228 (jsx-text) “Removed from the Catalogue” — tests: `app/routes/training/catalogue.publish.route.test.tsx:131`
- L238 (jsx-text) “The session itself is untouched and still yours — it is out of the Catalogue, not out of your training history. It cannot be published again”
- L250 (jsx-text) “In the Catalogue”
- L263 (jsx-text) “Withdraw from the Catalogue”
- L273 (jsx-text) “Back to the Catalogue”
- L289 (ternary) “What kind of session is it?”
- L290 (attr) “Pick one”
- L299 (ternary) “Lowest level it suits (optional)”
- L300 (attr) “Any level”
- L309 (jsx-text) “Before you publish”
- L311 (jsx-text) “Every athlete can read it and every athlete can report it. A moderator who upholds a report removes it from the Catalogue permanently — your”
- L323 (ternary) “Publish”
- L323 (ternary) “Update”
- L328 (jsx-text) “Cancel”

</details>

<details><summary><code>routes/training/catalogue.report.$workoutId.tsx</code> — 16</summary>

- L51 (object-field) “Report a session \| Trainm8”
- L57 (object-field) “Pick what is wrong with it”
- L68 (object-field) “Tell us what is wrong — "something else" needs a description”
- L68 (ternary) “Tell us what is wrong —”
- L126 (ternary) “This is your own session — withdraw it instead.”
- L128 (ternary) “That session is not in the Catalogue.”
- L129 (ternary) “That session no longer exists.”
- L158 (attr) “Report this session”
- L190 (jsx-text) “Back to the Catalogue”
- L198 (jsx-text) “What is wrong with it?”
- L227 (ternary) “Anything else a moderator should know?”
- L236 (jsx-text) “What reporting does”
- L237 (jsx-text) “It hides this session from your Catalogue straight away, and sends it to a moderator.”
- L241 (jsx-text) “It does not remove it for anybody else — that is a moderator's decision, so no one athlete can take another's session down.”
- L250 (jsx-text) “Send report”
- L256 (jsx-text) “Cancel”

</details>

<details><summary><code>routes/training/catalogue.tsx</code> — 30</summary>

- L102 (object-field) “The Catalogue \| Trainm8”
- L367 (jsx-text) “Add to my calendar”
- L383 (ternary) “Save” — tests: `app/routes/training/catalogue.route.test.tsx:328`
- L383 (ternary) “Saved” — tests: `app/routes/training/catalogue.route.test.tsx:328`
- L390 (jsx-text) “Report”
- L459 (attr) “Search the Catalogue”
- L460 (attr) “Search sessions”
- L463 (jsx-text) “Search”
- L470 (ternary) “All sessions”
- L486 (attr) “Kind of session” — tests: `app/routes/training/catalogue.route.test.tsx:240`, `app/routes/training/catalogue.route.test.tsx:263`
- L496 (attr) “Phase” — tests: `app/routes/training/catalogue.route.test.tsx:241`, `app/routes/training/catalogue.route.test.tsx:266`
- L506 (attr) “Goal event” — tests: `app/routes/training/catalogue.route.test.tsx:242`
- L526 (attr) “Written by” — tests: `app/routes/training/catalogue.route.test.tsx:244`
- L545 (jsx-text) “In my list”
- L550 (jsx-text) “Apply”
- L556 (jsx-text) “Clear all”
- L578 (attr) “The Catalogue” — tests: `app/utils/catalogue-seed.server.test.ts:41`, `app/utils/catalogue-seed.server.test.ts:45`, `app/utils/catalogue.constraints.test.ts:1`
- L582 (jsx-text) “Sessions to retrieve from — trainm8's, other athletes', and your own.”
- L587 (jsx-text) “Sessions”
- L603 (ternary) “Nothing in the Catalogue yet.”
- L609 (jsx-text) “Clear all”
- L634 (jsx-text) “Show more”
- L641 (jsx-text) “Your sessions”
- L644 (jsx-text) “Publishing offers a session to every athlete, under a name you choose. trainm8 does not review or endorse what you publish.”
- L649 (jsx-text) “You have not written a session yet.”
- L677 (ternary) “In the Catalogue”
- L679 (ternary) “Withdrawn by you”
- L681 (ternary) “Removed by a moderator” — tests: `app/routes/training/catalogue.route.test.tsx:223`
- L682 (ternary) “Not published” — tests: `app/routes/training/catalogue.route.test.tsx:222`
- L696 (ternary) “Publish”

</details>

<details><summary><code>routes/training/exercises.$exerciseId.tsx</code> — 9</summary>

- L52 (ternary) “Exercise”
- L166 (jsx-text) “Working weight” — tests: `app/routes/training/exercises.$exerciseId.route.test.tsx:260`, `app/routes/training/exercises.$exerciseId.route.test.tsx:344`, `tests/e2e/strength-screens.test.ts:890`, `tests/e2e/strength-screens.test.ts:947`
- L220 (jsx-text) “Log a working set and this page fills in.” — tests: `tests/e2e/strength-screens.test.ts:949`
- L234 (jsx-text) “Your numbers for this lift”
- L268 (jsx-text) “No working sets logged on this lift yet, so there is nothing to read.” — tests: `app/routes/training/exercises.$exerciseId.route.test.tsx:201`, `tests/e2e/strength-screens.test.ts:942`
- L274 (jsx-text) “Records” — tests: `app/routes/training/exercises.$exerciseId.route.test.tsx:204`, `app/routes/training/exercises.$exerciseId.route.test.tsx:316`, `app/routes/training/exercises.$exerciseId.route.test.tsx:343`
- L278 (jsx-text) “Nothing here can be read as a record yet.”
- L317 (jsx-text) “Every session on this lift” — tests: `tests/e2e/strength-screens.test.ts:923`
- L405 (jsx-text) “We could not find that exercise.”

</details>

<details><summary><code>routes/training/exercises.ts</code> — 1</summary>

- L11 (object-field) “Please select a muscle group”

</details>

<details><summary><code>routes/training/programs.$programId.start.tsx</code> — 8</summary>

- L32 (object-field) “Start ${loaderData?.program.name ?? 'a program'} \| Trainm8”
- L68 (object-field) “That form did not make sense.”
- L102 (object-field) “A starting weight has to be a positive number of kilos.” — tests: `app/routes/training/programs.start.route.test.tsx:241`, `app/routes/training/programs.start.route.test.tsx:253`, `tests/e2e/strength-screens.test.ts:558`
- L120 (ternary) “That program is gone.”
- L121 (ternary) “Give at least one lift a starting weight.”
- L147 (attr) “Back to programs”
- L159 (jsx-text) “Starting weights” — tests: `tests/e2e/strength-screens.test.ts:498`, `tests/e2e/strength-screens.test.ts:511`, `tests/e2e/strength-screens.test.ts:546`, `tests/e2e/strength-screens.test.ts:572`
- L162 (jsx-text) “One number per lift. After this the program decides the weight from what you log.”

</details>

<details><summary><code>routes/training/programs.run.$instanceId.tsx</code> — 20</summary>

- L41 (ternary) “Program”
- L115 (object-field) “That did not make sense.” — tests: `app/routes/training/programs.run.route.test.tsx:198`
- L128 (object-field) “That program run is gone.”
- L139 (object-field) “That program run is gone.”
- L145 (object-field) “The program is stopped. Every set you logged under it stays.”
- L163 (object-field) “Working weight set.”
- L165 (object-field) “That lift is gone.”
- L173 (ternary) “Weight Rollback”
- L174 (ternary) “Anchor Re-estimate”
- L197 (ternary) “Running. The next weight comes from your last log, not the calendar.”
- L208 (ternary) “Today”
- L215 (ternary) “Lift”
- L242 (ternary) “Because sets are already logged against it, changing a working weight below takes effect on the next session.”
- L243 (ternary) “Nothing is logged against it yet, so changing a working weight below re-stamps it the next time you open it.”
- L254 (jsx-text) “Open today’s session”
- L262 (jsx-text) “Your weights”
- L277 (jsx-text) “Stop this program”
- L280 (jsx-text) “Stopping keeps every set you logged under it.”
- L358 (attr) “Working weight for ${lift.name} in kg” — tests: `app/routes/training/programs.run.route.test.tsx:227`, `app/routes/training/programs.run.route.test.tsx:257`, `app/routes/training/programs.run.route.test.tsx:284`
- L368 (jsx-text) “Save weight” — tests: `app/routes/training/programs.run.route.test.tsx:184`, `app/routes/training/programs.run.route.test.tsx:232`, `app/routes/training/programs.run.route.test.tsx:263`, `app/routes/training/programs.run.route.test.tsx:288`

</details>

<details><summary><code>routes/training/programs.tsx</code> — 7</summary>

- L51 (object-field) “Strength programs \| Trainm8”
- L74 (attr) “Strength programs” — tests: `tests/e2e/strength-screens.test.ts:422`, `tests/e2e/strength-screens.test.ts:477`
- L78 (jsx-text) “Each one runs on the last weight you lifted — never on the calendar.”
- L89 (jsx-text) “take a session from the Catalogue”
- L93 (jsx-text) “write one yourself” — tests: `app/routes/training/programs.route.test.tsx:134`
- L175 (jsx-text) “Open your run” — tests: `tests/e2e/strength-screens.test.ts:455`, `tests/e2e/strength-screens.test.ts:480`
- L184 (jsx-text) “Correct a weight or end this program” — tests: `tests/e2e/strength-screens.test.ts:489`

</details>

#### Meg

<details><summary><code>routes/imports.upload.tsx</code> — 6</summary>

- L29 (object-field) “Upload Activity \| Trainm8”
- L60 (object-field) “No file uploaded.”
- L93 (object-field) “This activity has already been imported.”
- L131 (jsx-text) “See them on your training log”
- L148 (attr) “Upload Activity”
- L227 (jsx-text) “Upload”

</details>

<details><summary><code>routes/integrations.intervalsicu.connect.tsx</code> — 7</summary>

- L16 (object-field) “Paste your Intervals.icu API key to connect.”
- L20 (object-field) “Intervals.icu rejected this API key. Note that generating a new key invalidates old ones — copy the current key from Intervals.icu → Setting”
- L21 (ternary) “Intervals.icu rejected this API key. Note that generating a new key invalidates old ones — copy the current key from Intervals.icu → Setting”
- L25 (object-field) “Could not reach Intervals.icu to verify the key. Please try again in a moment.”
- L26 (ternary) “Could not reach Intervals.icu to verify the key. Please try again in a moment.”
- L54 (object-field) “Connected to Intervals.icu” — tests: `app/routes/integrations.intervalsicu.connect.test.ts:71`
- L55 (object-field) “Your Intervals.icu account is now linked to Trainm8.”

</details>

<details><summary><code>routes/integrations.intervalsicu.sync.tsx</code> — 6</summary>

- L32 (ternary) “Intervals.icu rejected the stored API key — paste a new one on the Integrations page to resume imports.”
- L34 (ternary) “Intervals.icu could not be reached — nothing was imported. Try again in a few minutes.”
- L35 (ternary) “Connect your Intervals.icu account before syncing.”
- L37 (object-field) “Sync failed” — tests: `app/routes/integrations.intervalsicu.sync.test.ts:103`, `app/routes/integrations.intervalsicu.sync.test.ts:132`, `app/routes/integrations.intervalsicu.sync.test.ts:154`
- L45 (ternary) “No new activities to import.”
- L50 (object-field) “Synced with Intervals.icu” — tests: `app/routes/integrations.intervalsicu.sync.test.ts:69`

</details>

<details><summary><code>routes/integrations.strava.callback.tsx</code> — 2</summary>

- L80 (object-field) “Connected to Strava” — tests: `app/routes/integrations.strava.callback.test.ts:73`
- L81 (object-field) “Your Strava account is now linked to Trainm8.”

</details>

<details><summary><code>routes/integrations.strava.connect.tsx</code> — 1</summary>

- L17 (object-field) “Strava is not configured on this server.”

</details>

<details><summary><code>routes/integrations.strava.sync.tsx</code> — 7</summary>

- L32 (ternary) “Your Strava authorization was revoked. Please reconnect.”
- L34 (ternary) “Strava has this app disabled (status: inactive). This is on Strava’s side — reconnecting won’t help; the app must be activated in Strava’s d”
- L36 (ternary) “Trainm8 is not allowed to read your Strava activities. Reconnect and keep the activity access checkbox ticked.”
- L37 (ternary) “Connect your Strava account before syncing.”
- L39 (object-field) “Sync failed” — tests: `app/routes/integrations.strava.sync.test.ts:92`, `app/routes/integrations.strava.sync.test.ts:134`, `app/routes/integrations.strava.sync.test.ts:151`
- L47 (ternary) “No new activities to import.”
- L52 (object-field) “Synced with Strava” — tests: `app/routes/integrations.strava.sync.test.ts:59`

</details>

<details><summary><code>routes/integrations.sync.tsx</code> — 7</summary>

- L27 (object-field) “Intervals.icu” — tests: `app/utils/labels.test.ts:172`, `tests/mocks/index.ts:22`, `tests/mocks/intervalsicu.ts:6`, `tests/mocks/intervalsicu.ts:54` (+1)
- L44 (object-field) “Sync failed” — tests: `app/routes/integrations.sync.test.ts:167`
- L45 (object-field) “Connect a source before syncing.”
- L63 (object-field) “Sync failed” — tests: `app/routes/integrations.sync.test.ts:167`
- L64 (object-field) “Could not sync ${failed.join(' and ')} — check the Integrations page.”
- L73 (ternary) “No new activities to import.”
- L76 (object-field) “Synced”

</details>

<details><summary><code>routes/settings/integrations.tsx</code> — 31</summary>

- L90 (object-field) “Disconnected from Strava”
- L91 (object-field) “Your imported activities stay in your training history.”
- L102 (object-field) “Disconnected from Intervals.icu”
- L103 (object-field) “Your imported activities stay in your training history.”
- L149 (jsx-text) “Connected” — tests: `app/routes/integrations.intervalsicu.connect.test.ts:71`, `app/routes/integrations.strava.callback.test.ts:73`, `app/routes/settings/integrations.test.tsx:41`, `app/routes/settings/integrations.test.tsx:81` (+10)
- L258 (jsx-text) “Importing history” — tests: `app/routes/settings/integrations.test.tsx:128`
- L260 (jsx-text) “Connected” — tests: `app/routes/integrations.intervalsicu.connect.test.ts:71`, `app/routes/integrations.strava.callback.test.ts:73`, `app/routes/settings/integrations.test.tsx:41`, `app/routes/settings/integrations.test.tsx:81` (+10)
- L293 (jsx-text) “Connect Strava”
- L336 (ternary) “Sync now”
- L336 (ternary) “Syncing…”
- L352 (jsx-text) “Disconnect” — tests: `app/routes/settings/integrations.test.tsx:21`, `app/routes/settings/integrations.test.tsx:28`, `app/routes/settings/integrations.test.tsx:215`, `app/routes/settings/integrations.test.tsx:335`
- L359 (jsx-text) “Disconnect Strava?”
- L360 (jsx-text) “Your imported Strava activities are part of your training history and will stay — disconnecting only stops new ones arriving. You can reconn”
- L369 (jsx-text) “Keep connected”
- L374 (jsx-text) “Disconnect Strava”
- L412 (jsx-text) “Importing history” — tests: `app/routes/settings/integrations.test.tsx:128`
- L414 (jsx-text) “Connected” — tests: `app/routes/integrations.intervalsicu.connect.test.ts:71`, `app/routes/integrations.strava.callback.test.ts:73`, `app/routes/settings/integrations.test.tsx:41`, `app/routes/settings/integrations.test.tsx:81` (+10)
- L448 (jsx-text) “Connect Intervals.icu”
- L498 (ternary) “Sync now”
- L498 (ternary) “Syncing…”
- L522 (jsx-text) “Copy your personal API key from Intervals.icu → Settings → Developer Settings, then paste it here. Generating a new key there invalidates ol”
- L549 (ternary) “Connect”
- L551 (jsx-text) “Cancel”
- L569 (jsx-text) “Disconnect” — tests: `app/routes/settings/integrations.test.tsx:21`, `app/routes/settings/integrations.test.tsx:28`, `app/routes/settings/integrations.test.tsx:215`, `app/routes/settings/integrations.test.tsx:335`
- L576 (jsx-text) “Disconnect Intervals.icu?”
- L577 (jsx-text) “Your imported Intervals.icu activities are part of your training history and will stay — disconnecting only stops new ones arriving. You can”
- L586 (jsx-text) “Keep connected”
- L591 (jsx-text) “Disconnect Intervals.icu”
- L616 (jsx-text) “Upload activity”
- L623 (jsx-text) “Connect”
- L626 (jsx-text) “Connect flow coming soon”

</details>

<details><summary><code>routes/settings/profile/_layout.tsx</code> — 1</summary>

- L15 (ternary) “Edit Profile”

</details>

<details><summary><code>routes/settings/profile/change-email.server.tsx</code> — 10</summary>

- L33 (toast/data) “You must submit the code on the same device that requested the email change.”
- L52 (ternary) “Epic Stack email changed”
- L59 (object-field) “Email Changed”
- L61 (object-field) “Your email has been changed to ${user.email}”
- L82 (jsx-text) “Trainm8 Email Change”
- L85 (jsx-text) “Here's your verification code:” — tests: `tests/e2e/settings-profile.test.ts:8`, `tests/e2e/onboarding.test.ts:21`
- L90 (jsx-text) “Or click the link:”
- L103 (jsx-text) “Your Trainm8 email has been changed”
- L106 (jsx-text) “We're writing to let you know that your Trainm8 email has been changed.”
- L112 (jsx-text) “If you changed your email address, then you can safely ignore this. But if you did not change your email address, then please contact suppor”

</details>

<details><summary><code>routes/settings/profile/change-email.tsx</code> — 4</summary>

- L23 (ternary) “Change Email”
- L59 (object-field) “This email is already in use.”
- L117 (jsx-text) “You will receive an email at the new email address to confirm.”
- L125 (ternary) “New Email”

</details>

<details><summary><code>routes/settings/profile/connections.tsx</code> — 6</summary>

- L118 (object-field) “Deleted”
- L119 (object-field) “Your connection has been deleted.”
- L129 (jsx-text) “Here are your current connections:”
- L142 (jsx-text) “You don't have any connections yet.”
- L206 (jsx-text) “Disconnect this account”
- L216 (jsx-text) “You cannot delete your last connection unless you have a password.”

</details>

<details><summary><code>routes/settings/profile/index.tsx</code> — 20</summary>

- L179 (attr) “Change profile photo”
- L180 (attr) “Change profile photo”
- L207 (ternary) “Change Password”
- L207 (ternary) “Create a Password”
- L227 (jsx-text) “Download your data”
- L236 (jsx-text) “Log out”
- L274 (object-field) “A user already exists with this username”
- L361 (jsx-text) “Athlete Profile” — tests: `app/routes/settings/profile/index.weekly-capacity.test.ts:1`, `tests/week-replan-demo-seed.ts:58`
- L376 (ternary) “Week starts on”
- L411 (jsx-text) “Training availability”
- L414 (jsx-text) “Trainable days”
- L452 (ternary) “Default training time”
- L468 (ternary) “Hours a week you have for training”
- L480 (ternary) “Yours, saved. Nothing re-reads your training to change it — history says what you did, this says what you have room for.”
- L501 (jsx-text) “Save athlete profile”
- L538 (ternary) “Username”
- L563 (jsx-text) “Save changes”
- L623 (jsx-text) “This is your only session”
- L633 (object-field) “Data Deleted”
- L634 (object-field) “All of your data has been deleted”

</details>

<details><summary><code>routes/settings/profile/passkeys.tsx</code> — 4</summary>

- L41 (toast/data) “, error:”
- L56 (toast/data) “, error:”
- L133 (jsx-text) “Register new passkey”
- L153 (jsx-text) “No passkeys registered yet”

</details>

<details><summary><code>routes/settings/profile/password.tsx</code> — 10</summary>

- L23 (ternary) “Password”
- L38 (object-field) “The passwords must match”
- L73 (object-field) “Incorrect password.”
- L81 (object-field) “Password is too common”
- L117 (object-field) “Password Changed”
- L118 (object-field) “Your password has been changed.”
- L150 (ternary) “New Password”
- L158 (ternary) “Confirm New Password”
- L172 (jsx-text) “Cancel”
- L178 (jsx-text) “Change Password”

</details>

<details><summary><code>routes/settings/profile/password_.create.tsx</code> — 5</summary>

- L20 (ternary) “Password”
- L54 (object-field) “Password is too common”
- L113 (ternary) “Confirm New Password”
- L127 (jsx-text) “Cancel”
- L133 (jsx-text) “Create Password”

</details>

<details><summary><code>routes/settings/profile/photo.tsx</code> — 4</summary>

- L185 (jsx-text) “Change”
- L201 (jsx-text) “Save Photo”
- L232 (ternary) “Are you sure?”
- L233 (ternary) “Delete”

</details>

<details><summary><code>routes/settings/profile/two-factor/_layout.tsx</code> — 1</summary>

- L7 (ternary) “Two-Factor Authentication”

</details>

<details><summary><code>routes/settings/profile/two-factor/disable.tsx</code> — 3</summary>

- L31 (object-field) “Two factor authentication has been disabled.”
- L42 (jsx-text) “Disabling two factor authentication is not recommended. However, if you would like to do so, click here:”
- L56 (ternary) “Are you sure?”

</details>

<details><summary><code>routes/settings/profile/two-factor/index.tsx</code> — 3</summary>

- L51 (jsx-text) “You have enabled two-factor authentication.” — tests: `tests/e2e/2fa.test.ts:40`
- L62 (jsx-text) “You have not enabled two-factor authentication yet.”
- L70 (jsx-text) “1Password”

</details>

<details><summary><code>routes/settings/profile/two-factor/verify.tsx</code> — 6</summary>

- L117 (object-field) “Two-factor authentication has been enabled.”
- L146 (jsx-text) “Scan this QR code with your authenticator app.”
- L147 (jsx-text) “If you cannot scan the QR code, you can manually add this account to your authenticator app using this code:”
- L154 (attr) “One-time Password URI”
- L159 (jsx-text) “Once you've added the account, enter the code from your authenticator app below. Once you enable 2FA, you will need to enter a code from you”
- L217 (jsx-text) “Cancel”

</details>

<details><summary><code>routes/settings/training/_layout.tsx</code> — 1</summary>

- L13 (ternary) “Training Settings”

</details>

<details><summary><code>routes/settings/training/analyze.tsx</code> — 23</summary>

- L46 (ternary) “What your history says” — tests: `app/routes/settings/training/analyze.route.test.tsx:13`
- L62 (object-field) “Unknown estimate.”
- L74 (object-field) “That reading is no longer available.”
- L103 (ternary) “Threshold heart rate”
- L106 (ternary) “Threshold pace” — tests: `app/utils/structure-detection/analyze.test.ts:95`
- L108 (ternary) “Critical swim speed”
- L109 (ternary) “Running power threshold”
- L121 (ternary) “A critical power — usually a little above FTP.”
- L123 (ternary) “A critical speed — usually a little quicker than threshold pace.”
- L141 (ternary) “Add your date of birth in your profile and we can estimate it.”
- L142 (ternary) “Nothing in the last 90 days carried the data this needs.”
- L144 (ternary) “Your activities are stored at too coarse a resolution to read short efforts from.”
- L146 (ternary) “Not enough hard efforts of different lengths to fit a curve to.”
- L148 (ternary) “Your hard efforts are all about the same length, so a curve would be guesswork.”
- L149 (ternary) “The fit came out outside anything physiological.”
- L150 (ternary) “Not something we can read from your data yet.” — tests: `app/routes/settings/training/analyze.route.test.tsx:132`
- L198 (jsx-text) “No imported activities yet, so there is nothing to read.”
- L204 (jsx-text) “Connect an account” — tests: `app/routes/settings/training/analyze.route.test.tsx:190`
- L220 (jsx-text) “Training Settings”
- L222 (jsx-text) “, and they never change on their own.”
- L319 (jsx-text) “How we got this” — tests: `app/routes/settings/training/analyze.route.test.tsx:103`
- L329 (ternary) “Replace what I have” — tests: `app/routes/settings/training/analyze.route.test.tsx:116`, `app/routes/settings/training/analyze.route.test.tsx:135`
- L329 (ternary) “Use this” — tests: `app/routes/settings/training/analyze.route.test.tsx:116`, `app/routes/settings/training/analyze.route.test.tsx:135`

</details>

<details><summary><code>routes/settings/training/gym.tsx</code> — 15</summary>

- L38 (ternary) “Your gym”
- L85 (object-field) “That did not make sense.”
- L100 (object-field) “Every weight and count has to be a number.”
- L108 (object-field) “Give a count for every plate, or leave the counts blank.”
- L144 (object-field) “Your athlete profile is missing, so there is no gym to attach.”
- L151 (object-field) “Saved. Every weight now says what goes on the bar.”
- L168 (jsx-text) “What your gym owns, so the weight input can say what goes on the bar. The count is pairs — two 20s per side is a count of 2.”
- L175 (jsx-text) “This gym’s name”
- L185 (jsx-text) “Bars, in kg”
- L194 (jsx-text) “The first one is the bar a lift assumes.”
- L201 (jsx-text) “Plates, in kg”
- L214 (jsx-text) “Pairs of each”
- L229 (jsx-text) “Fixed dumbbells, in kg”
- L238 (jsx-text) “Leave this blank if you have not said — a blank field is not an empty rack.”
- L244 (jsx-text) “Save my gym”

</details>

<details><summary><code>routes/settings/training/history.tsx</code> — 6</summary>

- L14 (ternary) “Threshold History”
- L22 (ternary) “Run power”
- L23 (ternary) “Threshold Pace”
- L25 (ternary) “Weight”
- L106 (jsx-text) “Every threshold change, newest first.”
- L111 (jsx-text) “No threshold changes recorded yet.”

</details>

<details><summary><code>routes/settings/training/index.tsx</code> — 12</summary>

- L64 (object-field) “Enter a pace as mm:ss, e.g. ${example}”
- L71 (object-field) “Pace must be between ${formatPaceClock(min)} and ${formatPaceClock(max)} ${unit}”
- L111 (object-field) “That zone recipe is not a ${DISCIPLINE_LABELS[value.discipline].toLowerCase()} one”
- L149 (jsx-text) “Set your discipline-specific thresholds. These feed into TSS calculations and zone resolution.”
- L156 (jsx-text) “Every discipline starts on a zone recipe we picked — it only sets which ladder your numbers are read on. A threshold is a number about you, ”
- L171 (jsx-text) “Read these from my history”
- L177 (jsx-text) “View threshold history”
- L185 (jsx-text) “Your gym’s bars and plates”
- L308 (ternary) “Threshold pace (mm:ss /km)”
- L432 (ternary) “Zone recipe”
- L450 (jsx-text) “Your choice”
- L452 (jsx-text) “You picked this one.”

</details>

<details><summary><code>routes/settings/training/lifts.$exerciseId.tsx</code> — 29</summary>

- L57 (ternary) “Your numbers for this lift”
- L157 (object-field) “Unknown action.”
- L169 (ternary) “That number did not make sense.”
- L177 (object-field) “A rep max needs the rep count it is at.”
- L190 (object-field) “That date is not a date.”
- L211 (object-field) “Saved. Your prescriptions read against it from now on.”
- L216 (ternary) “A weight has to be a positive number of kilos.” — tests: `app/routes/settings/training/lifts.$exerciseId.route.test.tsx:226`, `app/routes/settings/training/lifts.$exerciseId.route.test.tsx:244`
- L217 (ternary) “A rep count has to be a whole number, one or more.”
- L222 (ternary) “Your athlete profile is missing, so there is nothing to attach this to.”
- L223 (ternary) “That lift no longer exists.”
- L224 (ternary) “A weight has to be a positive number of kilos.” — tests: `app/routes/settings/training/lifts.$exerciseId.route.test.tsx:226`, `app/routes/settings/training/lifts.$exerciseId.route.test.tsx:244`
- L225 (ternary) “You already saved a number for that lift at that moment.”
- L269 (ternary) “Nothing on file yet, so a percentage prescription for this lift shows as written and resolves to no kilos.”
- L276 (jsx-text) “What you have on file”
- L285 (jsx-text) “Read one from a set you already logged”
- L314 (jsx-text) “Read one from a set you already logged”
- L324 (jsx-text) “Where this lift is prescribed”
- L328 (jsx-text) “No session in your plan prescribes this lift yet.”
- L397 (jsx-text) “not graded” — tests: `app/routes/settings/training/lifts.$exerciseId.route.test.tsx:131`, `app/routes/settings/training/lifts.$exerciseId.route.test.tsx:133`
- L408 (ternary) “One-rep max” — tests: `app/routes/settings/training/lifts.$exerciseId.route.test.tsx:189`
- L409 (ternary) “Rep max” — tests: `app/routes/settings/training/lifts.$exerciseId.route.test.tsx:163`
- L439 (attr) “Add a number for ${exerciseName}”
- L443 (jsx-text) “Enter a number yourself”
- L447 (jsx-text) “What it is” — tests: `app/routes/settings/training/lifts.$exerciseId.route.test.tsx:162`, `app/routes/settings/training/lifts.$exerciseId.route.test.tsx:188`
- L490 (jsx-text) “at reps” — tests: `app/routes/settings/training/lifts.$exerciseId.route.test.tsx:165`, `app/routes/settings/training/lifts.$exerciseId.route.test.tsx:182`
- L505 (jsx-text) “From”
- L518 (ternary) “The heaviest load you can lift for exactly that many reps. It is never converted from another rep count — an 8RM read off a 5RM would be a ±”
- L519 (ternary) “A number you typed is stored as yours and is not graded — the app does not grade a figure you stated about yourself.”
- L534 (jsx-text) “Save this number” — tests: `app/routes/settings/training/lifts.$exerciseId.route.test.tsx:166`, `app/routes/settings/training/lifts.$exerciseId.route.test.tsx:206`, `app/routes/settings/training/lifts.$exerciseId.route.test.tsx:237`

</details>

<details><summary><code>routes/settings/training/lifts.$exerciseId_.propose.tsx</code> — 19</summary>

- L59 (ternary) “What your sets say” — tests: `app/routes/settings/training/lifts.$exerciseId_.propose.route.test.tsx:12`
- L116 (ternary) “That lift no longer exists.”
- L118 (ternary) “Your athlete profile is missing, so there is nothing to attach this to.”
- L119 (ternary) “There is no reading to accept any more.”
- L124 (ternary) “Your logged sets have changed since this was read. Reload and take another look.”
- L125 (ternary) “You already saved that number a moment ago.”
- L133 (object-field) “Unknown action.”
- L138 (object-field) “That reading did not make sense.”
- L158 (object-field) “Saved as your ${formatKg(result.valueKg)} kg 1RM. It is yours now, and nothing re-reads your history to move it.”
- L171 (jsx-text) “Read from the sets you have already logged for this lift. Nothing is saved until you accept it.”
- L184 (jsx-text) “this lift's numbers”
- L186 (jsx-text) “, and they never change on their own.”
- L213 (jsx-text) “Estimated 1RM”
- L263 (jsx-text) “read from an old set — flagged, not adjusted, because nobody can tell which way an untested lifter has moved”
- L271 (jsx-text) “How we got this” — tests: `app/routes/settings/training/lifts.$exerciseId_.propose.route.test.tsx:139`
- L326 (ternary) “Use this” — tests: `app/routes/settings/training/lifts.$exerciseId_.propose.route.test.tsx:152`, `app/routes/settings/training/lifts.$exerciseId_.propose.route.test.tsx:183`, `app/routes/settings/training/lifts.$exerciseId_.propose.route.test.tsx:296`
- L327 (ternary) “Replace what I have”
- L332 (jsx-text) “No thanks”
- L372 (jsx-text) “Read with a different equation. None of these is the better one — they are different published fits to different samples, and the ± beside e”

</details>

#### No tab: sessions / workout editor

<details><summary><code>routes/training/__block-editor-sheet.tsx</code> — 13</summary>

- L159 (attr) “Block ${blockIndex + 1}”
- L169 (attr) “Block name”
- L170 (attr) “e.g. Warm-up”
- L172 (ternary) “Block name cleared”
- L172 (ternary) “Block name updated”
- L177 (attr) “Repeat count”
- L185 (jsx-text) “Steps”
- L218 (attr) “Step ${stepIndex + 1} kind”
- L242 (attr) “Move step ${stepIndex + 1} earlier”
- L255 (attr) “Move step ${stepIndex + 1} later”
- L268 (attr) “Duplicate step ${stepIndex + 1}”
- L278 (attr) “Remove step ${stepIndex + 1}”
- L298 (jsx-text) “＋ Add step:”

</details>

<details><summary><code>routes/training/__empty-state.tsx</code> — 9</summary>

- L109 (ternary) “Easy session” — tests: `tests/e2e/session-authoring.test.ts:8`, `tests/e2e/session-authoring.test.ts:35`
- L110 (object-field) “45 min @ easy” — tests: `tests/e2e/session-authoring.test.ts:36`
- L121 (ternary) “Intervals” — tests: `app/utils/labels.test.ts:172`
- L124 (object-field) “4 min @ threshold ( 2 min rest )”
- L128 (ternary) “Warm-up”
- L137 (ternary) “Cool-down”
- L142 (ternary) “Strength session”
- L144 (object-field) “exercise 3 × 8 → exercise 3 × 5”
- L198 (jsx-text) “or start from scratch ＋”

</details>

<details><summary><code>routes/training/__exercise-combobox.tsx</code> — 9</summary>

- L242 (attr) “Search exercises…”
- L245 (attr) “Search exercises” — tests: `app/routes/training/__exercise-combobox.test.tsx:92`, `app/routes/training/__exercise-combobox.test.tsx:142`, `app/routes/training/__exercise-combobox.test.tsx:146`, `app/routes/training/__exercise-combobox.test.tsx:180`
- L277 (jsx-text) “No exercises found.”
- L302 (ternary) “All exercises” — tests: `app/routes/training/__exercise-combobox.test.tsx:161`
- L341 (attr) “Search muscle groups…”
- L342 (attr) “Search muscle groups”
- L345 (jsx-text) “No muscle groups found.”
- L364 (jsx-text) “Back to search”
- L368 (jsx-text) “Saving…”

</details>

<details><summary><code>routes/training/__intensity-editor.tsx</code> — 7</summary>

- L568 (attr) “None”
- L571 (jsx-text) “None”
- L592 (attr) “Zone”
- L593 (attr) “Select zone…”
- L596 (jsx-text) “Select zone…”
- L607 (attr) “Zone”
- L610 (attr) “e.g. Z2, threshold”

</details>

<details><summary><code>routes/training/__intensity-popover.tsx</code> — 5</summary>

- L230 (jsx-text) “or set:”
- L309 (jsx-text) “Remove intensity”
- L333 (attr) “Zone”
- L409 (attr) “Pace unit”
- L412 (object-field) “% T-pace”

</details>

<details><summary><code>routes/training/__lift-help-panel.tsx</code> — 2</summary>

- L54 (attr) “About ${liftName}” — tests: `tests/e2e/strength-screens.test.ts:812`
- L146 (jsx-text) “Tell us what your gym has”

</details>

<details><summary><code>routes/training/__outcome-panel.tsx</code> — 4</summary>

- L71 (attr) “Back to your sets”
- L80 (jsx-text) “What you lift next time”
- L86 (jsx-text) “Session finished. This one is not part of a running program, so nothing advanced.”
- L110 (jsx-text) “Back to today”

</details>

<details><summary><code>routes/training/__rest-bar.tsx</code> — 1</summary>

- L149 (attr) “Dismiss the rest timer” — tests: `app/routes/training/sessions.$sessionId_.log.route.test.tsx:958`, `tests/e2e/strength-screens.test.ts:763`

</details>

<details><summary><code>routes/training/__runner-presenter.ts</code> — 11</summary>

- L235 (ternary) “Weight Rollback”
- L236 (ternary) “Anchor Re-estimate”
- L317 (ternary) “Lift”
- L387 (object-field) “Could not be read” — tests: `app/routes/training/__runner-presenter.test.ts:409`, `app/routes/training/__runner-presenter.test.ts:445`, `app/routes/training/__runner-presenter.test.ts:717`
- L405 (object-field) “Lighter than prescribed” — tests: `app/routes/training/__runner-presenter.test.ts:379`
- L545 (ternary) “Log”
- L545 (ternary) “Logged”
- L693 (ternary) “Log”
- L693 (ternary) “Logged”
- L1026 (ternary) “No gym is described, so no plates are solved.” — tests: `app/routes/training/__runner-presenter.test.ts:1738`
- L1032 (object-field) “This lift over time” — tests: `app/routes/training/__runner-presenter.test.ts:1699`, `app/routes/training/sessions.$sessionId_.log.route.test.tsx:803`, `app/routes/training/sessions.$sessionId_.log.route.test.tsx:813`, `app/routes/training/sessions.$sessionId_.log.route.test.tsx:1115`

</details>

<details><summary><code>routes/training/__sets-popover.tsx</code> — 25</summary>

- L249 (attr) “time per set”
- L271 (attr) “Set kind”
- L294 (jsx-text) “Vary sets individually ▸”
- L369 (jsx-text) “kept as authored — this load has no editor yet”
- L396 (ternary) “Load removed”
- L422 (attr) “Decrease load”
- L434 (ternary) “Load %1RM”
- L434 (ternary) “Load kg”
- L443 (attr) “Increase load”
- L459 (attr) “Load unit”
- L499 (jsx-text) “◂ Collapse to uniform”
- L542 (jsx-text) “＋ add set”
- L609 (attr) “Set ${index + 1} kind”
- L627 (attr) “Duplicate set ${index + 1}”
- L637 (attr) “Remove set ${index + 1}”
- L638 (attr) “Remove”
- L652 (attr) “Set ${index + 1} reps” — tests: `tests/e2e/strength-screens.test.ts:1063`, `tests/e2e/home-timeline.test.ts:303`
- L663 (attr) “Set ${index + 1} seconds”
- L685 (attr) “Set ${index + 1} kg”
- L696 (attr) “Set ${index + 1} %1RM”
- L743 (jsx-text) “rest between sets”
- L751 (attr) “rest between sets”
- L761 (attr) “Remove rest between sets”
- L762 (attr) “Remove rest”
- L785 (jsx-text) “＋ rest between sets”

</details>

<details><summary><code>routes/training/__token-sentence-editor.tsx</code> — 31</summary>

- L510 (jsx-text) “thresholds?: DisciplineThresholdMap loadContexts?: Record”
- L869 (ternary) “Step moved earlier”
- L869 (ternary) “Step moved later”
- L898 (ternary) “Step removed”
- L929 (ternary) “Block moved earlier”
- L929 (ternary) “Block moved later”
- L1331 (attr) “Block ${blockIndex + 1} of ${blockCount} actions”
- L1332 (attr) “Block actions — drag to reorder”
- L1374 (jsx-text) “Name…”
- L1379 (jsx-text) “Repeat…”
- L1397 (jsx-text) “Add step”
- L1469 (jsx-text) “Add…”
- L1530 (jsx-text) “Remove”
- L1686 (jsx-text) “Close”
- L1746 (jsx-text) “Close”
- L1816 (attr) “Block name”
- L1818 (attr) “e.g. Warm-up”
- L1826 (ternary) “Block name updated”
- L1827 (ternary) “Block name cleared”
- L1843 (jsx-text) “Clear name”
- L1864 (attr) “repeat count”
- L2095 (attr) “Note text”
- L2119 (jsx-text) “Remove note”
- L2218 (object-field) “Duration”
- L2219 (object-field) “Distance”
- L2240 (jsx-text) “This step has no length yet — pick how to measure it.”
- L2257 (jsx-text) “Remove time or distance”
- L2310 (ternary) “Discipline inherits from the workout”
- L2324 (attr) “Step discipline”
- L2386 (object-field) “＋ time or distance”
- L2402 (object-field) “＋ note”

</details>

<details><summary><code>routes/training/__validation-summary.tsx</code> — 2</summary>

- L78 (jsx-text) “cleared: Set”
- L175 (attr) “Fix before saving”

</details>

<details><summary><code>routes/training/__workout-detail-editor.tsx</code> — 2</summary>

- L133 (jsx-text) “loggedSetsByStep: Record”
- L309 (ternary) “Saving…”

</details>

<details><summary><code>routes/training/sessions.$sessionId.tsx</code> — 48</summary>

- L223 (ternary) “Workout Details \| Trainm8”
- L386 (ternary) “Untitled session”
- L478 (object-field) “Could not move the recording to that session.”
- L535 (toast/data) “Invalid date and time combination”
- L669 (jsx-text) “Delete session” — tests: `tests/e2e/cta-semantics.test.ts:60`
- L676 (jsx-text) “Delete this session?”
- L677 (jsx-text) “This permanently removes the workout session, including its prescription and any session log, from your training history. This cannot be und”
- L686 (jsx-text) “Keep session”
- L687 (jsx-text) “Delete session” — tests: `tests/e2e/cta-semantics.test.ts:60`
- L727 (attr) “Session”
- L746 (ternary) “Log your sets”
- L982 (ternary) “Not enough to name it”
- L1022 (jsx-text) “No structure detected — this recording read as steady effort, so no workout structure was inferred from it.”
- L1049 (ternary) “Re-check this recording for structure — useful right after setting a threshold.”
- L1059 (jsx-text) “Re-run detection”
- L1119 (jsx-text) “Replan note:” — tests: `app/routes/training/sessions.$sessionId.route.test.tsx:1091`
- L1148 (jsx-text) “Training Settings” — tests: `app/routes/training/sessions.$sessionId.route.test.tsx:529`, `app/routes/training/sessions.$sessionId.route.test.tsx:535`
- L1386 (object-field) “Load (TSS)”
- L1392 (object-field) “Duration”
- L1397 (object-field) “Distance”
- L1406 (jsx-text) “Planned vs actual” — tests: `app/routes/training/sessions.$sessionId.route.test.tsx:292`, `app/routes/training/sessions.$sessionId.route.test.tsx:446`, `app/routes/training/sessions.$sessionId.route.test.tsx:458`, `app/routes/training/sessions.$sessionId.route.test.tsx:717` (+3)
- L1521 (jsx-text) “vs last time” — tests: `app/routes/training/sessions.$sessionId.test.ts:38`, `app/routes/training/sessions.$sessionId.route.test.tsx:1016`, `app/routes/training/sessions.$sessionId.route.test.tsx:1028`, `app/routes/training/sessions.$sessionId.route.test.tsx:1035` (+4)
- L1528 (ternary) “This session has no archetype, so there is nothing to compare it against.”
- L1542 (object-field) “Load (TSS)”
- L1548 (object-field) “Duration”
- L1558 (jsx-text) “vs last time” — tests: `app/routes/training/sessions.$sessionId.test.ts:38`, `app/routes/training/sessions.$sessionId.route.test.tsx:1016`, `app/routes/training/sessions.$sessionId.route.test.tsx:1028`, `app/routes/training/sessions.$sessionId.route.test.tsx:1035` (+4)
- L1580 (jsx-text) “Power and heart rate over time, against the planned targets.”
- L1587 (jsx-text) “Telemetry not available” — tests: `app/routes/training/sessions.$sessionId.route.test.tsx:193`, `app/routes/training/sessions.$sessionId.route.test.tsx:300`, `app/routes/training/sessions.$sessionId.route.test.tsx:404`, `app/routes/training/sessions.$sessionId.route.test.tsx:431` (+2)
- L1590 (jsx-text) “This recording has no per-sample power or heart-rate stream yet, so there is nothing to plot against the plan. The overlay appears once tele”
- L1786 (ternary) “Recorded telemetry sampled across the session, earliest to latest.”
- L1816 (ternary) “Recorded telemetry over time.”
- L1822 (jsx-text) “Your recorded effort over time, with the planned targets and shape laid across it.”
- L1897 (jsx-text) “Planned Workout Shape” — tests: `app/routes/training/sessions.$sessionId.route.test.tsx:410`, `app/routes/training/sessions.$sessionId.route.test.tsx:434`
- L1980 (object-field) “Pace”
- L2259 (jsx-text) “Move across the recording to read each channel at any point — tap and drag on a phone, hover on desktop.”
- L2306 (object-field) “Distance”
- L2308 (object-field) “Moving time”
- L2310 (object-field) “Avg pace”
- L2338 (object-field) “Load (TSS)”
- L2377 (jsx-text) “Intensity by HR zone”
- L2451 (jsx-text) “Wrong session?”
- L2456 (jsx-text) “Move this recording to”
- L2480 (jsx-text) “Take it off this plan”
- L2510 (jsx-text) “Session Log” — tests: `app/routes/training/sessions.$sessionId.route.test.tsx:269`, `app/routes/training/sessions.$sessionId.route.test.tsx:1123`
- L2570 (ternary) “Log your reflection”
- L2577 (object-field) “How did the session go?” — tests: `app/routes/training/sessions.$sessionId.route.test.tsx:264`, `app/routes/training/sessions.$sessionId.route.test.tsx:277`
- L2633 (ternary) “Save Session Log” — tests: `app/routes/training/sessions.$sessionId.route.test.tsx:1123`
- L2633 (ternary) “Update Session Log” — tests: `app/routes/training/sessions.$sessionId.route.test.tsx:1123`

</details>

<details><summary><code>routes/training/sessions.$sessionId_.log.tsx</code> — 22</summary>

- L94 (object-field) “Log · ${loaderData?.sessionTitle ?? 'Session'} \| Trainm8”
- L94 (ternary) “Session”
- L184 (ternary) “Weight (kg)”
- L190 (ternary) “No load”
- L285 (ternary) “Log a working set first — there is nothing to finish yet.” — tests: `app/routes/training/sessions.$sessionId_.log.route.test.tsx:706`, `app/routes/training/sessions.$sessionId_.log.route.test.tsx:714`
- L286 (ternary) “That session is gone.” — tests: `app/routes/training/sessions.$sessionId_.log.route.test.tsx:379`, `app/routes/training/sessions.$sessionId_.log.route.test.tsx:384`
- L311 (object-field) “Not found”
- L316 (object-field) “That set did not make sense.”
- L322 (object-field) “${LOAD_KIND_LABELS[input.loadKind]} needs a number.”
- L350 (object-field) “That set is recorded as ${LOAD_VALUE_KIND_WORDS[result.recordedKind]}. It cannot be re-logged as something else from here.”
- L359 (ternary) “That step is not a lift.”
- L361 (ternary) “That set recorded no count.” — tests: `tests/e2e/strength-screens.test.ts:715`
- L362 (ternary) “That session is gone.” — tests: `app/routes/training/sessions.$sessionId_.log.route.test.tsx:379`, `app/routes/training/sessions.$sessionId_.log.route.test.tsx:384`
- L449 (jsx-text) “This session has no lifts to log.” — tests: `app/routes/training/sessions.$sessionId_.log.route.test.tsx:788`
- L505 (attr) “Back to today” — tests: `app/routes/training/sessions.$sessionId_.log.outcome.route.test.tsx:317`, `app/routes/training/sessions.$sessionId_.log.route.test.tsx:183`
- L518 (jsx-text) “Run your workout” — tests: `app/routes/training/sessions.$sessionId_.log.route.test.tsx:181`, `tests/e2e/strength-screens.test.ts:592`
- L624 (jsx-text) “Warm-up” — tests: `app/routes/training/sessions.$sessionId_.log.route.test.tsx:664`
- L642 (jsx-text) “Working sets” — tests: `app/routes/training/sessions.$sessionId_.log.route.test.tsx:663`, `tests/e2e/strength-screens.test.ts:604`
- L1086 (jsx-text) “Finish workout” — tests: `app/routes/training/sessions.$sessionId_.log.outcome.route.test.tsx:165`, `app/routes/training/sessions.$sessionId_.log.outcome.route.test.tsx:336`, `app/routes/training/sessions.$sessionId_.log.route.test.tsx:696`, `app/routes/training/sessions.$sessionId_.log.route.test.tsx:710` (+4)
- L1095 (jsx-text) “Every set was saved as you tapped it. This only marks the day.” — tests: `app/routes/training/sessions.$sessionId_.log.route.test.tsx:723`
- L1123 (jsx-text) “Already recorded.” — tests: `app/routes/training/sessions.$sessionId_.log.route.test.tsx:776`
- L1124 (jsx-text) “You finished this workout. Your sets are the record, and tapping one below still changes it — but nothing here is waiting to be filed.”

</details>

<details><summary><code>routes/training/sessions.new.tsx</code> — 6</summary>

- L31 (object-field) “New Workout Session \| Trainm8”
- L121 (toast/data) “Invalid date and time combination”
- L193 (attr) “New Workout Session”
- L206 (object-field) “e.g. Tuesday Tempo Run”
- L224 (attr) “Pick a discipline” — tests: `app/routes/training/sessions.new.route.test.tsx:316`
- L283 (jsx-text) “Create Session” — tests: `app/routes/training/sessions.new.server-errors.route.test.tsx:118`

</details>

#### No tab: first run

<details><summary><code>routes/start/uker.tsx</code> — 1</summary>

- L122 (toast/data) “, { title: L.created, description: L.createdDescription, type:”

</details>

#### No tab: auth / marketing

<details><summary><code>routes/_auth/auth.$provider/callback.ts</code> — 9</summary>

- L61 (object-field) “There was an error authenticating with ${label}.”
- L87 (object-field) “Already Connected” — tests: `app/routes/_auth/auth.$provider/callback.test.ts:117`, `app/routes/_auth/auth.$provider/callback.test.ts:182`
- L88 (object-field) “Your "${profile.username}" ${label} account is already connected.” — tests: `app/routes/_auth/auth.$provider/callback.test.ts:157`
- L96 (object-field) “Already Connected” — tests: `app/routes/_auth/auth.$provider/callback.test.ts:117`, `app/routes/_auth/auth.$provider/callback.test.ts:182`
- L97 (object-field) “The "${profile.username}" ${label} account is already connected to another account.”
- L116 (object-field) “Connected” — tests: `app/routes/_auth/auth.$provider/callback.test.ts:78`, `app/routes/_auth/auth.$provider/callback.test.ts:117`, `app/routes/_auth/auth.$provider/callback.test.ts:182`
- L118 (object-field) “Your "${profile.username}" ${label} account has been connected.” — tests: `tests/e2e/onboarding.test.ts:253`
- L147 (object-field) “Connected” — tests: `app/routes/_auth/auth.$provider/callback.test.ts:78`, `app/routes/_auth/auth.$provider/callback.test.ts:117`, `app/routes/_auth/auth.$provider/callback.test.ts:182`
- L148 (object-field) “Your "${profile.username}" ${label} account has been connected.” — tests: `tests/e2e/onboarding.test.ts:253`

</details>

<details><summary><code>routes/_auth/forgot-password.tsx</code> — 10</summary>

- L45 (object-field) “No user exists with this username or email”
- L101 (jsx-text) “Trainm8 Password Reset”
- L104 (jsx-text) “Here's your verification code:” — tests: `tests/e2e/settings-profile.test.ts:8`, `tests/e2e/onboarding.test.ts:21`
- L109 (jsx-text) “Or click the link:”
- L118 (object-field) “Password Recovery \| Trainm8”
- L136 (attr) “Forgot Password”
- L137 (attr) “No worries, we'll send you reset instructions.”
- L144 (ternary) “Username or Email”
- L163 (jsx-text) “Recover password”
- L171 (jsx-text) “Back to Login”

</details>

<details><summary><code>routes/_auth/login.server.ts</code> — 2</summary>

- L112 (object-field) “Invalid session”
- L113 (object-field) “Could not find session to verify. Please try again.”

</details>

<details><summary><code>routes/_auth/login.tsx</code> — 8</summary>

- L58 (object-field) “Invalid username or password”
- L102 (attr) “Please enter your details.”
- L102 (attr) “Welcome back!”
- L144 (jsx-text) “Forgot password?”
- L157 (jsx-text) “Log in”
- L179 (jsx-text) “New here?”
- L187 (jsx-text) “Create an account” — tests: `tests/e2e/onboarding.test.ts:107`
- L242 (object-field) “Unknown error”

</details>

<details><summary><code>routes/_auth/onboarding/$provider.tsx</code> — 8</summary>

- L43 (ternary) “You must agree to the terms of service and privacy policy”
- L114 (object-field) “A user already exists with this username”
- L163 (object-field) “Thanks for signing up!”
- L169 (object-field) “Setup Account \| Trainm8”
- L211 (attr) “Profile”
- L214 (jsx-text) “You can change your photo later”
- L244 (ternary) “Do you agree to our Terms of Service and Privacy Policy?”
- L272 (jsx-text) “Create an account” — tests: `tests/e2e/onboarding.test.ts:107`

</details>

<details><summary><code>routes/_auth/onboarding/index.tsx</code> — 8</summary>

- L37 (ternary) “You must agree to the terms of service and privacy policy”
- L76 (object-field) “A user already exists with this username”
- L85 (object-field) “Password is too common”
- L126 (object-field) “Thanks for signing up!”
- L132 (object-field) “Setup Account \| Trainm8”
- L205 (ternary) “Confirm Password”
- L218 (ternary) “Do you agree to our Terms of Service and Privacy Policy?”
- L243 (jsx-text) “Create an account” — tests: `tests/e2e/onboarding.test.ts:107`

</details>

<details><summary><code>routes/_auth/reset-password.tsx</code> — 7</summary>

- L56 (object-field) “Password is too common”
- L80 (object-field) “Reset Password \| Trainm8”
- L101 (attr) “Password Reset”
- L102 (attr) “Hi, ${loaderData.resetPasswordUsername}. No worries. It happens all the time.”
- L109 (ternary) “New Password”
- L121 (ternary) “Confirm Password”
- L137 (jsx-text) “Reset password” — tests: `tests/e2e/onboarding.test.ts:413`

</details>

<details><summary><code>routes/_auth/signup.tsx</code> — 8</summary>

- L53 (object-field) “A user already exists with this email”
- L105 (jsx-text) “Welcome to Trainm8!”
- L108 (jsx-text) “Here's your verification code:” — tests: `tests/e2e/settings-profile.test.ts:8`, `tests/e2e/onboarding.test.ts:21`
- L113 (jsx-text) “Or click the link to get started:”
- L122 (object-field) “Sign Up \| Trainm8”
- L143 (attr) “Let's start your journey!”
- L144 (attr) “Please enter your email.”
- L151 (ternary) “Email”

</details>

<details><summary><code>routes/_auth/verify.server.ts</code> — 1</summary>

- L71 (object-field) “Please reverify your account before proceeding”

</details>

<details><summary><code>routes/_auth/verify.tsx</code> — 3</summary>

- L50 (object-field) “Check your email”
- L62 (object-field) “Check your 2FA app”
- L63 (ternary) “Please enter your 2FA code to verify your identity.”

</details>

<details><summary><code>routes/_auth/webauthn/authentication.ts</code> — 2</summary>

- L26 (toast/data) “Set-Cookie”
- L107 (toast/data) “, error: error instanceof Error ? error.message :”

</details>

<details><summary><code>routes/_auth/webauthn/registration.ts</code> — 1</summary>

- L46 (toast/data) “Set-Cookie”

</details>

<details><summary><code>routes/_marketing/about.tsx</code> — 1</summary>

- L2 (jsx-text) “About page”

</details>

<details><summary><code>routes/_marketing/tos.tsx</code> — 1</summary>

- L2 (jsx-text) “Terms of service”

</details>

#### No tab: other

<details><summary><code>routes/$.tsx</code> — 3</summary>

- L14 (ternary) “Not found”
- L37 (jsx-text) “We can't find this page:”
- L43 (jsx-text) “Back to home”

</details>

<details><summary><code>routes/__design-components.tsx</code> — 1</summary>

- L285 (attr) “Select”

</details>

<details><summary><code>routes/admin/cache/index.tsx</code> — 3</summary>

- L124 (attr) “Total results shown”
- L218 (ternary) “You sure?”
- L219 (ternary) “Delete”

</details>

<details><summary><code>routes/admin/moderation.tsx</code> — 6</summary>

- L118 (jsx-text) “Open reports on published sessions, oldest first.”
- L123 (jsx-text) “No open reports.”
- L179 (jsx-text) “Reason shown to the author”
- L190 (jsx-text) “Take down”
- L198 (jsx-text) “Dismiss report”
- L210 (jsx-text) “The Catalogue”

</details>

<details><summary><code>routes/training/__provenance-week.tsx</code> — 29</summary>

- L104 (ternary) “This week”
- L228 (jsx-text) “Add it yourself”
- L277 (attr) “Close”
- L299 (attr) “Close”
- L330 (jsx-text) “Where it came from”
- L335 (jsx-text) “trainm8 wrote this session from a published source.”
- L338 (jsx-text) “Shown in a currency the source did not use”
- L344 (jsx-text) “You see”
- L351 (jsx-text) “. It is a change of units, not a score for how likely the session is to work — if you train by lactate, use the source's number.”
- L362 (jsx-text) “Where it came from”
- L365 (jsx-text) “Ordinary practice, written in-house. There is no published protocol behind it and we are not claiming one.”
- L374 (jsx-text) “Where it came from”
- L381 (jsx-text) “Not vouched for”
- L382 (jsx-text) “Written by another athlete, not by trainm8. It carries an author, not a citation, and it never can. Saves are popularity, not evidence.”
- L393 (jsx-text) “What you changed”
- L424 (jsx-text) “Why it sits here”
- L432 (jsx-text) “All sources for this week”
- L463 (jsx-text) “Where this week came from”
- L473 (jsx-text) “The season shape”
- L478 (jsx-text) “The shape places the week's rest and quality days. It does not write the sessions.”
- L522 (jsx-text) “Written in-house”
- L523 (jsx-text) “No published protocol behind these, and we are not claiming one.”
- L536 (jsx-text) “Not vouched for”
- L553 (jsx-text) “Community sessions carry an author, not a citation.”
- L561 (jsx-text) “Your changes”
- L580 (jsx-text) “Nothing was written”
- L627 (ternary) “Run”
- L629 (ternary) “Strength” — tests: `app/utils/labels.test.ts:160`
- L630 (ternary) “Rest”

</details>

#### Shared components (app/components)

<details><summary><code>components/dev-athlete-switcher.tsx</code> — 1</summary>

- L119 (jsx-text) “Log out”

</details>

<details><summary><code>components/load-metric-badge.tsx</code> — 2</summary>

- L7 (ternary) “CTL (Fitness)”
- L8 (ternary) “ATL (Fatigue)”

</details>

<details><summary><code>components/overlay-header.tsx</code> — 1</summary>

- L35 (attr) “Close”

</details>

<details><summary><code>components/passkey-item.tsx</code> — 1</summary>

- L42 (jsx-text) “Delete”

</details>

<details><summary><code>components/progress-bar.tsx</code> — 1</summary>

- L34 (ternary) “Loading”

</details>

<details><summary><code>components/token-popover.tsx</code> — 1</summary>

- L171 (jsx-text) “Close”

</details>

### 2.4 Tests that assert English copy (they change with the string)

Counts of English-string matches per test file. The matches come from tests that import or are named after the source file, from e2e tests (strings of 12+ characters) and from `labels.test.ts`. Per-string references are inline in §2.3, and §2.1 lists the server-string tests.

| Test file | English-string hits |
|---|---|
| `app/routes/training/plan.route.test.tsx` | 106 |
| `app/routes/training/sessions.$sessionId.route.test.tsx` | 47 |
| `app/routes/settings/integrations.test.tsx` | 46 |
| `tests/e2e/strength-screens.test.ts` | 23 |
| `app/routes/training/sessions.$sessionId_.log.route.test.tsx` | 22 |
| `app/utils/labels.test.ts` | 21 |
| `tests/e2e/plan-authoring.test.ts` | 21 |
| `app/routes/training/__season-chart.route.test.tsx` | 21 |
| `app/routes/settings/training/lifts.$exerciseId.route.test.tsx` | 15 |
| `app/routes/training/catalogue.route.test.tsx` | 15 |
| `app/routes/_home/presenter.test.ts` | 12 |
| `app/routes/_auth/auth.$provider/callback.test.ts` | 11 |
| `tests/e2e/onboarding.test.ts` | 9 |
| `app/routes/training/__copy-week.route.test.tsx` | 9 |
| `tests/e2e/cta-semantics.test.ts` | 8 |
| `app/routes/training/exercises.$exerciseId.route.test.tsx` | 8 |
| `app/routes/training/programs.run.route.test.tsx` | 8 |
| `app/routes/settings/training/analyze.route.test.tsx` | 6 |
| `app/routes/training/__phase-editor.route.test.tsx` | 6 |
| `app/routes/training/__runner-presenter.test.ts` | 6 |
| `app/routes/settings/training/lifts.$exerciseId_.propose.route.test.tsx` | 5 |
| `app/routes/training/__exercise-combobox.test.tsx` | 5 |
| `app/routes/integrations.intervalsicu.connect.test.ts` | 4 |
| `app/routes/integrations.intervalsicu.sync.test.ts` | 4 |
| `app/routes/integrations.strava.callback.test.ts` | 4 |
| `app/routes/integrations.strava.sync.test.ts` | 4 |
| `tests/e2e/season-edits.test.ts` | 4 |
| `app/routes/training/__stamp-pattern.route.test.tsx` | 4 |
| `app/routes/training/plan.new.$eventId.route.test.tsx` | 4 |
| `app/routes/training/plan.test.ts` | 4 |
| `app/routes/_home/index.dashboard.test.tsx` | 4 |
| `tests/e2e/settings-profile.test.ts` | 3 |
| `tests/e2e/session-authoring.test.ts` | 3 |
| `app/routes/training/__exercise-history-presenter.test.ts` | 3 |
| `tests/e2e/mobile-overflow.test.ts` | 3 |
| `app/routes/training/events.$eventId.test.ts` | 3 |
| `app/routes/training/sessions.$sessionId_.log.outcome.route.test.tsx` | 3 |
| `app/routes/integrations.sync.test.ts` | 2 |
| `app/routes/training/catalogue.publish.route.test.tsx` | 2 |
| `app/routes/training/plan.new.$eventId.test.ts` | 2 |

## 3. Shared files: who touches them, and how parallel PRs avoid conflicts

| File | Touched by | Conflict risk | Proposal |
|---|---|---|---|
| `app/utils/labels.ts` (2923 lines, 180 exports) | Every area. 60 exports are I dag-only, 32 Sesong-only, 8 Meg-only, 6 Bibliotek-only, 6 first-run-only. Cross-area exports: `DISCIPLINE_LABELS`/`getDisciplineLabel` (Sesong, Bibliotek, Meg, sessions, I dag presenter, utils), `SESSION_ARCHETYPE_LABELS` (Bibliotek, Sesong, sessions), `INTENT_LABELS` (Sesong, sessions), `NB_DISCIPLINE_LABELS`, `nbDisciplineLabel`, `PHILOSOPHY_LABELS` (I dag, first run, Sesong), `APP_TAB_LABELS` (chrome). | **High**: every area adds Norwegian maps here, and appends to the same tail. | **Foundation PR first** that only (a) adds one banner comment per area (`// ── Sesong ──`, `// ── Bibliotek ──`, `// ── Meg ──`, `// ── Økt/editor ──`) and moves each area-only export under its banner (pure moves, no wording change), and (b) adds the Norwegian twins of the **cross-area** maps (`NB_SESSION_ARCHETYPE_LABELS`, `NB_INTENT_LABELS`, `NB_EVENT_KIND_LABELS`, Norwegian weekday long names, a `nbActivityLabel` for "Ride/Run") without switching any caller. After that, each area PR edits only its own section and switches its own call sites. **Never change `DISCIPLINE_LABELS`/`getDisciplineLabel` in place**: they also feed server-side titles (S5/S6), `workout-schema.ts` and parsers, and the "Bike vs Ride" rule is pinned by `labels.test.ts`. Retire them in the last PR, once no caller is left. |
| `app/utils/labels.test.ts` | Every area (completeness tests per map) | High | Same section banners as `labels.ts`. Each PR adds its own `describe` block at the end of its section. |
| `app/styles/tailwind.css` | Foundation (owner decision: darker per-track **text** tokens, `track-*-foreground` or similar, in `:root`/`.dark`/`@theme inline`). Sessions/editor (removing `tw-animate-css` at L2-11 once `token-popover`, `__block-editor-sheet` and `__lift-help-panel` move). Marketing (`--animate-slide-*` keyframes, L403-440). Possibly `zone-*` (L170+, L291-295) if the session page's palette chips move to `zone-*`/`status-*`. | Medium | **Token additions only in the foundation PR.** Area PRs do not edit `tailwind.css`. The `tw-animate-css` import is deleted in the sessions PR only, as its last hunk, after `rg 'animate-in\|fade-in\|zoom-in\|slide-in-from'` is empty. `docs/design/design-system.md` changes follow the same rule (the foundation PR documents the tokens, and an area PR only edits its own row in the "Older app tokens" note). |
| `app/utils/misc.tsx` (`cn` tailwind-merge config) | Foundation, only if new text-size or colour tokens are added | Low | Foundation PR only. |
| `app/utils/format.ts` (866 lines, sections by banner) | Sesong (plan-volume and plan-week sections, `formatNb*`), Meg (Weekly Capacity, pace), I dag (Norwegian dates L276-380, volumes L569-678), and kilos (owner decision: `82,5 kg × 5 · 5 · 5 · 4`) | Medium | Foundation adds **`formatNbKg` and `formatNbRepScheme`** here as new functions. **Do not change `formatKg`** (`app/utils/strength-log.ts:363`): `workout-notation.ts` and the strength engine use it for round-trippable `82.5` notation, and 21 modules import it. Each area then switches its own display call sites. Each new `formatNb*` goes into the section that already owns its domain, appended at that section's end, and only one PR owns each section. |
| `app/components/page-header.tsx` | Sesong, Bibliotek, Meg, sessions (about 35 routes) | Medium if restyled | Restyle (type scale, radius) in the foundation PR, or not at all. Area PRs only change props at call sites. |
| `app/components/forms.tsx` (`Field`, `ErrorList`, …) | I dag, Sesong, first run, Meg, auth (about 40 routes) | Medium | Same rule: the foundation PR owns it. No English was found in it. |
| `app/components/error-boundary.tsx` | Every route | Low | Norwegian default copy (S9) goes in the foundation PR. Per-route `statusHandlers` text belongs to each area. |
| `app/components/chart/chart.tsx` | I dag `season-pane`, Sesong `__season-chart`/`__preset-gallery`, Bibliotek `__lift-chart`, the session page | Low (1 radius) | Owned by the Sesong PR (the heaviest user). Others do not touch it. |
| `app/components/profile-bars.tsx`, `shape-strip.tsx`, `score-stanza.tsx` | I dag (`stream.tsx`, `writing-line.tsx`) and sessions (`sessions.$sessionId.tsx`, `__workout-editor`, `__token-sentence-editor`, `__intensity-popover`) | Medium (`profile-bars` raw palette ramp) | Owned by the **sessions/editor PR**. If I dag wants a change, it lands there first. |
| `app/routes/training/__plan-chrome.tsx` (`PlanHero`, `PillLink`, `PlanCard`, `Disclosure`, `DisclosureCard`, `SegmentedNav`) | Sesong (plan, plan.new.$eventId, generate, __phase-editor, __track-editor, __season-events, __season-chart) and Bibliotek (`catalogue.tsx`) | Medium | Owned by Sesong. Bibliotek merges after Sesong, or `catalogue.tsx` keeps its imports unchanged. `Disclosure` is the natural place to swap `<details>` for `ui/collapsible`, once, for both areas. |
| `app/routes/training/__workout-detail-editor.tsx` and its subtree (`__token-sentence-editor`, `__sets-popover`, `__intensity-popover`, `__intensity-editor`, `__exercise-combobox`, `__block-editor-sheet`, `__token-editor-controls`, `__validation-summary`, `__empty-state`, `components/token-popover.tsx`, `components/overlay-header.tsx`) | I dag (`day-stamp-cell.tsx` opens it) and the session page | Medium | Owned by the sessions/editor PR. I dag only checks that its draft still opens (e2e `home-timeline`). |
| `app/utils/session-title.ts`, `app/utils/training.ts`, `app/utils/load/{week-replan,propose-week-change,session-nudge,coach,readiness}.ts`, `strength-program-seed.server.ts` | Server English that shows on I dag (S1–S7) | Medium (big test fan-out, see §2.4) | One **"server prose" PR** owned by I dag. It is separate from the UI area PRs, because it changes stored strings and needs a data migration for legacy rows. |
| `docs/adr/` (next free number **0088**), `GLOSSARY.md`, `docs/design/ui-conventions.md` | Any PR that records a decision | High for ADR numbers | Reserve numbers in the foundation PR description (e.g. 0088 Norwegian across the tabs, 0089 kilos/reps format, 0090 track text tokens). An area PR that needs a new ADR takes the next reserved number. |
| `tests/e2e/*` shared fixtures (`tests/playwright-utils.ts`, the devtools-hiding fixture), `tests/e2e/mobile-overflow.test.ts`, `tests/e2e/cta-semantics.test.ts` | Several areas assert copy in the same e2e file | Medium | Each area edits only the `test(...)` blocks for its own routes. `cta-semantics` and `mobile-overflow` span areas, so update them in the PR that changes the string, and rebase. |
| `prisma/migrations/*` | A data fix for S1, S2, S5 or S7 | Low, but order-sensitive | Only the server-prose PR adds a migration. |

### Proposed PR split (no file overlap after the foundation)

1. **Foundation** (small, first): the `labels.ts`/`labels.test.ts` section banners and moves, the Norwegian twins of the cross-area maps, `formatNbKg`/`formatNbRepScheme`, the track text tokens in `tailwind.css` and their doc, Norwegian `error-boundary` defaults, `page-header`/`forms` restyle if any, deleting `load-metric-badge.tsx` and `floating-toolbar.tsx`, and the ADR number reservations.
2. **I dag polish**: `_home/timeline/*` (the `rounded-[Npx]` cleanup, `Button` for Ukeskiftet and quick-log, `week-strip` radius, small targets), plus the S9 404/400 copy in `_home/index.tsx`. `_home/presenter.ts` dead English (S10) can be deleted here.
3. **Server prose (I dag-owned)**: S1–S7, plus the legacy-row data migration. It touches `utils/load/*`, `session-title.ts`, `training.ts` and the seed. Its tests are listed in §2.1.
4. **Sesong**: `training/plan*.tsx`, `events*.tsx`, the Sesong `__*` modules, `__plan-chrome.tsx`, `chart.tsx`, the Sesong label section (130–460 event/volume maps and 2500–2752).
5. **Bibliotek**: `library*.tsx`, `training/catalogue*`, `programs*`, `exercises*`, `__lift-chart`, and its label section (catalogue maps 172–227). Rebase after Sesong if it touches the `__plan-chrome` API.
6. **Meg**: `me.tsx`, `__me-form-records*`, `settings/**`, `integrations.*`, `imports.*`, and its label section (`UNIT_LABELS`, `WEEKDAY_LABELS`, `PROVIDER_LABELS`).
7. **Sessions / workout editor** (no tab): `training/sessions.*`, the editor subtree, `profile-bars`/`shape-strip`/`score-stanza`/`token-popover`/`overlay-header`, `INTENT/STEP_KIND/INTENSITY_KIND` labels, and **last** the `tw-animate-css` import in `tailwind.css`.
8. **First run** is already Norwegian, with radius debt only: fold it into PR 2 or PR 6 (it touches only `routes/start/*`).
9. Leave alone or decide separately: auth/marketing (ADR 0081 §4: not redesigned), admin, and the `__provenance-week` prototype (delete).

PRs 2, 4, 5, 6 and 7 touch disjoint files once 1 has landed. PR 3 overlaps PR 2 only on `_home/presenter.ts`, so assign that file to one of them.
