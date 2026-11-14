/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { PageHeader } from './page-header.tsx'

test('a long title wraps instead of being cut with "…" (#528 AC9)', () => {
	// A 40-character exercise name on the lift history page at 390px.
	const name = 'Bulgarsk splittknebøy med manualer, høy'
	render(<PageHeader title={name} />)

	const heading = screen.getByRole('heading', { level: 1, name })
	expect(heading.classList).not.toContain('truncate')
	expect(heading.classList).toContain('[overflow-wrap:anywhere]')
})
