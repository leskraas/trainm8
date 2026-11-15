/**
 * The engine's boundary into Norwegian. The domain underneath still speaks
 * English in a few places — preset phase names, zone recipe captions, the
 * strength resolver's sentences, `1 h 30 min` — and the classic app translates
 * those at its own surfaces. The Lab Engine translates them here, once, so no
 * app built on it ever shows an English word the athlete did not write.
 *
 * What the athlete (or whoever wrote a session) typed is never touched: titles,
 * notes, descriptions and phase names they chose stay as written. Only the
 * engine's own vocabulary and the shipped presets' names are translated.
 *
 * Pure and client-safe.
 */
import { formatNbKg } from '#app/utils/format.ts'
import { nbPhaseName } from '#app/utils/labels/first-run.ts'
import { MEG_ZONE_RECIPE_LABELS } from '#app/utils/labels/meg.ts'
import { TOKEN_SENTENCE_WORDS as WORDS } from '#app/utils/labels/token-sentence.ts'
import { nbZoneCaption } from '#app/utils/labels/vocabulary.ts'
import { type LoadResolution } from '#app/utils/strength/anchors.ts'
import { type LoadValue } from '#app/utils/strength-log.ts'
import { type LoadTarget } from '#app/utils/workout-schema.ts'

export { nbPhaseName, nbZoneCaption }

/** A zone recipe's name, in Norwegian where the recipe is a shipped one. */
export function nbRecipeName(id: string, name: string): string {
	return MEG_ZONE_RECIPE_LABELS[id] ?? name
}

/**
 * A block's name, when it is one of the structural words a plan, a template or
 * an import writes in English (`Warm-up`, `Main set`, `Cool-down` …). A cool-down
 * on a run is a `Nedjogg`; on anything else a `Nedkjøling`. A name that is not
 * one of these is the author's own and stays as written.
 */
export function nbBlockName(
	name: string | null,
	discipline: string | null,
): string | null {
	if (name == null) return null
	const key = name
		.trim()
		.toLowerCase()
		.replace(/[\s_-]+/g, ' ')
	const cool = discipline === 'run' ? 'Nedjogg' : 'Nedkjøling'
	const words: Record<string, string> = {
		'warm up': 'Oppvarming',
		warmup: 'Oppvarming',
		main: 'Hoveddel',
		'main set': 'Hoveddel',
		mainset: 'Hoveddel',
		'main block': 'Hoveddel',
		work: 'Hoveddel',
		'cool down': cool,
		cooldown: cool,
		intervals: 'Intervaller',
		interval: 'Intervaller',
		circuit: 'Sirkel',
		drills: 'Drill',
		strides: 'Stigningsløp',
		rest: 'Pause',
		recovery: 'Restitusjon',
		strength: 'Styrke',
		'pre set': 'Forberedelse',
		'build up': 'Oppbygging',
	}
	return words[key] ?? name
}

/** `1 h 30 min` → `1 t 30 min`: hours as a Norwegian reads them. */
export function nbHours(text: string): string {
	return text.replace(/(\d)\s?h\b/g, '$1 t')
}

/** A logged or remembered load, as the athlete reads it. */
export function nbLoadValueText(load: LoadValue): string {
	switch (load.kind) {
		case 'external':
			return `${formatNbKg(load.kg)} kg`
		case 'perSide':
			return `${load.sides} × ${formatNbKg(load.kg)} kg`
		case 'bodyweight':
			return WORDS.bodyweight
		case 'bodyweightPlus':
			return WORDS.bodyweightPlus(formatNbKg(load.addedKg))
		case 'assisted':
			return WORDS.bodyweightMinus(formatNbKg(load.assistKg))
		case 'stackLevel':
			return load.label ?? `nivå ${load.level}`
		case 'band':
			return `${load.band} strikk`
		case 'unloaded':
			return 'uten vekt'
	}
}

/** Why a prescribed load gives no kilos, and what would fix it — in Norwegian. */
export function nbLoadUnavailable(
	resolution: Extract<LoadResolution, { kind: 'unavailable' }>,
): { why: string; fix: string } {
	const target: LoadTarget = resolution.authored
	switch (resolution.reason) {
		case 'no-anchor':
			return target.kind === 'repMax'
				? {
						why: `Ingen ${target.reps}RM registrert for øvelsen.`,
						fix: `Registrer den tyngste vekten du klarer nøyaktig ${target.reps} repetisjoner med. Den regnes ikke om fra et annet antall.`,
					}
				: {
						why: 'Ingen 1RM registrert for øvelsen.',
						fix: 'Registrer en 1RM for øvelsen, eller la den bli lest fra et sett du allerede har ført.',
					}
		case 'no-bodyweight':
			return {
				why: 'Ingen kroppsvekt registrert.',
				fix: 'Legg inn kroppsvekten din, så blir denne lasten til kilo.',
			}
		case 'not-resolvable':
			return target.kind === 'velocity'
				? {
						why: 'Et fartsmål for stanga kan ikke regnes om til kilo.',
						fix: 'Fart krever en sensor. Før settet og skriv inn farten selv.',
					}
				: {
						why: 'Hjelpen er tyngre enn deg, så dette kan ikke være en last.',
						fix: 'Sett hjelpen lavere enn kroppsvekten din.',
					}
	}
}

/**
 * The domain's English sentences about a warm-up ramp or a plate load that
 * cannot be made, by their exact words. Anything not listed passes through
 * (the English-words test catches a new one).
 */
const STRENGTH_SENTENCES: Record<string, string> = {
	'The work weight is the empty bar, so there is nothing to ramp up to.':
		'Arbeidsvekten er den tomme stanga, så det er ingenting å varme opp mot.',
	'No warm-up ramp is published for this equipment, so none is generated.':
		'Det finnes ingen oppvarmingsstige for dette utstyret.',
	'A stack level has no kilos — this progresses against itself only.':
		'Et nivå på stabelen har ingen kilo.',
	'A band has no kilos — its force changes through the range.':
		'Et strikk har ingen kilo.',
	'This movement carries no external load.': 'Øvelsen har ingen ekstra last.',
	'No bodyweight on file, so this load has nothing to resolve against.':
		'Ingen kroppsvekt registrert.',
	'That is more help than the athlete weighs, which cannot be a load.':
		'Mer hjelp enn kroppsvekten din.',
	'This gym has not said which dumbbells it has, so there is no bell to pick.':
		'Senteret har ikke sagt hvilke manualer det har.',
	'This gym’s dumbbell rack is stated as empty.':
		'Senteret har ingen manualer.',
}

/** A strength sentence from the domain, in Norwegian when it is one we know. */
export function nbStrengthSentence(text: string | null): string | null {
	if (text == null) return null
	return STRENGTH_SENTENCES[text] ?? text
}
