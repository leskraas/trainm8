# Handoff: Strength programs on mobile (trainm8)

## Overview

The strength-program section of trainm8 on a phone: pick a linear program, set starting
weights once, run today's workout by tapping sets, see what the program decides you lift
next time, and see a lift over time.

The approved direction is the card-scroll runner with tap-to-log circles. It is the only
option left in the design file; the alternatives that were explored have been removed.

Almost every screen here already exists as a route. The work is mostly replacing UI, not
adding routes.

## About the design files

`Strength Program App.dc.html` is a **design reference created in HTML** — a prototype
showing intended look and behaviour. It is not production code and should not be copied
into the app. Recreate it in trainm8's existing environment: React Router 7 route modules,
Tailwind v4 with the tokens in `app/styles/tailwind.css`, the `ui/` primitives
(`Button`, `Card`, `Badge`), and `Icon` from `app/components/ui/icon.tsx`.

Open the file in a browser to click through it. It is self-contained apart from
`support.js`, which is included in this bundle.

## Fidelity

**High-fidelity.** Colours, type, spacing, radii and interaction behaviour are final and
were taken from the repo's own tokens. Recreate pixel-for-pixel, but express every value
through the existing Tailwind tokens rather than hard-coded hex — the prototype writes
literals only because it cannot import the stylesheet.

## Integration — how this reaches the user

Read `docs/adr/0060` before starting; the runner rules below come from it.

Almost every screen here already exists as a route. The work is mostly replacing UI.

| From | Element | To |
| --- | --- | --- |
| Home / cockpit | the "what do I do today" card | `/training/sessions/:id/log` |
| Home / cockpit | an entry row for programs | `/training/programs` |
| Programs list | per-program primary button | `/training/programs/:id/start` |
| Start | "Start StrongLifts 5×5" | new instance → runner |
| Runner | "Finish workout" | outcome panel, same route |
| Outcome | "See Squat over time" | `/training/exercises/:exerciseId` |

**Two things in the prototype are scaffolding, not design.** The first screen (a "today"
summary) and the bottom tab bar exist only so the flow can be clicked through. Do not
build them. `app/root.tsx` states that `WordmarkRow` is the only persistent chrome and
that all destinations are reached through on-page elements, and the cockpit's own
Week / Trends / History tabs live in the URL. Follow that: the strength session enters
through the cockpit's decision strip (`buildTodayCard` / `DecisionStrip` needs a strength
branch), and the programs list through an entry row below it.

New work: the strength branch in the decision strip, the programs entry row, and the runner
UI. Everything else is a re-skin of an existing route.

## Screens

### 1. Programs list — `app/routes/training/programs.tsx`

Intro line, `400 13px/1.5` muted: *Each one runs on the last weight you lifted — never on
the calendar.* Then one card per program (`card`, radius 24px, padding 20px, `gap:14px`):

- Name `700 18px/1.2`; under it the shape at `400 12px/1.35` muted
  (e.g. `2 day shapes · Workout A / Workout B`).
- If running: a `Running` badge, `muted` background, primary text, `700 11px`, radius 16px.
- Lift lines, `gap:7px`, `400 12.5px/1.35` muted with the lift name `700` in foreground:
  `Squat 5×5 · +2.5 kg · −10 % after 3 stalls`.
- **Provenance note** — required, not decoration. `400 11.5px/1.45` in dim, above a
  `1px solid oklch(1 0 0 / 7%)` top border. Copy per program:
  - StrongLifts: *Increments and the three-session −10 % Stall Cut are StrongLifts' own
    published defaults. The percentage is program convention, supported by no trial.*
  - Starting Strength: *The reset cuts the weight and shrinks the increment. How many
    misses precede a reset is not published; the family's three is used.*
  - GreySkull LP: *GreySkull's primary source is a paid e-book. The ≥10-rep double
    increment and the ~10 % cut are reverse-engineered from secondary sources.*
- Button, height 48px, radius 16px: primary + `Open your run` when running, otherwise
  outline + `Start <program name>`.

Program data (schemes, increments, stall rules) must be read from
`app/utils/strength/program.constants.ts` — do not restate it in the component.

### 2. Starting weights — `app/routes/training/programs.$programId.start.tsx`

Intro: *One number per lift. After this the program decides the weight from what you log.*

Per lift, `gap:6px`: label row (name `600 14px` left, scheme `400 12px` muted right); then
a field — background `card`, border `1px solid oklch(1 0 0 / 12%)`, radius 16px, height
52px, padding `0 16px`, input `700 20px` with `inputmode="decimal"`, unit `kg` at
`600 13px` muted. Below, a hint at `400 11.5px/1.45` dim explaining where the default comes
from (`StrongLifts publishes 20 kg here — the empty bar.` / `The low end of the published
30–40 kg range.`). Defaults come from the constants file, never the component.

Primary button, height 52px: `Start StrongLifts 5×5`.

### 3. Runner — `app/routes/training/sessions.$sessionId_.log.tsx`

**Purpose:** log sets one-handed, at arm's length, mid-set.

Header: back arrow 36px, eyebrow `Workout A` (primary, `700 11px`, uppercase,
letter-spacing .09em), title `Run your workout` `700 17px/1.25`, and a `Session 14` badge
(`muted`, radius 16px). Scroll area padding `0 16px 120px` — the bottom padding clears the
rest bar and must not be dropped.

One card per lift (`card`, radius 24px, padding `18px 18px 16px`, `gap:14px`):

- Title row: name `700 17px/1.2`, sub `5×5 · 82.5 kg` at `400 12.5px/1.3` muted, and a
  36px outline help button (question-mark-circled) on the right.
- **Help panel** (collapsed by default): background `muted`, radius 16px, padding 14px,
  `400 12px/1.5` muted, `gap:8px`. Four lines: how the weight was resolved (per lift, e.g.
  *82.5 kg is your working weight after five made sessions* / *60 kg is held: two sessions
  in a row came up short*), *Plates are solved against Bredvid Gym.*, *The rest timer
  survives a locked phone, but not a closed tab.*, and a link to this lift over time.
- **Warm-up:** section label `WARM-UP` at `700 10.5px`, uppercase, letter-spacing .09em,
  dim. Chips wrap, `gap:8px`, radius 14px, padding `8px 11px`, `min-height:44px`,
  `600 12px`, label `40 × 5`. Off: transparent, border `oklch(1 0 0 / 10%)`, dim text.
  On: background `oklch(1 0 0 / 10%)`, border `oklch(1 0 0 / 22%)`, foreground.
  The ramp is generated from the heaviest working set.
- **Working sets:** label row — `WORKING SETS` left, `2 of 5 logged` right at
  `400 11.5px` dim. Then the circle row: equal-width buttons, `gap:10px`, height 60px,
  radius 20px, `2px` border, `700 19px`, `transition: background .12s, border-color .12s,
  transform .08s`, `:active { transform: scale(.94) }`. Each carries
  `aria-label="Log set 3 of Squat"` (or `Logged set …` once logged).
  - Untouched: transparent, border `oklch(1 0 0 / 16%)`, dim text, showing the target reps.
  - Made: primary background, primary border, `#0c1512` text.
  - Short: background `oklch(0.704 0.191 22.216 / 18%)`, destructive border and text,
    showing the rep count achieved.
- **Plate line:** `400 12px` monospace muted, `20 · 10 · 1.25` (per side, heaviest first,
  solved against the active gym's inventory); on the right, `Last time 80 × 5,5,5,5,5` as a
  dotted-underline button at `400 12px` dim.

Footer: primary `Finish workout`, height 52px, then centred `400 11.5px/1.45` dim: *Every
set was saved as you tapped it. This only marks the day.*

**Rest bar** — the one piece that must not block anything. Pinned to the bottom of the
scroll container, background `card`, top border `1px solid oklch(1 0 0 / 12%)`, padding
`10px 14px`, `gap:8px`: clock icon, then `700 20px` tabular-nums time (`min-width:56px`),
then the reason at `400 11.5px/1.3` muted, then 44×40 `−15s` / `+15s` outline buttons and a
40px dismiss. Counting down: primary. Past zero: destructive, and the clock shows `+0:14`
rather than stopping. The page scrolls and sets stay tappable while it runs.

### 4. What you lift next time — same route, after Finish

One panel per lift, radius 20px, padding `16px 18px`, `gap:6px`:

- Headline `700 15px/1.3`; reason `400 12.5px/1.5` muted.
- Progress: outline (`oklch(1 0 0 / 10%)`), `Squat 82.5 kg → 85 kg`, reason *All 5 sets of
  5 reps. StrongLifts adds 2.5 kg.*
- Held: `card` background, `Bench Press stays at 60 kg`, *A set came up short, so the
  weight repeats.*
- Not logged: outline, `… unchanged at 82.5 kg`, *Nothing was logged for this lift, so the
  program did not read it.*
- **Stall Cut:** background `oklch(0.704 0.191 22.216 / 10%)`, border
  `oklch(0.704 0.191 22.216 / 40%)`. Label `Stall Cut: ` then `60 kg → 54 kg`. Reason
  explains the three-session rule, the 10 %, and what the gym can actually make
  (*Your gym makes 55 kg, not 54 kg*). Then a provenance line above a
  `1px solid oklch(1 0 0 / 8%)` top border: *The 10 % cut is StrongLifts' own published
  convention. No trial supports it.*
  **It offers nothing.** No "keep the weight anyway", no dismiss, no undo. Per ADR 0060.

Then an outline `See Squat over time` and a primary `Back to today`, both height 48px.

### 5. Lift over time — `app/routes/training/exercises.$exerciseId.tsx`

Card, radius 24px, padding 20px. Top row: `Working weight` label `600 12px` muted +
`82.5 kg` at `700 32px/1.05`; right-aligned `Est. 1RM` + `96 kg` at `700 20px` in primary.

Bar chart, height 132px, bars `flex:1`, `gap:6px`, radius 6px, scaled against a 90 kg
ceiling. Normal bars `oklch(1 0 0 / 16%)`; the latest bar primary; a Stall Cut session
destructive. Under each bar a `600 9px` tick, every third session labelled `S7`.

Below, a `muted` note strip, radius 14px, padding `11px 13px`, with an 8px destructive dot:
`Session 8 — Stall Cut, 80 kg → 72.5 kg`.

Then `RECORDS`: rows, border `1px solid oklch(1 0 0 / 10%)`, radius 16px, padding
`13px 16px`, name `600 13.5px` left, value `400 12.5px` muted right — 5RM, Est. 1RM (with
the set it came from), best session tonnage.

## Interactions & behaviour

**Tap-to-log** (the core interaction):
1. First tap on a set circle logs the full target (5 reps) and starts a **3-minute** rest.
2. Each further tap decrements the reps: 5 → 4 → 3 → 2 → 1 → 0 → unlogged. Any value below
   target turns the circle destructive and restarts rest at **5 minutes**, with the reason
   *longer rest after a missed set*.
3. Tapping past 0 clears the set and cancels the rest timer.

Rest durations come from `app/utils/strength/rest.ts` — do not hard-code 180/300.

**Warm-up chips** toggle. Ticking the *last* warm-up rung starts a 3-minute rest (the
transition into working weight); ticking any earlier rung clears a running rest.

**Rest timer:** ±15 s adjusts the deadline, ✕ dismisses. It counts past zero into `+m:ss`
in destructive rather than disappearing. Store a deadline timestamp, not a decremented
counter, so a locked phone stays correct; tick at 500 ms. It never covers the set circles
and never opens a modal.

**Persistence:** every tap is a write. `Finish workout` marks the session complete — it is
not a save. Say so in the caption.

**Navigation:** back returns to the cockpit from any strength screen; from the outcome
panel it returns to the runner.

**Transitions:** only the 120 ms colour transition and 80 ms press-scale on set circles,
plus the help-panel expand. Nothing else animates.

**Hit targets:** every interactive element is ≥44px. Set circles are 60px tall for a
reason — they are pressed with a shaking hand.

## State

Per running session:
- `logged: Record<liftId_setIndex, reps>` — absent means unlogged, `0..target` otherwise.
- `warmupDone: Record<liftId_rungIndex, boolean>`.
- `rest: { deadlineMs: number, reason: 'made' | 'missed' | 'warmup' } | null`.
- `helpOpen: Record<liftId, boolean>` — UI only.

Derived, never stored: resolved working weight per lift, plate breakdown, sets-logged
count, and the outcome per lift. All of it comes from the existing presenter
(`app/routes/training/__runner-presenter.ts`) and the constants — the UI computes none of
the programme logic.

## Design tokens

Everything below already exists in `app/styles/tailwind.css`; use the token, not the hex.

| Token | Value | Use |
| --- | --- | --- |
| background | `oklch(0.148 0.004 228.8)` | page |
| card | `oklch(0.218 0.008 223.9)` | cards, rest bar, fields |
| muted | `oklch(0.275 0.011 216.9)` | badges, help panel, note strips |
| foreground | `oklch(0.987 0.002 197.1)` | primary text |
| muted-foreground | `oklch(0.723 0.014 214.4)` | secondary text |
| dim (muted-fg at 85 %) | `oklch(0.62 0.014 214.4)` | captions, section labels |
| primary | `#35b89c` | progress, actions, today |
| primary-foreground | `#0c1512` | text on primary |
| destructive | `oklch(0.704 0.191 22.216)` | missed sets, Stall Cut, overdue rest |
| border | `oklch(1 0 0 / 8–16%)` | hairlines; `22%` on hover |

Radii: cards 24px · secondary cards / fields / buttons 16px · rows 20px · set circles 20px ·
chips and small controls 12–14px.

Spacing: 4 / 6 / 8 / 10 / 14 / 16 / 18 / 20 / 24 px. Page gutter 16–18px.

Type — **Public Sans Variable**, already installed:

| Role | Style |
| --- | --- |
| Screen title | 700 24–26px / 1.15–1.2 |
| Big weight | 700 32px / 1.05 |
| Card title | 700 17–18px / 1.2 |
| Body | 400 13px / 1.5 |
| Secondary | 400 12–12.5px / 1.35 |
| Caption | 400 11.5px / 1.45 |
| Section label | 700 10.5px, uppercase, letter-spacing .09em |
| Set circle | 700 19px |
| Timer | 700 20px, tabular-nums |
| Plate line | 400 12px, monospace |

## Assets

Icons only — all from `other/svg-icons/`, rendered through `app/components/ui/icon.tsx`:
`arrow-left`, `chevron-right`, `chevron-up`, `question-mark-circled`, `clock`, `plus`,
`minus`, `cross-1`, `home`, `barbell`, `bar-chart`. The prototype inlines the same tabler
paths because it cannot reach the sprite. No images, no illustrations.

## Copy rules

The wording is part of the design. Two rules to hold:
- Every number the program produced says where it came from — the resolution line in the
  help panel, the hints on the start screen, the provenance notes on programs and on the
  Stall Cut.
- Nothing praises the user and nothing softens a cut. The Stall Cut states the rule and the
  new weight, and offers no way out.

## Files

- `screens/` — seven reference captures at 390 × 872, one per screen and state, with an
  index in `screens/README.md`. Use them to check your build; use the design file for
  anything they leave ambiguous.
- `Strength Program App.dc.html` — the design, clickable. Ignore its "today" screen and
  bottom tab bar (see Integration).
- `support.js` — runtime needed to open the design file locally.

Source of truth in the repo: `docs/adr/0060-the-session-runner-is-a-grid-with-a-deadline-and-a-rack-that-cannot-make-the-number-says-so.md`,
`app/utils/strength/program.constants.ts`, `app/utils/strength/rest.ts`,
`app/routes/training/__runner-presenter.ts`.
