import { parseWithZod } from '@conform-to/zod'
import { data } from 'react-router'
import {
	localDate,
	mondayOfDay,
	weekMonday,
} from '#app/utils/athlete-calendar.ts'
import { getAthleteTimezone } from '#app/utils/athlete.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	QUICK_LOG_LABELS,
	QUICK_LOG_REFUSAL_LABELS,
} from '#app/utils/labels.ts'
import { trackForDiscipline } from '#app/utils/plan-outline/week-sum.ts'
import { getWeekVolumes } from '#app/utils/plan-outline/week-volumes.server.ts'
import { relativeWeekName } from '#app/utils/relative-week.ts'
import {
	type QuickLogEntry,
	logStrengthSession,
	readQuickLog,
} from '#app/utils/strength-quick-log.server.ts'
import {
	StrengthLogActionSchema,
	StrengthLogQuerySchema,
} from '#app/utils/strength-quick-log.ts'
import { createToastHeaders } from '#app/utils/toast.server.ts'
import { type Route } from './+types/strength-log.ts'

/**
 * The quick strength log under a strength session's row on I dag (#505
 * stories 83–84). Owner-scoped both ways: another athlete's session reads as
 * nothing and answers a post with 404.
 *
 * The read answers as data and never throws after auth — a fetcher's error
 * would reach home's own error boundary over a panel whose one-tap button
 * works without it (the post reads the plan on the server).
 */
export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const query = StrengthLogQuerySchema.safeParse(
		Object.fromEntries(new URL(request.url).searchParams),
	)
	if (!query.success) return { quickLog: null, failed: false }
	try {
		const timezone = await getAthleteTimezone(userId)
		return {
			quickLog: await readQuickLog(userId, query.data.sessionId, { timezone }),
			failed: false,
		}
	} catch (error) {
		console.error('[strength-log] the plan could not be read', error)
		return { quickLog: null, failed: true }
	}
}

/**
 * _Som planlagt_ or _Endre_: log the session and finish it. The toast says how
 * many sets went in and what that did to the week's done sets, so the number
 * the week header moves to is stated where the tap was.
 */
export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const submission = parseWithZod(await request.formData(), {
		schema: StrengthLogActionSchema,
	})
	if (submission.status !== 'success') {
		return data(
			{ submission: submission.reply(), result: null },
			{ status: 400 },
		)
	}
	const { sessionId } = submission.value
	const entry: QuickLogEntry =
		submission.value.intent === 'as-planned'
			? { kind: 'as-planned' }
			: { kind: 'edited', sets: submission.value.sets }
	const timezone = await getAthleteTimezone(userId)
	const now = new Date()
	const weekKey = await weekOf(userId, sessionId, timezone)
	const before = weekKey ? await doneSets(userId, weekKey, now) : null
	const result = await logStrengthSession(userId, sessionId, entry, {
		now,
		timezone,
	})
	if (!result.ok) {
		return data(
			{
				submission: submission.reply({
					formErrors: [QUICK_LOG_REFUSAL_LABELS[result.reason]],
				}),
				result,
			},
			{ status: result.reason === 'session-not-found' ? 404 : 409 },
		)
	}
	if (result.alreadyLogged) {
		return data({ submission: submission.reply(), result })
	}
	const after = weekKey ? await doneSets(userId, weekKey, now) : null
	const description = QUICK_LOG_LABELS.logged(
		result.loggedSets,
		weekKey && before != null && after != null
			? {
					name: relativeWeekName(weekKey, weekMonday(now, timezone)),
					before,
					after,
				}
			: null,
	)
	return data(
		{ submission: submission.reply(), result },
		{ headers: await createToastHeaders({ description, type: 'success' }) },
	)
}

/** The Training Week the athlete's session sits in, or null where it is not
 * theirs. */
async function weekOf(
	userId: string,
	sessionId: string,
	timezone: string,
): Promise<string | null> {
	const session = await prisma.workoutSession.findFirst({
		where: { id: sessionId, userId },
		select: { scheduledAt: true },
	})
	return session ? mondayOfDay(localDate(session.scheduledAt, timezone)) : null
}

/** The week's done working sets in the plan's strength track; null without
 * one, where the toast says only how many sets went in. */
async function doneSets(
	userId: string,
	weekKey: string,
	now: Date,
): Promise<number | null> {
	const track = trackForDiscipline(
		await getWeekVolumes(userId, { weekKey, now }),
		'strength',
	)
	return track ? (track.actual ?? 0) : null
}
