# PR #695 review — merged findings and fixes
| Finding | Review | Severity | Shown by | Result |
|---|---|---|---|---|
| S1 non-Monday week key accepted by the season-anchor form | Standards, Security | medium | new test `a Season Anchor fresh start on a day that is not a Monday…` red at abf5c0d (preview accepted, no 400) | fixed a101bf0 |
| P1/U1 preview rows show no Volume Currency | Spec, UI | medium | new route test red at abf5c0d (`39,3 → 42` with no `km`); `anchor.unit` unused | fixed ee9824c |
| S2/P2 "Uke" copy hard-coded in __season-edits.tsx | Standards, Spec, UI | low | __season-edits.tsx lines `prefix = 'Uke'`, `Uke {week.weekNumber}`, `Uke {row.weekNumber}` | fixed de861aa |
| D1 page restates anchor-list rules (removable, in force) | Design | medium | __season-edits.tsx `removableSegments`/`anchorDefaults`; new domain test red | fixed 03653ce |
| D2 __season-edits.tsx ~1,600 lines | Design | low | wc -l | follow-up |
| A1 scroll wait on an infinite animation would never resolve | UI (animation-performance) | low | not shown: no infinite animation renders in Avansert at rest | follow-up |
| B1 long picker labels at 320 px in the shared SelectTrigger | UI (break-ui) | low | needs a real phone | follow-up |
