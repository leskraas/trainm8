# 632 — Structure Adherence reads the Plan Mapping

Analysis for [#632](https://github.com/leskraas/trainm8/issues/632) on map #600.
Code references are to `main` at `ed64839` (2026-10-20). Wayfinder references
are to `origin/research/structured-workouts`. It builds on #602 (the reader),
#608 (Plan Mapping), #609 (detection v3) and #624 (athlete layer, Skipped Step).

## Answer

- **Structure Adherence reads the Plan Mapping, not the archetype.** Today it
  compares the plan-blind detection's archetype with the plan's
  (`structure-adherence.ts:238-277`). That says "kan ikke leses sikkert" in two
  cases where the mapping shows every rep:
  - below `high` there is no detection at all, because v3 ships lower grades
    empty (609 §6.1), so `resolveStructureAdherence` returns `not-verifiable` for
    any repeated plan (`sessions.$sessionId.tsx:1600-1604`);
  - an engine merge (15× → 5×, 609 :203,207) trips the deficit rule at `:253`,
    while the device step laps map 15/15.
  The mapping is pure and ≤10 ms (608 §4), so there is no cost. 608 §6's
  sentence "feeds no … Structure Adherence" becomes: *Structure Adherence may
  summarise the mapping; it never edits it.* The mapping still moves no edge, so
  it stays in the category ADR 0034 allows.
- **Still one whole-session verdict: display-derived, unstored, never load.**
  The gate is unchanged (`adoptedAt != null || source ∈ {authored, generated}`,
  `sessions.$sessionId.tsx:1585-1591`). Per-step counts ("4 av 5 drag",
  "+5 drag utover planen") live in the mapping rows (608 §7); Structure Adherence
  does not repeat them.
- **Adherence Bands and load take nothing from it.** Verified: the band is
  actual TSS ÷ Planned TSS only (`load/adherence.ts:39-85`), and every load-side
  consumer reads only TSS adherence: coach (`coach.ts:70-110`), nudges
  (`session-nudge.ts:176,203`), Week Replan / autopilot (`week-replan.ts:235-319`),
  next-round proposals (`propose-next-round.ts:85-108`). The only caller of
  `structureAdherence` is the session route (`sessions.$sessionId.tsx:1599`).
  A Skipped Step leaves Planned TSS unchanged and actual TSS comes from the
  import (624 :182-183). No Load Recompute Notice.

## The rule

Read the mapping of the winning layer (athlete → device step laps → engine at
`high` → whole session; 608 §2). Count planned **work** steps only (Step Role,
#602), with series multiplied in (StepKey covers series; see #634).

| Mapping | Verdict | UI (`WORKOUT_DETAIL_LABELS.structure`) |
| --- | --- | --- |
| `paired`, every work step `executed`/`merged`, ≤1 `not-found`, no `missed` | `as-prescribed` | "Som planlagt" |
| `paired`, >1 unplanned work rep (`REP_SURPLUS_TOLERANCE`), or work intensity clearly above the resolved target (`INTENSITY_SURPLUS_MARGIN`) | `diverged` | "Avvek" (neutral tone, #634) |
| `paired`, ≥1 work step `missed` (device-workout or athlete evidence), no surplus | **`changed`** (new, owner Q1) | "Gjort med endringer — se dragene" |
| `unknown`, or >1 work step `not-found` | `not-verifiable` | muted "kan ikke leses sikkert" |
| `unpaired` | none | the Profil plus the "Planlagt" row (608 Q3a) |
| self-paced or effort-anchored plan | none | — (ADR 0034 Revisit) |

Order of tests: no verdict → `diverged` → `changed` → `not-verifiable` →
`as-prescribed`. `diverged` wins over `changed` because the surplus is the
stronger statement; the rows show both.

- **`changed` is not a grade.** No colour, no count, no "N of M". It exists
  because `missed` is now evidence-backed (the watch's program, or the athlete's
  own Skipped Step), so `not-verifiable` would be untrue, and `as-prescribed`
  would be untrue too. It points at the rows, where the counts already are. It
  never appears on a `not-found`: a layer that cannot see a rep is not evidence
  that it was skipped (608 :20-23).
- **Intensity is judged on resolved targets.** The reader resolves each step
  through `thresholds` (#602); the executed step's figure on the same channel is
  compared with the top of the resolved target. Today's code compares raw
  authored intensities (`parseAuthoredIntensity`, `sessions.$sessionId.tsx:1544`),
  which contradicts GLOSSARY :3160-3163. Different channels skip the check, as
  today (test `:101`).
- **The off-by-one tolerance stays.** One `not-found` work step is tolerated for
  `as-prescribed`, matching `REP_DEFICIT_TOLERANCE` today, so no session reads
  worse than before.

## Taken on the evidence (can be reopened)

- **The athlete layer counts as evidence, with provenance.** A pin forces a
  match, so an athlete can manufacture agreement. Refusing a verdict on
  athlete-layer sessions would punish the correction path 624 made the only one.
  So the verdict holds and the row carries "Justert av deg", the same provenance
  swap 624 uses for figures.
- **The engine layer counts only at `high`.** That is the only grade v3 ships
  (609 §6.1); 608 :191-193 notes an engine false claim can still pair (1/140).
  `diverged` from the engine rests on 609's 0/35 false claims at `high`, which
  is provisional (Wilson lower bound 70 %); the ADR amendment says so.
- **Self-paced and effort-anchored plans get no verdict.** ADR 0034 Revisit
  already says verification is invalid for them; the code has no such exclusion
  today (`rpe` is just another scale, `structure-adherence.ts:98-99`).

## What changes

- `structureAdherence(mapping, reading)` replaces `structureAdherence(detected,
  planned)`. `workProfile`, `plannedStructureFromWorkout` and `ZONE_ORDINALS`
  go (602 :175 already retired the ladder).
- `detection.structureJson` stays as the plan-blind summary for materialization
  and Detection Confidence, but Structure Adherence no longer reads it
  (amends 603 §8 :193 and 608 §2 :99-100).
- Tests to rewrite: the 13 cases in `structure-adherence.test.ts:67-263` become
  mapping fixtures (same expectations, plus `changed`, athlete provenance,
  series and `unpaired`); route tests `sessions.$sessionId.route.test.tsx:783-863`
  gain a `changed` case and a "Justert av deg" case.
- Must ship with or before the athlete layer on planned sessions (624 Fog 6).

## Amendments

- **ADR 0034 §2:** "One whole-session verdict, read from the Plan Mapping. The
  per-step mapping is shown as executed numbers with no pass/fail. Four states:
  `as-prescribed`, `diverged`, `changed` (a step missed on the watch's or the
  athlete's evidence) and `not-verifiable`. A step not found is never charged.
  Never load." The rejected alternatives ("6 of 10 completed") stay rejected.
- **ADR 0020 :74:** "may map intervals to steps; never a per-step verdict."
- **608 §6:** as above.
- **GLOSSARY, Structure Adherence:** "A coarse, whole-session reading of a
  matched planned session's **Plan Mapping**: *as prescribed*, *diverged* (more
  or harder than planned), *done with changes* (a planned step was missed on the
  watch's or the athlete's word) or *not verifiable*. Whole-session only; never
  feeds Planned TSS, Training Load or the Adherence Band. *Avoid*: per-step
  verdict, interval grade, compliance score, 'X of Y intervals'." Also fix
  GLOSSARY :3314-3315, which says Structure Adherence never exists on a
  `detected` session; it does on an adopted one (ADR 0033 #460).

## Found on the way

- [#634](https://github.com/leskraas/trainm8/issues/634): series ignored, so a
  correct 3 × 13 reads "Avvek"; `diverged` uses the under-warning colour.
