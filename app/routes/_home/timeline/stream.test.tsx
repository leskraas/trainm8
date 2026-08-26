/**
 * @vitest-environment jsdom
 *
 * The stream's **empty cell** — the row a day with nothing on it gets.
 *
 * `index.dashboard.test.tsx` drives the whole screen through the loader, which
 * is where the grid as a whole is asserted. This file exists for the two things
 * that cannot be reached that way: `Rest day`, and what a tapped cell says
 * **before** it writes anything.
 *
 * `restPrescribed` has **no producer** (ADR 0065 §4 and its consequences).
 * Nothing in the model prescribes recovery per day — `PlanOutlinePhase.rhythm`
 * is week-granular and `trainableWeekdays` is availability — so no ledger, plan
 * or profile fixture can make the presenter emit `true`, and faking one from
 * either source is exactly what the ADR forbids. The branch is therefore driven
 * from the row model directly, so that whoever teaches the Plan Outline to say
 * "this day is recovery" finds the row already drawn and tested.
 *
 * The draft is the other one. Which Discipline it opens on is a fact about the
 * athlete's history that the row model does not carry, and "an athlete with no
 * history is asked" is a state no fixture can reach through the loader without
 * emptying the whole screen — so the prefill is handed to the provider directly
 * and the four states are driven from there.
 */
import { render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { expect, test } from 'vitest'
import { type Discipline } from '#app/utils/workout-schema.ts'
import { DayStampProvider } from './day-stamp-context.tsx'
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

function renderWeek(
	rows: TimelineDay[],
	{
		anchorDayKey = '2030-02-20',
		prefill = null,
	}: { anchorDayKey?: string; prefill?: Discipline | null } = {},
) {
	const App = createRoutesStub([
		{
			path: '/',
			Component: () => (
				// Every cell in the stream is a write target, so the stream only
				// renders inside the provider — see `day-stamp-context.tsx`.
				<DayStampProvider prefill={prefill} thresholds={{}} ledger={[]}>
					<WeekBlock week={week(rows)} anchorDayKey={anchorDayKey} />
				</DayStampProvider>
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

// ——— The draft: what a tapped cell says before anything is written ————————

test('tapping an empty cell opens the draft on the athlete’s most-trained discipline', async () => {
	// Derived, and shown **before** it commits (ADR 0065 §5). Nothing has been
	// written at this point: the chip is what the stamp would be stamped for.
	const user = userEvent.setup()
	renderWeek([day({ dayLabel: 'Sat', dateLabel: '23 Feb' })], {
		prefill: 'bike',
	})

	await user.click(screen.getByRole('button', { name: /add a workout/i }))

	// The sport, named the way the full authoring route's own Discipline select
	// names it — the chip and the select are the same choice.
	expect(screen.getByRole('radio', { name: 'Ride' })).toBeChecked()
	expect(
		screen.getByText('What you train most — tap another to change it.'),
	).toBeInTheDocument()
	// The sentence the stamp is about to write, in the notation's own words.
	expect(
		screen.getByRole('button', { name: 'Add 45 min Z2' }),
	).toBeInTheDocument()
})

test('the prefilled discipline is one tap to change', async () => {
	const user = userEvent.setup()
	renderWeek([day()], { prefill: 'bike' })

	await user.click(screen.getByRole('button', { name: /add a workout/i }))
	await user.click(screen.getByRole('radio', { name: 'Swim' }))

	expect(screen.getByRole('radio', { name: 'Swim' })).toBeChecked()
	expect(screen.getByRole('radio', { name: 'Ride' })).not.toBeChecked()
})

test('an athlete with no history is asked, never assigned a discipline', async () => {
	// A default that is a guess dressed as a derivation is the failure mode this
	// repo keeps naming, so with nothing to read the cell asks the question and
	// offers no confirm until it has an answer (ADR 0065 §5).
	const user = userEvent.setup()
	renderWeek([day()], { prefill: null })

	await user.click(screen.getByRole('button', { name: /add a workout/i }))

	for (const name of ['Run', 'Ride', 'Swim', 'Strength']) {
		expect(screen.getByRole('radio', { name })).not.toBeChecked()
	}
	expect(
		screen.getByText('Nothing on record to read this from, so: which one?'),
	).toBeInTheDocument()
	// And nothing to confirm: there is no session to offer until they answer.
	expect(screen.queryByRole('button', { name: /^Add / })).toBeNull()
	expect(screen.queryByRole('link', { name: /name the lifts/i })).toBeNull()
})

test('the draft carries the More escape, and it names the day it was opened on', async () => {
	const user = userEvent.setup()
	renderWeek(
		[day({ key: '2030-02-23', dayLabel: 'Sat', dateLabel: '23 Feb' })],
		{
			prefill: 'run',
		},
	)

	await user.click(screen.getByRole('button', { name: /add a workout/i }))

	// The full route now accepts both — the day the athlete tapped, and the chip
	// they were looking at when they tapped it.
	expect(screen.getByRole('link', { name: 'More' })).toHaveAttribute(
		'href',
		'/training/sessions/new?date=2030-02-23&discipline=run',
	)
})

test('strength takes the full route rather than stamping a session with no lift', async () => {
	// A strength step is required to name a lift, and no lift can be read off a
	// tap on a Thursday — so the line says so and hands over, which is what the
	// More escape is for.
	const user = userEvent.setup()
	renderWeek([day({ key: '2030-02-23' })], { prefill: 'strength' })

	await user.click(screen.getByRole('button', { name: /add a workout/i }))

	expect(screen.queryByRole('button', { name: /^Add / })).toBeNull()
	expect(screen.getByRole('link', { name: 'Name the lifts' })).toHaveAttribute(
		'href',
		'/training/sessions/new?date=2030-02-23&discipline=strength',
	)
	expect(
		screen.getByText(
			'A lifting session says which lifts — more than the line can hold.',
		),
	).toBeInTheDocument()
})

test('the draft closes without writing anything', async () => {
	const user = userEvent.setup()
	renderWeek([day()], { prefill: 'run' })

	await user.click(screen.getByRole('button', { name: /add a workout/i }))
	await user.click(screen.getByRole('button', { name: 'Cancel' }))

	expect(
		screen.getByRole('button', { name: /add a workout/i }),
	).toBeInTheDocument()
})
