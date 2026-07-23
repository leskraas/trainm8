import { useMemo, useState } from 'react'
import { cn } from '#app/utils/misc.tsx'
import {
	DAY_LABELS,
	DISCIPLINE_GLYPH,
	FALLBACK_PLAN,
	PHASE_COLORS,
	SEED_PATTERNS,
	deriveWeeks,
	formatEventDate,
	projectCtl,
	protoId,
	toProtoPhases,
	type ProtoPhase,
	type ProtoPlanInput,
	type Rhythm,
} from './__proto-x-model.ts'

// PROTOTYPE variant A — "Sequencer". The season is a groovebox: Training
// Weeks are steps running left→right into the Target Event, the
// loading/recovery rhythm is literally the beat pattern, phases are colored
// clips on the arrangement lane, and a week pattern is a clip you stamp
// across a phase. Tap a step to open its fader.

export function SequencerVariant({ plan }: { plan: ProtoPlanInput }) {
	const source = plan ?? FALLBACK_PLAN
	const [phases, setPhases] = useState<ProtoPhase[]>(() =>
		toProtoPhases(source.phases),
	)
	const [rhythm, setRhythm] = useState<Rhythm>('3:1')
	const [overrides, setOverrides] = useState<Record<number, number>>({})
	const [selectedWeek, setSelectedWeek] = useState<number | null>(null)
	const [selectedPhase, setSelectedPhase] = useState<number | null>(null)
	const [stamps, setStamps] = useState<Record<number, string>>({})

	const weeks = useMemo(
		() => deriveWeeks(phases, rhythm, overrides),
		[phases, rhythm, overrides],
	)
	const ctl = useMemo(() => projectCtl(weeks), [weeks])
	const maxHours = Math.max(10, ...weeks.map((w) => w.hours))
	const week = selectedWeek != null ? weeks[selectedWeek] : null
	const phase = selectedPhase != null ? phases[selectedPhase] : null

	function updatePhase(i: number, patch: Partial<ProtoPhase>) {
		setPhases((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)))
		setOverrides({})
	}

	return (
		<main className="mx-auto max-w-3xl px-4 py-6">
			{/* Transport bar — the "song" is the season, mastered to the event */}
			<div className="flex flex-wrap items-center gap-3 rounded-xl border bg-zinc-950 px-4 py-3 text-zinc-100">
				<span className="grid size-8 place-items-center rounded-full bg-emerald-500 text-sm font-black text-zinc-950">
					▶
				</span>
				<div className="min-w-0">
					<div className="truncate text-sm font-bold">{source.eventName}</div>
					<div className="text-xs text-zinc-400">
						A race · {formatEventDate(source.eventDate)} · {weeks.length} bars
						(weeks)
					</div>
				</div>
				<div className="ml-auto flex items-center gap-1 rounded-lg bg-zinc-800 p-1 text-xs font-semibold">
					{(['3:1', '2:1'] as const).map((r) => (
						<button
							key={r}
							type="button"
							onClick={() => setRhythm(r)}
							className={cn(
								'rounded-md px-2 py-1',
								rhythm === r ? 'bg-emerald-500 text-zinc-950' : 'text-zinc-300',
							)}
						>
							{r === '3:1' ? '●●●○ 3:1' : '●●○ 2:1'}
						</button>
					))}
				</div>
			</div>

			{/* Arrangement: phase clips + week steps */}
			<div className="mt-4 overflow-x-auto rounded-xl border bg-zinc-950 p-3">
				<div style={{ minWidth: weeks.length * 44 + 40 }}>
					{/* Phase clip lane */}
					<div className="mb-2 flex gap-px pl-10">
						{phases.map((p, i) => (
							<button
								key={p.id}
								type="button"
								onClick={() => {
									setSelectedPhase(i === selectedPhase ? null : i)
									setSelectedWeek(null)
								}}
								className={cn(
									'h-9 shrink-0 truncate rounded-md px-2 text-left text-xs font-bold text-zinc-950',
									PHASE_COLORS[p.kind].solid,
									selectedPhase === i && 'ring-2 ring-white',
								)}
								style={{ width: p.weeks * 44 - 4 }}
							>
								{p.name}
								{stamps[i] ? ' · ⧉' : ''}
							</button>
						))}
					</div>
					{/* Step lane: one fader-bar per Training Week */}
					<div className="flex items-end gap-px pl-10">
						{weeks.map((w) => (
							<button
								key={w.index}
								type="button"
								onClick={() => {
									setSelectedWeek(w.index === selectedWeek ? null : w.index)
									setSelectedPhase(null)
								}}
								className="group flex w-11 shrink-0 flex-col items-center gap-1"
								aria-label={`Week ${w.index + 1}: ${w.hours} hours`}
							>
								<span className="text-[10px] font-semibold text-zinc-400 tabular-nums">
									{w.hours}h
								</span>
								<span
									className={cn(
										'w-8 rounded-sm transition-all',
										PHASE_COLORS[w.phaseKind].solid,
										w.isRecovery && 'opacity-40',
										w.overridden && 'ring-1 ring-white',
										selectedWeek === w.index && 'ring-2 ring-emerald-400',
									)}
									style={{ height: 8 + (w.hours / maxHours) * 96 }}
								/>
								{/* The beat row: loading = filled beat, recovery = rest */}
								<span
									className={cn(
										'text-xs leading-none',
										w.isRecovery ? 'text-zinc-500' : 'text-emerald-400',
									)}
								>
									{w.isRecovery ? '○' : '●'}
								</span>
								<span className="text-[10px] text-zinc-500 tabular-nums">
									{w.index + 1}
								</span>
							</button>
						))}
						<div className="flex w-11 shrink-0 flex-col items-center justify-end self-stretch pb-4 text-lg">
							🏁
						</div>
					</div>
					{/* Fitness projection readout under the steps */}
					<div className="mt-2 flex gap-px pl-10">
						{weeks.map((w, i) => (
							<span
								key={w.index}
								className="w-11 shrink-0 text-center text-[9px] text-sky-400/80 tabular-nums"
							>
								{i === 0 || i === weeks.length - 1 || i % 3 === 0
									? ctl[i]
									: '·'}
							</span>
						))}
					</div>
					<div className="pl-10 text-[10px] text-sky-400/60">
						projected fitness (CTL) — display only
					</div>
				</div>
			</div>

			{/* Bottom panel: the selected step's fader, or the selected clip */}
			{week ? (
				<div className="bg-card mt-4 rounded-xl border p-4">
					<div className="flex items-center justify-between">
						<div>
							<div className="text-sm font-bold">
								Week {week.index + 1} · {week.phaseName}
								{week.isRecovery && (
									<span className="text-muted-foreground ml-2 text-xs font-medium">
										recovery week (−30%)
									</span>
								)}
								{week.isTaper && (
									<span className="text-muted-foreground ml-2 text-xs font-medium">
										taper — volume only, intensity held
									</span>
								)}
							</div>
							<div className="text-muted-foreground text-xs">
								target {week.hours} h ≈ {week.tss} TSS
							</div>
						</div>
						{week.overridden && (
							<button
								type="button"
								className="text-xs font-semibold underline"
								onClick={() =>
									setOverrides(({ [week.index]: _, ...rest }) => rest)
								}
							>
								reset to pattern
							</button>
						)}
					</div>
					<input
						type="range"
						min={0}
						max={14}
						step={0.5}
						value={week.hours}
						onChange={(e) =>
							setOverrides((o) => ({
								...o,
								[week.index]: Number(e.target.value),
							}))
						}
						className="mt-3 w-full accent-emerald-500"
						aria-label="Weekly load fader"
					/>
					{stamps[week.phaseIndex] && (
						<StampedWeekRow patternId={stamps[week.phaseIndex]!} />
					)}
				</div>
			) : phase ? (
				<div className="bg-card mt-4 rounded-xl border p-4">
					<div className="flex flex-wrap items-center gap-4">
						<div
							className={cn(
								'rounded px-2 py-1 text-sm font-bold text-zinc-950',
								PHASE_COLORS[phase.kind].solid,
							)}
						>
							{phase.name}
						</div>
						<Stepper
							label="weeks"
							value={phase.weeks}
							onChange={(v) =>
								updatePhase(selectedPhase!, { weeks: Math.max(1, v) })
							}
						/>
						<Stepper
							label="h/week"
							value={phase.weeklyLoadHours}
							onChange={(v) =>
								updatePhase(selectedPhase!, {
									weeklyLoadHours: Math.max(0, v),
								})
							}
						/>
						<button
							type="button"
							className="text-destructive text-xs font-semibold underline disabled:opacity-40"
							disabled={phases.length <= 1}
							onClick={() => {
								setPhases((ps) => ps.filter((_, j) => j !== selectedPhase))
								setSelectedPhase(null)
							}}
						>
							delete clip
						</button>
					</div>
					<div className="mt-3">
						<div className="text-muted-foreground mb-1 text-xs font-semibold uppercase">
							Stamp a week pattern across this phase
						</div>
						<div className="flex flex-wrap gap-2">
							{SEED_PATTERNS.map((pat) => (
								<button
									key={pat.id}
									type="button"
									onClick={() =>
										setStamps((s) => ({ ...s, [selectedPhase!]: pat.id }))
									}
									className={cn(
										'rounded-lg border px-3 py-1.5 text-xs font-semibold',
										stamps[selectedPhase!] === pat.id
											? 'border-emerald-500 bg-emerald-500/10'
											: 'hover:bg-muted',
									)}
								>
									⧉ {pat.name}
								</button>
							))}
						</div>
						<p className="text-muted-foreground mt-2 text-xs">
							Stamping creates standalone Workout Sessions per week — no live
							link back to the pattern. Strength sessions carry no TSS and never
							count toward the week's load target.
						</p>
					</div>
				</div>
			) : (
				<div className="text-muted-foreground mt-4 rounded-xl border border-dashed p-4 text-center text-sm">
					Tap a <span className="font-semibold">clip</span> (phase) to resize or
					stamp it · tap a <span className="font-semibold">step</span> (week) to
					ride its fader
				</div>
			)}

			<button
				type="button"
				onClick={() =>
					setPhases((ps) => [
						...ps.slice(0, -1),
						{
							id: protoId(),
							kind: 'build',
							name: 'Build 2',
							weeks: 3,
							weeklyLoadHours: 8,
							focus: '',
						},
						...ps.slice(-1),
					])
				}
				className="hover:bg-muted mt-3 w-full rounded-xl border border-dashed py-2 text-sm font-semibold"
			>
				＋ drop a new clip before the taper
			</button>
		</main>
	)
}

function StampedWeekRow({ patternId }: { patternId: string }) {
	const pattern = SEED_PATTERNS.find((p) => p.id === patternId)
	if (!pattern) return null
	return (
		<div className="mt-3 border-t pt-3">
			<div className="text-muted-foreground mb-1 text-xs font-semibold uppercase">
				Stamped: {pattern.name}
			</div>
			<div className="grid grid-cols-7 gap-1 text-center">
				{DAY_LABELS.map((d, i) => {
					const s = pattern.sessions.find((x) => x.day === i)
					return (
						<div key={d} className="rounded-md border p-1.5">
							<div className="text-muted-foreground text-[10px]">{d}</div>
							{s ? (
								<div className="text-sm" title={s.title}>
									{DISCIPLINE_GLYPH[s.discipline]}
									<div className="text-[9px] font-semibold tabular-nums">
										{s.discipline === 'strength'
											? 'no TSS'
											: `${Math.round(s.share * 100)}%`}
									</div>
								</div>
							) : (
								<div className="text-muted-foreground/40 text-sm">–</div>
							)}
						</div>
					)
				})}
			</div>
		</div>
	)
}

function Stepper({
	label,
	value,
	onChange,
}: {
	label: string
	value: number
	onChange: (v: number) => void
}) {
	return (
		<div className="flex items-center gap-1.5 text-sm">
			<button
				type="button"
				className="bg-muted grid size-7 place-items-center rounded-md font-bold"
				onClick={() => onChange(value - 1)}
			>
				−
			</button>
			<span className="min-w-14 text-center font-semibold tabular-nums">
				{value} {label}
			</span>
			<button
				type="button"
				className="bg-muted grid size-7 place-items-center rounded-md font-bold"
				onClick={() => onChange(value + 1)}
			>
				＋
			</button>
		</div>
	)
}
