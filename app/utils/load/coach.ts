/**
 * Reconcile the two honest signals on the Coach card — Form (TSB) readiness and
 * sustained Plan Adherence — into a single recommendation (#120, ADR 0019).
 *
 * The product thesis lives here: two true numbers that could each shout a
 * different instruction must speak as *one* coach, never two competing lines.
 * Pure and page-agnostic, mirroring `readinessFromTsb` / `adherenceBand`: the
 * card composes the display, this module decides what the coach says.
 */

import { type WeeklyAdherence } from './adherence.ts'
import { type Readiness } from './readiness.ts'

/**
 * How many trailing weeks of the same off-target deviation make it "sustained"
 * — enough to shift the Coach card's narrative away from pure Form. Two weeks
 * is a trend; one is noise. Placeholder like the band cut points: tunable.
 */
export const SUSTAINED_WEEKS = 2

export type SustainedDeviation = {
	/** The direction held across the streak — only off-target tones qualify. */
	tone: 'under' | 'over'
	/** Length of the streak (>= SUSTAINED_WEEKS), most-recent weeks backward. */
	weeks: number
}

/**
 * Detect a sustained Plan Adherence deviation across a chronological run of
 * weekly rollups (oldest first, current week last). Walking back from the most
 * recent week, count consecutive weeks sharing one off-target tone (`under` or
 * `over`); a streak of at least `SUSTAINED_WEEKS` is "sustained".
 *
 * The most recent week must itself be off-target — a fresh on-target week clears
 * the narrative. An on-target week, the opposite deviation, or a week with no
 * resolvable adherence (`null`, the "—" case from #119) all break the streak:
 * we only escalate on a deviation we can actually see hold.
 */
export function sustainedAdherence(
	weeks: Array<WeeklyAdherence | null>,
): SustainedDeviation | null {
	const mostRecent = weeks[weeks.length - 1]
	if (!mostRecent) return null
	const tone = mostRecent.band.tone
	if (tone !== 'under' && tone !== 'over') return null

	let streak = 0
	for (let i = weeks.length - 1; i >= 0; i--) {
		if (weeks[i]?.band.tone !== tone) break
		streak += 1
	}
	if (streak < SUSTAINED_WEEKS) return null
	return { tone, weeks: streak }
}

export type CoachTone = Readiness['tone'] | SustainedDeviation['tone']

export type CoachRecommendation = {
	/** One-word headline state, e.g. "Fresh" / "Drifting" / "Overreaching". */
	label: string
	/** The single reconciled recommendation sentence. */
	recommendation: string
	/** Severity band for styling/iconography. */
	tone: CoachTone
	/** Which signal led the reconciliation — for transparency and testing. */
	source: 'form' | 'adherence'
}

/**
 * Reconcile Form readiness and sustained adherence into one recommendation,
 * **safety-first** (#120): bodily-risk signals lead, the slow "drifting" nudge
 * yields to today's acute reading. Priority, highest first:
 *
 *   1. Sustained **over** — overreaching; Form is diving. The riskiest pattern,
 *      so it takes the headline regardless of today's TSB.
 *   2. **Fatigued** Form — an acute "rest today" that outranks the slow drift.
 *   3. Sustained **under** — fitness drifting from the goal; surfaced even over a
 *      fresh TSB, which alone would just say "go hard".
 *   4. Otherwise the plain Form readiness (fresh / neutral).
 *
 * `readiness` is `null` during cold-start (untrustworthy TSB, ADR 0008/0010);
 * adherence is independent of TSB trust, so a sustained deviation still speaks.
 * With neither a readiness nor a sustained deviation there is nothing to say
 * (`null`) — the card falls back to its "building baseline" state.
 */
export function reconcileCoach(
	readiness: Readiness | null,
	sustained: SustainedDeviation | null,
): CoachRecommendation | null {
	if (sustained?.tone === 'over') {
		return {
			label: 'Overreaching',
			recommendation: `Over your plan ${sustained.weeks} weeks running — Form is diving. Ease back before it costs you.`,
			tone: 'over',
			source: 'adherence',
		}
	}
	if (readiness?.tone === 'fatigued') {
		return { ...readiness, tone: 'fatigued', source: 'form' }
	}
	if (sustained?.tone === 'under') {
		return {
			label: 'Drifting',
			recommendation: `Under your plan ${sustained.weeks} weeks running — fitness is drifting from your goal. Bank the planned work.`,
			tone: 'under',
			source: 'adherence',
		}
	}
	if (readiness) {
		return { ...readiness, source: 'form' }
	}
	return null
}
