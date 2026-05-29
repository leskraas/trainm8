import { useEffect } from 'react'
import { useRevalidator } from 'react-router'
import { useEventSource } from 'remix-utils/sse/react'

/**
 * Client-side counterpart to `imports-events.server.ts` (#75). The Imports
 * surface opens an `EventSource` to the resource route below; when a new
 * Activity Import lands for the athlete, the server pushes an event and the tab
 * revalidates its loader data so the inbox refreshes without a page reload.
 *
 * These constants are shared by the resource route (server) and the hook
 * (client), so they live in this isomorphic module rather than the `.server`
 * file.
 */

/** Resource route that serves the per-athlete `text/event-stream`. */
export const IMPORTS_EVENTS_PATH = '/resources/imports-events'

/** Named SSE event emitted when a new Activity Import is created. */
export const IMPORT_CREATED_EVENT = 'import-created'

/**
 * Subscribe the current tab to live Activity Import events and revalidate the
 * route's loader data whenever one arrives. `EventSource` auto-reconnects on
 * transient disconnects (browser default), and `useEventSource` closes the
 * stream when the component unmounts.
 */
export function useRevalidateOnImportEvent(): void {
	const lastEvent = useEventSource(IMPORTS_EVENTS_PATH, {
		event: IMPORT_CREATED_EVENT,
	})
	const { revalidate } = useRevalidator()

	useEffect(() => {
		// `null` is the initial "no event yet" value; only revalidate on a real
		// push. Each event carries a fresh payload so repeats still re-trigger.
		if (lastEvent !== null) {
			void revalidate()
		}
	}, [lastEvent, revalidate])
}
