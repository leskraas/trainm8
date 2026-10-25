import { readFile } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import { type AppLoadContext } from 'react-router'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { z } from 'zod/v4'
import { handleMcpRequest } from '#app/mcp/handle.server.ts'
import { toolCatalog } from '#app/mcp/server.server.ts'
import {
	action as weekChangeRoute,
	WEEK_CHANGE_INTENT_ACTIONS,
} from '#app/routes/resources/week-change.tsx'
import { addDays } from '#app/utils/athlete-calendar.ts'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { WeekChangeActionSchema } from '#app/utils/load/week-change-schema.ts'
import { lastClosedWeekKey } from '#app/utils/load/week-change.ts'
import { recordProposals } from '#app/utils/load/week-replan-proposals.server.ts'
import { createWorld } from '#tests/actions-world.ts'
import { consoleError } from '#tests/setup/setup-test-env.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { actionCtx } from './context.server.ts'
import { ACTION_NAME, type ActionCtx } from './define.ts'
import { READING_SCHEMAS } from './reading.ts'
import {
	type ActionName,
	getAction,
	isActionName,
	listActions,
} from './registry.server.ts'
import { runAction } from './run.server.ts'
import { CALLERS, type Caller } from './vocabulary.ts'

// The parity test (ADR 0092 §9): every route intent is exactly one action,
// every action gives the same outcome through its reader as through
// `runAction`, and both match an oracle written by hand; every action has a
// fixture; no input carries a user id and no number reaches a model bare; and
// the catalog a model sees is checked in.

const TOKEN = 'parity-token-0123456789abcdef0123456789abcdef'

/** Routes on the registry, each with its intent → action map. */
const ROUTE_INTENTS = [
	{
		route: '/resources/week-change',
		intents: WeekChangeActionSchema.options.map((o) => o.shape.intent.value),
		map: WEEK_CHANGE_INTENT_ACTIONS as Record<string, ActionName>,
	},
]

// ── 1. intents ───────────────────────────────────────────────────────────────

test('every route intent maps to exactly one action, and every web-only action has an intent', () => {
	const mapped: string[] = []
	for (const { intents, map } of ROUTE_INTENTS) {
		expect(Object.keys(map).sort()).toEqual([...intents].sort())
		for (const name of Object.values(map)) {
			expect(isActionName(name)).toBe(true)
			mapped.push(name)
		}
	}
	expect(new Set(mapped).size).toBe(mapped.length)
	// A `web`-only action that no route reaches would be dead: the yes has to
	// be somewhere the athlete can give it.
	const webOnly = listActions()
		.filter((a) => a.callers.length === 1 && a.callers[0] === 'web')
		.map((a) => a.name)
	expect(webOnly.sort()).toEqual([...mapped].sort())
})

// ── 3. fixtures ──────────────────────────────────────────────────────────────

type World = Awaited<ReturnType<typeof createWorld>> & {
	proposalId: string
	comingWeekKey: string
}

/**
 * A world on the real clock (the week-change route reads it): `createWorld`'s
 * sessions plus a closed week with one pending proposal on a session ahead.
 */
async function seed(): Promise<World> {
	const world = await createWorld()
	const now = new Date()
	const closed = lastClosedWeekKey(now, 'UTC')
	const coming = addDays(closed, 7)
	const replan = await prisma.weekReplan.create({
		data: {
			athleteId: world.userId,
			weekKey: closed,
			outcome: 'proposed',
			reason: 'Forrige uke ble tyngre enn planlagt.',
		},
		select: { id: true },
	})
	// The world's evening run, moved two days ahead so it is still ahead.
	const ahead = await prisma.workoutSession.update({
		where: { id: world.planned },
		data: { scheduledAt: new Date(now.getTime() + 2 * 86_400_000) },
		select: { id: true },
	})
	await prisma.$transaction((tx) =>
		recordProposals(
			tx,
			world.userId,
			[
				{
					payload: { kind: 'scale', factor: 0.9 },
					targetSessionId: ahead.id,
					targetWeekKey: coming,
					reason: 'Fordi.',
				},
			],
			replan.id,
		),
	)
	const proposal = await prisma.weekReplanProposal.findFirstOrThrow({
		where: { athleteId: world.userId },
		select: { id: true },
	})
	return { ...world, proposalId: proposal.id, comingWeekKey: coming }
}

/** One input per action: a new action costs one line here. */
const FIXTURES: Record<ActionName, (w: World) => Record<string, unknown>> = {
	get_today: () => ({}),
	list_sessions: () => {
		const today = new Date().toISOString().slice(0, 10)
		return { from: addDays(today, -6), to: today }
	},
	get_session: (w) => ({ sessionId: w.run }),
	get_session_vs_plan: (w) => ({ sessionId: w.run }),
	get_training_load: () => ({ weeks: 4 }),
	get_season: () => ({}),
	get_week_change: () => ({}),
	answer_proposal: (w) => ({ proposalId: w.proposalId, answer: 'accepted' }),
	accept_round: (w) => ({ proposalId: w.proposalId, factor: 0.9 }),
	ease_week: (w) => ({ weekKey: w.comingWeekKey }),
}

test('every action has a fixture', () => {
	expect(Object.keys(FIXTURES).sort()).toEqual(listActions().map((a) => a.name))
})

// ── 2. callers ───────────────────────────────────────────────────────────────

/**
 * The oracle, by hand, from each action's kind and callers — never from the
 * runner's code. `done`, or the refusal code.
 */
const READ = { web: 'done', mcp: 'done', agent: 'done' } as const
const ATHLETES_YES = {
	mcp: 'needs-athlete-yes',
	agent: 'needs-athlete-yes',
} as const
const ORACLE: Record<ActionName, Record<Caller, string>> = {
	get_today: READ,
	list_sessions: READ,
	get_session: READ,
	get_session_vs_plan: READ,
	get_training_load: READ,
	get_season: READ,
	get_week_change: READ,
	answer_proposal: { web: 'done', ...ATHLETES_YES },
	// The fixture's proposal is a scale, not a round: the domain refuses the
	// factor, the same way through the route and directly.
	accept_round: { web: 'factor-not-a-round', ...ATHLETES_YES },
	ease_week: { web: 'done', ...ATHLETES_YES },
}

type Shape = string

/** What the MCP reader answers for an action it does not register. */
const NO_SUCH_TOOL = 'no-such-tool'

/**
 * What the reader itself should answer: the direct outcome, except that MCP
 * registers no action a model may not call, so no answering tool exists there
 * (ADR 0093 §3) and the call never reaches `runAction`.
 */
function viaReaderOracle(caller: Caller, name: ActionName, direct: Shape) {
	return caller === 'mcp' && !getAction(name).callers.includes('mcp')
		? NO_SUCH_TOOL
		: direct
}

function shapeOf(result: { outcome: string; code?: string }): Shape {
	return result.outcome === 'refused' ? (result.code ?? '') : result.outcome
}

async function webSession(userId: string) {
	const session = await prisma.session.create({
		data: { expirationDate: getSessionExpirationDate(), userId },
		select: { id: true },
	})
	return getSessionCookieHeader(session)
}

/** The route's intent for an action, with its fixture as the form posts it. */
function formFor(name: ActionName, input: Record<string, unknown>) {
	const intent = Object.entries(WEEK_CHANGE_INTENT_ACTIONS).find(
		([, action]) => action === name,
	)?.[0]
	if (!intent) return null
	return Object.fromEntries([
		['intent', intent],
		...Object.entries(input).map(([k, v]) => [k, String(v)]),
	]) as Record<string, string>
}

/** A JSON-RPC reply, as JSON or as the one event of a legacy SSE reply. */
async function jsonRpc(response: Response): Promise<unknown> {
	const text = await response.text()
	const data = text.split('\n').find((line) => line.startsWith('data: '))
	return JSON.parse(data ? data.slice('data: '.length) : text)
}

/** Through the reader each caller has: the route, `/mcp`, or in process. */
async function viaReader(
	caller: Caller,
	name: ActionName,
	w: World,
): Promise<Shape> {
	const input = FIXTURES[name](w)
	if (caller === 'mcp') {
		process.env.MCP_DEV_TOKENS = `${w.username}:${TOKEN}`
		const response = await handleMcpRequest(
			new Request('http://localhost/mcp', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					accept: 'application/json, text/event-stream',
					'mcp-protocol-version': '2025-06-18',
					authorization: `Bearer ${TOKEN}`,
					host: 'localhost',
				},
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 1,
					method: 'tools/call',
					params: { name, arguments: input },
				}),
			}),
		)
		const body = (await jsonRpc(response)) as {
			result?: { structuredContent?: { outcome: string; code?: string } }
			error?: unknown
		}
		// No envelope: the call reached no action, so there is no such tool.
		if (!body.result?.structuredContent) return NO_SUCH_TOOL
		return shapeOf(body.result.structuredContent)
	}
	const form = caller === 'web' ? formFor(name, input) : null
	if (form) {
		const response = (await weekChangeRoute({
			request: new Request(new URL('/resources/week-change', BASE_URL), {
				method: 'POST',
				headers: {
					cookie: await webSession(w.userId),
					'content-type': 'application/x-www-form-urlencoded',
				},
				body: new URLSearchParams(form).toString(),
			}),
			params: {},
			context: {} as AppLoadContext,
			unstable_pattern: '/resources/week-change',
		})) as { data: { result: { ok: boolean; reason?: string } } }
		const { result } = response.data
		return result.ok ? 'done' : (result.reason ?? '')
	}
	// `web` reads and the in-app `agent` have no adapter yet: in process.
	return shapeOf(await runAction(ctx(w.userId, caller), name, input))
}

function ctx(userId: string, caller: Caller): ActionCtx {
	return {
		userId,
		caller,
		now: new Date(),
		timezone: 'UTC',
		origin: 'http://localhost',
		...(caller === 'web' ? {} : { scopes: ['training:read'] as const }),
	}
}

describe('every action × every caller: the reader agrees with runAction and the oracle', () => {
	const saved = process.env.MCP_DEV_TOKENS
	beforeEach(() => consoleError.mockImplementation(() => {}))
	afterEach(() => {
		process.env.MCP_DEV_TOKENS = saved
	})
	for (const action of listActions()) {
		const name = action.name as ActionName
		test(name, async () => {
			for (const caller of CALLERS) {
				const viaAdapter = await viaReader(caller, name, await seed())
				const w = await seed()
				const direct = shapeOf(
					await runAction(ctx(w.userId, caller), name, FIXTURES[name](w)),
				)
				expect({ caller, viaAdapter }).toEqual({
					caller,
					viaAdapter: viaReaderOracle(caller, name, direct),
				})
				expect({ caller, direct }).toEqual({
					caller,
					direct: ORACLE[name][caller],
				})
			}
		})
	}
})

// ── 4. schemas ───────────────────────────────────────────────────────────────

type Def = {
	type: string
	shape?: Record<string, z.ZodType>
	element?: z.ZodType
	options?: z.ZodType[]
	innerType?: z.ZodType
	valueType?: z.ZodType
	in?: z.ZodType
	out?: z.ZodType
	left?: z.ZodType
	right?: z.ZodType
}

function defOf(schema: z.ZodType): Def {
	return (schema as unknown as { _zod: { def: Def } })._zod.def
}

/** Every path in `schema` where `visit` says something is wrong. */
function walk(
	schema: z.ZodType,
	visit: (schema: z.ZodType, def: Def, path: string) => string | 'skip' | null,
	path = '$',
): string[] {
	const def = defOf(schema)
	const verdict = visit(schema, def, path)
	if (verdict === 'skip') return []
	const found = verdict ? [verdict] : []
	const children: Array<[string, z.ZodType | undefined]> = [
		...Object.entries(def.shape ?? {}).map(
			([k, v]) => [`${path}.${k}`, v] as [string, z.ZodType],
		),
		[`${path}[]`, def.element],
		...(def.options ?? []).map(
			(o, i) => [`${path}|${i}`, o] as [string, z.ZodType],
		),
		[path, def.innerType],
		[`${path}{}`, def.valueType],
		[path, def.in],
		[path, def.out],
		[path, def.left],
		[path, def.right],
	]
	for (const [childPath, child] of children) {
		if (child) found.push(...walk(child, visit, childPath))
	}
	return found
}

test('no input carries a user, athlete or owner id: userId comes from ctx only', () => {
	for (const action of listActions()) {
		const found = walk(action.input, (_s, def, path) =>
			Object.keys(def.shape ?? {}).find((key) =>
				/^(user|athlete|owner)(_?id)?$/i.test(key),
			)
				? `${action.name} ${path}`
				: null,
		)
		expect(found).toEqual([])
	}
})

test('every number a model can receive is a Reading', () => {
	for (const action of listActions()) {
		if (!action.callers.some((c: Caller) => c !== 'web')) continue
		const bare = walk(action.output, (schema, def, path) => {
			if (READING_SCHEMAS.has(schema)) return 'skip'
			return def.type === 'number' ||
				def.type === 'int' ||
				def.type === 'bigint'
				? `${action.name} ${path}`
				: null
		})
		expect(bare).toEqual([])
	}
})

test('the walk finds a bare number when there is one', () => {
	const bare = walk(
		z.object({ a: z.array(z.number().nullable()) }),
		(s, d, p) =>
			READING_SCHEMAS.has(s) ? 'skip' : d.type === 'number' ? p : null,
	)
	expect(bare).toEqual(['$.a[]'])
})

test('every name is snake_case, at most 64 characters', () => {
	for (const action of listActions()) {
		expect(action.name).toMatch(ACTION_NAME)
		expect(action.name).toMatch(/^[a-z0-9_]{1,64}$/)
	}
})

test('the web caller is the cookie session on a request with no Authorization header (ADR 0092 §3)', async () => {
	const { userId } = await createWorld()
	const request = new Request('http://localhost/resources/week-change', {
		method: 'POST',
		headers: { authorization: `Bearer ${TOKEN}` },
	})
	await expect(
		actionCtx(request, { userId, caller: 'web' }),
	).rejects.toMatchObject({ status: 400 })
	await expect(
		actionCtx(request, { userId, caller: 'mcp' }),
	).resolves.toMatchObject({ caller: 'mcp' })
})

// ── 5. catalog ───────────────────────────────────────────────────────────────

test('the catalog a model sees is checked in, and does not vary by scope', async () => {
	const w = await createWorld()
	const list = async (scopes: string) => {
		process.env.MCP_DEV_TOKENS = `${w.username}:${TOKEN}${scopes}`
		const response = await handleMcpRequest(
			new Request('http://localhost/mcp', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					accept: 'application/json, text/event-stream',
					'mcp-protocol-version': '2025-06-18',
					authorization: `Bearer ${TOKEN}`,
					host: 'localhost',
				},
				body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
			}),
		)
		return ((await jsonRpc(response)) as { result: { tools: unknown[] } })
			.result.tools
	}
	const saved = process.env.MCP_DEV_TOKENS
	try {
		const read = await list('')
		expect(await list(':training:propose')).toEqual(read)
		expect(await list(':training:read+training:propose+training:log')).toEqual(
			read,
		)
		expect(read).toEqual(JSON.parse(JSON.stringify(toolCatalog())))
		// Compared as parsed JSON, so Prettier reformatting the checked-in file
		// is not a change; any real change to the catalog still fails, and
		// `vitest -u` rewrites the file.
		const snapshot = './__snapshots__/mcp-catalog.json'
		const committed = await readFile(
			new URL(snapshot, import.meta.url),
			'utf8',
		).catch(() => null)
		await expect(
			committed !== null && isDeepStrictEqual(JSON.parse(committed), read)
				? committed
				: JSON.stringify(read, null, '\t') + '\n',
		).toMatchFileSnapshot(snapshot)
	} finally {
		process.env.MCP_DEV_TOKENS = saved
	}
})
