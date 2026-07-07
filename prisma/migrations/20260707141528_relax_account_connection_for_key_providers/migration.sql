-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AccountConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "externalAthleteId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'active' CHECK ("status" IN ('active', 'expired', 'revoked', 'error')),
    "connectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncedAt" DATETIME,
    "backfillCompletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "athleteId" TEXT NOT NULL,
    CONSTRAINT "AccountConnection_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AccountConnection" ("accessToken", "athleteId", "backfillCompletedAt", "connectedAt", "createdAt", "expiresAt", "externalAthleteId", "id", "lastSyncedAt", "provider", "refreshToken", "status", "updatedAt") SELECT "accessToken", "athleteId", "backfillCompletedAt", "connectedAt", "createdAt", "expiresAt", "externalAthleteId", "id", "lastSyncedAt", "provider", "refreshToken", "status", "updatedAt" FROM "AccountConnection";
DROP TABLE "AccountConnection";
ALTER TABLE "new_AccountConnection" RENAME TO "AccountConnection";
CREATE INDEX "AccountConnection_athleteId_idx" ON "AccountConnection"("athleteId");
CREATE UNIQUE INDEX "AccountConnection_athleteId_provider_key" ON "AccountConnection"("athleteId", "provider");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
