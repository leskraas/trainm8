# Critic: #672 design (part 3)

## Todo (design-critic.md, word for word)

1. [x] **Score each variant as built**, open in a browser:
   - **Criteria**: per acceptance criterion, `holds`, `partly` or `misses`, with what you saw.
   - **Craft**: call the Skill tool with `bredvid-design-engineering:emil-design-eng`, and name the details that would make it feel wrong in use.
   - **Worst case**: call the Skill tool with `bredvid-design-engineering:break-ui` in report-only mode, and keep what broke with the fix for each.
   - **Fit**: how it sits with the rest of the product, and how it holds as the next features land on it.
   - **Build cost**: as given.

   Done when every variant has all five.
2. [x] **Recommend** the variant that holds the most criteria; between equals, the one that breaks least in the worst case, then the one with the better fit; build cost decides only between variants equal on all three. When no variant holds every criterion, recommend the closest and name, as a decision, what the build must change. With one variant, say whether it holds every criterion and what the build must fix where it doesn't.
3. [x] **Fill the overview** on the canvas as ../references/canvas.md says: the verdict strip, the comparison table, the decisions, your scoring in the appendix, and the worst-case board.
4. [x] **Open the designer's pick.** When it differs from yours, put the designer's reason and your answer in one line in the appendix.

## Recommendation

**Under the card.** It holds all 9 acceptance criteria in the prototype. The build must fix two things the prototype carries over from today's code: the notices' `role="alert"` and the close button's 72 px right padding down the whole notice.

## How I checked

- I drove `prototype.html` (v=2, Demo, Worst case and Ingen merknader, light and dark) with the repo's Playwright at 320×700, 390×844, 768×1024 and 1440×900. Probes: `critic-probe.mjs` → `critic-probe.json`, and `critic-probe-padding.mjs` → `shots/critic-padding-probe-390-worst.png`.
- I read the code the variant touches: `__season-notices.tsx` (`DismissibleNotice`, the three notices and their links), `__blocks-reading.tsx`, `__plan-advanced.tsx`, `plan.tsx` (loader and resting line), `app/components/ui/alert.tsx`, ui-conventions §2.2, and ADR 0101 §2.
- I re-used the designer's `measure.json` for dismissal, Avansert-open, 320 px and 200 % zoom. Copy comes from `labels.ts` through `gen-copy.ts`.

## 1. Scoring: Under the card

### Criteria

| # | Criterion | Score | What I saw |
|---|---|---|---|
| 1 | Ramp Guard in the lead, Avansert closed, same content, no tap | holds | The ramp notice is the first item of `[data-plan-guards="lead"]` directly under the card. Its copy comes from `SESONG_NOTICE_LABELS` unchanged. At 390 it starts at 579 px (demo) or 653 px (worst). At 320×700 it starts at 737 px, which is a scroll but not a tap. |
| 2 | Same for availability fit and band fit | holds | All three show in the lead in the order ramp, availability, band, including the no-capacity line, clashes and four band sessions. |
| 3 | Each notice once; Avansert/Blokker has no second copy | holds | With Avansert open: 3 notices on the page and 0 in `[data-blocks-reading]` (`measure.json` `onceWithAvansertOpen`). |
| 4 | Dismissible as today, back on next visit | holds | Closing one leaves 2 notices, and focus lands on the sr-only "…er lukket" line. After a reload all 3 are back. `DismissibleNotice` and its re-keying are unchanged. |
| 5 | No warnings: no notice, heading or space | holds | With Ingen merknader there is no `[data-plan-guards]`, and `leadBottom` matches today's (567 / 537 px). The stack has no heading. |
| 6 | A plan that is not the active one shows its own warnings | holds (by construction) | The prototype only shows the resting case. In the code, `plan.tsx`'s loader builds one `season` from `?event=` or `?outline=`, and both the lead and Blokker read it. The build has to prove this in `plan.route.test.tsx` for `?outline=` and `?event=`. |
| 7 | Fix links work from the lead | holds | The only links are `/settings/profile` and `/training/sessions/:id`, and both are absolute routes that work from anywhere. No notice links into Avansert today, so "Avansert included" has nothing to test. A phase deep link is a follow-up, as the designer says. |
| 8 | 390×844: no overflow, ≥44 px targets, `text-base md:text-sm` | holds | Overflow is 0 at 320, 390, 768, 1440 and 200 % zoom. Close buttons are 44×44 and links 44–45 px tall. Text is 16 px, or 14 px from md. My probe: the links' `::after` areas never overlap at any width, and every sampled point on a link's glyph box hits that link. |
| 9 | Ramp copy a convention, no injury claim; Norwegian, in `labels.ts` | holds | The copy is unchanged and comes from `app/utils/labels/sesong.ts`. |

**9 of 9 hold.**

### Craft (emil-design-eng)

| Before | After | Why |
| --- | --- | --- |
| Notices keep `Alert`'s `role="alert"` (`alert.tsx`), now rendered on every visit to Plan | `DismissibleNotice` passes `role="note"` (or no live role) to `Alert` | Today Radix `Collapsible` keeps them unmounted while Avansert is closed, so they are never announced. In the lead they mount on each client-side navigation to Plan. A screen reader then reads three long notices assertively and talks over the page. They are standing content, not news. **Build must.** |
| `pr-18` (72 px) reserved for the close button for the notice's full height: the text column is 268 of 358 px at 390, and 198 of 288 at 320 | Only the first line clears the button: `pr-4` on the notice, `pr-10` on the first child | Text runs short, ragged lines under an empty gutter. This is the variant's main cost (push-down), and it makes that cost worse. My probe: the worst-case stack goes from 1,874 to 1,634 px at 390, and from 2,474 to 2,042 px at 320. Demo goes from 870 to 774 px. **Build must** (spacing is already in scope). |
| Fact lines `muted-foreground` like the explanation | Fact lines `text-foreground`, explanation muted (designer's decision) | The warning reads before its reason. Agree. |
| `inline-flex min-h-11` on inline links (the resting line's idiom) | Invisible `::after` at −13 / −14 px (designer's decision) | It matches ui-conventions §2.2 for inline text links and causes no mid-sentence gap. Agree. Directly above the notices, the resting line's "Åpne løpsplanen" still uses `min-h-11` and still has the 20 px gap. Make that a follow-up, not this build. |
| — | No motion on dismissal (designer's decision) | Dismissing happens rarely and the notice is gone the moment you close it, so instant is right. Agree. |

### Worst case (break-ui, report only)

| # | Severity | Field | Worst-case value | What happens | Fix |
|---|---|---|---|---|---|
| 1 | Ugly | notice text column | worst case at 320 px | `pr-18` narrows the text by 25 % for the whole height. The availability notice is 1,050 px tall. | First-line-only clearance (craft row 2): −432 px at 320. `__season-notices.tsx` `DismissibleNotice` |
| 2 | Fragile | band sessions (`seasonBandWarnings`, `training.server.ts:1211`, unbounded) | a 12-week hypertrophy block, 2 sessions a week, all authored at 92.5 % 1RM → 24 lines | About 100 px per line at 390, so the band notice alone is about 2,500 px and Bibliotek/Avansert sit about 4,000 px down. Today that length hid inside Avansert. | Not in this build: content is out of scope. Follow-up: one band line per block and goal ("uke 47–58: 24 økter…"). Decisions, line 5. |
| 3 | Fragile | fold | 320×700, worst case | The first notice starts at 737 px, so no notice is on the first screen. At 390 the worst case shows a 127 px peek. | No change now; it is a scroll, not a tap. Check it on a real phone and revisit the designer's rejected count line only if the peek is missed. |
| 4 | Fragile | push-down figure | worst case at 390 | The measured stack is 1,874 px, not the ~1,750 px the cost line states. | Correct the number on the canvas (done). |

**What held:** a 44-character phase name, the lifting line, the "Uke 52–1" span, the no-capacity link and dark mode show no overflow at any width or at 200 %. The no-warnings state leaves nothing behind. The dismissed sr-only line leaves no flex gap. Adjacent band links' hit areas don't collide.

### Fit

- **ADR 0101 §2.** The order becomes: name, curve, actions, *Bytt treningsform*, the resting line, then **the guards**, then Bibliotek and Avansert. The plan comes first and the warnings about it come right after, before anything else. This matches ADR 0101 §3 for I dag, where the Autopilot Notice follows the today card. The two tabs now share one pattern: a notice follows the card it is about.
- **#429.** Nothing is behind a tap any more, and that was the whole point of the issue.
- **Next features.** `PlanGuardNotices({season})` is the one slot, so a fourth guard lands in the same stack with no new layout. The readings (mix-disagreement, "what the plan cannot tell") stay in Avansert, which is correct. A ramp line now sits far from its phase card. The phase deep link follows up on that, and the separation isn't something this build can fix.
- **Risk.** The lead's length now depends on warning count (worst case row 2). If the band follow-up is skipped, the lead becomes the longest part of Plan for a strength-heavy athlete.

### Build cost

As given: no part 2 run (one variant). It touches `plan.tsx`, `__plan-lead-card.tsx` (a notices slot), `__blocks-reading.tsx` (removal), `__season-notices.tsx` (`PlanGuardNotices`, spacing, sizes, `text-foreground`, `::after`), and an ADR 0101 §2 amendment. Tests: `mobile-overflow` e2e and `plan.route.test.tsx`. My two build-musts only add to `__season-notices.tsx` and one test assertion.

## 2. Recommendation and what the build must do

**Recommended: Under the card. It holds 9 of 9 criteria and is the only variant.**

The build must:
1. Give the guard notices a non-live role (`role="note"` through `DismissibleNotice`), and test it in `plan.route.test.tsx`. Otherwise every visit to Plan announces three notices assertively.
2. Clear the close button with the first line only, not the whole notice (`pr-4` on the notice plus `pr-10` on the first child, or the equivalent). This cuts 240 px off the worst case at 390.
3. Assert in `plan.route.test.tsx` that `?outline=` and `?event=` show that plan's guards in `[data-plan-lead]`, and none in Blokker.

Follow-ups, not this build: band lines grouped per block (worst case row 2); the phase deep link from a ramp line; the resting line's `min-h-11` link moved to the `::after` idiom.

## 3. Designer's pick

Opened after writing the above. The designer also picked **Under the card**, because it puts every guard in the lead with no tap and the card still reads at a glance. Same pick, so there is no disagreement. Both of us want the peek checked on a real phone.

## Canvas

I filled the overview in `canvas.html` by editing `build-canvas.py` and rebuilding (the designer's original is kept as `build-canvas.designer.py`): the verdict strip, the comparison rows (cost figure, criteria, worst case, build cost), three new decisions, the critic's scoring, craft, fit and pick in the appendix, and the critic's worst-case findings with the padding-probe shot. Status stays `Current` for part 4 to set to `Chosen`. `check-canvas.mjs`: no errors, overflow 0 at 390 and 1440.

## Comment text

**Critic: Under the card, recommended (9/9 criteria; the designer agrees).** All nine criteria hold in the prototype at 320, 390, 768 and 1440 px and at 200 % zoom. Criterion 6 holds by construction, because one loader `season` feeds both the lead and Blokker. The build must fix two things today's code carries into the lead. (1) The notices use `Alert`'s `role="alert"`. In the lead they mount on every visit, so a screen reader would read all three aloud each time; use `role="note"`. (2) The 72 px close-button gutter runs the full height and narrows the text by 25 %; clear only the first line. That cuts the worst-case stack from 1,874 to 1,634 px at 390. Add route tests that `?outline=` and `?event=` show their own plan's guards in `[data-plan-lead]` and none in Blokker. Follow-ups, not this build: band lines have no limit (24 off-band sessions make a notice of about 2,500 px), so give one line per block; a phase deep link from each ramp line; and the resting line's `min-h-11` link moved to the `::after` idiom. Needs a real phone: whether the peek above the tab bar is enough (at 320×700 no notice is on the first screen).
