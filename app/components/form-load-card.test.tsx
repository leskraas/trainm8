/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeAll, expect, test } from 'vitest'
import {
	FATIGUE_LEGEND,
	FITNESS_LEGEND,
	FORM_LEGEND,
} from '#app/utils/load/legends.ts'
import { type SessionNudge } from '#app/utils/load/session-nudge.ts'
import { type TsbTrust } from '#app/utils/load/trustworthiness.ts'
import {
	FormLoadCard,
	type LoadSnapshot,
	type LoadTriad,
} from './form-load-card.tsx'

// base-ui positions open tooltips with floating-ui, which observes the trigger
// via ResizeObserver — absent in jsdom, so stub it.
beforeAll(() => {
	if (!('ResizeObserver' in globalThis)) {
		globalThis.ResizeObserver = class {
			observe() {}
			unobserve() {}
			disconnect() {}
		} as unknown as typeof ResizeObserver
	}
})

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

// ── plain-language legends (#181): Fit/Fat/Form explain themselves ──

test('the Fit/Fat/Form labels carry the spelled-out glossary terms as accessible names (#181)', () => {
	render(
		<FormLoadCard current={triad()} snapshots={noSnapshots} trust={trust()} />,
	)

	const region = screen.getByRole('region', { name: /form and training load/i })
	// The mini-stat labels are keyboard-focusable tooltip triggers named by the
	// canonical term, not the bare abbreviation.
	expect(
		within(region).getByRole('button', { name: 'Fitness (CTL)' }),
	).toBeInTheDocument()
	expect(
		within(region).getByRole('button', { name: 'Fatigue (ATL)' }),
	).toBeInTheDocument()
	// "Form (TSB)" appears twice: the card eyebrow and the mini stat.
	expect(
		within(region).getAllByRole('button', { name: 'Form (TSB)' }),
	).toHaveLength(2)
})

test('hovering a legend reveals the glossary definition in plain language (#181)', async () => {
	const user = userEvent.setup()
	render(
		<FormLoadCard current={triad()} snapshots={noSnapshots} trust={trust()} />,
	)

	const region = screen.getByRole('region', { name: /form and training load/i })
	await user.hover(
		within(region).getByRole('button', { name: 'Fitness (CTL)' }),
	)
	expect(
		await screen.findByText(FITNESS_LEGEND.description),
	).toBeInTheDocument()
})

test('focusing a legend with the keyboard also reveals its definition (#181)', async () => {
	const user = userEvent.setup()
	render(
		<FormLoadCard current={triad()} snapshots={noSnapshots} trust={trust()} />,
	)

	const region = screen.getByRole('region', { name: /form and training load/i })
	const fatigue = within(region).getByRole('button', { name: 'Fatigue (ATL)' })
	// Tab through the card until the Fatigue legend has focus (bounded so a
	// regression fails loudly instead of spinning).
	for (let i = 0; i < 10 && document.activeElement !== fatigue; i++) {
		await user.tab()
	}
	expect(fatigue).toHaveFocus()
	expect(
		await screen.findByText(FATIGUE_LEGEND.description),
	).toBeInTheDocument()
})

test('the legend copy matches the glossary canon: CTL/ATL/TSB with their plain words (#181)', () => {
	// Guard the ubiquitous language (CONTEXT.md): the definitions must name the
	// canonical metrics, not invented synonyms.
	expect(FITNESS_LEGEND.description).toMatch(/Chronic Training Load/)
	expect(FITNESS_LEGEND.description).toMatch(/42-day/)
	expect(FATIGUE_LEGEND.description).toMatch(/Acute Training Load/)
	expect(FATIGUE_LEGEND.description).toMatch(/7-day/)
	expect(FORM_LEGEND.description).toMatch(/Training Stress Balance/)
	expect(FORM_LEGEND.description).toMatch(
		/Fitness \(CTL\) minus Fatigue \(ATL\)/,
	)
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

// ── Session Nudge reason line (#157): coach→plan decision on the next session ──

test('a held nudge replaces the recommendation with its reason line', () => {
	const nudge: SessionNudge = {
		outcome: 'held',
		reason: 'Form is fresh (TSB +6) — your next session stands.',
	}
	render(
		<FormLoadCard
			current={triad({ tsb: 6 })}
			snapshots={noSnapshots}
			trust={trust()}
			nudge={nudge}
		/>,
	)

	expect(
		screen.getByText('Form is fresh (TSB +6) — your next session stands.'),
	).toBeInTheDocument()
	// The raw Form recommendation is superseded by the nudge reason.
	expect(screen.queryByText(/go for the session/i)).not.toBeInTheDocument()
})

test('a strength-next held nudge shows the honest no-ease reason', () => {
	const nudge: SessionNudge = {
		outcome: 'held',
		reason: 'Next session is strength — no Form-based ease yet.',
	}
	render(
		<FormLoadCard
			current={triad({ tsb: -14 })}
			snapshots={noSnapshots}
			trust={trust()}
			nudge={nudge}
		/>,
	)

	expect(
		screen.getByText('Next session is strength — no Form-based ease yet.'),
	).toBeInTheDocument()
})

test('an unavailable nudge shows the cold-start day-N/42 reason', () => {
	const nudge: SessionNudge = {
		outcome: 'unavailable',
		reason: 'Your Form reading is reliable after 42 days — day 12/42.',
	}
	render(
		<FormLoadCard
			current={null}
			snapshots={noSnapshots}
			trust={trust({ trustworthy: false, daysOfHistory: 12 })}
			nudge={nudge}
		/>,
	)

	expect(screen.getByText(/building baseline/i)).toBeInTheDocument()
	expect(screen.getByText(/day 12\/42/i)).toBeInTheDocument()
})

test('an eased nudge shows the eased reason line (the applier has softened the real session, #158)', () => {
	const nudge: SessionNudge = {
		outcome: 'eased',
		target: {
			discipline: 'run',
			zone: 'Z2',
			intent: 'endurance',
			durationMin: 60,
		},
		reason:
			"Form is low (TSB −14) — eased Tuesday's session to a Z2 endurance hour.",
	}
	render(
		<FormLoadCard
			current={triad({ tsb: -14 })}
			snapshots={noSnapshots}
			trust={trust()}
			nudge={nudge}
		/>,
	)

	// Slice 2 persists the ease, so the card states what it did — the eased reason
	// supersedes today's raw Form recommendation.
	expect(
		screen.getByText(
			"Form is low (TSB −14) — eased Tuesday's session to a Z2 endurance hour.",
		),
	).toBeInTheDocument()
	expect(screen.queryByText(/take it easy today/i)).not.toBeInTheDocument()
})

// ── miss-driven nudge + display honesty guard (#187): the card explains a gap ──

test('a miss-driven eased nudge shows the past-tense miss reason (the ease is persisted)', () => {
	const nudge: SessionNudge = {
		outcome: 'eased',
		target: {
			discipline: 'run',
			zone: 'Z2',
			intent: 'endurance',
			durationMin: 60,
		},
		reason:
			"You missed Monday's session — eased Wednesday's session to a Z2 endurance hour so you don't stack hard days after a gap.",
	}
	render(
		<FormLoadCard
			current={triad({ tsb: 1 })}
			snapshots={noSnapshots}
			trust={trust()}
			nudge={nudge}
		/>,
	)

	expect(
		screen.getByText(
			"You missed Monday's session — eased Wednesday's session to a Z2 endurance hour so you don't stack hard days after a gap.",
		),
	).toBeInTheDocument()
})

test('a miss-driven held nudge (strength next) shows the honest miss reason', () => {
	const nudge: SessionNudge = {
		outcome: 'held',
		reason:
			"You missed Monday's session — next session is strength, no Form-based ease yet.",
	}
	render(
		<FormLoadCard
			current={triad({ tsb: 1 })}
			snapshots={noSnapshots}
			trust={trust()}
			nudge={nudge}
		/>,
	)

	expect(
		screen.getByText(
			"You missed Monday's session — next session is strength, no Form-based ease yet.",
		),
	).toBeInTheDocument()
})

test('an unpersisted miss-driven ease shows the "easing your next session" acknowledgement, never a past-tense claim', () => {
	// The honesty guard (#187): the presenter swaps in this reason until the
	// applier has persisted the ease — the card must never claim an ease that
	// didn't happen.
	const nudge: SessionNudge = {
		outcome: 'eased',
		target: {
			discipline: 'run',
			zone: 'Z2',
			intent: 'endurance',
			durationMin: 60,
		},
		reason: "You missed Monday's session — easing your next session.",
	}
	render(
		<FormLoadCard
			current={triad({ tsb: 1 })}
			snapshots={noSnapshots}
			trust={trust()}
			nudge={nudge}
		/>,
	)

	expect(
		screen.getByText("You missed Monday's session — easing your next session."),
	).toBeInTheDocument()
	// No false past-tense claim anywhere on the card.
	expect(screen.queryByText(/eased .*'s session/i)).not.toBeInTheDocument()
})

test('a none nudge (no upcoming session) keeps the plain Form recommendation', () => {
	const nudge: SessionNudge = { outcome: 'none' }
	render(
		<FormLoadCard
			current={triad({ tsb: 7 })}
			snapshots={noSnapshots}
			trust={trust()}
			nudge={nudge}
		/>,
	)

	// The card never talks about a session that doesn't exist.
	expect(screen.getByText(/go for the session/i)).toBeInTheDocument()
})
