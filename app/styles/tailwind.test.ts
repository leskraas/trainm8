import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

/**
 * A `:has()` on the page's root makes every node added anywhere restyle the
 * whole page: on the full Home Timeline that was a long task for each week as
 * it hydrated, and more on every frame painted while the page parsed (#503).
 * Key root-wide values off an attribute the app sets instead
 * (`data-tab-bar-space`, `root.tsx`).
 */
test('no rule keys the root off what is inside it', () => {
	const css = readFileSync(
		new URL('./tailwind.css', import.meta.url),
		'utf8',
	).replace(/\/\*[\s\S]*?\*\//g, '')
	expect(css).not.toMatch(/(:root|\bhtml|\bbody)\s*:has\(/)
})
