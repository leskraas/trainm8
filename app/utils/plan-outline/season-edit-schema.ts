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

import { z } from 'zod/v3'
import {
	SEASON_ANCHOR_EDIT_LABELS,
	SEASON_EDIT_LABELS,
} from '#app/utils/labels.ts'
import { PhaseWeeksSchema, WeekKeySchema } from './authoring-schema.ts'
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

/**
 * A Season Anchor as typed (#673): a number over 0 — an anchor of 0 would make
 * every week after it 0, which is a week off per week, not a level — with a
 * decimal comma allowed.
 */
const AnchorValueField = z
	.string()
	.trim()
	.transform((raw, ctx) => {
		const value = Number(raw.replace(',', '.'))
		if (!Number.isFinite(value) || value <= 0) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: SEASON_ANCHOR_EDIT_LABELS.valuePositive,
			})
			return z.NEVER
		}
		return value
	})

/**
 * A segment's week as posted: a week key, so a Monday (ADR 0044 §3), the rule
 * the direct anchor editor's schemas hold too. Any other day would round into
 * a week and key a second segment beside the one on its Monday.
 */
const AnchorWeekField = z
	.string()
	.refine(
		(key) => WeekKeySchema.safeParse(key).success,
		SEASON_EDIT_LABELS.pickWeek,
	)

export const SEASON_ANCHOR_ACTIONS = ['add', 'set', 'remove'] as const

/**
 * _Endre startnivået_ (ADR 0117 §1): one form, three acts. Each act has its own
 * week picker (and the two that take one, their own number), all posted, so
 * switching between the acts keeps what each one was given; the act chosen
 * decides which are read.
 */
export const SeasonAnchorEditFormSchema = z
	.object({
		...shared,
		edit: z.literal('season-anchor'),
		trackId: required(SEASON_EDIT_LABELS.pickTrack),
		action: z.enum(SEASON_ANCHOR_ACTIONS),
		addWeekKey: blankIsKeep(AnchorWeekField),
		addValue: blankIsKeep(AnchorValueField),
		setWeekKey: blankIsKeep(AnchorWeekField),
		setValue: blankIsKeep(AnchorValueField),
		removeWeekKey: blankIsKeep(AnchorWeekField),
	})
	.superRefine((value, ctx) => {
		const missing = (path: string, message: string) =>
			ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message })
		if (value.action === 'add') {
			if (!value.addWeekKey) missing('addWeekKey', SEASON_EDIT_LABELS.pickWeek)
			if (value.addValue == null) {
				missing('addValue', SEASON_ANCHOR_EDIT_LABELS.valueRequired)
			}
		}
		if (value.action === 'set') {
			if (!value.setWeekKey) {
				missing('setWeekKey', SEASON_ANCHOR_EDIT_LABELS.pickSegment)
			}
			if (value.setValue == null) {
				missing('setValue', SEASON_ANCHOR_EDIT_LABELS.valueRequired)
			}
		}
		if (value.action === 'remove' && !value.removeWeekKey) {
			missing('removeWeekKey', SEASON_ANCHOR_EDIT_LABELS.pickSegment)
		}
	})
	.refine(confirmedFromPreview.check, confirmedFromPreview.message)

export const SEASON_EDIT_FORM_SCHEMAS = {
	'season-anchor': SeasonAnchorEditFormSchema,
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
		case 'season-anchor':
			// The schema has required the act's own fields.
			return value.action === 'remove'
				? {
						kind: 'season-anchor',
						trackId: value.trackId,
						action: 'remove',
						fromWeekKey: value.removeWeekKey!,
					}
				: {
						kind: 'season-anchor',
						trackId: value.trackId,
						action: value.action,
						fromWeekKey:
							(value.action === 'add' ? value.addWeekKey : value.setWeekKey) ??
							'',
						value:
							(value.action === 'add' ? value.addValue : value.setValue) ?? 0,
					}
	}
}
