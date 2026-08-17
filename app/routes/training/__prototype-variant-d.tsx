/**
 * PROTOTYPE — variant D, "direct manipulation".
 *
 * There is no form. The Plan Outline for the Target Event is already built from
 * the athlete's history when the screen opens, drawn as an 18-week load profile
 * the athlete can grab: the rail moves the Season Anchor, the boundary handles
 * reshape the Periodization Preset, a bar moves one week. Every gesture has a
 * keyboard/tap equivalent. The athlete's only job is to disagree.
 *
 * THROWAWAY — do not ship.
 */
import { useMemo, useRef, useState } from 'react'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import {
	DISCIPLINE_LABELS,
	VOLUME_CURRENCY_UNITS,
	WEEK_ROLE_LABELS,
} from '#app/utils/labels.ts'
import {
	buildSeason,
	DEFAULT_PRESET_KEY,
	describeLevel,
	INTENTS,
	orderTracks,
	PRESETS,
	rescaleWeekTrack,
	tracksFor,
	type Discipline,
	type Intent,
	type Phase,
	type Preset,
	type VariantProps,
	type Week,
	type WeekRole,
} from './__prototype-data.ts'

/* -------------------------------------------------------------------------- */
/* Shape maths — pure                                                          */
/* -------------------------------------------------------------------------- */

const INTENT_PRESET: Record<Intent, string> = {
	'first-season': 'gentle-ramp',
	'returning-from-injury': 'back-from-injury',
	'deliberately-building': DEFAULT_PRESET_KEY,
}

function presetByKey(key: string): Preset {
	return (
		PRESETS.find((p) => p.key === key) ??
		PRESETS.find((p) => p.key === DEFAULT_PRESET_KEY)!
	)
}

/** The preset whose phase shape is exactly the current one, if any. */
function matchPreset(phases: Phase[]): Preset | null {
	return (
		PRESETS.find(
			(preset) =>
				preset.phases.length === phases.length &&
				preset.phases.every(
					(phase, i) =>
						phase.name === phases[i]?.name && phase.weeks === phases[i]?.weeks,
				),
		) ?? null
	)
}

function clamp(n: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, n))
}

function round1(n: number): number {
	return Math.round(n * 10) / 10
}

/** Stretch or squeeze `list` to exactly `n` entries — the data module's trick. */
function resample<T>(list: T[], n: number): T[] {
	if (list.length === 0 || n <= 0) return []
	if (list.length === n) return list
	return Array.from(
		{ length: n },
		(_, i) =>
			list[Math.min(list.length - 1, Math.floor((i * list.length) / n))]!,
	)
}

/** A generic 0–1 ramp for a hand-shaped phase list: rise, dip every 4th, taper. */
function synthesizeCurve(phases: Phase[], totalWeeks: number): number[] {
	const out: number[] = []
	let week = 0
	for (const phase of phases) {
		const isTaper = /taper/i.test(phase.name)
		for (let k = 0; k < phase.weeks; k++) {
			week += 1
			const t = (week - 1) / Math.max(1, totalWeeks - 1)
			let load = 0.4 + 0.6 * t
			if (isTaper) load = 0.6 - 0.3 * (k / Math.max(1, phase.weeks - 1))
			else if (week % 4 === 0) load -= 0.18
			if (week === totalWeeks) load = 0.3
			out.push(clamp(round1(load * 100) / 100, 0.15, 1))
		}
	}
	return out
}

function phaseNamePerWeek(phases: Phase[]): string[] {
	const names: string[] = []
	for (const phase of phases) {
		for (let i = 0; i < phase.weeks; i++) names.push(phase.name)
	}
	return names
}

function roleFor(
	phase: string,
	index: number,
	totalWeeks: number,
	load: number,
	previous: number,
): WeekRole {
	if (index === totalWeeks) return 'race'
	if (/taper/i.test(phase)) return 'taper'
	if (load < previous) return 'recovery'
	return 'loading'
}

/**
 * The season the athlete sees: `buildSeason` supplies every session — whole km,
 * level-aware, one set per Training Track — and the grabbed curve supplies the
 * phase name, the Week Role and the active track's weekly target. A dragged week
 * is re-sized through {@link rescaleWeekTrack}, so its sessions stay whole units
 * and still sum to the number under the athlete's thumb.
 */
function composeSeason({
	base,
	anchor,
	phases,
	curve,
	factors,
	trackIndex,
}: {
	base: Week[]
	anchor: number
	phases: Phase[]
	curve: number[]
	factors: Record<number, number>
	trackIndex: number
}): Week[] {
	const totalWeeks = base.length
	const names = resample(phaseNamePerWeek(phases), totalWeeks)
	let previous = 0

	return base.map((baseWeek, i) => {
		const index = i + 1
		const load = curve[i] ?? 0.5
		const phase = names[i] ?? baseWeek.phase
		const role = roleFor(phase, index, totalWeeks, load, previous)
		previous = load
		const derived = anchor * (0.85 + load * 0.5)
		const target = derived * (factors[index] ?? 1)
		const tracks = baseWeek.tracks.map((track, t) =>
			t === trackIndex ? rescaleWeekTrack(track, target) : track,
		)
		const active = tracks[trackIndex] ?? tracks[0]!
		return {
			...baseWeek,
			phase,
			role,
			targetVolume: active.targetVolume,
			currency: active.currency,
			tracks,
			sessions: tracks.flatMap((track) => track.sessions),
		}
	})
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                  */
/* -------------------------------------------------------------------------- */

function fmt(n: number): string {
	return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

function roleLabel(role: WeekRole): string {
	return role === 'race' ? 'Race' : WEEK_ROLE_LABELS[role]
}

const ROLE_BAR: Record<WeekRole, string> = {
	loading: 'bg-primary',
	recovery: 'bg-primary/40',
	taper: 'bg-primary/25',
	race: 'bg-foreground',
}

const CHART_HEIGHT = 300

function eventDay(iso: string): string {
	return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		timeZone: 'UTC',
	})
}

/* -------------------------------------------------------------------------- */
/* The screen                                                                  */
/* -------------------------------------------------------------------------- */

type Readout = { big: string; small: string }

export default function VariantD({
	athlete,
	event,
	seasonStartMonday,
	seasonWeeks,
}: VariantProps) {
	// The biggest track leads; a single-discipline athlete has exactly one, so the
	// track chips below never appear for them.
	const tracks = useMemo(() => orderTracks(athlete.tracks), [athlete.tracks])

	const [track, setTrack] = useState<Discipline>(tracks[0]!.discipline)
	const [intent, setIntent] = useState<Intent>('deliberately-building')
	const [phases, setPhases] = useState<Phase[]>(
		() => presetByKey(INTENT_PRESET['deliberately-building']).phases,
	)
	const [anchors, setAnchors] = useState<Partial<Record<Discipline, number>>>(
		() =>
			Object.fromEntries(
				athlete.tracks.map((t) => [t.discipline, t.proposedAnchor]),
			),
	)
	const [factors, setFactors] = useState<
		Record<string, Record<number, number>>
	>({})
	const [selected, setSelected] = useState<number | null>(null)
	const [readout, setReadout] = useState<Readout | null>(null)
	const [hinted, setHinted] = useState(false)
	const [created, setCreated] = useState(false)

	const chartRef = useRef<HTMLDivElement>(null)

	const activeTrack = tracks.find((t) => t.discipline === track) ?? tracks[0]!
	const trackIndex = Math.max(
		0,
		tracks.findIndex((t) => t.discipline === activeTrack.discipline),
	)
	const currency = activeTrack.currency
	const unit = VOLUME_CURRENCY_UNITS[currency]
	const step = currency === 'hours' ? 0.5 : 1
	const anchor = anchors[activeTrack.discipline] ?? activeTrack.proposedAnchor
	const domain = Math.max(step * 4, activeTrack.proposedAnchor * 2)
	const pristine =
		anchor === activeTrack.proposedAnchor &&
		Object.keys(factors[track] ?? {}).length === 0

	const matched = useMemo(() => matchPreset(phases), [phases])
	const base = useMemo(
		() =>
			buildSeason({
				tracks: tracksFor({ ...athlete, tracks }, anchors),
				presetKey: matched?.key ?? INTENT_PRESET[intent],
				trainableDays: athlete.trainableDays,
				startMonday: seasonStartMonday,
				weeks: event.weeksAway || seasonWeeks,
				raceDiscipline: event.discipline,
			}),
		[
			athlete,
			tracks,
			anchors,
			matched,
			intent,
			seasonStartMonday,
			seasonWeeks,
			event.weeksAway,
			event.discipline,
		],
	)
	const totalWeeks = base.length
	const curve = useMemo(
		() =>
			resample(
				matched?.weeklyLoad ?? synthesizeCurve(phases, totalWeeks),
				totalWeeks,
			),
		[matched, phases, totalWeeks],
	)
	const weeks = useMemo(
		() =>
			composeSeason({
				base,
				anchor,
				phases,
				curve,
				factors: factors[track] ?? {},
				trackIndex,
			}),
		[base, anchor, phases, curve, factors, track, trackIndex],
	)

	const selectedWeek = selected ? weeks[selected - 1] : undefined
	const sessionCount = weeks.reduce(
		(sum, week) => sum + week.sessions.length,
		0,
	)
	const firstLoading = weeks.find((week) => week.role === 'loading') ?? weeks[0]
	/** The level band this anchor lands in — shown as numbers, never as prose. */
	const level = describeLevel(anchor, currency, activeTrack.discipline)
	const phaseWeeks = phases.reduce((sum, phase) => sum + phase.weeks, 0)

	/* ----------------------------- mutations ------------------------------- */

	function touch() {
		setHinted(true)
	}

	function setAnchorValue(next: number) {
		setAnchors((prev) => ({
			...prev,
			[track]: round1(clamp(next, step, domain * 0.95)),
		}))
	}

	function setWeekTarget(index: number, next: number) {
		const week = weeks[index - 1]
		if (!week) return
		const derived = round1(anchor * (0.85 + (curve[index - 1] ?? 0.5) * 0.5))
		const clamped = clamp(next, step, domain)
		setFactors((prev) => ({
			...prev,
			[track]: { ...(prev[track] ?? {}), [index]: clamped / derived },
		}))
	}

	function clearWeek(index: number) {
		setFactors((prev) => {
			const forTrack = { ...(prev[track] ?? {}) }
			delete forTrack[index]
			return { ...prev, [track]: forTrack }
		})
	}

	function moveBoundary(boundary: number, delta: number, from: Phase[]) {
		const left = from[boundary]
		const right = from[boundary + 1]
		if (!left || !right) return
		const shift = clamp(delta, 1 - left.weeks, right.weeks - 1)
		if (shift === 0) {
			setPhases(from)
			return
		}
		const next = from.map((phase, i) =>
			i === boundary
				? { ...phase, weeks: phase.weeks + shift }
				: i === boundary + 1
					? { ...phase, weeks: phase.weeks - shift }
					: phase,
		)
		setPhases(next)
		setReadout({
			big: `${next[boundary]!.weeks} wk`,
			small: `${left.name} ${left.weeks} → ${next[boundary]!.weeks}`,
		})
	}

	function applyIntent(next: Intent) {
		touch()
		setIntent(next)
		setPhases(presetByKey(INTENT_PRESET[next]).phases)
		setFactors((prev) => ({ ...prev, [track]: {} }))
	}

	function resetAll() {
		setPhases(presetByKey(INTENT_PRESET[intent]).phases)
		setAnchors(
			Object.fromEntries(
				athlete.tracks.map((t) => [t.discipline, t.proposedAnchor]),
			),
		)
		setFactors({})
		setSelected(null)
	}

	/* ------------------------------- drags --------------------------------- */

	function drag(
		event: React.PointerEvent<HTMLElement>,
		onMove: (dx: number, dy: number, rect: DOMRect) => void,
		onTap?: () => void,
	) {
		const chart = chartRef.current
		if (!chart) return
		const rect = chart.getBoundingClientRect()
		const el = event.currentTarget
		const startX = event.clientX
		const startY = event.clientY
		let moved = false
		touch()
		el.setPointerCapture(event.pointerId)

		function handleMove(ev: PointerEvent) {
			const dx = ev.clientX - startX
			const dy = ev.clientY - startY
			if (!moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return
			moved = true
			onMove(dx, dy, rect)
		}
		function handleUp() {
			el.removeEventListener('pointermove', handleMove)
			el.removeEventListener('pointerup', handleUp)
			el.removeEventListener('pointercancel', handleUp)
			setReadout(null)
			if (!moved) onTap?.()
		}
		el.addEventListener('pointermove', handleMove)
		el.addEventListener('pointerup', handleUp)
		el.addEventListener('pointercancel', handleUp)
	}

	function dragAnchor(event: React.PointerEvent<HTMLElement>) {
		const start = anchor
		drag(event, (_dx, dy, rect) => {
			const next = start - (dy / rect.height) * domain
			setAnchorValue(next)
			setReadout({
				big: `${fmt(round1(clamp(next, step, domain * 0.95)))} ${unit}`,
				small: DISCIPLINE_LABELS[track],
			})
		})
	}

	function dragWeek(event: React.PointerEvent<HTMLElement>, week: Week) {
		const start = week.targetVolume
		drag(
			event,
			(_dx, dy, rect) => {
				const next = start - (dy / rect.height) * domain
				setWeekTarget(week.index, next)
				setReadout({
					big: `${fmt(round1(clamp(next, step, domain)))} ${unit}`,
					small: `Week ${week.index} · ${week.phase}`,
				})
			},
			() => setSelected(week.index),
		)
	}

	function dragBoundary(
		event: React.PointerEvent<HTMLElement>,
		boundary: number,
	) {
		const from = phases
		drag(event, (dx, _dy, rect) => {
			const weekWidth = rect.width / Math.max(1, totalWeeks)
			moveBoundary(boundary, Math.round(dx / weekWidth), from)
		})
	}

	/* ------------------------------- render -------------------------------- */

	const boundaries: { boundary: number; week: number; phase: Phase }[] = []
	let cumulative = 0
	phases.forEach((phase, i) => {
		cumulative += phase.weeks
		if (i < phases.length - 1) {
			boundaries.push({ boundary: i, week: cumulative, phase })
		}
	})

	return (
		<div className="container max-w-2xl py-6 md:py-8">
			{/* Target Event */}
			<div className="flex items-baseline justify-between gap-2">
				<h1 className="truncate text-2xl font-semibold md:text-3xl">
					{event.name}
				</h1>
				<span className="text-muted-foreground shrink-0 text-sm tabular-nums">
					{eventDay(event.date)}
				</span>
			</div>

			{/* Intent — one tap reshapes the ramp */}
			<div className="mt-3 flex flex-wrap gap-1.5">
				{INTENTS.map((option) => (
					<button
						key={option.key}
						type="button"
						onClick={() => applyIntent(option.key)}
						aria-pressed={intent === option.key}
						className={`h-11 rounded-2xl px-3 text-sm font-medium ${
							intent === option.key
								? 'bg-primary text-primary-foreground'
								: 'bg-muted text-muted-foreground'
						}`}
					>
						{option.label}
					</button>
				))}
			</div>

			{/* Live readout */}
			<div className="mt-5 flex items-center gap-3">
				<div className="min-w-0 flex-1">
					<div className="flex items-baseline gap-1.5">
						<span className="text-4xl leading-none font-semibold tabular-nums md:text-5xl">
							{readout ? readout.big.split(' ')[0] : fmt(anchor)}
						</span>
						<span className="text-muted-foreground text-base">
							{readout
								? readout.big.split(' ').slice(1).join(' ')
								: `${unit}${pristine ? ' ≈' : ''}`}
						</span>
					</div>
					<div className="text-muted-foreground mt-1 truncate text-xs tabular-nums">
						{readout
							? readout.small
							: `${matched ? matched.name : 'Custom shape'} · ${totalWeeks} wk · ${level.summary}`}
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-1">
					<button
						type="button"
						aria-label="Lower Season Anchor"
						onClick={() => {
							touch()
							setAnchorValue(anchor - step)
						}}
						className="border-border text-foreground flex size-11 items-center justify-center rounded-2xl border"
					>
						<Icon name="minus" size="sm" />
					</button>
					<button
						type="button"
						aria-label="Raise Season Anchor"
						onClick={() => {
							touch()
							setAnchorValue(anchor + step)
						}}
						className="border-border text-foreground flex size-11 items-center justify-center rounded-2xl border"
					>
						<Icon name="plus" size="sm" />
					</button>
				</div>
			</div>

			{/* Training Tracks */}
			{tracks.length > 1 ? (
				<div className="mt-4 flex gap-1.5 overflow-x-auto pb-1">
					{tracks.map((t) => (
						<button
							key={t.discipline}
							type="button"
							onClick={() => {
								setTrack(t.discipline)
								setSelected(null)
							}}
							aria-pressed={t.discipline === track}
							className={`h-11 shrink-0 rounded-2xl px-3 text-sm tabular-nums ${
								t.discipline === track
									? 'bg-secondary text-secondary-foreground font-medium'
									: 'text-muted-foreground'
							}`}
						>
							{DISCIPLINE_LABELS[t.discipline]}{' '}
							{fmt(anchors[t.discipline] ?? t.proposedAnchor)}{' '}
							{VOLUME_CURRENCY_UNITS[t.currency]}
						</button>
					))}
				</div>
			) : null}

			{/* The chart is the interface */}
			<div className="relative mt-4 pl-11 select-none">
				{/* Season Anchor rail */}
				<div
					className="border-border/60 absolute top-0 left-4 w-0 border-l"
					style={{ height: CHART_HEIGHT }}
				/>
				<div
					className="absolute left-0 z-20"
					style={{ top: (1 - anchor / domain) * CHART_HEIGHT - 22 }}
				>
					<button
						type="button"
						role="slider"
						aria-label="Season Anchor"
						aria-valuemin={step}
						aria-valuemax={Math.round(domain * 0.95)}
						aria-valuenow={anchor}
						aria-valuetext={`${fmt(anchor)} ${unit}`}
						tabIndex={0}
						onPointerDown={dragAnchor}
						onKeyDown={(e) => {
							if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
								e.preventDefault()
								touch()
								setAnchorValue(anchor + step)
							} else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
								e.preventDefault()
								touch()
								setAnchorValue(anchor - step)
							} else if (e.key === 'Home') {
								e.preventDefault()
								setAnchorValue(activeTrack.proposedAnchor)
							}
						}}
						className="bg-background border-primary text-primary focus-visible:ring-ring/40 flex h-11 w-8 cursor-ns-resize touch-none flex-col items-center justify-center gap-[3px] rounded-xl border focus-visible:ring-3 focus-visible:outline-none"
					>
						<span className="bg-primary block size-1 rounded-full" />
						<span className="bg-primary block size-1 rounded-full" />
						<span className="bg-primary block size-1 rounded-full" />
					</button>
				</div>

				{/* Anchor line */}
				<div
					className="border-primary/50 pointer-events-none absolute right-0 left-11 z-10 border-t border-dashed"
					style={{ top: (1 - anchor / domain) * CHART_HEIGHT }}
				/>

				{/* Bars */}
				<div
					ref={chartRef}
					className="flex touch-none items-end gap-[2px]"
					style={{ height: CHART_HEIGHT }}
				>
					{weeks.map((week) => {
						const overridden = (factors[track] ?? {})[week.index] !== undefined
						return (
							<button
								key={week.index}
								type="button"
								role="slider"
								aria-label={`Week ${week.index}, ${week.phase}, ${roleLabel(week.role)}`}
								aria-valuemin={step}
								aria-valuemax={Math.round(domain)}
								aria-valuenow={week.targetVolume}
								aria-valuetext={`${fmt(week.targetVolume)} ${unit}`}
								onPointerDown={(e) => dragWeek(e, week)}
								onKeyDown={(e) => {
									if (e.key === 'ArrowUp') {
										e.preventDefault()
										touch()
										setWeekTarget(week.index, week.targetVolume + step)
									} else if (e.key === 'ArrowDown') {
										e.preventDefault()
										touch()
										setWeekTarget(week.index, week.targetVolume - step)
									} else if (e.key === 'Enter' || e.key === ' ') {
										e.preventDefault()
										setSelected(week.index)
									} else if (e.key === 'Home') {
										e.preventDefault()
										clearWeek(week.index)
									}
								}}
								className={`focus-visible:ring-ring/40 group relative flex h-full flex-1 cursor-ns-resize touch-none items-end rounded-t-sm focus-visible:ring-3 focus-visible:outline-none ${
									selected === week.index ? 'bg-muted/60' : ''
								}`}
							>
								<span
									className={`block w-full rounded-t-sm ${ROLE_BAR[week.role]} ${
										selected === week.index ? 'ring-foreground ring-2' : ''
									}`}
									style={{
										height: `${clamp((week.targetVolume / domain) * 100, 2, 100)}%`,
									}}
								/>
								{overridden ? (
									<span className="bg-foreground absolute inset-x-0 -top-2 mx-auto block size-1.5 rounded-full" />
								) : null}
							</button>
						)
					})}
				</div>

				{/* Phase band + boundary handles */}
				<div className="relative mt-1.5">
					<div className="flex gap-[2px]">
						{phases.map((phase) => (
							<div
								key={phase.name}
								className="bg-muted text-muted-foreground min-w-0 overflow-hidden rounded-md px-1 py-1 text-center text-[11px] leading-tight"
								style={{ flexGrow: phase.weeks, flexBasis: 0 }}
							>
								<span className="block truncate">{phase.name}</span>
								<span className="block tabular-nums">{phase.weeks}</span>
							</div>
						))}
					</div>
					{boundaries.map(({ boundary, week, phase }) => (
						<button
							key={boundary}
							type="button"
							role="slider"
							aria-label={`${phase.name} weeks`}
							aria-valuemin={1}
							aria-valuemax={phaseWeeks - phases.length + 1}
							aria-valuenow={phase.weeks}
							aria-valuetext={`${phase.name} ${phase.weeks} weeks`}
							onPointerDown={(e) => dragBoundary(e, boundary)}
							onKeyDown={(e) => {
								if (e.key === 'ArrowRight') {
									e.preventDefault()
									touch()
									moveBoundary(boundary, 1, phases)
								} else if (e.key === 'ArrowLeft') {
									e.preventDefault()
									touch()
									moveBoundary(boundary, -1, phases)
								}
							}}
							className="bg-background border-border focus-visible:ring-ring/40 absolute -top-4 z-20 flex h-11 w-6 -translate-x-1/2 cursor-ew-resize touch-none flex-row items-center justify-center gap-[3px] rounded-xl border focus-visible:ring-3 focus-visible:outline-none"
							style={{ left: `${(week / Math.max(1, phaseWeeks)) * 100}%` }}
						>
							<span className="bg-muted-foreground block size-1 rounded-full" />
							<span className="bg-muted-foreground block size-1 rounded-full" />
						</button>
					))}
				</div>

				{!hinted ? (
					<p className="text-muted-foreground pointer-events-none absolute top-2 right-1 text-xs">
						Grab the curve
					</p>
				) : null}
			</div>

			{/* Weeks strip */}
			<div className="-mx-4 mt-6 flex gap-1.5 overflow-x-auto px-4 pb-1">
				{weeks.map((week) => (
					<button
						key={week.index}
						type="button"
						onClick={() =>
							setSelected(selected === week.index ? null : week.index)
						}
						aria-pressed={selected === week.index}
						className={`flex h-11 w-12 shrink-0 flex-col items-center justify-center rounded-xl text-xs tabular-nums ${
							selected === week.index
								? 'bg-secondary text-secondary-foreground'
								: 'text-muted-foreground'
						}`}
					>
						<span className="font-medium">{week.index}</span>
						<span
							className={`mt-0.5 block h-1 w-6 rounded-full ${ROLE_BAR[week.role]}`}
						/>
					</button>
				))}
			</div>

			{/* Selected week */}
			{selectedWeek ? (
				<div className="border-border mt-4 rounded-2xl border p-4">
					<div className="flex items-center justify-between gap-2">
						<div className="min-w-0">
							<div className="truncate text-lg font-semibold tabular-nums">
								Week {selectedWeek.index} · {selectedWeek.phase}
							</div>
							<div className="text-muted-foreground text-xs">
								{roleLabel(selectedWeek.role)} · {selectedWeek.weekKey}
							</div>
						</div>
						<div className="flex shrink-0 items-center gap-1.5">
							<label className="sr-only" htmlFor="week-volume">
								Week volume
							</label>
							<input
								id="week-volume"
								type="number"
								inputMode="decimal"
								step={step}
								value={selectedWeek.targetVolume}
								onChange={(e) => {
									const next = Number.parseFloat(e.target.value)
									if (!Number.isNaN(next))
										setWeekTarget(selectedWeek.index, next)
								}}
								className="border-border h-11 w-20 rounded-2xl border px-2 text-right text-base tabular-nums md:text-sm"
							/>
							<span className="text-muted-foreground text-xs">{unit}</span>
							<button
								type="button"
								aria-label="Close week"
								onClick={() => setSelected(null)}
								className="text-muted-foreground flex size-11 items-center justify-center"
							>
								<Icon name="cross-1" size="sm" />
							</button>
						</div>
					</div>
					<ul className="mt-3 space-y-1.5">
						{selectedWeek.sessions.map((session, i) => (
							<li
								key={`${session.day}-${i}`}
								className="flex items-baseline gap-2 text-sm"
							>
								<span className="text-muted-foreground w-8 shrink-0">
									{session.day}
								</span>
								<span className="min-w-0 flex-1 truncate">{session.title}</span>
								<span className="shrink-0 tabular-nums">
									≈ {session.volume}
								</span>
								<span className="text-muted-foreground w-20 shrink-0 truncate text-right text-xs">
									{session.intensity}
								</span>
							</li>
						))}
					</ul>
				</div>
			) : null}

			{/* What the curve came out as — numbers, for the first loading week. */}
			{firstLoading ? (
				<dl className="text-muted-foreground mt-6 flex flex-wrap gap-x-6 gap-y-2 text-xs tabular-nums">
					{[
						{
							label: 'sessions/wk',
							value: String(
								firstLoading.tracks[trackIndex]?.sessions.length ??
									firstLoading.sessions.length,
							),
						},
						{
							label: 'long run',
							value:
								firstLoading.tracks[trackIndex]?.longRun == null
									? '—'
									: `${fmt(firstLoading.tracks[trackIndex]!.longRun!)} ${unit} · ${Math.round(
											firstLoading.tracks[trackIndex]!.longRunShare * 100,
										)} %`,
						},
						{
							label: 'easy',
							value: `${Math.round((firstLoading.tracks[trackIndex]?.easyShare ?? 1) * 100)} %`,
						},
						{ label: 'sessions total', value: String(sessionCount) },
					].map((cell) => (
						<div key={cell.label}>
							<dd className="text-foreground text-lg font-semibold">
								{cell.value}
							</dd>
							<dt>{cell.label}</dt>
						</div>
					))}
				</dl>
			) : null}

			{/* Actions */}
			<div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse sm:items-center">
				{created ? (
					<p
						role="status"
						className="text-primary flex items-center gap-2 text-sm font-medium tabular-nums"
					>
						<Icon name="check" size="sm" />
						Plan created · {totalWeeks} weeks · {sessionCount} sessions
					</p>
				) : (
					<Button className="w-full sm:w-auto" onClick={() => setCreated(true)}>
						Create plan
					</Button>
				)}
				<Button
					variant="ghost"
					onClick={resetAll}
					className="text-muted-foreground w-full sm:w-auto"
				>
					<Icon name="reset" size="sm" /> Reset to ≈ history
				</Button>
			</div>
		</div>
	)
}
