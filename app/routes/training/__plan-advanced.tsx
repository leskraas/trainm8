/**
 * _Avansert_ on _Plan_ (ADR 0101 §2, #558 story 121): everything the old Sesong
 * page held below its hero — the season table, _Endre sesongen_, _Filosofi_,
 * the Events, what the plan consists of, the Training Tracks, the Week Pattern
 * and the two readings with the season chart — unchanged inside, behind one
 * closed section.
 *
 * **Closed by default, open when the page is addressed inside it.** An
 * athlete who lands on _Plan_ reads the lead; an athlete who came for an
 * editor finds it open. So it opens on its own when:
 *
 * - the URL names something inside (`?tab=`, `?week=`, `?edit=`): a reading,
 *   a week, an edit pre-filled — the links the readings and the season table
 *   build, and every bookmark of the old page;
 * - the URL's hash points anywhere but the lead or Bibliotek (`#avansert`, the
 *   link I dag's _Avansert_ chip takes, ADR 0101 §3);
 * - an action answered inside it (`reply`): a refusal or a preview must be
 *   read where it was asked, never behind a closed row.
 *
 * Once open it stays open while the athlete is on the page: a save, a tab
 * change or a preview keeps the component mounted, so nothing snaps shut under
 * the athlete. Closing it is theirs.
 *
 * Base UI unmounts a closed panel, so a closed _Avansert_ renders none of its
 * forms (Sesong's audit §7: 300 KB of HTML and a second of hydration on a
 * throttled phone). The panel opens on `motion-collapse`, the one sanctioned
 * layout animation (ADR 0085 §4); the chevron turns on the press curve. No
 * motion of its own.
 */
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '#app/components/ui/collapsible.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { LIBRARY_SECTION_ID } from '#app/utils/app-tabs.ts'
import { PLAN_LEAD_LABELS } from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import { COLLAPSIBLE_CHEVRON, ROW_PRESS } from './__plan-chrome.tsx'
import { PLAN_LEAD_ID } from './__plan-lead-card.tsx'

/** The section's anchor: `/training/plan#avansert` lands on it, open. */
export const ADVANCED_SECTION_ID = 'avansert'

/** `duration-collapse` (200 ms) and a frame: the panel has its height. */
const COLLAPSE_SETTLE_MS = 250

/** What a reader does to move the page themselves. */
const READER_INPUT = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const

/** Search params only something inside _Avansert_ reads. */
const ADDRESSED_INSIDE = ['tab', 'week', 'edit'] as const

/** Hashes that land outside _Avansert_ and so leave it as it is. */
const OUTSIDE = new Set([`#${LIBRARY_SECTION_ID}`, `#${PLAN_LEAD_ID}-name`])

function searchAddresses(search: string): boolean {
	const params = new URLSearchParams(search)
	return ADDRESSED_INSIDE.some((name) => params.has(name))
}

function hashAddresses(hash: string): boolean {
	return hash !== '' && hash !== '#' && !OUTSIDE.has(hash)
}

export function PlanAdvanced({
	reply,
	className,
	children,
}: {
	/** The answer of an action asked inside, or null. Each new one opens it. */
	reply: unknown
	className?: string
	children: ReactNode
}) {
	const location = useLocation()
	// The first render reads only what the server reads too: the server never
	// sees a hash, so a hash opens it after hydration, never during it (a
	// first render that read it would not match the server's HTML).
	const answered = reply != null || searchAddresses(location.search)
	const [open, setOpen] = useState(answered)
	// A later navigation or answer that addresses the inside opens it; nothing
	// here ever closes it.
	const addressed = answered || hashAddresses(location.hash)
	const openRef = useRef(open)
	openRef.current = open
	// A layout effect: it opens before the first paint, so a hashed landing
	// never shows a closed Avansert that then jumps open.
	useLayoutEffect(() => {
		if (!addressed || openRef.current) return
		setOpen(true)
		// Landed by a hash (`#avansert`): the browser scrolled before the panel
		// existed, so the target sits mid-screen. Once the panel has opened
		// (`motion-collapse`), bring it to the top, unless the athlete has
		// moved the page meanwhile: it never moves under a reader.
		if (answered) return
		const id = decodeURIComponent(location.hash.slice(1))
		// The athlete's own scroll or tap cancels it; the browser's own jump to
		// the hash does not.
		const cancel = () => window.clearTimeout(timer)
		const timer = window.setTimeout(() => {
			stopListening()
			document.getElementById(id)?.scrollIntoView({ block: 'start' })
		}, COLLAPSE_SETTLE_MS)
		const stopListening = () => {
			for (const type of READER_INPUT) window.removeEventListener(type, cancel)
		}
		for (const type of READER_INPUT) {
			window.addEventListener(type, cancel, { once: true, passive: true })
		}
		return () => {
			cancel()
			stopListening()
		}
	}, [addressed, answered, reply, location.key, location.hash])

	const titleId = `${ADVANCED_SECTION_ID}-title`
	return (
		<section
			id={ADVANCED_SECTION_ID}
			aria-labelledby={titleId}
			// A little air above the heading when a link scrolls it to the top.
			className={cn('scroll-mt-4', className)}
		>
			<Collapsible open={open} onOpenChange={setOpen}>
				{/* The heading holds the button, not the other way round: a heading
				    inside a button is not a heading to a screen reader's list. */}
				<h2 id={titleId} className="lg:mx-auto lg:max-w-2xl">
					<CollapsibleTrigger
						data-plan-advanced
						className={cn(
							// No text selection on a long press: it is a control
							// (mobile-native §8).
							'border-border/60 -mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center gap-3 rounded-2xl border-t px-2 py-3 text-left select-none',
							ROW_PRESS,
						)}
					>
						<span className="min-w-0 flex-1">
							<span className="text-heading block">
								{PLAN_LEAD_LABELS.advanced}
							</span>
							<span className="text-footnote text-muted-foreground block font-normal">
								{PLAN_LEAD_LABELS.advancedDetail}
							</span>
						</span>
						<Icon
							name="chevron-down"
							size="sm"
							className={COLLAPSIBLE_CHEVRON}
						/>
					</CollapsibleTrigger>
				</h2>
				<CollapsibleContent>
					<div className="pt-4">{children}</div>
				</CollapsibleContent>
			</Collapsible>
		</section>
	)
}
