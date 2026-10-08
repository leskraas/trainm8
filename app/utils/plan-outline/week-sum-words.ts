/**
 * The words for what one session does to its week (#505 stories 37 and 39):
 * the writing line's preview line and the toast after a change. The arithmetic
 * is `week-sum.ts`'s; every word is `labels.ts`'s (ADR 0081).
 */
import { formatNbVolumeFigure } from '../format.ts'
import {
	NB_DISCIPLINE_LABELS,
	WEEK_SUM_LABELS,
	unmeasuredCountLabel,
} from '../labels.ts'
import { type VolumeCurrency } from './derive.ts'
import { trackForDiscipline, type WeekSumPreview } from './week-sum.ts'
import { type WeekVolumes } from './week-volumes.ts'

function figure(value: number | null, currency: VolumeCurrency): string {
	return formatNbVolumeFigure(value ?? 0, currency)
}

/** `40 → 46 km` or `40 km, +1 uten km`: the sum's move, never a silent zero. */
function sumMove({
	before,
	after,
	currency,
	unmeasured,
}: {
	before: number | null
	after: number | null
	currency: VolumeCurrency
	unmeasured: number
}): string {
	const unit = WEEK_SUM_LABELS.unit(currency)
	const moved =
		(before ?? 0) === (after ?? 0)
			? `${figure(after, currency)} ${unit}`
			: `${figure(before, currency)} → ${figure(after, currency)} ${unit}`
	if (unmeasured === 0) return moved
	const count =
		unmeasured > 0
			? unmeasuredCountLabel(unmeasured, currency)
			: unmeasuredCountLabel(-unmeasured, currency, '−')
	return `${moved}, ${count}`
}

/** The preview's line under the writing line: `40 → 46 km, målet står på 52`. */
export function weekSumPreviewLine(preview: WeekSumPreview): string {
	if (preview.kind === 'annet') return WEEK_SUM_LABELS.annetPreview
	if (preview.kind === 'no-plan') return WEEK_SUM_LABELS.noPlanPreview
	const move = sumMove({
		before: preview.before,
		after: preview.after,
		currency: preview.currency,
		unmeasured: preview.unmeasuredAdded,
	})
	const pricedLater =
		preview.addedAbsence === 'priced-on-save'
			? `, ${WEEK_SUM_LABELS.pricedOnSave(preview.currency)}`
			: ''
	const target =
		preview.target == null
			? WEEK_SUM_LABELS.noTargetPreview
			: WEEK_SUM_LABELS.targetStands(
					formatNbVolumeFigure(preview.target, preview.currency),
				)
	// `40 → 46 km, målet …` but `40 km, +1 uten km — målet …`: a dash once the
	// line already has a comma, so the target does not read as a third count.
	const joiner = preview.unmeasuredAdded > 0 || pricedLater ? ' — ' : ', '
	return `${move}${pricedLater}${joiner}${target}`
}

/**
 * The toast after a change (#505 story 39): the sum before → after and that
 * the target stayed. `before` and `after` are the same week read on both sides
 * of the write.
 */
export function weekSumChangeLine({
	before,
	after,
	discipline,
	weekName,
	change,
}: {
	before: WeekVolumes
	after: WeekVolumes
	discipline: string
	/** `Denne uka`, `Uke 41` — the week's relative name. */
	weekName: string
	change: 'added' | 'removed'
}): string {
	const was = trackForDiscipline(before, discipline)
	const now = trackForDiscipline(after, discipline)
	if (!was || !now) {
		return after.tracks.length === 0
			? WEEK_SUM_LABELS.noPlanChange(change)
			: WEEK_SUM_LABELS.annetChange(change)
	}
	const move = sumMove({
		before: was.planned,
		after: now.planned,
		currency: now.currency,
		unmeasured: now.plannedUnmeasuredCount - was.plannedUnmeasuredCount,
	})
	const sport =
		(NB_DISCIPLINE_LABELS as Record<string, string>)[discipline] ?? discipline
	const target =
		now.target == null
			? WEEK_SUM_LABELS.noTargetChange
			: WEEK_SUM_LABELS.targetStayed(
					formatNbVolumeFigure(now.target, now.currency),
				)
	return `${sport} ${weekName.toLowerCase()}: ${move}. ${target}`
}
