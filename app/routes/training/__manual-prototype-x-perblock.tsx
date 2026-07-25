/**
 * PROTOTYPE — throwaway. Variant F: "Per-block currency".
 *
 * Same shell as variant E, one change to the model underneath it: the volume
 * currency is a property of the **block**, not the plan. An endurance block
 * speaks km, a VO2max block speaks TSS, a strength block can only speak hours
 * — and says so, with the control locked rather than showing a row of "—".
 *
 * The cost this variant exists to expose: once blocks disagree about units, a
 * few things have to be reconciled somewhere, and every one of them lands on
 * **hours**, the only unit every block can express.
 *
 *   · the season total, and therefore the headline number
 *   · the chart's y axis, so bars stay comparable across blocks
 *   · the week-over-week ramp, which is meaningless across mixed units
 *
 * TSS and km are still shown, but only ever as "across the load-bearing
 * weeks", because strength contributes to neither.
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
	CURRENCY_UNIT,
	type Currency,
	currencyLocked,
	FOCUS,
	FOCUS_KEYS,
	formatShortDate,
	fromHours,
	patternByKey,
	phaseCurrency,
	type PlannedWeek,
	projectCtl,
	rampPercent,
	RHYTHMS,
	SEASON_TEMPLATES,
	toHours,
	TSS_PER_ENDURANCE_HOUR,
	WEEK_TEMPLATES,
	weeksUntil,
} from './__manual-prototype-x-model.ts'
import {
	ChartScale,
	FormLayerNotice,
	type LayerKey,
	LayerChips,
	SeasonChart,
} from './__manual-prototype-x-season-chart.tsx'
import { type PlanStore } from './__manual-prototype-x-state.ts'
import { StampedWeekStrip } from './__manual-prototype-x-week-strip.tsx'

export const PERBLOCK_NAME = 'Per-block currency'

const RAMP_WARN = 8
const RAMP_HOT = 12
const START_CTL = 48

type SheetState =
	| null
	| { kind: 'anchor' }
	| { kind: 'templates'; phaseId: string | null }

/** Step size for a nudge, in the block's own unit. */
function step(c: Currency) {
	return c === 'hours' ? 0.5 : c === 'km' ? 5 : 30
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

/** A value plus the unit it is expressed in — mandatory once units vary. */
function Value({
	hours,
	currency,
	className,
	unitClassName,
}: {
	hours: number
	currency: Currency
	className?: string
	unitClassName?: string
}) {
	return (
		<span className={cn('tabular-nums', className)}>
			{fromHours(hours, currency)}
			<span
				className={cn(
					'text-muted-foreground ml-1 text-[0.72em] font-normal',
					unitClassName,
				)}
			>
				{CURRENCY_UNIT[currency]}
			</span>
		</span>
	)
}

// ---------------------------------------------------------------------------

export function VariantPerBlock({ store }: { store: PlanStore }) {
	const { plan, derived } = store
	const [layers, setLayers] = useState<LayerKey[]>([
		'volume',
		'fitness',
		'rhythm',
		'focus',
	])
	const [mode, setMode] = useState<'blocks' | 'weeks'>('blocks')
	const [inspected, setInspected] = useState<number | null>(null)
	const [openPhases, setOpenPhases] = useState<string[]>(() =>
		plan.phases[1]
			? [plan.phases[1].id]
			: plan.phases[0]
				? [plan.phases[0].id]
				: [],
	)
	const [selectedWeek, setSelectedWeek] = useState(1)
	const [openWeek, setOpenWeek] = useState<number | null>(null)
	const [editingCell, setEditingCell] = useState<number | null>(null)
	const [sheet, setSheet] = useState<SheetState>(null)

	const weeks = derived.weeks
	const ctl = projectCtl(weeks, START_CTL)
	const untilRace = weeksUntil(plan.anchor.date, store.today)
	const repeatFrom =
		plan.anchor.kind === 'ongoing' && derived.cycleWeeks < weeks.length
			? derived.cycleWeeks
			: null
	const totalHours =
		Math.round((derived.loadHours + derived.unloadedHours) * 10) / 10

	/** The unit a given Training Week reads in — its block's, or hours. */
	function weekCurrency(w: PlannedWeek): Currency {
		const phase = plan.phases.find((p) => p.id === w.phaseId)
		return phase ? phaseCurrency(phase) : 'hours'
	}

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

	const unitsInUse = Array.from(
		new Set(plan.phases.map((p) => CURRENCY_UNIT[phaseCurrency(p)])),
	)

	return (
		<div className="mx-auto w-full max-w-2xl px-5 pb-40">
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

			{/* The chart has to pick one unit for its y axis, and hours is the only
			    one every block can express. Said out loud rather than implied. */}
			<section className="border-border/60 bg-card rounded-[1.75rem] border px-4 pt-5 pb-4">
				<div className="mb-3 flex items-baseline justify-between px-1">
					<h2 className="text-sm font-medium">The season</h2>
					<span className="text-muted-foreground text-[11px]">
						{derived.totalWeeks} weeks · drawn in hours
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
					currency="hours"
				/>

				<div className="mt-3">
					<LayerChips active={layers} onToggle={toggleLayer} />
					{layers.includes('form') ? <FormLayerNotice /> : null}
				</div>

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
								{/* The big number is in the *block's* unit, so it always
								    needs its unit attached. */}
								<Value
									hours={iw.hours}
									currency={weekCurrency(iw)}
									className="shrink-0 text-3xl font-semibold tracking-tight"
								/>
							</div>
							<dl className="border-border/60 mt-3 grid grid-cols-2 gap-x-6 gap-y-2 border-t pt-3 text-[13px] sm:grid-cols-4">
								<Metric
									label="Hours"
									value={`${fromHours(iw.hours, 'hours')}`}
								/>
								<Metric
									label="Planned TSS"
									value={
										iw.countsTowardLoad
											? `${Math.round(iw.hours * TSS_PER_ENDURANCE_HOUR)}`
											: '— no TSS'
									}
								/>
								<Metric
									label="Ramp (hours)"
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
						</>
					) : (
						<p className="text-muted-foreground text-center text-[13px]">
							Tap a week to inspect it.
						</p>
					)}
				</div>
			</section>

			{guard ? (
				<section className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--zone-4)]/40 bg-[var(--zone-4)]/10 px-4 py-3.5">
					<Icon
						name="alert-triangle"
						size="md"
						className="shrink-0 text-[var(--zone-4)]"
					/>
					<p className="min-w-0 flex-1 text-[13px]">
						Week {guard.i + 1} jumps{' '}
						<strong className="tabular-nums">+{guard.ramp}%</strong> in hours on
						the week before it.{' '}
						<span className="text-muted-foreground">
							{guard.atBlockStart
								? `${guard.phaseName} opens well above where ${guard.prevPhaseName} left off — and they don’t even speak the same unit, so hours is the only way to compare them.`
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
								store.setWeekOverrideHours(
									w.phaseId,
									w.weekInPhase,
									prev.hours * 1.06,
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

			{/* Season totals. Hours is the headline because it is the only unit the
			    whole plan can express; km and TSS are explicitly partial. */}
			<section className="border-border/60 bg-card mt-6 rounded-[1.5rem] border px-4 py-5">
				<div className="grid grid-cols-3 gap-2">
					<BigStat
						label="Season hours"
						value={`${totalHours}`}
						sub={`${unitsInUse.join(' + ')} reconciled`}
					/>
					<BigStat
						label="Weeks"
						value={`${derived.totalWeeks}`}
						sub={`${weeks.filter((w) => w.role === 'recovery').length} recovery`}
					/>
					<BigStat
						label="Peak fitness"
						value={`${Math.max(...ctl).toFixed(0)}`}
						sub="projected CTL"
					/>
				</div>
				<p className="text-muted-foreground border-border/60 mt-4 flex items-start gap-2 border-t pt-3 text-[13px]">
					<Icon name="info-circle" size="sm" className="mt-0.5 shrink-0" />
					<span>
						{fromHours(derived.loadHours, 'km')} km ·{' '}
						{fromHours(derived.loadHours, 'tss')} TSS across the load-bearing
						weeks only.
						{derived.unloadedHours > 0
							? ` The ${derived.unloadedHours} h of strength are in the hours total and in neither of those.`
							: ' No strength blocks yet, so today those cover everything.'}
					</span>
				</p>
			</section>

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
						const bc = phaseCurrency(phase)
						const locked = currencyLocked(phase.focus)
						const open = openPhases.includes(phase.id)
						const peak = Math.max(...pw.map((w) => w.hours), 0)
						const sel = pw.find((w) => w.weekInPhase === selectedWeek) ?? pw[0]
						const blockHours = pw.reduce((a, w) => a + w.hours, 0)
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
										<span className="flex items-center gap-2 truncate text-base font-medium">
											{phase.name}
											{/* The block's unit, worn on its sleeve. */}
											<span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
												{CURRENCY_UNIT[bc]}
											</span>
										</span>
										<span className="text-muted-foreground block truncate text-[13px] tabular-nums">
											{phase.weeks} wk · {meta.label} ·{' '}
											{fromHours(blockHours, bc)} {CURRENCY_UNIT[bc]} ·{' '}
											{fromHours(blockHours, 'hours')} h
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
												<Value
													hours={sel?.hours ?? 0}
													currency={bc}
													className="text-3xl font-semibold tracking-tight"
												/>
												<div className="text-muted-foreground text-[11px] tracking-wide uppercase">
													week {selectedWeek}
												</div>
											</div>
										</div>

										{sel ? (
											<p className="text-muted-foreground px-6 pb-3 text-center text-[13px] tabular-nums">
												{fromHours(sel.hours, 'hours')} h
												{sel.countsTowardLoad
													? ` · ${Math.round(sel.hours * TSS_PER_ENDURANCE_HOUR)} planned TSS`
													: ' · no TSS'}
											</p>
										) : null}

										{/* The block's own unit — the whole point of this variant. */}
										<div className="border-border/60 border-t px-5 py-4">
											<div className="mb-2 flex items-baseline justify-between gap-2">
												<span className="text-muted-foreground text-[11px] tracking-wide uppercase">
													This block speaks
												</span>
												{locked ? (
													<span className="text-muted-foreground text-[11px]">
														locked
													</span>
												) : null}
											</div>
											{locked ? (
												<p className="text-muted-foreground bg-muted/60 flex items-start gap-2 rounded-xl px-3 py-2.5 text-[13px]">
													<Icon
														name="info-circle"
														size="sm"
														className="mt-0.5 shrink-0"
													/>
													<span>
														Hours. A strength block has no distance and no TSS,
														so this isn’t a choice — showing km or TSS here
														would only ever print “—”.
													</span>
												</p>
											) : (
												<>
													<Segmented
														label={`${phase.name} currency`}
														value={bc}
														onChange={(c) =>
															store.setPhaseCurrency(phase.id, c)
														}
														options={CURRENCIES.map((c) => ({
															key: c,
															label: CURRENCY_UNIT[c],
														}))}
													/>
													<p className="text-muted-foreground mt-2 text-[13px]">
														Only this block. The season still totals in hours.
													</p>
												</>
											)}
										</div>

										{/* Level 3: the Week Pattern stamped on this block. */}
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
											<Row label="Opening week">
												<Stepper
													onDown={() =>
														store.updatePhase(phase.id, {
															baseHours: Math.max(
																0.5,
																Math.round(
																	(phase.baseHours - toHours(step(bc), bc)) *
																		10,
																) / 10,
															),
														})
													}
													onUp={() =>
														store.updatePhase(phase.id, {
															baseHours:
																Math.round(
																	(phase.baseHours + toHours(step(bc), bc)) *
																		10,
																) / 10,
														})
													}
												>
													<Value
														hours={phase.baseHours}
														currency={bc}
														className="text-lg font-medium"
													/>
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
				/* Weeks: the target column is heterogeneous — every row carries its
				   own unit — so hours runs alongside as the common denominator. */
				<div className="border-border/60 bg-card mt-5 overflow-hidden rounded-[1.5rem] border">
					<div className="border-border/60 text-muted-foreground hidden grid-cols-[2.75rem_1fr_4.5rem_6.5rem_4rem_4rem_3.5rem] items-center gap-3 border-b px-5 py-2.5 text-[10px] font-semibold tracking-[0.1em] uppercase sm:grid">
						<span>Wk</span>
						<span>Role &amp; pattern</span>
						<span className="text-right">Ramp</span>
						<span className="text-right">Target</span>
						<span className="text-right font-normal">h</span>
						<span className="text-right font-normal">TSS</span>
						<span className="text-right">CTL</span>
					</div>
					<ul className="divide-border/60 divide-y">
						{weeks.map((w, i) => {
							const ramp = rampPercent(weeks, i)
							const editable = w.role !== 'taper' && w.cycle === 1
							const weekOpen = openWeek === w.index
							const phase = plan.phases.find((p) => p.id === w.phaseId)
							const wc = weekCurrency(w)
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
												{FOCUS[w.focus].label} · speaks{' '}
												{CURRENCY_UNIT[wc]}
												{w.cycle > 1 ? ` · cycle ${w.cycle}` : ''}
											</span>
										</div>
									) : null}
									<div className="px-4 py-3">
										<div
											className={cn(
												'grid grid-cols-[2.75rem_1fr_6.5rem] items-center gap-3 sm:grid-cols-[2.75rem_1fr_4.5rem_6.5rem_4rem_4rem_3.5rem]',
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
														{wc !== 'hours'
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
														defaultValue={fromHours(w.hours, wc)}
														onBlur={(e) => {
															store.setWeekOverrideHours(
																w.phaseId,
																w.weekInPhase,
																toHours(Number(e.target.value), wc),
															)
															setEditingCell(null)
														}}
														onKeyDown={(e) => {
															if (e.key === 'Enter')
																(e.target as HTMLInputElement).blur()
															if (e.key === 'Escape') setEditingCell(null)
														}}
														aria-label={`Week ${i + 1} target in ${CURRENCY_UNIT[wc]}`}
														className="border-foreground bg-background w-full rounded-lg border px-2 py-1 text-right text-base tabular-nums"
													/>
												) : (
													<button
														type="button"
														disabled={!editable}
														onClick={() => setEditingCell(w.index)}
														className={cn(
															'w-full rounded-lg px-2 py-1 text-right text-base font-medium transition-colors',
															editable
																? 'hover:bg-muted active:scale-95'
																: 'text-muted-foreground cursor-default',
														)}
													>
														<Value hours={w.hours} currency={wc} />
														{w.overridden ? (
															<span className="text-primary ml-1">•</span>
														) : null}
													</button>
												)}
											</div>

											<div className="text-muted-foreground hidden text-right text-[13px] tabular-nums sm:block">
												{fromHours(w.hours, 'hours')}
											</div>
											<div className="text-muted-foreground hidden text-right text-[13px] tabular-nums sm:block">
												{w.countsTowardLoad
													? Math.round(w.hours * TSS_PER_ENDURANCE_HOUR)
													: '—'}
											</div>
											<div className="text-muted-foreground hidden text-right text-[13px] tabular-nums sm:block">
												{ctl[i]}
											</div>
										</div>

										{weekOpen && phase?.pattern ? (
											<StampedWeekStrip
												patternKey={phase.pattern}
												hours={w.hours}
												currency={wc}
											/>
										) : null}
										{weekOpen && !phase?.pattern ? (
											<p className="text-muted-foreground bg-muted/40 mt-2 rounded-xl px-3 py-3 text-[13px]">
												No Week Pattern stamped on {w.phaseName} yet.
											</p>
										) : null}
									</div>
								</li>
							)
						})}
					</ul>
					<p className="border-border/60 text-muted-foreground border-t px-5 py-3 text-[11px]">
						Every target carries its unit because the column is mixed. Hours and
						TSS run alongside so rows stay comparable; ramp is always computed
						in hours.
					</p>
				</div>
			)}

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
								detail="The whole macro — replaces every block below, units included."
							/>
							<div className="space-y-2">
								{SEASON_TEMPLATES.map((t) => (
									<TemplateRow
										key={t.key}
										art={<SeasonSpark template={t} />}
										title={t.name}
										detail={t.blurb}
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
										? `Swaps ${sheetPhase.name} — and brings the unit that focus naturally speaks.`
										: 'Adds one Plan Outline phase, in the unit its focus naturally speaks.'
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
							</div>
						</section>
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
