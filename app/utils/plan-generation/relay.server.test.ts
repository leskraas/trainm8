import { expect, test } from 'vitest'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { localDate, weekdayIndex, weekMonday } from '../athlete-calendar.ts'
import { prisma } from '../db.server.ts'
import { layPlanWeek } from '../load/horizon-fill.server.ts'
import { storedPlaceWeeksRequest } from '../plan-outline/generation-request.ts'
import { relayPlanFrom } from '../plan-outline/open-ended.server.ts'
import { outlinePreviewSelect } from '../plan-outline/outline-preview.ts'
import { readPlanWeekSource } from '../plan-outline/week-source.server.ts'
import { placedSessions } from './deterministic.ts'
import {
	approveSeason,
	previewSeason,
	readGenerationCorpus,
	type GenerationAnswers,
} from './generate.server.ts'
import { DETERMINISTIC_SEASON_GENERATOR } from './generator.ts'

// A generated plan keeps its sessions when its weeks are laid again (#686,
// ADR 0113). Against the database: approval, the stored record, and
// `relayPlanFrom` routed to the generator.

const NOW = new Date('2026-01-07T09:00:00Z')
// The week of NOW is begun; re-lays start from the next one, as callers do.
const FIRST_UNBEGUN = '2026-01-12'

// Mon, Wed, Fri, Sat as availability states them (Sunday-first, as stored),
// which the plan's Monday-first days read as 0, 2, 4, 5.
async function createAthlete(trainableWeekdays: number[] = [1, 3, 5, 6]) {
	const userData = createUser()
	return prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
			athleteProfile: {
				create: {
					timezone: 'UTC',
					trainableWeekdays: JSON.stringify(trainableWeekdays),
				},
			},
		},
	})
}

async function seedStock(key: string, archetype: string) {
	const workout = await prisma.workout.create({
		select: { id: true },
		data: {
			id: `stock_${key}`,
			title: `${archetype} ${key}`,
			description: 'From the table.',
			discipline: 'run',
			intent: 'endurance',
			archetype,
			authorship: 'system',
			blocks: {
				create: [
					{
						orderIndex: 0,
						repeatCount: 1,
						steps: {
							create: [
								{
									orderIndex: 0,
									kind: 'cardio',
									discipline: 'run',
									durationSec: 3600,
									intensity: JSON.stringify({
										kind: 'zoneLabel',
										label: 'easy',
									}),
								},
							],
						},
					},
				],
			},
		},
	})
	await prisma.catalogueEntry.create({
		data: {
			id: `stockentry_${key}`,
			workoutId: workout.id,
			workoutAuthorship: 'system',
			archetype,
			citationAuthor: 'Daniels',
			citationWork: "Daniels' Running Formula",
			citationYear: 2013,
		},
	})
}

async function seedCorpus({ withRaceWeek = true } = {}) {
	await seedStock('easy1', 'easy')
	await seedStock('easy2', 'easy')
	await seedStock('long1', 'long')
	await seedStock('tempo1', 'tempo')
	await seedStock('thr1', 'threshold')
	await seedStock('vo2a', 'vo2max-short')
	if (withRaceWeek) await seedStock('race1', 'race-simulation')
}

const answers: GenerationAnswers = {
	presetKey: 'masters-2-1-short',
	startWeekKey: '2026-01-05',
	intent: 'deliberately-building',
	anchors: { run: 40 },
}

async function approve(trainableWeekdays?: number[]) {
	const athlete = await createAthlete(trainableWeekdays)
	const event = await prisma.event.create({
		select: { id: true },
		data: {
			athleteId: athlete.id,
			name: 'Spring 10k',
			kind: 'race',
			priority: 'A',
			startDate: new Date('2026-04-04T09:00:00Z'),
			disciplines: JSON.stringify(['run']),
			target: JSON.stringify({ kind: 'distance', meters: 10000 }),
		},
	})
	const approved = await approveSeason(athlete.id, event.id, answers, {
		now: NOW,
	})
	if (!approved.ok) throw new Error(approved.reason)
	return {
		athleteId: athlete.id,
		eventId: event.id,
		outlineId: approved.outlineId,
	}
}

async function planSessions(athleteId: string) {
	const rows = await prisma.workoutSession.findMany({
		where: { userId: athleteId },
		select: {
			id: true,
			scheduledAt: true,
			status: true,
			source: true,
			adoptedAt: true,
			workout: { select: { copiedFromId: true, discipline: true } },
		},
		orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
	})
	return rows.map((row) => ({
		...row,
		weekKey: weekMonday(row.scheduledAt, 'UTC'),
		weekday: weekdayIndex(localDate(row.scheduledAt, 'UTC')),
		stock: row.workout?.copiedFromId ?? null,
	}))
}

function relay(
	athleteId: string,
	outlineId: string,
	options: { onlyWeekKeys?: string[] } = {},
) {
	return relayPlanFrom(athleteId, outlineId, FIRST_UNBEGUN, 'UTC', NOW, options)
}

test('approving records the generator, shape, intent and days with the sessions (AC 1)', async () => {
	await seedCorpus()
	const { outlineId } = await approve()
	const record = await prisma.generationRecord.findUniqueOrThrow({
		where: { outlineId },
		select: {
			generatorId: true,
			presetKey: true,
			intent: true,
			days: {
				select: { discipline: true, weekday: true, role: true },
				orderBy: { weekday: 'asc' },
			},
		},
	})
	expect(record).toEqual({
		generatorId: 'deterministic-v1',
		presetKey: 'masters-2-1-short',
		intent: 'deliberately-building',
		days: [
			{ discipline: 'run', weekday: 0, role: 'ordinary' },
			{ discipline: 'run', weekday: 2, role: 'ordinary' },
			{ discipline: 'run', weekday: 4, role: 'ordinary' },
			{ discipline: 'run', weekday: 5, role: 'long' },
		],
	})
	expect(await readPlanWeekSource(outlineId)).toEqual({
		kind: 'generated',
		recordId: expect.any(String),
	})
})

test('placing an unedited stored plan places exactly what approval placed (AC 10)', async () => {
	await seedCorpus()
	const { athleteId, eventId, outlineId } = await approve()
	const preview = await previewSeason(athleteId, eventId, answers, { now: NOW })
	if (!preview.ok) throw new Error(preview.reason)
	const season = preview.preview.season

	const outline = await prisma.planOutline.findUniqueOrThrow({
		where: { id: outlineId },
		select: {
			...outlinePreviewSelect,
			event: { select: { target: true } },
			generationRecord: {
				select: {
					intent: true,
					days: { select: { discipline: true, weekday: true, role: true } },
				},
			},
		},
	})
	const placed = DETERMINISTIC_SEASON_GENERATOR.placeWeeks(
		storedPlaceWeeksRequest(
			outline,
			outline.generationRecord!,
			outline.event!.target,
			season.weeks.map((week) => week.weekIndex),
		),
		await readGenerationCorpus(),
	)
	expect(placedSessions(placed)).toEqual(season.sessions)
})

test('a target-only edit leaves every placed session as it was (AC 2)', async () => {
	await seedCorpus()
	const { athleteId, outlineId } = await approve()
	const before = await planSessions(athleteId)
	expect(before.length).toBeGreaterThan(0)

	// A Week Volume Override on a later week, then the re-lay every Sesong edit
	// ends in.
	const track = await prisma.trainingTrack.findFirstOrThrow({
		where: { outlineId },
		select: { id: true },
	})
	await prisma.weekVolumeOverride.create({
		data: { trackId: track.id, weekKey: '2026-02-02', value: 55 },
	})
	await relay(athleteId, outlineId, { onlyWeekKeys: ['2026-02-02'] })
	await relay(athleteId, outlineId)

	expect(await planSessions(athleteId)).toEqual(before)
})

test('a phase edit places the changed weeks as the generator would, and leaves earlier weeks alone (AC 3)', async () => {
	await seedCorpus()
	const { athleteId, outlineId } = await approve()
	const before = await planSessions(athleteId)
	const phases = await prisma.planOutlinePhase.findMany({
		where: { outlineId },
		orderBy: { orderIndex: 'asc' },
		select: { id: true, weeks: true },
	})
	// One week longer last-but-one phase: every later week moves.
	const changed = phases.at(-2)!
	await prisma.planOutlinePhase.update({
		where: { id: changed.id },
		data: { weeks: changed.weeks + 1 },
	})
	await relay(athleteId, outlineId)

	const after = await planSessions(athleteId)
	const firstChangedWeek = new Date(
		Date.parse('2026-01-05') +
			phases
				.slice(0, -2)
				.reduce((sum, phase) => sum + phase.weeks + 0, changed.weeks) *
				7 *
				86_400_000,
	)
		.toISOString()
		.slice(0, 10)
	// Weeks before the change keep the same rows.
	const earlier = (rows: typeof before) =>
		rows.filter((row) => row.weekKey < firstChangedWeek)
	expect(earlier(after)).toEqual(earlier(before))

	// The plan now holds one more week, and its last week is race week.
	const weeks = [...new Set(after.map((row) => row.weekKey))]
	expect(weeks).toHaveLength(new Set(before.map((r) => r.weekKey)).size + 1)
	const lastWeek = after.filter((row) => row.weekKey === weeks.at(-1))
	expect(lastWeek.map((row) => row.stock)).toEqual(
		lastWeek.map(() => 'stock_race1'),
	)
	// Every week holds the recorded days, one session each.
	for (const weekKey of weeks) {
		expect(
			after.filter((row) => row.weekKey === weekKey).map((r) => r.weekday),
		).toEqual([0, 2, 4, 5])
	}
})

test('a re-lay places on the days stored at approval, whatever the availability says now (AC 4)', async () => {
	await seedCorpus()
	const { athleteId, outlineId } = await approve()
	await prisma.athleteProfile.update({
		where: { userId: athleteId },
		data: { trainableWeekdays: JSON.stringify([0, 2, 4]) },
	})
	const phase = await prisma.planOutlinePhase.findFirstOrThrow({
		where: { outlineId, orderIndex: 0 },
		select: { id: true, weeks: true },
	})
	await prisma.planOutlinePhase.update({
		where: { id: phase.id },
		data: { weeks: phase.weeks + 1 },
	})
	await relay(athleteId, outlineId)
	const days = new Set(
		(await planSessions(athleteId)).map((row) => row.weekday),
	)
	expect([...days].sort()).toEqual([0, 2, 4, 5])
})

test("the athlete's sessions and trained ones stay, and a kept plan session fills its slot (AC 5, AC 6)", async () => {
	await seedCorpus()
	const { athleteId, outlineId } = await approve()
	const before = await planSessions(athleteId)
	const week = before.filter((row) => row.weekKey === '2026-02-16')
	// Adopted, trained, and an authored session the athlete wrote.
	await prisma.workoutSession.update({
		where: { id: week[0]!.id },
		data: { adoptedAt: NOW },
	})
	await prisma.workoutSession.update({
		where: { id: week[1]!.id },
		data: { status: 'completed' },
	})
	const authoredWorkout = await prisma.workout.create({
		select: { id: true },
		data: {
			title: 'Own run',
			discipline: 'run',
			intent: 'endurance',
			ownerId: athleteId,
		},
	})
	const authored = await prisma.workoutSession.create({
		select: { id: true },
		data: {
			userId: athleteId,
			workoutId: authoredWorkout.id,
			scheduledAt: week[2]!.scheduledAt,
			status: 'scheduled',
			source: 'authored',
			planOutlineId: outlineId,
		},
	})
	// Shift every week so each one's slots change.
	const phase = await prisma.planOutlinePhase.findFirstOrThrow({
		where: { outlineId, orderIndex: 0 },
		select: { id: true, weeks: true },
	})
	await prisma.planOutlinePhase.update({
		where: { id: phase.id },
		data: { weeks: phase.weeks + 1 },
	})
	await relay(athleteId, outlineId)

	const after = await planSessions(athleteId)
	const ids = after.map((row) => row.id)
	expect(ids).toContain(week[0]!.id)
	expect(ids).toContain(week[1]!.id)
	expect(ids).toContain(authored.id)
	const inWeek = after.filter((row) => row.weekKey === '2026-02-16')
	// The adopted and trained sessions fill their days: no second plan session
	// beside them. The authored one fills nothing, so its day is still laid.
	for (const kept of [week[0]!, week[1]!]) {
		expect(inWeek.filter((row) => row.weekday === kept.weekday)).toHaveLength(1)
	}
	expect(
		inWeek.filter(
			(row) => row.weekday === week[2]!.weekday && row.source === 'generated',
		),
	).toHaveLength(1)
})

test('a slot the corpus has nothing for stays empty, and no week is emptied (AC 7)', async () => {
	await seedCorpus({ withRaceWeek: false })
	const { athleteId, outlineId } = await approve()
	const before = await planSessions(athleteId)
	await relay(athleteId, outlineId)
	const after = await planSessions(athleteId)
	expect(after).toEqual(before)
	const weeks = new Set(after.map((row) => row.weekKey))
	expect(weeks.size).toBeGreaterThan(5)
})

test('a Week Pattern with days takes over from the generator (AC 8)', async () => {
	await seedCorpus()
	const { outlineId } = await approve()
	const track = await prisma.trainingTrack.findFirstOrThrow({
		where: { outlineId },
		select: { id: true },
	})
	const pattern = await prisma.weekPattern.create({
		select: { id: true },
		data: { outlineId, orderIndex: 0, name: 'Min uke' },
	})
	expect(await readPlanWeekSource(outlineId)).toMatchObject({
		kind: 'generated',
	})
	await prisma.weekPatternDay.create({
		data: {
			patternId: pattern.id,
			trackId: track.id,
			weekday: 2,
			orderInDay: 0,
			kind: 'share',
			weight: 1,
		},
	})
	expect(await readPlanWeekSource(outlineId)).toEqual({
		kind: 'pattern',
		patternId: pattern.id,
	})
})

test('a plan generated before the record is laid again, its days frozen from its sessions (AC 9)', async () => {
	await seedCorpus()
	const { athleteId, outlineId } = await approve()
	// As the data migration leaves it: no preset, no intent, no days.
	const record = await prisma.generationRecord.update({
		where: { outlineId },
		data: { presetKey: null, intent: null, days: { deleteMany: {} } },
		select: { id: true },
	})
	const before = await planSessions(athleteId)
	await relay(athleteId, outlineId)

	expect(await planSessions(athleteId)).toEqual(before)
	const days = await prisma.generationRecordDay.findMany({
		where: { recordId: record.id },
		select: { discipline: true, weekday: true, role: true },
		orderBy: { weekday: 'asc' },
	})
	expect(days).toEqual([
		{ discipline: 'run', weekday: 0, role: 'ordinary' },
		{ discipline: 'run', weekday: 2, role: 'ordinary' },
		{ discipline: 'run', weekday: 4, role: 'ordinary' },
		{ discipline: 'run', weekday: 5, role: 'long' },
	])
})

test("the horizon fill lays a generated plan's unlaid week by its generator, as approval laid it", async () => {
	await seedCorpus()
	const { athleteId } = await approve()
	const before = await planSessions(athleteId)
	const weekKey = '2026-01-19'
	const inWeek = (rows: typeof before) =>
		rows
			.filter((row) => row.weekKey === weekKey)
			.map((row) => ({ weekday: row.weekday, stock: row.stock }))
	const approved = inWeek(before)
	expect(approved.length).toBeGreaterThan(0)
	// The week as if never laid: the plan's sessions there gone.
	await prisma.workoutSession.deleteMany({
		where: {
			id: {
				in: before.filter((row) => row.weekKey === weekKey).map((r) => r.id),
			},
		},
	})

	const laid = await layPlanWeek(athleteId, weekKey, 'UTC', NOW)

	expect(laid).toEqual({ weekKey, sessions: approved.length, unlaid: null })
	expect(inWeek(await planSessions(athleteId))).toEqual(approved)
})

test("a shortened generated plan clears the machine's sessions past its new end", async () => {
	await seedCorpus()
	const { athleteId, outlineId } = await approve()
	const before = await planSessions(athleteId)
	const phases = await prisma.planOutlinePhase.findMany({
		where: { outlineId },
		orderBy: { orderIndex: 'asc' },
		select: { id: true, weeks: true },
	})
	const changed = phases.find((phase) => phase.weeks > 1)!
	await prisma.planOutlinePhase.update({
		where: { id: changed.id },
		data: { weeks: changed.weeks - 1 },
	})
	await relay(athleteId, outlineId)

	const after = await planSessions(athleteId)
	const weeksBefore = [...new Set(before.map((row) => row.weekKey))]
	const weeksAfter = [...new Set(after.map((row) => row.weekKey))]
	expect(weeksAfter).toEqual(weeksBefore.slice(0, -1))
	const lastWeek = after.filter((row) => row.weekKey === weeksAfter.at(-1))
	expect(lastWeek.map((row) => row.stock)).toEqual(
		lastWeek.map(() => 'stock_race1'),
	)
})
