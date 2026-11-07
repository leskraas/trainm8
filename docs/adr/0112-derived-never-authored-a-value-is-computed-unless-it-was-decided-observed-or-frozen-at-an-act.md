# Derived, never authored: a value is computed unless it was decided, observed or frozen at an act

Status: Accepted · Resolves #377

## Context

The repo applies one rule about when a value is computed and when it is stored
in at least fifteen ADRs, and defines it nowhere of its own. ADR 0040 §1 comes
closest: it names the rule "derived, never authored" and applies it to a
**Training Week**'s volume target, inline, as one decision among thirteen. The
rule also travels under three phrasings: "derived, never authored" (ADR 0021,
ADR 0042 §5, `GLOSSARY.md`), "derived, never stored" (ADR 0040 §1) and "the
derived-never-stored rule" (ADR 0056 §3). So every new data-model ADR re-argues
it, and the hard part, where storing is right, is rediscovered each time: a
**Week Replan**, a **Load Snapshot**, `effectiveKg`, a confirmed **Weekly
Capacity**.

A wrong call costs the athlete directly. A stored number that has lost its
relation to its inputs goes stale silently. A recomputed number that should have
been frozen rewrites history the athlete has already read.

The repo already has a working precedent for a cross-cutting principle defined
once and cited by number: **Unavailable Metric**, "never a hardcoded zero
(Unavailable Metric, ADR 0008)". Its one wart is that it lives inside an ADR
titled for TSS load math, so the ADR list does not reveal it. This ADR names its
principle in its own title.

## Decision

### 1. The test

**Derive any value that is a pure function of inputs the app still holds. Store
only three kinds of value:**

1. **An authored decision.** A choice made once, at a dated act, and never
   re-derived. The instance is the **Week Replan** (ADR 0025): stored per closed
   week, and "the first evaluation wins", because re-deriving it over shifting
   inputs would let a multiplicative adjustment compound and would let what was
   applied and what is said drift apart.
2. **An observation received from outside.** A fact the app did not compute and
   cannot recompute. The instance is the **Activity Import**: a raw telemetry
   record from an external provider, with nothing inside the app to derive it
   from.
3. **A bake made at an act, with the inputs it used stored beside it.** A
   derivation whose input changes over time, captured as it stood at the moment
   the athlete acted. The built instance is `effectiveKg` with `bodyweightKg`
   (ADR 0056 §3, "resolve-and-bake"): a bodyweight-derived load depends on the
   bodyweight _then_, so recomputing it would silently rewrite an old record,
   and `bodyweightKg` stored beside it keeps the number auditable and
   re-derivable. The second instance is a completed session's frozen **Target
   Resolution**: the glossary's rule that a completed session's target "freezes
   at completion", because it is what the athlete was told to run. That rule has
   no ADR of its own and its `Resolution` record is not built yet; when it is,
   it is a bake of this kind and stores its anchor snapshot beside the value.

Everything else is derived. "Inputs the app still holds" is what separates case
3 from a derivation: once an input has moved on (a new bodyweight, a new
threshold), the value at the act is no longer a function of anything the app
holds, so it is frozen with its inputs or it is lost.

### 2. Who authors a decision

A decision is authored by the athlete, or by the app where an ADR gives the app
that decision. The **Week Change**'s **Week Replan** is the app's: under the
**Autopilot**, which is on by default, the Week Change applies it without a yes
(ADR 0025, ADR 0100 §1–§2). What makes it a decision is not who made it but that
it is made once, at a dated act, and never re-derived. A decision the app
authors says what it did and can be undone (ADR 0100 §4–§5). This is the
glossary's **authorship**, `system` or `athlete`. An **Assistant** is never "the
app" here: the app's decisions are the rules' own (the **Proposal Author**
`rules`), and an assistant's proposal applies only on the athlete's explicit yes
(ADR 0093 §2–§3).

Where the value is the athlete's own (§6), only the athlete's act makes it a
decision. An Assistant may propose the value, but accepting it is the athlete's
yes in trainm8, which an assistant never gives (ADR 0093 §1, §3). What an
assistant writes on the athlete's say-so (a session, a _Gjort_, a set log) is
the athlete's own act (ADR 0093 §5), so a load it logs is baked as the athlete's
(§1.3).

### 3. Materialization is a clause of the principle, not an exception to it

A derived value may be stored for consistency or for a measured cost. It is then
**materialized**, and it stays derived:

- **It keeps its relation to its inputs.** Every input it was computed from is
  still held, and the value can be recomputed from them at any time.
- **It states its recompute triggers.** The ADR that materializes it names every
  event that recomputes it.

A **Load Snapshot** (ADR 0008) materializes daily TSS totals and CTL, ATL and
TSB. As built, it is recomputed on a session log, an import promotion, a
provider sync or backfill, a threshold change, a recorded missed or skipped
**Session Status**, and a formula-correction backfill (the case §4 exists for).
`plannedTssValue` (ADR 0019 §2) is materialized on the **Workout Session**,
because per-render computation was "wasteful and inconsistent across views". As
built, it is recomputed on a prescription edit, a threshold change, a typed
**Performance Result**, and by the writers that lay or change a plan. These
lists describe the code today and are examples, not the closed set a new
materialization is checked against. Both are stored and neither is authored,
which is why the name is "derived, never authored" and not "derived, never
stored".

### 4. A moved number the athlete has read is explained, never silent

When a recompute moves a number the athlete has already read, without the
athlete's own input having changed, the movement is explained and never silent
(ADR 0008, ADR 0046 §2). The duty belongs to materialization, not to one table:
any materialized value an athlete reads owes it. For a **Load Snapshot** the
explanation is the **Load Recompute Notice**. Where the athlete's own data did
change (a new power meter, ADR 0008), the choice between two honest readings is
theirs, and the app offers rather than switches. ADR 0055 §2 already reasons
with this duty to keep a label from being stored: a stored reading would owe "a
**Load Recompute Notice** for a label" every time its window moved.

No generic notice mechanism is built here; a later materialized value that an
athlete reads names its own explanation in the ADR that materializes it.

### 5. Cost never decides derive versus store

Cost is not part of the test in §1. A slow derivation is still a derivation. A
**measured** cost decides only whether a derived value is materialized (§3), in
the database or in memory alike.

- ADR 0024 declined an NP column on the **Activity Import** "for now": the
  recompute already reads the stream, and the column is "an optimization to
  revisit if per-day recompute cost ever bites". No cost was measured, so
  nothing was materialized.
- ADR 0078 §5 (and its "Alternatives considered") deferred caching the stream's
  per-frame rect reads, a measured cost: a real saving, but caching them means
  invalidating them on growth, on resize and on a band expanding, three new
  invalidation paths for a tail that is not the one that hurts, and a stale
  offset there is a reading position that drifts.
- The **Training Week** volume target (ADR 0040) is one closed-form, indexed
  formula with no reads, and is derived and not materialized. CTL (ADR 0008) is
  a 42-day replay over daily TSS, and is derived and materialized. Both are
  derived; they differ only in whether a cost justified materializing.

### 6. Derived, then authored

A derived value the athlete owns (a **Weekly Capacity**, a threshold, an
archetype) becomes stored, authored state only when the athlete acts on it, and
from then on it is an authored decision, never re-read from its source. This is
not the materialization of §3, which stores a derived value with no act and
keeps it derived, nor the app's own decision of §2. The derivation is shown as a
pre-fill; the athlete's act is what makes it theirs, and an **Assistant** never
supplies that act (ADR 0093 §3; §2 above).

- **Weekly Capacity** (ADR 0050 §2): proposed from recent weekly hours, and once
  authored "nothing re-reads history". History says what the athlete did; a
  capacity says what they could.
- **Threshold Estimate** (ADR 0054 §4, §8): proposed from the athlete's own
  history, and written only when accepted; acceptance re-derives server-side
  rather than trusting a posted value.
- **Adopting a detected session** (ADR 0055 §3): adoption is the honest moment
  for a **Session Archetype** reading to become a statement. Writing it at
  adoption is the next slice and not built.

A **reading** is never stored (ADR 0055 §3): until the athlete acts, a
context-dependent classification lives on the derived side only.

### 7. Conventions and display artefacts are never stored as authored state

- **A convention or default the athlete did not choose is never stored as though
  authored** (ADR 0044 §4, ADR 0048 §1). A null rate means "follow the
  convention" and a number means "the athlete authored this", so when a
  convention moves, the athlete's own numbers do not move with it.
- **A display artefact never shares a field with authored state** (ADR 0057 §6).
  A 1RM computed for a chart may be recomputed freely; a training max is
  authored state, so sharing a field would let a chart's recompute move a
  program's loads.

### 8. How later ADRs cite it

A later ADR that applies the principle cites it as **(Derived, never authored,
ADR 0112)**, the way the repo already cites (Unavailable Metric, ADR 0008). An
ADR that stores a value says which case of §1 it is, or names the
materialization's recompute triggers (§3) and its explanation (§4).

"Derived, never stored" stays correct as the narrower statement for a derived
value that is not materialized, such as the **Training Week** volume target.

## Considered options

- **Seed a value from other data and store it.** Rejected, as ADR 0040 §1 first
  rejected it: it computes a number from other data and throws the relation
  away, so it goes stale silently and unrecoverably. It is the worst of both:
  neither a decision nor a derivation. Derived-then-authored (§6) is not this,
  because the athlete's act makes the stored value a statement of theirs.
- **"Derived, never stored" as the name.** Rejected: false for every
  materialized value the principle has to cover (a **Load Snapshot**,
  `plannedTssValue`). It is kept as the narrower statement (§8).
- **Cost as part of the test.** Rejected: it would let a slow derivation turn
  into stored data that has lost its relation. Cost decides only
  materialization, and only when measured (§5).
- **Caches as an exception to the rule.** Rejected: an exception invites a cache
  that drops its relation and its triggers. As a clause (§3), a cache owes both.
- **"Authored" meaning the athlete only.** Rejected: the Week Replan, the test's
  own instance, is written by the app under the Autopilot, so the principle
  would be broken on the day it is named, or would need a fourth store case for
  the same thing (§2).
- **Leaving derived-then-authored and conventions with their own ADRs.**
  Rejected: they are exactly where derive meets store, and a test without them
  would misclassify a confirmed Weekly Capacity as a stored derivation and a
  preset's rates as authored.

## The rulings this generalizes

Each line is one ruling and the case it decided. Their own wording stands:
accepted ADRs are records and are not rewritten.

- **ADR 0008**: a **Load Snapshot** materializes CTL, ATL and TSB with stated
  triggers, and a recompute never switches an athlete's numbers silently (§3,
  §4).
- **ADR 0018**: the Plan card is a view over **Events**, and stores nothing of
  its own.
- **ADR 0019 §2**: `plannedTssValue` is materialized, never per-render, with
  prescription edits and threshold changes as its triggers (§3).
- **ADR 0021**: a **Personal Record** is derived, never authored, with no table
  and no authoring path.
- **ADR 0024**: an NP column is declined while no cost is measured (§5).
- **ADR 0025**: a **Week Replan** is a decision stored once and never re-opened
  by late data (§1.1).
- **ADR 0040 §1**: a **Training Week**'s volume target is derived, never stored,
  and seeding a block's volume is rejected (§5, Considered options).
- **ADR 0042 §5**: the emphasis label is derived from the **Quality Session
  Mix**, never authored.
- **ADR 0044 §4**: a null rate means the convention; a convention is never
  stored as a number (§7).
- **ADR 0046 §2**: a recompute that moves an athlete's numbers when their data
  did not change owes a notice, not an offer (§4).
- **ADR 0048 §1**: a hand-authored season opens with every rate unset; what a
  preset writes, it writes because the preset chose it (§7).
- **ADR 0050**: **Weekly Capacity** is derived once, then authored (§6).
- **ADR 0051 §3**: a corpus row's `archetype` is authored, because the row has
  no week to derive it from.
- **ADR 0054**: a **Threshold Estimate** is stored only when the athlete accepts
  it, and acceptance re-derives (§6).
- **ADR 0055 §1**: the rule forbids a second source of truth, not authoring; it
  bites only where the model already holds what a value describes.
- **ADR 0055 §3**: a reading is never stored, and adoption is where it becomes a
  statement (§6).
- **ADR 0056 §3**: `effectiveKg` is baked at log time with `bodyweightKg` beside
  it (§1.3).
- **ADR 0057 §6**: a display artefact never shares a field with authored state
  (§7).
- **ADR 0058**: a strength record is derived from the set row with no records
  table, and tonnage is declined.
- **ADR 0078 §5**: a cache is deferred: a real, measured saving, but three new
  invalidation paths for a tail that is not the one that hurts (§5).
- **ADR 0102 §4** (with ADR 0091 §3): the stored **Weekly Capacity** is the
  heaviest week of the first-run plan the athlete accepts, written when they
  pick a start option. Derived, then authored at the athlete's act on the option
  that contains it (§6), not seeding.
- **ADR 0110 §2**: approval writes the lowered **Season Anchors** it showed.
  Derived, then authored at the athlete's act (§6), not seeding.

## Consequences

- `GLOSSARY.md` defines **Derived, never authored** and states it as an
  invariant under Relationships; the **Session Archetype** entry names the term
  instead of "the derived-never-authored rule below".
- ADR 0040 §1 cites this ADR in one line and is otherwise unchanged. No other
  ADR is edited.
- A future data-model ADR is judged by §1: each stored value is one of the three
  cases, or a materialization that keeps its relation, states its triggers and
  explains a moved number the athlete has read.
- No code, schema, migration or dependency changes. A generic recompute-notice
  mechanism for materialized values other than a **Load Snapshot**, and writing
  an archetype at adoption (ADR 0055 §3), stay out of scope.
