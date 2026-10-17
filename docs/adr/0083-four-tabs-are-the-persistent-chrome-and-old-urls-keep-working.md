# Four tabs are the persistent chrome, and old URLs keep working

Status: Accepted · **§1 amended by
[ADR 0101](./0101-three-tabs-and-a-calm-i-dag-that-shows-today-and-this-week.md)**:
three tabs, _I dag_, _Plan_ and _Meg_; _Sesong_ is _Plan_ and _Bibliotek_ a
section of it (§5, §6, §8 with it). §4 (old URLs keep working) stands.

**Supersedes #178's embedded navigation** — _"the wordmark row is the only
persistent chrome; every other destination is reached through page elements"_
(`app/root.tsx`, `app/components/wordmark-row.tsx`), which was never an ADR.
**Amends** `docs/design/ui-conventions.md` §3.3 (ADR 0028) on which screens are
top-level. **Builds on** ADR 0081's Norwegian for the #505 surfaces. Spec #505
stories 56–59 and its _Navigation_ decision, slice S12.

## Context

#178 removed the floating pill bar and decided that no navigation would be
persistent: the wordmark row went home, the avatar went to Settings, and every
other destination was a link in some page. It worked while the app had one
surface. It stopped working as the app grew: Events, the Catalogue and Programs
had no way in from home except an "Elsewhere in trainm8" nav at the far end of
the stream (the End Cap), which an athlete reaches only by scrolling past their
whole season. The design had a bottom tab bar all along; home's code carried two
`TODO(#178)`s for the day it was adopted.

Spec #505 decides that day has come: four tabs, _I dag_, _Sesong_, _Bibliotek_
and _Meg_. Events and plan creation belong to Sesong; the catalogue, programs
and exercises to Bibliotek; settings and integrations to Meg. Imports have no
page of their own.

## Decision

1. **Four tabs are the app's persistent chrome**, in this order: _I dag_ (`/`),
   _Sesong_ (`/training/plan`), _Bibliotek_ (`/library`) and _Meg_ (`/me`).
   `app/utils/app-tabs.ts` owns which tabs there are, where each lands and which
   URLs each is home to; `labels.ts` owns their words (`APP_TAB_LABELS`);
   `app/components/tab-bar.tsx` draws them with the `Icon` sprite.
2. **One element, two placements.** On a phone it is a bottom tab bar, fixed to
   the bottom edge and padded by the safe area below and beside it
   (`viewport-fit=cover`; the app layout pads its sides by the left and right
   insets too, and a bottom sheet pads by the bottom one). From `md` up it is
   not fixed: the same `<nav>` sits in the wordmark row as a row of links, each
   44px tall (ui-conventions §2.2). There is only ever one "Hovedmeny" landmark
   in the page. The first run (`/start…`) carries no bar: it is a flow with one
   way forward.
3. **The room the bar takes is one CSS variable**, `--tab-bar-space`
   (`tailwind.css`): the bar's 56px plus the safe-area inset when the bar is in
   the page and fixed, `0` otherwise (logged out, auth screens, `md` and up).
   The app layout pads its bottom by it; I dag's frame subtracts it from its
   height, so the stream's last row and the season strip are never under the
   bar; the rest timer and the dev athlete switcher sit above it. No page does
   the bar's arithmetic itself.
4. **A tab is a home for URLs, not a URL.** Pages that moved into a tab keep
   their addresses — `/training/events/…`, `/training/catalogue`,
   `/training/programs`, `/training/exercises/…`, `/settings/…`,
   `/imports/upload` — so no bookmark or deep link breaks. The bar marks the tab
   a page lives under: `aria-current="page"` on the tab's own landing page,
   `aria-current="true"` on a page deeper in it; a page under no tab (a session,
   a log) marks none rather than guessing. Guessed and retired roots redirect:
   `/settings` and `/imports` (the retired Activity Inbox, ADR 0049) go to Meg,
   `/events` to the Events list as before.
5. **Sesong** is the season plan, which now lists the upcoming Events it is
   planned around with _Alle løp_, _Nytt løp_ and _Planlegg en ny sesong_. With
   no plan, Sesong lands on plan creation (`/training/plan/new`), which is then
   Sesong's landing page: titled _Sesong_, no back arrow, every word in
   Norwegian (its Event dates too, `formatNbDate`), listing the athlete's Events
   and linking the full list.
6. **Bibliotek** is a hub page: the Catalogue, the strength programs, every
   exercise (`/library/exercises`, the whole bank the athlete can put in a
   session, searched by name on the server), and the athlete's own recent lifts
   — each exercise opening its history. An athlete with no lifts still finds the
   exercises.
7. **Meg** is a hub page: one profile card (profile and account), training
   settings, the intervals.icu connection with its state, the file upload, and
   logging out. The connection's state is one derivation the integrations page
   shares (`connectionHubStatus`). The wordmark row's avatar link to Settings is
   gone with it — two ways to the same place in one row is one too many.
8. **A tab's landing page is a top-level screen** (ui-conventions §3.3): no back
   affordance; the bar is the way out. A page inside a tab backs out to its
   tab's landing page (Events → Sesong, the Catalogue → Bibliotek, settings →
   Meg).
9. **The End Cap's "Elsewhere in trainm8" nav is removed.** It existed only
   because there was no bar (#471, #477); the bar is now how Events, the
   Catalogue and Programs are reached.

## Considered options

- **Keep #178 and add more page links.** Rejected: the spec decides the tabs,
  and the far end of the stream is the one place an athlete does not reach by
  accident.
- **A bottom bar on every screen size.** Rejected: on a desktop a bottom bar is
  a phone pattern stretched; the wordmark row has the room.
- **Move the pages under new URLs (`/sesong/events`, `/meg/settings`).**
  Rejected: every link, test and bookmark would break for a gain the bar's
  prefix map already gives.
- **Render the bar in each tab's page.** Rejected: it would remount on every tab
  change and each page would carry its own copy of the padding.

## Consequences

- On a 390×844 phone the stream shows about 56px less at rest. The hero still
  folds on scroll, so the stream gets the screen when it is read.
- The hub pages are new #505 surfaces and speak Norwegian (ADR 0081 §1); the
  pages they open keep their English until they are redesigned (ADR 0081 §4).
- The dev-only React Router devtools trigger floats over the Meg tab on a phone;
  a shared Playwright fixture hides it in every e2e test.
- `docs/product.md`'s old "Home, Training, Settings" tab line is replaced by
  this ADR.
