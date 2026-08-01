// The **Volume Conversion**: one decomposition of a week's authored volume into
// intensity buckets, projected into all three endurance currencies (ADR 0045).
//
// A week becomes **one easy bucket plus one bucket per Training Zone in the
// Quality Session Mix**. Each bucket carries hours, an intensity factor read off
// the athlete's own **Zone Recipe**, and — where a pace source exists —
// distance. The three readings are projections of that single decomposition, so
// they can never disagree with each other (ADR 0045 §1).
//
// Five properties this module exists to hold:
//
// - **The quality bucket is sized in absolute minutes-in-zone per session**, not
//   as a share of the week (§2). A fractional rule would make TSS/km independent
//   of volume, so the TSS curve would be the volume curve rescaled — ADR 0043
//   §8's decorative duplicate. With absolute minutes the quality volume stands
//   still while the ramp fills the easy bucket, so **TSS is affine in volume**
//   and the two curves differ in slope everywhere.
// - **Intensity comes from the athlete's own recipe**, through the same anchor
//   their actual sessions resolve through (§4). Not configurability for its own
//   sake: **Fitness Projection** extends the *measured* CTL curve, so a week
//   that went exactly as planned must not read as a systematic mismatch.
// - **The gate sits per reading, not per track** (§6). Hours ↔ TSS needs only the
//   recipe and the mix; only distance needs a pace source. A run track with no
//   stored threshold pace keeps hours and TSS and loses the distance leg alone.
// - **Every non-authored number names its source** (§10). The derivation is a
//   value object, never a preformatted string — ADR 0023 owns display formatting
//   and a string can be neither inspected nor made accessible. Sources are named
//   as **convention**, never as measurement, so that when a convention moves
//   later nobody thinks the body moved (ADR 0040 §13). Every number a
//   {@link VolumeBucket} or a reading shows is also a named step, so the panel
//   has nothing to display that the chain does not account for.
// - **A reading carries `authored | derived` and never a Load Confidence** (§9).
//   Load Confidence gates things — a `low` effort is disqualified from a
//   **Personal Record** — and this figure gates nothing. It carries a chain, not
//   a level.
//
// Two things this module deliberately does not do. It **never reads a Week
// Pattern** (§11): no stored field says which weeks a pattern governs, so "which
// pattern governs week 34?" is unanswerable, and a `share` day carries no zone.
// And it **never rounds**: `roundToCurrency` is the one rounding posture and the
// display layer applies it, so calendar cost and the load view cannot end up
// pessimistic on one surface and central on the other (§8).
//
// This module is pure. The bike ride window it needs for the distance leg is
// read by `volume-conversion.server.ts` and passed in.

import { type TssResult } from '../load/formulas.ts'
import { type TrainingZone } from '../session-profile.ts'
import { isCardioDiscipline, type Discipline } from '../workout-schema.ts'
import { getRecipe } from '../zones/index.ts'
import { type DisciplineProfileForResolver } from '../zones/resolve.ts'
import {
	type ZoneAnchor,
	type ZoneBand,
	type ZoneRecipe,
} from '../zones/types.ts'
import { type VolumeCurrency } from './derive.ts'
import { type QualitySessionMixEntry, type QualityZone } from './quality-mix.ts'

/** The currencies a decomposition can be read in — every one but `sets`. */
export type EnduranceCurrency = Exclude<VolumeCurrency, 'sets'>

/** The disciplines whose distance leg is priced off a stored pace threshold. */
type PacedDiscipline = 'run' | 'swim'

// ── the two conventions ───────────────────────────────────────────────────────

/**
 * Minutes **in zone** per quality session, per zone (ADR 0045 §2).
 *
 * A convention in the ADR 0006 tradition, and to be worded as one: the mix gives
 * a *count* of sessions and never their volume, so something has to say how big a
 * session is. It is **not physiology** and the copy must not imply it is — see
 * {@link MINUTES_IN_ZONE_CITATION} for where the figures were read.
 *
 * Absolute, not a share of the week — see this module's header for why that is
 * the load-bearing half of the decision.
 */
export const MINUTES_IN_ZONE_PER_SESSION: Record<QualityZone, number> = {
	3: 45,
	4: 35,
	5: 20,
}

/**
 * Where {@link MINUTES_IN_ZONE_PER_SESSION} was read. Lives beside the constant
 * so the derivation quotes one string rather than restating it, and so a moved
 * convention cannot leave a stale citation behind.
 */
export const MINUTES_IN_ZONE_CITATION =
	'TrainingPeaks: a threshold workout totals 30–60 min at LT excluding recoveries; VO₂ max work in 2–5 min efforts'

/**
 * The easy-pace ratio, as a fraction of threshold *speed* (ADR 0045 §5).
 *
 * A constant is legitimate exactly where the ratio is stable between athletes,
 * which is the general form ADR 0043 §10's reasoning takes here. Running and
 * swimming satisfy it; **cycling cannot**, so it has no entry — speed at a given
 * intensity depends on aerodynamics, mass, terrain, wind and whether the athlete
 * is in a group, which is why `KM_PER_HOUR = 10` was folklore. A cyclist's speed
 * comes from their own ride window instead ({@link RideWindow}).
 *
 * Not read from the recipe even where the recipe is pace-anchored: the easy band
 * is too wide to have a representative midpoint. `daniels-pace-5`'s `E` spans
 * `1.29–1.74`, whose midpoint prices a 4:39/km threshold runner's easy running at
 * 7:03/km where Daniels' own table says 5:35/km.
 */
export const EASY_PACE_RATIO: Record<PacedDiscipline, number> = {
	run: 0.83,
	swim: 0.93,
}

/** Where each {@link EASY_PACE_RATIO} was read — a convention, not a measurement. */
export const EASY_PACE_RATIO_CITATION: Record<PacedDiscipline, string> = {
	run: "Daniels' published VDOT table, whose T ÷ E speed ratio holds at 0.825–0.838 across VDOT 40–60",
	swim: 'CSS + 6 s per 100 m, which is 0.926–0.948 across CSS 1:15–1:50',
}

/**
 * Which **Training Zone** the easy bucket is priced at.
 *
 * Not a third convention: ADR 0045 fixes it, in §7's worked example, which prices
 * easy hours through `olt-hr-5-run` **I-2** at 76.2 TSS/h, and again in §10's
 * derivation panel, which shows `IF easy 0.873 · olt-hr-5-run I-2 "fairly easy"`.
 * I-2 declares zone 2, so zone 2 is what the ADR's own arithmetic reads.
 *
 * Zone 2 rather than zone 1 also matches what the bucket *is* — the week's
 * aerobic training, not its recovery. Several recipes have exactly one aerobic
 * band covering both easy zones and declare it 2 for the same reason.
 */
export const EASY_BUCKET_ZONE: TrainingZone = 2

/**
 * How many complete weeks of ride history the bike speed is read over
 * (ADR 0045 §5).
 *
 * Its own constant rather than a share of `ANCHOR_WINDOW_WEEKS`: the two windows
 * happen to be the same length and answer different questions — the anchor
 * window pre-fills a volume, this one prices distance — so coupling them would
 * make one decision move the other.
 */
export const RIDE_WINDOW_WEEKS = 4

// ── inputs ───────────────────────────────────────────────────────────────────

/**
 * The bike distance leg's only possible source: total distance over total
 * duration for the discipline, across `RIDE_WINDOW_WEEKS` before the authored
 * **Plan Start Week**.
 *
 * No attempt is made to isolate the easy rides — roughly 80 % of a cyclist's
 * volume is easy anyway, and the small fast bias is cheaper to state than to
 * correct. Anchoring the window to `startWeekKey` (ADR 0044 §3, authored and
 * fixed) makes the speed a pure function of plan and history: no stored field, no
 * drift as later activities land, and no perverse sign where a fatigued month
 * reads as more planned load. Actuals may **pre-fill**, never **drive**.
 */
export type RideWindow = {
	/** The Monday opening the window — named in the derivation, not re-derived. */
	fromWeekKey: string
	weeks: number
	rides: number
	km: number
	hours: number
}

/**
 * The thresholds the conversion can read. A structural subset of
 * {@link DisciplineProfileForResolver}, so a caller passes the profile it already
 * has.
 *
 * Only two of the four are ever *required*: `maxHr` and `lthr` together, and only
 * for a `maxHr`-anchored recipe, whose band ratios are fractions of HFmax and so
 * need scaling to an intensity factor against LTHR. The other anchors yield an
 * intensity factor from the ratio alone.
 */
export type ConversionProfile = Pick<
	DisciplineProfileForResolver,
	'lthr' | 'maxHr' | 'thresholdPaceSecPerKm' | 'cssSecPer100m'
>

export type VolumeConversionInput = {
	discipline: Discipline
	/** The Training Track's authored currency (ADR 0043 §1). */
	currency: VolumeCurrency
	/** The week's target in that currency — the one authored number in the chain. */
	volume: number
	/** The segment's **Quality Session Mix**. Empty is a positive statement. */
	mix: readonly QualitySessionMixEntry[]
	/** The athlete's recipe for this discipline — see {@link conversionRecipe}. */
	recipe: ZoneRecipe | null
	profile: ConversionProfile
	/** Bike only, and only for the distance leg. */
	rideWindow?: RideWindow | null
}

/**
 * The half of {@link VolumeConversionInput} that belongs to the **Discipline**
 * rather than to the week — resolved once by a caller converting many weeks, and
 * spread into every call.
 *
 * Named as a type rather than left implicit so the split is the module's
 * statement and not each caller's guess: nothing here varies week to week, and a
 * caller that re-read the recipe per week could price two weeks of one plan
 * through two different intensity tables.
 */
export type ConversionContext = Pick<
	VolumeConversionInput,
	'recipe' | 'profile' | 'rideWindow'
>

// ── readings ─────────────────────────────────────────────────────────────────

/**
 * A binary marker, never a grade (ADR 0045 §9). Borrowing **Load Confidence**'s
 * `high | medium | low` would imply a gate that does not exist, invite someone to
 * build one on a number that cannot bear it, and collide on the **Session
 * Ledger** where actual TSS already shows those three words.
 */
export type ReadingMarker = 'authored' | 'derived'

/**
 * Why a reading is an **Unavailable Metric**. A code, not prose: the surface
 * words it, exactly as `RampWarning` and `MixAvailabilityWarning` do, so the
 * honesty rules are enforced where the athlete reads them.
 */
export type UnavailableReason =
	/** `sets` produces no reading in any direction (ADR 0041). */
	| 'sets-has-no-reading'
	/** A strength track has no endurance reading to convert to (ADR 0046). */
	| 'not-an-endurance-discipline'
	/** No zone system configured for this discipline, so no intensity exists. */
	| 'no-zone-recipe'
	/** The recipe declares no zone at all, or its anchor cannot yield an IF. */
	| 'no-intensity-source'
	/** A `maxHr`-anchored recipe with maxHr or LTHR missing. */
	| 'no-heart-rate-anchor'
	/** Run distance with no stored `thresholdPaceSecPerKm`. */
	| 'no-threshold-pace'
	/** Swim distance with no stored `cssSecPer100m`. */
	| 'no-critical-swim-speed'
	/** Bike distance with an empty ride window — never a fallback constant. */
	| 'no-ride-history'

export type VolumeReading =
	| { available: true; value: number; marker: ReadingMarker }
	| { available: false; reason: UnavailableReason }

// ── the derivation ───────────────────────────────────────────────────────────

/**
 * The conventions this conversion stacks, each named where it is used.
 *
 * A tuple and not a bare union, in the shape `QUALITY_ZONES` and
 * `STRENGTH_WEEK_ROLES` take: a consumer summarising several weeks' chains into
 * one statement needs a **declared order** to list them in, or the same two
 * conventions would come back in whichever order a traversal happened to reach
 * them. No `is…` predicate beside it — nothing stores a convention id.
 */
export const CONVENTION_IDS = [
	'minutes-in-zone-per-session',
	'easy-pace-ratio',
] as const
export type ConventionId = (typeof CONVENTION_IDS)[number]

/** A stored threshold, named by its column so the derivation is checkable. */
export type ThresholdField = 'thresholdPaceSecPerKm' | 'cssSecPer100m'

/**
 * Where a number in the chain came from. The invariant ADR 0045 §10 makes
 * testable — *every number that is not authored names its source* — is this type
 * being non-optional on {@link DerivationStep}.
 */
export type DerivationSource =
	/** The one number the athlete typed. Exactly one step carries this. */
	| { kind: 'authored'; currency: VolumeCurrency }
	/**
	 * A documented convention. Named as convention and never as measurement
	 * (ADR 0040 §13): `citation` says where the figure was read, not that the
	 * body was measured.
	 */
	| { kind: 'convention'; convention: ConventionId; citation: string }
	/** A value stored on the athlete's **Discipline Profile**. */
	| { kind: 'threshold'; field: ThresholdField }
	/**
	 * A band of the athlete's own recipe. `substitutedFor` is set when the recipe
	 * declares no band for the requested zone and the nearest declared band stood
	 * in — the substitution is *named*, never silently clamped (ADR 0045 §3).
	 */
	| {
			kind: 'recipe-band'
			recipeId: string
			band: string
			bandDescription?: string
			declaredZone: TrainingZone
			substitutedFor?: TrainingZone
	  }
	/** The athlete's own ride history — the bike distance leg's only source. */
	| { kind: 'ride-window'; fromWeekKey: string; weeks: number; rides: number }
	/** Arithmetic over other steps, named by their ids. */
	| { kind: 'arithmetic'; from: string[] }

export type DerivationUnit =
	| 'km'
	| 'hours'
	| 'tss'
	| 'if'
	| 'tss-per-hour'
	| 'km-per-hour'
	| 'ratio'

/** One number in the chain, with its unit and its source. */
export type DerivationStep = {
	/** Stable id — `arithmetic` sources reference these. */
	id: string
	unit: DerivationUnit
	value: number
	source: DerivationSource
}

/** A zone the recipe does not declare, and the band that stood in for it. */
export type ZoneSubstitution = {
	requested: TrainingZone
	recipeId: string
	band: string
	declaredZone: TrainingZone
}

/**
 * The whole chain, as structured data. Revealed one interaction away through
 * **Chart Inspect** (ADR 0030) rather than inline: five buckets with sources do
 * not fit on a phone (ADR 0028), and ADR 0030 already rejected floating tooltips.
 *
 * A TSS-authored track's chain is the authored step alone, which is what an
 * `authored` marker with no empty panel looks like.
 */
export type Derivation = {
	steps: DerivationStep[]
	substitutions: ZoneSubstitution[]
	/** Which Load Formula the intensity factors were read through (ADR 0045 §4). */
	formula: TssResult['formula'] | null
}

/**
 * The sub-chain **one** reading rests on, walked back from its total through the
 * chain's own `arithmetic` references, in reachable order.
 *
 * A week's derivation names every number the decomposition produced, including
 * the legs a given reading never touched: hours → TSS passes through no pace
 * source at all, so listing the easy-pace ratio under an hours-authored figure
 * would overstate what it rests on — the opposite of what ADR 0045 §10 asks for.
 * Every consumer of the chain therefore reads a root rather than the whole array,
 * and this is the one walk they share, so a panel and the curve's basis can never
 * disagree about what a number stands on.
 *
 * An id the chain does not carry yields `[]`, which is the truthful answer for a
 * reading that was never produced.
 */
export function derivationChain(
	derivation: Derivation,
	rootId: string,
): DerivationStep[] {
	const byId = new Map(derivation.steps.map((step) => [step.id, step]))
	const queue = [rootId]
	const seen = new Set<string>()
	const chain: DerivationStep[] = []

	while (queue.length > 0) {
		const id = queue.shift()!
		if (seen.has(id)) continue
		seen.add(id)
		const step = byId.get(id)
		if (!step) continue
		chain.push(step)
		if (step.source.kind === 'arithmetic') queue.push(...step.source.from)
	}
	return chain
}

/**
 * One bucket of the decomposition, priced. `km` is null wherever the distance
 * leg's gate is closed, which is per reading and never per track.
 *
 * The buckets are the *priced* decomposition, so there are none at all where no
 * intensity source exists — a km-authored track on a discipline with no zone
 * system still reads hours, because km ↔ hours needs a pace source and not a
 * recipe, but there is nothing to price per bucket. Every number here is also a
 * named step of the derivation, so a panel showing buckets shows nothing the
 * chain cannot account for.
 */
export type VolumeBucket = {
	kind: 'easy' | 'quality'
	zone: TrainingZone
	band: string
	/** Zero for the easy bucket, which is a remainder rather than a count. */
	sessionsPerWeek: number
	hours: number
	km: number | null
	tss: number
	intensityFactor: number
	tssPerHour: number
}

/**
 * The mix's quality volume alone exceeds the week's, in the week's own currency.
 *
 * Soft and advisory: the easy bucket floors at zero and **nothing is corrected**,
 * the posture of ADR 0040 §12, ADR 0042 §9 and ADR 0044 §7. Carries numbers and
 * no wording, so the surface words it.
 */
export type QualityOverflowWarning = {
	currency: EnduranceCurrency
	authored: number
	quality: number
}

export type VolumeConversion = {
	km: VolumeReading
	hours: VolumeReading
	tss: VolumeReading
	buckets: VolumeBucket[]
	derivation: Derivation
	warnings: QualityOverflowWarning[]
}

// ── band reading ─────────────────────────────────────────────────────────────

/**
 * A band's representative intensity ratio: **its midpoint where the band is
 * bounded on both sides, and otherwise the edge nearest threshold** (ADR 0045
 * §3).
 *
 * One rule covering both open ends, because "nearest threshold" is "nearest 1.0"
 * and an open band has exactly one finite edge. `coggan` Z2 `0.56–0.75` → 0.655;
 * `stryd` Z1 `0–0.8` → **0.8** rather than a meaningless 0.4; `friel` Z5 `≥1.0` →
 * **1.0**, the floor, so zone 5 is priced conservatively. The conservative top
 * costs a week ~2.5 % at one zone-5 session, and conservative is the right
 * direction for a planning figure.
 *
 * This is why `pctToZone` cannot serve: zone 1 is `< 55` and zone 5 is `>= 106`,
 * so neither has a midpoint. It answers "which zone is this effort in", a
 * classification boundary, where the conversion asks "what intensity does a
 * session in zone z run at", a representative value.
 */
export function representativeRatio(band: ZoneBand): number {
	if (band.maxRatio == null) return band.minRatio
	if (band.minRatio === 0) return band.maxRatio
	return (band.minRatio + band.maxRatio) / 2
}

/**
 * The band the recipe declares for `zone`, or the nearest declared band with the
 * substitution named.
 *
 * Absence of a declaration is a **positive statement** (ADR 0045 §3), of two
 * kinds: Daniels' `R` and Stryd's `Z5` are neuromuscular and are not positions on
 * this axis at all, while `css-3` declares no 3 and no 5 because three bands
 * cannot express five zones. Either way a consumer substitutes and *says so*.
 *
 * Ties break toward the band nearest zone 4, then toward the lower zone. A
 * quality session read down into an aerobic band would make the mix nearly
 * invisible in the reading, which is the whole point of a mix-aware conversion;
 * threshold is the honest place to land, and where that is not the tie-breaker
 * conservative is (§3).
 */
export function bandForZone(
	recipe: ZoneRecipe,
	zone: TrainingZone,
): { band: ZoneBand; declaredZone: TrainingZone; substituted: boolean } | null {
	const declared = recipe.zones.flatMap((band) =>
		band.zone == null ? [] : [{ band, declaredZone: band.zone }],
	)
	if (declared.length === 0) return null

	// The first band declaring the zone, not the last: `coggan-power-7` declares 5
	// three times (Z5, Z6, Z7) and Z5 is the VO₂ max band the ladder means.
	const exact = declared.find((entry) => entry.declaredZone === zone)
	if (exact) return { ...exact, substituted: false }

	const nearest = declared.reduce((best, entry) =>
		substitutionRank(entry.declaredZone, zone) <
		substitutionRank(best.declaredZone, zone)
			? entry
			: best,
	)
	return { ...nearest, substituted: true }
}

/** Lower sorts first: nearest the requested zone, then nearest threshold, then lower. */
function substitutionRank(declared: TrainingZone, requested: TrainingZone) {
	return (
		Math.abs(declared - requested) * 100 +
		Math.abs(declared - 4) * 10 +
		declared
	)
}

/**
 * Which **Load Formula** an anchor's bands are read through (ADR 0045 §4), and
 * `null` where none can be: `rpe` has no threshold to form a ratio against.
 */
export const ANCHOR_FORMULA: Record<ZoneAnchor, TssResult['formula'] | null> = {
	ftp: 'coggan',
	runPower: 'coggan',
	lthr: 'hrTSS',
	maxHr: 'hrTSS',
	thresholdPace: 'rTSS',
	css: 'sTSS',
	rpe: null,
}

/**
 * A band ratio as an intensity factor, by the anchor's own Load Formula (ADR 0045
 * §4).
 *
 * The three shapes are the formulae's, not a table of this module's invention —
 * `coggan` and `hrTSS` divide by the threshold so a ratio *is* the IF, while
 * `rTSS` and `sTSS` divide the threshold by the pace, and those recipes store the
 * slow end first, so the ratio inverts. Olympiatoppen's scale is the one that
 * needs stored numbers: its bands are fractions of HFmax and `hrTSS` prices
 * against LTHR, so the IF is `ratio × maxHr / LTHR`, both of which the
 * **Discipline Profile** stores.
 *
 * `volume-conversion.test.ts` pins each case against the real formula at one
 * hour, so this cannot drift from the arithmetic the athlete's actual sessions
 * resolve through — which is the commensurability §4 exists to protect.
 */
export function bandIntensityFactor(
	anchor: ZoneAnchor,
	ratio: number,
	profile: ConversionProfile,
): number | null {
	switch (anchor) {
		case 'ftp':
		case 'runPower':
		case 'lthr':
			return ratio
		case 'maxHr': {
			if (profile.maxHr == null || profile.lthr == null) return null
			return (ratio * profile.maxHr) / profile.lthr
		}
		case 'thresholdPace':
		case 'css':
			return ratio === 0 ? null : 1 / ratio
		case 'rpe':
			return null
	}
}

/**
 * The athlete's recipe for a discipline, with their per-zone `zoneOverrides`
 * applied.
 *
 * The merge lives here rather than being reused from `resolveIntensity` because
 * the two need different things from a band. `resolveIntensity` replaces the band
 * wholesale — it only ever reads the ratios — which drops the band's `zone`
 * declaration. This conversion cannot tolerate that: a dropped declaration would
 * silently turn an overridden threshold band into a *substituted* one, and an
 * athlete who widened their threshold band has not told the app it stopped being
 * threshold.
 */
export function conversionRecipe(
	profile: Pick<
		DisciplineProfileForResolver,
		'zoneSystem' | 'zoneOverrides'
	> | null,
): ZoneRecipe | null {
	if (!profile?.zoneSystem) return null
	const recipe = getRecipe(profile.zoneSystem)
	if (!recipe) return null
	if (!profile.zoneOverrides) return recipe

	let overrides: Record<string, { minRatio: number; maxRatio?: number }>
	try {
		overrides = JSON.parse(profile.zoneOverrides) as Record<
			string,
			{ minRatio: number; maxRatio?: number }
		>
	} catch {
		// Malformed overrides read as none — the recipe stands, as it does in
		// `resolveIntensity`.
		return recipe
	}

	return {
		...recipe,
		zones: recipe.zones.map((band) => {
			const override = overrides[band.label]
			return override ? { ...band, ...override } : band
		}),
	}
}

// ── the conversion ───────────────────────────────────────────────────────────

/** One bucket's intensity, read off one band. */
type BucketIntensity = {
	band: ZoneBand
	intensityFactor: number
	tssPerHour: number
}

type IntensityRead =
	| {
			ok: true
			easy: BucketIntensity
			quality: Array<BucketIntensity & { entry: QualitySessionMixEntry }>
			formula: TssResult['formula']
			steps: DerivationStep[]
			substitutions: ZoneSubstitution[]
	  }
	| { ok: false; reason: UnavailableReason }

type PaceRead =
	| {
			ok: true
			qualitySpeedKmH: number
			easySpeedKmH: number
			steps: DerivationStep[]
	  }
	| { ok: false; reason: UnavailableReason }

/** The unit each authored currency's step carries. */
const CURRENCY_UNIT: Record<EnduranceCurrency, DerivationUnit> = {
	km: 'km',
	hours: 'hours',
	tss: 'tss',
}

/**
 * Which steps the one unknown was solved from, per authored currency (§7). Each
 * direction is one equation in one unknown, and this names the terms of it.
 */
const SOLVED_FROM: Record<EnduranceCurrency, string[]> = {
	hours: ['authored', 'quality-hours'],
	tss: ['authored', 'quality-tss', 'tss-per-hour:easy'],
	km: ['authored', 'quality-km', 'speed:easy'],
}

/** Hours in zone for one mix entry — the one place the minutes convention is applied. */
function bucketHours(entry: QualitySessionMixEntry): number {
	return (entry.sessionsPerWeek * MINUTES_IN_ZONE_PER_SESSION[entry.zone]) / 60
}

function allUnavailable(reason: UnavailableReason): VolumeConversion {
	const unavailable = { available: false, reason } as const
	return {
		km: unavailable,
		hours: unavailable,
		tss: unavailable,
		buckets: [],
		derivation: { steps: [], substitutions: [], formula: null },
		warnings: [],
	}
}

/**
 * Read a week in all three endurance currencies from one decomposition.
 *
 * Symmetric over km, hours and TSS (ADR 0045 §7): each direction is one equation
 * in one unknown, because **quality hours are known from the mix whatever the
 * authored currency is**. Symmetry is chosen because ADR 0043 §8 is
 * directional-neutral and because refusing a direction would mean *adding* a rule
 * to a decomposition that already produces all three. That `TSS → km` stacks two
 * conventions where `hours → km` stacks one is an accuracy statement, not an
 * availability one — and the derivation shows the stack rather than hiding it by
 * refusal.
 *
 * Symmetry applies to **views, never to the Season Span**: the headline still
 * reads the guideline layer in the track's own currency and is never derived
 * (ADR 0043 §3, §5).
 */
export function convertWeeklyVolume(
	input: VolumeConversionInput,
): VolumeConversion {
	const { currency, volume, discipline } = input

	// `sets → anything` is the conversion ADR 0041 forbids, in both directions, so
	// there is no decomposition to attempt rather than a gate to close deeper in.
	if (currency === 'sets') return allUnavailable('sets-has-no-reading')
	// Gated on the *discipline*, separately and for its own reason: a strength
	// track's weekly work is a different quantity, not a lossy endurance reading
	// (ADR 0046). In practice a strength track always authors `sets`, so this is
	// the belt to that braces — but §6 gates per reading on what a reading needs,
	// and an endurance reading needs an endurance discipline.
	if (!isCardioDiscipline(discipline)) {
		return allUnavailable('not-an-endurance-discipline')
	}

	const mix = input.mix.filter((entry) => entry.sessionsPerWeek > 0)
	const qualityHours = mix.reduce((total, e) => total + bucketHours(e), 0)

	const steps: DerivationStep[] = [
		{
			id: 'authored',
			unit: CURRENCY_UNIT[currency],
			value: volume,
			source: { kind: 'authored', currency },
		},
		{
			id: 'quality-hours',
			unit: 'hours',
			value: qualityHours,
			source: {
				kind: 'convention',
				convention: 'minutes-in-zone-per-session',
				citation: MINUTES_IN_ZONE_CITATION,
			},
		},
	]

	const intensity = resolveIntensity(input, mix)
	const pace = resolvePaceSource(input, discipline)
	if (intensity.ok) steps.push(...intensity.steps)
	if (pace.ok) steps.push(...pace.steps)

	// Per-bucket hours are mix-only, so they are named whether or not a recipe or a
	// pace source exists.
	for (const entry of mix) {
		steps.push({
			id: `quality-hours:z${entry.zone}`,
			unit: 'hours',
			value: bucketHours(entry),
			source: {
				kind: 'convention',
				convention: 'minutes-in-zone-per-session',
				citation: MINUTES_IN_ZONE_CITATION,
			},
		})
	}

	const qualityTss = intensity.ok
		? intensity.quality.reduce(
				(total, b) => total + bucketHours(b.entry) * b.tssPerHour,
				0,
			)
		: null
	const qualityKm = pace.ok ? qualityHours * pace.qualitySpeedKmH : null

	if (intensity.ok) {
		for (const bucket of intensity.quality) {
			steps.push({
				id: `quality-tss:z${bucket.entry.zone}`,
				unit: 'tss',
				value: bucketHours(bucket.entry) * bucket.tssPerHour,
				source: {
					kind: 'arithmetic',
					from: [
						`quality-hours:z${bucket.entry.zone}`,
						`tss-per-hour:z${bucket.entry.zone}`,
					],
				},
			})
		}
		steps.push({
			id: 'quality-tss',
			unit: 'tss',
			value: qualityTss!,
			source: {
				kind: 'arithmetic',
				from: mix.map((e) => `quality-tss:z${e.zone}`),
			},
		})
	}
	if (pace.ok) {
		for (const entry of mix) {
			steps.push({
				id: `quality-km:z${entry.zone}`,
				unit: 'km',
				value: bucketHours(entry) * pace.qualitySpeedKmH,
				source: {
					kind: 'arithmetic',
					from: [`quality-hours:z${entry.zone}`, 'speed:quality'],
				},
			})
		}
		steps.push({
			id: 'quality-km',
			unit: 'km',
			value: qualityKm!,
			source: {
				kind: 'arithmetic',
				from: ['quality-hours', 'speed:quality'],
			},
		})
	}

	// One unknown, solved in whichever currency was authored. The easy bucket
	// floors at zero and nothing else is corrected (§2).
	const warnings: QualityOverflowWarning[] = []
	const authoredQuality =
		currency === 'hours'
			? qualityHours
			: currency === 'tss'
				? qualityTss
				: qualityKm
	if (authoredQuality != null && authoredQuality > volume) {
		warnings.push({ currency, authored: volume, quality: authoredQuality })
	}

	let easyHours: number | null = null
	if (currency === 'hours') {
		easyHours = Math.max(0, volume - qualityHours)
	} else if (currency === 'tss' && intensity.ok && qualityTss != null) {
		const easyTss = Math.max(0, volume - qualityTss)
		easyHours =
			intensity.easy.tssPerHour > 0 ? easyTss / intensity.easy.tssPerHour : 0
	} else if (currency === 'km' && pace.ok && qualityKm != null) {
		const easyKm = Math.max(0, volume - qualityKm)
		easyHours = pace.easySpeedKmH > 0 ? easyKm / pace.easySpeedKmH : 0
	}

	// Whatever blocked the solve blocks whichever readings depend on it. `hours` is
	// solvable with nothing beyond the mix, so only the other two directions can
	// fail here.
	const solveBlocker: UnavailableReason | null =
		easyHours != null
			? null
			: currency === 'tss'
				? intensityBlocker(intensity)
				: paceBlocker(pace)

	if (easyHours != null) {
		steps.push({
			id: 'easy-hours',
			unit: 'hours',
			value: easyHours,
			source: { kind: 'arithmetic', from: SOLVED_FROM[currency] },
		})
		if (intensity.ok) {
			steps.push({
				id: 'easy-tss',
				unit: 'tss',
				value: easyHours * intensity.easy.tssPerHour,
				source: {
					kind: 'arithmetic',
					from: ['easy-hours', 'tss-per-hour:easy'],
				},
			})
		}
		if (pace.ok) {
			steps.push({
				id: 'easy-km',
				unit: 'km',
				value: easyHours * pace.easySpeedKmH,
				source: { kind: 'arithmetic', from: ['easy-hours', 'speed:easy'] },
			})
		}
	}

	const readings = {
		hours: read(
			currency === 'hours',
			volume,
			easyHours == null ? null : qualityHours + easyHours,
			solveBlocker,
		),
		tss: read(
			currency === 'tss',
			volume,
			intensity.ok && qualityTss != null && easyHours != null
				? qualityTss + easyHours * intensity.easy.tssPerHour
				: null,
			intensityBlocker(intensity) ?? solveBlocker,
		),
		km: read(
			currency === 'km',
			volume,
			pace.ok && qualityKm != null && easyHours != null
				? qualityKm + easyHours * pace.easySpeedKmH
				: null,
			paceBlocker(pace) ?? solveBlocker,
		),
	}

	// The totals are named too, so a panel can show the week's figure as the last
	// row of the same chain rather than as a number beside it.
	for (const [id, unit, reading, from] of [
		['total-hours', 'hours', readings.hours, ['quality-hours', 'easy-hours']],
		['total-tss', 'tss', readings.tss, ['quality-tss', 'easy-tss']],
		['total-km', 'km', readings.km, ['quality-km', 'easy-km']],
	] as const) {
		if (reading.available && reading.marker === 'derived') {
			steps.push({
				id,
				unit,
				value: reading.value,
				source: { kind: 'arithmetic', from: [...from] },
			})
		}
	}

	const buckets: VolumeBucket[] = []
	if (intensity.ok) {
		for (const bucket of intensity.quality) {
			const hours = bucketHours(bucket.entry)
			buckets.push({
				kind: 'quality',
				zone: bucket.entry.zone,
				band: bucket.band.label,
				sessionsPerWeek: bucket.entry.sessionsPerWeek,
				hours,
				km: pace.ok ? hours * pace.qualitySpeedKmH : null,
				tss: hours * bucket.tssPerHour,
				intensityFactor: bucket.intensityFactor,
				tssPerHour: bucket.tssPerHour,
			})
		}
		if (easyHours != null) {
			buckets.push({
				kind: 'easy',
				zone: EASY_BUCKET_ZONE,
				band: intensity.easy.band.label,
				sessionsPerWeek: 0,
				hours: easyHours,
				km: pace.ok ? easyHours * pace.easySpeedKmH : null,
				tss: easyHours * intensity.easy.tssPerHour,
				intensityFactor: intensity.easy.intensityFactor,
				tssPerHour: intensity.easy.tssPerHour,
			})
		}
	}

	return {
		...readings,
		buckets,
		derivation: {
			steps,
			substitutions: intensity.ok ? intensity.substitutions : [],
			formula: intensity.ok ? intensity.formula : null,
		},
		warnings,
	}
}

/** One reading: authored, derived, or an Unavailable Metric with its reason. */
function read(
	isAuthored: boolean,
	authored: number,
	derived: number | null,
	blocker: UnavailableReason | null,
): VolumeReading {
	if (isAuthored)
		return { available: true, value: authored, marker: 'authored' }
	if (derived != null)
		return { available: true, value: derived, marker: 'derived' }
	// Unreachable: a reading is derivable unless something closed its gate, and
	// every gate that closes carries a reason.
	return { available: false, reason: blocker ?? 'no-intensity-source' }
}

function intensityBlocker(read: IntensityRead): UnavailableReason | null {
	return read.ok ? null : read.reason
}

function paceBlocker(read: PaceRead): UnavailableReason | null {
	return read.ok ? null : read.reason
}

function resolveIntensity(
	input: VolumeConversionInput,
	mix: readonly QualitySessionMixEntry[],
): IntensityRead {
	const { recipe, profile } = input
	if (!recipe) return { ok: false, reason: 'no-zone-recipe' }

	const formula = ANCHOR_FORMULA[recipe.anchor]
	if (!formula) return { ok: false, reason: 'no-intensity-source' }

	const steps: DerivationStep[] = []
	const substitutions: ZoneSubstitution[] = []

	const read = (zone: TrainingZone, id: string): BucketIntensity | null => {
		const found = bandForZone(recipe, zone)
		if (!found) return null
		const ratio = representativeRatio(found.band)
		const intensityFactor = bandIntensityFactor(recipe.anchor, ratio, profile)
		if (intensityFactor == null) return null

		if (found.substituted) {
			substitutions.push({
				requested: zone,
				recipeId: recipe.id,
				band: found.band.label,
				declaredZone: found.declaredZone,
			})
		}
		steps.push({
			id: `if:${id}`,
			unit: 'if',
			value: intensityFactor,
			source: {
				kind: 'recipe-band',
				recipeId: recipe.id,
				band: found.band.label,
				bandDescription: found.band.description,
				declaredZone: found.declaredZone,
				...(found.substituted ? { substitutedFor: zone } : {}),
			},
		})
		const tssPerHour = intensityFactor * intensityFactor * 100
		steps.push({
			id: `tss-per-hour:${id}`,
			unit: 'tss-per-hour',
			value: tssPerHour,
			source: { kind: 'arithmetic', from: [`if:${id}`] },
		})
		return { band: found.band, intensityFactor, tssPerHour }
	}

	const easy = read(EASY_BUCKET_ZONE, 'easy')
	if (!easy) {
		return {
			ok: false,
			reason:
				recipe.anchor === 'maxHr' &&
				(profile.maxHr == null || profile.lthr == null)
					? 'no-heart-rate-anchor'
					: 'no-intensity-source',
		}
	}

	const quality = []
	for (const entry of mix) {
		const band = read(entry.zone, `z${entry.zone}`)
		if (!band) return { ok: false, reason: 'no-intensity-source' }
		quality.push({ ...band, entry })
	}

	return { ok: true, easy, quality, formula, steps, substitutions }
}

/**
 * The distance leg's two speeds, and the gate that closes where no pace source
 * exists (ADR 0045 §5, §6).
 *
 * Quality volume is priced at threshold pace **uniformly**: zones 3–5 all sit
 * within ±10 % of threshold on ~27 % of the week, so the error on the week's total
 * is 1.8 % — cheap enough to buy away a whole quality-pace table.
 *
 * **A cyclist's two speeds are the same speed, and that is not a shortcut.** §5's
 * chain — `easy hours = easy volume ÷ (r_easy × threshold speed)` — needs a
 * threshold *speed*, and cycling has none anywhere in the model: a bike recipe
 * anchors on `ftp` or `lthr`, watts and beats, and no stored field relates either
 * to speed. So the ride window is the only number available, and it is the whole
 * week's, which makes a cyclist's `km ↔ hours` a single scalar with `r_easy = 1`.
 *
 * The consequence is real and worth stating plainly: **a cyclist's distance
 * reading is mix-insensitive**, so their km and hours curves have the same shape.
 * That is the honest form of ADR 0045's own evidence — "Cycling has no such
 * ratio. Speed at a given intensity depends on aerodynamics, mass, terrain, wind
 * and whether the athlete is in a group" — and splitting the buckets would mean
 * inventing exactly the ratio that evidence says does not exist, which is
 * `KM_PER_HOUR = 10` returning under a new name. A cyclist's `hours ↔ TSS` is
 * fully mix-aware, which is what ADR 0043 §8 legislates on; only the distance leg
 * degenerates, and only because distance carries no intensity information for a
 * cyclist. An empty window **closes the gate** rather than falling back to a
 * constant, since there is no cycling constant to fall back to.
 */
function resolvePaceSource(
	input: VolumeConversionInput,
	discipline: 'run' | 'swim' | 'bike',
): PaceRead {
	if (discipline === 'bike') {
		const rides = input.rideWindow
		if (!rides || rides.rides === 0 || rides.hours <= 0 || rides.km <= 0) {
			return { ok: false, reason: 'no-ride-history' }
		}
		const speed = rides.km / rides.hours
		const source = {
			kind: 'ride-window',
			fromWeekKey: rides.fromWeekKey,
			weeks: rides.weeks,
			rides: rides.rides,
		} as const
		return {
			ok: true,
			qualitySpeedKmH: speed,
			easySpeedKmH: speed,
			steps: [
				{ id: 'speed:quality', unit: 'km-per-hour', value: speed, source },
				{ id: 'speed:easy', unit: 'km-per-hour', value: speed, source },
			],
		}
	}

	const field: ThresholdField =
		discipline === 'swim' ? 'cssSecPer100m' : 'thresholdPaceSecPerKm'
	const stored =
		discipline === 'swim'
			? input.profile.cssSecPer100m
			: input.profile.thresholdPaceSecPerKm
	if (stored == null || stored <= 0) {
		return {
			ok: false,
			reason:
				discipline === 'swim' ? 'no-critical-swim-speed' : 'no-threshold-pace',
		}
	}

	// CSS is sec per 100 m, so a kilometre costs ten of them.
	const secPerKm = discipline === 'swim' ? stored * 10 : stored
	const thresholdSpeed = 3600 / secPerKm
	const ratio = EASY_PACE_RATIO[discipline]
	const easySpeed = ratio * thresholdSpeed

	return {
		ok: true,
		qualitySpeedKmH: thresholdSpeed,
		easySpeedKmH: easySpeed,
		steps: [
			{
				id: 'speed:quality',
				unit: 'km-per-hour',
				value: thresholdSpeed,
				source: { kind: 'threshold', field },
			},
			{
				id: 'easy-pace-ratio',
				unit: 'ratio',
				value: ratio,
				source: {
					kind: 'convention',
					convention: 'easy-pace-ratio',
					citation: EASY_PACE_RATIO_CITATION[discipline],
				},
			},
			{
				id: 'speed:easy',
				unit: 'km-per-hour',
				value: easySpeed,
				source: {
					kind: 'arithmetic',
					from: ['speed:quality', 'easy-pace-ratio'],
				},
			},
		],
	}
}
