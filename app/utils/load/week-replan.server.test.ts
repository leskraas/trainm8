import { expect, test } from 'vitest'
import {
	addDays,
	dayBoundsUTC,
	weekMonday,
} from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createUser, createPassword } from '#tests/db-utils.ts'
import { recomputePlannedTssForSession } from './planned-tss.server.ts'
import {
	getCurrentLoad,
	getLoadSnapshots,
	getTsbTrust,
	recomputeLoadFrom,
} from './snapshot.server.ts'
import { applyWeekReplanForUser } from './week-replan.server.ts'

// ── fixtures ──────────────────────────────────────────────────────────────
//
// The applier runs on the load-recompute path: when the most recently closed
// Training Week has no stored WeekReplan yet, it decides one (decideWeekReplan)
// and persists it — on `adjusted`, rescaling the target week's quantified
// cardio Step Quantities in place. These tests set up the persisted state each
// branch needs and assert the *persisted* effect — external behaviour only.
//
// The clock is anchored to *this* week's Wednesday noon UTC (rather than a
// fixed date) because the TSB trust gate counts history against the real
// clock: keeping the fixture dates within a known distance of today keeps
// "12 days of history" honestly below the 42-day gate and "60 days" above it.

const NOW = new Date(
	`${addDays(weekMonday(new Date(), 'UTC'), 2)}T12:00:00.000Z`,
)
const CURRENT_MONDAY = weekMonday(NOW, 'UTC')
/** The most recently closed week's Monday — the expected `weekKey`. */
const CLOSED_MONDAY = addDays(CURRENT_MONDAY, -7)

const dayMs = 24 * 60 * 60 * 1000
const iso = (d: Date) => d.toISOString().slice(0, 10)

async function createBiker({
	timezone = 'UTC',
	firstSnapshotDaysAgo = 60,
	tsb = -12,
}: {
	timezone?: string
	firstSnapshotDaysAgo?: number
	tsb?: number
} = {}) {
	const userData = createUser()
	const user = await prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
			athleteProfile: {
				create: {
					timezone,
					disciplineProfiles: {
						create: [
							{
								discipline: 'bike',
								ftp: 250,
								zoneSystem: 'coggan-power-7',
								preferCogganTss: true,
							},
						],
					},
				},
			},
		},
	})

	// Load history: a first snapshot `firstSnapshotDaysAgo` back (drives the
	// trust gate) and the most recent snapshot carrying the TSB the replan reads.
	const first = new Date(NOW.getTime() - firstSnapshotDaysAgo * dayMs)
	await prisma.loadSnapshot.create({
		data: {
			athleteId: user.id,
			date: iso(first),
			tssTotal: 50,
			tssByDiscipline: '{}',
			ctl: 40,
			atl: 40,
			tsb: 0,
		},
	})
	await prisma.loadSnapshot.create({
		data: {
			athleteId: user.id,
			date: iso(NOW),
			tssTotal: 0,
			tssByDiscipline: '{}',
			ctl: 40,
			atl: 40 - tsb,
			tsb,
		},
	})
	return user
}

/**
 * A completed session inside the closed week carrying both sides of the
 * adherence comparison — planned 100 / actual 125 by default, so a lone one
 * makes the closed week 25% `over` (scale 1/1.25 = 0.8 → soften ~20%).
 */
async function createClosedWeekSession(
	userId: string,
	{
		plannedTss = 100,
		actualTss = 125,
		scheduledAt = new Date(`${addDays(CLOSED_MONDAY, 2)}T08:00:00.000Z`),
	} = {},
) {
	return prisma.workoutSession.create({
		data: {
			userId,
			scheduledAt,
			status: 'completed',
			tssValue: actualTss,
			plannedTssValue: plannedTss,
		},
		select: { id: true },
	})
}

/** A quantified bike session in the target week (tomorrow, still scheduled). */
async function createTargetSession(
	userId: string,
	{
		durationSec = 3600 as number | null,
		distanceM = null as number | null,
		source = 'generated' as string,
		status = 'scheduled' as string,
		scheduledAt = new Date(`${addDays(CURRENT_MONDAY, 3)}T08:00:00.000Z`),
		discipline = 'bike' as string,
		stepKind = 'cardio' as string,
	} = {},
) {
	const workout = await prisma.workout.create({
		data: {
			title: 'Tempo ride',
			discipline,
			intent: 'tempo',
			ownerId: userId,
			blocks: {
				create: [
					{
						orderIndex: 0,
						repeatCount: 1,
						steps: {
							create: [
								{
									orderIndex: 0,
									kind: stepKind,
									discipline: stepKind === 'cardio' ? discipline : null,
									durationSec,
									distanceM,
									intensity:
										stepKind === 'cardio'
											? JSON.stringify({
													kind: 'powerPct',
													minPct: 85,
													maxPct: 95,
												})
											: null,
								},
							],
						},
					},
				],
			},
		},
		select: { id: true },
	})
	const session = await prisma.workoutSession.create({
		data: { userId, workoutId: workout.id, scheduledAt, status, source },
		select: { id: true },
	})
	await recomputePlannedTssForSession(userId, session.id)
	return session
}

async function readSession(sessionId: string) {
	const session = await prisma.workoutSession.findUnique({
		where: { id: sessionId },
		select: {
			source: true,
			status: true,
			replanReason: true,
			plannedTssValue: true,
			workout: {
				select: {
					blocks: {
						orderBy: { orderIndex: 'asc' },
						select: {
							steps: {
								orderBy: { orderIndex: 'asc' },
								select: { kind: true, durationSec: true, distanceM: true },
							},
						},
					},
				},
			},
		},
	})
	return session!
}

async function readReplans(userId: string) {
	return prisma.weekReplan.findMany({
		where: { athleteId: userId },
		orderBy: { weekKey: 'asc' },
		select: {
			weekKey: true,
			outcome: true,
			reason: true,
			adherenceRatio: true,
			tsb: true,
			appliedScale: true,
		},
	})
}

// ── adjusted: an over + fatigued closed week softens the target week ─────────

test('an over + fatigued closed week rescales the target week, attaches the note, recomputes Planned TSS, and stores the decision', async () => {
	const user = await createBiker({ tsb: -12 })
	await createClosedWeekSession(user.id) // 25% over
	const session = await createTargetSession(user.id, {
		durationSec: 3600,
		distanceM: 10000,
	})
	const before = await readSession(session.id)
	expect(before.plannedTssValue).not.toBeNull()

	await applyWeekReplanForUser(user.id, NOW)

	const after = await readSession(session.id)
	const step = after.workout!.blocks[0]!.steps[0]!
	// 0.8 × 3600s → 2880s (48 min, on the minute); 0.8 × 10000m → 8000m.
	expect(step.durationSec).toBe(2880)
	expect(step.distanceM).toBe(8000)
	expect(after.replanReason).toBe(
		'Last week ran 25% over plan and Form was −12 — softened this session ~20%.',
	)
	// The softened prescription re-prices itself through the same formulas.
	expect(after.plannedTssValue).not.toBeNull()
	expect(after.plannedTssValue!).toBeLessThan(before.plannedTssValue!)

	expect(await readReplans(user.id)).toEqual([
		{
			weekKey: CLOSED_MONDAY,
			outcome: 'adjusted',
			reason:
				"Last week ran 25% over plan and Form was −12 — softened this week's remaining sessions ~20%.",
			adherenceRatio: 1.25,
			tsb: -12,
			appliedScale: 0.8,
		},
	])
})

test('a generated session stays generated after a rescale (source preserved, no adoption)', async () => {
	const user = await createBiker()
	await createClosedWeekSession(user.id)
	const session = await createTargetSession(user.id, { source: 'generated' })

	await applyWeekReplanForUser(user.id, NOW)

	const after = await readSession(session.id)
	expect(after.workout!.blocks[0]!.steps[0]!.durationSec).toBe(2880)
	expect(after.source).toBe('generated')
})

// ── scope guard: only future, scheduled, quantified cardio is touched ─────────

test('completed, past, next-week, strength, and unquantified sessions are untouched (no scale, no note)', async () => {
	const user = await createBiker()
	await createClosedWeekSession(user.id)
	// One genuinely adjustable session so the adjusted path actually runs…
	const adjustable = await createTargetSession(user.id)
	// …and one of each kind the rule must not touch.
	const completed = await createTargetSession(user.id, { status: 'completed' })
	const past = await createTargetSession(user.id, {
		// Tuesday of the target week — before NOW (Wednesday noon).
		scheduledAt: new Date(`${addDays(CURRENT_MONDAY, 1)}T08:00:00.000Z`),
	})
	const nextWeek = await createTargetSession(user.id, {
		scheduledAt: new Date(`${addDays(CURRENT_MONDAY, 8)}T08:00:00.000Z`),
	})
	const strength = await createTargetSession(user.id, {
		discipline: 'strength',
		stepKind: 'strength',
		durationSec: null,
	})
	const unquantified = await createTargetSession(user.id, {
		durationSec: null,
		distanceM: null,
	})

	await applyWeekReplanForUser(user.id, NOW)

	expect(
		(await readSession(adjustable.id)).workout!.blocks[0]!.steps[0]!
			.durationSec,
	).toBe(2880)
	for (const untouched of [completed, past, nextWeek, strength, unquantified]) {
		const after = await readSession(untouched.id)
		expect(after.replanReason).toBeNull()
		const step = after.workout!.blocks[0]!.steps[0]!
		expect(step.durationSec).toBe(
			untouched === strength || untouched === unquantified ? null : 3600,
		)
		expect(step.distanceM).toBeNull()
	}
})

test('an over + fatigued week with nothing adjustable stores an explicit no-change refusal', async () => {
	const user = await createBiker()
	await createClosedWeekSession(user.id)
	// The only candidate is completed — nothing the rule can honestly soften.
	const session = await createTargetSession(user.id, { status: 'completed' })

	await applyWeekReplanForUser(user.id, NOW)

	const replans = await readReplans(user.id)
	expect(replans).toHaveLength(1)
	expect(replans[0]!.outcome).toBe('no-change')
	expect(replans[0]!.reason).toContain('nothing in the coming week')
	expect(replans[0]!.appliedScale).toBeNull()
	expect((await readSession(session.id)).replanReason).toBeNull()
})

// ── at-most-once: the (athlete, weekKey) row is the idempotency guard ─────────

test('a second recompute for the same closed week changes nothing — the scale never compounds', async () => {
	const user = await createBiker()
	await createClosedWeekSession(user.id)
	const session = await createTargetSession(user.id)

	await applyWeekReplanForUser(user.id, NOW)
	const once = await readSession(session.id)
	await applyWeekReplanForUser(user.id, NOW)
	const twice = await readSession(session.id)

	// Not 0.8 × 2880 = 2304 — the first evaluation won.
	expect(twice.workout!.blocks[0]!.steps[0]!.durationSec).toBe(2880)
	expect(twice).toEqual(once)
	expect(await readReplans(user.id)).toHaveLength(1)
})

test('idempotency survives the notes and rescaled rows being wiped — the guard is the WeekReplan row', async () => {
	const user = await createBiker()
	await createClosedWeekSession(user.id)
	const session = await createTargetSession(user.id)

	await applyWeekReplanForUser(user.id, NOW)

	// Undo everything the applier wrote to the session; keep only the row.
	await prisma.workoutSession.update({
		where: { id: session.id },
		data: { replanReason: null },
	})
	await prisma.workoutStep.updateMany({
		where: { block: { workout: { sessions: { some: { id: session.id } } } } },
		data: { durationSec: 3600 },
	})

	await applyWeekReplanForUser(user.id, NOW)

	const after = await readSession(session.id)
	expect(after.workout!.blocks[0]!.steps[0]!.durationSec).toBe(3600)
	expect(after.replanReason).toBeNull()
})

// ── declined outcomes are stored with their reason, and never re-evaluated ────

test('an under week stores no-change with the "bank the planned work" reason and touches nothing', async () => {
	const user = await createBiker()
	await createClosedWeekSession(user.id, { plannedTss: 100, actualTss: 50 })
	const session = await createTargetSession(user.id)

	await applyWeekReplanForUser(user.id, NOW)

	const replans = await readReplans(user.id)
	expect(replans).toHaveLength(1)
	expect(replans[0]!.outcome).toBe('no-change')
	expect(replans[0]!.reason).toContain('bank the planned work')
	expect(replans[0]!.adherenceRatio).toBe(0.5)
	const after = await readSession(session.id)
	expect(after.workout!.blocks[0]!.steps[0]!.durationSec).toBe(3600)
	expect(after.replanReason).toBeNull()
})

test('an over week with fresh Form stores no-change (the body is absorbing it)', async () => {
	const user = await createBiker({ tsb: 8 })
	await createClosedWeekSession(user.id)
	const session = await createTargetSession(user.id)

	await applyWeekReplanForUser(user.id, NOW)

	const replans = await readReplans(user.id)
	expect(replans).toHaveLength(1)
	expect(replans[0]!.outcome).toBe('no-change')
	expect(replans[0]!.tsb).toBe(8)
	expect((await readSession(session.id)).replanReason).toBeNull()
})

test('an over week below the TSB trust gate stores insufficient-data and touches nothing', async () => {
	const user = await createBiker({ tsb: -12, firstSnapshotDaysAgo: 12 })
	await createClosedWeekSession(user.id)
	const session = await createTargetSession(user.id)

	await applyWeekReplanForUser(user.id, NOW)

	const replans = await readReplans(user.id)
	expect(replans).toHaveLength(1)
	expect(replans[0]!.outcome).toBe('insufficient-data')
	expect(replans[0]!.appliedScale).toBeNull()
	const after = await readSession(session.id)
	expect(after.workout!.blocks[0]!.steps[0]!.durationSec).toBe(3600)
	expect(after.replanReason).toBeNull()
})

test('a closed week with no measurable adherence stores insufficient-data', async () => {
	const user = await createBiker()

	await applyWeekReplanForUser(user.id, NOW)

	const replans = await readReplans(user.id)
	expect(replans).toHaveLength(1)
	expect(replans[0]!.outcome).toBe('insufficient-data')
	expect(replans[0]!.reason).toContain('no measurable Plan Adherence')
	expect(replans[0]!.adherenceRatio).toBeNull()
})

test('a stored declined outcome is never re-evaluated, even when late data would now justify adjusting', async () => {
	const user = await createBiker({ tsb: -12 })
	const session = await createTargetSession(user.id)

	// First recompute: empty closed week → insufficient-data, stored.
	await applyWeekReplanForUser(user.id, NOW)
	// Late data lands for the closed week: clearly over, Form fatigued.
	await createClosedWeekSession(user.id)
	await applyWeekReplanForUser(user.id, NOW)

	const replans = await readReplans(user.id)
	expect(replans).toHaveLength(1)
	expect(replans[0]!.outcome).toBe('insufficient-data')
	const after = await readSession(session.id)
	expect(after.workout!.blocks[0]!.steps[0]!.durationSec).toBe(3600)
	expect(after.replanReason).toBeNull()
})

// ── timezone-correct week bucketing (Athlete Timezone, not UTC) ───────────────

test('Oslo: a Sunday-night session counts in the closed week it belongs to', async () => {
	const tz = 'Europe/Oslo'
	const user = await createBiker({ timezone: tz })
	// Alone, the closed week is exactly on target…
	await createClosedWeekSession(user.id, { plannedTss: 100, actualTss: 100 })
	// …and only the Sunday ~23:30 Oslo session (still Sunday UTC) tips it over:
	// combined 250/200 = 1.25.
	const closedSundayEnd = dayBoundsUTC(addDays(CLOSED_MONDAY, 6), tz).end
	await createClosedWeekSession(user.id, {
		plannedTss: 100,
		actualTss: 150,
		scheduledAt: new Date(closedSundayEnd.getTime() - 30 * 60 * 1000),
	})
	const session = await createTargetSession(user.id)

	await applyWeekReplanForUser(user.id, NOW)

	const replans = await readReplans(user.id)
	expect(replans).toEqual([
		expect.objectContaining({
			weekKey: CLOSED_MONDAY,
			outcome: 'adjusted',
			adherenceRatio: 1.25,
		}),
	])
	expect(
		(await readSession(session.id)).workout!.blocks[0]!.steps[0]!.durationSec,
	).toBe(2880)
})

test('Oslo: a Monday-00:30 local session (still Sunday in UTC) belongs to the new week, not the closed one', async () => {
	const tz = 'Europe/Oslo'
	const user = await createBiker({ timezone: tz })
	// The closed week is on target…
	await createClosedWeekSession(user.id, { plannedTss: 100, actualTss: 100 })
	// …and a huge session 30 minutes into Oslo's Monday (Sunday evening UTC)
	// must NOT pollute it — UTC bucketing would read the week as 2× over.
	const currentMondayStart = dayBoundsUTC(CURRENT_MONDAY, tz).start
	await createClosedWeekSession(user.id, {
		plannedTss: 100,
		actualTss: 300,
		scheduledAt: new Date(currentMondayStart.getTime() + 30 * 60 * 1000),
	})
	const session = await createTargetSession(user.id)

	await applyWeekReplanForUser(user.id, NOW)

	const replans = await readReplans(user.id)
	expect(replans).toEqual([
		expect.objectContaining({
			weekKey: CLOSED_MONDAY,
			outcome: 'no-change',
			adherenceRatio: 1,
		}),
	])
	expect(
		(await readSession(session.id)).workout!.blocks[0]!.steps[0]!.durationSec,
	).toBe(3600)
})

// ── wiring: the recompute path runs the replan, before the Session Nudge ──────

test('recomputeLoadFrom evaluates the Week Replan before the Session Nudge (the ease composes on top of the rescale)', async () => {
	const userData = createUser()
	const user = await prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
			athleteProfile: {
				create: {
					timezone: 'UTC',
					disciplineProfiles: {
						create: [
							{
								discipline: 'bike',
								ftp: 250,
								zoneSystem: 'coggan-power-7',
								preferCogganTss: true,
							},
						],
					},
				},
			},
		},
	})
	// Trust anchor 60 days back, and a deeply fatigued snapshot the day before
	// NOW — the recompute re-derives today's snapshot from that anchor, so both
	// appliers read TSB −18 (replan: over + fatigued → adjust; nudge: back-off).
	await prisma.loadSnapshot.create({
		data: {
			athleteId: user.id,
			date: iso(new Date(NOW.getTime() - 60 * dayMs)),
			tssTotal: 50,
			tssByDiscipline: '{}',
			ctl: 40,
			atl: 40,
			tsb: 0,
		},
	})
	await prisma.loadSnapshot.create({
		data: {
			athleteId: user.id,
			date: iso(new Date(NOW.getTime() - dayMs)),
			tssTotal: 0,
			tssByDiscipline: '{}',
			ctl: 40,
			atl: 58,
			tsb: -18,
		},
	})
	await createClosedWeekSession(user.id) // 25% over
	// A 90-minute session: replan-then-nudge ends at the eased 60-minute cap,
	// while the reverse order would rescale the eased hour down to 48 minutes.
	const session = await createTargetSession(user.id, { durationSec: 5400 })

	await recomputeLoadFrom(user.id, iso(NOW), NOW)

	const replans = await readReplans(user.id)
	expect(replans).toEqual([
		expect.objectContaining({ outcome: 'adjusted', appliedScale: 0.8 }),
	])
	const after = await readSession(session.id)
	// The Session Nudge's canonical eased target, un-rescaled: the nudge ran last.
	expect(after.workout!.blocks[0]!.steps[0]!.durationSec).toBe(3600)
})

test('read paths never evaluate a Week Replan (never on a GET)', async () => {
	const user = await createBiker()
	await createClosedWeekSession(user.id)
	await createTargetSession(user.id)

	await getLoadSnapshots(user.id)
	await getCurrentLoad(user.id)
	await getTsbTrust(user.id)

	expect(await readReplans(user.id)).toHaveLength(0)
})
