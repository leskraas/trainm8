/**
 * Where sessions come from: integration providers, origin platforms, source
 * attribution, the integrations page, its toasts and upload. Part of
 * `labels.ts` (ADR 0081): import from the barrel.
 */

// `import type`, for the runtime-leaf reason `labels.ts`'s header gives.
/* eslint-disable import/consistent-type-specifier-style */
import type { OriginPlatform } from '../../integrations/shared/origin-platform.ts'
import type { ConnectionHubStatus } from '../connection-hub-status.ts'
import type { Attribution } from '../source-terms.ts'
/* eslint-enable import/consistent-type-specifier-style */
import { capitalize } from './_helpers.ts'

// ---------------------------------------------------------------------------
// Integration providers
// ---------------------------------------------------------------------------

/**
 * Display names for activity/import providers and OAuth connections. Keyed by
 * the provider slug used across the integration folders (ADR 0014) and the
 * import `externalProvider` enum. `providerLabel` falls back to a capitalized
 * slug so a new provider is never shown raw before it is added here.
 */
export const PROVIDER_LABELS: Record<string, string> = {
	manual: 'Manual',
	strava: 'Strava',
	intervalsicu: 'Intervals.icu',
	garmin: 'Garmin',
	github: 'GitHub',
}

export function providerLabel(provider: string): string {
	return PROVIDER_LABELS[provider] ?? capitalize(provider)
}

/**
 * Where a Recording came from, by its **Origin Platform** (ADR 0096) — never
 * the transport it came down. `unknown` has no words: a Recording that cannot
 * say where it came from says nothing rather than guess.
 */
export const ORIGIN_PLATFORM_LABELS: Record<
	Exclude<OriginPlatform, 'unknown'>,
	string
> = {
	garmin: 'Garmin',
	polar: 'Polar',
	suunto: 'Suunto',
	coros: 'COROS',
	wahoo: 'Wahoo',
	strava: 'Strava',
	zwift: 'Zwift',
	'apple-health': 'Apple Health',
	'health-connect': 'Health Connect',
	intervalsicu: 'intervals.icu',
	upload: 'Opplastet fil',
}

/**
 * The credits a platform's terms require (ADR 0098 §3, `source-terms.ts`).
 *
 * Garmin's derived-data line is Garmin's own wording, from its API Brand
 * Guidelines' list of acceptable attributions, and stays in English on
 * purpose: a Norwegian paraphrase is not on that list. Changing it waits on
 * Garmin saying a translation is acceptable (#542's outreach).
 */
export const SOURCE_ATTRIBUTION_LABELS = {
	derived: {
		garmin: 'Insights derived in part from Garmin device-sourced data.',
		polar: 'Bygger delvis på data fra Polar.',
	} satisfies Record<Attribution, string>,
} as const

/** An Account Connection's state, as Meg reads it (`connection-hub-status.ts`). */
export const CONNECTION_HUB_STATUS_LABELS: Record<ConnectionHubStatus, string> =
	{
		disconnected: 'Ikke koblet til',
		connected: 'Koblet til',
		backfilling: 'Koblet til · henter historikken din',
		revoked: 'Må kobles til på nytt',
	}

// Round 2 · first run, stamped titles, integrations and upload
// (branch claude/first-run-integrations). One block; other PRs add their own.
// ---------------------------------------------------------------------------

/**
 * The integrations page (`/settings/integrations`, #505 story 59, ADR 0081):
 * where the athlete's sessions come from. intervals.icu is the one source to
 * connect (#505: Strava is out of scope, so it is never offered; a Strava
 * connection made before keeps its card, to sync or disconnect).
 */
export const INTEGRATIONS_LABELS = {
	title: 'Integrasjoner',
	intro:
		'Her kommer øktene dine fra. En tilkoblet kilde importerer øktene av seg selv.',
	connected: 'Tilkoblet',
	available: 'Tilgjengelig',
	comingSoon: 'Kommer',
	badge: {
		revoked: 'Må kobles til på nytt',
		backfilling: 'Henter historikk',
		connected: 'Tilkoblet',
		comingSoon: 'Kommer',
	},
	/** `Sist synkronisert 23. mai kl. 17.00` — when the app last asked. */
	lastChecked: 'Sist synkronisert',
	syncNow: 'Synkroniser nå',
	syncing: 'Synkroniserer …',
	reconnect: 'Koble til på nytt',
	disconnect: 'Koble fra',
	keepConnected: 'Behold tilkoblingen',
	cancel: 'Avbryt',
	upload: 'Last opp økter',
	connectSoon: 'Kobling kommer snart',
	/** The confirm and the toast after it, for either provider. */
	disconnectTitle: (name: string) => `Koble fra ${name}?`,
	disconnectBody: (name: string) =>
		`Øktene du har importert fra ${name}, blir i treningshistorikken din. Å koble fra stopper bare nye fra å komme. Du kan koble til igjen når som helst.`,
	disconnectConfirm: (name: string) => `Koble fra ${name}`,
	disconnected: (name: string) => `Koblet fra ${name}`,
	disconnectedBody: 'Øktene du har importert, blir i treningshistorikken din.',
	// ADR 0096 §8: dedupe is strong, not certain, so the hub says both halves.
	dualSource:
		'Flere kilder er koblet til. En økt som kommer fra mer enn én av dem, lagres som én økt. Kjenner vi den ikke igjen, kan den likevel komme to ganger – da sletter du den du ikke vil beholde.',
	intervalsicu: {
		name: 'intervals.icu',
		revoked:
			'intervals.icu godtok ikke den lagrede nøkkelen. Lim inn en ny for å fortsette importen.',
		backfilling:
			'Henter treningshistorikken din fra intervals.icu … Det skjer i bakgrunnen.',
		daily:
			'Synkroniseres av seg selv én gang i døgnet. Trykk Synkroniser nå for det nyeste.',
		connect: 'Koble til intervals.icu',
		keyHelp:
			'Kopier den personlige API-nøkkelen din fra intervals.icu under Settings → Developer Settings, og lim den inn her. Lager du en ny nøkkel der, slutter de gamle å virke.',
		keyLabel: 'API-nøkkel',
		submit: 'Koble til',
		submitting: 'Kobler til …',
	},
	strava: {
		name: 'Strava',
		revoked:
			'Strava trakk tilbake tilkoblingen. Koble til på nytt for å fortsette importen.',
		backfilling:
			'Henter 42 dager med historikk fra Strava … Det skjer i bakgrunnen.',
		connected: 'Nye økter kommer av seg selv.',
	},
} as const

/** The provider directory's display words (`app/integrations/directory.ts`). */
export const PROVIDER_DIRECTORY_LABELS = {
	strava: {
		name: 'Strava',
		tagline: 'Øktene importeres av seg selv etter hver trening.',
	},
	'file-upload': {
		name: 'Filopplasting',
		tagline: 'FIT-, TCX- eller GPX-filer. Alltid tilgjengelig.',
	},
	// #546: no card promises a vendor's data through intervals.icu. Its Garmin
	// feed may close any day (its developer, 2026-10-09), and an activity's
	// terms follow the watch it was recorded on, not the bridge (ADR 0098). A
	// FIT file from the watch is the way in that does not depend on either.
	intervalsicu: {
		name: 'intervals.icu',
		tagline:
			'Gratis import med din personlige API-nøkkel: øktene som ligger i intervals.icu-kontoen din. Sjekkes daglig, og du kan synkronisere selv for det nyeste.',
	},
	garmin: {
		name: 'Garmin Connect',
		tagline:
			'Garmins API krever opptak i partnerprogrammet deres. Til da kan du laste opp FIT-filen fra klokka.',
	},
	suunto: {
		name: 'Suunto',
		tagline:
			'Suuntos API er også bare for partnere. Til da kan du laste opp FIT-filen fra klokka.',
	},
} as const

/**
 * What a connect or sync says in its toast, or at the key field. The refusals
 * mirror the first run's (`FIRST_RUN_LABELS.connect`).
 */
export const INTEGRATION_TOAST_LABELS = {
	emptyKey: 'Lim inn API-nøkkelen fra intervals.icu for å koble til.',
	keyRejected:
		'intervals.icu godtok ikke nøkkelen. Lager du en ny nøkkel, slutter den gamle å virke – kopier den som gjelder nå fra Settings → Developer Settings.',
	unreachable:
		'Vi fikk ikke kontakt med intervals.icu for å sjekke nøkkelen. Prøv igjen om litt.',
	connected: (name: string) => `Koblet til ${name}`,
	connectedBody: (name: string) => `${name}-kontoen din er nå koblet til.`,
	connectFailed: (name: string) => `Kunne ikke koble til ${name}`,
	syncFailed: 'Synkroniseringen feilet',
	synced: 'Synkronisert',
	syncedWith: (name: string) => `Synkronisert med ${name}`,
	nothingNew: 'Ingen nye økter å importere.',
	imported: (count: number) =>
		`${count} ${count === 1 ? 'ny økt' : 'nye økter'} importert.`,
	saved: (count: number) =>
		`${count} ${count === 1 ? 'ny økt' : 'nye økter'} lagt i treningsloggen.`,
	connectFirst: 'Koble til en kilde før du synkroniserer.',
	connectFirstNamed: (name: string) =>
		`Koble til ${name} før du synkroniserer.`,
	couldNotSync: (names: string) =>
		`Kunne ikke synkronisere ${names}. Se Integrasjoner.`,
	intervalsicuRevoked:
		'intervals.icu godtok ikke den lagrede nøkkelen. Lim inn en ny under Integrasjoner for å fortsette importen.',
	intervalsicuUnavailable:
		'Vi fikk ikke kontakt med intervals.icu, så ingenting ble importert. Prøv igjen om noen minutter.',
	stravaRevoked:
		'Strava trakk tilbake tilgangen. Koble til på nytt under Integrasjoner.',
	stravaAppInactive:
		'Strava har slått av appen (status: inactive). Det er på Stravas side – å koble til på nytt hjelper ikke.',
	stravaScope:
		'Trainm8 har ikke lov til å lese Strava-øktene dine. Koble til på nytt, og la avkrysningen for økttilgang stå på.',
	/**
	 * `… Prøv igjen om 10 min.`, `… om ca. 7 t.`: until the Strava window
	 * resets. Usually trainm8's own share of the budget is what's spent, so it
	 * names the sync quota, not a limit of Strava's. Over an hour it rounds to
	 * whole hours.
	 */
	stravaRateLimited: (retryAt: Date, now: Date = new Date()) => {
		const minutes = Math.max(
			1,
			Math.ceil((retryAt.getTime() - now.getTime()) / 60_000),
		)
		const wait =
			minutes < 60 ? `${minutes} min` : `ca. ${Math.round(minutes / 60)} t`
		return `Strava-kvoten for synk er brukt opp for nå. Prøv igjen om ${wait}.`
	},
	stravaUnavailable: 'Strava er ikke tilgjengelig',
	/** The Strava OAuth callback's refusals (a reconnect of an old link). */
	stravaDenied: 'Du sa nei til tilgangen hos Strava.',
	stravaState: 'Sikkerhetssjekken feilet. Prøv å koble til på nytt.',
	stravaNoCode: 'Strava sendte ingen godkjenningskode.',
	stravaNeedsScope:
		'Trainm8 trenger lov til å se øktene dine. Koble til på nytt, og la avkrysningen for økttilgang stå på.',
	stravaCouldNotConnect: 'Kunne ikke koble til Strava-kontoen din. Prøv igjen.',
	stravaNotConfigured: 'Strava er ikke satt opp på denne serveren.',
	/** "Strava og intervals.icu" */
	and: (names: readonly string[]) =>
		names.length > 1
			? `${names.slice(0, -1).join(', ')} og ${names.at(-1)}`
			: (names[0] ?? ''),
} as const

/**
 * The upload page (`/imports/upload`) and the share sheet's receiver
 * (`/imports/share-target`), ADR 0049: every file is saved as it lands.
 */
export const UPLOAD_LABELS = {
	title: 'Last opp økter',
	intro:
		'Én fil eller mange – eller en hel ZIP, også Strava-eksporten din. Hver økt havner på sin dag i treningsloggen.',
	files: 'Aktivitetsfiler',
	filesHint: '.fit, .fit.gz, .tcx, .gpx, .zip eller .gz',
	choose: 'Velg filer',
	chosen: (count: number, first: string) =>
		count === 1 ? first : `${count} filer valgt`,
	none: 'Ingen filer valgt',
	drop: 'Eller slipp filene her.',
	stravaExport: 'Slik ber du Strava om eksporten din',
	discipline: 'Idrett',
	disciplineHint: 'Bare for én fil. Ellers leser vi idretten fra fila.',
	autoDetect: 'Les fra fila',
	submit: 'Last opp',
	submitting: 'Laster opp …',
	noFile: 'Velg minst én fil.',
	tooLarge: 'Fila er for stor.',
	tooManyFiles: (max: number) => `Last opp høyst ${max} filer om gangen.`,
	duplicate: 'Denne økta er allerede importert.',
	/** `3 importert · 1 fantes fra før · 2 feilet` */
	summary: (imported: number, duplicates: number, failed: number) =>
		`${imported} importert · ${duplicates} fantes fra før · ${failed} feilet`,
	seeThem: 'Se dem i treningsloggen',
	/** The share sheet's answer, as a toast on I dag. */
	shareImported: (count: number) =>
		`${count} ${count === 1 ? 'økt' : 'økter'} importert`,
	shareNothing: 'Ingen økter ble importert',
	shareDuplicates: (count: number) => `${count} fantes fra før.`,
	shareFailed: (count: number, reasons: string) =>
		`${count} ${count === 1 ? 'fil' : 'filer'} kunne ikke leses: ${reasons}`,
} as const

/**
 * A file the ingest could not read, said in Norwegian. The parsers throw
 * English (`Not a valid GPX file`) that other code matches on, so the words
 * are mapped where they are shown; anything unknown reads as the fallback.
 */
const UPLOAD_FAILURE_LABELS: Record<string, string> = {
	'Not a valid FIT file': 'Ikke en gyldig FIT-fil',
	'FIT file is corrupt (failed integrity check)': 'FIT-fila er skadet',
	'FIT file contains no activity session': 'FIT-fila har ingen økt',
	'FIT session has no start time':
		'Økta i FIT-fila har ikke noe starttidspunkt',
	'FIT session has no duration': 'Økta i FIT-fila har ingen varighet',
	'Not a valid GPX file': 'Ikke en gyldig GPX-fil',
	'GPX file contains no track points': 'GPX-fila har ingen sporpunkter',
	'Not a valid TCX file (no activity found)':
		'Ikke en gyldig TCX-fil (fant ingen økt)',
	'TCX activity has no start time':
		'Økta i TCX-fila har ikke noe starttidspunkt',
	'TCX activity has no duration': 'Økta i TCX-fila har ingen varighet',
	'Unsupported file type. Accepted: .fit, .fit.gz, .tcx, .gpx, .zip, .gz.':
		'Filtypen støttes ikke. Bruk .fit, .fit.gz, .tcx, .gpx, .zip eller .gz.',
	'Could not read the archive.': 'Kunne ikke lese ZIP-fila.',
	'The file is too large.': 'Fila er for stor.',
	'The archive is too large.': 'ZIP-fila er for stor.',
}

export function uploadFailureLabel(reason: string): string {
	return UPLOAD_FAILURE_LABELS[reason] ?? 'Fila kunne ikke leses.'
}
