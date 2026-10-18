-- An applied Week Replan Proposal keeps what it replaced, and can be undone
-- (#564, spec #558).
--
-- `beforeImage` is the JSON before-image the apply engine writes with
-- `appliedAt`; `undoneAt` is when it was put back. No backfill: a proposal
-- applied before this migration has no before-image, and its undo is refused.

-- AlterTable
ALTER TABLE "WeekReplanProposal" ADD COLUMN "beforeImage" TEXT;
ALTER TABLE "WeekReplanProposal" ADD COLUMN "undoneAt" DATETIME;
