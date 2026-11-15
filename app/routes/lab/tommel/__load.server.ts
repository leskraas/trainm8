import { redirect } from 'react-router'
import {
	type AthleteOutput,
	type PlanOutput,
	type ProgressOutput,
	type ProposalsOutput,
	type RecordingsOutput,
	type SessionCard,
	type SessionOutput,
	type SessionsOutput,
	type TodayOutput,
	type WeekOutput,
	type ZonesOutput,
} from '#app/lab/engine/reads.types.ts'
import { runCapability } from '#app/lab/engine/registry.server.ts'
import {
	type LinkOptionsOutput,
	type StrengthSessionOutput,
} from '#app/lab/engine/sessions.types.ts'
import { type GoalOutput } from '#app/lab/engine/setup.types.ts'
import { BASE } from './__api.ts'
import { addDays } from './__format.ts'
import { type RoData } from './__ro-cards.tsx'
import { pickMain } from './__session.tsx'

type CapName = Parameters<typeof runCapability>[1]

async function read<O>(
	request: Request,
	name: CapName,
	input: unknown = {},
): Promise<O | null> {
	const r = await runCapability(request, name, input)
	return r.ok ? (r.value as O) : null
}

/** Who is here; sends a new athlete to getting started. */
export async function athleteOrStart(request: Request): Promise<AthleteOutput> {
	const me = await runCapability(request, 'athlete', {})
	if (!me.ok) throw new Response(me.message, { status: 500 })
	const a = me.value as AthleteOutput
	if (!a.setup.complete) throw redirect(`${BASE}/oppstart`)
	return a
}

/** Sessions of the last four weeks for Status, newest first, past only. */
export async function statusSessions(
	request: Request,
	today: string,
	weeksBack = 4,
) {
	const from = addDays(today, -7 * weeksBack + 1)
	const all: SessionCard[] = []
	let cursor: string | undefined
	for (let page = 0; page < 5; page++) {
		const r = await read<SessionsOutput>(request, 'sessions', {
			from,
			to: today,
			limit: 100,
			...(cursor ? { cursor } : {}),
		})
		if (!r) break
		all.push(...r.sessions)
		if (!r.nextCursor) break
		cursor = r.nextCursor
	}
	return all
		.filter((s) => !(s.date === today && s.status === 'planned'))
		.reverse()
}

export async function loadRo(request: Request) {
	const athlete = await athleteOrStart(request)
	const today = await read<TodayOutput>(request, 'today')
	if (!today)
		throw new Response('Fikk ikke hentet dagen i dag.', { status: 500 })
	const t = today.date
	const main = pickMain(today.sessions)
	const strengthToday = today.sessions.find(
		(s) => s.sport === 'strength' && s.status === 'planned',
	)
	const eve = athlete.goal?.kind === 'event' && athlete.goal.daysToGo === 1
	const [
		proposals,
		progress,
		plan,
		week,
		lastWeek,
		recentR,
		recs,
		sessions,
		mainDetail,
		strength,
		goal,
		zones,
	] = await Promise.all([
		read<ProposalsOutput>(request, 'proposals'),
		read<ProgressOutput>(request, 'progress', { weeks: 12 }),
		read<PlanOutput>(request, 'plan'),
		read<WeekOutput>(request, 'week'),
		read<WeekOutput>(request, 'week', { date: addDays(t, -7) }),
		read<SessionsOutput>(request, 'sessions', { from: addDays(t, -2), to: t }),
		read<RecordingsOutput>(request, 'recordings', { limit: 10 }),
		statusSessions(request, t),
		main
			? read<SessionOutput>(request, 'session', { sessionId: main.id })
			: Promise.resolve(null),
		strengthToday
			? read<StrengthSessionOutput>(request, 'strength_session', {
					sessionId: strengthToday.id,
				})
			: Promise.resolve(null),
		eve ? read<GoalOutput>(request, 'goal') : Promise.resolve(null),
		eve ? read<ZonesOutput>(request, 'zones') : Promise.resolve(null),
	])
	const recent: SessionCard[] = recentR?.sessions ?? []
	const doneRecent = recent
		.filter((s) => s.status === 'done' && s.date >= addDays(t, -1))
		.slice(-3)
	const unlinked = (recs?.recordings ?? [])
		.filter((r) => !r.linkedToPlan && r.date >= addDays(t, -2))
		.slice(0, 2)
	const [details, linkOpts] = await Promise.all([
		Promise.all(
			doneRecent.map((s) =>
				read<SessionOutput>(request, 'session', { sessionId: s.id }),
			),
		),
		Promise.all(
			unlinked.map((r) =>
				read<LinkOptionsOutput>(request, 'link_options', { recordingId: r.id }),
			),
		),
	])
	const ro: RoData = {
		athlete,
		today,
		proposals,
		recent,
		details: details.filter((x): x is SessionOutput => !!x),
		links: unlinked.map((rec, i) => ({
			rec,
			options: linkOpts[i]?.options ?? [],
		})),
		week,
		lastWeek,
		goal,
		zones,
		strength,
	}
	return { ro, main: mainDetail, progress, plan, sessions }
}
