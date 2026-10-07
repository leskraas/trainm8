/**
 * _Ukeskiftet_, the week change on the server (#505, ADR 0080): the one step
 * that closes a Training Week, moves the Planning Horizon and lets the
 * morning's silence answer. Run hourly for every athlete with something due
 * (the `week-change` job), and on every load recompute — never on a GET.
 *
 * One run does, in order:
 *
 * 1. **Close the week.** From Sunday 20:00 local the week is closed
 *    (`lastClosedWeekKey`), and its Week Replan and proposals are written
 *    through the proposal author (`applyWeekReplanForUser`). At most once per
 *    closed week: the stored `WeekReplan` row is the guard.
 * 2. **Move the horizon, in the same step.** The closed week's Week Replan
 *    then fills the new horizon week — the week after next, counted from the
 *    closed week — with `generated` sessions from the active plan's Week
 *    Pattern, through the ordinary stamp (`stampWeekPattern`). **Once** per
 *    closed week (`WeekReplan.horizonFilledAt`): a session the athlete deleted
 *    from it is not laid again an hour later, while a fill that failed is
 *    retried by the next run, up to the next close. The fill touches only the
 *    machine's sessions (the stamp's own clearing rule) and lays nothing in a
 *    week the plan has already laid — even when the athlete has since adopted
 *    every session in it; the athlete's own sessions there stay exactly as they
 *    are. No plan, no pattern, or a week past the plan's end: nothing is filled.
 * 3. **Let silence answer, once.** From the first 06:00 local after a Week
 *    Replan was written (Monday morning, for a Sunday-evening close), its
 *    unanswered proposals go to `applyDueProposals`, which applies only what
 *    keeps or reduces load on a session that is the machine's at that moment.
 *    Silence runs over a decision once (`WeekReplan.silencedAt`): what it held
 *    then — the athlete's own sessions, added load, a gone target — stays
 *    pending for the athlete's answer, and is never looked at again.
 *
 * Every step is at most once and claimed before it runs, so the hourly job and
 * a recompute may both run in the same hour without writing anything twice.
 */

import { addDays, weekMonday } from '#app/utils/athlete-calendar.ts'
import { getAthleteTimezone } from '#app/utils/athlete.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { enqueueJob } from '#app/utils/jobs/queue.server.ts'
import { stampWeekPattern } from '#app/utils/plan-outline/stamp.server.ts'
import {
	countPlanLaidSessions,
	readWeekOccupancy,
} from '#app/utils/plan-outline/week-sessions.server.ts'
import { findActiveOutline } from '#app/utils/training.server.ts'
import {
	proposeWeekChange,
	type ProposalAuthor,
} from './propose-week-change.ts'
import {
	horizonWeekKey,
	lastClosedWeekKey,
	nextSilenceAfter,
} from './week-change.ts'
import { applyDueProposals } from './week-replan-proposals.server.ts'
import { applyWeekReplanForUser } from './week-replan.server.ts'

export const WEEK_CHANGE_JOB_KIND = 'week-change'

/** How often the sweep looks for a week change that is due. */
const DEFAULT_WEEK_CHANGE_INTERVAL_MS = 60 * 60 * 1000

/** What one run of the week change did. */
export type WeekChangeRun = {
	/** The most recently closed week's Monday at `now`. */
	closedWeekKey: string
	/** True when this run wrote that week's Week Replan. */
	replanned: boolean
	/**
	 * The horizon week this run filled, and how many sessions it laid there;
	 * `null` when this run did not fill (it was filled already).
	 */
	horizon: { weekKey: string; sessions: number } | null
	/** Proposals the morning's silence applied, and those it left pending. */
	applied: string[]
	held: string[]
}

/**
 * Run the week change for one athlete at `now` (injectable for tests). Safe to
 * call at any time and any number of times: it writes only what is due and
 * not yet written.
 */
export async function runWeekChangeForUser(
	userId: string,
	now: Date = new Date(),
	author: ProposalAuthor = proposeWeekChange,
): Promise<WeekChangeRun> {
	const timezone = await getAthleteTimezone(userId)

	const replan = await applyWeekReplanForUser(userId, now, author, {
		timezone,
	})
	const horizon = await fillHorizonOnce(userId, replan.weekKey, timezone, now)
	const { applied, held } = await silenceOnce(userId, timezone, now)

	return {
		closedWeekKey: replan.weekKey,
		replanned: replan.created,
		horizon,
		applied,
		held,
	}
}

/**
 * Fill the closed week's horizon week unless that was done. Claimed on the
 * Week Replan row first, so two runs never both fill; a fill that throws
 * releases the claim and the next run retries. Only the most recently closed
 * week is ever filled, so a week is never filled late after the next close.
 */
async function fillHorizonOnce(
	userId: string,
	closedWeekKey: string,
	timezone: string,
	now: Date,
): Promise<WeekChangeRun['horizon']> {
	const where = { athleteId: userId, weekKey: closedWeekKey }
	const claimed = await prisma.weekReplan.updateMany({
		where: { ...where, horizonFilledAt: null },
		data: { horizonFilledAt: now },
	})
	if (claimed.count === 0) return null
	try {
		return await fillHorizonWeek(
			userId,
			horizonWeekKey(closedWeekKey),
			timezone,
			now,
		)
	} catch (error) {
		await prisma.weekReplan.updateMany({
			where,
			data: { horizonFilledAt: null },
		})
		throw error
	}
}

/**
 * Run the morning's silence over every decision whose morning has come and
 * that silence has not run over yet — once each, claimed first. A run that
 * throws releases its claims; what it already applied stays applied, and
 * applying again finds nothing more to do.
 */
async function silenceOnce(
	userId: string,
	timezone: string,
	now: Date,
): Promise<{ applied: string[]; held: string[] }> {
	const due = await dueWeekReplanIds(userId, timezone, now)
	if (due.length === 0) return { applied: [], held: [] }
	await prisma.weekReplan.updateMany({
		where: { id: { in: due }, silencedAt: null },
		data: { silencedAt: now },
	})
	const claimed = (
		await prisma.weekReplan.findMany({
			where: { id: { in: due }, silencedAt: now },
			select: { id: true },
		})
	).map((replan) => replan.id)
	try {
		return await applyDueProposals(userId, now, {
			weekReplanIds: claimed,
			timezone,
		})
	} catch (error) {
		await prisma.weekReplan.updateMany({
			where: { id: { in: claimed } },
			data: { silencedAt: null },
		})
		throw error
	}
}

/**
 * Lay the active plan's Week Pattern into the horizon week, as `generated`
 * sessions, unless the plan has laid that week already. Returns how many
 * sessions were laid (0 when there was nothing to lay).
 *
 * The first pattern of the outline is the plan's week: an outline may hold
 * more than one, and the athlete stamps the others by hand.
 */
async function fillHorizonWeek(
	userId: string,
	weekKey: string,
	timezone: string,
	now: Date,
): Promise<{ weekKey: string; sessions: number }> {
	const nothing = { weekKey, sessions: 0 }
	const active = await findActiveOutline(userId, now)
	if (!active) return nothing
	const pattern = await prisma.weekPattern.findFirst({
		where: { outlineId: active.outline.id, days: { some: {} } },
		orderBy: { orderIndex: 'asc' },
		select: { id: true },
	})
	if (!pattern) return nothing

	// Already laid — by the athlete's own stamp of many weeks, or a copy: the
	// plan's sessions there are the plan's week, and laying it again would
	// replace them for nothing, or (when the athlete adopted every one of them)
	// lay the week a second time beside them. Sessions the athlete wrote
	// themselves do not count as laid.
	const [occupancy, laid] = await Promise.all([
		readWeekOccupancy(userId, active.event.id, weekKey, timezone),
		countPlanLaidSessions(userId, active.event.id, weekKey, timezone),
	])
	if (occupancy.replacing > 0 || laid > 0) return nothing

	// `replace` because the athlete's own sessions in the week would otherwise
	// stop the stamp at its confirmation gate. The stamp's clearing only ever
	// removes the machine's untrained sessions, and there are none here.
	const stamped = await stampWeekPattern(userId, {
		patternId: pattern.id,
		weekKeys: [weekKey],
		replace: true,
	})
	return stamped.ok ? { weekKey, sessions: stamped.report.sessions } : nothing
}

/**
 * The Week Replans whose morning has come and that silence has not run over.
 * Only the closed week and the one before it are looked at: an older
 * decision's coming week is over, so nothing in it is ahead.
 */
async function dueWeekReplanIds(
	userId: string,
	timezone: string,
	now: Date,
): Promise<string[]> {
	const replans = await prisma.weekReplan.findMany({
		where: {
			athleteId: userId,
			weekKey: { gte: addDays(weekMonday(now, timezone), -7) },
			silencedAt: null,
		},
		select: { id: true, createdAt: true },
	})
	return replans
		.filter((replan) => nextSilenceAfter(replan.createdAt, timezone) <= now)
		.map((replan) => replan.id)
}

/** Whether a run at `now` has anything to do for this athlete. */
async function isWeekChangeDue(
	userId: string,
	timezone: string,
	now: Date,
): Promise<boolean> {
	const closed = await prisma.weekReplan.findUnique({
		where: {
			athleteId_weekKey: {
				athleteId: userId,
				weekKey: lastClosedWeekKey(now, timezone),
			},
		},
		select: { horizonFilledAt: true },
	})
	if (!closed || closed.horizonFilledAt == null) return true
	return (await dueWeekReplanIds(userId, timezone, now)).length > 0
}

/**
 * The hourly sweep: enqueue one `week-change` job per athlete with a week to
 * close, a horizon to fill or a morning's silence due, and none already
 * queued. Each of those is once per closed week, so an athlete is queued a
 * handful of times a week at most — never every hour for a proposal that waits
 * on their answer. Athletes with no session and no plan have no week to
 * judge. Checked here rather than enqueued blindly, so the queue holds work,
 * not 24 empty jobs per athlete per day.
 */
export async function enqueueWeekChangeJobs(
	now: Date = new Date(),
): Promise<{ enqueued: number }> {
	const athletes = await prisma.user.findMany({
		// A session to judge, or a plan whose horizon the close may fill — an
		// athlete who built a plan and stamped nothing gets their weeks this way.
		where: {
			OR: [
				{ trainingSessions: { some: {} } },
				{ events: { some: { planOutline: { isNot: null } } } },
			],
		},
		select: { id: true },
	})
	let enqueued = 0
	for (const athlete of athletes) {
		const timezone = await getAthleteTimezone(athlete.id)
		if (!(await isWeekChangeDue(athlete.id, timezone, now))) continue
		const payload = { athleteId: athlete.id }
		const queued = await prisma.job.findFirst({
			where: {
				kind: WEEK_CHANGE_JOB_KIND,
				status: { in: ['pending', 'running'] },
				payload: JSON.stringify(payload),
			},
			select: { id: true },
		})
		if (queued) continue
		await enqueueJob({ kind: WEEK_CHANGE_JOB_KIND, payload })
		enqueued++
	}
	return { enqueued }
}

/**
 * Start the hourly week-change sweep. The same shape as the reconciliation
 * sweep (`startReconciliationSchedule`): one `unref`'d interval, a stop
 * function for graceful shutdown, and the first sweep one interval after boot.
 * Hourly is fine enough: the close lands within the hour after Sunday 20:00,
 * and silence within the hour after 06:00.
 */
export function startWeekChangeSchedule({
	intervalMs = DEFAULT_WEEK_CHANGE_INTERVAL_MS,
}: { intervalMs?: number } = {}): () => void {
	let running = false

	const timer = setInterval(() => {
		if (running) return
		running = true
		void enqueueWeekChangeJobs()
			.catch((error) => {
				console.error('[week-change] sweep failed to enqueue', error)
			})
			.finally(() => {
				running = false
			})
	}, intervalMs)
	if (typeof timer.unref === 'function') timer.unref()

	return () => clearInterval(timer)
}
