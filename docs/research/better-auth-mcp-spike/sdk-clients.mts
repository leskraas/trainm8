// PROTOTYPE, wipe me (#552). The official SDK clients, each running its own OAuth
// discovery + registration + PKCE, against /mcp:
//   v1  @modelcontextprotocol/sdk 1.32.2  (2025-era, initialize 2025-11-25), DCR
//   v2  @modelcontextprotocol/client 2.4.0 pinned to 2026-07-28, CIMD (Claude Code's document)
import { Client as V1Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport as V1Transport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { UnauthorizedError as V1Unauthorized } from '@modelcontextprotocol/sdk/client/auth.js'
import {
	Client as V2Client,
	StreamableHTTPClientTransport as V2Transport,
} from '@modelcontextprotocol/client'
import { userAgentAuthorize } from './browser.mts'

const MCP_URL = new URL(process.env.MCP_URL ?? 'http://localhost:3000/mcp')
const out = (label: string, v: unknown) =>
	console.log(
		`\n### ${label}\n${typeof v === 'string' ? v : JSON.stringify(v, null, 2)}`,
	)

function provider(redirectUrl: string, clientMetadataUrl?: string) {
	const st: any = {
		pendingCode: undefined as string | undefined,
		iss: undefined as string | undefined,
	}
	return {
		st,
		get redirectUrl() {
			return redirectUrl
		},
		clientMetadataUrl,
		get clientMetadata() {
			return {
				client_name: 'sdk-client',
				redirect_uris: [redirectUrl],
				grant_types: ['authorization_code', 'refresh_token'],
				response_types: ['code'],
				token_endpoint_auth_method: 'none',
			}
		},
		clientInformation: () => st.client,
		saveClientInformation: (c: unknown) => void (st.client = c),
		tokens: () => st.tokens,
		saveTokens: (t: unknown) => void (st.tokens = t),
		saveCodeVerifier: (v: string) => void (st.verifier = v),
		codeVerifier: () => st.verifier,
		async redirectToAuthorization(url: URL) {
			st.authorizeUrl = url.toString()
			const r = await userAgentAuthorize(url.toString(), {
				redirectUri: redirectUrl,
				login: 'password',
			})
			st.pendingCode = r.callbackUrl.searchParams.get('code') ?? undefined
			st.iss = r.callbackUrl.searchParams.get('iss') ?? undefined
		},
	}
}

// v1, 2025-era
{
	const p = provider('http://localhost:41001/callback')
	const mk = () => new V1Transport(MCP_URL, { authProvider: p as any })
	const client = new V1Client({ name: 'v1-2025', version: '0' })
	let t = mk()
	try {
		await client.connect(t)
	} catch (e) {
		if (!(e instanceof V1Unauthorized)) throw e
		await t.finishAuth(p.st.pendingCode)
		t = mk()
		await client.connect(t)
	}
	const authorize = new URL(p.st.authorizeUrl)
	out('v1 SDK 1.32.2 (2025-era)', {
		registered_client_id: p.st.client?.client_id,
		authorize_params: Object.fromEntries(
			[...authorize.searchParams].filter(([k]) =>
				['scope', 'resource', 'code_challenge_method', 'client_id'].includes(k),
			),
		),
		negotiated: t.protocolVersion ?? (client as any).getServerVersion?.(),
		protocolVersion: (client as any)._serverVersion ? undefined : undefined,
		tools: (await client.listTools()).tools.map((x) => x.name),
		call: (await client.callTool({ name: 'get_week', arguments: {} })).content,
	})
	await client.close()
}

// v2, 2026-07-28, CIMD
{
	const port = 40000 + Math.floor(Math.random() * 9000)
	const p = provider(
		`http://localhost:${port}/callback`,
		'https://claude.ai/oauth/claude-code-client-metadata',
	)
	const mk = () => new V2Transport(MCP_URL, { authProvider: p as any })
	const client = new V2Client({ name: 'v2-2026', version: '0' }, {
		versionNegotiation: { mode: { pin: '2026-07-28' } },
	} as any)
	let t = mk()
	try {
		await client.connect(t)
	} catch (e: any) {
		if (!p.st.pendingCode) throw e
		await t.finishAuth(p.st.pendingCode, p.st.iss)
		t = mk()
		await client.connect(t)
	}
	const authorize = new URL(p.st.authorizeUrl)
	out('v2 SDK 2.4.0 (2026-07-28 pinned)', {
		client_id: authorize.searchParams.get('client_id'),
		authorize_params: Object.fromEntries(
			[...authorize.searchParams].filter(([k]) =>
				['scope', 'resource', 'code_challenge_method'].includes(k),
			),
		),
		negotiated: (t as any).protocolVersion,
		tools: (await client.listTools()).tools.map((x) => x.name),
		call: (await client.callTool({ name: 'get_week', arguments: {} })).content,
	})
	await client.close()
}
