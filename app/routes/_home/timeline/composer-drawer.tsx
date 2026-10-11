/**
 * The composer's container on a phone (owner decision 1, round 2; ADR 0088):
 * one Base UI Drawer every "+" opens, and the same Drawer at full is a
 * session's details.
 *
 * **Two snap points.** _Compact_ is exactly the composer's quick part — the
 * day, the source, the sport, the line, what it reads as and the week's sum,
 * the actions — with the full part peeking 16px under it, which says "there
 * is more, drag up". _Full_ ("Gjør grundigere", or a flick up) is the whole
 * height. Base UI owns the gesture: the sheet follows the finger 1:1, a flick
 * is enough to dismiss or to snap (it reads the release velocity), past the
 * top it resists, and it can be grabbed mid-flight. It travels on
 * `--ease-drawer`; reduced motion keeps the fade and drops the slide
 * (`drawer.tsx`).
 *
 * **The compact snap never moves on a keystroke.** It is measured while the
 * Drawer rises and then held; only a tap that changes what the compact part
 * holds — another day (a past day adds _Allerede gjort_), another source,
 * another sport — may move it. Typing changes the preview inside a floor the
 * composer reserves for it (`composer.tsx`).
 *
 * **Focus after the Drawer has settled, never while it rises**: the keyboard
 * coming up with the sheet is two motions fighting. Base UI's
 * `VirtualKeyboardProvider` keeps the focused field above the keyboard.
 *
 * No popover opens over it: the details hold no token popovers, and the
 * composer's instruments are inline (apple-design §12, one layer at a time).
 */
import { Drawer as DrawerPrimitive } from '@base-ui/react/drawer'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from '#app/components/ui/drawer.tsx'
import { SESSION_COMPOSER_LABELS } from '#app/utils/labels.ts'
import { type CompactLayout, SessionComposer } from './composer.tsx'
import { type ComposerTarget, useComposerStatus } from './composer-context.tsx'
import { dayTitle, findSession } from './day-lookup.ts'
import { type TimelineWeek } from './presenter.ts'
import { SessionDetail } from './session-detail.tsx'
import { type TodayRowExtras } from './stream.tsx'

/** How much of the full part shows under the compact snap: the hint. */
const PEEK_PX = 16
/** Before the composer has been measured: about what it measures at 390px. */
const COMPACT_FALLBACK = '32rem'

type Snap = 'compact' | 'full'

export function ComposerDrawer({
	weeks,
	today,
}: {
	weeks: readonly TimelineWeek[]
	today: TodayRowExtras | null
}) {
	const { target, close } = useComposerStatus()
	// What the Drawer shows stays while it leaves, so the content does not
	// blank out under the exit.
	const [shown, setShown] = useState<ComposerTarget | null>(target)
	// Each opening is a new composer; the day strip moves within one.
	const [openings, setOpenings] = useState(0)
	useEffect(() => {
		if (!target) return
		setShown(target)
		setOpenings((count) => count + 1)
	}, [target])
	const open = target != null

	const [snap, setSnap] = useState<Snap>('compact')
	const [compact, setCompact] = useState<number | null>(null)
	const settledRef = useRef(false)
	const appliedKeyRef = useRef('')
	const inputRef = useRef<HTMLTextAreaElement>(null)
	const titleId = useId()

	// Each opening starts from its own snap: the composer compact, the
	// details at full.
	useEffect(() => {
		if (!target) return
		settledRef.current = false
		setSnap(target.mode === 'detail' ? 'full' : 'compact')
	}, [target])

	const onCompactLayout = useCallback(({ height, key }: CompactLayout) => {
		if (settledRef.current && key === appliedKeyRef.current) return
		appliedKeyRef.current = key
		const viewport =
			typeof window === 'undefined' ? Infinity : window.innerHeight * 0.92
		setCompact(Math.min(Math.ceil(height + PEEK_PX), Math.floor(viewport)))
	}, [])

	const compactPoint = compact ?? COMPACT_FALLBACK
	const found =
		shown?.mode === 'detail'
			? findSession(weeks, shown.dayKey, shown.sessionId)
			: null

	return (
		<Drawer
			open={open}
			onOpenChange={(next) => {
				if (!next) close()
			}}
			onOpenChangeComplete={(isOpen) => {
				if (!isOpen) return
				settledRef.current = true
				// The keyboard comes up now that the sheet has stopped, never with it.
				if (shown?.mode === 'compose') inputRef.current?.focus()
			}}
			showSwipeHandle
			snapPoints={[compactPoint, 1]}
			snapPoint={snap === 'full' ? 1 : compactPoint}
			onSnapPointChange={(point) => setSnap(point === 1 ? 'full' : 'compact')}
		>
			<DrawerPrimitive.VirtualKeyboardProvider>
				<DrawerContent
					data-composer-drawer={shown?.mode ?? 'compose'}
					aria-labelledby={titleId}
				>
					<DrawerHeader className="px-4 pt-1 pb-2 text-left">
						<DrawerTitle id={titleId} className="text-heading">
							{shown?.mode === 'detail'
								? (found?.session.title ?? '')
								: SESSION_COMPOSER_LABELS.title}
						</DrawerTitle>
						{shown?.mode === 'detail' ? (
							<DrawerDescription className="text-left">
								{dayTitle(shown.dayKey)}
							</DrawerDescription>
						) : null}
					</DrawerHeader>
					<div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 pt-1 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
						{shown?.mode === 'compose' ? (
							<SessionComposer
								key={openings}
								dayKey={shown.dayKey}
								layout="drawer"
								full={snap === 'full'}
								onDeeper={() => setSnap('full')}
								onCancel={close}
								onSourceChange={(source) =>
									// A list is read at full height; the line at compact.
									setSnap(
										source === 'bibliotek' || source === 'kopier'
											? 'full'
											: 'compact',
									)
								}
								onCompactLayout={onCompactLayout}
								inputRef={inputRef}
								headingId={titleId}
							/>
						) : found ? (
							<SessionDetail
								session={found.session}
								cta={
									today?.cta?.sessionId === found.session.id
										? today.cta
										: null
								}
							/>
						) : null}
					</div>
				</DrawerContent>
			</DrawerPrimitive.VirtualKeyboardProvider>
		</Drawer>
	)
}

