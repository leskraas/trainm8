/**
 * Plan (Sesong, `/training/plan`) in Norwegian (ADR 0081, ADR 0090): the page,
 * its lead, notices, every editor and every refusal its action words, the
 * chart under Avansert, and _Dagene i uka_. Part of `labels.ts` (ADR 0081):
 * import from the barrel.
 */

// `import type`, for the runtime-leaf reason `labels.ts`'s header gives.
/* eslint-disable import/consistent-type-specifier-style */
import type { AccumulatingCurrency } from '../plan-outline/commensurability.ts'
import type { ClashReason } from '../plan-outline/day-rule.ts'
import type {
	StrengthGoal,
	VolumeCurrency,
	WeekRole,
} from '../plan-outline/derive.ts'
import type { NoContributionReason } from '../plan-outline/planned-load.ts'
import type { PresetFamily } from '../plan-outline/presets.ts'
import type { QualityZone } from '../plan-outline/quality-mix.ts'
import type { UnavailableReading } from '../plan-outline/unavailable-readings.ts'
import type {
	ConventionId,
	ThresholdField,
} from '../plan-outline/volume-conversion.ts'
import type {
	PatternDayKind,
	PatternWeekday,
} from '../plan-outline/week-pattern.ts'
/* eslint-enable import/consistent-type-specifier-style */
import { capitalize, nbJoin } from './_helpers.ts'
import {
	START_OPTION_LABELS,
	START_SIMPLE_ACTIVITY_LABELS,
} from './first-run.ts'
import { nbDisciplineLabel } from './i-dag.ts'
import { type BoundaryStepOutOfForce, nbWeeks } from './plan-domain.ts'
import { NB_WEEKDAY_LABELS } from './vocabulary.ts'

/**
 * Where "+ Ny"'s other two ways in went (owner decision 6): I dag's top line
 * creates sessions only, and a race or a plan is started from Sesong.
 */
export const SESONG_ENTRY_LABELS = {
	newEvent: 'Nytt løp',
	newPlan: 'Ny plan',
	group: 'Start noe nytt',
} as const

// ---------------------------------------------------------------------------
// Sesong: the plan page (`/training/plan`) in Norwegian (ADR 0081, round 2,
// ADR 0090). The hero, the season picture, the readings, the chart under
// Avansert, every editor on the page and every refusal its action words. The
// English maps above stay for the surfaces that still read them (plan
// creation, the catalogue); this page reads only what is below and the #505
// words already above (PHILOSOPHY_*, SEASON_EDIT_*, SEASON_EVENTS_*).
// ---------------------------------------------------------------------------

/** A weekly figure's unit on Sesong: `55 km/uke`, `5,8 t/uke`, `18 sett/uke`. */
export const NB_WEEKLY_UNITS: Record<VolumeCurrency, string> = {
	km: 'km/uke',
	hours: 't/uke',
	tss: 'TSS/uke',
	sets: 'sett/uke',
}

/** The unit a track is planned in, spelled out for a picker. */
export const NB_VOLUME_CURRENCY_LABELS: Record<VolumeCurrency, string> = {
	km: 'Kilometer i uka',
	hours: 'Timer i uka',
	tss: 'TSS i uka',
	sets: 'Arbeidssett i uka',
}

/** A quality session's zone, mid-sentence: `2× terskel + 1× VO₂maks`. */
export const NB_QUALITY_ZONE_LABELS: Record<QualityZone, string> = {
	3: 'tempo',
	4: 'terskel',
	5: 'VO₂maks',
}

/** What a lifting block is for (ADR 0047 §3). */
export const NB_STRENGTH_GOAL_LABELS: Record<StrengthGoal, string> = {
	hypertrophy: 'Muskelvekst',
	'maximal-strength': 'Maksimal styrke',
	power: 'Eksplosivitet',
}

/** The same goals mid-sentence: `… som maksimal styrke trener i`. */
export const NB_STRENGTH_GOAL_SENTENCE_LABELS: Record<StrengthGoal, string> = {
	hypertrophy: 'muskelvekst',
	'maximal-strength': 'maksimal styrke',
	power: 'eksplosivitet',
}

/** A Week Pattern day's kind (ADR 0044 §7). */
export const NB_PATTERN_DAY_KIND_LABELS: Record<PatternDayKind, string> = {
	fixed: 'Fast økt',
	share: 'Andel av uka',
}

/** A Week Pattern weekday, Monday-first, capitalised as a row starts it. */
export const NB_PATTERN_WEEKDAY_LABELS = Object.fromEntries(
	NB_WEEKDAY_LABELS.map((name, weekday) => [
		weekday,
		name[0]!.toUpperCase() + name.slice(1),
	]),
) as Record<PatternWeekday, string>

/**
 * A Training Track's name on Sesong: the sport, in Norwegian, or _Enkle
 * aktiviteter_ for the track on `other` (#572).
 */
export function nbTrackName(discipline: string): string {
	return discipline === 'other'
		? START_SIMPLE_ACTIVITY_LABELS.track
		: nbDisciplineLabel(discipline)
}

/**
 * What a strength plan cannot state (ADR 0047 §5), one sentence each with its
 * reason, as `UNAVAILABLE_READING_LABELS` says it in English.
 */
export const NB_UNAVAILABLE_READING_LABELS: Record<UnavailableReading, string> =
	{
		'hours-calendar-cost':
			'Hva uka koster i timer kan ikke regnes ut. En styrkeblokk sier hvor mange økter den ber om i uka, men ingenting her lagrer hvor lang en økt er, og styrkeøktene du har registrert er for få og for avhengige av klokka til å lese et snitt fra.',
		'combined-cross-track-load':
			'Én samlet belastning for begge sporene kan ikke regnes ut. Styrketrening har ingen TSS, så et samlet tall ville vært en delsum som ser ut som hele uka.',
		'strength-ctl':
			'Formkurven leser bare utholdenhetstreningen din. Styrken er holdt utenfor med vilje: å prise en styrkeøkt som timer × en antatt intensitet er en omregning appen ikke gjør, så hvordan de to slags trøtthet virker sammen er ikke modellert.',
	}

/** Why a track feeds no load, finishing "… fordi …" (ADR 0045 §6). */
export const NB_NO_CONTRIBUTION_LABELS: Record<NoContributionReason, string> = {
	'sets-has-no-reading':
		'arbeidssett har ingen belastning, og regnes aldri om til en',
	'not-an-endurance-discipline':
		'styrketrening har ingen belastning, og regnes aldri om til en',
	'no-zone-recipe': 'ingen sonemodell er satt for den sporten',
	'no-intensity-source': 'sonemodellen gir ingen intensitet å lese',
	'no-heart-rate-anchor':
		'sonene leses av makspuls, og verken makspuls eller terskelpuls er lagret',
	'no-threshold-pace': 'ingen terskelfart er lagret for den sporten',
	'no-critical-swim-speed': 'ingen kritisk svømmefart er lagret',
	'no-ride-history': 'ingen registrerte sykkeløkter å lese en fart fra',
	'no-season-anchor': 'sporet har ikke noe startnivå',
}

/** The conventions the Volume Conversion stacks, as conventions (ADR 0040 §13). */
export const NB_CONVERSION_CONVENTION_LABELS: Record<ConventionId, string> = {
	'minutes-in-zone-per-session': 'minutter i sonen per kvalitetsøkt',
	'easy-pace-ratio': 'forholdet mellom rolig fart og terskelfart',
}

/** The stored thresholds the conversion reads, as the athlete's own. */
export const NB_THRESHOLD_FIELD_LABELS: Record<ThresholdField, string> = {
	thresholdPaceSecPerKm: 'terskelfarten du har lagret',
	cssSecPer100m: 'den kritiske svømmefarten du har lagret',
}

/** Why an accumulated Season Span may be added up at all (ADR 0043 §6). */
export const NB_ACCUMULATED_SPAN_LABELS: Record<AccumulatingCurrency, string> =
	{
		tss: 'Lagt sammen på tvers av utholdenhetssporene, fordi en TSS er den samme timen med terskelarbeid uansett hvilket spor den brukes i.',
		hours:
			'Lagt sammen på tvers av utholdenhetssporene som det uka koster i tid – aldri som hvor hard den er.',
	}

/** Why a Block Boundary Step is not one the walk applies (ADR 0040 §5). */
export const NB_BOUNDARY_STEP_OUT_OF_FORCE_LABELS: Record<
	BoundaryStepOutOfForce,
	string
> = {
	'season-opens':
		'Sesongen starter her, så det er ingen blokkgrense å hoppe ved.',
	'no-anchor-yet':
		'Ingen startnivå dekker denne blokka ennå, så starten kan ikke regnes ut – det er ikke noe nivå å hoppe fra.',
	'anchor-opens-here':
		'Startnivået ditt gjelder fra uka denne blokka starter, så blokka starter på det tallet – det er ikke noe å hoppe fra.',
}

/** A week's role in its rhythm, capitalised for a table cell. */
export const NB_WEEK_ROLE_CELL_LABELS: Record<WeekRole, string> = {
	loading: 'Hard uke',
	recovery: 'Lett uke',
	taper: 'Nedtrapping',
}

/** `Uke 33–36`, or `Uke 33` — a span of ISO weeks. */
export function isoWeekSpanLabel(from: number, to: number): string {
	return from === to ? `Uke ${from}` : `Uke ${from}–${to}`
}

/** `1 økt`, `3 økter`. */
export function nbSessions(count: number): string {
	return count === 1 ? '1 økt' : `${count} økter`
}

/** `1 dag`, `4 dager`. */
export function nbDays(count: number): string {
	return count === 1 ? '1 dag' : `${count} dager`
}

/** The page itself: its title, hero, picture, readings and summary card. */
export const SESONG_PAGE_LABELS = {
	metaTitle: 'Plan | Trainm8',
	heroToward: 'Du bygger mot',
	heroChange: 'Endre løpet',
	/** `24. okt 2026 · 10 uker fra 10. aug 2026`. */
	heroMeta: (eventDate: string, weeks: number, from: string) =>
		`${eventDate} · ${nbWeeks(weeks)} fra ${from}`,
	/** An open-ended plan's hero: no race, no end, and it carries on. */
	openEndedMeta: (from: string) =>
		`Ingen løp og ingen sluttdato · fra ${from} · fortsetter`,
	resting:
		'Planen hviler mens planen mot løpet ditt er i gang. Den tar over igjen når løpet er over.',
	restingLink: 'Åpne løpsplanen',
	restingElsewhere: 'Hold meg aktiv-planen din hviler mens denne går.',
	restingElsewhereLink: 'Åpne den',
	pictureTitle: 'Sesongen',
	pictureHint: 'Trykk på en uke for å endre ukemålet.',
	pictureBegunHint: 'Uker som har begynt, er historikk.',
	/** Under the last row of an open-ended plan: it does not stop there. */
	continues: 'fortsetter',
	continuesNote: 'Neste blokk legges til når denne er ferdig.',
	pendingRound: 'Neste blokk venter på svar',
	pendingRoundNote: (name: string) =>
		`${name} er foreslått i Ukeskiftet. Svar der, så legges blokka inn.`,
	pendingRoundLink: 'Til Ukeskiftet',
	readings: 'Visning',
	blocks: 'Blokker',
	weeks: 'Uker',
	summaryTitle: 'Hva planen består av',
	derived: 'Utledet',
	/** `Løping · Styrke`. */
	spanTracks: (names: string[]) => names.join(' · '),
	spanNote: (peakWeek: number | null, several: boolean) =>
		`Fra der du starter til den tyngste harde uka${peakWeek == null ? '' : `, uke ${peakWeek}`} · regnet ut fra ${several ? 'startnivåene' : 'startnivået'} og stigningen, aldri lagt sammen fra økter`,
	spanTotal: (total: string) => ` · ${total} over hele sesongen`,
	fitEnds: 'Planen slutter i uka for løpet.',
	fitBefore: (weeks: number) =>
		`Planen slutter ${nbWeeks(weeks)} før uka for løpet.`,
	fitPast: (weeks: number) =>
		`Planen går ${nbWeeks(weeks)} forbi uka for løpet.`,
	cannotTellTitle: 'Hva planen ikke kan si',
	cannotTellDetail: 'Tall som mangler, og hvorfor.',
	fillTitle: 'Fyll ukene',
	fillIntro:
		'Ukene fylles av seg selv fra den typiske uka di, en uke av gangen etter hvert som horisonten når dem. Kopier en uke du likte hvis du vil ha den igjen.',
	fillWaiting:
		'Ukene fylles fra den typiske uka di. Lag den, så legges øktene inn opp til horisonten.',
	fillFilled: (weeks: number, total: number) =>
		`${weeks} av ${nbWeeks(total)} har økter i kalenderen. Resten fylles når horisonten når dem.`,
	patternTitle: 'Den typiske uka di',
	patternEmpty: 'Lag uka du vanligvis trener, så fylles ukene fra den.',
	copyTitle: 'Kopier uke',
	copyDetail: 'Tar med øktene i en uke slik du skrev dem, uten mønster.',
	advancedChart: 'Sesongdiagram',
	advancedChartDetail:
		'Lag for fart, form, rytme og stigning, og regnestykket bak hver uke.',
	shapeTitle: 'Start fra en form',
	shapeDetail:
		'Ferdige former for sesongen, tegnet som belastningen de gir. En form erstatter blokkene dine.',
	anchorsTitle: 'Startnivå',
	liftingTitle: 'Styrkeblokker',
	addPhaseTitle: 'Legg til en fase',
	addPhaseDetail:
		'En ny fase der du vil ha den. Uka planen starter i flytter seg aldri.',
	deleteTitle: 'Slett planen',
	deleteDetailEvent: 'Løpet og øktene du har trent blir stående.',
	deleteDetail: 'Øktene du har trent blir stående.',
	phasesList: 'Faser',
	weeksList: 'Treningsuker',
	weekByWeek: 'Uke for uke',
	weekCount: (count: number) => nbWeeks(count),
	unavailable: 'Utilgjengelig',
	noLifting: 'Ingen styrke',
	deload: 'Avlastning',
	handSet: 'Satt selv',
	handSetNoRule: 'Satt selv. Regelen har ikke noe tall for denne uka.',
	handSetRule: (figure: string) => `Satt selv. Regelen gir ${figure}.`,
	weeksFootnote:
		'Åpne en uke for å endre ukemålet i Endre sesongen, der du ser endringen før den gjelder. Et ukemål du setter selv er ukas endelige tall – uten lett uke eller nedtrapping oppå – og gjelder bare den uka: resten av sesongen følger startnivået og stigningen. 0 er en uke uten trening, og det er en plan, ikke et hull.',
	unpricedTrack: (track: string) =>
		`${track}: ukene kan ikke regnes ut – ingen startnivå dekker planen ennå.`,
	deloadFootnote:
		'Avlastning er slutten på en styrkeblokk. Den kommer fra ukene du ga blokka, og rytmen i fasene når den ikke. Den kan derfor lande en annen uke enn en lett uke i planen – det er det en datert blokk er til for.',
	mixNoticesTitle: 'Uker som avviker fra kvalitetsøktene',
	/** `Uke 42 · løping · planen ber om 2 terskeløkter, uka har 1`. */
	mixDisagreement: (zone: string, authored: number, stamped: number) =>
		`planen ber om ${authored} ${zone}${authored === 1 ? 'økt' : 'økter'}, uka har ${stamped}`,
	mixNoticesNote:
		'Kvalitetsøktene sier hva blokka er til for; øktene er hva uka faktisk inneholder. Å bytte en hard økt mot en rolig i en sliten uke er en plan, ikke en feil – ingenting her er endret.',
} as const

/**
 * What _Plan_ leads with (ADR 0101 §2, #558 S9): the plan's plain name — the
 * Start Options' own words, so the plan reads as the card the athlete picked —
 * its family small, the curve, the next easy week, then a closed _Avansert_
 * holding the rest of the old Sesong page.
 */
export const PLAN_LEAD_LABELS = {
	/**
	 * Each family's plain name. The four the start offers are the cards' own
	 * (`START_OPTION_LABELS.plain`); _Masters 2:1_ is reached only through
	 * _Avansert_, so it gets a plain name in the same voice here.
	 */
	plainName: {
		polarized: START_OPTION_LABELS.plain.polarized.name,
		threshold: START_OPTION_LABELS.plain.threshold.name,
		classic: START_OPTION_LABELS.plain.classic.name,
		'big-base': START_OPTION_LABELS.plain['big-base'].name,
		masters: 'Kortere blokker, mer hvile',
	} satisfies Record<PresetFamily, string>,
	/** A plan whose phases follow no family: authored by hand. */
	ownPlan: 'Din egen plan',
	/** The family, small: the card's own `Fagnavn: …`. */
	familyName: START_OPTION_LABELS.familyName,
	/** `Mot Oslo Maraton`: the race the plan builds toward. */
	toward: 'Mot',
	nextEasyWeek: (week: number, from: string) =>
		`Neste lette uke er uke ${week}, fra ${from}.`,
	thisWeekEasy: 'Denne uka er en lett uke.',
	advanced: 'Avansert',
	advancedDetail:
		'Filosofi, ukemål, faser, treningsspor, den typiske uka og sesongdiagrammet.',
	/** No plan yet: Plan invites to the start, as I dag does (ADR 0101 §4). */
	noPlanTitle: 'Du har ingen plan ennå',
	noPlanBody:
		'Svar på noen få spørsmål, så legger appen opp ukene for deg. Under kan du sette opp sesongen selv.',
	noPlanAction: 'Kom i gang',
} as const

/**
 * _Bytt treningsform_ in Plan's lead (ADR 0101 §2, #581): the **Start
 * Options** again, laid for the plan's tracks and days, and picking one
 * through the philosophy switch's preview. The cards' own words are
 * `START_OPTION_LABELS`'.
 */
export const TRENINGSFORM_LABELS = {
	open: 'Bytt treningsform',
	/** The closed row's line: what is inside. */
	detail: 'Se måtene å trene på igjen, lagt for ukene dine',
	intro: (count: number, hours: string, days: number, from: string) =>
		`${count === 1 ? 'Det er' : 'Hver er'} en ekte uke med ${hours} på ${days} ${days === 1 ? 'dag' : 'dager'}, fra uka som starter ${from}. Du ser hva som endres før noe skjer.`,
	/** The current family's badge, and what stands where its button would. */
	current: 'Nå',
	currentNote: 'Planen følger denne nå.',
	/** The plan follows a family the options do not show (Masters, or merged). */
	currentNotShown: (family: string) =>
		`Planen følger ${family} nå, som ikke er blant måtene her. Alle filosofiene finner du under Avansert.`,
	/** An athlete from before the simple start, who never said a level. */
	levelUnsaid:
		'Du har ikke valgt nivå, så måtene er lagt som for en mosjonist. Nivået velger du i Meg.',
	/** The confirm under the preview: `Bytt til Mest rolig, litt veldig hardt`. */
	switchTo: (name: string) => `Bytt til ${name}`,
	done: 'Planen har ny treningsform',
	switched: (name: string, from: string) =>
		`Planen er nå «${name}» fra ${from}. Ukene du har trent og øktene dine står som før.`,
} as const

/** The ramp guard, the availability check and the load band (ADR 0040 §12–13). */
export const SESONG_NOTICE_LABELS = {
	dismiss: (name: string) => `Lukk ${name}`,
	dismissed: (name: string) =>
		`${name[0]!.toUpperCase()}${name.slice(1)} er lukket. Den kommer tilbake hvis det den sier endrer seg.`,
	rampName: 'merknaden om stigning',
	availabilityName: 'merknaden om treningsdager',
	bandName: 'merknaden om belastning',
	aBlock: 'En blokk',
	rampRate: (rate: string) => `stiger ${rate} per harde uke`,
	stepRate: (rate: string) => `hopper ${rate} ved starten`,
	rampLifting: (track: string, rate: string, phase: string) =>
		`${track} ${rate}, i blokka som starter i ${phase}.`,
	rampPhase: (phase: string, rate: string) => `${phase} ${rate}.`,
	rampNote: (rate: string) =>
		`Vanlig praksis er ${rate} – per harde uke for stigning, og på én gang for et hopp ved start. Mer enn det er uvanlig, ikke farlig: ingen volumregel er vist å forebygge skader, så dette er en merknad og ikke en grense. Tallene dine er lagret slik du skrev dem.`,
	rampLiftingNote:
		' En styrkeblokk er datert og ikke knyttet til en fase, så fasen som nevnes ved en slik blokk er bare der den første uka faller.',
	daysAsk: (span: string, single: boolean, sessions: string, days: number) =>
		`${span} ${single ? 'ber' : 'ber'} om ${sessions} i uka, og du kan trene ${nbDays(days)} i uka.`,
	hoursAsk: (span: string, single: boolean, peak: string, capacity: string) =>
		`${span} ber om ${single ? '' : 'opptil '}${peak} utholdenhetstrening, og kapasiteten din er ${capacity}.`,
	bothChecks:
		'Det er to ulike sammenligninger – økter mot dagene du trener, og timer mot kapasiteten du har satt – og en uke kan bomme på den ene uten den andre. ',
	daysCheck: 'Det er dager mot dager: økter mot dagene du trener. ',
	hoursCheck:
		'Det er timer mot timer: timene utholdenhetsukene blir til, mot kapasiteten du har satt. ',
	fitNote:
		'Det kan være akkurat det du mente: to økter kan dele en dag, og begge tallene er innstillinger, ikke fakta om uka di. Planen er lagret slik du skrev den.',
	/**
	 * One day clash (ADR 0104 §6), the day named: `Styrke og en hard økt på
	 * tirsdag`, `To harde dager etter hverandre (onsdag–torsdag)`. Takes the
	 * Monday-first weekday; a two-day reason runs to the next day on the wheel.
	 */
	dayClash: (reason: ClashReason, weekday: number) => {
		const day = NB_WEEKDAY_LABELS[weekday % 7]!
		const pair = `${day}–${NB_WEEKDAY_LABELS[(weekday + 1) % 7]!}`
		switch (reason) {
			case 'lifting-on-hard-day':
				return `Styrke og en hard økt på ${day}`
			case 'lifting-before-hard-day':
				return `Styrke dagen før en hard økt (${pair})`
			case 'lifting-on-long-day':
				return `Styrke og den lange økta på ${day}`
			case 'hard-days-in-a-row':
				return `To harde dager etter hverandre (${pair})`
			case 'two-hard-sessions':
				return `To harde økter på ${day}`
			case 'two-long-sessions':
				return `To lange økter på ${day}`
			case 'easy-before-hard-day':
				return `En rolig økt dagen før en hard økt (${pair})`
		}
	},
	/** `Uke 3`, `Uke 3–5 og uke 9`, `Uke 3, uke 6–7 og uke 9`. */
	weekSpans: (spans: readonly string[]) => {
		const [first = '', ...rest] = spans.map((span, at) =>
			at === 0 ? span : `${span[0]!.toLowerCase()}${span.slice(1)}`,
		)
		const last = rest.pop()
		return last == null ? first : `${[first, ...rest].join(', ')} og ${last}`
	},
	/** `Uke 12–14: Styrke og en hard økt på tirsdag – en dag du har valgt selv.` */
	dayClashLine: (span: string, clash: string, pinned: boolean) =>
		`${span}: ${clash}${pinned ? '\u00a0– en dag du har valgt selv' : ''}.`,
	dayClashCheck:
		'Det er dagene lest mot hverandre, på tvers av alt du trener: hard betyr her en økt som ikke er rolig, også middels. ',
	dayClashNote:
		'Det kan være akkurat det du mente – en dag du har valgt selv, blir der du satte den. Planen er lagret slik den er.',
	noCapacity: 'Timer er den andre sammenligningen, og',
	noCapacityLink: 'utøverprofilen',
	noCapacityEnd:
		'din har ingen ukentlig kapasitet ennå – så ingenting her er sjekket mot timene dine.',
	/** `3 kvalitetsøkter og 2 styrkeøkter`. */
	sessionCounts: (quality: number, lifting: number) =>
		[
			quality > 0
				? `${quality} ${quality === 1 ? 'kvalitetsøkt' : 'kvalitetsøkter'}`
				: null,
			lifting > 0
				? `${lifting} ${lifting === 1 ? 'styrkeøkt' : 'styrkeøkter'}`
				: null,
		]
			.filter((half): half is string => half != null)
			.join(' og '),
	bandLine: (pct: string, band: string, goal: string) =>
		`er lagt inn med ${pct}, utenfor ${band} som ${goal} trener i.`,
	bandNote:
		'Det spennet er utledet fra styrkemålet du satte på blokka, aldri skrevet ved siden av – endre målet, så flytter spennet seg, eller la økta være som den er. Dette er en merknad og ikke en grense: blokkene og øktene dine er lagret slik du skrev dem.',
} as const

/** A block's progression and quality mix, under Avansert on its card. */
export const SESONG_SEGMENT_LABELS = {
	progression: (track: string | null) =>
		track ? `Stigning for ${track.toLowerCase()}` : 'Stigning',
	ramp: 'Stigning, % per harde uke',
	rampBlank: 'Tomt – volumet holder seg flatt gjennom blokka.',
	rampSet: (rate: string) =>
		`${rate} hver harde uke. Lette uker og nedtrapping stiger ikke.`,
	step: 'Hopp ved starten av blokka, %',
	stepBlank: 'Tomt – blokka starter der uka før slapp.',
	stepSet: (rate: string) =>
		`${rate} én gang, ved starten. Et bevisst fall inn i en intensitetsblokk hører hjemme her, ikke i stigningen.`,
	recoveryCut: 'Kutt i lett uke, %',
	recoveryBlank: (rate: string) =>
		`Tomt – følger vanlig praksis, ${rate} fra siste harde uke. La det stå tomt, så følger det med om praksisen endres.`,
	recoverySet: (rate: string) => `Ditt: ${rate} fra siste harde uke.`,
	taperCut: 'Kutt i nedtrappingen mot løpet, %',
	taperBlank: (rate: string) =>
		`Tomt – følger vanlig praksis, ${rate} mot løpet. La det stå tomt, så følger det med om praksisen endres.`,
	taperSet: (rate: string) => `Ditt: ${rate} mot løpet.`,
	taperNote: ' Nedtrappingen går gradvis over blokka, ikke alt i siste uke.',
	saveProgression: (track: string | null) =>
		track ? `Lagre stigning for ${track.toLowerCase()}` : 'Lagre stigning',
	mix: (track: string | null) =>
		track ? `Kvalitetsøkter for ${track.toLowerCase()}` : 'Kvalitetsøkter',
	mixIntro:
		'Økter i uka i hver kvalitetssone. Tomt eller 0 tar sonen ut – alle tre tomme er en blokk uten kvalitetsøkter, og det er en plan, ikke et hull. Dette tomme feltet er ikke det samme som stigningens tomme felt over: kvalitetsøkter har ingen vanlig praksis å falle tilbake på.',
	mixField: (zone: number, name: string) => `Sone ${zone} ${name}, økter i uka`,
	emphasis: 'Vekt, utledet',
	count: 'Kvalitetsøkter i uka, utledet',
	derivedNote:
		'Begge leses av kvalitetsøktene du lagret, så det er ingenting å skrive her: en blokk får navn etter arbeidet den inneholder. Det fortsetter å lese planen når ukene fylles med ekte økter, så blokka skifter ikke karakter utover sesongen.',
	saveMix: (track: string | null) =>
		track
			? `Lagre kvalitetsøkter for ${track.toLowerCase()}`
			: 'Lagre kvalitetsøkter',
	noQuality: 'Ingen kvalitetsøkter',
	/** `Løping stiger +5 % per harde uke, med 2 kvalitetsøkter i uka – 1× tempo + 1× terskel.` */
	readingSubject: (track: string | null) => track ?? 'Den',
	readingFlat: 'stiger ikke – hver uke er like stor som uka før',
	readingClimb: (rate: string) => `stiger ${rate} per harde uke`,
	readingStep: (rate: string) => `, og starter ${rate} mot blokka før`,
	readingQuality: (count: number, mix: string) =>
		count === 0
			? 'uten kvalitetsøkter'
			: `med ${count} ${count === 1 ? 'kvalitetsøkt' : 'kvalitetsøkter'} i uka – ${mix}`,
	typeRate: 'Skriv en prosent, eller la feltet stå tomt',
	wholeSessions: 'Et helt antall økter, eller tomt for ingen',
	sessionRange: (max: number) => `Mellom 0 og ${max} økter i uka`,
	gone: 'Den blokka er ikke lenger en del av planen.',
} as const

/**
 * What is left to set up on a new plan, above the readings — two steps since
 * the weeks fill themselves (round-2 decision 14, ADR 0090): a climb, and a
 * typical week to fill them from. Gone once both are there.
 */
export const SESONG_NEXT_LABELS = {
	title: 'Det som gjenstår',
	left: (count: number) =>
		count === 1 ? '1 ting igjen' : `${count} ting igjen`,
	climbTitle: 'Gi ukene en stigning',
	climbDetail:
		'Hver uke er like stor som den første nå. Start fra en form, eller sett en stigning på en blokk.',
	climbAction: 'Sett en stigning',
	patternTitle: 'Si hvordan den typiske uka di ser ut',
	patternDetail:
		'Hvilke dager du trener, og hvilken som er den lange. Ukene fylles fra den av seg selv, opp til horisonten.',
	patternAction: 'Lag uka',
} as const

/** What the plan page's phase fields say when a box is left empty. */
export const SESONG_PHASE_FIELD_LABELS = {
	weeks: 'Hvor mange uker varer fasen?',
	rhythm: 'Velg hvordan fasen har lette uker',
} as const

/** The phase cards on Blokker, and adding and deleting (#402). */
export const SESONG_PHASE_LABELS = {
	current: 'Nå',
	tapers: 'Trapper ned',
	/** `Uke 33–36 · 3:1 · fra 10. aug`. */
	detail: (span: string, rhythm: string, from: string) =>
		`${span} · ${rhythm} · fra ${from}`,
	editTitle: 'Navn, lengde og lett uke',
	editDetail: 'Hvilke uker som er lette, og hvor du endrer det.',
	weekRoles: 'Ukenes rytme',
	weekRole: (week: number, role: string) => `Uke ${week}: ${role}`,
	tapersAll:
		'Hver uke i denne fasen trapper ned mot løpet, så den har ingen lett uke.',
	noRecovery: 'Ingen lette uker i denne fasen.',
	recoveryWeeks: (weeks: number[]) =>
		`Lette uker: ${weeks.map((week) => `uke ${week}`).join(', ')} i fasen. Hvor mye de kutter, bestemmer sporet, ikke fasen.`,
	moveEarlier: 'Flytt tidligere',
	moveLater: 'Flytt senere',
	remove: 'Fjern',
	rhythm: 'Rytme',
	taperRhythm:
		'Alle ukene i en fase som trapper ned er nedtrappingsuker, så det er ingen rytme å velge.',
	thisTapers: 'Fasen trapper ned',
	addTitle: 'Legg til en fase',
	name: 'Navn',
	namePlaceholder: 'f.eks. Off-season',
	weeks: 'Uker',
	where: 'Hvor den skal ligge',
	atStart: 'Først',
	after: (name: string) => `Etter ${name}`,
	growsForward:
		'Planen vokser framover – en ny fase flytter aldri uka planen starter i.',
	add: 'Legg til fase',
	deleteIntro: (eventName: string | null) =>
		`Fjerner sesongen du har laget. ${eventName ? `${eventName} blir stående i kalenderen, og hver` : 'Hver'} økt du allerede har trent blir stående som den er.`,
	delete: 'Slett planen',
	deleteConfirm: 'Slette planen?',
	deleteBody: (eventName: string | null) =>
		`Dette fjerner fasene, sporene og startnivåene dine. ${eventName ? `Det rører ikke ${eventName} eller noen økt du har trent – løpet blir stående i kalenderen.` : 'Det rører ingen økt du har trent.'} Det kan ikke angres.`,
	keep: 'Behold planen',
	sparkLabel: (phase: string, weeks: number, track: string) =>
		`${phase}: ${nbWeeks(weeks)} med ${track.toLowerCase()}`,
} as const

/** Season Anchors under Avansert (#407, ADR 0040 §5). */
export const SESONG_ANCHOR_LABELS = {
	intro:
		'Startnivået er ukevolumet sesongen regnes ut fra. Det er en liste med daterte nivåer, ikke ett tall: når sesongen ikke går som planlagt kan du si «fra denne uka starter jeg herfra», og ukene du allerede har levd blir stående som de var.',
	freshStart:
		'Et nytt startnivå er en ny start, ikke en rabatt. Stigningen starter på nytt fra uka du velger, så ukene etter stiger fra det nye tallet i stedet for å fortsette fra det gamle. Uker du har satt selv forblir satt selv, og kan fortsatt tilbakestilles.',
	list: (track: string) => `Startnivå for ${track.toLowerCase()}`,
	unit: (unit: string) =>
		`Startnivået er i ${unit} – enheten sporet har hele livet. Et nytt startnivå endrer tallet, aldri enheten; å måle sporet i noe annet er et nytt spor, ikke en endring.`,
	unpricedOpening: (span: string) =>
		`${span} i planen kan ikke regnes ut: ingen startnivå dekker dem, og appen finner ikke på et tall for en uke den ikke kan regne ut.`,
	outside: 'Utenfor ukene i planen',
	from: (week: number) => `Fra uke ${week}`,
	opening: 'Sesongstart',
	reAnchored: 'Nytt startnivå',
	outsideNote:
		'Dette startnivået gjelder fra en uke planen ikke dekker lenger – det er datert, så en kortere sesong lar det ligge der det var. Fjern det, eller legg til uker i planen.',
	value: (unit: string) => `Ukevolum, ${unit}`,
	save: 'Lagre',
	keepsFirst:
		'Sesongen beholder dette: hver uke fram til neste nye startnivå regnes ut fra det. Endre tallet her i stedet for å fjerne det.',
	remove: 'Fjern dette startnivået',
	allTaken:
		'Hver uke i planen har allerede et startnivå, så det er ingen uke igjen å starte på nytt fra.',
	reAnchorTitle: 'Nytt startnivå fra en uke',
	fromWeek: 'Fra uke',
	pickWeek: 'Velg en uke',
	startingFrom: (unit: string) => `Starter på, ${unit}`,
	restarts:
		'Stigningen starter på nytt her: uka du velger er dette tallet, og de harde ukene etter stiger fra det. Alt før er urørt.',
	reAnchor: 'Sett nytt startnivå',
	valueRequired: 'Hvor mye i uka starter du fra?',
	valueNumber: 'Skriv et ukevolum, f.eks. 45',
	weekRequired: 'Hvilken uke gjelder startnivået fra?',
	summaryNone: 'Ingen spor å gi et startnivå ennå.',
	summaryNotSet: 'ikke satt',
	/** `Løping fra 40 km/uke, nytt startnivå 2 ganger`. */
	summary: (track: string, opening: string, again: number) =>
		`${track} fra ${opening}${again > 0 ? `, nytt startnivå ${again === 1 ? 'én gang' : `${again} ganger`}` : ''}`,
} as const

/** Lifting blocks under Avansert (#409, ADR 0047). */
export const SESONG_LIFTING_LABELS = {
	intro:
		'En styrkeblokk er datert: den starter en uke du velger og varer så lenge du sier, så den kan starte og slutte inne i en fase. Ukene mellom to blokker er uten styrke – noe du har sagt, ikke et hull i planen.',
	unit: (unit: string) =>
		`Sporet planlegges i ${unit} – ukas arbeidssett til sammen, for hele kroppen, ikke per muskelgruppe eller øvelse. Det finnes ikke noe publisert tall å holde det opp mot, så tallet å planlegge fra er ditt eget: startnivået kommer fra settene du allerede logger, og stigningen er hvor fort du øker.`,
	list: 'Styrkeblokker',
	none: 'Ingen styrkeblokker ennå, så hver uke i planen er uten styrke. Legg til en når du vet hvilke uker du er på treningssenteret.',
	outside: 'Utenfor ukene i planen',
	outsideNote:
		'Denne blokka starter en uke planen ikke dekker lenger – den er datert, så en kortere sesong lar den ligge der den var. Velg en uke under for å hente den inn igjen.',
	/** `4 uker · 2× i uka`. */
	cardNote: (weeks: number, sessions: number) =>
		`${nbWeeks(weeks)} · ${sessions}× i uka`,
	remove: 'Fjern blokka',
	save: 'Lagre blokka',
	addTitle: 'Legg til en styrkeblokk',
	add: 'Legg til blokk',
	opensOn: 'Starter',
	pickWeek: 'Velg en uke',
	weeks: 'Uker',
	goal: 'Hva blokka er til for',
	pickGoal: 'Velg et mål',
	sessions: 'Økter i uka',
	ramp: 'Stigning, % per harde uke',
	rampBlank: 'Tomt – settene holder seg flatt gjennom blokka.',
	rampSet: (rate: string) =>
		`${rate} hver harde uke. Avlastningsuker stiger ikke.`,
	step: 'Hopp ved starten av blokka, %',
	stepBlank: 'Tomt – blokka starter der uka før slapp.',
	stepSet: (rate: string) =>
		`${rate} én gang, ved starten. Et bevisst fall inn i en tyngre blokk hører hjemme her, ikke i stigningen.`,
	deloadCut: 'Kutt i avlastning, %',
	deloadCutBlank: (rate: string) =>
		`Tomt – følger vanlig praksis, ${rate} hver avlastningsuke. La det stå tomt, så følger det med om praksisen endres.`,
	deloadCutSet: (rate: string) =>
		`Ditt: ${rate} hver avlastningsuke, flatt og ikke fallende.`,
	deloadWeeks: 'Avlastningsuker til slutt',
	deloadWeeksBlank: (weeks: string) =>
		`Tomt – følger vanlig praksis, ${weeks} til slutt i blokka. La det stå tomt, så følger det med om praksisen endres.`,
	deloadWeeksNone:
		'Ditt: ingen avlastning – blokka går til siste uke med fullt volum.',
	deloadWeeksSet: (weeks: string) =>
		`Ditt: de siste ${weeks} av blokka er avlastning, med kuttet ved siden av.`,
	band: 'Belastning, utledet',
	reps: 'Repetisjoner, utledet',
	derivedNote:
		'Begge kommer fra målet du valgte over, og det er ingenting å skrive: endre målet, så flytter spennet seg. Hvor mye styrke er et annet spørsmål og leses ikke av målet – det er startnivået og stigningen, så planen har aldri to kilder for ett tall.',
	typeRate: 'Skriv en prosent, eller la feltet stå tomt',
	wholeDeload: 'Et helt antall uker, eller tomt for vanlig praksis',
	weekRequired: 'Velg uka blokka starter',
	weeksRequired: 'Hvor mange uker varer blokka?',
	weeksWhole: 'En blokk varer i hele uker',
	goalRequired: 'Velg hva blokka er til for',
	sessionsRequired: 'Hvor mange styrkeøkter i uka?',
	sessionsWhole: 'Antall økter er et helt tall',
	summaryNone:
		'Ingen styrkeblokk ennå – ukene mellom blokker er uker uten styrke.',
	summary: (blocks: number) =>
		`${blocks === 1 ? '1 blokk' : `${blocks} blokker`}, hver datert og ikke knyttet til en fase.`,
} as const

/** The Week Pattern, under Uker (#410, ADR 0044 §7). */
export const SESONG_PATTERN_LABELS = {
	intro:
		'Beskriv uka du faktisk trener én gang, i stedet for å legge inn hver uke for hånd. En dag er enten en fast økt – slik du skrev den, de samme dragene i en stor uke og en liten – eller en andel av det som er igjen, etter vekt. Et mønster lagrer ingen distanser og ingen timer: hver ukes volum regnes ut, så det samme mønsteret blir ulikt i uke 1 og uke 8.',
	previewIntro:
		'Under ser du hva hver dag blir mot én ukes utregnede mål. Ukene i kalenderen fylles fra mønsteret når horisonten når dem.',
	readAgainst: 'Les mot',
	readWeek: 'Les denne uka',
	list: 'Ukemønstre',
	/** `4 dager · lest mot uke 41`. */
	cardNote: (days: number, week: number | null) =>
		`${nbDays(days)} · lest mot ${week == null ? 'ingen uke' : `uke ${week}`}`,
	name: 'Navn',
	rename: 'Gi nytt navn',
	noDays: 'Ingen dager ennå. Legg til øktene du trener i en vanlig uke.',
	/** The pattern's lifting slots (ADR 0104 §3), which have no weekday. */
	liftingSlots: (count: number) =>
		`Styrke: ${count} ${count === 1 ? 'økt' : 'økter'} i uka, på dager appen velger hver uke, unna de harde dagene.`,
	liftingSlotsLink: 'Velg styrkedagene selv',
	days: (name: string) => `Dager i ${name}`,
	unknownTrack: 'Ukjent spor',
	workoutRemoved: 'Økta er fjernet',
	fixedNote: 'slik du skrev den, aldri skalert',
	share: (weight: number, share: string | null) =>
		`Andel, vekt ${String(weight).replace('.', ',')}${share == null ? '' : ` · ${share} av det som er igjen`}`,
	shapedOn: (title: string) => ` · formet etter ${title}`,
	remove: (weekday: string, position: number | null) =>
		`Fjern ${weekday}${position == null ? '' : ` nr. ${position}`}`,
	earlierInDay: 'Tidligere på dagen',
	laterInDay: 'Senere på dagen',
	moveEarlier: 'Flytt tidligere',
	moveLater: 'Flytt senere',
	fixedGone:
		'Økta denne dagen la inn er borte, så det er ikke noe volum å lese.',
	fixedUnread: (unit: string) =>
		`Økta kan ikke leses i ${unit}, så den har ikke noe volum å legge inn her.`,
	noTarget: (track: string) =>
		`Uka har ikke noe utregnet mål for ${track.toLowerCase()}, så det er ingenting for denne andelen å ta en del av.`,
	unknownRemainder: (unit: string) =>
		`En fast økt i mønsteret kan ikke leses i ${unit}, så det som er igjen å dele er ukjent – og en andel av en ukjent rest ville vært et oppdiktet tall.`,
	totalsTitle: (track: string, week: number | null) =>
		`${track}${week == null ? '' : ` · uke ${week}`}`,
	weekTarget: 'Ukemål',
	fixedTotal: 'Lagt inn av faste dager',
	leftTotal: 'Igjen til andelsdagene',
	unallocated: 'Tatt av ingen dag',
	noShareDay: (track: string) =>
		`Mønsteret har ingen andelsdag for ${track.toLowerCase()}, så ingenting tar resten av uka. Legg til en, eller la det være – et mønster trenger ikke bruke hele uka.`,
	fixedExceeds: (track: string, fixed: string, target: string) =>
		`De faste øktene for ${track.toLowerCase()} legger inn ${fixed}, og ukemålet er ${target}. De står slik du skrev dem – drag er foreskrevet, så ingenting her korter ned en økt du har skrevet.`,
	fixedExceedsShares:
		' Det er ingenting igjen til andelsdagene denne uka, som tallene over sier.',
	fixedExceedsNoShares:
		' Uka er rett og slett mindre enn øktene du har lagt inn.',
	unreadFixed: (days: number, unit: string) =>
		`${days === 1 ? 'Én fast dag' : `${days} faste dager`} kan ikke leses i ${unit}, så uka kan ikke deles: det andelsdagene skulle dele er ukjent, og en andel av en ukjent rest ville vært et tall appen fant på. De faste øktene er ikke berørt.`,
	addDay: 'Legg til en dag',
	weekday: 'Ukedag',
	track: 'Spor',
	trackNote:
		'En svømmedag tar svømmevolum, så dagen sier hvilket spor den hører til.',
	kind: 'Hva slags dag',
	fixedHint:
		'Slik du skrev den og aldri skalert – de samme dragene i en stor uke og en liten.',
	shareHint:
		'En relativ vekt, fordelt over uka – dagen tar sin del av det de faste øktene lar være igjen.',
	weight: 'Relativ vekt',
	noWorkouts: 'En fast dag legger inn en økt, og du har ingen ennå',
	noTrackWorkouts: (track: string) =>
		`En fast dag legger inn en økt fra dagens eget spor, og du har ingen økt i ${track.toLowerCase()} ennå`,
	authorSession: 'skriv en økt',
	authorSessionLead: '– appen lager en økt sammen med en treningsøkt, så',
	authorSessionTail:
		'så tilbys den her. Til da kan en dag fortsatt ta en andel av uka.',
	workout: 'Økt',
	shape: 'Form (valgfri)',
	noShape: 'Ingen form – bare volum',
	fixedWorkoutHint:
		'Lagt inn slik du skrev den. Volumet leses av økta selv, så det er det samme hver uke.',
	shapeHint:
		'En form skaleres til andelen dagen tar. La den være for volum uten struktur.',
	addDayButton: 'Legg til dag',
	noTracks:
		'Planen har ikke noe spor ennå, og en dag i mønsteret tar volumet sitt fra et spor.',
	addPattern: 'Legg til et ukemønster',
	patternPlaceholder: 'f.eks. Vanlig uke',
	addPatternButton: 'Legg til mønster',
	none: 'Ingen typisk uke ennå.',
	starterProfile: (days: number) =>
		`Lag en fra ${days === 1 ? 'dagen' : `de ${days} dagene`} du sier du kan trene – én økt hver, den siste lang. Flytt, vekt eller fjern dager etterpå.`,
	starterDefault:
		'Lag en fra en uke med fire dager som utgangspunkt – én økt hver dag, den siste lang. Flytt, vekt eller fjern dager etterpå, og sett treningsdagene i utøverprofilen for å lese dem derfra i stedet.',
	starter: 'Lag en typisk uke for meg',
	orOwn: 'Eller gi din egen et navn under og legg til dagene selv.',
	delete: 'Slett mønsteret',
	deleteConfirm: (name: string) => `Slette ${name}?`,
	deleteBody: (name: string, days: number) =>
		`Dette fjerner ${name}${days === 0 ? ', som ikke har noen dager ennå' : days === 1 ? ' og den ene dagen' : ` og de ${days} dagene`}. Blokkene, sporene og hver økt du har trent blir stående som de er – økter som allerede er lagt inn i kalenderen blir også stående. Det kan ikke angres.`,
	keep: 'Behold mønsteret',
	starterToast: 'En uke å starte fra',
	starterFromProfile: (days: number) =>
		`Laget fra ${days === 1 ? 'dagen' : `de ${days} dagene`} du sier du kan trene på`,
	starterFromDefault:
		'En uke med fire dager som utgangspunkt – du har ikke satt treningsdagene dine, så ingenting ble lest derfra',
	starterTail: (built: string) =>
		`${built}, med den siste dagen lang. Hver dag kan flyttes, vektes eller fjernes. Ukene fylles fra den når horisonten når dem.`,
	nameRequired: 'Gi mønsteret et navn.',
	whichDay: 'Hvilken ukedag?',
	weightRequired:
		'Hvor stor er dagen ved siden av de andre? f.eks. 1, eller 2,5',
} as const

/** Kopier uke, under Uker (#415). */
export const SESONG_COPY_LABELS = {
	intro:
		'Hver økt i uka du velger kopieres til de samme dagene i den andre uka, på samme tid. Hver kopi får sin egen økt, så de to ukene er adskilt fra første stund – endre den ene, så står den andre.',
	asWritten:
		'En uke kopieres slik du skrev den. Den strekkes ikke for å møte målet i uka den havner i – ber den uka om mer, viser lista det slik den viser enhver uke du har satt selv.',
	oneWeek: 'Planen har én uke, så det er ingen annen uke å kopiere til.',
	source: 'Kopier denne uka',
	target: 'Til denne uka',
	copy: 'Kopier uka',
	week: (week: number) => `Uke ${week}`,
	weekOption: (week: number, date: string) => `Uke ${week} · ${date}`,
	filled: (week: number) => `Uke ${week} har allerede økter`,
	nothingWritten: 'Ingenting er skrevet ennå.',
	noneReplaced: 'Ingenting i den uka blir erstattet.',
	replacing: (count: number, source: string | null) =>
		`${nbSessions(count)[0]!.toUpperCase()}${nbSessions(count).slice(1)} blir slettet og skrevet på nytt fra ${source ?? 'uka du valgte'}. Endringer du har gjort i dem forsvinner, og det kan ikke angres.`,
	keeping: (count: number) =>
		` ${nbSessions(count)[0]!.toUpperCase()}${nbSessions(count).slice(1)} blir stående som de er – du har allerede trent eller logget dem, så en kopi rører dem aldri.`,
	replace: 'Erstatt og kopier',
	orEmpty: 'Eller velg en tom uke i stedet.',
	done: 'Uka er kopiert',
	/** `4 økter fra uke 41 til uke 43, slik du skrev dem. …`. */
	sentence: (sessions: number, from: number, to: number, replaced: number) =>
		`${nbSessions(sessions)} fra uke ${from} til uke ${to}, slik du skrev dem. Endre den ene uka – den andre står.${replaced > 0 ? ` ${nbSessions(replaced)} ble erstattet.` : ''}`,
	noPrescription:
		'En økt uten en økt bak seg ble utelatt – det var ingenting å kopiere.',
} as const

/** The roster of Training Tracks on the summary card (#414). */
export const SESONG_TRACK_LABELS = {
	list: 'Treningsspor',
	/** `· i km/uke · starter på 40 km/uke`. */
	line: (unit: string, start: string | null) =>
		`· i ${unit}${start == null ? '' : ` · starter på ${start}`}`,
	reAnchored: (times: number, latest: string) =>
		` · nytt startnivå ${times === 1 ? 'én gang' : `${times} ganger`}, sist til ${latest}`,
	add: 'Legg til et spor',
	addDetail: (names: string) => `${names} – hver i en enhet den beholder.`,
	remove: 'Fjern',
	removeName: (track: string) => `Fjern sporet ${track.toLowerCase()}`,
	removeConfirm: (track: string) => `Fjerne sporet ${track.toLowerCase()}?`,
	removeBody: (track: string) =>
		`Dette fjerner startnivået, stigningen og uker du har satt selv på sporet, og alle dager i mønsteret som tok volum fra det. Fasene står som de er, og det gjør hver økt du har trent. Du kan lage et spor for ${track.toLowerCase()} igjen etterpå – det starter på nytt, og du velger enheten igjen.`,
	keep: 'Behold sporet',
	removeButton: 'Fjern sporet',
	discipline: 'Sport',
	plannedIn: 'Planlegges i',
	ownUnit: '· styrkens egen enhet, ikke et valg',
	unit: 'Enhet',
	pickUnit: 'Velg enheten du planlegger i',
	proposed: 'Foreslått fra din egen historikk. ',
	noHistoryUnit: (weeks: number) =>
		`Ingenting i de siste ${weeks} ukene å lese en enhet fra, så du velger selv. `,
	unitFixed:
		'Enheten ligger fast når sporet finnes – å endre den ville skrevet om enheten i uker du har trent, så det er et nytt spor og ikke en endring.',
	startingVolume: (unit: string | null) =>
		unit ? `Startvolum (${unit})` : 'Startvolum',
	anchorNone: (weeks: number) =>
		`Ingenting i de siste ${weeks} ukene å lese dette fra – skriv ukevolumet du starter på.`,
	anchorAverage: (
		weeks: number,
		average: string,
		total: string,
		trained: number,
	) =>
		`De siste ${weeks} ukene var snittet ${average} (${total} til sammen)${trained === weeks ? '' : ` – du trente ${trained} av dem`}.`,
	anchorTail:
		' Startvolumet gjelder fra planens første uke, og fasene du allerede har er fasene sporet måles over.',
	addButton: 'Legg til spor',
	disciplineRequired: 'Velg hvilken sport sporet måler',
	unitRequired: 'Velg enheten du planlegger sporet i',
	anchorRequired: 'Et startvolum må fylles inn',
	anchorPositive: 'Startvolumet er mer enn null',
} as const

/** Every refusal the plan page's action says, as the athlete reads it. */
export const SESONG_REFUSAL_LABELS = {
	unknown: 'Det kan ikke denne siden gjøre.',
	phaseGone: 'Den fasen er ikke lenger en del av planen.',
	outlineGone: 'Den planen kan ikke endres.',
	position: 'Velg hvor den nye fasen skal ligge.',
	shapeUnknown: 'Den formen finnes ikke i appen. Ingenting ble endret.',
	noEvent: 'Planen har ikke noe løp, så det er ingenting å tilpasse den til.',
	alreadyFits: 'Planen slutter allerede i uka for løpet.',
	cannotFit:
		'Blokkene kan ikke endres til å nå løpet uten at én av dem forsvinner. Kort ned eller fjern en blokk selv.',
	planResting:
		'Planen hviler mens planen mot løpet ditt er i gang, så ingen uker legges for den nå.',
	patternGone: 'Det ukemønsteret er ikke lenger en del av planen.',
	noStarterWeek:
		'Treningsdagene dine sier at du trener ingen dager, så det er ingen uke å lage. Sett treningsdagene i utøverprofilen, eller gi et mønster navn og legg til dagene selv.',
	dayGone: 'Den dagen er ikke lenger en del av mønsteret.',
	trackGone: 'Det sporet er ikke lenger en del av planen.',
	weekOutside: 'Den uka er ikke i planen.',
	weekNotInPlan:
		'Den uka er ikke en av ukene i planen. Velg en uke mellom den første og den siste, eller legg til uker i planen først.',
	anchorGone: 'Det startnivået er ikke lenger en del av planen.',
	trackMissing: 'Velg hvilket spor dagen tar fra.',
	workoutMissing: 'En fast dag legger inn en økt, så velg hvilken.',
	dayKindUnknown:
		'En dag er enten en fast økt eller en andel av uka. Ingenting ble lagt til.',
	blockGone: 'Den styrkeblokka er ikke lenger en del av planen.',
	alreadyTracked:
		'Planen måler allerede den sporten. Ett spor per sport, så endre det du har.',
	lastTrack:
		'En plan måler minst én sport. Slett selve planen hvis du ikke vil ha noen.',
	badValue: 'Det er ikke en verdi denne fasen kan ha.',
	planTooLong: 'Da ville planen gått over to år. Kort ned en fase først.',
	lastPhase:
		'En plan har minst én fase. Slett selve planen hvis det er det du vil.',
	phaseAtEdge: 'Den fasen er allerede ytterst i den enden av sesongen.',
	workoutGone:
		'Den økta er ikke lenger din. Velg en annen økt for denne dagen.',
	workoutMismatch:
		'Den økta er en annen sport enn sporet til dagen, og en dag tar volumet fra sitt eget spor. Velg en økt på det sporet.',
	atEdge: 'Den er allerede ytterst i den enden av rekkefølgen.',
	earliestAnchor:
		'Sesongen beholder det første startnivået – hver uke fram til neste nye startnivå regnes ut fra det. Endre tallet i stedet, eller fjern et senere startnivå.',
	sameWeek: 'Det er samme uke to ganger. Velg en annen uke å kopiere til.',
	sourceEmpty:
		'Den uka har ingen økter, så det er ingenting å kopiere. Velg en uke du allerede har fylt.',
	nothingToCopy:
		'Den uka har bare registrerte aktiviteter, og de har ingen økt å kopiere. Ingenting ble endret.',
	notStrengthTrack:
		'Styrkeblokker hører til et styrkespor, og det sporet er et utholdenhetsspor. Ingenting ble endret.',
	segmentPastPlan:
		'Blokka ville gått forbi den siste uka i planen. Kort den ned, start den tidligere, eller legg til uker i planen.',
	weekOpensSegment:
		'En annen styrkeblokk starter allerede den uka. Start denne en annen uke.',
	segmentsOverlap:
		'Blokka ville overlappet en annen styrkeblokk. Blokker ligger etter hverandre, og ukene mellom to av dem er uten styrke.',
	presetDone: 'Kopiert inn i planen',
	presetDoneDetail:
		'Den er din nå – endre hva du vil. Ingenting er knyttet til formen du valgte.',
	fitDone: 'Planen lander på løpet',
	fitTail: ' Endre lengden på en blokk tilbake hvis det ikke var det du ville.',
	deleted: 'Planen er slettet',
	deletedDetail: 'Løpet og øktene du har trent er urørt.',
	fitAdd: (weeks: number) =>
		`Legg til ${nbWeeks(weeks)} så den lander på løpet`,
	fitRemove: (weeks: number) =>
		`Ta bort ${nbWeeks(weeks)} så den lander på løpet`,
	/** `Grunntrening 4 → 6 uker, Oppbygging 4 → 3 uker`. */
	fitChange: (name: string, from: number, to: number) =>
		`${name} ${from} → ${nbWeeks(to)}`,
	fitLengthens: (changes: string) =>
		`Forlenger grunntreningen for å nå løpet: ${changes}.`,
	fitShortens: (changes: string) =>
		`Tar ukene fra grunntreningen først, så framover gjennom sesongen: ${changes}. Nedtrappingen er urørt.`,
} as const

/** The analytical season chart, under Avansert (#413). */
export const SESONG_CHART_LABELS = {
	title: 'Sesongdiagram',
	/** `10 uker · Løping i km/uke`. */
	aside: (weeks: number, track: string, unit: string) =>
		`${nbWeeks(weeks)} · ${track} i ${unit}`,
	track: 'Spor',
	readIn: 'Les i',
	layers: 'Lag',
	derived: 'utledet',
	readInAuthored: (unit: string) =>
		`Les i ${unit.toLowerCase()}, slik du skrev det`,
	readInDerived: (unit: string) => `Les i ${unit.toLowerCase()}, utledet`,
	layer: {
		volume: 'Volum',
		fitness: 'Form',
		rhythm: 'Rytme',
		ramp: 'Stigning',
		emphasis: 'Vekt',
		form: 'Overskudd',
	},
	tableCaption: (track: string, unit: string, authoredIn: string | null) =>
		`Volum for ${track.toLowerCase()} per treningsuke, i ${unit}${authoredIn ? `, en utledet lesning av et spor skrevet i ${authoredIn}` : ''}. Gå over diagrammet for å lese utregningen for en uke i panelet under.`,
	columns: {
		week: 'Uke',
		starts: 'Starter',
		block: 'Blokk',
		role: 'Rolle',
		change: 'Endring',
		emphasis: 'Vekt',
	},
	noChange: 'Ingen endring å lese',
	ariaVolume: (track: string, unit: string) =>
		`Volum for ${track.toLowerCase()} gjennom sesongen, i ${unit}. Bruk piltastene for å lese en uke.`,
	event: 'Løp',
	na: 'mangler',
	fitnessUnavailable: (reason: string) =>
		`Formkurven kan ikke regnes ut – ${reason}.`,
	fitnessAria:
		'Beregnet form (CTL) gjennom sesongen, regnet fram fra planen din. Bruk piltastene for å lese en uke.',
	fitnessCaption: (eventName: string | null) =>
		`Beregnet form (CTL) på slutten av hver treningsuke, regnet fram fra ${eventName ? `planen mot ${eventName}` : 'planen din'}.`,
	fitnessColumn: 'Beregnet form (CTL)',
	fitnessHint: 'Trykk på en uke for å lese formen planen gir den.',
	fitnessWeek: (week: number, ctl: string) =>
		`Uke ${week} · beregnet form ${ctl}`,
	gapNoAnchor:
		'det er ingen registrert belastning å regne planen fram fra ennå',
	gapBaseline: (day: number, of: number) =>
		`formgrunnlaget bygges fortsatt, dag ${day} av ${of}`,
	gapUnpriced: 'planen har ingen uke en belastning kan leses fra',
	basisFrom: (from: string) =>
		`Regnet fram fra formen du hadde inn i den første uka, gjennom planens egne uker – ${from}.`,
	basisConventions: (conventions: string) =>
		`Priset gjennom din egen sonemodell, ${conventions}.`,
	basisOneNumber: 'Planen er ett tall i uka, så bare formen regnes fram.',
	basisTrack: (track: string, unit: string) => `${track} i ${unit}`,
	inspectHint:
		'Trykk på en uke for å lese den – tallene, og hvor et utledet tall kommer fra.',
	eventWeek: ' · uka for løpet',
	handSetWeek: ' · du satte denne uka selv',
	roleWeek: (role: string) => role,
	stepNone: 'Ingen endring å lese mot uka før.',
	stepOn: (rate: string) => `${rate} mot uka før.`,
	rampConvention: 'Stigning: vanlig praksis.',
	rampAuthored: (rate: string) => `Stigning satt til ${rate}.`,
	noQuality: 'Ingen kvalitetsøkter denne uka.',
	opening: 'Sesongstart',
	reAnchored: 'Nytt startnivå',
	blockOpens: (track: string) =>
		`En blokk med ${track.toLowerCase()} starter denne uka`,
	overflow:
		'Kvalitetsøktene alene ber om mer enn ukas volum. Det rolige arbeidet går ned til null, og planen står slik du skrev den.',
	whereFrom: 'Hvor tallet kommer fra',
	substitution: (
		requested: number,
		recipe: string,
		band: string,
		declared: number,
	) =>
		`Sone ${requested} prises fra ${recipe} sone ${band}, den nærmeste sone ${declared} sonemodellen din har.`,
	buckets: 'Uka delt opp i intensiteter',
	bucketColumns: {
		bucket: 'Del',
		hours: 'Timer',
		distance: 'Distanse',
		load: 'Belastning',
		intensity: 'Intensitet',
	},
	easy: 'Rolig',
	steps: {
		authored: 'Du skrev',
		'quality-hours': 'Kvalitetstid i sonen',
		'quality-km': 'Kvalitetsdistanse',
		'quality-tss': 'Kvalitetsbelastning',
		'easy-hours': 'Rolig tid',
		'easy-km': 'Rolig distanse',
		'easy-tss': 'Rolig belastning',
		'easy-pace-ratio': 'Forhold rolig fart',
		'speed:easy': 'Rolig fart',
		'speed:quality': 'Kvalitetsfart',
		'if:easy': 'Rolig intensitet',
		'tss-per-hour:easy': 'Rolig belastning per time',
		'total-km': 'Uka, i km',
		'total-hours': 'Uka, i timer',
		'total-tss': 'Uka, i TSS',
	} as Record<string, string>,
	zoneSteps: {
		'quality-hours': (zone: string) => `Tid i ${zone}`,
		'quality-km': (zone: string) => `Distanse i ${zone}`,
		'quality-tss': (zone: string) => `Belastning fra ${zone}`,
		if: (zone: string) => `Intensitet i ${zone}`,
		'tss-per-hour': (zone: string) => `Belastning per time i ${zone}`,
	} as Record<string, (zone: string) => string>,
	sourceConvention: (convention: string, citation: string) =>
		`fra ${convention} – vanlig praksis, ${citation}`,
	sourceThreshold: (field: string) => `fra ${field}`,
	sourceRecipe: (recipe: string, band: string, description: string | null) =>
		`fra sonemodellen ${recipe}, sone ${band}${description ? ` (${description})` : ''}`,
	sourceRides: (rides: number, weeks: number) =>
		`fra ${rides} registrerte sykkeløkter i de ${weeks} ukene før planen`,
	sourceArithmetic: 'regnet ut fra tallene under',
	unavailable: (reason: string) => `Utilgjengelig – ${reason}`,
	formTitle: 'Overskudd tegnes ikke her',
	formBody:
		'Planen sier hvor mye en uke inneholder, ikke hvilke dager, så en framregning må spre hver uke jevnt. Formen tåler det – den leser seks uker om gangen – men trøtthet leser de siste sju dagene, og overskudd er form minus trøtthet. Spredt flatt ville begge vært former av gjennomsnittet og ikke av treningen din, så dette laget tegner ingenting i stedet for en kurve planen ikke kan bære. Det ekte overskuddet ditt står på I dag, fra det du faktisk gjorde.',
	authoredMarker: 'skrevet',
	derivedMarker: 'utledet',
} as const

/**
 * The shapes under Avansert (_Start fra en form_, #405), named the way the
 * Filosofi card names a philosophy: `Klassisk 3:1`, `Klassisk 3:1, lang
 * innkjøring` — one name for one method on one page (audit B7).
 */
export const SESONG_SHAPE_LABELS = {
	lengthSuffix: {
		short: ', kort innkjøring',
		standard: '',
		long: ', lang innkjøring',
	},
	lengthNote: {
		short: 'Den samme sesongen over færre uker.',
		standard: null,
		long: 'Den samme sesongen over flere uker.',
	},
	list: 'Sesongformer',
	weeks: (weeks: number) => nbWeeks(weeks),
	replaces: 'Erstatter blokkene du har nå.',
	apply: (name: string) => `Bruk ${name}`,
	copied:
		'Hver form kopieres inn i planen din. Å bruke en erstatter blokkene du har nå – og det som lander er vanlige blokker du kan gi nytt navn, endre lengden på og flytte. Ingenting er knyttet til formen du valgte.',
	notSize:
		'En form sier hvordan sesongen bygges, aldri hvor store ukene er. Startuka, treningssporene og volumet du starter på står som før.',
	fixedLength:
		'Hver form har en fast lengde, så en kortere eller lengre innkjøring gjør at planen slutter før eller etter løpet i stedet for å strekke en blokk. Linja over blokkene sier hvilken – og tilbyr å tette gapet. Uker tas fra grunntreningen først, så framover gjennom sesongen, og nedtrappingen kortes aldri ned. Hver form finnes i tre lengder, så de fleste innkjøringer har en som passer.',
	climb: (rate: string) =>
		`Alle stiger etter vanlig praksis, rundt ${rate} per harde uke. Det er der trenerpraksis ligger, ikke en sikkerhetsgrense: ingen volumregel er vist å forebygge skader, så det er et utgangspunkt og ikke en regel.`,
	cuts: (recovery: string, taper: string) =>
		`Lette uker og nedtrapping følger vanlig praksis også – ${recovery} fra siste harde uke og ${taper} mot løpet. Ingen form velger dem, så de flytter seg hvis praksisen gjør det. Sett dine egne på en blokk etterpå.`,
	rhythms:
		'Rytmene er også vanlig praksis. Ingen studie har vist at tre harde uker og en lett slår to og en, eller å ta en lett uke når du trenger den – så velg rytmen som passer livet ditt. Du kan endre den på hver blokk.',
	loads: (rhythm: string) => `Rytme ${rhythm}.`,
	rhythmChanges: 'Rytmen skifter fra blokk til blokk.',
	step: (rate: string, phase: string) =>
		` Volumet går ${rate} inn i ${phase}, med vilje, når kvaliteten øker.`,
	tableCaption: (name: string) =>
		`${name}: belastningen formen gir, hver uke som andel av første uke`,
	columns: { week: 'Uke', block: 'Blokk', role: 'Rolle', load: 'Belastning' },
	week: (week: number) => `Uke ${week}`,
	summary: (
		name: string,
		weeks: number,
		peak: string,
		peakWeek: number,
		recovery: number,
		taper: number,
	) =>
		`${name}: en belastning over ${nbWeeks(weeks)}. Den starter på volumet du starter fra og topper på ${peak} av det i uke ${peakWeek}. ${recovery === 1 ? '1 lett uke' : `${recovery} lette uker`} underveis, så trapper den ned over ${taper === 1 ? 'den siste uka' : `de siste ${taper} ukene`}. Hver uke står i tabellen som følger.`,
} as const

/**
 * A row's name under _Dagene i uka_: a sport's own word, said lower-case
 * inside a sentence (_dagene for sykling_), or a Simple Activity's title,
 * which is the athlete's and is said as they wrote it (_HIIT_, _Langrenn_).
 */
export type TrackDaysName = { text: string; activity: boolean }

function inSentence(name: TrackDaysName): string {
	return name.activity ? name.text : lowerFirst(name.text)
}

/**
 * _Dagene i uka_ under _Plan → Avansert_ (#598, ADR 0104 §4): the days of
 * every endurance track and Simple Activity — _La appen velge_ or weekday
 * chips, as for strength in Meg, with the coming weeks before the write and
 * _Angre_ after it.
 */
export const PLAN_TRACK_DAYS_LABELS = {
	title: 'Dagene i uka',
	intro:
		'Velg selv hvilke dager en idrett eller aktivitet ligger på, eller la appen legge dem rundt de andre.',
	/** A Simple Activity's row: its name, or the generic word. */
	activity: (title: string | null) => title ?? 'Enkel aktivitet',
	/** `Mandag, torsdag og lørdag`, or what a unit with no day says. */
	days: (days: readonly number[]) =>
		days.length === 0
			? 'Ingen dager ennå'
			: capitalize(nbJoin(days.map((day) => NB_WEEKDAY_LABELS[day % 7]!))),
	appChooses: 'appen velger',
	ownChoice: 'valgt selv',
	change: 'Endre',
	changeFor: (name: TrackDaysName) => `Endre dagene for ${inSentence(name)}`,
	modeLegend: 'Hvem velger dagene',
	auto: 'La appen velge',
	own: 'Velg dager',
	autoNote:
		'Appen gir den dagene de andre idrettene lar ligge, én økt om dagen, og den lange økta på den siste.',
	chipsLegend: (name: TrackDaysName) => `Dagene for ${inSentence(name)}`,
	chipsNote: 'Bare dagene du kan trene, fra profilen din.',
	chipsNoteNoAvailability:
		'Setter du treningsdagene dine i profilen, kan du bare velge blant dem.',
	ownNote:
		'Økta legges bare på disse dagene, og ukas mengde deles på dem. De harde øktene til de andre legges rundt.',
	/**
	 * Under the chips, where a chosen day left the athlete's Training
	 * Availability — a Simple Activity keeps it until they name a new one.
	 */
	notAvailable: (days: readonly number[]) =>
		`${capitalize(nbJoin(days.map((day) => NB_WEEKDAY_LABELS[day % 7]!)))} er ikke ${days.length === 1 ? 'en treningsdag' : 'treningsdager'} lenger. Ta ${days.length === 1 ? 'den' : 'dem'} bort, eller legg ${days.length === 1 ? 'den' : 'dem'} til i profilen din.`,
	activityNote:
		'En enkel aktivitet ligger alltid på dagene du velger. Økta er den samme hver gang.',
	preview: 'Se hva som endres',
	previewing: 'Henter de neste ukene …',
	previewHeading: 'De neste ukene',
	week: (isoWeek: number) => `Uke ${isoWeek}`,
	/** `Sykling onsdag og søndag`. */
	unitDays: (name: TrackDaysName, days: readonly number[]) =>
		days.length === 0
			? `Ingen ${inSentence(name)}`
			: `${name.text} ${nbJoin(days.map((day) => NB_WEEKDAY_LABELS[day % 7]!))}`,
	/** `harde økter tirsdag og lørdag`. */
	hard: (days: readonly number[]) =>
		days.length === 0
			? 'ingen harde økter'
			: `${days.length === 1 ? 'hard økt' : 'harde økter'} ${nbJoin(days.map((day) => NB_WEEKDAY_LABELS[day % 7]!))}`,
	was: (days: readonly number[]) =>
		`Før: ${days.length === 0 ? 'ingen dager' : nbJoin(days.map((day) => NB_WEEKDAY_LABELS[day % 7]!))}`,
	same: 'Som før',
	clashNote:
		'Dagene du velger, blir der du satte dem. Appen sier fra, men flytter dem ikke.',
	apply: 'Bruk',
	applying: 'Lagrer …',
	cancel: 'Avbryt',
	/** The toast after a write. */
	saved: (name: TrackDaysName, days: readonly number[] | null) =>
		days == null
			? `Appen velger dagene for ${inSentence(name)} igjen.`
			: `${name.text} ligger nå ${nbJoin(days.map((day) => NB_WEEKDAY_LABELS[day % 7]!))}.`,
	undo: 'Angre',
	undone: (name: TrackDaysName) => `Dagene for ${inSentence(name)} er som før.`,
	refusals: {
		'no-days': 'Velg minst én dag.',
		'outside-availability': 'Velg bare dager du kan trene.',
		stale: 'Planen endret seg mens du så på den. Se hva som endres igjen.',
		'no-plan': 'Fant ikke planen.',
		'no-pattern': 'Planen har ikke noe ukemønster ennå.',
		'no-unit': 'Fant ikke idretten i planen lenger.',
		'bad-restore': 'Kunne ikke sette dagene tilbake.',
	},
} as const

// ---------------------------------------------------------------------------

/** The first character lower-cased, so a name stays its own mid-sentence. */
function lowerFirst(value: string): string {
	return value ? value[0]!.toLowerCase() + value.slice(1) : value
}
