# The Catalogue has four orthogonal axes, and authorship is asserted

Status: Accepted

Resolves [#438](https://github.com/leskraas/trainm8/issues/438). Amends
[ADR 0003](./0003-session-first-authoring.md) — the template library it deferred
— and [ADR 0037](./0037-workout-visibility-field.md) — visibility is one axis of
four, not one of two. Built by
[#448](https://github.com/leskraas/trainm8/issues/448).

Vocabulary note, because this decision is the reason it matters: the thing is a
**Catalogue**. "Library" is banned in this neighbourhood.

## Context

Generation should be **retrieval-and-substitute over a cited corpus** rather
than free invention (`workouts-running.md` §13.1), and the manual planner should
be able to answer "add a threshold session" with eight cited candidates instead
of an empty form. Both need a corpus, and a corpus needs to say four different
things about each row.

ADR 0003 deferred the template library and its Revisit note already concedes the
ground: _"'the Workout is never shared' is a policy, not a model constraint"_ —
`Workout.sessions` is one-to-many, and ADR 0044 §6's `WeekPatternDay.workoutId`
already makes a Workout a referenced _shape_ that stamping deep-copies per
session. Reference-and-copy is the template relationship arriving without the
template.

ADR 0037 landed `Workout.visibility` and modelled the question as a two-way
split. Its own Revisit note records why that is incomplete: _"a system-owned,
athlete-copyable template catalogue is a third case this field does not model —
seeded catalogue rows have no athlete owner at all — so visibility is orthogonal
to catalogue membership **and** to authorship."_

## Decision

**Four orthogonal axes, not three and not two.**

| Axis           | Where it lives                                       | Answers                        |
| -------------- | ---------------------------------------------------- | ------------------------------ |
| **Authorship** | `Workout.authorship` (asserted) + nullable `ownerId` | who wrote it                   |
| **Membership** | a `CatalogueEntry` row, **1:1** with Workout         | is it offered for reuse at all |
| **Collection** | a `CatalogueSave` row, **many-per-Workout**          | is it in _this_ athlete's list |
| **Visibility** | `Workout.visibility`                                 | who may read it                |

### 1. Tier is derived, viewer-relative, and answers provenance only

`stock | community | mine`, computed at read time. The same row is `mine` to its
author and `community` to everybody else, so it cannot be a stored column.

The proposal this supersedes derived three tiers as `system → stock`,
`ownerId === viewerId → saved`, else `shared`. That makes `saved` mean **"I
wrote it."** The word an athlete hears — and the thing they will actually want —
is **"it is in my list"**, and for a retrieval corpus an athlete's list is
overwhelmingly sessions they did _not_ write. Under that derivation the only
route from a stock session to "my list" was a deep copy, which is what made "is
`CatalogueEntry` 1:1 or many-per-Workout?" look like an open question. It was
not a question; it was the derivation leaking.

**Collection is the fourth axis, and "in my list" is a facet, never a tier.**

### 2. Authorship is asserted, and that is a correctness argument

The cheap alternative is inferring stock from `ownerId IS NULL`. **The repo
already ships that inference and it already has the bug.** `Exercise` carries
`createdByAthleteId String?` with `onDelete: SetNull`; an athlete authors a
custom exercise, their account is deleted, the column goes null, and
`getExerciseCatalog` (`where: { OR: [{ createdByAthleteId: null }, …] }`) then
serves that row to every athlete **as a trainm8-authored entry**. The inference
cannot distinguish _"nobody wrote this"_ from _"the author is gone."_

`Workout.ownerId` becoming nullable is a prerequisite of the Catalogue under
_any_ model, and the moment it is nullable the choice between `Cascade` and
`SetNull` either deletes corpus content when an author leaves or reproduces the
`Exercise` bug. **Asserted `authorship` is what makes `SetNull` safe.**

The constraint is the **implication**, not the biconditional:

```sql
CHECK ("authorship" <> 'system' OR "ownerId" IS NULL)
```

An orphaned athlete-authored row stays expressible and reads _"author gone"_,
never _"trainm8 says so."_ That asymmetry is the entire point and a
biconditional would destroy it.

### 3. `CatalogueEntry` is a row, and its `archetype` is authored

A boolean on `Workout` cannot carry what membership needs: `archetype`, `level`,
the citation, `retiredAt`, progression edges, `phases[]` and `goalEvents[]`. ADR
0044's rows-not-JSON idiom settles the multi-valued facets — `phases` and
`goalEvents` are child tables with closed vocabularies, and no rows means "not
scoped", which is a positive statement rather than "unknown".

`retiredAt` matters more than it looks: a stock session later found mis-cited
must stop being **retrievable** without vanishing from the plans that already
used it, and a fork's back-pointer must keep resolving through it.

**The `archetype` column is authored, and this does not contradict ADR 0042's
derived-never-authored rule.** That rule is about classifying a session in an
athlete's **Training Week** — a 100-minute easy run is `easy` in a 120 km week
and `long` in a 50 km one, so one session's numbers cannot classify it. A corpus
row has no week. It is published _as_ a threshold session by its source, and
that is a fact about the row rather than a guess about an athlete. The rule
survives untouched for the derivation it was written about.

### 4. Provenance is asymmetric, and the asymmetry is structural

**A Citation is available only to a system-authored row.** Community content
carries an **Attribution** and an explicit non-vouch instead — never a Citation
in the same slot as real authority. The failure this prevents is an athlete
typing "Daniels 2013" onto a session Daniels never wrote.

Enforced structurally rather than by convention, using the construction ADR
0047's migration already established for `QualitySessionMixEntry`: a CHECK
cannot reach another table and this repo declines triggers (they are invisible
in `schema.prisma` and lost to a later table rebuild), so the parent's
discriminator travels into the child as `CatalogueEntry.workoutAuthorship`, a
**composite foreign key** requires it to match `Workout (id, authorship)`, and
an intra-row CHECK forbids the citation columns unless it reads `'system'`.
`ON UPDATE CASCADE` closes the back door: demoting a cited Workout to
`'athlete'` cascades into the entry and is then rejected.

A citation is also **whole or absent** — a year or a DOI with no work named is a
fragment wearing a source's clothes, and `readCitation` reports it as absent
rather than rendering half of one.

### 5. Fork-on-write, through one back-pointer

**Saving inserts a `CatalogueSave` against the original and copies nothing. The
first edit deep-copies** through the shipped `copyWorkout` into an athlete-owned
Workout, recording `Workout.copiedFromId` — a self-relation, nullable,
`onDelete: SetNull`.

Three things this buys that copy-on-save cannot:

1. **Adoption stays countable.**
   `COUNT(*) FROM CatalogueSave WHERE workoutId = …` is the retrieval-ranking
   signal generation needs once the corpus outgrows what a person can read.
   Copy-on-save destroys that number permanently — every save becomes a distinct
   row and the corpus can never report what works.
2. **Attribution survives unforked.** A save points at the original, so the
   citation shown _is_ the original's. The citation is never copied onto a fork:
   it is reached through the pointer, so it cannot drift, `retiredAt` keeps
   working, and correcting a source corrects every descendant.
3. **No mutation hazard**, because nothing shared is ever edited in place — the
   fork happens before the first write.

`SetNull` and never `Cascade`: deleting a source must orphan the lineage and
never take the athlete's own copy with it. Lineage is a **chain**, so a reader
walks it (`resolveCatalogueOrigin`, capped at 16 hops) rather than assuming one
hop — a fork of a fork still came from the corpus.

**One field, one rule, across two tickets.**
[#460](https://github.com/leskraas/trainm8/issues/460) needs the same mechanism
for an adopted machine-written session: copy the prescription aside, repoint,
and keep a pointer to what it came from. `copiedFromId` is that pointer in both
directions of use — the fork's source _and_ the preserved pre-edit row — and the
citation `#460` §3 wants is reached as `copiedFrom.catalogueEntry` rather than
copied onto the session. The rule both tickets share: **never edit the generated
or corpus-written artifact in place.**

#### Retention: a preserved row dies with its session, and only when nothing else holds it

_Added by #460, which the field's `SetNull` left open._ Because
`Workout.copiedFromId` is `SetNull` rather than `Cascade`, a preserved pre-edit
Workout **outlives its descendant**, and deleting a session cascades only into
the Workout the session itself points at — so nothing reaches the preserved row
and it lingers forever.

**The rule: the preserved row survives every later edit and dies with the
session it belonged to.** Deleting a session therefore reads the `copiedFromId`
chain _before_ deleting anything (the head holds the only pointer into it), then
walks it collecting what is genuinely orphaned. Four guards, and they are not
paranoia — this is the same field a Catalogue fork uses, so an unguarded walk
would delete corpus content out from under every other athlete the moment one of
them deleted one session:

- **In the Catalogue → never.** A Catalogue Entry is retired, not deleted (§3).
- **`authorship = 'system'` → never.** A **Stock Workout** is not the athlete's
  to collect, entry or no entry.
- **Owned by someone else → never.**
- **Still referenced by anything → never** — another session, a Week Pattern
  slot, another fork, or anybody's list. A referenced row is not an orphan.

The walk is capped at the same 16 hops as `resolveCatalogueOrigin`, and it stops
at the first row it may not take rather than skipping past it: everything above
a kept row is still reachable through it.

### 6. The save count is a ranking input, never a displayed number

`GOAL.md`'s permanent no is on _"followers, kudos, comments"_ — the vanity
layer. A corpus that ranks by what athletes adopt is the opposite of vanity; a
"847 saves 🔥" badge on a workout card is that layer arriving through the back
door. Same column, different product.

### 7. `public` and the `community` tier are not in this decision

> **Discharged by [ADR 0052](./0052-the-community-tier-ships-whole.md) (#452).**
> Everything this section held back landed together, in one commit: `public`
> visibility with a CHECK, the publish flow, the **Attribution** table (with its
> writer), the non-owner-scoped read path and report-and-takedown. The gating
> condition was met rather than waived. Two clauses of this section are now
> historical: the grep is out of date (`visibility` has a `where` clause,
> routes, components and tests), and the `Attribution` deferral is collected.
> The rule underneath both — **do not ship a value ahead of its consumer** — is
> what the discharge honours.

ADR 0037's own Revisit note is the precedent and reaches the conclusion: _"it
shipped inert and is inert still, so `public` should not be added before a
publish flow and a moderation gate consume it."_ Confirmed by grep rather than
taken on trust — `visibility` has exactly three references in the repo (the
column and two lines inside `copyWorkout`): no `where` clause, no route, no
component, no test, through an entire map.

So `public` visibility, the publish flow, a public author identity, the
non-owner-scoped read path and report-and-takedown land **together, in one
slice, or not at all** (#452). The `community` arm exists in the tier
_derivation_ because what is being stated there is the derivation, not a stored
value awaiting a consumer.

**The `Attribution` row is deferred with them, for the same reason.** The
asymmetry this decision owes is that a citation is _structurally impossible_ on
an athlete-authored row, and that ships here. A table for the other half, with
nothing able to write it, would be ADR 0037 repeated verbatim.

### 8. `GOAL.md`'s identity boundary narrows to plans and people

`GOAL.md` Non-goals said _"no coach dashboards, athlete rosters, or
shared/assigned plans. This is an identity boundary, not a phase."_ A shared
corpus of cited workouts is neither a feed nor a coach dashboard, but "shared
plans, identity boundary" was doing real work against it.

**The boundary is about _plans and people_, not _content_.** No coach
dashboards, no athlete rosters, no assigned plans, no feed — a shared corpus of
cited workouts is content and is in scope.

## Alternatives considered

- **Infer authorship from `ownerId IS NULL`.** Rejected: §2. It costs one column
  and one CHECK to not ship a defect the repo can already point at.
- **`Cascade` on a nullable `ownerId`.** Rejected: deleting one athlete would
  delete corpus content every other athlete reads.
- **A boolean `isInCatalogue` on `Workout`.** Rejected: membership carries data,
  and ADR 0044 already settled the shape of that argument.
- **A separate `WorkoutTemplate` model.** Rejected: `copyWorkout` and
  `buildBlocksCopy` already deep-copy a Workout at stamp and at copy-week, so a
  second model is a parallel implementation of the same copy for no gain. One
  Block/Step tree.
- **Copy-on-save.** Rejected: §5. It destroys the adoption count permanently and
  starts a lineage chain whose attribution degrades over copies-of-copies.
- **A `savedFrom` pointer distinct from #460's preserved-row pointer.**
  Rejected: two fields for one relationship, and #448 and #460 would then
  disagree about which one a reader walks.
- **Store the citation on the fork.** Rejected: it drifts, and it defeats
  `retiredAt` — a mis-cited source could be retired while every copy of it kept
  printing the bad citation.

## Consequences

- `Workout` gains `authorship String @default("athlete")` and
  `copiedFromId String?`; `ownerId` becomes nullable with `onDelete: SetNull`.
  In SQLite that is a **full table rebuild**, so every CHECK the table carries
  lives in the migration and is pinned by
  `app/utils/catalogue.constraints.test.ts` — a rebuild carries none of them
  forward.
- `Workout` gains a second unique index on `(id, authorship)`, bought for the
  one consumer that makes the citation rule structural.
- **Deleting an athlete now orphans their Workouts rather than deleting them.**
  That is the deliberate cost of `SetNull` and it is what makes an orphan
  readable as "author gone". A private Workout whose author is gone is
  unreachable through every owner-scoped query in the app, so nothing surfaces
  it — but a purge path for orphaned, non-Catalogue Workouts is genuine
  outstanding work rather than something this decision handles. (#460 collects
  the one class of orphan it creates — a preserved pre-edit Workout whose
  session is deleted — under the retention rule in §5. The author-deleted orphan
  is a different case and still outstanding.)
- **`Exercise` still has the bug this decision names.** It is left standing on
  purpose: fixing it is a second table rebuild plus an `authorship` column on
  `Exercise`, it is not what #448 was scoped to, and doing it silently inside a
  Workout migration is how a schema ticket becomes two.
- The **Session Archetype** vocabulary becomes real for the first time — sixteen
  values in `app/utils/catalogue.ts`, pinned by a CHECK. `CONTEXT.md` had it as
  _future (not yet built)_.
- `CONTEXT.md` gains **Catalogue**, **Catalogue Entry**, **Stock Workout**,
  **Shared Workout**, **Citation** and **Attribution**, and the **Workout
  Template** entry is **corrected** — it described a feature ADR 0003 says does
  not exist, and had been a glossary lie since it was written.
- No screen changes. This is schema, vocabulary and a server module; the
  surfaces that read it are #451's seed, #452's community tier and the review
  surface #434 has not yet specified.
