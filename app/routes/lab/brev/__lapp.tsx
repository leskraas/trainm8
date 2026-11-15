/**
 * Lappen: today's session as a note pinned to the week's letter. Tap to fold
 * out its structure, hold to say «gjort», swipe left for the PS sheet.
 */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import {
	type SessionBlock,
	type SessionCard,
	type SessionOutput,
	type WeekOutput,
} from '#app/lab/engine/reads.types.ts'
import {
	type EaseWeekOutput,
	type MoveSessionOutput,
	type ShortenSessionOutput,
	type SkipSessionOutput,
	type SwapSessionsOutput,
	type MarkDoneOutput,
	type RateSessionOutput,
	type NoteSessionOutput,
} from '#app/lab/engine/sessions.types.ts'
import {
	BASE,
	DAY_NAME,
	SPORT_NOUN,
	addDays,
	cap,
	dateText,
	known,
	minText,
	mondayOf,
	n1,
	paceText,
	secText,
	timeOf,
	verdictTone,
	verdictWords,
	weekdayOf,
	daysBetween,
} from './__lib.ts'
import { addPs } from './__ps.ts'
import {
	ErrorLine,
	N,
	PlanArrow,
	RpeStrokes,
	Sheet,
	SportMark,
	Stamp,
	Unknown,
	useWrite,
} from './__ui.tsx'

export function headline(c: SessionCard) {
	const min = known(c.planned.durationS)
		? minText(c.planned.durationS.value / 60)
		: null
	const noun = SPORT_NOUN[c.sport] ?? 'økt'
	return { min, noun }
}

// ── The stacked strip ────────────────────────────────────────────────────

type Seg = { s: number | null; tone: 0 | 1 | 2; text: string }

function segmentsOf(blocks: SessionBlock[]): Seg[] {
	const out: Seg[] = []
	for (const b of blocks) {
		const name = (b.name ?? '').toLowerCase()
		const easyBlock = /warm|oppvarm|cool|nedjogg|ned|rolig|easy/.test(name)
		const times = Math.max(1, b.repeat) * Math.max(1, b.series)
		for (let r = 0; r < times; r++) {
			b.steps.forEach((st, i) => {
				const tone: 0 | 1 | 2 =
					st.kind === 'rest' ? 0 : easyBlock ? 1 : b.repeat > 1 && i > 0 ? 0 : 2
				out.push({ s: st.durationS, tone, text: st.text })
			})
			if (b.restBetweenSeriesS && b.series > 1 && r < times - 1)
				out.push({ s: b.restBetweenSeriesS, tone: 0, text: 'pause' })
		}
	}
	return out
}

export function StructureStrip({ blocks }: { blocks: SessionBlock[] }) {
	const segs = segmentsOf(blocks)
	if (!segs.length) return null
	const knownTotal = segs.reduce((a, s) => a + (s.s ?? 0), 0)
	const fallback = knownTotal > 0 ? knownTotal / segs.length : 1
	const color = [
		'var(--rule)',
		'color-mix(in oklab, var(--ink) 40%, transparent)',
		'var(--ink)',
	]
	return (
		<div className="b-strip" aria-hidden>
			{segs.map((s, i) => (
				<span
					key={i}
					style={{ flexGrow: s.s ?? fallback, background: color[s.tone] }}
				/>
			))}
		</div>
	)
}

function BlockList({ blocks }: { blocks: SessionBlock[] }) {
	return (
		<ol style={{ listStyle: 'none', padding: 0, margin: '6px 0 0' }}>
			{blocks.map((b, i) => (
				<li key={i} style={{ margin: '0 0 10px' }}>
					<span style={{ fontWeight: 600 }}>
						{b.name ? cap(blockName(b.name)) : `Del ${i + 1}`}
					</span>
					{b.repeat > 1 || b.series > 1 ? (
						<N>
							{' '}
							{b.series > 1 ? `${b.series} × (` : ''}
							{b.repeat} ×{b.series > 1 ? ')' : ''}
						</N>
					) : null}
					<ul style={{ listStyle: 'none', padding: 0, margin: '2px 0 0' }}>
						{b.steps.map((st, j) => (
							<li key={j} className="b-small" style={{ color: 'var(--ink)' }}>
								{st.durationS ? <N>{secText(st.durationS)}</N> : null}
								{st.distanceM ? (
									<N>
										{st.durationS ? ' · ' : ''}
										{st.distanceM >= 1000
											? `${n1(st.distanceM / 1000)} km`
											: `${Math.round(st.distanceM)} m`}
									</N>
								) : null}
								{st.exercise ? <span>{st.exercise.name} </span> : null}
								{st.sets ? <N> {st.sets} sett</N> : null}
								{st.target ? (
									<>
										{' '}
										<span>{st.target.label}</span>
										{st.target.resolvedText ? (
											<N>
												{' '}
												({st.target.approximate ? '≈' : ''}
												{st.target.resolvedText})
											</N>
										) : st.target.why ? (
											<>
												{' '}
												<Unknown why={st.target.why}>dine tall mangler</Unknown>
											</>
										) : null}
									</>
								) : st.kind === 'rest' ? (
									<span> pause</span>
								) : null}
								{st.note ? (
									<span style={{ color: 'var(--ink-2)', fontStyle: 'italic' }}>
										{' '}
										– {st.note}
									</span>
								) : null}
							</li>
						))}
					</ul>
				</li>
			))}
		</ol>
	)
}

function blockName(n: string) {
	const map: Record<string, string> = {
		'warm-up': 'oppvarming',
		warmup: 'oppvarming',
		'cool-down': 'nedjogg',
		cooldown: 'nedjogg',
		intervals: 'drag',
		main: 'hoveddel',
	}
	return map[n.toLowerCase()] ?? n
}

// ── Lappen ───────────────────────────────────────────────────────────────

export function Lapp({
	card,
	detail,
	week,
	today,
	timeZone,
	defaultOpen,
	dayLabel,
}: {
	card: SessionCard
	detail: SessionOutput | null
	week: WeekOutput | null
	today: string
	timeZone?: string
	defaultOpen?: boolean
	dayLabel?: string
}) {
	const [open, setOpen] = useState(!!defaultOpen)
	const [ps, setPs] = useState(false)
	const [dx, setDx] = useState(0)
	const [holding, setHolding] = useState(false)
	const [dragging, setDragging] = useState(false)
	const [justStamped, setJustStamped] = useState(false)
	const done = useWrite<{ sessionId: string }, MarkDoneOutput>('mark_done')
	const g = useRef<{
		x: number
		y: number
		t: number
		moved: boolean
		timer: number | null
		id: number
	} | null>(null)
	const prevRecording = useRef(card.hasRecording)
	useEffect(() => {
		if (!prevRecording.current && card.hasRecording) setJustStamped(true)
		prevRecording.current = card.hasRecording
	}, [card.hasRecording])

	const can = detail?.can
	const canDone = can
		? can.markDone.allowed
		: card.status === 'planned' && card.date <= today
	const isStrength = card.sport === 'strength'
	const { min, noun } = headline(card)
	const label = dayLabel ?? cap(DAY_NAME[weekdayOf(card.date)])
	const isDone = card.status === 'done'
	const isMissed = card.status === 'missed'

	async function markDone() {
		if (isStrength) return
		const r = await done.call({ sessionId: card.id })
		if (r.ok) {
			addPs({
				weekKey: mondayOf(card.date),
				text: `${card.title} merket som gjort.`,
				token: r.value.undo,
				noUndoBecause: r.value.noUndoBecause,
			})
		}
	}

	function interactive(t: EventTarget | null) {
		return !!(t as HTMLElement | null)?.closest?.(
			'button, a, input, textarea, [role="slider"], [data-no-gesture]',
		)
	}

	function onPointerDown(e: React.PointerEvent) {
		if (interactive(e.target)) return
		const timer =
			canDone && !isStrength
				? window.setTimeout(() => {
						if (g.current && !g.current.moved) {
							g.current.timer = null
							setHolding(false)
							void markDone()
							g.current = null
						}
					}, 650)
				: null
		g.current = {
			x: e.clientX,
			y: e.clientY,
			t: Date.now(),
			moved: false,
			timer,
			id: e.pointerId,
		}
		if (timer) setHolding(true)
	}
	function onPointerMove(e: React.PointerEvent) {
		const s = g.current
		if (!s) return
		const ddx = e.clientX - s.x
		const ddy = e.clientY - s.y
		if (!s.moved && Math.hypot(ddx, ddy) > 10) {
			s.moved = true
			if (s.timer) window.clearTimeout(s.timer)
			s.timer = null
			setHolding(false)
			if (Math.abs(ddx) > Math.abs(ddy)) {
				setDragging(true)
				;(e.currentTarget as HTMLElement).setPointerCapture(s.id)
			} else {
				g.current = null
				return
			}
		}
		if (s.moved) setDx(Math.min(0, ddx) + Math.max(0, ddx) * 0.15)
	}
	function onPointerUp() {
		const s = g.current
		g.current = null
		setHolding(false)
		setDragging(false)
		if (!s) return
		if (s.timer) window.clearTimeout(s.timer)
		if (s.moved) {
			if (dx < -72) setPs(true)
			setDx(0)
			return
		}
		if (Date.now() - s.t < 650) setOpen((o) => !o)
	}

	const recTime = detail?.recording?.startedAt
		? timeOf(detail.recording.startedAt, timeZone)
		: null

	return (
		<>
			<div style={{ position: 'relative' }}>
				<div
					aria-hidden
					style={{
						position: 'absolute',
						inset: 0,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'flex-end',
						paddingRight: 18,
						color: 'var(--red)',
						fontStyle: 'italic',
						opacity: Math.min(1, -dx / 72),
					}}
				>
					PS …
				</div>
				<article
					className="b-lapp b-lapp-yellow b-pin"
					aria-label={`${label}: ${card.title}`}
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onPointerUp={onPointerUp}
					onPointerCancel={() => {
						if (g.current?.timer) window.clearTimeout(g.current.timer)
						g.current = null
						setHolding(false)
						setDragging(false)
						setDx(0)
					}}
					style={{
						transform: `translateX(${dx}px)`,
						transition: dragging
							? 'none'
							: 'transform 220ms cubic-bezier(0.23, 1, 0.32, 1)',
						touchAction: 'pan-y',
						cursor: 'pointer',
						overflow: 'hidden',
					}}
				>
					<p className="b-p" style={{ marginBottom: 4 }}>
						<SportMark sport={card.sport} />
						<strong style={{ fontWeight: 600 }}>
							{label}: {min ? <N>{min}</N> : null} {min ? noun : card.title}.
						</strong>{' '}
						{min ? <span>{card.title}</span> : null}
						{card.purpose ? (
							<span style={{ color: 'var(--ink-2)' }}> · {card.purpose}</span>
						) : null}
						{card.time ? (
							<span className="b-small"> · kl. {card.time}</span>
						) : null}
					</p>
					{detail?.summary && !open ? (
						<p
							className="b-small"
							style={{ margin: '0 0 6px', overflowWrap: 'anywhere' }}
						>
							{detail.summary}
						</p>
					) : null}
					{isStrength && detail?.strength ? (
						<p className="b-small" style={{ margin: '0 0 6px' }}>
							{detail.strength.exercises.map((x) => x.name).join(', ')}
						</p>
					) : null}
					{card.adjustedBecause ? (
						<p
							className="b-margin"
							style={{ fontSize: 16, lineHeight: '24px' }}
						>
							{card.adjustedBecause}
						</p>
					) : null}

					{open && detail?.structure?.length ? (
						<div className="b-fade-in" data-no-gesture>
							<StructureStrip blocks={detail.structure} />
							<BlockList blocks={detail.structure} />
						</div>
					) : null}
					{open && detail && !detail.structure?.length && !detail.strength ? (
						<p className="b-small b-fade-in">
							{detail.description ??
								'Ingen oppbygging å vise: økta er bare tid og innsats.'}
						</p>
					) : null}
					{open && detail?.description && detail.structure?.length ? (
						<p className="b-small" style={{ fontStyle: 'italic' }}>
							{detail.description}
						</p>
					) : null}

					{card.hasRecording ? (
						<p style={{ margin: '8px 0' }}>
							<Stamp fresh={justStamped}>
								Mottatt{recTime ? ` ${recTime}` : ''}
								{card.status === 'done' ? ', koblet til økta' : ''}
							</Stamp>
						</p>
					) : null}

					{isDone || isMissed ? (
						<p className="b-p" style={{ margin: '6px 0' }}>
							{isMissed ? (
								<span className="b-off">Ble ikke gjort.</span>
							) : (
								<>
									<PlanArrow
										planned={
											known(card.planned.durationS)
												? card.planned.durationS.value / 60
												: null
										}
										actual={
											known(card.actual.durationS)
												? card.actual.durationS.value / 60
												: null
										}
										fmt={(v) => minText(v)}
										tone={verdictTone(card.verdict)}
									/>{' '}
									<span
										className={
											card.verdict.call === 'on-target'
												? 'b-hit'
												: card.verdict.call
													? 'b-off'
													: ''
										}
									>
										{verdictWords(card.verdict) ??
											(card.markedDone ? 'Gjort, sagt for hånd.' : 'Gjort.')}
									</span>
								</>
							)}
						</p>
					) : null}

					<div className="b-row" style={{ marginTop: 6 }}>
						{isStrength &&
						(can?.logStrength.allowed ?? card.status === 'planned') ? (
							<Link
								to={`${BASE}/styrke/${card.id}`}
								className="b-btn"
								prefetch="intent"
							>
								{card.strengthSetsLogged ? 'Fortsett styrke' : 'Start styrke'}
							</Link>
						) : null}
						{canDone && !isStrength ? (
							<button
								type="button"
								className="b-btn"
								disabled={done.pending}
								onClick={() => void markDone()}
							>
								{done.pending ? 'Skriver …' : 'Gjort'}
							</button>
						) : null}
						{card.status === 'planned' ? (
							<button
								type="button"
								className="b-btn b-btn-ghost"
								onClick={() => setPs(true)}
							>
								PS …
							</button>
						) : null}
						{detail?.structure?.length ? (
							<button
								type="button"
								className="b-word"
								aria-expanded={open}
								onClick={() => setOpen((o) => !o)}
								style={{ fontSize: 16, color: 'var(--ink-2)' }}
							>
								{open ? 'Brett sammen' : 'Hele økta'}
							</button>
						) : null}
					</div>
					{canDone && !isStrength ? (
						<p
							className="b-small"
							style={{ margin: '8px 0 0', color: 'var(--pencil)' }}
						>
							Hold på lappen for «gjort». Dra til venstre for PS.
						</p>
					) : null}
					<ErrorLine message={done.error} />
					<span
						aria-hidden
						style={{
							position: 'absolute',
							left: 0,
							right: 0,
							bottom: 0,
							height: 3,
							background: 'var(--green)',
							transformOrigin: 'left',
							transform: `scaleX(${holding ? 1 : 0})`,
							transition: holding
								? 'transform 650ms linear'
								: 'transform 200ms cubic-bezier(0.23, 1, 0.32, 1)',
						}}
					/>
				</article>
			</div>
			{(isDone ||
				(detail?.can.rateFeeling.allowed && card.status !== 'planned')) &&
			detail ? (
				<Feeling card={card} detail={detail} />
			) : null}
			<PsSheet
				open={ps}
				onClose={() => setPs(false)}
				card={card}
				detail={detail}
				week={week}
				today={today}
			/>
		</>
	)
}

// ── How it felt ──────────────────────────────────────────────────────────

export function Feeling({
	card,
	detail,
}: {
	card: SessionCard
	detail: SessionOutput
}) {
	const rate = useWrite<
		{ sessionId: string; rpe: number | null },
		RateSessionOutput
	>('rate_session')
	const note = useWrite<{ sessionId: string; note: string }, NoteSessionOutput>(
		'note_session',
	)
	const [rpe, setRpe] = useState<number | null>(detail.feeling.rpe)
	const [writing, setWriting] = useState(false)
	const [text, setText] = useState(detail.feeling.note ?? '')
	useEffect(() => setRpe(detail.feeling.rpe), [detail.feeling.rpe])
	useEffect(() => setText(detail.feeling.note ?? ''), [detail.feeling.note])
	const allowed = detail.can.rateFeeling.allowed
	return (
		<div
			style={{
				margin: '10px 4px 0',
				paddingLeft: 12,
				borderLeft: '1px solid var(--rule)',
			}}
		>
			<p className="b-p" style={{ marginBottom: 2 }}>
				Hvor tungt?
				{rpe === null ? (
					<span className="b-small" style={{ fontStyle: 'italic' }}>
						{' '}
						Ikke påkrevd.
					</span>
				) : null}
			</p>
			<RpeStrokes
				value={rpe}
				disabled={!allowed || rate.pending}
				onChange={async (v) => {
					const before = rpe
					setRpe(v)
					const r = await rate.call({ sessionId: card.id, rpe: v })
					if (!r.ok) setRpe(before)
				}}
			/>
			{!allowed && detail.can.rateFeeling.why ? (
				<p className="b-small">{detail.can.rateFeeling.why}</p>
			) : null}
			<ErrorLine message={rate.error} />
			{detail.feeling.note && !writing ? (
				<p
					className="b-margin"
					style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
				>
					{detail.feeling.note}{' '}
					<button
						type="button"
						className="b-word"
						style={{ fontSize: 15, fontStyle: 'normal' }}
						onClick={() => setWriting(true)}
					>
						Skriv om
					</button>
				</p>
			) : writing ? (
				<form
					className="b-fade-in"
					onSubmit={async (e) => {
						e.preventDefault()
						const r = await note.call({ sessionId: card.id, note: text.trim() })
						if (r.ok) setWriting(false)
					}}
				>
					<label className="b-label" htmlFor={`note-${card.id}`}>
						I margen
					</label>
					<textarea
						id={`note-${card.id}`}
						className="b-textarea"
						maxLength={2000}
						value={text}
						onChange={(e) => setText(e.target.value)}
						placeholder="Det du vil huske om økta"
					/>
					<div className="b-row" style={{ marginTop: 8 }}>
						<button type="submit" className="b-btn" disabled={note.pending}>
							{note.pending ? 'Skriver …' : 'Skriv i margen'}
						</button>
						<button
							type="button"
							className="b-word"
							onClick={() => setWriting(false)}
						>
							Avbryt
						</button>
					</div>
					<ErrorLine message={note.error} />
				</form>
			) : allowed ? (
				<button
					type="button"
					className="b-word"
					style={{ fontSize: 16, color: 'var(--ink-2)' }}
					onClick={() => setWriting(true)}
				>
					Skriv en kommentar i margen
				</button>
			) : null}
		</div>
	)
}

// ── PS-arket ─────────────────────────────────────────────────────────────

type Mode = 'menu' | 'move' | 'swap' | 'why'

export function PsSheet({
	open,
	onClose,
	card,
	detail,
	week,
	today,
}: {
	open: boolean
	onClose: () => void
	card: SessionCard
	detail: SessionOutput | null
	week: WeekOutput | null
	today: string
}) {
	const [mode, setMode] = useState<Mode>('menu')
	useEffect(() => {
		if (open) setMode('menu')
	}, [open])
	const move = useWrite<
		{ sessionId: string; date?: string },
		MoveSessionOutput
	>('move_session')
	const swap = useWrite<
		{ sessionId: string; otherSessionId: string },
		SwapSessionsOutput
	>('swap_sessions')
	const shorten = useWrite<{ sessionId: string }, ShortenSessionOutput>(
		'shorten_session',
	)
	const ease = useWrite<{ sessionId: string }, ShortenSessionOutput>(
		'ease_session',
	)
	const skip = useWrite<{ sessionId: string }, SkipSessionOutput>(
		'skip_session',
	)
	const easeWeek = useWrite<{ week?: string }, EaseWeekOutput>('ease_week')
	const error =
		move.error ??
		swap.error ??
		shorten.error ??
		ease.error ??
		skip.error ??
		easeWeek.error
	const pending =
		move.pending ||
		swap.pending ||
		shorten.pending ||
		ease.pending ||
		skip.pending ||
		easeWeek.pending
	const can = detail?.can
	const weekKey = mondayOf(card.date)
	const dayWord = (d: string) => DAY_NAME[weekdayOf(d)]
	const isToday = card.date === today

	function done(
		text: string,
		out: { undo: string | null; noUndoBecause: string | null },
	) {
		addPs({ weekKey, text, token: out.undo, noUndoBecause: out.noUndoBecause })
		onClose()
	}

	const moveDays = Array.from({ length: 8 }, (_, i) =>
		addDays(today, i),
	).filter((d) => d !== card.date)
	const swapWith = (week?.days ?? [])
		.flatMap((d) => d.sessions)
		.filter(
			(s) =>
				s.id !== card.id &&
				s.status === 'planned' &&
				s.date >= today &&
				s.date !== card.date,
		)

	const Action = ({
		label,
		allowed,
		why,
		onClick,
		hint,
	}: {
		label: string
		allowed: boolean
		why?: string | null
		onClick: () => void
		hint?: string
	}) => (
		<li>
			<button
				type="button"
				className="b-choice"
				disabled={!allowed || pending}
				onClick={onClick}
			>
				<span>
					{label}
					{hint && allowed ? (
						<span className="b-small" style={{ display: 'block' }}>
							{hint}
						</span>
					) : null}
					{!allowed && why ? (
						<span
							className="b-small"
							style={{ display: 'block', fontStyle: 'italic' }}
						>
							{why}
						</span>
					) : null}
				</span>
				{allowed ? (
					<span aria-hidden style={{ color: 'var(--pencil)' }}>
						→
					</span>
				) : null}
			</button>
		</li>
	)

	return (
		<Sheet
			open={open}
			onClose={onClose}
			title={
				mode === 'move'
					? 'Flytt til …'
					: mode === 'swap'
						? 'Bytt med …'
						: mode === 'why'
							? 'Hvorfor?'
							: `PS om ${dayWord(card.date)}ens økt`
			}
		>
			{mode === 'menu' ? (
				<>
					<p
						className="b-small"
						style={{ margin: '0 0 6px', overflowWrap: 'anywhere' }}
					>
						{card.title}
						{known(card.planned.durationS)
							? `, ${minText(card.planned.durationS.value / 60)}`
							: ''}
						. Det du gjør her blir en PS i ukas brev, og kan angres.
					</p>
					<ul className="b-menu">
						<Action
							label="Flytt til …"
							allowed={can?.move.allowed ?? card.status === 'planned'}
							why={can?.move.why}
							onClick={() => setMode('move')}
						/>
						<Action
							label="Bytt med …"
							allowed={
								(can?.swap.allowed ?? card.status === 'planned') &&
								swapWith.length > 0
							}
							why={
								can?.swap.why ??
								(swapWith.length
									? null
									: 'Ingen andre økter igjen denne uka å bytte med.')
							}
							onClick={() => setMode('swap')}
						/>
						<Action
							label="Kortere"
							hint="30 minutter, samme hensikt"
							allowed={can?.shorten.allowed ?? isToday}
							why={can?.shorten.why ?? 'Bare dagens økt kan kortes ned.'}
							onClick={async () => {
								const r = await shorten.call({ sessionId: card.id })
								if (r.ok)
									done(
										`${card.title} kortet ned${
											r.value.minutesBefore !== null &&
											r.value.minutesAfter !== null
												? ` fra ${Math.round(r.value.minutesBefore)} til ${Math.round(r.value.minutesAfter)} min`
												: ''
										}.`,
										r.value,
									)
							}}
						/>
						<Action
							label="Roligere"
							hint="For sliten i dag: rolig og kortere"
							allowed={can?.makeEasier.allowed ?? isToday}
							why={
								can?.makeEasier.why ?? 'Bare dagens økt kan gjøres roligere.'
							}
							onClick={async () => {
								const r = await ease.call({ sessionId: card.id })
								if (r.ok)
									done(
										`${card.title} gjort roligere${
											r.value.minutesAfter !== null
												? `, nå ${Math.round(r.value.minutesAfter)} min`
												: ''
										}.`,
										r.value,
									)
							}}
						/>
						<Action
							label="Hopp over"
							allowed={can?.skip.allowed ?? card.status === 'planned'}
							why={can?.skip.why}
							onClick={async () => {
								const r = await skip.call({ sessionId: card.id })
								if (r.ok)
									done(
										r.value.state === 'missed'
											? `${card.title} ble ikke gjort, sa du.`
											: `${cap(dayWord(card.date))}ens ${card.title} hoppet over.`,
										r.value,
									)
							}}
						/>
						<Action
							label="Gjør resten av uka lettere"
							hint="Alt som står igjen, 15 % lettere. Én gang i uka."
							allowed
							onClick={async () => {
								const r = await easeWeek.call({})
								if (r.ok)
									done(
										`Uka fra ${dateText(r.value.week)} gjort lettere: ${r.value.sessionsChanged} ${r.value.sessionsChanged === 1 ? 'økt' : 'økter'} skalert ned.`,
										r.value,
									)
							}}
						/>
						<Action
							label="Hvorfor ligger den her?"
							allowed
							onClick={() => setMode('why')}
						/>
					</ul>
				</>
			) : null}
			{mode === 'move' ? (
				<>
					<ul className="b-menu">
						{moveDays.map((d) => {
							const others = (
								week?.days.find((x) => x.date === d)?.sessions ?? []
							).filter((s) => s.status === 'planned')
							const outside = mondayOf(d) !== weekKey
							return (
								<li key={d}>
									<button
										type="button"
										className="b-choice"
										disabled={pending}
										onClick={async () => {
											const r = await move.call({ sessionId: card.id, date: d })
											if (r.ok) {
												const clash = r.value.clashes
													.map((c) => c.text)
													.join(', ')
												done(
													`${card.title} flyttet fra ${dayWord(card.date)} til ${dayWord(d)}${
														d !== today && daysBetween(today, d) >= 7
															? ` ${dateText(d)}`
															: ''
													}.${clash ? ` Merk: ${clash}.` : ''}${
														r.value.leftItsWeek
															? ' Den teller nå i neste ukes mengde.'
															: ''
													}`,
													r.value,
												)
											}
										}}
									>
										<span>
											{d === today ? 'I dag' : cap(dayWord(d))}{' '}
											<span className="b-small">{dateText(d)}</span>
											{others.length ? (
												<span className="b-small" style={{ display: 'block' }}>
													Har fra før: {others.map((o) => o.title).join(', ')}
												</span>
											) : null}
											{outside ? (
												<span className="b-small" style={{ display: 'block' }}>
													neste uke
												</span>
											) : null}
										</span>
										<span aria-hidden style={{ color: 'var(--pencil)' }}>
											→
										</span>
									</button>
								</li>
							)
						})}
					</ul>
					<button
						type="button"
						className="b-word"
						onClick={() => setMode('menu')}
					>
						Tilbake
					</button>
				</>
			) : null}
			{mode === 'swap' ? (
				<>
					<ul className="b-menu">
						{swapWith.map((s) => (
							<li key={s.id}>
								<button
									type="button"
									className="b-choice"
									disabled={pending}
									onClick={async () => {
										const r = await swap.call({
											sessionId: card.id,
											otherSessionId: s.id,
										})
										if (r.ok)
											done(
												`${card.title} og ${s.title} byttet dag (${dayWord(card.date)} og ${dayWord(s.date)}).`,
												r.value,
											)
									}}
								>
									<span style={{ overflowWrap: 'anywhere' }}>
										{cap(dayWord(s.date))}: {s.title}
										{known(s.planned.durationS) ? (
											<N> {minText(s.planned.durationS.value / 60)}</N>
										) : null}
									</span>
									<span aria-hidden style={{ color: 'var(--pencil)' }}>
										⇄
									</span>
								</button>
							</li>
						))}
					</ul>
					<button
						type="button"
						className="b-word"
						onClick={() => setMode('menu')}
					>
						Tilbake
					</button>
				</>
			) : null}
			{mode === 'why' ? (
				<>
					<WhyText card={card} detail={detail} week={week} />
					<button
						type="button"
						className="b-word"
						onClick={() => setMode('menu')}
					>
						Tilbake
					</button>
				</>
			) : null}
			<ErrorLine message={error} />
		</Sheet>
	)
}

const TERMS: Record<string, string> = {
	terskel:
		'Terskel betyr så hardt du kan holde i rundt en time: anstrengt, men kontrollert. Du kan si korte setninger.',
	utholdenhet:
		'Utholdenhet er rolig trening som bygger motoren. Du skal kunne prate hele veien.',
	intervall:
		'Intervaller er korte, harde drag med pauser imellom. Pausene er en del av økta.',
	vo2: 'VO₂-maks-drag er de hardeste: noen få minutter om gangen, nær det du klarer.',
	restitusjon:
		'Restitusjon er så rolig at det nesten føles for lett. Det er meningen.',
	tempo: 'Tempo er litt roligere enn terskel: jevnt og behagelig hardt.',
}

export function termFor(purpose: string | null) {
	if (!purpose) return null
	const p = purpose.toLowerCase()
	for (const k of Object.keys(TERMS)) if (p.includes(k)) return TERMS[k]!
	return null
}

function WhyText({
	card,
	detail,
	week,
}: {
	card: SessionCard
	detail: SessionOutput | null
	week: WeekOutput | null
}) {
	const lines: string[] = []
	if (card.purpose) lines.push(`Økta er ${card.purpose.toLowerCase()}.`)
	const term = termFor(card.purpose)
	if (term) lines.push(term)
	if (week?.phase)
		lines.push(
			`Den hører til fasen ${week.phase.name}, uke ${week.phase.phaseWeek} av ${week.phase.phaseWeeks}.`,
		)
	lines.push(
		card.whose === 'athlete'
			? 'Den er din egen. Jeg endrer den aldri uten å spørre deg.'
			: 'Den er planens. Når uka lukkes, kan jeg foreslå å justere den ut fra det du faktisk har gjort.',
	)
	if (card.adjustedBecause) lines.push(card.adjustedBecause)
	if (detail?.description) lines.push(detail.description)
	return (
		<div>
			{lines.map((l) => (
				<p key={l} className="b-p">
					{l}
				</p>
			))}
			<p className="b-small" style={{ fontStyle: 'italic' }}>
				Hvorfor akkurat {DAY_NAME[weekdayOf(card.date)]}? Planen legger økter på
				dagene du har sagt går, med harde økter fra hverandre og langtur der du
				har mest tid.
			</p>
		</div>
	)
}

/** Distance and pace from a recording, when known. */
export function recordingBits(d: SessionOutput) {
	const r = d.recording
	if (!r) return null
	return {
		dist: known(r.distanceM) ? `${n1(r.distanceM.value / 1000)} km` : null,
		pace: known(r.avgPace) ? paceText(r.avgPace.value) : null,
		hr: known(r.avgHeartRate)
			? `${Math.round(r.avgHeartRate.value)} slag/min`
			: null,
		watt: known(r.avgPower) ? `${Math.round(r.avgPower.value)} W` : null,
		hrWhy: r.avgHeartRate.why,
	}
}
