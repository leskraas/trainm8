/**
 * The **community tier**'s vocabulary and its pure reads (ADR 0052).
 *
 * The tier is what `Workout.visibility = 'public'` makes reachable: an athlete
 * publishes a session, it reads as `community` to everyone but its author
 * (`catalogueTier`), and it carries an **Attribution** and an explicit non-vouch
 * where a **Stock Workout** carries a **Citation**.
 *
 * Nothing here touches the database — the server half is `community.server.ts`.
 * "Library" is banned vocabulary: the word is **Catalogue**.
 */

/**
 * The visibility axis's vocabulary (ADR 0037, ADR 0052). Pinned by a CHECK in
 * `20260809090000_add_community_tier`, which is the migration that gave it a
 * second value; while it had one and nothing read it, an unconstrained string was
 * harmless.
 *
 * There is no `shared` or `invited` here. ADR 0037 left room for them and #452
 * builds neither: a follower- or invite-scoped read needs a social graph, which is
 * the half of `GOAL.md`'s identity boundary that did **not** move.
 */
export const WORKOUT_VISIBILITIES = ['private', 'public'] as const
export type WorkoutVisibility = (typeof WORKOUT_VISIBILITIES)[number]

export function isWorkoutVisibility(value: string): value is WorkoutVisibility {
	return (WORKOUT_VISIBILITIES as readonly string[]).includes(value)
}

/**
 * **The non-vouch.** trainm8's standing statement about every community row,
 * held in code rather than in a column.
 *
 * It is not data about the row: it is a fact about trainm8's relationship to the
 * row, identical for all of them. Stored per-row it could be edited, absent, or
 * disagree with the row beside it — and the one thing this sentence may not do is
 * vary. It sits wherever an **Attribution** is rendered, which is the slot a
 * **Citation** occupies on a **Stock Workout**: same position, deliberately
 * different words, so a reader can never mistake one for the other.
 */
export const COMMUNITY_NON_VOUCH =
	'Published by an athlete. trainm8 has not reviewed or endorsed this session.'

/**
 * Why an athlete is reporting a **Shared Workout**. A closed vocabulary because
 * the queue is triaged by it; the free text is `detail`.
 *
 * `miscited` is the one that is specific to this app rather than to moderation in
 * general. A **Citation** is structurally impossible on a community row, so an
 * athlete cannot type "Daniels 2013" into the citation slot — but nothing stops
 * them typing it into a title or description, and that is the same lie arriving
 * through prose.
 */
export const REPORT_REASONS = [
	'unsafe',
	'miscited',
	'spam',
	'abusive',
	'other',
] as const
export type ReportReason = (typeof REPORT_REASONS)[number]

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
	unsafe: 'Unsafe to train',
	miscited: 'Claims a source it does not have',
	spam: 'Spam, or not a training session',
	abusive: 'Abusive or offensive',
	other: 'Something else',
}

export const REPORT_REASON_HINTS: Record<ReportReason, string> = {
	unsafe: 'The prescription would hurt somebody who followed it.',
	miscited: 'It names a coach, book or study it did not come from.',
	spam: 'Advertising, or a session that is not one.',
	abusive: 'The title, description or notes are abusive.',
	other: 'Tell us what is wrong — this one needs a description.',
}

export function isReportReason(value: string): value is ReportReason {
	return (REPORT_REASONS as readonly string[]).includes(value)
}

/** How a moderator closed a report. */
export const REPORT_RESOLUTIONS = ['taken-down', 'dismissed'] as const
export type ReportResolution = (typeof REPORT_RESOLUTIONS)[number]

/**
 * An **Attribution** as a reader sees it — the publishing athlete's public
 * identity and when they published.
 *
 * Deliberately *not* shaped like a {@link import('./catalogue.ts').Citation}: no
 * work, no year, no locator. The asymmetry is the point, and a reader who has to
 * compare fields to tell the two apart has already been misled.
 */
export type Attribution = {
	displayName: string
	publishedAt: Date
}

export function readAttribution(
	row: { displayName: string; publishedAt: Date } | null | undefined,
): Attribution | null {
	if (row == null) return null
	return { displayName: row.displayName, publishedAt: row.publishedAt }
}

/** `Published by Jo Kraas` — the byline half; the non-vouch is rendered beside it. */
export function formatAttribution(attribution: Attribution): string {
	return `Published by ${attribution.displayName}`
}

/**
 * The publish state of one Workout, as the publish screen and the Catalogue read
 * it. Four states rather than a boolean, because "never published", "published",
 * "the author took it down" and "a moderator took it down" owe the athlete four
 * different sentences — and only the last one is permanent.
 */
export type PublishState =
	| { kind: 'unpublished' }
	| { kind: 'published'; attribution: Attribution }
	| { kind: 'withdrawn'; attribution: Attribution }
	| { kind: 'taken-down'; attribution: Attribution; reason: string; at: Date }

export function readPublishState(
	workout: { visibility: string },
	attribution:
		| {
				displayName: string
				publishedAt: Date
				takenDownAt: Date | null
				takedownReason: string | null
		  }
		| null
		| undefined,
): PublishState {
	if (attribution == null) return { kind: 'unpublished' }
	const read = {
		displayName: attribution.displayName,
		publishedAt: attribution.publishedAt,
	}
	if (attribution.takenDownAt != null && attribution.takedownReason != null) {
		return {
			kind: 'taken-down',
			attribution: read,
			reason: attribution.takedownReason,
			at: attribution.takenDownAt,
		}
	}
	if (workout.visibility === 'public') {
		return { kind: 'published', attribution: read }
	}
	return { kind: 'withdrawn', attribution: read }
}

/** Can this Workout be published, and if not, why not — in words the author reads. */
export function publishBlockedReason(state: PublishState): string | null {
	if (state.kind === 'taken-down') {
		return 'A moderator removed this session from the Catalogue. It cannot be published again.'
	}
	return null
}
