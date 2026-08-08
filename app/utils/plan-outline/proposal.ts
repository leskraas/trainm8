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
import { roundToCurrency, type VolumeCurrency } from './derive.ts'

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

/**
 * A pre-filled first **Season Anchor** value with its derivation. Authored from
 * the moment it is offered: it never moves as activities import in the background
 * (ADR 0040 §6).
 */
export type AnchorPrefill = { value: number; derivation: AnchorDerivation }

/**
 * The athlete's **endurance** training over the pre-fill window, summed across the
 * endurance Disciplines — the one reading a **Weekly Capacity** is proposed from.
 *
 * Summed rather than per-Discipline because a capacity is a statement about the
 * athlete's *week*, not about a track: a triathlete has one week to fit three
 * Disciplines into. `weeksTrained` is a **union** over the Disciplines and cannot
 * be recovered from the per-Discipline counts, which is why it is read alongside
 * them rather than derived from `LoggedVolume[]` here.
 *
 * Strength contributes nothing at all: it has sessions per week but no per-session
 * duration to price them with (ADR 0047 §5, ADR 0050 §3).
 */
export type EnduranceWindow = {
	/** Completed endurance sessions in the window. Zero means no history to read. */
	sessions: number
	/** Weeks of the window carrying at least one completed endurance session. */
	weeksTrained: number
	/** Hours recorded, or null where nothing in the window recorded a duration. */
	hours: number | null
}

/**
 * A pre-filled **Weekly Capacity** with the derivation behind it, or `null` where
 * the athlete's history says nothing to read one from.
 *
 * Deliberately **not** an `AnchorPrefill`, though it carries the same derivation
 * shape: a capacity is what the athlete *has room for* and a **Season Anchor** in
 * `hours` currency is what they *plan to train*, and "weekly hours" names both.
 * Two types keep a surface from pre-filling one box with the other's number.
 */
export type WeeklyCapacityPrefill = {
	/** Hours per Training Week. */
	hours: number
	derivation: AnchorDerivation
}

/**
 * The **Weekly Capacity** this history proposes, or `null` where there is nothing
 * to read — an athlete with no completed endurance sessions in the window, or one
 * whose sessions recorded no duration at all.
 *
 * `null` is an **Unavailable** pre-fill and never a default: ADR 0050 has the app
 * ask outright in that case, and say it is asking *because* it has nothing to read.
 * A window total of zero hours is the same answer — a capacity of zero would size
 * every week of the plan against no time at all.
 *
 * Read **once**. What comes back is offered, then authored; nothing re-reads it,
 * so a plan never shifts because activities arrived in the background (ADR 0040 §6).
 * That is the whole point of the field: history says what the athlete *did*, a
 * capacity says what they *could* (ADR 0050 §2).
 */
export function weeklyCapacityFor(
	window: EnduranceWindow,
): WeeklyCapacityPrefill | null {
	if (window.sessions === 0) return null
	const total = window.hours
	if (total == null || total <= 0) return null
	return {
		hours: roundToCurrency(total / ANCHOR_WINDOW_WEEKS, 'hours'),
		derivation: {
			source: 'recent-training',
			windowWeeks: ANCHOR_WINDOW_WEEKS,
			weeksTrained: window.weeksTrained,
			total,
			currency: 'hours',
		},
	}
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
	 * The anchor pre-fill **per offered currency** — null for a currency this
	 * history cannot express.
	 *
	 * One entry per option rather than one for the proposal, because "anchor value
	 * and Volume Currency are one act" (ADR 0043 §2): an athlete who takes the
	 * offered hours instead of the proposed distance must get the hours figure and
	 * the hours derivation, not a distance number relabelled.
	 */
	anchors: Partial<Record<VolumeCurrency, AnchorPrefill>>
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

/**
 * The anchor this history pre-fills for one currency, or null where it cannot
 * express that currency at all — a run history with no recorded distance has no
 * km figure, and no currency has one before the athlete has trained.
 */
export function anchorFor(
	volume: LoggedVolume,
	currency: VolumeCurrency,
): AnchorPrefill | null {
	if (volume.sessions === 0) return null
	const total = totalIn(volume, currency)
	if (total == null) return null
	return {
		value: roundToCurrency(total / ANCHOR_WINDOW_WEEKS, currency),
		derivation: {
			source: 'recent-training',
			windowWeeks: ANCHOR_WINDOW_WEEKS,
			weeksTrained: volume.weeksTrained,
			total,
			currency,
		},
	}
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

	const anchors: Partial<Record<VolumeCurrency, AnchorPrefill>> = {}
	for (const option of offered) {
		const prefill = anchorFor(volume, option)
		if (prefill) anchors[option] = prefill
	}

	return {
		discipline: volume.discipline,
		currency,
		offered: currency
			? [currency, ...offered.filter((option) => option !== currency)]
			: offered,
		anchors,
	}
}

/**
 * Which Disciplines the plan's first Training Tracks cover.
 *
 * **Every** Discipline the Event names, not just the first: a triathlon is one
 * season measured three ways over one shared phase timeline (ADR 0043 §1), and
 * authoring it as a single track would make the athlete keep three plans to peak
 * once. De-duplicated, so an Event that names a Discipline twice does not meet
 * the "one Training Track per discipline" refusal for a data quirk.
 *
 * Where the Event names none there is nothing to spread over, so it falls back to
 * the one Discipline `defaultTrackDiscipline` reads — and to no track at all
 * where even that is unknown.
 */
export function trackDisciplinesFor(
	eventDisciplines: Discipline[],
	history: LoggedVolume[],
): Discipline[] {
	const named = [...new Set(eventDisciplines)]
	if (named.length > 0) return named
	const fallback = defaultTrackDiscipline([], history)
	return fallback ? [fallback] : []
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
