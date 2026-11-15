/**
 * Hovedbok: dates and numbers, the way the book writes them. Pure functions,
 * client-safe. Dates are `YYYY-MM-DD` strings; all arithmetic is done in UTC
 * so a day is always a day.
 */
import { type Num, type SessionCard } from '#app/lab/engine/reads.types.ts'

export const WD = ['ma', 'ti', 'on', 'to', 'fr', 'lø', 'sø'] as const
export const WD_LONG = [
	'mandag',
	'tirsdag',
	'onsdag',
	'torsdag',
	'fredag',
	'lørdag',
	'søndag',
] as const
export const WEEKDAY_KEYS = [
	'mon',
	'tue',
	'wed',
	'thu',
	'fri',
	'sat',
	'sun',
] as const
export const MONTHS = [
	'jan',
	'feb',
	'mar',
	'apr',
	'mai',
	'jun',
	'jul',
	'aug',
	'sep',
	'okt',
	'nov',
	'des',
] as const
const MONTHS_LONG = [
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
] as const

function parse(d: string) {
	const [y, m, day] = d.split('-').map(Number)
	return new Date(Date.UTC(y!, (m ?? 1) - 1, day ?? 1))
}
function fmt(d: Date) {
	return d.toISOString().slice(0, 10)
}

export function addDays(d: string, n: number) {
	const x = parse(d)
	x.setUTCDate(x.getUTCDate() + n)
	return fmt(x)
}
/** 0 = Monday. */
export function weekdayIndex(d: string) {
	return (parse(d).getUTCDay() + 6) % 7
}
export function mondayOf(d: string) {
	return addDays(d, -weekdayIndex(d))
}
export function daysBetween(a: string, b: string) {
	return Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000)
}
export function isoWeek(d: string) {
	const x = parse(d)
	const day = (x.getUTCDay() + 6) % 7
	x.setUTCDate(x.getUTCDate() - day + 3)
	const firstThursday = new Date(Date.UTC(x.getUTCFullYear(), 0, 4))
	return (
		1 +
		Math.round(
			((x.getTime() - firstThursday.getTime()) / 86400000 -
				3 +
				((firstThursday.getUTCDay() + 6) % 7)) /
				7,
		)
	)
}
export function isDayKey(s: string | null | undefined): s is string {
	return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(parse(s).getTime())
}

/** «ti 14.» */
export function dayShort(d: string) {
	return `${WD[weekdayIndex(d)]} ${parse(d).getUTCDate()}.`
}
/** «tirsdag 14. november» */
export function dayLong(d: string) {
	const x = parse(d)
	return `${WD_LONG[weekdayIndex(d)]} ${x.getUTCDate()}. ${MONTHS_LONG[x.getUTCMonth()]}`
}
/** «14. nov 2026» */
export function dateMedium(d: string, withYear = true) {
	const x = parse(d)
	return `${x.getUTCDate()}. ${MONTHS[x.getUTCMonth()]}${withYear ? ` ${x.getUTCFullYear()}` : ''}`
}
/** «mars 2024» */
export function monthYear(d: string) {
	const x = parse(d)
	return `${MONTHS_LONG[x.getUTCMonth()]} ${x.getUTCFullYear()}`
}
export function monthOf(d: string) {
	return parse(d).getUTCMonth()
}
export function monthName(d: string) {
	return MONTHS_LONG[parse(d).getUTCMonth()]!
}

const nb1 = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 1 })
const nb0 = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 })
export function n1(v: number) {
	return nb1.format(v).replace(/ /g, ' ')
}
export function n0(v: number) {
	return nb0.format(v).replace(/ /g, ' ')
}

/** Minutes with the prime: «50′». */
export function minutes(s: number) {
	return `${Math.round(s / 60)}′`
}
/** «1:05» hours from seconds. */
export function hm(s: number) {
	const m = Math.round(s / 60)
	return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}
/** Pace «4:28» from seconds per km. */
export function pace(secPerKm: number) {
	const t = Math.round(secPerKm)
	return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}
export function km(m: number) {
	return n1(m / 1000)
}
export function hours(s: number) {
	return n1(s / 3600)
}

/** The plan cell, compact: «Terskel 50′». */
export function planText(c: SessionCard) {
	if (c.status === 'recording-only') return ''
	const d = c.planned.durationS.value
	return d != null ? `${minutes(d).padStart(4, '\u2007')} ${c.title}` : c.title
}

/** The actual cell: «52′ · 4:28», «gjort (uten data)», or empty. */
export function actualText(c: SessionCard, today: string) {
	if (c.status === 'missed') return c.date >= today ? 'droppet' : 'ikke gjort'
	if (c.status !== 'done' && c.status !== 'recording-only') {
		if (c.sport === 'strength' && (c.strengthSetsLogged ?? 0) > 0)
			return `${c.strengthSetsLogged} sett`
		return ''
	}
	const d = c.actual.durationS.value
	const m = c.actual.distanceM.value
	const parts: string[] = []
	if (d != null) parts.push(minutes(d))
	if (c.sport === 'run' && d != null && m != null && m > 0)
		parts.push(pace(d / (m / 1000)))
	else if (m != null && m > 0) parts.push(`${km(m)}k`)
	if (c.sport === 'strength' && c.strengthSetsLogged != null)
		parts.push(`${c.strengthSetsLogged} sett`)
	if (!parts.length) return 'gjort'
	return parts.join(' ')
}

export type Deviation = {
	sign: '=' | '−' | '+' | '?' | ''
	tone: 'hit' | 'under' | 'over' | 'unknown' | 'none'
	why: string
}
export function deviation(c: SessionCard, today: string): Deviation {
	if (c.status === 'recording-only')
		return { sign: '', tone: 'none', why: 'Ingen plan å holde økta opp mot.' }
	if (c.status === 'planned')
		return {
			sign: '',
			tone: 'none',
			why: c.date < today ? 'Ikke markert ennå.' : 'Ikke gjort ennå.',
		}
	if (c.status === 'missed')
		return { sign: '−', tone: 'under', why: 'Ikke gjort.' }
	const v = c.verdict
	if (v.call === 'on-target')
		return { sign: '=', tone: 'hit', why: v.sentence ?? 'I rute.' }
	if (v.call === 'under')
		return { sign: '−', tone: 'under', why: v.sentence ?? 'Under.' }
	if (v.call === 'over')
		return { sign: '+', tone: 'over', why: v.sentence ?? 'Over.' }
	return { sign: '?', tone: 'unknown', why: v.why ?? 'Kan ikke vites.' }
}

/** A number as text, or null with why. */
export function numOr(n: Num, f: (v: number) => string) {
	return n.value == null ? null : f(n.value)
}

export const SPORT_SHORT: Record<string, string> = {
	run: 'L',
	bike: 'S',
	swim: 'Sv',
	strength: 'St',
	other: 'A',
}
export const SPORT_NAME: Record<string, string> = {
	run: 'Løping',
	bike: 'Sykling',
	swim: 'Svømming',
	strength: 'Styrke',
	other: 'Annet',
}
export const UNIT_LABEL: Record<string, string> = {
	km: 'km',
	hours: 't',
	tss: 'TSS',
	sets: 'sett',
	load: 'TSS',
}

/** «tirsdag, planlagt Terskel 50 minutter, faktisk 52 minutter, over» */
export function rowSentence(c: SessionCard, today: string) {
	const parts = [dayLong(c.date)]
	if (c.status !== 'recording-only') {
		const d = c.planned.durationS.value
		parts.push(
			`planlagt ${c.title}${d != null ? ` ${Math.round(d / 60)} minutter` : ''}`,
		)
	} else parts.push(`ikke planlagt, ${c.title}`)
	const a = actualText(c, today)
	if (a) parts.push(`faktisk ${a.replace(/′/g, ' minutter')}`)
	const dev = deviation(c, today)
	const word = {
		hit: 'traff',
		under: 'under',
		over: 'over',
		unknown: 'ukjent avvik',
		none: '',
	}[dev.tone]
	if (word) parts.push(word)
	if (c.rpe != null) parts.push(`tyngde ${c.rpe}`)
	return parts.join(', ')
}
