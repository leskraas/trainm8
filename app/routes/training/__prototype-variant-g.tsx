/**
 * PROTOTYPE — variant G, "dial and rings".
 *
 * A physical instrument rather than a document. One big circular dial sets the
 * Season Anchor; concentric rings around it show the composition the level rules
 * produce (easy / quality / long) so the split is seen, not read. The season is a
 * second radial object — a ring calendar of week arcs, thickness = load, Race
 * week marked — and tapping an arc drops that week's sessions under the dial.
 *
 * THROWAWAY — do not ship.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '#app/components/ui/icon.tsx'
import { DISCIPLINE_LABELS } from '#app/utils/labels.ts'
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
	type Currency,
	type Day,
	type Discipline,
	type Intent,
	type PrototypeEvent,
	type SeasonTrackInput,
	type VariantProps,
	type Week,
	type WeekRole,
	type WeekTrack,
} from './__prototype-data.ts'

/* -------------------------------------------------------------------------- */
/* Geometry — pure                                                            */
/* -------------------------------------------------------------------------- */

/** The dial's live arc: 270° with the gap at the bottom, like a thermostat. */
const SWEEP = 270
const DIAL_START = -135

/**
 * Rounded to 3 decimals on purpose: `Math.sin` differs in its last bit between
 * Node and the browser, and an unrounded coordinate hydrates with a mismatch.
 */
function polar(cx: number, cy: number, r: number, deg: number) {
	const rad = (deg * Math.PI) / 180
	return {
		x: Math.round((cx + r * Math.sin(rad)) * 1000) / 1000,
		y: Math.round((cy - r * Math.cos(rad)) * 1000) / 1000,
	}
}

function arcPath(
	cx: number,
	cy: number,
	r: number,
	from: number,
	to: number,
): string {
	const a = polar(cx, cy, r, from)
	const b = polar(cx, cy, r, to)
	const large = Math.abs(to - from) > 180 ? 1 : 0
	const clockwise = to >= from ? 1 : 0
	return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 ${large} ${clockwise} ${b.x.toFixed(2)} ${b.y.toFixed(2)}`
}

function clamp(n: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, n))
}

/* -------------------------------------------------------------------------- */
/* Anchor range and currency — pure                                           */
/* -------------------------------------------------------------------------- */

/** The rounding grain the builder itself uses: whole km, 5 min, 5 TSS. */
const STEP: Record<Currency, number> = { km: 1, hours: 5 / 60, tss: 5 }
const FLOOR: Record<Currency, number> = { km: 4, hours: 0.5, tss: 30 }

// Same conversion conventions the data module bands with: 10 km/h, 7 TSS/km.
const KM_PER_HOUR = 10
const TSS_PER_KM = 7

function toKm(value: number, currency: Currency): number {
	if (currency === 'km') return value
	if (currency === 'hours') return value * KM_PER_HOUR
	return value / TSS_PER_KM
}

function fromKm(km: number, currency: Currency): number {
	if (currency === 'km') return km
	if (currency === 'hours') return km / KM_PER_HOUR
	return km * TSS_PER_KM
}

function snap(value: number, currency: Currency): number {
	const step = STEP[currency]
	return Math.round(value / step) * step
}

function convert(value: number, from: Currency, to: Currency): number {
	if (from === to) return value
	return snap(fromKm(toKm(value, from), to), to)
}

function rangeFor(history: number, currency: Currency) {
	const step = STEP[currency]
	const min = Math.max(FLOOR[currency], snap(history * 0.4, currency))
	const max = Math.max(snap(history * 1.9, currency), min + 12 * step)
	return { min, max }
}

/* -------------------------------------------------------------------------- */
/* Derivations — pure                                                         */
/* -------------------------------------------------------------------------- */

const INTENT_PRESET: Record<Intent, string> = {
	'first-season': 'gentle-ramp',
	'returning-from-injury': 'back-from-injury',
	'deliberately-building': DEFAULT_PRESET_KEY,
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

function shortDate(iso: string): string {
	const [y, m, d] = iso.split('-').map(Number)
	if (!y || !m || !d) return iso
	return `${d} ${MONTHS[m - 1]}`
}

function addWeeks(iso: string, weeks: number): string {
	const at = Date.parse(`${iso}T00:00:00Z`)
	if (Number.isNaN(at)) return iso
	return new Date(at + weeks * 7 * 86_400_000).toISOString().slice(0, 10)
}

const ROLE_LABEL: Record<WeekRole, string> = {
	loading: 'Loading',
	recovery: 'Recovery',
	taper: 'Taper',
	race: 'Race week',
}

const ROLE_TONE: Record<WeekRole, string> = {
	loading: 'text-chart-2',
	recovery: 'text-chart-4',
	taper: 'text-chart-5',
	race: 'text-primary',
}

function trackOf(week: Week, discipline: Discipline): WeekTrack | null {
	return week.tracks.find((t) => t.discipline === discipline) ?? null
}

/* -------------------------------------------------------------------------- */
/* State shape                                                               */
/* -------------------------------------------------------------------------- */

type DialTrack = {
	discipline: Discipline
	currency: Currency
	/** The `≈` pre-fill, in `currency`. */
	history: number
	anchor: number
	intensityBasis: SeasonTrackInput['intensityBasis']
}

/* -------------------------------------------------------------------------- */
/* The dial                                                                  */
/* -------------------------------------------------------------------------- */

const CX = 170
const R_TICK_OUT = 166
const R_TICK_IN = 152
const R_ANCHOR = 140
const R_EASY = 118
const R_QUALITY = 102
const R_LONG = 86
const TICKS = 44

function ShareRing({
	r,
	share,
	tone,
}: {
	r: number
	share: number
	tone: string
}) {
	const circumference = 2 * Math.PI * r
	return (
		<>
			<circle
				cx={CX}
				cy={CX}
				r={r}
				fill="none"
				strokeWidth={11}
				className="text-muted stroke-current"
			/>
			<circle
				cx={CX}
				cy={CX}
				r={r}
				fill="none"
				strokeWidth={11}
				strokeLinecap="round"
				strokeDasharray={circumference}
				strokeDashoffset={circumference * (1 - clamp(share, 0, 1))}
				transform={`rotate(-90 ${CX} ${CX})`}
				className={`${tone} stroke-current`}
			/>
		</>
	)
}

function Dial({
	value,
	min,
	max,
	currency,
	history,
	label,
	easyShare,
	qualityShare,
	longShare,
	onChange,
}: {
	value: number
	min: number
	max: number
	currency: Currency
	history: number
	label: string
	easyShare: number
	qualityShare: number
	longShare: number
	onChange: (next: number) => void
}) {
	const drag = useRef<{ angle: number; value: number } | null>(null)
	const fraction = clamp((value - min) / Math.max(0.001, max - min), 0, 1)
	const angle = DIAL_START + fraction * SWEEP
	const knob = polar(CX, CX, R_ANCHOR, angle)

	function angleAt(element: HTMLElement, clientX: number, clientY: number) {
		const box = element.getBoundingClientRect()
		const cx = box.left + box.width / 2
		const cy = box.top + box.height / 2
		return (Math.atan2(clientX - cx, cy - clientY) * 180) / Math.PI
	}

	return (
		<div
			role="slider"
			tabIndex={0}
			aria-label="Season Anchor"
			aria-valuemin={Math.round(min * 100) / 100}
			aria-valuemax={Math.round(max * 100) / 100}
			aria-valuenow={Math.round(value * 100) / 100}
			aria-valuetext={`${formatVolume(value, currency)} ${label}`}
			className="relative mx-auto aspect-square w-full max-w-[320px] touch-none select-none focus-visible:outline-none"
			onPointerDown={(event) => {
				event.currentTarget.setPointerCapture(event.pointerId)
				drag.current = {
					angle: angleAt(event.currentTarget, event.clientX, event.clientY),
					value,
				}
			}}
			onPointerMove={(event) => {
				const state = drag.current
				if (!state) return
				const next = angleAt(event.currentTarget, event.clientX, event.clientY)
				let delta = next - state.angle
				if (delta > 180) delta -= 360
				if (delta < -180) delta += 360
				state.angle = next
				state.value = clamp(
					state.value + (delta / SWEEP) * (max - min),
					min,
					max,
				)
				onChange(snap(state.value, currency))
			}}
			onPointerUp={(event) => {
				drag.current = null
				if (event.currentTarget.hasPointerCapture(event.pointerId)) {
					event.currentTarget.releasePointerCapture(event.pointerId)
				}
			}}
			onPointerCancel={() => {
				drag.current = null
			}}
		>
			<svg
				viewBox="0 0 340 340"
				className="absolute inset-0 h-full w-full touch-none"
				aria-hidden
			>
				{Array.from({ length: TICKS }, (_, i) => {
					const tickAngle = DIAL_START + (i / (TICKS - 1)) * SWEEP
					const lit = tickAngle <= angle + 0.001
					const a = polar(CX, CX, R_TICK_IN, tickAngle)
					const b = polar(CX, CX, lit ? R_TICK_OUT : R_TICK_OUT - 5, tickAngle)
					return (
						<line
							key={i}
							x1={a.x}
							y1={a.y}
							x2={b.x}
							y2={b.y}
							strokeWidth={lit ? 3 : 2}
							strokeLinecap="round"
							className={
								lit
									? 'text-primary stroke-current'
									: 'text-border stroke-current'
							}
						/>
					)
				})}

				<path
					d={arcPath(CX, CX, R_ANCHOR, DIAL_START, DIAL_START + SWEEP)}
					fill="none"
					strokeWidth={16}
					strokeLinecap="round"
					className="text-muted stroke-current"
				/>
				<path
					d={arcPath(CX, CX, R_ANCHOR, DIAL_START, angle)}
					fill="none"
					strokeWidth={16}
					strokeLinecap="round"
					className="text-primary stroke-current"
				/>

				<ShareRing r={R_EASY} share={easyShare} tone="text-chart-2" />
				<ShareRing r={R_QUALITY} share={qualityShare} tone="text-zone-5" />
				<ShareRing r={R_LONG} share={longShare} tone="text-zone-4" />

				<circle
					cx={knob.x}
					cy={knob.y}
					r={13}
					className="fill-primary stroke-background"
					strokeWidth={4}
				/>
			</svg>

			<div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
				<span className="text-muted-foreground text-xs tabular-nums">
					{value === history ? `≈ ${formatVolume(history, currency)}` : ' '}
				</span>
				<span className="text-5xl leading-none font-semibold tabular-nums">
					{currency === 'hours'
						? formatVolume(value, currency)
						: Math.round(value)}
				</span>
				<span className="text-muted-foreground mt-1 text-sm">
					{currency === 'hours' ? '/ wk' : `${CURRENCY_UNIT[currency]} / wk`}
				</span>
				<span className="mt-1 text-xs font-medium">{label}</span>
			</div>
		</div>
	)
}

/* -------------------------------------------------------------------------- */
/* The ring calendar                                                         */
/* -------------------------------------------------------------------------- */

const RC = 150
const RC_BASE = 112

function RingCalendar({
	season,
	discipline,
	selected,
	onSelect,
}: {
	season: Week[]
	discipline: Discipline
	selected: number
	onSelect: (index: number) => void
}) {
	const values = season.map(
		(week) => trackOf(week, discipline)?.targetVolume ?? 0,
	)
	const peak = Math.max(1, ...values)
	const step = 360 / Math.max(1, season.length)
	const gap = Math.min(2.5, step * 0.18)
	const active = season.find((week) => week.index === selected) ?? season[0]
	const activeTrack = active ? trackOf(active, discipline) : null

	return (
		<div className="relative mx-auto aspect-square w-full max-w-[300px]">
			<svg viewBox="0 0 300 300" className="absolute inset-0 h-full w-full">
				{season.map((week, i) => {
					const from = i * step + gap / 2
					const to = (i + 1) * step - gap / 2
					const load = (values[i] ?? 0) / peak
					const width = 7 + 22 * load
					const isSelected = week.index === selected
					return (
						<g key={week.weekKey}>
							<path
								d={arcPath(RC, RC, RC_BASE, from, to)}
								fill="none"
								strokeWidth={width}
								className={`${ROLE_TONE[week.role]} stroke-current ${
									isSelected ? 'opacity-100' : 'opacity-70'
								}`}
							/>
							{isSelected ? (
								<path
									d={arcPath(RC, RC, RC_BASE + width / 2 + 5, from, to)}
									fill="none"
									strokeWidth={3}
									className="text-foreground stroke-current"
								/>
							) : null}
							{week.role === 'race' ? (
								<>
									<circle
										cx={polar(RC, RC, RC_BASE + 26, (from + to) / 2).x}
										cy={polar(RC, RC, RC_BASE + 26, (from + to) / 2).y}
										r={5}
										className="fill-primary"
									/>
									<text
										x={polar(RC, RC, RC_BASE + 26, (from + to) / 2).x + 9}
										y={polar(RC, RC, RC_BASE + 26, (from + to) / 2).y + 4}
										className="fill-primary text-[11px] font-semibold"
									>
										Race week
									</text>
								</>
							) : null}
							<path
								d={arcPath(RC, RC, RC_BASE, from, to)}
								fill="none"
								strokeWidth={38}
								stroke="transparent"
								role="button"
								tabIndex={0}
								aria-label={`Week ${week.index}, ${week.phase}, ${
									ROLE_LABEL[week.role]
								}, ${formatVolume(values[i] ?? 0, week.currency)}`}
								className="cursor-pointer focus-visible:outline-none"
								onPointerDown={() => onSelect(week.index)}
								onKeyDown={(event) => {
									if (event.key === 'Enter' || event.key === ' ') {
										event.preventDefault()
										onSelect(week.index)
									}
								}}
							/>
						</g>
					)
				})}
			</svg>
			<div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
				<span className="text-muted-foreground text-xs">
					Wk {active?.index ?? 1} / {season.length}
				</span>
				<span className="text-3xl leading-none font-semibold tabular-nums">
					{activeTrack
						? formatVolume(activeTrack.targetVolume, activeTrack.currency)
						: '—'}
				</span>
				<span
					className={`mt-1 text-xs font-medium ${
						active ? ROLE_TONE[active.role] : ''
					}`}
				>
					{active ? ROLE_LABEL[active.role] : ''}
				</span>
				<span className="text-muted-foreground text-xs">{active?.phase}</span>
			</div>
		</div>
	)
}

/* -------------------------------------------------------------------------- */
/* Small instrument parts                                                    */
/* -------------------------------------------------------------------------- */

function Segmented<T extends string>({
	options,
	value,
	onChange,
	ariaLabel,
}: {
	options: { key: T; label: string }[]
	value: T
	onChange: (key: T) => void
	ariaLabel: string
}) {
	return (
		<div
			role="group"
			aria-label={ariaLabel}
			className="bg-muted flex gap-1 rounded-full p-1"
		>
			{options.map((option) => (
				<button
					key={option.key}
					type="button"
					aria-pressed={value === option.key}
					onClick={() => onChange(option.key)}
					className={`h-9 flex-1 rounded-full px-2 text-xs font-medium transition-colors ${
						value === option.key
							? 'bg-background text-foreground shadow-sm'
							: 'text-muted-foreground'
					} relative after:absolute after:inset-x-0 after:-inset-y-2 after:content-['']`}
				>
					{option.label}
				</button>
			))}
		</div>
	)
}

function StepButton({
	onClick,
	icon,
	label,
}: {
	onClick: () => void
	icon: 'minus' | 'plus'
	label: string
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-label={label}
			className="border-border bg-background text-foreground flex size-11 items-center justify-center rounded-full border active:scale-95"
		>
			<Icon name={icon} className="size-5" />
		</button>
	)
}

function LegendDot({
	tone,
	label,
	value,
}: {
	tone: string
	label: string
	value: string
}) {
	return (
		<div className="flex items-center gap-1.5">
			<span
				aria-hidden
				className={`${tone} size-2.5 shrink-0 rounded-full bg-current`}
			/>
			<span className="text-muted-foreground text-xs">{label}</span>
			<span className="text-xs font-semibold tabular-nums">{value}</span>
		</div>
	)
}

/* -------------------------------------------------------------------------- */
/* The variant                                                               */
/* -------------------------------------------------------------------------- */

export default function VariantG({
	athlete,
	event,
	events,
	seasonStartMonday,
	seasonWeeks,
}: VariantProps) {
	const ordered = useMemo(() => orderTracks(athlete.tracks), [athlete.tracks])

	const [goal, setGoal] = useState<PrototypeEvent>(event)
	const [intent, setIntent] = useState<Intent>('deliberately-building')
	const [presetOverride, setPresetOverride] = useState<string | null>(null)
	const [startShift, setStartShift] = useState(0)
	const [days, setDays] = useState<Day[]>(
		athlete.trainableDays.length > 0 ? athlete.trainableDays : DAYS,
	)
	const [confirmed, setConfirmed] = useState(false)
	const [selectedWeek, setSelectedWeek] = useState(1)
	const [tracks, setTracks] = useState<DialTrack[]>(() =>
		ordered.map((track) => ({
			discipline: track.discipline,
			currency: track.currency,
			history: track.proposedAnchor,
			anchor: track.proposedAnchor,
			intensityBasis: track.intensityBasis,
		})),
	)
	const [active, setActive] = useState<Discipline>(
		ordered[0]?.discipline ?? 'run',
	)

	const dial = tracks.find((track) => track.discipline === active) ?? tracks[0]!
	const range = rangeFor(dial.history, dial.currency)
	const presetKey = presetOverride ?? INTENT_PRESET[intent]
	const preset = PRESETS.find((p) => p.key === presetKey) ?? PRESETS[0]!
	const startMonday = addWeeks(seasonStartMonday, startShift)
	const goalWeeks = goal.id === event.id ? seasonWeeks : goal.weeksAway
	const weeks = clamp(Math.max(6, goalWeeks - startShift), 6, 30)

	const season = useMemo(
		() =>
			buildSeason({
				tracks: tracks.map((track) => ({
					discipline: track.discipline,
					currency: track.currency,
					anchor: track.anchor,
					intensityBasis: track.intensityBasis,
				})),
				presetKey,
				trainableDays: days,
				startMonday,
				weeks,
				raceDiscipline: goal.discipline,
			}),
		[tracks, presetKey, days, startMonday, weeks, goal.discipline],
	)

	const week =
		season.find((candidate) => candidate.index === selectedWeek) ?? season[0]
	const weekTrack = week ? trackOf(week, active) : null
	const sessions = week
		? week.sessions.filter((session) => session.discipline === active)
		: []
	const level = describeLevel(dial.anchor, dial.currency, dial.discipline)
	const peakWeek = season.reduce(
		(most, candidate) =>
			Math.max(most, trackOf(candidate, active)?.targetVolume ?? 0),
		0,
	)

	function setAnchor(next: number) {
		setTracks((current) =>
			current.map((track) =>
				track.discipline === dial.discipline
					? { ...track, anchor: clamp(next, range.min, range.max) }
					: track,
			),
		)
	}

	function nudge(steps: number) {
		setAnchor(snap(dial.anchor + steps * STEP[dial.currency], dial.currency))
	}

	function setCurrency(next: Currency) {
		setTracks((current) =>
			current.map((track) =>
				track.discipline === dial.discipline
					? {
							...track,
							currency: next,
							history: convert(track.history, track.currency, next),
							anchor: convert(track.anchor, track.currency, next),
						}
					: track,
			),
		)
	}

	// The dial's non-drag path: arrows anywhere on the screen, Home back to `≈`.
	const anchorRef = useRef({ nudge, reset: () => setAnchor(dial.history) })
	anchorRef.current = { nudge, reset: () => setAnchor(dial.history) }
	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			const target = event.target as HTMLElement | null
			if (
				target?.closest('input, textarea, select, [contenteditable="true"]') !=
				null
			) {
				return
			}
			if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
				event.preventDefault()
				anchorRef.current.nudge(1)
			} else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
				event.preventDefault()
				anchorRef.current.nudge(-1)
			} else if (event.key === 'Home') {
				event.preventDefault()
				anchorRef.current.reset()
			}
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [])

	const qualityShare = weekTrack
		? weekTrack.sessions.length > 0
			? weekTrack.quality / weekTrack.sessions.length
			: 0
		: 0

	return (
		<div className="container max-w-2xl space-y-6 py-6">
			{/* Target Event — a settled fact */}
			<section className="space-y-2">
				<div className="flex items-baseline justify-between gap-2">
					<h1 className="truncate text-2xl font-semibold md:text-3xl">
						{goal.name}
					</h1>
					<span className="text-primary shrink-0 text-xs font-semibold">
						{goal.priority}
					</span>
				</div>
				<p className="text-muted-foreground text-sm tabular-nums">
					{shortDate(goal.date)} · {weeks} weeks ·{' '}
					{DISCIPLINE_LABELS[goal.discipline]}
				</p>
				{events.length > 1 ? (
					<div className="flex flex-wrap gap-2">
						{events.map((candidate) => (
							<button
								key={candidate.id}
								type="button"
								aria-pressed={candidate.id === goal.id}
								onClick={() => {
									setGoal(candidate)
									setSelectedWeek(1)
								}}
								className={`h-9 rounded-full border px-3 text-xs ${
									candidate.id === goal.id
										? 'border-primary text-primary'
										: 'border-border text-muted-foreground'
								}`}
							>
								{candidate.name}
							</button>
						))}
					</div>
				) : null}
			</section>

			{/* Intent — three segments, no paragraph */}
			<Segmented
				ariaLabel="Right now"
				options={INTENTS}
				value={intent}
				onChange={(key) => {
					setIntent(key)
					setPresetOverride(null)
				}}
			/>

			{/* Track selector — a triathlete gets one dial and three chips */}
			{tracks.length > 1 ? (
				<div className="flex gap-2">
					{tracks.map((track) => (
						<button
							key={track.discipline}
							type="button"
							aria-pressed={track.discipline === active}
							onClick={() => setActive(track.discipline)}
							className={`h-11 flex-1 rounded-xl border text-xs font-medium ${
								track.discipline === active
									? 'border-primary bg-primary/10 text-foreground'
									: 'border-border text-muted-foreground'
							}`}
						>
							<span className="block">
								{DISCIPLINE_LABELS[track.discipline]}
							</span>
							<span className="block tabular-nums">
								{formatVolume(track.anchor, track.currency)}
							</span>
						</button>
					))}
				</div>
			) : null}

			{/* The dial */}
			<Dial
				value={dial.anchor}
				min={range.min}
				max={range.max}
				currency={dial.currency}
				history={dial.history}
				label={DISCIPLINE_LABELS[dial.discipline]}
				easyShare={weekTrack?.easyShare ?? 0}
				qualityShare={qualityShare}
				longShare={weekTrack?.longRunShare ?? 0}
				onChange={setAnchor}
			/>

			{/* Dial controls */}
			<div className="flex items-center justify-center gap-3">
				<StepButton
					onClick={() => nudge(-1)}
					icon="minus"
					label="Lower the Season Anchor"
				/>
				<button
					type="button"
					onClick={() => setAnchor(dial.history)}
					className="text-muted-foreground flex h-11 items-center gap-1.5 rounded-full px-3 text-xs tabular-nums"
				>
					<Icon name="reset" className="size-4" />≈{' '}
					{formatVolume(dial.history, dial.currency)}
				</button>
				<StepButton
					onClick={() => nudge(1)}
					icon="plus"
					label="Raise the Season Anchor"
				/>
			</div>

			{/* Ring legend — 1–2 words and a number each */}
			<div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
				<LegendDot
					tone="text-chart-2"
					label="Easy"
					value={`${Math.round((weekTrack?.easyShare ?? 0) * 100)}%`}
				/>
				<LegendDot
					tone="text-zone-5"
					label="Quality"
					value={`${weekTrack?.quality ?? 0}`}
				/>
				<LegendDot
					tone="text-zone-4"
					label="Long"
					value={
						weekTrack?.longRun != null
							? formatVolume(weekTrack.longRun, weekTrack.currency)
							: '—'
					}
				/>
				<LegendDot
					tone="text-primary"
					label="Peak"
					value={formatVolume(peakWeek, dial.currency)}
				/>
			</div>

			<p className="text-muted-foreground text-center text-xs tabular-nums">
				{level.summary} · {athlete.medianSessionsPerWeek}/wk over{' '}
				{athlete.closedWeeksWithTraining} weeks
			</p>

			{/* Volume Currency — derived, overridable */}
			<div className="flex items-center justify-center gap-2">
				{(['km', 'hours', 'tss'] as Currency[]).map((currency) => (
					<button
						key={currency}
						type="button"
						aria-pressed={currency === dial.currency}
						onClick={() => setCurrency(currency)}
						className={`h-9 rounded-full border px-3 text-xs font-medium ${
							currency === dial.currency
								? 'border-primary text-primary'
								: 'border-border text-muted-foreground'
						}`}
					>
						{CURRENCY_UNIT[currency]}
					</button>
				))}
			</div>

			{/* The season as a second radial object */}
			<section className="space-y-3">
				<RingCalendar
					season={season}
					discipline={active}
					selected={week?.index ?? 1}
					onSelect={setSelectedWeek}
				/>

				<div className="flex items-center justify-center gap-3">
					<StepButton
						onClick={() =>
							setSelectedWeek((current) => Math.max(1, current - 1))
						}
						icon="minus"
						label="Previous week"
					/>
					<span className="text-muted-foreground w-28 text-center text-xs tabular-nums">
						{week ? shortDate(week.weekKey) : ''}
					</span>
					<StepButton
						onClick={() =>
							setSelectedWeek((current) => Math.min(season.length, current + 1))
						}
						icon="plus"
						label="Next week"
					/>
				</div>

				<ul className="divide-border divide-y">
					{sessions.map((session, index) => (
						<li
							key={`${session.day}-${session.archetype}-${index}`}
							className="flex items-baseline gap-3 py-2.5 text-sm"
						>
							<span className="text-muted-foreground w-9 shrink-0 text-xs">
								{session.day}
							</span>
							<span className="min-w-0 flex-1 truncate">{session.title}</span>
							<span className="shrink-0 font-medium tabular-nums">
								{session.volume}
							</span>
							<span className="text-muted-foreground w-24 shrink-0 truncate text-right text-xs">
								{session.intensity}
							</span>
						</li>
					))}
				</ul>
			</section>

			{/* Derived, shown, overridable */}
			<section className="space-y-3">
				<div className="flex items-center gap-2 overflow-x-auto pb-1">
					<span className="text-muted-foreground shrink-0 text-xs">
						Shape {presetOverride == null ? '≈' : ''}
					</span>
					{PRESETS.map((option) => (
						<button
							key={option.key}
							type="button"
							aria-pressed={option.key === presetKey}
							onClick={() => setPresetOverride(option.key)}
							className={`h-9 shrink-0 rounded-full border px-3 text-xs ${
								option.key === presetKey
									? 'border-primary text-primary'
									: 'border-border text-muted-foreground'
							}`}
						>
							{option.name}
						</button>
					))}
				</div>

				<p className="text-muted-foreground text-xs tabular-nums">
					{preset.phases
						.map((phase) => `${phase.name} ${phase.weeks}`)
						.join(' · ')}
				</p>

				<div className="flex items-center gap-3">
					<span className="text-muted-foreground text-xs">
						Plan Start Week {startShift === 0 ? '≈' : ''}
					</span>
					<span className="text-xs font-medium tabular-nums">
						{shortDate(startMonday)}
					</span>
					<div className="ml-auto flex gap-2">
						<StepButton
							onClick={() =>
								setStartShift((current) => Math.max(0, current - 1))
							}
							icon="minus"
							label="Earlier Plan Start Week"
						/>
						<StepButton
							onClick={() =>
								setStartShift((current) => Math.min(8, current + 1))
							}
							icon="plus"
							label="Later Plan Start Week"
						/>
					</div>
				</div>

				<div className="flex gap-1">
					{DAYS.map((day) => {
						const on = days.includes(day)
						return (
							<button
								key={day}
								type="button"
								aria-pressed={on}
								onClick={() =>
									setDays((current) =>
										current.includes(day)
											? current.filter((d) => d !== day)
											: DAYS.filter((d) => current.includes(d) || d === day),
									)
								}
								className={`flex size-11 items-center justify-center rounded-full border text-xs font-medium ${
									on
										? 'border-primary bg-primary/10 text-foreground'
										: 'border-border text-muted-foreground'
								}`}
							>
								{day.slice(0, 2)}
							</button>
						)
					})}
				</div>
			</section>

			{/* The one action, and its confirmation */}
			<section className="space-y-3">
				{confirmed ? (
					<div className="border-primary/40 bg-primary/10 space-y-1 rounded-xl border p-4">
						<p className="flex items-center gap-2 text-sm font-semibold">
							<Icon name="circle-check" className="text-primary size-5" />
							Plan Outline set
						</p>
						<p className="text-muted-foreground text-xs tabular-nums">
							{goal.name} · {season.length} weeks · {preset.name} ·{' '}
							{sessions.length > 0 ? `${sessions.length}/wk` : ''} · peak{' '}
							{formatVolume(peakWeek, dial.currency)}
						</p>
					</div>
				) : null}
				<button
					type="button"
					onClick={() => setConfirmed((current) => !current)}
					className={`h-12 w-full rounded-xl text-sm font-semibold ${
						confirmed
							? 'border-border text-foreground border'
							: 'bg-primary text-primary-foreground'
					}`}
				>
					{confirmed ? 'Adjust' : 'Set the Plan Outline'}
				</button>
			</section>
		</div>
	)
}
