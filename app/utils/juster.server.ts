/**
 * **Juster**'s writes and their _Angre_ (spec #558 S5, ADR 0100 §7). The rules
 * are `juster.ts`; this is where they land on today's session.
 *
 * Every Juster:
 *
 * - **touches today's session only** — and, for a _Bytt dag_ swap, the one
 *   session it swaps with. Nothing on the plan is read for writing, so the
 *   **Week Target** cannot move;
 * - **leaves a Replan Note** on each session it changed;
 * - **never changes ownership**, except _Bytt økt_. `source`, `adoptedAt` and
 *   `releasedAt` are in no other write here. On the machine's session that is
 *   the documented exception to Session Adoption (_For sliten i dag_, _Lite
 *   tid_: a machine write at the athlete's request, like the Session Nudge's
 *   ease); _Bytt dag_ is a reschedule, which never adopted anything. _Bytt
 *   økt_ (#579) is the athlete choosing another session, so it adopts under
 *   the normal rule, as `updateWorkoutSession` does;
 * - **keeps a before-image** on a `SessionAdjustment` row, whose id is the
 *   reply's undo token.
 *
 * A prescription is changed **in place** on the session's own Workout, as the
 * Session Nudge does. Where that Workout is shared (another session, a Week
 * Pattern day, the Catalogue, a fork of it), the change is written to a copy
 * instead, so nothing else moves with it.
 *
 * _Angre_ (`undoJuster`) puts back exactly what the image holds. It is
 * idempotent (`undoneAt` is claimed in the same transaction as its writes) and
 * **refuses rather than tramples** (ADR 0088): once a session it changed has
 * been trained, or has changed again since (another Juster, an edit, a Week
 * Replan, the Session Nudge).
 */
import { invariant } from '@epic-web/invariant'
import { type Prisma } from '@prisma/client'
import {
	addDays,
	dayBoundsUTC,
	localDate,
	localTimeOfDay,
	localTimeUTC,
	mondayOfDay,
} from './athlete-calendar.ts'
import { readRetrievableEntry } from './catalogue.server.ts'
import {
	type DurationReading,
	stepDurationSec,
	sumBlockDurationMin,
} from './dashboard.ts'
import { prisma } from './db.server.ts'
import { type EffortWord, isEffortWord } from './effort-word.ts'
import { formatNbWeekday } from './format.ts'
import {
	type JusterImage,
	type JusterIntent,
	type JusterPost,
	type JusterRefusal,
	type JusterUndoRefusal,
	EXERCISE_PICK_REPS,
	EXERCISE_PICK_SETS,
	type LaterDay,
	type MoveFit,
	parseJusterImage,
	type SwapSource,
	pickNewDay,
	shortMinutes,
	tiredMinutes,
	tiredSets,
} from './juster.ts'
import { JUSTER_LABELS, nbDurationLabel } from './labels.ts'
import { buildEasedPrescription } from './load/eased-prescription.ts'
import { recomputePlannedTssForSession } from './load/planned-tss.server.ts'
import { type PlacedSession } from './plan-outline/day-rule.ts'
import {
	placedOn,
	readPlacement,
	TRAINED_SESSION_STATUSES,
} from './plan-outline/session-placement.ts'
import { type PatternWeekday } from './plan-outline/week-pattern.ts'
import { stampedSessionTitle } from './session-title.ts'
import {
	readSimpleActivity,
	SIMPLE_ACTIVITY_INTENT,
} from './simple-activity.ts'
import {
	effortWorkoutSelect,
	getDisciplineThresholds,
} from './training.server.ts'
import {
	CARDIO_DISCIPLINES,
	isWorkoutIntent,
	type WorkoutIntent,
} from './workout-schema.ts'
import {
	buildBlocksCopy,
	copyWorkout,
	type CopyableWorkout,
	isMachineWritten,
	prescriptionFingerprint,
	workoutCopySelect,
} from './workout.server.ts'

export type JusterResult =
	| {
			ok: true
			/** The toast's line: what changed. */
			toast: string
			/** The session's title, which the toast quotes. */
			title: string
			/** Today's session first, then the one a swap moved. */
			changedSessionIds: string[]
			/** _Angre_'s token, posted back as `intent: undo`. */
			undo: { adjustmentId: string }
	  }
	| { ok: false; reason: JusterRefusal }

export type UndoJusterResult =
	| { ok: true; undone: boolean; title: string | null }
	| { ok: false; reason: JusterUndoRefusal }

const CARDIO: ReadonlySet<string> = new Set(CARDIO_DISCIPLINES)

/** What the change needs to read off a session. */
const sessionSelect = {
	id: true,
	scheduledAt: true,
	status: true,
	source: true,
	adoptedAt: true,
	releasedAt: true,
	recordingId: true,
	replanReason: true,
	workoutId: true,
	sessionLog: { select: { id: true } },
	workout: {
		select: {
			...workoutCopySelect,
			catalogueEntry: { select: { id: true } },
			_count: {
				select: {
					sessions: true,
					patternDays: true,
					copies: true,
					catalogueSaves: true,
				},
			},
		},
	},
} satisfies Prisma.WorkoutSessionSelect

type SessionRow = Prisma.WorkoutSessionGetPayload<{
	select: typeof sessionSelect
}>

/** Open: still planned, nothing trained or linked onto it. */
function isOpen(session: {
	status: string
	recordingId: string | null
	sessionLog: { id: string } | null
}): boolean {
	return (
		session.status === 'scheduled' &&
		session.recordingId == null &&
		session.sessionLog == null
	)
}

/**
 * One Juster on today's session. Owner-scoped: another athlete's session is
 * not found, and stays as it is.
 */
export async function justerSession(
	userId: string,
	post: JusterPost,
	{ now = new Date(), timezone }: { now?: Date; timezone: string },
): Promise<JusterResult> {
	const { sessionId } = post
	const session = await prisma.workoutSession.findFirst({
		where: { id: sessionId, userId },
		select: sessionSelect,
	})
	if (!session) return { ok: false, reason: 'session-not-found' }
	const todayKey = localDate(now, timezone)
	if (localDate(session.scheduledAt, timezone) !== todayKey) {
		return { ok: false, reason: 'not-today' }
	}
	if (!isOpen(session)) return { ok: false, reason: 'not-open' }
	const title = session.workout?.title ?? ''

	if (post.intent === 'move') {
		return moveSession(userId, session, { todayKey, timezone, title })
	}
	if (post.intent === 'swap') return swapSession(userId, session, post)
	const intent = post.intent
	const workout = session.workout
	if (!workout) return { ok: false, reason: 'no-workout' }
	const change = await PRESCRIPTION_CHANGES[intent](userId, workout)
	if (!change.ok) return change

	const adjustmentId = await writePrescription(userId, session, intent, change)
	await recomputePlannedTssForSession(userId, session.id)
	return {
		ok: true,
		toast: JUSTER_LABELS.done[intent](
			change.minutes == null ? null : nbDurationLabel(change.minutes * 60),
		),
		title,
		changedSessionIds: [session.id],
		undo: { adjustmentId },
	}
}

// ── the prescription: For sliten i dag and Lite tid ──────────────────────

type Blocks = CopyableWorkout['blocks']
type Workout = NonNullable<SessionRow['workout']>

/** The prescription a change writes, and how long it is now. */
type Change =
	| {
			ok: true
			title: string
			intent: KeptIntent
			effortWord: EffortWord | null
			blocks: Blocks
			/** Null where the session cannot be timed end to end, as a lift. */
			minutes: number | null
	  }
	| { ok: false; reason: JusterRefusal }

/** The Juster choices that write a new prescription on the session. */
type PrescriptionIntent = Exclude<JusterIntent, 'move'>

/** Each prescription choice and the change it makes. */
const PRESCRIPTION_CHANGES: Record<
	PrescriptionIntent,
	(userId: string, workout: Workout) => Promise<Change> | Change
> = {
	tired: (userId, workout) => tiredChange(userId, workout),
	short: (userId, workout) => shortChange(userId, workout),
}

/** A stored intent: a **Workout Intent**, or a Simple Activity's own. */
type KeptIntent = WorkoutIntent | typeof SIMPLE_ACTIVITY_INTENT

/**
 * A stored Workout's intent and Effort Word, read as the vocabularies they
 * are. Every Workout is written through its schema, so the intent always
 * reads; an Effort Word that does not is none.
 */
function keptWords(workout: Workout): {
	intent: KeptIntent
	effortWord: EffortWord | null
} {
	invariant(
		isWorkoutIntent(workout.intent) ||
			workout.intent === SIMPLE_ACTIVITY_INTENT,
		`Workout ${workout.id} has an unknown intent`,
	)
	return {
		intent: workout.intent,
		effortWord: isEffortWord(workout.effortWord) ? workout.effortWord : null,
	}
}

/** _For sliten i dag_. */
async function tiredChange(userId: string, workout: Workout): Promise<Change> {
	const simple = readSimpleActivity(workout)
	if (simple) {
		const minutes = tiredMinutes(simple.durationMin)
		if (minutes === simple.durationMin && simple.effortWord === 'rolig') {
			return { ok: false, reason: 'already-easy' }
		}
		return {
			ok: true,
			title: workout.title,
			intent: keptWords(workout).intent,
			effortWord: 'rolig',
			blocks: withSingleDuration(workout.blocks, minutes * 60),
			minutes,
		}
	}

	if (workout.discipline === 'strength') {
		const blocks = workout.blocks.map((block) => ({
			...block,
			steps: block.steps.map((step) =>
				step.kind === 'strength'
					? { ...step, sets: step.sets.slice(0, tiredSets(step.sets.length)) }
					: step,
			),
		}))
		const fewer = blocks.some((block, index) =>
			block.steps.some(
				(step, stepIndex) =>
					step.sets.length <
					workout.blocks[index]!.steps[stepIndex]!.sets.length,
			),
		)
		if (!fewer && workout.effortWord === 'rolig') {
			return { ok: false, reason: 'already-easy' }
		}
		return {
			ok: true,
			title: workout.title,
			intent: keptWords(workout).intent,
			effortWord: 'rolig',
			blocks,
			minutes: sumBlockDurationMin(blocks, {
				thresholds: {},
				discipline: workout.discipline,
			}),
		}
	}

	const thresholds = await getDisciplineThresholds(userId)
	// A session it cannot time end to end has no length to ease from: a short
	// total would make the easy session shorter than the one it replaces.
	const current = sumBlockDurationMin(workout.blocks, {
		thresholds,
		discipline: workout.discipline,
	})
	if (!CARDIO.has(workout.discipline) || current == null || current <= 0) {
		return { ok: false, reason: 'no-time' }
	}
	const minutes = tiredMinutes(current)
	if (
		minutes === current &&
		(workout.intent === 'endurance' || workout.intent === 'recovery')
	) {
		return { ok: false, reason: 'already-easy' }
	}
	// The Session Nudge's own easy session (one step in the athlete's endurance
	// zone), at the length chosen here rather than its one-hour cap.
	const eased = buildEasedPrescription({
		discipline: workout.discipline,
		durationMin: minutes,
		profile: thresholds[workout.discipline as keyof typeof thresholds] ?? null,
		capMin: minutes,
	})
	if (!eased.blocks) return { ok: false, reason: 'no-time' }
	return {
		ok: true,
		title: stampedSessionTitle({
			discipline: workout.discipline,
			role: 'ordinary',
			zone: null,
		}),
		intent: eased.intent,
		effortWord: keptWords(workout).effortWord,
		blocks: eased.blocks.map((block, blockIndex) => ({
			name: null,
			orderIndex: blockIndex,
			repeatCount: block.repeatCount,
			seriesRepeatCount: 1,
			betweenSeriesRestSec: null,
			sendOff: null,
			steps: block.steps.map((step, stepIndex) => ({
				...EMPTY_STEP,
				kind: step.kind,
				orderIndex: stepIndex,
				discipline: step.discipline,
				intensity: JSON.stringify(step.intensity),
				durationSec: step.durationSec,
			})),
		})),
		minutes,
	}
}

/** _Lite tid_: 30 minutes, or 20; the intent and the structure kept. */
async function shortChange(userId: string, workout: Workout): Promise<Change> {
	const simple = readSimpleActivity(workout)
	if (simple) {
		const minutes = shortMinutes(simple.durationMin)
		if (minutes == null) return { ok: false, reason: 'already-short' }
		return {
			ok: true,
			title: workout.title,
			...keptWords(workout),
			blocks: withSingleDuration(workout.blocks, minutes * 60),
			minutes,
		}
	}
	const thresholds = await getDisciplineThresholds(userId)
	const reading = { thresholds, discipline: workout.discipline }
	// Untimed end to end there is nothing honest to cut down to (#638).
	const current =
		workout.discipline === 'strength'
			? null
			: sumBlockDurationMin(workout.blocks, reading)
	if (current == null || current <= 0) return { ok: false, reason: 'no-time' }
	const minutes = shortMinutes(current)
	if (minutes == null) return { ok: false, reason: 'already-short' }
	return {
		ok: true,
		title: workout.title,
		...keptWords(workout),
		blocks: scaledTo(workout.blocks, minutes * 60, reading),
		minutes,
	}
}

/** A step with nothing on it but what a cardio step must say. */
const EMPTY_STEP: Omit<
	Blocks[number]['steps'][number],
	'kind' | 'orderIndex' | 'discipline' | 'intensity' | 'durationSec'
> = {
	notes: null,
	distanceM: null,
	verticalM: null,
	gradePct: null,
	cadenceRpmMin: null,
	cadenceRpmMax: null,
	rest: null,
	exerciseId: null,
	restBetweenSetsSec: null,
	intensityHrMin: null,
	intensityHrMax: null,
	intensityPowerMin: null,
	intensityPowerMax: null,
	intensityPaceMin: null,
	intensityPaceMax: null,
	sets: [],
}

/** A Simple Activity's one step, at a new length. */
function withSingleDuration(blocks: Blocks, durationSec: number): Blocks {
	return blocks.map((block) => ({
		...block,
		steps: block.steps.map((step) => ({ ...step, durationSec })),
	}))
}

/**
 * Every cardio step's time and distance scaled by one factor, so the timed
 * steps sum to `targetSec` — the reps stay reps and the threshold stays
 * threshold, only shorter. Times round to 10 seconds and distances to 100 m,
 * never to nothing; a rest step keeps its length.
 */
function scaledTo(
	blocks: Blocks,
	targetSec: number,
	reading: DurationReading,
): Blocks {
	// A distance rep scales with the time it takes at its pace, and the rests
	// between series stay as they are (#615).
	let fixed = 0
	let scalable = 0
	for (const block of blocks) {
		const times = block.repeatCount * (block.seriesRepeatCount ?? 1)
		for (const step of block.steps) {
			const stepSec = stepDurationSec(step, reading)
			if (stepSec == null) continue
			if (step.kind === 'cardio') scalable += stepSec * times
			else fixed += stepSec * times
		}
		fixed +=
			(block.betweenSeriesRestSec ?? 0) * ((block.seriesRepeatCount ?? 1) - 1)
	}
	const factor = scalable > 0 ? Math.max(0, targetSec - fixed) / scalable : 1
	return blocks.map((block) => ({
		...block,
		steps: block.steps.map((step) =>
			step.kind === 'cardio'
				? {
						...step,
						durationSec:
							step.durationSec == null
								? null
								: Math.max(
										10,
										Math.round((step.durationSec * factor) / 10) * 10,
									),
						distanceM:
							step.distanceM == null
								? null
								: Math.max(
										100,
										Math.round((step.distanceM * factor) / 100) * 100,
									),
					}
				: step,
		),
	}))
}

/**
 * Whether a Workout is anyone else's to read as well: another session, a
 * Week Pattern day, the Catalogue, someone's list or a fork of it. Changing
 * it in place would change them with it.
 */
function isShared(workout: Workout): boolean {
	const { sessions, patternDays, copies, catalogueSaves } = workout._count
	return (
		workout.catalogueEntry != null ||
		sessions > 1 ||
		patternDays + copies + catalogueSaves > 0
	)
}

/** What an undo must still find on a Workout: its prescription, as it stands. */
function fingerprintOf(
	workout: Pick<Workout, 'title' | 'discipline' | 'intent' | 'effortWord'> & {
		blocks: Blocks
	},
): string {
	return JSON.stringify([
		workout.title,
		workout.discipline,
		workout.intent,
		workout.effortWord,
		prescriptionFingerprint(buildBlocksCopy(workout.blocks)),
	])
}

async function writePrescription(
	userId: string,
	session: SessionRow,
	intent: PrescriptionIntent,
	change: Extract<Change, { ok: true }>,
): Promise<string> {
	const workout = session.workout!
	const note = JUSTER_LABELS.note[intent]
	return prisma.$transaction(async (tx) => {
		const data = {
			title: change.title,
			intent: change.intent,
			effortWord: change.effortWord,
		}
		let workoutId = workout.id
		let forkId: string | null = null
		if (isShared(workout)) {
			// The session's own copy, changed; the shared row stays as it is.
			const fork = await tx.workout.create({
				data: {
					...data,
					description: workout.description,
					discipline: workout.discipline,
					archetype: workout.archetype,
					activityKind: workout.activityKind,
					ownerId: userId,
					blocks: { create: buildBlocksCopy(change.blocks) },
				},
				select: { id: true },
			})
			workoutId = fork.id
			forkId = fork.id
		} else {
			await tx.workoutBlock.deleteMany({ where: { workoutId } })
			await tx.workout.update({
				where: { id: workoutId },
				data: { ...data, blocks: { create: buildBlocksCopy(change.blocks) } },
			})
		}
		const written = await tx.workout.findUniqueOrThrow({
			where: { id: workoutId },
			select: workoutCopySelect,
		})
		await tx.workoutSession.update({
			where: { id: session.id },
			data: { replanReason: note, workoutId },
		})
		const image: JusterImage = {
			sessions: [
				{
					id: session.id,
					scheduledAt: session.scheduledAt.toISOString(),
					replanReason: session.replanReason,
					workoutId: session.workoutId,
					after: {
						scheduledAt: session.scheduledAt.toISOString(),
						workoutId,
					},
				},
			],
			workout: {
				id: workout.id,
				title: workout.title,
				intent: workout.intent,
				effortWord: workout.effortWord,
				blocks: workout.blocks,
				forkId,
				afterFingerprint: fingerprintOf(written),
			},
		}
		const adjustment = await tx.sessionAdjustment.create({
			data: {
				userId,
				sessionId: session.id,
				intent,
				beforeImage: JSON.stringify(image),
			},
			select: { id: true },
		})
		return adjustment.id
	})
}

// ── Bytt dag ─────────────────────────────────────────────────────────────

/** `fredag` — a day key's weekday, read as its own calendar day. */
function weekdayOf(dayKey: string): string {
	return formatNbWeekday(new Date(`${dayKey}T12:00:00Z`), 'UTC')
}

/** A day key's weekday on the Week Pattern's axis: Monday 0 … Sunday 6. */
function patternWeekdayOf(dayKey: string): PatternWeekday {
	return ((new Date(`${dayKey}T12:00:00Z`).getUTCDay() + 6) %
		7) as PatternWeekday
}

/**
 * What _Bytt dag_'s day rule reads (spec #588): this week's sessions from
 * today on, each on its weekday, without the one that moves — skipped and
 * missed ones are not trained, so they make no day hard — and that session.
 * Earlier days are past; leaving them out keeps Sunday from reading this
 * week's Monday as the day after it.
 */
async function readMoveFit(
	userId: string,
	sessionId: string,
	{
		todayKey,
		sundayKey,
		timezone,
	}: { todayKey: string; sundayKey: string; timezone: string },
): Promise<MoveFit> {
	const [rows, thresholds] = await Promise.all([
		prisma.workoutSession.findMany({
			where: {
				userId,
				status: { in: [...TRAINED_SESSION_STATUSES] },
				scheduledAt: {
					gte: dayBoundsUTC(todayKey, timezone).start,
					lte: dayBoundsUTC(sundayKey, timezone).end,
				},
			},
			select: {
				id: true,
				scheduledAt: true,
				workout: effortWorkoutSelect,
			},
		}),
		// What an absolute pace, watts or bpm is read by (#617).
		getDisciplineThresholds(userId),
	])
	// Each by the one reading of a stored session (`readPlacement`): a lift
	// is lifting, a _Langtur_ is long, anything else by its Effort Word.
	const moving = rows.find((row) => row.id === sessionId)
	const week: PlacedSession[] = rows.flatMap((row) => {
		const shape =
			row.id === sessionId ? null : readPlacement(row.workout, thresholds)
		return shape
			? [
					placedOn(
						shape,
						patternWeekdayOf(localDate(row.scheduledAt, timezone)),
					),
				]
			: []
	})
	return {
		week,
		session: readPlacement(moving?.workout, thresholds) ?? {
			kind: 'session',
			effort: 'rolig',
		},
	}
}

/** The same local time of day on another local day. */
function onDay(instant: Date, dayKey: string, timezone: string): Date {
	return localTimeUTC(dayKey, localTimeOfDay(instant, timezone), timezone)
}

async function moveSession(
	userId: string,
	session: SessionRow,
	{
		todayKey,
		timezone,
		title,
	}: { todayKey: string; timezone: string; title: string },
): Promise<JusterResult> {
	const sundayKey = addDays(mondayOfDay(todayKey), 6)
	const later =
		todayKey < sundayKey
			? await prisma.workoutSession.findMany({
					where: {
						userId,
						scheduledAt: {
							gte: dayBoundsUTC(addDays(todayKey, 1), timezone).start,
							lte: dayBoundsUTC(sundayKey, timezone).end,
						},
					},
					orderBy: { scheduledAt: 'asc' },
					select: {
						id: true,
						scheduledAt: true,
						status: true,
						recordingId: true,
						replanReason: true,
						workoutId: true,
						sessionLog: { select: { id: true } },
						workout: { select: { title: true } },
					},
				})
			: []
	const days: LaterDay[] = []
	for (
		let key = addDays(todayKey, 1);
		key <= sundayKey;
		key = addDays(key, 1)
	) {
		const on = later.filter(
			(one) => localDate(one.scheduledAt, timezone) === key,
		)
		days.push({
			key,
			weekday: patternWeekdayOf(key),
			occupied: on.length > 0,
			openSessionIds: on.filter(isOpen).map((one) => one.id),
		})
	}
	if (days.length === 0) return { ok: false, reason: 'no-later-day' }
	const fit = await readMoveFit(userId, session.id, {
		todayKey,
		sundayKey,
		timezone,
	})
	const pick = pickNewDay(days, fit)
	if (pick.kind === 'refused') return { ok: false, reason: pick.reason }

	const moved = onDay(session.scheduledAt, pick.toKey, timezone)
	const partner =
		pick.kind === 'swap'
			? later.find((one) => one.id === pick.withSessionId)!
			: null
	const partnerMoved = partner
		? onDay(partner.scheduledAt, todayKey, timezone)
		: null

	const adjustmentId = await prisma.$transaction(async (tx) => {
		await tx.workoutSession.update({
			where: { id: session.id },
			data: {
				scheduledAt: moved,
				replanReason: JUSTER_LABELS.note.moved(weekdayOf(todayKey)),
			},
		})
		if (partner && partnerMoved) {
			await tx.workoutSession.update({
				where: { id: partner.id },
				data: {
					scheduledAt: partnerMoved,
					replanReason: JUSTER_LABELS.note.moved(weekdayOf(pick.toKey)),
				},
			})
		}
		const image: JusterImage = {
			sessions: [
				{
					id: session.id,
					scheduledAt: session.scheduledAt.toISOString(),
					replanReason: session.replanReason,
					workoutId: session.workoutId,
					after: {
						scheduledAt: moved.toISOString(),
						workoutId: session.workoutId,
					},
				},
				...(partner && partnerMoved
					? [
							{
								id: partner.id,
								scheduledAt: partner.scheduledAt.toISOString(),
								replanReason: partner.replanReason,
								workoutId: partner.workoutId,
								after: {
									scheduledAt: partnerMoved.toISOString(),
									workoutId: partner.workoutId,
								},
							},
						]
					: []),
			],
			workout: null,
		}
		const adjustment = await tx.sessionAdjustment.create({
			data: {
				userId,
				sessionId: session.id,
				intent: 'move',
				beforeImage: JSON.stringify(image),
			},
			select: { id: true },
		})
		return adjustment.id
	})

	const day = weekdayOf(pick.toKey)
	const clash = pick.kind === 'move' ? pick.clash : null
	return {
		ok: true,
		toast: partner
			? JUSTER_LABELS.done.swapped(day, partner.workout?.title ?? '')
			: clash
				? JUSTER_LABELS.done.movedAnyway(
						day,
						JUSTER_LABELS.clash[clash.reason]({
							lifting: fit.session.kind === 'lifting',
							after: clash.weekday !== patternWeekdayOf(pick.toKey),
						}),
					)
				: JUSTER_LABELS.done.moved(day),
		title,
		changedSessionIds: partner ? [session.id, partner.id] : [session.id],
		undo: { adjustmentId },
	}
}

// ── Bytt økt ─────────────────────────────────────────────────────────────

/** What a pick puts on today: a prescription to copy, and where it came from. */
type PickedWorkout = { workout: CopyableWorkout; copiedFromId: string | null }

/**
 * A pick, read through Bibliotek's own guards: a Catalogue session the list
 * would show, a seeded program's day, an exercise in the bank.
 */
async function readPick(
	userId: string,
	from: SwapSource,
	pickId: string,
): Promise<PickedWorkout | null> {
	if (from === 'catalogue') {
		const entry = await readRetrievableEntry(userId, pickId)
		if (!entry) return null
		const workout = await prisma.workout.findUnique({
			where: { id: entry.workout.id },
			select: workoutCopySelect,
		})
		return workout ? { workout, copiedFromId: workout.id } : null
	}
	if (from === 'program') {
		const day = await prisma.strengthProgramDay.findFirst({
			where: { id: pickId, program: { authorship: 'system' } },
			select: { workout: { select: workoutCopySelect } },
		})
		return day ? { workout: day.workout, copiedFromId: day.workout.id } : null
	}
	return exercisePick(userId, pickId)
}

type Step = Blocks[number]['steps'][number]

/** A set with nothing on it but its reps. */
const EMPTY_SET: Omit<Step['sets'][number], 'orderIndex' | 'reps'> = {
	kind: 'reps',
	load: null,
	weightKg: null,
	pct1RM: null,
	effortCap: null,
	tempo: null,
	durationSec: null,
	terminationRir: null,
	velocityLossPct: null,
}

/**
 * One exercise as today's session: the sets the athlete last planned for it,
 * or 3 × 8 when they never have. A fresh prescription, copied from nothing.
 */
async function exercisePick(
	userId: string,
	exerciseId: string,
): Promise<PickedWorkout | null> {
	// The bank Bibliotek lists: trainm8's exercises and the athlete's own.
	const exercise = await prisma.exercise.findFirst({
		where: {
			id: exerciseId,
			OR: [{ authorship: 'system' }, { createdByAthleteId: userId }],
		},
		select: { id: true, name: true },
	})
	if (!exercise) return null
	const last = await prisma.workoutStep.findFirst({
		where: {
			kind: 'strength',
			exerciseId,
			block: { workout: { sessions: { some: { userId } } } },
		},
		orderBy: { block: { workout: { createdAt: 'desc' } } },
		select: {
			restBetweenSetsSec: true,
			sets: workoutCopySelect.blocks.select.steps.select.sets,
			block: { select: { workout: { select: { intent: true } } } },
		},
	})
	const sets: Step['sets'] =
		last && last.sets.length > 0
			? last.sets
			: Array.from({ length: EXERCISE_PICK_SETS }, (_, orderIndex) => ({
					...EMPTY_SET,
					orderIndex,
					reps: EXERCISE_PICK_REPS,
				}))
	const lastIntent = last?.block.workout.intent
	return {
		copiedFromId: null,
		workout: {
			id: exercise.id,
			title: exercise.name,
			description: null,
			discipline: 'strength',
			intent: lastIntent?.startsWith('strength')
				? lastIntent
				: 'strength-hypertrophy',
			archetype: null,
			activityKind: null,
			effortWord: null,
			visibility: 'private',
			blocks: [
				{
					name: null,
					orderIndex: 0,
					repeatCount: 1,
					seriesRepeatCount: 1,
					betweenSeriesRestSec: null,
					sendOff: null,
					steps: [
						{
							...EMPTY_STEP,
							kind: 'strength',
							orderIndex: 0,
							discipline: null,
							intensity: null,
							durationSec: null,
							exerciseId: exercise.id,
							restBetweenSetsSec: last?.restBetweenSetsSec ?? null,
							sets,
						},
					],
				},
			],
		},
	}
}

/**
 * _Bytt økt_: the pick, copied, on today's session in place of what stood.
 * The session keeps its day and its time. It adopts the machine's session,
 * and takes back one handed back, the way an athlete's edit does
 * (`updateWorkoutSession`); the plan's Replan Note goes with the prescription
 * it explained. The Workout that stood is left as it was, so the undo only
 * points back to it and removes the copy.
 */
async function swapSession(
	userId: string,
	session: SessionRow,
	{ from, pickId }: { from: SwapSource; pickId: string },
): Promise<JusterResult> {
	const pick = await readPick(userId, from, pickId)
	if (!pick) return { ok: false, reason: 'pick-not-found' }
	const adopting = session.adoptedAt == null && isMachineWritten(session.source)

	const adjustmentId = await prisma.$transaction(async (tx) => {
		const copy = await copyWorkout(
			tx,
			pick.workout,
			userId,
			pick.copiedFromId ? { copiedFromId: pick.copiedFromId } : {},
		)
		const written = await tx.workout.findUniqueOrThrow({
			where: { id: copy.id },
			select: workoutCopySelect,
		})
		await tx.workoutSession.update({
			where: { id: session.id },
			data: {
				workoutId: copy.id,
				replanReason: null,
				...(adopting ? { adoptedAt: new Date() } : {}),
				releasedAt: null,
			},
		})
		const image: JusterImage = {
			sessions: [
				{
					id: session.id,
					scheduledAt: session.scheduledAt.toISOString(),
					replanReason: session.replanReason,
					workoutId: session.workoutId,
					after: {
						scheduledAt: session.scheduledAt.toISOString(),
						workoutId: copy.id,
					},
				},
			],
			workout: null,
			swap: {
				beforeTitle: session.workout?.title ?? null,
				adoptedAt: session.adoptedAt?.toISOString() ?? null,
				releasedAt: session.releasedAt?.toISOString() ?? null,
				copyId: copy.id,
				afterFingerprint: fingerprintOf(written),
			},
		}
		const adjustment = await tx.sessionAdjustment.create({
			data: {
				userId,
				sessionId: session.id,
				intent: 'swap',
				beforeImage: JSON.stringify(image),
			},
			select: { id: true },
		})
		return adjustment.id
	})
	await recomputePlannedTssForSession(userId, session.id)

	return {
		ok: true,
		toast: JUSTER_LABELS.done.swappedSession(pick.workout.title),
		title: pick.workout.title,
		changedSessionIds: [session.id],
		undo: { adjustmentId },
	}
}

// ── Angre ────────────────────────────────────────────────────────────────

class Refused extends Error {
	constructor(readonly reason: JusterUndoRefusal) {
		super(reason)
	}
}

/**
 * _Angre_ on a Juster: every session it touched back to its placement, its
 * Replan Note and its Workout, and the prescription it replaced written back.
 * `undone` is false when it had been taken back already.
 */
export async function undoJuster(
	userId: string,
	adjustmentId: string,
	now: Date = new Date(),
): Promise<UndoJusterResult> {
	const adjustment = await prisma.sessionAdjustment.findFirst({
		where: { id: adjustmentId, userId },
		select: {
			id: true,
			undoneAt: true,
			beforeImage: true,
			session: { select: { workout: { select: { title: true } } } },
		},
	})
	if (!adjustment) return { ok: false, reason: 'not-found' }
	const image = parseJusterImage(adjustment.beforeImage)
	const title = image.swap
		? image.swap.beforeTitle
		: (image.workout?.title ?? adjustment.session.workout?.title ?? null)
	if (adjustment.undoneAt) return { ok: true, undone: false, title }

	let undone: boolean
	try {
		undone = await prisma.$transaction(async (tx) => {
			// Claimed first, so a second tap (or a concurrent one) finds it taken
			// and writes nothing; a refusal below rolls the claim back with the rest.
			const claimed = await tx.sessionAdjustment.updateMany({
				where: { id: adjustment.id, undoneAt: null },
				data: { undoneAt: now },
			})
			if (claimed.count === 0) return false
			await restore(tx, userId, image)
			return true
		})
	} catch (error) {
		if (error instanceof Refused) return { ok: false, reason: error.reason }
		throw error
	}
	if (undone && (image.workout || image.swap)) {
		await recomputePlannedTssForSession(userId, image.sessions[0]!.id)
	}
	return { ok: true, undone, title }
}

async function restore(
	tx: Prisma.TransactionClient,
	userId: string,
	image: JusterImage,
) {
	const ids = image.sessions.map((one) => one.id)
	const sessions = await tx.workoutSession.findMany({
		where: { id: { in: ids }, userId },
		select: {
			id: true,
			scheduledAt: true,
			status: true,
			recordingId: true,
			workoutId: true,
			sessionLog: { select: { id: true } },
			workout: { select: workoutCopySelect },
		},
	})
	for (const before of image.sessions) {
		const now = sessions.find((one) => one.id === before.id)
		if (!now) throw new Refused('changed')
		if (!isOpen(now)) throw new Refused('session-trained')
		if (
			now.scheduledAt.toISOString() !== before.after.scheduledAt ||
			now.workoutId !== before.after.workoutId
		) {
			throw new Refused('changed')
		}
	}
	const prescription = image.workout
	const afterFingerprint =
		prescription?.afterFingerprint ?? image.swap?.afterFingerprint
	if (afterFingerprint) {
		const current = sessions.find((one) => one.id === image.sessions[0]!.id)
		if (
			!current?.workout ||
			fingerprintOf(current.workout) !== afterFingerprint
		) {
			throw new Refused('changed')
		}
	}

	for (const before of image.sessions) {
		await tx.workoutSession.update({
			where: { id: before.id },
			data: {
				scheduledAt: new Date(before.scheduledAt),
				replanReason: before.replanReason,
				workoutId: before.workoutId,
			},
		})
	}
	if (image.swap) {
		// Ownership back as it stood, and the copy Bytt økt put on today gone.
		const { adoptedAt, releasedAt, copyId } = image.swap
		await tx.workoutSession.update({
			where: { id: image.sessions[0]!.id },
			data: {
				adoptedAt: adoptedAt ? new Date(adoptedAt) : null,
				releasedAt: releasedAt ? new Date(releasedAt) : null,
			},
		})
		await tx.workout.delete({ where: { id: copyId } })
	}
	if (!prescription) return
	if (prescription.forkId) {
		await tx.workout.delete({ where: { id: prescription.forkId } })
		return
	}
	await tx.workoutBlock.deleteMany({ where: { workoutId: prescription.id } })
	await tx.workout.update({
		where: { id: prescription.id },
		data: {
			title: prescription.title,
			intent: prescription.intent,
			effortWord: prescription.effortWord,
			blocks: {
				create: buildBlocksCopy(prescription.blocks as unknown as Blocks),
			},
		},
	})
}
