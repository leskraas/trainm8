-- AlterTable
-- Training Availability (PRD #103 / ADR 0016): trainable weekdays + default training time.
-- Both nullable; null = never set. trainableWeekdays is a JSON array of weekday numbers
-- (0=Sun…6=Sat); defaultTrainingTime is "HH:MM" 24h local time interpreted in `timezone`.
ALTER TABLE "AthleteProfile" ADD COLUMN "trainableWeekdays" TEXT;
ALTER TABLE "AthleteProfile" ADD COLUMN "defaultTrainingTime" TEXT;
