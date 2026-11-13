/**
 * The corrections the app has words for (the **Load Recompute Notice**,
 * `recompute-notice.server.ts`), each declaring what its correction moved
 * (ADR 0117 §3):
 *
 * - `'load'`: it moved a **Load Snapshot**, so the notice may name a CTL
 *   movement, or carry none when the movement was no more than noise.
 * - `'prescription'`: it moved what a session prescribes (displayed bands,
 *   **Planned TSS**, **Adherence Bands**) and never a Load Snapshot, so the
 *   notice carries no CTL pair at all.
 *
 * Keyed by kind like its copy in `RECOMPUTE_NOTICE_LABELS.copy`, which is
 * `satisfies Record<LoadRecomputeKind, …>`: adding a kind here is a commitment
 * to write its words there (ADR 0081: the labels own words, this table owns the
 * domain fact). A stored `kind` with no entry renders nothing (see the
 * Dashboard presenter).
 *
 * Pure, so the label seam's completeness test can read it.
 */
export const LOAD_RECOMPUTE_KIND_DECLARATIONS = {
	'strength-left-the-triad': { moved: 'load' },
	'swim-rest-left-the-pace': { moved: 'load' },
} as const satisfies Record<string, { moved: LoadRecomputeMoved }>

/** What a correction moved: a Load Snapshot, or a session's prescription. */
export type LoadRecomputeMoved = 'load' | 'prescription'

export type LoadRecomputeKind = keyof typeof LOAD_RECOMPUTE_KIND_DECLARATIONS

export const LOAD_RECOMPUTE_KINDS = Object.keys(
	LOAD_RECOMPUTE_KIND_DECLARATIONS,
) as readonly LoadRecomputeKind[]

/** Whether a stored `kind` is one the app has words for. */
export function isLoadRecomputeKind(kind: string): kind is LoadRecomputeKind {
	return Object.hasOwn(LOAD_RECOMPUTE_KIND_DECLARATIONS, kind)
}

/** One day's CTL on either side of a recompute. */
export type CtlMovement = { ctlBefore: number; ctlAfter: number }

/**
 * The CTL pair a correction that moved `M` may record. A load correction names
 * its movement, or `null` when it moved CTL by no more than noise; a
 * prescription correction moved no Load Snapshot, so it records `null` and
 * nothing else (ADR 0117 §3). Written over `LoadRecomputeMoved` itself, not
 * over the kinds, so the type is pinned even before a prescription kind exists.
 * Not distributive: a kind that could be either takes only `null`.
 *
 * `null` is **no CTL movement to name**, not an **Unavailable Metric**: CTL is
 * calculable, it simply did not move (ADR 0117 §2).
 */
export type CtlFor<M extends LoadRecomputeMoved> = [M] extends ['load']
	? CtlMovement | null
	: null

/** The CTL pair a given kind may record, read off its declaration. */
export type CtlForKind<K extends LoadRecomputeKind> = CtlFor<
	(typeof LOAD_RECOMPUTE_KIND_DECLARATIONS)[K]['moved']
>

/**
 * A notice as the app reads it: its kind and its CTL movement as one value,
 * never two independently nullable numbers (the database's CHECK keeps the two
 * columns both-or-neither, ADR 0117 §1).
 */
export type LoadRecomputeNoticeRecord = {
	kind: string
	/**
	 * The athlete's CTL on either side of the recompute, taken from the day the
	 * correction moved it *most*, not from today: a lifter whose gym block ended
	 * months ago has an unchanged current CTL and a visibly rewritten history
	 * chart, and it is the chart that needs explaining. `null` when there is no
	 * CTL movement to name.
	 */
	ctl: CtlMovement | null
}

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
