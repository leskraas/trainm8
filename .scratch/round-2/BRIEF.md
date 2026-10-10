# Brief: I dag (home) redesign — shared context for every agent

Repo: /home/user/trainm8 (branch `claude/home-redesign`, from main 4036066). Read `CLAUDE.md`,
`docs/agents/*.md`, `GLOSSARY.md`. Words shown to users live in `app/utils/labels.ts` (ADR 0081: Norwegian
bokmål on the #505 surfaces). Decisions are recorded as ADRs in `docs/adr/` (next free number: 0085).
Never run `prisma db seed` in production; local dev is fine (see `.claude/skills/verify/SKILL.md`).

## Owner decisions (2026-10-10)

1. Visual direction: **luma-like, rounder, calmer** (#505 "Look", story 86). Keep today's green primary and
   Public Sans. Larger radii (cards ~14–16px, controls ~10–12px), surfaces separated by tone/shadow rather
   than 1px hairlines everywhere, clear typographic hierarchy (weight+size+leading as a set, size-specific
   tracking), tabular numbers, Norwegian decimal comma.
2. Scope: **foundation + home**. Base UI upgraded to latest (`@base-ui/react@1.9.0`), tokens, every
   `app/components/ui/*` component reviewed against Emil's rules, a `/design` page showing the system, and
   home rebuilt on it. Other pages inherit tokens but are not rewritten.
3. **Remove the hero.** Follow Arket variant P: a thin top line (plan/philosophy · event countdown e.g.
   "Halvmaraton om 12 uker" or "blokk n av ∞" for open-ended plans · "I dag" pill), the fixed season strip,
   then the list. Today's row is emphasised in the list and carries the "Se økta" action. Form and Rekorder
   (the hero's other panes) **move to the Meg tab** so they don't disappear from the app. "Uka" pane is
   already the week header. No collapsing header, no scroll-driven fold.
4. Delivery: one branch, one PR at the end.

## Design references

- Arket prototype (local copy): `scratchpad/arket/` — `variants/p.js` (home, mobile), `variants/q.js`
  (large screen: season table + curve | agenda | day detail), `variants/i.js`, `d.js`, `l.js`, `c.js`.
  Render with `scratchpad/arket/harness.html?v=P&s=goal` (file://, Chromium `--allow-file-access-from-files`).
  "Use it for ideas, not for its look."
- Screenshots: `scratchpad/shots/design-P.png`, `design-Q.png`, `app-mobile*.png`, `app-desktop.png`.
- Spec: GitHub issue leskraas/trainm8#505 (+ its comment listing which idea came from which variant).
- Emil Kowalski's skills (local): `scratchpad/ext/skills/skills/` — `emil-design-eng`, `apple-design`,
  `animate`, `review-animations` (+STANDARDS.md), `mobile-native`, `break-ui` (+CATALOG.md),
  `pick-ui-library`; `scratchpad/ext/skills/performance-cheatsheet.md`. READ the ones relevant to your task.

## Findings to fix

### Performance / feel (measured, production build, 390×844 touch, kody seed)
P1. Landing ladder (`use-timeline-scroll.ts` settle on SETTLE_LADDER for 1.3s) overwrites the user's scroll:
    scrolled to 819 at 400ms, yanked back to 519 at 1.7s. Release on first user input; use ResizeObserver
    instead of timers.
P2. Scrolling up loads ONE folded past week (~47px) per frame and writes scrollTop to compensate every time
    (growth storm; kills touch momentum). ADR 0078 showed rows aren't the cost → mount all weeks before today
    up front (folded past weeks are tiny), no upward growth, no compensation.
P3. 4× CPU throttle scrolling up: median 38ms/frame, p90 61ms. Scroll handler is unthrottled, queries all
    weeks + getBoundingClientRect per event, sets React state. Use one rAF, IntersectionObserver for active
    week/frame/away.
P4. Hero fold animates `height` per scroll event → content moves 2× thumb speed; `--hero-lift` CSS var on
    parent drives child transform. (Goes away with the hero.)
P5. Vertical swipe on hero scrolls nothing; at landing the list is 214px of 844. (Goes away with the hero.)
P6. First paint shows last week (scrollTop 0) then jumps to today after hydration.
P7. Mobile baseline missing: `-webkit-tap-highlight-color: transparent`, `overscroll-behavior: contain` on
    the stream, `touch-action: manipulation` on controls, `theme-color` per scheme.
P8. Strip scrub (pointermove) can mount many weeks per move (goes away with P2).

### Design deviations (vs Arket P/Q)
D1. Hero + Ukeskiftet bar + "+ Ny" row eat the screen; one day row visible on landing (decision 3 fixes).
D2. Volume figures use "." decimals (`73.8`): home uses `formatVolumeFigure` (week-words.ts:125,
    strip.ts:67, season table) instead of `formatNbVolumeFigure` (app/utils/format.ts:650).
D3. English phase names in Norwegian headers (`Peak · hard uke`, `Build`) — from
    `app/utils/plan-outline/presets.ts:216-307`. Should read Grunntrening / Oppbygging / Spissing /
    Nedtrapping (display names via labels.ts; don't break stored keys).
D4. Large-screen season pane is the old English SeasonChart ("Your season", "Read in", "Layers",
    "Week 2 · authored"); chart numbers weeks 1–10 while table says "Uke 33".
D5. Strip lacks phase colour band with names, dashed horizon line, dashed bars for unfilled weeks, event flag
    (all in variant P).
D6. Every session row repeats "Lås opp · Gi økta tilbake til appen, så den kan justere den igjen" — noise.
    Design shows ownership with a small glyph; put the explanation behind the lock (popover/tooltip) once.
    Per-session volume in the track unit (`6,1 km`) missing at the row's right.
D7. Week header contradicts itself: `planlagt –` beside `plan 94 %`; `ikke målt · ingen tall å holde opp
    mot` beside `gjort 9.8`; `Styrke mål 6 · planlagt 0 sett` beside `0 av 2 økter`.

### Spec deviations (#505 / ADRs)
S1. EndCap treats open-ended plan as "no plan" (`stream.tsx:1214` `planned = cap.eventDateLabel != null`) →
    shows "Det finnes ingen sesongplan ennå" + "Planlegg en sesong". Breaks ADR 0079.
S2. Writes from "+ Ny → Skriv en økt" have no Angre on I dag (`day-stamp-context.tsx:211` `open:false`);
    ADR 0082 S11 says they can be undone.
S3. Folded-week line `35 av 46 km · i rute` — text divides by target, verdict graded vs planned
    (`week-words.ts:193-205` vs `app/utils/plan-outline/week-volumes.ts:632-638`). Make them agree.
S4. Story 27 text: code `fylles søndag kveld i uke 39` vs spec `fylles når uke 40 er ferdig` (ADR 0082 §3
    deliberate) — keep code, note in PR.
S5. Story 40 "write any distance ahead" capped at 730 days (`timeline-window.ts:36`); GLOSSARY says any.
S6. Story 21 skier: only easy share shown, not a zone split.
S7. Story 34: planned and done "+n uten km" counts look identical on one line — say which.
S8. `SelectField` in week-change-card (`week-change-card.tsx:354` → `components/ui/select.tsx:47`)
    `transition-[color,box-shadow] duration-200` on built-in curve — violates ADR 0077; e2e motion audit
    never mounts the card.
S9. English session-row bits; band summary uses `truncate` (`stream.tsx:607`) vs story 32; draft controls
    below 44px.
S10. Strip at long spans can be 100+ bars on 390px (~3px each).

### Stale docs / dead code
`tailwind.css` `@utility pill-fold` (unused), `--shadow-pill` comment, `reflow`/`press` comments;
`hero.tsx` + `home-timeline.tsx` headers (scrolling strip, floating pill); `presenter.ts` foldLabel doc,
"every day forward is a row", back-to-today pill; `use-timeline-scroll.ts:100`; `stream.tsx:8-17,511-536`,
`day-stamp-cell.tsx:18-20` ("Nothing is parsed"); `writing-line.server.ts:16-17` ("half a year");
`tests/e2e/home-timeline.test.ts:2775-2782` (vacuous strip scroll-behavior assertion); GLOSSARY Planning
Horizon; ADR 0065 §8 and 0077 §2–3 bodies stale (amend via new ADR, don't rewrite history).

## Working rules for agents
- Run the repo's own checks on what you touch: `npx vitest run <files>`, `npm run lint`, `npm run typecheck`.
  e2e (`npm run test:e2e:run -- <file>`) needs a built app; see the verify skill.
- Match surrounding code style and comment density (this repo writes long "why" comments — keep them true).
- Commit on your branch with clear messages; end each commit message with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01DAvBhPqhzsh2nymW3FmfBf`. Do NOT push, do NOT open PRs.
- Report: what changed (file list), what you verified and how, what you could not do.

## Wave 1 results (merged into claude/home-redesign)
- Fixes landed (D2, D3, D7, S1, S2, S3, S5, S6, S7, S9, stale docs): commits a69e17f..fef4624.
- `home-timeline.tsx` still passes `maxDayKey={writable.lastDayKey}` to WritingPanel — prop is deprecated/ignored; drop it.
- `stream.tsx` TrackLine/Figure gained figure notes + zone-split lines (week header) — keep them.
- Kilos keep "." because rep counts use "," (`82.5 × 5,5,5,4`) — open decision, mention in PR.
- Not yet recorded in an ADR: closed week graded against target once every done session has a number;
  "+ Ny" writes undoable from toast; writes have no last day. Record in a new ADR (0086) in wave 2/3.
- Owner: design system follows shadcn setup (shadcn CSS-variable names, `npx shadcn add`, base style; luma
  variant if available), coss only as docs-page reference, Drawer built on Base UI's own Drawer.

## Wave 2 — Meg (merged)
Form + Rekorder live on Meg (`app/routes/__me-form-records*.ts(x)`, ME_FORM_LABELS/ME_RECORD_LABELS).
Left to delete after home stops importing the hero: hero.tsx, hero-panes.ts(+test), hero-pager.ts(+test),
HERO_LABELS/HERO_PANE_LABELS/HERO_PANE_TEXT (grep), HOME_REPLAN_* if unused (labels.test.ts tests it),
buildProofStrip/ProofRecord in _home/presenter.ts (+tests), loader fields snapshots/personalRecords and their
calls in _home/index.tsx, hero tests in index.dashboard.test.tsx. Keep current/tsbTrust (today block, nudge).

## Wave 2 — Home (merged, 8e1bd17)
No hero; calendar (week shape past|open|beyond, every day a row, Horisont divider); top line with goal
countdown, `● n forslag` badge, + Ny, I dag pill; strip with phase band, horizon, flag, windowed when bars <6px;
week header with track Meters + notes block; today row with Se økta/Gjort/coach line; ownership glyph Popover.
Scroll: past mounted up front, 0 writes under reader, today before first paint; content-visibility only where
browser anchors (Chrome/Firefox). ADR 0086. Measured: 4× CPU scroll-up median ~17ms, p90 39–49ms (render
cost, not script). Screens: scratchpad/shots/home-v2-*.png.

## Round 2 (2026-10-10, after #537 merged as 326fc7f on main — deployed)
Owner agreed to all recommendations:
- Kilos with decimal comma, rep counts separated by " · ": `82,5 kg × 5 · 5 · 5 · 4`.
- Track colours: darker per-track text variants that pass WCAG AA (text) while marks keep the hue.
- Radius: migrate old `rounded-lg/xl` to the luma scale page by page, inside each area's PR.
- Bring Sesong, Bibliotek, workout pages, first run, imports into the design system; English → Norwegian (ADR 0081).
- One PR per area, merged when green. Audit first (spec #505 + ADRs + Arket + Emil), then fix.

## Round 2 file ownership (from scratchpad/audit-inventory.md)
- NEVER change `formatKg` (parser reads its `82.5` back) or `getDisciplineLabel` (feeds stored titles). Add display
  formatters instead (e.g. `formatNbKg`).
- labels.ts: each PR adds its own bannered section; never reorder others.
- Sesong owns `__plan-chrome.tsx` (catalogue.tsx imports it — Bibliotek must not edit it).
- The sessions/editor PR owns `__workout-detail-editor*`, `profile-bars`, `shape-strip`, `score-stanza`, the
  `tw-animate-css` import (removed last).
- One PR at a time owns `_home/presenter.ts`.
- Dead, deletable: `load-metric-badge.tsx`, `floating-toolbar.tsx`.
- Next free ADR numbers: 0088+ (claim yours in your PR and say so).

## Delivery change (owner, 2026-10-10): ONE big PR for all of round 2
Integration branch `claude/round-2` (from main 326fc7f + Emil skills + Matt skills update). Every agent branch is
merged into it by the coordinator; new agent branches start from `origin/claude/round-2`. Agents push their own
branch and never open PRs. #538 and #539 are folded in and closed.

## Owner decisions, round 2 (2026-10-10, all recommendations accepted)
1. Composer = prototype variant D (branch claude/prototype-session-composer, scratchpad/audit-create-session.md):
   every "+" opens ONE Base UI Drawer. Compact snap = the line with tabs Skriv / Bibliotek / Kopier / Appen;
   full snap ("Gjør grundigere") = blocks/steps/notes; library or copy suggestions arrive as adjustable tokens (C);
   the same Drawer at full is a session's detail view. Large screen: same composer in the day pane (Sheet lg–xl).
   Stamp stays as the empty state ("Legg til 45 min Z2"). Carry-overs: auto-growing textarea, focus after the
   Drawer settles, numeric keypad for kilos, no popover stacked over the Drawer, toasts at the bottom on phones.
2. Undo: toast "Angre" for every write + Angre on the new row while highlighted. Amend ADR 0076 (new ADR).
3. The sentence reader reads lifts (`Knebøy 5×5 @ 80 kg`). Amend ADR 0027 (new ADR).
4. Annet can be chosen when writing a session.
5. Past days: an "Allerede gjort" switch; lifts the 6-day MARK_DONE_REACH_DAYS limit for it.
6. "+ Ny" becomes a single "Ny økt" button; Nytt løp and Ny plan move to Sesong.
7. "La appen fylle" for one day: later — tab visible but disabled ("kommer") in v1.
8. Token Sentence glue words and zone labels in Norwegian on display ("pause", "ganger"); stored notation unchanged.
9. Norwegian exercise aliases, searchable ("knebøy" finds Squat).
10. Untapped sets at Finish: ask "12 sett er ikke logget — marker som ikke gjort eller fortsett?".
11. Library beside the day (Arket Q): yes, via the composer's Bibliotek tab and the day pane.
12. Sesong: I dag's compact curve + season table on top; the analytical SeasonChart moves under "Avansert".
13. Sesong desktop: two columns (picture+table | edits+philosophy); not the full N spreadsheet.
14. Week stamping removed as a user step (horizon fills automatically); "Kopier uke" stays.
15. First run "Timer i uka" = what you train now; the plan starts there (not a ceiling).

## Merged into round-2: sesong-family-fix (3ca9fc5)
Follow-ups for the Sesong plan-page agent: (a) `philosophy.ts:169` preview baseline still reads the family from the
last phase — pass the phases like outlineFamily now does; (b) ADR 0079 "As built" says Hold meg aktiv starts
"this week" — now first unbegun week; (c) decision 14 removes stamping; Sesong gets no philosophy picker (Klassisk
default stays; switch via «Bytt filosofi»).
Note: jsdom route tests in app/routes/training time out under heavy machine load (load avg ~19) — rerun when quiet.

## Merged into round-2: sesong-small-fixes (1818343), events-norwegian (16c15a1)
- New ui primitive: components/ui/radio-group.tsx (shadcn). design-system.md needs its row (do it in the final pass).
- Open e2e checks for final verify: cta-semantics:17 ("Se økta" matches two links on I dag at 1280 — today row +
  day pane?) and tab-bar:213 (Bibliotek exercise link). Verify on round-2 head; fix if real.
- Never `pkill -f "node index.ts"` — kill only your own PID.
