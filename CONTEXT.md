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

**Workout Detail View**: The read-only screen showing a workout session and its
structured content. _Avoid_: Session page, workout page

**Upcoming Ledger**: The dense Upcoming Workouts presentation that combines
grouped sessions, summary counts, discipline allocation, filters, and workout
shape. _Avoid_: Dashboard, table page, report

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

**Discipline Filter**: A single-select filter that narrows Upcoming Workouts by
discipline. _Avoid_: Sport filter, activity tab

**Discipline Allocation**: The summary distribution of upcoming workout sessions
by discipline within the 14-Day Horizon. _Avoid_: Sport mix, split, plan
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
day in the athlete's local timezone (daily TSS totals, CTL, ATL, TSB). _Avoid_:
Daily load, load row

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
destination after login. Its primary, top signal is the **Coach card**, with the
**Session Ledger** below it (ADR 0010). Long-term it is a zoom level of the
Tape, not a separate concept. _Avoid_: Home page, landing page, feed

**Coach card**: The headline Form (TSB) signal at the top of the home view — the
single daily "go hard or recover?" answer. While Form (TSB) is untrustworthy
(thin load history) it shows a "building baseline — day N/42" state; once
trustworthy it shows the plain-language readiness label plus a short
recommendation. It lives on the home surface, not on a separate Training Load
page. _Avoid_: TSB widget, form box, readiness card

### Recording and import

**Account Connection**: An athlete's authorized link to an external training
service account (Strava, Garmin, Polar) used to exchange training data. One per
athlete per external account. The external account ID is stored as
`externalAthleteId`. Carries a `status`: `active`, `expired`, `revoked`, or
`error`. `expired` is self-healing via background token refresh and is not
surfaced to the athlete. `revoked` means the source provider invalidated the
authorization (athlete deauthorized at source, or refresh permanently failed)
and requires athlete re-authorization. `error` is reserved for unexpected
source-side failures requiring triage. Operational sync state (idle / actively
fetching) is _not_ a `status` value — it is derived from the job queue. Manually
uploaded Activity Imports use no Account Connection. _Avoid_: Integration,
Connected Account, Service Connection, Provider Connection, Sync Source.

**Backfill Window**: The 42-day historical window of Activity Imports retrieved
from a newly-connected Account Connection, sized to match the CTL window so
Training Load is meaningful from day one. Backfill runs as a background job (not
synchronous with connect) and auto-promotes imports without a same-day planned
Workout Session to recording-only Workout Sessions. _Avoid_: Initial sync,
history sync.

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
- The **Upcoming Ledger** presents **Upcoming Workouts** and links each
  **Workout Session** to its **Workout Detail View**.
- A **Discipline Filter** selects zero or one **Discipline** at a time; no
  selected filter means all disciplines are shown.
- A **Discipline Query** represents the selected **Discipline Filter** in the
  URL.
- **Discipline Allocation** is calculated from **Workout Sessions**, not from
  planned duration or training load.
- **Workout Shape** is derived from ordered **Step** entries and their
  **Intensity Target** values.
- A **Workout Session** has at most one **Recording**, sourced from an
  **Activity Import**.
- An **Activity Import** is promoted to at most one **Workout Session**.
- An **Activity Import** originates from at most one **Account Connection**;
  manually uploaded imports have none.
- An **Authenticated User** may have many **Account Connections**, at most one
  per external service (Strava, Garmin, Polar).
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
