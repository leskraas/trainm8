# PR #720 (closes #475): review-read, axis Qualities

Head: `ce7948678d1999cd282c110b55d920c031c9108a` (`origin/agent/475-build-the-review-surface`), diff read three-dot against `origin/main`. Phase: `poc`.
Read against every quality in `.claude/skills/factory/references/qualities.md` (Speed, Failure, Access, Security, Insight, Data), plus CLAUDE.md's UI craft rules (emil-design-eng, apple-design, animate, mobile-native, review-animations, break-ui).

**Verdict:** nothing high or critical. Nothing touches a secret or a one-way door. One medium (mobile-native) and three lows. Under `poc` all four are debts, not a send-back.

## Findings

### 1. The panel's scroll-into-view ignores the fixed tab bar, so a panel opened near the bottom of a phone screen stays hidden under it
- **Quality:** UI craft (mobile-native; it also touches Access, because the content opens but can't be seen)
- **Severity:** medium (a `poc` debt: it is on the happy path at 390×844, but the athlete can scroll to recover)
- **Where:** `app/routes/training/__plan-preview-row.tsx:144-153` (`revealWhenOpen`: `panel.scrollIntoView({ block: 'nearest' })`)
- **What:** below `md`, `/training/plan/generate/:eventId` shows the fixed bottom tab bar (`showsTabBar` only drops it under `/start`; `--tab-bar-space` = `3.5rem + env(safe-area-inset-bottom)`). The app sets no `scroll-padding-bottom` and the panel has no `scroll-margin-bottom` (no `scroll-padding`/`scroll-margin` anywhere in `app/`). `block: 'nearest'` therefore lines the panel's bottom up with the viewport's bottom, which sits behind the bar. A panel that opens inside the viewport but behind the bar doesn't scroll at all. Tap any row in the bottom ~56 px plus a panel's height of the screen, and its Citation opens under the bar. Design item 3 asks that "a panel that opens past the fold scrolls into view", and on a phone the fold is the top of the tab bar.
- **Verify:** use Playwright at 390×844 on the generate preview. Scroll until a placed row's bottom is within ~40 px of `[data-tab-bar]`'s top, tap it, and wait 300 ms. Then assert `panel.getBoundingClientRect().bottom <= tabBar.getBoundingClientRect().top`. It fails today. Fix: add `scroll-mb-(--tab-bar-space)` to the `CollapsibleContent` (scrollIntoView respects scroll-margin), or set `scroll-padding-bottom: var(--tab-bar-space)` on `html`. Needs a real phone too: the safe-area inset adds to it on iOS.

### 2. Each toggle re-renders the whole season
- **Quality:** Speed (time from tap to panel)
- **Severity:** low (debt)
- **Where:** `app/routes/training/plan.generate.$eventId.tsx:226` (`usePlanPreviewOpenRow()` in the route component), passed through `WeekCard` at `:363`, `:382` and `PlanPreviewRow` at `:837`. The hook returns a new object every render (`__plan-preview-row.tsx:74-108`, `return { ...state, toggle, close }`).
- **What:** the open-row state lives at the route, and the `openRow` object changes identity on every toggle. So one tap re-renders every `WeekCard` (each one also re-runs `season.sessions.filter`) and every row: 27 weeks × 4 days is 100+ rows. It is fine on a desktop. On a mid-range phone it can delay the first frame of the panel, and the `active:bg-muted` press is already instant, so the tint and the opening can come apart.
- **Verify:** take a React Profiler commit duration on a row tap, on a 27-week preview with 4× CPU throttle. Fix if it matters: memoise `WeekCard`/`PlanPreviewRow` and pass `openKey === key` / `snapKey === key` booleans plus the stable `toggle`/`close`, or hold the state in a small store that rows subscribe to by key.

### 3. A stale reveal timer can scroll to a panel that is already closing
- **Quality:** UI craft (review-animations: interruptibility)
- **Severity:** low (debt)
- **Where:** `app/routes/training/__plan-preview-row.tsx:99` and `:144-153`
- **What:** `revealWhenOpen` arms a `setTimeout(COLLAPSE_OPEN_MS)` on every open and never cancels it. Tap a row and tap it again within ~100 ms: the panel's 150 ms exit is still running when the timer fires at 200 ms. `getElementById` still finds it, and the page smooth-scrolls toward a panel that is collapsing. The same happens when opening row A and then row B quickly: A's timer scrolls toward A's closing panel while B's opens.
- **Verify:** in the jsdom route test, use fake timers. Open, then close at 100 ms, advance to 200 ms, and assert `scrollIntoView` was not called on the closing panel (or check that the panel is not `[data-ending-style]` before scrolling). Fix: keep the timer id in the hook's ref and clear it on the next `toggle`/`close`, or skip a panel that isn't `[data-open]`.

### 4. No test pins the "tapping a row makes no request" claim
- **Quality:** Speed (data requests per interaction)
- **Severity:** low (debt; the code holds it by construction today)
- **Where:** `tests/e2e/mobile-overflow.test.ts` (the new Plan Preview case), `app/routes/training/__plan-preview-row.tsx:18-19` (the docblock claim)
- **What:** the panel renders from `GeneratedSession.provenance` on the payload, and I found no fetcher, link or `useFetcher` in the row. `qualities.md` asks implement to build the measure in where it is cheap, and a request counter on the existing e2e is one line.
- **Verify:** in the new e2e case, record `page.on('request')` around `row.click()` and assert zero document/fetch requests.

## Qualities checked that pass

- **Speed: session page.** `readPlacedProvenance` (`app/routes/training/sessions.$sessionId.tsx:314`) joins the loader's existing `Promise.all`, so it adds no waterfall. It is one `findUnique` by primary key with nested selects (`app/utils/catalogue.server.ts:452`). That is a few internal round trips on SQLite, by PK and unique keys, with an early `null` when there is no Workout. There is no N+1.
- **Speed: Plan Preview and Catalogue.** The loader payload is unchanged. The Catalogue now sends the reading (citation and attribution) instead of pre-worded strings, which is about the same size. The new client modules are small, and no dependency is added.
- **Failure.** There are no outbound calls, so no timeout is owed. A thrown provenance read fails the page like every sibling read in the same `Promise.all`. A missing source or an `unsourced` reading renders nothing, with no placeholder. A taken-down or orphaned row still renders a byline and the non-vouch. Unfilled rows stay non-interactive and visible (#429).
- **Access: keyboard and screen reader.** The row is a real `<button>` (`CollapsibleTrigger`), with `aria-expanded` and `aria-controls` only while the panel is mounted. Its accessible name is the day line and the title, with the `·` separators `aria-hidden` and real spaces between tokens. The chevron is `aria-hidden`. Enter and Space work natively. Escape closes the panel and sends focus back to the row only from the row, its panel or `body`. The closed panel unmounts, so screen readers don't see it. Focus ring: the global `outline-ring/50`, the same as sibling collapsibles. The row is ≥44 px (`min-h-11`, asserted in e2e). The footnote link's hit area grows to 44 px through `after:-inset-y-3.5`.
- **Access: contrast.** `text-muted-foreground` on `bg-muted/60` over the card is about 5.0:1 in light (oklch L 0.52 on ≈0.97) and about 6.7:1 in dark (L 0.723 on ≈0.24), so it holds AA for footnote text. I estimated this from the tokens in `app/styles/tailwind.css:94-95,204-205`; run axe on the open panel to confirm.
- **Security.** The session is owner-checked (`getSessionByIdForUser`) before `readPlacedProvenance` runs. The reader selects only what the slot shows, never `takedownReason` (`catalogue.server.ts` `placedProvenanceRowSelect`). It serves an Attribution's name only through `isPublished`, so a taken-down or orphaned row names nobody. The `description` it reads is only used to classify the kind and is never rendered. `locatorHref` only emits `https://doi.org/…` or an `http(s)` URL, from corpus Citations that athlete rows can't carry (ADR 0051 §4), so no `javascript:` URL can reach the page. External links are `noreferrer noopener`. React escapes all text, and nothing secret reaches the client.
- **Insight.** The one silent-failure path, a placed row that reads `unsourced` (corpus drift), leaves a `console.warn` with both Workout ids (`catalogue.server.ts:483`), in the same style as the rest of `app/utils/*.server.ts`. The session Workout id traces back to the athlete. Every other path is an ordinary absence, not a failure.
- **Data.** No schema change, no migration, no seed. The only write is in the e2e test, which cleans up its stock row in `finally`.
- **UI craft: motion (review-animations, animate).** It reuses `motion-collapse` (200 ms in, 150 ms out, ease-out) and the shared `COLLAPSIBLE_CHEVRON` turn (`duration-press`, `motion-safe`). Press is an instant `active:bg-muted` with no scale, the right choice for a full-width row. Hover goes through the app's gated `hover:` and never opens a panel. A panel above the tapped row snaps shut (`transition-none!`) while `holdInPlace` keeps the row under the finger. The hold lets go on pointerdown, wheel or keydown, and the jsdom test covers that. The reveal is instant under reduced motion. Reduced motion and keyboard toggles follow the app-wide collapse rule (the run's own decisions, ADR 0077 §5 / 0085 §4).
- **UI craft: mobile-native (other than finding 1).** The global baseline covers the tap highlight, `touch-action: manipulation` and `user-select: none` on buttons, and `ROW_PRESS` adds `touch-manipulation`. Overflow at 390 px is asserted for both new surfaces in `tests/e2e/mobile-overflow.test.ts`.
- **UI craft: break-ui.** Long titles, long publisher names and URL locators wrap (`[overflow-wrap:anywhere]` on the row title, the day line and the slot). A date is `whitespace-nowrap`. `sone 4` is held together with an nbsp, and an over-long archetype can still break. The e2e case covers the corpus's longest work with a long URL at 390 px.

## Still needs a real phone

- Finding 1 on iOS Safari with the home indicator (safe-area inset added to the tab bar).
- Whether the snap-close plus `holdInPlace` really keeps the tapped row at 0 px drift on iOS Safari, which has no CSS scroll anchoring. The run probed it in a desktop engine.
- The feel of the press tint and panel opening together on a mid-range Android with 100+ rows (finding 2).
