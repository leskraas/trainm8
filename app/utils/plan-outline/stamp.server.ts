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
//   `planOutlineId` (and to the **Event** by `targetEventId`, when the plan has
//   one) and carrying the `generated` **Session Source**: the plan laid it, so it is the machine's to re-lay until the athlete edits it, which adopts
//   it (ADR 0080). Nothing points back at the pattern, so there is no live link
//   to keep in sync and no "pattern session" category to explain to the athlete.
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
	localDate,
	localTimeUTC,
	weekBoundsFromMondayUTC,
	weekdayIndex,
	weekMonday,
} from '../athlete-calendar.ts'
import { DEFAULT_TRAINING_TIME } from '../athlete-schema.ts'
import {
	getAthleteTimezone,
	readAvailablePatternDays,
} from '../athlete.server.ts'
import { prisma } from '../db.server.ts'
import { isEffortWord } from '../effort-word.ts'
import { type DisciplineThresholdMap } from '../intensity-target.ts'
import { recomputePlannedTssForSession } from '../load/planned-tss.server.ts'
import { type TrainingZone } from '../session-profile.ts'
import { stampedSessionTitle } from '../session-title.ts'
import {
	getDisciplineThresholds,
	sessionWorkoutSelect,
} from '../training.server.ts'
import {
	isCardioDiscipline,
	type CardioDiscipline,
	type Discipline,
	type WorkoutIntent,
	type WorkoutStructure,
} from '../workout-schema.ts'
import {
	buildBlocksCreate,
	copyWorkout,
	workoutCopySelect,
	type CopyableWorkout,
} from '../workout.server.ts'
import { isOutlineResting } from './active-outline.server.ts'
import { type PlacedSession } from './day-rule.ts'
import { phaseIndexForWeek, totalWeeks, type VolumeCurrency } from './derive.ts'
import { phaseSpecs, resolvedTracks } from './from-rows.ts'
import { parsePinnedDays } from './pinned-days.ts'
import { type QualityZone } from './quality-mix.ts'
import {
	placedOn,
	readPlacement,
	TRAINED_SESSION_STATUSES,
} from './session-placement.ts'
import { sessionZone, sessionZoneSelect } from './session-zone.ts'
import {
	mixDisagreements,
	planStamp,
	WeekPatternStampSchema,
	type MixDisagreement,
	type StampDay,
	type StampLiftingSlot,
	type StampSession,
	type StampSkip,
	type StampTrack,
	type StampWeekInput,
	type StampWeekPlan,
	type WeekPatternStampInput,
} from './stamp.ts'
import { weekIndexOf, weekKeyAt } from './week-keys.ts'
import {
	fixedDayVolume,
	isPatternWeekday,
	type PatternWeekday,
} from './week-pattern.ts'
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
	/**
	 * An open-ended plan resting behind an active plan toward a race (ADR 0079):
	 * laying its weeks would put two plans in the same weeks.
	 */
	| 'plan-resting'
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
	event: { select: { id: true } },
	phases: {
		select: {
			id: true,
			orderIndex: true,
			name: true,
			weeks: true,
			rhythm: true,
			tapers: true,
			recoveryWeekIndex: true,
		},
	},
	tracks: {
		select: {
			id: true,
			discipline: true,
			currency: true,
			pinnedDays: true,
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
	now: Date = new Date(),
	{
		aroundKeptSessions = false,
	}: {
		/**
		 * Lay the week **around** the plan sessions a replace keeps (#505 S7
		 * review): a session the plan laid that the athlete adopted, or trained,
		 * still fills its slot — its weekday and Discipline — so the pattern day
		 * for that slot is not laid a second time beside it, and every other
		 * day is. How a re-lay after a plan edit keeps a week at its target
		 * without touching the athlete's session (`relayPlanFrom`). Sessions the
		 * athlete wrote themselves (`authored`) fill no slot: they are extra to
		 * the plan's week, as they are to every stamp.
		 */
		aroundKeptSessions?: boolean
	} = {},
): Promise<StampResult> {
	const stamp = WeekPatternStampSchema.parse(input)

	const pattern = await prisma.weekPattern.findFirst({
		where: { id: stamp.patternId, outline: { athleteId: userId } },
		select: stampPatternSelect,
	})
	if (!pattern) return refuse('pattern-gone')
	if (pattern.days.length === 0) return refuse('pattern-empty')
	if (
		await isOutlineResting(
			userId,
			{ eventId: pattern.outline.event?.id ?? null },
			now,
		)
	) {
		return refuse('plan-resting')
	}

	const outline = pattern.outline
	// An open-ended plan has no Event (ADR 0079): its sessions anchor to the plan
	// alone.
	const eventId = outline.event?.id ?? null
	const timezone = await getAthleteTimezone(userId)
	const trainingTime = await readStampProfile(userId)
	const thresholds = await getDisciplineThresholds(userId)
	const specs = phaseSpecs(outline)
	const weekCount = totalWeeks(specs)
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
			...stampWeekInput(weekKey, index, specs, resolved),
			held: await readHeldSessions(userId, outline.id, weekKey, timezone),
		})
	}

	const plans = planStamp({
		days: stampDays(pattern, tracks, thresholds),
		lifting: liftingSlots(pattern, tracks),
		liftingDays: trainingTime.liftingDays,
		tracks,
		weeks,
	})
	if (plans.every((plan) => plan.sessions.length === 0)) {
		return refuse('nothing-to-stamp')
	}

	// What is already there, read before anything is written: the athlete is told
	// what a re-stamp would replace *before* it replaces it, so an edited week is
	// never silently lost.
	const conflicts = (
		await readOccupancy(userId, outline.id, plans, timezone)
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
				outline.id,
				plan.weekKey,
				timezone,
			)
			const filled = aroundKeptSessions
				? await filledSlots(tx, userId, outline.id, plan.weekKey, timezone)
				: new Map<string, number>()
			for (const session of plan.sessions) {
				const slot =
					filled.get(slotKey(session.weekday, session.discipline)) ||
					session.kind !== 'lifting'
						? slotKey(session.weekday, session.discipline)
						: keptLiftElsewhere(filled, plan.sessions, session.discipline)
				const taken = slot == null ? 0 : (filled.get(slot) ?? 0)
				if (slot != null && taken > 0) {
					filled.set(slot, taken - 1)
					continue
				}
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
							trainingTime.at,
							timezone,
						),
						status: 'scheduled',
						// Laid by the plan, so the machine's (ADR 0080) until the athlete edits
						// it — that edit is Session Adoption — and anchored to the plan that
						// laid it, and to its Event when it has one.
						source: 'generated',
						targetEventId: eventId,
						planOutlineId: outline.id,
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

/** One plan week as the planner reads it: its targets and its mixes. */
function stampWeekInput(
	weekKey: string,
	index: number,
	specs: ReturnType<typeof phaseSpecs>,
	resolved: ReturnType<typeof resolvedTracks>,
): StampWeekInput {
	const phaseIndex = phaseIndexForWeek(specs, index)
	return {
		weekKey,
		weekInPlan: index + 1,
		targets: resolved.map((track) => ({
			trackId: track.trackId,
			value: track.targets[index]?.value ?? null,
		})),
		// The week's segment's **Quality Session Mix**, which the planner lays
		// on the bare share days (round 2): a plan that says two hard sessions
		// a week lays two.
		mixes: resolved.map((track) => ({
			trackId: track.trackId,
			mix:
				track.segments.find((segment) => segment.phaseIndex === phaseIndex)
					?.mix ?? [],
		})),
	}
}

/** The planner's input for a pattern: its days and its lifting slots. */
export type LaidPatternInput = {
	days: StampDay[]
	lifting: StampLiftingSlot[]
}

/**
 * The plan's weeks `weekKeys` as the stamp would lay them from the plan's
 * Week Pattern — the first one with days, the one the weeks are laid from —
 * without writing anything: the preview of a change (ADR 0084) runs the same
 * `planStamp` the write does, so the two cannot disagree. `swap` replaces the
 * pattern's days before laying, which is how a change is shown before it is
 * made. Weeks outside the plan are left out; `null` without a pattern.
 */
export async function readLaidWeeks(
	userId: string,
	outlineId: string,
	weekKeys: readonly string[],
	swap: (laid: LaidPatternInput) => LaidPatternInput = (laid) => laid,
	{
		pinned,
	}: {
		/**
		 * Whether a track is on its **Pinned days** as the change would leave
		 * it, where that differs from what is stored (#598).
		 */
		pinned?: ReadonlyMap<string, boolean>
	} = {},
): Promise<{
	plans: StampWeekPlan[]
	input: LaidPatternInput
	tracks: StampTrack[]
} | null> {
	const pattern = await prisma.weekPattern.findFirst({
		where: { outlineId, outline: { athleteId: userId }, days: { some: {} } },
		orderBy: { orderIndex: 'asc' },
		select: stampPatternSelect,
	})
	if (!pattern) return null
	const outline = pattern.outline
	const specs = phaseSpecs(outline)
	const weekCount = totalWeeks(specs)
	const tracks = stampTracks(outline).map((track) =>
		pinned?.has(track.trackId)
			? { ...track, pinned: pinned.get(track.trackId) }
			: track,
	)
	const resolved = resolvedTracks(outline)
	const timezone = await getAthleteTimezone(userId)
	const weeks: StampWeekInput[] = []
	for (const weekKey of weekKeys) {
		const index = weekIndexOf(outline.startWeekKey, weekKey)
		if (
			index < 0 ||
			index >= weekCount ||
			weekKeyAt(outline.startWeekKey, index) !== weekKey
		) {
			continue
		}
		weeks.push({
			...stampWeekInput(weekKey, index, specs, resolved),
			held: await readHeldSessions(userId, outline.id, weekKey, timezone),
		})
	}
	const input = swap({
		days: stampDays(pattern, tracks, await getDisciplineThresholds(userId)),
		lifting: liftingSlots(pattern, tracks),
	})
	const { liftingDays } = await readStampProfile(userId)
	return {
		plans: planStamp({ ...input, liftingDays, tracks, weeks }),
		input,
		tracks,
	}
}

/**
 * The sessions in one week the stamp lays around and never writes (spec #588
 * story 34): the ones the athlete scheduled by hand, and any another plan
 * laid — scheduled or trained, as the day rule reads them. This plan's own
 * laid sessions are not among them: the stamp is what lays those. Skipped
 * and missed sessions were not trained, so they make no day hard.
 */
async function readHeldSessions(
	userId: string,
	planOutlineId: string,
	weekKey: string,
	timezone: string,
): Promise<PlacedSession[]> {
	const { start, end } = weekBoundsFromMondayUTC(weekKey, timezone)
	const [rows, thresholds] = await Promise.all([
		prisma.workoutSession.findMany({
			where: {
				userId,
				scheduledAt: { gte: start, lte: end },
				status: { in: [...TRAINED_SESSION_STATUSES] },
				OR: [
					{ source: 'authored' },
					{ planOutlineId: null },
					{ planOutlineId: { not: planOutlineId } },
				],
			},
			select: { scheduledAt: true, workout: sessionWorkoutSelect },
		}),
		// What an absolute pace, watts or bpm is read by (#617).
		getDisciplineThresholds(userId),
	])
	return rows.flatMap((row) => {
		const shape = readPlacement(row.workout, thresholds)
		if (!shape) return []
		const weekday = weekdayIndex(localDate(row.scheduledAt, timezone))
		return isPatternWeekday(weekday) ? [placedOn(shape, weekday)] : []
	})
}

/** A pattern slot: the weekday (Monday-first) and the Discipline laid there. */
function slotKey(weekday: number, discipline: string): string {
	return `${weekday}|${discipline}`
}

/**
 * A kept session of a lifting slot's Discipline on a day this week's laying
 * puts no lift of it on, where there is one. A lifting slot falls on no
 * weekday of its own (ADR 0104 §3), so a lift the athlete kept fills the slot
 * whatever day it is on, and the re-lay does not lay a second lift beside it.
 */
function keptLiftElsewhere(
	filled: ReadonlyMap<string, number>,
	sessions: readonly StampSession[],
	discipline: string,
): string | null {
	const laid = new Set(
		sessions
			.filter((session) => session.discipline === discipline)
			.map((session) => slotKey(session.weekday, discipline)),
	)
	for (const [slot, count] of filled) {
		if (count > 0 && slot.endsWith(`|${discipline}`) && !laid.has(slot)) {
			return slot
		}
	}
	return null
}

/**
 * The slots the plan's own sessions still fill in one week after its clearing
 * — the ones it kept: adopted, or trained — counted per weekday and
 * Discipline. Read inside the stamp's transaction, after the clearing.
 */
async function filledSlots(
	tx: Prisma.TransactionClient,
	userId: string,
	planOutlineId: string,
	weekKey: string,
	timezone: string,
): Promise<Map<string, number>> {
	const { start, end } = weekBoundsFromMondayUTC(weekKey, timezone)
	const kept = await tx.workoutSession.findMany({
		where: {
			userId,
			planOutlineId,
			scheduledAt: { gte: start, lte: end },
			source: { not: 'authored' },
		},
		select: { scheduledAt: true, workout: { select: { discipline: true } } },
	})
	const filled = new Map<string, number>()
	for (const session of kept) {
		if (!session.workout) continue
		const slot = slotKey(
			weekdayIndex(localDate(session.scheduledAt, timezone)),
			session.workout.discipline,
		)
		filled.set(slot, (filled.get(slot) ?? 0) + 1)
	}
	return filled
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
			// What the session is, in Norwegian (round 2): `Rolig økt · Løping`,
			// `Langtur · Løping`, `Terskeløkt · Løping` — the words the first
			// run's preview showed. Its duration is on every surface already.
			title: stampedSessionTitle(session),
			discipline: structure.discipline,
			// The share day's honest intent: the week's volume at an easy effort,
			// or — where the planner laid the week's **Quality Session Mix** on
			// it — the mix's zone (tempo, threshold, VO₂ max). A pattern day still
			// carries no zone (ADR 0044 §7); the zone is the segment's, and the
			// mix-disagreement check reads it back off this intent.
			intent:
				session.zone != null ? QUALITY_INTENTS[session.zone] : 'endurance',
			ownerId: userId,
			blocks: { create: buildBlocksCreate(structure.blocks) },
		},
		select: { id: true },
	})
	return workout.id
}

/**
 * The Workout intent a quality day is laid with: the intent whose zone
 * (`intentToZone`) is the mix's zone, so the mix check counts it as asked.
 */
const QUALITY_INTENTS = {
	3: 'tempo',
	4: 'threshold',
	5: 'vo2max',
} as const satisfies Record<QualityZone, WorkoutIntent>

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
	planOutlineId: string,
	plans: readonly StampWeekPlan[],
	timezone: string,
): Promise<StampConflict[]> {
	const conflicts: StampConflict[] = []
	for (const plan of plans) {
		const occupancy = await readWeekOccupancy(
			userId,
			planOutlineId,
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
		// A track on its **Pinned days** lays its mix first (ADR 0104 §4).
		pinned: parsePinnedDays(track.pinnedDays) != null,
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
	/** Times a fixed day's distance step, as the week header times it. */
	thresholds: DisciplineThresholdMap,
): StampDay[] {
	const currencyByTrack = new Map(
		tracks.map((track) => [track.trackId, track.currency]),
	)
	return pattern.days.flatMap((day): StampDay[] => {
		// A lifting slot has no weekday; `liftingSlots` reads it.
		if (day.weekday == null || !isPatternWeekday(day.weekday)) return []
		const currency = currencyByTrack.get(day.trackId)
		if (!currency) return []
		const priced = day.workout
			? fixedDayVolume(pricingBlocks(day.workout), currency, {
					thresholds,
					discipline: day.workout.discipline,
				})
			: null
		const position = {
			dayId: day.id,
			weekday: day.weekday,
			orderInDay: day.orderInDay,
			trackId: day.trackId,
			workoutId: day.workout?.id ?? null,
			// What the day's own Workout already is, so the mix does not ask a
			// share day for a session a fixed one is.
			zone: day.workout ? sessionZone(day.workout) : null,
			// A Simple Activity's own word, so a hard one is a day every track's
			// mix steps around (ADR 0104 §2).
			effort: isEffortWord(day.workout?.effortWord)
				? day.workout.effortWord
				: null,
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

/**
 * The pattern's **lifting slots** (ADR 0104 §3): its `lifting` rows on a
 * strength track of the plan, each with the session it copies. The stamp
 * lays them per week after the endurance mix. A stored `fixed` strength day
 * is not one: it is a **Pinned day** and stays on its weekday (§4).
 */
function liftingSlots(
	pattern: StampPattern,
	tracks: readonly StampTrack[],
): StampLiftingSlot[] {
	const strength = new Set(
		tracks
			.filter((track) => track.discipline === 'strength')
			.map((track) => track.trackId),
	)
	return pattern.days.flatMap((day): StampLiftingSlot[] =>
		day.kind === 'lifting' && strength.has(day.trackId)
			? [
					{
						dayId: day.id,
						trackId: day.trackId,
						workoutId: day.workout?.id ?? null,
						orderInDay: day.orderInDay,
					},
				]
			: [],
	)
}

/** A stored Workout's blocks in the shape `fixedDayVolume` prices. */
function pricingBlocks(workout: CopyableWorkout) {
	return workout.blocks.map((block) => ({
		repeatCount: block.repeatCount,
		seriesRepeatCount: block.seriesRepeatCount,
		betweenSeriesRestSec: block.betweenSeriesRestSec,
		steps: block.steps.map((step) => ({
			kind: step.kind,
			discipline: step.discipline,
			intensity: step.intensity,
			durationSec: step.durationSec,
			distanceM: step.distanceM,
		})),
	}))
}

/**
 * What a stamp reads off the **Athlete Profile**:
 *
 * - `at`, the clock time a stamped session lands on: the athlete's **Default
 *   Training Time**, or the documented convention where they never set one
 *   (ADR 0044 §4);
 * - `liftingDays`, the days a lifting slot may go on: their **Training
 *   Availability**, converted here at the profile edge to the Monday-first
 *   axis the stamp reads (ADR 0104). `undefined` where they never said, and
 *   the stamp lifts on the pattern's own days.
 */
async function readStampProfile(
	userId: string,
): Promise<{ at: string; liftingDays: PatternWeekday[] | undefined }> {
	const [profile, available] = await Promise.all([
		prisma.athleteProfile.findUnique({
			where: { userId },
			select: { defaultTrainingTime: true },
		}),
		readAvailablePatternDays(userId),
	])
	return {
		at: profile?.defaultTrainingTime ?? DEFAULT_TRAINING_TIME,
		liftingDays: available ?? undefined,
	}
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
	outlineId: string,
): Promise<StampedMixWarning[]> {
	const outline = await prisma.planOutline.findFirst({
		where: { id: outlineId, athleteId: userId },
		select: stampOutlineSelect,
	})
	if (!outline) return []

	const specs = phaseSpecs(outline)
	const weekCount = totalWeeks(specs)
	if (weekCount === 0) return []

	const timezone = await getAthleteTimezone(userId)
	const { start } = dayBoundsUTC(outline.startWeekKey, timezone)
	const { end } = weekBoundsFromMondayUTC(
		weekKeyAt(outline.startWeekKey, weekCount - 1),
		timezone,
	)
	const sessions = await prisma.workoutSession.findMany({
		where: {
			userId,
			planOutlineId: outline.id,
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
