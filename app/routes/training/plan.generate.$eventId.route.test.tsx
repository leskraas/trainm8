/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react'
import { createRoutesStub } from 'react-router'
import { expect, test, vi } from 'vitest'
import { COMMUNITY_NON_VOUCH } from '#app/utils/community.ts'
import { type SeasonPreview } from '#app/utils/plan-generation/generate.server.ts'
import { type SessionProvenance } from '#app/utils/plan-generation/provenance.ts'
import {
	type GeneratedSession,
	type GeneratedWeek,
} from '#app/utils/plan-generation/season.ts'
import GenerateSeasonRoute from './plan.generate.$eventId.tsx'

function week(overrides: Partial<GeneratedWeek> = {}): GeneratedWeek {
	return {
		weekIndex: 0,
		weekKey: '2026-01-05',
		phaseIndex: 0,
		role: 'loading',
		isFinalWeek: false,
		targets: [{ discipline: 'run', currency: 'km', value: 40 }],
		...overrides,
	}
}

function session(overrides: Partial<GeneratedSession> = {}): GeneratedSession {
	return {
		weekIndex: 0,
		weekKey: '2026-01-05',
		weekday: 1,
		discipline: 'run',
		archetype: 'threshold',
		slot: 'quality',
		zone: 4,
		entryId: 'stockentry_run-C1',
		workoutId: 'stock_run-C1',
		title: '5 × 1 km @ T',
		provenance: {
			kind: 'corpus',
			citation: {
				author: 'Daniels',
				work: "Daniels' Running Formula",
				year: 2013,
				locator: null,
			},
		},
		...overrides,
	}
}

function preview(overrides: Partial<SeasonPreview['season']> = {}) {
	const value: SeasonPreview = {
		event: {
			id: 'event-1',
			name: 'Spring 10k',
			startDate: new Date('2026-04-04T09:00:00Z'),
			disciplines: ['run'],
		},
		season: {
			generatorId: 'deterministic-v1',
			presetKey: 'masters-2-1-short',
			startWeekKey: '2026-01-05',
			eventWeekKey: '2026-03-30',
			phases: [
				{
					name: 'Base',
					weeks: 4,
					rhythm: '2:1',
					tapers: false,
					cataloguePhase: 'base',
				},
			],
			tracks: [{ discipline: 'run', currency: 'km', anchorValue: 40 }],
			weeks: [week()],
			sessions: [session()],
			unfilled: [],
			unavailable: [],
			weekdaySource: 'default',
			levelFloor: 'intermediate',
			goalEvent: '10k',
			...overrides,
		},
		choice: {
			presetKey: 'masters-2-1-short',
			startWeekKey: '2026-01-05',
			intent: 'deliberately-building',
			tracks: [{ discipline: 'run', currency: 'km', anchorValue: 40 }],
		},
		currentWeekKey: '2026-01-05',
		eventWeekKey: '2026-03-30',
		timezone: 'UTC',
		proposals: [],
		weeklyCapacityHours: null,
	}
	return value
}

function renderScreen(season: Partial<SeasonPreview['season']> = {}) {
	const approved = vi.fn()
	const App = createRoutesStub([
		{
			path: '/training/plan/generate/:eventId',
			Component: (props: Record<string, unknown>) => (
				<GenerateSeasonRoute {...(props as any)} />
			),
			loader: () => ({ preview: preview(season), refusal: null }),
			action: async ({ request }) => {
				approved(new URL(request.url).search)
				return { refusal: null }
			},
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(<App initialEntries={['/training/plan/generate/event-1']} />)
	return { approved }
}

test('the season is already there — the screen opens on a plan, not a blank form', async () => {
	renderScreen()
	expect(
		await screen.findByRole('heading', { name: /your season, ready to review/i }),
	).toBeInTheDocument()
	expect(screen.getByText('5 × 1 km @ T')).toBeInTheDocument()
	expect(screen.getByText(/1 sessions across 1 weeks/i)).toBeInTheDocument()
})

test('nothing reaches the calendar until the athlete says so', async () => {
	renderScreen()
	expect(
		await screen.findByRole('button', {
			name: /add these 1 sessions to my calendar/i,
		}),
	).toBeInTheDocument()
})

test('a corpus session shows its Citation in the provenance slot', async () => {
	renderScreen()
	const slot = await screen.findByText(
		/Source: Daniels — Daniels' Running Formula \(2013\)/,
	)
	expect(slot).toBeInTheDocument()
	expect(screen.queryByText(COMMUNITY_NON_VOUCH)).not.toBeInTheDocument()
})

test('the two uncited stock kinds say so, each in its own words', async () => {
	renderScreen({
		sessions: [
			session({ provenance: { kind: 'convention' }, title: 'Easy 60' }),
			session({
				weekday: 3,
				provenance: { kind: 'hand-written' },
				title: 'Shakeout',
			}),
		],
	})
	expect(
		await screen.findByText(/Coaching convention — trainm8 claims no published/i),
	).toBeInTheDocument()
	expect(
		screen.getByText(/Written by trainm8 — no published source/i),
	).toBeInTheDocument()
})

test('a community session reads the slot without a Citation, and carries the non-vouch', async () => {
	// Generation places no community row today, but the slot reads provenance
	// rather than assuming a Citation — so a forked or adopted session still
	// renders honestly.
	const attributed: SessionProvenance = {
		kind: 'community',
		attribution: { displayName: 'Jo Kraas', publishedAt: new Date(0) },
	}
	renderScreen({
		sessions: [
			session({ provenance: attributed }),
			session({
				weekday: 3,
				provenance: { kind: 'community', attribution: null },
				title: 'Unattributed',
			}),
		],
	})
	expect(await screen.findByText('Published by Jo Kraas')).toBeInTheDocument()
	expect(
		screen.getByText('Published by an athlete — trainm8 cannot state who.'),
	).toBeInTheDocument()
	expect(screen.getAllByText(COMMUNITY_NON_VOUCH)).toHaveLength(2)
})

test('the strength Unavailable is stated before the season, not hidden inside it', async () => {
	renderScreen({ unavailable: [{ reading: 'strength-track', discipline: 'strength' }] })
	const notice = await screen.findByRole('region', {
		name: /what this season does not include/i,
	})
	expect(within(notice).getByText(/no strength track/i)).toBeInTheDocument()
	expect(
		within(notice).getByText(/rather than invent them/i),
	).toBeInTheDocument()
})

test('an empty day is named rather than backfilled', async () => {
	renderScreen({
		sessions: [],
		unfilled: [
			{
				weekIndex: 0,
				weekKey: '2026-01-05',
				weekday: 2,
				discipline: 'run',
				slot: 'quality',
				zone: 4,
				archetypes: ['threshold', 'sub-threshold'],
				cataloguePhase: 'base',
			},
		],
	})
	expect(
		await screen.findByText(/1 training day is empty/i),
	).toBeInTheDocument()
	expect(screen.getByText(/nothing to place/i)).toBeInTheDocument()
})

test('a week with no Season Anchor reads “—” rather than a number nobody typed', async () => {
	renderScreen({
		weeks: [week({ targets: [{ discipline: 'run', currency: 'km', value: null }] })],
	})
	expect(await screen.findByText(/Run —/)).toBeInTheDocument()
})
