/**
 * The Session Nudge server applier (#158, PRD #156, feature #154), Slice 2.
 *
 * When new real data lands and the load is recomputed (a Session Log, an
 * ActivityImport promotion, or a threshold change — ADR 0008), this applier runs
 * the SAME shared decision the home surface displays (`buildSessionNudge` →
 * `decideSessionNudge`) and, on an `eased` outcome, rewrites ONLY the next
 * planned cardio session's blocks/steps to the canonical eased target
 * (`buildEasedPrescription`), then recomputes that session's Planned TSS (ADR
 * 0019). Because the target is absolute, re-applying is a no-op — idempotent, no
 * marker column, no schema change.
 *
 * **It preserves the session's `source`.** It deliberately does NOT reuse the
 * session-edit path, whose adoption flip (generated → authored, ADR 0016) would
 * permanently shield the session from regeneration. Regeneration remains the
 * reversibility path. It runs on the load-recompute path, never on a GET.
 *
 * **Trust-gated exactly like the decision core.** Below the 42-day TSB trust gate
 * a Form-derived call is `unavailable` and nothing is mutated; a sustained *over*
 * deviation is independent of TSB trust, so it still eases during cold-start.
 * Both properties come for free from reusing `buildSessionNudge`.
 */

import {
	buildSessionNudge,
	buildTodayCard,
} from '#app/routes/_home/cockpit/presenter.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	getDisciplineThresholds,
	getRecentWeeklyAdherence,
	getSessionLedger,
} from '#app/utils/training.server.ts'
import { sustainedAdherence, SUSTAINED_WEEKS } from './coach.ts'
import { buildEasedPrescription } from './eased-prescription.ts'
import { recomputePlannedTssForSession } from './planned-tss.server.ts'
import { getCurrentLoad, getTsbTrust } from './snapshot.server.ts'

// Same trailing window the home surface uses to detect a sustained streak: at
// least SUSTAINED_WEEKS, comfortably more so the walk-back has room.
const BUILD_WEEKS = Math.max(8, SUSTAINED_WEEKS)

/**
 * Reconcile the athlete's current Form + adherence into the Session Nudge and,
 * if it is `eased`, persist the canonical eased prescription onto the next
 * planned cardio session. A no-op for every other outcome (`held` / `unavailable`
 * / `none`) and idempotent on repeat calls.
 *
 * Owner-scoped throughout. `now` is injectable for tests; production callers pass
 * the recompute instant.
 */
export async function applySessionNudgeForUser(
	userId: string,
	now: Date = new Date(),
): Promise<void> {
	const [ledger, currentLoad, trust, weeklyBuild, thresholds] =
		await Promise.all([
			getSessionLedger(userId, { now }),
			getCurrentLoad(userId),
			getTsbTrust(userId),
			getRecentWeeklyAdherence(userId, BUILD_WEEKS, now),
			getDisciplineThresholds(userId),
		])

	const current = currentLoad
		? { ctl: currentLoad.ctl, atl: currentLoad.atl, tsb: currentLoad.tsb }
		: null
	const sustained = sustainedAdherence(weeklyBuild)

	// The exact same decision the Coach card shows — so what is applied and what
	// is said can never disagree (PRD #156).
	const nudge = buildSessionNudge({
		ledger,
		current,
		trust,
		sustained,
		now,
		thresholds,
	})
	if (nudge.outcome !== 'eased') return

	// The exact same next-planned session the Today card (and the nudge) selects.
	const today = buildTodayCard(ledger, now, thresholds)
	if (!today) return

	await applyEaseToSession(userId, today.id, {
		discipline: today.discipline,
		durationMin: today.durationMin,
		profile: thresholds[today.discipline] ?? null,
	})
}

/**
 * Rewrite a single session's blocks/steps to the canonical eased prescription
 * and recompute its Planned TSS — without touching `source`. Idempotent: the
 * target is absolute, so re-applying writes the identical prescription.
 */
async function applyEaseToSession(
	userId: string,
	sessionId: string,
	source: Parameters<typeof buildEasedPrescription>[0],
): Promise<void> {
	const session = await prisma.workoutSession.findFirst({
		where: { id: sessionId, userId },
		select: { id: true, workoutId: true },
	})
	if (!session?.workoutId) return
	const { workoutId } = session

	const eased = buildEasedPrescription(source)
	// Strength (no cardio zone model) yields no target — nothing to ease.
	if (!eased.blocks) return
	const { blocks } = eased

	await prisma.$transaction(async (tx) => {
		await tx.workoutBlock.deleteMany({ where: { workoutId } })
		await tx.workout.update({
			where: { id: workoutId },
			data: {
				// Endurance intent: the eased session is an easy aerobic session.
				intent: eased.intent,
				blocks: {
					create: blocks.map((block, blockIndex) => ({
						orderIndex: blockIndex,
						repeatCount: block.repeatCount,
						steps: {
							create: block.steps.map((step, stepIndex) => ({
								orderIndex: stepIndex,
								kind: step.kind,
								discipline: step.discipline,
								intensity: JSON.stringify(step.intensity),
								durationSec: step.durationSec,
							})),
						},
					})),
				},
			},
		})
		// NOTE: the WorkoutSession row is deliberately NOT updated — `source` stays
		// exactly as it was (no adoption flip, ADR 0016).
	})

	// The prescription changed, so the Planned TSS it implies did too (ADR 0019).
	// An unresolvable endurance zone honestly leaves Planned TSS null (Unavailable
	// Metric) rather than fabricating a number.
	await recomputePlannedTssForSession(userId, session.id)
}
