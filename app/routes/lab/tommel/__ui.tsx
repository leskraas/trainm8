import { useEffect, useRef, type ReactNode } from 'react'

/** Class names joined, falsy ones dropped. */
export function cx(...names: Array<string | false | null | undefined>) {
	return names.filter(Boolean).join(' ')
}

// ── icons: thumbs in the targets, an arrow for undo/back. Nothing else. ──

export function ThumbUp({ size = 30 }: { size?: number }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.9"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="M7 20.5h9.6a2 2 0 0 0 1.95-1.56l1.4-6.2A2 2 0 0 0 18 10.3h-4.6l.75-3.8a2.1 2.1 0 0 0-3.9-1.4L7 10.5" />
			<path d="M3.5 10.5H7v10H3.5z" />
		</svg>
	)
}

export function ThumbDown({ size = 30 }: { size?: number }) {
	return (
		<span style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}>
			<ThumbUp size={size} />
		</span>
	)
}

export function ArrowBack({ size = 22 }: { size?: number }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="M9 14 4 9l5-5" />
			<path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
		</svg>
	)
}

/** «ukjent» in grey, in the number's place, with a thin dashed frame. */
export function Unknown({
	why,
	word = 'ukjent',
}: {
	why?: string | null
	word?: string
}) {
	return (
		<span className="tm-unknown" title={why ?? undefined}>
			{word}
		</span>
	)
}

/** A number, or «ukjent» where the engine could not know it. */
export function N({
	v,
	why,
	fmt,
}: {
	v: number | null | undefined
	why?: string | null
	fmt: (n: number) => string
}) {
	if (v === null || v === undefined) return <Unknown why={why} />
	return <span className="num">{fmt(v)}</span>
}

/** Every change card shows before and after as two small rows. */
export function BeforeAfter({
	before,
	after,
}: {
	before: ReactNode
	after: ReactNode
}) {
	return (
		<div className="tm-ba">
			<div className="tm-ba-row">
				<b>Før</b>
				<div>{before}</div>
			</div>
			<div className="tm-ba-row after">
				<b>Etter</b>
				<div>{after}</div>
			</div>
		</div>
	)
}

export function Rows({ rows }: { rows: Array<[ReactNode, ReactNode]> }) {
	return (
		<div className="tm-rows">
			{rows.map(([a, b], i) =>
				a === null ? (
					<div className="tm-row" key={i}>
						<div style={{ gridColumn: '1 / -1', color: 'var(--ink)' }}>{b}</div>
					</div>
				) : (
					<div className="tm-row" key={i}>
						<div>{a}</div>
						<div>{b}</div>
					</div>
				),
			)}
		</div>
	)
}

// ── the wheel: native scroll-snap physics, read on settle ─────────────

export type WheelItem = { v: number; l: string }
const ITEM = 44

export function Wheel({
	items,
	value,
	onChange,
	label,
	minWidth = 64,
}: {
	items: WheelItem[]
	value: number
	onChange: (v: number) => void
	label: string
	minWidth?: number
}) {
	const ref = useRef<HTMLDivElement>(null)
	const idx = Math.max(
		0,
		items.findIndex((i) => i.v === value),
	)
	const last = useRef(idx)
	const frame = useRef(0)

	useEffect(() => {
		const el = ref.current
		if (!el) return
		if (Math.round(el.scrollTop / ITEM) !== idx) el.scrollTop = idx * ITEM
		last.current = idx
	}, [idx])

	function onScroll() {
		cancelAnimationFrame(frame.current)
		frame.current = requestAnimationFrame(() => {
			const el = ref.current
			if (!el) return
			const i = Math.min(
				items.length - 1,
				Math.max(0, Math.round(el.scrollTop / ITEM)),
			)
			if (i !== last.current) {
				last.current = i
				onChange(items[i]!.v)
			}
		})
	}

	function go(i: number) {
		const el = ref.current
		const j = Math.min(items.length - 1, Math.max(0, i))
		if (!el) return
		const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
		el.scrollTo({ top: j * ITEM, behavior: reduce ? 'auto' : 'smooth' })
		if (j !== last.current) {
			last.current = j
			onChange(items[j]!.v)
		}
	}

	return (
		<div
			ref={ref}
			className="tm-wheel"
			style={{ minWidth }}
			role="spinbutton"
			tabIndex={0}
			aria-label={label}
			aria-valuenow={value}
			aria-valuetext={items[idx]?.l}
			data-nodrag
			onScroll={onScroll}
			onKeyDown={(e) => {
				if (e.key === 'ArrowUp') {
					e.preventDefault()
					go(last.current - 1)
				} else if (e.key === 'ArrowDown') {
					e.preventDefault()
					go(last.current + 1)
				}
			}}
		>
			{items.map((it, i) => (
				<div key={it.v} onClick={() => go(i)}>
					{it.l}
				</div>
			))}
		</div>
	)
}

export function range(
	from: number,
	to: number,
	step = 1,
	fmt?: (n: number) => string,
): WheelItem[] {
	const out: WheelItem[] = []
	for (let v = from; v <= to + 1e-9; v += step) {
		const r = Math.round(v * 100) / 100
		out.push({ v: r, l: fmt ? fmt(r) : String(r).replace('.', ',') })
	}
	return out
}

/** The scale card's row: ten squares, one tap. */
export function Scale({
	value,
	onPick,
	disabled,
}: {
	value: number | null
	onPick: (n: number) => void
	disabled?: boolean
}) {
	return (
		<div>
			<div
				className="tm-scale"
				role="group"
				aria-label="Hvor tung, 1 til 10"
				data-nodrag
			>
				{Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
					<button
						key={n}
						type="button"
						aria-pressed={value === n}
						disabled={disabled}
						onClick={() => onPick(n)}
					>
						{n}
					</button>
				))}
			</div>
			<div className="tm-scale-legend">
				<span>1 veldig lett</span>
				<span>10 alt jeg hadde</span>
			</div>
		</div>
	)
}

/** Hold for two seconds to confirm: the slow, deliberate twin of a swipe. */
export function HoldButton({
	children,
	onConfirm,
	className = 'tm-wide danger',
}: {
	children: ReactNode
	onConfirm: () => void
	className?: string
}) {
	const ref = useRef<HTMLButtonElement>(null)
	const timer = useRef<number | undefined>(undefined)
	function start() {
		ref.current?.classList.add('is-holding')
		timer.current = window.setTimeout(() => {
			ref.current?.classList.remove('is-holding')
			onConfirm()
		}, 2000)
	}
	function stop() {
		ref.current?.classList.remove('is-holding')
		window.clearTimeout(timer.current)
	}
	return (
		<button
			ref={ref}
			type="button"
			className={cx(className, 'tm-hold')}
			data-nodrag
			onPointerDown={start}
			onPointerUp={stop}
			onPointerLeave={stop}
			onPointerCancel={stop}
			onKeyDown={(e) => {
				if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
					e.preventDefault()
					start()
				}
			}}
			onKeyUp={stop}
			onContextMenu={(e) => e.preventDefault()}
		>
			<span>{children}</span>
		</button>
	)
}
