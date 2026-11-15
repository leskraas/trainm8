import { type CapabilityResult } from '#app/lab/engine/define.ts'
import { runCapability } from '#app/lab/engine/registry.server.ts'

/** Calls one capability and types its answer. */
export async function run<O>(
	request: Request,
	name: string,
	input: unknown = {},
): Promise<CapabilityResult<O>> {
	const result = (await runCapability(
		request,
		name as never,
		input as never,
	)) as unknown
	return result as CapabilityResult<O>
}

/** The value, or null when the read failed (the caller says so honestly). */
export function valueOr<O>(r: CapabilityResult<O>): O | null {
	return r.ok ? r.value : null
}

export function errorOf<O>(r: CapabilityResult<O>): string | null {
	return r.ok ? null : r.message
}

/** Per-viewer onboarding flags kept in a cookie, so the server knows them too. */
export type OnboardingFlags = {
	u: string
	hoursSkipped?: boolean
	strengthAnswered?: boolean
	connectSkipped?: boolean
	goalOpen?: boolean
}

export function readFlags(request: Request, username: string): OnboardingFlags {
	const header = request.headers.get('cookie') ?? ''
	const match = /(?:^|;\s*)prat_onb=([^;]+)/.exec(header)
	if (!match?.[1]) return { u: username }
	try {
		const parsed = JSON.parse(decodeURIComponent(match[1])) as OnboardingFlags
		if (parsed.u !== username) return { u: username }
		return parsed
	} catch {
		return { u: username }
	}
}
