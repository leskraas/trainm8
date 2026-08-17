/**
 * PROTOTYPE — variant H, "Command palette".
 *
 * Thesis: for an athlete who already knows what they want, a form is a cage. So
 * there is no form — there is one input line and a palette. `30` is a Season
 * Anchor, `4x` is four days a week, `18w` is an eighteen-week season, `injury`
 * flips the intent, `gentle` picks the shape. Every token is also a row in the
 * list, so a newcomer browses the vocabulary with ↓ and an expert types three
 * tokens and hits ⏎. The season under the palette rebuilds on every apply.
 *
 * The parse is shown, never explained: understood tokens become chips, unknown
 * ones become a red `?token` and nothing else happens.
 *
 * THROWAWAY — do not ship. Delete with the /training/plan/prototype route.
 */
import { useMemo, useRef, useState } from 'react'
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
	summarizeSeason,
	tracksFor,
	type Currency,
	type Day,
	type Discipline,
	type Intent,
	type PrototypeAthlete,
	type PrototypeEvent,
	type PrototypeTrack,
	type VariantProps,
	type Week,
	type WeekRole,
} from './__prototype-data.ts'

/* -------------------------------------------------------------------------- */
/* Vocabulary                                                                  */
/* -------------------------------------------------------------------------- */

/** Sport register — a Training Track is configured, so "Bike", never "Ride". */
const DISCIPLINE: Record<Discipline, string> = {
	run: 'Run',
	bike: 'Bike',
	swim: 'Swim',
}

const DISCIPLINE_TOKENS: Record<string, Discipline> = {
	run: 'run',
	bike: 'bike',
	swim: 'swim',
}

/** The three-way "where are you right now", as one word each. */
const INTENT_TOKENS: Record<string, Intent> = {
	first: 'first-season',
	injury: 'returning-from-injury',
	building: 'deliberately-building',
}

/** The Periodization Preset an intent implies, until a shape is named. */
const PRESET_FOR_INTENT: Record<Intent, string> = {
	'first-season': 'gentle-ramp',
	'returning-from-injury': 'back-from-injury',
	'deliberately-building': DEFAULT_PRESET_KEY,
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

const ROLE_BAR: Record<WeekRole, string> = {
	loading: 'bg-primary',
	recovery: 'bg-primary/35',
	taper: 'bg-muted-foreground/45',
	race: 'bg-foreground',
}

function presetName(key: string): string {
	return PRESETS.find((preset) => preset.key === key)?.name ?? key
}

function unitPerWeek(currency: Currency): string {
	return `${CURRENCY_UNIT[currency]}/wk`
}

/* -------------------------------------------------------------------------- */
/* Config — every field is an override; null means "derived"                   */
/* -------------------------------------------------------------------------- */

type Config = {
	anchors: Partial<Record<Discipline, number>>
	/** Training days per week, which caps sessions per week. */
	days: number | null
	weeks: number | null
	intent: Intent | null
	presetKey: string | null
	eventId: string | null
}

const EMPTY: Config = {
	anchors: {},
	days: null,
	weeks: null,
	intent: null,
	presetKey: null,
	eventId: null,
}

/* -------------------------------------------------------------------------- */
/* The token language                                                          */
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

type ParseContext = {
	tracks: PrototypeTrack[]
	events: PrototypeEvent[]
}

/**
 * Parse a whole line into tokens, left to right. A discipline token moves the
 * cursor to that Training Track, so `bike 170` is unambiguous and a bare `30`
 * lands on the lead track.
 */
function parseLine(line: string, context: ParseContext): Token[] {
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

function clamp(value: number, low: number, high: number): number {
	return Math.max(low, Math.min(high, value))
}

/** What a token reads as once understood — numbers and vocabulary only. */
function tokenChip(token: Token, tracks: PrototypeTrack[]): string {
	switch (token.kind) {
		case 'anchor': {
			const track = tracks.find((t) => t.discipline === token.discipline)
			return `${DISCIPLINE[token.discipline]} ${token.value} ${unitPerWeek(track?.currency ?? 'km')}`
		}
		case 'track':
			return DISCIPLINE[token.discipline]
		case 'days':
			return `${token.value}×/wk`
		case 'weeks':
			return `${token.value} weeks`
		case 'intent':
			return INTENTS.find((i) => i.key === token.intent)?.label ?? token.intent
		case 'preset':
			return presetName(token.presetKey)
		case 'event':
			return token.event.name
		case 'save':
			return 'save'
		case 'unknown':
			return `?${token.text}`
	}
}

/** Fold understood tokens into the config. A bare `track` token is a cursor. */
function applyTokens(config: Config, tokens: Token[]): Config {
	let next: Config = { ...config, anchors: { ...config.anchors } }
	for (const token of tokens) {
		switch (token.kind) {
			case 'anchor':
				next.anchors[token.discipline] = token.value
				break
			case 'days':
				next.days = token.value
				break
			case 'weeks':
				next.weeks = token.value
				break
			case 'intent':
				next = { ...next, intent: token.intent, presetKey: null }
				break
			case 'preset':
				next.presetKey = token.presetKey
				break
			case 'event':
				next = { ...next, eventId: token.event.id, weeks: null }
				break
			default:
				break
		}
	}
	return next
}

/* -------------------------------------------------------------------------- */
/* Training days — `4x` keeps four spread days, so Saturday survives           */
/* -------------------------------------------------------------------------- */

function spread(pool: Day[], count: number): Day[] {
	if (count >= pool.length) return pool
	if (count <= 1) return pool.slice(-1)
	const picked = new Set<Day>()
	for (let i = 0; i < count; i++) {
		picked.add(pool[Math.round((i * (pool.length - 1)) / (count - 1))]!)
	}
	return pool.filter((day) => picked.has(day))
}

/**
 * `4x` is the athlete saying they can train four days — so it may raise the day
 * count above their stored Training Availability, keeping their own days and
 * spreading the extras through the rest of the week.
 */
function pickDays(base: Day[], count: number): Day[] {
	const pool = base.length > 0 ? base : DAYS
	if (count <= pool.length) return spread(pool, count)
	const extra = DAYS.filter((day) => !pool.includes(day))
	const added = spread(extra, count - pool.length)
	return DAYS.filter((day) => pool.includes(day) || added.includes(day))
}

/* -------------------------------------------------------------------------- */
/* Suggestions                                                                 */
/* -------------------------------------------------------------------------- */

type Suggestion = {
	id: string
	/** The literal token to type. */
	token: string
	/** What it does, in numbers. */
	effect: string
	line: string
}

function vocabulary(
	athlete: PrototypeAthlete,
	tracks: PrototypeTrack[],
	events: PrototypeEvent[],
	event: PrototypeEvent,
): Suggestion[] {
	const multi = tracks.length > 1
	const rows: Suggestion[] = []

	for (const track of tracks) {
		const token = multi
			? `${track.discipline} ${track.proposedAnchor}`
			: `${track.proposedAnchor}`
		rows.push({
			id: `anchor-${track.discipline}`,
			token,
			effect: `≈ ${track.proposedAnchor} ${unitPerWeek(track.currency)} · ${
				describeLevel(track.proposedAnchor, track.currency, track.discipline)
					.summary
			}`,
			line: token,
		})
	}

	const dayFloor = clamp(Math.round(athlete.medianSessionsPerWeek) - 2, 2, 4)
	for (let n = dayFloor; n <= Math.min(7, dayFloor + 3); n++) {
		rows.push({
			id: `days-${n}`,
			token: `${n}x`,
			effect: `${n} training days`,
			line: `${n}x`,
		})
	}

	for (const weeks of [event.weeksAway, 12, 18, 24]) {
		const value = clamp(weeks, 6, 30)
		if (rows.some((row) => row.id === `weeks-${value}`)) continue
		rows.push({
			id: `weeks-${value}`,
			token: `${value}w`,
			effect: `${value} weeks to race`,
			line: `${value}w`,
		})
	}

	for (const [token, intent] of Object.entries(INTENT_TOKENS)) {
		rows.push({
			id: `intent-${token}`,
			token,
			effect: `${INTENTS.find((i) => i.key === intent)?.label ?? ''} · ${presetName(PRESET_FOR_INTENT[intent])}`,
			line: token,
		})
	}

	for (const [token, key] of Object.entries(PRESET_TOKENS)) {
		const preset = PRESETS.find((p) => p.key === key)
		rows.push({
			id: `preset-${token}`,
			token,
			effect: `${presetName(key)} · ${preset?.phases.map((phase) => phase.name).join(' → ') ?? ''}`,
			line: token,
		})
	}

	for (const candidate of events) {
		const word = candidate.name.toLowerCase().split(/\s+/)[0] ?? candidate.name
		rows.push({
			id: `event-${candidate.id}`,
			token: word,
			effect: `${candidate.name} · ${candidate.date} · ${candidate.priority}`,
			line: word,
		})
	}

	rows.push({ id: 'save', token: 'save', effect: 'Plan Outline', line: 'save' })
	return rows
}

/* -------------------------------------------------------------------------- */
/* Season strip                                                                */
/* -------------------------------------------------------------------------- */

function LoadStrip({ season }: { season: Week[] }) {
	const max = Math.max(1, ...season.map((week) => week.targetVolume))
	return (
		<div className="flex h-14 items-end gap-px" aria-hidden>
			{season.map((week) => (
				<span
					key={week.weekKey}
					className={cn('flex-1 rounded-t-[2px]', ROLE_BAR[week.role])}
					style={{ height: `${Math.max(8, (week.targetVolume / max) * 100)}%` }}
				/>
			))}
		</div>
	)
}

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div className="min-w-0">
			<div className="truncate text-base font-semibold tabular-nums">
				{value}
			</div>
			<div className="text-muted-foreground font-mono text-[10px] tracking-wide uppercase">
				{label}
			</div>
		</div>
	)
}

/* -------------------------------------------------------------------------- */
/* The palette                                                                 */
/* -------------------------------------------------------------------------- */

export default function VariantH({
	athlete,
	events,
	seasonStartMonday,
	seasonWeeks,
}: VariantProps) {
	const [config, setConfig] = useState<Config>(EMPTY)
	const [line, setLine] = useState('')
	const [cursor, setCursor] = useState(0)
	const [saved, setSaved] = useState(false)
	const inputRef = useRef<HTMLInputElement>(null)
	const listRef = useRef<HTMLUListElement>(null)

	const tracks = useMemo(() => orderTracks(athlete.tracks), [athlete.tracks])
	const event =
		events.find((candidate) => candidate.id === config.eventId) ?? events[0]!

	const tokens = useMemo(
		() => parseLine(line, { tracks, events }),
		[line, tracks, events],
	)
	const understood = tokens.filter((token) => token.kind !== 'unknown')
	const rejected = tokens.filter((token) => token.kind === 'unknown')

	const intent = config.intent
	const presetKey =
		config.presetKey ??
		(intent ? PRESET_FOR_INTENT[intent] : null) ??
		DEFAULT_PRESET_KEY
	const trainableDays = useMemo(
		() =>
			config.days == null
				? athlete.trainableDays
				: pickDays(athlete.trainableDays, config.days),
		[athlete.trainableDays, config.days],
	)

	const season = useMemo(
		() =>
			buildSeason({
				tracks: tracksFor({ ...athlete, tracks }, config.anchors),
				presetKey,
				trainableDays,
				startMonday: seasonStartMonday,
				weeks: config.weeks ?? event.weeksAway ?? seasonWeeks,
				raceDiscipline: event.discipline,
			}),
		[
			athlete,
			tracks,
			config.anchors,
			config.weeks,
			presetKey,
			trainableDays,
			seasonStartMonday,
			seasonWeeks,
			event.weeksAway,
			event.discipline,
		],
	)
	const summary = summarizeSeason(season)
	const reference = season.find((week) => week.role === 'loading') ?? season[0]
	// The long session of whichever track has one — a triathlete's lead track can
	// be the one week without a long ride.
	const longTrack = reference?.tracks.find((track) => track.longRun != null)
	const longest =
		longTrack?.longRun == null
			? '—'
			: formatVolume(longTrack.longRun, longTrack.currency)

	/* --- commands ---------------------------------------------------------- */

	const run = (text: string) => {
		const parsed = parseLine(text, { tracks, events })
		if (parsed.every((token) => token.kind === 'unknown')) return
		setConfig((current) => applyTokens(current, parsed))
		if (parsed.some((token) => token.kind === 'save')) setSaved(true)
		else if (parsed.some((token) => token.kind !== 'track')) setSaved(false)
		setLine('')
		setCursor(0)
		inputRef.current?.focus()
	}

	const word = line.trim().split(/\s+/).at(-1)?.toLowerCase() ?? ''
	const all = useMemo(
		() => vocabulary(athlete, tracks, events, event),
		[athlete, tracks, events, event],
	)
	const filtered = word
		? all.filter(
				(row) =>
					row.token.startsWith(word) || row.effect.toLowerCase().includes(word),
			)
		: all

	const rows: Suggestion[] =
		understood.length > 0
			? [
					{
						id: 'apply',
						token: line.trim(),
						effect: understood
							.map((token) => tokenChip(token, tracks))
							.join(' · '),
						line: line.trim(),
					},
					...filtered.filter((row) => row.line !== line.trim()),
				]
			: filtered

	const active = Math.min(cursor, Math.max(0, rows.length - 1))

	const move = (delta: number) => {
		if (rows.length === 0) return
		const next = (active + delta + rows.length) % rows.length
		setCursor(next)
		listRef.current
			?.querySelector<HTMLElement>(`[data-row="${next}"]`)
			?.scrollIntoView({ block: 'nearest' })
	}

	/* --- chips ------------------------------------------------------------- */

	const chips: { key: string; label: string; clear: () => void }[] = []
	for (const track of tracks) {
		const value = config.anchors[track.discipline]
		if (value == null) continue
		chips.push({
			key: `anchor-${track.discipline}`,
			label: `${tracks.length > 1 ? `${DISCIPLINE[track.discipline]} ` : ''}${value} ${unitPerWeek(track.currency)}`,
			clear: () =>
				setConfig((current) => {
					const anchors = { ...current.anchors }
					delete anchors[track.discipline]
					return { ...current, anchors }
				}),
		})
	}
	if (config.days != null) {
		chips.push({
			key: 'days',
			label: `${config.days}×/wk`,
			clear: () => setConfig((current) => ({ ...current, days: null })),
		})
	}
	if (config.weeks != null) {
		chips.push({
			key: 'weeks',
			label: `${config.weeks}w`,
			clear: () => setConfig((current) => ({ ...current, weeks: null })),
		})
	}
	if (intent) {
		chips.push({
			key: 'intent',
			label: INTENTS.find((i) => i.key === intent)?.label ?? intent,
			clear: () => setConfig((current) => ({ ...current, intent: null })),
		})
	}
	if (config.presetKey) {
		chips.push({
			key: 'preset',
			label: presetName(config.presetKey),
			clear: () => setConfig((current) => ({ ...current, presetKey: null })),
		})
	}
	if (config.eventId) {
		chips.push({
			key: 'event',
			label: event.name,
			clear: () => setConfig((current) => ({ ...current, eventId: null })),
		})
	}

	/* --- render ------------------------------------------------------------ */

	return (
		<div className="px-4 pt-4 pb-24 md:mx-auto md:max-w-2xl md:pt-8">
			{/* The Target Event is a settled fact: data, not a question. */}
			<div className="text-muted-foreground flex items-baseline justify-between gap-3 font-mono text-xs">
				<span className="text-foreground truncate">{event.name}</span>
				<span className="shrink-0 tabular-nums">
					{event.date} · {event.priority} · ≈{event.weeksAway}w
				</span>
			</div>

			{/* The palette */}
			<div className="border-border bg-card mt-3 rounded-xl border">
				{chips.length > 0 ? (
					<div className="flex flex-wrap gap-1.5 px-3 pt-3">
						{chips.map((chip) => (
							<button
								key={chip.key}
								type="button"
								onClick={chip.clear}
								aria-label={`clear ${chip.label}`}
								className="border-border/70 bg-muted hover:border-destructive/60 relative flex items-center gap-1 rounded-md border px-2 py-1 font-mono text-xs tabular-nums after:absolute after:-inset-1.5 after:content-[''] focus-visible:ring-2 focus-visible:outline-none"
							>
								{chip.label}
								<Icon name="cross-1" size="font" className="opacity-60" />
							</button>
						))}
					</div>
				) : null}

				<div className="flex items-center gap-2 px-3 py-2">
					<span
						className="text-primary font-mono text-base leading-none"
						aria-hidden
					>
						›
					</span>
					{/* The palette owns the keyboard from the first frame. */}
					<input
						ref={inputRef}
						autoFocus
						autoComplete="off"
						autoCorrect="off"
						spellCheck={false}
						value={line}
						aria-label="command"
						placeholder={
							tracks.length > 1
								? `${tracks[0]!.discipline} ${tracks[0]!.proposedAnchor}  4x  18w  injury`
								: `${tracks[0]!.proposedAnchor}  4x  18w  injury`
						}
						onChange={(e) => {
							setLine(e.target.value)
							setCursor(0)
						}}
						onKeyDown={(e) => {
							if (e.key === 'ArrowDown') {
								e.preventDefault()
								move(1)
							} else if (e.key === 'ArrowUp') {
								e.preventDefault()
								move(-1)
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
									setConfig(EMPTY)
									setSaved(false)
								}
							}
						}}
						className="text-foreground placeholder:text-muted-foreground/60 h-11 w-full min-w-0 bg-transparent font-mono text-base tabular-nums outline-none md:text-sm"
					/>
				</div>

				{/* The parse, as chips — understood in the fore, rejected in red. */}
				{tokens.length > 0 ? (
					<div className="flex flex-wrap gap-1.5 border-t px-3 py-2">
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

				{/* Every command is also a row: ↓ to browse, or tap. */}
				<ul ref={listRef} className="max-h-56 overflow-y-auto border-t">
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
									{row.id === 'apply' ? '⏎' : row.token}
								</span>
								<span className="text-muted-foreground min-w-0 flex-1 truncate text-xs tabular-nums">
									{row.effect}
								</span>
							</button>
						</li>
					))}
					{rows.length === 0 ? (
						<li className="text-muted-foreground px-3 py-2 font-mono text-xs">
							?{word}
						</li>
					) : null}
				</ul>

				<div className="text-muted-foreground flex items-center gap-3 border-t px-3 py-1.5 font-mono text-[10px]">
					<span>↑↓ browse</span>
					<span>⏎ apply</span>
					<span>esc clear</span>
					{rejected.length > 0 ? (
						<span className="text-destructive ml-auto">
							{rejected.length} rejected
						</span>
					) : null}
				</div>
			</div>

			{/* The season, subordinate: a strip, a stat line, one week. */}
			<div className="mt-5">
				<LoadStrip season={season} />
				<div className="text-muted-foreground mt-1 flex justify-between font-mono text-[10px] tabular-nums">
					<span>{seasonStartMonday}</span>
					<span>{presetName(presetKey)}</span>
					<span>{event.date}</span>
				</div>

				<div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-5">
					<Stat label="weeks" value={`${summary?.weeks ?? 0}`} />
					<Stat
						label="sessions/wk"
						value={`${reference?.sessions.length ?? 0}`}
					/>
					<Stat
						label="peak"
						value={
							summary ? formatVolume(summary.peakVolume, summary.currency) : '—'
						}
					/>
					<Stat label="long" value={longest} />
					<Stat label="race" value={event.date.slice(5)} />
				</div>

				{/* One row per Training Track — three currencies, never summed. */}
				<div className="mt-4 divide-y border-y">
					{(reference?.tracks ?? []).map((track) => (
						<div
							key={track.discipline}
							className="flex items-baseline gap-2 py-2 text-xs"
						>
							<span className="w-10 shrink-0 font-mono">
								{DISCIPLINE[track.discipline]}
							</span>
							<span className="shrink-0 font-semibold tabular-nums">
								≈ {formatVolume(track.targetVolume, track.currency)}
							</span>
							<span className="text-muted-foreground min-w-0 flex-1 truncate tabular-nums">
								{track.level.summary}
							</span>
						</div>
					))}
				</div>

				{reference ? (
					<ul className="mt-3 space-y-1">
						{reference.sessions.map((session, i) => (
							<li
								key={`${session.day}-${session.discipline}-${i}`}
								className="flex items-baseline gap-2 font-mono text-xs tabular-nums"
							>
								<span className="text-muted-foreground w-8 shrink-0">
									{session.day}
								</span>
								<span className="min-w-0 flex-1 truncate">
									{tracks.length > 1
										? `${DISCIPLINE[session.discipline]} · ${session.title}`
										: session.title}
								</span>
								<span className="shrink-0">{session.volume}</span>
								<span className="text-muted-foreground w-24 shrink-0 truncate text-right md:w-44">
									{session.intensity}
								</span>
							</li>
						))}
					</ul>
				) : null}

				<button
					type="button"
					onClick={() => run('save')}
					className={cn(
						'mt-5 h-11 w-full rounded-lg font-mono text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
						saved
							? 'bg-primary/15 text-primary'
							: 'bg-primary text-primary-foreground hover:bg-primary/85',
					)}
				>
					{saved ? (
						<span
							role="status"
							className="inline-flex items-center justify-center gap-1.5"
						>
							<Icon name="circle-check" size="sm" />
							{`Plan Outline · ${season.length}w · ${season.reduce((sum, week) => sum + week.sessions.length, 0)} sessions`}
						</span>
					) : (
						'save'
					)}
				</button>
			</div>
		</div>
	)
}
