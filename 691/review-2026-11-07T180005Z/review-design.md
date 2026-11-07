# Design review (codebase-design), PR #691 at 4ea4dcf

- `prescriptionVolumeOf` (week-volumes.ts) is a good seam split: the prescription half needs no session, `volumeSessionOf` delegates, Sesong's tests guard it. Deep enough: one call, four readings behind it.
- `planned-volume.ts` is pure and narrow (`previewWeekVolumes`), the DB reads stay in `readPreviewWeekVolumes` in generate.server.ts; one `readStockWorkouts` and one `placedAt` shared with `writeSessions`, so preview and approval cannot read different rows or days. Holds ADR 0112 §1-3.
- `ShapeWorkout` narrows `deriveSessionProfile`'s input structurally; callers unchanged.
- Minor, not a finding: the placed-session -> `VolumeSession` mapping is inline in `readPreviewWeekVolumes`; it has one caller, so a named helper would be shallow.
- The rule "which existing sessions the planned figure covers" lives in `buildWeekVolumes`, and `previewWeekVolumes` restates a coarser version of it (`theirs.length`). See Spec S1: the count should follow the week model's own rule.

No further design finding.
