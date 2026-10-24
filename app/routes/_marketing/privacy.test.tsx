/**
 * @vitest-environment jsdom
 */
/**
 * The privacy page is a real Art. 13 notice (#549), not the `<div>Privacy</div>`
 * placeholder: it says it is a draft, names the legal bases and the complaint
 * route, and states retention from ADR 0105.
 */
import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import PrivacyRoute from './privacy.tsx'

test('the privacy page is a Norwegian Art. 13 notice marked as a draft', () => {
	render(<PrivacyRoute />)

	expect(
		screen.getByRole('heading', { level: 1, name: 'Personvernerklæring' }),
	).toBeTruthy()
	expect(screen.getByRole('note').textContent).toMatch(/UTKAST/)
	for (const heading of [
		'Behandlingsansvarlig',
		'Formål og rettslig grunnlag',
		'Hvem som får opplysningene',
		'Overføring ut av EØS',
		'Hvor lenge vi lagrer',
		'Rettighetene dine',
		'Klage',
	]) {
		expect(
			screen.getByRole('heading', { level: 2, name: heading }),
		).toBeTruthy()
	}
	expect(screen.getByText(/artikkel 9 nr\. 2 bokstav a/)).toBeTruthy()
	expect(screen.getByText(/Datatilsynet/)).toBeTruthy()
	expect(screen.getByText(/Sikkerhetskopier: inntil 5 dager/)).toBeTruthy()
	// Controller facts nobody has given us stay visible placeholders.
	expect(screen.getByText(/\[NAVN PÅ BEHANDLINGSANSVARLIG\]/)).toBeTruthy()
})
