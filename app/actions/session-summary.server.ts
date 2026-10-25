/**
 * The **SessionSummary** every session-shaped read returns (ADR 0092, "The
 * first slice"): one planned or recorded session as a model may see it, with
 * every number a Reading through the provenance gate.
 *
 * Built on the same derivations the screens use — `deriveLedgerStatus`,
 * `sessionOwner`, and `buildReviewComparison` for planned against actual — so
 * a session reads the same to a model as on I dag.
 */

import { z } from 'zod/v4'
import {
	originPlatformOf,
	type OriginPlatform,
} from '#app/integrations/shared/origin-platform.ts'
import { localDate } from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import { nbDisciplineLabel } from '#app/utils/labels.ts'
import { type PlannedMetric } from '#app/utils/planned-discipline.ts'
import { SESSION_OWNERS, sessionOwner } from '#app/utils/session-ownership.ts'
import { buildReviewComparison } from '#app/utils/session-review.ts'
import { type LedgerSession } from '#app/utils/training.server.ts'
import {
	deriveLedgerStatus,
	getSessionDiscipline,
} from '#app/utils/training.ts'
import { type RunCtx } from './define.ts'
import { sessionPath } from './paths.ts'
import {
	athleteText,
	AthleteTextSchema,
	NumberReading,
	reading,
	type Reading,
	type ReadingContext,
	unavailable,
} from './reading.ts'

export const SESSION_STATUSES = [
	'planned',
	'done',
	'missed',
	'recording-only',
] as const

/** A workout title the athlete wrote stays theirs, capped like a name. */
const TITLE_MAX = 200

export const SessionSummarySchema = z.object({
	id: z.string(),
	/** `YYYY-MM-DD` in the Athlete Timezone. */
	date: z.string(),
	discipline: z.string(),
	/** The athlete's text when theirs; trainm8's words otherwise. */
	title: z.union([AthleteTextSchema, z.string()]),
	status: z.enum(SESSION_STATUSES),
	/** **Session Ownership**: whose session it is to change. */
	owner: z.enum(SESSION_OWNERS),
	planned: z.object({
		durationS: NumberReading(),
		distanceM: NumberReading(),
		tss: NumberReading(),
	}),
	actual: z.object({
		durationS: NumberReading(),
		distanceM: NumberReading(),
		tss: NumberReading(),
	}),
	/** A deep link to the session in trainm8. */
	link: z.string(),
})
export type SessionSummary = z.infer<typeof SessionSummarySchema>

/**
 * The Origin Platforms behind each session's Recording, aliases included
 * (ADR 0096 §3, ADR 0098 §1), for the sessions given. One query. A session
 * with no Recording is absent: its actuals bind to nothing recorded.
 */
export async function readRecordingBindingSets(
	userId: string,
	sessionIds: readonly string[],
): Promise<Map<string, OriginPlatform[]>> {
	if (sessionIds.length === 0) return new Map()
	const rows = await prisma.workoutSession.findMany({
		where: { userId, id: { in: [...sessionIds] }, recordingId: { not: null } },
		select: {
			id: true,
			recording: {
				select: {
					originPlatform: true,
					aliases: { select: { originPlatform: true } },
				},
			},
		},
	})
	return new Map(
		rows.flatMap((row) =>
			row.recording
				? [
						[
							row.id,
							[
								...new Set([
									originPlatformOf(row.recording.originPlatform),
									...row.recording.aliases.map((alias) =>
										originPlatformOf(alias.originPlatform),
									),
								]),
							],
						],
					]
				: [],
		),
	)
}

/** A planned figure, as a Reading: plan-side, so it binds to nothing. */
export function plannedReading(
	metric: PlannedMetric<number>,
	ctx: ReadingContext,
	{ zeroIsUnresolved = false }: { zeroIsUnresolved?: boolean } = {},
): Reading<number> {
	if (metric.status === 'unavailable') {
		return reading(unavailable(metric.reason), [], ctx)
	}
	// A Planned TSS of zero is one that did not resolve (`week-volumes.ts`
	// reads it the same way), so it is never sent as a zero.
	return zeroIsUnresolved && metric.value <= 0
		? reading(unavailable('not-resolved'), [], ctx)
		: reading(metric.value, [], ctx)
}

export function sessionStatus(
	session: Pick<LedgerSession, 'status' | 'scheduledAt' | 'workout'>,
	now: Date,
	timezone: string,
): SessionSummary['status'] {
	if (session.workout == null) return 'recording-only'
	const status = deriveLedgerStatus(session, now, timezone)
	return status === 'completed' ? 'done' : status
}

/** Whether the athlete wrote the session's text: their own, or adopted. */
function athleteWroteIt(session: {
	source: string
	adoptedAt: Date | null
}): boolean {
	return session.source === 'authored' || session.adoptedAt != null
}

export function sessionTitle(
	session: Pick<
		LedgerSession,
		'source' | 'adoptedAt' | 'workout' | 'recording'
	>,
): SessionSummary['title'] {
	const { workout } = session
	if (!workout) return nbDisciplineLabel(getSessionDiscipline(session))
	return athleteWroteIt(session)
		? athleteText(workout.title, TITLE_MAX)
		: workout.title
}

/**
 * One ledger row as a SessionSummary. `bindingSet` is the session's
 * Recording's platforms (from {@link readRecordingBindingSets}); its actuals
 * pass the gate with it, so a Strava-recorded run's numbers never reach a
 * model while its plan still does.
 */
export function toSessionSummary(
	session: LedgerSession,
	bindingSet: readonly OriginPlatform[],
	ctx: RunCtx,
): SessionSummary {
	const status = sessionStatus(session, ctx.now, ctx.timezone)
	const review = buildReviewComparison(session)
	const { recording } = session
	const missing = recording ? 'not-resolved' : 'no-recording'
	// The Recording's own figures: they owe its source line, not the derived one.
	const recorded = (value: number | null | undefined) =>
		reading(value ?? unavailable(missing), bindingSet, ctx, {
			origin: 'recording',
		})
	return {
		id: session.id,
		date: localDate(session.scheduledAt, ctx.timezone),
		discipline: getSessionDiscipline(session),
		title: sessionTitle(session),
		status,
		owner: sessionOwner(session),
		planned: {
			durationS: plannedReading(review.duration.plannedRead, ctx),
			distanceM: plannedReading(review.distance.plannedRead, ctx),
			tss: plannedReading(review.tss.plannedRead, ctx, {
				zeroIsUnresolved: true,
			}),
		},
		actual: {
			durationS: recorded(recording?.durationSec),
			distanceM: recorded(recording?.distanceM),
			// TSS may come from the athlete's RPE with no Recording at all; then
			// it is athlete-entered and binds to nothing recorded.
			tss: reading(
				session.tssValue ??
					unavailable(
						recording || status === 'done' ? 'not-resolved' : 'no-recording',
					),
				recording ? bindingSet : [],
				ctx,
			),
		},
		link: ctx.link(sessionPath(session.id)),
	}
}

/** Many ledger rows as SessionSummaries, with their binding sets in one query. */
export async function toSessionSummaries(
	sessions: readonly LedgerSession[],
	ctx: RunCtx,
): Promise<SessionSummary[]> {
	const bindingSets = await readRecordingBindingSets(
		ctx.userId,
		sessions.map((s) => s.id),
	)
	return sessions.map((session) =>
		toSessionSummary(session, bindingSets.get(session.id) ?? [], ctx),
	)
}
