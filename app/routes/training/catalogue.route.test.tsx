/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react'
import { createRoutesStub } from 'react-router'
import { expect, test } from 'vitest'
import { COMMUNITY_NON_VOUCH } from '#app/utils/community.ts'
import CatalogueRoute from './catalogue.tsx'

function stockRow(overrides: Record<string, unknown> = {}) {
	return {
		workoutId: 'stock-1',
		title: '4 × 6 min @ T',
		description: 'Threshold repeats',
		discipline: 'run',
		archetype: 'threshold',
		level: null,
		tier: 'stock',
		citation: {
			author: 'Daniels',
			work: "Daniels' Running Formula",
			year: 2013,
			locator: null,
		},
		attribution: null,
		provenance: null,
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
		citation: null,
		attribution: {
			displayName: 'Jo Kraas',
			publishedAt: new Date('2026-08-01T10:00:00Z'),
		},
		provenance: {
			adaptedFrom: null,
			adaptedFromTitle: null,
			adaptedFromWorkoutId: null,
		},
		...overrides,
	}
}

function renderCatalogue(
	rows: Array<Record<string, unknown>> = [stockRow(), communityRow()],
	own: Array<Record<string, unknown>> = [],
) {
	const App = createRoutesStub([
		{
			path: '/training/catalogue',
			Component: (props: Record<string, unknown>) => (
				<CatalogueRoute {...(props as any)} />
			),
			loader: () => ({ rows, own }),
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(<App initialEntries={['/training/catalogue']} />)
}

test('a Stock Workout shows its Citation and never the non-vouch', async () => {
	renderCatalogue([stockRow()])

	expect(
		await screen.findByText(/Daniels — Daniels' Running Formula \(2013\)/),
	).toBeInTheDocument()
	expect(screen.queryByText(COMMUNITY_NON_VOUCH)).not.toBeInTheDocument()
	// A stock row is not reportable: report-and-takedown is about what athletes
	// publish, and a cited corpus row is retired instead (ADR 0051 §3).
	expect(
		screen.queryByRole('link', { name: /report this session/i }),
	).not.toBeInTheDocument()
})

test('a Shared Workout shows an Attribution and an explicit non-vouch, never a citation', async () => {
	renderCatalogue([communityRow()])

	expect(await screen.findByText(/Published by Jo Kraas/)).toBeInTheDocument()
	expect(screen.getByText(COMMUNITY_NON_VOUCH)).toBeInTheDocument()
	expect(screen.queryByText(/Source:/)).not.toBeInTheDocument()
})

test('a community row can be reported and a moderator is what a report reaches', async () => {
	renderCatalogue([communityRow()])

	const report = await screen.findByRole('link', {
		name: /report this session/i,
	})
	expect(report).toHaveAttribute(
		'href',
		'/training/catalogue/report/community-1',
	)
})

test('a fork of a cited session says the source belongs to what it was forked from', async () => {
	renderCatalogue([
		communityRow({
			provenance: {
				adaptedFrom: {
					author: 'Daniels',
					work: "Daniels' Running Formula",
					year: 2013,
					locator: null,
				},
				adaptedFromTitle: '4 × 6 min @ T',
				adaptedFromWorkoutId: 'stock-1',
			},
		}),
	])

	const adapted = await screen.findByText(/Adapted from/)
	expect(adapted).toHaveTextContent(/not to this one/)
})

test('the tiers are labelled, and no adoption count is anywhere on the page', async () => {
	renderCatalogue([stockRow(), communityRow()])

	expect(await screen.findByText('trainm8')).toBeInTheDocument()
	expect(screen.getByText('Community')).toBeInTheDocument()
	// `GOAL.md`'s permanent no on the vanity layer: the save count is a ranking
	// input and never a badge (ADR 0051 §6).
	expect(screen.queryByText(/saves/i)).not.toBeInTheDocument()
	expect(screen.queryByText(/\badopted\b/i)).not.toBeInTheDocument()
})

test('the athlete’s own sessions offer a publish route, and a taken-down one says so', async () => {
	renderCatalogue(
		[],
		[
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
	)

	const list = await screen.findByRole('list')
	expect(within(list).getByText(/Not published/)).toBeInTheDocument()
	expect(within(list).getByText(/Removed by a moderator/)).toBeInTheDocument()
	expect(
		within(list).getAllByRole('link', { name: /publish/i })[0],
	).toHaveAttribute('href', '/training/catalogue/publish/mine-1')
})
