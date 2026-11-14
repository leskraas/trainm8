-- Better Auth runs dark beside Epic login (#680, ticket 0 of #554; ADR 0094
-- §2, ADR 0114).
--
-- Adds Better Auth's user columns to `User` and its five tables: `AuthSession`
-- (a Sign-in Session), `AuthAccount` (a Sign-in Method), `AuthVerification`,
-- `AuthPasskey` and `TwoFactor`. Every new foreign key to `User` cascades.
--
-- **Schema only. No data is copied** and nothing is seeded: Epic's `Password`,
-- `Connection`, `Passkey` and `Role` rows stay where they are, and the cutover
-- data migration (#554, ticket 3) fills these tables and sets `emailVerified`
-- and `role` for existing users. Until then every existing user reads
-- `emailVerified = false`, `role = NULL` and both 2FA flags false, and Epic's
-- login, which reads none of these columns, is unchanged.
--
-- **No stored number moves**, so no Load Recompute Notice is owed.
--
-- The user columns are added with `ALTER TABLE … ADD COLUMN`, not by Prisma's
-- generated table redefinition: SQLite can add each of them in place, and
-- redefining `User` would drop and recreate the table every other user-owned
-- table cascades from. The result is the same schema (`prisma migrate diff`
-- against `schema.prisma` is empty).

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "expiresAt" DATETIME NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "impersonatedBy" TEXT,
    CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuthAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" DATETIME,
    "refreshTokenExpiresAt" DATETIME,
    "scope" TEXT,
    "password" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AuthAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuthVerification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TwoFactor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "secret" TEXT NOT NULL,
    "backupCodes" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "verified" BOOLEAN DEFAULT true,
    "failedVerificationCount" INTEGER DEFAULT 0,
    "lockedUntil" DATETIME,
    CONSTRAINT "TwoFactor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuthPasskey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "publicKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialID" TEXT NOT NULL,
    "counter" INTEGER NOT NULL,
    "deviceType" TEXT NOT NULL,
    "backedUp" BOOLEAN NOT NULL,
    "transports" TEXT,
    "createdAt" DATETIME,
    "aaguid" TEXT,
    CONSTRAINT "AuthPasskey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AlterTable: Better Auth's user columns, added in place (see the header).
ALTER TABLE "User" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "imageUrl" TEXT;
ALTER TABLE "User" ADD COLUMN "displayUsername" TEXT;
ALTER TABLE "User" ADD COLUMN "twoFactorEnabled" BOOLEAN DEFAULT false;
ALTER TABLE "User" ADD COLUMN "role" TEXT;
ALTER TABLE "User" ADD COLUMN "banned" BOOLEAN DEFAULT false;
ALTER TABLE "User" ADD COLUMN "banReason" TEXT;
ALTER TABLE "User" ADD COLUMN "banExpires" DATETIME;
ALTER TABLE "User" ADD COLUMN "mustReenrolTwoFactor" BOOLEAN DEFAULT false;

-- CreateIndex
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_token_key" ON "AuthSession"("token");

-- CreateIndex
CREATE INDEX "AuthAccount_userId_idx" ON "AuthAccount"("userId");

-- CreateIndex
CREATE INDEX "AuthVerification_identifier_idx" ON "AuthVerification"("identifier");

-- CreateIndex
CREATE INDEX "TwoFactor_secret_idx" ON "TwoFactor"("secret");

-- CreateIndex
CREATE INDEX "TwoFactor_userId_idx" ON "TwoFactor"("userId");

-- CreateIndex
CREATE INDEX "AuthPasskey_userId_idx" ON "AuthPasskey"("userId");

-- CreateIndex
CREATE INDEX "AuthPasskey_credentialID_idx" ON "AuthPasskey"("credentialID");
