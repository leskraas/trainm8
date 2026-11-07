# Critic: leskraas/trainm8#587, design run 1 (unattended, one variant)

Steps followed (design-critic.md, word for word in the todo):

1. **Score each variant as built**, open in a browser: Criteria, Craft (`emil-design-eng`), Worst case (`break-ui`, report-only), Fit, Build cost. Done when every variant has all five.
2. **Recommend** the variant that holds the most criteria; between equals, the one that breaks least in the worst case, then the one with the better fit; build cost decides only between variants equal on all three. When no variant holds every criterion, recommend the closest and name, as a decision, what the build must change. With one variant, say whether it holds every criterion and what the build must fix where it doesn't.
3. **Fill the overview** on the canvas as canvas.md says: the verdict strip, the comparison table, the decisions, your scoring in the appendix, and the worst-case board.
4. **Open the designer's pick.** When it differs from yours, put the designer's reason and your answer in one line in the appendix.

Method: Playwright (repo's `@playwright/test`, Chromium, `isMobile`) on `prototype.html` at 390 × 844, 320 × 568, 1280 × 900 and with the root font at 200 %, demo and worst case, every harness state. Probe files: `critic-probe/probe.mjs`, `critic-probe/stale.mjs`, screenshots beside them.

## Recommendation

**In place.** It is the only variant; it holds 8 of the 12 criteria as drawn, 3 partly, and one (lived weeks unchanged) is server behaviour no drawing can show. It does **not** hold every criterion as built. The build must change three things (decisions below), none of which changes the direction.

| Variant | Criteria held | Worst case | Build cost |
|---|---|---|---|
| In place | 8 holds, 3 partly (preview totals, stale refusal, focus after Bekreft), 1 server-only | 1 Broken (stale line off-screen at the thumb), 2 Fragile; no overflow at 320 or 200 % text | not rated (one variant) |

## 1. Criteria (as built)

| # | Criterion | Score | What I saw |
|---|---|---|---|
| 1 | Editable plan: start's chips, pre-filled, retired track not listed | holds | Chips pre-pressed with Løping, Sykling, Styrke 2; main-sport line with Bytt; 1/2/3 radiogroup with roving tabindex and arrows. A retired track is not modelled in the fixtures, but the chips read the plan's current activities only. |
| 2 | Read-only for Event, km/TSS, lifting-only, with one line and the Plan link; no plan, no editor | holds | All four states render; the long Event name wraps; "Ingen plan ennå, så ingen aktiviteter." with no editor. |
| 3 | Vis ny uke: the Monday, kept sessions on their days marked theirs, the start's notes, the start's cap | partly | Monday, Din badges, Fikk ikke plass, Nybegynner cap line all present. But kept sessions are drawn on top of the engine's week (designer's approximation 2): the demo shows **"7 t 30 min i uka"** directly under the editor's **"Timene og dagene blir som før: 6 timer i uka"** (worst: 4 t 15 min vs 3 t), and in the worst case lifts land Wed and Fri beside a kept hard Thursday. The server's stamp decides the real week; the two lines must agree. |
| 4 | Kept count, Pinned days by track and day, cleared overrides by track and Monday, nothing when empty | holds | "Dette endres også" lists each; "2 av dem er sykling, som du tar bort"; "Én økt …" singular; the block is absent when empty. |
| 5 | Identical or empty submit writes nothing and says so beside the editor | holds | Both lines sit under Vis ny uke in a `role=status`. |
| 6 | Made = shown; family kept; none → top option named | holds (as drawn) | Family line names Polarisert 80/20 or "«Bygg grunnform først» (Stor base)". Made = shown itself is the server's (digest + DB test). |
| 7 | Nothing before the boundary changes | server-only | Only "Ukene du har trent, blir som før." under Bekreft. |
| 8 | Authored/adopted stay, those on a removed sport too | holds | Kept Fellestur on Sykling (removed) stays, marked Din, counted. |
| 9 | Removed sport leaves Meg's list; re-adding lays it again | holds | After Bekreft the chips read the new set. |
| 10 | Strength added/removed, frequency cleared | holds | Strength chip off hides the control; clearing the answer is server. |
| 11 | Stale: nothing written, new preview, one line | partly | The new preview and line render, but on a phone the line lands **656 px above the viewport** while the thumb is still on Bekreft, which stays live under it (probe: `critic-probe/390-stale-viewport.png`). A second tap confirms a week the athlete never looked at. |
| 12 | 390 × 844, keyboard, visible focus, 44 px, labels.ts | partly | 0 px overflow at 390, 320 and 200 % text; every target ≥ 44 px; Tab reaches chips and Bekreft (1 Tab from the preview). But after Bekreft **focus falls to `<body>`** (the button is removed). New words are proposed for labels.ts. |

## 2. Craft (emil-design-eng)

| Before | After | Why |
|---|---|---|
| Stale refusal: preview re-rendered, focused with `preventScroll`, the line at its top off-screen | On `preview-stale`, `scrollIntoView({ block: 'start' })` the preview and focus the line (`tabindex=-1`), so the athlete reads it before Bekreft is under the thumb again | A refusal must appear where the user is looking; otherwise the second tap is a blind confirm |
| After Bekreft, focus on `<body>` | Focus the done line (`tabindex=-1`, `role=status`) | Keyboard and VoiceOver users lose their place when the focused button disappears |
| Editor line "6 timer i uka" above a week totalling "7 t 30 min" | Total the server lays; when kept sessions add time, say it: "6 t fra planen + 1 t 30 min av dine" | Two numbers for the same week read as a bug |
| `<hr>` between the activities and the level form, plus a new section heading | Drop the rule; the `space-y-8` gap and the heading with its intro separate them | ui-conventions §1.7: separation comes only from the section gap |
| Section heading "Nivå og økter du liker" under a page titled "Nivå og økter", then legend "Nivå" | A heading that does not repeat the title (e.g. "Svarene dine"), or keep the intro line and drop the heading | Three near-identical labels in one screen |
| No entrance on the preview; press feedback only | keep | Correct: the round trip already took its time; motion would only delay reading |
| Bekreft not sticky | keep | A floating confirm invites a press before the week is read |

## 3. Worst case (break-ui, report-only)

| # | Severity | Field | Worst-case value | What happens | Fix |
|---|---|---|---|---|---|
| 1 | Broken | stale refusal | "Uka endres før Bekreft", 390 × 844 and 320 × 568 | The one line saying the week changed is 656 px above the viewport; Bekreft stays under the thumb; a second tap confirms an unseen week | Scroll the preview top into view (`block: 'start'`) and focus the line on `preview-stale` |
| 2 | Fragile | week total vs hours line | kept 1 t 30 min Fellestur (demo), kept 1 t 15 min threshold (worst) | "7 t 30 min i uka" under "6 timer i uka"; "4 t 15 min" under "3 timer" | Show the server's total and split it when kept sessions add time |
| 3 | Fragile | focus after Bekreft | any confirm | Focus to `<body>` | Focus the result line |
| 4 | Fragile | page length | worst case at 390 × 844 / 320 × 568 | 3.5 / 5.95 screens; Bekreft 1.8 screens below where the preview lands | Accept (designer's stated cost); the preview lands at its own top so reading starts in the right place |
| 5 | Fragile (approximation) | lift days vs kept hard session | worst: kept hard Thursday | Lifts drawn Wed and Fri beside it | Server stamp lays around kept sessions (ADR 0109 §5/§6); the DB test covers it |

Held: 0 px horizontal overflow at 390, 320 and with root font 200 %; long Event name; long lift names; 9 cleared weeks across the new year (no split inside "uke N (dato)"); counts of 1; the Din badge beside a two-line title; the no-op and empty lines; dark mode (designer's shot).

## 4. Fit

It sits well: the chips are the start's, the week is the start's `StartOptionWeekView`, and Vis ny uke → digest → Bekreft → `preview-stale` is Bytt treningsform's flow, so the athlete meets nothing new. Meg becomes the one page that both rewrites the plan and stores answers that don't; the intro line under the second section handles that. As features land: a step-up check (#639) fits in front of Bekreft without moving anything; if hours or days are ever edited here (ADR 0109 open item 7 says not), a third inline flow would push this page past what a phone holds, and the editor should move to its own route then.

## 5. Build cost

Not rated: one variant.

## Decisions for the build (what it must change)

1. **Stale refusal is shown where the thumb is**: on `preview-stale` scroll the preview's top into view and focus the stale line. Rejected: focus only (as drawn), which leaves the line off-screen and Bekreft live. Two-way door. Owner: dev.
2. **The preview's total is the server's and agrees with the hours line**: when kept sessions add time beyond the plan's hours, the facts line says so ("6 t fra planen + 1 t 30 min av dine"); words go in labels.ts. Rejected: a bare total that contradicts "Timene … blir som før". Two-way door. Owner: po.
3. **Focus moves to the done line after Bekreft**. Two-way door. Owner: dev.
4. Drop the `<hr>` and the near-duplicate section heading (ui-conventions §1.7). Two-way door. Owner: dev.

## Designer's pick

Opened after the above: see the appendix line on the canvas and below.
Designer's pick (opened after recommending): **In place**, the same. One difference, on the canvas appendix in one line: the designer keeps a rule so two submits never meet "without a heading between them"; answer: the heading with its intro already does that, and ui-conventions §1.7 puts separation in the section gap alone, so the rule goes.

## Comment for the result

**Critic: recommend In place.** It is the only variant and the right direction (the start's chips and week view, Bytt treningsform's preview → Bekreft), but as built it holds 8 of 12 criteria, 3 partly, 1 server-only. Settled by probe: does the stale refusal reach the athlete on a phone, Playwright at 390 × 844 pressing Bekreft with "Uka endres før Bekreft", it showed the new preview's one line 656 px above the viewport with Bekreft still under the thumb. Settled by probe: does the page hold at 320 × 568 and 200 % text, the same probe, 0 px overflow, every target ≥ 44 px, worst case 5.95 screens. Decisions for the build (all two-way): on `preview-stale` scroll the new preview's top into view and focus its line; the week total is the server's and is split ("6 t fra planen + 1 t 30 min av dine") when kept sessions add time, since the demo shows "7 t 30 min i uka" under "6 timer i uka"; focus moves to the done line after Bekreft (it falls to body today); drop the rule and the heading that repeats the page title (ui-conventions §1.7). Kept sessions drawn on top of the engine week are the designer's approximation; the server's stamp and the made = shown DB test decide the real week. The designer's pick is the same.
