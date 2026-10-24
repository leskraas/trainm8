// PROTOTYPE, wipe me (#552). Bridge: turn a live Epic Stack session (the
// en_session cookie, as in app/utils/session.server.ts and getUserId in
// app/utils/auth.server.ts) into a Better Auth session, so the OAuth authorize
// flow continues without a second login. Server-only: callable through
// auth.api, not over HTTP.
import { APIError, createAuthEndpoint } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
import { createCookieSessionStorage } from 'react-router'
import * as z from 'zod'

export const epicSessionStorage = createCookieSessionStorage({
	cookie: {
		name: 'en_session',
		sameSite: 'lax',
		path: '/',
		httpOnly: true,
		secrets: (process.env.SESSION_SECRET ?? 'epic-secret-wipe-me').split(','),
		secure: false,
	},
})

/** Epic's getUserId without the redirect: null when there is no live session. */
export async function getEpicUserId(cookieHeader: string | null, prisma: any) {
	const authSession = await epicSessionStorage.getSession(cookieHeader)
	const sessionId = authSession.get('sessionId')
	if (!sessionId) return null
	const session = await prisma.session.findUnique({
		select: { userId: true },
		where: { id: sessionId, expirationDate: { gt: new Date() } },
	})
	return session?.userId ?? null
}

export const epicBridge = () => ({
	id: 'epic-bridge',
	endpoints: {
		epicBridgeSignIn: createAuthEndpoint(
			'/epic-bridge/sign-in',
			{
				method: 'POST',
				body: z.object({ oauth_query: z.string().optional() }),
				metadata: { SERVER_ONLY: true },
				requireHeaders: true,
			},
			async (ctx) => {
				const { prisma } = await import('./auth.mts')
				const userId = await getEpicUserId(ctx.headers!.get('cookie'), prisma)
				if (!userId)
					throw new APIError('UNAUTHORIZED', { message: 'no Epic session' })
				const user = await ctx.context.internalAdapter.findUserById(userId)
				if (!user) throw new APIError('UNAUTHORIZED', { message: 'no user' })
				const session = await ctx.context.internalAdapter.createSession(user.id)
				await setSessionCookie(ctx, { session, user })
				// oauth-provider's after-hook sees the new session cookie plus the
				// oauth_query its before-hook stored, and resumes /oauth2/authorize.
				return ctx.json({ bridged: true })
			},
		),
	},
})
