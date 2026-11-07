# UI review, PR #691 at 4ea4dcf (emil-design-eng, break-ui report-only, mobile-native; run inline)

Skills loaded from `.claude/skills/` by reading; no motion in the diff, so animate/review-animations/animation-performance/apple-design not applicable.

## emil-design-eng
- Static figures, no meter, no motion: right, they change only on navigation.
- `text-footnote tabular-nums`, muted labels, values `font-medium`, track name in its `-ink`: matches the design and design-system tokens.
- `≠` as `role="img"` with `aria-label` and `title`, `text-status-under font-bold`: fine.

## break-ui (report only, not rendered)
- Huge figure (`1 270,5 km`): value+unit nowrap, in a `minmax(0,1fr)` column; the `@max-[300px]` container stacks the name above. Holds by construction.
- Many unmeasured (`12 økter uten km`): free to wrap; ≠ cannot appear then (`drift` returns null when planned is null and unmeasured > 0).
- Many existing sessions (`Planlagt teller også med 14 økter …`): wraps as prose. But see Spec S1: the count can be wrong.
- Four tracks: subgrid keeps the columns aligned.
- Week missing from `weekVolumes`: card shows no figures, silently (cannot happen: one entry per season week).

## mobile-native
- No touch target, no hover, no input, no 100vh, no fixed position added. Nothing to fix.

## Needs a real phone
VoiceOver on iOS Safari reading the track list and the ≠; iOS Larger Text at its largest; 390×844 overflow check.

No UI finding beyond S1.
