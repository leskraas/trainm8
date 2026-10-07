/**
 * The one schema of _Bytt filosofi_ (#505 stories 12–14), read by the plan
 * page's form on the client and by its action on the server. Two intents over
 * one shape: the preview (`preview-philosophy`), which writes nothing, and the
 * switch (`switch-philosophy`) the athlete confirms from it. The family is one
 * of the shipped ones or nothing — a family the app never shipped is refused
 * here, before the service sees it.
 */

import { z } from 'zod'
import { PHILOSOPHY_SWITCH_LABELS } from '#app/utils/labels.ts'
import { PRESET_FAMILIES } from './presets.ts'

export const PHILOSOPHY_INTENTS = [
	'preview-philosophy',
	'switch-philosophy',
] as const

export const PhilosophySwitchFormSchema = z.object({
	intent: z.enum(PHILOSOPHY_INTENTS),
	outlineId: z.string().min(1),
	family: z.enum(PRESET_FAMILIES, {
		errorMap: () => ({ message: PHILOSOPHY_SWITCH_LABELS.pickOne }),
	}),
})
