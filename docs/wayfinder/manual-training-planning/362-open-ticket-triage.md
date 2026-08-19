# Triage of the open tickets on map #362

A review of the nine open children of
[map #362](https://github.com/leskraas/trainm8/issues/362), asked for because
the map felt like it was breeding tickets rather than closing them.

This note records the **investigation**, not its execution: the verdicts below
are recommendations reached before anything was acted on. They were then carried
out in the same pull request — ADR 0046 resolved #378, #379 and #391, #380's
research landed as its own asset, #371 was answered, #375 was closed out of
scope, and #381 and #387 were merged into #384. Where a verdict here and the
outcome differ, the outcome is the record; the one place they do is #380, whose
findings went further than this note anticipated.

## The count

Sixteen issues are open in the repo. **Fourteen of them trace back to this
map**: the map itself, its nine open children, and four standalone issues raised
out of its resolutions (#377, #383, #390, #392) plus #386. Only #337 (social
layer) is unrelated.

Of the nine open children, **six are the strength track** — #379, #380, #381,
#384, #387, #391 — all descended from ADR 0041's decision to make strength a
peer **Training Track**. The other three are #371 (presets), #375 (template
levels) and #378 (combined load).

## Diagnosis

The map is not badly kept. Two structural things produced the pile-up.

**1. ADR 0041 opened a second modelling area and the map absorbed it.** Making
strength a peer track was right, and it is what lets a lifter author a plan
without migration. But a strength track has its own volume granularity, its own
landmark storage, its own intensity vocabulary and its own calendar cost — four
decisions plus a research ticket, none of which the endurance side needed. The
map picked them all up because they were discovered on its route, not because
its destination requires them.

**2. Several tickets predate the ADRs that answered them.** #371 and #375 were
written against the #366 prototype, before ADR 0042 removed `focus`, ADR 0043
locked currency to the track, ADR 0044 made a phase's name free text and stored
`WeekPattern` relationally, and ADR 0045 settled the conversion. Three of #371's
four bullets have dissolved since.

The decisive test for every ticket below is the map's own destination: _nothing
left to decide before implementing the manual planning surface._ Not _nothing
left to decide about training planning_.

## Verdicts

| Ticket                             | Verdict                                                          |
| ---------------------------------- | ---------------------------------------------------------------- |
| #371 presets                       | **Answerable now** (AFK)                                         |
| #375 template levels               | **Out of scope**                                                 |
| #378 combined load                 | **One question to the owner** + one spin-off                     |
| #379 strength adherence            | **Forced, and inside the existing out-of-scope boundary**        |
| #380 RP landmark research          | **Answerable now** (AFK); re-point at #387, unblocks #381        |
| #381 volume granularity            | **Merge into #384**                                              |
| #384 what a strength block authors | **The one genuine owner decision**                               |
| #387 landmark storage + ratchet    | **Half merges into #384**, half answerable now                   |
| #391 strength calendar cost        | **Out of scope** (a corollary, plus a one-clause ADR correction) |

Nine open tickets reduce to **one decision for the owner**, two that can be
answered from evidence already in the repo, three closed as out of scope, and
two merged.

### #371 — the built-in periodization presets · answerable

Three of four bullets are settled by later decisions.

- **Vocabulary tension: dissolved.** ADR 0044 §2 makes a phase's `name` free
  text, and nothing branches on it, so "Accumulation" stores exactly as well as
  "Base". What is left is copy on a preset card.
- **Relation to Plan Template: settled.** ADR 0044 records #371 as **code
  constants** and offers an optional nullable `presetKey` if provenance is ever
  wanted. There is no storage question.
- **Default numbers: re-specified out from under the ticket.** A preset may
  carry ordered `name` + `weeks` + `rhythm` + `tapers` per phase, and per
  endurance segment `ramp`, `boundaryStep` and a **Quality Session Mix**. It may
  _not_ carry currency (ADR 0043 §2), anchor volume (ADR 0040 §6),
  `startWeekKey` (ADR 0044 §3), `focus` or `weeklyLoadHours` (both deleted).

Only _which shapes ship_ is live — and it is sharper than when it was written.
The [#363 note](363-training-periodization.md) deferred block and reverse
periodization for **two** reasons: thin evidence, and "neither maps to the
current base/build/peak Outline". ADR 0042 §1 and ADR 0044 §2 voided the second.
The deferral now rests on evidence alone, which means re-adding them later is a
constants-only change.

Defensible answer: ship the three Friel-family shapes (classic 3:1, masters 2:1,
big base / pyramidal), keep phases fixed-length, and let a plan that ends before
or after the Event **show** that rather than stretch (ADR 0044 §3).

### #375 — how many levels a reusable template covers · out of scope

ADR 0044 §6 stored `WeekPattern` on the Plan Outline and stated the argument
outright: the Outline's shape at the phase and track level is **invariant under
every answer #375 can give**. `CONTEXT.md` and ADR 0039 §3 both keep **Plan
Template** a _future_ entity.

Deciding this now is designing storage for a feature nobody is building, against
a schema that would not change either way. Worth harvesting on the way out, into
the `Plan Template` entry in `CONTEXT.md`:

- template-carryable = relative phases + endurance segments + mixes + week
  patterns; never dates, currency or anchor volume (ADR 0044 §3's geometry
  rule);
- composition is **inline, never by reference** — apply-then-own bans the link,
  and the prototype stored blocks inline anyway;
- season and block are one payload at different arity (a block template is a
  season template of length 1);
- the week level already lives on the Outline, so at most two levels remain.

### #378 — a combined load number across tracks · one question

The **planned** side is forced and needs no grilling: ADR 0045 §6/§7 close every
`sets` conversion, and ADR 0043 §7 forbids the display route because any scaling
is a fabricated exchange rate "smuggled in as a pixel decision". Two figures,
never one. The ramp guard is likewise forced unchanged (ADR 0040 §12 scopes it
to authored numbers per track).

The **actual** side is where this ticket has a real problem, and it is not the
one the ticket thinks. Its "fixed premise, not open for re-litigation" says ADR
0008's triad stays derived from endurance TSS only. That is false today, and it
is false _deliberately_:

- `app/utils/load/compute.ts:138-139` — "strength (and any unknown discipline):
  sRPE only";
- `app/utils/load/formulas.ts:102-106` — `sRPE` returns `confidence: 'low'`;
- `app/utils/load/snapshot.server.ts` sums every contribution into `tssTotal`,
  which feeds CTL/ATL/TSB;
- `docs/adr/0008-tss-triad-with-hr-first.md:44` — "**Strength TSS via sRPE is
  intentionally rough** and is surfaced in `tssByDiscipline` separately from
  cardio, so UI can present it differently."

So a hybrid athlete's fitness curve already contains lifting, at sRPE's weak
resistance-training validity (r 0.25–0.52). This is not a bug to patch — ADR
0008 chose it with its eyes open. It is a **contradiction between #378's premise
and a standing ADR**, and resolving it is a product call, not a correction. It
also has a blast radius (every historical `LoadSnapshot` would need
recomputing), which is why it belongs in its own issue rather than inside a
planning-map ticket.

### #379 — strength adherence · forced, and already out of scope

Verified against the code: adherence genuinely excludes rather than zero-fills
(`app/utils/load/adherence.ts:122-126`), a strength session genuinely cannot
have Planned TSS (`app/utils/load/planned-tss.ts:174`), and Week Replan's
session selection is source-agnostic but **not** modality-agnostic — it keeps
only `step.kind === 'cardio'` (`app/utils/load/week-replan.server.ts:226-231`).
The ticket's 100 % worked example is exact.

Almost every sub-question is then forced: the currency is sessions completed vs
planned (its own premise, and ADR 0041's accepted cost); one number cannot span
both tracks (ADR 0043 §5); ADR 0019 §6 is not patched; Week Replan stays
endurance-only, because ADR 0025 §2's scale inverts a _TSS_ ratio and a session
count has no volume semantics to invert; a pure lifter reads an **Unavailable
Metric** (ADR 0041 §7).

What remains is presentation — a second **Adherence Band** with invented cut
points, or the existing **Summary Count** vocabulary ("3 of 3 gym sessions"),
which needs no thresholds this repo has a source for. The map already rules
lifter-facing load surfaces out of scope, and this ticket's third bullet ("what
does a week read when the athlete has only a strength track") is that exclusion
verbatim.

### #380 — verify the RP per-muscle landmark tables · answerable

The finding is effectively pre-determined, and the reference file already
contains it: no **primary** source publishes per-muscle MV/MEV/MAV/MRV tables.
What is citable is generic-per-muscle ranges — ACSM 2026's "≥10 weekly sets per
muscle group", MEV "generally 8–12", MAV described explicitly as a zone rather
than a point — plus Pelland's fractional set counting (direct 1.0 / indirect
0.5). RP's per-muscle tables are one vendor's product on a host that returns
429/403, and those fetch failures are already recorded.

Two corrections while there: the dependency points the wrong way. #380's output
matters as **provenance for seed values**, so it blocks **#387**, not #381 — the
granularity choice can be made knowing that no vendor-independent table exists.

### #381 + #387 + #384 — one decision, not three

They are the same question wearing three hats: **what does a strength segment
author?**

- #384's option B ("author a goal — hypertrophy / strength / power — from which
  a landmark pair _and_ an intensity band both derive") would remove the
  landmark pair from the segment entirely, which answers #381's first two
  bullets outright.
- #381's maximal-strength bullet _is_ ACSM's strength/hypertrophy/power
  trichotomy from #384 under another name.
- #387's shape half ("scalar or vector") is 100 % determined by #381.

So: retitle #384 to _what a strength segment authors_, merge #381 and #387's
shape half into it, and carry forward one migration risk the merged ticket owns
— described below.

#387's other two halves are answerable from repo precedent, not owner taste. The
**ratchet** is athlete-authored, pre-filled from logged sets with the derivation
shown, stored as dated rows in the existing `ThresholdEvent` idiom
(`source: manual | inferred | auto` + `effectiveAt`) — never live-derived,
because ADR 0040 §6 already refused to derive the **Season Anchor** from
imported activity, so a plan cannot mutate from background data. **Seeding** a
first-time lifter is #380's output.

### #391 — strength calendar cost · out of scope

A cross-track hours total is a _displayed derived figure_, not an authoring
input — squarely the map's existing "Lifter-facing load surfaces" exclusion. Its
honest default is already implemented and already ruled (ADR 0045 §6: anything
involving `sets` is never available). And per ADR 0045 §8 the question it exists
to answer has no counterparty: **Training Availability** stores
`trainableWeekdays` and `defaultTrainingTime`, never a capacity — so even a
complete hours total has nothing to be compared against.

It is also a corollary rather than a decision: if #384 lands a sessions-per-week
axis, option 1 falls out free; if it does not, ADR 0041's ban forces option 2.
What genuinely remains is a **one-clause correction to ADR 0043 §6** ("all
tracks, strength included" → the endurance tracks only), which should ride along
with #384's ADR. The capacity-field half is a separate product question shared
with ADR 0045 §8.

## Findings the review turned up on its own

**1. A latent trap in the strength derivation.** `weekTarget` in
`app/utils/plan-outline/derive.ts:244-294` has **no strength branch** — its
`TrackSpec.segments` is typed `EnduranceSegmentSpec[]`. The honest `null` for a
strength track is imposed one layer up, in the adapter
(`app/utils/plan-outline/from-rows.ts:96-97` filters to `kind === 'endurance'`,
and `:118-128` blanks all targets for non-cardio disciplines). Call `weekTarget`
directly with a strength track and it returns `anchor.value × roleFactor(...)` —
a fabricated number, with a recovery cut applied from the phase rhythm that a
strength track is documented to ignore entirely. The guard belongs in the
derivation, not only in the adapter. Verified by reading both files.

**2. #387's code claim is wrong as written.** It says "`weekTarget` in
`app/utils/plan-outline/derive.ts` returns null for a strength track because
there is no MEV or MRV to interpolate between." It does not; see above. Worth
correcting in the ticket body so the next agent does not go looking in the wrong
file.

**3. ADR 0044 §1's no-migration claim holds, with one hole.** No Outline table
stores a landmark _number_, so if landmarks land on the athlete the Outline
needs no migration — verified against `prisma/schema.prisma`. But #381's own
framing ("a single scalar cannot express _quads at MRV, chest at MEV_") is a
statement about the **plan**, not the athlete. Per-muscle _plan_ targets would
need a child table on `TrainingTrackSegment` and would drop
`fromLandmark`/`toLandmark`. That is the one outcome that forces Outline DDL,
and the merged #384 should own it explicitly.

**4. Strength is fully stored and entirely unread.** `TrainingTrackSegment`
carries `startWeekKey`, `weeks`, `fromLandmark`, `toLandmark`, `deloadCut` and
`deloadWeeks`, and the migration's CHECK makes the landmarks **optional** — a
strength segment is valid with neither. No application code reads any of them
yet. This is why none of the six strength tickets blocks the authoring surface:
every authoring input already has a column, and "sets → Unavailable" is already
both the code's behaviour and ADR 0045 §6's ruling.

**5. Both #366 prototype branches still exist on the remote**, but their
template payloads are stale in two fields each — every template carries `focus`
(deleted by ADR 0042) and absolute `baseHours` / `weeklyLoadHours` (deleted by
ADR 0040 §1/§6). ADR 0040's Consequences already names
`SEASON_TEMPLATES.baseHours` as a defect. Anything reacted against on those
branches needs that read past.

## What is left for the owner

1. **#384 (merged) — what does a strength block author?** A volume target and an
   intensity band as separate axes, or a _goal_ from which both derive? This is
   the one question in the pile that evidence cannot settle, because it is a
   question about the authoring surface's feel. A prototype rendering both forms
   side by side is the right instrument.
2. **#378 — strength sRPE is already in CTL/ATL/TSB.** Keep it (rough beats
   blind, documented as modality-mixed at low confidence), or make the triad
   genuinely endurance-only and recompute history? Worth seeing the two curves
   before choosing; the difference may be small enough to make it a
   non-question.
3. **Two spin-offs to raise outside the map**, if the answers above call for
   them: the sRPE-in-CTL decision, and whether **Training Availability** grows a
   capacity field (which ADR 0043 §10's posture on new fields says should be
   revisited deliberately rather than by side effect).
