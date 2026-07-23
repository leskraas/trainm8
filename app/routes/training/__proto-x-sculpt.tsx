import { useMemo, useRef, useState } from 'react'
import { cn } from '#app/utils/misc.tsx'
import {
	FOCUS_META,
	MACRO_TEMPLATES,
	MESO_TEMPLATES,
	RHYTHM_LABEL,
	deriveBlockWeeks,
	instantiate,
	instantiateMacro,
	projectBlockCtl,
	smoothPath,
	type BlockFocus,
	type BlockRhythm,
	type MacroTemplate,
	type MesoBlock,
} from './__proto-x-blocks-model.ts'
import {
	FALLBACK_PLAN,
	formatEventDate,
	type ProtoPlanInput,
} from './__proto-x-model.ts'

// PROTOTYPE variant H — "Sculpt", the graph-first revision of the Block
// Builder. The plan is
// sculpted directly on an area chart: pick a recognized periodization shape
// from the template shelf (each previewed as a curve), then drag week
// points vertically to set targets and drag block boundaries horizontally
// to resize blocks. Blocks (mesos) keep their focus (endurance / threshold
// / VO2max / strength / …) and per-block 3:1 / 2:1 rhythm; the plan anchors
// to the Target Event or runs open-ended and repeats.

type Anchor = 'event' | 'ongoing'
type Currency = 'hours' | 'km' | 'tss'

// Planning assumption for the km currency: easy run pace ≈ 6:00/km.
const KM_PER_HOUR = 10

/** Round a raw step to a "nice" 1/2/5×10^n value for axis ticks. */
function niceStep(raw: number): number {
	const mag = Math.pow(10, Math.floor(Math.log10(raw)))
	const n = raw / mag
	return (n >= 5 ? 5 : n >= 2 ? 2 : 1) * mag
}

function startOfTrainingWeek(d: Date): Date {
	const out = new Date(d)
	const day = (out.getUTCDay() + 6) % 7
	out.setUTCDate(out.getUTCDate() - day)
	out.setUTCHours(0, 0, 0, 0)
	return out
}

function fmtRange(monday: Date): string {
	const sunday = new Date(monday)
	sunday.setUTCDate(sunday.getUTCDate() + 6)
	const f = (d: Date) =>
		d.toLocaleDateString('en-GB', {
			day: 'numeric',
			month: 'short',
			timeZone: 'UTC',
		})
	return `${f(monday)} – ${f(sunday)}`
}

export function SculptVariant({ plan }: { plan: ProtoPlanInput }) {
	const source = plan ?? FALLBACK_PLAN
	const eventDate = useMemo(
		() => new Date(source.eventDate),
		[source.eventDate],
	)
	const [anchor, setAnchor] = useState<Anchor>('event')
	const [blocks, setBlocks] = useState<MesoBlock[]>(() =>
		instantiateMacro(MACRO_TEMPLATES[0]!),
	)
	const [appliedMacro, setAppliedMacro] = useState<string>(
		MACRO_TEMPLATES[0]!.id,
	)
	const [overrides, setOverrides] = useState<Record<number, number>>({})
	const [selectedBlock, setSelectedBlock] = useState<string | null>(null)
	const [currency, setCurrency] = useState<Currency>('km')

	const weeks = useMemo(
		() => deriveBlockWeeks(blocks, overrides),
		[blocks, overrides],
	)
	const chartRepeats = anchor === 'ongoing' ? 2 : 1
	const ctl = useMemo(
		() => projectBlockCtl(weeks, chartRepeats),
		[weeks, chartRepeats],
	)
	const cycleWeeks = weeks.length
	const totalHours = Math.round(weeks.reduce((n, w) => n + w.hours, 0))
	const peakWeek = weeks.reduce(
		(a, b) => (b.hours > a.hours ? b : a),
		weeks[0]!,
	)

	const firstMonday = useMemo(() => {
		if (anchor === 'event') {
			const raceMonday = startOfTrainingWeek(eventDate)
			const m = new Date(raceMonday)
			m.setUTCDate(m.getUTCDate() - (cycleWeeks - 1) * 7)
			return m
		}
		const m = startOfTrainingWeek(new Date())
		m.setUTCDate(m.getUTCDate() + 7)
		return m
	}, [anchor, eventDate, cycleWeeks])

	function mondayOf(index: number): Date {
		const m = new Date(firstMonday)
		m.setUTCDate(m.getUTCDate() + index * 7)
		return m
	}

	function applyMacro(m: MacroTemplate) {
		setBlocks(instantiateMacro(m))
		setOverrides({})
		setAppliedMacro(m.id)
		setAnchor(m.anchored ? 'event' : 'ongoing')
		setSelectedBlock(null)
	}
	function patchBlock(id: string, patch: Partial<MesoBlock>) {
		setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)))
		setOverrides({})
		setAppliedMacro('')
	}
	function moveBlock(id: string, dir: -1 | 1) {
		setBlocks((bs) => {
			const i = bs.findIndex((b) => b.id === id)
			const j = i + dir
			if (i < 0 || j < 0 || j >= bs.length) return bs
			const next = [...bs]
			;[next[i], next[j]] = [next[j]!, next[i]!]
			return next
		})
		setOverrides({})
		setAppliedMacro('')
	}
	function removeBlock(id: string) {
		setBlocks((bs) => (bs.length > 1 ? bs.filter((b) => b.id !== id) : bs))
		setOverrides({})
		setAppliedMacro('')
	}
	// Drag the boundary between block i-1 and block i to `toWeek` (its new
	// start), redistributing weeks; the total (and the race day) never moves.
	function moveBoundary(blockIndex: number, toWeek: number) {
		if (blockIndex <= 0) return
		setBlocks((bs) => {
			const starts: number[] = []
			let acc = 0
			for (const b of bs) {
				starts.push(acc)
				acc += b.weeks
			}
			const prev = bs[blockIndex - 1]!
			const cur = bs[blockIndex]!
			const lo = starts[blockIndex - 1]! + 1
			const hi = starts[blockIndex]! + cur.weeks - 1
			const clamped = Math.max(lo, Math.min(hi, toWeek))
			const delta = clamped - starts[blockIndex]!
			if (delta === 0) return bs
			return bs.map((b, j) =>
				j === blockIndex - 1
					? { ...prev, weeks: prev.weeks + delta }
					: j === blockIndex
						? { ...cur, weeks: cur.weeks - delta }
						: b,
			)
		})
		setAppliedMacro('')
	}

	// ── Volume currency: the athlete picks the unit the plan speaks ─────────
	// Hours stay the stored primitive; km resolves through an easy-run-pace
	// planning assumption (≈6:00/km → 10 km/h — the real thing reads the
	// Discipline Profile), TSS through the per-focus TSS/h assumption.
	const displayOf = (hours: number, focus: BlockFocus): number => {
		if (currency === 'km') return Math.round(hours * KM_PER_HOUR)
		if (currency === 'tss')
			return Math.round(hours * FOCUS_META[focus].tssPerHour)
		return Math.round(hours * 10) / 10
	}
	const displayToHours = (value: number, focus: BlockFocus): number => {
		if (currency === 'km') return value / KM_PER_HOUR
		if (currency === 'tss') return value / FOCUS_META[focus].tssPerHour
		return value
	}
	const unit = currency === 'hours' ? 'h' : currency === 'km' ? 'km' : 'TSS'

	// ── Sculpt-chart geometry (chosen currency on the y axis) ───────────────
	const CW = 900
	const CH = 300
	const padL = 40
	const padR = 14
	const padT = 20
	const bandH = 10
	const padB = 48
	const plotBottom = CH - padB
	const plotH = plotBottom - padT
	const totalBars = cycleWeeks * chartRepeats
	const colW = (CW - padL - padR) / totalBars
	const minScale = currency === 'hours' ? 10 : currency === 'km' ? 100 : 550
	const maxScale =
		Math.max(minScale, ...weeks.map((w) => displayOf(w.hours, w.focus))) * 1.2
	const yOf = (display: number) => plotBottom - (display / maxScale) * plotH
	const xOf = (i: number) => padL + (i + 0.5) * colW
	const maxCtl = Math.max(...ctl) * 1.25
	const yCtl = (c: number) => plotBottom - (c / maxCtl) * plotH
	// ~5 nice round y ticks for whatever scale the currency produces
	const tickStep = niceStep(maxScale / 5)
	const ticks: number[] = []
	for (let t = tickStep; t < maxScale; t += tickStep) ticks.push(t)

	const svgRef = useRef<SVGSVGElement | null>(null)
	const dragWeek = useRef<number | null>(null)
	const dragBoundary = useRef<number | null>(null)

	function svgPoint(e: { clientX: number; clientY: number }) {
		const rect = svgRef.current?.getBoundingClientRect()
		if (!rect) return { x: 0, y: 0 }
		return {
			x: ((e.clientX - rect.left) / rect.width) * CW,
			y: ((e.clientY - rect.top) / rect.height) * CH,
		}
	}

	const points = weeks.map((w, i) => ({
		x: xOf(i),
		y: yOf(displayOf(w.hours, w.focus)),
	}))
	const areaPath =
		smoothPath(points) +
		` L ${points[points.length - 1]!.x},${plotBottom} L ${points[0]!.x},${plotBottom} Z`
	const ghostPoints =
		chartRepeats > 1
			? weeks.map((w, i) => ({
					x: xOf(cycleWeeks + i),
					y: yOf(displayOf(w.hours, w.focus)),
				}))
			: []
	const ghostArea = ghostPoints.length
		? smoothPath(ghostPoints) +
			` L ${ghostPoints[ghostPoints.length - 1]!.x},${plotBottom} L ${ghostPoints[0]!.x},${plotBottom} Z`
		: ''

	const blockStarts: number[] = []
	{
		let acc = 0
		for (const b of blocks) {
			blockStarts.push(acc)
			acc += b.weeks
		}
	}

	const applied = MACRO_TEMPLATES.find((m) => m.id === appliedMacro)

	return (
		<main className="mx-auto max-w-6xl px-4 py-6">
			{/* ── Header ─────────────────────────────────────────────────────── */}
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h1 className="text-xl font-bold">Block builder</h1>
					<p className="text-muted-foreground text-sm">
						{anchor === 'event' ? (
							<>
								{source.eventName} · {formatEventDate(source.eventDate)} ·{' '}
								{cycleWeeks} weeks, anchored backward from race day
							</>
						) : (
							<>
								Open-ended · {cycleWeeks}-week cycle starting{' '}
								{fmtRange(firstMonday).split(' – ')[0]} · repeats until you
								point it at an event
							</>
						)}
					</p>
				</div>
				<div className="flex items-center gap-4">
					<dl className="hidden gap-4 text-sm sm:flex">
						<div>
							<dt className="text-muted-foreground text-xs">Volume/cycle</dt>
							<dd className="font-bold tabular-nums">
								{Math.round(
									weeks.reduce((n, w) => n + displayOf(w.hours, w.focus), 0),
								)}{' '}
								{unit}
							</dd>
						</div>
						<div>
							<dt className="text-muted-foreground text-xs">Peak week</dt>
							<dd className="font-bold tabular-nums">
								{displayOf(peakWeek.hours, peakWeek.focus)} {unit}
							</dd>
						</div>
						<div>
							<dt className="text-muted-foreground text-xs">
								{anchor === 'event' ? 'Race-day CTL' : 'CTL after 2 cycles'}
							</dt>
							<dd className="font-bold tabular-nums">{ctl[ctl.length - 1]}</dd>
						</div>
					</dl>
					<div className="flex items-center gap-1 rounded-lg border p-1 text-xs font-semibold">
						<button
							type="button"
							onClick={() => setAnchor('event')}
							className={cn(
								'min-h-9 rounded-md px-3',
								anchor === 'event' && 'bg-foreground text-background',
							)}
						>
							🏁 Toward the race
						</button>
						<button
							type="button"
							onClick={() => setAnchor('ongoing')}
							className={cn(
								'min-h-9 rounded-md px-3',
								anchor === 'ongoing' && 'bg-foreground text-background',
							)}
						>
							↻ Ongoing
						</button>
					</div>
				</div>
			</div>

			{/* ── Template shelf: start from a common shape ──────────────────── */}
			<section className="mt-4 rounded-xl border p-4">
				<div className="flex flex-wrap items-baseline justify-between gap-2">
					<h2 className="text-sm font-bold">Start from a common shape</h2>
					<span className="text-muted-foreground text-xs">
						recognized periodization models — pick one, then make it yours
					</span>
				</div>
				<div className="mt-3 flex gap-2 overflow-x-auto pb-1">
					{MACRO_TEMPLATES.map((m) => (
						<button
							key={m.id}
							type="button"
							onClick={() => applyMacro(m)}
							className={cn(
								'w-40 shrink-0 rounded-lg border p-2.5 text-left',
								appliedMacro === m.id
									? 'border-emerald-600 bg-emerald-500/10 ring-1 ring-emerald-600'
									: 'hover:bg-muted/40',
							)}
						>
							<TemplatePreview template={m} />
							<div className="mt-1.5 truncate text-xs font-bold">{m.name}</div>
							<div className="text-muted-foreground truncate text-[10px]">
								{m.attribution}
							</div>
						</button>
					))}
				</div>
				<p className="text-muted-foreground mt-2 text-xs">
					{applied ? (
						<>
							Applied <strong>{applied.name}</strong> — blocks, recovery rhythm
							and weekly targets are now yours to edit; nothing stays linked to
							the template.
						</>
					) : (
						<>Edited by hand — no template applied.</>
					)}
				</p>
			</section>

			{/* ── Sculpt the season ──────────────────────────────────────────── */}
			<section className="mt-4 rounded-xl border p-4">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<h2 className="text-sm font-bold">Sculpt the season</h2>
					<div className="flex items-center gap-3">
						<span className="text-muted-foreground hidden text-xs md:inline">
							drag a point ↕ to set a week's target · drag a boundary ↔ to
							resize blocks
						</span>
						<div className="flex gap-0.5 rounded-lg border p-0.5 text-xs font-semibold">
							{(
								[
									['km', 'km'],
									['hours', 'hours'],
									['tss', 'TSS'],
								] as Array<[Currency, string]>
							).map(([c, label]) => (
								<button
									key={c}
									type="button"
									onClick={() => setCurrency(c)}
									className={cn(
										'min-h-8 rounded-md px-2.5',
										currency === c && 'bg-foreground text-background',
									)}
								>
									{label}
								</button>
							))}
						</div>
					</div>
				</div>
				<div className="mt-2 overflow-x-auto">
					<svg
						ref={svgRef}
						viewBox={`0 0 ${CW} ${CH}`}
						className="w-full min-w-[680px] touch-none select-none"
						onPointerMove={(e) => {
							if (dragWeek.current != null) {
								const { y } = svgPoint(e)
								const idx = dragWeek.current
								const focus = weeks[idx]?.focus ?? 'endurance'
								const display = Math.max(
									0,
									Math.min(maxScale, ((plotBottom - y) / plotH) * maxScale),
								)
								// Snap in display units, store canonically in hours.
								const snap = currency === 'hours' ? 0.5 : tickStep / 10
								const snapped = Math.round(display / snap) * snap
								const hours =
									Math.round(displayToHours(snapped, focus) * 10) / 10
								setOverrides((o) => ({ ...o, [idx]: hours }))
							} else if (dragBoundary.current != null) {
								const { x } = svgPoint(e)
								moveBoundary(
									dragBoundary.current,
									Math.round((x - padL) / colW),
								)
							}
						}}
						onPointerUp={() => {
							dragWeek.current = null
							dragBoundary.current = null
						}}
						onPointerLeave={() => {
							dragWeek.current = null
							dragBoundary.current = null
						}}
					>
						{/* y gridlines in the chosen currency */}
						{ticks.map((t) => (
							<g key={t}>
								<line
									x1={padL}
									x2={CW - padR}
									y1={yOf(t)}
									y2={yOf(t)}
									stroke="currentColor"
									opacity={0.07}
								/>
								<text
									x={padL - 4}
									y={yOf(t) + 3}
									textAnchor="end"
									fontSize={9}
									fill="currentColor"
									opacity={0.5}
								>
									{t}
									{currency === 'hours' ? 'h' : ''}
								</text>
							</g>
						))}
						{/* the sculpted load curve */}
						<path d={areaPath} fill="#34d399" opacity={0.18} stroke="none" />
						<path
							d={smoothPath(points)}
							fill="none"
							stroke="#10b981"
							strokeWidth={2}
							opacity={0.8}
						/>
						{/* ghosted next cycle for ongoing plans */}
						{chartRepeats > 1 && (
							<>
								<path d={ghostArea} fill="#34d399" opacity={0.08} />
								<path
									d={smoothPath(ghostPoints)}
									fill="none"
									stroke="#10b981"
									strokeWidth={1.5}
									opacity={0.3}
									strokeDasharray="4 3"
								/>
								<line
									x1={padL + cycleWeeks * colW}
									x2={padL + cycleWeeks * colW}
									y1={padT}
									y2={plotBottom}
									stroke="currentColor"
									strokeDasharray="3 3"
									opacity={0.35}
								/>
								<text
									x={padL + cycleWeeks * colW + 4}
									y={padT + 8}
									fontSize={9}
									fill="currentColor"
									opacity={0.6}
								>
									↻ cycle repeats
								</text>
							</>
						)}
						{/* CTL projection */}
						<polyline
							points={ctl.map((c, i) => `${xOf(i)},${yCtl(c)}`).join(' ')}
							fill="none"
							stroke="currentColor"
							strokeWidth={1.5}
							strokeDasharray="5 3"
							opacity={0.5}
						/>
						<text
							x={xOf(ctl.length - 1)}
							y={yCtl(ctl[ctl.length - 1]!) - 8}
							textAnchor="end"
							fontSize={9}
							fill="currentColor"
							opacity={0.6}
						>
							CTL {ctl[ctl.length - 1]}
						</text>
						{/* race marker */}
						{anchor === 'event' && (
							<g>
								<line
									x1={xOf(cycleWeeks - 1) + colW / 2}
									x2={xOf(cycleWeeks - 1) + colW / 2}
									y1={padT}
									y2={plotBottom}
									stroke="#f43f5e"
									strokeWidth={1.5}
								/>
								<text
									x={xOf(cycleWeeks - 1) + colW / 2 - 4}
									y={padT + 8}
									textAnchor="end"
									fontSize={9}
									fontWeight={700}
									fill="#f43f5e"
								>
									🏁 {formatEventDate(source.eventDate)}
								</text>
							</g>
						)}
						{/* draggable week points, colored by block focus */}
						{weeks.map((w, i) => (
							<g
								key={w.index}
								className="cursor-ns-resize"
								onPointerDown={(e) => {
									dragWeek.current = w.index
									;(e.target as Element).setPointerCapture?.(e.pointerId)
								}}
							>
								{/* generous invisible hit area for touch */}
								<circle
									cx={xOf(i)}
									cy={yOf(displayOf(w.hours, w.focus))}
									r={14}
									fill="transparent"
								/>
								<circle
									cx={xOf(i)}
									cy={yOf(displayOf(w.hours, w.focus))}
									r={w.isEasy ? 3.5 : 5}
									fill={w.isEasy ? 'white' : FOCUS_META[w.focus].hex}
									stroke={FOCUS_META[w.focus].hex}
									strokeWidth={2}
								/>
								{w.overridden && (
									<circle
										cx={xOf(i)}
										cy={yOf(displayOf(w.hours, w.focus))}
										r={8}
										fill="none"
										stroke={FOCUS_META[w.focus].hex}
										strokeWidth={1}
										opacity={0.5}
									/>
								)}
								<title>
									Week {i + 1} · {w.blockName} · {displayOf(w.hours, w.focus)}{' '}
									{unit} ({w.hours} h · {Math.round(w.hours * KM_PER_HOUR)} km ·{' '}
									{w.tss} TSS)
									{w.isEasy ? ' · easy week' : ''} — drag to change
								</title>
							</g>
						))}
						{/* block band + draggable boundaries */}
						{Array.from({ length: chartRepeats }).flatMap((_, rep) =>
							blocks.map((b, bi) => (
								<rect
									key={`${rep}-${b.id}`}
									x={padL + (rep * cycleWeeks + blockStarts[bi]!) * colW}
									y={plotBottom + 10}
									width={b.weeks * colW}
									height={bandH}
									rx={2}
									fill={FOCUS_META[b.focus].hex}
									opacity={rep > 0 ? 0.35 : 0.9}
								>
									<title>
										{b.name} · {b.weeks} wk · {RHYTHM_LABEL[b.rhythm]}
									</title>
								</rect>
							)),
						)}
						{blocks.slice(1).map((b, i) => {
							const x = padL + blockStarts[i + 1]! * colW
							return (
								<g
									key={b.id}
									className="cursor-ew-resize"
									onPointerDown={(e) => {
										dragBoundary.current = i + 1
										;(e.target as Element).setPointerCapture?.(e.pointerId)
									}}
								>
									<rect
										x={x - 10}
										y={plotBottom + 2}
										width={20}
										height={bandH + 16}
										fill="transparent"
									/>
									<circle
										cx={x}
										cy={plotBottom + 10 + bandH / 2}
										r={6}
										fill="white"
										stroke="currentColor"
										strokeWidth={1.5}
									/>
									<text
										x={x}
										y={plotBottom + 10 + bandH / 2 + 3}
										textAnchor="middle"
										fontSize={7}
										fill="currentColor"
									>
										↔
									</text>
								</g>
							)
						})}
						{/* week numbers */}
						{weeks.map((w, i) => (
							<text
								key={w.index}
								x={xOf(i)}
								y={CH - 6}
								textAnchor="middle"
								fontSize={8.5}
								fill="currentColor"
								opacity={0.55}
							>
								{i + 1}
							</text>
						))}
					</svg>
				</div>
				<div className="text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
					{(Object.keys(FOCUS_META) as BlockFocus[])
						.filter((f) => blocks.some((b) => b.focus === f))
						.map((f) => (
							<span key={f} className="flex items-center gap-1">
								<span
									className="size-2 rounded-sm"
									style={{ background: FOCUS_META[f].hex }}
								/>
								{FOCUS_META[f].label}
							</span>
						))}
					<span>○ hollow point = easy week (−30%)</span>
					<span>◎ ringed = hand-edited</span>
					<span>┄ projected fitness (CTL), display only</span>
				</div>
			</section>

			{/* ── The blocks (mesos) as a horizontal strip ───────────────────── */}
			<section className="mt-4 rounded-xl border p-4">
				<h2 className="text-sm font-bold">Blocks (mesos)</h2>
				<div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
					{blocks.map((b) => (
						<button
							key={b.id}
							type="button"
							onClick={() =>
								setSelectedBlock((s) => (s === b.id ? null : b.id))
							}
							className={cn(
								'min-w-32 shrink-0 rounded-lg border-2 p-2 text-left',
								selectedBlock === b.id
									? 'border-foreground'
									: 'border-transparent',
							)}
							style={{ background: `${FOCUS_META[b.focus].hex}22` }}
						>
							<div
								className="text-xs font-bold"
								style={{ color: FOCUS_META[b.focus].hex }}
							>
								{b.name}
							</div>
							<div className="text-muted-foreground text-[11px] tabular-nums">
								{b.weeks} wk · {displayOf(b.hours, b.focus)} {unit}/wk
							</div>
							<div className="text-muted-foreground text-[11px]">
								{RHYTHM_LABEL[b.rhythm]}
							</div>
						</button>
					))}
					{anchor === 'ongoing' && (
						<div className="text-muted-foreground grid min-w-14 shrink-0 place-items-center text-2xl">
							↻
						</div>
					)}
					{anchor === 'event' && (
						<div className="grid min-w-14 shrink-0 place-items-center text-2xl">
							🏁
						</div>
					)}
				</div>

				{selectedBlock &&
					(() => {
						const b = blocks.find((x) => x.id === selectedBlock)
						if (!b) return null
						const meta = FOCUS_META[b.focus]
						return (
							<div className="mt-2 rounded-lg border p-3 text-sm">
								<div className="flex flex-wrap items-center gap-3">
									<span
										className="rounded-full px-2.5 py-1 text-xs font-bold text-white"
										style={{ background: meta.hex }}
									>
										{b.name}
									</span>
									<label className="flex items-center gap-2 text-xs">
										Weeks
										<span className="flex items-center gap-1">
											<button
												type="button"
												onClick={() =>
													patchBlock(b.id, {
														weeks: Math.max(1, b.weeks - 1),
													})
												}
												className="bg-muted grid size-8 place-items-center rounded-md font-bold"
												aria-label="Fewer weeks"
											>
												−
											</button>
											<span className="w-8 text-center font-semibold tabular-nums">
												{b.weeks}
											</span>
											<button
												type="button"
												onClick={() => patchBlock(b.id, { weeks: b.weeks + 1 })}
												className="bg-muted grid size-8 place-items-center rounded-md font-bold"
												aria-label="More weeks"
											>
												＋
											</button>
										</span>
									</label>
									<label className="flex min-w-40 flex-1 items-center gap-2 text-xs">
										<span className="whitespace-nowrap">
											{displayOf(b.hours, b.focus)} {unit}/wk
											{currency !== 'hours' && (
												<span className="text-muted-foreground">
													{' '}
													({b.hours} h)
												</span>
											)}
										</span>
										<input
											type="range"
											min={2}
											max={14}
											step={0.5}
											value={b.hours}
											onChange={(e) =>
												patchBlock(b.id, { hours: Number(e.target.value) })
											}
											className="flex-1"
										/>
									</label>
									<div className="flex gap-1 rounded-lg border p-0.5 text-xs font-semibold">
										{(['3:1', '2:1', 'none'] as BlockRhythm[]).map((r) => (
											<button
												key={r}
												type="button"
												onClick={() => patchBlock(b.id, { rhythm: r })}
												className={cn(
													'min-h-8 rounded-md px-2',
													b.rhythm === r && 'bg-foreground text-background',
												)}
											>
												{RHYTHM_LABEL[r]}
											</button>
										))}
									</div>
									<span className="flex gap-1">
										<RailIcon
											label="Move left"
											onClick={() => moveBlock(b.id, -1)}
										>
											←
										</RailIcon>
										<RailIcon
											label="Move right"
											onClick={() => moveBlock(b.id, 1)}
										>
											→
										</RailIcon>
										<RailIcon
											label="Remove block"
											onClick={() => removeBlock(b.id)}
										>
											✕
										</RailIcon>
									</span>
								</div>
								<p className="text-muted-foreground mt-2 text-xs">
									{meta.note}
								</p>
								<div className="mt-2 flex flex-wrap gap-1">
									{(Object.keys(FOCUS_META) as BlockFocus[]).map((f) => (
										<button
											key={f}
											type="button"
											onClick={() =>
												patchBlock(b.id, {
													focus: f,
													name: FOCUS_META[f].label,
												})
											}
											className={cn(
												'min-h-8 rounded-full border px-2 text-[11px] font-semibold',
												b.focus === f && 'text-white',
											)}
											style={
												b.focus === f
													? {
															background: FOCUS_META[f].hex,
															borderColor: FOCUS_META[f].hex,
														}
													: undefined
											}
										>
											{FOCUS_META[f].label}
										</button>
									))}
								</div>
							</div>
						)
					})()}

				<div className="mt-2 flex flex-wrap gap-1">
					<span className="text-muted-foreground mr-1 self-center text-xs font-semibold">
						Add a block:
					</span>
					{MESO_TEMPLATES.map((t) => (
						<button
							key={t.name}
							type="button"
							onClick={() => {
								setBlocks((bs) => [...bs, instantiate(t)])
								setOverrides({})
								setAppliedMacro('')
							}}
							className="hover:bg-muted min-h-9 rounded-full border px-2.5 text-xs font-semibold"
						>
							<span
								className="mr-1 inline-block size-2 rounded-sm"
								style={{ background: FOCUS_META[t.focus].hex }}
							/>
							＋ {t.name}
						</button>
					))}
				</div>
			</section>

			{/* ── Week table — one cycle ─────────────────────────────────────── */}
			<div className="mt-4 overflow-x-auto rounded-xl border">
				<table className="w-full min-w-[620px] text-sm">
					<thead>
						<tr className="text-muted-foreground border-b text-left text-xs uppercase">
							<th className="px-3 py-2 font-semibold">Wk</th>
							<th className="px-3 py-2 font-semibold">Training Week</th>
							<th className="px-3 py-2 font-semibold">Block</th>
							<th className="px-3 py-2 font-semibold">Type</th>
							<th className="px-3 py-2 text-right font-semibold">
								Target ({unit})
							</th>
							<th className="px-3 py-2 text-right font-semibold">
								{currency === 'hours' ? '≈ km' : '≈ h'}
							</th>
							<th className="px-3 py-2 text-right font-semibold">
								{currency === 'tss' ? '≈ km' : '≈ TSS'}
							</th>
							<th className="px-3 py-2 text-right font-semibold">CTL</th>
						</tr>
					</thead>
					<tbody>
						{weeks.map((w, i) => (
							<tr
								key={w.index}
								className={cn('border-b', w.isEasy && 'bg-muted/40')}
							>
								<td className="px-3 py-2 tabular-nums">{i + 1}</td>
								<td className="px-3 py-2 whitespace-nowrap tabular-nums">
									{fmtRange(mondayOf(i))}
								</td>
								<td className="px-3 py-2">
									<span className="flex items-center gap-1.5">
										<span
											className="size-2 rounded-sm"
											style={{ background: FOCUS_META[w.focus].hex }}
										/>
										{w.blockName}
									</span>
								</td>
								<td className="px-3 py-2">
									{w.focus === 'taper'
										? 'Taper'
										: w.isEasy
											? 'Easy (−30%)'
											: 'Loading'}
									{w.focus === 'strength' && !w.isEasy && (
										<span
											className="text-muted-foreground ml-1 text-xs"
											title="Strength sessions carry no TSS — the target covers endurance hours only"
										>
											🏋️ no-TSS strength on top
										</span>
									)}
								</td>
								<td className="px-3 py-1.5 text-right">
									<input
										type="number"
										step={
											currency === 'hours' ? 0.5 : currency === 'km' ? 1 : 10
										}
										min={0}
										value={displayOf(w.hours, w.focus)}
										onChange={(e) => {
											const v = Number(e.target.value)
											setOverrides((o) =>
												Number.isFinite(v)
													? {
															...o,
															[w.index]:
																Math.round(displayToHours(v, w.focus) * 10) /
																10,
														}
													: o,
											)
										}}
										className={cn(
											'bg-background w-20 rounded-md border px-2 py-1 text-right font-semibold tabular-nums',
											w.overridden && 'border-foreground',
										)}
										aria-label={`Week ${i + 1} target`}
									/>
								</td>
								<td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
									{currency === 'hours'
										? Math.round(w.hours * KM_PER_HOUR)
										: w.hours}
								</td>
								<td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
									{currency === 'tss'
										? Math.round(w.hours * KM_PER_HOUR)
										: w.tss}
								</td>
								<td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
									{ctl[i]}
								</td>
							</tr>
						))}
						{anchor === 'event' ? (
							<tr className="bg-rose-500/10 font-semibold">
								<td className="px-3 py-2">🏁</td>
								<td className="px-3 py-2" colSpan={7}>
									{source.eventName} — {formatEventDate(source.eventDate)}
								</td>
							</tr>
						) : (
							<tr className="bg-muted/40 font-semibold">
								<td className="px-3 py-2">↻</td>
								<td className="px-3 py-2" colSpan={7}>
									Cycle repeats — week {cycleWeeks + 1} starts the next round of
									"{blocks[0]?.name}". Extend or retire it any time.
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>

			<div className="mt-3 flex items-center justify-between gap-3">
				<p className="text-muted-foreground text-xs">
					{cycleWeeks} weeks · {totalHours} h per cycle · km resolves via easy
					run pace ≈ 6:00/km and TSS via per-focus TSS/h — planning assumptions;
					the real thing reads the Discipline Profile
				</p>
				<button
					type="button"
					disabled
					className="bg-foreground text-background rounded-lg px-5 py-2.5 text-sm font-bold opacity-60"
					title="Prototype — writing the Plan Outline is not wired"
				>
					Save Plan Outline (prototype — not wired)
				</button>
			</div>
		</main>
	)
}

/** Mini smooth-area preview of a macro template, points colored by block. */
function TemplatePreview({ template }: { template: MacroTemplate }) {
	const weeks = useMemo(
		() => deriveBlockWeeks(template.blocks.map(instantiate)),
		[template],
	)
	const W = 140
	const H = 44
	const max = Math.max(...weeks.map((w) => w.hours), 1) * 1.15
	const pts = weeks.map((w, i) => ({
		x: 4 + ((W - 8) / Math.max(weeks.length - 1, 1)) * i,
		y: H - 6 - (w.hours / max) * (H - 14),
	}))
	const area =
		smoothPath(pts) +
		` L ${pts[pts.length - 1]!.x},${H - 4} L ${pts[0]!.x},${H - 4} Z`
	return (
		<svg viewBox={`0 0 ${W} ${H}`} className="w-full">
			<path d={area} fill="#34d399" opacity={0.25} />
			<path
				d={smoothPath(pts)}
				fill="none"
				stroke="#10b981"
				strokeWidth={1.5}
			/>
			{pts.map((p, i) => (
				<circle
					key={i}
					cx={p.x}
					cy={p.y}
					r={weeks[i]!.isEasy ? 1.3 : 2}
					fill={FOCUS_META[weeks[i]!.focus].hex}
				/>
			))}
		</svg>
	)
}

function RailIcon({
	children,
	label,
	onClick,
}: {
	children: React.ReactNode
	label: string
	onClick: () => void
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-label={label}
			title={label}
			className="bg-muted hover:bg-muted/70 grid size-8 place-items-center rounded-md text-xs font-bold"
		>
			{children}
		</button>
	)
}
