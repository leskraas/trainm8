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
//   later nobody thinks the body moved (ADR 0040 §13).
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
import { type CardioDiscipline, type Discipline } from '../workout-schema.ts'
import { getRecipe } from '../zones/index.ts'
import { type DisciplineProfileForResolver } from '../zones/resolve.ts'
import {
	type ZoneAnchor,
	type ZoneBand,
	type ZoneRecipe,
} from '../zones/types.ts'
import { type VolumeCurrency } from './derive.ts'
import { type QualitySessionMixEntry, type QualityZone } from './quality-mix.ts'

// ── the two conventions ───────────────────────────────────────────────────────

/**
 * Minutes **in zone** per quality session, per zone (ADR 0045 §2).
 *
 * A convention in the ADR 0006 tradition, and to be worded as one: the mix gives
 * a *count* of sessions and never their volume, so something has to say how big a
 * session is. TrainingPeaks puts a threshold workout's total at 30–60 minutes
 * excluding recoveries, with repetitions of 4–12 min; VO₂ max work at 2–5 minute
 * efforts; Seiler's 4×8 is 32 min. It is **not physiology** and the copy must not
 * imply it is.
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
 * The easy-pace ratio, as a fraction of threshold *speed* (ADR 0045 §5).
 *
 * A constant is legitimate exactly where the ratio is stable between athletes,
 * which is the general form ADR 0043 §10's reasoning takes here. Running and
 * swimming satisfy it; **cycling cannot**, so it has no entry — speed at a given
 * intensity depends on aerodynamics, mass, terrain, wind and whether the athlete
 * is in a group, which is why `KM_PER_HOUR = 10` was folklore. A cyclist's easy
 * speed comes from their own ride window instead ({@link RideWindow}).
 *
 * Conventions, sourced but not measured:
 * - **run 0.83** — Daniels' published VDOT table, whose T ÷ E speed ratio holds
 *   at 0.825–0.838 across VDOT 40–60.
 * - **swim 0.93** — the easy zone stated additively as CSS + 6 s per 100 m,
 *   which is 0.926–0.948 across CSS 1:15–1:50.
 *
 * Not read from the recipe even where the recipe is pace-anchored: the easy band
 * is too wide to have a representative midpoint. `daniels-pace-5`'s `E` spans
 * `1.29–1.74`, whose midpoint prices a 4:39/km threshold runner's easy running at
 * 7:03/km where Daniels' own table says 5:35/km.
 */
export const EASY_PACE_RATIO: Partial<Record<CardioDiscipline, number>> = {
	run: 0.83,
	swim: 0.93,
}

/**
 * Which **Training Zone** the easy bucket is priced at.
 *
 * Zone 2 rather than zone 1: the bucket is the week's aerobic training, not its
 * recovery, and it is the band ADR 0045 §7's worked example prices easy hours
 * through (`olt-hr-5-run` I-2, 76.2 TSS/h). Several recipes have exactly one
 * aerobic band covering both easy zones and declare it 2 for this reason.
 */
export const EASY_BUCKET_ZONE: TrainingZone = 2

/**
 * How many complete weeks of ride history the bike easy speed is read over
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

/** The conventions this conversion stacks, each named where it is used. */
export type ConventionId = 'minutes-in-zone-per-session' | 'easy-pace-ratio'

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
	| 'minutes'
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
 * One bucket of the decomposition, priced. `km` is null wherever the distance
 * leg's gate is closed, which is per reading and never per track.
 *
 * The buckets are the *priced* decomposition, so there are none at all where no
 * intensity source exists — a km-authored track on a discipline with no zone
 * system still reads hours, because km ↔ hours needs a pace source and not a
 * recipe, but there is nothing to show per bucket. The derivation's steps carry
 * that chain instead.
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
	currency: VolumeCurrency
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
): { band: ZoneBand; substituted: boolean } | null {
	const declared = recipe.zones.filter((band) => band.zone != null)
	if (declared.length === 0) return null

	// The first band declaring the zone, not the last: `coggan-power-7` declares 5
	// three times (Z5, Z6, Z7) and Z5 is the VO₂ max band the ladder means.
	const exact = declared.find((band) => band.zone === zone)
	if (exact) return { band: exact, substituted: false }

	const nearest = [...declared].sort((a, b) => {
		const distance = Math.abs(a.zone! - zone) - Math.abs(b.zone! - zone)
		if (distance !== 0) return distance
		const toThreshold = Math.abs(a.zone! - 4) - Math.abs(b.zone! - 4)
		if (toThreshold !== 0) return toThreshold
		return a.zone! - b.zone!
	})[0]!
	return { band: nearest, substituted: true }
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
 * An override carries ratios only, so the recipe band's `zone` declaration and
 * wording are kept rather than dropped — an athlete widening their threshold band
 * has not told the app that band stopped being threshold. `resolveIntensity`
 * replaces the whole band because it only ever needs the ratios; the conversion
 * needs the declaration too, which is why the merge lives here.
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

type Intensity = {
	easy: { band: ZoneBand; zone: TrainingZone; if: number; tssPerHour: number }
	quality: Array<{
		entry: QualitySessionMixEntry
		band: ZoneBand
		if: number
		tssPerHour: number
		hours: number
	}>
	formula: TssResult['formula']
	steps: DerivationStep[]
	substitutions: ZoneSubstitution[]
}

type PaceSource = {
	qualitySpeedKmH: number
	easySpeedKmH: number
	steps: DerivationStep[]
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
	const { currency, volume } = input

	// `sets → anything` is the conversion ADR 0041 forbids, in both directions. A
	// strength track reads its own authored figure on its own surface and nothing
	// else, which is why this is a short circuit rather than a closed gate deeper
	// in: there is no decomposition to attempt.
	if (currency === 'sets' || input.discipline === 'strength') {
		const unavailable = {
			available: false,
			reason: 'sets-has-no-reading',
		} as const
		return {
			km: unavailable,
			hours: unavailable,
			tss: unavailable,
			buckets: [],
			derivation: { steps: [], substitutions: [], formula: null },
			warnings: [],
		}
	}

	const discipline = input.discipline
	const authoredStep: DerivationStep = {
		id: 'authored',
		unit: currency === 'tss' ? 'tss' : currency === 'km' ? 'km' : 'hours',
		value: volume,
		source: { kind: 'authored', currency },
	}

	const mix = input.mix.filter((entry) => entry.sessionsPerWeek > 0)
	const qualityMinutes = mix.reduce(
		(total, entry) =>
			total + entry.sessionsPerWeek * MINUTES_IN_ZONE_PER_SESSION[entry.zone],
		0,
	)
	const qualityHours = qualityMinutes / 60
	const qualityHoursStep: DerivationStep = {
		id: 'quality-hours',
		unit: 'hours',
		value: qualityHours,
		source: {
			kind: 'convention',
			convention: 'minutes-in-zone-per-session',
			citation:
				'TrainingPeaks: a threshold workout totals 30–60 min at LT excluding recoveries; VO₂ max work in 2–5 min efforts',
		},
	}

	const intensity = resolveIntensity(input, mix)
	const pace = resolvePaceSource(input, discipline)

	const steps: DerivationStep[] = [authoredStep, qualityHoursStep]
	if ('steps' in intensity) steps.push(...intensity.steps)
	if ('steps' in pace) steps.push(...pace.steps)

	const derivation: Derivation = {
		steps,
		substitutions: 'substitutions' in intensity ? intensity.substitutions : [],
		formula: 'formula' in intensity ? intensity.formula : null,
	}

	const qualityTss =
		'quality' in intensity
			? intensity.quality.reduce(
					(total, bucket) => total + bucket.hours * bucket.tssPerHour,
					0,
				)
			: null
	const qualityKm =
		'qualitySpeedKmH' in pace ? qualityHours * pace.qualitySpeedKmH : null

	// One unknown, solved in whichever currency was authored. The easy bucket
	// floors at zero and nothing else is corrected (§2).
	const warnings: QualityOverflowWarning[] = []
	let easyHours: number | null = null
	if (currency === 'hours') {
		easyHours = Math.max(0, volume - qualityHours)
		if (qualityHours > volume) {
			warnings.push({ currency, authored: volume, quality: qualityHours })
		}
	} else if (currency === 'tss') {
		if (qualityTss != null && 'easy' in intensity) {
			const easyTss = Math.max(0, volume - qualityTss)
			easyHours =
				intensity.easy.tssPerHour > 0 ? easyTss / intensity.easy.tssPerHour : 0
			if (qualityTss > volume) {
				warnings.push({ currency, authored: volume, quality: qualityTss })
			}
		}
	} else if (qualityKm != null && 'easySpeedKmH' in pace) {
		const easyKm = Math.max(0, volume - qualityKm)
		easyHours = pace.easySpeedKmH > 0 ? easyKm / pace.easySpeedKmH : 0
		if (qualityKm > volume) {
			warnings.push({ currency, authored: volume, quality: qualityKm })
		}
	}

	if (easyHours != null) {
		derivation.steps.push({
			id: 'easy-hours',
			unit: 'hours',
			value: easyHours,
			source: { kind: 'arithmetic', from: solvedFrom(currency) },
		})
	}

	// Whatever blocked the decomposition blocks whichever readings depend on it.
	const solveBlocker: UnavailableReason | null =
		easyHours != null
			? null
			: currency === 'tss'
				? unavailableReason(intensity)
				: unavailableReason(pace)

	const hours: VolumeReading =
		currency === 'hours'
			? { available: true, value: volume, marker: 'authored' }
			: easyHours != null
				? {
						available: true,
						value: qualityHours + easyHours,
						marker: 'derived',
					}
				: { available: false, reason: solveBlocker! }

	const tss: VolumeReading =
		currency === 'tss'
			? { available: true, value: volume, marker: 'authored' }
			: 'easy' in intensity && qualityTss != null && easyHours != null
				? {
						available: true,
						value: qualityTss + easyHours * intensity.easy.tssPerHour,
						marker: 'derived',
					}
				: {
						available: false,
						reason: unavailableReason(intensity) ?? solveBlocker!,
					}

	const km: VolumeReading =
		currency === 'km'
			? { available: true, value: volume, marker: 'authored' }
			: 'easySpeedKmH' in pace && qualityKm != null && easyHours != null
				? {
						available: true,
						value: qualityKm + easyHours * pace.easySpeedKmH,
						marker: 'derived',
					}
				: { available: false, reason: unavailableReason(pace) ?? solveBlocker! }

	const buckets: VolumeBucket[] = []
	if ('easy' in intensity) {
		for (const bucket of intensity.quality) {
			buckets.push({
				kind: 'quality',
				zone: bucket.entry.zone,
				band: bucket.band.label,
				sessionsPerWeek: bucket.entry.sessionsPerWeek,
				hours: bucket.hours,
				km:
					'qualitySpeedKmH' in pace
						? bucket.hours * pace.qualitySpeedKmH
						: null,
				tss: bucket.hours * bucket.tssPerHour,
				intensityFactor: bucket.if,
				tssPerHour: bucket.tssPerHour,
			})
		}
		if (easyHours != null) {
			buckets.push({
				kind: 'easy',
				zone: intensity.easy.zone,
				band: intensity.easy.band.label,
				sessionsPerWeek: 0,
				hours: easyHours,
				km: 'easySpeedKmH' in pace ? easyHours * pace.easySpeedKmH : null,
				tss: easyHours * intensity.easy.tssPerHour,
				intensityFactor: intensity.easy.if,
				tssPerHour: intensity.easy.tssPerHour,
			})
		}
	}

	return { km, hours, tss, buckets, derivation, warnings }
}

/** Which steps the one unknown was solved from, per authored currency (§7). */
function solvedFrom(currency: VolumeCurrency): string[] {
	switch (currency) {
		case 'hours':
			return ['authored', 'quality-hours']
		case 'tss':
			return ['authored', 'quality-hours', 'tss-per-hour:easy', 'if:easy']
		default:
			return ['authored', 'quality-hours', 'speed:easy', 'speed:quality']
	}
}

function unavailableReason(
	part: Intensity | PaceSource | { reason: UnavailableReason },
): UnavailableReason | null {
	return 'reason' in part ? part.reason : null
}

function resolveIntensity(
	input: VolumeConversionInput,
	mix: readonly QualitySessionMixEntry[],
): Intensity | { reason: UnavailableReason } {
	const { recipe, profile } = input
	if (!recipe) return { reason: 'no-zone-recipe' }

	const formula = ANCHOR_FORMULA[recipe.anchor]
	if (!formula) return { reason: 'no-intensity-source' }

	const steps: DerivationStep[] = []
	const substitutions: ZoneSubstitution[] = []

	const read = (zone: TrainingZone, id: string) => {
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
				declaredZone: found.band.zone!,
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
				declaredZone: found.band.zone!,
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
		return { band: found.band, if: intensityFactor, tssPerHour }
	}

	const easy = read(EASY_BUCKET_ZONE, 'easy')
	if (!easy) {
		return {
			reason:
				recipe.anchor === 'maxHr' &&
				(profile.maxHr == null || profile.lthr == null)
					? 'no-heart-rate-anchor'
					: 'no-intensity-source',
		}
	}

	const quality: Intensity['quality'] = []
	for (const entry of mix) {
		const band = read(entry.zone, `z${entry.zone}`)
		if (!band) return { reason: 'no-intensity-source' }
		quality.push({
			entry,
			band: band.band,
			if: band.if,
			tssPerHour: band.tssPerHour,
			hours:
				(entry.sessionsPerWeek * MINUTES_IN_ZONE_PER_SESSION[entry.zone]) / 60,
		})
	}

	return {
		easy: { ...easy, zone: EASY_BUCKET_ZONE },
		quality,
		formula,
		steps,
		substitutions,
	}
}

/**
 * The distance leg's two speeds, and the gate that closes where no pace source
 * exists (ADR 0045 §5, §6).
 *
 * Quality volume is priced at threshold pace **uniformly**: zones 3–5 all sit
 * within ±10 % of threshold on ~27 % of the week, so the error on the week's total
 * is 1.8 % — cheap enough to buy away a whole quality-pace table.
 *
 * A cyclist has no threshold *speed* to price either bucket at, so both are
 * priced at the athlete's own ride-window speed. That is one source rather than
 * two conventions, and it is the honest floor: no stable cycling ratio exists to
 * split the buckets with, and inventing one would be the folklore
 * `KM_PER_HOUR = 10` back under a new name. An empty window **closes the gate**
 * rather than falling back to a constant.
 */
function resolvePaceSource(
	input: VolumeConversionInput,
	discipline: CardioDiscipline,
): PaceSource | { reason: UnavailableReason } {
	if (discipline === 'bike') {
		const window = input.rideWindow
		if (!window || window.rides === 0 || window.hours <= 0) {
			return { reason: 'no-ride-history' }
		}
		const speed = window.km / window.hours
		const source = {
			kind: 'ride-window',
			fromWeekKey: window.fromWeekKey,
			weeks: window.weeks,
			rides: window.rides,
		} as const
		return {
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
			reason:
				discipline === 'swim' ? 'no-critical-swim-speed' : 'no-threshold-pace',
		}
	}

	// CSS is sec per 100 m, so a kilometre costs ten of them.
	const secPerKm = discipline === 'swim' ? stored * 10 : stored
	const thresholdSpeed = 3600 / secPerKm
	const ratio = EASY_PACE_RATIO[discipline]
	if (ratio == null) return { reason: 'no-intensity-source' }
	const easySpeed = ratio * thresholdSpeed

	return {
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
					citation:
						discipline === 'swim'
							? 'CSS + 6 s per 100 m, which is 0.926–0.948 across CSS 1:15–1:50'
							: "Daniels' published VDOT table, whose T ÷ E speed ratio holds at 0.825–0.838 across VDOT 40–60",
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
