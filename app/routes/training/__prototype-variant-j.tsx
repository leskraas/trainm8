/**
 * PROTOTYPE — variant J, "merged": I's calendar, A's header, H's palette, B's words.
 *
 * The recommended synthesis of the nine measured variants:
 *
 * - **Body from I.** A real weekday×week grid holding the whole season is the
 *   largest thing on screen, and it *is* the editing surface — no preview→approve
 *   split. Chips are sessions, draggable between weekdays; each week's gutter
 *   carries one total per Training Track, never a sum across them.
 * - **I's one flaw fixed.** I's instruction sentence ("Drag a chip, or tap it and
 *   use arrows") is gone. Drag is discoverable by looking: a ⠿ grip glyph on every
 *   chip, `cursor-grab`, a lift on press, and the landing day highlighted.
 * - **Header from A.** Target Event as a settled fact, a 3-way segmented intent,
 *   one oversized Season Anchor per Training Track sized to its own content (A
 *   clipped `182.8`), and a scrollable chips row for everything derived. No figure
 *   reads as a cross-track total (A's Plan Preview printed a lead-track volume next
 *   to an all-tracks session count).
 * - **Palette from H.** ⌘K over the calendar, not a separate screen. Same grammar
 *   (`30`, `4x`, `18w`, `injury`, `gentle`, `swim 5 bike 200`, `save`), every
 *   command also a clickable row.
 * - **Words from B.** One question on the whole screen; everything else is a
 *   number, a unit, a weekday, a phase name or a domain term.
 *
 * Named UI-convention exceptions (docs/design/ui-conventions.md §2.6): the Season
 * Anchor field is an oversized numeric control (font ≫ 16px, tap target ≫ 44px);
 * calendar chips, week totals, intent segments and the chips row are custom
 * controls carrying the hit-area extension by hand.
 *
 * THROWAWAY — do not ship.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
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
	type PrototypeEvent,
	type PrototypeTrack,
	type Session,
	type SessionKind,
	type VariantProps,
	type Week,
	type WeekRole,
	type WeekTrack,
} from './__prototype-data.ts'
import {
	PlanDragArea,
	useChipDrag,
	useDayCell,
	useMoveAnnouncer,
	type ChipDragAnnouncements,
} from './__prototype-dnd.tsx'

/**
 * The Week Role, athlete-facing. `app/utils/labels.ts` has no `race` role — the
 * prototype's WeekRole is wider than the shipped one — so this variant owns the
 * map rather than half-import it.
 */
const ROLE_LABEL: Record<WeekRole, string> = {
	loading: 'Loading',
	recovery: 'Recovery',
	taper: 'Taper',
	race: 'Race week',
}

/* -------------------------------------------------------------------------- */
/* Vocabulary                                                                 */
/* -------------------------------------------------------------------------- */

const MS_PER_WEEK = 604_800_000

/** The Periodization Preset an intent implies, until a shape is named. */
const INTENT_PRESET: Record<Intent, string> = {
	'first-season': 'gentle-ramp',
	'returning-from-injury': 'back-from-injury',
	'deliberately-building': DEFAULT_PRESET_KEY,
}

/** The rounding grain per Volume Currency — whole km, whole 5 min, whole 5 TSS. */
const STEP: Record<Currency, number> = { km: 1, hours: 5 / 60, tss: 5 }

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

const DISCIPLINE_TOKENS: Record<string, Discipline> = {
	run: 'run',
	bike: 'bike',
	swim: 'swim',
}

const INTENT_TOKENS: Record<string, Intent> = {
	first: 'first-season',
	injury: 'returning-from-injury',
	building: 'deliberately-building',
}

/** One token per Periodization Preset — never a token an intent already owns. */
const PRESET_TOKENS: Record<string, string> = {
	classic: 'classic-build',
	mostly: 'mostly-easy',
	speed: 'speed-first',
	blocks: 'focused-blocks',
	three: 'three-up-one-down',
	gentle: 'gentle-ramp',
	back: 'back-from-injury',
	sharp: 'short-and-sharp',
	peaks: 'two-peaks',
}

/* -------------------------------------------------------------------------- */
/* Pure helpers                                                               */
/* -------------------------------------------------------------------------- */

function round1(n: number): number {
	return Math.round(n * 10) / 10
}

function clamp(value: number, low: number, high: number): number {
	return Math.max(low, Math.min(high, value))
}

function shiftWeeks(iso: string, weeks: number): string {
	return new Date(Date.parse(`${iso}T00:00:00Z`) + weeks * MS_PER_WEEK)
		.toISOString()
		.slice(0, 10)
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

/**
 * Dates are assembled by hand, not through `toLocaleDateString`: Node's ICU
 * prints `Fri, 30 Oct` where the browser prints `Fri 30 Oct`, and that comma is
 * a hydration mismatch.
 */
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

function presetName(key: string): string {
	return PRESETS.find((preset) => preset.key === key)?.name ?? key
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
 * the stacked day gives volume back to the days under the cap. Every session
 * stays a whole unit of its currency and the parts still sum to the whole.
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

/**
 * `4x` is the athlete saying they can train four days — so it may raise the day
 * count above their stored Training Availability, keeping their own days and
 * spreading the extras through the rest of the week.
 */
function spread(pool: Day[], count: number): Day[] {
	if (count >= pool.length) return pool
	if (count <= 1) return pool.slice(-1)
	const picked = new Set<Day>()
	for (let i = 0; i < count; i++) {
		picked.add(pool[Math.round((i * (pool.length - 1)) / (count - 1))]!)
	}
	return pool.filter((day) => picked.has(day))
}

function pickDays(base: Day[], count: number): Day[] {
	const pool = base.length > 0 ? base : DAYS
	if (count <= pool.length) return spread(pool, count)
	const extra = DAYS.filter((day) => !pool.includes(day))
	const added = spread(extra, count - pool.length)
	return DAYS.filter((day) => pool.includes(day) || added.includes(day))
}

/* -------------------------------------------------------------------------- */
/* The token language (H)                                                     */
/* -------------------------------------------------------------------------- */

type Token =
	| { kind: 'anchor'; discipline: Discipline; value: number }
	| { kind: 'track'; discipline: Discipline }
	| { kind: 'days'; value: number }
	| { kind: 'weeks'; value: number }
	| { kind: 'intent'; intent: Intent }
	| { kind: 'preset'; presetKey: string }
	| { kind: 'event'; event: PrototypeEvent }
	| { kind: 'save' }
	| { kind: 'unknown'; text: string }

/**
 * Parse a whole line, left to right. A discipline token moves the cursor to that
 * Training Track, so `swim 5 bike 200` sets two anchors and a bare `30` lands on
 * the lead track.
 */
function parseLine(
	line: string,
	context: { tracks: PrototypeTrack[]; events: PrototypeEvent[] },
): Token[] {
	const words = line.trim().toLowerCase().split(/\s+/).filter(Boolean)
	let focus = context.tracks[0]?.discipline ?? 'run'
	const tokens: Token[] = []

	for (const word of words) {
		const discipline = DISCIPLINE_TOKENS[word]
		if (discipline) {
			focus = discipline
			tokens.push({ kind: 'track', discipline })
			continue
		}
		if (/^\d+(\.\d+)?$/.test(word)) {
			tokens.push({ kind: 'anchor', discipline: focus, value: Number(word) })
			continue
		}
		const days = /^(\d+)x$/.exec(word)
		if (days) {
			tokens.push({ kind: 'days', value: clamp(Number(days[1]), 1, 7) })
			continue
		}
		const weeks = /^(\d+)w$/.exec(word)
		if (weeks) {
			tokens.push({ kind: 'weeks', value: clamp(Number(weeks[1]), 6, 30) })
			continue
		}
		const intent = INTENT_TOKENS[word]
		if (intent) {
			tokens.push({ kind: 'intent', intent })
			continue
		}
		const preset = PRESET_TOKENS[word]
		if (preset) {
			tokens.push({ kind: 'preset', presetKey: preset })
			continue
		}
		if (word === 'save') {
			tokens.push({ kind: 'save' })
			continue
		}
		const event =
			word.length >= 3
				? context.events.find((candidate) =>
						candidate.name.toLowerCase().includes(word),
					)
				: undefined
		if (event) {
			tokens.push({ kind: 'event', event })
			continue
		}
		tokens.push({ kind: 'unknown', text: word })
	}
	return tokens
}

/** What a token reads as once understood — numbers and vocabulary only. */
function tokenChip(token: Token, tracks: PrototypeTrack[]): string {
	switch (token.kind) {
		case 'anchor': {
			const track = tracks.find((t) => t.discipline === token.discipline)
			return `${DISCIPLINE_LABELS[token.discipline]} ${token.value} ${ANCHOR_UNIT[track?.currency ?? 'km']}`
		}
		case 'track':
			return DISCIPLINE_LABELS[token.discipline]
		case 'days':
			return `${token.value}×/wk`
		case 'weeks':
			return `${token.value}w`
		case 'intent':
			return INTENTS.find((i) => i.key === token.intent)?.label ?? token.intent
		case 'preset':
			return presetName(token.presetKey)
		case 'event':
			return token.event.name
		case 'save':
			return 'Plan Outline'
		case 'unknown':
			return `?${token.text}`
	}
}

type Row = { id: string; token: string; effect: string; line: string }

/* -------------------------------------------------------------------------- */
/* Sparkline (A)                                                              */
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
			return `${round1(x)},${round1(20 - value * 18)}`
		})
		.join(' ')
	return (
		<svg
			viewBox="0 0 100 20"
			preserveAspectRatio="none"
			aria-hidden="true"
			className={cn('h-3 w-10', className)}
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

const chipClass =
	'relative inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-2.5 text-xs whitespace-nowrap tabular-nums after:absolute after:inset-x-0 after:-inset-y-2 hover:bg-muted aria-expanded:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30 outline-none'

/* -------------------------------------------------------------------------- */
/* The calendar's moving parts                                                */
/* -------------------------------------------------------------------------- */

type ChipIndex = Map<string, { chip: Chip; week: PlanWeek }>

/**
 * The sentence for a committed move, whichever path committed it — a drop, an
 * arrow key, or the day picker. Its second half is the one thing a drag library
 * cannot know: a move adds no volume, it re-sizes the sessions on the crowded
 * day against the long-session cap while the week total holds. A sighted athlete
 * watches the numbers change; a screen-reader athlete has to be told.
 */
function describeMove(
	index: ChipIndex,
	key: string,
	day: Day,
): string | undefined {
	const found = index.get(key)
	if (!found) return undefined
	const { chip, week } = found
	const track = week.tracks[chip.trackIndex]
	const total = track
		? `, ${DISCIPLINE_LABELS[track.discipline]} week total unchanged at ${formatVolume(track.targetVolume, track.currency)}`
		: ''
	return `${chip.session.title} moved to ${day}, week ${week.index}${total}. Sessions on ${day} re-sized to the long-session cap.`
}

/**
 * One session chip. Draggable through `useChipDrag`; the arrow keys stay as the
 * non-drag fallback and step aside while a dnd-kit keyboard drag is in flight,
 * so the two models never both handle one press.
 */
function CalendarChip({
	chip,
	weekIndex,
	index,
	multi,
	selected,
	onSelect,
	onNudge,
}: {
	chip: Chip
	weekIndex: number
	index: number
	multi: boolean
	selected: boolean
	onSelect: () => void
	onNudge: (delta: number) => void
}) {
	const day = chip.session.day
	const { ref, isDragging } = useChipDrag({
		chipKey: chip.key,
		weekIndex,
		day,
		index,
	})
	return (
		<button
			ref={ref}
			type="button"
			aria-label={`${chip.session.title}, ${DISCIPLINE_LABELS[chip.session.discipline]}, ${chip.session.volume}, ${day}, week ${weekIndex}`}
			// Selection speaks through `aria-current`, not `aria-pressed`: dnd-kit's
			// Accessibility plugin writes `aria-pressed` to the *dragging* state with
			// `setAttribute` on every effect pass and would clobber ours. Of the two
			// meanings, "picked up" is the one a button's pressed state actually
			// describes, and "this is the chip the day picker acts on" is exactly
			// `aria-current`'s "current item within a set".
			aria-current={selected}
			onClick={onSelect}
			onKeyDown={(e) => {
				// While dragging, the keys belong to dnd-kit's KeyboardSensor.
				if (isDragging) return
				if (e.key === 'ArrowLeft') {
					e.preventDefault()
					onNudge(-1)
				} else if (e.key === 'ArrowRight') {
					e.preventDefault()
					onNudge(1)
				} else if (e.key === 'Escape') {
					onSelect()
				}
			}}
			className={cn(
				'focus-visible:ring-ring flex cursor-grab items-center gap-0.5 overflow-hidden rounded px-0.5 py-0.5 text-[10px] leading-tight tabular-nums transition-transform focus-visible:ring-2 focus-visible:outline-none active:scale-[1.06] active:cursor-grabbing md:px-1 md:text-xs',
				KIND_CHIP[chip.session.kind],
				selected && 'ring-foreground ring-2',
			)}
		>
			{/* The grip: drag is discoverable by looking, not by reading. */}
			<span aria-hidden className="shrink-0 text-[8px] leading-none opacity-55">
				⠿
			</span>
			{multi ? (
				<span className="shrink-0 opacity-70">
					{TRACK_GLYPH[chip.session.discipline]}
				</span>
			) : null}
			<span className="shrink-0 font-semibold">
				{compact(chip.session.value, chip.session.currency)}
			</span>
			<span className="hidden truncate md:inline">
				{ARCHETYPE_WORD[chip.session.archetype] ?? chip.session.archetype}
			</span>
		</button>
	)
}

/** One weekday cell: a drop target that highlights where a chip would land. */
function DayCell({
	weekIndex,
	day,
	chips,
	multi,
	raceLabel,
	selected,
	onSelect,
	onNudge,
}: {
	weekIndex: number
	day: Day
	chips: Chip[]
	multi: boolean
	raceLabel: string | null
	selected: string | null
	onSelect: (key: string) => void
	onNudge: (chip: Chip, delta: number) => void
}) {
	const { ref, isLanding } = useDayCell({ weekIndex, day })
	return (
		<div
			ref={ref}
			data-day={day}
			className={cn(
				'border-border/40 flex min-h-9 flex-col gap-0.5 border-l p-0.5',
				isLanding && 'bg-primary/15 ring-primary/50 ring-1',
			)}
		>
			{raceLabel ? (
				<span className="bg-foreground text-background truncate rounded px-1 text-[9px] font-semibold">
					{raceLabel}
				</span>
			) : null}
			{chips.map((chip, index) => (
				<CalendarChip
					key={chip.key}
					chip={chip}
					weekIndex={weekIndex}
					index={index}
					multi={multi}
					selected={selected === chip.key}
					onSelect={() => onSelect(chip.key)}
					onNudge={(delta) => onNudge(chip, delta)}
				/>
			))}
		</div>
	)
}

/**
 * One week total, as a scrubbable number field.
 *
 * The gesture it replaces was not drag-and-drop — no source, no target, no drop
 * — so it is not a dnd-kit concern. It is a number you can type, arrow, or drag
 * vertically to scrub, rounding honestly to the Volume Currency's grain (whole
 * km, whole 5 min, whole 5 TSS) and never to a finer one. Deliberately not a
 * slider: a week's volume has no natural maximum, so there is no track to sit on.
 *
 * The readout is a button rather than a permanent `<input>` because an `h-8`
 * field per Training Track would inflate every week row — three of them for a
 * triathlete.
 */
function WeekTotalField({
	track,
	multi,
	onCommit,
}: {
	track: WeekTrack
	multi: boolean
	onCommit: (next: number) => void
}) {
	const step = STEP[track.currency]
	const [typing, setTyping] = useState(false)
	const draftRef = useRef('')
	const scrubbedRef = useRef(false)

	/** Honest rounding: the number committed is on the currency's grain. */
	function snap(value: number): number {
		return Math.max(step, Math.round(value / step) * step)
	}

	if (typing) {
		return (
			<input
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
					if (!Number.isNaN(next)) onCommit(snap(next))
					setTyping(false)
				}}
				onKeyDown={(e) => {
					if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur()
				}}
				className="border-primary bg-background h-8 w-full rounded-md border px-1 text-xs tabular-nums"
			/>
		)
	}

	return (
		<button
			type="button"
			aria-label={`${DISCIPLINE_LABELS[track.discipline]} week total`}
			onPointerDown={(e) => {
				// Touch taps through to the keypad: a finger that grabs this control
				// must still be able to scroll a 20-row calendar, which is what the
				// old `touch-none` prevented.
				if (e.pointerType === 'touch') return
				const el = e.currentTarget
				const startY = e.clientY
				const start = track.targetVolume
				let moved = false
				el.setPointerCapture(e.pointerId)
				function onMove(ev: PointerEvent) {
					const dy = ev.clientY - startY
					if (!moved && Math.abs(dy) < 5) return
					moved = true
					onCommit(snap(start - Math.round(dy / 5) * step))
				}
				function onUp() {
					el.removeEventListener('pointermove', onMove)
					el.removeEventListener('pointerup', onUp)
					el.removeEventListener('pointercancel', onUp)
					scrubbedRef.current = moved
				}
				el.addEventListener('pointermove', onMove)
				el.addEventListener('pointerup', onUp)
				el.addEventListener('pointercancel', onUp)
			}}
			onClick={() => {
				if (scrubbedRef.current) {
					scrubbedRef.current = false
					return
				}
				draftRef.current = String(round1(track.targetVolume))
				setTyping(true)
			}}
			onKeyDown={(e) => {
				const grain = e.shiftKey ? step * 5 : step
				if (e.key === 'ArrowUp') {
					e.preventDefault()
					onCommit(snap(track.targetVolume + grain))
				} else if (e.key === 'ArrowDown') {
					e.preventDefault()
					onCommit(snap(track.targetVolume - grain))
				}
			}}
			className="text-foreground relative flex cursor-ns-resize items-baseline gap-0.5 text-left text-xs font-semibold tabular-nums after:absolute after:inset-x-0 after:-inset-y-1"
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
			{/* The scrub affordance: a glyph, not a sentence. */}
			<span
				aria-hidden
				className="text-muted-foreground/70 shrink-0 text-[8px] leading-none"
			>
				⇕
			</span>
		</button>
	)
}

/**
 * One week: the gutter, seven day cells, and the two rows that can open under
 * them. It is a component rather than inline JSX because the non-drag move paths
 * — the arrow-key nudge and the day picker — announce through `useMoveAnnouncer`,
 * which only exists inside the drag area.
 */
function WeekRow({
	week,
	cols,
	multi,
	band,
	phaseStart,
	raceWeekday,
	targetName,
	chipIndex,
	selected,
	onSelect,
	expanded,
	onToggleExpanded,
	onMoveChip,
	onSetWeekTotal,
}: {
	week: PlanWeek
	cols: string
	multi: boolean
	band: string
	phaseStart: boolean
	raceWeekday: Day
	targetName: string
	chipIndex: ChipIndex
	selected: string | null
	onSelect: (key: string | null) => void
	expanded: boolean
	onToggleExpanded: () => void
	onMoveChip: (key: string, day: Day) => void
	onSetWeekTotal: (track: WeekTrack, next: number) => void
}) {
	const announce = useMoveAnnouncer()
	const isRace = week.role === 'race'
	const selectedChip = week.chips.find((chip) => chip.key === selected)

	/** Commit a move that did not come from a drag, and say so out loud. */
	function commitMove(key: string, day: Day) {
		onMoveChip(key, day)
		const message = describeMove(chipIndex, key, day)
		if (message) announce(message)
	}

	return (
		<div>
			<div
				data-weekrow={week.index}
				className={cn(
					`grid ${cols} border-border/60 border-b`,
					isRace && 'bg-primary/5',
					week.index === 1 && 'bg-muted/30',
				)}
			>
				{/* Gutter — Phase band, week index, one total per track */}
				<div className="relative flex flex-col justify-center gap-0.5 py-0.5 pl-2">
					<span
						className={`absolute inset-y-0 left-0 w-1 ${band}`}
						aria-hidden
					/>
					<button
						type="button"
						aria-expanded={expanded}
						aria-label={`Week ${week.index}, ${week.phase}`}
						onClick={onToggleExpanded}
						className="text-muted-foreground relative block truncate text-left text-[9px] leading-tight tabular-nums after:absolute after:inset-x-0 after:-inset-y-1 md:text-[10px]"
					>
						{week.index}
						{week.index === 1 ? (
							<span className="text-primary ml-1 font-medium">Now</span>
						) : null}
						<span className="ml-1">
							{isRace
								? 'Race week'
								: phaseStart
									? week.phase
									: ROLE_LABEL[week.role]}
						</span>
					</button>
					{week.tracks.map((track) => (
						<WeekTotalField
							key={track.discipline}
							track={track}
							multi={multi}
							onCommit={(next) => onSetWeekTotal(track, next)}
						/>
					))}
				</div>

				{/* Seven weekday cells */}
				{DAYS.map((day) => (
					<DayCell
						key={day}
						weekIndex={week.index}
						day={day}
						multi={multi}
						chips={week.chips.filter((chip) => chip.session.day === day)}
						raceLabel={isRace && day === raceWeekday ? targetName : null}
						selected={selected}
						onSelect={(key) => onSelect(selected === key ? null : key)}
						onNudge={(chip, delta) => {
							const next =
								DAYS[clamp(DAYS.indexOf(chip.session.day) + delta, 0, 6)]!
							onSelect(chip.key)
							if (next !== chip.session.day) commitMove(chip.key, next)
						}}
					/>
				))}
			</div>

			{/* Non-drag path: a day picker aligned to the columns. */}
			{selectedChip ? (
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
							onClick={() => commitMove(selectedChip.key, day)}
							className={cn(
								'border-border/40 h-11 border-l text-[10px] font-medium',
								selectedChip.session.day === day
									? 'bg-primary text-primary-foreground'
									: 'text-muted-foreground bg-muted/40',
							)}
						>
							{day.slice(0, 1)}
						</button>
					))}
				</div>
			) : null}

			{/* Tapping the week index opens its rows. */}
			{expanded ? (
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
						<span>{ROLE_LABEL[week.role]}</span>
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
}

/* -------------------------------------------------------------------------- */
/* The screen                                                                 */
/* -------------------------------------------------------------------------- */

export default function VariantJ({
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
	const [presetOverride, setPresetOverride] = useState<string | null>(null)
	const [startOffset, setStartOffset] = useState(0)
	const [weeksOverride, setWeeksOverride] = useState<number | null>(null)
	const [daysOverride, setDaysOverride] = useState<number | null>(null)
	const [anchors, setAnchors] = useState<Partial<Record<Discipline, number>>>(
		() =>
			Object.fromEntries(tracks.map((t) => [t.discipline, t.proposedAnchor])),
	)
	const [anchorText, setAnchorText] = useState<
		Partial<Record<Discipline, string>>
	>({})
	const [moves, setMoves] = useState<Record<string, Day>>({})
	const [selected, setSelected] = useState<string | null>(null)
	const [expanded, setExpanded] = useState<number | null>(null)
	const [created, setCreated] = useState(false)

	const [paletteOpen, setPaletteOpen] = useState(false)
	const [line, setLine] = useState('')
	const [cursor, setCursor] = useState(0)

	const listRef = useRef<HTMLUListElement>(null)
	const paletteRef = useRef<HTMLInputElement>(null)

	const target = events.find((candidate) => candidate.id === eventId) ?? event
	const raceWeekday = weekdayOf(target.date)
	const presetKey = presetOverride ?? INTENT_PRESET[intent]
	const preset = PRESETS.find((p) => p.key === presetKey) ?? PRESETS[0]!
	const startMonday = shiftWeeks(seasonStartMonday, startOffset)
	const trainableDays = useMemo(
		() =>
			daysOverride == null
				? athlete.trainableDays
				: pickDays(athlete.trainableDays, daysOverride),
		[athlete.trainableDays, daysOverride],
	)

	const season = useMemo(
		() =>
			buildSeason({
				tracks: tracksFor({ ...athlete, tracks }, anchors),
				presetKey,
				trainableDays,
				startMonday,
				weeks: weeksOverride ?? target.weeksAway ?? seasonWeeks,
				raceDiscipline: target.discipline,
			}),
		[
			athlete,
			tracks,
			anchors,
			presetKey,
			trainableDays,
			startMonday,
			weeksOverride,
			seasonWeeks,
			target.weeksAway,
			target.discipline,
		],
	)
	const weeks = useMemo(
		() => applyMoves(season, moves, raceWeekday),
		[season, moves, raceWeekday],
	)

	const sessionCount = weeks.reduce(
		(sum, week) => sum + week.sessions.length,
		0,
	)
	const raceMonday = shiftWeeks(startMonday, Math.max(0, weeks.length - 1))

	/** One season figure per Training Track — never one that reads as a total. */
	const trackTotals = tracks.map((track) => ({
		discipline: track.discipline,
		currency: track.currency,
		total: weeks.reduce(
			(sum, week) =>
				sum +
				(week.tracks.find((t) => t.discipline === track.discipline)
					?.targetVolume ?? 0),
			0,
		),
	}))

	const cols = multi
		? 'grid-cols-[4.75rem_repeat(7,minmax(0,1fr))] md:grid-cols-[9rem_repeat(7,minmax(0,1fr))]'
		: 'grid-cols-[4.25rem_repeat(7,minmax(0,1fr))] md:grid-cols-[8rem_repeat(7,minmax(0,1fr))]'

	const phaseOrder = useMemo(() => {
		const order: string[] = []
		for (const week of season)
			if (!order.includes(week.phase)) order.push(week.phase)
		return order
	}, [season])

	/* ------------------------------ mutations ------------------------------- */

	function applyIntent(next: Intent) {
		setIntent(next)
		setPresetOverride(null)
		setMoves({})
		setCreated(false)
	}

	function setAnchor(discipline: Discipline, value: number) {
		setAnchors((prev) => ({ ...prev, [discipline]: value }))
		setAnchorText((prev) => {
			const next = { ...prev }
			delete next[discipline]
			return next
		})
		setCreated(false)
	}

	function moveChip(key: string, day: Day) {
		setMoves((prev) => ({ ...prev, [key]: day }))
	}

	/** Editing one week's total re-solves that track's Season Anchor. */
	function setWeekTotal(track: WeekTrack, next: number) {
		const step = STEP[track.currency]
		if (track.targetVolume <= 0) return
		const anchor = anchors[track.discipline] ?? track.level.weeklyVolume
		const factor = Math.max(step, next) / track.targetVolume
		setAnchor(track.discipline, Math.max(step, round1(anchor * factor)))
	}

	function reset() {
		setAnchors(
			Object.fromEntries(tracks.map((t) => [t.discipline, t.proposedAnchor])),
		)
		setAnchorText({})
		setPresetOverride(null)
		setStartOffset(0)
		setWeeksOverride(null)
		setDaysOverride(null)
		setMoves({})
		setSelected(null)
		setExpanded(null)
		setCreated(false)
	}

	/* ------------------------------ announcing ------------------------------ */

	/** Every chip on the season, by key, so an announcement can name one. */
	const chipIndex = useMemo(() => {
		const index = new Map<string, { chip: Chip; week: PlanWeek }>()
		for (const week of weeks) {
			for (const chip of week.chips) index.set(chip.key, { chip, week })
		}
		return index
	}, [weeks])

	const dragAnnouncements = useMemo<ChipDragAnnouncements>(
		() => ({
			pickup: ({ chipKey, fromDay, weekIndex }) => {
				const chip = chipIndex.get(chipKey)?.chip
				return chip
					? `Picked up ${chip.session.title}, ${chip.session.volume}, ${fromDay}, week ${weekIndex}.`
					: undefined
			},
			over: ({ toDay, weekIndex }) =>
				toDay ? `Over ${toDay}, week ${weekIndex}.` : undefined,
			drop: ({ chipKey, fromDay, weekIndex, toDay, moved }) => {
				if (moved && toDay) return describeMove(chipIndex, chipKey, toDay)
				const chip = chipIndex.get(chipKey)?.chip
				return chip
					? `${chip.session.title} left on ${fromDay}, week ${weekIndex}.`
					: undefined
			},
			cancel: ({ chipKey, fromDay, weekIndex }) => {
				const chip = chipIndex.get(chipKey)?.chip
				return chip
					? `Cancelled. ${chip.session.title} stays on ${fromDay}, week ${weekIndex}.`
					: undefined
			},
		}),
		[chipIndex],
	)

	/* ------------------------------- palette -------------------------------- */

	useEffect(() => {
		function onKeyDown(ev: KeyboardEvent) {
			if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'k') {
				ev.preventDefault()
				setPaletteOpen((open) => !open)
				setLine('')
				setCursor(0)
			}
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [])

	const tokens = useMemo(
		() => parseLine(line, { tracks, events }),
		[line, tracks, events],
	)
	const understood = tokens.filter((token) => token.kind !== 'unknown')

	const vocabulary = useMemo<Row[]>(() => {
		const rows: Row[] = []
		for (const track of tracks) {
			const token = multi
				? `${track.discipline} ${track.proposedAnchor}`
				: `${track.proposedAnchor}`
			rows.push({
				id: `anchor-${track.discipline}`,
				token,
				effect: `≈ ${track.proposedAnchor} ${ANCHOR_UNIT[track.currency]} · ${
					describeLevel(track.proposedAnchor, track.currency, track.discipline)
						.summary
				}`,
				line: token,
			})
		}
		const floor = clamp(Math.round(athlete.medianSessionsPerWeek) - 1, 2, 4)
		for (let n = floor; n <= Math.min(7, floor + 3); n++) {
			rows.push({
				id: `days-${n}`,
				token: `${n}x`,
				effect: `${n}×/wk`,
				line: `${n}x`,
			})
		}
		for (const raw of [target.weeksAway, 12, 18, 24]) {
			const value = clamp(raw, 6, 30)
			if (rows.some((row) => row.id === `weeks-${value}`)) continue
			rows.push({
				id: `weeks-${value}`,
				token: `${value}w`,
				effect: `${value} wk`,
				line: `${value}w`,
			})
		}
		for (const [token, key] of Object.entries(INTENT_TOKENS)) {
			rows.push({
				id: `intent-${token}`,
				token,
				effect: `${INTENTS.find((i) => i.key === key)?.label ?? ''} · ${presetName(INTENT_PRESET[key])}`,
				line: token,
			})
		}
		for (const [token, key] of Object.entries(PRESET_TOKENS)) {
			const option = PRESETS.find((p) => p.key === key)
			rows.push({
				id: `preset-${token}`,
				token,
				effect: `${presetName(key)} · ${option?.phases.map((phase) => `${phase.name} ${phase.weeks}`).join(' · ') ?? ''}`,
				line: token,
			})
		}
		for (const candidate of events) {
			const word =
				candidate.name.toLowerCase().split(/\s+/)[0] ?? candidate.name
			rows.push({
				id: `event-${candidate.id}`,
				token: word,
				effect: `${candidate.name} · ${dayMonth(candidate.date)} · ${candidate.priority}`,
				line: word,
			})
		}
		rows.push({
			id: 'save',
			token: 'save',
			effect: `Plan Outline · ${weeks.length} wk · ${sessionCount}`,
			line: 'save',
		})
		return rows
	}, [
		tracks,
		multi,
		athlete.medianSessionsPerWeek,
		target.weeksAway,
		events,
		weeks.length,
		sessionCount,
	])

	const word = line.trim().split(/\s+/).at(-1)?.toLowerCase() ?? ''
	const filtered = word
		? vocabulary.filter(
				(row) =>
					row.token.startsWith(word) || row.effect.toLowerCase().includes(word),
			)
		: vocabulary
	const rows: Row[] =
		understood.length > 0
			? [
					{
						id: 'apply',
						token: '⏎',
						effect: understood
							.map((token) => tokenChip(token, tracks))
							.join(' · '),
						line: line.trim(),
					},
					...filtered.filter((row) => row.line !== line.trim()),
				]
			: filtered
	const active = Math.min(cursor, Math.max(0, rows.length - 1))

	function moveCursor(delta: number) {
		if (rows.length === 0) return
		const next = (active + delta + rows.length) % rows.length
		setCursor(next)
		listRef.current
			?.querySelector<HTMLElement>(`[data-row="${next}"]`)
			?.scrollIntoView({ block: 'nearest' })
	}

	function run(text: string) {
		const parsed = parseLine(text, { tracks, events })
		if (parsed.length === 0 || parsed.every((t) => t.kind === 'unknown')) return
		let sawSave = false
		for (const token of parsed) {
			switch (token.kind) {
				case 'anchor':
					setAnchor(token.discipline, token.value)
					break
				case 'days':
					setDaysOverride(token.value)
					break
				case 'weeks':
					setWeeksOverride(token.value)
					break
				case 'intent':
					applyIntent(token.intent)
					break
				case 'preset':
					setPresetOverride(token.presetKey)
					setMoves({})
					break
				case 'event':
					setEventId(token.event.id)
					setWeeksOverride(null)
					setMoves({})
					break
				case 'save':
					sawSave = true
					break
				default:
					break
			}
		}
		setLine('')
		setCursor(0)
		if (sawSave) {
			setCreated(true)
			setPaletteOpen(false)
		} else {
			// A clicked row moved focus to the row, so Esc would miss the input.
			paletteRef.current?.focus()
		}
	}

	/* ------------------------------- render --------------------------------- */

	// `pb-16` keeps the last week clear of the prototype switcher pill.
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

			{/* The one question on the screen (B), then the numbers. */}
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
										htmlFor={`anchor-${track.discipline}`}
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
									id={`anchor-${track.discipline}`}
									type="number"
									inputMode="decimal"
									min={0}
									step={track.currency === 'hours' ? 0.5 : 1}
									value={text}
									// A's measured bug: a fixed 94 px field clipped `182.8`.
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
						<Sparkline load={preset.weeklyLoad} className="text-primary" />
						{preset.name}
						<Icon
							name="chevron-down"
							className="text-muted-foreground size-3"
						/>
					</PopoverTrigger>
					<PopoverContent align="start" className="w-80 gap-2">
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
											setMoves({})
											setCreated(false)
										}}
										aria-current={option.key === presetKey}
										className={cn(
											'hover:bg-muted flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm',
											option.key === presetKey && 'bg-muted font-medium',
										)}
									>
										<Sparkline
											load={option.weeklyLoad}
											className="text-primary w-14 shrink-0"
										/>
										<span className="flex-1 truncate">{option.name}</span>
										<span className="text-muted-foreground shrink-0 text-xs tabular-nums">
											{option.phases.length}
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
						{dayMonth(startMonday)}
						<Icon
							name="chevron-down"
							className="text-muted-foreground size-3"
						/>
					</PopoverTrigger>
					<PopoverContent align="start" className="w-60 gap-2">
						<PopoverTitle className="text-sm">Plan Start Week</PopoverTitle>
						<div className="-mx-1">
							{[0, 1, 2, 3].map((offset) => (
								<button
									key={offset}
									type="button"
									onClick={() => {
										setStartOffset(offset)
										setCreated(false)
									}}
									aria-current={offset === startOffset}
									className={cn(
										'hover:bg-muted flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm tabular-nums',
										offset === startOffset && 'bg-muted font-medium',
									)}
								>
									{weekdayDate(shiftWeeks(seasonStartMonday, offset))}
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
						{preset.phases.map((phase) => phase.weeks).join('·')}
						<span className="text-muted-foreground">
							{preset.phases.length} Phases
						</span>
						<Icon
							name="chevron-down"
							className="text-muted-foreground size-3"
						/>
					</PopoverTrigger>
					<PopoverContent align="start" className="w-60 gap-2">
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

				{events.length > 1 ? (
					<Popover>
						<PopoverTrigger className={chipClass}>
							{target.name}
							<Icon
								name="chevron-down"
								className="text-muted-foreground size-3"
							/>
						</PopoverTrigger>
						<PopoverContent align="start" className="w-72 gap-2">
							<PopoverTitle className="text-sm">Target Event</PopoverTitle>
							<div className="-mx-1">
								{events.map((option) => (
									<button
										key={option.id}
										type="button"
										aria-current={option.id === target.id}
										onClick={() => {
											setEventId(option.id)
											setWeeksOverride(null)
											setMoves({})
											setCreated(false)
										}}
										className={cn(
											'hover:bg-muted flex w-full items-baseline justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm',
											option.id === target.id && 'bg-muted font-medium',
										)}
									>
										<span className="min-w-0 truncate">{option.name}</span>
										<span className="text-muted-foreground shrink-0 text-xs tabular-nums">
											{dayMonth(option.date)} · {option.priority}
										</span>
									</button>
								))}
							</div>
						</PopoverContent>
					</Popover>
				) : null}

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

			{/* The header's summary line, the action, and the weekday scale. */}
			<div className="bg-background sticky top-0 z-30 -mx-4 mt-1 px-4 pt-1 md:-mx-8 md:px-8">
				<div className="flex items-center gap-2 pb-2">
					<Icon name="calendar" size="sm" className="text-primary shrink-0" />
					<span className="text-muted-foreground min-w-0 flex-1 truncate text-xs tabular-nums">
						{target.name} · {weeks.length} wk · {sessionCount} ·{' '}
						{trainableDays.length}×/wk
					</span>
					<button
						type="button"
						onClick={() => {
							setPaletteOpen(true)
							setLine('')
							setCursor(0)
						}}
						aria-label="Command palette"
						aria-keyshortcuts="Meta+K"
						className={cn(chipClass, 'gap-1 px-2 font-mono text-[11px]')}
					>
						<Icon name="magnifying-glass" className="size-3" />
						⌘K
					</button>
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
							className={cn(
								'text-muted-foreground pb-1 text-center text-[10px] font-medium',
								trainableDays.length > 0 &&
									!trainableDays.includes(day) &&
									'opacity-40',
							)}
						>
							<span className="md:hidden">{day.slice(0, 1)}</span>
							<span className="hidden md:inline">{day}</span>
						</div>
					))}
				</div>
			</div>

			{/* The calendar — the plan and the editing surface are one object. */}
			<PlanDragArea
				announcements={dragAnnouncements}
				onChipMoved={(key, day) => {
					moveChip(key, day)
					setSelected(key)
				}}
			>
				<div className={cn(created && 'ring-primary/40 rounded-lg ring-2')}>
					{weeks.map((week) => (
						<WeekRow
							key={week.weekKey}
							week={week}
							cols={cols}
							multi={multi}
							band={
								PHASE_BAND[phaseOrder.indexOf(week.phase) % PHASE_BAND.length]!
							}
							phaseStart={
								week.index === 1 || weeks[week.index - 2]?.phase !== week.phase
							}
							raceWeekday={raceWeekday}
							targetName={target.name}
							chipIndex={chipIndex}
							selected={selected}
							onSelect={setSelected}
							expanded={expanded === week.index}
							onToggleExpanded={() =>
								setExpanded(expanded === week.index ? null : week.index)
							}
							onMoveChip={moveChip}
							onSetWeekTotal={setWeekTotal}
						/>
					))}
				</div>
			</PlanDragArea>

			{/* ⌘K — an overlay over the calendar, never a separate screen. */}
			{paletteOpen ? (
				<div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-10">
					<button
						type="button"
						aria-label="Close"
						onClick={() => setPaletteOpen(false)}
						className="bg-background/70 absolute inset-0 backdrop-blur-sm"
					/>
					<div
						role="dialog"
						aria-label="Command palette"
						className="border-border bg-card relative w-full max-w-lg rounded-xl border shadow-2xl"
					>
						<div className="flex items-center gap-2 px-3 py-2">
							<span
								className="text-primary font-mono text-base leading-none"
								aria-hidden
							>
								›
							</span>
							<input
								ref={paletteRef}
								autoFocus
								autoComplete="off"
								autoCorrect="off"
								spellCheck={false}
								value={line}
								aria-label="Command"
								placeholder={
									multi
										? `${tracks[0]!.discipline} ${tracks[0]!.proposedAnchor}  4x  ${target.weeksAway}w  injury`
										: `${tracks[0]!.proposedAnchor}  4x  ${target.weeksAway}w  injury`
								}
								onChange={(e) => {
									setLine(e.target.value)
									setCursor(0)
								}}
								onKeyDown={(e) => {
									if (e.key === 'ArrowDown') {
										e.preventDefault()
										moveCursor(1)
									} else if (e.key === 'ArrowUp') {
										e.preventDefault()
										moveCursor(-1)
									} else if (e.key === 'Enter') {
										e.preventDefault()
										const row = rows[active]
										if (row) run(row.line)
										else if (line.trim()) run(line)
									} else if (e.key === 'Escape') {
										e.preventDefault()
										if (line) {
											setLine('')
											setCursor(0)
										} else {
											setPaletteOpen(false)
										}
									}
								}}
								className="text-foreground placeholder:text-muted-foreground/60 h-11 w-full min-w-0 bg-transparent font-mono text-base tabular-nums outline-none md:text-sm"
							/>
						</div>

						{/* The parse, shown not explained. */}
						{tokens.length > 0 ? (
							<div className="border-border/60 flex flex-wrap gap-1.5 border-t px-3 py-2">
								{tokens.map((token, i) => (
									<span
										key={`${i}-${token.kind}`}
										className={cn(
											'rounded-md px-2 py-0.5 font-mono text-xs tabular-nums',
											token.kind === 'unknown'
												? 'bg-destructive/15 text-destructive line-through'
												: 'bg-primary/10 text-foreground',
										)}
									>
										{tokenChip(token, tracks)}
									</span>
								))}
							</div>
						) : null}

						{/* Every command is also a row, so a pointer never needs the keys. */}
						<ul
							ref={listRef}
							className="border-border/60 max-h-64 overflow-y-auto border-t"
						>
							{rows.map((row, i) => (
								<li key={row.id} data-row={i}>
									<button
										type="button"
										onMouseEnter={() => setCursor(i)}
										onClick={() => run(row.line)}
										className={cn(
											'flex w-full items-baseline gap-2 px-3 py-2 text-left',
											i === active ? 'bg-primary/10' : 'hover:bg-muted',
										)}
									>
										<span
											className={cn(
												'border-border shrink-0 rounded border px-1.5 py-0.5 font-mono text-xs tabular-nums',
												row.id === 'apply' && 'border-primary text-primary',
											)}
										>
											{row.token}
										</span>
										<span className="text-muted-foreground min-w-0 flex-1 truncate text-xs tabular-nums">
											{row.effect}
										</span>
									</button>
								</li>
							))}
							{rows.length === 0 ? (
								<li className="text-destructive px-3 py-2 font-mono text-xs">
									?{word}
								</li>
							) : null}
						</ul>

						<div className="text-muted-foreground border-border/60 flex items-center gap-3 border-t px-3 py-1.5 font-mono text-[10px]">
							<span>↑↓</span>
							<span>⏎</span>
							<span>esc</span>
						</div>
					</div>
				</div>
			) : null}
		</div>
	)
}
