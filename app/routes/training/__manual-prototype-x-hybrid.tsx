/**
 * PROTOTYPE — throwaway. Variant E: "Apple shell, TrainingPeaks instrumentation".
 *
 * Keeps Apple's posture — one thing at a time, generous whitespace, big calm
 * numerals, rings, sheets, progressive disclosure — and carries the pro tool's
 * substance: a layered season chart as the primary object, tap-to-inspect with
 * the readout below it (ADR 0030), directly editable per-week targets, a ramp
 * guard that fixes the cause rather than the symptom, and projected fitness per
 * week and per block.
 *
 * Three revisions after the first pass, all from review:
 *
 *  1. **Templates at three levels, picked by shape.** Season, Block and Week
 *     Pattern, each rendered as an illustration of what it will produce rather
 *     than a sentence describing it. All three are apply-then-own.
 *  2. **The season chart is layered.** Volume, fitness, rhythm, ramp and focus
 *     stack on one time axis and toggle independently — and Form declines
 *     honestly instead of drawing a curve the plan can't support.
 *  3. **Tabs only where they're navigation.** Blocks and Weeks are genuinely
 *     different content with different jobs, so they get the tab. The
 *     km/h/TSS control was tab-shaped but wasn't navigation — it changed the
 *     *language* of the same content — so it's gone. Conversions are
 *     multiplication, so every unit is simply always shown; the plan's chosen
 *     currency only decides which one is big and which one the inputs edit.
 *     That choice now lives on the season total it describes, one tap away.
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
	BlockSpark,
	PatternSpark,
	SeasonSpark,
} from './__manual-prototype-x-illustrations.tsx'
import {
	BLOCK_TEMPLATES,
	CURRENCIES,
	CURRENCY_LABEL,
	CURRENCY_UNIT,
	FOCUS,
	FOCUS_KEYS,
	formatShortDate,
	fromHours,
	patternByKey,
	patternGymHours,
	type PlannedWeek,
	projectCtl,
	rampPercent,
	RHYTHMS,
	SEASON_TEMPLATES,
	stampWeek,
	WEEK_TEMPLATES,
	weeksUntil,
	zoneHue,
} from './__manual-prototype-x-model.ts'
import {
	ChartScale,
	FormLayerNotice,
	type LayerKey,
	LayerChips,
	SeasonChart,
} from './__manual-prototype-x-season-chart.tsx'
import { type PlanStore } from './__manual-prototype-x-state.ts'

export const HYBRID_NAME = 'Apple × TrainingPeaks'

const RAMP_WARN = 8
const RAMP_HOT = 12
const START_CTL = 48

type SheetState =
	| null
	| { kind: 'anchor' }
	| { kind: 'templates'; phaseId: string | null }
	| { kind: 'language' }

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

/** A template row: the picture first, the words second. */
function TemplateRow({
	art,
	title,
	detail,
	onClick,
	selected,
}: {
	art: React.ReactNode
	title: string
	detail: string
	onClick: () => void
	selected?: boolean
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				'flex w-full items-center gap-4 rounded-2xl border px-4 py-3.5 text-left transition-all duration-150 active:scale-[0.98]',
				selected ? 'border-foreground bg-muted' : 'border-border bg-card',
			)}
		>
			<span className="grid w-[116px] shrink-0 place-items-center">{art}</span>
			<span className="min-w-0 flex-1">
				<span className="block text-[15px] font-medium">{title}</span>
				<span className="text-muted-foreground block text-[13px]">{detail}</span>
			</span>
			{selected ? <Icon name="check" size="md" className="shrink-0" /> : null}
		</button>
	)
}

/** The stamped Week Pattern for one Training Week, scaled to its target. */
function StampedWeekStrip({
	patternKey,
	hours,
	currency,
}: {
	patternKey: string
	hours: number
	currency: 'km' | 'hours' | 'tss'
}) {
	const pattern = patternByKey(patternKey)
	if (!pattern) return null
	const days = stampWeek(pattern, hours)
	const max = Math.max(...days.map((d) => d.hours), 0.01)
	const gym = patternGymHours(days)
	return (
		<div className="bg-muted/40 mt-2 rounded-xl px-3 py-3">
			<p className="text-muted-foreground mb-2 text-[11px]">
				Stamped from “{pattern.name}” — these become standalone sessions.
			</p>
			<div className="flex items-end gap-1.5">
				{days.map((d, i) => (
					<div key={i} className="flex min-w-0 flex-1 flex-col items-center">
						<span className="text-muted-foreground mb-1 text-[10px] tabular-nums">
							{d.hours === 0
								? ''
								: d.strength
									? // Gym days have no km and no TSS — only clock time.
										`${fromHours(d.hours, 'hours')}h`
									: currency === 'tss'
										? (d.tss ?? '—')
										: fromHours(d.hours, currency)}
						</span>
						{d.hours > 0 ? (
							<span
								className="w-full rounded-sm"
								style={{
									height: `${Math.max(8, (d.hours / max) * 40)}px`,
									background: zoneHue(d.zone),
									opacity: d.strength ? 0.45 : 0.9,
									border: d.strength
										? '1.5px dashed var(--muted-foreground)'
										: undefined,
								}}
							/>
						) : (
							<span className="bg-muted-foreground/25 h-1 w-full rounded-full" />
						)}
						<span className="text-muted-foreground mt-1 truncate text-[9px]">
							{d.label}
						</span>
					</div>
				))}
			</div>
			{gym > 0 ? (
				<p className="text-muted-foreground mt-2 text-[11px]">
					Plus {gym} h in the gym — no TSS, no distance, so the week’s target is
					met by the other{' '}
					{days.filter((d) => !d.strength && d.hours > 0).length} sessions.
				</p>
			) : null}
		</div>
	)
}

// ---------------------------------------------------------------------------

export function VariantHybrid({ store }: { store: PlanStore }) {
	const { plan, derived } = store
	const [layers, setLayers] = useState<LayerKey[]>([
		'volume',
		'fitness',
		'rhythm',
		'focus',
	])
	const [mode, setMode] = useState<'blocks' | 'weeks'>('blocks')
	const [inspected, setInspected] = useState<number | null>(null)
	const [showAllMetrics, setShowAllMetrics] = useState(false)
	const [openPhases, setOpenPhases] = useState<string[]>(() =>
		plan.phases[1] ? [plan.phases[1].id] : plan.phases[0] ? [plan.phases[0].id] : [],
	)
	const [selectedWeek, setSelectedWeek] = useState(1)
	const [openWeek, setOpenWeek] = useState<number | null>(null)
	const [editingCell, setEditingCell] = useState<number | null>(null)
	const [sheet, setSheet] = useState<SheetState>(null)

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

	function toggleLayer(k: LayerKey) {
		setLayers((ls) => (ls.includes(k) ? ls.filter((l) => l !== k) : [...ls, k]))
	}
	function togglePhase(id: string) {
		setOpenPhases((ps) =>
			ps.includes(id) ? ps.filter((p) => p !== id) : [...ps, id],
		)
	}

	// The ramp guard distinguishes a spike inside a block from a block that
	// simply opens above where the previous one left off — the latter needs the
	// block moved, not the week, or the cliff just shifts a week later.
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
				w.weekInPhase === 1 && w.role !== 'taper' && prev?.phaseId !== w.phaseId,
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

	const sheetPhase =
		sheet && sheet.kind === 'templates' && sheet.phaseId
			? plan.phases.find((p) => p.id === sheet.phaseId)
			: undefined

	return (
		<div className="mx-auto w-full max-w-2xl px-5 pb-40">
			{/* One question, asked large. */}
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
					onClick={() => setSheet({ kind: 'anchor' })}
					className="bg-muted mt-5 rounded-full px-5 py-2.5 text-sm font-medium transition-transform active:scale-95"
				>
					Change what you’re building toward
				</button>
			</section>

			{/* The season, in layers. */}
			<section className="border-border/60 bg-card rounded-[1.75rem] border px-4 pt-5 pb-4">
				<div className="mb-3 flex items-baseline justify-between px-1">
					<h2 className="text-sm font-medium">The season</h2>
					<span className="text-muted-foreground text-[11px]">
						{derived.totalWeeks} training weeks
					</span>
				</div>

				<SeasonChart
					weeks={weeks}
					ctl={ctl}
					layers={layers}
					selected={inspected}
					onSelect={(i) => {
						setInspected(i)
						setEditingCell(null)
					}}
					currentIndex={derived.currentIndex}
					raceName={plan.anchor.kind === 'ongoing' ? null : plan.anchor.name}
					repeatFrom={repeatFrom}
				/>

				<ChartScale
					layers={layers}
					maxVolume={Math.max(...weeks.map((w) => w.hours), 0)}
					maxCtl={Math.max(...ctl)}
					currency={cur}
				/>

				<div className="mt-3">
					<LayerChips active={layers} onToggle={toggleLayer} />
					{layers.includes('form') ? <FormLayerNotice /> : null}
				</div>

				{/* Inspect below the chart, never a tooltip. */}
				<div className="bg-muted/50 mt-3 rounded-2xl px-4 py-4">
					{iw ? (
						<>
							<div className="flex items-baseline justify-between gap-3">
								<div className="min-w-0">
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
								<div className="shrink-0 text-right">
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
									<Metric
										label="Week pattern"
										value={
											patternByKey(
												plan.phases.find((p) => p.id === iw.phaseId)?.pattern ??
													null,
											)?.name ?? 'None'
										}
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

			{/* The ramp guard, as one sentence with the right fix attached. */}
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

			{/* Season totals. The plan's language lives here, on the number it
			    describes — not in a tab-shaped control at the top of the page. */}
			<section className="border-border/60 bg-card mt-6 grid grid-cols-3 gap-2 rounded-[1.5rem] border px-4 py-5">
				<button
					type="button"
					onClick={() => setSheet({ kind: 'language' })}
					className="hover:bg-muted/60 -m-2 rounded-2xl p-2 text-center transition-colors active:scale-[0.98]"
				>
					<div className="text-2xl font-semibold tracking-tight tabular-nums">
						{fromHours(derived.loadHours, cur)}
						<span className="text-muted-foreground ml-1 text-base font-normal">
							{unit}
						</span>
					</div>
					<div className="text-muted-foreground mt-0.5 inline-flex items-center gap-1 text-[11px] tracking-wide uppercase">
						Season total
						<Icon name="chevron-down" size="xs" />
					</div>
					{/* Conversions are multiplication — there is no reason to hide
					    them behind a mode. */}
					<div className="text-muted-foreground text-[11px] tabular-nums">
						{CURRENCIES.filter((c) => c !== cur)
							.map(
								(c) => `${fromHours(derived.loadHours, c)} ${CURRENCY_UNIT[c]}`,
							)
							.join(' · ')}
					</div>
				</button>
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

			{/* The one tab that earns the shape: different content, different job.
			    Blocks shapes the season, Weeks audits it. */}
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
						const open = openPhases.includes(phase.id)
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
						const pattern = patternByKey(phase.pattern)

						return (
							<article
								key={phase.id}
								className={cn(
									'border-border/60 bg-card overflow-hidden rounded-[1.75rem] border transition-shadow',
									open ? 'shadow-sm' : '',
								)}
							>
								<button
									type="button"
									onClick={() => togglePhase(phase.id)}
									aria-expanded={open}
									className="flex w-full items-center gap-4 px-5 py-4 text-left transition-transform active:scale-[0.995]"
								>
									<span
										className="h-11 w-1.5 shrink-0 rounded-full"
										style={{ background: meta.hue }}
									/>
									<span className="min-w-0 flex-1">
										<span className="block truncate text-base font-medium">
											{phase.name}
										</span>
										<span className="text-muted-foreground block truncate text-[13px] tabular-nums">
											{phase.weeks} wk · {meta.label} ·{' '}
											{meta.countsTowardLoad
												? `${fromHours(blockTotal, cur)} ${unit} · CTL ${ctlGain >= 0 ? '+' : ''}${ctlGain.toFixed(1)}`
												: `${fromHours(blockTotal, 'hours')} h, no TSS`}
										</span>
									</span>
									<span className="flex h-10 items-end gap-[3px]" aria-hidden>
										{pw.map((w) => (
											<span
												key={w.index}
												className="w-[5px] rounded-full"
												style={{
													height: `${8 + 24 * (w.hours / (peak || 1))}px`,
													background: w.role === 'load' ? meta.hue : meta.ring,
												}}
											/>
										))}
									</span>
									<Icon
										name={open ? 'chevron-up' : 'chevron-down'}
										size="sm"
										className="text-muted-foreground shrink-0"
									/>
								</button>

								{open ? (
									<>
										<div className="relative grid place-items-center pt-1">
											<WeekRing
												weeks={pw}
												focus={phase.focus}
												selected={selectedWeek}
												onSelect={(w) => {
													setSelectedWeek(w)
													const abs = pw.find((x) => x.weekInPhase === w)
													if (abs) setInspected(abs.index)
												}}
												size={200}
											/>
											<div className="pointer-events-none absolute grid place-items-center text-center">
												<div className="text-3xl font-semibold tracking-tight tabular-nums">
													{sel
														? sel.countsTowardLoad || cur === 'hours'
															? fromHours(sel.hours, cur)
															: '—'
														: '—'}
												</div>
												<div className="text-muted-foreground text-[11px] tracking-wide uppercase">
													{unit} · wk {selectedWeek}
												</div>
											</div>
										</div>

										{sel ? (
											<p className="text-muted-foreground px-6 pb-3 text-center text-[13px] tabular-nums">
												{sel.countsTowardLoad
													? CURRENCIES.filter((c) => c !== cur)
															.map(
																(c) =>
																	`${fromHours(sel.hours, c)} ${CURRENCY_UNIT[c]}`,
															)
															.join('  ·  ')
													: `${fromHours(sel.hours, 'hours')} h in the gym — no TSS, no distance`}
											</p>
										) : null}

										<div className="grid grid-cols-3 gap-2 px-4 pb-4">
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

										{/* Level 3 in place: the Week Pattern stamped on this block. */}
										<div className="border-border/60 flex flex-wrap items-center gap-4 border-t px-5 py-4">
											<div className="min-w-0 flex-1">
												<p className="text-muted-foreground text-[11px] tracking-wide uppercase">
													Week pattern
												</p>
												<p className="text-sm font-medium">
													{pattern ? pattern.name : 'None stamped'}
												</p>
												<p className="text-muted-foreground text-[13px]">
													{pattern
														? 'Copied into every week of this block. No link back.'
														: 'Weeks carry a target but no shape yet.'}
												</p>
											</div>
											{pattern ? (
												<PatternSpark template={pattern} height={36} showDays />
											) : null}
											<button
												type="button"
												onClick={() =>
													setSheet({ kind: 'templates', phaseId: phase.id })
												}
												className="bg-muted rounded-full px-4 py-2 text-sm font-medium transition-transform active:scale-95"
											>
												{pattern ? 'Change' : 'Stamp one'}
											</button>
										</div>

										{!meta.countsTowardLoad ? (
											<div className="text-muted-foreground border-border/60 bg-muted/40 flex items-start gap-2 border-t px-6 py-3 text-[13px]">
												<Icon name="info-circle" size="sm" className="mt-0.5" />
												<span>
													Strength carries no TSS. Hours only — out of every
													load target, and it adds nothing to projected fitness.
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
											<Row label={`Opening week (${unit})`}>
												<Stepper
													onDown={() =>
														store.nudgePhaseVolume(
															phase.id,
															cur === 'hours' ? -0.5 : cur === 'km' ? -5 : -30,
														)
													}
													onUp={() =>
														store.nudgePhaseVolume(
															phase.id,
															cur === 'hours' ? 0.5 : cur === 'km' ? 5 : 30,
														)
													}
												>
													<span className="text-lg font-medium tabular-nums">
														{meta.countsTowardLoad || cur === 'hours'
															? fromHours(phase.baseHours, cur)
															: '—'}
													</span>
												</Stepper>
											</Row>
											<div className="flex flex-wrap gap-2 px-6 py-4">
												<button
													type="button"
													onClick={() =>
														setSheet({ kind: 'templates', phaseId: phase.id })
													}
													className="bg-muted rounded-full px-4 py-2 text-sm font-medium transition-transform active:scale-95"
												>
													Templates for this block
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
									</>
								) : null}
								<span className="sr-only">Block {i + 1}</span>
							</article>
						)
					})}
				</div>
			) : (
				/* Weeks: the audit view. Every unit is a column, so nothing is
				   hidden behind the plan's chosen language. */
				<div className="border-border/60 bg-card mt-5 overflow-hidden rounded-[1.5rem] border">
					<div className="border-border/60 text-muted-foreground hidden grid-cols-[2.75rem_1fr_4.5rem_6rem_4rem_4rem_3.5rem] items-center gap-3 border-b px-5 py-2.5 text-[10px] font-semibold tracking-[0.1em] uppercase sm:grid">
						<span>Wk</span>
						<span>Role &amp; pattern</span>
						<span className="text-right">Ramp</span>
						<span className="text-right">{unit}</span>
						{CURRENCIES.filter((c) => c !== cur).map((c) => (
							<span key={c} className="text-right font-normal">
								{CURRENCY_UNIT[c]}
							</span>
						))}
						<span className="text-right">CTL</span>
					</div>
					<ul className="divide-border/60 divide-y">
						{weeks.map((w, i) => {
							const ramp = rampPercent(weeks, i)
							const editable = w.role !== 'taper' && w.cycle === 1
							const weekOpen = openWeek === w.index
							const phase = plan.phases.find((p) => p.id === w.phaseId)
							const newBlock = i === 0 || weeks[i - 1]?.phaseId !== w.phaseId
							return (
								<li key={w.index}>
									{newBlock ? (
										<div className="bg-muted/40 flex items-center gap-2 px-5 py-1.5">
											<span
												className="size-2 rounded-full"
												style={{ background: FOCUS[w.focus].hue }}
											/>
											<span className="text-[11px] font-semibold tracking-wide uppercase">
												{w.phaseName}
											</span>
											<span className="text-muted-foreground text-[11px]">
												{FOCUS[w.focus].label}
												{w.cycle > 1 ? ` · cycle ${w.cycle}` : ''}
											</span>
										</div>
									) : null}
									<div className="px-4 py-3">
										<div
											className={cn(
												'grid grid-cols-[2.75rem_1fr_6rem] items-center gap-3 sm:grid-cols-[2.75rem_1fr_4.5rem_6rem_4rem_4rem_3.5rem]',
												w.isPast ? 'opacity-55' : '',
											)}
										>
											<button
												type="button"
												onClick={() => setOpenWeek(weekOpen ? null : w.index)}
												aria-expanded={weekOpen}
												aria-label={`Week ${i + 1} days`}
												className="text-left"
											>
												<span className="block text-sm font-medium tabular-nums">
													{i + 1}
												</span>
												<span className="text-muted-foreground block text-[11px] tabular-nums">
													{formatShortDate(w.startDate)}
												</span>
											</button>

											<div className="min-w-0">
												<div className="flex items-center gap-1.5 text-[13px] font-medium">
													{w.role === 'recovery'
														? 'Recovery'
														: w.role === 'taper'
															? `Taper ${w.weekInPhase} of ${w.phaseWeeks}`
															: `Load ${w.loadNumber} of ${w.loadTotal}`}
													{w.isCurrent ? (
														<span className="bg-foreground text-background rounded-full px-1.5 py-0.5 text-[9px] tracking-wide uppercase">
															now
														</span>
													) : null}
												</div>
												<div className="text-muted-foreground truncate text-[11px] tabular-nums">
													{/* Phone: only the audit signals fit — ramp, fitness, and
													    hours, the one unit every block can speak. The
													    pattern name waits for a wider screen. */}
													<span className="sm:hidden">
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
														{` · ${ctl[i]} CTL`}
														{cur !== 'hours'
															? ` · ${fromHours(w.hours, 'hours')} h`
															: ''}
													</span>
													<span className="hidden sm:inline">
														{phase?.pattern
															? patternByKey(phase.pattern)?.name
															: 'no pattern'}
													</span>
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
												{editingCell === w.index && editable ? (
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
														onClick={() => setEditingCell(w.index)}
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

											{CURRENCIES.filter((c) => c !== cur).map((c) => (
												<div
													key={c}
													className="text-muted-foreground hidden text-right text-[13px] tabular-nums sm:block"
												>
													{w.countsTowardLoad || c === 'hours'
														? fromHours(w.hours, c)
														: '—'}
												</div>
											))}

											<div className="text-muted-foreground hidden text-right text-[13px] tabular-nums sm:block">
												{ctl[i]}
											</div>
										</div>

										{weekOpen && phase?.pattern ? (
											<StampedWeekStrip
												patternKey={phase.pattern}
												hours={w.hours}
												currency={cur}
											/>
										) : null}
										{weekOpen && !phase?.pattern ? (
											<p className="text-muted-foreground bg-muted/40 mt-2 rounded-xl px-3 py-3 text-[13px]">
												No Week Pattern stamped on {w.phaseName} yet — this week
												has a target but no shape.
											</p>
										) : null}
									</div>
								</li>
							)
						})}
					</ul>
					<p className="border-border/60 text-muted-foreground border-t px-5 py-3 text-[11px]">
						Tap a target to type a new one; tap a week number to see its days.
						Every unit is shown — the plan’s language only decides which one
						you edit.
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

			<div className="mt-8">
				<button
					type="button"
					onClick={() => setSheet({ kind: 'templates', phaseId: null })}
					className="bg-foreground text-background flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-base font-medium transition-transform active:scale-[0.98]"
				>
					<Icon name="file-text" size="sm" /> Templates
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
			{sheet?.kind === 'language' ? (
				<Sheet
					title="What this plan speaks"
					subtitle="Every unit is always shown. This only decides which one is big — and which one you type into."
					onClose={() => setSheet(null)}
				>
					<div className="space-y-3">
						{CURRENCIES.map((c) => (
							<button
								key={c}
								type="button"
								onClick={() => {
									store.setCurrency(c)
									setSheet(null)
								}}
								className={cn(
									'flex w-full items-center gap-4 rounded-2xl border px-5 py-4 text-left transition-all duration-150 active:scale-[0.98]',
									cur === c
										? 'border-foreground bg-muted'
										: 'border-border bg-card',
								)}
							>
								<span className="min-w-0 flex-1">
									<span className="block text-base font-medium">
										{CURRENCY_LABEL[c]}
									</span>
									<span className="text-muted-foreground block text-[13px]">
										{c === 'km'
											? 'How a runner thinks about a week'
											: c === 'hours'
												? 'The only unit every block can speak, gym included'
												: 'What the load model actually counts'}
									</span>
								</span>
								{/* Live preview: this season, in that language. */}
								<span className="shrink-0 text-right">
									<span className="block text-xl font-semibold tracking-tight tabular-nums">
										{fromHours(derived.loadHours, c)}
									</span>
									<span className="text-muted-foreground block text-[11px] tracking-wide uppercase">
										{CURRENCY_UNIT[c]} this season
									</span>
								</span>
								{cur === c ? <Icon name="check" size="md" /> : null}
							</button>
						))}
					</div>

					<div className="text-muted-foreground mt-5 flex items-start gap-2 rounded-2xl bg-muted/60 px-4 py-3 text-[13px]">
						<Icon name="info-circle" size="sm" className="mt-0.5 shrink-0" />
						<span>
							Strength blocks have no distance and no TSS, so they read “—” in
							km and TSS wherever they appear.{' '}
							{derived.unloadedHours > 0
								? `This plan has ${derived.unloadedHours} h of them.`
								: 'This plan has none yet.'}{' '}
							Hours is the only language the whole plan can speak.
						</span>
					</div>
				</Sheet>
			) : null}

			{sheet?.kind === 'anchor' ? (
				<Sheet
					title="What are you building toward?"
					subtitle="One question. You can change it any time."
					onClose={() => setSheet(null)}
				>
					<div className="space-y-3">
						<TemplateRow
							art={<Icon name="calendar" size="lg" />}
							title={store.seedEvent.name}
							detail={`A race on ${formatShortDate(store.seedEvent.date)}`}
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
						<TemplateRow
							art={<Icon name="bar-chart" size="lg" />}
							title="A fitness goal"
							detail="Creates a fitness-goal Event to anchor the plan"
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
						<TemplateRow
							art={<Icon name="update" size="lg" />}
							title="Nothing in particular"
							detail="Blocks that repeat, with no finish line"
							selected={plan.anchor.kind === 'ongoing'}
							onClick={() => {
								store.goOngoing()
								setSheet(null)
							}}
						/>
					</div>
				</Sheet>
			) : null}

			{sheet?.kind === 'templates' ? (
				<Sheet
					title={sheetPhase ? `Templates for ${sheetPhase.name}` : 'Templates'}
					subtitle="Three levels, one rule: picking one copies it in. It becomes yours — nothing stays linked."
					onClose={() => setSheet(null)}
				>
					<div className="space-y-8">
						<section>
							<TemplateHeading
								n={1}
								title="Season"
								detail="The whole macro — replaces every block below."
							/>
							<div className="space-y-2">
								{SEASON_TEMPLATES.map((t) => (
									<TemplateRow
										key={t.key}
										art={<SeasonSpark template={t} />}
										title={t.name}
										detail={`${t.blocks.map((b) => `${b.weeks}w`).join(' + ')}${t.taperWeeks ? ` + ${t.taperWeeks}w taper` : ''} · ${t.blurb}`}
										onClick={() => {
											store.applySeasonTemplate(t.key)
											setSheet(null)
										}}
									/>
								))}
							</div>
						</section>

						<section>
							<TemplateHeading
								n={2}
								title="Block"
								detail={
									sheetPhase
										? `Swaps ${sheetPhase.name} for this shape.`
										: 'Adds one Plan Outline phase to the end.'
								}
							/>
							<div className="space-y-2">
								{BLOCK_TEMPLATES.map((t) => (
									<TemplateRow
										key={t.key}
										art={<BlockSpark template={t} />}
										title={t.name}
										detail={t.blurb}
										onClick={() => {
											if (sheetPhase)
												store.replacePhaseWithTemplate(sheetPhase.id, t)
											else store.appendBlockTemplate(t)
											setSheet(null)
										}}
									/>
								))}
							</div>
						</section>

						<section>
							<TemplateHeading
								n={3}
								title="Week pattern"
								detail={
									sheetPhase
										? `Stamped across all ${sheetPhase.weeks} weeks of ${sheetPhase.name}, scaled to each week's target.`
										: 'Stamped across every block, scaled to each week’s target.'
								}
							/>
							<div className="space-y-2">
								{WEEK_TEMPLATES.map((t) => (
									<TemplateRow
										key={t.key}
										art={<PatternSpark template={t} showDays />}
										title={t.name}
										detail={t.blurb}
										selected={sheetPhase?.pattern === t.key}
										onClick={() => {
											if (sheetPhase) store.stampPattern(sheetPhase.id, t.key)
											else store.stampPatternEverywhere(t.key)
											setSheet(null)
										}}
									/>
								))}
								{sheetPhase?.pattern ? (
									<button
										type="button"
										onClick={() => {
											store.clearPattern(sheetPhase.id)
											setSheet(null)
										}}
										className="text-muted-foreground w-full rounded-2xl px-4 py-3 text-[13px] underline underline-offset-4"
									>
										Remove the pattern from {sheetPhase.name}
									</button>
								) : null}
							</div>
						</section>
					</div>
				</Sheet>
			) : null}
		</div>
	)
}

function TemplateHeading({
	n,
	title,
	detail,
}: {
	n: number
	title: string
	detail: string
}) {
	return (
		<div className="mb-3 flex items-start gap-3">
			<span className="bg-foreground text-background grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold">
				{n}
			</span>
			<div className="min-w-0">
				<h3 className="text-base font-semibold tracking-tight">{title}</h3>
				<p className="text-muted-foreground text-[13px]">{detail}</p>
			</div>
		</div>
	)
}
