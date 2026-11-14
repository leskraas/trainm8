# PR #720 review: Spec axis (review run 3, read cold)

- **Spec:** issue #475 body at fetch time (10 acceptance criteria, Scope, Design 1–8, Architecture 1–8, ## Decisions through "How criterion 5 names account erasure's second exception and ADR 0122").
- **Code:** `git diff origin/main...origin/agent/475-build-the-review-surface`. The head is `ce79486`, main is `ed354f5` and the merge-base is `b4b32f5` (#700). The diff has 46 commits and touches 27 files.
- **Phase:** `poc`. At this phase, only a high or critical finding on the happy path, a secret or a one-way door sends the work back to implement.

## Verdict

No critical, high or medium finding. Each of the 10 criteria is implemented as currently worded. Every place where the build departs from the Design text is recorded in ## Decisions, except the two low items below (S2, S4). Nothing merged to main since the merge-base changes what a criterion means (see "Main since the merge-base").

## Criteria walk

| # | Criterion (short) | Where at head | Status |
|---|---|---|---|
| 1 | Preview row: day, sport, kind, zone and title, with no source line. The row is one control of at least 44 px, its accessible name names the session, and a hairline chevron is its only mark. | `app/routes/training/__plan-preview-row.tsx:258-285` (`CollapsibleTrigger`, `min-h-11`, `DayLine`+title, inline 1.25-stroke chevron `:162-177`). The old `SessionRow` with `data-provenance` is deleted from `plan.generate.$eventId.tsx`. | Met |
| 2 | Tap, Enter or Space opens the Session Provenance below the row: the Citation (author, work, year, locator) or the convention or hand-written notice. Re-tap, Escape or opening another row closes it. At most one row is open. | `usePlanPreviewOpenRow` `:74-108` is season-wide state. Escape is handled `:234-250`. The panel is `:286-299`. `ProvenanceSlot` adds the locator `app/components/provenance-slot.tsx:115-133`. | Met |
| 3 | Unfilled rows, absences, capacity fit and week numbers stay visible. Nothing that warns or qualifies a number moves behind the tap. | `UnfilledRow`, absences and `CapacityLine`/`PlacedWeekLine` are unchanged in `plan.generate.$eventId.tsx` (lines ~263-350 and 820-880). The non-vouch moves behind the tap, but no community row reaches the preview (ADR 0122 §3, ## Decisions "No community branch…"). | Met |
| 4 | Session page: one quiet line after the numbers. For a corpus row it shows the Citation. For a convention or hand-written row it shows the notice. For a community row it shows the publisher's name (or "an athlete") and puts the non-vouch on line 2. Exception: copies with no `copiedFromId` show no line. | `sessions.$sessionId.tsx` shows the slot last in the prose `CardContent` after `WorkoutPrescription` (lines ~1004-1056). `readPlacedProvenance` `app/utils/catalogue.server.ts:452-497` runs inside the loader's `Promise.all`. | Met. See S1 for the ADR citation. |
| 5 | The two slots stay apart, and a taken-down session keeps its byline and non-vouch. Three accepted exceptions. | The slot is a union (`provenance-slot.tsx:84-146`). The taken-down mark appears only on `community` (`:134`). The Attribution is read through `isPublished` (`catalogue.server.ts:478`). | Met |
| 6 | An adopted session keeps its line and says "changed" in that same line. | `adopted={session.adoptedAt != null}` adds `Endret av deg · ` in front (`provenance-slot.tsx:100-105`). Hop 2 applies only when `adoptedAt` is set (`catalogue.server.ts:472`). | Met |
| 7 | A retired entry still shows its Citation. | There is no `retiredAt` filter in `readPlacedProvenance`. The test is in `catalogue.server.test.ts` ("a retired entry still gives…"). | Met |
| 8 | Own session, a copy of a non-Catalogue Workout, or a deleted source: no line and no placeholder. | `return null` when neither hop reaches an entry. `SetNull` covers a deleted source. The test is "an athlete's own fork of a Stock Workout, a deleted source…". | Met |
| 9 | The preview, session page and Catalogue show the same Norwegian sentence from `labels.ts`. | One component `app/components/provenance-slot.tsx`, rendered by `catalogue.tsx`, `catalogue.place.$workoutId.tsx`, `__plan-preview-row.tsx` and `sessions.$sessionId.tsx`. The Catalogue loader no longer pre-words strings. | Met by construction |
| 10 | 390×844: the preview with a row open and a session page with the longest Citation and a URL locator stay inside `mobile-overflow.test.ts`. | `tests/e2e/mobile-overflow.test.ts` adds two cases. The longest work is computed from `catalogue-corpus.citations.ts`, the locator is a long URL, and the session is adopted. | Met (I did not run it) |

**Code paths checked against criteria 4, 6 and 8:**
- Generation writes a fresh copy of the Stock Workout with `copiedFromId: source.id` (`plan-generation/write-sessions.server.ts:72`).
- A Catalogue placement writes `source: 'authored'` with `copiedFromId` (`catalogue.server.ts:~594`).
- An adopting edit forks with `copiedFromId: previous.id`, only for `generated`/`detected` sessions (`workout.server.ts:1385-1415`). That makes two hops.
- A Juster swap copies with the pick's `copiedFromId`, which for a Catalogue pick is the Catalogue row itself (`juster.server.ts:837-845, 969-973`). That makes one hop.
- An exercise pick has no `copiedFromId`, so it shows no line. That is correct.
- I found no path where hop 2 would cite a Stock Workout on the athlete's own fork.

## (a) Missing or partial

None.

- **S3 (low, test coverage):** criterion 4's community and adopted cases have no session-page route test. `app/routes/training/sessions.$sessionId.route.test.tsx` adds only the convention-once and last-in-prose cases. The community byline, the non-vouch on line 2 and the taken-down mark are pinned one level down, in `catalogue.server.test.ts` (reader) and `provenance-slot.test.tsx` (wording). "Endret av deg" on the page is pinned only by the e2e case. Nothing is wrong at the head; a regression in how the route passes `takenDown` or `adopted` would only be caught by e2e or QA.
  - **Verify:** `git show origin/agent/475-build-the-review-surface:app/routes/training/sessions.\$sessionId.route.test.tsx | grep -n "^test("`.

## (b) Behaviour not asked for (scope creep)

All of it is small and consistent with the Design or a decision.

- **S5 (low): the session page strips the English convention or hand-written notice from the description.**
  - Where: `withoutProvenanceNotice`, `app/utils/plan-generation/provenance.ts:103-124`, used at `sessions.$sessionId.tsx` ~851-858.
  - No criterion asks for it. It changes existing description text on every placed convention or hand-written session. It does mirror what `catalogueBlurb` already did on the Catalogue, and it avoids saying the kind twice next to the slot.
  - Accept it. If anyone asks, record it as a decision.
- **S6 (low): the Catalogue card and the place screen now show the Citation's locator as a link.** These are `catalogue.tsx` `EntryCard` and `catalogue.place.$workoutId.tsx` through the shared slot.
  - No criterion names the Catalogue's locator. Design item 4 (one slot, with `[ · locator]`) and Architecture item 4 ("The Catalogue's place screen may use the slot too") make it intended. It is not creep against the spec, but it is a visible change on the Catalogue.
- **S7 (low, docs): an unrelated fix in `docs/agents/verify/features/season-plan.md:11-18`.** It moves a misplaced Week Pattern sentence that had been pasted into the Guard Notices bullet. It is harmless and outside #475.

The `' · Fjernet av en moderator'` mark on a taken-down line is athlete-visible copy that no criterion names. ## Decisions already records it ("Whether a taken-down community session says so", one-way door, autonomy `full`), so it is not a finding.

## (c) Implemented, but not as the spec says

- **S1 (low, spec and ADR drift): criterion 4 cites "Consequences of ADR 0122" for the _Kopier_ exception, but ADR 0122 does not name _Kopier_.**
  - The spec says: "One exception is accepted as a `poc` debt (Consequences of ADR 0122): a session whose Workout was copied again … by copying a session onto another day (_Kopier_) … shows no line." Criterion 5 exception (3) inherits the same list.
  - ADR 0122's Consequences name "a **Week Replan** make-up or add, copy-week and stamping" only (`docs/adr/0122-…md`, Consequences bullet 3). `copySessionToDay` is the Kopier action (`app/utils/day-stamp.server.ts:~169-188`, `copyWorkout(tx, original, userId)` with no back-pointer).
  - The behaviour matches the criterion. The ADR it points to just doesn't record that path. ## Decisions ("How criterion 4 names the sessions copied again…") says the criterion names both Week Pattern stamping and Kopier, but the ADR was not updated to match.
  - **Fix:** add "copying a session onto another day (_Kopier_, `copySessionToDay`)" to that Consequences bullet.
  - **Verify:** `git show origin/agent/475-build-the-review-surface:docs/adr/0122-provenance-is-available-not-asserted-a-row-carries-the-plan-and-its-provenance-is-one-tap-away.md | grep -n -i -E "kopier|another day"` returns nothing.
- **S2 (low, design deviation not in ## Decisions): `aria-controls` is present only while the panel is mounted.**
  - The spec says, Design item 1: "The whole row is one `<button>` … with `aria-expanded` and `aria-controls`."
  - At the head, `__plan-preview-row.tsx:261-262` leaves `aria-controls` to Base UI, which sets it only while the panel exists (commit 51b107c). No criterion requires `aria-controls`, and this is arguably the more correct ARIA. Still, it departs from the Design text without a ## Decisions entry.
  - **Verify:** the route test "a row controls its panel only while the panel exists".
- **S4 (low, architecture wording): the reader selects more than "only what the slot shows".**
  - The spec says, Architecture item 2: "That is `authorship` and `description` off the Workout, the four citation columns off the entry, and `displayName`, `publishedAt` and `takenDownAt` off the Attribution."
  - At the head, `placedProvenanceRowSelect` (`app/utils/catalogue.server.ts:408-426`) also selects `id`, `visibility` and `ownerId`. `isPublished` needs the last two, from the review decision "Whether a taken-down or orphaned community row's line names its publisher", and the warn log uses `id`. `takedownReason` is still never selected, which was the item's point. No security impact.

## Contradictions with decisions made elsewhere

- **Design item 1, `whitespace-nowrap`:** replaced by NBSP inside tokens. This is recorded in ## Decisions (implement) and is consistent at `__plan-preview-row.tsx:199-209`.
- **Design item 2, "reduced motion keeps only the fade":** reversed by ## Decisions (review) to follow ADR 0077 §5 and ADR 0085 §4. The build follows the decision (`__plan-preview-row.tsx:289-292`, `motion-collapse` default from `app/components/ui/collapsible.tsx`).
- **Decisions entry "Where the session page reads a source from" (spec, one hop):** superseded by the design and architecture decisions (two hops when adopted) and by ADR 0122 §5. The build follows the later decisions. The spec decision's text still says "one hop… no source line when that hop finds no Catalogue row", which now reads stale beside criterion 6. This is informational, since later decisions record why.
- **ADR 0030 rule 3 (hover parity), ADR 0051 §5 and ADR 0053 §7 (walk the chain):** each is narrowed by ADR 0122 §5 and §6, with pointers added in each ADR. They are consistent.
- **ADR 0122 §3:** the Plan Preview may hold a non-vouch behind the tap only while generation places stock rows only. This holds today (ADR 0053 §4). The decision is recorded as a debt.

## Main since the merge-base

Main gained one PR: #677 (#468, orphaned-workout purge, ADR 0121), at `ed354f5`.

- `git merge-tree --write-tree origin/main origin/agent/475-build-the-review-surface` is clean. GLOSSARY.md and ADR 0051 overlap but don't conflict.
- The PR already renumbered its ADR to 0122 (c6f6be6), and no file in the diff refers to the PR's ADR as 0117 any more. GLOSSARY.md:1222's "ADR 0117" is main's own, unrelated ADR.
- Criterion 5's exception (2) already names "the boot job that erases older orphans, #468".
- #677 renames the account-erasure path for a row someone points at directly from "withdrawn" to "kept **unattributed**": `private`, entry retired, Attribution deleted. A session copied from such a row reads `community` with no Attribution, which gives "Publisert av en utøver — trainm8 kan ikke si hvem." plus the non-vouch. That is what criterion 5 asks.
- #677 changes `spliceLineage`'s query (`where: { copiedFromId: { in: parentOf.keys() } }` in place of an ownerId filter). It doesn't change the splice result criterion 5 relies on.

So nothing on main changes what a criterion means. The branch still lacks #677; update-branch is mechanical.

## How to verify (summary)

```
git fetch origin agent/475-build-the-review-surface main
git diff origin/main...origin/agent/475-build-the-review-surface --stat
git show origin/agent/475-build-the-review-surface:app/utils/catalogue.server.ts | sed -n 400,500p   # reader (criteria 4-8)
git show origin/agent/475-build-the-review-surface:app/components/provenance-slot.tsx               # slot (criteria 2, 5, 6, 9)
git show origin/agent/475-build-the-review-surface:app/routes/training/__plan-preview-row.tsx      # row and panel (criteria 1-2)
git grep -n "copyWorkout(" origin/agent/475-build-the-review-surface -- app ':!*.test.ts'           # the back-pointer paths (criterion 4 exception)
npx vitest run app/utils/catalogue.server.test.ts app/components/provenance-slot.test.tsx 'app/routes/training/plan.generate.$eventId.route.test.tsx' 'app/routes/training/sessions.$sessionId.route.test.tsx'
npx playwright test tests/e2e/mobile-overflow.test.ts -g "#475"
```

Debt lines for the comment (`poc`):
- Debt: ADR 0122's Consequences don't list _Kopier_ (`copySessionToDay`) among the copies that set no back-pointer, though criterion 4 cites it (S1).
- Debt: there is no session-page route test for a community or adopted placed session (S3).
