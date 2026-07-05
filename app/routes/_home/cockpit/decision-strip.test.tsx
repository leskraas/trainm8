/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { type ReactElement } from 'react'
import { createRoutesStub } from 'react-router'
import { beforeAll, expect, test } from 'vitest'
import {
	FATIGUE_LEGEND,
	FITNESS_LEGEND,
	FORM_LEGEND,
} from '#app/utils/load/legends.ts'
import { type SessionNudge } from '#app/utils/load/session-nudge.ts'
import { type TsbTrust } from '#app/utils/load/trustworthiness.ts'
import { type LoadTriad } from '#app/utils/load/types.ts'
import { DecisionStrip } from './decision-strip.tsx'
import { type TodayCard } from './presenter.ts'

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

// The strip's action is a react-router Link, so render inside a route stub.
function renderStrip(ui: ReactElement) {
	const Stub = createRoutesStub([{ path: '/', Component: () => ui }])
	render(<Stub initialEntries={['/']} />)
}

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

function todayCard(overrides: Partial<TodayCard> = {}): TodayCard {
	return {
		id: 'session-1',
		isToday: true,
		date: new Date('2030-01-02T18:00:00'),
		dateLabel: '2 Jan',
		discipline: 'run',
		disciplineLabel: 'Run',
		title: 'Tempo Intervals',
		durationMin: 60,
		plannedTss: 55,
		profile: [],
		target: null,
		cta: 'View session',
		...overrides,
	}
}

test('cold-start shows "building baseline" with day N/required and no signed number', () => {
	renderStrip(
		<DecisionStrip
			current={null}
			trust={trust({ trustworthy: false, daysOfHistory: 12 })}
			today={null}
		/>,
	)

	expect(screen.getByText(/building baseline/i)).toBeInTheDocument()
	expect(screen.getByText(/day 12\/42/i)).toBeInTheDocument()
	// Never a bogus number during cold-start (ADR 0008/0010).
	expect(screen.queryByText(/^[+-]\d+$/)).not.toBeInTheDocument()
})

test('fresh: shows the signed TSB, the "Fresh" readiness label and its recommendation', () => {
	renderStrip(
		<DecisionStrip current={triad({ tsb: 7 })} trust={trust()} today={null} />,
	)

	expect(screen.getByText('+7')).toBeInTheDocument()
	expect(screen.getByText('Fresh')).toBeInTheDocument()
	expect(screen.getByText(/go for the session/i)).toBeInTheDocument()
	expect(screen.queryByText(/building baseline/i)).not.toBeInTheDocument()
	expect(
		screen.getByRole('region', { name: /today's decision/i }),
	).toHaveAttribute('data-tone', 'fresh')
})

test('fatigued: shows a negative signed TSB, the "Fatigued" label and amber tone', () => {
	renderStrip(
		<DecisionStrip
			current={triad({ tsb: -12 })}
			trust={trust()}
			today={null}
		/>,
	)

	expect(screen.getByText('-12')).toBeInTheDocument()
	expect(screen.getByText('Fatigued')).toBeInTheDocument()
	expect(
		screen.getByRole('region', { name: /today's decision/i }),
	).toHaveAttribute('data-tone', 'fatigued')
})

test('neutral: shows the "Neutral" label between the fresh and fatigued bands', () => {
	renderStrip(
		<DecisionStrip current={triad({ tsb: 0 })} trust={trust()} today={null} />,
	)

	expect(screen.getByText('Neutral')).toBeInTheDocument()
	expect(
		screen.getByRole('region', { name: /today's decision/i }),
	).toHaveAttribute('data-tone', 'neutral')
})

// ── plain-language legend (#181): the Form eyebrow explains itself ──

test('the Form eyebrow carries the spelled-out glossary term as its accessible name (#181)', () => {
	renderStrip(<DecisionStrip current={triad()} trust={trust()} today={null} />)

	const region = screen.getByRole('region', { name: /today's decision/i })
	expect(
		within(region).getByRole('button', { name: 'Form (TSB)' }),
	).toBeInTheDocument()
})

test('hovering the Form legend reveals the glossary definition in plain language (#181)', async () => {
	const user = userEvent.setup()
	renderStrip(<DecisionStrip current={triad()} trust={trust()} today={null} />)

	await user.hover(screen.getByRole('button', { name: 'Form (TSB)' }))
	expect(await screen.findByText(FORM_LEGEND.description)).toBeInTheDocument()
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

// ── the Today half: session facts + the single honestly-named action ──

test("today's session shows discipline, title, duration, planned TSS and the resolved target", () => {
	renderStrip(
		<DecisionStrip
			current={triad()}
			trust={trust()}
			today={todayCard({
				target: { kind: 'metric', metric: 'pace', text: '4:05–4:15 /km' },
			})}
		/>,
	)

	const region = screen.getByRole('region', { name: /today's decision/i })
	expect(within(region).getByText(/run · today/i)).toBeInTheDocument()
	expect(within(region).getByText('Tempo Intervals')).toBeInTheDocument()
	expect(within(region).getByText('60')).toBeInTheDocument()
	expect(within(region).getByText('55')).toBeInTheDocument()
	expect(within(region).getByText('4:05–4:15 /km')).toBeInTheDocument()
})

test('a future session is dated, not called "today"', () => {
	renderStrip(
		<DecisionStrip
			current={triad()}
			trust={trust()}
			today={todayCard({ isToday: false, dateLabel: '4 Jan' })}
		/>,
	)

	expect(screen.getByText(/run · 4 jan/i)).toBeInTheDocument()
	expect(screen.queryByText(/run · today/i)).not.toBeInTheDocument()
})

test('the single action carries the status-derived label and opens the Workout Detail View (#179)', () => {
	renderStrip(
		<DecisionStrip current={triad()} trust={trust()} today={todayCard()} />,
	)

	// base-ui's Button renders the Link as an anchor carrying role="button".
	const cta = screen.getByRole('button', { name: /view session/i })
	expect(cta).toHaveAttribute('href', '/training/sessions/session-1')
	// It never promises recording — that affordance does not exist in-app.
	expect(screen.queryByText(/start session/i)).not.toBeInTheDocument()
})

test('a completed-but-unlogged session flips the action to "Log session" (#179)', () => {
	renderStrip(
		<DecisionStrip
			current={triad()}
			trust={trust()}
			today={todayCard({ cta: 'Log session' })}
		/>,
	)

	expect(
		screen.getByRole('button', { name: /log session/i }),
	).toBeInTheDocument()
	expect(
		screen.queryByRole('button', { name: /view session/i }),
	).not.toBeInTheDocument()
})

test('with nothing scheduled the strip shows the empty state and no session action', () => {
	renderStrip(<DecisionStrip current={triad()} trust={trust()} today={null} />)

	expect(screen.getByText(/nothing scheduled/i)).toBeInTheDocument()
	expect(screen.getByRole('link', { name: /plan one/i })).toBeInTheDocument()
	expect(
		screen.queryByRole('button', { name: /view session/i }),
	).not.toBeInTheDocument()
})

// ── reconciled Coach voice: sustained Plan Adherence speaks through the strip ──

test('sustained under over a fresh Form: strip drifts, keeps the +TSB hero', () => {
	renderStrip(
		<DecisionStrip
			current={triad({ tsb: 7 })}
			trust={trust()}
			sustained={{ tone: 'under', weeks: 2 }}
			today={null}
		/>,
	)

	// The fresh hero number stays — but the single recommendation is the
	// drifting consequence, not "go for the session".
	expect(screen.getByText('+7')).toBeInTheDocument()
	expect(screen.getByText('Drifting')).toBeInTheDocument()
	expect(screen.getByText(/drifting from your goal/i)).toBeInTheDocument()
	expect(screen.queryByText(/go for the session/i)).not.toBeInTheDocument()
	expect(
		screen.getByRole('region', { name: /today's decision/i }),
	).toHaveAttribute('data-tone', 'under')
})

test('sustained over leads the strip as an overreaching warning', () => {
	renderStrip(
		<DecisionStrip
			current={triad({ tsb: 7 })}
			trust={trust()}
			sustained={{ tone: 'over', weeks: 3 }}
			today={null}
		/>,
	)

	expect(screen.getByText('Overreaching')).toBeInTheDocument()
	expect(
		screen.getByRole('region', { name: /today's decision/i }),
	).toHaveAttribute('data-tone', 'over')
})

test('no sustained deviation leaves the plain Form readiness untouched', () => {
	renderStrip(
		<DecisionStrip
			current={triad({ tsb: 7 })}
			trust={trust()}
			sustained={null}
			today={null}
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
	renderStrip(
		<DecisionStrip
			current={triad({ tsb: 6 })}
			trust={trust()}
			nudge={nudge}
			today={null}
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
	renderStrip(
		<DecisionStrip
			current={triad({ tsb: -14 })}
			trust={trust()}
			nudge={nudge}
			today={null}
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
	renderStrip(
		<DecisionStrip
			current={null}
			trust={trust({ trustworthy: false, daysOfHistory: 12 })}
			nudge={nudge}
			today={null}
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
	renderStrip(
		<DecisionStrip
			current={triad({ tsb: -14 })}
			trust={trust()}
			nudge={nudge}
			today={null}
		/>,
	)

	// Slice 2 persists the ease, so the strip states what it did — the eased reason
	// supersedes today's raw Form recommendation.
	expect(
		screen.getByText(
			"Form is low (TSB −14) — eased Tuesday's session to a Z2 endurance hour.",
		),
	).toBeInTheDocument()
	expect(screen.queryByText(/take it easy today/i)).not.toBeInTheDocument()
})

// ── miss-driven nudge + display honesty guard (#187): the strip explains a gap ──

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
	renderStrip(
		<DecisionStrip
			current={triad({ tsb: 1 })}
			trust={trust()}
			nudge={nudge}
			today={null}
		/>,
	)

	expect(
		screen.getByText(
			"You missed Monday's session — eased Wednesday's session to a Z2 endurance hour so you don't stack hard days after a gap.",
		),
	).toBeInTheDocument()
})

test('an unpersisted miss-driven ease shows the "easing your next session" acknowledgement, never a past-tense claim', () => {
	// The honesty guard (#187): the presenter swaps in this reason until the
	// applier has persisted the ease — the strip must never claim an ease that
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
	renderStrip(
		<DecisionStrip
			current={triad({ tsb: 1 })}
			trust={trust()}
			nudge={nudge}
			today={null}
		/>,
	)

	expect(
		screen.getByText("You missed Monday's session — easing your next session."),
	).toBeInTheDocument()
	// No false past-tense claim anywhere on the strip.
	expect(screen.queryByText(/eased .*'s session/i)).not.toBeInTheDocument()
})

test('a none nudge (no upcoming session) keeps the plain Form recommendation', () => {
	const nudge: SessionNudge = { outcome: 'none' }
	renderStrip(
		<DecisionStrip
			current={triad({ tsb: 7 })}
			trust={trust()}
			nudge={nudge}
			today={null}
		/>,
	)

	// The strip never talks about a session that doesn't exist.
	expect(screen.getByText(/go for the session/i)).toBeInTheDocument()
})
