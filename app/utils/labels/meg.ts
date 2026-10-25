/**
 * Meg and its sub-pages (round 2, ADR 0081, ADR 0083): profile, sign-in and
 * security, training settings, zones, thresholds, the gym and lifts. Part of
 * `labels.ts`: import from the barrel.
 */

// `import type`, for the runtime-leaf reason `labels.ts`'s header gives.
/* eslint-disable import/consistent-type-specifier-style */
import type {
	EstimateConfidence,
	EstimateRefusal,
	ThresholdConstruct,
	ThresholdProtocol,
} from '../profile-analysis/types.ts'
import type { RepLoadBasis } from '../strength/anchors.constants.ts'
import type { OneRmRefusal } from '../strength/one-rm.ts'
import type { PlateRefusal } from '../strength/plates.ts'
import type { AnchorProtocol, EstimatorName } from '../strength-log.ts'
import type { ZoneAnchor } from '../zones/types.ts'
/* eslint-enable import/consistent-type-specifier-style */
import { nbJoin } from './_helpers.ts'
import { NB_WEEKDAY_LABELS } from './vocabulary.ts'

// ---------------------------------------------------------------------------
// Events pages (`/training/events`, new, detail, edit) in Norwegian (ADR 0081,
// round 2): the list, the form, the detail and its dialogs. The English
// `EVENT_*_LABELS` above stay for any caller still on them.
// ---------------------------------------------------------------------------

/**
 * Meg (spec #505 story 59): the account, the training settings, the
 * intervals.icu connection and the file upload — imports have no page of their
 * own.
 */
export const ME_LABELS = {
	profileDetail:
		'Profil, e-post, passord, totrinns, passnøkler og dataene dine',
	settings: 'Innstillinger',
	training: 'Trening og terskler',
	integrations: 'Koblinger',
	upload: 'Last opp en aktivitetsfil',
	uploadDetail: '.fit, .tcx eller .gpx fra en klokke eller en annen app',
	logout: 'Logg ut',
} as const

/**
 * _Løpsresultater_ in Meg (#464, ADR 0007 as amended): the athlete's own race
 * and time-trial results, which race-pace steps resolve against.
 */
export const MEG_RESULTS_LABELS = {
	title: 'Løpsresultater',
	detail: (count: number) =>
		count === 0
			? 'Gir fart til økter med løpsfart'
			: count === 1
				? '1 resultat'
				: `${count} resultater`,
	intro:
		'Løp og testløp du har gjort. Økter som sier «10 km-fart» regner farten sin fra ditt nyeste resultat på den distansen.',
	typedNote: 'Skrevet inn av deg — ikke målt av appen.',
	none: 'Ingen resultater ennå.',
	add: 'Legg til resultat',
	distance: 'Distanse',
	time: 'Tid',
	timeHint: 'Som klokka viste den: 41:30 eller 1:32:00',
	date: 'Dato',
	source: 'Type',
	sources: {
		race: 'Løp',
		timeTrial: 'Testløp',
		trainingSegment: 'Del av en økt',
	},
	save: 'Lagre resultat',
	delete: 'Slett',
	deleteLabel: (what: string) => `Slett ${what}`,
	invalid: 'Sjekk distanse, tid og dato.',
	badTime: 'Skriv tiden som 41:30 eller 1:32:00.',
	badDate: 'Velg en dato som finnes.',
	implausible:
		'Tiden passer ikke til distansen. Har løpet timer, skriv dem med: 3:15:00.',
	future: 'Datoen kan ikke være fram i tid.',
	noProfile: 'Fullfør oppstarten først, så kan du lagre resultater.',
	saved: 'Resultatet er lagret.',
	replaced: 'Resultatet er lagret i stedet for det du hadde samme dag.',
	notDeleted: 'Fant ikke resultatet. Last siden på nytt.',
} as const

/**
 * _Styrkeøkter i uka_ in Meg (#574, ADR 0103): the athlete's own **Strength
 * Frequency** answer, and that it changes no plan already made.
 */
export const MEG_STRENGTH_LABELS = {
	title: 'Styrkeøkter i uka',
	intro:
		'Hvor mange styrkeøkter du vil ha i uka. Det er ditt eget svar, og appen gjetter det aldri.',
	unanswered: 'Ikke valgt ennå.',
	answered: (count: number) =>
		`Du har valgt ${count} ${count === 1 ? 'styrkeøkt' : 'styrkeøkter'} i uka.`,
	/** Meg's row detail. */
	detail: (count: number | null) =>
		count == null ? 'Ikke valgt' : `${count} i uka`,
	planNote:
		'Planen du har nå, endres ikke av dette. Styrkedagene i den flytter du i Plan.',
	invalid: 'Velg 1, 2 eller 3 styrkeøkter i uka',
	save: 'Lagre',
	/** Under the frequency, where the plan's lifting days are chosen below it. */
	planNoteWithDays:
		'Planen du har nå, endres ikke av dette. Dagene i planen velger du under.',
	/** The frequency, once the athlete has chosen the days themselves. */
	fromDays: (count: number) =>
		`${count} i uka – én for hver dag du har valgt i planen.`,
} as const

/**
 * The plan's lifting days in _Meg → Trening → Styrke_ (#597, ADR 0104 §4):
 * _La appen velge_, or the athlete's own **Pinned days**, previewed over the
 * coming weeks before anything is written (ADR 0084) and undone from the
 * toast (ADR 0088). Weekdays Monday first, as {@link NB_WEEKDAY_LABELS}.
 */
export const MEG_LIFTING_DAYS_LABELS = {
	heading: 'Styrkedagene i planen',
	intro:
		'Velg selv hvilke dager du løfter, eller la appen legge styrken unna de harde øktene hver uke.',
	modeLegend: 'Hvem velger dagene',
	auto: 'La appen velge',
	own: 'Velg dager',
	autoNote: (count: number) =>
		`Appen legger ${count} ${count === 1 ? 'styrkeøkt' : 'styrkeøkter'} i uka på dager uten harde økter, og flytter dem når de harde dagene flytter seg.`,
	chipsLegend: 'Dagene du løfter',
	chipsNote:
		'Bare dagene du kan trene, fra profilen din. Like mange dager som styrkeøkter i uka, opptil 3.',
	chipsNoteNoAvailability:
		'Like mange dager som styrkeøkter i uka, opptil 3. Setter du treningsdagene dine i profilen, kan du bare velge blant dem.',
	ownNote:
		'Styrken legges bare på disse dagene, og de harde øktene legges rundt dem.',
	/** Under the chips once three are chosen: why the others rest. */
	full: 'Du har valgt 3 dager, som er flest. Ta bort en dag for å velge en annen.',
	preview: 'Se hva som endres',
	previewing: 'Henter de neste ukene …',
	previewHeading: 'De neste ukene',
	/** `Uke 43`, the ISO week the athlete reads everywhere. */
	week: (isoWeek: number) => `Uke ${isoWeek}`,
	/** `Styrke tirsdag og torsdag`. */
	lifting: (days: readonly number[]) =>
		days.length === 0
			? 'Ingen styrke'
			: `Styrke ${nbJoin(days.map((day) => NB_WEEKDAY_LABELS[day % 7]!))}`,
	/** `Harde økter mandag`. */
	hard: (days: readonly number[]) =>
		days.length === 0
			? 'ingen harde økter'
			: `${days.length === 1 ? 'hard økt' : 'harde økter'} ${nbJoin(days.map((day) => NB_WEEKDAY_LABELS[day % 7]!))}`,
	/** What the week had before, where it changes. */
	was: (days: readonly number[]) =>
		`Før: ${days.length === 0 ? 'ingen styrke' : nbJoin(days.map((day) => NB_WEEKDAY_LABELS[day % 7]!))}`,
	same: 'Som før',
	clashNote:
		'Dagene du velger, blir der du satte dem. Appen sier fra, men flytter dem ikke.',
	apply: 'Bruk',
	applying: 'Lagrer …',
	cancel: 'Avbryt',
	/** The toast after a write. */
	saved: (days: readonly number[] | null) =>
		days == null
			? 'Appen velger styrkedagene igjen.'
			: `Du løfter nå ${nbJoin(days.map((day) => NB_WEEKDAY_LABELS[day % 7]!))}.`,
	undo: 'Angre',
	undone: 'Styrkedagene er som før.',
	refusals: {
		'no-days': 'Velg minst én dag, eller la appen velge.',
		'outside-availability': 'Velg bare dager du kan trene.',
		'too-many': 'Velg opptil 3 dager.',
		stale: 'Planen endret seg mens du så på den. Se hva som endres igjen.',
		'no-session': 'Det finnes ingen styrkeøkt å legge inn ennå.',
		'no-plan': 'Du har ingen plan å legge styrkedagene i.',
		'no-strength-track': 'Planen din har ikke styrke.',
		'no-pattern': 'Planen har ikke noe ukemønster å legge styrken i ennå.',
		'bad-restore': 'Kunne ikke sette dagene tilbake.',
	},
} as const

/**
 * What Meg says when the athlete takes a day out of their Training
 * Availability that a track had as its own (#598, spec #588 story 19).
 */
export const MEG_DROPPED_DAYS_LABELS = {
	/** One line per track: `Sykling mister søndag og ligger nå onsdag.` */
	line: (
		name: string,
		lost: readonly number[],
		kept: readonly number[] | null,
		activity: boolean,
	) => {
		const lostDays = nbJoin(lost.map((day) => NB_WEEKDAY_LABELS[day % 7]!))
		if (kept) {
			return `${name} mister ${lostDays} og ligger nå ${nbJoin(kept.map((day) => NB_WEEKDAY_LABELS[day % 7]!))}.`
		}
		return activity
			? `${name} ligger fortsatt ${lostDays}. Velg en ny dag under Plan → Avansert.`
			: `${name} mister ${lostDays}, og appen velger dagene igjen.`
	},
	heading: 'Treningsdagene dine endret planen',
} as const

/**
 * Meg's Form section: the Training Load triad and how far it can be trusted
 * (ADR 0008/0010). It came from the home hero's Form pane when the hero went
 * (#505). Every "ikke målt" here is said with its reason (story 71).
 */
export const ME_FORM_LABELS = {
	title: 'Form',
	notMeasured: 'ikke målt',
	noLoad:
		'Ikke målt ennå: ingen treningsbelastning er regnet ut. Den kommer når du har logget økter.',
	formColdStart: (day: number, required: number) =>
		`Formen er ikke målt ennå: den trenger ${required} dager med belastning, og du har ${day}. Kondisjon og tretthet kan leses fra første dag.`,
	baseline: 'Bygger grunnlag',
	baselineValue: (day: number, required: number) => `dag ${day} av ${required}`,
	trusted: (days: number) => `Bygger på ${days} dager med belastning`,
	asOf: (date: string) => `regnet ut ${date}`,
	fitnessTrend: (from: string, to: string, since: string) =>
		`Kondisjon ${from} → ${to} siden ${since}`,
} as const

/**
 * Meg's Rekorder section: Personal Records (ADR 0021), moved from the home
 * hero's Records pane (#505). Records only come from trusted, recorded efforts,
 * so the empty state says what will fill it rather than showing a zero.
 */
export const ME_RECORD_LABELS = {
	title: 'Rekorder',
	source: 'Fra økter med registrerte data fra klokke eller import',
	none: 'Ingen personlige rekorder ennå. De kommer når du har logget økter med registrerte data.',
	longest: (noun: string) => `Lengste ${noun}`,
	overBest: (delta: string) => `${delta} over forrige beste`,
	firstOnRecord: 'Første registrerte',
	setOn: (date: string) => `satt ${date}`,
} as const

// ---------------------------------------------------------------------------
// Meg's sub-pages (round 2): profile, sign-in and security, training settings
// ---------------------------------------------------------------------------

/**
 * The pages behind Meg (spec #505 story 59, ADR 0081): the profile and its
 * sign-in and security pages, and "Trening og terskler" with its readings, gym
 * and lift numbers. One section so a page's every word is found in one place;
 * each export is named for the page it serves. The integrations and upload
 * pages are not here (they belong to the first-run/integrations work).
 *
 * Plurals are spelt per count (`1 annen økt`, `2 andre økter`), and every
 * figure arrives already formatted the Norwegian way (decimal comma) from the
 * page, so these functions only place words around it.
 */

/** Page titles (the page header and `<title>`), so the two never disagree. */
export const MEG_PAGE_TITLES = {
	profile: 'Profil',
	photo: 'Profilbilde',
	changeEmail: 'Bytt e-post',
	password: 'Passord',
	createPassword: 'Lag et passord',
	twoFactor: 'Totrinnsbekreftelse',
	twoFactorVerify: 'Slå på totrinnsbekreftelse',
	twoFactorDisable: 'Slå av totrinnsbekreftelse',
	connections: 'Innloggingskoblinger',
	passkeys: 'Passnøkler',
	training: 'Trening og terskler',
	analyze: 'Det historikken din sier',
	history: 'Terskelhistorikk',
	gym: 'Treningsstudioet ditt',
	lift: 'Tallene dine for løftet',
	propose: 'Det settene dine sier',
} as const

/** Words every Meg page shares. */
export const MEG_COMMON_LABELS = {
	cancel: 'Avbryt',
	save: 'Lagre',
	areYouSure: 'Er du sikker? Trykk igjen',
	unavailable: 'Ikke tilgjengelig',
	notGraded: 'ikke vurdert',
	unknownAction: 'Ukjent handling.',
	noProfile:
		'Utøverprofilen din mangler, så det er ingenting å knytte dette til.',
	liftGone: 'Det løftet finnes ikke lenger.',
} as const

/** The profile page (`/settings/profile`). */
export const MEG_PROFILE_LABELS = {
	changePhoto: 'Bytt profilbilde',
	account: 'Konto',
	username: 'Brukernavn',
	name: 'Navn',
	saveAccount: 'Lagre kontoen',
	usernameTaken: 'Det brukernavnet er tatt.',
	athlete: 'Utøverprofil',
	timezone: 'Tidssone',
	weekStartsOn: 'Uka starter',
	units: 'Enheter',
	birthdate: 'Fødselsdato',
	weightKg: 'Vekt (kg)',
	trainableDays: 'Dager du kan trene',
	defaultTrainingTime: 'Vanlig treningstid',
	weeklyCapacity: 'Timer i uka du har til trening',
	capacityAuthored:
		'Ditt tall, lagret. Ingenting leser treningen din på nytt for å endre det: historikken sier hva du gjorde, dette sier hva du har plass til.',
	capacityNoHistory:
		'Ingenting i treningen din den siste tiden å lese dette fra, så her spør vi: hvor mange timer i uka har du?',
	/** `avg` and `total` arrive formatted (`4,5`, `18`). */
	capacityDerived: (
		windowWeeks: number,
		weeksTrained: number,
		avg: string,
		total: string,
	) =>
		`De siste ${windowWeeks} ukene trente du i snitt ${avg} t utholdenhet i uka (${total} t totalt)${
			weeksTrained === windowWeeks
				? ''
				: `, i ${weeksTrained} av ${windowWeeks} uker`
		}.`,
	capacityChange: ' Endre det hvis det ikke stemmer med uka di.',
	saveAthlete: 'Lagre utøverprofilen',
	saved: 'Lagret.',
	security: 'Innlogging og sikkerhet',
	email: 'E-post',
	password: 'Passord',
	passwordSet: 'Bytt passordet ditt',
	passwordMissing: 'Du har ikke passord ennå. Lag et.',
	twoFactor: 'Totrinnsbekreftelse',
	twoFactorOn: 'På',
	twoFactorOff: 'Av',
	passkeys: 'Passnøkler',
	passkeysDetail: 'Logg inn med fingeravtrykk, ansikt eller sikkerhetsnøkkel',
	connections: 'Innloggingskoblinger',
	connectionsDetail: 'Logg inn med GitHub',
	training: 'Trening',
	trainingSettings: 'Trening og terskler',
	trainingSettingsDetail: 'Terskler, soner, treningsstudio og løft',
	integrations: 'Koblinger og aktivitetskilder',
	integrationsDetail: 'intervals.icu og filopplasting',
	data: 'Dataene dine',
	download: 'Last ned dataene dine',
	downloadDetail: 'Alt vi har lagret om deg, som én JSON-fil',
	otherSessions: (count: number) =>
		count === 1 ? 'Logg ut av 1 annen økt' : `Logg ut av ${count} andre økter`,
	onlySession: 'Dette er den eneste innloggingen din.',
	signedOut: 'Logget ut av de andre øktene.',
	logout: 'Logg ut',
	// Promise only what `deleteAccount` deletes (#641 UI-1): the profile image in
	// Tigris, Custom Exercises and filed reports outlive it, so never "alle dataene".
	deleteData: 'Slett kontoen din',
	deleteDataDetail:
		'Kontoen, øktene og planene dine slettes for godt. Det kan ikke angres.',
	deleting: 'Sletter kontoen …',
	deleteFailed: 'Kontoen ble ikke slettet. Ingenting er fjernet — prøv igjen.',
	deletedTitle: 'Kontoen er slettet',
	deletedBody: 'Kontoen, øktene og planene dine er slettet.',
} as const

/**
 * Weekday names for the profile's pickers, indexed 0 = søndag … 6 = lørdag
 * (the profile's own numbering, ADR 0005). Capitalised: they stand alone on a
 * button or in a menu, not mid-sentence.
 */
export const MEG_WEEKDAY_LABELS = [
	'Søndag',
	'Mandag',
	'Tirsdag',
	'Onsdag',
	'Torsdag',
	'Fredag',
	'Lørdag',
] as const

/** The trainable-day chips, same indexing, three letters. */
export const MEG_WEEKDAY_SHORT_LABELS = [
	'Søn',
	'Man',
	'Tir',
	'Ons',
	'Tor',
	'Fre',
	'Lør',
] as const

export const MEG_UNIT_LABELS = {
	metric: 'Metrisk (km, kg)',
	imperial: 'Britisk (mi, lb)',
} as const satisfies Record<'metric' | 'imperial', string>

/** Profile photo. */
export const MEG_PHOTO_LABELS = {
	choose: 'Velg bilde',
	save: 'Lagre bildet',
	reset: 'Angre',
	delete: 'Fjern bildet',
	required: 'Velg et bilde først.',
	tooLarge: 'Bildet må være mindre enn 3 MB.',
} as const

/** Change e-mail, and the two e-mails it sends. */
export const MEG_EMAIL_LABELS = {
	intro:
		'Du får en e-post med en kode på den nye adressen. Bytte skjer først når du har skrevet inn koden.',
	notice: (oldEmail: string) =>
		`Vi sender også et varsel til den gamle adressen, ${oldEmail}.`,
	newEmail: 'Ny e-postadresse',
	send: 'Send kode',
	inUse: 'Den e-postadressen er allerede i bruk.',
	sameDevice: 'Skriv inn koden på samme enhet som du ba om byttet fra.',
	changedTitle: 'E-posten er byttet',
	changedBody: (email: string) => `E-postadressen din er nå ${email}.`,
	codeSubject: 'Trainm8: kode for å bytte e-post',
	codeHeading: 'Bytte av e-post i Trainm8',
	codeLine: 'Her er koden din:',
	codeLink: 'Eller trykk på lenken:',
	noticeSubject: 'Trainm8: e-postadressen din er byttet',
	noticeHeading: 'E-postadressen din i Trainm8 er byttet',
	noticeBody:
		'Vi skriver for å si fra at e-postadressen på kontoen din i Trainm8 er byttet.',
	noticeIgnore:
		'Hvis det var deg, kan du se bort fra denne e-posten. Hvis det ikke var deg, ta kontakt med oss med en gang.',
	noticeAccount: (userId: string) => `Konto-ID: ${userId}`,
} as const

/** Change or create a password. */
export const MEG_PASSWORD_LABELS = {
	current: 'Nåværende passord',
	next: 'Nytt passord',
	confirm: 'Gjenta det nye passordet',
	change: 'Bytt passord',
	create: 'Lag passord',
	createIntro:
		'Du logger inn med en kobling i dag. Med et passord kan du også logge inn med brukernavn.',
	incorrect: 'Feil passord.',
	tooCommon: 'Det passordet er for vanlig. Velg et annet.',
	mustMatch: 'Passordene må være like.',
	changedTitle: 'Passordet er byttet',
	changedBody: 'Du bruker det nye passordet neste gang du logger inn.',
} as const

/** Two-factor authentication: status, set-up and turning it off. */
export const MEG_TWO_FACTOR_LABELS = {
	on: 'Totrinnsbekreftelse er på.',
	off: 'Totrinnsbekreftelse er av.',
	explain:
		'Med totrinnsbekreftelse skriver du også inn en kode fra en autentiseringsapp, for eksempel 1Password, når du logger inn eller gjør noe viktig.',
	enable: 'Slå på totrinnsbekreftelse',
	disable: 'Slå av totrinnsbekreftelse',
	disableWarning:
		'Vi anbefaler ikke å slå den av: da holder passordet alene for å komme inn på kontoen din.',
	disabledTitle: 'Totrinnsbekreftelse er av',
	disabledBody: 'Du logger inn med passord alene fra nå av.',
	scan: 'Skann QR-koden med autentiseringsappen din.',
	qrAlt: 'QR-kode for autentiseringsappen',
	manual:
		'Får du ikke skannet koden? Legg til kontoen i appen med denne adressen:',
	uriLabel: 'Engangspassord-URI',
	enterCode:
		'Skriv inn koden appen viser. Når totrinnsbekreftelse er på, trenger du en kode fra appen hver gang du logger inn. Mister du appen, mister du tilgangen til kontoen.',
	code: 'Kode',
	verify: 'Bekreft',
	invalidCode: 'Koden stemmer ikke. Prøv den nyeste koden fra appen.',
	codeLength: 'Koden har seks tegn.',
	enabledTitle: 'Totrinnsbekreftelse er på',
	enabledBody: 'Du trenger en kode fra appen neste gang du logger inn.',
} as const

/** Sign-in connections (GitHub). The activity sources live on integrations. */
export const MEG_CONNECTIONS_LABELS = {
	intro:
		'Kontoer du kan logge inn med. Klokker og treningsapper kobler du til under ',
	integrationsLink: 'koblinger og aktivitetskilder',
	none: 'Du har ingen innloggingskoblinger ennå.',
	connectedOn: (date: string) => `koblet til ${date}`,
	connect: (provider: string) => `Koble til ${provider}`,
	disconnect: (name: string) => `Koble fra ${name}`,
	lastOne:
		'Du kan ikke fjerne den siste koblingen før du har laget et passord.',
	deletedTitle: 'Koblet fra',
	deletedBody: 'Koblingen er fjernet.',
} as const

/** Passkeys. */
export const MEG_PASSKEY_LABELS = {
	intro:
		'En passnøkkel lar deg logge inn uten passord, med fingeravtrykk, ansikt eller en sikkerhetsnøkkel.',
	register: 'Legg til en passnøkkel',
	none: 'Ingen passnøkler ennå.',
	failed: 'Kunne ikke lage passnøkkelen. Prøv igjen.',
	device: 'Denne enheten',
	securityKey: 'Sikkerhetsnøkkel',
	registered: (date: string) => `Lagt til ${date}`,
	delete: 'Fjern',
	listName: 'Passnøkler',
} as const

/** "Trening og terskler" (`/settings/training`). */
export const MEG_TRAINING_LABELS = {
	intro: 'Tersklene dine per idrett. Belastning og soner regnes ut fra dem.',
	recipeIntro:
		'Hver idrett starter på en soneoppskrift vi valgte. Den bestemmer bare hvilken skala tallene dine leses på. En terskel er et tall om deg, så den fyller vi aldri inn selv: uten den står målene som sonenavn, ikke som et tall ingen har målt.',
	readHistory: 'Les tersklene fra historikken min',
	readHistoryDetail: 'Forslag fra øktene du har importert',
	history: 'Terskelhistorikk',
	historyDetail: 'Hver endring, nyeste først',
	gym: 'Treningsstudioet ditt',
	gymDetail: 'Stenger, skiver og manualer',
	maxHr: 'Makspuls (slag/min)',
	lthr: 'Terskelpuls (slag/min)',
	ftp: 'FTP (W)',
	runPower: 'Kritisk løpswatt (W)',
	thresholdPace: 'Terskelfart (mm:ss per km)',
	css: 'CSS (mm:ss per 100 m)',
	save: (discipline: string) => `Lagre ${discipline.toLowerCase()}`,
	saved: 'Lagret.',
	recipe: 'Soneoppskrift',
	recipeDefault: 'Valgt for deg',
	recipeChosen: 'Ditt valg',
	recipeDefaultLine: (discipline: string) =>
		`Vi valgte denne for ${discipline.toLowerCase()} fordi du ikke har valgt en sonemodell. Den bestemmer skalaen tallene dine leses på, og finner ikke på noen av dem.`,
	recipeChosenLine: 'Du valgte denne.',
	anchorSet: (anchor: string, reading: string) =>
		`Leses mot ${anchor}, ${reading}. Bytter du oppskrift, leses alle øktene du har logget på nytt, ikke bare de som kommer.`,
	anchorMissing: (anchor: string) =>
		`Leses mot ${anchor}, som du ikke har lagt inn. Derfor står målene i denne idretten som sonenavn, ikke som et tall ingen har målt.`,
	paceFormat: (example: string) =>
		`Skriv farten som mm:ss, for eksempel ${example}.`,
	paceRange: (min: string, max: string, unit: string) =>
		`Farten må være mellom ${min} og ${max} ${unit}.`,
	recipeWrongDiscipline: (discipline: string) =>
		`Den soneoppskriften hører ikke til ${discipline.toLowerCase()}.`,
} as const

/** Display names for the built-in Zone Recipes, keyed by recipe id. */
export const MEG_ZONE_RECIPE_LABELS: Record<string, string> = {
	'coggan-power-7': 'Coggan watt, 7 soner',
	'friel-hr-5-bike': 'Friel puls, 5 soner',
	'friel-hr-5-run': 'Friel puls, 5 soner',
	'daniels-pace-5': 'Daniels fart, 5 soner',
	'norwegian-threshold-run': 'Norsk terskelfart, 6 soner',
	'stryd-run-power-5': 'Stryd løpswatt, 5 soner',
	'css-3': 'CSS, 3 soner',
	'css-5': 'CSS, 5 soner',
	'olt-hr-5-run': 'Olympiatoppen puls, 5 soner',
	'olt-hr-5-bike': 'Olympiatoppen puls, 5 soner',
}

/** The threshold a recipe is read against, mid-sentence ("leses mot …"). */
export const MEG_ZONE_ANCHOR_LABELS: Record<ZoneAnchor, string> = {
	ftp: 'FTP-en din',
	runPower: 'løpswatten din',
	lthr: 'terskelpulsen din',
	maxHr: 'makspulsen din',
	thresholdPace: 'terskelfarten din',
	css: 'CSS-en din',
	rpe: 'opplevd anstrengelse',
}

/** Units as the training pages print them. */
export const MEG_UNIT_SUFFIX = {
	bpm: 'slag/min',
	watt: 'W',
	perKm: '/km',
	per100m: '/100 m',
	kg: 'kg',
} as const

/** "Det historikken din sier" (`/settings/training/analyze`). */
export const MEG_ANALYZE_LABELS = {
	intro: (count: number, days: number) =>
		`Lest fra ${count} ${count === 1 ? 'aktivitet' : 'aktiviteter'} de siste ${days} dagene. Ingenting lagres før du godtar det.`,
	unknown: 'Ukjent forslag.',
	gone: 'Det forslaget finnes ikke lenger.',
	noActivities:
		'Ingen importerte aktiviteter ennå, så det er ingenting å lese.',
	connect: 'Koble til en konto',
	saved: (value: string) => `Du har ${value} lagret.`,
	how: 'Slik kom vi fram til det',
	use: 'Bruk dette',
	replace: 'Erstatt det jeg har',
	accepted: 'Lagret som ditt tall.',
	footer: 'Tall du godtar, kan du endre etterpå under ',
	footerLink: 'Trening og terskler',
	footerEnd: '. De endrer seg aldri av seg selv.',
	readFrom: 'Lest fra',
	readFromDetail: (used: number, total: number) =>
		`${used} av ${total} aktiviteter`,
	effortsUsed: 'Innsatser brukt',
	tooCoarse: 'For grovt lagret',
	tooCoarseDetail: (durations: string) =>
		`${durations}. Aktivitetene dine er lagret med lav oppløsning, så korte innsatser blir jevnet ut i stedet for målt.`,
	fit: 'Tilpasning',
	companionDetail: (value: string) =>
		`${value}. Lest med, men ikke foreslått: de korte innsatsene den bygger på, ble avvist over.`,
	note: 'Merk',
	tanakaNote:
		'En aldersformel beskriver en befolkning, ikke deg. Den får lav sikkerhet uansett hvor mye du trener, og en målt makspuls slår den alltid.',
	seconds: (s: number) => `${s} s`,
	minutes: (m: number) => `${m} min`,
} as const

export const MEG_CONSTRUCT_LABELS: Record<ThresholdConstruct, string> = {
	maxHr: 'Makspuls',
	lthr: 'Terskelpuls',
	ftp: 'FTP',
	cp: 'Kritisk watt',
	thresholdPace: 'Terskelfart',
	criticalSpeed: 'Kritisk fart',
	css: 'Kritisk svømmefart',
	runPower: 'Løpswatt ved terskel',
}

/** The caveat that sits on the number, where the column says something else. */
export const MEG_CONSTRUCT_CAVEATS: Partial<
	Record<ThresholdConstruct, string>
> = {
	cp: 'En kritisk watt, vanligvis litt over FTP.',
	criticalSpeed: 'En kritisk fart, vanligvis litt raskere enn terskelfart.',
}

/** How a threshold got here (ADR 0005 as amended). */
export const MEG_THRESHOLD_PROTOCOL_LABELS: Record<ThresholdProtocol, string> =
	{
		manual: 'du skrev det inn',
		tt60: '60-minutterstest',
		ftp20: '20-minutterstest',
		ramp: 'rampetest',
		'cp-fit': 'tilpasset dine beste innsatser',
		'race-equivalence': 'fra et løpsresultat',
		observed: 'det høyeste du er registrert med',
		tanaka: 'anslått ut fra alderen din',
		provider: 'fra en tilkoblet konto',
	}

/** One sentence per refusal. Visible, never behind a disclosure. */
export const MEG_ESTIMATE_REFUSAL_LABELS: Record<EstimateRefusal, string> = {
	'no-birthdate': 'Legg inn fødselsdatoen din i profilen, så kan vi anslå den.',
	'no-data': 'Ingenting de siste 90 dagene hadde dataene som trengs.',
	resolution:
		'Aktivitetene dine er lagret med for lav oppløsning til å lese korte innsatser.',
	'insufficient-efforts':
		'For få harde innsatser av ulik lengde til å tilpasse en kurve.',
	'insufficient-spread':
		'De harde innsatsene dine er omtrent like lange, så en kurve ville vært gjetning.',
	'implausible-fit': 'Tilpasningen ble fysiologisk urimelig.',
	unbuilt: 'Dette kan vi ikke lese fra dataene dine ennå.',
}

/** A grade, said as a badge ("høy sikkerhet"). */
export const MEG_CONFIDENCE_LABELS: Record<EstimateConfidence, string> = {
	high: 'høy sikkerhet',
	medium: 'middels sikkerhet',
	low: 'lav sikkerhet',
}

/** Terskelhistorikk (`/settings/training/history`). */
export const MEG_HISTORY_LABELS = {
	intro: 'Hver endring av en terskel, nyeste først.',
	none: 'Ingen terskelendringer ennå.',
	observed: 'observert',
} as const

/** A threshold event's kind, as the history lists it. */
export const MEG_THRESHOLD_KIND_LABELS: Record<string, string> = {
	maxHr: 'Makspuls',
	lthr: 'Terskelpuls',
	ftp: 'FTP',
	runPower: 'Løpswatt',
	thresholdPace: 'Terskelfart',
	css: 'CSS',
	weight: 'Vekt',
}

/** The construct, only where it differs from the column it landed in. */
export const MEG_HISTORY_CONSTRUCT_LABELS: Record<string, string> = {
	cp: 'kritisk watt',
	criticalSpeed: 'kritisk fart',
}

/** Treningsstudioet ditt (`/settings/training/gym`). */
export const MEG_GYM_LABELS = {
	intro:
		'Det studioet ditt har, så vektfeltet kan si hva som skal på stanga. Antallet er par: to 20-skiver per side er 2.',
	name: 'Navn på studioet',
	defaultName: 'Studioet mitt',
	bars: 'Stenger, i kg',
	barsHint: 'Den første er stanga et løft regner med.',
	plates: 'Skiver, i kg',
	plateCounts: 'Par av hver',
	dumbbells: 'Faste manualer, i kg',
	dumbbellsHint:
		'La feltet stå tomt hvis du ikke vil si det. Et tomt felt er ikke et tomt stativ.',
	listHint:
		'Skill tallene med komma, og skriv desimaler med punktum: 2.5, 1.25.',
	save: 'Lagre studioet',
	invalid: 'Det ga ikke mening.',
	notNumbers: 'Hver vekt og hvert antall må være et tall.',
	countMismatch: 'Gi et antall for hver skive, eller la antallene stå tomme.',
	noProfile:
		'Utøverprofilen din mangler, så det er ikke noe studio å knytte dette til.',
	saved: 'Lagret. Hver vekt sier nå hva som skal på stanga.',
	exampleExact: (line: string) =>
		`100 kg på dette studioet er ${line} per side.`,
	exampleNearest: (kg: string, line: string) =>
		`Dette studioet kan ikke lage 100 kg. Nærmest er ${kg} kg, ${line} per side.`,
	emptyBar: 'tom stang',
} as const

/** Why the rack cannot make a load (`calculatePlates`' refusals). */
export const MEG_PLATE_REFUSAL_LABELS: Record<PlateRefusal, string> = {
	'stack-level-is-an-ordinal':
		'Et nivå i vektstabelen har ingen kilo. Det går fram mot seg selv.',
	'band-is-a-force-curve':
		'En strikk har ingen kilo. Kraften endrer seg gjennom bevegelsen.',
	'unloaded-has-no-external-load': 'Denne øvelsen har ingen ytre belastning.',
	'no-bodyweight-on-file':
		'Ingen kroppsvekt er lagret, så denne belastningen har ingenting å regnes ut fra.',
	'assist-exceeds-bodyweight':
		'Det er mer hjelp enn kroppsvekten, og det kan ikke være en belastning.',
	'no-dumbbell-rack-stated':
		'Studioet har ikke sagt hvilke manualer det har, så det er ingen manual å velge.',
	'dumbbell-rack-is-empty': 'Manualstativet på studioet er oppgitt som tomt.',
}

/** Tallene dine for løftet (`/settings/training/lifts/:id`). */
export const MEG_LIFT_LABELS = {
	readsAgainst: (headline: string) =>
		`Prosenter og repmaks for dette løftet leses mot ${headline}.`,
	nothingOnFile:
		'Ingenting lagret ennå, så en prosentforskrift for dette løftet vises som skrevet og blir ikke til kilo.',
	addTitle: 'Skriv inn et tall selv',
	addFormName: (exercise: string) => `Legg inn et tall for ${exercise}`,
	construct: 'Hva det er',
	kg: 'kg',
	reps: 'ved reps',
	from: 'Fra',
	repMaxHint:
		'Den tyngste vekten du klarer akkurat så mange reps med. Den regnes aldri om fra et annet antall reps: en 8RM lest fra en 5RM ville vært et gjett på ±10 % gjort to ganger.',
	statedHint:
		'Et tall du skriver inn, lagres som ditt og blir ikke vurdert. Appen vurderer ikke et tall du har oppgitt om deg selv.',
	save: 'Lagre tallet',
	saved: 'Lagret. Forskriftene dine leses mot det fra nå av.',
	onFile: 'Det du har lagret',
	noAnchors: 'Ingen tall ennå.',
	readFromSet: 'Les et tall fra et sett du har logget',
	appendOnly:
		'Ingenting her blir overskrevet: et nyere tall blir en ny linje, og en eldre økt leses fortsatt mot tallet den ble skrevet med.',
	prescribed: 'Der løftet står i planen',
	notPrescribed: 'Ingen økt i planen din har dette løftet ennå.',
	noSets: 'ingen sett skrevet',
	from_: (date: string) => `fra ${date}`,
	sourceGone: (protocol: string) =>
		`${protocol}. Lest fra et sett som ikke finnes lenger, så utregningen kan ikke vises.`,
	superseded: 'erstattet',
	numberInvalid: 'Det tallet ga ikke mening.',
	weightInvalid: 'En vekt må være et positivt antall kilo.',
	repsInvalid: 'Antall reps må være et helt tall, 1 eller mer.',
	repMaxNeedsReps: 'En repmaks trenger antall reps den gjelder.',
	dateInvalid: 'Den datoen er ikke en dato.',
	duplicate: 'Du har allerede lagret et tall for løftet på det tidspunktet.',
	headlineOneRm: (kg: string) => `${kg} kg 1RM`,
	headlineEstimated: (kg: string) => `${kg} kg anslått 1RM`,
	headlineRepMax: (kg: string, reps: string) => `${kg} kg ${reps}RM`,
} as const

export const MEG_LIFT_CONSTRUCT_LABELS: Record<'oneRm' | 'repMax', string> = {
	oneRm: 'Maks på én rep (1RM)',
	repMax: 'Repmaks',
}

/** How a lift's number was arrived at. Equation names stay as published. */
export const MEG_ANCHOR_PROTOCOL_LABELS: Record<AnchorProtocol, string> = {
	tested: 'du testet det',
	epley: 'Epley/Welday',
	brzycki: 'Brzycki',
	mayhew: 'Mayhew',
	wathen: 'Wathen',
	lombardi: 'Lombardi',
	lander: 'Lander',
	adams: 'Adams',
	'rep-max-observed': 'du klarte akkurat så mange reps',
	'athlete-stated': 'du skrev det inn',
	provider: 'fra en tilkoblet konto',
}

/** Det settene dine sier (`/settings/training/lifts/:id/propose`). */
export const MEG_PROPOSE_LABELS = {
	intro:
		'Lest fra settene du allerede har logget for dette løftet. Ingenting lagres før du godtar det.',
	tested: 'Testet 1RM',
	estimated: 'Anslått 1RM',
	band: (low: string, high: string, sd: string) =>
		`Et sted mellom ${low} og ${high} kg, ±${sd} %. Det er likningens egen spredning blant dem den ble tilpasset.`,
	stale:
		'lest fra et gammelt sett. Merket, ikke justert, fordi ingen kan vite hvilken vei en utestet løfter har gått.',
	how: 'Slik kom vi fram til det',
	setsRead: 'Sett lest',
	setUsed: 'Sett brukt',
	setUsedDetail: (kg: string, reps: number, date: string, effort: string) =>
		`${kg} kg × ${reps} ${date}${effort}`,
	toFailure: ', til utmattelse',
	inReserve: (rir: number) => `, ${rir} i reserve`,
	equation: 'Likning',
	testedEquation:
		'vekten som ble løftet. En singel til utmattelse er selve målingen, så ingen likning brukes.',
	bias: 'Kjent skjevhet',
	biasDetail: (pct: string) =>
		`${pct} % i snitt. Oppgitt, ikke rettet for, fordi en befolkningsrettelse er en påstand om deg som ingen har målt.`,
	rirNote:
		'Reps i reserve blir i snitt oppgitt for lavt, og det trekker anslaget ned. Vist, aldri rettet.',
	note: 'Merk',
	use: 'Bruk dette',
	replace: 'Erstatt det jeg har',
	noThanks: 'Nei takk',
	footer: 'Tall du godtar, ser og erstatter du under ',
	footerLink: 'tallene for løftet',
	footerEnd: '. De endrer seg aldri av seg selv.',
	equationPicker: 'Likning',
	equationIntro:
		'Les med en annen likning. Ingen av dem er bedre enn de andre: de er ulike publiserte tilpasninger til ulike utvalg, og ± ved hver er dens egen spredning. Bytter du, leses settene på nytt, og ingenting lagres.',
	meanBias: (pct: string) => `, gjennomsnittlig skjevhet ${pct} %`,
	applied: ', brukes nå',
	invalid: 'Det forslaget ga ikke mening.',
	refused: 'Det er ikke noe forslag å godta lenger.',
	staleError:
		'Settene dine er endret siden dette ble lest. Last siden på nytt og se igjen.',
	duplicate: 'Du lagret det tallet for et øyeblikk siden.',
	saved: (kg: string) =>
		`Lagret som din 1RM på ${kg} kg. Den er din nå, og ingenting leser historikken din på nytt for å flytte den.`,
} as const

/** Why no 1RM can be read off the sets (`oneRmRefusal`). */
export const MEG_ONE_RM_REFUSAL_LABELS: Record<
	OneRmRefusal,
	(maxReps: number) => string
> = {
	'no-sets-logged': () =>
		'Ingen lesbare arbeidssett for dette løftet, så det er ingenting å anslå fra. Logg et arbeidssett med oppgitt vekt og et talt antall reps.',
	'sets-not-readable': () =>
		'Settene dine på dette løftet oppgir en varighet, eller en vekt uten ærlige kilo, så ingen av dem er en vekt løftet et talt antall ganger. Arbeidet er gjort, men det kan ikke leses som en 1RM. Logg et sett med reps på en oppgitt vekt.',
	'reps-out-of-range': (maxReps) =>
		`Det beste settet ditt her har over ${maxReps} reps, der disse likningene slutter å være anslag. Logg et sett på ${maxReps} reps eller færre.`,
	'effort-unknown': () =>
		'Ingen av settene sier hvor nær utmattelse de var, og i løfting kan ikke tallene fortelle det. Merk et sett som til utmattelse, eller skriv reps i reserve.',
	'exercise-unmapped': () =>
		'Denne øvelsen har ingen validert sammenheng mellom reps og vekt, så et anslag ville lånt et annet løfts kurve. Legg inn en repmaks i stedet.',
	'load-not-on-the-bar': () =>
		'Settene her er ikke logget som vekt på stanga: de tar med kroppsvekt, trekker fra hjelp, teller én hånd eller er ikke en vekt. En 1RM er en stangvekt, så ingen av dem kan leses som en. Logg et sett som ytre belastning, eller legg inn en repmaks.',
	'load-kind-unstated': () =>
		'Ingenting på settene sier hva slags belastning som ble løftet, så stangvekt og kroppsvekt kan ikke skilles. Logg et sett med belastningstypen, så kan dette anslås.',
}

/** Said in place when the equation was not fitted to this movement. */
export const MEG_REP_LOAD_BASIS_LABELS: Record<RepLoadBasis, string | null> = {
	fitted: null,
	unmapped: null,
	'measured-biased':
		'Disse likningene er testet på markløft, og alle undervurderte det (LeSuer 1997), så tallet er trolig for lavt. Skjevheten er oppgitt, ikke rettet for, og sikkerheten er satt ett trinn ned.',
	transferred:
		'Ingen likning er tilpasset denne øvelsen. Denne låner kurven fra benkpress og knebøy den ble laget på (Nuzzo 2024 har tabeller bare for benkpress og beinpress). Den brukes på det svakere grunnlaget, sagt rett ut, med sikkerheten ett trinn ned.',
}

/** The equations as a reader can check them, Norwegian words and commas. */
export const MEG_ESTIMATOR_EQUATION_LABELS: Record<EstimatorName, string> = {
	epley: 'vekt × (1 + reps / 30)',
	brzycki: 'vekt / (1,0278 − 0,0278 × reps)',
	lander: 'vekt / (1,013 − 0,0267123 × reps)',
	adams: 'vekt / (1 − 0,02 × reps)',
	mayhew: 'vekt / (0,522 + 0,419 × e^(−0,055 × reps))',
	wathen: 'vekt / (0,488 + 0,538 × e^(−0,075 × reps))',
	lombardi: 'reps^0,10 × vekt',
}

/**
 * The shared validation messages (`user-validation.ts`, Zod's defaults), said
 * in Norwegian at the field on Meg's pages. Keyed by the English message the
 * shared schema produces, because the auth pages still read that English: the
 * rule stays in one place, and only the words differ.
 */
export const MEG_VALIDATION_LABELS: Record<string, string> = {
	'Username is required': 'Skriv et brukernavn.',
	'Username is too short': 'Brukernavnet er for kort (minst 3 tegn).',
	'Username is too long': 'Brukernavnet er for langt (høyst 20 tegn).',
	'Use only letters, numbers and underscores':
		'Brukernavnet kan bare ha bokstaver, tall og understrek.',
	'Password is required': 'Skriv et passord.',
	'Password is too short': 'Passordet er for kort (minst 6 tegn).',
	'Password is too long': 'Passordet er for langt.',
	'Name is required': 'Skriv et navn.',
	'Name is too short': 'Navnet er for kort (minst 3 tegn).',
	'Name is too long': 'Navnet er for langt (høyst 40 tegn).',
	'Email is required': 'Skriv en e-postadresse.',
	'Email is invalid': 'Det ser ikke ut som en e-postadresse.',
	'Email is too short': 'E-postadressen er for kort.',
	'Email is too long': 'E-postadressen er for lang.',
	'The passwords must match': 'Passordene må være like.',
	'Use a 24-hour HH:MM time': 'Skriv klokkeslettet som TT:MM.',
	'Unknown zone recipe': 'Ukjent soneoppskrift.',
}

/** Zod's own default messages, by issue kind, for the fields Meg checks. */
export const MEG_ZOD_ISSUE_LABELS = {
	required: 'Fyll inn feltet.',
	notANumber: 'Skriv et tall.',
	notAWholeNumber: 'Skriv et helt tall.',
	tooSmall: (min: string) => `Tallet må være minst ${min}.`,
	mustBePositive: 'Tallet må være større enn 0.',
	tooBig: (max: string) => `Tallet kan være høyst ${max}.`,
	tooShort: (min: string) => `Minst ${min} tegn.`,
	tooLong: (max: string) => `Høyst ${max} tegn.`,
	invalidDate: 'Skriv en gyldig dato.',
	invalid: 'Sjekk feltet.',
} as const
