# #528 design, part 3: Critic

## Todo (design-critic.md, word for word)

1. [x] **Score each variant as built**, open in a browser: Criteria, Craft (emil-design-eng), Worst case (break-ui, report-only), Fit, Build cost. Done when every variant has all five.
2. [x] **Recommend** the variant that holds the most criteria; between equals, the one that breaks least in the worst case, then the one with the better fit; build cost decides only between variants equal on all three. When no variant holds every criterion, recommend the closest and name, as a decision, what the build must change. With one variant, say whether it holds every criterion and what the build must fix where it doesn't.
3. [x] **Fill the overview** on the canvas as ../references/canvas.md says: the verdict strip, the comparison table, the decisions, your scoring in the appendix, and the worst-case board.
4. [x] **Open the designer's pick.** When it differs from yours, put the designer's reason and your answer in one line in the appendix.

Method: read the issue (trusted, owner), role-steps.diff, zones.json and contrast.py, the tailwind.css type tokens, and the captured states in shots/ (role-steps, role-steps-worst, recon/proto-zones-*) instead of re-rendering; one grep of the checkout for zone usages, tabular-nums and full-strength dividers.

## Recommendation

**Role steps, with the build fixes below.** It is the only variant, and it does not hold every criterion as drawn: it holds AC6 and AC9, partly holds AC1–5 and AC8, and leaves AC7 and AC10 to the build. Nothing it changes breaks in the worst case, and its role map is a rule the next page can follow.

## Ruling on the zone contradiction

**Change both light and dark zone values; AC6 wins over the Scope line.** AC6 says "in both themes each reaches 3:1 against card". Today's light hues measure 2.79 / 2.78 / 2.04 / 2.67 / 3.85 on card (zones 1–5; contrast.py), so with light values frozen AC6 cannot hold for zones 1–4. The Scope line ("changing the tokens' values other than the zone hues' dark values") was written to keep the luma tokens from drifting, not to protect a light zone ladder that fails WCAG 1.4.11. The proposed light values reach 3.93 / 3.88 / 3.23 / 3.96 / 5.36 and dark 7.25 / 7.60 / 8.36 / 7.48 / 5.55, all in sRGB gamut, and the hue ladder stays readable (blue, green, mustard, orange, red; recon/proto-zones-role-steps-*.png). The zones are only used as fills (profile-bars, shape-strip) and as 22–26 % tints in score-stanza, so no zone is text; darker light values make the chip tints a touch deeper, and chip text stays at 14–15:1.

- **Door**: one-way, owner `po`, as the designer says: athletes see zone 3 turn from sunny yellow to mustard, and the spec's own Scope excludes it, so no criterion names it (questions.md: "something users see that no acceptance criterion names"). Autonomy is full, so the factory decides it; the run records it.
- **Spec text: yes, a one-line fix.** In Out of scope, "changing the tokens' values other than the zone hues' dark values" becomes "changing the tokens' values other than the zone hues' light and dark values"; the Training Zone decision's "add .dark values at ≥3:1" becomes "set light and dark values at ≥3:1". Record this as a decision so the PR is checked against the corrected text.

## Scoring: Role steps

### Criteria

| AC | Verdict | What I saw |
| --- | --- | --- |
| 1 Radius steps | partly | Cards 16, fields/popovers/steppers 13, items 11, chips round on all 9 captured states. The first run, Bibliotek, events and imports are swept in the diff but not captured. The inline archetype word token gets `rounded-2xl`; fine as a focus shape. |
| 2 Type scale, one page title, three steps | partly | Heading 18 / callout 15 / footnote 13 read as three steps on Plan and the session page. **Lift page breaks "one page title"**: the PageHeader h1 ("Tallene dine for løftet", heading 18) sits directly over the exercise name at the same size, so neither reads as the title (role-steps-worst/lift-light-mobile.png). The exercise picker keeps raw `text-base md:text-sm` under an eslint-disable, which the AC's "no raw size left" does not allow on its face. |
| 3 Tabular figures | partly | The sweep adds `tabular-nums` only to Plan's span figure; the rest relies on what is already there (80 files). Week numbers, kg, sets × reps not audited. Norwegian comma and thin-space thousands hold ("1 107,8 km/uke"). |
| 4 Card surfaces, low-opacity rules | partly | Bordered boxes in cards and popovers become muted wells; list groups get `shadow-md` and `divide-border/60`. About 61 lines in page code still carry full-strength `divide-border`/`border-border` (grep, includes some non-row borders). |
| 5 Empty state, validation, form errors | partly | `__empty-state`, `__validation-summary` and `forms.tsx` follow the map in code, and errors move to `text-foreground-destructive` (AA in both themes, where `text-destructive` is 4.44 on the light page). None of the three is captured. |
| 6 Zone hues ≥3:1 both themes | holds | With the light change (ruling above): light 3.23–5.36, dark 5.55–8.36; spread 1.66 / 1.51, no glowing zone in dark. |
| 7 /design and design-system.md | misses as drawn | Build work: /design swatches in both themes, the role with its contrast numbers, "temporary" removed, ADR 0085 §2 amended. |
| 8 390×844, no sideways scroll, 44px, no new motion | partly | 0 overflow on 9 states × 2 widths × 2 themes; no motion class changed. Not measured: the text actions "+ notat", "Ulike sett ▸", "+ blokk" and the red × in the sets popover look under 44px tall. |
| 9 Worst case | holds | 40-character exercise name wraps to three lines in the picker (today it clips to "Bulgarsk splittkneb"), and fits on the lift page; 80-character session title wraps to five lines at title; 1 373,8 km/uke fits the week row; æøå labels at caption render. |
| 10 Lint rule | build | Not drawn. |

### Craft (emil-design-eng)

| Before | After | Why |
| --- | --- | --- |
| Lift page: PageHeader h1 at `text-heading`, exercise name also at heading size | Exercise name at `text-title`, as on the session page | Two equal headings stacked reads as no title; the role map already says the lift is the page's title |
| `text-xs` → `text-caption` everywhere | Keep `caption`, but where the old `text-xs` was muted helper text add `font-normal` | Caption carries weight 500; muted helper lines turning medium make small text louder than the row facts above them |
| Sets popover footer: "+ notat" and "idrett" labels on different baselines | `items-baseline` (or `items-center`) on that row | The one misaligned row in an otherwise tidy popover is what the eye lands on |
| Steppers: outline − / + buttons beside borderless filled value wells | Accept (primitive `Button` outline), but keep the value well and the select the same fill | One field look is the gain; the button outline is the primitive's, so leave it, just don't add a third look |
| Dark zone values inserted in the middle of the track-ink block in tailwind.css | Group `--zone-*` in `.dark` under its own comment, and drop "Older app token" from the light block | The token is now a documented role; the CSS should say so |
| `--zone-*` comment "still read outside home" | "Training Zone hues, an app role (ADR 0085 amended)" | The comment is the first doc a dev reads |

No motion changed; review-animations' verdict in the canvas (no Block) stands.

### Worst case (break-ui, report-only)

| # | Severity | Field | Worst-case value | What happens | Fix |
| --- | --- | --- | --- | --- | --- |
| 1 | Ugly | lift page title | "Bulgarsk splittknebøy, manualer og pause" | Fits, but sits at the same size as the header above it | `text-title` on the lift name (settings/training/lifts.$exerciseId.tsx) |
| 2 | Fragile | `PageHeader` h1 | a long route title | Still `truncate`; fine for "Økt", but any content name passed as `title` would be cut with "…" (AC9) | Keep content names out of `PageHeader`, or swap `truncate` for `line-clamp-2` + `title` (components/page-header.tsx:55) |
| 3 | Fragile | Plan week, expanded | Uke 44 open | Shows only the labels "Løping, km/uke" / "Styrke, sett/uke" with no values in the capture; likely a capture of a lazy editor, not a break, but unverified | Re-capture the open week in the build's verify pass |
| 4 | Fragile | session title | 80 characters | Wraps to five lines at `title`; readable, the status chip stays top-right | None needed; note for a real phone |

Held up: the exercise picker wrap (a real fix of today's clip), four-digit km with the Norwegian space and comma, the 80-character title, no sideways scroll anywhere captured, dark mode on every state.

### Fit

Good. The role map (what text does → step) and the radius-by-element rule are the same rules I dag uses, so a new page has one lookup table, and the lint rule (AC10) can name the step from the class it rejects. The zone ladder as a documented role gives the season chart and score a fixed base. The risk is the regex sweep: the build must redo it by hand per file, as sweep.py itself says, because `text-sm font-medium` → callout will also catch labels that are not row titles.

### Build cost

None given (one variant).

## Decisions the build must carry

1. **Zone hues**: light and dark values both change, to the designer's oklch values; one-way, owner po, decided by the factory under full autonomy.
2. **Spec text**: one-line fix in Out of scope ("the zone hues' light and dark values") and in the Training Zone decision ("set light and dark values").
3. **Lift page title**: the exercise name at `text-title`; PageHeader stays at `heading`.
4. **Exercise picker**: keep the mirrored `text-base md:text-sm` with an `eslint-disable` that names `ui/select`'s trigger; AC2's "generated primitives keep their own" covers a mirror of one. Two-way.
5. **Build checks the uncaptured surfaces**: Plan empty state, validation summary, form errors, first run, Bibliotek, events, imports at 390 in both themes; 44px on the sets popover's text actions; tabular figures on week numbers, kg and sets × reps; remaining full-strength row dividers to `/60`.
6. Fold the ~15–19 shared-component lines the spec's inventory missed into the build (page-header, overlay-header, score-stanza, token-popover, load-legend, load-metric-badge, forms, tab-bar, profile-bars).

## Designer's pick

Opened after the above. See the end of this file.

Designer's pick: **Role steps**, the same as mine. One difference in degree: the designer would ship the new light zone values only with the owner's yes or a one-line spec fix; my answer is both the spec fix and a recorded one-way decision taken by the factory under full autonomy, so the run does not wait. On the designer's watch items: Meg with no `title`-sized text is fine, because its `PageHeader` heading is the one page title there; `shadow-md` on Meg's groups goes on the real-phone list.
