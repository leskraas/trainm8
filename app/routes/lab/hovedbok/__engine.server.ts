import { type CapabilityResult } from '#app/lab/engine/define.ts'
import { type SessionCard } from '#app/lab/engine/reads.types.ts'
import { runCapability } from '#app/lab/engine/registry.server.ts'
import { addDays } from './__format.ts'

/** Calls a capability and types its answer. */
export async function cap<O>(
	request: Request,
	name: string,
	input: unknown = {},
): Promise<CapabilityResult<O>> {
	return (await runCapability(
		request,
		name as never,
		input as never,
	)) as CapabilityResult<O>
}

/**
 * Every session between two days, however many pages and however many
 * 366-day windows it takes. Fails with the first failing page's message.
 */
export async function allSessions(
	request: Request,
	from: string,
	to: string,
	demo = false,
): Promise<CapabilityResult<SessionCard[]>> {
	const out: SessionCard[] = []
	let start = from
	while (start <= to) {
		const end = [addDays(start, 365), to].sort()[0]!
		let cursor: string | undefined
		for (let page = 0; page < 40; page++) {
			const r = await cap<{
				sessions: SessionCard[]
				nextCursor: string | null
			}>(request, 'sessions', {
				from: start,
				to: end,
				limit: 100,
				...(cursor ? { cursor } : {}),
				...(demo ? { demo: true } : {}),
			})
			if (!r.ok) return r
			out.push(...r.value.sessions)
			if (!r.value.nextCursor) break
			cursor = r.value.nextCursor
		}
		start = addDays(end, 1)
	}
	return { ok: true, value: out }
}
