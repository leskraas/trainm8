// The Plan Outline's invariants are structural (ADR 0044 §1): they live in the
// schema and in the migration's CHECK constraints, not in a service-layer
// validator. These tests pin them, because a constraint nobody exercises is a
// constraint a later table rebuild can silently drop.
import { readFile } from 'node:fs/promises'
import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'

const START_WEEK_KEY = '2030-01-07' // a Monday

/** An athlete with one upcoming race — the row a Plan Outline hangs off. */
async function createOutlineEvent() {
	const userData = createUser()
	const user = await prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
		},
	})
	return prisma.event.create({
		select: { id: true },
		data: {
			athleteId: user.id,
			name: 'Spring Half Marathon',
			kind: 'race',
			priority: 'A',
			startDate: new Date('2030-04-01T09:00:00Z'),
			disciplines: JSON.stringify(['run']),
		},
	})
}

/**
 * The backfill migration's own statement, read from the migration rather than
 * retyped — a copy here could drift from what production ran and still pass.
 */
async function backfillEnduranceSegments() {
	const sql = await readFile(
		new URL(
			'../../../prisma/migrations/20260731100000_backfill_endurance_segments/migration.sql',
			import.meta.url,
		),
		'utf8',
	)
	await prisma.$executeRawUnsafe(sql)
}

async function createOutline() {
	const event = await createOutlineEvent()
	return prisma.planOutline.create({
		data: {
			eventId: event.id,
			startWeekKey: START_WEEK_KEY,
			phases: { create: [{ orderIndex: 0, name: 'Base', weeks: 4 }] },
		},
		select: { id: true, phases: { select: { id: true } } },
	})
}

async function createTrack(
	outlineId: string,
	discipline = 'run',
	currency = 'km',
) {
	return prisma.trainingTrack.create({
		data: { outlineId, discipline, currency },
		select: { id: true },
	})
}

test('a Volume Currency outside the vocabulary is rejected by the database', async () => {
	const outline = await createOutline()
	await expect(createTrack(outline.id, 'run', 'watts')).rejects.toThrow()
})

test('a Discipline gets at most one Training Track (ADR 0043 §1)', async () => {
	const outline = await createOutline()
	await createTrack(outline.id, 'run', 'km')
	// A second run track would give one Discipline two currencies, which ADR 0043
	// makes impossible rather than merely discouraged.
	await expect(createTrack(outline.id, 'run', 'hours')).rejects.toThrow()
	// A different Discipline is fine, and authors its own currency.
	await expect(
		createTrack(outline.id, 'strength', 'sets'),
	).resolves.toBeTruthy()
})

test('a Quality Session Mix admits zones 3–5 only (ADR 0042 §3)', async () => {
	const outline = await createOutline()
	const track = await createTrack(outline.id)
	const segment = await prisma.trainingTrackSegment.create({
		data: {
			trackId: track.id,
			kind: 'endurance',
			phaseId: outline.phases[0]!.id,
			ramp: 0.05,
		},
		select: { id: true },
	})

	await expect(
		prisma.qualitySessionMixEntry.create({
			data: { segmentId: segment.id, zone: 2, sessionsPerWeek: 1 },
		}),
	).rejects.toThrow()
	await expect(
		prisma.qualitySessionMixEntry.create({
			data: { segmentId: segment.id, zone: 4, sessionsPerWeek: 2 },
		}),
	).resolves.toBeTruthy()
	// A zone cannot appear twice in one mix — it is a multiset by count, not by row.
	await expect(
		prisma.qualitySessionMixEntry.create({
			data: { segmentId: segment.id, zone: 4, sessionsPerWeek: 1 },
		}),
	).rejects.toThrow()
})

test('an endurance segment is bound to a phase and a strength segment is dated', async () => {
	const outline = await createOutline()
	const track = await createTrack(outline.id)

	// Neither kind may borrow the other's positioning fields (ADR 0044 §3).
	await expect(
		prisma.trainingTrackSegment.create({
			data: {
				trackId: track.id,
				kind: 'endurance',
				startWeekKey: START_WEEK_KEY,
			},
		}),
	).rejects.toThrow()
	await expect(
		prisma.trainingTrackSegment.create({
			data: {
				trackId: track.id,
				kind: 'strength',
				phaseId: outline.phases[0]!.id,
				weeks: 5,
			},
		}),
	).rejects.toThrow()
	// A strength segment authors a start, a duration, a goal and a frequency —
	// never an end date, and never the retired Volume Landmarks (ADR 0047).
	await expect(
		prisma.trainingTrackSegment.create({
			data: {
				trackId: track.id,
				kind: 'strength',
				startWeekKey: START_WEEK_KEY,
				weeks: 5,
				goal: 'hypertrophy',
				sessionsPerWeek: 3,
			},
		}),
	).resolves.toBeTruthy()
})

test('a Strength Goal outside the vocabulary is rejected by the database', async () => {
	const outline = await createOutline()
	const track = await createTrack(outline.id, 'strength', 'sets')
	const strengthSegment = (goal: string) =>
		prisma.trainingTrackSegment.create({
			data: {
				trackId: track.id,
				kind: 'strength',
				startWeekKey: START_WEEK_KEY,
				weeks: 5,
				goal,
				// Present so the row's only variable is the goal: the per-kind CHECK
				// requires a frequency on every strength segment.
				sessionsPerWeek: 3,
			},
		})

	// ACSM 2026's three, under the field's own term for the middle one — so
	// 'strength' on its own is not one of them (ADR 0047 §3).
	await expect(strengthSegment('strength')).rejects.toThrow()
	await expect(strengthSegment('maximal-strength')).resolves.toBeTruthy()
})

test('a strength segment must carry a Strength Goal and a Strength Frequency', async () => {
	const outline = await createOutline()
	const track = await createTrack(outline.id, 'strength', 'sets')
	const segment = (data: { goal?: string; sessionsPerWeek?: number }) =>
		prisma.trainingTrackSegment.create({
			data: {
				trackId: track.id,
				kind: 'strength',
				startWeekKey: START_WEEK_KEY,
				weeks: 4,
				...data,
			},
		})

	// The two are what a strength segment *authors* (ADR 0047 §3/§4) — the
	// counterpart to the endurance segment's Quality Session Mix — and neither has
	// a documented convention to fall back to, so neither is a null the derivation
	// can read as "follow the convention" the way the cut columns are.
	//
	// The constraint is real rather than assumed because two readings of such a row
	// disagree: `strengthSegmentReadings` drops it, so it never reaches the editor
	// and can be neither fixed nor removed, while `strengthFitSegments` keeps
	// counting it in the days-against-days check.
	await expect(segment({})).rejects.toThrow()
	await expect(segment({ goal: 'hypertrophy' })).rejects.toThrow()
	await expect(segment({ sessionsPerWeek: 3 })).rejects.toThrow()
	await expect(
		segment({ goal: 'hypertrophy', sessionsPerWeek: 3 }),
	).resolves.toBeTruthy()
	// The columns stay **nullable**: an endurance row requires them null, and one
	// pair of columns carries both kinds, so requiredness is the per-kind CHECK's
	// to state and not the column's.
	const enduranceTrack = await createTrack(outline.id)
	await expect(
		prisma.trainingTrackSegment.create({
			data: {
				trackId: enduranceTrack.id,
				kind: 'endurance',
				phaseId: outline.phases[0]!.id,
			},
		}),
	).resolves.toBeTruthy()
})

test('a Strength Frequency of zero is rejected — an empty block is an absent one', async () => {
	const outline = await createOutline()
	const track = await createTrack(outline.id, 'strength', 'sets')
	// "No lifting these weeks" is expressed by the segment not existing, which is
	// why a gap between segments is a meaningful state (ADR 0047 §6).
	await expect(
		prisma.trainingTrackSegment.create({
			data: {
				trackId: track.id,
				kind: 'strength',
				startWeekKey: START_WEEK_KEY,
				weeks: 4,
				goal: 'hypertrophy',
				sessionsPerWeek: 0,
			},
		}),
	).rejects.toThrow()
})

test('an endurance segment carries no Strength Goal and no Strength Frequency', async () => {
	const outline = await createOutline()
	const track = await createTrack(outline.id)
	// The two new fields are strength-only, the way the positioning fields already
	// are: neither kind may borrow the other's (ADR 0047 §3/§4).
	await expect(
		prisma.trainingTrackSegment.create({
			data: {
				trackId: track.id,
				kind: 'endurance',
				phaseId: outline.phases[0]!.id,
				goal: 'hypertrophy',
			},
		}),
	).rejects.toThrow()
	await expect(
		prisma.trainingTrackSegment.create({
			data: {
				trackId: track.id,
				kind: 'endurance',
				phaseId: outline.phases[0]!.id,
				sessionsPerWeek: 3,
			},
		}),
	).rejects.toThrow()
})

test('two strength segments cannot open in the same week', async () => {
	const outline = await createOutline()
	const track = await createTrack(outline.id, 'strength', 'sets')
	const segment = (startWeekKey: string) =>
		prisma.trainingTrackSegment.create({
			data: {
				trackId: track.id,
				kind: 'strength',
				startWeekKey,
				weeks: 4,
				goal: 'hypertrophy',
				sessionsPerWeek: 3,
			},
		})

	await segment(START_WEEK_KEY)
	// `@@unique([trackId, startWeekKey])`. Structural rather than a service rule, so
	// two racing writes cannot both land; `addStrengthSegment` catches the violation
	// and maps it to a refusal the surface can word.
	await expect(segment(START_WEEK_KEY)).rejects.toThrow()
	// Another week is fine, and so is a *gap* before it — "no lifting these weeks"
	// is a meaningful authored state (ADR 0047 §6).
	await expect(segment('2030-03-04')).resolves.toBeTruthy()
})

test('a strength segment of zero weeks is rejected', async () => {
	const outline = await createOutline()
	const track = await createTrack(outline.id, 'strength', 'sets')
	// The other half of `"weeks" IS NOT NULL AND "weeks" >= 1`: a range constraint
	// tested at one end only is half a constraint, and the NULL end is tested below.
	// Goal and frequency are present so the duration is the only thing wrong.
	await expect(
		prisma.trainingTrackSegment.create({
			data: {
				trackId: track.id,
				kind: 'strength',
				startWeekKey: START_WEEK_KEY,
				weeks: 0,
				goal: 'hypertrophy',
				sessionsPerWeek: 3,
			},
		}),
	).rejects.toThrow()
})

test('the four cut columns are deliberately outside the per-kind CHECK', async () => {
	const outline = await createOutline()
	const track = await createTrack(outline.id, 'strength', 'sets')

	// `recoveryCut`/`taperCut` read only on an endurance segment and
	// `deloadCut`/`deloadWeeks` only on a strength one, but neither pair appears in
	// `TrainingTrackSegment_kind_position` — the migration says so out loud, and
	// this test is here so the *gap* is pinned rather than assumed shut. Tightening
	// it is a constraint of its own and would want the derivation reading them
	// first. The authoring service is what keeps the pairs apart today: no strength
	// input carries a `recoveryCut` and no endurance input carries a `deloadCut`,
	// which is why neither can be written through a form.
	await expect(
		prisma.trainingTrackSegment.create({
			data: {
				trackId: track.id,
				kind: 'strength',
				startWeekKey: START_WEEK_KEY,
				weeks: 5,
				goal: 'hypertrophy',
				sessionsPerWeek: 3,
				recoveryCut: 0.3,
				taperCut: 0.5,
			},
		}),
	).resolves.toBeTruthy()
	await expect(
		prisma.trainingTrackSegment.create({
			data: {
				trackId: track.id,
				kind: 'endurance',
				phaseId: outline.phases[0]!.id,
				deloadCut: 0.5,
				deloadWeeks: 1,
			},
		}),
	).resolves.toBeTruthy()
})

test('a strength segment carries no Quality Session Mix', async () => {
	const outline = await createOutline()
	const track = await createTrack(outline.id, 'strength', 'sets')
	const segment = await prisma.trainingTrackSegment.create({
		data: {
			trackId: track.id,
			kind: 'strength',
			startWeekKey: START_WEEK_KEY,
			weeks: 5,
			goal: 'hypertrophy',
			sessionsPerWeek: 3,
		},
		select: { id: true },
	})

	// A strength segment authors its intensity as a goal, not as a mix of zoned
	// endurance sessions (ADR 0047 §3). The mix's foreign key carries the kind it
	// requires, so this is structural rather than a service-layer rule — a CHECK
	// could not express it, since it reaches across two tables.
	await expect(
		prisma.qualitySessionMixEntry.create({
			data: { segmentId: segment.id, zone: 4, sessionsPerWeek: 2 },
		}),
	).rejects.toThrow()
})

test('a segment cannot change kind out from under its Quality Session Mix', async () => {
	const outline = await createOutline()
	const track = await createTrack(outline.id)
	const segment = await prisma.trainingTrackSegment.create({
		data: {
			trackId: track.id,
			kind: 'endurance',
			phaseId: outline.phases[0]!.id,
		},
		select: { id: true },
	})
	await prisma.qualitySessionMixEntry.create({
		data: { segmentId: segment.id, zone: 4, sessionsPerWeek: 2 },
	})

	// Rewriting the kind would leave zoned sessions hanging off a strength block,
	// which is the same lie the previous test forbids authoring directly.
	await expect(
		prisma.trainingTrackSegment.update({
			where: { id: segment.id },
			data: {
				kind: 'strength',
				phaseId: null,
				startWeekKey: START_WEEK_KEY,
				weeks: 5,
				goal: 'hypertrophy',
				sessionsPerWeek: 3,
			},
		}),
	).rejects.toThrow()
})

test('a strength segment without a duration is rejected, NULL comparison notwithstanding', async () => {
	const outline = await createOutline()
	const track = await createTrack(outline.id)
	// `"weeks" >= 1` alone evaluates to NULL when weeks is NULL, and a CHECK passes
	// on NULL — so the constraint tests IS NOT NULL first. This is the test that
	// caught that. Goal and frequency are present so the duration is what is missing.
	await expect(
		prisma.trainingTrackSegment.create({
			data: {
				trackId: track.id,
				kind: 'strength',
				startWeekKey: START_WEEK_KEY,
				goal: 'hypertrophy',
				sessionsPerWeek: 3,
			},
		}),
	).rejects.toThrow()
})

test('a Week Pattern day is a fixed session or a weighted share, never neither', async () => {
	const outline = await createOutline()
	const track = await createTrack(outline.id)
	const pattern = await prisma.weekPattern.create({
		data: { outlineId: outline.id, name: 'Standard week', orderIndex: 0 },
		select: { id: true },
	})
	const day = (extra: {
		kind: string
		weight?: number
		weekday?: number
		orderInDay?: number
	}) =>
		prisma.weekPatternDay.create({
			data: { patternId: pattern.id, trackId: track.id, weekday: 0, ...extra },
		})

	// A share day with no weight would silently absorb nothing.
	await expect(day({ kind: 'share' })).rejects.toThrow()
	// A fixed day with no Workout has nothing to stamp.
	await expect(day({ kind: 'fixed', orderInDay: 1 })).rejects.toThrow()
	// Mon–Sun, 0–6 (ADR 0019). Both ends of the CHECK are exercised: 7 is the
	// Sunday-first index of ADR 0005 leaking in, and −1 is the day before Monday
	// that a "shift the week back one" arithmetic slip produces. A range constraint
	// tested at one end only is half a constraint.
	await expect(day({ kind: 'share', weight: 1, weekday: 7 })).rejects.toThrow()
	await expect(day({ kind: 'share', weight: 1, weekday: -1 })).rejects.toThrow()
	await expect(day({ kind: 'share', weight: 2.5 })).resolves.toBeTruthy()
	// Sunday — the far end of the Training Week — is inside it.
	await expect(
		day({ kind: 'share', weight: 1.75, weekday: 6 }),
	).resolves.toBeTruthy()
})

test('a week carries at most one anchor and at most one override per track', async () => {
	const outline = await createOutline()
	const track = await createTrack(outline.id)

	await prisma.seasonAnchorSegment.create({
		data: { trackId: track.id, fromWeekKey: START_WEEK_KEY, value: 55 },
	})
	await expect(
		prisma.seasonAnchorSegment.create({
			data: { trackId: track.id, fromWeekKey: START_WEEK_KEY, value: 60 },
		}),
	).rejects.toThrow()

	await prisma.weekVolumeOverride.create({
		data: { trackId: track.id, weekKey: '2030-01-21', value: 45 },
	})
	await expect(
		prisma.weekVolumeOverride.create({
			data: { trackId: track.id, weekKey: '2030-01-21', value: 40 },
		}),
	).rejects.toThrow()
})

test('the backfill lays one endurance segment per phase on a segmentless track', async () => {
	// #401's Outlines carry tracks and anchors but no segments, because nothing could
	// author a progression yet. `20260731100000_backfill_endurance_segments` adds the
	// row those rates hang off — so this exercises the same statement the migration
	// ran, which is the only way to catch a later table rebuild dropping it.
	const outline = await prisma.planOutline.create({
		select: { id: true },
		data: {
			eventId: (await createOutlineEvent()).id,
			startWeekKey: START_WEEK_KEY,
			phases: {
				create: [
					{ orderIndex: 0, name: 'Base', weeks: 4 },
					{ orderIndex: 1, name: 'Build', weeks: 3 },
				],
			},
		},
	})
	const run = await createTrack(outline.id, 'run', 'km')
	const lift = await createTrack(outline.id, 'strength', 'sets')

	await backfillEnduranceSegments()

	const segments = await prisma.trainingTrackSegment.findMany({
		where: { track: { outlineId: outline.id } },
		select: { trackId: true, kind: true, ramp: true, recoveryCut: true },
	})
	// One per phase for the endurance track; none for strength, whose segments are
	// dated and float free of the phases (ADR 0047 §6).
	expect(segments.filter((s) => s.trackId === run.id)).toHaveLength(2)
	expect(segments.filter((s) => s.trackId === lift.id)).toHaveLength(0)
	// Every rate unset, so no athlete's derived weeks move: the backfill adds the row
	// and nothing else (ADR 0044 §4).
	expect(segments.every((s) => s.ramp === null && s.recoveryCut === null)).toBe(
		true,
	)

	// Idempotent — a re-run adds no duplicates.
	await backfillEnduranceSegments()
	expect(
		await prisma.trainingTrackSegment.count({
			where: { track: { outlineId: outline.id } },
		}),
	).toBe(2)
})

test('deleting the Event takes the whole Outline with it', async () => {
	const outline = await createOutline()
	const track = await createTrack(outline.id)
	await prisma.seasonAnchorSegment.create({
		data: { trackId: track.id, fromWeekKey: START_WEEK_KEY, value: 55 },
	})
	const event = await prisma.planOutline.findUniqueOrThrow({
		where: { id: outline.id },
		select: { eventId: true },
	})

	await prisma.event.delete({ where: { id: event.eventId } })

	expect(
		await prisma.planOutline.findUnique({ where: { id: outline.id } }),
	).toBeNull()
	expect(
		await prisma.seasonAnchorSegment.count({ where: { trackId: track.id } }),
	).toBe(0)
})
