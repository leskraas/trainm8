import { expect, test } from 'vitest'
import { weekdayIndex } from '#app/utils/athlete-calendar.ts'
import { updateAthleteProfile } from '#app/utils/athlete.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { proposeWeekChange } from '#app/utils/load/propose-week-change.ts'
import { applyWeekReplanForUser } from '#app/utils/load/week-replan.server.ts'
import { createSimpleActivityWorkout } from '#app/utils/simple-activity.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import {
	addWeekPattern,
	addWeekPatternDay,
	createPlanOutline,
	createStarterWeekPattern,
	setQualitySessionMix,
} from './authoring.server.ts'
import { dropUnavailablePinnedDays } from './pinned-days.server.ts'
import { stampWeekPattern } from './stamp.server.ts'
import {
	previewTrackDays,
	readTrackDays,
	setTrackDays,
} from './track-days.server.ts'

// The athlete chooses the days of an endurance track or a Simple Activity in
// _Plan → Avansert_ (#598, ADR 0104 §4). Weekdays are the Week Pattern's:
// 0 is Monday, 6 Sunday.

const NOW = new Date('2030-01-09T12:00:00Z') // a Wednesday
const WEEKS = ['2030-01-14', '2030-01-21']
const MON = 0
const TUE = 1
const WED = 2
const THU = 3
const FRI = 4
const SAT = 5
const SUN = 6

/**
 * A race plan: the run Monday, Tuesday, Thursday, Friday and its long Sunday
 * with one threshold session a week; the bike Monday, Thursday and Saturday;
 * and a hard _Langrenn_ on Wednesday — both weeks already on the calendar.
 */
async function setup({
	trainableWeekdays = [0, 1, 2, 3, 4, 5, 6],
}: { trainableWeekdays?: number[] } = {}) {
	const userData = createUser()
	const user = await prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
			athleteProfile: {
				create: {
					timezone: 'Europe/Oslo',
					defaultTrainingTime: '07:00',
					trainableWeekdays: JSON.stringify(trainableWeekdays),
				},
			},
		},
	})
	const event = await prisma.event.create({
		select: { id: true },
		data: {
			athleteId: user.id,
			name: 'Vårhalvmaraton',
			kind: 'race',
			priority: 'A',
			startDate: new Date('2030-04-07T09:00:00Z'),
			disciplines: JSON.stringify(['run']),
		},
	})
	const created = await createPlanOutline(
		user.id,
		{
			eventId: event.id,
			startWeekKey: '2030-01-07',
			structure: { phases: [{ name: 'Base', weeks: 6, rhythm: 'none' }] },
			tracks: [
				{ discipline: 'run', currency: 'km', anchorValue: 50 },
				{ discipline: 'bike', currency: 'km', anchorValue: 60 },
				{ discipline: 'other', currency: 'hours', anchorValue: 1.5 },
			],
		},
		NOW,
	)
	if (!created.ok) throw new Error(created.reason)
	const outlineId = created.outlineId
	const tracks = await prisma.trainingTrack.findMany({
		where: { outlineId },
		select: { id: true, discipline: true },
	})
	const trackOf = (discipline: string) =>
		tracks.find((t) => t.discipline === discipline)!.id
	const added = await addWeekPattern(user.id, { outlineId, name: 'Uke' })
	if (!added.ok) throw new Error(added.reason)
	const pattern = await prisma.weekPattern.findFirstOrThrow({
		where: { outlineId },
		select: { id: true },
	})
	const share = async (
		discipline: string,
		weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6,
		weight = 1,
	) => {
		const day = await addWeekPatternDay(user.id, {
			patternId: pattern.id,
			kind: 'share',
			trackId: trackOf(discipline),
			weekday,
			weight,
		})
		if (!day.ok) throw new Error(day.reason)
	}
	for (const weekday of [MON, TUE, THU, FRI] as const) {
		await share('run', weekday)
	}
	await share('run', SUN, 2)
	for (const weekday of [MON, THU, SAT] as const) await share('bike', weekday)
	const ski = await createSimpleActivityWorkout(prisma, user.id, {
		kind: 'cross-country-ski',
		effortWord: 'hard',
		durationMin: 90,
	})
	const skiDay = await addWeekPatternDay(user.id, {
		patternId: pattern.id,
		kind: 'fixed',
		trackId: trackOf('other'),
		weekday: WED,
		workoutId: ski.id,
	})
	if (!skiDay.ok) throw new Error(skiDay.reason)

	const segment = await prisma.trainingTrackSegment.findFirstOrThrow({
		where: { trackId: trackOf('run'), kind: 'endurance' },
		select: { id: true },
	})
	const mixed = await setQualitySessionMix(user.id, {
		segmentId: segment.id,
		entries: [{ zone: 4, sessionsPerWeek: 1 }],
	})
	if (!mixed.ok) throw new Error(mixed.reason)
	const stamped = await stampWeekPattern(
		user.id,
		{ patternId: pattern.id, weekKeys: WEEKS, replace: false },
		NOW,
	)
	if (!stamped.ok) throw new Error(stamped.reason)
	return {
		userId: user.id,
		outlineId,
		bikeTrackId: trackOf('bike'),
		skiWorkoutId: ski.id,
	}
}

/** Each plan week as the calendar has it: which days hold what. */
async function calendar(userId: string) {
	const sessions = await prisma.workoutSession.findMany({
		where: { userId, status: 'scheduled' },
		orderBy: { scheduledAt: 'asc' },
		select: {
			scheduledAt: true,
			workout: {
				select: {
					discipline: true,
					title: true,
					blocks: { select: { steps: { select: { distanceM: true } } } },
				},
			},
		},
	})
	return WEEKS.map((monday) => {
		const inWeek = sessions.filter((s) => {
			const date = s.scheduledAt.toISOString().slice(0, 10)
			return date >= monday && date < nextMonday(monday)
		})
		const day = (s: (typeof inWeek)[number]) =>
			weekdayIndex(s.scheduledAt.toISOString().slice(0, 10))
		const bike = inWeek.filter((s) => s.workout?.discipline === 'bike')
		return {
			ski: inWeek.filter((s) => s.workout?.discipline === 'other').map(day),
			bike: bike.map(day),
			bikeKm: Math.round(
				bike.reduce(
					(sum, s) =>
						sum +
						(s.workout?.blocks ?? [])
							.flatMap((block) => block.steps)
							.reduce((km, step) => km + (step.distanceM ?? 0) / 1000, 0),
					0,
				),
			),
			hardRun: inWeek
				.filter(
					(s) =>
						s.workout?.discipline === 'run' &&
						s.workout.title.startsWith('Terskel'),
				)
				.map(day),
		}
	})
}

function nextMonday(monday: string) {
	const date = new Date(`${monday}T00:00:00Z`)
	date.setUTCDate(date.getUTCDate() + 7)
	return date.toISOString().slice(0, 10)
}

async function unit(
	userId: string,
	outlineId: string,
	match: { discipline?: string; kind?: 'track' | 'activity' },
) {
	const state = await readTrackDays(userId, outlineId)
	const found = state?.units.find(
		(each) =>
			(match.discipline == null || each.discipline === match.discipline) &&
			(match.kind == null || each.kind === match.kind),
	)
	if (!found) throw new Error('no unit')
	return found
}

test('every endurance track and Simple Activity can have its days chosen, La appen velge by default', async () => {
	const { userId, outlineId } = await setup()
	const state = await readTrackDays(userId, outlineId)
	expect(
		state?.units.map(({ kind, discipline, title, pinned, days }) => ({
			kind,
			discipline,
			title,
			pinned,
			days,
		})),
	).toEqual([
		{
			kind: 'track',
			discipline: 'run',
			title: null,
			pinned: null,
			days: [MON, TUE, THU, FRI, SUN],
		},
		{
			kind: 'track',
			discipline: 'bike',
			title: null,
			pinned: null,
			days: [MON, THU, SAT],
		},
		{
			kind: 'activity',
			discipline: 'other',
			title: 'Langrenn',
			pinned: [WED],
			days: [WED],
		},
	])
})

test('a Langrenn day moved to Saturday stays on Saturday, and the run’s hard session is laid around it', async () => {
	const { userId, outlineId } = await setup()
	// Before: the ski on Wednesday, the threshold run on Friday.
	for (const week of await calendar(userId)) {
		expect(week.ski).toEqual([WED])
		expect(week.hardRun).toEqual([FRI])
	}
	const ski = await unit(userId, outlineId, { kind: 'activity' })

	// The preview shows it before anything is written.
	const preview = await previewTrackDays(
		userId,
		{ outlineId, key: ski.key, choice: [SAT] },
		NOW,
	)
	if (!preview.ok) throw new Error(preview.reason)
	for (const week of preview.weeks) {
		expect(week.before.days).toEqual([WED])
		expect(week.after.days).toEqual([SAT])
	}
	for (const week of await calendar(userId)) expect(week.ski).toEqual([WED])

	const written = await setTrackDays(
		userId,
		{ outlineId, key: ski.key, choice: [SAT], version: ski.version },
		NOW,
	)
	expect(written).toMatchObject({ ok: true, choice: [SAT] })
	for (const week of await calendar(userId)) {
		expect(week.ski).toEqual([SAT])
		// Off Friday and Sunday beside the hard ski, and off Monday after the
		// long Sunday: Tuesday.
		expect(week.hardRun).toEqual([TUE])
	}
})

test('an endurance track pinned to two days trains only on them, its week spread over them', async () => {
	const { userId, outlineId, bikeTrackId } = await setup()
	const before = await calendar(userId)
	const bike = await unit(userId, outlineId, { discipline: 'bike' })
	const written = await setTrackDays(
		userId,
		{ outlineId, key: bike.key, choice: [WED, SUN], version: bike.version },
		NOW,
	)
	expect(written).toMatchObject({ ok: true, choice: [WED, SUN] })
	const after = await calendar(userId)
	after.forEach((week, index) => {
		expect(week.bike).toEqual([WED, SUN])
		expect(week.bikeKm).toBe(before[index]!.bikeKm)
	})
	const track = await prisma.trainingTrack.findUniqueOrThrow({
		where: { id: bikeTrackId },
		select: { pinnedDays: true },
	})
	expect(track.pinnedDays).toBe('[2,6]')
	expect(await unit(userId, outlineId, { discipline: 'bike' })).toMatchObject({
		pinned: [WED, SUN],
		days: [WED, SUN],
	})
})

test('La appen velge deals the track’s days again around the others', async () => {
	const { userId, outlineId } = await setup()
	const bike = await unit(userId, outlineId, { discipline: 'bike' })
	await setTrackDays(
		userId,
		{ outlineId, key: bike.key, choice: [WED], version: bike.version },
		NOW,
	)
	const pinned = await unit(userId, outlineId, { discipline: 'bike' })
	const handed = await setTrackDays(
		userId,
		{ outlineId, key: pinned.key, choice: null, version: pinned.version },
		NOW,
	)
	expect(handed).toMatchObject({ ok: true, choice: null })
	// The run holds Mon, Tue, Thu, Fri and Sun, the ski Wednesday: Saturday is
	// the day left.
	expect(await unit(userId, outlineId, { discipline: 'bike' })).toMatchObject({
		pinned: null,
		days: [SAT],
	})
})

test('undoing from the toast puts back exactly what the change replaced', async () => {
	const { userId, outlineId } = await setup()
	const before = await calendar(userId)
	const bike = await unit(userId, outlineId, { discipline: 'bike' })
	const written = await setTrackDays(
		userId,
		{ outlineId, key: bike.key, choice: [WED, SUN], version: bike.version },
		NOW,
	)
	if (!written.ok) throw new Error(written.reason)
	const undone = await setTrackDays(
		userId,
		{
			outlineId,
			key: bike.key,
			choice: written.previous.pinned,
			version: written.version,
			restore: written.previous,
		},
		NOW,
	)
	expect(undone).toMatchObject({ ok: true, choice: null })
	expect(await unit(userId, outlineId, { discipline: 'bike' })).toMatchObject({
		pinned: null,
		days: [MON, THU, SAT],
		version: bike.version,
	})
	expect(await calendar(userId)).toEqual(before)
})

test('undoing the first days chosen for a track with none puts back none', async () => {
	const { userId, outlineId, bikeTrackId } = await setup()
	// A track the Week Pattern does not hold yet, as one just added is.
	await prisma.weekPatternDay.deleteMany({ where: { trackId: bikeTrackId } })
	const bike = await unit(userId, outlineId, { discipline: 'bike' })
	expect(bike.days).toEqual([])
	const written = await setTrackDays(
		userId,
		{ outlineId, key: bike.key, choice: [WED], version: bike.version },
		NOW,
	)
	if (!written.ok) throw new Error(written.reason)
	expect(written.previous.rows).toEqual([])
	const undone = await setTrackDays(
		userId,
		{
			outlineId,
			key: bike.key,
			choice: written.previous.pinned,
			version: written.version,
			restore: written.previous,
		},
		NOW,
	)
	expect(undone).toMatchObject({ ok: true, choice: null })
	expect(await unit(userId, outlineId, { discipline: 'bike' })).toMatchObject({
		pinned: null,
		days: [],
	})
})

test('a pinned track trains only on its days in every Week Pattern, and the undo puts each back', async () => {
	const { userId, outlineId, bikeTrackId } = await setup()
	// A second week the athlete authored in Avansert, the bike on its own days.
	const added = await addWeekPattern(userId, { outlineId, name: 'Lett uke' })
	if (!added.ok) throw new Error(added.reason)
	const second = await prisma.weekPattern.findFirstOrThrow({
		where: { outlineId, name: 'Lett uke' },
		select: { id: true },
	})
	for (const weekday of [TUE, FRI] as const) {
		const day = await addWeekPatternDay(userId, {
			patternId: second.id,
			kind: 'share',
			trackId: bikeTrackId,
			weekday,
			weight: 1,
		})
		if (!day.ok) throw new Error(day.reason)
	}
	const bikeDaysIn = async (patternId: string) =>
		(
			await prisma.weekPatternDay.findMany({
				where: { patternId, trackId: bikeTrackId },
				orderBy: { weekday: 'asc' },
				select: { weekday: true },
			})
		).map((row) => row.weekday)

	const bike = await unit(userId, outlineId, { discipline: 'bike' })
	const written = await setTrackDays(
		userId,
		{ outlineId, key: bike.key, choice: [WED, SUN], version: bike.version },
		NOW,
	)
	if (!written.ok) throw new Error(written.reason)
	expect(await bikeDaysIn(second.id)).toEqual([WED, SUN])

	const undone = await setTrackDays(
		userId,
		{
			outlineId,
			key: bike.key,
			choice: written.previous.pinned,
			version: written.version,
			restore: written.previous,
		},
		NOW,
	)
	expect(undone.ok).toBe(true)
	expect(await bikeDaysIn(second.id)).toEqual([TUE, FRI])
})

test('undoing puts back a day shaped by a Stock Workout exactly as it was', async () => {
	const { userId, outlineId, bikeTrackId } = await setup()
	// Saturday's ride is shaped by a Catalogue session no athlete owns.
	const stock = await prisma.workout.create({
		select: { id: true },
		data: {
			ownerId: null,
			authorship: 'system',
			title: 'Rolig langtur',
			discipline: 'bike',
			intent: 'endurance',
		},
	})
	await prisma.weekPatternDay.updateMany({
		where: { trackId: bikeTrackId, weekday: SAT },
		data: { workoutId: stock.id },
	})
	const bikeRows = async () =>
		(
			await prisma.weekPatternDay.findMany({
				where: { trackId: bikeTrackId },
				orderBy: { weekday: 'asc' },
				select: { kind: true, weekday: true, weight: true, workoutId: true },
			})
		).map((row) => JSON.stringify(row))
	const before = await bikeRows()

	const bike = await unit(userId, outlineId, { discipline: 'bike' })
	const written = await setTrackDays(
		userId,
		{ outlineId, key: bike.key, choice: [WED, SUN], version: bike.version },
		NOW,
	)
	if (!written.ok) throw new Error(written.reason)
	const undone = await setTrackDays(
		userId,
		{
			outlineId,
			key: bike.key,
			choice: written.previous.pinned,
			version: written.version,
			restore: written.previous,
		},
		NOW,
	)
	expect(undone.ok).toBe(true)
	expect(await bikeRows()).toEqual(before)
})

test("an undo cannot put an orphaned athlete's Workout into the week (#639 H26)", async () => {
	const { userId, outlineId } = await setup()
	// An athlete deleted their account; their Workout lost its owner but is
	// still an athlete's, not the Catalogue's.
	const orphan = await prisma.workout.create({
		select: { id: true },
		data: {
			ownerId: null,
			authorship: 'athlete',
			title: 'Noens økt',
			discipline: 'bike',
			intent: 'endurance',
		},
	})
	const bike = await unit(userId, outlineId, { discipline: 'bike' })
	const written = await setTrackDays(
		userId,
		{ outlineId, key: bike.key, choice: [WED, SUN], version: bike.version },
		NOW,
	)
	if (!written.ok) throw new Error(written.reason)
	const forged = {
		...written.previous,
		rows: written.previous.rows.map((row) => ({
			...row,
			kind: 'fixed' as const,
			workoutId: orphan.id,
		})),
	}
	const undone = await setTrackDays(
		userId,
		{
			outlineId,
			key: bike.key,
			choice: written.previous.pinned,
			version: written.version,
			restore: forged,
		},
		NOW,
	)
	expect(undone.ok).toBe(false)
	expect(
		await prisma.weekPatternDay.count({ where: { workoutId: orphan.id } }),
	).toBe(0)
})

test('a choice made against a plan that changed since is refused', async () => {
	const { userId, outlineId } = await setup()
	const bike = await unit(userId, outlineId, { discipline: 'bike' })
	await setTrackDays(
		userId,
		{ outlineId, key: bike.key, choice: [WED], version: bike.version },
		NOW,
	)
	expect(
		await setTrackDays(
			userId,
			{ outlineId, key: bike.key, choice: [SAT], version: bike.version },
			NOW,
		),
	).toEqual({ ok: false, reason: 'stale' })
})

test('a day the athlete does not train on cannot be chosen', async () => {
	// Sunday-first: Monday, Wednesday, Thursday, Saturday and Sunday.
	const { userId, outlineId } = await setup({
		trainableWeekdays: [1, 3, 4, 6, 0],
	})
	const bike = await unit(userId, outlineId, { discipline: 'bike' })
	expect(
		await setTrackDays(
			userId,
			{ outlineId, key: bike.key, choice: [TUE], version: bike.version },
			NOW,
		),
	).toEqual({ ok: false, reason: 'outside-availability' })
})

test('a Simple Activity always has a day: it cannot be handed to the app', async () => {
	const { userId, outlineId } = await setup()
	const ski = await unit(userId, outlineId, { kind: 'activity' })
	expect(
		await setTrackDays(
			userId,
			{ outlineId, key: ski.key, choice: null, version: ski.version },
			NOW,
		),
	).toEqual({ ok: false, reason: 'no-days' })
})

test('Week Replan is told a missed ride’s track’s chosen days', async () => {
	const { userId, outlineId } = await setup()
	const bike = await unit(userId, outlineId, { discipline: 'bike' })
	await setTrackDays(
		userId,
		{ outlineId, key: bike.key, choice: [WED, SUN], version: bike.version },
		NOW,
	)
	let seen: Parameters<typeof proposeWeekChange>[0] | null = null
	await applyWeekReplanForUser(
		userId,
		new Date('2030-01-21T08:00:00Z'),
		(facts) => {
			seen = facts
			return proposeWeekChange(facts)
		},
	)
	const missed = seen!.missedSessions
	const rides = missed.filter((session) => session.pinnedDays != null)
	expect(rides.length).toBeGreaterThan(0)
	for (const ride of rides) expect(ride.pinnedDays).toEqual([WED, SUN])
})

test('taking a day out of Training Availability drops it from the tracks that pinned it, and says so', async () => {
	const { userId, outlineId, bikeTrackId } = await setup()
	const bike = await unit(userId, outlineId, { discipline: 'bike' })
	await setTrackDays(
		userId,
		{ outlineId, key: bike.key, choice: [WED, SUN], version: bike.version },
		NOW,
	)
	const ski = await unit(userId, outlineId, { kind: 'activity' })
	await setTrackDays(
		userId,
		{ outlineId, key: ski.key, choice: [SAT], version: ski.version },
		NOW,
	)
	// No more Sundays or Saturdays (Sunday-first: Monday to Friday).
	await updateAthleteProfile(userId, { trainableWeekdays: [1, 2, 3, 4, 5] })
	const dropped = await dropUnavailablePinnedDays(userId, NOW)
	expect(dropped).toEqual([
		{
			key: expect.stringMatching(/^track:/),
			discipline: 'bike',
			activity: false,
			title: null,
			lost: [SUN],
			kept: [WED],
		},
		// A Simple Activity left with no day stays put, and is said.
		{
			key: expect.stringMatching(/^activity:/),
			discipline: 'other',
			activity: true,
			title: 'Langrenn',
			lost: [SAT],
			kept: null,
		},
	])
	const track = await prisma.trainingTrack.findUniqueOrThrow({
		where: { id: bikeTrackId },
		select: { pinnedDays: true },
	})
	expect(track.pinnedDays).toBe('[2]')
	for (const week of await calendar(userId)) expect(week.bike).toEqual([WED])
})

test('a track that loses every pinned day goes back to La appen velge', async () => {
	const { userId, outlineId, bikeTrackId } = await setup()
	const bike = await unit(userId, outlineId, { discipline: 'bike' })
	await setTrackDays(
		userId,
		{ outlineId, key: bike.key, choice: [SAT], version: bike.version },
		NOW,
	)
	// Every day but Saturday (Sunday-first 6).
	await updateAthleteProfile(userId, { trainableWeekdays: [0, 1, 2, 3, 4, 5] })
	expect(await dropUnavailablePinnedDays(userId, NOW)).toEqual([
		{
			key: expect.stringMatching(/^track:/),
			discipline: 'bike',
			activity: false,
			title: null,
			lost: [SAT],
			kept: null,
		},
	])
	const track = await prisma.trainingTrack.findUniqueOrThrow({
		where: { id: bikeTrackId },
		select: { pinnedDays: true },
	})
	expect(track.pinnedDays).toBeNull()
	const after = await unit(userId, outlineId, { discipline: 'bike' })
	expect(after.days).not.toContain(SAT)
	expect(after.days.length).toBeGreaterThan(0)
})

test('clearing every day of Training Availability drops every pinned day, not none', async () => {
	const { userId, outlineId, bikeTrackId } = await setup()
	const bike = await unit(userId, outlineId, { discipline: 'bike' })
	await setTrackDays(
		userId,
		{ outlineId, key: bike.key, choice: [WED, SUN], version: bike.version },
		NOW,
	)
	// The athlete unticks every day in _Meg_: an explicit empty list.
	await updateAthleteProfile(userId, { trainableWeekdays: [] })
	expect(await dropUnavailablePinnedDays(userId, NOW)).toEqual([
		{
			key: expect.stringMatching(/^track:/),
			discipline: 'bike',
			activity: false,
			title: null,
			lost: [WED, SUN],
			kept: null,
		},
		{
			key: expect.stringMatching(/^activity:/),
			discipline: 'other',
			activity: true,
			title: 'Langrenn',
			lost: [WED],
			kept: null,
		},
	])
	const track = await prisma.trainingTrack.findUniqueOrThrow({
		where: { id: bikeTrackId },
		select: { pinnedDays: true },
	})
	expect(track.pinnedDays).toBeNull()
})

test('Sesong’s starter week keeps a pinned track on its days and deals the others around it', async () => {
	const { userId, outlineId, bikeTrackId } = await setup()
	await prisma.trainingTrack.update({
		where: { id: bikeTrackId },
		data: { pinnedDays: JSON.stringify([WED, SAT]) },
	})
	const started = await createStarterWeekPattern(userId, { outlineId })
	if (!started.ok) throw new Error(started.reason)
	const days = started.proposal.days
	expect(
		days.filter((day) => day.trackId === bikeTrackId).map((d) => d.weekday),
	).toEqual([WED, SAT])
	const run = days.filter(
		(day) => day.trackId !== bikeTrackId && day.weight != null,
	)
	for (const day of run) {
		expect([WED, SAT]).not.toContain(day.weekday)
	}
})
