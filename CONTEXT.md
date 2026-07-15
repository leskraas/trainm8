# Training Planning

A training planning app for self-coaching athletes. The athlete views, plans,
and reflects on their training through structured workouts and session logs.

## Language

### Training planning

**Training Plan**: The athlete's forward-looking schedule of planned training
sessions, anchored to a **Target Event** and shaped by a **Plan Outline**. It
remains a concept/view over **Workout Sessions**, not a stored entity. _Avoid_:
Program, calendar

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
template. _Avoid_: Session, activity

**Block**: An ordered grouping of repeated steps inside a workout. _Avoid_: Set
group, segment

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
Training Zone or an Unavailable Metric, never a fabricated value. Plan
Generation and authoring _produce_ metric targets at write time by baking the
per-discipline default (run → threshold pace, bike → `%FTP`) from the athlete's
recipe into the stored Step, falling back to the Training Zone label when no
threshold resolves it (swim's per-100m CSS pace is not yet modelled, so it falls
back). _Avoid_: Zone target, effort

**Step Quantity**: The typed magnitude of a step, expressed as either a Step
Duration or a Step Distance — mutually exclusive per step. A step without a Step
Quantity is unquantified; in the editor's Workout Shape strip (#258) a step with
neither a Step Quantity nor an Intensity Target paints nothing, and an
intensity-only step gets a fixed nominal width, never a fabricated length.
_Avoid_: Size, amount, length

**Step Duration**: The planned time length of a step, stored in seconds.
_Avoid_: Duration string, time interval

**Step Distance**: The planned distance of a step, stored in meters. _Avoid_:
Length, range

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

**Training Metric**: A measurable workout value such as duration, distance, TSS,
or training stress. _Avoid_: Stat, number, KPI

**Unavailable Metric**: A training metric that the current domain model cannot
truthfully calculate. _Avoid_: Fake metric, mock stat

**Summary Count**: A truthful aggregate derived from existing sessions, such as
number of sessions or number of days in the horizon. _Avoid_: Metric, KPI

### Training load

**Training Load**: The cumulative physiological cost of training over time,
expressed as a triad of TSS, CTL, ATL, and TSB. _Avoid_: Stress, fatigue,
fitness (use the specific term)

**TSS (Training Stress Score)**: A single number representing the physiological
cost of one Workout Session or Activity Import. By convention, 100 TSS ≈ one
hour at threshold. Computed from one of several discipline-aware formulas.
_Avoid_: Score, load score

**CTL (Chronic Training Load)**: A 42-day exponentially weighted average of
daily TSS, representing the athlete's accumulated fitness. _Avoid_: Fitness
score (CTL is the canonical name)

**ATL (Acute Training Load)**: A 7-day exponentially weighted average of daily
TSS, representing the athlete's recent fatigue. _Avoid_: Fatigue score

**TSB (Training Stress Balance)**: CTL minus ATL — the athlete's current form.
Positive TSB means rested; negative means under load. _Avoid_: Form score,
freshness

**Load Snapshot**: A single athlete's training load values for a single calendar
day in the athlete's local timezone (daily TSS totals, CTL, ATL, TSB). _Avoid_:
Daily load, load row

**Load Formula**: The named method used to compute TSS for one session — one of
`coggan` (power-based), `hrTSS` (heart-rate-based), `rTSS` (pace-based run),
`sTSS` (CSS-based swim), or `sRPE` (perceived-effort fallback). Recorded as
provenance on each contribution so the chosen method is auditable. _Avoid_:
Method, calculation

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
never feeds CTL/ATL/TSB. _Avoid_: Target load, expected TSS

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
fabricated ratio. Display only — never feeds CTL/ATL/TSB. _Avoid_: Weekly
compliance, weekly score

**Training Week**: The weekly window for Weekly Plan Adherence — a calendar
**Monday–Sunday** week evaluated in the Athlete Timezone (ADR 0019, #119).
_Avoid_: Rolling 7 days (the alternative ADR 0019 left open; not chosen)

**Week Replan**: The persistent, at-most-once decision made when a Training Week
closes (ADR 0025): from that week's **Weekly Plan Adherence** and current
**TSB**, either soften the following week's still-scheduled sessions by one
documented volume rule (downward only, floored), or explicitly decline —
`no-change` or `insufficient-data` — with a plain-language reason. Stored per
closed week and never re-opened by late-arriving data, so a multiplicative
adjustment can never compound. Distinct from the ephemeral one-session ease the
Coach card's nudge applies. _Avoid_: Auto-adjust, replanning engine, plan
correction

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
**Target Event**, replaying the active **Plan Outline**'s per-phase weekly-load
pattern through the same 42-day CTL EWMA the measured curve uses (#132). Derived
and display-only — it never creates or mutates **Load Snapshots**. Prescribed
weekly hours become projectable daily TSS via a single documented planning
assumption (≈60 TSS per endurance hour, IF ≈ 0.77 against the 100-TSS threshold
hour). Honest by construction: without an active plan there is no projection
(the curve ends at today), and an untrustworthy CTL baseline or a pattern-less
Outline yields an **Unavailable Metric**, never a guessed curve. Only fitness
(CTL) is projected; a flat daily-average load makes ATL/TSB meaningless.
_Avoid_: Forecast, predicted fitness, trend line

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
page. _Avoid_: TSB widget, form box, readiness card

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
materialized. When no active plan exists, the same slot shows a **Plan
Generation** call-to-action instead. _Avoid_: Plan widget, journey card,
progress card, plan banner

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
per-provider folders with no shared interface (ADR 0014, ADR 0026). The Activity
Inbox keeps only a slim source summary linking here. _Avoid_: Integrations page,
connections screen, sync settings, provider marketplace.

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
(Strava, Garmin, manual upload). Stored in an inbox; not rendered on the Tape
directly. Contributes to load metrics independently of Workout Sessions.
_Avoid_: Activity (overloaded with Activity Type), raw activity, sync record

**Recording**: An Activity Import that has been linked to a Workout Session as
its executed telemetry. The Tape uses a Recording to show planned-vs-actual on a
Session tile. _Avoid_: Execution, log (collides with Session Log), result

**Activity Stream**: The per-sample telemetry for an Activity Import — an
elapsed-time axis plus optional power, heart-rate, and pace channels — stored
downsampled and index-aligned (a coarse `resolutionSec`, a capped `sampleCount`,
`null` entries marking paused gaps) so it stays bounded (ADR 0020). One per
Activity Import; many imports have none (manual uploads, providers/activities
without streams). Feeds the **Telemetry Overlay**. _Avoid_: Samples,
trackpoints, time series, raw stream

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
Recording (auto-matched on import, or chosen by the athlete). _Avoid_: Attach,
import, sync

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
the **Load Confidence** vocabulary — `high | medium | low`, or _absent_ when no
structure clears the honesty bar (an **Unavailable Metric**, never a fabricated
low score). Gates auto-import: only a detection above the bar materializes a
**Workout**. Its precise inputs and threshold are decided separately (#331).
_Avoid_: Detection score, match score, a bespoke 0–1 scale.

**Job Queue**: The in-process background-work primitive (ADR 0013). A `Job` row
carries a `kind` (which handler runs it) and an opaque JSON `payload`, with
retry/backoff and a terminal `failed` state. A single polling worker drains the
queue one job at a time. The Backfill Window is its first `kind`; webhook-fetch
and reconciliation-poll reuse it. _Avoid_: Task queue, worker pool, scheduler

**Live Imports Stream**: The per-athlete Server-Sent Events channel that pushes
"a new Activity Import landed" to the athlete's open Imports tabs so the inbox
revalidates without a page reload (ADR 0013, #75). Every `createActivityImport`
publishes to the owning athlete's stream — manual sync, Backfill Window, file
upload, and future webhook ingest all flow through the one publisher. _Avoid_:
WebSocket, push notification, socket

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

**Plan Generation**: Producing a forward **Training Plan** for an athlete from a
goal or **Event** using an AI model. The result is shown as a **Plan Preview**
and is not persisted until the athlete approves it. _Avoid_: AI plan, auto-plan.

**Plan Preview**: The transient, un-persisted result of a **Plan Generation**,
reviewed (and optionally regenerated) by the athlete before anything is written.
Nothing reaches the calendar from a Preview until approved. _Avoid_: Draft (no
draft session state exists).

**Generated Session**: A **Workout Session** whose **Session Source** is
generation rather than manual authoring or recording. Editing a Generated
Session _adopts_ it — its **Session Source** becomes `authored`, protecting it
from being replaced on regeneration. _Avoid_: AI workout, auto session.

**Session Source**: The origin of a **Workout Session** — `authored` (created by
the athlete), `generated` (produced by **Plan Generation**), or `recorded`
(materialized from an **Activity Import** with no plan). _Avoid_: Origin, type.

**Target Event**: The **Event** a **Workout Session** builds toward. Distinct
from **Event Result**, which is the single session that _was_ the event's
execution. A Generated Session anchors to the Target Event that drove its
generation. _Avoid_: Goal event, linked event.

**Plan Outline**: The periodized phase structure spanning the full horizon (e.g.
base / build / peak / taper, with a weekly load pattern per phase), stored on
the **Event**. Concrete **Workout Sessions** are materialized only for the near
term; later phases are detailed on demand by extending the plan from the stored
Outline. _Avoid_: Periodization blob, schedule template.

**Training Availability**: The athlete's trainable weekdays and default training
time, stored on **Athlete Profile** and reused across generations to schedule
**Generated Sessions** into concrete **Scheduled At (UTC)** times. _Avoid_:
Schedule preferences, calendar settings.

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
- A **Step** may include a **Discipline**, an **Intensity Target**, and at most
  one **Step Quantity** (either a **Step Duration** or a **Step Distance**,
  never both).
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
- An **Activity Import** (run or bike, with a stream and/or laps) has at most one
  **Structure Detection**, derived from its **Activity Stream** and provider
  laps, cascade-deleted with the import exactly like the **Activity Stream**. A
  detection row exists whenever detection _ran_; a run that found no structure
  above the honesty bar records an absent **Detection Confidence** (attempted,
  nothing found), distinct from no row at all (never attempted — swim/strength,
  or no signal).
- A **Structure Detection** that clears its **Detection Confidence** bar
  auto-materializes its structure as the recording-only session's **Workout**
  (**Session Source** `recorded`); below the bar the session carries no detected
  structure. The detection persists alongside the materialized **Workout**, and
  editing that **Workout** never re-runs or invalidates the detection.
- A **Structure Detection** is frozen once its import is promoted (source-side
  changes never touch a **Recording**); on a `update` to a still-unpromoted
  import the stream re-snapshots and the detection is re-computed.
- An **Activity Import** originates from at most one **Account Connection**;
  manually uploaded imports have none.
- An **Authenticated User** may have many **Account Connections**, at most one
  per external service (Strava, Intervals.icu, Garmin, Polar).
- The **Integration Hub** is the single management surface for **Account
  Connections**; the Activity Inbox links to it but no longer hosts
  connect/disconnect.
- Two **Activity Imports** from different providers may represent the same
  physical session (e.g., a Garmin workout that auto-synced to Strava). The
  model permits this; cross-provider duplicate detection is athlete-driven, not
  automatic. The athlete chooses which to promote and may discard the other.
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
- A **Week Replan** decision exists at most once per athlete per closed
  **Training Week**; when it adjusts, it rescales quantified **Step Quantities**
  of the following week's still-scheduled **Workout Sessions** (never
  **Intensity Targets**, never **Session Source**) and attaches a **Replan
  Note** to each; every non-adjusting outcome carries an explicit reason
  instead.
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
- A **Plan Generation** anchors to exactly one **Event** (the **Target Event**);
  if the athlete has none, a `fitness-goal` **Event** is auto-created from the
  goal and horizon so grouping always holds.
- An **Event** carries at most one **Plan Outline** and may be the **Target
  Event** of many **Workout Sessions**. A Workout Session's **Target Event**
  (the Event it builds toward) is distinct from an **Event Result** (the session
  that was the Event's execution).
- A **Generated Session** carries **Session Source** `generated` plus generation
  provenance shared by its batch. Editing it adopts it as `authored`.
- Regenerating a plan for an **Event** replaces only future, still-scheduled
  **Generated Sessions** anchored to that Event; completed, skipped, missed, and
  `authored` sessions are never touched.
- **Generated Sessions** are scheduled into **Scheduled At (UTC)** times from
  the athlete's **Training Availability**, and their **Intensity Target** zone
  labels resolve to concrete ranges from the athlete's **Discipline**
  thresholds.
- Strength is out of scope for **Plan Generation** in V1; only `run`, `swim`,
  and `bike` plans are generated.
- The **Plan card** renders the athlete's _active plan_ — the nearest upcoming
  **Target Event** that carries a **Plan Outline**. **Events** without an
  Outline are calendar markers, not plans, and never drive the card. If no such
  Event exists, the card's slot shows the **Plan Generation** call-to-action.
  B/C **Events** folded into an A-priority plan do not get their own card.

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
  auto-imports, below it the recording stays structureless (ADR 0032). Use
  **Structure Detection** for the stored artifact; "candidate" is not a domain
  term.
