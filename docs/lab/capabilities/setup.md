# Setup capabilities

Getting started, connecting the watch, setting a goal, getting a plan, and
changing things: jobs **1, 2, 3, 4 and 11** of the product brief.

Every type named here is exported from `app/lab/engine/setup.types.ts`
(client-safe: `import type { … } from '#app/lab/engine/setup.types.ts'`).
That file is the full contract; this page says what each capability is for,
what it refuses, and what to show.

## Calling a capability

On the server, in a loader or action:

```ts
import { runCapability } from '#app/lab/engine/registry.server.ts'

const result = await runCapability(request, 'start_options', {})
if (result.ok) result.value.options // StartOption[]
else result.message // Norwegian, safe to show
```

In the browser (writes revalidate the page's loaders when they succeed):

```ts
import { useCapability } from '#app/lab/engine/client.ts'
import type { SetupState, SetSportsInput } from '#app/lab/engine/setup.types.ts'

const setSports = useCapability<SetSportsInput, SetupState>('set_sports')
await setSports.call({ sports: ['run', 'bike'] })
```

Over HTTP: `POST /lab/api/<name>` with a JSON body; reads also answer
`GET /lab/api/<name>?input=<json>`. The answer is `{ ok: true, value }` or
`{ ok: false, code, message }`.

**Every capability** can also fail with `invalid-input` (the input did not
match its type). A signed-out caller is sent to log in. Everything is the
signed-in athlete's own; another athlete's id answers `not-found`.

## Conventions

- **Days of the week** are `'mon' … 'sun'`. **Dates** are `YYYY-MM-DD` in the
  athlete's timezone; instants are ISO strings.
- **Unknown numbers are `null`, never 0.** Where it helps there is a `why`
  (Norwegian) beside it: show it instead of a number. `Known<number>` is
  `{ value: number | null; why?: string }`.
- **Sports** are `run | bike | swim`. Strength is not a sport here; it is a
  frequency (`set_strength`). Other activities (`cross-country-ski`, `hike`,
  `climb`, `yoga-mobility`) get a fixed day in the plan and no structure.
- **Efforts** are `easy | moderate | hard`.
- Words in outputs (`name`, `why`, `note`, `label`, `message`) are Norwegian
  and ready to show.

---

## Getting started (job 1)

The athlete's answers are stored as they are given, one at a time, in any
order. Ask them however the app likes. Plans can be shown once **sports** and
**level** are answered; hours and days fall back to the athlete's history,
then to what the level suggests, and `start_options` says when it did.

### `get_setup` (read)

Input `{}`. Output `SetupState`:

- `answers: AthleteSetup` — everything said so far. `null` means never said
  (ask); `[]` means said none.
- `missing: ('sports' | 'level')[]` — what is needed before plans can be shown.
- `readyForPlans`, `hasPlan` — `hasPlan: true` means getting started is done.
- `suggested` — the level's suggestion for hours, days and strength (null
  until the level is set). Use it to pre-fill, and say it is a suggestion.
- `fromHistory` — what recorded training says: `hoursPerWeek: Known`,
  `days`, `importing` (history still arriving), `note`. With no data,
  `hoursPerWeek.value` is null and `why` says why: show that.
- `choices` — every option for each question with its Norwegian label, and
  the hours range (1–20 in half hours).

```ts
const setup = await runCapability(request, 'get_setup', {})
```

### `set_sports` (write)

Input `SetSportsInput`: `{ sports: Sport[]; mainSport?: Sport; otherActivities?: OtherActivity[] }`.
The first sport is the main one (the plan is built around it) unless
`mainSport` says otherwise. At least one sport or other activity.
Output `SetupState`. Fails `invalid-input` (nothing picked, or `mainSport`
not among `sports`). No undo needed: set it again.

### `set_experience_level` (write)

Input `{ level: 'beginner' | 'recreational' | 'experienced' | 'competitive' }`.
Picks which plan styles are offered and the suggestions. Output `SetupState`.

### `set_current_volume` (write)

Input `{ hoursPerWeek: number }` — what they train now, 1–20 in half hours.
The plan starts there and builds. Fails `invalid-input` otherwise.

### `set_availability` (write) — also job 11

Input `SetAvailabilityInput`: `days` (the days that work) **or**
`blockedDays` (the days that don't), and/or `hoursPerWeek` (the most they
have room for; `null` clears it). Output `SetAvailabilityOutput`:
`{ setup, planEffect, note }`.

With a plan, a day taken away is taken out of the plan's fixed days:
`planEffect` lists each sport/activity that lost days and what it keeps
(`keptDays: null` = the plan picks again). Weeks already on the calendar are
not moved; the next weeks laid use the new days. Show `note`. Fails
`invalid-input` (both lists sent, no day left, nothing sent). No undo: set the
days back.

### `set_strength` (write)

Input `{ perWeek: 0 | 1 | 2 | 3 }`. 0 = no lifting (stored as
`strengthPerWeek: null`). Lifting days are placed away from hard days; the
plan may lay fewer than asked when the days don't allow (the option says so).

### `set_session_preferences` (write)

Input `{ preferences: ('long' | 'intervals' | 'threshold' | 'short' | 'surprise')[] }`
(`[]` = skip). They rank the plan styles; `short` keeps weekday sessions to
45 minutes.

### `set_timezone` (write)

Input `{ timezone: string }` (IANA). Fails `invalid-input` for an unknown zone.

### `search_places` (read) / `set_home_place` / `remove_home_place` (write)

Home place, used only for the weather. `search_places { text }` →
`SearchPlacesOutput` (`found` with places, or `unavailable` with `why`).
Call it with POST so the text stays out of addresses. Send a found place back,
unchanged, to `set_home_place`; fails `outside-area` outside Norway.
`remove_home_place {}` clears it. Each returns `SetupState`.

---

## Getting a plan (job 4)

### `start_options` (read)

Input `{}`. Output `StartOptionsOutput`:

- `startsOn` — the plan's first Monday (the first week not yet begun).
- `options: StartOption[]` — ranked, never two with the same week. Each is a
  plan style with its plain `name`, `why`, `styleName`, an optional `badge`
  (only on the first, only with a reason), and **`firstWeek: PreviewWeek`**:
  seven days, each with its sessions (`title`, `sport`, `minutes`, `effort`)
  and strength sessions (by their lifts, never minutes), plus totals. A day
  with no sessions is a rest day. `shortOfHours`, `notFitted` and
  `strengthNotes` say where the week differs from what was asked.
- `assumed` — hours or days that were not answered and were filled from
  `history` or the `level`. Say so, and offer to change them.
- `notes` — lines about the set (fewer options because two were the same,
  fewer days used than picked, a rest day kept …).

Fails `not-ready` (sports or level missing; message says which), `has-plan`,
`no-days` (availability set to no days), `nothing-to-lay`.

### `plan_preview` (read)

Input `{ style?: PlanStyle }` (default: the first option). Output
`PlanPreviewOutput`: the first two weeks day by day (`weeks`, exactly what
will be laid), the first block's `phases`, and `outlook` — every week of the
block with its phase, role (`loading` / `recovery` / `taper`, with
`roleLabel`) and target `hours` (null with `why` when it cannot be priced).
With a goal set, `towardGoal` shows the phases and weeks toward the race once
accepted, or `problem` (e.g. the race is this week). Fails like
`start_options`, plus `style-unavailable`.

### `accept_plan` (write) — completes getting started

Input `{ style?: PlanStyle }`. Makes exactly the plan `plan_preview` showed,
stores the answers used (including assumed days), and puts the first two
weeks on the calendar. If a goal is set, the plan then runs toward it
(`goalApplied`, or `goalProblem` with why). Output `AcceptPlanOutput`
(`planId`, `style`, `startsOn`, `sessionsLaid`, …). Fails `not-ready`,
`has-plan`, `style-unavailable`, `nothing-to-lay`, `no-days`.
**No undo** (`undo: null`): there is no "un-make" in the domain; the plan
changes from here on through the session and week capabilities.

After this, the plan lays each next week itself and adapts at each week's
end (see `set_preferences.adjustAutomatically`).

---

## Setting a goal (job 3)

One goal at a time: the race the plan runs toward, or else the nearest
planned one. No goal = open-ended («bli i bedre form»): the plan runs block
by block.

### `goal` (read)

Input `{}`. Output `GoalOutput`: `goal: Goal | null` (name, date, sports,
`distanceKm`, `targetTime { seconds, text }`, `status`, `daysLeft`,
`planRunsTowardIt`), `openEnded`, and **`proposal`** — when the athlete has
an open-ended plan and a goal it does not run toward yet: what applying it
would do (`endsCurrentBlock`, `phases`, week `outlook`, `steepWeeks` that
rise over 10 % (a warning), `ownSessionsKept`) and the `digest` to accept it
with. `problem` says why it cannot be applied, where it cannot.

### `set_goal` (write)

Input `SetGoalInput`:
`{ kind: 'event'; name; date; sport; distanceKm?; targetTime? }`
(`targetTime` as `t:mm:ss`, `mm:ss`, or seconds) or `{ kind: 'open-ended' }`.
Output `GoalWriteOutput` (the `goal` output plus `undo`).

- Before a plan: the goal is stored; `plan_preview` shows the plan toward it
  and `accept_plan` applies it.
- With an open-ended plan: nothing changes until the athlete says yes —
  the output carries the `proposal`; apply it with `apply_goal_to_plan`.
- `open-ended` removes a goal that has no plan built on it.

Fails `goal-exists` (change it with `update_goal`), `date-past` (must be after
today), `invalid-input` (bad time), `goal-has-plan` (open-ended while the plan
is built for the goal: use `remove_goal`). Undo: `undo_goal_change`.

### `apply_goal_to_plan` (write)

Input `{ goalId, digest }` from the proposal. The current block ends after
this week and the phases toward the race are laid from next week; the
athlete's own sessions stay, and the coming weeks are laid again. Output
`ApplyGoalToPlanOutput`. Fails `not-found`, `preview-stale` (the plan changed
since the proposal: read `goal` again and show the new one), `event-too-soon`,
`event-past`, `event-cancelled`, `event-already-planned`, `plan-too-long`,
`outline-not-found` (no open-ended plan). **No undo** in the domain; removing
the goal (`stopPlan`) is the way back.

### `update_goal` (write)

Input `UpdateGoalInput` — any of `name`, `date`, `sport`, `distanceKm`
(`null` clears), `targetTime` (`null` clears). Output `GoalWriteOutput` with
an `undo`. A new date does **not** move the phases of a plan already running
toward the goal. Fails `no-goal`, `date-past`, `invalid-input`.

### `remove_goal` (write)

Input `{ stopPlan?: boolean }`. A goal with no plan built on it is deleted.
When the plan runs toward it, `stopPlan: true` is required: the goal is
marked cancelled and the plan stops with it (getting started can make a new
one). Output `RemoveGoalOutput` (`removed`, `planStopped`, `undo`). Fails
`goal-has-plan` without `stopPlan`. Ask before sending `stopPlan`.

### `undo_goal_change` (write)

Input `{ undo }` — the token from `set_goal`, `update_goal` or `remove_goal`.
Restores the goal as it was (a stopped plan comes back with its goal, unless
a new plan was made since: `has-plan`). Output `GoalWriteOutput`. Fails
`invalid-undo`, `not-found`, `has-plan`.

---

## Connecting the watch (job 2)

### `connections` (read)

Input `{}`. Output `ConnectionsOutput`: every source, listed honestly —
`intervalsicu` (available, connect with a personal API key), `polar`
(`not-available`: cannot be connected from here yet; `why` says to connect
Polar to intervals.icu or upload files), `garmin` / `suunto` (`coming-soon`),
`file` (upload, always available), and `strava` only if the athlete connected
it before (it is not offered). Each has `state`
(`not-connected | connected | importing-history | needs-reconnect`),
`lastCheckedAt`, `canSync`, `canDisconnect`, `why`. `duplicateRisk` is a line
to show when two sources are active.

### `connect_intervals_icu` (write)

Input `{ apiKey }` — from intervals.icu → Settings → Developer Settings. The
key is checked against intervals.icu, which also tells us the athlete id; the
history (the last weeks) is fetched in the background — `import_status`
shows the progress. Output `{ source }`. Fails `empty-key`, `key-rejected`,
`unreachable` (each with a message to show next to the field). Reconnecting
with a new key replaces the old one.

### `disconnect_source` (write)

Input `{ source: 'intervalsicu' | 'strava' }`. Sessions already fetched stay.
Output `{ source }`. No undo: connect again.

### `sync_sources` (write)

Input `{ source? }`. Asks the connected sources for new sessions now (they are
also checked daily). Output `SyncOutput`: `imported`, `failed` (per source,
with a message), `retryAt` (when a rate-limited source may be asked again).
Fails `not-connected`.

### `upload_activity_files` (write, multipart)

Send `multipart/form-data` with one or more `file` fields (`.fit`,
`.fit.gz`, `.tcx`, `.gpx`, `.zip` such as a Strava export, `.gz`), and
optionally `sport` (`run|bike|swim|strength`, only for a single file).

```ts
import { uploadToCapability } from '#app/lab/engine/client.ts'
const form = new FormData()
for (const file of input.files) form.append('file', file)
const result = await uploadToCapability<UploadOutput>('upload_activity_files', form)
```

Output `UploadOutput`: `imported`, `duplicates`, `failed` (file and reason),
`sessionId` for a single imported file. Each session lands on its own day and
links to a planned session where one fits. Fails `no-file`, `too-large`,
`too-many-files` (20 at a time).

### `import_status` (read)

Input `{}`. Output `ImportStatusOutput`: `importing` (history still arriving
— poll every few seconds while true), the connected sources' states,
`recordings` (total, by source, earliest/latest), and `history` — weeks with
training of the last four, and `hoursPerWeek: Known` (null with `why` until
there is data).

---

## Changing things (job 11)

Availability: `set_availability`. Goal: the goal capabilities. Connections:
the connection capabilities. Level, strength, preferences and sports: the
getting-started writes; after a plan exists they are read the next time plan
styles are offered and do not rewrite weeks already laid.

### `thresholds` (read)

Input `{}`. Output `ThresholdsOutput`: per sport, `values` (`maxHr`, `lthr`,
`ftp` (bike), `runPower` and `thresholdPacePerKm` (run, seconds per km),
`cssPer100m` (swim, seconds per 100 m)); a value the sport does not have, or
the athlete never gave, is `null`. `zoneSystem` (`chosenBy: 'app'` when it is
the default), `zoneSystems` to choose from, `zones` — each a `range`
(`bpm`, `watt`, `sec-per-km`, `sec-per-100m`; `max: null` = open-ended) or
`range: null` with `why` (the threshold it hangs on is not set) — and
`history` of changes.

### `set_thresholds` (write)

Input `SetThresholdsInput`: `sport` and any of its thresholds, and/or
`zoneSystem`. Bounds: heart rates 80–220, watts 50–600, threshold pace
150–600 s/km, CSS 60–250 s/100 m. Planned sessions' targets are recalculated.
Output the sport's `SportThresholds`. Fails `invalid-input` (a threshold the
sport does not have, a zone system of another sport, nothing sent). No undo:
each change is kept in `history`; set the old value again.

### `set_display_name` (write)

Input `{ name: string | null }` (1–40 characters). Output `SetupState`.

### `set_preferences` (write)

Input `SetPreferencesInput`: `adjustAutomatically` (true: at each week's end
the plan adjusts itself and says what it did, with undo; false: it proposes
and waits for a yes), `defaultTrainingTime` (`HH:MM`, the time sessions are
put on; `null` clears — 07:00 is used), `sessionPreferences`. Output
`SetupState`.

### `export_data` (read)

Input `{}`. Output `{ fileName, data }` — everything the athlete owns, as
JSON. Offer it as a download.

### `delete_account` (write)

Input `{ confirm: 'SLETT' }` — the athlete types it. Deletes the account and
all data for good, in one step: either everything goes or nothing does.
Output `{ deleted: true, workoutsErased }`; the athlete is then signed out
(send them to the start page). Fails `confirm-required`, `delete-failed`
(nothing was deleted). **No undo.** Before calling, say what goes, and offer
`export_data`.
