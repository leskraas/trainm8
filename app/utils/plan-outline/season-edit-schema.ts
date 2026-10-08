/**
 * The schemas of the Sesong edits (#505 stories 72–77), each read by its form
 * on the client and by the plan page's action on the server.
 *
 * Every edit is two intents over one shape: the preview
 * (`preview-season-edit`), which writes nothing, and the apply
 * (`apply-season-edit`) the athlete confirms from it. The confirm carries the
 * preview's `digest`, so the edit that lands is the one that was shown
 * (`preview-stale` otherwise). Which edit it is travels as `edit`, and each
 * edit has its own schema, so each form reports its own fields.
 */

import { z } from 'zod'
import { SEASON_EDIT_LABELS } from '#app/utils/labels.ts'
import { PhaseWeeksSchema } from './authoring-schema.ts'
import { RHYTHMS } from './derive.ts'
import { type SeasonEdit, type SeasonEditKind } from './season-edit.ts'

export const SEASON_EDIT_INTENTS = [
	'preview-season-edit',
	'apply-season-edit',
] as const

const shared = {
	intent: z.enum(SEASON_EDIT_INTENTS),
	outlineId: z.string().min(1),
	digest: z.string().min(1).optional(),
}

const required = (message: string) =>
	z.string({ required_error: message }).min(1, message)

/**
 * Blank is "keep what it has": conform reads an empty field as absent, so an
 * optional schema is all a keep-field needs, and its input stays a string.
 */
function blankIsKeep<T extends z.ZodTypeAny>(schema: T) {
	return schema.optional()
}

/**
 * A week target as typed: a number of 0 or more, a decimal comma allowed
 * (`46,5`). Blank is allowed only beside _Tilbake til planens mål_ (`revert`),
 * which hands the week back to the plan's own target.
 */
const TargetField = z
	.string({ required_error: SEASON_EDIT_LABELS.targetRequired })
	.trim()
	.min(1, SEASON_EDIT_LABELS.targetRequired)
	.transform((raw, ctx) => {
		const value = Number(raw.replace(',', '.'))
		if (!Number.isFinite(value) || value < 0) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: SEASON_EDIT_LABELS.targetNumber,
			})
			return z.NEVER
		}
		return value
	})

const confirmedFromPreview = {
	check: (value: { intent: string; digest?: string }) =>
		value.intent !== 'apply-season-edit' || !!value.digest,
	message: { message: SEASON_EDIT_LABELS.previewFirst },
}

export const WeekTargetEditFormSchema = z
	.object({
		...shared,
		edit: z.literal('week-target'),
		weekKey: required(SEASON_EDIT_LABELS.pickWeek),
		trackId: required(SEASON_EDIT_LABELS.pickTrack),
		// Blank only with _Tilbake til planens mål_, which posts `revert`.
		value: blankIsKeep(TargetField),
		revert: z.literal('on').optional(),
	})
	.refine((value) => value.revert === 'on' || value.value != null, {
		message: SEASON_EDIT_LABELS.targetRequired,
		path: ['value'],
	})
	.refine(confirmedFromPreview.check, confirmedFromPreview.message)

export const PhaseEditFormSchema = z
	.object({
		...shared,
		edit: z.literal('phase'),
		phaseId: required(SEASON_EDIT_LABELS.pickPhase),
		name: blankIsKeep(
			z.string().trim().max(60, SEASON_EDIT_LABELS.nameTooLong),
		),
		weeks: blankIsKeep(
			z
				.string()
				.trim()
				.transform((raw, ctx) => {
					const weeks = Number(raw)
					if (!PhaseWeeksSchema.safeParse(weeks).success) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							message: SEASON_EDIT_LABELS.weeksNumber,
						})
						return z.NEVER
					}
					return weeks
				}),
		),
		rhythm: blankIsKeep(z.enum(RHYTHMS)),
		tapers: blankIsKeep(
			z.enum(['yes', 'no']).transform((tapers) => tapers === 'yes'),
		),
	})
	.refine(confirmedFromPreview.check, confirmedFromPreview.message)

export const EasyWeekEditFormSchema = z
	.object({
		...shared,
		edit: z.literal('easy-week'),
		weekKey: required(SEASON_EDIT_LABELS.pickWeek),
	})
	.refine(confirmedFromPreview.check, confirmedFromPreview.message)

export const SEASON_EDIT_FORM_SCHEMAS = {
	'week-target': WeekTargetEditFormSchema,
	phase: PhaseEditFormSchema,
	'easy-week': EasyWeekEditFormSchema,
} as const satisfies Record<SeasonEditKind, z.ZodTypeAny>

export type SeasonEditFormValue = z.output<
	(typeof SEASON_EDIT_FORM_SCHEMAS)[SeasonEditKind]
>

/** The parsed form, as the edit the services take. */
export function seasonEditOf(value: SeasonEditFormValue): SeasonEdit {
	switch (value.edit) {
		case 'week-target':
			return {
				kind: 'week-target',
				trackId: value.trackId,
				weekKey: value.weekKey,
				value: value.revert === 'on' ? null : (value.value ?? null),
			}
		case 'phase':
			return {
				kind: 'phase',
				phaseId: value.phaseId,
				name: value.name ?? null,
				weeks: value.weeks ?? null,
				rhythm: value.rhythm ?? null,
				tapers: value.tapers ?? null,
			}
		case 'easy-week':
			return { kind: 'easy-week', weekKey: value.weekKey }
	}
}
