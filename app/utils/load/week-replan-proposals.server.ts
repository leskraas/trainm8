/**
 * Week Replan proposals on the server (#505, ADR 0080 steps 2–5): storing
 * them, and the engine that applies one — on the athlete's Ok
 * (`week-replan-answers.server.ts`) or on the morning's silence (here).
 *
 * The apply rules, which no author can change:
 *
 * - **Ok** applies the proposal, whoever owns the target and whichever way the
 *   load goes: the athlete said yes.
 * - **Nei takk** applies nothing, ever.
 * - **Silence** (`applyDueProposals`) applies a pending proposal only when it
 *   keeps or reduces load **and** every session it touches is the machine's
 *   **at apply time** — ownership is re-read from the row, never trusted from
 *   when the proposal was written, so a session adopted in between is left
 *   alone. A proposal whose session changed after it was written is stale and
 *   is left alone too: it describes a prescription that no longer exists. A
 *   session's own release ("lås opp") is not such a change. Silence never
 *   takes a move "fra nå av" — that is a rule only the athlete can state.
 * - **An open-ended plan's next round** (`add-phase`) targets the plan, not a
 *   session: silence appends one that keeps the volume, never one that adds.
 * - **A gone target applies nothing.** A proposal aimed at one session never
 *   widens to the week when that session is deleted; week-wide is said in the
 *   payload (`scope: 'week'`).
 *
 * A missed session is never moved: a make-up move places a copy on the free day
 * and leaves the missed session on its own day, read as _ikke gjort_.
 *
 * Every write keeps the session's `source` and adoption exactly as they were
 * (ADR 0016) and records why on its Replan Note; each changed prescription
 * re-prices its Planned TSS after commit (ADR 0019).
 */

import { type Prisma } from '@prisma/client'
import { type z } from 'zod/v3'
import {
	addDays,
	daysBetween,
	localDate,
	localTimeOfDay,
	localTimeUTC,
	weekBoundsFromMondayUTC,
	weekdayIndex,
} from '#app/utils/athlete-calendar.ts'
import { getAthleteTimezone } from '#app/utils/athlete.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { appendOpenEndedRound } from '#app/utils/plan-outline/open-ended.server.ts'
import {
	MACHINE_OWNED_SESSION,
	sessionOwner,
} from '#app/utils/session-ownership.ts'
import { copyWorkout, workoutCopySelect } from '#app/utils/workout.server.ts'
import { fillPlanWeeksToHorizon } from './horizon-fill.server.ts'
import { recomputePlannedTssForSession } from './planned-tss.server.ts'
import {
	type BeforeImage,
	emptyBeforeImage,
	LoadDirectionSchema,
	loadDirectionOf,
	parseProposalPayload,
	ProposalAnswerSchema,
	type ProposalDraft,
	type ProposalPayload,
	type ProposalScope,
	ProposalScopeSchema,
} from './week-replan-proposal.ts'
import { scaleStepQuantities } from './week-replan.ts'

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

export function proposalData(
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

/**
 * Silence: apply every unanswered proposal that may apply without a yes — it
 * keeps or reduces load and its target is the machine's right now. Everything
 * else stays pending, still answerable. Returns what applied and what held.
 *
 * When this runs is the week change's (`week-change.server.ts`): from the
 * morning after a Week Replan was written, once per decision, and only for
 * the decisions whose morning has come (`weekReplanIds`). Called without them it takes every
 * pending proposal, which only a caller that is itself the morning may do.
 */
export async function applyDueProposals(
	userId: string,
	now: Date = new Date(),
	{
		weekReplanIds,
		timezone: knownTimezone,
	}: { weekReplanIds?: string[]; timezone?: string } = {},
): Promise<{ applied: string[]; held: string[] }> {
	if (weekReplanIds?.length === 0) return { applied: [], held: [] }
	const pending = await prisma.weekReplanProposal.findMany({
		where: {
			athleteId: userId,
			answer: 'pending',
			appliedAt: null,
			...(weekReplanIds ? { weekReplanId: { in: weekReplanIds } } : {}),
		},
		orderBy: { createdAt: 'asc' },
		select: proposalSelect,
	})
	const timezone = knownTimezone ?? (await getAthleteTimezone(userId))
	const applied: string[] = []
	const held: string[] = []

	for (const row of pending) {
		const proposal = readStoredProposal(row)
		const { payload } = proposal
		// Added load never applies on silence — not even on the machine's own
		// sessions (ADR 0080, owner's call 2026-10-07). The stored direction and
		// the payload's are both read, and either saying "adds" holds it.
		if (
			loadDirectionOf(payload) === 'adds' ||
			proposal.loadDirection === 'adds'
		) {
			held.push(proposal.id)
			continue
		}
		const result = await prisma
			.$transaction(async (tx) => {
				const outcome = await applyPayload(tx, {
					userId,
					proposal,
					scope: 'this-time',
					by: 'silence',
					now,
					timezone,
				})
				if (!outcome.applied) return outcome
				const claimed = await tx.weekReplanProposal.updateMany({
					where: { id: proposal.id, answer: 'pending', appliedAt: null },
					data: appliedData(outcome, now),
				})
				// Answered meanwhile: roll the writes back rather than double-apply.
				if (claimed.count === 0) throw new ProposalRaceLost()
				return outcome
			})
			.catch((error: unknown) => {
				if (error instanceof ProposalRaceLost) {
					return nothing()
				}
				throw error
			})
		if (result.applied) {
			applied.push(proposal.id)
			await afterApply(userId, result, timezone, now)
		} else {
			held.push(proposal.id)
		}
	}
	return { applied, held }
}

class ProposalRaceLost extends Error {}

// ── applying one payload ────────────────────────────────────────────────────

export const proposalSelect = {
	id: true,
	payload: true,
	scope: true,
	answer: true,
	loadDirection: true,
	appliedAt: true,
	reason: true,
	targetSessionId: true,
	targetWeekKey: true,
	createdAt: true,
} satisfies Prisma.WeekReplanProposalSelect

type ProposalRow = Prisma.WeekReplanProposalGetPayload<{
	select: typeof proposalSelect
}>

/** A stored proposal with its payload and enum columns parsed, never cast. */
export type StoredProposal = Omit<
	ProposalRow,
	'payload' | 'scope' | 'answer' | 'loadDirection'
> & {
	payload: ProposalPayload
	scope: ProposalScope | null
	answer: z.infer<typeof ProposalAnswerSchema>
	loadDirection: z.infer<typeof LoadDirectionSchema>
}

/** Read a stored row back, refusing any value its schema does not describe. */
export function readStoredProposal(row: ProposalRow): StoredProposal {
	return {
		...row,
		payload: parseProposalPayload(row.payload),
		scope: row.scope == null ? null : ProposalScopeSchema.parse(row.scope),
		answer: ProposalAnswerSchema.parse(row.answer),
		loadDirection: LoadDirectionSchema.parse(row.loadDirection),
	}
}

export type ApplyContext = {
	userId: string
	proposal: StoredProposal
	scope: ProposalScope
	/** An explicit yes, or the morning's silence — which re-checks ownership. */
	by: 'yes' | 'silence'
	now: Date
	timezone: string
}

/**
 * Whether anything was written, and which sessions' prescriptions changed —
 * plus, for an appended round, that the plan's weeks up to the horizon are to
 * be laid after commit — and the before-image of what it replaced (#564),
 * which the caller stores with `appliedAt` ({@link appliedData}) so the change
 * can be undone exactly (`week-replan-undo.server.ts`).
 */
export type ApplyResult = {
	applied: boolean
	changed: string[]
	fillsHorizon?: boolean
	beforeImage: BeforeImage
}

/** What one kind's writer reports; the before-image is the run's. */
type Outcome = Omit<ApplyResult, 'beforeImage'>

const NOTHING: Outcome = { applied: false, changed: [] }

function nothing(): ApplyResult {
	return { ...NOTHING, beforeImage: emptyBeforeImage() }
}

/**
 * The columns an applied proposal is marked with: when, and what it replaced.
 * Every path that applies a proposal — silence, an Ok, "Gjør uka lettere" —
 * writes both together, so no applied proposal lacks its before-image.
 */
export function appliedData(result: ApplyResult, now: Date) {
	return {
		appliedAt: now,
		beforeImage: JSON.stringify(result.beforeImage),
	} satisfies Prisma.WeekReplanProposalUpdateInput
}

/**
 * One apply in progress: the context, and the before-image it fills as it
 * writes — each session's prior state recorded once, before its first write.
 */
type Run = ApplyContext & { image: BeforeImage }

type SessionBefore = Pick<
	Target,
	'id' | 'scheduledAt' | 'replanReason' | 'source' | 'adoptedAt' | 'releasedAt'
>

function remember(
	run: Run,
	session: SessionBefore,
	steps?: Array<{
		id: string
		durationSec: number | null
		distanceM: number | null
	}>,
) {
	const known = run.image.sessions.find((image) => image.id === session.id)
	if (known) {
		if (steps && !known.steps) known.steps = steps
		return
	}
	run.image.sessions.push({
		id: session.id,
		scheduledAt: session.scheduledAt.toISOString(),
		replanReason: session.replanReason,
		owner: sessionOwner(session),
		...(steps ? { steps } : {}),
	})
}

const targetSelect = {
	id: true,
	status: true,
	scheduledAt: true,
	source: true,
	adoptedAt: true,
	releasedAt: true,
	updatedAt: true,
	replanReason: true,
	targetEventId: true,
	planOutlineId: true,
	workout: { select: workoutCopySelect },
} satisfies Prisma.WorkoutSessionSelect

type Target = Prisma.WorkoutSessionGetPayload<{ select: typeof targetSelect }>

/** Apply one proposal's payload inside `tx`, as an Ok or as silence. */
export async function applyPayload(
	tx: Prisma.TransactionClient,
	ctx: ApplyContext,
): Promise<ApplyResult> {
	const run: Run = { ...ctx, image: emptyBeforeImage() }
	const outcome = await applyKind(tx, run)
	return outcome.applied
		? { ...outcome, beforeImage: run.image }
		: { ...outcome, beforeImage: emptyBeforeImage() }
}

async function applyKind(
	tx: Prisma.TransactionClient,
	ctx: Run,
): Promise<Outcome> {
	const { payload } = ctx.proposal
	if (payload.kind === 'keep') return { applied: true, changed: [] }
	if (payload.kind === 'add') return applyAdd(tx, ctx, payload)
	if (payload.kind === 'add-phase') return applyAddPhase(tx, ctx, payload)
	if (payload.kind === 'scale' && payload.scope === 'week') {
		return applyWeekScale(tx, ctx, payload.factor)
	}

	// Aimed at one session: when that session is gone (the column is cleared on
	// delete), nothing applies — it never widens to the week.
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
		!changedSince(session, ctx.proposal.createdAt)
	)
}

/**
 * Whether the session was written after the proposal was — the stale guard,
 * so two machine softenings (a proposal and the nudge's ease) never compound.
 *
 * A release ("lås opp") is a write that changes hands, not the prescription:
 * the proposal still describes the session as it is, and the athlete has just
 * said the app may adjust it. So a session whose last write was its own release
 * is not stale. Read as `releasedAt` at or after `updatedAt`, within a second,
 * because the release writes both in one update; any later write (an ease, a
 * reschedule) moves `updatedAt` past it, and an edit of the prescription clears
 * `releasedAt` altogether.
 */
function changedSince(session: Target, writtenAt: Date): boolean {
	if (session.updatedAt <= writtenAt) return false
	const releasedLast =
		session.releasedAt != null &&
		session.releasedAt.getTime() >= session.updatedAt.getTime() - 1000
	return !releasedLast
}

function mayTouch(session: Target, ctx: ApplyContext): boolean {
	return (
		isAhead(session, ctx.now) &&
		(ctx.by === 'yes' || silenceMayTouch(session, ctx))
	)
}

async function applySessionScale(
	tx: Prisma.TransactionClient,
	ctx: Run,
	target: Target,
	factor: number,
): Promise<Outcome> {
	if (!mayTouch(target, ctx)) return NOTHING
	const scaled = await scaleSession(tx, ctx, target, factor)
	return scaled ? { applied: true, changed: [target.id] } : NOTHING
}

async function applyWeekScale(
	tx: Prisma.TransactionClient,
	ctx: Run,
	factor: number,
): Promise<Outcome> {
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
		if (await scaleSession(tx, ctx, session, factor)) {
			changed.push(session.id)
		}
	}
	return { applied: true, changed }
}

/**
 * Scale one session's quantified cardio volume and record why on its Replan
 * Note. `source` and adoption stay exactly as they were. False when there was
 * nothing to scale. The steps' quantities and the note as they stood go into
 * the run's before-image first.
 */
async function scaleSession(
	tx: Prisma.TransactionClient,
	ctx: Run,
	session: Target,
	factor: number,
): Promise<boolean> {
	const reason = ctx.proposal.reason
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
	remember(ctx, session, steps)
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

async function applyMove(
	tx: Prisma.TransactionClient,
	ctx: Run,
	target: Target,
	payload: Extract<ProposalPayload, { kind: 'move' }>,
): Promise<Outcome> {
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
					// The make-up belongs to the plan the missed session did (ADR 0079).
					planOutlineId: target.planOutlineId,
					replanReason: ctx.proposal.reason,
				},
				select: { id: true },
			})
			ctx.image.placed.push(makeUp.id)
			changed.push(makeUp.id)
			applied = true
		}
	} else if (mayTouch(target, ctx)) {
		remember(ctx, target)
		await tx.workoutSession.update({
			where: { id: target.id },
			data: {
				scheduledAt: onDay(target.scheduledAt, payload.toDate, ctx.timezone),
				replanReason: ctx.proposal.reason,
			},
		})
		applied = true
	}

	// A make-up is a copy, not a reschedule: it has no slot to move onward.
	if (applied && ctx.scope === 'from-now-on' && !payload.makeUp) {
		changed.push(...(await moveSlotFromNowOn(tx, ctx, target, payload)))
	}
	return { applied, changed }
}

/**
 * "Fra nå av": move every later occurrence of the target's slot by the same
 * number of days the target moved — so Sunday → the next Monday is one day on,
 * crossing into the next week, never six days back. A slot is read as the
 * machine's still-planned sessions on the same weekday carrying the same
 * workout (title and discipline) — sessions keep no link back to the Week
 * Pattern that laid them (ADR 0044 §6). The athlete's own sessions are never
 * in the set.
 *
 * Known limit: the Week Pattern itself is not edited, so weeks laid after this
 * (a re-stamp, the horizon fill) come back on the old weekday.
 */
async function moveSlotFromNowOn(
	tx: Prisma.TransactionClient,
	ctx: Run,
	target: Target,
	payload: Extract<ProposalPayload, { kind: 'move' }>,
): Promise<string[]> {
	if (!target.workout) return []
	const fromWeekday = weekdayIndex(payload.fromDate)
	const shift = daysBetween(payload.fromDate, payload.toDate)
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
		select: {
			id: true,
			scheduledAt: true,
			replanReason: true,
			source: true,
			adoptedAt: true,
			releasedAt: true,
		},
	})
	const moved: string[] = []
	for (const session of later) {
		const day = localDate(session.scheduledAt, ctx.timezone)
		if (weekdayIndex(day) !== fromWeekday) continue
		const when = onDay(session.scheduledAt, addDays(day, shift), ctx.timezone)
		if (when <= ctx.now) continue
		remember(ctx, session)
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
	ctx: Run,
	target: Target,
	other: Target,
): Promise<Outcome> {
	if (!mayTouch(target, ctx) || !mayTouch(other, ctx)) return NOTHING
	remember(ctx, target)
	remember(ctx, other)
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
	ctx: Run,
	payload: Extract<ProposalPayload, { kind: 'add' }>,
): Promise<Outcome> {
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
	ctx.image.placed.push(session.id)
	return { applied: true, changed: [session.id] }
}

/**
 * Append an open-ended plan's next round (ADR 0079 §3). Its target is the plan,
 * not a session, so session ownership has nothing to say: silence may append a
 * round that keeps the volume (the caller has already held one that adds), and
 * a yes appends either. Nothing is written when the plan has gained an Event or
 * been reshaped since the proposal was written (`appendOpenEndedRound`).
 */
async function applyAddPhase(
	tx: Prisma.TransactionClient,
	ctx: Run,
	payload: Extract<ProposalPayload, { kind: 'add-phase' }>,
): Promise<Outcome> {
	if (ctx.by !== 'yes' && loadDirectionOf(payload) === 'adds') return NOTHING
	const appended = await appendOpenEndedRound(tx, ctx.userId, payload, ctx)
	if (!appended) return NOTHING
	ctx.image.round = {
		outlineId: payload.outlineId,
		phaseId: appended.phaseId,
		opensWeekKey: appended.weekKey,
		factor: payload.factor,
	}
	return { applied: true, changed: [], fillsHorizon: true }
}

// ── helpers ─────────────────────────────────────────────────────────────────

/**
 * What follows a commit: each changed prescription re-priced, and — for an
 * appended round — every week not yet begun up to the horizon that the plan
 * has not laid, since the closes before the append found them past the plan's
 * end. The fill is contained: the round is appended whatever happens to it, so
 * a failure is logged, and the week change keeps laying the horizon from the
 * next close on.
 */
export async function afterApply(
	userId: string,
	result: Pick<ApplyResult, 'changed' | 'fillsHorizon'>,
	timezone: string,
	now: Date,
) {
	await repriceSessions(userId, result.changed)
	if (!result.fillsHorizon) return
	try {
		await fillPlanWeeksToHorizon(userId, timezone, now)
	} catch (error) {
		console.error('[open-ended] laying weeks after a new round failed', error)
	}
}

/** Re-price each changed prescription's Planned TSS, after commit (ADR 0019). */
export async function repriceSessions(userId: string, sessionIds: string[]) {
	for (const sessionId of sessionIds) {
		await recomputePlannedTssForSession(userId, sessionId)
	}
}
