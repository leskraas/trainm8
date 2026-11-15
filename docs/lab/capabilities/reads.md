# Read capabilities

Everything an app reads: who the athlete is and how far they have come
(`athlete`), what to do today (`today`), any week (`week`), the whole season
(`plan`), one session in full (`session`), a range of sessions (`sessions`),
progress over time (`progress`), what the plan wants to change (`proposals`),
zones and thresholds (`zones`), the strength exercise library (`exercises`,
`exercise`) and what the watch brought in (`recordings`).

Reads never change anything. Every type named here is exported from
`app/lab/engine/reads.types.ts` (client-safe:
`import type { … } from '#app/lab/engine/reads.types.ts'`). That file is the
full contract, with a comment on every field; this page says what each read is
for, which jobs of the product brief it serves, what it refuses, and what to
show.

| Read         | Jobs                   | Demo |
| ------------ | ---------------------- | ---- |
| `athlete`    | 1, 2, 3, 4, 11         | yes  |
| `today`      | 5, 6, 8, 10            | yes  |
| `week`       | 4, 5, 8, 9             | yes  |
| `plan`       | 3, 4, 10               | yes  |
| `session`    | 5, 6, 7, 8, 9          | yes  |
| `sessions`   | 6, 9, 10               | yes  |
| `progress`   | 9, 10                  | yes  |
| `proposals`  | 8                      | yes  |
| `zones`      | 5, 11                  | no   |
| `exercises`  | 6 (strength), 8 (swap) | no   |
| `exercise`   | 6, 10                  | no   |
| `recordings` | 2, 6                   | no   |

## Calling a read

On the server, in a loader:

```ts
import { runCapability } from '#app/lab/engine/registry.server.ts'

const result = await runCapability(request, 'today', {})
if (result.ok)
	result.value.sessions // SessionCard[]
else result.message // Norwegian, safe to show
```

In the browser:

```ts
import { useCapability } from '#app/lab/engine/client.ts'
import type { WeekOutput } from '#app/lab/engine/reads.types.ts'

const week = useCapability<{ date?: string }, WeekOutput>('week')
const result = await week.call({ date: '2026-11-23' }, { revalidate: false })
```

Over HTTP: `GET /lab/api/<read>?input=<url-encoded json>` (or `POST` with a JSON
body). The answer is `{ ok: true, value }` or `{ ok: false, code, message }`.

**Every read** can fail with `invalid-input` (the input did not match its type).
A signed-out caller is sent to log in. Everything is the signed-in athlete's
own: another athlete's session or exercise answers `not-found`.

## Conventions

- **Unknown numbers are `null`, never 0.** Every number the athlete might read
  is a `Num`: `{ value: number | null; why: string | null }`. When `value` is
  null, `why` says why in short Norwegian (`Ikke målt: …`, `Ikke satt: …`,
  `Formen vises etter 42 dager med historikk (nå 10).`). Show `why` (or a short
  "ukjent" with `why` on demand) in place of the number. Never draw a null as
  zero, an empty bar or a flat line. A `0` with `why: null` is a true zero
  ("nothing planned").
- **Numbers are unrounded.** Round for display yourself (fitness to whole
  numbers, km to one decimal, …).
- **Units**: durations in seconds (`durationS`), distances in metres
  (`distanceM`), load in TSS (`load`), pace in seconds per km (or per 100 m for
  swimming, said by `unit`), power in watts, heart rate in beats per minute,
  weights in kg. A sport's weekly volume is in its own `unit`: `km`, `hours`,
  `tss` or `sets`.
- **Days** are `YYYY-MM-DD` in the athlete's timezone; instants are ISO strings.
  Days of the week are `'mon' … 'sun'`. A **week** is Monday–Sunday and is named
  by its Monday (`weekKey`).
- **Sports** are `run | bike | swim | strength | other`; `sportName` is the
  Norwegian word to show.
- **Whose session** (`whose`): `plan` sessions are the plan's to adjust;
  `athlete` sessions are the athlete's own and are never changed without their
  yes. Worth showing, quietly.
- Words in outputs (`sportName`, `title`, `label`, `sentence`, `why`,
  `headline`, `reason`, `message`) are Norwegian and ready to show. Session
  titles and notes are the athlete's (or the plan's) own words.

### The demo athlete

`athlete`, `today`, `week`, `plan`, `session`, `sessions`, `progress` and
`proposals` take `demo: true` to answer for a made-up athlete instead: a runner
ten weeks from a half marathon who also rides, swims and lifts. The answer has
`source: 'demo'`; **say on screen that it is demo data**. Without `demo: true`
every read answers with `source: 'athlete'` and the athlete's own data, however
little there is: nothing ever falls back to demo data by itself. Demo session
ids start with `demo-` and only work with `demo: true`.

## Shared shapes

```ts
type Num = { value: number | null; why: string | null }

type SessionStatus = 'planned' | 'done' | 'missed' | 'recording-only'
// planned: still to do (today's stays planned until the day is over)
// done: recorded or said done · missed: its day passed, or it was skipped
// recording-only: the watch recorded something no plan asked for

type Verdict = {
	call: 'under' | 'on-target' | 'over' | null // lighter, as planned, harder
	label: string | null // 'Under' | 'I rute' | 'Over'
	sentence: string | null // 'Under – lettere enn planlagt'
	why: string | null // why there is no call
}

type SessionCard = {
	id: string
	date: DayKey
	time: string | null // 'HH:MM' local
	sport: Sport
	sportName: string
	title: string
	purpose: string | null // 'Terskel', 'Utholdenhet', …
	status: SessionStatus
	whose: 'athlete' | 'plan'
	planned: { durationS: Num; distanceM: Num; load: Num }
	actual: { durationS: Num; distanceM: Num; load: Num }
	verdict: Verdict // planned against actual load
	rpe: number | null // how hard it felt, 1–10
	hasRecording: boolean
	markedDone: boolean // said done by hand; numbers may follow from the watch
	strengthSetsLogged: number | null // strength sessions only
	adjustedBecause: string | null // why the plan adjusted it
	outsideWeeklyCount: boolean // counts in no sport's weekly volume
}

type SportVolume = {
	sport: Sport
	sportName: string
	unit: 'km' | 'hours' | 'tss' | 'sets'
	target: Num // the week's target from the plan
	planned: Num // what the week's sessions add up to
	actual: Num // what was done
}

type Form = { fitness: Num; fatigue: Num; form: Num }
type FormTrust = {
	trusted: boolean
	daysOfHistory: number | null
	requiredDays: number // 42
	why: string | null
}

type PhasePosition = {
	name: string
	planWeek: number // 1-based
	planWeeks: number
	phaseWeek: number
	phaseWeeks: number
	role: 'loading' | 'recovery' | 'taper' | null // building, easy or taper week
}
```

**Form needs history.** Fitness and fatigue are shown from the first recorded
day; form (`form`) stays `null` until 42 days of history make it trustworthy.
`formTrust` says how far along that is: show progress towards it ("dag 10 av
42") instead of a number.

---

## `athlete` (read)

Jobs 1–4 and 11. Who the athlete is and how far they have come in getting
started. **This is the switch** between a first open and a returning athlete:
read `setup`.

Input: `{ demo?: boolean }`. Output `AthleteOutput`:

```ts
type AthleteOutput = {
	source: 'athlete' | 'demo'
	name: string | null
	username: string
	email: string | null
	timezone: string
	today: DayKey
	level: 'beginner' | 'recreational' | 'experienced' | 'competitive' | null
	levelName: string | null // 'Mosjonist'
	sports: Sport[] // the plan's sports first, then what they record
	availability: {
		days: Weekday[] | null // null = never said
		usualTime: string | null // 'HH:MM'
		weeklyHours: Num
		strengthPerWeek: number | null
		likes: string[] // 'long' | 'intervals' | 'threshold' | 'short' | 'surprise'
	}
	setup: {
		firstOpen: boolean // nothing at all yet
		answeredBasics: boolean // level and days are answered
		hasSessionSource: boolean // a watch service connected, or anything recorded
		hasGoal: boolean
		hasPlan: boolean
		complete: boolean // = hasPlan: getting started is done
		next: 'basics' | 'connect' | 'goal' | 'plan' | null
	}
	sources: DataSourceLink[]
	recordings: { count: number; first: DayKey | null; last: DayKey | null }
	goal: Goal | null
	plan: { exists: boolean; firstWeek: DayKey | null; lastWeek: DayKey | null }
	homePlace: { name: string; municipality: string } | null
	adjustMode: 'autopilot' | 'ask-first'
	units: 'metric' | 'imperial'
}

type DataSourceLink = {
	provider: 'intervalsicu' | 'polar' | 'strava' | 'garmin'
	name: string
	status: 'disconnected' | 'connected' | 'importing-history' | 'needs-reconnect'
	canConnect: boolean // false for a service kept only for an old connection
	connectedAt: string | null
	lastCheckedAt: string | null // when the app last asked it for sessions
	newestSessionAt: string | null
	historyImported: boolean
}

type Goal = {
	kind: 'event' | 'open-ended' // a race on a date, or "get fitter"
	eventId: string | null
	name: string
	date: DayKey | null
	daysToGo: number | null
	eventKind: string | null // 'race' | 'time-trial' | 'fitness-goal'
	sports: Sport[]
	aim: string | null // 'På 1:45:00', 'Fullføre'
	aimDetail: /* the aim as data */ object | null
}
```

- `setup.complete` is `true` once the athlete has a plan. Before that, open on
  getting started; `setup.next` is the step it would ask for next (connecting is
  optional: a file upload or "skip" is fine).
- `firstOpen` is `true` only when there is nothing at all: no answers, no
  sessions, no recordings, no goal, no plan.
- `goal` is the plan's event, the open-ended plan's, or (with no plan) the
  nearest upcoming event; `null` when there is none.
- `adjustMode`: on `autopilot` the plan adjusts each week by itself and says
  what it did (each change can be undone, see `proposals.changesMade`); on
  `ask-first` it proposes and waits.
- Nulls: `availability.days`, `level` and `usualTime` are `null` when never
  said: ask. `weeklyHours.why` says it was never set.

```ts
const me = await runCapability(request, 'athlete', {})
if (me.ok && !me.value.setup.complete) throw redirect('/lab/myapp/start')
```

## `today` (read)

Job 5 (what to do today), 6 (done or not), 8 (proposals waiting), 10 (form).

Input: `{ demo?: boolean }`. Output `TodayOutput`:

```ts
type TodayOutput = {
	source: 'athlete' | 'demo'
	date: DayKey
	weekday: Weekday
	weekKey: DayKey
	restDay: boolean // nothing planned today (recordings may still be there)
	sessions: SessionCard[] // today's, planned, done and recorded
	next: SessionCard | null // the next planned session after today
	form: Form
	formTrust: FormTrust
	readiness: Readiness
	week: SportVolume[] // this week so far, per sport in the plan
	phase: PhasePosition | null
	proposalsWaiting: number
	changesMade: number // changes the plan made by itself that can still be undone
	weather: Weather | null
	weatherWhy: string | null // why there is no weather
}

type Readiness = {
	call: 'fresh' | 'neutral' | 'fatigued' | 'overreaching' | 'drifting' | null
	ledBy: 'form' | 'adherence' | null
	sentence: string // always present, also without a call
	nextSession: {
		outcome: 'eased' | 'held' | 'unavailable' | 'none'
		sentence: string | null
	}
}

type Weather = {
	at: string // the hour it is for
	symbol: string
	label: string // 'Delvis skyet'
	temperatureC: number
	precipitationMm: number
	credit: string // show it with the weather
}
```

- `readiness` is the coach's one call for the day: form reconciled with weeks of
  being over or under the plan. `fresh` → go for it; `neutral` → train as
  planned; `fatigued` → take it easy; `overreaching` → over the plan for weeks,
  ease back; `drifting` → under the plan for weeks. `call` is `null` before form
  can be trusted and with no trend: show `sentence`, which then says how far the
  history has come. `nextSession` says what the call did (or would do) to the
  next planned session: `eased` means it was made easier and the sentence says
  how.
- `weather` is `null` when the athlete has not chosen where they train from, or
  the forecast is not available: show `weatherWhy`, or nothing.
- A rest day is `restDay: true`; show `next` for what comes after.

## `week` (read)

Jobs 4, 5, 8, 9. Any training week, Monday to Sunday.

Input: `{ date?: DayKey; demo?: boolean }` — any day in the week; this week when
left out. Output `WeekOutput`:

```ts
type WeekOutput = {
	source: 'athlete' | 'demo'
	weekKey: DayKey // the Monday
	when: 'past' | 'current' | 'future'
	isoWeek: number // 'Uke 46'
	phase: PhasePosition | null // null outside the plan
	days: {
		date: DayKey
		weekday: Weekday
		isToday: boolean
		isPast: boolean
		available: boolean | null // the athlete can train this weekday; null = never said
		restDay: boolean
		sessions: SessionCard[]
	}[] // always seven, Monday first
	sports: SportVolume[] // per sport in the plan; empty without a plan
	load: { planned: Num; actual: Num; verdict: Verdict } // TSS
	counts: {
		planned: number
		done: number
		missed: number
		recordingOnly: number
	}
	proposals: ProposalItem[] // waiting proposals that would change this week
	eased: boolean // the athlete made this week easier
}
```

- `load.verdict` compares only sessions that have both a planned and an actual
  load, so a recording without a plan never makes a week look "over".
- Navigate weeks by passing the previous/next Monday (`weekKey ± 7 days`).

## `plan` (read)

Jobs 3, 4, 10. The whole season.

Input: `{ demo?: boolean }`. Output `PlanOutput`:

```ts
type PlanOutput = {
	source: 'athlete' | 'demo'
	plan: {
		goal: Goal
		firstWeek: DayKey
		lastWeek: DayKey
		totalWeeks: number
		currentWeek: number | null // 1-based; null before the start or after the end
		block: number | null // an open-ended plan's block number
		philosophy: { key: string; name: string; description: string } | null
		sports: { sport: Sport; sportName: string; unit: VolumeUnit }[]
		phases: {
			name: string
			weeks: number
			firstWeek: DayKey
			lastWeek: DayKey
			isCurrent: boolean
			rhythm: string | null // '3:1' = three building weeks, one easy
			tapers: boolean
		}[]
		weeks: {
			weekKey: DayKey
			number: number
			phase: string | null
			role: 'loading' | 'recovery' | 'taper' | null
			when: 'past' | 'current' | 'future'
			sports: SportVolume[]
			projectedLoad: Num // TSS the plan projects for the week
		}[]
		projectedFitnessOnGoalDay: Num
	} | null // null: no plan yet
	events: {
		id: string
		name: string
		date: DayKey
		kind: string
		priority: string // 'A' | 'B' | 'C'
		isPlanGoal: boolean
	}[] // every upcoming event, also ones no plan aims at
}
```

- Phase names are Norwegian: the standard phases read `Grunntrening`,
  `Oppbygging`, `Spissing`, `Nedtrapping`; a phase the athlete named reads as
  they wrote it. `weeks[].phase` is the same name.
- A plan's last week may fall short of, or past, its event; show it as it is.
- `projectedFitnessOnGoalDay` is `null` for a plan with no date, with no history
  yet, or when some week's load cannot be priced; `why` says which.

## `session` (read)

Jobs 5 (how the session is built), 6 (done; strength sets), 7 (how it felt), 8
(what can be done to it), 9 (planned against actual).

Input: `{ sessionId: string; demo?: boolean }`. Fails `not-found` ("Fant ikke
økta. Den kan være slettet.") for a session that is gone or not the athlete's.
Output `SessionOutput` = `SessionCard` and:

```ts
{
	source: 'athlete' | 'demo'
	description: string | null // as its author wrote it (may be in any language)
	summary: string | null // the whole session in one line, e.g. '10 min Rolig Oppvarming → 1 t 30 min Rolig Hoveddel'
	structure: SessionBlock[] | null // null: nothing planned (a recording)
	comparison: {
		load: { planned: Num; actual: Num }
		durationS: { planned: Num; actual: Num }
		distanceM: { planned: Num; actual: Num }
		verdict: Verdict
		structure: { call: 'as-planned' | 'diverged' | null; label: string | null; why: string | null }
		sinceLast: { sessionId: string; date: DayKey; load: Num; durationS: Num } | null
	}
	feeling: { rpe: number | null; note: string | null }
	strength: {
		exercises: StrengthExercise[]
		loggedSets: number
		prescribedSets: number
	} | null // null: no strength exercises in it
	recording: RecordingSummary | null
	can: SessionCan
}

type SessionBlock = {
	name: string | null // 'Oppvarming', 'Hoveddel', 'Nedjogg', 'Intervaller', or the author's own name
	repeat: number // 6 × …
	series: number // 3 × (13 × 30/15)
	restBetweenSeriesS: number | null
	text: string // the block in one line
	steps: {
		kind: 'work' | 'rest' | 'strength'
		sport: Sport | null
		durationS: number | null
		distanceM: number | null
		climbM: number | null
		target: StepTarget | null
		exercise: { id: string; name: string } | null
		sets: number | null
		restBetweenSetsS: number | null
		note: string | null // the author's note, as written
		text: string // the step in one line: '1 t 10 min Rolig (4:36–5:14 /km)'
	}[]
}

type StepTarget = {
	label: string // as written: 'Z2 — rolig', '95–105% FTP', '4:10–4:20 /km'
	resolvedText: string | null // the athlete's numbers: '238–263 W'
	heartRate: { min: number | null; max: number | null } | null
	power: { min: number | null; max: number | null } | null
	pace: { min: number | null; max: number | null; unit: 'km' | '100m' } | null
	approximate: boolean // a translation: show '≈'
	why: string | null // e.g. 'FTP mangler i innstillingene'
}

type StrengthExercise = {
	stepId: string
	exerciseId: string | null
	name: string
	restBetweenSetsS: number | null
	oneSideAtATime: boolean | null
	sets: {
		number: number
		role: 'warmup' | 'working' | 'backoff'
		prescribed: { reps: number | null; durationS: number | null; loadText: string | null; kg: Num } | null
		logged: {
			setLogId: string
			reps: number | null
			durationS: number | null
			kg: number | null
			loadText: string | null
			repsInReserve: number | null
			outcome: 'completed' | 'abandoned'
		} | null // null: not done yet
		lastTime: string | null // a hint: what they did on this set last time
	}[]
}

type RecordingSummary = {
	id: string
	from: string // where it was recorded: 'garmin', 'polar', 'upload', …
	startedAt: string
	durationS: Num
	distanceM: Num
	avgHeartRate: Num
	maxHeartRate: Num
	avgPower: Num
	normalizedPower: Num
	avgPace: Num // seconds per km
	climbM: Num
	load: Num
}

type Allowed = { allowed: boolean; why: string | null }
type SessionCan = {
	move: Allowed // to another day
	swap: Allowed // trade days with another session
	skip: Allowed
	shorten: Allowed // today's session only
	makeEasier: Allowed // today's session only
	markDone: Allowed // say "done" by hand
	undoDone: Allowed
	logStrength: Allowed
	rateFeeling: Allowed // how hard it felt (1–10) and a note
}
```

- Targets are in the athlete's own zones: `label` is how the session is written;
  `resolvedText` and the numbers are what it means for this athlete. When a
  threshold is missing the numbers are `null` and `why` says which one; show
  `label` and `why`, never a guessed number.
- `can` says which buttons to show, with `why` for a disabled one. It is a hint:
  the write itself has the last word and may still refuse.
- `strength.exercises[].sets` holds the prescribed sets and what was logged
  against each; a `prescribed.kg` that is `null` (a `% 1RM` with no 1RM known)
  shows `loadText` and `why`.

## `sessions` (read)

Jobs 6, 9, 10. Sessions between two days, oldest first, a page at a time.

Input:

```ts
{
	from: DayKey
	to: DayKey // at most 365 days after from: 366 days, both ends counted
	sport?: Sport
	cursor?: string // nextCursor from the previous page
	limit?: number // 1–100, default 50
	demo?: boolean
}
```

Output `SessionsOutput`:
`{ source; from; to; sessions: SessionCard[]; nextCursor: string | null }`. A
range over 366 days, or a cursor this read did not hand out, is `invalid-input`.

## `progress` (read)

Jobs 9 and 10. Form over time, each week against the plan, and the road to the
goal.

Input: `{ weeks?: number /* 1–26, default 12 */; demo?: boolean }`. Output
`ProgressOutput`:

```ts
type ProgressOutput = {
	source: 'athlete' | 'demo'
	weeks: number
	current: Form
	formTrust: FormTrust
	days: { date: DayKey; load: Num; fitness: Num; fatigue: Num; form: Num }[]
	weekly: {
		weekKey: DayKey
		plannedLoad: Num
		actualLoad: Num
		verdict: Verdict
		sports: SportVolume[] // target / planned / actual per sport in the plan
		recorded: {
			sport: Sport
			sportName: string
			sessions: number
			durationS: Num
			distanceM: Num
		}[] // what the watch recorded, per sport
	}[]
	trend: { direction: 'under' | 'over'; weeks: number } | null // two weeks or more in a row
	goal: {
		goal: Goal
		weeksToGo: number | null
		planWeek: number | null
		planWeeks: number | null
		phase: string | null
		fitnessToday: Num
		projectedFitnessOnGoalDay: Num
	} | null
}
```

- `days` runs from the Monday `weeks` weeks back through today. Days before the
  athlete's history begins are `null` with a `why`, so a curve starts where the
  data does. `form` is `null` inside the first 42 days of history.
- `recorded` counts what was recorded, plan or no plan.

## `proposals` (read)

Job 8. What the plan wants to change after the last week closed, and what it
changed by itself.

Input: `{ demo?: boolean }`. Output `ProposalsOutput`:

```ts
type ProposalsOutput = {
	source: 'athlete' | 'demo'
	adjustMode: 'autopilot' | 'ask-first'
	waiting: number // how many wait for a yes or no
	closedWeek: DayKey | null // the week that was read
	forWeek: DayKey | null // the week the proposals change
	summary: string | null // the closed week in a sentence
	proposals: ProposalItem[]
	changesMade: {
		heading: string
		weekKey: DayKey
		changes: {
			proposalId: string
			kind: 'changed' | 'kept' | 'left-alone' | 'let-go' | 'held'
			text: string
			about: string | null
			undo: 'offered' | 'undone' | 'closed' | null
		}[]
		undoable: number
	} | null // what the plan changed by itself (autopilot)
	easedWeek: {
		weekKey: DayKey
		sports: { sport: Sport; unit: VolumeUnit; before: Num; after: Num }[]
	} | null // the athlete made the coming week easier
}

type ProposalItem = {
	id: string
	kind: 'keep' | 'move' | 'swap' | 'add' | 'scale' | 'add-phase'
	headline: string // 'Flytt «Terskel» fra tirsdag til torsdag'
	reason: string // why, in plain Norwegian
	addsLoad: boolean // puts more training on the athlete
	touchesOwnSession: boolean // aimed at one of the athlete's own sessions
	state: 'waiting' | 'accepted' | 'declined' | 'applied-silently' | 'too-late'
	stateLabel: string | null
	weekKey: DayKey
	session: {
		id: string
		date: DayKey
		sport: Sport | null
		title: string | null
		whose: 'athlete' | 'plan'
	} | null
	otherSession:
		| {
				/* the same */
		  }
		| null // a swap's other session
	asksScope: boolean // a move asks "just this time" or "from now on" with the yes
	block: {
		factor: number
		min: number
		max: number
		step: number
		peak: { value: number; unit: VolumeUnit } | null
	} | null
	change: /* the concrete change as data, by kind */ object
}
```

- Only `waiting` proposals can be answered. `too-late` ones are past the day
  they were about. Answering is a write capability.
- With `adjustMode: 'autopilot'` the week's proposals are applied at the close
  and listed in `changesMade`; each `changed` line with `undo: 'offered'` can be
  undone.

## `zones` (read)

Jobs 5 and 11. Thresholds and zones per endurance sport.

Input: `{}`. Output `ZonesOutput`:

```ts
type ZonesOutput = {
	source: 'athlete'
	sports: {
		sport: 'run' | 'bike' | 'swim'
		sportName: string
		thresholds: {
			maxHeartRate: Num
			thresholdHeartRate: Num
			ftp: Num // bike, watts
			runPower: Num // run, watts
			thresholdPace: Num // run, seconds per km
			css: Num // swim, seconds per 100 m
		}
		model: {
			id: string
			name: string
			chosenBy: 'default' | 'athlete' | null
			basedOn: string
		} | null
		models: { id: string; name: string }[] // the others to choose from
		zones: {
			label: string // 'Z2', 'E', 'I-3'
			description: string | null // Norwegian: 'rolig/utholdenhet', 'terskel'
			step: number | null // on the common 1–5 scale
			heartRate: { min: number | null; max: number | null } | null
			power: { min: number | null; max: number | null } | null
			pace: {
				min: number | null
				max: number | null
				unit: 'km' | '100m'
			} | null
			why: string | null // why the zone has no numbers
		}[]
		modelWhy: string | null // why there is no model
	}[]
	history: {
		sport: string
		kind: string
		value: number
		at: string
		how: string | null
	}[]
	results: {
		id: string
		sport: string
		distanceM: number
		timeS: number
		date: DayKey
		kind: string
		verified: boolean
	}[]
}
```

A threshold that applies to another sport is `null` with `why` "Gjelder …"; one
never set is `null` with "Ikke satt.". A zone whose threshold is missing has
`null` ranges and a `why`.

## `exercises` (read)

Job 6 (strength) and 8 (swapping in an exercise). The library: the shared corpus
and the athlete's own exercises, searched by every name an exercise answers to,
Norwegian included (`knebøy` finds Back Squat).

Input:
`{ query?: string; cursor?: string; limit?: number /* 1–200, default 50 */ }`.
Output `ExercisesOutput`:
`{ query; total; nextCursor: string | null; exercises: { id; name; alias: string | null; ownExercise; primaryMuscle; equipment: string | null; timesLogged }[] }`.
An empty query lists everything by name.

## `exercise` (read)

Jobs 6 and 10. One exercise with the athlete's history on it.

Input: `{ exerciseId: string }`. Fails `not-found` ("Fant ikke øvelsen.").
Output `ExerciseOutput`:

```ts
type ExerciseOutput = {
	id: string
	name: string
	primaryMuscle: string
	equipment: string | null
	oneSideAtATime: boolean | null
	ownExercise: boolean
	anchors: { kind: string; kg: number; reps: number | null; at: string }[] // stated or estimated maxima
	history: {
		sessionId: string
		date: DayKey
		workingSets: number
		topSetKg: Num
		topSetText: string
	}[] // newest first
	lastTime: { sessionId: string; date: DayKey; topSetText: string } | null
	records: { label: string; text: string; date: DayKey | null }[]
	estimatedOneRepMax: Num
}
```

## `recordings` (read)

Jobs 2 and 6. What the watch services and uploads brought in, newest first.

Input:
`{ cursor?: string /* ISO instant from nextCursor */; limit?: number /* 1–100, default 30 */ }`.
Output `RecordingsOutput`:
`{ source; recordings: RecordingItem[]; nextCursor: string | null; importing: boolean; sources: DataSourceLink[] }`,
where `RecordingItem` is a `RecordingSummary` plus `date`, `sport`, `sportName`,
`sessionId` (the session it landed on), `linkedToPlan` (it landed on a planned
session rather than one of its own) and `alsoFrom` (the same activity also came
from these places, kept once). `importing` is `true` while a just-connected
service is still bringing in history.

## Errors

| code            | when                                               | message (examples)                    |
| --------------- | -------------------------------------------------- | ------------------------------------- |
| `invalid-input` | the input does not match the read's type           | Noe i det du sendte stemmer ikke.     |
| `not-found`     | `session` / `exercise`: gone, or not the athlete's | Fant ikke økta. Den kan være slettet. |
| `unknown`       | over HTTP: no read by that name                    | Ukjent handling.                      |
| `network`       | in the browser: the server could not be reached    | Fikk ikke kontakt. Prøv igjen.        |
