/**
 * **Motion that explains** (spec #558 S10, #582): the shared-element morphs
 * between the start's screens and I dag, on the View Transitions API.
 *
 * Three hand-offs, each one surface becoming the next:
 *
 * - _Uka di_ (the Week Sketch) becomes the top Start Option card
 *   ({@link MORPH.week}, `/start/okter` → `/start/valg`);
 * - the chosen card becomes the plan's curve ({@link MORPH.plan},
 *   `/start/valg` → `/start/klar`);
 * - the curve becomes this week on I dag ({@link MORPH.plan} again,
 *   `/start/klar` → `/`).
 *
 * React Router starts the transition (`viewTransition` on the link or form)
 * and reverses it on back navigation; where the browser has no View
 * Transitions the page changes at once, which is the instant fallback.
 * The stylesheet (`tailwind.css`, "Motion that explains") decides the
 * crossfades and the reduced-motion answer. This module does the one thing
 * CSS cannot: the browser's own morph animates the group's `width` and
 * `height`, and #558 allows only `transform`, `opacity` and `clip-path`. So
 * when a transition is ready, each named group's animation is replaced by a
 * container transform — the new box travels from the old one's place
 * (`transform`) while its visible part opens from the old size to its own
 * (`clip-path`), 280ms on `--ease-in-out`. The old snapshot keeps its own
 * size and fades out underneath, faster than the new one arrives.
 *
 * And it keeps motion out of the way: a tap during a transition lands it at
 * once (`skipTransition`), a navigation started from the keyboard never
 * animates, and a back swipe the browser already animated (iOS Safari's edge
 * swipe, `hasUAVisualTransition`) is not animated a second time.
 */

import { EASE_IN_OUT, prefersReducedMotion } from './motion.ts'

/** The `view-transition-name`s, one per hand-off. */
export const MORPH = {
	/** _Uka di_ → the top Start Option card. */
	week: 'start-week',
	/** The chosen card → the plan's curve → this week on I dag. */
	plan: 'start-plan',
} as const

export type MorphName = (typeof MORPH)[keyof typeof MORPH]

/** Location state that names the morph a navigation arrives by. */
export type MorphState = { morph?: MorphName }

/** Something on screen travelling to its new place (spec #558). */
export const MORPH_MS = 280

/**
 * How far the clip stands outside the box at its edges, so the card's shadow
 * is never cut while it travels and does not pop in at the end.
 */
const SHADOW_ROOM = 16

/** Read a location's state as the morph it names, if any. */
export function morphOf(state: unknown): MorphName | null {
	if (!state || typeof state !== 'object') return null
	const morph = (state as MorphState).morph
	return morph === MORPH.week || morph === MORPH.plan ? morph : null
}

let installed = false

/**
 * Hook every View Transition this document starts. Called once, on the
 * client, before hydration. Does nothing without the API.
 */
export function installViewMorphs(win: Window = window): void {
	const doc = win.document
	if (installed || typeof doc.startViewTransition !== 'function') return
	installed = true

	// Which input came last: a navigation the keyboard asked for lands at once
	// (keyboard actions never animate).
	let keyed = false
	// The browser already animated this back navigation (an edge swipe).
	let uaAnimated = false
	win.addEventListener(
		'keydown',
		(event) => {
			if (event.key === 'Enter' || event.key === ' ') keyed = true
		},
		{ capture: true },
	)
	win.addEventListener('pointerdown', () => (keyed = false), { capture: true })
	win.addEventListener('popstate', (event) => {
		uaAnimated =
			(event as PopStateEvent & { hasUAVisualTransition?: boolean })
				.hasUAVisualTransition === true
	})

	const start = doc.startViewTransition.bind(doc)
	doc.startViewTransition = ((
		update?: Parameters<Document['startViewTransition']>[0],
	) => {
		const transition = start(update)
		if (keyed || uaAnimated) {
			uaAnimated = false
			transition.skipTransition()
			return transition
		}
		// A tap while it runs lands it: the athlete is already somewhere else.
		const skip = () => transition.skipTransition()
		win.addEventListener('pointerdown', skip, { capture: true })
		transition.finished
			.catch(() => {})
			.finally(() =>
				win.removeEventListener('pointerdown', skip, { capture: true }),
			)
		transition.ready
			.then(() => containerTransforms(win))
			// A skipped transition rejects `ready`; there is nothing to do then.
			.catch(() => {})
		return transition
	}) as Document['startViewTransition']
}

/**
 * Replace each named group's size animation with a container transform.
 * Under reduced motion the stylesheet has already stopped the groups (a
 * crossfade in place), so there is nothing to replace.
 */
function containerTransforms(win: Window): void {
	if (prefersReducedMotion(win)) return
	const root = win.document.documentElement
	// Every named surface is a `rounded-4xl` card: 2rem.
	const radius = 2 * (parseFloat(win.getComputedStyle(root).fontSize) || 16)
	for (const name of Object.values(MORPH)) {
		const pseudo = `::view-transition-group(${name})`
		const browser = root
			.getAnimations({ subtree: true })
			.find(
				(animation) =>
					animation.effect instanceof KeyframeEffect &&
					animation.effect.pseudoElement === pseudo,
			)
		// A surface on only one side (nothing to morph from) has no group
		// animation: it fades with the page.
		if (!browser || !(browser.effect instanceof KeyframeEffect)) continue
		const from = browser.effect.getKeyframes()[0]
		const fromWidth = parseFloat(String(from?.width ?? ''))
		const fromHeight = parseFloat(String(from?.height ?? ''))
		if (!from?.transform || !Number.isFinite(fromWidth + fromHeight)) continue
		// Cancelled first: while the browser's animation runs, the group's
		// computed style is its animated value, not where it lands.
		browser.cancel()
		const to = win.getComputedStyle(root, pseudo)
		const toWidth = parseFloat(to.width)
		const toHeight = parseFloat(to.height)
		if (!Number.isFinite(toWidth + toHeight)) continue
		const room = SHADOW_ROOM
		const open = `inset(-${room}px -${room}px -${room}px -${room}px round ${radius}px)`
		const closed = `inset(-${room}px ${toWidth - fromWidth - room}px ${toHeight - fromHeight - room}px -${room}px round ${radius}px)`
		root.animate(
			[
				{ transform: String(from.transform), clipPath: closed },
				{ transform: to.transform, clipPath: open },
			],
			{
				duration: MORPH_MS,
				easing: EASE_IN_OUT,
				fill: 'both',
				pseudoElement: pseudo,
			},
		)
	}
}
