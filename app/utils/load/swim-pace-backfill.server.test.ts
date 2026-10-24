import { faker } from '@faker-js/faker/locale/en'
import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { parseFit } from '#app/utils/fit-parser.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { encodePoolSwim } from '#tests/fixtures/fit/pool-swim.ts'
import { recomputeLoadFrom } from './snapshot.server.ts'
import {
	ensureSwimPaceBackfillEnqueued,
	runSwimPaceBackfill,
	SWIM_PACE_BACKFILL_JOB_KIND,
	SWIM_REST_LEFT_THE_PACE_NOTICE,
	swimPaceCorrection,
} from './swim-pace-backfill.server.ts'

// ── the one-shot pool-swim pace recompute (#628, ADR 0107) ────────────────────
// A pool swim parsed from its FIT before #628 stored the timer pace, rest at the
// wall included, and sTSS priced it. The backfill re-reads the kept FIT, puts
// the pace swum on the import, recomputes load and leaves a notice.

/** The fixture's pace under the old parser: 851 s of timer over 750 m. */
const TIMER_PACE = 851 / 0.75
/** The fixture's pace over its active lengths: 761 s swum over 750 m. */
const SWUM_PACE = 761 / 0.75

async function createSwimmer({ css = 150 }: { css?: number | null } = {}) {
	const userData = createUser()
	return prisma.user.create({
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
								discipline: 'swim',
								cssSecPer100m: css,
								preferCogganTss: false,
								preferRTSS: false,
							},
						],
					},
				},
			},
		},
	})
}

function daysAgo(n: number): Date {
	const at = new Date()
	at.setUTCHours(6, 0, 0, 0)
	at.setUTCDate(at.getUTCDate() - n)
	return at
}

/**
 * An auto-saved pool swim as the old parser filed it: the fixture's metrics
 * with the timer pace, and (unless `file` is false) the FIT kept beside it.
 */
async function createPoolSwim(
	athleteId: string,
	opts: {
		start: Date
		paceAvgSecPerKm?: number
		externalProvider?: string
		fetchedVia?: string
		file?: boolean
	},
) {
	const bytes = encodePoolSwim({ start: opts.start })
	const imp = await prisma.activityImport.create({
		data: {
			athleteId,
			externalProvider: opts.externalProvider ?? 'manual',
			externalId: faker.string.uuid(),
			startedAt: opts.start,
			endedAt: new Date(opts.start.getTime() + 851_000),
			durationSec: 851,
			distanceM: 750,
			discipline: 'swim',
			hrAvg: 142,
			paceAvgSecPerKm: opts.paceAvgSecPerKm ?? TIMER_PACE,
			rawJson: '{}',
			...(opts.file === false
				? {}
				: {
						originalFile: {
							create: {
								format: 'fit',
								fetchedVia: opts.fetchedVia ?? 'upload',
								bytes: new Uint8Array(bytes),
							},
						},
					}),
		},
		select: { id: true },
	})
	const session = await prisma.workoutSession.create({
		data: {
			userId: athleteId,
			scheduledAt: opts.start,
			status: 'completed',
			recordingId: imp.id,
		},
		select: { id: true },
	})
	await prisma.activityImport.update({
		where: { id: imp.id },
		data: { promotedSessionId: session.id },
	})
	return imp
}

/** A month of daily pool swims, enough load for CTL to move visibly. */
async function createSwimMonth(athleteId: string, opts = {}) {
	const ids: string[] = []
	for (let n = 30; n >= 1; n--) {
		const imp = await createPoolSwim(athleteId, { start: daysAgo(n), ...opts })
		ids.push(imp.id)
	}
	await recomputeLoadFrom(athleteId, daysAgo(30).toISOString().slice(0, 10))
	return ids
}

async function paceOf(importId: string) {
	const row = await prisma.activityImport.findUniqueOrThrow({
		where: { id: importId },
		select: {
			paceAvgSecPerKm: true,
			// A saved swim's TSS is written on the session it is the Recording of.
			promotedSession: { select: { tssValue: true } },
		},
	})
	return {
		paceAvgSecPerKm: row.paceAvgSecPerKm,
		tssValue: row.promotedSession?.tssValue ?? null,
	}
}

test('ensureSwimPaceBackfillEnqueued enqueues exactly once, ever', async () => {
	await prisma.job.deleteMany({ where: { kind: SWIM_PACE_BACKFILL_JOB_KIND } })

	await ensureSwimPaceBackfillEnqueued()
	await ensureSwimPaceBackfillEnqueued()
	expect(
		await prisma.job.count({ where: { kind: SWIM_PACE_BACKFILL_JOB_KIND } }),
	).toBe(1)

	await prisma.job.updateMany({
		where: { kind: SWIM_PACE_BACKFILL_JOB_KIND },
		data: { status: 'completed' },
	})
	await ensureSwimPaceBackfillEnqueued()
	expect(
		await prisma.job.count({ where: { kind: SWIM_PACE_BACKFILL_JOB_KIND } }),
	).toBe(1)
})

test('swimPaceCorrection corrects a pace the old parser read from this file', () => {
	const { sessions } = parseFit(encodePoolSwim())
	expect(swimPaceCorrection(TIMER_PACE, sessions)).toBeCloseTo(SWUM_PACE, 6)
})

test("swimPaceCorrection leaves a pace that isn't the old parser's reading", () => {
	const { sessions } = parseFit(encodePoolSwim())
	// A provider's own moving pace (Intervals.icu, then harvested) is theirs.
	expect(swimPaceCorrection(1050, sessions)).toBeNull()
	// Already corrected: nothing left to change.
	expect(swimPaceCorrection(SWUM_PACE, sessions)).toBeNull()
	expect(swimPaceCorrection(null, sessions)).toBeNull()
})

test('a month of uploaded pool swims is re-read: pace swum, higher sTSS, a CTL rise and one notice', async () => {
	const user = await createSwimmer()
	const ids = await createSwimMonth(user.id)
	const before = await paceOf(ids[0]!)

	await runSwimPaceBackfill()

	const after = await paceOf(ids[0]!)
	expect(after.paceAvgSecPerKm).toBeCloseTo(SWUM_PACE, 6)
	// Rest is no longer priced as slow swimming, so each swim weighs more.
	expect(after.tssValue!).toBeGreaterThan(before.tssValue!)

	const notice = await prisma.loadRecomputeNotice.findUniqueOrThrow({
		where: {
			athleteId_kind: {
				athleteId: user.id,
				kind: SWIM_REST_LEFT_THE_PACE_NOTICE,
			},
		},
	})
	// A rise, and one the triad shows in whole numbers.
	expect(notice.ctlAfter).toBeGreaterThan(notice.ctlBefore)
	expect(Math.round(notice.ctlAfter)).toBeGreaterThan(
		Math.round(notice.ctlBefore),
	)
	expect(notice.dismissedAt).toBeNull()

	// A retry finds nothing left to correct, keeps the first run's `ctlBefore`
	// and writes no second notice.
	await runSwimPaceBackfill()
	expect(
		await prisma.loadRecomputeNotice.count({ where: { athleteId: user.id } }),
	).toBe(1)
	const reread = await prisma.loadRecomputeNotice.findFirstOrThrow({
		where: { athleteId: user.id },
	})
	expect(reread.ctlBefore).toBeCloseTo(notice.ctlBefore, 6)
})

test('a retry after the paces were written still recomputes the load', async () => {
	// A crash between writing the paces and recomputing would otherwise leave
	// the new pace under the old sTSS for good: the retry must not skip them.
	const user = await createSwimmer()
	const ids = await createSwimMonth(user.id)
	const stale = await paceOf(ids[0]!)
	await prisma.activityImport.updateMany({
		where: { id: { in: ids } },
		data: { paceAvgSecPerKm: SWUM_PACE },
	})

	await runSwimPaceBackfill()

	expect((await paceOf(ids[0]!)).tssValue!).toBeGreaterThan(stale.tssValue!)
	// The crash came before the notice too, so the retry owes it.
	expect(
		await prisma.loadRecomputeNotice.count({ where: { athleteId: user.id } }),
	).toBe(1)
})

test('a swim with no kept FIT is left alone (Strava, Intervals.icu before the harvest)', async () => {
	const user = await createSwimmer()
	const ids = await createSwimMonth(user.id, {
		externalProvider: 'strava',
		file: false,
	})

	await runSwimPaceBackfill()

	expect((await paceOf(ids[0]!)).paceAvgSecPerKm).toBeCloseTo(TIMER_PACE, 6)
	expect(
		await prisma.loadRecomputeNotice.count({ where: { athleteId: user.id } }),
	).toBe(0)
})

test("a harvested swim keeps the provider's moving pace", async () => {
	const user = await createSwimmer()
	const imp = await createPoolSwim(user.id, {
		start: daysAgo(3),
		externalProvider: 'intervalsicu',
		fetchedVia: 'intervalsicu-harvest',
		paceAvgSecPerKm: 1050,
	})

	await runSwimPaceBackfill()

	expect((await paceOf(imp.id)).paceAvgSecPerKm).toBe(1050)
	expect(
		await prisma.loadRecomputeNotice.count({ where: { athleteId: user.id } }),
	).toBe(0)
})

test('a swimmer without CSS still gets the notice: the pace they read changed', async () => {
	// No CSS → no sTSS, so CTL does not move; but the swim's pace on the session
	// moved from 1:53 to 1:41 /100 m, which is a number they read.
	const user = await createSwimmer({ css: null })
	const imp = await createPoolSwim(user.id, { start: daysAgo(3) })

	await runSwimPaceBackfill()

	expect((await paceOf(imp.id)).paceAvgSecPerKm).toBeCloseTo(SWUM_PACE, 6)
	const notice = await prisma.loadRecomputeNotice.findFirstOrThrow({
		where: { athleteId: user.id },
	})
	expect(notice.kind).toBe(SWIM_REST_LEFT_THE_PACE_NOTICE)
	expect(Math.round(notice.ctlAfter)).toBe(Math.round(notice.ctlBefore))
})
