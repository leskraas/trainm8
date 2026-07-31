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

/**
 * How precisely each currency is worth carrying: distance and hours to a tenth,
 * because a tenth of an hour is a real distinction to an athlete; TSS and sets
 * whole, because they are counted things.
 *
 * One source, read by both the **Season Anchor** pre-fill's rounding and the
 * display layer's formatting — so a pre-filled number and the number rendered
 * back cannot disagree about their precision.
 */
export const CURRENCY_DECIMALS: Record<VolumeCurrency, number> = {
	km: 1,
	hours: 1,
	tss: 0,
	sets: 0,
}

/** `value` at its currency's precision (`CURRENCY_DECIMALS`). */
export function roundToCurrency(
	value: number,
	currency: VolumeCurrency,
): number {
	const factor = 10 ** CURRENCY_DECIMALS[currency]
	return Math.round(value * factor) / factor
}

/**
 * The adaptation a strength segment is authored for (ADR 0047 §3) — ACSM 2026's
 * three, under the field's own term for the middle one.
 *
 * The `%1RM` band and rep range are **derived** from this token and never authored
 * beside it, so the two cannot disagree; and it derives the intensity side only,
 * never sets per week, which stays the Season Anchor's and the ramp's.
 *
 * This replaces the **Volume Landmarks** (MV < MEV < MAV < MRV) a strength segment
 * used to interpolate between (ADR 0041 §4), retired on the evidence in ADR 0047
 * §8 and the #380 asset — which is where the account of why belongs, rather than
 * restated here.
 */
export const STRENGTH_GOALS = [
	'hypertrophy',
	'maximal-strength',
	'power',
] as const
export type StrengthGoal = (typeof STRENGTH_GOALS)[number]

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
	kind: 'endurance'
	phaseIndex: number
	/** Volume Ramp: fraction per loading week (0.05 = +5%). Null means no ramp. */
	ramp: number | null
	/** Block Boundary Step at this segment's opening. Null means 0 — continuity. */
	boundaryStep: number | null
	recoveryCut: number | null
	taperCut: number | null
}

/**
 * A strength Training Track segment: the same anchor-and-ramp progression, over a
 * stretch the athlete dates rather than one the phases give it (ADR 0047 §1/§6).
 *
 * It is positioned by `startWeekIndex` + `weeks` and **not** by `phaseIndex`,
 * because a strength mesocycle has no reason to divide an endurance phase, and
 * because a gap between segments is a positive statement — "no lifting these
 * weeks" — rather than a hole in the plan.
 *
 * `goal` and `sessionsPerWeek` are what it authors beside the progression, where
 * an endurance segment authors a Quality Session Mix (ADR 0047 §3/§4). Neither
 * feeds the volume target: the goal derives the `%1RM` band and the rep range, and
 * the frequency answers "how often", so wiring either into sets per week would
 * give the plan two sources for one number.
 */
export type StrengthSegmentSpec = {
	kind: 'strength'
	/** 0-based week this segment opens on, counted from the Outline's first week. */
	startWeekIndex: number
	/** Authored duration in weeks — a choice, never a consequence (ADR 0047 §6). */
	weeks: number
	ramp: number | null
	boundaryStep: number | null
	goal: StrengthGoal | null
	sessionsPerWeek: number | null
	/**
	 * How deep the deload cuts and how many weeks of the segment's tail it covers.
	 * Null means the documented convention (−50% over 1 week; Bell 2025). The
	 * deload closes this segment rather than landing where the endurance phase's
	 * recovery week falls, which is the coupling Issurin separates blocks to avoid.
	 */
	deloadCut: number | null
	deloadWeeks: number | null
}

/**
 * A Training Track segment, discriminated by the two kinds' authored shape rather
 * than by their progression rule — which ADR 0047 §1 made common to both.
 */
export type SegmentSpec = EnduranceSegmentSpec | StrengthSegmentSpec

/** A Training Track's authored inputs, in its own Volume Currency. */
export type TrackSpec = {
	currency: VolumeCurrency
	/**
	 * Season Anchor segments, earliest first. Each restarts the ramp from itself
	 * (ADR 0040 §5), and none carries a unit (ADR 0043).
	 */
	anchors: Array<{ fromWeekIndex: number; value: number }>
	segments: SegmentSpec[]
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
 * Every week's role inside **one** phase, in order.
 *
 * This is what makes a rhythm's recovery weeks visible *before* the athlete
 * commits to it (#402): a phase edited in isolation has no season around it yet.
 * It is `weekRole` over a one-phase season rather than a second reading of the
 * rhythm, so a preview cannot promise recovery weeks that land elsewhere once the
 * phase is saved.
 */
export function phaseWeekRoles(phase: PhaseSpec): WeekRole[] {
	return Array.from({ length: phase.weeks }, (_, week) =>
		weekRole([phase], week),
	)
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
 * What the athlete **hand-set** for a week, or `undefined` where they hand-set
 * nothing — the one reading of a track's **Week Volume Overrides** (ADR 0044 §5).
 *
 * `undefined` for absence, never `null` and never a falsy test: `0` is a week without
 * training that the athlete *meant*, so "nothing hand-set" has to be a value `0`
 * cannot be mistaken for. That is why every caller tests it with `??` or with
 * `!== undefined`, and why a `||` here would quietly hand a week off back to the rule.
 *
 * Two callers, one per side of the same rule: {@link weekTarget}, where an override
 * short-circuits the endurance walk, and the Weeks reading in `from-rows.ts`, which
 * sits the override *above* whichever walk the track's Discipline selects. Shared so
 * the two cannot disagree about what a hand-set week is.
 */
export function handSetWeekTarget(
	track: TrackSpec,
	weekIndex: number,
): number | undefined {
	return track.overrides.find((override) => override.weekIndex === weekIndex)
		?.value
}

/**
 * A week's volume target in the track's **Volume Currency**, or null when it
 * cannot be derived honestly — no anchor in force, or a week outside the plan.
 * Null is an **Unavailable Metric**, never a fabricated number (ADR 0041 §7).
 *
 * A **Week Volume Override** short-circuits everything and is the week's *final*
 * target: the role factor is not applied on top, or the number the athlete typed
 * would never be the number they get. It is a leaf and is never folded forward, so
 * the following week still computes from the anchor and the ramps (ADR 0044 §5).
 *
 * The short-circuit is **total**: it answers before anything else looks at the
 * season, so a row keyed outside the plan's span reads back as the athlete
 * authored it rather than as Unavailable. Refusing to *author* such a week is the
 * authoring service's job, not this function's.
 *
 * Everything else is {@link derivedWeekTarget}, which is what a revert restores.
 */
export function weekTarget(
	phases: PhaseSpec[],
	track: TrackSpec,
	weekIndex: number,
): number | null {
	const handSet = handSetWeekTarget(track, weekIndex)
	if (handSet !== undefined) return handSet
	return derivedWeekTarget(phases, track, weekIndex)
}

/**
 * The target **the rule gives** for a week, ignoring any hand-set override — what
 * a revert restores.
 *
 * Two functions rather than one with a flag, because a hand-set week has to say
 * both things at once: the number the athlete typed, and the number the rule would
 * have given in its place. ADR 0044 §5 requires an override to be *marked and
 * revertible*, and a revert with nothing to restore is not one.
 *
 * It reads `track.overrides` **nowhere** — including on the very week asked for.
 * The role factor still applies, so what a revert restores on a recovery week is
 * the cut off the last loading week, not the uncut level.
 *
 * This walks the **phases**, so it reads a track's `endurance` segments and steps
 * over its `strength` ones. ADR 0047 §1 gives both kinds the same anchor-and-ramp
 * progression, but a strength segment is positioned by its own dates and takes its
 * week roles from its own tail deload rather than from the phase rhythm (ADR 0047
 * §6, ADR 0044 §4) — so it is a second walk over the same arithmetic, not a case
 * inside this one. That walk is **not written yet**: `resolvedTracks` in
 * `from-rows.ts` marks the branch where it goes, and a strength track's weeks read
 * Unavailable until it does.
 */
export function derivedWeekTarget(
	phases: PhaseSpec[],
	track: TrackSpec,
	weekIndex: number,
): number | null {
	if (phaseIndexForWeek(phases, weekIndex) == null) return null
	const anchor = anchorForWeek(track, weekIndex)
	if (!anchor) return null

	// A phase addresses endurance segments only: a strength segment carries no
	// `phaseIndex`, by ADR 0047 §6, so there is nothing here for it to match.
	const segmentFor = (phaseIndex: number) =>
		track.segments.find(
			(s): s is EnduranceSegmentSpec =>
				s.kind === 'endurance' && s.phaseIndex === phaseIndex,
		)

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

/**
 * Every week's target **as the rule gives it**, earliest first, reading no override
 * anywhere — the plural of {@link derivedWeekTarget}, exactly as {@link weekTargets}
 * is the plural of {@link weekTarget}.
 *
 * Its own function rather than a flag on `weekTargets`, and the reason is the Weeks
 * reading: a surface that has to *mark* a hand-set week and offer the revert beside it
 * needs the whole season's derived numbers as a column of their own, beside the
 * hand-set ones (ADR 0044 §5).
 */
export function derivedWeekTargets(
	phases: PhaseSpec[],
	track: TrackSpec,
): Array<number | null> {
	return Array.from({ length: totalWeeks(phases) }, (_, w) =>
		derivedWeekTarget(phases, track, w),
	)
}
