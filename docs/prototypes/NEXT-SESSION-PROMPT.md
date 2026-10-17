Bygg **Levende start** i trainm8 (`leskraas/trainm8`). Spesifikasjonen er issue #558, og den er delt opp i 25 tickets (#559–#583), som alle er underissues til #558 med `ready-for-agent`. Det hver ticket blokkeres av, står i dens «Blocked by»-seksjon.

## Kontekst
- Les #558 i sin helhet først, og deretter ticketen du jobber med.
- Prototypene ligger på grenen `prototype/enkel-start` under `docs/prototypes/`. Den valgte retningen er `variant-e-levende.prototype.html`, som bygger på `enkel-start.prototype.html` (variant A), pluss Juster-knappene fra `variant-f-en-tommel.prototype.html`. `TICKETS-PUBLISHED.md` har oversikten over tickets og avhengigheter. Prototypene er kun referanse for utseende og flyt. Reglene som bygger uker i dem, er en skisse. Bruk appens ekte planmotor (presets, Plan Outline, Week Pattern, Quality Session Mix, stamp).
- Les CLAUDE.md, GLOSSARY.md, `docs/agents/*.md`, ADR-ene som #558 viser til, `docs/design/design-system.md` og `docs/design/ui-conventions.md`. Alle UI-ord er norske og ligger i `labels.ts`.
- Ingenting seedes i produksjon (`docs/agents/production-seed-data.md`).

## Rekkefølge
Start med frontlinjen: **#559, #560, #561, #562, #563, #564**. Ta deretter neste ticket der alle blokkere er lukket. Én ticket blir én branch og én PR, som lenker ticketen og #558.

## Arbeidsform
- Bruk subagenter mye, og spar hovedkonteksten. La subagenter utforske, implementere og gå gjennom koden, og la dem rapportere kort tilbake. Uavhengige tickets på frontlinjen kan kjøres parallelt i egne worktrees (`isolation: "worktree"`).
- Hovedsesjonen koordinerer: den velger ticket, gir oppdrag, sjekker resultatet, åpner PR og følger CI til den er grønn.

## Skills: bruk disse (krav fra CLAUDE.md)
**Prosess for hver ticket**
- `implement`: følg den for hver ticket.
- `tdd`: skriv testen først. Testflatene står i #558 (Testing Decisions): den rene first-run-utkastet (forbilde: `draft.test.ts` over alle presetfamilier), planskriveren (forbilde: `plan.server.test.ts`), autopilot gjennom ukeskiftet med injisert klokke (forbilde: `week-change.server.test.ts`), og rutetester for oppstart, Juster og I dag. E2E-tester bare for bevegelse.
- `domain-modeling`: for ADR-er og GLOSSARY (særlig #559, #567 og #574).
- `codebase-design`: for forarbeidet (#560, #561, #564). Lag dype moduler, med så få testflater som mulig.
- `verify`: kjør appen og sjekk endringen i den, med Playwright på 390×844 og på desktop.
- `code-review`: kjør den før hver PR (standarder og spesifikasjon).
- `pr`: bruk den til PR-teksten.

**UI og bevegelse (alle UI-tickets)**
- Les `emil-design-eng` og `apple-design` før du designer.
- Les `animate` før du legger til bevegelse (særlig #563, #566, #570 og #582).
- Bruk `mobile-native` for alt en tommel rører.
- Før en UI-ticket er ferdig: kjør `review-animations` (Before/After/Why-tabell og dom, og rett hver Block), kjør sjekklisten i `mobile-native`, og kjør `break-ui` med data for verste tilfelle. Skriv i PR-en hva som fortsatt må prøves på en ekte telefon.
- `pick-ui-library` avgjør valg av bibliotek. Bruk `icon-workflow` for ikoner og `ask-sonner` for varsler med Angre.

## Ferdig betyr
Akseptansekriteriene i ticketen er oppfylt. Testene er grønne, og typecheck og lint er rene. Endringen er verifisert i appen. UI-skillene over er kjørt. PR-en er grønn i CI, og ticketen er krysset av. Si fra hvis noe i en ticket strider mot en ADR som ikke er endret ennå.
