/**
 * Week Replan proposals on the server (#505, ADR 0080 steps 2–5): storing them,
 * and what an Ok, a Nei takk and silence each do to them.
 *
 * The apply rules, which no author can change:
 *
 * - **Ok** (`answerProposal(…, 'accepted')`) applies the proposal, whoever owns
 *   the target and whichever way the load goes: the athlete said yes.
 * - **Nei takk** (`'declined'`) applies nothing, ever.
 * - **Silence** (`applyDueProposals`) applies a pending proposal only when it
 *   keeps or reduces load **and** its target is the machine's **at apply
 *   time** — ownership is re-read from the row, never trusted from when the
 *   proposal was written, so a session adopted in between is left alone. A
 *   proposal whose session changed after it was written is stale and is left
 *   alone too: it describes a prescription that no longer exists. Silence never
 *   takes a move "fra nå av" — that is a rule only the athlete can state.
 *
 * A missed session is never moved: a make-up move places a copy on the free day
 * and leaves the missed session on its own day, read as _ikke gjort_.
 *
 * Every write keeps the session's `source` and adoption exactly as they were
 * (ADR 0016) and records why on its Replan Note; each changed prescription
 * re-prices its Planned TSS after commit (ADR 0019).
 */

import { type Prisma } from '@prisma/client'
import {
	addDays,
	localDate,
	localTimeOfDay,
	localTimeUTC,
	weekBoundsFromMondayUTC,
} from '#app/utils/athlete-calendar.ts'
import { sumBlockDistanceM, sumBlockDurationMin } from '#app/utils/dashboard.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	MACHINE_OWNED_SESSION,
	sessionOwner,
} from '#app/utils/session-ownership.ts'
import { copyWorkout, workoutCopySelect } from '#app/utils/workout.server.ts'
import { recomputePlannedTssForSession } from './planned-tss.server.ts'
import {
	loadDirectionOf,
	parseProposalPayload,
	type ProposalDraft,
	type ProposalPayload,
	type ProposalScope,
} from './week-replan-proposal.ts'
import { scaleStepQuantities } from './week-replan.ts'

/** The athlete's "Gjør uka lettere −15 %" (#505 user story 51). */
export const EASE_WEEK_FACTOR = 0.85

const EASE_WEEK_REASON =
	'Du ba om en lettere uke, så de øktene som er igjen er gjort ca. 15 % kortere.'

// ── storing ─────────────────────────────────────────────────────────────────

/**
 * Store an author's drafts as pending proposals. The load direction is read
 * off each payload here, never taken from the author, and a move starts as
 * "bare denne gangen" until the athlete says otherwise.
 */
export async function recordProposals(
	tx: Prisma.TransactionClient,
	userId: string,
	drafts: ProposalDraft[],
	weekReplanId: string | null = null,
): Promise<void> {
	for (const draft of drafts) {
		await tx.weekReplanProposal.create({
			data: proposalData(userId, draft, weekReplanId),
		})
	}
}

function proposalData(
	userId: string,
	draft: ProposalDraft,
	weekReplanId: string | null,
) {
	return {
		athleteId: userId,
		weekReplanId,
		kind: draft.payload.kind,
		payload: JSON.stringify(draft.payload),
		reason: draft.reason,
		loadDirection: loadDirectionOf(draft.payload),
		scope: draft.payload.kind === 'move' ? 'this-time' : null,
		targetSessionId: draft.targetSessionId,
		targetWeekKey: draft.targetWeekKey,
	} satisfies Prisma.WeekReplanProposalUncheckedCreateInput
}

// ── answering ───────────────────────────────────────────────────────────────

export type AnswerProposalResult =
	| { ok: true; applied: boolean }
	| {
			ok: false
			reason:
				| 'not-found'
				| 'already-answered'
				| 'already-applied'
				| 'scope-not-a-move'
	  }

/**
 * The athlete's Ok or Nei takk on one proposal. Ok applies it (with the move
 * scope they chose, for a move); Nei takk applies nothing. `applied` is false
 * on an Ok when the target is gone or past by now — the answer is still kept.
 */
export async function answerProposal(
	userId: string,
	proposalId: string,
	answer: 'accepted' | 'declined',
	scope?: ProposalScope,
	now: Date = new Date(),
): Promise<AnswerProposalResult> {
	const proposal = await prisma.weekReplanProposal.findFirst({
		where: { id: proposalId, athleteId: userId },
		select: proposalSelect,
	})
	if (!proposal) return { ok: false, reason: 'not-found' }
	if (proposal.answer !== 'pending') {
		return { ok: false, reason: 'already-answered' }
	}
	if (proposal.appliedAt) return { ok: false, reason: 'already-applied' }
	const payload = parseProposalPayload(proposal.payload)
	if (scope && payload.kind !== 'move') {
		return { ok: false, reason: 'scope-not-a-move' }
	}

	const timezone = await athleteTimezone(userId)
	const chosenScope = (scope ?? proposal.scope ?? 'this-time') as ProposalScope
	const outcome = await prisma.$transaction(async (tx) => {
		// Claim the proposal first, so a concurrent silence sweep and this answer
		// can never both apply it.
		const claimed = await tx.weekReplanProposal.updateMany({
			where: { id: proposal.id, answer: 'pending', appliedAt: null },
			data: {
				answer,
				answeredAt: now,
				...(payload.kind === 'move' ? { scope: chosenScope } : {}),
			},
		})
		if (claimed.count === 0) return null
		if (answer === 'declined') return { applied: false, changed: [] }

		const result = await applyPayload(tx, {
			userId,
			proposal,
			payload,
			scope: chosenScope,
			by: 'yes',
			now,
			timezone,
		})
		if (result.applied) {
			await tx.weekReplanProposal.update({
				where: { id: proposal.id },
				data: { appliedAt: now },
			})
		}
		return result
	})
	if (!outcome) return { ok: false, reason: 'already-answered' }

	await repriceSessions(userId, outcome.changed)
	return { ok: true, applied: outcome.applied }
}

/**
 * Silence: apply every unanswered proposal that may apply without a yes — it
 * keeps or reduces load and its target is the machine's right now. Everything
 * else stays pending, still answerable. Returns what applied and what held.
 * When this runs (the morning after the week closes) is the caller's (S4).
 */
export async function applyDueProposals(
	userId: string,
	now: Date = new Date(),
): Promise<{ applied: string[]; held: string[] }> {
	const pending = await prisma.weekReplanProposal.findMany({
		where: { athleteId: userId, answer: 'pending', appliedAt: null },
		orderBy: { createdAt: 'asc' },
		select: proposalSelect,
	})
	const timezone = await athleteTimezone(userId)
	const applied: string[] = []
	const held: string[] = []

	for (const proposal of pending) {
		const payload = parseProposalPayload(proposal.payload)
		// Added load never applies on silence — not even on the machine's own
		// sessions (ADR 0080, owner's call 2026-10-07).
		if (loadDirectionOf(payload) === 'adds') {
			held.push(proposal.id)
			continue
		}
		const result = await prisma
			.$transaction(async (tx) => {
				const outcome = await applyPayload(tx, {
					userId,
					proposal,
					payload,
					scope: 'this-time',
					by: 'silence',
					now,
					timezone,
				})
				if (!outcome.applied) return outcome
				const claimed = await tx.weekReplanProposal.updateMany({
					where: { id: proposal.id, answer: 'pending', appliedAt: null },
					data: { appliedAt: now },
				})
				// Answered meanwhile: roll the writes back rather than double-apply.
				if (claimed.count === 0) throw new ProposalRaceLost()
				return outcome
			})
			.catch((error: unknown) => {
				if (error instanceof ProposalRaceLost) {
					return { applied: false, changed: [] as string[] }
				}
				throw error
			})
		if (result.applied) {
			applied.push(proposal.id)
			await repriceSessions(userId, result.changed)
		} else {
			held.push(proposal.id)
		}
	}
	return { applied, held }
}

class ProposalRaceLost extends Error {}

// ── the athlete's own taps ──────────────────────────────────────────────────

/** A week's planned volume: the numbers "før → etter" are read from. */
export type WeekVolume = {
	/** Prescribed minutes over the week's sessions (0 when none prescribe time). */
	durationMin: number
	/** Prescribed metres over the week's sessions (0 when none prescribe distance). */
	distanceM: number
	/** Summed Planned TSS over the sessions that have one. */
	plannedTss: number
}

export type EaseWeekResult =
	| {
			ok: true
			proposalId: string
			sessionsChanged: number
			before: WeekVolume
			after: WeekVolume
	  }
	| { ok: false; reason: 'not-a-week' | 'already-eased' }

/**
 * "Gjør uka lettere −15 %": the athlete's tap, which is its own yes. Writes an
 * accepted week-wide scale proposal at {@link EASE_WEEK_FACTOR} and applies it
 * to every still-scheduled session left in the week — the athlete's own too,
 * since they asked. Once per week: a second tap (or a double submit) never
 * compounds to −28 %.
 */
export async function easeWeek(
	userId: string,
	weekKey: string,
	now: Date = new Date(),
): Promise<EaseWeekResult> {
	if (!isMonday(weekKey)) return { ok: false, reason: 'not-a-week' }
	const already = await prisma.weekReplanProposal.findFirst({
		where: {
			athleteId: userId,
			kind: 'scale',
			targetSessionId: null,
			targetWeekKey: weekKey,
			answer: 'accepted',
		},
		select: { id: true },
	})
	if (already) return { ok: false, reason: 'already-eased' }

	const timezone = await athleteTimezone(userId)
	const before = await readWeekVolume(userId, weekKey, timezone)
	// The closed week's decision this week answers to, when there is one.
	const replan = await prisma.weekReplan.findUnique({
		where: {
			athleteId_weekKey: { athleteId: userId, weekKey: addDays(weekKey, -7) },
		},
		select: { id: true },
	})

	const payload: ProposalPayload = { kind: 'scale', factor: EASE_WEEK_FACTOR }
	const { proposalId, changed } = await prisma.$transaction(async (tx) => {
		const proposal = await tx.weekReplanProposal.create({
			data: {
				...proposalData(
					userId,
					{
						payload,
						targetSessionId: null,
						targetWeekKey: weekKey,
						reason: EASE_WEEK_REASON,
					},
					replan?.id ?? null,
				),
				answer: 'accepted',
				answeredAt: now,
				appliedAt: now,
			},
			select: proposalSelect,
		})
		const result = await applyPayload(tx, {
			userId,
			proposal,
			payload,
			scope: 'this-time',
			by: 'yes',
			now,
			timezone,
		})
		return { proposalId: proposal.id, changed: result.changed }
	})
	await repriceSessions(userId, changed)

	return {
		ok: true,
		proposalId,
		sessionsChanged: changed.length,
		before,
		after: await readWeekVolume(userId, weekKey, timezone),
	}
}

/**
 * "Lås opp": hand one of the athlete's own sessions back to the app, so the
 * Week Replan may adjust it without asking. A session that is already the
 * machine's is left as it is. Rewriting its prescription later re-adopts it
 * (`updateWorkoutSession` clears `releasedAt`).
 */
export async function releaseSession(
	userId: string,
	sessionId: string,
	now: Date = new Date(),
): Promise<
	{ ok: true; released: boolean } | { ok: false; reason: 'not-found' }
> {
	const session = await prisma.workoutSession.findFirst({
		where: { id: sessionId, userId },
		select: { id: true, source: true, adoptedAt: true, releasedAt: true },
	})
	if (!session) return { ok: false, reason: 'not-found' }
	if (sessionOwner(session) === 'machine') return { ok: true, released: false }
	await prisma.workoutSession.update({
		where: { id: session.id },
		data: { releasedAt: now },
	})
	return { ok: true, released: true }
}

// ── applying one payload ────────────────────────────────────────────────────

const proposalSelect = {
	id: true,
	payload: true,
	scope: true,
	answer: true,
	appliedAt: true,
	reason: true,
	targetSessionId: true,
	targetWeekKey: true,
	createdAt: true,
} satisfies Prisma.WeekReplanProposalSelect

type StoredProposal = Prisma.WeekReplanProposalGetPayload<{
	select: typeof proposalSelect
}>

type ApplyContext = {
	userId: string
	proposal: StoredProposal
	payload: ProposalPayload
	scope: ProposalScope
	/** An explicit yes, or the morning's silence — which re-checks ownership. */
	by: 'yes' | 'silence'
	now: Date
	timezone: string
}

/** Whether anything was written, and which sessions' prescriptions changed. */
type ApplyResult = { applied: boolean; changed: string[] }

const NOTHING: ApplyResult = { applied: false, changed: [] }

const targetSelect = {
	id: true,
	status: true,
	scheduledAt: true,
	source: true,
	adoptedAt: true,
	releasedAt: true,
	updatedAt: true,
	targetEventId: true,
	workout: { select: workoutCopySelect },
} satisfies Prisma.WorkoutSessionSelect

type Target = Prisma.WorkoutSessionGetPayload<{ select: typeof targetSelect }>

async function applyPayload(
	tx: Prisma.TransactionClient,
	ctx: ApplyContext,
): Promise<ApplyResult> {
	const { payload } = ctx
	if (payload.kind === 'keep') return { applied: true, changed: [] }
	if (payload.kind === 'add') return applyAdd(tx, ctx, payload)
	if (payload.kind === 'scale' && !ctx.proposal.targetSessionId) {
		return applyWeekScale(tx, ctx, payload.factor)
	}

	const target = await readTarget(tx, ctx, ctx.proposal.targetSessionId)
	if (!target) return NOTHING
	switch (payload.kind) {
		case 'scale':
			return applySessionScale(tx, ctx, target, payload.factor)
		case 'move':
			return applyMove(tx, ctx, target, payload)
		case 'swap': {
			const other = await readTarget(tx, ctx, payload.otherSessionId)
			if (!other) return NOTHING
			return applySwap(tx, ctx, target, other)
		}
	}
}

/** The athlete's session row, or null when it is gone. */
async function readTarget(
	tx: Prisma.TransactionClient,
	ctx: ApplyContext,
	sessionId: string | null,
): Promise<Target | null> {
	if (!sessionId) return null
	return tx.workoutSession.findFirst({
		where: { id: sessionId, userId: ctx.userId },
		select: targetSelect,
	})
}

/** Still ahead and still planned — the only sessions a change may reach. */
function isAhead(session: Target, now: Date): boolean {
	return session.status === 'scheduled' && session.scheduledAt > now
}

/**
 * Whether silence may write to this session: it is the machine's **now**, and
 * it has not changed since the proposal was written.
 */
function silenceMayTouch(session: Target, ctx: ApplyContext): boolean {
	return (
		sessionOwner(session) === 'machine' &&
		session.updatedAt <= ctx.proposal.createdAt
	)
}

function mayTouch(session: Target, ctx: ApplyContext): boolean {
	return (
		isAhead(session, ctx.now) &&
		(ctx.by === 'yes' || silenceMayTouch(session, ctx))
	)
}

async function applySessionScale(
	tx: Prisma.TransactionClient,
	ctx: ApplyContext,
	target: Target,
	factor: number,
): Promise<ApplyResult> {
	if (!mayTouch(target, ctx)) return NOTHING
	const scaled = await scaleSession(tx, target, factor, ctx.proposal.reason)
	return scaled ? { applied: true, changed: [target.id] } : NOTHING
}

async function applyWeekScale(
	tx: Prisma.TransactionClient,
	ctx: ApplyContext,
	factor: number,
): Promise<ApplyResult> {
	const { start, end } = weekBoundsFromMondayUTC(
		ctx.proposal.targetWeekKey,
		ctx.timezone,
	)
	const sessions = await tx.workoutSession.findMany({
		where: {
			userId: ctx.userId,
			status: 'scheduled',
			scheduledAt: { gt: ctx.now, gte: start, lte: end },
			workoutId: { not: null },
			...(ctx.by === 'silence' ? MACHINE_OWNED_SESSION : {}),
		},
		select: targetSelect,
	})
	const changed: string[] = []
	for (const session of sessions) {
		if (!mayTouch(session, ctx)) continue
		if (await scaleSession(tx, session, factor, ctx.proposal.reason)) {
			changed.push(session.id)
		}
	}
	return { applied: true, changed }
}

/**
 * Scale one session's quantified cardio volume and record why on its Replan
 * Note. `source` and adoption stay exactly as they were. False when there was
 * nothing to scale.
 */
async function scaleSession(
	tx: Prisma.TransactionClient,
	session: Target,
	factor: number,
	reason: string,
): Promise<boolean> {
	const workoutId = session.workout?.id
	if (!workoutId) return false
	const steps = await tx.workoutStep.findMany({
		where: {
			block: { workoutId },
			kind: 'cardio',
			OR: [{ durationSec: { not: null } }, { distanceM: { not: null } }],
		},
		select: { id: true, durationSec: true, distanceM: true },
	})
	if (steps.length === 0) return false
	for (const step of steps) {
		await tx.workoutStep.update({
			where: { id: step.id },
			data: scaleStepQuantities(
				{ durationSec: step.durationSec, distanceM: step.distanceM },
				factor,
			),
		})
	}
	await tx.workoutSession.update({
		where: { id: session.id },
		data: { replanReason: reason },
	})
	return true
}

/** The same local time of day on another local day. */
function onDay(instant: Date, date: string, timezone: string): Date {
	return localTimeUTC(date, localTimeOfDay(instant, timezone), timezone)
}

/** Monday-based weekday index (0 = Monday … 6 = Sunday) of a YYYY-MM-DD. */
function weekdayIndex(date: string): number {
	return (new Date(`${date}T00:00:00.000Z`).getUTCDay() + 6) % 7
}

async function applyMove(
	tx: Prisma.TransactionClient,
	ctx: ApplyContext,
	target: Target,
	payload: Extract<ProposalPayload, { kind: 'move' }>,
): Promise<ApplyResult> {
	const changed: string[] = []
	let applied = false

	if (payload.makeUp) {
		// The missed session stays exactly where it is — _ikke gjort_ on its own
		// day. The make-up is a fresh copy on the free day, the machine's.
		const when = onDay(target.scheduledAt, payload.toDate, ctx.timezone)
		if (target.workout && when > ctx.now && ctx.by === 'yes') {
			const workout = await copyWorkout(tx, target.workout, ctx.userId)
			const makeUp = await tx.workoutSession.create({
				data: {
					userId: ctx.userId,
					workoutId: workout.id,
					scheduledAt: when,
					status: 'scheduled',
					source: 'generated',
					targetEventId: target.targetEventId,
					replanReason: ctx.proposal.reason,
				},
				select: { id: true },
			})
			changed.push(makeUp.id)
			applied = true
		}
	} else if (mayTouch(target, ctx)) {
		await tx.workoutSession.update({
			where: { id: target.id },
			data: {
				scheduledAt: onDay(target.scheduledAt, payload.toDate, ctx.timezone),
				replanReason: ctx.proposal.reason,
			},
		})
		applied = true
	}

	if (applied && ctx.scope === 'from-now-on') {
		changed.push(...(await moveSlotFromNowOn(tx, ctx, target, payload)))
	}
	return { applied, changed }
}

/**
 * "Fra nå av": move every later occurrence of the target's slot to the new
 * weekday, within its own week. A slot is read as the machine's still-planned
 * sessions on the same weekday carrying the same workout (title and
 * discipline) — sessions keep no link back to the Week Pattern that laid them
 * (ADR 0044 §6). The athlete's own sessions are never in the set.
 *
 * Known limit: the Week Pattern itself is not edited, so weeks laid after this
 * (a re-stamp, the horizon fill) come back on the old weekday.
 */
async function moveSlotFromNowOn(
	tx: Prisma.TransactionClient,
	ctx: ApplyContext,
	target: Target,
	payload: Extract<ProposalPayload, { kind: 'move' }>,
): Promise<string[]> {
	if (!target.workout) return []
	const fromWeekday = weekdayIndex(payload.fromDate)
	const shift = weekdayIndex(payload.toDate) - fromWeekday
	if (shift === 0) return []

	const later = await tx.workoutSession.findMany({
		where: {
			userId: ctx.userId,
			id: { not: target.id },
			status: 'scheduled',
			scheduledAt: { gt: ctx.now },
			workout: {
				title: target.workout.title,
				discipline: target.workout.discipline,
			},
			...MACHINE_OWNED_SESSION,
		},
		select: { id: true, scheduledAt: true },
	})
	const moved: string[] = []
	for (const session of later) {
		const day = localDate(session.scheduledAt, ctx.timezone)
		if (weekdayIndex(day) !== fromWeekday) continue
		const when = onDay(session.scheduledAt, addDays(day, shift), ctx.timezone)
		if (when <= ctx.now) continue
		await tx.workoutSession.update({
			where: { id: session.id },
			data: { scheduledAt: when, replanReason: ctx.proposal.reason },
		})
		moved.push(session.id)
	}
	return moved
}

async function applySwap(
	tx: Prisma.TransactionClient,
	ctx: ApplyContext,
	target: Target,
	other: Target,
): Promise<ApplyResult> {
	if (!mayTouch(target, ctx) || !mayTouch(other, ctx)) return NOTHING
	const targetDay = localDate(target.scheduledAt, ctx.timezone)
	const otherDay = localDate(other.scheduledAt, ctx.timezone)
	await tx.workoutSession.update({
		where: { id: target.id },
		data: {
			scheduledAt: onDay(target.scheduledAt, otherDay, ctx.timezone),
			replanReason: ctx.proposal.reason,
		},
	})
	await tx.workoutSession.update({
		where: { id: other.id },
		data: {
			scheduledAt: onDay(other.scheduledAt, targetDay, ctx.timezone),
			replanReason: ctx.proposal.reason,
		},
	})
	return { applied: true, changed: [] }
}

async function applyAdd(
	tx: Prisma.TransactionClient,
	ctx: ApplyContext,
	payload: Extract<ProposalPayload, { kind: 'add' }>,
): Promise<ApplyResult> {
	// Added load: only ever on a yes, whatever reached this far.
	if (ctx.by !== 'yes') return NOTHING
	const when = localTimeUTC(payload.date, payload.time, ctx.timezone)
	if (when <= ctx.now) return NOTHING
	const source = await tx.workout.findFirst({
		where: {
			id: payload.workoutId,
			OR: [{ ownerId: ctx.userId }, { visibility: 'public' }],
		},
		select: workoutCopySelect,
	})
	if (!source) return NOTHING
	const workout = await copyWorkout(tx, source, ctx.userId)
	const session = await tx.workoutSession.create({
		data: {
			userId: ctx.userId,
			workoutId: workout.id,
			scheduledAt: when,
			status: 'scheduled',
			source: 'generated',
			replanReason: ctx.proposal.reason,
		},
		select: { id: true },
	})
	return { applied: true, changed: [session.id] }
}

// ── helpers ─────────────────────────────────────────────────────────────────

async function repriceSessions(userId: string, sessionIds: string[]) {
	for (const sessionId of sessionIds) {
		await recomputePlannedTssForSession(userId, sessionId)
	}
}

async function athleteTimezone(userId: string): Promise<string> {
	const profile = await prisma.athleteProfile.findUnique({
		where: { userId },
		select: { timezone: true },
	})
	return profile?.timezone ?? 'UTC'
}

function isMonday(weekKey: string): boolean {
	return (
		/^\d{4}-\d{2}-\d{2}$/.test(weekKey) &&
		new Date(`${weekKey}T00:00:00.000Z`).getUTCDay() === 1
	)
}

async function readWeekVolume(
	userId: string,
	weekKey: string,
	timezone: string,
): Promise<WeekVolume> {
	const { start, end } = weekBoundsFromMondayUTC(weekKey, timezone)
	const sessions = await prisma.workoutSession.findMany({
		where: { userId, scheduledAt: { gte: start, lte: end } },
		select: {
			plannedTssValue: true,
			workout: {
				select: {
					blocks: {
						select: {
							repeatCount: true,
							seriesRepeatCount: true,
							steps: { select: { durationSec: true, distanceM: true } },
						},
					},
				},
			},
		},
	})
	return sessions.reduce<WeekVolume>(
		(sum, session) => ({
			durationMin:
				sum.durationMin +
				(sumBlockDurationMin(session.workout?.blocks ?? []) ?? 0),
			distanceM:
				sum.distanceM + (sumBlockDistanceM(session.workout?.blocks ?? []) ?? 0),
			plannedTss: sum.plannedTss + (session.plannedTssValue ?? 0),
		}),
		{ durationMin: 0, distanceM: 0, plannedTss: 0 },
	)
}
