# Design · #472 · part 3 (Critic)

## Todo (design-critic.md, word for word)

1. **Score each variant as built**, open in a browser:
   - **Criteria**: per acceptance criterion, `holds`, `partly` or `misses`, with what you saw.
   - **Craft**: call the Skill tool with `bredvid-design-engineering:emil-design-eng`, and name the details that would make it feel wrong in use.
   - **Worst case**: call the Skill tool with `bredvid-design-engineering:break-ui` in report-only mode, and keep what broke with the fix for each.
   - **Fit**: how it sits with the rest of the product, and how it holds as the next features land on it.
   - **Build cost**: as given.

   Done when every variant has all five.
   - done: one variant, all five below. Rendered with the repo's @playwright/test (Chromium) at 390, 320, 1440, dark, and at 195 CSS px (what 390 px reads like at 200 % text).
2. **Recommend** the variant that holds the most criteria; between equals, the one that breaks least in the worst case, then the one with the better fit; build cost decides only between variants equal on all three. When no variant holds every criterion, recommend the closest and name, as a decision, what the build must change. With one variant, say whether it holds every criterion and what the build must fix where it doesn't.
   - done: see Recommendation.
3. **Fill the overview** on the canvas as [../references/canvas.md](../references/canvas.md) says: the verdict strip, the comparison table, the decisions, your scoring in the appendix, and the worst-case board.
   - done: canvas.html overview, appendix and worst-case table filled.
4. **Open the designer's pick.** When it differs from yours, put the designer's reason and your answer in one line in the appendix.
   - done: see "Designer's pick" at the end.

## Recommendation

**Two figures, one line**, with six build changes. It holds 9 of the 12 criteria. 2, 6 and 12 hold only partly. It is the only variant, and the direction is right: Sesong's words, ink and `≠`, one row per track, no meter before anything is done. What it gets wrong is one rule taken from Sesong at the wrong level, plus how the row reflows when text is large.

## 1. Scoring: "Two figures, one line"

### Criteria (as built, `?solo=1&data=demo|worst|empty|one`)

| # | Criterion (short) | Score | What I saw |
|---|---|---|---|
| 1 | Target and Planned Volume per track, two labelled figures in the currency, never blended | holds | `Løping  mål 32 km · planlagt 24 km, +1 uten km`. Two words, two figures, both with the unit. No gap figure. |
| 2 | Preview's Planned Volume = Sesong's for that week and track | partly | The figures match (`week-volumes.ts` `total()`: 0 when nothing is placed, null when nothing is measured). The `≠` beside them does not always match (see 6). The planned figure also carries a unit Sesong leaves off (`planlagt 24 km` against Sesong's `planlagt 24`), which is deliberate. The shared function and its test are build work. |
| 3 | Unmeasured counted apart with the existing wording, never as zero | holds | `+1 uten km`, `+1 uten timer` (`unmeasuredCountLabel`). Joined with a comma, see craft. |
| 4 | Placed but none measured: no planned figure, existing words, no `0 km` | holds | `planlagt 2 økter uten km`, `planlagt 1 økt uten km` (`unmeasuredFigureLabel`, singular right). |
| 5 | Nothing placed: planned 0, unfilled lines unchanged | holds | Empty set: `planlagt 0 km` / `0 t` on every track, and the «Ingenting å legge inn – …» lines are as today. |
| 6 | `≠` by Sesong's rule and `DRIFT_TOLERANCE`; no mark when unmeasured sessions could explain a short week | partly | Tolerance, the unmeasured rule and the target-0 branch are all right (`3 km` against `7 km` shows ≠; `24 km +1 uten` against `32` shows none). But the canvas gates the mark on **the track** having sessions. Sesong gates it on **the week** having sessions (`presenter.ts:975`, `hasSessions: sessionRows.length > 0`). In demo Uke 49 the run track has nothing placed and the bike and swim tracks do. Sesong would read `mål 26 km · planlagt 0 ≠`. The preview reads `planlagt 0 km` with no mark. That is the week this ticket exists for. |
| 7 | Null target reads `—` and still shows Planned Volume | holds | `Sykling  mål — · planlagt 3,8 t`, and with every target null in the worst set. |
| 8 | Hours track: distance step timed by thresholds, else counted apart (`uten t`) | holds (with decision) | Drawn as `+1 uten timer`. That is the existing `NB_UNMEASURED_WORDS.hours`, and criterion 3 asks for the existing wording. The threshold timing is build work. |
| 9 | One Norwegian sentence above the weeks, in `PLAN_GENERATE_LABELS` | holds | One footnote under «Sesongen», not repeated on cards. It also carries the `≠` legend, a second clause that earns its place because the preview has no meter or tooltip habit to teach `≠`. |
| 10 | No placed session rescaled; test pins it | holds | Nothing in the design touches a prescription. The test is build work. |
| 11 | Changing an answer shows both figures for the regenerated season; server regenerates | holds | The figures belong to the week card, so a rebuild re-renders them. Nothing is posted back. |
| 12 | 390 × 844: no overflow, figures stay together or wrap as a unit, screen reader hears target vs planned | partly | No overflow at 390, 320 or 1440. Each figure's label sticks to its value. The accessibility tree reads `Løping mål 32 km planlagt 24 km, +1 uten km` and `img "planlagt er mer enn 10 % unna målet"`. But `≠` wraps alone onto its own line at 320 (`Sykling … 22,8 t, / +11 uten timer ≠` and in the 200 % render). The list relies on `li { display: contents }`, which WebKit has a history of dropping from the accessibility tree, and VoiceOver on a real iPhone is where this criterion is judged. At 200 % text the row overflows the card (worst case #1). |

**Held: 9 of 12 hold, 3 partly (2, 6, 12), none miss.**

### Craft (emil-design-eng)

| Before | After | Why |
| --- | --- | --- |
| `planlagt 3,1 t, +1 uten timer` | `planlagt 3,1 t +1 uten timer` (a space; the `+` is the joiner) | A comma right after a comma-decimal reads as one more decimal. design-system.md already moves lift lines off commas for this reason. |
| `≠` its own flex item, free to wrap | `≠` inside the last group's `nowrap` span, after a thin space | A lone `≠` at the start of a line belongs to nothing. The mark must sit on the figure it judges. |
| Wrapped line starts `· planlagt …` | Hang the separator on the target group (`mål 142 km ·`), as the designer proposed | A line that starts with punctuation reads as a fragment. Do the same in Sesong's `TrackMeter` when it is touched, so the two lines keep the same shape. |
| `li { display: contents }` in a 2-column grid | `li { display: grid; grid-column: 1 / -1; grid-template-columns: subgrid }` | Same alignment, and the list items stay in the accessibility tree in WebKit. |
| `grid-template-columns: max-content minmax(0,1fr)` at every width | A container query below ~300 px puts the name above the figures (`grid-template-columns: 1fr`) | At large text «Svømming» takes half the line and the figures have nowhere to go (worst case #1). |
| Motion: none | Keep none | A static readout that changes only on navigation. Correct per animate/emil: nothing here earns motion. |

The rest feels right: names in track ink, labels muted, values at 500, `≠` in `status-under`, all from the tokens, readable in dark mode. The figures line up in a column down the card and across the four open weeks, which is the whole point of the row layout.

### Worst case (break-ui, report-only)

| # | Severity | Field | Worst-case value | What happens | Fix |
|---|---|---|---|---|---|
| 1 | Broken | the track row | 390 px at 200 % text (measured as a 195 CSS px viewport) | The rows overflow the card by ~66 px (`scrollWidth` 261 against 195; only `.tracks` overflows). The planned figure is clipped mid-number: `· planlagt 24`, `planlagt 4,`. The designer's "no overflow" was measured with CSS `zoom: 2` inside an `overflow: auto` frame, which hides it. | Container query that stacks the name above the figures when narrow. Keep `nowrap` only on `value + unit` (and on the last value + `≠`), not on `label + value`, so `planlagt` can break from its figure as a last resort. Re-check at 195 px. |
| 2 | Wrong data | `≠`, track with nothing placed | Uke 49 run: target 26, 0 placed, week has bike and swim sessions | No `≠`. Sesong shows `≠` for the same week after approval. | Gate `≠` on the week having any placed session, from the same `wordTrackWeek` call Sesong uses (`hasSessions` = the week's sessions). A wholly empty week keeps no mark. |
| 3 | Ugly | `≠` | `+11 uten timer ≠` at 320, any drifting row at 200 % | `≠` wraps alone to the start of a line. | Put `≠` in the last group's `nowrap` span. |
| 4 | Ugly | separator | `mål 142 km` / `· planlagt 168,4 km` at 320 | The wrapped line starts with `·`. | Hang `·` at the end of the target group. |
| 5 | Ugly | joiner | `22,8 t, +11 uten timer` | A comma beside a comma-decimal. | A space, no comma. |
| 6 | Fragile | list semantics | `li { display: contents }` | Chromium keeps the listitems. WebKit has dropped `display: contents` elements from the accessibility tree before. | `subgrid`. Check with VoiceOver on a phone. |
| 7 | Fragile | number format | `1 270,5 km` | The canvas groups thousands with a plain space, inside a `nowrap` span so it holds. The build must use `formatNbVolumeFigure` (no-break space), not a copy of `nbFig`. | Use `formatNbVolumeFigure`. |

**What held:** every target null (`mål —`, planned kept); target 0 with sessions (`mål 0 km · planlagt 6 km ≠`); `1 økt uten timer` singular; a 4-digit swim figure; three tracks drifting at once; a long event name (the header truncates and the event line wraps); long session titles and provenance; 52 weeks behind «48 uker til»; empty and one-session seasons; dark mode; 1440 px.

### Fit

- **With the product:** it is Sesong's `TrackMeter` text line without the meter, with the same names in ink, the same `mål · planlagt` words, the same `≠` colour and aria label. An athlete who approves and opens Sesong sees the same week in the same order. Two places differ on purpose. The planned figure here carries its unit (`planlagt 24 km`; Sesong writes `planlagt 24`). The unmeasured count sits beside the sum unnamed (`+1 uten km`), where Sesong names its side in the notes (`planlagt +1 uten km`). The first is justified (rows here wrap more often, and a figure read alone needs its unit). The second is fine because only the planned side exists before approval.
- **As the next features land:** #475 (provenance drawer, row treatment) works on the session rows below, not on this header, so it inherits the header untouched. #457 (review controls) adds actions. The track rows are a self-contained `ul` in the header, so neither has to move them. If a meter is ever wanted (for example once a preview could show done volume, which is out of scope), it slots into the subgrid as a third column. The one thing that would hurt is copying the `≠` rule by hand. Building it on the same `wordTrackWeek` with a week-level `hasSessions` keeps the preview and Sesong from drifting.

### Build cost

As given: none (one variant, part 2 skipped).

## Decisions the build must take

1. **`≠` on a track with nothing placed, in a week that has other sessions** (po, two-way): show it, by Sesong's week-level rule (`hasSessions` = the week has any placed session), because criteria 2 and 6 ask for Sesong's reading, and a run target of 26 km with no run placed is exactly the gap this ticket surfaces. Rejected: the canvas's per-track rule, which hides the largest gap a generated week can have and disagrees with Sesong a minute after approval.
2. **Hours wording** (po, two-way): `+1 uten timer` (`unmeasuredCountLabel`), not criterion 8's `uten t`, because criterion 3 asks for the existing wording and `uten t` reads as a typo. Agrees with the designer.
3. **Unit on both figures** (po, two-way): keep `planlagt 24 km` in the preview, because a wrapped or read-alone figure needs its unit. Rejected: copying Sesong's unitless `planlagt 24`. Aligning Sesong is a separate change. Agrees with the designer.
4. **Large-text reflow** (dev, two-way): below ~300 px of container, stack the track name above its figures, and keep `nowrap` only on value + unit, because at 200 % text the row overflows and clips the planned figure. Rejected: relying on `nowrap` label+value groups, which is what breaks.
5. **`≠` and separator placement** (dev, two-way): `≠` inside the last figure's `nowrap` group; `·` hung at the end of the target group; no comma before `+N uten`. These avoid a lone `≠`, a line that starts with `·`, and a comma beside a comma-decimal.
6. **List semantics** (dev, two-way): `subgrid` instead of `display: contents` on the `li`, because the screen-reader half of criterion 12 is judged on VoiceOver.

Still needs a real phone: VoiceOver on iOS Safari reading the track list and the `≠` image; iOS Larger Text at its largest size on the generate page.

## Comment text for the result

> **Critic: recommend "Two figures, one line", with six build changes.** It holds 9 of 12 criteria. 2, 6 and 12 hold only partly. It uses Sesong's words, ink and `≠`, one row per track and no meter, so the athlete reads the same week before and after approving.
>
> The build must change:
> 1. **`≠` by the week, not the track.** Sesong gates the mark on the *week* having sessions (`presenter.ts:975`). In demo Uke 49, run has a 26 km target with nothing placed while bike and swim have sessions. Sesong shows `planlagt 0 ≠` there; the canvas shows no mark. Read it through the same `wordTrackWeek` call.
> 2. **Reflow at large text.** At 390 px with 200 % text the rows overflow the card by ~66 px and clip `planlagt 24…`. Stack the name above the figures in a narrow container, and keep `nowrap` on value + unit only.
> 3. **Glue `≠` to the last figure** (it wraps alone at 320) and **hang `·`** on the target group.
> 4. **No comma before `+N uten`** (`3,1 t, +1` reads as a decimal).
> 5. **`subgrid` instead of `display: contents`** on the list items, for VoiceOver.
> 6. **`uten timer`, not `uten t`**, and a unit on both figures: both agree with the designer.
>
> Settled by probe: does the row overflow at 200 % text? Rendered the canvas at a 195 CSS px viewport (390 px at 200 %). `.tracks` was the only element overflowing (`scrollWidth` 261 against 195), and the planned figure was clipped. Needs a real phone: VoiceOver on the track list and the `≠`, and iOS Larger Text.

## Designer's pick (opened after the recommendation)

The same variant, so there is no disagreement. On its open question (the meter-less row, or Sesong's `TrackMeter` as is): the meter-less row. Before approval nothing is done, so the meter would draw only an outline and a tick, and its 72 px column is what would push the figures onto two lines at 390. The pick's build note (one `wordTrackWeek` reading, `·` hung) agrees with decisions 1 and 5.
