/**
 * The track roster's action on the plan page (#414, #533): add and remove a
 * whole Training Track. Kept beside `__track-editor.tsx` so the route's action
 * only dispatches to it.
 */

import { data } from 'react-router'
import { z } from 'zod/v3'
import {
	SESONG_REFUSAL_LABELS,
	SESONG_TRACK_LABELS,
} from '#app/utils/labels.ts'
import {
	addTrack,
	removeTrack,
	type AddTrackRefusal,
	type RemoveTrackRefusal,
} from '#app/utils/plan-outline/authoring.server.ts'
import { VOLUME_CURRENCIES } from '#app/utils/plan-outline/derive.ts'
import { DISCIPLINES } from '#app/utils/workout-schema.ts'
import {
	isBlank,
	IdField,
	OUTLINE_GONE,
	TRACK_GONE,
	firstIssue,
} from './__plan-action.server.ts'

/**
 * A new **Training Track**'s three fields (#414).
 *
 * The Discipline and the currency are the domain's own vocabularies, so a body
 * naming a fourth unit is refused here rather than reaching the service. The pair
 * is *not* cross-checked on this side — whether a Discipline may author a given
 * currency is `TrackAddSchema`'s refine, which is the same `currencyOptionsFor` the
 * form's picker is built from, so the rule has one home.
 */
const DisciplineField = z.enum(DISCIPLINES, {
	errorMap: () => ({ message: SESONG_TRACK_LABELS.disciplineRequired }),
})

const CurrencyField = z.enum(VOLUME_CURRENCIES, {
	errorMap: () => ({ message: SESONG_TRACK_LABELS.unitRequired }),
})

const AnchorValueField = z.preprocess(
	(value) => (isBlank(value) ? undefined : value),
	z.coerce
		.number({
			errorMap: () => ({ message: SESONG_TRACK_LABELS.anchorRequired }),
		})
		.positive(SESONG_TRACK_LABELS.anchorPositive),
)

/**
 * A refusal about the **set of tracks**, tagged so it lands beside the roster
 * rather than at the top of whichever reading happens to be open.
 *
 * The roster sits *above* the tabs, so it is the one control on this page whose
 * refusal has nowhere to go: an untagged one would print inside Blocks or Weeks,
 * a scroll away from the button that earned it. `scope` is the smallest thing that
 * fixes that, and the component reads it rather than guessing from the wording.
 */
function refuseTrack(error: string) {
	return data({ error, scope: 'track' as const }, { status: 400 })
}

/** One track-set refusal, worded (#414). */
export function trackRefusalMessage(
	reason: AddTrackRefusal | RemoveTrackRefusal,
): string {
	switch (reason) {
		case 'outline-not-found':
			return OUTLINE_GONE
		case 'track-not-found':
			return TRACK_GONE
		case 'discipline-already-tracked':
			// The rule, not the constraint: one track per discipline is what the
			// athlete needs to hear, and the second track they were about to author is
			// the one they already have (ADR 0043 §1).
			return SESONG_REFUSAL_LABELS.alreadyTracked
		case 'last-track':
			return SESONG_REFUSAL_LABELS.lastTrack
	}
}

/** The roster's intents, which the route's action hands here. */
export type TrackEditIntent = 'add-track' | 'remove-track'

/**
 * A whole Training Track added or removed. A refusal is tagged for the roster
 * (`refuseTrack`), which sits above the readings.
 */
export async function trackEditAction(
	userId: string,
	intent: TrackEditIntent,
	formData: FormData,
) {
	const outlineId = IdField.safeParse(formData.get('outlineId'))

	switch (intent) {
		case 'add-track': {
			const discipline = DisciplineField.safeParse(formData.get('discipline'))
			const currency = CurrencyField.safeParse(formData.get('currency'))
			const anchorValue = AnchorValueField.safeParse(
				formData.get('anchorValue'),
			)
			if (!outlineId.success) return refuseTrack(OUTLINE_GONE)
			if (!discipline.success) return refuseTrack(firstIssue(discipline.error))
			if (!currency.success) return refuseTrack(firstIssue(currency.error))
			if (!anchorValue.success) {
				return refuseTrack(firstIssue(anchorValue.error))
			}
			const added = await addTrack(userId, {
				outlineId: outlineId.data,
				discipline: discipline.data,
				currency: currency.data,
				anchorValue: anchorValue.data,
			})
			return added.ok
				? { ok: true as const }
				: refuseTrack(trackRefusalMessage(added.reason))
		}
		case 'remove-track': {
			const trackId = IdField.safeParse(formData.get('trackId'))
			if (!trackId.success) return refuseTrack(TRACK_GONE)
			const removed = await removeTrack(userId, { trackId: trackId.data })
			return removed.ok
				? { ok: true as const }
				: refuseTrack(trackRefusalMessage(removed.reason))
		}
	}
}
