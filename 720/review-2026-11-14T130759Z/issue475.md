Build the review surface: take #437's provenance design from prototype to a real screen
open ['ready-for-human']
## Problem

An athlete whose sessions come from the **Catalogue** cannot reliably tell where a session came from, and the two places that should tell them disagree.

- **After placement the source is gone.** A session copied from a Catalogue row, by **Plan Generation**, by placing it from the Catalogue (#470) or by a swap, keeps a back-pointer to its row (`Workout.copiedFromId`), yet the session page (`app/routes/training/sessions.$sessionId.tsx`) never reads it. An athlete living with a generated season sees no **Citation** for any of its sessions. An athlete who placed a **community** session read the non-vouch once on the place screen and never sees it again: on their calendar it reads like any session trainm8 stands behind.
- **Before approval the source is asserted on every row.** The generate preview (`/training/plan/generate/:eventId`, `SessionRow` in `plan.generate.$eventId.tsx`) prints the source line under every placed session, the always-on treatment #437 rejected for exactly this week. At 27 weeks x 4 days the line doubles the height of a season the athlete is trying to read for its shape.

The rule #437 settled, **provenance is available, not asserted**, holds on neither screen and is recorded nowhere but a closed issue, so each new surface rediscovers it.

## Acceptance criteria

- [ ] On `/training/plan/generate/:eventId`, a placed session's row shows its day, sport, kind, zone and title, and no source line. The whole row is one control at least 44 px tall whose accessible name names the session, with a hairline chevron as its only extra mark.
- [ ] Tapping a placed session's row (or Enter or Space on it) opens that session's **Session Provenance** directly below the row: the Citation (author, work, year and a locator) for a corpus row, and the convention or hand-written notice, in their own words, for those two kinds. Tapping the same row again, pressing Escape or opening another row closes it; at most one is open.
- [ ] Everything the preview shows today apart from the source line is still visible without a tap: each slot the Catalogue could not fill stays a visible unfilled row in its week, the absences and the capacity fit stay stated above the season, and each week's numbers stay on the week. Nothing that warns or qualifies a number moves behind a row's tap.
- [ ] On a session's page, a session whose Workout was copied from a Catalogue row shows its Session Provenance in one quiet line after the session's numbers: the Citation for a corpus row, the convention or hand-written notice for those kinds, and for a community row the publishing athlete's name (or that an athlete published it, where no name can be shown), with the non-vouch on a second line directly below it.
- [ ] The two slots stay apart: a community session's line never shows a Citation's fields and always carries the non-vouch, and a corpus session's line never shows an **Attribution** or the non-vouch. A session copied from a community row that was later taken down still says an athlete published it and trainm8 does not stand behind it. One exception is accepted as a `poc` debt (Consequences of the ADR this issue records, ADR 0117 on #720 until update-branch renumbers it): once the publisher deletes their account, account erasure splices the session's lineage past the erased **Shared Workout** to its nearest surviving ancestor (ADR 0051 §5), so a session placed from a Shared Workout that was itself adapted from a cited **Stock Workout** then reads that Stock Workout's Citation.
- [ ] A session the athlete changed after it was placed (adopted, `adoptedAt` set) keeps its source line and says, in the same line, that the athlete changed it. Editing a session never removes where it came from.
- [ ] A session copied from a Catalogue row that has since been retired still shows its Citation.
- [ ] A session written by the athlete, copied from a Workout outside the Catalogue, or whose source Workout no longer exists shows no source line and no empty placeholder.
- [ ] For the same Catalogue row, the preview panel, the session page and the Catalogue show the same sentence, in Norwegian, from `labels.ts`.
- [ ] At 390x844 the generate preview with a row open and a session page carrying the longest Citation in the corpus (the longest work title and a URL locator) do not overflow horizontally, and both stay inside `tests/e2e/mobile-overflow.test.ts`.

## Scope

**In:** the generate preview's row treatment and its per-row source panel; the source line on the session page for every session copied from a Catalogue row, including adopted ones and the community, retired, taken-down and deleted-source cases; one ADR that records "provenance is available, not asserted" as the app's rule (row carries the plan, the source is one tap away, an absence or a warning is never behind it, and for a lived plan the session page is that tap, since rows on I dag and _Plan_ already open it).

**Out of scope:**
- **A separate review screen or route for a generated season.** The lived plan is reviewed on _Plan_'s lead, _Endre sesongen_, I dag and _Ukeskiftet_ (ADR 0100, 0101); #457, #467, #472 and #686 build their parts there and on the generate preview without this issue.
- **The week's bibliography** (`Sources` in the week header, #437's second depth). Every source is already one tap away on its row.
- **A field-by-field diff of an adopted session against its source** (`90 min -> 75 min`, `Sunday -> Saturday`). The day the generator chose is not stored per session, and no reader compares a copy's structure to its source yet. Worth its own issue if athletes ask what changed.
- **The `≈` facet.** The preview and the session page already mark a resolved value with `≈` (**Target Resolution**); this issue adds no derived figure.
- The planned-volume figure on the preview (#472), re-laying generated weeks (#686), rebuild (#467), and the nine review controls (#457).

## What #437 decided, and what to carry across

**Provenance is available, not asserted.** The chosen design is Variant E, on `main`:

| File | Lines | What it is |
|---|---|---|
| `app/routes/training/plan_.provenance-prototype.tsx` | 24 | the throwaway route (`/training/plan/provenance-prototype`) |
| `app/routes/training/__provenance-week.tsx` | 631 | the chosen design |
| `app/routes/training/__provenance-prototype-data.ts` | 286 | a hand-made stub week + a proposed `Provenance` union |

All three are **absorbed or deleted** by this ticket. The route's own docblock says so, and nothing links to it.

The rules it settled, from `__provenance-week.tsx:13-37` and #437's resolution comment:

1. **Rows carry the plan and nothing else** — no marks, no badges, no source lines. Rows stay byte-identical in density to `LedgerSessionCard` (`app/routes/_home/session-ledger.tsx:381`).
2. **The whole row is the tap target**, with a hairline chevron as the only hint. It opens a **drawer**.
3. **One drawer, two depths** — a session's full provenance, and the week's bibliography behind a quiet `Sources` link in the week header, reachable from level one. Both opt-in.
4. **A derived facet wears `≈` in the week.** It qualifies a number the athlete is about to run, so it does not wait behind a tap; the drawer explains anchor → facet and says *"coach consensus, not published equivalence… a change of units, not a score."*
5. **An empty slot stays visible in the week** — drawn quietly, dashed and muted, never as an alarm. A source can wait behind a tap; an absence cannot.
6. **A community session must be structurally incapable of looking cited.**
7. **An edited session keeps its citation and gains a diff** — `90 min → 75 min`, `Sunday → Saturday`, closing with *"editing adopted the session, it did not erase where it came from."*

Cost at 390 px, measured on the prototype: 1034 px page height, zero horizontal overflow, **one character** of week.

> The three prototype files in the table above were deleted in 6638406 (#540); nothing is left to absorb.

## What now exists that did not when #457 or #437 was written

This is the substance of the ticket. The prototype stubbed its week because none of these existed.

- **The Catalogue** ([#448](https://github.com/leskraas/trainm8/issues/448) / [#451](https://github.com/leskraas/trainm8/issues/451)) — 151 **Stock Workouts** with real Citations, and the four-axis model (ADR 0051).
- **The community tier** ([#452](https://github.com/leskraas/trainm8/issues/452)) — `public` visibility, **Attribution**, the non-owner-scoped read path, report-and-takedown (ADR 0052).
- **Adoption** ([#460](https://github.com/leskraas/trainm8/issues/460)) — `WorkoutSession.adoptedAt` (`prisma/schema.prisma:642`).
- **The deterministic generator** ([#456](https://github.com/leskraas/trainm8/issues/456)) — `app/utils/plan-generation/`, ADR 0053, with a preview screen at `/training/plan/generate/:eventId`.

Two consequences the ticket must absorb:

### `source` alone is permanently the wrong answer to "is this still the machine's"

#460 split the two jobs `source` was doing. `source` keeps its origin value **permanently**; `adoptedAt` records the takeover. So the drawer's "you changed this after generation ran" reading is `adoptedAt != null`, and the eligibility predicate everywhere is `adoptedAt IS NULL` (ADR 0016 §6 as amended). The prototype's assumption that adoption erases the origin was true of the code at the time and is now false in the right direction.

### Provenance is four-valued and has a shipped reader

`app/utils/plan-generation/provenance.ts` — `readSessionProvenance`, `provenanceSentence`, `provenanceNonVouch`, `isPlaceable`. One slot, four contents (`corpus`, `convention`, `hand-written`, `community`) plus a fifth refusal reading (`unsourced`). **Use it.** It supersedes the prototype's proposed `Provenance` union in `__provenance-prototype-data.ts`, and it is pinned by a test that replays the whole shipped corpus through it.

**About a third of the corpus carries no Citation** — 47 **Convention Rows** and 3 **Hand-Written Rows** (ADR 0051 §10). Any surface that assumes a Citation is there will render blank on a third of what it shows. That exact bug is live on the Catalogue screen and filed separately.

## First decision: is the preview the review surface?

#434 lists this under **Not yet specified**: *"Whether a preview state and a review surface are the same thing. If 'nothing persisted until approved' holds, a plan the athlete edits before approving is already doing much of what an authoring surface does. May collapse two tickets into one."*

There is now a concrete reason to settle it. `/training/plan/generate/:eventId` (`app/routes/training/plan.generate.$eventId.tsx`, 560 lines) already renders a whole season — weeks, targets, placed sessions, absences, approval. And its `SessionRow` (`:489-520`) **renders the provenance sentence inline on the row**, with `data-provenance`:

```tsx
<p className="text-body-xs text-muted-foreground" data-provenance>
    {provenanceSentence(session.provenance)}
</p>
```

That is exactly the treatment #437 rejected — Variant A, the always-on cited line. Two screens in the same app now disagree about the rule. **Reconciling them is not optional and is part of this ticket**: either the preview adopts the drawer, or the difference between a plan you are approving and a plan you are living with is stated as a deliberate rule and written down.

ADR 0053 §8 constrains the answer: nothing reaches the calendar unapproved, and approval **regenerates server-side** rather than persisting a payload the browser posted back. So a preview the athlete edits before approving cannot simply be the persisted plan with different chrome.

> Answered in this spec's decisions: the preview and the lived plan are two readings of one plan, and both follow the same provenance rule. No separate review screen is built.

## Constraints that already exist — do not rediscover these

- **ADR 0028** — 44 px targets, **390×844** reference viewport, `text-base md:text-sm`. Drive it with Playwright before closing (`/verify`).
- **ADR 0030 rule 3** — tap-to-inspect into a **fixed panel below**, never a floating tooltip: *"which obscures neighbours at 390px."* There is no hover on touch. Re-tapping the same mark, tapping empty area, or Escape **dismisses**. Desktop hover is parity, mirroring the same panel.
- **[#429](https://github.com/leskraas/trainm8/issues/429)** — guards are never behind progressive disclosure. *"A warning withheld is a warning broken."* This is the constraint most likely to be lost: the drawer is for **sources**, never for warnings, absences or a caveat on a number the athlete is about to execute.
- **The overflow guard.** `/training/plan` is inside `tests/e2e/mobile-overflow.test.ts` — `scrollWidth - clientWidth <= 0` at 390 px (`'the season plan does not overflow at 390px'`). Whatever this surface becomes stays inside it.
- **Every derived figure keeps its `authored | derived` marker**, with the derivation **one interaction away**. `≈` is the marker and the app already reserves it for a value resolved rather than authored (`CONTEXT.md`, **Target Resolution**).
- **A Citation is structurally impossible on an athlete-authored row and an Attribution is structurally impossible on trainm8's** (ADR 0051 §4, ADR 0052). The surface must not be able to put them in the same slot.
- **The save count is a ranking input, never a displayed number** (ADR 0051 §6). #452 ships a route test asserting its absence.
- **Vocabulary**: it is the **Catalogue**. "Library" is banned — this was already violated once in athlete-visible copy and fixed in a follow-up commit.

## Notes

- Read #434's **Notes** and **Decisions so far** before starting. In particular: *"the authoring surface survives in some form"* (#439 — nothing is deleted, `/training/plan` stays whole for the expert and stops being the way in), and the season overview belongs on the Dashboard rather than a calendar route (ADR 0017 stands, no ADR yet because *"it interacts with the review surface and should be recorded once that settles"* — so recording it may fall to this ticket).
- Skills: `/grilling` and `/domain-modeling` per #434's standing instruction; `/verify` before closing, since this changes a screen.
- Not decided here, and left for the ticket: which route this lives on, and whether the **Catalogue**'s missing chrome entry point belongs to it.

## Design

**Chosen: Quiet row.** A row on the generate preview shows the plan, and the session's source is one tap away in a panel directly below the row. On the session page the source is one quiet line after the numbers. Canvas: evidence:canvas.html.

| | 390 px | 1440 px |
|---|---|---|
| Generate preview, one row open | evidence:quiet-row-mobile.png | evidence:quiet-row-desktop.png |
| Session page (adopted / community) | evidence:quiet-row-session-mobile.png | evidence:quiet-row-session-desktop.png |
| Today, for comparison | evidence:today-mobile.png | |

**The build must match:**

1. **Preview row** (`SessionRow` in `plan.generate.$eventId.tsx`). The whole row is one `<button>`, at least 44 px tall, with `aria-expanded` and `aria-controls`. Its content is the day line (weekday · sport · archetype · zone) and then the title, so its accessible name names the session. The day line puts a real space between tokens and keeps each token on one line (`whitespace-nowrap`), so `sone 4` never splits. The only extra mark is Tabler `chevron-down` at 16 px, stroke 1.25, in `muted-foreground`. It turns 180° when open (`duration-press`, `ease-out`, as in `ShapeCard`). There is no source line and no `data-provenance` on the row.
2. **Panel.** It opens directly below its row, inside the week card, as a `Collapsible` with `motion-collapse` (200 ms in, 150 ms out; reduced motion keeps only the fade). Inside is a `bg-muted/60 rounded-3xl p-3` well holding the shared slot (item 4). One panel is open across the whole season. Tapping the same row, pressing Escape (focus goes back to the row) or opening another row closes it. Enter and Space work natively on the button.
3. **Row feel.** Press gives an instant `active:bg-muted` and no scale. Hover is `hover:bg-muted/50`, behind the app's gated `hover:`. Hovering never opens a panel. If the open panel sits above the row being opened, it closes without animation and the tapped row is held where it was. A panel that opens past the fold scrolls into view with `block: 'nearest'`, and the scroll is instant under reduced motion.
4. **One slot component** for the Catalogue (`ProvenanceSlot` in `catalogue.tsx`), the preview panel and the session page. Line 1 is `[Endret av deg · ]` + `nbProvenanceSentence(p)` + `[ · publishedAt]` (community) + `[ · locator]` (corpus; a link, `doi:` → `https://doi.org/…`) + `[ · Fjernet av en moderator]` (community taken down). Line 2 is `NB_PROVENANCE_LABELS.nonVouch`, on a community row only. All text is `text-footnote text-muted-foreground [overflow-wrap:anywhere]`, and a date stays on one line.
5. **Session page.** The slot is the last item in the card's prose block (`CardContent` after `WorkoutPrescription`, after the description), carrying `data-provenance`. It is not in the header. The source comes from the Workout the machine placed: `workout.copiedFrom.catalogueEntry`, or, when the session is adopted (`adoptedAt != null`) and that misses, `workout.copiedFrom.copiedFrom.catalogueEntry`. It is read through `readSessionProvenance`, with the Attribution and its `takenDownAt`. A retired entry is not filtered out. When nothing is found, render nothing: no placeholder.
6. **Words** go in `labels.ts`: `PLAN_GENERATE_LABELS.intro` becomes "Hver økt er hentet fra katalogen. Trykk på en økt for å se hvor den kommer fra. Ingenting havner i kalenderen før du legger det inn.", plus a new `adopted: 'Endret av deg'` beside `NB_PROVENANCE_LABELS`. The taken-down note reuses `CATALOGUE_LABELS.publishState['taken-down']`.
7. **Unchanged and still visible:** unfilled rows (no chevron, not a button), the absences well, the capacity line with `≈`, and the week's targets.
8. **Tests:** add two cases to `tests/e2e/mobile-overflow.test.ts` at 390×844. The generate preview with a row open, and a session page carrying Denadai 2017 (the longest work) and a URL locator.

## Architecture

The build follows [ADR 0117](`` docs/adr/0117-provenance-is-available-not-asserted-a-row-carries-the-plan-and-its-source-is-one-tap-away.md ``) ("provenance is available, not asserted") and keeps ADR 0028, ADR 0030 rule 3 (as ADR 0117 §6 narrows it), ADR 0051 §4, ADR 0052 §3–§4 and ADR 0053 §5 and §8.

1. **One provenance reader for the session page, on the server.** Add `readPlacedProvenance` to `app/utils/catalogue.server.ts`, beside `resolveCatalogueOrigin`. It takes the session's Workout id and `adoptedAt` and returns `{ provenance: SessionProvenance, takenDown: boolean } | null`. It reads the session Workout's `copiedFrom` (never the Workout's own Catalogue Entry, ADR 0052 §4) and, only when the session is adopted and that row has no Catalogue Entry, `copiedFrom.copiedFrom`. It then reads the found row through `readSessionProvenance`. A retired entry still counts. It returns `null` when neither hop reaches a Catalogue Entry, or when the reading is `unsourced`. It does **not** walk the whole chain: that is a deliberate narrowing of ADR 0053 §7 (ADR 0117 §5), and `resolveCatalogueOrigin` stays for the Catalogue's "adapted from" line. Make it one Prisma query, with nested selects two levels deep.
2. **Select only what the slot shows.** That is `authorship` and `description` off the Workout, the four citation columns off the entry, and `displayName`, `publishedAt` and `takenDownAt` off the Attribution. Never select `takedownReason`: it is the author's to read (ADR 0052 §2), and this reader runs over rows the viewer does not own.
3. **No waterfall.** The session loader's call joins the existing `Promise.all` in `sessions.$sessionId.tsx`. The Plan Preview panel renders from `GeneratedSession.provenance`, which is already on the payload, so tapping a row makes no request.
4. **One slot component.** Move `ProvenanceSlot` out of `app/routes/training/catalogue.tsx`, and `nbProvenanceSentence` and `nbProvenanceNonVouch` out of `__catalogue-card.ts`, into `app/components/provenance-slot.tsx`. The component takes a `SessionProvenance` plus `{ adopted, takenDown, adaptedFrom }` and words everything itself from `labels.ts`. The Catalogue, the Plan Preview panel and the session page all render it, which is how criterion 9 holds by construction. The Catalogue loader stops pre-wording strings. The Catalogue's place screen may use the slot too, but no criterion asks for it.
5. **Names.** In code, the concept is `provenance`, never `source`: the glossary's **Session Provenance** lists _source_ as a word to avoid, because it collides with **Session Source**. The issue's "generate preview" is the glossary's **Plan Preview**, and test and component names use that.
6. **Delete the row's line.** Remove `data-provenance` and `nbProvenanceSentence` from `SessionRow` in `plan.generate.$eventId.tsx`. Then update `plan.generate.$eventId.route.test.tsx`, which asserts the non-vouch on rows, so that it opens the panel first.
7. **No schema change, no migration, no new dependency.** `Collapsible` and `motion-collapse` already exist.
8. **Tests at the seam:** `readPlacedProvenance` in `catalogue.server.test.ts`. Cover a generated session, an adopted one (two hops), a Catalogue placement, a community row, a taken-down community row, a retired entry, an athlete's own fork of a Stock Workout (null), and a deleted source (null). Add the two e2e overflow cases the Design section names.

## Decisions

- **What #475 still builds** (spec): no separate review screen: make Session Provenance available, not asserted, on the two screens where a Catalogue session is read, the generate preview (before approval) and the session page (after), and record the rule in an ADR, because since #475 was written the lived plan is reviewed on Plan's lead, Endre sesongen, I dag and Ukeskiftet (ADR 0100, 0101), and #457, #467, #472 and #686 each chose to build there instead of waiting; what is still missing is the provenance itself: the preview asserts it on every row (the treatment #437 rejected) and the session page drops it entirely, including a community session's non-vouch. Rejected: build the season reading instrument as a new route (a second entrance to the plan Plan already reads, against the 'one entrance' rule in docs/wayfinder/out-of-the-box/destination.md); close #475 as wontfix (leaves the preview contradicting #437 and every placed session without its source). One-way door: no dedicated review screen for a generated season; map #434's 'shape of the review surface' answered as Plan plus the preview. Decided by the factory (autonomy `full`).
- **Whether the preview and the lived plan follow one provenance rule** (spec): one rule on both: rows carry the plan and the source is one tap away; the preview's row opens a panel below it, and for a lived plan the session page is the tap, because #437 decided the rule for exactly a generated week under review, with four variants converging on it; the Catalogue, where reading sources is the job, keeps its inline line. Rejected: state a deliberate exception that a plan being approved asserts its sources on every row (keeps the doubled row height across 100+ rows at 390 px and leaves the rule unrecorded); a drawer on I dag and Plan rows (would take over a tap that already opens the session). Two-way door.
- **Whether a community session's non-vouch waits behind a tap on the session page** (spec): no: on the session page the line is shown in place, with the non-vouch, after the numbers, because the session page is already the tap from the row, and #429 keeps a caveat about trusting the session out of disclosure; generation places no community rows, so the preview never needs it. Rejected: a 'Kilde' disclosure on the session page (two taps to a source, and a non-vouch hidden on a session trainm8 does not stand behind). Two-way door.
- **How an adopted session shows what changed** (spec): keep the source line and add that the athlete changed it; no field-by-field diff in this issue, because #460 made adoptedAt record the takeover while the origin survives, so 'changed by you, from X' is exact today; a diff needs the generator's chosen day, which is not stored per session, and a structure comparison no code has. Rejected: the prototype's per-field diff now (new storage and a new reader for a detail no athlete has asked for); drop the source once adopted (the bug #460 fixed). Two-way door.
- **Where the session page reads a source from** (spec): one hop through Workout.copiedFrom to its CatalogueEntry and Attribution, through readSessionProvenance; no source line when that hop finds no Catalogue row, because the schema already says the citation is never copied onto the fork so it cannot drift and retiredAt keeps working (prisma/schema.prisma:285-289); one reader keeps the preview, Catalogue and session page saying the same thing. Rejected: copy the citation onto the session or Workout at placement (a second source of truth that drifts on correction); follow copiedFrom through several hops (claims a source for a session the athlete rewrote from a copy). Two-way door.
- **The week's bibliography** (spec): left out, because each source is one tap away on its row, and a second entrance to the same facts has no evidence of need. Rejected: a quiet 'Kilder' link in each preview week header opening the week's sources (#437's second depth). Two-way door.
- **Design for #475's two provenance surfaces** (design): Quiet row. The preview's row carries the plan and opens its source in a panel below; the session page shows one quiet source line after the numbers., because Critic: it holds all 10 criteria (criterion 6 with the reading decision, criterion 10 with the new e2e cases). It breaks nowhere at 390 or 320 px with the corpus's longest Citation and a URL locator. It reuses Collapsible and motion-collapse and one slot component shared with the Catalogue. Rejected: A bottom drawer for the preview's source, as #437 drew it: it covers the season being read, and ADR 0030 rule 3 wants a panel below the thing tapped. Putting the session page's line in the card header: ADR 0098's owed credit already sits there. Unattended run: one variant drawn.. Two-way door.
- **Which Workout the session page reads the source from** (design): The Workout the machine placed: workout.copiedFrom's Catalogue entry, or, for an adopted session where that misses, workout.copiedFrom.copiedFrom's. No longer walk., because Settled by probe (workout.server.ts fork-on-write, juster.server.ts swapSession). An adopting edit forks a new Workout pointing at the placed copy, which points at the Catalogue row: two hops. The spec decision's single hop from the session's own Workout would drop the source on every adopted session and fail criterion 6. Stopping at the placed copy still leaves out sessions the athlete wrote from their own fork (criterion 8). Rejected: One hop from the session's Workout, as the spec decision words it (fails criterion 6). resolveCatalogueOrigin's full walk (would cite the source of an athlete's own fork-of-a-fork, against criterion 8).. Two-way door.
- **Where the source line sits on the session page** (design): Last in the card's prose block, after the numbers, the prescription and the description, because It is the card's existing provenance slot (Arket M: provenance follows the numbers). The header already holds the recording's owed credit (ADR 0098), and a second footnote there would compete with the figures. Rejected: Directly under SummaryFigures in the header. Two-way door.
- **How an adopted session says it changed** (design): 'Endret av deg · ' leads the same line, followed by the unchanged Catalogue sentence, because Criterion 6 asks for it on the same line, and criterion 9 asks for the sentence unchanged, so the note goes before it rather than inside it. Rejected: A suffix after the locator (it would trail a URL); a separate line (against criterion 6). Two-way door.
- **Whether a taken-down community session says so** (design): Yes: ' · Fjernet av en moderator' on its line, beside the byline and the non-vouch, in existing words, because A moderator may remove a row for being unsafe. A session the athlete is about to run that was removed for that reason is a caveat, and #429 does not let a caveat be withheld. The words already exist in CATALOGUE_LABELS. Rejected: The byline and non-vouch only, which is all criterion 5 requires: the athlete never learns the source was pulled. One-way door: an athlete-visible notice that no acceptance criterion names. Decided by the factory (autonomy `full`).
- **Whether hovering a row opens its panel on desktop** (design): No. Hover tints the row and a click opens the panel., because ADR 0030 rule 3's hover parity was written for chart marks whose panel is fixed below the chart. Here the panel sits inline, so hover would reflow the list under the pointer. This narrows ADR 0030 rule 3 to fixed panels; the ADR this issue writes should say so. Rejected: Hover opens the panel, mirroring the tap (ADR 0030 rule 3 read literally). Two-way door.
- **What opening a row does when a panel above it is open** (design): The panel above closes without animation and the tapped row is held where it was, because Animating that panel closed drags the tapped row up by the panel's height, out from under the finger. Probed: the row moves 0 px. Rejected: Animate both panels at once (the row jumps). Two-way door.
- **How the session page reads a placed session's provenance, against the ADRs' lineage walk** (architecture): one server reader, readPlacedProvenance, that reads the placed copy (the session Workout's copiedFrom, and one hop further only for an adopted session where that misses), recorded in ADR 0117 §5 as a narrowing of ADR 0053 §7's walk; resolveCatalogueOrigin's full walk stays for the Catalogue's adapted-from line, because ADR 0051 §5, ADR 0052 §4 and ADR 0053 §7 each say a reader walks the chain and never assumes one hop, and design's bounded read would otherwise contradict them silently, so the next surface would 'fix' it back; the full walk would cite a Stock Workout on a session built from the athlete's own fork of it (criterion 8). Rejected: reuse resolveCatalogueOrigin's full walk (fails criterion 8); implement design's read without an ADR (an unrecorded contradiction of three ADRs). Two-way door.
- **Where the one provenance slot and its Norwegian wording live** (architecture): app/components/provenance-slot.tsx, taking a SessionProvenance plus adopted, takenDown and adaptedFrom and wording it itself from labels.ts; ProvenanceSlot leaves catalogue.tsx and nbProvenanceSentence/nbProvenanceNonVouch leave __catalogue-card.ts, because three surfaces must say the same sentence for the same row (criterion 9), and that holds by construction only if one module words it; a route importing another route's component couples two screens. Rejected: import ProvenanceSlot from the Catalogue route into the preview and session routes; keep each loader pre-wording strings for the slot. Two-way door.
- **What 'changed by you' on the source line is read from** (architecture): adoptedAt only, as criterion 6 says; sessions changed without adoption keep an unqualified source line, written as a debt, because it is exact for every adopted session today and costs nothing; the honest alternative needs the source's blocks in the session loader and new words for a change the app made rather than the athlete, which a poc demo does not meet. Rejected: compare the session's prescription fingerprint with its source's (covers in-place edits of a Catalogue placement and Juster eases, at the cost of a second tree read and new copy). Two-way door.
- **How the Plan Preview's day line keeps a token like `sone 4` together** (implement): a non-breaking space inside each token and overflow-wrap:anywhere on the line, instead of whitespace-nowrap, because with whitespace-nowrap the existing worst-case e2e (320 px, 200 % text) overflowed by 25 px, because a long archetype could not break; nbsp keeps `sone 4` whole and lets an over-long word break. Rejected: whitespace-nowrap per token, as the Design section words it (fails the overflow guard). Two-way door.
- **How the row's chevron is drawn at stroke 1.25** (implement): an inline SVG of Tabler's chevron-down path at stroke 1.25, because the sprite path hard-codes stroke-width 2, and CSS cannot override a presentation attribute inside <use>. Rejected: the sprite Icon at stroke 2 (heavier than the design's hairline). Two-way door.
- **What a session placed from a Shared Workout shows after its publisher erases their account** (spec, changes acceptance criterion 5): keep account erasure's splice and rewrite acceptance criterion 5 to name it as a poc debt: the two slots stay apart, a taken-down community session still says an athlete published it with the non-vouch, and the one exception is a session placed from a Shared Workout adapted from a cited Stock Workout, which reads that Stock Workout's Citation once the publisher deletes their account (ADR 0051 §5 splice, recorded in the Consequences of this issue's ADR), because ADR 0051 §5 decided the splice so a fork of a fork of a cited Stock Workout keeps its citation, and a test pins it; a spliced copy and a direct Stock placement are the same row shape, so the session page cannot tell them apart without new schema; the path needs an erased publisher of a forked-from-stock Shared Workout, which no poc demo meets; the build at #720's head already behaves this way and its ADR records it. Rejected: stop splicing past a published row (copiedFromId null, so criterion 8 gives no line): honest, but narrows ADR 0051 §5's pinned splice and drops the Catalogue's 'adapted from' on the reader's own published fork; owed when the project leaves poc. Mark spliced rows: a schema change for a rare path. Two-way door.
- **Whether a taken-down or orphaned community row's line names its publisher** (review): no: it says an athlete published it ('trainm8 kan ikke si hvem'), with the non-vouch and, when taken down, 'Fjernet av en moderator', because ADR 0051 §5 serves a public row's Attribution to a non-owner only through isPublished, and ADR 0052 §2's takedown sets the row private so every read path stops serving it; criterion 5 asks only that the line still says an athlete published it. Rejected: keep the published name on a taken-down row's line, which needs ADR 0117 to record that it narrows ADR 0052 §2, and still leaks an erased author's name from an orphan. Two-way door.
- **Criterion 4: a community row's non-vouch sits on a second line** (review, changes acceptance criterion 4): On a session's page, a session whose Workout was copied from a Catalogue row shows its Session Provenance in one quiet line after the session's numbers (for a community row, with the non-vouch on a second line directly below it): the Citation for a corpus row, the convention or hand-written notice for those kinds, and for a community row the publishing athlete's name (or that an athlete published it, where no name can be shown) together with the non-vouch., because Design item 4 already decided the non-vouch is line 2 of the one slot shared by the Catalogue, the Plan Preview and the session page. The build follows it, and putting the non-vouch on the byline line would change the Catalogue card too. Rejected: Put the non-vouch on the byline's line, which goes against Design item 4 and changes all three surfaces.. Two-way door.
- **Reduced motion on the Plan Preview's provenance panel** (review): keep motion-collapse's own reduced-motion answer (height and fade), and drop the panel's fade-only override (done in 5e052ad), because ADR 0077 §5 and ADR 0085 §4 decide reduced motion once for every collapse: the height reflow is the gentler answer, because it stops the rows below from jumping. Every other CollapsibleContent follows it. Design item 2's fade-only did not weigh those ADRs, and an exception for one panel would need an ADR change. Rejected: Keep fade-only and record in ADR 0117 that it narrows ADR 0077 §5 for this panel. That adds a second reduced-motion answer to the design system.. Two-way door.
- **How a community session's source line places the non-vouch on the session page** (spec, changes acceptance criterion 4): rewrite acceptance criterion 4 so the session's Session Provenance is one quiet line after the numbers, and for a community row the non-vouch sits on a second line directly below it, because Design item 4 decided the non-vouch is line 2 of the one slot the Catalogue, the Plan Preview and the session page share, so criterion 9's same sentence holds by construction; the build at #720's head (provenance-slot.tsx at 5e052ad) already renders it that way, and review run 2 decided the criterion should say so. Rejected: put the non-vouch on the byline's line, as the old criterion read: it goes against Design item 4 and changes the Catalogue card and the Plan Preview panel too. Two-way door.
- **Whether a keyboard toggle of a Plan Preview row animates** (review): keep motion-collapse and the chevron turn for Enter, Space and Escape, as every other collapsible in the app does, because two documented rules disagree: review-animations standard 2 (keyboard-initiated motion gets none) and the app's cohesion, where every CollapsibleContent runs motion-collapse whatever opened it (ADR 0077 §5, ADR 0085 §4). One row behaving differently from every other collapsible is the worse inconsistency, and an app-wide change belongs in its own issue. Rejected: skip the motion for keyboard toggles on this row alone, which makes it the one collapsible in the app that behaves differently. Two-way door.

<details><summary>Original input</summary>

Successor to [#437](https://github.com/leskraas/trainm8/issues/437), and the real blocker on [#457](https://github.com/leskraas/trainm8/issues/457).

#437 answered a design question and closed. It produced **a throwaway prototype, not a review surface** — three commits on `main` (`7042b2d`, `146963b`, `b43bab5`) that settled *which provenance treatment wins*. #457 says it is blocked by #437 and it is not: #437 built no surface for the nine controls to land on. This ticket builds it.

Map [#434](https://github.com/leskraas/trainm8/issues/434) carries this under **Not yet specified** — *"the season arc as a reading instrument rather than a set of fields"* — and says the prototype *"is the first fragment of it and should be read as a constraint on the rest."*

---

## What #437 decided, and what to carry across

**Provenance is available, not asserted.** The chosen design is Variant E, on `main`:

| File | Lines | What it is |
|---|---|---|
| `app/routes/training/plan_.provenance-prototype.tsx` | 24 | the throwaway route (`/training/plan/provenance-prototype`) |
| `app/routes/training/__provenance-week.tsx` | 631 | the chosen design |
| `app/routes/training/__provenance-prototype-data.ts` | 286 | a hand-made stub week + a proposed `Provenance` union |

All three are **absorbed or deleted** by this ticket. The route's own docblock says so, and nothing links to it.

The rules it settled, from `__provenance-week.tsx:13-37` and #437's resolution comment:

1. **Rows carry the plan and nothing else** — no marks, no badges, no source lines. Rows stay byte-identical in density to `LedgerSessionCard` (`app/routes/_home/session-ledger.tsx:381`).
2. **The whole row is the tap target**, with a hairline chevron as the only hint. It opens a **drawer**.
3. **One drawer, two depths** — a session's full provenance, and the week's bibliography behind a quiet `Sources` link in the week header, reachable from level one. Both opt-in.
4. **A derived facet wears `≈` in the week.** It qualifies a number the athlete is about to run, so it does not wait behind a tap; the drawer explains anchor → facet and says *"coach consensus, not published equivalence… a change of units, not a score."*
5. **An empty slot stays visible in the week** — drawn quietly, dashed and muted, never as an alarm. A source can wait behind a tap; an absence cannot.
6. **A community session must be structurally incapable of looking cited.**
7. **An edited session keeps its citation and gains a diff** — `90 min → 75 min`, `Sunday → Saturday`, closing with *"editing adopted the session, it did not erase where it came from."*

Cost at 390 px, measured on the prototype: 1034 px page height, zero horizontal overflow, **one character** of week.

---

## What now exists that did not when #457 or #437 was written

This is the substance of the ticket. The prototype stubbed its week because none of these existed.

- **The Catalogue** ([#448](https://github.com/leskraas/trainm8/issues/448) / [#451](https://github.com/leskraas/trainm8/issues/451)) — 151 **Stock Workouts** with real Citations, and the four-axis model (ADR 0051).
- **The community tier** ([#452](https://github.com/leskraas/trainm8/issues/452)) — `public` visibility, **Attribution**, the non-owner-scoped read path, report-and-takedown (ADR 0052).
- **Adoption** ([#460](https://github.com/leskraas/trainm8/issues/460)) — `WorkoutSession.adoptedAt` (`prisma/schema.prisma:642`).
- **The deterministic generator** ([#456](https://github.com/leskraas/trainm8/issues/456)) — `app/utils/plan-generation/`, ADR 0053, with a preview screen at `/training/plan/generate/:eventId`.

Two consequences the ticket must absorb:

### `source` alone is permanently the wrong answer to "is this still the machine's"

#460 split the two jobs `source` was doing. `source` keeps its origin value **permanently**; `adoptedAt` records the takeover. So the drawer's "you changed this after generation ran" reading is `adoptedAt != null`, and the eligibility predicate everywhere is `adoptedAt IS NULL` (ADR 0016 §6 as amended). The prototype's assumption that adoption erases the origin was true of the code at the time and is now false in the right direction.

### Provenance is four-valued and has a shipped reader

`app/utils/plan-generation/provenance.ts` — `readSessionProvenance`, `provenanceSentence`, `provenanceNonVouch`, `isPlaceable`. One slot, four contents (`corpus`, `convention`, `hand-written`, `community`) plus a fifth refusal reading (`unsourced`). **Use it.** It supersedes the prototype's proposed `Provenance` union in `__provenance-prototype-data.ts`, and it is pinned by a test that replays the whole shipped corpus through it.

**About a third of the corpus carries no Citation** — 47 **Convention Rows** and 3 **Hand-Written Rows** (ADR 0051 §10). Any surface that assumes a Citation is there will render blank on a third of what it shows. That exact bug is live on the Catalogue screen and filed separately.

---

## First decision: is the preview the review surface?

#434 lists this under **Not yet specified**: *"Whether a preview state and a review surface are the same thing. If 'nothing persisted until approved' holds, a plan the athlete edits before approving is already doing much of what an authoring surface does. May collapse two tickets into one."*

There is now a concrete reason to settle it. `/training/plan/generate/:eventId` (`app/routes/training/plan.generate.$eventId.tsx`, 560 lines) already renders a whole season — weeks, targets, placed sessions, absences, approval. And its `SessionRow` (`:489-520`) **renders the provenance sentence inline on the row**, with `data-provenance`:

```tsx
<p className="text-body-xs text-muted-foreground" data-provenance>
    {provenanceSentence(session.provenance)}
</p>
```

That is exactly the treatment #437 rejected — Variant A, the always-on cited line. Two screens in the same app now disagree about the rule. **Reconciling them is not optional and is part of this ticket**: either the preview adopts the drawer, or the difference between a plan you are approving and a plan you are living with is stated as a deliberate rule and written down.

ADR 0053 §8 constrains the answer: nothing reaches the calendar unapproved, and approval **regenerates server-side** rather than persisting a payload the browser posted back. So a preview the athlete edits before approving cannot simply be the persisted plan with different chrome.

---

## Constraints that already exist — do not rediscover these

- **ADR 0028** — 44 px targets, **390×844** reference viewport, `text-base md:text-sm`. Drive it with Playwright before closing (`/verify`).
- **ADR 0030 rule 3** — tap-to-inspect into a **fixed panel below**, never a floating tooltip: *"which obscures neighbours at 390px."* There is no hover on touch. Re-tapping the same mark, tapping empty area, or Escape **dismisses**. Desktop hover is parity, mirroring the same panel.
- **[#429](https://github.com/leskraas/trainm8/issues/429)** — guards are never behind progressive disclosure. *"A warning withheld is a warning broken."* This is the constraint most likely to be lost: the drawer is for **sources**, never for warnings, absences or a caveat on a number the athlete is about to execute.
- **The overflow guard.** `/training/plan` is inside `tests/e2e/mobile-overflow.test.ts` — `scrollWidth - clientWidth <= 0` at 390 px (`'the season plan does not overflow at 390px'`). Whatever this surface becomes stays inside it.
- **Every derived figure keeps its `authored | derived` marker**, with the derivation **one interaction away**. `≈` is the marker and the app already reserves it for a value resolved rather than authored (`CONTEXT.md`, **Target Resolution**).
- **A Citation is structurally impossible on an athlete-authored row and an Attribution is structurally impossible on trainm8's** (ADR 0051 §4, ADR 0052). The surface must not be able to put them in the same slot.
- **The save count is a ranking input, never a displayed number** (ADR 0051 §6). #452 ships a route test asserting its absence.
- **Vocabulary**: it is the **Catalogue**. "Library" is banned — this was already violated once in athlete-visible copy and fixed in a follow-up commit.

---

## Scope

**In:** the surface itself — the season/week reading instrument, the row treatment, the drawer at both depths, the absence treatment, the `≈` facet, the edited-session diff; absorbing or deleting the three prototype files; reconciling with the generate preview.

**Out:**
- **The nine review controls** — that is [#457](https://github.com/leskraas/trainm8/issues/457), which lands *on* this. Its port list and its constraints are already stable; do not re-derive them.
- **Coexistence and regeneration** — filed separately; it depends on this and on the preview/review question above.
- **Substitution granularity** and **editing by exception gesture by gesture** — #434 lists both as still unspecified and both depend on this surface existing.

## Notes

- Read #434's **Notes** and **Decisions so far** before starting. In particular: *"the authoring surface survives in some form"* (#439 — nothing is deleted, `/training/plan` stays whole for the expert and stops being the way in), and the season overview belongs on the Dashboard rather than a calendar route (ADR 0017 stands, no ADR yet because *"it interacts with the review surface and should be recorded once that settles"* — so recording it may fall to this ticket).
- Skills: `/grilling` and `/domain-modeling` per #434's standing instruction; `/verify` before closing, since this changes a screen.
- Not decided here, and left for the ticket: which route this lives on, and whether the **Catalogue**'s missing chrome entry point belongs to it.

---

**Acceptance criterion 5 before review run 1's decision** (rewritten by spec run 2 to name the account-erasure exception):

> The two slots stay apart: a community session's line never shows a Citation's fields and always carries the non-vouch, and a corpus session's line never shows an **Attribution** or the non-vouch. A session copied from a community row that was later taken down still says an athlete published it and trainm8 does not stand behind it.

**Acceptance criterion 4 before review run 2's decision** (rewritten by spec run 3 to name the non-vouch's second line, as Design item 4 decided):

> On a session's page, a session whose Workout was copied from a Catalogue row shows its Session Provenance in one quiet line after the session's numbers: the Citation for a corpus row, the convention or hand-written notice for those kinds, and for a community row the publishing athlete's name (or that an athlete published it, where no name can be shown) together with the non-vouch.

</details>


---
_Generated by [Claude Code](https://claude.ai/code)_
===== leskraas 2026-10-24T13:16:55Z True
**Triage (2026-10-24): `ready-for-human`.** Still open. The prototype was deleted in 6638406 (#540) and no surface was built. `plan.generate.$eventId.tsx:634-641` still shows provenance inline, the treatment #437 rejected. First the owner should confirm that a generated-season review still has a place after ADR 0079/0080/0100. The route is still reachable from `plan.new.$eventId.tsx:488`.

---
_Generated by [Claude Code](https://claude.ai/code)_
{'factory_comments': 7, 'pr_body': False}
