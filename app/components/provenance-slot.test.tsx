/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { type ReactNode } from 'react'
import { createRoutesStub } from 'react-router'
import { expect, test } from 'vitest'
import { CATALOGUE_LABELS, NB_PROVENANCE_LABELS } from '#app/utils/labels.ts'
import { type SessionProvenance } from '#app/utils/plan-generation/provenance.ts'
import {
	locatorHref,
	nbProvenanceNonVouch,
	nbProvenanceSentence,
	ProvenanceSlot,
} from './provenance-slot.tsx'

const DENADAI: SessionProvenance = {
	kind: 'corpus',
	citation: {
		author: 'Denadai BS, de Aguiar RA, de Lima LC, Greco CC, Caputo F',
		work: 'Explosive training and heavy weight training are effective for improving running economy in endurance athletes',
		year: 2017,
		locator: 'doi:10.1007/s40279-016-0604-z',
	},
}

const COMMUNITY: SessionProvenance = {
	kind: 'community',
	attribution: {
		displayName: 'Jo Kraas',
		publishedAt: new Date('2026-08-01T10:00:00Z'),
	},
}

/** The slot reads the athlete's timezone off the root route. */
function renderSlot(node: ReactNode) {
	const App = createRoutesStub([{ path: '/', Component: () => node }])
	render(<App initialEntries={['/']} />)
}

/** The slot's line, read as the athlete reads it: one paragraph's words. */
function line(pattern: RegExp) {
	return screen.findByText(
		(_, element) =>
			element?.tagName === 'P' && pattern.test(element.textContent ?? ''),
	)
}

const TAKEN_DOWN = CATALOGUE_LABELS.publishState['taken-down']

test('the slot speaks Norwegian, and only a community row disclaims', () => {
	expect(
		nbProvenanceSentence({
			kind: 'corpus',
			citation: {
				author: 'Daniels',
				work: 'Running Formula',
				year: 2014,
				locator: null,
			},
		}),
	).toBe('Kilde: Daniels — Running Formula (2014)')
	expect(nbProvenanceSentence({ kind: 'convention' })).toMatch(/trenerpraksis/)
	expect(nbProvenanceSentence(COMMUNITY)).toBe('Publisert av Jo Kraas')
	expect(nbProvenanceNonVouch({ kind: 'convention' })).toBeNull()
	expect(
		nbProvenanceNonVouch({ kind: 'community', attribution: null }),
	).toMatch(/ikke gått gjennom/)
})

test('a locator links where it resolves: a DOI through doi.org, a URL as itself', () => {
	expect(locatorHref('doi:10.1007/s40279-016-0604-z')).toBe(
		'https://doi.org/10.1007/s40279-016-0604-z',
	)
	expect(locatorHref('https://runningwritings.com/x.html')).toBe(
		'https://runningwritings.com/x.html',
	)
	expect(locatorHref('ISBN 978-1-4504-3183-0')).toBeNull()
})

test('a corpus row carries its Citation and locator, and never an Attribution or the non-vouch', async () => {
	renderSlot(<ProvenanceSlot provenance={DENADAI} />)
	await line(/^Kilde: Denadai BS.*\(2017\) · doi:10/)
	expect(
		screen.getByRole('link', { name: 'doi:10.1007/s40279-016-0604-z' }),
	).toHaveAttribute('href', 'https://doi.org/10.1007/s40279-016-0604-z')
	expect(screen.queryByText(/Publisert av/)).toBeNull()
	expect(screen.queryByText(NB_PROVENANCE_LABELS.nonVouch)).toBeNull()
})

test('an adopted session leads its line with «Endret av deg» and keeps its Session Provenance', async () => {
	renderSlot(<ProvenanceSlot provenance={DENADAI} adopted />)
	await line(/^Endret av deg · Kilde: Denadai BS/)
})

test('a community row carries its byline, date and non-vouch, never a Citation, and says it was taken down', async () => {
	renderSlot(<ProvenanceSlot provenance={COMMUNITY} takenDown />)
	await line(
		/^Publisert av Jo Kraas · 1\. aug\.? 2026 · Fjernet av en moderator$/,
	)
	expect(screen.getByText(NB_PROVENANCE_LABELS.nonVouch)).toBeInTheDocument()
	expect(screen.queryByText(/Kilde:/)).toBeNull()
})

test('a taken-down mark never lands on a corpus row', async () => {
	renderSlot(<ProvenanceSlot provenance={DENADAI} takenDown />)
	await line(/^Kilde: Denadai BS/)
	expect(screen.queryByText(TAKEN_DOWN)).toBeNull()
})
