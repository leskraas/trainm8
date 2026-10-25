/**
 * The corrections the app has words for (the **Load Recompute Notice**,
 * `recompute-notice.server.ts`). A closed union rather than a bare string: a
 * `kind` with no written copy renders nothing (see the Dashboard presenter), so
 * adding a member here is a commitment to write that copy
 * (`RECOMPUTE_NOTICE_LABELS.copy`).
 *
 * Pure, so the label seam's completeness test can read it.
 */
export const LOAD_RECOMPUTE_KINDS = [
	'strength-left-the-triad',
	'swim-rest-left-the-pace',
] as const

export type LoadRecomputeKind = (typeof LOAD_RECOMPUTE_KINDS)[number]

/** Whether a stored `kind` is one the app has words for. */
export function isLoadRecomputeKind(kind: string): kind is LoadRecomputeKind {
	return (LOAD_RECOMPUTE_KINDS as readonly string[]).includes(kind)
}

/** One day's CTL on either side of a recompute. */
export type CtlMovement = { ctlBefore: number; ctlAfter: number }

/**
 * Below this many CTL points a recompute moved nothing but float noise, so
 * there is no movement to name.
 */
const CTL_NOISE = 0.05

/**
 * The day a recompute moved CTL furthest in the direction the correction moves
 * it, or null when it moved nothing beyond noise that way.
 *
 * The widest gap over the whole history rather than today's value: CTL is a
 * 42-day EWMA, so an athlete whose affected sessions are months old sees no
 * change in today's fitness and a visibly redrawn chart. A correction states
 * its direction (strength leaving the triad only lowers CTL; a swim's rest
 * leaving its pace only raises it, ADR 0107), so a day other changes moved the
 * other way is never reported as this correction's doing.
 */
export function widestCtlMovement(
	before: Map<string, number>,
	after: Map<string, number>,
	direction: 'rise' | 'fall',
): CtlMovement | null {
	const sign = direction === 'rise' ? 1 : -1
	let widest: CtlMovement | null = null
	let widestGap = CTL_NOISE
	for (const [date, ctlBefore] of before) {
		const ctlAfter = after.get(date)
		if (ctlAfter == null) continue
		const gap = sign * (ctlAfter - ctlBefore)
		if (gap < widestGap) continue
		if (widest && gap === widestGap) continue
		widest = { ctlBefore, ctlAfter }
		widestGap = gap
	}
	return widest
}
