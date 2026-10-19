import { data } from 'react-router'
import { z } from 'zod/v3'
import { requireUserId } from '#app/utils/auth.server.ts'
import {
	dayChoiceOf,
	undoPayloadOf,
} from '#app/utils/plan-outline/pinned-days.ts'
import {
	previewTrackDays,
	setTrackDays,
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

/** Which plan and which row of _Dagene i uka_ a post is for. */
const TargetSchema = z.object({
	outlineId: z.string().min(1),
	key: z.string().min(1),
})

const RowSchema = z.object({
	kind: z.enum(['share', 'fixed']),
	weekday: z.number().int().min(0).max(6),
	weight: z.number().positive().nullable(),
	workoutId: z.string().min(1).nullable(),
})

const UndoSchema = z.object({
	pinned: z.array(z.number().int().min(0).max(6)).nullable(),
	/** Empty where the track had no rows before the write. */
	rows: z.array(RowSchema).max(14),
	/** The rows the write replaced in the plan's other Week Patterns. */
	elsewhere: z
		.array(
			z.object({
				patternId: z.string().min(1),
				rows: z.array(RowSchema).min(1).max(14),
			}),
		)
		// One entry per Week Pattern of the plan that holds the track.
		.max(512)
		.default([]),
	version: z.string(),
})

/** Rows off the form, each weekday read onto the pattern's axis. */
function restoredRows(rows: ReadonlyArray<z.infer<typeof RowSchema>>) {
	return rows.map((row) => ({
		...row,
		weekday: patternWeekdaysOf([row.weekday])[0]!,
	}))
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const intent = formData.get('intent')
	const target = TargetSchema.safeParse({
		outlineId: formData.get('outlineId'),
		key: formData.get('key'),
	})
	if (!target.success) {
		throw new Response('A day choice names its plan and its row', {
			status: 400,
		})
	}
	const { outlineId, key } = target.data

	if (intent === 'preview-days') {
		const preview = await previewTrackDays(userId, {
			outlineId,
			key,
			choice: dayChoiceOf(formData),
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
			choice: dayChoiceOf(formData),
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
		const payload = undoPayloadOf(formData, UndoSchema)
		if (!payload) {
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
		const { pinned, rows, elsewhere, version } = payload
		const restored = {
			pinned: pinned == null ? null : patternWeekdaysOf(pinned),
			rows: restoredRows(rows),
			elsewhere: elsewhere.map((entry) => ({
				patternId: entry.patternId,
				rows: restoredRows(entry.rows),
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
