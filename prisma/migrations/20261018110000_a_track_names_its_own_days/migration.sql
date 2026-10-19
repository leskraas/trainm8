-- **Pinned days per track** (#597, ADR 0104 §4): the weekdays the athlete
-- chose for a Training Track, as a JSON array on the Week Pattern's
-- Monday-first axis (0 = Monday … 6 = Sunday). `NULL` is _La appen velge_,
-- the default, so every existing track keeps today's behaviour.
--
-- **No stored row changes.** A nullable column is added and nothing is
-- written to it: a strength track's stored `fixed` days are already read as
-- its Pinned days (ADR 0104 §4), so nobody's gym days move, and no Load
-- Recompute Notice is owed.
ALTER TABLE "TrainingTrack" ADD COLUMN "pinnedDays" TEXT;
