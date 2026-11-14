/**
 * A Sesong edit's preview, worded (#505 stories 76–77): the figures written
 * the Norwegian way (`44,1`), then handed to the sentences in `labels.ts`.
 * Shared by the preview on the plan page and the toast after an apply, so the
 * athlete reads the same sentence before and after.
 */

import { formatNbSignedRate, formatNbVolumeFigure } from '../format.ts'
import {
	NB_VOLUME_UNITS,
	nbTrackName,
	seasonAnchorDerivationSentence,
	seasonEditSentence,
	weekRiseSentence,
	type SeasonEditWords,
} from '../labels.ts'
import { type VolumeCurrency } from './derive.ts'
import {
	type SeasonEditDerivation,
	type SeasonEditPreview,
	type SeasonEditWarning,
} from './season-edit.ts'

/** `Uke 42: mål 40 → 46 km. Fasen og de andre ukene står som før.` */
export function seasonEditMessage(
	preview: Pick<SeasonEditPreview, 'summary' | 'held'>,
): string {
	const { summary } = preview
	const figure = (value: number | null, currency: VolumeCurrency) =>
		value == null ? null : formatNbVolumeFigure(value, currency)
	const words: SeasonEditWords =
		summary.kind === 'season-anchor'
			? {
					kind: 'season-anchor',
					track: nbTrackName(summary.discipline),
					act: summary.act,
					merged: summary.merged,
					weekNumber: summary.weekNumber,
					before: figure(summary.before, summary.currency),
					after: figure(summary.after, summary.currency),
					unit: NB_VOLUME_UNITS[summary.currency],
					changedWeeks: summary.changedWeeks,
				}
			: summary.kind === 'week-target'
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

/**
 * How a changed week's target was worked out (ADR 0121 §1), the "regnet ut"
 * a preview row opens: `Startnivå 40 km fra uke 41, så +5 % for hver av de 3
 * harde ukene i Base. Lett uke i Base: 70 % av uke 43.`
 */
export function seasonEditDerivationMessage(
	derivation: SeasonEditDerivation,
	currency: VolumeCurrency,
	phaseName: string,
): string {
	return seasonAnchorDerivationSentence({
		anchor: {
			figure: `${formatNbVolumeFigure(derivation.anchor.value, currency)} ${NB_VOLUME_UNITS[currency]}`,
			weekNumber: derivation.anchor.weekNumber,
		},
		ramps: derivation.ramps.map((ramp) => ({
			percent: formatNbSignedRate(ramp.ramp),
			loadingWeeks: ramp.loadingWeeks,
			phaseName: ramp.phaseName,
		})),
		boundarySteps: derivation.boundarySteps.map((step) => ({
			percent: formatNbSignedRate(step.step),
			phaseName: step.phaseName,
		})),
		role: derivation.role,
		factorPercent: Math.round(derivation.factor * 100),
		referenceWeekNumber: derivation.reference.weekNumber,
		referenceIsAnchor:
			derivation.reference.weekKey === derivation.anchor.weekKey,
		phaseName,
	})
}
