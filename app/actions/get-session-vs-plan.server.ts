import { z } from 'zod/v4'
import { localDate } from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import { ACTION_TITLE_LABELS } from '#app/utils/labels.ts'
import { buildVsLastComparison } from '#app/utils/session-comparison.ts'
import { buildReviewComparison } from '#app/utils/session-review.ts'
import { resolveStructureAdherence } from '#app/utils/session-structure-adherence.ts'
import {
	getDisciplineThresholds,
	getLastSimilarSession,
} from '#app/utils/training.server.ts'
import { defineAction } from './define.ts'
import {
	NumberReading,
	reading,
	readingSchema,
	unavailable,
	type Unavailable,
} from './reading.ts'
import { refuse } from './refusals.ts'
import {
	plannedReading,
	readRecordingBindingSets,
} from './session-summary.server.ts'
import { type UnavailableReason } from './vocabulary.ts'

const PlannedActual = z.object({
	planned: NumberReading(),
	actual: NumberReading(),
})

/** The Adherence Band's tone (ADR 0019): actual TSS against Planned TSS. */
const ADHERENCE_BANDS = ['under', 'on-target', 'over'] as const

/**
 * How one session went against its plan (ADR 0092, "The first slice"): TSS,
 * time and distance planned against actual, the Adherence Band, Structure
 * Adherence (ADR 0034) and the change since the last similar session.
 *
 * The same derivations the Workout Detail View renders —
 * `buildReviewComparison`, `resolveStructureAdherence` (lifted out of the
 * route for this), `buildVsLastComparison` — so the screen and a model never
 * disagree about one session.
 */
export const getSessionVsPlanAction = defineAction({
	name: 'get_session_vs_plan',
	revision: 1,
	kind: 'read',
	callers: ['web', 'mcp', 'agent'],
	title: ACTION_TITLE_LABELS.get_session_vs_plan,
	description:
		'How one training session went against its plan: TSS, duration (seconds) and distance (metres) planned against actual, the adherence band, whether the recorded interval structure matched the prescription, and the change since the last session of the same kind. Quote unavailable readings by their reason, never as zero.',
	input: z.object({ sessionId: z.string().min(1) }),
	output: z.object({
		tss: PlannedActual,
		durationS: PlannedActual,
		distanceM: PlannedActual,
		band: readingSchema(z.enum(ADHERENCE_BANDS)),
		/** `not-verifiable` is an Unavailable Metric, never a miss (ADR 0034). */
		structure: readingSchema(z.enum(['as-prescribed', 'diverged'])),
		vsLast: z
			.object({
				sessionId: z.string(),
				date: z.string(),
				deltas: z.object({ tss: NumberReading(), durationS: NumberReading() }),
			})
			.nullable(),
	}),
	async run(ctx, { sessionId }) {
		const session = await prisma.workoutSession.findFirst({
			where: { id: sessionId, userId: ctx.userId },
			select: {
				id: true,
				status: true,
				scheduledAt: true,
				source: true,
				adoptedAt: true,
				tssValue: true,
				plannedTssValue: true,
				workout: {
					select: {
						discipline: true,
						archetype: true,
						blocks: {
							orderBy: { orderIndex: 'asc' },
							select: {
								repeatCount: true,
								seriesRepeatCount: true,
								steps: {
									orderBy: { orderIndex: 'asc' },
									select: {
										kind: true,
										discipline: true,
										intensity: true,
										durationSec: true,
										distanceM: true,
									},
								},
							},
						},
					},
				},
				recording: {
					select: {
						durationSec: true,
						distanceM: true,
						detection: { select: { structureJson: true } },
					},
				},
			},
		})
		if (!session) return refuse('not-found')

		const lastSimilar =
			session.status === 'completed' && session.workout
				? await getLastSimilarSession(
						ctx.userId,
						{
							discipline: session.workout.discipline,
							archetype: session.workout.archetype,
						},
						session.scheduledAt,
					)
				: null
		const bindingSets = await readRecordingBindingSets(
			ctx.userId,
			lastSimilar ? [session.id, lastSimilar.id] : [session.id],
		)
		const own = bindingSets.get(session.id) ?? []
		const { recording } = session
		const missing: UnavailableReason = recording
			? 'not-resolved'
			: 'no-recording'
		// The Recording's own figures: they owe its source line, not the
		// derived one (ADR 0098 §3).
		const actual = (value: number | null | undefined) =>
			reading(value ?? unavailable(missing), own, ctx, { origin: 'recording' })

		const review = buildReviewComparison(
			session,
			await getDisciplineThresholds(ctx.userId),
		)
		const plannedTss = plannedReading(review.tss.plannedRead, ctx, {
			zeroIsUnresolved: true,
		})
		const actualTss = reading(
			session.tssValue ??
				unavailable(
					recording || session.status === 'completed'
						? 'not-resolved'
						: 'no-recording',
				),
			recording ? own : [],
			ctx,
		)
		// The band reads both sides, so it is unavailable for whichever is.
		const bandReason: UnavailableReason =
			plannedTss.status === 'unavailable'
				? plannedTss.reason
				: actualTss.status === 'unavailable'
					? actualTss.reason
					: 'not-resolved'
		const band = reading(
			review.tss.band?.tone ?? unavailable(bandReason),
			recording ? own : [],
			ctx,
		)

		const verdict = resolveStructureAdherence(session)
		const structure = reading<'as-prescribed' | 'diverged'>(
			verdict === 'as-prescribed' || verdict === 'diverged'
				? verdict
				: unavailable(
						verdict === 'not-verifiable'
							? 'structure-not-verifiable'
							: recording
								? 'not-resolved'
								: 'no-recording',
					),
			own,
			ctx,
		)

		const vs = buildVsLastComparison(session, lastSimilar)
		const both = [
			...new Set([...own, ...(bindingSets.get(lastSimilar?.id ?? '') ?? [])]),
		]
		const delta = (change: number | null): number | Unavailable =>
			change ?? unavailable('not-resolved')

		return {
			tss: { planned: plannedTss, actual: actualTss },
			durationS: {
				planned: plannedReading(review.duration.plannedRead, ctx),
				actual: actual(recording?.durationSec),
			},
			distanceM: {
				planned: plannedReading(review.distance.plannedRead, ctx),
				actual: actual(recording?.distanceM),
			},
			band,
			structure,
			vsLast: vs
				? {
						sessionId: vs.previousSessionId,
						date: localDate(vs.previousDate, ctx.timezone),
						deltas: {
							tss: reading(delta(vs.tss.change), both, ctx),
							durationS: reading(delta(vs.durationSec.change), both, ctx),
						},
					}
				: null,
		}
	},
})
