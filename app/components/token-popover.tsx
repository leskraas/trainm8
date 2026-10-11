/**
 * The **retargeting token popover** (workout-editor spec §2.4 + §9, #252) —
 * the one editing instrument every token in the editor opens.
 *
 * One popover instance serves every token: each editable token renders a
 * `TokenPopoverTrigger` (a detached Base UI trigger, a native button and tab
 * stop) sharing one `createTokenPopoverHandle()` handle. Activating another
 * token while the popover is open *retargets* it — Base UI keeps the popup
 * mounted, re-anchors it, and swaps the payload in place; the positioner's
 * transform transition makes the move a ~180 ms glide with the caret
 * tracking, never a close-and-reopen (§9.1). The transition is enabled only
 * once the open animation has settled, so the initial anchoring never
 * animates in from the viewport origin.
 *
 * The shell is the spec's popover language on the app's popup recipe (ADR
 * 0085 §4, #505 round 2): caret-anchored, the luma popup radius and shadow,
 * `motion-popup` — out of the anchor from `scale(0.96)` plus opacity, 200ms in
 * and 150ms out on `--ease-out`, the scale dropped under reduced motion — an
 * uppercase cap label on the type scale's overline step, max-width 324 px
 * clamped to the viewport, and flip-above when cramped (Base UI's default
 * collision avoidance). It used to scale in from 90 % on tw-animate keyframes
 * for 130ms: a keyframe restarts from zero when a retarget interrupts it, and
 * `zoom-in-90` is a bigger jump than anything else in the app makes. It is
 * non-modal with trapped Tab (`modal="trap-focus"`): outside interactions
 * stay live so retargeting works, clicking non-interactive ground closes,
 * and Esc closes returning focus to the anchor token (Base UI's default
 * final focus is the active trigger).
 */
import { Popover as PopoverPrimitive } from '@base-ui/react/popover'
import { useRef, useState, type ReactNode } from 'react'
import { BLOCK_SHEET_LABELS } from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'

/**
 * The popup shell treatment of the spec's popover language (§2.4) on the
 * app's popup recipe: `motion-popup`, the luma popup radius (`rounded-3xl`)
 * and elevation (`shadow-lg`), 324 px max width. Exported for the editor's
 * menu-summoned popovers (the ⠿ gutter editors, the ⋮ "Add…" fallback),
 * which speak the same language from their own roots.
 */
export const TOKEN_POPUP_CLASS =
	'bg-popover text-popover-foreground ring-foreground/10 motion-popup flex w-[19.5rem] max-w-[min(324px,calc(100vw-1rem))] flex-col gap-3 rounded-3xl p-3 shadow-lg ring-1 outline-none'

/** One shared handle per editor instance — every trigger and the single
 * popover root connect through it. */
export function createTokenPopoverHandle<Payload>() {
	return PopoverPrimitive.createHandle<Payload>()
}

export type TokenPopoverHandle<Payload> = PopoverPrimitive.Handle<Payload>

export type TokenPopoverTriggerProps<Payload> = {
	handle: TokenPopoverHandle<Payload>
	/** What the popover edits when this trigger activates it. Keep it small
	 * and stable (addresses, not live metadata) — it is captured on open. */
	payload: Payload
	/** The token's accessible name: value + facet + position (§9.4). */
	'aria-label': string
	'data-token-editor'?: string
	/** The anchor's stable DOM address (`block.step.field`) — how the §10
	 * validation summary finds the trigger to retarget the popover onto. */
	'data-token-address'?: string
	/** Present while the token carries a server-error marking (§10.1). */
	'data-server-error'?: boolean
	className?: string
	children: ReactNode
}

/**
 * A token as a popover trigger: a native button in notation order (§9.3),
 * rendering the token's stanza typography untouched. Resting tokens carry no
 * chrome (no dotted underline, §12); hover/focus/open tint the token itself.
 * The padding enlarges the hit area toward the ≥22 px target without moving
 * the text off the baseline.
 */
export function TokenPopoverTrigger<Payload>({
	handle,
	payload,
	className,
	children,
	...props
}: TokenPopoverTriggerProps<Payload>) {
	return (
		<PopoverPrimitive.Trigger
			type="button"
			handle={handle}
			payload={payload}
			data-token-trigger
			className={cn(
				'focus-visible:ring-ring hover:bg-muted data-popup-open:bg-muted -mx-1 -my-1 cursor-pointer rounded-lg px-1 py-1 outline-none focus-visible:ring-2',
				className,
			)}
			{...props}
		>
			{children}
		</PopoverPrimitive.Trigger>
	)
}

export type TokenPopoverProps<Payload> = {
	handle: TokenPopoverHandle<Payload>
	/** The uppercase mono cap label for the active payload (§2.4). */
	label: (payload: Payload) => string
	/** The active payload's editor body. Rendered inside the popup; hooks are
	 * fine — this renders as a component, keyed by the payload so editor
	 * state resets when the popover retargets to another token. */
	children: (payload: Payload) => ReactNode
	/** Observe open/close — e.g. to reset host state that outlives a payload
	 * (the §6.1 swap-in-place facet editor) when the popover dismisses. */
	onOpenChange?: (open: boolean) => void
}

/**
 * The single popover a whole editor shares. Render it once, after the
 * stanza; the triggers open and retarget it through the shared handle.
 */
export function TokenPopover<Payload>({
	handle,
	label,
	children,
	onOpenChange,
}: TokenPopoverProps<Payload>) {
	// The glide transition must not apply while the popover is first
	// positioned (the transform would animate in from the viewport origin), so
	// it switches on only after the open animation completes. The glide is
	// something already on screen moving to a new place, so it rides the
	// app's `ease-in-out` (Emil's strong in-out, `tailwind.css`) at the
	// dropdown's 200ms — a retarget is a popup arriving somewhere else.
	const [settled, setSettled] = useState(false)
	const popupRef = useRef<HTMLDivElement>(null)
	return (
		<PopoverPrimitive.Root
			handle={handle}
			modal="trap-focus"
			onOpenChange={(open) => onOpenChange?.(open)}
			onOpenChangeComplete={(open) => setSettled(open)}
		>
			{({ payload }: { payload: Payload | undefined }) => (
				<PopoverPrimitive.Portal>
					<PopoverPrimitive.Positioner
						side="bottom"
						align="center"
						sideOffset={10}
						collisionPadding={8}
						className={cn(
							'isolate z-50',
							settled &&
								'motion-safe:duration-dropdown motion-safe:transition-[transform] motion-safe:ease-in-out',
						)}
					>
						<PopoverPrimitive.Popup
							ref={popupRef}
							data-slot="token-popover"
							// Type-to-edit leads (§2.4): opening lands focus on the value
							// field itself, not the first nudge button before it.
							initialFocus={() =>
								popupRef.current?.querySelector<HTMLElement>(
									'input, textarea',
								) ?? true
							}
							aria-label={payload !== undefined ? label(payload) : undefined}
							className={TOKEN_POPUP_CLASS}
						>
							<TokenPopoverArrow settled={settled} />
							{payload !== undefined ? (
								<>
									<div
										data-slot="token-popover-label"
										className="text-overline text-muted-foreground uppercase"
									>
										{label(payload)}
									</div>
									<TokenPopoverBody payload={payload}>
										{children}
									</TokenPopoverBody>
								</>
							) : null}
							{/* `modal="trap-focus"` needs a Close inside the popup so touch
							    screen readers can escape the trap; Esc and ground clicks
							    serve everyone else. */}
							<PopoverPrimitive.Close className="sr-only">
								{BLOCK_SHEET_LABELS.close}
							</PopoverPrimitive.Close>
						</PopoverPrimitive.Popup>
					</PopoverPrimitive.Positioner>
				</PopoverPrimitive.Portal>
			)}
		</PopoverPrimitive.Root>
	)
}

/** Renders the body via the render prop — a component boundary so the body
 * may use hooks (each retarget re-renders with the new payload). */
function TokenPopoverBody<Payload>({
	payload,
	children,
}: {
	payload: Payload
	children: (payload: Payload) => ReactNode
}) {
	return <>{children(payload)}</>
}

/**
 * The caret (§2.4): an SVG arrow that flips with the popup side and tracks
 * the anchor during the retargeting glide (its offset transitions alongside
 * the positioner's transform).
 *
 * `left` is a layout property and the one animated here on purpose: Base UI
 * places the arrow with an inline `left`, so there is no transform to move
 * instead, and the box it lays out is a 20 × 8 px SVG. Snapping it while the
 * popup glides would point the caret at the old token for 200ms.
 */
function TokenPopoverArrow({ settled }: { settled: boolean }) {
	return (
		<PopoverPrimitive.Arrow
			className={cn(
				'data-[side=bottom]:top-[-8px] data-[side=top]:bottom-[-8px] data-[side=top]:rotate-180',
				settled &&
					'motion-safe:duration-dropdown motion-safe:transition-[left] motion-safe:ease-in-out',
			)}
		>
			<svg width="20" height="8" viewBox="0 0 20 8" fill="none" aria-hidden>
				<path
					d="M9.06 0.7 L1.5 8 H18.5 L10.94 0.7 C10.42 0.2 9.58 0.2 9.06 0.7 Z"
					className="fill-popover"
				/>
				<path
					d="M10.94 0.7 L18.5 8 H17.1 L10.24 1.41 C10.1 1.28 9.9 1.28 9.76 1.41 L2.9 8 H1.5 L9.06 0.7 C9.58 0.2 10.42 0.2 10.94 0.7 Z"
					className="fill-foreground/10"
				/>
			</svg>
		</PopoverPrimitive.Arrow>
	)
}
