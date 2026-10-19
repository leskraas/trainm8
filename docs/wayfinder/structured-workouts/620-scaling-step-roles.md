# What Juster and replan do to each Step Role

The resolution asset for *Decide what Juster and replan do to each Step Role*
(#620) on the map *structured workouts everywhere* (#600). Analysis date
2026-10-19. Code references are to `main` at `ea40a47`, read on branch
`wayfinder/605-detection-scoreboard`.

It builds on the locked Workout Reading
([`602-workout-reading.md`](602-workout-reading.md)): roles come from
`readWorkout` with provenance `authored | convention`, and nothing stores a
role (map #600, settled point 5).

The prototype was throwaway TypeScript, run with `npx tsx` against the real
corpus (`CATALOGUE_CORPUS`) and the real `scaleStepQuantities`,
`tiredMinutes`, `shortMinutes` and `sumBlockDurationMin`. It is not in the repo.

## 1. Every transform that makes a session shorter or easier

| # | Transform | Code | Currency it aims at | What it does to each role today |
|---|---|---|---|---|
| T1 | **Week Replan scale** (autopilot, ADR 0025/0080): one `scale` proposal per session, factor `max(1/ratio, 0.7)` | `week-replan.ts:136-138`, `:171-187`; applied in `week-replan-proposals.server.ts:584-616` | none: it scales quantities and hopes. The ratio it inverts is **TSS** (`adherence.ts:2`) | Every `cardio` step with a quantity is multiplied by the factor: warm-up, work, cool-down **and** jog recoveries written as cardio steps. `rest` steps are kept. Rounding is per step: 1 min or 100 m, never to zero, never past the original (`:153-161`). Reps are never dropped. Intensity is never touched. |
| T2 | **Gjør uka lettere −15 %** | `week-replan-answers.server.ts:36` (`EASE_WEEK_FACTOR = 0.85`), `:204` | same as T1 | Same code path as T1, on every scheduled session left in the week. |
| T3 | **Lite tid** (Juster) | `juster.ts:93-96`; `juster.server.ts:355-382`, `scaledTo` `:421-460` | time: 30 min, or 20 | One factor for every cardio step, so the timed steps sum to the target. Rests are fixed. Rounding 10 s / 100 m. Reps never drop. Reads its length from `sumBlockDurationMin` (`juster.server.ts:371`, `dashboard.ts:55`), which skips distance steps and series rests. |
| T4 | **For sliten i dag** (Juster) | `juster.ts:84-87`, `:102-104`; `juster.server.ts:258-353` | time: 60 %, whole 5 min, ≥ 20 min | Replaces a cardio session with **one** endurance step (`buildEasedPrescription`, `eased-prescription.ts:112`). Every role is gone and intensity drops. Strength keeps 60 % of its sets, rounded up. A Simple Activity keeps one step. Length comes from `sumBlockDurationMin` (`:304`). |
| T5 | **Session Nudge ease** | `session-nudge.server.ts:127`, `eased-prescription.ts:112-159`, cap `session-nudge.ts:83` | time: ≤ 60 min | Same replacement as T4: one Z2 step, capped at an hour. |
| T6 | **Recovery and taper weeks** (plan outline) | `plan-outline/derive.ts:132` (−30 %), `:141` (−50 %), `roleFactor` `:337` | the week target | Does not touch a session. It shrinks the week target that stamped days are sized from. It belongs to #606 (see §8). |

Nothing in the app ever changes `repeatCount` or `seriesRepeatCount`. That is
the root of the problem: the only lever any transform has is length.

## 2. What goes wrong today, in numbers

Pricing in the prototype uses the shape of every Planned TSS formula, hours ×
IF² × 100 (`formulas.ts:9,35,65`). Rests are priced at 0, as
`computePlannedTss` prices them now (`planned-tss.ts:98`). Distance steps are
timed at the step's own pace. The IF table is approximate, but before and
after use the same table, so the ratios hold.

### The ticket's case: `15′ Z2 + 10 × (3′ Z4 + 2′ rest) + 10′ Z1` (75 min, TSS 66)

| Transform | Result today | Time | TSS |
|---|---|---|---|
| T2, ×0.85 | `13′ + 10 × (3′ + 2′) + 9′` | 96 % | **96 %**. The note says "ca. 15 % kortere". The 3′ reps are immune to a 1-min rounding: 153 s rounds back to 180 s. |
| T1, ×0.70 | `11′ + 10 × (2′ + 2′) + 7′` | 77 % | 68 %. The reps lose a third of their length, and the work:rest ratio goes from 3:2 to 1:1. |
| ×0.60 (below the 0.7 floor; for the ticket) | `9′ + 10 × (2′ + 2′) + 6′` | 73 % | 65 %. The warm-up is 9′. |
| T3, Lite tid | `2:40 + 10 × (0:30 + 2′ rest) + 1:50` | 30 min | **17 %**. A threshold session becomes 30-second reps on 2-minute rests after a 2:40 warm-up. |
| T4, For sliten | one 45′ Z2 step | 60 % | n/a |

### Lite tid and For sliten read the wrong length

`sumBlockDurationMin` counts only steps with a `durationSec`. Over the 120
non-test cardio sessions in the corpus:

- **Lite tid refuses on 49 of them** (`no-time` or `already-short`) although
  they last more than 20 min. `run-E3` reads 9 min and lasts 101. Swim sets
  read their rests only.
- On the 71 it does change, **20 end more than 2 min away from the length the
  toast states**. The worst is `run-G4` (hill circuit): the toast says "kortet
  ned til 20 min", and the session still lasts 58 min. Every step is a
  distance step, so `scaledTo` has nothing to scale and returns the session
  unchanged.
- `15′ Z2 + 6 × (1 km @T + 90″) + 10′ Z1` reads 34 min and is cut "to 30 min".
  It comes out as `12:40 + 6 × (800 m + 90″) + 8:20` = **50 min**.
- **27 of the 71 have a work rep cut to under half its length.**
- **For sliten gets the wrong length on 57 of 108.** `run-E1` (73 min) becomes
  a 12-min jog, and `swim-D1` (45 min) a **4-min** swim. The 20-min floor does
  not save them, because `tiredMinutes` never lengthens (`juster.ts:86`).

The reader fixes the length source (`summary.duration`, 602 "who reads what").
It does not fix the shape: that is what this ticket decides.

## 3. What the training literature says

| Claim | Source | Consequence here |
|---|---|---|
| A 2-week taper with volume cut 41–60 % and **intensity and frequency unchanged** gives the largest performance effect. | Bosquet, Montpetit, Arvisais & Mujika 2007, *Med Sci Sports Exerc* 39(8):1358-65, [PMID 17762369](https://pubmed.ncbi.nlm.nih.gov/17762369/). Already cited by `derive.ts:342`. | Cut volume. Never cut zones in a load-driven transform. |
| Keep intensity, cut volume (up to 60–90 %), cut frequency by no more than 20 %. | Mujika & Padilla 2003, *Med Sci Sports Exerc* 35(7):1182-7, [PMID 12840640](https://pubmed.ncbi.nlm.nih.gov/12840640/) | Same. A shortened session must stay a session, not be removed. |
| "Training load should not be reduced at the expense of intensity." | Mujika 2010, *Scand J Med Sci Sports* 20(S2):24-31, doi:10.1111/j.1600-0838.2010.01189.x | Same. |
| A cut of up to two-thirds in **duration** kept VO₂max and 5-min endurance. A one-third cut in **intensity** lost VO₂max. | Hickson et al. 1982, *J Appl Physiol* 53:225, [PMID 6214534](https://pubmed.ncbi.nlm.nih.gov/6214534/); Hickson et al. 1985, *J Appl Physiol* 58:492, [PMID 3156841](https://pubmed.ncbi.nlm.nih.gov/3156841/) | Shortening is safe. Lowering the zone is the costly lever. |
| An interval prescription has up to nine variables: work intensity and **duration**, relief intensity and duration, **number of repetitions**, number of series, between-series recovery, and modality. Each changes the acute response. | Buchheit & Laursen 2013, *Sports Med* 43(5):313-38, [PMID 23539308](https://pubmed.ncbi.nlm.nih.gov/23539308/) | Rep length and the work:rest ratio decide **what kind** of session it is. Rep count decides **how much**. Drop reps; keep their length and their rest. |
| Active warm-up helps if it leaves the athlete unfatigued with a raised baseline VO₂. Many structures give similar effects. | Bishop 2003, *Sports Med* 33(7):483-98, [PMID 12762825](https://pubmed.ncbi.nlm.nih.gov/12762825/) | A warm-up keeps a floor. Its exact length is flexible. |
| An active cool-down is largely ineffective for next-day performance and most recovery markers. | Van Hooren & Peake 2018, *Sports Med* 48(7):1575-95, [PMID 29663142](https://pubmed.ncbi.nlm.nih.gov/29663142/) | The cool-down's floor can be lower than the warm-up's. |
| On days when readiness is low, a low-intensity session or rest gave better gains than the fixed plan. | Kiviniemi et al. 2007, *Eur J Appl Physiol* 101:743-51, [PMID 17849143](https://pubmed.ncbi.nlm.nih.gov/17849143/) | *For sliten i dag* is right to **replace** a hard session with an easy one, unlike the load transforms. |

## 4. Decisions

### 4.1 Two families of transform

- **Shorten** (T1, T2, T3): keep the session and every target, and take
  volume out. One function, `shortenSession(reading, target)`, in `load/`. It
  reads roles from `readWorkout` and writes authored structure back: counts,
  quantities and, at most, a block collapsed to one step. It stores no role.
- **Replace** (T4, T5): the session becomes one easy step. This is unchanged
  in design (ADR 0100 §7, Kiviniemi 2007). Its length now comes from
  `summary.duration`: 60 %, whole 5 min, at least 20, never longer than the
  session.

### 4.2 The rule: structure decides the unit, role decides the floor

**Every role gives up the same share, each in its own unit.**

| What | Unit it is cut in | Floor | Never |
|---|---|---|---|
| **work**, a repeated block (`repeatCount × seriesRepeatCount ≥ 2`) | **whole reps.** The series count is kept and reps per series fall evenly, since the model has one `repeatCount` for all series. A whole series goes only when that lands nearer the target (`3 × [13 × 30/15]` at 0.6 → `2 × [11 ×]`). | 1 rep | Change its zone. Change its recovery. |
| **work**, long reps (≥ 5 min), only when no whole-rep count lands within 3 pp | rep length in steps of 5 % of the length: whole minutes, 0.5 km (run/bike) or 50 m (swim) | 50 % of authored | Shorten a rep under 5 min. |
| **work**, continuous (a single-rep block) | whole minutes, or 0.5 km / 50 m when authored as distance | 10 min, or as authored if shorter | Change its zone. |
| **warm-up** | whole minutes / 0.5 km / 50 m | **10 min**, or as authored if shorter | Grow past authored. |
| **cool-down** | same | **5 min**, or as authored if shorter | Grow past authored. |
| **recovery** (rest step, jog step, send-off residual, between-series rest) | goes with its rep or its series | n/a | Be resized. Today T1 shortens jog recoveries but keeps rest steps, which is an inconsistency this removes. |
| **steady** (single-step session, Simple Activity) | whole 5 min (`five-minutes.ts`, owner decision 2, #571) | n/a | Change its zone. |
| **unknown role** (a block that is neither the main set nor an easier flank, for example strides before the main set, or a drill ride's even flanks) | by structure: reps if repeated, minutes if not | none | Change its zone. |

**How one result is picked.** For each candidate rep count, the minute pieces
share one common factor between their floors and their authored length. The
candidate kept is the one that lands within tolerance and whose rep share is
closest to that common factor, so no role is sacrificed for another. Ties go
to more reps. A long rep shortens only when no rep count fits.

**Roles from `convention` are trusted as much as `authored` ones.** Because
every role gives the same share, a wrong role costs at most a floor: a
progression run's easy first half read as "warm-up" is still cut by the
session's share, and floors only bind below 10 min. In the corpus, 104 of 117
warm-ups are authored by name and 13 are by convention. Only 6 of 363 blocks
read as unknown.

**Intensity never changes in a shorten**, in any role. ADR 0025 §2 stands, and
the type makes it structural, as `scaleStepQuantities` does now.

**Tests are never shortened** (`intent: 'test'`: CSS, FTP, ramp and VK tests).
A shortened test is not the test. A replan skips them, as it skips strength,
and *Lite tid* refuses with a new reason, `is-test`, pointing to *Bytt dag*.

**Strength is unchanged**: For sliten keeps 60 % of the sets, rounded up; a
replan does not touch strength; Lite tid refuses with `no-time`. Strength
execution is out of the map's scope.

### 4.3 Which currency each transform aims at

| Transform | Target | Tolerance | When it cannot price |
|---|---|---|---|
| T1 replan, T2 Gjør uka lettere | **factor × Planned TSS**, priced by the same fold over `steps` that Planned TSS uses (602 placement). Both the ratio the replan inverts and the adherence that judges the next week are TSS. | ±3 pp of the session | Planned TSS not `full` (no threshold, an unresolved step) → the reading's `summary.duration` instead. An incomplete duration (`≥ 34 min`) → scale only the known part, and say "ca." |
| T3 Lite tid | **ceiling**: `summary.duration` ≤ 30 (or 20) min, landing in [target − 6 %, target] | the ceiling is hard | — |
| T4, T5 replace | 60 % of `summary.duration` / ≤ 60 min | — | — |

The time-versus-TSS question is not a real choice. With equal shares, a
session's time share lands within 2–4 pp of its TSS share (corpus, new rule:
mean +0.2 pp at ×0.85; p10/p90 −1.9/+2.6 pp). So the week card's hours and
kilometres move as promised too.

**The Replan Note states the reduction achieved, not the one asked for.**
Round it to 5 %. Today the note says "ca. 15 % kortere" on a session that got
4 % shorter.

### 4.4 Lite tid when even the floors don't fit

When warm-up 10 + one full rep + cool-down 5 exceeds the ceiling (2 × 20′ FTP
in 30 min), the one rep becomes continuous work. Its recovery folds into the
cool-down. The result is `10′ + 15′ @100 % + 5′`. This is owner choice B
below; the prototype implements the recommended option.

## 5. Worked examples (prototype output)

Times include series rests, as the reader will count them.

| Session | Transform | Today | New |
|---|---|---|---|
| `15′ Z2 + 10 × (3′ Z4 + 2′) + 10′ Z1` | ×0.85 | `13′ · 10 × (3′+2′) · 9′`: TSS 96 % | `11′ · 9 × (3′+2′) · 8′`: TSS 85 %, time 85 % |
|  | ×0.70 | `11′ · 10 × (2′+2′) · 7′`: 68 % | `10′ · 7 × (3′+2′) · 7′`: 69 % |
|  | ×0.60 | `9′ · 10 × (2′+2′) · 6′`: 65 % | `10′ · 6 × (3′+2′) · 5′`: **60 %**, 45 min |
|  | Lite tid | `2:40 · 10 × (0:30+2′) · 1:50` | `10′ · 3 × (3′+2′) · 5′` = 30 min |
| `15′ + 6 × (1 km @T + 90″) + 10′` | Lite tid | reads 34′, says 30′, **is 50 min** | `11′ · 2 × (1 km + 90″) · 7′` = 29:25 |
|  | ×0.70 | `11′ · 6 × (700 m + 90″) · 7′`: 71 % | `11′ · 4 × (1 km + 90″) · 8′`: 70 % |
| `15′ + 3 × [13 × 30/15] / 6′ + 10′` | ×0.70 | flanks only: **90 %** | `11′ · 3 × [9 × 30/15] · 7′`: 70 % |
|  | ×0.60 | 85 % | `10′ · 2 × [11 × 30/15] · 6′`: 59 % |
| run-C2 cruise `2 km · 5 × (6′ T + 1′) · 2 km` | ×0.85 | `5 × (5′+1′)`, flanks 1.7 km: 84 % | `4 × (6′+1′)`, flanks kept: 86 % |
| run-D2 Seiler 4 × 8 | ×0.85 | `13′ · 4 × (7′+2′) · 9′`: 88 % | `12′ · 4 × (7′+2′) · 8′`: 85 % (rep length: 4 reps → 3 would be 76 %) |
|  | ×0.70 | `4 × (6′+2′)`: 74 % | `10′ · 3 × (8′+2′) · 5′`: 71 % |
| bike-C1 2 × 20′ FTP | ×0.85 | `17′ · 2 × (17′+9′) · 13′`: 86 % | `15′ · 2 × (17′+10′) · 12′`: 85 % |
|  | Lite tid | `6:20 · 2 × (6:20 + 3:10) · 4:40` | `10′ · 15′ @100 % · 5′` (§4.4) |
| run-A3 easy 50′ + 6 strides | ×0.70 | `35′ · 6 × strides`: 73 % | `35′ · 4 × strides`: 70 % |
| run-B1 long run 120′ | ×0.85 | 102′ | 100′ (whole 5 min) |
| swim-D1 `600 · 16 × (50 m Z5 + 15″) · 400 · 200` | ×0.70 | flanks only: **83 %** | `450 · 10 × 50 · 300 · 200`: 71 % |
|  | For sliten | **4-min swim** | 25-min easy swim |
| run-E1 `3 km · 4 × (2 km @5k + 3′) · 2 km` | For sliten | **12-min jog** | 45-min jog |

## 6. TSS accuracy over the corpus

115 non-test cardio sessions with complete pricing. Error = achieved TSS share
minus the factor.

| | ×0.85 today | ×0.85 new | ×0.70 today | ×0.70 new |
|---|---|---|---|---|
| mean error | +3.1 pp | −0.1 pp | +4.1 pp | +0.2 pp |
| median \|error\| | 2.7 pp | 0.6 pp | 2.3 pp | 0.5 pp |
| p90 \|error\| | 10.3 pp | 2.1 pp | 18.7 pp | 2.2 pp |
| max \|error\| | 12.2 pp | 4.2 pp | 24.8 pp | 5.0 pp |
| within 3 pp | 58 / 115 | **111 / 115** | 63 / 115 | **111 / 115** |
| work reps shortened | 27 blocks | 16 (long reps ≥ 5 min only) | 36 blocks | 6 |
| warm-ups pushed under 10′ | 7 | 0 | 21 | 0 |

The levers used by the new rule at ×0.85 were reps 71, minutes 24, rep length
16, and a miss within 5 pp in 4. Today's error is biased upward: the week ends
heavier than the replan promised. The new rule's mean error is about zero, so
across a week the misses cancel.

**Without long-rep shortening**, the new rule lands 95 / 115 within 3 pp at
×0.85, with max 12.2 pp, and 105 / 115 at ×0.70. The mean error is still about
zero. The misses are few-rep sessions such as 4 × 4, 3 × 600 m and 2 × 20.

**The remaining misses** are steady sessions on the 5-min grid (30′ × 0.7 =
21′ → 20′, so 67 %) and few, short reps (4 × 4′ at ×0.7 gives 3 reps = 75 %).
Both are honest, and the note says what was achieved.

Lite tid with the new rule is never over its ceiling (0 / 71).

## 7. What the athlete sees

- **Drawing.** The Profil shows the session as it now is: fewer bars, the same
  heights. No ghost of the removed reps is drawn. Planned-vs-done is a
  separate mapping (#608), and undo restores the before-image.
- **Replan Note** (`WEEK_REPLAN_SOFTENED_LABELS`, `labels.ts:6890`). Keep the
  sentence and change the clause: "Denne økta ble gjort ca. 15 % lettere: 8 av
  10 drag, samme fart." When it was rep length, it says "drag på 17 av 20 min";
  when it was minutes only, "kortere oppvarming og nedjogg". Use "lettere", not
  "kortere", because load is what was asked.
- **Lite tid toast.** Today it reads "Dagens økt er kortet ned til 30 min"
  (`labels.ts:4166`), which is false on 20 of 71 sessions. It takes its
  minutes from `summary.duration` of the result. Add the drop when reps fell:
  "… 30 min: 3 av 10 drag."
- **For sliten toast.** Unchanged words, with the right minutes.

## 8. ADR amendments

| ADR | Change |
|---|---|
| **0025 §2** | "The scale applies to each session's quantified cardio Step Quantities" becomes: the scale is a **Planned TSS share** (duration when TSS is not `full`), taken out of every Step Role equally in that role's unit: whole reps for repeated blocks, minutes for the rest, the warm-up ≥ 10 min, the cool-down ≥ 5 min, and recoveries never resized. Intensity Targets still never change. Tests are skipped like strength. |
| **0025 §3 / 0080 before-image** | The scale now writes `repeatCount` and `seriesRepeatCount`, and may collapse a block. `SessionImageSchema.steps` (`week-replan-proposal.ts:185-200`) holds only step quantities, so it must hold the session's blocks as stored. Juster's `ImageWorkoutSchema` (`juster.ts:237-245`) already does this; reuse it. |
| **0100 §7** | *Lite tid*: a time **ceiling** on `summary.duration`, met by the same shorten rule; not one factor over every step. *For sliten*: 60 % of `summary.duration`. *Lite tid* refuses a test (`is-test`). The Replan Note words the achieved change. |
| **0019** | No change. The re-price is the same fold over `steps`, so the result's Planned TSS is exactly what the transform measured. |
| **GLOSSARY** | No new term. **Step Role** gains one sentence: "A shorten takes the same share from every role, in whole reps for repeated work; it never changes a target." That sentence ships with the ticket that builds it. |

## 9. Owner choices

**A. May a long rep be shortened when whole reps can't hit the target?**
- (a) **Yes**, for reps of 5 min or more, down to half their length, only when
  no rep count lands within 3 pp. The result is 111 / 115 within 3 pp; Seiler
  4 × 8 at ×0.85 becomes 4 × 7.
- (b) **No.** The rep count is the only lever, giving 95 / 115 within 3 pp and
  a mean error of about zero. "4 × 8" stays 4 × 8 or becomes 3 × 8.
- *Recommendation:* (a). Above about 3 min, a long rep's response depends on
  time-in-zone, not on its exact length (Buchheit & Laursen 2013), and the
  protocol's character survives a 1-min cut.

**B. Lite tid when warm-up 10 + one full rep + cool-down 5 won't fit in 30 min.**
This happens with 2 × 20′, 2 × 30′ sweet spot or 3 × 12′.
- (a) **One rep becomes continuous** work: `10′ + 15′ @100 % + 5′`.
- (b) Replace it with an easy 30′, as For sliten does.
- (c) Refuse, and point to *Bytt dag*.
- *Recommendation:* (a). The athlete asked for less time, not less intensity.

**C. Same share per session, or protect the week's key sessions?**
- (a) **Every session takes the factor.** This is today's model: one proposal
  per session (ADR 0080).
- (b) **Week allocation.** Easy sessions take more of the cut and quality days
  keep their reps (Mujika 2010).
- *Recommendation:* (a) for now. (b) changes the proposal model, so it gets
  its own ticket.

## 10. Open items and new tickets

1. **Ticket: the replan before-image holds blocks** (§8). This blocks
   building the shorten rule into T1 and T2.
2. **Ticket: build `shortenSession`** in `load/`, with the test table §5 as
   its first test file. It lands after the 602 reader release, because it
   needs `readWorkout` and the Planned TSS fold.
3. **Fold Juster's length source into the 602 release.** `juster.server.ts:304`
   and `:371` read `sumBlockDurationMin`, and the 602 "who reads what" table
   already retires it. Name both call sites in that PR. They fix 49 wrong
   refusals and 57 wrong For sliten lengths on their own, with no new rule.
4. **Ticket: `is-test` refusal and replan skip** (`JUSTER_REFUSALS`,
   `juster.ts:40`; the adjustable-session gate in `propose-week-change.ts:88`).
5. **Hand to #606.** A recovery or taper week's quality day (`derive.ts:132`,
   `:141`) should be stamped with **fewer reps at the same zone**, by the same
   rule, not as a shorter version of the full shape.
6. **Fog: scaling up.** `ScalePayload.factor` may exceed 1
   (`week-replan-proposal.ts:87`), but no producer makes one. If one appears,
   adding reps or minutes is its own decision. The shorten rule is downward
   only.
7. **Fog: rest pricing.** Rests are priced at 0 today. If the 602 fold starts
   pricing rests, the transform still hits its target, because it measures
   with that same fold.
8. **Fog: the athlete's own sessions.** Lite tid on an athlete-authored
   session writes `repeatCount` back into their structure, as ADR 0100 §7
   already allows. Undo restores it. No new rule is needed, but the PR should
   say so.
