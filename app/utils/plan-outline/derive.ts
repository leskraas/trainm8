// Per-week volume targets, derived from a Plan Outline and never stored
// (ADR 0040 §1, ADR 0044). A season carries one anchor per Training Track and
// each segment carries a *rate*; every week's target is computed, so nothing can
// go stale.
//
// The formula (ADR 0040 §3) is indexed, not folded:
//
//   target(w) = anchor(w)
//             × Π (1 + rampᵦ) over the loading weeks before w
//             × (1 + boundaryStepᵦ) for each segment boundary crossed
//             × roleFactor(w)          // 1.0 load · (1 − cut) recovery · taper
//
// so week 37 computes without computing weeks 1–36 — random access, no order
// dependence, testable per week in isolation.
//
// **Indices here, dates in storage.** This layer is pure arithmetic over 0-based
// week indices counted from the Outline's first Training Week. Storage keys weeks
// by their Monday (`weekKey`, the `WeekReplan` idiom) so a structural edit never
// shifts a week already lived (ADR 0044 §3); the conversion happens at the read
// boundary, not in here.

/** Loading/recovery rhythm of a Plan Outline phase — which weeks are recovery. */
export const RHYTHMS = ['3:1', '2:1', 'none'] as const
export type Rhythm = (typeof RHYTHMS)[number]

/** The unit a Training Track authors its volume in (ADR 0043 §1). */
export const VOLUME_CURRENCIES = ['km', 'hours', 'tss', 'sets'] as const
export type VolumeCurrency = (typeof VOLUME_CURRENCIES)[number]

/** Volume Landmarks a strength segment interpolates between (ADR 0041 §4). */
export const VOLUME_LANDMARKS = ['MV', 'MEV', 'MAV', 'MRV'] as const
export type VolumeLandmark = (typeof VOLUME_LANDMARKS)[number]

/** A week's role in its phase's rhythm. Roles are multiplicative, never steps. */
export type WeekRole = 'loading' | 'recovery' | 'taper'

/**
 * How deep a recovery week cuts when a segment authors nothing.
 *
 * intervals.icu's default is 3:1 with −30%, citing a 25–40% range (Bompa & Haff
 * 2009; Issurin 2010). This is a **convention**, not injury prevention — the 10%
 * rule has a failed RCT behind it (Buist 2008) — and the copy must say so
 * (ADR 0040 §13). Domain knowledge lives in code, not in athlete data (ADR 0006).
 */
export const DEFAULT_RECOVERY_CUT = 0.3

/**
 * How deep a taper cuts by the event when a segment authors nothing.
 *
 * Bosquet et al. 2007 (meta-analysis): a 2-week taper with volume reduced 41–60%
 * is "the most efficient strategy", optimally *without* modifying intensity or
 * frequency — which is why a taper never touches the Quality Session Mix.
 */
export const DEFAULT_TAPER_CUT = 0.5

/**
 * How deep a strength deload cuts, and for how long, when a segment authors
 * nothing. Bell et al. 2025: volume reduced 40–60% for moderate recovery needs,
 * 5–7 days structured, frequency generally unchanged.
 */
export const DEFAULT_DELOAD_CUT = 0.5
export const DEFAULT_DELOAD_WEEKS = 1

/** A Plan Outline phase, reduced to what the derivation needs. */
export type PhaseSpec = {
	weeks: number
	rhythm: Rhythm
	tapers: boolean
}

/**
 * An endurance Training Track segment: the progression authored over one phase
 * (ADR 0042 §8). `null` on a cut means "follow the documented convention", which
 * is deliberately distinguishable from an authored number of the same size — so
 * moving a convention later leaves the athlete's own numbers untouched.
 */
export type EnduranceSegmentSpec = {
	phaseIndex: number
	/** Volume Ramp: fraction per loading week (0.05 = +5%). Null means no ramp. */
	ramp: number | null
	/** Block Boundary Step at this segment's opening. Null means 0 — continuity. */
	boundaryStep: number | null
	recoveryCut: number | null
	taperCut: number | null
}

/** A Training Track's authored inputs, in its own Volume Currency. */
export type TrackSpec = {
	currency: VolumeCurrency
	/**
	 * Season Anchor segments, earliest first. Each restarts the ramp from itself
	 * (ADR 0040 §5), and none carries a unit (ADR 0043).
	 */
	anchors: Array<{ fromWeekIndex: number; value: number }>
	segments: EnduranceSegmentSpec[]
	/** Hand-set weeks. Absent unless authored; the value is the week's *final* target. */
	overrides: Array<{ weekIndex: number; value: number }>
}

/** Total weeks the phase sequence spans. The plan's length is its consequence. */
export function totalWeeks(phases: PhaseSpec[]): number {
	return phases.reduce((sum, p) => sum + p.weeks, 0)
}

/**
 * Where each phase opens, as a 0-based week index. Phases are contiguous by
 * construction, so this is the only place their spans come from — a gap or an
 * overlap is unrepresentable rather than validated against (ADR 0044 §3).
 */
export function phaseStartIndices(phases: PhaseSpec[]): number[] {
	const starts: number[] = []
	let cumulative = 0
	for (const phase of phases) {
		starts.push(cumulative)
		cumulative += phase.weeks
	}
	return starts
}

/** The phase a week falls in, or null when the week is outside the plan. */
export function phaseIndexForWeek(
	phases: PhaseSpec[],
	weekIndex: number,
): number | null {
	if (weekIndex < 0) return null
	const starts = phaseStartIndices(phases)
	for (let i = phases.length - 1; i >= 0; i--) {
		if (weekIndex >= starts[i]!) {
			return weekIndex < starts[i]! + phases[i]!.weeks ? i : null
		}
	}
	return null
}

/**
 * A week's role. A tapering phase tapers throughout — Mujika & Padilla 2003 find
 * a progressive taper beats a step taper, so the whole phase descends rather than
 * its last week dropping. Otherwise the rhythm places the recovery weeks: 3:1
 * makes every 4th week recovery, 2:1 every 3rd, and `none` has none at all.
 */
export function weekRole(phases: PhaseSpec[], weekIndex: number): WeekRole {
	const phaseIndex = phaseIndexForWeek(phases, weekIndex)
	if (phaseIndex == null) return 'loading'
	const phase = phases[phaseIndex]!
	if (phase.tapers) return 'taper'
	const weekInPhase = weekIndex - phaseStartIndices(phases)[phaseIndex]!
	const period = phase.rhythm === '3:1' ? 4 : phase.rhythm === '2:1' ? 3 : 0
	if (period === 0) return 'loading'
	return (weekInPhase + 1) % period === 0 ? 'recovery' : 'loading'
}

/**
 * The multiplicative factor a week's role applies (ADR 0040 §2). Recovery and
 * taper weeks contribute nothing to the progression: the next loading week
 * resumes one step above the last *loading* week, never above the deload — which
 * is what the prototype's +50% cliff was actually measuring.
 *
 * The taper descends exponentially to its full cut in the phase's final week, per
 * Bosquet 2007 ("volume exponentially reduced"). The shape is a documented
 * function rather than stored per-week values, which would re-store what ADR 0040
 * §1 derives.
 */
function roleFactor(
	phases: PhaseSpec[],
	segment: EnduranceSegmentSpec | undefined,
	weekIndex: number,
): number {
	const role = weekRole(phases, weekIndex)
	if (role === 'loading') return 1
	if (role === 'recovery')
		return 1 - (segment?.recoveryCut ?? DEFAULT_RECOVERY_CUT)

	const phaseIndex = phaseIndexForWeek(phases, weekIndex)!
	const phase = phases[phaseIndex]!
	const weekInPhase = weekIndex - phaseStartIndices(phases)[phaseIndex]!
	const cut = segment?.taperCut ?? DEFAULT_TAPER_CUT
	return Math.pow(1 - cut, (weekInPhase + 1) / phase.weeks)
}

/** Loading weeks in `phaseIndex` that fall in `[fromWeek, toWeek)`. */
function loadingWeeksBetween(
	phases: PhaseSpec[],
	phaseIndex: number,
	fromWeek: number,
	toWeek: number,
): number {
	const start = phaseStartIndices(phases)[phaseIndex]!
	const end = start + phases[phaseIndex]!.weeks
	let count = 0
	for (let w = Math.max(start, fromWeek); w < Math.min(end, toWeek); w++) {
		if (weekRole(phases, w) === 'loading') count++
	}
	return count
}

/**
 * The last loading week at or before `weekIndex`, not earlier than the anchor's
 * own week. Falls back to the anchor week itself, so a plan that opens on a
 * recovery or taper week references the anchor rather than a week before it.
 */
function lastLoadingWeekBefore(
	phases: PhaseSpec[],
	weekIndex: number,
	anchorWeekIndex: number,
): number {
	for (let w = weekIndex - 1; w >= anchorWeekIndex; w--) {
		if (weekRole(phases, w) === 'loading') return w
	}
	return anchorWeekIndex
}

/** The anchor segment in force for a week, or null when none applies yet. */
function anchorForWeek(
	track: TrackSpec,
	weekIndex: number,
): { fromWeekIndex: number; value: number } | null {
	let applicable: { fromWeekIndex: number; value: number } | null = null
	for (const anchor of track.anchors) {
		if (anchor.fromWeekIndex <= weekIndex) {
			if (!applicable || anchor.fromWeekIndex > applicable.fromWeekIndex) {
				applicable = anchor
			}
		}
	}
	return applicable
}

/**
 * A week's volume target in the track's **Volume Currency**, or null when it
 * cannot be derived honestly — no anchor in force, or a week outside the plan.
 * Null is an **Unavailable Metric**, never a fabricated number (ADR 0041 §7).
 *
 * This is the **endurance** progression rule: a rate per loading week. A strength
 * track progresses between **Volume Landmarks** instead (ADR 0041 §4), and those
 * landmarks are *athlete* attributes that this schema does not yet carry — their
 * granularity is #381's and their numbers #380's — so a strength track's targets
 * are Unavailable rather than derived here.
 *
 * An **override** short-circuits everything and is the week's *final* target: the
 * role factor is not applied on top, or the number the athlete typed would never
 * be the number they get. It is a leaf and is never folded forward, so the
 * following week still computes from the anchor and the ramps (ADR 0044 §5).
 */
export function weekTarget(
	phases: PhaseSpec[],
	track: TrackSpec,
	weekIndex: number,
): number | null {
	const override = track.overrides.find((o) => o.weekIndex === weekIndex)
	if (override) return override.value

	if (phaseIndexForWeek(phases, weekIndex) == null) return null
	const anchor = anchorForWeek(track, weekIndex)
	if (!anchor) return null

	const segmentFor = (phaseIndex: number) =>
		track.segments.find((s) => s.phaseIndex === phaseIndex)

	// The ramp product freezes at the **last loading week**, because "a recovery
	// week is last loading week × (1 − cut)" and "the next loading week resumes one
	// step above the last *loading* week" (ADR 0040 §2). Letting a recovery or taper
	// week inherit the step that a loading week in its position would have taken
	// would quietly make the deload's reference the ramp rather than the loading
	// peak — and the loading peak is the survey's strongest convergence.
	const reference =
		weekRole(phases, weekIndex) === 'loading'
			? weekIndex
			: lastLoadingWeekBefore(phases, weekIndex, anchor.fromWeekIndex)

	let value = anchor.value
	const fromPhase = phaseIndexForWeek(phases, anchor.fromWeekIndex) ?? 0
	const toPhase = phaseIndexForWeek(phases, weekIndex)!

	for (let p = fromPhase; p <= toPhase; p++) {
		const segment = segmentFor(p)
		// A boundary is crossed only where the anchor did not restart the product:
		// re-anchoring makes its own week the new base (ADR 0040 §5). The step
		// belongs to the segment the week sits in, so it applies even in a taper.
		if (p > fromPhase && segment?.boundaryStep != null) {
			value *= 1 + segment.boundaryStep
		}
		const steps = loadingWeeksBetween(
			phases,
			p,
			anchor.fromWeekIndex,
			reference,
		)
		if (segment?.ramp != null && steps > 0) {
			value *= Math.pow(1 + segment.ramp, steps)
		}
	}

	return value * roleFactor(phases, segmentFor(toPhase), weekIndex)
}

/** Every week's target, earliest first — the whole season in one pass. */
export function weekTargets(
	phases: PhaseSpec[],
	track: TrackSpec,
): Array<number | null> {
	return Array.from({ length: totalWeeks(phases) }, (_, w) =>
		weekTarget(phases, track, w),
	)
}
