/**
 * PROTOTYPE — what the session-composer variants share: the week of days they
 * write into, the real week sum, the undo toast, a prototype-only strength
 * reader, the tap/keystroke counter, and the "Gjør grundigere" Drawer.
 *
 * Nothing here persists. Sessions live in memory, so every variant can be tried
 * as often as the owner likes without touching the database. The cardio parse
 * and the week sum are the real ones (`parseWorkoutSentence`,
 * `resources/week-sum`, `weekSumPreview`); the strength reader is NOT — no
 * production reader names a lift yet, and this one exists only to show what a
 * lift in the same line would feel like.
 *
 * Words are inline Norwegian rather than in `labels.ts`: this file is thrown
 * away once the owner has chosen.
 *
 * THROWAWAY — do not ship.
 */
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from 'react'
import { useFetcher } from 'react-router'
import { toast } from 'sonner'
import { ScoreStanza } from '#app/components/score-stanza.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from '#app/components/ui/drawer.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { type loader as weekSumLoader } from '#app/routes/resources/week-sum.tsx'
import { addDays } from '#app/utils/athlete-calendar.ts'
import { formatNbVolumeFigure } from '#app/utils/format.ts'
import { nbDisciplineLabel, nbDurationLabel } from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import { weekSumPreviewLine } from '#app/utils/plan-outline/week-sum-words.ts'
import {
	trackForDiscipline,
	weekSumPreview,
} from '#app/utils/plan-outline/week-sum.ts'
import { deriveWorkoutNotation } from '#app/utils/workout-notation.ts'
import { type CardioDiscipline } from '#app/utils/workout-schema.ts'
import {
	type ParsedSentence,
	parseWorkoutSentence,
	sentenceNotationInput,
} from '#app/utils/workout-sentence.ts'

// ——— Sports ————————————————————————————————————————————————————————————

/** What a session is for: the three the line reads, a lift, or nothing. */
export type Sport = CardioDiscipline | 'strength' | 'annet'

export const SPORTS: { value: Sport; label: string }[] = [
	{ value: 'run', label: 'Løp' },
	{ value: 'bike', label: 'Sykkel' },
	{ value: 'swim', label: 'Svøm' },
	{ value: 'strength', label: 'Styrke' },
	{ value: 'annet', label: 'Annet' },
]

export const SPORT_DOT: Record<Sport, string> = {
	run: 'bg-[oklch(0.65_0.18_35)]',
	bike: 'bg-[oklch(0.72_0.14_80)]',
	swim: 'bg-[oklch(0.62_0.13_230)]',
	strength: 'bg-[oklch(0.55_0.17_300)]',
	annet: 'bg-muted-foreground',
}

export function isCardio(sport: Sport): sport is CardioDiscipline {
	return sport === 'run' || sport === 'bike' || sport === 'swim'
}

// ——— The prototype's strength reader (NOT production) —————————————————

export type Lift = { name: string; sets: number; reps: number; kg: number | null }
export type StrengthRead = {
	lifts: Lift[]
	unknown: { text: string; suggestions: string[] }[]
}

/** Norwegian names the athlete types, mapped onto catalogue names. */
const LIFT_ALIASES: Record<string, string> = {
	knebøy: 'Knebøy',
	benkpress: 'Benkpress',
	markløft: 'Markløft',
	roing: 'Roing',
	militærpress: 'Militærpress',
	pullups: 'Pull-ups',
	utfall: 'Utfall',
	hipthrust: 'Hip thrust',
}

export const LIFT_NAMES = Array.from(new Set(Object.values(LIFT_ALIASES)))

/**
 * `Knebøy 5×5 @ 80 kg · Benkpress 5×5 @ 60 kg` → two lifts. Parts split on
 * `·`, `,` or `+`; each is a name, `sets×reps`, and an optional `@ kg`.
 */
export function readStrength(text: string, catalogue: string[]): StrengthRead {
	const known = new Map<string, string>()
	for (const name of [...catalogue, ...LIFT_NAMES]) {
		known.set(name.toLowerCase().replace(/[\s-]/g, ''), name)
	}
	for (const [alias, name] of Object.entries(LIFT_ALIASES)) known.set(alias, name)
	const lifts: Lift[] = []
	const unknown: StrengthRead['unknown'] = []
	for (const raw of text.split(/[·,+]/)) {
		const part = raw.trim()
		if (!part) continue
		const m = part.match(
			/^(.*?)\s*(\d+)\s*[x×]\s*(\d+)(?:\s*@?\s*(\d+(?:[.,]\d+)?)\s*kg)?\s*$/i,
		)
		const nameText = (m ? m[1]! : part).trim()
		const key = nameText.toLowerCase().replace(/[\s-]/g, '')
		const name = known.get(key)
		if (!m || !name) {
			const suggestions = [...known.entries()]
				.filter(([k]) => key.length >= 2 && k.startsWith(key.slice(0, 3)))
				.map(([, v]) => v)
			unknown.push({
				text: nameText || part,
				suggestions: Array.from(new Set(suggestions)).slice(0, 3),
			})
			continue
		}
		lifts.push({
			name,
			sets: Number(m[2]),
			reps: Number(m[3]),
			kg: m[4] ? Number(m[4].replace(',', '.')) : null,
		})
	}
	return { lifts, unknown }
}

export function liftText(lift: Lift) {
	return `${lift.name} ${lift.sets}×${lift.reps}${lift.kg != null ? ` @ ${String(lift.kg).replace('.', ',')} kg` : ''}`
}

// ——— Reading a sentence for any sport ——————————————————————————————————

export type Reading = {
	sport: Sport
	text: string
	parsed: ParsedSentence | null
	strength: StrengthRead | null
	/** The sentence can be written as it stands. */
	ok: boolean
}

export function readSentence(
	text: string,
	sport: Sport,
	catalogue: string[],
): Reading {
	if (sport === 'strength') {
		const strength = readStrength(text, catalogue)
		return {
			sport,
			text,
			parsed: null,
			strength,
			ok: strength.lifts.length > 0 && strength.unknown.length === 0,
		}
	}
	// Annet takes a cardio sentence and counts it in nothing; the reader needs a
	// sport to build a step, so it reads Annet as a ride (a bike to work).
	const parsed = parseWorkoutSentence(text, {
		discipline: sport === 'annet' ? 'bike' : sport,
	})
	return { sport, text, parsed, strength: null, ok: parsed.structure != null }
}

// ——— The week sum, before → after (real) ——————————————————————————————

export function useWeekSum(dayKey: string) {
	const fetcher = useFetcher<typeof weekSumLoader>()
	const { load } = fetcher
	useEffect(() => {
		void load(`/resources/week-sum?day=${dayKey}`)
	}, [dayKey, load])
	return fetcher.data?.day === dayKey ? fetcher.data.week : null
}

/** `Løping neste uke: 30 → 36 km, målet står på 52` — or the honest fallback. */
export function useSumLine(dayKey: string, reading: Reading | null) {
	const week = useWeekSum(dayKey)
	return useMemo(() => {
		if (!reading?.ok || !week) return null
		if (reading.sport === 'annet') {
			return 'Teller i Annet — ingen ukesum flytter seg'
		}
		if (reading.strength) {
			const sets = reading.strength.lifts.reduce((n, l) => n + l.sets, 0)
			const track = trackForDiscipline(week.volumes, 'strength')
			const before = track?.planned ?? 0
			return `Styrke ${week.weekName.toLowerCase()}: ${before} → ${before + sets} sett${track?.target != null ? `, målet står på ${track.target}` : ''}`
		}
		const structure = reading.parsed?.structure
		if (!structure) return null
		const preview = weekSumPreview(
			week.volumes,
			structure,
			trackForDiscipline(week.volumes, structure.discipline),
		)
		const line = weekSumPreviewLine(preview)
		return preview.kind === 'track'
			? `${nbDisciplineLabel(preview.discipline)} ${week.weekName.toLowerCase()}: ${line}`
			: line
	}, [reading, week])
}

// ——— What was understood ————————————————————————————————————————————

/** The understood session: the real Token Sentence for cardio, lift chips for strength. */
export function Understood({ reading }: { reading: Reading }) {
	const notation = useMemo(
		() =>
			reading.parsed?.structure
				? deriveWorkoutNotation(
						sentenceNotationInput(reading.parsed.structure),
						{ thresholds: {} },
					)
				: null,
		[reading.parsed],
	)
	if (reading.strength) {
		return (
			<div className="flex flex-wrap gap-1.5" data-proto-understood>
				{reading.strength.lifts.map((lift, i) => (
					<Badge key={i} variant="secondary" className="h-7 rounded-lg text-[13px]">
						{liftText(lift)}
					</Badge>
				))}
			</div>
		)
	}
	if (!notation || !reading.parsed) return null
	const t = reading.parsed.totals
	const totals = [
		t.distanceM != null
			? `${formatNbVolumeFigure(t.distanceM / 1000, 'km')} km`
			: null,
		t.durationSec != null ? nbDurationLabel(t.durationSec) : null,
	].filter(Boolean)
	return (
		<div className="flex flex-col gap-1" data-proto-understood>
			<ScoreStanza notation={notation} className="text-[14px]" />
			{totals.length > 0 ? (
				<p className="text-muted-foreground text-footnote tabular-nums">
					Til sammen {totals.join(' og ')}
				</p>
			) : null}
		</div>
	)
}

// ——— The week the variants write into —————————————————————————————————

export type Source = 'skrevet' | 'bibliotek' | 'kopi' | 'appen'
export const SOURCE_GLYPH: Record<Source, string> = {
	skrevet: '✎',
	bibliotek: '▤',
	kopi: '⧉',
	appen: '◌',
}
export const SOURCE_LABEL: Record<Source, string> = {
	skrevet: 'Skrevet selv',
	bibliotek: 'Fra biblioteket',
	kopi: 'Kopiert',
	appen: 'Lagt av appen',
}

export type Placed = {
	id: string
	dayKey: string
	sport: Sport
	text: string
	source: Source
	notes?: string
}

export type ProtoDay = { key: string; weekday: string; date: string }

const WEEKDAYS = ['MAN', 'TIR', 'ONS', 'TOR', 'FRE', 'LØR', 'SØN']
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des']

/** Next week, Monday to Sunday. */
export function nextWeek(todayKey: string): ProtoDay[] {
	const d = new Date(`${todayKey}T12:00:00Z`)
	const dow = (d.getUTCDay() + 6) % 7
	const monday = addDays(todayKey, 7 - dow)
	return Array.from({ length: 7 }, (_, i) => {
		const key = addDays(monday, i)
		const [, m, day] = key.split('-').map(Number)
		return { key, weekday: WEEKDAYS[i]!, date: `${day}. ${MONTHS[m! - 1]}` }
	})
}

/** A short, human date: `tir 13. okt`. */
export function dayName(day: ProtoDay) {
	return `${day.weekday.toLowerCase()} ${day.date}`
}

type Store = {
	days: ProtoDay[]
	catalogue: string[]
	placed: Placed[]
	add: (p: Omit<Placed, 'id'>, sumLine: string | null) => void
	remove: (id: string) => void
}
const StoreContext = createContext<Store | null>(null)
export function useStore() {
	const v = useContext(StoreContext)
	if (!v) throw new Error('inside ComposeStore')
	return v
}

/**
 * In-memory sessions, and the one undo every variant shares: the toast says
 * what the write did to the week and carries Angre (a toast because the
 * composer has already closed; ADR 0076's row-Angre is compared in the report).
 */
export function ComposeStore({
	days,
	catalogue,
	children,
}: {
	days: ProtoDay[]
	catalogue: string[]
	children: ReactNode
}) {
	const [placed, setPlaced] = useState<Placed[]>([])
	const idRef = useRef(0)
	const remove = useCallback(
		(id: string) => setPlaced((all) => all.filter((p) => p.id !== id)),
		[],
	)
	const add = useCallback(
		(p: Omit<Placed, 'id'>, sumLine: string | null) => {
			const id = `p${++idRef.current}`
			setPlaced((all) => [...all, { ...p, id }])
			toast.success(sumLine ?? 'Økta er lagt inn.', {
				description: `${SOURCE_GLYPH[p.source]} «${p.text}»`,
				duration: 8000,
				action: { label: 'Angre', onClick: () => remove(id) },
			})
		},
		[remove],
	)
	const value = useMemo(
		() => ({ days, catalogue, placed, add, remove }),
		[days, catalogue, placed, add, remove],
	)
	return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

/**
 * The week as I dag's list draws it, at prototype fidelity: a date gutter, the
 * sessions, `fri +` on an empty day. `renderOpen` is the variant's composer,
 * drawn in the row (inline variants) or nowhere (drawer variants).
 */
export function WeekList({
	openKey,
	onOpen,
	onSession,
	renderOpen,
}: {
	openKey: string | null
	onOpen: (dayKey: string) => void
	onSession?: (p: Placed) => void
	renderOpen?: (day: ProtoDay) => ReactNode
}) {
	const { days, placed } = useStore()
	return (
		<ol className="flex flex-col">
			{days.map((day) => {
				const sessions = placed.filter((p) => p.dayKey === day.key)
				const open = openKey === day.key
				return (
					<li
						key={day.key}
						data-proto-day={day.key}
						className={cn(
							'border-border/60 grid grid-cols-[46px_1fr] gap-3 border-b px-4 py-2',
							open && 'bg-primary/4',
						)}
					>
						<span className="flex flex-col pt-1.5">
							<span className="text-muted-foreground text-[10.5px] font-bold tracking-[0.04em]">
								{day.weekday}
							</span>
							<span className="text-[15px] tabular-nums">{day.date.split('.')[0]}</span>
						</span>
						<div className="flex min-w-0 flex-col gap-1">
							{sessions.map((p) => (
								<button
									key={p.id}
									type="button"
									onClick={() => onSession?.(p)}
									// Lands where it was written: a short rise from 4px below with
									// a fade (state indication — the write took). Tap-initiated and
									// occasional, so it earns 200ms on the strong ease-out; reduced
									// motion keeps only the fade.
									className="pressable flex min-h-11 items-center gap-2 text-left transition-[opacity,translate] duration-dropdown ease-out select-none starting:translate-y-1 starting:opacity-0 motion-reduce:starting:translate-y-0 [-webkit-touch-callout:none]"
								>
									<span className={cn('h-5 w-[3px] rounded-full', SPORT_DOT[p.sport])} />
									<span className="text-muted-foreground text-xs" aria-label={SOURCE_LABEL[p.source]}>
										{SOURCE_GLYPH[p.source]}
									</span>
									<span className="text-callout min-w-0 flex-1">{p.text}</span>
									{p.sport === 'annet' ? (
										<Badge variant="outline">Annet</Badge>
									) : null}
								</button>
							))}
							{open && renderOpen ? (
								renderOpen(day)
							) : (
								<button
									type="button"
									data-proto-free={day.key}
									onClick={() => onOpen(day.key)}
									className="pressable flex min-h-11 items-center justify-between"
								>
									<span className="text-muted-foreground text-footnote italic">
										{sessions.length ? 'legg til en til' : 'fri'}
									</span>
									<span className="text-primary flex size-8 items-center justify-center">
										<Icon name="plus" size="sm" />
									</span>
								</button>
							)}
						</div>
					</li>
				)
			})}
		</ol>
	)
}

// ——— Measuring: taps, keystrokes, seconds ————————————————————————————

/**
 * Counts every tap and key while a composer is open, so the owner can measure
 * a variant by using it. Shown in the switcher's corner; reset on open.
 */
export function useMeter(active: boolean) {
	const [state, setState] = useState({ taps: 0, keys: 0, startedAt: 0, ms: 0 })
	useEffect(() => {
		if (!active) return
		setState({ taps: 0, keys: 0, startedAt: performance.now(), ms: 0 })
		const tap = () =>
			setState((s) => ({ ...s, taps: s.taps + 1, ms: performance.now() - s.startedAt }))
		const key = (e: KeyboardEvent) => {
			if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Enter')
				setState((s) => ({ ...s, keys: s.keys + 1, ms: performance.now() - s.startedAt }))
		}
		document.addEventListener('pointerdown', tap, true)
		document.addEventListener('keydown', key, true)
		return () => {
			document.removeEventListener('pointerdown', tap, true)
			document.removeEventListener('keydown', key, true)
		}
	}, [active])
	return state
}

export function Meter({ meter }: { meter: ReturnType<typeof useMeter> }) {
	return (
		<p
			data-proto-meter
			className="text-muted-foreground px-4 py-1 text-[11px] tabular-nums"
		>
			{`måler: ${meter.taps} trykk · ${meter.keys} tastetrykk · ${(meter.ms / 1000).toFixed(1)} s`}
		</p>
	)
}

// ——— "Gjør grundigere": the Drawer ——————————————————————————————————————

/**
 * The deep place (the owner's direction): everything the quick line cannot
 * say — blocks and steps, a lift's sets, notes, the library, a copy from
 * another day — and a session's full detail. Base UI's Drawer owns the
 * gesture: a flick dismisses, and with `snapPoints` it rests half-open first.
 */
export function DeepDrawer({
	open,
	onOpenChange,
	title,
	description,
	snapPoints,
	snapPoint,
	onSnapPointChange,
	children,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	title: string
	description?: string
	snapPoints?: (number | string)[]
	snapPoint?: number | string | null
	onSnapPointChange?: (point: number | string | null) => void
	children: ReactNode
}) {
	return (
		<Drawer
			open={open}
			onOpenChange={onOpenChange}
			showSwipeHandle
			snapPoints={snapPoints}
			snapPoint={snapPoint}
			onSnapPointChange={onSnapPointChange}
		>
			<DrawerContent>
				<DrawerHeader>
					<DrawerTitle>{title}</DrawerTitle>
					{description ? <DrawerDescription>{description}</DrawerDescription> : null}
				</DrawerHeader>
				<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-6">
					{children}
				</div>
			</DrawerContent>
		</Drawer>
	)
}

/** The deep editor's body — a step list, sets per lift, notes. Prototype-thin. */
export function DeepEditor({
	reading,
	notes,
	onNotes,
}: {
	reading: Reading | null
	notes: string
	onNotes: (n: string) => void
}) {
	const blocks = reading?.parsed?.structure?.blocks ?? []
	return (
		<div className="flex flex-col gap-4" data-proto-deep>
			<section className="flex flex-col gap-2">
				<h3 className="text-footnote text-muted-foreground font-semibold">Blokker og steg</h3>
				{reading?.strength
					? reading.strength.lifts.map((lift, i) => (
							<div key={i} className="bg-muted/60 flex flex-col gap-1 rounded-2xl p-3">
								<span className="font-semibold">{lift.name}</span>
								<div className="flex flex-wrap gap-1.5">
									{Array.from({ length: lift.sets }, (_, s) => (
										<span
											key={s}
											className="border-border flex size-11 items-center justify-center rounded-full border text-sm tabular-nums"
										>
											{lift.reps}
										</span>
									))}
								</div>
								<span className="text-muted-foreground text-footnote">
									{lift.kg != null ? `${String(lift.kg).replace('.', ',')} kg` : 'vekt fra programmet'}
								</span>
							</div>
						))
					: blocks.map((block, i) => (
							<div key={i} className="bg-muted/60 flex flex-col gap-1 rounded-2xl p-3">
								<span className="text-footnote text-muted-foreground">
									{block.repeatCount > 1 ? `${block.repeatCount} ganger` : 'én gang'}
								</span>
								{block.steps.map((step, s) => (
									<span key={s} className="text-callout">
										{step.kind === 'rest'
											? `pause ${nbDurationLabel(step.durationSec ?? 0)}`
											: step.kind === 'cardio'
												? [
														step.distanceM != null ? `${step.distanceM >= 1000 ? `${String(step.distanceM / 1000).replace('.', ',')} km` : `${step.distanceM} m`}` : null,
														step.durationSec != null ? nbDurationLabel(step.durationSec) : null,
													]
														.filter(Boolean)
														.join(' · ')
												: 'løft'}
									</span>
								))}
							</div>
						))}
				<Button variant="outline" size="sm" className="self-start rounded-full">
					<Icon name="plus" size="xs" /> Legg til steg
				</Button>
			</section>
			<section className="flex flex-col gap-2">
				<label htmlFor="proto-notes" className="text-footnote text-muted-foreground font-semibold">
					Notat
				</label>
				<textarea
					id="proto-notes"
					value={notes}
					onChange={(e) => onNotes(e.currentTarget.value)}
					rows={3}
					enterKeyHint="enter"
					className="border-border bg-background rounded-xl border p-3 text-[16px]"
					placeholder="Med gjengen fra klubben, start ved bryggen"
				/>
			</section>
		</div>
	)
}

/** Seeds for the three non-writing sources, as sentences the real reader takes. */
export const LIBRARY: { name: string; sport: Sport; text: string }[] = [
	{ name: 'Terskel 6 × 1000 m', sport: 'run', text: '6x1000 m terskel p 90 s' },
	{ name: '400-ere', sport: 'run', text: '10x400 m hardt p 1 min' },
	{ name: 'Rolig langtur', sport: 'run', text: '90 min langtur' },
	{ name: 'Sykkel terskel', sport: 'bike', text: '4x8 min terskel p 2 min' },
	{ name: 'StrongLifts A', sport: 'strength', text: 'Knebøy 5×5 @ 80 kg · Benkpress 5×5 @ 60 kg · Roing 5×5 @ 50 kg' },
]
export const COPY_FROM: { from: string; sport: Sport; text: string }[] = [
	{ from: 'forrige tirsdag', sport: 'run', text: '6x1000 m terskel p 90 s' },
	{ from: 'forrige lørdag', sport: 'run', text: '18 km langtur' },
	{ from: 'forrige torsdag', sport: 'strength', text: 'Knebøy 5×5 @ 77,5 kg · Benkpress 5×5 @ 57,5 kg' },
]
export const APP_FILLS: { why: string; sport: Sport; text: string }[] = [
	{ why: 'Nedtrapping: kort og lett', sport: 'run', text: '45 min rolig' },
	{ why: 'Holder farta ved like', sport: 'run', text: '5x3 min terskel p 1 min' },
]
