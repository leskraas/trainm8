/**
 * The **Catalogue**'s corpus: the stock rows trainm8 ships, transcribed from
 * `docs/research/` (ADR 0051, #451).
 *
 * This file is the *shape* — the row type, the builders every discipline file
 * uses, and the assembled corpus. The rows themselves live one file per
 * discipline (`catalogue-corpus.run.ts` and friends), because a 140-row corpus
 * in one file is a file nobody reads.
 *
 * Three rules govern every row here, and a test pins each of them
 * (`catalogue-corpus.test.ts`).
 *
 * **1. A row states the anchor its source states, or it states nothing.**
 * `workout-taxonomy.md` §13: *"do not let the app generate a session named
 * after a protocol it did not reproduce. A named protocol carries its intensity
 * anchor or it is not that protocol."* Where the source's anchor family has no
 * `IntensityTarget` kind — Billat's `% vVO2max`, a `% of maximal speed` — the
 * step carries **no intensity at all** and says so in its description. An
 * absent target is an **Unavailable Metric**; substituting a different anchor
 * family would be the overclaim the rule exists to stop.
 *
 * **2. A zone label is not portable, so it is used only where it is honest.**
 * `resolveIntensity` matches a `zoneLabel` against the athlete's recipe by
 * **exact label**, so a row shipping Daniels' `T` resolves for a runner on
 * `daniels-pace-5` and for nobody else. The corpus therefore uses the *generic*
 * vocabulary (`easy`, `endurance`, `tempo`, `threshold`, `max`) — which
 * `zoneLabelToZone` maps to a **Training Zone** for every athlete on every
 * recipe — and reserves it for genuinely zone-level running: warm-ups,
 * cool-downs, jog floats and easy volume. Everywhere the source names a real
 * anchor (`% HRmax`, `% T-pace`, `mmol/L`, `% race pace`, RPE, `% FTP`) the row
 * states that instead, because that is what travels.
 *
 * **3. A Citation is claimed or it is absent — never approximated.** Three
 * provenances and exactly one of them may carry a source: see
 * {@link CorpusProvenance}. No partial citation exists either — the schema's
 * `CatalogueEntry_citation_whole` CHECK would reject one, and `readCitation`
 * reports a fragment as absent anyway.
 */
import {
	type CatalogueGoalEvent,
	type CatalogueLevel,
	type CataloguePhase,
	type Citation,
	type SessionArchetype,
} from './catalogue.ts'
import {
	type CardioDiscipline,
	type Discipline,
	type IntensityTarget,
	type RaceAnchor,
	type RestSpec,
	type SendOff,
	type WorkoutIntent,
	type WorkoutStructure,
} from './workout-schema.ts'

export type CorpusBlock = WorkoutStructure['blocks'][number]
export type CorpusStep = CorpusBlock['steps'][number]

/**
 * Where a row came from — and which rows may carry a **Citation** at all. Every
 * row here is `authorship: 'system'`, because trainm8 did put it in the
 * Catalogue; provenance is the *separate* question of whether a published
 * source stands behind it.
 *
 * - **`corpus`** — transcribed from a `docs/research/` table whose Source
 *   column names a publication. These carry the citation, and they are the
 *   overwhelming majority.
 * - **`convention`** — transcribed from a table whose Source column says
 *   *"coaching convention"*, *"standard practice"* or *"near-universal
 *   convention"* and names no work. The session is real and widely used; the
 *   publication does not exist. Attaching the nearest paper's name to it would
 *   put a citation on something its author never wrote, which is the exact
 *   failure ADR 0051 §4 makes structurally impossible for community content —
 *   and it would be no less a failure for being done by the seed.
 * - **`hand-written`** — written by trainm8 because the research counts an
 *   archetype it never tabled (see `catalogue-corpus.run.ts` §I).
 *
 * Only `corpus` carries a citation. The other two carry `null` and say why in
 * their description.
 */
export type CorpusProvenance = 'corpus' | 'convention' | 'hand-written'

/**
 * The sentence every hand-written row's description opens with. A constant
 * rather than prose per row, so "which rows does trainm8 vouch for as
 * published?" is one grep and not a reading exercise.
 */
export const HAND_WRITTEN_NOTICE =
	'Written by trainm8, not transcribed from a published source. ' +
	'The research corpus counts nine running archetypes and its tables cover ' +
	'eight — tune-up and race-week sessions appear only in its programming ' +
	'matrix, so there was nothing to retrieve. No citation is claimed for this ' +
	'session.'

/** The counterpart for a row the research sources to practice rather than to a
 * publication. */
export const CONVENTION_NOTICE =
	'Widely-used coaching convention: the research names no controlled trial ' +
	'or published protocol for this session, so it carries no citation. The ' +
	'session is standard practice, not an evidenced one.'

export type CorpusSession = {
	/**
	 * The stable identity of a corpus row — `run-C3`, `bike-D2` — carrying the
	 * research document's own row label so a seeded session can be traced back
	 * to the table it came from. The seed is idempotent on this key.
	 */
	key: string
	title: string
	/**
	 * What the row is for, and — where the transcription cost something — what
	 * it cost. Every compromise this corpus makes is written here rather than
	 * left for a reader to discover: a missing anchor family, a two-a-day
	 * session flattened into named blocks, a grade band no scalar column can
	 * hold.
	 */
	description: string
	discipline: Discipline
	intent: WorkoutIntent
	archetype: SessionArchetype
	/** The **level floor**; null means the row is not level-scoped. */
	level: CatalogueLevel | null
	phases: CataloguePhase[]
	goalEvents: CatalogueGoalEvent[]
	provenance: CorpusProvenance
	/** Non-null exactly when `provenance === 'corpus'`. */
	citation: Citation | null
	/** Another row's `key`, where the source names one. Prose progressions that
	 * are not another row ("+10 min per fortnight") are not edges and are left
	 * null rather than invented. */
	progressesTo?: string
	regressesTo?: string
	blocks: CorpusBlock[]
}

// ——— Intensity Target builders —————————————————————————————————————————
//
// One per anchor family the corpus uses, named the way the research names it,
// so a transcribed row reads next to its source table.

/** A generic **Training Zone** label — see rule 2 above. */
export const zone = (label: string): IntensityTarget => ({
	kind: 'zoneLabel',
	label,
})
export const rpe = (min: number, max?: number): IntensityTarget => ({
	kind: 'rpe',
	min,
	...(max == null ? {} : { max }),
})
/** `% HRmax` (Helgerud, Olympiatoppen) or `% LTHR` (Friel). */
export const hrPct = (
	ref: 'max' | 'lthr',
	minPct: number,
	maxPct?: number,
): IntensityTarget => ({
	kind: 'hrPct',
	ref,
	minPct,
	...(maxPct == null ? {} : { maxPct }),
})
/**
 * `% of threshold pace`. The percentage is of **speed**, so `minPct` is the
 * easy edge: `95 %` is slower than threshold and `102 %` faster.
 */
export const pacePct = (minPct: number, maxPct?: number): IntensityTarget => ({
	kind: 'pacePct',
	minPct,
	...(maxPct == null ? {} : { maxPct }),
})
/**
 * `% of FTP`, `% of MAP` or `% of CP` — the reference is stated because a bare
 * percentage is not portable and CP ≠ FTP.
 */
export const powerPct = (
	ref: 'ftp' | 'map' | 'cp',
	minPct: number,
	maxPct?: number,
): IntensityTarget => ({
	kind: 'powerPct',
	ref,
	minPct,
	...(maxPct == null ? {} : { maxPct }),
})
/**
 * Blood lactate — the Norwegian sub-threshold family's authored anchor, with
 * pace as a derived facet (#435). It resolves only for an athlete on a recipe
 * that publishes lactate (`norwegian-threshold-run`, `olt-hr-5-*`); on the
 * default `daniels-pace-5` it reads as its bare anchor, which is correct.
 */
export const lactate = (
	minMmol: number,
	maxMmol?: number,
): IntensityTarget => ({
	kind: 'lactate',
	minMmol,
	...(maxMmol == null ? {} : { maxMmol }),
})
/** `@ 105 % MP`, `@ 95 % 5k` — Canova's whole system. The percentage is of
 * race **speed**, so `105 %` is faster than race pace. */
export const racePace = (
	event: RaceAnchor,
	minPct?: number,
	maxPct?: number,
): IntensityTarget => ({
	kind: 'racePace',
	event,
	...(minPct == null ? {} : { minPct }),
	...(maxPct == null ? {} : { maxPct }),
})

// ——— Step and Block builders ——————————————————————————————————————————

type CardioSpec = {
	durationSec?: number
	distanceM?: number
	/** The third Step Quantity — metres of climb, exclusive with the other two. */
	verticalM?: number
	intensity?: IntensityTarget
	cadenceRpmMin?: number
	cadenceRpmMax?: number
	gradePct?: number
	notes?: string
}

function cardio(discipline: CardioDiscipline) {
	return (spec: CardioSpec): CorpusStep => ({
		kind: 'cardio',
		discipline,
		...spec,
	})
}

export const run = cardio('run')
export const bike = cardio('bike')
export const swim = cardio('swim')

/** A `time` rest — the only form that states a duration. */
export const rest = (durationSec: number): CorpusStep => ({
	kind: 'rest',
	rest: { kind: 'time', durationSec },
})
/** Any other **Rest Spec** form: `jog back down`, `200 m jog`, `until HR < 120`. */
export const restAs = (spec: RestSpec, notes?: string): CorpusStep => ({
	kind: 'rest',
	rest: spec,
	...(notes == null ? {} : { notes }),
})

export function block(
	steps: CorpusStep[],
	opts: {
		name?: string
		repeat?: number
		/** The outer repeat level: `3 × (13 × 30/15)` is `series: 3`, `repeat: 13`. */
		series?: number
		betweenSeriesRestSec?: number
		sendOff?: SendOff
	} = {},
): CorpusBlock {
	return {
		...(opts.name == null ? {} : { name: opts.name }),
		repeatCount: opts.repeat ?? 1,
		...(opts.series == null ? {} : { seriesRepeatCount: opts.series }),
		...(opts.betweenSeriesRestSec == null
			? {}
			: { betweenSeriesRestSec: opts.betweenSeriesRestSec }),
		...(opts.sendOff == null ? {} : { sendOff: opts.sendOff }),
		steps,
	}
}

/** Minutes, in seconds — the unit every research table writes in. */
export const min = (m: number) => Math.round(m * 60)
/** Hours, in seconds. */
export const hours = (h: number) => Math.round(h * 3600)
/** Kilometres, in metres. */
export const km = (k: number) => Math.round(k * 1000)
