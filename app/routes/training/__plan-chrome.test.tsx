/**
 * @vitest-environment jsdom
 *
 * The disclosure chevron says the state of **its own** `<details>`, never an
 * ancestor's. Sesong nests disclosures (a phase card holding its forms,
 * _Avansert_ holding its sections), and a chevron keyed to a shared `group`
 * pointed "open" on a closed section the moment anything around it opened
 * (audit B5).
 *
 * jsdom applies no Tailwind, so the chevron's rotate variant is read off its
 * class and resolved to the selector Tailwind compiles it to; `matches` then
 * answers exactly what the browser would.
 */
import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { Disclosure, DisclosureCard } from './__plan-chrome.tsx'

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

function chevronOf(summaryText: string): Element {
	const summary = screen.getByText(summaryText).closest('summary')
	const chevron = summary?.querySelector(':scope > svg')
	if (!chevron) throw new Error(`No chevron on ${summaryText}`)
	return chevron
}

test('a closed section inside an open card points closed', () => {
	render(
		<DisclosureCard summary="Peak" defaultOpen>
			<Disclosure summary="Endre fasen">
				<p>Skjema</p>
			</Disclosure>
		</DisclosureCard>,
	)

	expect(pointsOpen(chevronOf('Peak'))).toBe(true)
	expect(pointsOpen(chevronOf('Endre fasen'))).toBe(false)
})

test('a closed section inside an open section points closed', () => {
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
		<DisclosureCard summary="Base" defaultOpen>
			<Disclosure summary="Endre fasen">
				<p>Skjema</p>
			</Disclosure>
		</DisclosureCard>,
	)
	const outer = screen.getByText('Base').closest('details')!
	const inner = screen.getByText('Endre fasen').closest('details')!

	inner.open = true
	expect(pointsOpen(chevronOf('Endre fasen'))).toBe(true)

	outer.open = false
	expect(pointsOpen(chevronOf('Base'))).toBe(false)
	expect(pointsOpen(chevronOf('Endre fasen'))).toBe(true)
})

test('the chevron turns on transform alone, and not under reduced motion', () => {
	render(
		<Disclosure summary="Avansert">
			<p>Innhold</p>
		</Disclosure>,
	)
	const classes = [...chevronOf('Avansert').classList]

	// Movement only when the athlete has not asked for less of it, on the app's
	// strong ease-out and the press duration — never the built-in curve.
	expect(classes).toContain('motion-safe:transition-transform')
	expect(classes).toContain('motion-safe:ease-out')
	expect(classes).toContain('motion-safe:duration-press')
	expect(classes).not.toContain('transition-transform')
})
