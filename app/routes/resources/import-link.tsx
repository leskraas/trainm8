import { parseWithZod } from '@conform-to/zod'
import { data } from 'react-router'
import { requireUserId } from '#app/utils/auth.server.ts'
import { ImportLinkActionSchema } from '#app/utils/import-link-schema.ts'
import {
	answerImportQuestion,
	redoImportLink,
	undoImportLink,
} from '#app/utils/import-link.server.ts'
import { IMPORT_LINK_REFUSAL_LABELS } from '#app/utils/labels.ts'
import { type Route } from './+types/import-link.ts'

/**
 * An import's row on I dag (#505 stories 80–81): the answers to "hva var
 * dette?" — it was this planned session, an ekstra session, or Annet — and
 * _Angre kobling_ / _Koble igjen_. Owner-scoped: another athlete's import, or
 * a session that is not the athlete's, answers 404 and moves nothing.
 */
export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const submission = parseWithZod(await request.formData(), {
		schema: ImportLinkActionSchema,
	})
	if (submission.status !== 'success') {
		return data(
			{ submission: submission.reply(), result: null },
			{ status: 400 },
		)
	}
	const value = submission.value
	const result =
		value.intent === 'undo'
			? await undoImportLink(userId, value.importId)
			: value.intent === 'relink'
				? await redoImportLink(userId, value.importId)
				: await answerImportQuestion(
						userId,
						value.importId,
						value.intent === 'link'
							? { kind: 'link', sessionId: value.sessionId }
							: { kind: value.intent },
					)
	if (result.ok) {
		return data({ submission: submission.reply(), result })
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
		},
		{ status: notFound ? 404 : 409 },
	)
}
