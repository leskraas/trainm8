import { getAthleteTimezone } from '#app/utils/athlete.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import {
	type Capability,
	type CapabilityCtx,
	type CapabilityResult,
} from './define.ts'
import { READ_CAPABILITIES } from './reads.server.ts'
import { SESSION_CAPABILITIES } from './sessions.server.ts'
import { SETUP_CAPABILITIES } from './setup.server.ts'

const CAPABILITIES = {
	...READ_CAPABILITIES,
	...SETUP_CAPABILITIES,
	...SESSION_CAPABILITIES,
}

export type CapabilityName = keyof typeof CAPABILITIES
type Caps = typeof CAPABILITIES
export type CapabilityInput<N extends CapabilityName> =
	Caps[N] extends Capability<infer I, any> ? import('zod/v4').input<I> : never
export type CapabilityOutput<N extends CapabilityName> =
	Caps[N] extends Capability<any, infer O> ? O : never

export function isCapabilityName(name: string): name is CapabilityName {
	return Object.hasOwn(CAPABILITIES, name)
}

export function listCapabilities() {
	return Object.values(CAPABILITIES as Record<string, Capability<any, any>>)
}

export async function capabilityCtx(request: Request): Promise<CapabilityCtx> {
	const userId = await requireUserId(request)
	return {
		userId,
		now: new Date(),
		timezone: await getAthleteTimezone(userId),
		origin: new URL(request.url).origin,
		request,
	}
}

/**
 * Runs one capability for the signed-in athlete (redirects to login
 * otherwise). Validates the input; never throws for a refused or invalid
 * call, only for an unknown name.
 */
export async function runCapability<N extends CapabilityName>(
	request: Request,
	name: N,
	input: CapabilityInput<N>,
): Promise<CapabilityResult<CapabilityOutput<N>>> {
	const cap = (CAPABILITIES as Record<string, Capability<any, any>>)[name]
	if (!cap) throw new Error(`No capability is called "${name}".`)
	const parsed = cap.input.safeParse(input)
	if (!parsed.success) {
		return {
			ok: false,
			code: 'invalid-input',
			message: 'Noe i det du sendte stemmer ikke.',
		}
	}
	const ctx = await capabilityCtx(request)
	return cap.run(ctx, parsed.data) as Promise<
		CapabilityResult<CapabilityOutput<N>>
	>
}
