# Audit: creating a session ("lage økt / legge inn økt"), round 2

Branch audited: `main` at 326fc7f (prod build on :3606, 390×844 touch and 1280×860, light; prototype also in dark).
Prototype: branch `claude/prototype-session-composer` (commit 91bf6b5, pushed, no PR). Route
`/training/compose/prototype?variant=A|B|C|D`. It only exists in development (`npm run dev`; the loader 404s
outside `NODE_ENV=development`) and needs a login (kody / kodylovesyou). Nothing is written to the database.

Screenshots: `scratchpad/shots/r2-create-*.png` (the app and Arket) and `scratchpad/shots/r2-proto-*.png` (the prototype; `-dark` suffix for dark).

---

## 1. Kort oppsummering

1. There are **eleven ways** to put a session on a day. They use **five different surfaces**: the row draft, the header panel, the day pane, the full editor page and the catalogue place page. Two more live in Sesong (copy week and stamp pattern). Each has its own words, its own day picker, its own save button and its own undo, or none.
2. Only the three surfaces on **I dag** speak Norwegian, show the live parse and show the week sum before and after (#505 stories 35–39). The full editor, the catalogue place page, copy week and stamp pattern are English. They show **no week sum**, and they redirect without the story-39 message or any undo.
3. **Strength leaves I dag.** "Navngi løftene" and "Mer" both open the same English `/training/sessions/new`. **Annet cannot be created at all**: it can only be chosen on a done row. **A past session older than 6 days cannot be logged without an import**: it stays "ikke gjort".
4. Of Arket's four fill sources (`Skriv økt · Fra biblioteket · Kopier en økt · La appen fylle`), **only Skriv exists on a day**. The library is a separate page, copy is week-level only and hidden in Sesong, and "La appen fylle" does not exist.
5. Recommendation: **one `SessionComposer`**, the same content in the same container from every entry point. On a phone that is a Base UI Drawer with a compact snap point (the quick line) and a full snap point ("Gjør grundigere"). On a large screen it is the day pane, or a Sheet between `lg` and `xl`. It has one day strip, one sport row with Styrke and Annet, the four sources, the live parse, the week sum, and **one undo rule**. The prototype measured this (variant D, with C's tokens) as the best overall.

---

## 2. Journey map

The `week sum` column means what the athlete is told about the week before and after the write (#505 stories 37 and 39).

| # | Entry point | Steps / taps (phone) | Surfaces / components | Words | Lands where | Undo | Week-sum feedback | Broken / inconsistent |
|---|---|---|---|---|---|---|---|---|
| 1 | I dag top line "+" → **Skriv en økt** | + → menu → Skriv en økt → (date) → chip → type → Legg til «…» (4 taps + typing) | `CreateMenu` (DropdownMenu) → `WritingPanel` in the header (`home-timeline.tsx:366`) | "Lag ny", "Skriv en økt", "Dag", "Legg til «…»", "Lukk" | The panel closes; the row arrives silently wherever it is (not scrolled to, not highlighted) | **Toast** Angre, 10 s (`day-stamp-context.tsx:177`) | Preview ✓ (`Løping denne uka: 0 km, +1 uten km — målet står på 73,8`); toast ✓ | The panel pushes the strip and list down (no motion, layout jump). Native `<input type=date>` (shows `10/11/2026` in en-US Chromium). No Styrke and no Annet. On a phone the toast at top-center covers the top line. ![](shots/r2-create-390-panel-typed.png) |
| 2 | "+" → **Ny økt** | + → Ny økt → page → Title, Discipline, Intent, Date, Time, seed or scratch → Create Session (≥ 8 taps + typing) | `/training/sessions/new` (`sessions.new.tsx`): Card, `Field`, `SelectField`, `WorkoutStructureEditor`, `__empty-state` seeds | **English**: "New Workout Session", "Title", "Discipline", "Intent", "Create Session", "Easy session", "or start from scratch" | Redirect to `/training/sessions/$id` | **None** (the detail page's "Delete this session?" dialog) | **None** | It leaves I dag. Two menu items do the same act ("Skriv en økt" and "Ny økt"). "Create Session" sits under the fixed tab bar at 390. ![](shots/r2-create-390-new.png) |
| 3 | "+" → Nytt løp / Ny plan | – | events.new, plan.new | – | – | – | – | Not sessions. They share a menu with session creation, which makes the menu a router rather than a composer. |
| 4 | Free day **"+"** (fri row) → stamp | + → "Legg til 45 min Z2" (**2 taps**) | `EmptyDay` → `StampDraft` (`day-stamp-cell.tsx:78`), hand-rolled chips and buttons | "Det du trener mest — trykk på en annen for å bytte.", "Legg til 45 min Z2", "Mer", "Avbryt" | The row opens as an editable Token Sentence with Angre / Mer / Ferdig | **Row** Angre (ADR 0076) and a toast with **no** Angre | Toast only (`Løping uke 43: 0 km, +1 uten km…`). No preview before the stamp. | Works and is fast. Controls are 30–34 px (`day-stamp-cell.tsx:174,196,373,387`). The stamped sentence shows "+ block" and "rest" in English, and the token popover title "REPEAT COUNT". ![](shots/r2-create-390-stamped-open.png) |
| 5 | Free day "+" → **type in the draft** | + → type → Legg til «…» (2 taps + typing) | `StampDraft` + `WritingLine` + `WriteButton` | "Skriv økta" (aria), placeholder, "Forstått", "Til sammen", "Løping neste uke: 0 → 6 km, målet står på 36,9" | The row opens (as in 4) | Row Angre | Preview ✓; toast ✓ | **The best path today.** Only free days have "+"; a day that already has a session has no way in from its row. ![](shots/r2-create-390-draft-typed.png) |
| 6 | Free day "+" → **Styrke** | + → Styrke → "Navngi løftene" → English full editor (≥ 20 interactions; see §9) | `StampDraft` → Link → `/training/sessions/new?date&discipline=strength` | "Navngi løftene", "Mer", "En styrkeøkt sier hvilke løft — mer enn linja har plass til." | Full page, then the detail page | None | None | Two buttons side by side go to the **same URL** (`day-stamp-cell.tsx:184` and `:194`). Strength takes a different road. ![](shots/r2-create-390-draft-strength.png) |
| 7 | Large screen (xl): **day pane "Skriv økt her"** | pick a day → Skriv økt her → type → Legg til | `DayPane` → `WritingPanel initialDayKey` (`day-pane.tsx:182`) | "Skriv økt her", then the panel's "Skriv en økt" and "Dag" | The panel closes; toast | Toast Angre | Preview ✓, toast ✓ | It shows a date field even though the day is already chosen. "Skriv økt her" and "Skriv en økt" are two names for one act. ![](shots/r2-create-1280-daypane-write.png) |
| 8 | Large screen: **click a free row** | click → inline draft **and** the pane selects the day | `StampDraft` in the list + `DayPane` beside it | both sets of words | – | – | – | **Two composers for the same day are open on screen at once** (list draft and pane button). ![](shots/r2-create-1280-free-click.png) |
| 9 | **Catalogue → place** | Bibliotek → Katalog → card → "Add to my calendar" page → date → Add (≥ 5 taps) | `catalogue.place.$workoutId.tsx`: PageHeader, `Input type=date`, Button | **English**: "Add to my calendar", "Which day?", "Scheduled at your default training time.", "Cancel", "You get your own copy…" | Redirect to the session detail | None | None | Arket Q's "+ legg på tor 17." from the day is missing, and so are the reasons when a day can't be filled. ![](shots/r2-create-390-catalogue-place.png) |
| 10 | **Programs** | Bibliotek → program → start → run | `programs.$programId.start`, `programs.run.$instanceId` → `openNextProgramSession` | English page titles ("Start …") | `/training/sessions/$id/log` (today, opened on run) | – | – | A program session is created when it is run, not placed on a day. Acceptable (ADR 0056), but invisible in the composer. |
| 11 | **Copy week** | Sesong → plan → Weeks tab → Disclosure "Copy a week you liked" → selects → Copy → confirm | `__copy-week.tsx` (Card, Select) | **English** ("Copy a week you liked", "Nothing in that week would be replaced.") | The plan page | None | None (the weeks table moves) | Not on I dag. There is no "Kopier en økt" for a single day. |
| 12 | **Stamp a week pattern** (plan.stamp) | Sesong → plan → "Put it on your calendar" → pattern → weeks → Stamp | `__stamp-pattern.tsx` | **English** ("Pattern", "Weeks", "That week already has sessions") | The plan page | None | None | Owned by the Sesong area; only its feedback and undo belong to this journey. |
| 13 | **La appen fylle** | – | – | – | – | – | – | **Missing.** The app fills only through plan generation and Ukeskiftet proposals. |
| 14 | **Annet** session | Only after the fact: done row → glyph → "Tell i Annet" | Popover on the ownership glyph | "Tell i Annet" | – | "Tell i sporet" | ✓ (`annetChange`) | **No way to write "25 min sykkel til jobb" as Annet.** A bike stamp counts in the bike track until the session is done. Arket P has an Annet chip in the write row ("→ teller ikke i Løp eller Styrke"). |
| 15 | **Past session, no import** | Free past day "+" → stamp or write → "Gjort" | Same draft; `markDone` (`import-link.ts:109`) | "Gjort · uten tall, ingen import er koblet til" | Planned, then done | Row Angre | ✓ | `MARK_DONE_REACH_DAYS = 6` (`import-fit.ts:12`): older than 6 days, a written session stays **"ikke gjort"** forever. The composer cannot say "this was done". |
| 16 | **Inline edit** on `/training/sessions/$id` | tap a token → popover → value (autosave) | `ScheduledWorkoutSentence`, token popover, `__block-editor-sheet`, `__intensity-popover` | Mixed ("Repeat count", "rest", "+ block") | Same page | None (the edit is saved) | Toast when the sum moved ✓ (ADR 0082 S11) | Editing, not creating, but this is the "deep" editor the composer should step up into. |

---

## 3. The incoherences, named

| Kind | Concretely | Evidence |
|---|---|---|
| **Different components for the same act** | The day is chosen four ways: the tapped row (draft), a native `<input type=date>` (panel, `writing-line.tsx:380`), Conform `Field type=date` + time (full editor), and `Input type=date` (catalogue). The discipline is chosen three ways: hand-rolled radio chips (`writing-line.tsx:274`), `SelectField` (editor), and none (catalogue). The save is a hand-rolled `<button>` (`writing-line.tsx:461`, `day-stamp-cell.tsx:170`), `Button` (pane, catalogue) or a form submit (editor). | shots 390-panel-typed, 390-new, 390-catalogue-place |
| **Different words for the same thing** | Opening: "Skriv en økt" / "Skriv økt her" / "Ny økt" / "Legg inn en økt" (aria) / "Add to my calendar" / "Put it on your calendar". Committing: "Legg til" / "Legg til «…»" / "Create Session" / "Add to my calendar" / "Copy". Leaving: "Avbryt" / "Lukk" / "Ferdig" / "Cancel". Going deeper: "Mer" / "Navngi løftene". | `labels.ts:1608-1690`, `sessions.new.tsx:193,284`, `catalogue.place.$workoutId.tsx:111,163` |
| **Dead ends** | Strength goes to an English page and never comes back to I dag. A day with a session has no "+" on its row. A past day beyond 6 days can't be marked done. Annet can't be written. | `day-stamp-cell.tsx:184`, `stream.tsx:1001`, `import-fit.ts:12` |
| **Missing feedback** | No week sum and no story-39 message after the full editor, catalogue place, copy week or stamp pattern. A "+ Ny" write lands silently: no scroll, no highlight, only the toast. The stamp gives no preview before it commits ("+1 uten km" only afterwards). | `sessions.new.tsx:148`, `catalogue.place.$workoutId.tsx:93` |
| **Two undo models** | Row Angre for the draft (ADR 0076, which **rejected a toast by name**) and toast Angre for the panel and pane (ADR 0086, which never amended 0076). Nothing at all for the four other paths. | ADR 0076 "Alternatives considered", `day-stamp-context.tsx:169-185` |
| **Modes that don't connect** | The draft's sentence cannot be carried into the full editor: "Mer" opens an empty page, and the typed text is lost. The panel cannot become the draft. The day pane opens the header panel's component with a redundant date. At xl, the inline draft and the pane both open. | `day-stamp-cell.tsx:61-68` (`fullEditorTo` passes date and discipline only) |
| **Writing that can't reach a day** | The row draft only exists on free days in the mounted list. A day with sessions or a collapsed far week needs "+ Ny" plus a date typed into a native picker. | ADR 0082 S11 |
| **Strength and Annet take a different road** | `CARDIO_DISCIPLINES` only in the panel (`writing-line.tsx:399`). No Annet chip anywhere. | – |
| **Language mismatch inside one surface** | The athlete types Norwegian (`p 90 s`, `terskel`) and "Forstått" answers in the ADR 0027 A3 English glue (`( 1 min 30 s rest )`, `+ block`, `REPEAT COUNT`). | shot 390-stamped-token-popover |

---

## 4. Spec table

| Story / ADR | Verdict | Evidence | Note |
|---|---|---|---|
| #505 35: write a session as a sentence | Partial | `writing-line.tsx:77`, `day-stamp-cell.tsx:148` | On I dag only. Cardio only. The full editor has no line. |
| 36: see what was understood | Partial | `writing-line.tsx:171-185` | Steps and totals are shown. The glue words are English ("rest"). Pace is shown only when typed. |
| 37: week sum before → after against the target | Partial | `writing-line.tsx:112-123` | Built in the line. Missing on the full editor, catalogue, copy and stamp, and before a bare stamp. |
| 38: suggestions for unknown words | Built | `writing-line.tsx:195-235` | Good (`rolgi` → `rolig`). |
| 39: message after each change, target unchanged | Partial | `_home/index.tsx:261-399`, `withWeekSumToast` | Every I dag write ✓. The editor, place, copy and stamp redirect silently. |
| 40: any distance ahead | Built | `home-timeline.tsx:229-233` | Through the panel's native date picker only. |
| 41: 16 px input | Built | `writing-line.tsx:159` | Date input 16 px ✓. The chips' 11.5 px text is fine (not inputs). |
| 29/55: ownership | Partial | `stream.tsx` glyph, `day-pane.tsx:303` | Rows show ✎. Creation surfaces never say whose the result is. The catalogue says "You get your own copy" in English. |
| 58: library in Bibliotek | Partial | `library.tsx:94` | Browsing ✓. Placing from a day ✗ (Arket Q). |
| 83–84: strength log | Built (log) / Deviates (create) | `strength-log-panel.tsx` | Logging is one tap. Creating a lift session leaves I dag. |
| ADR 0027 + #505 S11 amendment | Built | `workout-sentence.ts:670` | The reader is strict and the server re-reads ✓. A3 (English glue) now conflicts with the Norwegian line. Needs an amendment. |
| ADR 0065 §4–§6 | Built | `stream.tsx:1001`, `_home/index.tsx:244` | §6 (past day) ✓, but authoring ≠ recording leaves story 82 short beyond 6 days. The `day-stamp-cell.tsx` header still says "Nothing is parsed" (lines 18-23 partly fixed). |
| ADR 0076 (undo on the row) | Deviates | `day-stamp-context.tsx:169-185` | The toast Angre it rejected is now shipped for two paths; 0076 is not amended. |
| ADR 0082 S11 | Built | `writing-line.tsx:325` | As described. |
| ADR 0086 ("+ Ny" writes undo from the toast; no last day) | Built | `day-stamp-context.tsx:177` | – |
| ADR 0087 ("Skriv økt her") | Built, duplicated | `day-pane.tsx:182` | At xl, the inline draft opens beside it. |
| ADR 0085 (design system) | Deviates | `writing-line.tsx:159,223,271,465`; `day-stamp-cell.tsx:170-205,369-389` | Hand-rolled buttons, chips and inputs at `rounded-[9px]`/`[10px]` and `h-[30px]`/`[34px]` instead of `Button`, `ToggleGroup`/`SegmentedControl` and `Input`. |
| Arket FILL_SOURCES (data.js:181) | Missing | – | Only "Skriv". |

---

## 5. Design deviations vs Arket and the design system

| Arket says | App does | Should be |
|---|---|---|
| P, I, L, E: "+" on fri → **2×2 fill menu** (Skriv / Fra biblioteket / Kopier / La appen fylle) with glyphs ✎ ▤ ⧉ ◌ | "+" → sport chips + writing line + stamp | The four sources inside the one composer (the sources tab in prototype D) |
| P: the write row has a **Spor segment including Annet**, with a live "→ 6 km på Løp" | Chips without Annet. Strength is cut off. | Sport row: Løp · Sykkel · Svøm · Styrke · Annet |
| Q: library in the day pane, "**+ legg på fre 18.**", with reasons when a day can't be filled ("Dagen er passert…", "Utenfor horisonten…") | Separate English page | The library list inside the composer; "Legg på {dag}"; a disabled row with the reason |
| N: multi-step undo, "Angret · n steg igjen", Ctrl+Z | One undo per write; nothing for copy | One undo rule (§7). Multi-step only on large screens (owner call). |
| Source glyphs in the row and the toast | ✎ only | Keep ✎ ▤ ⧉ ◌ for the source; the ownership popover explains it |
| Design system | Hand-rolled controls (above); native date input; toast on top-center on a phone | `Button size=default` (h-11), `SegmentedControl`, `Drawer`, a day strip built from `ToggleGroup`, toasts at bottom on phones (above the tab bar) |

---

## 6. Håndverk (Emil format), current app

| Before | After | Why |
|---|---|---|
| Draft and stamped-row controls `h-[30px]`/`h-[34px]` (`day-stamp-cell.tsx:174,196,373,387`, `writing-line.tsx:271,427,465`) | `Button` default (h-11), chips h-9 with `after:` hit area | 44 px floor (ADR 0028); the shared primitive already has it |
| `WritingPanel` appears in the header with no transition and pushes the strip down | The composer opens in a Drawer (`--ease-drawer`, 450 ms, Base UI) | Prevents a jarring change; the list under the finger doesn't move |
| A "+ Ny" write lands with no trace in the list | The new row rises 4 px + fades (200 ms `ease-out`, `@starting-style`), and the list scrolls to it if it is in view | State indication and spatial consistency: the athlete sees where it went |
| Native `<input type=date>` (`writing-line.tsx:380`) | A day strip (7 days, swipeable by week) plus "Annen dag…" for far dates | One day picker everywhere; no locale-dependent `10/11/2026` |
| Single-line `<input>` for a 150-character session (start scrolled out of view; shot r2-proto-A-long) | `<textarea rows=1>` with `field-sizing: content`, `enterkeyhint="done"`, Enter submits | break-ui: long sentences must stay readable while typing |
| Toast at `top-center` on a phone covers the top line and "+" | `position="bottom-center"` above the tab bar on `(pointer: coarse)` | Spatial: it leaves the way the Drawer left (down); thumb reach for Angre |
| "Forstått" re-renders the stanza on every keystroke (no animation, correct) | Keep: no animation on keyboard-driven updates | Keyboard-initiated: never animate (Emil frequency table) |
| `StampDraft` `growIn` animates `height` | Keep (sanctioned, ADR 0065 #502), or retire with the Drawer | It moves real layout; 200 ms collapse token |
| Token popover title "REPEAT COUNT", stanza "+ block", "rest" | Norwegian labels; glue words `p`/`pause` | ADR 0081; the line and its echo should speak one language |
| Draft buttons: `hover:bg-primary/85` with no hover gating | `@media (hover:hover)` (the `Button` primitive does this) | Sticky hover after a tap (mobile-native #1) |

## 7. break-ui findings

| Severity | Case | What breaks | Fix |
|---|---|---|---|
| High | Strength, Annet | No way through the line (§3) | Composer sport row + strength grammar (§11, PR 6/7) |
| High | Past day > 6 days | Written session stays "ikke gjort" | "Allerede gjort" toggle in the composer on past days (owner call) |
| Medium | 150+ character sentence | The single-line input hides the start; the stanza wraps fine | textarea that grows with its content |
| Medium | 10 intervals, `20x200 m` | Stanza fine; week sum "0 km, +1 uten km" for time-only sessions is honest | – |
| Medium | Unknown word | Suggestion chip ✓, "Legg til" disabled ✓; the reason sits under the chips (good) | – |
| Low | Empty input | Draft offers the stamp "Legg til 45 min Z2" (good); the panel shows a disabled "Legg til" with no hint | Show the hint in the panel too |
| Low | Day with two sessions | No "+" on the row | "+" on every day row (the row's own trailing "+" or a "legg til en til" line, as the prototype does) |

## 8. Engelsk tekst på norske flater (in this journey)

`sessions.new.tsx:31` "New Workout Session | Trainm8", `:193` "New Workout Session", `:203` "Title", `:206` "e.g. Tuesday Tempo Run", `:215` "Discipline", `:224` "Pick a discipline", `:231` "Intent", `:243` "Date", `:250` "Time", `:284` "Create Session", `:121` "Invalid date and time combination"; `__empty-state.tsx:36-38` "starts as 10 min", "starts as an exercise, 1 × 5", "starts as 1 min of recovery", plus the seed names "Easy session", "Intervals", "Strength session" and "or start from scratch"; `catalogue.place.$workoutId.tsx:39,111,163` "Add to my calendar", `:86-87` "Pick a day." / "That session is no longer in the Catalogue.", `:141` "Which day?", `:152` "Scheduled at your default training time.", `:165` "Cancel", `:171` "You get your own copy. Editing it never changes the Catalogue's."; `__token-sentence-editor.tsx:1597` "+ block", `:326` "rest"; `__block-editor-sheet.tsx:177,180` "Repeat count", "Repeat count set to …"; `sessions.$sessionId.tsx:676` "Delete this session?", `:727` "Session", `:2633` "Save Session Log"/"Update Session Log"; `plan.tsx:4187-4188,4202-4203` "Put it on your calendar…", "Copy a week you liked…"; `__copy-week.tsx:197,252`; `__stamp-pattern.tsx:169,178,195,267-268,295,344`.

## 9. Ytelse

Not measured in depth this round. Observed: the stamp and the write land in ~0.6–1 s (action + revalidate of home's whole ledger); the panel's week-sum fetch fires once per day change. The prototype's keystroke parse is synchronous and showed no visible lag at 4 parts × 10 intervals.

---

## 10. Prototype: four ways to compose (the owner's direction)

**How to reach it:** `git checkout claude/prototype-session-composer && npm run dev`, log in as kody, then open
`http://localhost:3000/training/compose/prototype?variant=A` (← / → or the floating pill switch variants).
It only exists in development: the loader throws 404 unless `NODE_ENV=development`. Files: `app/routes/training/compose.prototype.tsx` and
`__prototype-compose-{shared,parts,variants}.tsx`. The cardio parse (`parseWorkoutSentence`) and the week sum
(`resources/week-sum` → `weekSumPreview`) are the real ones. The **strength reader is prototype-only**: it maps Norwegian lift names
to lifts and reads `5×5 @ 80 kg`.

| Variant | Shape | Screens |
|---|---|---|
| **A · Skriv** | The line inside the tapped row; type and the Token Sentence appears as it becomes sure; suggestion chips; week sum; sport row with Styrke and Annet; "Gjør grundigere" opens the Drawer | r2-proto-A-typed, -strength, -unknown, -long, -deep |
| **B · Bygg** | A compact Drawer of token slots (`+ gjentak`, `+ hvor mye`, `+ intensitet`, `+ pause`, `+ øvelse`); each opens a Popover with presets and ± steppers; no keyboard | r2-proto-B-45, -6x1000, -lift-popover, -strength |
| **C · Forslag først** | The 2×2 fill menu (Arket) in the row; a picked library, copy or app suggestion becomes tokens you adjust in place | r2-proto-C-fill, -appen, -tokens, -strength |
| **D · Rask → Drawer** | One Drawer with snap points `[30rem, 1]`: a day strip, sources (`Skriv · Bibliotek · Kopier · Appen`), sport, line, sum, Legg til. Flick up or "Gjør grundigere" snaps to full and shows blocks, sets and notes. Tapping a session opens the same Drawer as its detail (owner, Annet, Lås opp, Flytt dag, Slett) | r2-proto-D-quick, -deep, -detail |

### Taps, keystrokes and time

Taps and keystrokes were counted by driving each variant with Playwright at 390×844 touch; every add succeeded. Time is a **KLM estimate**: 0.5 s per tap, 0.33 s per character (≈ 36 wpm thumb typing), and 1.35 s per decision. Wall time in a headless browser is meaningless. A live meter under the list (`måler: n trykk · n tastetrykk · s`) lets the owner measure with their own thumbs.

| Variant | 45 min rolig | 6 × 1000 m terskel, 90 s pause | Knebøy 5×5 @ 80 kg · Benkpress 5×5 @ 60 kg |
|---|---|---|---|
| Today, stamp then refine | **2 taps, 0 keys, ≈ 2,4 s** (as "45 min Z2") | 2 taps + 23 keys (≈ 10,0 s) by typing. By stamp-then-refine: ≥ 12 taps (duration→distance, add repeat, add rest), not fully measured. | Leaves I dag: + → Styrke → Navngi løftene → English editor (strength seed → exercise combobox ×2 → sets ×2 → load ×2 → Create). ≥ 20 interactions + typed kilos, ≈ 30 s+ |
| A · Skriv | 2 taps, 12 keys, ≈ 6,3 s | 2 taps, 23 keys, ≈ 10,0 s | 3 taps, 42 keys, ≈ 18,0 s |
| B · Bygg | 8 taps, 0 keys, ≈ 8,1 s | 15 taps, 0 keys, ≈ 14,3 s | **53 taps**, ≈ 34,6 s (kilos by a 2,5 kg stepper from 20 kg) |
| C · Forslag først | **4 taps, ≈ 6,1 s** (La appen fylle) | **4 taps, ≈ 6,1 s** (Fra biblioteket) | **10 taps, ≈ 11,8 s** (Kopier forrige torsdag, +2,5 kg on each lift) |
| C with "Skriv økt" | 3 taps, 12 keys, ≈ 8,2 s | – | – |
| D · Rask → Drawer | 3 taps, 12 keys, ≈ 6,8 s | 3 taps, 23 keys, ≈ 10,4 s | 4 taps, 42 keys, ≈ 18,6 s |

What the numbers say:
- **Typing wins for a session you can say** (A and D are within one tap of each other). The extra tap in D is focusing the input: it is deliberately not auto-focused inside a Drawer, so the keyboard doesn't fight the sheet's rise.
- **Starting from something wins for everything else** (C). For strength it beats everything by a mile: the same lifts as last week plus 2,5 kg is 10 taps.
- **Tap-to-build loses as soon as a number isn't a preset.** A stepper for kilos is 40+ taps. B's popovers also cost a dismiss tap each. A builder needs the keyboard for numbers (`inputmode="decimal"`), which defeats its premise.
- **Stamp-then-refine (today) is unbeatable for "45 min rolig"** (2 taps) and bad for anything with structure. Keep the stamp as the composer's empty state ("Legg til 45 min Z2"), which D does when the line is empty.

### How each variant scores against Emil's principles

✓ = honours it, ~ = partly, ✗ = violates it.

| Principle (skill) | A · Skriv | B · Bygg | C · Forslag | D · Rask→Drawer |
|---|---|---|---|---|
| Response on pointer-down (apple-design §1) | ✓ `pressable` scale on `:active` | ✓ | ✓ | ✓ |
| Direct manipulation, 1:1 (apple §2) | – (keyboard) | ~ steppers, not drags | – | ✓ the Drawer tracks the finger 1:1 (Base UI) |
| Interruptible, from the current value (apple §3) | ✓ nothing scripted | ~ popovers are transitions | ✓ | ✓ Drawer swipe and snap can be grabbed mid-flight |
| Momentum / flick to dismiss / snap (apple §5–6) | ~ only in "Gjør grundigere" | ✓ flick to dismiss | ✗ inline | ✓ flick and **snap points** (quick ↔ deep) |
| Rubber-banding (apple §9) | – | ✓ (Base UI over-drag) | – | ✓ past the top snap |
| Hint in the direction of the gesture (apple §8) | ~ | ~ | ✗ | ✓ the handle and the half-visible deep section say "drag up for more" |
| Should it animate? (emil) | ✓ keystroke updates are not animated | ✗ every token pick opens and closes a popover: dozens a session | ✓ | ✓ only open, snap and close |
| Token insertion / morph (animate) | ✓ none while typing (keyboard) | ✓ ghost → value crossfade, 160 ms `ease` | ✓ same | ✓ |
| Landing feedback (animate, state indication) | ✓ the row rises 4 px + fades, 200 ms ease-out (`starting:`), reduced-motion keeps the fade | ✓ | ✓ | ✓ |
| Origin-aware popovers (review-animations) | n/a | ✓ (`motion-popup`) but the popover covers the Drawer (shot B-lift-popover) | ✓ | n/a |
| Keyboard: 16 px, `enterkeyhint`, `inputmode` (mobile-native) | ✓ 16 px, `enterkeyhint=done`, Enter submits; `autocapitalize=words` for strength | ✓ no keyboard, ✗ but numbers need one | ✓ | ~ keyboard plus Drawer: needs `interactive-widget=resizes-content` and a real-iOS check |
| Safe areas (mobile-native) | ✓ inline | ✓ Drawer pads `env(safe-area-inset-bottom)` | ✓ | ✓ |
| Long-press (mobile-native) | rows `select-none` + `-webkit-touch-callout:none`; long-press → detail not built | same | same | same (tap opens detail) |
| break-ui: long sentence | ✗ the single-line input hides the start (shot A-long) | ✓ chips wrap | ✓ | ✗ same input as A |
| break-ui: unknown word | ✓ suggestion chip, disabled save (shot A-unknown) | n/a (can't type one) | ✓ | ✓ |
| break-ui: 10 intervals / 6 parts | ✓ stanza wraps | ~ one block only | ~ | ✓ |
| break-ui: empty | ✓ save disabled | ✓ ghosts explain | ✓ the menu is the empty state | ✓ |
| Undo and week sum | Toast with the sum before → after + Angre (all variants share it) | same | same | same; the detail Drawer adds "Slett økta" |

### Emil Before/After/Why for the prototype (what to carry into production)

| Before (prototype or today) | After | Why |
|---|---|---|
| A/D: single-line `<input>` | `textarea` + `field-sizing: content`, max 4 lines, Enter submits | Long sentences stay readable |
| D: input not auto-focused, one extra tap | Focus on the snap's `transitionend` on the compact snap, never while the Drawer is still rising | The keyboard rising with the sheet is two motions fighting; after settle it's one |
| B: kilos by stepper | Tap the number → numeric field (`inputmode="decimal"`, 16 px), stepper for ±2,5 | 53 → ~8 taps; don't make a thumb count to 80 |
| B: a popover per token above a Drawer (covers the content) | Inline stepper row under the token row in the Drawer (no second layer) | Never stack a popover on a sheet on a phone (apple §12: one material per layer) |
| Toast top-center | Bottom, above the tab bar, `ease` 400 ms (Sonner default), exits down | Same direction as the Drawer that just left; Angre within thumb reach |
| Snap `[30rem, 1]` | `[fit-content of the quick section, 1]`, the deep section peeking 16 px under the fold | Hinting in the direction of the gesture |
| The landed row rises 4 px with no scroll | `scrollIntoView({block:'nearest'})` + the rise; skip when off-mount (the toast carries it) | The athlete sees where it went |
| All variants: the ScoreStanza's English "rest" | `p 1 min 30 s` | Echo in the language typed |

### What felt right

- **D's structure**: one Drawer from every "+", the same day strip, sources as a segmented control, and the deep editor one flick up. The detail is the same Drawer at full. That matches the owner's "the drawer is where the deeper work and more info lives".
- **C's idea inside D**: a picked suggestion (library, copy, app) should land as **tokens you nudge**, not as text in the line. In the D build it lands as text; that's the one change to make.
- **A's line** is the fastest path for a writer and should be D's default tab. Strength in the same line worked with a simple grammar (`Knebøy 5×5 @ 80 kg · …`), showing "Styrke neste uke: 10 → 20 sett".
- **B** is not worth building as a mode. Keep its steppers as the token popover's instrument (already true in the token editor).

**Recommendation:** build **D**, with the line as the default tab, suggestions landing as editable tokens (C), and the stamp as the empty state ("Legg til 45 min Z2", 2 taps).

---

## 11. Proposed unified model

### The one composer

`SessionComposer`: one component, one state machine, one set of words (`SESSION_COMPOSER_LABELS`), mounted in **one container per screen size**:

| Screen | Container | Why |
|---|---|---|
| Phone (< lg) | `Drawer` (Base UI) with snap points: compact (the quick line) → full ("Gjør grundigere") | The owner's choice. Flick to dismiss, snap, and the keyboard sits above the sheet rather than the list. One place for quick and deep. |
| lg–xl | `Sheet` from the right, the same content (the day pane's existing Sheet, `day-pane.tsx:385`) | Already the day's place at this width |
| ≥ xl | Inline in the **day pane**, replacing "Skriv økt her" | The day is already chosen there; no second composer in the list |

Ways in, all opening the same composer with the day preset:

| Entry point | State sequence |
|---|---|
| Free day "+" (phone) | Drawer(compact, day = tapped, tab = Skriv, empty) → [type → live tokens + week sum] → Legg til → Drawer closes, the row rises in place, toast "Løping neste uke: 30 → 36 km. Ukemålet står på 52." + Angre. Empty → the button says "Legg til 45 min Z2" (the stamp). |
| Day with sessions: "+" / "legg til en til" | Same, day preset |
| Top line "+" ("Ny økt") | Same, day = tomorrow, the day strip open; "Annen dag…" for months ahead (story 40). "Nytt løp" and "Ny plan" move to Sesong (the menu becomes a single button). |
| Day pane (xl) | Composer inline in the pane, day = the picked day; clicking a free list row only picks the day (no inline draft) |
| Bibliotek → a session → "Legg på en dag" | Composer, tab = Bibliotek with that entry chosen, the day strip open (this replaces `catalogue.place.$workoutId`) |
| Tap a session row / ownership glyph | The same Drawer at **full**, in detail mode: tokens (live if planned), owner (Skrevet selv / Fra biblioteket / Kopiert / Lagt av appen), Annet, Lås opp, Flytt dag, Slett |
| "Gjør grundigere" / flick up | Full snap: blocks and steps (the token editor), sets per lift, notes, library, copy from another day |
| Past day | Same, plus an "Allerede gjort" switch (story 82) |
| Sesong copy week / stamp pattern | Keep in Sesong (week-level), but give the result the same toast + Angre (one undo per batch) |

### Same everywhere

- **Day picker**: `DayStrip`, a week of days as `ToggleGroup` items (h-14), swipe by week; "Annen dag…" opens the native date input only for far dates.
- **Sources**: `SegmentedControl` Skriv · Bibliotek · Kopier · Appen ("La appen fylle" greyed with a reason until it exists; Arket Q's reasons when a day can't take it).
- **Sport**: Løp · Sykkel · Svøm · Styrke · Annet (`ToggleGroup`, h-9 + hit area).
- **Live parse**: the line → tokens (ScoreStanza with Norwegian glue) → suggestions → week sum before → after (`weekSumPreview`).
- **Undo, one rule (amends ADR 0076)**: every create says what it did to the week in a toast with Angre (8–10 s), **and** the landed row keeps an Angre while it is highlighted and the athlete hasn't scrolled away. Delete stays in the detail Drawer.
- **Ownership**: the source glyph on the row; the composer states "Blir din når du endrer den" for library and app items.

### Component list mapped to `components/ui`

| Piece | `components/ui` | New or moved |
|---|---|---|
| Container (phone) | `drawer.tsx` (`snapPoints`, `showSwipeHandle`) | – |
| Container (lg) | `sheet.tsx` | – |
| Day strip | `toggle-group.tsx` (`ToggleGroup`, single) | `app/components/session-composer/day-strip.tsx` |
| Sources | `toggle-group.tsx` `SegmentedControl` | – |
| Sport row | `toggle-group.tsx` | replaces `DisciplineChips` (`writing-line.tsx:274`) |
| Line | `textarea.tsx` (16 px, `field-sizing: content`) | replaces the raw `<input>` |
| Understood | `ScoreStanza` (`components/score-stanza.tsx`) | – |
| Suggestion chips | `button.tsx` (`variant=outline size=sm`, rounded-full) | – |
| Library and copy lists | `card.tsx` / list rows with `button.tsx` | reads a new `resources/composer-sources` |
| Token instruments | `popover.tsx` on large screens; an inline stepper row in the Drawer | from `__token-editor-controls.tsx` |
| Save / deeper / cancel | `button.tsx` (default h-11, `outline`, `ghost`) | – |
| Toast + Angre | `sonner.tsx` | position bottom on coarse pointers |
| Detail | `drawer.tsx` + `badge.tsx` | replaces the ownership popover's long text |

---

## 12. Alternative concepts

| Concept | What it is | Gains | Costs | Verdict |
|---|---|---|---|---|
| **1. One Drawer (recommended)** | Prototype D + C's tokens: every "+" opens the same Drawer; flick up for deep | One surface, one set of words, one undo; the owner's Drawer; the detail and the composer are the same object; strength and Annet inside | Leaves ADR 0065's "the row opens in place" (the list no longer grows); the keyboard inside a sheet needs real-iOS work; ADR 0076 amended | **Recommend** |
| 2. Row-first, Drawer for depth | Prototype A: free-day "+" stays inline in the row (today's draft, rebuilt on the design system); "+ Ny", busy days and "Gjør grundigere" use the Drawer | Keeps ADR 0065/0076 as they are; fastest for writers; row Angre stays | Two containers for one act (the incoherence we're fixing, smaller); the day-pane duplication remains to solve | Fallback if the owner loves the in-place row |
| 3. One page | `/ny-okt?day=` replaces `sessions.new`; every "+" navigates there | Simplest code; the deep editor is the page | Leaves I dag; worst for undo and context; contradicts story 35's "fast as a notebook" | Not recommended |

---

## 13. Implementation slice plan

Lanes run in parallel; within a lane, in order. **Other areas:** Sesong owns `plan.tsx`, `__copy-week.tsx` and `__stamp-pattern.tsx`. Bibliotek owns `catalogue.tsx` and `library.tsx`. First run owns `start/*`. This journey touches them only in the one-line hand-offs marked ⇄.

| # | PR | Files | Lane | Depends on |
|---|---|---|---|---|
| 1 | **Composer core**: `useComposer` (day, sport, source, text → reading, week sum), `SESSION_COMPOSER_LABELS`, the textarea line, sport row and day strip on `components/ui`; Norwegian glue in the echo ("p", "pause") | new `app/components/session-composer/{use-composer.ts,composer.tsx,day-strip.tsx,sport-row.tsx,line.tsx}` (+ tests), `app/utils/labels.ts` (new block only), `app/utils/workout-notation.ts` (glue words, ADR 0027 A3 amendment) | X | – |
| 2 | **Phone container + entry points**: Drawer with snap points; free-day "+" and a "+" on every day open it; the top line "+" opens it (drop "Skriv en økt"/"Ny økt" duplication); retire `StampDraft`/`WritingPanel` | `stream.tsx` (EmptyDay, DaySession), `home-timeline.tsx`, `create-menu.tsx`, `day-stamp-cell.tsx`, `writing-line.tsx` (delete), `index.writing-line.test.ts`, `tests/e2e/home-timeline.test.ts` | X | 1 |
| 3 | **One undo + feedback rule**: toast Angre for every write, landed-row highlight + Angre, bottom toasts on touch; ADR 0088 amends 0076/0086 | `day-stamp-context.tsx`, `_home/index.tsx` (one `landing`), `components/ui/sonner.tsx` (position by pointer), `docs/adr/0088-*.md`, `day-stamp-context.test.tsx` | X | 2 |
| 4 | **Large screen**: composer inline in the day pane; the Sheet at lg; clicking a free row only picks the day | `day-pane.tsx`, `use-day-selection.ts`, `large-screen.test.tsx` | Y | 1 (rebase on 2 for `stream.tsx`; touches only `EmptyDay`'s lg branch) |
| 5 | **Strength in the line**: lift grammar (`Knebøy 5×5 @ 80 kg · …`) against the exercise catalogue with Norwegian aliases; server write of strength steps; week sum in sets | `app/utils/workout-sentence.ts` (+test), `app/utils/writing-line.server.ts`, `app/utils/writing-line-schema.ts`, `docs/adr/0027` amendment, `GLOSSARY.md` | Z | – (lands in the composer via 1) |
| 6 | **Annet at creation**: Annet chip writes `countsInNoTrack=true`; preview "Teller i Annet" | `writing-line.server.ts`, `writing-line-schema.ts`, `_home/index.tsx` (one field), `GLOSSARY.md` (Annet: "chosen when written or on a done row") | Z | 5 (same files) |
| 7 | **Sources: Bibliotek and Kopier**: `resources/composer-sources` (catalogue entries for the sport, recent sessions for copy), place via home's action reusing `placeCatalogueSession`; ⇄ Bibliotek's card links "Legg på en dag" into the composer; `catalogue.place.$workoutId.tsx` becomes Norwegian + redirect fallback | new `app/routes/resources/composer-sources.tsx`, `_home/index.tsx` (`intent=place`), `catalogue.place.$workoutId.tsx`, `session-composer/sources.tsx` | W | 1, 3 |
| 8 | **Deep editor in the Drawer + detail Drawer**: `ScheduledWorkoutSentence` / structure editor in the full snap; `sessions.new.tsx` becomes the no-JS / deep-link page in Norwegian on the design system; Norwegian token editor ("+ blokk", "Gjentak", "pause") | `sessions.new.tsx`, `__workout-editor.tsx`, `__empty-state.tsx`, `__token-sentence-editor.tsx`, `__token-editor-controls.tsx`, `__block-editor-sheet.tsx`, `sessions.$sessionId.tsx` (strings only), `labels.ts` (editor block) | V | 1 |
| 9 | **Past session**: "Allerede gjort" on past days; extend or lift `MARK_DONE_REACH_DAYS` for sessions written as done | `_home/index.tsx`, `app/utils/import-fit.ts`, mark-done server util | Z | 6, owner decision |
| 10 | ⇄ **Sesong copy/stamp feedback**: the Sesong PR adopts `withWeekSumToast` + batch Angre | (Sesong's files) | Sesong | 3 |
| 11 | **La appen fylle** for one day | generator seam (`plan-generation/*`), composer "Appen" tab | later | owner decision |

Parallel safety: lane X (1→2→3), Y (4), Z (5→6→9), V (8) and W (7) touch disjoint files, except that `_home/index.tsx` is touched by 3, 6 and 7 (separate intents; merge in that order) and `labels.ts` by 1 and 8 (separate blocks).

---

## 14. Owner decisions

1. **The container**: one Drawer for every "+" (concept 1, recommended), or keep the free-day row composing in place (concept 2)?
2. **Undo**: toast Angre for every write plus a row Angre while highlighted, which amends ADR 0076's "not a toast" (recommended)? Or row-only?
3. **Strength in the line**: extend the strict reader to lifts (`Knebøy 5×5 @ 80 kg`)? Recommended; it amends ADR 0027.
4. **Annet when writing**: allow "Annet" at creation, not only on a done row?
5. **Past sessions**: an "Allerede gjort" switch when writing on a past day, and lift the 6-day reach for it?
6. **"+ Ny" menu**: becomes a single "Ny økt" button, with Nytt løp and Ny plan moving to Sesong?
7. **La appen fylle** for a single day: v1 or later?
