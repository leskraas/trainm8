/**
 * Plain-language legends for the Training Load triad (#181).
 *
 * The Dashboard abbreviates the triad as Fit / Fat / Form; these legends are
 * the single source of the first-occurrence explanation for each. The copy is
 * sourced from the CONTEXT.md glossary's canonical definitions — Fitness = CTL
 * (Chronic Training Load), Fatigue = ATL (Acute Training Load), Form = TSB
 * (Training Stress Balance) — so UI copy and the ubiquitous language stay in
 * lockstep. No invented synonyms: change the glossary first, then this file.
 */
export type LoadLegend = {
	/** Compact display label used where space is tight, e.g. "Fit". */
	short: string
	/** Spelled-out accessible name pairing the plain word with its canonical metric. */
	term: string
	/** One-sentence plain-language definition from the CONTEXT.md glossary. */
	description: string
}

export const FITNESS_LEGEND: LoadLegend = {
	short: 'Fit',
	term: 'Fitness (CTL)',
	description:
		'Fitness (CTL, Chronic Training Load): a 42-day weighted average of your daily training stress (TSS) — your accumulated fitness.',
}

export const FATIGUE_LEGEND: LoadLegend = {
	short: 'Fat',
	term: 'Fatigue (ATL)',
	description:
		'Fatigue (ATL, Acute Training Load): a 7-day weighted average of your daily training stress (TSS) — your recent fatigue.',
}

export const FORM_LEGEND: LoadLegend = {
	short: 'Form',
	term: 'Form (TSB)',
	description:
		'Form (TSB, Training Stress Balance): Fitness (CTL) minus Fatigue (ATL). Positive means rested; negative means under load.',
}
