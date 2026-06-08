/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import { type TsbTrust } from '#app/utils/load/trustworthiness.ts'
import {
	FormLoadCard,
	type LoadSnapshot,
	type LoadTriad,
} from './form-load-card.tsx'

function trust(overrides: Partial<TsbTrust> = {}): TsbTrust {
	return {
		trustworthy: true,
		daysOfHistory: 60,
		requiredDays: 42,
		...overrides,
	}
}

function triad(overrides: Partial<LoadTriad> = {}): LoadTriad {
	return { ctl: 50, atl: 45, tsb: 5, ...overrides }
}

const noSnapshots: LoadSnapshot[] = []

test('cold-start shows "building baseline" with day N/required and no signed number', () => {
	render(
		<FormLoadCard
			current={null}
			snapshots={noSnapshots}
			trust={trust({ trustworthy: false, daysOfHistory: 12 })}
		/>,
	)

	expect(screen.getByText(/building baseline/i)).toBeInTheDocument()
	expect(screen.getByText(/day 12\/42/i)).toBeInTheDocument()
	// Never a bogus number during cold-start (ADR 0008/0010).
	expect(screen.queryByText(/^[+-]\d+$/)).not.toBeInTheDocument()
})

test('fresh: shows the signed TSB, the "Fresh" readiness label and its recommendation', () => {
	render(
		<FormLoadCard
			current={triad({ tsb: 7 })}
			snapshots={noSnapshots}
			trust={trust()}
		/>,
	)

	expect(screen.getByText('+7')).toBeInTheDocument()
	expect(screen.getByText('Fresh')).toBeInTheDocument()
	expect(screen.getByText(/go for the session/i)).toBeInTheDocument()
	expect(screen.queryByText(/building baseline/i)).not.toBeInTheDocument()
	expect(
		screen.getByRole('region', { name: /form and training load/i }),
	).toHaveAttribute('data-tone', 'fresh')
})

test('fatigued: shows a negative signed TSB, the "Fatigued" label and amber tone', () => {
	render(
		<FormLoadCard
			current={triad({ tsb: -12 })}
			snapshots={noSnapshots}
			trust={trust()}
		/>,
	)

	// The hero number sits beside the "Fatigued" label; the "Form" mini-stat
	// repeats the same value, so scope the signed-format check to the hero.
	const hero = screen.getByText('Fatigued').closest('div')!
	expect(within(hero).getByText('-12')).toBeInTheDocument()
	expect(
		screen.getByRole('region', { name: /form and training load/i }),
	).toHaveAttribute('data-tone', 'fatigued')
})

test('neutral: shows the "Neutral" label between the fresh and fatigued bands', () => {
	render(
		<FormLoadCard
			current={triad({ tsb: 0 })}
			snapshots={noSnapshots}
			trust={trust()}
		/>,
	)

	expect(screen.getByText('Neutral')).toBeInTheDocument()
	expect(
		screen.getByRole('region', { name: /form and training load/i }),
	).toHaveAttribute('data-tone', 'neutral')
})

test('supporting stats show the rounded CTL/ATL/TSB triad', () => {
	render(
		<FormLoadCard
			current={{ ctl: 45.4, atl: 38.6, tsb: 7 }}
			snapshots={noSnapshots}
			trust={trust()}
		/>,
	)

	const region = screen.getByRole('region', { name: /form and training load/i })
	const fit = within(region).getByText(/^fit$/i).parentElement!
	const fat = within(region).getByText(/^fat$/i).parentElement!
	expect(within(fit).getByText('45')).toBeInTheDocument()
	expect(within(fat).getByText('39')).toBeInTheDocument()
})

test('supporting stats show em-dashes when current load is null', () => {
	render(
		<FormLoadCard current={null} snapshots={noSnapshots} trust={trust()} />,
	)

	const region = screen.getByRole('region', { name: /form and training load/i })
	expect(within(region).getAllByText('—')).toHaveLength(3)
})

test('renders the supporting CTL/ATL trend when snapshots exist', () => {
	render(
		<FormLoadCard
			current={triad({ tsb: 7 })}
			snapshots={[
				{ date: '2030-01-01', ctl: 40, atl: 35, tsb: 5 },
				{ date: '2030-01-02', ctl: 45, atl: 38, tsb: 7 },
			]}
			trust={trust()}
		/>,
	)

	expect(screen.getByRole('img', { name: /trend/i })).toBeInTheDocument()
})

test('omits the trend when there is no history yet', () => {
	render(
		<FormLoadCard
			current={triad({ tsb: 7 })}
			snapshots={noSnapshots}
			trust={trust()}
		/>,
	)

	expect(screen.queryByRole('img', { name: /trend/i })).not.toBeInTheDocument()
})

// ── reconciled Coach voice: sustained Plan Adherence speaks through the card ──

test('sustained under over a fresh Form: card drifts, keeps the +TSB hero', () => {
	render(
		<FormLoadCard
			current={triad({ tsb: 7 })}
			snapshots={noSnapshots}
			trust={trust()}
			sustained={{ tone: 'under', weeks: 2 }}
		/>,
	)

	// The fresh hero number stays — but the single recommendation is the
	// drifting consequence, not "go for the session".
	expect(screen.getByText('+7')).toBeInTheDocument()
	expect(screen.getByText('Drifting')).toBeInTheDocument()
	expect(screen.getByText(/drifting from your goal/i)).toBeInTheDocument()
	expect(screen.queryByText(/go for the session/i)).not.toBeInTheDocument()
	expect(
		screen.getByRole('region', { name: /form and training load/i }),
	).toHaveAttribute('data-tone', 'under')
})

test('sustained over leads the card as an overreaching warning', () => {
	render(
		<FormLoadCard
			current={triad({ tsb: 7 })}
			snapshots={noSnapshots}
			trust={trust()}
			sustained={{ tone: 'over', weeks: 3 }}
		/>,
	)

	expect(screen.getByText('Overreaching')).toBeInTheDocument()
	expect(
		screen.getByRole('region', { name: /form and training load/i }),
	).toHaveAttribute('data-tone', 'over')
})

test('no sustained deviation leaves the plain Form readiness untouched', () => {
	render(
		<FormLoadCard
			current={triad({ tsb: 7 })}
			snapshots={noSnapshots}
			trust={trust()}
			sustained={null}
		/>,
	)

	expect(screen.getByText('Fresh')).toBeInTheDocument()
	expect(screen.getByText(/go for the session/i)).toBeInTheDocument()
})
