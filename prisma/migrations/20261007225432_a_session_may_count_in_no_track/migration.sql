-- Annet as the athlete's choice (#505 story 33): a session the athlete put in
-- no Training Track. It moves no track's Planned or Actual Volume; its TSS
-- still feeds Training Load.
--
-- Additive only. Every existing session reads `false` — counted in its track,
-- exactly as before — so no stored number moves, and no corpus data ships here.
ALTER TABLE "WorkoutSession" ADD COLUMN "countsInNoTrack" BOOLEAN NOT NULL DEFAULT false;
