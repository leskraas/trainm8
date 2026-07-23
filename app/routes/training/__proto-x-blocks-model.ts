// PROTOTYPE — shared meso-block model for builder variants F and G
// (issue #366 follow-up). A season is an ordered list of meso blocks, each
// with a training focus (endurance base, threshold, VO2max, strength, …),
// a duration, its own loading/recovery rhythm, and a volume level. A plan
// can anchor backward to a Target Event or run open-ended (no finish race)
// and repeat its cycle. In-memory only; delete with the prototype route.

export type BlockFocus =
	| 'endurance'
	| 'threshold'
	| 'vo2max'
	| 'strength'
	| 'race-prep'
	| 'taper'
	| 'recovery'

/** Per-block loading/recovery rhythm; '2:1' = 2 hard weeks, 1 easy week. */
export type BlockRhythm = '3:1' | '2:1' | 'none'

export type MesoBlock = {
	id: string
	focus: BlockFocus
	name: string
	weeks: number
	rhythm: BlockRhythm
	/** Weekly endurance volume on a loading week, in hours. */
	hours: number
}

export const FOCUS_META: Record<
	BlockFocus,
	{ label: string; hex: string; tssPerHour: number; note: string }
> = {
	// tssPerHour is a per-focus planning assumption: intensity-focused blocks
	// cost more per hour (higher IF), recovery costs less. Same spirit as the
	// documented ≈60 TSS/endurance-hour rule; numbers are prototype-grade.
	endurance: {
		label: 'Endurance base',
		hex: '#0ea5e9',
		tssPerHour: 55,
		note: 'High volume, low intensity — aerobic foundation.',
	},
	threshold: {
		label: 'Threshold',
		hex: '#f59e0b',
		tssPerHour: 62,
		note: 'Sustained efforts around FTP / threshold pace.',
	},
	vo2max: {
		label: 'VO2max',
		hex: '#ef4444',
		tssPerHour: 68,
		note: 'Short, very hard intervals — volume held down, intensity up.',
	},
	strength: {
		label: 'Strength block',
		hex: '#8b5cf6',
		tssPerHour: 50,
		note: 'Gym emphasis + endurance maintenance. Strength sessions carry no TSS — the weekly target covers only the endurance hours.',
	},
	'race-prep': {
		label: 'Race prep',
		hex: '#f43f5e',
		tssPerHour: 62,
		note: 'Race simulation and sharpening at goal intensity.',
	},
	taper: {
		label: 'Taper',
		hex: '#64748b',
		tssPerHour: 55,
		note: 'Volume-only cut toward the event — intensity is held.',
	},
	recovery: {
		label: 'Recovery',
		hex: '#10b981',
		tssPerHour: 45,
		note: 'Deliberate unloading — short, easy sessions only.',
	},
}

export const RHYTHM_LABEL: Record<BlockRhythm, string> = {
	'3:1': '3 hard : 1 easy',
	'2:1': '2 hard : 1 easy',
	none: 'no easy week',
}

const EASY_WEEK_CUT = 0.3 // easy week = −30% volume, like the recovery week
const TAPER_FLOOR = 0.5 // final taper week lands on 50% of its start volume

export type BlockWeek = {
	/** 0-based across the whole cycle. */
	index: number
	blockIndex: number
	focus: BlockFocus
	blockName: string
	weekInBlock: number
	isEasy: boolean
	hours: number
	tss: number
	overridden: boolean
}

let blockIdCounter = 0
export function blockId() {
	return `blk-${++blockIdCounter}`
}

export function deriveBlockWeeks(
	blocks: MesoBlock[],
	overrides: Record<number, number> = {},
): BlockWeek[] {
	const weeks: BlockWeek[] = []
	let index = 0
	for (let b = 0; b < blocks.length; b++) {
		const block = blocks[b]!
		const cycle =
			block.rhythm === '3:1' ? 4 : block.rhythm === '2:1' ? 3 : Infinity
		for (let w = 0; w < block.weeks; w++) {
			const isEasy =
				block.focus !== 'taper' &&
				block.focus !== 'recovery' &&
				block.weeks >= cycle &&
				(w + 1) % cycle === 0
			let hours = block.hours
			if (isEasy) hours = hours * (1 - EASY_WEEK_CUT)
			if (block.focus === 'taper') {
				const t = (w + 1) / block.weeks
				hours = block.hours * (1 - (1 - TAPER_FLOOR) * Math.pow(t, 0.7))
			}
			const override = overrides[index]
			const resolved = override ?? hours
			weeks.push({
				index,
				blockIndex: b,
				focus: block.focus,
				blockName: block.name,
				weekInBlock: w,
				isEasy,
				hours: Math.round(resolved * 10) / 10,
				tss: Math.round(resolved * FOCUS_META[block.focus].tssPerHour),
				overridden: override != null,
			})
			index++
		}
	}
	return weeks
}

/** CTL projection across one or more repeats of the cycle. */
export function projectBlockCtl(
	weeks: BlockWeek[],
	repeats: number,
	startCtl = 42,
): number[] {
	const alpha = 1 / 42
	let ctl = startCtl
	const out: number[] = []
	for (let r = 0; r < repeats; r++) {
		for (const w of weeks) {
			const daily = w.tss / 7
			for (let d = 0; d < 7; d++) ctl = ctl + alpha * (daily - ctl)
			out.push(Math.round(ctl * 10) / 10)
		}
	}
	return out
}

// ── Meso templates: common single-block shapes ─────────────────────────────

export type MesoTemplate = Omit<MesoBlock, 'id'>

export const MESO_TEMPLATES: MesoTemplate[] = [
	{ focus: 'endurance', name: 'Aerobic base', weeks: 4, rhythm: '3:1', hours: 7 },
	{ focus: 'threshold', name: 'Threshold block', weeks: 3, rhythm: '2:1', hours: 7 },
	{ focus: 'vo2max', name: 'VO2max block', weeks: 3, rhythm: '2:1', hours: 6 },
	{ focus: 'strength', name: 'Strength block', weeks: 4, rhythm: '3:1', hours: 4 },
	{ focus: 'race-prep', name: 'Race prep', weeks: 2, rhythm: 'none', hours: 7 },
	{ focus: 'taper', name: 'Taper', weeks: 2, rhythm: 'none', hours: 7 },
	{ focus: 'recovery', name: 'Recovery week', weeks: 1, rhythm: 'none', hours: 3 },
]

export function instantiate(t: MesoTemplate): MesoBlock {
	return { ...t, id: blockId() }
}

// ── Macro templates: common whole-season shapes ────────────────────────────

export type MacroTemplate = {
	id: string
	name: string
	description: string
	/** Anchored templates end at a Target Event; open-ended ones repeat. */
	anchored: boolean
	blocks: MesoTemplate[]
}

export const MACRO_TEMPLATES: MacroTemplate[] = [
	{
		id: 'macro-classic',
		name: 'Classic race build',
		description:
			'Friel-style linear build toward an A race: base, threshold, race prep, taper.',
		anchored: true,
		blocks: [
			{ focus: 'endurance', name: 'Base', weeks: 4, rhythm: '3:1', hours: 7 },
			{ focus: 'threshold', name: 'Build', weeks: 3, rhythm: '2:1', hours: 8 },
			{ focus: 'race-prep', name: 'Peak', weeks: 2, rhythm: 'none', hours: 7 },
			{ focus: 'taper', name: 'Taper', weeks: 1, rhythm: 'none', hours: 7 },
		],
	},
	{
		id: 'macro-block',
		name: 'Block periodization',
		description:
			'Issurin-style: concentrated VO2max block on top of base, then realization toward the race.',
		anchored: true,
		blocks: [
			{ focus: 'endurance', name: 'Accumulation', weeks: 4, rhythm: '3:1', hours: 8 },
			{ focus: 'vo2max', name: 'Transmutation', weeks: 3, rhythm: '2:1', hours: 6 },
			{ focus: 'race-prep', name: 'Realization', weeks: 2, rhythm: 'none', hours: 6 },
			{ focus: 'taper', name: 'Taper', weeks: 1, rhythm: 'none', hours: 6 },
		],
	},
	{
		id: 'macro-winter',
		name: 'Off-season strength winter',
		description:
			'No race on the calendar: a strength emphasis with endurance maintenance, then back to base. Repeats until you point it at an event.',
		anchored: false,
		blocks: [
			{ focus: 'strength', name: 'Strength I', weeks: 4, rhythm: '3:1', hours: 4 },
			{ focus: 'endurance', name: 'Base return', weeks: 4, rhythm: '3:1', hours: 6 },
			{ focus: 'recovery', name: 'Unload', weeks: 1, rhythm: 'none', hours: 3 },
		],
	},
	{
		id: 'macro-loop',
		name: 'Maintenance loop',
		description:
			'Open-ended fitness upkeep: endurance + a threshold touch on a 2:1 rhythm, repeating indefinitely.',
		anchored: false,
		blocks: [
			{ focus: 'endurance', name: 'Endurance', weeks: 2, rhythm: 'none', hours: 6 },
			{ focus: 'threshold', name: 'Threshold touch', weeks: 2, rhythm: 'none', hours: 6.5 },
			{ focus: 'recovery', name: 'Easy week', weeks: 1, rhythm: 'none', hours: 4 },
		],
	},
	{
		id: 'macro-vo2season',
		name: 'Polarized VO2 season',
		description:
			'Long aerobic base, a hard 2:1 VO2max block, threshold consolidation, two-week taper.',
		anchored: true,
		blocks: [
			{ focus: 'endurance', name: 'Base', weeks: 4, rhythm: '3:1', hours: 8 },
			{ focus: 'vo2max', name: 'VO2max', weeks: 3, rhythm: '2:1', hours: 6 },
			{ focus: 'threshold', name: 'Consolidate', weeks: 2, rhythm: 'none', hours: 7 },
			{ focus: 'taper', name: 'Taper', weeks: 1, rhythm: 'none', hours: 7 },
		],
	},
]

export function instantiateMacro(m: MacroTemplate): MesoBlock[] {
	return m.blocks.map(instantiate)
}
