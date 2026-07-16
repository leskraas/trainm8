import { type Prisma } from '@prisma/client'
import { z } from 'zod'
import { type ActivityStream, parseStoredStream } from './activity-stream.ts'
import { addDays, weekBoundsUTC, weekMonday } from './athlete-calendar.ts'
import { type PlanPhaseSpec } from './dashboard.ts'
import { prisma } from './db.server.ts'
import { type DisciplineThresholdMap } from './intensity-target.ts'
import {
	weeklyAdherence,
	weeklyLoad,
	type WeeklyAdherence,
	type WeeklyLoad,
} from './load/adherence.ts'

const stepSelect = {
	id: true,
	kind: true,
	notes: true,
	discipline: true,
	intensity: true,
	intensityHrMin: true,
	intensityHrMax: true,
	intensityPowerMin: true,
	intensityPowerMax: true,
	intensityPaceMin: true,
	intensityPaceMax: true,
	orderIndex: true,
	durationSec: true,
	distanceM: true,
	exerciseId: true,
	restBetweenSetsSec: true,
	exercise: {
		select: {
			id: true,
			name: true,
			primaryMuscle: true,
			equipment: true,
		},
	},
	sets: {
		orderBy: { orderIndex: 'asc' as const },
		select: {
			id: true,
			kind: true,
			orderIndex: true,
			weightKg: true,
			pct1RM: true,
			reps: true,
			durationSec: true,
		},
	},
} satisfies Prisma.WorkoutStepSelect

/**
 * An Event is still upcoming when it hasn't finished yet: a multi-day Event
 * counts until its end date passes; a single-day Event (no end date) until its
 * start date does.
 */
function notYetPast(now: Date): Prisma.EventWhereInput {
	return {
		OR: [{ endDate: null, startDate: { gte: now } }, { endDate: { gte: now } }],
	}
}

/**
 * A Plan Outline phase reduced to what the home surface draws: the arc
 * essentials (name + week span, ADR 0018) plus the phase's prescribed
 * weekly-load pattern in hours, which the Fitness Projection replays forward to
 * race day (#132). `weeklyLoadHours` is null when the stored Outline predates or
 * omits the pattern, so the projection can degrade to Unavailable rather than
 * guess.
 */
export type ActivePlanPhase = PlanPhaseSpec & {
	weeklyLoadHours: number | null
}

export type ActivePlan = {
	/** The Target Event the plan anchors to; tapping the card opens its detail. */
	eventId: string
	eventName: string
	/** Target Event date — the plan's finish line (arc end). */
	eventDate: Date
	/** Plan Outline phases: arc essentials plus each phase's weekly-load pattern. */
	phases: ActivePlanPhase[]
}

// The home surface needs each phase's name + week span to draw the arc (ADR
// 0018) and its weekly load to project the fitness curve (#132). Parse
// leniently — remaining Plan Outline fields (focus) are ignored, weeklyLoadHours
// is optional, and a malformed outline degrades to "no active plan" rather than
// throwing, since this is a derived view over data we don't fully own here.
const ArcOutlineSchema = z.object({
	phases: z
		.array(
			z
				.object({
					name: z.string().min(1),
					weeks: z.number().int().min(1),
					weeklyLoadHours: z.number().nonnegative().optional(),
				})
				.passthrough(),
		)
		.min(1),
})

/**
 * The active plan (ADR 0018): a Training Plan is a *view*, not an entity — it's
 * the nearest upcoming Target Event carrying a Plan Outline. Events without an
 * Outline are calendar markers, not plans, and are skipped even when nearer;
 * past/cancelled events don't anchor an active plan either. Returns the arc
 * essentials (event + phases) for the home Plan card, or null when there's no
 * active plan (the card's empty state).
 */
export async function getActivePlan(
	userId: string,
	now: Date = new Date(),
): Promise<ActivePlan | null> {
	const event = await prisma.event.findFirst({
		where: {
			athleteId: userId,
			status: { not: 'cancelled' },
			planOutline: { not: null },
			...notYetPast(now),
		},
		orderBy: { startDate: 'asc' },
		select: { id: true, name: true, startDate: true, planOutline: true },
	})
	if (!event?.planOutline) return null

	let raw: unknown
	try {
		raw = JSON.parse(event.planOutline)
	} catch {
		return null
	}
	const parsed = ArcOutlineSchema.safeParse(raw)
	if (!parsed.success) return null

	return {
		eventId: event.id,
		eventName: event.name,
		eventDate: event.startDate,
		phases: parsed.data.phases.map((p) => ({
			name: p.name,
			weeks: p.weeks,
			weeklyLoadHours: p.weeklyLoadHours ?? null,
		})),
	}
}

const upcomingSessionSelect = {
	id: true,
	scheduledAt: true,
	status: true,
	source: true,
	workout: {
		select: {
			id: true,
			title: true,
			description: true,
			discipline: true,
			intent: true,
			blocks: {
				orderBy: { orderIndex: 'asc' as const },
				select: {
					id: true,
					name: true,
					orderIndex: true,
					repeatCount: true,
					steps: {
						orderBy: { orderIndex: 'asc' as const },
						select: stepSelect,
					},
				},
			},
		},
	},
	recording: {
		select: {
			id: true,
			discipline: true,
			durationSec: true,
			distanceM: true,
			startedAt: true,
			endedAt: true,
		},
	},
} satisfies Prisma.WorkoutSessionSelect

export type UpcomingSession = Prisma.WorkoutSessionGetPayload<{
	select: typeof upcomingSessionSelect
}>

export async function getUpcomingSessions(
	userId: string,
): Promise<UpcomingSession[]> {
	const now = new Date()
	const horizon = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
	return prisma.workoutSession.findMany({
		where: {
			userId,
			scheduledAt: { gte: now, lte: horizon },
		},
		orderBy: { scheduledAt: 'asc' },
		select: upcomingSessionSelect,
	})
}

const ledgerSessionSelect = {
	...upcomingSessionSelect,
	tssValue: true,
	plannedTssValue: true,
	plannedTssConfidence: true,
	// The Replan Note (ADR 0025): rows that carry one get the ledger's small
	// "adjusted" adornment, so softened sessions are spottable at a glance.
	replanReason: true,
	// Carry the derived phase bars so the ledger can draw a recording's intensity
	// profile (recordings have no planned structure to derive one from).
	recording: {
		select: {
			id: true,
			discipline: true,
			durationSec: true,
			distanceM: true,
			startedAt: true,
			endedAt: true,
			phaseBarsJson: true,
		},
	},
	sessionLog: {
		select: {
			id: true,
			rpe: true,
		},
	},
} satisfies Prisma.WorkoutSessionSelect

export type LedgerSession = Prisma.WorkoutSessionGetPayload<{
	select: typeof ledgerSessionSelect
}>

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Chronological session ledger spanning completed (past) and planned (upcoming)
 * sessions, ordered by date. Bounded by a trailing history window plus the
 * planned horizon so the query stays sensible for athletes with long histories.
 */
export async function getSessionLedger(
	userId: string,
	{
		trailingDays = 42,
		horizonDays = 14,
		now = new Date(),
	}: { trailingDays?: number; horizonDays?: number; now?: Date } = {},
): Promise<LedgerSession[]> {
	const from = new Date(now.getTime() - trailingDays * DAY_MS)
	const to = new Date(now.getTime() + horizonDays * DAY_MS)
	return prisma.workoutSession.findMany({
		where: {
			userId,
			scheduledAt: { gte: from, lte: to },
		},
		orderBy: { scheduledAt: 'asc' },
		select: ledgerSessionSelect,
	})
}

/**
 * Weekly Plan Adherence (ADR 0019, #119): roll the current training week —
 * calendar Monday–Sunday in the Athlete Timezone (see `weekBoundsUTC`)
 * — up to a single banded ratio of summed actual to summed Planned TSS.
 *
 * Display only; it never enters any Load Snapshot / CTL / ATL / TSB. Sessions
 * missing either side of the comparison are excluded from both sums by
 * `weeklyAdherence`, and a week with no resolvable planned load returns null
 * (the caller renders "—", never a fabricated ratio).
 */
export async function getWeeklyAdherence(
	userId: string,
	now: Date = new Date(),
): Promise<WeeklyAdherence | null> {
	const profile = await prisma.athleteProfile.findUnique({
		where: { userId },
		select: { timezone: true },
	})
	const { start, end } = weekBoundsUTC(now, profile?.timezone ?? 'UTC')
	const sessions = await prisma.workoutSession.findMany({
		where: { userId, scheduledAt: { gte: start, lte: end } },
		select: { tssValue: true, plannedTssValue: true },
	})
	return weeklyAdherence(
		sessions.map((s) => ({
			plannedTss: s.plannedTssValue,
			actualTss: s.tssValue,
		})),
	)
}

/** The stored Week Replan decision the Week tab's decision line renders (ADR 0025). */
export type WeekReplanSummary = {
	/** 'adjusted' | 'no-change' | 'insufficient-data' — the stored outcome. */
	outcome: string
	/** Plain-language reason composed by `decideWeekReplan`, rendered verbatim. */
	reason: string
}

/**
 * The stored `WeekReplan` decision for the most recently closed Training Week
 * (ADR 0025): the same (athlete, closed week's Monday) key the recompute-path
 * applier writes, resolved in the Athlete Timezone. Read-only — display never
 * re-derives the decision, so what was applied and what is said can never
 * disagree. Returns `null` when no decision row exists yet (nothing has closed
 * a week since the feature landed, or no recompute has run this week); the
 * Week tab then shows nothing rather than inventing a status.
 */
export async function getLatestWeekReplan(
	userId: string,
	now: Date = new Date(),
): Promise<WeekReplanSummary | null> {
	const profile = await prisma.athleteProfile.findUnique({
		where: { userId },
		select: { timezone: true },
	})
	const weekKey = addDays(weekMonday(now, profile?.timezone ?? 'UTC'), -7)
	return prisma.weekReplan.findUnique({
		where: { athleteId_weekKey: { athleteId: userId, weekKey } },
		select: { outcome: true, reason: true },
	})
}

/**
 * The trailing `weeks` of Weekly Plan Adherence (#120), oldest first with the
 * current week last — the history `sustainedAdherence` walks to decide whether
 * a deviation has held long enough to shift the Coach card's narrative.
 *
 * Each week is rolled exactly like `getWeeklyAdherence` (calendar Mon–Sun in the
 * Athlete Timezone, same honesty rules); a week with no resolvable planned load
 * is `null`, which `sustainedAdherence` treats as a break in the streak. Prior
 * weeks are reached by stepping `now` back a week at a time, then snapping to
 * that week's Monday via `weekBoundsUTC`.
 */
export async function getRecentWeeklyAdherence(
	userId: string,
	weeks: number,
	now: Date = new Date(),
): Promise<Array<WeeklyAdherence | null>> {
	const perWeek = await recentWeeklySessions(userId, weeks, now)
	return perWeek.map(weeklyAdherence)
}

/**
 * The same trailing window as `getRecentWeeklyAdherence`, rolled up for the
 * home build chart (`WeeklyLoad`): Planned and actual TSS summed independently
 * so a planned-but-unrecorded week keeps its Planned bar with the actual
 * honestly Unavailable (ADR 0008 / ADR 0030), plus the comparable-sessions
 * adherence the coach reads. Deriving the sustained-deviation series from this
 * (`weeklyBuild.map((w) => w.adherence)`) keeps the chart and the coach on one
 * query and one source of truth.
 */
export async function getRecentWeeklyBuild(
	userId: string,
	weeks: number,
	now: Date = new Date(),
): Promise<WeeklyLoad[]> {
	const perWeek = await recentWeeklySessions(userId, weeks, now)
	return perWeek.map(weeklyLoad)
}

/**
 * The trailing `weeks` of a user's sessions, bucketed calendar Mon–Sun in the
 * Athlete Timezone, oldest first with the current week last — the raw shape
 * both weekly rollups map over. Prior weeks are reached by stepping `now` back
 * a week at a time, then snapping to that week's Monday via `weekBoundsUTC`.
 */
async function recentWeeklySessions(
	userId: string,
	weeks: number,
	now: Date,
): Promise<
	Array<Array<{ plannedTss: number | null; actualTss: number | null }>>
> {
	const profile = await prisma.athleteProfile.findUnique({
		where: { userId },
		select: { timezone: true },
	})
	const timezone = profile?.timezone ?? 'UTC'

	const result: Array<
		Array<{ plannedTss: number | null; actualTss: number | null }>
	> = []
	for (let back = weeks - 1; back >= 0; back--) {
		const ref = new Date(now.getTime() - back * 7 * DAY_MS)
		const { start, end } = weekBoundsUTC(ref, timezone)
		const sessions = await prisma.workoutSession.findMany({
			where: { userId, scheduledAt: { gte: start, lte: end } },
			select: { tssValue: true, plannedTssValue: true },
		})
		result.push(
			sessions.map((s) => ({
				plannedTss: s.plannedTssValue,
				actualTss: s.tssValue,
			})),
		)
	}
	return result
}

const sessionDetailSelect = {
	...upcomingSessionSelect,
	// The detail view leads with a planned-vs-actual summary (ADR 0019), so it
	// needs the materialized actual and Planned TSS the lists carry too.
	tssValue: true,
	plannedTssValue: true,
	plannedTssConfidence: true,
	// The Replan Note (ADR 0025): shown with the prescription so the "why"
	// travels with the session.
	replanReason: true,
	// The lists only need a thumbnail of the recording; the detail view shows the
	// full metric panel, so override with the richer recording select here.
	recording: {
		select: {
			id: true,
			discipline: true,
			startedAt: true,
			endedAt: true,
			durationSec: true,
			distanceM: true,
			hrAvg: true,
			hrMax: true,
			powerAvg: true,
			powerMax: true,
			powerWeightedAvg: true,
			cadenceAvg: true,
			paceAvgSecPerKm: true,
			speedMaxMps: true,
			elevationGainM: true,
			kilojoules: true,
			polyline: true,
			phaseBarsJson: true,
			tssValue: true,
			externalProvider: true,
			// The Structure Detection (ADR 0033): its grade for the "detected ·
			// (confidence)" badge, and its structure for the display-derived
			// Structure Adherence verdict a matched planned session shows beside the
			// Adherence Band (ADR 0034, #345). Absent when detection found no
			// structure (the recording stays `recorded`, structureless).
			detection: { select: { confidence: true, structureJson: true } },
			// Per-sample telemetry for the overlay (ADR 0020). Selected as the raw
			// JSON columns and parsed into the read-time `ActivityStream` shape below;
			// absent for recordings without a stream (manual uploads, older imports).
			stream: {
				select: {
					resolutionSec: true,
					timeSec: true,
					power: true,
					heartrate: true,
					pace: true,
				},
			},
		},
	},
	sessionLog: {
		select: {
			id: true,
			content: true,
			rpe: true,
			createdAt: true,
			updatedAt: true,
		},
	},
} satisfies Prisma.WorkoutSessionSelect

type SessionDetailRow = Prisma.WorkoutSessionGetPayload<{
	select: typeof sessionDetailSelect
}>

type RecordingRow = NonNullable<SessionDetailRow['recording']>

/**
 * The session-detail read model. Identical to the queried row except the
 * Recording's raw `stream` columns are replaced by the parsed read-time
 * `ActivityStream` (or `null` when the Recording has no usable stream), so the
 * route never touches stored JSON.
 */
export type SessionDetail = Omit<SessionDetailRow, 'recording'> & {
	recording:
		| (Omit<RecordingRow, 'stream'> & { stream: ActivityStream | null })
		| null
}

export async function getSessionByIdForUser(
	userId: string,
	sessionId: string,
): Promise<SessionDetail | null> {
	const row = await prisma.workoutSession.findFirst({
		where: {
			id: sessionId,
			userId,
		},
		select: sessionDetailSelect,
	})
	if (!row) return null
	if (!row.recording) return { ...row, recording: null }
	const { stream, ...recording } = row.recording
	return {
		...row,
		recording: { ...recording, stream: parseStoredStream(stream) },
	}
}

/**
 * The athlete's per-discipline thresholds (ADR 0005), keyed by discipline, for
 * resolving authored Intensity Targets into concrete metric targets
 * (pace/power/HR) on the home surface and session detail. A discipline with no
 * profile is simply absent from the map, so its %-based targets degrade to an
 * Unavailable Metric rather than a fabricated value (the Unavailable Metric
 * principle, CONTEXT.md).
 */
export async function getDisciplineThresholds(
	userId: string,
): Promise<DisciplineThresholdMap> {
	const profile = await prisma.athleteProfile.findUnique({
		where: { userId },
		select: {
			disciplineProfiles: {
				select: {
					discipline: true,
					lthr: true,
					maxHr: true,
					ftp: true,
					runPowerThresholdW: true,
					thresholdPaceSecPerKm: true,
					cssSecPer100m: true,
					zoneSystem: true,
					zoneOverrides: true,
				},
			},
		},
	})
	const map: DisciplineThresholdMap = {}
	for (const dp of profile?.disciplineProfiles ?? []) {
		const { discipline, ...thresholds } = dp
		map[discipline] = thresholds
	}
	return map
}

// The "vs last time" delta only needs each prior session's truthful actual
// metrics — its TSS and recorded moving time — plus enough to link back to it.
// (Pace/power/HR widen this once metric Intensity Targets land, per #129.)
const similarSessionSelect = {
	id: true,
	scheduledAt: true,
	tssValue: true,
	recording: { select: { durationSec: true } },
} satisfies Prisma.WorkoutSessionSelect

export type SimilarSession = Prisma.WorkoutSessionGetPayload<{
	select: typeof similarSessionSelect
}>

/**
 * The most recent *completed* Workout Session of the same discipline and Workout
 * intent scheduled strictly before `before`, or null when the athlete has no
 * prior similar session (the first of its kind). Powers the "vs last time"
 * delta on the Workout Detail View — how a completed session compares to the
 * last time the athlete did something similar (PRD #129).
 *
 * "Similar" is discipline + Workout intent: a threshold run compares to the last
 * threshold run, not a recovery jog. Only completed sessions count (the athlete
 * must actually have done it), and only ones carrying a Workout — recording-only
 * sessions have no intent to match. Honesty over guessing (ADR 0008): a null
 * result surfaces an Unavailable state, never a fabricated delta.
 */
export async function getLastSimilarSession(
	userId: string,
	{ discipline, intent }: { discipline: string; intent: string },
	before: Date,
): Promise<SimilarSession | null> {
	return prisma.workoutSession.findFirst({
		where: {
			userId,
			status: 'completed',
			scheduledAt: { lt: before },
			workout: { discipline, intent },
		},
		orderBy: { scheduledAt: 'desc' },
		select: similarSessionSelect,
	})
}
