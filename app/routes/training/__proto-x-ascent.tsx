import { useMemo, useRef, useState } from 'react'
import { cn } from '#app/utils/misc.tsx'
import {
	FALLBACK_PLAN,
	PHASE_COLORS,
	deriveWeeks,
	formatEventDate,
	projectCtl,
	toProtoPhases,
	type ProtoPhase,
	type ProtoPlanInput,
	type Rhythm,
} from './__proto-x-model.ts'

// PROTOTYPE variant B — "Ascent". The plan is an expedition map: the load
// terrain rises and falls under your feet (recovery weeks are rest ledges,
// the taper is the final light-pack push), while the fitness projection is
// the climbing line that tops out at the summit — the Target Event. Phases
// are camps; drag a camp flag along the trail to resize the phases around
// it, tap a camp to provision it (weekly load, duration).

const CAMP_NAMES: Record<string, string> = {
	base: 'Base Camp',
	build: 'Camp 1',
	peak: 'High Camp',
	taper: 'Summit Push',
}

const PHASE_HEX: Record<string, string> = {
	base: '#0ea5e9',
	build: '#f59e0b',
	peak: '#f43f5e',
	taper: '#8b5cf6',
}

export function AscentVariant({ plan }: { plan: ProtoPlanInput }) {
	const source = plan ?? FALLBACK_PLAN
	const [phases, setPhases] = useState<ProtoPhase[]>(() =>
		toProtoPhases(source.phases),
	)
	const [rhythm, setRhythm] = useState<Rhythm>('3:1')
	const [selectedCamp, setSelectedCamp] = useState<number | null>(0)
	const dragging = useRef<number | null>(null)
	const svgRef = useRef<SVGSVGElement | null>(null)

	const weeks = useMemo(() => deriveWeeks(phases, rhythm), [phases, rhythm])
	const ctl = useMemo(() => projectCtl(weeks), [weeks])

	const W = 720
	const H = 300
	const padL = 24
	const padR = 56
	const groundY = H - 46
	const colW = (W - padL - padR) / weeks.length
	const maxHours = Math.max(10, ...weeks.map((w) => w.hours))
	const maxCtl = Math.max(...ctl) * 1.1

	const terrainPoints = weeks.map((w, i) => ({
		x: padL + (i + 0.5) * colW,
		y: groundY - (w.hours / maxHours) * 150,
	}))
	const terrainPath =
		`M ${padL},${groundY} ` +
		terrainPoints.map((p) => `L ${p.x},${p.y}`).join(' ') +
		` L ${W - padR},${groundY} Z`
	const ctlPoints = ctl.map((v, i) => ({
		x: padL + (i + 0.5) * colW,
		y: groundY - (v / maxCtl) * 210,
	}))
	const summit = ctlPoints[ctlPoints.length - 1]!

	// Camp flag positions: at the start of each phase.
	const phaseStarts: number[] = []
	{
		let acc = 0
		for (const p of phases) {
			phaseStarts.push(acc)
			acc += p.weeks
		}
	}

	function weekAtClientX(clientX: number): number {
		const rect = svgRef.current?.getBoundingClientRect()
		if (!rect) return 0
		const x = ((clientX - rect.left) / rect.width) * W
		return Math.round((x - padL) / colW)
	}

	// Dragging camp i moves the boundary between phase i-1 and phase i,
	// redistributing weeks between them (the summit date never moves — the
	// plan is anchored backward from the event).
	function moveCamp(campIndex: number, toWeek: number) {
		if (campIndex <= 0) return
		setPhases((ps) => {
			const starts: number[] = []
			let acc = 0
			for (const p of ps) {
				starts.push(acc)
				acc += p.weeks
			}
			const prev = ps[campIndex - 1]!
			const cur = ps[campIndex]!
			const lo = starts[campIndex - 1]! + 1
			const hi = starts[campIndex]! + cur.weeks - 1
			const clamped = Math.max(lo, Math.min(hi, toWeek))
			const delta = clamped - starts[campIndex]!
			if (delta === 0) return ps
			return ps.map((p, j) =>
				j === campIndex - 1
					? { ...prev, weeks: prev.weeks + delta }
					: j === campIndex
						? { ...cur, weeks: cur.weeks - delta }
						: p,
			)
		})
	}

	const camp = selectedCamp != null ? phases[selectedCamp] : null

	return (
		<main className="mx-auto max-w-3xl px-4 py-6">
			<div className="flex flex-wrap items-end justify-between gap-2">
				<div>
					<h1 className="text-lg font-bold">
						The ascent to {source.eventName}
					</h1>
					<p className="text-muted-foreground text-sm">
						Summit day {formatEventDate(source.eventDate)} · {weeks.length}-week
						expedition, planned backward from the top
					</p>
				</div>
				<div className="flex items-center gap-1 rounded-lg border p-1 text-xs font-semibold">
					{(['3:1', '2:1'] as const).map((r) => (
						<button
							key={r}
							type="button"
							onClick={() => setRhythm(r)}
							className={cn(
								'rounded-md px-2 py-1',
								rhythm === r ? 'bg-foreground text-background' : '',
							)}
						>
							rest ledge every {r === '3:1' ? '4th' : '3rd'} week
						</button>
					))}
				</div>
			</div>

			{/* The map */}
			<div className="mt-4 overflow-hidden rounded-2xl border bg-gradient-to-b from-sky-950 via-sky-900 to-emerald-950">
				<svg
					ref={svgRef}
					viewBox={`0 0 ${W} ${H}`}
					className="w-full touch-none select-none"
					onPointerMove={(e) => {
						if (dragging.current != null) {
							moveCamp(dragging.current, weekAtClientX(e.clientX))
						}
					}}
					onPointerUp={() => (dragging.current = null)}
					onPointerLeave={() => (dragging.current = null)}
				>
					{/* stars */}
					{[...Array(24)].map((_, i) => (
						<circle
							key={i}
							cx={(i * 137) % W}
							cy={((i * 61) % 90) + 8}
							r={i % 3 === 0 ? 1.4 : 0.8}
							fill="#fff"
							opacity={0.5}
						/>
					))}
					{/* load terrain, colored per phase */}
					<path d={terrainPath} fill="#134e4a" opacity={0.9} />
					{weeks.map((w, i) => {
						const p = terrainPoints[i]!
						return (
							<rect
								key={w.index}
								x={padL + i * colW + 1}
								y={p.y}
								width={colW - 2}
								height={groundY - p.y}
								fill={PHASE_HEX[w.phaseKind]}
								opacity={w.isRecovery ? 0.25 : 0.55}
							>
								<title>
									Week {i + 1} · {w.hours} h ≈ {w.tss} TSS
									{w.isRecovery ? ' · rest ledge (−30%)' : ''}
								</title>
							</rect>
						)
					})}
					{/* rest-ledge markers */}
					{weeks.map((w, i) =>
						w.isRecovery ? (
							<text
								key={w.index}
								x={padL + (i + 0.5) * colW}
								y={terrainPoints[i]!.y - 6}
								textAnchor="middle"
								fontSize={9}
								fill="#a7f3d0"
							>
								⛺
							</text>
						) : null,
					)}
					{/* fitness climbing line */}
					<polyline
						points={ctlPoints.map((p) => `${p.x},${p.y}`).join(' ')}
						fill="none"
						stroke="#fbbf24"
						strokeWidth={2.5}
						strokeDasharray="1 0"
						strokeLinejoin="round"
					/>
					{ctlPoints
						.filter((_, i) => i % 2 === 0)
						.map((p, i) => (
							<circle key={i} cx={p.x} cy={p.y} r={2.2} fill="#fbbf24" />
						))}
					{/* the summit — the Target Event */}
					<g>
						<line
							x1={summit.x}
							y1={summit.y}
							x2={summit.x}
							y2={summit.y - 34}
							stroke="#fff"
							strokeWidth={2}
						/>
						<path
							d={`M ${summit.x},${summit.y - 34} l 22,7 l -22,7 z`}
							fill="#f43f5e"
						/>
						<text
							x={summit.x - 6}
							y={summit.y - 40}
							textAnchor="end"
							fontSize={11}
							fontWeight={700}
							fill="#fff"
						>
							SUMMIT · CTL {ctl[ctl.length - 1]}
						</text>
					</g>
					{/* camp flags at phase starts */}
					{phases.map((p, i) => {
						const x = padL + (phaseStarts[i]! + 0.02) * colW + colW * 0.48
						const startWeek = phaseStarts[i]!
						const y = terrainPoints[startWeek]!.y
						return (
							<g
								key={p.id}
								className="cursor-grab"
								onPointerDown={(e) => {
									if (i > 0) {
										dragging.current = i
										;(e.target as Element).setPointerCapture?.(e.pointerId)
									}
									setSelectedCamp(i)
								}}
							>
								<line
									x1={x}
									y1={groundY + 18}
									x2={x}
									y2={y - 26}
									stroke={PHASE_HEX[p.kind]}
									strokeWidth={selectedCamp === i ? 3 : 1.5}
									strokeDasharray="4 3"
								/>
								<circle
									cx={x}
									cy={y - 30}
									r={11}
									fill={PHASE_HEX[p.kind]}
									stroke="#fff"
									strokeWidth={selectedCamp === i ? 2.5 : 1}
								/>
								<text
									x={x}
									y={y - 26}
									textAnchor="middle"
									fontSize={11}
									fill="#fff"
								>
									⚑
								</text>
								<text
									x={x}
									y={groundY + 32}
									textAnchor="middle"
									fontSize={10}
									fontWeight={700}
									fill="#fff"
								>
									{CAMP_NAMES[p.kind] ?? p.name}
								</text>
							</g>
						)
					})}
					{/* week ticks */}
					{weeks.map((w, i) => (
						<text
							key={w.index}
							x={padL + (i + 0.5) * colW}
							y={H - 6}
							textAnchor="middle"
							fontSize={8}
							fill="#94a3b8"
						>
							{i + 1}
						</text>
					))}
				</svg>
			</div>
			<p className="text-muted-foreground mt-2 text-xs">
				Terrain = weekly load (drops through Summit Push — a volume-only taper).
				The gold rope = projected fitness (CTL), topping out on summit day. ⛺ =
				planned rest ledge. Drag a camp flag to move a phase boundary — the
				summit never moves.
			</p>

			{/* Camp provisioning card */}
			{camp && (
				<div className="mt-4 rounded-2xl border p-4">
					<div className="flex flex-wrap items-center gap-3">
						<span
							className={cn(
								'rounded-full px-3 py-1 text-sm font-bold text-white',
								PHASE_COLORS[camp.kind].solid,
							)}
						>
							⚑ {CAMP_NAMES[camp.kind] ?? camp.name}
						</span>
						<span className="text-muted-foreground text-sm">
							{camp.name} phase · week {phaseStarts[selectedCamp!]! + 1}–
							{phaseStarts[selectedCamp!]! + camp.weeks}
						</span>
					</div>
					<div className="mt-3 grid gap-4 sm:grid-cols-2">
						<label className="block text-sm">
							<span className="font-semibold">
								Provisions: {camp.weeklyLoadHours} h/week ≈{' '}
								{Math.round(camp.weeklyLoadHours * 60)} TSS
							</span>
							<input
								type="range"
								min={0}
								max={14}
								step={0.5}
								value={camp.weeklyLoadHours}
								onChange={(e) =>
									setPhases((ps) =>
										ps.map((p, j) =>
											j === selectedCamp
												? { ...p, weeklyLoadHours: Number(e.target.value) }
												: p,
										),
									)
								}
								className="mt-1 w-full"
							/>
						</label>
						<div className="text-muted-foreground text-xs">
							{camp.kind === 'taper' ? (
								<>
									The Summit Push holds intensity and sheds volume — the map
									draws the descent for you. Strength sessions carry no TSS and
									never count toward these targets.
								</>
							) : (
								<>
									Longer stays at {CAMP_NAMES[camp.kind]} build more before the
									next camp. Rest ledges are cut −30% automatically per the
									chosen rhythm.
								</>
							)}
						</div>
					</div>
				</div>
			)}
		</main>
	)
}
