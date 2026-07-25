/**
 * PROTOTYPE — throwaway. Variant E: "Apple shell, TrainingPeaks instrumentation".
 *
 * The synthesis the reviewer asked for after seeing A and D. It keeps Apple's
 * posture — one thing at a time, generous whitespace, big calm numerals, rings,
 * sheets, progressive disclosure — and pulls in the pro tool's substance:
 *
 *   · a chart as the primary object, not a decoration
 *   · tap-to-inspect with the readout *below* the chart (ADR 0030)
 *   · directly editable per-week targets
 *   · a ramp guard that names the offending Training Week and offers the fix
 *   · projected fitness (CTL) per week and per block
 *   · every currency readable at once, not just the primary
 *
 * The reconciliation is a single **Blocks / Weeks** segmented control: Apple's
 * one-thing-at-a-time stack when you're shaping the season, the pro grid when
 * you're auditing it. Density becomes a mode, not a permanent tax.
 *
 * Delete with the route.
 */
import { useState } from 'react'
import { Icon } from '#app/components/ui/icon.tsx'
import { cn } from '#app/utils/misc.tsx'
import {
	Segmented,
	Sheet,
	Stepper,
	WeekRing,
} from './__manual-prototype-x-apple.tsx'
import {
	BLOCK_TEMPLATES,
	CURRENCIES,
	CURRENCY_UNIT,
	FOCUS,
	FOCUS_KEYS,
	formatShortDate,
	fromHours,
	type PlannedWeek,
	projectCtl,
	rampPercent,
	RHYTHMS,
	SEASON_TEMPLATES,
	TSS_PER_ENDURANCE_HOUR,
	weeksUntil,
} from './__manual-prototype-x-model.ts'
import { type PlanStore } from './__manual-prototype-x-state.ts'

export const HYBRID_NAME = 'Apple × TrainingPeaks'

const RAMP_WARN = 8
const RAMP_HOT = 12
const START_CTL = 48

// ---------------------------------------------------------------------------

/**
 * The season chart, drawn with Apple restraint but carrying the pro tool's
 * payload: weekly volume, the projected fitness curve, phase bands, today, and
 * the finish. No gridlines, no axis furniture — the numbers live in the inspect
 * card underneath, where ADR 0030 says they belong.
 */
function SeasonChart({
	weeks,
	ctl,
	selected,
	onSelect,
	currentIndex,
	raceName,
	repeatFrom,
}: {
	weeks: PlannedWeek[]
	ctl: number[]
	selected: number | null
	onSelect: (i: number) => void
	currentIndex: number | null
	raceName: string | null
	repeatFrom: number | null
}) {
	const colW = 34
	const H = 190
	const padX = 14
	const plotH = 132
	const bandY = plotH + 18
	const W = weeks.length * colW + padX * 2
	const maxVol = Math.max(...weeks.map((w) => w.hours), 0.1)
	const maxCtl = Math.max(...ctl, START_CTL) * 1.2
	const x = (i: number) => padX + i * colW
	const yVol = (h: number) => plotH - (h / maxVol) * (plotH - 16)
	const yCtl = (c: number) => plotH - (c / maxCtl) * (plotH - 16)

	const spans: Array<{ key: string; from: number; to: number; focus: string }> =
		[]
	weeks.forEach((w, i) => {
		const last = spans[spans.length - 1]
		if (last && last.key.startsWith(w.phaseId) && last.to === i - 1) last.to = i
		else
			spans.push({ key: `${w.phaseId}-${i}`, from: i, to: i, focus: w.focus })
	})

	const ctlPath = ctl
		.map((c, i) => `${i === 0 ? 'M' : 'L'} ${x(i) + colW / 2} ${yCtl(c)}`)
		.join(' ')

	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			className="h-auto w-full"
			role="img"
			aria-label="Planned weekly volume and projected fitness across the plan"
		>
			{/* Volume bars — rounded, generous, one accent per focus. */}
			{weeks.map((w, i) => {
				const top = yVol(w.hours)
				const isSel = selected === i
				const noLoad = !w.countsTowardLoad
				return (
					<g
						key={w.index}
						className="cursor-pointer"
						onClick={() => onSelect(i)}
					>
						<rect
							x={x(i)}
							y={0}
							width={colW}
							height={plotH}
							fill="transparent"
						/>
						<rect
							x={x(i) + colW * 0.18}
							y={top}
							width={colW * 0.64}
							height={Math.max(3, plotH - top)}
							rx={colW * 0.32}
							fill={FOCUS[w.focus].hue}
							opacity={
								noLoad ? 0.28 : isSel ? 1 : w.role === 'load' ? 0.62 : 0.34
							}
							className="transition-opacity duration-300"
						/>
						{noLoad ? (
							<rect
								x={x(i) + colW * 0.18}
								y={top}
								width={colW * 0.64}
								height={Math.max(3, plotH - top)}
								rx={colW * 0.32}
								fill="none"
								stroke={FOCUS[w.focus].hue}
								strokeWidth={1.5}
								strokeDasharray="3 3"
							/>
						) : null}
						{w.overridden ? (
							<circle
								cx={x(i) + colW / 2}
								cy={top - 7}
								r={2.4}
								fill="var(--foreground)"
							/>
						) : null}
					</g>
				)
			})}

			{/* Projected fitness — a thin, quiet second story. */}
			<path
				d={ctlPath}
				fill="none"
				stroke="var(--primary)"
				strokeWidth={2}
				strokeLinecap="round"
				strokeLinejoin="round"
				opacity={0.85}
			/>

			{/* Phase bands, as soft pills. */}
			{spans.map((s) => (
				<rect
					key={s.key}
					x={x(s.from) + 3}
					y={bandY}
					width={(s.to - s.from + 1) * colW - 6}
					height={6}
					rx={3}
					fill={FOCUS[s.focus as keyof typeof FOCUS].hue}
					opacity={0.55}
				/>
			))}

			{currentIndex !== null ? (
				<g>
					<line
						x1={x(currentIndex) + colW / 2}
						y1={4}
						x2={x(currentIndex) + colW / 2}
						y2={plotH}
						stroke="var(--foreground)"
						strokeWidth={1}
						strokeDasharray="2 4"
						opacity={0.45}
					/>
					<text
						x={x(currentIndex) + colW / 2}
						y={H - 4}
						textAnchor="middle"
						className="fill-foreground text-[8px] font-semibold"
					>
						today
					</text>
				</g>
			) : null}

			{repeatFrom !== null ? (
				<g>
					<line
						x1={x(repeatFrom)}
						y1={4}
						x2={x(repeatFrom)}
						y2={bandY + 6}
						stroke="var(--muted-foreground)"
						strokeWidth={1}
						strokeDasharray="3 3"
					/>
					<text
						x={x(repeatFrom) + 4}
						y={11}
						className="fill-muted-foreground text-[8px] font-semibold"
					>
						↻
					</text>
				</g>
			) : null}

			{raceName ? (
				<g>
					<line
						x1={W - padX + 4}
						y1={4}
						x2={W - padX + 4}
						y2={bandY + 6}
						stroke="var(--destructive)"
						strokeWidth={1.5}
					/>
					<circle cx={W - padX + 4} cy={4} r={3} fill="var(--destructive)" />
				</g>
			) : null}
		</svg>
	)
}

function BigStat({
	label,
	value,
	sub,
}: {
	label: string
	value: string
	sub?: string
}) {
	return (
		<div className="text-center">
			<div className="text-2xl font-semibold tracking-tight tabular-nums">
				{value}
			</div>
			<div className="text-muted-foreground mt-0.5 text-[11px] tracking-wide uppercase">
				{label}
			</div>
			{sub ? (
				<div className="text-muted-foreground text-[11px]">{sub}</div>
			) : null}
		</div>
	)
}

// ---------------------------------------------------------------------------

export function VariantHybrid({ store }: { store: PlanStore }) {
	const { plan, derived } = store
	const [mode, setMode] = useState<'blocks' | 'weeks'>('blocks')
	const [inspected, setInspected] = useState<number | null>(null)
	const [showAllMetrics, setShowAllMetrics] = useState(false)
	const [openPhase, setOpenPhase] = useState<string | null>(
		plan.phases[1]?.id ?? plan.phases[0]?.id ?? null,
	)
	const [selectedWeek, setSelectedWeek] = useState(1)
	const [editingCell, setEditingCell] = useState<number | null>(null)
	const [sheet, setSheet] = useState<
		null | 'anchor' | 'season' | 'block' | { swap: string }
	>(null)

	const cur = plan.currency
	const unit = CURRENCY_UNIT[cur]
	const weeks = derived.weeks
	const ctl = projectCtl(weeks, START_CTL)
	const untilRace = weeksUntil(plan.anchor.date, store.today)
	const repeatFrom =
		plan.anchor.kind === 'ongoing' && derived.cycleWeeks < weeks.length
			? derived.cycleWeeks
			: null

	const iw = inspected !== null ? weeks[inspected] : undefined
	const inspectedRamp =
		inspected !== null ? rampPercent(weeks, inspected) : null

	// The ramp guard, Apple-style: not a red table cell but one calm sentence
	// naming the worst offender, with the fix attached. It also distinguishes
	// the two causes — a spike inside a block, versus a new block that simply
	// opens above where the last one left off, which is the common one and
	// needs the *block* moved, not the week.
	type Guard = {
		i: number
		ramp: number
		atBlockStart: boolean
		phaseName: string
		prevPhaseName: string
	}
	let worst: Guard | null = null
	weeks.forEach((w, i) => {
		const r = rampPercent(weeks, i)
		if (r === null || r <= RAMP_HOT) return
		if (worst && r <= worst.ramp) return
		const prev = weeks[i - 1]
		worst = {
			i,
			ramp: r,
			atBlockStart:
				w.weekInPhase === 1 &&
				w.role !== 'taper' &&
				prev?.phaseId !== w.phaseId,
			phaseName: w.phaseName,
			prevPhaseName: prev?.phaseName ?? 'the previous block',
		}
	})
	const guard = worst as Guard | null

	const weeksByPhase = new Map<string, PlannedWeek[]>()
	for (const w of weeks) {
		if (w.cycle !== 1) continue
		const list = weeksByPhase.get(w.phaseId) ?? []
		list.push(w)
		weeksByPhase.set(w.phaseId, list)
	}

	return (
		<div className="mx-auto w-full max-w-2xl px-5 pb-40">
			{/* One question, asked large — Apple keeps the header. */}
			<section className="pt-10 pb-8 text-center">
				<p className="text-muted-foreground text-[13px] font-medium tracking-widest uppercase">
					{plan.anchor.kind === 'ongoing'
						? 'You’re building'
						: 'You’re building toward'}
				</p>
				<h1 className="mt-2 text-[2.4rem] leading-[1.05] font-semibold tracking-tight text-balance">
					{plan.anchor.kind === 'ongoing'
						? 'Ongoing fitness'
						: plan.anchor.name}
				</h1>
				<p className="text-muted-foreground mt-3 text-lg">
					{plan.anchor.kind === 'ongoing' ? (
						<span className="inline-flex items-center gap-2">
							<Icon name="update" size="sm" />
							{derived.cycleWeeks}-week cycle, repeating
						</span>
					) : (
						<>
							{untilRace} weeks away · {formatShortDate(plan.anchor.date)}
						</>
					)}
				</p>
				<button
					type="button"
					onClick={() => setSheet('anchor')}
					className="bg-muted mt-5 rounded-full px-5 py-2.5 text-sm font-medium transition-transform active:scale-95"
				>
					Change what you’re building toward
				</button>
			</section>

			<section className="mb-8">
				<Segmented
					label="Volume currency"
					value={cur}
					onChange={store.setCurrency}
					options={CURRENCIES.map((c) => ({ key: c, label: CURRENCY_UNIT[c] }))}
				/>
			</section>

			{/* The chart is the primary object — TrainingPeaks' one non-negotiable. */}
			<section className="border-border/60 bg-card rounded-[1.75rem] border px-4 pt-5 pb-4">
				<div className="mb-3 flex items-baseline justify-between px-1">
					<h2 className="text-sm font-medium">The season</h2>
					<span className="text-muted-foreground text-[11px]">
						volume · projected fitness
					</span>
				</div>

				<SeasonChart
					weeks={weeks}
					ctl={ctl}
					selected={inspected}
					onSelect={(i) => {
						setInspected(i)
						setEditingCell(null)
					}}
					currentIndex={derived.currentIndex}
					raceName={plan.anchor.kind === 'ongoing' ? null : plan.anchor.name}
					repeatFrom={repeatFrom}
				/>

				{/* Inspect below the chart, never a tooltip — but rendered calm. */}
				<div className="bg-muted/50 mt-3 rounded-2xl px-4 py-4">
					{iw ? (
						<>
							<div className="flex items-baseline justify-between">
								<div>
									<p className="text-sm font-medium">
										Week {(inspected ?? 0) + 1} ·{' '}
										{formatShortDate(iw.startDate)}
									</p>
									<p className="text-muted-foreground text-[13px]">
										{iw.phaseName} ·{' '}
										{iw.role === 'recovery'
											? 'Recovery week'
											: iw.role === 'taper'
												? `Taper ${iw.weekInPhase} of ${iw.phaseWeeks}`
												: `Load week ${iw.loadNumber} of ${iw.loadTotal}`}
									</p>
								</div>
								<div className="text-right">
									<div className="text-3xl font-semibold tracking-tight tabular-nums">
										{iw.countsTowardLoad || cur === 'hours'
											? fromHours(iw.hours, cur)
											: '—'}
									</div>
									<div className="text-muted-foreground text-[11px] tracking-wide uppercase">
										{unit}
									</div>
								</div>
							</div>

							<button
								type="button"
								onClick={() => setShowAllMetrics((v) => !v)}
								className="text-muted-foreground mt-3 flex items-center gap-1.5 text-[13px] font-medium"
							>
								<Icon
									name={showAllMetrics ? 'chevron-up' : 'chevron-down'}
									size="sm"
								/>
								{showAllMetrics ? 'Fewer metrics' : 'All metrics'}
							</button>

							{showAllMetrics ? (
								<dl className="border-border/60 mt-3 grid grid-cols-2 gap-x-6 gap-y-2 border-t pt-3 text-[13px] sm:grid-cols-3">
									{/* A week's TSS *is* its Planned TSS — say it once, under the
									    name the app already uses, never twice. */}
									{CURRENCIES.filter((c) => c !== cur).map((c) => (
										<Metric
											key={c}
											label={c === 'tss' ? 'Planned TSS' : CURRENCY_UNIT[c]}
											value={
												iw.countsTowardLoad || c === 'hours'
													? `${fromHours(iw.hours, c)}`
													: c === 'tss'
														? '— no TSS'
														: '—'
											}
										/>
									))}
									{cur === 'tss' ? (
										<Metric
											label="Reads as"
											value={iw.countsTowardLoad ? 'Planned TSS' : '— no TSS'}
										/>
									) : null}
									<Metric
										label="Ramp"
										value={
											inspectedRamp === null
												? '—'
												: `${inspectedRamp > 0 ? '+' : ''}${inspectedRamp}%`
										}
										tone={
											inspectedRamp !== null && inspectedRamp > RAMP_HOT
												? 'hot'
												: inspectedRamp !== null && inspectedRamp > RAMP_WARN
													? 'warn'
													: undefined
										}
									/>
									<Metric
										label="Projected fitness"
										value={`${ctl[inspected ?? 0] ?? '—'} CTL`}
									/>
								</dl>
							) : null}
						</>
					) : (
						<p className="text-muted-foreground text-center text-[13px]">
							Tap a week to inspect it.
						</p>
					)}
				</div>
			</section>

			{/* The ramp guard, as one sentence with the fix attached. */}
			{guard ? (
				<section className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--zone-4)]/40 bg-[var(--zone-4)]/10 px-4 py-3.5">
					<Icon
						name="alert-triangle"
						size="md"
						className="shrink-0 text-[var(--zone-4)]"
					/>
					<p className="min-w-0 flex-1 text-[13px]">
						Week {guard.i + 1} jumps{' '}
						<strong className="tabular-nums">+{guard.ramp}%</strong> on the week
						before it.{' '}
						<span className="text-muted-foreground">
							{guard.atBlockStart
								? `${guard.phaseName} opens well above where ${guard.prevPhaseName} left off — easing one week just moves the cliff, so this lowers the whole block and keeps its rhythm.`
								: 'This eases that single week back onto the ramp.'}
						</span>
					</p>
					<button
						type="button"
						onClick={() => {
							const w = weeks[guard.i]
							const prev = weeks[guard.i - 1]
							if (!w || !prev) return
							if (guard.atBlockStart) {
								// The root cause is block-to-block mismatch, not one week:
								// re-anchor the block's opening volume to the week before it.
								store.updatePhase(w.phaseId, {
									baseHours: Math.round(prev.hours * 1.06 * 10) / 10,
								})
							} else {
								store.setWeekOverride(
									w.phaseId,
									w.weekInPhase,
									fromHours(prev.hours * 1.06, cur),
								)
							}
							setInspected(guard.i)
						}}
						className="bg-foreground text-background shrink-0 rounded-full px-4 py-2 text-[13px] font-medium transition-transform active:scale-95"
					>
						{guard.atBlockStart ? 'Lower the block' : 'Smooth it'}
					</button>
				</section>
			) : null}

			{/* Season totals. */}
			<section className="border-border/60 bg-card mt-6 grid grid-cols-3 gap-2 rounded-[1.5rem] border px-4 py-5">
				<BigStat
					label={`Season ${unit}`}
					value={`${fromHours(derived.loadHours, cur)}`}
					sub={CURRENCIES.filter((c) => c !== cur)
						.map(
							(c) => `${fromHours(derived.loadHours, c)} ${CURRENCY_UNIT[c]}`,
						)
						.join(' · ')}
				/>
				<BigStat
					label="Weeks"
					value={`${derived.totalWeeks}`}
					sub={`${weeks.filter((w) => w.role === 'recovery').length} recovery`}
				/>
				<BigStat
					label="Peak fitness"
					value={`${Math.max(...ctl).toFixed(0)}`}
					sub={
						derived.unloadedHours
							? `+${derived.unloadedHours} h no-TSS`
							: 'projected CTL'
					}
				/>
			</section>

			{/* Density becomes a mode, not a permanent tax. */}
			<section className="mt-8">
				<Segmented
					label="Plan view"
					value={mode}
					onChange={setMode}
					options={[
						{ key: 'blocks' as const, label: 'Blocks' },
						{ key: 'weeks' as const, label: 'Weeks' },
					]}
				/>
			</section>

			{mode === 'blocks' ? (
				<div className="mt-5 space-y-3">
					{plan.phases.map((phase, i) => {
						const pw = weeksByPhase.get(phase.id) ?? []
						const meta = FOCUS[phase.focus]
						const open = openPhase === phase.id
						const peak = Math.max(...pw.map((w) => w.hours), 0)
						const sel = pw.find((w) => w.weekInPhase === selectedWeek) ?? pw[0]
						const first = pw[0]
						const last = pw[pw.length - 1]
						const ctlGain =
							first && last
								? (ctl[last.index] ?? 0) -
									(ctl[Math.max(0, first.index - 1)] ?? START_CTL)
								: 0
						const blockTotal = pw.reduce(
							(a, w) => a + (w.countsTowardLoad ? w.hours : 0),
							0,
						)

						if (!open) {
							return (
								<button
									key={phase.id}
									type="button"
									onClick={() => {
										setOpenPhase(phase.id)
										setSelectedWeek(1)
									}}
									className="border-border/60 bg-card flex w-full items-center gap-4 rounded-2xl border px-5 py-4 text-left transition-all duration-200 active:scale-[0.99]"
								>
									<span
										className="h-10 w-1.5 shrink-0 rounded-full"
										style={{ background: meta.hue }}
									/>
									<span className="min-w-0 flex-1">
										<span className="block truncate text-base font-medium">
											{phase.name}
										</span>
										<span className="text-muted-foreground block text-[13px] tabular-nums">
											{phase.weeks} wk · {meta.label} ·{' '}
											{meta.countsTowardLoad
												? `${fromHours(blockTotal, cur)} ${unit}`
												: `${fromHours(blockTotal, 'hours')} h, no TSS`}
											{meta.countsTowardLoad
												? ` · CTL ${ctlGain >= 0 ? '+' : ''}${ctlGain.toFixed(1)}`
												: ''}
										</span>
									</span>
									<span className="flex items-end gap-[3px]" aria-hidden>
										{pw.map((w) => (
											<span
												key={w.index}
												className="w-[5px] rounded-full"
												style={{
													height: `${8 + 22 * (w.hours / (peak || 1))}px`,
													background: w.role === 'load' ? meta.hue : meta.ring,
												}}
											/>
										))}
									</span>
									<Icon
										name="chevron-right"
										size="sm"
										className="text-muted-foreground shrink-0"
									/>
								</button>
							)
						}

						return (
							<article
								key={phase.id}
								className="border-border/60 bg-card overflow-hidden rounded-[1.75rem] border shadow-sm"
							>
								<header className="flex items-center gap-3 px-6 pt-6">
									<div className="min-w-0 flex-1">
										<h3 className="truncate text-2xl font-semibold tracking-tight">
											{phase.name}
										</h3>
										<p className="text-muted-foreground text-sm">
											Block {i + 1} of {plan.phases.length}
											{phase.origin ? ` · from “${phase.origin}”` : ''}
										</p>
									</div>
									<button
										type="button"
										onClick={() => setOpenPhase(null)}
										aria-label="Close block"
										className="bg-muted grid size-9 place-items-center rounded-full transition-transform active:scale-90"
									>
										<Icon name="chevron-up" size="sm" />
									</button>
								</header>

								<div className="relative mt-4 grid place-items-center">
									<WeekRing
										weeks={pw}
										focus={phase.focus}
										selected={selectedWeek}
										onSelect={(w) => {
											setSelectedWeek(w)
											const abs = pw.find((x) => x.weekInPhase === w)
											if (abs) setInspected(abs.index)
										}}
									/>
									<div className="pointer-events-none absolute grid place-items-center text-center">
										<div className="text-4xl font-semibold tracking-tight tabular-nums">
											{sel
												? sel.countsTowardLoad || cur === 'hours'
													? fromHours(sel.hours, cur)
													: '—'
												: '—'}
										</div>
										<div className="text-muted-foreground text-xs tracking-wide uppercase">
											{unit} · week {selectedWeek}
										</div>
									</div>
								</div>

								{sel ? (
									<div className="px-6 pt-2 pb-5 text-center">
										<p className="text-sm font-medium">
											{sel.role === 'recovery'
												? 'Recovery week'
												: `Load week ${sel.loadNumber} of ${sel.loadTotal}`}
											<span className="text-muted-foreground">
												{' '}
												· {formatShortDate(sel.startDate)}
											</span>
										</p>
										<p className="text-muted-foreground mt-1 text-[13px] tabular-nums">
											{sel.countsTowardLoad
												? `${Math.round(sel.hours * TSS_PER_ENDURANCE_HOUR)} planned TSS · projected CTL ${ctl[sel.index]}`
												: 'No TSS — this week is off the load books'}
										</p>
										<div className="mt-4 flex justify-center">
											<Stepper
												onDown={() =>
													store.setWeekOverride(
														phase.id,
														sel.weekInPhase,
														fromHours(sel.hours, cur) -
															(cur === 'hours' ? 0.5 : cur === 'km' ? 5 : 30),
													)
												}
												onUp={() =>
													store.setWeekOverride(
														phase.id,
														sel.weekInPhase,
														fromHours(sel.hours, cur) +
															(cur === 'hours' ? 0.5 : cur === 'km' ? 5 : 30),
													)
												}
											>
												<span className="text-muted-foreground text-sm">
													This week’s target
												</span>
											</Stepper>
										</div>
										{sel.overridden ? (
											<button
												type="button"
												onClick={() =>
													store.clearWeekOverride(phase.id, sel.weekInPhase)
												}
												className="text-muted-foreground mt-3 text-[13px] underline underline-offset-4"
											>
												Edited by hand — restore the rhythm
											</button>
										) : null}
									</div>
								) : null}

								{/* Block-level pro strip — the TrainingPeaks contribution. */}
								<div className="border-border/60 bg-muted/30 grid grid-cols-3 gap-2 border-t px-4 py-4">
									<BigStat
										label={`Block ${unit}`}
										value={
											meta.countsTowardLoad || cur === 'hours'
												? `${fromHours(blockTotal, cur)}`
												: '—'
										}
									/>
									<BigStat
										label="Peak week"
										value={
											meta.countsTowardLoad || cur === 'hours'
												? `${fromHours(peak, cur)}`
												: '—'
										}
									/>
									<BigStat
										label="Fitness"
										value={
											meta.countsTowardLoad
												? `${ctlGain >= 0 ? '+' : ''}${ctlGain.toFixed(1)}`
												: '±0'
										}
										sub="CTL over block"
									/>
								</div>

								{!meta.countsTowardLoad ? (
									<div className="border-border/60 bg-muted/40 text-muted-foreground flex items-start gap-2 border-t px-6 py-3 text-[13px]">
										<Icon name="info-circle" size="sm" className="mt-0.5" />
										<span>
											Strength carries no TSS. Hours only — it stays out of
											every load target and adds nothing to projected fitness.
										</span>
									</div>
								) : null}

								<div className="divide-border/60 border-border/60 divide-y border-t">
									<Row label="Focus">
										<div className="flex flex-wrap justify-end gap-1.5">
											{FOCUS_KEYS.map((f) => (
												<button
													key={f}
													type="button"
													onClick={() => store.setPhaseFocus(phase.id, f)}
													aria-pressed={phase.focus === f}
													className={cn(
														'rounded-full px-3 py-1.5 text-[13px] font-medium transition-transform active:scale-95',
														phase.focus === f
															? 'text-background'
															: 'bg-muted text-muted-foreground',
													)}
													style={
														phase.focus === f
															? { background: FOCUS[f].hue }
															: undefined
													}
												>
													{FOCUS[f].label}
												</button>
											))}
										</div>
									</Row>
									<Row label="Rhythm">
										<Segmented
											label="Rhythm"
											value={phase.rhythm}
											onChange={(r) => store.setPhaseRhythm(phase.id, r)}
											options={RHYTHMS.map((r) => ({
												key: r,
												label: r === 'none' ? 'Straight' : r,
											}))}
										/>
									</Row>
									<Row label="Length">
										<Stepper
											onDown={() =>
												store.updatePhase(phase.id, {
													weeks: Math.max(1, phase.weeks - 1),
												})
											}
											onUp={() =>
												store.updatePhase(phase.id, {
													weeks: Math.min(12, phase.weeks + 1),
												})
											}
										>
											<span className="text-lg font-medium tabular-nums">
												{phase.weeks} weeks
											</span>
										</Stepper>
									</Row>
									<div className="flex flex-wrap gap-2 px-6 py-4">
										<button
											type="button"
											onClick={() => setSheet({ swap: phase.id })}
											className="bg-muted rounded-full px-4 py-2 text-sm font-medium transition-transform active:scale-95"
										>
											Swap for a block template
										</button>
										<button
											type="button"
											onClick={() => store.movePhase(phase.id, -1)}
											className="bg-muted rounded-full px-4 py-2 text-sm font-medium transition-transform active:scale-95"
										>
											Move earlier
										</button>
										<button
											type="button"
											onClick={() => store.removePhase(phase.id)}
											className="text-foreground-destructive rounded-full px-4 py-2 text-sm font-medium transition-transform active:scale-95"
										>
											Remove
										</button>
									</div>
								</div>
							</article>
						)
					})}
				</div>
			) : (
				/* The pro grid — same data as variant D, laid out with air. */
				<div className="border-border/60 bg-card mt-5 overflow-hidden rounded-[1.5rem] border">
					<div className="border-border/60 text-muted-foreground hidden grid-cols-[3rem_1fr_5.5rem_6.5rem_4rem] items-center gap-3 border-b px-5 py-2.5 text-[10px] font-semibold tracking-[0.1em] uppercase sm:grid">
						<span>Wk</span>
						<span>Block &amp; role</span>
						<span className="text-right">Ramp</span>
						<span className="text-right">{unit}</span>
						<span className="text-right">CTL</span>
					</div>
					<ul className="divide-border/60 divide-y">
						{weeks.map((w, i) => {
							const ramp = rampPercent(weeks, i)
							const editable = w.role !== 'taper' && w.cycle === 1
							return (
								<li
									key={w.index}
									className={cn(
										// Phone: [wk][block + folded meta][target]. Desktop: the
										// full five columns. Ramp and CTL move into the block cell
										// rather than getting squeezed off the edge.
										'grid grid-cols-[2.75rem_1fr_5rem] items-center gap-3 px-4 py-3 transition-colors sm:grid-cols-[3rem_1fr_5.5rem_6.5rem_4rem] sm:px-5',
										inspected === i ? 'bg-muted/60' : '',
										w.role === 'recovery' ? 'bg-muted/25' : '',
										w.isPast ? 'opacity-55' : '',
									)}
									onMouseEnter={() => setInspected(i)}
								>
									<div>
										<div className="text-sm font-medium tabular-nums">
											{i + 1}
										</div>
										<div className="text-muted-foreground text-[11px] tabular-nums">
											{formatShortDate(w.startDate)}
										</div>
									</div>

									<div className="flex min-w-0 items-center gap-2">
										<span
											className="size-2.5 shrink-0 rounded-full"
											style={{ background: FOCUS[w.focus].hue }}
										/>
										<div className="min-w-0">
											<div className="flex items-center gap-1.5 truncate text-sm font-medium">
												{w.phaseName}
												{w.isCurrent ? (
													<span className="bg-foreground text-background rounded-full px-1.5 py-0.5 text-[9px] tracking-wide uppercase">
														now
													</span>
												) : null}
												{w.cycle > 1 ? (
													<span className="text-muted-foreground text-[11px]">
														↻{w.cycle}
													</span>
												) : null}
											</div>
											<div className="text-muted-foreground truncate text-[11px]">
												{w.role === 'recovery'
													? 'Recovery · −30%'
													: w.role === 'taper'
														? `Taper ${w.weekInPhase} of ${w.phaseWeeks}`
														: `Load ${w.loadNumber} of ${w.loadTotal}`}
												{!w.countsTowardLoad ? ' · no TSS' : ''}
											</div>
											{/* Phone only: the two columns there is no room for. */}
											<div className="text-muted-foreground mt-0.5 truncate text-[11px] tabular-nums sm:hidden">
												<span
													className={cn(
														ramp !== null && ramp > RAMP_HOT
															? 'text-foreground-destructive font-medium'
															: ramp !== null && ramp > RAMP_WARN
																? 'font-medium text-[var(--zone-4)]'
																: '',
													)}
												>
													{ramp === null
														? '— ramp'
														: `${ramp > 0 ? '+' : ''}${ramp}%`}
												</span>
												{' · '}
												{ctl[i]} CTL
											</div>
										</div>
									</div>

									<div
										className={cn(
											'hidden text-right text-[13px] tabular-nums sm:block',
											ramp !== null && ramp > RAMP_HOT
												? 'text-foreground-destructive font-medium'
												: ramp !== null && ramp > RAMP_WARN
													? 'font-medium text-[var(--zone-4)]'
													: 'text-muted-foreground',
										)}
									>
										{ramp === null ? '—' : `${ramp > 0 ? '+' : ''}${ramp}%`}
									</div>

									<div className="text-right">
										{editingCell === i && editable ? (
											<input
												autoFocus
												type="number"
												defaultValue={fromHours(w.hours, cur)}
												onBlur={(e) => {
													store.setWeekOverride(
														w.phaseId,
														w.weekInPhase,
														Number(e.target.value),
													)
													setEditingCell(null)
												}}
												onKeyDown={(e) => {
													if (e.key === 'Enter')
														(e.target as HTMLInputElement).blur()
													if (e.key === 'Escape') setEditingCell(null)
												}}
												aria-label={`Week ${i + 1} target`}
												className="border-foreground bg-background w-full rounded-lg border px-2 py-1 text-right text-base tabular-nums"
											/>
										) : (
											<button
												type="button"
												disabled={!editable}
												onClick={() => setEditingCell(i)}
												className={cn(
													'w-full rounded-lg px-2 py-1 text-right text-base font-medium tabular-nums transition-colors',
													editable
														? 'hover:bg-muted active:scale-95'
														: 'text-muted-foreground cursor-default',
												)}
											>
												{w.countsTowardLoad || cur === 'hours'
													? fromHours(w.hours, cur)
													: '—'}
												{w.overridden ? (
													<span className="text-primary ml-1">•</span>
												) : null}
											</button>
										)}
									</div>

									<div className="text-muted-foreground hidden text-right text-[13px] tabular-nums sm:block">
										{ctl[i]}
									</div>
								</li>
							)
						})}
					</ul>
					<p className="border-border/60 text-muted-foreground border-t px-5 py-3 text-[11px]">
						Tap any target to type a new one. Conversions use ≈
						{TSS_PER_ENDURANCE_HOUR} TSS per endurance hour and 10 km/h easy
						pace.
					</p>
				</div>
			)}

			{/* End of the plan: taper, or the loop mark. */}
			<div className="mt-3">
				{plan.anchor.kind === 'ongoing' ? (
					<div className="border-border rounded-2xl border border-dashed px-5 py-6 text-center">
						<Icon
							name="update"
							size="lg"
							className="text-muted-foreground mx-auto mb-2"
						/>
						<p className="text-base font-medium">…and back to the top</p>
						<p className="text-muted-foreground mt-1 text-[13px]">
							{plan.phases.length} blocks repeat every {derived.cycleWeeks}{' '}
							weeks. Showing {plan.cyclesShown} cycles.
						</p>
						<div className="mt-4 flex flex-wrap justify-center gap-2">
							<button
								type="button"
								onClick={() => store.setCyclesShown(plan.cyclesShown + 1)}
								className="bg-muted rounded-full px-4 py-2 text-sm font-medium transition-transform active:scale-95"
							>
								Show another cycle
							</button>
							<button
								type="button"
								onClick={() =>
									store.attachRace(
										store.seedEvent.name,
										store.seedEvent.date ??
											new Date(Date.now() + 84 * 864e5)
												.toISOString()
												.slice(0, 10),
									)
								}
								className="bg-foreground text-background rounded-full px-5 py-2 text-sm font-medium transition-transform active:scale-95"
							>
								Attach a race
							</button>
						</div>
					</div>
				) : (
					<div className="border-border/60 bg-card rounded-2xl border px-5 py-4">
						<div className="flex flex-wrap items-center gap-4">
							<span className="bg-muted-foreground/40 h-10 w-1.5 shrink-0 rounded-full" />
							<div className="min-w-0 flex-1">
								<p className="text-base font-medium">Taper</p>
								<p className="text-muted-foreground text-[13px]">
									Volume only. Intensity is held.
								</p>
							</div>
							<Stepper
								onDown={() => store.setTaperWeeks(plan.taperWeeks - 1)}
								onUp={() => store.setTaperWeeks(plan.taperWeeks + 1)}
							>
								<span className="text-base font-medium tabular-nums">
									{plan.taperWeeks} wk
								</span>
							</Stepper>
						</div>
					</div>
				)}
			</div>

			<div className="mt-8 flex flex-col gap-3">
				<button
					type="button"
					onClick={() => setSheet('block')}
					className="bg-foreground text-background flex items-center justify-center gap-2 rounded-full px-5 py-3.5 text-base font-medium transition-transform active:scale-[0.98]"
				>
					<Icon name="plus" size="sm" /> Add a block
				</button>
				<button
					type="button"
					onClick={() => setSheet('season')}
					className="bg-muted rounded-full px-5 py-3.5 text-base font-medium transition-transform active:scale-[0.98]"
				>
					Start over from a season template
				</button>
			</div>

			{store.whisper ? (
				<p
					key={store.whisper.id}
					role="status"
					className="text-muted-foreground mt-6 text-center text-[13px]"
				>
					{store.whisper.text}
				</p>
			) : null}

			{/* Sheets ------------------------------------------------------ */}
			{sheet === 'anchor' ? (
				<Sheet
					title="What are you building toward?"
					subtitle="One question. You can change it any time."
					onClose={() => setSheet(null)}
				>
					<div className="space-y-3">
						<Choice
							title={store.seedEvent.name}
							detail={`A race on ${formatShortDate(store.seedEvent.date)}`}
							icon="calendar"
							selected={plan.anchor.kind === 'event'}
							onClick={() => {
								store.setAnchor({
									kind: 'event',
									name: store.seedEvent.name,
									date: store.seedEvent.date,
								})
								setSheet(null)
							}}
						/>
						<Choice
							title="A fitness goal"
							detail="Creates a fitness-goal Event to anchor the plan"
							icon="bar-chart"
							selected={plan.anchor.kind === 'goal'}
							onClick={() => {
								store.setAnchor({
									kind: 'goal',
									name: 'Sub-40 10k shape',
									date: new Date(Date.now() + 98 * 864e5)
										.toISOString()
										.slice(0, 10),
								})
								setSheet(null)
							}}
						/>
						<Choice
							title="Nothing in particular"
							detail="Blocks that repeat, with no finish line"
							icon="update"
							selected={plan.anchor.kind === 'ongoing'}
							onClick={() => {
								store.goOngoing()
								setSheet(null)
							}}
						/>
					</div>
				</Sheet>
			) : null}

			{sheet === 'season' ? (
				<Sheet
					title="Season templates"
					subtitle="Picking one copies it in. It becomes yours — no link back."
					onClose={() => setSheet(null)}
				>
					<div className="space-y-3">
						{SEASON_TEMPLATES.map((t) => (
							<Choice
								key={t.key}
								title={t.name}
								detail={t.blurb}
								icon={t.anchorKind === 'ongoing' ? 'update' : 'file-text'}
								selected={false}
								onClick={() => {
									store.applySeasonTemplate(t.key)
									setSheet(null)
								}}
							/>
						))}
					</div>
				</Sheet>
			) : null}

			{sheet === 'block' || (sheet && typeof sheet === 'object') ? (
				<Sheet
					title="Block templates"
					subtitle="Copied in, fully editable, never linked."
					onClose={() => setSheet(null)}
				>
					<div className="space-y-3">
						{BLOCK_TEMPLATES.map((t) => (
							<Choice
								key={t.key}
								title={t.name}
								detail={t.blurb}
								icon={t.focus === 'strength' ? 'barbell' : 'clock'}
								selected={false}
								onClick={() => {
									if (sheet && typeof sheet === 'object')
										store.replacePhaseWithTemplate(sheet.swap, t)
									else store.appendBlockTemplate(t)
									setSheet(null)
								}}
							/>
						))}
					</div>
				</Sheet>
			) : null}
		</div>
	)
}

function Metric({
	label,
	value,
	tone,
}: {
	label: string
	value: string
	tone?: 'warn' | 'hot'
}) {
	return (
		<div className="flex items-baseline justify-between gap-2 sm:block">
			<dt className="text-muted-foreground text-[11px] tracking-wide uppercase">
				{label}
			</dt>
			<dd
				className={cn(
					'font-medium tabular-nums',
					tone === 'hot'
						? 'text-foreground-destructive'
						: tone === 'warn'
							? 'text-[var(--zone-4)]'
							: '',
				)}
			>
				{value}
			</dd>
		</div>
	)
}

function Row({
	label,
	children,
}: {
	label: string
	children: React.ReactNode
}) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
			<span className="text-muted-foreground text-sm font-medium">{label}</span>
			{children}
		</div>
	)
}

function Choice({
	title,
	detail,
	icon,
	selected,
	onClick,
}: {
	title: string
	detail: string
	icon: 'calendar' | 'bar-chart' | 'update' | 'file-text' | 'clock' | 'barbell'
	selected: boolean
	onClick: () => void
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				'flex w-full items-center gap-4 rounded-2xl border px-5 py-4 text-left transition-all duration-150 active:scale-[0.98]',
				selected ? 'border-foreground bg-muted' : 'border-border bg-card',
			)}
		>
			<span className="bg-muted grid size-11 shrink-0 place-items-center rounded-full">
				<Icon name={icon} size="md" />
			</span>
			<span className="min-w-0 flex-1">
				<span className="block text-base font-medium">{title}</span>
				<span className="text-muted-foreground block text-[13px]">
					{detail}
				</span>
			</span>
			{selected ? <Icon name="check" size="md" /> : null}
		</button>
	)
}
