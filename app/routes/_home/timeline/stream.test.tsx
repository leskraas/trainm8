/**
 * @vitest-environment jsdom
 *
 * The stream's **empty cell** — the row a day with nothing on it gets.
 *
 * `index.dashboard.test.tsx` drives the whole screen through the loader, which
 * is where the grid as a whole is asserted. This file exists for the one thing
 * that cannot be reached that way: `Rest day`.
 *
 * `restPrescribed` has **no producer** (ADR 0065 §4 and its consequences).
 * Nothing in the model prescribes recovery per day — `PlanOutlinePhase.rhythm`
 * is week-granular and `trainableWeekdays` is availability — so no ledger, plan
 * or profile fixture can make the presenter emit `true`, and faking one from
 * either source is exactly what the ADR forbids. The branch is therefore driven
 * from the row model directly, so that whoever teaches the Plan Outline to say
 * "this day is recovery" finds the row already drawn and tested.
 */
import { render, screen, within } from '@testing-library/react'
import { createRoutesStub } from 'react-router'
import { expect, test } from 'vitest'
import { type TimelineDay, type TimelineWeek } from './presenter.ts'
import { WeekBlock } from './stream.tsx'

function day(overrides: Partial<TimelineDay> = {}): TimelineDay {
	return {
		key: '2030-02-22',
		dayLabel: 'Fri',
		dateLabel: '22',
		isToday: false,
		restPrescribed: false,
		sessions: [],
		...overrides,
	}
}

function week(rows: TimelineDay[]): TimelineWeek {
	return {
		key: '2030-02-18',
		rangeLabel: '18–24 February',
		stripLabel: '18–24 Feb',
		phaseLabel: 'Build 2 · This week',
		stripPhaseLabel: 'this week',
		statsLabel: '0 of 0 done',
		plannedTss: null,
		doneTss: null,
		imported: false,
		planStart: false,
		isNow: true,
		dayDots: ['empty', 'empty', 'today', 'empty', 'empty', 'empty', 'empty'],
		rows,
	}
}

function renderWeek(rows: TimelineDay[], anchorDayKey = '2030-02-20') {
	const App = createRoutesStub([
		{
			path: '/',
			Component: () => (
				<WeekBlock week={week(rows)} anchorDayKey={anchorDayKey} />
			),
		},
	])
	render(<App initialEntries={['/']} />)
}

test('a day the plan prescribes recovery on says Rest day, and says what it means', () => {
	renderWeek([day({ restPrescribed: true })])

	const cell = screen.getByRole('button', { name: 'Rest day — Fri 22' })
	expect(cell).toHaveTextContent('Rest day')
	expect(cell).toHaveTextContent('The plan asks for nothing today.')
	// The affordance is not offered where the plan has spoken: the day is not
	// blank, it is prescribed.
	expect(cell).not.toHaveTextContent('Add a workout')
})

test('every other empty day carries no label at all, only the affordance', () => {
	// The app does not name a day it knows nothing about (ADR 0065 §4). This is
	// the branch every empty day actually takes today.
	renderWeek([day()])

	const cell = screen.getByRole('button', { name: 'Add a workout on Fri 22' })
	expect(cell).toHaveTextContent('Add a workout')
	expect(cell).not.toHaveTextContent(/rest/i)
})

test('an empty cell is a real button at the control floor, not a clickable box', () => {
	// ADR 0028's second pillar: the actual control, not a hit area painted around
	// something inert. `min-h-11` and not `h-11` — 44px is a floor, and a rest
	// day is allowed to be taller (ADR 0065 §7). The rendered height is asserted
	// in the 390×844 spec; jsdom reports every box as zero.
	renderWeek([day()])

	const cell = screen.getByRole('button', { name: /add a workout/i })
	expect(cell.tagName).toBe('BUTTON')
	expect(cell).toHaveAttribute('type', 'button')
	expect(cell).toHaveClass('min-h-11')
})

test('an empty cell states its own date, in the gutter every row aligns to', () => {
	renderWeek([day({ dayLabel: 'Sat', dateLabel: '23 Feb', key: '2030-02-23' })])

	const cell = screen.getByRole('button', { name: /add a workout/i })
	expect(within(cell).getByText('Sat')).toBeInTheDocument()
	expect(within(cell).getByText('23 Feb')).toBeInTheDocument()
})

test('an empty today is still the landing anchor', () => {
	// The row exists because the day does, so the node the stream lands on is
	// there on a rest day too — which is the whole of the fix (ADR 0065 §1).
	renderWeek([
		day({ key: '2030-02-20', dayLabel: 'Wed', dateLabel: '20', isToday: true }),
	])

	const cell = screen.getByRole('button', { name: 'Add a workout on Wed 20' })
	expect(cell.closest('[data-timeline-today]')).not.toBeNull()
})
