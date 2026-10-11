/**
 * @vitest-environment jsdom
 *
 * A section's chevron says the state of **its own** section, never an
 * ancestor's. Sesong nests sections (a phase card holding its forms, _Avansert_
 * holding its sections), and a chevron keyed to a shared `group` pointed "open"
 * on a closed section the moment anything around it opened (audit B5).
 *
 * Two kinds are checked: the native `<details>` `Disclosure` (kept for the
 * creation flow and the catalogue), whose chevron reads its own `[open]`, and
 * Sesong's collapsibles (`CollapsibleSection`, `DisclosureCard`, round 2), whose
 * chevron reads its own trigger's `data-panel-open`.
 *
 * jsdom applies no Tailwind, so the chevron's rotate variant is read off its
 * class and resolved to the selector Tailwind compiles it to; `matches` then
 * answers exactly what the browser would.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import {
	CollapsibleSection,
	Disclosure,
	DisclosureCard,
} from './__plan-chrome.tsx'

/** The selector a `<variant>:rotate-180` class rotates under. */
function selectorFor(variant: string): string {
	const arbitrary = /^\[(.+)\]$/.exec(variant)
	if (arbitrary) return arbitrary[1]!.replace('&', '*')
	const group = /^group-open(?:\/(.+))?$/.exec(variant)
	if (group) {
		return `${group[1] ? `.group\\/${group[1]}` : '.group'}[open] *`
	}
	throw new Error(`Unknown rotate variant: ${variant}`)
}

/** Whether the chevron is drawn pointing up — "this is open". */
function pointsOpen(chevron: Element): boolean {
	const variants = [...chevron.classList].flatMap((token) => {
		const match = /^(.+):rotate-180$/.exec(token)
		return match ? [match[1]!] : []
	})
	expect(variants).toHaveLength(1)
	return chevron.matches(selectorFor(variants[0]!))
}

/** The row a section's name sits on: a `<summary>` or a collapsible trigger. */
function rowOf(text: string): HTMLElement {
	const row = screen
		.getByText(text)
		.closest<HTMLElement>('summary, [data-slot="collapsible-trigger"]')
	if (!row) throw new Error(`No row for ${text}`)
	return row
}

function chevronOf(text: string): Element {
	const chevron = rowOf(text).querySelector(':scope > svg')
	if (!chevron) throw new Error(`No chevron on ${text}`)
	return chevron
}

test('a closed section inside an open card points closed', () => {
	render(
		<DisclosureCard summary="Spissing" defaultOpen>
			<CollapsibleSection summary="Endre fasen">
				<p>Skjema</p>
			</CollapsibleSection>
		</DisclosureCard>,
	)

	expect(pointsOpen(chevronOf('Spissing'))).toBe(true)
	expect(pointsOpen(chevronOf('Endre fasen'))).toBe(false)
})

test('a closed native section inside an open one points closed', () => {
	render(
		<Disclosure summary="Avansert" defaultOpen>
			<Disclosure summary="Løftblokker">
				<p>Blokker</p>
			</Disclosure>
		</Disclosure>,
	)

	expect(pointsOpen(chevronOf('Avansert'))).toBe(true)
	expect(pointsOpen(chevronOf('Løftblokker'))).toBe(false)
})

test('opening the inner section turns its chevron, and closing the outer leaves it alone', () => {
	render(
		<DisclosureCard summary="Grunntrening" defaultOpen>
			<CollapsibleSection summary="Endre fasen">
				<p>Skjema</p>
			</CollapsibleSection>
		</DisclosureCard>,
	)

	fireEvent.click(rowOf('Endre fasen'))
	expect(pointsOpen(chevronOf('Endre fasen'))).toBe(true)

	fireEvent.click(rowOf('Grunntrening'))
	expect(pointsOpen(chevronOf('Grunntrening'))).toBe(false)
})

test('a closed section renders nothing of its body until it opens', () => {
	render(
		<CollapsibleSection summary="Avansert">
			<p>Skjemaet</p>
		</CollapsibleSection>,
	)
	expect(screen.queryByText('Skjemaet')).toBeNull()

	fireEvent.click(rowOf('Avansert'))
	expect(screen.getByText('Skjemaet')).toBeTruthy()
})

test('the chevron turns on transform alone, and not under reduced motion', () => {
	render(
		<CollapsibleSection summary="Avansert">
			<p>Innhold</p>
		</CollapsibleSection>,
	)
	const classes = [...chevronOf('Avansert').classList]

	// Movement only when the athlete has not asked for less of it, on the app's
	// strong ease-out and the press duration — never the built-in curve.
	expect(classes).toContain('motion-safe:transition-transform')
	expect(classes).toContain('motion-safe:ease-out')
	expect(classes).toContain('motion-safe:duration-press')
	expect(classes).not.toContain('transition-transform')
})
