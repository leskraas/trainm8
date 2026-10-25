/**
 * The plan's own words, read on more than one plan surface: open-ended plans and
 * attaching an Event, the philosophy and its switch, the Sesong edits, the
 * strength offer, week roles, rhythms, strength goals, the plan's readings and
 * a stamped session's title. Part of `labels.ts` (ADR 0081): import from the
 * barrel.
 */

// `import type`, for the runtime-leaf reason `labels.ts`'s header gives.
/* eslint-disable import/consistent-type-specifier-style */
import type { RoundVerdict } from '../load/propose-next-round.ts'
import type { AccumulatingCurrency } from '../plan-outline/commensurability.ts'
import type { Rhythm, StrengthGoal, WeekRole } from '../plan-outline/derive.ts'
import type { AttachEventRefusal } from '../plan-outline/open-ended.server.ts'
import type { SwitchPhilosophyRefusal } from '../plan-outline/philosophy.server.ts'
import type { NoContributionReason } from '../plan-outline/planned-load.ts'
import type { PresetFamily } from '../plan-outline/presets.ts'
import type { QualityZone } from '../plan-outline/quality-mix.ts'
import type { ApplySeasonEditRefusal } from '../plan-outline/season-edit.server.ts'
import type { HeldNumber } from '../plan-outline/season-edit.ts'
import type { UnavailableReading } from '../plan-outline/unavailable-readings.ts'
import type {
	ConventionId,
	ThresholdField,
} from '../plan-outline/volume-conversion.ts'
/* eslint-enable import/consistent-type-specifier-style */
import { nbPhaseName } from './first-run.ts'
import { nbSessions } from './sesong.ts'

// ---------------------------------------------------------------------------
// The first run (#505 stories 61–71): plain words, no zone codes
// ---------------------------------------------------------------------------

/**
 * The option that makes a plan with no Event and no end date (#505 story 1,
 * ADR 0079). Norwegian, as the #505 surfaces are (ADR 0081).
 */
export const OPEN_ENDED_PLAN_LABEL = 'Hold meg aktiv'

/**
 * _Hold meg aktiv_'s form on Sesong's plan creation (ADR 0079), and the two
 * questions' messages it shares with the first run (`open-ended-schema.ts`).
 */
export const OPEN_ENDED_FORM_LABELS = {
	intro: (roundWeeks: number) =>
		`Ingen løp og ingen sluttdato. Planen går i blokker på ${roundWeeks} uker, tre som bygger og én lett, og fortsetter blokk for blokk.`,
	alreadyActive: 'Du har allerede en plan uten slutt.',
	openPlan: 'Åpne planen',
	discipline: 'Hva trener du mest?',
	hours: 'Timer i uka',
	hoursFromHistory: 'Snittet ditt de siste 4 ukene. Endre det om du vil.',
	hoursUnmeasured:
		'Vi fant ingen økter å regne fra, så skriv det du har tid til.',
	create: 'Lag planen',
	createFailed: 'Planen kunne ikke lages.',
	disciplineRequired: 'Velg en aktivitet',
	hoursRequired: 'Skriv hvor mange timer i uka',
	hoursPositive: 'Mer enn null timer i uka',
	hoursMax: 'Høyst 40 timer i uka',
} as const

/**
 * The name a round of an open-ended plan is laid with: `Blokk 1`, `Blokk 2`.
 * Only a starting name; a phase's name stays free text the athlete may change
 * (ADR 0079 §2).
 */
export function openEndedRoundName(round: number): string {
	return `Blokk ${round}`
}

/**
 * Where an athlete is in an open-ended plan: the round they are in, counted by
 * phase position and never by name, and no end (#505 story 9).
 */
export function openEndedBlockLabel(round: number): string {
	return `blokk ${round} av ∞`
}

/**
 * Adding an Event to an open-ended plan (#505 stories 7–8, ADR 0079 §4), as
 * the plan page words it. Norwegian, as the #505 surfaces are (ADR 0081).
 */
export const ATTACH_EVENT_LABELS = {
	open: 'Legg til et løp',
	intro:
		'Runden du er i slutter etter denne uka, og planen bygger mot løpet derfra. Ukene du har trent og øktene dine blir stående.',
	choose: 'Velg et løp',
	orNew: 'Eller lag et nytt løp',
	newRace: 'Nytt løp',
	name: 'Navn på løpet',
	date: 'Dato',
	/** The first step: nothing is written until the preview is confirmed. */
	showPreview: 'Vis forhåndsvisning',
	submit: 'Legg til løpet',
	done: 'Planen bygger mot løpet nå',
	pickOne: 'Velg et løp, eller skriv navn og dato for et nytt.',
	notBoth: 'Velg et løp eller lag et nytt – ikke begge.',
	nameMissing: 'Gi løpet et navn.',
	dateMissing: 'Skriv datoen for løpet.',
	previewFirst: 'Se forhåndsvisningen før du legger til løpet.',
	// The preview (#518), in the words of the philosophy switch's.
	preview: 'Forhåndsvisning',
	before: 'Nå',
	after: 'Mot løpet',
	livedStay: 'Ukene du har trent blir stående.',
	aroundYours:
		'Tallene er ukemålene. I uker der du har egne økter, legges appens økter rundt dem.',
} as const

/**
 * The preview's first line (#518): the round being lived ends after this week,
 * at the weeks it keeps — and, when it was meant to run longer, how long.
 */
export function attachEndsSentence(ended: {
	name: string
	weeks: number
	wasWeeks: number
}): string {
	const name = nbPhaseName(ended.name)
	return ended.weeks < ended.wasWeeks
		? `${name} slutter etter denne uka: ${nbWeeks(ended.weeks)} i stedet for ${ended.wasWeeks}.`
		: `${name} slutter etter denne uka, etter ${nbWeeks(ended.weeks)}.`
}

/** `Fra uka som starter 14. jan 2030 bygger planen mot Vårmilen, 10. mar 2030.` */
export function attachTowardSentence(
	fromDate: string,
	eventName: string,
	eventDate: string,
): string {
	return `Fra uka som starter ${fromDate} bygger planen mot ${eventName}, ${eventDate}.`
}

/** Rounds appended but never begun, which the attach removes. */
export function attachRemovedSentence(names: string[]): string | null {
	if (names.length === 0) return null
	const said = names.map(nbPhaseName)
	const list =
		said.length === 1
			? said[0]!
			: `${said.slice(0, -1).join(', ')} og ${said.at(-1)}`
	return `${list} blir ikke kjørt.`
}

/** The athlete's own upcoming sessions the attach keeps, or that there are none. */
export function attachKeptSessionsSentence(count: number): string {
	if (count === 0) {
		return 'Du har ingen egne økter framover. Appen legger øktene mot løpet.'
	}
	return `${nbSessions(count)} du har lagt inn eller endret selv blir stående, og appens økter legges rundt ${count === 1 ? 'den' : 'dem'}.`
}

/** The week table's summary: `Uke for uke · 9 uker`. */
export function attachWeeksSummary(count: number): string {
	return `Uke for uke · ${nbWeeks(count)}`
}

/** Why adding an Event to an open-ended plan was refused, as the athlete reads it. */
export const ATTACH_EVENT_REFUSAL_LABELS: Record<AttachEventRefusal, string> = {
	'outline-not-found': 'Fant ikke planen. Den kan ha fått et løp allerede.',
	'event-not-found': 'Fant ikke det løpet.',
	'event-cancelled': 'Det løpet er avlyst.',
	'event-past': 'Det løpet har allerede vært.',
	'event-already-planned': 'Det løpet har allerede en plan.',
	'event-too-soon':
		'Løpet er denne uka, så det er ingen uker igjen å bygge mot det.',
	'plan-too-long':
		'Løpet er så langt fram at planen ville bli lengre enn to år. Velg et løp innen to år fra planens start.',
	'preview-stale':
		'Planen har endret seg siden forhåndsvisningen. Se over den nye forhåndsvisningen før du legger til løpet.',
}

/**
 * What adding an Event did, in one sentence: the round that ended and the
 * phases laid toward the race.
 */
export function attachedEventSentence(
	ended: { name: string; weeks: number },
	phases: Array<{ name: string; weeks: number }>,
): string {
	const laid = phases
		.map((phase) => `${phase.name} ${nbWeeks(phase.weeks)}`)
		.join(', ')
	return `${ended.name} slutter etter ${nbWeeks(ended.weeks)}. Mot løpet: ${laid}.`
}

/** A count of weeks in Norwegian: `1 uke`, `3 uker`. */
export function nbWeeks(count: number): string {
	return count === 1 ? '1 uke' : `${count} uker`
}

/** "den siste uka" / "de siste 3 ukene" — the weeks a round was graded on. */
function lastWeeks(count: number): string {
	return count === 1 ? 'den siste uka' : `de siste ${count} ukene`
}

/**
 * Why an open-ended plan's next round is the size it is (ADR 0079 §3), in
 * plain Norwegian. `graded` is how many lived weeks the verdict read, and
 * `stepPercent` the step the round is authored at — the capped figure, so the
 * reason states what is made (#584).
 */
export function nextRoundReason(
	verdict: RoundVerdict,
	round: number,
	graded: number,
	stepPercent: number,
	{ autopilot = false }: { autopilot?: boolean } = {},
): string {
	const ended = openEndedRoundName(round)
	const next = openEndedRoundName(round + 1)
	if (autopilot)
		return nextRoundAutopilotReason(verdict, ended, next, graded, stepPercent)
	const same = `Vi foreslår ${next} med like mye trening som ${ended}`
	switch (verdict.kind) {
		case 'done-to-plan':
			// A ramp already at the guard leaves the round no room to step up (#584).
			if (stepPercent <= 0)
				return `${ended} har gått etter planen: ${lastWeeks(graded)} ble gjort som planlagt. ${same}, fordi blokka allerede øker så mye fra uke til uke.`
			return `${ended} har gått etter planen: ${lastWeeks(graded)} ble gjort som planlagt. Vi foreslår ${next} med ca. ${stepPercent} % mer trening. Det er mer belastning, så den legges bare inn hvis du sier ja.`
		case 'missed-weeks':
			return `${verdict.missed} av ${lastWeeks(graded)} ble ikke gjort som planlagt. ${same}, så planen ikke presser deg etter en tung blokk.`
		case 'unmeasured':
			return `${verdict.unmeasured} av ${lastWeeks(graded)} hadde ingen planlagte økter å måle mot, så vi kan ikke si at ${ended} gikk etter planen. ${same}.`
		case 'too-early':
			return `${ended} er for kort til å måle ennå. ${same}.`
	}
}

/**
 * The next round's reason under Autopilot (#576, ADR 0100 §2, amending ADR
 * 0079 §3): the round is appended at the close, so the reason says it is.
 */
function nextRoundAutopilotReason(
	verdict: RoundVerdict,
	ended: string,
	next: string,
	graded: number,
	stepPercent: number,
): string {
	const same = `${next} er lagt inn med like mye trening som ${ended}`
	switch (verdict.kind) {
		case 'done-to-plan':
			// A ramp already at the guard leaves the round no room to step up (#584).
			if (stepPercent <= 0)
				return `${ended} har gått etter planen: ${lastWeeks(graded)} ble gjort som planlagt. ${same}, fordi blokka allerede øker så mye fra uke til uke.`
			return `${ended} har gått etter planen: ${lastWeeks(graded)} ble gjort som planlagt. ${next} er lagt inn med ca. ${stepPercent} % mer trening.`
		case 'missed-weeks':
			return `${verdict.missed} av ${lastWeeks(graded)} ble ikke gjort som planlagt. ${same}, så planen ikke presser deg etter en tung blokk.`
		case 'unmeasured':
			return `${verdict.unmeasured} av ${lastWeeks(graded)} hadde ingen planlagte økter å måle mot, så vi kan ikke si at ${ended} gikk etter planen. ${same}.`
		case 'too-early':
			return `${ended} er for kort til å måle ennå. ${same}.`
	}
}

/**
 * Each Periodization Preset family by the name the athlete picks it by — a
 * _filosofi_ (#505 story 10). Norwegian, as the #505 surfaces are (ADR 0081).
 */
export const PHILOSOPHY_LABELS: Record<PresetFamily, string> = {
	classic: 'Klassisk 3:1',
	masters: 'Masters 2:1',
	'big-base': 'Stor base',
	polarized: 'Polarisert 80/20',
	threshold: 'Terskelfokus',
}

/**
 * What each philosophy is, in a sentence of plain words and no zone codes
 * (#505 stories 10 and 70): the method the athlete is choosing to believe in.
 */
export const PHILOSOPHY_DESCRIPTIONS: Record<PresetFamily, string> = {
	classic:
		'Tre uker der treningen øker, så én lett uke. De harde øktene blir flere og hardere utover sesongen.',
	masters:
		'To uker der treningen øker, så én lett uke. Du får hvile oftere – fint når kroppen trenger lengre tid på å hente seg inn.',
	'big-base':
		'En lang periode med mye rolig trening først. Når de harde øktene kommer, går mengden litt ned.',
	polarized:
		'Det meste går rolig, og litt går veldig hardt. Nesten ingenting i midten – rolig er rolig, og hardt er hardt.',
	threshold:
		'Bygget rundt kontrollert harde økter i tempo og på terskel, to i uka. Ingen helt harde økter.',
}

/** A quality session's kind by its zone, in plain words (#505 story 70). */
export const QUALITY_ZONE_PLAIN_LABELS: Record<QualityZone, string> = {
	3: 'tempo',
	4: 'terskel',
	5: 'veldig hard',
}

/** A Quality Session Mix in plain words: `1 tempo + 1 terskel i uka`. */
export function plainMixSentence(
	mix: ReadonlyArray<{ zone: QualityZone; sessionsPerWeek: number }>,
): string {
	const terms = mix.filter((entry) => entry.sessionsPerWeek > 0)
	if (terms.length === 0) return 'ingen harde økter'
	return `${terms
		.map((e) => `${e.sessionsPerWeek} ${QUALITY_ZONE_PLAIN_LABELS[e.zone]}`)
		.join(' + ')} i uka`
}

/** Switching philosophy on the plan page (#505 stories 12–14). */
export const PHILOSOPHY_SWITCH_LABELS = {
	title: 'Filosofi',
	follows: 'Planen følger',
	/** A plan that records no family and whose phases read as none (audit B4). */
	none: 'Ingen filosofi valgt',
	noneHint:
		'Planen er ikke knyttet til en filosofi. Velg en under «Bytt filosofi» hvis du vil.',
	open: 'Bytt filosofi',
	choose: 'Velg en filosofi',
	intro:
		'Planen endres fra første uke som ikke har begynt. Ukene du har trent og øktene du har skrevet eller endret selv blir stående.',
	showPreview: 'Vis forhåndsvisning',
	preview: 'Forhåndsvisning',
	before: 'Nå',
	after: 'Etter byttet',
	weeks: 'Uke for uke',
	weekColumn: 'Uke',
	cancel: 'Avbryt',
	done: 'Planen følger en ny filosofi',
	pickOne: 'Velg en filosofi.',
	previewFirst: 'Se forhåndsvisningen før du bytter.',
	aroundYours:
		'Tallene er ukemålene. I uker der du har egne økter, legges appens økter rundt dem.',
	ended: 'slutt',
} as const

/** The confirm button: `Bytt til Polarisert 80/20`. */
export function switchToLabel(family: PresetFamily): string {
	return `Bytt til ${PHILOSOPHY_LABELS[family]}`
}

/** The preview's first line: from which week the plan changes, and to what. */
export function philosophyPreviewSentence(
	from: PresetFamily | null,
	to: PresetFamily,
	fromDate: string,
): string {
	const was = from ? `${PHILOSOPHY_LABELS[from]} → ` : ''
	return `${was}${PHILOSOPHY_LABELS[to]} fra uka som starter ${fromDate}.`
}

/** What a switch did, for the toast. */
export function switchedPhilosophySentence(
	to: PresetFamily,
	fromDate: string,
): string {
	return `Planen følger ${PHILOSOPHY_LABELS[to]} fra ${fromDate}. Ukene du har trent og øktene dine står som før.`
}

/** Why a philosophy switch was refused, as the athlete reads it. */
export const PHILOSOPHY_SWITCH_REFUSAL_LABELS: Record<
	SwitchPhilosophyRefusal,
	string
> = {
	'preview-stale':
		'Planen har endret seg siden forhåndsvisningen. Se over den nye forhåndsvisningen før du bytter.',
	'same-family': 'Planen følger allerede den filosofien.',
	'event-too-soon':
		'Det er ingen uker igjen før løpet å legge en ny filosofi inn i.',
	'no-phases': 'Planen har ingen blokker å bytte filosofi på.',
	'outline-not-found': 'Fant ikke planen.',
}

/**
 * A week's role in its phase's rhythm in the #505 surfaces' words: a hard week
 * or an easy one (#505 story 19), and the taper before a race.
 */
export const NB_WEEK_ROLE_LABELS: Record<WeekRole, string> = {
	loading: 'hard uke',
	recovery: 'lett uke',
	taper: 'nedtrapping',
}

/** The Sesong edits on the plan page (#505 stories 72–77). */
export const SEASON_EDIT_LABELS = {
	title: 'Endre sesongen',
	intro:
		'Du ser hver endring før den gjelder. Ukene du har trent og øktene du har skrevet selv blir stående.',
	weekTargetOpen: 'Endre ukemålet',
	phaseOpen: 'Endre navn eller lengde på en fase',
	easyWeekOpen: 'Velg hvilken uke som er lett',
	week: 'Uke',
	track: 'Spor',
	newTarget: 'Nytt ukemål',
	phase: 'Fase',
	phaseName: 'Nytt navn',
	phaseWeeks: 'Antall uker',
	phaseHint: 'La et felt stå tomt for å beholde det som er.',
	easyWeek: 'Lett uke',
	easyWeekHint:
		'Den lette uka flyttes i blokka uka ligger i. De andre blokkene følger rytmen.',
	showPreview: 'Vis forhåndsvisning',
	preview: 'Forhåndsvisning',
	before: 'Nå',
	after: 'Etter endringen',
	weeks: 'Ukene som endres',
	weekColumn: 'Uke',
	apply: 'Bruk endringen',
	done: 'Sesongen er endret',
	warningTitle: 'Raskt opp',
	warningNote:
		'Mer enn 10 % fra én hard uke til den neste er raskt. Det er en tommelfingerregel, ikke en grense, og du kan godkjenne likevel.',
	aroundYours:
		'Tallene er ukemålene. I uker der du har egne økter, legges appens økter rundt dem.',
	ended: 'utenfor planen',
	previewFirst: 'Se forhåndsvisningen før du godkjenner.',
	pickWeek: 'Velg en uke.',
	pickPhase: 'Velg en fase.',
	pickTrack: 'Velg et spor.',
	targetRequired: 'Skriv et ukemål.',
	targetNumber: 'Ukemålet er et tall, 0 eller mer.',
	weeksNumber: 'En fase varer fra 1 til 52 uker.',
	nameTooLong: 'Navnet kan ha opptil 60 tegn.',
	revert: 'Tilbake til planens mål',
	revertHint:
		'Tilbake til planens mål tar bort ukemålet du har satt selv, og uka følger planen igjen.',
	phaseRhythm: 'Rytme',
	phaseTapers: 'Trapper ned',
	keep: 'Som nå',
	yes: 'Ja',
	no: 'Nei',
	editHere: 'Endre i «Endre sesongen»',
	now: 'Nå',
} as const

/**
 * _Avansert_ on Sesong (#505 story 75, ADR 0084 §1): the plan's rules that are
 * outside the four Sesong edits of v1 — a segment's climb and quality mix, a
 * phase's place, a Season Anchor, a lifting block, a shape, the Event fit.
 * They apply directly, and the disclosure says so before it opens.
 */
export const SEASON_ADVANCED_LABELS = {
	title: 'Avansert',
	note: 'Disse endringene gjelder med en gang, uten forhåndsvisning.',
	phaseNote:
		'Stigning, kvalitetsøkter og plassering. Gjelder med en gang, uten forhåndsvisning.',
} as const

/**
 * "Start from a shape" once the plan has begun (#505 stories 14, 75): a shape
 * replaces every phase with no preview, so the page points to the philosophy
 * switch instead, which keeps the weeks lived and previews first.
 */
export const PRESET_GALLERY_LABELS = {
	begun:
		'Planen er i gang, og en ny form ville skrevet over ukene du har trent. Bytt filosofi i stedet: ukene du har trent og øktene dine blir stående, og du ser endringen før den gjelder.',
	switchLink: 'Til Bytt filosofi',
} as const

/** A phase's rhythm in the #505 surfaces' words (#505 story 73). */
export const NB_RHYTHM_LABELS: Record<Rhythm, string> = {
	'3:1': '3:1',
	'2:1': '2:1',
	none: 'uten lett uke',
}

/** A rhythm as a choice in the phase edit: what it means, not just its ratio. */
export const NB_RHYTHM_CHOICE_LABELS: Record<Rhythm, string> = {
	'3:1': '3:1 — tre harde uker, så en lett',
	'2:1': '2:1 — to harde uker, så en lett',
	none: 'Ingen lett uke',
}

/** Why a Sesong edit was refused, as the athlete reads it. */
export const SEASON_EDIT_REFUSAL_LABELS: Record<
	ApplySeasonEditRefusal,
	string
> = {
	'track-not-found': 'Det sporet er ikke lenger en del av planen.',
	'phase-not-found': 'Den fasen er ikke lenger en del av planen.',
	'week-outside-plan': 'Den uka er ikke i planen.',
	'week-lived':
		'Den uka har begynt eller er over. Ukene du har trent står som de ble.',
	'changes-lived-weeks':
		'Det ville endre en uke du allerede har trent. Ukene du har trent står som de ble.',
	'no-easy-week':
		'Den fasen har ingen lett uke å flytte: rytmen har ingen, eller fasen trapper ned.',
	'plan-too-long':
		'Da blir planen lengre enn to år. Gjør en fase kortere først.',
	'no-change': 'Det er det planen allerede sier. Ingenting å endre.',
	'not-hand-set': 'Den uka følger allerede planens mål.',
	'outline-not-found': 'Fant ikke planen.',
	'preview-stale':
		'Planen har endret seg siden forhåndsvisningen. Se over den nye forhåndsvisningen før du godkjenner.',
}

/**
 * The numbers an edit left where they were, as the message names them
 * (#505 story 77): `Fasen og de andre ukene står som før.`
 */
export const HELD_NUMBER_LABELS: Record<HeldNumber, string> = {
	phase: 'fasen',
	'phase-name': 'navnet',
	'phase-length': 'lengden på fasen',
	'other-weeks': 'de andre ukene',
	'week-targets': 'ukemålene',
	'plan-start': 'starten på planen',
	'other-phases': 'de andre fasene',
}

/** `Fasen og de andre ukene står som før.` — empty when nothing is named. */
export function heldSentence(held: readonly HeldNumber[]): string {
	const words = held.map((number) => HELD_NUMBER_LABELS[number])
	if (words.length === 0) return ''
	const list =
		words.length === 1
			? words[0]!
			: `${words.slice(0, -1).join(', ')} og ${words.at(-1)}`
	return `${list.charAt(0).toUpperCase()}${list.slice(1)} står som før.`
}

/** A Sesong edit's headline, with its figures already written out. */
export type SeasonEditWords =
	| {
			kind: 'week-target'
			weekNumber: number
			before: string | null
			after: string | null
			unit: string
			revert: boolean
	  }
	| {
			kind: 'phase'
			name: { before: string; after: string }
			weeks: { before: number; after: number }
			rhythm: { before: Rhythm; after: Rhythm }
			tapers: { before: boolean; after: boolean }
	  }
	| {
			kind: 'easy-week'
			phaseName: string
			weekNumber: number
			previousWeekNumber: number | null
	  }

/**
 * What an edit does, then what it left alone (#505 story 77):
 * `Uke 42: mål 40 → 46 km. Fasen og de andre ukene står som før.`
 */
export function seasonEditSentence(
	words: SeasonEditWords,
	held: readonly HeldNumber[],
): string {
	return [seasonEditHeadline(words), heldSentence(held)]
		.filter(Boolean)
		.join(' ')
}

function seasonEditHeadline(words: SeasonEditWords): string {
	switch (words.kind) {
		case 'week-target': {
			const week = `Uke ${words.weekNumber}`
			if (words.revert) {
				return words.after == null || words.before == null
					? `${week}: tilbake til planens mål.`
					: `${week}: tilbake til planens mål, ${words.before} → ${words.after} ${words.unit}.`
			}
			return words.before == null
				? `${week}: mål ${words.after} ${words.unit}.`
				: `${week}: mål ${words.before} → ${words.after} ${words.unit}.`
		}
		case 'phase': {
			const { name, weeks, rhythm, tapers } = words
			const clauses = [
				...(name.before !== name.after ? [`heter nå «${name.after}»`] : []),
				...(weeks.before !== weeks.after
					? [`varer ${nbWeeks(weeks.after)} (var ${weeks.before})`]
					: []),
				...(rhythm.before !== rhythm.after
					? [
							`går nå ${NB_RHYTHM_LABELS[rhythm.after]} (var ${NB_RHYTHM_LABELS[rhythm.before]})`,
						]
					: []),
				...(tapers.before !== tapers.after
					? [tapers.after ? 'trapper nå ned' : 'trapper ikke lenger ned']
					: []),
			]
			// A length alone reads as the figure it is: `Base: 4 → 6 uker.`
			if (clauses.length === 1 && weeks.before !== weeks.after) {
				return `${name.before}: ${weeks.before} → ${nbWeeks(weeks.after)}.`
			}
			const list =
				clauses.length === 1
					? clauses[0]!
					: `${clauses.slice(0, -1).join(', ')} og ${clauses.at(-1)}`
			return `«${name.before}» ${list}.`
		}
		case 'easy-week':
			return words.previousWeekNumber == null
				? `${words.phaseName}: uke ${words.weekNumber} blir den lette uka.`
				: `${words.phaseName}: den lette uka flyttes fra uke ${words.previousWeekNumber} til uke ${words.weekNumber}.`
	}
}

/**
 * A week target rising more than 10 % over the hard week before it (#505
 * story 76): `Uke 43: 42 → 50 km, +19 % over forrige harde uke.`
 */
export function weekRiseSentence(
	weekNumber: number,
	from: string,
	to: string,
	unit: string,
	rise: number,
): string {
	return `Uke ${weekNumber}: ${from} → ${to} ${unit}, +${Math.round(rise * 100)} % over forrige harde uke.`
}

/** A strength track proposed from the athlete's own lifting (#505 story 15). */
export const STRENGTH_OFFER_LABELS = {
	accept: 'Legg til styrkespor',
	done: 'Styrkesporet er lagt til',
	doneDetail:
		'Det står blant sporene i planen, der du kan endre det eller legge inn styrkeblokker.',
	noHistory:
		'Vi fant ingen styrketrening de siste fire ukene å foreslå et spor fra.',
} as const

/** `Vi ser at du styrketrener ~2 ganger i uka. Legg til et styrkespor?` */
export function strengthOfferSentence(sessionsPerWeek: number): string {
	const times = sessionsPerWeek === 1 ? '1 gang' : `${sessionsPerWeek} ganger`
	return `Vi ser at du styrketrener ~${times} i uka. Legg til et styrkespor?`
}

/** What the offered track is anchored on: `ca. 24 sett i uka de siste 4 ukene`. */
export function strengthOfferDetail(
	setsPerWeek: number,
	windowWeeks: number,
): string {
	return `Sporet starter på ca. ${setsPerWeek} sett i uka, snittet av de siste ${windowWeeks} ukene. Du kan endre det etterpå.`
}

/** A week's role in its phase's rhythm (ADR 0044 §4), as the athlete reads it. */
export const WEEK_ROLE_LABELS: Record<WeekRole, string> = {
	loading: 'Loading',
	recovery: 'Recovery',
	taper: 'Taper',
}

/**
 * The adaptation a strength segment is authored for (ADR 0047 §3), for the picker
 * that authors one.
 *
 * Each **names** the goal and no more — the `%1RM` band and rep range it derives are
 * a separate reading (`plan-outline/strength-goal.ts`), rendered by `format.ts`, and
 * a trigger that spelled the band out would both clip at the 390 px reference
 * viewport (UI conventions §2.5) and read as though the band were authored beside
 * the goal, which is precisely what ADR 0047 forbids.
 *
 * `maximal-strength` reads **Maximal strength**, the field's own term, so the middle
 * value never renders as "strength emphasis: strength" (GLOSSARY.md's _Avoid_ note).
 */
export const STRENGTH_GOAL_LABELS: Record<StrengthGoal, string> = {
	hypertrophy: 'Hypertrophy',
	'maximal-strength': 'Maximal strength',
	power: 'Power',
}

/**
 * The same three goals in their **mid-sentence** register: "outside the 80–100%
 * 1RM that maximal strength works in".
 *
 * A second map for {@link QUALITY_ZONE_LABELS}' reason, and never
 * `STRENGTH_GOAL_LABELS[goal].toLowerCase()` at a call site: lower-casing a label
 * is a *rule about English* applied to a display string, so it silently breaks on
 * any label that carries a proper noun or an initialism, and it puts a second
 * spelling of an athlete-facing word outside this module — the one thing this
 * module exists to prevent. When translation arrives, the two registers are two
 * strings a translator answers, not one string plus a call to `toLowerCase`.
 */
export const STRENGTH_GOAL_SENTENCE_LABELS: Record<StrengthGoal, string> = {
	hypertrophy: 'hypertrophy',
	'maximal-strength': 'maximal strength',
	power: 'power',
}

/**
 * One sentence per **Unavailable Metric** a plan carrying a strength track has to
 * state (ADR 0047 §5), each naming what is missing rather than only that something
 * is.
 *
 * **A sentence each, with its own reason** — never one line over three dashes. The
 * three are Unavailable for three different reasons, and a single "not available"
 * would tell the athlete that something is missing while hiding which of their own
 * data would change it (Unavailable Metric: the reason is the point). The reasons
 * are lifted from `UNAVAILABLE_READINGS`' own doc comment rather than paraphrased,
 * so the surface and the model say the same thing.
 *
 * Typed to the union, so a fourth reading added to `UNAVAILABLE_READINGS` is a
 * compile error here rather than a token that renders as nothing.
 */
export const UNAVAILABLE_READING_LABELS: Record<UnavailableReading, string> = {
	'hours-calendar-cost':
		'What your week costs in hours reads Unavailable — a lifting block says how many sessions a week it asks for, but nothing here stores how long one takes, and your own recorded lifting sessions are too sparse and too watch-dependent to read a median from.',
	'combined-cross-track-load':
		'One training load across both your tracks reads Unavailable — lifting carries no TSS at all, so a combined figure would be a partial sum reading as your whole week.',
	'strength-ctl':
		'Your Fitness, Fatigue and Form read your endurance training only, and your lifting is Unavailable to them by decision — pricing a lifting session as hours × an assumed intensity is a conversion this app will not make, so how the two kinds of fatigue interact is left unmodelled rather than approximated.',
}

/**
 * Why a **Training Track** contributes nothing to a load reading, as a phrase
 * that finishes "… because …".
 *
 * A **mid-sentence register**, like {@link STRENGTH_GOAL_SENTENCE_LABELS}: the
 * reason rides inside a sentence the surface builds around it ("Race-day
 * projection unavailable — no threshold pace is stored for your running"), so a
 * capitalized standalone line would read wrong wherever it lands.
 *
 * Each phrase names **the athlete's own missing datum** wherever there is one, and
 * says what is missing rather than only that something is (Unavailable Metric,
 * ADR 0008): "no threshold pace is stored" tells a runner what to go and enter,
 * where "unavailable" tells them nothing. The two that name no datum are the two
 * where nothing the athlete could enter would change the answer — lifting carries
 * no training load by decision (ADR 0041, ADR 0047 §5).
 *
 * Typed to the union, so a ninth reason is a compile error here rather than a
 * token that renders as nothing.
 */
export const NO_CONTRIBUTION_LABELS: Record<NoContributionReason, string> = {
	'sets-has-no-reading':
		'working sets carry no training load, and never convert into one',
	'not-an-endurance-discipline':
		'lifting carries no training load, and never converts into one',
	'no-zone-recipe': 'no zone system is set for that discipline',
	'no-intensity-source': 'that zone system prices no intensity to read',
	'no-heart-rate-anchor':
		'those zones are read off max HR, and no max HR or threshold HR is stored',
	'no-threshold-pace': 'no threshold pace is stored for that discipline',
	'no-critical-swim-speed': 'no critical swim speed is stored',
	'no-ride-history': 'no recorded rides to read a speed from',
	'no-season-anchor': 'no Season Anchor is in force on that track',
}

/**
 * The documented conventions the **Volume Conversion** stacks, named as
 * conventions and never as measurements (ADR 0040 §13) — a figure read from
 * somewhere, not a body measured.
 *
 * A noun phrase apiece, for a list: "priced through minutes in zone per quality
 * session and the easy-pace ratio".
 */
export const CONVERSION_CONVENTION_LABELS: Record<ConventionId, string> = {
	'minutes-in-zone-per-session': 'minutes in zone per quality session',
	'easy-pace-ratio': 'the easy-pace ratio',
}

/**
 * Why an accumulated **Season Span** may be added up at all — one sentence per
 * **Volume Currency** whose numbers mean the same thing in every Discipline
 * (ADR 0043 §6).
 *
 * Every accumulated figure is marked **derived** and carries one of these, because
 * a derived marker is a promise that a derivation exists and can be shown. There is
 * deliberately no sentence for `km` or `sets`: those never accumulate, so a caller
 * that wanted one would be about to word a claim the domain refuses.
 *
 * The TSS sentence says what the scale *is* rather than what the two disciplines
 * cost, because the equivalence is commensurability by construction and not a
 * measured fact (ADR 0043 §6's honesty caveat). The hours sentence names calendar
 * cost and rules out dose in the same breath, for the same reason.
 */
export const ACCUMULATED_SPAN_LABELS: Record<AccumulatingCurrency, string> = {
	tss: 'Added up across your endurance tracks, because a TSS is the same hour of threshold work whichever of them you spend it in.',
	hours:
		'Added up across your endurance tracks as what the week costs you in time — never as how hard it is.',
}

/**
 * The **Discipline Profile** thresholds the **Volume Conversion** reads, named as
 * the athlete's own stored data rather than by their column names.
 *
 * A mid-sentence register, like {@link NO_CONTRIBUTION_LABELS}: it rides inside
 * the derivation's "from …" clause. Saying **whose** number it is matters — a
 * derivation row that read "thresholdPaceSecPerKm" would be checkable only by
 * someone who reads the schema, and ADR 0045 §10's whole argument for showing the
 * chain is that the athlete can say "no, I run that slower".
 */
export const THRESHOLD_FIELD_LABELS: Record<ThresholdField, string> = {
	thresholdPaceSecPerKm: 'your stored threshold pace',
	cssSecPer100m: 'your stored critical swim speed',
}

/** A phase's loading rhythm — which of its weeks recover (ADR 0044 §4). */
export const RHYTHM_LABELS: Record<Rhythm, string> = {
	'3:1': '3:1 — every 4th week recovers',
	'2:1': '2:1 — every 3rd week recovers',
	none: 'No recovery weeks',
}

/**
 * The same rhythm in a **summary** register: what fits on a phase's one-line
 * summary beside its span and its start date.
 *
 * Two registers rather than one wording flattened, the way `bike` carries a sport
 * and an activity register (`docs/design/ui-conventions.md` §4.1). The full label
 * above teaches the rhythm where the athlete is *choosing* it and has to know what
 * "3:1" does; this one names it where they are only *identifying* a block they
 * already authored, and the explanation would be four words of noise on every card.
 * `none` still says something rather than nothing — an empty tail would read as a
 * phase whose rhythm is missing rather than one that has no recovery week.
 */
export const RHYTHM_SUMMARY_LABELS: Record<Rhythm, string> = {
	'3:1': '3:1',
	'2:1': '2:1',
	none: 'No recovery',
}

// ---------------------------------------------------------------------------
// Why a Block Boundary Step is not one the walk applies (ADR 0040 §5)
// ---------------------------------------------------------------------------

/**
 * The three ways a **Block Boundary Step** can be out of force, as the two surfaces
 * that author one read them: the season's own opening block, a block no **Season
 * Anchor** reaches yet, and a block an anchor restarts on.
 *
 * Declared here rather than imported from a schema, unlike every other union above,
 * because no stored column carries it — these are three states of the athlete's own
 * plan, worked out from the anchors by `boundaryStepInForce` and its strength twin.
 * Those two stay **booleans** in `derive.ts`, where the arithmetic wants a boolean;
 * *which* of the three a `false` means is a reading, and readings are worded here.
 *
 * `season-opens` is the endurance side's alone: phases are contiguous, so the first
 * one holds the anchor, while a lifting block is dated and can open the season with
 * an anchor sitting behind it (ADR 0047 §6). It is still worded beside the other two
 * rather than alone in the file that happens to use it, so the set reads at once.
 */
export type BoundaryStepOutOfForce =
	| 'season-opens'
	| 'no-anchor-yet'
	| 'anchor-opens-here'

/**
 * One sentence per reason, each naming the state of the plan that produced it.
 *
 * **A sentence each, never one line for all three.** They are three different
 * situations with three different edits that would change them, and a single "no
 * step here" would tell the athlete that a field is missing while hiding which of
 * their own authoring would bring it back (Unavailable Metric: the reason is the
 * point). `no-anchor-yet` says the opening reads Unavailable, because that is what
 * the week grid beside it prices those weeks at.
 *
 * Shared by the phase editor and the lifting-block editor, which is why they live
 * here at all: one situation said two ways is two situations to the person reading,
 * and the two surfaces had drifted into wording the *same* state with one sentence
 * and no state at all with the other.
 */
export const BOUNDARY_STEP_OUT_OF_FORCE_LABELS: Record<
	BoundaryStepOutOfForce,
	string
> = {
	'season-opens': 'Your season opens here, so there is no boundary to step at.',
	'no-anchor-yet':
		'No Season Anchor covers this block yet, so its opening reads Unavailable — there is no level for a step to move.',
	'anchor-opens-here':
		'Your anchor takes effect on the week this block opens, so that number is what it opens at — there is nothing for a step to step from.',
}

/**
 * What a session the plan lays is called (`stampedSessionTitle`): its kind,
 * then the sport — `Rolig økt · Løping`, `Terskeløkt · Sykling`. The first
 * run's two-week preview reads the same words, so what it shows is what lands
 * on I dag. Stored as the new Workout's title (the athlete can rename it);
 * sessions laid before round 2 keep the duration title they were given.
 */
export const STAMPED_SESSION_LABELS = {
	easy: 'Rolig økt',
	long: 'Langtur',
	/** A long swim is not a _tur_. */
	longSwim: 'Lang økt',
	zone: {
		3: 'Tempoøkt',
		4: 'Terskeløkt',
		5: 'Intervalløkt',
	},
	/** The hard sessions of a week, as the first run's plan names them. */
	zoneShort: {
		3: 'tempo',
		4: 'terskel',
		5: 'intervaller',
	},
} as const
