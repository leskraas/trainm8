/**
 * The goal: one race or ride the plan aims at, or none («bli i bedre form»).
 * Backed by the athlete's Events and by adding an Event to an open-ended
 * plan, which is a proposal the athlete accepts (with a digest, so what lands
 * is what they saw).
 */
import { addDays, localDate } from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	type EventAuthoringInput,
	type EventTarget,
	parseEventDisciplines,
	parseEventTarget,
} from '#app/utils/event-schema.ts'
import {
	cancelEvent,
	createEvent,
	deleteEvent,
	type EventRecord,
	getEventById,
	updateEvent,
} from '#app/utils/event.server.ts'
import {
	attachEventToOutline,
	readAttachEvent,
	type AttachEventRefusal,
} from '#app/utils/plan-outline/open-ended.server.ts'
import { findActiveOutline } from '#app/utils/training.server.ts'
import { type Discipline } from '#app/utils/workout-schema.ts'
import { openUndo, sealUndo } from '../sessions/undo-token.server.ts'
import {
	type Goal,
	type GoalOutput,
	type GoalPlanProposal,
	type Sport,
} from '../setup.types.ts'
import { clockText } from './common.ts'
import { towardGoalOf } from './onboarding.server.ts'

export const ATTACH_REFUSAL_MESSAGES: Record<AttachEventRefusal, string> = {
	'outline-not-found': 'Planen kan ikke legges mot målet nå.',
	'event-not-found': 'Fant ikke målet.',
	'event-cancelled': 'Målet er avlyst.',
	'event-past': 'Dagen for målet har allerede vært.',
	'event-already-planned': 'Målet har allerede en plan.',
	'event-too-soon':
		'Målet er denne uka, så det er ingen uker igjen å bygge mot det.',
	'plan-too-long':
		'Målet er mer enn to år fram. Velg et mål innen to år fra planens start.',
	'preview-stale':
		'Planen har endret seg siden du så forslaget. Se på det nye forslaget først.',
}

/** The race day as dated: date-only Events are stored at UTC midnight. */
function dayKeyOf(date: Date): string {
	return localDate(date, 'UTC')
}

export function startDateOf(dayKey: string): Date {
	return new Date(`${dayKey}T00:00:00.000Z`)
}

function daysBetween(from: string, to: string): number {
	return Math.round(
		(Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
			86_400_000,
	)
}

export function goalOf(
	event: EventRecord,
	{ planRunsTowardIt, today }: { planRunsTowardIt: boolean; today: string },
): Goal {
	const target = parseEventTarget(event.target)
	const meters =
		target?.kind === 'distance'
			? target.meters
			: target?.kind === 'time'
				? (target.meters ?? null)
				: null
	const date = dayKeyOf(event.startDate)
	return {
		id: event.id,
		name: event.name,
		date,
		sports: parseEventDisciplines(event.disciplines) as Goal['sports'],
		distanceKm: meters == null ? null : Math.round(meters) / 1000,
		targetTime:
			target?.kind === 'time'
				? { seconds: target.seconds, text: clockText(target.seconds) }
				: null,
		status: event.status as Goal['status'],
		daysLeft: daysBetween(today, date),
		planRunsTowardIt,
	}
}

/**
 * The current goal: the race the active plan runs toward, else the nearest
 * planned Event from today on.
 */
export async function findGoal(
	userId: string,
	now: Date,
	timezone: string,
): Promise<{ event: EventRecord; planRunsTowardIt: boolean } | null> {
	const active = await findActiveOutline(userId, now)
	if (active?.event) {
		const event = await getEventById(userId, active.event.id)
		if (event) return { event, planRunsTowardIt: true }
	}
	const today = localDate(now, timezone)
	const next = await prisma.event.findFirst({
		where: {
			athleteId: userId,
			status: 'planned',
			startDate: { gte: startDateOf(today) },
		},
		orderBy: { startDate: 'asc' },
		select: { id: true },
	})
	if (!next) return null
	const event = await getEventById(userId, next.id)
	return event ? { event, planRunsTowardIt: false } : null
}

/** The goal, and the change to the plan it waits on, where there is one. */
export async function readGoal(
	userId: string,
	now: Date,
	timezone: string,
): Promise<GoalOutput> {
	const today = localDate(now, timezone)
	const [found, active] = await Promise.all([
		findGoal(userId, now, timezone),
		findActiveOutline(userId, now),
	])
	if (!found) {
		return { goal: null, openEnded: true, proposal: null, problem: null }
	}
	const goal = goalOf(found.event, {
		planRunsTowardIt: found.planRunsTowardIt,
		today,
	})
	if (found.planRunsTowardIt || !active || active.event) {
		return {
			goal,
			openEnded: !found.planRunsTowardIt,
			proposal: null,
			problem: null,
		}
	}
	// An open-ended plan and a goal it does not run toward yet: the proposal.
	const read = await readAttachEvent(
		userId,
		active.outline.id,
		{ kind: 'event', eventId: found.event.id },
		now,
	)
	if (!read.ok) {
		return {
			goal,
			openEnded: true,
			proposal: null,
			problem: ATTACH_REFUSAL_MESSAGES[read.reason],
		}
	}
	const toward = towardGoalOf(read)
	const proposal: GoalPlanProposal = {
		goalId: found.event.id,
		digest: read.digest,
		endsCurrentBlock: {
			name: read.ended.name,
			weeksKept: read.ended.weeks,
			weeksHad: read.ended.wasWeeks,
		},
		phases: toward.phases,
		outlook: toward.outlook,
		steepWeeks: read.warnings.map((warning) => ({
			weekStart: warning.weekKey,
			fromHours: warning.from,
			toHours: warning.to,
		})),
		ownSessionsKept: read.keptSessions,
	}
	return { goal, openEnded: true, proposal, problem: null }
}

export type GoalFields = {
	name: string
	date: string
	sport: Sport | Discipline
	disciplines?: Discipline[]
	distanceKm: number | null
	targetSeconds: number | null
}

function targetOf(fields: GoalFields): EventTarget | null {
	const meters =
		fields.distanceKm == null ? null : Math.round(fields.distanceKm * 1000)
	if (fields.targetSeconds != null) {
		return {
			kind: 'time',
			seconds: fields.targetSeconds,
			...(meters ? { meters } : {}),
		}
	}
	return meters ? { kind: 'distance', meters } : null
}

export function authoringInputOf(
	fields: GoalFields,
	status: EventAuthoringInput['status'] = 'planned',
): EventAuthoringInput {
	return {
		name: fields.name,
		kind: 'race',
		priority: 'A',
		startDate: startDateOf(fields.date),
		endDate: null,
		disciplines: fields.disciplines ?? [fields.sport],
		target: targetOf(fields),
		location: null,
		notes: null,
		status,
	}
}

export function fieldsOf(event: EventRecord): GoalFields {
	const target = parseEventTarget(event.target)
	const disciplines = parseEventDisciplines(event.disciplines)
	return {
		name: event.name,
		date: dayKeyOf(event.startDate),
		sport: disciplines[0] ?? 'run',
		disciplines,
		distanceKm:
			target?.kind === 'distance'
				? target.meters / 1000
				: target?.kind === 'time' && target.meters
					? target.meters / 1000
					: null,
		targetSeconds: target?.kind === 'time' ? target.seconds : null,
	}
}

export async function createGoal(userId: string, fields: GoalFields) {
	return createEvent(userId, authoringInputOf(fields))
}

/**
 * Keep the event's location, notes and priority on an update: the goal's
 * fields are the only ones this changes.
 */
export async function updateGoalFields(
	userId: string,
	event: EventRecord,
	fields: GoalFields,
) {
	return updateEvent(userId, event.id, {
		...authoringInputOf(fields, event.status as EventAuthoringInput['status']),
		kind: event.kind as EventAuthoringInput['kind'],
		priority: event.priority as EventAuthoringInput['priority'],
		location: event.location,
		notes: event.notes,
		endDate: null,
		resultSessionId: event.resultSessionId,
	})
}

// ── Undo ─────────────────────────────────────────────────────────────────────

/**
 * What a goal write needs to be taken back. `after` is the goal as the write
 * left it: an undo refuses once the goal has moved on from that.
 */
export type GoalUndo =
	| { kind: 'restore'; id: string; fields: GoalFields; after: GoalFields }
	| { kind: 'uncancel'; id: string }
	| { kind: 'recreate'; fields: GoalFields }
	| { kind: 'delete'; id: string; after: GoalFields }

const GOAL_UNDO = 'lab-undo-goal'

/** A signed token, tied to the athlete, for undo_goal_change. */
export function goalUndoToken(userId: string, undo: GoalUndo): string {
	return sealUndo(GOAL_UNDO, userId, undo)
}

export function readGoalUndo(userId: string, token: string): GoalUndo | null {
	const value = openUndo(GOAL_UNDO, userId, token) as GoalUndo | null
	if (!value) return null
	if (
		value.kind === 'restore' ||
		value.kind === 'uncancel' ||
		value.kind === 'recreate' ||
		value.kind === 'delete'
	) {
		return value
	}
	return null
}

function sameGoal(a: GoalFields, b: GoalFields): boolean {
	return JSON.stringify(fieldsKey(a)) === JSON.stringify(fieldsKey(b))
}

function fieldsKey(f: GoalFields) {
	return [
		f.name,
		f.date,
		f.sport,
		f.disciplines ?? [f.sport],
		f.distanceKm,
		f.targetSeconds,
	]
}

const CHANGED = {
	ok: false as const,
	code: 'changed',
	message: 'Målet er endret siden. Det kan ikke angres.',
}

export async function applyGoalUndo(
	userId: string,
	undo: GoalUndo,
	now: Date,
	timezone: string,
): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
	switch (undo.kind) {
		case 'restore': {
			const event = await getEventById(userId, undo.id)
			if (!event)
				return { ok: false, code: 'not-found', message: 'Fant ikke målet.' }
			if (!sameGoal(fieldsOf(event), undo.after)) return CHANGED
			await updateGoalFields(userId, event, undo.fields)
			return { ok: true }
		}
		case 'uncancel': {
			const event = await getEventById(userId, undo.id)
			if (!event)
				return { ok: false, code: 'not-found', message: 'Fant ikke målet.' }
			if (event.status !== 'cancelled') return CHANGED
			const active = await findActiveOutline(userId, now)
			const ownPlan = await prisma.planOutline.findFirst({
				where: { eventId: undo.id, athleteId: userId },
				select: { id: true },
			})
			if (ownPlan && active) {
				return {
					ok: false,
					code: 'has-plan',
					message:
						'Du har laget en ny plan siden. Målet kan ikke komme tilbake med den gamle planen.',
				}
			}
			await prisma.event.update({
				where: { id: event.id },
				data: { status: 'planned' },
			})
			return { ok: true }
		}
		case 'recreate': {
			if (await findGoal(userId, now, timezone)) return CHANGED
			// set_goal's own rule: a goal's day is after today.
			if (undo.fields.date && undo.fields.date <= localDate(now, timezone)) {
				return {
					ok: false,
					code: 'date-past',
					message: 'Målets dag har vært. Det kan ikke angres.',
				}
			}
			await createGoal(userId, undo.fields)
			return { ok: true }
		}
		case 'delete': {
			const event = await getEventById(userId, undo.id)
			if (!event)
				return { ok: false, code: 'not-found', message: 'Fant ikke målet.' }
			if (!sameGoal(fieldsOf(event), undo.after)) return CHANGED
			// A plan that runs toward the goal goes with it (cascade): refused,
			// as set_goal refuses to delete a goal a plan runs toward.
			const plan = await prisma.planOutline.findFirst({
				where: { eventId: undo.id, athleteId: userId },
				select: { id: true },
			})
			if (plan) {
				return {
					ok: false,
					code: 'goal-has-plan',
					message:
						'Planen din er bygd mot dette målet. Fjern målet for å begynne på nytt.',
				}
			}
			await deleteEvent(userId, undo.id)
			return { ok: true }
		}
	}
}

export async function attachGoal(
	userId: string,
	goalId: string,
	digest: string | undefined,
	now: Date,
) {
	const active = await findActiveOutline(userId, now)
	if (!active || active.event) {
		return { ok: false as const, reason: 'outline-not-found' as const }
	}
	return attachEventToOutline(userId, active.outline.id, goalId, now, {
		digest,
	})
}

export { cancelEvent, deleteEvent, getEventById }

/** Today, in the athlete's timezone, and the day after (the earliest goal day). */
export function todayOf(now: Date, timezone: string) {
	const today = localDate(now, timezone)
	return { today, tomorrow: addDays(today, 1) }
}
