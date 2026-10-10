/**
 * PROTOTYPE — the pieces the composer variants are built from: the sport row,
 * the writing line (type → live tokens), the token builder (tap → steppers),
 * and the four fill sources. Each variant arranges them differently; that
 * arrangement is the question.
 *
 * THROWAWAY — do not ship.
 */
import { useMemo, useRef, useState } from 'react'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '#app/components/ui/popover.tsx'
import {
	SegmentedControl,
	ToggleGroupItem,
} from '#app/components/ui/toggle-group.tsx'
import { cn } from '#app/utils/misc.tsx'
import { replaceWord } from '#app/utils/workout-sentence.ts'
import {
	APP_FILLS,
	COPY_FROM,
	LIBRARY,
	LIFT_NAMES,
	type Lift,
	liftText,
	readSentence,
	type Reading,
	type Source,
	SOURCE_GLYPH,
	SPORT_DOT,
	SPORTS,
	type Sport,
	Understood,
	useStore,
	useSumLine,
} from './__prototype-compose-shared.tsx'

// ——— The sport row ——————————————————————————————————————————————————————

export function SportChips({
	value,
	onChange,
}: {
	value: Sport
	onChange: (s: Sport) => void
}) {
	return (
		<div role="radiogroup" aria-label="Idrett" className="flex flex-wrap gap-1.5">
			{SPORTS.map((s) => (
				<button
					key={s.value}
					type="button"
					role="radio"
					aria-checked={value === s.value}
					onClick={() => onChange(s.value)}
					className={cn(
						'pressable flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold',
						value === s.value
							? 'border-primary bg-primary/10 text-primary'
							: 'border-border text-muted-foreground',
					)}
				>
					<span className={cn('size-1.5 rounded-full', SPORT_DOT[s.value])} />
					{s.label}
				</button>
			))}
		</div>
	)
}

const PLACEHOLDER: Record<Sport, string> = {
	run: 'f.eks. 45 min rolig eller 6x1000 m terskel p 90 s',
	bike: 'f.eks. 2 t rolig eller 4x8 min terskel p 2 min',
	swim: 'f.eks. 10x100 m terskel p 20 s',
	strength: 'f.eks. Knebøy 5x5 @ 80 kg · Benkpress 5x5 @ 60 kg',
	annet: 'f.eks. 25 min sykkel til jobb',
}

// ——— (a) The writing line: type, and see tokens as you go ————————————————

export function useLine(dayKey: string, sport: Sport, text: string) {
	const { catalogue } = useStore()
	const reading = useMemo(
		() => readSentence(text, sport, catalogue),
		[text, sport, catalogue],
	)
	const sum = useSumLine(dayKey, text.trim() ? reading : null)
	return { reading, sum }
}

export function WritingLine({
	sport,
	text,
	onText,
	reading,
	sum,
	onSubmit,
	autoFocus = true,
}: {
	sport: Sport
	text: string
	onText: (t: string) => void
	reading: Reading
	sum: string | null
	onSubmit: () => void
	autoFocus?: boolean
}) {
	const ref = useRef<HTMLInputElement>(null)
	const typed = text.trim().length > 0
	const unknown = reading.strength
		? reading.strength.unknown.map((u) => ({
				text: u.text,
				suggestions: u.suggestions,
				replace: (s: string) => onText(text.replace(u.text, s)),
				why: `Kjenner ikke «${u.text}» — skriv øvelse, så sett×reps`,
			}))
		: (reading.parsed?.unknown ?? []).map((u) => ({
				text: u.text,
				suggestions: u.suggestions,
				replace: (s: string) => onText(replaceWord(text, u, s)),
				why: `Kjenner ikke «${u.text}»`,
			}))
	return (
		<div className="flex min-w-0 flex-col gap-2">
			<input
				ref={ref}
				data-proto-input
				value={text}
				onChange={(e) => onText(e.currentTarget.value)}
				onKeyDown={(e) => {
					if (e.key !== 'Enter') return
					e.preventDefault()
					if (reading.ok) onSubmit()
				}}
				aria-label="Skriv økta"
				placeholder={PLACEHOLDER[sport]}
				autoFocus={autoFocus}
				type="text"
				inputMode="text"
				enterKeyHint="done"
				autoComplete="off"
				autoCorrect="off"
				autoCapitalize={sport === 'strength' ? 'words' : 'off'}
				spellCheck={false}
				className="border-border bg-background focus-visible:border-primary h-12 w-full rounded-xl border px-3 text-[16px] outline-none"
			/>
			{/* Live: the tokens as they become sure, word by word. */}
			{typed ? (
				<div aria-live="polite" className="flex flex-col gap-1.5">
					{reading.ok ? <Understood reading={reading} /> : null}
					{unknown.map((u) => (
						<div key={u.text} className="flex flex-wrap items-center gap-1.5">
							<span className="text-footnote">{u.why}</span>
							{u.suggestions.map((s) => (
								<button
									key={s}
									type="button"
									onClick={() => {
										u.replace(s)
										ref.current?.focus()
									}}
									className="pressable border-primary bg-primary/10 text-primary flex h-9 items-center rounded-full border px-3 text-[13px] font-semibold"
								>
									{s}
								</button>
							))}
						</div>
					))}
					{!reading.ok && unknown.length === 0 && reading.parsed?.problems[0] ? (
						<p className="text-footnote text-muted-foreground">
							{PROBLEM[reading.parsed.problems[0]] ?? 'Skriv hvor langt eller hvor lenge.'}
						</p>
					) : null}
					{sum ? (
						<p data-proto-sum className="text-footnote font-semibold tabular-nums">
							{sum}
						</p>
					) : null}
				</div>
			) : null}
		</div>
	)
}

const PROBLEM: Partial<Record<string, string>> = {
	'no-quantity': 'Skriv hvor langt eller hvor lenge: 10 km, 45 min.',
	'dangling-rest': 'Pausen mangler tid: p 1 min.',
	'two-intensities': 'En del har én intensitet.',
}

// ——— (b) The token builder: tap, and steppers instead of a keyboard ————

export type Draft = {
	sport: Sport
	reps: number | null
	qty: { v: number; unit: 'min' | 'km' | 'm' } | null
	zone: string | null
	rest: number | null
	lifts: Lift[]
}

export const emptyDraft = (sport: Sport): Draft => ({
	sport,
	reps: null,
	qty: null,
	zone: null,
	rest: null,
	lifts: [],
})

export function draftText(d: Draft) {
	if (d.sport === 'strength') return d.lifts.map(liftText).join(' · ')
	if (!d.qty) return ''
	const v = String(d.qty.v).replace('.', ',')
	return [
		d.reps && d.reps > 1 ? `${d.reps}x${v} ${d.qty.unit}` : `${v} ${d.qty.unit}`,
		d.zone,
		d.rest ? `p ${d.rest} s` : null,
	]
		.filter(Boolean)
		.join(' ')
}

/** Back from a seed sentence to tokens. Seeds are in the builder's own shape. */
export function draftFromText(text: string, sport: Sport): Draft {
	if (sport === 'strength') {
		const lifts = text.split('·').flatMap((part): Lift[] => {
			const m = part.trim().match(/^(.*?)\s*(\d+)\s*[x×]\s*(\d+)(?:\s*@\s*([\d,.]+)\s*kg)?$/)
			return m
				? [{ name: m[1]!, sets: +m[2]!, reps: +m[3]!, kg: m[4] ? +m[4].replace(',', '.') : null }]
				: []
		})
		return { ...emptyDraft(sport), lifts }
	}
	const m = text.match(
		/^(?:(\d+)\s*x\s*)?(\d+(?:[.,]\d+)?)\s*(min|km|m|t)\b\s*([a-zæøå]+)?(?:\s*p\s*(\d+)\s*(s|min))?/i,
	)
	if (!m) return emptyDraft(sport)
	const unit = m[3] === 't' ? 'min' : (m[3] as 'min' | 'km' | 'm')
	const v = m[3] === 't' ? Number(m[2]) * 60 : Number(m[2]!.replace(',', '.'))
	return {
		sport,
		reps: m[1] ? +m[1] : null,
		qty: { v, unit },
		zone: m[4] ?? null,
		rest: m[5] ? (m[6] === 'min' ? +m[5] * 60 : +m[5]) : null,
		lifts: [],
	}
}

const ZONES = ['rolig', 'moderat', 'terskel', 'hardt', 'langtur']
const PRESETS = { min: [30, 45, 60, 75, 90, 120], km: [5, 8, 10, 12, 15, 21], m: [200, 400, 800, 1000, 2000, 3000] }
const STEP = { min: 5, km: 1, m: 100 }

function Stepper({
	value,
	onChange,
	step,
	unit,
	min = 0,
	label,
}: {
	value: number
	onChange: (v: number) => void
	step: number
	unit?: string
	min?: number
	label: string
}) {
	return (
		<div className="flex items-center gap-2" role="group" aria-label={label}>
			<Button variant="outline" size="icon-lg" aria-label={`${label} minus`} onClick={() => onChange(Math.max(min, value - step))}>
				−
			</Button>
			<span className="min-w-20 flex-1 text-center text-lg font-semibold tabular-nums">
				{String(value).replace('.', ',')} {unit}
			</span>
			<Button variant="outline" size="icon-lg" aria-label={`${label} pluss`} onClick={() => onChange(value + step)}>
				+
			</Button>
		</div>
	)
}

function PresetGrid<T extends string | number>({
	items,
	value,
	onPick,
	format = (v) => String(v),
}: {
	items: T[]
	value: T | null
	onPick: (v: T) => void
	format?: (v: T) => string
}) {
	return (
		<div className="grid grid-cols-3 gap-1.5">
			{items.map((it) => (
				<button
					key={String(it)}
					type="button"
					onClick={() => onPick(it)}
					className={cn(
						'pressable h-11 rounded-xl border text-[14px] font-semibold tabular-nums',
						value === it ? 'border-primary bg-primary/10 text-primary' : 'border-border',
					)}
				>
					{format(it)}
				</button>
			))}
		</div>
	)
}

/** One token: its value, or a ghost asking for it. Tapping opens its instrument. */
function TokenSlot({
	filled,
	label,
	ghost,
	children,
	testId,
}: {
	filled: boolean
	label: string
	ghost: string
	children: React.ReactNode
	testId: string
}) {
	return (
		<Popover>
			<PopoverTrigger
				data-proto-token={testId}
				className={cn(
					// A ghost becoming a value is a morph on the spot: the fill crossfades
					// (ease, 160ms) — no movement, since the slot does not go anywhere.
					'pressable flex h-11 items-center rounded-xl px-3 text-[15px] font-semibold tabular-nums transition-[background-color,color,border-color] duration-press ease select-none',
					filled
						? 'bg-muted text-foreground'
						: 'border-border text-muted-foreground border border-dashed',
				)}
			>
				{filled ? label : ghost}
			</PopoverTrigger>
			<PopoverContent side="bottom" className="w-[320px]">
				{children}
			</PopoverContent>
		</Popover>
	)
}

export function TokenBuilder({
	draft,
	onDraft,
}: {
	draft: Draft
	onDraft: (d: Draft) => void
}) {
	const set = (patch: Partial<Draft>) => onDraft({ ...draft, ...patch })
	if (draft.sport === 'strength') {
		return (
			<div className="flex flex-wrap items-center gap-1.5" data-proto-tokens>
				{draft.lifts.map((lift, i) => {
					const put = (patch: Partial<Lift>) =>
						set({ lifts: draft.lifts.map((l, j) => (j === i ? { ...l, ...patch } : l)) })
					return (
						<TokenSlot key={i} filled label={liftText(lift)} ghost="" testId={`lift-${i}`}>
							<p className="font-semibold">{lift.name}</p>
							<Stepper label="Sett" value={lift.sets} step={1} min={1} unit="sett" onChange={(v) => put({ sets: v })} />
							<Stepper label="Reps" value={lift.reps} step={1} min={1} unit="reps" onChange={(v) => put({ reps: v })} />
							<Stepper label="Vekt" value={lift.kg ?? 20} step={2.5} unit="kg" onChange={(v) => put({ kg: v })} />
							<Button variant="ghost" onClick={() => set({ lifts: draft.lifts.filter((_, j) => j !== i) })}>
								Fjern løftet
							</Button>
						</TokenSlot>
					)
				})}
				<TokenSlot filled={false} label="" ghost="+ øvelse" testId="lift-add">
					<p className="text-footnote text-muted-foreground">Dine løft</p>
					<div className="grid grid-cols-2 gap-1.5">
						{LIFT_NAMES.map((name) => (
							<button
								key={name}
								type="button"
								data-proto-lift={name}
								onClick={() => set({ lifts: [...draft.lifts, { name, sets: 5, reps: 5, kg: null }] })}
								className="pressable border-border h-11 rounded-xl border text-[14px] font-semibold"
							>
								{name}
							</button>
						))}
					</div>
				</TokenSlot>
			</div>
		)
	}
	const unit = draft.qty?.unit ?? 'min'
	return (
		<div className="flex flex-wrap items-center gap-1.5" data-proto-tokens>
			<TokenSlot filled={!!draft.reps && draft.reps > 1} label={`${draft.reps} ×`} ghost="+ gjentak" testId="reps">
				<p className="font-semibold">Gjentak</p>
				<PresetGrid items={[1, 4, 5, 6, 8, 10]} value={draft.reps} onPick={(v) => set({ reps: v })} format={(v) => (v === 1 ? 'én gang' : `${v} ×`)} />
				<Stepper label="Gjentak" value={draft.reps ?? 1} step={1} min={1} onChange={(v) => set({ reps: v })} />
			</TokenSlot>
			<TokenSlot
				filled={!!draft.qty}
				label={draft.qty ? `${String(draft.qty.v).replace('.', ',')} ${draft.qty.unit}` : ''}
				ghost="+ hvor mye"
				testId="qty"
			>
				<SegmentedControl
					value={unit}
					onValueChange={(u) => set({ qty: { v: PRESETS[u][1]!, unit: u } })}
					aria-label="Enhet"
				>
					<ToggleGroupItem value="min">min</ToggleGroupItem>
					<ToggleGroupItem value="km">km</ToggleGroupItem>
					<ToggleGroupItem value="m">m</ToggleGroupItem>
				</SegmentedControl>
				<PresetGrid items={PRESETS[unit]} value={draft.qty?.v ?? null} onPick={(v) => set({ qty: { v, unit } })} format={(v) => `${v} ${unit}`} />
				<Stepper label="Mengde" value={draft.qty?.v ?? PRESETS[unit][1]!} step={STEP[unit]} unit={unit} onChange={(v) => set({ qty: { v, unit } })} />
			</TokenSlot>
			<TokenSlot filled={!!draft.zone} label={draft.zone ?? ''} ghost="+ intensitet" testId="zone">
				<PresetGrid items={ZONES} value={draft.zone} onPick={(v) => set({ zone: v })} />
			</TokenSlot>
			{draft.reps && draft.reps > 1 ? (
				<TokenSlot filled={!!draft.rest} label={`p ${draft.rest} s`} ghost="+ pause" testId="rest">
					<PresetGrid items={[30, 60, 90, 120, 180, 240]} value={draft.rest} onPick={(v) => set({ rest: v })} format={(v) => `${v} s`} />
					<Stepper label="Pause" value={draft.rest ?? 60} step={15} unit="s" onChange={(v) => set({ rest: v })} />
				</TokenSlot>
			) : null}
		</div>
	)
}

// ——— (c) The four fill sources ————————————————————————————————————————

export type Picked = { text: string; sport: Sport; source: Source }

export function SourceList({
	source,
	sport,
	onPick,
}: {
	source: Exclude<Source, 'skrevet'>
	sport: Sport | null
	onPick: (p: Picked) => void
}) {
	const items =
		source === 'bibliotek'
			? LIBRARY.map((x) => ({ title: x.name, ...x }))
			: source === 'kopi'
				? COPY_FROM.map((x) => ({ title: x.from, ...x }))
				: APP_FILLS.map((x) => ({ title: x.why, ...x }))
	const shown = sport ? items.filter((x) => x.sport === sport || source === 'appen') : items
	return (
		<ul className="flex flex-col gap-1.5" data-proto-source={source}>
			{shown.map((x) => (
				<li key={x.text}>
					<button
						type="button"
						onClick={() => onPick({ text: x.text, sport: x.sport, source })}
						className="pressable bg-muted/60 flex min-h-14 w-full flex-col items-start gap-0.5 rounded-2xl px-3 py-2 text-left"
					>
						<span className="text-footnote text-muted-foreground">
							{SOURCE_GLYPH[source]} {x.title}
						</span>
						<span className="text-callout font-semibold">{x.text}</span>
					</button>
				</li>
			))}
		</ul>
	)
}

export const FILL_SOURCES: { key: Source; label: string; hint: string }[] = [
	{ key: 'skrevet', label: 'Skriv økt', hint: 'f.eks. «6x1000 m terskel p 90 s»' },
	{ key: 'bibliotek', label: 'Fra biblioteket', hint: 'ferdige økter' },
	{ key: 'kopi', label: 'Kopier en økt', hint: 'forrige uke, eller en annen dag' },
	{ key: 'appen', label: 'La appen fylle', hint: 'ut fra fasen og ukas mål' },
]

export function FillGrid({ onPick }: { onPick: (s: Source) => void }) {
	return (
		<div className="grid grid-cols-2 gap-1.5" role="menu" aria-label="Fyll dagen">
			{FILL_SOURCES.map((f) => (
				<button
					key={f.key}
					type="button"
					role="menuitem"
					data-proto-fill={f.key}
					onClick={() => onPick(f.key)}
					className="pressable border-border bg-background flex min-h-14 flex-col items-start gap-0.5 rounded-2xl border px-3 py-2 text-left"
				>
					<span className="text-[14px] font-semibold">
						{SOURCE_GLYPH[f.key]} {f.label}
					</span>
					<span className="text-muted-foreground text-[11.5px]">{f.hint}</span>
				</button>
			))}
		</div>
	)
}

/** The shared action row: write, go deeper, or leave. */
export function Actions({
	ok,
	onAdd,
	onDeeper,
	onCancel,
	addLabel = 'Legg til',
}: {
	ok: boolean
	onAdd: () => void
	onDeeper?: () => void
	onCancel: () => void
	addLabel?: string
}) {
	return (
		<div className="flex flex-wrap items-center gap-2">
			<Button data-proto-add disabled={!ok} onClick={onAdd} className="rounded-full">
				{addLabel}
			</Button>
			{onDeeper ? (
				<Button variant="outline" onClick={onDeeper} className="rounded-full">
					<Icon name="pencil-1" size="xs" /> Gjør grundigere
				</Button>
			) : null}
			<Button variant="ghost" onClick={onCancel}>
				Avbryt
			</Button>
		</div>
	)
}

export function useSportState(initial: Sport = 'run') {
	return useState<Sport>(initial)
}
