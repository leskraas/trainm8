import {
	type DisciplineThresholdMap,
	parseAuthoredIntensity,
} from './intensity-target.ts'
import { stepDistanceDurationSec } from './shape-strip.ts'
import { blockRepeatTotal } from './workout-schema.ts'

export type Palette = {
	bg: string
	ring: string
	chip: string
	ink: string
}

const activityPalette: Record<string, Palette> = {
	run: {
		bg: 'from-orange-500/15 to-rose-500/10',
		ring: 'ring-orange-400/30',
		chip: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
		ink: 'text-orange-600 dark:text-orange-300',
	},
	bike: {
		bg: 'from-sky-500/15 to-indigo-500/10',
		ring: 'ring-sky-400/30',
		chip: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
		ink: 'text-sky-600 dark:text-sky-300',
	},
	swim: {
		bg: 'from-cyan-500/15 to-teal-500/10',
		ring: 'ring-cyan-400/30',
		chip: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
		ink: 'text-cyan-600 dark:text-cyan-300',
	},
	strength: {
		bg: 'from-violet-500/15 to-fuchsia-500/10',
		ring: 'ring-violet-400/30',
		chip: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
		ink: 'text-violet-600 dark:text-violet-300',
	},
}

const defaultPalette: Palette = {
	bg: 'from-zinc-500/10 to-zinc-500/5',
	ring: 'ring-zinc-300/40',
	chip: 'bg-zinc-500/15 text-zinc-700 dark:text-zinc-300',
	ink: 'text-zinc-600 dark:text-zinc-300',
}

export function paletteFor(discipline: string | null | undefined): Palette {
	if (!discipline) return defaultPalette
	return activityPalette[discipline] ?? defaultPalette
}

type Block = {
	repeatCount: number
	seriesRepeatCount?: number | null
	betweenSeriesRestSec?: number | null
	steps: ReadonlyArray<{
		/** `rest` and `strength` as stored; absent reads as cardio. */
		kind?: string
		discipline?: string | null
		/** Stored Intensity Target JSON, the pace a distance step is timed by. */
		intensity?: string | null
		durationSec: number | null
		distanceM?: number | null
	}>
}

type DurationStep = Block['steps'][number]

/**
 * What a duration reading times a distance step by, passed explicitly so every
 * surface that says how long a session takes times it the same way (#615).
 */
export type DurationReading = {
	/** The athlete's thresholds: a zone word's pace, else the threshold pace. */
	thresholds: DisciplineThresholdMap
	/** The Workout's Discipline, for a step that names none of its own. */
	discipline?: string | null
}

/** One pass of a step: its time, else its distance at its pace, else null. */
export function stepDurationSec(
	step: DurationStep,
	{ thresholds, discipline: workoutDiscipline }: DurationReading,
): number | null {
	if (step.durationSec != null) return step.durationSec
	if (step.kind === 'strength') return null
	const discipline = step.discipline ?? workoutDiscipline ?? null
	return stepDistanceDurationSec(
		{
			discipline,
			distanceM: step.distanceM,
			intensity: parseAuthoredIntensity(step.intensity),
		},
		discipline ? thresholds[discipline] : undefined,
	)
}

export type PrescribedDuration = {
	seconds: number
	/** Every step was timed. False when one was not and `seconds` falls short. */
	complete: boolean
	/**
	 * Some distance step was timed through a pace, so `seconds` is a
	 * translation and reads with `≈` (`approxLabel`), as a Lactate Anchor's
	 * zone does.
	 */
	estimated: boolean
}

/**
 * **How long a prescription takes**, the one reading every total shares
 * (#615). A distance step is timed through the pace its intensity resolves to,
 * else the discipline's threshold pace, as the Workout Shape strip does; a
 * step with no Discipline of its own is timed as the Workout's. A repeated
 * block's steps count once per rep of every series, and the rests between
 * series count once between each pair. An untimed strength step, and any step
 * with neither a time nor a pace to give it one, leaves the total incomplete.
 * Null when no step could be timed at all.
 */
export function prescribedDuration(
	blocks: readonly Block[],
	reading: DurationReading,
): PrescribedDuration | null {
	let seconds = 0
	let timed = 0
	let complete = true
	let estimated = false

	for (const block of blocks) {
		for (const step of block.steps) {
			const stepSec = stepDurationSec(step, reading)
			if (stepSec == null) {
				complete = false
				continue
			}
			timed++
			if (step.durationSec == null) estimated = true
			seconds += stepSec * blockRepeatTotal(block)
		}
		const series = Math.max(1, block.seriesRepeatCount ?? 1)
		seconds += (block.betweenSeriesRestSec ?? 0) * (series - 1)
	}

	return timed > 0 ? { seconds, complete, estimated } : null
}

export type PlannedMinutes = {
	minutes: number
	/** Timed through a pace somewhere: reads `≈ 57 min`. */
	estimated: boolean
}

/**
 * {@link prescribedDuration} in whole minutes, or null unless every step was
 * timed: a total that leaves a step out is not the session's, so it is not
 * shown as if it were (the Week Pattern's rule, `fixedDayVolume`).
 */
export function plannedMinutes(
	blocks: readonly Block[],
	reading: DurationReading,
): PlannedMinutes | null {
	const duration = prescribedDuration(blocks, reading)
	return duration?.complete
		? {
				minutes: Math.round(duration.seconds / 60),
				estimated: duration.estimated,
			}
		: null
}

/** {@link plannedMinutes}'s minutes alone, for a reader that states no `≈`. */
export function sumBlockDurationMin(
	blocks: readonly Block[],
	reading: DurationReading,
): number | null {
	return plannedMinutes(blocks, reading)?.minutes ?? null
}

type DistanceBlock = {
	repeatCount: number
	seriesRepeatCount?: number | null
	steps: Array<{ distanceM: number | null }>
}

/**
 * Total prescribed distance across a workout's blocks (metres), or `null` when
 * no step authors a distance — the honest counterpart to `sumBlockDurationMin`
 * for duration-only prescriptions (Unavailable Metric, never a fabricated 0).
 */
export function sumBlockDistanceM(blocks: DistanceBlock[]): number | null {
	let totalM = 0
	let hasDistance = false

	for (const block of blocks) {
		for (const step of block.steps) {
			if (step.distanceM != null) {
				hasDistance = true
				totalM += step.distanceM * blockRepeatTotal(block)
			}
		}
	}

	if (!hasDistance) return null
	return totalM
}

type SetBlock = {
	repeatCount: number
	seriesRepeatCount?: number | null
	steps: Array<{ sets: readonly unknown[] }>
}

/**
 * **The planned sets of a workout, read once for everyone** — the strength
 * track's Planned Volume, the quick strength log's offer and its write (#505
 * S16). `total` counts a repeated block's sets once per repeat, the same
 * reading `sumBlockDurationMin` gives duration; `repeated` says some block with
 * sets is repeated, which the set log cannot hold per repeat (one row per
 * `(session, step, set)`), so such a session is logged set by set in the
 * runner rather than from I dag.
 */
export function readPlannedSets(blocks: readonly SetBlock[]): {
	total: number
	repeated: boolean
} {
	let total = 0
	let repeated = false
	for (const block of blocks) {
		const repeats = blockRepeatTotal(block)
		for (const step of block.steps) {
			total += step.sets.length * repeats
			if (step.sets.length > 0 && repeats > 1) repeated = true
		}
	}
	return { total, repeated }
}

/**
 * Total prescribed sets across a workout's blocks (`readPlannedSets`). The
 * strength track's `sets` currency is total working sets per week (ADR 0047),
 * so this is a lifting session's Planned Volume.
 */
export function sumBlockSets(blocks: readonly SetBlock[]): number {
	return readPlannedSets(blocks).total
}

export function countdownLabel(
	scheduledAt: Date,
	now: Date = new Date(),
): string {
	const diffMs = scheduledAt.getTime() - now.getTime()
	const diffMin = Math.floor(diffMs / (1000 * 60))

	if (diffMin <= 0) return 'Now'
	if (diffMin < 60) return `In ${diffMin} min`

	const diffH = Math.floor(diffMin / 60)
	if (diffH < 24) return `In ${diffH}h`

	const diffD = Math.floor(diffH / 24)
	if (diffD === 1) return 'Tomorrow'
	if (diffD < 7) return `In ${diffD} days`

	const weeks = Math.floor(diffD / 7)
	return `In ${weeks}w`
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/** A Plan Outline phase, reduced to what the arc needs: a name and a span. */
export type PlanPhaseSpec = { name: string; weeks: number }

export type PlanArc = {
	/** Name of the phase the athlete is currently in (base/build/peak/taper). */
	phase: string
	/**
	 * Index of that phase in the Outline. Identity, not the name: two phases may
	 * legitimately share a name (a season with two A-races runs Base twice), and
	 * comparing names would light both of them up as current (ADR 0044 §2).
	 */
	phaseIndex: number
	/** Current week, 1-based, clamped to [1, totalWeeks]. */
	weekInPlan: number
	/** Total weeks across all phases (the M in "week N of M"). */
	totalWeeks: number
	/** Weeks-elapsed of total weeks, 0–100. Never a sessions-completed ratio. */
	progressPct: number
	/** Countdown to the Target Event date; null for an open-ended plan (ADR 0079). */
	countdown: string | null
}

/**
 * Arc of where the athlete is in an active plan (ADR 0018), derived purely from
 * the Plan Outline + its authored start + the Target Event date + now — no stored
 * plan entity.
 *
 * The plan runs forward from `planStart`, the **authored** first Training Week
 * (ADR 0044 §3). It used to be counted backward from the Target Event, which made
 * adding a phase move the plan's start into the past — weeks the athlete never
 * lived. Progress is deliberately **weeks-elapsed of total weeks**, never a
 * sessions-completed ratio: later phases are materialized on demand, so the total
 * session count isn't known and a ratio would be an Unavailable Metric (ADR 0008
 * principle). The countdown still runs to the Event, which may fall after the
 * plan's last week or before it.
 */
export function planArc(
	phases: PlanPhaseSpec[],
	planStart: Date,
	eventDate: Date | null,
	now: Date = new Date(),
): PlanArc {
	const totalWeeks = phases.reduce((sum, p) => sum + p.weeks, 0)
	const elapsedWeeks = Math.min(
		Math.max((now.getTime() - planStart.getTime()) / WEEK_MS, 0),
		totalWeeks,
	)
	const weekInPlan = Math.min(Math.floor(elapsedWeeks) + 1, totalWeeks)
	const progressPct =
		totalWeeks > 0 ? Math.round((elapsedWeeks / totalWeeks) * 100) : 0

	// The current phase is the one whose week span contains weekInPlan; default
	// to the last phase so an over-run (week past the end) lands on the taper.
	let cumulative = 0
	let phaseIndex = phases.length - 1
	for (const [index, p] of phases.entries()) {
		if (weekInPlan <= cumulative + p.weeks) {
			phaseIndex = index
			break
		}
		cumulative += p.weeks
	}

	return {
		phase: phases[phaseIndex]?.name ?? '',
		phaseIndex,
		weekInPlan,
		totalWeeks,
		progressPct,
		countdown: eventDate ? countdownLabel(eventDate, now) : null,
	}
}

/**
 * Time-of-day greeting, evaluated in the Athlete Timezone (#172) so server and
 * client render the same words regardless of the runtime's local clock.
 */
export function greetingFor(date: Date, timezone: string = 'UTC'): string {
	const hour = Number(
		new Intl.DateTimeFormat('en-GB', {
			timeZone: timezone,
			hour: 'numeric',
			hourCycle: 'h23',
		}).format(date),
	)
	if (hour < 12) return 'Good morning'
	if (hour < 17) return 'Good afternoon'
	if (hour < 21) return 'Good evening'
	return 'Up late'
}

export function isoDayKey(date: Date): string {
	const y = date.getFullYear()
	const m = String(date.getMonth() + 1).padStart(2, '0')
	const d = String(date.getDate()).padStart(2, '0')
	return `${y}-${m}-${d}`
}

export function buildWeekDays(today: Date, length = 7): Date[] {
	const days: Date[] = []
	for (let i = 0; i < length; i++) {
		const d = new Date(today)
		d.setDate(today.getDate() + i)
		d.setHours(0, 0, 0, 0)
		days.push(d)
	}
	return days
}
