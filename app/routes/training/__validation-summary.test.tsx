/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { MenuErrorLead, PopoverErrorLead } from './__validation-summary.tsx'

// Dark `foreground-destructive` reads 4.42:1 on `popover`, under AA for
// 13 px text, so error leads inside overlays take `destructive` in dark mode
// (5.75:1) and keep `foreground-destructive` in light (6.28:1).
test('a popover error lead stays AA on the dark popover', () => {
	render(<PopoverErrorLead messages={['Mangler reps']} />)
	expect(screen.getByText('Mangler reps')).toHaveClass(
		'text-footnote',
		'text-foreground-destructive',
		'dark:text-destructive',
	)
})

test('a menu error lead stays AA on the dark popover', () => {
	render(<MenuErrorLead message="Mangler sone" />)
	expect(screen.getByText('Mangler sone')).toHaveClass(
		'text-footnote',
		'text-foreground-destructive',
		'dark:text-destructive',
	)
})
