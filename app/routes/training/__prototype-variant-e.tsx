/**
 * PROTOTYPE — Variant E, "Swipeable week cards".
 *
 * Thesis: consumer-grade, not tool-grade. The whole journey is one horizontal
 * deck of physical cards — Target Event, intent, one Season Anchor per Training
 * Track, the shape, then every week of the season — and each card is dominated
 * by a single huge number. You tune the plan by swiping and tapping; there is no
 * form, no table and no two-pane layout.
 *
 * Prose budget: under 50 words of prose on the whole surface. Week Roles are
 * coloured badges, never sentences; the level adaptation is
 * `describeLevel().summary`, which is numbers.
 *
 * Named UI-convention exceptions (docs/design/ui-conventions.md §2.6): the
 * cards, the ± steppers, the intent tiles, the preset pills and the rail
 * segments are custom controls carrying the three tokens by hand (≥44px
 * effective targets or `after:` hit-area extensions, no clipping at 390px, and
 * fonts far above 16px on the numeric controls so iOS cannot zoom).
 *
 * THROWAWAY — do not ship.
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { DISCIPLINE_LABELS } from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import {
	buildSeason,
	CURRENCY_UNIT,
	DAYS,
	DEFAULT_PRESET_KEY,
	describeLevel,
	INTENTS,
	orderTracks,
	PRESETS,
	rescaleWeekTrack,
	tracksFor,
	type Currency,
	type Discipline,
	type Intent,
	type PrototypeEvent,
	type PrototypeTrack,
	type VariantProps,
	type Week,
	type WeekRole,
} from './__prototype-data.ts'

/* -------------------------------------------------------------------------- */
/* Formatting                                                                  */
/* -------------------------------------------------------------------------- */

const MS_PER_WEEK = 604_800_000

/** The shape that fits the athlete's intent, until the athlete says otherwise. */
const PRESET_FOR_INTENT: Record<Intent, string> = {
	'first-season': 'gentle-ramp',
	'returning-from-injury': 'back-from-injury',
	'deliberately-building': DEFAULT_PRESET_KEY,
}

const ROLE_LABELS: Record<WeekRole, string> = {
	loading: 'loading',
	recovery: 'recovery',
	taper: 'taper',
	race: 'Race week',
}

/** The Week Role as colour, so no card has to say what kind of week it is. */
const ROLE_BADGE: Record<WeekRole, string> = {
	loading: 'bg-primary/15 text-primary',
	recovery: 'bg-sky-500/15 text-sky-400',
	taper: 'bg-amber-500/15 text-amber-400',
	race: 'bg-primary text-primary-foreground',
}

const ROLE_SEGMENT: Record<WeekRole, string> = {
	loading: 'bg-primary/50',
	recovery: 'bg-sky-500/50',
	taper: 'bg-amber-500/60',
	race: 'bg-primary',
}

const DISCIPLINE_DOT: Record<Discipline, string> = {
	run: 'bg-primary',
	bike: 'bg-sky-500',
	swim: 'bg-violet-500',
}

/** The step one tap of ± moves an anchor or a week target. */
const STEP: Record<Currency, number> = { km: 1, hours: 0.5, tss: 5 }

function shiftWeeks(iso: string, weeks: number): string {
	return new Date(Date.parse(`${iso}T00:00:00Z`) + weeks * MS_PER_WEEK)
		.toISOString()
		.slice(0, 10)
}

function formatDay(iso: string): string {
	return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
		day: 'numeric',
		month: 'short',
		timeZone: 'UTC',
	})
}

/** A volume split into the huge digits and its small unit. */
function big(
	value: number,
	currency: Currency,
): { digits: string; unit: string } {
	const digits =
		currency === 'tss'
			? String(Math.round(value))
			: String(Math.round(value * 10) / 10)
	return { digits, unit: CURRENCY_UNIT[currency] }
}

/* -------------------------------------------------------------------------- */
/* Cards                                                                       */
/* -------------------------------------------------------------------------- */

type Card =
	| { kind: 'event' }
	| { kind: 'intent' }
	| { kind: 'anchor'; track: PrototypeTrack }
	| { kind: 'shape' }
	| { kind: 'week'; week: Week }
	| { kind: 'finish' }

const cardClass =
	'relative flex min-h-[27rem] w-[82vw] max-w-[21rem] shrink-0 snap-center flex-col rounded-[1.75rem] border border-border bg-card p-5 transition-[transform,opacity,box-shadow] duration-300 md:w-[20rem]'

const stepperClass =
	'relative flex size-11 items-center justify-center rounded-full border border-border bg-background text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30 active:scale-95'

const pillClass =
	'relative shrink-0 rounded-full border border-border px-3 py-2 text-xs whitespace-nowrap outline-none after:absolute after:inset-x-0 after:-inset-y-1.5 focus-visible:ring-3 focus-visible:ring-ring/30'

/* -------------------------------------------------------------------------- */
/* Screen                                                                      */
/* -------------------------------------------------------------------------- */

export default function VariantE({
	athlete,
	event,
	events,
	seasonStartMonday,
	seasonWeeks,
}: VariantProps) {
	const [eventId, setEventId] = useState(event.id)
	const [intent, setIntent] = useState<Intent>('deliberately-building')
	const [presetOverride, setPresetOverride] = useState<string | null>(null)
	const [startOffset, setStartOffset] = useState(0)
	const [anchors, setAnchors] = useState<Partial<Record<Discipline, number>>>(
		() =>
			Object.fromEntries(
				athlete.tracks.map((track) => [track.discipline, track.proposedAnchor]),
			),
	)
	const [weekOverrides, setWeekOverrides] = useState<Record<number, number>>({})
	const [added, setAdded] = useState(false)
	const [current, setCurrent] = useState(0)

	const deckRef = useRef<HTMLDivElement>(null)
	const cardRefs = useRef<(HTMLElement | null)[]>([])

	const target: PrototypeEvent = events.find((e) => e.id === eventId) ?? event
	const presetKey = presetOverride ?? PRESET_FOR_INTENT[intent]
	const preset =
		PRESETS.find((p) => p.key === presetKey) ??
		PRESETS.find((p) => p.key === DEFAULT_PRESET_KEY)!

	const orderedTracks = useMemo(
		() => orderTracks(athlete.tracks),
		[athlete.tracks],
	)
	const startMonday = shiftWeeks(seasonStartMonday, startOffset)
	const weeks = Math.max(6, (target.weeksAway || seasonWeeks) - startOffset)

	const season = useMemo(
		() =>
			buildSeason({
				tracks: tracksFor({ ...athlete, tracks: orderedTracks }, anchors),
				presetKey,
				trainableDays: athlete.trainableDays,
				startMonday,
				weeks,
				raceDiscipline: target.discipline,
			}),
		[
			athlete,
			orderedTracks,
			anchors,
			presetKey,
			startMonday,
			weeks,
			target.discipline,
		],
	)

	/** The season with any hand-tuned week re-sized, sessions still whole units. */
	const tuned = useMemo(
		() =>
			season.map((week) => {
				const override = weekOverrides[week.index]
				if (override == null) return week
				const [primary, ...rest] = week.tracks
				if (!primary) return week
				const scaled = rescaleWeekTrack(primary, override)
				const tracks = [scaled, ...rest]
				return {
					...week,
					tracks,
					targetVolume: scaled.targetVolume,
					sessions: tracks
						.flatMap((track) => track.sessions)
						.sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day)),
				}
			}),
		[season, weekOverrides],
	)

	const cards: Card[] = useMemo(
		() => [
			{ kind: 'event' },
			{ kind: 'intent' },
			...orderedTracks.map((track): Card => ({ kind: 'anchor', track })),
			{ kind: 'shape' },
			...tuned.map((week): Card => ({ kind: 'week', week })),
			{ kind: 'finish' },
		],
		[orderedTracks, tuned],
	)

	const sessionCount = tuned.reduce(
		(sum, week) => sum + week.sessions.length,
		0,
	)
	const raceMonday = shiftWeeks(startMonday, Math.max(0, tuned.length - 1))
	const peak = Math.max(1, ...tuned.map((week) => week.targetVolume))

	const go = useCallback(
		(index: number) => {
			const clamped = Math.max(0, Math.min(cards.length - 1, index))
			setCurrent(clamped)
			cardRefs.current[clamped]?.scrollIntoView({
				behavior: 'smooth',
				block: 'nearest',
				inline: 'center',
			})
		},
		[cards.length],
	)

	/** Which card sits nearest the deck's centre — the "current" one. */
	const onScroll = () => {
		const deck = deckRef.current
		if (!deck) return
		const centre = deck.scrollLeft + deck.clientWidth / 2
		let best = 0
		let bestDistance = Infinity
		cardRefs.current.forEach((card, index) => {
			if (!card) return
			const middle = card.offsetLeft + card.offsetWidth / 2
			const distance = Math.abs(middle - centre)
			if (distance < bestDistance) {
				bestDistance = distance
				best = index
			}
		})
		setCurrent(best)
	}

	/** Arrows move the deck — unless the athlete is typing in a real field. */
	const onKeyDown = (e: React.KeyboardEvent) => {
		if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
		const active = document.activeElement
		if (
			active instanceof HTMLElement &&
			(active.isContentEditable ||
				['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName))
		) {
			return
		}
		e.preventDefault()
		go(current + (e.key === 'ArrowRight' ? 1 : -1))
	}

	const bumpAnchor = (track: PrototypeTrack, direction: number) => {
		setWeekOverrides({})
		setAnchors((prev) => {
			const value = prev[track.discipline] ?? track.proposedAnchor
			const step = STEP[track.currency]
			return {
				...prev,
				[track.discipline]: Math.max(
					step,
					Math.round((value + direction * step) / step) * step,
				),
			}
		})
	}

	const bumpWeek = (week: Week, direction: number) => {
		const step = STEP[week.currency]
		setWeekOverrides((prev) => ({
			...prev,
			[week.index]: Math.max(step, week.targetVolume + direction * step),
		}))
	}

	/** Phase runs, for the proportional spans on the rail. */
	const phaseRuns = useMemo(() => {
		const runs: { name: string; cards: number[] }[] = []
		cards.forEach((card, index) => {
			if (card.kind !== 'week') return
			const last = runs[runs.length - 1]
			if (last && last.name === card.week.phase) last.cards.push(index)
			else runs.push({ name: card.week.phase, cards: [index] })
		})
		return runs
	}, [cards])

	const setupCards = cards
		.map((card, index) => ({ card, index }))
		.filter(({ card }) => card.kind !== 'week' && card.kind !== 'finish')
	const finishIndex = cards.length - 1
	const currentCard = cards[current]

	return (
		<div className="py-6 md:py-8">
			<header className="container max-w-6xl">
				<h1 className="text-2xl font-semibold md:text-3xl">Plan Outline</h1>
			</header>

			{/* The deck. Horizontal scroll-snap; one card per phone viewport. */}
			<div
				ref={deckRef}
				onScroll={onScroll}
				onKeyDown={onKeyDown}
				tabIndex={0}
				role="group"
				aria-label="Season"
				className="mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pt-2 pb-4 outline-none [-ms-overflow-style:none] [scrollbar-width:none] focus-visible:ring-0 md:px-8 [&::-webkit-scrollbar]:hidden"
			>
				{cards.map((card, index) => {
					const active = index === current
					const key =
						card.kind === 'week'
							? `week-${card.week.index}`
							: card.kind === 'anchor'
								? `anchor-${card.track.discipline}`
								: card.kind
					return (
						<article
							key={key}
							ref={(node) => {
								cardRefs.current[index] = node
							}}
							aria-current={active ? 'true' : undefined}
							className={cn(
								cardClass,
								active
									? 'scale-100 opacity-100 shadow-2xl'
									: 'scale-[0.93] opacity-35 shadow-sm',
							)}
						>
							{card.kind === 'event' ? (
								<EventCard
									target={target}
									events={events}
									onPick={(id) => {
										setEventId(id)
										setWeekOverrides({})
									}}
									startMonday={startMonday}
									startOffset={startOffset}
									onShift={(next) => {
										setStartOffset(next)
										setWeekOverrides({})
									}}
									weeks={weeks}
								/>
							) : null}

							{card.kind === 'intent' ? (
								<IntentCard
									intent={intent}
									presetName={preset.name}
									onPick={(next) => {
										setIntent(next)
										setPresetOverride(null)
										setWeekOverrides({})
									}}
								/>
							) : null}

							{card.kind === 'anchor' ? (
								<AnchorCard
									track={card.track}
									value={
										anchors[card.track.discipline] ?? card.track.proposedAnchor
									}
									onBump={(direction) => bumpAnchor(card.track, direction)}
								/>
							) : null}

							{card.kind === 'shape' ? (
								<ShapeCard
									presetKey={preset.key}
									weeks={tuned.length}
									onPick={(next) => {
										setPresetOverride(next)
										setWeekOverrides({})
									}}
								/>
							) : null}

							{card.kind === 'week' ? (
								<WeekCard
									week={card.week}
									peak={peak}
									tuned={weekOverrides[card.week.index] != null}
									onBump={(direction) => bumpWeek(card.week, direction)}
									onReset={() =>
										setWeekOverrides((prev) => {
											const next = { ...prev }
											delete next[card.week.index]
											return next
										})
									}
								/>
							) : null}

							{card.kind === 'finish' ? (
								<FinishCard
									sessions={sessionCount}
									weeks={tuned.length}
									from={startMonday}
									to={raceMonday}
									added={added}
									onAdd={() => setAdded(true)}
								/>
							) : null}
						</article>
					)
				})}
			</div>

			{/* Rail: setup dots, phase spans over the season, finish dot. */}
			<div className="container max-w-6xl">
				<div className="flex items-end gap-1.5">
					{setupCards.map(({ index }) => (
						<button
							key={index}
							type="button"
							onClick={() => go(index)}
							aria-label={`Card ${index + 1}`}
							className={cn(
								'relative size-1.5 shrink-0 rounded-full after:absolute after:-inset-3',
								index === current ? 'bg-foreground' : 'bg-muted-foreground/40',
							)}
						/>
					))}
					<div className="flex min-w-0 flex-1 gap-1.5">
						{phaseRuns.map((run) => (
							<div
								key={`${run.name}-${run.cards[0]}`}
								className="min-w-0"
								style={{ flexGrow: run.cards.length, flexBasis: 0 }}
							>
								<div className="flex gap-0.5">
									{run.cards.map((index) => {
										const card = cards[index]
										const week = card?.kind === 'week' ? card.week : null
										if (!week) return null
										return (
											<button
												key={index}
												type="button"
												onClick={() => go(index)}
												aria-label={`Week ${week.index}`}
												className={cn(
													'relative h-1.5 min-w-0 flex-1 rounded-full after:absolute after:inset-x-0 after:-inset-y-3',
													ROLE_SEGMENT[week.role],
													index === current &&
														'ring-foreground h-2.5 ring-1 ring-offset-0',
												)}
											/>
										)
									})}
								</div>
								<p className="text-muted-foreground mt-1 truncate text-[10px]">
									{run.name}
								</p>
							</div>
						))}
					</div>
					<button
						type="button"
						onClick={() => go(finishIndex)}
						aria-label="Finish"
						className={cn(
							'relative size-1.5 shrink-0 rounded-full after:absolute after:-inset-3',
							current === finishIndex
								? 'bg-foreground'
								: 'bg-muted-foreground/40',
						)}
					/>
				</div>

				{/* Keyboard + button equivalent of the swipe. */}
				<div className="mt-4 flex items-center gap-3">
					<button
						type="button"
						onClick={() => go(current - 1)}
						disabled={current === 0}
						aria-label="Previous"
						className={cn(stepperClass, 'disabled:opacity-30')}
					>
						<Icon name="arrow-left" className="size-4" />
					</button>
					<button
						type="button"
						onClick={() => go(current + 1)}
						disabled={current === cards.length - 1}
						aria-label="Next"
						className={cn(stepperClass, 'disabled:opacity-30')}
					>
						<Icon name="arrow-right" className="size-4" />
					</button>
					<p
						aria-live="polite"
						className="text-muted-foreground text-xs tabular-nums"
					>
						{currentCard?.kind === 'week'
							? `${currentCard.week.phase} · ${ROLE_LABELS[currentCard.week.role]}`
							: null}{' '}
						<span className="tabular-nums">
							{current + 1} / {cards.length}
						</span>
					</p>
				</div>
			</div>
		</div>
	)
}

/* -------------------------------------------------------------------------- */
/* Card 1 — the Target Event, already in the calendar                          */
/* -------------------------------------------------------------------------- */

function CardLabel({ children }: { children: React.ReactNode }) {
	return (
		<p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
			{children}
		</p>
	)
}

function Huge({
	digits,
	unit,
	approx,
}: {
	digits: string
	unit: string
	approx?: boolean
}) {
	return (
		<p className="flex items-baseline gap-1.5">
			{approx ? (
				<span className="text-muted-foreground text-2xl">≈</span>
			) : null}
			<span className="text-[3.75rem] leading-none font-semibold tabular-nums md:text-7xl">
				{digits}
			</span>
			<span className="text-muted-foreground text-sm">{unit}</span>
		</p>
	)
}

function EventCard({
	target,
	events,
	onPick,
	startMonday,
	startOffset,
	onShift,
	weeks,
}: {
	target: PrototypeEvent
	events: PrototypeEvent[]
	onPick: (id: string) => void
	startMonday: string
	startOffset: number
	onShift: (next: number) => void
	weeks: number
}) {
	return (
		<>
			<CardLabel>Target Event</CardLabel>
			<h2 className="mt-1 text-lg leading-tight font-semibold">
				{target.name}
			</h2>
			<p className="text-muted-foreground mt-0.5 text-xs tabular-nums">
				{formatDay(target.date)} · {target.priority} ·{' '}
				{DISCIPLINE_LABELS[target.discipline]}
			</p>
			<div className="mt-auto">
				<Huge digits={String(weeks)} unit="weeks" />
			</div>
			<div className="border-border mt-4 flex items-center justify-between border-t pt-3">
				<div>
					<CardLabel>Plan Start Week</CardLabel>
					<p className="text-sm tabular-nums">
						<span className="text-muted-foreground">≈</span>{' '}
						{formatDay(startMonday)}
					</p>
				</div>
				<div className="flex gap-2">
					<button
						type="button"
						onClick={() => onShift(Math.max(0, startOffset - 1))}
						aria-label="Start a week earlier"
						className={stepperClass}
					>
						<Icon name="minus" className="size-4" />
					</button>
					<button
						type="button"
						onClick={() => onShift(Math.min(4, startOffset + 1))}
						aria-label="Start a week later"
						className={stepperClass}
					>
						<Icon name="plus" className="size-4" />
					</button>
				</div>
			</div>
			{events.length > 1 ? (
				<div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
					{events.map((option) => (
						<button
							key={option.id}
							type="button"
							onClick={() => onPick(option.id)}
							aria-current={option.id === target.id}
							className={cn(
								pillClass,
								option.id === target.id
									? 'bg-primary text-primary-foreground border-transparent'
									: 'text-muted-foreground',
							)}
						>
							{option.name} · {option.weeksAway}
						</button>
					))}
				</div>
			) : null}
		</>
	)
}

/* -------------------------------------------------------------------------- */
/* Card 2 — where you are right now                                           */
/* -------------------------------------------------------------------------- */

function IntentCard({
	intent,
	presetName,
	onPick,
}: {
	intent: Intent
	presetName: string
	onPick: (next: Intent) => void
}) {
	return (
		<>
			<CardLabel>Where you are</CardLabel>
			<div
				role="radiogroup"
				aria-label="Where you are"
				className="mt-3 flex flex-1 flex-col gap-2"
			>
				{INTENTS.map((option) => {
					const selected = option.key === intent
					return (
						<button
							key={option.key}
							type="button"
							role="radio"
							aria-checked={selected}
							onClick={() => onPick(option.key)}
							className={cn(
								'focus-visible:ring-ring/30 flex flex-1 items-center rounded-2xl border px-4 text-left text-base font-medium outline-none focus-visible:ring-3',
								selected
									? 'border-primary bg-primary text-primary-foreground'
									: 'border-border text-foreground hover:bg-muted',
							)}
						>
							{option.label}
						</button>
					)
				})}
			</div>
			<div className="border-border mt-4 border-t pt-3">
				<CardLabel>Periodization Preset</CardLabel>
				<p className="text-sm">
					<span className="text-muted-foreground">≈</span> {presetName}
				</p>
			</div>
		</>
	)
}

/* -------------------------------------------------------------------------- */
/* Card 3… — one Season Anchor per Training Track                              */
/* -------------------------------------------------------------------------- */

function AnchorCard({
	track,
	value,
	onBump,
}: {
	track: PrototypeTrack
	value: number
	onBump: (direction: number) => void
}) {
	const level = describeLevel(value, track.currency, track.discipline)
	const shown = big(value, track.currency)
	return (
		<>
			<div className="flex items-center gap-2">
				<span
					aria-hidden="true"
					className={cn(
						'size-2 rounded-full',
						DISCIPLINE_DOT[track.discipline],
					)}
				/>
				<CardLabel>
					Season Anchor · {DISCIPLINE_LABELS[track.discipline]}
				</CardLabel>
			</div>
			<div className="mt-auto">
				<Huge digits={shown.digits} unit={`${shown.unit} / week`} />
			</div>
			<div className="mt-4 flex items-center justify-between">
				<p className="text-muted-foreground text-xs tabular-nums">
					≈ {track.proposedAnchor} · {track.derivation.windowWeeks} wk ·{' '}
					{track.derivation.weeksTrained}/{track.derivation.windowWeeks} ·{' '}
					{track.derivation.sessions} sessions
				</p>
				<div className="flex gap-2">
					<button
						type="button"
						onClick={() => onBump(-1)}
						aria-label="Less"
						className={stepperClass}
					>
						<Icon name="minus" className="size-4" />
					</button>
					<button
						type="button"
						onClick={() => onBump(1)}
						aria-label="More"
						className={stepperClass}
					>
						<Icon name="plus" className="size-4" />
					</button>
				</div>
			</div>
			{/* The level adaptation, as numbers — never a sentence. */}
			<p className="border-border mt-4 border-t pt-3 text-xs font-medium tabular-nums">
				{level.summary}
			</p>
			<p className="text-muted-foreground mt-2 text-[11px] tabular-nums">
				{track.intensityBasis}
				{track.unsetThresholds.length > 0
					? ` · ${track.unsetThresholds.join(', ')} —`
					: null}
			</p>
		</>
	)
}

/* -------------------------------------------------------------------------- */
/* Card 4 — the shape, derived and overridable                                 */
/* -------------------------------------------------------------------------- */

function ShapeCard({
	presetKey,
	weeks,
	onPick,
}: {
	presetKey: string
	weeks: number
	onPick: (next: string) => void
}) {
	const preset =
		PRESETS.find((p) => p.key === presetKey) ??
		PRESETS.find((p) => p.key === DEFAULT_PRESET_KEY)!
	return (
		<>
			<CardLabel>A shape</CardLabel>
			<p className="mt-1 text-lg font-semibold">{preset.name}</p>
			<div className="mt-4 flex h-24 items-end gap-[3px]">
				{preset.weeklyLoad.map((load, i) => (
					<span
						key={i}
						aria-hidden="true"
						className="bg-primary/60 min-w-0 flex-1 rounded-t-sm"
						style={{ height: `${Math.round(load * 100)}%` }}
					/>
				))}
			</div>
			<div className="mt-auto">
				<Huge digits={String(weeks)} unit="weeks" approx />
			</div>
			<dl className="border-border mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t pt-3 text-xs tabular-nums">
				{preset.phases.map((phase) => (
					<div key={phase.name} className="flex gap-1">
						<dt className="text-muted-foreground">{phase.name}</dt>
						<dd>{phase.weeks}</dd>
					</div>
				))}
			</dl>
			<div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
				{PRESETS.map((option) => (
					<button
						key={option.key}
						type="button"
						onClick={() => onPick(option.key)}
						aria-current={option.key === preset.key}
						className={cn(
							pillClass,
							option.key === preset.key
								? 'bg-primary text-primary-foreground border-transparent'
								: 'text-muted-foreground',
						)}
					>
						{option.name}
					</button>
				))}
			</div>
		</>
	)
}

/* -------------------------------------------------------------------------- */
/* Week cards — one huge number, the sessions beneath                          */
/* -------------------------------------------------------------------------- */

function WeekCard({
	week,
	peak,
	tuned,
	onBump,
	onReset,
}: {
	week: Week
	peak: number
	tuned: boolean
	onBump: (direction: number) => void
	onReset: () => void
}) {
	const primary = week.tracks[0]!
	const shown = big(primary.targetVolume, primary.currency)
	const others = week.tracks.slice(1)
	return (
		<>
			<div className="flex items-start justify-between gap-2">
				<div>
					<CardLabel>Week {week.index}</CardLabel>
					<p className="text-muted-foreground mt-0.5 text-xs tabular-nums">
						{formatDay(week.weekKey)} · {week.phase}
					</p>
				</div>
				<span
					className={cn(
						'rounded-full px-2 py-1 text-[11px] font-medium',
						ROLE_BADGE[week.role],
					)}
				>
					{ROLE_LABELS[week.role]}
				</span>
			</div>

			<div className="mt-3">
				<Huge digits={shown.digits} unit={shown.unit} approx={!tuned} />
				<div
					aria-hidden="true"
					className="bg-muted mt-2 h-1 overflow-hidden rounded-full"
				>
					<span
						className="bg-primary block h-full rounded-full"
						style={{
							width: `${Math.round((primary.targetVolume / peak) * 100)}%`,
						}}
					/>
				</div>
			</div>

			{/* Three Volume Currencies, never summed. */}
			{others.length > 0 ? (
				<div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs tabular-nums">
					{others.map((track) => (
						<span key={track.discipline} className="flex items-center gap-1.5">
							<span
								aria-hidden="true"
								className={cn(
									'size-1.5 rounded-full',
									DISCIPLINE_DOT[track.discipline],
								)}
							/>
							{big(track.targetVolume, track.currency).digits}{' '}
							<span className="text-muted-foreground">
								{CURRENCY_UNIT[track.currency]}
							</span>
						</span>
					))}
				</div>
			) : null}

			<ul className="mt-3 flex-1 space-y-1.5">
				{week.sessions.map((session, i) => (
					<li
						key={`${session.day}-${i}`}
						className="grid grid-cols-[2.25rem_1fr_auto] items-baseline gap-2 text-xs"
					>
						<span className="text-muted-foreground tabular-nums">
							{session.day}
						</span>
						<span className="flex min-w-0 items-center gap-1.5">
							<span
								aria-hidden="true"
								className={cn(
									'size-1.5 shrink-0 rounded-full',
									DISCIPLINE_DOT[session.discipline],
								)}
							/>
							<span className="truncate">{session.title}</span>
						</span>
						<span className="tabular-nums">{session.volume}</span>
					</li>
				))}
			</ul>

			<div className="border-border mt-3 flex items-center justify-between border-t pt-3">
				<p className="text-muted-foreground text-xs tabular-nums">
					{week.sessions.length} ·{' '}
					{primary.longRun == null
						? '—'
						: `${big(primary.longRun, primary.currency).digits} ${shown.unit}`}{' '}
					· {Math.round(primary.easyShare * 100)} %
				</p>
				<div className="flex items-center gap-2">
					{tuned ? (
						<button
							type="button"
							onClick={onReset}
							aria-label="Back to derived"
							className={stepperClass}
						>
							<Icon name="reset" className="size-4" />
						</button>
					) : null}
					<button
						type="button"
						onClick={() => onBump(-1)}
						aria-label="Less"
						className={stepperClass}
					>
						<Icon name="minus" className="size-4" />
					</button>
					<button
						type="button"
						onClick={() => onBump(1)}
						aria-label="More"
						className={stepperClass}
					>
						<Icon name="plus" className="size-4" />
					</button>
				</div>
			</div>
		</>
	)
}

/* -------------------------------------------------------------------------- */
/* Last card — the one action, and its confirmation                            */
/* -------------------------------------------------------------------------- */

function FinishCard({
	sessions,
	weeks,
	from,
	to,
	added,
	onAdd,
}: {
	sessions: number
	weeks: number
	from: string
	to: string
	added: boolean
	onAdd: () => void
}) {
	return (
		<>
			<CardLabel>Plan Preview</CardLabel>
			<div className="mt-auto">
				<Huge digits={String(sessions)} unit="sessions" />
			</div>
			<dl className="border-border mt-4 grid grid-cols-2 gap-2 border-t pt-3 text-xs tabular-nums">
				<div>
					<dt className="text-muted-foreground">Weeks</dt>
					<dd className="text-base font-semibold">{weeks}</dd>
				</div>
				<div>
					<dt className="text-muted-foreground">Race week</dt>
					<dd className="text-base font-semibold">{formatDay(to)}</dd>
				</div>
			</dl>
			<div className="mt-auto pt-4">
				{added ? (
					<p
						role="status"
						className="text-primary flex items-center gap-2 text-sm font-medium tabular-nums"
					>
						<Icon name="check" className="size-4" />
						{sessions} on the Tape · {formatDay(from)} – {formatDay(to)}
					</p>
				) : (
					<Button className="w-full" onClick={onAdd}>
						Add {sessions} sessions
					</Button>
				)}
			</div>
		</>
	)
}
