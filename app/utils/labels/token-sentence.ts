/**
 * The Token Sentence's own words (owner decision 8, ADR 0089): its glue words,
 * rest acts and the popover titles. Part of `labels.ts` (ADR 0081): import
 * from the barrel.
 */

// `import type`, for the runtime-leaf reason `labels.ts`'s header gives.
/* eslint-disable import/consistent-type-specifier-style */
import type { RestAct } from '../workout-schema.ts'
/* eslint-enable import/consistent-type-specifier-style */
import { capitalize } from './_helpers.ts'

// ---------------------------------------------------------------------------
// Token Sentence words (owner decision 8, round 2; ADR 0089)
// ---------------------------------------------------------------------------

/**
 * The **Token Sentence**'s own words in Norwegian, wherever it is drawn: the
 * echo under the writing line, a session's row, the Workout Detail View and
 * its editor. They replace ADR 0027 A3's English glue (`rest`, `+ block`,
 * `repeat count`) on display only — nothing stored is a word from here: a rest
 * is a `RestSpec`, a zone is its stored label, and the writing line's grammar
 * (`p 90 s`, `pause`) is read in `workout-sentence.ts`, not here.
 */
export const TOKEN_SENTENCE_WORDS = {
	/** A rest with nothing more said, and the word after a rest's time. */
	rest: 'pause',
	/** `1 min 30 s pause`. */
	restFor: (duration: string) => `${duration} pause`,
	/** A recovery by distance: `200 m rolig`. */
	recoveryOver: (distance: string) => `${distance} rolig`,
	/** A recovery that ends at a heart rate: `til puls < 120 bpm`. */
	untilHeartRate: (bpm: number) => `til puls < ${bpm} bpm`,
	untilHeartRatePct: (pct: number) => `til puls < ${pct} % av maks`,
	/** A send-off: the set leaves on a clock, `på 1:40`, `på CSS + 10 s`. */
	sendOff: (clock: string) => `på ${clock}`,
	/** Metres of climb: `200 hm`. */
	vertical: (metres: number) => `${metres} hm`,
	/** The rest between two series of a block: `10 min seriepause`. */
	betweenSeries: (duration: string) => `${duration} seriepause`,
	/** The series badge, read aloud: `3 serier`. */
	seriesCount: (count: number) => `${count} serier`,
	/** Cadence's unit — the number before it is the prescription (#466). */
	cadence: 'rpm',
	/** A grade band's direction: `4–7 % motbakke`, `3–6 % utforbakke`. */
	uphill: 'motbakke',
	downhill: 'utforbakke',
	/** Between the ends of a grade band across level ground, which has no one
	 * direction to name: `−2 til +3 %`. */
	gradeTo: 'til',
	/** The placeholders a step shows before its exercise or sets are chosen. */
	exercise: 'øvelse',
	sets: 'sett',
	/** A load with no number. */
	bodyweight: 'kroppsvekt',
	bodyweightPlus: (kg: string) => `kroppsvekt + ${kg} kg`,
	bodyweightMinus: (kg: string) => `kroppsvekt − ${kg} kg`,
	pctBodyweight: (pct: number) => `${pct}% kroppsvekt`,
	/** The absence beside a load that needs an anchor this athlete lacks. */
	noRepMax: (reps: number) => `ingen ${reps}RM registrert`,
	no1RM: 'ingen 1RM registrert',
	noBodyweight: 'ingen kroppsvekt registrert',
	notALoad: 'ingen belastning',
	/** The editor's last line: one more block. */
	addBlock: '+ blokk',
	addBlockAction: 'Legg til blokk',
} as const

/** A rest that is an act, not a clock (ADR 0007). */
export const REST_ACT_WORDS: Record<RestAct, string> = {
	jogBack: 'jogg tilbake',
	walkDown: 'gå ned',
	rideDown: 'sykle ned',
	swimDown: 'svøm rolig',
}

/**
 * The title over a token's popover in the editor — `ganger`, not `REPEAT
 * COUNT`. Keyed by the editor's own kinds of popover.
 */
export const TOKEN_EDITOR_TITLES = {
	duration: 'mengde',
	distance: 'mengde',
	repeat: 'ganger',
	rest: 'pause',
	restSeconds: 'pause',
	notes: 'notat',
	intensity: 'intensitet',
	sets: 'sett',
	discipline: 'idrett',
} as const

/**
 * A stored zone label read in Norwegian. The English words the archetype
 * seeds, the stamp's older rows and the Catalogue store (`easy`, `threshold`)
 * read as the words the athletes train in; a zone code (`Z2`, `I4`, `T`) and a
 * Norwegian word are already what the athlete reads, and pass through. The
 * stored label never changes.
 */
const ZONE_LABEL_WORDS: Record<string, string> = {
	recovery: 'restitusjon',
	easy: 'rolig',
	endurance: 'rolig',
	aerobic: 'rolig',
	steady: 'moderat',
	moderate: 'moderat',
	tempo: 'tempo',
	threshold: 'terskel',
	'sub-threshold': 'under terskel',
	subthreshold: 'under terskel',
	interval: 'intervall',
	intervals: 'intervall',
	vo2max: 'hardt',
	'vo2 max': 'hardt',
	'vo₂ max': 'hardt',
	hard: 'hardt',
	max: 'maks',
	maximal: 'maks',
	'warm-up': 'oppvarming',
	warmup: 'oppvarming',
	'cool-down': 'nedjogg',
	cooldown: 'nedjogg',
}

/** `Rolig` for a stored `easy`; `Z2` for `Z2`. Capitalised, as the chip draws it. */
export function zoneLabelWord(label: string): string {
	const trimmed = label.trim()
	const word = ZONE_LABEL_WORDS[trimmed.toLowerCase()] ?? trimmed
	return capitalize(word)
}
