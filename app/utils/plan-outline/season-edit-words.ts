/**
 * A Sesong edit's preview, worded (#505 stories 76–77): the figures written
 * the Norwegian way (`44,1`), then handed to the sentences in `labels.ts`.
 * Shared by the preview on the plan page and the toast after an apply, so the
 * athlete reads the same sentence before and after.
 */

import { formatNbVolumeFigure } from '../format.ts'
import {
	NB_VOLUME_UNITS,
	seasonEditSentence,
	weekRiseSentence,
	type SeasonEditWords,
} from '../labels.ts'
import {
	type SeasonEditPreview,
	type SeasonEditWarning,
} from './season-edit.ts'

/** `Uke 42: mål 40 → 46 km. Fasen og de andre ukene står som før.` */
export function seasonEditMessage(
	preview: Pick<SeasonEditPreview, 'summary' | 'held'>,
): string {
	const { summary } = preview
	const words: SeasonEditWords =
		summary.kind === 'week-target'
			? {
					kind: 'week-target',
					weekNumber: summary.weekNumber,
					before:
						summary.before == null
							? null
							: formatNbVolumeFigure(summary.before, summary.currency),
					after:
						summary.after == null
							? null
							: formatNbVolumeFigure(summary.after, summary.currency),
					unit: NB_VOLUME_UNITS[summary.currency],
					revert: summary.revert,
				}
			: summary
	return seasonEditSentence(words, preview.held)
}

/** `Uke 43: 42 → 50 km, +19 % over forrige harde uke.` */
export function seasonEditWarningMessage(warning: SeasonEditWarning): string {
	return weekRiseSentence(
		warning.weekNumber,
		formatNbVolumeFigure(warning.from, warning.currency),
		formatNbVolumeFigure(warning.to, warning.currency),
		NB_VOLUME_UNITS[warning.currency],
		warning.rise,
	)
}
