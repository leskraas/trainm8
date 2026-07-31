-- Backfill one endurance Training Track segment per phase, for every endurance
-- Training Track that has none.
--
-- #401 authored Plan Outlines with tracks and anchors but no segments, because
-- nothing could author a progression yet. #403 makes the Volume Ramp, the Block
-- Boundary Step and the two cuts authorable — and they are authored *on a
-- segment*, one per phase, 1:1 (ADR 0042 §8). Without this backfill an Outline
-- created before #403 would offer no progression to author at all.
--
-- Every rate is left NULL, which is the athlete having authored nothing: an
-- unset cut means "follow the documented convention" and is deliberately
-- distinguishable from an authored number of the same size (ADR 0044 §4). So
-- this changes no athlete's derived weeks — it adds the row those rates hang
-- off, and nothing else.
--
-- Strength tracks get nothing: their segments are dated and float free of the
-- phases (ADR 0047 §6), so there is no 1:1 here to lay down.
--
-- Idempotent by the NOT EXISTS guard, so re-running adds no duplicates.
INSERT INTO "TrainingTrackSegment" ("id", "kind", "trackId", "phaseId")
SELECT
    lower(hex(randomblob(16))),
    'endurance',
    t."id",
    p."id"
FROM "TrainingTrack" t
JOIN "PlanOutlinePhase" p ON p."outlineId" = t."outlineId"
WHERE t."discipline" IN ('run', 'bike', 'swim')
  AND NOT EXISTS (
    SELECT 1 FROM "TrainingTrackSegment" s
    WHERE s."trackId" = t."id" AND s."phaseId" = p."id"
  );
