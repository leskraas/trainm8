import { parseWithZod } from '@conform-to/zod'
import { data } from 'react-router'
import { requireUserId } from '#app/utils/auth.server.ts'
import { ImportLinkActionSchema } from '#app/utils/import-link-schema.ts'
import {
	type ImportAnswerResult,
	type ImportLinkResult,
	answerImportQuestion,
	redoImportLink,
	undoImportAnswer,
	undoImportLink,
} from '#app/utils/import-link.server.ts'
import {
	ANGRE_REST_LABELS,
	IMPORT_LINK_REFUSAL_LABELS,
} from '#app/utils/labels.ts'
import { createToastHeaders } from '#app/utils/toast.server.ts'
import { type Route } from './+types/import-link.ts'

/**
 * An import's row on I dag (#505 stories 80–81): the answers to "hva var
 * dette?" — it was this planned session, an ekstra session, or Annet — and
 * _Angre kobling_ / _Koble igjen_. Owner-scoped: another athlete's import, or
 * a session that is not the athlete's, answers 404 and moves nothing.
 *
 * A `link` answer's reply carries its _Angre_ token (`result.undo`), which the
 * client's toast and the landed row post back as `intent: undo-answer` (ADR
 * 0088, amended); that undo's own toast says what it put back.
 */
export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const submission = parseWithZod(await request.formData(), {
		schema: ImportLinkActionSchema,
	})
	if (submission.status !== 'success') {
		return data(
			{ submission: submission.reply(), result: null, undone: null },
			{ status: 400 },
		)
	}
	const value = submission.value
	if (value.intent === 'undo-answer') {
		const undone = await undoImportAnswer(userId, {
			importId: value.importId,
			linkedAt: value.linkedAt,
		})
		if (!undone.ok) {
			return data(
				{
					submission: submission.reply({
						formErrors: [ANGRE_REST_LABELS.refused[undone.reason]],
					}),
					result: null,
					undone: false,
				},
				{ status: undone.reason === 'not-undoable' ? 409 : 404 },
			)
		}
		const reply = {
			submission: submission.reply(),
			result: null,
			undone: undone.undone,
		}
		if (!undone.undone) return data(reply)
		return data(reply, {
			headers: await createToastHeaders({
				description: ANGRE_REST_LABELS.linkUndone(undone.title),
				type: 'success',
			}),
		})
	}
	// One shape for every answer: a link carries its _Angre_ token, the rest
	// carry none, so the row reads `undo` the same way off any reply.
	const result: ImportAnswerResult =
		value.intent === 'undo'
			? withoutUndo(await undoImportLink(userId, value.importId))
			: value.intent === 'relink'
				? withoutUndo(await redoImportLink(userId, value.importId))
				: await answerImportQuestion(
						userId,
						value.importId,
						value.intent === 'link'
							? { kind: 'link', sessionId: value.sessionId }
							: { kind: value.intent },
					)
	if (result.ok) {
		return data({ submission: submission.reply(), result, undone: null })
	}
	const notFound =
		result.reason === 'import-not-found' ||
		result.reason === 'session-not-found'
	return data(
		{
			submission: submission.reply({
				formErrors: [IMPORT_LINK_REFUSAL_LABELS[result.reason]],
			}),
			result,
			undone: null,
		},
		{ status: notFound ? 404 : 409 },
	)
}

/** _Angre kobling_ and _Koble igjen_ are their own ways back: no token. */
function withoutUndo(result: ImportLinkResult): ImportAnswerResult {
	return result.ok ? { ...result, undo: null } : result
}
