# PR #720 review: Spec axis (issue #475)

Head: `5e052ad` (`origin/agent/475-build-the-review-surface`). Diff: `git diff origin/main...origin/agent/475-build-the-review-surface` (merge base `04c64a8`). Phase: `poc`.
Spec: the issue #475 body (10 acceptance criteria, numbered C1–C10 in order below, plus Scope, Design 1–8, Architecture 1–8 and ## Decisions). The PR body and factory comments were not read.

## Verdict

Every acceptance criterion is met at the head. No critical or high finding. The open findings are merge mechanics (ADR number, conflicts) and debts that should be named. Under `poc` none of them sends the PR back to `implement` (questions.md, review row).

| # | Criterion (short) | Status | Where at head |
|---|---|---|---|
| C1 | Preview row: day, sport, kind, zone, title; no source line; one 44 px control named by the session; chevron only | Met | `app/routes/training/__plan-preview-row.tsx:228-258` (`min-h-11`, `DayLine` + title inside `CollapsibleTrigger`, `Chevron`); route test "a row carries the plan and no Session Provenance until it is tapped" |
| C2 | Tap/Enter/Space opens provenance below; re-tap, Escape or another row closes; at most one open | Met | `__plan-preview-row.tsx:64-98` (`useOpenSessionRow`, season-level state), `:196-215` (Escape), `:259-268` (panel) |
| C3 | Unfilled rows, absences, capacity fit and week numbers stay visible | Met | `plan.generate.$eventId.tsx` keeps `UnfilledRow`, absences and the capacity line unchanged; test asserts an unfilled row is not a button |
| C4 | Session page: one quiet line after the numbers; community byline with the non-vouch on line 2 | Met | `app/routes/training/sessions.$sessionId.tsx:1045-1052` (last in the `CardContent` after `WorkoutPrescription` at `:985`); `app/components/provenance-slot.tsx` |
| C5 | Slots stay apart; a taken-down community row still says an athlete published it, plus the non-vouch; erasure splice accepted as debt | Met | union in `provenance-slot.tsx`; `app/utils/catalogue.server.ts:474` (`isPublished(row) ? attribution : null`), `takenDown` from `takenDownAt`; ADR Consequences records the splice |
| C6 | Adopted session keeps its line and says "Endret av deg" on the same line | Met | `catalogue.server.ts:449-490` (second hop only when `adoptedAt != null`); `provenance-slot.tsx` leads line 1 with `NB_PROVENANCE_LABELS.adopted` |
| C7 | Retired entry still cites | Met | no `retiredAt` filter in `readPlacedProvenance`; `catalogue.server.test.ts` "a retired entry still gives a placed session its Citation" |
| C8 | Own session, copy from outside the Catalogue, or deleted source: no line, no placeholder | Met | `readPlacedProvenance` returns `null`; render guarded at `sessions.$sessionId.tsx:1045`; test "an athlete's own fork of a Stock Workout, a deleted source and an own session have no provenance" |
| C9 | Same Norwegian sentence on preview panel, session page and Catalogue, from `labels.ts` | Met by construction | one `ProvenanceSlot` used in `catalogue.tsx`, `catalogue.place.$workoutId.tsx`, `__plan-preview-row.tsx:264`, `sessions.$sessionId.tsx:1046` |
| C10 | Two 390x844 overflow cases in `tests/e2e/mobile-overflow.test.ts` | Met (see finding 4) | `tests/e2e/mobile-overflow.test.ts:190-291` |

## Findings

### 1. ADR number 0117 is already taken on main, and the branch does not merge cleanly (medium)

- **Spec line:** C5: "Consequences of the ADR this issue records, ADR 0117 on #720 until update-branch renumbers it". Scope **In**: "one ADR that records 'provenance is available, not asserted' as the app's rule".
- **What the head does:** it adds `docs/adr/0117-provenance-is-available-not-asserted-…md`. On `origin/main`, `0117` is already `0117-a-load-recompute-notice-may-carry-no-ctl-pair-…md`, and main goes up to `0120`. The PR is `mergeable: false`. A three-way merge conflicts in `GLOSSARY.md`, `docs/agents/verify/features/season-plan.md` and `tests/e2e/mobile-overflow.test.ts`. "ADR 0117" is cited in 12 files on the branch (code comments, tests, GLOSSARY, verify docs). If only the file is renamed, every one of those citations points at main's load-recompute ADR.
- **Contradiction elsewhere:** main's #712 and #700 both renumbered their ADRs after a collision (`efd54da`, `1bacf33`). This PR still needs the same step. The ADR becomes `0121` unless main moves again, and the criterion 5 text in the issue needs the new number too.
- **Verify:** `git ls-tree --name-only origin/main docs/adr/ | grep 0117`; `git merge-tree --write-tree --name-only origin/main origin/agent/475-build-the-review-surface`; `git grep -n "ADR 0117" origin/agent/475-build-the-review-surface`.

### 2. The narrowed ADRs carry no back-pointer (low)

- **Spec line:** ## Decisions, "How the session page reads a placed session's provenance, against the ADRs' lineage walk": "…recorded in ADR 0117 §5 as a narrowing of ADR 0053 §7's walk … because ADR 0051 §5, ADR 0052 §4 and ADR 0053 §7 each say a reader walks the chain … design's bounded read would otherwise contradict them silently, so the next surface would 'fix' it back". Also the design decision on hover: "This narrows ADR 0030 rule 3 to fixed panels; the ADR this issue writes should say so."
- **What the head does:** the new ADR's status line says it narrows ADR 0053 §7, ADR 0051 §5 and ADR 0030 rule 3 (`docs/adr/0117-…md:4-7`). None of those three ADRs is edited, though. Someone reading ADR 0053 §7 or ADR 0051 §5 still sees "walk the chain, never assume one hop", which is the silent contradiction the decision exists to prevent. The repo's convention is an "Amended by ADR N" note in the older ADR: see main's edits to ADR 0016 and ADR 0053 for ADR 0120.
- **Verify:** `git diff --name-only origin/main...origin/agent/475-build-the-review-surface -- docs/adr` lists only the new file. `git show origin/main:docs/adr/0053-season-generation-is-deterministic-behind-the-seam.md | grep -n "Amended by"` shows the convention.

### 3. Exceptions to C4 that the ADR lists but ## Decisions does not (low)

- **Spec line:** C4: "a session whose Workout was copied from a Catalogue row shows its Session Provenance". Read against C8: "copied from a Workout outside the Catalogue … shows no source line".
- **What the head does:** ADR Consequences (`docs/adr/0117-…md:96-103`) says a Week Replan make-up or add, copy-week and stamping "copy without the back-pointer", so those sessions show no line "even when its Workout came from a Catalogue row". It calls this a debt "owed when the project leaves `poc`". ## Decisions accepts exactly two exceptions: the account-erasure splice (C5) and "changed without adoption" (the decision on what "changed by you" is read from). This third one is not among them. The ADR's proposed fix is also partly wrong. A make-up copies the missed session's Workout (`app/utils/load/week-replan-proposals.server.ts:636-651`), which is itself a generated copy. Carrying that copy's `copiedFromId` would still be one hop short under ADR §5, unless the make-up copies the *source's* `copiedFromId` instead.
- **Why low:** C8 arguably covers these sessions already (each is a copy of a Workout outside the Catalogue), and a `poc` demo of generate → approve → open a session never meets them. The ADR records it honestly, but the spec does not.
- **Verify:** read ADR Consequences bullet 3. Then check `copyWorkout(tx, target.workout, ctx.userId)` at `week-replan-proposals.server.ts:640`: no `copiedFromId` is passed.

### 4. The C10 session-page e2e uses hand-copied corpus strings and a made-up URL (low)

- **Spec line:** C10: "a session page carrying the longest Citation in the corpus (the longest work title and a URL locator)". Design 8: "a session page carrying Denadai 2017 (the longest work) and a URL locator".
- **What the head does:** `tests/e2e/mobile-overflow.test.ts:249-254` pastes Denadai's author and work as string literals instead of importing `DENADAI_2017` from `app/utils/catalogue-corpus.citations.ts:315`, and pairs them with an invented URL (`…percentage-based-training-for-distance-runners-a-very-long-address.html`). The real Denadai row's locator is a DOI. That matches Design 8's intent (longest work plus a URL), and the invented URL is longer than any real one, so the case is at least as hard. But if the corpus later gains a longer work, the guard will not follow it.
- **Verify:** `git show origin/agent/475-build-the-review-surface:tests/e2e/mobile-overflow.test.ts | sed -n 240,260p`.

### 5. Unrequested behaviour (scope creep): small, all defensible (low)

- **The session page strips the convention or hand-written notice from the description.** `sessions.$sessionId.tsx:850-855`, plus the new `withoutProvenanceNotice` at `app/utils/plan-generation/provenance.ts:110`, from commit `f054f30`. No criterion asks for it. It follows from C4's "one quiet line" (otherwise the English notice and the Norwegian slot say the same thing twice) and copies what the Catalogue card already does. It changes what the athlete sees on every placed convention or hand-written session. Keep it.
- **A `console.warn` for a placed `unsourced` row** (`catalogue.server.ts:480`, `35fd9b1`). Not asked for. It is harmless and matches Architecture 1's "`null` … when the reading is `unsourced`".
- **A locator link with a 44 px hit area** (`provenance-slot.tsx`, `881ad51`). This applies ADR 0028 to a link Design 4 asked for. Not creep.
- **The locator now also appears on Catalogue cards and the place screen.** Design 4 makes this a property of the one slot, and Architecture 4 allows the place screen ("may use the slot too"). Not creep, but it is a visible change on the Catalogue that no criterion names. Worth one line in the PR.
- **Whitespace-only reflows** of an unrelated bullet in `docs/agents/verify/features/season-plan.md:11-14` and of the **Placed Hours** glossary entry. These are part of why both files conflict with main (finding 1).

### 6. Builds that differ from the Design or Architecture text but follow a later decision (no action)

Each of these follows a ## Decisions entry, so it is not a defect:
- `whitespace-nowrap` per token was replaced by a non-breaking space plus `overflow-wrap:anywhere` (Design 1 → decision "How the Plan Preview's day line keeps a token like `sone 4` together").
- The chevron is an inline SVG at stroke 1.25, not the sprite (decision "How the row's chevron is drawn").
- Reduced motion keeps `motion-collapse`'s height and fade, not fade only (Design 2 → decision "Reduced motion on the Plan Preview's provenance panel"; the comment is at `__plan-preview-row.tsx:259-262`).
- `readPlacedProvenance` also selects `id`, `visibility` and `ownerId`, beyond Architecture 2's list (`catalogue.server.ts:410-414`). This is needed for `isPublished` (decision "Whether a taken-down or orphaned community row's line names its publisher") and for the log line. `takedownReason` is still never selected.
- A taken-down row shows "Fjernet av en moderator" (one-way-door decision "Whether a taken-down community session says so").

### 7. Note: a community non-vouch on the Plan Preview sits behind the tap (informational)

- **Spec line:** decision "Whether a community session's non-vouch waits behind a tap": "generation places no community rows, so the preview never needs it". ADR §3 calls the non-vouch a caveat that is "never behind a tap" on the session page.
- **What the head does:** the panel (`__plan-preview-row.tsx:264`) would show a community row's non-vouch only after a tap. The route test even exercises community rows on the preview: "Attributed" and "Unattributed" now need a click. That is consistent with the decision, but only because the generator holds the invariant (`catalogue.server.test.ts` "a community row is placeable — generation retrieves stock-only"). Nothing in the preview enforces it. If generation ever places a community row, #429's "a warning withheld is a warning broken" breaks silently. No change is needed for `poc`. It is worth a sentence in the ADR, which today states the rule only for the session page.

## Checked and fine

- Architecture 1 and 3: one Prisma query, nested two levels deep (`catalogue.server.ts:449-466`), joined into the existing `Promise.all` (`sessions.$sessionId.tsx:283,312-314`). The preview panel renders from `GeneratedSession.provenance`, so a tap makes no request.
- Architecture 4: `ProvenanceSlot`, `nbProvenanceSentence` and `nbProvenanceNonVouch` live in `app/components/provenance-slot.tsx`. The Catalogue loader passes the reading, not pre-worded strings.
- Architecture 6 and 8: `data-provenance` is gone from `SessionRow`, and the route test opens the panel first. Every reader case Architecture 8 lists is a test in `app/utils/catalogue.server.test.ts:661-876`.
- Design 6: `PLAN_GENERATE_LABELS.intro` matches the spec's text word for word, and `adopted: 'Endret av deg'` is in `NB_PROVENANCE_LABELS`. The taken-down note reuses `CATALOGUE_LABELS.publishState['taken-down']`.
- Out of scope respected: no review route, no week bibliography, no field-by-field diff, no new `≈` figure, no schema change or migration, no new dependency.
- Since the merge base, main's #686 writes generated sessions with `copiedFromId: source.id` (`app/utils/plan-generation/write-sessions.server.ts:72-73`), so the session-page reader still holds after the merge. Main's luma-steps lint (ADR 0119) accepts the classes the PR adds (`rounded-2xl`, `rounded-3xl`, `text-footnote`, `text-callout`).
