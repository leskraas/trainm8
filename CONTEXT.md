# Training Planning

A training planning app for self-coaching athletes. The athlete views, plans,
and reflects on their training through structured workouts and session logs.

## Language

### Training planning

**Training Plan**: The athlete's forward-looking schedule of planned training
sessions, anchored to a **Target Event** and shaped by a **Plan Outline**. It
remains a concept/view over **Workout Sessions**, not a stored entity — whether
the Outline was written by **Plan Generation** (retired, ADR 0044) or authored
manually (ADR 0039). In periodization terms the plan spanning the season toward
its Target Event is the macrocycle. _Avoid_: Program, calendar, macrocycle (as a
UI/code term — recognized synonym only)

**Plan Template**: _Future (not yet built)._ A stored, athlete-agnostic,
reusable plan definition — phases and week patterns in relative weeks, no dates
— that can be stamped out onto an **Event** to produce a **Plan Outline**,
repeated, fetched from a library, and (via the future social layer, #337)
shared. The template carries identity; the applied plan remains a view. Five
constraints are already settled, harvested from #375 when it closed out of
scope: what a template may carry is the **relative** phase timeline, endurance
**Training Track segments** and their **Quality Session Mixes**, and **Week
Patterns** — never dates, never a **Volume Currency**, never a **Season Anchor**
value, by ADR 0044 §3's rule that what floats free of the phase timeline is
dated and what is aligned to it is relative; composition is **inline, never by
reference**, because apply-then-own leaves no live link to point through; a
season template and a block template are one payload at different arity, so a
level discriminator is the wrong axis; the week level already has its home on
the **Plan Outline**, so at most two levels remain to decide; and a template is
less shareable than it looks, since a cyclist's derived distance reads their own
history and two athletes stamping the same template read different figures (ADR
0045). _Avoid_: Plan library entry, generic plan, shared plan

**Periodization Preset**: A built-in season **shape** the athlete starts from
instead of a blank page — nine ship as code constants in
`app/utils/plan-outline/presets.ts`: **three families at three lengths each**.
The families are classic 3:1 linear, masters 2:1 and big base / pyramidal; a
family is the shape (its blocks, rhythm, ramp, **Block Boundary Step** and
**Quality Session Mix**) and a variant changes the week counts and nothing else,
which is enforced structurally rather than by convention. The lengths —
12/18/24, 11/19/25 and 14/21/27 — put every run-in from ten to twenty-seven
weeks within **two weeks** of a shipped shape, which is how a fixed-length shape
covers an arbitrary run-in: coverage is a property of how many shapes ship,
never of a shape resizing itself (ADR 0048 §6). The **Peak** and the **Taper**
hold at two weeks in every one of the nine, and the shortest shape is a masters
one, because a 2:1 block still contains a recovery week at three weeks where a
3:1 block needs four. No preset carries a **strength** segment, so deterministic
generation cannot produce a strength track — an **Unavailable Metric** to be
named, never a `sessionsPerWeek` to be invented. It is picked from **an
illustration of the load profile it lays down** rather than from a sentence
describing it, and that picture is derived from the preset's own configuration
through the real derivation, so it cannot promise a shape applying does not
deliver. It carries, per phase, a name, a week count, a rhythm and whether it
tapers; and per endurance **Training Track segment** a **Volume Ramp**, a
**Block Boundary Step** and a **Quality Session Mix**. It carries no **Volume
Currency**, no **Season Anchor** value and no **Plan Start Week** — a preset is
shape and never size — and leaves `recoveryCut`/`taperCut` unset so the
documented convention applies rather than being stored as though the athlete had
chosen it. Phases are **fixed length**: a preset applied to a run-in it does not
fill shows the plan ending before or after the **Target Event** and stretches
nothing — and each shape says **where it would land against this Event** before
it is picked, including what the **Season Fit** rule would cost if it were
applied — _runs 9 weeks past your event · fitting it shortens Base by 7 weeks
and Build by 2 weeks_ — since that is the one thing its illustration cannot show
(ADR 0048 §2, §6). Applying **copies it in and says so** — nothing stays linked,
there is no provenance column, and every value is editable afterwards through
the ordinary edit paths. A preset is picked **before the plan exists**:
authoring a plan leads with the shapes — ordered by how close each lands to this
Event, which is a default and never a label — and the chosen one lands whole —
its phases _and_ each endurance segment's ramp, step and mix — with laying out
your own blocks as the escape hatch beside them (ADR 0048 §1). Applying one to a
plan that already exists is the same act on the plan surface. Distinct from a
**Plan Template**, which is a stored, identity-carrying entity and is not yet
built. The athlete-facing noun on the surface is **a shape** — "Start from a
shape" — which is the word the domain reads naturally in; note that it is a
_season_ shape and shares nothing with the **Workout Shape**, which is one
session's structure. Where both could be meant, say **season shape**. _Avoid_:
Plan preset, plan template (a different thing), periodization model,
periodization scheme

**Workout Template**: A reusable workout definition that can be scheduled
multiple times. _Avoid_: Workout plan, base workout

**Workout Session**: A scheduled instance of a workout template at a specific
date-time. _Avoid_: Scheduled workout, occurrence

**Upcoming Workouts**: The subset of workout sessions scheduled from now through
the next 14 days. _Avoid_: Next workouts, future workouts

**Workout Detail View**: The single screen for one **Workout Session** at
`/training/sessions/:id`. A completed session with a **Recording** leads with a
**planned-vs-actual** summary (actual vs **Planned TSS** with its **Adherence
Band**, plus prescribed vs recorded duration and distance), then the **Telemetry
Overlay** — the Recording's **Activity Stream** plotted against the plan when
one exists, or an honest **Unavailable Metric** ("telemetry not available") when
it does not — and keeps the Recording's aggregate metric grid below.
Lifecycle-aware: a scheduled session shows the prescription only; a
recording-only session shows the Recording without a plan comparison.
Read-mostly, but it also hosts the **Session Log** create/update form and the
edit/delete actions for the session. _Avoid_: Session page, workout page

**Upcoming Ledger**: _Retired (ADR 0017)._ Formerly the dense Upcoming Workouts
presentation on the standalone `/training/upcoming` surface, combining grouped
sessions, summary counts, discipline allocation, filters, and workout shape. The
forward half of training now lives in the **Session Ledger** on the home
surface; there is no separate upcoming page. _Avoid_: Dashboard, table page,
report

**Session Ledger**: The single dense, chronological list on the home surface
spanning completed (past), missed, and planned (upcoming) workout sessions,
ordered by date with "Now" between past and future. Each row carries date,
discipline, title, duration, load, status, and (for completed sessions) RPE.
_Avoid_: History, log, timeline

### Workout structure

**Workout**: The structured training definition owned by a user and used as a
template. Carries a **visibility** axis (a string, `private` by default;
ADR 0037) that is orthogonal to its session's **Session Source** — inert
groundwork today (every Workout of every source is `private`, and nothing yet
reads it), with the real vocabulary (`public` / `shared` / `invited` / …) and
all sharing and invite semantics owned by the future social-layer effort (#337),
not this app slice. _Avoid_: Session, activity

**Session Archetype**: _Future (not yet built)._ The "what kind of session is
this" axis — the third axis beside **intensity** (which **Training Zone**) and
**structure** (the Workout → Block → Step shape), answering what a session is
_for_ in its week (research: `workout-taxonomy.md`). Sixteen values: `recovery`,
`easy`, `long`, `steady`, `tempo`, `threshold`, `sub-threshold`, `vo2max-long`,
`vo2max-short`, `anaerobic`, `neuromuscular`, `fartlek`, `race-simulation`,
`test`, `brick`, `technique`. Strength is deliberately outside it: a strength
session authors a **Strength Goal**, not an endurance archetype (ADR 0046,
0047). Not computable from one session's numbers — a 100-minute easy run is an
**easy** run in a 120 km week and a **long** run in a 50 km week — so
classification needs the **Training Week** as context, and it follows ADR 0042's
rule of being **derived, never authored**, returning nothing rather than
guessing (ADR 0033). Norwegian is a first-class register rather than a
translation, and the app's Norwegian users search in it: _langtur_ (long),
_terskeløkt_ and _dobbel terskel_ (threshold, double threshold), _fartslek_
(fartlek), _stigningsløp_ (strides), _bakkedrag_ (hill repeats), _bakkesprint_
(hill sprints), _drag_ (one rep), _serie_ (one set), _kombiøkt_ (brick),
_generalprøve_ (race simulation), _testløp_ (test) — and the spoken I1–I5
ladder, which `olt-hr-5-run` / `olt-hr-5-bike` already ship. `sweet spot` is
deliberately **not** an archetype: it is a dose position inside tempo/threshold
with no primary physiological source, so the app stores `tempo` and lets the
zone say the rest. _Avoid_: Workout intent (the existing field is the intensity
axis wearing this name), session type, workout category, and any brand-flavoured
compound noun ("Threshold Builder", "Power Blast") — if a coach who has never
used this app would not recognise the name, it is wrong.

**Block**: An ordered grouping of repeated steps inside a workout, carrying
**two repeat levels** — an inner one (the reps inside one series) and an outer
**Series Repeat** — so `3 × (13 × 30/15)` is one block rather than a shape the
model cannot say (ADR 0007, #450). Effective passes are the _product_ of the
two, read through `blockRepeatTotal()` by every piece of block arithmetic. A
block may also carry a **Send-Off**, and then it carries no rest steps. _Avoid_:
Set group, segment

**Step**: A single ordered instruction within a block, optionally including a
discipline, intensity, and quantity. _Avoid_: Interval, action

**Discipline**: The sport modality for a workout or step (run, bike, swim,
strength), with an additional import-only value `other` for Activity Imports
from external categories the app does not model (hike, yoga, e-bike, alpine ski,
etc.). Workout Templates and planned Steps cannot use `other`. Activity Imports
marked `other` do not auto-promote and do not contribute to TSS or Training
Load. _Avoid_: Activity type, sport type

**Intensity Target**: The prescribed effort level for a step — a discriminated
union over a zone label (`easy`, `zone2`, `threshold`, `max`) plus metric
models: pace, power (absolute W or `%FTP`), heart rate (absolute bpm or `%LTHR`
/ `%maxHR`), and RPE. A metric target resolves against the athlete's Discipline
Profile thresholds into a concrete display target (e.g. "4:05/km", "235 W",
"160–166 bpm"); when the required threshold is absent it degrades to the
Training Zone or an Unavailable Metric, never a fabricated value. **Nothing is
baked at write time**: authoring stores what the athlete typed — a zone label
stays a zone label — and resolution happens on every read, against the athlete's
_current_ **Discipline Profile** and **Zone Recipe**. So a threshold edit or a
recipe correction moves numbers already read, on four paths none of which is
date-aware: display-time resolution on the **Workout Detail View**, the cached
`intensity*` columns (a cache refilled wholesale, not a bake), **Planned TSS**
and the past **Adherence Bands** it grades, and chip tint. Where that movement
corrects a defect, what is owed is a **Load Recompute Notice** — explained,
never offered (ADR 0006). A baking path does exist, `deriveMetricTarget`, which
resolves the per-discipline default (run → threshold pace, bike → `%FTP`) into a
stored metric target and falls back to the Training Zone label when no threshold
resolves it; its only live caller is the seed script, since **Plan Generation**,
its other intended caller, was deleted (ADR 0044). _Avoid_: Zone target, effort

**Portable Anchor**: _Future (not yet built)._ A prescription target that means
the same thing for every athlete and resolves against that athlete's own
profile. `4:20/km` does not travel; `5k pace`, `85 % of threshold` and `RIR 2`
do (research: `portable-intensity-anchors.md`). It is the vocabulary layer above
the **Zone Recipe**: what is authored is a **name**, and the number is a
**Target Resolution** computed on demand. Six variants cover everything a coach
can say — `absolute` (already resolved), `pctThreshold` (a fraction of a named
**Threshold**), `zone` (a recipe band by that recipe's own label, carrying no
ratio of its own), `raceEquivalent` (a **Race Equivalence** anchor, adjustable
by a _ratio_ and never by seconds), `rpe`, and `open` (deliberately
unprescribed, which is a different state from "nobody has filled this in yet").
Five of the six can fail to resolve; `rpe` and `open` cannot, which is exactly
why they are the honest floor of the degradation ladder and why a generator
should be allowed to emit them rather than fabricate a number — the
**Unavailable Metric** rule generalised. A zone _is_ a `pctThreshold` in
disguise and resolves by delegating to it, rather than through a parallel path
that can drift. Every additive offset the field hands us — swim's `CSS + 10 s`,
rowing's `2k split + 22 s` — becomes a **ratio** before it is stored, because an
additive offset is ability-dependent by construction: the published rowing UT2
band is 54 % of 2k power for a 1:45 rower and 64 % for a 2:15 rower, since erg
power goes as `pace⁻³`. The shipped **Intensity Target** is this union minus
`raceEquivalent`, minus `open`, and minus `pacePct` — %-of-threshold works for
power and heart rate but not for pace, which is where it is most useful.
_Avoid_: Relative target, scaled pace, generic target

**Target Resolution**: _Future (not yet built)._ The concrete number a
**Portable Anchor** resolves to for one athlete at one moment, carrying its own
provenance: the value (or an **Unavailable Metric** with a stated reason _and_
what would fix it), the `via` it was arrived at
(`authored | threshold | actual-result | race-equivalence | mms-curve`), a grade
in the **Load Confidence** vocabulary taken as the **minimum** across signals
rather than an average — confidence is a weakest-link property — and the anchor
snapshot needed to reproduce it later (research:
`portable-intensity-anchors.md`). **Two stamps, not one.** A _scheduled_
session's target re-resolves at **view time**, or a 16-week plan gets
progressively easier as the athlete improves; a _completed_ session's target
**freezes at completion**, because it is what the athlete was told to run and
history is immutable, and it is the frozen stamp that adherence is judged
against. Rendered with the portable name primary and the number as the facet
(`10k pace ≈ 4:09/km`), an `≈` whenever `via != 'authored'`, and a band rather
than a point at low confidence. A never-render-a-number-with-no-name rule
applies: an athlete who only ever sees `4:09/km` cannot carry the target to a
treadmill, a hill or a hot day. When a **Threshold** moves, forward-looking
resolutions move with it and the app **applies, then notifies** — the **Load
Recompute Notice** pattern moved from load to prescription. A recompute is
announced, never offered. _Avoid_: Resolved intensity (the current
provenance-free shape), baked range, effective target

**Race Equivalence**: _Future (not yet built)._ The model family that converts
one performance into an equivalent performance at another distance — Riegel's
`T₂ = T₁ × (d₂/d₁)^b`, the Daniels–Gilbert VDOT curves, and the Critical Speed
line — three independently derived models that agree within 32 s on a 3:11
marathon (research: `portable-intensity-anchors.md`). Model choice barely
matters; the **exponent** is everything: Riegel's 1.06 against the ~1.10–1.15
empirical exponent for recreational runners moves that same runner's predicted
marathon from 3:11:49 to 3:52:25. So trust keys off the **distance ratio**, not
the model — ratio ≤ 2 resolves at `high` confidence, ≤ 4 at `medium`, > 4 at
`low`, reusing the **Load Confidence** vocabulary rather than inventing a second
scale, and never as a gate. Resolves down a five-rung ladder: the athlete's own
recent **Performance Result** for that event; a converted result at another
distance; a stored **Threshold** treated as a virtual race result (threshold
pace ≈ the 60-minute performance, CS ≈ 30–40 min, CSS ≈ 20–30 min) at `medium`;
a mean-maximal-curve fit, capped at `medium` because a window best is not a
maximal effort and systematically under-estimates; then nothing truthful to say.
A named race pace is the right _authoring_ and _display_ vocabulary and the
wrong _storage_ anchor: `5k pace` is duration-relative — a 16:00 runner holds it
for 16 minutes and a 30:00 runner for 30 — while a threshold is
duration-invariant by construction. Anchors are an enumerated set, not a free
distance, so `3.7k pace` cannot appear in a plan. _Avoid_: Pace calculator,
predicted time, VDOT (one model, not the family)

**Threshold**: The athlete's per-discipline anchor that a **Zone Recipe** is a
ratio table over and that a **Portable Anchor**'s `pctThreshold` divides by.
**Manual-only, and never defaulted** — the recipe over it is defaulted per
discipline and this is not, because a recipe is a shape the app may choose and a
threshold is a number about this athlete that somebody has to have measured; a
missing one degrades an **Intensity Target** to the **Training Zone** label or
RPE and a **Volume Conversion** to an **Unavailable Metric**, never to an
invented figure (ADR 0006, #454). Not a number but a
`{construct, protocol, value, effectiveAt}` tuple (research:
`zones-and-thresholds.md`): FTP from a 60-minute time trial, from
`0.95 × 20 min`, from `0.75 × ramp MAP`, and from a critical-power curve fit are
four different numbers for the same athlete, up to ~20 W apart — so
`manual | inferred | auto` is the wrong provenance axis. What varies is the
**protocol** (`tt60`, `ftp20`, `ramp`, `cp-fit`, `manual`, …) and, where they
differ, the **construct**. **CP is not FTP**: 256 ± 50 W against 249 ± 44 W, 95
% limits of agreement −19 to +33 W, with the gap widening as fitness rises, and
the authors state the two should not be used interchangeably; CP also sits ~12 W
above MLSS. Every recipe the app ships anchors on an LT2-family threshold;
**LT1** — the aerobic threshold the whole easy-training story keys off — is
unmodelled and named as such rather than approximated. A historical session's
zones must resolve against the threshold _and_ the recipe in force when it
happened, or raising an FTP retroactively demotes last month's threshold
intervals to tempo. An auto-estimated threshold that goes stale **freezes and is
flagged** ("last supported by a hard effort 47 days ago"), never decayed on an
invented curve: no literature validates any decay function for one. _Avoid_:
Fitness number (a discipline holds three thresholds that drift apart), FTP (one
construct, not the family), baseline (overloaded with the wellness baselines)

**Training Zone**: The app's canonical five-step intensity ladder — 1 recovery,
2 endurance, 3 moderate/tempo, 4 threshold, 5 VO₂ max/anaerobic — the common
scale every intensity statement is placed on, whatever vocabulary it was
authored in. Neuromuscular work has **no** position on it: zones order work by
_metabolic_ strain, and sprint work is high mechanical intensity at low
metabolic cost (ADR 0042 §7). _Avoid_: Zone (bare — a **Zone Recipe** band is
also called a zone), intensity level, effort level.

**Zone Recipe**: A named physiological zone model in code — `coggan-power-7`,
`friel-hr-5-run`, `daniels-pace-5`, `stryd-run-power-5`, `css-3` / `css-5`,
`olt-hr-5-run` / `olt-hr-5-bike` (Olympiatoppen's five heart-rate zones) — one
per **Discipline**, each band a ratio to one anchor threshold. Stored as a
recipe id on **Discipline Profile** with optional per-zone overrides; never rows
in the database, because a recipe is versioned reference data rather than
athlete data (ADR 0006). **Every cardio discipline starts on one** — run
`daniels-pace-5`, bike `coggan-power-7`, swim `css-5` — and the profile stores
**how it got there** beside it (`default | athlete`), so a default reads as a
default rather than as the athlete's authored choice. That provenance is stored
rather than inferred by comparing the id against the default, because an athlete
who deliberately picks the recipe that _is_ the default has still picked it.
Defaulting one fabricates nothing: a recipe is **shape** — which ladder the
athlete's own numbers are read on — where a **Threshold** is **size**, a number
about this athlete, and is never defaulted. Leaving it unset was the empty
option rather than the honest one: a null recipe short-circuits resolution
before any band is consulted, which is what made every **Volume Conversion**
needing one an **Unavailable Metric** while nothing but the seed wrote the
column. Backfilling a null to the default moves nobody's numbers and owes no
**Load Recompute Notice**; an athlete switching recipes owes none either, since
they are the one doing it — what the picker owes them is the consequence stated
first, that a switch re-reads every session already logged. `zoneOverrides`
still has no write path and is deferred deliberately: an override is a per-band
ratio editor with its own surface (ADR 0006, #454). Each band **declares** which
**Training Zone** it is rather than having it inferred: position misplaces
Daniels' `T`, which is threshold but sits third, and a band's wording cannot
carry it either — Olympiatoppen names how hard a zone _feels_ ("comfortably
hard"), not what it trains (ADR 0045). An undeclared band is a positive
statement — neuromuscular work is off the ladder, and `css-3` is too coarse for
zones 3 and 5 — `css-5` declares all five, and ships alongside it rather than
replacing it, because widening `css-3` in place would re-resolve the swimmers
already on it (ADR 0006). Because a band ratio is an intensity factor against
the same anchor the **Load Formula** divides by, the recipe is also what prices
a **Volume Conversion**. _Avoid_: Zone system (the field name only), zone table,
zone chart.

**Step Quantity**: The typed magnitude of a step, expressed as a Step Duration,
a Step Distance, **or a Step Vertical** — mutually exclusive per step (ADR 0002,
amended #450). A step without a Step Quantity is unquantified; in the editor's
Workout Shape strip (#258) a step with neither a Step Quantity nor an Intensity
Target paints nothing, and an intensity-only step gets a fixed nominal width,
never a fabricated length. A **Step Vertical** resolves to no width either — the
app holds no vertical-ascent rate for an athlete, so a climb has an honest
absence where a duration would be. _Avoid_: Size, amount, length

**Step Duration**: The planned time length of a step, stored in seconds.
_Avoid_: Duration string, time interval

**Step Distance**: The planned distance of a step, stored in meters. _Avoid_:
Length, range

**Step Vertical**: The planned metres of climb in a step, stored in metres. The
third **Step Quantity**: vertical repeats, mountain long runs and
vertical-kilometre tests quantify in ascent and in neither time nor ground
distance, so without it they are not merely awkward but unrepresentable
(research: `workouts-running.md`). _Avoid_: Elevation gain (the recorded
counterpart), climb, D+

**Step Parameter**: A condition the work happens under rather than a magnitude
of it — a signed **Grade** (`gradePct`) and a **Cadence** range — so a step
states one beside its **Step Quantity** instead of choosing between them (ADR
0002, #450). Both were previously free text in `notes`, which reads correctly to
a human and is invisible to every filter, planner and adherence check: all five
of the running research's hill rows seed today and are indistinguishable from a
flat session. Grade is signed because a descent is a real prescription. Cadence
is the **defining variable** of six cycling sessions and exists for
_prescription fidelity_, not because low-cadence work is a proven lever — the
best trial in the literature (12 weeks at 40 rpm) found no gain in VO₂max,
performance or leg strength while the free-cadence control improved, so no
seeded description may claim it builds strength. _Avoid_: Step metadata, step
options, gradient (say **Grade**)

**Rest Spec**: The four forms rest actually takes in the field, as a
discriminated union on the rest step (ADR 0007, #450; research:
`workout-taxonomy.md`). A **fixed duration** (`time`); a **send-off**
(`sendOff`) — a cycle time where the rest is the _residual_ after the swim,
swimming's universal form and itself a **Portable Anchor** construction;
**recovery to a heart-rate value** (`toHr`, `toHrPct` — "until HR < 120"); and
rest as a **distance or an act** (`distance`, `act` — "jog back down", "200 m
jog"). They fail differently and they price session duration differently: under
a send-off the set's length is known before it starts, under HR-recovery it is
not knowable at all. Only the `time` form has a duration, and the others return
an **Unavailable Metric** rather than an estimate: attaching a plausible number
of seconds to "until HR < 120" is the fabrication the model exists to avoid, and
`RestStep.durationSec` is the _projection_ of a `time` spec rather than a second
way to say it. Seiler & Hetlelid 2005 is the only controlled evidence on the
duration question and puts ~120 s of active recovery at the balance point for
4-minute work bouts; every other work:rest ratio in circulation is convention.
_Avoid_: Rest duration (one of four forms), recovery (collides with the
**Session Archetype** and with the in-set word — say "recovery session" for the
archetype)

**Send-Off**: The cycle time a repeat group leaves on, where the rest is the
residual after the work — swimming's universal form and neither a duration nor a
distance, which is why it sits on the **Block** rather than inside a **Step
Quantity** (ADR 0007, #450). Two forms: **anchored** (`on CSS + 10 s`), which
resolves against the athlete's own CSS at display time exactly as a `powerPct`
target resolves against FTP and degrades to an **Unavailable Metric** when CSS
is absent; and **absolute** (`on the 1:40`), kept because it is what a coach
writes on the board and an imported set must round-trip. A shared **Catalogue**
ships only anchored ones: `8 × 100 @ 1:40` is a moderate aerobic set at 1:20/100
m and physically impossible at 2:10/100 m. A block states a Send-Off or rest
steps, never both — a send-off already says what the rest is. **Planned TSS**
prices the _target pace_, not the send-off; the send-off's effect on load is
real but indirect, and pricing it would need an incomplete-recovery model no
published swim load model has. _Avoid_: Interval (collides with the work bout),
cycle, pace clock

**Load Target**: What is on the bar for one **Exercise Set**, as a discriminated
union — the strength-channel counterpart of an **Intensity Target** (ADR 0007,
#450). Six forms: absolute kg, `% 1RM`, a **rep-max reference** (`10RM`),
bodyweight ± added load, `%` bodyweight, and a bar velocity. `% 1RM` is one
member and not the axis, because it is not portable below ~85 %: endurance
runners manage 39.9 ± 17.6 reps at 70 % 1RM where weightlifters manage 17.9 ±
2.8, with no difference at 90 %. A rep-max reference is self-calibrating by
definition, which is why Rønnestad's protocol is written `10RM → 4RM` and cannot
be restated as a percentage. Two forms mirror into the legacy
`weightKg`/`pct1RM` columns; the other four leave both null rather than being
converted into a kilo nobody stated. _Avoid_: Weight, load (bare — collides with
**Training Load**), intensity (that is the cardio channel's word)

**Effort Cap**: How close to failure a set may go — `RIR` (reps in reserve) or
Zourdos' RIR-anchored strength `RPE`, where 10 is 0 RIR. A separate axis from
the **Load Target** and routinely co-occurring with it: "4 reps at 85 % 1RM,
stopping if RIR falls below 2" states both, and one union would have forced a
session to choose which to name. _Avoid_: RPE (bare — collides with the
post-session session RPE), failure, effort

**Set Termination**: What ends an **Exercise Set** — a rep count, a duration,
AMRAP, a reps-in-reserve threshold, or a velocity drop. The five-valued
discriminator `ExerciseSet.kind` has always been (ADR 0007, #450). The last two
have **no authored rep count** by construction, so the **Workout Shape** gives
them AMRAP's open-ended estimate rather than inventing one. The editor authors
the first three; the other two arrive with the **Catalogue** and render
read-only until a control exists for them. _Avoid_: Set kind (the column name
only), stop rule

**Workout Shape**: A compact visual summary of a workout's ordered steps and
intensity targets, width tracking resolved time — Step Duration directly, Step
Distance via the athlete's pace, strength sets via Planned-TSS-style estimates,
a fixed nominal width when nothing resolves (#258); the editor and detail-view
preview render it as the honest, height-profiled strip. _Avoid_: Sparkline,
graph, timeline

**Workout Notation**: The app's dense textual notation for a workout's structure
(e.g. `2 km warm-up → 4 × 6 min @ 4:40/km · Z3 → cool-down`), always rendered
from the Workout → Block → Step structure — never parsed from free text (ADR
0027). _Avoid_: Shorthand, syntax, grammar (no parser exists)

**Token Sentence**: The rendering of a workout in the Workout Notation where
every value is a **Token**. Rendered as the **Score stanza** (#251): one Block
per line at every width, the block's repeat count as a gutter badge, and the
Intensity Target chip as the line's only chip-shaped element. The same sentence
is the read view and, for scheduled sessions, the edit view. _Avoid_: Summary
line, formula, text editor

**Token**: A single tappable value within a Token Sentence — a Step Quantity,
repeat count, Intensity Target, rest, or exercise/sets summary — edited via a
picker popover that can only produce valid values. Simple value tokens share one
**retargeting popover** (#252): caret-anchored, type-to-edit with ± nudges,
gliding to whichever token is activated next instead of closing and reopening.
_Avoid_: Chip, pill, field

### Session feedback

**Session Log**: The athlete's post-session record for a Workout Session,
containing a text reflection and an RPE. _Avoid_: Training log, workout note,
diary, note

**RPE (Rate of Perceived Exertion)**: A 1-10 scale of subjective effort logged
by the athlete after a Workout Session. _Avoid_: Effort score, difficulty rating

### Planning metrics and filters

**Discipline Filter**: A single-select filter that narrows Upcoming Workouts by
discipline. _Avoid_: Sport filter, activity tab

**Discipline Allocation**: The distribution of accumulated actual training load
(TSS) by discipline over a trailing window (the Trends "Mix" surface). Redefined
from an upcoming-session count to a load view (ADR 0031); a discipline that
trained but carries no trustworthy TSS is an Unavailable Metric, never a zero
slice. _Avoid_: Sport mix, split, plan allocation

**Intensity Distribution**: _Future (not yet built)._ The **derived**,
**time**-denominated share of training across the scientific three-zone model —
Z1 below LT1, Z2 between the two thresholds, Z3 above LT2 — over a named
trailing window, computed per activity on that activity's own anchor channel
(the ADR 0035/0038 ladder: power, then pace, then HR) and **never blended within
one activity** (research: `intensity-distribution.md`). Each **Zone Recipe**
band must _declare_ its three-zone bucket the way ADR 0045 makes it declare its
**Training Zone**; inferring from ladder position misfiles Daniels' `T` and
files sprint work as high intensity. Endurance-only, on ADR 0046's argument
restated from the physiology side: lactate thresholds do not order a set of
squats, and the founding study excluded strength outright — a pure lifter reads
"—". Every number carries its **quantification method**, because time-in-zone
and session-goal are different measurements: Sylta 2014 ran both over the same
570 sessions from 29 elite skiers and read 96.1/2.9/1.1 by time-in-zone against
86.6/11.1/2.4 by session goal. It can never be denominated in TSS —
`TSS = IF² × hours × 100`, so a TSS-weighted share squares intensity into the
distribution and makes every athlete read threshold-heavy — which supersedes ADR
0031's supporting "one currency on the Trends tab" rule while leaving
**Discipline Allocation** itself untouched. Its **Polarization Index** is
`log10(100 × z1/z2 × z3)` on fractions, polarized above 2.00 and **undefined**
(not low) wherever `z3 > z1` or the structure is not polarized; the widely
circulated `log10(Z1 × Z3 × 100 / Z2)` inflates it by about 2.0. A description,
never a target: neither the largest meta-analysis nor the largest observational
dataset separates polarized from pyramidal, so the only defensible advice from
it is "your easy days are not easy" and "you have had nothing above LT2 in six
weeks" — the second being an absence, which is a fact. _Avoid_: TID (fine in
code, not in UI), 80/20 (a session-goal target, not this number), polarization
score (the index is undefined off its domain)

**Training Metric**: A measurable workout value such as duration, distance, TSS,
or training stress. _Avoid_: Stat, number, KPI

**Unavailable Metric**: A training metric that the current domain model cannot
truthfully calculate. _Avoid_: Fake metric, mock stat

**Summary Count**: A truthful aggregate derived from existing sessions, such as
number of sessions or number of days in the horizon. _Avoid_: Metric, KPI

### Training load

**Training Load**: The cumulative physiological cost of **endurance** training
over time, expressed as daily TSS plus the CTL / ATL / TSB triad derived from it
— four quantities, of which three are the triad. Endurance-only by decision, not
by omission: a **strength Training Track** contributes no TSS at all, and so
reaches neither the daily total nor the triad, because pricing a lifting session
as `hours × assumed intensity` is the conversion ADR 0041 rejected and ADR 0045
closed (ADR 0046 §2, superseding ADR 0008's "intentionally rough" clause).
Cross-track fatigue interaction is therefore unmodelled and named as such, never
approximated. _Avoid_: Stress, fatigue, fitness (use the specific term)

**TSS (Training Stress Score)**: A single number representing the physiological
cost of one Workout Session or Activity Import. By convention, 100 TSS ≈ one
hour at threshold. Computed from one of several discipline-aware formulas. A
**strength** session resolves to no TSS at all for **Training Load** purposes;
any hand-logged strength figure lives in the per-discipline split as
display-only, so the total is no longer the sum of the split (ADR 0046 §2).
_Avoid_: Score, load score

**CTL (Chronic Training Load)**: A 42-day exponentially weighted average of
daily TSS, representing the athlete's accumulated fitness. _Avoid_: Fitness
score (CTL is the canonical name)

**ATL (Acute Training Load)**: A 7-day exponentially weighted average of daily
TSS, representing the athlete's recent fatigue. _Avoid_: Fatigue score

**TSB (Training Stress Balance)**: CTL minus ATL — the athlete's current form.
Positive TSB means rested; negative means under load. _Avoid_: Form score,
freshness

**Training Monotony**: _Future (not yet built)._ Foster's weekly
`mean daily load / SD of daily load`, with **strain** as
`weekly load × monotony` — the cheap published complement to **TSB**, covering
the blind spot where a week of seven identical days accumulates the same total
as a hard/easy week and tracks illness where load alone does not (research:
`planning-calendar-and-wellness.md`, `training-load-and-fitness-model.md`).
Computable from **Planned TSS** at authoring time, so the warning can fire
before the week is trained. A hint, never a gate: it comes from one n = 25
observational study and has not replicated cleanly, and it is labelled as such.
**ACWR** is the alternative the research declines outright — mathematically
coupled, arbitrary windows, ratio blow-up at low chronic load, and a formal
retraction request in _BJSM_. _Avoid_: ACWR, injury-risk score, freshness index

**Load Snapshot**: A single athlete's training load values for a single calendar
day in the athlete's local timezone (daily TSS totals, CTL, ATL, TSB). _Avoid_:
Daily load, load row

**Load Recompute Notice**: The one-time, athlete-visible explanation for a
correction that moved a **Load Snapshot** number the athlete had already read —
what changed, why, and the CTL it moved. Written by the one-shot backfill that
caused the movement, shown on the Dashboard until acknowledged. It exists
because ADR 0008 forbids switching an athlete's numbers _silently_; where the
athlete's own data has not changed there is nothing to opt into, so what is owed
is an explanation rather than an offer (ADR 0046 §2). A correction the app has
no written words for shows nothing at all — never a generic "some numbers
changed". _Avoid_: Banner, alert, migration message

**Load Formula**: The named method used to compute TSS for one session — one of
`coggan` (power-based), `hrTSS` (heart-rate-based), `rTSS` (pace-based run),
`sTSS` (CSS-based swim), or `sRPE` (perceived-effort fallback). Recorded as
provenance on each contribution so the chosen method is auditable. `sRPE` is the
terminal fallback of each **endurance** chain only — it is never applied to a
**strength** session, where it would be a conversion rather than a degraded
reading of a measurable quantity (ADR 0046 §2). _Avoid_: Method, calculation

**Normalized Power (NP)**: The intensity a variable-power ride "felt like"
physiologically — a 30-second rolling average of the **Activity Stream** power
channel, then the fourth root of the mean of fourth powers (ADR 0024, #174). The
honest input to `coggan` TSS: a usable power stream yields NP-based Coggan at
high confidence; without one, average power stands in at medium confidence,
never high. _Avoid_: Weighted power (the provider aggregate), average power (the
fallback, not NP)

**Planned TSS**: The TSS a Workout Session's prescription implies, computed from
each Step's resolved intensity midpoint via the same Load Formula as actual TSS
(ADR 0019). Stored on the Workout Session with a confidence of `full` or
`partial` (`null` when unavailable). Exists only to compare against actual TSS;
never feeds CTL/ATL/TSB. A session with no prescription never computes Planned
TSS — neither a `recorded` session nor a `detected` one whose **Workout** was
auto-materialized by a **Structure Detection** — because a plan reconstructed
from the session's own actuals would grade itself as ~perfect adherence by
construction; its **Adherence Band** stays unavailable ("—") (ADR 0034).
_Avoid_: Target load, expected TSS

**Adherence Band**: The three-state comparison of actual to Planned TSS —
`under`, `on-target`, or `over` — surfaced on the Session Ledger's load cell.
Asymmetric: overreaching flags sooner than undertraining (ADR 0019). _Avoid_:
Compliance, adherence score

**Weekly Plan Adherence**: The training week rolled up to a single Adherence
Band, computed as `sum(actual TSS) / sum(Planned TSS)` over the week and
surfaced in the home this-week stats (ADR 0019, #119). Summing before dividing
keeps compensation visible — one big session covering several skipped ones reads
on-target weekly. Sessions missing either side are excluded from both sums
(never zero-filled); a week with no resolvable planned load shows "—", not a
fabricated ratio. Display only — never feeds CTL/ATL/TSB. Scoped to
**endurance**: the ratio is an endurance figure and never claims to be the whole
week, because a strength session has no **Planned TSS** to divide by and is
excluded from both sums. A plan with a **strength Training Track** shows a
second figure beside it in strength's own currency — sessions completed vs
planned, a **Summary Count** rather than a second **Adherence Band**, since a
band would need asymmetric cut points no source supplies (ADR 0046 §4). A pure
lifter reads "—". _Avoid_: Weekly compliance, weekly score, "the week's
adherence" (it is the endurance half)

**Training Week**: The weekly window for Weekly Plan Adherence — a calendar
**Monday–Sunday** week evaluated in the Athlete Timezone (ADR 0019, #119). In
periodization terms the Training Week is the microcycle. _Avoid_: Rolling 7 days
(the alternative ADR 0019 left open; not chosen), microcycle (as a UI/code term
— recognized synonym only)

**Week Replan**: The persistent, at-most-once decision made when a Training Week
closes (ADR 0025): from that week's **Weekly Plan Adherence** and current
**TSB**, either soften the following week's still-scheduled sessions by one
documented volume rule (downward only, floored), or explicitly decline —
`no-change` or `insufficient-data` — with a plain-language reason. Stored per
closed week and never re-opened by late-arriving data, so a multiplicative
adjustment can never compound. Distinct from the ephemeral one-session ease the
Coach card's nudge applies. **Endurance-only**, and it stays that way: its scale
inverts a _TSS_ ratio, and a strength week's completed-vs-planned **Summary
Count** carries no volume semantics to invert — a skipped gym week is not
evidence for softening runs (ADR 0046 §4). _Avoid_: Auto-adjust, replanning
engine, plan correction

**Replan Note**: The plain-language reason a **Week Replan** attaches to each
**Workout Session** it softened, surfaced on the Workout Detail View and the
Session Ledger. Cleared when the prescription it explains is rewritten (a manual
edit or a Session Nudge ease). _Avoid_: Adjustment flag, audit note, coach
comment

**Athlete Timezone**: The IANA timezone used to determine which calendar day a
Workout Session or Activity Import belongs to for load aggregation. Stored on
Athlete Profile. Resolved through the Athlete Calendar. _Avoid_: Local time
(overloaded with display time)

**Athlete Calendar**: The single module resolving an instant to its calendar day
and Training Week in the Athlete Timezone, and a local day/week to its UTC
bounds. Canonical for both Load Snapshot day-bucketing and Weekly Plan Adherence
week windows (#122). _Avoid_: date utils, time helpers

**Fitness Projection**: The forward extension of the CTL curve from today to the
**Target Event**, replaying the active **Plan Outline**'s **endurance Training
Tracks** through the same 42-day CTL EWMA the measured curve uses (#132). Only
endurance tracks project: a **strength** track carries no TSS, so a season that
cuts running to lift shows CTL falling exactly as far as the endurance volume
actually fell, and a plan with no endurance track at all is an **Unavailable
Metric** rather than a curve at zero (ADR 0041). Derived and display-only — it
never creates or mutates **Load Snapshots**. It replays the **per-week** targets
the Outline derives (ADR 0040), not a per-phase figure, so a recovery week and a
taper show as dips in the curve. Prescribed volume becomes projectable daily TSS
through a **Volume Conversion**, which replaces the flat ≈60 TSS per endurance
hour that ADR 0040 §9 retired (ADR 0045). A track authored in **TSS** needs no
conversion at all; one authored in **km** needs its discipline's pace source,
and a **sets** track never converts. A week is `null` — an **Unavailable
Metric** — as soon as _any_ endurance track cannot express it, because a partial
sum over some disciplines would read as the athlete's whole week. Because the
projection joins the **measured** CTL curve, the conversion prices intensity
through the athlete's own **Zone Recipe** and **Load Formula**: a different
intensity model on the planned side would step the curve at today for no
training reason. The curve carries **one** derivation statement for its whole
length, since a curve cannot annotate every point. Honest by construction:
without an active plan there is no projection (the curve ends at today), and an
untrustworthy CTL baseline or a pattern-less Outline yields an **Unavailable
Metric**, never a guessed curve. Only fitness (CTL) is projected; a flat
daily-average load makes ATL/TSB meaningless. _Avoid_: Forecast, predicted
fitness, trend line

**Volume Conversion**: How a **Training Track**'s weekly volume is read in a
currency it was not authored in — the successor to the flat ≈60 TSS per
endurance hour, and a function of volume **and** the **Quality Session Mix**
rather than a scalar (ADR 0040 §9, ADR 0043 §8, ADR 0045). It **decomposes** the
week into one easy bucket plus one bucket per zone in the mix, prices each
through the athlete's own **Zone Recipe**, and moves each between distance, time
and TSS through the discipline's stored threshold — so the week's three readings
are projections of one decomposition and can never disagree. Two documented
**conventions** carry what the mix does not state: minutes-in-zone per quality
session (absolute, never a share of the week, or the derived curve would be the
volume curve scaled), and an easy-pace ratio, which is a constant only where the
ratio is stable between athletes — 0.83 running, 0.93 swimming, and for cycling
the athlete's own history, because speed there depends on terrain, wind and
equipment. Symmetric over km, hours and TSS, with one gate: anything touching
**distance** needs a pace source, while hours ↔ TSS needs none. Never applies to
**sets**, and never sets the **Season Span**, which reads the guideline layer in
the track's own currency. It carries no **Load Confidence** — that vocabulary
gates things and this figure gates nothing — only a binary `authored | derived`,
its full derivation, and an **Unavailable Metric** where the gate closes. It is
**not Planned TSS**: Planned TSS is per session, computed from **Steps**,
stored, and graded `full | partial`, where this is per week, computed from
guidelines, and never stored (ADR 0045 §9). It never reads a **Week Pattern**
either — no stored field says which weeks a pattern governs, and a pattern day
carries no zone (§11). _Avoid_: TSS per hour (the retired scalar), unit
conversion, exchange rate (there is none between sets and TSS).

### Wellness and readiness

**Daily Wellness**: _Future (not yet built)._ The athlete's one-tap morning
record — one row per athlete per local date in the **Athlete Timezone**, every
field nullable: resting heart rate, **HRV (rMSSD)**, sleep hours and sleep
quality, body weight, the four **Hooper Index** scales, motivation, an
illness/injury flag, and the confounder flags (alcohol, travel, altitude) whose
absence would let a bad night read as overtraining (research:
`planning-calendar-and-wellness.md`). It also stores **measurement context** —
posture, duration, device — so a protocol change invalidates a baseline honestly
instead of silently; a comparison across a posture change or a device change is
not a comparison. Baselines are computed, materialised and re-derivable, the
same pattern as the **Load Snapshot**. The argument for it existing at all is
that subjective self-report is _more_ sensitive and more consistent than the
common objective markers (Saw 2016, 56 studies). A missing reading is `null` and
produces "no recommendation", never a zero (ADR 0008). Wellness stays **out of**
the **Training Load** triad: HRV is not load, and folding it into CTL/ATL/TSB as
a modifier is exactly the cross-currency number ADR 0046 forbids. Menstrual
cycle phase is captured for the athlete's own pattern-finding and drives no
rule, because the meta-analysis that exists finds only a trivial effect, rates
68 % of its studies low quality, and concludes general guidelines cannot be
formed. _Avoid_: Check-in, morning survey, biometrics

**HRV (rMSSD)**: The parasympathetic marker with the most training-guidance
evidence — the root mean square of successive R-R differences, captured 1–5
minutes on waking in a fixed posture. Stored **raw in milliseconds**;
`ln(rMSSD)` is derived, because rMSSD is log-normally distributed over roughly
10–200 ms, and the familiar `ln(rMSSD) × 20` scaling is **cosmetic** — every
statistic runs on `lnRMSSD` and the ×20 exists only so the display sits on a
0–100-ish scale (research: `planning-calendar-and-wellness.md`). The unit of
analysis is the **7-day rolling mean**, never a single day (Plews 2013). A high
reading is not automatically good: a rising mean alongside a rising coefficient
of variation indicates maladaptation (parasympathetic saturation), and HRV
responds to alcohol, illness, poor sleep, heat, altitude and psychological
stress at least as strongly as to training — it is a **total**-load signal, not
a training-load signal, and the app says so. _Avoid_: HRV score (the vendor
composite), heart rate variability unqualified (SDNN and rMSSD are different
numbers), recovery score

**HRV Normal Range**: The athlete's own band that the **HRV (rMSSD)** 7-day
rolling mean is read against — `mean ± SWC` of that rolling series over a
trailing 60 days, where the smallest worthwhile change is `0.5 × SD` (Vesterinen
2016, Javaloyes 2019) (research: `planning-calendar-and-wellness.md`). Inside
the band, follow the plan; below it, downgrade to easy, and to rest when it sits
more than 2 SWC below or below the band three consecutive days; above it, hard
work is permitted unless the 7-day CV is elevated too. Requires ≥ 21 readings in
the last 30 days and 60 days of baseline history, so **"not enough data" is a
routine outcome, not an edge case** — which is the same honest refusal ADR
0025's `insufficient-data` already models. Corroborating signals — resting HR
above baseline + 5 bpm on the 7-day roll, short sleep, a **Hooper Index** more
than 1 SD above baseline, an overnight weight drop beyond 2 % — may only add
caution and never upgrade. The absolute number carries no meaning across
athletes; only the deviation from this athlete's own baseline does. _Avoid_: HRV
threshold, red/amber/green, baseline unqualified (a **Threshold** has one too)

**Hooper Index**: The four-item subjective wellness sum — fatigue, muscle
soreness, stress and sleep quality, each 1–5, totalling 4–20 (Hooper & Mackinnon
1995, validated in swimmers over a six-month season; the original scales were
1–7 and both 1–5 and 1–10 variants circulate) (research:
`planning-calendar-and-wellness.md`). Stored as typed scale values, not
integers-as-strings. Like **HRV (rMSSD)** it is read only as a deviation from
the athlete's own baseline: the absolute number is meaningless across athletes.
_Avoid_: Wellness score, mood score, RPE (a different scale measuring a
different thing)

**Readiness**: _Future (not yet built)._ The multi-signal record answering "what
should today be?" — per-signal states (`hrvState` and `subjectiveState`, each
`below | normal | above | unavailable`), an explicit **agreement** flag, a
recommendation (`REST | EASY | FOLLOW_PLAN | HARD_OK | NO_RECOMMENDATION`), the
plain-language reasons that produced it, and a `full | partial` confidence
(research: `planning-calendar-and-wellness.md`). Deliberately **not a composite
score**, on three grounds: the inputs disagree meaningfully and the disagreement
_is_ the information (high HRV plus terrible subjective scores is a recognisable
state, and averaging it to "68 % ready" destroys it); the weights are
unknowable, since no published weighting of `lnRMSSD` against a soreness score
generalises across athletes, so any composite is an invented constant wearing a
lab coat; and a number invites false precision and hides missing data, where a
day with no reading must produce "no recommendation" rather than a score
computed from whatever happened to exist. A disagreement is **stated, never
resolved**. This is the shape ADR 0010's one-Form-number decision should be
superseded into — TSB is load-derived form, and subjective wellness outperforms
objective markers — and it generalises the `{ label, recommendation, tone }`
shape the **Adherence Band** and the **Coach card** already use. A below-range
**HRV Normal Range** reading is the natural third gate on a **Week Replan**,
firing the same restricted, downward-only, at-most-once adjustment under exactly
ADR 0025's existing discipline. _Avoid_: Readiness score, recovery score, body
battery, form (that is **TSB**)

### Proof and progress

**Personal Record**: An athlete's best recorded effort for one Benchmark Kind
within a single Discipline — the discipline, the kind, the value, the achieving
Workout Session, and the date. Always _derived_ from completed Workout Sessions
and promoted Activity Imports by a pure detection function, never authored.
Honours the same trust gate as Training Load (ADR 0008): low-confidence efforts
(e.g. the `sRPE` hand-logged fallback) and efforts with no Load Confidence do
not qualify. _Avoid_: PB, best, achievement, milestone

**Benchmark Kind**: The dimension a Personal Record measures. v1 has one —
`farthest`, the longest single-effort distance — because only whole-activity
telemetry is ingested; per-sample stream benchmarks (split times, power curves)
wait on stream ingest. _Avoid_: PR type, metric, category

**Performance Result**: _Future (not yet built)._ One dated maximal performance
— discipline, distance, time, when it happened, and whether it came from a race,
a time trial or a training segment — the queryable history **Race Equivalence**
resolves from at its top two rungs, and the single blocker for portable
race-pace targets (research: `portable-intensity-anchors.md`). Distinct from an
**Event Target**, which is a _goal_: a goal that was met produces a result and a
goal that was missed produces one too, so the two must not be overloaded into
one field. Distinct from a **Personal Record**, which is the _derived best_ over
a **Benchmark Kind**; a Performance Result is the raw datum a record is chosen
from. The most reliable non-race source is not a curve fit but a deliberately
repeated effort — a 3 km time trial or a 20-minute tempo on the same route every
6–8 weeks — which is already expressible as an **Event** of `kind: 'time-trial'`
and enters the ladder at rung 1 rather than rung 4. _Avoid_: Race result (a time
trial is not a race), PB list, benchmark

**Proof Strip**: The Cockpit home zone that shows the athlete's current Personal
Records — one chip per Discipline, each with the record value and the gain over
the previous best. With no qualifying efforts it shows an empty / Unavailable
state, never a fabricated zero. _Avoid_: PR widget, records bar, achievements

### Session state and time

**Session Status**: The lifecycle state of a workout session (scheduled,
completed, skipped, missed). _Avoid_: State, progress

**Scheduled At (UTC)**: The canonical stored timestamp for when a workout
session starts. _Avoid_: Local time field, display time

**Local Display Time**: The user-visible representation of a scheduled timestamp
in viewer-local time. _Avoid_: Stored time, DB time

**14-Day Horizon**: The fixed rolling window used to determine which sessions
are upcoming. _Avoid_: Sprint window, month view

**Discipline Query**: The URL query parameter that preserves the selected
discipline filter. _Avoid_: Local filter state, tab state

### People and scope

**Self-Coaching Athlete**: The primary user who plans and reviews their own
training without coach workflows. _Avoid_: Coach-managed athlete, team user

**Authenticated User**: The signed-in identity used for data ownership and
access control. _Avoid_: Viewer; _avoid bare_ "account" (use **Authenticated
User** for internal identity, **Account Connection** for an external service
account)

**Owner**: The authenticated user who owns workouts and workout sessions.
_Avoid_: Creator, participant

### App structure

**The Tape**: A long-term idea for a single horizontal scrubbable timeline of
Workout Sessions (past left, planned right, "Now" centered). _Not_ the current
navigation model — today the app uses distinct surfaces. Retained as a possible
future direction, not a present primitive. _Avoid_: Calendar, grid; do not treat
as built.

**Dashboard**: The logged-in athlete's home view at `/`, and the default
destination after login. It is the single viewing surface for training, composed
decide-then-dig-in (#184): a header carrying the plan-arc chip (the **Plan
card**'s arc signals, → the **Target Event** detail) and the single "+ New"
creation menu; a permanent decision strip (the **Coach card** and today's
session merged — Form value + plain-language label, the session with its
resolved target, the coach's one-line reasoning, one status-derived action); and
everything analytical behind Week / Trends / History tabs — Week (the This Week
strip + recent planned-vs-actual), Trends (fitness trend, weekly load, **Proof
Strip** — the one home for the load story), History (the **Session Ledger**).
One tab panel renders at a time and the selected tab persists in the URL. (ADR
0010, ADR 0017, ADR 0018.) Long-term it is a zoom level of the Tape, not a
separate concept. _Avoid_: Home page, landing page, feed

**Coach card**: The headline Form (TSB) signal at the top of the home view — the
single daily "go hard or recover?" answer. While Form (TSB) is untrustworthy
(thin load history) it shows a "building baseline — day N/42" state; once
trustworthy it shows the plain-language readiness label plus a short
recommendation. Since #184 it renders as the Form half of the **Dashboard**'s
permanent decision strip (merged with today's session and its single action);
the supporting CTL/ATL/TSB evidence and trend live in the **Training Load
Section** on the same surface, so the card itself carries no link to a separate
page. Its one-number premise is what the research challenges: subjective
wellness outperforms objective markers and TSB is neither, so the card should
become the load-form half of a multi-signal **Readiness** record carrying an
agreement flag — superseding ADR 0010 on that point (research:
`planning-calendar-and-wellness.md`). _Avoid_: TSB widget, form box, readiness
card

**Training Load Section**: The home-surface section that exposes the **Training
Load** triad as evidence beside the fitness trend — since #184 it lives in the
**Dashboard**'s Trends tab, the one home for the load story. It absorbs what was
the standalone `/training/load` deep-dive (ADR 0017). During cold-start it stays
visible but honest, carrying the same "building baseline — day N/42" caveat as
the Coach card rather than hiding. _Avoid_: Load page, load widget, dashboard
charts

**Plan card**: The home-surface summary of the athlete's active plan — since
#184 a compact plan-arc chip in the **Dashboard** header that opens the **Target
Event** detail (ADR 0018). The Coach card answers "today" and the Training Load
Section is its evidence; the Plan card answers "where in the arc". It shows
arc-level signals only: the current **Plan Outline** phase, week N of M,
countdown to the **Target Event**, and elapsed progress through the plan's
weeks. It does _not_ repeat this-week counts or the next session. Progress is
measured as weeks elapsed of total weeks, never as sessions-completed —
completion ratio is an **Unavailable Metric** because later phases are not yet
materialized. When no active plan exists, the same slot carries the call to
_author_ one — manual planning, since **Plan Generation** is retired (ADR 0039,
0044). _Avoid_: Plan widget, journey card, progress card, plan banner

### Recording and import

**Account Connection**: An athlete's authorized link to an external training
service account (Strava, Intervals.icu, Garmin, Polar) used to exchange training
data. One per athlete per external account. The external account ID is stored as
`externalAthleteId`. Credentials vary by provider: an OAuth token pair that
refreshes and expires (Strava), or a personal API key that does neither
(Intervals.icu) — key-based connections have no refresh token or expiry. Carries
a `status`: `active`, `expired`, `revoked`, or `error`. `expired` is
self-healing via background token refresh, is not surfaced to the athlete, and
never occurs for key-based providers. `revoked` means the source provider
invalidated the authorization (athlete deauthorized at source, regenerated their
API key, or refresh permanently failed) and requires athlete re-authorization.
`error` is reserved for unexpected source-side failures requiring triage.
Operational sync state (idle / actively fetching) is _not_ a `status` value — it
is derived from the job queue. Manually uploaded Activity Imports use no Account
Connection. _Avoid_: Integration, Connected Account, Service Connection,
Provider Connection, Sync Source.

**Integration Hub**: The settings surface (`/settings/integrations`) listing
every activity source in one place — the athlete's **Account Connections** with
plain-language states and their reconnect / disconnect / manual-sync actions,
connectable providers with their per-provider connect flows (OAuth redirect or
paste-an-API-key), manual file upload, and honest coming-soon entries for
providers whose APIs sit behind partner-approval programs (Garmin, Suunto).
Rendered from a display-only provider directory; provider behavior stays in
per-provider folders with no shared interface (ADR 0014, ADR 0026). With the
Activity Inbox retired (ADR 0049) this is the only surface for sources: the
"Sync now" safety valve and the manual-upload entry point both live here.
_Avoid_: Integrations page, connections screen, sync settings, provider
marketplace.

**Backfill Window**: The historical reach of Activity Imports retrieved from a
newly-connected Account Connection. The reach is **count-based, not a fixed time
window** (ADR 0013, amended #151): it goes back far enough to collect at least
`BACKFILL_TARGET_SESSIONS` (50) modeled-discipline workouts — so an infrequent
athlete still gets a meaningful history — bounded below by a `BACKFILL_MIN_DAYS`
(42, the CTL window) floor so Training Load is always seeded, and above by a
`BACKFILL_MAX_DAYS` (365) age cap. Backfill runs as a background job (not
synchronous with connect) and auto-promotes imports without a same-day planned
Workout Session to recording-only Workout Sessions. _Avoid_: Initial sync,
history sync, "the 42-day window" (42 days is now only the minimum floor).

**Activity Import**: A raw telemetry record imported from an external provider
(Strava, Garmin, manual upload). Never rendered on the Tape directly — it
reaches the Tape through the **Workout Session** **Auto-Save** attaches it to,
which is also what makes it count toward load metrics. _Avoid_: Activity
(overloaded with Activity Type), raw activity, sync record, inbox item

**Recording**: An Activity Import that has been linked to a Workout Session as
its executed telemetry. The Tape uses a Recording to show planned-vs-actual on a
Session tile. _Avoid_: Execution, log (collides with Session Log), result

**Activity Stream**: The per-sample telemetry for an Activity Import — an
elapsed-time axis plus optional power, heart-rate, and pace channels — stored
downsampled and index-aligned (a coarse `resolutionSec`, a capped `sampleCount`,
`null` entries marking paused gaps) so it stays bounded (ADR 0020). One per
Activity Import; many imports have none — stream presence tracks recorded
telemetry, not upload-vs-provider (FIT/GPX/TCX uploads with telemetry all carry
one; ADR 0036). Feeds the **Telemetry Overlay**. _Avoid_: Samples, trackpoints,
time series, raw stream

**Telemetry Overlay**: The Workout Detail View chart that plots a Recording's
**Activity Stream** (power, heart rate, and pace over time) against the plan —
the planned **Intensity Target** bands across the axis, paused stretches as
gaps, and the planned **Workout Shape** beneath. Interactive on the **Chart
Primitive** (ADR 0029/0030): **Chart Inspect** scrubs the whole stream and reads
every channel at one point into the fixed panel below, with a `null` reading
shown as `n/a` (never interpolated). Renders only from a real Activity Stream;
absent one it is an **Unavailable Metric**, never a curve faked from aggregates
(ADR 0008). It does not assert per-step verdicts. _Avoid_: Graph, telemetry
chart, planned-vs-actual chart

**Promotion**: The act of linking an Activity Import to a Workout Session as its
Recording. Always automatic at ingest (see **Auto-Save**); the athlete's only
involvement is correcting a wrong one afterwards. _Avoid_: Attach, import, sync

**Auto-Save**: What happens to every Activity Import the moment it lands
(ADR 0049) — it is matched onto a same-day, same-discipline planned **Workout
Session** when exactly one fits, and otherwise gets a recording-only session of
its own. One rule for every ingest path (manual sync, webhook, **Backfill
Window**, file upload, share target), so an import is never left unattached and
invisible. There is no **Activity Inbox** and no confirmation step; a wrong
auto-match is corrected from the **Workout Detail View**, which can move a
**Recording** to another planned session that day or lift it off the plan onto
its own. `'other'` imports (ADR 0015) never match a plan but still auto-save.
_Avoid_: Activity Inbox, import queue, promote step, confirmation.

**Auto-Save Mirror**: An **Activity Import** the athlete has not built anything
on — its recording-only session is still structureless and carries no **Session
Log**. This is the line ADR 0012's source-side rules now use in place of
"non-promoted", which Auto-Save made vacuous (ADR 0049): a mirror still tracks
its source, so a provider `update` refreshes it and a provider `delete` removes
it along with its session. Anything else is training history and is immutable to
source-side changes. _Avoid_: unpromoted import, inbox copy, draft.

**Structure Detection**: The rule-based (no AI) reconstruction of a run or bike
**Activity Import**'s workout structure — warmup, repeated efforts, cooldown —
from its **Activity Stream** (refined by provider laps), expressed in the
**Workout → Block → Step** vocabulary and carrying a **Detection Confidence**.
Derived and re-computable, at most one per Activity Import (many have none), and
stored as a sibling of the **Activity Stream**, cascade-deleted with the import
so it rides with a promoted **Recording** (ADR 0012). When it clears the honesty
bar its structure is auto-materialized onto the recording-only session's
**Workout**; below the bar the recording stays structureless (an **Unavailable
Metric**, "no structure detected"), never a fabricated guess. There is no
candidate inbox or confirmation step — the engine may rank internally, but only
the single winning structure is stored, and the athlete edits the materialized
**Workout** like any other (ADR 0032). _Avoid_: Auto-analysis, workout
detection, candidate structure, interval detection.

**Detection Confidence**: The trust level of a **Structure Detection**, reusing
the **Load Confidence** vocabulary — `high | medium | low`, or _absent_ when
nothing clears the honesty gate (an **Unavailable Metric**, never a fabricated
low score). Two layers (ADR 0033): a binary **honesty gate** decides whether
genuine structure exists — anchored on _band-separation_ (a work segment counts
only if it sits ≥ 1 training zone above the easy/baseline band), plus a
recovery-sanity guard and a minimum-coverage floor; a single sustained elevated
block clears it, repeats are not required. Below the gate, and whenever the
classifying threshold is missing so zones cannot resolve, Detection Confidence
is _absent_. Above it, every detection auto-imports (there is no second
threshold — `low` materializes too, badged `low`; ADR 0032), graded
high/medium/low for honest display from the segmentation's cleanliness, then
capped by input trust: HR-classified intensity never exceeds `medium` (the ADR
0024 average-power rule), while provider laps only _enable_ detection, never
raise the ceiling. The internal 0–1 score is never stored — only the grade or
_absent_. Numeric cut points are build-time calibration. Classification runs on
the discipline's anchor channel — bike → power, run → **running power**
(critical power) when that threshold is set, else pace; HR only as a fallback —
so the HR `medium` cap applies exactly when the anchor threshold is missing and
classification falls to HR (ADR 0035/0038). Running power is a direct
measurement like cycling power, so it is _not_ HR-capped (ADR 0038). _Avoid_:
Detection score, match score, a bespoke 0–1 scale.

**Structure Adherence**: The coarse, whole-session comparison of a matched
planned session's _detected_ structure against its _prescribed_ structure,
surfaced beside the **Adherence Band** on the **Workout Detail View** (ADR
0034). Detection runs **plan-blind** (the prescription never biases the engine),
so this is an honest after-the-fact verification, not a self-fulfilling match.
It is deliberately **asymmetric** because **Structure Detection** systematically
_under_-detects (merges warmup ramps, is blind to short and in-zone reps, #330):
it confirms `as-prescribed` when the detected structure corroborates the planned
archetype, may assert `diverged` only when detection _confidently_ finds
structure the plan did not prescribe (the engine never fabricates structure, so
surplus detected structure is real), and degrades to an **Unavailable Metric**
("structure not confidently verifiable") whenever detection finds _less_ than
planned — that gap cannot be told apart from detector blindness, so it is never
charged to the athlete as a missed-reps verdict (ADR 0008). Whole-session only —
it asserts no per-step verdicts (the **Telemetry Overlay**'s deliberate stance)
— display-derived (a pure function of the two stored structures, never stored),
and it never feeds **Planned TSS** or **Training Load**. Match tolerances are
tunable build-time constants (cf. ADR 0019 band cut points). _Avoid_: per-step
verdict, interval grade, compliance score, "X of Y intervals".

**Job Queue**: The in-process background-work primitive (ADR 0013). A `Job` row
carries a `kind` (which handler runs it) and an opaque JSON `payload`, with
retry/backoff and a terminal `failed` state. A single polling worker drains the
queue one job at a time. The Backfill Window is its first `kind`; webhook-fetch
and reconciliation-poll reuse it. _Avoid_: Task queue, worker pool, scheduler

**Live Imports Stream**: The per-athlete Server-Sent Events channel that pushes
"a new Activity Import landed" to the athlete's open tabs so the home surface
revalidates without a page reload and the **Auto-Save**d session appears on the
Tape (ADR 0013, #75, ADR 0049). Every `createActivityImport` publishes to the
owning athlete's stream — manual sync, Backfill Window, file upload, and future
webhook ingest all flow through the one publisher. _Avoid_: WebSocket, push
notification, socket

### Events and plan anchors

**Event**: An athlete's anchor point on the right side of The Tape — a race, a
time trial, or a self-set fitness goal that a Training Plan builds toward. One
entity covers both real races and abstract goals; `kind` discriminates. _Avoid_:
Goal, Race, GoalEvent, target (overloaded with Intensity Target)

**Event Priority**: The Friel-standard A/B/C designation indicating how much the
Training Plan should peak for this Event. A drives full taper; B is a light
week; C is folded into the normal training week. _Avoid_: Importance, weight

**Event Target**: The structured goal for an Event, expressed as a discriminated
union over time, pace, distance, placement, finish, or qualitative description.
_Avoid_: Goal value, performance target

**Event Result**: The post-event outcome, represented by the Workout Session the
athlete executed for the Event (linked via `resultSessionId`). The Session's
Recording, Session Log, and TSS hold the actual numbers; the Event itself does
not duplicate them. _Avoid_: Race result row, achievement

### Plan generation

**Plan Generation**: _Retired (ADR 0044)._ Formerly producing a forward
**Training Plan** for an athlete from a goal or **Event** using an AI model,
shown as a **Plan Preview** and not persisted until approved. Deleted with the
JSON `planOutline` blob it wrote: V1 planning is fully manual, no phase carries
load (ADR 0041) and `focus` is gone (ADR 0042), so its output contract had no
target left. Rebuilding it on the manual planning foundation is its own effort.
_Avoid_: AI plan, auto-plan.

**Plan Preview**: _Retired with **Plan Generation** (ADR 0044)._ The transient,
un-persisted result of a generation, reviewed before anything was written. The
principle outlives the feature: nothing reaches the calendar unapproved, and
there is still no draft session state. _Avoid_: Draft (no draft session state
exists).

**Generated Session**: A **Workout Session** whose **Session Source** is
generation rather than manual authoring or recording. Editing a Generated
Session _adopts_ it — its **Session Source** becomes `authored`, protecting it
from being replaced on regeneration. No new ones are produced while **Plan
Generation** is retired (ADR 0044); the `generated` source stays in the
vocabulary because sessions already recorded as generated are history, and
history is immutable (ADR 0012). _Avoid_: AI workout, auto session.

**Session Source**: The origin of a **Workout Session** — `authored` (created by
the athlete), `generated` (produced by **Plan Generation**), `recorded`
(materialized from an **Activity Import** with no plan, no structure), or
`detected` (a recording-only session whose **Workout** was auto-materialized
from a **Structure Detection** above the honesty gate; ADR 0033). Like a
**Generated Session**, editing a `detected` session's structure _adopts_ it —
the source becomes `authored` and the "detected" badge clears. _Avoid_: Origin,
type.

**Target Event**: The **Event** a **Workout Session** builds toward. Distinct
from **Event Result**, which is the single session that _was_ the event's
execution. A Generated Session anchors to the Target Event that drove its
generation. _Avoid_: Goal event, linked event.

**Plan Outline**: The periodized structure spanning the full horizon, stored
**relationally** against the **Event** — a sequence of phases (e.g. base / build
/ peak / taper) plus the **Training Tracks** measured over them. Rows, not a
JSON blob: manual authoring makes it primary data the athlete edits piece by
piece, and the repo already models authored nested structure as rows while
reserving JSON for value objects, so the invariants (one track per
**Discipline**, one endurance segment per phase, zones 3–5 in a mix) are
enforced by the database rather than by a validator (ADR 0044). The single
authored periodization structure (ADR 0039); manual authoring is its only
producer in V1, since **Plan Generation** is retired. Its phases are the
mesocycles of periodization theory. _Avoid_: Periodization blob (what it was
until ADR 0044), schedule template, mesocycle (as a UI/code term — recognized
synonym for a phase only).

**Plan Start Week**: The **Plan Outline**'s first **Training Week** — that
week's Monday, stored as a `weekKey` (`YYYY-MM-DD` in the **Athlete Timezone**,
the same key **Week Replan** uses). **Authored**, not counted back from the
**Target Event**: laying the phases forward from it means adding a phase never
moves the plan's start into the past, over weeks the athlete never lived (ADR
0044). A plan may therefore end before or after its Event, which is shown
honestly rather than stretched to fit. Every phase's from/to dates are
**derived** from it, so no stored pair can disagree about them. _Avoid_: Plan
start date (it is a week, not a day), plan epoch, week 0.

**Season Fit**: Where the plan's last **Training Week** falls against the
**Target Event**'s week — on it, before it, or past it — and the one-tap resize
that closes the gap. The reading is never corrected by the app: a
**Periodization Preset** is a fixed length and nothing stretches it (ADR 0044).
The resize is the athlete's act and is stated in full before they take it —
every block that changes, from how many weeks to how many — and what lands is
ordinary resizes they could have typed (ADR 0048 §3). **The rule, in one line:
base absorbs first, the taper never.** Weeks to add all go to the first
non-tapering block. Weeks to remove come off that same block first, then forward
through the season block by block, so the **Peak** — nearest the Event and the
most race-specific work in the season — gives last: _the further a block is from
the Event, the sooner it gives._ A **tapering** phase is never touched in either
direction, because a compressed taper is the single change that reliably costs
the athlete the Event. No block is trimmed out of existence, and a trim that
cannot land in full is **no offer at all**, because removing a block is a
decision and stays the athlete's. The rule replaced a proportional one — take
from whichever block is longest — that reached the **Peak** while the base was
still long and could not be said in a sentence (ADR 0048 §6, amending §3). It is
written down in four places on purpose: the ADR, `proposeFit`, this entry and
the gallery's own copy, because a rule that exists only as the shape of a loop
is one nobody can disagree with. Recomputed server-side when it is applied, so a
stale proposal cannot land an edit nobody was shown. _Avoid_: Auto-fit, stretch,
scale the plan (the app never does any of the three on its own).

**Plan Outline phase**: One stretch of the season within a **Plan Outline** —
its span, its intent, its loading/recovery rhythm and whether it tapers. A phase
carries **no volume, no unit, no discipline and no intensity emphasis**: it says
_when_ and _why_, never _how much_ or _how hard_ (ADR 0041, 0042). Volume and
emphasis belong to the **Training Tracks** measured over it, so the phase's name
is the only word it carries — deliberately **free text** rather than an enum,
since nothing branches on it, a closed set would refuse "Off-season" or "Return
to run", and the name carries _intent_ that no derived quantity can (ADR 0044).
Its rhythm says _which_ weeks recover; how deep the cut goes is a volume
quantity and belongs to the **Training Track segment**. Phases are contiguous by
construction — position plus a week count, with dates derived from the **Plan
Start Week** — so a gap or an overlap in a season is unrepresentable. _Avoid_:
Block (UI word only), mesocycle, load phase, focus (the removed prototype field,
ADR 0042).

**Training Track**: One **Discipline** measured over a **Plan Outline**'s
phases, owning its **Volume Currency**, its progression rule, its own
segmentation (ADR 0041) and its own **intensity emphasis vocabulary** (ADR
0042). No track is the plan's spine: a pure runner and a pure lifter each author
one track, a hybrid authors two, and a triathlete who lifts authors four — over
**one** shared phase timeline, because the athlete peaks for one event in every
discipline at once (ADR 0043). Strength volume is a different quantity from
endurance load, not a lossy version of it: there is no conversion between sets
and TSS, only an assumption. _Avoid_: Discipline (the same word at workout scope
— a track is the season-scale counterpart, not a different kind of thing), lane,
stream, side-car, parallel plan (there is no `Plan` entity to run in parallel —
ADR 0039).

**Volume Currency**: The unit a **Training Track** authors its volume in — km,
hours, TSS, or sets for strength — where `sets` means **total working sets per
week**, a systemic scalar and never per muscle group or per movement (ADR 0047).
It belongs to the **track**, never to a **Training Track segment** and never to
the plan, so segments _cannot_ disagree about units and no conversion is
possible inside a track (ADR 0043). Proposed from the **Season Anchor**'s
pre-fill as the least-derived unit that can express the athlete's history, then
**fixed for the life of the track** — changing it would rewrite weeks already
lived, so it is re-authoring rather than an edit. Reading a track in another
currency is a derived view, never a change of what is authored — a **Volume
Conversion**, which since ADR 0045 exists, is symmetric over km, hours and TSS,
and needs a pace source only where distance is involved. _Avoid_: Unit
(ambiguous with **Intensity Target** units), reporting unit, block currency (its
carrier was the phase in #366 and the track segment in ADR 0041).

**Training Track segment**: One stretch of a **Training Track** over which its
progression is authored — its **Volume Ramp** and **Block Boundary Step**, plus
a **Quality Session Mix** on endurance or a **Strength Goal** and a
sessions-per-week frequency on strength, but never a unit (that is the track's
**Volume Currency**, ADR 0043). An **endurance** track's segment spans exactly
one **Plan Outline phase** — its length is authored, and what it is authored
against is the phase structure (ADR 0042) — so it is stored _by reference to
that phase_ and holds no dates of its own to drift from it. A **strength**
track's segments float free of the phases and carry their own **Plan Start
Week**-style start plus an authored duration (ADR 0044). Three reasons they
float, none of them the length-as-a-consequence-of-MRV argument ADR 0041
originally gave, which fell with the landmarks (ADR 0047): a strength deload
landing because the _running_ phase ended is exactly the coupling Issurin
separates blocks to avoid; a _gap_ between segments is a meaningful state ("no
lifting these weeks") and a sub-phase gap ("weeks 1–8 of a 12-week Base") is
unrepresentable if segments align to phases; and a 4–8 week mesocycle plus a
deload has no reason to divide an endurance phase. A segment also carries how
deep its recovery week, taper or deload cuts — unset meaning "follow the
documented convention", which is deliberately distinguishable from an authored
number of the same size. _Avoid_: Block (UI word only), track phase, lane
segment.

**Season Span**: The season headline — a **Training Track**'s authored starting
volume and its peak loading week, per week, in its **Volume Currency**
(`55 → 78 km/wk`, `12 → 21 sets/wk`). A span rather than a season total, because
a total conflates how big a plan is with how long it is, hides the **Volume
Ramp** that is half the authored plan, and forces a ruling on whether recovery
and taper weeks count; a season total remains available as a secondary figure
(ADR 0043). Read from the authored guideline level — the **Season Anchor** and
the ramps — never summed from materialized **Workout Sessions**, so the number
does not change character with how far into the season the athlete is. One span
per **commensurability group** rather than per track, so it adapts to the plan's
contents and never needs an **Unavailable Metric**: every track can express its
own currency. _Avoid_: Season total (the secondary figure, not the headline),
volume goal, peak week (only half of it).

**Volume Landmarks**: _Retired (ADR 0047)._ Formerly the bounds a strength
**Training Track** progressed between — MV < MEV < MAV < MRV, as _athlete_
attributes ratcheting upward between segments, with a segment authoring two
landmarks and a duration rather than a rate (ADR 0041). Retired on evidence, and
the reason is kept because the vocabulary is everywhere in strength-training
material and a reader is owed an account of why this app declined it: the
taxonomy appears in **zero** position stands and **zero** PubMed-indexed
resistance-training papers and traces entirely to one vendor; that vendor's own
two publications disagree by up to 2×; the published shape is not four scalars
(MRV is `f(muscle, frequency)`, MAV is per-session and self-labelled
speculative, MEV = 0 for five muscles); and **MRV** — the member ADR 0041 leaned
on hardest, making segment length a consequence of reaching it — has no
empirical anchor at all, since no meta-analysis locates a recoverable maximum. A
strength track now progresses by **Season Anchor** plus **Volume Ramp**, the
same machinery as endurance. See
[`380-strength-volume-landmarks.md`](docs/wayfinder/manual-training-planning/380-strength-volume-landmarks.md);
the per-muscle numbers in the older reference file are **wrong**, not merely
unverified.

**Season Anchor**: The athlete's authored starting volume for a **Training
Track**'s season — an ordered list of dated segments `(fromWeekKey, value)`, not
a single number, so that lowering volume mid-season never rewrites weeks already
lived (ADR 0040). Dated by the week's Monday rather than by an index into the
plan, because an index shifts under a structural edit and would move the very
weeks the dating exists to protect (ADR 0044). Each segment restarts the
**Volume Ramp** from itself; none carries a unit, because the unit is the
track's **Volume Currency** and a re-anchor changes value only (ADR 0043). The
first segment's value is authored but pre-filled from recent training with the
derivation shown — the same act that proposes the track's **Volume Currency**,
since stating the number requires choosing a unit. Two segments cannot take
effect in the same week — a unique index on `(track, fromWeekKey)` — and the
**earliest** segment is always present: every week from the season's opening to
the next re-anchor is derived from it, so it can be edited but not removed, and
weeks before it read as an **Unavailable Metric** rather than a fabricated
number. A **Week Volume Override** survives a re-anchor untouched, still marked
and still revertible (ADR 0044 §5). _Avoid_: Starting volume (ambiguous once
there are segments), baseline (overloaded with threshold baselines).

**Volume Ramp**: The per-week rate of volume increase a **Training Track**
authors per segment — the app's _upward_ counterpart to **Week Replan**'s
downward rule, and the primary authored number of progressive overload (ADR
0040, #363 gap 5). A unit-free percentage, so a track authored in km never
converts to hours. It steps over **loading weeks** only: a **recovery week** is
a multiplicative role over the last loading week and never becomes the base for
the next step; on a strength track a **deload week** plays that role and
likewise never advances the index. **Both tracks** use it — ADR 0041 originally
made it an endurance rule with strength interpolating between **Volume
Landmarks** instead, and ADR 0047 retired the landmarks and gave strength the
same anchor-plus-ramp machinery. _Avoid_: Progression rate (used for the
hardcoded constant it replaces), ramp rate (the TrainingPeaks metric over CTL, a
different quantity).

**Ramp Guard**: The warning shown where an authored **Volume Ramp** or **Block
Boundary Step** rises faster than one documented constant — `RAMP_GUARD_MAX`,
+8% a loading week, domain knowledge in code rather than athlete data (ADR 0040
§12–13, ADR 0006). Its subject is what the athlete **authored**, never a
week-over-week difference, so it is silent on a **recovery week**'s rebound and
on a **taper** — both of which are the plan working as designed — and silent on
a deliberate drop. It **warns and never blocks**: no surveyed platform blocks on
a ramp figure, and the number is stored exactly as authored. Its copy must name
it a **convention** and make **no injury claim**: the 10% rule has a failed RCT
behind it (Buist 2008, P=.90). _Avoid_: Ramp limit, safe ramp, injury risk
warning (all three claim something the evidence does not support), `RAMP_WARN` /
`RAMP_HOT` (the retired prototype's two-level scheme).

**Block Boundary Step**: The optional volume change a **Training Track** authors
at a segment's opening, default `0` — expressing a deliberate volume drop
entering an intensity-led stretch, which a negative **Volume Ramp** would model
wrongly by also falling through the segment (ADR 0040). Being authored, a
**drop** is intent and the **Ramp Guard** stays silent on it; a _rise_ steeper
than the guard's constant reads like a ramp and is warned on like one (#403).
**Both tracks** use it — ADR 0041 said a strength track needed no equivalent,
and ADR 0047 made it the way a strength segment expresses its opening drop,
replacing "resume back near MEV". No carve-out is needed for strength's boundary
being discontinuous by design and never flagged, because that is already the
general rule for an authored step. _Avoid_: Opening volume (it is a relation,
not a level), cliff, jump.

**Quality Session Mix**: The intensive sessions per week an **endurance Training
Track segment** authors, as a multiset of **Training Zone** → count — the second
authored axis beside volume, and the one that distinguishes a hard week from an
easy week at identical volume (ADR 0040, 0042). Zones **3–5 only**; an empty mix
is a positive statement that the segment has no quality sessions. A count of
sessions per zone is Seiler's _session-goal_ method, not the time-based
intensity distribution ADR 0040 refused — distribution stays derived, never
authored. It is also the second input to every **Volume Conversion**: the mix
states how many quality sessions a week holds, and a documented minutes-in-zone
convention states how much volume each carries, since counting sessions does not
say that by itself (ADR 0045). Research confirms the boundary and names the
relationship: the Mix _is_ a session-goal prescription and a measured
**Intensity Distribution** _is_ a time-in-zone observation, and the two differ
by roughly 3× in the hard zones, so they are never compared without stating the
method (research: `intensity-distribution.md`). Its **zone** key is the open
question: `{Z4: 2}` cannot tell two cruise-interval sessions apart from one
continuous tempo plus one race simulation, and excluding the long run makes a
fast-finish-long-run week inexpressible — a **Session Archetype** key would say
both. _Avoid_: Intensity distribution, TID (the derived time-denominated
counterpart, not a synonym), focus, quality session (in Jack Daniels' broader
sense, where a long run counts as a "Q" — ours is intensity only, and the long
run is volume).

**Strength Goal**: The adaptation a **strength Training Track segment** is
authored for — `hypertrophy | maximal-strength | power`, ACSM 2026's three under
the field's own term for the middle one. The strength track's counterpart to the
endurance **Quality Session Mix**, and the answer to ADR 0042 §10 (ADR 0047).
The `%1RM` band and rep range are **derived** from it and never authored beside
it, because a band cannot express the distinction we want: ACSM's strength
prescription is ≥80% 1RM and hypertrophy occurs at 80%+ too, so what separates
the two goals is the **volume**, not the band. The goal derives the _intensity_
side only — never sets per week, which stays the **Season Anchor**'s and the
**Volume Ramp**'s, or the plan would have two sources for one number. Unlike the
endurance emphasis label the goal is **authored rather than derived**, which is
not a departure from ADR 0042 §5: that rule prevents a segment being _named for
work it does not contain_, and a goal the band derives from cannot lie about the
content. Checkable against real sessions with no new storage, since
`ExerciseSet.pct1RM` already exists — a session at 60% inside a
`maximal-strength` segment warns and never blocks (ADR 0042 §9). _Avoid_:
Strength emphasis (the middle value would read "strength emphasis: strength"),
focus (the retired phase enum, ADR 0042), block type, intensity band (that is
the derived value, not the authored one).

**Week Pattern**: A reusable microcycle the athlete authors once and **stamps**
across a plan's weeks — which weekdays carry which work, for which **Training
Track**. A pattern day is either **fixed** (a **Workout** stamped as authored,
because intervals are prescribed and must not be scaled) or a **share** (a
relative weight that absorbs its part of the week's derived volume), since a
pattern cannot hold absolute quantities when the week's target changes week to
week (ADR 0040 §1, ADR 0044). Stamping leaves ordinary standalone **Workout
Sessions** with no live link back, so editing one stamped week never touches its
siblings (#365) — which requires stamping to copy the **Workout** per session.
Stored per **Plan Outline** in V1; whether a named pattern is also athlete-owned
and reusable across plans is open. A day carries **no zone** — the zone is
resolved from the session's own content, so the mix-disagreement check reads
what the week holds rather than a claim a pattern day made about it (ADR 0042
§9) — and its **Training Track** is a reference, so a swim day draws swim volume
and never one undifferentiated pool. Weekdays run **Monday first**, matching the
**Training Week** (ADR 0019) rather than the Sunday-first calendar index
**Athlete Profile** stores (ADR 0005). A pattern is authored empty, or **built
from a proposal the athlete asks for**: a starter week lays one share day per
day of their **Training Availability** with the last one weighted double as the
long day, plus a day per session on a strength track that authors a **Strength
Frequency**. It proposes days and never intensity — which day is a quality
session is the **Quality Session Mix**'s to say — and where availability was
never set it falls back to a four-day week and says so rather than implying it
read anything (ADR 0048 §4). _Avoid_: Week template (reserved for the future
**Plan Template**), microcycle (as a UI/code term — recognized synonym only),
pattern instance.

**Pattern Preview**: What each day of a **Week Pattern** resolves to against one
chosen **Training Week**, read before anything is stamped — "Tuesday 6.7 km,
Wednesday the fixed session, Saturday 16.8 km". A **reading, never stored**, and
computed from that week's real derived target rather than a representative or
averaged one, so a preview cannot promise a volume the stamp would not write.
The fixed days' prescribed volume is subtracted first and the **share** weights
are normalised across what remains, per track and in that track's own **Volume
Currency**. Two soft warnings, both of which warn and never block (ADR 0040
§12): the fixed days alone exceeding the week's target — reported and never
corrected, because the athlete prescribed those intervals — and a prescribed
session that the track's currency cannot read, which costs the shares their
number rather than letting the app guess one. _Avoid_: Resolved week, projected
week (that is **Fitness Projection**'s word), planned week.

**Week Volume Override**: A week the athlete hand-sets, overriding the derived
target for that week only. Stored lazily — absent unless authored — and it is
the week's **final** target: the week's role factor is not applied on top, or
the number the athlete typed would never be the number they get. A **leaf**,
never folded forward, so the following week still computes from the **Season
Anchor** and the ramps and the derivation stays indexed rather than sequential
(ADR 0040 §3, ADR 0044). Marks itself, reverts to the rule in one action, and
survives a later re-anchor rather than being silently discarded. `0` expresses a
week without training and needs no separate flag. _Avoid_: Manual week (every
week is authored), exception, adjustment (that is **Week Replan**'s word).

**Quality Session Count**: The **derived** sum of a **Quality Session Mix** —
the axis Tønnessen 2020 showed to be decisive at matched volume and matched zone
time. Authored as a single integer until ADR 0042 resolved it by kind; the
substance is unchanged and the number is no longer stored. _Avoid_: Hard days
(the ratio, not the count), key sessions.

**Strength Frequency**: The sessions per week a **strength Training Track
segment** authors — the third canonical resistance-training variable beside
volume and intensity, and **authored** where its endurance counterpart the
**Quality Session Count** is derived (ADR 0047). It is the one strength
parameter with primary-source frequency evidence: Pelland et al. 2026 find
frequency's slope positive with **100% posterior probability for strength**
(and, for hypertrophy, "compatible with negligible effects"), and ACSM 2026
prescribes ≥2 sessions/wk. Two readings depend on it that previously had no
source: the strength **Summary Count**'s denominator for a week with no
materialized sessions, and the days-against-days fit check against **Training
Availability**'s trainable weekdays, which needs no conversion. It does **not**
make calendar cost in hours derivable — that needs a per-session duration too,
so ADR 0046 §3's **Unavailable Metric** stands. _Avoid_: Sessions per week (the
field name, not the concept), gym days, training frequency (unqualified —
endurance frequency is the **Quality Session Mix**'s).

**Intensity Emphasis**: The **derived** label naming a **Training Track
segment**'s character — for an endurance segment, read off its **Quality Session
Mix** (ADR 0042). Never authored, so no segment can be labelled for work it does
not contain, and the label carries dose beside kind ("Build · 2× threshold + 1×
VO₂ max"): it names every zone in the mix, ascending, rather than only the
dominant one, so a mix the athlete can distinguish is a label they can
distinguish too (#404). It reads the **mix** and never the materialized
sessions, so a segment's name does not change character depending on how far
into the season it sits. An empty mix reads "No quality sessions" — the positive
statement ADR 0042 §6 makes — never a dash and never "unknown". Each track has
its own vocabulary and a track that does not exist contributes no words, which
is how the model reads honestly for a pure strength athlete. On a **strength**
segment the vocabulary is the **Strength Goal**, which is _authored_ rather than
derived — the inversion is safe for the reason ADR 0042 §5 gives, since a goal
the `%1RM` band derives from cannot be a name for work the segment does not
contain (ADR 0047). _Avoid_: Focus (the removed prototype field), block type,
phase focus.

**Training Availability**: The athlete's trainable weekdays, default training
time and **Weekly Capacity**, stored on **Athlete Profile** and reused across
generations to schedule **Generated Sessions** into concrete **Scheduled At
(UTC)** times. Two fit checks read it, and they answer different questions: days
against days — **Quality Session Count** against the number of trainable
weekdays, which needs no conversion — and hours against hours, the capacity
against the week's derived endurance hours (ADR 0045 §8, unblocked by ADR 0050).
Neither supersedes the other, and a plan whose hours are an **Unavailable
Metric** still has the first. _Avoid_: Schedule preferences, calendar settings.

**Weekly Capacity**: How many hours a week the athlete has for training, stored
on **Athlete Profile** as part of **Training Availability**. Per week and never
per day: dividing it across trainable days would assert that availability is
uniform, which is what a long weekend session is not. **Pre-filled from the
athlete's own recent weekly hours with the derivation shown, then authored** —
the same act as the first **Season Anchor** segment — and never re-read, so a
plan does not shift because activities arrived in the background (ADR 0040 §6).
The override is the point rather than a convenience: history says what the
athlete _did_, a capacity says what they _could_, and an athlete returning from
injury needs to say so. Endurance hours only; a strength track has sessions per
week but no per-session duration to price them with (ADR 0046 §3, ADR 0047 §5).
Unset reads as unavailable, never as passing. Distinct from a **Season Anchor**
in `hours` currency, which is what the athlete _plans_ to train rather than what
they have room for. _Avoid_: Weekly hours (ambiguous with the anchor), time
budget, availability hours, training load ceiling.

### Charts and visualization

**Chart Primitive**: The shared, SSR-native, dependency-free SVG chart wrapper
every interactive chart is built on (ADR 0029, ADR 0030). It owns the scale and
ticks, the **Chart Inspect** controller, the **Unavailable Metric** marker, and
the accessible data-table equivalent, bridging to the existing zone /
**Adherence Band** palette rather than re-theming a library. Not a charting
library — Recharts and the shadcn `chart` component were evaluated and rejected
(ADR 0029). _Avoid_: Chart library, ChartContainer (the shadcn name), Recharts.

**Chart Inspect**: The tap-to-inspect affordance on an interactive chart (ADR
0030). Tapping a mark reveals its values in a fixed panel **below** the chart
(never a tooltip floating over the marks); re-tap, tap-empty, or Escape
dismisses; desktop hover is parity. Keyboard-accessible: arrow keys move the
inspection, Enter/Space inspects. An **Unavailable Metric** slot inspects to an
honest reason, never a silent gap. _Avoid_: Tooltip, hover card, crosshair.

## Relationships

- A **Training Plan** contains many **Workout Sessions**.
- A **Workout Session** belongs to exactly one **Owner** and references exactly
  one **Workout Template**.
- A **Workout Template** contains one or more **Block** entries.
- A **Block** contains one or more **Step** entries.
- A **Step** may include a **Discipline**, an **Intensity Target**, at most one
  **Step Quantity** (a **Step Duration**, a **Step Distance**, or a **Step
  Vertical** — never more than one), and any **Step Parameters**.
- A **Block** carries two repeat levels and at most one **Send-Off**; a block
  with a **Send-Off** contains no rest steps.
- A rest **Step** carries at most one **Rest Spec**.
- An **Exercise Set** states at most one **Load Target**, at most one **Effort
  Cap**, and exactly one **Set Termination**.
- A **Workout Session** has at most one **Session Log**.
- A **Session Log** belongs to exactly one **Workout Session**.
- **Upcoming Workouts** is a filtered view of **Workout Sessions** within the
  **14-Day Horizon**.
- The **Session Ledger** on the **Dashboard** presents **Workout Sessions**
  (past, missed, and **Upcoming Workouts**) and links each to its **Workout
  Detail View**.
- A **Discipline Filter** selects zero or one **Discipline** at a time; no
  selected filter means all disciplines are shown.
- A **Discipline Query** represents the selected **Discipline Filter** in the
  URL.
- **Discipline Allocation** sums the actual training load (TSS) of completed
  **Workout Sessions** by **Discipline** over a trailing window (ADR 0031),
  falling back to an **Unavailable Metric** for a discipline whose sessions
  carry no trustworthy load.
- **Workout Shape** is derived from ordered **Step** entries and their
  **Intensity Target** values.
- A **Workout Session** has at most one **Recording**, sourced from an
  **Activity Import**.
- An **Activity Import** is promoted to at most one **Workout Session**.
- An **Activity Import** has at most one **Activity Stream**, cascade-deleted
  with it — so a promoted **Recording**'s stream survives disconnect alongside
  the Recording, and a discarded import takes its stream with it.
- An **Activity Import** (run or bike, with a stream and/or laps) has at most
  one **Structure Detection**, derived from its **Activity Stream** and provider
  laps, cascade-deleted with the import exactly like the **Activity Stream**. A
  detection row exists whenever detection _ran_; a run that found no structure
  above the honesty bar records an absent **Detection Confidence** (attempted,
  nothing found), distinct from no row at all (never attempted — swim/strength,
  or no signal).
- A **Structure Detection** that clears its **Detection Confidence** honesty
  gate auto-materializes its structure as the recording-only session's
  **Workout** (**Session Source** `detected`; ADR 0033); below the gate the
  session carries no detected structure (`recorded`, structureless). The
  detection persists alongside the materialized **Workout**; editing that
  **Workout** adopts the session to `authored` but never re-runs or invalidates
  the detection.
- Every **Workout** — `authored`, `generated`, `recorded`, or `detected` — is
  created with **visibility** `private`; an auto-materialized `detected`
  **Workout** is private exactly like every other, so it is out of any future
  library or shared surface until the social-layer effort (#337) says otherwise
  (ADR 0037). Visibility is a Workout-level axis, independent of **Session
  Source**.
- A **Structure Detection** is frozen once its import is promoted (source-side
  changes never touch a **Recording**); on a `update` to a still-unpromoted
  import the stream re-snapshots and the detection is re-computed.
- A detected **Step** stores its **Intensity Target** as the concrete _measured_
  metric (an absolute pace / power / bpm), classified on the discipline's anchor
  channel — bike → power, run → running power (critical power) when that
  threshold is set else pace, HR only as fallback, else no detection; its zone
  label is a display-time derivation through the athlete's current recipe, never
  persisted (ADR 0035/0038).
- A matched planned session may carry a **Structure Adherence** verdict
  comparing its **Structure Detection** to its prescribed **Workout**. Detection
  is plan-blind, so the comparison is honest; it is display-derived,
  whole-session (never per-step), asymmetric (an under-detection degrades to
  Unavailable, never a divergence charged to the athlete), and never feeds
  **Planned TSS** or **Training Load** (ADR 0034).
- A session with no prescription never computes **Planned TSS** — neither a
  `recorded` session nor a `detected` one whose **Workout** was
  auto-materialized by a **Structure Detection**; its **Adherence Band** is
  unavailable, because a plan reconstructed from its own actuals would grade
  itself as perfect (ADR 0034).
- An **Activity Import** originates from at most one **Account Connection**;
  manually uploaded imports have none.
- An **Authenticated User** may have many **Account Connections**, at most one
  per external service (Strava, Intervals.icu, Garmin, Polar).
- The **Integration Hub** is the single surface for **Account Connections** and
  for manual upload — the Activity Inbox that used to share those jobs is gone
  (ADR 0049).
- Two **Activity Imports** from different providers may represent the same
  physical session (e.g., a Garmin workout that auto-synced to Strava). The
  model permits this; cross-provider duplicate detection is athlete-driven, not
  automatic. Both **Auto-Save**, so the athlete resolves it by deleting the
  session they don't want.
- An **Account Connection** can be disconnected. Disconnect stops further
  syncing and removes non-promoted **Activity Imports** from that provider, but
  preserves **Recordings** (promoted imports) and their **TSS** contributions to
  **Training Load** — the athlete's training history remains truthful. Full
  deletion of historical data (right-to-be-forgotten) is a separate
  athlete-initiated operation, not part of disconnect.
- An **Account Connection** with `status: revoked` is distinct from disconnect:
  source-initiated revocation stops syncing but does _not_ immediately remove
  non-promoted Activity Imports — the athlete is given the chance to
  re-authorize. Only explicit disconnect (or a long timeout) triggers cleanup.
- **Activity Imports** are snapshots taken at import time. When the source
  provider emits a later `update` for the same activity, non-promoted imports
  refresh to the new snapshot, but promoted **Recordings** are immutable to
  source-side changes (the Recording belongs to the athlete's training history).
  When the source emits a `delete`, non-promoted imports are removed; promoted
  **Recordings** survive — the same truthfulness rule as Account Connection
  disconnect.
- The **Tape** renders **Workout Sessions** as tiles. **Activity Imports** that
  have not been promoted contribute to load metrics but are not Tape tiles.
- A **Workout Session** may exist with no **Workout** attached when it was
  created from an **Activity Import** (an unplanned session, recorded only).
- An **Unavailable Metric** must not be replaced with invented data; show it as
  unavailable until the model supports it.
- **Scheduled At (UTC)** is stored data; **Local Display Time** is presentation
  only.
- Every **Workout Session** with telemetry and every promoted **Activity
  Import** contributes a **TSS** value, computed via a **Load Formula** chosen
  by discipline and available data.
- A **Load Snapshot** aggregates one athlete's daily **TSS** total and the
  derived **CTL**, **ATL**, and **TSB** for one calendar day in the **Athlete
  Timezone**.
- **CTL**, **ATL**, and **TSB** are derived from the time series of daily
  **TSS** totals; they are never authored.
- A **Plan Outline phase** carries no volume, no unit, no discipline and no
  intensity emphasis; volume and emphasis belong to the **Training Tracks**
  measured over the phases (ADR 0041, 0042).
- A **Plan Outline** carries one or more **Training Tracks**, one per
  **Discipline** and none of them privileged: a pure endurance athlete and a
  pure strength athlete each author one, a hybrid authors two, a triathlete who
  lifts authors four — all over one shared phase timeline (ADR 0041, 0043). A
  **strength** track segments independently of the phases, and its volume drop
  at a segment boundary is intent — never warned on (ADR 0041). An **endurance**
  track's segment spans exactly one phase (ADR 0042).
- **Volume Currency** belongs to the **Training Track**, never to a **Training
  Track segment** and never to the plan, so no two segments of one track can
  disagree about units and there is no conversion inside a track. It is fixed
  for the life of the track (ADR 0043).
- The **Season Span** headline is read from the authored guideline level — the
  **Season Anchor** and the tracks' ramps — never summed from materialized
  **Workout Sessions**, so it does not change character with how far into the
  season the athlete is. One span per **commensurability group**, so it adapts
  to the plan's contents and never needs an **Unavailable Metric** (ADR 0043).
- Volume accumulates across **Training Tracks** only where the currencies are
  commensurable: **TSS** across endurance tracks (the scale is defined as one
  hour at threshold = 100 in every endurance discipline), and **hours** across
  the **endurance** tracks as **calendar cost** — never as a dose. Distance
  never accumulates across disciplines, and **no** load number spans an
  endurance and a strength track, planned or actual (ADR 0041, 0043, 0046).
  Hours stop at the endurance tracks: a strength segment authors a **Strength
  Frequency**, so sessions per week exist, but there is no non-sparse
  per-session duration to multiply it by. A cross-track hours total is therefore
  an **Unavailable Metric** once a plan carries strength (ADR 0046 §3 correcting
  ADR 0043 §6; reason narrowed by ADR 0047 §5, which supplied the sessions but
  not the duration, and by ADR 0050, which supplied the missing counterparty —
  **Weekly Capacity** — leaving the duration as the only thing still absent).
- A chart's value axis is owned by exactly one **Training Track** reading
  exactly one **Volume Currency**; more views means more charts, never a shared
  or normalised axis, because every choice of scaling between km and sets is a
  claim about an exchange rate that does not exist. Other tracks and structures
  may layer onto the **time** axis only (ADR 0043).
- A **Training Track** may be _displayed_ in a currency it was not authored in,
  marked as derived with its derivation shown — never as the **Season Span** and
  never as the authored truth. The conversion must be a function of volume
  **and** the **Quality Session Mix**: with a scalar constant a converted chart
  is the original with new axis labels, carrying no information (ADR 0043).
- **Intensity Emphasis** has no vocabulary shared across tracks: an endurance
  segment is named by **Training Zones**, a strength segment by %1RM bands, and
  a track the athlete does not author contributes no words at all (ADR 0042).
- An **Intensity Emphasis** label and a **Quality Session Count** are both
  **derived** from the **Quality Session Mix** and never stored, so no segment
  can be labelled for work it does not contain (ADR 0042).
- Neuromuscular work — strides, hill sprints, short accelerations — has no
  position on the intensity axis: it is high mechanical intensity at low
  metabolic strain, so it is authored as an **Intensity Target** on a step,
  never as a segment's emphasis (ADR 0042).
- A detailed **Training Week** that disagrees with its segment's **Quality
  Session Mix** warns and never blocks; the emphasis label always reads the mix,
  never the sessions (ADR 0042).
- Strength work is never funded out of an **endurance Training Track**'s target:
  the endurance sessions split the whole endurance target between them, and
  strength time is reported alongside as extra clock hours where a session
  states them. Hours are a track's calendar cost and never its dose, and at the
  **guideline** layer they are available for the endurance tracks only, because
  a strength segment authors no quantity that multiplies into hours; hours is no
  longer a reconciliation unit either, because nothing needs reconciling (ADR
  0041, 0043, 0046 §3).
- A **Training Week**'s endurance volume target is **derived, never stored**: it
  is a pure function of the applicable **Season Anchor** segment, the **Volume
  Ramp** and **Block Boundary Step** of every endurance segment up to that week,
  and the week's own role in the phase rhythm (loading, recovery, or taper).
  Indexed, not folded — any week computes without computing the weeks before it
  (ADR 0040). The ramp product **freezes at the last loading week**, so a
  recovery week is a cut off the loading peak and the next loading week resumes
  one step above that peak, never above the deload (ADR 0040 §2, sharpened in
  ADR 0044). A **Week Volume Override** short-circuits the whole function for
  its own week only.
- A **Week Replan** decision exists at most once per athlete per closed
  **Training Week**; when it adjusts, it rescales quantified **Step Quantities**
  of the following week's still-scheduled **Workout Sessions** (never
  **Intensity Targets**, never **Session Source**) and attaches a **Replan
  Note** to each; every non-adjusting outcome carries an explicit reason
  instead.
- A **Portable Anchor** is authored once and never rewritten into a number; a
  **Target Resolution** is computed from it against the athlete's profile. A
  _scheduled_ **Workout Session** re-resolves at view time; a _completed_ one
  freezes its resolution at completion, and it is that frozen stamp the
  **Adherence Band** and **Structure Adherence** are judged against.
- A **Threshold** is a `{construct, protocol, value, effectiveAt}` tuple per
  **Discipline**, and a **Zone Recipe** is a ratio table over exactly one of
  them — so the anchor _is_ the model, and a `zone` target resolves by
  delegating to `pctThreshold` rather than through a parallel path.
- A historical **Workout Session**'s zones resolve against the **Threshold** and
  the **Zone Recipe** in force when it happened, never against the athlete's
  current profile; a corrected threshold moves stored numbers through a **Load
  Recompute Notice**, announced and not offered.
- **Intensity Distribution** is time-denominated and derived; the **Quality
  Session Mix** is its authored session-goal counterpart. Neither number is
  compared to the other without stating the method, and neither is ever
  denominated in **TSS**.
- A **Session Archetype** is derived from the **Workout**'s structure plus the
  session's role in its **Training Week** — never authored, and absent rather
  than guessed when the data cannot support it (ADR 0033, 0035, 0042).
- **Daily Wellness** never feeds **CTL**, **ATL** or **TSB**. **Readiness**
  reads the load triad and the wellness signals side by side and states their
  disagreement rather than averaging it away (ADR 0046's rule applied to a
  second pair of incommensurable currencies).
- A **Personal Record** is derived, never authored: it is always the output of
  the detection function over qualifying efforts (completed **Workout Sessions**
  backed by a **Recording**). An effort qualifies only when its **Load
  Confidence** is `high` or `medium` — the same trust gate **Training Load**
  applies — and it competes only against efforts in its own **Discipline**.
- The **Proof Strip** holds at most one **Personal Record** per **Discipline**
  per **Benchmark Kind**; with no qualifying efforts it is an **Unavailable
  Metric** (empty state), never a fabricated zero.
- When neither HR data nor a discipline threshold is available, **TSS** falls
  back to `sRPE` from the **Session Log**; if RPE is also missing, the
  contribution is an **Unavailable Metric**.
- A **Training Plan** anchors to zero or more **Events**. A-priority **Events**
  drive the plan's peak and taper; B and C are folded into the build.
- An **Event** belongs to exactly one **Owner** and may carry zero or one
  **Event Target**.
- An **Event** with `endDate` set spans multiple days (stage race, training
  camp); a null `endDate` indicates a single-day event.
- An **Event Result** is the **Workout Session** referenced by the **Event's**
  result pointer; the Event itself stores no telemetry or reflection data.
- **Events** render as markers on **The Tape**, visually distinct from **Workout
  Session** tiles.
- A plan anchors to exactly one **Event** (the **Target Event**); a plan without
  a race anchors to a self-set `fitness-goal` **Event**, which manual planning
  creates explicitly rather than silently (ADR 0039, #365). **Plan
  Generation**'s auto-created goal Event is retired with it (ADR 0044).
- An **Event** carries at most one **Plan Outline** and may be the **Target
  Event** of many **Workout Sessions**. A Workout Session's **Target Event**
  (the Event it builds toward) is distinct from an **Event Result** (the session
  that was the Event's execution).
- A **Generated Session** carries **Session Source** `generated` plus generation
  provenance shared by its batch. Editing it adopts it as `authored`.
- Regenerating a plan for an **Event** replaces only future, still-scheduled
  **Generated Sessions** anchored to that Event; completed, skipped, missed, and
  `authored` sessions are never touched.
- _(Retired with **Plan Generation**, ADR 0044 — kept because existing
  `generated` sessions still carry this provenance.)_ **Generated Sessions** are
  scheduled into **Scheduled At (UTC)** times from the athlete's **Training
  Availability**, and their **Intensity Target** zone labels resolve to concrete
  ranges from the athlete's **Discipline** thresholds.
- Manual planning authors every **Discipline** the app can express, strength
  included (#365); no discipline is privileged in the model (ADR 0041, 0043).
- The **Plan card** renders the athlete's _active plan_ — the nearest upcoming
  **Target Event** that carries a **Plan Outline**. **Events** without an
  Outline are calendar markers, not plans, and never drive the card. If no such
  Event exists, the card's slot carries the manual authoring entry beside the
  **Events** entry — the generation call-to-action went with **Plan Generation**
  (ADR 0044) and manual authoring has taken its place. B/C **Events** folded
  into an A-priority plan do not get their own card.

## Example dialogue

> **Dev:** "In the **Upcoming Ledger**, should the **Discipline Filter** live
> only in component state?"
>
> **Domain expert:** "No, the selected **Discipline Filter** should be
> represented by the **Discipline Query** so reloads and shared links preserve
> it."
>
> **Dev:** "Should we keep the notes feature from Epic Stack and let users write
> general notes?"
>
> **Domain expert:** "No. Notes become **Session Logs** — post-session feedback
> tied to a **Workout Session**. Standalone notes are not part of this domain."
>
> **Dev:** "What goes in a **Session Log**?"
>
> **Domain expert:** "A text reflection and an **RPE** score. Keep it minimal —
> richer logging comes later."

## Flagged ambiguities

- "workout" has been used to mean both **Workout Template** and **Workout
  Session**; use **Workout Template** for reusable definitions and **Workout
  Session** for scheduled instances.
- "upcoming" was initially vague; standardize it to the **14-Day Horizon**.
- "view a workout" can refer to a template or a scheduled instance; prefer
  **Workout Detail View** of a **Workout Session** in this POC.
- "date from an endpoint" can imply storage format and display format are the
  same; keep **Scheduled At (UTC)** for storage and **Local Display Time** for
  UI.
- "filter state" can mean either transient component state or shareable URL
  state; use **Discipline Query** when the selected filter should survive
  reloads and sharing.
- "metric" was used for both truthful aggregates and unavailable workout values;
  use **Summary Count** for derived counts and **Unavailable Metric** for values
  the model cannot calculate yet.
- "shape" could mean decorative charting; use **Workout Shape** only for a
  semantic visualization derived from ordered **Step** data.
- "note" was inherited from the Epic Stack notes app; in this domain use
  **Session Log** for post-session feedback tied to a **Workout Session**.
  Standalone general-purpose notes are not part of the training domain.
- **Discipline Allocation** originally meant an upcoming-session _count_ within
  the **14-Day Horizon**; when it was first built as a chart (map #309) it was
  redefined to an accumulated actual-**TSS** _load_ view over a trailing window,
  so the Trends tab reads one currency (ADR 0031). It was never implemented
  under the old count meaning, so nothing migrated.
- "candidate structure" appeared in early planning (map #326) implying a stored
  ranked list surfaced to the athlete through a confirmation inbox. The model
  stores only the single winning **Structure Detection**; ranking is
  engine-internal and there is no inbox — a detection above its honesty bar
  auto-imports, below it the recording stays structureless (ADR 0032). ADR 0049
  applied the same stance one layer out, retiring the import inbox too. Use
  **Structure Detection** for the stored artifact; "candidate" is not a domain
  term.
- **Activity Inbox** was the surface (`/imports`) where imported activities
  waited for the athlete to press "Promote", plus the wordmark-row chip carrying
  its pending count. It is retired (ADR 0049): **Auto-Save** attaches every
  import to a **Workout Session** on arrival, so there is nothing to queue. Use
  **Auto-Save** for what happens at ingest, the **Integration Hub** for the
  upload and source-management surface it also hosted, and the **Workout Detail
  View** for correcting a wrong match. "Inbox" is no longer a domain term.
- "adherence" now spans two independent signals: the **Adherence Band**
  (whole-session Planned-TSS vs actual TSS, ADR 0019) and **Structure
  Adherence** (detected structure vs prescribed structure, ADR 0034). A session
  can be on-target on load yet diverge in structure, or vice versa; keep them
  distinct. Neither asserts per-step verdicts, and neither exists on a
  `recorded`/`detected` session (no prescription to compare against).
- **"cruise interval" means two different things across disciplines this app
  models.** In running it is Daniels' threshold reps — 5–10 min at `T` pace with
  ~1 min floats. In swimming it is a **send-off**-based set, the interval clock
  the swim tradition (Bower, Maglischo) runs a main set on, roughly threshold
  pace plus ~10 s per 100 m. A genuine cross-discipline collision, not a shade
  of meaning: scope the term per **Discipline** or avoid it in shared UI, and
  prefer "threshold reps" for the running sense and "send-off" for the swim
  mechanism (research: `workout-taxonomy.md` §4.2).
- **`WORKOUT_INTENTS` is the intensity axis wearing an archetype's name.** Six
  of its fifteen members (`recovery`, `endurance`, `tempo`, `threshold`,
  `vo2max`, `anaerobic`) are verbatim the strings `zoneLabelToZone()` maps onto
  **Training Zone** 1–5, four more are **Strength Goals** that ADR 0047 has
  since given a proper home, and only `race` and `test` are genuine archetypes.
  The consequence is concrete: a 30-minute recovery jog, a 70-minute easy run
  and a 3-hour long run are all `intent: 'endurance'`, and there is no value at
  all for _long_, _fartlek_, _brick_, _steady_ or _race simulation_. ADR 0042
  caught the identical conflation at phase scope. Use **Session Archetype** for
  the "what kind of session" axis and **Training Zone** for "how hard"; one of
  the two fields must stop being authored (research: `workout-taxonomy.md`).
- **`powerPct` silently means % FTP.** The interval literature anchors on
  **MAP** and the critical-power literature on **CP**, and **CP ≠ FTP** — 256 ±
  50 W against 249 ± 44 W with 95 % limits of agreement −19 to +33 W, widening
  with fitness. A bare percentage is not portable: a **Portable Anchor**'s
  `pctThreshold` names its **Threshold** explicitly, and a stored threshold
  names its construct and protocol (research: `zones-and-thresholds.md`,
  `portable-intensity-anchors.md`).
- **"intensity distribution" means two different measurements.** _Time-in-zone_
  sums recorded seconds per zone; _session-goal_ credits a whole session's
  duration to the zone it was for. The same 570 sessions read 96.1/2.9/1.1 one
  way and 86.6/11.1/2.4 the other, roughly a 3× factor in the hard zones.
  **"80/20" is a session-goal target** — Seiler's own headline is "80 % of
  _sessions_" — and must never be applied to a time-in-zone number. Every
  distribution figure states its method beside it (research:
  `intensity-distribution.md`).
- **`% 1RM` is not portable below ~85 %.** At 70 % 1RM endurance runners
  completed 39.9 ± 17.6 reps to failure where weightlifters completed 17.9 ± 2.8
  — and at 90 % there was no difference. The population this app serves is
  precisely the population the canonical `%1RM ↔ reps` table is most wrong for.
  **RIR** (reps in reserve) is the portable strength anchor; `% 1RM` travels
  only in the heavy band, which happens to be where the max-strength library
  lives. `pct1RM` is shipped and currently resolves to nothing — no 1RM is
  stored anywhere, and since 1RM is per _exercise_ the
  `[athleteProfileId, discipline]` key on **Discipline Profile** structurally
  cannot hold one (research: `workouts-strength-and-other.md`).
- **"tempo" means the ~1-hour race-pace threshold effort in US distance running
  and the goal race pace in the UK/track and Hansons traditions** — and
  Norwegian _tempoøkt_ is ambiguous the same way. Never store bare "tempo" as a
  value carrying intensity; store the **Session Archetype** plus its anchor
  (research: `workout-taxonomy.md` §4.2).
- **"threshold" is used for both LT1 and LT2.** This app means **LT2** (MLSS /
  FTP / CSS) everywhere, in **Threshold**, in the **Training Zone** ladder and
  in every shipped **Zone Recipe**. LT1 — the aerobic threshold — is not
  modelled at all, so "threshold" is never written for it (research:
  `zones-and-thresholds.md`).
- **A bare zone number is ambiguous across models.** Three-zone Z2 is the
  _between-thresholds_ band; five-zone zone 2 is easy aerobic work; Coggan's
  band 2 folds to three-zone Z1 while his bands 3–4 fold to Z2; Daniels' `T`
  sits third in his ladder but is a threshold intensity. Ordinal position is not
  intensity class, which is why a **Zone Recipe** band _declares_ its **Training
  Zone** (ADR 0045) and would have to declare its three-zone bucket too. Always
  name the recipe or the anchor beside the number (research:
  `intensity-distribution.md`, `zones-and-thresholds.md`).
- **"recovery" names both a session and the rest inside an interval set.** It is
  a **Session Archetype** and it is also the in-set relief between reps. Say
  "recovery session" for the archetype and "recovery" only for the in-set rest;
  the **Rest Spec** owns the latter (research: `workout-taxonomy.md` §4.2).
