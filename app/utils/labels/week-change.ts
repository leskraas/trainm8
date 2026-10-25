/**
 * Ukeskiftet and the Week Replan (#505, ADR 0080): the week change card, its
 * proposals, reasons and refusals, the autopilot, Juster and Bytt økt, and the
 * replan's and the Session Nudge's sentences. Part of `labels.ts` (ADR 0081):
 * import from the barrel.
 */

// `import type`, for the runtime-leaf reason `labels.ts`'s header gives.
/* eslint-disable import/consistent-type-specifier-style */
import type {
	JusterIntent,
	JusterRefusal,
	JusterUndoRefusal,
	SwapSource,
} from '../juster.ts'
import type { UnlaidReason } from '../load/week-change.ts'
import type { UndoRefusal } from '../load/week-replan-undo.server.ts'
import type { WeekHoldWhy } from '../load/week-replan.ts'
import type { ClashReason } from '../plan-outline/day-rule.ts'
/* eslint-enable import/consistent-type-specifier-style */
import { capitalize, pct } from './_helpers.ts'
import { NB_READINESS_LABELS, nbDisciplineLabel } from './i-dag.ts'
import { nbWeeks } from './plan-domain.ts'
import { NB_WEEKDAY_LABELS } from './vocabulary.ts'

// ---------------------------------------------------------------------------
// Ukeskiftet, the week change card on I dag (#505 stories 4–6, 42–55, ADR 0080)
// ---------------------------------------------------------------------------

/** The card's fixed words. */
export const WEEK_CHANGE_LABELS = {
	heading: 'Ukeskiftet',
	weekThatWent: 'Uka som gikk',
	proposalsNextWeek: 'Forslag for neste uke',
	proposalsThisWeek: 'Forslag for denne uka',
	tooLate: 'For sent',
	goToCard: 'Se forslagene',
	missed: 'Ikke gjort',
	extras: 'Ekstra',
	nothingMissed: 'Alt planlagt ble gjort.',
	emptyWeek: 'Ingenting var planlagt eller gjort.',
	ok: 'Ok',
	no: 'Nei takk',
	saving: 'Lagrer …',
	scopeLegend: 'Hvor lenge?',
	thisTime: 'bare denne gangen',
	fromNowOn: 'fra nå av',
	own: 'din økt',
	ownNote: 'Endres bare hvis du sier ja.',
	addsLoad: 'mer trening',
	answeredOk: 'Du sa ok',
	answeredNo: 'Du sa nei takk',
	ease: 'Gjør uka lettere −15 %',
	easeNote: 'Gjør de øktene som er igjen ca. 15 % kortere. Én gang per uke.',
	eased: 'Uka er gjort lettere (−15 %).',
	easeNothing: 'Det var ingen økter igjen å gjøre lettere. Ukemålet står.',
	targetStands: 'Ukemålet står.',
	nothingChanged: 'Ingenting er endret.',
	allAnswered: 'Alt er besvart. Vi sees neste søndag.',
	close: 'Lukk',
	failed: 'Svaret ble ikke lagret. Prøv igjen.',
	factorLegend: 'Hvor mye trening i neste blokk?',
} as const

/** The line on I dag that leads to the card: `Ukeskiftet: 3 forslag venter`. */
export function weekChangeWaitingLabel(count: number): string {
	return `Ukeskiftet: ${count} forslag venter`
}

/**
 * I dag's top line (#505 owner decision 3, ADR 0086): the plan, its goal,
 * "+ Ny", the Ukeskiftet badge and the I dag pill on one compact row.
 */
export const TOP_LINE_LABELS = {
	region: 'Planen',
	noPlan: 'Ingen plan',
	/** The no-plan line's link, to Plan. */
	noPlanAction: 'Lag en i Plan',
	/** A race with no name, on the countdown. */
	raceDay: 'Løpsdagen',
	/**
	 * The Ukeskiftet badge: short on screen (`1 forslag` — the count, then
	 * this word, which gives way on the narrowest phones), whole in its name.
	 */
	weekChangeWord: 'forslag',
	weekChangeName: (count: number) =>
		`Ukeskiftet: ${count} forslag venter. Gå til forslagene`,
} as const

/**
 * The goal countdown on the top line: `Halvmaraton om 12 uker`, counted in
 * whole weeks the way an athlete counts them, and in days in the last week.
 */
export function eventCountdownLabel(name: string, days: number): string {
	return `${name} ${eventCountdownWhen(days)}`
}

/** The countdown half alone — `om 12 uker` — which the top line never cuts. */
export function eventCountdownWhen(days: number): string {
	if (days <= 0) return 'i dag'
	if (days === 1) return 'i morgen'
	if (days < 7) return `om ${days} dager`
	const weeks = Math.round(days / 7)
	return `om ${weeks} ${weeks === 1 ? 'uke' : 'uker'}`
}

/** A round's peak week before → after its factor: `Toppuka: 4,5 → 5 t`. */
export function roundPeakLabel(
	before: string,
	after: string,
	unit: string,
): string {
	return `Toppuka: ${before} → ${after} ${unit}`
}

/** "Gjort i morges" — a proposal silence applied, on the morning it did. */
export function silencedLabel(today: boolean, weekday: number): string {
	return today ? 'Gjort i morges' : `Gjort ${NB_WEEKDAY_LABELS[weekday]} morgen`
}

/** `«Terskel 5×5»`, or `økta` when the session has no title to quote. */
export function quotedSession(title: string | null): string {
	return title ? `«${title}»` : 'økta'
}

/** A round's volume against the one before: `samme volum`, `+5 % volum`. */
export function roundFactorLabel(factor: number): string {
	const percent = Math.round((factor - 1) * 100)
	if (percent === 0) return 'samme volum'
	return `${percent > 0 ? '+' : '−'}${Math.abs(percent)} % volum`
}

/** A softening or a lengthening, said as the change: `ca. 10 % kortere`. */
function scaleWords(factor: number): string {
	const percent = Math.round(Math.abs(1 - factor) * 100)
	return `ca. ${percent} % ${factor < 1 ? 'kortere' : 'lengre'}`
}

const weekdayOf = (weekday: number) => NB_WEEKDAY_LABELS[weekday]!

/**
 * What each proposal proposes, as its headline. The reason says why; this says
 * what — so the athlete reads the change before the argument for it.
 */
export const WEEK_CHANGE_PROPOSAL_LABELS = {
	keepWeek: 'Uka står som planlagt',
	letGo: (session: string) => `La ${session} gå`,
	makeUp: (session: string, toWeekday: number) =>
		`Ta igjen ${session} ${weekdayOf(toWeekday)}`,
	move: (session: string, fromWeekday: number, toWeekday: number) =>
		`Flytt ${session} fra ${weekdayOf(fromWeekday)} til ${weekdayOf(toWeekday)}`,
	scale: (session: string, weekday: number | null, factor: number) =>
		weekday == null
			? `${session} ${scaleWords(factor)}`
			: `${session} ${weekdayOf(weekday)} ${scaleWords(factor)}`,
	scaleWeek: (factor: number) => `Uka ${scaleWords(factor)}`,
	swap: (session: string, other: string) =>
		`Bytt dag på ${session} og ${other}`,
	add: (weekday: number) => `Legg til en økt ${weekdayOf(weekday)}`,
	round: (name: string, weeks: number, factor: number) =>
		`${name}: ${nbWeeks(weeks)}, ${roundFactorLabel(factor)}`,
} as const

/**
 * What an answer did, said once it is given — what changed, and what did not
 * (#505 story 39's rule, here for the week change): a session moved or eased
 * never moves the Week Target, so the line says the target stands.
 */
export const WEEK_CHANGE_DONE_LABELS = {
	keepWeek: 'Ingenting er endret. Ukemålet står.',
	letGo: (session: string) =>
		`${session} står som ikke gjort. Ingenting er flyttet.`,
	makeUp: (session: string, toWeekday: number) =>
		`${session} er lagt inn igjen ${weekdayOf(toWeekday)}. Den gamle står som ikke gjort. Ukemålet står.`,
	moveThisTime: (session: string, toWeekday: number) =>
		`${session} er flyttet til ${weekdayOf(toWeekday)}, bare denne gangen. Ukemålet står.`,
	moveFromNowOn: (session: string, toWeekday: number) =>
		`${session} er flyttet til ${weekdayOf(toWeekday)}, også de neste ukene. Ukemålet står.`,
	scale: (session: string, factor: number) =>
		`${session} er gjort ${scaleWords(factor)}. Ukemålet står.`,
	scaleWeek: (factor: number) =>
		`Uka er gjort ${scaleWords(factor)}. Ukemålet står.`,
	swap: (session: string, other: string) =>
		`${session} og ${other} har byttet dag. Ukemålet står.`,
	add: (weekday: number) =>
		`Økta er lagt til ${weekdayOf(weekday)}. Ukemålet står.`,
	round: (name: string, factor: number) =>
		`${name} er lagt til planen, ${roundFactorLabel(factor)}.`,
	/** A pending proposal whose session passed before it was answered. */
	tooLateToAnswer:
		'Økta er allerede passert, så forslaget kan ikke brukes lenger. Ingenting er endret.',
	/** An Ok that found its session already past or gone. */
	tooLate: 'Økta var allerede passert eller borte, så ingenting ble endret.',
	declined: (session: string) => `${session} står som den var. Ukemålet står.`,
	declinedWeek: 'Ingenting er endret. Ukemålet står.',
	declinedAdd: 'Ingenting er lagt til. Ukemålet står.',
	declinedMakeUp: (session: string) =>
		`${session} står som ikke gjort, og blir ikke tatt igjen. Ukemålet står.`,
	declinedRound: 'Ingen ny blokk ennå. Vi spør igjen neste søndag.',
	/** An Ok on a round whose plan has changed shape since it was proposed. */
	roundNotApplied:
		'Planen er endret siden forslaget, så ingen blokk ble lagt til.',
	/** "Gjør uka lettere" done, with the week's planned sum before and after. */
	eased: (before: string, after: string, unit: string) =>
		`Uka: ${before} → ${after} ${unit} planlagt. Ukemålet står.`,
} as const

/** Why the server turned an answer on the card down, said to the athlete. */
export const WEEK_CHANGE_REFUSAL_LABELS: Record<
	| 'not-found'
	| 'already-answered'
	| 'already-applied'
	| 'scope-not-a-move'
	| 'scope-not-for-a-make-up'
	| 'factor-not-a-round'
	| 'factor-out-of-range'
	| 'not-a-week'
	| 'not-the-coming-week'
	| 'already-eased'
	| 'autopilot',
	string
> = {
	'not-found': 'Fant ikke forslaget.',
	'already-answered': 'Forslaget er allerede besvart.',
	'already-applied': 'Forslaget er allerede gjort.',
	'scope-not-a-move': 'Bare en flytting kan gjelde fra nå av.',
	'scope-not-for-a-make-up': 'En økt som tas igjen gjelder bare denne gangen.',
	'factor-not-a-round': 'Bare en ny blokk har et volum å velge.',
	'factor-out-of-range': 'Velg et volum mellom −50 % og +50 %.',
	'not-a-week': 'Det er ikke en uke.',
	'not-the-coming-week': 'Bare uka etter ukeskiftet kan gjøres lettere.',
	'already-eased': 'Uka er allerede gjort lettere.',
	autopilot: 'Autopiloten har allerede lagt ut denne uka.',
}

/** The coming week's planned sum, under the ease action: `Neste uke: 44 km planlagt`. */
export function easePlannedLabel(
	weekName: string,
	figure: string,
	unit: string,
): string {
	return `${weekName}: ${figure} ${unit} planlagt`
}

/**
 * The facts a held week's reason is worded from, already formatted: the
 * overshoot and the shortfall as `25 %`, the form as `−12`, and the trust gate's
 * days.
 */
export type WeekHoldFacts = {
	over: string
	under: string
	tsb: string
	requiredDays: number
	daysOfHistory: number
}

/** "Forrige uke ble 25 % tyngre enn planlagt" — the overshoot, said once. */
function overClause(over: string): string {
	return `Forrige uke ble ${over} tyngre enn planlagt`
}

/**
 * Why the Week Replan holds a week (#505 story 50: "keep" is a real proposal
 * with a reason), one sentence per branch of ADR 0025's judgment.
 */
export const WEEK_HOLD_REASON_LABELS: Record<
	WeekHoldWhy,
	(facts: WeekHoldFacts) => string
> = {
	'no-adherence': () =>
		'Forrige uke hadde ingen planlagt belastning å måle mot, så vi har for lite å gå på. Denne uka står som planlagt.',
	under: ({ under }) =>
		`Forrige uke ble ${under} lettere enn planlagt. Vi legger ikke på noe ekstra – denne uka står som planlagt.`,
	'on-target': () =>
		'Forrige uke gikk som planlagt. Denne uka står som den er.',
	'form-untrusted': ({ over, requiredDays, daysOfHistory }) =>
		`${overClause(over)}, men formtallet er først til å stole på etter ${requiredDays} dager (dag ${daysOfHistory} av ${requiredDays}). Vi endrer ingenting ennå.`,
	'form-missing': ({ over }) =>
		`${overClause(over)}, men vi har ikke noe formtall. Uten det endrer vi ingenting.`,
	fresh: ({ over, tsb }) =>
		`${overClause(over)}, men formen er ${tsb} – du tåler det. Denne uka står som planlagt.`,
	'nothing-adjustable': ({ over, tsb }) =>
		`${overClause(over)} og formen er ${tsb}, men det er ingen økter igjen denne uka som kan gjøres lettere. Vi endrer ingenting.`,
}

/**
 * A clash of the cross-track day rule (#589, ADR 0104 §1) as a clause that
 * names its days: `day` is the day it is on and `next` the day after, which
 * only the two-day reasons read. Weekdays as {@link NB_WEEKDAY_LABELS} say
 * them. Never a number: the rule reads kinds of days (ADR 0046).
 */
export const CLASH_REASON_LABELS: Record<
	ClashReason,
	(day: string, next: string) => string
> = {
	'lifting-on-hard-day': (day) => `${day} får både styrke og en hard økt`,
	'lifting-before-hard-day': (day, next) =>
		`${day} får styrke dagen før en hard økt ${next}`,
	'lifting-on-long-day': (day) => `${day} får både styrke og en langtur`,
	'hard-days-in-a-row': (day, next) =>
		`${day} og ${next} blir harde dager på rad`,
	'two-hard-sessions': (day) => `${day} får to harde økter`,
	'two-long-sessions': (day) => `${day} får to langturer`,
	'easy-before-hard-day': (day, next) =>
		`${day} får en rolig økt dagen før en hard økt ${next}`,
}

/**
 * Said after a Week Replan move when no free day fits the day rule (#596): the
 * move took the first free day anyway, and this says what that day gets.
 */
function noFittingDay(clash: string | null): string {
	return clash ? ` Ingen ledig dag passer helt denne uka – ${clash}.` : ''
}

/**
 * The Week Replan's proposal reasons (#505 story 44, ADR 0080), as the
 * deterministic author (`propose-week-change.ts`) writes them. Never worded as
 * though anything were already applied: nothing has changed when they are
 * written.
 */
export const WEEK_CHANGE_REASON_LABELS = {
	/** One session softened: `over` and `cut` as `25 %`, `tsb` as `−12`. */
	scale: (over: string, tsb: string, cut: string) =>
		`${overClause(over)}, og formen er ${tsb}. Vi foreslår å gjøre denne økta ca. ${cut} kortere.`,
	/** Said after a proposal on one of the athlete's own sessions. */
	theirs: 'Dette er din økt, så den endres bare hvis du sier ja.',
	/** A missed session, which stays on its day either way (story 53). */
	notDone: (title: string, weekday: string) =>
		`«${title}» ble ikke gjort ${weekday}, og står der som ikke gjort.`,
	letGoHeavyWeek: (notDone: string) =>
		`${notDone} Uka var tung nok likevel, så vi foreslår å la den gå.`,
	/** `clash`: what the day gets when no free day fits (#596), else null. */
	makeUp: (notDone: string, weekday: string, clash: string | null) =>
		`${notDone} Vil du ta den igjen ${weekday}? Den dagen er ledig.${noFittingDay(clash)} Det gir mer trening denne uka, så den legges bare inn hvis du sier ja.`,
	letGoNoFreeDay: (notDone: string) =>
		`${notDone} Det er ingen ledig dag igjen denne uka, så vi foreslår å la den gå.`,
	letGo: (notDone: string) =>
		`${notDone} Vi foreslår å la den gå, så uka ikke blir for full.`,
	/** A slot missed two closed weeks running, moved to a free day. */
	slotMove: (
		title: string,
		slot: string,
		toWeekday: string,
		clash: string | null,
	) =>
		`«${title}» ble ikke gjort ${slot} to uker på rad. Kanskje ${slot} ikke passer? Vi foreslår å flytte den til ${toWeekday}, som er ledig – bare denne gangen, eller fra nå av.${noFittingDay(clash)}`,
	/** The week-level sentences for a week with changes proposed. */
	weekSoften: (over: string, tsb: string, cut: string) =>
		`${overClause(over)}, og formen er ${tsb}. Vi foreslår å gjøre de neste øktene ca. ${cut} kortere.`,
	weekMakeUp:
		'En økt forrige uke ble ikke gjort. Vi foreslår å ta den igjen, men bare hvis du sier ja.',
	weekSlotMove:
		'En økt er ikke gjort to uker på rad. Vi foreslår å flytte den til en dag som er ledig.',
	/** The athlete's own "Gjør uka lettere −15 %" (story 51), as its reason. */
	easeWeek:
		'Du ba om en lettere uke, så de øktene som er igjen er gjort ca. 15 % kortere.',
} as const

/** The reason sentences' shape, whichever mode they are worded for. */
type WeekChangeReasonWords = {
	[K in keyof typeof WEEK_CHANGE_REASON_LABELS]: (typeof WEEK_CHANGE_REASON_LABELS)[K] extends string
		? string
		: (typeof WEEK_CHANGE_REASON_LABELS)[K]
}

/**
 * The same reasons for a week closed under **Autopilot** (#576, ADR 0100):
 * the same author and the same rules, worded as what the close does, since
 * nothing waits for a yes — the Autopilot Notice shows them as stored. A
 * make-up is never placed by the autopilot (§3), so its reason says the
 * missed session was let go; a proposal on the athlete's own session says
 * the session stands.
 */
export const AUTOPILOT_REASON_LABELS: WeekChangeReasonWords = {
	scale: (over, tsb, cut) =>
		`${overClause(over)}, og formen er ${tsb}. Økta er gjort ca. ${cut} kortere.`,
	theirs: 'Dette er din økt, så den står.',
	notDone: WEEK_CHANGE_REASON_LABELS.notDone,
	letGoHeavyWeek: (notDone) =>
		`${notDone} Uka var tung nok likevel, så vi lar den gå.`,
	makeUp: (notDone) =>
		`${notDone} Å ta den igjen ville gitt mer trening på en dag du ikke har valgt, så vi lar den gå. Du kan legge den inn selv.`,
	letGoNoFreeDay: (notDone) =>
		`${notDone} Det er ingen ledig dag igjen denne uka, så vi lar den gå.`,
	letGo: (notDone) => `${notDone} Vi lar den gå, så uka ikke blir for full.`,
	slotMove: (title, slot, toWeekday, clash) =>
		`«${title}» ble ikke gjort ${slot} to uker på rad, så den er flyttet til ${toWeekday}, som er ledig. Bare denne gangen.${noFittingDay(clash)}`,
	weekSoften: (over, tsb, cut) =>
		`${overClause(over)}, og formen er ${tsb}. De neste øktene er gjort ca. ${cut} kortere.`,
	weekMakeUp:
		'En økt forrige uke ble ikke gjort. Den står som ikke gjort, og vi la ikke inn en ekstra.',
	weekSlotMove:
		'En økt er ikke gjort to uker på rad, så den er flyttet til en dag som er ledig.',
	easeWeek: WEEK_CHANGE_REASON_LABELS.easeWeek,
}

/** "Lås opp" on one of the athlete's own planned rows (#505 story 55). */
export const RELEASE_ACTION_LABELS = {
	action: 'Lås opp',
	/** The button's accessible name: which session it hands back. */
	actionFor: (title: string) => `Lås opp ${title}`,
	note: 'Gi økta tilbake til appen, så den kan justere den igjen.',
	released: 'Låst opp. Appen kan justere økta igjen.',
	notFound: 'Fant ikke økta. Den kan være slettet.',
} as const

// ---------------------------------------------------------------------------
// The three tabs
// ---------------------------------------------------------------------------

/**
 * The Autopilot Notice on I dag (#576, ADR 0100 §5): what the autopilot wrote
 * at the close, one line each with its stored reason and _Angre_, and _Angre
 * alt_. It states; it never asks. The lines the reason does not word itself —
 * a session left alone, a step held by the guards — are worded here.
 */
export const AUTOPILOT_NOTICE_LABELS = {
	heading: 'Neste uke er lagt ut',
	region: 'Autopiloten',
	/** What one line is about, when its reason does not say: `«Rolig tur» · onsdag`. */
	subject: (title: string, weekday: string) => `«${title}» · ${weekday}`,
	/** ADR 0100 §3: the athlete's own session stands, and the notice says so. */
	leftAlone: (weekday: string, title: string) =>
		`${capitalize(weekday)}ens «${title}» er din, den står.`,
	leftAloneUnnamed: 'Økta er din, så den står.',
	notPlacedExtra:
		'En ekstra økt ble ikke lagt inn: autopiloten legger ikke inn mer trening på en dag du ikke har valgt.',
	overGuard: (percent: string) =>
		`Endringen ville gitt mer enn ${percent} mer trening på én gang, så den er ikke gjort.`,
	gone: (title: string) =>
		`«${title}» var allerede gjort, flyttet eller slettet, så den ble ikke endret.`,
	goneUnnamed: 'Det var ingenting igjen å endre.',
	undo: 'Angre',
	undoFor: (what: string) => `Angre: ${what}`,
	undoing: 'Angrer …',
	undone: 'Angret',
	undoAll: 'Angre alt',
	undoAllFor: (count: number) => `Angre alle ${count} endringene`,
	/** The toast after an _Angre_. */
	undoneToast: 'Endringen er angret. Økta er som før.',
	undoneAllToast: (count: number) =>
		count === 1
			? 'Endringen er angret.'
			: `${count} endringer er angret. Uka er som før.`,
	nothingToUndo: 'Det var ingenting å angre.',
	/** ADR 0100 §4: the window has closed, said once under the lines. */
	closed: 'Uka har begynt, så endringene kan ikke angres lenger.',
	easeHeading: 'Vil du ha en lettere uke?',
	/** #580: from the Monday of the week it laid, that is this week, not the next. */
	headingThisWeek: 'Denne uka er lagt ut',
	/** #580: a past notice at its week in _Se hele sesongen_. */
	historyHeading: 'Lagt ut av autopiloten',
	/**
	 * #580, spec #558 story 88: a week the close could not lay, said with the
	 * reason, so an empty week never passes in silence. `week` is its Monday,
	 * `mandag 28. januar`.
	 */
	unlaid: (reason: UnlaidReason, week: string) =>
		`Uka fra ${week} ble ikke lagt ut${UNLAID_REASON_TAILS[reason]}`,
	/**
	 * #583: once, on the first notice of an athlete the switch to autopilot was
	 * news to — what changed, and where the old way is.
	 */
	intro:
		'Nytt: appen legger nå ut ukene dine selv, ut fra det du faktisk trente. Vil du heller si ja til endringene først, velg «Spør meg først» i Meg.',
	introLink: 'Gå til Ukeplanen i Meg',
} as const

/** Why a week was not laid, as the end of the notice's sentence (#580). */
const UNLAID_REASON_TAILS: Record<UnlaidReason, string> = {
	'no-pattern': ': planen har ikke noe ukemønster å legge den etter.',
	'past-plan-end': ': den ligger etter slutten av planen.',
	'nothing-to-lay': ': planen hadde ingen økter å legge den uka.',
	error: ' fordi noe gikk galt. Appen prøver igjen snart.',
}

/** Why an _Angre_ on the Autopilot Notice was refused (ADR 0100 §4, ADR 0088). */
export const AUTOPILOT_UNDO_REFUSAL_LABELS: Record<UndoRefusal, string> = {
	'not-found': 'Fant ikke endringen.',
	'not-applied': 'Endringen ble aldri gjort, så det er ingenting å angre.',
	'no-before-image': 'Denne endringen kan ikke angres.',
	'week-begun': 'Uka har begynt, så endringen kan ikke angres lenger.',
	'session-trained':
		'En økt endringen gjaldt er allerede trent, så den kan ikke angres.',
	'session-taken-over':
		'Du har endret økta selv etterpå, så den står som du la den.',
}

/**
 * The Autopilot setting in Meg (#576, ADR 0100 §1 and §6): on, the app lays
 * out each week by itself; _Spør meg først_ brings back the Week Change Card.
 */
export const AUTOPILOT_SETTING_LABELS = {
	title: 'Ukeplanen',
	legend: 'Hvordan neste uke legges ut',
	autopilot: 'Autopilot',
	autopilotDetail:
		'Appen legger ut neste uke hver søndag kveld ut fra det du faktisk gjorde. Den sier hva den endret, og du kan angre. Øktene du har lagt selv, endres aldri.',
	ask: 'Spør meg først',
	askDetail:
		'Appen foreslår endringene søndag kveld og venter på ditt ja i Ukeskiftet.',
	fromNextClose: 'Gjelder fra neste ukeskifte, søndag kveld.',
	saving: 'Lagrer …',
	saved: 'Lagret.',
	failed: 'Det ble ikke lagret. Prøv igjen.',
} as const

/**
 * **Juster** on the today card (spec #558 S5, ADR 0100 §7): the three chips
 * right above _Gjort_, what each says it did, the Replan Note it leaves on the
 * session, and why one could not act or be taken back.
 */
export const JUSTER_LABELS = {
	/** The chips' group, for a screen reader. */
	group: 'Juster dagens økt',
	chip: {
		tired: 'For sliten i dag',
		short: 'Lite tid',
		move: 'Bytt dag',
	} satisfies Record<JusterIntent, string>,
	/** A chip's name with the session it changes. */
	chipFor: (chip: string, title: string) => `${chip}: «${title}»`,
	/** On the chip while its change goes out. */
	working: 'Endrer …',
	/** The toast: what changed. The session's title is quoted under it. */
	done: {
		/** A lift states no time, so it says none. */
		tired: (duration: string | null) =>
			duration
				? `Dagens økt er rolig nå, ${duration}.`
				: 'Dagens økt er rolig nå.',
		short: (duration: string | null) =>
			duration
				? `Dagens økt er kortet ned til ${duration}.`
				: 'Dagens økt er kortet ned.',
		moved: (day: string) => `Økta er flyttet til ${day}.`,
		swapped: (day: string, other: string) =>
			`Økta er flyttet til ${day}, og «${other}» er i dag.`,
		swappedSession: (title: string) => `Dagens økt er byttet til «${title}».`,
		/**
		 * _Bytt dag_ when every free day clashed (spec #588 story 30): the
		 * first free day, and in the same line why it lands there.
		 */
		movedAnyway: (day: string, why: string) =>
			`Økta er flyttet til ${day}, ${why}. Ingen ledig dag passet bedre.`,
	},
	/**
	 * Why a moved session's day clashes (ADR 0104 §1), said from the moved
	 * session: `lifting` when it is a lift, `after` when it is the second day
	 * of a two-day clash (the day after a lift, or after another hard day).
	 */
	clash: {
		'lifting-on-hard-day': ({ lifting }) =>
			lifting ? 'samme dag som en hard økt' : 'samme dag som styrke',
		'lifting-before-hard-day': ({ after }) =>
			after ? 'dagen etter styrke' : 'dagen før en hard økt',
		'lifting-on-long-day': ({ lifting }) =>
			lifting ? 'samme dag som langturen' : 'samme dag som styrke',
		'hard-days-in-a-row': ({ after }) =>
			after ? 'dagen etter en annen hard økt' : 'dagen før en annen hard økt',
		'two-hard-sessions': () => 'samme dag som en annen hard økt',
		'two-long-sessions': () => 'samme dag som en annen langtur',
		'easy-before-hard-day': () => 'dagen før en hard økt',
	} satisfies Record<
		ClashReason,
		(as: { lifting: boolean; after: boolean }) => string
	>,
	/** The Replan Note each change leaves on the session it changed. */
	note: {
		tired: 'For sliten i dag: gjort rolig og kortere.',
		short: 'Lite tid: kortet ned.',
		moved: (day: string) => `Flyttet fra ${day} med Bytt dag.`,
	},
	/** _Angre_ took the change back. */
	undone: (title: string | null) =>
		title ? `Angret. «${title}» står som før.` : 'Angret. Økta står som før.',
	/** Why a chip could not act, said where the chips are. */
	refused: {
		'session-not-found': 'Fant ikke økta. Den kan være slettet.',
		'not-today': 'Juster endrer bare dagens økt.',
		'not-open': 'Økta er allerede gjort eller merket som ikke gjort.',
		'no-workout': 'Økta har ingen plan å endre.',
		'no-time': 'Økta har ingen tid å korte ned fra.',
		'already-short': 'Økta er allerede kort, 20 minutter eller mindre.',
		'already-easy': 'Økta er allerede rolig og så kort den kan bli.',
		'no-later-day': 'Det er ingen dager igjen denne uka å flytte til.',
		'pick-not-found': 'Fant ikke økta i Bibliotek. Velg en annen.',
	} satisfies Record<JusterRefusal, string>,
	/** Why an _Angre_ was turned down. */
	undoRefused: {
		'not-found': 'Fant ikke endringen. Økta kan være slettet.',
		'session-trained': 'Det kan ikke angres lenger: økta er trent.',
		changed: 'Det kan ikke angres lenger: økta er endret igjen siden.',
	} satisfies Record<JusterUndoRefusal, string>,
} as const

/**
 * _Bytt økt_ and _Avansert_, the today card's last two chips (spec #558 S5,
 * #579): Bibliotek as a picker for today's session, and the way to the power
 * tools — the session itself, the composer and Plan's Avansert.
 */
export const BYTT_OKT_LABELS = {
	chip: 'Bytt økt',
	/** The picker sheet. */
	title: 'Bytt økt',
	description: (title: string) =>
		`Velg en økt fra Bibliotek i stedet for «${title}».`,
	/** Bibliotek's three parts, as the picker's tabs. */
	sources: {
		catalogue: 'Katalog',
		program: 'Program',
		exercise: 'Øvelser',
	} satisfies Record<SwapSource, string>,
	sourcesLabel: 'Hvor i Bibliotek',
	search: {
		catalogue: 'Søk i katalogen',
		program: 'Søk i programmene',
		exercise: 'Søk etter øvelse',
	} satisfies Record<SwapSource, string>,
	/** Over the exercise list: what one exercise becomes. */
	exerciseHint:
		'Én øvelse blir dagens økt: settene du la inn sist, ellers 3 × 8.',
	recentLifts: 'Dine løft',
	loading: 'Henter …',
	none: (query: string) => `Fant ingenting med «${query}».`,
	empty: {
		catalogue: 'Katalogen er tom.',
		program: 'Ingen program ennå.',
		exercise: 'Søk etter en øvelse for å ta den i dag.',
	} satisfies Record<SwapSource, string>,
	/** Under a capped list. */
	more: (shown: number, total: number) =>
		`Viser ${shown} av ${total}. Søk for å finne flere.`,
	/** A pick's name for a screen reader. */
	pickFor: (title: string) => `Ta «${title}» i dag`,
	picking: 'Bytter …',
	close: 'Lukk',
	/** The fourth chip, and its menu. */
	advanced: 'Avansert',
	advancedFor: (title: string) => `Avansert for «${title}»`,
	advancedMenu: {
		session: 'Rediger økta',
		composer: 'Ny økt i dag',
		plan: 'Planens verktøy',
	},
} as const

// ===========================================================================
// Cross-cutting polish (#505 round 2): the Week Replan's and the Session
// Nudge's own sentences, in Norwegian at their source (ADR 0081). One section
// of its own so the area PRs that also add to this file merge cleanly.
// ===========================================================================

/**
 * ADR 0025's applied softening — the `adjusted` decision's per-session Replan
 * Note and its week-level reason. Past tense, because an `adjusted` row is one
 * the applier already rescaled. `over` and `cut` as `25 %`, `tsb` as `−12`.
 */
export const WEEK_REPLAN_SOFTENED_LABELS = {
	session: (over: string, tsb: string, cut: string) =>
		`${overClause(over)}, og formen var ${tsb}. Denne økta ble gjort ca. ${cut} kortere.`,
	week: (over: string, tsb: string, cut: string) =>
		`${overClause(over)}, og formen var ${tsb}. Resten av ukas økter ble gjort ca. ${cut} kortere.`,
} as const

/**
 * The Session Nudge's reason (`decideSessionNudge`), one sentence per branch.
 * `weekday` is `tirsdag` (`formatNbWeekday`), `discipline` an id (`run`).
 */
export const SESSION_NUDGE_LABELS = {
	/** Why the coach backs off: sustained over-plan, or low Form. */
	overPlan: (weeks: number) => `Over planen ${weeks} uker på rad`,
	formLow: (tsb: string | null) =>
		tsb == null ? 'Formen er lav' : `Formen er lav (TSB ${tsb})`,
	/** Why the next session stands: sustained under-plan, or Form fine. */
	underPlan: (weeks: number) => `Under planen ${weeks} uker på rad`,
	formReads: (tone: 'fresh' | 'neutral', tsb: string | null) =>
		tsb == null
			? `Formen er ${NB_READINESS_LABELS[tone]}`
			: `Formen er ${NB_READINESS_LABELS[tone]} (TSB ${tsb})`,
	missed: (weekday: string) => `Økta ${weekday} ble ikke gjort`,
	/** What the eased session became; `minutes` null when its length is unknown. */
	easedTo: (minutes: number | null, cap: number) =>
		minutes == null
			? 'en rolig økt i sone 2'
			: minutes >= cap
				? 'en rolig time i sone 2'
				: `en rolig økt på ${minutes} min i sone 2`,
	eased: (signal: string, weekday: string, to: string) =>
		`${signal} – økta ${weekday} er gjort om til ${to}.`,
	easedAfterMiss: (signal: string, weekday: string, to: string) =>
		`${signal} – økta ${weekday} er gjort om til ${to}, så du ikke legger harde dager tett etter et opphold.`,
	easing: (signal: string) => `${signal} – neste økt blir gjort lettere.`,
	heldNoEase: (discipline: string) =>
		`Neste økt er ${nbDisciplineLabel(discipline).toLowerCase()}, og den kan ikke lettes etter formen ennå.`,
	heldAfterMissNoEase: (signal: string, discipline: string) =>
		`${signal} – neste økt er ${nbDisciplineLabel(discipline).toLowerCase()}, og den kan ikke lettes etter formen ennå.`,
	coldStart: (day: number, required: number) =>
		`Formtallet er til å stole på etter ${required} dager (dag ${day} av ${required}).`,
	stands: (signal: string) => `${signal} – neste økt står som planlagt.`,
} as const

/**
 * A stored Week Replan sentence, in Norwegian. Rows written before #505 round 2
 * hold `decideWeekReplan`'s English (the week's `WeekReplan.reason`, and ADR
 * 0025's per-session `replanReason`); this rewrites each of that composer's
 * eight known sentences — a closed set, from one file, with numbers in fixed
 * places — into the sentence the generator now writes. Anything else (every
 * row written since, all already Norwegian) passes through untouched, so it is
 * safe on any stored reason. Display only: nothing is written back.
 */
export function nbStoredReplanReason(stored: string): string {
	for (const [pattern, words] of LEGACY_REPLAN_REASONS) {
		const match = pattern.exec(stored)
		if (match) return words(match.slice(1))
	}
	return stored
}

/** The facts a sentence that names none of them is given. */
const NO_FACTS: WeekHoldFacts = {
	over: '',
	under: '',
	tsb: '',
	requiredDays: 0,
	daysOfHistory: 0,
}

const OVER = String.raw`Last week ran (\d+)% over plan`

const TSB = String.raw`([+−-]?\d+)`

const LEGACY_REPLAN_REASONS: ReadonlyArray<
	readonly [RegExp, (groups: Array<string | undefined>) => string]
> = [
	[
		/^Last week has no measurable Plan Adherence — no adjustment, not enough data\.$/,
		() => WEEK_HOLD_REASON_LABELS['no-adherence'](NO_FACTS),
	],
	[
		/^Last week ran (\d+)% under plan — bank the planned work; this week stands as planned\.$/,
		([under]) =>
			WEEK_HOLD_REASON_LABELS.under({ ...NO_FACTS, under: pct(under) }),
	],
	[
		/^Last week matched the plan — this week stands as planned\.$/,
		() => WEEK_HOLD_REASON_LABELS['on-target'](NO_FACTS),
	],
	[
		new RegExp(
			String.raw`^${OVER}, but your Form reading is reliable after (\d+) days — day (\d+)/\d+ — no adjustment yet\.$`,
		),
		([over, required, day]) =>
			WEEK_HOLD_REASON_LABELS['form-untrusted']({
				...NO_FACTS,
				over: pct(over),
				requiredDays: Number(required),
				daysOfHistory: Number(day),
			}),
	],
	[
		new RegExp(
			String.raw`^${OVER}, but Form is unavailable — no adjustment without it\.$`,
		),
		([over]) =>
			WEEK_HOLD_REASON_LABELS['form-missing']({ ...NO_FACTS, over: pct(over) }),
	],
	[
		new RegExp(
			String.raw`^${OVER} but Form is ${TSB} — you're absorbing it, so this week stands as planned\.$`,
		),
		([over, tsb]) =>
			WEEK_HOLD_REASON_LABELS.fresh({
				...NO_FACTS,
				over: pct(over),
				tsb: tsb ?? '',
			}),
	],
	[
		new RegExp(
			String.raw`^${OVER} and Form was ${TSB}, but nothing in the coming week can be softened — no change made\.$`,
		),
		([over, tsb]) =>
			WEEK_HOLD_REASON_LABELS['nothing-adjustable']({
				...NO_FACTS,
				over: pct(over),
				tsb: tsb ?? '',
			}),
	],
	[
		new RegExp(
			String.raw`^${OVER} and Form was ${TSB} — softened (this session|this week's remaining sessions) ~(\d+)%\.$`,
		),
		([over, tsb, subject, cut]) =>
			WEEK_REPLAN_SOFTENED_LABELS[
				subject === 'this session' ? 'session' : 'week'
			](pct(over), tsb ?? '', pct(cut)),
	],
]
