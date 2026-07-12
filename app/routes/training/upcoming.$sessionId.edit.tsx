import { parseWithZod } from '@conform-to/zod'
import { invariantResponse } from '@epic-web/invariant'
import { data, redirect } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { WorkoutAuthoringSchema } from '#app/utils/workout-schema.ts'
import { updateWorkoutSession } from '#app/utils/workout.server.ts'
import { type Route } from './+types/upcoming.$sessionId.edit.ts'
import { buildBlocksInput, FormSchema } from './__workout-step-fields.tsx'

/**
 * The detail view IS the editor (spec §1, B9): the standalone edit page is no
 * longer an entry point. A GET here redirects to the session detail, where the
 * Token Sentence edits inline and autosaves. Ownership is enforced at that
 * destination (its loader 404s a non-owner). The POST `action` below still
 * serves the inline editor's autosave posts, so no new save path is
 * introduced. Full deletion of this route is 14/14's sweep.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
	await requireUserId(request)
	invariantResponse(params.sessionId, 'Session id is required', { status: 400 })
	throw redirect(`/training/sessions/${params.sessionId}`)
}

export async function action({ request, params }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	invariantResponse(params.sessionId, 'Session id is required', { status: 400 })

	const formData = await request.formData()
	const submission = parseWithZod(formData, { schema: FormSchema })

	if (submission.status !== 'success') {
		return data({ result: submission.reply() }, { status: 400 })
	}

	const { title, discipline, intent, scheduledAtDate, scheduledAtTime } =
		submission.value

	const scheduledAt = new Date(`${scheduledAtDate}T${scheduledAtTime}:00.000Z`)

	if (isNaN(scheduledAt.getTime())) {
		return data(
			{
				result: submission.reply({
					fieldErrors: {
						scheduledAtDate: ['Invalid date and time combination'],
					},
				}),
			},
			{ status: 400 },
		)
	}

	const authoringInput = WorkoutAuthoringSchema.safeParse({
		title,
		discipline,
		intent,
		scheduledAt: scheduledAt.toISOString(),
		blocks: buildBlocksInput(submission.value),
	})

	if (!authoringInput.success) {
		const fieldErrors: Record<string, string[]> = {}
		for (const issue of authoringInput.error.issues) {
			const path = issue.path.join('.')
			if (!fieldErrors[path]) fieldErrors[path] = []
			fieldErrors[path]!.push(issue.message)
		}
		return data({ result: submission.reply({ fieldErrors }) }, { status: 400 })
	}

	const updated = await updateWorkoutSession(
		userId,
		params.sessionId,
		authoringInput.data,
	)
	invariantResponse(updated, 'Workout session not found', { status: 404 })

	throw redirect(`/training/sessions/${params.sessionId}`)
}

export { GeneralErrorBoundary as ErrorBoundary }
