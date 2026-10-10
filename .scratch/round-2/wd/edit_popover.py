import sys

p = sys.argv[1]
s = open(p).read()


def rep(old, new, count=1):
    global s
    assert s.count(old) == count, (old[:80], s.count(old))
    s = s.replace(old, new)


rep(""" * The shell is the spec's popover language: caret-anchored, 12 px radius,
 * layered shadow, 130 ms scale-in from the anchor (reduced-motion honored),
 * an uppercase mono cap label, max-width 324 px clamped to the viewport, and
 * flip-above when cramped (Base UI's default collision avoidance). It is""", """ * The shell is the spec's popover language on the app's popup recipe (ADR
 * 0085 §4, #505 round 2): caret-anchored, the luma popup radius and shadow,
 * `motion-popup` — out of the anchor from `scale(0.96)` plus opacity, 200ms in
 * and 150ms out on `--ease-out`, the scale dropped under reduced motion — an
 * uppercase cap label on the type scale's overline step, max-width 324 px
 * clamped to the viewport, and flip-above when cramped (Base UI's default
 * collision avoidance). It used to scale in from 90 % on tw-animate keyframes
 * for 130ms: a keyframe restarts from zero when a retarget interrupts it, and
 * `zoom-in-90` is a bigger jump than anything else in the app makes. It is""")
rep("""/**
 * The popup shell treatment of the spec's popover language (§2.4): 12 px
 * radius, layered shadow, 130 ms scale-in, 324 px max width. Exported for
 * the editor's menu-summoned popovers (the ⠿ gutter editors, the ⋮ "Add…"
 * fallback), which speak the same language from their own roots.
 */
export const TOKEN_POPUP_CLASS =
	'bg-popover text-popover-foreground ring-foreground/10 motion-safe:data-open:animate-in motion-safe:data-open:fade-in-0 motion-safe:data-open:zoom-in-90 flex w-[19.5rem] max-w-[min(324px,calc(100vw-1rem))] origin-(--transform-origin) flex-col gap-3 rounded-xl p-3 shadow-[0_1px_2px_rgb(0_0_0/0.06),0_4px_12px_rgb(0_0_0/0.08),0_16px_40px_-12px_rgb(0_0_0/0.18)] ring-1 duration-[130ms] outline-none'""", """/**
 * The popup shell treatment of the spec's popover language (§2.4) on the
 * app's popup recipe: `motion-popup`, the luma popup radius (`rounded-3xl`)
 * and elevation (`shadow-lg`), 324 px max width. Exported for the editor's
 * menu-summoned popovers (the ⠿ gutter editors, the ⋮ "Add…" fallback),
 * which speak the same language from their own roots.
 */
export const TOKEN_POPUP_CLASS =
	'bg-popover text-popover-foreground ring-foreground/10 motion-popup flex w-[19.5rem] max-w-[min(324px,calc(100vw-1rem))] flex-col gap-3 rounded-3xl p-3 shadow-lg ring-1 outline-none'""")
rep("""				'focus-visible:ring-ring hover:bg-muted data-popup-open:bg-muted -mx-1 -my-1 cursor-pointer rounded-sm px-1 py-1 outline-none focus-visible:ring-2',""", """				'focus-visible:ring-ring hover:bg-muted data-popup-open:bg-muted -mx-1 -my-1 cursor-pointer rounded-lg px-1 py-1 outline-none focus-visible:ring-2',""")
rep("""	// The glide transition must not apply while the popover is first
	// positioned (the transform would animate in from the viewport origin), so
	// it switches on only after the open animation completes.""", """	// The glide transition must not apply while the popover is first
	// positioned (the transform would animate in from the viewport origin), so
	// it switches on only after the open animation completes. The glide is
	// something already on screen moving to a new place, so it rides the
	// app's `ease-in-out` (Emil's strong in-out, `tailwind.css`) at the
	// dropdown's 200ms — a retarget is a popup arriving somewhere else.""")
rep("""								'motion-safe:transition-[transform] motion-safe:duration-[180ms] motion-safe:ease-in-out',""", """								'motion-safe:duration-dropdown motion-safe:transition-[transform] motion-safe:ease-in-out',""")
rep("""									<div
										data-slot="token-popover-label"
										className="text-muted-foreground font-mono text-[11px] font-semibold tracking-[0.08em] uppercase"
									>""", """									<div
										data-slot="token-popover-label"
										className="text-overline text-muted-foreground uppercase"
									>""")
rep("""/**
 * The caret (§2.4): an SVG arrow that flips with the popup side and tracks
 * the anchor during the retargeting glide (its offset transitions alongside
 * the positioner's transform).
 */""", """/**
 * The caret (§2.4): an SVG arrow that flips with the popup side and tracks
 * the anchor during the retargeting glide (its offset transitions alongside
 * the positioner's transform).
 *
 * `left` is a layout property and the one animated here on purpose: Base UI
 * places the arrow with an inline `left`, so there is no transform to move
 * instead, and the box it lays out is a 20 × 8 px SVG. Snapping it while the
 * popup glides would point the caret at the old token for 200ms.
 */""")
rep("""					'motion-safe:transition-[left] motion-safe:duration-[180ms] motion-safe:ease-in-out',""", """					'motion-safe:duration-dropdown motion-safe:transition-[left] motion-safe:ease-in-out',""")
open(p, 'w').write(s)
