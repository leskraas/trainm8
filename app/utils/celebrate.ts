/**
 * The earned moment (spec #558 stories 93–94, #582): the first time a session
 * is marked _Gjort_, eight sparks leave its check over 300ms. Rare by Emil's
 * frequency table — once per session, never on _Angre_, never again when the
 * same session is marked done after an undo — so it is allowed to delight.
 *
 * Compositor-only: each spark is a 5px dot fixed over the check, moved by
 * `transform` and faded by `opacity` on the Web Animations API, so it runs
 * off the main thread while I dag revalidates, takes no layout and no
 * pointer, and removes itself when done. It lives on `document.body`, so the
 * card changing under it (the button giving way to the done card) does not
 * cut it short.
 *
 * Reduced motion: no sparks. The check fades in over 200ms instead — calm,
 * and still a change the athlete sees (ADR 0077: gentler, never zero).
 */
import { EASE_OUT, prefersReducedMotion } from './motion.ts'

/** How many sparks, how long they fly (spec #558). */
export const SPARK_COUNT = 8
export const SPARK_MS = 300
/** The reduced-motion answer: the check fades in. */
export const CHECK_FADE_MS = 200

const STORAGE_KEY = 'trainm8:celebrated'
/** Enough to cover any week; the oldest are forgotten first. */
const REMEMBER = 64

/** Sessions celebrated in this tab, so an undo and a second _Gjort_ stay quiet. */
const celebrated = new Set<string>()

function rememberedIds(): string[] {
	try {
		const raw = window.sessionStorage.getItem(STORAGE_KEY)
		const ids: unknown = raw ? JSON.parse(raw) : []
		return Array.isArray(ids)
			? ids.filter((id): id is string => typeof id === 'string')
			: []
	} catch {
		return []
	}
}

function remember(sessionId: string): void {
	celebrated.add(sessionId)
	try {
		const ids = [...rememberedIds().filter((id) => id !== sessionId), sessionId]
		window.sessionStorage.setItem(
			STORAGE_KEY,
			JSON.stringify(ids.slice(-REMEMBER)),
		)
	} catch {
		// Storage refused (private mode, full): the tab's memory still holds it.
	}
}

function alreadyCelebrated(sessionId: string): boolean {
	return celebrated.has(sessionId) || rememberedIds().includes(sessionId)
}

/**
 * Celebrate a session marked done, once. `check` is the mark the sparks
 * leave from (or that fades in); `accent` the session's track colour, which
 * every other spark wears beside the primary green.
 */
export function celebrateOnce(
	sessionId: string,
	check: HTMLElement | null,
	accent = 'var(--primary)',
): 'sparks' | 'fade' | null {
	if (!check || alreadyCelebrated(sessionId)) return null
	remember(sessionId)
	if (prefersReducedMotion()) {
		check.animate([{ opacity: 0 }, { opacity: 1 }], {
			duration: CHECK_FADE_MS,
			easing: EASE_OUT,
		})
		return 'fade'
	}
	const box = check.getBoundingClientRect()
	const x = box.left + box.width / 2
	const y = box.top + box.height / 2
	for (let index = 0; index < SPARK_COUNT; index++) {
		const angle = (index / SPARK_COUNT) * Math.PI * 2 + 0.3
		const reach = index % 2 ? 26 : 20
		const spark = document.createElement('span')
		spark.setAttribute('aria-hidden', 'true')
		spark.dataset.spark = ''
		Object.assign(spark.style, {
			position: 'fixed',
			left: `${x - 2.5}px`,
			top: `${y - 2.5}px`,
			width: '5px',
			height: '5px',
			borderRadius: '9999px',
			pointerEvents: 'none',
			zIndex: '60',
			background: index % 2 ? 'var(--primary)' : accent,
		})
		document.body.append(spark)
		const flight = spark.animate(
			[
				// Never from nothing: a spark leaves at nearly its size.
				{ transform: 'translate(0px, 0px) scale(0.9)', opacity: 1 },
				{
					transform: `translate(${(Math.cos(angle) * reach).toFixed(1)}px, ${(Math.sin(angle) * reach).toFixed(1)}px) scale(0.5)`,
					opacity: 0,
				},
			],
			{ duration: SPARK_MS, easing: EASE_OUT, fill: 'forwards' },
		)
		const gone = () => spark.remove()
		flight.onfinish = gone
		flight.oncancel = gone
	}
	return 'sparks'
}
