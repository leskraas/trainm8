// The **Quality Session Mix**: the second authored axis of an endurance Training
// Track segment, and the two readings taken off it — the **Quality Session
// Count** and the terms of the **Intensity Emphasis** label (ADR 0042 §3–§6).
//
// One documented constant (`QUALITY_ZONES`) and pure functions over a stored
// mix. Three properties this module exists to hold:
//
// - **Nothing here is authored.** The count is the sum of the mix (ADR 0042 §4)
//   and the label is read off the mix (§5), so no segment can be named for work
//   it does not contain, and neither value is ever stored.
// - **An empty mix is a positive statement.** `{}` means "no quality sessions in
//   this segment" — it is not "unknown" and never yields `null` (ADR 0042 §6).
//   That is why the prototype's `recovery` focus needed no successor word.
// - **Zones 3–5 only, and neuromuscular work has no position on the axis.** The
//   zone scale orders *metabolic* strain; strides and hill sprints are high
//   mechanical intensity at low metabolic strain, so `speed` was dropped rather
//   than mapped (ADR 0042 §7). Admitting zone 1–2 would change what the count
//   means without anything changing in the training (§3).
//
// The **days-against-days fit check** used to live here too, as a per-phase
// reading of the mix alone. It is `availability-fit.ts`'s now and per *week* over
// every track at once (ADR 0047 §4), which is the only scope that can see a
// strength segment opening inside a phase — so nothing was left here to read a
// mix against availability.

/** The zones a quality session may sit in. Zones 3–5 only (ADR 0042 §3). */
export const QUALITY_ZONES = [3, 4, 5] as const
export type QualityZone = (typeof QUALITY_ZONES)[number]

/** One zone's dose in a Quality Session Mix. */
export type QualitySessionMixEntry = {
	zone: QualityZone
	sessionsPerWeek: number
}

/**
 * Narrows a stored `zone` integer to the offerable set.
 *
 * The zone column is a plain `Int` and the 3–5 rule is a CHECK in the migration,
 * so a row read back is a `number` until something asserts otherwise. This is
 * that something — and it is also the reason zone 1, 2 and any sprint-shaped
 * "zone 6" are refused here rather than filtered downstream (ADR 0042 §3, §7).
 */
export function isQualityZone(zone: number): zone is QualityZone {
	return QUALITY_ZONES.some((candidate) => candidate === zone)
}

/**
 * Derived: the sum of the mix (ADR 0042 §4). An empty mix is 0, never null.
 *
 * The axis Tønnessen 2020 showed to be decisive at matched volume and matched
 * zone-3 time — 2 vs 4 interval sessions produced opposite outcomes — which is
 * why it is a reading of its own and not left implicit in the mix.
 *
 * A dose of zero contributes nothing and so cannot disagree with
 * {@link emphasisTerms}, which drops it as a term.
 */
export function qualitySessionCount(
	mix: readonly QualitySessionMixEntry[],
): number {
	return mix.reduce((total, entry) => total + entry.sessionsPerWeek, 0)
}

/** One term of the emphasis label: dose and kind, no wording (ADR 0023 formats it). */
export type EmphasisTerm = { zone: QualityZone; sessionsPerWeek: number }

/**
 * Derived: the terms of the segment's emphasis label, ascending by zone, so
 * `{ z5: 1, z4: 2 }` reads "2× threshold + 1× VO₂ max". Entries whose dose is
 * zero or less are dropped. An empty mix returns `[]`, which is the positive
 * statement that the segment has no quality sessions (ADR 0042 §6).
 *
 * Ascending rather than dominant-first: the ordering has to be a property of the
 * zones, not of the doses, or two segments with the same kinds of work would
 * list them in different orders and read as different vocabularies.
 */
export function emphasisTerms(
	mix: readonly QualitySessionMixEntry[],
): EmphasisTerm[] {
	return mix
		.filter((entry) => entry.sessionsPerWeek > 0)
		.map((entry) => ({
			zone: entry.zone,
			sessionsPerWeek: entry.sessionsPerWeek,
		}))
		.sort((a, b) => a.zone - b.zone)
}
