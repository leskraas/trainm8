// The rules of a track's **Season Anchor** list (ADR 0040 §5, ADR 0122 §1),
// pure, so both writers of it read them from one place: the Sesong edit
// (`season-edit.ts`), which previews a change before it lands, and the direct
// editor under _Avansert_ (`removeSeasonAnchorSegment` in
// `authoring.server.ts`). Two writers that each knew "which segment may go"
// could disagree about it; one function cannot.
//
// The list is ordered dated segments, `(fromWeekKey, value)`, and the two rules
// the storage cannot hold are here:
//
// - **Two segments cannot share a week.** An `add` on a week that already has
//   one is a `set` of that segment, and the result says so (`merged`), so the
//   message can tell the athlete it was edited rather than added.
// - **The earliest segment stays.** Removing it would leave every week before
//   the next one with no anchor in force — an Unavailable Metric across the
//   opening of a season the athlete never asked to un-plan.

export type AnchorSegment = { fromWeekKey: string; value: number }

/** One change to the list. `set` names the segment by its week. */
export type AnchorListEdit =
	| { action: 'add' | 'set'; fromWeekKey: string; value: number }
	| { action: 'remove'; fromWeekKey: string }

export type AnchorListRefusal = 'anchor-not-found' | 'earliest-anchor'

export type AnchorListResult =
	| {
			ok: true
			/** The list after the edit, earliest first. */
			anchors: AnchorSegment[]
			/** What the edit does to the list: an `add` on a held week is a `set`. */
			act: 'add' | 'set' | 'remove'
			/** An `add` that landed on a week that already had a segment. */
			merged: boolean
			/** The segment's value before the edit, or null for a new one. */
			before: number | null
	  }
	| { ok: false; reason: AnchorListRefusal }

/** The list earliest first — week keys sort as dates (`YYYY-MM-DD`). */
export function sortedAnchors<Anchor extends { fromWeekKey: string }>(
	anchors: readonly Anchor[],
): Anchor[] {
	return [...anchors].sort((a, b) =>
		a.fromWeekKey < b.fromWeekKey ? -1 : a.fromWeekKey > b.fromWeekKey ? 1 : 0,
	)
}

/** The segment that opens the season, which can be edited but never removed. */
export function earliestAnchor<Anchor extends { fromWeekKey: string }>(
	anchors: readonly Anchor[],
): Anchor | null {
	return sortedAnchors(anchors)[0] ?? null
}

/** The segment in force at `weekKey`: the latest at or before it. */
export function anchorInForceAt<Anchor extends { fromWeekKey: string }>(
	anchors: readonly Anchor[],
	weekKey: string,
): Anchor | null {
	return (
		sortedAnchors(anchors)
			.filter((anchor) => anchor.fromWeekKey <= weekKey)
			.at(-1) ?? null
	)
}

/** `edit` applied to `anchors`, or why the list refuses it. */
export function editAnchorList(
	anchors: readonly AnchorSegment[],
	edit: AnchorListEdit,
): AnchorListResult {
	const held = anchors.find((anchor) => anchor.fromWeekKey === edit.fromWeekKey)
	if (edit.action === 'remove') {
		if (!held) return { ok: false, reason: 'anchor-not-found' }
		if (earliestAnchor(anchors)?.fromWeekKey === edit.fromWeekKey) {
			return { ok: false, reason: 'earliest-anchor' }
		}
		return {
			ok: true,
			anchors: sortedAnchors(anchors.filter((anchor) => anchor !== held)),
			act: 'remove',
			merged: false,
			before: held.value,
		}
	}
	if (edit.action === 'set' && !held) {
		return { ok: false, reason: 'anchor-not-found' }
	}
	const segment = { fromWeekKey: edit.fromWeekKey, value: edit.value }
	return {
		ok: true,
		anchors: sortedAnchors([
			...anchors.filter((anchor) => anchor !== held),
			segment,
		]),
		act: held ? 'set' : 'add',
		merged: edit.action === 'add' && held != null,
		before: held?.value ?? null,
	}
}
