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
	lastTimeLabel,
} from '#app/utils/strength/exercise-history.ts'
import { type StrengthRecord } from '#app/utils/strength/records.ts'
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
	/** "Heaviest ever", "Best 5-rep set", "Best estimated 1RM", "Best level". */
	headline: string
	/** "100 kg" or "level 7" — the unit is never dropped. */
	value: string
	/** The equation, on an estimate only. Null on an observed record. */
	estimator: string | null
	achievedLabel: string
	/** "first time!" on a debut, "up 2.5 kg" on a beaten record, else null. */
	gain: string | null
	/** The kilo-less phrase, or null. */
	note: string | null
	comparable: boolean
}

const HEADLINES: Record<
	StrengthRecord['kind'],
	(reps: number | null) => string
> = {
	heaviestLoad: () => 'Heaviest ever',
	repMax: (reps) => `Best ${reps}-rep set`,
	e1RM: () => 'Best estimated 1RM',
	stackLevel: () => 'Best level',
}

/** Kilos to one decimal — the precision a bar is actually loaded to. */
function trim(value: number): string {
	return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function recordValueText(record: StrengthRecord): string {
	return record.unit === 'level'
		? `level ${trim(record.value)}`
		: `${trim(record.value)} kg`
}

/**
 * A debut reads **"first time!"** and not "PR!" — a first-ever dumbbell bench
 * firing four PRs on day one is the failure `DEBUT_PRIOR_SESSIONS` exists to
 * avoid, and this is where that decision becomes words.
 */
function gainText(record: StrengthRecord): string | null {
	if (record.debut) return 'first time!'
	if (record.delta == null || record.delta <= 0) return null
	if (record.unit === 'kg') return `up ${trim(record.delta)} kg`
	return `up ${trim(record.delta)} ${record.delta === 1 ? 'level' : 'levels'}`
}

export function buildRecordCards(
	records: StrengthRecord[],
	timezone: string,
): RecordCard[] {
	return records.map((record) => ({
		key: `${record.exerciseId}-${record.equipment}-${record.kind}-${record.reps ?? 0}`,
		headline: HEADLINES[record.kind](record.reps),
		value: recordValueText(record),
		estimator: record.estimator,
		achievedLabel: formatDayMonth(record.achievedAt, timezone),
		gain: gainText(record),
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
 * The history as points, **oldest first** — reading order for a curve, and the
 * reverse of the query's newest-first order.
 *
 * The bar is scaled to the heaviest session *in view* rather than from zero,
 * because a squat that moved 100 → 105 kg is a flat line from zero and the
 * question the screen answers is "is this lift moving".
 */
export function buildHistoryPoints(
	sessions: ExerciseSessionSummary[],
	timezone: string,
): HistoryPoint[] {
	const kilos = sessions.flatMap((s) =>
		s.topSetKg != null ? [s.topSetKg] : [],
	)
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
				session.topSetKg == null || max == null
					? null
					: floor == null
						? 1
						: (session.topSetKg - floor) / (max - floor),
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
	/** The equation named beside the estimate, or null when none was produced. */
	estimatorNote: string | null
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
		estimatorNote: records.some((record) => record.estimator)
			? `Estimated 1RM uses the ${view.estimator} equation. An estimate is a model, not a lift.`
			: null,
		empty: points.length === 0,
	}
}
