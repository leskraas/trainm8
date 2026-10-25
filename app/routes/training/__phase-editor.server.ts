/**
 * The phase editor's action on the plan page (#402, #533): add, move and remove
 * a phase, and delete the plan. Kept beside `__phase-editor.tsx` so the route's
 * action only dispatches to it.
 */

import { z } from 'zod/v3'
import {
	SESONG_PHASE_FIELD_LABELS,
	SESONG_REFUSAL_LABELS,
} from '#app/utils/labels.ts'
import {
	PhaseNameSchema,
	PhaseWeeksSchema,
} from '#app/utils/plan-outline/authoring-schema.ts'
import {
	addPhase,
	deletePlanOutline,
	movePhase,
	removePhase,
	type PhaseEditRefusal,
} from '#app/utils/plan-outline/authoring.server.ts'
import { RHYTHMS } from '#app/utils/plan-outline/derive.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import {
	isBlank,
	IdField,
	checked,
	moveDirection,
	OUTLINE_GONE,
	refuse,
	firstIssue,
} from './__plan-action.server.ts'

/**
 * What the phase forms submit, per field.
 *
 * A form body is strings, and these coerce them into the shapes the authoring
 * schemas take. The service re-parses everything it is handed, so no write reaches
 * the database without passing the same rules twice; what these add is *wording* —
 * an athlete who clears the weeks box reads a sentence rather than "expected
 * number, received nan".
 */
const WeeksField = z.preprocess(
	(value) => (isBlank(value) ? undefined : value),
	z.coerce
		.number({
			errorMap: () => ({ message: SESONG_PHASE_FIELD_LABELS.weeks }),
		})
		// The bounds and their wording are the authoring schema's, piped rather than
		// restated, so a rule cannot move on one side of the form only.
		.pipe(PhaseWeeksSchema),
)

const NameField = z.preprocess((value) => value ?? '', PhaseNameSchema)

const AtIndexField = z.coerce.number().int().min(0)

/**
 * The rhythm as submitted. **Not** defaulted: a body missing its rhythm is refused
 * rather than written as `3:1`, which would record a convention as though the
 * athlete had chosen it — and would overwrite the `none` they had chosen before
 * (ADR 0044 §4, the rule `authoring-schema.ts` states).
 */
const RhythmField = z.enum(RHYTHMS, {
	errorMap: () => ({ message: SESONG_PHASE_FIELD_LABELS.rhythm }),
})

const PHASE_GONE = SESONG_REFUSAL_LABELS.phaseGone

const POSITION_UNREADABLE = SESONG_REFUSAL_LABELS.position

/**
 * One service result, worded. Every refusal is a state the athlete can act on, so
 * each is a sentence and none is an exception; typing the map to the union makes a
 * refusal added later a compile error here rather than a silent catch-all.
 */
export function report(
	result: { ok: true } | { ok: false; reason: PhaseEditRefusal },
) {
	if (result.ok) return { ok: true as const }
	return refuse(refusalMessage(result.reason))
}

function refusalMessage(reason: PhaseEditRefusal): string {
	switch (reason) {
		case 'outline-not-found':
			return OUTLINE_GONE
		case 'phase-not-found':
			return PHASE_GONE
		case 'plan-too-long':
			return SESONG_REFUSAL_LABELS.planTooLong
		case 'last-phase':
			return SESONG_REFUSAL_LABELS.lastPhase
		case 'at-the-edge':
			// Either end, since one message serves both directions: naming "start" for a
			// Move later would be the wrong word half the time.
			return SESONG_REFUSAL_LABELS.phaseAtEdge
	}
}

/** The phase editor's intents, which the route's action hands here. */
export type PhaseEditIntent =
	| 'add-phase'
	| 'move-phase'
	| 'remove-phase'
	| 'delete-plan'

/**
 * One structural edit of the season — a phase added, moved or removed — or the
 * plan deleted, each reported as a sentence (`report`) or a redirect home.
 */
export async function phaseEditAction(
	userId: string,
	intent: PhaseEditIntent,
	formData: FormData,
) {
	const phaseId = IdField.safeParse(formData.get('phaseId'))
	const outlineId = IdField.safeParse(formData.get('outlineId'))

	switch (intent) {
		case 'add-phase': {
			const name = NameField.safeParse(formData.get('name'))
			const weeks = WeeksField.safeParse(formData.get('weeks'))
			const atIndex = AtIndexField.safeParse(formData.get('atIndex'))
			const rhythm = RhythmField.safeParse(formData.get('rhythm'))
			if (!outlineId.success) return refuse(OUTLINE_GONE)
			if (!name.success) return refuse(firstIssue(name.error))
			if (!weeks.success) return refuse(firstIssue(weeks.error))
			// A garbled position is refused rather than clamped to 0: falling back to
			// "at the start" would put the phase in the most disruptive place in the
			// season, which is nowhere the athlete pointed at.
			if (!atIndex.success) return refuse(POSITION_UNREADABLE)
			if (!rhythm.success) return refuse(firstIssue(rhythm.error))
			return report(
				await addPhase(userId, {
					outlineId: outlineId.data,
					atIndex: atIndex.data,
					name: name.data,
					weeks: weeks.data,
					rhythm: rhythm.data,
					tapers: checked(formData, 'tapers'),
				}),
			)
		}
		case 'move-phase': {
			if (!phaseId.success) return refuse(PHASE_GONE)
			return report(
				await movePhase(userId, {
					phaseId: phaseId.data,
					direction: moveDirection(formData),
				}),
			)
		}
		case 'remove-phase': {
			if (!phaseId.success) return refuse(PHASE_GONE)
			return report(await removePhase(userId, { phaseId: phaseId.data }))
		}
		case 'delete-plan': {
			if (!outlineId.success) return refuse(OUTLINE_GONE)
			const deleted = await deletePlanOutline(userId, {
				outlineId: outlineId.data,
			})
			if (!deleted.ok) return report(deleted)
			// Home, not back here: this athlete may have no plan left to render, and the
			// Plan card is where the absence reads honestly.
			return redirectWithToast('/', {
				type: 'success',
				title: SESONG_REFUSAL_LABELS.deleted,
				description: SESONG_REFUSAL_LABELS.deletedDetail,
			})
		}
	}
}
