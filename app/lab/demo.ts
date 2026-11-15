import {
	type LabSession,
	type LabSnapshot,
	type LabTrack,
	shiftDay,
	weekdayOf,
} from './snapshot.ts'

/**
 * The demo athlete for the App Lab (ADR 0125): a runner ten weeks out from a
 * half marathon, who also rides and lifts. Deterministic, so two screenshots
 * of the same day match. Every prototype labels it as demo data.
 */

type Template = {
	discipline: string
	title: string
	durationMin: number
	km: number | null
	tss: number
}

// Monday … Sunday.
const WEEK: (Template | null)[] = [
	{ discipline: 'strength', title: 'Styrke: knebøy og markløft', durationMin: 50, km: null, tss: 35 },
	{ discipline: 'run', title: 'Intervaller 6 × 4 min', durationMin: 60, km: 11, tss: 78 },
	{ discipline: 'bike', title: 'Rolig sykkel', durationMin: 75, km: 30, tss: 52 },
	{ discipline: 'run', title: 'Terskel 3 × 10 min', durationMin: 65, km: 12, tss: 82 },
	null,
	{ discipline: 'run', title: 'Langtur', durationMin: 110, km: 21, tss: 115 },
	{ discipline: 'swim', title: 'Teknikksvøm', durationMin: 40, km: 1.8, tss: 30 },
]

function hash(s: string): number {
	let h = 2166136261
	for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
	return (h >>> 0) / 4294967295
}

export function demoSnapshot(
	now: Date,
	timezone: string,
	name: string | null,
): LabSnapshot {
	const today = now.toISOString().slice(0, 10)
	const monday = shiftDay(today, -weekdayOf(today))
	const eventDate = shiftDay(monday, 7 * 10 + 6)

	const sessions: LabSession[] = []
	for (let offset = -27; offset <= 28; offset++) {
		const date = shiftDay(today, offset)
		const t = WEEK[weekdayOf(date)]
		if (!t) continue
		// Every fourth week is a recovery week at 70 %.
		const weekIndex = Math.floor(offset / 7)
		const scale = ((weekIndex % 4) + 4) % 4 === 3 ? 0.7 : 1 + weekIndex * 0.02
		const durationS = Math.round(t.durationMin * scale) * 60
		const distanceM = t.km == null ? null : Math.round(t.km * scale * 1000)
		const tss = Math.round(t.tss * scale)
		const roll = hash(date)
		const past = offset < 0
		const status: LabSession['status'] = past
			? roll < 0.12
				? 'missed'
				: 'done'
			: 'planned'
		const drift = 0.85 + roll * 0.3
		sessions.push({
			id: `demo-${date}`,
			date,
			discipline: t.discipline,
			title: t.title,
			status,
			owner: 'plan',
			planned: { durationS, distanceM, tss },
			actual:
				status === 'done'
					? {
							durationS: Math.round(durationS * drift),
							distanceM:
								distanceM == null ? null : Math.round(distanceM * drift),
							tss: Math.round(tss * drift),
						}
					: { durationS: null, distanceM: null, tss: null },
			link: '/training',
		})
	}

	const days: LabSnapshot['loadHistory']['days'] = []
	let ctl = 38
	let atl = 40
	for (let offset = -83; offset <= 0; offset++) {
		const date = shiftDay(today, offset)
		const t = WEEK[weekdayOf(date)]
		const tss = t ? Math.round(t.tss * (0.8 + hash(date) * 0.4)) : 0
		ctl += (tss - ctl) / 42
		atl += (tss - atl) / 7
		days.push({
			date,
			tss,
			ctl: Math.round(ctl * 10) / 10,
			atl: Math.round(atl * 10) / 10,
			tsb: Math.round((ctl - atl) * 10) / 10,
		})
	}
	const last = days[days.length - 1]!

	const weekTracks = (scale: number): LabTrack[] => [
		{ discipline: 'run', currency: 'km', target: Math.round(44 * scale), planned: Math.round(44 * scale), actual: null },
		{ discipline: 'bike', currency: 'hours', target: Math.round(1.25 * scale * 10) / 10, planned: Math.round(1.25 * scale * 10) / 10, actual: null },
		{ discipline: 'strength', currency: 'sets', target: 12, planned: 12, actual: null },
	]

	const thisWeekDone = sessions.filter(
		(s) => s.date >= monday && s.date < today && s.status === 'done',
	)
	const week = weekTracks(1).map((t) => ({
		...t,
		actual:
			t.discipline === 'run'
				? Math.round(
						thisWeekDone
							.filter((s) => s.discipline === 'run')
							.reduce((sum, s) => sum + (s.actual.distanceM ?? 0), 0) / 1000,
					)
				: t.discipline === 'bike'
					? Math.round(
							(thisWeekDone
								.filter((s) => s.discipline === 'bike')
								.reduce((sum, s) => sum + (s.actual.durationS ?? 0), 0) /
								3600) *
								10,
						) / 10
					: thisWeekDone.filter((s) => s.discipline === 'strength').length * 6,
	}))

	const phases = ['Grunn', 'Grunn', 'Grunn', 'Bygg', 'Bygg', 'Bygg', 'Topp', 'Topp', 'Nedtrapping', 'Løp']
	const seasonWeeks = Array.from({ length: 11 }, (_, i) => {
		const scale = i % 4 === 3 ? 0.7 : 1 + i * 0.05
		return {
			weekKey: shiftDay(monday, 7 * i),
			phase: phases[Math.min(i, phases.length - 1)] ?? null,
			tracks: weekTracks(i >= 9 ? 0.5 : scale),
		}
	})

	const loadWeeks = Array.from({ length: 12 }, (_, i) => {
		const weekKey = shiftDay(monday, -7 * (11 - i))
		const actual = days
			.filter((d) => d.date >= weekKey && d.date < shiftDay(weekKey, 7))
			.reduce((sum, d) => sum + (d.tss ?? 0), 0)
		const planned = 390
		const ratio = actual / planned
		return {
			weekKey,
			plannedTss: planned,
			actualTss: i === 11 ? actual || null : actual,
			adherence:
				i === 11
					? null
					: ratio < 0.85
						? ('under' as const)
						: ratio > 1.15
							? ('over' as const)
							: ('on-target' as const),
		}
	})

	return {
		source: 'demo',
		athlete: { name, timezone },
		today,
		load: { ctl: last.ctl, atl: last.atl, tsb: last.tsb },
		week,
		openProposals: 1,
		sessions,
		season: {
			name: 'Halvmaraton under 1:35',
			event: { name: 'Oslo halvmaraton', date: eventDate },
			weeks: seasonWeeks,
		},
		loadHistory: { days, weeks: loadWeeks },
	}
}
