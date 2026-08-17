/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { expect, test, vi } from 'vitest'
import { COMMUNITY_NON_VOUCH } from '#app/utils/community.ts'
import {
	CONVENTION_SLOT_LINE,
	HAND_WRITTEN_SLOT_LINE,
} from '#app/utils/plan-generation/provenance.ts'
import CatalogueRoute from './catalogue.tsx'

const NO_FILTERS = {
	discipline: undefined,
	archetype: undefined,
	phase: undefined,
	goalEvent: undefined,
	level: undefined,
	tier: undefined,
	saved: false,
	q: undefined,
}

function stockRow(overrides: Record<string, unknown> = {}) {
	return {
		workoutId: 'stock-1',
		title: '4 × 6 min @ T',
		description: 'Threshold repeats',
		discipline: 'run',
		archetype: 'threshold',
		level: null,
		tier: 'stock',
		sourcing: {
			kind: 'corpus',
			citation: {
				author: 'Daniels',
				work: "Daniels' Running Formula",
				year: 2013,
				locator: null,
			},
		},
		adaptedFrom: null,
		saved: false,
		...overrides,
	}
}

function communityRow(overrides: Record<string, unknown> = {}) {
	return {
		workoutId: 'community-1',
		title: 'My double threshold day',
		description: 'Two sessions, one day',
		discipline: 'run',
		archetype: 'sub-threshold',
		level: 'advanced',
		tier: 'community',
		sourcing: {
			kind: 'community',
			attribution: {
				displayName: 'Jo Kraas',
				publishedAt: new Date('2026-08-01T10:00:00Z'),
			},
		},
		adaptedFrom: null,
		saved: false,
		...overrides,
	}
}

function renderCatalogue({
	rows = [stockRow(), communityRow()] as Array<Record<string, unknown>>,
	own = [] as Array<Record<string, unknown>>,
	filters = {} as Record<string, unknown>,
	total,
	hasMore = false,
	entries = ['/training/catalogue'],
}: {
	rows?: Array<Record<string, unknown>>
	own?: Array<Record<string, unknown>>
	filters?: Record<string, unknown>
	total?: number
	hasMore?: boolean
	entries?: string[]
} = {}) {
	const submitted = vi.fn()
	const App = createRoutesStub([
		{
			path: '/training/catalogue',
			Component: (props: Record<string, unknown>) => (
				<CatalogueRoute {...(props as any)} />
			),
			loader: () => ({
				rows,
				own,
				filters: { ...NO_FILTERS, ...filters },
				total: total ?? rows.length,
				hasMore,
				nextCount: 48,
			}),
			action: async ({ request }) => {
				submitted(Object.fromEntries(await request.formData()))
				return null
			},
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(<App initialEntries={entries} />)
	return { submitted }
}

test('a Stock Workout shows its Citation and never the non-vouch', async () => {
	renderCatalogue({ rows: [stockRow()] })

	expect(
		await screen.findByText(/Daniels — Daniels' Running Formula \(2013\)/),
	).toBeInTheDocument()
	expect(screen.queryByText(COMMUNITY_NON_VOUCH)).not.toBeInTheDocument()
	// A stock row is not reportable: report-and-takedown is about what athletes
	// publish, and a cited corpus row is retired instead (ADR 0051 §3).
	expect(
		screen.queryByRole('link', { name: /^report$/i }),
	).not.toBeInTheDocument()
})

test('an uncited Stock Workout says which uncited kind it is, never an empty slot (#474)', async () => {
	renderCatalogue({
		rows: [
			stockRow({ workoutId: 'convention-1', sourcing: { kind: 'convention' } }),
			stockRow({
				workoutId: 'hand-written-1',
				sourcing: { kind: 'hand-written' },
			}),
		],
	})

	// About a third of the corpus is uncited by construction, and the two kinds
	// owe the athlete different sentences.
	expect(await screen.findByText(CONVENTION_SLOT_LINE)).toBeInTheDocument()
	expect(screen.getByText(HAND_WRITTEN_SLOT_LINE)).toBeInTheDocument()
	// Neither is disclaimed: trainm8 wrote or transcribed both.
	expect(screen.queryByText(COMMUNITY_NON_VOUCH)).not.toBeInTheDocument()
})

test('a Shared Workout shows an Attribution and an explicit non-vouch, never a citation', async () => {
	renderCatalogue({ rows: [communityRow()] })

	expect(await screen.findByText(/Published by Jo Kraas/)).toBeInTheDocument()
	expect(screen.getByText(COMMUNITY_NON_VOUCH)).toBeInTheDocument()
	expect(screen.queryByText(/Source:/)).not.toBeInTheDocument()
})

test('a community row can be reported and a moderator is what a report reaches', async () => {
	renderCatalogue({ rows: [communityRow()] })

	const report = await screen.findByRole('link', { name: /^report$/i })
	expect(report).toHaveAttribute(
		'href',
		'/training/catalogue/report/community-1',
	)
})

test('a fork of a cited session says the source belongs to what it was forked from', async () => {
	renderCatalogue({
		rows: [
			communityRow({
				adaptedFrom: {
					author: 'Daniels',
					work: "Daniels' Running Formula",
					year: 2013,
					locator: null,
				},
			}),
		],
	})

	const adapted = await screen.findByText(/Adapted from/)
	expect(adapted).toHaveTextContent(/not to this one/)
})

test('the tiers are labelled, and no adoption count is anywhere on the page', async () => {
	renderCatalogue({ rows: [stockRow(), communityRow()] })

	const badges = await screen.findAllByText(/^(trainm8|Community)$/)
	expect(badges.map((badge) => badge.textContent)).toContain('trainm8')
	expect(badges.map((badge) => badge.textContent)).toContain('Community')
	// `GOAL.md`'s permanent no on the vanity layer: the save count is a ranking
	// input and never a badge (ADR 0051 §6).
	expect(screen.queryByText(/saves/i)).not.toBeInTheDocument()
	expect(screen.queryByText(/\badopted\b/i)).not.toBeInTheDocument()
})

test('the athlete’s own sessions offer a publish route, and a taken-down one says so', async () => {
	renderCatalogue({
		rows: [],
		own: [
			{
				id: 'mine-1',
				title: 'My tempo run',
				discipline: 'run',
				state: { kind: 'unpublished' },
			},
			{
				id: 'mine-2',
				title: 'My removed session',
				discipline: 'run',
				state: {
					kind: 'taken-down',
					attribution: {
						displayName: 'Jo',
						publishedAt: new Date('2026-08-01T10:00:00Z'),
					},
					reason: 'Unsafe to train',
					at: new Date('2026-08-05T10:00:00Z'),
				},
			},
		],
	})

	const list = await screen.findByRole('list')
	expect(within(list).getByText(/Not published/)).toBeInTheDocument()
	expect(within(list).getByText(/Removed by a moderator/)).toBeInTheDocument()
	expect(
		within(list).getAllByRole('link', { name: /publish/i })[0],
	).toHaveAttribute('href', '/training/catalogue/publish/mine-1')
})

// ---------------------------------------------------------------------------
// Retrieval: the facets, the count, and the empty state
// ---------------------------------------------------------------------------

test('the facets are a GET form, so a filtered Catalogue is a link', async () => {
	renderCatalogue({ rows: [stockRow()] })

	const search = await screen.findByLabelText(/search the catalogue/i)
	expect(search.closest('form')).toHaveAttribute('method', 'get')
	// All seven facet controls, drawn from the corpus's own vocabularies.
	expect(screen.getByLabelText('Discipline')).toBeInTheDocument()
	expect(screen.getByLabelText('Kind of session')).toBeInTheDocument()
	expect(screen.getByLabelText('Phase')).toBeInTheDocument()
	expect(screen.getByLabelText('Goal event')).toBeInTheDocument()
	expect(screen.getByLabelText('Suits')).toBeInTheDocument()
	expect(screen.getByLabelText('Written by')).toBeInTheDocument()
	expect(screen.getByLabelText(/in my list/i)).toBeInTheDocument()
})

test('the active facets come back prefilled from the URL', async () => {
	renderCatalogue({
		rows: [stockRow()],
		filters: {
			archetype: 'threshold',
			phase: 'build',
			saved: true,
			q: 'cruise',
		},
		entries: [
			'/training/catalogue?archetype=threshold&phase=build&saved=1&q=cruise',
		],
	})

	// The trigger reads out its `labels.ts` label, never the raw enum value.
	expect(await screen.findByLabelText('Kind of session')).toHaveTextContent(
		'Threshold',
	)
	expect(screen.getByLabelText('Phase')).toHaveTextContent('Build')
	expect(screen.getByLabelText(/in my list/i)).toBeChecked()
	expect(screen.getByLabelText(/search the catalogue/i)).toHaveValue('cruise')

	// And each facet actually carries its value into the GET submission, which is
	// what makes a filtered Catalogue a link.
	expect(document.querySelector('input[name="archetype"]')).toHaveValue(
		'threshold',
	)
})

test('the count says how many matched and how many are on screen', async () => {
	renderCatalogue({
		rows: [stockRow(), communityRow()],
		filters: { archetype: 'threshold' },
		total: 61,
		hasMore: true,
	})

	const count = await screen.findByText(/61 sessions match your filters/)
	expect(count).toHaveTextContent(/showing 2/)
	expect(screen.getByRole('link', { name: /show more/i })).toHaveAttribute(
		'href',
		expect.stringContaining('count=48'),
	)
})

test('an empty result names the filters that emptied it and offers a way out', async () => {
	renderCatalogue({
		rows: [],
		filters: { archetype: 'threshold', phase: 'base', saved: true },
		total: 0,
	})

	expect(
		await screen.findByText(/Nothing matches Threshold · Base · Saved\./),
	).toBeInTheDocument()
	expect(
		screen.getAllByRole('link', { name: /clear all/i })[0],
	).toHaveAttribute('href', '/training/catalogue')
})

// ---------------------------------------------------------------------------
// The collection axis and the calendar
// ---------------------------------------------------------------------------

test('saving posts the workout and never renders a number', async () => {
	const { submitted } = renderCatalogue({ rows: [stockRow()] })

	await userEvent.click(await screen.findByRole('button', { name: 'Save' }))

	expect(submitted).toHaveBeenCalledWith({
		intent: 'save',
		workoutId: 'stock-1',
	})
})

test('a saved row says so and unsaving is the same control', async () => {
	const { submitted } = renderCatalogue({
		rows: [stockRow({ saved: true })],
	})

	const button = await screen.findByRole('button', { name: 'Saved' })
	expect(button).toHaveAttribute('aria-pressed', 'true')

	await userEvent.click(button)
	expect(submitted).toHaveBeenCalledWith({
		intent: 'unsave',
		workoutId: 'stock-1',
	})
})

test('every row can be placed on the calendar, community rows included', async () => {
	renderCatalogue({ rows: [stockRow(), communityRow()] })

	const links = await screen.findAllByRole('link', {
		name: /add to my calendar/i,
	})
	expect(links[0]).toHaveAttribute('href', '/training/catalogue/place/stock-1')
	// The athlete chose it, so a community row is placeable (ADR 0053 §4).
	expect(links[1]).toHaveAttribute(
		'href',
		'/training/catalogue/place/community-1',
	)
})

test('the place link carries the filters, so cancelling comes back to the same list', async () => {
	renderCatalogue({
		rows: [stockRow()],
		filters: { archetype: 'threshold' },
		entries: ['/training/catalogue?archetype=threshold'],
	})

	expect(
		await screen.findByRole('link', { name: /add to my calendar/i }),
	).toHaveAttribute(
		'href',
		'/training/catalogue/place/stock-1?archetype=threshold',
	)
})
