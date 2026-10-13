-- An import is keyed by its athlete (#544): two athletes may hold the same
-- provider activity (a shared Intervals.icu key, the same uploaded file) and
-- each keeps their own copy. Widening the key cannot break an existing row:
-- every pair that was unique stays unique with the athlete added.

-- DropIndex
DROP INDEX "ActivityImport_externalProvider_externalId_key";

-- CreateIndex
CREATE UNIQUE INDEX "ActivityImport_athleteId_externalProvider_externalId_key" ON "ActivityImport"("athleteId", "externalProvider", "externalId");
