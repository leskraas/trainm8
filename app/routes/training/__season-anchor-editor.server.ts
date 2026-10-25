/**
 * Re-anchoring a track mid-season (#407, #533): the action behind
 * `__season-anchor-editor.tsx`, which the route's action dispatches to.
 */

import { parseWithZod } from '@conform-to/zod/v3'
import { data } from 'react-router'
import { SESONG_REFUSAL_LABELS } from '#app/utils/labels.ts'
import {
	SeasonAnchorRemoveSchema,
	SeasonAnchorSetSchema,
} from '#app/utils/plan-outline/authoring-schema.ts'
import {
	removeSeasonAnchorSegment,
	setSeasonAnchorValue,
	type SeasonAnchorRefusal,
} from '#app/utils/plan-outline/authoring.server.ts'
import {
	IdField,
	TRACK_GONE,
	WEEK_NOT_ONE_OF_THE_PLANS,
	refuse,
	issueMessages,
} from './__plan-action.server.ts'
import { SeasonAnchorFormSchema } from './__season-anchor-editor.tsx'

const ANCHOR_GONE = SESONG_REFUSAL_LABELS.anchorGone

/**
 * One **Season Anchor** service result, worded — the pair `reportWeekOverride` is,
 * for a fourth vocabulary: an anchor edit refuses over a *segment*, which is neither
 * a phase, a pattern nor a week. Typing the map to the union makes a refusal added
 * later a compile error here rather than a silent catch-all.
 *
 * Only the **remove** control reports through this. Adding and editing report on
 * the form they were typed into, through `authorSeasonAnchor`.
 */
function reportAnchor(
	result: { ok: true } | { ok: false; reason: SeasonAnchorRefusal },
) {
	if (result.ok) return { ok: true as const }
	return refuse(anchorRefusalMessage(result.reason))
}

/**
 * Each way authoring an anchor segment can be refused, as a sentence about the plan.
 *
 * None of them is about a *unit*, and that absence is the point: a segment carries
 * no unit at all, so there is no state in which the athlete is told they may not
 * change one (ADR 0043, ADR 0044 §8).
 */
function anchorRefusalMessage(reason: SeasonAnchorRefusal): string {
	switch (reason) {
		case 'track-not-found':
			// The same absence a pattern day and a hand-set week name, so the same
			// sentence: a row that is not the athlete's reads as gone, not as forbidden.
			return TRACK_GONE
		case 'week-outside-plan':
			return WEEK_NOT_ONE_OF_THE_PLANS
		case 'anchor-not-found':
			// Reachable from a stale reading, whose remove control was rendered before
			// a second tab removed the segment. Nothing was changed.
			return ANCHOR_GONE
		case 'earliest-anchor':
			// Not a permission and not a bug: removing the first segment would leave
			// every week before the next one with nothing to derive from. Said as what
			// the athlete can do instead, since both alternatives are on the same card.
			return SESONG_REFUSAL_LABELS.earliestAnchor
	}
}

/**
 * Author one **Season Anchor** segment — added or re-authored, which is the same
 * two fields either way, because a segment *is* its `(from week, value)` pair.
 *
 * Reported through Conform, like the other multi-field forms on this page: the
 * reply carries the intent **and** both handles, so it lands on the one card or the
 * one re-anchor form it answers and leaves every sibling alone. The add form is
 * keyed by the track and an anchor card by the track and its week — see `replyFor`
 * in `__season-anchor-editor.tsx`.
 *
 * `SeasonAnchorSetSchema` is re-parsed here for `authorSegmentRates`' reason: a
 * value the storage schema refuses — zero, a negative, a week key that is not a
 * Monday — reads as a sentence on this form rather than as a throw from the service
 * that re-parses it (ADR 0044 §8). It is `.strict()`, so a body that smuggles a
 * `currency` key in is rejected rather than silently stripped.
 */
async function authorSeasonAnchor(
	userId: string,
	formData: FormData,
	mode: 'add' | 'set',
) {
	const intent =
		mode === 'add'
			? ('add-season-anchor' as const)
			: ('set-season-anchor' as const)
	const trackId = String(formData.get('trackId') ?? '')
	// A missing handle is a stale page rather than a typed value, so it is a
	// sentence at the top of the reading and not an error on a form the row behind
	// it no longer has.
	if (trackId === '') return refuse(TRACK_GONE)

	const submission = parseWithZod(formData, { schema: SeasonAnchorFormSchema })
	// Off the body rather than off the parse, so a rejected submission still
	// reports on the card it was typed into.
	const row = {
		intent,
		trackId,
		fromWeekKey: String(formData.get('fromWeekKey') ?? ''),
	}
	if (submission.status !== 'success') {
		return data({ ...row, result: submission.reply() }, { status: 400 })
	}

	const formErrors = (messages: string[]) =>
		data(
			{ ...row, result: submission.reply({ formErrors: messages }) },
			{ status: 400 },
		)

	const authored = SeasonAnchorSetSchema.safeParse({
		trackId,
		...submission.value,
	})
	if (!authored.success) return formErrors(issueMessages(authored.error))

	const saved = await setSeasonAnchorValue(userId, authored.data)
	if (!saved.ok) return formErrors([anchorRefusalMessage(saved.reason)])

	return { ...row, result: submission.reply() }
}

/** The anchor section's intents, which the route's action hands here. */
export type SeasonAnchorIntent =
	| 'add-season-anchor'
	| 'set-season-anchor'
	| 'remove-season-anchor'

/** One Season Anchor segment added, re-authored or removed. */
export async function seasonAnchorAction(
	userId: string,
	intent: SeasonAnchorIntent,
	formData: FormData,
) {
	switch (intent) {
		case 'add-season-anchor':
			return authorSeasonAnchor(userId, formData, 'add')
		case 'set-season-anchor':
			return authorSeasonAnchor(userId, formData, 'set')
		case 'remove-season-anchor': {
			const trackId = IdField.safeParse(formData.get('trackId'))
			if (!trackId.success) return refuse(TRACK_GONE)
			// The service's own schema at the boundary: only a hand-made body can carry
			// a week key that is not a Monday, and it names a segment that cannot exist.
			const removing = SeasonAnchorRemoveSchema.safeParse({
				trackId: trackId.data,
				fromWeekKey: formData.get('fromWeekKey'),
			})
			if (!removing.success) return refuse(ANCHOR_GONE)
			return reportAnchor(
				await removeSeasonAnchorSegment(userId, removing.data),
			)
		}
	}
}
