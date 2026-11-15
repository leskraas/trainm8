import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLoaderData, useNavigate, useRevalidator } from 'react-router'
import { type Route } from './+types/index.ts'
import { BASE } from './__api.ts'
import { Deck, type Card } from './__deck.tsx'
import { DAY_NAME, dur, longDate, weekdayOf } from './__format.ts'
import { loadRo } from './__load.server.ts'
import { buildRoCards } from './__ro-cards.tsx'
import { bigName, blockRows, strengthRows, verdictWord } from './__session.tsx'
import { StatusView } from './__status.tsx'
import { useUndo } from './__undo.tsx'

export const meta = () => [{ title: 'Tommel' }]

export async function loader({ request }: Route.LoaderArgs) {
	return loadRo(request)
}

const CLOSED_KEY = 'tommel:deck-closed'

function closedToday(today: string) {
	try {
		return sessionStorage.getItem(CLOSED_KEY) === today
	} catch {
		return false
	}
}

/** Swipe up for Status, down for recent changes, hold for «change something». */
function useRoGestures(nav: (to: string) => void) {
	const ref = useRef<HTMLDivElement>(null)
	useEffect(() => {
		const el = ref.current
		if (!el) return
		const scroller = el.querySelector<HTMLElement>('.tm-ro-scroll')
		const content = el.querySelector<HTMLElement>('.tm-ro-press')
		let sx = 0
		let sy = 0
		let atTop = true
		let atBottom = true
		let timer: number | undefined
		let px = 0
		let py = 0
		const interactive = (t: EventTarget | null) =>
			!!(t as HTMLElement | null)?.closest('button,a,input,textarea')
		function onTouchStart(e: TouchEvent) {
			if (e.touches.length !== 1 || interactive(e.target)) return
			sx = e.touches[0]!.clientX
			sy = e.touches[0]!.clientY
			atTop = !scroller || scroller.scrollTop <= 0
			atBottom =
				!scroller ||
				scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2
		}
		function onTouchEnd(e: TouchEvent) {
			const t = e.changedTouches[0]
			if (!t || interactive(e.target)) return
			const dx = t.clientX - sx
			const dy = t.clientY - sy
			if (Math.abs(dy) < 70 || Math.abs(dy) < Math.abs(dx) * 1.5) return
			if (dy < 0 && atBottom) nav(`${BASE}/status`)
			else if (dy > 0 && atTop) nav(`${BASE}/endringer`)
		}
		function cancel() {
			window.clearTimeout(timer)
			timer = undefined
			content?.classList.remove('is-pressing')
		}
		function onPointerDown(e: PointerEvent) {
			if (e.button !== 0 || interactive(e.target)) return
			px = e.clientX
			py = e.clientY
			content?.classList.add('is-pressing')
			timer = window.setTimeout(() => {
				content?.classList.remove('is-pressing')
				try {
					navigator.vibrate?.(10)
				} catch {
					// No vibration on this device.
				}
				nav(`${BASE}/endre`)
			}, 600)
		}
		function onPointerMove(e: PointerEvent) {
			if (timer && Math.hypot(e.clientX - px, e.clientY - py) > 10) cancel()
		}
		el.addEventListener('touchstart', onTouchStart, { passive: true })
		el.addEventListener('touchend', onTouchEnd, { passive: true })
		el.addEventListener('pointerdown', onPointerDown)
		el.addEventListener('pointermove', onPointerMove)
		el.addEventListener('pointerup', cancel)
		el.addEventListener('pointercancel', cancel)
		el.addEventListener('pointerleave', cancel)
		const noMenu = (e: Event) => e.preventDefault()
		el.addEventListener('contextmenu', noMenu)
		return () => {
			cancel()
			el.removeEventListener('touchstart', onTouchStart)
			el.removeEventListener('touchend', onTouchEnd)
			el.removeEventListener('pointerdown', onPointerDown)
			el.removeEventListener('pointermove', onPointerMove)
			el.removeEventListener('pointerup', cancel)
			el.removeEventListener('pointercancel', cancel)
			el.removeEventListener('pointerleave', cancel)
			el.removeEventListener('contextmenu', noMenu)
		}
	}, [nav])
	return ref
}

export default function Ro() {
	const { ro, main, progress, plan, sessions } = useLoaderData<typeof loader>()
	const navigate = useNavigate()
	const revalidator = useRevalidator()
	const { offer } = useUndo()
	const nav = useCallback((to: string) => void navigate(to), [navigate])
	const [cards, setCards] = useState<Card[] | null>(null)
	const [open, setOpen] = useState(false)
	const [run, setRun] = useState(0)
	const ref = useRoGestures(nav)
	const t = ro.today
	const goal = ro.athlete.goal

	useEffect(() => {
		if (open) return
		const c = buildRoCards(ro, { nav, offer, now: new Date() })
		setCards(c)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ro, open])

	useEffect(() => {
		if (cards && cards.length > 0 && !closedToday(t.date) && run === 0) {
			setOpen(true)
			setRun(1)
		}
	}, [cards, t.date, run])

	const onEnd = useCallback(() => {
		setOpen(false)
		void revalidator.revalidate()
	}, [revalidator])

	function close() {
		try {
			sessionStorage.setItem(CLOSED_KEY, t.date)
		} catch {
			// Fine: the stack just opens again next time.
		}
		setOpen(false)
	}

	const status = (
		<aside className="tm-split-side" aria-label="Status">
			<div className="tm-page">
				<StatusView
					progress={progress}
					plan={plan}
					today={t}
					sessions={sessions}
				/>
			</div>
		</aside>
	)

	if (open && cards && cards.length > 0) {
		return (
			<div className="tm-split">
				<main aria-label="Kort som venter">
					<Deck
						key={`deck-${run}`}
						start={cards}
						onEnd={onEnd}
						backLabel="Forrige"
						topLeft={
							<button type="button" className="tm-iconbtn" onClick={close}>
								<svg
									width="20"
									height="20"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									aria-hidden="true"
								>
									<path d="m6 9 6 6 6-6" />
								</svg>
								<span style={{ fontSize: 14 }}>Til dagen</span>
							</button>
						}
					/>
				</main>
				{status}
			</div>
		)
	}

	const others = t.sessions.filter(
		(s) => s.id !== main?.id && s.status !== 'recording-only',
	)
	const fromWatch = t.sessions.filter((s) => s.status === 'recording-only')
	const done = main && main.status === 'done'
	const rows = main
		? main.strength
			? strengthRows(main)
			: blockRows(main.structure)
		: []

	return (
		<div className="tm-split">
			<main className="tm-ro" ref={ref} aria-label="I dag">
				<div className="tm-top">
					<Link
						to={`${BASE}/endringer`}
						className="tm-iconbtn"
						aria-label="Siste endringer"
					>
						<svg
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							aria-hidden="true"
						>
							<path d="m6 15 6-6 6 6" />
						</svg>
						<span style={{ fontSize: 13, color: 'var(--muted)' }}>
							Siste endringer
						</span>
					</Link>
				</div>
				<div className="tm-ro-scroll">
					<div className="tm-ro-press">
						<p className="tm-ro-date">
							{DAY_NAME[weekdayOf(t.date)].replace(/^./, (c) =>
								c.toUpperCase(),
							)}{' '}
							{longDate(t.date)}
							{t.phase
								? ` · uke ${t.phase.planWeek} av ${t.phase.planWeeks}, ${t.phase.name}`
								: ''}
						</p>
						{goal?.kind === 'event' && goal.daysToGo === 1 ? (
							<p className="tm-ro-sub" style={{ color: 'var(--fg)' }}>
								I morgen: {goal.name}.
							</p>
						) : null}
						{goal?.kind === 'event' && goal.daysToGo === 0 ? (
							<p className="tm-ro-sub" style={{ color: 'var(--fg)' }}>
								I dag: {goal.name}. Lykke til.
							</p>
						) : null}
						{!main ? (
							<>
								<h1 className="tm-ro-title">Hvil.</h1>
								{fromWatch.length ? (
									<p className="tm-ro-also">
										Fra klokka:{' '}
										{fromWatch
											.map(
												(s) =>
													`${s.title}${s.actual.durationS.value ? `, ${dur(s.actual.durationS.value)}` : ''}`,
											)
											.join(' · ')}
									</p>
								) : null}
							</>
						) : (
							<>
								<h1 className="tm-ro-title">
									{done
										? 'Gjort.'
										: main.status === 'missed'
											? 'Ikke gjort.'
											: `${bigName(main)}.`}
									{!done &&
									main.status === 'planned' &&
									main.planned.durationS.value ? (
										<span
											style={{ display: 'block', color: 'var(--muted)' }}
											className="num"
										>
											{dur(main.planned.durationS.value)}.
										</span>
									) : null}
								</h1>
								{done ? (
									<p
										className={`tm-big ${main.comparison.verdict.call ?? 'none'}`}
										style={{ fontSize: 40, marginTop: 10 }}
									>
										{verdictWord(main.comparison.verdict)}
									</p>
								) : null}
								<p className="tm-ro-sub">
									{[
										main.title !== bigName(main) || done ? main.title : null,
										main.sportName,
										main.time ? `kl. ${main.time}` : null,
									]
										.filter(Boolean)
										.join(' · ')}
								</p>
								{main.adjustedBecause ? (
									<p className="tm-ro-also">Justert: {main.adjustedBecause}</p>
								) : null}
								{rows.length ? (
									<div className="tm-ro-rows">
										{rows.map(([a, b], i) =>
											a === null ? (
												<div className="tm-ro-row" key={i}>
													<div
														style={{ gridColumn: '1 / -1', color: 'var(--fg)' }}
													>
														{b}
													</div>
												</div>
											) : (
												<div className="tm-ro-row" key={i}>
													<div>{a}</div>
													<div>{b}</div>
												</div>
											),
										)}
									</div>
								) : main.description ? (
									<p className="tm-ro-also">{main.description}</p>
								) : null}
								{others.length || fromWatch.length ? (
									<p className="tm-ro-also">
										{others.length
											? `Også i dag: ${others.map((s) => `${s.title}${s.time ? ` kl. ${s.time}` : ''}`).join(' · ')}.`
											: ''}
										{fromWatch.length
											? ` Fra klokka: ${fromWatch.map((s) => s.title).join(', ')}.`
											: ''}
									</p>
								) : null}
							</>
						)}
					</div>
				</div>
				<div className="tm-ro-bottom">
					{cards && cards.length > 0 ? (
						<button
							type="button"
							className="tm-ro-stack"
							onClick={() => {
								setRun((n) => n + 1)
								setOpen(true)
							}}
						>
							{cards.length === 1 ? 'Ett kort venter' : 'Kort venter'}{' '}
							<b>{cards.length}</b>
						</button>
					) : cards ? (
						<p className="tm-hint" style={{ fontSize: 14 }}>
							{main && main.status === 'planned'
								? 'Ingen kort nå. Gjør dagens økt.'
								: 'Ingen kort nå.'}
						</p>
					) : null}
					<Link
						to={`${BASE}/passer-ikke`}
						className="tm-passer"
						style={{ display: 'inline-flex', alignItems: 'center' }}
					>
						Det passer ikke
					</Link>
					<Link to={`${BASE}/status`} className="tm-handle tm-only-narrow">
						<i aria-hidden="true" />
						Status
					</Link>
					<p className="tm-hint">Hold inne for å endre noe om deg</p>
				</div>
			</main>
			{status}
		</div>
	)
}
