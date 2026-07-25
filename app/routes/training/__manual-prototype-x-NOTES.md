# Manual planning — prototype X (#366, clean-room second pass)

**Question.** How should MANUAL training planning look and feel — how does a
self-coaching athlete see and edit the season → phase → week structure?

**Shape.** One throwaway route, `/training/plan/manual-prototype-x`, four
variants behind `?variant=a|b|c|d`, each written as if a different company's
design team owned the feature. All four edit the _same_ in-memory Plan Outline
(`__manual-prototype-x-state.ts`), so switching mid-edit shows one plan through
four design languages. Nothing persists; no mutation is wired.

| Variant | Language                                    | Primary object                                                                                                                                                                                                                                       |
| ------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `a`     | Apple (Fitness+/Health)                     | The plan as a book of pages: closed blocks are spines, one open page at a time, weeks as a segmented ring                                                                                                                                            |
| `b`     | Google (Material 3 / Fit)                   | Planning as a conversation: an intent line, "suggested for you" chips that apply themselves, bottom-sheet block editor                                                                                                                               |
| `c`     | Strava                                      | The plan as a route to race day (course profile, `You` marker, finish flag) — or a closed circuit you lap forever                                                                                                                                    |
| `d`     | TrainingPeaks / intervals.icu               | Chart first, then a directly-editable week grid with ramp guards and projected CTL                                                                                                                                                                   |
| `e`     | Apple shell × TrainingPeaks instrumentation | Added after the owner said "Apple's design, TrainingPeaks' features". Apple's posture and typography; the pro tool's chart, inspect panel, editable targets, ramp guard and projected CTL. Density is a **Blocks / Weeks** mode, not a permanent tax |

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

## Verdict

_Not yet filled in — awaiting the owner's reaction on #366._

Once a direction wins, record which parts of which variants survive, then delete
this route and every `__manual-prototype-x-*` sibling.
