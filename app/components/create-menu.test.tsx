/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { NewSessionButton } from './create-menu.tsx'

test('I dag’s one creation control is “Ny økt”, and it opens the composer (no menu)', async () => {
	const onClick = vi.fn()
	render(<NewSessionButton onClick={onClick} />)

	const button = screen.getByRole('button', { name: 'Ny økt' })
	await userEvent.click(button)

	expect(onClick).toHaveBeenCalledTimes(1)
	// A race and a plan are made in Sesong now: nothing here opens a menu.
	expect(button).not.toHaveAttribute('aria-haspopup')
	expect(screen.queryByRole('menu')).toBeNull()
})
