/*
  Issue #50 — Zone-aware Intensity Target

  Backfill: convert the legacy free-text intensity strings used by #47
  ("easy", "zone2", "threshold", "max") to the new structured JSON
  IntensityTarget format ({ kind: "zoneLabel", label: "..." }).

  The intensity column is already TEXT, so no DDL change is required —
  only a data migration.

  Mapping:
    "easy"      → Z1 (lowest effort zone)
    "zone2"     → Z2
    "threshold" → threshold (kept as a named label, resolves via recipe)
    "max"       → max      (kept as a named label, resolves via recipe)

  Any other non-null, non-JSON value is left untouched; the resolver
  will simply return unavailable for unrecognised labels.
*/

UPDATE "WorkoutStep"
SET "intensity" = '{"kind":"zoneLabel","label":"Z1"}'
WHERE "kind" = 'cardio'
  AND "intensity" = 'easy';

UPDATE "WorkoutStep"
SET "intensity" = '{"kind":"zoneLabel","label":"Z2"}'
WHERE "kind" = 'cardio'
  AND "intensity" = 'zone2';

UPDATE "WorkoutStep"
SET "intensity" = '{"kind":"zoneLabel","label":"threshold"}'
WHERE "kind" = 'cardio'
  AND "intensity" = 'threshold';

UPDATE "WorkoutStep"
SET "intensity" = '{"kind":"zoneLabel","label":"max"}'
WHERE "kind" = 'cardio'
  AND "intensity" = 'max';
