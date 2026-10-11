/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { expect, test, vi } from 'vitest'
import { CATALOGUE_LABELS, NB_PROVENANCE_LABELS } from '#app/utils/labels.ts'
import { type SessionProvenance } from '#app/utils/plan-generation/provenance.ts'
import {
	nbProvenanceNonVouch,
	nbProvenanceSentence,
} from './__catalogue-card.ts'
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

/** The loader's provenance slot for a reading, by the same functions it uses. */
function slot(sourcing: SessionProvenance, adaptedFrom: string | null = null) {
	return {
		sentence: nbProvenanceSentence(sourcing),
		publishedAt:
			sourcing.kind === 'community'
				? (sourcing.attribution?.publishedAt ?? null)
				: null,
		nonVouch: nbProvenanceNonVouch(sourcing),
		adaptedFrom,
	}
}

const DANIELS: SessionProvenance = {
	kind: 'corpus',
	citation: {
		author: 'Daniels',
		work: "Daniels' Running Formula",
		year: 2013,
		locator: null,
	},
}

function stockRow(overrides: Record<string, unknown> = {}) {
	return {
		workoutId: 'stock-1',
		title: '4 × 6 min @ T',
		blurb: 'Threshold repeats',
		discipline: 'run',
		archetype: 'threshold',
		tier: 'stock',
		card: {
			sentence: '4 × 6 min terskel (1 min pause)',
			figures: ['28 min', 'Viderekommen og opp'],
		},
		provenance: slot(DANIELS),
		saved: false,
		...overrides,
	}
}

function communityRow(overrides: Record<string, unknown> = {}) {
	return {
		workoutId: 'community-1',
		title: 'My double threshold day',
		blurb: 'Two sessions, one day',
		discipline: 'run',
		archetype: 'sub-threshold',
		tier: 'community',
		card: { sentence: null, figures: [] },
		provenance: slot({
			kind: 'community',
			attribution: {
				displayName: 'Jo Kraas',
				publishedAt: new Date('2026-08-01T10:00:00Z'),
			},
		}),
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

test('a card leads with the session — its sentence, then minutes and level — before the prose (Arket M)', async () => {
	renderCatalogue({ rows: [stockRow()] })

	const sentence = await screen.findByText('4 × 6 min terskel (1 min pause)')
	const figures = screen.getByText('28 min · Viderekommen og opp')
	const prose = screen.getByText('Threshold repeats')
	expect(
		sentence.compareDocumentPosition(figures) &
			Node.DOCUMENT_POSITION_FOLLOWING,
	).toBeTruthy()
	expect(
		figures.compareDocumentPosition(prose) & Node.DOCUMENT_POSITION_FOLLOWING,
	).toBeTruthy()
	// The discipline and the archetype in Norwegian.
	expect(
		screen.getByText((_, el) => el?.textContent === 'Løping · Terskel'),
	).toBeInTheDocument()
})

test('a Stock Workout shows its Citation and never the non-vouch', async () => {
	renderCatalogue({ rows: [stockRow()] })

	expect(
		await screen.findByText(
			/Kilde: Daniels — Daniels' Running Formula \(2013\)/,
		),
	).toBeInTheDocument()
	expect(
		screen.queryByText(NB_PROVENANCE_LABELS.nonVouch),
	).not.toBeInTheDocument()
	// A stock row is not reportable: report-and-takedown is about what athletes
	// publish, and a cited corpus row is retired instead (ADR 0051 §3).
	expect(
		screen.queryByRole('link', { name: CATALOGUE_LABELS.report }),
	).not.toBeInTheDocument()
})

test('an uncited Stock Workout says which uncited kind it is, never an empty slot (#474)', async () => {
	renderCatalogue({
		rows: [
			stockRow({
				workoutId: 'convention-1',
				provenance: slot({ kind: 'convention' }),
			}),
			stockRow({
				workoutId: 'hand-written-1',
				provenance: slot({ kind: 'hand-written' }),
			}),
		],
	})

	expect(
		await screen.findByText(NB_PROVENANCE_LABELS.convention),
	).toBeInTheDocument()
	expect(screen.getByText(NB_PROVENANCE_LABELS.handWritten)).toBeInTheDocument()
	// Neither is disclaimed: trainm8 wrote or transcribed both.
	expect(
		screen.queryByText(NB_PROVENANCE_LABELS.nonVouch),
	).not.toBeInTheDocument()
})

test('a Shared Workout shows an Attribution and an explicit non-vouch, never a citation', async () => {
	renderCatalogue({ rows: [communityRow()] })

	expect(await screen.findByText(/Publisert av Jo Kraas/)).toBeInTheDocument()
	expect(screen.getByText(NB_PROVENANCE_LABELS.nonVouch)).toBeInTheDocument()
	expect(screen.queryByText(/Kilde:/)).not.toBeInTheDocument()
})

test('a community row can be reported and a moderator is what a report reaches', async () => {
	renderCatalogue({ rows: [communityRow()] })

	const report = await screen.findByRole('link', {
		name: CATALOGUE_LABELS.report,
	})
	expect(report).toHaveAttribute(
		'href',
		'/training/catalogue/report/community-1',
	)
})

test('a fork of a cited session says the source belongs to what it was forked from', async () => {
	renderCatalogue({
		rows: [
			communityRow({
				provenance: slot(
					{ kind: 'community', attribution: null },
					CATALOGUE_LABELS.adaptedFrom(
						"Daniels — Daniels' Running Formula (2013)",
					),
				),
			}),
		],
	})

	const adapted = await screen.findByText(/Bygd på/)
	expect(adapted).toHaveTextContent(/ikke til denne/)
})

test('the tiers are labelled, and no adoption count is anywhere on the page', async () => {
	renderCatalogue({ rows: [stockRow(), communityRow()] })

	const badges = await screen.findAllByText(/^(trainm8|Fellesskapet)$/)
	expect(badges.map((badge) => badge.textContent)).toContain('trainm8')
	expect(badges.map((badge) => badge.textContent)).toContain('Fellesskapet')
	// `GOAL.md`'s permanent no on the vanity layer: the save count is a ranking
	// input and never a badge (ADR 0051 §6).
	expect(screen.queryByText(/lagringer|saves/i)).not.toBeInTheDocument()
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
	expect(within(list).getByText(/Ikke publisert/)).toBeInTheDocument()
	expect(within(list).getByText(/Fjernet av en moderator/)).toBeInTheDocument()
	expect(
		within(list).getAllByRole('link', { name: /publiser/i })[0],
	).toHaveAttribute('href', '/training/catalogue/publish/mine-1')
})

// ---------------------------------------------------------------------------
// Retrieval: the facets, the count, and the empty state
// ---------------------------------------------------------------------------

test('the facets are a GET form, so a filtered Catalogue is a link', async () => {
	renderCatalogue({ rows: [stockRow()] })

	const search = await screen.findByLabelText(CATALOGUE_LABELS.searchLabel)
	expect(search.closest('form')).toHaveAttribute('method', 'get')
	// All seven facet controls, drawn from the corpus's own vocabularies.
	const F = CATALOGUE_LABELS.facets
	for (const label of [
		F.discipline,
		F.archetype,
		F.phase,
		F.goalEvent,
		F.level,
		F.tier,
	]) {
		expect(screen.getByLabelText(label)).toBeInTheDocument()
	}
	expect(
		screen.getByRole('checkbox', { name: CATALOGUE_LABELS.savedOnly }),
	).toBeInTheDocument()
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
	expect(
		await screen.findByLabelText(CATALOGUE_LABELS.facets.archetype),
	).toHaveTextContent('Terskel')
	expect(
		screen.getByLabelText(CATALOGUE_LABELS.facets.phase),
	).toHaveTextContent('Oppbygging')
	expect(
		screen.getByRole('checkbox', { name: CATALOGUE_LABELS.savedOnly }),
	).toBeChecked()
	expect(screen.getByLabelText(CATALOGUE_LABELS.searchLabel)).toHaveValue(
		'cruise',
	)

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

	expect(
		await screen.findByText('61 økter passer filtrene · viser 2'),
	).toBeInTheDocument()
	expect(
		screen.getByRole('link', { name: CATALOGUE_LABELS.showMore }),
	).toHaveAttribute('href', expect.stringContaining('count=48'))
})

test('an empty result names the filters that emptied it and offers a way out', async () => {
	renderCatalogue({
		rows: [],
		filters: { archetype: 'threshold', phase: 'base', saved: true },
		total: 0,
	})

	expect(
		await screen.findByText(
			'Ingen økter passer Terskel · Grunntrening · Lagret.',
		),
	).toBeInTheDocument()
	expect(
		screen.getAllByRole('link', { name: CATALOGUE_LABELS.clear })[0],
	).toHaveAttribute('href', '/training/catalogue')
})

// ---------------------------------------------------------------------------
// The collection axis and the calendar
// ---------------------------------------------------------------------------

test('saving posts the workout and never renders a number', async () => {
	const { submitted } = renderCatalogue({ rows: [stockRow()] })

	await userEvent.click(
		await screen.findByRole('button', { name: CATALOGUE_LABELS.save }),
	)

	expect(submitted).toHaveBeenCalledWith({
		intent: 'save',
		workoutId: 'stock-1',
	})
})

test('a saved row says so and unsaving is the same control', async () => {
	const { submitted } = renderCatalogue({
		rows: [stockRow({ saved: true })],
	})

	const button = await screen.findByRole('button', {
		name: CATALOGUE_LABELS.saved,
	})
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
		name: CATALOGUE_LABELS.place,
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
		await screen.findByRole('link', { name: CATALOGUE_LABELS.place }),
	).toHaveAttribute(
		'href',
		'/training/catalogue/place/stock-1?archetype=threshold',
	)
})
