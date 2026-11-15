import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
	type Num,
	type SessionBlock,
	type SessionStep,
	type StepTarget,
	type Verdict,
} from '#app/lab/engine/reads.types.ts'
import { WEEKDAY_SHORT, type WeekdayKey, dayDate, weekdayOf } from './__fmt.ts'
import { IconUndo, SportIcon } from './__icons.tsx'

// ── reduced motion ──────────────────────────────────────────────────────────

export function useReduced() {
	const [reduced, setReduced] = useState(false)
	useEffect(() => {
		const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
		setReduced(mq.matches)
		const on = () => setReduced(mq.matches)
		mq.addEventListener('change', on)
		return () => mq.removeEventListener('change', on)
	}, [])
	return reduced
}

// ── the "flying" reply: a chip's text travels into the athlete's bubble ────

let lastChip: { rect: DOMRect; at: number } | null = null
export function rememberChip(el: HTMLElement | null) {
	if (el) lastChip = { rect: el.getBoundingClientRect(), at: Date.now() }
}

// ── turns and bubbles ───────────────────────────────────────────────────────

export function Turn({
	who,
	children,
	enter,
	id,
}: {
	who: 'partner' | 'mine'
	children: React.ReactNode
	enter?: boolean
	id?: string
}) {
	return (
		<div
			className={`prat-turn ${who}${enter ? 'enter' : ''}`}
			id={id ? `melding-${id}` : undefined}
		>
			{children}
		</div>
	)
}

export function Bubble({ children }: { children: React.ReactNode }) {
	return <div className="prat-bubble">{children}</div>
}

/** The athlete's own reply. With `onEdit`, tapping it reopens the question. */
export function Mine({
	children,
	onEdit,
	fly,
	id,
}: {
	children: React.ReactNode
	onEdit?: () => void
	fly?: boolean
	id?: string
}) {
	const ref = useRef<HTMLElement>(null)
	useLayoutEffect(() => {
		if (!fly || !ref.current || !lastChip) return
		if (Date.now() - lastChip.at > 1500) return
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
		const to = ref.current.getBoundingClientRect()
		const from = lastChip.rect
		lastChip = null
		const dx = from.left + from.width / 2 - (to.left + to.width / 2)
		const dy = from.top + from.height / 2 - (to.top + to.height / 2)
		ref.current.animate(
			[
				{ transform: `translate(${dx}px, ${dy}px) scale(0.92)`, opacity: 0.6 },
				{ transform: 'none', opacity: 1 },
			],
			{ duration: 250, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
		)
	}, [fly])
	return (
		<Turn who="mine" id={id}>
			{onEdit ? (
				<button
					type="button"
					className="prat-bubble"
					onClick={onEdit}
					ref={ref as React.RefObject<HTMLButtonElement>}
					aria-label={`Endre svaret: ${typeof children === 'string' ? children : ''}`}
				>
					{children}
				</button>
			) : (
				<div
					className="prat-bubble"
					ref={ref as React.RefObject<HTMLDivElement>}
				>
					{children}
				</div>
			)}
			{onEdit ? (
				<span className="prat-edit-hint">Trykk for å endre</span>
			) : null}
		</Turn>
	)
}

export function Typing() {
	return (
		<Turn who="partner" enter>
			<div className="prat-typing" aria-label="Skriver">
				<i />
				<i />
				<i />
			</div>
		</Turn>
	)
}

export function DayDivider({ children }: { children: React.ReactNode }) {
	return <div className="prat-day">{children}</div>
}

// ── reply buttons ───────────────────────────────────────────────────────────

export function Chips({ children }: { children: React.ReactNode }) {
	return <div className="prat-chips">{children}</div>
}

export function Chip({
	children,
	onClick,
	primary,
	danger,
	quiet,
	busy,
	disabled,
	pressed,
	label,
}: {
	children: React.ReactNode
	onClick?: () => void
	primary?: boolean
	danger?: boolean
	quiet?: boolean
	busy?: boolean
	disabled?: boolean
	pressed?: boolean
	label?: string
}) {
	return (
		<button
			type="button"
			className={`prat-chip${primary ? 'primary' : ''}${danger ? 'danger' : ''}${quiet ? 'quiet' : ''}${busy ? 'busy' : ''}`}
			onClick={(e) => {
				rememberChip(e.currentTarget)
				onClick?.()
			}}
			disabled={disabled || busy}
			aria-pressed={pressed}
			aria-busy={busy || undefined}
			aria-label={label}
		>
			<span>{children}</span>
		</button>
	)
}

// ── unknown numbers ─────────────────────────────────────────────────────────

export function Unknown({
	why,
	short,
}: {
	why?: string | null
	short?: string
}) {
	return (
		<span className="prat-unknown" title={why ?? undefined}>
			{short ?? why ?? 'ukjent'}
		</span>
	)
}

/** A number, or the reason there is none. */
export function N({
	n,
	f,
	short,
	bold = true,
}: {
	n: Num | null | undefined
	f: (v: number) => string
	short?: string
	bold?: boolean
}) {
	if (!n || n.value === null) return <Unknown why={n?.why} short={short} />
	return bold ? (
		<b className="num">{f(n.value)}</b>
	) : (
		<span className="num">{f(n.value)}</span>
	)
}

export function VerdictTag({ v }: { v: Verdict }) {
	if (!v.call) return null
	const cls = v.call === 'on-target' ? 'hit' : v.call
	return <span className={`prat-tag ${cls}`}>{v.label}</span>
}

// ── session structure ───────────────────────────────────────────────────────

type Seg = { w: number; c: 'easy' | 'mid' | 'hard' | 'rest' }

function stepClass(block: SessionBlock, step: SessionStep): Seg['c'] {
	if (step.kind === 'rest') return 'rest'
	const name = (block.name ?? '').toLowerCase()
	if (/oppvarm|nedjogg|nedkjøl|nedsykl|avslutt|rolig/.test(name)) return 'easy'
	const label = `${step.target?.label ?? ''} ${block.name ?? ''}`.toLowerCase()
	if (
		/z5|z4|i-?5|i-?4|terskel|hard|vo2|maks|sprint|intervall|drag|fart/.test(
			label,
		)
	)
		return 'hard'
	if (/z3|i-?3|moderat|tempo|sweet/.test(label)) return 'mid'
	return 'easy'
}

export function segments(structure: SessionBlock[] | null): Seg[] {
	if (!structure) return []
	const out: Seg[] = []
	for (const block of structure) {
		const times = Math.max(1, block.repeat) * Math.max(1, block.series)
		for (let i = 0; i < times; i++) {
			for (const step of block.steps) {
				const w = step.durationS ?? (step.distanceM ? step.distanceM / 3.3 : 0)
				if (w <= 0) continue
				out.push({ w, c: stepClass(block, step) })
			}
			if (
				block.restBetweenSeriesS &&
				block.series > 1 &&
				i % block.repeat === block.repeat - 1
			)
				out.push({ w: block.restBetweenSeriesS, c: 'rest' })
		}
	}
	return out
}

/** The stacked line: warm-up, work, rest, cool-down, by time. */
export function Strip({ structure }: { structure: SessionBlock[] | null }) {
	const segs = segments(structure)
	if (!segs.length) return null
	return (
		<div className="prat-strip" aria-hidden="true">
			{segs.map((s, i) => (
				<i key={i} className={s.c} style={{ flexGrow: s.w, flexBasis: 0 }} />
			))}
		</div>
	)
}

/** The target that best says how hard the session is: the hardest work step. */
export function keyTarget(structure: SessionBlock[] | null): StepTarget | null {
	if (!structure) return null
	let best: { t: StepTarget; score: number } | null = null
	for (const block of structure) {
		for (const step of block.steps) {
			if (step.kind !== 'work' || !step.target) continue
			const c = stepClass(block, step)
			const score =
				(c === 'hard' ? 3 : c === 'mid' ? 2 : 1) + (block.repeat > 1 ? 1 : 0)
			if (!best || score > best.score) best = { t: step.target, score }
		}
	}
	return best?.t ?? null
}

export function TargetText({ t }: { t: StepTarget }) {
	if (t.resolvedText)
		return (
			<span className="prat-target">
				<b className="num">
					{t.approximate ? '≈ ' : ''}
					{t.resolvedText}
				</b>{' '}
				<span className="prat-note">({t.label})</span>
			</span>
		)
	return (
		<span className="prat-target">
			<b>{t.label}</b> {t.why ? <Unknown why={t.why} /> : null}
		</span>
	)
}

export function SportBadge({ sport }: { sport: string | null }) {
	return (
		<span className="prat-sport">
			<SportIcon sport={sport} />
		</span>
	)
}

// ── controls ────────────────────────────────────────────────────────────────

export type PickDay = {
	date: string
	label?: string
	disabled?: boolean
	blocked?: boolean
	note?: string
}

/** Seven (or more) day buttons. `blocked` days are striped: they don't work. */
export function DayPicker({
	days,
	value,
	onPick,
}: {
	days: PickDay[]
	value?: string | null
	onPick: (date: string) => void
}) {
	return (
		<div className="prat-weekpick" role="group" aria-label="Velg dag">
			{days.map((d) => (
				<button
					key={d.date}
					type="button"
					aria-pressed={value === d.date}
					disabled={d.disabled}
					className={d.blocked ? 'blocked' : undefined}
					onClick={(e) => {
						rememberChip(e.currentTarget)
						onPick(d.date)
					}}
					title={d.note}
				>
					{d.label ?? WEEKDAY_SHORT[weekdayOf(d.date)]}
					<small className="num">{dayDate(d.date).getUTCDate()}.</small>
				</button>
			))}
		</div>
	)
}

/** Weekday toggles (no dates): for availability. */
export function WeekdayToggles({
	value,
	onChange,
}: {
	value: WeekdayKey[]
	onChange: (v: WeekdayKey[]) => void
}) {
	const all: WeekdayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
	return (
		<div className="prat-weekpick" role="group" aria-label="Dager">
			{all.map((d) => {
				const on = value.includes(d)
				return (
					<button
						key={d}
						type="button"
						aria-pressed={on}
						className={on ? undefined : 'blocked'}
						onClick={() =>
							onChange(
								on
									? value.filter((x) => x !== d)
									: all.filter((x) => x === d || value.includes(x)),
							)
						}
					>
						{WEEKDAY_SHORT[d]}
						<small>{on ? 'går' : 'går ikke'}</small>
					</button>
				)
			})}
		</div>
	)
}

export function RpePicker({
	value,
	onPick,
	busy,
}: {
	value: number | null
	onPick: (n: number) => void
	busy?: boolean
}) {
	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: 6,
				width: '100%',
			}}
		>
			<div className="prat-rpe" role="group" aria-label="Hvor tung, 1 til 10">
				{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
					<button
						key={n}
						type="button"
						className="num"
						aria-pressed={value === n}
						disabled={busy}
						onClick={(e) => {
							rememberChip(e.currentTarget)
							onPick(n)
						}}
					>
						{n}
					</button>
				))}
			</div>
			<div className="prat-rpe-scale">
				<span>1 veldig lett</span>
				<span>10 alt jeg hadde</span>
			</div>
		</div>
	)
}

/** Hold for 1.5 s to confirm. Release early and it snaps back. */
export function HoldButton({
	children,
	doneLabel,
	onConfirm,
	disabled,
}: {
	children: React.ReactNode
	doneLabel: string
	onConfirm: () => void
	disabled?: boolean
}) {
	const [holding, setHolding] = useState(false)
	const timer = useRef<number | null>(null)
	const start = () => {
		if (disabled) return
		setHolding(true)
		timer.current = window.setTimeout(() => {
			setHolding(false)
			onConfirm()
		}, 1500)
	}
	const stop = () => {
		setHolding(false)
		if (timer.current) window.clearTimeout(timer.current)
		timer.current = null
	}
	return (
		<button
			type="button"
			className={`prat-hold${holding ? 'holding' : ''}`}
			disabled={disabled}
			onPointerDown={start}
			onPointerUp={stop}
			onPointerLeave={stop}
			onPointerCancel={stop}
			onContextMenu={(e) => e.preventDefault()}
			onKeyDown={(e) => {
				if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) start()
			}}
			onKeyUp={stop}
		>
			{children}
			<span className="fill" aria-hidden="true">
				{doneLabel}
			</span>
		</button>
	)
}

// ── a change, with its way back ─────────────────────────────────────────────

export function ChangeCard({
	text,
	detail,
	onUndo,
	undone,
	busy,
	noUndo,
}: {
	text: string
	detail?: React.ReactNode
	onUndo?: () => void
	undone?: boolean
	busy?: boolean
	noUndo?: string | null
}) {
	return (
		<div
			className="prat-card"
			style={{ maxWidth: 360, padding: '10px 12px', gap: 6 }}
		>
			<div
				className="prat-card-row"
				style={{ justifyContent: 'space-between' }}
			>
				<span
					style={{
						fontWeight: 600,
						textDecoration: undone ? 'line-through' : undefined,
						minWidth: 0,
						overflowWrap: 'anywhere',
					}}
				>
					{text}
				</span>
				{undone ? (
					<span className="prat-tag">Angret</span>
				) : onUndo ? (
					<button
						type="button"
						className="prat-chip quiet sq"
						style={{ minHeight: 36, fontSize: 14 }}
						onClick={onUndo}
						disabled={busy}
					>
						<IconUndo /> <span>Angre</span>
					</button>
				) : null}
			</div>
			{detail ? <div className="prat-note">{detail}</div> : null}
			{noUndo ? <div className="prat-note">{noUndo}</div> : null}
		</div>
	)
}
