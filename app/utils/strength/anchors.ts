/**
 * **Exercise anchors** — the one choke point where a prescription's **Load
 * Target** becomes kilos *for this athlete*, or states plainly that it cannot.
 *
 * Pure, on the repo's stated contract: no clock (`asOfISO` is an argument), no
 * random source, mutates nothing, cannot query. The server half loads the
 * athlete's `ExerciseThreshold` rows and their bodyweight; this decides.
 *
 * Four rules the shape enforces rather than documents.
 *
 * **A resolution is a tagged union, so a number the anchors do not support
 * cannot be rendered.** There is no `kg: number | null` here for a caller to
 * default to zero: an unavailable resolution carries the *authored* form plus the
 * stated absence and what would fix it, and has no `kg` at all.
 *
 * **`repMax` is a peer of `oneRm`, never a derivative.** `@ 8RM` with only a 5RM
 * on file refuses, and that is the correct answer — converting an observed 8RM up
 * to a 1RM and back down is a round trip through a ± 10 % transform, twice, and
 * `@ 8RM` is already a complete instruction. It is also the **novice path**: a
 * rep-max reference is self-calibrating and needs no stored anchor to be
 * prescribed at all.
 *
 * **Every resolved number names its basis** — which anchor, which construct,
 * which protocol, what confidence, and as of when. The caveat sits on the number
 * in one phrase; the argument waits behind a tap.
 *
 * **Anchors are effective-dated and read as-of.** The latest anchor effective on
 * or before the day asked about wins, so a session from March still reads against
 * the anchor it was prescribed from after April's re-test. ADR 0054's Consequences
 * log `ThresholdEvent.effectiveAt` as written-and-never-read; this resolver
 * exists so `ExerciseThreshold` does not repeat it.
 */
import {
	type AnchorConfidence,
	type AnchorConstruct,
	type AnchorProtocol,
} from '../strength-log.ts'
import { type LoadTarget } from '../workout-schema.ts'

// ——— What an anchor is ————————————————————————————————————————————————————

/**
 * One `ExerciseThreshold` row as the pure layer sees it: what was measured, its
 * value, the rep count it is *at*, how it was arrived at, and from when.
 */
export type Anchor = {
	construct: AnchorConstruct
	valueKg: number
	/** Required on a `repMax` and on an `estimatedOneRm`; `null` on a tested 1RM. */
	reps: number | null
	protocol: AnchorProtocol
	/** `null` where the athlete typed the number — ADR 0054, and the migration's
	 * `protocol = 'athlete-stated' ⟹ confidence IS NULL`. */
	confidence: AnchorConfidence | null
	effectiveAtISO: string
}

export type ResolveContext = {
	/** This exercise's anchors, in any order. Scoped by the caller: a back squat
	 * 1RM says nothing about a front squat. */
	anchors: readonly Anchor[]
	/** `AthleteProfile.weightKg`, or `null` where none is on file. */
	bodyweightKg: number | null
	/** The day the prescription is being read for. */
	asOfISO: string
}

/** Why a Load Target produced no kilos. Three reasons, three different fixes. */
export const LOAD_UNAVAILABLE_REASONS = [
	/** No anchor of the construct this target needs, as of that day. */
	'no-anchor',
	/** The target is bodyweight-derived and no bodyweight is on file. */
	'no-bodyweight',
	/** Not something the app computes — permanently, not yet. */
	'not-resolvable',
] as const
export type LoadUnavailableReason = (typeof LOAD_UNAVAILABLE_REASONS)[number]

/**
 * Where a resolved kilo came from. `construct: 'authored'` is the passthrough
 * case — an absolute load is its own basis — and `'bodyweight'` is the athlete's
 * own mass, which is a measurement rather than an anchor.
 */
export type ResolutionBasis = {
	construct: AnchorConstruct | 'authored' | 'bodyweight'
	protocol: AnchorProtocol | null
	/** `null` for an authored number, for a bodyweight, and for anything the
	 * athlete stated about themselves — the app does not grade those. */
	confidence: AnchorConfidence | null
	anchorValueKg: number | null
	anchorReps: number | null
	effectiveAtISO: string | null
	/** The provenance as one phrase: *"85 % of your tested 140 kg 1RM"*. */
	text: string
}

/**
 * Kilos with their provenance, or the authored form with a stated absence.
 *
 * A `kg`/`kgMax` pair rather than a single number, because `80–85 % 1RM` is a
 * *band* and silently resolving it to its bottom end would turn a range into a
 * target nobody wrote.
 */
export type LoadResolution =
	| {
			kind: 'resolved'
			kg: number
			/** The top of the band where the target is a range, else `null`. */
			kgMax: number | null
			basis: ResolutionBasis
	  }
	| {
			kind: 'unavailable'
			reason: LoadUnavailableReason
			/** The prescription as authored — the only thing a surface may show. */
			authored: LoadTarget
			/** The absence, stated: *"no 8RM on file for this lift"*. */
			text: string
			/** What would fix it, in the athlete's own terms. */
			fix: string
	  }

// ——— As-of resolution —————————————————————————————————————————————————————

/**
 * The latest anchor of this construct effective **on or before** `asOfISO`.
 *
 * `reps` is matched **exactly** when a number is given, and ignored when `null`.
 * That is what makes `@ 8RM` a lookup rather than a conversion: there is no
 * nearest-rep-count fallback, because the nearest rep count is a different
 * quantity.
 */
export function resolveAnchor(
	anchors: readonly Anchor[],
	construct: AnchorConstruct,
	reps: number | null,
	asOfISO: string,
): Anchor | null {
	const asOf = Date.parse(asOfISO)
	const candidates = anchors.filter(
		(anchor) =>
			anchor.construct === construct &&
			(reps == null || anchor.reps === reps) &&
			Date.parse(anchor.effectiveAtISO) <= asOf,
	)
	if (candidates.length === 0) return null
	return candidates.reduce((latest, anchor) =>
		Date.parse(anchor.effectiveAtISO) > Date.parse(latest.effectiveAtISO)
			? anchor
			: latest,
	)
}

// ——— The choke point —————————————————————————————————————————————————————

/**
 * Resolve one **Load Target** against one athlete's anchors, as of a day.
 *
 * One branch per member of the union, and no branch guesses. The `velocity`
 * member is `not-resolvable` **permanently**: velocity-loss prescription requires
 * a sensor, so it is authorable and athlete-reported and never app-computed.
 */
export function resolveLoadTarget(
	target: LoadTarget,
	ctx: ResolveContext,
): LoadResolution {
	switch (target.kind) {
		case 'absolute':
			return {
				kind: 'resolved',
				kg: round(target.kg),
				kgMax: null,
				basis: {
					construct: 'authored',
					protocol: null,
					confidence: null,
					anchorValueKg: null,
					anchorReps: null,
					effectiveAtISO: null,
					text: 'as prescribed',
				},
			}

		case 'pct1RM': {
			// A **ladder**, not two competing numbers: a tested maximum and a
			// formula's output are different claims, and what the surface needs is one
			// answer plus the protocol that produced it. `resolveClassifier`'s
			// precedent, and the reason `estimatedOneRm` is a separate construct.
			const anchor =
				resolveAnchor(ctx.anchors, 'oneRm', null, ctx.asOfISO) ??
				resolveAnchor(ctx.anchors, 'estimatedOneRm', null, ctx.asOfISO)
			if (!anchor) {
				return unavailable(target, 'no-anchor', {
					text: 'no 1RM on file for this lift',
					fix: 'Record a 1RM for this lift, or let the app read one from a set you already logged.',
				})
			}
			const confidence = gradedConfidence(anchor)
			return {
				kind: 'resolved',
				kg: round((anchor.valueKg * target.minPct) / 100),
				kgMax:
					target.maxPct == null
						? null
						: round((anchor.valueKg * target.maxPct) / 100),
				basis: {
					construct: anchor.construct,
					protocol: anchor.protocol,
					confidence,
					anchorValueKg: anchor.valueKg,
					anchorReps: anchor.reps,
					effectiveAtISO: anchor.effectiveAtISO,
					text: `${pctText(target.minPct, target.maxPct)} of your ${anchorText(anchor)}`,
				},
			}
		}

		case 'repMax': {
			const anchor = resolveAnchor(
				ctx.anchors,
				'repMax',
				target.reps,
				ctx.asOfISO,
			)
			if (!anchor) {
				// **Deliberately not derived.** Neither from a 1RM converted down nor
				// from a rep max at other reps converted up: both are round trips
				// through a ± 10 % transform, and a fabricated `8RM` is worse than the
				// honest instruction *"the heaviest load you can do 8 reps with"*.
				return unavailable(target, 'no-anchor', {
					text: `no ${target.reps}RM on file for this lift`,
					fix: `Record the heaviest load you can lift for exactly ${target.reps} reps. It is not converted from another rep count.`,
				})
			}
			return {
				kind: 'resolved',
				kg: round(anchor.valueKg),
				kgMax: null,
				basis: {
					construct: anchor.construct,
					protocol: anchor.protocol,
					confidence: gradedConfidence(anchor),
					anchorValueKg: anchor.valueKg,
					anchorReps: anchor.reps,
					effectiveAtISO: anchor.effectiveAtISO,
					text: `your ${anchorText(anchor)}`,
				},
			}
		}

		case 'bodyweight':
		case 'pctBodyweight': {
			if (ctx.bodyweightKg == null) {
				return unavailable(target, 'no-bodyweight', {
					text: 'no bodyweight on file',
					fix: 'Add your bodyweight to your profile and this resolves to kilos.',
				})
			}
			const kg =
				target.kind === 'bodyweight'
					? ctx.bodyweightKg + (target.addedKg ?? 0)
					: (ctx.bodyweightKg * target.pct) / 100
			if (kg <= 0) {
				// An assistance heavier than the athlete is not a lighter set, it is a
				// number that cannot be true — `effectiveLoadKg`'s rule, on the
				// prescription side.
				return unavailable(target, 'not-resolvable', {
					text: 'the assistance is heavier than the athlete, so this cannot be a load',
					fix: 'Reduce the assistance below your bodyweight.',
				})
			}
			return {
				kind: 'resolved',
				kg: round(kg),
				kgMax: null,
				basis: {
					construct: 'bodyweight',
					protocol: null,
					// A bodyweight is a measurement, not an estimate, so there is
					// nothing here to grade.
					confidence: null,
					anchorValueKg: ctx.bodyweightKg,
					anchorReps: null,
					effectiveAtISO: null,
					text:
						target.kind === 'bodyweight'
							? bodyweightText(ctx.bodyweightKg, target.addedKg ?? 0)
							: `${trim(target.pct)} % of your ${trim(ctx.bodyweightKg)} kg bodyweight`,
				},
			}
		}

		case 'velocity':
			return unavailable(target, 'not-resolvable', {
				text: 'a bar-velocity target is not something the app can compute',
				fix: 'Velocity needs a sensor. Log the set and report the velocity yourself.',
			})
	}
}

/**
 * The resolution as one phrase, in place — *"119 kg · 85 % of your tested 140 kg
 * 1RM"* — and, where nothing resolved, the absence with **no kilo in it**.
 *
 * The prescription's own authored form is the Token Sentence's job (ADR 0027,
 * `setLoadText`); this is only the resolution half, so a caller composes the two
 * rather than this module restating notation.
 */
export function loadResolutionText(resolution: LoadResolution): string {
	if (resolution.kind === 'unavailable') return resolution.text
	const range =
		resolution.kgMax == null
			? `${trim(resolution.kg)} kg`
			: `${trim(resolution.kg)}–${trim(resolution.kgMax)} kg`
	return `${range} · ${resolution.basis.text}`
}

// ——— The phrasing ————————————————————————————————————————————————————————

function unavailable(
	authored: LoadTarget,
	reason: LoadUnavailableReason,
	stated: { text: string; fix: string },
): LoadResolution {
	return { kind: 'unavailable', reason, authored, ...stated }
}

/**
 * **The app does not grade a figure somebody stated about themselves** (ADR
 * 0054), so an `athlete-stated` anchor's confidence is `null` here even if a
 * caller hands one over. Enforced in code rather than trusted from the row,
 * because this is the function every surface reads.
 */
function gradedConfidence(anchor: Anchor): AnchorConfidence | null {
	return anchor.protocol === 'athlete-stated' ? null : anchor.confidence
}

/** The anchor as a lifter would hear it, with its provenance on its face. */
function anchorText(anchor: Anchor): string {
	const value = `${trim(anchor.valueKg)} kg`
	switch (anchor.construct) {
		case 'oneRm':
			return `${anchor.protocol === 'athlete-stated' ? 'stated' : 'tested'} ${value} 1RM`
		case 'estimatedOneRm':
			return `estimated ${value} 1RM (${anchor.protocol}${
				anchor.reps == null ? '' : `, from ${anchor.reps} reps`
			})`
		case 'repMax':
			return `${value} ${anchor.reps ?? '?'}RM`
	}
}

function pctText(minPct: number, maxPct: number | undefined): string {
	return maxPct == null
		? `${trim(minPct)} %`
		: `${trim(minPct)}–${trim(maxPct)} %`
}

function bodyweightText(bodyweightKg: number, addedKg: number): string {
	const body = `your ${trim(bodyweightKg)} kg bodyweight`
	if (addedKg === 0) return body
	return addedKg > 0
		? `${body} plus ${trim(addedKg)} kg`
		: `${body} less ${trim(Math.abs(addedKg))} kg of assistance`
}

/** Kilos to one decimal. Making the number *loadable* is the plate calculator's
 * job, and rounding to a plate here would hide which anchor produced it. */
function round(kg: number): number {
	return Math.round(kg * 10) / 10
}

function trim(value: number): string {
	return Number.isInteger(value) ? String(value) : value.toFixed(1)
}
