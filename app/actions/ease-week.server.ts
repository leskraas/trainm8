import { z } from 'zod/v4'
import {
	ACTION_TITLE_LABELS,
	WEEK_CHANGE_REFUSAL_LABELS,
} from '#app/utils/labels.ts'
import { easeWeek } from '#app/utils/load/week-replan-answers.server.ts'
import { VOLUME_CURRENCIES } from '#app/utils/plan-outline/derive.ts'
import { defineAction } from './define.ts'
import { refuse } from './refusals.ts'

/** A week's Planned Volume per track (`week-replan-proposal.ts`' WeekVolume). */
const WeekVolumeSchema = z.object({
	tracks: z.array(
		z.object({
			trackId: z.string(),
			discipline: z.string(),
			currency: z.enum(VOLUME_CURRENCIES),
			planned: z.number().nullable(),
		}),
	),
})

/**
 * "Gjør uka lettere −15 %" (#505 story 51): the athlete's own tap, which is its
 * own yes, so `web` only (ADR 0093 §3). Its numbers never reach a model, so
 * its output is the service's own shape rather than Readings.
 */
export const easeWeekAction = defineAction({
	name: 'ease_week',
	revision: 1,
	kind: 'write',
	callers: ['web'],
	title: ACTION_TITLE_LABELS.ease_week,
	description:
		'Make the coming week 15 % easier. Only the athlete can, in trainm8.',
	input: z.object({ weekKey: z.string().min(1) }),
	output: z.object({
		proposalId: z.string(),
		sessionsChanged: z.number(),
		before: WeekVolumeSchema,
		after: WeekVolumeSchema,
	}),
	async run(ctx, input) {
		const result = await easeWeek(ctx.userId, input.weekKey, ctx.now)
		if (!result.ok) {
			return refuse(result.reason, {
				message: WEEK_CHANGE_REFUSAL_LABELS[result.reason],
			})
		}
		const { ok: _ok, ...value } = result
		return value
	},
})
