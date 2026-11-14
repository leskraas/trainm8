/**
 * The plan page's action for the Sesong edits (#505 stories 72–77):
 * `preview-season-edit` answers with the preview and writes nothing;
 * `apply-season-edit` applies the previewed edit — refused as stale when it
 * would no longer be the one shown — and redirects with the edit's message as
 * a toast. Kept beside `__season-edits.tsx` so the route's action only
 * dispatches to it.
 */
import { parseWithZod } from '@conform-to/zod/v3'
import { data } from 'react-router'
import { formatNbVolumeFigure } from '#app/utils/format.ts'
import {
	NB_VOLUME_UNITS,
	NB_WEEK_ROLE_LABELS,
	nbPhaseName,
	SEASON_ANCHOR_EDIT_LABELS,
	SEASON_EDIT_LABELS,
	SEASON_EDIT_REFUSAL_LABELS,
} from '#app/utils/labels.ts'
import {
	SEASON_EDIT_FORM_SCHEMAS,
	seasonEditOf,
} from '#app/utils/plan-outline/season-edit-schema.ts'
import {
	seasonEditDerivationMessage,
	seasonEditMessage,
	seasonEditWarningMessage,
} from '#app/utils/plan-outline/season-edit-words.ts'
import {
	applySeasonEdit,
	readSeasonEdit,
} from '#app/utils/plan-outline/season-edit.server.ts'
import {
	SEASON_EDIT_KINDS,
	type SeasonEdit,
	type SeasonEditKind,
	type SeasonEditPreview,
} from '#app/utils/plan-outline/season-edit.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import {
	type SeasonAnchorPreviewView,
	type SeasonEditPreviewView,
	type SeasonEditReply,
} from './__season-edits.tsx'

function kindOf(value: FormDataEntryValue | null): SeasonEditKind {
	return SEASON_EDIT_KINDS.find((kind) => kind === value) ?? 'week-target'
}

function previewView(
	preview: SeasonEditPreview,
	edit: SeasonEdit,
): SeasonEditPreviewView {
	return {
		kind: preview.kind,
		// A Season Anchor's panel reads only its own rows (`anchor`): the week
		// views, a season of them with their derivations, stay on the server.
		weeks: preview.kind === 'season-anchor' ? [] : preview.weeks,
		digest: preview.digest,
		message: seasonEditMessage(preview),
		warnings: preview.warnings.map(seasonEditWarningMessage),
		edit,
		anchor: anchorView(preview),
	}
}

/**
 * A Season Anchor preview's rows, worded (ADR 0121 §1): each changed week of
 * the edited track, before → after, with its `authored | derived` marker and
 * how a derived after-value was worked out; then the hand-set weeks held.
 */
function anchorView(
	preview: SeasonEditPreview,
): SeasonAnchorPreviewView | undefined {
	const { summary } = preview
	if (summary.kind !== 'season-anchor') return undefined
	const { currency } = summary
	const unit = NB_VOLUME_UNITS[currency]
	const figure = (value: number | null | undefined) =>
		value == null ? '–' : formatNbVolumeFigure(value, currency)
	return {
		unit,
		changedWeeks: SEASON_ANCHOR_EDIT_LABELS.changedWeeks(summary.changedWeeks),
		rows: preview.weeks.flatMap((week) => {
			const index = week.after?.targets.findIndex(
				(target) => target.trackId === summary.trackId,
			)
			if (index == null || index < 0) return []
			const before = week.before?.targets[index]
			const after = week.after!.targets[index]!
			if (before?.value === after.value) return []
			const derivation = week.derivations[index] ?? null
			const phaseName = week.after!.phaseName
			return [
				{
					weekKey: week.weekKey,
					weekNumber: week.weekNumber,
					where: `${NB_WEEK_ROLE_LABELS[week.after!.role]} · ${nbPhaseName(phaseName)}`,
					before: figure(before?.value),
					after: figure(after.value),
					authored: after.overridden,
					how: derivation
						? seasonEditDerivationMessage(derivation, currency, phaseName)
						: null,
				},
			]
		}),
		held: preview.heldWeeks.map((week) => ({
			weekKey: week.weekKey,
			weekNumber: week.weekNumber,
			figure: `${formatNbVolumeFigure(week.value, week.currency)} ${unit}`,
		})),
	}
}

const reply = (seasonEdit: SeasonEditReply, status?: number) =>
	data({ seasonEdit }, status ? { status } : undefined)

export async function seasonEditAction(
	userId: string,
	request: Request,
	formData: FormData,
) {
	const kind = kindOf(formData.get('edit'))
	const submission = parseWithZod(formData, {
		schema: SEASON_EDIT_FORM_SCHEMAS[kind],
	})
	if (submission.status !== 'success') {
		// A confirm that fails to parse answers under the confirm, a preview
		// under the edit's own form.
		return reply(
			formData.get('intent') === 'apply-season-edit'
				? { edit: kind, confirmResult: submission.reply() }
				: { edit: kind, result: submission.reply() },
			400,
		)
	}
	const { outlineId, intent, digest } = submission.value
	const edit = seasonEditOf(submission.value)

	if (intent === 'preview-season-edit') {
		const preview = await readSeasonEdit(userId, outlineId, edit)
		if (!preview.ok) {
			return reply(
				{
					edit: kind,
					result: submission.reply({
						formErrors: [SEASON_EDIT_REFUSAL_LABELS[preview.reason]],
					}),
					refusal: preview.reason,
					// The edit the domain offers instead (`segment-lived`), for the
					// page to render as one button.
					...('offer' in preview && preview.offer
						? { offer: preview.offer }
						: {}),
				},
				400,
			)
		}
		// Nothing written: the preview, for the athlete to confirm under.
		return reply({
			edit: kind,
			result: submission.reply(),
			preview: previewView(preview, edit),
			// Asked for from a refusal's offer, so the form is re-filled with it.
			...(formData.get('fromOffer') === 'on' ? { fromOffer: true } : {}),
		})
	}

	// The schema refuses an apply without the preview's digest, so it is here.
	const applied = await applySeasonEdit(userId, outlineId, edit, new Date(), {
		digest: digest ?? '',
	})
	if (!applied.ok) {
		// Said under the preview as it stands now when there is one, so the
		// athlete reads what would land and confirms that instead.
		const message = SEASON_EDIT_REFUSAL_LABELS[applied.reason]
		// A Season Anchor's stale confirm says nothing was saved and offers a
		// fresh preview, rather than showing one at once: its preview can be the
		// rest of the season, and numbers that are no longer true must not read
		// as the ones about to land (#673's design).
		if (edit.kind === 'season-anchor' && applied.reason === 'preview-stale') {
			return reply(
				{
					edit: kind,
					confirmResult: submission.reply({
						formErrors: [SEASON_ANCHOR_EDIT_LABELS.stale],
					}),
					stale: true,
				},
				400,
			)
		}
		const fresh = await readSeasonEdit(userId, outlineId, edit)
		return reply(
			fresh.ok
				? {
						edit: kind,
						confirmResult: submission.reply({ formErrors: [message] }),
						preview: previewView(fresh, edit),
					}
				: {
						edit: kind,
						result: submission.reply({
							formErrors: [SEASON_EDIT_REFUSAL_LABELS[fresh.reason]],
						}),
						// Refused now as a preview would be (a week began meanwhile),
						// so with the same offer beside it (#673).
						refusal: fresh.reason,
						...('offer' in fresh && fresh.offer ? { offer: fresh.offer } : {}),
					},
			400,
		)
	}
	// Back to the page as it was read, without the request that opened the
	// edit: the edit is done, so the form need not open on it again.
	const url = new URL(request.url)
	for (const name of ['edit', 'weekKey', 'trackId', 'phaseId']) {
		url.searchParams.delete(name)
	}
	return redirectWithToast(`${url.pathname}${url.search}`, {
		type: 'success',
		title:
			edit.kind === 'season-anchor'
				? SEASON_ANCHOR_EDIT_LABELS.done
				: SEASON_EDIT_LABELS.done,
		description: seasonEditMessage(applied),
	})
}
