/**
 * The corrections the app has words for (the **Load Recompute Notice**,
 * `recompute-notice.server.ts`). A closed union rather than a bare string: a
 * `kind` with no written copy renders nothing (see the Dashboard presenter), so
 * adding a member here is a commitment to write that copy
 * (`RECOMPUTE_NOTICE_LABELS.copy`).
 *
 * Pure, so the label seam's completeness test can read it.
 */
export const LOAD_RECOMPUTE_KINDS = ['strength-left-the-triad'] as const

export type LoadRecomputeKind = (typeof LOAD_RECOMPUTE_KINDS)[number]

/** Whether a stored `kind` is one the app has words for. */
export function isLoadRecomputeKind(kind: string): kind is LoadRecomputeKind {
	return (LOAD_RECOMPUTE_KINDS as readonly string[]).includes(kind)
}
