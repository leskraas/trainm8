/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from './select.tsx'

function renderSelect(props: { disabled?: boolean } = {}) {
	render(
		<Select defaultValue="run">
			<SelectTrigger aria-label="Discipline" disabled={props.disabled}>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="run">Run</SelectItem>
				<SelectItem value="bike">Bike</SelectItem>
			</SelectContent>
		</Select>,
	)
	return screen.getByRole('combobox', { name: 'Discipline' })
}

// B6 (#249): every select renders exactly one dropdown indicator. Base UI's
// Select.Icon defaults its children to a '▼' glyph, which used to render
// beside the sprite icon passed via `render` — two indicators on every select.
test('the trigger renders exactly one dropdown indicator', () => {
	const trigger = renderSelect()

	expect(trigger.querySelectorAll('svg')).toHaveLength(1)
	expect(trigger.textContent).not.toContain('▼')
})

test('a disabled trigger still renders a single indicator', () => {
	const trigger = renderSelect({ disabled: true })

	expect(trigger).toBeDisabled()
	expect(trigger.querySelectorAll('svg')).toHaveLength(1)
	expect(trigger.textContent).not.toContain('▼')
})
