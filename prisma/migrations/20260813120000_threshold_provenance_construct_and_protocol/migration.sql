-- Give a Threshold Event the two provenance axes that actually vary
-- (ADR 0005 amended; docs/research/zones-and-thresholds.md §5,
-- docs/research/athlete-profile-from-history.md §3).
--
-- `source: manual | inferred | auto` records *how much to trust the entry*, which
-- is the wrong axis. "FTP = 250" from a 60-minute TT, from `0.95 × 20 min`, from
-- `0.75 × ramp MAP` and from a CP curve fit are four different numbers for the
-- same rider — up to ~20 W apart, with the CP fit systematically the highest —
-- and two of those four are `manual` while two are `auto`. The enum cannot tell
-- the pairs that matter apart.
--
-- `construct` says **what was measured** and `protocol` says **how**. They are
-- added now, ahead of the first estimator writing a row, because provenance
-- cannot be retrofitted onto numbers already stored — `DisciplineProfile.zoneSystem`
-- having no history at all is the standing proof of that in this schema.
--
-- Nobody's numbers move here. Every existing row keeps its value, its date and
-- its `source`; the two new columns only make explicit what those rows already
-- were. No Load Recompute Notice is owed.

-- AlterTable
ALTER TABLE "ThresholdEvent" ADD COLUMN "construct" TEXT;
ALTER TABLE "ThresholdEvent" ADD COLUMN "protocol" TEXT;
ALTER TABLE "ThresholdEvent" ADD COLUMN "confidence" TEXT;

-- Every row in this table today was written by `setDisciplineThresholds`, which
-- hard-codes `source: 'manual'` — the `inferred` and `auto` values have never had
-- a writer. So the backfill is exact rather than a guess: these are all numbers
-- an athlete typed.
UPDATE "ThresholdEvent" SET "protocol" = 'manual' WHERE "protocol" IS NULL;

-- `kind` already names the quantity for every member except the FTP/CP pair,
-- where it names the column. A pre-existing `ftp` row *is* an FTP: it was typed
-- by an athlete into a field labelled FTP, and no CP fit existed to have produced
-- it. Mapping it to `ftp` is therefore a statement of fact, not a default.
UPDATE "ThresholdEvent" SET "construct" = "kind"
WHERE "construct" IS NULL AND "kind" IN ('maxHr', 'lthr', 'ftp', 'runPower', 'thresholdPace', 'css');

-- `weight` is deliberately left with a null construct: it is a body measurement
-- riding in the threshold history, not a threshold, and inventing a construct
-- member for it would be widening a vocabulary to fit a row that does not belong
-- to it.

-- `confidence` stays null on every backfilled row. A number the athlete stated
-- about themselves is not graded by the app (ADR 0033's vocabulary is for what
-- the app derives), and grading these retroactively would be the app asserting a
-- reliability nobody measured.
