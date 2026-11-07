# UI review: PR #699 (emil-design-eng, break-ui report-only, mobile-native), read from code; no device run

emil-design-eng
- No motion added; press feedback via shared buttons/chips; preview is a card, focus moved programmatically. Matches the design's "no entrance animation".
- Low: the preview section takes focus with `outline-none` and no focus ring (`__activities-edit.tsx`, preview `<section tabIndex={-1}>`). It is a non-interactive landing target, so acceptable; noted.

break-ui (report only)
- Long track names / many overrides: lines use `[overflow-wrap:anywhere]`; an override list "uke N (dato)" may wrap inside an item where the design asked items never split (low; needs a real phone check).
- Zero items: each "Dette endres også" item renders only when non-empty; empty notes render nothing.
- Many sports: chips are the start's own component (wrapping flex).

mobile-native
- Buttons full width on phones, links min-h-11 (44 px), no sticky Bekreft, scrollIntoView with block nearest/start. Needs a real phone: scroll-into-view of the stale line under the on-screen keyboard-free state, and tap feel of the chips.
