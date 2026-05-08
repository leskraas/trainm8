# Trainm8 Product Direction

## Product summary

Trainm8 is a training planning app for self-coaching athletes.  
The product helps an athlete understand what to train next by showing a clear,
structured view of upcoming workouts.

The first milestone is a proof of concept focused on viewing a training plan,
not creating or editing one.

## Design system

- shadcn theme ID: `b6tOz2WRv`

## Who this is for

- Primary user: self-coaching athlete.
- Not in scope yet: coach-athlete workflows, teams, shared plans.

## Problem we are solving

The current app does not provide a reliable training planning flow. Users cannot
open the app and quickly answer:

- What is my next workout?
- What do I need to do in that workout?
- What is scheduled this week?

## Product vision

Trainm8 should become the place where an athlete can:

1. See their upcoming training plan clearly.
2. Open any upcoming workout and understand session details quickly.
3. Trust that workout timing and session status are accurate.

## POC goal (current scope)

Deliver a database-backed upcoming workouts experience from seeded Prisma data,
with a training-first app structure.

For the POC, users should be able to:

- View upcoming workouts for the next 14 days.
- See workouts grouped by day with local display time.
- See workout session status (scheduled, completed, skipped, missed).
- Open a workout detail view from the upcoming list.
- See a training dashboard on `/` after login (next session, upcoming summary).
- Log post-session feedback via Session Log (text reflection + RPE).
- Navigate via persistent app navigation (bottom tabs mobile, top nav desktop).

## Domain model direction

We use a template + scheduled session model:

- Workout Template: reusable workout structure.
- Workout Session: scheduled instance tied to date-time and status.
- Workout structure: workout -> block -> step.

Time handling:

- Store schedule timestamps in UTC.
- Render times in local user/viewer context.

## App structure

- `/` — Dashboard for logged-in users, marketing landing for unauthenticated.
- `/training/upcoming` — Upcoming Ledger (dense 14-day planning surface).
- `/training/upcoming/:sessionId` — Workout Detail View.
- `/settings/profile/*` — Identity and account management.
- Navigation: bottom tab bar on mobile (Home, Training, Settings), horizontal
  top nav on desktop.

## What we are not building yet

Out of scope for this phase:

- Workout creation/editing.
- Full training plan builder UX.
- Recurrence/auto-generated schedules.
- Notifications and calendar sync.
- Analytics and progress dashboards.
- Advanced coaching logic and prescription engines.
- Multi-athlete and coach workflows.
- Social features (user profiles, user search, shared plans).
- Workout Library and Calendar views (removed as placeholders).

## Success criteria for the POC

We consider this phase successful when:

1. Seeded training data is visible through a real Prisma-backed flow.
2. Upcoming endpoint returns correctly scoped user data for the 14-day horizon.
3. Dashboard shows next session and upcoming summary after login.
4. A user can open workout details from the upcoming list.
5. A user can write a Session Log (text + RPE) after a workout session.
6. Persistent app navigation works on mobile (bottom tabs) and desktop (top
   nav).
7. All "Epic Notes" branding is replaced with "Trainm8".

## Near-term roadmap after POC

After this POC, likely next steps are:

1. Planning/editing workflows for workouts and schedules.
2. Better schedule management (reschedule, skip, move, duplicate).
3. Execution tracking and post-workout outcomes.
4. Longer-term intelligence layers (advice, progression, analytics).
