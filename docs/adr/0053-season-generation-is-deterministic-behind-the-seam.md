# Season generation is deterministic, and the deterministic generator _is_ the implementation behind the model-client seam

Status: Accepted

Resolves [#456](https://github.com/leskraas/trainm8/issues/456), the build
ticket for the decision recorded on
[#386](https://github.com/leskraas/trainm8/issues/386) under map
[#434](https://github.com/leskraas/trainm8/issues/434). **Revives and amends**
[ADR 0016](./0016-ai-plan-generation.md), which
[ADR 0044](./0044-plan-outline-is-relational.md) marked superseded: the feature
returns, four of its properties are carried forward unchanged, and two of its
clauses are corrected. Builds directly on
[ADR 0051](./0051-the-catalogue-has-four-axes.md) (the corpus),
[ADR 0052](./0052-the-community-tier-ships-whole.md) (the community tier),
[ADR 0047](./0047-strength-progresses-by-anchor-and-ramp.md) (what a strength
segment requires) and
[ADR 0048](./0048-a-season-shape-is-picked-before-a-plan-exists.md) (the
shapes). Depends on the **Zone Recipe** default (#454) and the season shapes'
fitting rule (#455).

Vocabulary: the corpus is the **Catalogue**. "Library" is banned in this
neighbourhood.

## Context

ADR 0016 designed generation around a model: a hosted Claude model authoring a
typed payload, with "a deterministic stub that made it testable" on the other
side of a **model-client seam**. ADR 0044 deleted the feature — not because AI
planning was unwanted, but because generation's output contract had no target
left once `focus` went (ADR 0042) and no phase carried load (ADR 0041).

#386 reopened the question on the rebuilt manual foundation and inverted the
seam's polarity. Generation is **rules**: a **Periodization Preset** for the
shape, the athlete's own numbers for the size, and **Catalogue retrieval** for
the sessions. A model arrives later as a _second_ implementation behind the same
boundary.

Three things had to be true before this could be built, and all three landed in
this map: the corpus has rows (#451), those rows are filterable by
`archetype × phase × goalEvent × level` (ADR 0051 §3), and every cardio
**Discipline** starts on a **Zone Recipe** so a retrieved row resolves for
somebody (#454).

## Decision

### 1. One boundary produces the typed payload, and it is not inert

`app/utils/plan-generation/` holds a `SeasonGenerator` — a request type, a
payload type, and a function between them — and `DETERMINISTIC_SEASON_GENERATOR`
is the implementation behind it. The review surface, the approval step and the
provenance rendering are written against the **payload**, so the producer can be
replaced without any of the three changing.

ADR 0037's cautionary precedent (a field shipped with no consumer, unread
through an entire map) is the reason the seam ships **with** its implementation
rather than as an interface awaiting one. The seam is synchronous today: a model
implementation is asynchronous, and the return type widens the day one exists.
Widening it now would make every caller `await` a function that never suspends,
for a caller that does not exist — ADR 0037's mistake one layer up.

### 2. Deterministic means pure, not merely repeatable

Same inputs, same plan. Enforced structurally: the generator reads no clock, has
no random source (seeded or otherwise), does not mutate its inputs, and **cannot
query** — the corpus arrives as an argument. Where several corpus rows fit a
slot, the choice is an index into a list sorted by stable seeded entry id
(`stockentry_<key>`), rotated by the week and the day so consecutive weeks walk
the corpus instead of repeating one row.

That strictness is not decoration. It is what lets the approval step
**regenerate server-side** from the same answers rather than trusting a payload
the browser posted back — the rule `fitPlanToEvent` already holds for the
**Season Fit** proposal. An athlete cannot approve a season the app never
produced, and a stale preview cannot land sessions nobody was shown.

### 3. Strength is an **Unavailable Metric**, never an approximation

**No Periodization Preset carries a strength segment**, by construction:
`presets.ts` has no strength arm at all. And a `TrainingTrackSegment`'s strength
arm requires a `startWeekKey`, a `weeks`, a **Strength Goal** and a **Strength
Frequency** (ADR 0047 §3, §4, §6), none of which any preset supplies and none of
which anything else in the request implies.

So a generated plan for an Event naming strength shows **the endurance tracks
generated and the strength track empty, saying why**. It is carried as a member
of the payload (`unavailable: [{ reading: 'strength-track', discipline }]`)
rather than by the discipline's absence, because a plan that simply lacked a
strength track would be indistinguishable from one the athlete never asked for.
The surface states it **above** the season, on #437's rule that a source may
wait behind a tap and an absence may not.

Four numbers with no source is four fabrications. This is the ticket's defining
constraint and the building principle's sharpest edge.

### 4. Generation retrieves **stock rows only**

Since ADR 0052, `listCatalogue` returns **Shared Workouts** to every athlete.
Generation places none of them. An athlete browsing the Catalogue and choosing a
community session is _their_ act; trainm8 placing one on their calendar unasked
is trainm8 standing behind it, which is exactly what the **Attribution**'s
non-vouch says it does not do.

The rendering handles all four provenance kinds regardless, because a generated
session that is later forked or adopted keeps resolving through the `copiedFrom`
chain and may reach a community row.

### 5. The Citation rule is corrected to a provenance rule

ADR 0016 §2 and #456 both require that a generated session carry its
**Citation**. That sentence was written when the corpus was hypothetical and an
uncited **Stock Workout** did not exist. It does now, twice: a **Convention
Row** is sourced to coaching practice and names no publication (ADR 0051 §10), a
**Hand-Written Row** was written by trainm8 because the research counts an
archetype it never tabled (§11), and together they are about a third of the
seeded corpus. Enforcing the literal rule would silently delete a third of the
Catalogue from every generated plan — including the _only_ rows that exist for
race week.

**The rule generation holds is one step up: a session generation cannot _source_
is a session generation does not place.** Four kinds fill one provenance slot —
`corpus` (a Citation), `convention`, `hand-written`, `community` (an Attribution
plus the non-vouch) — and a fifth reading, `unsourced`, is the refusal that
keeps such a row out of a plan rather than letting it render an empty slot. The
slot is **read off the row**, never assumed to be a Citation.

This is a correction, not a loosening: nothing may claim a source it does not
have, which is the same rule the schema already enforces structurally in both
directions (ADR 0051 §4, ADR 0052 §3).

### 6. A retrieved session is placed as its source published it

Nothing rescales a corpus row to hit a week's derived volume. Stretching
Daniels' `5 × 1000 m` to `7 × 1000 m` because the week wanted more kilometres
would be editing the session and then still calling it Daniels'. The consequence
is visible rather than reconciled: the week's derived target and the sum of its
placed sessions are two different numbers, and the payload carries both.

Nothing is resolved either. A retrieved row's **Intensity Target** is copied as
authored and resolves per athlete at read time (`CONTEXT.md`, **Intensity
Target**). That is what makes ADR 0016's "no **Threshold** means no metric
target" true **by construction** here rather than by a fallback: generation
never writes a pace or a wattage, so there is none to invent.

### 7. A placed session is an ordinary session

`source: 'generated'` (the **Session Source** value ADR 0016 defined and #460
kept) plus a `targetEventId`, on a **fresh deep copy** of the Stock Workout with
`copiedFromId` pointing back at it. Three consequences, all of them rules that
already existed:

- editing week 2's Wednesday cannot edit week 3's — `Workout.sessions` is
  one-to-many, so a shared Workout would make one edit twelve (ADR 0044 §6);
- the **Citation** is _reached_ rather than copied, by walking the chain and
  never assuming one hop, so correcting a mis-cited row corrects every plan that
  used it and `retiredAt` keeps working (ADR 0051 §5, #460);
- **Session Adoption** already means the right thing: the session stays
  `generated` forever and `adoptedAt` records the takeover.

The copy goes through `copyWorkout`, **never through the Conform-backed
draft/form editor**, which drops the facets #450 added — cadence, grade,
vertical, rest form, send-off, series, load — on a round trip. Routing a
retrieved corpus row through it would strip exactly the fields the Catalogue
exists to express.

### 8. Nothing reaches the calendar unapproved

The loader previews and writes nothing — it has no transaction and no create.
One POST writes. Carried forward from ADR 0016 §5 unchanged, and now a property
of the payload's _type_: it contains no id the app minted, so it cannot be
mistaken for a written plan.

### 9. Only one of the six inputs is asked

#436 settled the six, and this build holds the ratio it settled: the shape is
pre-selected by fit, the **Season Anchor** arrives pre-filled from the athlete's
own history, the **Plan Start Week** is not a question, disciplines come from
the Event, and **Weekly Capacity** is read. The one asked outright is the
athlete's intent about themselves, because nothing in the model can read it.

That intent maps to a **level floor** for retrieval as a **stated convention**,
worded as one — the same register as the presets' `+5 %` ramp. **Nothing maps to
`advanced`**: a `level` is a floor, retrieving at `intermediate` already admits
every unscoped and beginner-floored row, and reaching the advanced-floored rows
would assert a band about somebody who only told us they are building
deliberately. Those rows stay reachable the way they always were — the athlete
browses the Catalogue and picks one.

### 10. A **Catalogue** phase comes from the block's position, never its name

Phase names are free text (ADR 0044 §4), so a name-based mapping would stop
matching the moment somebody typed "Grunntrening". The rule is structural: a
tapering block is `taper`, the first block is `base`, the last non-tapering
block is `peak`, everything between is `build`, and the **last week of the
plan** is `race-week` — a property of the week rather than of a block.

## Considered options

- **Ship the seam with a model behind it now.** Rejected — #386's whole finding
  is that the periodization judgment a model was going to author already ships
  as nine **Periodization Presets**, so the model would author what `presets.ts`
  already says, at the cost of a key, a latency budget and a dependency in the
  request path.
- **Ship the seam with no implementation, as groundwork.** Rejected on ADR
  0037's own precedent, stated in reverse.
- **Let generation place community rows.** Rejected — see §4. It would make
  trainm8 the placer of a session it explicitly does not vouch for.
- **Fill an unfillable slot with a neighbouring archetype from another phase, or
  with an easy session.** Rejected. A week silently backfilled with an easy run
  where the mix asked for a threshold session is a plan that lies about its own
  intensity distribution. The slot is stated, in the week it belongs to, with
  the archetypes it wanted.
- **Rescale retrieved sessions to the derived weekly volume.** Rejected — see
  §6. It edits a cited protocol and keeps the citation.
- **Invent a strength `sessionsPerWeek` from the athlete's availability.**
  Rejected outright; this is the fabrication the ticket exists around. The
  athlete's available days say when they _could_ lift, not how often they
  _should_, and the goal, the block length and the deload have no source at all.
- **Persist the previewed payload on approve, rather than regenerating.**
  Rejected — a posted payload is a season the app cannot re-derive, and
  determinism makes regenerating exact and free.
- **Blend the archetype preference list into one candidate pool.** Rejected: it
  would make the second-choice archetype as likely as the first, which is a
  different plan from the one the preference order describes.

## Consequences

- The **first fragment of the review surface** exists at
  `/training/plan/generate/:eventId`, reached from the shape step. It is _not_
  the review surface #437 and #439 describe — editing by exception, substitution
  granularity and the season arc as a reading instrument remain fog on the map.
- **A generated week's placed volume does not equal its derived weekly target**
  (§6). Both are shown. Reconciling them needs either a rescaling rule the
  corpus forbids or a retrieval that filters by session size, which the corpus
  does not carry.
- **Coexistence and regeneration remain unbuilt**, as #456 scoped: what a mixed
  manually-authored and generated Outline means on one Event, and precisely what
  regeneration touches. `adoptedAt IS NULL` is the eligibility predicate waiting
  for them (ADR 0016 §6 as amended by #460).
- **A `sets`-currency track cannot be generated**, since strength is declined;
  the athlete adds a strength track on the plan page afterwards, where ADR
  0047's four numbers are theirs to author.
- **`SESSION_ARCHETYPE_LABELS` moved to `labels.ts`** from the two route files
  that each held a copy. Three copies of one vocabulary is exactly what ADR 0023
  puts a label layer in the way of.
- The corpus read is a single unfiltered query per generation. It is ~140 rows
  and it is read once per preview; if the Catalogue grows past what one query
  should carry, the seam's argument is the natural place to narrow, not the
  generator.
