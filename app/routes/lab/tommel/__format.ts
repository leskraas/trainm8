import { type Num } from '#app/lab/engine/reads.types.ts'

export type Day = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
export const DAYS: Day[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
export const DAY_NAME: Record<Day, string> = {
	mon: 'mandag',
	tue: 'tirsdag',
	wed: 'onsdag',
	thu: 'torsdag',
	fri: 'fredag',
	sat: 'lørdag',
	sun: 'søndag',
}
export const MONTHS = [
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

export function cap1(s: string) {
	return s.charAt(0).toUpperCase() + s.slice(1)
}

/** `2026-11-15` → a UTC date for that day (no timezone drift). */
export function parseDay(d: string): Date {
	const [y, m, dd] = d.split('-').map(Number)
	return new Date(Date.UTC(y!, (m ?? 1) - 1, dd ?? 1))
}

export function dayKey(d: Date): string {
	return d.toISOString().slice(0, 10)
}

export function addDays(d: string, n: number): string {
	const x = parseDay(d)
	x.setUTCDate(x.getUTCDate() + n)
	return dayKey(x)
}

export function weekdayOf(d: string): Day {
	const i = (parseDay(d).getUTCDay() + 6) % 7
	return DAYS[i]!
}

export function daysBetween(a: string, b: string): number {
	return Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 864e5)
}

/** «i dag», «i morgen», «i går», «tirsdag» (this week), «tirsdag 24. nov». */
export function relDay(d: string, today: string): string {
	const diff = daysBetween(today, d)
	if (diff === 0) return 'i dag'
	if (diff === 1) return 'i morgen'
	if (diff === -1) return 'i går'
	if (diff > 1 && diff < 7) return DAY_NAME[weekdayOf(d)]
	return shortDate(d)
}

export function shortDate(d: string): string {
	const x = parseDay(d)
	return `${DAY_NAME[weekdayOf(d)]} ${x.getUTCDate()}. ${MONTHS[x.getUTCMonth()]!.slice(0, 3)}`
}

export function longDate(d: string): string {
	const x = parseDay(d)
	return `${x.getUTCDate()}. ${MONTHS[x.getUTCMonth()]} ${x.getUTCFullYear()}`
}

const nb = (max: number) =>
	new Intl.NumberFormat('nb-NO', { maximumFractionDigits: max })

export function num(n: number, digits = 0): string {
	return nb(digits).format(n)
}

/** Seconds → «50 min», «1 t 20 min». */
export function dur(sec: number): string {
	const m = Math.round(sec / 60)
	if (m < 60) return `${m} min`
	const h = Math.floor(m / 60)
	const r = m % 60
	return r ? `${h} t ${r} min` : `${h} t`
}

/** Hours (decimal) → «4 t 30 min». */
export function hours(h: number): string {
	return dur(h * 3600)
}

/** Seconds per km → «4:35». */
export function pace(sec: number): string {
	const s = Math.round(sec)
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Seconds → «1:45:00» or «45:00». */
export function clock(sec: number): string {
	const s = Math.round(sec)
	const h = Math.floor(s / 3600)
	const m = Math.floor((s % 3600) / 60)
	const r = s % 60
	return h
		? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
		: `${m}:${String(r).padStart(2, '0')}`
}

export function km(m: number): string {
	return `${num(m / 1000, m < 10000 ? 1 : 1)} km`
}

export function plural(n: number, one: string, many: string) {
	return `${num(n)} ${n === 1 ? one : many}`
}

/** A Num as text, or null when it is unknown (the caller shows «ukjent»). */
export function numText(
	n: Num,
	fmt: (v: number) => string = (v) => num(v),
): string | null {
	return n.value === null ? null : fmt(n.value)
}

export const VERDICT_WORD = {
	under: 'Under',
	'on-target': 'Traff',
	over: 'Over',
} as const

export function unitText(unit: string, v: number): string {
	if (unit === 'km') return `${num(v, 1)} km`
	if (unit === 'hours') return hours(v)
	if (unit === 'sets') return plural(Math.round(v), 'sett', 'sett')
	if (unit === 'tss' || unit === 'load') return `${num(v)} belastning`
	return num(v, 1)
}

/** «Terskel» → «terskel», but «VO₂maks» and «FTP» stay as they are. */
export function lowerFirst(s: string): string {
	return /^[A-ZÆØÅ][a-zæøå]/.test(s)
		? s.charAt(0).toLowerCase() + s.slice(1)
		: s
}
