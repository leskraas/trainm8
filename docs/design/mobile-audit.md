# Mobile UI audit — all in-scope screens at 390×844

Audit for the mobile-first UI/design cleanup (wayfinder map #277, ticket #278).
Every in-scope screen was driven with Playwright (Chromium, viewport 390×844,
`isMobile`, `deviceScaleFactor: 2`, reduced motion) against the dev server with
seeded data (`kody`). Automated checks per screen: horizontal overflow and the
offending elements, form-control font size (< 16px triggers iOS Safari
auto-zoom on focus), control heights and touch-target sizes (< 44px), clipped
input values, and the navigation affordance present. Visual review on top of
that for misalignment, spacing outliers, and raw enum text.

Reproduce: `npm run dev`, then run the script pattern in the `verify` skill at
viewport 390×844 over the routes listed below. The TanStack devtools bubble
appears in dev screenshots; it is dev-only and excluded from findings.

## Cross-cutting findings (what the conventions tickets should standardize)

These recur on nearly every screen; per-screen sections below only add what is
specific to that screen.

1. **Touch targets are globally under 44px.** Almost every button, input, and
   select renders at 32px tall (`h-8`); many links are 16–24px tall (footer
   links, "Forgot password?", breadcrumb links, "Manage sources", "View
   threshold history", "How to request your Strava export"). Checkboxes render
   at 16×16 (event disciplines). The form-control standard (#280) should pick a
   mobile control height (≥ 44px) and a minimum inline-link hit area.
2. **Select/segmented triggers render at 14px font** → iOS auto-zoom on focus.
   Affects every `<select>` (discipline, intent, kind, priority, targetKind,
   weekStartsOn, preferredUnits, plan target event) and the custom
   segmented/dropdown triggers in the workout editor (`new-session-discipline`,
   `new-session-intent`, step discipline "inherit", imports "Auto-detect").
   Text inputs are mostly 16px (good) — the gap is selects and custom triggers.
3. **The settings breadcrumb trail does not wrap and overflows the viewport.**
   Every settings/profile subpage overflows horizontally by the width of its
   trail: Passkeys +110px, Connections +54px, Password +35px, Change Email
   +19px, Photo +5px. This is the single biggest source of horizontal scroll
   in the app and is resolved by the back-button + title header convention
   (#282, breadcrumbs dropped on mobile).
4. **Navigation affordances are inconsistent** (the mix #282 replaces):
   - breadcrumb trail: all settings/profile and settings/training pages
   - "← Home" text link: events list, imports, integrations
   - "Back to home / Back to events / Back to inbox" pill links: session
     detail, event detail, imports upload
   - floating "Cancel" link at top with no title: new session, new event,
     edit event
   - "Back" underlined link floating right of the h1: plan generate
   - auth screens: nothing (login/signup/verify/onboarding)
5. **Raw enum values leak into the UI** (the gap #281 closes): discipline and
   intent select/trigger values render `run` / `endurance` lowercase while
   option lists and badges elsewhere render `Run` / `Race` capitalized; the
   step-discipline trigger shows `inherit`; the session detail meta uses
   hidden inputs carrying `structured`. Event kind/priority/target selects are
   already humanized ("Race", "Priority A", "No target") but by hand per
   screen.
6. **Page titles are display-sized (`text-4xl/5xl+`) and wrap awkwardly at
   390px**, usually with an action floating beside them mid-wrap: "Generate a
   Training Plan" (+ "Back" link), "Activity Inbox" (+ "Upload activity"
   button), "Training Settings", "Passkeys" (+ "Register new passkey"), and
   the auth headings ("Welcome back!", "Welcome aboard {email}!"). The spacing
   conventions (#279) should size mobile page titles and define the
   title-row-with-action pattern.
7. **Two-column form grids stay two-column at 390px and get cramped**:
   Edit Profile Username/Name (~150px fields — long names clip), Athlete
   Profile Timezone/Week-starts-on and Units/Birthdate, Training Settings
   Max HR/LTHR with an orphaned third field below. Date/Time and Start/End
   date pairs fit but are tight. #279 should say when pairs stack.
8. **Label styling is inconsistent within the same form**: bold dark labels
   ("Title", "Name", "Date", "Location") sit next to muted grey labels
   ("Discipline", "Intent", "Kind", "Disciplines", "Target", "Goal") with no
   semantic difference — appears on new session, new/edit event, and plan
   generate.

## Per-screen inventory

### Auth

**/login**
- Display-sized "Welcome back!" plus subtitle consumes roughly the top 40% of
  the viewport before the form starts; large dead space below the fold.
- Spacing outlier: no gap between the username input and the "Password" label
  (adjacent rows touch); the remember-me row is tighter than the rest.
- "Remember me" checkbox renders visually ~20px with a 1×1 real input;
  "Forgot password?" link hit area is 118×16.
- All three CTA buttons and both inputs are 32px tall.
- No overflow. No back/nav affordance (none needed — top level).

**/signup**
- Same oversized heading pattern ("Let's start your journey!"); single email
  field at 32px; submit buttons 32px. No overflow.

**/forgot-password**
- Same pattern; "Back to Login" text link 103×19. No overflow.

**/verify**
- Fine overall; code input is 32px tall (font 32px, no zoom risk). Submit
  288×32.

**/onboarding** ⚠ worst screen in the audit
- **240px horizontal overflow.** The h1 interpolates the raw email ("Welcome
  aboard audit-mobile@example.com!") — the unbreakable string forces the page
  wider than the viewport and everything renders against a ~630px canvas.
- The form column stays at a fixed desktop width (~520px of the 630px canvas)
  instead of filling 390px.
- Checkbox rows misaligned: the terms checkbox floats left of a two-line
  label; "Remember me" is centered on its own row for no reason.
- All inputs 32px; agree/remember checkboxes are 1×1 hidden inputs with small
  visual proxies.

### Home

**/** (dashboard)
- "Events" text link and the "+ New" button sit as an orphaned, left-aligned
  stack between the plan chip and the Form card — reads as misalignment rather
  than a toolbar.
- Week timeline: the strip's status line ("0 of 6 sessions done · Planned week
  load unavailable") truncates at the card edge without ellipsis treatment.
- "Form" stat-card tab targets ("Form", "Week", "Trends", "History") are
  30–74px wide × 16–34px tall.
- Recent table: planned-title column truncates fine; row targets small.
- No overflow. No nav affordance issues (top level).

### Training

**/training/sessions/new**
- Floating "Cancel" link top-left with no title header (mixed-affordance case
  for #282); a second Cancel sits next to "Create Session" at the bottom —
  the same action twice with different styles.
- Discipline/intent segmented triggers show raw `run` / `endurance` at 14px,
  32px tall.
- Label inconsistency: bold "Title"/"Date"/"Time" vs muted
  "Discipline"/"Intent".
- Date + Time side-by-side fits but the native date input is snug (~270px
  combined at 390px).
- Template picker card is fine; "or start from scratch ＋" is a 167×32 target.

**/training/sessions/:id** (session detail / inline editor)
- Nav is a "Back to home" pill plus a bare action row ("Mark as missed",
  "Delete session") above the card — no title header; actions are 28px tall.
- Session meta (title, discipline, intent, date, time, structure) is carried
  by hidden 1×1 inputs holding raw enums (`run`, `endurance`, `structured`) —
  invisible but flagged by the control scan; the visible meta line renders
  capitalized ("Run · Endurance").
- Workout block card: large empty region between the "+ block" affordance and
  an unlabeled blue bar pinned to the card's bottom edge — reads as a stray
  element at phone width.
- Token row: drag handle (⠿) is a 30×30 target; kebab and "+" are similar.
- RPE selector chips (1–10) are ~44px circles — one of the few compliant
  controls.

**/training/sessions/:id with intensity/quantity popover open** (workout
editor overlays)
- At 390px the popover itself fits (no viewport overflow in this capture) but
  it anchors to the token mid-page, covering the form beneath, and scrolling
  detaches it from its anchor context. The − / + stepper buttons are ~43px;
  the "inherit" discipline trigger inside the popover is 28px tall at 14px
  font; "Remove time or distance" is a plain-text target.
- Whether these popovers (intensity, sets) and the block-editor sheet need a
  dedicated mobile overlay pattern (e.g. bottom sheet) is now ticketed
  separately on the map.

**/training/events**
- "← Home" text link (59×16) as nav. Title row "Events" + "+ New Event" fits.
- Event card: dead vertical gap between the meta line and the "Run" badge.
- Badges here are capitalized — inconsistent with the editor's raw values.

**/training/events/new** and **/training/events/:id/edit**
- Floating "Cancel" top-left, duplicated next to "Create Event"/save at the
  bottom (same as sessions/new).
- Kind/Priority and Start/End date two-up rows fit but the end-date
  placeholder ("mm/dd/yyyy") clips inside the 32px native input.
- Discipline checkboxes are 16×16 real inputs — smallest touch targets in the
  app.
- All selects 14px font; label styling inconsistency as noted above.

**/training/events/:id** (event detail)
- **24px horizontal overflow**: the action row ("Back to events · Edit ·
  Cancel event · Delete") does not wrap, pushing "Delete" past the right edge.
- Same bare-action-row-as-header pattern as session detail; actions 28px tall.
- Card content itself is fine; "Run" badge capitalized.

**/training/plan/new** (Generate a Training Plan)
- h1 wraps to two lines with the "Back" underlined link (37×20) floating to
  its right — the link ends up vertically stranded mid-heading.
- Discipline/experience chips are radio inputs rendered as 1×1 with chip
  proxies ~44px tall (fine), but "Advanced" orphans onto its own row.
- Goal textarea, target-event select (36px, 14px font), horizon input all
  under-height; "Generate plan" is 32px.

### Settings

**/settings** and **/settings/profile** (Edit Profile — same rendered page)
- Breadcrumb "← Home Profile → Edit Profile" header (see cross-cutting #3;
  this page itself fits, its subpages overflow).
- Username/Name forced two-column at 390px: each field ~150px wide — the
  audit's canonical "Name input clipped" case; both flagged `clipped` when
  values exceed the field.
- Spacing outliers: ~2× oversized vertical gaps above and below "Save
  changes", and again before the "Athlete Profile" section heading — the page
  reads as three disconnected islands.
- "Athlete Profile" renders at h1 display size mid-page, competing with the
  page's own title.
- Athlete profile grid two-up at phone width (Timezone/Week starts on,
  Units/Birthdate); weekday chips fine (~44px); "Default training time" input
  32px.
- Account-action link list at bottom: rows are ~19–24px tall text links.
- "Delete all your data" is styled as a primary (teal) button — visually the
  most inviting control on the page for the most destructive action.
  (Structural note only; restyling is a conventions decision.)

**/settings/profile/change-email** — +19px overflow from the breadcrumb
trail; form itself fine (email input 32px, "Send Confirmation" 148×32).

**/settings/profile/password** — +35px overflow from the trail; three inputs
32px; Cancel/save 36px.

**/settings/profile/photo** — +5px overflow from the trail; file input is a
1×1 hidden control; Change/Save/Reset/Delete row fits.

**/settings/profile/two-factor** — no overflow; "1Password" inline link 69×16.

**/settings/profile/passkeys** — **+110px overflow** (worst settings case):
trail "Home Profile → Edit Profile → Passkeys" forces a ~500px canvas; the
display-sized "Passkeys" h1 + "Register new passkey" button row rides the
overflowing layout.

**/settings/profile/connections** — +54px overflow from the trail; connection
row link 119×19.

**/settings/training** (Training Settings)
- Display h1 wraps to two lines; discipline sections (Run/Swim/Bike) use a
  two-column HR grid with the third field (threshold pace / CSS / FTP)
  orphaned below-left; per-section "Save Run/Swim/Bike" buttons ~28px tall.
- "View threshold history" link 166×19. No overflow.

**/settings/training/history** (Threshold History)
- "← Back to training settings" text link (201×19) — yet another back-link
  variant. Table fits. No overflow.

**/settings/integrations** (Integrations)
- "← Home" nav; large dead vertical band between the header bar and the page
  title (back-link section has outsized padding).
- Provider cards: Strava/Intervals connect buttons 32px; "Upload activity" on
  the File-upload card is a plain link styled unlike the sibling cards'
  buttons; the Intervals.icu icon floats vertically centered against a long
  paragraph. No overflow.

### Imports

**/imports** (Activity Inbox)
- h1 wraps ("Activity Inbox") with the "Upload activity" button floating
  mid-right of the wrapped title — misaligned header row.
- "← Home" nav (59×16); "Manage sources" inline link 107×16.
- Import cards: outsized gap between the meta line and the "Promote" button
  (28px tall); source badge ("Strava") capitalized — consistent here.
- No overflow.

**/imports/upload**
- "Back to inbox" pill nav; discipline-override trigger shows "Auto-detect"
  at 14px/32px; file input 32px; "How to request your Strava export" link is
  a 191×14 target. No overflow.

## Priority order suggested by the data

1. Onboarding overflow + fixed-width form (240px — broken, first-run screen).
2. Settings breadcrumb overflow family (fixed wholesale by #282).
3. Event detail action-row overflow (24px).
4. Global control height / touch-target and select-font standards (#280) —
   every screen inherits these.
5. Raw enum triggers in the workout editor and imports (#281).
6. Header/title-row conventions and the spacing outliers (#279, #282).
