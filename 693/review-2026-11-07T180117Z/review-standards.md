# Standards review: PR #693 at 6c44e00 (diff origin/main...HEAD)

Sources: CLAUDE.md (guard files, exact deps, UI craft), docs/design/ui-conventions.md (§2.2 touch targets, §2.3 type), docs/design/design-system.md, docs/agents/*.md (production-seed-data, domain), GLOSSARY.md, docs/adr (0040 §12, 0081, 0085, 0101), the smell baseline.

- No guard file touched; no dependency added; copy stays in `SESONG_NOTICE_LABELS` (ADR 0081); no motion added; e2e builds its data as fixtures (production-seed-data.md respected).
- Inline links use the `after:` hit area, which ui-conventions §2.2 reserves for inline text links: conforms.
- `text-base md:text-sm` on notice text: what the spec asks; design-system.md lets generated components keep text-sm/text-base.
- `has-data-[slot=alert-action]:pr-4` overrides Alert's `pr-18` through `cn`/tailwind-merge (same variant): works.

## Findings

1. **Low, judgement (comment says what the code does not do).** `app/routes/training/__season-notices.tsx` DismissibleNotice JSDoc ("Only the first line clears the close button ... the first line of the first block is the only one beside the button") and the AlertDescription comment ("the first line of the first block steps in") describe a first-*line* gutter, but the classes `[&>p:first-child]:pr-10 [&>ul:first-child>li:first-child]:pr-10` pad the whole first block (every line of the first fact line or first paragraph). A reader trusting the comment would expect a float/`::first-line` trick. Fix: say "the first block (first fact line or paragraph)". 

No smell from the baseline: `PlanGuardNotices` removes the duplicated ramp derivation rather than adding one; `notices` is a named slot, not speculative.

Verdict: PASS (one low comment fix).
