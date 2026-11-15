import { useCallback, useState } from 'react'
import { useRevalidator } from 'react-router'
import { type CapabilityResult } from './define.ts'

/**
 * Calls a Lab Engine capability from the browser (ADR 0125) and revalidates
 * the page's loaders after a successful write, so what the app shows is what
 * the engine now holds.
 *
 * ```ts
 * const move = useCapability<MoveInput, MoveOutput>('move_session')
 * await move.call({ sessionId, date: '2026-11-18' })
 * ```
 */
export function useCapability<I, O>(name: string) {
	const revalidator = useRevalidator()
	const [pending, setPending] = useState(false)
	const [result, setResult] = useState<CapabilityResult<O> | null>(null)

	const call = useCallback(
		async (input: I, opts: { revalidate?: boolean } = {}) => {
			setPending(true)
			try {
				const res = await fetch(`/lab/api/${name}`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(input ?? {}),
				})
				const json = (await res.json()) as CapabilityResult<O>
				setResult(json)
				if (json.ok && opts.revalidate !== false) {
					void revalidator.revalidate()
				}
				return json
			} catch {
				const json: CapabilityResult<O> = {
					ok: false,
					code: 'network',
					message: 'Fikk ikke kontakt. Prøv igjen.',
				}
				setResult(json)
				return json
			} finally {
				setPending(false)
			}
		},
		[name, revalidator],
	)

	return { call, pending, result }
}

/** Uploads a file to a capability that takes multipart form data. */
export async function uploadToCapability<O>(
	name: string,
	form: FormData,
): Promise<CapabilityResult<O>> {
	const res = await fetch(`/lab/api/${name}`, { method: 'POST', body: form })
	return (await res.json()) as CapabilityResult<O>
}
