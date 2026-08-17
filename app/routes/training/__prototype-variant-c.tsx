/**
 * PROTOTYPE — variant C, "Control panel".
 *
 * Thesis: numbers, not words. A dense two-pane instrument — knobs on the left,
 * a live Plan Preview on the right. Every knob recomputes the preview on the
 * spot; there is no rebuild button and no explanatory prose. Anything that
 * genuinely needs a sentence hides behind a `?` popover.
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

/** Volume Currency, written the way a knob is labelled. */
const CURRENCY_UNIT: Record<Currency, string> = {
	km: 'km',
	hours: 'h',
	tss: 'TSS',
}

/** Sport register (ui-conventions §4.1) — these knobs configure training. */
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

function stepFor(currency: Currency): number {
	return currency === 'hours' ? 0.5 : currency === 'tss' ? 10 : 1
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

function Stat({
	label,
	value,
	unit,
}: {
	label: string
	value: string
	unit?: string
}) {
	return (
		<div className="min-w-0">
			<div className="text-muted-foreground text-[10px] font-semibold tracking-[0.12em] uppercase">
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
	const step = stepFor(track.currency)
	const min = Math.max(
		step,
		Math.round((track.proposedAnchor * 0.4) / step) * step,
	)
	const max = Math.round((track.proposedAnchor * 1.8) / step) * step
	const id = `anchor-${track.discipline}`

	return (
		<div className="space-y-1.5">
			<div className="flex items-center justify-between gap-2">
				<label
					htmlFor={id}
					className="text-muted-foreground flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.12em] uppercase"
				>
					<span>{DISCIPLINE[track.discipline]}</span>
					<Hint label={`Where ${DISCIPLINE[track.discipline]} starts`}>
						{`${track.anchorSource}. Editable; the Plan Preview follows it.`}
					</Hint>
				</label>
				<span className="text-base leading-none font-semibold tabular-nums">
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
				className="accent-primary bg-muted [&::-webkit-slider-thumb]:bg-primary h-1.5 w-full cursor-pointer appearance-none rounded-full [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full"
			/>
			<div className="text-muted-foreground flex justify-between text-[10px] tabular-nums">
				<span>{num(min)}</span>
				<span
					className={cn(
						value === track.proposedAnchor && 'text-foreground font-medium',
					)}
				>
					≈{num(track.proposedAnchor)}
				</span>
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
							'h-9 rounded-xl px-1 text-[11px] leading-tight font-medium transition-colors',
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

function PresetList({
	value,
	onChange,
}: {
	value: string
	onChange: (next: string) => void
}) {
	return (
		<div className="ring-border divide-border/60 max-h-64 divide-y overflow-y-auto rounded-2xl ring-1">
			{PRESETS.map((preset) => {
				const selected = preset.key === value
				return (
					<button
						key={preset.key}
						type="button"
						aria-pressed={selected}
						onClick={() => onChange(preset.key)}
						className={cn(
							'flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors',
							selected
								? 'bg-primary/10 text-primary'
								: 'text-muted-foreground hover:bg-muted/50',
						)}
					>
						<Sparkline load={preset.weeklyLoad} />
						<span
							className={cn(
								'flex-1 truncate text-xs',
								selected && 'text-foreground font-medium',
							)}
						>
							{preset.name}
						</span>
						<span className="text-[10px] tabular-nums">{preset.weeks} wk</span>
					</button>
				)
			})}
		</div>
	)
}

/* -------------------------------------------------------------------------- */
/* Plan Preview                                                               */
/* -------------------------------------------------------------------------- */

function LoadProfile({
	weeks,
	peak,
	unit,
	expanded,
	onPick,
}: {
	weeks: Week[]
	peak: number
	unit: string
	expanded: number | null
	onPick: (index: number) => void
}) {
	return (
		<div className="flex items-end gap-[3px]">
			{weeks.map((week) => {
				const height = peak === 0 ? 0 : (week.targetVolume / peak) * 100
				const active = expanded === week.index
				return (
					<button
						key={week.weekKey}
						type="button"
						onClick={() => onPick(week.index)}
						title={`Wk ${week.index} · ${week.phase} · ${num(week.targetVolume)} ${unit}`}
						className="group flex h-24 flex-1 flex-col justify-end gap-1"
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
								'text-muted-foreground text-[9px] tabular-nums',
								week.role === 'race' && 'text-foreground font-semibold',
							)}
						>
							{week.role === 'race' ? '🏁' : week.index}
						</span>
					</button>
				)
			})}
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
					<span className="text-foreground/80 w-12 shrink-0">
						{DISCIPLINE[session.discipline]}
					</span>
					<span className="text-foreground w-32 shrink-0 truncate">
						{session.title}
					</span>
					<span className="w-20 shrink-0 tabular-nums">{session.volume}</span>
					<span className="w-24 shrink-0">{session.intensity}</span>
					<span className="text-muted-foreground/70 text-[10px]">
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

export default function VariantC({
	athlete,
	event: goalEvent,
	events,
	seasonStartMonday,
	seasonWeeks,
}: VariantProps) {
	const [eventId, setEventId] = useState(goalEvent.id)
	const [intent, setIntent] = useState<Intent>('deliberately-building')
	const [presetKey, setPresetKey] = useState(DEFAULT_PRESET_KEY)
	const [anchors, setAnchors] = useState<Partial<Record<Discipline, number>>>(
		() =>
			Object.fromEntries(
				athlete.tracks.map((track) => [track.discipline, track.proposedAnchor]),
			),
	)
	const [expanded, setExpanded] = useState<number | null>(null)
	const [controlsOpen, setControlsOpen] = useState(false)
	const [created, setCreated] = useState(false)

	const event =
		events.find((candidate) => candidate.id === eventId) ?? goalEvent

	// The biggest track leads, so `week.targetVolume` is the one that dominates.
	const orderedTracks: PrototypeTrack[] = useMemo(
		() => orderTracks(athlete.tracks),
		[athlete.tracks],
	)

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

	const primaryTrack = orderedTracks[0]!
	const unit = CURRENCY_UNIT[primaryTrack.currency]

	const peak = weeks.reduce((max, week) => Math.max(max, week.targetVolume), 0)
	const total = weeks.reduce((sum, week) => sum + week.targetVolume, 0)
	const sessionCount = weeks.reduce(
		(sum, week) => sum + week.sessions.length,
		0,
	)
	const raceWeek = weeks[weeks.length - 1]
	const firstLoading = weeks.find((week) => week.role === 'loading') ?? weeks[0]
	/** Per-track level bands — one row per Training Track, never three for one. */
	const levels = orderedTracks.map((track) => ({
		track,
		level: describeLevel(
			anchors[track.discipline] ?? track.proposedAnchor,
			track.currency,
			track.discipline,
		),
	}))

	if (weeks.length === 0 || !raceWeek || !firstLoading) return null

	return (
		<div className="container max-w-6xl py-6 md:py-8">
			<div className="md:grid md:grid-cols-[280px_1fr] md:gap-8">
				{/* Controls */}
				<div className="md:sticky md:top-6 md:self-start">
					<div className="bg-background sticky top-0 z-20 flex items-center justify-between gap-2 py-2 md:static md:py-0">
						<div className="min-w-0">
							<div className="truncate text-lg font-semibold">{event.name}</div>
							<div className="text-muted-foreground text-xs tabular-nums">
								{DISCIPLINE[event.discipline]} · {event.priority} ·{' '}
								{shortDate(event.date)}
							</div>
						</div>
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="md:hidden"
							onClick={() => setControlsOpen((open) => !open)}
						>
							<Icon
								name={controlsOpen ? 'chevron-up' : 'chevron-down'}
								className="size-4"
							/>
							Knobs
						</Button>
					</div>

					<div
						className={cn(
							'space-y-4 pt-2 md:block md:pt-4',
							controlsOpen ? 'block' : 'hidden',
						)}
					>
						<div className="space-y-1.5">
							<ControlLabel>Target Event</ControlLabel>
							<Select
								value={eventId}
								onValueChange={(value) => setEventId(value as string)}
							>
								<SelectTrigger id="target-event" size="sm" className="w-full">
									<SelectValue>
										{(value) => events.find((e) => e.id === value)?.name ?? ''}
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

						<div className="space-y-3">
							<ControlLabel
								hint="One Season Anchor per Training Track, in that track's Volume Currency."
								hintLabel="About Season Anchors"
							>
								Season Anchor
							</ControlLabel>
							{athlete.tracks.map((track) => (
								<AnchorSlider
									key={track.discipline}
									track={track}
									value={anchors[track.discipline] ?? track.proposedAnchor}
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

						{created ? (
							<p
								role="status"
								className="text-primary flex items-center justify-center gap-1.5 py-2 text-xs font-medium tabular-nums"
							>
								<Icon name="check" className="size-4" />
								Plan Outline created · {sessionCount} sessions
							</p>
						) : (
							<Button
								type="button"
								className="w-full"
								onClick={() => setCreated(true)}
							>
								Create Plan Outline
							</Button>
						)}
					</div>
				</div>

				{/* Plan Preview */}
				<div className="mt-6 space-y-4 md:mt-0">
					<div className="grid grid-cols-3 gap-x-4 gap-y-3 md:grid-cols-5">
						<Stat label="Weeks" value={String(weeks.length)} />
						<Stat label="Sessions" value={String(sessionCount)} />
						<Stat label="Peak week" value={num(peak)} unit={unit} />
						<Stat label="Season" value={num(Math.round(total))} unit={unit} />
						<Stat label="Race week" value={shortDate(raceWeek.weekKey)} />
					</div>

					{/* One row per Training Track — the level adaptation, as numbers. */}
					<div className="ring-border divide-border/60 divide-y rounded-2xl ring-1">
						{levels.map(({ track, level }, t) => {
							const inWeek = firstLoading.tracks.find(
								(candidate) => candidate.discipline === track.discipline,
							)
							return (
								<dl
									key={track.discipline}
									className="grid grid-cols-4 gap-2 px-2.5 py-2 text-xs tabular-nums sm:grid-cols-6"
								>
									<div className="col-span-2 sm:col-span-1">
										<dt className="text-muted-foreground text-[10px] uppercase">
											Track {t + 1}
										</dt>
										<dd className="font-medium">
											{DISCIPLINE[track.discipline]}
										</dd>
									</div>
									<div>
										<dt className="text-muted-foreground text-[10px] uppercase">
											Band
										</dt>
										<dd>{level.band}</dd>
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
												: `${num(inWeek.longRun)} ${CURRENCY_UNIT[track.currency]}`}
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
								</dl>
							)
						})}
					</div>

					<LoadProfile
						weeks={weeks}
						peak={peak}
						unit={unit}
						expanded={expanded}
						onPick={(index) =>
							setExpanded((current) => (current === index ? null : index))
						}
					/>

					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-8 text-right">#</TableHead>
								<TableHead className="w-16">Mon</TableHead>
								<TableHead>Phase</TableHead>
								<TableHead className="w-20">Role</TableHead>
								<TableHead className="w-20 text-right">{unit}</TableHead>
								<TableHead className="hidden w-24 sm:table-cell">
									Volume
								</TableHead>
								<TableHead className="w-10 text-right">Ses</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{weeks.map((week) => {
								const open = expanded === week.index
								const width = peak === 0 ? 0 : (week.targetVolume / peak) * 100
								const sessions = week.sessions.length
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
											<TableCell className="text-muted-foreground text-right tabular-nums">
												{week.index}
											</TableCell>
											<TableCell className="tabular-nums">
												{shortDate(week.weekKey)}
											</TableCell>
											<TableCell className="max-w-32 truncate">
												{week.phase}
											</TableCell>
											<TableCell>
												<Badge
													className={cn(
														'rounded-md px-1.5 text-[10px]',
														ROLE_BADGE[week.role],
													)}
												>
													{ROLE_LABEL[week.role]}
												</Badge>
											</TableCell>
											<TableCell className="text-right font-medium tabular-nums">
												{num(week.targetVolume)}
											</TableCell>
											<TableCell className="hidden sm:table-cell">
												<span className="bg-muted flex h-1.5 w-20 overflow-hidden rounded-full">
													<span
														className={cn('h-full', ROLE_BAR[week.role])}
														style={{ width: `${width}%` }}
													/>
												</span>
											</TableCell>
											<TableCell className="text-muted-foreground text-right tabular-nums">
												{sessions}
											</TableCell>
										</TableRow>
										{open ? (
											<TableRow>
												<TableCell colSpan={7} className="whitespace-normal">
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
