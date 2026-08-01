// Stamping a **Week Pattern** into real **Workout Sessions** (#412).
//
// The payoff of the whole Plan Outline: the athlete stamps their microcycle
// across the weeks they choose and gets sessions on the calendar they can edit
// like any other. This module is the write; `stamp.ts` is the arithmetic behind
// it, and the preview and the write run the same function so the two cannot
// disagree.
//
// Five rules the write holds, and each one is load-bearing:
//
// - **A fresh `Workout` per session, always.** `Workout.sessions` is one-to-many,
//   so a stamp that shared one Workout across twelve weeks would make editing
//   Wednesday in week 2 edit weeks 1, 3 and 4 with it. `copyWorkout` is what makes
//   "editing one week never touches its siblings" true (ADR 0044 §6).
// - **A stamped session is an ordinary session.** Anchored to the **Event** by
//   `targetEventId` and carrying the `authored` **Session Source** — the same two
//   marks a hand-authored session has. Nothing points back at the pattern, so
//   there is no live link to keep in sync and no "pattern session" category to
//   explain to the athlete.
// - **A session lands on its local day, at the local time.** A pattern weekday is
//   Monday-first (ADR 0019) and `scheduledAt` is stored UTC, so the crossing goes
//   through the **Athlete Timezone** once, here, via `localTimeUTC`.
// - **Re-stamping says what it will replace before it does it.** A week that
//   already holds sessions comes back as a refusal carrying the counts, and only a
//   second, explicit submit replaces anything. Sessions that were actually trained
//   — completed, logged or backed by a **Recording** — are never replaced at all,
//   whatever the athlete confirms.
// - **Nothing here caps how many weeks are stamped.** Materialization depth is the
//   athlete's choice, and every guideline-level figure keeps reading the guideline
//   layer regardless (ADR 0040 §1).

import { type Prisma } from '@prisma/client'
import {
	addDays,
	dayBoundsUTC,
	localTimeUTC,
	weekBoundsFromMondayUTC,
	weekMonday,
} from '../athlete-calendar.ts'
import { DEFAULT_TRAINING_TIME } from '../athlete-schema.ts'
import { prisma } from '../db.server.ts'
import { recomputePlannedTssForSession } from '../load/planned-tss.server.ts'
import {
	intensityTargetToZone,
	intentToZone,
	type TrainingZone,
} from '../session-profile.ts'
import { deriveWorkoutTitle } from '../session-title.ts'
import {
	isCardioDiscipline,
	IntensityTargetSchema,
	type CardioDiscipline,
	type Discipline,
	type WorkoutStructure,
} from '../workout-schema.ts'
import {
	buildBlocksCreate,
	copyWorkout,
	workoutCopySelect,
	type CopyableWorkout,
} from '../workout.server.ts'
import { phaseIndexForWeek, totalWeeks, type VolumeCurrency } from './derive.ts'
import { phaseSpecs, resolvedTracks } from './from-rows.ts'
import {
	mixDisagreements,
	planStamp,
	WeekPatternStampSchema,
	type MixDisagreement,
	type StampDay,
	type StampSession,
	type StampSkip,
	type StampTrack,
	type StampWeekPlan,
	type WeekPatternStampInput,
} from './stamp.ts'
import { weekIndexOf, weekKeyAt } from './week-keys.ts'
import { fixedDayVolume } from './week-pattern.ts'
import { clearPlanWeek, readWeekOccupancy } from './week-sessions.server.ts'

/**
 * Why a stamp was refused. Every one is a state the athlete can act on, so none is
 * an exception and none carries wording — the route maps each to a sentence.
 *
 * `weeks-already-filled` is the only one that is not an absence: it is the
 * confirmation gate, and it comes back **with the counts** so the surface can say
 * exactly what would be replaced before the athlete says yes.
 */
export type StampRefusal =
	| 'pattern-gone'
	| 'pattern-empty'
	| 'week-outside-plan'
	| 'nothing-to-stamp'
	| 'weeks-already-filled'

/** One chosen week that already holds sessions, and what a re-stamp would do to it. */
export type StampConflict = {
	weekKey: string
	weekInPlan: number
	/** Scheduled, untrained sessions of this plan that a re-stamp deletes. */
	replacing: number
	/**
	 * Sessions this week that a re-stamp leaves exactly alone: completed, skipped
	 * or missed ones, anything carrying a **Session Log**, and anything backed by a
	 * **Recording**. A week the athlete has lived is not the stamp's to rewrite, so
	 * this is a hard rule and not a consequence of the confirmation.
	 */
	keeping: number
}

/** What a stamp did, in numbers — the surface words it (ADR 0023). */
export type StampReport = {
	weeks: number
	sessions: number
	/** Sessions deleted to make room, across every stamped week. */
	replaced: number
	/** Days that produced no session, each with its reason. */
	skipped: StampSkip[]
}

export type StampResult =
	| { ok: true; report: StampReport }
	| { ok: false; reason: Exclude<StampRefusal, 'weeks-already-filled'> }
	| { ok: false; reason: 'weeks-already-filled'; conflicts: StampConflict[] }

function refuse(
	reason: Exclude<StampRefusal, 'weeks-already-filled'>,
): StampResult {
	return { ok: false, reason }
}

/**
 * Everything the derivation needs to price the chosen weeks, plus the Event the
 * stamped sessions anchor to. The same columns `from-rows.ts` reads, because the
 * targets a stamp writes against must be the ones the plan already shows.
 */
const stampOutlineSelect = {
	id: true,
	startWeekKey: true,
	event: { select: { id: true, athleteId: true } },
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
			id: true,
			discipline: true,
			currency: true,
			anchors: { select: { fromWeekKey: true, value: true } },
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
					mix: {
						select: { zone: true, sessionsPerWeek: true },
						orderBy: { zone: 'asc' as const },
					},
				},
			},
			overrides: { select: { weekKey: true, value: true } },
		},
	},
} satisfies Prisma.PlanOutlineSelect

type StampOutline = Prisma.PlanOutlineGetPayload<{
	select: typeof stampOutlineSelect
}>

/**
 * The pattern day columns a stamp reads, with each day's Workout in the shape
 * `copyWorkout` takes — so a fixed day's prescription is read once and copied per
 * week rather than re-read per week.
 */
const stampPatternSelect = {
	id: true,
	days: {
		orderBy: [{ weekday: 'asc' as const }, { orderInDay: 'asc' as const }],
		select: {
			id: true,
			weekday: true,
			orderInDay: true,
			kind: true,
			weight: true,
			trackId: true,
			workout: { select: workoutCopySelect },
		},
	},
	outline: { select: stampOutlineSelect },
} satisfies Prisma.WeekPatternSelect

type StampPattern = Prisma.WeekPatternGetPayload<{
	select: typeof stampPatternSelect
}>

/**
 * Stamp one **Week Pattern** across the weeks the athlete chose.
 *
 * All-or-nothing across those weeks: one transaction, so a mid-flight failure can
 * never leave half a stamp behind. That is also what makes this **idempotent
 * enough to be safe on a double submit** — a confirmed replace submitted twice
 * deletes what the first submit wrote and writes it again, landing on the same
 * sessions rather than doubling them, and an *unconfirmed* second submit finds the
 * week filled and asks for confirmation instead of writing anything.
 */
export async function stampWeekPattern(
	userId: string,
	input: WeekPatternStampInput,
): Promise<StampResult> {
	const stamp = WeekPatternStampSchema.parse(input)

	const pattern = await prisma.weekPattern.findFirst({
		where: { id: stamp.patternId, outline: { event: { athleteId: userId } } },
		select: stampPatternSelect,
	})
	if (!pattern) return refuse('pattern-gone')
	if (pattern.days.length === 0) return refuse('pattern-empty')

	const outline = pattern.outline
	const eventId = outline.event.id
	const timezone = await athleteTimezone(userId)
	const trainingTime = await defaultTrainingTime(userId)
	const weekCount = totalWeeks(phaseSpecs(outline))
	const tracks = stampTracks(outline)
	const resolved = resolvedTracks(outline)

	// A week key that is not one of *this* plan's Mondays is refused rather than
	// snapped to the nearest week: `weekIndexOf` rounds, so a stale link or a week
	// of another season would otherwise stamp somewhere nobody pointed at.
	const weeks = []
	for (const weekKey of stamp.weekKeys) {
		const index = weekIndexOf(outline.startWeekKey, weekKey)
		if (
			index < 0 ||
			index >= weekCount ||
			weekKeyAt(outline.startWeekKey, index) !== weekKey
		) {
			return refuse('week-outside-plan')
		}
		weeks.push({
			weekKey,
			weekInPlan: index + 1,
			targets: resolved.map((track) => ({
				trackId: track.trackId,
				value: track.targets[index]?.value ?? null,
			})),
		})
	}

	const plans = planStamp({ days: stampDays(pattern, tracks), tracks, weeks })
	if (plans.every((plan) => plan.sessions.length === 0)) {
		return refuse('nothing-to-stamp')
	}

	// What is already there, read before anything is written: the athlete is told
	// what a re-stamp would replace *before* it replaces it, so an edited week is
	// never silently lost.
	const conflicts = (
		await readOccupancy(userId, eventId, plans, timezone)
	).filter((week) => week.replacing > 0 || week.keeping > 0)
	if (conflicts.length > 0 && !stamp.replace) {
		return { ok: false, reason: 'weeks-already-filled', conflicts }
	}

	const sourcesById = new Map(
		pattern.days.flatMap((day) =>
			day.workout ? [[day.workout.id, day.workout] as const] : [],
		),
	)

	const written = await prisma.$transaction(async (tx) => {
		let replaced = 0
		const sessionIds: string[] = []

		for (const plan of plans) {
			replaced += await clearPlanWeek(
				tx,
				userId,
				eventId,
				plan.weekKey,
				timezone,
			)
			for (const session of plan.sessions) {
				const workoutId = await workoutForSession(
					tx,
					userId,
					session,
					session.sourceWorkoutId
						? (sourcesById.get(session.sourceWorkoutId) ?? null)
						: null,
				)
				if (workoutId == null) continue
				const created = await tx.workoutSession.create({
					data: {
						userId,
						workoutId,
						// A pattern weekday is Monday-first and so is the Training Week, so
						// the weekday *is* the offset from the week's own Monday (ADR 0019).
						scheduledAt: localTimeUTC(
							addDays(plan.weekKey, session.weekday),
							trainingTime,
							timezone,
						),
						status: 'scheduled',
						// The two marks that make this an ordinary session: authored by the
						// athlete (they authored the pattern), anchored to the Event.
						source: 'authored',
						targetEventId: eventId,
					},
					select: { id: true },
				})
				sessionIds.push(created.id)
			}
		}
		return { replaced, sessionIds }
	})

	// Planned TSS is materialized on the session (ADR 0019), so every fresh copy
	// gets its own figure — and a strength copy honestly gets `null` rather than a
	// zero, which is what "contributes no TSS" means (ADR 0008).
	for (const sessionId of written.sessionIds) {
		await recomputePlannedTssForSession(userId, sessionId)
	}

	return {
		ok: true,
		report: {
			weeks: plans.length,
			sessions: written.sessionIds.length,
			replaced: written.replaced,
			skipped: plans.flatMap((plan) => plan.skipped),
		},
	}
}

/**
 * The Workout this session gets: a fresh copy of the day's prescription, a scaled
 * copy of its shape, or a bare prescription written from the volume alone.
 *
 * Always a **new** Workout row and never a reference to the pattern day's own —
 * that is the whole of ADR 0044 §6.
 */
async function workoutForSession(
	tx: Prisma.TransactionClient,
	userId: string,
	session: StampSession,
	source: CopyableWorkout | null,
): Promise<string | null> {
	if (source) {
		// A scaled shape keeps the athlete's own title: they named the *kind* of
		// session ("Easy long run"), and renaming it to this week's distance would
		// rewrite their word for it. Every surface shows the session's real quantity.
		const blocks =
			session.scale === 1
				? source.blocks
				: scaleBlocks(source.blocks, session.scale, session.currency)
		const copy = await copyWorkout(tx, source, userId, { blocks })
		return copy.id
	}

	const structure = bareStructure(session)
	if (!structure) return null
	const workout = await tx.workout.create({
		data: {
			title: deriveWorkoutTitle(structure),
			discipline: structure.discipline,
			// The share day's honest intent: it is the week's volume, not a prescribed
			// effort. Nothing here invents a zone — a pattern day carries none, and the
			// mix-disagreement check reads the session's content (ADR 0044 §7).
			intent: 'endurance',
			ownerId: userId,
			blocks: { create: buildBlocksCreate(structure.blocks) },
		},
		select: { id: true },
	})
	return workout.id
}

/**
 * A bare share of the week as a one-step prescription: a distance on a `km` track,
 * a duration on an `hours` one. `null` where neither can be written — which
 * `planStamp` has already skipped, so this is the structural narrowing and not a
 * second decision.
 */
function bareStructure(session: StampSession): WorkoutStructure | null {
	if (session.volume == null || session.volume <= 0) return null
	if (!isCardioDiscipline(session.discipline)) return null
	const discipline: CardioDiscipline = session.discipline
	const quantity =
		session.currency === 'km'
			? { distanceM: Math.max(1, Math.round(session.volume * 1000)) }
			: session.currency === 'hours'
				? { durationSec: Math.max(1, Math.round(session.volume * 3600)) }
				: null
	if (!quantity) return null
	return {
		discipline,
		blocks: [
			{ repeatCount: 1, steps: [{ kind: 'cardio', discipline, ...quantity }] },
		],
	}
}

/**
 * A shape's blocks, scaled to the share the day takes.
 *
 * Only the unit the track prices in moves: a `km` track scales distances and an
 * `hours` track scales durations, because that is the unit the share was computed
 * in. `fixedDayVolume` only prices a prescription where **every** step carries the
 * unit, so a shape that got here has every step to scale and the scaled total is
 * the share exactly, up to the metre or second each step rounds to.
 */
function scaleBlocks(
	blocks: CopyableWorkout['blocks'],
	scale: number,
	currency: VolumeCurrency,
): CopyableWorkout['blocks'] {
	const field = currency === 'km' ? 'distanceM' : 'durationSec'
	return blocks.map((block) => ({
		...block,
		steps: block.steps.map((step) => {
			const value = step[field]
			if (value == null) return step
			return { ...step, [field]: Math.max(1, Math.round(value * scale)) }
		}),
	}))
}

/**
 * Per chosen week: how many sessions a re-stamp replaces, and how many it keeps —
 * off the one statement of that policy, which copying a week reads too
 * (`week-sessions.server.ts`).
 */
async function readOccupancy(
	userId: string,
	eventId: string,
	plans: readonly StampWeekPlan[],
	timezone: string,
): Promise<StampConflict[]> {
	const conflicts: StampConflict[] = []
	for (const plan of plans) {
		const occupancy = await readWeekOccupancy(
			userId,
			eventId,
			plan.weekKey,
			timezone,
		)
		conflicts.push({
			weekKey: plan.weekKey,
			weekInPlan: plan.weekInPlan,
			...occupancy,
		})
	}
	return conflicts
}

/** Every track of the plan, in the shape the planner reads. */
function stampTracks(outline: StampOutline): StampTrack[] {
	return outline.tracks.map((track) => ({
		trackId: track.id,
		discipline: track.discipline as Discipline,
		currency: track.currency as VolumeCurrency,
	}))
}

/**
 * The pattern's days as the planner reads them, each already **priced** in its own
 * track's Volume Currency — a fixed day's prescription and a share day's shape
 * alike, both through `fixedDayVolume`, so nothing downstream prices a Workout a
 * second way.
 *
 * A row whose nullable columns contradict its own kind yields nothing. The
 * migration's per-kind CHECK makes that unreachable from the database, so this is
 * the structural narrowing `patternDayReading` does, for the same reason: a day
 * stamped at a guessed weekday is worse than a broken row not stamped.
 */
function stampDays(
	pattern: StampPattern,
	tracks: readonly StampTrack[],
): StampDay[] {
	const currencyByTrack = new Map(
		tracks.map((track) => [track.trackId, track.currency]),
	)
	return pattern.days.flatMap((day): StampDay[] => {
		if (day.weekday < 0 || day.weekday > 6) return []
		const currency = currencyByTrack.get(day.trackId)
		if (!currency) return []
		const priced = day.workout
			? fixedDayVolume(pricingBlocks(day.workout), currency)
			: null
		const position = {
			dayId: day.id,
			weekday: day.weekday as StampDay['weekday'],
			orderInDay: day.orderInDay,
			trackId: day.trackId,
			workoutId: day.workout?.id ?? null,
		}
		if (day.kind === 'fixed') {
			return [{ ...position, kind: 'fixed', volume: priced, shapeVolume: null }]
		}
		if (day.kind === 'share' && day.weight != null) {
			return [
				{ ...position, kind: 'share', weight: day.weight, shapeVolume: priced },
			]
		}
		return []
	})
}

/** A stored Workout's blocks in the shape `fixedDayVolume` prices. */
function pricingBlocks(workout: CopyableWorkout) {
	return workout.blocks.map((block) => ({
		repeatCount: block.repeatCount,
		steps: block.steps.map((step) => ({
			durationSec: step.durationSec,
			distanceM: step.distanceM,
		})),
	}))
}

/** The athlete's own timezone, `'UTC'` where they have no profile at all. */
async function athleteTimezone(userId: string): Promise<string> {
	const profile = await prisma.athleteProfile.findUnique({
		where: { userId },
		select: { timezone: true },
	})
	return profile?.timezone ?? 'UTC'
}

/**
 * The clock time a stamped session lands on: the athlete's **Default Training
 * Time**, or the documented convention where they never set one (ADR 0044 §4).
 */
async function defaultTrainingTime(userId: string): Promise<string> {
	const profile = await prisma.athleteProfile.findUnique({
		where: { userId },
		select: { defaultTrainingTime: true },
	})
	return profile?.defaultTrainingTime ?? DEFAULT_TRAINING_TIME
}

/**
 * One stamped week whose sessions disagree with its segment's **Quality Session
 * Mix** — the soft warning ADR 0042 §9 asks for, read off the sessions the plan
 * actually holds.
 *
 * Per **week** and not per phase, because the disagreement is about a week: a
 * segment months out has no sessions to disagree with it, and the **Intensity
 * Emphasis** label keeps reading the mix regardless of how far materialization
 * reaches.
 */
export type StampedMixWarning = {
	weekKey: string
	weekInPlan: number
	trackId: string
	discipline: Discipline
	disagreements: MixDisagreement[]
}

/**
 * Where this plan's already-stamped weeks disagree with the mix their segment
 * authors.
 *
 * Never blocks and never corrects: it returns numbers, the surface says them
 * softly, and nothing anywhere rewrites a session to match. Deliberately swapping
 * a VO₂ max session for an easy run in a tired week is a valid plan, not an error
 * — the mix is authored intent and the sessions are the plan's final truth.
 *
 * Only weeks that hold sessions are read. A week with none has not been stamped,
 * and "this week has no quality sessions yet" is a statement about materialization
 * rather than about the plan.
 */
export async function readStampedMixWarnings(
	userId: string,
	eventId: string,
): Promise<StampedMixWarning[]> {
	const outline = await prisma.planOutline.findFirst({
		where: { eventId, event: { athleteId: userId } },
		select: stampOutlineSelect,
	})
	if (!outline) return []

	const specs = phaseSpecs(outline)
	const weekCount = totalWeeks(specs)
	if (weekCount === 0) return []

	const timezone = await athleteTimezone(userId)
	const { start } = dayBoundsUTC(outline.startWeekKey, timezone)
	const { end } = weekBoundsFromMondayUTC(
		weekKeyAt(outline.startWeekKey, weekCount - 1),
		timezone,
	)
	const sessions = await prisma.workoutSession.findMany({
		where: {
			userId,
			targetEventId: outline.event.id,
			scheduledAt: { gte: start, lte: end },
		},
		select: { scheduledAt: true, workout: { select: sessionZoneSelect } },
	})
	if (sessions.length === 0) return []

	// Endurance tracks only: a **Quality Session Mix** is an endurance segment's
	// second axis, and a strength segment authors a **Strength Goal** instead
	// (ADR 0047 §3). A lifting week has nothing here to disagree with.
	const enduranceTracks = resolvedTracks(outline).filter((track) =>
		isCardioDiscipline(track.discipline),
	)

	const zonesByWeek = new Map<number, Array<TrainingZone | null>>()
	for (const session of sessions) {
		const index = weekIndexOf(
			outline.startWeekKey,
			weekMonday(session.scheduledAt, timezone),
		)
		if (index < 0 || index >= weekCount) continue
		const zones = zonesByWeek.get(index) ?? []
		zones.push(sessionZone(session.workout))
		zonesByWeek.set(index, zones)
	}

	const warnings: StampedMixWarning[] = []
	for (const [index, zones] of [...zonesByWeek].sort((a, b) => a[0] - b[0])) {
		const phaseIndex = phaseIndexForWeek(specs, index)
		if (phaseIndex == null) continue
		for (const track of enduranceTracks) {
			const segment = track.segments.find(
				(candidate) => candidate.phaseIndex === phaseIndex,
			)
			if (!segment) continue
			const disagreements = mixDisagreements(segment.mix, zones)
			if (disagreements.length === 0) continue
			warnings.push({
				weekKey: weekKeyAt(outline.startWeekKey, index),
				weekInPlan: index + 1,
				trackId: track.trackId,
				discipline: track.discipline,
				disagreements,
			})
		}
	}
	return warnings
}

/** The Workout columns a session's zone is read off — its intent and its steps. */
const sessionZoneSelect = {
	intent: true,
	blocks: {
		select: {
			steps: { select: { kind: true, intensity: true } },
		},
	},
} satisfies Prisma.WorkoutSelect

type SessionZoneWorkout = Prisma.WorkoutGetPayload<{
	select: typeof sessionZoneSelect
}>

/**
 * The **zone a session is**, for the purpose of counting quality sessions: the
 * hardest zone anything in it prescribes.
 *
 * The hardest and not the longest, because that is what makes a session a quality
 * session — `20 min Z1 · 5×1000m Z4 · 10 min Z1` is a threshold session even
 * though most of its minutes are easy, and counting it as zone 1 would report a
 * disagreement nobody would recognise.
 *
 * The zone comes off the **authored intensity** through the same
 * `intensityTargetToZone` the Workout Shape uses, falling back to the workout's
 * own **intent** where no step states one — the fallback `deriveSessionProfile`
 * already makes, and the only prescription a bare volume session has. A session
 * neither can zone truthfully reads `null` and counts toward nothing: an unzoned
 * session is not evidence that a zone is missing (ADR 0008).
 */
function sessionZone(workout: SessionZoneWorkout | null): TrainingZone | null {
	if (!workout) return null
	const zones = workout.blocks
		.flatMap((block) => block.steps)
		.flatMap((step) =>
			step.kind === 'cardio' ? [stepZone(step.intensity)] : [],
		)
		.filter((zone): zone is TrainingZone => zone != null)
	if (zones.length > 0) return Math.max(...zones) as TrainingZone
	return intentToZone(workout.intent)
}

function stepZone(intensity: string | null): TrainingZone | null {
	if (!intensity) return null
	try {
		const parsed = IntensityTargetSchema.safeParse(JSON.parse(intensity))
		return parsed.success ? intensityTargetToZone(parsed.data) : null
	} catch {
		return null
	}
}
