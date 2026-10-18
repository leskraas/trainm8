import { data } from 'react-router'
import { z } from 'zod/v3'
import { requireUserId } from '#app/utils/auth.server.ts'
import {
	previewTrackDays,
	setTrackDays,
	type TrackDaysChoice,
} from '#app/utils/plan-outline/track-days.server.ts'
import { patternWeekdaysOf } from '#app/utils/plan-outline/week-pattern.ts'
import { type Route } from './+types/track-days.ts'

/**
 * _Dagene i uka_ under _Plan → Avansert_ (#598, ADR 0104 §4): the coming
 * weeks with a track's or a Simple Activity's days changed (`preview-days`),
 * the write (`apply-days`), and its toast's _Angre_ (`undo-days`), which puts
 * back exactly the rows the write replaced.
 *
 * A resource route, so each row of the card posts with its own fetcher and
 * Plan stays where it is. Owner-scoped: every read and write checks the plan
 * is the signed-in athlete's.
 */

/** The choice off the form: `mode=auto`, or `mode=own` and each `day`. */
function choiceOf(formData: FormData): TrackDaysChoice {
	if (formData.get('mode') !== 'own') return null
	return patternWeekdaysOf(formData.getAll('day').map(Number))
}

const RowSchema = z.object({
	kind: z.enum(['share', 'fixed']),
	weekday: z.number().int().min(0).max(6),
	weight: z.number().positive().nullable(),
	workoutId: z.string().min(1).nullable(),
})

const UndoSchema = z.object({
	pinned: z.array(z.number().int().min(0).max(6)).nullable(),
	rows: z.array(RowSchema).min(1).max(14),
	version: z.string(),
})

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const intent = formData.get('intent')
	const outlineId = String(formData.get('outlineId') ?? '')
	const key = String(formData.get('key') ?? '')

	if (intent === 'preview-days') {
		const preview = await previewTrackDays(userId, {
			outlineId,
			key,
			choice: choiceOf(formData),
		})
		return preview.ok
			? { intent: 'preview' as const, key, preview, error: null }
			: data(
					{
						intent: 'preview' as const,
						key,
						preview: null,
						error: preview.reason,
					},
					{ status: 400 },
				)
	}

	if (intent === 'apply-days') {
		const written = await setTrackDays(userId, {
			outlineId,
			key,
			choice: choiceOf(formData),
			version: String(formData.get('version') ?? ''),
		})
		return written.ok
			? { intent: 'applied' as const, key, written, error: null }
			: data(
					{
						intent: 'applied' as const,
						key,
						written: null,
						error: written.reason,
					},
					{ status: 400 },
				)
	}

	if (intent === 'undo-days') {
		let payload: unknown = null
		try {
			payload = JSON.parse(String(formData.get('undo') ?? 'null'))
		} catch {
			payload = null
		}
		const parsed = UndoSchema.safeParse(payload)
		if (!parsed.success) {
			return data(
				{
					intent: 'undone' as const,
					key,
					ok: false,
					error: 'bad-restore' as const,
				},
				{ status: 400 },
			)
		}
		const { pinned, rows, version } = parsed.data
		const restored = {
			pinned: pinned == null ? null : patternWeekdaysOf(pinned),
			rows: rows.map((row) => ({
				...row,
				weekday: patternWeekdaysOf([row.weekday])[0]!,
			})),
		}
		const undone = await setTrackDays(userId, {
			outlineId,
			key,
			choice: restored.pinned,
			version,
			restore: restored,
		})
		return undone.ok
			? { intent: 'undone' as const, key, ok: true, error: null }
			: data(
					{ intent: 'undone' as const, key, ok: false, error: undone.reason },
					{ status: 400 },
				)
	}

	throw new Response(`Invalid intent "${String(intent)}"`, { status: 400 })
}
