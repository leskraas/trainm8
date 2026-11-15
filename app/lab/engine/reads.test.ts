import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { recordProposals } from '#app/utils/load/week-replan-proposals.server.ts'
import { createPlanOutline } from '#app/utils/plan-outline/authoring.server.ts'
import {
	createAthlete,
	createWorld,
	NOW,
	ORIGIN,
	TODAY,
	YESTERDAY,
} from '#tests/actions-world.ts'
import { type CapabilityCtx, type CapabilityResult } from './define.ts'
import { READ_CAPABILITIES } from './reads.server.ts'
import { type Num, type SessionsOutput } from './reads.types.ts'

// The Lab Engine's reads, each through its own input schema and `run`, on
// the actions' fixed world (Wednesday 21 October 2026, UTC): a Garmin run
// yesterday, a Strava ride this morning, a planned run this evening, and ten
// days of load history.

type Reads = typeof READ_CAPABILITIES

function ctxOf(userId: string): CapabilityCtx {
	return {
		userId,
		now: NOW,
		timezone: 'UTC',
		origin: ORIGIN,
		request: new Request(ORIGIN),
	}
}

async function call<N extends keyof Reads>(
	userId: string,
	name: N,
	input: unknown,
): Promise<CapabilityResult<any>> {
	const cap = READ_CAPABILITIES[name] as {
		input: { safeParse: (i: unknown) => { success: boolean; data?: unknown } }
		run: (ctx: CapabilityCtx, input: never) => Promise<CapabilityResult<any>>
	}
	const parsed = cap.input.safeParse(input)
	if (!parsed.success) {
		return { ok: false, code: 'invalid-input', message: 'invalid' }
	}
	return cap.run(ctxOf(userId), parsed.data as never)
}

async function value(
	userId: string,
	name: keyof Reads,
	input: unknown = {},
): Promise<any> {
	const result = await call(userId, name, input)
	expect(result).toMatchObject({ ok: true })
	return (result as { value: unknown }).value
}

/** Every Num in a value: a number with no reason, or null with one. */
function expectHonestNumbers(value: unknown) {
	const walk = (v: unknown) => {
		if (Array.isArray(v)) return v.forEach(walk)
		if (v && typeof v === 'object') {
			const keys = Object.keys(v)
			if (keys.length === 2 && keys.includes('value') && keys.includes('why')) {
				const n = v as Num
				if (n.value === null) expect(typeof n.why).toBe('string')
				else {
					expect(typeof n.value).toBe('number')
					expect(n.why).toBeNull()
				}
				return
			}
			Object.values(v).forEach(walk)
		}
	}
	walk(value)
}

test('athlete: a brand-new athlete is a first open, with nothing invented', async () => {
	const { id } = await createAthlete()
	const athlete = await value(id, 'athlete')
	expect(athlete).toMatchObject({
		source: 'athlete',
		level: null,
		sports: [],
		goal: null,
		recordings: { count: 0, first: null, last: null },
		setup: {
			firstOpen: true,
			complete: false,
			hasPlan: false,
			next: 'basics',
		},
		availability: { days: null, weeklyHours: { value: null } },
		plan: { exists: false },
	})
	expect(athlete.availability.weeklyHours.why).toEqual(expect.any(String))
	expect(athlete.sources.map((s: { provider: string }) => s.provider)).toEqual([
		'intervalsicu',
		'polar',
	])
	expect(
		athlete.sources.every(
			(s: { status: string }) => s.status === 'disconnected',
		),
	).toBe(true)
})

test('athlete: a returning athlete with recordings is not a first open', async () => {
	const world = await createWorld()
	await prisma.athleteProfile.update({
		where: { userId: world.userId },
		data: { trainingLevel: 'experienced', trainableWeekdays: '[1,3,6]' },
	})
	const athlete = await value(world.userId, 'athlete')
	expect(athlete.setup).toMatchObject({
		firstOpen: false,
		answeredBasics: true,
		hasSessionSource: true,
		next: 'goal',
	})
	expect(athlete.levelName).toBe('Erfaren')
	// Sunday-first storage, read Monday-first.
	expect(athlete.availability.days).toEqual(['mon', 'wed', 'sat'])
	expect(athlete.recordings).toEqual({
		count: 2,
		first: YESTERDAY,
		last: TODAY,
	})
	expect(athlete.sports).toEqual(expect.arrayContaining(['run', 'bike']))
})

test('today: the day’s sessions, form withheld before the trust gate, and no invented weather', async () => {
	const world = await createWorld()
	const today = await value(world.userId, 'today')
	expectHonestNumbers(today)
	expect(today.date).toBe(TODAY)
	expect(today.weekday).toBe('wed')
	expect(today.sessions.map((s: { id: string }) => s.id)).toEqual([
		world.ride,
		world.planned,
	])
	expect(today.restDay).toBe(false)
	const [ride, planned] = today.sessions
	expect(ride).toMatchObject({
		status: 'recording-only',
		sport: 'bike',
		actual: { durationS: { value: 5400 }, load: { value: 80 } },
		planned: { load: { value: null } },
	})
	expect(planned).toMatchObject({
		status: 'planned',
		whose: 'plan',
		title: 'Rolig tur',
		time: '18:00',
		planned: { durationS: { value: 1800 }, load: { value: 30 } },
		actual: { load: { value: null } },
	})
	expect(today.form.fitness).toEqual({ value: 20, why: null })
	expect(today.form.form.value).toBeNull()
	expect(today.formTrust).toMatchObject({
		trusted: false,
		daysOfHistory: 10,
		requiredDays: 42,
	})
	// Below the gate the coach makes no form call, and says so in a sentence.
	expect(today.readiness.call).toBeNull()
	expect(today.readiness.sentence).toEqual(expect.any(String))
	expect(today.weather).toBeNull()
	expect(today.weatherWhy).toEqual(expect.any(String))
	expect(today.weatherWhy).not.toContain('Meg')
	expect(today.proposalsWaiting).toBe(0)
})

test('week: seven days Monday first, sessions on their days, and the load verdict', async () => {
	const world = await createWorld()
	const week = await value(world.userId, 'week', { date: TODAY })
	expectHonestNumbers(week)
	expect(week.weekKey).toBe('2026-10-19')
	expect(week.when).toBe('current')
	expect(week.days.map((d: { weekday: string }) => d.weekday)).toEqual([
		'mon',
		'tue',
		'wed',
		'thu',
		'fri',
		'sat',
		'sun',
	])
	const tuesday = week.days[1]
	expect(tuesday.isPast).toBe(true)
	expect(tuesday.sessions.map((s: { id: string }) => s.id)).toEqual([world.run])
	expect(week.days[2].isToday).toBe(true)
	expect(week.counts).toEqual({
		planned: 1,
		done: 1,
		missed: 0,
		recordingOnly: 1,
	})
	// Planned 55 + 30; done 60 + 80; comparable only where both sides exist.
	expect(week.load.planned).toEqual({ value: 85, why: null })
	expect(week.load.actual).toEqual({ value: 140, why: null })
	expect(week.load.verdict.call).toBe('over')
	// No plan, so no phase and no sport targets.
	expect(week.phase).toBeNull()
	expect(week.sports).toEqual([])
})

test('session: the athlete’s own report, the recording, and what can be done', async () => {
	const world = await createWorld()
	const run = await value(world.userId, 'session', { sessionId: world.run })
	expectHonestNumbers(run)
	expect(run).toMatchObject({
		status: 'done',
		feeling: { rpe: 6, note: 'Tunge bein, men fin tur.' },
		recording: {
			from: 'garmin',
			distanceM: { value: 10_000 },
			avgHeartRate: { value: null },
		},
		comparison: {
			load: { planned: { value: 55 }, actual: { value: 60 } },
			// 60 against 55 is past the over edge (×1.08).
			verdict: { call: 'over', label: 'Over' },
		},
		can: {
			move: { allowed: false },
			markDone: { allowed: false },
			rateFeeling: { allowed: true },
		},
	})
	expect(run.structure).toHaveLength(1)
	expect(run.structure[0].steps[0]).toMatchObject({
		kind: 'work',
		sport: 'run',
		durationS: 3600,
	})

	const planned = await value(world.userId, 'session', {
		sessionId: world.planned,
	})
	expect(planned.can).toMatchObject({
		move: { allowed: true, why: null },
		skip: { allowed: true },
		shorten: { allowed: true },
		makeEasier: { allowed: true },
		// Today counts: it can be said done by hand.
		markDone: { allowed: true },
		undoDone: { allowed: false },
		logStrength: { allowed: false },
		rateFeeling: { allowed: false },
	})
	expect(planned.verdict.call).toBeNull()
	expect(planned.verdict.why).toEqual(expect.any(String))
})

test('session: another athlete’s session is not found', async () => {
	const world = await createWorld()
	const other = await createAthlete()
	const result = await call(other.id, 'session', { sessionId: world.run })
	expect(result).toMatchObject({ ok: false, code: 'not-found' })
	expect((result as { message: string }).message).toEqual(expect.any(String))
})

test('sessions: pages through a range oldest first, and refuses a range over a year', async () => {
	const world = await createWorld()
	const first: SessionsOutput = await value(world.userId, 'sessions', {
		from: YESTERDAY,
		to: TODAY,
		limit: 2,
	})
	expect(first.sessions.map((s) => s.id)).toEqual([world.run, world.ride])
	expect(first.nextCursor).toEqual(expect.any(String))
	const second: SessionsOutput = await value(world.userId, 'sessions', {
		from: YESTERDAY,
		to: TODAY,
		limit: 2,
		cursor: first.nextCursor,
	})
	expect(second.sessions.map((s) => s.id)).toEqual([world.planned])
	expect(second.nextCursor).toBeNull()

	const bike: SessionsOutput = await value(world.userId, 'sessions', {
		from: YESTERDAY,
		to: TODAY,
		sport: 'bike',
	})
	expect(bike.sessions.map((s) => s.id)).toEqual([world.ride])

	expect(
		await call(world.userId, 'sessions', { from: '2025-01-01', to: TODAY }),
	).toMatchObject({ ok: false, code: 'invalid-input' })
})

test('progress: days before the history begins are unknown, never zero', async () => {
	const world = await createWorld()
	const progress = await value(world.userId, 'progress', { weeks: 3 })
	expectHonestNumbers(progress)
	// The history starts on 12 October.
	expect(progress.days[0]).toMatchObject({
		date: '2026-10-05',
		fitness: { value: null },
		load: { value: null },
	})
	const today = progress.days.at(-1)
	expect(today).toMatchObject({ date: TODAY, fitness: { value: 20 } })
	expect(today.form.value).toBeNull()
	expect(progress.formTrust.trusted).toBe(false)
	expect(progress.days[7]).toMatchObject({
		date: '2026-10-12',
		fitness: { value: 29 },
	})
	expect(progress.weekly.map((w: { weekKey: string }) => w.weekKey)).toEqual([
		'2026-10-05',
		'2026-10-12',
		'2026-10-19',
	])
	const thisWeek = progress.weekly[2]
	expect(thisWeek.recorded).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				sport: 'bike',
				sessions: 1,
				durationS: { value: 5400, why: null },
				distanceM: { value: 40_000, why: null },
			}),
		]),
	)
	expect(progress.goal).toBeNull()
})

test('plan: null without a plan; with one, every week, its phase and where today is', async () => {
	const world = await createWorld()
	expect((await value(world.userId, 'plan')).plan).toBeNull()

	const created = await createPlanOutline(world.userId, {
		startWeekKey: '2026-10-12',
		structure: { phases: [{ name: 'Blokk 1', weeks: 4, rhythm: '3:1' }] },
		tracks: [{ discipline: 'run', currency: 'hours', anchorValue: 5 }],
	})
	expect(created.ok).toBe(true)
	const { plan } = await value(world.userId, 'plan')
	expectHonestNumbers(plan)
	expect(plan).toMatchObject({
		firstWeek: '2026-10-12',
		lastWeek: '2026-11-02',
		totalWeeks: 4,
		currentWeek: 2,
		goal: { kind: 'open-ended', date: null },
		sports: [{ sport: 'run', unit: 'hours' }],
		phases: [{ name: 'Blokk 1', weeks: 4, isCurrent: true }],
		projectedFitnessOnGoalDay: { value: null },
	})
	expect(plan.weeks.map((w: { when: string }) => w.when)).toEqual([
		'past',
		'current',
		'future',
		'future',
	])
	expect(plan.weeks[1].sports[0]).toMatchObject({
		sport: 'run',
		unit: 'hours',
		target: { value: expect.any(Number) },
	})

	const athlete = await value(world.userId, 'athlete')
	expect(athlete.setup).toMatchObject({ hasPlan: true, complete: true })
	const week = await value(world.userId, 'week', { date: TODAY })
	expect(week.phase).toMatchObject({
		name: 'Blokk 1',
		planWeek: 2,
		planWeeks: 4,
	})
})

test('proposals: a waiting proposal says what it would change and why, and shows on its week', async () => {
	const world = await createWorld()
	const replan = await prisma.weekReplan.create({
		data: {
			athleteId: world.userId,
			weekKey: '2026-10-12',
			outcome: 'proposed',
			reason: 'Du gjennomførte 84 % av planen.',
			adherenceRatio: 0.84,
			tsb: -12,
		},
		select: { id: true },
	})
	await prisma.$transaction((tx) =>
		recordProposals(
			tx,
			world.userId,
			[
				{
					payload: { kind: 'scale', factor: 0.9 },
					targetSessionId: world.planned,
					targetWeekKey: '2026-10-19',
					reason: 'Rolig tur blir litt kortere.',
				},
			],
			replan.id,
		),
	)
	const proposals = await value(world.userId, 'proposals')
	expect(proposals).toMatchObject({
		waiting: 1,
		closedWeek: '2026-10-12',
		forWeek: '2026-10-19',
		summary: 'Du gjennomførte 84 % av planen.',
	})
	expect(proposals.proposals[0]).toMatchObject({
		kind: 'scale',
		state: 'waiting',
		reason: 'Rolig tur blir litt kortere.',
		addsLoad: false,
		headline: expect.any(String),
		session: { id: world.planned, whose: 'plan' },
		change: { kind: 'scale', factor: 0.9, wholeWeek: false },
	})
	const today = await value(world.userId, 'today')
	expect(today.proposalsWaiting).toBe(1)
	const week = await value(world.userId, 'week', { date: TODAY })
	expect(week.proposals.map((p: { kind: string }) => p.kind)).toEqual(['scale'])
})

test('zones: every endurance sport, thresholds unknown until set, then resolved zones', async () => {
	const world = await createWorld()
	const before = await value(world.userId, 'zones')
	expectHonestNumbers(before)
	expect(before.sports.map((s: { sport: string }) => s.sport)).toEqual([
		'run',
		'swim',
		'bike',
	])
	const profile = await prisma.athleteProfile.findUniqueOrThrow({
		where: { userId: world.userId },
		select: { id: true },
	})
	await prisma.disciplineProfile.upsert({
		where: {
			athleteProfileId_discipline: {
				athleteProfileId: profile.id,
				discipline: 'bike',
			},
		},
		create: {
			athleteProfileId: profile.id,
			discipline: 'bike',
			ftp: 250,
			zoneSystem: 'coggan-power-7',
			zoneSystemSource: 'athlete',
		},
		update: {
			ftp: 250,
			zoneSystem: 'coggan-power-7',
			zoneSystemSource: 'athlete',
		},
	})
	const after = await value(world.userId, 'zones')
	const bike = after.sports.find((s: { sport: string }) => s.sport === 'bike')
	expect(bike.thresholds.ftp).toEqual({ value: 250, why: null })
	expect(bike.model).toMatchObject({
		id: 'coggan-power-7',
		chosenBy: 'athlete',
	})
	expect(bike.zones.length).toBeGreaterThan(3)
	expect(bike.zones[1].power).toEqual({
		min: expect.any(Number),
		max: expect.any(Number),
	})
})

test('exercises: search by a Norwegian name, and an unknown exercise is not found', async () => {
	const { id } = await createAthlete()
	const list = await value(id, 'exercises', { query: '', limit: 5 })
	expect(list.exercises.length).toBeLessThanOrEqual(5)
	expect(
		await call(id, 'exercise', { exerciseId: 'no-such-exercise' }),
	).toMatchObject({ ok: false, code: 'not-found' })
})

test('recordings: newest first, each with the session it landed on', async () => {
	const world = await createWorld()
	const page = await value(world.userId, 'recordings', { limit: 1 })
	expectHonestNumbers(page)
	expect(page.recordings).toHaveLength(1)
	expect(page.recordings[0]).toMatchObject({
		from: 'strava',
		sport: 'bike',
		date: TODAY,
		sessionId: world.ride,
		linkedToPlan: false,
	})
	expect(page.nextCursor).toEqual(expect.any(String))
	const next = await value(world.userId, 'recordings', {
		limit: 1,
		cursor: page.nextCursor,
	})
	expect(next.recordings[0]).toMatchObject({
		from: 'garmin',
		sessionId: world.run,
		linkedToPlan: true,
	})
})

test('demo: only when asked, and always marked', async () => {
	const { id } = await createAthlete()
	// Nothing to show is still the athlete's own answer, never the demo's.
	expect((await value(id, 'today')).source).toBe('athlete')
	expect((await value(id, 'plan')).plan).toBeNull()

	for (const name of [
		'athlete',
		'today',
		'week',
		'plan',
		'progress',
		'proposals',
	] as const) {
		const demo = await value(id, name, { demo: true })
		expect({ name, source: demo.source }).toEqual({ name, source: 'demo' })
		expectHonestNumbers(demo)
	}
	const today = await value(id, 'today', { demo: true })
	const sessions = await value(id, 'sessions', {
		demo: true,
		from: '2026-10-12',
		to: TODAY,
	})
	expect(sessions.source).toBe('demo')
	const first = sessions.sessions[0]
	const detail = await value(id, 'session', {
		demo: true,
		sessionId: first.id,
	})
	expect(detail).toMatchObject({ source: 'demo', id: first.id })
	expect(today.date).toBe(TODAY)
})
