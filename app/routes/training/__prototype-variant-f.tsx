/**
 * PROTOTYPE — variant F, "Scrollytelling reveal".
 *
 * Thesis: the season introduces itself. There is no form and then a preview —
 * the athlete scrolls and one enormous number per screen-height arrives, each
 * figure fading up as it enters the viewport, until the plan has argued for
 * itself in figures alone. The three real inputs are moments where the story
 * pauses to ask: the intent as three big targets, the Season Anchor as a huge
 * editable number wearing its `≈` history one tap away. Changing either
 * re-derives every number below it, so scrolling on shows the new story.
 *
 * Editorial by design: dramatic scale contrast between figure and caption, a
 * hairline scroll-progress rule, and — once the input panels are behind you —
 * one bottom-anchored action. Nothing here is a paragraph.
 *
 * Reveal is `IntersectionObserver`-driven and additive only: the hidden state is
 * applied after mount, and never when `prefers-reduced-motion: reduce` is set,
 * so the content reads in full with the animation disabled or JS off.
 *
 * THROWAWAY — do not ship. Delete with the /training/plan/prototype route.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { cn } from '#app/utils/misc.tsx'
import {
	buildSeason,
	CURRENCY_UNIT,
	DAYS,
	DEFAULT_PRESET_KEY,
	describeLevel,
	formatVolume,
	INTENTS,
	orderTracks,
	PRESETS,
	tracksFor,
	type Currency,
	type Day,
	type Discipline,
	type Intent,
	type Week,
	type VariantProps,
} from './__prototype-data.ts'

/* -------------------------------------------------------------------------- */
/* Wording — sport register, since these name Training Tracks (ADR 0028 §4.1)  */
/* -------------------------------------------------------------------------- */

const DISCIPLINE: Record<Discipline, string> = {
	run: 'Run',
	bike: 'Bike',
	swim: 'Swim',
}

/** The shape that fits the intent — derived, shown with `≈`, overridable. */
const PRESET_FOR_INTENT: Record<Intent, string> = {
	'first-season': 'gentle-ramp',
	'returning-from-injury': 'back-from-injury',
	'deliberately-building': DEFAULT_PRESET_KEY,
}

/** One stepper tap = one real unit of that Volume Currency. */
const STEP: Record<Currency, number> = { km: 1, hours: 0.5, tss: 5 }

function round1(n: number): number {
	return Math.round(n * 10) / 10
}

const MONTHS = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec',
]
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * `20 Dec`. Hand-formatted rather than `toLocaleDateString`, because Node's ICU
 * and the browser's disagree about the comma and React calls that a hydration
 * mismatch.
 */
function shortDate(iso: string): string {
	const parsed = Date.parse(`${iso}T00:00:00Z`)
	if (Number.isNaN(parsed)) return iso
	const date = new Date(parsed)
	return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`
}

/** `Mon 17 Aug`. */
function weekdayDate(iso: string): string {
	const parsed = Date.parse(`${iso}T00:00:00Z`)
	if (Number.isNaN(parsed)) return iso
	const date = new Date(parsed)
	return `${WEEKDAYS[date.getUTCDay()]} ${shortDate(iso)}`
}

/** `16` from `16 km` — the figure and its unit are typeset separately. */
function splitVolume(value: number, currency: Currency) {
	const formatted = formatVolume(value, currency)
	if (currency === 'hours') return { figure: formatted, unit: '' }
	const [figure = formatted, ...rest] = formatted.split(' ')
	return { figure, unit: rest.join(' ') }
}

/* -------------------------------------------------------------------------- */
/* Reveal                                                                      */
/* -------------------------------------------------------------------------- */

function usePrefersReducedMotion(): boolean {
	const [reduced, setReduced] = useState(false)
	useEffect(() => {
		const query = window.matchMedia('(prefers-reduced-motion: reduce)')
		const sync = () => setReduced(query.matches)
		sync()
		query.addEventListener('change', sync)
		return () => query.removeEventListener('change', sync)
	}, [])
	return reduced
}

/**
 * Fade-and-lift the children the first time they enter the viewport.
 *
 * The hidden class only ever applies once the effect has run *and* the athlete
 * has not asked for less motion — so server HTML, a JS-less page and a
 * reduced-motion athlete all get the fully readable, unanimated version.
 */
function Reveal({
	children,
	className,
	delay = 0,
}: {
	children: React.ReactNode
	className?: string
	delay?: number
}) {
	const reduced = usePrefersReducedMotion()
	const ref = useRef<HTMLDivElement>(null)
	const [armed, setArmed] = useState(false)
	const [shown, setShown] = useState(false)

	useEffect(() => {
		// An athlete who asked for less motion gets the plain, already-visible
		// version — including one who flips the setting mid-scroll.
		if (reduced) {
			setArmed(false)
			setShown(true)
			return
		}
		const node = ref.current
		if (!node || typeof IntersectionObserver === 'undefined') return
		setArmed(true)
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						setShown(true)
						observer.disconnect()
					}
				}
			},
			{ rootMargin: '0px 0px -12% 0px', threshold: 0.15 },
		)
		observer.observe(node)
		return () => observer.disconnect()
	}, [reduced])

	const hidden = armed && !shown

	return (
		<div
			ref={ref}
			style={hidden ? undefined : { transitionDelay: `${delay}ms` }}
			className={cn(
				'transition-[opacity,transform] duration-700 ease-out',
				hidden ? 'translate-y-6 opacity-0' : 'translate-y-0 opacity-100',
				className,
			)}
		>
			{children}
		</div>
	)
}

/* -------------------------------------------------------------------------- */
/* Editorial primitives                                                       */
/* -------------------------------------------------------------------------- */

/** One screen-height, one idea. */
function Panel({
	children,
	className,
	id,
}: {
	children: React.ReactNode
	className?: string
	id?: string
}) {
	return (
		<section
			id={id}
			className={cn(
				'flex min-h-[calc(100dvh-6rem)] w-full flex-col justify-center gap-8 py-16',
				className,
			)}
		>
			{children}
		</section>
	)
}

function Caption({
	children,
	className,
}: {
	children: React.ReactNode
	className?: string
}) {
	return (
		<p
			className={cn(
				'text-muted-foreground text-[0.7rem] font-medium tracking-[0.32em] uppercase',
				className,
			)}
		>
			{children}
		</p>
	)
}

/** The gigantic figure. Nothing else on the screen competes with it. */
function Figure({
	value,
	unit,
	className,
}: {
	value: string
	unit?: string
	className?: string
}) {
	return (
		<p
			className={cn(
				'flex flex-wrap items-baseline gap-x-3 font-semibold tabular-nums',
				'text-[5.25rem] leading-[0.82] tracking-[-0.045em] md:text-[9rem]',
				className,
			)}
		>
			{value}
			{unit ? (
				<span className="text-muted-foreground text-2xl font-medium tracking-normal md:text-4xl">
					{unit}
				</span>
			) : null}
		</p>
	)
}

/** A derived number the athlete may overrule — always wears `≈`. */
function Derived({ children }: { children: React.ReactNode }) {
	return (
		<span className="text-muted-foreground text-sm tabular-nums">
			≈ {children}
		</span>
	)
}

/* -------------------------------------------------------------------------- */
/* Season Anchor panel                                                        */
/* -------------------------------------------------------------------------- */

function AnchorDial({
	discipline,
	currency,
	value,
	proposed,
	derivation,
	onChange,
}: {
	discipline: Discipline
	currency: Currency
	value: number
	proposed: number
	derivation: { windowWeeks: number; weeksTrained: number; total: number }
	onChange: (next: number) => void
}) {
	const step = STEP[currency]
	const level = describeLevel(value, currency, discipline)
	const shown = splitVolume(value, currency)

	return (
		<div className="flex flex-col gap-4">
			<Caption>
				Season Anchor · {DISCIPLINE[discipline]} · {CURRENCY_UNIT[currency]}/wk
			</Caption>
			<div className="flex items-center gap-4">
				<Figure value={shown.figure} unit={shown.unit} className="grow" />
				<div className="flex shrink-0 flex-col gap-2">
					<Button
						variant="outline"
						size="icon-lg"
						aria-label={`More ${DISCIPLINE[discipline]}`}
						onClick={() => onChange(round1(value + step))}
					>
						<Icon name="plus" />
					</Button>
					<Button
						variant="outline"
						size="icon-lg"
						aria-label={`Less ${DISCIPLINE[discipline]}`}
						onClick={() => onChange(round1(Math.max(step, value - step)))}
					>
						<Icon name="minus" />
					</Button>
				</div>
			</div>
			<div className="flex flex-wrap items-center gap-3">
				<Button
					variant={value === proposed ? 'secondary' : 'outline'}
					size="sm"
					className="tabular-nums"
					onClick={() => onChange(proposed)}
				>
					≈ {formatVolume(proposed, currency)}
				</Button>
				<span className="text-muted-foreground text-xs tabular-nums">
					{derivation.windowWeeks} wk · {derivation.weeksTrained} trained ·{' '}
					{formatVolume(derivation.total, currency)}
				</span>
			</div>
			<p className="text-foreground/70 text-sm tabular-nums">{level.summary}</p>
		</div>
	)
}

/* -------------------------------------------------------------------------- */
/* Variant                                                                    */
/* -------------------------------------------------------------------------- */

export default function VariantF({
	athlete,
	event,
	seasonStartMonday,
	seasonWeeks,
}: VariantProps) {
	const reduced = usePrefersReducedMotion()
	const tracks = useMemo(() => orderTracks(athlete.tracks), [athlete.tracks])

	const [intent, setIntent] = useState<Intent>('deliberately-building')
	const [presetOverride, setPresetOverride] = useState<string | null>(null)
	const [anchors, setAnchors] = useState<Partial<Record<Discipline, number>>>(
		{},
	)
	const [created, setCreated] = useState(false)

	const presetKey = presetOverride ?? PRESET_FOR_INTENT[intent]
	const preset = PRESETS.find((p) => p.key === presetKey) ?? PRESETS[0]!

	const anchorFor = (discipline: Discipline, proposed: number) =>
		anchors[discipline] ?? proposed

	const season: Week[] = useMemo(
		() =>
			buildSeason({
				tracks: tracksFor(athlete, anchors),
				presetKey,
				trainableDays: athlete.trainableDays,
				startMonday: seasonStartMonday,
				weeks: seasonWeeks,
				raceDiscipline: athlete.tracks.some(
					(track) => track.discipline === event.discipline,
				)
					? event.discipline
					: undefined,
			}),
		[
			athlete,
			anchors,
			presetKey,
			seasonStartMonday,
			seasonWeeks,
			event.discipline,
		],
	)

	const reference = useMemo(
		() => season.find((week) => week.role === 'loading') ?? season[0],
		[season],
	)
	const raceWeek = useMemo(
		() => season.find((week) => week.role === 'race') ?? season.at(-1),
		[season],
	)
	const raceSession = raceWeek?.sessions.find(
		(session) => session.kind === 'race',
	)
	// The track whose numbers a headline quotes is the athlete's biggest one
	// (`orderTracks`), not whichever the builder happened to list first.
	const primary =
		reference?.tracks.find(
			(track) => track.discipline === tracks[0]?.discipline,
		) ?? reference?.tracks[0]
	const level = primary?.level

	/** Peak week per Training Track — three Volume Currencies, never summed. */
	const peaks = useMemo(
		() =>
			tracks.map((track) => ({
				discipline: track.discipline,
				currency: track.currency,
				value: season.reduce(
					(most, week) =>
						Math.max(
							most,
							week.tracks.find((wt) => wt.discipline === track.discipline)
								?.targetVolume ?? 0,
						),
					0,
				),
			})),
		[season, tracks],
	)

	const longs = useMemo(
		() =>
			tracks
				.map((ordered) =>
					reference?.tracks.find(
						(track) => track.discipline === ordered.discipline,
					),
				)
				.filter((track) => track != null && track.longRun != null)
				.map((track) => track!)
				.map((track) => ({
					discipline: track.discipline,
					currency: track.currency,
					value: track.longRun!,
					share: track.longRunShare,
				})),
		[reference, tracks],
	)

	/* --- scroll progress + when the action becomes persistent --------------- */

	const [progress, setProgress] = useState(0)
	const gateRef = useRef<HTMLDivElement>(null)
	const endRef = useRef<HTMLDivElement>(null)
	const [pastInputs, setPastInputs] = useState(false)
	/** The last panel owns the action once it is on screen — never two of them. */
	const [atEnd, setAtEnd] = useState(false)

	useEffect(() => {
		let frame = 0
		const read = () => {
			frame = 0
			const doc = document.documentElement
			const span = doc.scrollHeight - window.innerHeight
			setProgress(span > 0 ? Math.min(1, window.scrollY / span) : 0)
			const gate = gateRef.current
			if (gate) setPastInputs(gate.getBoundingClientRect().top < 0)
			const end = endRef.current
			if (end)
				setAtEnd(end.getBoundingClientRect().top < window.innerHeight * 0.75)
		}
		const onScroll = () => {
			if (frame) return
			frame = window.requestAnimationFrame(read)
		}
		read()
		window.addEventListener('scroll', onScroll, { passive: true })
		window.addEventListener('resize', onScroll)
		return () => {
			window.removeEventListener('scroll', onScroll)
			window.removeEventListener('resize', onScroll)
			if (frame) window.cancelAnimationFrame(frame)
		}
	}, [])

	const finish = useCallback(() => {
		setCreated(true)
		document
			.getElementById('variant-f-finish')
			?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' })
	}, [reduced])

	const sessionsPerWeek = reference?.sessions.length ?? 0
	const easyShare = primary ? Math.round(primary.easyShare * 100) : 0

	return (
		<div className="relative">
			{/* Scroll-progress hairline. */}
			<div
				className="bg-border/40 fixed inset-x-0 top-0 z-40 h-[3px]"
				aria-hidden
			>
				<div
					className="bg-primary h-full origin-left"
					style={{ transform: `scaleX(${progress})` }}
				/>
			</div>

			<div className="mx-auto w-full max-w-2xl px-4 md:max-w-3xl md:px-8">
				{/* 1 — the Target Event, already in the calendar. */}
				<Panel>
					<Reveal className="flex flex-col gap-3">
						<Caption>{athlete.name} · Target Event</Caption>
						<h1 className="text-3xl leading-tight font-semibold tracking-tight md:text-5xl">
							{event.name}
						</h1>
					</Reveal>
					<Reveal delay={120} className="flex flex-col gap-3">
						<Figure value={String(event.weeksAway)} unit="weeks away" />
						<p className="text-muted-foreground text-sm tabular-nums">
							{weekdayDate(event.date)} · Priority {event.priority} ·{' '}
							{DISCIPLINE[event.discipline]}
						</p>
					</Reveal>
					<Reveal
						delay={240}
						className="text-muted-foreground flex items-center gap-2 text-xs"
					>
						<Icon
							name="chevron-down"
							className={cn(
								'size-5',
								reduced ? null : 'motion-safe:animate-bounce',
							)}
						/>
						<span className="tracking-[0.32em] uppercase">Scroll</span>
					</Reveal>
				</Panel>

				{/* 2 — input: where are you right now. */}
				<Panel>
					<Reveal className="flex flex-col gap-6">
						<Caption>Right now</Caption>
						<div className="flex flex-col gap-3">
							{INTENTS.map((option) => {
								const active = option.key === intent
								return (
									<button
										key={option.key}
										type="button"
										onClick={() => {
											setIntent(option.key)
											setPresetOverride(null)
										}}
										aria-pressed={active}
										className={cn(
											'flex min-h-16 items-center justify-between gap-4 rounded-3xl border px-5 py-4 text-left text-xl font-medium transition-colors md:text-2xl',
											active
												? 'border-primary bg-primary/10 text-foreground'
												: 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/40',
										)}
									>
										{option.label}
										{active ? (
											<Icon name="check" className="text-primary size-6" />
										) : null}
									</button>
								)
							})}
						</div>
					</Reveal>
				</Panel>

				{/* 3 — input: one Season Anchor per Training Track. */}
				<Panel>
					{tracks.map((track, index) => (
						<Reveal key={track.discipline} delay={index * 120}>
							<AnchorDial
								discipline={track.discipline}
								currency={track.currency}
								value={anchorFor(track.discipline, track.proposedAnchor)}
								proposed={track.proposedAnchor}
								derivation={track.derivation}
								onChange={(next) =>
									setAnchors((current) => ({
										...current,
										[track.discipline]: next,
									}))
								}
							/>
						</Reveal>
					))}
				</Panel>

				<div ref={gateRef} aria-hidden />

				{/* 4 — the shape, derived from the intent. */}
				<Panel>
					<Reveal className="flex flex-col gap-4">
						<Caption>The season</Caption>
						<Figure value={String(season.length)} unit="weeks" />
						<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
							<Derived>{preset.name}</Derived>
							<Derived>{weekdayDate(seasonStartMonday)}</Derived>
						</div>
					</Reveal>
					<Reveal delay={120} className="flex flex-col gap-4">
						<p className="text-foreground/70 flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums">
							{preset.phases.map((phase) => (
								<span key={phase.name}>
									{phase.name} {phase.weeks}
								</span>
							))}
						</p>
						<div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
							{PRESETS.map((option) => (
								<Button
									key={option.key}
									variant={option.key === presetKey ? 'secondary' : 'outline'}
									size="sm"
									className="shrink-0"
									onClick={() => setPresetOverride(option.key)}
								>
									{option.name}
								</Button>
							))}
						</div>
						{/* The Periodization Preset's own weekly load, as a rule. */}
						<div className="flex h-24 items-end gap-[3px]">
							{season.map((week) => {
								const peak = Math.max(
									...season.map((other) => other.targetVolume),
									1,
								)
								return (
									<span
										key={week.weekKey}
										className={cn(
											'flex-1 rounded-t-sm',
											week.role === 'race'
												? 'bg-foreground'
												: week.role === 'taper'
													? 'bg-muted-foreground/50'
													: week.role === 'recovery'
														? 'bg-primary/35'
														: 'bg-primary',
										)}
										style={{
											height: `${Math.max(6, (week.targetVolume / peak) * 100)}%`,
										}}
									/>
								)
							})}
						</div>
					</Reveal>
				</Panel>

				{/* 5 — sessions a week, banded by the anchor. */}
				<Panel>
					<Reveal className="flex flex-col gap-4">
						<Caption>Sessions a week</Caption>
						<Figure value={String(sessionsPerWeek)} />
						{tracks.length > 1 ? (
							<p className="text-foreground/70 flex flex-wrap gap-x-4 text-sm tabular-nums">
								{tracks.map((track) => (
									<span key={track.discipline}>
										{DISCIPLINE[track.discipline]}{' '}
										{reference?.sessions.filter(
											(session) => session.discipline === track.discipline,
										).length ?? 0}
									</span>
								))}
							</p>
						) : null}
						{level ? (
							<p className="text-foreground/70 text-sm tabular-nums">
								{level.summary}
							</p>
						) : null}
					</Reveal>
					<Reveal delay={120} className="flex flex-col gap-3">
						<Caption>Weekdays</Caption>
						<div className="flex flex-wrap gap-2">
							{DAYS.map((day) => {
								const on = trained(reference, day)
								return (
									<span
										key={day}
										className={cn(
											'flex size-11 items-center justify-center rounded-2xl border text-sm font-medium',
											on
												? 'border-primary bg-primary/10 text-foreground'
												: 'border-border text-muted-foreground/60',
										)}
									>
										{day.slice(0, 2)}
									</span>
								)
							})}
						</div>
						<Derived>
							{athlete.trainableDays.length > 0
								? `${athlete.trainableDays.length} trainable days`
								: '7 trainable days'}
						</Derived>
					</Reveal>
				</Panel>

				{/* 6 — the longest session, per track. */}
				<Panel>
					<Reveal className="flex flex-col gap-4">
						<Caption>Longest session</Caption>
						{longs.length > 0 ? (
							<div className="flex flex-col gap-6">
								{longs.map((long, index) => {
									const shown = splitVolume(long.value, long.currency)
									return (
										<div key={long.discipline} className="flex flex-col gap-1">
											{longs.length > 1 ? (
												<Caption>{DISCIPLINE[long.discipline]}</Caption>
											) : null}
											<Figure
												value={shown.figure}
												unit={shown.unit}
												className={
													index > 0 && longs.length > 1
														? 'text-[3.5rem] md:text-[5.5rem]'
														: undefined
												}
											/>
											<Derived>
												{Math.round(long.share * 100)}% of the week
											</Derived>
										</div>
									)
								})}
							</div>
						) : (
							<Figure value="—" />
						)}
					</Reveal>
				</Panel>

				{/* 7 — peak week, one figure per Volume Currency. */}
				<Panel>
					<Reveal className="flex flex-col gap-4">
						<Caption>Peak week</Caption>
						<div
							className={cn(
								'flex flex-col gap-6',
								peaks.length > 1 ? 'md:flex-row md:gap-12' : null,
							)}
						>
							{peaks.map((peak) => {
								const shown = splitVolume(peak.value, peak.currency)
								return (
									<div key={peak.discipline} className="flex flex-col gap-1">
										{peaks.length > 1 ? (
											<Caption>{DISCIPLINE[peak.discipline]}</Caption>
										) : null}
										<Figure
											value={shown.figure}
											unit={shown.unit}
											className={
												peaks.length > 1
													? 'text-[3.5rem] md:text-[5rem]'
													: undefined
											}
										/>
									</div>
								)
							})}
						</div>
					</Reveal>
				</Panel>

				{/* 8 — the easy/quality split. */}
				<Panel>
					<Reveal className="flex flex-col gap-4">
						<Caption>Easy</Caption>
						<Figure value={String(easyShare)} unit="%" />
						{level ? (
							<p className="text-foreground/70 text-sm tabular-nums">
								{level.quality[0]}–{level.quality[1]} quality ·{' '}
								{Math.round(level.easyShareTarget[0] * 100)}–
								{Math.round(level.easyShareTarget[1] * 100)}% easy
							</p>
						) : null}
					</Reveal>
				</Panel>

				{/* 9 — Race week. */}
				<Panel>
					<Reveal className="flex flex-col gap-4">
						<Caption>Race week</Caption>
						<Figure value={shortDate(event.date)} />
						{raceSession ? (
							<p className="text-foreground/70 text-sm tabular-nums">
								{raceSession.day} · {raceSession.title} · {raceSession.volume}
							</p>
						) : null}
						{raceWeek ? (
							<Derived>
								week {raceWeek.index} · {raceWeek.phase}
							</Derived>
						) : null}
					</Reveal>
				</Panel>

				{/* 10 — one action, and its confirmation. */}
				<div ref={endRef} aria-hidden />
				<Panel id="variant-f-finish" className="pb-40">
					{created ? (
						<Reveal className="flex flex-col gap-6">
							<Icon
								name="circle-check"
								className="text-primary size-12 self-start"
							/>
							<h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
								Plan Outline created
							</h2>
							<dl className="text-foreground/80 grid grid-cols-2 gap-4 text-sm tabular-nums">
								<div>
									<dt className="text-muted-foreground">Weeks</dt>
									<dd className="text-2xl font-semibold">{season.length}</dd>
								</div>
								<div>
									<dt className="text-muted-foreground">Sessions a week</dt>
									<dd className="text-2xl font-semibold">{sessionsPerWeek}</dd>
								</div>
								{peaks.map((peak) => (
									<div key={peak.discipline}>
										<dt className="text-muted-foreground">
											{DISCIPLINE[peak.discipline]} peak
										</dt>
										<dd className="text-2xl font-semibold">
											{formatVolume(peak.value, peak.currency)}
										</dd>
									</div>
								))}
								<div>
									<dt className="text-muted-foreground">Race week</dt>
									<dd className="text-2xl font-semibold">
										{shortDate(event.date)}
									</dd>
								</div>
							</dl>
							<Button
								variant="outline"
								className="self-start"
								onClick={() => setCreated(false)}
							>
								<Icon name="arrow-left" />
								Back to the season
							</Button>
						</Reveal>
					) : (
						<Reveal className="flex flex-col gap-6">
							<Caption>{event.name}</Caption>
							<Figure value={String(season.length)} unit="weeks" />
							<Button
								size="lg"
								className="h-14 self-start px-8"
								onClick={finish}
							>
								Create Plan Outline
								<Icon name="arrow-right" />
							</Button>
						</Reveal>
					)}
				</Panel>
			</div>

			{/* Persistent action, once the input panels are behind the athlete. */}
			<div
				className={cn(
					'fixed inset-x-0 bottom-20 z-30 flex justify-center px-4 transition-opacity duration-300',
					pastInputs && !created && !atEnd
						? 'opacity-100'
						: 'pointer-events-none opacity-0',
				)}
			>
				<Button
					size="lg"
					className="h-12 w-full max-w-2xl shadow-lg"
					tabIndex={pastInputs && !created && !atEnd ? 0 : -1}
					onClick={finish}
				>
					Create Plan Outline
					<Icon name="arrow-right" />
				</Button>
			</div>
		</div>
	)
}

/** Whether the reference week puts any session on this weekday. */
function trained(week: Week | undefined, day: Day): boolean {
	return week?.sessions.some((session) => session.day === day) ?? false
}
