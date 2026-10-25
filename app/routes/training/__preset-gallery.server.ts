/**
 * Applying a preset shape (#405, #533): the action behind `__preset-gallery.tsx`,
 * which the route's action dispatches to.
 */

import { z } from 'zod/v3'
import {
	PRESET_GALLERY_LABELS,
	SESONG_REFUSAL_LABELS,
} from '#app/utils/labels.ts'
import { applyPreset } from '#app/utils/plan-outline/authoring.server.ts'
import { PRESET_KEYS } from '#app/utils/plan-outline/presets.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { report } from './__phase-editor.server.ts'
import { IdField, OUTLINE_GONE, refuse } from './__plan-action.server.ts'

/**
 * The name of a shape, read straight off the body like every other field on this
 * page. `PRESET_KEYS` is the one list of shipped keys — the service's schema reads
 * the same constant — so the surface cannot ask for a preset the app never
 * shipped, and a body carrying anything else is refused before the service sees it.
 */
const PresetKeyField = z.enum(PRESET_KEYS)

const SHAPE_UNKNOWN = SESONG_REFUSAL_LABELS.shapeUnknown

/** `apply-preset`: copy a shape in, then say so in a toast. */
export async function applyPresetAction(
	userId: string,
	request: Request,
	formData: FormData,
) {
	const outlineId = IdField.safeParse(formData.get('outlineId'))
	const presetKey = PresetKeyField.safeParse(formData.get('presetKey'))
	if (!outlineId.success) return refuse(OUTLINE_GONE)
	if (!presetKey.success) return refuse(SHAPE_UNKNOWN)
	const applied = await applyPreset(userId, {
		outlineId: outlineId.data,
		presetKey: presetKey.data,
	})
	if (!applied.ok) {
		return applied.reason === 'plan-begun'
			? refuse(PRESET_GALLERY_LABELS.begun)
			: report(applied)
	}
	// A redirect rather than falling through to the loader, because there is
	// something to *say* that the page cannot say by itself. Applying copies the
	// shape in: nothing records where the blocks came from, no reference back
	// exists, and every value that just landed is editable through the controls
	// directly above the gallery (ADR 0044 §2, #371). An athlete who has just
	// watched their season change shape needs to be told that, in words, once.
	//
	// Back to the URL that was posted to, so the `?event=` season being read and
	// the reading it is on both survive applying. Whether the new shape now ends
	// before or after the Event is not settled here: it is `season.fit`,
	// re-derived on the next read and stated at the top of the page (ADR 0044
	// §3). Nothing stretches to fit.
	const url = new URL(request.url)
	return redirectWithToast(`${url.pathname}${url.search}`, {
		type: 'success',
		title: SESONG_REFUSAL_LABELS.presetDone,
		description: SESONG_REFUSAL_LABELS.presetDoneDetail,
	})
}
