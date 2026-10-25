import { z } from 'zod/v4'
import {
	ORIGIN_PLATFORMS,
	originPlatformOf,
} from '#app/integrations/shared/origin-platform.ts'
import { prisma } from '#app/utils/db.server.ts'
import { parseAuthoredIntensity } from '#app/utils/intensity-target.ts'
import { ACTION_TITLE_LABELS } from '#app/utils/labels.ts'
import {
	getDisciplineThresholds,
	ledgerSessionSelect,
} from '#app/utils/training.server.ts'
import {
	type IntensityTarget,
	RACE_ANCHORS,
} from '#app/utils/workout-schema.ts'
import { defineAction } from './define.ts'
import {
	athleteText,
	AthleteTextSchema,
	NumberReading,
	type Reading,
	reading,
	type ReadingContext,
	unavailable,
} from './reading.ts'
import { refuse } from './refusals.ts'
import {
	SessionSummarySchema,
	sessionTitle,
	toSessionSummary,
} from './session-summary.server.ts'

/** A zone label the athlete typed is capped like a title. */
const ZONE_LABEL_MAX = 200

/** The Intensity Target kinds that carry numbers (`IntensityTargetSchema`). */
const NUMERIC_INTENSITY_KINDS = [
	'rpe',
	'hrBpm',
	'hrPct',
	'power',
	'powerPct',
	'pace',
	'pacePct',
	'lactate',
	'racePace',
] as const satisfies Exclude<IntensityTarget['kind'], 'zoneLabel'>[]

/** What a percentage target is a percentage of, or a race pace's distance. */
const INTENSITY_REFERENCES = [
	'max',
	'lthr',
	'ftp',
	'map',
	'cp',
	...RACE_ANCHORS,
] as const

/**
 * A step's authored Intensity Target (ADR 0007), typed so no number crosses
 * bare and a zone label the athlete typed crosses as theirs (ADR 0092 §6–§7).
 */
const IntensitySchema = z
	.union([
		z.object({
			kind: z.literal('zoneLabel'),
			label: AthleteTextSchema,
		}),
		z.object({
			kind: z.enum(NUMERIC_INTENSITY_KINDS),
			of: z.enum(INTENSITY_REFERENCES).nullable(),
			min: NumberReading().nullable(),
			max: NumberReading().nullable(),
		}),
	])
	.describe(
		'The prescribed intensity. min and max are in the unit of kind: rpe 1-10; hrBpm beats per minute; power watts; pace seconds per km; lactate mmol/L; hrPct and powerPct percent of the threshold named by of (max, lthr; ftp, map, cp); pacePct percent of threshold speed; racePace percent of race speed at the distance named by of. A null bound was not authored.',
	)

type Intensity = z.infer<typeof IntensitySchema>

function toIntensity(
	stored: string | null,
	ctx: ReadingContext,
): Intensity | null {
	const target = parseAuthoredIntensity(stored)
	if (!target) return null
	// Plan-side, so it binds to nothing.
	const bound = (value: number | undefined): Reading<number> | null =>
		value === undefined ? null : reading(value, [], ctx)
	switch (target.kind) {
		case 'zoneLabel':
			return {
				kind: 'zoneLabel',
				label: athleteText(target.label, ZONE_LABEL_MAX),
			}
		case 'rpe':
		case 'hrBpm':
			return {
				kind: target.kind,
				of: null,
				min: bound(target.min),
				max: bound(target.max),
			}
		case 'hrPct':
			return {
				kind: target.kind,
				of: target.ref,
				min: bound(target.minPct),
				max: bound(target.maxPct),
			}
		case 'powerPct':
			return {
				kind: target.kind,
				// Absent reads as `ftp` (`IntensityTargetSchema`).
				of: target.ref ?? 'ftp',
				min: bound(target.minPct),
				max: bound(target.maxPct),
			}
		case 'pacePct':
			return {
				kind: target.kind,
				of: null,
				min: bound(target.minPct),
				max: bound(target.maxPct),
			}
		case 'power':
			return {
				kind: target.kind,
				of: null,
				min: bound(target.minW),
				max: bound(target.maxW),
			}
		case 'pace':
			return {
				kind: target.kind,
				of: null,
				min: bound(target.minSecPerKm),
				max: bound(target.maxSecPerKm),
			}
		case 'lactate':
			return {
				kind: target.kind,
				of: null,
				min: bound(target.minMmol),
				max: bound(target.maxMmol),
			}
		case 'racePace':
			return {
				kind: target.kind,
				of: target.event,
				min: bound(target.minPct),
				max: bound(target.maxPct),
			}
	}
}

const StepSchema = z.object({
	kind: z.string(),
	/** The prescribed intensity as authored, if any. */
	intensity: IntensitySchema.nullable(),
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
 * text (activity names, `rawJson`, the device name) never crosses (ADR 0092
 * §7): the recording says only its Origin Platform, and the credit its
 * figures owe names the source (ADR 0098 §3). RPE and the
 * log are health data: Phase 0 serves them on the owner's own dev token, and
 * the per-purpose consent gates them before anyone else connects (ADR 0092,
 * Owner's decisions 1; #639 H5).
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
			.object({ originPlatform: z.enum(ORIGIN_PLATFORMS) })
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
			...toSessionSummary(
				session,
				bindingSet,
				await getDisciplineThresholds(ctx.userId),
				ctx,
			),
			workout: workout
				? {
						title: sessionTitle(session),
						blocks: workout.blocks.map((block) => ({
							repeatCount: planned(block.repeatCount),
							steps: block.steps.map((step) => ({
								kind: step.kind,
								intensity: toIntensity(step.intensity, ctx),
								durationS: planned(step.durationSec),
								distanceM: planned(step.distanceM),
								sets: planned(step.sets.length > 0 ? step.sets.length : null),
							})),
						})),
					}
				: null,
			recording: recording
				? { originPlatform: originPlatformOf(recording.originPlatform) }
				: null,
			// Health data (Art. 9): consent gating for rpe and the log is owed by
			// #639 H5 (#549). The athlete's own report, so it binds to nothing.
			rpe: reading(sessionLog?.rpe ?? unavailable('not-logged'), [], ctx),
			log: sessionLog?.content ? athleteText(sessionLog.content) : null,
		}
	},
})
