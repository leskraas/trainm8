import {
	type AthleteOutput,
	type ProposalsOutput,
	type RecordingsOutput,
	type SessionOutput,
	type SessionsOutput,
	type TodayOutput,
	type WeekOutput,
	type ZonesOutput,
} from '#app/lab/engine/reads.types.ts'
import { type LinkOptionsOutput } from '#app/lab/engine/sessions.types.ts'
import {
	type ConnectionsOutput,
	type GoalOutput,
	type ImportStatusOutput,
	type PlanPreviewOutput,
	type PlanStyle,
	type SetupState,
	type StartOptionsOutput,
} from '#app/lab/engine/setup.types.ts'
import { readFlags, run, valueOr } from './__data.server.ts'
import { addDays, localHour } from './__fmt.ts'
import {
	type LayoutData,
	type OnboardingData,
	type RaceEve,
	type ThreadData,
} from './__types.ts'

const STYLES: PlanStyle[] = ['polarized', 'threshold', 'classic', 'big-base']

export async function loadLayout(request: Request): Promise<LayoutData> {
	const me = await run<AthleteOutput>(request, 'athlete', {})
	if (!me.ok) return { mode: 'error', message: me.message }
	const athlete = me.value
	const hour = localHour(athlete.timezone)
	if (!athlete.setup.complete) return loadOnboarding(request, athlete, hour)
	return loadThread(request, athlete, hour)
}

async function loadOnboarding(
	request: Request,
	athlete: AthleteOutput,
	hour: number,
): Promise<OnboardingData> {
	const url = new URL(request.url)
	const wanted = url.searchParams.get('stil')
	const style = STYLES.find((s) => s === wanted)
	const [setup, connections, importStatus, goal] = await Promise.all([
		run<SetupState>(request, 'get_setup', {}),
		run<ConnectionsOutput>(request, 'connections', {}),
		run<ImportStatusOutput>(request, 'import_status', {}),
		run<GoalOutput>(request, 'goal', {}),
	])
	let options: StartOptionsOutput | null = null
	let optionsError: OnboardingData['optionsError'] = null
	let preview: PlanPreviewOutput | null = null
	let previewError: string | null = null
	if (setup.ok && setup.value.readyForPlans) {
		const o = await run<StartOptionsOutput>(request, 'start_options', {})
		if (o.ok) {
			options = o.value
			const chosen =
				style && o.value.options.some((x) => x.style === style)
					? style
					: o.value.options[0]?.style
			if (chosen) {
				const p = await run<PlanPreviewOutput>(request, 'plan_preview', {
					style: chosen,
				})
				if (p.ok) preview = p.value
				else previewError = p.message
			}
		} else optionsError = { code: o.code, message: o.message }
	}
	return {
		mode: 'onboarding',
		athlete,
		hour,
		setup: valueOr(setup),
		setupError: setup.ok ? null : setup.message,
		connections: valueOr(connections),
		importStatus: valueOr(importStatus),
		goal: valueOr(goal),
		options,
		optionsError,
		preview,
		previewError,
		flags: readFlags(request, athlete.username),
	}
}

async function loadThread(
	request: Request,
	athlete: AthleteOutput,
	hour: number,
): Promise<ThreadData> {
	const todayKey = athlete.today
	const [today, week, nextWeek, lastWeek, proposals, recent, recordings] =
		await Promise.all([
			run<TodayOutput>(request, 'today', {}),
			run<WeekOutput>(request, 'week', {}),
			run<WeekOutput>(request, 'week', { date: addDays(todayKey, 7) }),
			run<WeekOutput>(request, 'week', { date: addDays(todayKey, -7) }),
			run<ProposalsOutput>(request, 'proposals', {}),
			run<SessionsOutput>(request, 'sessions', {
				from: addDays(todayKey, -7),
				to: addDays(todayKey, -1),
				limit: 100,
			}),
			run<RecordingsOutput>(request, 'recordings', { limit: 30 }),
		])

	const todayDetails: SessionOutput[] = []
	if (today.ok) {
		const reads = await Promise.all(
			today.value.sessions.map((s) =>
				run<SessionOutput>(request, 'session', { sessionId: s.id }),
			),
		)
		for (const r of reads) if (r.ok) todayDetails.push(r.value)
	}

	// Recordings that stand on their own lately: could they be a planned one?
	const linkOptions: Record<string, LinkOptionsOutput> = {}
	const recs = recordings.ok ? recordings.value.recordings : []
	const loose = recs
		.filter((r) => !r.linkedToPlan && r.date >= addDays(todayKey, -3))
		.slice(0, 4)
	const opts = await Promise.all(
		loose.map((r) =>
			run<LinkOptionsOutput>(request, 'link_options', { recordingId: r.id }),
		),
	)
	opts.forEach((o, i) => {
		const rec = loose[i]
		if (o.ok && rec && o.value.options.length) linkOptions[rec.id] = o.value
	})

	let raceEve: RaceEve | null = null
	const goal = athlete.goal
	if (
		goal?.kind === 'event' &&
		goal.daysToGo !== null &&
		goal.daysToGo >= 0 &&
		goal.daysToGo <= 1
	) {
		raceEve = await loadRaceEve(request, athlete, today.ok ? today.value : null)
	}

	return {
		mode: 'thread',
		athlete,
		hour,
		today: valueOr(today),
		todayError: today.ok ? null : today.message,
		todayDetails,
		week: valueOr(week),
		nextWeek: valueOr(nextWeek),
		lastWeek: valueOr(lastWeek),
		proposals: valueOr(proposals),
		recent: recent.ok ? recent.value.sessions : [],
		recordings: recs,
		linkOptions,
		importing: recordings.ok ? recordings.value.importing : false,
		raceEve,
	}
}

async function loadRaceEve(
	request: Request,
	athlete: AthleteOutput,
	today: TodayOutput | null,
): Promise<RaceEve> {
	const goal = athlete.goal!
	let done: number | null = 0
	let planned: number | null = 0
	const first = athlete.plan.firstWeek
	if (first) {
		let cursor: string | undefined
		let pages = 0
		do {
			const r = await run<SessionsOutput>(request, 'sessions', {
				from:
					first < addDays(athlete.today, -365)
						? addDays(athlete.today, -365)
						: first,
				to: addDays(athlete.today, -1),
				limit: 100,
				cursor,
			})
			if (!r.ok) {
				done = null
				planned = null
				break
			}
			for (const s of r.value.sessions) {
				if (s.status === 'recording-only') continue
				planned = (planned ?? 0) + 1
				if (s.status === 'done') done = (done ?? 0) + 1
			}
			cursor = r.value.nextCursor ?? undefined
			pages++
		} while (cursor && pages < 6)
	} else {
		done = null
		planned = null
	}

	const distanceKm =
		goal.aimDetail && 'meters' in goal.aimDetail
			? goal.aimDetail.meters / 1000
			: null
	let pace: RaceEve['pace'] = null
	let paceWhy: string | null = null
	const g = await run<GoalOutput>(request, 'goal', {})
	const dist = g.ok ? (g.value.goal?.distanceKm ?? distanceKm) : distanceKm
	const target = g.ok ? g.value.goal?.targetTime : null
	if (target && dist) {
		pace = {
			secPerKm: target.seconds / dist,
			from: `måltiden din, ${target.text}`,
		}
	} else {
		const z = await run<ZonesOutput>(request, 'zones', {})
		const run1 = z.ok ? z.value.sports.find((s) => s.sport === 'run') : null
		const tp = run1?.thresholds.thresholdPace
		if (tp?.value) {
			// A race longer than ~1 hour opens a little slower than threshold.
			const factor = dist && dist > 15 ? 1.06 : dist && dist > 8 ? 1.02 : 1
			pace = {
				secPerKm: tp.value * factor,
				from: `terskelfarten din (${Math.floor(tp.value / 60)}:${String(Math.round(tp.value % 60)).padStart(2, '0')} /km)`,
			}
		} else {
			paceWhy = 'Jeg har ikke terskel for deg, så jeg kan ikke regne fart.'
		}
	}

	return {
		name: goal.name,
		daysToGo: goal.daysToGo ?? 0,
		done,
		planned,
		todaySession: today?.sessions[0]?.title ?? null,
		pace,
		paceWhy,
		distanceKm: dist ?? null,
	}
}
