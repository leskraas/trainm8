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
 * A **strength** week's role, taken from its **Training Track segment**'s own tail
 * rather than from the phase rhythm, which has no effect on it (ADR 0047 §6).
 *
 * Two values and not the rhythm's three. A strength week is never `recovery` —
 * the rhythm does not reach it — and never `taper`, because a strength track has
 * **no taper mechanism** at all: peaking is a negative **Block Boundary Step**, a
 * tail deload, or a segment that ends before the event.
 *
 * A union of its own rather than a fourth member of `WeekRole`, because the two
 * are different quantities on different carriers: `WeekRole` is a *season* week's
 * role in the phase it sits in, and this is a role inside a segment that floats
 * free of the phases. A week can carry one of each at once.
 */
export type StrengthWeekRole = 'loading' | 'deload'

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
 * A week's volume target in the track's **Volume Currency**, or null when it
 * cannot be derived honestly — no anchor in force, or a week outside the plan.
 * Null is an **Unavailable Metric**, never a fabricated number (ADR 0041 §7).
 *
 * This walks the **phases**, so it reads a track's `endurance` segments and steps
 * over its `strength` ones. ADR 0047 §1 gives both kinds the same anchor-and-ramp
 * progression, but a strength segment is positioned by its own dates and takes its
 * week roles from its own tail deload rather than from the phase rhythm (ADR 0047
 * §6, ADR 0044 §4) — so it is a second walk over the same arithmetic, not a case
 * inside this one. That walk is `strengthWeekTarget`, below; which of the two
 * prices a track is decided by its **Discipline** in `from-rows.ts`.
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

// ---------------------------------------------------------------------------
// The strength walk (ADR 0047 §1, §6)
//
// The same arithmetic as `weekTarget` above — anchor, ramp, boundary step, role
// factor, indexed rather than folded — over the **segments** instead of over the
// phases. Two things make it a second walk rather than a case inside the first:
// a strength segment is positioned by its own dates, and its week roles come from
// its own tail deload. Everything else is deliberately the same shape, so the two
// tracks cannot drift apart on the arithmetic they share.
// ---------------------------------------------------------------------------

/** The week after a strength segment's last: its window is `[start, end)`. */
function segmentEnd(segment: StrengthSegmentSpec): number {
	return segment.startWeekIndex + segment.weeks
}

/**
 * How many of this segment's tail weeks deload — the authored number, or the
 * convention, clamped into the segment. A deload longer than the segment covers
 * all of it rather than reaching back into the weeks before it.
 */
function deloadWeeksOf(segment: StrengthSegmentSpec): number {
	const authored = segment.deloadWeeks ?? DEFAULT_DELOAD_WEEKS
	return Math.min(Math.max(authored, 0), segment.weeks)
}

/** A week's role **within one segment**, which is the only place a role exists. */
function roleInSegment(
	segment: StrengthSegmentSpec,
	weekIndex: number,
): StrengthWeekRole {
	const weekInSegment = weekIndex - segment.startWeekIndex
	return weekInSegment >= segment.weeks - deloadWeeksOf(segment)
		? 'deload'
		: 'loading'
}

/** This track's strength segments, earliest first — the order the walk crosses. */
function strengthSegments(track: TrackSpec): StrengthSegmentSpec[] {
	return track.segments
		.filter((s): s is StrengthSegmentSpec => s.kind === 'strength')
		.sort((a, b) => a.startWeekIndex - b.startWeekIndex)
}

/**
 * The segment a week is lifted in, or null where it falls in a gap between them.
 *
 * **Deterministic on overlap:** two segments whose windows hold the same week is
 * a state the authoring service refuses, not one this arithmetic may resolve by
 * accident, so the segment with the **latest** `startWeekIndex` wins — the later
 * authored intent — and the answer never depends on row order. The loser is not
 * dropped from the ramp walk below; it only loses the week's role and cut.
 */
function strengthSegmentForWeek(
	track: TrackSpec,
	weekIndex: number,
): StrengthSegmentSpec | null {
	let holder: StrengthSegmentSpec | null = null
	for (const segment of strengthSegments(track)) {
		const holds =
			segment.startWeekIndex <= weekIndex && weekIndex < segmentEnd(segment)
		if (holds && (!holder || segment.startWeekIndex >= holder.startWeekIndex)) {
			holder = segment
		}
	}
	return holder
}

/**
 * A strength week's role, or null where the week is in no segment at all — which
 * is the authored "no lifting this week" rather than a role the walk could not
 * work out.
 */
export function strengthWeekRole(
	track: TrackSpec,
	weekIndex: number,
): StrengthWeekRole | null {
	const segment = strengthSegmentForWeek(track, weekIndex)
	return segment == null ? null : roleInSegment(segment, weekIndex)
}

/** Loading weeks of `segment` that fall in `[fromWeek, toWeek)`. */
function strengthLoadingWeeksBetween(
	segment: StrengthSegmentSpec,
	fromWeek: number,
	toWeek: number,
): number {
	let count = 0
	const start = Math.max(segment.startWeekIndex, fromWeek)
	const end = Math.min(segmentEnd(segment), toWeek)
	for (let w = start; w < end; w++) {
		// A **deload week never advances the ramp index** (ADR 0040 §3, ADR 0047 §6),
		// and the role is read from *this* segment rather than from the track, so an
		// overlap cannot make one segment's deload silence another's loading week.
		if (roleInSegment(segment, w) === 'loading') count++
	}
	return count
}

/**
 * The last loading week at or before `weekIndex`, searching backwards **across**
 * segments and the gaps between them, and never earlier than the anchor's own
 * week. Falls back to the anchor week, so a window holding no loading week at all
 * references the anchor rather than a week before it.
 */
function lastStrengthLoadingWeekBefore(
	track: TrackSpec,
	weekIndex: number,
	anchorWeekIndex: number,
): number {
	for (let w = weekIndex - 1; w >= anchorWeekIndex; w--) {
		if (strengthWeekRole(track, w) === 'loading') return w
	}
	return anchorWeekIndex
}

/** The factor a strength week's role applies. A deload is **flat**, never progressive. */
function strengthRoleFactor(
	segment: StrengthSegmentSpec,
	weekIndex: number,
): number {
	if (roleInSegment(segment, weekIndex) === 'loading') return 1
	// Every week of a multi-week deload reads the same number: the convention is
	// −50% over one week (Bell 2025), held rather than descended, which is what
	// separates it from the endurance taper's exponential shape.
	return 1 - (segment.deloadCut ?? DEFAULT_DELOAD_CUT)
}

/**
 * A **strength** week's volume target in the track's Volume Currency — `weekTarget`'s
 * arithmetic walked over the segments the athlete dated (ADR 0047 §1, §6).
 *
 * Four answers, in this order, because the order is the meaning:
 *
 * 1. A **Week Volume Override** is the week's *final* target and short-circuits
 *    everything, role factor included (ADR 0044 §5).
 * 2. A week outside the plan is an **Unavailable Metric**.
 * 3. A week inside the plan but outside every strength segment is **`0`** — the
 *    authored "no lifting these weeks", a positive statement and not a hole. It
 *    is answered *before* the anchor, because the gap is authored independently
 *    of any anchor and stays true whether or not one is in force.
 * 4. No anchor in force is an **Unavailable Metric**: there is nothing to derive
 *    from, and a fabricated number is never the answer (ADR 0041 §7).
 *
 * Then the product: the anchor, one ramp step per **loading** week crossed inside
 * each segment from the anchor's through this week's, one **Block Boundary Step**
 * per segment opening after the first, and the week's role factor. `phases` is
 * read for the plan's length only — the rhythm has no effect on a strength week.
 */
export function strengthWeekTarget(
	phases: PhaseSpec[],
	track: TrackSpec,
	weekIndex: number,
): number | null {
	const override = track.overrides.find((o) => o.weekIndex === weekIndex)
	if (override) return override.value

	if (weekIndex < 0 || weekIndex >= totalWeeks(phases)) return null

	const segment = strengthSegmentForWeek(track, weekIndex)
	if (!segment) return 0

	const anchor = anchorForWeek(track, weekIndex)
	if (!anchor) return null

	// The ramp product **freezes at the last loading week**, exactly as the
	// endurance walk's does: a deload week reads that week × (1 − cut), and the
	// week after it resumes one step above that week and never above the deload.
	const reference =
		roleInSegment(segment, weekIndex) === 'loading'
			? weekIndex
			: lastStrengthLoadingWeekBefore(track, weekIndex, anchor.fromWeekIndex)

	// Every segment the walk crosses: opened by this week, and not already closed
	// when the anchor took effect. A gap between two of them contributes no step
	// and resets nothing — the next segment opens from the last loading week
	// before it, times its own boundary step.
	const crossed = strengthSegments(track).filter(
		(candidate) =>
			candidate.startWeekIndex <= weekIndex &&
			segmentEnd(candidate) > anchor.fromWeekIndex,
	)

	let value = anchor.value
	crossed.forEach((candidate, position) => {
		// The step is skipped where the product restarted: a re-anchor makes its own
		// week the new base (ADR 0040 §5), so the segment holding the anchor week —
		// which is the first one crossed — must not discount the number the athlete
		// just typed. This is the endurance walk's `p > fromPhase` rule, over dates.
		if (position > 0 && candidate.boundaryStep != null) {
			value *= 1 + candidate.boundaryStep
		}
		const steps = strengthLoadingWeeksBetween(
			candidate,
			anchor.fromWeekIndex,
			reference,
		)
		if (candidate.ramp != null && steps > 0) {
			value *= Math.pow(1 + candidate.ramp, steps)
		}
	})

	return value * strengthRoleFactor(segment, weekIndex)
}

/** Every strength week's target, earliest first — the whole season in one pass. */
export function strengthWeekTargets(
	phases: PhaseSpec[],
	track: TrackSpec,
): Array<number | null> {
	return Array.from({ length: totalWeeks(phases) }, (_, w) =>
		strengthWeekTarget(phases, track, w),
	)
}
