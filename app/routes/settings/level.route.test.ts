import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createFirstRunPlan } from '#app/utils/first-run/plan.server.ts'
import {
	ACTIVITIES_EDIT_LABELS,
	SESSION_PREFERENCE_LABELS,
} from '#app/utils/labels.ts'
import { createOpenEndedPlan } from '#app/utils/plan-outline/authoring.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { loader as meLoader } from '../me.tsx'
import { action, loader } from './level.tsx'

// _Nivå og økter_ in Meg (#571): the Training Level, the activities and the
// Session Preferences the start asked, shown and changed; and the activities
// edited in place (#587): previewed with _Vis ny uke_, laid on _Bekreft_.

const ARGS = {
	params: {},
	context: {} as AppLoadContext,
	unstable_pattern: '/settings/level',
}

async function setUp() {
	const userData = createUser()
	const session = await prisma.session.create({
		data: {
			expirationDate: getSessionExpirationDate(),
			user: {
				create: {
					...userData,
					password: { create: createPassword(userData.username) },
				},
			},
		},
		select: { id: true, userId: true },
	})
	return {
		userId: session.userId,
		cookie: await getSessionCookieHeader(session),
	}
}

function request(cookie: string, entries?: Array<[string, string]>) {
	return new Request(new URL('/settings/level', BASE_URL).toString(), {
		...(entries
			? {
					method: 'POST',
					body: new URLSearchParams(entries).toString(),
				}
			: {}),
		headers: {
			cookie,
			...(entries
				? { 'content-type': 'application/x-www-form-urlencoded' }
				: {}),
		},
	})
}

test('an athlete from before the start has no level, no preferences and, with no plan, no activities', async () => {
	const { cookie } = await setUp()
	expect(await loader({ request: request(cookie), ...ARGS })).toEqual({
		level: null,
		preferences: [],
		activities: {
			kind: 'none',
			text: SESSION_PREFERENCE_LABELS.meg.activitiesNone,
		},
	})
})

test('Meg shows the level and preferences kept, and the activities the plan has tracks for', async () => {
	const { userId, cookie } = await setUp()
	await prisma.athleteProfile.create({
		data: {
			userId,
			trainingLevel: 'experienced',
			sessionPreferences: JSON.stringify(['short', 'long']),
		},
	})
	await createOpenEndedPlan(userId, { discipline: 'run', weeklyHours: 4 })
	expect(await loader({ request: request(cookie), ...ARGS })).toMatchObject({
		level: 'experienced',
		preferences: ['long', 'short'],
		activities: { names: ['Løping'] },
	})
	const me = await meLoader({
		request: request(cookie),
		...ARGS,
		unstable_pattern: '/me',
	})
	expect(me.startAnswersDetail).toBe(
		'Erfaren · Lange, rolige turer, Korte økter',
	)
})

test('the level and preferences change in Meg, and none is a choice too', async () => {
	const { userId, cookie } = await setUp()
	const saved = await action({
		request: request(cookie, [
			['level', 'competitive'],
			['preferences', 'surprise'],
			['preferences', 'threshold'],
		]),
		...ARGS,
	})
	expect(saved).toMatchObject({ saved: { ok: true } })
	expect(await loader({ request: request(cookie), ...ARGS })).toMatchObject({
		level: 'competitive',
		preferences: ['threshold', 'surprise'],
	})

	await action({ request: request(cookie, [['level', 'beginner']]), ...ARGS })
	const profile = await prisma.athleteProfile.findUniqueOrThrow({
		where: { userId },
		select: { trainingLevel: true, sessionPreferences: true },
	})
	expect(profile).toEqual({
		trainingLevel: 'beginner',
		sessionPreferences: '[]',
	})
})

test('a level that does not exist is refused, and nothing is stored', async () => {
	const { userId, cookie } = await setUp()
	const refused = (await action({
		request: request(cookie, [['level', 'elite']]),
		...ARGS,
	})) as unknown as { init: { status: number } | null }
	expect(refused.init?.status).toBe(400)
	expect(
		await prisma.athleteProfile.count({
			where: { userId, trainingLevel: { not: null } },
		}),
	).toBe(0)
})

/** A plan the start made: run and bike, two lifts a week. */
async function startPlan(userId: string) {
	await prisma.athleteProfile.create({
		data: { userId, timezone: 'Europe/Oslo', defaultTrainingTime: '07:00' },
	})
	const made = await createFirstRunPlan(userId, {
		level: 'recreational',
		discipline: 'run',
		otherSports: ['bike'],
		hours: 6,
		days: [0, 1, 3, 5, 6],
		family: 'polarized',
		strength: 2,
	})
	if (!made.ok) throw new Error(made.reason)
}

test('a plan the start made is edited in place: pre-filled, previewed, refused when unchanged, and laid on Bekreft', async () => {
	const { userId, cookie } = await setUp()
	await startPlan(userId)
	const loaded = await loader({ request: request(cookie), ...ARGS })
	expect(loaded.activities).toMatchObject({
		kind: 'editable',
		current: { sports: ['run', 'bike'], activities: [], strength: 2 },
	})

	const same = await action({
		request: request(cookie, [
			['intent', 'preview-activities'],
			['sports', 'run'],
			['sports', 'bike'],
			['strength', '2'],
		]),
		...ARGS,
	})
	expect(same).toEqual({
		activities: { kind: 'refused', message: ACTIVITIES_EDIT_LABELS.same },
	})
	const none = await action({
		request: request(cookie, [['intent', 'preview-activities']]),
		...ARGS,
	})
	expect(none).toEqual({
		activities: { kind: 'refused', message: ACTIVITIES_EDIT_LABELS.none },
	})

	const swim: Array<[string, string]> = [
		['sports', 'run'],
		['sports', 'swim'],
		['activities', 'yoga-mobility'],
	]
	const shown = (await action({
		request: request(cookie, [['intent', 'preview-activities'], ...swim]),
		...ARGS,
	})) as { activities: { kind: string; preview?: { digest: string } } }
	expect(shown.activities.kind).toBe('preview')
	const digest = shown.activities.preview!.digest

	// A stale digest writes nothing and answers with the new preview.
	const stale = await action({
		request: request(cookie, [
			['intent', 'confirm-activities'],
			['digest', 'not-the-week'],
			...swim,
		]),
		...ARGS,
	})
	expect(stale).toMatchObject({ activities: { kind: 'preview', stale: true } })

	const done = await action({
		request: request(cookie, [
			['intent', 'confirm-activities'],
			['digest', digest],
			...swim,
		]),
		...ARGS,
	})
	expect(done).toMatchObject({ activities: { kind: 'done' } })
	const after = await loader({ request: request(cookie), ...ARGS })
	expect(after.activities).toMatchObject({
		kind: 'editable',
		current: {
			sports: ['run', 'swim'],
			activities: ['yoga-mobility'],
			strength: null,
		},
	})
	const profile = await prisma.athleteProfile.findUniqueOrThrow({
		where: { userId },
		select: { strengthPerWeek: true },
	})
	expect(profile.strengthPerWeek).toBeNull()
})
