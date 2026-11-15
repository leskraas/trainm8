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
	/**
	 * The axis it diverges on, in a phrase. No two apps share a position on
	 * the same axis: two apps that would differ only in look are one app.
	 */
	axis: string
	/** When it is the right answer. */
	winsWhen: string
	/** What it costs, said honestly. */
	costs: string
	home: string
	/** The swatch the switcher shows for it. */
	swatch: string
}

export const LAB_VARIANTS = [
	{
		key: 'klassisk',
		name: 'Klassisk',
		idea: 'Appen slik den var.',
		bet: 'Faner, kort og skjemaer. Referansen alle de andre måles mot.',
		axis: 'Faner og skjermer (referansen)',
		winsWhen: 'Du vil ha alt på sin faste plass og navigerer selv.',
		costs: 'Mye å velge mellom; lett å bli et dashbord ingen åpner.',
		home: '/',
		swatch: '#5b8c7a',
	},
	{
		key: 'brev',
		name: 'Brev',
		idea: 'Ett ærlig brev i uka i stedet for en app du sjekker hver dag.',
		bet: 'Treneren skriver til deg: hvordan uka gikk, hva som kommer og hvorfor. Dagen i dag er med vilje mager.',
		axis: 'Bruksrytme: ukentlig ritual i prosa',
		winsWhen: 'Du vil ha mindre app, og ærlighet trenger setninger.',
		costs: 'Dagen i dag blir mager; endringer midt i uka blir et PS.',
		home: '/lab/brev',
		swatch: '#b23a2e',
	},
	{
		key: 'prat',
		name: 'Prat',
		idea: 'Planen forklares og forhandles i en samtale.',
		bet: 'Ingen kalender: en dialog med svarknapper og en kommandolinje med fast vokabular.',
		axis: 'Interaksjonsmodell: dialog',
		winsWhen:
			'Du vet ikke hva du skal spørre om, og livet skjer som replikker.',
		costs: 'Dårlig oversikt over sesongen; tregt for den erfarne.',
		home: '/lab/prat',
		swatch: '#1d4ed8',
	},
	{
		key: 'sti',
		name: 'Sti',
		idea: 'Sesongen er en sti gjennom et landskap.',
		bet: 'Fasene er terreng, ukene er heller, du er der du står. Du går mot målet i stedet for å bla i uker.',
		axis: 'Metafor: romlig reise',
		winsWhen:
			'Du har et mål med dato og vil se hvorfor dagens økt ser slik ut.',
		costs: 'Svakt uten dato; ukedagene blir sekundære.',
		home: '/lab/sti',
		swatch: '#7e9b78',
	},
	{
		key: 'tommel',
		name: 'Tommel',
		idea: 'Appen bestemmer, du svarer ja eller nei.',
		bet: 'Alle valg er forslag med en tommel opp eller ned. Ingen menyer, ingen skjemaer.',
		axis: 'Hvem styrer: appen, du svarer',
		winsWhen: 'Du er lei av å ta valg og vil ha ett blikk på vei ut døra.',
		costs: 'Den erfarne kan ikke flytte en økt direkte.',
		home: '/lab/tommel',
		swatch: '#1f9d55',
	},
	{
		key: 'hovedbok',
		name: 'Hovedbok',
		idea: 'Alt i én tett tabell som regner selv.',
		bet: 'Du redigerer rett i cellene. Regnearket tilbake, uten arbeidet med det.',
		axis: 'Tetthet: alt synlig, direkte redigering',
		winsWhen: 'Du er tallsterk, har lang historikk og vil endre raskt.',
		costs: 'Kan skremme nybegynnere; trangt på telefon.',
		home: '/lab/hovedbok',
		swatch: '#16191d',
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
