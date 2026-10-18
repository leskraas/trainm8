import { parseWithZod } from '@conform-to/zod/v3'
import { data } from 'react-router'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	AUTOPILOT_NOTICE_LABELS,
	AUTOPILOT_UNDO_REFUSAL_LABELS,
} from '#app/utils/labels.ts'
import {
	markAutopilotNoticeSeen,
	undoAutopilotChange,
	undoAutopilotWeek,
} from '#app/utils/load/autopilot-notice.server.ts'
import { AutopilotActionSchema } from '#app/utils/load/autopilot-schema.ts'
import { type Route } from './+types/autopilot.ts'

/**
 * The Autopilot's posts (#576, ADR 0100): _Angre_ on one line of the
 * Autopilot Notice, _Angre alt_ on all of them, the switch in Meg
 * (Autopilot or _Spør meg først_), and the notice having been seen (#580).
 *
 * A resource route, so each control posts with its own fetcher and stays
 * where it is; the page's loaders revalidate after, so the notice reads the
 * week as it now stands. Owner-scoped: the athlete must be signed in, and
 * every server function reads only their own rows — another athlete's
 * proposal answers 404 and changes nothing.
 *
 * Every reply carries the conform submission and the sentence its toast says
 * (`toast`), so the client never words a result itself.
 */
export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const submission = parseWithZod(await request.formData(), {
		schema: AutopilotActionSchema,
	})
	if (submission.status !== 'success') {
		return data(
			{ submission: submission.reply(), ok: false, toast: null },
			{ status: 400 },
		)
	}
	const value = submission.value
	const L = AUTOPILOT_NOTICE_LABELS

	if (value.intent === 'mode') {
		// Read at the next close (ADR 0100 §6): nothing already written moves.
		await prisma.athleteProfile.upsert({
			where: { userId },
			create: { userId, autopilot: value.mode === 'autopilot' },
			update: { autopilot: value.mode === 'autopilot' },
		})
		return data({ submission: submission.reply(), ok: true, toast: null })
	}

	if (value.intent === 'seen') {
		// Quiet: nothing is said, and I dag lets the notice go on a later day
		// once its week has begun (#580).
		const seen = await markAutopilotNoticeSeen(userId, value.weekKey)
		return data(
			{ submission: submission.reply(), ok: seen.ok, toast: null },
			{ status: seen.ok ? 200 : 404 },
		)
	}

	const result =
		value.intent === 'undo'
			? await undoAutopilotChange(userId, value.proposalId)
			: await undoAutopilotWeek(userId, value.weekKey)
	if (!result.ok) {
		const sentence = AUTOPILOT_UNDO_REFUSAL_LABELS[result.reason]
		return data(
			{
				submission: submission.reply({ formErrors: [sentence] }),
				ok: false,
				toast: sentence,
			},
			{ status: result.reason === 'not-found' ? 404 : 409 },
		)
	}
	const toast =
		'refused' in result
			? result.undone === 0
				? L.nothingToUndo
				: L.undoneAllToast(result.undone)
			: result.undone
				? L.undoneToast
				: L.nothingToUndo
	return data({ submission: submission.reply(), ok: true, toast })
}
