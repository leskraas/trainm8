import { passkey } from '@better-auth/passkey'
import { prismaAdapter } from '@better-auth/prisma-adapter'
import { type BetterAuthOptions } from 'better-auth'
import { admin, emailOTP, twoFactor, username } from 'better-auth/plugins'
import { prisma } from '../db.server.ts'
import { sendEmail } from '../email.server.ts'
import { getAppOrigin } from './app-origin.server.ts'
import { hashPassword, verifyPassword } from './password-hash.server.ts'

/**
 * Better Auth's configuration, as plain options (ADR 0094 §1–§2, ADR 0113).
 * Importing this file constructs nothing: the export test and the generate
 * test read it, and only `better-auth.server.ts` turns it into `auth`.
 *
 * Better Auth's "account" is a **Sign-in Method** and its "session" a
 * **Sign-in Session** (`GLOSSARY.md`), never an **Account Connection** or a
 * **Workout Session**; the model names keep them apart from both, and from
 * Epic's `Session`, `Verification` and `Passkey`.
 *
 * Sign-up is closed on every path from the start (ADR 0113 §4), and the
 * email copy below is a placeholder until #554 ships the athlete-facing flows.
 */
const appOrigin = getAppOrigin()

const githubClientId = process.env.GITHUB_CLIENT_ID
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET

async function sendCode({
	email,
	otp,
	subject,
}: {
	email: string
	otp: string
	subject: string
}) {
	const text = `Koden din er ${otp}. Den gjelder i fem minutter.`
	await sendEmail({ to: email, subject, text, html: `<p>${text}</p>` })
}

export const authOptions = {
	appName: 'trainm8',
	baseURL: appOrigin,
	basePath: '/api/auth',
	secret: process.env.BETTER_AUTH_SECRET,
	trustedOrigins: [appOrigin],
	database: prismaAdapter(prisma, { provider: 'sqlite' }),
	advanced: {
		// Spelled out so tests run the same check production does (ADR 0113 §2).
		disableOriginCheck: false,
	},
	user: {
		fields: { image: 'imageUrl' },
		additionalFields: {
			// Set by the cutover for every athlete with Epic 2FA (ADR 0094 §3).
			// `input: false`: no sign-up or update-user body can clear it.
			mustReenrolTwoFactor: {
				type: 'boolean',
				defaultValue: false,
				required: false,
				input: false,
			},
		},
	},
	session: { modelName: 'authSession' },
	account: { modelName: 'authAccount' },
	verification: { modelName: 'authVerification' },
	emailAndPassword: {
		enabled: true,
		disableSignUp: true,
		password: { hash: hashPassword, verify: verifyPassword },
		sendResetPassword: async ({ user, url }) => {
			const text = `Tilbakestill passordet ditt: ${url}`
			await sendEmail({
				to: user.email,
				subject: 'Tilbakestill passordet',
				text,
				html: `<p>${text}</p>`,
			})
		},
	},
	socialProviders:
		githubClientId && githubClientSecret
			? {
					github: {
						clientId: githubClientId,
						clientSecret: githubClientSecret,
						redirectURI: process.env.GITHUB_REDIRECT_URI,
						disableImplicitSignUp: true,
					},
				}
			: {},
	plugins: [
		username(),
		emailOTP({
			disableSignUp: true,
			otpLength: 6,
			expiresIn: 300,
			allowedAttempts: 3,
			storeOTP: 'hashed',
			sendVerificationOTP: ({ email, otp }) =>
				sendCode({ email, otp, subject: 'Koden din' }),
		}),
		twoFactor({
			issuer: 'trainm8',
			otpOptions: {
				sendOTP: ({ user, otp }) =>
					sendCode({ email: user.email, otp, subject: 'Koden din' }),
			},
		}),
		passkey({
			rpID: new URL(appOrigin).hostname,
			rpName: new URL(appOrigin).hostname,
			origin: appOrigin,
			schema: { passkey: { modelName: 'authPasskey' } },
		}),
		admin(),
	],
} satisfies BetterAuthOptions
