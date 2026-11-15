import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'react'
import { Link, useNavigate } from 'react-router'
import { useCapability } from '#app/lab/engine/client.ts'
import { type PlanWeek, type SessionCard } from '#app/lab/engine/reads.types.ts'
import {
	type EaseSessionOutput,
	type EaseWeekInput,
	type EaseWeekOutput,
	type MarkDoneOutput,
	type MoveSessionInput,
	type MoveSessionOutput,
	type ReleaseSessionOutput,
	type SessionIdInput,
	type ShortenSessionOutput,
	type SkipSessionOutput,
	type SwapSessionsInput,
	type SwapSessionsOutput,
} from '#app/lab/engine/sessions.types.ts'
import { Feeling } from './__feeling.tsx'
import { type LandscapeData, type PathData } from './__landscape.server.ts'
import {
	BASE,
	EmptyTrail,
	Known,
	Spinner,
	Stone,
	type StoneFill,
	addDays,
	daysBetween,
	fmtDay,
	fmtDuration,
	fmtNumber,
	markChange,
	mondayOf,
	phaseName,
	phaseWhat,
	plural,
	relDay,
	rpeColor,
	setMerke,
	sportLetter,
	useMerke,
	useReducedMotion,
	useUndoMerke,
	wdShort,
	weekdayOf,
} from './__ui.tsx'

type Zoom = 'near' | 'far'

export function Landscape({
	data,
	initialZoom,
}: {
	data: LandscapeData
	initialZoom: Zoom
}) {
	if (data.kind === 'error') {
		return (
			<main
				style={{
					padding: '96px 24px',
					maxWidth: 520,
					margin: '0 auto',
					display: 'grid',
					gap: 16,
				}}
			>
				<EmptyTrail height={160} />
				<p style={{ fontSize: 18, textAlign: 'center' }}>
					Stien ble borte i tåka.
				</p>
				<p className="sti-err" style={{ textAlign: 'center' }}>
					{data.message}
				</p>
				<Link to={BASE} className="sti-btn" reloadDocument>
					Prøv igjen
				</Link>
			</main>
		)
	}
	if (data.kind === 'start') {
		const first = data.athlete.setup.firstOpen
		return (
			<main
				style={{
					minHeight: '100dvh',
					display: 'flex',
					flexDirection: 'column',
					justifyContent: 'center',
					alignItems: 'center',
					padding: '64px 24px calc(env(safe-area-inset-bottom, 0px) + 40px)',
					textAlign: 'center',
					gap: 20,
				}}
			>
				<EmptyTrail height={260} />
				<h1
					style={{
						fontSize: 26,
						lineHeight: 1.25,
						fontWeight: 700,
						maxWidth: 320,
					}}
				>
					{first
						? 'Her starter du. La oss finne ut hvor du skal.'
						: 'Du er på vei. Stien er ikke tegnet ferdig.'}
				</h1>
				<p
					className="soft"
					style={{ maxWidth: 320, fontSize: 16, lineHeight: 1.45 }}
				>
					{first
						? 'Fem spørsmål om deg, sporene dine, og målet. Så legger jeg stien.'
						: 'Fortsett der du slapp. Svarene du har gitt, ligger i sekken.'}
				</p>
				<Link
					to={first ? `${BASE}/start/1` : `${BASE}/start`}
					className="sti-btn"
					style={{ minWidth: 220 }}
				>
					{first ? 'Finn veien' : 'Fortsett'}
				</Link>
			</main>
		)
	}
	return <PathView data={data} initialZoom={initialZoom} />
}

// ── Geometry ─────────────────────────────────────────────────────────────────

function curveX(y: number, width: number, amp: number, period: number) {
	return width / 2 + Math.sin(y / period + 0.7) * amp
}

function pathD(y0: number, y1: number, fx: (y: number) => number, step = 6) {
	const pts: string[] = []
	const lo = Math.min(y0, y1)
	const hi = Math.max(y0, y1)
	for (let y = lo; y <= hi; y += step)
		pts.push(`${pts.length ? 'L' : 'M'}${fx(y).toFixed(1)} ${y.toFixed(1)}`)
	pts.push(`L${fx(hi).toFixed(1)} ${hi.toFixed(1)}`)
	return pts.join(' ')
}

/** Steepness of each plan week, from -1 (downhill) to 1 (steep climb). */
function weekSteepness(weeks: PlanWeek[]) {
	const out = new Map<string, number>()
	weeks.forEach((w, i) => {
		const prev = weeks[i - 1]
		const load = w.projectedLoad.value
		const prevLoad = prev?.projectedLoad.value ?? null
		let s = 0
		if (w.role === 'recovery' || w.role === 'taper') s = -0.6
		else if (load !== null && prevLoad !== null && prevLoad > 0)
			s = Math.max(-1, Math.min(1, ((load - prevLoad) / prevLoad) * 6))
		else if (w.role === 'loading') s = 0.3
		out.set(w.weekKey, s)
	})
	return out
}
function terrainColor(s: number | undefined) {
	if (s === undefined) return 'var(--fog)'
	const t = Math.round(((s + 1) / 2) * 100)
	return `color-mix(in oklab, var(--t1) ${t}%, var(--t0))`
}

function isDone(s: SessionCard) {
	return s.status === 'done' || s.status === 'recording-only'
}
function stoneFill(s: SessionCard, today: string): StoneFill {
	if (s.status === 'done') return s.verdict.call === 'under' ? 'half' : 'full'
	if (s.status === 'recording-only') return 'full'
	if (s.status === 'missed') return 'struck'
	if (s.date < today) return 'fog'
	return 'empty'
}
function minutesOf(s: SessionCard) {
	return s.planned.durationS.value ?? s.actual.durationS.value
}
function sessionLine(s: SessionCard) {
	const what = s.purpose ?? s.title
	if (s.sport === 'strength') {
		const n = s.strengthSetsLogged
		return `${what}${n ? ` · ${plural(n, 'sett', 'sett')}` : ''}`
	}
	const sec = minutesOf(s)
	return sec
		? `${fmtDuration(sec)} · ${what.toLowerCase() === what ? what : what.charAt(0).toLowerCase() + what.slice(1)}`
		: what
}

function lastDoneDay(sessions: SessionCard[], today: string) {
	let best: string | null = null
	for (const s of sessions)
		if (isDone(s) && s.date <= today && (!best || s.date > best)) best = s.date
	return best
}

function usePersisted<T extends string>(key: string, initial: T) {
	const [v, setV] = useState<T>(initial)
	const set = useCallback(
		(next: T) => {
			setV(next)
			try {
				sessionStorage.setItem(key, next)
			} catch {
				// not remembered between visits
			}
		},
		[key],
	)
	return [v, set] as const
}

function useWide() {
	const [wide, setWide] = useState(false)
	useEffect(() => {
		const mq = window.matchMedia('(min-width: 1024px)')
		setWide(mq.matches)
		const on = () => setWide(mq.matches)
		mq.addEventListener('change', on)
		return () => mq.removeEventListener('change', on)
	}, [])
	return wide
}

// ── The view: two distances of the same path ────────────────────────────────

function PathView({
	data,
	initialZoom,
}: {
	data: PathData
	initialZoom: Zoom
}) {
	const [zoom, setZoomState] = usePersisted<Zoom>('sti-zoom', initialZoom)
	const wide = useWide()
	const reduce = useReducedMotion()
	const surface = useRef<HTMLDivElement>(null)
	const pinchLayer = useRef<HTMLDivElement>(null)
	const [menu, setMenu] = useState<SessionCard | null>(null)
	const [feeling, setFeeling] = useState<SessionCard | null>(null)
	const zoomRef = useRef(zoom)
	zoomRef.current = zoom

	const setZoom = useCallback(
		(z: Zoom) => {
			setZoomState(z)
			try {
				window.history.replaceState(
					window.history.state,
					'',
					z === 'far' ? `${BASE}/oversikt` : BASE,
				)
			} catch {
				// the address stays; the view still changes
			}
		},
		[setZoomState],
	)

	// Pinch between near and far: the surface follows the fingers, then settles.
	useEffect(() => {
		const el = surface.current
		const layer = pinchLayer.current
		if (!el || !layer || wide) return
		let d0 = 0
		let s = 1
		function dist(t: TouchList) {
			const a = t[0]!
			const b = t[1]!
			return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
		}
		function onStart(e: TouchEvent) {
			if (e.touches.length === 2) {
				d0 = dist(e.touches)
				s = 1
				const r = layer!.getBoundingClientRect()
				const mx = (e.touches[0]!.clientX + e.touches[1]!.clientX) / 2 - r.left
				const my = (e.touches[0]!.clientY + e.touches[1]!.clientY) / 2 - r.top
				layer!.style.transformOrigin = `${mx}px ${my}px`
			}
		}
		function onMove(e: TouchEvent) {
			if (e.touches.length !== 2 || !d0) return
			e.preventDefault()
			s = Math.max(0.5, Math.min(1.8, dist(e.touches) / d0))
			if (!reduce) layer!.style.transform = `scale(${s})`
		}
		function onEnd(e: TouchEvent) {
			if (!d0 || e.touches.length > 0) return
			d0 = 0
			const from = s
			const z = zoomRef.current
			if (z === 'near' && from < 0.85) setZoom('far')
			else if (z === 'far' && from > 1.18) setZoom('near')
			if (!reduce && from !== 1) {
				layer!.animate(
					[{ transform: `scale(${from})` }, { transform: 'scale(1)' }],
					{
						duration: 280,
						easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
					},
				)
			}
			layer!.style.transform = ''
			s = 1
		}
		el.addEventListener('touchstart', onStart, { passive: true })
		el.addEventListener('touchmove', onMove, { passive: false })
		el.addEventListener('touchend', onEnd)
		el.addEventListener('touchcancel', onEnd)
		return () => {
			el.removeEventListener('touchstart', onStart)
			el.removeEventListener('touchmove', onMove)
			el.removeEventListener('touchend', onEnd)
			el.removeEventListener('touchcancel', onEnd)
		}
	}, [wide, reduce, setZoom])

	const goal = data.plan?.plan?.goal ?? data.athlete.goal
	const daysToGo = goal?.daysToGo ?? null
	const [mounted, setMounted] = useState(false)
	useEffect(() => setMounted(true), [])
	if (!mounted) {
		// The path is measured and scrolled in the browser; the server sends a quiet trail.
		return (
			<div
				style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}
				aria-busy="true"
			>
				<EmptyTrail height={180} />
			</div>
		)
	}

	return (
		<div
			ref={surface}
			style={{
				minHeight: '100dvh',
				touchAction: wide ? undefined : 'pan-x pan-y',
			}}
			onDoubleClick={(e) => {
				if (wide) return
				if (
					(e.target as HTMLElement).closest(
						'button,a,input,textarea,[role="slider"]',
					)
				)
					return
				setZoom(zoom === 'near' ? 'far' : 'near')
			}}
		>
			<div ref={pinchLayer} style={{ willChange: 'transform' }}>
				{data.sessionsError ? (
					<p
						className="sti-err"
						role="alert"
						style={{
							padding: '16px 16px 0',
							maxWidth: 520,
							margin: '0 auto',
						}}
					>
						Øktene langs stien kom ikke: {data.sessionsError}
					</p>
				) : null}
				{wide ? (
					<div
						style={{
							display: 'grid',
							gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
							gap: 0,
							maxWidth: 1280,
							margin: '0 auto',
						}}
					>
						<div style={{ borderRight: '1px solid var(--ink-faint)' }}>
							<Near data={data} onMenu={setMenu} onFeeling={setFeeling} />
						</div>
						<div
							style={{
								position: 'sticky',
								top: 0,
								alignSelf: 'start',
								maxHeight: '100dvh',
								overflowY: 'auto',
								overscrollBehavior: 'contain',
							}}
						>
							<Far data={data} />
						</div>
					</div>
				) : (
					<div key={zoom} className="sti-zoom-in" data-dir={zoom}>
						{zoom === 'near' ? (
							<Near data={data} onMenu={setMenu} onFeeling={setFeeling} />
						) : (
							<Far data={data} />
						)}
					</div>
				)}
			</div>
			<style>{`
.sti-zoom-in { transition: opacity 240ms ease, transform 280ms var(--ease-out); }
@starting-style { .sti-zoom-in[data-dir="far"] { opacity: 0; transform: scale(1.04); } .sti-zoom-in[data-dir="near"] { opacity: 0; transform: scale(.96); } }
@media (prefers-reduced-motion: reduce) { .sti-zoom-in { transition: opacity 200ms ease; } @starting-style { .sti-zoom-in[data-dir] { transform: none; } } }
`}</style>
			<ControlBar
				zoom={zoom}
				setZoom={setZoom}
				wide={wide}
				goalName={goal?.kind === 'event' ? goal.name : null}
				daysToGo={daysToGo}
			/>
			{menu ? (
				<StoneMenu
					card={menu}
					data={data}
					onClose={() => setMenu(null)}
					onFeeling={setFeeling}
				/>
			) : null}
			{feeling ? (
				<FeelingSheet card={feeling} onClose={() => setFeeling(null)} />
			) : null}
		</div>
	)
}

function ControlBar({
	zoom,
	setZoom,
	wide,
	goalName,
	daysToGo,
}: {
	zoom: Zoom
	setZoom: (z: Zoom) => void
	wide: boolean
	goalName: string | null
	daysToGo: number | null
}) {
	return (
		<nav
			aria-label="Stien"
			style={{
				position: 'fixed',
				left: 0,
				right: 0,
				bottom: 0,
				zIndex: 40,
				padding: '10px 12px calc(env(safe-area-inset-bottom, 0px) + 10px)',
				display: 'flex',
				alignItems: 'center',
				gap: 8,
				justifyContent: 'space-between',
				pointerEvents: 'none',
			}}
		>
			<Link
				to={`${BASE}/flagg`}
				className="sti-btn quiet small"
				style={{
					pointerEvents: 'auto',
					background: 'var(--card)',
					backdropFilter: 'blur(12px)',
					maxWidth: '34vw',
				}}
				aria-label={goalName ? `Flagget: ${goalName}` : 'Flagget'}
			>
				<svg
					width="16"
					height="18"
					viewBox="0 0 16 18"
					aria-hidden
					style={{ flexShrink: 0 }}
				>
					<path
						d="M3 17V2"
						stroke="currentColor"
						strokeWidth="1.8"
						strokeLinecap="round"
					/>
					<path d="M3 2.5h10l-3 3.2 3 3.3H3" fill="var(--dot)" />
				</svg>
				<span
					className="num"
					style={{
						whiteSpace: 'nowrap',
						overflow: 'hidden',
						textOverflow: 'ellipsis',
					}}
				>
					{daysToGo !== null && daysToGo >= 0 ? `${daysToGo} d` : 'Flagg'}
				</span>
			</Link>
			{!wide ? (
				<div
					role="radiogroup"
					aria-label="Avstand"
					style={{
						pointerEvents: 'auto',
						display: 'flex',
						background: 'var(--card)',
						borderRadius: 14,
						padding: 3,
						border: '1px solid var(--ink-faint)',
						boxShadow: '0 6px 20px rgba(0,0,0,.08)',
					}}
				>
					{(['near', 'far'] as const).map((z) => (
						<button
							key={z}
							type="button"
							role="radio"
							aria-checked={zoom === z}
							onClick={() => setZoom(z)}
							style={{
								minHeight: 42,
								minWidth: 72,
								border: 0,
								borderRadius: 11,
								cursor: 'pointer',
								fontWeight: 650,
								fontSize: 15,
								background: zoom === z ? 'var(--ink)' : 'transparent',
								color: zoom === z ? 'var(--sky)' : 'var(--ink)',
								transition: 'background-color 160ms ease, color 160ms ease',
							}}
						>
							{z === 'near' ? 'Nær' : 'Fjern'}
						</button>
					))}
				</div>
			) : (
				<span />
			)}
			<Link
				to={`${BASE}/sekk`}
				className="sti-btn quiet small"
				aria-label="Sekken: innstillinger"
				style={{
					pointerEvents: 'auto',
					background: 'var(--card)',
					width: 52,
					padding: 0,
				}}
			>
				<svg width="22" height="24" viewBox="0 0 26 28" aria-hidden>
					<path
						d="M5 9c0-4 3.5-7 8-7s8 3 8 7v15a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
					/>
					<path
						d="M9 14h8"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
					/>
				</svg>
			</Link>
		</nav>
	)
}

// ── Nærbildet ────────────────────────────────────────────────────────────────

type Row = {
	date: string
	sessions: SessionCard[]
	kind: 'today' | 'session' | 'rest' | 'goal'
	y: number
	h: number
}

function useWidth(ref: React.RefObject<HTMLElement | null>, fallback = 390) {
	const [w, setW] = useState(fallback)
	useLayoutEffect(() => {
		const el = ref.current
		if (!el) return
		setW(el.clientWidth)
		const ro = new ResizeObserver(() => setW(el.clientWidth))
		ro.observe(el)
		return () => ro.disconnect()
	}, [ref])
	return w
}

function Near({
	data,
	onMenu,
	onFeeling,
}: {
	data: PathData
	onMenu: (s: SessionCard) => void
	onFeeling: (s: SessionCard) => void
}) {
	const navigate = useNavigate()
	const box = useRef<HTMLDivElement>(null)
	const dotEl = useRef<HTMLDivElement>(null)
	const W = useWidth(box)
	const reduce = useReducedMotion()
	const today = data.athlete.today
	const plan = data.plan?.plan ?? null
	const goal = plan?.goal ?? data.athlete.goal
	const goalDay =
		goal?.kind === 'event' && goal.date && goal.date >= today ? goal.date : null
	const move = useCapability<MoveSessionInput, MoveSessionOutput>(
		'move_session',
	)
	const swap = useCapability<SwapSessionsInput, SwapSessionsOutput>(
		'swap_sessions',
	)
	const done = useCapability<SessionIdInput, MarkDoneOutput>('mark_done')
	const [hover, setHover] = useState<string | null>(null)
	const [busy, setBusy] = useState<string | null>(null)
	const merke = useMerke()
	const undoMerke = useUndoMerke()

	const steep = useMemo(() => weekSteepness(plan?.weeks ?? []), [plan])
	const planWeekBy = useMemo(
		() => new Map((plan?.weeks ?? []).map((w) => [w.weekKey, w])),
		[plan],
	)

	const rows = useMemo(() => {
		const from = addDays(today, -14)
		let to = addDays(today, 21)
		if (goalDay && daysBetween(today, goalDay) <= 49) to = goalDay
		else if (goalDay && goalDay < to) to = goalDay
		const byDay = new Map<string, SessionCard[]>()
		for (const s of data.sessions) {
			if (s.date < from || s.date > to) continue
			byDay.set(s.date, [...(byDay.get(s.date) ?? []), s])
		}
		const out: Row[] = []
		let y = 110
		for (let d = to; d >= from; d = addDays(d, -1)) {
			const sessions = (byDay.get(d) ?? []).sort((a, b) =>
				(a.time ?? '').localeCompare(b.time ?? ''),
			)
			const kind: Row['kind'] =
				d === goalDay
					? 'goal'
					: d === today
						? 'today'
						: sessions.length
							? 'session'
							: 'rest'
			const h =
				kind === 'today'
					? 300
					: kind === 'goal'
						? 150
						: kind === 'session'
							? 96
							: 40
			out.push({ date: d, sessions, kind, y: y + h / 2, h })
			y += h
		}
		return { rows: out, height: y + 140 }
	}, [data.sessions, today, goalDay])

	const amp = Math.min(W * 0.2, 88)
	const fx = useCallback((y: number) => curveX(y, W, amp, 150), [W, amp])
	const rowOf = useMemo(
		() => new Map(rows.rows.map((r) => [r.date, r])),
		[rows],
	)
	const todayRow = rowOf.get(today)
	const doneDay = lastDoneDay(
		data.sessions.filter(
			(s) => s.date >= rows.rows[rows.rows.length - 1]!.date,
		),
		today,
	)
	const stoneY = (r: Row) => (r.kind === 'today' ? r.y - 90 : r.y)
	const dotY =
		doneDay && rowOf.get(doneDay)
			? stoneY(rowOf.get(doneDay)!) + 34
			: rows.height - 120

	// Scroll today into the middle on arrival.
	useLayoutEffect(() => {
		if (!todayRow || !box.current) return
		const top = box.current.getBoundingClientRect().top + window.scrollY
		window.scrollTo({
			top: Math.max(0, top + todayRow.y - 90 - window.innerHeight * 0.36),
		})
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// The dot walks one step when something is recorded. The only motion of its kind.
	useLayoutEffect(() => {
		const el = dotEl.current
		if (!el) return
		let prev: string | null = null
		try {
			prev = sessionStorage.getItem('sti-dot')
			sessionStorage.setItem('sti-dot', doneDay ?? '')
		} catch {
			prev = null
		}
		if (!prev || !doneDay || prev >= doneDay || reduce) return
		const fromRow = rowOf.get(prev)
		if (!fromRow) return
		const y0 = stoneY(fromRow) + 34
		const frames = Array.from({ length: 12 }, (_, i) => {
			const y = y0 + ((dotY - y0) * i) / 11
			return { transform: `translate(${fx(y) - 12}px, ${y - 12}px)` }
		})
		el.animate(frames, {
			duration: 400,
			easing: 'cubic-bezier(0.77, 0, 0.175, 1)',
		})
	}, [doneDay, dotY, fx, reduce, rowOf])

	function rowAt(clientY: number) {
		const top = box.current!.getBoundingClientRect().top
		const y = clientY - top
		let best: Row | null = null
		for (const r of rows.rows)
			if (!best || Math.abs(r.y - y) < Math.abs(best.y - y)) best = r
		return best
	}

	async function drop(card: SessionCard, clientX: number, clientY: number) {
		setHover(null)
		const row = rowAt(clientY)
		if (!row || row.date === card.date) return
		if (row.date < today) {
			setMerke({
				text: 'Bakover går ikke. Slipp den på i dag eller senere.',
				token: null,
				noUndo: null,
				kind: 'session',
				sessionIds: [],
			})
			return
		}
		const left = box.current!.getBoundingClientRect().left
		const other = row.sessions.find((s, i) => {
			if (s.id === card.id || s.status !== 'planned') return false
			const x = fx(stoneY(row)) + (i - (row.sessions.length - 1) / 2) * 56
			return Math.abs(clientX - left - x) < 60
		})
		setBusy(card.id)
		if (other) {
			const r = await swap.call({
				sessionId: card.id,
				otherSessionId: other.id,
			})
			if (r.ok)
				markChange(`Byttet: ${card.title} og ${other.title}.`, r.value, [
					card.id,
					other.id,
				])
			else
				setMerke({
					text: r.message,
					token: null,
					noUndo: null,
					kind: 'session',
					sessionIds: [],
				})
		} else {
			const r = await move.call({ sessionId: card.id, date: row.date })
			if (r.ok) {
				const warn = r.value.clashes.map((c) => c.text).join(', ')
				markChange(
					`Flyttet til ${relDay(row.date, today)}.${warn ? ` Obs: ${warn}.` : ''}`,
					r.value,
					[card.id],
				)
			} else
				setMerke({
					text: r.message,
					token: null,
					noUndo: null,
					kind: 'session',
					sessionIds: [],
				})
		}
		setBusy(null)
	}

	async function markDone(card: SessionCard) {
		if (card.sport === 'strength')
			return void navigate(`${BASE}/styrke/${card.id}`)
		setBusy(card.id)
		const r = await done.call({ sessionId: card.id })
		setBusy(null)
		if (!r.ok)
			return setMerke({
				text: r.message,
				token: null,
				noUndo: null,
				kind: 'session',
				sessionIds: [],
			})
		markChange('Gjort. Prikken gikk et steg.', r.value, [card.id])
		onFeeling(card)
	}

	const todayOpen = (todayRow?.sessions ?? []).filter(
		(s) => s.status === 'planned',
	)
	const mainToday =
		todayOpen.find((s) => s.sport !== 'strength') ?? todayOpen[0] ?? null
	const weeksInRange = useMemo(() => {
		const ws = new Map<string, { top: number; bottom: number }>()
		for (const r of rows.rows) {
			const wk = mondayOf(r.date)
			const e = ws.get(wk)
			const t = r.y - r.h / 2
			const b = r.y + r.h / 2
			ws.set(
				wk,
				e
					? { top: Math.min(e.top, t), bottom: Math.max(e.bottom, b) }
					: { top: t, bottom: b },
			)
		}
		return [...ws.entries()]
	}, [rows])

	const proposals = data.proposals
	const waiting =
		proposals?.proposals.filter((p) => p.state === 'waiting') ?? []
	const autoChanges =
		proposals?.changesMade && proposals.changesMade.undoable > 0
			? proposals.changesMade
			: null
	const firstRowDate = rows.rows[rows.rows.length - 1]?.date
	const hasPast = data.sessions.some(
		(s) =>
			isDone(s) && firstRowDate && s.date >= firstRowDate && s.date < today,
	)

	return (
		<div
			ref={box}
			style={{ position: 'relative', height: rows.height, overflow: 'hidden' }}
		>
			<Altimeter data={data} compact />
			<svg
				width={W}
				height={rows.height}
				style={{ position: 'absolute', inset: 0 }}
				aria-hidden
			>
				{weeksInRange.map(([wk, span]) => (
					<path
						key={wk}
						d={pathD(span.top, span.bottom, fx)}
						fill="none"
						stroke={terrainColor(steep.get(wk))}
						strokeOpacity={planWeekBy.has(wk) ? 0.55 : 0.25}
						strokeWidth={Math.min(150, W * 0.38)}
					/>
				))}
				<path
					d={pathD(0, rows.height, fx)}
					fill="none"
					stroke="var(--ink)"
					strokeOpacity=".28"
					strokeWidth="2.5"
					strokeDasharray="1 7"
					strokeLinecap="round"
				/>
				<path
					d={pathD(dotY, rows.height, fx)}
					fill="none"
					stroke="var(--ink)"
					strokeWidth="3.5"
					strokeLinecap="round"
				/>
				{hover ? (
					<circle
						cx={fx(stoneY(rowOf.get(hover)!))}
						cy={stoneY(rowOf.get(hover)!)}
						r="36"
						fill="none"
						stroke="var(--alt)"
						strokeWidth="2"
						strokeDasharray="4 5"
					/>
				) : null}
			</svg>

			{weeksInRange.map(([wk, span]) => {
				const pw = planWeekBy.get(wk)
				return (
					<div
						key={wk}
						className="caps soft num"
						style={{
							position: 'absolute',
							left: 14,
							top: span.top + 6,
							fontSize: 12,
							pointerEvents: 'none',
							maxWidth: W * 0.3,
						}}
					>
						{pw
							? `Uke ${pw.number} · ${phaseName(pw.phase)}`
							: goalDay && mondayOf(goalDay) === wk
								? 'Målets uke'
								: `Uka fra ${fmtDay(wk)}`}
						{pw?.role === 'recovery' ? (
							<div
								style={{
									fontVariantCaps: 'normal',
									letterSpacing: 0,
									fontWeight: 400,
								}}
							>
								lett uke, utforbakke
							</div>
						) : null}
					</div>
				)
			})}

			{!hasPast ? (
				<p
					className="soft"
					style={{
						position: 'absolute',
						left: 24,
						right: 24,
						top: rows.height - 100,
						textAlign: 'center',
						fontSize: 14,
					}}
				>
					Stien bak deg tegnes når øktene kommer inn.
				</p>
			) : null}

			{rows.rows.map((r) => (
				<RowView
					key={r.date}
					row={r}
					x={fx(stoneY(r))}
					sy={stoneY(r)}
					W={W}
					today={today}
					busy={busy}
					data={data}
					onTap={(s) => navigate(`${BASE}/steg/${s.date}?okt=${s.id}`)}
					onOpenDay={() => navigate(`${BASE}/steg/${r.date}`)}
					onMenu={onMenu}
					onDragMove={(cy) => {
						const t = rowAt(cy)
						setHover(t && t.date >= today ? t.date : null)
					}}
					onDrop={drop}
					merkeIds={merke?.token ? merke.sessionIds : []}
					onUndo={() => merke && undoMerke.run(merke)}
				/>
			))}

			{todayRow ? (
				<TodayCard
					row={todayRow}
					data={data}
					W={W}
					busy={busy}
					onDone={markDone}
					waiting={waiting.length}
					firstWaiting={waiting[0] ?? null}
					autoChanges={autoChanges ? autoChanges.undoable : 0}
				/>
			) : null}

			<Dot
				ref={dotEl}
				x={fx(dotY)}
				y={dotY}
				target={
					mainToday && todayRow
						? { x: fx(stoneY(todayRow)), y: stoneY(todayRow) }
						: null
				}
				boxRef={box}
				onDropOnTarget={() => mainToday && markDone(mainToday)}
			/>
		</div>
	)
}

function RowView({
	row,
	x,
	sy,
	W,
	today,
	busy,
	data,
	onTap,
	onOpenDay,
	onMenu,
	onDragMove,
	onDrop,
	merkeIds,
	onUndo,
}: {
	row: Row
	x: number
	sy: number
	W: number
	today: string
	busy: string | null
	data: PathData
	onTap: (s: SessionCard) => void
	onOpenDay: () => void
	onMenu: (s: SessionCard) => void
	onDragMove: (clientY: number) => void
	onDrop: (s: SessionCard, cx: number, cy: number) => void
	merkeIds: string[]
	onUndo: () => void
}) {
	const isToday = row.kind === 'today'
	const main = row.sessions.filter((s) => s.status !== 'recording-only')
	const extras = row.sessions.filter((s) => s.status === 'recording-only')
	const stones = main.length ? main : extras
	const side: 'left' | 'right' = x > W / 2 ? 'left' : 'right'
	const size = isToday ? 64 : 44
	const changed = row.sessions.some((s) => merkeIds.includes(s.id))

	if (row.kind === 'goal') {
		const goal = data.plan?.plan?.goal ?? data.athlete.goal
		return (
			<Link
				to={`${BASE}/flagg`}
				aria-label={`Målet: ${goal?.name ?? ''}, ${fmtDay(row.date, { weekday: true })}`}
				style={{
					position: 'absolute',
					left: x - 24,
					top: row.y - 64,
					width: Math.min(W - x + 16, 260),
					color: 'inherit',
					textDecoration: 'none',
				}}
			>
				<svg width="48" height="64" viewBox="0 0 48 64" aria-hidden>
					<path
						d="M12 62V6"
						stroke="var(--ink)"
						strokeWidth="3"
						strokeLinecap="round"
					/>
					<path d="M12 7h30l-8 9 8 9H12" fill="var(--dot)" />
				</svg>
				<div style={{ marginTop: 4 }}>
					<div className="caps" style={{ fontSize: 13 }}>
						Målet · {fmtDay(row.date)}
					</div>
					<div
						style={{ fontWeight: 700, fontSize: 17, overflowWrap: 'anywhere' }}
					>
						{goal?.name}
					</div>
				</div>
			</Link>
		)
	}
	if (row.kind === 'rest') {
		return (
			<button
				type="button"
				onClick={onOpenDay}
				aria-label={`${fmtDay(row.date, { weekday: true })}: hvil`}
				style={{
					position: 'absolute',
					left: x - 22,
					top: sy - 20,
					width: 44,
					height: 40,
					background: 'transparent',
					border: 0,
					cursor: 'pointer',
					display: 'grid',
					placeItems: 'center',
				}}
			>
				<span
					style={{
						width: 12,
						height: 3,
						borderRadius: 2,
						background: 'var(--ink-soft)',
						opacity: 0.6,
					}}
				/>
				<span
					className="soft num"
					style={{
						position: 'absolute',
						[side === 'left' ? 'right' : 'left']: 50,
						fontSize: 12,
						whiteSpace: 'nowrap',
					}}
				>
					{wdShort(weekdayOf(row.date))} {Number(row.date.slice(8))}.
				</span>
			</button>
		)
	}

	return (
		<>
			{stones.map((s, i) => {
				const off = (i - (stones.length - 1) / 2) * (size + 12)
				const question =
					s.status === 'recording-only' &&
					row.sessions.some(
						(o) =>
							o.status === 'planned' && o.sport === s.sport && o.id !== s.id,
					)
				return (
					<StoneButton
						key={s.id}
						card={s}
						x={x + off}
						y={sy}
						size={size}
						fill={stoneFill(s, today)}
						question={question}
						movable={s.status === 'planned' && s.date >= today}
						busy={busy === s.id}
						onTap={() => onTap(s)}
						onMenu={() => onMenu(s)}
						onDragMove={onDragMove}
						onDrop={(cx, cy) => onDrop(s, cx, cy)}
					/>
				)
			})}
			{main.length && extras.length
				? extras.map((s, i) => (
						<StoneButton
							key={s.id}
							card={s}
							x={x + (side === 'left' ? 1 : -1) * (size / 2 + 22 + i * 26)}
							y={sy + 14}
							size={24}
							fill="full"
							question={row.sessions.some(
								(o) => o.status === 'planned' && o.sport === s.sport,
							)}
							movable={false}
							busy={false}
							onTap={() => onTap(s)}
							onMenu={() => onTap(s)}
							onDragMove={onDragMove}
							onDrop={() => undefined}
						/>
					))
				: null}
			{!isToday ? (
				<div
					style={{
						position: 'absolute',
						top: sy - 22,
						...(side === 'left'
							? { right: W - x + size / 2 + 14 + (stones.length - 1) * 28 }
							: { left: x + size / 2 + 14 + (stones.length - 1) * 28 }),
						maxWidth: Math.max(120, W / 2 - size / 2 - 40),
						textAlign: side === 'left' ? 'right' : 'left',
						fontSize: 14,
						lineHeight: 1.3,
						pointerEvents: changed ? 'auto' : 'none',
					}}
				>
					<div className="soft num" style={{ fontSize: 12 }}>
						{wdShort(weekdayOf(row.date))} {Number(row.date.slice(8))}.
						{row.date < today
							? ''
							: row.date === addDays(today, 1)
								? ' · i morgen'
								: ''}
					</div>
					{stones.map((s) => (
						<div
							key={s.id}
							style={{
								fontWeight: 600,
								overflow: 'hidden',
								display: '-webkit-box',
								WebkitLineClamp: 2,
								WebkitBoxOrient: 'vertical',
								overflowWrap: 'anywhere',
							}}
						>
							{sessionLine(s)}
							{s.status === 'missed' ? (
								<span className="soft" style={{ fontWeight: 400 }}>
									{' '}
									· hoppet over
								</span>
							) : null}
						</div>
					))}
					{changed ? (
						<button
							type="button"
							onClick={onUndo}
							className="sti-link"
							style={{ fontSize: 13, minHeight: 32, color: 'var(--alt)' }}
						>
							Endret · Angre
						</button>
					) : null}
				</div>
			) : null}
		</>
	)
}

function StoneButton({
	card,
	x,
	y,
	size,
	fill,
	question,
	movable,
	busy,
	onTap,
	onMenu,
	onDragMove,
	onDrop,
}: {
	card: SessionCard
	x: number
	y: number
	size: number
	fill: StoneFill
	question: boolean
	movable: boolean
	busy: boolean
	onTap: () => void
	onMenu: () => void
	onDragMove: (clientY: number) => void
	onDrop: (cx: number, cy: number) => void
}) {
	const ref = useRef<HTMLButtonElement>(null)
	const st = useRef({
		x: 0,
		y: 0,
		timer: 0,
		lifted: false,
		moved: false,
		suppress: false,
		cancelled: false,
	})
	const [lifted, setLifted] = useState(false)
	const h = card.sport === 'strength' ? size * 0.86 : size * 0.78

	const touchBlock = useCallback((el: HTMLButtonElement | null) => {
		ref.current = el
		if (!el) return
		const stop = (e: TouchEvent) => {
			if (st.current.lifted) e.preventDefault()
		}
		el.addEventListener('touchmove', stop, { passive: false })
	}, [])

	function reset(animate: boolean) {
		const el = ref.current
		if (!el) return
		if (animate) {
			el.style.transition = 'transform 200ms cubic-bezier(0.23, 1, 0.32, 1)'
			window.setTimeout(() => el && (el.style.transition = ''), 220)
		}
		el.style.transform = ''
		st.current.lifted = false
		setLifted(false)
	}

	return (
		<button
			ref={touchBlock}
			type="button"
			aria-label={`${fmtDay(card.date, { weekday: true })}: ${card.title}, ${card.status === 'done' ? 'gjort' : card.status === 'missed' ? 'hoppet over' : card.status === 'recording-only' ? 'ekstra' : 'planlagt'}. Hold for flere valg.`}
			onClick={() => {
				if (st.current.suppress) {
					st.current.suppress = false
					return
				}
				onTap()
			}}
			onContextMenu={(e) => {
				e.preventDefault()
				st.current.suppress = true
				onMenu()
			}}
			onPointerDown={(e) => {
				if (e.button !== 0) return
				st.current = {
					x: e.clientX,
					y: e.clientY,
					timer: 0,
					lifted: false,
					moved: false,
					suppress: false,
					cancelled: false,
				}
				st.current.timer = window.setTimeout(() => {
					st.current.lifted = true
					st.current.suppress = true
					setLifted(true)
					try {
						ref.current?.setPointerCapture(e.pointerId)
					} catch {
						// capture is a nicety
					}
					if (ref.current) ref.current.style.transform = 'scale(1.05)'
					navigator.vibrate?.(8)
				}, 420)
			}}
			onPointerMove={(e) => {
				const dx = e.clientX - st.current.x
				const dy = e.clientY - st.current.y
				if (!st.current.lifted) {
					if (Math.hypot(dx, dy) > 8) {
						window.clearTimeout(st.current.timer)
						st.current.cancelled = true
					}
					return
				}
				if (!movable) return
				if (Math.hypot(dx, dy) > 6) st.current.moved = true
				if (ref.current)
					ref.current.style.transform = `translate(${dx}px, ${dy}px) scale(1.05)`
				onDragMove(e.clientY)
			}}
			onPointerUp={(e) => {
				window.clearTimeout(st.current.timer)
				if (!st.current.lifted) return
				if (st.current.moved) {
					onDrop(e.clientX, e.clientY)
					reset(true)
				} else {
					reset(true)
					onMenu()
				}
			}}
			onPointerCancel={() => {
				window.clearTimeout(st.current.timer)
				reset(true)
			}}
			style={{
				position: 'absolute',
				left: x - size / 2,
				top: y - h / 2,
				width: size,
				height: Math.max(44, h),
				padding: 0,
				border: 0,
				background: 'transparent',
				cursor: 'pointer',
				zIndex: lifted ? 30 : 2,
				touchAction: 'pan-y',
				display: 'grid',
				placeItems: 'center',
				opacity: busy ? 0.5 : 1,
				transition: 'opacity 160ms ease',
			}}
		>
			<Stone
				sport={card.sport}
				size={size}
				fill={fill}
				border={card.rpe ? rpeColor(card.rpe) : undefined}
				label={sportLetter(card.sport)}
				lifted={lifted}
				question={question}
			/>
		</button>
	)
}

function Dot({
	ref,
	x,
	y,
	target,
	boxRef,
	onDropOnTarget,
}: {
	ref: React.RefObject<HTMLDivElement | null>
	x: number
	y: number
	target: { x: number; y: number } | null
	boxRef: React.RefObject<HTMLDivElement | null>
	onDropOnTarget: () => void
}) {
	const drag = useRef<{ x: number; y: number } | null>(null)
	return (
		<div
			ref={ref}
			role={target ? 'button' : undefined}
			aria-label={
				target
					? 'Du. Dra prikken opp på dagens helle for å si gjort.'
					: 'Du er her'
			}
			style={{
				position: 'absolute',
				left: 0,
				top: 0,
				width: 24,
				height: 24,
				transform: `translate(${x - 12}px, ${y - 12}px)`,
				zIndex: 20,
				touchAction: target ? 'none' : undefined,
				cursor: target ? 'grab' : undefined,
			}}
			onPointerDown={(e) => {
				if (!target) return
				drag.current = { x: e.clientX, y: e.clientY }
				e.currentTarget.setPointerCapture(e.pointerId)
			}}
			onPointerMove={(e) => {
				if (!drag.current) return
				e.currentTarget.style.transform = `translate(${x - 12 + e.clientX - drag.current.x}px, ${y - 12 + e.clientY - drag.current.y}px) scale(1.15)`
			}}
			onPointerUp={(e) => {
				if (!drag.current || !target) return
				const r = boxRef.current!.getBoundingClientRect()
				const px = e.clientX - r.left
				const py = e.clientY - r.top
				drag.current = null
				const el = e.currentTarget
				el.style.transition = 'transform 200ms cubic-bezier(0.23, 1, 0.32, 1)'
				el.style.transform = `translate(${x - 12}px, ${y - 12}px)`
				window.setTimeout(() => (el.style.transition = ''), 220)
				if (Math.hypot(px - target.x, py - target.y) < 56) onDropOnTarget()
			}}
			onPointerCancel={(e) => {
				drag.current = null
				e.currentTarget.style.transform = `translate(${x - 12}px, ${y - 12}px)`
			}}
		>
			<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
				<circle
					cx="12"
					cy="12"
					r="10"
					fill="none"
					stroke="var(--dot)"
					strokeOpacity=".35"
					strokeWidth="2.5"
				/>
				<circle cx="12" cy="12" r="6" fill="var(--dot)" />
			</svg>
		</div>
	)
}

function TodayCard({
	row,
	data,
	W,
	busy,
	onDone,
	waiting,
	firstWaiting,
	autoChanges,
}: {
	row: Row
	data: PathData
	W: number
	busy: string | null
	onDone: (s: SessionCard) => void
	waiting: number
	firstWaiting: { id: string; headline: string } | null
	autoChanges: number
}) {
	const t = data.today
	const goal = data.plan?.plan?.goal ?? data.athlete.goal
	const sessions = row.sessions
	const planned = sessions.filter((s) => s.status !== 'recording-only')
	const eve = goal?.kind === 'event' && goal.daysToGo === 1
	const raceDay = goal?.kind === 'event' && goal.daysToGo === 0
	const stepsCount = useStepsCount(data)
	return (
		<div
			style={{
				position: 'absolute',
				left: 16,
				right: 16,
				top: row.y - 40,
				maxWidth: 520,
				marginInline: 'auto',
				background: 'color-mix(in oklab, var(--card) 88%, transparent)',
				backdropFilter: 'blur(10px)',
				WebkitBackdropFilter: 'blur(10px)',
				borderRadius: 20,
				padding: '14px 16px',
				border: '1px solid var(--ink-faint)',
				boxShadow: '0 10px 30px rgba(20,30,24,.08)',
				zIndex: 5,
			}}
		>
			<div className="caps" style={{ fontSize: 13, color: 'var(--dot)' }}>
				I dag · {fmtDay(row.date, { weekday: true })}
			</div>
			{raceDay ? (
				<p style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>
					I dag: Målet. {goal?.name}.
				</p>
			) : eve ? (
				<p style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>
					I morgen: Målet. I dag bare et kort steg.
				</p>
			) : null}
			{planned.length === 0 ? (
				<>
					<p style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>
						Hvil. Stien venter.
					</p>
					{t.next ? (
						<Link
							to={`${BASE}/steg/${t.next.date}?okt=${t.next.id}`}
							className="sti-link"
							style={{ fontSize: 15 }}
						>
							Neste steg {relDay(t.next.date, row.date)}: {sessionLine(t.next)}
						</Link>
					) : (
						<p className="soft" style={{ fontSize: 15 }}>
							Ingen flere steg lagt ennå.
						</p>
					)}
				</>
			) : (
				planned.map((s) => (
					<div
						key={s.id}
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 10,
							marginTop: 6,
						}}
					>
						<Link
							to={`${BASE}/steg/${s.date}?okt=${s.id}`}
							style={{
								flex: 1,
								minWidth: 0,
								color: 'inherit',
								textDecoration: 'none',
							}}
						>
							<div
								style={{
									fontSize: 21,
									fontWeight: 700,
									lineHeight: 1.2,
									overflowWrap: 'anywhere',
								}}
							>
								{sessionLine(s)}
							</div>
							<div
								className="soft"
								style={{
									fontSize: 14,
									overflow: 'hidden',
									textOverflow: 'ellipsis',
									whiteSpace: 'nowrap',
								}}
							>
								{s.title}
								{s.time ? ` · ${s.time}` : ''}
								{s.status === 'done'
									? ' · gjort'
									: s.status === 'missed'
										? ' · hoppet over'
										: ''}
							</div>
						</Link>
						{s.status === 'planned' ? (
							<button
								type="button"
								className="sti-btn small"
								onClick={() => onDone(s)}
								disabled={busy === s.id}
								style={{ flexShrink: 0 }}
							>
								{busy === s.id ? (
									<Spinner />
								) : s.sport === 'strength' ? (
									'Logg'
								) : (
									'Gjort'
								)}
							</button>
						) : null}
					</div>
				))
			)}
			{sessions.some((s) => s.status === 'recording-only') ? (
				<p className="soft" style={{ fontSize: 14, marginTop: 6 }}>
					+{' '}
					{plural(
						sessions.filter((s) => s.status === 'recording-only').length,
						'ekstra økt',
						'ekstra økter',
					)}{' '}
					fra klokka
				</p>
			) : null}
			<p
				className="soft"
				style={{
					fontSize: 14,
					marginTop: 8,
					lineHeight: 1.4,
					display: '-webkit-box',
					WebkitLineClamp: 3,
					WebkitBoxOrient: 'vertical',
					overflow: 'hidden',
				}}
			>
				{t.readiness.sentence}
				{t.readiness.nextSession.outcome === 'eased' &&
				t.readiness.nextSession.sentence
					? ` ${t.readiness.nextSession.sentence}`
					: ''}
			</p>
			{eve && stepsCount ? (
				<p className="num" style={{ fontSize: 14, marginTop: 6 }}>
					Du har gått {stepsCount.done} av {stepsCount.total} steg.
				</p>
			) : null}
			{planned.some((s) => s.status === 'planned' && s.sport !== 'strength') ? (
				<p className="soft" style={{ fontSize: 12, marginTop: 8 }}>
					Dra prikken opp på hellen når du er ferdig.
				</p>
			) : null}
			{waiting > 0 && firstWaiting ? (
				<Signpost
					to={`${BASE}/veiskilt/${firstWaiting.id}`}
					text={data.proposals?.summary ?? firstWaiting.headline}
					more={waiting > 1 ? `${waiting} forslag` : null}
				/>
			) : null}
			{autoChanges > 0 ? (
				<Signpost
					to={`${BASE}/veiskilt/endringer`}
					text={`Planen justerte stien selv (${autoChanges}). Se, og angre om du vil.`}
					quiet
				/>
			) : null}
			{W < 0 ? null : null}
		</div>
	)
}

function Signpost({
	to,
	text,
	more,
	quiet,
}: {
	to: string
	text: string
	more?: string | null
	quiet?: boolean
}) {
	return (
		<Link
			to={to}
			style={{
				marginTop: 10,
				display: 'flex',
				alignItems: 'center',
				gap: 10,
				padding: '10px 12px',
				borderRadius: 14,
				textDecoration: 'none',
				color: quiet ? 'var(--ink)' : '#fff',
				background: quiet ? 'transparent' : 'var(--alt)',
				border: quiet ? '1.5px dashed var(--alt)' : 0,
				minHeight: 48,
			}}
		>
			<svg
				width="22"
				height="26"
				viewBox="0 0 22 26"
				aria-hidden
				style={{ flexShrink: 0 }}
			>
				<path
					d="M11 25V3"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
				/>
				<path
					d="M3 5h14l3 3-3 3H3z"
					fill="currentColor"
					fillOpacity=".25"
					stroke="currentColor"
					strokeWidth="1.6"
					strokeLinejoin="round"
				/>
			</svg>
			<span style={{ flex: 1, fontSize: 15, lineHeight: 1.3, fontWeight: 600 }}>
				{text}
			</span>
			{more ? (
				<span
					className="num"
					style={{ fontSize: 13, opacity: 0.85, whiteSpace: 'nowrap' }}
				>
					{more}
				</span>
			) : null}
		</Link>
	)
}

function useStepsCount(data: PathData) {
	return useMemo(() => {
		const plan = data.plan?.plan
		if (!plan) return null
		const end = plan.goal.date ?? addDays(plan.lastWeek, 6)
		const inPlan = data.sessions.filter(
			(s) =>
				s.date >= plan.firstWeek &&
				s.date <= end &&
				s.status !== 'recording-only',
		)
		if (!inPlan.length) return null
		return {
			done: inPlan.filter((s) => s.status === 'done').length,
			total: inPlan.length,
		}
	}, [data])
}

// ── Hold menu: shorter, skip, ease the week … ────────────────────────────────

function StoneMenu({
	card,
	data,
	onClose,
	onFeeling,
}: {
	card: SessionCard
	data: PathData
	onClose: () => void
	onFeeling: (s: SessionCard) => void
}) {
	const navigate = useNavigate()
	const today = data.athlete.today
	const [mode, setMode] = useState<'menu' | 'move' | 'swap'>('menu')
	const [error, setError] = useState<string | null>(null)
	const move = useCapability<MoveSessionInput, MoveSessionOutput>(
		'move_session',
	)
	const swap = useCapability<SwapSessionsInput, SwapSessionsOutput>(
		'swap_sessions',
	)
	const shorten = useCapability<SessionIdInput, ShortenSessionOutput>(
		'shorten_session',
	)
	const ease = useCapability<SessionIdInput, EaseSessionOutput>('ease_session')
	const skip = useCapability<SessionIdInput, SkipSessionOutput>('skip_session')
	const easeWeek = useCapability<EaseWeekInput, EaseWeekOutput>('ease_week')
	const release = useCapability<SessionIdInput, ReleaseSessionOutput>(
		'release_session',
	)
	const done = useCapability<SessionIdInput, MarkDoneOutput>('mark_done')
	const pending =
		move.pending ||
		swap.pending ||
		shorten.pending ||
		ease.pending ||
		skip.pending ||
		easeWeek.pending ||
		release.pending ||
		done.pending
	const open = card.status === 'planned'
	const isToday = card.date === today
	const future = card.date >= today

	async function run<
		T extends { undo: string | null; noUndoBecause: string | null },
	>(
		p: Promise<{ ok: true; value: T } | { ok: false; message: string }>,
		text: (v: T) => string,
		ids: string[] = [card.id],
	) {
		setError(null)
		const r = await p
		if (!r.ok) return setError(r.message)
		markChange(text(r.value), r.value, ids)
		onClose()
	}

	const days = Array.from({ length: 14 }, (_, i) => addDays(today, i)).filter(
		(d) => d !== card.date,
	)
	const others = data.sessions.filter(
		(s) =>
			s.id !== card.id &&
			s.status === 'planned' &&
			s.date >= today &&
			s.date <= addDays(today, 21),
	)

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-label={card.title}
			style={{ position: 'fixed', inset: 0, zIndex: 60 }}
		>
			<button
				type="button"
				aria-label="Lukk"
				onClick={onClose}
				style={{
					position: 'absolute',
					inset: 0,
					background: 'var(--scrim)',
					border: 0,
					cursor: 'default',
				}}
			/>
			<div
				className="sti-sheet"
				style={{
					position: 'absolute',
					left: 0,
					right: 0,
					bottom: 0,
					marginTop: 0,
					maxHeight: '82dvh',
					overflowY: 'auto',
					overscrollBehavior: 'contain',
				}}
			>
				<div className="sti-handle" aria-hidden />
				<div
					style={{
						display: 'flex',
						gap: 12,
						alignItems: 'center',
						marginBottom: 12,
					}}
				>
					<Stone
						sport={card.sport}
						size={40}
						fill={stoneFill(card, today)}
						label={sportLetter(card.sport)}
						lifted
					/>
					<div style={{ minWidth: 0 }}>
						<div className="caps soft" style={{ fontSize: 12 }}>
							{relDay(card.date, today)}
						</div>
						<strong style={{ fontSize: 18, overflowWrap: 'anywhere' }}>
							{card.title}
						</strong>
					</div>
				</div>
				{mode === 'menu' ? (
					<div style={{ display: 'grid', gap: 8 }}>
						{open && future ? (
							<MenuItem
								label="Flytt til en annen dag"
								hint="Eller dra hellen dit."
								onClick={() => setMode('move')}
							/>
						) : null}
						{open && future ? (
							<MenuItem
								label="Bytt med en annen helle"
								hint="Eller slipp den på den andre."
								onClick={() => setMode('swap')}
							/>
						) : null}
						{open && isToday && card.sport !== 'strength' ? (
							<MenuItem
								label="Kortere"
								hint="30 minutter, samme hensikt."
								disabled={pending}
								onClick={() =>
									run(
										shorten.call({ sessionId: card.id }),
										(v) =>
											`Kortere: ${v.minutesBefore ?? '?'} → ${v.minutesAfter ?? '?'} min.`,
									)
								}
							/>
						) : null}
						{open && isToday ? (
							<MenuItem
								label="For sliten i dag"
								hint="Rolig, og omtrent 60 % så lang."
								disabled={pending}
								onClick={() =>
									run(
										ease.call({ sessionId: card.id }),
										(v) =>
											`Lettere: ${v.minutesBefore ?? '?'} → ${v.minutesAfter ?? '?'} min.`,
									)
								}
							/>
						) : null}
						{open && card.date <= today && card.sport !== 'strength' ? (
							<MenuItem
								label="Gjort"
								disabled={pending}
								onClick={async () => {
									const r = await done.call({ sessionId: card.id })
									if (!r.ok) return setError(r.message)
									markChange('Gjort. Prikken gikk et steg.', r.value, [card.id])
									onClose()
									onFeeling(card)
								}}
							/>
						) : null}
						{open && card.sport === 'strength' ? (
							<MenuItem
								label="Styrkeleiren"
								hint="Logg settene."
								onClick={() => navigate(`${BASE}/styrke/${card.id}`)}
							/>
						) : null}
						{open ? (
							<MenuItem
								label="Hopp over"
								disabled={pending}
								onClick={() =>
									run(skip.call({ sessionId: card.id }), (v) =>
										v.state === 'skipped'
											? 'Hoppet over. Hellen står tom.'
											: 'Ført som ikke gjort.',
									)
								}
							/>
						) : null}
						{future ? (
							<MenuItem
								label="Gjør uka lettere"
								hint="Alle steg som gjenstår i den kommende uka, 15 % lettere."
								disabled={pending}
								onClick={() =>
									run(
										easeWeek.call(
											mondayOf(card.date) > mondayOf(today)
												? { week: mondayOf(card.date) }
												: {},
										),
										(v) =>
											`Uka er flatet ut: ${plural(v.sessionsChanged, 'steg', 'steg')} lettere.`,
										[],
									)
								}
							/>
						) : null}
						{card.whose === 'athlete' && open ? (
							<MenuItem
								label="La planen styre den"
								hint="Din egen økt; planen rører den ikke uten lov."
								disabled={pending}
								onClick={() =>
									run(release.call({ sessionId: card.id }), (v) =>
										v.released
											? 'Planen kan nå justere den.'
											: 'Den var planens fra før.',
									)
								}
							/>
						) : null}
						<MenuItem
							label="Åpne steget"
							onClick={() =>
								navigate(`${BASE}/steg/${card.date}?okt=${card.id}`)
							}
						/>
					</div>
				) : mode === 'move' ? (
					<div>
						<p style={{ marginBottom: 10 }}>Hvilken dag?</p>
						<div
							style={{
								display: 'grid',
								gridTemplateColumns: 'repeat(4, 1fr)',
								gap: 8,
							}}
						>
							{days.map((d) => {
								const busyDay = data.sessions.some(
									(s) => s.date === d && s.status === 'planned',
								)
								return (
									<button
										key={d}
										type="button"
										className="sti-chip num"
										disabled={pending}
										onClick={() =>
											run(move.call({ sessionId: card.id, date: d }), (v) => {
												const warn = v.clashes.map((c) => c.text).join(', ')
												return `Flyttet til ${relDay(d, today)}.${warn ? ` Obs: ${warn}.` : ''}`
											})
										}
										style={{
											flexDirection: 'column',
											height: 60,
											borderRadius: 14,
											gap: 0,
											justifyContent: 'center',
											padding: 0,
										}}
									>
										<span style={{ fontWeight: 650 }}>
											{wdShort(weekdayOf(d))}
										</span>
										<span style={{ fontSize: 13, opacity: 0.75 }}>
											{Number(d.slice(8))}.{busyDay ? ' •' : ''}
										</span>
									</button>
								)
							})}
						</div>
						<p className="soft" style={{ fontSize: 13, marginTop: 8 }}>
							• = det ligger alt en helle der.
						</p>
						<button
							type="button"
							className="sti-link"
							onClick={() => setMode('menu')}
						>
							Tilbake
						</button>
					</div>
				) : (
					<div style={{ display: 'grid', gap: 8 }}>
						<p>Bytt plass med …</p>
						{others.length === 0 ? (
							<p className="soft">Ingen andre heller de neste tre ukene.</p>
						) : null}
						{others.map((o) => (
							<button
								key={o.id}
								type="button"
								className="sti-chip"
								disabled={pending}
								style={{
									justifyContent: 'flex-start',
									borderRadius: 14,
									minHeight: 56,
									textAlign: 'left',
								}}
								onClick={() =>
									run(
										swap.call({ sessionId: card.id, otherSessionId: o.id }),
										() => `Byttet: ${card.title} og ${o.title}.`,
										[card.id, o.id],
									)
								}
							>
								<Stone sport={o.sport} size={28} label={sportLetter(o.sport)} />
								<span style={{ minWidth: 0 }}>
									<span
										className="soft num"
										style={{ fontSize: 13, display: 'block' }}
									>
										{relDay(o.date, today)}
									</span>
									<span style={{ overflowWrap: 'anywhere' }}>
										{sessionLine(o)}
									</span>
								</span>
							</button>
						))}
						<button
							type="button"
							className="sti-link"
							onClick={() => setMode('menu')}
						>
							Tilbake
						</button>
					</div>
				)}
				{error ? (
					<p className="sti-err" role="alert" style={{ marginTop: 10 }}>
						{error}
					</p>
				) : null}
				{pending ? (
					<p className="soft" style={{ marginTop: 10 }}>
						<Spinner /> Legger om stien …
					</p>
				) : null}
			</div>
		</div>
	)
}

function MenuItem({
	label,
	hint,
	onClick,
	disabled,
}: {
	label: string
	hint?: string
	onClick: () => void
	disabled?: boolean
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className="sti-chip"
			style={{
				borderRadius: 14,
				minHeight: 54,
				justifyContent: 'flex-start',
				textAlign: 'left',
				flexDirection: 'column',
				alignItems: 'flex-start',
				gap: 0,
				padding: '8px 16px',
			}}
		>
			<span style={{ fontWeight: 650 }}>{label}</span>
			{hint ? <span style={{ fontSize: 13, opacity: 0.7 }}>{hint}</span> : null}
		</button>
	)
}

function FeelingSheet({
	card,
	onClose,
}: {
	card: SessionCard
	onClose: () => void
}) {
	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Hvor tungt var steget?"
			style={{ position: 'fixed', inset: 0, zIndex: 60 }}
		>
			<button
				type="button"
				aria-label="Lukk"
				onClick={onClose}
				style={{
					position: 'absolute',
					inset: 0,
					background: 'var(--scrim)',
					border: 0,
				}}
			/>
			<div
				className="sti-sheet"
				style={{
					position: 'absolute',
					left: 0,
					right: 0,
					bottom: 0,
					marginTop: 0,
					maxHeight: '86dvh',
					overflowY: 'auto',
					overscrollBehavior: 'contain',
				}}
			>
				<div className="sti-handle" aria-hidden />
				<p className="caps soft" style={{ fontSize: 12, marginBottom: 6 }}>
					{card.title}
				</p>
				<Feeling
					sessionId={card.id}
					rpe={card.rpe}
					note={null}
					onSaved={onClose}
				/>
				<button
					type="button"
					className="sti-link"
					onClick={onClose}
					style={{ marginTop: 6 }}
				>
					Ikke nå
				</button>
			</div>
		</div>
	)
}

// ── The altimeter: where on the season ───────────────────────────────────────

function Altimeter({ data, compact }: { data: PathData; compact?: boolean }) {
	const plan = data.plan?.plan ?? null
	const phase = data.today.phase
	const goal = plan?.goal ?? data.athlete.goal
	const after =
		goal?.kind === 'event' && goal.daysToGo !== null && goal.daysToGo < 0
	return (
		<div
			style={{
				position: compact ? 'absolute' : 'relative',
				top: compact ? 'calc(env(safe-area-inset-top, 0px) + 10px)' : undefined,
				left: 14,
				right: 120,
				zIndex: 6,
				paddingTop: compact ? 0 : 'calc(env(safe-area-inset-top, 0px) + 10px)',
			}}
		>
			<div className="caps num" style={{ fontSize: 13 }}>
				{phase
					? `Uke ${phase.planWeek} av ${phase.planWeeks} · ${phaseName(phase.name)}`
					: plan?.currentWeek
						? `Uke ${plan.currentWeek} av ${plan.totalWeeks}`
						: plan?.block
							? `Runde ${plan.block}`
							: plan && plan.firstWeek > data.athlete.today
								? `Stien starter ${fmtDay(plan.firstWeek, { weekday: true })}`
								: 'Utenfor planen'}
			</div>
			{goal?.kind === 'event' &&
			goal.daysToGo !== null &&
			goal.daysToGo >= 0 ? (
				<div
					className="soft num"
					style={{
						fontSize: 13,
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
					}}
				>
					{goal.daysToGo === 0
						? 'Målet er i dag'
						: `${plural(goal.daysToGo, 'dag', 'dager')} til ${goal.name}`}
				</div>
			) : goal?.kind === 'open-ended' ? (
				<div className="soft" style={{ fontSize: 13 }}>
					Rundløype, uten dato
				</div>
			) : null}
			{after ? (
				<Link
					to={`${BASE}/sekk/flagg`}
					className="sti-btn alt small"
					style={{ marginTop: 8 }}
				>
					Du kom fram. Ny sti?
				</Link>
			) : null}
		</div>
	)
}

// ── Oversikten ───────────────────────────────────────────────────────────────

function Far({ data }: { data: PathData }) {
	const box = useRef<HTMLDivElement>(null)
	const W = useWidth(box)
	const plan = data.plan?.plan ?? null
	const today = data.athlete.today
	const [pickedWeek, setPickedWeek] = useState<string | null>(null)
	const [pickedPhase, setPickedPhase] = useState<string | null>(null)
	const steps = useStepsCount(data)
	const progress = data.progress

	if (!plan) {
		return (
			<div ref={box} style={{ padding: '72px 20px 120px' }}>
				<EmptyTrail height={160} />
				<p style={{ textAlign: 'center', marginTop: 12 }}>
					{data.planError ?? 'Ingen sti å se fra avstand ennå.'}
				</p>
			</div>
		)
	}

	const openEnded = plan.goal.kind === 'open-ended'
	const steep = weekSteepness(plan.weeks)
	const weeks = plan.weeks
	const ROW = 58
	const top = 120
	const H = top + weeks.length * ROW + 140
	const amp = Math.min(W * 0.18, 70)
	const fx = (y: number) => curveX(y, W - 50, amp, 110)
	const yOf = (i: number) => top + (weeks.length - 1 - i) * ROW + ROW / 2
	const doneDay = lastDoneDay(data.sessions, today)
	const dotIdx = (() => {
		const d = doneDay ?? plan.firstWeek
		const i = weeks.findIndex(
			(w) => d >= w.weekKey && d <= addDays(w.weekKey, 6),
		)
		if (i < 0) return d < plan.firstWeek ? -0.6 : weeks.length - 1
		return i + (daysBetween(weeks[i]!.weekKey, d) - 3) / 7
	})()
	const dotY = top + (weeks.length - 1 - dotIdx) * ROW + ROW / 2

	const weekStats = new Map<string, { done: number; total: number }>()
	for (const s of data.sessions) {
		if (s.status === 'recording-only') continue
		const wk = mondayOf(s.date)
		const e = weekStats.get(wk) ?? { done: 0, total: 0 }
		e.total++
		if (s.status === 'done') e.done++
		weekStats.set(wk, e)
	}
	const formByWeek = new Map<
		string,
		{ form: number | null; fitness: number | null }
	>()
	let maxFit = 1
	for (const d of progress?.days ?? []) {
		const wk = mondayOf(d.date)
		const e = formByWeek.get(wk) ?? { form: null, fitness: null }
		if (d.form.value !== null) e.form = d.form.value
		if (d.fitness.value !== null) {
			e.fitness = d.fitness.value
			maxFit = Math.max(maxFit, d.fitness.value)
		}
		formByWeek.set(wk, e)
	}
	const trusted = progress?.formTrust.trusted ?? false

	const phaseSpans = plan.phases.map((ph) => {
		const i0 = weeks.findIndex((w) => w.weekKey === ph.firstWeek)
		const i1 = weeks.findIndex((w) => w.weekKey === ph.lastWeek)
		return { ph, i0: i0 < 0 ? 0 : i0, i1: i1 < 0 ? weeks.length - 1 : i1 }
	})
	const picked = pickedWeek ? weeks.find((w) => w.weekKey === pickedWeek) : null
	const pickedProg = pickedWeek
		? progress?.weekly.find((w) => w.weekKey === pickedWeek)
		: null
	const phase = pickedPhase
		? phaseSpans.find((p) => p.ph.name === pickedPhase)
		: null

	return (
		<div ref={box} style={{ position: 'relative', paddingBottom: 100 }}>
			<div style={{ padding: '0 14px' }}>
				<Altimeter data={data} />
				<FormLine data={data} steps={steps} />
			</div>
			{openEnded ? (
				<Loop data={data} W={W} />
			) : (
				<div style={{ position: 'relative', height: H }}>
					<svg
						width={W}
						height={H}
						style={{ position: 'absolute', inset: 0 }}
						aria-hidden
					>
						{weeks.map((w, i) => (
							<path
								key={w.weekKey}
								d={pathD(yOf(i) - ROW / 2, yOf(i) + ROW / 2, fx)}
								fill="none"
								stroke={terrainColor(steep.get(w.weekKey))}
								strokeOpacity=".7"
								strokeWidth={Math.min(110, W * 0.26)}
							/>
						))}
						<path
							d={pathD(top - 30, H - 100, fx)}
							fill="none"
							stroke="var(--ink)"
							strokeOpacity=".3"
							strokeWidth="2.5"
							strokeDasharray="1 7"
							strokeLinecap="round"
						/>
						<path
							d={pathD(dotY, H - 100, fx)}
							fill="none"
							stroke="var(--ink)"
							strokeWidth="3.5"
							strokeLinecap="round"
						/>
						{/* Form band: colour is how fresh, width is how fit. */}
						{weeks.map((w, i) => {
							const f = formByWeek.get(w.weekKey)
							const y = yOf(i) - ROW / 2
							if (w.when === 'future') return null
							if (!trusted || !f || f.form === null)
								return (
									<rect
										key={w.weekKey}
										x={W - 40}
										y={y + 2}
										width={24}
										height={ROW - 4}
										rx="6"
										fill="var(--fog)"
									/>
								)
							const width = 8 + (Math.max(0, f.fitness ?? 0) / maxFit) * 20
							const t = Math.max(0, Math.min(100, 50 - f.form * 2.5))
							return (
								<rect
									key={w.weekKey}
									x={W - 28 - width / 2}
									y={y + 2}
									width={width}
									height={ROW - 4}
									rx="5"
									fill={`color-mix(in oklab, var(--ink) ${t}%, var(--good))`}
									fillOpacity=".8"
								/>
							)
						})}
						{plan.goal.date ? (
							<g transform={`translate(${fx(top - 34) - 6} ${top - 82})`}>
								<path
									d="M6 56V4"
									stroke="var(--ink)"
									strokeWidth="3"
									strokeLinecap="round"
								/>
								<path d="M6 5h26l-7 8 7 8H6" fill="var(--dot)" />
							</g>
						) : null}
						<circle
							cx={fx(dotY)}
							cy={dotY}
							r="11"
							fill="none"
							stroke="var(--dot)"
							strokeOpacity=".35"
							strokeWidth="2.5"
						/>
						<circle cx={fx(dotY)} cy={dotY} r="6.5" fill="var(--dot)" />
					</svg>
					<div
						className="caps soft"
						style={{
							position: 'absolute',
							right: 8,
							top: top - 26,
							fontSize: 11,
							width: 52,
							textAlign: 'center',
						}}
					>
						Form
					</div>
					{plan.goal.date ? (
						<Link
							to={`${BASE}/flagg`}
							style={{
								position: 'absolute',
								right: W - fx(top - 34) + 14,
								top: top - 84,
								color: 'inherit',
								textDecoration: 'none',
								maxWidth: Math.max(120, fx(top - 34) - 30),
								textAlign: 'right',
							}}
						>
							<div className="caps" style={{ fontSize: 12 }}>
								Målet · {fmtDay(plan.goal.date)}
							</div>
							<div style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
								{plan.goal.name}
							</div>
						</Link>
					) : null}
					{phaseSpans.map(({ ph, i0, i1 }) => {
						const y = (yOf(i0) + yOf(i1)) / 2
						return (
							<button
								key={ph.name + ph.firstWeek}
								type="button"
								onClick={() =>
									setPickedPhase(pickedPhase === ph.name ? null : ph.name)
								}
								aria-expanded={pickedPhase === ph.name}
								style={{
									position: 'absolute',
									left: 6,
									top: y - 22,
									minHeight: 44,
									background: 'transparent',
									border: 0,
									textAlign: 'left',
									cursor: 'pointer',
									padding: '0 8px',
									borderLeft: `3px solid ${ph.isCurrent ? 'var(--dot)' : 'var(--ink-faint)'}`,
									maxWidth: Math.max(90, fx(y) - 50),
								}}
							>
								<span
									className="caps"
									style={{ fontSize: 13, display: 'block' }}
								>
									{phaseName(ph.name)}
								</span>
								<span className="soft num" style={{ fontSize: 12 }}>
									uke {i0 + 1}
									{i1 > i0 ? `–${i1 + 1}` : ''}
								</span>
							</button>
						)
					})}
					{weeks.map((w, i) => {
						const st = weekStats.get(w.weekKey)
						const fill: StoneFill =
							w.when === 'future'
								? 'empty'
								: !st || st.total === 0
									? w.when === 'past'
										? 'fog'
										: 'empty'
									: st.done / st.total >= 0.85
										? 'full'
										: st.done / st.total >= 0.35
											? 'half'
											: w.when === 'current'
												? 'empty'
												: 'struck'
						return (
							<button
								key={w.weekKey}
								type="button"
								onClick={() =>
									setPickedWeek(pickedWeek === w.weekKey ? null : w.weekKey)
								}
								aria-label={`Uke ${w.number}, ${phaseName(w.phase)}${st ? `, ${st.done} av ${st.total} steg gjort` : ''}`}
								aria-expanded={pickedWeek === w.weekKey}
								style={{
									position: 'absolute',
									left: fx(yOf(i)) - 22,
									top: yOf(i) - 22,
									width: 44,
									height: 44,
									display: 'grid',
									placeItems: 'center',
									background: 'transparent',
									border: 0,
									cursor: 'pointer',
									outline:
										pickedWeek === w.weekKey
											? '2px dashed var(--alt)'
											: undefined,
									borderRadius: 10,
								}}
							>
								<Stone
									sport="run"
									size={w.when === 'current' ? 34 : 28}
									fill={fill}
									label={String(w.number)}
								/>
							</button>
						)
					})}
				</div>
			)}
			{phase ? (
				<FloatingCard onClose={() => setPickedPhase(null)}>
					<strong>
						{phaseName(phase.ph.name)}, uke {phase.i0 + 1}
						{phase.i1 > phase.i0 ? `–${phase.i1 + 1}` : ''}:
					</strong>{' '}
					{phaseWhat(phase.ph.name) ?? `${phase.ph.weeks} uker.`}
					{phase.ph.rhythm && phase.ph.rhythm !== 'none' ? (
						<span className="soft">
							{' '}
							Rytme {phase.ph.rhythm}:{' '}
							{phase.ph.rhythm === '3:1'
								? 'tre uker opp, én lett.'
								: 'uker opp, så en lett.'}
						</span>
					) : null}
					{phase.ph.tapers ? (
						<span className="soft"> Her trappes det ned.</span>
					) : null}
				</FloatingCard>
			) : null}
			{picked ? (
				<FloatingCard onClose={() => setPickedWeek(null)}>
					<div className="caps" style={{ fontSize: 13 }}>
						Uke {picked.number} · {phaseName(picked.phase)}
						{picked.role === 'recovery'
							? ' · lett uke'
							: picked.role === 'taper'
								? ' · nedtrapping'
								: ''}
					</div>
					<div className="soft num" style={{ fontSize: 13, marginBottom: 8 }}>
						fra {fmtDay(picked.weekKey)}
						{weekStats.get(picked.weekKey)
							? ` · ${weekStats.get(picked.weekKey)!.done} av ${weekStats.get(picked.weekKey)!.total} steg gjort`
							: ''}
					</div>
					<VolumeBars sports={pickedProg?.sports ?? picked.sports} />
					{pickedProg?.verdict.sentence ? (
						<p style={{ marginTop: 8, fontSize: 15 }}>
							{pickedProg.verdict.sentence.replace('I rute', 'Traff')}
						</p>
					) : pickedProg?.verdict.why ? (
						<p className="soft" style={{ marginTop: 8, fontSize: 14 }}>
							{pickedProg.verdict.why}
						</p>
					) : null}
					<Link
						to={`${BASE}/steg/${picked.weekKey}`}
						className="sti-link"
						style={{ fontSize: 14 }}
					>
						Se stegene den uka
					</Link>
				</FloatingCard>
			) : null}
		</div>
	)
}

function FormLine({
	data,
	steps,
}: {
	data: PathData
	steps: { done: number; total: number } | null
}) {
	const p = data.progress
	const plan = data.plan?.plan
	return (
		<div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
			{p ? (
				p.formTrust.trusted ? (
					<p className="num" style={{ fontSize: 14 }}>
						Form{' '}
						<Known
							n={p.current.form}
							fmt={(v) => (v > 0 ? `+${fmtNumber(v)}` : fmtNumber(v))}
						/>{' '}
						· Fitness <Known n={p.current.fitness} fmt={(v) => fmtNumber(v)} />{' '}
						· Slitenhet{' '}
						<Known n={p.current.fatigue} fmt={(v) => fmtNumber(v)} />
					</p>
				) : (
					<div className="sti-fog num">
						Formen synes etter 6 uker. Nå er det tåke
						{p.formTrust.daysOfHistory !== null
							? `: dag ${p.formTrust.daysOfHistory} av ${p.formTrust.requiredDays}.`
							: '.'}
						{p.formTrust.why ? (
							<span style={{ display: 'block', fontSize: 13 }}>
								{p.formTrust.why}
							</span>
						) : null}
					</div>
				)
			) : (
				<p className="sti-err">{data.progressError}</p>
			)}
			{steps ? (
				<p className="soft num" style={{ fontSize: 14 }}>
					Du har gått {steps.done} av {steps.total} steg.
					{plan?.projectedFitnessOnGoalDay.value !== null &&
					plan?.projectedFitnessOnGoalDay.value !== undefined
						? ` Fitness på måldagen, hvis du følger stien: ${fmtNumber(plan.projectedFitnessOnGoalDay.value)}.`
						: ''}
				</p>
			) : null}
			{p?.trend ? (
				<p style={{ fontSize: 14 }}>
					{p.trend.direction === 'under'
						? `${plural(p.trend.weeks, 'uke', 'uker')} på rad under stien.`
						: `${plural(p.trend.weeks, 'uke', 'uker')} på rad over stien. Pust litt.`}
				</p>
			) : null}
		</div>
	)
}

function VolumeBars({
	sports,
}: {
	sports: {
		sport: string
		sportName: string
		unit: string
		target: { value: number | null; why: string | null }
		planned: { value: number | null; why: string | null }
		actual: { value: number | null; why: string | null }
	}[]
}) {
	if (!sports.length)
		return <p className="soft">Ingen mengde å vise for uka.</p>
	const unit = (u: string) =>
		u === 'hours'
			? 't'
			: u === 'tss'
				? 'belastning'
				: u === 'sets'
					? 'sett'
					: 'km'
	return (
		<div style={{ display: 'grid', gap: 10 }}>
			{sports.map((s) => {
				const max = Math.max(
					s.target.value ?? 0,
					s.planned.value ?? 0,
					s.actual.value ?? 0,
					1,
				)
				const bar = (v: number | null, color: string, label: string) => (
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 8,
							fontSize: 13,
						}}
					>
						<span className="soft" style={{ width: 62 }}>
							{label}
						</span>
						{v === null ? (
							<span
								className="sti-fog"
								style={{ padding: '2px 8px', flex: 1, fontSize: 12 }}
							>
								ukjent
							</span>
						) : (
							<>
								<span
									style={{
										height: 8,
										borderRadius: 4,
										background: color,
										width: `${(v / max) * 100}%`,
										minWidth: 2,
										maxWidth: '62%',
									}}
								/>
								<span className="num">
									{fmtNumber(v, 1)} {unit(s.unit)}
								</span>
							</>
						)}
					</div>
				)
				return (
					<div key={s.sport}>
						<div style={{ fontWeight: 650, fontSize: 14 }}>{s.sportName}</div>
						{bar(s.target.value, 'var(--t1)', 'Mål')}
						{bar(s.planned.value, 'var(--ink-soft)', 'Planlagt')}
						{bar(s.actual.value, 'var(--ink)', 'Gått')}
					</div>
				)
			})}
		</div>
	)
}

function FloatingCard({
	children,
	onClose,
}: {
	children: React.ReactNode
	onClose: () => void
}) {
	return (
		<div
			role="dialog"
			style={{
				position: 'fixed',
				left: 12,
				right: 12,
				bottom: 'calc(env(safe-area-inset-bottom, 0px) + 76px)',
				zIndex: 45,
				maxWidth: 520,
				margin: '0 auto',
				maxHeight: '60dvh',
				overflowY: 'auto',
				overscrollBehavior: 'contain',
			}}
			className="sti-card sti-float"
		>
			<style>{`.sti-float{box-shadow:0 12px 40px rgba(0,0,0,.16);transition:transform 220ms var(--ease-out),opacity 180ms ease}@starting-style{.sti-float{transform:translateY(10px);opacity:0}}@media (prefers-reduced-motion: reduce){.sti-float{transition:opacity 180ms ease}@starting-style{.sti-float{transform:none}}}`}</style>
			<button
				type="button"
				aria-label="Lukk"
				onClick={onClose}
				className="sti-btn ghost small"
				style={{
					float: 'right',
					width: 44,
					padding: 0,
					border: 0,
					marginTop: -8,
					marginRight: -8,
				}}
			>
				×
			</button>
			<div style={{ fontSize: 15, lineHeight: 1.45 }}>{children}</div>
		</div>
	)
}

/** No date: the path is a four-week loop that grows a little each round. */
function Loop({ data, W }: { data: PathData; W: number }) {
	const plan = data.plan!.plan!
	const weeks = plan.weeks.slice(-4)
	const cx = W / 2
	const cy = 190
	const rx = Math.min(W * 0.36, 160)
	const ry = 130
	const today = data.athlete.today
	const cur = weeks.findIndex(
		(w) => today >= w.weekKey && today <= addDays(w.weekKey, 6),
	)
	const angle = (i: number) => Math.PI / 2 + (i / 4) * Math.PI * 2
	const pos = (a: number) =>
		[cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as const
	const dotA = angle(
		cur < 0
			? 0
			: cur + daysBetween(weeks[Math.max(cur, 0)]!.weekKey, today) / 7,
	)
	const [dx, dy] = pos(dotA)
	return (
		<div style={{ position: 'relative', height: 420 }}>
			<svg
				width={W}
				height={400}
				aria-hidden
				style={{ position: 'absolute', inset: 0 }}
			>
				<ellipse
					cx={cx}
					cy={cy}
					rx={rx}
					ry={ry}
					fill="none"
					stroke="var(--t0)"
					strokeWidth="70"
					strokeOpacity=".7"
				/>
				<ellipse
					cx={cx}
					cy={cy}
					rx={rx}
					ry={ry}
					fill="none"
					stroke="var(--ink)"
					strokeWidth="3"
					strokeDasharray="1 7"
					strokeLinecap="round"
				/>
				{weeks.map((w, i) => {
					const [x, y] = pos(angle(i))
					return (
						<g key={w.weekKey}>
							<rect
								x={x - 14}
								y={y - 10}
								width="28"
								height="20"
								rx="3"
								fill={w.when === 'past' ? 'var(--ink)' : 'var(--slab)'}
								stroke="var(--ink)"
								strokeWidth="1.5"
							/>
							<text
								x={x}
								y={y + 4.5}
								textAnchor="middle"
								fontSize="12"
								fontWeight="700"
								fill={w.when === 'past' ? 'var(--sky)' : 'var(--ink)'}
							>
								{w.number}
							</text>
						</g>
					)
				})}
				<circle
					cx={dx}
					cy={dy}
					r="11"
					fill="none"
					stroke="var(--dot)"
					strokeOpacity=".35"
					strokeWidth="2.5"
				/>
				<circle cx={dx} cy={dy} r="6.5" fill="var(--dot)" />
			</svg>
			<div
				style={{
					position: 'absolute',
					left: 0,
					right: 0,
					top: cy - 30,
					textAlign: 'center',
					padding: '0 80px',
				}}
			>
				<div className="caps" style={{ fontSize: 14 }}>
					Runde {plan.block ?? 1}
				</div>
				<div className="soft" style={{ fontSize: 13 }}>
					Fire uker, litt mer hver runde.
				</div>
			</div>
			<div
				style={{
					position: 'absolute',
					left: 16,
					right: 16,
					top: 400,
					textAlign: 'center',
				}}
			>
				<Link to={`${BASE}/sekk/flagg`} className="sti-link">
					Sett et flagg, så får stien en ende
				</Link>
			</div>
		</div>
	)
}
