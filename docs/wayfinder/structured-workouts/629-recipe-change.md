# 629 — Zone-recipe change and future stamped days

Analysis for [#629](https://github.com/leskraas/trainm8/issues/629) on map #600.
Code references are to `main` at `ed64839` (2026-10-20). Wayfinder references
are to `origin/research/structured-workouts` (`f9cdaff`). It builds on #602 (the
reader), #606 (stamped shapes), #607 (zone words, reading order, OLT I-3 = zone 4)
and #627 (stored codes on Stryd and css-3).

## Answer

- **The real defect is that a stored zone label does not say which recipe it is
  a label of.** `{kind:'zoneLabel', label}` has no recipe (`workout-schema.ts:104`),
  and it resolves by exact match against the athlete's *current* recipe
  (`zones/resolve.ts:300-318`, `:366-392`). After a switch, a label either goes
  hatched or, worse, **resolves silently to a different zone**: Friel `Z4` is
  Stryd `Z4` (zone 5), and css-3 `Z3` (zone 4) is css-5 `Z3` (zone 3). The #607
  reading rules cannot detect either case.
- **Fix it at the source, the way `powerPct.ref` was fixed.** Add an optional
  `recipe` to `zoneLabel` (`workout-schema.ts:126-134` is the precedent).
  Every writer of a band code stores the recipe it was picked from. The reader
  gets a new rule 0: a label from another recipe is read through **its own band's
  declared zone**, then `bandForZone` on the current recipe, with provenance
  `convention`. Nothing is rewritten. This is the recipe the athlete wrote in, so
  it is part of what was authored, and map decision 2 holds.
- **Q1: generated, unadopted future days are re-laid on a recipe change.**
  A day is re-laid only if it is still exactly what `stampedShape` would have
  laid under the old profile. Everything else is read through (Q2). Translating
  in place would lose the intended zone where the old recipe substituted (a css-3
  tempo day is stored as `Z3`, which declares 4). It would also keep old captions
  and old km splits on a day that is still the machine's.
- **Q2: adopted and athlete-authored future sessions are never rewritten and
  get no notice.** They read through the declared zone of the recipe they were
  written in. Legacy labels with no recipe are **pinned to the old recipe at the
  moment of the switch**, so they keep the zone the athlete was looking at.
- **Q3: no Load Recompute Notice.** ADR 0006 (#454 amendment) already decides
  this: the athlete made the switch, so the picker owes the consequence *before*
  they act. Also, no CTL moves, because actual TSS never reads a recipe, and the
  notice record is CTL-shaped (`recompute-notice.server.ts:18-28`). The picker
  sentence gains one clause about upcoming plan days.
- **Past sessions: storage stays untouched; derived numbers do not.** The
  re-lay gate never touches a trained or past session. But every past session's
  range, Planned TSS and Adherence Band is already re-resolved on a switch
  (`planned-tss.server.ts:208-221` and `workout.server.ts:1831-1848` have no
  date filter). That is by design (ADR 0006), and the picker says so
  (`labels.ts:6474-6475`). With the pin, the *zone* of a past step no longer
  moves. Only its range moves, into the new recipe's channel.

## 1. Re-stamp or translate generated, unadopted future days

### What the code fixes

| Fact | Where | Consequence |
|---|---|---|
| A recipe switch goes through `setDisciplineThresholds`. It writes `zoneSystem` and `zoneSystemSource: 'athlete'`, and no ThresholdEvent | `athlete.server.ts:241-258`, `:35-38` | The hook point exists, and `existing` (the old row) is in hand at `:231` |
| After every save, the cached ranges and then Planned TSS are recomputed for **all** sessions | `athlete.server.ts:314-318`, `workout.server.ts:1831-1848`, `planned-tss.server.ts:208-221` | Repricing on a switch is already free. Only the structure question is open |
| The settings form resubmits the current recipe on every save | `routes/settings/training/index.tsx:285`, `:166-167` | A trigger must compare `existing.zoneSystem !== zoneSystem`. "Submitted" does not mean "changed" |
| A stamped day stores the recipe's band, `bandForZone(recipe, z)`: the first band declaring z, else the nearest, with `substituted` | `volume-conversion.ts:482-504`; 606 §2.2 | On css-3, intents tempo (3) and vo2max (5) are both stored as `Z3`, which declares 4. A read-through after a switch to css-5 gives zone 4 for both. **The intended zone survives only in `intent`** |
| A km-track day's flank and work distances use the recipe-stated easy ratio when the anchor is a pace, else `EASY_PACE_RATIO` | `volume-conversion.ts:1141-1153`; 606 §2.3 step 3 | Daniels → OLT changes the km split of a day, while the day still totals its share |
| The machine may only touch scheduled, untrained, machine-owned sessions | `plan-outline/week-sessions.server.ts:41-46`, `session-ownership.ts:45-50` | The gate already exists and is shared |
| The Session Nudge, Juster and Week Replan rewrite machine-owned days **in place without adopting** | `load/session-nudge.server.ts:120-163` (sets intent `endurance`), `juster.server.ts:11-16`, `load/week-replan-proposals.server.ts:606-614` | "Unadopted" does not mean "still the stamp's output". A blind re-stamp would undo an ease or a softening, and Juster's *Angre* would then refuse |
| A week-level relay exists, but it starts at the first **unbegun** week and replaces sessions, giving them new ids | `plan-outline/open-ended.server.ts:499-513`, `:535-597` | It is the wrong tool here: it misses this week's remaining days and churns ids |

### Decision

**Re-lay, narrowly, in place.** When `zoneSystem` actually changes for a
discipline:

1. **Select** that discipline's sessions where `REPLACEABLE_SESSION` holds,
   `planOutlineId IS NOT NULL` and `scheduledAt` ≥ the athlete's local today.
2. **Identity test (pure).** Rebuild `stampedShape({ discipline, currency,
   zone: intentToZone(intent), share: stored total, recipe: OLD, paceSource:
   current })` (`session-profile.ts:218`). If it equals the stored structure,
   the day is still the stamp's own output, so lay it again with the **new**
   recipe. Keep the session id, date, source and status, and swap the Workout,
   as 606 §5's job does. If it differs (eased, softened, Juster'd, a fixed or
   shaped day copied from the pattern, or the pace source has moved since), leave
   it. The reader reads it correctly anyway (§2).
3. Run it **before** `recomputePlannedTssForUser`, in the same fire-and-forget
   chain (`athlete.server.ts:314`), so one Planned TSS pass sees the new shapes.

Re-laying a replan-softened day at its stored (softened) share is exactly #620's
rule ("scaling a generated day re-runs this shape at the new share"). So such a
day passes the identity test once #620 lands, and is re-laid correctly.

**Why not translate in place:** it is lossy (the css-3 case above). It would
leave a machine day captioned in a recipe the athlete just left (607 D2 shows
the code in the popover). And it fixes only labels, not km splits. **Why not
the relay:** it starts next week and churns ids (table above). **Why the
identity test rather than a marker column:** `stampedShape` is pure, so
"would the stamp have written exactly this?" is decidable with no schema and no
new state. A false "no" is always safe, because §2 still reads the day right.

## 2. Adopted and athlete-authored future sessions

### Where codes come from, and what a switch does to them

Writers of `zoneLabel` today:
- the editor chip, which writes the **current recipe's** band codes
  (`__intensity-popover.tsx:126-128`, `:220`);
- the writing line (`workout-sentence.ts:627`, canonical `Z${zone}`);
- the day stamp (`day-stamp.ts:45`, canonical `Z2`);
- the eased prescription (`load/eased-prescription.ts:91-98`, a recipe label);
- the empty-state seeds (`__empty-state.tsx:67-68`, words such as `easy` and
  `threshold`).

After #607 and #627, the writing line and the day stamp store **words**, which
collide with no recipe. So the codes left in storage are the editor's, the
#606 stamp's, the eased prescription's and legacy rows.

Pairs an athlete can switch between, and what an unqualified code does under
#607's reading order (exact band → synonym → `z1…z7` → hatched):

| Switch | Label | Old zone | New reading | Verdict |
|---|---|---|---|---|
| `friel-hr-5-run` → `stryd-run-power-5` | `Z2` / `Z4` | 2 / 4 | exact Stryd `Z2` / `Z4` → **3 / 5** | **silent shift** (`recipes.ts:123-141` vs `:319-339`) |
| `stryd` → `friel-run` | `Z1` / `Z3` | 2 / 4 | Friel `Z1` / `Z3` → **1 / 3** | **silent shift** |
| `stryd` → `daniels` / `olt` | `Z3` | 4 | rule 3 → zone 3 → `M` / `I-3`(4 after #607) | silent shift on Daniels |
| `css-3` → `css-5` | `Z3` | 4 | exact css-5 `Z3` → **3** | **silent shift** (`:369-373` vs `:436-440`) |
| `daniels` → `friel` / `stryd` / `olt` | `T` | 4 | no band, no synonym → `unreadable-target` | hatched (honest, but lost) |
| `olt-*` → anything else | `I-4` | 4 (5 after #607) | not a synonym → hatched | hatched |
| `norwegian` → `daniels` | `sub-T` | 4 | not a synonym → hatched | hatched (`:272-276`) |
| `coggan` ↔ `friel-bike`, `daniels` ↔ `norwegian` (shared labels) | `Z1–Z5`, `E M T I R` | same | same | safe |

The silent rows matter most. The #602 contract is "unknown is `unavailable`,
never wrong", and this breaks it. The reader cannot repair it, because nothing
stored says which ladder `Z4` was on.

### Decision

**A. Qualify codes.**
```ts
z.object({ kind: z.literal('zoneLabel'), label: z.string().min(1),
           recipe: ZoneRecipeIdSchema.optional() })
```
- **Absent** means legacy: #607's reading order, unchanged.
- **Writers that store a band code also store `recipe`:** the editor chip, the
  #606 stamp (`bandForZone` already holds the recipe), and the eased
  prescription once #627 moves it to `bandForZone`. Words never carry one.
- This is the `powerPct.ref` pattern (`workout-schema.ts:126-134`):
  - it is optional, so no stored row or literal moves;
  - it exists because one number meant three things.
  - The GLOSSARY already justifies `ref` with "66 % of MAP and 66 % of FTP are
    different watts". `Z2` of Friel and `Z2` of Stryd are different zones.

**B. Reader rule 0** (before #607 rule 1). If `recipe` is present and differs
from the athlete's recipe:
1. Find the label's band in **its own** recipe and take its declared `zone`.
   An off-axis band (Daniels R, Stryd Z5) takes 5 by 607 D3's convention.
2. Get the current band with `bandForZone(current, zone)`. Range, `zone`,
   Planned TSS and colour all come from that band.
3. Provenance is `convention`. When `bandForZone` substitutes, that is said as
   for the stamp (ADR 0045 §3).

Same recipe means #607 rule 1 with `authored`. An unknown recipe id falls to the
legacy rules.

**C. Pin legacy codes at the switch.** In the transaction that changes
`zoneSystem`, and only when it changes:
- Add `recipe: OLD` to every unqualified `zoneLabel` step whose label is an
  exact band of the old recipe.
- This covers the athlete's session Workouts (the same query as
  `workout.server.ts:1831-1848`, past and future alike) and their Week Pattern
  day Workouts (`schema.prisma:1652-1655`), which are copied into every future
  stamp.
- Words and non-matching labels are left alone.
- The pin keeps the reading the athlete had on screen the moment before. A
  `recipe` field is not a number, and the label is untouched, so this bakes
  nothing (GLOSSARY *Intensity Target*: "a zone label stays a zone label").
- `zoneSystem` has no history (ADR 0006 Revisit), so the switch is the last
  moment the old ladder is known. After it, the information is gone.
- **#627's word rewrite must run first**, so a writing-line `Z4` on Stryd is
  not pinned as Stryd `Z4`.

**D. No notice, no rewrite.**
- An adopted or authored session reads through rule 0 with a correct zone and
  a range on the new channel. Nothing is unavailable, so #602 has nothing to
  put in `notices`. Rewriting would replace what the athlete wrote.
- Display, from 607 D2:
  - The word (Terskel) is primary everywhere.
  - A chip shows a code **only when the code's recipe is the athlete's current
    one**. That is D2's own condition ("where the athlete's own recipe is the
    subject"). Otherwise the chip shows the word, so a Friel `Z4` never shows
    as `Z4` to a Stryd athlete, where it would mean Hardt.
  - The popover selects the current band and may caption the original
    ("skrevet som Z4 i Friel").
- Catalogue copies are corpus words (606 §2.1 point 2) and need nothing.

## 3. Load Recompute Notice

**None.** This is decided three times over:
1. **ADR 0006, #454 amendment:** "An athlete switching recipes in the picker
   also owes no notice … What they are owed is the consequence stated before
   they act". The GLOSSARY *Zone Recipe* entry says the same.
2. **No Load Snapshot moves.** Actual TSS never reads a recipe (ADR 0006,
   #444/#447 amendment), and the only recipe readers in `load/` are Planned TSS
   and the eased prescription. The `recomputeLoadFrom` that fires on every save
   (`athlete.server.ts:286-305`) recomputes CTL that does not change.
3. **The record cannot describe it.** It requires `ctlBefore`/`ctlAfter`
   (`recompute-notice.server.ts:18-28`), and its only kind is
   `strength-left-the-triad` (`recompute-notice.ts:9`).

**Owed instead:** a picker sentence that names the re-lay. Today it says only
that logged sessions are re-read (`labels.ts:6474-6475`). Append: *"Øktene
planen har lagt fremover, og som du ikke har endret, legges på nytt i den nye
skalaen."* (Upcoming plan sessions you have not changed are laid again on the
new scale.) That is the "consequence stated first".

## ADR amendments (draft text)

**ADR 0006 — Amendment (#629): a zone label names its ladder.**

> A stored `zoneLabel` that is a recipe band code carries the id of the recipe it
> was picked from (`recipe`, optional, as `powerPct.ref`). A code means a band
> only together with its recipe: Friel's `Z4` is threshold, while Stryd's `Z4` is
> above it. A label from a recipe the athlete is no longer on is read through
> that band's declared **Training Zone** into the current recipe (`bandForZone`),
> with provenance `convention`. It is never rewritten. When an athlete switches
> recipe, unqualified codes that are bands of the old recipe are pinned to it in
> the same transaction. `zoneSystem` has no history, so the switch is the last
> moment the old ladder is known. Words carry no recipe and need none. A switch
> still owes no Load Recompute Notice (#454 amendment). The picker states, before
> the switch, that logged sessions are re-read and that unchanged upcoming plan
> days are laid again.

**ADR 0091 — Consequences, added (after #606's amendment).**

> A stamped day is a pure function of the plan and the **Discipline Profile**.
> When the athlete changes **Zone Recipe**, each non-past, machine-owned,
> untrained day that is still exactly what the stamp laid under the old recipe is
> laid again in place under the new one. Its id, date and source are kept. A day
> the app or the athlete has changed since (eased, softened, Juster'd, adopted) is
> left as it is and read through its labels' declared zones.

**GLOSSARY *Intensity Target*, add:** "A band code is stored with its **Zone
Recipe** (`Z4` alone is three different zones across the shipped recipes). A
code from another recipe is read through its declared zone."

## Owner choices

None. Every question resolved from code and from settled decisions:
- Re-lay vs translate: the substitution loss and km splits decide it.
- Read through vs notice: #602's "never wrong" rule and ADR 0006's
  no-notice-for-the-athlete's-own-act decide it.
- Notice: ADR 0006 #454 and the CTL-shaped record decide it.

## Fog / new tickets surfaced

- **New ticket (ready-for-agent, in #602's release, after #627):** `zoneLabel.recipe`
  qualifier, reader rule 0, writers (editor chip, #606 stamp, eased prescription),
  and the switch-time pin (§2 A–C). It needs a test per silent-shift row in the §2
  table.
- **New ticket (ready-for-agent, after #606):** re-lay unchanged generated days
  on a recipe change (§1), plus the picker sentence (§3). It reuses #606 §5's
  in-place swap and adds the identity test.
- **Suspected bug (verify in a browser):** the training-settings form always
  submits `zoneSystem` (`index.tsx:285`), and `setDisciplineThresholds` then
  writes `zoneSystemSource: 'athlete'` whenever it is present
  (`athlete.server.ts:254-256`). So saving only an FTP on a defaulted profile
  probably flips "Valgt for deg" to "Ditt valg". The test
  `index.test.ts:400-432` posts without `zoneSystem`, so it cannot catch this.
  Fix: write the recipe only when it differs from `existing.zoneSystem`. The
  #629 trigger needs the same comparison.
- **#607's I-3 → zone 4 is an in-place recipe definition change.**
  - After it, `bandForZone(olt, 4)` is `I-3`, and `I-4` declares 5.
  - A stamped `I-4` written as zone-4 work before the change would read Hardt
    after it.
  - Ordering in the release: the `recipes.ts` edit lands **before** #606's
    backfill job.
  - Generally, any future defect fix to a recipe's declared zones should fire
    §1's re-lay for every athlete on that recipe.
- **`zoneOverrides` is keyed by band label** (`resolve.ts:375-392`,
  `volume-conversion.ts:587-603`), so it is recipe-ambiguous too. It has no
  write path today (ADR 0006 #454). When it gets one, a recipe switch must
  clear or scope it.
- **Threshold changes also move km-track stamped days.** Work and easy speeds
  come from threshold pace and the ride window (`volume-conversion.ts:1099-1153`).
  The same identity-tested re-lay could run on a threshold change. That is out
  of scope here, and stale km splits are a smaller harm than a wrong zone.
- **Past sessions:** confirmed that storage is untouched (the
  `REPLACEABLE_SESSION` gate plus the non-past filter). Their derived range,
  Planned TSS and Adherence Band are re-read on every switch by design
  (ADR 0006, four un-dated paths). The pin stops their *zone* from moving.
  Nothing more is proposed.
