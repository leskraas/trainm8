# Design scan: audit report (origin/main 4c0bc03f, 2026-11-07)

Method: the `bredvid-design-engineering:design-audit` skill is not installed (no plugin, no `.claude/skills/design-audit/`), so this is a substitute audit: the app as `docs/agents/verify/README.md` says (port 3100, seeded kody, mocks), Playwright at 390x844 and 1280x800, DOM measurements of target size, font size, horizontal overflow, unrounded floats, console errors, plus a read of the screenshots against docs/design/design-system.md.

Flows: I dag (/), Home Timeline (/season), Plan (/training/plan), Meg (/me), login.

| Check | I dag | Season | Plan | Meg |
|---|---|---|---|---|
| Horizontal overflow (phone) | none | none | none | none |
| Unrounded floats in text | none | none | none | none |
| Targets under 44px by box | 3 (hit areas reach 44) | week-strip bars 13px wide (deliberate scrubber, ADR 0066 s3) | 5 compact pills (32px, hit areas) | 3 glossary buttons 16px high |
| Text under the 11px token floor | none | 10px: strip week numbers, phase label | none | none |
| Landing state | clean | **12px sliver of Friday's row under the sticky header** | clean | clean |
| Console | hydration-mismatch warning on every route | | | |

Dev-only overlays (the "kody" pill, the round devtools button) cover the tab bar's right edge on phone; they do not ship, so they are not findings.

Screenshots: phone-*.png and desktop-*.png (viewport and -full), phone-season-stray-glyph.png (finding 1), phone-season-top-strip.png (strip), audit-raw.json (measurements).
