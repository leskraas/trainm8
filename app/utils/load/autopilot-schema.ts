/**
 * The forms of the Autopilot (#576, ADR 0100): _Angre_ and _Angre alt_ on the
 * Autopilot Notice, and the switch in Meg. Shared by the forms and their
 * resource route (`routes/resources/autopilot.tsx`), so the browser and the
 * server refuse the same posts. No server imports.
 */

import { z } from 'zod/v3'
import { WeekKeySchema } from '#app/utils/calendar-key-schema.ts'

/** Where every autopilot post goes. */
export const AUTOPILOT_ACTION = '/resources/autopilot'

/** The two modes as the switch posts them: on, or _Spør meg først_. */
export const AUTOPILOT_MODES = ['autopilot', 'ask'] as const
export type AutopilotMode = (typeof AUTOPILOT_MODES)[number]

export const AutopilotActionSchema = z.discriminatedUnion('intent', [
	z.object({ intent: z.literal('undo'), proposalId: z.string().min(1) }),
	/** _Angre alt_: every change of the week that closed on `weekKey`. */
	z.object({ intent: z.literal('undo-week'), weekKey: WeekKeySchema }),
	z.object({ intent: z.literal('mode'), mode: z.enum(AUTOPILOT_MODES) }),
])
export type AutopilotAction = z.infer<typeof AutopilotActionSchema>
