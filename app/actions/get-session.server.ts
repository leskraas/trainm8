import { z } from 'zod/v4'
import {
	normalizeDeviceName,
	ORIGIN_PLATFORMS,
	originPlatformOf,
} from '#app/integrations/shared/origin-platform.ts'
import { prisma } from '#app/utils/db.server.ts'
import { ACTION_TITLE_LABELS } from '#app/utils/labels.ts'
import { ledgerSessionSelect } from '#app/utils/training.server.ts'
import { defineAction } from './define.ts'
import {
	athleteText,
	AthleteTextSchema,
	NumberReading,
	reading,
	unavailable,
} from './reading.ts'
import { refuse } from './refusals.ts'
import {
	SessionSummarySchema,
	sessionTitle,
	toSessionSummary,
} from './session-summary.server.ts'

const StepSchema = z.object({
	kind: z.string(),
	/** The prescribed intensity as authored (a zone, an RPE word), if any. */
	intensity: z.string().nullable(),
	durationS: NumberReading(),
	distanceM: NumberReading(),
	/** Prescribed sets, for a lifting step. */
	sets: NumberReading(),
})

/**
 * One session (ADR 0092, "The first slice"): its summary, the prescription,
 * where the recording came from, the athlete's RPE and their Session Log.
 *
 * The log crosses as the athlete's text, never in trainm8's voice; provider
 * text (activity names, `rawJson`) never crosses (ADR 0092 §7). RPE and the
 * log are health data: Phase 0 serves them on the owner's own dev token, and
 * the per-purpose consent gates them before anyone else connects (ADR 0092,
 * Open for the owner 1).
 */
export const getSessionAction = defineAction({
	name: 'get_session',
	revision: 1,
	kind: 'read',
	callers: ['web', 'mcp', 'agent'],
	title: ACTION_TITLE_LABELS.get_session,
	description:
		'One training session: planned against actual, the prescribed workout, where the recording came from, the athlete-reported RPE and their own session log. Every number is a Reading: either available with its value, or unavailable with a reason; never treat an unavailable reading as zero.',
	input: z.object({ sessionId: z.string().min(1) }),
	output: SessionSummarySchema.extend({
		workout: z
			.object({
				title: SessionSummarySchema.shape.title,
				blocks: z.array(
					z.object({
						repeatCount: NumberReading(),
						steps: z.array(StepSchema),
					}),
				),
			})
			.nullable(),
		recording: z
			.object({
				originPlatform: z.enum(ORIGIN_PLATFORMS),
				device: z.string().nullable(),
			})
			.nullable(),
		rpe: NumberReading(),
		log: AthleteTextSchema.nullable(),
	}),
	async run(ctx, { sessionId }) {
		const session = await prisma.workoutSession.findFirst({
			where: { id: sessionId, userId: ctx.userId },
			select: {
				...ledgerSessionSelect,
				sessionLog: { select: { id: true, rpe: true, content: true } },
				recording: {
					select: {
						...ledgerSessionSelect.recording.select,
						originPlatform: true,
						deviceName: true,
						aliases: { select: { originPlatform: true } },
					},
				},
			},
		})
		if (!session) return refuse('not-found')

		const { recording, workout, sessionLog } = session
		const bindingSet = recording
			? [
					...new Set([
						originPlatformOf(recording.originPlatform),
						...recording.aliases.map((a) => originPlatformOf(a.originPlatform)),
					]),
				]
			: []
		// Plan-side, so it binds to nothing.
		const planned = (value: number | null) =>
			reading(value ?? unavailable('not-resolved'), [], ctx)
		return {
			...toSessionSummary(session, bindingSet, ctx),
			workout: workout
				? {
						title: sessionTitle(session),
						blocks: workout.blocks.map((block) => ({
							repeatCount: planned(block.repeatCount),
							steps: block.steps.map((step) => ({
								kind: step.kind,
								intensity: step.intensity ?? null,
								durationS: planned(step.durationSec),
								distanceM: planned(step.distanceM),
								sets: planned(step.sets.length > 0 ? step.sets.length : null),
							})),
						})),
					}
				: null,
			recording: recording
				? {
						originPlatform: originPlatformOf(recording.originPlatform),
						device: normalizeDeviceName(recording.deviceName),
					}
				: null,
			// Health data (Art. 9): consent gating for rpe and the log is owed by
			// #639 H5 (#549). The athlete's own report, so it binds to nothing.
			rpe: reading(sessionLog?.rpe ?? unavailable('not-logged'), [], ctx),
			log: sessionLog?.content ? athleteText(sessionLog.content) : null,
		}
	},
})
