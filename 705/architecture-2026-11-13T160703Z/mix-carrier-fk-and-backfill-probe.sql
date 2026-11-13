-- Probe for #705 (architecture): the stored Mix Carrier column with ON DELETE NO ACTION, and the backfill rule, run on node:sqlite (SQLite 3.53.4).
PRAGMA foreign_keys=ON;
CREATE TABLE "User" (id TEXT PRIMARY KEY);
CREATE TABLE "PlanOutline" (id TEXT PRIMARY KEY, athleteId TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE, mixCarrierTrackId TEXT UNIQUE REFERENCES "TrainingTrack"(id) ON DELETE NO ACTION ON UPDATE CASCADE);
CREATE TABLE "TrainingTrack" (id TEXT PRIMARY KEY, outlineId TEXT NOT NULL REFERENCES "PlanOutline"(id) ON DELETE CASCADE, discipline TEXT NOT NULL, currency TEXT NOT NULL);
CREATE TABLE "SeasonAnchorSegment" (id TEXT PRIMARY KEY, trackId TEXT NOT NULL REFERENCES "TrainingTrack"(id) ON DELETE CASCADE, fromWeekKey TEXT, value REAL);
CREATE TABLE "TrainingTrackSegment" (id TEXT PRIMARY KEY, trackId TEXT NOT NULL REFERENCES "TrainingTrack"(id) ON DELETE CASCADE, phaseId TEXT);
CREATE TABLE "QualitySessionMixEntry" (id TEXT PRIMARY KEY, segmentId TEXT NOT NULL REFERENCES "TrainingTrackSegment"(id) ON DELETE CASCADE, zone INT, sessionsPerWeek INT);
INSERT INTO "User" VALUES ('u1'),('u2'),('u3');
INSERT INTO "PlanOutline"(id, athleteId) VALUES ('p1','u1'),('p2','u2'),('p3','u3');
-- p1: first run: run (mix) + bike (no mix), bike listed first
INSERT INTO "TrainingTrack" VALUES ('t1b','p1','bike','hours'),('t1r','p1','run','hours'),('t1s','p1','strength','sets');
INSERT INTO "SeasonAnchorSegment" VALUES ('a1','t1b','2026-01-05',5),('a2','t1r','2026-01-05',3);
INSERT INTO "TrainingTrackSegment" VALUES ('s1r','t1r','ph1'),('s1b','t1b','ph1');
INSERT INTO "QualitySessionMixEntry" VALUES ('m1','s1r',4,1),('m2','s1r',5,1);
-- p2: sesong both with equal mix, run larger anchor same currency
INSERT INTO "TrainingTrack" VALUES ('t2r','p2','run','km'),('t2b','p2','bike','km'),('t2o','p2','other','hours');
INSERT INTO "SeasonAnchorSegment" VALUES ('a3','t2r','2026-01-05',50),('a4','t2b','2026-01-05',100),('a5','t2b','2025-01-05',10);
INSERT INTO "TrainingTrackSegment" VALUES ('s2r','t2r','ph1'),('s2b','t2b','ph1');
INSERT INTO "QualitySessionMixEntry" VALUES ('m3','s2r',4,2),('m4','s2b',4,2);
-- p3: mixed currencies, no mix
INSERT INTO "TrainingTrack" VALUES ('t3s','p3','swim','km'),('t3r','p3','run','hours');
INSERT INTO "SeasonAnchorSegment" VALUES ('a6','t3s','2026-01-05',1),('a7','t3r','2026-01-05',9);
-- backfill
UPDATE "PlanOutline" SET "mixCarrierTrackId" = (
  SELECT t.id FROM "TrainingTrack" t
  WHERE t."outlineId" = "PlanOutline".id AND t.discipline IN ('run','bike','swim')
  ORDER BY
    (SELECT COALESCE(MAX(n), 0) FROM (
       SELECT SUM(e."sessionsPerWeek") AS n FROM "QualitySessionMixEntry" e
       JOIN "TrainingTrackSegment" g ON g.id = e."segmentId"
       WHERE g."trackId" = t.id GROUP BY g.id)) DESC,
    CASE WHEN (SELECT COUNT(DISTINCT t2.currency) FROM "TrainingTrack" t2
               WHERE t2."outlineId" = t."outlineId" AND t2.discipline IN ('run','bike','swim')) = 1
         THEN (SELECT a.value FROM "SeasonAnchorSegment" a WHERE a."trackId" = t.id ORDER BY a."fromWeekKey" LIMIT 1) END DESC,
    t.rowid ASC
  LIMIT 1);
SELECT id, mixCarrierTrackId FROM "PlanOutline";
-- deleting the carrier track directly must fail
DELETE FROM "TrainingTrack" WHERE id = 't1r';
SELECT 'after direct delete', count(*) FROM "TrainingTrack" WHERE id='t1r';
-- deleting the user cascades through and passes
DELETE FROM "User" WHERE id = 'u1';
SELECT 'outlines left', count(*) FROM "PlanOutline";
DELETE FROM "PlanOutline" WHERE id = 'p2';
SELECT 'outlines left', count(*) FROM "PlanOutline";

-- Output:
-- sqlite 3.53.4
-- [{"id":"p1","mixCarrierTrackId":"t1r"},{"id":"p2","mixCarrierTrackId":"t2r"},{"id":"p3","mixCarrierTrackId":"t3s"}]
-- ERR DELETE FROM "TrainingTrack" WHERE id = 't1r' -> FOREIGN KEY constraint failed
-- [{"'after direct delete'":"after direct delete","count(*)":1}]
-- [{"'outlines left'":"outlines left","count(*)":2}]
-- [{"'outlines left'":"outlines left","count(*)":1}]
