# Prat

**Idé i én linje:** Hele appen er én samtaletråd med treningspartneren. Ingen
skjermer, ingen faner: alt skjer som meldinger, svarknapper og innebygde kort i
tråden.

**Akse: interaksjonsmodell.** Posisjon: **dialog** (sekvensiell, turtakende),
ikke navigasjon mellom skjermer.

**Hypotese:** Er det lettere for en utøver uten trener å forstå og godta en plan
når den forklares og forhandles i en samtale, enn når den presenteres som en
kalender man må tolke selv?

## Vinner når / koster

**Vinner når**

- Nybegynneren, som ikke vet hva hen skal spørre om: appen spør, én ting om
  gangen.
- «Når livet skjer»: «Jeg rekker ikke torsdag» er en naturlig setning, og svaret
  kommer med konkrete valg.
- Ærlighet føles som en partner som snakker, ikke et rødt tall.

**Koster**

- Oversikt. En hel sesong i en tråd er vanskelig å skumme; vi trenger innebygde
  kort som kan foldes ut, og et «Oppslag» for den som vil se planen samlet.
- Ingen språkmodell: brukeren kan ikke skrive fritt og forvente forståelse.
  Fritt felt finnes, men det er et søk/kommando-felt med forslag, ikke magi.
- Samtalen kan føles treg for den erfarne som bare vil bytte to økter.

## Grunnprinsipp: deterministisk samtale

Appen snakker fra en regelmotor over data (plan, økter, tilgjengelighet). Hvert
utsagn er en mal med fylte felt. Brukeren svarer med **svarknapper** (2–4 valg),
**innebygde kontroller** (glidebryter, dagvelger, tallfelt) eller
**kommandolinja** nederst, som gjenkjenner et fast vokabular («flytt», «bytt»,
«hopp over», «kortere», «lettere uke», «i dag», «plan», «form», «soner») med
autoforslag mens man skriver. En språkmodell kan senere tolke fritekst, men
bekreftelsen vil alltid være en deterministisk knapp.

## Reisen, jobb for jobb

### 1. Komme i gang (første åpning, null data)

Tråden er tom bortsett fra én melding: «Hei. Jeg skal legge treningsplanen din.
Først litt om deg. Hva trener du?» Svarknapper: Løping, Sykkel, Svømming
(flervalg, så «Ferdig»). Deretter én ting om gangen: «Hvor lenge har du trent
jevnt?» (4 knapper), «Hvor mye trener du nå, omtrent?» (glidebryter i timer/uke,
med «vet ikke»), «Hvor mange dager i uka kan du trene?» (1–7), «Noen dager som
ikke går?» (innebygd ukevelger), «Vil du løfte?» (Nei / 1 / 2 / 3 ganger i uka).
Hvert svar blir stående som din boble; trykk på den for å endre det.

### 2. Koble på klokka

«Har klokka di en tjeneste den synker til?» Knapper: Intervals.icu, Polar, «Jeg
laster opp en fil», «Ikke nå». Kobling åpner tjenestens innlogging; tilbake i
tråden: «Henter historikken … 38 av ukjent antall økter.» Så: «Ferdig. 214
økter, den eldste fra mars 2024. Du har trent snitt 4 t 10 min i uka de siste 8
ukene.» Uten data: «Da starter vi uten historikk. Jeg blir mer presis etter
hvert.»

### 3. Sette et mål

«Har du et løp eller ritt du sikter mot?» Ja / Bare bli i bedre form. Ved ja:
innebygd kort med navn, dato, distanse og valgfri måltid. Partneren reagerer:
«17 uker til. Det rekker godt for en halvmaraton.» Med måltid uten nok data: «Om
1:45 er realistisk vet jeg ikke ennå. Jeg sier ifra når jeg har 6 uker å gå på.»

### 4. Få en plan

«Her er forslaget mitt.» Et **sesongkort** dukker opp i tråden: en horisontal
stripe med faser (Grunn, Bygg, Topp, Nedtrapping) og antall uker, og under den
uke 1 som sju små ruter. Partneren forklarer i tre korte meldinger: hva fasene
er, hvorfor ukene ser slik ut, hva en typisk uke inneholder. Svarknapper: «Ser
bra ut», «For mye», «For lite», «Flytt langturen», «Vis uke for uke». Hvert valg
gir et nytt sesongkort med endringen markert. Ingenting gjelder før «Ser bra
ut».

### 5. Vite hva jeg skal gjøre i dag

Hver morgen (eller ved første åpning den dagen) står det en ny melding nederst:
«God morgen. I dag: terskelintervaller, 50 min.» Under: **øktkort** med en
stablet strek (oppvarming, 5 × 4 min, pauser, nedjogg) og mål: «4:35–4:45 /km
eller puls 165–172». Svarknapper: «Vis detaljer», «Jeg tar den senere», «Flytt».
Hviledag: «I dag er hviledag. Ikke la deg friste.»

### 6. Gjøre økta og få den registrert

Når økta kommer fra klokka: «Fikk løpeturen din fra 18:42. Jeg har koblet den
til dagens terskeløkt.» Feil kobling? Knapp: «Det var ikke den.» Usikker
kobling: «Jeg fikk en sykkeltur på 55 min, men du hadde løping i dag. Var den i
stedet for?» Ja / Nei, det var ekstra. Styrke: «Klar for styrke?» →
**styrkekort** i tråden som tar hele skjermen (et «fokusert kort»): øvelse for
øvelse, sett som rader med reps og kg forhåndsutfylt, huk for hvert sett. Lukk
og kortet krymper tilbake i tråden som oppsummering. «Gjort» er alltid en
svarknapp under dagens økt.

### 7. Si hvordan det kjentes

Rett etter registrering: «Hvor tung var den?» En rad med 1–10 som knapper. Så:
«Noe å notere?» med «Nei» og et tekstfelt. Notatet lagres som det er.

### 8. Når livet skjer

Kommandolinja: skriv «flytt» eller trykk på en økt i tråden → «Til hvilken dag?»
(ukevelger med dager som går markert). «Bytt» → «Med hvilken?» (ukas økter som
knapper). «Kortere» → glidebryter for minutter. «Lettere uke» → partneren viser
den lettere uka som kort med før/etter. Partneren foreslår selv: etter to
bommede økter: «Du har ikke fått trent siden lørdag. Skal jeg gjøre resten av
uka lettere, eller flytte intervallene til søndag?» Etter for mye: «Du har trent
40 % mer enn planlagt denne uka. Jeg foreslår at fredag blir hvile.» Hver
endring bekreftes med et lite **endringskort** («Torsdag → lørdag») med «Angre»
som står i 7 dager.

**En bommet uke:** Mandag etter: «Forrige uke ble det ingen økter. Vil du
fortsette der vi var, eller gjenta forrige uke?» To kort, før og etter, side ved
side.

### 9. Forstå hvordan det gikk

Etter hver kondisjonsøkt: «Planlagt 5 × 4 min på 4:35–4:45. Du løp 4:28 i snitt.
Litt over.» Under: et lite **sammenligningskort** med drag for drag (planlagt
strek, faktisk strek oppå). Mangler data: «Fila har ikke rundetider, så jeg kan
bare sammenligne hele økta.»

### 10. Se fremgang

Skriv «form» eller trykk på «Hvordan går det?» (alltid tilgjengelig forslag over
kommandolinja). Svar: tre meldinger med kort: formkurve (form og slitenhet over
tid), ukas mengde per idrett mot plan, og **veien til løpet** (uke X av Y,
fase). Under 6 uker: «Formkurva trenger 6 uker med data. Du har 3. Til da kan
jeg vise mengde.» Søndag kveld kommer en kort **ukesoppsummering** av seg selv.

**Dagen før løpet:** «I morgen er det Bergen halvmaraton. I dag: 15 min rolig
med 3 stigningsløp. Du har gjort 41 av 46 planlagte økter. Vil du se en
åpningsplan for løpet?» Ja gir et kort med fart for de første kilometerne,
regnet fra terskel, eller «Jeg har ikke terskel for deg, så jeg kan ikke regne
fart» hvis den mangler.

### 11. Endre ting

Kommandolinja: «soner», «tilgjengelighet», «mål», «koblinger», «konto». Hver gir
et innebygd redigeringskort i tråden. Et menyikon øverst (eneste krom) lister de
samme som snarveier. Endringer som påvirker planen: «Endringen påvirker 4 økter.
Vil du se dem?» **Slette alt:** «konto» → «Slett alle dataene mine». Partneren
svarer: «Det sletter 214 økter, planen din og koblingene til Polar. Det kan ikke
angres.» Knapp «Slett alt» krever langt trykk (1,5 s). Etterpå er tråden tom med
første melding igjen.

## Struktur

Én tråd, en kommandolinje nederst, og et **Oppslag** (ark som glir opp) som
viser plan, historikk og fremgang samlet for den som vil skumme. Ingen
fanelinje.

Ruter/tilstander:

- `/` – tråden, rullet til siste melding
- `/#melding-:id` – dyplenke til en melding (f.eks. fra varsel)
- `/oppslag/plan`, `/oppslag/uke/:uke`, `/oppslag/okter`, `/oppslag/form` –
  arket
- `/okt/:id` – fokusert øktkort (detaljer, sammenligning)
- `/styrke/:id` – fokusert styrkekort
- `/innstillinger/:del` – fokusert redigeringskort (soner, tilgjengelighet, mål,
  koblinger, konto, slett)
- Tilstander: ny bruker (tom tråd), henter historikk, venter på svar, forslag
  åpent, endring angrebar, offline (meldinger merket «sendes når du er på nett»)

## Signaturinteraksjoner

1. **Svarknapper som alltid finnes.** Hver melding fra partneren som trenger noe
   har 2–4 knapper; man trenger aldri skrive.
2. **Kommandolinja med autoforslag.** Skriv «fl» → «flytt torsdagens økt». Fast
   vokabular, forutsigbart.
3. **Trykk på din egen boble for å angre/endre** et tidligere svar; partneren
   regner om og viser hva som endret seg.
4. **Fokuserte kort.** Et kort i tråden kan utvides til full skjerm (styrke,
   øktdetaljer) og krympe tilbake som oppsummering.

## Visuelt språk

- **Palett:** bakgrunn `#FFFFFF`, partnerboble `#F1F3F5`, din boble `#1D4ED8`
  med hvit tekst, tekst `#111827`, svak `#6B7280`, traff `#15803D`, under
  `#B45309`, over `#B91C1C`, ukjent `#9CA3AF`. Mørkt: `#0B0D10`, partnerboble
  `#1A1D22`, din boble `#3B82F6`, tekst `#F3F4F6`.
- **Type:** `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`,
  17 px. Tall med `font-variant-numeric: tabular-nums`.
- **Tetthet:** middels; bobler maks 80 % bredde, kort full bredde. På stor
  skjerm sentrert tråd 40em med Oppslag fast til høyre.
- **Form:** bobler 18 px radius, kort 14 px, knapper som piller.
- **Ikoner:** få; idrettsikon i øktkort, pil for «angre».
- **Tall:** fet i boblene (**4:28**), alltid med det planlagte ved siden av.
- **Ukjent:** grå piller med prikket kant: `ukjent`, `trenger 6 uker`. I grafer
  en stiplet tom ramme med teksten midt i.
- **Lys/mørk:** følger systemet.

## Bevegelse

- Ny melding fra partneren: kort «skriver …»-indikator (maks 400 ms; kun der
  svaret er beregnet og det hjelper rytmen, aldri kunstig venting over det), så
  boblen glir opp 8 px og toner inn (200 ms, ease-out).
- Svarknapper: forsvinner når valgt; valgt tekst flyr inn i din boble (250 ms).
- Fokusert kort: utvides fra posisjonen sin til full skjerm (300 ms spring uten
  sprett), lukkes tilbake samme vei.
- Redusert bevegelse: ingen «skriver …», ingen flyging; meldinger vises direkte,
  kort bytter med kort toning.

## Stemme

Vennlig, direkte, korte meldinger. Spør før den gjør.

- «Hei. Jeg skal legge treningsplanen din. Først litt om deg.» (tom tilstand)
- «I dag: terskelintervaller, 50 minutter. Klar?»
- «Du løp 4:28 i snitt. Målet var 4:35–4:45. Litt for ivrig.»
- «Formkurva trenger 6 uker med data. Du har 3.» (ukjent)
- «Fila har ingen puls, så jeg vet ikke hvor hardt det var.» (ukjent)
- «Du har ikke trent siden lørdag. Skal jeg lette resten av uka?»
- «Flyttet til lørdag. Angre?»
- «Det sletter 214 økter og planen din. Det kan ikke angres.»

## Risiko / hva vi lærer

- **Forventer folk at den forstår fritekst?** Vi måler hvor ofte kommandolinja
  får uforstått input; det forteller oss hvor en modell ville gitt mest.
- **Tråden blir lang.** Vi lærer om Oppslaget blir hovedveien for erfarne; i så
  fall er dialog et onboarding- og endringsverktøy, ikke hele appen.
- **Tone.** En partner som «snakker» kan føles påtrengende; vi tester om
  morgenmelding er ønsket eller bør være opt-in.
