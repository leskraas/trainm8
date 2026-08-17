/**
 * PROTOTYPE — variant I, "calendar-native".
 *
 * Planning a season *is* editing a calendar, so there is no form and no preview
 * step: the athlete lands in a real weekday×week grid that already holds every
 * session. Chips are sessions and they are draggable between weekdays; the
 * Season Anchor is the editable week total in each week row's gutter; the
 * Periodization Preset and the intent are toolbar controls; Phases are coloured
 * bands down the gutter; the Target Event sits on its real weekday in the Race
 * week. The primary action commits what is already on screen.
 *
 * THROWAWAY — do not ship.
 */
import { useMemo, useRef, useState } from 'react'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { DISCIPLINE_LABELS, WEEK_ROLE_LABELS } from '#app/utils/labels.ts'
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
	type Session,
	type SessionKind,
	type VariantProps,
	type Week,
	type WeekTrack,
} from './__prototype-data.ts'

/* -------------------------------------------------------------------------- */
/* Pure helpers                                                               */
/* -------------------------------------------------------------------------- */

const INTENT_PRESET: Record<Intent, string> = {
	'first-season': 'gentle-ramp',
	'returning-from-injury': 'back-from-injury',
	'deliberately-building': DEFAULT_PRESET_KEY,
}

/** The rounding grain per currency — whole km, whole 5 min, whole 5 TSS. */
const STEP: Record<Currency, number> = { km: 1, hours: 5 / 60, tss: 5 }

/** One character per Training Track, so a chip can name its track in 43 px. */
const TRACK_GLYPH: Record<Discipline, string> = {
	run: 'R',
	bike: 'B',
	swim: 'S',
}

/** One word per Session Archetype the builder emits. */
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

function round1(n: number): number {
	return Math.round(n * 10) / 10
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

function weekdayOf(iso: string): Day {
	const dow = new Date(`${iso}T00:00:00Z`).getUTCDay()
	return DAYS[(dow + 6) % 7]!
}

function dayMonth(iso: string): string {
	return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
		day: 'numeric',
		month: 'short',
		timeZone: 'UTC',
	})
}

/** Largest-remainder rounding to whole units, summing to exactly `total`. */
function apportion(exact: number[], total: number, step: number): number[] {
	if (exact.length === 0) return []
	const units = Math.max(exact.length, Math.round(total / step))
	const raw = exact.map((value) => Math.max(0, value) / step)
	const floors = raw.map((value) => Math.max(1, Math.floor(value)))
	let left = units - floors.reduce((sum, value) => sum + value, 0)
	const order = raw
		.map((value, index) => ({ index, remainder: value - Math.floor(value) }))
		.sort((a, b) => b.remainder - a.remainder)
	let cursor = 0
	while (left > 0) {
		floors[order[cursor % order.length]!.index]! += 1
		left -= 1
		cursor += 1
	}
	while (left < 0) {
		const biggest = floors.reduce(
			(best, value, index) => (value > floors[best]! ? index : best),
			0,
		)
		if (floors[biggest]! <= 1) break
		floors[biggest]! -= 1
		left += 1
	}
	return floors.map((value) => value * step)
}

/**
 * Re-size one track's sessions after a chip changed weekday.
 *
 * The week total is untouched — moving a session does not add volume. What
 * changes is the *day* load: two sessions stacked on one weekday are a double,
 * and the corpus' long-session cap (~30 % of the week) bounds a single day, so
 * the stacked day gives volume back to the days that are under the cap. Every
 * session stays a whole unit of its currency and the parts still sum to the
 * whole.
 */
function rebalance(track: WeekTrack, days: Day[]): number[] {
	const step = STEP[track.currency]
	const values = track.sessions.map((session) => session.value)
	const total = values.reduce((sum, value) => sum + value, 0)
	const cap = Math.max(step, track.level.longCap)
	const exact = values.slice()

	for (let pass = 0; pass < 3; pass++) {
		const byDay = new Map<Day, number[]>()
		days.forEach((day, index) => {
			const list = byDay.get(day) ?? []
			list.push(index)
			byDay.set(day, list)
		})
		let excess = 0
		const under: number[] = []
		for (const indexes of byDay.values()) {
			const sum = indexes.reduce((acc, index) => acc + exact[index]!, 0)
			if (indexes.length > 1 && sum > cap) {
				const factor = cap / sum
				excess += sum - cap
				for (const index of indexes) exact[index]! *= factor
			} else if (sum < cap) {
				under.push(...indexes)
			}
		}
		if (excess <= 1e-9 || under.length === 0) break
		const underSum = under.reduce((acc, index) => acc + exact[index]!, 0)
		for (const index of under) {
			exact[index]! +=
				underSum > 0
					? excess * (exact[index]! / underSum)
					: excess / under.length
		}
	}

	return apportion(exact, total, step)
}

type Chip = { key: string; session: Session; trackIndex: number }
type PlanWeek = Week & { chips: Chip[] }

function chipKey(
	weekIndex: number,
	discipline: Discipline,
	slot: number,
): string {
	return `${weekIndex}-${discipline}-${slot}`
}

/**
 * The season with every weekday move applied and each touched week re-balanced.
 * Race day starts on the Target Event's real weekday, not wherever the builder's
 * day assignment put the long session.
 */
function applyMoves(
	season: Week[],
	moves: Record<string, Day>,
	raceWeekday: Day,
): PlanWeek[] {
	return season.map((week) => {
		const chips: Chip[] = []
		const tracks = week.tracks.map((track, trackIndex) => {
			const days = track.sessions.map(
				(session, slot) =>
					moves[chipKey(week.index, track.discipline, slot)] ??
					(session.kind === 'race' ? raceWeekday : session.day),
			)
			const values = rebalance(track, days)
			const sessions = track.sessions.map((session, slot) => {
				const next: Session = {
					...session,
					day: days[slot]!,
					value: values[slot]!,
					volume: formatVolume(values[slot]!, session.currency),
				}
				chips.push({
					key: chipKey(week.index, track.discipline, slot),
					session: next,
					trackIndex,
				})
				return next
			})
			return { ...track, sessions }
		})
		return {
			...week,
			tracks,
			sessions: tracks.flatMap((track) => track.sessions),
			chips: chips.sort(
				(a, b) => DAYS.indexOf(a.session.day) - DAYS.indexOf(b.session.day),
			),
		}
	})
}

/* -------------------------------------------------------------------------- */
/* The screen                                                                 */
/* -------------------------------------------------------------------------- */

export default function VariantI({
	athlete,
	event,
	events,
	seasonStartMonday,
	seasonWeeks,
}: VariantProps) {
	const tracks = useMemo(() => orderTracks(athlete.tracks), [athlete.tracks])
	const multi = tracks.length > 1

	const [eventId, setEventId] = useState(event.id)
	const [intent, setIntent] = useState<Intent>('deliberately-building')
	const [presetKey, setPresetKey] = useState(
		INTENT_PRESET['deliberately-building'],
	)
	const [anchors, setAnchors] = useState<Partial<Record<Discipline, number>>>(
		() =>
			Object.fromEntries(tracks.map((t) => [t.discipline, t.proposedAnchor])),
	)
	const [moves, setMoves] = useState<Record<string, Day>>({})
	const [selected, setSelected] = useState<string | null>(null)
	const [drag, setDrag] = useState<{ week: number; day: Day } | null>(null)
	const [editing, setEditing] = useState<string | null>(null)
	const [expanded, setExpanded] = useState<number | null>(null)
	const [shapeOpen, setShapeOpen] = useState(false)
	const [created, setCreated] = useState(false)

	const draftRef = useRef('')

	const target = events.find((candidate) => candidate.id === eventId) ?? event
	const raceWeekday = weekdayOf(target.date)

	const season = useMemo(
		() =>
			buildSeason({
				tracks: tracksFor({ ...athlete, tracks }, anchors),
				presetKey,
				trainableDays: athlete.trainableDays,
				startMonday: seasonStartMonday,
				weeks: target.weeksAway || seasonWeeks,
				raceDiscipline: target.discipline,
			}),
		[
			athlete,
			tracks,
			anchors,
			presetKey,
			seasonStartMonday,
			seasonWeeks,
			target.weeksAway,
			target.discipline,
		],
	)
	const weeks = useMemo(
		() => applyMoves(season, moves, raceWeekday),
		[season, moves, raceWeekday],
	)

	const lead = tracks[0]!
	const leadAnchor = anchors[lead.discipline] ?? lead.proposedAnchor
	const level = describeLevel(leadAnchor, lead.currency, lead.discipline)
	const sessionCount = weeks.reduce(
		(sum, week) => sum + week.sessions.length,
		0,
	)
	const preset = PRESETS.find((p) => p.key === presetKey) ?? PRESETS[0]!
	const cols = multi
		? 'grid-cols-[4.75rem_repeat(7,minmax(0,1fr))] md:grid-cols-[9rem_repeat(7,minmax(0,1fr))]'
		: 'grid-cols-[3.75rem_repeat(7,minmax(0,1fr))] md:grid-cols-[8rem_repeat(7,minmax(0,1fr))]'

	/** Which band colour a phase gets — index of its first appearance. */
	const phaseOrder = useMemo(() => {
		const order: string[] = []
		for (const week of season)
			if (!order.includes(week.phase)) order.push(week.phase)
		return order
	}, [season])

	/* ------------------------------ mutations ------------------------------- */

	function applyIntent(next: Intent) {
		setIntent(next)
		setPresetKey(INTENT_PRESET[next])
		setMoves({})
	}

	function moveChip(key: string, day: Day) {
		setMoves((prev) => ({ ...prev, [key]: day }))
	}

	function nudge(key: string, from: Day, delta: number) {
		const index = Math.min(6, Math.max(0, DAYS.indexOf(from) + delta))
		moveChip(key, DAYS[index]!)
	}

	/** Editing one week's total re-solves the Season Anchor, so the season rescales. */
	function setWeekTotal(weekIndex: number, track: WeekTrack, next: number) {
		const step = STEP[track.currency]
		if (track.targetVolume <= 0) return
		const anchor = anchors[track.discipline] ?? track.level.weeklyVolume
		const factor = Math.max(step, next) / track.targetVolume
		setAnchors((prev) => ({
			...prev,
			[track.discipline]: Math.max(step, round1(anchor * factor)),
		}))
	}

	function reset() {
		setAnchors(
			Object.fromEntries(tracks.map((t) => [t.discipline, t.proposedAnchor])),
		)
		setMoves({})
		setSelected(null)
		setExpanded(null)
		setCreated(false)
	}

	/* -------------------------------- drag ---------------------------------- */

	function startChipDrag(
		pointer: React.PointerEvent<HTMLButtonElement>,
		week: number,
		key: string,
		day: Day,
	) {
		const el = pointer.currentTarget
		const row = el.closest<HTMLElement>('[data-weekrow]')
		if (!row) return
		const cells = [...row.querySelectorAll<HTMLElement>('[data-day]')].map(
			(cell) => ({
				day: cell.dataset.day as Day,
				rect: cell.getBoundingClientRect(),
			}),
		)
		const startX = pointer.clientX
		const startY = pointer.clientY
		let moved = false
		let landing = day
		el.setPointerCapture(pointer.pointerId)

		function onMove(ev: PointerEvent) {
			if (
				!moved &&
				Math.abs(ev.clientX - startX) < 5 &&
				Math.abs(ev.clientY - startY) < 5
			)
				return
			moved = true
			const hit = cells.find(
				(cell) => ev.clientX >= cell.rect.left && ev.clientX <= cell.rect.right,
			)
			if (hit) landing = hit.day
			setDrag({ week, day: landing })
		}
		function onUp() {
			el.removeEventListener('pointermove', onMove)
			el.removeEventListener('pointerup', onUp)
			el.removeEventListener('pointercancel', onUp)
			setDrag(null)
			if (moved) {
				if (landing !== day) moveChip(key, landing)
				setSelected(key)
			} else {
				setSelected((prev) => (prev === key ? null : key))
			}
		}
		el.addEventListener('pointermove', onMove)
		el.addEventListener('pointerup', onUp)
		el.addEventListener('pointercancel', onUp)
	}

	function startTotalDrag(
		pointer: React.PointerEvent<HTMLButtonElement>,
		weekIndex: number,
		track: WeekTrack,
	) {
		const el = pointer.currentTarget
		const step = STEP[track.currency]
		const start = track.targetVolume
		const startY = pointer.clientY
		let moved = false
		el.setPointerCapture(pointer.pointerId)

		function onMove(ev: PointerEvent) {
			const dy = ev.clientY - startY
			if (!moved && Math.abs(dy) < 5) return
			moved = true
			setWeekTotal(weekIndex, track, start - Math.round(dy / 5) * step)
		}
		function onUp() {
			el.removeEventListener('pointermove', onMove)
			el.removeEventListener('pointerup', onUp)
			el.removeEventListener('pointercancel', onUp)
			if (!moved) {
				draftRef.current = String(round1(track.targetVolume))
				setEditing(`${weekIndex}-${track.discipline}`)
			}
		}
		el.addEventListener('pointermove', onMove)
		el.addEventListener('pointerup', onUp)
		el.addEventListener('pointercancel', onUp)
	}

	/* ------------------------------- render --------------------------------- */

	return (
		<div className="container max-w-6xl py-4 md:py-8">
			{/* Toolbar — stays put while the calendar scrolls */}
			<div className="bg-background sticky top-0 z-30 -mx-4 px-4 pt-2 pb-2 md:-mx-8 md:px-8">
				<div className="flex items-center gap-2">
					<Icon name="calendar" size="sm" className="text-primary shrink-0" />
					<div className="min-w-0 flex-1">
						<div className="flex items-baseline gap-2">
							<h1 className="truncate text-lg font-semibold md:text-2xl">
								{target.name}
							</h1>
							<span className="text-muted-foreground shrink-0 text-xs tabular-nums">
								{dayMonth(target.date)} · {target.priority}
							</span>
						</div>
						<p className="text-muted-foreground truncate text-xs tabular-nums">
							{level.summary} · {weeks.length} wk · {sessionCount}
						</p>
					</div>
					{created ? (
						<div
							role="status"
							className="text-primary shrink-0 text-right text-xs font-medium tabular-nums"
						>
							<span className="flex items-center gap-1">
								<Icon name="check" size="sm" />
								Plan created
							</span>
							<span className="block">
								{weeks.length} wk · {sessionCount}
							</span>
						</div>
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

				{/* The three real inputs, calendar-toolbar style */}
				<div className="mt-2 flex flex-wrap items-center gap-1 pb-1">
					{INTENTS.map((option) => (
						<button
							key={option.key}
							type="button"
							aria-pressed={intent === option.key}
							onClick={() => applyIntent(option.key)}
							className={`relative h-8 shrink-0 rounded-lg px-2 text-[11px] font-medium whitespace-nowrap after:absolute after:inset-x-0 after:-inset-y-1.5 ${
								intent === option.key
									? 'bg-primary text-primary-foreground'
									: 'bg-muted text-muted-foreground'
							}`}
						>
							{option.label}
						</button>
					))}
					<div className="relative shrink-0">
						<button
							type="button"
							aria-expanded={shapeOpen}
							onClick={() => setShapeOpen((open) => !open)}
							className="border-border text-foreground relative flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs whitespace-nowrap after:absolute after:inset-x-0 after:-inset-y-1.5"
						>
							{preset.name}
							<Icon name="chevron-down" size="sm" />
						</button>
						{shapeOpen ? (
							<ul className="bg-background border-border absolute top-9 right-0 z-40 max-h-72 w-52 overflow-y-auto rounded-xl border p-1 shadow-xl">
								{PRESETS.map((option) => (
									<li key={option.key}>
										<button
											type="button"
											aria-pressed={option.key === presetKey}
											onClick={() => {
												setPresetKey(option.key)
												setMoves({})
												setShapeOpen(false)
											}}
											className={`flex h-11 w-full items-center justify-between gap-2 rounded-lg px-2 text-left text-sm ${
												option.key === presetKey
													? 'bg-secondary text-secondary-foreground'
													: ''
											}`}
										>
											<span className="truncate">{option.name}</span>
											<span className="text-muted-foreground shrink-0 text-xs tabular-nums">
												{option.phases.length}
											</span>
										</button>
									</li>
								))}
							</ul>
						) : null}
					</div>
					{events.length > 1
						? events.map((option) => (
								<button
									key={option.id}
									type="button"
									aria-pressed={option.id === target.id}
									onClick={() => {
										setEventId(option.id)
										setMoves({})
									}}
									className={`relative h-8 shrink-0 rounded-lg px-2.5 text-xs whitespace-nowrap after:absolute after:inset-x-0 after:-inset-y-1.5 ${
										option.id === target.id
											? 'bg-secondary text-secondary-foreground'
											: 'text-muted-foreground'
									}`}
								>
									{option.name}
								</button>
							))
						: null}
					<button
						type="button"
						aria-label="Reset"
						onClick={reset}
						className="text-muted-foreground relative ml-auto flex size-8 shrink-0 items-center justify-center after:absolute after:-inset-1.5"
					>
						<Icon name="reset" size="sm" />
					</button>
				</div>

				{/* Weekday header */}
				<div className={`grid ${cols} border-border border-b`}>
					<div className="text-muted-foreground pb-1 text-[10px] tabular-nums">
						{tracks.map((t) => (
							<span key={t.discipline} className="block truncate">
								{multi ? `${TRACK_GLYPH[t.discipline]} ` : ''}
								{CURRENCY_UNIT[t.currency]}
							</span>
						))}
					</div>
					{DAYS.map((day) => (
						<div
							key={day}
							className={`text-muted-foreground pb-1 text-center text-[10px] font-medium ${
								athlete.trainableDays.length > 0 &&
								!athlete.trainableDays.includes(day)
									? 'opacity-40'
									: ''
							}`}
						>
							<span className="md:hidden">{day.slice(0, 1)}</span>
							<span className="hidden md:inline">{day}</span>
						</div>
					))}
				</div>
			</div>

			<p className="text-muted-foreground mt-1 text-[11px]">
				Drag a chip, or tap it and use arrows
			</p>

			{/* The calendar */}
			<div
				className={`mt-1 ${created ? 'ring-primary/40 rounded-lg ring-2' : ''}`}
			>
				{weeks.map((week) => {
					const phaseStart =
						week.index === 1 || weeks[week.index - 2]?.phase !== week.phase
					const band =
						PHASE_BAND[phaseOrder.indexOf(week.phase) % PHASE_BAND.length]!
					const isRace = week.role === 'race'
					const selectedHere = week.chips.some((chip) => chip.key === selected)
					const selectedChip = week.chips.find((chip) => chip.key === selected)

					return (
						<div key={week.weekKey}>
							<div
								data-weekrow={week.index}
								className={`grid ${cols} border-border/60 border-b ${
									isRace ? 'bg-primary/5' : ''
								} ${week.index === 1 ? 'bg-muted/30' : ''}`}
							>
								{/* Gutter — Phase band, week, and one editable total per track */}
								<div className="relative flex flex-col justify-center gap-0.5 py-1 pl-2">
									<span
										className={`absolute inset-y-0 left-0 w-1 ${band}`}
										aria-hidden
									/>
									<div className="flex items-baseline gap-1">
										<button
											type="button"
											aria-expanded={expanded === week.index}
											onClick={() =>
												setExpanded(expanded === week.index ? null : week.index)
											}
											className="text-muted-foreground relative text-[10px] tabular-nums after:absolute after:-inset-2"
										>
											{week.index}
											{week.index === 1 ? (
												<span className="text-primary ml-1 font-medium">
													Now
												</span>
											) : null}
											<span className="ml-1 hidden md:inline">
												{phaseStart || isRace
													? isRace
														? 'Race week'
														: week.phase
													: null}
											</span>
										</button>
									</div>
									{week.tracks.map((track) => {
										const editKey = `${week.index}-${track.discipline}`
										if (editing === editKey) {
											return (
												<input
													key={track.discipline}
													autoFocus
													type="number"
													inputMode="decimal"
													step={track.currency === 'hours' ? 0.5 : 1}
													aria-label={`${DISCIPLINE_LABELS[track.discipline]} week total`}
													defaultValue={round1(track.targetVolume)}
													onChange={(e) => {
														draftRef.current = e.target.value
													}}
													onBlur={() => {
														const next = Number.parseFloat(draftRef.current)
														if (!Number.isNaN(next))
															setWeekTotal(week.index, track, next)
														setEditing(null)
													}}
													onKeyDown={(e) => {
														if (e.key === 'Enter' || e.key === 'Escape')
															e.currentTarget.blur()
													}}
													className="border-primary bg-background h-8 w-full rounded-md border px-1 text-xs tabular-nums"
												/>
											)
										}
										return (
											<button
												key={track.discipline}
												type="button"
												onPointerDown={(e) =>
													startTotalDrag(e, week.index, track)
												}
												aria-label={`${DISCIPLINE_LABELS[track.discipline]} week total`}
												className="text-foreground relative flex touch-none items-baseline gap-0.5 text-left text-xs font-semibold tabular-nums after:absolute after:inset-x-0 after:-inset-y-1"
											>
												{multi ? (
													<span className="text-muted-foreground text-[10px] font-normal">
														{TRACK_GLYPH[track.discipline]}
													</span>
												) : null}
												{compact(track.targetVolume, track.currency)}
												<span className="text-muted-foreground text-[9px] font-normal">
													{CURRENCY_UNIT[track.currency]}
												</span>
											</button>
										)
									})}
									{phaseStart || isRace ? (
										<span className="text-muted-foreground truncate text-[9px] md:hidden">
											{isRace ? 'Race week' : week.phase}
										</span>
									) : null}
								</div>

								{/* Seven weekday cells */}
								{DAYS.map((day) => {
									const chips = week.chips.filter(
										(chip) => chip.session.day === day,
									)
									const dropping = drag?.week === week.index && drag.day === day
									return (
										<div
											key={day}
											data-day={day}
											className={`border-border/40 flex min-h-9 flex-col gap-0.5 border-l p-0.5 ${
												dropping ? 'bg-primary/15' : ''
											}`}
										>
											{isRace && day === raceWeekday ? (
												<span className="bg-foreground text-background truncate rounded px-1 text-[9px] font-semibold">
													{target.name}
												</span>
											) : null}
											{chips.map((chip) => (
												<button
													key={chip.key}
													type="button"
													aria-label={`${chip.session.title}, ${DISCIPLINE_LABELS[chip.session.discipline]}, ${chip.session.volume}, ${day}, week ${week.index}`}
													aria-pressed={selected === chip.key}
													onPointerDown={(e) =>
														startChipDrag(e, week.index, chip.key, day)
													}
													onKeyDown={(e) => {
														if (e.key === 'ArrowLeft') {
															e.preventDefault()
															nudge(chip.key, day, -1)
															setSelected(chip.key)
														} else if (e.key === 'ArrowRight') {
															e.preventDefault()
															nudge(chip.key, day, 1)
															setSelected(chip.key)
														} else if (e.key === 'Enter' || e.key === ' ') {
															e.preventDefault()
															setSelected(
																selected === chip.key ? null : chip.key,
															)
														} else if (e.key === 'Escape') {
															setSelected(null)
														}
													}}
													className={`focus-visible:ring-ring flex touch-none items-center justify-center gap-0.5 overflow-hidden rounded px-0.5 py-0.5 text-[10px] leading-tight tabular-nums focus-visible:ring-2 focus-visible:outline-none md:justify-start md:px-1.5 md:text-xs ${
														KIND_CHIP[chip.session.kind]
													} ${selected === chip.key ? 'ring-foreground ring-2' : ''}`}
												>
													{multi ? (
														<span className="shrink-0 opacity-70">
															{TRACK_GLYPH[chip.session.discipline]}
														</span>
													) : null}
													<span className="shrink-0 font-semibold">
														{compact(chip.session.value, chip.session.currency)}
													</span>
													<span className="hidden truncate md:inline">
														{ARCHETYPE_WORD[chip.session.archetype] ??
															chip.session.archetype}
													</span>
												</button>
											))}
										</div>
									)
								})}
							</div>

							{/* Non-drag fallback: a day picker aligned to the columns */}
							{selectedHere && selectedChip ? (
								<div className={`grid ${cols} border-border/60 border-b`}>
									<div className="text-muted-foreground truncate py-1 pl-2 text-[10px]">
										{selectedChip.session.title}
									</div>
									{DAYS.map((day) => (
										<button
											key={day}
											type="button"
											aria-label={`Move to ${day}`}
											aria-pressed={selectedChip.session.day === day}
											onClick={() => moveChip(selectedChip.key, day)}
											className={`border-border/40 h-11 border-l text-[10px] font-medium ${
												selectedChip.session.day === day
													? 'bg-primary text-primary-foreground'
													: 'text-muted-foreground bg-muted/40'
											}`}
										>
											{day.slice(0, 1)}
										</button>
									))}
								</div>
							) : null}

							{/* Tapping the week number opens the week's rows in words */}
							{expanded === week.index ? (
								<ul className="bg-muted/20 border-border/60 space-y-1 border-b px-2 py-2">
									{week.chips.map((chip) => (
										<li
											key={chip.key}
											className="flex items-baseline gap-2 text-xs tabular-nums"
										>
											<span className="text-muted-foreground w-7 shrink-0">
												{chip.session.day}
											</span>
											<span className="text-muted-foreground w-9 shrink-0 truncate">
												{DISCIPLINE_LABELS[chip.session.discipline]}
											</span>
											<span className="min-w-0 flex-1 truncate">
												{chip.session.title}
											</span>
											<span className="shrink-0 font-semibold">
												≈ {chip.session.volume}
											</span>
											<span className="text-muted-foreground w-24 shrink-0 truncate text-right">
												{chip.session.intensity}
											</span>
										</li>
									))}
									<li className="text-muted-foreground flex flex-wrap gap-x-4 pt-1 text-[10px] tabular-nums">
										<span>
											{week.role === 'race'
												? 'Race'
												: WEEK_ROLE_LABELS[week.role]}
										</span>
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
					)
				})}
			</div>
		</div>
	)
}
