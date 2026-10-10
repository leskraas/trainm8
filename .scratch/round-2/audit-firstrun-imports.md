# Audit runde 2: første kjøring (first run) + import og logging

Repo `main` @ 326fc7f (build/ har samme app-kode; siste commit rørte bare e2e). Kun lesing, ingen endringer i repoet.
Kjørt: `PORT=3603 NODE_ENV=production MOCKS=true MOCK_INTERVALSICU=true MOCK_STRAVA=true node index.ts`.
**Merk:** uten `MOCK_INTERVALSICU=true` avviser appen mock-nøkkelen, så den flagget må med når du verifiserer første kjøring.
Tre nye brukere ble registrert gjennom UI-et (signup → kode fra den mockede e-posten → onboarding → lander på `/start`).
Bruker 1 hadde ingen historikk. Bruker 2 og 3 fikk fire uker med løping (43 km/uke, 5:35) seedet slik `first-run.test.ts` gjør det.
Importscenarier (ekstra / spørsmål / lenket / Gjort / Koble igjen / styrkedag) ble seedet for bruker 1 slik `imports.test.ts` og `strength-screens.test.ts` gjør det.
Skjermbilder: `scratchpad/shots/r2-firstrun-*.png` og `r2-imports-*.png` (74 filer: 390×844 touch og 1280×860, lys og mørk, 320 px til break-ui).

## 1. Kort oppsummering

1. Første kjøring er **bygd fra ende til ende** (story 61–71), og flyten virker. Men den er ikke tatt inn i designsystemet: native blå checkbokser og radioknapper, `<details>` med ▶-trekant, egne knappeklasser med `rounded-xl` ved siden av `Button` i `rounded-4xl`, og rå `text-[15px]`/`text-[13px]` i stedet for typetrinnene.
2. **Det du forhåndsviser er ikke det som havner på I dag.** Steg 5 viser «Rolig økt · Løping» og «Langtur · Løping». I dag viser «54 min» og «1 h 48 min», med engelsk `h` (`stamp.server.ts:468` → `session-title.ts:60`). Begge ukene er merket «hard uke».
3. **Feltet «Timer i uka» blir fylt ut med dagens volum, men brukes som tak.** En løper som trener 4 t får en plan som starter på 2,5 t (−37 %). I tillegg gir filosofibyttet ingen synlig forskjell på steg 4–5, og «Terskelfokus … to i uka» viser null harde økter de to første ukene. Dette er en eierbeslutning.
4. Importsløyfen på I dag virker: lenke, spørsmål, Angre/Koble igjen, Gjort og hurtiglogg. Svaret kommer på ca. 1,1–1,2 s. Men ordet **«ekstra» og «tallene kommer fra importen» ligger bare bak glyfen** (story 79/82 er derfor delvis bygd). Ekstraøkta heter «57 min 12 s run» og bærer glyfen ◌ for «appens økt».
5. Integrasjonssiden, opplastingen, connect/sync-toaster, deling og batch-oppsummering er **helt på engelsk**. «Last synced» viser tidspunktet for siste aktivitet, ikke siste synk. Strava tilbys selv om #505 har tatt Strava ut av scope. Feiltekster er 10 px over hele området.

## 2. Spec-tabell

| Story/ADR | Status | Bevis | Merknad |
|---|---|---|---|
| 61 koble til intervals.icu først | Bygd | `_auth/onboarding/index.tsx:125` (`safeRedirect(…,'/start')`), `start/index.tsx:51-70` | Hoppe over er mulig, og prisen står (`skipConsequence`). Arket J1 har også «Last opp GPX/FIT» og «Vi bare leser»; ingen av dem finnes. |
| 62 «Dette fant vi» | Bygd | `start/funn.tsx:41-78` | Fire tekstrader. Arket J2 har km per uke i stolper, lengste tur og rolig fart. Ingen graf her. Når ingenting finnes, gjentas samme grunn fire ganger, og primærknappen sier likevel «Det stemmer» (skjermbilde `02b`). |
| 63 «Noe er feil» | Bygd | `funn.tsx:156-192` | Skjemaet stiller de samme tre spørsmålene som steg 3 (dobbelt). Med «ikke målt» er Løping og fire dager forhåndsvalgt, som om det var funnet. |
| 64 tre spørsmål, forhåndsutfylt | Bygd | `sporsmal.tsx:239-273` | Introen «Fylt ut fra historikken din» står også når ingenting ble funnet (`03c`). «Timer i uka» er et feltnavn, ikke et spørsmål som de to andre. Idretten er skrivebeskyttet. |
| 65 timeregnestykket | Bygd | `labels.ts:1738` `hoursEstimateLabel`; skjermbilde `h-03b` «43 km/uke à 5:35 ≈ 4 t» | — |
| 66 «Vi valgte X fordi …» | Bygd | `labels.ts:1781`; `plan.tsx:74` | Etter et bytte: «Vårt forslag: Vi valgte Klassisk 3:1 fordi …» gir to «vi valgte» etter hverandre. |
| 67 bytte filosofi | Delvis | `plan.tsx:175-213` | Mekanikken virker, men åpen plan med 5 t viser identiske tall (blokk, første/tyngste uke) og identiske økter for Klassisk og Polarisert (`04` mot `04c`). Byttet ser ut som om det ikke gjør noe. |
| 68 se de to første ukene | Delvis | `uker.tsx:285-321` mot `stamp.server.ts:468` | Forhåndsvisningen sier «Rolig økt · Løping». Det som lagres heter «54 min» / «1 h 48 min» (`07-idag-nextweek`). Etter «Start planen» dekker en toast topplinja, og de to ukene ligger under bretten («før planen»-uka vises først). |
| 69 «Jeg vil heller sette opp sesongen selv» | Bygd | `uker.tsx:344-346` | Lander i Sesong, som er på engelsk («YOU'RE BUILDING TOWARD», «Your season», `06-self-landing-b`). Ingen bekreftelse på at planen ble laget. |
| 70 vanlige ord, ingen sonekoder | Delvis | `labels.ts:2139` | Det er ingen Z-koder. Men I dag kaller begge de første ukene «hard uke», mens steg 4 sier «Første uke starter lavere». Etter planstart står «Formen kan leses etter 42 dager — dag 0/42». |
| 71 «ikke målt» med grunn | Bygd | `labels.ts:1748` | — |
| #505 «Planen respekterer dager og timer» | Bygd, men se avvik | `draft.ts:197-208` `cappedAnchor` | Timene blir et tak, og da starter første uke langt under dagens volum (4 t → 2,5 t). Med 0,5 t blir det «Langtur · 6 min» og «0,1 t til sammen». Med 7 dager blir det ingen hviledag. |
| 78 import lenker seg til planlagt økt | Bygd | `import-fit.ts` `fitsImport`, `activity-import.server.ts` | Bekreftet i appen («Det var Rolig 10 km» → økta ble gjort). |
| 79 «ekstra» på sin dag | Delvis | `stream.tsx:1144-1152`, `1222-1232` (bare sr-only) | Økta vises og teller, men ordet «ekstra» står bare i glyf-popoveren. Tittelen er `deriveRecordingTitle` → «57 min 12 s run» (`session-title.ts:131-142`). Glyfen ◌ betyr «appens økt», men appen planla den aldri. |
| 80 spør bare når usikker | Bygd | `import-link.ts:144-176`, 14 dagers vindu | To like titler gir to identiske svarknapper («Det var Rolig 10 km» ×2, `dark-02-ask`). |
| 81 Angre kobling / Koble igjen | Bygd | `import-actions.tsx:30-60`, i popover (`05`, `09`) | Ligger bak glyfen (ADR 0086). Ingen toast etter angring, i motsetning til Arket K. |
| 82 «Gjort» uten tall | Delvis | `import-link.ts:180-205`; synlig bare i popover | Etter Gjort viser raden bare en grønn prikk (`12-after-gjort`). «tallene kommer fra importen» er ikke synlig uten å trykke på glyfen. Spec: «I want to *see* …». |
| 83 kort styrkelogg, forhåndsutfylt | Bygd | `strength-log-panel.tsx`, `strength-log.ts` | Øvelsesnavnene er engelske («Back Squat», «Bench Press»). Kilo med punktum: «62.5 kg» (`strength-log.ts:363` `formatKg`). Det går mot eierens beslutning i runde 2. |
| 84 «Som planlagt» med ett trykk + Endre | Bygd | `strength-log-panel.tsx:135-196` | Ingen angring etter ett trykk (toasten «6 sett logget.» har ingen Angre). |
| 85 «til og med torsdag · resten ikke målt» | Bygd (kode), ikke sett | `week-volumes.ts:707`, `labels.ts:650` | Testbrukeren hadde ikke noe styrkespor. |
| ADR 0049 hver import lagres automatisk | Bygd | `imports._index.tsx` → `/me`; deling og opplasting går gjennom `ingestUploadedFiles` | Deling svelger feil i stillhet og lander på `/` uten beskjed (`imports.share-target.tsx:50-56`). Opplasting av én fil lander på den engelske `/training/sessions/:id`. |
| #505 «intervals.icu only; Strava out of scope» | Avviker | `settings/integrations.tsx:165-180`, `directory.ts` | «Connect Strava» vises når Strava er konfigurert. |
| ADR 0081 norsk på #505-flater | Avviker | §6 | Integrasjonssiden, opplastingen, connect/sync-toaster og tittelen på ekstraøkter er på engelsk. |
| ADR 0085 designsystemet | Avviker | §3 | — |
| ADR 0028 / mobile baseline | Delvis | §4 | 10 px feiltekst. Innganger på 16 px er OK. Native datofelt viser `mm/dd/yyyy` (følger nettleserens språk). |

## 3. Designavvik mot Arket J/K og designsystemet

| # | Hvor | Nå | Bør være (ADR 0085 / design-system.md) |
|---|---|---|---|
| D1 | `__first-run-frame.tsx:176-181` `PRIMARY_ACTION`/`SECONDARY_ACTION` | Egne lenker/knapper i `rounded-xl` (8,4 px) uten `pressable`. Står ved siden av `<Button>` (rounded-4xl, pille) på samme skjerm (funn: «Det stemmer» mot «Bruk dette»; uker: «Start planen» mot «sette opp selv») | `buttonVariants({size:'lg'})` på `<Link>` og `variant="outline"`, så hele flyten har én radius |
| D2 | `__first-run-fields.tsx:219-233`, `sporsmal.tsx:348-376`, `plan.tsx:185-206` | Native `<input type=checkbox/radio>` som tegnes i Chromiums blå aksentfarge, ikke appens grønne | Dager: `ToggleGroup variant="outline" multiple` som sju piller på én rad (Arket J3). Mål og filosofi: `SegmentedControl`/kortvalg eller `ui/checkbox`. Timer: chips (Arket) eller `Input` med stepper |
| D3 | `funn.tsx:156`, `plan.tsx:175` | `<details>` med nettleserens ▶ i en ramme med `rounded-xl border`; ingen animasjon | `Collapsible` + `motion-collapse`, chevron-`Icon` |
| D4 | Alle steg | `text-2xl font-semibold`, `text-[15px]`, `text-[13px]`, `text-lg` | `text-title`, `text-callout`, `text-footnote`, `text-heading` |
| D5 | Steg 4 | Bare tekstliste | Arket J4: sesongkurve med fasebånd og stiplede «bare ukemål»-stolper. Strip- og sesongtabellkomponentene finnes allerede på I dag |
| D6 | Steg 2–5 | Ingen tilbake-chevron (Arket har 44 px «Tilbake»). Steg 4–5 har tekstlenker nederst | `PageHeader back` eller en chevron i rammen |
| D7 | `forms.tsx:50,71` `ErrorList` | `text-[10px]` rød | `text-footnote text-destructive` (13 px). Feltfeil hele området bruker denne |
| D8 | `status-button.tsx` | Rødt ✕-merke inne i primærknappen ved feil; sr-tittelen er engelsk («error», «loading», «success») | Feilen står allerede ved feltet: ingen tilstand på knappen, norske titler |
| D9 | `strength-log-panel.tsx:43-46` | Egne `PRIMARY`/`SECONDARY` i `rounded-[10px] text-[13px]` uten `pressable`; kortet er `rounded-2xl border bg-card` | `Button` (default/outline, `size="sm"`, pille som «Se økta»); kortet i `rounded-3xl`/`4xl`, tone fremfor kantlinje |
| D10 | `strength-log-panel.tsx:316` `SetInput` | Eget input i `rounded-[10px]` | `Input` (luma `rounded-3xl`, h-11) med `inputMode="numeric"` |
| D11 | `import-actions.tsx:78-113` | Spørsmålskortet er `rounded-2xl border`; svarene er løs tekst i 12 px (`text-[12px]`, `text-[12.5px]`, `text-[11px]`) som ikke ligner knapper | `Button variant="outline" size="sm"` for «Det var …», `ghost` for «En ekstra økt»/«Annet»; `text-footnote`/`text-caption` |
| D12 | `import-actions.tsx:44,78`, `strength-log-panel.tsx:72` | Magiske `pl-[103px]`/`ml-[103px]` | `TITLE_INSET`-konstanten stream allerede bruker |
| D13 | `settings/integrations.tsx` | `rounded-md` på monogramflisa, `rounded-md border` på dual-source-boksen, `SectionLabel` med `text-xs tracking-wider` | `rounded-2xl`, `Alert`, `text-overline uppercase`; `AlertDialogPopup` er et alias design-system D9 sier skal bort når denne siden flyttes |
| D14 | `imports.upload.tsx:179` | Dropzonen er `rounded-md border-dashed` med native filknapp («Choose Files»); `Select` uten `items` (closed-trigger-regelen) | `rounded-3xl` slippsone med egen knapp «Velg filer»; `Select items` |
| D15 | Landing etter første kjøring | Toast oppe til venstre over topplinja | Arket J5: en kvitteringslinje i listen («Planen er klar · Blokk 1 starter mandag»), og rull til første planlagte uke |
| D16 | Arket K | Importrader viser kilden («intervals.icu») og «ekstra» synlig; angre gir toast | Se §8 nr. 6: vis ett diskret merke («ekstra»/«uten tall») på raden og la resten ligge i popoveren |

## 4. Håndverk (Emils skills: emil-design-eng, apple-design, review-animations, mobile-native)

### 4a. Before / After / Why

| Before | After | Why |
|---|---|---|
| `PRIMARY_ACTION`/`SECONDARY_ACTION` uten `:active` (`__first-run-frame.tsx:176-181`) | `buttonVariants` → `pressable` (scale 0.97, 160 ms `--ease-out`) | apple-design §1 / emil: knapper skal svare når fingeren går ned. Nå skjer ingenting før navigeringen |
| Styrkeloggens `PRIMARY`/`SECONDARY` og svarknappene i «Hva var dette?» uten press | `Button` med `pressable` | Samme. Dette er handlinger som skjer flere ganger i uka og trenger umiddelbar respons, ikke pynt |
| `<details>` åpner Noe er feil / Bytt filosofi og ~400 px innhold dukker opp på én frame (`02c`, `04b`) | `Collapsible` med `motion-collapse` (200/150, høyde + opasitet) | Det eneste godkjente layoutanimasjonsunntaket. Innhold som hopper er nettopp den brå endringen det er laget for |
| Bytte steg gir hard navigering; hele skjermen byttes | View Transition på `main`: 200 ms krysstoning + 8 px `translateX` i retningen du går (bakover speiler), redusert bevegelse = bare toning | Første kjøring er sjelden og skjer første gang. Emils frekvenstabell åpner for litt glede her. Retningen forteller hvor i flyten du er (apple-design §7, romlig konsistens) |
| «Dette fant vi»-radene byttes når pollingen er ferdig → CLS **0,132** målt (`funn.tsx:110-116`, banneret forsvinner) | Reserver bannerets høyde (eller gjør det om til en linje i `dt`) og la de fire radene tone inn med 40 ms stagger (opacity + 6 px translateY, 200 ms ease-out) | Fjerner layout-hoppet. Øyeblikket «nå har vi lest historikken din» er stedet der litt glede gjør seg fortjent |
| Steg 4 uten graf | Sesongstolpene vokser én gang ved innlasting (`scaleY` 0,9→1 + opasitet, origin bottom, 30 ms stagger, totalt < 300 ms); ikke ved bytte av filosofi, da krysstones de | Viser formen på planen. Engangsavsløring på en sjelden skjerm; tal bare `transform`/`opacity` |
| «Steg 2 av 5» som tekst | 5-segments `Progress` der aktivt segment går over med `scaleX` (ikke bredde) | Fremdrift du ser. Design-system-regelen «progress fill does not animate» gjelder bredde; `scaleX` er OK |
| Etter «Start planen»: toast over topplinja, uka ligger under bretten | Land med første planlagte uke synlig og en kort uthevingspuls i bakgrunnen på ukeoverskriften (opasitet, 600 ms, én gang) i stedet for toasten | Det mest «feirende» øyeblikket i appen. Det skal peke på planen, ikke dekke den |
| `StatusButton` viser spinner/✕ inne i knappen | Bare «Kobler til …»-tekst og deaktivert knapp; feilen ved feltet | Et rødt ✕ i en grønn knapp er støy. Feedback hører hjemme der feilen er |
| Svar på import/Gjort/logg: raden byttes med «Lagrer …» og hopper når revalideringen kommer (~1,1 s) | Optimistisk: raden får sin nye tilstand med én gang; tekst-hoppet vises ikke | apple-design §1 «kill latency». 1,1 s med en tekstplassholder føles som venting |
| Ingen toast etter Angre kobling / Koble igjen | Toast med det motsatte valget («Koblet fra. Angre») | Arket K. Raden flytter seg, og uten tekst ser du ikke hva som skjedde |

### 4b. review-animations

Ingen animasjoner i området bryter reglene, fordi det nesten ikke finnes noen:
- **Ingen `transition-all`, `scale(0)` eller `ease-in`** i `start/*`, `import-actions.tsx`, `strength-log-panel.tsx` eller `integrations.tsx` (grep: bare `ACTION_TEXT` har `pressable`).
- **Funn:** manglende trykk-feedback (over) og hopp fra `<details>` / revalidering som en animasjon burde dempe. Det er tier 1, følelse.
- **Glede:** knyttes kun til første kjøring (sjelden). Imports/logg brukes ukentlig og trenger standard, ikke glede.
- **Redusert bevegelse:** alt som foreslås over må ha et bare-toning-svar, slik `motion-*`-verktøyene allerede har.

### 4c. mobile-native

| Symptom | Status | Merknad |
|---|---|---|
| Hover som henger igjen | OK | `hover:` er gatet i hele appen (design-system §Motion) |
| Tap-flash, `touch-action`, `user-select` på kontroller | OK | Grunnlinjen i `tailwind.css` |
| Zoom på input | OK | `text-base` på feltene og 16 px på `SetInput`. Native `type=date` viser `mm/dd/yyyy` på en engelsk enhet; vurder tre felt eller en `ui/`-dato |
| Trykk føles tregt | **Funn** | Hjemmelagde knapper uten `:active` (4a). Native checkbokser har 20 px bokser, men `<label min-h-11>` gir 44 px treff |
| Trygge områder / tema-farge | OK | Rot-layouten; `/start` er uten tabulatorlinje (`app-tabs.ts:66`) |
| Tastatur på steg 1 | Krever telefon | API-nøkkelen limes inn i et passordfelt; ingen `autocapitalize="off"`/`spellcheck=false`. Bør testes med iOS-utklipp |
| Treffflate under fingeren på Angre / Tell i Annet i popover | Delvis | `min-h-11`, men teksten er 12 px med stiplet understrek. Lett å bomme på i en 288 px popover |
| Må verifiseres på maskinvare | — | Toast-stabelen over safe-area-toppen, `<details>`-trekanten i iOS Safari, datovelgeren |

### 4d. Kontrast og lesbarhet

- **Feiltekst 10 px rød:** under minimum for lesbar tekst.
- **I popoveren:** «Hentet fra importen …» er 11 px `muted-foreground`.
- **Styrkekortets `h3`:** 11 px `text-primary` med store bokstaver. Grønn tekst på kort i lys modus må måles (primary er laget for fyll og lenker).

## 5. break-ui-funn

Data ble satt inn gjennom de ekte grensesnittene (skjema eller DB-seed), ved 320 px og i mørk modus. Ingen horisontal scroll noe sted (`scrollWidth` = viewport).

| # | Alvor | Felt | Verdi | Hva skjer | Fiks |
|---|---|---|---|---|---|
| 1 | Broken | tittel på stemplet økt | plan laget i første kjøring | Steg 5 viser «Rolig økt · Løping», I dag viser «54 min» / «1 h 48 min» | Gi stemplet økt en norsk rollebasert tittel (`stamp.server.ts:468`, `session-title.ts:60` → `nbDurationLabel`) |
| 2 | Broken | «Last synced» | etter Sync now | Viser «Sat 23 May, 17:00», som er siste aktivitet og ikke siste synk; toasten sier samtidig «No new activities» | `sync.server.ts:120-125` lagrer `latestActivityAt` i `lastSyncedAt`. Skill ut `lastCheckedAt` eller endre teksten til «Siste aktivitet …» |
| 3 | Broken | timer | 0,5 t, 1 dag | «Langtur · Løping 6 min», «0,1 t til sammen» | Minste fornuftige mengde (f.eks. 1,5 t), eller ikke kall en økt på under 30 min for Langtur (`uker.tsx:312`) |
| 4 | Ugly | importtittel | ekstraøkt uten workout | «57 min 12 s run», med engelsk og sekunder | `deriveRecordingTitle` på norsk via labels: «Løping · 57 min» |
| 5 | Ugly | svar i «Hva var dette?» | to planlagte økter med samme tittel | To identiske «Det var Rolig 10 km» | Legg til tid eller volum når titlene kolliderer |
| 6 | Ugly | dager | alle sju | Sju økter, ingen hviledag, 3 t langtur dag 1 | Advar, eller la starter-mønsteret beholde én fridag |
| 7 | Ugly | `SECONDARY_ACTION` ved 320 px | «Jeg vil heller sette opp sesongen selv» | Brytes over to linjer i en `min-h-11`-knapp (OK); «Som planlagt» brytes til to linjer i styrkekortet | `text-balance` / kortere etikett («Sett opp selv») |
| 8 | Ugly | tom historikk | ingen økter | Samme grunn ×4, og primærknappen «Det stemmer» bekrefter ingenting | Én linje «Vi fant ingen økter de siste fire ukene», primærknapp «Fortsett» |
| 9 | Fragile | deling | ugyldig fil | Lander på `/` uten beskjed (`imports.share-target.tsx:50-56`) | Toast med X importert / Y feilet |
| 10 | Fragile | hurtiglogg | feiltrykk på «Som planlagt» | Ingen angring fra I dag | Angre i toasten (sett-loggene tilbake) |
| 11 | Fragile | Gjort | trykket ved en feil | Raden blir ferdig; angring finnes bare via økt-siden | Angre i toasten |
| — | Held | lang løpsnavn (110 tegn), 25 t, 320 px | — | Brytes riktig, ingen overflyt (`break-big-plan`) | — |

**Beslutninger for eieren:** «ekstra» og «uten tall» synlig på raden eller bare i popoveren (ADR 0086 sa popover). Jeg anbefaler synlig. Ett lite merke koster ingen ekstra linje, og story 79/82 ber om at det *vises*.

## 6. Engelsk tekst på norske flater

| Streng | Fil:linje |
|---|---|
| `Upload Activity` (tittel + header), `No file uploaded.`, `This activity has already been imported.`, `Activity files (.fit, …)`, `Drop one or many files here — or a whole ZIP, including your Strava bulk-export archive.`, `How to request your Strava export`, `Discipline (override auto-detection, single file only)`, `Auto-detect`, `Upload`, `imported · duplicate(s) · failed`, `See them on your training log`; parserfeil som `Not a valid GPX file` | `imports.upload.tsx:29,60,93,148,163,194-202,210,214-217,228,114-118,132`; ingest-meldinger |
| `Integrations`, `Where your activities come from. Connected sources import automatically.`, `Connected`/`Available`/`Coming soon`, `Needs re-authorization`, `Importing history`, `Last synced … syncs automatically once a day — use Sync now for anything sooner.`, `Sync now`/`Syncing…`, `Reconnect`, `Disconnect`, `Disconnect Intervals.icu?` + brødtekst, `Keep connected`, `Connect Intervals.icu`, `Copy your personal API key …`, `API key`, `Connect`/`Connecting…`, `Cancel`, `Upload activity`, `Connect flow coming soon`, dual-source-notisen, alle Strava-strenger | `settings/integrations.tsx:45,138,143-185,203-205,256-282,309-375,410-437,449-456,523-553,576-592,617-646` |
| Taglines for leverandører (`Activities import automatically …`, `FIT, TCX, or GPX files. Always available.`, `Free import with your personal API key …`, Garmin/Suunto) | `app/integrations/directory.ts` |
| Connect-feil og toast: `Paste your Intervals.icu API key …`, `Intervals.icu rejected this API key …`, `Could not reach …`, `Connected to Intervals.icu` | `integrations.intervalsicu.connect.tsx:16-26,54-55` |
| Sync-toaster: `Sync failed`, `Intervals.icu rejected the stored API key …`, `No new activities to import.`, `Imported N new activities.`, `Synced with Intervals.icu`, `Saved N new … to your training log.`, `Synced`, `Could not sync …`, `Strava unavailable` | `integrations.intervalsicu.sync.tsx:96-115`, `integrations.sync.tsx:168-205`, `integrations.strava.connect.tsx:13-14`, `integrations.strava.sync.tsx` |
| Frakobling: `Disconnected from Strava/Intervals.icu`, `Your imported activities stay …` | `settings/integrations.tsx:90-104` |
| Tittel på ekstraøkt: `57 min 12 s run` | `session-title.ts:131-142` (`deriveRecordingTitle`, `formatDuration`) |
| Stemplede økttitler: `1 h 48 min`, `1 h` | `stamp.server.ts:468` → `session-title.ts:60` |
| Øvelsesnavn i hurtigloggen: `Back Squat`, `Bench Press` (katalogdata) | `strength-quick-log.server.ts` (navn fra `Exercise.name`) |
| `reps` i aria-label på set-input | `labels.ts` `QUICK_LOG_LABELS.setInput` (grensetilfelle; «repetisjoner») |
| StatusButton sr-titler `loading`, `success`, `error` (lest opp som «Koble til error») | `components/ui/status-button.tsx:37,45,55` |
| Steg 1 (skip-veien) ved sign-up: e-posten `Welcome to Trainm8!` og hele signup/onboarding | `_auth/*` (marketing/auth er bevisst engelsk, men det er inngangen til første kjøring; owner?) |
| `Settings → Developer Settings` i hjelpeteksten | `labels.ts` `connect.keyHelp` (intervals.icu sin egen meny, kan stå) |

## 7. Ytelse (produksjonsbuild, 390×844, ingen CPU-struping)

| Måling | Verdi |
|---|---|
| CLS på /start/funn når importen er ferdig (polling hvert 3. s) | **0,132**, fra bannerbytte og radbytte |
| CLS på andre steg | 0 |
| Lange oppgaver per steg | 55–107 ms (hydrering). Én oppgave på 235 ms ved landing på I dag. Én på **653 ms** ved I dag-innlasting i mørk modus med 16 økter i uka (hjemmeområdet) |
| «Start planen» → I dag | 1,1–1,5 s |
| Svar «Det var …» → raden er oppdatert | 1,1 s |
| «Som planlagt» → panelet borte | 1,2 s |
| Sync now (mock) | ca. 3,2 s, med full navigering |
| Styrkepanelet | Henter planen i en egen `fetcher.load` etter montering, så «Henter planen …» står før linjene: ekstra runde og layouthopp (`strength-log-panel.tsx:57-65`). Kan lastes med I dag-loaderen |

## 8. Prioritert fiksliste

| # | Hva | Filer | Innsats | Eierbeslutning? |
|---|---|---|---|---|
| 1 | Stemplede økttitler på norsk, og de samme som forhåndsvisningen («Rolig økt», «Langtur») | `stamp.server.ts`, `session-title.ts`, `labels.ts`, `uker.tsx` | M | Nei |
| 2 | «Timer i uka»: forhåndsutfylt dagens volum mot tak. Start planen nær dagens volum, eller spør om både «nå» og «maks» | `draft.ts`, `sporsmal.tsx`, `labels.ts` | M | **Ja** |
| 3 | Første kjøring inn i designsystemet: `Button`/`buttonVariants`, `ToggleGroup`-dager, `Collapsible`, typetrinn, tilbake-chevron | `start/*.tsx`, `__first-run-*.tsx` | M | Nei |
| 4 | `ErrorList`/`Field` feiltekst 10 → 13 px; StatusButton uten ✕ i knappen og med norske sr-titler | `components/forms.tsx`, `ui/status-button.tsx` | S | Nei (rører hele appen) |
| 5 | Integrasjonssiden, opplasting og connect/sync-ruter på norsk via `labels.ts`; skjul Strava eller merk den «betalt/kommer» | `settings/integrations.tsx`, `imports.upload.tsx`, `integrations.*.tsx`, `directory.ts`, `labels.ts` | M | **Ja** (Strava) |
| 6 | Vis «ekstra» og «uten tall · kommer fra importen» som et lite merke på raden; norsk tittel på ekstraøkt; ikke vis glyfen ◌ på ekstra | `stream.tsx`, `import-link.ts`, `session-title.ts` | S | **Ja** (ADR 0086 la det i popover) |
| 7 | «Last synced» → riktig tidspunkt | `intervalsicu/sync.server.ts`, `strava/sync.server.ts`, `settings/integrations.tsx` | S | Nei |
| 8 | Styrkekortet og «Hva var dette?»-kortet på `Button`/`Input`, luma-radius, `TITLE_INSET`; kilo med komma | `strength-log-panel.tsx`, `import-actions.tsx`, `strength-log.ts` (`formatKg`) | S | Nei |
| 9 | Angre i toast for Som planlagt / Gjort / Angre kobling | `resources/strength-log.tsx`, `resources/session-done.tsx`, `resources/import-link.tsx`, `strength-log-panel.tsx`, `import-actions.tsx` | M | Nei |
| 10 | CLS på funn: reserver plass for banneret, stagger-inn | `funn.tsx` | S | Nei |
| 11 | Steg 2 uten funn: én linje og «Fortsett»; ikke forhåndsvelg idrett som funn; slå sammen «Noe er feil» med steg 3 | `funn.tsx`, `labels.ts` | S | Ja (dobbeltskjemaet) |
| 12 | Filosofibytte som synes: vis første kvalitetsøkt eller ukeform per filosofi; si at Grunntrening ikke har harde økter | `plan.tsx`, `uker.tsx`, `draft.ts` | M | Ja |
| 13 | Landing etter første kjøring: ingen toast over topplinja, rull til første planlagte uke, kvitteringslinje; «hard uke» → nøytralt ord den første uka | `uker.tsx`, `_home/index.tsx`, `week-words.ts` | M | Nei |
| 14 | Sesongkurve på steg 4 (Arket J4) gjenbrukt fra I dag-stripen | `plan.tsx`, `strip.ts`/`season-pane.tsx` | M | Nei |
| 15 | Delingsmottaker gir toast med resultat | `imports.share-target.tsx` | S | Nei |
| 16 | Små verdier: grense på timer, ingen «Langtur» under 30 min, advarsel ved 7 dager | `first-run-schema.ts`, `uker.tsx`, `draft.ts` | S | Ja |
| 17 | Overganger og glede i første kjøring (View Transitions, stagger, kurve, `scaleX`-fremdrift) | `start/*`, `tailwind.css` | M | Nei |

### Foreslått PR-oppdeling (parallelle spor uten felles filer)

- **PR A, første kjøring UI:** #3, #10, #11, #13 (bare `uker.tsx`-delen), #14, #17.
  - Filer: `app/routes/start/*`, `labels.ts` (FIRST_RUN-blokken).
- **PR B, plan og stempel:** #1, #2, #12, #16.
  - Filer: `stamp.server.ts`, `session-title.ts`, `first-run/draft.ts`, `first-run-schema.ts`.
  - Rører `uker.tsx` lett for titlene, så koordiner med A eller kjør etter A.
- **PR C, integrasjoner og opplasting:** #5, #7, #15.
  - Filer: `settings/integrations.tsx`, `imports.*`, `integrations.*`, `directory.ts`, sync-serverne.
  - Uavhengig av A og B.
- **PR D, import- og styrkeflater på I dag:** #6, #8, #9.
  - Filer: `import-actions.tsx`, `strength-log-panel.tsx`, `import-link.ts`, resource-ruter, `stream.tsx` (rader).
  - Kolliderer med hjemmeområdets PR i `stream.tsx`, så avtal rekkefølge med den.
- **PR E, felles primitiver:** #4.
  - Filer: `forms.tsx`, `status-button.tsx`.
  - Liten, og bør gå først, ettersom A, C og D arver den.

`labels.ts` deles av A, B, C og D, men i separate blokker (FIRST_RUN_*, IMPORT_LINK_*/MARK_DONE_*/QUICK_LOG_*, nye INTEGRATION_*). Konflikter løses greit med rebase.
