/**
 * **A placed session's row on the Plan Preview, and its provenance one tap
 * away** (#475, ADR 0117).
 *
 * The row carries the plan and nothing else: the day line (weekday · sport ·
 * archetype · zone) and the title. The whole row is one button, with a hairline
 * chevron as its only extra mark, and it opens the session's **Session
 * Provenance** in a panel directly below it, inside the week card (ADR 0030 rule
 * 3: a panel below the thing tapped, never a floating tooltip). Only the
 * provenance waits behind the tap; an unfilled slot, an absence, the capacity fit and a
 * week's numbers stay on the page (#429).
 *
 * One panel is open across the whole season. Tapping the same row, pressing
 * Escape (focus goes back to the row) or opening another row closes it. If the
 * open panel sits above the row being opened, it closes without animation and
 * the tapped row is held where it was, so it does not slide out from under the
 * finger. Hovering tints the row and never opens a panel (ADR 0117 §6).
 *
 * The panel renders from `GeneratedSession.provenance`, already on the
 * payload: opening a row makes no request.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ProvenanceSlot } from '#app/components/provenance-slot.tsx'
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '#app/components/ui/collapsible.tsx'
import {
	NB_DISCIPLINE_LABELS,
	NB_PATTERN_WEEKDAY_LABELS,
	NB_SESSION_ARCHETYPE_LABELS,
	PLAN_GENERATE_LABELS as L,
} from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import { COLLAPSE_OPEN_MS, prefersReducedMotion } from '#app/utils/motion.ts'
import { type GeneratedSession } from '#app/utils/plan-generation/season.ts'
import { type PatternWeekday } from '#app/utils/plan-outline/week-pattern.ts'
import { type Discipline } from '#app/utils/workout-schema.ts'
import { COLLAPSIBLE_CHEVRON, ROW_PRESS } from './__plan-chrome.tsx'

/** How many frames the tapped row is held in place while the panel above closes. */
const HOLD_FRAMES = 12

/** One key per placed session across the season. */
export function sessionRowKey(session: GeneratedSession): string {
	return `${session.weekIndex}-${session.weekday}-${session.discipline}-${session.entryId}`
}

export type OpenSessionRow = {
	openKey: string | null
	/** The panel that closes without animation, because it sat above the row
	 * being opened. */
	snapKey: string | null
	toggle: (key: string, row: HTMLElement) => void
	close: () => void
}

/**
 * The season's one open row. Lives at the season, so opening a row in one week
 * closes the panel in another.
 */
export function useOpenSessionRow(): OpenSessionRow {
	const [state, setState] = useState<{
		openKey: string | null
		snapKey: string | null
	}>({ openKey: null, snapKey: null })
	const openRef = useRef<{ key: string; row: HTMLElement } | null>(null)

	const toggle = useCallback((key: string, row: HTMLElement) => {
		const previous = openRef.current
		if (previous?.key === key) {
			openRef.current = null
			setState({ openKey: null, snapKey: null })
			return
		}
		// A panel above the tapped row: close it at once and hold the row still.
		const above =
			previous != null &&
			previous.row.isConnected &&
			Boolean(
				previous.row.compareDocumentPosition(row) &
				Node.DOCUMENT_POSITION_FOLLOWING,
			)
		openRef.current = { key, row }
		setState({ openKey: key, snapKey: above ? previous.key : null })
		if (above) holdInPlace(row)
		revealWhenOpen(row)
	}, [])

	const close = useCallback(() => {
		openRef.current = null
		setState({ openKey: null, snapKey: null })
	}, [])

	return { ...state, toggle, close }
}

/**
 * Keep `row` at the height it was tapped at while the layout above it
 * collapses. Measured each frame rather than computed, so a browser that
 * anchors the scroll itself sees no correction from here.
 */
function holdInPlace(row: HTMLElement) {
	const top = row.getBoundingClientRect().top
	let frames = 0
	const tick = () => {
		const drift = row.getBoundingClientRect().top - top
		if (drift !== 0) window.scrollBy({ top: drift, behavior: 'instant' })
		if (++frames < HOLD_FRAMES) requestAnimationFrame(tick)
	}
	requestAnimationFrame(tick)
}

/**
 * A panel that opens past the fold scrolls into view, `block: 'nearest'`, so a
 * panel already on screen does not move. Instant under reduced motion.
 */
function revealWhenOpen(row: HTMLElement) {
	window.setTimeout(() => {
		const panel = row
			.closest('[data-session-row]')
			?.querySelector('[data-provenance-panel]')
		// Optional calls: a browser without them (or a test DOM) just skips it.
		const reduced =
			typeof window.matchMedia === 'function' && prefersReducedMotion()
		panel?.scrollIntoView?.({
			block: 'nearest',
			behavior: reduced ? 'instant' : 'smooth',
		})
	}, COLLAPSE_OPEN_MS)
}

/**
 * The hairline chevron: Tabler `chevron-down` at 16 px, stroke 1.25, turned by
 * the same rule as every collapsible's chevron. Inline because the sprite's
 * path hard-codes stroke 2, which `<use>` cannot override.
 */
function Chevron() {
	return (
		<svg
			aria-hidden
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.25}
			strokeLinecap="round"
			strokeLinejoin="round"
			className={cn(COLLAPSIBLE_CHEVRON, 'size-4')}
		>
			<path d="m6 9l6 6l6-6" />
		</svg>
	)
}

/**
 * `Mandag · Løping · Terskel · sone 4`: the day, the sport and what a row is,
 * for a placed row and an unfilled one alike, so both wrap by one rule.
 *
 * A `<span>`, so it is valid inside the row's button. The tokens wrap between
 * each other, and a token's own space is non-breaking, so `sone 4` never
 * splits. A token longer than the line («Konkurransesimulering» at 320 px with
 * 200 % text) still breaks rather than pushing the card sideways. A real space
 * between tokens, so an accessible name reads as words.
 */
export function DayLine({
	weekday,
	discipline,
	extra = [],
}: {
	weekday: PatternWeekday
	discipline: Discipline
	extra?: readonly string[]
}) {
	return (
		<span className="text-footnote text-muted-foreground flex flex-wrap items-baseline gap-x-1.5 [overflow-wrap:anywhere]">
			<span className="text-foreground min-w-0 font-semibold">
				{NB_PATTERN_WEEKDAY_LABELS[weekday]}
			</span>{' '}
			<span aria-hidden>·</span>{' '}
			<span className="min-w-0">{NB_DISCIPLINE_LABELS[discipline]}</span>
			{extra.map((part) => (
				<span key={part} className="contents">
					{' '}
					<span aria-hidden>·</span>{' '}
					<span className="min-w-0">{part.replaceAll(' ', '\u00a0')}</span>
				</span>
			))}
		</span>
	)
}

export function SessionRow({
	session,
	openRow,
}: {
	session: GeneratedSession
	openRow: OpenSessionRow
}) {
	const key = sessionRowKey(session)
	const open = openRow.openKey === key
	const snap = openRow.snapKey === key
	const triggerRef = useRef<HTMLButtonElement>(null)
	const panelId = `provenance-${key}`

	// Escape closes the open panel wherever focus is: Safari does not focus a
	// clicked button, and a click elsewhere moves focus off the row. Focus goes
	// back to the row only from the row, its panel or nowhere (`body`): an
	// athlete pressing Escape in another control keeps their place.
	const { close } = openRow
	useEffect(() => {
		if (!open) return
		function onKeyDown(event: globalThis.KeyboardEvent) {
			if (event.key !== 'Escape' || event.defaultPrevented) return
			event.preventDefault()
			const active = document.activeElement
			const returnFocus =
				active == null ||
				active === document.body ||
				Boolean(
					triggerRef.current?.closest('[data-session-row]')?.contains(active),
				)
			close()
			if (returnFocus) triggerRef.current?.focus()
		}
		document.addEventListener('keydown', onKeyDown)
		return () => document.removeEventListener('keydown', onKeyDown)
	}, [open, close])

	const extra = [
		NB_SESSION_ARCHETYPE_LABELS[session.archetype],
		...(session.zone == null ? [] : [L.zone(session.zone)]),
	]

	return (
		<Collapsible open={open} data-session-row>
			<CollapsibleTrigger
				ref={triggerRef}
				// No `aria-controls` here: Base UI sets it to the panel's `id` only
				// while the panel is mounted, so a closed row never points at nothing.
				onClick={(event) => {
					// The open state is the season's, not this row's.
					event.preventDefault()
					openRow.toggle(key, event.currentTarget)
				}}
				className={cn(
					'-mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center gap-2 rounded-2xl px-2 py-2 text-left',
					ROW_PRESS,
					'motion-safe:active:duration-0',
				)}
			>
				<span className="min-w-0 flex-1 space-y-0.5">
					<DayLine
						weekday={session.weekday}
						discipline={session.discipline}
						extra={extra}
					/>{' '}
					<span className="text-callout block [overflow-wrap:anywhere]">
						{session.title}
					</span>
				</span>
				<Chevron />
			</CollapsibleTrigger>
			<CollapsibleContent
				id={panelId}
				data-provenance-panel
				// `motion-collapse` keeps its own reduced-motion answer (ADR 0077 §5:
				// the reflow is the gentler answer). A panel snapping shut above the
				// tapped row has no transition at all.
				className={cn(snap && 'transition-none!')}
			>
				<div className="pt-2">
					<div className="bg-muted/60 rounded-3xl p-3">
						<ProvenanceSlot provenance={session.provenance} />
					</div>
				</div>
			</CollapsibleContent>
		</Collapsible>
	)
}
