import { expect, test, vi } from 'vitest'
import {
	localDate,
	weekBoundsFromMondayUTC,
	weekdayIndex,
} from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import { trackRetiredAt } from '#app/utils/plan-outline/from-rows.ts'
import type * as StampServer from '#app/utils/plan-outline/stamp.server.ts'
import { plannedMinutes } from '#app/utils/prescribed-duration.ts'
import { getSeasonForOutline } from '#app/utils/training.server.ts'
import { buildBlocksCreate } from '#app/utils/workout.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { consoleError } from '#tests/setup/setup-test-env.ts'
import {
	applyActivitiesEdit,
	readActivitiesEdit,
} from './activities-edit.server.ts'
import {
	readPlanStartAnswers,
	readPlanStartOptions,
} from './plan-start-options.server.ts'
import { createFirstRunPlan } from './plan.server.ts'
import type * as StartStrength from './start-strength.server.ts'

/** Weeks whose stamp refuses, to drive the apply's fallback. */
const refusing = vi.hoisted(() => new Set<string>())
vi.mock('#app/utils/plan-outline/stamp.server.ts', async (importOriginal) => {
	const actual = await importOriginal<typeof StampServer>()
	return {
		...actual,
		stampWeekPattern: (...args: Parameters<typeof actual.stampWeekPattern>) =>
			args[1].weekKeys.some((weekKey) => refusing.has(weekKey))
				? Promise.resolve({ ok: false as const, reason: 'nothing-to-stamp' })
				: actual.stampWeekPattern(...args),
	}
})

/** True while no lifting session can be copied, as when the stock one is gone. */
const noLiftingSession = vi.hoisted(() => ({ on: false }))
vi.mock(
	'#app/utils/first-run/start-strength.server.ts',
	async (importOriginal) => {
		const actual = await importOriginal<typeof StartStrength>()
		return {
			...actual,
			readStartStrength: (
				...args: Parameters<typeof actual.readStartStrength>
			) =>
				noLiftingSession.on
					? Promise.resolve(null)
					: actual.readStartStrength(...args),
		}
	},
)

// Editing the activities in Meg, against the database (#587, ADR 0109): a
// plan the start made, lived a week, and the edit previewed, confirmed and
// laid. What is laid in the boundary week is what the preview showed, the
// athlete's own sessions included; the lived week is not touched.

const OSLO = 'Europe/Oslo'
/** The plan is made on a Wednesday, and opens the Monday after. */
const MADE = new Date('2030-01-09T12:00:00Z')
const PLAN_START = '2030-01-14'
/** A week later, mid-week: the plan's first week is begun. */
const NOW = new Date('2030-01-16T12:00:00Z')
const BOUNDARY = '2030-01-21'

async function createAthlete() {
	const userData = createUser()
	const user = await prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
			athleteProfile: {
				create: { timezone: OSLO, defaultTrainingTime: '07:00' },
			},
		},
	})
	return user.id
}

/** A plan for run and bike with two lifts a week, as the start makes it. */
async function startPlan() {
	const userId = await createAthlete()
	const made = await createFirstRunPlan(
		userId,
		{
			level: 'recreational',
			discipline: 'run',
			otherSports: ['bike'],
			hours: 6,
			days: [0, 1, 3, 5, 6],
			family: 'polarized',
			strength: 2,
		},
		MADE,
	)
	if (!made.ok) throw new Error(made.reason)
	return { userId, outlineId: made.outlineId }
}

async function sessionsIn(userId: string, weekKey: string) {
	const { start, end } = weekBoundsFromMondayUTC(weekKey, OSLO)
	return prisma.workoutSession.findMany({
		where: { userId, scheduledAt: { gte: start, lte: end } },
		orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
		select: {
			id: true,
			scheduledAt: true,
			source: true,
			adoptedAt: true,
			workout: {
				select: {
					title: true,
					discipline: true,
					blocks: {
						select: {
							repeatCount: true,
							seriesRepeatCount: true,
							betweenSeriesRestSec: true,
							sendOff: true,
							steps: {
								select: {
									kind: true,
									discipline: true,
									intensity: true,
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
}

/** A week's sessions as the athlete reads them: day, title, minutes. */
async function weekOnCalendar(userId: string, weekKey: string) {
	return (await sessionsIn(userId, weekKey))
		.map((session) => {
			const workout = session.workout!
			return [
				weekdayIndex(localDate(session.scheduledAt, OSLO)),
				workout.title,
				workout.discipline === 'strength'
					? null
					: (plannedMinutes(workout.blocks, { thresholds: {} })?.minutes ??
						null),
			]
		})
		.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
}

/** The preview's week as the same rows. */
function weekShown(
	preview: Extract<
		Awaited<ReturnType<typeof readActivitiesEdit>>,
		{ ok: true }
	>['preview'],
) {
	return preview.week.days
		.flatMap((day) => [
			...day.sessions.map((session) => [
				day.weekday,
				session.title,
				session.minutes,
			]),
			...day.lifting.map((lift) => [day.weekday, lift.title, null]),
		])
		.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
}

/** The athlete's own hard session, on a day of the boundary week. */
async function authoredHardSession(userId: string, dayKey: string) {
	const workout = await prisma.workout.create({
		select: { id: true },
		data: {
			title: 'Intervaller med klubben',
			discipline: 'run',
			intent: 'threshold',
			ownerId: userId,
			blocks: {
				create: buildBlocksCreate([
					{
						repeatCount: 1,
						steps: [{ kind: 'cardio', discipline: 'run', durationSec: 3600 }],
					},
				]),
			},
		},
	})
	return prisma.workoutSession.create({
		select: { id: true },
		data: {
			userId,
			workoutId: workout.id,
			scheduledAt: new Date(`${dayKey}T06:00:00Z`),
			status: 'scheduled',
			source: 'authored',
		},
	})
}

const SWIM_AND_YOGA = {
	sports: ['run' as const, 'swim' as const],
	activities: ['yoga-mobility' as const],
	strength: 2 as const,
}

test('made = shown: the boundary week laid is the week previewed, around an adopted lift and an authored hard session', async () => {
	const { userId, outlineId } = await startPlan()
	// The athlete adopted one of the plan's lifts in the boundary week, and
	// wrote a hard session of their own on its Tuesday.
	const lift = (await sessionsIn(userId, BOUNDARY)).find(
		(session) => session.workout?.discipline === 'strength',
	)!
	await prisma.workoutSession.update({
		where: { id: lift.id },
		data: { adoptedAt: NOW },
	})
	const own = await authoredHardSession(userId, '2030-01-22')
	const lived = await sessionsIn(userId, PLAN_START)

	const preview = await readActivitiesEdit(userId, SWIM_AND_YOGA, NOW)
	if (!preview.ok) throw new Error(preview.reason)
	expect(preview.preview.splice.boundaryWeekKey).toBe(BOUNDARY)
	expect(preview.boundaryThisWeek).toBe(false)
	// Both of the athlete's sessions are in the week shown, marked theirs.
	const kept = preview.preview.week.days.flatMap((day) => [
		...day.sessions.filter((session) => session.kept),
		...day.lifting.filter((one) => one.kept),
	])
	expect(kept).toHaveLength(2)
	// The preview writes nothing.
	expect(await sessionsIn(userId, BOUNDARY)).toHaveLength(
		(await sessionsIn(userId, BOUNDARY)).length,
	)

	const applied = await applyActivitiesEdit(userId, SWIM_AND_YOGA, NOW, {
		digest: preview.preview.digest,
	})
	if (!applied.ok) throw new Error(applied.reason)
	expect(applied.preview.digest).toBe(preview.preview.digest)

	expect(await weekOnCalendar(userId, BOUNDARY)).toEqual(
		weekShown(preview.preview),
	)
	const after = await sessionsIn(userId, BOUNDARY)
	// The athlete's sessions are where they were; one lift only is laid
	// beside the adopted one, which fills the other slot.
	expect(after.map((session) => session.id)).toEqual(
		expect.arrayContaining([own.id, lift.id]),
	)
	expect(
		after.filter((session) => session.workout?.discipline === 'strength'),
	).toHaveLength(2)
	// The lived week is as it was.
	expect(await sessionsIn(userId, PLAN_START)).toEqual(lived)
	// The plan follows its family still, and Bike is retired, never deleted.
	const tracks = await prisma.trainingTrack.findMany({
		where: { outlineId },
		select: {
			discipline: true,
			pinnedDays: true,
			anchors: { select: { fromWeekKey: true, value: true } },
		},
	})
	const bike = tracks.find((track) => track.discipline === 'bike')!
	expect(trackRetiredAt(bike, BOUNDARY)).toBe(true)
	expect(tracks.map((track) => track.discipline).sort()).toEqual([
		'bike',
		'other',
		'run',
		'strength',
		'swim',
	])
	expect(
		(
			await prisma.planOutline.findUniqueOrThrow({
				where: { id: outlineId },
				select: { family: true },
			})
		).family,
	).toBe('polarized')
})

test('lived weeks keep their targets and totals; from the boundary the plan lays the new activities', async () => {
	const { userId, outlineId } = await startPlan()
	const before = (await getSeasonForOutline(userId, outlineId, NOW))!
	const applied = await applyActivitiesEdit(userId, SWIM_AND_YOGA, NOW)
	if (!applied.ok) throw new Error(applied.reason)
	const after = (await getSeasonForOutline(userId, outlineId, NOW))!
	const lived = before.weeks.filter((week) => week.weekKey < BOUNDARY)
	expect(lived.length).toBeGreaterThan(0)
	for (const week of lived) {
		const now = after.weeks.find((one) => one.weekKey === week.weekKey)!
		for (const target of week.targets) {
			expect(
				now.targets.find((one) => one.discipline === target.discipline)?.value,
			).toBe(target.value)
		}
	}
	// From the boundary, bike lays nothing and swim lays its hours.
	const boundary = after.weeks.find((week) => week.weekKey === BOUNDARY)!
	const value = (discipline: string) =>
		boundary.targets.find((target) => target.discipline === discipline)?.value
	expect(value('bike')).toBe(0)
	expect(value('swim')).toBeGreaterThan(0)
	const laid = await sessionsIn(userId, BOUNDARY)
	expect(laid.some((session) => session.workout?.discipline === 'bike')).toBe(
		false,
	)
	expect(laid.some((session) => session.workout?.discipline === 'swim')).toBe(
		true,
	)
})

test('a confirm whose boundary week changed since the preview writes nothing, and says the preview is stale', async () => {
	const { userId, outlineId } = await startPlan()
	const own = await authoredHardSession(userId, '2030-01-22')
	const preview = await readActivitiesEdit(userId, SWIM_AND_YOGA, NOW)
	if (!preview.ok) throw new Error(preview.reason)
	// The athlete moves their session to Thursday before confirming.
	await prisma.workoutSession.update({
		where: { id: own.id },
		data: { scheduledAt: new Date('2030-01-24T06:00:00Z') },
	})
	const phases = await prisma.planOutlinePhase.findMany({
		where: { outlineId },
		select: { id: true, weeks: true },
	})
	const week = await sessionsIn(userId, BOUNDARY)

	expect(
		await applyActivitiesEdit(userId, SWIM_AND_YOGA, NOW, {
			digest: preview.preview.digest,
		}),
	).toEqual({ ok: false, reason: 'preview-stale' })
	expect(
		await prisma.planOutlinePhase.findMany({
			where: { outlineId },
			select: { id: true, weeks: true },
		}),
	).toEqual(phases)
	expect(await sessionsIn(userId, BOUNDARY)).toEqual(week)
})

test('a removed sport is never laid again by Bytt treningsform, and removing strength clears the frequency', async () => {
	const { userId, outlineId } = await startPlan()
	const applied = await applyActivitiesEdit(
		userId,
		{ sports: ['run'], activities: [], strength: null },
		NOW,
	)
	if (!applied.ok) throw new Error(applied.reason)
	const season = (await getSeasonForOutline(userId, outlineId, NOW))!
	const options = await readPlanStartOptions(userId, season, BOUNDARY, NOW)
	expect(options?.answers.otherSports).toEqual([])
	expect(
		options?.start.options.every((option) =>
			option.draft.tracks.every((track) => track.discipline === 'run'),
		),
	).toBe(true)
	// Meg reads the plan as run only, with no strength.
	const reading = await readPlanStartAnswers(userId, season, BOUNDARY, NOW)
	if (!reading.ok) throw new Error(reading.reason)
	expect(reading.answers.discipline).toBe('run')
	expect(reading.answers.otherSports).toEqual([])
	expect(reading.lifting?.perWeek ?? null).toBeNull()
	const profile = await prisma.athleteProfile.findUniqueOrThrow({
		where: { userId },
		select: { strengthPerWeek: true },
	})
	expect(profile.strengthPerWeek).toBeNull()
	// No lift is laid from the boundary on.
	expect(
		(await sessionsIn(userId, BOUNDARY)).some(
			(session) => session.workout?.discipline === 'strength',
		),
	).toBe(false)

	// Taken up again a week later, bike reuses its track and is laid again.
	const later = new Date('2030-01-23T12:00:00Z')
	const again = await applyActivitiesEdit(
		userId,
		{ sports: ['run', 'bike'], activities: [], strength: null },
		later,
	)
	if (!again.ok) throw new Error(again.reason)
	expect(
		again.preview.splice.tracks.find((change) => change.discipline === 'bike'),
	).toMatchObject({ kind: 'keep' })
	expect(
		(await sessionsIn(userId, '2030-01-28')).some(
			(session) => session.workout?.discipline === 'bike',
		),
	).toBe(true)
})

test('the same activities, or none, write nothing; a plan toward an Event is not edited here', async () => {
	const { userId, outlineId } = await startPlan()
	expect(
		await readActivitiesEdit(
			userId,
			{ sports: ['run', 'bike'], activities: [], strength: 2 },
			NOW,
		),
	).toEqual({ ok: false, reason: 'same' })
	expect(
		await applyActivitiesEdit(
			userId,
			{ sports: [], activities: [], strength: null },
			NOW,
		),
	).toEqual({ ok: false, reason: 'no-activity' })
	const event = await prisma.event.create({
		select: { id: true },
		data: {
			athleteId: userId,
			name: 'Birken',
			startDate: new Date('2030-03-16T08:00:00Z'),
			kind: 'race',
			priority: 'A',
			disciplines: JSON.stringify(['bike']),
		},
	})
	await prisma.planOutline.update({
		where: { id: outlineId },
		data: { eventId: event.id },
	})
	expect(await readActivitiesEdit(userId, SWIM_AND_YOGA, NOW)).toEqual({
		ok: false,
		reason: 'not-editable',
	})
})

test("when the boundary week will not stamp, the old activities' sessions are cleared from it and the refusal is logged", async () => {
	const { userId } = await startPlan()
	const own = await authoredHardSession(userId, '2030-01-22')
	expect(
		(await sessionsIn(userId, BOUNDARY)).some(
			(session) => session.workout?.discipline === 'bike',
		),
	).toBe(true)
	consoleError.mockImplementation(() => {})
	refusing.add(BOUNDARY)
	try {
		const applied = await applyActivitiesEdit(userId, SWIM_AND_YOGA, NOW)
		if (!applied.ok) throw new Error(applied.reason)
	} finally {
		refusing.clear()
	}
	const after = await sessionsIn(userId, BOUNDARY)
	// No session the old activities laid is left: the removed sport is gone.
	expect(after.some((session) => session.workout?.discipline === 'bike')).toBe(
		false,
	)
	// The athlete's own session stays.
	expect(after.map((session) => session.id)).toContain(own.id)
	expect(consoleError).toHaveBeenCalledWith(
		expect.stringContaining('[activities]'),
		'nothing-to-stamp',
	)
})

test('the preview counts only the own sessions that stay: a skipped one is not counted', async () => {
	const { userId } = await startPlan()
	await authoredHardSession(userId, '2030-01-22')
	const skipped = await authoredHardSession(userId, '2030-01-24')
	await prisma.workoutSession.update({
		where: { id: skipped.id },
		data: { status: 'skipped' },
	})
	const preview = await readActivitiesEdit(userId, SWIM_AND_YOGA, NOW)
	if (!preview.ok) throw new Error(preview.reason)
	expect(preview.preview.keptFromBoundary).toEqual({ count: 1, onRemoved: 0 })
})

test('an edit that could not offer strength leaves the Strength Frequency as it was', async () => {
	const { userId } = await startPlan()
	await prisma.athleteProfile.update({
		where: { userId },
		data: { strengthPerWeek: 2 },
	})
	noLiftingSession.on = true
	try {
		const applied = await applyActivitiesEdit(
			userId,
			{ sports: ['run', 'swim'], activities: [], strength: null },
			NOW,
		)
		if (!applied.ok) throw new Error(applied.reason)
	} finally {
		noLiftingSession.on = false
	}
	const profile = await prisma.athleteProfile.findUniqueOrThrow({
		where: { userId },
		select: { strengthPerWeek: true },
	})
	expect(profile.strengthPerWeek).toBe(2)
})
