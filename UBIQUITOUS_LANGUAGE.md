# Ubiquitous Language

## Training planning domain

| Term                    | Definition                                                                                                                                | Aliases to avoid               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **Training Plan**       | The athlete's forward-looking schedule of planned training sessions.                                                                      | Program, calendar              |
| **Workout Template**    | A reusable workout definition that can be scheduled multiple times.                                                                       | Workout plan, base workout     |
| **Workout Session**     | A scheduled instance of a workout template at a specific date-time.                                                                       | Scheduled workout, occurrence  |
| **Upcoming Workouts**   | The subset of workout sessions scheduled from now through the next 14 days.                                                               | Next workouts, future workouts |
| **Workout Detail View** | The read-only screen showing a workout session and its structured content.                                                                | Session page, workout page     |
| **Upcoming Ledger**     | The dense Upcoming Workouts presentation that combines grouped sessions, summary counts, activity allocation, filters, and workout shape. | Dashboard, table page, report  |

## Workout structure

| Term                 | Definition                                                                                | Aliases to avoid            |
| -------------------- | ----------------------------------------------------------------------------------------- | --------------------------- |
| **Workout**          | The structured training definition owned by a user and used as a template.                | Session, activity           |
| **Block**            | An ordered grouping of repeated steps inside a workout.                                   | Set group, segment          |
| **Step**             | A single ordered instruction within a block, optionally including activity and intensity. | Interval, action            |
| **Activity Type**    | The sport modality for a workout or step (for example run, bike, swim).                   | Sport type, discipline type |
| **Intensity Target** | The prescribed effort range for a step, expressed via a selected metric model.            | Zone target, effort         |
| **Workout Shape**    | A compact visual summary of a workout's ordered steps and intensity targets.              | Sparkline, graph, timeline  |

## Planning metrics and filters

| Term                    | Definition                                                                                                        | Aliases to avoid                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| **Activity Filter**     | A single-select filter that narrows Upcoming Workouts by activity type.                                           | Sport filter, discipline tab      |
| **Activity Allocation** | The summary distribution of upcoming workout sessions by activity type within the 14-Day Horizon.                 | Sport mix, split, plan allocation |
| **Training Metric**     | A measurable workout value such as duration, distance, TSS, or training stress.                                   | Stat, number, KPI                 |
| **Unavailable Metric**  | A training metric that the current domain model cannot truthfully calculate.                                      | Fake metric, mock stat            |
| **Summary Count**       | A truthful aggregate derived from existing sessions, such as number of sessions or number of days in the horizon. | Metric, KPI                       |

## Session state and time

| Term                   | Definition                                                                        | Aliases to avoid               |
| ---------------------- | --------------------------------------------------------------------------------- | ------------------------------ |
| **Session Status**     | The lifecycle state of a workout session (scheduled, completed, skipped, missed). | State, progress                |
| **Scheduled At (UTC)** | The canonical stored timestamp for when a workout session starts.                 | Local time field, display time |
| **Local Display Time** | The user-visible representation of a scheduled timestamp in viewer-local time.    | Stored time, DB time           |
| **14-Day Horizon**     | The fixed rolling window used to determine which sessions are upcoming.           | Sprint window, month view      |
| **Activity Query**     | The URL query parameter that preserves the selected activity filter.              | Local filter state, tab state  |

## People and scope

| Term                      | Definition                                                                         | Aliases to avoid                 |
| ------------------------- | ---------------------------------------------------------------------------------- | -------------------------------- |
| **Self-Coaching Athlete** | The primary user who plans and reviews their own training without coach workflows. | Coach-managed athlete, team user |
| **Authenticated User**    | The signed-in identity used for data ownership and access control.                 | Viewer, account                  |
| **Owner**                 | The authenticated user who owns workouts and workout sessions.                     | Creator, participant             |

## Relationships

- A **Training Plan** contains many **Workout Sessions**.
- A **Workout Session** belongs to exactly one **Owner** and references exactly
  one **Workout Template**.
- A **Workout Template** contains one or more **Block** entries.
- A **Block** contains one or more **Step** entries.
- A **Step** may include an **Activity Type** and an **Intensity Target**.
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
> **Dev:** "Can we fill duration, distance, and TSS with placeholder numbers to
> match the design?"
>
> **Domain expert:** "No. Those are **Unavailable Metrics** until the model can
> calculate them; use **Summary Counts** and **Activity Allocation** where the
> data is truthful."
>
> **Dev:** "Then the mini graphic in each row should come from the workout's
> ordered **Steps**?"
>
> **Domain expert:** "Exactly. **Workout Shape** is semantic: it visualizes the
> **Intensity Targets** already present in the workout structure."

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
