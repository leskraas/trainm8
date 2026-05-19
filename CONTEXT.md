# Training Planning

A training planning app for self-coaching athletes. The athlete views, plans,
and reflects on their training through structured workouts and session logs.

## Language

### Training planning

**Training Plan**: The athlete's forward-looking schedule of planned training
sessions. _Avoid_: Program, calendar

**Workout Template**: A reusable workout definition that can be scheduled
multiple times. _Avoid_: Workout plan, base workout

**Workout Session**: A scheduled instance of a workout template at a specific
date-time. _Avoid_: Scheduled workout, occurrence

**Upcoming Workouts**: The subset of workout sessions scheduled from now through
the next 14 days. _Avoid_: Next workouts, future workouts

**Workout Detail View**: The read-only screen showing a workout session and its
structured content. _Avoid_: Session page, workout page

**Upcoming Ledger**: The dense Upcoming Workouts presentation that combines
grouped sessions, summary counts, activity allocation, filters, and workout
shape. _Avoid_: Dashboard, table page, report

### Workout structure

**Workout**: The structured training definition owned by a user and used as a
template. _Avoid_: Session, activity

**Block**: An ordered grouping of repeated steps inside a workout. _Avoid_: Set
group, segment

**Step**: A single ordered instruction within a block, optionally including an
activity, intensity, and quantity. _Avoid_: Interval, action

**Activity Type**: The sport modality for a workout or step (for example run,
bike, swim). _Avoid_: Sport type, discipline type

**Intensity Target**: The prescribed effort level for a step, currently
expressed via a fixed zone vocabulary (`easy`, `zone2`, `threshold`, `max`).
Future metric models (pace, %FTP, HR zones) are not yet supported. _Avoid_: Zone
target, effort

**Step Quantity**: The typed magnitude of a step, expressed as either a Step
Duration or a Step Distance — mutually exclusive per step. A step without a Step
Quantity is unquantified and contributes no length to the Workout Shape.
_Avoid_: Size, amount, length

**Step Duration**: The planned time length of a step, stored in seconds.
_Avoid_: Duration string, time interval

**Step Distance**: The planned distance of a step, stored in meters. _Avoid_:
Length, range

**Workout Shape**: A compact visual summary of a workout's ordered steps and
intensity targets, with Step Duration providing relative width when present.
_Avoid_: Sparkline, graph, timeline

### Session feedback

**Session Log**: The athlete's post-session record for a Workout Session,
containing a text reflection and an RPE. _Avoid_: Training log, workout note,
diary, note

**RPE (Rate of Perceived Exertion)**: A 1-10 scale of subjective effort logged
by the athlete after a Workout Session. _Avoid_: Effort score, difficulty rating

### Planning metrics and filters

**Activity Filter**: A single-select filter that narrows Upcoming Workouts by
activity type. _Avoid_: Sport filter, discipline tab

**Activity Allocation**: The summary distribution of upcoming workout sessions
by activity type within the 14-Day Horizon. _Avoid_: Sport mix, split, plan
allocation

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
day in the athlete's local timezone (daily TSS totals, CTL, ATL, TSB).
Materialized by a background job, never computed on-the-fly. _Avoid_: Daily
load, load row

**Load Formula**: The named method used to compute TSS for one session — one of
`coggan` (power-based), `hrTSS` (heart-rate-based), `rTSS` (pace-based run),
`sTSS` (CSS-based swim), or `sRPE` (perceived-effort fallback). Recorded as
provenance on each contribution so the chosen method is auditable. _Avoid_:
Method, calculation

**Athlete Timezone**: The IANA timezone used to determine which calendar day a
Workout Session or Activity Import belongs to for load aggregation. Stored on
Athlete Profile. _Avoid_: Local time (overloaded with display time)

### Session state and time

**Session Status**: The lifecycle state of a workout session (scheduled,
completed, skipped, missed). _Avoid_: State, progress

**Scheduled At (UTC)**: The canonical stored timestamp for when a workout
session starts. _Avoid_: Local time field, display time

**Local Display Time**: The user-visible representation of a scheduled timestamp
in viewer-local time. _Avoid_: Stored time, DB time

**14-Day Horizon**: The fixed rolling window used to determine which sessions
are upcoming. _Avoid_: Sprint window, month view

**Activity Query**: The URL query parameter that preserves the selected activity
filter. _Avoid_: Local filter state, tab state

### People and scope

**Self-Coaching Athlete**: The primary user who plans and reviews their own
training without coach workflows. _Avoid_: Coach-managed athlete, team user

**Authenticated User**: The signed-in identity used for data ownership and
access control. _Avoid_: Viewer, account

**Owner**: The authenticated user who owns workouts and workout sessions.
_Avoid_: Creator, participant

### App structure

**The Tape**: The primary navigation primitive — a single horizontal scrubbable
timeline of Workout Sessions, past on the left, planned on the right, "Now"
centered. The Dashboard, Upcoming Ledger, and Workout Detail View are different
zoom levels of the Tape, not separate surfaces. _Avoid_: Calendar, grid,
dashboard-as-feature

**Dashboard**: The logged-in athlete's home view at `/`. Currently a
transitional surface; long-term it is a zoom level of the Tape, not a separate
concept. _Avoid_: Home page, landing page, feed

### Recording and import

**Activity Import**: A raw telemetry record imported from an external provider
(Strava, Garmin, manual upload). Stored in an inbox; not rendered on the Tape
directly. Contributes to load metrics independently of Workout Sessions.
_Avoid_: Activity (overloaded with Activity Type), raw activity, sync record

**Recording**: An Activity Import that has been linked to a Workout Session as
its executed telemetry. The Tape uses a Recording to show planned-vs-actual on a
Session tile. _Avoid_: Execution, log (collides with Session Log), result

**Promotion**: The act of linking an Activity Import to a Workout Session as its
Recording (auto-matched on import, or chosen by the athlete). _Avoid_: Attach,
import, sync

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

## Relationships

- A **Training Plan** contains many **Workout Sessions**.
- A **Workout Session** belongs to exactly one **Owner** and references exactly
  one **Workout Template**.
- A **Workout Template** contains one or more **Block** entries.
- A **Block** contains one or more **Step** entries.
- A **Step** may include an **Activity Type**, an **Intensity Target**, and at
  most one **Step Quantity** (either a **Step Duration** or a **Step Distance**,
  never both).
- A **Workout Session** has at most one **Session Log**.
- A **Session Log** belongs to exactly one **Workout Session**.
- **Upcoming Workouts** is a filtered view of **Workout Sessions** within the
  **14-Day Horizon**.
- The **Upcoming Ledger** presents **Upcoming Workouts** and links each
  **Workout Session** to its **Workout Detail View**.
- An **Activity Filter** selects zero or one **Activity Type** at a time; no
  selected filter means all activity types are shown.
- An **Activity Query** represents the selected **Activity Filter** in the URL.
- **Activity Allocation** is calculated from **Workout Sessions**, not from
  planned duration or training load.
- **Workout Shape** is derived from ordered **Step** entries and their
  **Intensity Target** values.
- A **Workout Session** has at most one **Recording**, sourced from an
  **Activity Import**.
- An **Activity Import** is promoted to at most one **Workout Session**.
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

## Example dialogue

> **Dev:** "In the **Upcoming Ledger**, should the **Activity Filter** live only
> in component state?"
>
> **Domain expert:** "No, the selected **Activity Filter** should be represented
> by the **Activity Query** so reloads and shared links preserve it."
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
  state; use **Activity Query** when the selected filter should survive reloads
  and sharing.
- "metric" was used for both truthful aggregates and unavailable workout values;
  use **Summary Count** for derived counts and **Unavailable Metric** for values
  the model cannot calculate yet.
- "shape" could mean decorative charting; use **Workout Shape** only for a
  semantic visualization derived from ordered **Step** data.
- "note" was inherited from the Epic Stack notes app; in this domain use
  **Session Log** for post-session feedback tied to a **Workout Session**.
  Standalone general-purpose notes are not part of the training domain.
