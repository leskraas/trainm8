/**
 * Brev: words and numbers. Everything the letters say is built here from
 * engine data, deterministically. Numbers are never invented: a null is said
 * as unknown, in the letter's voice.
 */
import {
	type Num,
	type SessionCard,
	type SportVolume,
	type Verdict,
	type Weekday,
} from '#app/lab/engine/reads.types.ts'

export const BASE = '/lab/brev'

export const WEEKDAY_ORDER: Weekday[] = [
	'mon',
	'tue',
	'wed',
	'thu',
	'fri',
	'sat',
	'sun',
]

export const DAY_NAME: Record<Weekday, string> = {
	mon: 'mandag',
	tue: 'tirsdag',
	wed: 'onsdag',
	thu: 'torsdag',
	fri: 'fredag',
	sat: 'lørdag',
	sun: 'søndag',
}

export const DAY_SHORT: Record<Weekday, string> = {
	mon: 'man',
	tue: 'tir',
	wed: 'ons',
	thu: 'tor',
	fri: 'fre',
	sat: 'lør',
	sun: 'søn',
}

const MONTHS = [
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

export function cap(s: string) {
	return s.length ? s[0]!.toUpperCase() + s.slice(1) : s
}

/** A `YYYY-MM-DD` as a UTC date, so arithmetic never drifts a day. */
export function day(key: string) {
	const [y, m, d] = key.split('-').map(Number)
	return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1))
}

export function keyOf(date: Date) {
	return date.toISOString().slice(0, 10)
}

export function addDays(key: string, n: number) {
	const d = day(key)
	d.setUTCDate(d.getUTCDate() + n)
	return keyOf(d)
}

export function weekdayOf(key: string): Weekday {
	return WEEKDAY_ORDER[(day(key).getUTCDay() + 6) % 7]!
}

export function mondayOf(key: string) {
	return addDays(key, -WEEKDAY_ORDER.indexOf(weekdayOf(key)))
}

export function daysBetween(a: string, b: string) {
	return Math.round((day(b).getTime() - day(a).getTime()) / 86_400_000)
}

export function isoWeek(key: string) {
	const d = day(key)
	const dayNum = (d.getUTCDay() + 6) % 7
	d.setUTCDate(d.getUTCDate() - dayNum + 3)
	const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
	return (
		1 +
		Math.round(
			((d.getTime() - firstThursday.getTime()) / 86_400_000 -
				3 +
				((firstThursday.getUTCDay() + 6) % 7)) /
				7,
		)
	)
}

/** «15. november» (with the year when it is not this year). */
export function dateText(key: string, thisYear?: number) {
	const d = day(key)
	const y = d.getUTCFullYear()
	const base = `${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]}`
	return thisYear !== undefined && y !== thisYear ? `${base} ${y}` : base
}

export function monthYear(key: string) {
	const d = day(key)
	return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/** «9.–15. nov» */
export function weekSpan(monday: string) {
	const a = day(monday)
	const b = day(addDays(monday, 6))
	const m = (d: Date) => MONTHS[d.getUTCMonth()]!.slice(0, 3)
	return a.getUTCMonth() === b.getUTCMonth()
		? `${a.getUTCDate()}.–${b.getUTCDate()}. ${m(b)}`
		: `${a.getUTCDate()}. ${m(a)}–${b.getUTCDate()}. ${m(b)}`
}

export function timeOf(iso: string, timeZone?: string) {
	try {
		return new Intl.DateTimeFormat('nb-NO', {
			hour: '2-digit',
			minute: '2-digit',
			timeZone,
		}).format(new Date(iso))
	} catch {
		return iso.slice(11, 16)
	}
}

export function dayTimeOf(iso: string, timeZone?: string) {
	try {
		return new Intl.DateTimeFormat('nb-NO', {
			weekday: 'long',
			hour: '2-digit',
			minute: '2-digit',
			timeZone,
		}).format(new Date(iso))
	} catch {
		return iso
	}
}

const nf1 = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 1 })
const nf0 = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 })

export function n1(v: number) {
	return nf1.format(v)
}
export function n0(v: number) {
	return nf0.format(v)
}

/** Minutes as «45 min» or «1 t 30 min». */
export function minText(min: number) {
	const m = Math.round(min)
	if (m < 60) return `${m} min`
	const h = Math.floor(m / 60)
	const r = m % 60
	return r ? `${h} t ${r} min` : `${h} t`
}

export function secText(s: number) {
	return minText(s / 60)
}

export function hoursText(h: number) {
	const whole = Math.floor(h)
	const half = h - whole >= 0.25 && h - whole < 0.75
	if (h < 1) return `${Math.round(h * 60)} min`
	return `${half ? `${n1(whole + 0.5)}` : n0(Math.round(h))} t`
}

export function paceText(secPerKm: number, unit: 'km' | '100m' = 'km') {
	const m = Math.floor(secPerKm / 60)
	const s = Math.round(secPerKm % 60)
	return `${m}:${String(s).padStart(2, '0')} /${unit === 'km' ? 'km' : '100 m'}`
}

export function unitWord(unit: string) {
	switch (unit) {
		case 'km':
			return 'km'
		case 'hours':
			return 't'
		case 'tss':
		case 'load':
			return 'belastning'
		case 'sets':
			return 'sett'
		default:
			return unit
	}
}

export function volumeText(v: number, unit: string) {
	if (unit === 'hours') return hoursText(v)
	if (unit === 'km') return `${n1(v)} km`
	if (unit === 'sets') return `${n0(v)} sett`
	return `${n0(v)} ${unitWord(unit)}`
}

export function known(n: Num | null | undefined): n is Num & { value: number } {
	return !!n && n.value !== null && Number.isFinite(n.value)
}

export const SPORT_LETTER: Record<string, string> = {
	run: 'L',
	bike: 'S',
	swim: 'Sv',
	strength: 'St',
	other: 'A',
}

export const SPORT_NOUN: Record<string, string> = {
	run: 'løp',
	bike: 'sykkel',
	swim: 'svøm',
	strength: 'styrke',
	other: 'aktivitet',
}

export const SPORT_NAME: Record<string, string> = {
	run: 'løping',
	bike: 'sykkel',
	swim: 'svømming',
	strength: 'styrke',
	other: 'annet',
}

/** The verdict in the letter's own words. */
export function verdictWords(v: Verdict) {
	switch (v.call) {
		case 'on-target':
			return 'Traff planen.'
		case 'under':
			return 'Lettere enn planlagt.'
		case 'over':
			return 'Hardere enn planlagt. Det er over, ikke bra.'
		default:
			return null
	}
}

export type Tone = 'hit' | 'off' | 'unknown' | 'plain'
export function verdictTone(v: Verdict): Tone {
	if (v.call === 'on-target') return 'hit'
	if (v.call === 'over' || v.call === 'under') return 'off'
	return 'plain'
}

/** Short lowercase reason, without the «Ikke målt:» prefix. */
export function whyShort(why: string | null | undefined) {
	if (!why) return 'ukjent'
	const s = why.replace(/^(Ikke målt|Ikke registrert|Ikke satt)\s*[:·]\s*/i, '')
	return s.replace(/\.$/, '')
}

export function sessionMinutes(s: SessionCard) {
	return {
		planned: known(s.planned.durationS) ? s.planned.durationS.value / 60 : null,
		actual: known(s.actual.durationS) ? s.actual.durationS.value / 60 : null,
	}
}

export function plural(n: number, one: string, many: string) {
	return `${n} ${n === 1 ? one : many}`
}

export function countWord(n: number) {
	const w = [
		'null',
		'én',
		'to',
		'tre',
		'fire',
		'fem',
		'seks',
		'sju',
		'åtte',
		'ni',
		'ti',
	]
	return n >= 0 && n <= 10 ? w[n]! : String(n)
}

export function sportVolumeLine(v: SportVolume) {
	return v
}

export function greetingName(name: string | null, username: string) {
	return name?.trim() || username
}

/** A gentle, fixed rotation of openings so the letters don't all start alike. */
export function pick<T>(list: T[], seed: string) {
	let h = 0
	for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0
	return list[h % list.length]!
}

export const LEVEL_SHORT: Record<string, string> = {
	beginner: 'nybegynner',
	recreational: 'mosjonist',
	experienced: 'erfaren',
	competitive: 'konkurranseutøver',
}

export const PREF_SHORT: Record<string, string> = {
	long: 'lange, rolige turer',
	intervals: 'korte, harde intervaller',
	threshold: 'jevnt hardt',
	short: 'korte økter',
	surprise: 'å bli overrasket',
}

export function listText(items: string[], and = 'og') {
	if (items.length === 0) return ''
	if (items.length === 1) return items[0]!
	return `${items.slice(0, -1).join(', ')} ${and} ${items[items.length - 1]}`
}

export function phaseName(name: string) {
	const map: Record<string, string> = {
		Base: 'Grunnmur',
		Build: 'Oppbygging',
		Peak: 'Topp',
		Taper: 'Nedtrapping',
		Race: 'Løp',
		Recovery: 'Hvile',
		Transition: 'Overgang',
	}
	return map[name] ?? name
}

export function roleWord(role: string | null) {
	if (role === 'recovery') return 'lett uke'
	if (role === 'taper') return 'nedtrapping'
	if (role === 'loading') return 'byggeuke'
	return null
}
