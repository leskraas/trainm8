/**
 * The Week Replan demo athletes (#198, PRD #194 user story 23, assumption A6).
 *
 * Two seed fixtures that make the loop's honesty demoable end-to-end, both
 * driven through the *real* pipeline — completed sessions with recordings and
 * RPE feed `recomputeLoadFrom`, whose recompute path runs the real
 * `applyWeekReplanForUser` — so the stored `WeekReplan` rows and Replan Notes
 * are exactly what production would write, never hand-composed strings:
 *
 * - **Runa** overreached: her closed week ran ~29% over its planned load while
 *   her Form (TSB) sits well below zero, so the current week's remaining
 *   scheduled runs are visibly softened, each carrying a Replan Note.
 * - **Nils** logged real efforts but no planned load, so his closed week has
 *   no measurable Plan Adherence and he sees the explicit
 *   "no adjustment — not enough data" decline.
 *
 * Dev/demo + test fixture only — no production backfill of `WeekReplan` rows
 * (ADR 0025 evaluates only the most recently closed week, organically).
 */

import { addDays, weekMonday } from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import { recomputeLoadFrom } from '#app/utils/load/snapshot.server.ts'
import { createPassword } from '#tests/db-utils.ts'

export const OVERREACHING_DEMO_USERNAME = 'runa'
export const NO_PLANNED_LOAD_DEMO_USERNAME = 'nils'

/**
 * Seed both demo athletes and run the load pipeline once per athlete from
 * their earliest completed day, which evaluates and stores each one's Week
 * Replan for the most recently closed Training Week. `now` defaults to the
 * seed instant; the fixture is anchored to it so the closed/target weeks are
 * always this athlete's real last/current week.
 */
export async function seedWeekReplanDemoAthletes(
	now: Date = new Date(),
): Promise<{ overreachingId: string; noPlannedLoadId: string }> {
	const overreachingId = await seedOverreachingAthlete(now)
	const noPlannedLoadId = await seedNoPlannedLoadAthlete(now)
	return { overreachingId, noPlannedLoadId }
}

async function createDemoAthlete(username: string, name: string) {
	const user = await prisma.user.create({
		select: { id: true },
		data: {
			email: `${username}@demo.trainm8.dev`,
			username,
			name,
			password: { create: createPassword(username) },
			roles: { connect: { name: 'user' } },
		},
	})
	// The load pipeline needs an Athlete Profile (timezone anchors every week
	// bucket); no thresholds, so actual TSS resolves via sRPE — deterministic
	// from duration × RPE alone.
	await prisma.athleteProfile.create({
		data: { userId: user.id, timezone: 'UTC', preferredUnits: 'metric' },
	})
	return user.id
}

/**
 * One completed run on `dayStr` (YYYY-MM-DD, UTC): a manual recording plus an
 * RPE'd Session Log, so `recomputeLoadFrom` prices it with the real sRPE
 * formula — (minutes/60) × rpe × 15 TSS. `plannedTss`, when given, is the
 * stored Planned TSS side of the Weekly Plan Adherence comparison.
 */
async function completedRun(
	userId: string,
	dayStr: string,
	{
		minutes,
		rpe,
		plannedTss = null,
	}: { minutes: number; rpe: number; plannedTss?: number | null },
) {
	const startedAt = new Date(`${dayStr}T07:00:00.000Z`)
	const durationSec = minutes * 60
	const recording = await prisma.activityImport.create({
		select: { id: true },
		data: {
			athleteId: userId,
			externalProvider: 'manual',
			externalId: `week-replan-demo-${userId}-${dayStr}`,
			startedAt,
			endedAt: new Date(startedAt.getTime() + durationSec * 1000),
			durationSec,
			discipline: 'run',
			rawJson: '{}',
		},
	})
	const session = await prisma.workoutSession.create({
		select: { id: true },
		data: {
			userId,
			scheduledAt: startedAt,
			status: 'completed',
			recordingId: recording.id,
			plannedTssValue: plannedTss,
			plannedTssConfidence: plannedTss != null ? 'full' : null,
			sessionLog: {
				create: { content: 'Seeded demo effort.', rpe },
			},
		},
	})
	await prisma.activityImport.update({
		where: { id: recording.id },
		data: { promotedSessionId: session.id },
	})
}

/** A run Workout whose single quantified cardio step the volume rule can rescale. */
async function quantifiedRunWorkout(userId: string, title: string) {
	const workout = await prisma.workout.create({
		select: { id: true },
		data: {
			title,
			description: 'Steady aerobic hour.',
			discipline: 'run',
			intent: 'endurance',
			ownerId: userId,
			blocks: {
				create: [
					{
						name: 'Main',
						orderIndex: 0,
						repeatCount: 1,
						steps: {
							create: [
								{
									kind: 'cardio',
									discipline: 'run',
									intensity: 'endurance',
									durationSec: 3600,
									orderIndex: 0,
								},
							],
						},
					},
				],
			},
		},
	})
	return workout.id
}

async function scheduledRun(
	userId: string,
	workoutId: string,
	scheduledAt: Date,
) {
	await prisma.workoutSession.create({
		data: { userId, workoutId, scheduledAt, status: 'scheduled' },
	})
}

/**
 * Runa, the overreaching athlete: seven baseline weeks at ~40 TSS/day build a
 * trustworthy (42-day) history, then the closed week runs 90 actual against 70
 * planned every day (ratio 9/7 ≈ 29% over) while the spike drags TSB deep
 * below the gate. Her current week keeps easy completed days up to yesterday
 * (so Form stays measurably negative whichever weekday the seed runs) and
 * still-scheduled quantified runs from `now` onward — the sessions the replan
 * softens. Returns her user id; the final recompute stores the decision.
 */
async function seedOverreachingAthlete(now: Date): Promise<string> {
	const userId = await createDemoAthlete(
		OVERREACHING_DEMO_USERNAME,
		'Runa Overmo',
	)

	const closedMonday = addDays(weekMonday(now, 'UTC'), -7)

	// Seven baseline weeks: 40 min at RPE 4 → 40 TSS, every day.
	for (let back = 49; back >= 1; back--) {
		await completedRun(userId, addDays(closedMonday, -back), {
			minutes: 40,
			rpe: 4,
		})
	}

	// The closed week overshoots daily: 60 min at RPE 6 → 90 TSS vs 70 planned.
	for (let offset = 0; offset < 7; offset++) {
		await completedRun(userId, addDays(closedMonday, offset), {
			minutes: 60,
			rpe: 6,
			plannedTss: 70,
		})
	}

	// The current week so far: easy completed days up to yesterday keep the
	// acute load honest (ATL stays above CTL → TSB below the gate).
	const currentMonday = addDays(closedMonday, 7)
	const todayStr = now.toISOString().slice(0, 10)
	for (let offset = 0; offset < 7; offset++) {
		const dayStr = addDays(currentMonday, offset)
		if (dayStr >= todayStr) break
		await completedRun(userId, dayStr, { minutes: 60, rpe: 4 })
	}

	// The target week's remaining plan: two quantified runs later today (always
	// still in the future when the recompute below evaluates — and two, so a
	// Session Nudge easing the very next one never leaves the demo noteless)
	// plus one on each remaining day at 20:00 UTC — the sessions the replan can
	// honestly soften.
	const workoutId = await quantifiedRunWorkout(userId, 'Steady Aerobic Hour')
	await scheduledRun(
		userId,
		workoutId,
		new Date(now.getTime() + 10 * 60 * 1000),
	)
	await scheduledRun(
		userId,
		workoutId,
		new Date(now.getTime() + 40 * 60 * 1000),
	)
	for (let offset = 0; offset < 7; offset++) {
		const dayStr = addDays(currentMonday, offset)
		if (dayStr <= todayStr) continue
		await scheduledRun(userId, workoutId, new Date(`${dayStr}T20:00:00.000Z`))
	}

	// One pass through the real pipeline: snapshots, per-session TSS, and — on
	// the recompute path — the Week Replan evaluation for the closed week.
	await recomputeLoadFrom(userId, addDays(closedMonday, -49), now)
	return userId
}

/**
 * Nils, the no-planned-load athlete: three weeks of real completed efforts but
 * never a Planned TSS, so the closed week has no measurable Plan Adherence and
 * the stored decision is the explicit insufficient-data decline — the honest
 * "no adjustment — not enough data" outcome, as durable and demoable as an
 * adjustment. His current week still holds scheduled runs, untouched.
 */
async function seedNoPlannedLoadAthlete(now: Date): Promise<string> {
	const userId = await createDemoAthlete(
		NO_PLANNED_LOAD_DEMO_USERNAME,
		'Nils Utenplan',
	)

	const closedMonday = addDays(weekMonday(now, 'UTC'), -7)

	// Three weeks of unplanned training: Mon/Wed/Sat runs, recordings + RPE
	// only — real actual load, no planned side anywhere.
	for (let weekBack = 2; weekBack >= 0; weekBack--) {
		const monday = addDays(closedMonday, -7 * weekBack)
		for (const offset of [0, 2, 5]) {
			await completedRun(userId, addDays(monday, offset), {
				minutes: 50,
				rpe: 5,
			})
		}
	}

	// A held current-week plan, so the declined outcome is visibly a hold.
	const workoutId = await quantifiedRunWorkout(userId, 'Unhurried Hour')
	const currentMonday = addDays(closedMonday, 7)
	const todayStr = now.toISOString().slice(0, 10)
	for (let offset = 0; offset < 7; offset++) {
		const dayStr = addDays(currentMonday, offset)
		if (dayStr <= todayStr) continue
		await scheduledRun(userId, workoutId, new Date(`${dayStr}T20:00:00.000Z`))
	}

	await recomputeLoadFrom(userId, addDays(closedMonday, -14), now)
	return userId
}
