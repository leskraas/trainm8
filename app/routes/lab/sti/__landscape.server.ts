import { type SessionCard } from '#app/lab/engine/reads.types.ts'
import { runCapability } from '#app/lab/engine/registry.server.ts'
import { addDays, daysBetween } from './__ui.tsx'

/**
 * Everything the landscape needs, in one go: who, today, the whole plan, the
 * sessions along the path, proposals and progress.
 */
export async function loadLandscape(request: Request) {
	const me = await runCapability(request, 'athlete', {})
	if (!me.ok) return { kind: 'error' as const, message: me.message }
	const athlete = me.value
	if (!athlete.setup.complete) return { kind: 'start' as const, athlete }

	const [today, plan, proposals, progress] = await Promise.all([
		runCapability(request, 'today', {}),
		runCapability(request, 'plan', {}),
		runCapability(request, 'proposals', {}),
		runCapability(request, 'progress', { weeks: 26 }),
	])
	if (!today.ok) return { kind: 'error' as const, message: today.message }

	const day = athlete.today
	const p = plan.ok ? plan.value.plan : null
	let from = addDays(day, -21)
	let to = addDays(day, 35)
	if (p) {
		if (p.firstWeek < from) from = p.firstWeek
		const end = addDays(p.lastWeek, 6)
		if (end > to) to = end
		const goalDay = p.goal.date
		if (goalDay && goalDay > to) to = goalDay
	}
	if (daysBetween(from, to) > 366) from = addDays(to, -366)

	const sessions: SessionCard[] = []
	let cursor: string | undefined
	let sessionsError: string | null = null
	for (let page = 0; page < 6; page++) {
		const r = await runCapability(request, 'sessions', {
			from,
			to,
			limit: 100,
			...(cursor ? { cursor } : {}),
		})
		if (!r.ok) {
			sessionsError = r.message
			break
		}
		sessions.push(...r.value.sessions)
		if (!r.value.nextCursor) break
		cursor = r.value.nextCursor
	}

	return {
		kind: 'path' as const,
		athlete,
		today: today.value,
		plan: plan.ok ? plan.value : null,
		planError: plan.ok ? null : plan.message,
		proposals: proposals.ok ? proposals.value : null,
		progress: progress.ok ? progress.value : null,
		progressError: progress.ok ? null : progress.message,
		sessions,
		sessionsError,
		range: { from, to },
	}
}

export type LandscapeData = Awaited<ReturnType<typeof loadLandscape>>
export type PathData = Extract<LandscapeData, { kind: 'path' }>
