-- CreateTable
CREATE TABLE "ActivityStream" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "resolutionSec" INTEGER NOT NULL,
    "sampleCount" INTEGER NOT NULL,
    "timeSec" TEXT NOT NULL,
    "power" TEXT,
    "heartrate" TEXT,
    "pace" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activityImportId" TEXT NOT NULL,
    CONSTRAINT "ActivityStream_activityImportId_fkey" FOREIGN KEY ("activityImportId") REFERENCES "ActivityImport" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ActivityStream_activityImportId_key" ON "ActivityStream"("activityImportId");
