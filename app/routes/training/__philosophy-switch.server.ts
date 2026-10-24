/**
 * _Bytt filosofi_, _Bytt treningsform_ and the strength track offer (#505
 * stories 10–15, #581, #533): the preview, the switch and the offer behind
 * `__philosophy-switch.tsx` and `__treningsform.tsx`. The route's action
 * dispatches to it.
 */
import { type SubmissionResult } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod/v3'
import { data } from 'react-router'
import { formatNbDate } from '#app/utils/format.ts'
import {
	PHILOSOPHY_SWITCH_LABELS,
	PHILOSOPHY_SWITCH_REFUSAL_LABELS,
	PLAN_LEAD_LABELS,
	STRENGTH_OFFER_LABELS,
	switchedPhilosophySentence,
	TRENINGSFORM_LABELS,
} from '#app/utils/labels.ts'
import {
	PhilosophySwitchFormSchema,
	TRENINGSFORM_SURFACE,
	StrengthOfferFormSchema,
} from '#app/utils/plan-outline/philosophy-schema.ts'
import {
	readPhilosophySwitch,
	switchPhilosophy,
} from '#app/utils/plan-outline/philosophy.server.ts'
import { type PhilosophySwitchPreview } from '#app/utils/plan-outline/philosophy.ts'
import { addProposedStrengthTrack } from '#app/utils/plan-outline/strength-offer.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type PhilosophyPreviewView } from './__philosophy-switch.tsx'
import { trackRefusalMessage } from './__track-editor.server.ts'

/**
 * _Bytt filosofi_'s reply, under a key of its own so the page narrows to it:
 * the preview form's result, the confirm form's, and the preview to show.
 */
function philosophyReply({
	result = null,
	confirmResult = null,
	preview = null,
}: {
	result?: SubmissionResult<string[]> | null
	confirmResult?: SubmissionResult<string[]> | null
	preview?: PhilosophyPreviewView | null
}) {
	return { result, confirmResult, preview }
}

/** The preview as the page shows it: the diff and its digest, not the rows. */
function previewView(preview: PhilosophySwitchPreview): PhilosophyPreviewView {
	const { rows: _rows, edit: _edit, ok: _ok, ...view } = preview
	return view
}

/**
 * `preview-philosophy` and `switch-philosophy`: the preview, which writes
 * nothing, and the switch behind it.
 */
export async function philosophySwitchAction(
	userId: string,
	request: Request,
	formData: FormData,
) {
	// The same preview and switch serve _Bytt filosofi_ in Avansert and
	// _Bytt treningsform_ in the lead (#581); each answers where it was
	// asked, under a key of its own.
	const lead = formData.get('surface') === TRENINGSFORM_SURFACE
	type Reply = ReturnType<typeof philosophyReply>
	const answer = (
		reply: Reply,
	): { treningsform: Reply } | { philosophy: Reply } =>
		lead ? { treningsform: reply } : { philosophy: reply }
	const submission = parseWithZod(formData, {
		schema: PhilosophySwitchFormSchema,
	})
	if (submission.status !== 'success') {
		return data(answer(philosophyReply({ result: submission.reply() })), {
			status: 400,
		})
	}
	const { intent: asked, outlineId: switching, family } = submission.value
	if (asked === 'preview-philosophy') {
		const preview = await readPhilosophySwitch(userId, switching, family)
		if (!preview.ok) {
			return data(
				answer(
					philosophyReply({
						result: submission.reply({
							formErrors: [PHILOSOPHY_SWITCH_REFUSAL_LABELS[preview.reason]],
						}),
					}),
				),
				{ status: 400 },
			)
		}
		// Nothing written: the preview, for the athlete to confirm under.
		return answer(
			philosophyReply({
				result: submission.reply(),
				preview: previewView(preview),
			}),
		)
	}
	const switched = await switchPhilosophy(
		userId,
		switching,
		family,
		new Date(),
		{ digest: submission.value.digest },
	)
	if (!switched.ok) {
		// Said under the preview as it stands now when there is one, so the
		// athlete reads what would land and confirms that instead.
		const message = PHILOSOPHY_SWITCH_REFUSAL_LABELS[switched.reason]
		const fresh = await readPhilosophySwitch(userId, switching, family)
		return data(
			answer(
				fresh.ok
					? philosophyReply({
							confirmResult: submission.reply({ formErrors: [message] }),
							preview: previewView(fresh),
						})
					: philosophyReply({
							result: submission.reply({ formErrors: [message] }),
						}),
			),
			{ status: 400 },
		)
	}
	const url = new URL(request.url)
	const from = formatNbDate(
		new Date(`${switched.fromWeekKey}T12:00:00Z`),
		'UTC',
	)
	return redirectWithToast(
		`${url.pathname}${url.search}`,
		lead
			? {
					type: 'success',
					title: TRENINGSFORM_LABELS.done,
					description: TRENINGSFORM_LABELS.switched(
						PLAN_LEAD_LABELS.plainName[family],
						from,
					),
				}
			: {
					type: 'success',
					title: PHILOSOPHY_SWITCH_LABELS.done,
					description: switchedPhilosophySentence(family, from),
				},
	)
}

/** `add-strength-track`: the strength track proposed from the lifting history. */
export async function strengthOfferAction(
	userId: string,
	request: Request,
	formData: FormData,
) {
	const submission = parseWithZod(formData, {
		schema: StrengthOfferFormSchema,
	})
	if (submission.status !== 'success') {
		return data(
			{ strengthOffer: { result: submission.reply() } },
			{ status: 400 },
		)
	}
	const added = await addProposedStrengthTrack(
		userId,
		submission.value.outlineId,
	)
	if (!added.ok) {
		return data(
			{
				strengthOffer: {
					result: submission.reply({
						formErrors: [
							added.reason === 'no-strength-history'
								? STRENGTH_OFFER_LABELS.noHistory
								: trackRefusalMessage(added.reason),
						],
					}),
				},
			},
			{ status: 400 },
		)
	}
	const url = new URL(request.url)
	return redirectWithToast(`${url.pathname}${url.search}`, {
		type: 'success',
		title: STRENGTH_OFFER_LABELS.done,
		description: STRENGTH_OFFER_LABELS.doneDetail,
	})
}
