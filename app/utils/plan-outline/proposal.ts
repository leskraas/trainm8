// What the planning surface proposes when the athlete authors a Training Track:
// its **Volume Currency** and the first **Season Anchor** value.
//
// The two are one act (ADR 0043 §2): the anchor is pre-filled "from actuals …
// with the derivation shown" (ADR 0040 §6), and stating that value already
// requires choosing a unit. So what gets proposed is the **least-derived unit
// that can express the athlete's history** — distance for an endurance
// discipline with hours offered beside it, sets for strength with no choice
// offered at all, and *nothing* where there is no history to read.
//
// Pure: the window's logged volume arrives as a value (`LoggedVolume`), read by
// `history.server.ts`. Nothing here formats — the derivation travels as a
// structured value and the display layer words it (ADR 0023).

import { CARDIO_DISCIPLINES, type Discipline } from '../workout-schema.ts'
import { type VolumeCurrency } from './derive.ts'

/**
 * How many complete Training Weeks the anchor pre-fill averages over.
 *
 * Four, following ADR 0040 §6's own copy ("your last 4 weeks averaged 5.8 h") —
 * long enough to survive one missed week, short enough to describe the athlete's
 * *current* volume rather than their season.
 */
export const ANCHOR_WINDOW_WEEKS = 4

/** One Discipline's logged volume over the pre-fill window. */
export type LoggedVolume = {
	discipline: Discipline
	/** Completed sessions in the window. Zero means there is no history to read. */
	sessions: number
	/** Weeks of the window carrying at least one completed session. */
	weeksTrained: number
	/** Kilometres recorded, or null where nothing in the window recorded a distance. */
	km: number | null
	/** Hours recorded, or null where nothing in the window recorded a duration. */
	hours: number | null
	/** Total working sets — strength's own quantity; null for an endurance discipline. */
	sets: number | null
}

/**
 * Where a pre-filled anchor value came from, as a value object rather than a
 * sentence — the athlete's own recent training, and the arithmetic over it. The
 * average is `total / windowWeeks`, and `weeksTrained` is what tells an athlete
 * who trained twice in four weeks why the number reads low.
 */
export type AnchorDerivation = {
	source: 'recent-training'
	windowWeeks: number
	weeksTrained: number
	/** The window's total, in `currency`. */
	total: number
	currency: VolumeCurrency
}

/** What the surface proposes for one Training Track, all of it overridable. */
export type TrackProposal = {
	discipline: Discipline
	/**
	 * The proposed **Volume Currency**, or null when there is no history to read
	 * it from — "honest beats guessing" (ADR 0043 §2), so the athlete picks.
	 */
	currency: VolumeCurrency | null
	/** Every currency this discipline may author, the proposed one first. */
	offered: VolumeCurrency[]
	/**
	 * The pre-filled first **Season Anchor** value with its derivation, or null
	 * where the history cannot express one. Authored from here on: it never moves
	 * as activities import in the background (ADR 0040 §6).
	 */
	anchor: { value: number; derivation: AnchorDerivation } | null
}

/**
 * The currencies a Discipline may author its volume in.
 *
 * Strength gets exactly one — `sets`, a systemic weekly count (ADR 0047 §2) —
 * because the athlete is not asked to pick a unit strength cannot express
 * (ADR 0043 §2). An endurance discipline gets the other three; which of them is
 * *proposed* is `proposeTrack`'s.
 */
export function currencyOptionsFor(discipline: Discipline): VolumeCurrency[] {
	return isEndurance(discipline) ? ['km', 'hours', 'tss'] : ['sets']
}

function isEndurance(discipline: Discipline): boolean {
	return (CARDIO_DISCIPLINES as readonly string[]).includes(discipline)
}

/** The window total a currency reads, or null where the history cannot express it. */
function totalIn(
	volume: LoggedVolume,
	currency: VolumeCurrency,
): number | null {
	const total =
		currency === 'km'
			? volume.km
			: currency === 'hours'
				? volume.hours
				: currency === 'sets'
					? volume.sets
					: null
	// A total of 0 is not a volume to plan from: an anchor of 0 makes every derived
	// week 0 for the life of the plan (ADR 0040 §3 is multiplicative).
	return total != null && total > 0 ? total : null
}

/** Decimals a pre-filled anchor carries — enough to be typeable, no more. */
function roundAnchor(value: number, currency: VolumeCurrency): number {
	const decimals = currency === 'km' || currency === 'hours' ? 1 : 0
	const factor = 10 ** decimals
	return Math.round(value * factor) / factor
}

/**
 * The Volume Currency and first Season Anchor to propose for one Discipline's
 * track, from that Discipline's own logged volume.
 *
 * The currency is the least-derived unit the history can express: distance where
 * something recorded a distance, hours where only duration is there, `sets` for
 * strength always. Where nothing is there the proposal is empty rather than a
 * guess — and for strength the *currency* is still `sets`, since that is a
 * decision about the discipline and not a reading of the history.
 */
export function proposeTrack(volume: LoggedVolume): TrackProposal {
	const offered = currencyOptionsFor(volume.discipline)
	const hasHistory = volume.sessions > 0

	const currency = !isEndurance(volume.discipline)
		? 'sets'
		: !hasHistory
			? null
			: (offered.find((option) => totalIn(volume, option) != null) ?? null)

	const total = currency && hasHistory ? totalIn(volume, currency) : null

	return {
		discipline: volume.discipline,
		currency,
		offered: currency
			? [currency, ...offered.filter((option) => option !== currency)]
			: offered,
		anchor:
			currency && total != null
				? {
						value: roundAnchor(total / ANCHOR_WINDOW_WEEKS, currency),
						derivation: {
							source: 'recent-training',
							windowWeeks: ANCHOR_WINDOW_WEEKS,
							weeksTrained: volume.weeksTrained,
							total,
							currency,
						},
					}
				: null,
	}
}

/**
 * Which Discipline the plan's first Training Track covers.
 *
 * The **Event** leads: an athlete planning toward a bike race authors a bike
 * track even if they have run more lately. Failing that, the discipline they
 * actually train most. Failing *that*, null — the athlete picks, rather than the
 * surface picking for them and pre-filling a track they never asked for.
 */
export function defaultTrackDiscipline(
	eventDisciplines: Discipline[],
	history: LoggedVolume[],
): Discipline | null {
	const [first] = eventDisciplines
	if (first) return first

	const trained = history.filter((volume) => volume.sessions > 0)
	if (trained.length === 0) return null
	return trained.reduce((most, volume) =>
		volume.sessions > most.sessions ? volume : most,
	).discipline
}
