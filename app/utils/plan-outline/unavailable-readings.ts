// The cross-track readings a plan carrying a **strength Training Track** cannot state
// truthfully — the **Unavailable Metric** vocabulary of ADR 0047 §5, which replaces
// ADR 0046 §3's stated reason for the first of the three while leaving its correction
// standing.
//
// Pure data and nothing else: three tokens and the union over them, in the shape
// `derive.ts` holds `STRENGTH_WEEK_ROLES` and `quality-mix.ts` holds `QUALITY_ZONES`.
// It lives here rather than in the read boundary that assembles the list because
// naming which readings a strength plan has to decline is a statement about the
// domain, not about a query — and a server module cannot be the home of a value the
// label layer and its leaf test need (ADR 0023: `labels.ts` is a runtime leaf).
//
// **No `is…` predicate beside it**, unlike `STRENGTH_GOALS` and `QUALITY_ZONES`: none
// of the three is ever stored. The read boundary constructs the list from whether the
// Outline has a non-cardio track, so no stored string arrives here to be narrowed, and
// a predicate with no boundary to guard would be a dead export.

/**
 * The three readings, each an **Unavailable Metric** for its **own** reason — which is
 * why they are named separately rather than collapsed into one notice (ADR 0047 §5).
 *
 * The reasons, for the surface to word (the tokens carry none):
 *
 * - `hours-calendar-cost` — ADR 0047 §4 supplied the **Strength Frequency**, so the
 *   old reason ("authors no sessions per week") is **false and retired**. What
 *   remains is the **second multiplicand**: there is no non-sparse per-session
 *   duration source. A constant falls to ADR 0045's stability rule, deriving one from
 *   the prescription needs a tempo constant this repo does not store, and the
 *   athlete's own median recorded strength duration is sparse and watch-biased —
 *   Unavailable for exactly the hand-logging lifter ADR 0041 §3 serves. And the
 *   **consumer does not exist**: Training Availability stores trainable weekdays and
 *   a clock time and no capacity at all, so an hours figure would buy one half of a
 *   comparison whose other half nobody has.
 * - `combined-cross-track-load` — a strength track contributes no TSS at all, so a
 *   cross-track total would be a partial sum reading as the athlete's whole week
 *   (ADR 0046 §2).
 * - `strength-ctl` — **Training Load** is endurance-only by decision: pricing a
 *   lifting session as `hours × assumed intensity` is the conversion ADR 0041
 *   rejected and ADR 0045 closed, so strength reaches neither the daily total nor
 *   the CTL / ATL / TSB triad. Cross-track fatigue interaction is unmodelled and
 *   named as such, never approximated.
 *
 * Deliberately *not* the reason a track's weekly volume reads Unavailable: since ADR
 * 0047 §1 both walks price their weeks, so the only way a track's every week is
 * `null` is that no **Season Anchor** is in force.
 */
export const UNAVAILABLE_READINGS = [
	'hours-calendar-cost',
	'combined-cross-track-load',
	'strength-ctl',
] as const

export type UnavailableReading = (typeof UNAVAILABLE_READINGS)[number]
