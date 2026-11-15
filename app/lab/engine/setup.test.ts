import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { findActiveOutline } from '#app/utils/training.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { type CapabilityCtx } from './define.ts'
import { SETUP_CAPABILITIES } from './setup.server.ts'
import { applyGoalUndo, readGoalUndo } from './setup/goal.server.ts'

// The setup capabilities against a real database: a brand-new athlete gets
// started one answer at a time, sees real weeks, says yes, sets a goal and
// changes things; every write is owner-scoped and refusals are words.

const NOW = new Date('2030-01-09T12:00:00Z') // a Wednesday
const START = '2030-01-14' // the first week not yet begun

type Caps = typeof SETUP_CAPABILITIES

async function createAthlete() {
	const userData = createUser()
	const user = await prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
			athleteProfile: { create: { timezone: 'Europe/Oslo' } },
		},
	})
	return user.id
}

function ctxFor(userId: string, request?: Request): CapabilityCtx {
	return {
		userId,
		now: NOW,
		timezone: 'Europe/Oslo',
		origin: 'http://localhost',
		request: request ?? new Request('http://localhost/lab/api/test'),
	}
}

async function run<N extends keyof Caps>(
	userId: string,
	name: N,
	input: unknown = {},
	request?: Request,
) {
	const cap = SETUP_CAPABILITIES[name] as unknown as {
		input: { parse: (value: unknown) => unknown }
		run: (ctx: CapabilityCtx, input: unknown) => Promise<any>
	}
	return cap.run(ctxFor(userId, request), cap.input.parse(input))
}

async function answerTheBasics(userId: string) {
	expect((await run(userId, 'set_sports', { sports: ['run'] })).ok).toBe(true)
	expect(
		(await run(userId, 'set_experience_level', { level: 'recreational' })).ok,
	).toBe(true)
	expect(
		(await run(userId, 'set_current_volume', { hoursPerWeek: 4 })).ok,
	).toBe(true)
	expect(
		(
			await run(userId, 'set_availability', {
				days: ['tue', 'thu', 'sat', 'sun'],
			})
		).ok,
	).toBe(true)
}

describe('getting started', () => {
	test('a new athlete is told what is missing, and nothing is invented', async () => {
		const userId = await createAthlete()
		const setup = await run(userId, 'get_setup')
		expect(setup.ok).toBe(true)
		expect(setup.value.missing).toEqual(['sports', 'level'])
		expect(setup.value.readyForPlans).toBe(false)
		expect(setup.value.hasPlan).toBe(false)
		expect(setup.value.answers.currentHoursPerWeek).toBeNull()
		expect(setup.value.answers.availability.days).toBeNull()
		expect(setup.value.fromHistory.hoursPerWeek.value).toBeNull()
		expect(setup.value.fromHistory.hoursPerWeek.why).toEqual(expect.any(String))
		expect(setup.value.suggested).toBeNull()

		const options = await run(userId, 'start_options')
		expect(options).toMatchObject({ ok: false, code: 'not-ready' })
	})

	test('answers are kept one at a time, in any order', async () => {
		const userId = await createAthlete()
		await run(userId, 'set_experience_level', { level: 'beginner' })
		await run(userId, 'set_strength', { perWeek: 2 })
		const sports = await run(userId, 'set_sports', {
			sports: ['run', 'bike'],
			mainSport: 'bike',
			otherActivities: ['hike'],
		})
		expect(sports.value.answers).toMatchObject({
			sports: ['bike', 'run'],
			mainSport: 'bike',
			otherActivities: ['hike'],
			level: 'beginner',
			strengthPerWeek: 2,
		})
		expect(sports.value.missing).toEqual([])
		expect(sports.value.suggested).toMatchObject({ currentHoursPerWeek: 3 })

		const blocked = await run(userId, 'set_availability', {
			blockedDays: ['mon', 'fri'],
			hoursPerWeek: 6,
		})
		expect(blocked.value.setup.answers.availability).toEqual({
			days: ['tue', 'wed', 'thu', 'sat', 'sun'],
			blockedDays: ['mon', 'fri'],
			hoursPerWeek: 6,
		})
		expect(blocked.value.planEffect).toEqual([])

		await run(userId, 'set_strength', { perWeek: 0 })
		const prefs = await run(userId, 'set_session_preferences', {
			preferences: ['short', 'long'],
		})
		expect(prefs.value.answers.strengthPerWeek).toBeNull()
		expect(prefs.value.answers.sessionPreferences).toEqual(['long', 'short'])
	})

	test('refuses answers that do not read', async () => {
		const userId = await createAthlete()
		expect(
			await run(userId, 'set_current_volume', { hoursPerWeek: 0.7 }),
		).toMatchObject({ ok: false, code: 'invalid-input' })
		expect(
			await run(userId, 'set_sports', { sports: ['run'], mainSport: 'swim' }),
		).toMatchObject({ ok: false, code: 'invalid-input' })
		expect(await run(userId, 'set_sports', { sports: [] })).toMatchObject({
			ok: false,
		})
		expect(await run(userId, 'set_availability', { days: [] })).toMatchObject({
			ok: false,
			code: 'invalid-input',
		})
		expect(
			await run(userId, 'set_timezone', { timezone: 'Mars/Olympus' }),
		).toMatchObject({ ok: false, code: 'invalid-input' })
	})

	test('start options are real first weeks on the chosen days, and the preview is the plan accepted', async () => {
		const userId = await createAthlete()
		await answerTheBasics(userId)

		const options = await run(userId, 'start_options')
		expect(options.ok).toBe(true)
		expect(options.value.startsOn).toBe(START)
		expect(options.value.assumed).toEqual([])
		expect(options.value.options.length).toBeGreaterThan(0)
		for (const option of options.value.options) {
			const days = option.firstWeek.days
			expect(days).toHaveLength(7)
			expect(days[0].date).toBe(START)
			for (const day of days) {
				if (['mon', 'wed', 'fri'].includes(day.weekday)) {
					expect(day.sessions).toEqual([])
				}
			}
			expect(option.firstWeek.totals.minutes).toBeGreaterThan(0)
		}

		const style = options.value.options.at(-1).style
		const preview = await run(userId, 'plan_preview', { style })
		expect(preview.ok).toBe(true)
		expect(preview.value.style).toBe(style)
		expect(preview.value.weeks).toHaveLength(2)
		expect(preview.value.weeks[0]).toEqual(
			options.value.options.at(-1).firstWeek,
		)
		expect(preview.value.outlook.length).toBeGreaterThan(0)
		expect(preview.value.towardGoal).toBeNull()

		const accepted = await run(userId, 'accept_plan', { style })
		expect(accepted.ok).toBe(true)
		expect(accepted.value).toMatchObject({
			style,
			startsOn: START,
			goalApplied: false,
			undo: null,
		})
		expect(accepted.value.sessionsLaid).toBeGreaterThan(0)
		const laid = await prisma.workoutSession.count({
			where: { userId, planOutlineId: accepted.value.planId },
		})
		expect(laid).toBe(accepted.value.sessionsLaid)

		const after = await run(userId, 'get_setup')
		expect(after.value.hasPlan).toBe(true)
		expect(await run(userId, 'accept_plan')).toMatchObject({
			ok: false,
			code: 'has-plan',
		})
	})

	test('a missing hours and days answer is filled from the level, and said', async () => {
		const userId = await createAthlete()
		await run(userId, 'set_sports', { sports: ['run'] })
		await run(userId, 'set_experience_level', { level: 'experienced' })
		const options = await run(userId, 'start_options')
		expect(options.value.assumed).toEqual([
			{ question: 'currentHoursPerWeek', value: 7, from: 'level' },
			{
				question: 'days',
				value: ['mon', 'tue', 'thu', 'fri', 'sun'],
				from: 'level',
			},
		])
	})

	test('an unknown style is refused', async () => {
		const userId = await createAthlete()
		await answerTheBasics(userId)
		const options = await run(userId, 'start_options')
		const shown = new Set(
			options.value.options.map((option: { style: string }) => option.style),
		)
		const missing = ['polarized', 'threshold', 'classic', 'big-base'].find(
			(style) => !shown.has(style),
		)
		if (missing) {
			expect(
				await run(userId, 'plan_preview', { style: missing }),
			).toMatchObject({
				ok: false,
				code: 'style-unavailable',
			})
		}
	})
})

describe('goal', () => {
	test('a goal set before the plan shapes the preview, and accepting runs the plan toward it', async () => {
		const userId = await createAthlete()
		await answerTheBasics(userId)
		const set = await run(userId, 'set_goal', {
			kind: 'event',
			name: 'Oslo halvmaraton',
			date: '2030-05-11',
			sport: 'run',
			distanceKm: 21.0975,
			targetTime: '1:45:00',
		})
		expect(set.ok).toBe(true)
		expect(set.value.goal).toMatchObject({
			name: 'Oslo halvmaraton',
			date: '2030-05-11',
			sports: ['run'],
			distanceKm: 21.098,
			targetTime: { seconds: 6300, text: '1:45:00' },
			status: 'planned',
			planRunsTowardIt: false,
		})
		expect(set.value.goal.daysLeft).toBe(122)
		expect(set.value.undo).toEqual(expect.any(String))

		const again = await run(userId, 'set_goal', {
			kind: 'event',
			name: 'Et til',
			date: '2030-06-01',
			sport: 'run',
		})
		expect(again).toMatchObject({ ok: false, code: 'goal-exists' })

		const preview = await run(userId, 'plan_preview')
		expect(preview.value.towardGoal).toMatchObject({
			goal: { name: 'Oslo halvmaraton', date: '2030-05-11' },
			problem: null,
		})
		expect(preview.value.towardGoal.phases.length).toBeGreaterThan(0)

		const accepted = await run(userId, 'accept_plan')
		expect(accepted.value).toMatchObject({
			goalApplied: true,
			goalProblem: null,
		})
		const active = await findActiveOutline(userId, NOW)
		expect(active?.event?.name).toBe('Oslo halvmaraton')

		const read = await run(userId, 'goal')
		expect(read.value).toMatchObject({
			openEnded: false,
			proposal: null,
			goal: { planRunsTowardIt: true },
		})

		// Removing the goal stops the plan, only when asked to; undo brings it back.
		expect(await run(userId, 'remove_goal')).toMatchObject({
			ok: false,
			code: 'goal-has-plan',
		})
		const removed = await run(userId, 'remove_goal', { stopPlan: true })
		expect(removed.value).toMatchObject({
			removed: 'cancelled',
			planStopped: true,
		})
		expect(await findActiveOutline(userId, NOW)).toBeNull()
		const undone = await run(userId, 'undo_goal_change', {
			undo: removed.value.undo,
		})
		expect(undone.ok).toBe(true)
		expect((await findActiveOutline(userId, NOW))?.event?.name).toBe(
			'Oslo halvmaraton',
		)
	})

	test('a goal on an open-ended plan is a proposal, applied only with its digest', async () => {
		const userId = await createAthlete()
		await answerTheBasics(userId)
		await run(userId, 'accept_plan')

		const set = await run(userId, 'set_goal', {
			kind: 'event',
			name: 'Birken',
			date: '2030-06-15',
			sport: 'run',
		})
		expect(set.ok).toBe(true)
		expect(set.value.goal.planRunsTowardIt).toBe(false)
		const proposal = set.value.proposal
		expect(proposal).toMatchObject({
			goalId: set.value.goal.id,
			digest: expect.any(String),
		})
		expect(proposal.phases.length).toBeGreaterThan(0)
		// Nothing applied yet.
		expect((await findActiveOutline(userId, NOW))?.event).toBeNull()

		expect(
			await run(userId, 'apply_goal_to_plan', {
				goalId: proposal.goalId,
				digest: 'not-the-digest',
			}),
		).toMatchObject({ ok: false, code: 'preview-stale' })

		const applied = await run(userId, 'apply_goal_to_plan', {
			goalId: proposal.goalId,
			digest: proposal.digest,
		})
		expect(applied.ok).toBe(true)
		expect(applied.value.goal.planRunsTowardIt).toBe(true)
		expect((await findActiveOutline(userId, NOW))?.event?.name).toBe('Birken')
	})

	test('update and undo, open-ended, and another athlete’s goal is not found', async () => {
		const userId = await createAthlete()
		const set = await run(userId, 'set_goal', {
			kind: 'event',
			name: 'Sykkelritt',
			date: '2030-08-01',
			sport: 'bike',
			distanceKm: 100,
		})
		const updated = await run(userId, 'update_goal', {
			name: 'Styrkeprøven',
			targetTime: null,
			distanceKm: 540,
		})
		expect(updated.value.goal).toMatchObject({
			name: 'Styrkeprøven',
			distanceKm: 540,
			targetTime: null,
			sports: ['bike'],
		})
		await run(userId, 'undo_goal_change', { undo: updated.value.undo })
		expect((await run(userId, 'goal')).value.goal).toMatchObject({
			name: 'Sykkelritt',
			distanceKm: 100,
		})
		expect(
			await run(userId, 'update_goal', { date: '2029-01-01' }),
		).toMatchObject({ ok: false, code: 'date-past' })

		const other = await createAthlete()
		expect(
			await run(other, 'apply_goal_to_plan', {
				goalId: set.value.goal.id,
				digest: 'x',
			}),
		).toMatchObject({ ok: false, code: 'not-found' })
		expect((await run(other, 'goal')).value.goal).toBeNull()

		const open = await run(userId, 'set_goal', { kind: 'open-ended' })
		expect(open.value).toMatchObject({ goal: null, openEnded: true })
		await run(userId, 'undo_goal_change', { undo: open.value.undo })
		expect((await run(userId, 'goal')).value.goal.name).toBe('Sykkelritt')
		expect(
			await run(userId, 'undo_goal_change', { undo: 'garbage' }),
		).toMatchObject({ ok: false, code: 'invalid-undo' })
	})

	test('a goal undo token is signed, works once and only while its goal stands', async () => {
		const userId = await createAthlete()
		await run(userId, 'set_goal', {
			kind: 'event',
			name: 'Sykkelritt',
			date: '2030-08-01',
			sport: 'bike',
			distanceKm: 100,
		})

		const forged = Buffer.from(
			JSON.stringify({
				area: 'goal',
				kind: 'recreate',
				fields: {
					name: 'x',
					date: 'not-a-date',
					sport: 'run',
					distanceKm: -1,
					targetSeconds: null,
				},
			}),
		).toString('base64url')
		expect(
			await run(userId, 'undo_goal_change', { undo: forged }),
		).toMatchObject({ ok: false, code: 'invalid-undo' })

		const updated = await run(userId, 'update_goal', { name: 'Styrkeprøven' })
		const other = await createAthlete()
		expect(
			await run(other, 'undo_goal_change', { undo: updated.value.undo }),
		).toMatchObject({ ok: false, code: 'invalid-undo' })

		await run(userId, 'update_goal', { name: 'Trondheim–Oslo' })
		expect(
			await run(userId, 'undo_goal_change', { undo: updated.value.undo }),
		).toMatchObject({ ok: false, code: 'changed' })
		expect((await run(userId, 'goal')).value.goal.name).toBe('Trondheim–Oslo')

		const removed = await run(userId, 'remove_goal')
		expect(removed.value.removed).toBe('deleted')
		expect(
			(await run(userId, 'undo_goal_change', { undo: removed.value.undo })).ok,
		).toBe(true)
		expect(
			await run(userId, 'undo_goal_change', { undo: removed.value.undo }),
		).toMatchObject({ ok: false, code: 'changed' })
		expect(await prisma.event.count({ where: { athleteId: userId } })).toBe(1)
	})

	test('undoing a set goal is refused once a plan runs toward it, and the plan stands', async () => {
		const userId = await createAthlete()
		await answerTheBasics(userId)
		const set = await run(userId, 'set_goal', {
			kind: 'event',
			name: 'Oslo halvmaraton',
			date: '2030-05-11',
			sport: 'run',
		})
		await run(userId, 'accept_plan')
		expect((await findActiveOutline(userId, NOW))?.event?.name).toBe(
			'Oslo halvmaraton',
		)

		expect(
			await run(userId, 'undo_goal_change', { undo: set.value.undo }),
		).toMatchObject({ ok: false, code: 'goal-has-plan' })
		expect((await findActiveOutline(userId, NOW))?.event?.name).toBe(
			'Oslo halvmaraton',
		)
	})

	test('a removed goal is not brought back once its day has passed', async () => {
		const userId = await createAthlete()
		await run(userId, 'set_goal', {
			kind: 'event',
			name: 'Vinterløpet',
			date: '2030-01-20',
			sport: 'run',
		})
		const removed = await run(userId, 'remove_goal')
		expect(removed.value.removed).toBe('deleted')
		const undo = readGoalUndo(userId, removed.value.undo)
		expect(undo).not.toBeNull()
		expect(
			await applyGoalUndo(
				userId,
				undo!,
				new Date('2030-02-01T12:00:00Z'),
				'Europe/Oslo',
			),
		).toMatchObject({ ok: false, code: 'date-past' })
		expect(await prisma.event.count({ where: { athleteId: userId } })).toBe(0)
	})

	test('a goal date in the past is refused', async () => {
		const userId = await createAthlete()
		expect(
			await run(userId, 'set_goal', {
				kind: 'event',
				name: 'For sent',
				date: '2030-01-09',
				sport: 'run',
			}),
		).toMatchObject({ ok: false, code: 'date-past' })
	})
})

describe('connections', () => {
	test('lists the sources honestly, and sync needs a connection', async () => {
		const userId = await createAthlete()
		const list = await run(userId, 'connections')
		const ids = list.value.sources.map((source: { id: string }) => source.id)
		expect(ids).toEqual(['intervalsicu', 'polar', 'garmin', 'suunto', 'file'])
		expect(list.value.sources[0]).toMatchObject({
			how: 'api-key',
			availability: 'available',
			state: 'not-connected',
		})
		expect(list.value.sources[1]).toMatchObject({
			availability: 'not-available',
			why: expect.any(String),
		})
		expect(await run(userId, 'sync_sources')).toMatchObject({
			ok: false,
			code: 'not-connected',
		})
		expect(
			await run(userId, 'connect_intervals_icu', { apiKey: '   ' }),
		).toMatchObject({ ok: false, code: 'empty-key' })
		const disconnected = await run(userId, 'disconnect_source', {
			source: 'intervalsicu',
		})
		expect(disconnected.value.source.state).toBe('not-connected')
	})

	test('a connected source reads as connected, then importing status counts recordings', async () => {
		const userId = await createAthlete()
		await prisma.accountConnection.create({
			data: {
				athleteId: userId,
				provider: 'intervalsicu',
				externalAthleteId: 'i1',
				accessToken: 'k',
				status: 'active',
				connectedAt: new Date(NOW.getTime() - 60_000),
			},
		})
		const list = await run(userId, 'connections')
		expect(list.value.sources[0].state).toBe('importing-history')
		const status = await run(userId, 'import_status')
		expect(status.value).toMatchObject({
			importing: true,
			recordings: { total: 0, earliest: null, latest: null },
			history: { hoursPerWeek: { value: null } },
		})
		expect(status.value.history.hoursPerWeek.why).toEqual(expect.any(String))
	})

	test('uploads a file from multipart form data', async () => {
		const userId = await createAthlete()
		const refused = await run(userId, 'upload_activity_files', {})
		expect(refused).toMatchObject({ ok: false, code: 'no-file' })

		const bytes = fs.readFileSync(
			path.join(process.cwd(), 'tests/fixtures/tcx/run-with-hr.tcx'),
		)
		const form = new FormData()
		form.append('file', new File([bytes], 'run-with-hr.tcx'))
		const request = new Request(
			'http://localhost/lab/api/upload_activity_files',
			{
				method: 'POST',
				body: form,
			},
		)
		const uploaded = await run(userId, 'upload_activity_files', {}, request)
		expect(uploaded.ok).toBe(true)
		expect(uploaded.value).toMatchObject({
			imported: 1,
			duplicates: 0,
			failed: [],
		})

		const status = await run(userId, 'import_status')
		expect(status.value.recordings).toMatchObject({
			total: 1,
			bySource: [{ source: 'upload', count: 1 }],
		})
	})
})

describe('settings', () => {
	test('thresholds: zones are null until the threshold they hang on is set', async () => {
		const userId = await createAthlete()
		const before = await run(userId, 'thresholds')
		const bike = before.value.sports.find(
			(s: { sport: string }) => s.sport === 'bike',
		)
		expect(bike.values.ftp).toBeNull()
		expect(bike.zones.length).toBeGreaterThan(0)
		for (const zone of bike.zones) {
			expect(zone.range).toBeNull()
			expect(zone.why).toEqual(expect.any(String))
		}

		const set = await run(userId, 'set_thresholds', {
			sport: 'bike',
			ftp: 250,
			lthr: 165,
		})
		expect(set.ok).toBe(true)
		expect(set.value.values).toMatchObject({ ftp: 250, lthr: 165 })
		expect(
			set.value.zones.some((z: { range: unknown }) => z.range != null),
		).toBe(true)
		expect(
			set.value.history.map((h: { what: string }) => h.what).sort(),
		).toEqual(['ftp', 'lthr'])

		expect(
			await run(userId, 'set_thresholds', { sport: 'swim', ftp: 200 }),
		).toMatchObject({ ok: false, code: 'invalid-input' })
		expect(
			await run(userId, 'set_thresholds', {
				sport: 'run',
				zoneSystem: 'coggan-power-7',
			}),
		).toMatchObject({ ok: false, code: 'invalid-input' })
		// A threshold change re-resolves planned targets in the background;
		// let it finish before the next test swaps the database.
		await new Promise((resolve) => setTimeout(resolve, 500))
	})

	test('availability changes drop the plan days that are no longer available', async () => {
		const userId = await createAthlete()
		await answerTheBasics(userId)
		await run(userId, 'accept_plan')
		const changed = await run(userId, 'set_availability', {
			days: ['tue', 'thu', 'sat'],
			hoursPerWeek: null,
		})
		expect(changed.ok).toBe(true)
		expect(changed.value.setup.answers.availability).toMatchObject({
			days: ['tue', 'thu', 'sat'],
			hoursPerWeek: null,
		})
		expect(changed.value.note).toEqual(expect.any(String))
	})

	test('name, preferences and the home place', async () => {
		const userId = await createAthlete()
		const named = await run(userId, 'set_display_name', { name: 'Kari' })
		expect(named.value.answers.displayName).toBe('Kari')
		const prefs = await run(userId, 'set_preferences', {
			adjustAutomatically: false,
			defaultTrainingTime: '18:30',
		})
		expect(prefs.value.answers).toMatchObject({
			adjustAutomatically: false,
			defaultTrainingTime: '18:30',
		})
		const home = await run(userId, 'set_home_place', {
			name: 'Lillehammer',
			kind: 'By',
			municipality: 'Lillehammer',
			county: 'Innlandet',
			latitude: 61.1153,
			longitude: 10.4662,
		})
		expect(home.value.answers.homePlace).toMatchObject({
			name: 'Lillehammer',
			latitude: 61.12,
		})
		expect(
			await run(userId, 'set_home_place', {
				name: 'Paris',
				kind: 'By',
				municipality: 'Paris',
				county: 'Île-de-France',
				latitude: 48.85,
				longitude: 2.35,
			}),
		).toMatchObject({ ok: false, code: 'outside-area' })
		const removed = await run(userId, 'remove_home_place')
		expect(removed.value.answers.homePlace).toBeNull()
	})

	test('export holds the athlete’s data; delete needs the word', async () => {
		const userId = await createAthlete()
		await run(userId, 'set_sports', { sports: ['swim'] })
		const exported = await run(userId, 'export_data')
		expect(exported.ok).toBe(true)
		expect(JSON.stringify(exported.value.data)).toContain('swim')

		expect(
			await run(userId, 'delete_account', { confirm: 'slett' }),
		).toMatchObject({
			ok: false,
			code: 'confirm-required',
		})
		expect(await prisma.user.count({ where: { id: userId } })).toBe(1)
		const deleted = await run(userId, 'delete_account', { confirm: 'SLETT' })
		expect(deleted.value.deleted).toBe(true)
		expect(await prisma.user.count({ where: { id: userId } })).toBe(0)
	})

	test('delete counts an uploaded session, which has no written plan', async () => {
		const userId = await createAthlete()
		const startedAt = new Date('2026-01-02T07:00:00Z')
		const recording = await prisma.activityImport.create({
			data: {
				athleteId: userId,
				externalProvider: 'manual',
				externalId: `upload-${userId}`,
				startedAt,
				endedAt: new Date(startedAt.getTime() + 3600_000),
				durationSec: 3600,
				discipline: 'run',
				rawJson: '{}',
			},
			select: { id: true },
		})
		await prisma.workoutSession.create({
			data: {
				userId,
				scheduledAt: startedAt,
				status: 'completed',
				source: 'recorded',
				recordingId: recording.id,
			},
		})
		const deleted = await run(userId, 'delete_account', { confirm: 'SLETT' })
		expect(deleted.value).toEqual({
			deleted: true,
			sessionsErased: 1,
			recordingsErased: 1,
			workoutsErased: 0,
		})
	})
})
