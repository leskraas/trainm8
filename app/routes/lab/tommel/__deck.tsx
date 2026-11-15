import { animate, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { FlowError, writes } from './__api.ts'
import { ArrowBack, cx, HoldButton, ThumbDown, ThumbUp } from './__ui.tsx'

/**
 * The deck: one card at a time. A card asks one question; its answer runs a
 * handler that may write, and returns what comes next:
 * - `undefined`: the next card already waiting,
 * - a card (or several): shown next, in front of what was waiting,
 * - `null`: the conversation is over.
 */
export type Next = Card | Card[] | null | undefined | void
export type Handler = () => Next | Promise<Next>
export type Dir = 'right' | 'left' | 'up'

export type CardCtx = {
	/** Continue from a card with its own inputs. */
	submit: (h: Handler, dir?: Dir) => void
	busy: boolean
}

export type Card = {
	key: string
	topic: string
	question: ReactNode
	reason?: ReactNode
	/** The back of the card: the rule and the numbers behind it. */
	why?: ReactNode
	extra?: ReactNode
	/** `yesno` (default), `ok` (a message), `custom` (inputs), `swipe-up` (delete). */
	kind?: 'yesno' | 'ok' | 'custom' | 'swipe-up'
	yesLabel?: string
	noLabel?: string
	okLabel?: string
	yes?: Handler
	no?: Handler
	ok?: Handler
	render?: (c: CardCtx) => ReactNode
	/** No way back past this card: what came before was written. */
	checkpoint?: boolean
	/** The topic's right-hand side, e.g. «3 av 12». */
	topicRight?: ReactNode
}

function asList(n: Next): Card[] | null | undefined {
	if (n === null) return null
	if (n === undefined) return undefined
	return Array.isArray(n) ? n : [n]
}

function errorCard(e: unknown): Card {
	const message =
		e instanceof FlowError
			? e.message
			: 'Noe gikk galt hos oss. Ingenting ble endret.'
	return {
		key: `error-${Date.now()}`,
		topic: 'Det gikk ikke',
		question: 'Det gikk ikke.',
		reason: message,
		kind: 'ok',
		okLabel: 'Prøv igjen',
	}
}

export function Deck({
	start,
	onEnd,
	topLeft,
	showCount = true,
	backLabel = 'Forrige kort',
	lockAfterWrite = true,
}: {
	start: Card[]
	onEnd: () => void
	topLeft?: ReactNode
	showCount?: boolean
	backLabel?: string
	/** No «Forrige kort» back past a card whose answer wrote something. */
	lockAfterWrite?: boolean
}) {
	const [queue, setQueue] = useState<Card[]>(start)
	const [history, setHistory] = useState<Card[][]>([])
	const [busy, setBusy] = useState(false)
	const [gone, setGone] = useState(false)
	const [step, setStep] = useState(0)
	const [instant, setInstant] = useState(false)
	const ended = useRef(false)
	const current = queue[0]

	useEffect(() => {
		if (!current && !ended.current) {
			ended.current = true
			onEnd()
		}
	}, [current, onEnd])

	const run = useCallback(
		async (h: Handler | undefined, fly?: Promise<void>) => {
			if (busy || !current) return
			setBusy(true)
			setGone(false)
			const flown = (fly ?? Promise.resolve()).then(() => setGone(true))
			let next: Card[]
			let checkpoint = false
			const before = writes.count
			try {
				const res = asList(h ? await h() : undefined)
				if (res === null) next = []
				else if (res === undefined) next = queue.slice(1)
				else {
					next = [...res, ...queue.slice(1)]
					checkpoint = res.some((c) => c.checkpoint)
				}
			} catch (e) {
				next = [errorCard(e), ...queue]
			}
			if (lockAfterWrite && writes.count !== before) checkpoint = true
			await flown
			setHistory((hs) => (checkpoint ? [] : [...hs, queue]))
			setQueue(next)
			setStep((n) => n + 1)
			setBusy(false)
			setGone(false)
		},
		[busy, current, queue, lockAfterWrite],
	)

	function back() {
		if (busy || history.length === 0) return
		const prev = history[history.length - 1]!
		setHistory(history.slice(0, -1))
		setQueue(prev)
		setStep((n) => n + 1)
	}

	// Arrow keys answer a yes/no card instantly: keyboard actions never animate.
	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if (!current || busy || e.metaKey || e.ctrlKey || e.altKey) return
			const t = e.target as HTMLElement | null
			if (
				t &&
				(/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) ||
					t.isContentEditable ||
					t.getAttribute('role') === 'spinbutton')
			)
				return
			const kind = current.kind ?? 'yesno'
			const h =
				kind === 'yesno' && e.key === 'ArrowRight'
					? current.yes
					: kind === 'yesno' && e.key === 'ArrowLeft'
						? current.no
						: kind === 'ok' && e.key === 'ArrowRight'
							? current.ok
							: null
			if (h === null) return
			setInstant(true)
			void run(h)
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [current, busy, run])

	const waiting = Math.max(0, queue.length - 1)

	return (
		<div className="tm-deck">
			<div className="tm-top">
				<button
					type="button"
					className="tm-iconbtn"
					onClick={back}
					hidden={history.length === 0}
					aria-label={backLabel}
				>
					<ArrowBack />
					<span style={{ fontSize: 14 }}>{backLabel}</span>
				</button>
				{history.length === 0 ? topLeft : null}
			</div>
			<div className="tm-cardzone">
				{current && !(busy && gone) ? (
					<div
						className={instant ? 'tm-rise is-instant' : 'tm-rise'}
						key={`${current.key}:${step}`}
					>
						<SwipeCard
							card={current}
							busy={busy}
							onAnswer={(h, fly) => {
								setInstant(false)
								void run(h, fly)
							}}
						/>
					</div>
				) : busy ? (
					<div className="tm-rise" key="pending">
						<div className="tm-card" style={{ width: '100%' }}>
							<div className="tm-topic">Et øyeblikk</div>
							<p className="tm-q tm-wait" aria-live="polite">
								<span className="tm-dots">Jeg ordner det</span>
							</p>
						</div>
					</div>
				) : null}
			</div>
			<div className="tm-stack" aria-live="polite">
				{showCount && waiting > 0 ? (
					<>
						<span className="tm-stack-bars" aria-hidden="true">
							{Array.from({ length: Math.min(3, waiting) }, (_, i) => (
								<i key={i} />
							))}
						</span>
						<span className="num">
							{waiting === 1 ? '1 kort til' : `${waiting} kort til`}
						</span>
					</>
				) : null}
			</div>
		</div>
	)
}

// ── one card: drag it, tap it, flip it ─────────────────────────────────

function clamp(v: number, a: number, b: number) {
	return Math.min(b, Math.max(a, v))
}

export function SwipeCard({
	card,
	busy,
	onAnswer,
}: {
	card: Card
	busy: boolean
	onAnswer: (h: Handler | undefined, fly?: Promise<void>) => void
}) {
	const reduce = useReducedMotion() ?? false
	const kind = card.kind ?? 'yesno'
	const [flipped, setFlipped] = useState(false)
	const dragRef = useRef<HTMLDivElement>(null)
	const yesStamp = useRef<HTMLSpanElement>(null)
	const noStamp = useRef<HTMLSpanElement>(null)
	const upStamp = useRef<HTMLSpanElement>(null)
	const g = useRef<{
		x: number
		y: number
		id: number
		axis: 'x' | 'y' | null
		hist: Array<{ p: number; t: number }>
	} | null>(null)
	const swipeable = !reduce && !flipped && kind !== 'custom'
	const vertical = kind === 'swipe-up'

	function setPos(p: number) {
		const el = dragRef.current
		if (!el) return
		if (vertical) {
			el.style.transform = `translate3d(0, ${p}px, 0)`
			if (upStamp.current)
				upStamp.current.style.opacity = String(
					clamp(-p / (el.offsetHeight * 0.3), 0, 1),
				)
			return
		}
		const w = el.offsetWidth || 360
		const rot = clamp((p / w) * 12, -8, 8)
		el.style.transform = `translate3d(${p}px, 0, 0) rotate(${rot}deg)`
		const k = clamp(Math.abs(p) / (w * 0.35), 0, 1)
		if (yesStamp.current)
			yesStamp.current.style.opacity = p > 0 ? String(k) : '0'
		if (noStamp.current) noStamp.current.style.opacity = p < 0 ? String(k) : '0'
	}

	function fly(dir: Dir, from = 0): Promise<void> {
		const el = dragRef.current
		if (!el) return Promise.resolve()
		if (reduce) {
			return el
				.animate([{ opacity: 1 }, { opacity: 0 }], {
					duration: 150,
					easing: 'ease',
					fill: 'forwards',
				})
				.finished.then(() => undefined)
		}
		const w = el.offsetWidth || 360
		const h = el.offsetHeight || 600
		const fromT = el.style.transform || 'translate3d(0,0,0)'
		let to: string
		if (dir === 'up') to = `translate3d(0, ${-(h + 120)}px, 0)`
		else {
			const s = dir === 'right' ? 1 : -1
			to = `translate3d(${s * (w * 1.3 + Math.abs(from) * 0.2)}px, 0, 0) rotate(${s * 8}deg)`
		}
		return el
			.animate([{ transform: fromT }, { transform: to }], {
				duration: 220,
				easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
				fill: 'forwards',
			})
			.finished.then(() => undefined)
	}

	function answer(dir: Dir, h: Handler | undefined, from = 0) {
		if (busy) return
		onAnswer(h, fly(dir, from))
	}

	function handlerFor(dir: Dir): Handler | undefined {
		if (kind === 'ok') return card.ok
		if (kind === 'swipe-up') return dir === 'up' ? card.yes : undefined
		return dir === 'right' ? card.yes : card.no
	}

	function onPointerDown(e: React.PointerEvent) {
		if (!swipeable || busy || e.button !== 0 || g.current) return
		const t = e.target as HTMLElement
		if (t.closest('input,textarea,select,[data-nodrag]')) return
		g.current = {
			x: e.clientX,
			y: e.clientY,
			id: e.pointerId,
			axis: null,
			hist: [],
		}
	}

	function onPointerMove(e: React.PointerEvent) {
		const s = g.current
		if (!s || e.pointerId !== s.id) return
		const dx = e.clientX - s.x
		const dy = e.clientY - s.y
		if (!s.axis) {
			if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) return
			const axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
			if ((vertical && axis !== 'y') || (!vertical && axis !== 'x')) {
				g.current = null
				return
			}
			s.axis = axis
			dragRef.current?.setPointerCapture(e.pointerId)
		}
		let p = vertical ? dy : dx
		if (vertical && p > 0) p = (p * 0.55 * 300) / (300 + 0.55 * p) // resist downward
		s.hist.push({ p, t: e.timeStamp })
		if (s.hist.length > 6) s.hist.shift()
		setPos(p)
	}

	function onPointerUp(e: React.PointerEvent) {
		const s = g.current
		g.current = null
		if (!s || !s.axis || e.pointerId !== s.id) return
		const el = dragRef.current
		const last = s.hist[s.hist.length - 1]
		const first = s.hist[0]
		const p = last?.p ?? 0
		const v =
			last && first && last.t > first.t
				? (last.p - first.p) / (last.t - first.t)
				: 0
		const size = vertical ? (el?.offsetHeight ?? 600) : (el?.offsetWidth ?? 360)
		const far = Math.abs(p) > size * 0.35
		const flick =
			Math.abs(v) > 0.35 && Math.abs(p) > 40 && Math.sign(v) === Math.sign(p)
		if (far || flick) {
			if (vertical) {
				if (p < 0) return answer('up', handlerFor('up'), p)
			} else {
				const dir: Dir = p > 0 ? 'right' : 'left'
				return answer(dir, handlerFor(dir), p)
			}
		}
		// Not far enough: spring home, carrying the finger's speed, no bounce.
		void animate(p, 0, {
			type: 'spring',
			bounce: 0,
			duration: 0.35,
			velocity: v * 1000,
			onUpdate: setPos,
		})
	}

	const front = (
		<div className="tm-card">
			<div className="tm-topic">
				<span>{card.topic}</span>
				{card.topicRight ? (
					<span className="num">{card.topicRight}</span>
				) : null}
			</div>
			<span ref={yesStamp} className="tm-stamp yes" aria-hidden="true">
				{kind === 'ok' ? 'Ok' : 'Ja'}
			</span>
			<span ref={noStamp} className="tm-stamp no" aria-hidden="true">
				{kind === 'ok' ? 'Ok' : 'Nei'}
			</span>
			{vertical ? (
				<span ref={upStamp} className="tm-stamp up" aria-hidden="true">
					Slett
				</span>
			) : null}
			<div className="tm-card-scroll">
				<h2 className="tm-q">{card.question}</h2>
				{card.reason ? <p className="tm-reason">{card.reason}</p> : null}
				{card.extra ? <div className="tm-extra">{card.extra}</div> : null}
				{kind === 'custom' && card.render ? (
					<div className="tm-extra">
						{card.render({
							busy,
							submit: (h, dir = 'right') => answer(dir, h),
						})}
					</div>
				) : null}
			</div>
			<div className="tm-spacer" style={{ flex: '0 0 auto' }} />
			{kind === 'yesno' ? (
				<div className="tm-answers">
					<button
						type="button"
						className="tm-target no"
						disabled={busy}
						onClick={() => answer('left', card.no)}
						aria-label={card.noLabel ?? 'Nei'}
					>
						<ThumbDown />
					</button>
					{card.why ? (
						<button
							type="button"
							className="tm-why"
							onClick={() => setFlipped(true)}
						>
							Hvorfor?
						</button>
					) : (
						<span />
					)}
					<button
						type="button"
						className="tm-target yes"
						disabled={busy}
						onClick={() => answer('right', card.yes)}
						aria-label={card.yesLabel ?? 'Ja'}
					>
						<ThumbUp />
					</button>
				</div>
			) : kind === 'ok' ? (
				<div style={{ display: 'grid', gap: 4, paddingTop: 8 }}>
					<button
						type="button"
						className="tm-wide ink"
						disabled={busy}
						onClick={() => answer('right', card.ok)}
					>
						{card.okLabel ?? 'Ok'}
					</button>
					{card.why ? (
						<button
							type="button"
							className="tm-why"
							onClick={() => setFlipped(true)}
						>
							Hvorfor?
						</button>
					) : null}
				</div>
			) : kind === 'swipe-up' ? (
				<div style={{ display: 'grid', gap: 12, paddingTop: 8 }}>
					<div className="tm-swipeup-hint" aria-hidden="true">
						<svg
							width="28"
							height="28"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M12 19V5" />
							<path d="m5 12 7-7 7 7" />
						</svg>
						Sveip opp
					</div>
					<HoldButton onConfirm={() => answer('up', card.yes)}>
						Hold for å slette
					</HoldButton>
					<button
						type="button"
						className="tm-wide ghost"
						disabled={busy}
						onClick={() => answer('left', card.no)}
					>
						{card.noLabel ?? 'Nei, avbryt'}
					</button>
				</div>
			) : card.why ? (
				<button
					type="button"
					className="tm-why"
					onClick={() => setFlipped(true)}
				>
					Hvorfor?
				</button>
			) : null}
		</div>
	)

	return (
		<div
			ref={dragRef}
			className={cx('tm-drag', vertical && 'is-vertical')}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
			onPointerCancel={onPointerUp}
		>
			<div className={cx('tm-flip', flipped && 'is-flipped')}>
				<div className="tm-flip-inner">
					<div className="tm-face front" inert={flipped}>
						{front}
					</div>
					{card.why ? (
						<div className="tm-face back" inert={!flipped}>
							<div className="tm-card">
								<div className="tm-back-title">Hvorfor</div>
								<div className="tm-card-scroll">
									<div className="tm-back-body">{card.why}</div>
								</div>
								<button
									type="button"
									className="tm-wide ink"
									style={{ marginTop: 12 }}
									onClick={() => setFlipped(false)}
								>
									Snu tilbake
								</button>
							</div>
						</div>
					) : null}
				</div>
			</div>
		</div>
	)
}
