-- CreateTable
CREATE TABLE "LoadRecomputeNotice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "ctlBefore" REAL NOT NULL,
    "ctlAfter" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dismissedAt" DATETIME,
    "athleteId" TEXT NOT NULL,
    CONSTRAINT "LoadRecomputeNotice_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "LoadRecomputeNotice_athleteId_kind_key" ON "LoadRecomputeNotice"("athleteId", "kind");
