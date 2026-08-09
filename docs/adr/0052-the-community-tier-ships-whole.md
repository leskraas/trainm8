# The community tier ships whole, and the moderation gate is what makes the publish flow shippable

Status: Accepted

Resolves [#452](https://github.com/leskraas/trainm8/issues/452), which carries
the constraints decided on
[#438](https://github.com/leskraas/trainm8/issues/438). Amends
[ADR 0037](./0037-workout-visibility-field.md) — its restraint is discharged,
not overturned — and [ADR 0051 §7](./0051-the-catalogue-has-four-axes.md), whose
deferral of the `Attribution` table this decision collects.

Vocabulary, because it keeps being the thing that goes wrong: the corpus is the
**Catalogue**. "Library" is banned in this neighbourhood.

## Context

ADR 0037 landed `Workout.visibility` as inert groundwork and wrote its own gate
into its Revisit note:

> The field's own history is the argument for the remaining restraint: it
> shipped inert and is inert still, so `public` should not be added before a
> publish flow and a moderation gate consume it.

That was confirmed by grep rather than taken on trust — through an entire map,
`visibility` had exactly three references: the column and two lines inside
`copyWorkout`. No `where` clause, no route, no component, no test. ADR 0051 §7
declined to ship an `Attribution` table on the same evidence: a table nothing
can write is ADR 0037 repeated verbatim.

So the thing this decision has to be careful about is not whether the community
tier is a good idea. #438 settled that, and narrowed `GOAL.md`'s identity
boundary to **plans and people** rather than **content** to make room for it.
The thing to be careful about is **shipping half of it**.

## Decision

**`public`, the publish flow, the non-owner-scoped read path, the public author
identity and report-and-takedown land in one commit, or none of them do.** They
did.

### 1. The publish flow may not merge without the moderation gate, and the reason is not squeamishness

A publish flow alone is a feature that puts arbitrary athlete-written text and
arbitrary athlete-written _prescriptions_ in front of every other athlete, with
no way for anyone to say so and no way for anyone to remove it. The failure mode
is not embarrassment; it is a session that hurts somebody, staying up.

There is a second, quieter reason, and it is the one that would have bitten:
`retiredAt` and `SetNull` already give this repo a takedown-shaped mechanism, so
a deferred moderation gate would have looked cheap to add later. It is not cheap
later — it changes what a report _is_ (a queue entry with a resolution and an
author-facing reason), what a takedown _does_ (a permanent state on the
Attribution), and what the read path filters on. Retrofitting all three onto
rows already published is a migration over live community content.

### 2. Report is open to everyone; takedown is not; and the split is what makes both safe

**Who can report:** any signed-in athlete except the author. No reputation gate,
no threshold — a gate on who may report is a gate on who may be heard, and the
honest answer for a corpus this size is everyone. The author is excluded because
they have a better verb: **withdraw**.

**What a report does immediately: it hides the row from the reporter**, through
the read path's `reports: { none: { reporterId: viewerId } }` clause.

This is the whole design, and it is a choice between two bad defaults:

- A report that hides the row **from everyone** hands every athlete a unilateral
  takedown over every other athlete's work. That is a brigading vector with a
  one-person quorum.
- A report that does **nothing** until a moderator arrives makes the reporter
  keep seeing the thing they just said they did not want to see, and teaches
  them the control is decorative.

So the report is **self-effective at once and community-effective only through a
moderator**. Both halves are stated on the report screen in those words, because
a reporter who does not know which half they are pulling either over-uses the
control or abandons it.

**Who can take down:** the `admin` role, at `/admin/moderation`, guarded exactly
the way `/admin/cache` already is. A takedown is:

- **`visibility` back to `private`**, so every read path stops serving it.
- **The `CatalogueEntry` retires** (ADR 0051 §3), so it stops being
  _retrievable_.
- **The Attribution records `takenDownAt` and a `takedownReason`**,
  whole-or-absent by CHECK, and that reason is shown to the author verbatim on
  their own publish screen. An author whose session vanished with no explanation
  has been moderated _at_, not moderated.
- **Every open report on the row closes as `taken-down`**, so the queue reflects
  the decision rather than re-asking it once per reporter.
- **Permanent.** `publishWorkout` reads `takenDownAt` first and refuses. A
  takedown a republish could undo is not a takedown.

**The row is never deleted.** Deleting it would take the athlete's own session
out of their own training history as collateral and strand every fork's
back-pointer — ADR 0051's retire-never-delete rule, applied to the case that
most tempts a delete. The author keeps their session; they lose the audience.

**Dismiss** closes one report and leaves the session published for everybody
else — and still hidden from the athlete who reported it, because that half was
never the moderator's to overturn.

### 3. An Attribution is the mirror of a Citation, and the mirror is structural

ADR 0051 §4 made a **Citation** impossible on an athlete-authored row. This ADR
completes the asymmetry from the other side: an **Attribution** is impossible on
a system-authored one.

Same construction, deliberately: the parent's discriminator travels into the
child as `Attribution.workoutAuthorship`, a composite foreign key pins it to
`Workout (id, authorship)`, and an intra-row CHECK forbids `'system'`.
`ON UPDATE CASCADE` closes the back door — promoting a published Workout to
`'system'` cascades into the Attribution and is rejected.

Community content can never look cited. A trainm8-shipped session can never look
like somebody's post. Neither is a convention anybody has to remember.

**The non-vouch is not a column.** It is trainm8's standing statement about its
relationship to every community row, identical on all of them, so it lives in
code as `COMMUNITY_NON_VOUCH`. Stored per row it could be edited, absent, or
disagree with the row beside it, and the one thing that sentence may not do is
vary.

**`displayName` is snapshotted at publish and confirmed by the author first.**
Two reasons, and only the first is obvious. `Workout.ownerId` is `SetNull`, so a
joined identity renders an orphaned row as nobody. And what an athlete publishes
_under_ is their choice: a default that discloses a real name nobody was asked
about is a disclosure, not a default, so the publish screen offers it as a
pre-filled field.

### 4. Provenance on a shared row is a **walk**, and it is read rather than copied

An athlete may publish a fork of a cited **Stock Workout**. The corpus row's
citation is real; the fork's claim to it is not.

`resolveSharedProvenance` starts at **`copiedFromId`, one hop up**, and hands
the rest to `resolveCatalogueOrigin`, which walks the chain to
`MAX_LINEAGE_HOPS`. Two mistakes it avoids:

- **Starting at the row itself** would find the row's _own_ `CatalogueEntry` —
  publishing creates one — and answer the wrong question.
- **Assuming one hop** would miss a fork of a fork, which #460 already
  established is the normal case rather than the exotic one.

What it returns is rendered as _"Adapted from Daniels — Daniels' Running Formula
(2013) — that source belongs to the session this was forked from, not to this
one"_, and **nothing is written onto the published row**. The citation stays
reachable through the pointer, so correcting a source corrects every descendant
and `retiredAt` keeps working (ADR 0051 §5). A fork of somebody's _community_
row resolves to no citation at all, because the schema makes that impossible
upstream.

### 5. `visibility` gets a CHECK, and stays at exactly two values

The column was an unconstrained string while it had one value and nothing read
it. A second value with a read path behind it is where `'publik'` becomes a row
no query reaches and no moderator can find, so the vocabulary is pinned the way
`authorship` already is — a `Workout` table rebuild, since SQLite adds no CHECK
in place, with every constraint the table already carried restated and pinned by
`catalogue.constraints.test.ts` and `community.constraints.test.ts`.

**`shared` and `invited` are not added.** ADR 0037 left room for them and this
decision deliberately does not fill it: a follower- or invite-scoped read needs
a social graph, which is the half of `GOAL.md`'s identity boundary that did
**not** move. Leaving the room empty is what the string-over-boolean shape was
for.

### 6. A copy never inherits publication

`copyWorkout` used to carry `source.visibility` onto every copy — harmless while
every row was `private`, and a live defect the moment `public` exists. A fork of
a published session would have been a community row **nobody published**,
credited to nobody, that no moderator could find by the report on the row it
came from.

Copies are `private`. Their owner publishes them or nobody does. The same
applies to #460's adoption fork. This closes the half of
[#440](https://github.com/leskraas/trainm8/issues/440) that could do harm; the
defect ticket's `authorship` half was already fixed by ADR 0051 §5.

### 7. The Catalogue surface exists now, and it is the tier asymmetry made visible

`/training/catalogue` is the first screen in this app that reads rows it does
not own. Three tiers on one list, distinguished by the **provenance slot**: a
Citation on a stock row, an Attribution plus the non-vouch on a community row,
in the same position and deliberately different words.

What is **not** on it, on purpose: no save count, no adoption badge, no author
profile to tap through to. ADR 0051 §6 and `GOAL.md`'s permanent no on the
vanity layer. The **collection** facet (`CatalogueSave`) still has no surface
and is not one this ticket owed.

## Alternatives considered

- **Ship publish now, moderation next sprint.** Rejected: §1. This is the one
  ordering the ticket exists to forbid.
- **Ship `shared` (no public exposure) and defer `public`.** Rejected, and worth
  recording as genuinely tempting: it is smaller and it is not dishonest. It is
  also not the thing #438 decided, and `shared` in ADR 0037's sense means
  _follower-scoped_, which needs the social graph `GOAL.md` still excludes.
  There is no cheap middle here — the middle is a different feature.
- **Auto-hide a row after N reports.** Rejected: N is a number nobody can
  derive, and inventing one is the fabrication the building principle forbids —
  a threshold is a claim about how many strangers agreeing means something. The
  per-reporter hide gives the same protection with no invented constant.
- **Delete on takedown.** Rejected: §2. It destroys the author's own session and
  strands lineage, and `retiredAt` already exists for exactly this.
- **Store the non-vouch on the Attribution.** Rejected: §3. A sentence that may
  not vary should not be in a place where it can.
- **Join the author's `User` for the byline.** Rejected: §3. `SetNull` makes the
  join render an orphan as nobody, and it takes the naming choice away from the
  athlete.
- **Copy the origin's citation onto the published fork** so the community row
  can show its source without a walk. Rejected: ADR 0051 §5 already rejected
  this for forks, and here it is worse — it would put a real citation in a
  community row's own slot, which is the exact failure the asymmetry was built
  to prevent.
- **A `Moderator` role distinct from `admin`.** Rejected as speculative: the
  repo has one privileged role, `/admin/cache` is the precedent, and a second
  role with one member is a permissions model for an org that does not exist.

## Consequences

- **Schema.** `Workout.visibility` gains a CHECK (`private | public`) via a
  `Workout` table rebuild. New `Attribution` (1:1, athlete-only by CHECK +
  composite FK, whole-or-absent takedown) and `WorkoutReport` (closed reason
  vocabulary, whole-or-absent resolution, one report per athlete per row,
  `SetNull` on the reporter so a deleted account cannot empty the queue). One
  migration, `20260809090000_add_community_tier`.
- **`listCatalogue` is no longer owner-scoped.** It gains a
  `visibility: 'public'` arm and a `reports: { none: { reporterId: viewerId } }`
  exclusion. This is the ripple #337 called _"the biggest architectural ripple
  to chart"_, and it is charted in exactly one query — every other query in the
  app is still owner-scoped, and that is still correct.
- **Three athlete-facing screens and one admin screen**: `/training/catalogue`,
  `/training/catalogue/publish/:workoutId`,
  `/training/catalogue/report/:workoutId`, `/admin/moderation`. Verified at
  390×844 per ADR 0028, driving the report and takedown path and not only the
  publish path.
- **Nothing links to `/training/catalogue` from the app chrome yet.** The review
  surface #434 has not specified is where it belongs, and adding a nav entry now
  would be guessing at that surface's shape.
- **`CONTEXT.md`**: **Shared Workout** and **Attribution** stop being _future_;
  **Workout**'s visibility axis stops being inert; **Catalogue** gains the
  reachable `community` tier; a new **Content Report** entry covers
  report-and-takedown.
- **Outstanding, and named rather than hidden**: the author-deleted orphan purge
  ADR 0051 left open now has a reachable case — an orphaned Workout that is
  still `public` stays readable after its author's account is deleted, which is
  correct as _attribution_ (the Attribution is snapshotted) and unexamined as
  _deletion policy_. A "delete my account" flow does not exist yet; when it
  does, it must decide whether it withdraws that athlete's published sessions.
- **For #456 (the deterministic generator)**: retrieval through `listCatalogue`
  now returns community rows to every athlete. A generated plan may therefore
  cite a row trainm8 does not vouch for, so anything that renders a generated
  session's source must read the provenance slot rather than assuming a Citation
  — and must be able to say "published by an athlete" where there is no
  published source at all.
