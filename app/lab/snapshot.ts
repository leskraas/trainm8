/**
 * The **Lab Snapshot** (ADR 0125): the one plain read model every App Lab
 * prototype draws from. It is built from the same typed reads the MCP server
 * and I dag use (`get_today`, `list_sessions`, `get_season`,
 * `get_training_load`), flattened so a prototype can spend its effort on the
 * experience rather than on Readings.
 *
 * Every number is `number | null`: `null` is an Unavailable Metric and must be
 * shown as missing, never as 0. A prototype never invents a number of its own.
 *
 * `source: 'demo'` is a made-up athlete, used when the signed-in athlete has
 * nothing to show yet or asks for `?demo=1`. A prototype says so on screen
 * whenever it is showing demo data.
 */

export type LabSessionStatus = 'planned' | 'done' | 'missed' | 'recording-only'

export type LabFigures = {
	durationS: number | null
	distanceM: number | null
	tss: number | null
}

export type LabSession = {
	id: string
	/** `YYYY-MM-DD` in the Athlete Timezone. */
	date: string
	/** `run`, `bike`, `swim`, `strength` or `other`. */
	discipline: string
	title: string
	status: LabSessionStatus
	/** Whose session it is to change: the athlete's or the plan's. */
	owner: string
	planned: LabFigures
	actual: LabFigures
	/** The session in the classic app, for anything a prototype can't do yet. */
	link: string
}

export type LabTrack = {
	discipline: string
	/** The unit every number is in: `km`, `hours`, `tss` or `sets`. */
	currency: string
	target: number | null
	planned: number | null
	actual: number | null
}

export type LabSnapshot = {
	source: 'athlete' | 'demo'
	athlete: { name: string | null; timezone: string }
	/** `YYYY-MM-DD`, today in the Athlete Timezone. */
	today: string
	load: {
		/** Fitness. */
		ctl: number | null
		/** Fatigue. */
		atl: number | null
		/** Form; null until 42 days of history make it trustworthy. */
		tsb: number | null
	}
	/** This training week, per track. */
	week: LabTrack[]
	/** Week-change proposals waiting for the athlete's answer. */
	openProposals: number | null
	/** The last 28 days and the next 28 days, oldest first. */
	sessions: LabSession[]
	season: {
		name: string
		event: { name: string; date: string } | null
		weeks: {
			/** The week's Monday. */
			weekKey: string
			phase: string | null
			tracks: LabTrack[]
		}[]
	} | null
	/** Twelve weeks of training load, oldest first. */
	loadHistory: {
		days: {
			date: string
			tss: number | null
			ctl: number | null
			atl: number | null
			tsb: number | null
		}[]
		weeks: {
			weekKey: string
			plannedTss: number | null
			actualTss: number | null
			adherence: 'under' | 'on-target' | 'over' | null
		}[]
	}
}

export const DISCIPLINE_NB: Record<string, string> = {
	run: 'Løping',
	bike: 'Sykkel',
	swim: 'Svømming',
	strength: 'Styrke',
	other: 'Annet',
}

/** `3 t 05 min`, `45 min`, or `null`. */
export function formatDuration(seconds: number | null): string | null {
	if (seconds == null) return null
	const minutes = Math.round(seconds / 60)
	const h = Math.floor(minutes / 60)
	const m = minutes % 60
	if (h === 0) return `${m} min`
	return `${h} t ${String(m).padStart(2, '0')} min`
}

/** `12,4 km`, or `null`. */
export function formatDistance(meters: number | null): string | null {
	if (meters == null) return null
	return `${(meters / 1000).toLocaleString('nb-NO', { maximumFractionDigits: 1 })} km`
}

const WEEKDAYS_NB = [
	'mandag',
	'tirsdag',
	'onsdag',
	'torsdag',
	'fredag',
	'lørdag',
	'søndag',
]
const MONTHS_NB = [
	'januar',
	'februar',
	'mars',
	'april',
	'mai',
	'juni',
	'juli',
	'august',
	'september',
	'oktober',
	'november',
	'desember',
]

/** `mandag 16. november` for a `YYYY-MM-DD`. */
export function formatDayNb(date: string): string {
	const d = new Date(`${date}T12:00:00Z`)
	const weekday = WEEKDAYS_NB[(d.getUTCDay() + 6) % 7]
	return `${weekday} ${d.getUTCDate()}. ${MONTHS_NB[d.getUTCMonth()]}`
}

/** `0` = Monday … `6` = Sunday. */
export function weekdayOf(date: string): number {
	return (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7
}

export function shiftDay(date: string, days: number): string {
	const d = new Date(`${date}T12:00:00Z`)
	d.setUTCDate(d.getUTCDate() + days)
	return d.toISOString().slice(0, 10)
}

export function dayDiff(from: string, to: string): number {
	return Math.round(
		(Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) /
			86_400_000,
	)
}
