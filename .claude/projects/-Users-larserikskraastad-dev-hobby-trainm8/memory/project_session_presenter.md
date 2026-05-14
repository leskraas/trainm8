---
name: session-presenter-module
description:
  Local Display Time formatting centralized in session-presenter.ts — design
  decisions and rationale
metadata:
  type: project
---

A `useSessionPresenter()` hook in `app/utils/session-presenter.ts` owns all
Scheduled At (UTC) → Local Display Time formatting for Workout Sessions.

**Why:** Three+ call sites had duplicated `Intl.DateTimeFormat` usage with
`locale`/`timeZone` prop-drilled from each route loader. The CONTEXT invariant
("Scheduled At UTC is storage; Local Display Time is presentation") was
cultural, not structural.

**How to apply:** All rendering of `session.scheduledAt` must go through
`useSessionPresenter().presentSession(session)`, which returns
`{ timeOfDay, longDate, shortDate }`. Grouping by day uses
`presenter.groupByDay(sessions)`. Never call `Intl.DateTimeFormat` directly for
session times.

`locale` is now in `requestInfo` (root loader), `timeZone` comes from
`requestInfo.hints`. The hook reads both via
`useOptionalRequestInfo`/`useOptionalHints` with UTC/en-US fallback (safe in
prod since root always provides these).

The presenter is Workout Session-specific (not a generic timestamp formatter) —
this was a deliberate decision. If Session Log `createdAt` or other domain
timestamps need similar treatment, build a parallel domain presenter rather than
generalizing this one.

Pure functions `presentSession` and `groupByDay` are also exported for direct
testing without a React wrapper.
