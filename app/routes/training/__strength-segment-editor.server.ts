/**
 * The strength track's dated blocks (#409, #533): the action behind
 * `__strength-segment-editor.tsx`, which the route's action dispatches to.
 */

import { parseWithZod } from '@conform-to/zod/v3'
import { data } from 'react-router'
import { SESONG_REFUSAL_LABELS } from '#app/utils/labels.ts'
import {
	StrengthSegmentAddSchema,
	StrengthSegmentSetSchema,
} from '#app/utils/plan-outline/authoring-schema.ts'
import {
	addStrengthSegment,
	removeStrengthSegment,
	setStrengthSegment,
	type StrengthSegmentRefusal,
} from '#app/utils/plan-outline/authoring.server.ts'
import {
	IdField,
	TRACK_GONE,
	WEEK_NOT_ONE_OF_THE_PLANS,
	refuse,
	issueMessages,
} from './__plan-action.server.ts'
import { StrengthSegmentFormSchema } from './__strength-segment-editor.tsx'

const BLOCK_GONE = SESONG_REFUSAL_LABELS.blockGone

/**
 * One strength segment service result, worded. A third pair beside `report` and
 * `reportPattern`, because the three refusal unions are three vocabularies — a
 * lifting block refuses over a *window*, which neither a phase nor a pattern has —
 * and typing the map to the union makes a refusal added later a compile error here
 * rather than a silent catch-all.
 */
function reportStrength(
	result: { ok: true } | { ok: false; reason: StrengthSegmentRefusal },
) {
	if (result.ok) return { ok: true as const }
	return refuse(strengthRefusalMessage(result.reason))
}

/**
 * Each way a lifting block can be refused, as a sentence about the plan.
 *
 * The four placement refusals are worded as facts about the **window** the athlete
 * drew, and each names the edit that resolves it: a block is start-plus-length, so
 * every collision has two ways out and saying only "invalid" would hide both. None
 * of them is a safety claim and none is about volume — the guard warns about that
 * separately and never blocks (ADR 0047 §1).
 */
function strengthRefusalMessage(reason: StrengthSegmentRefusal): string {
	switch (reason) {
		case 'track-not-found':
			return TRACK_GONE
		case 'not-a-strength-track':
			// Not an absence: the track is theirs and it is an endurance one. Said as
			// the domain rule, because the rule is the reason — an endurance track's
			// segments span its phases 1:1 and are authored on the phase cards above.
			return SESONG_REFUSAL_LABELS.notStrengthTrack
		case 'segment-not-found':
			return BLOCK_GONE
		case 'start-week-outside-the-plan':
			return WEEK_NOT_ONE_OF_THE_PLANS
		case 'segment-runs-past-the-plan':
			return SESONG_REFUSAL_LABELS.segmentPastPlan
		case 'week-already-opens-a-segment':
			return SESONG_REFUSAL_LABELS.weekOpensSegment
		case 'segments-overlap':
			return SESONG_REFUSAL_LABELS.segmentsOverlap
	}
}

/**
 * Author one lifting block — added or re-authored, which is the same eight fields
 * either way (ADR 0047 §6: a moved block and a resized one are one action on
 * start-plus-length).
 *
 * **Whole, every time.** `StrengthSegmentSetSchema` rewrites every column including
 * the nulls, because `null` is the athlete choosing the documented convention and
 * clearing an authored number back to it has to be expressible (ADR 0044 §4).
 *
 * Reported through Conform, like the two endurance forms and for the same reason —
 * eight fields with per-field errors. The reply carries the intent **and** both
 * handles, so it lands on the one card or the one add form it answers and leaves
 * every sibling alone.
 */
async function authorStrengthSegment(
	userId: string,
	formData: FormData,
	mode: 'add' | 'set',
) {
	const intent =
		mode === 'add'
			? ('add-strength-segment' as const)
			: ('set-strength-segment' as const)
	const trackId = String(formData.get('trackId') ?? '')
	const segmentId = String(formData.get('segmentId') ?? '')
	// A missing handle is a stale page rather than a typed value, so it is a
	// sentence at the top of the reading and not a field error on a form the row
	// behind it no longer has.
	if (mode === 'add' && trackId === '') return refuse(TRACK_GONE)
	if (mode === 'set' && segmentId === '') return refuse(BLOCK_GONE)

	const submission = parseWithZod(formData, {
		schema: StrengthSegmentFormSchema,
	})
	if (submission.status !== 'success') {
		return data(
			{ intent, trackId, segmentId, result: submission.reply() },
			{ status: 400 },
		)
	}
	const value = submission.value

	function formErrors(messages: string[]) {
		return data(
			{
				intent,
				trackId,
				segmentId,
				result: submission.reply({ formErrors: messages }),
			},
			{ status: 400 },
		)
	}

	// The service's own gate, applied here first for `authorSegmentRates`' reason: a
	// value outside the storable range reads as a sentence on the form rather than
	// as a throw from the service that re-parses it (ADR 0044 §8).
	if (mode === 'add') {
		const authored = StrengthSegmentAddSchema.safeParse({ trackId, ...value })
		if (!authored.success) return formErrors(issueMessages(authored.error))
		const saved = await addStrengthSegment(userId, authored.data)
		if (!saved.ok) return formErrors([strengthRefusalMessage(saved.reason)])
	} else {
		const authored = StrengthSegmentSetSchema.safeParse({ segmentId, ...value })
		if (!authored.success) return formErrors(issueMessages(authored.error))
		const saved = await setStrengthSegment(userId, authored.data)
		if (!saved.ok) return formErrors([strengthRefusalMessage(saved.reason)])
	}

	return { intent, trackId, segmentId, result: submission.reply() }
}

/** The lifting blocks' intents, which the route's action hands here. */
export type StrengthSegmentIntent =
	| 'add-strength-segment'
	| 'set-strength-segment'
	| 'remove-strength-segment'

/** One dated lifting block added, re-authored or removed. */
export async function strengthSegmentAction(
	userId: string,
	intent: StrengthSegmentIntent,
	formData: FormData,
) {
	switch (intent) {
		case 'add-strength-segment':
			return authorStrengthSegment(userId, formData, 'add')
		case 'set-strength-segment':
			return authorStrengthSegment(userId, formData, 'set')
		case 'remove-strength-segment': {
			const segmentId = IdField.safeParse(formData.get('segmentId'))
			if (!segmentId.success) return refuse(BLOCK_GONE)
			return reportStrength(
				await removeStrengthSegment(userId, { segmentId: segmentId.data }),
			)
		}
	}
}
