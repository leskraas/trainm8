# A Load Recompute Notice may carry no CTL pair, and each kind declares what it corrected

Status: Accepted · Issue #463 · **Supersedes
[ADR 0107](./0107-existing-pool-swims-are-re-read-from-their-kept-fit-and-the-notice-may-say-fitness-rose.md)
§2's last sentence** ("The stored pair is then today's CTL on both sides") ·
**Builds the widening [ADR 0006](./0006-zone-system-in-code.md)'s #444/#447
amendment asked for**, as far as the record goes; the first prescription
notice's words still arrive with the correction that owes them.

## Context

`LoadRecomputeNotice` stores `ctlBefore`/`ctlAfter` as `REAL NOT NULL`. Two
corrections have no honest pair to put there:

- **A load correction that moved CTL by no more than noise.** The swim-pace
  backfill (ADR 0107 §2) owes a notice for the corrected pace alone, and to fill
  the columns it writes today's CTL on both sides, or `0` on both sides for a
  swimmer with no Load Snapshots. That `0` is a fabricated figure, and it
  reaches the athlete in their data export.
- **A prescription correction** (a recipe defect, a threshold-driven
  re-resolution, ADR 0006's amendment). It moves displayed bands, Planned TSS,
  Adherence Bands and chip tint, and no Load Snapshot, so any pair would be an
  invented CTL delta.

## Decision

1. **The CTL pair is optional, and it is one value.** In code a notice carries
   `ctl: { ctlBefore, ctlAfter } | null`, never two independently nullable
   numbers. The two columns become nullable, and a hand-written CHECK makes them
   both-or-neither: `("ctlBefore" IS NULL) = ("ctlAfter" IS NULL)`. A
   constraints test pins the CHECK, because a later SQLite table rebuild drops
   any CHECK it does not restore by hand (as ADR 0044 and
   `20260731203000_require_strength_goal_and_frequency` record).
2. **An absent pair means "no CTL movement to name"**: the correction moved no
   Load Snapshot, or moved it by no more than noise (`widestCtlMovement`
   returned nothing). It is **not** an **Unavailable Metric**. The CTL is not
   something the model cannot calculate; it is a movement that did not happen.
   That is why the bar leaves the movement line out instead of showing _ikke
   målt_, and why the export says `null`.
3. **Each kind declares what its correction moved, `'load'` or `'prescription'`,
   in the kinds table in `app/utils/load/recompute-notice.ts`**, keyed by kind
   like its copy in `RECOMPUTE_NOTICE_LABELS` (ADR 0081: the labels own words,
   not domain facts). Not a column: `kind` already names the correction, so a
   stored discriminator would repeat a fact the kind fixes and could disagree
   with it. The writer's input type is derived from the declaration: a `'load'`
   kind takes a pair or `null`, a `'prescription'` kind takes only `null`. A
   prescription kind with a pair does not compile.
4. **The migration makes the swim placeholders absent.** A
   `swim-rest-left-the-pace` row whose `ctlBefore` equals `ctlAfter` exactly is
   the `latestCtl` placeholder and never a measurement, because
   `widestCtlMovement` only returns a pair that moved by at least the noise
   floor. Those rows get `NULL` on both sides. Every other row keeps its pair,
   `createdAt` and `dismissedAt`. No displayed number moves (the bar already
   showed no movement line for an equal pair), so no notice is owed for it.

## Considered options

- **Keep the columns required and store a sentinel.** Rejected: today's CTL or
  `0` on both sides is the fabricated number this ADR exists to remove.
- **Two nullable columns with no CHECK, pairing kept by code alone.** Rejected:
  a row with one side null is representable and means nothing; the database can
  refuse it for the price of one CHECK and one test.
- **A `'load' | 'prescription'` column** (the issue's first proposal). Rejected
  (point 3).
- **Declare `moved` beside the copy in `labels/first-run.ts`.** Rejected: it
  would put a domain fact in the label seam and make the writer's types import
  from the copy module.
- **Render the absent pair as an Unavailable Metric.** Rejected (point 2).

## Consequences

- The swim-pace backfill passes `widestCtlMovement(...)` straight through, and
  `latestCtl` goes. The strength backfill keeps its own rule (ADR 0046 §2): it
  still writes only when CTL moved.
- The first prescription correction adds a kind declared `'prescription'`, its
  own kicker and explanation, and, if it wants a movement line, its own movement
  shape. This ADR adds no prescription copy and no prescription movement.
- A future migration that rebuilds `LoadRecomputeNotice` must restore the CHECK,
  the unique `(athleteId, kind)` index and the cascade.
