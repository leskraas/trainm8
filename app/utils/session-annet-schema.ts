/**
 * _Tell i Annet_ / _Tell i sporet_ (#505 story 33): the form a row on I dag
 * posts to move a session in or out of Annet, the track that counts in
 * nothing. Shared by the row and its resource route, so the browser and the
 * server refuse the same posts. No server imports.
 */

import { z } from 'zod'

/** Where the row posts (`routes/resources/session-annet.tsx`). */
export const SESSION_ANNET_ACTION = '/resources/session-annet'

export const SessionAnnetSchema = z.object({
	sessionId: z.string().min(1),
	countsInNoTrack: z.enum(['true', 'false']).transform((v) => v === 'true'),
})
