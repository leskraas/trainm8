# Critic: #674 design, run 1

**Recommendation: Fasett.** It holds all nine acceptance criteria. The build must fix three things: the header facet's tap target, keyboard access to the popover's link, and the `model` binding of a Planned TSS that now reads a Garmin or Polar result.

Steps followed (design-critic.md):

1. Score each variant as built, open in a browser. Done: one variant, five headings below.
2. Recommend. Done: Fasett, with what the build must fix.
3. Fill the overview on the canvas. Done: verdict strip, comparison table, decisions, appendix scoring, worst-case board.
4. Open the designer's pick. Done after this file's recommendation was written. See the last section.

Method: I reran the designer's probe in Chromium (repo Playwright) with output going to `critic-probe/` (`probe-copy.mjs`). It found no errors and no overflow at 320, 390 or 1440 px. I added `critic-probe/measure.mjs`, which measures hit areas, checks that credits stay visible with the popover closed, and tests tap, tap-outside and keyboard Tab from an open facet. Screenshots are `critic-probe/c-*.png`. I checked every number against Riegel by hand. I read `resolve.ts`, `intensity-target.ts`, `score-stanza.tsx`, `token-popover.tsx`, `session-summary.server.ts`, ADR 0098, `ui-conventions.md`, `design-system.md` and the #670 critic. I did not run 200 % zoom. That remains inferred.

## 1. Criteria

| # | Criterion | Score | What I saw |
|---|---|---|---|
| 1 | Rung 2 renders name ≈ pace, 20:00 5 km → `10 km-fart ≈ 4:10/km` | holds | The header shows `Mål 10 km-fart ≈ 4:10 /km` and the popover heading shows the same. 1200·2^1.06 = 2502 s, which is 4:10 /km. The chip stays name-only, as today (`IntensityChip`). The `4:10 /km` spacing is the app's own format. |
| 2 | Nearest by ratio, newest at that distance, off-anchor counts, at-anchor wins | holds | 15 km Polar → halvmaratonfart (ratio 1.41, high). A 10 km Garmin result is at the anchor, so it wins as rung 1 (4:09). For marathon, worst case picks 15 km over 7,5 km and 1500 m. Tie → newer, then longer (decision 5). |
| 3 | Confidence = weakest of ratio and age; rung 1 by age; never hides | holds | 5 km→10 km: ratio high, 188 days medium → Middels. 5 km→HM: ratio 4.22 → Lav. 15 km viewed on day 90 → medium, so the boundary is right. A 1500 m rung-1 result from 2024 shows Lav and still a point. |
| 4 | Low conversion is a 1.06–1.15 band; own % applies to both edges | holds | `halvmaratonfart ≈ 4:22–4:58 /km`, which I recomputed. `105 % maratonfart ≈ 4:20–5:15`. `95–105 %` gives `6:01–6:39` (outer edges). |
| 5 | A line on tap, hover or focus, in Norwegian, with source, date, typed/measured and confidence in words | holds | Tapping the header facet or a done chip opens it. A planned chip shows it as the editor's closing line, one tap deep. A fine pointer opens it on hover after 300 ms, and keyboard focus opens it. The wording is the issue's own: "Omregnet fra 5 km-resultatet ditt 3. mai", "20:00 · skrevet inn av deg" / "målt av klokka · Garmin Forerunner 265", and "Middels sikkerhet: resultatet er over tre måneder gammelt." The I dag row gets no line (decision 9), which the criterion's parenthetical (session detail and Token Sentence) allows. Build fixes in §2. |
| 6 | Garmin/Polar credit on the line for a device-origin source | holds on screen | The popover carries ADR 0098's derived string, and SourceCredits stays visible under the stanza with the popover closed (`c-garmin-closed.png`, `c-worst-320-closed.png`, which shows both platforms). **Not drawn:** the same rule applies off screen (decision C below). |
| 7 | Rung and result depend on stored results only; ageing changes confidence only | holds | Viewing the same 5 km on 20 Nov 2027 keeps the 5 km as the source and the fast edge at 4:10, and turns medium into a 4:10–4:26 band. The band follows from criterion 4, so the displayed text changes with the day while the resolution does not. That is the only consistent reading of 4 and 7 together. |
| 8 | Planned TSS through the same ladder; recompute scheduled sessions | holds (by decision; no UI) | Decision 4 fixes Planned TSS to the 1.06 point, so it is a function of results alone. Architecture owns the recompute. |
| 9 | At-anchor-only athletes see today's paces, each with its line | holds | Garmin 10 km 41:30 → `≈ 4:09 /km`, the same arithmetic as today's `racePace` arm, now with "Fra 10 km-resultatet ditt 3. mai". |

Holds 9 of 9.

## 2. Craft (emil-design-eng)

| Before | After | Why |
| --- | --- | --- |
| Header facet `≈ 4:10 /km` is a 67×18 px inline button | `relative` with an invisible `after:` hit area to ~44 px tall (`after:absolute after:-inset-x-1 after:-inset-y-3`) | `ui-conventions.md` §106: a compact control gets an `after:` hit area. 18 px is a miss for a thumb on a meta line. |
| A done chip becomes a new tap target at 20 px tall (28 px with the token trigger's `-m-1 p-1`) | Same hit area as the facet, or at least the editable chips' 28 px | Done sessions had no chip taps before. This is the first tap people will try there. |
| Focus opens a `role=dialog` popover, but Tab from the facet goes to the next chip, which opens another one. The "Løpsresultater" link is never next in focus order. | Build on the existing `TokenPopover` handle (Base UI, `modal="trap-focus"`, detached triggers), so Tab from the trigger enters the popup and Esc returns to the trigger | The link has to be reachable by keyboard. Reusing the one retargeting popover also makes moving from chip to chip a glide instead of close-and-reopen (§9.1 of the editor spec). |
| Hover opens the popover after 300 ms | 500 ms, the delay `TooltipProvider` uses (`design-system.md`). Close after 150 ms, as built. | The meta line sits between the title and the stanza, and a pointer crossing it at 300 ms opens popovers nobody asked for. |
| A done chip opens the popover on hover, and a planned chip, which looks the same, opens a tooltip | Keep it, but the tooltip's sentence must be the popover's second line, word for word (as built) | Hover means two things on the same-looking chip. Same words keep it from feeling like two features. |
| Motion: `scale(.96)`+opacity, 200/150, origin-aware; tooltip `.97` 150/100; reduced motion drops the scale; chip `:active` `.97` | Keep | Matches `motion-popup`/`motion-tooltip` exactly. |

Needs a real phone: a tap on the facet while the page is scrolling (does it open by mistake?), whether the fixed popover follows its anchor on iOS rubber-band scroll, and sticky focus rings after a tap.

## 3. Worst case (break-ui, report only)

| # | Severity | Field | Worst-case value | What happens | Fix |
|---|---|---|---|---|---|
| 1 | Fragile | Planned TSS / target on the MCP | A Planned TSS read from a Polar result | `plannedReading` binds only the Workout's set (`app/actions/session-summary.server.ts:145`), so a Polar-derived Planned TSS would reach `model` without the Polar opt-in | Union in the source result's Origin Platform (decision C) |
| 2 | Ugly | facet hit area | any | 18 px tap target | `after:` hit area (craft row 1) |
| 3 | Fragile | popover height | editor + provenance + 51-character device at 320 px | Flips above and scrolls internally, as fixed in the prototype. Not checked at 200 % zoom | Base UI collision avoidance plus `max-height: var(--available-height)` and `overflow-y: auto` |
| 4 | Ugly (prototype only) | harness | 320 px | The Demo/Worst toggle overlaps the open popover | Prototype chrome, not product |

Held up: a 51-character Garmin device and "Polar Grit X2 Pro Titan" wrap under the watch icon and are never cut. `95–105 % maratonfart ≈ 6:01–6:39 /km` wraps whole onto its own header line at 320 px. "29. feb 2024" gets its year. Ties and same-day typed/measured pick as decided. No results shows a dashed chip and bare names, with no `≈` and nothing to open. Dark mode reads. The breaks on "device-sourced" fall at its own hyphen. There is no overflow and no console error at 320, 390 or 1440 px.

## 4. Fit

It applies the glossary's rule for **Target Resolution**: the name is primary and the number is the facet. The question "where does 4:10 come from" is answered by touching 4:10. It adds no new mark to the Score, so the stanza keeps its density. It fits the next ticket well. The threshold rung and the "what would fix it" line can use the same popover body on a dashed (unresolved) chip, so that becomes one pattern rather than a second one. Two things to watch. First, the header meta line gets its first interactive element: build the facet as one component (a provenance facet) so later `≈` figures follow it. Second, the planned chip's editor now carries a provenance footer, and that footer must stay last and short as the editor grows.

## 5. Build cost

As given: not rated, one variant. The code it touches is the designer's list plus `app/actions/session-summary.server.ts` (decision C).

## Decisions the build must take

- **A. Hit area on the facet and done chips.** Use an `after:` hit area to ~44 px. *dev, two-way.*
- **B. One popover.** The provenance is a payload on the existing `TokenPopover` handle (trap-focus, retargeting) for the facet, done chips and the editor footer, with a 500 ms hover delay. *dev, two-way.*
- **C. A Planned TSS (and any resolved target sent to `model`) read from a Garmin or Polar result binds to that result's Origin Platform.** ADR 0098 §2 says a derived value binds to the imports it read. So Polar closes `model` without the athlete's opt-in, and Garmin carries its attribution. *dev, one-way. Locks what the MCP sends for Planned TSS. Architecture to confirm alongside decision 3.*
- I endorse the designer's decisions 3, 4, 5, 6 and 9 as recommended. 1, 2 and 8 are po calls, and I recommend them as written.

## Designer's pick

I opened it after writing the above. The pick is Fasett, the same as mine, so there is no disagreement on the variant. One tension, in one line: the designer opens the popover on hover after 300 ms (Base UI's default) and builds a new Popover, while I would use 500 ms, the `TooltipProvider` delay, on the existing `TokenPopover` handle so Tab reaches the link and the chips retarget. The designer's other build rules (one presenter in labels, the point pace always 1.06, the credit never only in the popover) are ones I endorse.
