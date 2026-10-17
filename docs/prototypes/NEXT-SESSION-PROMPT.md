/bredvid-engineering:implement-spec Levende start: spesifikasjonen er #558 i leskraas/trainm8, og ticketene er underissues #559–#583. Avhengighetene står i hver tickets «Blocked by»-seksjon (GitHub har ingen egen blocked-by-kobling). Frontlinjen ved start er #559, #560, #561, #562, #563 og #564.

## Parallelt arbeid
- Hold hovedkonteksten liten. Hovedsesjonen koordinerer bare: den leser grafen, starter agenter, fletter inn og flytter frontlinjen.
- Start én implementer-subagent i bakgrunnen per ticket på frontlinjen, alle samtidig, hver i sin egen worktree (`isolation: "worktree"`) på egen branch fra integrasjonsbranchen. Når en ticket er flettet inn og nye tickets blir frie, starter du dem straks.
- Integrasjonsbranch: `feature/levende-start`, laget fra `main`. Åpne en draft-PR etter første innfletting, og merk den som lukkende for #558 og alle ticketene.
- Kommuniser med kontekstpekere (issuenummer, commits, notatfiler), ikke ved å kopiere tekst. Agentene svarer kort.
- Utforskningsnotater lagres utenfor repoet, i scratchpad, slik at alle implementer-agenter kan lese dem.
- Tickets som berører de samme filene (for eksempel #566 med #571–#574, og `labels.ts`), flettes inn én om gangen av merger-agenten. Ved konflikt bruker den skillen `resolving-merge-conflicts`.

## Kontekst hver agent skal lese
- Ticketen, #558 og CLAUDE.md, GLOSSARY.md, `docs/agents/*.md`, ADR-ene ticketen nevner, `docs/design/design-system.md` og `docs/design/ui-conventions.md`. Alle UI-ord er norske og ligger i `labels.ts`. Ingenting seedes i produksjon.
- Prototypene ligger på grenen `prototype/enkel-start` under `docs/prototypes/`. Retningen er `variant-e-levende.prototype.html` (bygget på `enkel-start.prototype.html`), pluss Juster-knappene fra `variant-f-en-tommel.prototype.html`. Prototypene er bare referanse for utseende og flyt. Reglene som bygger uker i dem, er en skisse. Bruk appens ekte planmotor.

## Skills hver implementer-agent skal bruke
Står en skill ikke som tilgjengelig, leser agenten `.claude/skills/<navn>/SKILL.md` direkte.
- **Alltid:** `tdd` (krav i implement-spec), på testflatene i #558 (Testing Decisions), og `verify` for å sjekke endringen i den kjørende appen.
- **ADR og ordliste** (#559, #567, #574): `domain-modeling`.
- **Forarbeid** (#560, #561, #564): `codebase-design`.
- **UI og bevegelse** (alle UI-tickets, krav fra CLAUDE.md): les `emil-design-eng` og `apple-design` før du designer, `animate` før du legger til bevegelse, og bruk `mobile-native` for alt en tommel rører. Før ticketen er ferdig: kjør `review-animations` (rett hver Block), sjekklisten i `mobile-native` og `break-ui` med data for verste tilfelle. Skriv i ticketen hva som må prøves på en ekte telefon. Bruk `pick-ui-library` for bibliotekvalg, `icon-workflow` for ikoner og `ask-sonner` for varsler med Angre.

## Til slutt
- Når alle tickets er flettet inn, kjører du `code-review` på integrasjonsbranchen og lar én implementer-agent rette alle funn.
- Skriv PR-teksten med `pr`, merk draft-PR-en som klar for review, følg CI til den er grønn og rydd opp worktrees.
- Si fra hvis noe i en ticket strider mot en ADR som ikke er endret ennå. #559 endrer ADR-ene og må derfor flettes inn før ticketene som er avhengige av den.
