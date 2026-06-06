import { eventStream } from 'remix-utils/sse/server'
import { requireUserId } from '#app/utils/auth.server.ts'
import { generatePlanPreview } from '#app/utils/plan-generation/generate.server.ts'
import { PlanGenerationInputSchema } from '#app/utils/plan-generation/schema.ts'
import { type Route } from './+types/plan.generate.ts'

export const PLAN_PROGRESS_EVENT = 'plan-progress'
export const PLAN_PREVIEW_EVENT = 'plan-preview'
export const PLAN_ERROR_EVENT = 'plan-error'

/**
 * SSE-streamed plan generation (PRD #103, user story 8). Generation is
 * synchronous and streams progress to the wizard rather than running on the
 * background Job Queue (ADR 0013) — the Plan Preview must return for review.
 *
 * Inputs arrive as query params because the browser's `EventSource` is GET-only.
 * The stream emits `plan-progress` lines as the plan is built, then a single
 * terminal `plan-preview` (transient JSON, nothing persisted) or `plan-error`.
 */
export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)

	const url = new URL(request.url)
	const parsed = PlanGenerationInputSchema.safeParse({
		disciplines: url.searchParams.getAll('discipline'),
		experience: url.searchParams.get('experience'),
		goal: url.searchParams.get('goal'),
		horizonWeeks: url.searchParams.get('horizonWeeks'),
	})

	return eventStream(request.signal, (send) => {
		let cancelled = false

		void (async () => {
			if (!parsed.success) {
				send({ event: PLAN_ERROR_EVENT, data: 'Invalid plan request.' })
				return
			}

			const result = await generatePlanPreview(userId, parsed.data, {
				onProgress: (message) => {
					if (!cancelled) send({ event: PLAN_PROGRESS_EVENT, data: message })
				},
			})
			if (cancelled) return

			if (result.ok) {
				send({ event: PLAN_PREVIEW_EVENT, data: JSON.stringify(result.preview) })
			} else {
				send({ event: PLAN_ERROR_EVENT, data: result.error })
			}
		})()

		return () => {
			cancelled = true
		}
	})
}
