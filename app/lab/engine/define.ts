/**
 * The **Lab Engine** (ADR 0125): every job an athlete can do, as one named
 * capability with a zod input and a plain JSON output. Lab Apps call nothing
 * else: server-side through `runCapability` in their loaders and actions, and
 * from the browser through `/lab/api/<name>` (`useCapability`).
 *
 * The engine is where the knowledge of trainm8's existing domain lives. The
 * apps know only the contract (`docs/lab/capabilities/`), so each can design
 * its journey from nothing.
 */
import { type z } from 'zod/v4'

export type CapabilityCtx = {
	userId: string
	now: Date
	/** The Athlete Timezone. */
	timezone: string
	/** The origin the request reached, for absolute links. */
	origin: string
	/** The raw request, for the few capabilities that need it (file upload). */
	request: Request
}

export type CapabilityResult<O> =
	| { ok: true; value: O }
	| {
			ok: false
			/** Machine-readable, stable. */
			code: string
			/** Norwegian, safe to show the athlete. */
			message: string
	  }

export type Capability<I extends z.ZodType, O> = {
	name: string
	/** `read` never writes; `write` may. Reads are also served over GET. */
	kind: 'read' | 'write'
	/** One or two sentences, in product terms. */
	description: string
	input: I
	run: (ctx: CapabilityCtx, input: z.output<I>) => Promise<CapabilityResult<O>>
}

export function defineCapability<I extends z.ZodType, O>(
	c: Capability<I, O>,
): Capability<I, O> {
	return c
}

export function ok<O>(value: O): CapabilityResult<O> {
	return { ok: true, value }
}

export function fail(code: string, message: string): CapabilityResult<never> {
	return { ok: false, code, message }
}
