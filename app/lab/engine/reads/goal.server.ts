/**
 * The athlete's **goal**: the event the active plan aims at, the open-ended
 * plan's "get fitter", or — with no plan — the nearest upcoming event.
 */
import { daysBetween, localDate } from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	parseEventDisciplines,
	parseEventTarget,
	type EventTarget,
} from '#app/utils/event-schema.ts'
import { formatClockDuration, formatPaceClock } from '#app/utils/format.ts'
import { ACTION_VALUE_LABELS } from '#app/utils/labels.ts'
import { type ActivePlan } from '#app/utils/training.server.ts'
import { type CapabilityCtx } from '../define.ts'
import { type Goal } from '../reads.types.ts'
import { sportOf } from './shared.server.ts'

export function aimText(target: EventTarget | null): string | null {
	if (!target) return null
	switch (target.kind) {
		case 'time':
			return `På ${formatClockDuration(target.seconds)}`
		case 'pace':
			return `I ${formatPaceClock(target.secPerKm)} /km`
		case 'distance':
			return `${(target.meters / 1000).toLocaleString('nb-NO', { maximumFractionDigits: 3 })} km`
		case 'placement':
			return `Plass ${target.position}`
		case 'finish':
			return 'Fullføre'
		case 'qualitative':
			return target.description
	}
}

function aimDetail(target: EventTarget | null): Goal['aimDetail'] {
	if (!target) return null
	return target.kind === 'qualitative'
		? { kind: 'qualitative', text: target.description }
		: target
}

const eventSelect = {
	id: true,
	name: true,
	kind: true,
	startDate: true,
	disciplines: true,
	target: true,
} as const

type EventRow = {
	id: string
	name: string
	kind: string
	startDate: Date
	disciplines: string
	target: string | null
}

export function goalOfEvent(ctx: CapabilityCtx, event: EventRow): Goal {
	const date = localDate(event.startDate, ctx.timezone)
	const target = parseEventTarget(event.target)
	return {
		kind: 'event',
		eventId: event.id,
		name: event.name,
		date,
		daysToGo: daysBetween(localDate(ctx.now, ctx.timezone), date),
		eventKind: event.kind,
		sports: parseEventDisciplines(event.disciplines).map(sportOf),
		aim: aimText(target),
		aimDetail: aimDetail(target),
	}
}

/**
 * The goal for `plan` (the active plan, or null): its event, or the
 * open-ended plan's; without a plan, the nearest upcoming event.
 */
export async function readGoal(
	ctx: CapabilityCtx,
	plan: ActivePlan | null,
): Promise<Goal | null> {
	if (plan?.eventId) {
		const event = await prisma.event.findFirst({
			where: { id: plan.eventId, athleteId: ctx.userId },
			select: eventSelect,
		})
		if (event) return goalOfEvent(ctx, event)
	}
	if (plan) {
		return {
			kind: 'open-ended',
			eventId: null,
			name: ACTION_VALUE_LABELS.openEndedPlan,
			date: null,
			daysToGo: null,
			eventKind: null,
			sports: plan.tracks.map((t) => sportOf(t.discipline)),
			aim: null,
			aimDetail: null,
		}
	}
	const next = await prisma.event.findFirst({
		where: {
			athleteId: ctx.userId,
			status: { not: 'cancelled' },
			startDate: { gte: ctx.now },
		},
		orderBy: { startDate: 'asc' },
		select: eventSelect,
	})
	return next ? goalOfEvent(ctx, next) : null
}
