/**
 * PROTOTYPE — variant L, "J with a TanStack Charts visualisation layer".
 *
 * L is not a new layout. It is variant J's screen — Target Event as a settled
 * fact, one question, one Season Anchor per Training Track, a derived-facts chip
 * row, a sticky summary, a weekday × week calendar — with the three figures the
 * charting review ranked, drawn by `@tanstack/charts` instead of by hand:
 *
 *   1. a **per-track volume hairline** in each week's gutter, 2 px inside the
 *      existing `min-h-9` row, one per track, each on **its own** scale;
 *   2. the **season sparkline** promoted into the sticky summary bar, doubling as
 *      the calendar's scroll-position indicator;
 *   3. one chip that expands the **season load profile** — 0 px closed.
 *
 * The library is reached only through `__prototype-charts.tsx`; this file imports
 * three purpose-shaped components and never `@tanstack/*` itself, so a breaking
 * rename in 0.14 cannot reach the variant.
 *
 * The grid is deliberately thinner than J's: no drag-and-drop, no scrubbable week
 * total, no ⌘K palette. Those are J's questions and J answers them. L's question
 * is whether a measuring chart library survives SSR, 390 px, and three Volume
 * Currencies, so everything that is not a figure is reproduced only far enough for
 * the figures to be read in context.
 *
 * **Three Volume Currencies, three axes, never a sum.** `tora` carries run km,
 * bike km and swim km-as-its-own-track; other athletes carry hours or TSS. Nothing
 * on this screen adds two tracks together or maps them onto one value axis (ADR
 * 0043 §7, ADR 0046 §1, `prisma/schema.prisma:1637-1638`). Three mechanisms
 * enforce it rather than three conventions:
 *   - a hairline takes **one** value and **one** peak, so a sum is not expressible;
 *   - the load profile takes **one** track's points and **one** unit, and the panel
 *     shows **one track at a time** behind a segmented selector — two currencies are
 *     never on screen together, so there is no axis to accidentally share;
 *   - the sticky sparkline is the Periodization Preset's **unit-less 0–1 ratio**
 *     silhouette (`__prototype-data.ts:385-397`), carries no axis, no number and no
 *     unit, and is therefore the one figure that is honest across three currencies:
 *     it claims no exchange rate because it claims no unit.
 *
 * Sticky, in three layers, so something is always on screen while 20 rows scroll:
 * the summary bar + sparkline + weekday scale at `top-0`, and each Phase's label
 * as an iOS-style section header at `top-[--sticky-chrome]` beneath it.
 *
 * Dates are assembled by hand — `toLocaleDateString` prints `Fri, 30 Oct` under
 * Node's ICU and `Fri 30 Oct` in Chromium, and that comma is a hydration mismatch
 * (J's scar). The scroll fraction is rounded before it becomes a percentage, for
 * the same reason (variant G's scar).
 *
 * THROWAWAY — do not ship. Delete with the /training/plan/prototype route.
 */
import { useEffect, useMemo, useState } from 'react'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import {
	Popover,
	PopoverContent,
	PopoverTitle,
	PopoverTrigger,
} from '#app/components/ui/popover.tsx'
import { DISCIPLINE_LABELS } from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import {
	SeasonSparkline,
	TrackHairline,
	TrackLoadProfile,
	type LoadProfilePoint,
} from './__prototype-charts.tsx'
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
	type SessionKind,
	type VariantProps,
	type Week,
	type WeekRole,
} from './__prototype-data.ts'

/* -------------------------------------------------------------------------- */
/* Vocabulary — J's, unchanged                                                */
/* -------------------------------------------------------------------------- */

const ROLE_LABEL: Record<WeekRole, string> = {
	loading: 'Loading',
	recovery: 'Recovery',
	taper: 'Taper',
	race: 'Race week',
}

const INTENT_PRESET: Record<Intent, string> = {
	'first-season': 'gentle-ramp',
	'returning-from-injury': 'back-from-injury',
	'deliberately-building': DEFAULT_PRESET_KEY,
}

/** One character per Training Track, so a chip can name its track in 43 px. */
const TRACK_GLYPH: Record<Discipline, string> = {
	run: 'R',
	bike: 'B',
	swim: 'S',
}

/** The Season Anchor's unit, written the way an anchor is spoken. */
const ANCHOR_UNIT: Record<Currency, string> = {
	km: 'km/wk',
	hours: 'h/wk',
	tss: 'TSS/wk',
}

/**
 * One `text-*` class per Training Track. Marks paint `currentColor`, which is how
 * `ChartFigure` themes too (`app/components/chart/chart.tsx:389-390`) — so the
 * hairlines inherit dark mode with no palette of their own.
 */
const TRACK_TONE: Record<Discipline, string> = {
	run: 'text-primary',
	bike: 'text-foreground',
	swim: 'text-primary/55',
}

const ARCHETYPE_WORD: Record<string, string> = {
	race: 'Race',
	strides: 'Strides',
	recovery: 'Recovery',
	long: 'Long',
	threshold: 'Threshold',
	vo2: 'VO₂max',
	reps: 'Reps',
	easy: 'Easy',
}

const KIND_CHIP: Record<SessionKind, string> = {
	recovery: 'bg-muted/50 text-muted-foreground',
	easy: 'bg-muted text-foreground',
	long: 'bg-primary/20 text-foreground ring-1 ring-primary/40 ring-inset',
	quality: 'bg-primary text-primary-foreground',
	race: 'bg-foreground text-background',
}

const PHASE_BAND = [
	'bg-primary/70',
	'bg-primary/40',
	'bg-foreground/40',
	'bg-primary/55',
	'bg-foreground/25',
]

const chipClass =
	'relative inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-2.5 text-xs whitespace-nowrap tabular-nums after:absolute after:inset-x-0 after:-inset-y-2 hover:bg-muted aria-expanded:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30 outline-none'

/**
 * The height of the sticky chrome: summary bar (44) + sparkline (20) + weekday
 * scale (20). A Phase header sticks exactly under it, so the two never overlap
 * and the calendar always shows *where* as well as *what*.
 */
const STICKY_CHROME_PX = 84

/* -------------------------------------------------------------------------- */
/* Pure helpers                                                               */
/* -------------------------------------------------------------------------- */

const MS_PER_WEEK = 604_800_000

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

function round1(n: number): number {
	return Math.round(n * 10) / 10
}

function shiftWeeks(iso: string, weeks: number): string {
	return new Date(Date.parse(`${iso}T00:00:00Z`) + weeks * MS_PER_WEEK)
		.toISOString()
		.slice(0, 10)
}

function dayMonth(iso: string): string {
	const at = new Date(`${iso}T00:00:00Z`)
	return `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]}`
}

function weekdayOf(iso: string): Day {
	const dow = new Date(`${iso}T00:00:00Z`).getUTCDay()
	return DAYS[(dow + 6) % 7]!
}

function weekdayDate(iso: string): string {
	return `${weekdayOf(iso)} ${dayMonth(iso)}`
}

/** A chip's number, short enough for a 43 px column. */
function compact(value: number, currency: Currency): string {
	if (currency === 'hours') {
		const minutes = Math.round(value * 60)
		const hours = Math.floor(minutes / 60)
		const rest = minutes % 60
		return hours === 0
			? String(rest)
			: `${hours}:${String(rest).padStart(2, '0')}`
	}
	return String(Math.round(value))
}

/** One track's week, or null when this week carries no volume for it. */
function trackWeek(week: Week, discipline: Discipline) {
	return week.tracks.find((track) => track.discipline === discipline) ?? null
}

/* -------------------------------------------------------------------------- */
/* The screen                                                                 */
/* -------------------------------------------------------------------------- */

export default function VariantL({
	athlete,
	event,
	// L has no Target Event switcher — the event is a settled fact here, because the
	// figures are the question. J owns choosing between events.
	events: _events,
	seasonStartMonday,
	seasonWeeks,
}: VariantProps) {
	const tracks = useMemo(() => orderTracks(athlete.tracks), [athlete.tracks])
	const multi = tracks.length > 1
	const lead = tracks[0]!

	const [intent, setIntent] = useState<Intent>('deliberately-building')
	const [presetOverride, setPresetOverride] = useState<string | null>(null)
	const [anchors, setAnchors] = useState<Partial<Record<Discipline, number>>>(
		() =>
			Object.fromEntries(tracks.map((t) => [t.discipline, t.proposedAnchor])),
	)
	const [anchorText, setAnchorText] = useState<
		Partial<Record<Discipline, string>>
	>({})
	const [created, setCreated] = useState(false)
	const [expanded, setExpanded] = useState<number | null>(null)

	const [profileOpen, setProfileOpen] = useState(false)
	const [profileTrack, setProfileTrack] = useState<Discipline>(lead.discipline)

	/**
	 * How far through the calendar the athlete has scrolled, 0–1. Client-only and
	 * initialised to 0, so the server and the first client render agree; the effect
	 * that measures runs after hydration, where a state change is not a mismatch.
	 */
	const [progress, setProgress] = useState(0)

	useEffect(() => {
		function measure() {
			const span = document.documentElement.scrollHeight - window.innerHeight
			// Rounded here, not at render: an unrounded fraction differs in its last
			// bit between engines, and this one becomes a `left:` percentage.
			setProgress(
				span > 0
					? Math.round(Math.min(1, Math.max(0, window.scrollY / span)) * 1000) /
							1000
					: 0,
			)
		}
		measure()
		window.addEventListener('scroll', measure, { passive: true })
		window.addEventListener('resize', measure)
		return () => {
			window.removeEventListener('scroll', measure)
			window.removeEventListener('resize', measure)
		}
	}, [])

	const target = event
	const raceWeekday = weekdayOf(target.date)
	const presetKey = presetOverride ?? INTENT_PRESET[intent]
	const preset = PRESETS.find((p) => p.key === presetKey) ?? PRESETS[0]!
	const startMonday = seasonStartMonday

	const season = useMemo(
		() =>
			buildSeason({
				tracks: tracksFor({ ...athlete, tracks }, anchors),
				presetKey,
				trainableDays: athlete.trainableDays,
				startMonday,
				weeks: target.weeksAway ?? seasonWeeks,
				raceDiscipline: target.discipline,
			}),
		[
			athlete,
			tracks,
			anchors,
			presetKey,
			startMonday,
			seasonWeeks,
			target.weeksAway,
			target.discipline,
		],
	)

	const sessionCount = season.reduce(
		(sum, week) => sum + week.sessions.length,
		0,
	)
	const raceMonday = shiftWeeks(startMonday, Math.max(0, season.length - 1))

	/**
	 * Each Training Track's **own** season peak, keyed by discipline. Every figure
	 * on this screen scales against the entry for its own track and never against
	 * another's, which is the whole of ADR 0046 §1 expressed as a lookup.
	 */
	const peaks = useMemo(() => {
		const out = new Map<Discipline, number>()
		for (const track of tracks) {
			out.set(
				track.discipline,
				season.reduce(
					(most, week) =>
						Math.max(
							most,
							trackWeek(week, track.discipline)?.targetVolume ?? 0,
						),
					0,
				),
			)
		}
		return out
	}, [season, tracks])

	/** One season figure per Training Track — never one that reads as a total. */
	const trackTotals = tracks.map((track) => ({
		discipline: track.discipline,
		currency: track.currency,
		total: season.reduce(
			(sum, week) =>
				sum + (trackWeek(week, track.discipline)?.targetVolume ?? 0),
			0,
		),
	}))

	/**
	 * The sticky sparkline's points: each week as a fraction of the season peak,
	 * **unit-less**. The Periodization Preset scales every track by the same 0–1
	 * factor, so this silhouette is the same shape whichever track it is read from
	 * — which is exactly why it can be shown once for a triathlete without
	 * implying that their km and their hours are interchangeable. It carries no
	 * axis and no number; the numbers are in the words beside it.
	 */
	const sparkPoints = useMemo(() => {
		const peak = peaks.get(lead.discipline) ?? 0
		if (peak <= 0) return season.map(() => 0)
		return season.map(
			(week) => (trackWeek(week, lead.discipline)?.targetVolume ?? 0) / peak,
		)
	}, [season, peaks, lead.discipline])

	/** The expanded chip's chart: one track, one currency, one value axis. */
	const profile = useMemo(() => {
		const track = tracks.find((t) => t.discipline === profileTrack) ?? lead
		const points: LoadProfilePoint[] = season.map((week) => {
			const slice = trackWeek(week, track.discipline)
			return {
				week: week.index,
				// ADR 0030 rule 1: a week this track carries no volume in is `null`,
				// and `null` draws no bar — never a floored one.
				value: slice && slice.targetVolume > 0 ? slice.targetVolume : null,
				role: ROLE_LABEL[week.role],
				phase: week.phase,
			}
		})
		return { track, points }
	}, [season, tracks, profileTrack, lead])

	const cols = multi
		? 'grid-cols-[4.75rem_repeat(7,minmax(0,1fr))] md:grid-cols-[9rem_repeat(7,minmax(0,1fr))]'
		: 'grid-cols-[4.25rem_repeat(7,minmax(0,1fr))] md:grid-cols-[8rem_repeat(7,minmax(0,1fr))]'

	/** The season grouped into Phases, so each Phase gets one sticky header. */
	const phaseGroups = useMemo(() => {
		const order: string[] = []
		const groups: { phase: string; band: string; weeks: Week[] }[] = []
		for (const week of season) {
			if (!order.includes(week.phase)) order.push(week.phase)
			const last = groups.at(-1)
			if (last && last.phase === week.phase) last.weeks.push(week)
			else
				groups.push({
					phase: week.phase,
					band: PHASE_BAND[order.indexOf(week.phase) % PHASE_BAND.length]!,
					weeks: [week],
				})
		}
		return groups
	}, [season])

	/* ------------------------------ mutations ------------------------------- */

	function applyIntent(next: Intent) {
		setIntent(next)
		setPresetOverride(null)
		setCreated(false)
	}

	function reset() {
		setAnchors(
			Object.fromEntries(tracks.map((t) => [t.discipline, t.proposedAnchor])),
		)
		setAnchorText({})
		setPresetOverride(null)
		setExpanded(null)
		setCreated(false)
	}

	/* ------------------------------- render --------------------------------- */

	// `pb-16` keeps the last week clear of the prototype switcher pill at `bottom-4`.
	return (
		<div className="container max-w-6xl py-2 pb-16 md:py-8">
			{/* Target Event — a settled fact, not a question. */}
			<header className="flex items-baseline justify-between gap-3">
				<h1 className="min-w-0 truncate text-xl font-semibold md:text-2xl">
					{target.name}
				</h1>
				<p className="text-muted-foreground shrink-0 text-xs tabular-nums">
					{weekdayDate(target.date)} · {target.priority} ·{' '}
					{DISCIPLINE_LABELS[target.discipline]}
				</p>
			</header>

			{/* The one question on the screen. Everything else is a number, a unit,
			    a weekday, a Phase name or a domain term. */}
			<h2 className="mt-1.5 text-sm font-medium">Where are you now?</h2>

			<div
				role="radiogroup"
				aria-label="Where are you now?"
				className="border-border bg-input/40 mt-1.5 grid grid-cols-3 gap-1 rounded-xl border p-1 md:max-w-2xl"
			>
				{INTENTS.map((option) => (
					<button
						key={option.key}
						type="button"
						role="radio"
						aria-checked={option.key === intent}
						onClick={() => applyIntent(option.key)}
						className={cn(
							'focus-visible:ring-ring/30 min-h-9 rounded-lg px-1 text-[11px] leading-tight outline-none focus-visible:ring-3 md:text-sm',
							option.key === intent
								? 'bg-primary text-primary-foreground font-medium'
								: 'text-muted-foreground hover:bg-muted',
						)}
					>
						{option.label}
					</button>
				))}
			</div>

			{/* One Season Anchor per Training Track — sized to its own content. */}
			<div className="border-border mt-2 divide-y divide-dashed rounded-xl border md:max-w-2xl">
				{tracks.map((track) => {
					const value = anchors[track.discipline] ?? track.proposedAnchor
					const text = anchorText[track.discipline] ?? String(round1(value))
					const level = describeLevel(value, track.currency, track.discipline)
					return (
						<div
							key={track.discipline}
							className="flex items-center justify-between gap-2 px-3 py-1.5"
						>
							<div className="min-w-0">
								<span className="flex items-baseline gap-1.5">
									<label
										htmlFor={`l-anchor-${track.discipline}`}
										className="text-sm font-medium"
									>
										{DISCIPLINE_LABELS[track.discipline]}
									</label>
									<span className="text-muted-foreground text-[11px] tabular-nums">
										≈ {track.proposedAnchor} · {track.derivation.windowWeeks}-wk
									</span>
								</span>
								<span className="text-muted-foreground block truncate text-[11px] tabular-nums">
									{level.summary}
								</span>
							</div>
							<div className="flex shrink-0 items-baseline gap-1.5">
								<input
									id={`l-anchor-${track.discipline}`}
									type="number"
									inputMode="decimal"
									min={0}
									step={track.currency === 'hours' ? 0.5 : 1}
									value={text}
									style={{
										width: `calc(${Math.max(2, text.length)}ch + 1rem)`,
									}}
									onChange={(e) => {
										const raw = e.target.value
										setAnchorText((prev) => ({
											...prev,
											[track.discipline]: raw,
										}))
										const next = Number.parseFloat(raw)
										if (!Number.isNaN(next) && next > 0) {
											setAnchors((prev) => ({
												...prev,
												[track.discipline]: next,
											}))
											setCreated(false)
										}
									}}
									onBlur={() =>
										setAnchorText((prev) => {
											const nextText = { ...prev }
											delete nextText[track.discipline]
											return nextText
										})
									}
									className="focus-visible:border-ring focus-visible:ring-ring/30 bg-input/50 appearance-none rounded-lg border border-transparent px-2 py-0.5 text-right text-2xl font-semibold tabular-nums outline-none focus-visible:ring-3 md:text-3xl [&::-webkit-inner-spin-button]:appearance-none"
								/>
								<span className="text-muted-foreground text-[11px]">
									{ANCHOR_UNIT[track.currency]}
								</span>
							</div>
						</div>
					)
				})}
			</div>

			{/* Everything derived — shown, tappable, never a step. */}
			<div className="-mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
				<Popover>
					<PopoverTrigger className={chipClass}>
						{preset.name}
						<Icon
							name="chevron-down"
							className="text-muted-foreground size-3"
						/>
					</PopoverTrigger>
					<PopoverContent align="start" className="w-72 gap-2">
						<PopoverTitle className="text-sm">
							Periodization Preset
						</PopoverTitle>
						<ul className="-mx-1 max-h-72 overflow-y-auto">
							{PRESETS.map((option) => (
								<li key={option.key}>
									<button
										type="button"
										onClick={() => {
											setPresetOverride(option.key)
											setCreated(false)
										}}
										aria-current={option.key === presetKey}
										className={cn(
											'hover:bg-muted flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm',
											option.key === presetKey && 'bg-muted font-medium',
										)}
									>
										<span className="flex-1 truncate">{option.name}</span>
										<span className="text-muted-foreground shrink-0 text-xs tabular-nums">
											{option.phases.map((phase) => phase.weeks).join('·')}
										</span>
									</button>
								</li>
							))}
						</ul>
					</PopoverContent>
				</Popover>

				{/* Proposal 3 — 0 px inline, ~330 px open, behind one tap. */}
				<button
					type="button"
					aria-expanded={profileOpen}
					aria-controls="l-load-profile"
					onClick={() => setProfileOpen((open) => !open)}
					className={cn(chipClass, profileOpen && 'bg-muted')}
				>
					<Icon name="bar-chart" className="text-primary size-3" />
					{CURRENCY_UNIT[profile.track.currency]}/wk
					<Icon
						name={profileOpen ? 'chevron-up' : 'chevron-down'}
						className="text-muted-foreground size-3"
					/>
				</button>

				<span
					className={cn(chipClass, 'pointer-events-none gap-1 after:hidden')}
				>
					<Icon name="clock" className="text-muted-foreground size-3" />
					{dayMonth(raceMonday)}
					<span className="text-muted-foreground">Race week</span>
				</span>

				{/* One figure per Training Track — no cross-track total anywhere. */}
				{trackTotals.map((row) => (
					<span
						key={row.discipline}
						className={cn(chipClass, 'pointer-events-none gap-1 after:hidden')}
					>
						{multi ? (
							<span className="text-muted-foreground">
								{TRACK_GLYPH[row.discipline]}
							</span>
						) : null}
						≈ {formatVolume(row.total, row.currency)}
					</span>
				))}

				<button
					type="button"
					onClick={reset}
					aria-label="Reset"
					className={cn(chipClass, 'w-8 justify-center px-0')}
				>
					<Icon name="reset" className="size-3.5" />
				</button>
			</div>

			{/* The season load profile. One track at a time: a second currency on the
			    same screen is a shared axis waiting to happen, so the selector — not a
			    convention — is what keeps the currencies apart. */}
			{profileOpen ? (
				<div
					id="l-load-profile"
					className="border-border mt-2 rounded-xl border p-2 md:max-w-2xl"
				>
					{multi ? (
						<div
							role="radiogroup"
							aria-label="Training Track"
							className="mb-2 flex gap-1"
						>
							{tracks.map((track) => (
								<button
									key={track.discipline}
									type="button"
									role="radio"
									aria-checked={track.discipline === profileTrack}
									onClick={() => setProfileTrack(track.discipline)}
									className={cn(
										'min-h-9 flex-1 rounded-lg px-2 text-xs tabular-nums',
										track.discipline === profileTrack
											? 'bg-primary text-primary-foreground font-medium'
											: 'text-muted-foreground bg-muted/50',
									)}
								>
									{DISCIPLINE_LABELS[track.discipline]}{' '}
									{CURRENCY_UNIT[track.currency]}
								</button>
							))}
						</div>
					) : null}

					<TrackLoadProfile
						key={profile.track.discipline}
						points={profile.points}
						unit={CURRENCY_UNIT[profile.track.currency]}
						trackLabel={DISCIPLINE_LABELS[profile.track.discipline]}
						ariaLabel={`${DISCIPLINE_LABELS[profile.track.discipline]} weekly volume in ${CURRENCY_UNIT[profile.track.currency]} across ${season.length} Training Weeks`}
						format={(value) => formatVolume(value, profile.track.currency)}
						className={TRACK_TONE[profile.track.discipline]}
						dataTable={{
							caption: `${DISCIPLINE_LABELS[profile.track.discipline]} weekly volume by Training Week, in ${CURRENCY_UNIT[profile.track.currency]}`,
							columns: [
								'Week',
								'Phase',
								'Role',
								CURRENCY_UNIT[profile.track.currency],
							],
							rows: profile.points.map((point) => [
								String(point.week),
								point.phase,
								point.role,
								point.value == null
									? 'n/a'
									: formatVolume(point.value, profile.track.currency),
							]),
						}}
					/>
				</div>
			) : null}

			{/* Sticky layer 1 — the summary, the action, the season, the weekdays. */}
			<div className="bg-background sticky top-0 z-30 -mx-4 mt-1 px-4 md:-mx-8 md:px-8">
				<div className="flex h-11 items-center gap-2">
					<Icon name="calendar" size="sm" className="text-primary shrink-0" />
					<span className="text-muted-foreground min-w-0 flex-1 truncate text-xs tabular-nums">
						{target.name} · {season.length} wk · {sessionCount} ·{' '}
						{athlete.trainableDays.length}×/wk
					</span>
					{created ? (
						<span
							role="status"
							className="text-primary flex shrink-0 items-center gap-1 text-xs font-medium tabular-nums"
						>
							<Icon name="circle-check" size="sm" />
							Plan Outline
						</span>
					) : (
						<Button
							size="sm"
							className="shrink-0"
							onClick={() => setCreated(true)}
						>
							Create plan
						</Button>
					)}
				</div>

				{/* Proposal 2 — the season silhouette *is* the scroll indicator. */}
				<div className="flex h-5 items-center">
					<SeasonSparkline
						points={sparkPoints}
						progress={progress}
						ariaLabel={`Season load silhouette, ${season.length} Training Weeks, ratio of each week to the season peak`}
						className="text-primary/70"
					/>
				</div>

				<div className={`grid ${cols} border-border h-5 border-b`}>
					<div className="text-muted-foreground text-[10px] tabular-nums">
						{multi ? `${tracks.length} tracks` : CURRENCY_UNIT[lead.currency]}
					</div>
					{DAYS.map((day) => (
						<div
							key={day}
							className={cn(
								'text-muted-foreground text-center text-[10px] font-medium',
								athlete.trainableDays.length > 0 &&
									!athlete.trainableDays.includes(day) &&
									'opacity-40',
							)}
						>
							<span className="md:hidden">{day.slice(0, 1)}</span>
							<span className="hidden md:inline">{day}</span>
						</div>
					))}
				</div>
			</div>

			{/* The calendar, grouped by Phase. */}
			<div className={cn(created && 'ring-primary/40 rounded-lg ring-2')}>
				{phaseGroups.map((group) => (
					<section key={`${group.phase}-${group.weeks[0]!.index}`}>
						{/* Sticky layer 2 — an iOS-style section header. */}
						<h3
							className="bg-background/95 border-border/60 text-muted-foreground sticky z-20 flex items-baseline gap-2 border-b px-2 py-0.5 text-[10px] font-medium backdrop-blur"
							style={{ top: STICKY_CHROME_PX }}
						>
							<span
								aria-hidden
								className={cn('h-2 w-1 shrink-0 self-center', group.band)}
							/>
							<span className="min-w-0 truncate">{group.phase}</span>
							<span className="ml-auto shrink-0 tabular-nums">
								{group.weeks.length} wk
							</span>
						</h3>

						{group.weeks.map((week) => (
							<div key={week.weekKey}>
								<div
									data-weekrow={week.index}
									className={cn(
										`grid ${cols} border-border/60 border-b`,
										week.role === 'race' && 'bg-primary/5',
										week.index === 1 && 'bg-muted/30',
									)}
								>
									{/* Gutter — week index, one total per track, one hairline
									    per track. Proposal 1: 2 px inside a 36 px row. */}
									<div className="relative flex flex-col justify-center gap-0.5 py-0.5 pl-2">
										<span
											aria-hidden
											className={`absolute inset-y-0 left-0 w-1 ${group.band}`}
										/>
										<button
											type="button"
											aria-expanded={expanded === week.index}
											aria-label={`Week ${week.index}, ${week.phase}`}
											onClick={() =>
												setExpanded(expanded === week.index ? null : week.index)
											}
											className="text-muted-foreground relative block truncate text-left text-[9px] leading-tight tabular-nums after:absolute after:inset-x-0 after:-inset-y-1 md:text-[10px]"
										>
											{week.index}
											{week.index === 1 ? (
												<span className="text-primary ml-1 font-medium">
													Now
												</span>
											) : null}
											<span className="ml-1">{ROLE_LABEL[week.role]}</span>
										</button>

										{week.tracks.map((track) => {
											const peak = peaks.get(track.discipline) ?? 0
											return (
												<div key={track.discipline}>
													<span className="text-foreground flex items-baseline gap-0.5 text-xs font-semibold tabular-nums">
														{multi ? (
															<span className="text-muted-foreground text-[10px] font-normal">
																{TRACK_GLYPH[track.discipline]}
															</span>
														) : null}
														{compact(track.targetVolume, track.currency)}
														<span className="text-muted-foreground text-[9px] font-normal">
															{CURRENCY_UNIT[track.currency]}
														</span>
													</span>
													{/* Each hairline is scaled to *this* track's own
													    season peak. There is no shared axis and no
													    total: the component takes one value and one
													    peak, so a sum is not expressible. */}
													<div className="h-0.5 w-full">
														<TrackHairline
															value={
																track.targetVolume > 0
																	? track.targetVolume
																	: null
															}
															peak={peak}
															ariaLabel={`${DISCIPLINE_LABELS[track.discipline]} week ${week.index}: ${formatVolume(track.targetVolume, track.currency)} of a ${formatVolume(peak, track.currency)} peak`}
															className={TRACK_TONE[track.discipline]}
														/>
													</div>
												</div>
											)
										})}
									</div>

									{/* Seven weekday cells. */}
									{DAYS.map((day) => (
										<div
											key={day}
											data-day={day}
											className="border-border/40 flex min-h-9 flex-col gap-0.5 border-l p-0.5"
										>
											{week.role === 'race' && day === raceWeekday ? (
												<span className="bg-foreground text-background truncate rounded px-1 text-[9px] font-semibold">
													{target.name}
												</span>
											) : null}
											{week.sessions
												.filter((session) => session.day === day)
												.map((session, slot) => (
													<span
														key={`${session.discipline}-${session.archetype}-${slot}`}
														aria-label={`${session.title}, ${DISCIPLINE_LABELS[session.discipline]}, ${session.volume}, ${day}, week ${week.index}`}
														className={cn(
															'flex items-center gap-0.5 overflow-hidden rounded px-0.5 py-0.5 text-[10px] leading-tight tabular-nums md:px-1 md:text-xs',
															KIND_CHIP[session.kind],
														)}
													>
														{multi ? (
															<span className="shrink-0 opacity-70">
																{TRACK_GLYPH[session.discipline]}
															</span>
														) : null}
														<span className="shrink-0 font-semibold">
															{compact(session.value, session.currency)}
														</span>
														<span className="hidden truncate md:inline">
															{ARCHETYPE_WORD[session.archetype] ??
																session.archetype}
														</span>
													</span>
												))}
										</div>
									))}
								</div>

								{/* Tapping the week index opens its rows. */}
								{expanded === week.index ? (
									<ul className="bg-muted/20 border-border/60 space-y-1 border-b px-2 py-2">
										{week.sessions.map((session, slot) => (
											<li
												key={`${session.discipline}-${session.archetype}-${slot}`}
												className="flex items-baseline gap-2 text-xs tabular-nums"
											>
												<span className="text-muted-foreground w-7 shrink-0">
													{session.day}
												</span>
												<span className="text-muted-foreground w-9 shrink-0 truncate">
													{DISCIPLINE_LABELS[session.discipline]}
												</span>
												<span className="min-w-0 flex-1 truncate">
													{session.title}
												</span>
												<span className="shrink-0 font-semibold">
													≈ {session.volume}
												</span>
											</li>
										))}
										<li className="text-muted-foreground flex flex-wrap gap-x-4 pt-1 text-[10px] tabular-nums">
											{week.tracks.map((track) => (
												<span key={track.discipline}>
													{DISCIPLINE_LABELS[track.discipline]} ≈{' '}
													{formatVolume(track.targetVolume, track.currency)} ·{' '}
													{track.longRun == null
														? '—'
														: `${Math.round(track.longRunShare * 100)} %`}{' '}
													· {Math.round(track.easyShare * 100)} %
												</span>
											))}
										</li>
									</ul>
								) : null}
							</div>
						))}
					</section>
				))}
			</div>
		</div>
	)
}
