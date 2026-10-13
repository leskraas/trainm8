/**
 * The schemas of _Bytt filosofi_ and of the strength offer (#505 stories
 * 12–15), each read by its form on the client and by the plan page's action
 * on the server.
 *
 * _Bytt filosofi_ is two intents over one shape: the preview
 * (`preview-philosophy`), which writes nothing, and the switch
 * (`switch-philosophy`) the athlete confirms from it. The confirm carries the
 * preview's `digest`, so the switch that lands is the one that was shown
 * (`preview-stale` otherwise). The family is one of the shipped ones or
 * nothing — a family the app never shipped is refused here, before the
 * service sees it.
 */

import { z } from 'zod/v3'
import { PHILOSOPHY_SWITCH_LABELS } from '#app/utils/labels.ts'
import { PRESET_FAMILIES } from './presets.ts'

export const PHILOSOPHY_INTENTS = [
	'preview-philosophy',
	'switch-philosophy',
] as const

export const PhilosophySwitchFormSchema = z
	.object({
		intent: z.enum(PHILOSOPHY_INTENTS),
		outlineId: z.string().min(1),
		family: z.enum(PRESET_FAMILIES, {
			errorMap: () => ({ message: PHILOSOPHY_SWITCH_LABELS.pickOne }),
		}),
		digest: z.string().min(1).optional(),
	})
	.refine((value) => value.intent !== 'switch-philosophy' || !!value.digest, {
		message: PHILOSOPHY_SWITCH_LABELS.previewFirst,
	})

/** Accepting the strength track the athlete's history proposes. */
export const StrengthOfferFormSchema = z.object({
	intent: z.literal('add-strength-track'),
	outlineId: z.string().min(1),
})
