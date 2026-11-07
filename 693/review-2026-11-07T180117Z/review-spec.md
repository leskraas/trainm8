# Spec review: PR #693 against issue #672 (ACs, Design, Architecture, Decisions)

| AC | Status | Where |
|---|---|---|
| Ramp Guard in lead, Avansert closed, same content | met | plan.tsx `notices=`, __plan-lead-card.tsx; test "stand in Plan's lead" |
| Availability and band fit likewise | met | PlanGuardNotices; same test |
| Once on the page | met, structural (three notices module-private) | __blocks-reading.tsx removal; test "on the page once" |
| Closable, back next visit | met (DismissibleNotice unchanged, keyed by outlineId) | test "a dismissal belongs to one plan" |
| No warnings: no notice/heading/space | met (`return null`, no wrapper) | test "no Guard Notice, no stack" |
| Viewed plan's warnings (`?outline=`, `?event=`, resting) | met (loader `season`) | test "`?outline=` and `?event=`" |
| Fix links work from lead | met (decision: no new links; existing two work) | test "links inside a Guard Notice" |
| 390x844 no overflow, 44px targets, text-base md:text-sm | met | tests/e2e/mobile-overflow.test.ts new test (Playwright green in CI at 6c44e00) |
| Ramp copy convention / no injury claim, Norwegian in labels.ts | met (copy untouched) | |

Design/Architecture: role="note" via DismissibleNotice, alert.tsx unchanged; `mb-4` dropped; first-block gutter `pr-4`/`pr-10` (implement decision); foreground `li`; `::after` 44px link targets; ADR 0112 + 0101 note; GLOSSARY **Guard Notice**; `notices` slot outside PlanCard; key by `season.outlineId`. All present.

Scope creep: `data-blocks-reading` attribute (test hook) and `space-y-2` on band list (hit areas): both serve the spec. `text-pretty` is a recorded implement decision.

Findings: none.

Verdict: PASS.
