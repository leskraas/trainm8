/**
 * **The session in its own numbers** — the figures that lead the Workout
 * Detail View's header (#505 round 2, Arket M: "the sport's own currency
 * first"). `10 km · 50 min` for a run in a km track, `1 t 50 min · 18 km` in an
 * hours track, `15 sett · 3 løft · opptil 82,5 kg` for a lift. The sentence and
 * these numbers lead; prose and provenance follow them.
 *
 * It reads the session the way I dag's row does (`sessionVolume` in
 * `_home/timeline/presenter.ts`), so the page "Se økta" opens and the row it
 * was opened from never disagree:
 *
 * - the **track's own unit** comes first, where the plan has a track for the
 *   sport; without one a lift leads with sets, anything else with km where it
 *   has them and time where it does not;
 * - a **done** session says what was **recorded** (or logged), never what was
 *   asked, and says nothing when nothing came in;
 * - a **missed** or skipped session has no figures: nothing was done;
 * - a unit the prescription does not carry **end to end** is left out — a
 *   "20 min + 5 × 1000 m" session is not 5 km (the Week Pattern's rule,
 *   `fixedDayVolume`) — so a figure is never understated.
 *
 * Pure: every number is passed in, nothing is queried.
 */
import { prescribedDuration, sumBlockSets } from '#app/utils/dashboard.ts'
import { type DisciplineThresholdMap } from '#app/utils/intensity-target.ts'
import {
	nbDurationLabel,
	nbKgLabel,
	sessionVolumeLabel,
} from '#app/utils/labels.ts'
import { type VolumeCurrency } from '#app/utils/plan-outline/derive.ts'
import { fixedDayVolume } from '#app/utils/plan-outline/week-pattern.ts'

/** The prescription as this reads it — a structural slice of the loader's
 * Workout, so a test can hand one over without a database row. */
export type SummaryWorkout = {
	blocks: Array<{
		repeatCount: number
		seriesRepeatCount?: number | null
		betweenSeriesRestSec?: number | null
		steps: Array<{
			kind: string
			discipline?: string | null
			/** Stored Intensity Target JSON: the pace a distance step is timed by. */
			intensity?: string | null
			durationSec: number | null
			distanceM: number | null
			exerciseId: string | null
			sets: ReadonlyArray<{ weightKg: number | null }>
		}>
	}>
}

export type SessionSummaryInput = {
	discipline: string
	status: string
	/** The Volume Currency of the plan's track for this sport, or null. */
	currency: VolumeCurrency | null
	workout: SummaryWorkout | null
	/** The athlete's thresholds, which time a distance step with no pace. */
	thresholds?: DisciplineThresholdMap
	recording: { distanceM: number | null; durationSec: number | null } | null
	/** Completed working sets logged on this session (ADR 0056). */
	loggedSets: number
	/**
	 * A **Simple Activity** (ADR 0015 §A): done by _Gjort_ with no Recording,
	 * its planned time is what was done, so it says that rather than nothing.
	 */
	simpleActivity?: boolean
}

export type SummaryFigure = {
	text: string
	/** What the figure counts: the lead one is the track's unit. */
	unit: 'km' | 'hours' | 'sets' | 'lifts' | 'kg'
}

type Figures = {
	km: number | null
	seconds: number | null
	sets: number | null
	lifts: number | null
	topKg: number | null
}

/**
 * The header's figures, the lead one first. Empty where the session has no
 * number worth stating — the sentence below still says what it is.
 */
export function buildSessionSummary(
	input: SessionSummaryInput,
): SummaryFigure[] {
	if (input.status === 'missed' || input.status === 'skipped') return []
	const doneByHand =
		input.simpleActivity === true &&
		input.status === 'completed' &&
		input.recording == null
	const figures =
		input.status === 'completed' && !doneByHand
			? recordedFigures(input)
			: plannedFigures(input)
	if (!figures) return []

	const lead: VolumeCurrency =
		input.currency ??
		(input.discipline === 'strength'
			? 'sets'
			: figures.km != null
				? 'km'
				: 'hours')

	const order: Array<SummaryFigure['unit']> =
		lead === 'sets'
			? ['sets', 'lifts', 'kg', 'km', 'hours']
			: lead === 'hours'
				? ['hours', 'km', 'sets', 'lifts', 'kg']
				: ['km', 'hours', 'sets', 'lifts', 'kg']

	return order.flatMap((unit) => {
		const text = figureText(unit, figures)
		return text ? [{ text, unit }] : []
	})
}

function figureText(
	unit: SummaryFigure['unit'],
	figures: Figures,
): string | null {
	switch (unit) {
		case 'km':
			return figures.km != null && figures.km > 0
				? sessionVolumeLabel(figures.km, 'km')
				: null
		case 'hours':
			return figures.seconds != null && figures.seconds > 0
				? nbDurationLabel(roundToMinute(figures.seconds))
				: null
		case 'sets':
			return figures.sets != null && figures.sets > 0
				? sessionVolumeLabel(figures.sets, 'sets')
				: null
		case 'lifts':
			return figures.lifts != null && figures.lifts > 0
				? `${figures.lifts} løft`
				: null
		case 'kg':
			return figures.topKg != null && figures.topKg > 0
				? `opptil ${nbKgLabel(figures.topKg)}`
				: null
	}
}

/** A session's time to the minute — `1 t 2 min`, not `1 t 2 min 5 s` — but a
 * session shorter than a minute keeps its seconds. */
function roundToMinute(seconds: number): number {
	return seconds < 60 ? seconds : Math.round(seconds / 60) * 60
}

function recordedFigures(input: SessionSummaryInput): Figures | null {
	const { recording, loggedSets } = input
	const km = recording?.distanceM != null ? recording.distanceM / 1000 : null
	const seconds = recording?.durationSec ?? null
	const sets = loggedSets > 0 ? loggedSets : null
	if (km == null && seconds == null && sets == null) return null
	return { km, seconds, sets, lifts: null, topKg: null }
}

function plannedFigures(input: SessionSummaryInput): Figures | null {
	const { workout } = input
	if (!workout) return null
	const blocks = workout.blocks
	const sets = sumBlockSets(blocks)
	const exercises = new Set(
		blocks.flatMap((block) =>
			block.steps.flatMap((step) =>
				step.kind === 'strength' && step.exerciseId ? [step.exerciseId] : [],
			),
		),
	)
	const kilos = blocks.flatMap((block) =>
		block.steps.flatMap((step) =>
			step.sets.flatMap((set) => (set.weightKg != null ? [set.weightKg] : [])),
		),
	)
	const cardio = blocks.some((block) =>
		block.steps.some((step) => step.kind !== 'strength'),
	)
	return {
		// A lifting session's steps carry no km or time, and a rest between
		// lifts would make one up; only a session with cardio in it reads them.
		km: cardio ? fixedDayVolume(blocks, 'km') : null,
		seconds: cardio ? prescribedSeconds(blocks, input.thresholds) : null,
		sets: sets > 0 ? sets : null,
		lifts: exercises.size > 0 ? exercises.size : null,
		topKg: kilos.length > 0 ? Math.max(...kilos) : null,
	}
}

/**
 * The prescription's time in seconds, unrounded, by `fixedDayVolume`'s rule:
 * null unless **every** step is timed (a distance step through its pace,
 * `prescribedDuration`). Not `fixedDayVolume(…, 'hours')`, whose
 * tenth-of-an-hour precision is a week's and would say a 45-minute run is 48
 * minutes.
 */
function prescribedSeconds(
	blocks: SummaryWorkout['blocks'],
	thresholds?: DisciplineThresholdMap,
): number | null {
	const duration = prescribedDuration(blocks, thresholds)
	return duration?.complete ? duration.seconds : null
}
