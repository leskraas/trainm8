import { expect, test } from 'vitest'
import { cn } from './misc.tsx'

// ADR 0085: the design system's named tokens must merge like Tailwind's own
// scales, or a caller's override silently loses (or silently drops a colour).

test('a named type step does not swallow a text colour', () => {
	expect(cn('text-muted-foreground', 'text-footnote')).toBe(
		'text-muted-foreground text-footnote',
	)
	expect(cn('text-ink-faint', 'text-body-sm')).toBe(
		'text-ink-faint text-body-sm',
	)
})

test('a named type step overrides a size', () => {
	expect(cn('text-sm', 'text-callout')).toBe('text-callout')
})

test('named motion tokens override their scale', () => {
	expect(cn('duration-200', 'duration-press')).toBe('duration-press')
	expect(cn('ease-out', 'ease-drawer')).toBe('ease-drawer')
})
