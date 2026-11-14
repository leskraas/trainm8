/**
 * The `ui/input` look for a bare field inside a popover or sheet (ADR 0119,
 * docs/design/design-system.md, Surfaces): tinted, borderless, the luma
 * control radius, a real 44px and 16px text so a phone never zooms. One
 * string, so the popovers' hand-rolled fields cannot drift apart; a caller
 * adds only its padding, alignment and figures.
 */
export const POPOVER_FIELD_CLASS =
	'bg-input/50 focus-visible:border-ring focus-visible:ring-ring/30 text-body h-11 w-full min-w-0 rounded-3xl border border-transparent outline-none focus-visible:ring-3'
