// PROTOTYPE — clean-room exploration for issue #366 (manual planning surface).
// Shared in-memory plan model for the /training/plan/manual-prototype-x
// variants. Nothing here persists; delete with the prototype route.

export type PhaseKind = 'base' | 'build' | 'peak' | 'taper'

export type ProtoPhase = {
	id: string
	kind: PhaseKind
	name: string
	weeks: number
	weeklyLoadHours: number
	focus: string
}

/** Loading/recovery rhythm — V1 ships 3:1 and 2:1 (docs #363). */
export type Rhythm = '3:1' | '2:1'

export type ProtoWeek = {
	/** 0-based from plan start; last week ends at the Target Event. */
	index: number
	phaseIndex: number
	phaseKind: PhaseKind
	phaseName: string
	weekInPhase: number
	isRecovery: boolean
	isTaper: boolean
	/** Resolved weekly load target after rhythm / taper / override. */
	hours: number
	/** ≈60 TSS per endurance hour — the documented planning assumption. */
	tss: number
	overridden: boolean
}

export const PHASE_COLORS: Record<
	PhaseKind,
	{ bg: string; solid: string; text: string; ring: string }
> = {
	base: {
		bg: 'bg-sky-500/15',
		solid: 'bg-sky-500',
		text: 'text-sky-600 dark:text-sky-400',
		ring: 'ring-sky-500',
	},
	build: {
		bg: 'bg-amber-500/15',
		solid: 'bg-amber-500',
		text: 'text-amber-600 dark:text-amber-400',
		ring: 'ring-amber-500',
	},
	peak: {
		bg: 'bg-rose-500/15',
		solid: 'bg-rose-500',
		text: 'text-rose-600 dark:text-rose-400',
		ring: 'ring-rose-500',
	},
	taper: {
		bg: 'bg-violet-500/15',
		solid: 'bg-violet-500',
		text: 'text-violet-600 dark:text-violet-400',
		ring: 'ring-violet-500',
	},
}

const RECOVERY_CUT = 0.7 // recovery week = 70% of the phase target (−30%)
export const TSS_PER_HOUR = 60

export function guessPhaseKind(name: string): PhaseKind {
	const n = name.toLowerCase()
	if (n.includes('taper')) return 'taper'
	if (n.includes('peak')) return 'peak'
	if (n.includes('build')) return 'build'
	return 'base'
}

let idCounter = 0
export function protoId() {
	return `proto-${++idCounter}`
}

/**
 * Expand phases into concrete Training Weeks, applying the loading/recovery
 * rhythm inside every non-taper phase and a progressive volume-only cut
 * through the taper (intensity is held — the taper never touches targets).
 */
export function deriveWeeks(
	phases: ProtoPhase[],
	rhythm: Rhythm,
	overrides: Record<number, number> = {},
): ProtoWeek[] {
	const weeks: ProtoWeek[] = []
	const cycle = rhythm === '3:1' ? 4 : 3
	let index = 0
	for (let p = 0; p < phases.length; p++) {
		const phase = phases[p]!
		const isTaperPhase = phase.kind === 'taper'
		for (let w = 0; w < phase.weeks; w++) {
			const isRecovery =
				!isTaperPhase && phase.weeks >= cycle && (w + 1) % cycle === 0
			let hours = phase.weeklyLoadHours
			if (isRecovery) hours = hours * RECOVERY_CUT
			if (isTaperPhase) {
				// Progressive (non-linear-ish) volume cut toward race day.
				const t = (w + 1) / phase.weeks
				hours = phase.weeklyLoadHours * (1 - 0.45 * t)
			}
			const override = overrides[index]
			const resolved = override ?? hours
			weeks.push({
				index,
				phaseIndex: p,
				phaseKind: phase.kind,
				phaseName: phase.name,
				weekInPhase: w,
				isRecovery,
				isTaper: isTaperPhase,
				hours: Math.round(resolved * 10) / 10,
				tss: Math.round(resolved * TSS_PER_HOUR),
				overridden: override != null,
			})
			index++
		}
	}
	return weeks
}

/**
 * Toy Fitness Projection: replay the weekly targets through the 42-day CTL
 * EWMA. Display-only, same spirit as the real projection (#132).
 */
export function projectCtl(weeks: ProtoWeek[], startCtl = 42): number[] {
	const alpha = 1 / 42
	let ctl = startCtl
	const out: number[] = []
	for (const week of weeks) {
		const daily = week.tss / 7
		for (let d = 0; d < 7; d++) ctl = ctl + alpha * (daily - ctl)
		out.push(Math.round(ctl * 10) / 10)
	}
	return out
}

// ── Week patterns (stamped, producing standalone sessions) ────────────────

export type ProtoDiscipline = 'run' | 'bike' | 'swim' | 'strength'

export type PatternSession = {
	/** 0 = Monday … 6 = Sunday (Training Week is Mon–Sun). */
	day: number
	discipline: ProtoDiscipline
	title: string
	/** Share of the week's TSS this session carries; strength carries none. */
	share: number
}

export type WeekPattern = {
	id: string
	name: string
	sessions: PatternSession[]
}

export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export const DISCIPLINE_GLYPH: Record<ProtoDiscipline, string> = {
	run: '🏃',
	bike: '🚴',
	swim: '🏊',
	strength: '🏋️',
}

export const SEED_PATTERNS: WeekPattern[] = [
	{
		id: 'pat-classic',
		name: 'Classic run week',
		sessions: [
			{ day: 0, discipline: 'strength', title: 'Strength A', share: 0 },
			{ day: 1, discipline: 'run', title: 'Quality intervals', share: 0.3 },
			{ day: 3, discipline: 'run', title: 'Easy run', share: 0.2 },
			{ day: 5, discipline: 'run', title: 'Long run', share: 0.5 },
		],
	},
	{
		id: 'pat-double',
		name: 'Big weekend',
		sessions: [
			{ day: 1, discipline: 'run', title: 'Tempo run', share: 0.25 },
			{ day: 3, discipline: 'strength', title: 'Strength B', share: 0 },
			{ day: 4, discipline: 'run', title: 'Easy run', share: 0.15 },
			{ day: 5, discipline: 'run', title: 'Long run', share: 0.4 },
			{ day: 6, discipline: 'run', title: 'Recovery jog', share: 0.2 },
		],
	},
	{
		id: 'pat-cross',
		name: 'Cross-train week',
		sessions: [
			{ day: 1, discipline: 'run', title: 'Quality intervals', share: 0.35 },
			{ day: 2, discipline: 'swim', title: 'Swim easy', share: 0.15 },
			{ day: 4, discipline: 'bike', title: 'Endurance ride', share: 0.2 },
			{ day: 5, discipline: 'run', title: 'Long run', share: 0.3 },
		],
	},
]

/** What the route loader hands each variant (the real active plan, if any). */
export type ProtoPlanInput = {
	eventId: string
	eventName: string
	eventDate: string | Date
	phases: Array<{ name: string; weeks: number; weeklyLoadHours: number | null }>
} | null

export const FALLBACK_PLAN: NonNullable<ProtoPlanInput> = {
	eventId: 'proto-fallback',
	eventName: 'Fitness goal (10 weeks)',
	eventDate: new Date(Date.now() + 70 * 24 * 3600 * 1000),
	phases: [
		{ name: 'Base', weeks: 4, weeklyLoadHours: 7 },
		{ name: 'Build', weeks: 3, weeklyLoadHours: 8 },
		{ name: 'Peak', weeks: 2, weeklyLoadHours: 7 },
		{ name: 'Taper', weeks: 1, weeklyLoadHours: 4 },
	],
}

export function formatEventDate(d: string | Date): string {
	return new Date(d).toLocaleDateString('en-GB', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		timeZone: 'UTC',
	})
}

/** The seeded outline mapped into the prototype's editable shape. */
export function toProtoPhases(
	phases: Array<{
		name: string
		weeks: number
		weeklyLoadHours: number | null
	}>,
): ProtoPhase[] {
	return phases.map((p) => ({
		id: protoId(),
		kind: guessPhaseKind(p.name),
		name: p.name,
		weeks: p.weeks,
		weeklyLoadHours: p.weeklyLoadHours ?? 6,
		focus: '',
	}))
}
