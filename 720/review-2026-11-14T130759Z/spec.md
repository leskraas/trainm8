# PR #720 / issue #475: Spec-axis review (cold read, run 2)

- Head `3c5e9a5` (`origin/agent/475-build-the-review-surface`), base `origin/main` `ed354f5`. Diff: `git diff origin/main...origin/agent/475-build-the-review-surface` (27 files, +1554/−260).
- Spec: the body of issue #475 as fetched by `conductor.py fetch … 475 --for review`: 10 acceptance criteria (C1–C10), Scope, Design 1–8, Architecture 1–8, ## Decisions.
- Main has moved since the branch last merged it: `ed354f5` (PR #677 / #468, orphaned-workout purge, **ADR 0121**) landed after merge-base `b4b32f5`. GitHub reports the PR as mergeable, but see S1 and S2.
- Phase `poc`: only a high or critical finding on the happy path sends this back. None of the findings below is on the happy path. S1 is mechanical and should be fixed before merge anyway.

## Verdict

C1, C2, C3, C6, C7, C9 and C10 are met as written. C4, C5 and C8 are met on the paths the criteria name, with two gaps (S2, S3). The out-of-scope list is respected: there is no review route, no bibliography, no field diff and no new `≈`. The Design and Architecture deviations each have a recorded decision: nbsp instead of `whitespace-nowrap`, motion-collapse's own reduced motion, extra columns selected for `isPublished`, and the one-or-two-hop read. No critical or high findings.

## Findings

### S1. medium: ADR 0121 now exists twice once merged with main; C5's ADR pointer is stale
- **Spec line:** C5: "Consequences of the ADR this issue records, ADR 0117 on #720 until update-branch renumbers it"; Architecture: "The build follows ADR 0117".
- **What:** the merge commit `3c5e9a5` renumbered the provenance ADR from 0117 to 0121. Main has since taken 0121 for `0121-orphaned-workouts-are-erased-once-by-a-boot-job-and-lint-keeps-deleteaccount-the-one-path.md` (#468). The merged tree has two `docs/adr/0121-*.md` files:
  - merged `ADR 0051` links "ADR 0121" to the provenance ADR at line 156 and to the orphan-purge ADR at lines 270 and 273;
  - merged `GLOSSARY.md` cites "ADR 0121" for Account Erasure (line 1054) and for "available, not asserted" (lines 2408 and 2447);
  - every `ADR 0121 §n` code comment in the diff becomes ambiguous (`sessions.$sessionId.tsx`, `catalogue.server.ts`, `provenance-slot.tsx`, `__plan-preview-row.tsx`, `catalogue.tsx`).
- **Where:** `docs/adr/0121-provenance-is-available-not-asserted-a-row-carries-the-plan-and-its-provenance-is-one-tap-away.md` and every reference to it.
- **Fix:** renumber to the next free number (0122) and update the references. The issue's C5 text also still says 0117.
- **Verify:** `T=$(git merge-tree --write-tree origin/main origin/agent/475-build-the-review-surface | head -1); git ls-tree --name-only $T docs/adr/ | grep 0121`

### S2. medium: since #468, an erased publisher takes the community line and the non-vouch away; criteria 4, 5 and 8 now disagree, and the PR's orphan test pins a state main purges
- **Spec lines:**
  - C5: "a community session's line … always carries the non-vouch … A session copied from a community row that was later taken down still says an athlete published it and trainm8 does not stand behind it. One exception is accepted as a `poc` debt … [the splice to a cited Stock Workout]".
  - C4: "(or that an athlete published it, where no name can be shown)".
  - C8: "…or whose source Workout no longer exists shows no source line".
  - Decision 3: "#429 keeps a caveat about trusting the session out of disclosure".
- **What changed on main:** the Account Erasure in `app/utils/account-deletion.server.ts` on `origin/main` (`scopeFilters`/`erase`, around lines 100–178) keeps a Shared Workout only when another athlete's session, slot or Program day points at it **directly**. A Catalogue placement deep-copies, so the placed session points at its copy, not at the Shared Workout. The Shared Workout is therefore erased, and the copy's `copiedFromId` is spliced to the nearest surviving ancestor:
  - When that ancestor is a cited Stock Workout, the session reads the Stock Workout's Citation. This is the exception C5 accepts.
  - When there is none, `copiedFromId` becomes `null` and `readPlacedProvenance` returns `null`. The community session loses both the byline and the non-vouch. C8 literally allows this, but C5's "always carries the non-vouch" does not.
- **Why #468 makes it worse:** #468 adds `eraseOrphanedWorkouts`, a boot job that does the same to every Orphaned Workout left by deletions before #641. On first boot it removes the "orphan reads as 'an athlete published it'" case that `readPlacedProvenance`'s docblock (`app/utils/catalogue.server.ts` ~433–435) and ADR 0121 §5 ("or left without an owner") describe. After that, C4's "where no name can be shown" survives only for taken-down rows and kept-unattributed rows.
- **Tests:** `catalogue.server.test.ts:795` ("…names its publisher only while the row is still published") builds the orphan with a raw `prisma.user.delete`, a state main now purges at boot. No test runs `deleteAccount` or `eraseOrphanedWorkouts` and then `readPlacedProvenance`.
- **Not recorded:** neither ## Decisions nor ADR 0121's Consequences names the null-splice case.
- **Where:**
  - `app/utils/catalogue.server.ts` (`readPlacedProvenance`, head ~425–493)
  - ADR 0121 §5 and Consequences, last bullet
  - `app/utils/catalogue.server.test.ts:795–834`
- **Ask (human, two-way door):** either
  - name "publisher erased and no cited ancestor → no line, non-vouch lost" as a second `poc` exception in C5 and in ADR 0121's Consequences, or
  - give the splice a way to keep the community reading, which is the same owed fix the C5 exception already points at.
- **Verify:** on the merged tree, in a test:
  1. Create an author, a `public` Shared Workout with an entry and an Attribution, and a placed copy for another athlete.
  2. Run `deleteAccount(author)`, or null the owner and run `eraseOrphanedWorkouts`.
  3. Check that `readPlacedProvenance(copy, null)` returns `null`.

### S3. medium: C4 and the Scope's "every session copied from a Catalogue row" are partial. Copy-week, stamping and Week Replan make-up or add copies lose the line, with no decision recording it
- **Spec lines:**
  - Scope In: "the source line on the session page for every session copied from a Catalogue row".
  - C4: "a session whose Workout was copied from a Catalogue row shows its Session Provenance".
  - C5: a community session "always carries the non-vouch".
- **What:** `copyWorkout` is called without `copiedFromId` at four places:
  - `app/utils/plan-outline/copy-week.server.ts:239`
  - `app/utils/day-stamp.server.ts:188`
  - `app/utils/load/week-replan-proposals.server.ts:639`
  - `app/utils/load/week-replan-proposals.server.ts:781`

  A generated or Catalogue-placed session copied by any of these gets a Workout whose `copiedFrom` is null, so `readPlacedProvenance` returns null and the page shows no line. For a session placed from a community row, the copy also drops the non-vouch.
- **Not decided:** ADR 0121's Consequences (second bullet) records this as owed when the project leaves `poc`. No ## Decisions entry or criterion exception accepts it, unlike the erasure splice (C5) and the "changed without adoption" debt (Decision "What 'changed by you' … is read from").
- **Severity:** off the happy path for `poc`, but it is a criterion gap that only an ADR sanctions.
- **Ask:** add a Decisions line (and the C5 exception wording for the community case), or carry the copied Workout's own `copiedFromId` onto the new copy as the ADR suggests.
- **Verify:** `git grep -n "copyWorkout(" origin/agent/475-build-the-review-surface -- app ':!*.test.ts'`, then read each call's overrides. A route test would copy a week holding a placed community session and assert the session page has no `[data-provenance]`.

### S4. low: scope creep. The session page now strips the English convention or hand-written notice from the description
- **Spec:** no criterion or Design item asks to change the description. Design 5 places the slot "after the description". The nearest is C9, which is about the slot sentence only.
- **What:** `sessions.$sessionId.tsx` (head, around the `withoutProvenanceNotice` call after `useAthleteTimezone`) now removes `CONVENTION_NOTICE` or `HAND_WRITTEN_NOTICE` from the shown description whenever a provenance line exists. That needs the new `withoutProvenanceNotice` in `app/utils/plan-generation/provenance.ts:111–124`. This matches what the Catalogue card already did, and it avoids saying the notice twice. But it contradicts the `CONVENTION_SLOT_LINE` docblock in the same file (~provenance.ts:134–140): "the notice is the row's own words in the session's description … Both are shown, and neither is a substitute for the other". That docblock is now stale.
- **Verify:** `git show origin/agent/475-build-the-review-surface:app/utils/plan-generation/provenance.ts | sed -n 126,141p`, then the route test "a placed convention session states its notice once…" in `sessions.$sessionId.route.test.tsx`.

### S5. low: small unrequested additions (acceptable, listed for completeness)
- `readPlacedProvenance` logs `console.warn` for an unsourced placed row (`catalogue.server.ts`, the `unsourced` branch). No criterion asks for it. It is harmless.
- `docs/agents/verify/features/season-plan.md` repairs an unrelated garbled bullet about the Week Pattern editor. It is a tidy-up outside #475.
- The Catalogue card now shows the Citation's locator as a link. That is new on the Catalogue, but Design 4 specifies it for the shared slot. Not creep, just a visible Catalogue change no criterion names.
- The place screen (`catalogue.place.$workoutId.tsx`) renders the shared slot. Architecture 4 allows this ("may use the slot too").

### S6. low: C2's uncited kinds are no longer tested in the Plan Preview panel
- **Spec line:** C2: "…and the convention or hand-written notice, in their own words, for those two kinds."
- **What:** the preview route test "the two uncited stock kinds say so, each in its own words" was removed (`plan.generate.$eventId.route.test.tsx`).
  - The slot unit test checks the convention sentence only. `provenance-slot.test.tsx:63` has no hand-written assertion.
  - No test opens a convention or hand-written row's panel.
- The behaviour holds by construction: one `ProvenanceSlot`.
- **Verify:** `git show origin/agent/475-build-the-review-surface:app/components/provenance-slot.test.tsx | grep -n "hand"`

## Criteria checked and met (head line refs)

**C1: preview row.**
- `app/routes/training/__plan-preview-row.tsx:258–285`. The row is one `CollapsibleTrigger` button with `min-h-11`.
- Its contents are the day line (weekday · sport · archetype · zone) and the title; the button's accessible name comes from these.
- The chevron (`:162–177`, stroke 1.25, `aria-hidden`) is the only extra mark.
- `data-provenance` and the source line are gone from `plan.generate.$eventId.tsx`.

**C2: panel.** `usePlanPreviewOpenRow` (`:74–108`) holds one open key per season.
- Re-tapping the same row closes it (`:83–87`); opening another row replaces it.
- Escape closes the panel and returns focus (`:234–250`).
- Enter and Space work natively on the button.
- The panel shows the `ProvenanceSlot` (`:286–299`).

**C3: nothing that warns moves behind the tap.**
- Unfilled rows are unchanged and are not buttons (`plan.generate.$eventId.tsx:873`); a test asserts no button.
- The absences, the capacity line and the week numbers are untouched.
- The non-vouch behind a tap on the preview is justified by ADR 0121 §3: retrieval is stock-only (`generate.server.ts:179`, `retrieval.ts:172`).

**C4: session page line.**
- `sessions.$sessionId.tsx` puts the slot last in `CardContent`, after the description.
- It is inside the loader's `Promise.all` and carries `data-provenance`.
- The non-vouch is on line 2, as C4 was rewritten to say.

**C5: slots apart.**
- `SessionProvenance` is a union, so a slot holds either a Citation or an Attribution.
- The taken-down flag shows only on a community row (`provenance-slot.tsx:134`).
- A taken-down row shows the unnamed byline, the non-vouch and `Fjernet av en moderator`.

**C6: adopted.**
- The two-hop read (`catalogue.server.ts`, `candidates`) is pinned by a real adoption test (`catalogue.server.test.ts:695`).
- `Endret av deg · ` leads the same line.

**C7: retired.** Not filtered (test `:836`).

**C8: own, outside, deleted.** Return null; test `:849` and the page test.

**C9: one wording.** One component reads `labels.ts`, and the Catalogue loader no longer pre-words strings.

**C10: overflow.** Two e2e cases were added to `tests/e2e/mobile-overflow.test.ts`:
- the preview with a row open;
- a session page carrying the corpus's longest work title and a URL locator.

The cases were not run in this read-only review.

## Main since the issue was written

1. **#468 / ADR 0121 (orphan purge, Account Erasure for Orphaned Workouts).** It collides with this PR's ADR number (S1). It also turns C4's orphan case ("where no name can be shown") into C8's "source no longer exists", so community sessions lose their non-vouch (S2).
2. **Before the branch's last merge.** ADR 0117 (load recompute notice) forced the 0117→0121 renumber that C5's text still names. ADR 0120 (Generation Record, weeks relaid by the generator) does not change any criterion: relay writes copies with `copiedFromId` (`plan-generation/write-sessions.server.ts:72`).
