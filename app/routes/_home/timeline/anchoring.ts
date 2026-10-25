/**
 * The measurement arithmetic behind I dag's list and its season strip, kept
 * pure so the numbers that were hard to get right are testable without a
 * scroll container, a layout pass or a browser.
 *
 * Every function here takes plain numbers, a minimal `Box` or a set of keys —
 * never a real `Element` — so the hook that owns the DOM
 * (`use-timeline-scroll.ts`) reads as "observe, decide, apply" and the
 * deciding half is covered by unit tests.
 *
 * What is **not** here any more, and why (ADR 0086): the hero's fold, the
 * settle ladder, the load pad and the past band's own compensation. The hero
 * is gone; the landing is one write before first paint plus a
 * `ResizeObserver` that stops at the reader's first input, so it has no timers
 * to tune; every week before today is mounted up front, so nothing grows
 * above the reader and there is no edge to load at; and nothing folds, so
 * nothing opens above the reader either.
 */

/** The one fact these helpers need from a DOM node: where its box starts. */
export type Box = { top: number }

/**
 * Today's row parks this far below the bottom of its week's **sticky header**,
 * so it reads as *arrived at* rather than tucked under the header or flush
 * against it. The header's height is measured, never assumed: it grows with
 * the week's Training Tracks (#505 S9), and a fixed offset that once cleared a
 * one-line header parked today *under* a three-line one.
 */
export const LANDING_GAP = 12

/**
 * The offset used before anything can be measured — jsdom, a week whose
 * header is not in the DOM yet. The live landing is always the measured header
 * plus {@link LANDING_GAP} (`landingOffsetFor`).
 */
export const LANDING_OFFSET = 96

/** How far below the stream's top today parks, given its header's height. */
export function landingOffsetFor(headerHeight: number): number {
	return headerHeight > 0
		? Math.ceil(headerHeight) + LANDING_GAP
		: LANDING_OFFSET
}

/**
 * A week jumped to from the strip parks flush, minus a hair: its sticky header
 * should sit *at* the top, and 2px of slack keeps a sub-pixel measurement from
 * scrolling the header out of its own sticky slot.
 */
export const WEEK_JUMP_OFFSET = 2

/**
 * A week header counts as "the week the stream is parked in" once it has passed
 * this line — a little below the top edge, so the active week flips when the
 * header reaches the reading position rather than the instant it appears.
 */
export const ACTIVE_WEEK_LINE = 70

/** Today's row may sit this far above the top edge before it counts as away. */
export const AWAY_ABOVE = 60

/** …and this close to the bottom edge before it counts as away below. */
export const AWAY_BELOW = 40

/**
 * How many weeks ahead of today are mounted on open, and how many more each
 * time the reader comes within {@link AHEAD_PAD} of the end. Every week
 * *before* today is always mounted (ADR 0086) — every one of its days, since
 * nothing folds, which `content-visibility` makes cheap: mounting the past up
 * front is what removes growth above the reader, and the scroll writes that
 * paid for it, altogether. Growth below needs no compensation: nothing the
 * reader can see moves when a week is appended under them.
 */
export const AHEAD_INITIAL = 6
export const AHEAD_STEP = 6

/** How close to the end of the mounted list the next weeks ahead are mounted. */
export const AHEAD_PAD = 600

/**
 * A node's offset inside its scroller, measured against the **scroller's own
 * box**. `offsetTop` is wrong here and was the original bug: its `offsetParent`
 * is whichever positioned ancestor happens to be nearest, so the number it
 * gives is an offset inside something that is not the thing being scrolled.
 */
export function offsetWithin(
	scroller: Box & { scrollTop: number },
	node: Box,
): number {
	return node.top - scroller.top + scroller.scrollTop
}

/**
 * Where "parked on today" is: today's row, less its week's header and the gap.
 * Never negative — a short history parks the stream at its top.
 */
export function landingPosition(
	todayOffset: number,
	offset: number = LANDING_OFFSET,
): number {
	return Math.max(0, todayOffset - offset)
}

/**
 * Room the landing keeps under today's row when it parks the whole week on
 * screen: today's row whole, and a hair below it, so a week of one-line rows
 * opens with all its days in view (variant P).
 */
export const LANDING_ROOM = 24

/**
 * Where I dag opens (variant P, ADR 0086): **the top of today's week**, header
 * and notes and the days before today, when all of that and today's row fit
 * on screen with {@link LANDING_ROOM} to spare — the week reads as a week, and
 * today is in it. When they do not, today's row under the week's sticky
 * header ({@link landingPosition}), as before. All offsets are content
 * coordinates inside the scroller.
 */
export function landingTop({
	weekOffset,
	todayOffset,
	todayHeight,
	headerHeight,
	clientHeight,
}: {
	weekOffset: number
	todayOffset: number
	todayHeight: number
	/** The week's sticky header. */
	headerHeight: number
	clientHeight: number
}): number {
	const fits =
		clientHeight > 0 &&
		todayOffset + todayHeight - weekOffset <= clientHeight - LANDING_ROOM
	return fits
		? Math.max(0, weekOffset)
		: landingPosition(todayOffset, landingOffsetFor(headerHeight))
}

/**
 * A week block's height at a phone's width, estimated from what it holds — the
 * `contain-intrinsic-size` its `content-visibility: auto` box keeps until the
 * browser has laid it out once (and `auto` remembers the real one after).
 *
 * Measured at 390px, Public Sans, on the built app (ADR 0086): what an empty
 * day, a one-line session, a wrapping one and a header line come to. Close is
 * what matters, not exact: the estimate keeps the scrollbar and a strip jump's
 * first landing honest, and the browser's scroll anchoring absorbs the
 * difference when a week above the reader is laid out for real.
 */
export const WEEK_HEIGHTS = {
	/** The header's padding and its title line. */
	header: 36,
	/** One Training Track's line, or the load line of a week with none. */
	track: 20,
	/** The week's one sentence. */
	summary: 20,
	/** One line of notes under the header (11px over 15). */
	note: 15,
	/** The planStart line and the horizon divider. */
	banner: 44,
	/** A day with nothing on it: the gutter's two lines and its hairline. */
	emptyDay: 46,
	/** A day's first session on one line: the gutter sets the floor. */
	session: 46,
	/** Each further session under the same date. */
	extraSession: 44,
	/** Each further line a long sentence wraps onto. */
	wrap: 21,
	/** A session's action line (`Se økta`, _Gjort_). */
	actions: 44,
	/** "legg til en til" under a day's sessions, from today on (ADR 0088). */
	addAnother: 28,
	/** Roughly how many characters a session's sentence sets on one line. */
	charsPerLine: 30,
	/**
	 * The credit line under a title built on Garmin (or Polar) data (#557):
	 * 12/16 caption. Less than its leading under a first session, whose
	 * floor the gutter's two lines already set.
	 */
	credit: 12,
	/** Each further line a long credit wraps onto. */
	creditWrap: 16,
	/** Roughly how many characters the credit's caption sets on one line. */
	creditCharsPerLine: 38,
} as const

/** The model a week's height is estimated from: only what changes it. */
export type WeekHeightInput = {
	tracks: ReadonlyArray<{ hasFigures?: boolean; noteCount?: number }>
	summary: string | null
	planStart: boolean
	opensHorizon: boolean
	rows: ReadonlyArray<{
		sessions: ReadonlyArray<{
			title: string
			markDone?: unknown
			sourceCredit?: string | null
		}>
		/** The day ends in "legg til en til". */
		addAnother?: boolean
	}>
}

export function weekHeightEstimate(week: WeekHeightInput): number {
	const h = WEEK_HEIGHTS
	const shownTracks = week.tracks.filter((t) => t.hasFigures !== false)
	let total =
		h.header +
		h.track * Math.max(1, shownTracks.length) +
		(week.summary ? h.summary : 0) +
		h.note * shownTracks.reduce((n, t) => n + (t.noteCount ?? 0), 0) +
		(week.planStart ? h.banner : 0) +
		(week.opensHorizon ? h.banner : 0)
	for (const day of week.rows) {
		if (day.sessions.length === 0) {
			total += h.emptyDay
			continue
		}
		day.sessions.forEach((session, index) => {
			const lines = Math.max(
				1,
				Math.ceil(session.title.length / h.charsPerLine),
			)
			const creditLines = session.sourceCredit
				? Math.ceil(session.sourceCredit.length / h.creditCharsPerLine)
				: 0
			total +=
				(index === 0 ? h.session : h.extraSession) +
				(lines - 1) * h.wrap +
				(creditLines > 0 ? h.credit + (creditLines - 1) * h.creditWrap : 0) +
				(session.markDone ? h.actions : 0)
		})
		if (day.addAnother) total += h.addAnother
	}
	return Math.round(total)
}

/** The next count of weeks ahead to mount, capped at what the season has. */
export function nextAhead(after: number, maxAfter: number): number {
	return Math.min(maxAfter, after + AHEAD_STEP)
}

/**
 * The `rootMargin` that shrinks a scroller to a one-pixel line at
 * {@link ACTIVE_WEEK_LINE}: an `IntersectionObserver` with it reports exactly
 * the week whose block crosses the reading line, and reports it only when that
 * changes — the measurement `querySelectorAll` plus a rect per week used to
 * make on every scroll event (#505 P3).
 */
export function activeLineMargin(clientHeight: number): string {
	const below = Math.max(0, Math.round(clientHeight) - ACTIVE_WEEK_LINE - 1)
	return `-${ACTIVE_WEEK_LINE}px 0px -${below}px 0px`
}

/** The `rootMargin` today's row is "in view" inside: a little slack each way. */
export const AWAY_MARGIN = `${AWAY_ABOVE}px 0px -${AWAY_BELOW}px 0px`

/** Where today is from the reader: −1 above, 0 in view, +1 below. */
export type AwayFromToday = -1 | 0 | 1

/**
 * Today's row, read off one `IntersectionObserver` entry: in view, or off the
 * top or the bottom of the (margined) root.
 */
export function awayFromEntry(entry: {
	isIntersecting: boolean
	boundingClientRect: Box
	rootBounds: Box | null
}): AwayFromToday {
	if (entry.isIntersecting) return 0
	const rootTop = entry.rootBounds?.top ?? 0
	return entry.boundingClientRect.top < rootTop ? -1 : 1
}

/**
 * Where today is from the reader, from everything the observers know. Today's
 * own row observer only reports when the row crosses the list's edge, so a
 * single long jump — from below today to far above it — never crosses and
 * never reports: the direction is then read off the weeks on screen, which do
 * report. Inside today's own week the row's last report says which side.
 */
export function awayOf({
	inView,
	lastReport,
	frame,
	order,
	todayKey,
}: {
	/** Today's row is on screen (its observer's last word). */
	inView: boolean
	/** The direction its observer last reported. */
	lastReport: AwayFromToday
	frame: { from: string; to: string } | null
	order: readonly string[]
	todayKey: string
}): AwayFromToday {
	if (inView) return 0
	const today = order.indexOf(todayKey)
	if (frame && today >= 0) {
		if (order.indexOf(frame.from) > today) return -1
		if (order.indexOf(frame.to) < today) return 1
	}
	return lastReport
}

/**
 * The week the reader is parked in, from the weeks the reading line crosses:
 * the last of them in season order (two only ever cross it for the instant one
 * header hands over to the next), or the fallback when none does — the line is
 * over the start cap, say.
 */
export function activeWeekOf(
	crossing: ReadonlySet<string>,
	order: readonly string[],
	fallback: string,
): string {
	let active: string | null = null
	for (const key of order) if (crossing.has(key)) active = key
	return active ?? fallback
}

/**
 * The first and last week the reader can see — the season strip's frame
 * (#505 story 17) — from the set of weeks intersecting the scroller, in season
 * order. Null when nothing is visible, and the caller keeps the frame it had.
 */
export function frameOf(
	visible: ReadonlySet<string>,
	order: readonly string[],
): { from: string; to: string } | null {
	let from: string | null = null
	let to: string | null = null
	for (const key of order) {
		if (!visible.has(key)) continue
		from ??= key
		to = key
	}
	return from && to ? { from, to } : null
}

/**
 * The reading position after the **loader revalidated** and put height above
 * the reader — a session written on a day they have already scrolled past.
 * `before` is the reader's week's offset and the scroll position, read in the
 * snapshot just before the new data commits; `nowAt` is that week's offset
 * after it.
 *
 * The delta belongs to the marked week, never to total `scrollHeight`: height
 * appended *below* grows the scroll height too, and is not the reader's
 * concern. Nothing moved above the mark → null, and nothing is written.
 */
export function compensatedScrollTop(
	before: { offset: number; scrollTop: number },
	nowAt: number,
): number | null {
	const delta = nowAt - before.offset
	if (delta === 0) return null
	return before.scrollTop + delta
}

/**
 * The landing script the server renders right after the stream (ADR 0086):
 * {@link landingTop}, written out in plain ES5 and run by the browser as it
 * parses, so the first paint is already parked on today rather than on the
 * top of the season. Hydration then measures the same position and writes
 * nothing.
 *
 * It sets the frame's measured height before it measures anything, exactly as
 * the frame does once hydrated, so the two land on the same pixel.
 *
 * Written out rather than built from the functions' source, because a bundler
 * may rename what a function's body refers to; `anchoring.test.ts` runs this
 * against a fake layout and holds it to `landingTop` instead.
 */
export function landingScript(streamId: string): string {
	return [
		'(function(){',
		`var s=document.getElementById(${JSON.stringify(streamId)});if(!s)return;`,
		// The frame's height first, as `home-timeline.tsx` measures it once it
		// hydrates (the viewport less the chrome above it and the tab bar): with
		// the server's `100dvh` alone the list is taller than it will be, and a
		// landing that asks whether the week fits would answer for the wrong box.
		"var m=s.closest('main');if(m){var c=Math.round(m.getBoundingClientRect().top+window.scrollY);m.style.height='calc(100dvh - '+c+'px - var(--tab-bar-space))';}",
		"var t=s.querySelector('[data-timeline-today]');if(!t)return;",
		"var w=t.closest('[data-timeline-week]');if(!w)return;",
		"var h=w.querySelector('[data-week-header]');",
		'var base=s.getBoundingClientRect().top-s.scrollTop;',
		'var r=t.getBoundingClientRect();',
		'var week=w.getBoundingClientRect().top-base,today=r.top-base;',
		'var hh=h?h.getBoundingClientRect().height:0;',
		`var fits=s.clientHeight>0&&today+r.height-week<=s.clientHeight-${LANDING_ROOM};`,
		`var off=hh>0?Math.ceil(hh)+${LANDING_GAP}:${LANDING_OFFSET};`,
		// Instant: the list's `scroll-behavior: smooth` would animate the write.
		"var b=s.style.scrollBehavior;s.style.scrollBehavior='auto';",
		's.scrollTop=Math.round(fits?Math.max(0,week):Math.max(0,today-off));',
		's.style.scrollBehavior=b;',
		'})();',
	].join('')
}
