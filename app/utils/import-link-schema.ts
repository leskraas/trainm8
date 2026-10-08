/**
 * The forms an import's row on I dag posts (#505 stories 80–82): the answers
 * to "hva var dette?", _Angre kobling_ / _Koble igjen_, and _Gjort_. Shared by
 * the row's conform forms and their resource routes, so the browser and the
 * server refuse the same posts. No server imports: the row validates with it
 * too.
 */

import { z } from 'zod'

/** Where an import's answers post (`routes/resources/import-link.tsx`). */
export const IMPORT_LINK_ACTION = '/resources/import-link'
/** Where _Gjort_ posts (`routes/resources/session-done.tsx`). */
export const SESSION_DONE_ACTION = '/resources/session-done'

/** Why the server turned an import answer down. */
export const IMPORT_LINK_REFUSALS = [
	'import-not-found',
	'session-not-found',
	'not-a-fit',
	'not-linked',
	'nothing-to-relink',
] as const
export type ImportLinkRefusal = (typeof IMPORT_LINK_REFUSALS)[number]

/** Why the server turned _Gjort_ down. */
export const MARK_DONE_REFUSALS = ['session-not-found', 'not-markable'] as const
export type MarkDoneRefusal = (typeof MARK_DONE_REFUSALS)[number]

const ImportId = z.string().min(1)

/**
 * One post per tap. `link` names the planned session it was; `keep` and
 * `annet` are the other two answers to "hva var dette?"; `undo` and `relink`
 * are _Angre kobling_ and _Koble igjen_.
 */
export const ImportLinkActionSchema = z.discriminatedUnion('intent', [
	z.object({
		intent: z.literal('link'),
		importId: ImportId,
		sessionId: z.string().min(1),
	}),
	z.object({ intent: z.literal('keep'), importId: ImportId }),
	z.object({ intent: z.literal('annet'), importId: ImportId }),
	z.object({ intent: z.literal('undo'), importId: ImportId }),
	z.object({ intent: z.literal('relink'), importId: ImportId }),
])
export type ImportLinkAction = z.infer<typeof ImportLinkActionSchema>

/** _Gjort_ on a session done by hand. */
export const SessionDoneSchema = z.object({ sessionId: z.string().min(1) })
