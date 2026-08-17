# A threshold may be proposed from the athlete's own history, and its provenance is two axes

Status: Accepted

**Amends** [ADR 0005](./0005-athlete-profile-and-thresholds.md) on two counts:
it replaces `ThresholdEvent.source: manual | inferred | auto` as the _only_
provenance, and it finally builds the Tanaka fallback ADR 0005 §44 promised.
Builds on
[ADR 0050](./0050-training-availability-carries-a-derived-then-authored-weekly-capacity.md)
(derived-then-authored), [ADR 0033](./0033-detection-confidence-honesty-bar.md)
(the confidence vocabulary) and
[ADR 0053 §2](./0053-season-generation-is-deterministic-behind-the-seam.md) (a
pure engine behind an impure shell). Names
[ADR 0020](./0020-activity-stream-downsampled-telemetry.md) as the thing that
should be superseded, and works around it honestly in the meantime.

Research:
[`athlete-profile-from-history.md`](../research/athlete-profile-from-history.md),
[`zones-and-thresholds.md`](../research/zones-and-thresholds.md) §4 and §5.
Destination:
[`out-of-the-box/destination.md`](../wayfinder/out-of-the-box/destination.md)
stage 1.

## Context

The owner's verdict on map #434 was that the app has a great deal of machinery
and gives an athlete almost nothing out of the box. The review
([`434-implementation-review.md`](../wayfinder/plan-builder-mobile-ux/434-implementation-review.md))
found the reason, and it is not a missing feature — it is a missing **number**.

A **Catalogue** row's **Intensity Target** is portable by design and is
deliberately never resolved at write time (ADR 0053 §6); it resolves per athlete
at read time, against a **Threshold**. And a threshold existed only if the
athlete typed one in:

- `ThresholdEvent.source` reserves `'inferred'` and `'auto'`, and the single
  write path (`athlete.server.ts:178`) hard-codes `'manual'`. **Neither value
  has ever had a writer.**
- There is no FTP estimator, no LTHR estimator, no threshold-pace estimator and
  no max-HR estimate anywhere in the repo.
- ADR 0005 §44 promises Tanaka (`208 − 0.7 × age`) and
  `structure-detection/classify.ts:227` defers to it as _"computed upstream"_.
  Nothing upstream computed it, so `AthleteProfile.birthdate` was stored,
  validated, editable and **read by nothing**.

So an athlete could connect Intervals.icu, import three years of data, generate
a cited 18-week season, and read every single intensity in it as an
**Unavailable Metric**. The corpus was not the gap. The athlete was.

The rule that kept it that way is `zones/defaults.ts:10`, and it is a good rule:
defaulting a **Zone Recipe** fabricates nothing because a recipe is a _shape_,
but defaulting a **Threshold** _"would be a number about this athlete that
nobody measured, and which stays manual-only for exactly that reason."_

## Decision

### 1. An estimate fitted to the athlete's own efforts is not "a number nobody measured"

The `defaults.ts` rule is sound and **does not reach this case**. A critical
power fitted to ninety days of _this athlete's_ recorded maximal efforts is a
reading of measurements they produced. That is the same class as
`weeklyCapacityHours` (ADR 0050, derived from their own weekly hours) and the
same class as Normalized Power — both derived, both trusted, neither fabricated.

What is forbidden is asserting it. So:

**Nothing is ever written without the athlete's act.**
`/settings/training/analyze` is a screen of _proposals_; the loader has no
transaction and no create, and one POST per accepted reading writes anything at
all. ADR 0050's **derived-then-authored** rule applies unchanged: once accepted,
the number is theirs, and nothing re-reads history to move it underneath them.

### 2. Provenance is **construct** and **protocol**, not a trust label

`source: manual | inferred | auto` records _how much to trust the entry_, which
is not the thing that varies. `zones-and-thresholds.md` §3.1/§3.2 measures FTP
from a 60-minute TT, from `0.95 × 20 min`, from `0.75 × ramp MAP` and from a CP
curve fit as **four different numbers for the same rider, up to ~20 W apart** —
and two of those four are `manual` while two are `auto`. The enum groups the
wrong pairs.

`ThresholdEvent` gains three nullable columns:

- **`construct`** — what was measured (`maxHr`, `lthr`, `ftp`, `cp`,
  `thresholdPace`, `criticalSpeed`, `css`, `runPower`);
- **`protocol`** — how (`manual`, `tt60`, `ftp20`, `ramp`, `cp-fit`,
  `race-equivalence`, `observed`, `tanaka`, `provider`);
- **`confidence`** — ADR 0033's `high | medium | low`, and **null where the
  athlete typed the number**. A figure somebody stated about themselves is not
  graded by the app.

`source` is kept for the rows that already read it and stops being the only
provenance. The backfill is exact rather than a guess: every existing row was
written by the manual path, so every one is `protocol: 'manual'`.

The columns land **before the first estimator writes a row**, because provenance
cannot be retrofitted onto numbers already stored —
`DisciplineProfile.zoneSystem` having no history at all is this schema's own
standing proof of that.

### 3. **CP is not FTP**, and the coercion happens in exactly one place

256 ± 50 W against 249 ± 44 W, 95 % limits of agreement −19 to +33 W, a gap that
widens with fitness, and the authors state the two should not be used
interchangeably. There is **no validated conversion**, so nothing in the app
applies one.

A `cp` estimate lands in `DisciplineProfile.ftp` because that is the only column
that exists — and the `ThresholdEvent` beside it records `construct: 'cp'`, so
the history renders _"FTP · 229 W · critical power · fitted to your best
efforts"_. The coercion lives in one map (`CONSTRUCT_COLUMN`) where it can be
read, rather than being implied by a silent assignment. `criticalSpeed` into
`thresholdPaceSecPerKm` is the same case in the run's currency.

The caveat sits **on the number** — one phrase, in place — and the argument
waits behind a tap, per #437's rule generalized.

### 4. The engine is pure, and acceptance re-derives rather than trusts

`app/utils/profile-analysis/` splits the way `plan-generation` does: the engine
**reads no clock** (`now` is an argument), has no random source, mutates nothing
and **cannot query**. The server half assembles the input and writes only what
was accepted.

Acceptance **re-runs the analysis server-side** instead of trusting the value
the browser posted back — the rule `approveSeason` holds for a generated season
and `fitPlanToEvent` holds for a **Season Fit** proposal. An athlete cannot
accept a number the app never produced.

### 5. Every rung answers, and a refusal is a first-class answer

A **Threshold Estimate** is a discriminated union, not a nullable number,
because _"we did not look"_ and _"we looked and there is nothing"_ are different
statements and the surface says different things about them. Five rungs ship:

| Rung                 | Protocol   | Note                                                                                                                                                                                                                                                                |
| -------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Age-predicted max HR | `tanaka`   | **Pinned at `low` forever.** A population regression says nothing about this athlete, so no amount of history raises it — the same shape as ADR 0033's HR ceiling on a detection                                                                                    |
| Observed max HR      | `observed` | A **high percentile of per-activity maxima**, never the single global one: strap dropouts and cross-talk produce isolated 220 bpm spikes that `ActivityImport.hrMax` inherits verbatim, and one bad sample in three years would otherwise set the whole zone ladder |
| Critical power       | `cp-fit`   | 2-parameter `P(t) = CP + W′/t`, fitted only over 2–20 min where the model is well-behaved                                                                                                                                                                           |
| Run power threshold  | `cp-fit`   | Same model, different construct — ADR 0038 separates the `runPower` anchor from `ftp`, so they are never merged                                                                                                                                                     |
| Critical speed       | `cp-fit`   | The same linear model in speed, since a mean-_maximal_ of `sec/km` would be the athlete's slowest stretch                                                                                                                                                           |

**CSS is declined outright.** A 400/200 pair needs data swim imports do not
carry, and approximating it from a whole-swim average pace would be a steady
effort wearing a test's clothes.

Confidence grades on the four terms `zones-and-thresholds.md` §4 names —
coverage, recency, maximality, residual. **Maximality cannot be verified**:
nothing records that an effort was all-out, so spread across distinct activities
is the stated proxy. The internal 0–1 score is never stored and never displayed.

### 6. ADR 0020's downsampling produces a **refusal**, not a low grade

`ActivityStream` is a _display_ grid — `max(5, ceil(span / 999))` — so a 5-hour
ride lands on a **19-second** grid.

A mean-maximal window is trusted only at **8 samples or more**. The derivation:
an even grid quantizes a window's true length to a multiple of `resolutionSec`,
so the relative duration error is at most `1 / (2n)`; at `n = 8` that is 6.25 %.
A 5 s grid therefore serves durations from 40 s and a 19 s grid from ~152 s —
which means on a long ride even the 2-minute rung is refused, and that is the
correct answer.

Two consequences are stated rather than smoothed over:

- The curve **names the durations it could not read** instead of returning one
  that looks complete. `resolution` is a distinct refusal from
  `insufficient-efforts`: the athlete did the efforts, the storage cannot see
  them.
- **`W′` is carried for the derivation and never offered.** The same regression
  returns it, but a `W′` whose short anchors were refused is a free parameter
  absorbing residual, not a measurement of anaerobic capacity.

The fix is the analysis tier **ADR 0020 should be superseded for** — a
full-resolution analysis blob with the display grid derived from it. This is the
fourth research document to recommend that supersede and the first with a
shipped feature behind it. Lowering the sample floor instead would buy numbers
by giving up the reason to believe them.

### 7. A stale estimate freezes and is flagged, never decayed

No literature validates any decay function for a stale threshold
(`zones-and-thresholds.md` §4.5). A pipeline that estimates automatically will
feel the pull to keep the number moving; it must not. The app says the reading
is old and stops there.

### 8. A provider's own threshold is a pre-fill, never an adoption

`protocol: 'provider'` exists and nothing writes it unasked. A connected
account's computed eFTP may be offered for the athlete to confirm; it may not be
adopted as the app's own. The precedent is `intervalsicu/ingest.server.ts:49`,
which already declines to import `icu_training_load`, CTL and ATL by deliberate
decision.

## Considered options

- **Keep thresholds manual-only.** Rejected. It was the right rule for a
  _default_ and the wrong rule for a _reading of the athlete's own data_, and it
  is the single reason 152 cited sessions resolve to nothing for a new athlete.
- **Write the estimate straight into `DisciplineProfile` on connect.** Rejected.
  It moves an athlete's zones — and, through `recomputeLoadFrom`, their training
  history — without their act. Where a movement of that kind is genuinely
  unavoidable the mechanism is a **Load Recompute Notice**, not silence.
- **Convert CP to FTP with a published constant.** Rejected: no validated
  conversion exists. The bias is +7 ± 13 W with limits of agreement spanning 52
  W, which is not a constant.
- **Grade a resolution-starved curve `low` instead of refusing.** Rejected. A
  grade communicates uncertainty _within_ a valid fit; it must not be asked to
  carry "this is not a fit at all". Compare `structure-detection`, which returns
  `null` rather than a `low`-confidence guess.
- **Offer `W′` as a second acceptable number.** Rejected — §6.
- **Add a `cp` column to `DisciplineProfile`.** Deferred, not rejected. Today
  nothing reads a CP except as an FTP proxy, and a column with no consumer is
  ADR 0037's exact mistake. The `construct` field records the distinction
  losslessly until a reader exists.
- **Derive a training `level` from history.** Rejected for now. ADR 0053 §9
  already declined to infer `advanced` from _stated intent_, and history does
  not change the asymmetry: too low costs a scroll, too high puts a session on
  the calendar they should not be doing.

## Consequences

- **`AthleteProfile.birthdate` finally has a consumer**, five years of ADR after
  it was promised one.
- **`ThresholdEvent.effectiveAt` is still written and never read**, and this
  decision makes that latent defect _live_: thresholds are about to start moving
  for reasons other than a hand edit, and zone resolution uses the current
  `DisciplineProfile`. An as-of-date resolver is now on the critical path for
  anything that compares a session against its own past.
- **`source: 'inferred'` has a writer for the first time.** `'auto'` still does
  not, and should probably be retired rather than filled — nothing writes a
  threshold without the athlete's act.
- Analysis reads at most `MAX_ANALYSED_ACTIVITIES = 250` imports with their
  streams. That is a lot of JSON for one page; the cap is stated in the basis so
  a truncated window is visible rather than silent.
- The **swim** athlete gets nothing from this. That is honest and it is also a
  real gap, and it stays open until swim imports carry structure.
