// PROTOTYPE, wipe me (#552). Better Auth 1.7.12 as the MCP authorization
// server, on Prisma 6.19.2 + SQLite, sharing Epic Stack's User table.
import { cimd } from '@better-auth/cimd'
import { fetchClientMetadataResource } from '@better-auth/cimd/node'
import { mcp } from '@better-auth/mcp'
import { prismaAdapter } from '@better-auth/prisma-adapter'
import { PrismaClient } from '@prisma/client'
import { betterAuth } from 'better-auth'
import { jwt } from 'better-auth/plugins'
import { epicBridge } from './epic-bridge.mts'

// Canonical form: lowercase host, no trailing slash, no default port. Better
// Auth compares `resource` as an exact string.
export const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'
export const RESOURCE = `${BASE_URL}/mcp`
export const IS_LOCAL = new URL(BASE_URL).hostname === 'localhost'
export const prisma = new PrismaClient()

// The placeholder secrets are for localhost only; a tunnelled or deployed spike must set its own.
function secretFor(name: string, fallback: string) {
	const value = process.env[name]
	if (value) return value
	if (!IS_LOCAL)
		throw new Error(`${name} must be set when BASE_URL is not localhost`)
	return fallback
}

export const auth = betterAuth({
	baseURL: BASE_URL,
	basePath: '/api/auth',
	secret: secretFor(
		'BETTER_AUTH_SECRET',
		'spike-secret-wipe-me-0123456789abcdef',
	),
	database: prismaAdapter(prisma, { provider: 'sqlite' }),
	emailAndPassword: { enabled: true },
	user: {
		// Epic's User has an `image` relation (UserImage); keep Better Auth's column apart.
		fields: { image: 'baImage' },
		additionalFields: { username: { type: 'string', required: true } },
	},
	// Epic owns `Session` and `Verification`; Better Auth's tables sit next to them.
	session: { modelName: 'baSession' },
	account: { modelName: 'baAccount' },
	verification: { modelName: 'baVerification' },
	plugins: [
		jwt(),
		mcp({
			resource: RESOURCE,
			loginPage: '/login',
			consentPage: '/consent',
			// mcp() keeps openid and offline_access out of the PRM's scopes_supported.
			scopes: [
				'openid',
				'offline_access',
				'training:read',
				'training:propose',
				'training:log',
			],
			// Both DCR flags: Claude falls back to DCR when CIMD is not advertised.
			allowDynamicClientRegistration: process.env.DCR !== 'off',
			allowUnauthenticatedClientRegistration: process.env.DCR !== 'off',
			clientRegistrationDefaultApplicationType: 'infer',
			// ACCESS_TTL=120 lets the owner watch Claude refresh within minutes.
			accessTokenExpiresIn: Number(process.env.ACCESS_TTL ?? 3600),
		}),
		cimd({ fetchClientMetadataResource, metadataProfile: 'mcp-2026-07-28' }),
		epicBridge(),
	],
})
