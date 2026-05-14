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

**Dashboard**: The logged-in athlete's home view at `/`, showing the next
Workout Session, upcoming summary, and recent Session Logs. _Avoid_: Home page,
landing page, feed

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
- An **Unavailable Metric** must not be replaced with invented data; show it as
  unavailable until the model supports it.
- **Scheduled At (UTC)** is stored data; **Local Display Time** is presentation
  only.

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
