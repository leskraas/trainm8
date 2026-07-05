/**
 * The Week Replan server applier (#196, PRD #194, ADR 0025).
 *
 * When new real data lands and the load is recomputed (`recomputeLoadFrom` —
 * the ADR 0008 path: session log, import promotion, threshold change, recorded
 * status; never a GET), this applier checks whether the most recently closed
 * Training Week (calendar Mon–Sun in the Athlete Timezone) has a stored
 * `WeekReplan` yet. If not, it gathers the closed week's Weekly Plan Adherence
 * (ADR 0019 semantics unchanged), the current TSB and its trust gate, and the
 * target week's adjustable sessions, runs the pure `decideWeekReplan`, and
 * persists the outcome in one transaction: the `WeekReplan` row, plus — on
 * `adjusted` — each adjustable session's quantified cardio Step Quantities
 * rescaled in place (`scaleStepQuantities`), its Replan Note (`replanReason`)
 * attached, and its Planned TSS recomputed so the softened plan re-prices
 * itself with the same formulas.
 *
 * **At-most-once.** The unique (athlete, weekKey) row IS the idempotency
 * guard: the first evaluation wins, late data never re-opens it, and the
 * multiplicative scale can never compound. Declined outcomes (`no-change`,
 * `insufficient-data`) are stored with their reason and equally never
 * re-evaluated; older closed weeks are never retro-evaluated because only the
 * most recently closed week's key is ever considered.
 *
 * **It preserves the session's `source`** (no adoption flip, ADR 0016 —
 * regeneration remains the reversibility path) and honestly scopes the write:
 * only the target week's future, still-`scheduled` sessions carrying quantified
 * cardio steps are touched. Strength, unquantified, completed, missed, skipped
 * and past sessions get no scale and no note.
 */

import {
	addDays,
	dayBoundsUTC,
	weekMonday,
} from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import { weeklyAdherence } from './adherence.ts'
import { recomputePlannedTssForSession } from './planned-tss.server.ts'
import { getCurrentLoad, getTsbTrust } from './snapshot.server.ts'
import { decideWeekReplan, scaleStepQuantities } from './week-replan.ts'

/** UTC bounds of the Mon–Sun week opening on `monday`, in `timezone`. */
function weekBoundsFromMonday(monday: string, timezone: string) {
	return {
		start: dayBoundsUTC(monday, timezone).start,
		end: dayBoundsUTC(addDays(monday, 6), timezone).end,
	}
}

/**
 * Evaluate and persist the Week Replan for the most recently closed Training
 * Week, at most once per (athlete, closed week). A no-op when that week
 * already has a stored decision. Owner-scoped throughout. `now` is injectable
 * for tests; production callers pass the recompute instant.
 */
export async function applyWeekReplanForUser(
	userId: string,
	now: Date = new Date(),
): Promise<void> {
	const profile = await prisma.athleteProfile.findUnique({
		where: { userId },
		select: { timezone: true },
	})
	// The same Athlete Timezone every load surface buckets with (#122), so the
	// closed week here is exactly the week Weekly Plan Adherence measured.
	const timezone = profile?.timezone ?? 'UTC'

	// The most recently closed Training Week: the week before the one containing
	// `now`. Its Monday is the weekKey — the only key ever evaluated, so older
	// closed weeks are never retro-evaluated.
	const weekKey = addDays(weekMonday(now, timezone), -7)

	// At-most-once: any stored decision for this weekKey — adjusted or declined —
	// means the evaluation already happened and won.
	const existing = await prisma.weekReplan.findUnique({
		where: { athleteId_weekKey: { athleteId: userId, weekKey } },
		select: { id: true },
	})
	if (existing) return

	const [adherence, currentLoad, trust, adjustable] = await Promise.all([
		getClosedWeekAdherence(userId, weekKey, timezone),
		getCurrentLoad(userId),
		getTsbTrust(userId),
		getAdjustableSessions(userId, weekKey, timezone, now),
	])
	const tsb = currentLoad?.tsb ?? null

	// The exact same decision every display surface shows — so what is applied
	// and what is said can never disagree (PRD #194).
	const decision = decideWeekReplan({
		adherence,
		tsb,
		trust,
		adjustableSessions: adjustable.map(({ id }) => ({ id })),
	})

	await prisma.$transaction(async (tx) => {
		await tx.weekReplan.create({
			data: {
				athleteId: userId,
				weekKey,
				outcome: decision.outcome,
				reason: decision.reason,
				adherenceRatio: adherence?.ratio ?? null,
				tsb,
				appliedScale: decision.outcome === 'adjusted' ? decision.scale : null,
			},
		})
		if (decision.outcome !== 'adjusted') return

		for (const session of adjustable) {
			const note = decision.notes.find((n) => n.sessionId === session.id)
			// NOTE: only `replanReason` is written — `source` stays exactly as it
			// was (no adoption flip, ADR 0016).
			await tx.workoutSession.update({
				where: { id: session.id },
				data: { replanReason: note?.note ?? null },
			})
			for (const step of session.steps) {
				await tx.workoutStep.update({
					where: { id: step.id },
					data: scaleStepQuantities(
						{ durationSec: step.durationSec, distanceM: step.distanceM },
						decision.scale,
					),
				})
			}
		}
	})

	// The prescriptions changed, so the Planned TSS they imply did too (ADR
	// 0019) — the softened week re-prices itself with the same formulas.
	if (decision.outcome === 'adjusted') {
		for (const session of adjustable) {
			await recomputePlannedTssForSession(userId, session.id)
		}
	}
}

/**
 * The closed week's Weekly Plan Adherence (ADR 0019, unchanged semantics):
 * summed actual over summed Planned TSS across the week's sessions, `null`
 * when unmeasurable — `weeklyAdherence` owns the exclusion gate.
 */
async function getClosedWeekAdherence(
	userId: string,
	weekKey: string,
	timezone: string,
) {
	const { start, end } = weekBoundsFromMonday(weekKey, timezone)
	const sessions = await prisma.workoutSession.findMany({
		where: { userId, scheduledAt: { gte: start, lte: end } },
		select: { tssValue: true, plannedTssValue: true },
	})
	return weeklyAdherence(
		sessions.map((s) => ({
			plannedTss: s.plannedTssValue,
			actualTss: s.tssValue,
		})),
	)
}

type AdjustableStep = {
	id: string
	durationSec: number | null
	distanceM: number | null
}

/**
 * The target week's adjustable sessions (ADR 0025 §3) with the quantified
 * cardio steps the scale applies to. The target week is the week after the
 * closed one (the week containing `now`); adjustable means future
 * (`scheduledAt > now`), still-`scheduled`, carrying a Workout with at least
 * one quantified cardio step. Strength steps and unquantified cardio are
 * structurally excluded — no load model to scale.
 */
async function getAdjustableSessions(
	userId: string,
	weekKey: string,
	timezone: string,
	now: Date,
): Promise<Array<{ id: string; steps: AdjustableStep[] }>> {
	const targetMonday = addDays(weekKey, 7)
	const { end } = weekBoundsFromMonday(targetMonday, timezone)
	const sessions = await prisma.workoutSession.findMany({
		where: {
			userId,
			status: 'scheduled',
			scheduledAt: { gt: now, lte: end },
			workoutId: { not: null },
		},
		select: {
			id: true,
			workout: {
				select: {
					blocks: {
						select: {
							steps: {
								select: {
									id: true,
									kind: true,
									durationSec: true,
									distanceM: true,
								},
							},
						},
					},
				},
			},
		},
	})
	return sessions
		.map((session) => ({
			id: session.id,
			steps: (session.workout?.blocks ?? [])
				.flatMap((block) => block.steps)
				.filter(
					(step) =>
						step.kind === 'cardio' &&
						(step.durationSec != null || step.distanceM != null),
				),
		}))
		.filter((session) => session.steps.length > 0)
}
