# Ubiquitous Language

## Training planning domain

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Training Plan** | The athlete's forward-looking schedule of planned training sessions. | Program, calendar |
| **Workout Template** | A reusable workout definition that can be scheduled multiple times. | Workout plan, base workout |
| **Workout Session** | A scheduled instance of a workout template at a specific date-time. | Scheduled workout, occurrence |
| **Upcoming Workouts** | The subset of workout sessions scheduled from now through the next 14 days. | Next workouts, future workouts |
| **Workout Detail View** | The read-only screen showing a workout session and its structured content. | Session page, workout page |

## Workout structure

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Workout** | The structured training definition owned by a user and used as a template. | Session, activity |
| **Block** | An ordered grouping of repeated steps inside a workout. | Set group, segment |
| **Step** | A single ordered instruction within a block, including duration/distance/intensity data. | Interval, action |
| **Activity Type** | The sport modality for a workout or step (for example run, bike, swim). | Sport type, discipline type |
| **Intensity Target** | The prescribed effort range for a step, expressed via a selected metric model. | Zone target, effort |

## Session state and time

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Session Status** | The lifecycle state of a workout session (scheduled, completed, skipped, missed). | State, progress |
| **Scheduled At (UTC)** | The canonical stored timestamp for when a workout session starts. | Local time field, display time |
| **Local Display Time** | The user-visible representation of a scheduled timestamp in viewer-local time. | Stored time, DB time |
| **14-Day Horizon** | The fixed rolling window used to determine which sessions are upcoming. | Sprint window, month view |

## People and scope

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Self-Coaching Athlete** | The primary user who plans and reviews their own training without coach workflows. | Coach-managed athlete, team user |
| **Authenticated User** | The signed-in identity used for data ownership and access control. | Viewer, account |
| **Owner** | The authenticated user who owns workouts and workout sessions. | Creator, participant |

## Relationships

- A **Training Plan** contains many **Workout Sessions**.
- A **Workout Session** belongs to exactly one **Owner** and references exactly one **Workout Template**.
- A **Workout Template** contains one or more **Block** entries.
- A **Block** contains one or more **Step** entries.
- A **Step** may include an **Activity Type** and an **Intensity Target**.
- **Upcoming Workouts** is a filtered view of **Workout Sessions** within the **14-Day Horizon**.
- **Scheduled At (UTC)** is stored data; **Local Display Time** is presentation only.

## Example dialogue

> **Dev:** "If I edit a **Workout Template**, should all future **Workout Sessions** automatically reflect that change?"
>
> **Domain expert:** "For this POC, the **Training Plan** view is session-centric, so upcoming display follows each **Workout Session** as currently scheduled."
>
> **Dev:** "And **Upcoming Workouts** means only sessions inside the **14-Day Horizon**, right?"
>
> **Domain expert:** "Exactly, filtered from now forward and shown in **Local Display Time**."
>
> **Dev:** "So an **Authenticated User** should only ever see sessions where they are the **Owner**."
>
> **Domain expert:** "Yes, ownership scoping is mandatory for all training views."

## Flagged ambiguities

- "workout" has been used to mean both **Workout Template** and **Workout Session**; use **Workout Template** for reusable definitions and **Workout Session** for scheduled instances.
- "upcoming" was initially vague; standardize it to the **14-Day Horizon**.
- "view a workout" can refer to a template or a scheduled instance; prefer **Workout Detail View** of a **Workout Session** in this POC.
- "date from an endpoint" can imply storage format and display format are the same; keep **Scheduled At (UTC)** for storage and **Local Display Time** for UI.
