import { useMemo, useState } from 'react'
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
	type BlockFocus,
	type BlockRhythm,
	type MesoBlock,
} from './__proto-x-blocks-model.ts'
import {
	FALLBACK_PLAN,
	formatEventDate,
	type ProtoPlanInput,
} from './__proto-x-model.ts'

// PROTOTYPE variant F — "Block Builder". Variant E's professional layout,
// rebuilt around meso blocks: the season is an ordered list of blocks, each
// with a training focus (endurance / threshold / VO2max / strength / …), its
// own loading rhythm (3:1, 2:1, or none), and a volume level. Macro
// templates stamp a whole season; the plan can anchor backward to the
// Target Event or run open-ended and repeat its cycle indefinitely.

type Anchor = 'event' | 'ongoing'

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

export function BlockBuilderVariant({ plan }: { plan: ProtoPlanInput }) {
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
	const maxTss = Math.max(...weeks.map((w) => w.tss), 1)

	// Week-1 Monday: backward from the event, or forward from next Monday.
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

	// Chart geometry (renders `chartRepeats` copies of the cycle)
	const totalBars = cycleWeeks * chartRepeats
	const CW = 880
	const CH = 230
	const padL = 36
	const padB = 40
	const padT = 16
	const colW = (CW - padL - 12) / totalBars
	const maxCtl = Math.max(...ctl) * 1.15
	const yTss = (t: number) => CH - padB - (t / maxTss) * (CH - padB - padT)
	const yCtl = (c: number) => CH - padB - (c / maxCtl) * (CH - padB - padT)

	return (
		<main className="mx-auto max-w-6xl px-4 py-6">
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
						↻ Ongoing — no finish line
					</button>
				</div>
			</div>

			<div className="mt-4 grid gap-4 lg:grid-cols-[320px_1fr]">
				{/* ── Rail: macro templates + the block list ─────────────────── */}
				<aside className="space-y-4">
					<section className="rounded-xl border p-4">
						<h3 className="text-muted-foreground mb-2 text-xs font-bold tracking-wide uppercase">
							Season templates
						</h3>
						<div className="space-y-1.5">
							{MACRO_TEMPLATES.map((m) => (
								<button
									key={m.id}
									type="button"
									onClick={() => {
										setBlocks(instantiateMacro(m))
										setOverrides({})
										setAppliedMacro(m.id)
										setAnchor(m.anchored ? 'event' : 'ongoing')
									}}
									className={cn(
										'w-full rounded-lg border px-3 py-2 text-left',
										appliedMacro === m.id
											? 'border-foreground bg-muted/60'
											: 'hover:bg-muted/40',
									)}
								>
									<div className="flex items-center gap-2 text-sm font-semibold">
										{m.name}
										<span className="text-muted-foreground text-xs font-normal">
											{m.anchored ? '🏁' : '↻'}
										</span>
									</div>
									<div className="mt-1 flex h-2 gap-px overflow-hidden rounded-sm">
										{m.blocks.map((b, i) => (
											<span
												key={i}
												style={{
													background: FOCUS_META[b.focus].hex,
													flexGrow: b.weeks,
												}}
											/>
										))}
									</div>
								</button>
							))}
						</div>
					</section>

					<section className="rounded-xl border p-4">
						<h3 className="text-muted-foreground mb-2 text-xs font-bold tracking-wide uppercase">
							Blocks (mesos)
						</h3>
						<div className="space-y-2">
							{blocks.map((b) => {
								const meta = FOCUS_META[b.focus]
								const open = selectedBlock === b.id
								return (
									<div
										key={b.id}
										className={cn(
											'rounded-lg border',
											open && 'ring-foreground/40 ring-1',
										)}
									>
										<button
											type="button"
											onClick={() => setSelectedBlock(open ? null : b.id)}
											className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm"
										>
											<span
												className="size-3 rounded-sm"
												style={{ background: meta.hex }}
											/>
											<span className="font-semibold">{b.name}</span>
											<span className="text-muted-foreground ml-auto text-xs tabular-nums">
												{b.weeks} wk · {b.hours} h · {RHYTHM_LABEL[b.rhythm]}
											</span>
										</button>
										{open && (
											<div className="space-y-3 border-t px-3 py-3 text-sm">
												<div className="flex flex-wrap gap-1">
													{(Object.keys(FOCUS_META) as BlockFocus[]).map(
														(f) => (
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
																	'min-h-9 rounded-full border px-2.5 text-xs font-semibold',
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
														),
													)}
												</div>
												<p className="text-muted-foreground text-xs">
													{meta.note}
												</p>
												<div className="flex items-center gap-2">
													<span className="w-14 text-xs">Weeks</span>
													<Stepper
														value={b.weeks}
														onChange={(v) =>
															patchBlock(b.id, { weeks: Math.max(1, v) })
														}
													/>
													<span className="ml-auto flex gap-1">
														<RailIcon
															label="Move up"
															onClick={() => moveBlock(b.id, -1)}
														>
															↑
														</RailIcon>
														<RailIcon
															label="Move down"
															onClick={() => moveBlock(b.id, 1)}
														>
															↓
														</RailIcon>
														<RailIcon
															label="Remove block"
															onClick={() => removeBlock(b.id)}
														>
															✕
														</RailIcon>
													</span>
												</div>
												<label className="block">
													<span className="text-xs">
														Volume: {b.hours} h/week
													</span>
													<input
														type="range"
														min={2}
														max={14}
														step={0.5}
														value={b.hours}
														onChange={(e) =>
															patchBlock(b.id, {
																hours: Number(e.target.value),
															})
														}
														className="mt-1 w-full"
													/>
												</label>
												<div>
													<span className="text-xs">Rhythm</span>
													<div className="mt-1 flex gap-1 rounded-lg border p-0.5 text-xs font-semibold">
														{(['3:1', '2:1', 'none'] as BlockRhythm[]).map(
															(r) => (
																<button
																	key={r}
																	type="button"
																	onClick={() =>
																		patchBlock(b.id, { rhythm: r })
																	}
																	className={cn(
																		'min-h-9 flex-1 rounded-md px-1',
																		b.rhythm === r &&
																			'bg-foreground text-background',
																	)}
																>
																	{RHYTHM_LABEL[r]}
																</button>
															),
														)}
													</div>
												</div>
											</div>
										)}
									</div>
								)
							})}
						</div>
						<div className="mt-3">
							<div className="text-muted-foreground mb-1 text-xs font-semibold">
								Add a block
							</div>
							<div className="flex flex-wrap gap-1">
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
											className="mr-1 inline-block size-2 rounded-sm align-baseline"
											style={{ background: FOCUS_META[t.focus].hex }}
										/>
										＋ {t.name}
									</button>
								))}
							</div>
						</div>
					</section>
				</aside>

				{/* ── Chart + table ──────────────────────────────────────────── */}
				<div className="min-w-0 space-y-4">
					<div className="overflow-x-auto rounded-xl border p-3">
						<svg viewBox={`0 0 ${CW} ${CH}`} className="w-full min-w-[640px]">
							{[0.5, 1].map((f) => (
								<g key={f}>
									<line
										x1={padL}
										x2={CW - 8}
										y1={yTss(maxTss * f)}
										y2={yTss(maxTss * f)}
										stroke="currentColor"
										opacity={0.08}
									/>
									<text
										x={padL - 4}
										y={yTss(maxTss * f) + 3}
										textAnchor="end"
										fontSize={9}
										fill="currentColor"
										opacity={0.5}
									>
										{Math.round(maxTss * f)}
									</text>
								</g>
							))}
							{Array.from({ length: chartRepeats }).flatMap((_, rep) =>
								weeks.map((w, i) => {
									const bar = rep * cycleWeeks + i
									return (
										<rect
											key={bar}
											x={padL + bar * colW + 1.5}
											y={yTss(w.tss)}
											width={colW - 3}
											height={CH - padB - yTss(w.tss)}
											rx={2}
											fill={FOCUS_META[w.focus].hex}
											opacity={(w.isEasy ? 0.35 : 0.85) * (rep > 0 ? 0.45 : 1)}
										>
											<title>
												Week {i + 1} · {w.blockName} · {w.hours} h ≈ {w.tss} TSS
												{w.isEasy ? ' · easy week (−30%)' : ''}
												{rep > 0 ? ' · next repeat' : ''}
											</title>
										</rect>
									)
								}),
							)}
							{/* cycle separator for ongoing plans */}
							{anchor === 'ongoing' && (
								<g>
									<line
										x1={padL + cycleWeeks * colW}
										x2={padL + cycleWeeks * colW}
										y1={padT}
										y2={CH - padB}
										stroke="currentColor"
										strokeDasharray="3 3"
										opacity={0.4}
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
								</g>
							)}
							{/* CTL projection */}
							<polyline
								points={ctl
									.map((c, i) => `${padL + (i + 0.5) * colW},${yCtl(c)}`)
									.join(' ')}
								fill="none"
								stroke="currentColor"
								strokeWidth={1.8}
								strokeDasharray="5 3"
								opacity={0.7}
							/>
							<text
								x={padL + ctl.length * colW - 6}
								y={yCtl(ctl[ctl.length - 1]!) - 6}
								textAnchor="end"
								fontSize={9}
								fill="currentColor"
								opacity={0.7}
							>
								CTL {ctl[ctl.length - 1]}
							</text>
							{/* race marker */}
							{anchor === 'event' && (
								<g>
									<line
										x1={padL + cycleWeeks * colW}
										x2={padL + cycleWeeks * colW}
										y1={padT}
										y2={CH - padB}
										stroke="#f43f5e"
										strokeWidth={1.5}
									/>
									<text
										x={padL + cycleWeeks * colW - 4}
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
							{/* block band along the bottom */}
							{Array.from({ length: chartRepeats }).flatMap((_, rep) =>
								weeks.map((w, i) => {
									const bar = rep * cycleWeeks + i
									return (
										<rect
											key={bar}
											x={padL + bar * colW}
											y={CH - padB + 16}
											width={colW}
											height={6}
											fill={FOCUS_META[w.focus].hex}
											opacity={rep > 0 ? 0.45 : 1}
										/>
									)
								}),
							)}
						</svg>
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
							<span>▨ dimmed = easy week</span>
							<span>┄ projected fitness (CTL), display only</span>
						</div>
					</div>

					{/* Week table — one cycle */}
					<div className="overflow-x-auto rounded-xl border">
						<table className="w-full min-w-[620px] text-sm">
							<thead>
								<tr className="text-muted-foreground border-b text-left text-xs uppercase">
									<th className="px-3 py-2 font-semibold">Wk</th>
									<th className="px-3 py-2 font-semibold">Training Week</th>
									<th className="px-3 py-2 font-semibold">Block</th>
									<th className="px-3 py-2 font-semibold">Type</th>
									<th className="px-3 py-2 text-right font-semibold">
										Target (h)
									</th>
									<th className="px-3 py-2 text-right font-semibold">≈ TSS</th>
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
										<td
											className="px-3 py-1.5 text-right"
											onClick={(e) => e.stopPropagation()}
										>
											<input
												type="number"
												step={0.5}
												min={0}
												value={w.hours}
												onChange={(e) => {
													const v = Number(e.target.value)
													setOverrides((o) =>
														Number.isFinite(v) ? { ...o, [w.index]: v } : o,
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
											{w.tss}
										</td>
										<td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
											{ctl[i]}
										</td>
									</tr>
								))}
								{anchor === 'event' ? (
									<tr className="bg-rose-500/10 font-semibold">
										<td className="px-3 py-2">🏁</td>
										<td className="px-3 py-2" colSpan={6}>
											{source.eventName} — {formatEventDate(source.eventDate)}
										</td>
									</tr>
								) : (
									<tr className="bg-muted/40 font-semibold">
										<td className="px-3 py-2">↻</td>
										<td className="px-3 py-2" colSpan={6}>
											Cycle repeats — week {cycleWeeks + 1} starts the next
											round of "{blocks[0]?.name}". Extend or retire it any
											time.
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>

					<div className="flex items-center justify-between gap-3">
						<p className="text-muted-foreground text-xs">
							{cycleWeeks} weeks · {totalHours} h per cycle · per-focus TSS/h
							assumptions shown are planning estimates
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
				</div>
			</div>
		</main>
	)
}

function Stepper({
	value,
	onChange,
}: {
	value: number
	onChange: (v: number) => void
}) {
	return (
		<span className="flex items-center gap-1">
			<button
				type="button"
				onClick={() => onChange(value - 1)}
				className="bg-muted hover:bg-muted/70 grid size-8 place-items-center rounded-md font-bold"
				aria-label="Decrease"
			>
				−
			</button>
			<span className="w-10 text-center font-semibold tabular-nums">
				{value}
			</span>
			<button
				type="button"
				onClick={() => onChange(value + 1)}
				className="bg-muted hover:bg-muted/70 grid size-8 place-items-center rounded-md font-bold"
				aria-label="Increase"
			>
				＋
			</button>
		</span>
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
