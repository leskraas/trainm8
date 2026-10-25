/**
 * The Art. 13 privacy notice (#549, ADR 0105), in Norwegian like every legal
 * text the athlete reads (ADR 0105 amends ADR 0081 §4). A DRAFT: it needs a
 * legal review before any athlete but the owner. `[…]` marks a fact only the
 * owner can fill in; never invent one. Part of `labels.ts`: import from the
 * barrel.
 */
export const PRIVACY_NOTICE_LABELS = {
	title: 'Personvernerklæring',
	draft:
		'UTKAST — må gjennomgås juridisk før andre enn eieren tar appen i bruk.',
	updated: 'Sist endret 24. oktober 2026 (utkast)',
	intro:
		'Her står hvilke opplysninger trainm8 behandler om deg, hvorfor, hvor lenge, hvem som får dem, og hvilke rettigheter du har.',
	sections: [
		{
			heading: 'Behandlingsansvarlig',
			body: [
				'trainm8 drives av [NAVN PÅ BEHANDLINGSANSVARLIG], [ORGANISASJONSNUMMER], [POSTADRESSE].',
				'Kontakt om personvern: [E-POSTADRESSE FOR PERSONVERN].',
			],
		},
		{
			heading: 'Hva vi behandler',
			body: [
				'Konto: e-post, brukernavn, navn, profilbilde og innloggingsøkter.',
				'Treningsdata: planlagte og gjennomførte økter, puls-, watt- og tempokurver, GPS-spor, aktivitetsfiler, terskler, vekt, høyde, fødselsdato og kjønn, opplevd anstrengelse (RPE) og notatene dine.',
				'Treningsdata kan si noe om helsen din. Vi behandler dem derfor som helseopplysninger (personvernforordningen artikkel 9).',
			],
		},
		{
			heading: 'Formål og rettslig grunnlag',
			body: [
				'Kontoen og tjenesten: for å levere appen du har bedt om (artikkel 6 nr. 1 bokstav b).',
				'Treningsanalyse: å lagre, analysere og planlegge treningen din. Dette er helseopplysninger, og vi gjør det bare med ditt uttrykkelige samtykke (artikkel 9 nr. 2 bokstav a). Uten dette samtykket kan appen ikke brukes.',
				'Deling med en KI-assistent: bare hvis du slår det på, med et eget samtykke som er av til du sier ja. Du kan trekke det tilbake når som helst uten at resten av appen påvirkes.',
				'Sikkerhet og feilretting: tekniske logger, for å holde tjenesten trygg (artikkel 6 nr. 1 bokstav f).',
			],
		},
		{
			heading: 'Hvem som får opplysningene',
			body: [
				'Fly.io drifter appen og databasen, som ligger i Stockholm.',
				'Tigris (gjennom Fly.io) lagrer profilbilder.',
				'Resend sender e-post til deg og får e-postadressen din.',
				'Intervals.icu, hvis du kobler til: vi henter øktene dine derfra med nøkkelen du gir oss. Data fra Garmin-klokker kommer til oss gjennom Intervals.icu, og vi oppgir Garmin som kilde.',
				'Sentry mottar feilrapporter og ytelsesdata (sporing og profilering av forespørsler) uten at vi sender treningsdata med med vilje [HVIS AKTIVERT: REGION OG LAGRINGSTID].',
				'En KI-tjeneste er planlagt, men ikke i bruk. Den blir bare brukt hvis du samtykker, og står her med navn og region før den tas i bruk.',
				'Kobler du din egen KI-assistent (for eksempel Claude eller ChatGPT) til trainm8, havner det den henter hos den leverandøren, under deres vilkår, og kan bli sendt ut av EØS. Vi kan ikke hente tilbake det assistenten allerede har fått.',
			],
		},
		{
			heading: 'Overføring ut av EØS',
			body: [
				'Fly.io er et amerikansk selskap sertifisert under EU–US Data Privacy Framework. Andre leverandører utenfor EØS bruker EUs standardkontrakter. [BEHANDLINGSANSVARLIG BEKREFTER LEVERANDØRLISTEN OG AVTALENE.]',
			],
		},
		{
			heading: 'Hvor lenge vi lagrer',
			body: [
				'Treningsdata, aktivitetsfiler og kurver: så lenge du har konto. Sletter du kontoen, forsvinner de fra den aktive databasen med en gang. Kopier i sikkerhetskopier følger nedenfor.',
				'Profilbildet ditt blir i dag ikke slettet fra bildelageret (Tigris) når du sletter kontoen. Vi bygger slettingen; til den er på plass, fjerner vi bildet når du ber om det.',
				'Øktene du har laget selv, slettes sammen med kontoen. Bygger en annen utøvers trening på en av dem, blir den liggende skjult og uten navnet ditt.',
				'Øvelser du har laget selv, blir i dag liggende uten kobling til deg når du sletter kontoen. [BEHANDLINGSANSVARLIG AVGJØR HVOR LENGE DE LAGRES.]',
				'Sikkerhetskopier: inntil 5 dager. Slettede data forsvinner når kopiene utløper.',
				'Tilgangsnøkler til tilkoblede tjenester: til du kobler fra, eller etter 90 dager uten at koblingen virker.',
				'Strava: trainm8 henter ikke lenger fra Strava. Bufrede Strava-data slettes etter 7 dager.',
				'Samtykkene dine: så lenge du har konto, med tidspunkt og versjon.',
				'Logg over hva en KI-assistent har gjort i kontoen din: 12 måneder.',
				'Samtaler med KI-assistenter lagrer vi ikke.',
			],
		},
		{
			heading: 'Rettighetene dine',
			body: [
				'Du kan be om innsyn, retting, sletting, begrensning og dataportabilitet, og du kan protestere mot behandlingen.',
				'Under Meg kan du laste ned alt vi har lagret om deg som én fil, og slette kontoen.',
				'Du kan trekke tilbake et samtykke når som helst. Det endrer ikke lovligheten av behandlingen før du trakk det tilbake.',
				'Vi tar ingen automatiserte avgjørelser som har rettsvirkning for deg.',
			],
		},
		{
			heading: 'Klage',
			body: [
				'Du kan klage til Datatilsynet (datatilsynet.no). Ta gjerne kontakt med oss først.',
			],
		},
	],
} as const
