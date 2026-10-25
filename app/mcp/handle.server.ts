/**
 * `/mcp` in front of the handler (ADR 0092 §8, MCP note §2.4–2.5): every guard
 * runs before the SDK sees the request, in this order.
 *
 * 1. **Not in production.** Phase 0 has no authorization server, so `/mcp` is
 *    not served in production at all (404) until ADR 0094's OAuth lands, and a
 *    dev token is never read there (#639 H6).
 * 2. **Host** must be a localhost name, and a present **Origin** must be one
 *    too: DNS-rebinding and cross-site protection, which the SDK's handler
 *    does not do itself. Non-browser clients send no Origin and pass.
 * 3. **Bearer.** No valid token, no catalog: `tools/list` needs one like every
 *    other call. The token names the athlete; the caller is `mcp` because this
 *    credential authenticated the request, never because a header says so.
 */

import {
	hostHeaderValidationResponse,
	localhostAllowedHostnames,
	localhostAllowedOrigins,
	originValidationResponse,
} from '@modelcontextprotocol/server'
import { actionCtx } from '#app/actions/context.server.ts'
import { type Scope } from '#app/actions/vocabulary.ts'
import { prisma } from '#app/utils/db.server.ts'
import { devTokensAllowed, matchDevToken } from './dev-token.server.ts'
import { createTrainm8McpHandler } from './server.server.ts'

const handler = createTrainm8McpHandler(async (authInfo, request) => {
	const userId = authInfo.extra?.userId
	if (typeof userId !== 'string' || !request) {
		throw new Error('/mcp reached the handler without a verified athlete')
	}
	return actionCtx(request, {
		userId,
		caller: 'mcp',
		scopes: authInfo.scopes as Scope[],
	})
})

function unauthorized(): Response {
	return Response.json(
		{
			jsonrpc: '2.0',
			error: { code: -32001, message: 'A valid bearer token is required.' },
			id: null,
		},
		{
			status: 401,
			headers: {
				'WWW-Authenticate': 'Bearer realm="trainm8", error="invalid_token"',
			},
		},
	)
}

export async function handleMcpRequest(request: Request): Promise<Response> {
	// #639 H6: never served, and no dev token read, outside development and test.
	if (!devTokensAllowed(process.env.NODE_ENV)) {
		return new Response('Not found', { status: 404 })
	}
	const rejected =
		hostHeaderValidationResponse(request, localhostAllowedHostnames()) ??
		originValidationResponse(request, localhostAllowedOrigins())
	if (rejected) return rejected

	const token = matchDevToken(request)
	if (!token) return unauthorized()
	// By id, never by username: a renamed athlete keeps their token, and
	// whoever takes the old name gets nothing from it.
	const user = await prisma.user.findUnique({
		where: { id: token.userId },
		select: { id: true },
	})
	if (!user) return unauthorized()

	return handler.fetch(request, {
		authInfo: {
			token: token.token,
			clientId: `dev-token:${user.id}`,
			scopes: token.scopes,
			extra: { userId: user.id },
		},
	})
}
