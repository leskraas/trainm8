/**
 * `athlete`: who the athlete is and how far they have come in getting
 * started — the switch every app reads to choose "first open" or "returning".
 */
import {
	connectionHubStatus,
	type Provider,
} from '#app/utils/account-connection.server.ts'
import { addDays, localDate, weekMonday } from '#app/utils/athlete-calendar.ts'
import {
	availablePatternDays,
	readStartAnswersOf,
} from '#app/utils/athlete.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { SIMPLE_START_LABELS } from '#app/utils/labels.ts'
import { getActivePlan } from '#app/utils/training.server.ts'
import { type CapabilityCtx } from '../define.ts'
import {
	type AthleteOutput,
	type DataSourceLink,
	type SourceProvider,
	type Sport,
} from '../reads.types.ts'
import { readGoal } from './goal.server.ts'
import { maybe, sportOf, WEEKDAYS } from './shared.server.ts'

const PROVIDERS: {
	provider: SourceProvider
	name: string
	canConnect: boolean
}[] = [
	{ provider: 'intervalsicu', name: 'Intervals.icu', canConnect: true },
	{ provider: 'polar', name: 'Polar', canConnect: true },
	// Kept for an athlete who connected before; no new connections.
	{ provider: 'strava', name: 'Strava', canConnect: false },
	{ provider: 'garmin', name: 'Garmin', canConnect: false },
]

const SOURCE_STATUS = {
	disconnected: 'disconnected',
	connected: 'connected',
	backfilling: 'importing-history',
	revoked: 'needs-reconnect',
} as const

/** Every watch service, connected or not, as the athlete reads it. */
export async function readSources(
	ctx: CapabilityCtx,
): Promise<DataSourceLink[]> {
	const rows = await prisma.accountConnection.findMany({
		where: { athleteId: ctx.userId },
		select: {
			provider: true,
			status: true,
			connectedAt: true,
			lastCheckedAt: true,
			lastSyncedAt: true,
			backfillCompletedAt: true,
		},
	})
	return PROVIDERS.flatMap(({ provider, name, canConnect }) => {
		const row = rows.find((r) => r.provider === (provider as Provider))
		// A service that can't be connected any more is listed only if it is.
		if (!row && !canConnect) return []
		const status = SOURCE_STATUS[connectionHubStatus(row ?? null, ctx.now)]
		return [
			{
				provider,
				name,
				status,
				canConnect,
				connectedAt: row?.connectedAt.toISOString() ?? null,
				lastCheckedAt:
					(row?.lastCheckedAt ?? row?.lastSyncedAt)?.toISOString() ?? null,
				newestSessionAt: row?.lastSyncedAt?.toISOString() ?? null,
				historyImported: row?.backfillCompletedAt != null,
			},
		]
	})
}

export async function readAthlete(ctx: CapabilityCtx): Promise<AthleteOutput> {
	const since = new Date(ctx.now.getTime() - 90 * 86_400_000)
	const [user, profile, answers, plan, sources, recordings, recent, sessions] =
		await Promise.all([
			prisma.user.findUniqueOrThrow({
				where: { id: ctx.userId },
				select: { name: true, username: true, email: true },
			}),
			prisma.athleteProfile.findUnique({
				where: { userId: ctx.userId },
				select: {
					trainableWeekdays: true,
					defaultTrainingTime: true,
					weeklyCapacityHours: true,
					strengthPerWeek: true,
					autopilot: true,
					preferredUnits: true,
					homePlace: { select: { name: true, municipality: true } },
				},
			}),
			readStartAnswersOf(ctx.userId),
			getActivePlan(ctx.userId, ctx.now),
			readSources(ctx),
			prisma.activityImport.aggregate({
				where: { athleteId: ctx.userId },
				_count: { _all: true },
				_min: { startedAt: true },
				_max: { startedAt: true },
			}),
			prisma.activityImport.groupBy({
				by: ['discipline'],
				where: { athleteId: ctx.userId, startedAt: { gte: since } },
				_count: { _all: true },
			}),
			prisma.workoutSession.count({ where: { userId: ctx.userId } }),
		])
	const goal = await readGoal(ctx, plan)

	// The plan's sports first, then what the athlete actually records.
	const sports: Sport[] = []
	const add = (s: Sport) => {
		if (!sports.includes(s)) sports.push(s)
	}
	plan?.tracks.forEach((t) => add(sportOf(t.discipline)))
	recent
		.sort((a, b) => b._count._all - a._count._all)
		.forEach((r) => add(sportOf(r.discipline)))

	const days = availablePatternDays(profile?.trainableWeekdays)
	const hasSessionSource =
		sources.some((s) => s.status !== 'disconnected') ||
		recordings._count._all > 0
	const answeredBasics = answers.level != null && days != null
	const hasPlan = plan != null
	const hasGoal = goal != null
	const firstOpen =
		!hasPlan &&
		!answeredBasics &&
		sessions === 0 &&
		recordings._count._all === 0 &&
		!hasGoal

	const planWeeks = plan ? plan.phases.reduce((sum, p) => sum + p.weeks, 0) : 0
	const firstWeek = plan ? weekMonday(plan.planStart, ctx.timezone) : null

	return {
		source: 'athlete',
		name: user.name,
		username: user.username,
		email: user.email,
		timezone: ctx.timezone,
		today: localDate(ctx.now, ctx.timezone),
		level: answers.level,
		levelName: answers.level
			? SIMPLE_START_LABELS.levels[answers.level].name
			: null,
		sports,
		availability: {
			days: days ? days.map((d) => WEEKDAYS[d]!) : null,
			usualTime: profile?.defaultTrainingTime ?? null,
			weeklyHours: maybe(
				profile?.weeklyCapacityHours,
				'Ikke satt: du har ikke sagt hvor mange timer du har i uka.',
			),
			strengthPerWeek: profile?.strengthPerWeek ?? null,
			likes: answers.preferences,
		},
		setup: {
			firstOpen,
			answeredBasics,
			hasSessionSource,
			hasGoal,
			hasPlan,
			complete: hasPlan,
			next: hasPlan
				? null
				: !answeredBasics
					? 'basics'
					: !hasSessionSource
						? 'connect'
						: !hasGoal
							? 'goal'
							: 'plan',
		},
		sources,
		recordings: {
			count: recordings._count._all,
			first: recordings._min.startedAt
				? localDate(recordings._min.startedAt, ctx.timezone)
				: null,
			last: recordings._max.startedAt
				? localDate(recordings._max.startedAt, ctx.timezone)
				: null,
		},
		goal,
		plan: {
			exists: hasPlan,
			firstWeek,
			lastWeek:
				firstWeek && planWeeks > 0
					? addDays(firstWeek, 7 * (planWeeks - 1))
					: null,
		},
		homePlace: profile?.homePlace ?? null,
		adjustMode: profile?.autopilot === false ? 'ask-first' : 'autopilot',
		units: profile?.preferredUnits === 'imperial' ? 'imperial' : 'metric',
	}
}
