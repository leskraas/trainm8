/**
 * Refusals as typed values (ADR 0092 §5). An action's `run` returns
 * `refuse(code)` instead of a value when nothing happened and the same call
 * will not succeed; `runAction` turns it into the `refused` envelope with the
 * code's fixed `next` and the athlete's words. A refusal is never thrown.
 */

import { REFUSAL_LABELS } from '#app/utils/labels.ts'
import { REFUSALS, type Next, type RefusalCode } from './vocabulary.ts'

export { REFUSALS, type RefusalCode } from './vocabulary.ts'

/** What `run` returns to refuse. Built only by {@link refuse}. */
export class Refusal<C extends RefusalCode = RefusalCode> {
	readonly code: C
	readonly message: string
	readonly link: string | undefined
	constructor(code: C, message: string, link: string | undefined) {
		this.code = code
		this.message = message
		this.link = link
	}
}

/**
 * Refuse with `code`. `message` defaults to `REFUSAL_LABELS[code]`; an action
 * passes its domain's own sentence where it has one (the same words the route
 * showed before the registry). `link` is a deep link into trainm8 where the
 * athlete can act, which `needs-athlete-yes` always carries (ADR 0093 §3).
 */
export function refuse<C extends RefusalCode>(
	code: C,
	{ message, link }: { message?: string; link?: string } = {},
): Refusal<C> {
	return new Refusal(code, message ?? REFUSAL_LABELS[code], link)
}

export function nextOf(code: RefusalCode): Next {
	return REFUSALS[code]
}
