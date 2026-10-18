/**
 * The motion tokens script needs (ADR 0077 §1), in one place: the curves the
 * stylesheet names `--ease-out` and `--ease-in-out` (`app/styles/tailwind.css`),
 * for the Web Animations a stylesheet cannot reach, and the one reading of
 * the athlete's reduced-motion setting.
 *
 * The values mirror the stylesheet's; change both together.
 */

/** `--ease-out`: something arriving or leaving, fast start. */
export const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)'

/** `--ease-in-out`: something moving on screen. */
export const EASE_IN_OUT = 'cubic-bezier(0.77, 0, 0.175, 1)'

/**
 * Whether the athlete asked for reduced motion. Gentler, never zero (ADR
 * 0077): a caller fades where it would have travelled.
 */
export function prefersReducedMotion(win: Window = window): boolean {
	return win.matchMedia('(prefers-reduced-motion: reduce)').matches
}
