import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { NavLink, useNavigate } from 'react-router'
import { mondayOf } from './__fmt.ts'
import { IconClose, IconDown } from './__icons.tsx'

// ── where a focused card grows from ─────────────────────────────────────────

let origin: { rect: DOMRect; at: number } | null = null

/** Remember the card the athlete tapped, so the focused card grows from it. */
export function setOrigin(el: Element | null) {
	origin = el ? { rect: el.getBoundingClientRect(), at: Date.now() } : null
}

function reducedMotion() {
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const DRAWER = 'cubic-bezier(0.32, 0.72, 0, 1)'
const OUT = 'cubic-bezier(0.23, 1, 0.32, 1)'

function insetFor(rect: DOMRect, box: DOMRect) {
	const t = Math.max(0, rect.top - box.top)
	const l = Math.max(0, rect.left - box.left)
	const r = Math.max(0, box.right - rect.right)
	const b = Math.max(0, box.bottom - rect.bottom)
	return `inset(${t}px ${r}px ${b}px ${l}px round 14px)`
}

/**
 * Focus moves into a dialog when it opens and back to where it was when it
 * closes, so a keyboard or screen reader follows the overlay. (Escape is
 * handled by each overlay's own close.)
 */
function useFocusInside(ref: React.RefObject<HTMLElement | null>) {
	useEffect(() => {
		const prev = document.activeElement as HTMLElement | null
		const t = window.setTimeout(() => {
			ref.current
				?.querySelector<HTMLElement>('button, input, textarea, select, a[href]')
				?.focus({ preventScroll: true })
		}, 30)
		return () => {
			window.clearTimeout(t)
			if (prev?.isConnected) prev.focus({ preventScroll: true })
		}
	}, [ref])
}

/**
 * A card from the thread, expanded to the whole screen. It grows out of the
 * card that was tapped and shrinks back into it.
 */
export function FocusCard({
	title,
	children,
	back = '/lab/prat',
}: {
	title: React.ReactNode
	children: React.ReactNode
	back?: string
}) {
	const ref = useRef<HTMLDivElement>(null)
	const from = useRef<DOMRect | null>(null)
	const navigate = useNavigate()
	const closing = useRef(false)
	useFocusInside(ref)

	useLayoutEffect(() => {
		const el = ref.current
		if (!el) return
		const o = origin && Date.now() - origin.at < 2000 ? origin.rect : null
		origin = null
		from.current = o
		if (reducedMotion()) {
			el.animate([{ opacity: 0 }, { opacity: 1 }], {
				duration: 160,
				easing: 'ease',
			})
			return
		}
		if (o) {
			const box = el.getBoundingClientRect()
			el.animate(
				[
					{ clipPath: insetFor(o, box) },
					{ clipPath: 'inset(0px 0px 0px 0px round 0px)' },
				],
				{ duration: 300, easing: DRAWER },
			)
			const body = el.querySelector('.prat-focus-body')
			body?.animate([{ opacity: 0.2 }, { opacity: 1 }], {
				duration: 220,
				easing: OUT,
			})
		} else {
			el.animate(
				[
					{
						opacity: 0,
						transform: `${getComputedStyle(el).transform === 'none' ? '' : getComputedStyle(el).transform} translateY(16px)`,
					},
					{ opacity: 1, transform: getComputedStyle(el).transform },
				],
				{ duration: 220, easing: OUT },
			)
		}
	}, [])

	const close = useCallback(() => {
		const el = ref.current
		if (!el || closing.current) return
		closing.current = true
		const go = () => void navigate(back, { preventScrollReset: true })
		if (reducedMotion()) {
			el.animate([{ opacity: 1 }, { opacity: 0 }], {
				duration: 120,
				easing: 'ease',
			}).onfinish = go
			return
		}
		const o = from.current
		if (o) {
			const box = el.getBoundingClientRect()
			el.animate(
				[
					{ clipPath: 'inset(0px 0px 0px 0px round 0px)' },
					{ clipPath: insetFor(o, box), opacity: 0.6 },
				],
				{ duration: 260, easing: DRAWER, fill: 'forwards' },
			).onfinish = go
		} else {
			el.animate([{ opacity: 1 }, { opacity: 0 }], {
				duration: 160,
				easing: OUT,
				fill: 'forwards',
			}).onfinish = go
		}
	}, [navigate, back])

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') close()
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [close])

	return (
		<>
			<div className="prat-scrim" onClick={close} aria-hidden="true" />
			<div
				className="prat-focus"
				ref={ref}
				role="dialog"
				aria-modal="true"
				aria-label={typeof title === 'string' ? title : undefined}
			>
				<div className="prat-focus-head">
					<button
						type="button"
						className="prat-iconbtn"
						onClick={close}
						aria-label="Lukk og gå tilbake til tråden"
					>
						<IconDown />
					</button>
					<span className="prat-focus-title">{title}</span>
				</div>
				<div className="prat-focus-body">{children}</div>
			</div>
		</>
	)
}

/** Lets a child of a focused card close it the same way the button does. */
export function useCloseFocus(back = '/lab/prat') {
	const navigate = useNavigate()
	return () => void navigate(back, { preventScrollReset: true })
}

// ── Oppslag: the sheet for skimming plan, week, sessions and form ──────────

export function Sheet({
	children,
	today,
}: {
	children: React.ReactNode
	today: string
}) {
	const ref = useRef<HTMLDivElement>(null)
	const navigate = useNavigate()
	const drag = useRef<{ y: number; t: number; dy: number } | null>(null)
	const closing = useRef(false)
	useFocusInside(ref)
	const desktop = () => window.matchMedia('(min-width: 1100px)').matches

	useLayoutEffect(() => {
		const el = ref.current
		if (!el || desktop()) return
		if (reducedMotion()) {
			el.animate([{ opacity: 0 }, { opacity: 1 }], {
				duration: 160,
				easing: 'ease',
			})
			return
		}
		el.animate(
			[{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }],
			{
				duration: 320,
				easing: DRAWER,
			},
		)
	}, [])

	const close = useCallback(() => {
		const el = ref.current
		if (!el || closing.current) return
		closing.current = true
		const go = () => void navigate('/lab/prat', { preventScrollReset: true })
		if (desktop()) return go()
		const now = drag.current?.dy ?? 0
		if (reducedMotion()) {
			el.animate([{ opacity: 1 }, { opacity: 0 }], {
				duration: 120,
				fill: 'forwards',
			}).onfinish = go
			return
		}
		el.animate(
			[
				{ transform: `translateY(${now}px)` },
				{ transform: 'translateY(100%)' },
			],
			{ duration: 240, easing: DRAWER, fill: 'forwards' },
		).onfinish = go
	}, [navigate])

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') close()
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [close])

	const onDown = (e: React.PointerEvent) => {
		if (desktop() || (e.target as HTMLElement).closest('a,button')) return
		drag.current = { y: e.clientY, t: performance.now(), dy: 0 }
		;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
	}
	const onMove = (e: React.PointerEvent) => {
		const d = drag.current
		const el = ref.current
		if (!d || !el) return
		const raw = e.clientY - d.y
		// Pulling up past the top meets friction instead of a wall.
		d.dy = raw < 0 ? raw / 6 : raw
		el.style.transform = `translateY(${d.dy}px)`
	}
	const onUp = () => {
		const d = drag.current
		const el = ref.current
		if (!d || !el) return
		const v = d.dy / Math.max(1, performance.now() - d.t)
		if (d.dy > 120 || v > 0.6) {
			close()
		} else {
			el.animate(
				[
					{ transform: `translateY(${d.dy}px)` },
					{ transform: 'translateY(0)' },
				],
				{
					duration: 220,
					easing: OUT,
				},
			)
			el.style.transform = ''
			drag.current = null
		}
	}

	const week = mondayOf(today)
	return (
		<>
			<div
				className="prat-scrim for-sheet"
				onClick={close}
				aria-hidden="true"
			/>
			<div className="prat-sheet" ref={ref} role="dialog" aria-label="Oppslag">
				<div
					className="prat-sheet-head"
					onPointerDown={onDown}
					onPointerMove={onMove}
					onPointerUp={onUp}
					onPointerCancel={onUp}
					style={{ touchAction: 'none' }}
				>
					<div className="prat-grab" />
					<div className="prat-sheet-row">
						<button
							type="button"
							className="prat-iconbtn prat-sheet-close"
							onClick={close}
							aria-label="Lukk oppslaget"
						>
							<IconClose />
						</button>
						<nav className="prat-tabs" aria-label="Oppslag">
							<NavLink to="/lab/prat/oppslag/plan" preventScrollReset replace>
								Plan
							</NavLink>
							<NavLink
								to={`/lab/prat/oppslag/uke/${week}`}
								preventScrollReset
								replace
							>
								Uke
							</NavLink>
							<NavLink to="/lab/prat/oppslag/okter" preventScrollReset replace>
								Økter
							</NavLink>
							<NavLink to="/lab/prat/oppslag/form" preventScrollReset replace>
								Form
							</NavLink>
						</nav>
					</div>
				</div>
				<div className="prat-sheet-body">{children}</div>
			</div>
		</>
	)
}
