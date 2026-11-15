/**
 * `today`: what to do today, how fresh the athlete is, and the week so far.
 * Built on the domain's own day read (`get_today`) and the coach's own call
 * (form reconciled with weeks of plan adherence, and what it does to the
 * next session), never a call of its own.
 */
import { runAction } from '#app/actions/run.server.ts'
import { buildSessionNudge } from '#app/routes/_home/presenter.ts'
import { coachVerdict } from '#app/routes/_home/timeline/presenter.ts'
import { dayBoundsUTC, weekMonday } from '#app/utils/athlete-calendar.ts'
import { WEATHER_LABELS } from '#app/utils/labels.ts'
import { readAutopilotNotice } from '#app/utils/load/autopilot-notice.server.ts'
import { reconcileCoach, sustainedAdherence } from '#app/utils/load/coach.ts'
import { readinessFromTsb } from '#app/utils/load/readiness.ts'
import { getCurrentLoad, getTsbTrust } from '#app/utils/load/snapshot.server.ts'
import { type TsbTrust } from '#app/utils/load/trustworthiness.ts'
import { getWeekVolumes } from '#app/utils/plan-outline/week-volumes.server.ts'
import {
	getActivePlan,
	getDisciplineThresholds,
	getRecentWeeklyAdherence,
	getSessionLedger,
} from '#app/utils/training.server.ts'
import { type CapabilityCtx } from '../define.ts'
import {
	type FormTrust,
	type Readiness,
	type ReadinessCall,
	type TodayOutput,
} from '../reads.types.ts'
import { phasePosition } from './plan-weeks.server.ts'
import {
	actionCtxOf,
	done,
	num,
	readSessionCards,
	sportVolumeOf,
	todayOf,
	weekdayOf,
	whyOf,
} from './shared.server.ts'

/** Form's trust gate, said. */
export function formTrustOf(trust: TsbTrust, hasHistory: boolean): FormTrust {
	return {
		trusted: trust.trustworthy && hasHistory,
		daysOfHistory: hasHistory ? trust.daysOfHistory : null,
		requiredDays: trust.requiredDays,
		why: !hasHistory
			? whyOf('insufficient-data')
			: trust.trustworthy
				? null
				: `Formen vises etter ${trust.requiredDays} dager med historikk (nå ${trust.daysOfHistory}).`,
	}
}

/** The coach's one call for today, as the domain makes it. */
export async function readReadiness(ctx: CapabilityCtx): Promise<Readiness> {
	const [ledger, load, trust, weeklyAdherence, thresholds] = await Promise.all([
		getSessionLedger(ctx.userId, { now: ctx.now }),
		getCurrentLoad(ctx.userId),
		getTsbTrust(ctx.userId, ctx.now),
		getRecentWeeklyAdherence(ctx.userId, 8, ctx.now),
		getDisciplineThresholds(ctx.userId),
	])
	const current = load ? { ctl: load.ctl, atl: load.atl, tsb: load.tsb } : null
	const sustained = sustainedAdherence(weeklyAdherence)
	const nudge = buildSessionNudge({
		ledger,
		current,
		trust,
		sustained,
		now: ctx.now,
		thresholds,
		timezone: ctx.timezone,
	})
	const coldStart = !trust.trustworthy || current == null
	const coach = reconcileCoach(
		coldStart ? null : readinessFromTsb(current.tsb),
		sustained,
	)
	const call: ReadinessCall | null = !coach
		? null
		: coach.source === 'adherence'
			? coach.tone === 'over'
				? 'overreaching'
				: 'drifting'
			: (coach.tone as ReadinessCall)
	return {
		call,
		ledBy: coach?.source ?? null,
		sentence: coachVerdict({ current, trust, sustained, nudge }),
		nextSession: {
			outcome: nudge.outcome,
			sentence: nudge.outcome === 'none' ? null : nudge.reason,
		},
	}
}

export async function readToday(ctx: CapabilityCtx): Promise<TodayOutput> {
	const actx = actionCtxOf(ctx)
	const date = todayOf(ctx)
	const { start, end } = dayBoundsUTC(date, ctx.timezone)
	const [dayResult, todays, upcoming, trust, readiness, plan, notice, volumes] =
		await Promise.all([
			runAction(actx, 'get_today', {}),
			readSessionCards(ctx, { scheduledAt: { gte: start, lte: end } }),
			readSessionCards(
				ctx,
				{
					scheduledAt: { gt: end },
					status: 'scheduled',
					workoutId: { not: null },
				},
				{ take: 1 },
			),
			getTsbTrust(ctx.userId, ctx.now),
			readReadiness(ctx),
			getActivePlan(ctx.userId, ctx.now),
			readAutopilotNotice(ctx.userId, { now: ctx.now }),
			getWeekVolumes(ctx.userId, { now: ctx.now }),
		])
	const day = done(dayResult)
	const weekKey = weekMonday(ctx.now, ctx.timezone)
	const weather = day?.weather
	const fitness = num(day?.load.ctl)
	return {
		source: 'athlete',
		date,
		weekday: weekdayOf(date),
		weekKey,
		restDay: !todays.cards.some((s) => s.status !== 'recording-only'),
		sessions: todays.cards,
		next: upcoming.cards[0] ?? null,
		form: {
			fitness,
			fatigue: num(day?.load.atl),
			form: num(day?.load.tsb),
		},
		formTrust: formTrustOf(trust, fitness.value != null),
		readiness,
		week: volumes.tracks.map(sportVolumeOf),
		phase: phasePosition(plan, weekKey, ctx.timezone),
		proposalsWaiting: num(day?.openProposals).value ?? 0,
		changesMade: notice?.undoable ?? 0,
		weather:
			weather?.status === 'available'
				? { ...weather.value, credit: WEATHER_LABELS.credit }
				: null,
		weatherWhy:
			weather?.status === 'unavailable'
				? whyOf(weather.reason)
				: weather
					? null
					: whyOf('forecast-unavailable'),
	}
}
