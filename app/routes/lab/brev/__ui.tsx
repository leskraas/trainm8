/**
 * Brev: the paper, the ink and the few things that move. Shared by every
 * route in the app.
 */
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
	useCallback,
	useEffect,
	useId,
	useRef,
	useState,
	type ReactNode,
} from 'react'
import { useCapability } from '#app/lab/engine/client.ts'
import { type Num } from '#app/lab/engine/reads.types.ts'
import {
	SPORT_LETTER,
	timeOf,
	whyShort,
	dateText,
	DAY_NAME,
	weekdayOf,
} from './__lib.ts'
import { markUndone, usePsLines, type PsLine } from './__ps.ts'

/** Class names joined with spaces, falsy ones dropped. */
export function cx(...names: Array<string | false | null | undefined>) {
	return names.filter(Boolean).join(' ')
}

export const EASE_OUT = [0.23, 1, 0.32, 1] as const
export const EASE_DRAWER = [0.32, 0.72, 0, 1] as const

export const BREV_CSS = `
.brev {
	--paper: #F6F1E7; --desk: #E8E1D2; --ink: #1F2430; --ink-2: #5B6170;
	--red: #B23A2E; --green: #2F6B4F; --pencil: #8C8C8C; --rule: rgba(31,36,48,.12);
	--shadow: 0 1px 2px rgba(31,36,48,.08), 0 8px 24px -12px rgba(31,36,48,.18);
	--wash: rgba(31,36,48,.05);
	--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
	--serif: ui-serif, "New York", Georgia, "Times New Roman", serif;
	--mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
	color-scheme: light;
}
@media (prefers-color-scheme: dark) {
	.brev {
		--paper: #16181D; --desk: #0E1013; --ink: #E8E3D8; --ink-2: #A9A497;
		--red: #E07062; --green: #7FBF9C; --pencil: #8E8B85; --rule: rgba(232,227,216,.13);
		--shadow: 0 1px 2px rgba(0,0,0,.4), 0 10px 30px -14px rgba(0,0,0,.7);
		--wash: rgba(232,227,216,.06);
		color-scheme: dark;
	}
}
html:has(.brev), body:has(.brev) { background: var(--desk, #E8E1D2); overscroll-behavior: none; -webkit-tap-highlight-color: transparent; -webkit-text-size-adjust: 100%; }
.brev { min-height: 100dvh; background: var(--desk); color: var(--ink); font-family: var(--serif); font-size: 18px; line-height: 28px; -webkit-font-smoothing: antialiased; }
.brev *, .brev *::before, .brev *::after { box-sizing: border-box; }
:where(.brev) a { color: inherit; }
.brev button, .brev a, .brev [role="button"], .brev [role="slider"] { touch-action: manipulation; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
.brev input, .brev textarea, .brev select { font-size: 16px; font-family: var(--serif); color: var(--ink); }
.brev :focus-visible { outline: 2px solid var(--ink); outline-offset: 3px; border-radius: 2px; }
.b-col { width: 100%; max-width: 34em; margin: 0 auto; padding: calc(env(safe-area-inset-top, 0px) + 56px) 16px calc(env(safe-area-inset-bottom, 0px) + 96px); }
.b-sheet { background: var(--paper); border-radius: 2px; box-shadow: var(--shadow); padding: 28px 22px 32px; position: relative; }
@media (min-width: 480px) { .b-sheet { padding: 40px 40px 44px; } }
.b-sheet + .b-sheet { margin-top: 18px; }
.b-h { font-size: 24px; line-height: 30px; font-weight: 600; letter-spacing: -0.01em; margin: 0 0 12px; text-wrap: balance; }
.b-h2 { font-size: 13px; line-height: 20px; letter-spacing: .08em; text-transform: uppercase; font-family: var(--serif); font-weight: 600; color: var(--ink-2); margin: 32px 0 8px; }
.b-p { margin: 0 0 14px; text-wrap: pretty; overflow-wrap: anywhere; }
.b-small { font-size: 15px; line-height: 22px; color: var(--ink-2); }
.b-num { font-family: var(--mono); font-variant-numeric: tabular-nums; font-size: .86em; letter-spacing: -0.01em; white-space: nowrap; }
.b-unk { font-style: italic; color: var(--pencil); text-decoration: underline dashed; text-decoration-thickness: 1px; text-underline-offset: 3px; }
button.b-unk { background: none; border: 0; padding: 0; font: inherit; font-style: italic; cursor: help; }
.b-hit { color: var(--green); }
.b-off { color: var(--red); }
.b-suggest { color: var(--pencil); text-decoration: underline; text-decoration-color: var(--pencil); text-underline-offset: 4px; }
.b-under { text-decoration: underline; text-decoration-thickness: 1.5px; text-underline-offset: 4px; text-decoration-color: var(--red); }
.b-rule { border: 0; border-top: 1px solid var(--rule); margin: 24px 0; }
.b-word { display: inline-flex; align-items: center; min-height: 44px; padding: 0 2px; margin: -8px 0; background: none; border: 0; color: var(--ink); font: inherit; text-decoration: underline; text-decoration-thickness: 1.5px; text-underline-offset: 5px; cursor: pointer; vertical-align: baseline; transition: color 120ms ease, transform 120ms var(--ease-out); }
.b-word:active { transform: scale(.97); color: var(--ink-2); }
.b-hole { display: inline; padding: 1px 4px; margin: 0 1px; border: 0; border-bottom: 1.5px solid var(--ink); background: var(--wash); color: var(--ink); font: inherit; border-radius: 2px 2px 0 0; cursor: pointer; transition: background-color 120ms ease; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
.b-hole:active { background: var(--rule); }
.b-hole[data-empty="true"] { color: var(--pencil); font-style: italic; border-bottom-style: dashed; border-bottom-color: var(--pencil); }
.b-hole[data-suggest="true"] { color: var(--pencil); }
.b-hole::after { content: " ▾"; font-size: .7em; color: var(--pencil); }
.b-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 48px; padding: 0 20px; border-radius: 2px; border: 1px solid var(--ink); background: var(--ink); color: var(--paper); font: inherit; font-size: 17px; cursor: pointer; transition: transform 120ms var(--ease-out), opacity 120ms ease; }
.b-btn:active { transform: scale(.97); }
.b-btn[disabled] { opacity: .45; cursor: default; }
.b-btn-ghost { background: transparent; color: var(--ink); border-color: var(--rule); }
.b-btn-red { background: var(--red); border-color: var(--red); color: var(--paper); }
.b-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.b-err { color: var(--red); font-style: italic; font-size: 16px; line-height: 24px; margin: 8px 0 0; }
.b-ok { color: var(--green); font-style: italic; }
.b-input { width: 100%; min-height: 48px; padding: 10px 12px; border: 1px solid var(--rule); border-bottom: 1.5px solid var(--ink); border-radius: 2px; background: var(--wash); }
.b-input::placeholder { color: var(--pencil); font-style: italic; }
.b-label { display: block; font-size: 15px; line-height: 22px; color: var(--ink-2); margin: 14px 0 4px; }
.b-sign-name { font-style: italic; font-size: 26px; line-height: 34px; letter-spacing: .01em; }
.b-menu { list-style: none; padding: 0; margin: 0; }
.b-menu > li + li { border-top: 1px solid var(--rule); }
.b-choice { width: 100%; text-align: left; display: flex; gap: 12px; align-items: center; justify-content: space-between; min-height: 52px; padding: 10px 4px; background: none; border: 0; color: var(--ink); font: inherit; cursor: pointer; transition: background-color 120ms ease; border-radius: 2px; }
.b-choice:active { background: var(--wash); }
.b-choice[aria-pressed="true"] .b-check, .b-choice[aria-checked="true"] .b-check { opacity: 1; }
.b-check { opacity: 0; color: var(--green); font-family: var(--mono); flex-shrink: 0; }
.b-choice[disabled] { color: var(--pencil); cursor: default; }
.b-pin { position: relative; }
.b-pin::before { content: ""; position: absolute; top: -7px; left: 50%; width: 12px; height: 12px; margin-left: -6px; border-radius: 50%; background: var(--red); box-shadow: 0 1px 2px rgba(0,0,0,.3); }
.b-lapp { background: var(--paper); border-radius: 2px; box-shadow: var(--shadow); padding: 22px 20px 18px; position: relative; }
.b-lapp-yellow { background: color-mix(in oklab, var(--paper) 88%, #E9C46A); }
.b-stamp { display: inline-block; border: 1.5px solid var(--green); color: var(--green); padding: 2px 8px; border-radius: 2px; font-family: var(--mono); font-size: 13px; line-height: 20px; letter-spacing: .02em; transform: rotate(-2deg); }
.b-ps { padding-left: 0; list-style: none; margin: 0; }
.b-ps li { margin: 0 0 10px; }
.b-strike { text-decoration: line-through; text-decoration-color: var(--red); color: var(--ink-2); }
.b-fab { position: fixed; right: max(16px, env(safe-area-inset-right)); bottom: calc(env(safe-area-inset-bottom, 0px) + 16px); z-index: 50; min-height: 48px; padding: 0 16px; display: inline-flex; align-items: center; gap: 8px; border-radius: 2px; background: var(--paper); color: var(--ink); box-shadow: var(--shadow); border: 1px solid var(--rule); font: inherit; font-size: 16px; text-decoration: none; transition: transform 120ms var(--ease-out); }
.b-fab:active { transform: scale(.97); }
.b-back { display: inline-flex; align-items: center; min-height: 44px; font-size: 16px; color: var(--ink-2); text-decoration: none; margin: -8px 0 8px; }
.b-table { width: 100%; border-collapse: collapse; font-size: 16px; line-height: 24px; }
.b-table th { text-align: left; font-weight: 600; font-size: 13px; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-2); padding: 6px 6px 6px 0; border-bottom: 1px solid var(--rule); }
.b-table td { padding: 8px 6px 8px 0; border-bottom: 1px solid var(--rule); vertical-align: top; }
.b-week { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; margin: 10px 0 4px; }
.b-week > div { min-height: 46px; border: 1px solid var(--rule); border-radius: 2px; padding: 4px 2px; text-align: center; font-family: var(--mono); font-size: 11px; line-height: 14px; font-variant-numeric: tabular-nums; display: flex; flex-direction: column; justify-content: center; gap: 1px; overflow: hidden; }
.b-week > div[data-hard="true"] { background: var(--wash); border-color: var(--ink-2); }
.b-week .d { color: var(--pencil); font-size: 10px; }
.b-strip { display: flex; height: 12px; gap: 1px; margin: 12px 0 6px; border-radius: 1px; overflow: hidden; }
.b-strip > span { display: block; min-width: 2px; }
.b-envelope { display: block; text-decoration: none; background: var(--paper); border-radius: 2px; box-shadow: var(--shadow); padding: 14px 18px; transition: transform 120ms var(--ease-out); }
.b-envelope:active { transform: scale(.985); }
.b-stack { list-style: none; padding: 0; margin: 0; }
.b-stack li { margin-top: -2px; }
.b-stack a { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; text-decoration: none; background: var(--paper); border-radius: 2px; box-shadow: 0 1px 1px rgba(0,0,0,.06); padding: 14px 18px; min-height: 52px; border-top: 1px solid var(--rule); transition: transform 120ms var(--ease-out); }
.b-stack a:active { transform: translateY(1px); }
.b-fig { margin: 14px 0 18px; }
.b-fig figcaption { font-size: 15px; line-height: 22px; color: var(--ink-2); margin-top: 6px; }
.b-dashed { border: 1.5px dashed var(--pencil); border-radius: 2px; padding: 16px; color: var(--pencil); font-style: italic; font-size: 16px; line-height: 24px; }
.b-margin { border-left: 2px solid var(--red); padding: 2px 0 2px 12px; margin: 10px 0; font-style: italic; color: var(--ink-2); }
.b-textarea { width: 100%; min-height: 96px; padding: 10px 12px; border: 1px solid var(--rule); border-radius: 2px; background: var(--wash); line-height: 24px; resize: vertical; }
.b-skel { background: var(--wash); border-radius: 2px; height: 1em; }
@media (hover: hover) and (pointer: fine) {
	.b-word:hover { color: var(--ink-2); }
	.b-hole:hover { background: var(--rule); }
	.b-choice:hover { background: var(--wash); }
	.b-stack a:hover { transform: translateX(2px); }
	.b-envelope:hover, .b-fab:hover { transform: translateY(-1px); }
}
@media (min-width: 900px) {
	.b-wide { display: grid; grid-template-columns: minmax(0, 34em) 16em; gap: 32px; max-width: 54em; margin: 0 auto; }
}
@keyframes b-rise { from { transform: translateY(24px); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes b-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes b-stamp { from { transform: rotate(-2deg) scale(1.15); opacity: 0; } to { transform: rotate(-2deg) scale(1); opacity: 1; } }
.b-new-letter { animation: b-rise 300ms var(--ease-out) both; }
.b-stamp-in { animation: b-stamp 200ms var(--ease-out) both; }
.b-fade-in { animation: b-fade 150ms ease-out both; }
@media (prefers-reduced-motion: reduce) {
	.b-new-letter, .b-stamp-in, .b-fade-in { animation: b-fade 100ms linear both; }
	.b-word, .b-btn, .b-fab, .b-envelope, .b-stack a { transition: none; }
	.b-word:active, .b-btn:active, .b-fab:active, .b-envelope:active, .b-stack a:active { transform: none; }
}
.b-sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
`

// ── Calling the engine ───────────────────────────────────────────────────

/**
 * `useCapability` with the failure message kept for the letter to show in
 * red pen, and cleared when the next call starts.
 */
export function useWrite<I, O>(name: string) {
	const cap = useCapability<I, O>(name)
	const [error, setError] = useState<string | null>(null)
	const call = useCallback(
		async (input: I, opts?: { revalidate?: boolean }) => {
			setError(null)
			const res = await cap.call(input, opts)
			if (!res.ok) setError(res.message)
			return res
		},
		[cap],
	)
	return { call, pending: cap.pending, result: cap.result, error, setError }
}

// ── Little pieces of type ────────────────────────────────────────────────

export function Unknown({
	why,
	children = 'ukjent',
}: {
	why?: string | null
	children?: ReactNode
}) {
	const [open, setOpen] = useState(false)
	if (!why) return <span className="b-unk">{children}</span>
	return (
		<>
			<button
				type="button"
				className="b-unk"
				aria-expanded={open}
				onClick={() => setOpen((o) => !o)}
			>
				{children}
			</button>
			{open ? (
				<span className="b-small b-fade-in"> ({whyShort(why)})</span>
			) : null}
		</>
	)
}

export function N({ children }: { children: ReactNode }) {
	return <span className="b-num">{children}</span>
}

/** A known number with its unit, or unknown with why. */
export function NumText({
	n,
	fmt,
}: {
	n: Num | null | undefined
	fmt: (v: number) => string
}) {
	if (!n || n.value === null || !Number.isFinite(n.value))
		return <Unknown why={n?.why} />
	return <N>{fmt(n.value)}</N>
}

/** Planned in front of actual: `45 → 41 min`. */
export function PlanArrow({
	planned,
	actual,
	fmt,
	tone,
}: {
	planned: number | null
	actual: number | null
	fmt: (v: number) => string
	tone?: 'hit' | 'off' | 'plain' | 'unknown'
}) {
	return (
		<span className="b-num">
			{planned === null ? <Unknown>uten plan</Unknown> : fmt(planned)}
			{' → '}
			{actual === null ? (
				<Unknown>ikke målt</Unknown>
			) : (
				<span
					className={tone === 'hit' ? 'b-hit' : tone === 'off' ? 'b-off' : ''}
				>
					{fmt(actual)}
				</span>
			)}
		</span>
	)
}

export function ErrorLine({ message }: { message: string | null | undefined }) {
	if (!message) return null
	return (
		<p className="b-err b-fade-in" role="alert">
			{message}
		</p>
	)
}

export function SportMark({ sport }: { sport: string }) {
	return (
		<span
			aria-hidden
			className="b-num"
			style={{
				display: 'inline-block',
				minWidth: '1.6em',
				textAlign: 'center',
				border: '1px solid var(--rule)',
				borderRadius: 2,
				fontSize: 12,
				lineHeight: '18px',
				marginRight: 6,
				verticalAlign: '2px',
			}}
		>
			{SPORT_LETTER[sport] ?? 'A'}
		</span>
	)
}

export function Stamp({
	children,
	fresh,
}: {
	children: ReactNode
	fresh?: boolean
}) {
	return (
		<span className={cx('b-stamp', fresh && 'b-stamp-in')}>{children}</span>
	)
}

// ── Sheet: a slip of paper from below ────────────────────────────────────

export function Sheet({
	open,
	onClose,
	title,
	children,
}: {
	open: boolean
	onClose: () => void
	title: string
	children: ReactNode
}) {
	const reduce = useReducedMotion()
	const ref = useRef<HTMLDivElement>(null)
	const titleId = useId()
	useEffect(() => {
		if (!open) return
		const prev = document.activeElement as HTMLElement | null
		const t = window.setTimeout(() => {
			const first = ref.current?.querySelector<HTMLElement>(
				'button, input, textarea, select, a[href]',
			)
			first?.focus({ preventScroll: true })
		}, 30)
		function onKey(e: KeyboardEvent) {
			if (e.key === 'Escape') onClose()
		}
		window.addEventListener('keydown', onKey)
		const overflow = document.body.style.overflow
		document.body.style.overflow = 'hidden'
		return () => {
			window.clearTimeout(t)
			window.removeEventListener('keydown', onKey)
			document.body.style.overflow = overflow
			prev?.focus?.({ preventScroll: true })
		}
	}, [open, onClose])
	return (
		<AnimatePresence>
			{open ? (
				<div
					style={{ position: 'fixed', inset: 0, zIndex: 60 }}
					role="presentation"
				>
					<motion.div
						aria-hidden
						onClick={onClose}
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: reduce ? 0.1 : 0.2, ease: EASE_OUT }}
						style={{
							position: 'absolute',
							inset: 0,
							background: 'rgba(10,12,16,.38)',
						}}
					/>
					<motion.div
						ref={ref}
						role="dialog"
						aria-modal="true"
						aria-labelledby={titleId}
						initial={
							reduce
								? { opacity: 0 }
								: { transform: 'translateY(100%)', opacity: 1 }
						}
						animate={
							reduce
								? { opacity: 1 }
								: { transform: 'translateY(0%)', opacity: 1 }
						}
						exit={
							reduce
								? { opacity: 0 }
								: { transform: 'translateY(100%)', opacity: 1 }
						}
						transition={{ duration: reduce ? 0.1 : 0.32, ease: EASE_DRAWER }}
						style={{
							position: 'absolute',
							left: 0,
							right: 0,
							bottom: 0,
							margin: '0 auto',
							maxWidth: '34em',
							maxHeight: '86dvh',
							overflowY: 'auto',
							overscrollBehavior: 'contain',
							background: 'var(--paper)',
							borderRadius: '2px 2px 0 0',
							boxShadow: '0 -10px 40px -10px rgba(0,0,0,.35)',
							padding:
								'20px 20px calc(env(safe-area-inset-bottom, 0px) + 20px)',
						}}
					>
						<div
							style={{
								display: 'flex',
								justifyContent: 'space-between',
								alignItems: 'center',
								gap: 12,
								marginBottom: 8,
							}}
						>
							<h2
								id={titleId}
								className="b-h"
								style={{ margin: 0, fontSize: 20, lineHeight: '26px' }}
							>
								{title}
							</h2>
							<button
								type="button"
								onClick={onClose}
								className="b-word"
								style={{ fontSize: 16, color: 'var(--ink-2)' }}
							>
								Lukk
							</button>
						</div>
						{children}
					</motion.div>
				</div>
			) : null}
		</AnimatePresence>
	)
}

// ── Signature: drag a finger over the line ───────────────────────────────

const SQUIGGLE =
	'M4 30 C 20 6, 30 6, 36 26 S 52 42, 62 20 S 84 4, 92 24 S 120 40, 136 18 S 170 10, 190 26 S 230 30, 262 16'

/**
 * Signing is a deliberate act: the stroke follows the finger, and it only
 * counts when it crosses most of the line. Enter or Space signs too (a
 * ready-made stroke is drawn), so it works without a pointer.
 */
export function Signature({
	name,
	label,
	onSign,
	signed,
	pending,
	disabled,
}: {
	name: string
	label: string
	onSign: () => void
	signed: boolean
	pending?: boolean
	disabled?: boolean
}) {
	const box = useRef<HTMLDivElement>(null)
	const [points, setPoints] = useState<[number, number][]>([])
	const [inked, setInked] = useState(false)
	const [hint, setHint] = useState<string | null>(null)
	const drawing = useRef(false)
	const reduce = useReducedMotion()

	const path =
		points.length > 1
			? 'M' +
				points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L')
			: ''

	function local(e: React.PointerEvent) {
		const r = box.current!.getBoundingClientRect()
		return [
			Math.max(0, Math.min(r.width, e.clientX - r.left)),
			Math.max(0, Math.min(r.height, e.clientY - r.top)),
		] as [number, number]
	}

	function commit() {
		setInked(true)
		setHint(null)
		onSign()
	}

	const isSigned = signed || inked
	const locked = isSigned || disabled || pending

	return (
		<div>
			<div
				ref={box}
				role="button"
				tabIndex={locked ? -1 : 0}
				aria-disabled={locked}
				aria-label={isSigned ? `Signert av ${name}` : label}
				onKeyDown={(e) => {
					if (locked) return
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault()
						setPoints([])
						commit()
					}
				}}
				onPointerDown={(e) => {
					if (locked) return
					drawing.current = true
					e.currentTarget.setPointerCapture(e.pointerId)
					setPoints([local(e)])
				}}
				onPointerMove={(e) => {
					if (!drawing.current) return
					const p = local(e)
					setPoints((ps) => [...ps, p])
				}}
				onPointerUp={() => {
					if (!drawing.current) return
					drawing.current = false
					const w = box.current?.getBoundingClientRect().width ?? 1
					const xs = points.map((p) => p[0])
					const span = xs.length ? Math.max(...xs) - Math.min(...xs) : 0
					if (span >= w * 0.55) commit()
					else {
						setPoints([])
						setHint('Dra helt over linja.')
					}
				}}
				onPointerCancel={() => {
					drawing.current = false
					setPoints([])
				}}
				style={{
					position: 'relative',
					height: 76,
					touchAction: 'none',
					cursor: locked ? 'default' : 'crosshair',
					borderBottom: '1.5px solid var(--ink)',
					opacity: disabled ? 0.45 : 1,
				}}
			>
				<svg
					aria-hidden
					width="100%"
					height="100%"
					style={{ position: 'absolute', inset: 0, overflow: 'visible' }}
					viewBox={points.length > 1 ? undefined : '0 0 270 50'}
					preserveAspectRatio="xMinYMid meet"
				>
					{path ? (
						<path
							d={path}
							fill="none"
							strokeWidth={isSigned ? 2.6 : 2}
							strokeLinecap="round"
							strokeLinejoin="round"
							style={{
								stroke: isSigned ? 'var(--ink)' : 'var(--pencil)',
								transition: reduce
									? 'stroke 100ms linear'
									: 'stroke 150ms ease-out, stroke-width 150ms ease-out',
							}}
						/>
					) : isSigned ? (
						<path
							d={SQUIGGLE}
							fill="none"
							strokeWidth={2.4}
							strokeLinecap="round"
							style={{ stroke: 'var(--ink)' }}
							className="b-fade-in"
						/>
					) : null}
				</svg>
				{!isSigned && points.length === 0 ? (
					<span
						aria-hidden
						style={{
							position: 'absolute',
							left: 0,
							bottom: 6,
							color: 'var(--pencil)',
							fontStyle: 'italic',
							fontSize: 16,
							pointerEvents: 'none',
						}}
					>
						{pending ? 'Sender …' : `✍ Dra fingeren over linja`}
					</span>
				) : null}
			</div>
			<div
				style={{
					display: 'flex',
					justifyContent: 'space-between',
					gap: 12,
					marginTop: 6,
				}}
			>
				<span className="b-small">{label}</span>
				<span
					className="b-small"
					style={{ fontStyle: 'italic', textAlign: 'right' }}
				>
					{isSigned ? (pending ? 'Sender …' : name) : ''}
				</span>
			</div>
			{hint ? <p className="b-err">{hint}</p> : null}
		</div>
	)
}

// ── RPE: ten small strokes you drag across ───────────────────────────────

export function RpeStrokes({
	value,
	onChange,
	disabled,
}: {
	value: number | null
	onChange: (v: number) => void
	disabled?: boolean
}) {
	const [hover, setHover] = useState<number | null>(null)
	const ref = useRef<HTMLDivElement>(null)
	const dragging = useRef(false)
	const shown = hover ?? value
	function at(e: React.PointerEvent) {
		const r = ref.current!.getBoundingClientRect()
		const x = Math.max(0, Math.min(r.width - 1, e.clientX - r.left))
		return Math.floor((x / r.width) * 10) + 1
	}
	const words = [
		'',
		'veldig lett',
		'lett',
		'lett',
		'rolig',
		'middels',
		'litt hardt',
		'hardt',
		'hardt',
		'veldig hardt',
		'alt jeg hadde',
	]
	return (
		<div>
			<div
				ref={ref}
				role="slider"
				tabIndex={disabled ? -1 : 0}
				aria-label="Hvor tungt, 1 til 10"
				aria-valuemin={1}
				aria-valuemax={10}
				aria-valuenow={value ?? undefined}
				aria-valuetext={value ? `${value}: ${words[value]}` : 'ikke oppgitt'}
				aria-disabled={disabled}
				onKeyDown={(e) => {
					if (disabled) return
					const v = value ?? 5
					if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
						e.preventDefault()
						onChange(Math.min(10, v + (value ? 1 : 0)))
					} else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
						e.preventDefault()
						onChange(Math.max(1, v - (value ? 1 : 0)))
					}
				}}
				onPointerDown={(e) => {
					if (disabled) return
					dragging.current = true
					e.currentTarget.setPointerCapture(e.pointerId)
					setHover(at(e))
				}}
				onPointerMove={(e) => {
					if (dragging.current) setHover(at(e))
				}}
				onPointerUp={(e) => {
					if (!dragging.current) return
					dragging.current = false
					const v = at(e)
					setHover(null)
					onChange(v)
				}}
				onPointerCancel={() => {
					dragging.current = false
					setHover(null)
				}}
				style={{
					display: 'grid',
					gridTemplateColumns: 'repeat(10, minmax(0, 1fr))',
					height: 48,
					alignItems: 'end',
					touchAction: 'none',
					cursor: disabled ? 'default' : 'pointer',
					opacity: disabled ? 0.5 : 1,
				}}
			>
				{Array.from({ length: 10 }, (_, i) => {
					const on = shown !== null && i < shown
					return (
						<span
							key={i}
							aria-hidden
							style={{
								display: 'block',
								justifySelf: 'center',
								width: 3,
								height: 14 + i * 3,
								borderRadius: 1,
								background: on
									? i >= 7
										? 'var(--red)'
										: 'var(--ink)'
									: 'var(--rule)',
								transition: 'background-color 80ms linear',
							}}
						/>
					)
				})}
			</div>
			<div
				className="b-small"
				style={{
					display: 'flex',
					justifyContent: 'space-between',
					marginTop: 4,
				}}
				aria-hidden
			>
				<span>1</span>
				<span style={{ fontStyle: 'italic' }}>
					{shown ? `${shown} – ${words[shown]}` : 'dra over strekene'}
				</span>
				<span>10</span>
			</div>
		</div>
	)
}

// ── The week as seven little boxes ───────────────────────────────────────

export type LineDay = {
	weekday: string
	items: { sport: string; minutes: number | null; hard?: boolean }[]
}

export function WeekLine({ days, label }: { days: LineDay[]; label: string }) {
	return (
		<div className="b-week" role="img" aria-label={label}>
			{days.map((d, i) => {
				const hard = d.items.some((x) => x.hard)
				return (
					<div key={i} data-hard={hard}>
						<span className="d">{d.weekday}</span>
						{d.items.length === 0 ? (
							<span style={{ color: 'var(--pencil)' }}>hvile</span>
						) : (
							d.items.slice(0, 2).map((x, j) => (
								<span key={j}>
									{SPORT_LETTER[x.sport] ?? 'A'}
									{x.minutes !== null ? ` ${Math.round(x.minutes)}` : ''}
								</span>
							))
						)}
						{d.items.length > 2 ? (
							<span style={{ color: 'var(--pencil)' }}>
								+{d.items.length - 2}
							</span>
						) : null}
					</div>
				)
			})}
		</div>
	)
}

// ── PS lines ─────────────────────────────────────────────────────────────

export function PsLines({
	weekKey,
	timeZone,
	extra,
	empty,
}: {
	weekKey?: string
	timeZone?: string
	extra?: ReactNode
	empty?: ReactNode
}) {
	const lines = usePsLines(weekKey)
	const hasExtra = Array.isArray(extra) ? extra.length > 0 : !!extra
	if (lines.length === 0 && !hasExtra) return <>{empty ?? null}</>
	return (
		<ul className="b-ps" aria-label="PS">
			{extra}
			{lines.map((l) => (
				<PsItem key={l.id} line={l} timeZone={timeZone} />
			))}
		</ul>
	)
}

function PsItem({ line, timeZone }: { line: PsLine; timeZone?: string }) {
	const undo = useWrite<{ token: string }, unknown>('undo')
	const reduce = useReducedMotion()
	return (
		<li className="b-fade-in">
			<span
				style={{
					textDecorationLine: line.undone ? 'line-through' : 'none',
					textDecorationColor: 'var(--red)',
					color: line.undone ? 'var(--ink-2)' : undefined,
					transition: reduce ? 'none' : 'color 200ms ease',
				}}
			>
				<strong style={{ fontWeight: 600 }}>PS:</strong> {line.text}{' '}
				<span className="b-small">
					({DAY_NAME[weekdayOf(line.at.slice(0, 10))]}{' '}
					{timeOf(line.at, timeZone)})
				</span>
			</span>{' '}
			{line.undone ? (
				<span className="b-small" style={{ fontStyle: 'italic' }}>
					Angret.
				</span>
			) : line.token ? (
				<button
					type="button"
					className="b-word"
					style={{ color: 'var(--red)', fontSize: 16 }}
					disabled={undo.pending}
					onClick={async () => {
						const r = await undo.call({ token: line.token! })
						if (r.ok) markUndone(line.id)
					}}
				>
					{undo.pending ? 'Angrer …' : 'Angre'}
				</button>
			) : line.noUndoBecause ? (
				<span className="b-small" style={{ fontStyle: 'italic' }}>
					Kan ikke angres: {line.noUndoBecause}
				</span>
			) : null}
			<ErrorLine message={undo.error} />
		</li>
	)
}

export function dateLine(key: string) {
	return `${DAY_NAME[weekdayOf(key)]} ${dateText(key)}`
}
