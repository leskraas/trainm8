import { type Prisma } from '@prisma/client'
import { z } from 'zod'
import { weekBoundsUTC } from './athlete-calendar.ts'
import { type PlanPhaseSpec } from './dashboard.ts'
import { prisma } from './db.server.ts'
import { weeklyAdherence, type WeeklyAdherence } from './load/adherence.ts'

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

export type ActivePlan = {
	/** The Target Event the plan anchors to; tapping the card opens its detail. */
	eventId: string
	eventName: string
	/** Target Event date — the plan's finish line (arc end). */
	eventDate: Date
	/** Plan Outline phases, reduced to the arc essentials (name + week span). */
	phases: PlanPhaseSpec[]
}

// The home Plan card only needs each phase's name + week span to draw the arc
// (ADR 0018). Parse leniently — extra Plan Outline fields (focus, weeklyLoad)
// are ignored and a malformed outline degrades to "no active plan" rather than
// throwing, since the card is a derived view over data we don't fully own here.
const ArcOutlineSchema = z.object({
	phases: z
		.array(
			z
				.object({ name: z.string().min(1), weeks: z.number().int().min(1) })
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
		phases: parsed.data.phases.map((p) => ({ name: p.name, weeks: p.weeks })),
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
	const profile = await prisma.athleteProfile.findUnique({
		where: { userId },
		select: { timezone: true },
	})
	const timezone = profile?.timezone ?? 'UTC'

	// oldest → newest, so the current week lands last (what sustainedAdherence
	// reads as "most recent").
	const result: Array<WeeklyAdherence | null> = []
	for (let back = weeks - 1; back >= 0; back--) {
		const ref = new Date(now.getTime() - back * 7 * DAY_MS)
		const { start, end } = weekBoundsUTC(ref, timezone)
		const sessions = await prisma.workoutSession.findMany({
			where: { userId, scheduledAt: { gte: start, lte: end } },
			select: { tssValue: true, plannedTssValue: true },
		})
		result.push(
			weeklyAdherence(
				sessions.map((s) => ({
					plannedTss: s.plannedTssValue,
					actualTss: s.tssValue,
				})),
			),
		)
	}
	return result
}

const sessionDetailSelect = {
	...upcomingSessionSelect,
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

export type SessionDetail = Prisma.WorkoutSessionGetPayload<{
	select: typeof sessionDetailSelect
}>

export async function getSessionByIdForUser(
	userId: string,
	sessionId: string,
): Promise<SessionDetail | null> {
	return prisma.workoutSession.findFirst({
		where: {
			id: sessionId,
			userId,
		},
		select: sessionDetailSelect,
	})
}
