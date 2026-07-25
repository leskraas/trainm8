# Manual planning — prototype X (#366, clean-room second pass)

**Question.** How should MANUAL training planning look and feel — how does a
self-coaching athlete see and edit the season → phase → week structure?

**Shape.** One throwaway route, `/training/plan/manual-prototype-x`, four
variants behind `?variant=a|b|c|d`, each written as if a different company's
design team owned the feature. All four edit the _same_ in-memory Plan Outline
(`__manual-prototype-x-state.ts`), so switching mid-edit shows one plan through
four design languages. Nothing persists; no mutation is wired.

| Variant | Language                                    | Primary object                                                                                                                                                                                                                          |
| ------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `a`     | Apple (Fitness+/Health)                     | The plan as a book of pages: closed blocks are spines, one open page at a time, weeks as a segmented ring                                                                                                                               |
| `b`     | Google (Material 3 / Fit)                   | Planning as a conversation: an intent line, "suggested for you" chips that apply themselves, bottom-sheet block editor                                                                                                                  |
| `c`     | Strava                                      | The plan as a route to race day (course profile, `You` marker, finish flag) — or a closed circuit you lap forever                                                                                                                       |
| `d`     | TrainingPeaks / intervals.icu               | Chart first, then a directly-editable week grid with ramp guards and projected CTL                                                                                                                                                      |
| `e`     | Apple shell × TrainingPeaks instrumentation | Added after the owner said "Apple's design, TrainingPeaks' features". Apple's posture and typography; the pro tool's chart, inspect panel, editable targets, ramp guard and projected CTL. Blocks / Weeks tabs; every unit always shown |

`e` was then revised again from review:

- **Templates at three levels, picked by shape.** Season, Block and **Week
  Pattern** — the third level the hard constraints already decided (a reusable
  week stamped across a phase, producing standalone sessions with no link back).
  Every row in the picker is an illustration of what it produces: a season reads
  as its profile, a block as its rhythm, a week as seven days of intensity.
- **The season chart is layered**, not a single fixed picture: volume, fitness,
  rhythm, ramp and focus stack on one time axis and toggle independently. A
  **Form** layer is offered and honestly declines — a flat weekly-average replay
  makes ATL and TSB meaningless, so it explains itself rather than drawing a
  curve the plan can't support.
- **Tabs only where they're navigation.** Blocks and Weeks are genuinely
  different content with different jobs, so they keep the tab — Blocks shapes
  the season, Weeks audits it, and neither duplicates the other. The km/h/TSS
  control was tab-shaped but was never navigation: it changed the _language_ of
  the same content, and stacking two tab-shaped controls is what made the page
  confusing. It's gone. Conversions are multiplication, so every unit is simply
  always shown — the plan's currency only decides which one is big and which one
  the inputs edit. That choice now lives on the season total it describes, one
  tap away, with a live preview of the season in each unit.

`e` also carries the one genuinely new idea in the set: the ramp guard
distinguishes a spike _inside_ a block from a block that simply **opens above
where the previous one left off**. The latter is the common case, and easing the
single offending week just moves the cliff one week later — so the fix
re-anchors the whole block's opening volume and keeps its rhythm intact.

**Requirements each variant answers.** Templates at both levels (season + block,
apply-then-own); planning without a terminal race (ongoing loop, attach a race
later); block focus beyond base/build/peak with strength honestly carrying no
TSS; loading:recovery rhythm chosen _per block_ and legible in the block's
visual texture; athlete-chosen volume currency (km / hours / TSS) with one
primary and optional secondary readouts.

**Model assumptions** (prototype-grade, documented in
`__manual-prototype-x-model.ts`): ≈60 TSS per endurance hour (the Fitness
Projection assumption in `CONTEXT.md`), 10 km/h easy running for km↔hours, 5%
week-to-week progression, −30% recovery week (intervals.icu's default), a
volume-only taper.

A second honesty rule fell out of the Week Pattern work: **gym days are not
funded out of the week's target.** They carry no TSS and no distance, so a
pattern with two lifting days splits the whole km/TSS target across the
endurance days and reports gym time separately as extra clock hours. Letting gym
share the target would quietly under-deliver the week.

## Verdict

_Not yet filled in — awaiting the owner's reaction on #366._

Once a direction wins, record which parts of which variants survive, then delete
this route and every `__manual-prototype-x-*` sibling.
