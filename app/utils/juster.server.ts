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
 * - **never changes ownership.** `source`, `adoptedAt` and `releasedAt` are
 *   not in any write here. On the machine's session that is the documented
 *   exception to Session Adoption (_For sliten i dag_, _Lite tid_: a machine
 *   write at the athlete's request, like the Session Nudge's ease); _Bytt dag_
 *   is a reschedule, which never adopted anything;
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
import { type Prisma } from '@prisma/client'
import {
	addDays,
	dayBoundsUTC,
	localDate,
	localTimeOfDay,
	localTimeUTC,
	mondayOfDay,
} from './athlete-calendar.ts'
import { sumBlockDurationMin } from './dashboard.ts'
import { prisma } from './db.server.ts'
import { formatNbWeekday } from './format.ts'
import {
	type JusterImage,
	type JusterIntent,
	type JusterPost,
	type JusterRefusal,
	type JusterUndoRefusal,
	type LaterDay,
	parseJusterImage,
	pickNewDay,
	shortMinutes,
	tiredMinutes,
	tiredSets,
} from './juster.ts'
import { JUSTER_LABELS, nbDurationLabel } from './labels.ts'
import { buildEasedPrescription } from './load/eased-prescription.ts'
import { recomputePlannedTssForSession } from './load/planned-tss.server.ts'
import { stampedSessionTitle } from './session-title.ts'
import { readSimpleActivity } from './simple-activity.ts'
import { getDisciplineThresholds } from './training.server.ts'
import { CARDIO_DISCIPLINES } from './workout-schema.ts'
import {
	buildBlocksCopy,
	type CopyableWorkout,
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
	{ intent, sessionId }: JusterPost,
	{ now = new Date(), timezone }: { now?: Date; timezone: string },
): Promise<JusterResult> {
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

	if (intent === 'move') {
		return moveSession(userId, session, { todayKey, timezone, title })
	}
	const workout = session.workout
	if (!workout) return { ok: false, reason: 'no-workout' }
	const change =
		intent === 'tired'
			? await tiredChange(userId, workout)
			: shortChange(workout)
	if (!change.ok) return change

	const adjustmentId = await writePrescription(userId, session, intent, change)
	await recomputePlannedTssForSession(userId, session.id)
	return {
		ok: true,
		toast: (intent === 'tired'
			? JUSTER_LABELS.done.tired
			: JUSTER_LABELS.done.short)(nbDurationLabel(change.minutes * 60)),
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
			intent: string
			effortWord: string | null
			blocks: Blocks
			minutes: number
	  }
	| { ok: false; reason: JusterRefusal }

/** _For sliten i dag_. */
async function tiredChange(userId: string, workout: Workout): Promise<Change> {
	const simple = readSimpleActivity(workout)
	if (simple) {
		const minutes = tiredMinutes(simple.durationMin)
		if (minutes === simple.durationMin && simple.effortWord === 'light') {
			return { ok: false, reason: 'already-easy' }
		}
		return {
			ok: true,
			title: workout.title,
			intent: workout.intent,
			effortWord: 'light',
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
		if (!fewer && workout.effortWord === 'light') {
			return { ok: false, reason: 'already-easy' }
		}
		return {
			ok: true,
			title: workout.title,
			intent: workout.intent,
			effortWord: 'light',
			blocks,
			minutes: sumBlockDurationMin(blocks) ?? 0,
		}
	}

	const current = sumBlockDurationMin(workout.blocks)
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
	const thresholds = await getDisciplineThresholds(userId)
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
		effortWord: workout.effortWord,
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
function shortChange(workout: Workout): Change {
	const simple = readSimpleActivity(workout)
	if (simple) {
		const minutes = shortMinutes(simple.durationMin)
		if (minutes == null) return { ok: false, reason: 'already-short' }
		return {
			ok: true,
			title: workout.title,
			intent: workout.intent,
			effortWord: workout.effortWord,
			blocks: withSingleDuration(workout.blocks, minutes * 60),
			minutes,
		}
	}
	const current =
		workout.discipline === 'strength'
			? null
			: sumBlockDurationMin(workout.blocks)
	if (current == null || current <= 0) return { ok: false, reason: 'no-time' }
	const minutes = shortMinutes(current)
	if (minutes == null) return { ok: false, reason: 'already-short' }
	return {
		ok: true,
		title: workout.title,
		intent: workout.intent,
		effortWord: workout.effortWord,
		blocks: scaledTo(workout.blocks, minutes * 60),
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
function scaledTo(blocks: Blocks, targetSec: number): Blocks {
	let fixed = 0
	let scalable = 0
	for (const block of blocks) {
		const times = block.repeatCount * (block.seriesRepeatCount ?? 1)
		for (const step of block.steps) {
			if (step.durationSec == null) continue
			if (step.kind === 'cardio') scalable += step.durationSec * times
			else fixed += step.durationSec * times
		}
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
function fingerprintOf(workout: {
	title: string
	discipline: string
	intent: string
	effortWord: string | null
	blocks: Blocks
}): string {
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
	intent: Exclude<JusterIntent, 'move'>,
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
			occupied: on.length > 0,
			openSessionIds: on.filter(isOpen).map((one) => one.id),
		})
	}
	const pick = pickNewDay(days)
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
	return {
		ok: true,
		toast: partner
			? JUSTER_LABELS.done.swapped(day, partner.workout?.title ?? '')
			: JUSTER_LABELS.done.moved(day),
		title,
		changedSessionIds: partner ? [session.id, partner.id] : [session.id],
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
	const title =
		image.workout?.title ?? adjustment.session.workout?.title ?? null
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
	if (undone && image.workout) {
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
	if (prescription) {
		const current = sessions.find((one) => one.id === image.sessions[0]!.id)
		if (
			!current?.workout ||
			fingerprintOf(current.workout) !== prescription.afterFingerprint
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
