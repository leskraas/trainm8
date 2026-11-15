/**
 * No English word the engine wrote reaches an app. A representative athlete —
 * a plan on the shipped Base/Build/Peak/Taper names, a session whose blocks an
 * import named `Warm-up`/`Main`/`Cool-down` and that runs past an hour, lifts
 * with loads that need a bodyweight or a 1RM the athlete has not given — is
 * read through every read capability, and every string the engine itself
 * wrote is checked for common English words.
 *
 * What the athlete or a session's author wrote (titles, notes, descriptions,
 * exercise names, their own name) is theirs and is skipped.
 */
import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { createPlanOutline } from '#app/utils/plan-outline/authoring.server.ts'
import {
	createAthlete,
	createWorld,
	NOW,
	ORIGIN,
	TODAY,
} from '#tests/actions-world.ts'
import { type CapabilityCtx, type CapabilityResult } from './define.ts'
import { READ_CAPABILITIES } from './reads.server.ts'
import { SESSION_CAPABILITIES } from './sessions.server.ts'
import { SETUP_CAPABILITIES } from './setup.server.ts'

const CAPS = {
	...READ_CAPABILITIES,
	...SETUP_CAPABILITIES,
	...SESSION_CAPABILITIES,
} as Record<
	string,
	{
		kind: 'read' | 'write'
		input: { safeParse: (i: unknown) => { success: boolean; data?: unknown } }
		run: (ctx: CapabilityCtx, input: never) => Promise<CapabilityResult<any>>
	}
>

async function call(userId: string, name: string, input: unknown = {}) {
	const cap = CAPS[name]!
	const parsed = cap.input.safeParse(input)
	if (!parsed.success) throw new Error(`${name}: invalid input`)
	return cap.run(
		{
			userId,
			now: NOW,
			timezone: 'UTC',
			origin: ORIGIN,
			request: new Request(ORIGIN),
		},
		parsed.data as never,
	)
}

/** Common English words, and `1 h` for an hour. Norwegian shares none of them. */
const ENGLISH =
	/\b(the|and|of|with|your|file|no|not|easy|endurance|aerobic|recovery|threshold|warm-?up|cool-?down|main|bodyweight|assisted|level|build|peak|taper|zones?|load|week|session|set)\b|\d h\b/i

/** Keys whose text someone wrote: the session's author, or the athlete. */
const AUTHORED = new Set([
	'title',
	'note',
	'notes',
	'username',
	'email',
	'displayName',
	'fileName',
])

function englishIn(value: unknown, path = ''): string[] {
	if (typeof value === 'string') {
		// A code (`warmup`, `goes-up`) is a key for the app, never shown.
		if (/^[a-z0-9_.:-]+$/.test(value)) return []
		return ENGLISH.test(value) ? [`${path}: ${value}`] : []
	}
	if (Array.isArray(value)) {
		return value.flatMap((item, i) => englishIn(item, `${path}[${i}]`))
	}
	if (value && typeof value === 'object') {
		const record = value as Record<string, unknown>
		return Object.entries(record).flatMap(([key, item]) => {
			if (AUTHORED.has(key)) return []
			// An exercise's or the athlete's name is theirs; a phase's is not.
			if (key === 'name' && ('exerciseId' in record || 'id' in record)) {
				return []
			}
			if (key === 'name' && /exercise|athlete$|lifts/.test(path)) return []
			// A session's description is its author's.
			if (key === 'description' && 'sessionId' in record) return []
			if (key === 'description' && /\.session$/.test(path)) return []
			return englishIn(item, path ? `${path}.${key}` : key)
		})
	}
	return []
}

test('the engine speaks Norwegian: no English word of its own in any read', async () => {
	const world = await createWorld()
	const userId = world.userId
	await prisma.athleteProfile.update({
		where: { userId },
		data: { sports: JSON.stringify(['run', 'bike']) },
	})

	const plan = await createPlanOutline(userId, {
		startWeekKey: '2026-10-12',
		structure: {
			phases: [
				{ name: 'Base', weeks: 2, rhythm: '3:1' },
				{ name: 'Build', weeks: 2, rhythm: '3:1' },
				{ name: 'Peak', weeks: 1, rhythm: '3:1' },
				{ name: 'Taper', weeks: 1, rhythm: '3:1' },
			],
		},
		tracks: [{ discipline: 'run', currency: 'hours', anchorValue: 5 }],
	})
	expect(plan.ok).toBe(true)

	// A run an import named in English, longer than an hour.
	const rolig = JSON.stringify({ kind: 'zoneLabel', label: 'rolig' })
	const workout = await prisma.workout.create({
		data: {
			title: 'Long run',
			discipline: 'run',
			intent: 'endurance',
			ownerId: userId,
			blocks: {
				create: [
					['Warm-up', 600],
					['Main', 5400],
					['Cool-down', 600],
				].map(([name, durationSec], orderIndex) => ({
					name: name as string,
					orderIndex,
					repeatCount: 1,
					steps: {
						create: [
							{
								orderIndex: 0,
								kind: 'cardio',
								discipline: 'run',
								durationSec: durationSec as number,
								intensity: rolig,
							},
						],
					},
				})),
			},
		},
		select: { id: true },
	})
	const run = await prisma.workoutSession.create({
		data: {
			userId,
			workoutId: workout.id,
			scheduledAt: new Date(`${TODAY}T16:00:00.000Z`),
			status: 'scheduled',
			source: 'authored',
		},
		select: { id: true },
	})

	// Lifts whose loads need what the athlete has not given.
	const sessionIds: string[] = [run.id]
	for (const sentence of ['3x10 knebøy kroppsvekt', 'knebøy 5x5 80 %']) {
		const added = await call(userId, 'add_session', {
			date: TODAY,
			sentence,
		})
		expect({ sentence, ok: added.ok }).toEqual({ sentence, ok: true })
		if (added.ok) sessionIds.push(added.value.sessionId)
	}

	const reads: Array<[string, unknown]> = [
		['athlete', {}],
		['today', {}],
		['week', {}],
		['plan', {}],
		['sessions', { from: '2026-10-01', to: '2026-11-30' }],
		['progress', {}],
		['proposals', {}],
		['zones', {}],
		['recordings', {}],
		['get_setup', {}],
		['goal', {}],
		['connections', {}],
		['thresholds', {}],
		...sessionIds.map((id): [string, unknown] => [
			'session',
			{ sessionId: id },
		]),
		...sessionIds
			.slice(1)
			.map((id): [string, unknown] => ['strength_session', { sessionId: id }]),
	]
	const found: string[] = []
	for (const [name, input] of reads) {
		if (!(name in CAPS)) continue
		const result = await call(userId, name, input)
		found.push(...englishIn(result.ok ? result.value : result.message, name))
	}

	// A new athlete's start: the options and the plan they would get.
	const fresh = (await createAthlete()).id
	for (const [name, input] of [
		['set_sports', { sports: ['run', 'bike'] }],
		['set_experience_level', { level: 'recreational' }],
		['set_current_volume', { hoursPerWeek: 6 }],
		['set_availability', { days: ['tue', 'thu', 'sat', 'sun'] }],
	] as const) {
		const answered = await call(fresh, name, input)
		expect({ name, ok: answered.ok }).toEqual({ name, ok: true })
	}
	const options = await call(fresh, 'start_options')
	expect(options).toMatchObject({ ok: true })
	found.push(...englishIn(options.ok && options.value, 'start_options'))
	for (const option of options.ok ? options.value.options : []) {
		const preview = await call(fresh, 'plan_preview', { style: option.style })
		expect(preview).toMatchObject({ ok: true })
		found.push(...englishIn(preview.ok && preview.value, 'plan_preview'))
	}

	expect(found).toEqual([])

	// And the translations are the ones meant.
	const planRead = await call(userId, 'plan')
	expect(
		planRead.ok &&
			planRead.value.plan.phases.map((p: { name: string }) => p.name),
	).toEqual(['Grunntrening', 'Oppbygging', 'Spissing', 'Nedtrapping'])
	const runRead = await call(userId, 'session', { sessionId: run.id })
	expect(runRead.ok && runRead.value.structure).toMatchObject([
		{ name: 'Oppvarming' },
		{ name: 'Hoveddel', text: expect.stringContaining('1 t 30 min') },
		{ name: 'Nedjogg' },
	])
})
