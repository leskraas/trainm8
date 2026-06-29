// The "vs last time" comparison on the completed Workout Detail View (PRD #129):
// how a finished session stacks up against the last time the athlete did
// something similar (same discipline + Workout intent). Pure derivation over the
// two sessions' truthful actual metrics, kept out of the view so it's testable
// in isolation (mirrors `buildReviewComparison`). Honesty over guessing
// (ADR 0008): with no prior similar session the builder returns null (the caller
// renders an Unavailable state), and a metric missing on either side yields a
// null `change` — never a fabricated delta.

/** One metric's "vs last time" delta. `change` is current − previous, and is
 * null unless both sides are present. */
export type VsLastMetric = {
	current: number | null
	previous: number | null
	change: number | null
}

/** The completed-session-vs-last-similar comparison. Null when there is no prior
 * similar session — the first of its kind isn't faked. */
export type VsLastComparison = {
	previousSessionId: string
	previousDate: Date
	/** Actual session TSS. */
	tss: VsLastMetric
	/** Actual recorded moving time, in seconds. */
	durationSec: VsLastMetric
}

/** The minimal session shape the comparison reads — structural so it's easy to
 * exercise in isolation. `durationSec` is the *actual* recorded moving time
 * (recordings only); both metrics are null when unrecorded. */
export type ComparableSession = {
	tssValue: number | null
	recording: { durationSec: number | null } | null
}

function metric(current: number | null, previous: number | null): VsLastMetric {
	return {
		current,
		previous,
		change: current != null && previous != null ? current - previous : null,
	}
}

export function buildVsLastComparison(
	current: ComparableSession,
	previous: (ComparableSession & { id: string; scheduledAt: Date }) | null,
): VsLastComparison | null {
	if (!previous) return null
	return {
		previousSessionId: previous.id,
		previousDate: previous.scheduledAt,
		tss: metric(current.tssValue, previous.tssValue),
		durationSec: metric(
			current.recording?.durationSec ?? null,
			previous.recording?.durationSec ?? null,
		),
	}
}
