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
	steps: Array<{ durationSec: number | null }>
}

export function sumBlockDurationMin(blocks: Block[]): number | null {
	let totalSec = 0
	let hasDuration = false

	for (const block of blocks) {
		for (const step of block.steps) {
			if (step.durationSec != null) {
				hasDuration = true
				totalSec += step.durationSec * block.repeatCount
			}
		}
	}

	if (!hasDuration) return null
	return Math.round(totalSec / 60)
}

type DistanceBlock = {
	repeatCount: number
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
				totalM += step.distanceM * block.repeatCount
			}
		}
	}

	if (!hasDistance) return null
	return totalM
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
	/** Current week, 1-based, clamped to [1, totalWeeks]. */
	weekInPlan: number
	/** Total weeks across all phases (the M in "week N of M"). */
	totalWeeks: number
	/** Weeks-elapsed of total weeks, 0–100. Never a sessions-completed ratio. */
	progressPct: number
	/** Countdown to the Target Event date. */
	countdown: string
}

/**
 * Arc of where the athlete is in an active plan (ADR 0018), derived purely from
 * the Plan Outline + the Target Event date + now — no stored plan entity.
 *
 * The plan ends on the Target Event date and spans `totalWeeks` backward from
 * it, so progress and the current phase fall out of the calendar regardless of
 * when the plan was generated. Progress is deliberately **weeks-elapsed of total
 * weeks**, never a sessions-completed ratio: later phases are materialized on
 * demand, so the total session count isn't known and a ratio would be an
 * Unavailable Metric (ADR 0008 principle).
 */
export function planArc(
	phases: PlanPhaseSpec[],
	eventDate: Date,
	now: Date = new Date(),
): PlanArc {
	const totalWeeks = phases.reduce((sum, p) => sum + p.weeks, 0)
	const planStart = new Date(eventDate.getTime() - totalWeeks * WEEK_MS)
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
	let phase = phases[phases.length - 1]?.name ?? ''
	for (const p of phases) {
		if (weekInPlan <= cumulative + p.weeks) {
			phase = p.name
			break
		}
		cumulative += p.weeks
	}

	return {
		phase,
		weekInPlan,
		totalWeeks,
		progressPct,
		countdown: countdownLabel(eventDate, now),
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
