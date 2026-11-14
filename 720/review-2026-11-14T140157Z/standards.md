# PR #720 (closes #475): Standards review

Diff: `git diff origin/main...origin/agent/475-build-the-review-surface` (27 files, +1572/-261, 22 commits). Head `ce79486`. Phase `poc`.

## Standards sources read

- `CLAUDE.md`: guard files, `--no-verify`, exact dependency versions, UI craft rule (Emil skills), production seed rule.
- `.sandcastle/CODING_STANDARDS.md`, the only CODING_STANDARDS in the repo (no CONTRIBUTING).
- `docs/agents/domain.md`, `GLOSSARY.md`, and the ADRs this diff touches or cites: 0028, 0030, 0051 (§5, §9), 0053 (§4, §7), 0077, 0081, 0085, 0119, 0121.
- `docs/design/design-system.md`, `docs/design/ui-conventions.md`, `docs/icons.md`, `docs/agents/production-seed-data.md`.
- `.claude/skills/{icon-workflow,domain-modeling/ADR-FORMAT.md,review-animations/STANDARDS.md,animate,mobile-native,emil-design-eng,apple-design}`.
- `$B/references/qualities.md` and `$B/references/questions.md` (the `poc` bar).
- The smell baseline in `.claude/skills/code-review/SKILL.md`.

## Merge-safety (numbered files)

- **ADR:** the branch adds `docs/adr/0122-…`. Main's highest ADR is 0121, which main added after the merge-base. `git merge-tree --write-tree origin/main origin/agent/475-…` merges cleanly (tree `73ff7bc`). The merged tree has no duplicate ADR prefix.
- **Migrations:** the diff has none, and the merged tree has no duplicate migration prefix.
- No stale "ADR 0117" provenance references remain from the commits that used that number before the rename. Every `0117` hit at head is the load-recompute ADR.
- Verify: `git merge-tree --write-tree origin/main origin/agent/475-build-the-review-surface`, then `git ls-tree --name-only <tree> docs/adr/ | cut -c10-13 | sort | uniq -d` returns nothing.

## Hard checks that pass

- **Guard files:** untouched (`.github/**`, `.claude/**`, `AGENTS.md`, `CLAUDE.md`, `fly.toml`, `other/**`).
- **Dependencies:** `package.json` is not in the diff, so nothing new was added.
- **ADR format:** ADR 0122 follows the format of 0120 and 0121 (status line with narrows/records, Context, Decision, Considered options, Consequences).
- **ADR narrowing notes:** the notes added to 0030, 0051 and 0053 follow the house "Narrowed by" convention. Their § references resolve: 0053 §7 holds "walking the chain", 0051 §5 holds `resolveCatalogueOrigin`, and 0030 holds rule 3.
- **Glossary terms:** the diff uses **Plan Preview**, **Session Provenance**, **Citation** and **Attribution**. "Generate preview" is now listed under _Avoid_, and no new code uses it.
- **Wording in `labels.ts`:** every athlete-facing word comes from `labels.ts` (ADR 0081, ui-conventions §4). The new key is `NB_PROVENANCE_LABELS.adopted`. The taken-down mark reuses `CATALOGUE_LABELS.publishState['taken-down']`.
- **Type steps (design-system):** row title is `text-callout`, day line and slot are `text-footnote`.
- **Radius steps:** row press is `rounded-2xl`, the panel well is `rounded-3xl`.
- **Hover and press:** hover is gated app-wide. The row has an instant `active:` tint through `ROW_PRESS` with `motion-safe:active:duration-0`.
- **Target size:** the row is a real 44px target (`min-h-11`), and an e2e test asserts it.
- **Motion:** `motion-collapse` is the sanctioned collapsible motion. The snap-shut path uses `transition-none!`. Reduced motion is handled.
- **Speed (qualities.md):** `readPlacedProvenance` runs inside the loader's `Promise.all`, so it adds no waterfall.
- **Security (qualities.md):** `takedownReason` is never selected. The publisher's name goes through `isPublished`.
- **Insight (qualities.md):** an unsourced placed row is logged with both ids.
- **Seed data:** the verify doc's "`prisma db seed` on a fresh local database" is local-only. That matches ADR 0051 §9 (the Catalogue is seeded by the seed script) and does not conflict with the CLAUDE.md production rule.

## Findings

No critical, high or medium findings. Everything below is low. The `poc` bar sends a PR back only for high or critical findings, so these are debts or nits.

### 1. ProvenanceSlot is a union plus flags (low, documented standard plus judgement)

- **Where:** `app/components/provenance-slot.tsx:68-69` and `:134`.
- **Rule broken:** `.sandcastle/CODING_STANDARDS.md` "Components & UI": "Compose, don't fork. If a component grows boolean prop sprawl, refactor to compound components or `children`…". The same rule appears under Architecture: "Prefer composition … over configuration-by-flags".
- **What happens:** the slot takes `adopted`, `takenDown` and `adaptedFrom` beside the `SessionProvenance` union. `takenDown` only means something on the `community` branch, so the component re-guards `provenance.kind === 'community' && takenDown`. A test exists just to prove the impossible combination is dropped (`provenance-slot.test.tsx`, "a taken-down mark never lands on a corpus row").
- **Smells (judgement):**
  - Possible Data Clump: `{ provenance, takenDown }` travels as a pair from `readPlacedProvenance` (`app/utils/catalogue.server.ts`) through the session loader into the slot.
  - Possible Primitive Obsession: a boolean stands in for a state of the community branch.
- **Fix:** carry `takenDown` on the community branch of the reading, or have callers compose the extra lines as children.
- **Verify:** read the props block. `takenDown` is accepted for every `kind`.

### 2. The chevron is an inline SVG, not the sprite `Icon` (low, documented standard)

- **Where:** `app/routes/training/__plan-preview-row.tsx:157-177` (`Chevron`).
- **Rule broken:** `icon-workflow` SKILL "Workflow (icons only)" step 4: "Render via `Icon` component in app code". The same rule is in `.sandcastle/CODING_STANDARDS.md` "Icons".
- **Mitigation:** the code comment gives the reason. The sprite's `chevron-down` hard-codes `stroke-width="2"` on its path (`other/svg-icons/chevron-down.svg`), and that cannot be overridden through `<use>`. `other/**` is a guard file, so an agent could not add a hairline variant. The deviation is reasoned, but it is still a second icon path.
- **Fix:** a human adds a 1.25-stroke chevron to `other/svg-icons`, or accepts the inline glyph and records it.
- **Verify:** `cat other/svg-icons/chevron-down.svg`.

### 3. The link's hit area can overlap the card's action row (low, documented standard)

- **Where:** `app/components/provenance-slot.tsx:125` (`after:absolute after:inset-x-0 after:-inset-y-3.5`).
- **Rule broken:** `docs/design/ui-conventions.md` §2.2: "In dense clusters … adjacent extensions are trimmed rather than overlapped".
- **What happens:**
  - On the Catalogue card, the slot's locator link is the slot's last line for a corpus row. It is followed by `mt-3` (12px) and the `size: 'sm'` action buttons, which carry their own `after:` hit area (`app/routes/training/catalogue.tsx:346-352`). The link's 14px downward extension crosses the 12px gap into the buttons' area.
  - A URL locator also wraps over several lines (`[overflow-wrap:anywhere]`). An absolutely positioned `after:` on a fragmented inline `relative` box has an ill-defined horizontal extent.
- **Verify:** at 390px, open `/training/catalogue` on a cited row with a `doi:` locator and inspect the link's `::after` box against _Legg i kalenderen_. Also tap the bottom edge of the link.

### 4. ADR 0122 §3 states a rule the code does not hold, and a test pins the opposite (low)

- **Where:**
  - `docs/adr/0122-…md:41-46`: "a generator that places one must show its non-vouch on the row".
  - `app/routes/training/__plan-preview-row.tsx:296`: the panel renders the full slot behind the tap for any `kind`.
  - `app/routes/training/plan.generate.$eventId.route.test.tsx:276`: the test is named "…carries the non-vouch", but reaches the non-vouch only after `user.click(row)`.
- **Why it is only low today:** ADR 0053 §4 (stock rows only) means no community row reaches the preview. But the payload type admits one, and the test now locks in the behaviour §3 forbids. No guard or assertion ties the two together.
- **Rule broken:** `docs/agents/domain.md` "Flag ADR conflicts".
- **Fix:** show the non-vouch on the row for `kind === 'community'`, or drop the community case from the preview test.
- **Verify:** read the test and ADR §3 side by side.

### 5. Possible Repeated Switches on `SessionProvenance['kind']` (low, judgement)

- **Where:**
  - `provenance-slot.tsx` `nbProvenanceSentence` (switch).
  - `app/utils/plan-generation/provenance.ts:166` `provenanceSentence` (its English twin).
  - `provenance.ts:110-125` `withoutProvenanceNotice` (ternary on `convention`/`hand-written`).
  - `app/routes/training/__catalogue-card.ts:29`: `catalogueBlurb` loops over both kinds and calls `withoutProvenanceNotice` once per kind, regardless of what the row is.
- **Smell:** the `kind` → notice mapping now lives in three places.
- **Fix:** one `kind → { notice, nb, en }` map shared by all three, plus a `stripAnyProvenanceNotice(text)` for the Catalogue blurb.
- **Verify:** grep `kind === 'convention'` and `case 'convention'` at head.

### 6. Tests locate by data attribute and use the real clock (low, documented standard)

- **Data-attribute locators:**
  - `tests/e2e/mobile-overflow.test.ts:209,211,215,432` uses `[data-session-row] > button`, `[data-provenance-panel]` and `[data-provenance]`.
  - `plan.generate.$eventId.route.test.tsx:170` uses `document.querySelector('[data-provenance]')`.
  - The row has a role and an accessible name (the route tests already use `getByRole('button', …)`).
  - Rule broken: `.sandcastle/CODING_STANDARDS.md` "Testing": "role-based locators … not by `data-testid` unless there's no semantic alternative".
  - Mitigation: the e2e file already used `[data-plan-guards]` and similar, so the file's own precedent softens this.
- **Real clock:**
  - `catalogue.server.test.ts` uses `new Date()` for `adoptedAt`, `takenDownAt` and `retiredAt`.
  - The e2e test uses `Date.now()` offsets.
  - Rule broken: CODING_STANDARDS "No real clock".
  - None of these values is asserted on, so this is a nit.

### 7. The programmatic smooth scroll is motion outside the token table (low, judgement)

- **Where:** `app/routes/training/__plan-preview-row.tsx:144-155` (`revealWhenOpen`).
- **What happens:** 200ms after a tap, a panel past the fold is scrolled to with `behavior: 'smooth'`, on the browser's own curve and duration.
- **Rule (judgement):** `docs/design/design-system.md` Motion: "Only `transform` and `opacity`, apart from `motion-collapse`". Its tokens own every duration and curve. A programmatic smooth scroll falls outside that table. Reduced motion does get `instant`.
- **Related:** `holdInPlace` (`:117-138`) counts `HOLD_FRAMES` at 60 Hz, so at 120 Hz the hold lasts 100ms. That is harmless, because the panel above snaps shut in one frame.
- **Verify:** on a phone, open a row near the bottom of week 4. This needs a real phone.

### 8. The `season-plan.md` hunk changes an unrelated bullet (info, judgement: Divergent Change)

- **Where:** `docs/agents/verify/features/season-plan.md:11-19`.
- **What happens:** the hunk repairs a bullet that main had duplicated and misplaced (the Week Pattern editor text). The fix is right, but it is outside #475.

## Not verifiable from this read

- **CLAUDE.md "UI craft":** a UI change must say in the PR what still needs a real phone, and must have run `review-animations`, the `mobile-native` checklist and `break-ui`. This read was told not to read the PR body (`hidden.pr_body: true`), so whether that statement is present is unchecked.
- **Real-phone checks** this diff needs: the press tint and its 160ms release, the hold-in-place when a panel above snaps shut, the smooth reveal, and the hit area of a wrapping URL locator.

## Smell baseline: nothing else found

None found for:
- Mysterious Name: `snapKey`, `Sep` and `planPreviewRowKey` are documented or obvious.
- Duplicated Code: the old inline slots in three routes were folded into one component.
- Feature Envy, Message Chains, Middle Man, Refused Bequest.
- Shotgun Surgery: the three call sites move together by design (ADR 0122 §4).
- Speculative Generality: `adaptedFrom` has a real caller, the Catalogue.
