# Tommel

**Idé i én linje:** Appen bestemmer alt, og du svarer bare ja eller nei. Hver
interaksjon er ett kort med ett spørsmål; tommel opp eller tommel ned. Ingen
menyer, ingen skjemaer, ingen redigering.

**Akse: hvem som styrer / inndatamodus.** Posisjon: **appen styrer, utøveren
samtykker** gjennom binære svar. (Ytterpunktet motsatt av et verktøy man
betjener.)

**Hypotese:** Blir en utøver som er lei av å være sin egen trener mer fornøyd,
og trener mer jevnt, når alle valg er redusert til ja/nei på forslag fra appen,
enn når hen har full kontroll over planen?

Dette er det ubehagelige konseptet: det tar kontroll fra brukeren med vilje.

## Vinner når / koster

**Vinner når**

- Beslutningstretthet er problemet. Utøveren vil bare få beskjed.
- Ett-hånds-bruk på vei ut døra: ett blikk, en tommel.
- Hvert forslag er forklart og angrebart, så tilliten bygges uten at man må
  forstå periodisering.

**Koster**

- Den erfarne som vil «bytte tirsdag og torsdag» må vente på at appen foreslår
  det, eller si nei til forslag til det riktige dukker opp. Kan føles som å
  krangle med en automat.
- Innhenting av tall (terskel, måltid, styrkevekter) er vanskelig med bare
  ja/nei. Vi tillater ett unntak: **tall-kortet** (hjul), men aldri fritt
  skjema.
- Spørsmålsrekken kan bli lang ved oppstart (binært søk tar flere steg enn et
  skjema).

## Kortet

Ett kort fyller skjermen. Øverst et lite **emne** («I dag», «Plan», «Endring»,
«Om deg»), midt på ett spørsmål i stor skrift, under det en kort **begrunnelse**
(«Fordi du hoppet over torsdag»). Nederst to store mål: venstre **Nei**, høyre
**Ja**. Sveip kortet, eller trykk. Under kortet en tynn stabel som viser hvor
mange kort som venter (et tall, aldri mer enn 5 om dagen utenom oppstart). Hvert
kort har en liten **«Hvorfor?»** som snur kortet og viser regelen og tallene
bak.

Etter et svar kommer neste kort, eller **Ro-skjermen** når det ikke er flere:
kun dagens økt i stort.

## Reisen, jobb for jobb

### 1. Komme i gang (første åpning, null data)

Første kort: «Skal jeg legge treningen din?» Ja. Deretter en rekke korte binære
spørsmål, ordnet som et beslutningstre så man aldri får irrelevante kort: «Løper
du?» «Sykler du?» «Svømmer du?» «Har du trent jevnt i mer enn ett år?» (Ja →
«Mer enn fem?») «Trener du mer enn 4 timer i uka nå?» (binært søk: ja → «mer enn
6?» … gir et intervall, lagres som intervall, ikke et gjettet tall). Dager: «Kan
du trene mandag?» … ett kort per ukedag, i rask rekkefølge (sveip, sveip). «Vil
du løfte vekter?» → «To ganger i uka?» Hvert kort kan angres med **rist /
tilbake-pil øverst** («Forrige kort»). Totalt ca. 15–20 kort, ett minutt.

### 2. Koble på klokka

«Synker klokka di til Intervals.icu?» Ja → innlogging. Nei → «Polar?» Nei → «Vil
du laste opp en fil?» Ja åpner filvelgeren. Nei → «Da kjører vi uten. Jeg spør
igjen om en uke.» Henting: kortet blir en teller: «Henter … 128 økter.» Så et
kort: «Jeg fant 214 økter. Snitt 4 t 10 min de siste 8 ukene. Stemmer det
omtrent?» Ja / Nei (nei → «Mangler noe? Vil du koble Polar også?»). Det binære
intervallet fra steg 1 erstattes av faktiske data.

### 3. Sette et mål

«Har du et løp du sikter mot?» Nei → «Da trener vi for bedre form. Greit?» Ja →
her trengs input: **Løpskortet** er det ene kortet med felter (navn, dato via
datohjul, distanse via fire knapper: 5 km, 10 km, halv, hel, + «annen» med
hjul). Måltid: «Har du en måltid?» Ja → **tall-kort** (tidshjul). Svar: «Om 1:45
er mulig, vet jeg ikke før jeg har 6 uker data. Jeg spør deg igjen da.»

### 4. Få en plan

«Jeg har laget en plan på 17 uker. Vil du se den?» Ja → **Planarket**: et
lesbart, ikke-redigerbart sammendrag (fasene som bånd, en typisk uke per fase,
timer per uke som enkle søyler). Lukk → kort: «Starter vi?» Ja. Nei → appen spør
hva som er feil, ett kort om gangen: «For mye?» «For lite?» «Feil dager?» «For
mye løping?» Hvert ja gir en ny plan og et nytt «Starter vi?». Planen kan aldri
redigeres direkte; den kan bare forkastes og lages på nytt etter nye svar.

### 5. Vite hva jeg skal gjøre i dag

**Ro-skjermen**: dagens økt fyller skjermen. «Terskel. 50 min.» Under:
strukturen som fire rader (Oppvarming 10 min rolig · 5 × 4 min 4:35–4:45 /km · 2
min jogg mellom · Nedjogg 10 min). Hviledag: «Hvil.» Ingenting annet. Venter det
kort, ligger stabelen nederst med et tall.

### 6. Gjøre økta og få den registrert

Kondisjon: når klokka synker, kommer kortet: «Var løpeturen 18:42 dagens
terskeløkt?» Ja / Nei (nei → «Var det en ekstra økt?»). Styrke: Ro-skjermen
viser første øvelse. **Styrkemodus** er en sekvens av kort: «Knebøy, sett 1: 8 ×
60 kg. Gjort?» Ja → neste sett. Nei → «Færre reps?» Ja → tall-kort (hjul for
reps) → lagres. «Tyngre neste gang?» etter siste sett. Eller ett kort for hele
dagen: «Gjorde du dagens økt?» Ja.

### 7. Si hvordan det kjentes

Ja/nei gir for grov tyngde, så her brukes **skala-kortet** (unntak nr. 2): «Hvor
tung var den?» med ti ruter (1–10) i en rad, ett trykk. Deretter «Vil du skrive
et notat?» Ja → tekstfelt. Svaret lagres som oppgitt; mangler det, står det
«ikke oppgitt».

### 8. Når livet skjer

Brukeren kan ikke flytte noe selv. I stedet: **«Det passer ikke»-knappen** på
Ro-skjermen (den eneste knappen der). Den starter kort: «I dag i det hele tatt?»
Nei → «I morgen?» Ja → «Flytter terskel til onsdag. Da blir onsdagens rolige tur
torsdag. Ok?» Ja. Eller: «Har du mindre tid?» Ja → «30 min i stedet?» osv. «Hele
uka er tung?» Ja → «Lettere uke: 3 t i stedet for 5. Ok?» Appens egne forslag
kommer som kort i stabelen: «Du har trent 40 % mer enn plan. Gjør fredag til
hviledag?» «To bommede økter. Utsette intervallene?» Hvert endringskort viser
**før/etter** som to små rader. Etter hvert ja: en **angrestripe** nederst i 10
s, og alle endringer kan senere angres fra kortet «Siste endringer» (som man får
ved å sveipe ned på Ro-skjermen).

**En bommet uke:** Mandag ligger tre kort: «En uke uten trening. Er du skadet
eller syk?» Ja → «Start forsiktig: 3 rolige økter denne uka?» Nei → «Gjenta
forrige uke?» → «Målet står fast. Planen blir én uke kortere i Bygg. Ok?»

### 9. Forstå hvordan det gikk

Etter registrering: et **resultatkort** (ikke et spørsmål, bare «Ok»): «Planlagt
5 × 4 min på 4:35–4:45. Du løp 4:28. Over.» Ett ord stort: **Traff**, **Under**
eller **Over**, og tallene under. Mangler data: «Ingen rundetider. Hele økta: 50
→ 52 min. Traff.»

### 10. Se fremgang

Sveip opp fra Ro-skjermen: **Status**, én lang skjerm (ikke redigerbar): veien
til løpet (uke 9 av 17, fase), form og slitenhet som to linjer, ukas mengde per
idrett mot plan, og øktliste med traff/under/over. Under 6 uker: «Form: trenger
6 uker. 3 av 6.» Søndag kommer et kort: «Uka: 4 av 5 økter, alle traff. Neste
uke litt mer. Ok?»

**Dagen før løpet:** Ro-skjermen: «I morgen: Bergen halvmaraton. I dag: 15 min
rolig med 3 stigningsløp.» Kort: «Vil du ha åpningsfart for løpet?» Ja → «5:05
/km de første 5 km, fra terskelen din.» (eller «Jeg har ingen terskel for deg.
Ukjent.»)

### 11. Endre ting

Ingen innstillingsside. Langt trykk på Ro-skjermen → kort: «Vil du endre noe om
deg?» → binær meny-sekvens: «Dagene?» «Målet?» «Klokka?» «Soner?» «Kontoen?»
Hvert ja åpner den relevante spørsmålsrekken fra oppstart. Soner er det tredje
unntaket: **sonekortet** viser terskel (fart, puls, watt per idrett) med hjul;
sonene avledes og vises, men kan ikke tastes. **Slette alt:** «Kontoen?» →
«Slette alt du har lagt inn?» Ja → «214 økter, planen og koblingene forsvinner.
Det kan ikke angres. Sikker?» Ja → «Helt sikker? Sveip opp for å slette.» (Et
annet sveip enn ja, så det ikke skjer av refleks.) Etterpå: første kort.

## Struktur

Ingen navigasjon. Tre lag: **Ro-skjermen** (bunnen), **Kortstabelen** (over), og
**Status** (sveip opp). Planarket og styrkemodus er midlertidige lag.

Ruter/tilstander:

- `/` – Ro-skjermen, med stabel hvis kort venter
- `/kort/:id` – et bestemt kort (dyplenke fra varsel)
- `/oppstart` – kortsekvens for ny bruker
- `/plan` – Planarket (les)
- `/styrke/:oktId/:sett` – styrkemodus
- `/status` – fremgang og historikk
- `/endringer` – siste endringer med angre
- Tilstander: ny bruker, henter, kort venter, ingen kort (ro), styrke pågår,
  angrestripe synlig, sletting bekreftes

## Signaturinteraksjoner

1. **Ja/Nei-sveipet.** Hele appen. Høyre = ja, venstre = nei, med store
   trykkflater for den som ikke vil sveipe.
2. **Snu kortet («Hvorfor?»).** Baksiden viser regelen og tallene: «Regel: etter
   2 bommede kvalitetsøkter utsettes neste. Du bommet tirsdag og torsdag.»
3. **«Det passer ikke».** Én knapp som starter en kort binær samtale i stedet
   for en redigeringsmeny.
4. **Maks fem kort om dagen.** Appen prioriterer selv; resten venter eller
   forsvinner hvis de ikke lenger er relevante.

## Visuelt språk

- **Palett:** bakgrunn `#0E0E0E` (mørk som standard), kort `#FAFAF7`, tekst på
  kort `#111111`, Ja `#1F9D55`, Nei `#3A3A3A` (nøytral, ikke rød: nei er ikke
  feil), Over `#D9480F`, Under `#1971C2`, Traff `#1F9D55`, ukjent `#8A8A8A`. Lys
  modus: bakgrunn `#E9E9E4`, kort `#FFFFFF`.
- **Type:** `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.
  Spørsmålet 28–34 px, vekt 600. Tall i `tabular-nums`.
- **Tetthet:** minimal. Ett spørsmål på skjermen. På stor skjerm er kortet maks
  420 px bredt, sentrert, med Status ved siden av.
- **Form:** store kort med 24 px radius; runde Ja/Nei-mål på 72 px.
- **Ikoner:** tommel opp/ned i målene, pil for angre. Ellers ingen.
- **Tall:** store, ett om gangen; planlagt og faktisk alltid parvis.
- **Ukjent:** ordet «ukjent» i grått på samme sted og størrelse som tallet ville
  hatt, med en tynn stiplet ramme rundt.
- **Lys/mørk:** mørk som standard (kort lyser), lys ved systemvalg.

## Bevegelse

- Sveip: kortet følger fingeren, roterer litt (maks 8°); over terskel (35 %
  bredde eller rask fart) flyr det ut, ellers fjærer det tilbake (spring, ingen
  sprett).
- Neste kort reiser seg fra stabelen (200 ms, ease-out).
- Snu kortet: 3D-rotasjon 300 ms. Angrestripe glir inn nedenfra (150 ms) og ut
  etter 10 s.
- Redusert bevegelse: ingen rotasjon eller flyging; svar via knapper, kort
  bytter med toning; snu blir toning mellom for- og bakside.

## Stemme

Kort, bestemt, alltid et spørsmål eller en beskjed. Ingen småprat.

- «Skal jeg legge treningen din?» (tom tilstand, første kort)
- «Ingen kort nå. Gjør dagens økt.» (tom stabel)
- «Flytte terskel til onsdag?»
- «Fordi du har trent 40 % mer enn planlagt.»
- «Form: ukjent. Trenger 6 uker, har 3.» (ukjent)
- «Over. Du løp 4:28, målet var 4:35–4:45.»
- «Helt sikker? Sveip opp for å slette.»

## Risiko / hva vi lærer

- **Kontrolltap.** Den viktigste lærdommen: tåler målgruppen å ikke kunne flytte
  en økt direkte? Vi måler «nei»-rekker (mange nei på rad = frustrasjon).
- **Lengde på oppstart.** Binær innhenting tar flere trykk; måler
  fullføringsgrad.
- **Unntakene** (løpskort, tall-kort, skala-kort, sonekort) må være få; øker de,
  har modellen sprukket.
- Mye regellogikk for gode forslag; en modell kan senere velge _hvilket_ forslag
  som kommer først, men utfallet må alltid være deterministisk og angrebart.
