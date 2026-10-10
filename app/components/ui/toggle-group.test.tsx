/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { expect, test } from 'vitest'

import { SegmentedControl, ToggleGroupItem } from './toggle-group.tsx'

function View() {
	const [view, setView] = useState<'uke' | 'sesong'>('uke')
	return (
		<SegmentedControl value={view} onValueChange={setView} aria-label="Visning">
			<ToggleGroupItem value="uke">Uke</ToggleGroupItem>
			<ToggleGroupItem value="sesong">Sesong</ToggleGroupItem>
		</SegmentedControl>
	)
}

test('a segmented control switches the pressed item', async () => {
	const user = userEvent.setup()
	render(<View />)

	const uke = screen.getByRole('button', { name: 'Uke' })
	const sesong = screen.getByRole('button', { name: 'Sesong' })
	expect(uke).toHaveAttribute('aria-pressed', 'true')

	await user.click(sesong)
	expect(sesong).toHaveAttribute('aria-pressed', 'true')
	expect(uke).toHaveAttribute('aria-pressed', 'false')
})

// Base UI lets a single-select group be emptied by pressing the pressed item;
// a view switch must always show one view.
test('pressing the pressed item keeps it pressed', async () => {
	const user = userEvent.setup()
	render(<View />)

	const uke = screen.getByRole('button', { name: 'Uke' })
	await user.click(uke)
	expect(uke).toHaveAttribute('aria-pressed', 'true')
})
