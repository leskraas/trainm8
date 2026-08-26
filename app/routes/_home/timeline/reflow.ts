/**
 * The two accordions' measurement (#502).
 *
 * The home timeline declares exactly four animations in CSS, and two of them
 * animate `height`: the empty cell opening into the editor, and the past band opening
 * into the run of days it stands for. Both genuinely reflow their neighbours —
 * the rows below really do move — and no transform does that, which is the case
 * the "transform and opacity only" rule carves out.
 *
 * The curve, the duration and the properties are the stylesheet's (`reflow` in
 * `tailwind.css`). What is here is the one thing CSS cannot supply: *the number
 * to grow to*. `height: auto` is not an interpolable value, so a box that wants
 * to grow into its content has to be told, in pixels, how tall its content is —
 * and only a measurement knows that.
 *
 * Written to the node rather than through React state on purpose. The growth is
 * three style writes on one element in one frame; routing them through a render
 * would buy nothing and would put a `setState` on a timer in the middle of a
 * component the stream mounts hundreds of.
 *
 * **Opening only, and deliberately.** Both accordions close instantly. The
 * jarring change is the arrival — seven rows at once, or a 44px cell becoming an
 * editor — and closing returns the reader to a shape they already had *and just
 * asked for*. Animating it out would mean holding the run's seven rows mounted
 * for 200ms after they are gone from the model, which is a real cost (a stale
 * subtree in the accessibility tree, and a `setState` on a timer) for the
 * quieter half of the gesture. The **Back-to-Today Pill** is the case where the
 * departure does earn it, and it pays for it by never unmounting at all — it is
 * one small element rather than a week of rows.
 */

/** Both accordions, at the duration the stylesheet gives them. */
export const REFLOW_MS = 200

/**
 * Grow `node` from `fromPx` into whatever height its content wants, then hand
 * the height back to layout.
 *
 * Handing it back matters: the draft grows again when the athlete picks a
 * discipline that cannot be stamped, and a box left pinned to the pixel it was
 * measured at would clip the sentence that explains why. So the inline height
 * is temporary — it exists for the length of the transition and no longer.
 *
 * Returns the disposer, so a React effect can cancel a growth the athlete
 * closed before it finished.
 */
export function growIn(node: HTMLElement, fromPx = 0): () => void {
	const to = node.scrollHeight
	// Nothing has laid out — the server render, and jsdom, which has no layout
	// at all. `heroFold` answers the same measurement the same way (#498): write
	// nothing rather than animate to zero, because an unmeasured box is an open
	// one.
	if (to <= fromPx) return () => {}

	// The closed box first, forced through a layout so the browser has a value
	// to transition *from*, then the open one. Both writes land inside one task,
	// so the fully-grown frame is never painted.
	node.style.overflow = 'hidden'
	node.style.height = `${fromPx}px`
	node.style.opacity = '0'
	void node.offsetHeight
	node.style.height = `${to}px`
	node.style.opacity = '1'

	let timer: ReturnType<typeof setTimeout> | null = null
	const settle = () => {
		node.style.overflow = ''
		node.style.height = ''
		node.style.opacity = ''
		node.removeEventListener('transitionend', onEnd)
		if (timer != null) clearTimeout(timer)
		timer = null
	}
	// The height is the last property to finish, and the only one worth waiting
	// for — but `transitionend` does not fire at all if the transition never
	// started (a stylesheet that has not arrived, a duration overridden to
	// zero), so the timer is the guarantee and the event is the shortcut.
	const onEnd = (event: TransitionEvent) => {
		if (event.target === node && event.propertyName === 'height') settle()
	}
	node.addEventListener('transitionend', onEnd)
	timer = setTimeout(settle, REFLOW_MS + 50)
	return settle
}
