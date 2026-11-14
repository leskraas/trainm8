# UI craft pass on the review's fixes (PR #720, head 5868ffc)

Scope: the UI the review's commits touched: the Plan Preview row
(`app/routes/training/__plan-preview-row.tsx`), the shared `DayLine`, and the
locator link in `app/components/provenance-slot.tsx`.

## review-animations

| Before | After | Why |
| --- | --- | --- |
| `active:bg-muted` with `motion-safe:transition-colors duration-press` (`__plan-preview-row.tsx:231`): the press tint faded in | `motion-safe:active:duration-0`: the press tint lands at once, the release still eases over `duration-press` | Press feedback snaps and the release eases (standard 9, asymmetric timing); the Design asked for an instant `active:bg-muted`. The built CSS puts `.motion-safe\:active\:duration-0` after `.motion-safe\:duration-press`, so it wins. |
| Panel opened by Enter animates `motion-collapse` (unchanged by the review) | unchanged | Standard 2 asks for no motion on a keyboard-initiated action; this is the app's documented collapse (`motion-collapse`, design-system), shared with every Collapsible. Left as a low note, not a Block. |

Verdict: **Approve**. No feel-breaking regression: the chevron turns with
`transform` and `ease-out`, the panel uses the documented `motion-collapse`
exception, reduced motion keeps only the fade, and hover is gated app-wide.

## mobile-native checklist

- Tap highlight, `touch-action: manipulation`, `user-select: none` on the row:
  from the mobile baseline for every `button` (design-system, "Mobile
  baseline"), so the row's own repeats were removed.
- Hit areas: the row is `min-h-11` (44 px, asserted in e2e). The locator link
  now carries an invisible `after:-inset-y-3.5` hit area (18 px line + 28 px).
- No 100vh, no input zoom, no scroll hijack in the touched code.
- Needs a real phone: the press tint timing and the locator link's hit area
  under a thumb on iOS Safari.

## break-ui (worst case)

`tests/e2e/mobile-overflow.test.ts`, all 9 cases pass at head (55.7 s): the
Plan Preview with a panel open at 390 px, the session page with the corpus's
longest Citation and a URL locator, and the existing 320 px / 200 % text case
that the shared `DayLine` now also serves for unfilled rows
(`e2e-mobile-overflow.txt`).
