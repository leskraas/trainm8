import { expect, test } from 'vitest'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { CONVENTION_NOTICE } from '../catalogue-corpus.ts'
import { resolveCatalogueOrigin } from '../catalogue.server.ts'
import { readCitation } from '../catalogue.ts'
import { prisma } from '../db.server.ts'
import { getWeekVolumes } from '../plan-outline/week-volumes.server.ts'
import { getLedgerWeek, getSeasonForEvent } from '../training.server.ts'
import { workoutCopySelect } from '../workout.server.ts'
import {
	approveSeason,
	defaultPresetFor,
	goalEventFor,
	previewSeason,
	readGenerationCorpus,
	type GenerationAnswers,
} from './generate.server.ts'
import {
	DETERMINISTIC_SEASON_GENERATOR,
	type SeasonGenerator,
} from './generator.ts'
import { type GeneratedSeason, type SeasonRequest } from './season.ts'

async function createAthlete() {
	const userData = createUser()
	return prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
			athleteProfile: { create: { timezone: 'UTC' } },
		},
	})
}

/** A **Stock Workout** plus its **Catalogue Entry**, as the seed writes them. */
async function seedStock({
	key,
	archetype,
	cited = true,
	discipline = 'run',
	authorship = 'system',
	ownerId = null,
	distanceM = null,
}: {
	key: string
	archetype: string
	cited?: boolean
	discipline?: string
	authorship?: string
	ownerId?: string | null
	/** A step of distance instead of the hour: a session with a km figure. */
	distanceM?: number | null
}) {
	const workout = await prisma.workout.create({
		select: { id: true },
		data: {
			id: `stock_${key}`,
			title: `${archetype} ${key}`,
			description: cited ? 'From the table.' : `${CONVENTION_NOTICE} As above.`,
			discipline,
			intent: 'endurance',
			// Authored on the Workout since ADR 0055; the entry's column below is
			// pinned to it by a three-column foreign key.
			archetype,
			authorship,
			ownerId,
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
									discipline,
									durationSec: distanceM == null ? 3600 : null,
									distanceM,
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
			workoutAuthorship: authorship,
			archetype,
			...(cited
				? {
						citationAuthor: 'Daniels',
						citationWork: "Daniels' Running Formula",
						citationYear: 2013,
					}
				: {}),
		},
	})
	return workout
}

/** Enough of a corpus that every slot of a short season can be filled. */
async function seedCorpus() {
	await seedStock({ key: 'easy1', archetype: 'easy' })
	await seedStock({ key: 'long1', archetype: 'long' })
	await seedStock({ key: 'tempo1', archetype: 'tempo', cited: false })
	await seedStock({ key: 'thr1', archetype: 'threshold' })
	await seedStock({ key: 'vo2a', archetype: 'vo2max-short' })
	await seedStock({ key: 'race1', archetype: 'race-simulation', cited: false })
}

async function createEvent(athleteId: string, startDate: Date) {
	return prisma.event.create({
		select: { id: true },
		data: {
			athleteId,
			name: 'Spring 10k',
			kind: 'race',
			priority: 'A',
			startDate,
			disciplines: JSON.stringify(['run', 'strength']),
			target: JSON.stringify({ kind: 'distance', meters: 10000 }),
		},
	})
}

const NOW = new Date('2026-01-07T09:00:00Z')

function choice(overrides: Partial<GenerationAnswers> = {}): GenerationAnswers {
	return {
		presetKey: 'masters-2-1-short',
		startWeekKey: '2026-01-05',
		intent: 'deliberately-building',
		anchors: { run: 40 },
		...overrides,
	}
}

test('a preview writes nothing at all', async () => {
	const athlete = await createAthlete()
	await seedCorpus()
	const event = await createEvent(athlete.id, new Date('2026-04-04T09:00:00Z'))

	const result = await previewSeason(athlete.id, event.id, choice(), {
		now: NOW,
	})
	expect(result.ok).toBe(true)
	if (!result.ok) return
	expect(result.preview.season.sessions.length).toBeGreaterThan(0)

	// Nothing reaches the calendar unapproved (ADR 0016, carried forward).
	expect(await prisma.workoutSession.count()).toBe(0)
	expect(await prisma.planOutline.count()).toBe(0)
})

test('a preview declines the strength track by name and lays the endurance one', async () => {
	const athlete = await createAthlete()
	await seedCorpus()
	const event = await createEvent(athlete.id, new Date('2026-04-04T09:00:00Z'))

	const result = await previewSeason(athlete.id, event.id, choice(), {
		now: NOW,
	})
	expect(result.ok && result.preview.season.unavailable).toEqual([
		{ reading: 'strength-track', discipline: 'strength' },
	])
})

test('approving writes the Plan Outline and the sessions under it', async () => {
	const athlete = await createAthlete()
	await seedCorpus()
	const event = await createEvent(athlete.id, new Date('2026-04-04T09:00:00Z'))

	const preview = await previewSeason(athlete.id, event.id, choice(), {
		now: NOW,
	})
	const approved = await approveSeason(athlete.id, event.id, choice(), {
		now: NOW,
	})
	expect(approved.ok).toBe(true)
	if (!approved.ok || !preview.ok) return

	// The approval regenerates rather than trusting a posted payload, and because
	// the generator is deterministic it lands exactly the season that was shown.
	expect(approved.sessions).toBe(preview.preview.season.sessions.length)

	const outline = await prisma.planOutline.findUniqueOrThrow({
		where: { eventId: event.id },
		select: {
			startWeekKey: true,
			phases: { select: { name: true }, orderBy: { orderIndex: 'asc' } },
			tracks: {
				select: {
					discipline: true,
					currency: true,
					anchors: { select: { value: true } },
					segments: { select: { kind: true } },
				},
			},
		},
	})
	expect(outline.startWeekKey).toBe('2026-01-05')
	expect(outline.phases.map((phase) => phase.name)).toEqual([
		'Base',
		'Build',
		'Peak',
		'Taper',
	])
	expect(outline.tracks).toHaveLength(1)
	expect(outline.tracks[0]!.discipline).toBe('run')
	expect(outline.tracks[0]!.anchors[0]!.value).toBe(40)
	// No strength segment was written, because no preset supplies one.
	expect(
		outline.tracks[0]!.segments.every(
			(segment) => segment.kind === 'endurance',
		),
	).toBe(true)
})

test('a placed session is generated, anchored, and owns a fresh copy of the corpus row', async () => {
	const athlete = await createAthlete()
	await seedCorpus()
	const event = await createEvent(athlete.id, new Date('2026-04-04T09:00:00Z'))
	await approveSeason(athlete.id, event.id, choice(), { now: NOW })

	const sessions = await prisma.workoutSession.findMany({
		where: { userId: athlete.id },
		select: {
			source: true,
			adoptedAt: true,
			targetEventId: true,
			workoutId: true,
			workout: { select: { ownerId: true, copiedFromId: true } },
		},
	})
	expect(sessions.length).toBeGreaterThan(0)
	for (const session of sessions) {
		expect(session.source).toBe('generated')
		expect(session.adoptedAt).toBeNull()
		expect(session.targetEventId).toBe(event.id)
		expect(session.workout?.ownerId).toBe(athlete.id)
		expect(session.workout?.copiedFromId).toMatch(/^stock_/)
	}
	// A fresh Workout per session: editing one week can never edit another.
	const workoutIds = new Set(sessions.map((session) => session.workoutId))
	expect(workoutIds.size).toBe(sessions.length)
})

test('a placed session reaches its Citation through the chain, never a copy of it', async () => {
	const athlete = await createAthlete()
	await seedCorpus()
	const event = await createEvent(athlete.id, new Date('2026-04-04T09:00:00Z'))
	await approveSeason(athlete.id, event.id, choice(), { now: NOW })

	const session = await prisma.workoutSession.findFirstOrThrow({
		where: { userId: athlete.id, workout: { copiedFromId: 'stock_easy1' } },
		select: { workoutId: true },
	})
	const origin = await resolveCatalogueOrigin(session.workoutId!)
	expect(origin?.id).toBe('stockentry_easy1')
	expect(readCitation(origin!)).toEqual({
		author: 'Daniels',
		work: "Daniels' Running Formula",
		year: 2013,
		locator: null,
	})

	// Correcting the corpus row corrects the plan, because nothing was copied.
	await prisma.catalogueEntry.update({
		where: { id: 'stockentry_easy1' },
		data: { citationYear: 2014 },
	})
	const again = await resolveCatalogueOrigin(session.workoutId!)
	expect(readCitation(again!)?.year).toBe(2014)
})

test('a Training Track with no Season Anchor previews but cannot be approved', async () => {
	const athlete = await createAthlete()
	await seedCorpus()
	const event = await createEvent(athlete.id, new Date('2026-04-04T09:00:00Z'))
	const unanchored = choice({ anchors: { run: null } })

	const preview = await previewSeason(athlete.id, event.id, unanchored, {
		now: NOW,
	})
	expect(preview.ok).toBe(true)
	if (preview.ok) {
		expect(
			preview.preview.season.weeks.every(
				(week) => week.targets[0]!.value == null,
			),
		).toBe(true)
	}

	const approved = await approveSeason(athlete.id, event.id, unanchored, {
		now: NOW,
	})
	expect(approved).toEqual({ ok: false, reason: 'anchor-missing' })
	expect(await prisma.planOutline.count()).toBe(0)
})

test('another athlete cannot generate against this Event', async () => {
	const athlete = await createAthlete()
	const other = await createAthlete()
	await seedCorpus()
	const event = await createEvent(athlete.id, new Date('2026-04-04T09:00:00Z'))

	expect(
		await previewSeason(other.id, event.id, choice(), { now: NOW }),
	).toEqual({ ok: false, reason: 'event-not-found' })
})

test('an Event already carrying a plan is refused rather than doubled', async () => {
	const athlete = await createAthlete()
	await seedCorpus()
	const event = await createEvent(athlete.id, new Date('2026-04-04T09:00:00Z'))
	await approveSeason(athlete.id, event.id, choice(), { now: NOW })

	const again = await approveSeason(athlete.id, event.id, choice(), {
		now: NOW,
	})
	expect(again).toEqual({ ok: false, reason: 'event-already-planned' })
})

test('the corpus read serves stock rows only, and no retired one', async () => {
	const athlete = await createAthlete()
	await seedCorpus()
	await seedStock({
		key: 'shared1',
		archetype: 'easy',
		cited: false,
		authorship: 'athlete',
		ownerId: athlete.id,
	})
	await prisma.catalogueEntry.update({
		where: { id: 'stockentry_tempo1' },
		data: { retiredAt: new Date('2026-01-01T00:00:00Z') },
	})

	const corpus = await readGenerationCorpus()
	expect(corpus.every((entry) => entry.authorship === 'system')).toBe(true)
	expect(corpus.map((entry) => entry.entryId)).not.toContain(
		'stockentry_tempo1',
	)
	expect(corpus.map((entry) => entry.entryId)).toContain('stockentry_easy1')
	// Each row carries its Stock Workout's blocks as stored, so the generator
	// can time a placed session without querying (ADR 0116).
	expect(
		corpus.find((entry) => entry.entryId === 'stockentry_easy1')?.blocks,
	).toEqual([
		{
			repeatCount: 1,
			seriesRepeatCount: 1,
			betweenSeriesRestSec: null,
			sendOff: null,
			steps: [
				{
					kind: 'cardio',
					discipline: 'run',
					intensity: JSON.stringify({ kind: 'zoneLabel', label: 'easy' }),
					durationSec: 3600,
					distanceM: null,
				},
			],
		},
	])
})

test('a goal event is read off an exact race distance and nothing else', () => {
	expect(
		goalEventFor(JSON.stringify({ kind: 'distance', meters: 10000 })),
	).toBe('10k')
	expect(
		goalEventFor(JSON.stringify({ kind: 'distance', meters: 4800 })),
	).toBeNull()
	expect(goalEventFor(JSON.stringify({ kind: 'finish' }))).toBeNull()
	expect(goalEventFor(null)).toBeNull()
})

test('the default shape is the one landing nearest the Event, and is never a label', () => {
	// 13 weeks of run-in: the 13-week masters short shape lands on it exactly.
	expect(
		defaultPresetFor('2026-01-05', '2026-04-06', [
			'classic-linear',
			'masters-2-1-short',
			'big-base-long',
		]),
	).toBe('masters-2-1-short')
})

test('approving under a Weekly Capacity writes the lowered season, and the plan’s own hours check stays quiet (#473)', async () => {
	const athlete = await createAthlete()
	await seedCorpus()
	const profile = await prisma.athleteProfile.update({
		where: { userId: athlete.id },
		data: { weeklyCapacityHours: 3 },
		select: { id: true },
	})
	await prisma.disciplineProfile.create({
		data: {
			athleteProfileId: profile.id,
			discipline: 'run',
			thresholdPaceSecPerKm: 300,
		},
	})
	const event = await createEvent(athlete.id, new Date('2026-04-04T09:00:00Z'))

	const preview = await previewSeason(athlete.id, event.id, choice(), {
		now: NOW,
	})
	if (!preview.ok) throw new Error(preview.reason)
	const { capacity, tracks } = preview.preview.season
	expect(capacity.kind).toBe('lowered')
	expect(tracks[0]!.anchorValue).toBeLessThan(40)

	const approved = await approveSeason(athlete.id, event.id, choice(), {
		now: NOW,
	})
	if (!approved.ok) throw new Error(approved.reason)

	const season = await getSeasonForEvent(athlete.id, event.id, NOW)
	expect(season?.weeklyCapacityHours).toBe(3)
	expect(season?.hoursWarnings).toEqual([])
})

// The generate preview's Planned Volume (#472, ADR 0119): read outside the seam,
// off the Stock Workouts approval copies, over the week as approval leaves it.

/** A corpus whose easy and long rows carry a km figure and the rest do not. */
async function seedMeasurableCorpus() {
	await seedStock({ key: 'easy1', archetype: 'easy', distanceM: 8000 })
	await seedStock({ key: 'long1', archetype: 'long', distanceM: 16000 })
	await seedStock({ key: 'tempo1', archetype: 'tempo', cited: false })
	await seedStock({ key: 'thr1', archetype: 'threshold' })
	await seedStock({ key: 'vo2a', archetype: 'vo2max-short' })
	await seedStock({ key: 'race1', archetype: 'race-simulation', cited: false })
}

/** A run the athlete wrote themselves, `km` long, at noon UTC on `day`. */
async function addOwnRun(athleteId: string, day: string, km: number) {
	const workout = await prisma.workout.create({
		select: { id: true },
		data: {
			ownerId: athleteId,
			title: 'Egen tur',
			discipline: 'run',
			intent: 'endurance',
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
									distanceM: km * 1000,
								},
							],
						},
					},
				],
			},
		},
	})
	await prisma.workoutSession.create({
		data: {
			userId: athleteId,
			workoutId: workout.id,
			scheduledAt: new Date(`${day}T12:00:00Z`),
			status: 'scheduled',
		},
	})
}

test('a preview week’s Planned Volume is the one Sesong reads for that week once the season is approved unchanged', async () => {
	const athlete = await createAthlete()
	await seedMeasurableCorpus()
	const event = await createEvent(athlete.id, new Date('2026-04-04T09:00:00Z'))
	// A session the athlete already had, in the season's third week: approval
	// deletes none, so the preview counts it as Sesong will.
	await addOwnRun(athlete.id, '2026-01-24', 12)

	const preview = await previewSeason(athlete.id, event.id, choice(), {
		now: NOW,
	})
	if (!preview.ok) throw new Error(preview.reason)
	// Reading writes nothing.
	expect(await prisma.workoutSession.count()).toBe(1)
	const { season, weekVolumes } = preview.preview
	expect(weekVolumes.map((week) => week.weekKey)).toEqual(
		season.weeks.map((week) => week.weekKey),
	)
	const third = weekVolumes.find((week) => week.weekKey === '2026-01-19')!
	expect(third.existingSessions).toBe(1)

	const approved = await approveSeason(athlete.id, event.id, choice(), {
		now: NOW,
	})
	if (!approved.ok) throw new Error(approved.reason)

	let measured = 0
	let unmeasured = 0
	for (const week of weekVolumes) {
		const sesong = await getWeekVolumes(athlete.id, {
			weekKey: week.weekKey,
			now: NOW,
		})
		const rows = await getLedgerWeek(athlete.id, week.weekKey, 'UTC')
		expect(week.hasSessions).toBe(rows.length > 0)
		const read = (volumes: typeof sesong) =>
			volumes.tracks.map((track) => ({
				discipline: track.discipline,
				target: track.target,
				planned: track.planned,
				plannedUnmeasuredCount: track.plannedUnmeasuredCount,
				driftMark: track.driftMark,
			}))
		expect({ week: week.weekKey, tracks: read(week.volumes) }).toEqual({
			week: week.weekKey,
			tracks: read(sesong),
		})
		for (const track of week.volumes.tracks) {
			if ((track.planned ?? 0) > 0) measured++
			unmeasured += track.plannedUnmeasuredCount
		}
	}
	// The comparison is not vacuous: weeks with a km sum, and sessions counted apart.
	expect(measured).toBeGreaterThan(0)
	expect(unmeasured).toBeGreaterThan(0)
	// The athlete's own 12 km is in its week's figure.
	const placedOnly = season.sessions.filter(
		(session) => session.weekKey === '2026-01-19',
	)
	expect(third.volumes.tracks[0]!.planned).toBeGreaterThanOrEqual(12)
	expect(placedOnly.length + third.existingSessions).toBe(
		(await getLedgerWeek(athlete.id, '2026-01-19', 'UTC')).length,
	)
})

test('a placed session is not rescaled: its copy carries its Stock Workout’s blocks and steps field by field', async () => {
	const athlete = await createAthlete()
	await seedMeasurableCorpus()
	const event = await createEvent(athlete.id, new Date('2026-04-04T09:00:00Z'))
	await approveSeason(athlete.id, event.id, choice(), { now: NOW })

	const copies = await prisma.workout.findMany({
		where: { ownerId: athlete.id, copiedFromId: { not: null } },
		select: { ...workoutCopySelect, copiedFromId: true },
	})
	expect(copies.length).toBeGreaterThan(0)
	for (const copy of copies) {
		const stock = await prisma.workout.findUniqueOrThrow({
			where: { id: copy.copiedFromId! },
			select: workoutCopySelect,
		})
		expect(copy.blocks).toEqual(stock.blocks)
		expect(copy.title).toBe(stock.title)
		expect(copy.intent).toBe(stock.intent)
	}
})

/** The shipped generator, with every request and season it saw. */
function recordingGenerator() {
	const seen: Array<{ request: SeasonRequest; season: GeneratedSeason }> = []
	const generator: SeasonGenerator = {
		id: DETERMINISTIC_SEASON_GENERATOR.id,
		generate(request, corpus) {
			const season = DETERMINISTIC_SEASON_GENERATOR.generate(request, corpus)
			seen.push({ request, season })
			return season
		},
	}
	return { generator, seen }
}

test('the preview states the weeks whose placed sessions outrun the Weekly Capacity, and approval reads them again on the server (#473)', async () => {
	const athlete = await createAthlete()
	await seedCorpus()
	const profile = await prisma.athleteProfile.update({
		where: { userId: athlete.id },
		// Every seeded session is an hour, and a week holds several: over 1 t.
		data: { weeklyCapacityHours: 1 },
		select: { id: true },
	})
	await prisma.disciplineProfile.create({
		data: {
			athleteProfileId: profile.id,
			discipline: 'run',
			thresholdPaceSecPerKm: 300,
		},
	})
	const event = await createEvent(athlete.id, new Date('2026-04-04T09:00:00Z'))

	const preview = await previewSeason(athlete.id, event.id, choice(), {
		now: NOW,
	})
	if (!preview.ok) throw new Error(preview.reason)
	const { placed, sessions } = preview.preview.season
	expect(placed.kind).toBe('read')
	if (placed.kind !== 'read') return
	expect(placed.breaches.length).toBeGreaterThan(0)
	// An hour-long session read as the session row reads it: whole, no ≈.
	expect(sessions[0]!.prescribed).toEqual({
		seconds: 3600,
		complete: true,
		estimated: false,
	})

	// The threshold moves between the preview and the approval. Approval reads
	// the athlete again and regenerates; nothing the preview showed is posted.
	await prisma.disciplineProfile.updateMany({
		where: { athleteProfileId: profile.id, discipline: 'run' },
		data: { thresholdPaceSecPerKm: 280 },
	})
	const { generator, seen } = recordingGenerator()
	const approved = await approveSeason(athlete.id, event.id, choice(), {
		now: NOW,
		generator,
	})
	if (!approved.ok) throw new Error(approved.reason)
	expect(seen).toHaveLength(1)
	expect(seen[0]!.request.thresholds.run?.thresholdPaceSecPerKm).toBe(280)
	expect(seen[0]!.season.placed).toEqual(placed)
	// What was written is the placed sessions, unchanged by the reading.
	expect(approved.sessions).toBe(sessions.length)
})

test('a placed session whose id is not a Stock Workout is neither read into the preview nor copied on approval', async () => {
	const athlete = await createAthlete()
	const other = await createAthlete()
	await seedMeasurableCorpus()
	// Another athlete's own 50 km run: no Stock Workout, and not the athlete's.
	const theirs = await prisma.workout.create({
		select: { id: true },
		data: {
			ownerId: other.id,
			title: 'Privat langtur',
			discipline: 'run',
			intent: 'endurance',
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
									distanceM: 50_000,
								},
							],
						},
					},
				],
			},
		},
	})
	// A generator behind the seam (ADR 0053) that names a wrong id: the reader
	// trusts no id it is handed to be a Stock Workout.
	const generator: SeasonGenerator = {
		id: DETERMINISTIC_SEASON_GENERATOR.id,
		generate(request, corpus) {
			const season = DETERMINISTIC_SEASON_GENERATOR.generate(request, corpus)
			return {
				...season,
				sessions: season.sessions.map((session) => ({
					...session,
					workoutId: theirs.id,
				})),
			}
		},
	}
	const event = await createEvent(athlete.id, new Date('2026-04-04T09:00:00Z'))

	const preview = await previewSeason(athlete.id, event.id, choice(), {
		now: NOW,
		generator,
	})
	if (!preview.ok) throw new Error(preview.reason)
	expect(preview.preview.season.sessions.length).toBeGreaterThan(0)
	for (const week of preview.preview.weekVolumes) {
		expect(week.hasSessions).toBe(false)
	}

	await approveSeason(athlete.id, event.id, choice(), { now: NOW, generator })
	expect(
		await prisma.workout.count({ where: { copiedFromId: theirs.id } }),
	).toBe(0)
})
