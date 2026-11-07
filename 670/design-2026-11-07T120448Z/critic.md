# Critic: #670 design, run 1 (unattended, one variant)

**Recommendation: Målt.** It holds 7 of 12 criteria and partly holds the other 5. None misses. Every gap is a missing state or a rule the build adds inside the same design, so nothing calls for a different direction.

| Variant | Criteria held | Worst case | Build cost |
|---|---|---|---|
| Målt | 7 holds, 5 partly, 0 misses | 2 Broken (Annen "10" is saved as a non-anchor; the racePace line is wrong when a newer result exists), 2 Ugly, 3 Fragile. No overflow at 320/390/1440 px, at 200 % zoom, or in dark mode | Not rated (one variant). Touches events.$eventId.tsx, __event-form.tsx, resultater.tsx, source-attribution.ts, labels/events.ts, labels/meg.ts |

Method: I opened the prototype in Chromium (Playwright 1.56 from the repo) and checked all 11 Event-page states × demo/worst × 320/390/1440 px, plus the form and Løpsresultater, for horizontal overflow (none) and console errors (none). I drove the Annen and mismatch flows, ran reduced-motion and 200 % zoom, and read the computed colours. Probe script and screenshots: `critic-probe/` (`probe.mjs`, `annen-10.png`, `mismatch-open.png`, `worst-form-320.png`, `worst-mismatch-fix-320.png`, `notrun-320.png`, `candidates-320.png`, `worst-saved-zoom200.png`). I read the designer's pick only after writing everything above the "Designer's pick" section.

## 1. Criteria

| # | Criterion (short) | Score | What I saw |
|---|---|---|---|
| 1 | Event Distance on create/edit; none for a fitness goal; page shows it or nothing | **partly** | Holds in the form: pills after Idrett, only for Løp/Testløp with Idrett exactly Løping, hidden for Datomål. The Event page puts the distance first in the meta line and leaves it out when there is none. Gap: once a done Event has a result, nothing can change its distance. The Edit page is planned-only (`events.$eventId.tsx:345`), and the result state has no "Endre distansen". |
| 2 | Writer: ±5 %, exact metres, elapsed time, day, source, verified | holds (no screen) | `verdict()` in the prototype applies ±5 % against the Event Distance. Nothing drawn contradicts the rule. The build must take elapsed time, not moving time. |
| 3 | Time + pace + "the watch measured it"; Garmin/Polar credit wherever shown | holds | Large time, then pace · distance, then "Målt av klokka · Garmin Forerunner 265" next to the figure, on the Event page and in Løpsresultater. Polar shows its device. An upload owes no credit. A 51-character device name wraps under the icon and is never cut. Build note in §2: pace targets resolved from a Garmin or Polar Event result are derived values (ADR 0098 §3). |
| 4 | Load Confidence plays no part | holds | No surface mentions it. Nothing in the result depends on it. |
| 5 | racePace resolves against it when newest; Planned TSS recompute | **partly** | The line "Øktene med 10 km-fart regner farten fra denne tida" has three states: in use, same-day typed wins, non-anchor. It has no state for when **a newer result at the same anchor exists**, so on any older race it claims something false. Planned TSS has no surface, as expected. |
| 6 | Unlink / cancel / delete / unlink Recording removes it; changing distance, kind or disciplines rewrites it; typed results untouched | **partly** | Removal holds: "Fjern koblingen" is in every linked state. "Changing the Event Distance rewrites it" has no surface on a done Event that already has a result (same gap as 1). |
| 7 | Recording arriving later, and a distance set on a done Event, each write then | holds | "Venter på klokka" covers a missing Recording. "Hvor langt var løpet?" with pills, then Lagre distansen, writes the result, which lands with the `starting:` rise. |
| 8 | Ineligible Events and Recordings write none; no distance or ±5 % miss says why | **partly** | Mismatch ("Klokka målte 11,4 km, men løpet er 10 km"), no Recording distance, not a run, and no Recording are each said in the athlete's terms. Two gaps: "en sykkeltur" is hard-coded and must come from the Recording's discipline. The section for an **ineligible Event** (more than one discipline, Datomål) is not drawn, and it must never show the distance ask. |
| 9 | Non-anchor distance stored in exact metres; resolves no racePace; km in Løpsresultater | **partly** | 7,5 km and 100 km display correctly, and the line says no session uses them. **Broken:** Annen "10" saves as a non-anchor 10 km and the page says "10 km er ingen standarddistanse" (`critic-probe/annen-10.png`). An athlete who types the distance instead of tapping the pill gets no racePace. |
| 10 | Løpsresultater: Event name links to the Event, measured label, no delete | holds | Event rows carry the credit and the Event name as an inline link with a chevron and an `::after` hit area. They have no Slett. A 120-character name wraps without overlapping. |
| 11 | Same-anchor, same-day typed vs Event: typed wins; marked | holds | "I bruk" sits on the typed row and the Event row says "Ikke i bruk: tida du skrev inn samme dag brukes." The colour is wrong (see worst case 5). |
| 12 | Export includes each Event's result with Event + Recording | holds (no screen) | Export work. Nothing drawn contradicts it. |

## 2. What the build must fix (decisions)

1. **Annen snaps to a Race Anchor.** A km value that is an anchor's distance (1,5, 3, 5, 10, 21,1/21,0975, 42,2/42,195) is stored as that anchor, in the form and in the result section. Rejected: storing it as typed, which silently loses racePace. Two-way door, `po`.
2. **A done Event with a result can change its distance.** Put a quiet "Endre distansen" (ghost button, under the result) that opens the same pill row. Otherwise criteria 1 and 6 have no surface after the race. Two-way door, `po`.
3. **The racePace line gets a fourth state:** "Et nyere resultat på 10 km brukes" (linking to Løpsresultater) when this result is not the newest at its anchor. Two-way door, `po`.
4. **Ineligible Events show no distance ask.** The result section asks "Hvor langt var løpet?" only for a run-only Løp/Testløp. The not-run reason names the Recording's discipline from labels, not "sykkeltur". Two-way door, `dev`.
5. **On a mismatch, also point to the typed route.** Under "Klokka målte 11,4 km, men løpet er 10 km", add: "Var løypa 10 km? Skriv tida inn på Løpsresultater." Today the only fix on offer is relabelling the race 11,4 km, which teaches athletes to give up racePace to get a time saved. Two-way door, `po`.
6. **Derived credit on racePace targets.** A pace target resolved from a Garmin- or Polar-origin Event result is a derived value. It should carry `derivedAttributionLines` (ADR 0098 §3), which `app/utils/source-attribution.ts:75` already exposes. This reads ADR 0098's "plan-side values have an empty binding set" as not covering targets resolved from a measured result. Recommend the architecture part confirms it. One-way door (it applies an ADR rule to a new class of value), `dev`.

I agree with the designer's one-way door. A done Event's distance is set in its result section, not on the planned-only Edit page. Decision 2 extends that to the result state.

## 3. Craft (emil-design-eng)

| Before | After | Why |
|---|---|---|
| "Ikke i bruk: …" in `--status-under` (amber) | `text-muted-foreground` | `status-under` means under target. Here the fact is neutral, and amber at 12 px caption measures about 4.5:1 on the background, right at the AA edge. |
| Mismatch → "Endre distansen" preselects 10 km with **Lagre distansen** enabled (`critic-probe/mismatch-open.png`) | Save disabled until the choice differs from the stored distance | Saving the same distance does nothing visible. That reads as broken. |
| The mismatch fix block swaps in instantly while Annen opens with `motion-collapse` | Open the fix block with `motion-collapse` too (200/150) | Three rows of pills arriving at once push Se økta/Fjern koblingen down 250 px in one jump. |
| Well in the mismatch state holds a reason, a label, 7 pills, a primary button and 2 more buttons | Keep "Se økta · Fjern koblingen" but make them visually quieter (ghost/link) while the fix is open | Five actions in one well. The primary must be the only filled thing. |

What feels right: the display-step time with pace beside it at baseline, the credit tight under the figure, tabular figures everywhere, 44 px pills, and the wording of each reason, which is the issue's own.

## 4. Motion (review-animations)

| Before | After | Why |
|---|---|---|
| `.lands` `@starting-style` 4px rise + fade, 200 ms `--ease-out` | Keep. In React, **key** the result well (e.g. `key={resultId}`) and apply `lands` only to the render just after the write (action data / navigation state) | Without a key, React can reuse the no-result well's `<div>` and `@starting-style` never fires. Without gating, it replays on every visit and revalidation. |
| `.stack-6 > .collapse` transitions `margin-top` (prototype) | Use the app's `Collapsible`/`motion-collapse`, with spacing inside the panel | `margin-top` is a layout property outside the one sanctioned exception. |
| Reduced motion: a **closing** collapse still animates `grid-template-rows, margin-top` (probe: computed `transition-property`) | Reduced motion keeps opacity only, both ways | Specificity bug in the prototype (`.stack-6 > .collapse` beats the reduced-motion `.collapse`). The app's utility must not copy it. |
| Pills and buttons `scale(0.97)` 160 ms `--ease-out`, hover gated, disabled under reduced motion | Keep | Within bounds. |
| Result removed on unlink: no exit animation | Keep | A system response should snap. |

**Verdict: Approve.** No feel-breaking regressions: no ease-in, no scale(0), nothing over 300 ms, no motion on high-frequency or keyboard actions. The two fixes (keying and gating `.lands`, the reduced-motion close) belong to the build, not the design.

## 5. Worst case (break-ui, report only)

| # | Severity | Field | Worst-case value | What happens | Fix |
|---|---|---|---|---|---|
| 1 | Broken | Annen km | `10` | Saved as a non-anchor. "10 km er ingen standarddistanse", so racePace never resolves | Snap to the anchor (decision 1) |
| 2 | Broken | racePace line | Event result older than another 10 km result | Line says sessions use this time, which is false | Fourth state (decision 3) |
| 3 | Fragile | Event Distance on a done Event with a result | wrong distance chosen | No surface to change it | "Endre distansen" in the result state (decision 2) |
| 4 | Ugly | Lagre distansen | unchanged selection | Enabled; saving is a no-op | Disable until changed |
| 5 | Ugly | "Ikke i bruk" | any shadowed row | Amber status token, about 4.5:1 at 12 px | Muted foreground |
| 6 | Fragile | not-run reason | swim or strength Recording | "sykkeltur" is hard-coded | Discipline label |
| 7 | Fragile | Annen km | `1000` | Accepted. The form has no stated upper bound | Set one bound in the zod schema and the input (e.g. 1–500 km) |

Held up: a 120-character Event name and a long place wrap in full at 320 px. A 51-character Garmin device wraps under the icon. 6:58:41 and 13:45:10 never truncate. "I bruk" never wraps. The Løpsresultater Event link wraps without overlap. Nothing overflows at 320/390/1440, at 200 % zoom, or in dark mode. Console is clean.

## 6. Mobile-native

Passes: inputs at 16 px, `inputmode="decimal"` (the comma parses), 44 px pills and buttons, hover gated, tap highlight off, `touch-action: manipulation`, `user-select: none` on controls. **Needs a real phone:**
- Annen focuses its km field in a `setTimeout(0)` after the tap. iOS Safari may not raise the keyboard outside the gesture.
- The decimal keypad's comma in nb-NO.
- The keyboard covering the km field inside the result well.

## 7. Fit

Målt builds on what exists. It reuses the result well, ToggleGroupField pills, `recordingSource` and `typedNote`, and extends `ResultRow` rather than adding a list. The result section becomes the Event's after-race place, so the next ticket (typing or correcting the time on the Event) adds one action to the same well instead of a new surface. Two risks:
- The result section is now the only place a done Event's distance is written. Decision 2 keeps that sustainable.
- "Distanse" now labels both the Event Distance and the Mål target kind in the same form.

Glossary: add **Event Distance**, and amend **Event Result** (GLOSSARY.md:2282, 3269) now that a Performance Result derives from it.

## 8. Build cost

Not rated: one variant. Code it touches: `app/routes/training/events.$eventId.tsx`, `app/routes/training/__event-form.tsx`, `app/routes/settings/training/resultater.tsx`, `app/utils/source-attribution.ts`, `app/utils/labels/events.ts`, `app/utils/labels/meg.ts`.

## Designer's pick (opened after the recommendation)

Pick: Målt. Same as mine, so there is no disagreement. One tension, in one line: the designer reads the mismatch state as keeping the athlete off Løpsresultater. I still add the pointer there (decision 5), because when the course really was 10 km, typing the time is the only honest fix this ticket allows. The designer's own rule, that the effect line must read the resolver's actual choice, is decision 3 stated generally, and I endorse it. So are the designer's single-writer and single-credit-path rules.

## Comment text for the result

Critic: **Recommended Målt.** It holds 7 of 12 criteria and partly holds 5; none misses. The build must:
1. Snap an Annen km that equals an anchor (10, 21,1, 42,2) to that Race Anchor. Today "10" saves as a non-anchor and racePace never resolves.
2. Offer "Endre distansen" under a done Event's result. Without it, a done Event's distance can't change after the race.
3. Add a racePace-line state for when a newer result at that anchor is in use.
4. Show no distance ask on an ineligible Event, and name the Recording's real discipline.
5. On a ±5 % miss, also point to Løpsresultater for typing the time.
6. Carry ADR 0098's derived credit on racePace targets resolved from a Garmin or Polar result. One-way door; architecture to confirm.

Craft: "Ikke i bruk" goes from amber to muted; disable Lagre distansen until the choice changes. Motion: review-animations **Approve**. Key and gate the `starting:` landing; reduced motion keeps opacity only when a collapse closes. Needs a real phone: the Annen keyboard on iOS and the decimal comma. No disagreement with the designer's pick.
