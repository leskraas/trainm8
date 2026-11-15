import { actionCtx } from '#app/actions/context.server.ts'
import { runAction } from '#app/actions/run.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { demoSnapshot } from './demo.ts'
import {
	type LabSession,
	type LabSnapshot,
	type LabTrack,
	shiftDay,
} from './snapshot.ts'

type AnyReading = { status: 'available'; value: unknown } | { status: string }

function num(r: AnyReading | undefined): number | null {
	if (r && r.status === 'available' && 'value' in r) {
		return typeof r.value === 'number' ? r.value : null
	}
	return null
}

function text(t: string | { text: string } | null | undefined): string | null {
	if (t == null) return null
	return typeof t === 'string' ? t : t.text
}

function track(t: {
	discipline: string
	currency: string
	target: AnyReading
	planned: AnyReading
	actual: AnyReading
}): LabTrack {
	return {
		discipline: t.discipline,
		currency: t.currency,
		target: num(t.target),
		planned: num(t.planned),
		actual: num(t.actual),
	}
}

function done<T>(result: { outcome: string; value?: T }): T | null {
	return result.outcome === 'done' ? (result.value ?? null) : null
}

/**
 * Reads the Lab Snapshot for the signed-in athlete (redirects to login
 * otherwise). Falls back to the demo athlete when the athlete has no sessions
 * and no season, or when the URL carries `?demo=1`.
 */
export async function readLabSnapshot(request: Request): Promise<LabSnapshot> {
	const userId = await requireUserId(request)
	const url = new URL(request.url)
	const ctx = await actionCtx(request, { userId, caller: 'web' })
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { name: true, username: true },
	})
	const name = user?.name ?? user?.username ?? null

	if (url.searchParams.get('demo') === '1') {
		return demoSnapshot(ctx.now, ctx.timezone, name)
	}

	const todayResult = done(await runAction(ctx, 'get_today', {}))
	const today = todayResult?.date ?? ctx.now.toISOString().slice(0, 10)

	const [past, future, season, load] = await Promise.all([
		runAction(ctx, 'list_sessions', {
			from: shiftDay(today, -27),
			to: today,
		}),
		runAction(ctx, 'list_sessions', {
			from: shiftDay(today, 1),
			to: shiftDay(today, 28),
		}),
		runAction(ctx, 'get_season', {}),
		runAction(ctx, 'get_training_load', { weeks: 12 }),
	])

	const sessions: LabSession[] = [
		...(done(past)?.sessions ?? []),
		...(done(future)?.sessions ?? []),
	].map((s) => ({
		id: s.id,
		date: s.date,
		discipline: s.discipline,
		title: text(s.title) ?? s.discipline,
		status: s.status,
		owner: s.owner,
		planned: {
			durationS: num(s.planned.durationS),
			distanceM: num(s.planned.distanceM),
			tss: num(s.planned.tss),
		},
		actual: {
			durationS: num(s.actual.durationS),
			distanceM: num(s.actual.distanceM),
			tss: num(s.actual.tss),
		},
		link: new URL(s.link).pathname,
	}))
	sessions.sort((a, b) => a.date.localeCompare(b.date))

	const seasonValue = done(season)
	const loadValue = done(load)

	if (sessions.length === 0 && !seasonValue?.plan) {
		return demoSnapshot(ctx.now, ctx.timezone, name)
	}

	return {
		source: 'athlete',
		athlete: { name, timezone: ctx.timezone },
		today,
		load: {
			ctl: num(todayResult?.load.ctl),
			atl: num(todayResult?.load.atl),
			tsb: num(todayResult?.load.tsb),
		},
		week: (todayResult?.week.tracks ?? []).map(track),
		openProposals: num(todayResult?.openProposals),
		sessions,
		season: seasonValue?.plan
			? {
					name: text(seasonValue.plan.name) ?? 'Sesong',
					event: seasonValue.plan.event
						? {
								name: seasonValue.plan.event.name.text,
								date: seasonValue.plan.event.date,
							}
						: null,
					weeks: seasonValue.weeks.map((w) => ({
						weekKey: w.weekKey,
						phase: text(w.phase),
						tracks: w.tracks.map(track),
					})),
				}
			: null,
		loadHistory: {
			days: (loadValue?.days ?? []).map((d) => ({
				date: d.date,
				tss: num(d.tss),
				ctl: num(d.ctl),
				atl: num(d.atl),
				tsb: num(d.tsb),
			})),
			weeks: (loadValue?.weeks ?? []).map((w) => ({
				weekKey: w.weekKey,
				plannedTss: num(w.plannedTss),
				actualTss: num(w.actualTss),
				adherence:
					w.adherence.status === 'available' ? w.adherence.value : null,
			})),
		},
	}
}
