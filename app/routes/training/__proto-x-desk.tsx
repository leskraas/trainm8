import { useMemo, useState } from 'react'
import { cn } from '#app/utils/misc.tsx'
import {
	DAY_LABELS,
	DISCIPLINE_GLYPH,
	FALLBACK_PLAN,
	SEED_PATTERNS,
	TSS_PER_HOUR,
	formatEventDate,
	toProtoPhases,
	type ProtoPhase,
	type ProtoPlanInput,
} from './__proto-x-model.ts'

// PROTOTYPE variant C — "Desk". A paper season planner: week cards stacked
// down the desk toward race day, phases separated by washi tape you can
// nudge, and a tray of rubber stamps and stickers. Unlike the other
// variants, the loading/recovery rhythm here is *manual and tactile* — you
// place REST stickers yourself, and the margin scribbles warn you when
// you've gone too long without one.

const TAPE_COLORS: Record<string, string> = {
	base: 'bg-sky-300/80',
	build: 'bg-amber-300/80',
	peak: 'bg-rose-300/80',
	taper: 'bg-violet-300/80',
}

type Tool = { kind: 'rest' } | { kind: 'stamp'; patternId: string } | null

export function DeskVariant({ plan }: { plan: ProtoPlanInput }) {
	const source = plan ?? FALLBACK_PLAN
	const [phases, setPhases] = useState<ProtoPhase[]>(() =>
		toProtoPhases(source.phases),
	)
	const [rest, setRest] = useState<Set<number>>(
		// Start with a sensible 3:1 suggestion already stickered on.
		() => new Set([3, 7]),
	)
	const [stamps, setStamps] = useState<Record<number, string>>({})
	const [hoursOverride, setHoursOverride] = useState<Record<number, number>>({})
	const [tool, setTool] = useState<Tool>(null)

	const weeks = useMemo(() => {
		const out: Array<{
			index: number
			phaseIndex: number
			phase: ProtoPhase
			raceMinus: number
		}> = []
		let index = 0
		phases.forEach((phase, phaseIndex) => {
			for (let w = 0; w < phase.weeks; w++) {
				out.push({ index, phaseIndex, phase, raceMinus: 0 })
				index++
			}
		})
		out.forEach((w) => (w.raceMinus = out.length - 1 - w.index))
		return out
	}, [phases])

	function effectiveHours(w: (typeof weeks)[number]): number {
		const base = hoursOverride[w.index] ?? w.phase.weeklyLoadHours
		const rested = rest.has(w.index) && hoursOverride[w.index] == null
		const taperFactor =
			w.phase.kind === 'taper'
				? 1 - 0.45 * ((weekInPhase(w) + 1) / w.phase.weeks)
				: 1
		return Math.round(base * (rested ? 0.7 : 1) * taperFactor * 10) / 10
	}
	function weekInPhase(w: (typeof weeks)[number]): number {
		return w.index - weeks.findIndex((x) => x.phaseIndex === w.phaseIndex)
	}
	// Longest run of loading weeks before this one (for the margin scribble).
	function weeksSinceRest(index: number): number {
		let n = 0
		for (let i = index; i >= 0 && !rest.has(i); i--) n++
		return n
	}

	function applyTool(weekIndex: number) {
		if (!tool) return
		if (tool.kind === 'rest') {
			setRest((r) => {
				const next = new Set(r)
				if (next.has(weekIndex)) next.delete(weekIndex)
				else next.add(weekIndex)
				return next
			})
		} else {
			setStamps((s) =>
				s[weekIndex] === tool.patternId
					? Object.fromEntries(
							Object.entries(s).filter(([k]) => Number(k) !== weekIndex),
						)
					: { ...s, [weekIndex]: tool.patternId },
			)
		}
	}

	function nudgeTape(phaseIndex: number, delta: 1 | -1) {
		setPhases((ps) => {
			const prev = ps[phaseIndex - 1]
			const cur = ps[phaseIndex]
			if (!prev || !cur) return ps
			if (prev.weeks + delta < 1 || cur.weeks - delta < 1) return ps
			return ps.map((p, j) =>
				j === phaseIndex - 1
					? { ...p, weeks: p.weeks + delta }
					: j === phaseIndex
						? { ...p, weeks: p.weeks - delta }
						: p,
			)
		})
	}

	return (
		<main className="min-h-screen bg-amber-50 pb-40 dark:bg-stone-900">
			<div className="mx-auto max-w-xl px-4 py-6 font-serif">
				{/* The race bib pinned to the desk — what you're building toward */}
				<div className="relative mx-auto w-fit rotate-[-1.5deg] rounded-sm border-2 border-stone-300 bg-white px-6 py-3 text-center shadow-md dark:border-stone-600 dark:bg-stone-800">
					<div className="absolute -top-2 left-1/2 size-4 -translate-x-1/2 rounded-full bg-rose-400 shadow-sm" />
					<div className="text-[10px] tracking-[0.3em] text-stone-400 uppercase">
						building toward
					</div>
					<div className="text-xl font-black tracking-wide text-stone-800 dark:text-stone-100">
						{source.eventName}
					</div>
					<div className="text-sm text-stone-500">
						{formatEventDate(source.eventDate)} · bib nº 366
					</div>
				</div>

				{/* The stack of week pages, race at the bottom */}
				<div className="mt-8 space-y-1">
					{weeks.map((w, i) => {
						const isFirstOfPhase =
							i === 0 || weeks[i - 1]!.phaseIndex !== w.phaseIndex
						const hours = effectiveHours(w)
						const rested = rest.has(w.index)
						const dry = !rested && weeksSinceRest(w.index) >= 4
						const stamp = stamps[w.index]
							? SEED_PATTERNS.find((p) => p.id === stamps[w.index])
							: null
						return (
							<div key={w.index}>
								{isFirstOfPhase && (
									<div className="relative my-3 flex items-center justify-center">
										<div
											className={cn(
												'rotate-[0.8deg] px-8 py-1 text-sm font-bold tracking-widest text-stone-700 uppercase shadow-sm',
												TAPE_COLORS[w.phase.kind],
											)}
											style={{
												clipPath: 'polygon(2% 0, 98% 6%, 100% 94%, 0 100%)',
											}}
										>
											{w.phase.name} — {w.phase.weeks} wk ·{' '}
											{w.phase.weeklyLoadHours} h/wk
										</div>
										{w.phaseIndex > 0 && (
											<div className="absolute right-0 flex flex-col text-xs">
												<button
													type="button"
													title="Tape up: previous phase −1 week"
													onClick={() => nudgeTape(w.phaseIndex, -1)}
													className="rounded px-1 hover:bg-stone-200 dark:hover:bg-stone-700"
												>
													▲
												</button>
												<button
													type="button"
													title="Tape down: previous phase +1 week"
													onClick={() => nudgeTape(w.phaseIndex, 1)}
													className="rounded px-1 hover:bg-stone-200 dark:hover:bg-stone-700"
												>
													▼
												</button>
											</div>
										)}
									</div>
								)}
								<button
									type="button"
									onClick={() => applyTool(w.index)}
									className={cn(
										'relative block w-full rounded-sm border border-stone-200 bg-white px-4 py-2.5 text-left shadow-sm transition-transform dark:border-stone-600 dark:bg-stone-800',
										w.index % 2 ? 'rotate-[0.3deg]' : 'rotate-[-0.3deg]',
										tool && 'hover:scale-[1.01] hover:shadow-md',
									)}
								>
									<div className="flex items-baseline gap-3">
										<span className="text-xs font-bold text-stone-400 tabular-nums">
											{w.raceMinus === 0 ? 'RACE WEEK' : `Race −${w.raceMinus}`}
										</span>
										<span className="text-lg font-bold text-stone-800 tabular-nums dark:text-stone-100">
											{hours} h
										</span>
										<span className="text-xs text-stone-400 italic">
											≈ {Math.round(hours * TSS_PER_HOUR)} TSS
										</span>
										<span className="ml-auto flex items-center gap-1">
											<PencilNudge
												onDown={() =>
													setHoursOverride((o) => ({
														...o,
														[w.index]: Math.max(
															0,
															(o[w.index] ?? w.phase.weeklyLoadHours) - 0.5,
														),
													}))
												}
												onUp={() =>
													setHoursOverride((o) => ({
														...o,
														[w.index]:
															(o[w.index] ?? w.phase.weeklyLoadHours) + 0.5,
													}))
												}
											/>
										</span>
									</div>
									{stamp && (
										<div className="mt-1.5 flex items-center gap-2 text-xs text-stone-500">
											<span className="rotate-[-2deg] rounded border border-indigo-300 px-1.5 py-0.5 font-bold text-indigo-400 uppercase">
												{stamp.name}
											</span>
											<span className="flex gap-1">
												{DAY_LABELS.map((_, d) => {
													const s = stamp.sessions.find((x) => x.day === d)
													return (
														<span key={d} title={s?.title}>
															{s ? DISCIPLINE_GLYPH[s.discipline] : '·'}
														</span>
													)
												})}
											</span>
											{stamp.sessions.some(
												(s) => s.discipline === 'strength',
											) && (
												<span className="text-stone-400 italic">
													(strength: no TSS)
												</span>
											)}
										</div>
									)}
									{rested && (
										<span className="absolute -top-1.5 right-6 rotate-[6deg] rounded-full bg-emerald-400 px-2 py-0.5 text-[10px] font-black text-emerald-950 shadow">
											REST −30%
										</span>
									)}
									{w.phase.kind === 'taper' && (
										<div className="mt-0.5 text-xs text-violet-500 italic">
											taper — shrink the volume, keep the intensity
										</div>
									)}
									{dry && (
										<div className="mt-0.5 text-xs font-semibold text-rose-500 italic">
											✎ {weeksSinceRest(w.index)} weeks without a rest sticker…
										</div>
									)}
								</button>
							</div>
						)
					})}
					{/* Race day at the bottom of the stack */}
					<div className="mt-4 rotate-[0.5deg] rounded-sm border-2 border-dashed border-rose-300 bg-rose-50 px-4 py-3 text-center dark:bg-rose-950/40">
						<div className="text-lg font-black text-rose-500">
							🏁 {source.eventName}
						</div>
						<div className="text-xs text-stone-500">
							{formatEventDate(source.eventDate)} — everything above is anchored
							backward from here
						</div>
					</div>
				</div>
			</div>

			{/* The tray: rubber stamps + stickers */}
			<div className="fixed inset-x-0 bottom-16 z-40 flex justify-center px-4">
				<div className="flex max-w-full items-center gap-2 overflow-x-auto rounded-xl border border-stone-300 bg-stone-100/95 px-3 py-2 shadow-lg backdrop-blur dark:border-stone-600 dark:bg-stone-800/95">
					<span className="shrink-0 text-[10px] font-bold tracking-widest text-stone-400 uppercase">
						tray
					</span>
					<button
						type="button"
						onClick={() =>
							setTool((t) => (t?.kind === 'rest' ? null : { kind: 'rest' }))
						}
						className={cn(
							'shrink-0 rounded-full bg-emerald-400 px-3 py-1 text-xs font-black text-emerald-950 shadow',
							tool?.kind === 'rest' && 'ring-2 ring-emerald-600 ring-offset-2',
						)}
					>
						REST −30%
					</button>
					{SEED_PATTERNS.map((p) => (
						<button
							key={p.id}
							type="button"
							onClick={() =>
								setTool((t) =>
									t?.kind === 'stamp' && t.patternId === p.id
										? null
										: { kind: 'stamp', patternId: p.id },
								)
							}
							className={cn(
								'shrink-0 rounded border-2 border-indigo-300 bg-white px-2 py-1 text-[11px] font-bold text-indigo-500 uppercase shadow dark:bg-stone-900',
								tool?.kind === 'stamp' &&
									tool.patternId === p.id &&
									'ring-2 ring-indigo-500 ring-offset-2',
							)}
						>
							⧉ {p.name}
						</button>
					))}
					<span className="shrink-0 text-[10px] text-stone-400 italic">
						{tool
							? 'now tap a week card to apply (tap again to remove)'
							: 'pick a stamp or sticker'}
					</span>
				</div>
			</div>
		</main>
	)
}

function PencilNudge({
	onDown,
	onUp,
}: {
	onDown: () => void
	onUp: () => void
}) {
	return (
		<span
			className="flex items-center gap-0.5"
			onClick={(e) => e.stopPropagation()}
		>
			<button
				type="button"
				onClick={onDown}
				className="grid size-6 place-items-center rounded-full text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700"
				aria-label="Less volume"
			>
				−
			</button>
			<span className="text-xs text-stone-300">✎</span>
			<button
				type="button"
				onClick={onUp}
				className="grid size-6 place-items-center rounded-full text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700"
				aria-label="More volume"
			>
				＋
			</button>
		</span>
	)
}
