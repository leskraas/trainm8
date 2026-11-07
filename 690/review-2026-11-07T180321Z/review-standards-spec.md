# PR #690 review: Standards and Spec (bredvid-code-review, both axes inline; no subagents)

Diff: `git diff origin/main...71b12e8` (3 commits, 52 files, +3241/-318). Spec: issue #670 (AC, Design, Architecture, Decisions), ADR 0112, ADR 0098.
Standards sources: CLAUDE.md, docs/agents/*.md, docs/adr (0098, 0112, 0019, 0085), docs/design/design-system.md, prettier config (repo), smell baseline.

## Standards
- S1 (low, hard): `app/utils/load/planned-tss.server.ts:9` `type RaceAnchor  }` fails `prettier --check` (verified: `npx prettier --check` flags this file only).
- S2 (low): orphaned JSDoc. `app/actions/session-summary.server.ts:142-156`: `plannedTssBindingSet` was inserted between `plannedReading`'s doc comment and the function, so `plannedReading` lost its doc and two docs stack. Same in `app/utils/intensity-target.ts:~470`: `racePaceBindingSet` sits between `parseAuthoredIntensity`'s doc and its function.
- S3 (low, judgement: Duplicated Code): the Recording credit-input mapping `{originPlatform, deviceName, aliasOrigins}` from `activityImport` is written three times (event-result.server.ts:307-324, performance-result-writer.server.ts:180-195, origins in performance-result.server.ts:180-192). Copies an existing in-repo pattern (training.server.ts:1975, timeline/presenter.ts:1233); leave.
- S4 (low, judgement): `eventResultFrom` returns `no-recording` ("Venter på klokka") for a Recording with zero elapsed time (event-result.ts:482), a reason that is not true for that case. Rare; leave.

## Spec
- P1 (medium): Architecture asks "Add a test that drives each of these paths and asserts the reconcile". `undoImportAnswer` (import-link.server.ts:276, wrapped by the diff) is driven by no test (grep event-result.server.test.ts imports: no import-link). Fixable: add the test.
- P2 (high, see Security F1): Architecture/ADR 0112 §4: "Readers that send Planned TSS to the model pass plannedTssOrigins ... week totals, which take the union." `get_season` and `get_today` week tracks state a Planned Volume in the `tss` currency (sum of Planned TSS) bound only to `detected` (week-tracks.server.ts:66-70); plannedTssOrigins never reaches them.
- P3 (medium, decided): AC 3 / ADR 0112 §4 "a resolved target carries derivedAttributionLines" is met on the session page only; the home timeline and step popovers were deferred by the implement decision "Where the derived racePace credit shows first" (two-way door). Respect the decision; follow-up needed (no issue exists yet).
- Every other AC checked against the diff and tests: Event Distance field/snapping/clearing, ±5 %, elapsed time, day in athlete tz, source/verified, no Load Confidence, recompute only on change, remove/rewrite paths, late Recording and late distance, ineligible cases and the athlete-terms reasons, non-anchor in km, Løpsresultater row with Event link and no delete, typed wins same day with I bruk, export pins eventId/activityImportId. Met.
- No scope creep found.

Summary: Standards 4 (worst: prettier failure, low). Spec 3 (worst: P2 Planned TSS week totals unbound, high).
