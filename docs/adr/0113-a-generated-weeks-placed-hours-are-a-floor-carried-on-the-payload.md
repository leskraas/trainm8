# A generated week's Placed Hours are a floor, read once per placed session and carried on the payload

Status: Accepted (agent decision on delegated issue #473, 2026-11-07) ·
Builds [ADR 0110](./0110-a-generated-season-fits-the-weekly-capacity-by-lowering-its-anchor.md)
§4 · Keeps ADR 0053 §2 and §6 · Corrects the duration reading's Send-Off gap
(#615)

## Context

ADR 0110 §4 decided that a generated week whose placed sessions already take
more hours than the **Weekly Capacity** says so, and changes nothing. It did not
say how the hours are read. Two readings were already in the app: **Planned
Volume** in hours, which drops a whole session for one step it cannot time
(`fixedDayVolume`), and the session row's minutes, `prescribedDuration`, which
adds every step it can time and says whether it timed them all. Almost every
untimed corpus step is an open rest, so Planned Volume's rule would read most
placed run and swim sessions as nothing and hide most real breaches (the probe
in #473's spec).

## Decision

1. **Placed Hours are a floor.** A week's Placed Hours add, for every placed
   endurance session, every step the duration reading can time, through the
   athlete's own thresholds (`getDisciplineThresholds`, the map the session row
   reads), never the **Volume Conversion**'s contexts. The figure is exact only
   when every placed session was timed end to end and no slot is unfilled;
   otherwise it is a lower bound and reads `minst`. A step with no time and no
   pace adds nothing, and nothing is estimated for it (the **Unavailable
   Metric** rule). It is
   deliberately **not Planned Volume**: the two answer different questions
   (how much the week holds in its track's currency, against how long the week
   takes at least) and may differ on the same week.
2. **One reading per placed session, made by the pure generator.** The corpus
   handed to the seam carries each Stock Workout's blocks and the request
   carries the athlete's thresholds, as data (ADR 0053 §2). Each
   `GeneratedSession` carries its `prescribedDuration`, and the season carries a
   `placed` reading beside `capacity`: each week's floor, whether it is exact,
   whether a pace was read, and the breaching spans from `hoursFitWarnings`, so
   equality is decided at the precision the athlete reads. The surface words it
   and rounds once; it computes nothing. Approval regenerates, so the reading is
   recomputed and never posted back, and it is never stored.
3. **The reading runs whenever a capacity is set**, even when the Week Target
   reading is `unpriced`; with no capacity it says nothing, which is no pass
   (ADR 0050).
4. **A Send-Off rep takes its cycle time.** Under a Send-Off the set's length is
   known before it starts (**Rest Spec**). The duration reading times each rep
   of a send-off block as the larger of its work and its cycle (anchored:
   CSS plus the allowance, per 100 m of the rep, read with `≈`; absolute: the
   interval). Where an anchored cycle cannot resolve, the block is incomplete.
   Before this, `swim-C1` (placed in every swim season probed) read complete
   while leaving out its residual rest, so the floor would have stated a plain
   figure it had not earned. The fix is in the shared reading, so the session
   row, I dag and the detail view gain the same minutes.

## Considered options

- **Planned Volume's whole-session rule.** Rejected: it counts most placed
  sessions as zero and misses the breaches §4 exists to state.
- **Price the placed sessions in the route loader**, after generation, from a
  second query. Rejected: preview and approval would read the figure in two
  layers, and the pure generator's tests could not see it.
- **Treat a send-off block as untimed in the placed reading only.** Rejected: a
  second timing rule beside the shared one, and the session row would keep
  showing a total that leaves the rest out.

## Consequences

- `RetrievableEntry` gains `blocks`, `SeasonRequest` gains `thresholds`,
  `GeneratedSession` gains `prescribed`, `GeneratedSeason` gains `placed`.
- #472 shows **Planned Volume** beside the **Week Target** from the same
  per-session reading. On an hours track the two hour figures can differ by the
  untimed parts; #472 states its own figure as Planned Volume and leaves Placed
  Hours as the capacity statement.
