import { type Prisma } from '@prisma/client'
import { type ActivityStream, parseStoredStream } from './activity-stream.ts'
import {
	addDays,
	dayBoundsUTC,
	weekBoundsUTC,
	weekMonday,
} from './athlete-calendar.ts'
import { getAthleteTimezone } from './athlete.server.ts'
import { type PlanPhaseSpec } from './dashboard.ts'
import { prisma } from './db.server.ts'
import { type DisciplineThresholdMap } from './intensity-target.ts'
import {
	weeklyAdherence,
	weeklyLoad,
	type WeeklyAdherence,
	type WeeklyLoad,
} from './load/adherence.ts'
import { plannedWeeklyTss } from './load/fitness-projection.ts'
import {
	phaseIndexForWeek,
	totalWeeks,
	weekRole,
	type VolumeCurrency,
	type WeekRole,
} from './plan-outline/derive.ts'
import { eventFit, type EventFit } from './plan-outline/event-fit.ts'
import {
	phaseReadings,
	phaseSpecs,
	resolvedTracks,
	type PhaseReading,
	type ResolvedTrack,
	type SegmentReading,
} from './plan-outline/from-rows.ts'
import { type RampWarning } from './plan-outline/ramp-guard.ts'
import { type SeasonSpanReading } from './plan-outline/season-span.ts'
import { weekKeyAt } from './plan-outline/week-keys.ts'
import { type Discipline } from './workout-schema.ts'

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
	/**
	 * The plan's authored first Training Week, as an instant: that week's Monday in
	 * the Athlete Timezone (ADR 0044 §3). The arc lays the phases forward from here
	 * rather than counting back from the Event, so a plan that ends short of its
	 * Event shows that instead of silently stretching.
	 */
	planStart: Date
	/** Plan Outline phases: the arc essentials, name + week span (ADR 0018). */
	phases: PlanPhaseSpec[]
	/**
	 * Per plan week, earliest first: the week's projectable TSS, or null where no
	 * honest conversion exists (a km- or sets-authored track, pending #385). The
	 * Fitness Projection replays this forward to race day (#132) and degrades to an
	 * Unavailable Metric on any null rather than guessing.
	 *
	 * Accumulated across **every endurance** track, since a plan carries one track
	 * per Discipline (ADR 0043 §1) and TSS is commensurable across them by
	 * construction (§6). A strength track contributes nothing: projected CTL falls
	 * only as far as the endurance tracks actually fall (ADR 0041 §6).
	 */
	weeklyTss: Array<number | null>
}

/**
 * The active plan (ADR 0018): a Training Plan is a *view*, not an entity — it's
 * the nearest upcoming Target Event carrying a Plan Outline. Events without an
 * Outline are calendar markers, not plans, and are skipped even when nearer;
 * past/cancelled events don't anchor an active plan either. Returns the arc
 * essentials (event + phases) plus the derived per-week load for the home Plan
 * card, or null when there's no active plan (the card's empty state).
 */
export async function getActivePlan(
	userId: string,
	now: Date = new Date(),
): Promise<ActivePlan | null> {
	const found = await findActiveOutline(userId, now)
	if (!found) return null
	const { event, outline } = found

	const timezone = await getAthleteTimezone(userId)
	const tracks = resolvedTracks(outline)
	const enduranceTracks = tracks.filter(
		(track) => track.discipline !== 'strength',
	)

	return {
		eventId: event.id,
		eventName: event.name,
		eventDate: event.startDate,
		planStart: dayBoundsUTC(outline.startWeekKey, timezone).start,
		phases: phaseReadings(outline),
		weeklyTss: accumulateWeeklyTss(enduranceTracks),
	}
}

const activeOutlineSelect = {
	id: true,
	name: true,
	startDate: true,
	planOutline: {
		select: {
			id: true,
			startWeekKey: true,
			phases: {
				select: {
					id: true,
					orderIndex: true,
					name: true,
					weeks: true,
					rhythm: true,
					tapers: true,
				},
			},
			tracks: {
				select: {
					discipline: true,
					currency: true,
					anchors: { select: { fromWeekKey: true, value: true } },
					// Both segment kinds, with everything each carries: since #400 a
					// strength segment is resolved rather than filtered out, and it is
					// positioned by its own dates with a deload tail of its own
					// (ADR 0047 §6).
					segments: {
						select: {
							id: true,
							kind: true,
							phaseId: true,
							ramp: true,
							boundaryStep: true,
							recoveryCut: true,
							taperCut: true,
							startWeekKey: true,
							weeks: true,
							goal: true,
							sessionsPerWeek: true,
							deloadCut: true,
							deloadWeeks: true,
						},
					},
					overrides: { select: { weekKey: true, value: true } },
				},
			},
		},
	},
} satisfies Prisma.EventSelect

/**
 * The nearest upcoming Target Event carrying a Plan Outline, with the Outline's
 * rows. Shared by the Plan card's reading and the planning surface's, so the two
 * can never disagree about which plan is active or what it says.
 */
async function findActiveOutline(userId: string, now: Date) {
	const event = await prisma.event.findFirst({
		where: {
			athleteId: userId,
			status: { not: 'cancelled' },
			planOutline: { isNot: null },
			...notYetPast(now),
		},
		orderBy: { startDate: 'asc' },
		select: activeOutlineSelect,
	})
	const outline = event?.planOutline
	if (!event || !outline) return null
	// A phaseless Outline draws no arc and projects nothing, so it is not a plan.
	if (outline.phases.length === 0) return null
	return { event, outline }
}

/** One Training Week of the authored season, as the planning surface reads it. */
export type SeasonWeek = {
	/** The week's Monday in the Athlete Timezone (ADR 0044 §3). */
	weekKey: string
	/** 1-based position in the plan — what the athlete counts in. */
	weekInPlan: number
	phaseIndex: number
	/** Loading, recovery or taper, from the phase's own rhythm (ADR 0044 §4). */
	role: WeekRole
	/**
	 * One reading per Training Track, each in **that track's** Volume Currency and
	 * never accumulated across them (ADR 0043 §5). `null` is an Unavailable
	 * Metric — no anchor in force, or a track whose rule cannot price the week.
	 */
	targets: Array<{
		discipline: Discipline
		currency: VolumeCurrency
		value: number | null
	}>
}

/** A phase with the week span derived from the Plan Start Week (ADR 0044 §3). */
export type SeasonPhase = PhaseReading & {
	/** 1-based first and last week of the phase within the plan. */
	fromWeekInPlan: number
	toWeekInPlan: number
	fromWeekKey: string
}

/**
 * The authored season, as `/training/plan` reads it: the phases in order, every
 * Training Week's derived volume target per track, and where the plan's end falls
 * against the Event. Not necessarily the *active* one — `getSeasonForEvent` reads
 * a named Event's season whether or not the athlete is living in it.
 *
 * The same rows the **Plan card** reads, through the same derivation — this
 * returns the season the athlete authored rather than the arc summary, so the two
 * surfaces cannot drift. Nothing here is stored: every target is computed from
 * the anchor and the ramps on each read (ADR 0040 §1).
 */
export type AuthoredSeason = {
	outlineId: string
	eventId: string
	eventName: string
	eventDate: Date
	/** The authored Plan Start Week — the key every week-scoped row hangs off. */
	startWeekKey: string
	timezone: string
	phases: SeasonPhase[]
	/**
	 * Each track's authored inputs: its currency, its **Season Anchor** segments and
	 * the progression its endurance segments author, plus the two figures read off
	 * that guideline level — the **Season Span** headline and the season total behind
	 * it — and wherever the **ramp guard** has something to say.
	 */
	tracks: Array<{
		discipline: Discipline
		currency: VolumeCurrency
		anchors: Array<{ fromWeekKey: string; value: number }>
		segments: SegmentReading[]
		span: SeasonSpanReading | null
		total: number | null
		warnings: RampWarning[]
	}>
	weeks: SeasonWeek[]
	/** Where the season ends relative to the Event — shown, never corrected. */
	fit: EventFit
}

export async function getActiveSeason(
	userId: string,
	now: Date = new Date(),
): Promise<AuthoredSeason | null> {
	const found = await findActiveOutline(userId, now)
	return found ? toSeason(userId, found.event, found.outline) : null
}

/**
 * One named Event's season, whichever Event it is — the athlete's own, upcoming
 * or not.
 *
 * `getActiveSeason` answers "the plan I am living in", which is the nearest
 * upcoming outlined Event (ADR 0018). That is the wrong answer for an athlete who
 * just authored a plan for a race two seasons out, or who taps a specific Event's
 * plan: both mean *this* plan, not the nearest one. So the surface addresses a
 * season by Event when it is told which, and falls back to the active one.
 */
export async function getSeasonForEvent(
	userId: string,
	eventId: string,
): Promise<AuthoredSeason | null> {
	const event = await prisma.event.findFirst({
		where: { id: eventId, athleteId: userId },
		select: activeOutlineSelect,
	})
	const outline = event?.planOutline
	if (!event || !outline || outline.phases.length === 0) return null
	return toSeason(userId, event, outline)
}

type OutlineRowsFor = NonNullable<
	Prisma.EventGetPayload<{ select: typeof activeOutlineSelect }>['planOutline']
>

async function toSeason(
	userId: string,
	event: { id: string; name: string; startDate: Date },
	outline: OutlineRowsFor,
): Promise<AuthoredSeason> {
	const timezone = await getAthleteTimezone(userId)
	const phases = phaseReadings(outline)
	const specs = phaseSpecs(outline)
	const tracks = resolvedTracks(outline)
	const weekCount = totalWeeks(specs)

	let opening = 0
	const seasonPhases = phases.map((phase) => {
		const fromWeekInPlan = opening + 1
		opening += phase.weeks
		return {
			...phase,
			fromWeekInPlan,
			toWeekInPlan: opening,
			fromWeekKey: weekKeyAt(outline.startWeekKey, fromWeekInPlan - 1),
		}
	})

	return {
		outlineId: outline.id,
		eventId: event.id,
		eventName: event.name,
		eventDate: event.startDate,
		startWeekKey: outline.startWeekKey,
		timezone,
		phases: seasonPhases,
		// Zipped with `resolvedTracks` by position: both walk `outline.tracks` in the
		// order the query returned, so a track's stored anchors and its derived span
		// can never come from different tracks.
		tracks: outline.tracks.map((track, index) => ({
			discipline: track.discipline as Discipline,
			currency: track.currency as VolumeCurrency,
			anchors: [...track.anchors].sort((a, b) =>
				a.fromWeekKey.localeCompare(b.fromWeekKey),
			),
			segments: [...(tracks[index]?.segments ?? [])].sort(
				(a, b) => a.phaseIndex - b.phaseIndex,
			),
			span: tracks[index]?.span ?? null,
			total: tracks[index]?.total ?? null,
			warnings: tracks[index]?.warnings ?? [],
		})),
		weeks: Array.from({ length: weekCount }, (_, week) => ({
			weekKey: weekKeyAt(outline.startWeekKey, week),
			weekInPlan: week + 1,
			phaseIndex: phaseIndexForWeek(specs, week) ?? 0,
			role: weekRole(specs, week),
			targets: tracks.map((track) => ({
				discipline: track.discipline,
				currency: track.currency,
				value: track.targets[week] ?? null,
			})),
		})),
		fit: eventFit(
			outline.startWeekKey,
			weekCount,
			weekMonday(event.startDate, timezone),
		),
	}
}

/**
 * Sum the endurance tracks' weeks into one projectable TSS series. A week is null
 * — an Unavailable Metric — as soon as *any* track cannot express it in TSS: a
 * partial sum over some disciplines would read as the athlete's whole week.
 */
function accumulateWeeklyTss(tracks: ResolvedTrack[]): Array<number | null> {
	if (tracks.length === 0) return []
	const weeks = tracks[0]!.targets.length
	return Array.from({ length: weeks }, (_, week) => {
		let total = 0
		for (const track of tracks) {
			const tss = plannedWeeklyTss(track.currency, track.targets[week] ?? null)
			if (tss == null) return null
			total += tss
		}
		return total
	})
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
