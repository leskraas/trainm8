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
import { type DisciplineThresholdMap } from '#app/utils/intensity-target.ts'
import { buildReviewComparison } from '#app/utils/session-review.ts'
import {
	getDisciplineThresholds,
	type LedgerSession,
} from '#app/utils/training.server.ts'
import {
	deriveLedgerStatus,
	getSessionDiscipline,
} from '#app/utils/training.ts'
import { type RunCtx } from './define.ts'
import { sessionPath } from './paths.ts'
import {
	athleteText,
	AthleteTextSchema,
	gate,
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
	/**
	 * A stored title, as the athlete's text; the discipline in trainm8's
	 * words when there is none, or when a detected title's terms close it.
	 */
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

/**
 * The binding set of a session's Workout (ADR 0098 §1), the one answer every
 * read asks before it states anything of the prescription. An independent
 * prescription (authored, generated) binds to nothing. A Workout detected
 * from the session's Recording (`materializeDetectedStructure`) is that
 * Recording's data — its title, repeats, durations and intensities were
 * measured — so it binds to the Recording's set, adopted or not: adopting it
 * keeps the measured figures the athlete did not change.
 */
export function workoutBindingSet(
	session: { source: string },
	recordingBindingSet: readonly OriginPlatform[],
): readonly OriginPlatform[] {
	return session.source === 'detected' ? recordingBindingSet : []
}

/**
 * A planned figure, as a Reading. It binds to `bindingSet`, the Workout's
 * ({@link workoutBindingSet}): nothing for an independent prescription.
 */
export function plannedReading(
	metric: PlannedMetric<number>,
	ctx: ReadingContext,
	{
		zeroIsUnresolved = false,
		bindingSet = [],
	}: {
		zeroIsUnresolved?: boolean
		bindingSet?: readonly OriginPlatform[]
	} = {},
): Reading<number> {
	if (metric.status === 'unavailable') {
		return reading(unavailable(metric.reason), bindingSet, ctx)
	}
	// A Planned TSS of zero is one that did not resolve (`week-volumes.ts`
	// reads it the same way), so it is never sent as a zero.
	return zeroIsUnresolved && metric.value <= 0
		? reading(unavailable('not-resolved'), bindingSet, ctx)
		: reading(metric.value, bindingSet, ctx)
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

export function sessionTitle(
	session: Pick<
		LedgerSession,
		'source' | 'adoptedAt' | 'workout' | 'recording'
	>,
	/** The Workout's binding set ({@link workoutBindingSet}). */
	bindingSet: readonly OriginPlatform[],
	ctx: ReadingContext,
): SessionSummary['title'] {
	const { workout } = session
	const disciplineLabel = () => nbDisciplineLabel(getSessionDiscipline(session))
	if (!workout) return disciplineLabel()
	// A detected title is made of the measurements ("4 × 6 min"): it passes
	// the gate like any of them, and where the terms close it the discipline
	// stands in.
	if (session.source === 'detected' && gate(bindingSet, ctx)) {
		return disciplineLabel()
	}
	// Ownership does not say who wrote the title: a title-only edit leaves a
	// machine's session unadopted. So every stored title crosses as the
	// athlete's, marked and capped — the safe side of not knowing.
	return athleteText(workout.title, TITLE_MAX)
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
	/** What a distance step's pace resolves against (#615). */
	thresholds: DisciplineThresholdMap,
	ctx: RunCtx,
): SessionSummary {
	const status = sessionStatus(session, ctx.now, ctx.timezone)
	const review = buildReviewComparison(session, thresholds)
	const prescribed = workoutBindingSet(session, bindingSet)
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
		title: sessionTitle(session, prescribed, ctx),
		status,
		owner: sessionOwner(session),
		planned: {
			durationS: plannedReading(review.duration.plannedRead, ctx, {
				bindingSet: prescribed,
			}),
			distanceM: plannedReading(review.distance.plannedRead, ctx, {
				bindingSet: prescribed,
			}),
			tss: plannedReading(review.tss.plannedRead, ctx, {
				zeroIsUnresolved: true,
				bindingSet: prescribed,
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
	const [bindingSets, thresholds] = await Promise.all([
		readRecordingBindingSets(
			ctx.userId,
			sessions.map((s) => s.id),
		),
		getDisciplineThresholds(ctx.userId),
	])
	return sessions.map((session) =>
		toSessionSummary(
			session,
			bindingSets.get(session.id) ?? [],
			thresholds,
			ctx,
		),
	)
}
