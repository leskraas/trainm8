# UI review: PR #693 (Guard Notices in Plan's lead)

Skills run inline, in order: emil-design-eng, break-ui (report-only, no toggle rendered), mobile-native. No motion in the diff (closing a notice stays instant, as the spec asks), so animation-performance and apple-design do not apply. Judged from code and from CI's Playwright run at 6c44e00 (the new `mobile-overflow` test is green: no overflow at 390, every target >= 44px, 16px text); not rendered here.

## emil-design-eng

| Before | After | Why |
| --- | --- | --- |
| `Alert` `pr-18` down the whole notice | `pr-4`, `pr-10` on the first block only | Keeps a quarter of the phone width for the words; already done in the diff |
| `text-balance` on a long phone notice | `text-pretty` | Balance narrows every line to the last; already done |
| All lines muted | `li` in foreground, reasons muted | Warning reads before its reason; already done |

No new finding: no motion, no hover-only affordance (Tailwind v4 gates `hover:` behind `(hover: hover)`), the close button keeps the repo's `after:` 44px idiom.

## break-ui (report-only)

| # | Severity | Field | Worst-case value | What happens | Fix |
|---|---|---|---|---|---|
| 1 | Fragile (known, decided) | `season.bandWarnings` | 24 off-band sessions | Band notice ~2,500px in the lead, pushing Bibliotek far down | Group lines per block and goal: recorded follow-up in #672's Decisions ("Unbounded band-fit lines") |
| 2 | Fragile (judgement) | first fact line | a ramp line that wraps to 2+ lines | Whole first `li` keeps `pr-10`, not only the first line: a slightly narrower first item, no collision with the close button | None needed; the comment should say "first block" (Standards finding 1) |

Held up: no warnings renders `null` (no wrapper, no gap); one warning of each kind; `?outline=`/`?event=` switch re-mounts by `outlineId`; inline-link `::after` targets with `space-y-2` between band lines (e2e asserts >= 44px); all copy from `labels.ts`.

## mobile-native

Hover gated by Tailwind v4; no `100vh`, no inputs, no gesture surface, no `user-select` change; targets 44px (close button `after:-inset-1.5` on a 36px icon button, links `::after` -13/-14px). Nothing to fix from code.

**Needs a real phone:** whether the first notice's peek above the tab bar is enough at 390x844, and that at 320x700 no notice reaches the first screen is acceptable (spec's own "needs a real phone" line); tap accuracy between adjacent band links' `::after` areas.

Findings: none beyond Standards finding 1.
