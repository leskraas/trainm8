# A generated season fits the Weekly Capacity by lowering its anchor, and the Week Target is the number that wins

Status: Accepted (agent decision on delegated issues #473 and #472, 2026-10-24).
§1–§2 are built, and the preview states what §2 did; §3–§4 are decided and **not
yet built**. The owner should confirm each item under "Open for the owner".

**Amends**
[ADR 0053](./0053-season-generation-is-deterministic-behind-the-seam.md) §6 by
saying which of the two numbers wins. **Keeps** ADR 0050 (unset capacity is
unavailable, never passing) and ADR 0102 §4 (the first run's capacity is the
plan's heaviest week, and its hours are never a ceiling).

## Context

`weeklyCapacityHours` was read, carried on `SeasonRequest` and compared with
nothing (#473). The authored season already had an hours check
(`seasonHoursWarnings`, `hoursFitWarnings`), priced from the **Week Target**
through the **Volume Conversion**. The generator had the same targets and no
check.

PR #529 capped the first run's draft at the hours given. #584 (ADR 0102 §4)
replaced that: the hours are week 1, and the stored **Weekly Capacity** is the
plan's heaviest week. So the first run cannot breach capacity by construction.
The test
`the days become the athlete’s availability, and the plan’s heaviest week its weekly capacity`
in `app/utils/first-run/plan.server.test.ts` proves it. That half of #473 was
already done.

## Decision

### 1. Generation reads the Week Target in hours, against the capacity

`fitToCapacity` (`app/utils/plan-generation/capacity.ts`) prices every week with
`weeklyEnduranceHours` and `hoursFitWarnings`, the plan page's own functions.
The preview and the stored plan therefore cannot disagree. The server reads the
conversion inputs with `readConversionContexts` from the season's start week and
hands them to the pure generator as data.

### 2. Where a week outruns it, the anchor is lowered

Every endurance track's **Season Anchor** is multiplied by one common factor.
Each result is rounded down to its currency's precision. The largest factor for
which no week outruns the capacity wins. The shape's climb, ramp and boundary
steps are kept; week 1 starts lower. Because every week falls by the same
factor, the ramp guard reads the same rises as before. The payload carries the
lowered tracks and a `capacity` reading:
`unset | unpriced | fits | lowered | over`. Approval writes the lowered anchors
it was shown, since approval regenerates.

- `unset`: no capacity is authored. The check does not run, which is not a pass.
- `unpriced`: some week has no hours (no anchor, no threshold pace, no ride
  history). Nothing is lowered.
- `over`: the **Quality Session Mix**'s own hours outrun the capacity, so no
  anchor fits. The anchor stays as given and the spans are carried. Guards warn
  and never block (ADR 0042 §9).

### 3. The Week Target wins; Planned Volume is shown beside it (decided, not built)

A placed corpus row is never rescaled (ADR 0053 §6). The **Week Target** is the
plan's number: the ramp guard, the hours check, the autopilot and
`week-volumes.ts` all read it. A generated week shows its **Planned Volume**
beside the target. Planned Volume is read the GLOSSARY's way (`fixedDayVolume`
over the placed stock workouts, unmeasured sessions counted apart as
`+N uten km`). The week carries `≠` when the two drift more than
`DRIFT_TOLERANCE` (10 %), the same rule I dag uses. The athlete sees a mismatch
exactly when the living plan would show one.

### 4. Placed hours over capacity are stated, not fixed (decided, not built)

Where the prescribed hours of a week's placed sessions are known and already
exceed the capacity, the preview says so ("minst X t"). It never drops or
shortens a cited session to make the week fit.

## Considered options

- **Clip only the weeks over capacity.** Rejected: weeks are derived, not stored
  (ADR 0040). Clipping would need a Week Volume Override on every peak week and
  would flatten the shape the athlete picked.
- **Warn only, as the plan page does.** Rejected for generation: the preview is
  a proposal the app makes. A proposal the app knows does not fit the athlete's
  life is not one to offer as the default.
- **Rescale or swap placed sessions to the target.** Rejected by ADR 0053 §6.

## Open for the owner

- **Proposed, owner to confirm:** lowering the anchor, rather than warning, even
  where the athlete typed the anchor themselves.
- **Proposed, owner to confirm:** one common factor across tracks, rather than
  lowering the largest track first.
- **Proposed, owner to confirm:** §3 and §4, which are not yet built.

## Deferred hardening

- None of this change opens a security hole. The capacity, the conversion inputs
  and the anchors are read server-side from the signed-in athlete's own rows.
  Approval regenerates, so it never trusts a posted payload, and the answers in
  the URL are the same ones the page already accepted. No new input is trusted.

## Consequences

- `SeasonRequest` gains `conversionContexts`. `GeneratedSeason` gains
  `capacity`, and its `tracks` are the priced (possibly lowered) ones.
- The preview states the reading under the season's heading (`CapacityNotice` in
  `plan.generate.$eventId.tsx`). `lowered` is one quiet line with the heaviest
  week before and after (`fromPeakHours`, `peakHours`); `over` says where, by
  how much, and that the **Quality Session Mix** alone outruns the capacity.
  `fits`, `unset` and `unpriced` add nothing. Hours read through a pace carry
  `≈` (`estimated`), rounded once at the surface. §3–§4 remain the open work on
  #472 and #473.
