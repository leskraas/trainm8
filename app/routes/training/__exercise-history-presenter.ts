/**
 * **The presenter for per-exercise history and records.**
 *
 * Pure `build*` functions mapping the loader's domain data onto the view models
 * the surface renders, following `app/routes/_home/cockpit/presenter.ts`. The
 * components stay dumb, and every rule about what the screen *says* is testable
 * without a route, a database or a DOM.
 *
 * Pure in the repo's sense: `now` and the timezone are arguments, nothing
 * queries, nothing is random, nothing is mutated.
 *
 * **It formats and it never invents.** A session with no honest kilo keeps its
 * place in its own history with `kg: null` and says why in one phrase; the
 * kilo-less phrase is never replaced by a zero to keep a chart continuous, and a
 * missing kilo never interpolates from its neighbours.
 */
import { formatDayMonth } from '#app/utils/format.ts'
import {
	type ExerciseSessionSummary,
	type SessionLoadBasis,
	lastTimeLabel,
} from '#app/utils/strength/exercise-history.ts'
import { formatKg } from '#app/utils/strength/program.constants.ts'
import {
	type StrengthRecord,
	recordGainPhrase,
	strengthRecordHeadline,
} from '#app/utils/strength/records.ts'
import { type EquipmentId } from '#app/utils/strength-log.ts'
import {
	type ExerciseHistoryView,
	type ExerciseVariantTab,
} from '#app/utils/strength-records.server.ts'

/**
 * The one phrase an exercise with no honest kilo gets. A machine stack, a band
 * and an unloaded hold still progress **against themselves** — level 6 → 7 is
 * real — so the reading ships with this sentence rather than being withheld or
 * given a fabricated kilo.
 *
 * Stated here because `strength/records.ts` keeps its copy private; it reaches
 * this surface on a record's `unavailableNote`, and this constant covers the case
 * where there is history but no record yet.
 */
export const NO_KILOS_NOTE = 'No kilos — this progresses against itself only.'

export const EQUIPMENT_LABELS: Record<EquipmentId, string> = {
	barbell: 'Barbell',
	dumbbell: 'Dumbbell',
	kettlebell: 'Kettlebell',
	machine: 'Machine',
	cable: 'Cable',
	'smith-machine': 'Smith machine',
	'trap-bar': 'Trap bar',
	'ez-bar': 'EZ bar',
	bodyweight: 'Bodyweight',
	'assisted-machine': 'Assisted machine',
	band: 'Band',
	'medicine-ball': 'Medicine ball',
	sled: 'Sled',
	suspension: 'Suspension',
	other: 'Other',
}

// ---------------------------------------------------------------------------
// The records strip
// ---------------------------------------------------------------------------

/**
 * One record as the strip renders it. The caveat sits **on** the number: an
 * estimate names its equation and an ordinal says it cannot be compared, rather
 * than waiting in a footnote nobody reads.
 */
export type RecordCard = {
	key: string
	/** "Heaviest ever", "Best 5-rep set", "Heaviest bodyweight set", "Best level"
	 * — the load basis is named **in** the headline, never only in the note. */
	headline: string
	/** "100 kg" or "level 7" — the unit is never dropped. */
	value: string
	/** The equation, on an estimate only. Null on an observed record. */
	estimator: string | null
	achievedLabel: string
	/** "first time!" where nothing came before, "best so far" inside the debut
	 * window, "up 2.5 kg" on a beaten record, else null. */
	gain: string | null
	/** The kilo-less phrase, or null. */
	note: string | null
	comparable: boolean
}

function recordValueText(record: StrengthRecord): string {
	return record.unit === 'level'
		? `level ${formatKg(record.value)}`
		: `${formatKg(record.value)} kg`
}

export function buildRecordCards(
	records: StrengthRecord[],
	timezone: string,
): RecordCard[] {
	return records.map((record) => ({
		// The load basis is part of the key because it is part of the record: a
		// weighted dip and a barbell press on one lift are two `heaviestLoad`
		// readings, and a key without the basis would collide them.
		key: `${record.exerciseId}-${record.equipment}-${record.loadBasis}-${record.kind}-${record.reps ?? 0}`,
		// The headline is `strengthRecordHeadline`'s and is not restated here, for
		// the same reason the gain phrase is not: the banner and this strip must
		// name one reading one way. A second copy is what let "Heaviest ever" sit
		// over a bodyweight-derived kilo on this page alone.
		headline: strengthRecordHeadline(record),
		value: recordValueText(record),
		estimator: record.estimator,
		achievedLabel: formatDayMonth(record.achievedAt, timezone),
		// The phrase is `recordGainPhrase`'s and is not restated here: a record
		// that reads "first time!" on the runner's banner must read the same on
		// this page, and this page is where last time's session is visible.
		gain: recordGainPhrase(record),
		note: record.unavailableNote,
		comparable: record.crossExerciseComparable,
	}))
}

// ---------------------------------------------------------------------------
// The set-by-set history
// ---------------------------------------------------------------------------

/**
 * One past session on the curve. `kg` is `null` where no honest kilo exists, and
 * the row is still here: the session happened, and `text` says what it was.
 * `barFraction` is `null` for the same rows, so a kilo-less session cannot be
 * drawn as a bar of length zero beside real loads.
 */
export type HistoryPoint = {
	sessionId: string
	dateLabel: string
	kg: number | null
	text: string
	workingSetCount: number
	comparable: boolean
	/** 0–1 against the heaviest session in view, or null with no kilo. */
	barFraction: number | null
}

/**
 * The curve's own basis: the first pile that appears in it, bar first — the same
 * preference `exercise-history.ts` picks a session's headline with, and the same
 * one the records strip reports in.
 */
const CURVE_BASIS_ORDER: SessionLoadBasis[] = [
	'bar',
	'perHand',
	'bodyweightDerived',
]

/**
 * The history as points, **oldest first** — reading order for a curve, and the
 * reverse of the query's newest-first order.
 *
 * The bar is scaled to the heaviest session *in view* rather than from zero,
 * because a squat that moved 100 → 105 kg is a flat line from zero and the
 * question the screen answers is "is this lift moving".
 *
 * **One axis, one basis.** A session's kilo is only comparable inside its own
 * {@link ExerciseSessionSummary.loadBasis}, so the scale is taken from the
 * sessions of the leading basis alone and every other session is drawn as its text
 * with no bar. A dip-belt session bakes the athlete into 104 kg and used to
 * stretch the axis of a lift whose heaviest bar was 30 kg, making the belt session
 * the tallest bar on the page.
 */
export function buildHistoryPoints(
	sessions: ExerciseSessionSummary[],
	timezone: string,
): HistoryPoint[] {
	const basis =
		CURVE_BASIS_ORDER.find((candidate) =>
			sessions.some((s) => s.loadBasis === candidate),
		) ?? null
	const onAxis = (s: ExerciseSessionSummary): boolean =>
		s.loadBasis === basis && s.topSetKg != null
	const kilos = sessions.flatMap((s) => (onAxis(s) ? [s.topSetKg!] : []))
	const max = kilos.length > 0 ? Math.max(...kilos) : null
	const min = kilos.length > 0 ? Math.min(...kilos) : null
	// A single kilo session, or a plateau, has no span to scale against; a full
	// bar is honest there and a division by zero is not.
	const span = max != null && min != null ? max - min : 0
	const floor = min != null && span > 0 ? min - span * 0.25 : null

	return [...sessions]
		.sort((a, b) => a.performedAt.getTime() - b.performedAt.getTime())
		.map((session) => ({
			sessionId: session.sessionId,
			dateLabel: formatDayMonth(session.performedAt, timezone),
			kg: session.topSetKg,
			text: session.topSetText,
			workingSetCount: session.workingSetCount,
			comparable: session.comparable,
			barFraction:
				!onAxis(session) || max == null
					? null
					: floor == null
						? 1
						: (session.topSetKg! - floor) / (max - floor),
		}))
}

// ---------------------------------------------------------------------------
// The whole screen
// ---------------------------------------------------------------------------

export type VariantTabView = {
	equipment: EquipmentId | null
	label: string
	sessionCount: number | null
	current: boolean
}

/**
 * The variant switcher. The pair `(exercise, equipment)` is the progression key,
 * so each tab is a **separate history** — a lighter dumbbell day is never a
 * regression against a barbell. "All variants" is offered only when there is
 * more than one, because a single-variant lift has nothing to switch between.
 */
export function buildVariantTabs(
	variants: ExerciseVariantTab[],
	current: EquipmentId | null,
): VariantTabView[] {
	if (variants.length === 0) return []
	const tabs: VariantTabView[] = variants.map((variant) => ({
		equipment: variant.equipment,
		label: EQUIPMENT_LABELS[variant.equipment],
		sessionCount: variant.sessionCount,
		current: current === variant.equipment,
	}))
	if (variants.length === 1) return tabs
	return [
		{
			equipment: null,
			label: 'All variants',
			sessionCount: null,
			current: current == null,
		},
		...tabs,
	]
}

export type ExerciseHistoryViewModel = {
	title: string
	/** "Last time: 4 days ago", or "First time on this lift". */
	lastTime: string
	/** What the top set was last time, as text. Null on a first time. */
	lastTimeText: string | null
	variantTabs: VariantTabView[]
	records: RecordCard[]
	points: HistoryPoint[]
	/** Newest first — the set-by-set list under the curve. */
	sessions: HistoryPoint[]
	/** Stated once when nothing in this history has an honest kilo. */
	noKilosNote: string | null
	/** Why an assisted lift takes no record, stated where the strip would
	 * otherwise just be empty. Null where no assisted work was logged. */
	recordsRefused: string | null
	/** The equation named beside the estimate, or null when none was produced. */
	estimatorNote: string | null
	/** Why there is no estimated 1RM, in the estimator's own sentence. Null where
	 * there is one. An absent row is stated, never silently dropped. */
	oneRmUnavailable: string | null
	/** No qualifying work on this lift at all. */
	empty: boolean
}

export function buildExerciseHistoryViewModel(
	view: ExerciseHistoryView,
): ExerciseHistoryViewModel {
	const points = buildHistoryPoints(view.sessions, view.timezone)
	const anyKilos = points.some((point) => point.kg != null)
	const records = buildRecordCards(view.records, view.timezone)

	return {
		title: view.exercise.name,
		lastTime: lastTimeLabel(view.lastTime, view.now),
		lastTimeText: view.lastTime?.topSetText ?? null,
		variantTabs: buildVariantTabs(view.variants, view.equipment),
		records,
		points,
		sessions: [...points].reverse(),
		// The phrase belongs on the screen **exactly once**. A record carries it
		// where there is one (an ordinal record says so on the number), and this
		// covers the history that has no kilo and no record either — a band, an
		// unloaded hold — rather than repeating what a card already said.
		noKilosNote:
			points.length > 0 &&
			!anyKilos &&
			!records.some((record) => record.note != null)
				? NO_KILOS_NOTE
				: null,
		recordsRefused: view.recordsRefused,
		// Said only where the row is missing: `view.oneRmUnavailable` is already
		// null whenever an estimate exists, and this guard keeps a note from
		// appearing beside a number that answers it.
		oneRmUnavailable: view.records.some((record) => record.kind === 'e1RM')
			? null
			: view.oneRmUnavailable,
		estimatorNote: records.some((record) => record.estimator)
			? `Estimated 1RM uses the ${view.estimator} equation. An estimate is a model, not a lift.`
			: null,
		empty: points.length === 0,
	}
}
