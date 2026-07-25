# Manual planning — prototype X (#366, clean-room second pass)

**Question.** How should MANUAL training planning look and feel — how does a
self-coaching athlete see and edit the season → phase → week structure?

**Shape.** One throwaway route, `/training/plan/manual-prototype-x`, six
variants behind `?variant=a|b|c|d|e|f`. `a`–`d` were the original clean-room
pass, each written as if a different company's design team owned the feature;
`e` and `f` came out of review. All six edit the _same_ in-memory Plan Outline
(`__manual-prototype-x-state.ts`), so switching mid-edit shows one plan through
every design language. Nothing persists; no mutation is wired.

| Variant | Language                                    | Primary object                                                                                                                                                                                                                          |
| ------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `a`     | Apple (Fitness+/Health)                     | The plan as a book of pages: closed blocks are spines, one open page at a time, weeks as a segmented ring                                                                                                                               |
| `b`     | Google (Material 3 / Fit)                   | Planning as a conversation: an intent line, "suggested for you" chips that apply themselves, bottom-sheet block editor                                                                                                                  |
| `c`     | Strava                                      | The plan as a route to race day (course profile, `You` marker, finish flag) — or a closed circuit you lap forever                                                                                                                       |
| `d`     | TrainingPeaks / intervals.icu               | Chart first, then a directly-editable week grid with ramp guards and projected CTL                                                                                                                                                      |
| `e`     | Apple shell × TrainingPeaks instrumentation | Added after the owner said "Apple's design, TrainingPeaks' features". Apple's posture and typography; the pro tool's chart, inspect panel, editable targets, ramp guard and projected CTL. Blocks / Weeks tabs; every unit always shown |
| `f`     | Per-block currency                          | Variant E's shell with one model change: the volume currency belongs to the **block**, not the plan. Built to expose what that costs                                                                                                    |

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

## Variant F — per-block currency

The question F exists to answer: does letting each block declare its own unit
remove the "—" problem, and what does it cost?

**What it removes.** A strength block no longer prints a row of "—": its unit is
locked to hours with the reason stated, because a strength block genuinely has
no distance and no TSS. Endurance and threshold blocks default to km, a VO2max
block to TSS, and the week grid's block headers read "speaks km" / "speaks TSS"
/ "speaks h".

**What it costs.** Once blocks disagree, three things have to be reconciled, and
every one of them lands on **hours** — the only unit every block can express:

1. the **season total**, so the headline number is hours, with km and TSS
   demoted to "across the load-bearing weeks only";
2. the **chart's y axis**, or bars from different blocks stop being comparable;
3. the **week-over-week ramp**, which is meaningless across mixed units — so the
   guard says "+50% in hours" and explains why.

Every target in the week grid must also carry its unit, because the column is no
longer homogeneous. That is a real density cost paid on every row.

**Verdict to reach with the owner:** F is more honest per block and less honest
per season — the number an athlete would quote ("830 km") stops being the
headline. E keeps one legible headline and pays for it with "—" cells in
strength blocks. Worth deciding whether the "—" was actually a problem, or just
looked like one.

## What this prototype sent back to the map

Four decisions surfaced here were too sharp to leave in the prototype, so they
graduated to child tickets of
[Map: Manual training planning](https://github.com/leskraas/trainm8/issues/362):

- [Decide whether volume currency is a plan property or a block property](https://github.com/leskraas/trainm8/issues/372)
  — variant `e` vs `f`.
- [Decide whether a block that carries no load belongs in the Plan Outline](https://github.com/leskraas/trainm8/issues/373)
  — the strength block that empties Fitness Projection.
- [Decide how a block's opening volume relates to the block before it](https://github.com/leskraas/trainm8/issues/374)
  — the +50% boundary cliff, and why smoothing one week only moves it.
- [Decide how many levels a reusable planning template covers](https://github.com/leskraas/trainm8/issues/375)
  — season / block / week pattern.

The first three also block
[the stored shape of the extended Plan Outline](https://github.com/leskraas/trainm8/issues/367).

## Verdict

**Variant `f` won.** #366 is closed with that as the direction; the full
resolution is the comment on that issue.

`f` is `e`'s shell with the volume currency moved onto the block, so what
survives is: Apple's posture over TrainingPeaks' instrumentation, the layered
season chart as the primary object, Blocks/Weeks tabs (and no tab for anything
that isn't navigation), templates at three levels picked by illustration, and
per-block currency with the season, the chart axis and the ramp all reconciled
in hours.

Rejected: `a` alone (unreadable in bulk), `d` alone (dense everywhere), `b`'s
suggestion chips (a later idea, not V1 chrome), `c` entirely — **except its
circuit** for the no-race case, which is the best answer in the set to "what
does an endless plan look like" and should be reconsidered when ongoing plans
are built. That is the one thing worth rescuing before this route is deleted.

Two costs were accepted with eyes open: the season headline is hours rather than
the distance a runner would quote, and a no-load block visibly empties Fitness
Projection. Both are now owned by tickets, not by this prototype.

**This route is finished.** It exists only as evidence for #372–#375 while those
are open. Delete it and every `__manual-prototype-x-*` sibling once the surface
is implemented for real — do not extend it further.
