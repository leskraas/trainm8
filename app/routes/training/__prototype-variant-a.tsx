/**
 * PROTOTYPE — Variant A, "Two-question form".
 *
 * Thesis: the whole create-a-plan journey collapses onto one screen. The Target
 * Event is a settled fact at the top; there are exactly two questions (intent,
 * and one Season Anchor per Training Track); everything else the generator
 * decided rides in a row of tappable chips. The Plan Preview updates live.
 *
 * Prose budget: under 60 words on the whole screen. Numbers do the talking.
 *
 * Named UI-convention exceptions (docs/design/ui-conventions.md §2.6): the
 * Season Anchor field is an oversized numeric control (font ≫ 16px, so no iOS
 * zoom, tap target ≫ 44px), and the chips + segmented options are custom
 * controls carrying the three tokens by hand.
 *
 * THROWAWAY — do not ship.
 */
import { useMemo, useState } from 'react'
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
	buildSeason,
	DEFAULT_PRESET_KEY,
	describeLevel,
	INTENTS,
	orderTracks,
	PRESETS,
	tracksFor,
	type Currency,
	type Discipline,
	type Intent,
	type Preset,
	type Provenance,
	type VariantProps,
	type Week,
	type WeekRole,
} from './__prototype-data.ts'

/* -------------------------------------------------------------------------- */
/* Formatting                                                                  */
/* -------------------------------------------------------------------------- */

const MS_PER_WEEK = 604_800_000

/** The Volume Currency, written the way an anchor is spoken. */
const CURRENCY_UNIT: Record<Currency, string> = {
	km: 'km/wk',
	hours: 'h/wk',
	tss: 'TSS/wk',
}

/** What `buildSeason` should print inside a week's volume. */
const CURRENCY_SHORT: Record<Currency, string> = {
	km: 'km',
	hours: 'h',
	tss: 'TSS',
}

const ROLE_LABELS: Record<WeekRole, string> = {
	loading: 'loading',
	recovery: 'recovery',
	taper: 'taper',
	race: 'race',
}

const ROLE_TONE: Record<WeekRole, string> = {
	loading: 'text-foreground/70',
	recovery: 'text-muted-foreground',
	taper: 'text-amber-500',
	race: 'text-primary',
}

const PROVENANCE_TONE: Record<Provenance, string> = {
	corpus: 'bg-primary',
	convention: 'bg-muted-foreground',
	'hand-written': 'bg-amber-500',
	community: 'bg-sky-500',
}

/** The shape that fits the athlete's intent, until the athlete says otherwise. */
const PRESET_FOR_INTENT: Record<Intent, string> = {
	'first-season': 'gentle-ramp',
	'returning-from-injury': 'back-from-injury',
	'deliberately-building': DEFAULT_PRESET_KEY,
}

function shiftWeeks(iso: string, weeks: number): string {
	const at = Date.parse(`${iso}T00:00:00Z`)
	return new Date(at + weeks * MS_PER_WEEK).toISOString().slice(0, 10)
}

function formatDay(iso: string): string {
	return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
		day: 'numeric',
		month: 'short',
		timeZone: 'UTC',
	})
}

function formatWeekday(iso: string): string {
	return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		timeZone: 'UTC',
	})
}

function round(n: number): number {
	return Math.round(n * 10) / 10
}

/* -------------------------------------------------------------------------- */
/* Sparkline                                                                   */
/* -------------------------------------------------------------------------- */

function Sparkline({
	load,
	className,
}: {
	load: number[]
	className?: string
}) {
	const points = load
		.map((value, i) => {
			const x = (i / Math.max(1, load.length - 1)) * 100
			const y = 20 - value * 18
			return `${round(x)},${round(y)}`
		})
		.join(' ')
	return (
		<svg
			viewBox="0 0 100 20"
			preserveAspectRatio="none"
			aria-hidden="true"
			className={cn('h-4 w-16', className)}
		>
			<polyline
				points={points}
				fill="none"
				stroke="currentColor"
				strokeWidth={1.5}
				vectorEffect="non-scaling-stroke"
			/>
		</svg>
	)
}

/* -------------------------------------------------------------------------- */
/* Chips                                                                       */
/* -------------------------------------------------------------------------- */

const chipClass =
	'relative inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium whitespace-nowrap after:absolute after:inset-x-0 after:-inset-y-2 hover:bg-muted aria-expanded:bg-muted focus-visible:ring-ring/30 focus-visible:ring-3 outline-none'

/* -------------------------------------------------------------------------- */
/* Screen                                                                      */
/* -------------------------------------------------------------------------- */

export default function VariantA({
	athlete,
	event,
	seasonStartMonday,
	seasonWeeks,
}: VariantProps) {
	const [intent, setIntent] = useState<Intent>('deliberately-building')
	const [presetOverride, setPresetOverride] = useState<string | null>(null)
	const [startOffset, setStartOffset] = useState(0)
	const [anchors, setAnchors] = useState<Partial<Record<Discipline, number>>>(
		() =>
			Object.fromEntries(
				athlete.tracks.map((track) => [track.discipline, track.proposedAnchor]),
			),
	)
	const [openWeek, setOpenWeek] = useState<number | null>(null)
	const [added, setAdded] = useState(false)

	const presetKey = presetOverride ?? PRESET_FOR_INTENT[intent]
	const preset: Preset =
		PRESETS.find((p) => p.key === presetKey) ??
		PRESETS.find((p) => p.key === DEFAULT_PRESET_KEY)!

	// Biggest track first, so the Plan Preview's headline volume is the one that
	// dominates the athlete's week — not a triathlete's 4 km of swimming.
	const orderedTracks = useMemo(
		() => orderTracks(athlete.tracks),
		[athlete.tracks],
	)
	const leadTrack = orderedTracks[0]!

	const startMonday = shiftWeeks(seasonStartMonday, startOffset)

	const season: Week[] = useMemo(
		() =>
			buildSeason({
				tracks: tracksFor({ ...athlete, tracks: orderedTracks }, anchors),
				presetKey,
				trainableDays: athlete.trainableDays,
				startMonday,
				weeks: seasonWeeks,
				raceDiscipline: event.discipline,
			}),
		[
			athlete,
			orderedTracks,
			anchors,
			presetKey,
			startMonday,
			seasonWeeks,
			event.discipline,
		],
	)

	const sessionCount = season.reduce(
		(sum, week) => sum + week.sessions.length,
		0,
	)
	const totalVolume = round(
		season.reduce((sum, week) => sum + week.targetVolume, 0),
	)
	const peakVolume = Math.max(1, ...season.map((week) => week.targetVolume))
	const raceWeek = shiftWeeks(startMonday, Math.max(0, season.length - 1))
	/** The level band each anchor lands in — the adaptation, as numbers. */
	const levels = orderedTracks.map((track) => ({
		track,
		level: describeLevel(
			anchors[track.discipline] ?? track.proposedAnchor,
			track.currency,
			track.discipline,
		),
	}))
	const firstLoading = season.find((week) => week.role === 'loading')

	return (
		<div className="container max-w-2xl py-6 pb-40 md:py-8">
			{/* Target Event — a settled fact, not a question. */}
			<header className="border-border flex items-baseline justify-between gap-3 border-b pb-4">
				<div className="min-w-0">
					<h1 className="truncate text-2xl font-semibold md:text-3xl">
						{event.name}
					</h1>
					<p className="text-muted-foreground mt-1 text-sm tabular-nums">
						{formatWeekday(event.date)} · {event.priority} ·{' '}
						{DISCIPLINE_LABELS[event.discipline]}
					</p>
				</div>
				<span className="text-muted-foreground shrink-0 text-sm tabular-nums">
					{season.length} wks
				</span>
			</header>

			{/* Question 1 — intent. */}
			<section className="mt-6">
				<h2 className="text-sm font-medium">Where you are</h2>
				<div
					role="radiogroup"
					aria-label="Where you are"
					className="border-border bg-input/40 mt-1.5 grid grid-cols-3 gap-1 rounded-2xl border p-1"
				>
					{INTENTS.map((option) => {
						const selected = option.key === intent
						return (
							<button
								key={option.key}
								type="button"
								role="radio"
								aria-checked={selected}
								onClick={() => setIntent(option.key)}
								className={cn(
									'focus-visible:ring-ring/30 min-h-11 rounded-xl px-2 py-2 text-center text-xs leading-tight outline-none focus-visible:ring-3 md:text-sm',
									selected
										? 'bg-primary text-primary-foreground font-medium'
										: 'text-muted-foreground hover:bg-muted',
								)}
							>
								{option.label}
							</button>
						)
					})}
				</div>
			</section>

			{/* Question 2 — one Season Anchor per Training Track. */}
			<section className="mt-6">
				<h2 className="text-sm font-medium">
					Per week
					<span className="text-muted-foreground ml-1.5 font-normal">
						{athlete.tracks.length === 1
							? '· 1 track'
							: `· ${athlete.tracks.length} tracks`}
					</span>
				</h2>
				<div className="border-border mt-1.5 divide-y divide-dashed rounded-2xl border">
					{levels.map(({ track, level }) => {
						const value = anchors[track.discipline] ?? track.proposedAnchor
						const proposed = track.proposedAnchor
						return (
							<div
								key={track.discipline}
								className="flex items-center justify-between gap-3 px-3 py-2"
							>
								<div className="min-w-0">
									<label
										htmlFor={`anchor-${track.discipline}`}
										className="block text-sm font-medium"
									>
										{DISCIPLINE_LABELS[track.discipline]}
									</label>
									<span className="text-muted-foreground block text-xs tabular-nums">
										≈ {proposed} · {track.derivation.windowWeeks}-wk median
									</span>
									{/* The level adaptation, as numbers: band, sessions, long cap. */}
									<span className="text-muted-foreground block text-xs tabular-nums">
										{level.summary}
									</span>
								</div>
								<div className="flex items-baseline gap-1.5">
									<input
										id={`anchor-${track.discipline}`}
										type="number"
										inputMode="decimal"
										min={0}
										step={track.currency === 'hours' ? 0.5 : 1}
										value={value}
										onChange={(e) =>
											setAnchors((prev) => ({
												...prev,
												[track.discipline]: Number(e.target.value),
											}))
										}
										className="focus-visible:border-ring focus-visible:ring-ring/30 bg-input/50 w-24 appearance-none rounded-xl border border-transparent px-2 py-1 text-right text-3xl font-semibold tabular-nums outline-none focus-visible:ring-3 [&::-webkit-inner-spin-button]:appearance-none"
									/>
									<span className="text-muted-foreground w-14 text-xs">
										{CURRENCY_UNIT[track.currency]}
									</span>
								</div>
							</div>
						)
					})}
				</div>
			</section>

			{/* Everything else the generator decided — shown, tappable, never a step. */}
			<div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
				<Popover>
					<PopoverTrigger className={chipClass}>
						<Sparkline
							load={preset.weeklyLoad}
							className="text-primary h-3 w-10"
						/>
						{preset.name}
						<Icon
							name="chevron-down"
							className="text-muted-foreground size-3"
						/>
					</PopoverTrigger>
					<PopoverContent align="start" className="w-80 gap-2">
						<PopoverTitle className="text-sm">Shape</PopoverTitle>
						<ul className="-mx-1 max-h-72 overflow-y-auto">
							{PRESETS.map((option) => (
								<li key={option.key}>
									<button
										type="button"
										onClick={() => setPresetOverride(option.key)}
										aria-current={option.key === presetKey}
										className={cn(
											'hover:bg-muted flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm',
											option.key === presetKey && 'bg-muted font-medium',
										)}
									>
										<Sparkline
											load={option.weeklyLoad}
											className="text-primary w-14 shrink-0"
										/>
										<span className="flex-1 truncate">{option.name}</span>
										<span className="text-muted-foreground shrink-0 text-xs tabular-nums">
											{option.phases.length} ph
										</span>
									</button>
								</li>
							))}
						</ul>
					</PopoverContent>
				</Popover>

				<Popover>
					<PopoverTrigger className={chipClass}>
						<Icon name="calendar" className="text-muted-foreground size-3" />
						<span className="tabular-nums">{formatDay(startMonday)}</span>
						<Icon
							name="chevron-down"
							className="text-muted-foreground size-3"
						/>
					</PopoverTrigger>
					<PopoverContent align="start" className="w-56 gap-2">
						<PopoverTitle className="text-sm">Start</PopoverTitle>
						<div className="-mx-1">
							{[0, 1, 2, 3].map((offset) => (
								<button
									key={offset}
									type="button"
									onClick={() => setStartOffset(offset)}
									aria-current={offset === startOffset}
									className={cn(
										'hover:bg-muted flex w-full items-center justify-between rounded-xl px-2 py-2 text-left text-sm tabular-nums',
										offset === startOffset && 'bg-muted font-medium',
									)}
								>
									{formatWeekday(shiftWeeks(seasonStartMonday, offset))}
									<span className="text-muted-foreground text-xs">
										+{offset}
									</span>
								</button>
							))}
						</div>
					</PopoverContent>
				</Popover>

				<Popover>
					<PopoverTrigger className={chipClass}>
						<span className="tabular-nums">
							{preset.phases.map((phase) => phase.weeks).join('·')}
						</span>
						<span className="text-muted-foreground">
							{preset.phases.length} phases
						</span>
						<Icon
							name="chevron-down"
							className="text-muted-foreground size-3"
						/>
					</PopoverTrigger>
					<PopoverContent align="start" className="w-56 gap-2">
						<PopoverTitle className="text-sm">Phases</PopoverTitle>
						<dl className="text-sm">
							{preset.phases.map((phase) => (
								<div
									key={phase.name}
									className="flex items-baseline justify-between py-1"
								>
									<dt className="truncate">{phase.name}</dt>
									<dd className="text-muted-foreground tabular-nums">
										{phase.weeks} wk
									</dd>
								</div>
							))}
						</dl>
					</PopoverContent>
				</Popover>

				<span className={cn(chipClass, 'pointer-events-none after:hidden')}>
					<Icon name="clock" className="text-muted-foreground size-3" />
					<span className="tabular-nums">{formatDay(raceWeek)}</span>
					<span className="text-muted-foreground">race week</span>
				</span>
			</div>

			{/* Plan Preview — dense, live. */}
			<section className="mt-8">
				<div className="border-border flex items-baseline justify-between gap-3 border-b pb-2">
					<h2 className="text-lg font-semibold">Plan Preview</h2>
					<p className="text-muted-foreground text-sm tabular-nums">
						≈ {totalVolume} {CURRENCY_SHORT[leadTrack.currency]} ·{' '}
						{sessionCount} sessions
					</p>
				</div>

				{/* The first loading week, as numbers — the proof the level adapted. */}
				{firstLoading ? (
					<dl className="text-muted-foreground mt-2 grid grid-cols-3 gap-2 text-xs tabular-nums">
						<div>
							<dt>Sessions/wk</dt>
							<dd className="text-foreground text-base font-semibold">
								{firstLoading.sessions.length}
							</dd>
						</div>
						<div>
							<dt>Long</dt>
							<dd className="text-foreground text-base font-semibold">
								{firstLoading.tracks[0]!.longRun == null
									? '—'
									: `${firstLoading.tracks[0]!.longRun} ${CURRENCY_SHORT[firstLoading.tracks[0]!.currency]}`}
								<span className="text-muted-foreground ml-1 text-xs font-normal">
									{Math.round(firstLoading.tracks[0]!.longRunShare * 100)} %
								</span>
							</dd>
						</div>
						<div>
							<dt>Easy</dt>
							<dd className="text-foreground text-base font-semibold">
								{Math.round(firstLoading.tracks[0]!.easyShare * 100)} %
							</dd>
						</div>
					</dl>
				) : null}

				<ol className="divide-border divide-y">
					{season.map((week) => {
						const expanded = openWeek === week.index
						const monday = week.weekKey
						const fill = Math.round((week.targetVolume / peakVolume) * 100)
						return (
							<li key={week.index} className="relative">
								<button
									type="button"
									onClick={() => setOpenWeek(expanded ? null : week.index)}
									aria-expanded={expanded}
									className="hover:bg-muted/50 relative grid w-full grid-cols-[1.75rem_1fr_auto_1.5rem] items-center gap-2 px-1 py-2 text-left md:grid-cols-[1.75rem_4rem_1fr_auto_1.5rem]"
								>
									<span
										aria-hidden="true"
										className="bg-primary/8 absolute inset-y-0 left-0"
										style={{ width: `${fill}%` }}
									/>
									<span className="text-muted-foreground relative text-xs tabular-nums">
										{week.index}
									</span>
									<span className="text-muted-foreground relative hidden text-xs tabular-nums md:block">
										{formatDay(monday)}
									</span>
									<span className="relative min-w-0 truncate text-sm">
										<span
											className={cn(
												week.role === 'race' && 'text-primary font-medium',
											)}
										>
											{week.phase}
										</span>{' '}
										<span className={cn('text-xs', ROLE_TONE[week.role])}>
											{ROLE_LABELS[week.role]}
										</span>
									</span>
									<span className="relative text-sm font-medium tabular-nums">
										{week.targetVolume}
										<span className="text-muted-foreground ml-1 text-xs">
											{week.currency}
										</span>
									</span>
									<span className="text-muted-foreground relative flex items-center justify-end gap-0.5 text-xs tabular-nums">
										{week.sessions.length}
										<Icon
											name={expanded ? 'chevron-up' : 'chevron-down'}
											className="size-3"
										/>
									</span>
								</button>

								{expanded ? (
									<ul className="border-border/60 mb-2 ml-[1.75rem] border-l pl-2">
										{week.sessions.map((session, i) => (
											<li
												key={`${session.day}-${i}`}
												className="grid grid-cols-[2.25rem_1fr_auto] items-baseline gap-2 py-1 text-xs md:grid-cols-[2.25rem_1fr_5rem_auto]"
											>
												<span className="text-muted-foreground tabular-nums">
													{session.day}
												</span>
												<span className="flex min-w-0 items-center gap-1.5">
													<span
														aria-hidden="true"
														className={cn(
															'size-1.5 shrink-0 rounded-full',
															PROVENANCE_TONE[session.provenance],
														)}
													/>
													<span className="truncate">{session.title}</span>
												</span>
												<span className="text-muted-foreground hidden tabular-nums md:block">
													{session.intensity}
												</span>
												<span className="text-right tabular-nums">
													{session.volume}
												</span>
											</li>
										))}
									</ul>
								) : null}
							</li>
						)
					})}
				</ol>
				<p className="text-muted-foreground mt-2 text-xs tabular-nums">
					{formatDay(startMonday)} – {formatDay(raceWeek)}
				</p>
			</section>

			{/* One action. */}
			{/* pb-20 keeps the action clear of the prototype switcher pill. */}
			<div className="bg-background/95 border-border fixed inset-x-0 bottom-0 border-t p-4 pb-20 backdrop-blur md:static md:mt-8 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
				<div className="container max-w-2xl md:px-0">
					{added ? (
						<p
							role="status"
							className="text-primary flex items-center justify-center gap-2 text-sm font-medium tabular-nums md:justify-start"
						>
							<Icon name="check" className="size-4" />
							{sessionCount} sessions on the Tape · {formatDay(startMonday)} –{' '}
							{formatDay(raceWeek)}
						</p>
					) : (
						<Button className="w-full md:w-auto" onClick={() => setAdded(true)}>
							Add {sessionCount} sessions
						</Button>
					)}
				</div>
			</div>
		</div>
	)
}
