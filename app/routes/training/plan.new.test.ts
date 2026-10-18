import { type AppLoadContext } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { openEndedRound } from '#app/utils/plan-outline/presets.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { action, loader } from './plan.new.tsx'

// _Hold meg aktiv_ on Sesong's landing (ADR 0079, audit B2/B3): the plan it
// makes is the Klassisk 3:1 round its words promise — the climb and the hard
// sessions with it — and it opens on the first week not yet begun, as the first
// run's does, so nothing is laid on days already behind the athlete.

const ROUTE_PATH = '/training/plan/new'
const ARGS = {
	params: {},
	context: {} as AppLoadContext,
	unstable_pattern: ROUTE_PATH,
}

afterEach(() => {
	vi.useRealTimers()
})

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
	await prisma.athleteProfile.create({
		data: { userId: session.userId, timezone: 'Europe/Oslo' },
	})
	return {
		userId: session.userId,
		cookie: await getSessionCookieHeader(session),
	}
}

/** Posts _Lag planen_ and returns the plan it redirected to. */
async function holdMegAktiv(cookie: string) {
	const request = new Request(new URL(ROUTE_PATH, BASE_URL).toString(), {
		method: 'POST',
		headers: {
			cookie,
			'content-type': 'application/x-www-form-urlencoded',
		},
		body: new URLSearchParams([
			['intent', 'open-ended'],
			['discipline', 'run'],
			['hours', '5'],
		]).toString(),
	})
	const thrown = await action({ request, ...ARGS }).then(
		() => null,
		(error: unknown) => error,
	)
	expect(thrown).toBeInstanceOf(Response)
	const location = (thrown as Response).headers.get('location') ?? ''
	const outlineId = new URL(location, BASE_URL).searchParams.get('outline')
	expect(outlineId).toBeTruthy()
	return prisma.planOutline.findUniqueOrThrow({
		where: { id: outlineId! },
		select: {
			family: true,
			startWeekKey: true,
			phases: { select: { name: true, weeks: true, rhythm: true } },
			tracks: {
				select: {
					segments: {
						where: { kind: 'endurance' },
						select: {
							ramp: true,
							mix: {
								orderBy: { zone: 'asc' },
								select: { zone: true, sessionsPerWeek: true },
							},
						},
					},
				},
			},
		},
	})
}

test('Hold meg aktiv makes a Klassisk 3:1 round with its climb and its hard sessions', async () => {
	const { cookie } = await setUp()

	const outline = await holdMegAktiv(cookie)
	const classic = openEndedRound('classic')

	expect(outline.family).toBe('classic')
	expect(outline.phases).toEqual([
		{ name: 'Blokk 1', weeks: classic.weeks, rhythm: '3:1' },
	])
	const [segment] = outline.tracks.flatMap((track) => track.segments)
	// The climb the words promise, not a flat 0 % …
	expect(segment?.ramp).toBe(classic.ramp)
	expect(segment?.ramp).toBeGreaterThan(0)
	// … and hard sessions, not "no quality sessions" in every week.
	expect(segment?.mix).toEqual(classic.mix)
	expect(segment?.mix.length).toBeGreaterThan(0)
})

test('on a Wednesday the plan opens next Monday, not in the week already begun', async () => {
	vi.useFakeTimers({ toFake: ['Date'] })
	vi.setSystemTime(new Date('2030-01-09T12:00:00Z')) // a Wednesday
	const { cookie } = await setUp()

	const outline = await holdMegAktiv(cookie)

	expect(outline.startWeekKey).toBe('2030-01-14')
})

test('on a Monday nothing is trained on yet, the plan opens this week', async () => {
	vi.useFakeTimers({ toFake: ['Date'] })
	vi.setSystemTime(new Date('2030-01-14T09:00:00Z')) // a Monday morning
	const { cookie } = await setUp()

	const outline = await holdMegAktiv(cookie)

	expect(outline.startWeekKey).toBe('2030-01-14')
})

test('a Monday already trained on is begun, so the plan opens the week after', async () => {
	vi.useFakeTimers({ toFake: ['Date'] })
	vi.setSystemTime(new Date('2030-01-14T15:00:00Z')) // Monday afternoon
	const { userId, cookie } = await setUp()
	await prisma.workoutSession.create({
		data: {
			userId,
			status: 'completed',
			scheduledAt: new Date('2030-01-14T06:00:00Z'),
		},
	})

	const outline = await holdMegAktiv(cookie)

	expect(outline.startWeekKey).toBe('2030-01-21')
})

test('Plan with no plan invites the athlete to the start; with one it does not', async () => {
	const { cookie } = await setUp()
	const get = () =>
		loader({
			request: new Request(new URL(ROUTE_PATH, BASE_URL).toString(), {
				headers: { cookie },
			}),
			...ARGS,
		})

	expect((await get()).startInvite).toBe(true)

	await holdMegAktiv(cookie)

	expect((await get()).startInvite).toBe(false)
})
