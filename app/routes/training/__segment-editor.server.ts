/**
 * One endurance segment's two saves (#403, #404, #533): the progression and the
 * Quality Session Mix, parsed with `__segment-editor.tsx`'s schemas. The
 * route's action dispatches to it.
 */

import { parseWithZod } from '@conform-to/zod/v3'
import { data } from 'react-router'
import { SESONG_SEGMENT_LABELS } from '#app/utils/labels.ts'
import {
	EnduranceSegmentSetSchema,
	QualitySessionMixSetSchema,
} from '#app/utils/plan-outline/authoring-schema.ts'
import {
	setEnduranceSegment,
	setQualitySessionMix,
} from '#app/utils/plan-outline/authoring.server.ts'
import { QUALITY_ZONES } from '#app/utils/plan-outline/quality-mix.ts'
import {
	SegmentFormSchema,
	mixFieldName,
	MixFormSchema,
} from './__segment-editor.tsx'

/**
 * Author one endurance segment's progression.
 *
 * The reply carries the `segmentId` it belongs to **and the intent it answers**, so a
 * rejected save reports on the card it was typed into and leaves every other form
 * alone — including the *other* form on its own card, since a segment now carries two
 * (the progression and the mix) and a segment id alone can no longer tell them apart.
 * Success needs no redirect: the loader re-runs, and every figure on the page — the
 * derived weeks, the **Season Span**, the guard — is recomputed from the rows that
 * just changed.
 *
 * This one reports through Conform because it is four numeric fields with per-field
 * errors; the structural edits report a sentence, because a rename has one thing to
 * say. Both are reached through `intent`, so the dispatch reads the same either way.
 */
export async function authorSegmentRates(userId: string, formData: FormData) {
	const submission = parseWithZod(formData, { schema: SegmentFormSchema })
	if (submission.status !== 'success') {
		return data(
			{
				intent: 'set-segment-rates' as const,
				segmentId: String(formData.get('segmentId') ?? ''),
				result: submission.reply(),
			},
			{ status: 400 },
		)
	}

	// The service's own gate, applied here first so a rate outside the storable
	// range reports as a form error rather than throwing (ADR 0044 §8: the routes
	// parse against the same schema the service re-parses).
	const authored = EnduranceSegmentSetSchema.safeParse(submission.value)
	if (!authored.success) {
		return data(
			{
				intent: 'set-segment-rates' as const,
				segmentId: submission.value.segmentId,
				result: submission.reply({
					formErrors: authored.error.issues.map((issue) => issue.message),
				}),
			},
			{ status: 400 },
		)
	}

	const saved = await setEnduranceSegment(userId, authored.data)
	if (!saved.ok) {
		return data(
			{
				intent: 'set-segment-rates' as const,
				segmentId: submission.value.segmentId,
				result: submission.reply({
					formErrors: [SESONG_SEGMENT_LABELS.gone],
				}),
			},
			{ status: 400 },
		)
	}

	return {
		intent: 'set-segment-rates' as const,
		segmentId: submission.value.segmentId,
		result: submission.reply(),
	}
}

/**
 * Author one endurance segment's **Quality Session Mix**.
 *
 * Three fields in, a multiset out: the counts that are blank or `0` are **dropped**
 * rather than stored as zeros, because the mix holds the zones that are *in* it and
 * `QualitySessionMixSetSchema` takes at least one session per entry. Dropping every
 * one of them is a legitimate save — the empty mix, "no quality sessions in this
 * segment" (ADR 0042 §6) — and never a no-op.
 *
 * Nothing derived is written. The **Quality Session Count** and the emphasis label
 * are read back off these rows on the next load (ADR 0042 §4–§5), which is what keeps
 * a segment from being named for work it does not contain.
 *
 * Same reply shape as `authorSegmentRates`, keyed by intent *and* `segmentId`.
 */
export async function authorQualityMix(userId: string, formData: FormData) {
	const submission = parseWithZod(formData, { schema: MixFormSchema })
	if (submission.status !== 'success') {
		return data(
			{
				intent: 'set-quality-mix' as const,
				segmentId: String(formData.get('segmentId') ?? ''),
				result: submission.reply(),
			},
			{ status: 400 },
		)
	}

	const entries = QUALITY_ZONES.flatMap((zone) => {
		const sessionsPerWeek = submission.value[mixFieldName(zone)]
		return sessionsPerWeek == null || sessionsPerWeek === 0
			? []
			: [{ zone, sessionsPerWeek }]
	})

	// The storage schema, applied at the boundary for the reason `authorSegmentRates`
	// gives: a count outside the storable range reads as a sentence on the form rather
	// than as a throw from the service that re-parses it (ADR 0044 §8).
	const authored = QualitySessionMixSetSchema.safeParse({
		segmentId: submission.value.segmentId,
		entries,
	})
	if (!authored.success) {
		return data(
			{
				intent: 'set-quality-mix' as const,
				segmentId: submission.value.segmentId,
				result: submission.reply({
					formErrors: authored.error.issues.map((issue) => issue.message),
				}),
			},
			{ status: 400 },
		)
	}

	const saved = await setQualitySessionMix(userId, authored.data)
	if (!saved.ok) {
		return data(
			{
				intent: 'set-quality-mix' as const,
				segmentId: submission.value.segmentId,
				result: submission.reply({
					formErrors: [SESONG_SEGMENT_LABELS.gone],
				}),
			},
			{ status: 400 },
		)
	}

	return {
		intent: 'set-quality-mix' as const,
		segmentId: submission.value.segmentId,
		result: submission.reply(),
	}
}
