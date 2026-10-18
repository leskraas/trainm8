-- A Juster keeps what it replaced (spec #558 S5, ADR 0100 §7, #575).
--
-- _For sliten i dag_, _Lite tid_ and _Bytt dag_ change today's session with
-- one tap, and each lands with _Angre_. The row is the change's undo token:
-- what it replaced (its before-image, JSON) and when it was taken back. No
-- backfill: no Juster was made before this.

-- CreateTable
CREATE TABLE "SessionAdjustment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "intent" TEXT NOT NULL,
    "beforeImage" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undoneAt" DATETIME,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    CONSTRAINT "SessionAdjustment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SessionAdjustment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkoutSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SessionAdjustment_userId_idx" ON "SessionAdjustment"("userId");

-- CreateIndex
CREATE INDEX "SessionAdjustment_sessionId_idx" ON "SessionAdjustment"("sessionId");
