import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import { type AddressInfo } from 'node:net'
import {
	Client,
	StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client'
import { http as mswHttp, passthrough } from 'msw'
import { type AppLoadContext } from 'react-router'
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import {
	createAthlete,
	createWorld,
	TODAY,
	YESTERDAY,
} from '#tests/actions-world.ts'
import { server as msw } from '#tests/mocks/index.ts'
import { consoleError } from '#tests/setup/setup-test-env.ts'
import { action, loader } from '../routes/mcp.ts'

// The real `/mcp` route, over real HTTP, driven by the SDK's own client
// (#553): initialize, tools/list, then every read — on both protocol eras,
// because Claude's connector client is still 2025-era (ADR 0092 §8).
//
// The clock here is the real one (the route reads it), so assertions are about
// shape and outcome, not dates' values.

const TOKEN = 'test-token-0123456789abcdef0123456789abcdef'
let baseUrl: string
let server: http.Server

async function toRequest(req: IncomingMessage, origin: string) {
	const chunks: Buffer[] = []
	for await (const chunk of req) chunks.push(chunk as Buffer)
	const headers = new Headers()
	for (const [key, value] of Object.entries(req.headers)) {
		if (typeof value === 'string') headers.set(key, value)
		else if (Array.isArray(value)) headers.set(key, value.join(', '))
	}
	const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined
	return new Request(new URL(req.url ?? '/', origin), {
		method: req.method,
		headers,
		...(body && req.method !== 'GET' && req.method !== 'HEAD' ? { body } : {}),
	})
}

async function serve(req: IncomingMessage, res: ServerResponse) {
	const request = await toRequest(req, baseUrl)
	const args = {
		request,
		params: {},
		context: {} as AppLoadContext,
		unstable_pattern: '/mcp',
	}
	const response =
		request.method === 'GET' || request.method === 'HEAD'
			? await loader(args)
			: await action(args)
	res.writeHead(response.status, Object.fromEntries(response.headers))
	res.end(Buffer.from(await response.arrayBuffer()))
}

beforeAll(async () => {
	server = http.createServer((req, res) => {
		serve(req, res).catch((error: unknown) => {
			res.writeHead(500)
			res.end(String(error))
		})
	})
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
	baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`
})

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

beforeEach(() => {
	// This file's server is real and local: let MSW pass its requests
	// through, the DNS-rebinding probe's foreign Host included.
	msw.use(mswHttp.all('*', () => passthrough()))
	// The SDK reports every rejected request (a 401, a 405) through `onerror`.
	consoleError.mockImplementation(() => {})
})

async function athleteWithToken(scopes?: string) {
	const world = await createWorld()
	process.env.MCP_DEV_TOKENS = `${world.userId}:${TOKEN}${scopes ? `:${scopes}` : ''}`
	return world
}

async function connect(era: 'legacy' | 'modern') {
	const client = new Client(
		{ name: 'trainm8-test', version: '1.0.0' },
		era === 'modern'
			? { versionNegotiation: { mode: { pin: '2026-07-28' } } }
			: {},
	)
	const transport = new StreamableHTTPClientTransport(
		new URL('/mcp', baseUrl),
		{
			requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
		},
	)
	await client.connect(transport)
	return client
}

const READS = [
	'get_season',
	'get_session',
	'get_session_vs_plan',
	'get_today',
	'get_training_load',
	'get_week_change',
	'list_sessions',
]

for (const era of ['legacy', 'modern'] as const) {
	test(`${era} era: initialize, list the tools, and call every read`, async () => {
		const world = await athleteWithToken()
		const client = await connect(era)
		expect(client.getProtocolEra()).toBe(era)

		const { tools } = await client.listTools()
		expect(tools.map((t) => t.name)).toEqual(READS)
		for (const tool of tools) {
			expect(tool.annotations).toMatchObject({
				readOnlyHint: true,
				openWorldHint: false,
			})
			expect(tool.outputSchema?.type).toBe('object')
		}

		const calls: Record<string, Record<string, unknown>> = {
			get_today: {},
			list_sessions: { from: YESTERDAY, to: TODAY },
			get_session: { sessionId: world.run },
			get_session_vs_plan: { sessionId: world.run },
			get_training_load: { weeks: 2 },
			get_season: {},
			get_week_change: {},
		}
		for (const name of READS) {
			const result = await client.callTool({
				name,
				arguments: calls[name] ?? {},
			})
			expect({ name, isError: result.isError }).toEqual({
				name,
				isError: false,
			})
			expect(result.structuredContent).toMatchObject({ outcome: 'done' })
			const [text] = result.content as Array<{ type: string; text: string }>
			expect(text?.text).toMatch(/^Done\./)
		}

		// A Strava-recorded ride reaches the model only as its reason.
		const ride = await client.callTool({
			name: 'get_session',
			arguments: { sessionId: world.ride },
		})
		expect(ride.structuredContent).toMatchObject({
			value: { actual: { durationS: { reason: 'source-terms' } } },
		})

		// An invalid input is a refusal the model can act on, not an SDK error.
		const bad = await client.callTool({
			name: 'list_sessions',
			arguments: { from: TODAY, to: YESTERDAY },
		})
		expect(bad.isError).toBe(true)
		expect(bad.structuredContent).toMatchObject({
			outcome: 'refused',
			code: 'invalid-input',
			next: 'fix-input',
		})

		// No answering tool exists on MCP (ADR 0093 §3): the athlete's yes is
		// not on the list, and a call by its name reaches no action at all.
		for (const name of ['answer_proposal', 'accept_round', 'ease_week']) {
			const yes = await client
				.callTool({ name, arguments: {} })
				.catch((error: unknown) => ({ thrown: String(error) }))
			expect(JSON.stringify(yes)).not.toContain('needs-athlete-yes')
			expect(yes).not.toHaveProperty('structuredContent.outcome')
		}
		await client.close()
	})
}

test('a dev token binds to the user id: a rename never moves it to another account', async () => {
	const world = await athleteWithToken()
	// The athlete renames themself, and someone else takes the old name.
	await prisma.user.update({
		where: { id: world.userId },
		data: { username: `renamed-${world.username}` },
	})
	const other = await createAthlete()
	await prisma.user.update({
		where: { id: other.id },
		data: { username: world.username },
	})

	const client = await connect('modern')
	const own = await client.callTool({
		name: 'get_session',
		arguments: { sessionId: world.run },
	})
	// Still the athlete's own session: the token still names them.
	expect(own.structuredContent).toMatchObject({
		outcome: 'done',
		value: { id: world.run },
	})
	await client.close()

	// A username is not a user id, so a username-keyed entry opens nothing.
	process.env.MCP_DEV_TOKENS = `${world.username}:${TOKEN}`
	const response = await fetch(new URL('/mcp', baseUrl), {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			accept: 'application/json, text/event-stream',
			authorization: `Bearer ${TOKEN}`,
		},
		body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
	})
	expect(response.status).toBe(401)
})

test('no bearer, or a wrong one, gets no catalog', async () => {
	await athleteWithToken()
	const list = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }
	for (const authorization of [
		undefined,
		'Bearer not-the-token',
		`Basic ${TOKEN}`,
	]) {
		const response = await fetch(new URL('/mcp', baseUrl), {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				accept: 'application/json, text/event-stream',
				...(authorization ? { authorization } : {}),
			},
			body: JSON.stringify(list),
		})
		expect(response.status).toBe(401)
		expect(response.headers.get('www-authenticate')).toMatch(/^Bearer /)
	}
})

test('a browser Origin that is not trainm8’s own is refused before the token is read', async () => {
	await athleteWithToken()
	const response = await fetch(new URL('/mcp', baseUrl), {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			authorization: `Bearer ${TOKEN}`,
			origin: 'https://evil.example',
		},
		body: '{}',
	})
	expect(response.status).toBe(403)
})

test('a Host that is not localhost is refused (DNS rebinding)', async () => {
	await athleteWithToken()
	const port = new URL(baseUrl).port
	const status = await new Promise<number>((resolve, reject) => {
		const req = http.request(
			{
				host: '127.0.0.1',
				port,
				path: '/mcp',
				method: 'POST',
				headers: {
					host: `rebound.example:${port}`,
					'content-type': 'application/json',
					authorization: `Bearer ${TOKEN}`,
				},
			},
			(res) => {
				res.resume()
				resolve(res.statusCode ?? 0)
			},
		)
		req.on('error', reject)
		req.end('{}')
	})
	expect(status).toBe(403)
})

test('a token without the read scope is told to step up: 403 insufficient_scope', async () => {
	await athleteWithToken('training:propose')
	const response = await fetch(new URL('/mcp', baseUrl), {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			accept: 'application/json, text/event-stream',
			'mcp-protocol-version': '2025-06-18',
			authorization: `Bearer ${TOKEN}`,
		},
		body: JSON.stringify({
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/call',
			params: { name: 'get_today', arguments: {} },
		}),
	})
	expect(response.status).toBe(403)
	expect(response.headers.get('www-authenticate')).toMatch(
		/error="insufficient_scope".*scope="training:read"/,
	)
	// And the SDK's client hears it as a scope error, on the modern era too.
	const client = await connect('modern')
	await expect(
		client.callTool({ name: 'get_today', arguments: {} }),
	).rejects.toThrow(/Insufficient scope/)
	await client.close().catch(() => {})
})

test('#639 H6: production never serves /mcp or reads a dev token', async () => {
	await athleteWithToken()
	const env = process.env.NODE_ENV
	process.env.NODE_ENV = 'production'
	try {
		const response = await fetch(new URL('/mcp', baseUrl), {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				authorization: `Bearer ${TOKEN}`,
			},
			body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
		})
		expect(response.status).toBe(404)
	} finally {
		process.env.NODE_ENV = env
	}
})
