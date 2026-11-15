/**
 * Prat: words and numbers in the partner's voice. Every helper here formats
 * a number the engine gave; none of them invent one.
 */

export type WeekdayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export const WEEKDAY_KEYS: WeekdayKey[] = [
	'mon',
	'tue',
	'wed',
	'thu',
	'fri',
	'sat',
	'sun',
]

export const WEEKDAY_LONG: Record<WeekdayKey, string> = {
	mon: 'mandag',
	tue: 'tirsdag',
	wed: 'onsdag',
	thu: 'torsdag',
	fri: 'fredag',
	sat: 'lørdag',
	sun: 'søndag',
}

export const WEEKDAY_SHORT: Record<WeekdayKey, string> = {
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
const MONTHS_SHORT = [
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
]

/** A `YYYY-MM-DD` as a UTC date, so weekday maths never shifts a day. */
export function dayDate(day: string) {
	const [y, m, d] = day.split('-').map(Number)
	return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1))
}

export function dayKey(date: Date) {
	return date.toISOString().slice(0, 10)
}

export function addDays(day: string, n: number) {
	const d = dayDate(day)
	d.setUTCDate(d.getUTCDate() + n)
	return dayKey(d)
}

export function daysBetween(from: string, to: string) {
	return Math.round(
		(dayDate(to).getTime() - dayDate(from).getTime()) / 86_400_000,
	)
}

export function weekdayOf(day: string): WeekdayKey {
	const i = (dayDate(day).getUTCDay() + 6) % 7
	return WEEKDAY_KEYS[i]!
}

export function mondayOf(day: string) {
	const i = (dayDate(day).getUTCDay() + 6) % 7
	return addDays(day, -i)
}

/** `torsdag 19. november` */
export function longDate(day: string) {
	const d = dayDate(day)
	return `${WEEKDAY_LONG[weekdayOf(day)]} ${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]}`
}

/** `19. nov` */
export function shortDate(day: string) {
	const d = dayDate(day)
	return `${d.getUTCDate()}. ${MONTHS_SHORT[d.getUTCMonth()]}`
}

/** `mars 2024` */
export function monthYear(day: string) {
	const d = dayDate(day.slice(0, 10))
	return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/** `i dag`, `i morgen`, `i går`, `torsdag`, `torsdag 19. nov` */
export function relDay(day: string, today: string) {
	const diff = daysBetween(today, day)
	if (diff === 0) return 'i dag'
	if (diff === 1) return 'i morgen'
	if (diff === -1) return 'i går'
	if (diff > 1 && diff < 7) return WEEKDAY_LONG[weekdayOf(day)]
	if (diff < -1 && diff > -7) return `${WEEKDAY_LONG[weekdayOf(day)]}`
	return `${WEEKDAY_LONG[weekdayOf(day)]} ${shortDate(day)}`
}

export function cap(s: string) {
	return s.charAt(0).toUpperCase() + s.slice(1)
}

const nf1 = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 1 })
const nf0 = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 })

export function num1(n: number) {
	return nf1.format(n)
}
export function num0(n: number) {
	return nf0.format(n)
}

/** Seconds as `50 min` or `1 t 20 min`. */
export function dur(seconds: number) {
	const m = Math.round(seconds / 60)
	if (m < 60) return `${m} min`
	const h = Math.floor(m / 60)
	const r = m % 60
	return r ? `${h} t ${r} min` : `${h} t`
}

export function minutesText(m: number) {
	return dur(m * 60)
}

/** Hours as `4 t 10 min`. */
export function hoursText(h: number) {
	return dur(h * 3600)
}

/** Metres as `10,2 km` (or `800 m` under a kilometre). */
export function km(metres: number) {
	if (metres < 1000) return `${nf0.format(metres)} m`
	return `${nf1.format(metres / 1000)} km`
}

/** Seconds per km (or per 100 m) as `4:28`. */
export function mmss(seconds: number) {
	const s = Math.round(seconds)
	const m = Math.floor(s / 60)
	const r = s % 60
	return `${m}:${String(r).padStart(2, '0')}`
}

export function hms(seconds: number) {
	const s = Math.round(seconds)
	const h = Math.floor(s / 3600)
	const m = Math.floor((s % 3600) / 60)
	const r = s % 60
	return h
		? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
		: `${m}:${String(r).padStart(2, '0')}`
}

/** A sport's weekly volume in its own unit. */
export function volume(value: number, unit: string) {
	if (unit === 'km') return `${nf1.format(value)} km`
	if (unit === 'hours') return hoursText(value)
	if (unit === 'tss' || unit === 'load')
		return `${nf0.format(value)} belastning`
	if (unit === 'sets') return `${nf0.format(value)} sett`
	return nf1.format(value)
}

export function plural(n: number, one: string, many: string) {
	return `${nf0.format(n)} ${n === 1 ? one : many}`
}

export function greeting(hour: number) {
	if (hour < 5) return 'God natt'
	if (hour < 10) return 'God morgen'
	if (hour < 17) return 'Hei'
	return 'God kveld'
}

/** The athlete's local hour, from their timezone. */
export function localHour(timezone: string, now = new Date()) {
	try {
		const h = new Intl.DateTimeFormat('en-GB', {
			hour: 'numeric',
			hourCycle: 'h23',
			timeZone: timezone,
		}).format(now)
		return Number(h)
	} catch {
		return now.getHours()
	}
}

export function lower(s: string) {
	return s.charAt(0).toLowerCase() + s.slice(1)
}

export function joinList(items: string[]) {
	if (items.length <= 1) return items.join('')
	return `${items.slice(0, -1).join(', ')} og ${items[items.length - 1]}`
}
