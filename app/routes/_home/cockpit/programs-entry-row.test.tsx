/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { createRoutesStub } from 'react-router'
import { expect, test } from 'vitest'
import { ProgramsEntryRow } from './programs-entry-row.tsx'

function renderRow() {
	const Stub = createRoutesStub([
		{ path: '/', Component: () => <ProgramsEntryRow /> },
	])
	render(<Stub initialEntries={['/']} />)
}

test('the entry row leads to the strength programs list', () => {
	renderRow()

	const row = screen.getByRole('link', { name: /strength programs/i })
	expect(row).toHaveAttribute('href', '/training/programs')
})

// The programs list owns the sentence about what a program runs on (the
// handoff's intro line). The row does not repeat it: one sentence, one home.
test("it does not repeat the programs list's own intro sentence", () => {
	renderRow()

	expect(
		screen.queryByText(/runs on the last weight you lifted/i),
	).not.toBeInTheDocument()
})

test('it is one row and one link — no second piece of persistent chrome', () => {
	renderRow()

	expect(screen.getAllByRole('link')).toHaveLength(1)
})
