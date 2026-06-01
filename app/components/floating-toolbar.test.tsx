/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { FloatingToolbar } from './floating-toolbar.tsx'

test('renders children inside a div', () => {
	render(<FloatingToolbar>Save</FloatingToolbar>)
	expect(screen.getByText('Save')).toBeInTheDocument()
})

test('applies base toolbar classes', () => {
	render(<FloatingToolbar data-testid="toolbar">Save</FloatingToolbar>)
	const el = screen.getByTestId('toolbar')
	expect(el.className).toContain('absolute')
	expect(el.className).toContain('bottom-3')
	expect(el.className).toContain('rounded-lg')
})

test('merges caller className via cn()', () => {
	render(
		<FloatingToolbar className="my-custom-class" data-testid="toolbar">
			Save
		</FloatingToolbar>,
	)
	const el = screen.getByTestId('toolbar')
	expect(el.className).toContain('my-custom-class')
	expect(el.className).toContain('absolute')
})

test('forwards additional props to the div', () => {
	render(
		<FloatingToolbar data-testid="toolbar" aria-label="form actions">
			Save
		</FloatingToolbar>,
	)
	expect(screen.getByTestId('toolbar')).toHaveAttribute(
		'aria-label',
		'form actions',
	)
})
