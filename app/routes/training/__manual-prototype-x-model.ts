/**
 * PROTOTYPE — throwaway. Shared in-memory model for the four manual-planning
 * design variants on `/training/plan/manual-prototype-x` (#366). Nothing here
 * persists, nothing here is production code, and none of it is wired to a
 * mutation. Delete with the route.
 *
 * Vocabulary is the app's own (ADR 0039): Training Plan → Plan Outline phase →
 * Training Week. Never macro/meso/microcycle.
 */

// ---------------------------------------------------------------------------
// Conversions
// ---------------------------------------------------------------------------

/** Fitness Projection's documented planning assumption (CONTEXT.md). */
export const TSS_PER_ENDURANCE_HOUR = 60
/** Prototype easy-running pace used for km ↔ hours. Plausible, not authored. */
export const KM_PER_HOUR = 10

export type Currency = 'km' | 'hours' | 'tss'

export const CURRENCIES: Currency[] = ['km', 'hours', 'tss']

export const CURRENCY_LABEL: Record<Currency, string> = {
	km: 'Kilometres',
	hours: 'Hours',
	tss: 'TSS',
}

export const CURRENCY_UNIT: Record<Currency, string> = {
	km: 'km',
	hours: 'h',
	tss: 'TSS',
}

/** All currencies derive from hours — the one stored number per Training Week. */
export function fromHours(hours: number, currency: Currency): number {
	if (currency === 'hours') return Math.round(hours * 10) / 10
	if (currency === 'km') return Math.round(hours * KM_PER_HOUR)
	return Math.round(hours * TSS_PER_ENDURANCE_HOUR)
}

export function toHours(value: number, currency: Currency): number {
	if (currency === 'hours') return value
	if (currency === 'km') return value / KM_PER_HOUR
	return value / TSS_PER_ENDURANCE_HOUR
}

/**
 * Formats a week's target in one currency, honestly: a block whose focus
 * carries no endurance load (strength) has no km and no TSS — only clock time.
 */
export function formatTarget(
	hours: number,
	currency: Currency,
	countsTowardLoad: boolean,
): string {
	if (!countsTowardLoad && currency !== 'hours') return '—'
	if (currency === 'hours') return `${fromHours(hours, 'hours')} h`
	return `${fromHours(hours, currency)} ${CURRENCY_UNIT[currency]}`
}

// ---------------------------------------------------------------------------
// Block focus — beyond base/build/peak
// ---------------------------------------------------------------------------

export type Focus =
	| 'endurance'
	| 'threshold'
	| 'vo2max'
	| 'strength'
	| 'speed'
	| 'recovery'

export type FocusMeta = {
	label: string
	/** Strength work carries no TSS — it must never inflate a load target. */
	countsTowardLoad: boolean
	/** Tailwind text/bg tokens, kept plain so each variant can restyle freely. */
	hue: string
	tint: string
	ring: string
	note: string
}

export const FOCUS: Record<Focus, FocusMeta> = {
	endurance: {
		label: 'Endurance',
		countsTowardLoad: true,
		hue: 'var(--zone-2)',
		tint: 'color-mix(in oklab, var(--zone-2) 18%, transparent)',
		ring: 'color-mix(in oklab, var(--zone-2) 45%, transparent)',
		note: 'Aerobic base and durability',
	},
	threshold: {
		label: 'Threshold',
		countsTowardLoad: true,
		hue: 'var(--zone-4)',
		tint: 'color-mix(in oklab, var(--zone-4) 18%, transparent)',
		ring: 'color-mix(in oklab, var(--zone-4) 45%, transparent)',
		note: 'Sustained effort at race-adjacent intensity',
	},
	vo2max: {
		label: 'VO2max',
		countsTowardLoad: true,
		hue: 'var(--zone-5)',
		tint: 'color-mix(in oklab, var(--zone-5) 18%, transparent)',
		ring: 'color-mix(in oklab, var(--zone-5) 45%, transparent)',
		note: 'Short, sharp work above threshold',
	},
	speed: {
		label: 'Speed',
		countsTowardLoad: true,
		hue: 'var(--zone-3)',
		tint: 'color-mix(in oklab, var(--zone-3) 18%, transparent)',
		ring: 'color-mix(in oklab, var(--zone-3) 45%, transparent)',
		note: 'Neuromuscular sharpening',
	},
	strength: {
		label: 'Strength',
		countsTowardLoad: false,
		hue: 'var(--muted-foreground)',
		tint: 'color-mix(in oklab, var(--muted-foreground) 14%, transparent)',
		ring: 'color-mix(in oklab, var(--muted-foreground) 40%, transparent)',
		note: 'No TSS — doesn’t count toward load targets',
	},
	recovery: {
		label: 'Recovery',
		countsTowardLoad: true,
		hue: 'var(--zone-1)',
		tint: 'color-mix(in oklab, var(--zone-1) 18%, transparent)',
		ring: 'color-mix(in oklab, var(--zone-1) 45%, transparent)',
		note: 'Short, easy, low-frequency',
	},
}

export const FOCUS_KEYS = Object.keys(FOCUS) as Focus[]

// ---------------------------------------------------------------------------
// Rhythm — per block, never global
// ---------------------------------------------------------------------------

export type Rhythm = '3:1' | '2:1' | 'none'

export const RHYTHMS: Rhythm[] = ['3:1', '2:1', 'none']

export const RHYTHM_LABEL: Record<Rhythm, string> = {
	'3:1': '3 load : 1 recovery',
	'2:1': '2 load : 1 recovery',
	none: 'Straight through',
}

/** Cycle length in weeks; `none` never inserts a recovery Training Week. */
export function rhythmCycle(rhythm: Rhythm): number {
	if (rhythm === '3:1') return 4
	if (rhythm === '2:1') return 3
	return 0
}

/** intervals.icu's default recovery cut, cited in the #363 research note. */
export const RECOVERY_CUT = 0.3
/** Week-to-week progression within a block's loading weeks. */
export const PROGRESSION = 0.05

// ---------------------------------------------------------------------------
// Plan shape
// ---------------------------------------------------------------------------

export type Phase = {
	id: string
	name: string
	focus: Focus
	weeks: number
	rhythm: Rhythm
	/** The block's opening loading-week volume, in hours. */
	baseHours: number
	/** Where this block came from — apply-then-own means no live link back. */
	origin: string | null
}

export type AnchorKind = 'event' | 'goal' | 'ongoing'

export type Anchor = {
	kind: AnchorKind
	name: string
	/** ISO date; absent for `ongoing` until a race is attached. */
	date: string | null
}

export type Plan = {
	anchor: Anchor
	currency: Currency
	/** Additional currencies the athlete also wants targets read in. */
	alsoTrack: Currency[]
	phases: Phase[]
	/** Event-anchored only: a volume-only taper (intensity is held). */
	taperWeeks: number
	/** Ongoing only: how many cycles to draw before the "and on" marker. */
	cyclesShown: number
	/** Per-Training-Week overrides, keyed `${phaseId}#${weekInPhase}`. */
	overrides: Record<string, number>
}

let seq = 0
export function phaseId(prefix = 'p') {
	seq += 1
	return `${prefix}${seq}`
}

// ---------------------------------------------------------------------------
// Templates — both levels, both apply-then-own
// ---------------------------------------------------------------------------

export type BlockTemplate = {
	key: string
	name: string
	blurb: string
	weeks: number
	focus: Focus
	rhythm: Rhythm
	baseHours: number
}

export const BLOCK_TEMPLATES: BlockTemplate[] = [
	{
		key: 'vo2-3',
		name: 'VO2max block',
		blurb: '3 wk · 2:1 · short sharp intervals',
		weeks: 3,
		focus: 'vo2max',
		rhythm: '2:1',
		baseHours: 6.5,
	},
	{
		key: 'thr-4',
		name: 'Threshold block',
		blurb: '4 wk · 3:1 · tempo and cruise intervals',
		weeks: 4,
		focus: 'threshold',
		rhythm: '3:1',
		baseHours: 7.5,
	},
	{
		key: 'end-5',
		name: 'Endurance block',
		blurb: '5 wk · 3:1 · long steady volume',
		weeks: 5,
		focus: 'endurance',
		rhythm: '3:1',
		baseHours: 8,
	},
	{
		key: 'str-4',
		name: 'Strength block',
		blurb: '4 wk · straight through · no TSS',
		weeks: 4,
		focus: 'strength',
		rhythm: 'none',
		baseHours: 3,
	},
	{
		key: 'spd-2',
		name: 'Speed block',
		blurb: '2 wk · straight through · strides and hills',
		weeks: 2,
		focus: 'speed',
		rhythm: 'none',
		baseHours: 5.5,
	},
	{
		key: 'rec-1',
		name: 'Transition week',
		blurb: '1 wk · easy reset between blocks',
		weeks: 1,
		focus: 'recovery',
		rhythm: 'none',
		baseHours: 3,
	},
]

export type SeasonTemplate = {
	key: string
	name: string
	blurb: string
	anchorKind: AnchorKind
	taperWeeks: number
	blocks: Array<{
		name: string
		focus: Focus
		weeks: number
		rhythm: Rhythm
		baseHours: number
	}>
}

export const SEASON_TEMPLATES: SeasonTemplate[] = [
	{
		key: 'classic',
		name: 'Classic build 3:1',
		blurb: 'Base → Build → Peak, every block on a 3:1 rhythm, volume taper.',
		anchorKind: 'event',
		taperWeeks: 2,
		blocks: [
			{
				name: 'Base',
				focus: 'endurance',
				weeks: 4,
				rhythm: '3:1',
				baseHours: 6.5,
			},
			{
				name: 'Build',
				focus: 'threshold',
				weeks: 4,
				rhythm: '3:1',
				baseHours: 7.5,
			},
			{ name: 'Peak', focus: 'vo2max', weeks: 3, rhythm: '2:1', baseHours: 7 },
		],
	},
	{
		key: 'big-base',
		name: 'Big base',
		blurb: 'A long aerobic runway, sharpening left late and kept short.',
		anchorKind: 'event',
		taperWeeks: 2,
		blocks: [
			{
				name: 'Base 1',
				focus: 'endurance',
				weeks: 5,
				rhythm: '3:1',
				baseHours: 6,
			},
			{
				name: 'Base 2',
				focus: 'endurance',
				weeks: 4,
				rhythm: '3:1',
				baseHours: 7.5,
			},
			{
				name: 'Sharpen',
				focus: 'threshold',
				weeks: 2,
				rhythm: 'none',
				baseHours: 7,
			},
		],
	},
	{
		key: 'hybrid',
		name: 'Strength hybrid',
		blurb: 'Alternates a lifting block with endurance — honest about TSS.',
		anchorKind: 'event',
		taperWeeks: 1,
		blocks: [
			{
				name: 'Lift',
				focus: 'strength',
				weeks: 4,
				rhythm: 'none',
				baseHours: 3,
			},
			{
				name: 'Base',
				focus: 'endurance',
				weeks: 4,
				rhythm: '3:1',
				baseHours: 7,
			},
			{
				name: 'Build',
				focus: 'threshold',
				weeks: 3,
				rhythm: '2:1',
				baseHours: 7.5,
			},
		],
	},
	{
		key: 'loop',
		name: 'Rolling 3-block loop',
		blurb: 'Endurance → Threshold → VO2max, repeating. No finish line.',
		anchorKind: 'ongoing',
		taperWeeks: 0,
		blocks: [
			{
				name: 'Endurance',
				focus: 'endurance',
				weeks: 4,
				rhythm: '3:1',
				baseHours: 7,
			},
			{
				name: 'Threshold',
				focus: 'threshold',
				weeks: 3,
				rhythm: '2:1',
				baseHours: 7.5,
			},
			{
				name: 'VO2max',
				focus: 'vo2max',
				weeks: 2,
				rhythm: 'none',
				baseHours: 6.5,
			},
		],
	},
]

export function blockFromTemplate(t: BlockTemplate): Phase {
	return {
		id: phaseId(),
		name: t.name.replace(/ block$/, ''),
		focus: t.focus,
		weeks: t.weeks,
		rhythm: t.rhythm,
		baseHours: t.baseHours,
		origin: t.name,
	}
}

export function planFromSeasonTemplate(t: SeasonTemplate, anchor: Anchor): Plan {
	return {
		anchor:
			t.anchorKind === 'ongoing'
				? { kind: 'ongoing', name: 'Ongoing training', date: null }
				: anchor,
		currency: 'km',
		alsoTrack: ['tss'],
		phases: t.blocks.map((b) => ({
			id: phaseId(),
			name: b.name,
			focus: b.focus,
			weeks: b.weeks,
			rhythm: b.rhythm,
			baseHours: b.baseHours,
			origin: t.name,
		})),
		taperWeeks: t.anchorKind === 'ongoing' ? 0 : t.taperWeeks,
		cyclesShown: 2,
		overrides: {},
	}
}

// ---------------------------------------------------------------------------
// Derivation: phases + rhythm → Training Weeks
// ---------------------------------------------------------------------------

export type WeekRole = 'load' | 'recovery' | 'taper' | 'race'

export type PlannedWeek = {
	/** Absolute index across everything drawn, including repeats. */
	index: number
	phaseId: string
	phaseName: string
	focus: Focus
	rhythm: Rhythm
	role: WeekRole
	/** 1-based position inside this block. */
	weekInPhase: number
	phaseWeeks: number
	/** "Load 2 of 3" — the rhythm made legible. */
	loadNumber: number | null
	loadTotal: number | null
	hours: number
	overridden: boolean
	countsTowardLoad: boolean
	/** Which repeat of an ongoing cycle this week belongs to (1-based). */
	cycle: number
	/** Monday of the Training Week, ISO date, when the plan has a calendar. */
	startDate: string | null
	isPast: boolean
	isCurrent: boolean
}

function overrideKey(id: string, weekInPhase: number) {
	return `${id}#${weekInPhase}`
}

function isRecoveryWeek(rhythm: Rhythm, weekInPhase: number, weeks: number) {
	const cycle = rhythmCycle(rhythm)
	if (cycle === 0) return false
	// The last week of a block is a recovery week when the rhythm lands there,
	// which is what makes a 4-week 3:1 block read as "3 up, 1 down".
	if (weekInPhase === weeks && weeks % cycle === 0) return true
	return weekInPhase % cycle === 0
}

/** Expands a block into its Training Weeks with rhythm and progression applied. */
export function expandPhase(
	phase: Phase,
	overrides: Record<string, number>,
): Array<Omit<PlannedWeek, 'index' | 'cycle' | 'startDate' | 'isPast' | 'isCurrent'>> {
	const out: Array<
		Omit<PlannedWeek, 'index' | 'cycle' | 'startDate' | 'isPast' | 'isCurrent'>
	> = []
	const cycle = rhythmCycle(phase.rhythm)
	const loadTotal =
		cycle === 0 ? phase.weeks : Math.max(1, cycle - 1)
	let loadsSoFar = 0
	let lastLoadHours = phase.baseHours
	for (let w = 1; w <= phase.weeks; w++) {
		const recovery = isRecoveryWeek(phase.rhythm, w, phase.weeks)
		let hours: number
		let loadNumber: number | null = null
		if (recovery) {
			hours = lastLoadHours * (1 - RECOVERY_CUT)
		} else {
			hours = phase.baseHours * (1 + PROGRESSION * loadsSoFar)
			lastLoadHours = hours
			loadsSoFar += 1
			loadNumber = cycle === 0 ? loadsSoFar : ((loadsSoFar - 1) % loadTotal) + 1
		}
		const key = overrideKey(phase.id, w)
		const overridden = key in overrides
		out.push({
			phaseId: phase.id,
			phaseName: phase.name,
			focus: phase.focus,
			rhythm: phase.rhythm,
			role: recovery ? 'recovery' : 'load',
			weekInPhase: w,
			phaseWeeks: phase.weeks,
			loadNumber,
			loadTotal: recovery ? null : loadTotal,
			hours: overridden ? (overrides[key] as number) : Math.round(hours * 10) / 10,
			overridden,
			countsTowardLoad: FOCUS[phase.focus].countsTowardLoad,
		})
	}
	return out
}

/** The volume-only taper: intensity is held, volume falls (Mujika/Bosquet). */
export function taperWeeks(plan: Plan, lastLoadHours: number): PlannedWeek[] {
	if (plan.anchor.kind === 'ongoing' || plan.taperWeeks < 1) return []
	const cuts = plan.taperWeeks === 1 ? [0.55] : [0.7, 0.45]
	return cuts.slice(0, plan.taperWeeks).map((factor, i) => ({
		index: 0,
		phaseId: 'taper',
		phaseName: 'Taper',
		focus: 'recovery' as Focus,
		rhythm: 'none' as Rhythm,
		role: 'taper' as WeekRole,
		weekInPhase: i + 1,
		phaseWeeks: plan.taperWeeks,
		loadNumber: null,
		loadTotal: null,
		hours: Math.round(lastLoadHours * factor * 10) / 10,
		overridden: false,
		countsTowardLoad: true,
		cycle: 1,
		startDate: null,
		isPast: false,
		isCurrent: false,
	}))
}

function mondayOf(date: Date): Date {
	const d = new Date(date)
	const day = (d.getUTCDay() + 6) % 7
	d.setUTCDate(d.getUTCDate() - day)
	d.setUTCHours(0, 0, 0, 0)
	return d
}

function addWeeks(date: Date, n: number): Date {
	const d = new Date(date)
	d.setUTCDate(d.getUTCDate() + n * 7)
	return d
}

export type DerivedPlan = {
	weeks: PlannedWeek[]
	/** Weeks in one cycle of an ongoing plan (before repeats). */
	cycleWeeks: number
	totalWeeks: number
	startDate: string | null
	/** Sum in hours of everything that carries endurance load. */
	loadHours: number
	/** Hours of blocks that carry no TSS. */
	unloadedHours: number
	currentIndex: number | null
}

/** The single derivation every variant reads. Pure; recomputed on each edit. */
export function derivePlan(plan: Plan, today: Date): DerivedPlan {
	const oneCycle: PlannedWeek[] = []
	for (const phase of plan.phases) {
		for (const w of expandPhase(phase, plan.overrides)) {
			oneCycle.push({
				...w,
				index: 0,
				cycle: 1,
				startDate: null,
				isPast: false,
				isCurrent: false,
			})
		}
	}
	const cycleWeeks = oneCycle.length

	let weeks: PlannedWeek[] = []
	if (plan.anchor.kind === 'ongoing') {
		for (let c = 1; c <= Math.max(1, plan.cyclesShown); c++) {
			weeks.push(...oneCycle.map((w) => ({ ...w, cycle: c })))
		}
	} else {
		weeks = [...oneCycle]
		const lastLoad = [...oneCycle].reverse().find((w) => w.role === 'load')
		weeks.push(...taperWeeks(plan, lastLoad?.hours ?? 6))
	}
	weeks = weeks.map((w, i) => ({ ...w, index: i }))

	// Event-anchored plans are laid out backward from the Target Event; an
	// ongoing plan starts from this Training Week and simply keeps going.
	let start: Date | null = null
	if (plan.anchor.kind !== 'ongoing' && plan.anchor.date) {
		start = addWeeks(mondayOf(new Date(plan.anchor.date)), -(weeks.length - 1))
	} else {
		start = mondayOf(today)
	}
	const thisMonday = mondayOf(today).getTime()
	weeks = weeks.map((w) => {
		const d = addWeeks(start as Date, w.index)
		const iso = d.toISOString().slice(0, 10)
		return {
			...w,
			startDate: iso,
			isPast: d.getTime() < thisMonday,
			isCurrent: d.getTime() === thisMonday,
		}
	})

	const loadHours = weeks
		.filter((w) => w.countsTowardLoad)
		.reduce((a, w) => a + w.hours, 0)
	const unloadedHours = weeks
		.filter((w) => !w.countsTowardLoad)
		.reduce((a, w) => a + w.hours, 0)
	const currentIdx = weeks.findIndex((w) => w.isCurrent)

	return {
		weeks,
		cycleWeeks,
		totalWeeks: weeks.length,
		startDate: start ? start.toISOString().slice(0, 10) : null,
		loadHours: Math.round(loadHours * 10) / 10,
		unloadedHours: Math.round(unloadedHours * 10) / 10,
		currentIndex: currentIdx === -1 ? null : currentIdx,
	}
}

/**
 * Fitness Projection, prototype-grade: replay weekly hours as flat daily TSS
 * through the 42-day CTL EWMA, exactly as CONTEXT.md describes. Strength weeks
 * contribute nothing — that is the whole point of req 3.
 */
export function projectCtl(weeks: PlannedWeek[], startCtl: number): number[] {
	const k = 2 / (42 + 1)
	let ctl = startCtl
	return weeks.map((w) => {
		const weeklyTss = w.countsTowardLoad ? w.hours * TSS_PER_ENDURANCE_HOUR : 0
		const daily = weeklyTss / 7
		for (let d = 0; d < 7; d++) ctl = ctl + k * (daily - ctl)
		return Math.round(ctl * 10) / 10
	})
}

/** Week-over-week volume ramp, the guard TrainingPeaks warns on. */
export function rampPercent(weeks: PlannedWeek[], i: number): number | null {
	if (i === 0) return null
	const prev = weeks[i - 1]
	const cur = weeks[i]
	if (!prev || !cur || prev.hours === 0) return null
	return Math.round(((cur.hours - prev.hours) / prev.hours) * 1000) / 10
}

export function formatShortDate(iso: string | null): string {
	if (!iso) return '—'
	const d = new Date(`${iso}T00:00:00Z`)
	return `${d.getUTCDate()} ${d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })}`
}

export function weeksUntil(iso: string | null, today: Date): number | null {
	if (!iso) return null
	const target = mondayOf(new Date(`${iso}T00:00:00Z`)).getTime()
	const now = mondayOf(today).getTime()
	return Math.round((target - now) / (7 * 24 * 3600 * 1000))
}
