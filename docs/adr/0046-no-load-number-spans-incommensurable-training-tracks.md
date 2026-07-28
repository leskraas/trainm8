# No load number spans incommensurable Training Tracks

ADR 0041 split volume onto parallel **Training Tracks** and booked three costs as
accepted rather than solved: fatigue interaction between the tracks is
unmodelled, adherence ignores strength entirely, and the load-derived surfaces
are honest only for endurance. Three tickets on map #362 carry those costs
forward — **#378** (does a combined load number across tracks exist), **#379**
(does strength adherence exist, and in what currency), and **#391** (a strength
track's calendar cost in hours has no source at the guideline layer).

They are one question asked on three surfaces: **may a single number stand for
work done in two currencies that have no exchange rate?** ADR 0043 §5 answered
it for the season headline (one figure per commensurability group), ADR 0043 §7
answered it for a chart axis (one axis is one track in one currency), and ADR
0045 §6/§7 closed every conversion `sets` could have taken part in. What was
left open was the *derived* surfaces — the planned combined figure, the actual
fitness triad, the calendar-cost total, and the adherence ratio.

This ADR answers all four with the same rule, and in doing so it **supersedes a
clause of ADR 0008 and corrects a row of ADR 0043 §6**. Both corrections run the
same direction: an older document permitted a cross-modality number that newer
documents have since made impossible, and the newer documents are right. In one
case — §2 — the older permission is not merely a doc clause but **shipped
production behaviour**, and correcting it changes a number the athlete can see
today. That is stated plainly rather than buried in Downstream.

## Evidence

### Strength load is already inside CTL / ATL / TSB, and ADR 0008 put it there deliberately

#378's body sets out a "fixed premise, not open for re-litigation": that "ADR
0008's triad stays derived from actual endurance TSS only, whatever this ticket
decides". The premise does not describe the app. The code path is four steps and
there is no filter anywhere along it:

```
app/utils/load/compute.ts:138-139
  // strength (and any unknown discipline): sRPE only
  if (rpe != null) return sRPE({ durationSec, rpe })

app/utils/load/formulas.ts:102-106
  const tss = (durationSec / 3600) * rpe * 15
  return { tss, formula: 'sRPE', confidence: 'low' }

app/utils/load/snapshot.server.ts:264-271
  const tssTotal = contributions.reduce((sum, c) => sum + c.tss, 0)
  ...
  tssByDiscipline[c.discipline] = (tssByDiscipline[c.discipline] ?? 0) + c.tss

app/utils/load/snapshot.server.ts:275, 282-284
  const curve = buildLoadCurve(dailyTss, anchor)   → ctl, atl, tsb
```

`tssTotal` is **every** contribution summed, `tssByDiscipline` is a split of the
same set, and the curve is built from `tssTotal`. So a hybrid athlete's CTL, ATL
and TSB contain their lifting today, priced by Foster's `RPE × minutes × 15` at
the validity #378 itself calls weak (r 0.25–0.52).

This is not an oversight to patch quietly.
`docs/adr/0008-tss-triad-with-hr-first.md:44-45` chose it with its eyes open:

> Strength TSS via sRPE is intentionally rough and is surfaced in
> `tssByDiscipline` separately from cardio, so UI can present it differently.

"Intentionally rough" is a decision, and the second half of the sentence shows
what was intended by it: the split exists so that the UI *can* separate the two
modalities, while the total silently does not. So #378 is not a ticket with a
premise that needs checking — it is a **standing contradiction between a 2025
ADR and the two 2026 ADRs that closed the conversion it depends on**.

### The same number is already refused for a read that gates something

The repo has ruled on `sRPE`'s trustworthiness once, and ruled against it.
`docs/adr/0021-personal-records-derived-best-efforts.md:33-37`:

> **Trust gate reuses Load Confidence (ADR 0008).** "No records from
> low-confidence data" — an effort qualifies only when its Load Confidence is
> `high` or `medium`. This drops the `sRPE` hand-logged fallback (`low`) …

So an `sRPE` session may not hold a **Personal Record**, on the stated ground
that a record must "trace to trustworthy recorded telemetry" — and the same
session's `sRPE` number is admitted, unmarked, into the one figure the **Coach
card** turns into "go hard or recover?" (`CONTEXT.md`: the Coach card is "the
single daily 'go hard or recover?' answer"). The inconsistency is not that one
surface is stricter than the other. It is that the *stricter* gate sits on the
read that changes nothing and the *looser* one on the read that changes what the
athlete does today.

### `sRPE` is not a strength formula; it is the terminal fallback of every chain

Three sites in the same file reach `sRPE` from an endurance discipline:

```
app/utils/load/compute.ts:96    bike — after Coggan and hrTSS both fail
app/utils/load/compute.ts:120   run  — after rTSS and hrTSS both fail
app/utils/load/compute.ts:134   swim — after sTSS fails
```

For those three, `sRPE` is a **degraded reading of a quantity the app can also
measure properly**: the same hour of running has an hrTSS the athlete simply did
not record, and `low` confidence names exactly that gap. For strength there is
no better reading being approximated. The number is not a degraded measurement
of anything; it is the only thing there, which is a different epistemic object
wearing the same label.

The scope of any change is therefore narrow and clean.
`app/utils/load/compute.ts:59-61` already returns `null` for `'other'` ahead of
the fall-through (ADR 0015: `'other'` imports "do not contribute to TSS /
Training Load"), so the branch at 138-139 is reachable **only** for `strength`
despite its comment. Its removal touches nothing else.

### Nothing on the planned side can produce a strength load figure at all

`app/utils/load/planned-tss.ts:174-176` is explicit, and its comment already
states the reason this ADR generalises:

```ts
// strength / other: no resolvable planned intensity (actual uses sRPE, which
// has no planned equivalent).
return null
```

ADR 0045 §6's gate table closes the guideline layer too — "anything involving
`sets` — **never available** (ADR 0041)" — and §7's currency matrix gives `sets`
a row of three crosses. So the planned side of #378 has no arithmetic available
even in principle, and #378's remaining question there is purely about
presentation.

### A strength segment authors nothing that can be multiplied into hours

ADR 0043 §6 permits hours to accumulate "across **all** tracks, strength
included" as calendar cost, citing ADR 0041 §5. ADR 0041 §4 says what a strength
segment actually authors: **two Volume Landmarks plus a duration**, interpolated,
with segment length "a consequence — as long as it takes to hit systemic MRV".

There is no sessions-per-week count and no duration-per-session, so there is no
pair of numbers to multiply into a week's hours. ADR 0045 §11 closes the one
remaining route: a `WeekPattern` "carries `name` and `orderIndex` and nothing
that says which weeks it governs", so "which pattern governs week 34?" is
unanswerable from stored data. And ADR 0045's stability rule explains why no
constant could substitute: time per set varies with the lift, the rep range and
the rest interval far more than easy running pace varies between runners, so this
is not one of the places a documented convention is legitimate.

### The consumer that calendar cost exists to serve has no counterparty either

```prisma
// prisma/schema.prisma:338-339 — Training Availability
trainableWeekdays   String? // JSON array of weekday numbers 0=Sun…6=Sat
defaultTrainingTime String? // "HH:MM" 24h local time interpreted in `timezone`
```

Days and a clock time. ADR 0045 §8 already declared the fit check undelivered on
this ground for the endurance side. So even a *complete* cross-track hours total
would have nothing to be compared against, which changes what §3 below is
allowed to claim it is losing.

### Adherence's arithmetic is right; only its claim is wrong

Verified as ADR 0019 §6 describes, with no zero-fill anywhere:

```ts
// app/utils/load/adherence.ts:122-126
if (s.plannedTss == null || s.actualTss == null) continue
if (s.plannedTss <= 0) continue
totalPlanned += s.plannedTss
totalActual += s.actualTss
sessionCount += 1
```

A strength session's `plannedTss` is `null` by `planned-tss.ts:174`, so it is
skipped on both sides and #379's worked example is exact: complete every run,
skip all three gym sessions, read **100 %**. The exclusion rule is right — it is
what stops a missing telemetry file reading as a failed workout — and every
alternative to it is worse. Zero-filling the numerator would price a skipped
strength session at zero endurance TSS out of a denominator that also has to be
invented.

What is wrong is not the ratio but the sentence next to it. The figure is
*endurance* plan adherence, presented as the week's.

**Week Replan** is already modality-scoped, one layer below adherence:

```ts
// app/utils/load/week-replan.server.ts:226-231
.filter(
  (step) =>
    step.kind === 'cardio' &&
    (step.durationSec != null || step.distanceM != null),
)
```

ADR 0025 §3 states the reason in the same words this ADR needs — strength is left
alone because there is "no load model to scale".

### The ramp guard's subject was settled before this question was asked

ADR 0040 §12 fixes the guard's subject as "the **authored** numbers — a block's
ramp and its boundary step — not a week-over-week diff", and ADR 0041 §4 rules
that "a strength boundary drop is intent and is never flagged", with RP's
21→16 sets and JTS's 75→50 barbell reps as the sourced cases of a planner being
wrong about the domain if it warns. `RAMP_WARN` / `RAMP_HOT` do not appear
anywhere under `app/` — the guard is still unshipped, its constants having gone
with the prototype files #367 deleted — so §1's ruling below constrains it when
it lands rather than changing anything today.

## Decision

### 1. The planned side shows two figures side by side, never one, and the ramp guard does not change (#378)

**No planned figure spans an endurance track and a strength track.** A hybrid
athlete's plan surfaces read two figures in two currencies —
`55 → 78 km/wk` beside `12 → 21 sets/wk` — everywhere a single figure would
otherwise be tempting.

This is forced, not chosen, and by two independent routes:

- **Arithmetically.** Every candidate number needs `sets → TSS` or
  `sets → hours`. ADR 0045 §6 and §7 close both: anything involving `sets` is
  never available, and its currency matrix gives `sets` no convertible cell in
  either direction.
- **Presentationally.** ADR 0043 §7 rejects normalising a second track onto a
  shared value axis because "every choice of scaling is a claim about the
  exchange rate between km and sets, which is the fabricated conversion ADR 0041
  forbade, **smuggled in as a pixel decision**". A single combined figure is that
  claim with the pixels removed and the fabrication left in. ADR 0043 §5's rule
  is already general: one number per commensurability group, and two
  incommensurable tracks are two groups.

**The ramp guard is unchanged.** #378's third bullet asks whether a week at
unchanged endurance volume with a strength segment stepping MEV → MRV should
read as harder than the guard can see. It should not, for two reasons that both
hold:

- The guard's subject is the authored numbers of a track (ADR 0040 §12), so it
  reads each track's own progression. There is no week-over-week cross-track diff
  for it to take.
- Even if there were, ADR 0041 §4 has already ruled that a strength track's
  boundary discontinuity is **intent**. Teaching the guard to see a strength step
  would mean teaching it to warn on the one thing the domain says is deliberate.

Rejected: a combined *planned* figure marked derived, on the ADR 0043 §8 model.
§8's derived views are legitimate because the decomposition behind them is
falsifiable — the athlete can read "37.5 km easy @ 4:49/km" and say "no, I jog
5:20". A combined endurance-plus-strength figure has no derivation to show,
because the step it would have to name is the assumption ADR 0041 refused. A
`derived` marker is a promise that a derivation exists.

### 2. Strength `sRPE` leaves the triad; ADR 0008's strength clause is superseded (#378)

**Strength contributes no TSS to CTL, ATL or TSB.** The load curve is derived
from endurance contributions only, which is what #378's "fixed premise" already
believed and what ADR 0008's shipped behaviour contradicts.

The argument is short once the pieces are laid next to each other. `sRPE` applied
to a strength session **is** the forbidden conversion:

```
sRPE_tss = (durationSec / 3600) × rpe × 15
```

A strength session's `durationSec` is its clock time and its `rpe` is a
subjective intensity, so this is `hours × assumed intensity` — the exact route
ADR 0041 examined and rejected, naming its provenance: "**TrainingPeaks' only
path** for strength is hours × assumed intensity, and its own expert users
describe the result as invalid." ADR 0041's finding is stronger than "inaccurate":

> strength volume is a different quantity from endurance load, not a lossy
> version of it: there is no conversion between sets and TSS, only an assumption.

ADR 0045 §6 and §7 then closed the same door from the guideline side. So the
repo's two newest ADRs on this subject agree that no number converts strength
work onto the TSS scale — while the code, on ADR 0008's authority, does it every
time an athlete logs a gym session with an RPE.

**ADR 0008 predates both.** Under the rule that newer documentation supersedes
older, ADR 0008's strength-`sRPE` clause is superseded: the "intentionally rough"
contribution stops being rough and starts being absent. The rest of ADR 0008 is
untouched — the triad, the HR-first defaults, the per-discipline formulas, the
provenance record and the fallback chain for endurance all stand.

Three further reasons the supersession is the right direction rather than merely
the newer one:

1. **The number gates a decision.** `tssTotal` feeds CTL/ATL/TSB, TSB feeds
   `readinessFromTsb`, and readiness is the **Coach card**'s "go hard or
   recover?" answer. ADR 0010 built the whole near-term scope around that one
   number being trustworthy — "show 'building baseline' rather than a misleading
   number, per the **Unavailable Metric** principle". A metric held to a 42-day
   cold-start gate before it may speak at all should not be quietly composed of a
   quantity with r 0.25–0.52 against its own construct.
2. **The repo already refuses this number where it gates less.** ADR 0021 drops
   `sRPE` from **Personal Record** eligibility on trust grounds. Keeping it in the
   triad leaves the strict gate on the decorative read and the loose one on the
   actionable read.
3. **The direction of the error is the dangerous one.** Strength `sRPE` only ever
   *adds* TSS, so it inflates CTL and — through `TSB = CTL − ATL` over different
   time constants — biases readiness toward "go hard" for precisely the athlete
   whose extra fatigue is real but unmeasured. A fabricated number that erred
   toward caution would still be fabricated; this one errs the other way.

**What survives.** `sRPE` itself is untouched as the terminal fallback of the
endurance chains (`compute.ts:96`, `:120`, `:134`), where it *is* a degraded
reading of a measurable quantity and `confidence: 'low'` says so honestly. Only
the strength branch at `:138-139` goes. Nothing about ADR 0008's `formula` /
`confidence` provenance record changes.

**What strength load keeps.** Its separate home. The contribution is still
computed and still recorded in `tssByDiscipline`, **display-only**, never summed
into `tssTotal`. This is the half of ADR 0008's own sentence that was right: the
split existed "so UI can present it differently", and now it is the only place
the figure lives. One invariant breaks deliberately and should be named in code
rather than discovered: **`tssTotal` ceases to equal the sum of
`tssByDiscipline`** as soon as an athlete lifts.

**The honest cost, stated first rather than last.** A hybrid athlete's CTL
**falls** to its true endurance value. This is not a chart that gets slightly
tidier; it is a visible change to a number the athlete has been reading, and
possibly a large one for a lifting-heavy season. Every historical `LoadSnapshot`
needs recomputing for the curve to be self-consistent, which is the same
recompute ADR 0008 already describes for a formula change — where it also
established the posture: the system "offers to recompute historical
LoadSnapshots with the new formula but never auto-switches silently". That
posture applies here.

**The recompute is implementation and lands as its own issue, not in this ADR.**
The blast radius is every `LoadSnapshot` row plus whatever copy explains the
drop to an athlete who did not change their training. This ADR rules on what the
number means; the migration, the backfill and the explanatory copy are a separate
piece of work.

Rejected: **keep it as-is, documented as modality-mixed.** This is the cheapest
option and it is refused on the ground the app applies everywhere else. The
number is not decorative — it gates the Coach card's go-hard-or-recover answer,
and ADR 0008's own trust gate refuses a fabricated metric on a surface meant to
be acted on. Documenting a fabrication does not stop it being acted on; it only
moves the responsibility onto a reader who will not see the doc. `CONTEXT.md` is
categorical: "An **Unavailable Metric** must not be replaced with invented data."

Rejected: **offer `sRPE` as a *displayed* combined figure**, which is #378's own
suggested landing and ADR 0041's accepted cost ("defensible as a *displayed*
combined-load number and **never** as an input to CTL/TSB"). Two things have
changed since that sentence was written. ADR 0043 §7 and §5 now rule that a
displayed cross-currency figure is the same fabrication as a computed one — a
pixel decision is a decision. And on reflection the display route is *worse* than
absence, not better: a number nobody may act on, placed on surfaces that exist to
be acted on, will be acted on. It would sit beside CTL and ATL, in the same units
as CTL and ATL, and mean something categorically different. The honest form of
"your lifting also costs you" is the strength track's own figures next to the
endurance ones (§1), not a third number that averages them.

Rejected: **a second, strength-only fatigue triad** — a parallel CTL/ATL over
sets or sRPE. This is not forbidden by anything above, and it is genuinely
tempting. It is refused as out of scope rather than as wrong: it needs its own
time constants, its own validation, and its own cold-start gate, none of which
this repo has a source for, and ADR 0041 §7 already holds that making the load
surfaces *useful* for a lifter is "real product work and is deliberately not in
this decision".

**What stays Unavailable: cross-track fatigue interaction.** 50 km plus three
heavy lifting sessions is harder than 50 km alone, and after this ADR CTL/ATL/TSB
will know even less about it than before — the sRPE contribution was at least
*correlated* with the missing fatigue, however weakly. ADR 0041 accepted this
cost; nothing here recovers it, and the trade is deliberate: a weakly correlated
number inside a gated metric is worse than an honest gap beside it, because only
the gap can be labelled.

### 3. Calendar cost in hours is the endurance tracks only; ADR 0043 §6 is corrected (#391)

**ADR 0043 §6's `hours` row is corrected from "all tracks, strength included" to
the endurance tracks only.** A cross-track hours total is an **Unavailable
Metric** as soon as a plan has a strength track.

ADR 0043 §6 wrote that row on ADR 0041 §5's authority, and ADR 0041 §5 does say
"hours remain a strength track's **calendar cost**". Both were written before ADR
0045 established what a conversion into hours actually requires. Under the
newest-wins rule, ADR 0045 governs: `sets → hours` has no source at the guideline
layer, and a strength segment authors landmarks plus a duration — no sessions per
week, no duration per session, nothing to multiply. The permission was granted on
the assumption that the arithmetic existed; it does not.

The three escapes are each closed by a different document, which is why this is a
correction rather than a gap someone could fill later with effort:

| Route | Closed by |
| --- | --- |
| read the sessions | ADR 0043 §3 — guideline-level figures never read the session layer; ADR 0042 §9 — far-future weeks have no sessions |
| read the **Week Pattern** | ADR 0045 §11 — no week binding exists, so which pattern governs a week is unanswerable from stored data |
| a conversion constant | ADR 0041 forbids it; ADR 0045's stability rule says a constant is legitimate only where the ratio is stable between athletes, and time-per-set is not |

**What is lost is smaller than it looks**, and saying so is not a consolation but
the actual finding. ADR 0045 §8 established that **Training Availability** stores
`trainableWeekdays` and `defaultTrainingTime` and never a capacity
(`prisma/schema.prisma:338-339`), so the fit check this total was to feed has no
counterparty for the endurance tracks either. A hybrid athlete is not losing a
"does my week fit" answer that a pure runner has; nobody has it.

**A capacity field is not settled here.** It would serve both halves — this
correction and ADR 0045 §8's undelivered fit check — and it would need ADR 0043
§10's "no new **Athlete Profile** value" posture revisited **deliberately**
rather than by side effect. That posture was argued about conversion constants,
not about capacity, so revisiting it is legitimate; doing it inside a ticket about
strength hours would be doing it by accident. **Raised as its own issue.**

The days-against-days comparison ADR 0045 §8 named needs no conversion and
survives this correction untouched: **Quality Session Count** against the count
of trainable weekdays. It is endurance-only today for the same reason §4 is —
strength authors no session count — which is why §3's outcome would change if
#384 lands one.

Rejected: #391's option 1 (**a strength segment authors sessions per week**)
*here*. It is very likely the right answer and it is not this ADR's to give: what
a strength segment authors is #384's whole subject, and adding an authored axis to
the strength track as a side effect of a calendar-cost question would pre-empt a
decision that has Prilepin, ACSM and Issurin as live inputs. If #384 lands a
sessions-per-week axis, this correction is reversed for free and no one has to
re-argue it.

### 4. Strength adherence is a Summary Count, not a second Adherence Band (#379)

**Strength adherence exists, as a second figure in strength's own currency:
sessions completed vs planned, never routed through Planned TSS.** The endurance
ratio keeps its arithmetic and loses its claim.

**ADR 0019 §6 is not patched.** Its exclusion rule is right — a session missing
either side leaves both sums, never zero-filled (`adherence.ts:122-126`) — and it
is what stops a missing telemetry file reading as a failed workout. The defect
#379 documents is a **labelling** defect: the figure is *endurance* plan
adherence and was presented as the week's. So the fix is a name and a companion,
not an algorithm. `CONTEXT.md` already records that "adherence" spans more than
one signal; this makes the endurance ratio say which one it is, and never claim
to be the week.

**One number cannot span both tracks** (ADR 0043 §5, and §1 above). A plan with a
strength track therefore shows two figures: the endurance ratio, and the strength
count.

**The strength figure is a Summary Count, not a second Adherence Band.**
`CONTEXT.md` defines a **Summary Count** as "a truthful aggregate derived from
existing sessions, such as number of sessions" — which is exactly what
"3 of 3 gym sessions" is. An **Adherence Band** is the wrong vocabulary because
of what a band structurally requires: ADR 0019 §5 makes its thresholds
**asymmetric** on a stated principle — "the over edge sits nearer to 1.0 than the
under edge, so overreaching — the riskier failure mode — flags sooner than
undertraining". That principle is about *volume overshoot*, and this repo has no
source for its strength analogue. Worse, on the strength track the asymmetry may
well point the other way: ADR 0041 §4's landmark model treats exceeding MRV as
the failure and a *drop* as intent, so a naive re-use of the endurance cut points
would flag the domain's deliberate behaviour. A band with invented cut points is
a fabricated metric wearing a trusted vocabulary, which is the pattern ADR 0045
§9 refused when it declined to borrow **Load Confidence**'s words for a reading
that gates nothing.

Two readings are fixed:

- **A pure lifter reads "—".** ADR 0041 §7's honesty gate is unchanged: with no
  endurance track, the endurance ratio is an **Unavailable Metric**.
- **A strength track with no materialized sessions reads "—", never `0 of 0`.** A
  count needs a denominator that came from somewhere. Far-future weeks have no
  sessions (ADR 0042 §9), and a **Summary Count** is defined as "derived from
  *existing* sessions" — so with nothing materialized there is nothing to count,
  and `0 of 0` would read as a completed week.

**Week Replan stays endurance-only.** ADR 0025 §2's factor is
`max(1 / weeklyAdherenceRatio, REPLAN_MIN_SCALE)`, which inverts a **TSS** ratio
and applies the result to quantified cardio **Step Quantities**. A session
*count* has no volume semantics to invert: there is nothing continuous to scale,
and "you did 4 of 3 sessions, so do 0.75 of next week's" is not a statement about
sets. The code already agrees — `week-replan.server.ts:226-231` keeps only
`step.kind === 'cardio'` — and ADR 0025 §3 gives the reason in the right words:
strength is left alone because there is "no load model to scale". After §2 that
is now literally true rather than approximately.

Rejected: **a single adherence figure over all sessions of both tracks**, counted
rather than weighted — "6 of 9 sessions". It is arithmetically available and it
is refused: it silently prices one gym session as equal to a 3-hour long run,
which is a cross-modality exchange rate expressed as a denominator. §1's rule
does not care which arithmetic operation smuggles the rate in.

Rejected: **deriving a strength Planned TSS so the existing ratio can absorb
it.** #379 names this as its own fixed premise and it is right to: it needs the
`hours × assumed intensity` conversion ADR 0041 rejected on evidentiary grounds
and §2 above has just removed from the actual side. Adding it to the planned side
in the same ADR that removes it from the actual side would be incoherent.

### What stays Unavailable, and why

| Reading | Status | Why |
| --- | --- | --- |
| combined planned load across tracks | **never available** | `sets → TSS` has no conversion (ADR 0045 §6/§7); a shared axis or figure is a fabricated exchange rate (ADR 0043 §7) |
| strength contribution to CTL / ATL / TSB | **removed** (§2) | `sRPE` on a strength session is `hours × assumed intensity` (ADR 0041) |
| cross-track fatigue interaction | **never available** | accepted by ADR 0041; §2 does not recover it and slightly widens it |
| cross-track hours total / calendar cost | **Unavailable** once a strength track exists (§3) | a strength segment authors nothing multiplicable into hours |
| "does this week fit against Training Availability" | **undelivered for every track** | no capacity is stored (ADR 0045 §8; `prisma/schema.prisma:338-339`) |
| strength Planned TSS | **never available** | `planned-tss.ts:174-176`; same conversion |
| endurance adherence for a pure lifter | **Unavailable** ("—") | ADR 0041 §7 |
| strength count with no materialized sessions | **Unavailable** ("—"), never `0 of 0` | a **Summary Count** is derived from existing sessions |
| **Week Replan** for strength | **not offered** | ADR 0025 §2 inverts a TSS ratio; a count has no volume semantics |

Each row is a stated absence with a reason, which is the form the app already
uses. None is a placeholder for work someone should do quietly.

## Consequences

### What this sharpens and supersedes

- **ADR 0008's strength-`sRPE` clause is superseded** (§2). Strength contributes
  no TSS to CTL/ATL/TSB. The clause's second half survives and becomes the whole
  of it: the figure lives in `tssByDiscipline`, separately from cardio, and is
  display-only. Everything else in ADR 0008 stands.
- **ADR 0043 §6's `hours` row is corrected** (§3) from "all tracks, strength
  included" to the endurance tracks only. This is the hole ADR 0045's
  Consequences registered and declined to fill; it is now filled in the cheap
  direction, and reversible for free if #384 lands a sessions-per-week axis.
- **ADR 0041 §5's "hours remain a strength track's calendar cost" is narrowed to
  an aspiration.** It is true of what hours *would* mean for strength, and false
  of anything derivable at the guideline layer today. ADR 0040 §11's "hours is
  calendar cost for a strength block, not its dose" is unaffected — it only ever
  ruled out hours as *dose*, which this ADR agrees with twice over.
- **ADR 0019 §6 is confirmed, not patched** (§4). Its exclusion rule was never
  the defect; the claim beside the number was.
- **ADR 0043 §5 and §7 gain a third and fourth application.** The
  one-figure-per-commensurability-group rule now governs the derived load
  surfaces and the adherence surfaces, not only the season headline and the chart
  axis.
- **ADR 0021's trust gate is vindicated and generalised.** "No records from
  low-confidence data" becomes the narrow case of a rule §2 states broadly: a
  reading that gates a decision may not be composed of a quantity the app would
  refuse elsewhere on trust grounds.
- **ADR 0040 §12's guard scope is confirmed unchanged**, and §1 records that the
  guard is still unshipped (`RAMP_WARN` / `RAMP_HOT` appear nowhere under
  `app/`), so the ruling constrains it at landing time.

### Accepted costs

- **A hybrid athlete's CTL falls, visibly, to its true endurance value.** This is
  the price of §2 and the largest single cost in this ADR. It is a change to a
  shipped number that the athlete did not cause by training differently, and it
  needs copy that says so.
- **Every historical `LoadSnapshot` needs recomputing**, and until it happens the
  stored curve and the current rule disagree. Deliberately not scoped here.
- **`tssTotal` no longer equals the sum of `tssByDiscipline`.** An invariant a
  future reader would reasonably assume, broken on purpose; it must be documented
  at the type rather than left to be discovered.
- **Cross-track fatigue interaction is slightly *more* unmodelled than before.**
  The removed `sRPE` contribution was weakly correlated with the missing fatigue.
  §2 argues the trade is right; it does not pretend it is free.
- **The hybrid athlete gets no "does my week fit" figure** (§3) — though neither
  does anyone else, for want of a stored capacity.
- **Two figures where a product instinct wants one**, on every plan surface a
  hybrid athlete sees, plus two adherence readings in two vocabularies. ADR 0043
  §5 accepted this shape for the headline; this ADR extends the cost to the
  derived surfaces.
- **Strength gets a count where endurance gets a banded ratio**, which reads as
  less sophisticated. It is: a count is all the repo has a truthful source for.

### Downstream

- **A new issue owns the `LoadSnapshot` recompute and its copy** — removing the
  strength branch at `compute.ts:138-139`, excluding strength from `tssTotal`
  while keeping it in `tssByDiscipline`, backfilling every snapshot, and
  explaining the drop. ADR 0008's "offers to recompute … but never auto-switches
  silently" posture applies.
- **Discipline Allocation (ADR 0031) needs its own ruling**, found while writing
  §2 and not settled here. It shows "each discipline's share of the window's
  total resolvable load" (`app/routes/_home/cockpit/presenter.ts:569-581`), so
  after §2 a strength slice priced in `sRPE` would sit in a percentage pie against
  endurance TSS — a cross-modality exchange rate on a value axis, which is
  precisely what ADR 0043 §7 forbids. Either strength leaves the denominator or
  the surface stops being a share. Raised as its own issue.
- **A new issue owns the capacity field** — one question shared with ADR 0045 §8,
  serving both that section's undelivered fit check and §3's corrected row, and
  requiring ADR 0043 §10 to be revisited deliberately.
- **A second, strength-native fatigue model** is left open (§2's third rejection),
  as ADR 0041 §7 left "making those surfaces useful for a lifter".
- **#384 is the one open question left on map #362** — what a strength segment
  authors. It absorbs #381 and #387's shape half. **§3's outcome falls out free if
  #384 lands a sessions-per-week axis**: a segment that authors sessions per week
  makes strength calendar cost derivable the same way the endurance side works,
  #391's option 1 becomes available without a new argument, and ADR 0043 §6's
  `hours` row can be restored to its original wording. If #384 does not land one,
  §3 stands as the permanent answer.
- **#379's Summary Count needs a materialization source.** The count's
  denominator is planned strength sessions, which exist only once a week is
  materialized. What materializes them is #384's territory too.
- **`CONTEXT.md`** needs three entries brought in line: the **Training Load**
  triad's composition (endurance only), **Weekly Plan Adherence**'s scope
  (endurance, with a strength **Summary Count** beside it), and the calendar-cost
  wording in the **Volume Currency** area. Not edited here.

## Status

Accepted for the manual planning foundation (#378, #379, #391; parent map #362).
**Supersedes** ADR 0008's strength-`sRPE` clause and **corrects** ADR 0043 §6's
`hours` accumulation row; narrows ADR 0041 §5; confirms ADR 0019 §6, ADR 0025 §2
and ADR 0040 §12 unchanged. Extends ADR 0043 §5 and §7 to the derived load and
adherence surfaces. The `LoadSnapshot` recompute, the capacity field and
Discipline Allocation's share denominator are raised as their own issues rather
than settled here.
