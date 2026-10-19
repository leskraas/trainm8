// What the two day-choice surfaces share (ADR 0104 §4): the strength days in
// _Meg → Trening → Styrke_ (#597) and every other track's days under
// _Plan → Avansert_ (#598). Each previews a choice, writes it, and offers
// _Angre_ on the toast (ADR 0088); the words and the payloads are their own.

import { useEffect, useRef } from 'react'

/** `'auto'` or the chosen days, Monday first, as one comparable key. */
export function dayChoiceKey(
	mode: 'auto' | 'own',
	chosen: readonly number[],
): string {
	return mode === 'auto' ? 'auto' : [...chosen].sort().join(',')
}

/**
 * A route action's reply as the fetcher reads it: the payload of a `data()`
 * reply, or the plain object an action returns.
 */
export type ReplyDataOf<Action extends (...args: never[]) => unknown> =
	Awaited<ReturnType<Action>> extends infer R
		? R extends { data: infer D }
			? D
			: R
		: never

/**
 * Run `show` once for each new `value` — a write or an undo the server
 * answered — and never again for the same one, however often the surface
 * renders. How each toast is said once (ADR 0088).
 */
export function useOncePer<T>(
	value: T | null | undefined,
	show: (value: T) => void,
) {
	const shown = useRef<unknown>(null)
	useEffect(() => {
		if (value == null || shown.current === value) return
		shown.current = value
		show(value)
	}, [value, show])
}
