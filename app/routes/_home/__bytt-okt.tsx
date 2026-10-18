/**
 * The today card's last two chips (spec #558 S5, #579), in the same sideways
 * row as Juster's three:
 *
 * - **Bytt økt** opens Bibliotek as a picker in the house Drawer — the
 *   Catalogue, the programs' days, the exercises — and the pick replaces
 *   today's session. The pick goes out through Juster's own form and lands
 *   the same way: the toast says what changed, with _Angre_.
 * - **Avansert** opens a short menu to the power tools, one tap further:
 *   the session itself (edit everything), the composer for a new session
 *   today, and Plan's Avansert (`/training/plan#avansert`).
 *
 * Motion is the system's and nothing new: the Drawer's rise and its swipe
 * (`drawer.tsx`, reduced motion fades), the menu's `motion-popup` out of its
 * chip, the press. The sheet closes on the tap that picks, so the answer is
 * the toast and the card, not a spinner in a sheet.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { Link, useFetcher } from 'react-router'
import { buttonVariants } from '#app/components/ui/button.tsx'
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from '#app/components/ui/drawer.tsx'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '#app/components/ui/dropdown-menu.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Input } from '#app/components/ui/input.tsx'
import {
	SegmentedControl,
	ToggleGroupItem,
} from '#app/components/ui/toggle-group.tsx'
import { type loader as swapPickerLoader } from '#app/routes/resources/session-swap.tsx'
import {
	SESSION_SWAP_PICKER,
	SWAP_SOURCES,
	type SwapSource,
} from '#app/utils/juster.ts'
import { BYTT_OKT_LABELS as L, JUSTER_LABELS } from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import { useComposer } from './timeline/composer-context.tsx'

/** Plan's closed Avansert section (ADR 0101 §2, #577). */
export const PLAN_ADVANCED_HREF = '/training/plan#avansert'

/** How long typing rests before the picker asks again. */
const SEARCH_REST_MS = 250

/** A chip in the today card's row: the Juster chips' own look. */
export const CHIP = cn(
	buttonVariants({ variant: 'outline' }),
	'text-callout h-11 flex-none rounded-full px-4',
)

export function ByttOktChip({
	title,
	discipline,
	disabled,
	onPick,
}: {
	/** Today's session's title, for the chip's name and the sheet. */
	title: string
	/** Today's sport, which the Catalogue lists first. */
	discipline: string
	disabled: boolean
	onPick: (from: SwapSource, pickId: string) => void
}) {
	const [open, setOpen] = useState(false)
	return (
		<>
			<button
				type="button"
				data-juster-chip="swap"
				disabled={disabled}
				aria-haspopup="dialog"
				aria-label={JUSTER_LABELS.chipFor(L.chip, title)}
				onClick={() => setOpen(true)}
				className={CHIP}
			>
				{L.chip}
			</button>
			<Drawer open={open} onOpenChange={setOpen} showSwipeHandle>
				<SwapPicker
					open={open}
					title={title}
					discipline={discipline}
					onPick={(from, pickId) => {
						setOpen(false)
						onPick(from, pickId)
					}}
				/>
			</Drawer>
		</>
	)
}

function SwapPicker({
	open,
	title,
	discipline,
	onPick,
}: {
	open: boolean
	title: string
	discipline: string
	onPick: (from: SwapSource, pickId: string) => void
}) {
	const titleId = useId()
	const searchId = useId()
	const [from, setFrom] = useState<SwapSource>('catalogue')
	const [query, setQuery] = useState('')
	const picker = useFetcher<typeof swapPickerLoader>()
	const load = picker.load
	const listRef = useRef<HTMLDivElement>(null)

	// Ask for the part shown and the search, once typing has rested.
	useEffect(() => {
		if (!open) return
		const params = new URLSearchParams({ from, discipline })
		const q = query.trim()
		if (q) params.set('q', q)
		const timer = window.setTimeout(
			() => void load(`${SESSION_SWAP_PICKER}?${params}`),
			q ? SEARCH_REST_MS : 0,
		)
		return () => window.clearTimeout(timer)
	}, [open, from, query, discipline, load])

	// A new part starts at its top.
	useEffect(() => {
		listRef.current?.scrollTo({ top: 0 })
	}, [from])

	const reply = picker.data?.from === from ? picker.data : null
	const rows = reply?.rows ?? []
	const loading = picker.state !== 'idle' || reply == null

	return (
		<DrawerContent
			data-swap-picker
			aria-labelledby={titleId}
			// Always the sheet's full height: a list that grows and shrinks with
			// each keystroke would move the search field under the thumb.
			className="h-[92dvh] max-h-[92dvh] motion-reduce:[transition-property:opacity]"
		>
			<DrawerHeader className="px-4 pt-1 pb-2 text-left">
				<DrawerTitle id={titleId} className="text-heading text-left">
					{L.title}
				</DrawerTitle>
				<DrawerDescription className="text-left [overflow-wrap:anywhere]">
					{L.description(title)}
				</DrawerDescription>
			</DrawerHeader>
			{/* Where three sources cannot sit side by side at the text size the
			    athlete reads (a phone at 200%), they stack, each in full,
			    instead of truncating to an initial. */}
			<div className="@container flex flex-col gap-3 px-4 pb-3">
				<SegmentedControl
					value={from}
					onValueChange={setFrom}
					aria-label={L.sourcesLabel}
					className="w-full @max-[15rem]:flex-col @max-[15rem]:rounded-3xl"
				>
					{SWAP_SOURCES.map((source) => (
						<ToggleGroupItem
							key={source}
							value={source}
							data-swap-source={source}
							className="text-footnote max-[359px]:text-caption h-9 min-w-0 flex-1 px-1 @max-[15rem]:h-auto @max-[15rem]:min-h-11 @max-[15rem]:w-full @max-[15rem]:flex-none"
						>
							<span className="max-w-full truncate">{L.sources[source]}</span>
						</ToggleGroupItem>
					))}
				</SegmentedControl>
				<label htmlFor={searchId} className="sr-only">
					{L.search[from]}
				</label>
				<Input
					id={searchId}
					type="search"
					value={query}
					onChange={(event) => setQuery(event.currentTarget.value)}
					placeholder={L.search[from]}
					enterKeyHint="search"
					autoComplete="off"
					// 16px, so iOS never zooms the page into the field.
					className="text-base"
				/>
				{from === 'exercise' ? (
					<p className="text-footnote text-muted-foreground [text-wrap:pretty]">
						{L.exerciseHint}
					</p>
				) : null}
			</div>
			<div
				ref={listRef}
				aria-busy={loading || undefined}
				className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]"
			>
				{from === 'exercise' && !query.trim() && rows.length > 0 ? (
					<h3 className="text-callout mb-2 font-semibold">{L.recentLifts}</h3>
				) : null}
				{rows.length > 0 ? (
					<ul
						data-swap-rows
						className={cn(
							'bg-card divide-border/60 ring-foreground/5 divide-y overflow-hidden rounded-4xl shadow-xs ring-1 transition-opacity duration-150',
							// The list stays while the next answer comes: dimmed, not blanked.
							loading && 'opacity-60',
						)}
					>
						{rows.map((row) => (
							<li key={row.id}>
								<button
									type="button"
									data-swap-pick={row.id}
									aria-label={L.pickFor(row.title)}
									onClick={() => onPick(from, row.id)}
									className="active:bg-muted flex min-h-11 w-full [touch-action:manipulation] items-center gap-3 px-4 py-3 text-left select-none [-webkit-tap-highlight-color:transparent]"
								>
									<span className="flex min-w-0 flex-1 flex-col gap-0.5">
										<span className="text-callout [overflow-wrap:anywhere]">
											{row.title}
										</span>
										{row.sentence ? (
											<span className="text-footnote text-muted-foreground line-clamp-2 [overflow-wrap:anywhere]">
												{row.sentence}
											</span>
										) : null}
										{row.figures.length > 0 ? (
											<span className="text-footnote text-muted-foreground tabular-nums">
												{row.figures.join(' · ')}
											</span>
										) : null}
									</span>
									<Icon
										name="chevron-right"
										size="sm"
										className="text-muted-foreground shrink-0"
										aria-hidden="true"
									/>
								</button>
							</li>
						))}
					</ul>
				) : (
					<p
						aria-live="polite"
						className="text-footnote text-muted-foreground py-2 [overflow-wrap:anywhere]"
					>
						{loading
							? L.loading
							: query.trim()
								? L.none(query.trim())
								: L.empty[from]}
					</p>
				)}
				{reply && reply.total > reply.rows.length ? (
					<p className="text-footnote text-muted-foreground mt-3 tabular-nums">
						{L.more(reply.rows.length, reply.total)}
					</p>
				) : null}
			</div>
		</DrawerContent>
	)
}

/**
 * _Avansert_: everything that exists today, one tap further — the session
 * itself, the composer, and Plan's editors.
 */
export function AvansertChip({
	title,
	sessionTo,
	todayKey,
}: {
	title: string
	/** The session's own page, where every part of it can be edited. */
	sessionTo: string
	todayKey: string
}) {
	const composer = useComposer()
	const M = L.advancedMenu
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				data-juster-chip="advanced"
				aria-label={L.advancedFor(title)}
				className={cn(CHIP, 'gap-1.5')}
			>
				{L.advanced}
				<Icon name="chevron-down" size="sm" aria-hidden="true" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-auto">
				<DropdownMenuItem
					data-advanced="session"
					render={<Link to={sessionTo} prefetch="intent" />}
				>
					{M.session}
				</DropdownMenuItem>
				<DropdownMenuItem
					data-advanced="composer"
					onClick={() => composer.openComposer(todayKey)}
				>
					{M.composer}
				</DropdownMenuItem>
				<DropdownMenuItem
					data-advanced="plan"
					render={<Link to={PLAN_ADVANCED_HREF} />}
				>
					{M.plan}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	)
}
