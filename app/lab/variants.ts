/**
 * The **App Lab** (ADR 0125): trainm8 as several whole, different apps side
 * by side in production, so the owner can live in each one and find out what
 * the product should be. Each entry is one app: its own journey, layout,
 * look and words. `klassisk` is the app as it was before the lab.
 *
 * The chosen app is a cookie (`variant.server.ts`); `/` sends the athlete to
 * the chosen app's home, and the floating switcher (`lab-switcher.tsx`) moves
 * between them from anywhere.
 */

export type LabVariant = {
	key: string
	name: string
	/** One line: the idea the app tests. */
	idea: string
	/** What is radically different about it, for the gallery. */
	bet: string
	home: string
	/** The swatch the switcher shows for it. */
	swatch: string
}

export const LAB_VARIANTS = [
	{
		key: 'klassisk',
		name: 'Klassisk',
		idea: 'Appen slik den var: I dag, Trening, Meg.',
		bet: 'Faner, kort og skjemaer. Referansen alle de andre måles mot.',
		home: '/',
		swatch: '#5b8c7a',
	},
	{
		key: 'samtale',
		name: 'Samtale',
		idea: 'Hele appen er en samtale med treneren din.',
		bet: 'Ingen faner, ingen skjermer. Planen, økta og formen kommer som meldinger, og du svarer med knapper eller tekst.',
		home: '/lab/samtale',
		swatch: '#7c5cff',
	},
	{
		key: 'stabel',
		name: 'Stabel',
		idea: 'Én ting av gangen, i fullskjerm.',
		bet: 'En kortstokk av beslutninger: dagens økt, i morgen, uka. Sveip for å gå videre. Kjempestor typografi, null navigasjon.',
		home: '/lab/stabel',
		swatch: '#ff5a1f',
	},
	{
		key: 'terreng',
		name: 'Terreng',
		idea: 'Sesongen er et landskap du går gjennom.',
		bet: 'En romlig reise mot løpet: fjellet er belastningen, stien er ukene, du er prikken. Zoom fra sesong til dag.',
		home: '/lab/terreng',
		swatch: '#2f9e6f',
	},
	{
		key: 'dagbok',
		name: 'Dagbok',
		idea: 'En treningsdagbok på papir, ikke et dashbord.',
		bet: 'Redaksjonell typografi, uke for uke som oppslag i en notatbok. Planen og det du gjorde står skrevet, ikke tegnet.',
		home: '/lab/dagbok',
		swatch: '#b08a4f',
	},
	{
		key: 'cockpit',
		name: 'Cockpit',
		idea: 'Alt på én skjerm, styrt med tastatur.',
		bet: 'Tett, mørk terminal for den som vil se tallene: belastning, uker og økter i rutenett, kommandolinje i stedet for menyer.',
		home: '/lab/cockpit',
		swatch: '#e5c600',
	},
] as const satisfies readonly LabVariant[]

export type LabVariantKey = (typeof LAB_VARIANTS)[number]['key']

export const DEFAULT_VARIANT: LabVariantKey = 'klassisk'

export function isLabVariantKey(value: unknown): value is LabVariantKey {
	return LAB_VARIANTS.some((v) => v.key === value)
}

export function labVariant(key: LabVariantKey): LabVariant {
	return LAB_VARIANTS.find((v) => v.key === key) ?? LAB_VARIANTS[0]
}

/** The lab app a path belongs to, or `klassisk` outside `/lab/<key>`. */
export function variantOfPath(pathname: string): LabVariantKey {
	const match = /^\/lab\/([a-z0-9-]+)/.exec(pathname)
	const key = match?.[1]
	return isLabVariantKey(key) ? key : 'klassisk'
}
