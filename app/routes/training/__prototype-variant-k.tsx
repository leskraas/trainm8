/**
 * PROTOTYPE — variant K, "Control panel, second cut" (variant C rebuilt).
 *
 * Thesis unchanged from C: a dense numbers-first instrument. Sliders per
 * Training Track, a live Plan Preview, no rebuild button, no explanatory prose —
 * anything needing a sentence hides behind a `?`.
 *
 * What K changes:
 *  1. No mobile disclosure at all. Every control, and the primary action, are on
 *     screen at 390 — the default path is one tap.
 *  2. No figure reads as an all-tracks volume. Peak and season volumes are
 *     printed per Training Track, prefixed with the discipline; the week table
 *     carries one volume column per track. Volume Currencies are never summed.
 *  3. `orderTracks()` governs one order: stat strip, sliders, track rows, table
 *     columns.
 *  4. Range inputs are 44px tall with a 24px thumb.
 *  5. The race-week axis mark is a text `R`, not an emoji.
 *  6. Season Anchors are snapped to the slider's step at load, so the number on
 *     screen is always the number the season was built from.
 *
 * THROWAWAY — do not ship.
 */
import { Fragment, useMemo, useState } from 'react'

import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '#app/components/ui/popover.tsx'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '#app/components/ui/select.tsx'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '#app/components/ui/table.tsx'
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
	type PrototypeTrack,
	type VariantProps,
	type Week,
	type WeekRole,
} from './__prototype-data.ts'

/* -------------------------------------------------------------------------- */
/* Tiny formatting helpers                                                    */
/* -------------------------------------------------------------------------- */

const CURRENCY_UNIT: Record<Currency, string> = {
	km: 'km',
	hours: 'h',
	tss: 'TSS',
}

/** Sport register (ui-conventions §4.1) — these controls configure training. */
const DISCIPLINE: Record<Discipline, string> = {
	run: 'Run',
	bike: 'Bike',
	swim: 'Swim',
}

const ROLE_LABEL: Record<WeekRole, string> = {
	loading: 'Load',
	recovery: 'Recover',
	taper: 'Taper',
	race: 'Race',
}

const ROLE_BAR: Record<WeekRole, string> = {
	loading: 'bg-primary',
	recovery: 'bg-primary/35',
	taper: 'bg-primary/20',
	race: 'bg-foreground',
}

const ROLE_BADGE: Record<WeekRole, string> = {
	loading: 'bg-primary/15 text-primary',
	recovery: 'bg-muted text-muted-foreground',
	taper: 'bg-muted text-muted-foreground',
	race: 'bg-foreground text-background',
}

function num(value: number): string {
	return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function shortDate(iso: string): string {
	return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
		day: 'numeric',
		month: 'short',
		timeZone: 'UTC',
	})
}

/**
 * The slider's grain. Whole km for a track measured in tens of km; half km for a
 * small one (a triathlete's 4 km swim week has six whole-km steps in its whole
 * range, which is too coarse to steer with).
 */
function stepFor(currency: Currency, proposedAnchor = 0): number {
	if (currency === 'hours') return 0.5
	if (currency === 'tss') return 10
	return proposedAnchor < 20 ? 0.5 : 1
}

/**
 * The slider's grain, applied to the proposed anchor *before* the season is
 * built. C let `182.8` display as `183` the moment the slider was touched, which
 * silently changed the number underneath; K snaps once, up front, so the figure
 * on screen and the figure the builder used are the same number all the way
 * through.
 */
function snapAnchor(track: PrototypeTrack): number {
	const step = stepFor(track.currency, track.proposedAnchor)
	return Math.max(step, Math.round(track.proposedAnchor / step) * step)
}

/* -------------------------------------------------------------------------- */
/* Chrome                                                                     */
/* -------------------------------------------------------------------------- */

function Hint({ children, label }: { children: string; label: string }) {
	return (
		<Popover>
			<PopoverTrigger
				render={
					<button
						type="button"
						aria-label={label}
						className="text-muted-foreground hover:text-foreground relative after:absolute after:-inset-2"
					>
						<Icon name="question-mark-circled" className="size-3.5" />
					</button>
				}
			/>
			<PopoverContent className="w-64 gap-0 text-xs">{children}</PopoverContent>
		</Popover>
	)
}

function ControlLabel({
	children,
	hint,
	hintLabel,
}: {
	children: React.ReactNode
	hint?: string
	hintLabel?: string
}) {
	return (
		<div className="text-muted-foreground flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.12em] uppercase">
			<span>{children}</span>
			{hint ? <Hint label={hintLabel ?? 'More'}>{hint}</Hint> : null}
		</div>
	)
}

/**
 * One big figure. `scope` is the Training Track a volume belongs to and is
 * printed inside the label, so no volume on this screen can be misread as an
 * all-tracks total.
 */
function Stat({
	label,
	scope,
	value,
	unit,
}: {
	label: string
	scope?: string
	value: string
	unit?: string
}) {
	return (
		<div className="min-w-0">
			<div className="text-muted-foreground truncate text-[10px] font-semibold tracking-[0.12em] uppercase">
				{scope ? <span className="text-foreground/70">{scope} </span> : null}
				{label}
			</div>
			<div className="flex items-baseline gap-1">
				<span className="text-2xl leading-tight font-semibold tabular-nums md:text-3xl">
					{value}
				</span>
				{unit ? (
					<span className="text-muted-foreground text-xs">{unit}</span>
				) : null}
			</div>
		</div>
	)
}

/** A preset's normalized weekly load as a 56×18 polyline. */
function Sparkline({ load }: { load: number[] }) {
	const points = load
		.map((value, i) => {
			const x = (i / Math.max(1, load.length - 1)) * 56
			const y = 17 - value * 15
			return `${x.toFixed(1)},${y.toFixed(1)}`
		})
		.join(' ')
	return (
		<svg
			viewBox="0 0 56 18"
			className="h-[18px] w-14 shrink-0 overflow-visible"
			aria-hidden="true"
		>
			<polyline
				points={points}
				fill="none"
				stroke="currentColor"
				strokeWidth="1.25"
				strokeLinejoin="round"
			/>
		</svg>
	)
}

/* -------------------------------------------------------------------------- */
/* Controls                                                                   */
/* -------------------------------------------------------------------------- */

/** 44px tall rail, 24px thumb — a real touch target (ui-conventions §2.1). */
const RANGE_CLASS = cn(
	'h-11 w-full cursor-pointer touch-manipulation appearance-none bg-transparent',
	'[&::-webkit-slider-runnable-track]:bg-muted [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full',
	'[&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:ring-background [&::-webkit-slider-thumb]:mt-[-9px] [&::-webkit-slider-thumb]:size-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:ring-2',
	'[&::-moz-range-track]:bg-muted [&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full',
	'[&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:size-6 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0',
)

function AnchorSlider({
	track,
	value,
	onChange,
}: {
	track: PrototypeTrack
	value: number
	onChange: (next: number) => void
}) {
	const unit = CURRENCY_UNIT[track.currency]
	const step = stepFor(track.currency, track.proposedAnchor)
	const proposed = snapAnchor(track)
	const min = Math.max(step, Math.round((proposed * 0.4) / step) * step)
	const max = Math.round((proposed * 1.8) / step) * step
	const id = `k-anchor-${track.discipline}`

	return (
		<div>
			<div className="flex items-baseline justify-between gap-2">
				<label
					htmlFor={id}
					className="text-muted-foreground flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.12em] uppercase"
				>
					<span className="text-foreground">
						{DISCIPLINE[track.discipline]}
					</span>
					<Hint label={`Where ${DISCIPLINE[track.discipline]} starts`}>
						{`${track.anchorSource}. Rounded to the nearest ${num(step)} ${unit}, and editable; the Plan Preview follows it.`}
					</Hint>
				</label>
				<span className="text-lg leading-none font-semibold tabular-nums">
					{num(value)}
					<span className="text-muted-foreground ml-1 text-[11px] font-normal">
						{unit}/wk
					</span>
				</span>
			</div>
			<input
				id={id}
				type="range"
				min={min}
				max={max}
				step={step}
				value={value}
				onChange={(event) => onChange(Number(event.target.value))}
				className={RANGE_CLASS}
			/>
			<div className="text-muted-foreground -mt-1 flex justify-between text-[10px] tabular-nums">
				<span>{num(min)}</span>
				<button
					type="button"
					onClick={() => onChange(proposed)}
					className={cn(
						'hover:text-foreground relative after:absolute after:-inset-2',
						value === proposed && 'text-foreground font-medium',
					)}
				>
					≈{num(proposed)}
				</button>
				<span>{num(max)}</span>
			</div>
		</div>
	)
}

function IntentSegments({
	value,
	onChange,
}: {
	value: Intent
	onChange: (next: Intent) => void
}) {
	return (
		<div
			role="radiogroup"
			aria-label="You"
			className="bg-muted/60 grid grid-cols-3 gap-0.5 rounded-2xl p-0.5"
		>
			{INTENTS.map((intent) => {
				const selected = intent.key === value
				return (
					<button
						key={intent.key}
						type="button"
						role="radio"
						aria-checked={selected}
						onClick={() => onChange(intent.key)}
						className={cn(
							'h-10 rounded-xl px-1 text-[11px] leading-tight font-medium transition-colors',
							selected
								? 'bg-background text-foreground shadow-sm'
								: 'text-muted-foreground hover:text-foreground',
						)}
					>
						{intent.label}
					</button>
				)
			})}
		</div>
	)
}

/**
 * Periodization Presets as load-profile sparklines. A snap-scrolling row at 390
 * (so no disclosure is needed to reach them) and C's vertical list from `md` up.
 */
function PresetList({
	value,
	onChange,
}: {
	value: string
	onChange: (next: string) => void
}) {
	return (
		<div className="ring-border md:divide-border/60 -mx-1 flex snap-x snap-mandatory gap-1 overflow-x-auto px-1 py-1 md:mx-0 md:max-h-64 md:snap-none md:flex-col md:gap-0 md:divide-y md:overflow-x-visible md:overflow-y-auto md:rounded-2xl md:p-0 md:ring-1">
			{PRESETS.map((preset) => {
				const selected = preset.key === value
				return (
					<button
						key={preset.key}
						type="button"
						aria-pressed={selected}
						onClick={() => onChange(preset.key)}
						className={cn(
							'ring-border flex h-11 w-36 shrink-0 snap-start items-center gap-2 rounded-xl px-2 text-left ring-1 transition-colors md:h-auto md:w-full md:gap-2 md:rounded-none md:px-2.5 md:py-2 md:ring-0',
							selected
								? 'bg-primary/10 text-primary ring-primary/40 md:ring-0'
								: 'text-muted-foreground hover:bg-muted/50',
						)}
					>
						<Sparkline load={preset.weeklyLoad} />
						<span className="min-w-0 flex-1">
							<span
								className={cn(
									'block truncate text-xs',
									selected && 'text-foreground font-medium',
								)}
							>
								{preset.name}
							</span>
							<span className="block text-[10px] tabular-nums md:hidden">
								{preset.weeks} wk
							</span>
						</span>
						<span className="hidden text-[10px] tabular-nums md:block">
							{preset.weeks} wk
						</span>
					</button>
				)
			})}
		</div>
	)
}

/* -------------------------------------------------------------------------- */
/* Plan Preview                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The season's shape. Bars are scaled to the **lead track's** peak and the
 * column header says whose km they are — the axis is one track's, deliberately,
 * because two Volume Currencies cannot share a y-axis.
 */
function LoadProfile({
	weeks,
	peak,
	expanded,
	onPick,
	scope,
	unit,
}: {
	weeks: Week[]
	peak: number
	expanded: number | null
	onPick: (index: number) => void
	scope: string
	unit: string
}) {
	return (
		<div>
			<div className="text-muted-foreground text-[10px] font-semibold tracking-[0.12em] uppercase">
				<span className="text-foreground/70">{scope} </span>
				{unit} per week
			</div>
			<div className="flex items-end gap-[3px]">
				{weeks.map((week) => {
					const height = peak === 0 ? 0 : (week.targetVolume / peak) * 100
					const active = expanded === week.index
					return (
						<button
							key={week.weekKey}
							type="button"
							onClick={() => onPick(week.index)}
							title={`Wk ${week.index} · ${week.phase} · ${scope} ${num(week.targetVolume)} ${unit}`}
							className="group flex h-20 flex-1 flex-col justify-end gap-1 md:h-24"
						>
							<span
								className={cn(
									'w-full rounded-t-sm transition-all group-hover:opacity-80',
									ROLE_BAR[week.role],
									active && 'ring-foreground ring-2',
								)}
								style={{ height: `${Math.max(4, height)}%` }}
							/>
							<span
								className={cn(
									'text-muted-foreground text-[9px] leading-none tabular-nums',
									week.role === 'race' && 'text-foreground font-semibold',
								)}
							>
								{week.role === 'race' ? 'R' : week.index}
							</span>
						</button>
					)
				})}
			</div>
		</div>
	)
}

function SessionLines({ week }: { week: Week }) {
	return (
		<ul className="text-muted-foreground space-y-0.5 py-1 text-xs">
			{week.sessions.map((session, i) => (
				<li
					key={`${session.discipline}-${session.day}-${session.title}-${i}`}
					className="flex flex-wrap items-baseline gap-x-2"
				>
					<span className="text-foreground w-8 shrink-0 font-medium">
						{session.day}
					</span>
					<span className="text-foreground/80 w-10 shrink-0">
						{DISCIPLINE[session.discipline]}
					</span>
					<span className="text-foreground w-28 shrink-0 truncate sm:w-32">
						{session.title}
					</span>
					<span className="w-16 shrink-0 tabular-nums">{session.volume}</span>
					<span className="hidden w-24 shrink-0 sm:block">
						{session.intensity}
					</span>
					<span className="text-muted-foreground/70 hidden text-[10px] sm:block">
						{session.provenance}
					</span>
				</li>
			))}
		</ul>
	)
}

/* -------------------------------------------------------------------------- */
/* Variant                                                                    */
/* -------------------------------------------------------------------------- */

export default function VariantK({
	athlete,
	event: goalEvent,
	events,
	seasonStartMonday,
	seasonWeeks,
}: VariantProps) {
	// One order governs everything below: strip, sliders, rows, table columns.
	const orderedTracks: PrototypeTrack[] = useMemo(
		() => orderTracks(athlete.tracks),
		[athlete.tracks],
	)

	const [eventId, setEventId] = useState(goalEvent.id)
	const [intent, setIntent] = useState<Intent>('deliberately-building')
	const [presetKey, setPresetKey] = useState(DEFAULT_PRESET_KEY)
	const [anchors, setAnchors] = useState<Partial<Record<Discipline, number>>>(
		() =>
			Object.fromEntries(
				athlete.tracks.map((track) => [track.discipline, snapAnchor(track)]),
			),
	)
	const [expanded, setExpanded] = useState<number | null>(null)
	const [created, setCreated] = useState(false)

	const event =
		events.find((candidate) => candidate.id === eventId) ?? goalEvent

	const weeks = useMemo(
		() =>
			buildSeason({
				tracks: tracksFor({ ...athlete, tracks: orderedTracks }, anchors),
				presetKey,
				trainableDays: athlete.trainableDays,
				startMonday: seasonStartMonday,
				weeks: event.weeksAway || seasonWeeks,
				raceDiscipline: event.discipline,
			}),
		[
			athlete,
			orderedTracks,
			anchors,
			presetKey,
			seasonStartMonday,
			seasonWeeks,
			event.weeksAway,
			event.discipline,
		],
	)

	/** Per-track peak and season totals — never summed across currencies. */
	const trackStats = useMemo(
		() =>
			orderedTracks.map((track, t) => {
				const slices = weeks.map(
					(week) =>
						week.tracks.find((c) => c.discipline === track.discipline) ??
						week.tracks[t]!,
				)
				return {
					track,
					peak: slices.reduce(
						(max, s) => Math.max(max, s?.targetVolume ?? 0),
						0,
					),
					total: slices.reduce((sum, s) => sum + (s?.targetVolume ?? 0), 0),
					level: describeLevel(
						anchors[track.discipline] ?? snapAnchor(track),
						track.currency,
						track.discipline,
					),
				}
			}),
		[orderedTracks, weeks, anchors],
	)

	const sessionCount = weeks.reduce(
		(sum, week) => sum + week.sessions.length,
		0,
	)
	const raceWeek = weeks[weeks.length - 1]
	const firstLoading = weeks.find((week) => week.role === 'loading') ?? weeks[0]
	const leadTrack = orderedTracks[0]
	const leadPeak = trackStats[0]?.peak ?? 0

	if (weeks.length === 0 || !raceWeek || !firstLoading || !leadTrack)
		return null

	const action = created ? (
		<p
			role="status"
			className="text-primary flex items-center justify-center gap-1.5 text-xs font-medium tabular-nums"
		>
			<Icon name="circle-check" className="size-4 shrink-0" />
			<span className="sm:hidden">Created · {sessionCount} ses</span>
			<span className="hidden sm:inline">
				Plan Outline created · {weeks.length} wk · {sessionCount} sessions
			</span>
		</p>
	) : (
		<Button type="button" onClick={() => setCreated(true)}>
			Create Plan Outline
		</Button>
	)

	return (
		<div className="container max-w-6xl py-4 md:py-8">
			{/* Target Event + the primary action, both on screen at load. */}
			<div className="bg-background sticky top-0 z-20 -mx-4 flex items-center gap-2 px-4 py-2 md:static md:mx-0 md:px-0 md:pt-0">
				<div className="min-w-0 flex-1">
					<Select
						value={eventId}
						onValueChange={(value) => setEventId(value as string)}
					>
						<SelectTrigger
							id="k-target-event"
							size="sm"
							className="text-foreground h-8 w-full max-w-full border-0 px-0 text-lg font-semibold shadow-none"
						>
							<SelectValue>
								{(value) => (
									<span className="truncate">
										{events.find((e) => e.id === value)?.name ?? ''}
									</span>
								)}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{events.map((option) => (
								<SelectItem key={option.id} value={option.id}>
									{option.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<div className="text-muted-foreground text-xs tabular-nums">
						{DISCIPLINE[event.discipline]} · {event.priority} ·{' '}
						{shortDate(event.date)} · {weeks.length} wk
					</div>
				</div>
				<div className="shrink-0 md:hidden">{action}</div>
			</div>

			{/* Stat strip — every volume figure carries its Training Track. */}
			<div className="grid grid-cols-3 gap-x-3 gap-y-3 pt-3 md:grid-cols-6 md:pt-4">
				<Stat label="Weeks" value={String(weeks.length)} />
				<Stat label="Sessions" value={String(sessionCount)} />
				<Stat label="Race week" value={shortDate(raceWeek.weekKey)} />
				{trackStats.map(({ track, peak, total }) => (
					<Fragment key={track.discipline}>
						<Stat
							scope={DISCIPLINE[track.discipline]}
							label="peak wk"
							value={num(peak)}
							unit={CURRENCY_UNIT[track.currency]}
						/>
						<Stat
							scope={DISCIPLINE[track.discipline]}
							label="season"
							value={num(Math.round(total))}
							unit={CURRENCY_UNIT[track.currency]}
						/>
					</Fragment>
				))}
			</div>

			<div className="mt-4 md:mt-6 md:grid md:grid-cols-[280px_1fr] md:items-start md:gap-8">
				{/* Controls — no disclosure, at any width. */}
				<div className="space-y-4 md:sticky md:top-6">
					<div className="space-y-2">
						<ControlLabel
							hint="One Season Anchor per Training Track, in that track's own Volume Currency. Never added together."
							hintLabel="About Season Anchors"
						>
							Season Anchor
						</ControlLabel>
						{orderedTracks.map((track) => (
							<AnchorSlider
								key={track.discipline}
								track={track}
								value={anchors[track.discipline] ?? snapAnchor(track)}
								onChange={(next) =>
									setAnchors((current) => ({
										...current,
										[track.discipline]: next,
									}))
								}
							/>
						))}
					</div>

					<div className="space-y-1.5">
						<ControlLabel
							hint="A shape: the phases and week roles your season runs through."
							hintLabel="About the shape"
						>
							Shape
						</ControlLabel>
						<PresetList value={presetKey} onChange={setPresetKey} />
					</div>

					<div className="space-y-1.5">
						<ControlLabel
							hint="Sets how cautiously the first weeks ramp."
							hintLabel="About you"
						>
							You
						</ControlLabel>
						<IntentSegments value={intent} onChange={setIntent} />
					</div>

					<div className="hidden md:grid">{action}</div>
				</div>

				{/* Plan Preview */}
				<div className="mt-5 space-y-4 md:mt-0">
					{/* One row per Training Track — the level adaptation, as numbers. */}
					<div className="ring-border divide-border/60 divide-y rounded-2xl ring-1">
						{trackStats.map(({ track, level }) => {
							const inWeek = firstLoading.tracks.find(
								(candidate) => candidate.discipline === track.discipline,
							)
							const unit = CURRENCY_UNIT[track.currency]
							return (
								<div key={track.discipline} className="px-2.5 py-2">
									<dl className="grid grid-cols-4 gap-2 text-xs tabular-nums sm:grid-cols-6">
										<div>
											<dt className="text-muted-foreground text-[10px] uppercase">
												Track
											</dt>
											<dd className="font-medium">
												{DISCIPLINE[track.discipline]}
											</dd>
										</div>
										<div>
											<dt className="text-muted-foreground text-[10px] uppercase">
												Ses/wk
											</dt>
											<dd>{inWeek?.sessions.length ?? 0}</dd>
										</div>
										<div>
											<dt className="text-muted-foreground text-[10px] uppercase">
												Long
											</dt>
											<dd>
												{inWeek?.longRun == null
													? '—'
													: `${num(inWeek.longRun)} ${unit}`}
											</dd>
										</div>
										<div>
											<dt className="text-muted-foreground text-[10px] uppercase">
												Long %
											</dt>
											<dd>
												{inWeek ? Math.round(inWeek.longRunShare * 100) : 0} %
											</dd>
										</div>
										<div>
											<dt className="text-muted-foreground text-[10px] uppercase">
												Easy %
											</dt>
											<dd>
												{inWeek ? Math.round(inWeek.easyShare * 100) : 100} %
											</dd>
										</div>
										<div>
											<dt className="text-muted-foreground text-[10px] uppercase">
												Quality
											</dt>
											<dd>{inWeek?.quality ?? 0}</dd>
										</div>
									</dl>
									<div className="text-muted-foreground pt-1 text-[11px] tabular-nums">
										{level.summary}
									</div>
								</div>
							)
						})}
					</div>

					<LoadProfile
						weeks={weeks}
						peak={leadPeak}
						expanded={expanded}
						onPick={(index) =>
							setExpanded((current) => (current === index ? null : index))
						}
						scope={DISCIPLINE[leadTrack.discipline]}
						unit={CURRENCY_UNIT[leadTrack.currency]}
					/>

					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-8 px-1 text-right">#</TableHead>
								<TableHead className="hidden w-16 sm:table-cell">Mon</TableHead>
								<TableHead className="hidden md:table-cell">Phase</TableHead>
								<TableHead className="w-20 px-1">Role</TableHead>
								{trackStats.map(({ track }) => (
									<TableHead
										key={track.discipline}
										className="px-1 text-right text-[11px]"
									>
										{DISCIPLINE[track.discipline]}{' '}
										{CURRENCY_UNIT[track.currency]}
									</TableHead>
								))}
								<TableHead className="hidden w-24 lg:table-cell">
									Shape
								</TableHead>
								<TableHead className="w-8 px-1 text-right">Ses</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{weeks.map((week) => {
								const open = expanded === week.index
								const width =
									leadPeak === 0 ? 0 : (week.targetVolume / leadPeak) * 100
								return (
									<Fragment key={week.weekKey}>
										<TableRow
											className="cursor-pointer"
											aria-expanded={open}
											onClick={() =>
												setExpanded((current) =>
													current === week.index ? null : week.index,
												)
											}
										>
											<TableCell className="text-muted-foreground px-1 text-right tabular-nums">
												{week.index}
											</TableCell>
											<TableCell className="hidden tabular-nums sm:table-cell">
												{shortDate(week.weekKey)}
											</TableCell>
											<TableCell className="hidden max-w-32 truncate md:table-cell">
												{week.phase}
											</TableCell>
											<TableCell className="px-1">
												<Badge
													className={cn(
														'rounded-md px-1.5 text-[10px]',
														ROLE_BADGE[week.role],
													)}
												>
													{ROLE_LABEL[week.role]}
												</Badge>
											</TableCell>
											{trackStats.map(({ track }, t) => {
												const slice =
													week.tracks.find(
														(candidate) =>
															candidate.discipline === track.discipline,
													) ?? week.tracks[t]
												return (
													<TableCell
														key={track.discipline}
														className="px-1 text-right font-medium tabular-nums"
													>
														{slice ? num(slice.targetVolume) : '—'}
													</TableCell>
												)
											})}
											<TableCell className="hidden lg:table-cell">
												<span className="bg-muted flex h-1.5 w-20 overflow-hidden rounded-full">
													<span
														className={cn('h-full', ROLE_BAR[week.role])}
														style={{ width: `${width}%` }}
													/>
												</span>
											</TableCell>
											<TableCell className="text-muted-foreground px-1 text-right tabular-nums">
												{week.sessions.length}
											</TableCell>
										</TableRow>
										{open ? (
											<TableRow>
												<TableCell
													colSpan={6 + trackStats.length}
													className="whitespace-normal"
												>
													<SessionLines week={week} />
												</TableCell>
											</TableRow>
										) : null}
									</Fragment>
								)
							})}
						</TableBody>
					</Table>
				</div>
			</div>
		</div>
	)
}
