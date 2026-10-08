/**
 * The plan page's action for the Sesong edits (#505 stories 72–77):
 * `preview-season-edit` answers with the preview and writes nothing;
 * `apply-season-edit` applies the previewed edit — refused as stale when it
 * would no longer be the one shown — and redirects with the edit's message as
 * a toast. Kept beside `__season-edits.tsx` so the route's action only
 * dispatches to it.
 */
import { parseWithZod } from '@conform-to/zod'
import { data } from 'react-router'
import {
	SEASON_EDIT_LABELS,
	SEASON_EDIT_REFUSAL_LABELS,
} from '#app/utils/labels.ts'
import {
	SEASON_EDIT_FORM_SCHEMAS,
	seasonEditOf,
} from '#app/utils/plan-outline/season-edit-schema.ts'
import {
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
		weeks: preview.weeks,
		digest: preview.digest,
		message: seasonEditMessage(preview),
		warnings: preview.warnings.map(seasonEditWarningMessage),
		edit,
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
				},
				400,
			)
		}
		// Nothing written: the preview, for the athlete to confirm under.
		return reply({
			edit: kind,
			result: submission.reply(),
			preview: previewView(preview, edit),
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
						result: submission.reply({ formErrors: [message] }),
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
		title: SEASON_EDIT_LABELS.done,
		description: seasonEditMessage(applied),
	})
}
