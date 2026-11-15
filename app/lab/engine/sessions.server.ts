/**
 * Session, logging, adaptation and undo capabilities (ADR 0125): everything
 * an athlete does to a session once it is planned, and their answers when the
 * plan adapts. Each capability is thin over the domain's own write (marking
 * done, the one-tap changes, the strength logger, the week's proposals,
 * linking a recording); the few undos the domain did not have are built in
 * `sessions/life.server.ts`.
 *
 * Every write answers with what changed and an `undo` token (or why there is
 * none). The contract is `docs/lab/capabilities/sessions.md`.
 */
import { z } from 'zod/v4'
import { findPlanCandidates } from '#app/utils/activity-import.server.ts'
import { addDays, localDate } from '#app/utils/athlete-calendar.ts'
import {
	copySessionToDay,
	finishComposerWrite,
	stampSessionOnDay,
	writeSessionOnDay,
} from '#app/utils/day-stamp.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { MARK_DONE_REACH_DAYS } from '#app/utils/import-fit.ts'
import {
	answerImportQuestion,
	redoImportLink,
	undoImportAnswer,
	undoImportLink,
} from '#app/utils/import-link.server.ts'
import { justerSession, undoJuster } from '#app/utils/juster.server.ts'
import { type JusterRefusal, parseJusterImage } from '#app/utils/juster.ts'
import { undoAutopilotWeek } from '#app/utils/load/autopilot-notice.server.ts'
import { applySessionNudgeForUser } from '#app/utils/load/session-nudge.server.ts'
import { readFirstUnbegunWeekKey } from '#app/utils/load/week-begun.server.ts'
import { runWeekChangeForUser } from '#app/utils/load/week-change.server.ts'
import { lastClosedWeekKey } from '#app/utils/load/week-change.ts'
import {
	acceptRoundWithFactor,
	type AnswerProposalResult,
	answerProposal,
	easeWeek,
	releaseSession,
} from '#app/utils/load/week-replan-answers.server.ts'
import { parseBeforeImage } from '#app/utils/load/week-replan-proposal.ts'
import { undoProposal } from '#app/utils/load/week-replan-undo.server.ts'
import {
	clearLoggedSet,
	getStrengthLogView,
	saveLoggedSet,
} from '#app/utils/strength-log.server.ts'
import {
	isWarmupRampIndex,
	type LoadValue,
	parseStoredLoadValue,
} from '#app/utils/strength-log.ts'
import { openNextProgramSession } from '#app/utils/strength-program.server.ts'
import {
	logStrengthSession,
	type QuickLogEntry,
	undoQuickLog,
} from '#app/utils/strength-quick-log.server.ts'
import { type QuickLogRefusal } from '#app/utils/strength-quick-log.ts'
import {
	activeRunFor,
	finishStrengthSession,
} from '#app/utils/strength-runner.server.ts'
import { MAX_SENTENCE_LENGTH } from '#app/utils/workout-sentence.ts'
import {
	deleteWorkoutSession,
	markSessionDone,
	recomputeRewroteSince,
	setCountsInNoTrack,
	undoMarkSessionDone,
} from '#app/utils/workout.server.ts'
import {
	type CapabilityCtx,
	type CapabilityResult,
	type Capability,
	defineCapability,
	fail,
	ok,
} from './define.ts'
import {
	skipSession,
	undoAdd,
	undoFeeling,
	undoFinish,
	undoRelease,
	undoSkip,
	type UndoDone,
	writeFeeling,
} from './sessions/life.server.ts'
import {
	moveSessionToDay,
	readClashes,
	swapSessionDays,
	type MoveResult,
} from './sessions/move.server.ts'
import { answerableProposalIds } from './sessions/proposals.server.ts'
import { readSnapshot, readSnapshots } from './sessions/snapshot.server.ts'
import {
	defaultLoadOf,
	liftResults,
	platesFor,
	readStrengthSession,
	recordHits,
	strengthSetFrom,
	toLoadValue,
} from './sessions/strength.server.ts'
import {
	readUndo,
	signUndo,
	type StoredSet,
	type UndoPayload,
} from './sessions/undo-token.server.ts'
import {
	type AcceptAllProposalsOutput,
	type AcceptRoundOutput,
	type AddSessionOutput,
	type AnswerProposalOutput,
	type DeleteSessionOutput,
	type EaseWeekOutput,
	type FinishStrengthSessionOutput,
	type LinkOptionsOutput,
	type LinkRecordingOutput,
	type LogStrengthAsPlannedOutput,
	type LogStrengthSetOutput,
	type MarkDoneOutput,
	type MoveSessionOutput,
	type NoteSessionOutput,
	type PlatesForOutput,
	type RateSessionOutput,
	type RefreshAdaptationOutput,
	type ReleaseSessionOutput,
	type RemoveStrengthSetOutput,
	type SessionSnapshot,
	type SetCountsTowardPlanOutput,
	type ShortenSessionOutput,
	type SkipSessionOutput,
	type StrengthLoad,
	type StrengthSessionOutput,
	type SwapSessionsOutput,
	type UndoOutput,
	type UnlinkRecordingOutput,
	type UndoAllChangesOutput,
} from './sessions.types.ts'

// ── shared bits ───────────────────────────────────────────────────────────

const Id = z.string().min(1)
const DayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const NOT_FOUND = 'Fant ikke økta.'
const NOT_OPEN =
	'Økta er allerede gjort, hoppet over eller har et opptak, så den kan ikke endres slik.'

function undoOf(
	ctx: CapabilityCtx,
	payload: UndoPayload | null,
	why: string,
): { undo: string | null; noUndoBecause: string | null } {
	return payload
		? { undo: signUndo(ctx.userId, payload), noUndoBecause: null }
		: { undo: null, noUndoBecause: why }
}

async function snapshots(ctx: CapabilityCtx, ids: readonly string[]) {
	return readSnapshots(ctx.userId, ids, ctx.timezone)
}

const RECOMPUTE_REWROTE =
	'Planen endret en annen økt som følge av dette, så det kan ikke angres her.'

// ── doing and recording ───────────────────────────────────────────────────

const markDone = defineCapability({
	name: 'mark_done',
	kind: 'write',
	description:
		'Say a run, ride or swim is done, by hand, before or instead of a recording. Strength is logged with its sets.',
	input: z.object({ sessionId: Id }),
	async run(ctx, input): Promise<CapabilityResult<MarkDoneOutput>> {
		const session = await prisma.workoutSession.findFirst({
			where: { id: input.sessionId, userId: ctx.userId },
			select: {
				status: true,
				recordingId: true,
				scheduledAt: true,
				workout: { select: { discipline: true } },
			},
		})
		if (!session) return fail('not-found', NOT_FOUND)
		const todayKey = localDate(ctx.now, ctx.timezone)
		const dayKey = localDate(session.scheduledAt, ctx.timezone)
		if (session.status === 'completed') {
			return fail('already-done', 'Økta er allerede gjort.')
		}
		if (session.recordingId) {
			return fail('already-recorded', 'Økta har allerede et opptak.')
		}
		if (session.status === 'skipped') {
			return fail('not-open', 'Økta er hoppet over. Angre det først.')
		}
		if (session.workout?.discipline === 'strength') {
			return fail(
				'strength-needs-sets',
				'Styrkeøkter registreres med settene. Før settene, eller før økta som planlagt.',
			)
		}
		if (dayKey > todayKey) {
			return fail('not-yet', 'Økta kan markeres gjort fra dagen den står på.')
		}
		if (dayKey < addDays(todayKey, -MARK_DONE_REACH_DAYS)) {
			return fail(
				'too-long-ago',
				'Økta er for lenge siden til å markeres gjort her.',
			)
		}
		const result = await markSessionDone(ctx.userId, input.sessionId, {
			now: ctx.now,
			timezone: ctx.timezone,
		})
		if (!result.ok) {
			return result.reason === 'session-not-found'
				? fail('not-found', NOT_FOUND)
				: fail('not-markable', 'Denne økta kan ikke markeres gjort.')
		}
		return ok({
			changed: await snapshots(ctx, [input.sessionId]),
			...undoOf(
				ctx,
				result.undo
					? {
							k: 'done',
							sessionId: result.undo.sessionId,
							markedAt: result.undo.markedAt,
							status: result.undo.status,
							markedDoneAt: result.undo.markedDoneAt,
						}
					: null,
				RECOMPUTE_REWROTE,
			),
		})
	},
})

const skip = defineCapability({
	name: 'skip_session',
	kind: 'write',
	description:
		'Skip a session: not done on a day that has begun, skipped on a day still ahead. The plan may ease what comes next.',
	input: z.object({ sessionId: Id }),
	async run(ctx, input): Promise<CapabilityResult<SkipSessionOutput>> {
		const result = await skipSession(ctx.userId, input.sessionId, ctx)
		if (!result.ok) {
			return result.reason === 'not-found'
				? fail('not-found', NOT_FOUND)
				: fail('not-open', NOT_OPEN)
		}
		return ok({
			changed: await snapshots(ctx, [input.sessionId]),
			state: result.state,
			...undoOf(ctx, result.undo, RECOMPUTE_REWROTE),
		})
	},
})

const deleteSession = defineCapability({
	name: 'delete_session',
	kind: 'write',
	description:
		'Delete a session and its prescription for good. Cannot be undone: confirm first.',
	input: z.object({ sessionId: Id }),
	async run(ctx, input): Promise<CapabilityResult<DeleteSessionOutput>> {
		const session = await prisma.workoutSession.findFirst({
			where: { id: input.sessionId, userId: ctx.userId },
			select: { recordingId: true },
		})
		if (!session) return fail('not-found', NOT_FOUND)
		if (session.recordingId) {
			return fail(
				'has-recording',
				'Økta har et opptak. Koble fra opptaket før du sletter økta.',
			)
		}
		const deleted = await deleteWorkoutSession(ctx.userId, input.sessionId)
		if (!deleted) return fail('not-found', NOT_FOUND)
		return ok({
			removedSessionIds: [deleted.id],
			undo: null,
			noUndoBecause: 'En slettet økt kan ikke hentes tilbake.',
		})
	},
})

const addSession = defineCapability({
	name: 'add_session',
	kind: 'write',
	description:
		'Add a session to a day: one the athlete did (already done) or wants to do, written in their own words, a sport alone, or a copy of another session.',
	input: z.object({
		date: DayKey,
		sentence: z.string().trim().min(1).max(MAX_SENTENCE_LENGTH).optional(),
		sport: z.enum(['run', 'bike', 'swim', 'strength']).optional(),
		copyOf: Id.optional(),
		alreadyDone: z.boolean().optional(),
		note: z.string().trim().max(1000).optional(),
		countsTowardPlan: z.boolean().optional(),
	}),
	async run(ctx, input): Promise<CapabilityResult<AddSessionOutput>> {
		let sessionId: string
		if (input.copyOf) {
			const copied = await copySessionToDay({
				userId: ctx.userId,
				sessionId: input.copyOf,
				dateKey: input.date,
				timezone: ctx.timezone,
			})
			if (!copied.ok) return fail('not-found', NOT_FOUND)
			sessionId = copied.sessionId
		} else if (input.sentence) {
			const written = await writeSessionOnDay({
				userId: ctx.userId,
				dateKey: input.date,
				discipline: input.sport ?? null,
				sentence: input.sentence,
				timezone: ctx.timezone,
			})
			if (!written.ok) {
				return fail(
					'not-understood',
					'Skjønte ikke økta. Prøv for eksempel «45 min rolig» eller «3x10 knebøy».',
				)
			}
			sessionId = written.sessionId
		} else if (input.sport) {
			const stamped = await stampSessionOnDay({
				userId: ctx.userId,
				dateKey: input.date,
				discipline: input.sport,
				timezone: ctx.timezone,
			})
			if (!stamped.ok) {
				return fail(
					'needs-sentence',
					'Skriv hva styrkeøkta er, for eksempel «3x10 knebøy».',
				)
			}
			sessionId = stamped.sessionId
		} else {
			return fail(
				'invalid-input',
				'Si hva økta er: med ord, en idrett, eller en økt å kopiere.',
			)
		}

		const since = new Date()
		const begun = input.date <= localDate(ctx.now, ctx.timezone)
		// A note on something that happened is the session's own note; on a
		// session still ahead it is kept with its description.
		const noteAsLog = Boolean(input.note) && begun && input.alreadyDone
		const { done } = await finishComposerWrite(ctx.userId, sessionId, {
			extras: {
				annet: input.countsTowardPlan === false,
				done: input.alreadyDone,
				notes: noteAsLog ? undefined : input.note || undefined,
			},
			now: ctx.now,
			timezone: ctx.timezone,
		})
		if (noteAsLog && input.note) {
			await writeFeeling(ctx.userId, sessionId, { note: input.note }, ctx)
		}
		const rewrote =
			done && (await recomputeRewroteSince(ctx.userId, since, [sessionId]))
		return ok({
			changed: await snapshots(ctx, [sessionId]),
			sessionId,
			notDoneBecause:
				input.alreadyDone && !done
					? begun
						? 'Styrkeøkter blir gjort når settene føres.'
						: 'En dag som ikke har begynt kan ikke være gjort.'
					: null,
			...undoOf(
				ctx,
				rewrote ? null : { k: 'add', sessionId },
				RECOMPUTE_REWROTE,
			),
		})
	},
})

// ── when life happens ─────────────────────────────────────────────────────

const JUSTER_FAILS: Record<JusterRefusal, [string, string]> = {
	'session-not-found': ['not-found', NOT_FOUND],
	'not-today': [
		'not-today',
		'Dette kan bare gjøres med dagens økt. Velg en dag for å flytte en annen.',
	],
	'not-open': ['not-open', NOT_OPEN],
	'no-workout': ['no-plan', 'Økta har ingen plan å endre.'],
	'no-time': ['no-time', 'Økta har ingen tid å korte ned fra.'],
	'already-short': [
		'already-short',
		'Økta er allerede kort, 20 minutter eller mindre.',
	],
	'already-easy': [
		'already-easy',
		'Økta er allerede rolig og så kort den kan bli.',
	],
	'no-later-day': [
		'no-later-day',
		'Det er ingen dager igjen denne uka å flytte til.',
	],
	'pick-not-found': ['not-found', 'Fant ikke økta du valgte.'],
}

const MOVE_FAILS: Record<
	Extract<MoveResult, { ok: false }>['reason'],
	[string, string]
> = {
	'not-found': ['not-found', NOT_FOUND],
	'not-open': ['not-open', NOT_OPEN],
	'past-date': ['past-date', 'En økt kan bare flyttes til i dag eller senere.'],
	'same-day': ['same-day', 'Økta står allerede på den dagen.'],
	'same-session': ['same-session', 'Velg to forskjellige økter.'],
}

/** The moves an adjustment made, read off its before-image. */
async function movesOf(ctx: CapabilityCtx, adjustmentId: string) {
	const row = await prisma.sessionAdjustment.findFirst({
		where: { id: adjustmentId, userId: ctx.userId },
		select: { beforeImage: true },
	})
	if (!row) return []
	return parseJusterImage(row.beforeImage).sessions.map((one) => ({
		sessionId: one.id,
		fromDate: localDate(new Date(one.scheduledAt), ctx.timezone),
		toDate: localDate(new Date(one.after.scheduledAt), ctx.timezone),
	}))
}

const ADJUST_NO_UNDO = 'Endringen kan ikke angres.'

const moveSession = defineCapability({
	name: 'move_session',
	kind: 'write',
	description:
		'Move a session to another day (today or later), keeping its time of day. Without a date, today’s session goes to the next free day this week that fits.',
	input: z.object({ sessionId: Id, date: DayKey.optional() }),
	async run(ctx, input): Promise<CapabilityResult<MoveSessionOutput>> {
		if (!input.date) {
			const result = await justerSession(
				ctx.userId,
				{ intent: 'move', sessionId: input.sessionId },
				{ now: ctx.now, timezone: ctx.timezone },
			)
			if (!result.ok) return fail(...JUSTER_FAILS[result.reason])
			const moves = await movesOf(ctx, result.undo.adjustmentId)
			const to = moves[0]?.toDate
			return ok({
				changed: await snapshots(ctx, result.changedSessionIds),
				moves,
				sharesDayWith: [],
				clashes: await readClashes(ctx.userId, input.sessionId, ctx),
				leftItsWeek: false,
				...undoOf(
					ctx,
					to ? { k: 'adjust', adjustmentId: result.undo.adjustmentId } : null,
					ADJUST_NO_UNDO,
				),
			})
		}
		const result = await moveSessionToDay(
			ctx.userId,
			input.sessionId,
			input.date,
			ctx,
		)
		if (!result.ok) return fail(...MOVE_FAILS[result.reason])
		return ok({
			changed: await snapshots(ctx, [input.sessionId]),
			moves: result.moves,
			sharesDayWith: result.sharesDayWith,
			clashes: result.clashes,
			leftItsWeek: result.leftItsWeek,
			...undoOf(
				ctx,
				{ k: 'adjust', adjustmentId: result.adjustmentId },
				ADJUST_NO_UNDO,
			),
		})
	},
})

const swapSessions = defineCapability({
	name: 'swap_sessions',
	kind: 'write',
	description:
		'Swap the days of two planned sessions, each keeping its time of day.',
	input: z.object({ sessionId: Id, otherSessionId: Id }),
	async run(ctx, input): Promise<CapabilityResult<SwapSessionsOutput>> {
		const result = await swapSessionDays(
			ctx.userId,
			input.sessionId,
			input.otherSessionId,
			ctx,
		)
		if (!result.ok) return fail(...MOVE_FAILS[result.reason])
		return ok({
			changed: await snapshots(ctx, [input.sessionId, input.otherSessionId]),
			moves: result.moves,
			...undoOf(
				ctx,
				{ k: 'adjust', adjustmentId: result.adjustmentId },
				ADJUST_NO_UNDO,
			),
		})
	},
})

function prescriptionChange(
	name: 'shorten_session' | 'ease_session',
	intent: 'short' | 'tired',
	description: string,
) {
	return defineCapability({
		name,
		kind: 'write',
		description,
		input: z.object({ sessionId: Id }),
		async run(ctx, input): Promise<CapabilityResult<ShortenSessionOutput>> {
			const before = await readSnapshot(
				ctx.userId,
				input.sessionId,
				ctx.timezone,
			)
			if (!before) return fail('not-found', NOT_FOUND)
			const result = await justerSession(
				ctx.userId,
				{ intent, sessionId: input.sessionId },
				{ now: ctx.now, timezone: ctx.timezone },
			)
			if (!result.ok) return fail(...JUSTER_FAILS[result.reason])
			const changed = await snapshots(ctx, result.changedSessionIds)
			return ok({
				changed,
				minutesBefore: before.minutes,
				minutesAfter:
					changed.find((one) => one.id === input.sessionId)?.minutes ?? null,
				...undoOf(
					ctx,
					{ k: 'adjust', adjustmentId: result.undo.adjustmentId },
					ADJUST_NO_UNDO,
				),
			})
		},
	})
}

const shortenSession = prescriptionChange(
	'shorten_session',
	'short',
	'Short on time: today’s session becomes 30 minutes (20 if it was 30 or less), keeping its purpose.',
)

const easeSession = prescriptionChange(
	'ease_session',
	'tired',
	'Too tired today: today’s session becomes easy and about 60 % as long (never under 20 minutes). A strength session keeps fewer sets.',
)

const release = defineCapability({
	name: 'release_session',
	kind: 'write',
	description:
		'Hand one of the athlete’s own sessions back to the plan, so the plan may adjust it without asking.',
	input: z.object({ sessionId: Id }),
	async run(ctx, input): Promise<CapabilityResult<ReleaseSessionOutput>> {
		const result = await releaseSession(ctx.userId, input.sessionId, ctx.now)
		if (!result.ok) return fail('not-found', NOT_FOUND)
		return ok({
			changed: await snapshots(ctx, [input.sessionId]),
			released: result.released,
			...undoOf(
				ctx,
				result.released
					? {
							k: 'release',
							sessionId: input.sessionId,
							releasedAt: ctx.now.toISOString(),
						}
					: null,
				'Økta var allerede planens.',
			),
		})
	},
})

const countsTowardPlan = defineCapability({
	name: 'set_counts_toward_plan',
	kind: 'write',
	description:
		'Say whether a session counts toward the plan’s weekly volume (a bike commute may not). Its training load counts either way.',
	input: z.object({ sessionId: Id, countsTowardPlan: z.boolean() }),
	async run(ctx, input): Promise<CapabilityResult<SetCountsTowardPlanOutput>> {
		const before = await prisma.workoutSession.findFirst({
			where: { id: input.sessionId, userId: ctx.userId },
			select: { countsInNoTrack: true },
		})
		if (!before) return fail('not-found', NOT_FOUND)
		const result = await setCountsInNoTrack(
			ctx.userId,
			input.sessionId,
			!input.countsTowardPlan,
		)
		if (!result.ok) return fail('not-found', NOT_FOUND)
		return ok({
			changed: await snapshots(ctx, [input.sessionId]),
			...undoOf(
				ctx,
				{
					k: 'counts',
					sessionId: input.sessionId,
					before: before.countsInNoTrack,
				},
				'',
			),
		})
	},
})

// ── feeling ───────────────────────────────────────────────────────────────

function feelingFail(reason: 'not-found' | 'not-yet') {
	return reason === 'not-found'
		? fail('not-found', NOT_FOUND)
		: fail('not-yet', 'Du kan si hvordan økta kjentes fra dagen den står på.')
}

const rateSession = defineCapability({
	name: 'rate_session',
	kind: 'write',
	description:
		'Say how hard a session felt, 1 (very easy) to 10 (all out); null clears it. Feeds the training load of a session with no recording.',
	input: z.object({
		sessionId: Id,
		rpe: z.number().int().min(1).max(10).nullable(),
	}),
	async run(ctx, input): Promise<CapabilityResult<RateSessionOutput>> {
		const result = await writeFeeling(
			ctx.userId,
			input.sessionId,
			{ rpe: input.rpe },
			ctx,
		)
		if (!result.ok) return feelingFail(result.reason)
		return ok({
			changed: await snapshots(ctx, [input.sessionId]),
			...undoOf(ctx, result.undo, ''),
		})
	},
})

const noteSession = defineCapability({
	name: 'note_session',
	kind: 'write',
	description:
		'Write the athlete’s note on a session (how it went, what happened). An empty note clears it.',
	input: z.object({ sessionId: Id, note: z.string().max(2000) }),
	async run(ctx, input): Promise<CapabilityResult<NoteSessionOutput>> {
		const result = await writeFeeling(
			ctx.userId,
			input.sessionId,
			{ note: input.note },
			ctx,
		)
		if (!result.ok) return feelingFail(result.reason)
		return ok({
			changed: await snapshots(ctx, [input.sessionId]),
			...undoOf(ctx, result.undo, ''),
		})
	},
})

// ── recordings ────────────────────────────────────────────────────────────

const RECORDING_NOT_FOUND = 'Fant ikke opptaket.'

const linkOptions = defineCapability({
	name: 'link_options',
	kind: 'read',
	description:
		'The planned sessions a recording could be linked to: same day, same sport, holding no recording.',
	input: z.object({ recordingId: Id }),
	async run(ctx, input): Promise<CapabilityResult<LinkOptionsOutput>> {
		const recording = await prisma.activityImport.findFirst({
			where: { id: input.recordingId, athleteId: ctx.userId },
			select: { promotedSessionId: true },
		})
		if (!recording) return fail('not-found', RECORDING_NOT_FOUND)
		const ids = await findPlanCandidates(
			ctx.userId,
			input.recordingId,
			ctx.timezone,
			{ rule: 'by-hand' },
		)
		return ok({
			recordingId: input.recordingId,
			currentSessionId: recording.promotedSessionId,
			options: await snapshots(ctx, ids),
		})
	},
})

const linkRecording = defineCapability({
	name: 'link_recording',
	kind: 'write',
	description:
		'Link a recording to the planned session it was, when it did not link by itself. The extra session it stood on goes away.',
	input: z.object({ recordingId: Id, sessionId: Id }),
	async run(ctx, input): Promise<CapabilityResult<LinkRecordingOutput>> {
		const before = await prisma.activityImport.findFirst({
			where: { id: input.recordingId, athleteId: ctx.userId },
			select: { promotedSessionId: true },
		})
		if (!before) return fail('not-found', RECORDING_NOT_FOUND)
		const result = await answerImportQuestion(
			ctx.userId,
			input.recordingId,
			{ kind: 'link', sessionId: input.sessionId },
			ctx.now,
		)
		if (!result.ok) {
			return result.reason === 'not-a-fit'
				? fail(
						'not-a-fit',
						'Opptaket passer ikke den økta. Den må være samme dag og samme idrett, uten eget opptak.',
					)
				: result.reason === 'import-not-found'
					? fail('not-found', RECORDING_NOT_FOUND)
					: fail('not-found', NOT_FOUND)
		}
		const old = before.promotedSessionId
		const oldLeft =
			old && old !== result.sessionId
				? await prisma.workoutSession.count({ where: { id: old } })
				: 1
		return ok({
			changed: await snapshots(ctx, [
				result.sessionId,
				...(old && oldLeft ? [old] : []),
			]),
			removedSessionIds: old && !oldLeft ? [old] : [],
			...undoOf(
				ctx,
				result.undo
					? {
							k: 'link',
							importId: result.undo.importId,
							linkedAt: result.undo.linkedAt,
						}
					: null,
				'Opptaket var koblet før, eller planen endret en annen økt, så koblingen kan ikke angres her. Koble det fra i stedet.',
			),
		})
	},
})

const unlinkRecording = defineCapability({
	name: 'unlink_recording',
	kind: 'write',
	description:
		'Take a recording off the planned session it was linked to; it becomes an extra session of its own and the planned one goes back to not done.',
	input: z.object({ recordingId: Id }),
	async run(ctx, input): Promise<CapabilityResult<UnlinkRecordingOutput>> {
		const before = await prisma.activityImport.findFirst({
			where: { id: input.recordingId, athleteId: ctx.userId },
			select: { promotedSessionId: true },
		})
		if (!before) return fail('not-found', RECORDING_NOT_FOUND)
		const result = await undoImportLink(ctx.userId, input.recordingId, ctx.now)
		if (!result.ok) {
			return result.reason === 'not-linked'
				? fail('not-linked', 'Opptaket er ikke koblet til en planlagt økt.')
				: fail('not-found', RECORDING_NOT_FOUND)
		}
		return ok({
			changed: await snapshots(ctx, [
				...(before.promotedSessionId ? [before.promotedSessionId] : []),
				result.sessionId,
			]),
			extraSessionId: result.sessionId,
			...undoOf(ctx, { k: 'unlink', importId: input.recordingId }, ''),
		})
	},
})

// ── strength ──────────────────────────────────────────────────────────────

function strengthFail(reason: 'not-found' | 'not-strength') {
	return reason === 'not-found'
		? fail('not-found', NOT_FOUND)
		: fail('not-strength', 'Økta har ingen styrkeøvelser.')
}

const strengthSession = defineCapability({
	name: 'strength_session',
	kind: 'read',
	description:
		'A strength session to do or log: each exercise’s sets as prescribed (resolved to today’s kilos), what is logged, last time, and plates.',
	input: z.object({ sessionId: Id }),
	async run(ctx, input): Promise<CapabilityResult<StrengthSessionOutput>> {
		const read = await readStrengthSession(
			ctx.userId,
			input.sessionId,
			ctx.timezone,
		)
		return read.ok ? ok(read.value) : strengthFail(read.reason)
	},
})

const startStrength = defineCapability({
	name: 'start_strength_session',
	kind: 'write',
	description:
		'Open a strength session to train it now: a session from a running program takes the program’s current weights. Answers what strength_session answers.',
	input: z.object({ sessionId: Id }),
	async run(ctx, input): Promise<CapabilityResult<StrengthSessionOutput>> {
		const session = await prisma.workoutSession.findFirst({
			where: { id: input.sessionId, userId: ctx.userId },
			select: {
				id: true,
				scheduledAt: true,
				workoutId: true,
				workout: { select: { copiedFromId: true } },
				_count: {
					select: {
						programApplications: true,
						setLogs: { where: { role: 'working', outcome: 'completed' } },
					},
				},
			},
		})
		if (!session) return fail('not-found', NOT_FOUND)
		const run = await activeRunFor(ctx.userId, session)
		if (
			run &&
			session._count.programApplications === 0 &&
			session._count.setLogs === 0
		) {
			await openNextProgramSession({
				userId: ctx.userId,
				instanceId: run.id,
				scheduledAt: session.scheduledAt,
				now: ctx.now,
				onlySessionId: session.id,
			})
		}
		const read = await readStrengthSession(
			ctx.userId,
			input.sessionId,
			ctx.timezone,
		)
		return read.ok ? ok(read.value) : strengthFail(read.reason)
	},
})

const LoadInput = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('kg'), kg: z.number().positive().max(1000) }),
	z.object({
		kind: z.literal('kg-per-hand'),
		kg: z.number().positive().max(500),
	}),
	z.object({ kind: z.literal('bodyweight') }),
	z.object({
		kind: z.literal('bodyweight-plus'),
		kg: z.number().positive().max(500),
	}),
	z.object({ kind: z.literal('assisted'), kg: z.number().positive().max(500) }),
	z.object({
		kind: z.literal('machine-level'),
		level: z.number().int().positive().max(100),
		label: z.string().max(40).optional(),
	}),
	z.object({ kind: z.literal('band'), band: z.string().trim().min(1).max(40) }),
	z.object({ kind: z.literal('none') }),
]) satisfies z.ZodType<StrengthLoad>

const setLogSelect = {
	id: true,
	role: true,
	outcome: true,
	toFailure: true,
	load: true,
	reps: true,
	repsLeft: true,
	durationSec: true,
	rir: true,
	restTakenSec: true,
} as const

async function readSetRow(
	sessionId: string,
	stepId: string,
	orderIndex: number,
) {
	return prisma.exerciseSetLog.findUnique({
		where: { sessionId_stepId_orderIndex: { sessionId, stepId, orderIndex } },
		select: setLogSelect,
	})
}

function storedOf(
	row: NonNullable<Awaited<ReturnType<typeof readSetRow>>>,
): StoredSet {
	return {
		role: row.role as StoredSet['role'],
		outcome: row.outcome as StoredSet['outcome'],
		toFailure: row.toFailure,
		load: row.load,
		reps: row.reps,
		repsLeft: row.repsLeft,
		durationSec: row.durationSec,
		rir: row.rir,
		restTakenSec: row.restTakenSec,
	}
}

const SET_FAILS = {
	'not-found': ['not-found', 'Fant ikke øvelsen i økta.'],
	'not-strength': ['not-strength', 'Dette steget er ikke en styrkeøvelse.'],
	'no-count': [
		'no-count',
		'Et gjort sett må si hvor mange repetisjoner eller sekunder.',
	],
} as const satisfies Record<string, [string, string]>

const logStrengthSet = defineCapability({
	name: 'log_strength_set',
	kind: 'write',
	description:
		'Log one set as it is done, or correct a logged one. Left out, reps and load are what was prescribed, so a tap is enough.',
	input: z.object({
		sessionId: Id,
		stepId: Id,
		setIndex: z.number().int().min(0),
		reps: z.number().int().min(0).max(1000).nullable().optional(),
		seconds: z.number().int().min(0).max(36000).nullable().optional(),
		load: LoadInput.optional(),
		done: z.boolean().optional(),
		toFailure: z.boolean().optional(),
		repsInReserve: z.number().int().min(0).max(10).nullable().optional(),
		changeLoadKind: z.boolean().optional(),
	}),
	async run(ctx, input): Promise<CapabilityResult<LogStrengthSetOutput>> {
		const view = await getStrengthLogView(ctx.userId, input.sessionId)
		if (!view) return fail('not-found', NOT_FOUND)
		const exercise = view.exercises.find((one) => one.stepId === input.stepId)
		if (!exercise) return fail(...SET_FAILS['not-found'])
		const warmup = isWarmupRampIndex(input.setIndex)
		const row = (warmup ? exercise.warmupRows : exercise.rows).find(
			(one) => one.orderIndex === input.setIndex,
		)
		const before = await readSetRow(
			input.sessionId,
			input.stepId,
			input.setIndex,
		)
		const countGiven = input.reps !== undefined || input.seconds !== undefined
		const reps = countGiven
			? (input.reps ?? null)
			: (before?.reps ?? row?.prescribedReps ?? null)
		const seconds = countGiven
			? (input.seconds ?? null)
			: (before?.durationSec ?? row?.prescribedDurationSec ?? null)
		let load: LoadValue | null = input.load ? toLoadValue(input.load) : null
		if (!load && before) load = parseStoredLoadValue(before.load)
		if (!load && warmup && row?.warmupRung && row.warmupRung.targetKg > 0) {
			load = { kind: 'external', kg: row.warmupRung.targetKg }
		}
		let loadWhy: string | undefined
		if (!load) {
			const fallback = defaultLoadOf(exercise)
			load = fallback.load
			loadWhy = fallback.why
		}
		if (!load) {
			return fail(
				'needs-load',
				loadWhy
					? `Si hvilken vekt settet ble tatt med. ${loadWhy}`
					: 'Si hvilken vekt settet ble tatt med.',
			)
		}
		const result = await saveLoggedSet({
			athleteId: ctx.userId,
			sessionId: input.sessionId,
			stepId: input.stepId,
			orderIndex: input.setIndex,
			role: warmup ? 'warmup' : 'working',
			outcome: input.done === false ? 'abandoned' : 'completed',
			toFailure: input.toFailure ?? before?.toFailure ?? false,
			load,
			reps,
			repsLeft: before?.repsLeft ?? null,
			durationSec: seconds,
			rir:
				input.repsInReserve !== undefined
					? input.repsInReserve
					: (before?.rir ?? null),
			restTakenSec: before?.restTakenSec ?? null,
			changeLoadKind: input.changeLoadKind ?? false,
		})
		if (!result.ok) {
			if (result.reason === 'load-kind-locked') {
				return fail(
					'load-kind-locked',
					'Settet er allerede ført med en annen type last. Send changeLoadKind for å endre det.',
				)
			}
			const [code, message] = SET_FAILS[result.reason]
			return fail(code, message)
		}
		const after = await getStrengthLogView(ctx.userId, input.sessionId)
		const set = after
			? strengthSetFrom(after, input.stepId, input.setIndex)
			: null
		if (!set) return fail('not-found', NOT_FOUND)
		return ok({
			set,
			records: recordHits(result.records),
			...undoOf(
				ctx,
				before
					? {
							k: 'set-restore',
							sessionId: input.sessionId,
							stepId: input.stepId,
							orderIndex: input.setIndex,
							row: storedOf(before),
							editedId: result.id,
						}
					: { k: 'set-added', sessionId: input.sessionId, setLogId: result.id },
				'',
			),
		})
	},
})

const removeStrengthSet = defineCapability({
	name: 'remove_strength_set',
	kind: 'write',
	description: 'Take a logged set back off, as if it was not done.',
	input: z.object({
		sessionId: Id,
		stepId: Id,
		setIndex: z.number().int().min(0),
	}),
	async run(ctx, input): Promise<CapabilityResult<RemoveStrengthSetOutput>> {
		const owned = await prisma.workoutSession.count({
			where: { id: input.sessionId, userId: ctx.userId },
		})
		if (!owned) return fail('not-found', NOT_FOUND)
		const before = await readSetRow(
			input.sessionId,
			input.stepId,
			input.setIndex,
		)
		const removed = await clearLoggedSet(
			ctx.userId,
			input.sessionId,
			input.stepId,
			input.setIndex,
		)
		return ok({
			removed,
			...undoOf(
				ctx,
				removed && before
					? {
							k: 'set-restore',
							sessionId: input.sessionId,
							stepId: input.stepId,
							orderIndex: input.setIndex,
							row: storedOf(before),
							editedId: null,
						}
					: null,
				'Settet var ikke ført.',
			),
		})
	},
})

const finishStrength = defineCapability({
	name: 'finish_strength_session',
	kind: 'write',
	description:
		'Finish a strength session: it is done, and a running program moves each lift on from what was logged.',
	input: z.object({
		sessionId: Id,
		unloggedSets: z.literal('not-done').optional(),
	}),
	async run(
		ctx,
		input,
	): Promise<CapabilityResult<FinishStrengthSessionOutput>> {
		const result = await finishStrengthSession({
			userId: ctx.userId,
			sessionId: input.sessionId,
			now: ctx.now,
			untapped: input.unloggedSets,
		})
		if (!result.ok) {
			if (result.reason === 'untapped-sets') {
				return fail(
					'unlogged-sets',
					`${result.untapped} sett er ikke ført. Før dem, eller avslutt og regn dem som ikke gjort.`,
				)
			}
			return result.reason === 'nothing-logged'
				? fail('nothing-logged', 'Ingen sett er ført ennå.')
				: fail('not-found', NOT_FOUND)
		}
		const undoable = result.programName == null && !result.alreadyFinished
		return ok({
			changed: await snapshots(ctx, [input.sessionId]),
			alreadyFinished: result.alreadyFinished,
			lifts: liftResults(result.outcomes, result.liftNames),
			programName: result.programName,
			...undoOf(
				ctx,
				undoable ? { k: 'unfinish', sessionId: input.sessionId } : null,
				result.alreadyFinished
					? 'Økta var allerede avsluttet.'
					: 'Programmet har gått videre fra denne økta, så den kan ikke åpnes igjen.',
			),
		})
	},
})

const QUICK_LOG_FAILS: Record<QuickLogRefusal, [string, string]> = {
	'session-not-found': ['not-found', NOT_FOUND],
	'not-loggable': [
		'not-loggable',
		'Økta kan ikke føres slik nå: den er ikke styrke, dagen har ikke begynt, eller den er for lenge siden.',
	],
	'not-plannable': [
		'not-plannable',
		'Økta mangler noe for å føres som planlagt (en vekt eller et antall). Før settene ett og ett.',
	],
	'unknown-set': ['unknown-set', 'Et av settene finnes ikke i økta.'],
	'nothing-done': ['nothing-done', 'Ingen sett ble gjort.'],
	'bad-weight': ['bad-weight', 'Vekten kan ikke stemme.'],
	'weight-not-editable': [
		'weight-not-editable',
		'Denne øvelsen har ingen vekt å endre.',
	],
}

const logAsPlanned = defineCapability({
	name: 'log_strength_as_planned',
	kind: 'write',
	description:
		'Log a whole strength session in one go, as planned or with the sets and weights that went differently, and finish it.',
	input: z.object({
		sessionId: Id,
		sets: z
			.array(
				z.object({
					stepId: Id,
					setIndex: z.number().int().min(0),
					reps: z.number().int().min(0).max(600),
				}),
			)
			.max(200)
			.optional(),
		lifts: z
			.array(z.object({ stepId: Id, kg: z.number().positive().max(500) }))
			.max(50)
			.optional(),
	}),
	async run(ctx, input): Promise<CapabilityResult<LogStrengthAsPlannedOutput>> {
		const edited = (input.sets?.length ?? 0) + (input.lifts?.length ?? 0) > 0
		const entry: QuickLogEntry = edited
			? {
					kind: 'edited',
					sets: (input.sets ?? []).map((set) => ({
						stepId: set.stepId,
						orderIndex: set.setIndex,
						count: set.reps,
					})),
					lifts: input.lifts,
				}
			: { kind: 'as-planned' }
		const result = await logStrengthSession(
			ctx.userId,
			input.sessionId,
			entry,
			{ now: ctx.now, timezone: ctx.timezone },
		)
		if (!result.ok) return fail(...QUICK_LOG_FAILS[result.reason])
		return ok({
			changed: await snapshots(ctx, [input.sessionId]),
			loggedSets: result.loggedSets,
			alreadyLogged: result.alreadyLogged,
			lifts: result.finished
				? liftResults(result.finished.outcomes, result.finished.liftNames)
				: [],
			...undoOf(
				ctx,
				result.undoable && result.setLogIds.length > 0
					? {
							k: 'quick-log',
							sessionId: input.sessionId,
							setLogIds: result.setLogIds,
						}
					: null,
				result.alreadyLogged
					? 'Økta var allerede ført.'
					: 'Programmet har gått videre fra denne økta, så føringen kan ikke angres.',
			),
		})
	},
})

const platesForCap = defineCapability({
	name: 'plates_for',
	kind: 'read',
	description:
		'Which plates make a weight on one exercise of a strength session, on the athlete’s own gym.',
	input: z.object({
		sessionId: Id,
		stepId: Id,
		kg: z.number().positive().max(1000),
	}),
	async run(ctx, input): Promise<CapabilityResult<PlatesForOutput>> {
		const view = await getStrengthLogView(ctx.userId, input.sessionId)
		if (!view) return fail('not-found', NOT_FOUND)
		const exercise = view.exercises.find((one) => one.stepId === input.stepId)
		if (!exercise) return fail(...SET_FAILS['not-found'])
		const solved = platesFor(input.kg, exercise.plateContext)
		return ok({
			plates: solved.plates,
			...(solved.why ? { platesUnknownBecause: solved.why } : {}),
			gymName: exercise.plateContext?.gymName ?? null,
		})
	},
})

// ── adaptation ────────────────────────────────────────────────────────────

const ANSWER_FAILS: Record<
	Extract<AnswerProposalResult, { ok: false }>['reason'],
	[string, string]
> = {
	'not-found': ['not-found', 'Fant ikke forslaget.'],
	'already-answered': ['already-answered', 'Forslaget er allerede besvart.'],
	'already-applied': ['already-answered', 'Forslaget er allerede gjort.'],
	'scope-not-a-move': [
		'invalid-input',
		'Bare en flytting kan gjelde fra nå av.',
	],
	'scope-not-for-a-make-up': [
		'invalid-input',
		'En ekstra økt for en som ble borte gjelder bare denne gangen.',
	],
	'factor-not-a-round': [
		'invalid-input',
		'Bare neste runde av planen tar et eget nivå.',
	],
	'factor-out-of-range': [
		'factor-out-of-range',
		'Nivået må være mellom 0,5 og 1,5.',
	],
	autopilot: [
		'decided-automatically',
		'Planen avgjorde dette selv da uka ble lukket. Angre endringen i stedet.',
	],
}

/** The sessions applied proposals wrote to or placed, off their images. */
async function touchedBy(
	userId: string,
	proposalIds: readonly string[],
): Promise<{ sessionIds: string[]; placedIds: string[] }> {
	const rows = await prisma.weekReplanProposal.findMany({
		where: { id: { in: [...proposalIds] }, athleteId: userId },
		select: { beforeImage: true, targetSessionId: true },
	})
	const sessionIds: string[] = []
	const placedIds: string[] = []
	for (const row of rows) {
		if (row.targetSessionId) sessionIds.push(row.targetSessionId)
		if (!row.beforeImage) continue
		const image = parseBeforeImage(row.beforeImage)
		sessionIds.push(...image.sessions.map((one) => one.id))
		placedIds.push(...image.placed)
	}
	return { sessionIds, placedIds }
}

const WEEK_BEGUN =
	'Uka endringen gjelder har begynt, så den kan ikke angres lenger.'

/** Whether every one of these applied proposals may still be taken back:
 * the week it landed in (a round: the week it opens on) has not begun. */
async function proposalsUndoable(
	ctx: CapabilityCtx,
	proposalIds: readonly string[],
): Promise<boolean> {
	if (proposalIds.length === 0) return false
	const rows = await prisma.weekReplanProposal.findMany({
		where: { id: { in: [...proposalIds] }, athleteId: ctx.userId },
		select: { targetWeekKey: true, beforeImage: true },
	})
	const firstUnbegun = await readFirstUnbegunWeekKey(
		ctx.userId,
		ctx.now,
		ctx.timezone,
	)
	return rows.every((row) => {
		if (!row.beforeImage) return false
		const image = parseBeforeImage(row.beforeImage)
		return (image.round?.opensWeekKey ?? row.targetWeekKey) >= firstUnbegun
	})
}

async function answered(
	ctx: CapabilityCtx,
	proposalId: string,
	result: AnswerProposalResult,
	answer: 'yes' | 'no',
): Promise<CapabilityResult<AnswerProposalOutput>> {
	if (!result.ok) return fail(...ANSWER_FAILS[result.reason])
	const touched = result.applied
		? await touchedBy(ctx.userId, [proposalId])
		: { sessionIds: [], placedIds: [] }
	const undoable =
		result.applied && (await proposalsUndoable(ctx, [proposalId]))
	return ok({
		proposalId,
		status: answer === 'yes' ? 'accepted' : 'declined',
		applied: result.applied,
		changed: await snapshots(ctx, [
			...touched.sessionIds,
			...touched.placedIds,
		]),
		...undoOf(
			ctx,
			undoable ? { k: 'proposals', proposalIds: [proposalId] } : null,
			answer === 'no'
				? 'Et nei endret ingenting.'
				: result.applied
					? WEEK_BEGUN
					: 'Ingenting ble endret: økta var allerede borte eller passert.',
		),
	})
}

const answerProposalCap = defineCapability({
	name: 'answer_proposal',
	kind: 'write',
	description:
		'Yes or no to one of the plan’s proposals. Yes applies it; no changes nothing. A move may apply from now on.',
	input: z.object({
		proposalId: Id,
		answer: z.enum(['yes', 'no']),
		scope: z.enum(['this-week', 'from-now-on']).optional(),
	}),
	async run(ctx, input): Promise<CapabilityResult<AnswerProposalOutput>> {
		const result = await answerProposal(
			ctx.userId,
			input.proposalId,
			input.answer === 'yes' ? 'accepted' : 'declined',
			input.scope === 'from-now-on'
				? 'from-now-on'
				: input.scope === 'this-week'
					? 'this-time'
					: undefined,
			ctx.now,
		)
		return answered(ctx, input.proposalId, result, input.answer)
	},
})

const acceptAll = defineCapability({
	name: 'accept_all_proposals',
	kind: 'write',
	description:
		'Yes to every proposal that still waits for an answer, in one go. A next round is accepted at its proposed level.',
	input: z.object({}),
	async run(ctx): Promise<CapabilityResult<AcceptAllProposalsOutput>> {
		const answerable = await answerableProposalIds(ctx.userId, ctx)
		const accepted: string[] = []
		const applied: string[] = []
		const failed: AcceptAllProposalsOutput['failed'] = []
		for (const proposalId of answerable) {
			const result = await answerProposal(
				ctx.userId,
				proposalId,
				'accepted',
				undefined,
				ctx.now,
			)
			if (!result.ok) {
				failed.push({
					proposalId,
					because: ANSWER_FAILS[result.reason][1],
				})
				continue
			}
			accepted.push(proposalId)
			if (result.applied) applied.push(proposalId)
		}
		const touched = await touchedBy(ctx.userId, applied)
		return ok({
			accepted,
			failed,
			changed: await snapshots(ctx, [
				...touched.sessionIds,
				...touched.placedIds,
			]),
			...undoOf(
				ctx,
				(await proposalsUndoable(ctx, applied))
					? { k: 'proposals', proposalIds: applied }
					: null,
				applied.length > 0 ? WEEK_BEGUN : 'Ingenting ble endret.',
			),
		})
	},
})

const acceptRound = defineCapability({
	name: 'accept_round',
	kind: 'write',
	description:
		'Yes to an open-ended plan’s next round at a level of the athlete’s own: 1 keeps the volume, below eases, above adds.',
	input: z.object({ proposalId: Id, factor: z.number() }),
	async run(ctx, input): Promise<CapabilityResult<AcceptRoundOutput>> {
		const result = await acceptRoundWithFactor(
			ctx.userId,
			input.proposalId,
			input.factor,
			ctx.now,
		)
		return answered(ctx, input.proposalId, result, 'yes')
	},
})

const UNIT: Record<string, EaseWeekOutput['volume'][number]['unit']> = {
	km: 'km',
	hours: 'hours',
	tss: 'load',
	sets: 'sets',
}

const easeWeekCap = defineCapability({
	name: 'ease_week',
	kind: 'write',
	description:
		'Make the coming week 15 % easier: every session still planned in it is scaled down. Once per week.',
	input: z.object({ week: DayKey.optional() }),
	async run(ctx, input): Promise<CapabilityResult<EaseWeekOutput>> {
		const week =
			input.week ?? addDays(lastClosedWeekKey(ctx.now, ctx.timezone), 7)
		const result = await easeWeek(ctx.userId, week, ctx.now)
		if (!result.ok) {
			return result.reason === 'already-eased'
				? fail('already-eased', 'Uka er allerede gjort lettere.')
				: result.reason === 'not-the-coming-week'
					? fail(
							'not-the-coming-week',
							'Bare uka som kommer kan gjøres lettere.',
						)
					: fail('invalid-input', 'Uka må oppgis med mandagens dato.')
		}
		const touched = await touchedBy(ctx.userId, [result.proposalId])
		return ok({
			week,
			sessionsChanged: result.sessionsChanged,
			changed: await snapshots(ctx, touched.sessionIds),
			volume: result.before.tracks.map((track) => ({
				sport: track.discipline,
				unit: UNIT[track.currency] ?? 'hours',
				before: track.planned,
				after:
					result.after.tracks.find((one) => one.trackId === track.trackId)
						?.planned ?? null,
			})),
			...undoOf(
				ctx,
				(await proposalsUndoable(ctx, [result.proposalId]))
					? { k: 'proposals', proposalIds: [result.proposalId] }
					: null,
				WEEK_BEGUN,
			),
		})
	},
})

const refreshAdaptation = defineCapability({
	name: 'refresh_adaptation',
	kind: 'write',
	description:
		'Let the plan catch up with what the athlete actually did, now rather than at its next hourly check: close a finished week, write its proposals, and ease the next session after a missed key one.',
	input: z.object({}),
	async run(ctx): Promise<CapabilityResult<RefreshAdaptationOutput>> {
		const run = await runWeekChangeForUser(ctx.userId, ctx.now)
		await applySessionNudgeForUser(ctx.userId, ctx.now)
		return ok({
			newProposals: run.replanned,
			appliedIds: run.applied,
			waiting: (await answerableProposalIds(ctx.userId, ctx)).length,
		})
	},
})

// ── undo ──────────────────────────────────────────────────────────────────

const UNDO_REFUSED: Record<string, string> = {
	changed: 'Det kan ikke angres lenger: økta er endret igjen siden.',
	trained: 'Det kan ikke angres lenger: økta er trent.',
	'week-begun': 'Det kan ikke angres lenger: uka har begynt.',
	'session-taken-over':
		'Det kan ikke angres: du har endret en av øktene selv siden.',
	'no-before-image': 'Denne endringen kan ikke angres.',
	'not-applied': 'Det er ingenting å angre.',
	'not-found': 'Fant ikke det som skal angres.',
}

function refusedUndo(reason: string) {
	return fail(
		'cannot-undo',
		UNDO_REFUSED[reason] ?? 'Det kan ikke angres lenger.',
	)
}

type UndoRun = {
	result: UndoDone | { ok: false; reason: string }
	changedIds: string[]
	removedIds: string[]
}

async function runUndo(
	ctx: CapabilityCtx,
	payload: UndoPayload,
): Promise<UndoRun> {
	const { userId } = ctx
	switch (payload.k) {
		case 'done': {
			const result = await undoMarkSessionDone(userId, {
				sessionId: payload.sessionId,
				markedAt: payload.markedAt,
				status: payload.status,
				markedDoneAt: payload.markedDoneAt,
			})
			return {
				result: result.ok
					? { ok: true, undone: result.undone }
					: { ok: false, reason: 'changed' },
				changedIds: [payload.sessionId],
				removedIds: [],
			}
		}
		case 'skip':
			return {
				result: await undoSkip(userId, payload),
				changedIds: [payload.sessionId],
				removedIds: [],
			}
		case 'adjust': {
			const row = await prisma.sessionAdjustment.findFirst({
				where: { id: payload.adjustmentId, userId },
				select: { beforeImage: true },
			})
			const ids = row
				? parseJusterImage(row.beforeImage).sessions.map((one) => one.id)
				: []
			const result = await undoJuster(userId, payload.adjustmentId, ctx.now)
			return {
				result: result.ok
					? { ok: true, undone: result.undone }
					: {
							ok: false,
							reason:
								result.reason === 'session-trained' ? 'trained' : result.reason,
						},
				changedIds: ids,
				removedIds: [],
			}
		}
		case 'release':
			return {
				result: await undoRelease(userId, payload),
				changedIds: [payload.sessionId],
				removedIds: [],
			}
		case 'add': {
			const result = await undoAdd(userId, payload)
			return {
				result,
				changedIds: [],
				removedIds: result.ok && result.undone ? [payload.sessionId] : [],
			}
		}
		case 'log':
			return {
				result: await undoFeeling(userId, payload),
				changedIds: [payload.sessionId],
				removedIds: [],
			}
		case 'counts': {
			const result = await setCountsInNoTrack(
				userId,
				payload.sessionId,
				payload.before,
			)
			return {
				result: result.ok
					? { ok: true, undone: true }
					: { ok: false, reason: 'not-found' },
				changedIds: [payload.sessionId],
				removedIds: [],
			}
		}
		case 'set-added': {
			const removed = await prisma.exerciseSetLog.deleteMany({
				where: {
					id: payload.setLogId,
					sessionId: payload.sessionId,
					session: { userId },
				},
			})
			return {
				result: { ok: true, undone: removed.count > 0 },
				changedIds: [payload.sessionId],
				removedIds: [],
			}
		}
		case 'set-restore': {
			const owned = await prisma.workoutSession.count({
				where: { id: payload.sessionId, userId },
			})
			const current = owned
				? await readSetRow(
						payload.sessionId,
						payload.stepId,
						payload.orderIndex,
					)
				: null
			const stands = payload.editedId
				? current?.id === payload.editedId
				: current == null
			const load = parseStoredLoadValue(payload.row.load)
			if (!owned || !stands || !load) {
				return {
					result: { ok: false, reason: 'changed' },
					changedIds: [],
					removedIds: [],
				}
			}
			const saved = await saveLoggedSet(
				{
					athleteId: userId,
					sessionId: payload.sessionId,
					stepId: payload.stepId,
					orderIndex: payload.orderIndex,
					role: payload.row.role,
					outcome: payload.row.outcome,
					toFailure: payload.row.toFailure,
					load,
					reps: payload.row.reps,
					repsLeft: payload.row.repsLeft,
					durationSec: payload.row.durationSec,
					rir: payload.row.rir,
					restTakenSec: payload.row.restTakenSec,
					changeLoadKind: true,
				},
				{ detectRecords: false },
			)
			return {
				result: saved.ok
					? { ok: true, undone: true }
					: { ok: false, reason: 'changed' },
				changedIds: [payload.sessionId],
				removedIds: [],
			}
		}
		case 'quick-log': {
			const result = await undoQuickLog(
				userId,
				payload.sessionId,
				payload.setLogIds,
				{ now: ctx.now, timezone: ctx.timezone },
			)
			return {
				result: result.ok
					? { ok: true, undone: result.removedSets > 0 }
					: {
							ok: false,
							reason:
								result.reason === 'session-not-found' ? 'not-found' : 'changed',
						},
				changedIds: [payload.sessionId],
				removedIds: [],
			}
		}
		case 'unfinish':
			return {
				result: await undoFinish(userId, payload),
				changedIds: [payload.sessionId],
				removedIds: [],
			}
		case 'link': {
			const before = await prisma.activityImport.findFirst({
				where: { id: payload.importId, athleteId: userId },
				select: { promotedSessionId: true },
			})
			const result = await undoImportAnswer(userId, {
				importId: payload.importId,
				linkedAt: payload.linkedAt,
			})
			const after = await prisma.activityImport.findFirst({
				where: { id: payload.importId, athleteId: userId },
				select: { promotedSessionId: true },
			})
			return {
				result: result.ok
					? { ok: true, undone: result.undone }
					: { ok: false, reason: 'changed' },
				changedIds: [
					before?.promotedSessionId,
					after?.promotedSessionId,
				].filter((id): id is string => id != null),
				removedIds: [],
			}
		}
		case 'unlink': {
			const before = await prisma.activityImport.findFirst({
				where: { id: payload.importId, athleteId: userId },
				select: { promotedSessionId: true },
			})
			const result = await redoImportLink(userId, payload.importId, ctx.now)
			const shell = before?.promotedSessionId
			const shellLeft = shell
				? await prisma.workoutSession.count({ where: { id: shell } })
				: 0
			return {
				result: result.ok
					? { ok: true, undone: true }
					: { ok: false, reason: 'changed' },
				changedIds: result.ok ? [result.sessionId] : [],
				removedIds: result.ok && shell && !shellLeft ? [shell] : [],
			}
		}
		case 'proposals': {
			const touched = await touchedBy(userId, payload.proposalIds)
			let undone = false
			// Newest first, so two changes to one session unwind in order.
			for (const id of [...payload.proposalIds].reverse()) {
				const result = await undoProposal(userId, id, ctx.now)
				if (!result.ok) {
					if (undone) continue
					return {
						result: { ok: false, reason: result.reason },
						changedIds: [],
						removedIds: [],
					}
				}
				undone ||= result.undone
			}
			const left = await prisma.workoutSession.findMany({
				where: { id: { in: touched.placedIds }, userId },
				select: { id: true },
			})
			return {
				result: { ok: true, undone },
				changedIds: touched.sessionIds,
				removedIds: touched.placedIds.filter(
					(id) => !left.some((one) => one.id === id),
				),
			}
		}
	}
}

const undoChange = defineCapability({
	name: 'undo_change',
	kind: 'write',
	description:
		'Take back one change the plan applied (by a yes, quietly, or automatically at the week’s close), by its proposal id. Refused once its week has begun or a session it changed was trained.',
	input: z.object({ proposalId: Id }),
	async run(ctx, input): Promise<CapabilityResult<UndoOutput>> {
		const owned = await prisma.weekReplanProposal.count({
			where: { id: input.proposalId, athleteId: ctx.userId },
		})
		if (!owned) return fail('not-found', 'Fant ikke endringen.')
		return finishUndo(
			ctx,
			await runUndo(ctx, { k: 'proposals', proposalIds: [input.proposalId] }),
		)
	},
})

const undoAllChanges = defineCapability({
	name: 'undo_all_changes',
	kind: 'write',
	description:
		'Take back every change the plan made by itself when a week closed (automatic mode). What cannot be undone any more stands and is reported.',
	input: z.object({ closedWeek: DayKey.optional() }),
	async run(ctx, input): Promise<CapabilityResult<UndoAllChangesOutput>> {
		const weekKey = input.closedWeek ?? lastClosedWeekKey(ctx.now, ctx.timezone)
		const ids = await prisma.weekReplanProposal.findMany({
			where: {
				athleteId: ctx.userId,
				autopilotOutcome: 'applied',
				undoneAt: null,
				weekReplan: { weekKey },
			},
			select: { id: true },
		})
		const touched = await touchedBy(
			ctx.userId,
			ids.map((one) => one.id),
		)
		const result = await undoAutopilotWeek(ctx.userId, weekKey, ctx.now)
		if (!result.ok) return refusedUndo(result.reason)
		const left = await prisma.workoutSession.findMany({
			where: { id: { in: touched.placedIds }, userId: ctx.userId },
			select: { id: true },
		})
		const removed = touched.placedIds.filter(
			(id) => !left.some((one) => one.id === id),
		)
		return ok({
			undone: result.undone > 0,
			count: result.undone,
			kept: result.refused.map(
				(reason) => UNDO_REFUSED[reason] ?? 'Kan ikke angres lenger.',
			),
			changed: await snapshots(
				ctx,
				touched.sessionIds.filter((id) => !removed.includes(id)),
			),
			removedSessionIds: removed,
		})
	},
})

/** An undo's answer: what it changed, read as it now stands. */
async function finishUndo(
	ctx: CapabilityCtx,
	{ result, changedIds, removedIds }: UndoRun,
): Promise<CapabilityResult<UndoOutput>> {
	if (!result.ok) return refusedUndo(result.reason)
	const changed: SessionSnapshot[] = await snapshots(
		ctx,
		changedIds.filter((id) => !removedIds.includes(id)),
	)
	const found = new Set(changed.map((one) => one.id))
	return ok({
		undone: result.undone,
		changed,
		removedSessionIds: [
			...new Set([...removedIds, ...changedIds.filter((id) => !found.has(id))]),
		],
	})
}

const undo = defineCapability({
	name: 'undo',
	kind: 'write',
	description:
		'Take back a write by the token it returned. Refused once what it changed has been trained or changed again since.',
	input: z.object({ token: z.string().min(1).max(8000) }),
	async run(ctx, input): Promise<CapabilityResult<UndoOutput>> {
		const payload = readUndo(ctx.userId, input.token)
		if (!payload) return fail('not-found', UNDO_REFUSED['not-found']!)
		return finishUndo(ctx, await runUndo(ctx, payload))
	},
})

/** Session, logging, adaptation and undo capabilities. */
export const SESSION_CAPABILITIES = {
	mark_done: markDone,
	skip_session: skip,
	delete_session: deleteSession,
	add_session: addSession,
	move_session: moveSession,
	swap_sessions: swapSessions,
	shorten_session: shortenSession,
	ease_session: easeSession,
	release_session: release,
	set_counts_toward_plan: countsTowardPlan,
	rate_session: rateSession,
	note_session: noteSession,
	link_options: linkOptions,
	link_recording: linkRecording,
	unlink_recording: unlinkRecording,
	strength_session: strengthSession,
	start_strength_session: startStrength,
	log_strength_set: logStrengthSet,
	remove_strength_set: removeStrengthSet,
	finish_strength_session: finishStrength,
	log_strength_as_planned: logAsPlanned,
	plates_for: platesForCap,
	undo_change: undoChange,
	undo_all_changes: undoAllChanges,
	answer_proposal: answerProposalCap,
	accept_all_proposals: acceptAll,
	accept_round: acceptRound,
	ease_week: easeWeekCap,
	refresh_adaptation: refreshAdaptation,
	undo,
} satisfies Record<string, Capability<any, any>>
