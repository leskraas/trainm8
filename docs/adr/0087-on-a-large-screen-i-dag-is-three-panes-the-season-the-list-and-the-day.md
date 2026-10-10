# On a large screen I dag is three panes: the season, the list and the day

Status: Accepted

**Amends**
[ADR 0086](0086-i-dag-has-no-hero-reads-like-a-calendar-and-the-scroll-engine-never-writes-under-a-reader.md)
(its consequence "the large-screen season pane is still the older English
`SeasonChart`") and **supersedes**
[ADR 0082](0082-i-dag-reads-like-a-printed-plan-and-the-season-strip-frames-the-reader.md)
§7 (the season beside the list). Builds on
[ADR 0085](0085-the-design-system-is-shadcn-base-luma-on-base-ui-and-motion-follows-one-scale.md)
(cards, tokens, Sheet) and ADR 0029 / 0066 (the Chart Primitive). Spec #505
story 60 and its "Home" decision; Arket variant Q. Wave 3, D4.

## Context

From `lg` up I dag was a 480px list with the plan page's `SeasonChart` and a
table to its right (ADR 0082 §7). The chart was the plan page's own: English
("Your season", "Read in", "Layers", "Week 2 · authored"), numbered its weeks
1–10 while the table and the list said `Uke 33`, and needed its own resource
route (`resources/home-season.tsx`). The width beyond the two columns was
unused, and a day could only be read in its one-line row.

Arket variant Q answers the large screen the way Fantastical and Apple Calendar
do: a sidebar with a compact season table and curve, the agenda in the middle,
and a contextual pane for the selected day on the right.

## Decision

### 1. Three cards on the page's tone

`home-timeline.tsx`'s frame is a CSS grid from `lg`: a 300px **season pane**
(320px from `2xl`), the **list** at up to 760px (800px from `2xl`), and from
`xl` a 340px **day pane** (380px from `2xl`), centred, 12px apart. Each is a
luma card (`rounded-4xl`, `bg-card`, `shadow-md`, a `ring-foreground/5`
hairline) that scrolls on its own with `overscroll-behavior: contain`. The list
keeps its component and its scroll engine (ADR 0086 §4) unchanged; the strip
steps aside (`lg:hidden`), since the table and the curve say what it says and
the table tints the weeks in view. Below `lg` nothing changes.

The cards are drawn by CSS from the first byte, so the list does not move
sideways when the panes fill in. Their content mounts only once the client knows
the screen is large (`useLargeScreen`, `useWideScreen`, false on the server), so
a phone renders none of it — and jsdom's page tests, which see no CSS, never
meet two copies of a session.

### 2. The season pane is read off the list's season

Plan card, table and curve come from `season-table.ts`, which reads the
`TimelineSeason` the list renders. Nothing is fetched;
`resources/home-season.tsx` is deleted. The table: the ISO week number, the
phase's colour chip and the week's rhythm (`hard uke`, `lett uke`), and
`mål · gjort` per Training Track (a sets track in sessions, as Q has it), the
done figure in its verdict's colour, `≠` where planned is more than 10 % off;
this week outlined; a dashed row `horisont · økter fylles hit, videre bare mål`
above the first week past the Planning Horizon. A row jumps the list
(`goToWeek`). With no plan the table reads planned and done TSS and the card
leads to Sesong; an open-ended plan's card reads `Blokk n av ∞` and names no
race (ADR 0079).

The curve is a **static** chart on the Chart Primitive: the lead track's target
as a line, done as bars in the track's colour, a green rule at today, the
horizon dashed, the phases as a strip under the bars and the race's flag; the
week numbers are ISO; the legend and the data table are Norwegian. Static
because the table is where a week is read and reached. The plan page's
`SeasonChart` is not changed.

### 3. The day pane, and how a day is picked

The day pane shows one day — today until another is picked: its sessions with
the row's figures (what the glyph's popover holds), status, owner, and actions:
`Se økta` on a done session, `Rediger` on a planned one (the Workout Detail View
is the editor, so both lead there; the word says what the athlete goes to do),
today's own action on today's session, and _Lås opp_ on the athlete's planned
session. _Skriv økt her_ opens the writing line on that day
(`WritingPanel initialDayKey`), and the week's zones close the pane.

Picking is **delegated** on the list's scroller (`use-day-selection.ts`), not a
prop on the rows: the rows are memoised and shared with the phone, and a pick is
a fact about the large screen. A click anywhere in a row picks its day beside
the pane (≥1280); with the day in a Sheet (1024–1279) only a click on the row's
own surface — the gutter, the space around the sentence — opens the sheet, since
the sentence's link, _Gjort_ and an empty day's "+" already do something. For a
keyboard the pick follows focus beside the pane, and `I` on a row reveals the
day (focuses the pane, or opens the sheet; said in the list's description). The
picked row's green edge is an attribute set on the row's node and drawn by the
list's class, so a pick re-renders no row. A pick never navigates and never
scrolls; the I dag pill and the plan card's I dag bring the pick back to today
with the list.

## Alternatives considered

- **Keep `SeasonChart` and translate it.** Its read-in and layer switches are
  the plan page's tools; a 300px card has no room for them, and its weeks would
  still need renumbering. A compact curve on the same primitive is less code
  than bending the shared chart, and leaves Sesong untouched.
- **A gutter button on every row.** Keyboard-native, but a prop or a control in
  the shared, memoised row for a large-screen-only feature; the delegated
  listener and `I` keep the phone's row as it is.
- **The day pane at 1024 as a third, narrow column.** At 1024 three columns
  leave the list ~380px, a phone's width on a desktop; a Sheet keeps the list
  readable and the day one click away.
- **The full spreadsheet season (variant N).** Out of scope (#505).

## Consequences

- The top line inside the list card still names the plan and its goal, which the
  plan card also says; it carries the badge, "+ Ny" and the pill, which the
  large screen still needs. Left as is (the phone's top line).
- `SeasonChart`, `season-chart.server.ts` and their inputs are now read only by
  Sesong.
- A day picked in a week that mounts later is marked when it mounts (the mark is
  re-applied when the list's weeks change).
