/**
 * PROTOTYPE — throwaway. Answers wayfinder ticket #437, "How does a generated
 * week say where it came from?" (map #434). Delete once the answer is folded in.
 *
 * The stub week below is one generated Build week for the seeded athlete's
 * Spring Half Marathon. It is deliberately hand-made rather than read from the
 * database, because the cases the ticket asks about — a lossy translation, an
 * edited-since-generated session, a community session, a session generation
 * refused to produce — cannot exist in the data yet (Plan Generation is retired,
 * ADR 0044, and the Catalogue is unbuilt).
 *
 * The shapes here are a proposal, not schema. They encode three claims:
 *   1. Provenance is asymmetric (434-map.md §3) — a Citation belongs only to a
 *      stock session trainm8 vouches for; a community session gets an
 *      Attribution and an explicit non-vouch, and can never carry a Citation.
 *   2. A lossy translation is a property of the *anchor*, not a confidence
 *      score: the source prescribed one currency, we render another.
 *   3. Editing adopts (workout.server.ts:376) — so the only way an edited
 *      session keeps a citation is if adoption records a lineage instead of
 *      clearing the mark.
 */

export type Discipline = 'run' | 'strength' | 'rest'

/** Structured citation. Non-null only where trainm8 wrote the session. */
export type Citation = {
	author: string
	work: string
	year: number
	locator?: string
}

/** Non-vouched attribution for a community-authored session. */
export type Attribution = {
	handle: string
	savedBy: number
}

/**
 * Where the prescription's number came from when the source prescribed a
 * different currency. The source anchor is what was authored; `shownAs` is the
 * facet derived for this athlete.
 */
export type Translation = {
	sourceAnchor: string
	shownAs: string
	basis: string
}

/** What the athlete changed after generation ran. Adoption's receipt. */
export type Adoption = {
	when: string
	changes: string[]
}

export type Provenance =
	| {
			kind: 'stock'
			source: string
			citation: Citation
			translation?: Translation
	  }
	| { kind: 'convention'; source: string; note: string }
	| { kind: 'shared'; source: string; attribution: Attribution }
	| { kind: 'authored' }
	| { kind: 'unavailable'; reason: string }

export type PrototypeSession = {
	id: string
	weekday: string
	date: string
	title: string
	discipline: Discipline
	target: string | null
	durationMin: number | null
	tss: number | null
	/** Bar heights, 0–1, for the mini structure strip. */
	shape: number[]
	provenance: Provenance
	adoption?: Adoption
	/** Why the generator picked this slot — the week's shape, not the session's source. */
	role: string
}

export type PrototypeWeek = {
	weekNo: number
	weekOf: string
	blockName: string
	blockWeek: string
	/** The season shape the block came from. */
	presetName: string
	presetCitation: Citation
	/** One sentence: what this week is for, inside the block. */
	weekClaim: string
	weekTargets: string
	sessions: PrototypeSession[]
}

export const PROTOTYPE_WEEK: PrototypeWeek = {
	weekNo: 6,
	weekOf: '17–23 Aug',
	blockName: 'Build',
	blockWeek: 'week 2 of 3',
	presetName: 'Classic 3:1 linear',
	presetCitation: {
		author: 'Bompa & Buzzichelli',
		work: 'Periodization: Theory and Methodology of Training',
		year: 2018,
		locator: 'ch. 7',
	},
	weekClaim:
		'First week the threshold work goes to two sessions. Volume holds, quality steps up.',
	weekTargets: '52 km · 5 h 10 · 341 TSS',
	sessions: [
		{
			id: 's1',
			weekday: 'Mon',
			date: '17 Aug',
			title: 'Easy 45 min',
			discipline: 'run',
			target: '5:24/km',
			durationMin: 45,
			tss: 38,
			shape: [0.3, 0.3, 0.3, 0.3, 0.3, 0.3],
			role: 'Recovery between quality days',
			provenance: {
				kind: 'convention',
				source: 'trainm8 stock',
				note: 'Not a named protocol. Easy pace is your own threshold pace through daniels-pace-5.',
			},
		},
		{
			id: 's2',
			weekday: 'Tue',
			date: '18 Aug',
			title: '4 × 8 min @ T-pace',
			discipline: 'run',
			target: '4:09/km',
			durationMin: 62,
			tss: 78,
			shape: [0.3, 0.85, 0.35, 0.85, 0.35, 0.85, 0.35, 0.85, 0.3],
			role: 'Threshold session 1 of 2',
			provenance: {
				kind: 'stock',
				source: "Daniels' T-pace intervals",
				citation: {
					author: 'Jack Daniels',
					work: "Daniels' Running Formula",
					year: 2013,
					locator: '3rd ed., ch. 4',
				},
			},
		},
		{
			id: 's3',
			weekday: 'Wed',
			date: '19 Aug',
			title: 'Rest',
			discipline: 'rest',
			target: null,
			durationMin: null,
			tss: null,
			shape: [],
			role: 'Preset places rest after the first quality day',
			provenance: {
				kind: 'convention',
				source: 'Classic 3:1 linear',
				note: 'The season shape places this, not a workout source.',
			},
		},
		{
			id: 's4',
			weekday: 'Thu',
			date: '20 Aug',
			title: 'Sub-threshold 5 × 6 min',
			discipline: 'run',
			target: '3:35/km',
			durationMin: 58,
			tss: 71,
			shape: [0.3, 0.7, 0.35, 0.7, 0.35, 0.7, 0.35, 0.7, 0.35, 0.7, 0.3],
			role: 'Threshold session 2 of 2',
			provenance: {
				kind: 'stock',
				source: 'Norwegian sub-threshold (double threshold family)',
				citation: {
					author: 'Marius Bakken',
					work: 'The Norwegian Model',
					year: 2021,
				},
				translation: {
					sourceAnchor: 'blood lactate 2.5–3.0 mmol/L',
					shownAs: '3:35/km (92–94 % of your threshold pace)',
					basis: 'coach consensus, not published equivalence',
				},
			},
		},
		{
			id: 's5',
			weekday: 'Fri',
			date: '21 Aug',
			title: 'Strength — not planned',
			discipline: 'strength',
			target: null,
			durationMin: null,
			tss: null,
			shape: [],
			role: 'You train strength on Fridays',
			provenance: {
				kind: 'unavailable',
				reason:
					'No season shape carries a strength segment yet. Nothing was invented to fill the slot.',
			},
		},
		{
			id: 's6',
			weekday: 'Sat',
			date: '22 Aug',
			title: 'Long run 75 min',
			discipline: 'run',
			target: '5:10/km',
			durationMin: 75,
			tss: 68,
			shape: [0.35, 0.4, 0.4, 0.45, 0.45, 0.4, 0.35],
			role: 'Weekly long run, 28 % of week volume',
			provenance: {
				kind: 'stock',
				source: 'Progressive long run',
				citation: {
					author: 'Jack Daniels',
					work: "Daniels' Running Formula",
					year: 2013,
					locator: '3rd ed., ch. 5',
				},
			},
			adoption: {
				when: 'Yesterday',
				changes: ['90 min → 75 min', 'Sunday → Saturday'],
			},
		},
		{
			id: 's7',
			weekday: 'Sun',
			date: '23 Aug',
			title: 'Bakkedrag 8 × 2 min',
			discipline: 'run',
			target: 'RPE 8',
			durationMin: 50,
			tss: 62,
			shape: [0.3, 0.9, 0.3, 0.9, 0.3, 0.9, 0.3, 0.9, 0.3],
			role: 'Hill strength, swapped in by you',
			provenance: {
				kind: 'shared',
				source: 'From the community catalogue',
				attribution: { handle: '@ingridkl', savedBy: 214 },
			},
		},
	],
}

/** Short label for the source mark on a dense row. */
export function sourceMark(p: Provenance): { label: string; tone: string } {
	switch (p.kind) {
		case 'stock':
			return { label: 'cited', tone: 'stock' }
		case 'convention':
			return { label: 'stock', tone: 'convention' }
		case 'shared':
			return { label: 'community', tone: 'shared' }
		case 'authored':
			return { label: 'yours', tone: 'authored' }
		case 'unavailable':
			return { label: 'unavailable', tone: 'unavailable' }
	}
}

export function citationLine(c: Citation): string {
	return `${c.author}, ${c.work} (${c.year}${c.locator ? `, ${c.locator}` : ''})`
}

export function disciplineDot(d: Discipline): string {
	return d === 'run'
		? 'bg-emerald-500'
		: d === 'strength'
			? 'bg-amber-500'
			: 'bg-muted-foreground/40'
}
