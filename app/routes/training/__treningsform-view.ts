/**
 * _Bytt treningsform_'s view model (#581): the Start Options for the plan as
 * the lead shows them, presented as the start presents its cards (`cardOf`),
 * with the intro and the notes. Pure; the loader runs it.
 */
import {
	type StartAnswers,
	type StartDraft,
} from '#app/utils/first-run/start-draft.ts'
import {
	nbHoursWords,
	nbLongDay,
	PHILOSOPHY_LABELS,
	START_OPTION_LABELS,
	TRENINGSFORM_LABELS,
} from '#app/utils/labels.ts'
import { type PresetFamily } from '#app/utils/plan-outline/presets.ts'
import { cardOf } from '../start/__start-option-card.tsx'
import { type TreningsformView } from './__treningsform.tsx'

export function treningsformViewOf({
	answers,
	start,
	current,
	levelSaid,
}: {
	answers: StartAnswers
	start: StartDraft
	current: PresetFamily | null
	/** False for an athlete who never said a Training Level. */
	levelSaid: boolean
}): TreningsformView {
	const badge = start.badge ? START_OPTION_LABELS.badge[start.badge] : null
	const strengthChosen = answers.strength?.perWeek ?? null
	const notes: string[] = []
	if (!levelSaid) notes.push(TRENINGSFORM_LABELS.levelUnsaid)
	if (start.merged > 0) {
		notes.push(START_OPTION_LABELS.merged(start.options.length))
	}
	if (current && !start.options.some((option) => option.family === current)) {
		notes.push(TRENINGSFORM_LABELS.currentNotShown(PHILOSOPHY_LABELS[current]))
	}
	return {
		cards: start.options.map((option, index) =>
			cardOf(option, index === 0 ? badge : null, answers.hours, strengthChosen),
		),
		current,
		intro: TRENINGSFORM_LABELS.intro(
			start.options.length,
			nbHoursWords(answers.hours),
			start.daysUsed,
			nbLongDay(start.startWeekKey),
		),
		notes,
	}
}
