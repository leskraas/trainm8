import { EventEmitter } from 'node:events'
import { remember } from '@epic-web/remember'

/**
 * In-process publisher for "a new Activity Import landed" events (#75).
 *
 * Server-Sent Events push these to the athlete's open Imports tabs so the inbox
 * refreshes live. SSE was chosen over a bidirectional socket because we only
 * need unidirectional server→browser push, session-cookie auth comes for free
 * with same-origin `EventSource`, and there is no extra dependency or sticky
 * session requirement (ADR 0013 / issue #75).
 *
 * The emitter is keyed per athlete: each event name is an `athleteId`, so a
 * subscriber for athlete A never observes athlete B's inserts. Emitting for an
 * athlete with no open tabs is a harmless no-op.
 *
 * This is a single-process publisher. It is the right shape for the current
 * single-machine deployment; a multi-instance future would swap the emitter for
 * a shared transport (e.g. Postgres LISTEN/NOTIFY or Redis pub/sub) behind the
 * same `publish` / `subscribe` surface.
 */

const emitter = remember('imports-event-emitter', () => {
	const instance = new EventEmitter()
	// One listener per open tab; lift the default ceiling so a busy athlete with
	// many tabs does not trip Node's max-listeners leak warning.
	instance.setMaxListeners(0)
	return instance
})

/** Notify the owning athlete's open tabs that a new Activity Import was created. */
export function publishActivityImportCreated(athleteId: string): void {
	emitter.emit(athleteId)
}

/**
 * Subscribe to "Activity Import created" events for a single athlete. Returns an
 * unsubscribe function that detaches the listener — call it when the SSE stream
 * closes so the emitter does not retain listeners for disconnected tabs.
 */
export function subscribeActivityImportCreated(
	athleteId: string,
	listener: () => void,
): () => void {
	emitter.on(athleteId, listener)
	return () => {
		emitter.off(athleteId, listener)
	}
}
