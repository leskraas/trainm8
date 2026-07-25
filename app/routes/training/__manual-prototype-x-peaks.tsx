/**
 * PROTOTYPE — throwaway. Variant D: "TrainingPeaks, 2026 refresh". The pro tool
 * — unapologetic density done right. Charts are first-class: the volume/CTL
 * chart is the primary object and the week grid is directly editable beneath
 * it. Follows ADR 0030's inspect-panel-below rule rather than tooltips.
 * Delete with the route.
 */
import { useState } from 'react'
import { Icon } from '#app/components/ui/icon.tsx'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '#app/components/ui/select.tsx'
import { cn } from '#app/utils/misc.tsx'
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
	RHYTHM_LABEL,
	RHYTHMS,
	SEASON_TEMPLATES,
	TSS_PER_ENDURANCE_HOUR,
	weeksUntil,
} from './__manual-prototype-x-model.ts'
import { type PlanStore } from './__manual-prototype-x-state.ts'

export const PEAKS_NAME = 'TrainingPeaks — the pro grid'

const RAMP_WARN = 8
const RAMP_HOT = 12
/** Kody's seeded CTL is in this neighbourhood; the projection has to start somewhere. */
const START_CTL = 48

function Rail({
	title,
	children,
}: {
	title: string
	children: React.ReactNode
}) {
	return (
		<section className="border-border border-b px-3 py-3">
			<h3 className="text-muted-foreground mb-2 text-[10px] font-semibold tracking-[0.12em] uppercase">
				{title}
			</h3>
			{children}
		</section>
	)
}

function MiniButton({
	children,
	onClick,
	active,
	className,
	title,
}: {
	children: React.ReactNode
	onClick: () => void
	active?: boolean
	className?: string
	title?: string
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={active}
			title={title}
			className={cn(
				'rounded border px-1.5 py-0.5 text-[11px] leading-4 font-medium transition-colors',
				active
					? 'border-primary bg-primary text-primary-foreground'
					: 'border-border bg-card text-foreground hover:bg-muted',
				className,
			)}
		>
			{children}
		</button>
	)
}

/** Weekly volume bars + projected CTL line + phase bands. */
function PlanChart({
	weeks,
	ctl,
	currency,
	inspected,
	onInspect,
	currentIndex,
	raceLabel,
	repeatFrom,
}: {
	weeks: PlannedWeek[]
	ctl: number[]
	currency: 'km' | 'hours' | 'tss'
	inspected: number | null
	onInspect: (i: number | null) => void
	currentIndex: number | null
	raceLabel: string | null
	repeatFrom: number | null
}) {
	const colW = 30
	const H = 260
	const padL = 40
	const padR = 44
	const padT = 14
	const bandH = 14
	const plotH = H - padT - 46
	const W = weeks.length * colW + padL + padR
	const maxVol = Math.max(...weeks.map((w) => w.hours), 0.1)
	const maxCtl = Math.max(...ctl, START_CTL) * 1.15
	const yVol = (h: number) => padT + plotH - (h / maxVol) * plotH
	const yCtl = (c: number) => padT + plotH - (c / maxCtl) * plotH
	const x = (i: number) => padL + i * colW

	const spans: Array<{
		id: string
		name: string
		from: number
		to: number
		focus: string
	}> = []
	weeks.forEach((w, i) => {
		const last = spans[spans.length - 1]
		if (last && last.id === w.phaseId && last.to === i - 1) {
			last.to = i
		} else {
			spans.push({
				id: `${w.phaseId}-${i}`,
				name: w.phaseName,
				from: i,
				to: i,
				focus: w.focus,
			})
		}
	})

	const ctlLine = ctl
		.map((c, i) => `${i === 0 ? 'M' : 'L'} ${x(i) + colW / 2} ${yCtl(c)}`)
		.join(' ')

	return (
		<div className="overflow-x-auto">
			<svg
				width={W}
				height={H}
				viewBox={`0 0 ${W} ${H}`}
				role="img"
				aria-label="Planned weekly volume with projected CTL"
				className="max-w-none"
				onMouseLeave={() => onInspect(null)}
			>
				{[0, 0.25, 0.5, 0.75, 1].map((f) => (
					<g key={f}>
						<line
							x1={padL}
							y1={padT + plotH * f}
							x2={W - padR}
							y2={padT + plotH * f}
							stroke="var(--border)"
							strokeWidth={1}
						/>
						<text
							x={padL - 6}
							y={padT + plotH * f + 3}
							textAnchor="end"
							className="fill-muted-foreground text-[9px] tabular-nums"
						>
							{fromHours(maxVol * (1 - f), currency)}
						</text>
						<text
							x={W - padR + 6}
							y={padT + plotH * f + 3}
							className="fill-muted-foreground text-[9px] tabular-nums"
						>
							{Math.round(maxCtl * (1 - f))}
						</text>
					</g>
				))}

				{weeks.map((w, i) => {
					const h = padT + plotH - yVol(w.hours)
					const dim = !w.countsTowardLoad
					return (
						<g
							key={w.index}
							onMouseEnter={() => onInspect(i)}
							onClick={() => onInspect(i)}
							className="cursor-pointer"
						>
							<rect
								x={x(i)}
								y={padT}
								width={colW}
								height={plotH}
								fill={inspected === i ? 'var(--muted)' : 'transparent'}
							/>
							<rect
								x={x(i) + 3}
								y={yVol(w.hours)}
								width={colW - 6}
								height={Math.max(1, h)}
								rx={2}
								fill={FOCUS[w.focus].hue}
								opacity={dim ? 0.25 : w.role === 'load' ? 0.85 : 0.45}
								stroke={dim ? FOCUS[w.focus].hue : 'none'}
								strokeDasharray={dim ? '2 2' : undefined}
							/>
							{w.overridden ? (
								<rect
									x={x(i) + 3}
									y={yVol(w.hours) - 4}
									width={colW - 6}
									height={2.5}
									fill="var(--foreground)"
								/>
							) : null}
						</g>
					)
				})}

				<path
					d={ctlLine}
					fill="none"
					stroke="var(--primary)"
					strokeWidth={2}
					strokeLinejoin="round"
				/>

				{/* Phase bands. */}
				{spans.map((s) => (
					<g key={s.id}>
						<rect
							x={x(s.from) + 1}
							y={padT + plotH + 8}
							width={(s.to - s.from + 1) * colW - 2}
							height={bandH}
							rx={3}
							fill={FOCUS[s.focus as keyof typeof FOCUS].hue}
							opacity={0.8}
						/>
						<text
							x={x(s.from) + ((s.to - s.from + 1) * colW) / 2}
							y={padT + plotH + 8 + 10}
							textAnchor="middle"
							className="fill-background text-[9px] font-semibold"
						>
							{(s.to - s.from + 1) * colW > 46 ? s.name : ''}
						</text>
					</g>
				))}

				{weeks.map((w, i) =>
					i % 2 === 0 ? (
						<text
							key={w.index}
							x={x(i) + colW / 2}
							y={H - 6}
							textAnchor="middle"
							className="fill-muted-foreground text-[9px] tabular-nums"
						>
							{i + 1}
						</text>
					) : null,
				)}

				{currentIndex !== null ? (
					<line
						x1={x(currentIndex) + colW / 2}
						y1={padT}
						x2={x(currentIndex) + colW / 2}
						y2={padT + plotH}
						stroke="var(--foreground)"
						strokeWidth={1}
						strokeDasharray="2 3"
					/>
				) : null}

				{repeatFrom !== null ? (
					<g>
						<line
							x1={x(repeatFrom)}
							y1={padT}
							x2={x(repeatFrom)}
							y2={padT + plotH + 26}
							stroke="var(--muted-foreground)"
							strokeWidth={1}
							strokeDasharray="4 3"
						/>
						<text
							x={x(repeatFrom) + 4}
							y={padT + 9}
							className="fill-muted-foreground text-[9px] font-semibold"
						>
							↻ repeat
						</text>
					</g>
				) : null}

				{raceLabel ? (
					<g>
						<line
							x1={W - padR}
							y1={padT}
							x2={W - padR}
							y2={padT + plotH + 26}
							stroke="var(--destructive)"
							strokeWidth={1.5}
						/>
						<text
							x={W - padR - 4}
							y={padT + 9}
							textAnchor="end"
							className="fill-destructive text-[9px] font-semibold"
						>
							{raceLabel}
						</text>
					</g>
				) : null}
			</svg>
		</div>
	)
}

// ---------------------------------------------------------------------------

export function VariantPeaks({ store }: { store: PlanStore }) {
	const { plan, derived } = store
	const [inspected, setInspected] = useState<number | null>(null)
	const [editingCell, setEditingCell] = useState<string | null>(null)
	const [templateFor, setTemplateFor] = useState<string | null>(null)
	const [showConversions, setShowConversions] = useState(true)

	const cur = plan.currency
	const weeks = derived.weeks
	const ctl = projectCtl(weeks, START_CTL)
	const untilRace = weeksUntil(plan.anchor.date, store.today)
	const inspectedWeek = inspected !== null ? weeks[inspected] : undefined
	const repeatFrom =
		plan.anchor.kind === 'ongoing' && derived.cycleWeeks < weeks.length
			? derived.cycleWeeks
			: null

	return (
		<div className="mx-auto w-full max-w-[1500px] pb-32">
			<div className="grid gap-0 lg:grid-cols-[280px_minmax(0,1fr)]">
				{/* ---------------------------------------------------- Left rail */}
				<aside className="border-border bg-card/50 border-r lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto">
					<div className="border-border border-b px-3 py-3">
						<p className="text-muted-foreground text-[10px] font-semibold tracking-[0.12em] uppercase">
							Training Plan
						</p>
						<h2 className="mt-0.5 truncate text-base font-semibold">
							{plan.anchor.kind === 'ongoing'
								? 'Ongoing — no target event'
								: plan.anchor.name}
						</h2>
						<p className="text-muted-foreground mt-0.5 text-xs tabular-nums">
							{plan.anchor.kind === 'ongoing'
								? `${derived.cycleWeeks} wk cycle × ${plan.cyclesShown} shown`
								: `${untilRace} wk out · ${formatShortDate(plan.anchor.date)}`}
						</p>
					</div>

					<Rail title="Anchor">
						<div className="grid grid-cols-3 gap-1">
							<MiniButton
								active={plan.anchor.kind === 'event'}
								onClick={() =>
									store.setAnchor({
										kind: 'event',
										name: store.seedEvent.name,
										date: store.seedEvent.date,
									})
								}
							>
								Event
							</MiniButton>
							<MiniButton
								active={plan.anchor.kind === 'goal'}
								onClick={() =>
									store.setAnchor({
										kind: 'goal',
										name: 'Sub-40 10k shape',
										date: new Date(Date.now() + 98 * 864e5)
											.toISOString()
											.slice(0, 10),
									})
								}
							>
								Goal
							</MiniButton>
							<MiniButton
								active={plan.anchor.kind === 'ongoing'}
								onClick={store.goOngoing}
							>
								Ongoing
							</MiniButton>
						</div>
						{plan.anchor.kind === 'ongoing' ? (
							<div className="mt-2 space-y-2">
								<div className="flex items-center justify-between text-xs">
									<span className="text-muted-foreground">Cycles drawn</span>
									<span className="flex items-center gap-1">
										<MiniButton
											onClick={() => store.setCyclesShown(plan.cyclesShown - 1)}
										>
											−
										</MiniButton>
										<span className="w-4 text-center tabular-nums">
											{plan.cyclesShown}
										</span>
										<MiniButton
											onClick={() => store.setCyclesShown(plan.cyclesShown + 1)}
										>
											+
										</MiniButton>
									</span>
								</div>
								<MiniButton
									className="w-full"
									onClick={() =>
										store.attachRace(
											store.seedEvent.name,
											store.seedEvent.date ??
												new Date(Date.now() + 84 * 864e5)
													.toISOString()
													.slice(0, 10),
										)
									}
								>
									Attach {store.seedEvent.name}
								</MiniButton>
							</div>
						) : (
							<div className="mt-2 flex items-center justify-between text-xs">
								<span className="text-muted-foreground">Taper weeks</span>
								<span className="flex items-center gap-1">
									<MiniButton
										onClick={() => store.setTaperWeeks(plan.taperWeeks - 1)}
									>
										−
									</MiniButton>
									<span className="w-4 text-center tabular-nums">
										{plan.taperWeeks}
									</span>
									<MiniButton
										onClick={() => store.setTaperWeeks(plan.taperWeeks + 1)}
									>
										+
									</MiniButton>
								</span>
							</div>
						)}
					</Rail>

					<Rail title="Volume currency">
						<div className="grid grid-cols-3 gap-1">
							{CURRENCIES.map((c) => (
								<MiniButton
									key={c}
									active={cur === c}
									onClick={() => store.setCurrency(c)}
								>
									{CURRENCY_UNIT[c]}
								</MiniButton>
							))}
						</div>
						<p className="text-muted-foreground mt-2 text-[11px]">
							Primary drives every editable cell. Secondary columns:
						</p>
						<div className="mt-1 flex gap-1">
							{CURRENCIES.filter((c) => c !== cur).map((c) => (
								<MiniButton
									key={c}
									active={plan.alsoTrack.includes(c)}
									onClick={() => store.toggleAlsoTrack(c)}
								>
									{CURRENCY_UNIT[c]}
								</MiniButton>
							))}
						</div>
					</Rail>

					<Rail title="Season templates">
						<ul className="space-y-1">
							{SEASON_TEMPLATES.map((t) => (
								<li key={t.key}>
									<button
										type="button"
										onClick={() => store.applySeasonTemplate(t.key)}
										className="border-border bg-card hover:bg-muted w-full rounded border px-2 py-1.5 text-left text-[11px] leading-tight"
									>
										<span className="block font-medium">{t.name}</span>
										<span className="text-muted-foreground block">
											{t.blocks.map((b) => `${b.weeks}w`).join(' + ')}
											{t.taperWeeks ? ` + ${t.taperWeeks}w taper` : ''} ·{' '}
											{t.anchorKind === 'ongoing' ? 'repeats' : 'to event'}
										</span>
									</button>
								</li>
							))}
						</ul>
						<p className="text-muted-foreground mt-1.5 text-[10px]">
							Applying copies the structure in. No link back.
						</p>
					</Rail>

					<Rail title={`Plan Outline · ${plan.phases.length} phases`}>
						<ul className="space-y-1">
							{plan.phases.map((p, i) => (
								<li
									key={p.id}
									className="border-border bg-card rounded border px-2 py-1.5"
								>
									<div className="flex items-center gap-1.5">
										<span
											className="size-2.5 shrink-0 rounded-sm"
											style={{ background: FOCUS[p.focus].hue }}
										/>
										<span className="min-w-0 flex-1 truncate text-xs font-medium">
											{p.name}
										</span>
										<MiniButton
											title="Move earlier"
											onClick={() => store.movePhase(p.id, -1)}
										>
											↑
										</MiniButton>
										<MiniButton
											title="Move later"
											onClick={() => store.movePhase(p.id, 1)}
										>
											↓
										</MiniButton>
										<MiniButton
											title="Remove"
											onClick={() => store.removePhase(p.id)}
										>
											×
										</MiniButton>
									</div>
									<div className="mt-1.5 grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1 text-[11px]">
										<span className="text-muted-foreground">Weeks</span>
										<span className="flex items-center gap-1">
											<MiniButton
												onClick={() =>
													store.updatePhase(p.id, {
														weeks: Math.max(1, p.weeks - 1),
													})
												}
											>
												−
											</MiniButton>
											<span className="w-4 text-center tabular-nums">
												{p.weeks}
											</span>
											<MiniButton
												onClick={() =>
													store.updatePhase(p.id, {
														weeks: Math.min(12, p.weeks + 1),
													})
												}
											>
												+
											</MiniButton>
										</span>
										<span className="text-muted-foreground">Rhythm</span>
										<span className="flex gap-1">
											{RHYTHMS.map((r) => (
												<MiniButton
													key={r}
													active={p.rhythm === r}
													onClick={() => store.setPhaseRhythm(p.id, r)}
													title={RHYTHM_LABEL[r]}
												>
													{r === 'none' ? '—' : r}
												</MiniButton>
											))}
										</span>
										<span className="text-muted-foreground">Focus</span>
										<Select
											value={p.focus}
											onValueChange={(v) =>
												store.setPhaseFocus(
													p.id,
													v as (typeof FOCUS_KEYS)[number],
												)
											}
										>
											<SelectTrigger
												size="sm"
												aria-label={`${p.name} focus`}
												className="border-border bg-card w-full rounded border px-1.5 text-[11px] md:text-[11px]"
											>
												<SelectValue>
													{(v) => FOCUS[v as (typeof FOCUS_KEYS)[number]].label}
												</SelectValue>
											</SelectTrigger>
											<SelectContent>
												{FOCUS_KEYS.map((f) => (
													<SelectItem key={f} value={f}>
														{FOCUS[f].label}
														{FOCUS[f].countsTowardLoad ? '' : ' · no TSS'}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<span className="text-muted-foreground">Open wk</span>
										<span className="flex items-center gap-1">
											<MiniButton
												onClick={() =>
													store.nudgePhaseVolume(
														p.id,
														cur === 'hours' ? -0.5 : cur === 'km' ? -5 : -30,
													)
												}
											>
												−
											</MiniButton>
											<span className="w-10 text-center tabular-nums">
												{FOCUS[p.focus].countsTowardLoad || cur === 'hours'
													? fromHours(p.baseHours, cur)
													: '—'}
											</span>
											<MiniButton
												onClick={() =>
													store.nudgePhaseVolume(
														p.id,
														cur === 'hours' ? 0.5 : cur === 'km' ? 5 : 30,
													)
												}
											>
												+
											</MiniButton>
										</span>
									</div>
									<div className="mt-1.5">
										<MiniButton
											className="w-full"
											onClick={() =>
												setTemplateFor(templateFor === p.id ? null : p.id)
											}
										>
											{templateFor === p.id ? 'Cancel swap' : 'Swap ▾'}
										</MiniButton>
										{templateFor === p.id ? (
											<ul className="mt-1 space-y-0.5">
												{BLOCK_TEMPLATES.map((t) => (
													<li key={t.key}>
														<button
															type="button"
															onClick={() => {
																store.replacePhaseWithTemplate(p.id, t)
																setTemplateFor(null)
															}}
															className="hover:bg-muted w-full rounded px-1.5 py-1 text-left text-[11px]"
														>
															{t.name}{' '}
															<span className="text-muted-foreground">
																{t.weeks}w · {t.rhythm}
															</span>
														</button>
													</li>
												))}
											</ul>
										) : null}
									</div>
									<p className="text-muted-foreground mt-1 text-[10px]">
										#{i + 1}
										{p.origin ? ` · copied from “${p.origin}”` : ' · authored'}
									</p>
								</li>
							))}
						</ul>
					</Rail>

					<Rail title="Add block">
						<div className="grid grid-cols-2 gap-1">
							{BLOCK_TEMPLATES.map((t) => (
								<MiniButton
									key={t.key}
									onClick={() => store.appendBlockTemplate(t)}
									title={t.blurb}
								>
									{t.name.replace(' block', '')}
								</MiniButton>
							))}
						</div>
					</Rail>
				</aside>

				{/* -------------------------------------------------------- Main */}
				<main className="min-w-0 px-4 py-4">
					{/* Chart first. */}
					<section className="border-border bg-card rounded-lg border">
						<header className="border-border flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-3 py-2">
							<h2 className="text-xs font-semibold tracking-wide uppercase">
								Planned weekly volume · projected fitness
							</h2>
							<span className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
								<span className="inline-block h-2 w-3 rounded-sm bg-[var(--zone-2)]" />
								volume ({CURRENCY_UNIT[cur]}, left)
							</span>
							<span className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
								<span className="inline-block h-0.5 w-4 bg-[var(--primary)]" />
								projected CTL (right)
							</span>
							<span className="text-muted-foreground ml-auto text-[11px]">
								hatched bars = no TSS
							</span>
						</header>
						<div className="px-2 py-2">
							<PlanChart
								weeks={weeks}
								ctl={ctl}
								currency={cur}
								inspected={inspected}
								onInspect={setInspected}
								currentIndex={derived.currentIndex}
								raceLabel={
									plan.anchor.kind === 'ongoing' ? null : plan.anchor.name
								}
								repeatFrom={repeatFrom}
							/>
						</div>
						{/* Inspect panel below the chart — never a floating tooltip. */}
						<div className="border-border bg-muted/40 grid grid-cols-2 gap-x-6 gap-y-1 border-t px-3 py-2 text-[11px] sm:grid-cols-4 lg:grid-cols-7">
							{inspectedWeek ? (
								<>
									<Inspect label="Week" value={`${inspected! + 1}`} />
									<Inspect
										label="Starts"
										value={formatShortDate(inspectedWeek.startDate)}
									/>
									<Inspect label="Block" value={inspectedWeek.phaseName} />
									<Inspect
										label="Role"
										value={
											inspectedWeek.role === 'recovery'
												? 'Recovery'
												: inspectedWeek.role === 'taper'
													? `Taper ${inspectedWeek.weekInPhase}`
													: `Load ${inspectedWeek.loadNumber}/${inspectedWeek.loadTotal}`
										}
									/>
									<Inspect
										label="Volume"
										value={`${fromHours(inspectedWeek.hours, cur)} ${CURRENCY_UNIT[cur]}`}
									/>
									<Inspect
										label="Planned TSS"
										value={
											inspectedWeek.countsTowardLoad
												? `${Math.round(inspectedWeek.hours * TSS_PER_ENDURANCE_HOUR)}`
												: '— (no TSS)'
										}
									/>
									<Inspect
										label="Proj. CTL"
										value={`${ctl[inspected!] ?? '—'}`}
									/>
								</>
							) : (
								<p className="text-muted-foreground col-span-full">
									Hover or tap a week to inspect it.
								</p>
							)}
						</div>
					</section>

					{/* Summary strip. */}
					<section className="border-border bg-card mt-3 flex flex-wrap gap-x-6 gap-y-1 rounded-lg border px-3 py-2 text-[11px]">
						<Inspect
							label={`Season ${CURRENCY_UNIT[cur]}`}
							value={`${fromHours(derived.loadHours, cur)}`}
						/>
						<Inspect label="Weeks" value={`${derived.totalWeeks}`} />
						<Inspect
							label="Loading wks"
							value={`${weeks.filter((w) => w.role === 'load').length}`}
						/>
						<Inspect
							label="Recovery wks"
							value={`${weeks.filter((w) => w.role === 'recovery').length}`}
						/>
						<Inspect
							label="Peak CTL"
							value={`${Math.max(...ctl).toFixed(1)}`}
						/>
						<Inspect
							label="Non-TSS hours"
							value={derived.unloadedHours ? `${derived.unloadedHours} h` : '—'}
						/>
						<label className="text-muted-foreground ml-auto flex items-center gap-1.5">
							<input
								type="checkbox"
								checked={showConversions}
								onChange={(e) => setShowConversions(e.target.checked)}
							/>
							conversion columns
						</label>
					</section>

					{/* The grid. */}
					<section className="border-border mt-3 overflow-x-auto rounded-lg border">
						<table className="w-full border-collapse text-[11px]">
							<thead className="bg-card sticky top-0 z-10">
								<tr className="border-border text-muted-foreground border-b text-left">
									<Th className="w-10">Wk</Th>
									<Th className="w-20">Start</Th>
									<Th className="w-28">Block</Th>
									<Th className="w-20">Focus</Th>
									<Th className="w-24">Rhythm role</Th>
									<Th className="w-24 text-right">
										Target ({CURRENCY_UNIT[cur]})
									</Th>
									{showConversions
										? CURRENCIES.filter((c) => c !== cur).map((c) => (
												<Th key={c} className="w-16 text-right">
													{CURRENCY_UNIT[c]}
												</Th>
											))
										: null}
									<Th className="w-16 text-right">Ramp</Th>
									<Th className="w-16 text-right">Proj CTL</Th>
									<Th className="w-8" />
								</tr>
							</thead>
							<tbody>
								{weeks.map((w, i) => {
									const ramp = rampPercent(weeks, i)
									const cellKey = `${w.phaseId}#${w.weekInPhase}#${w.cycle}`
									const editable = w.role !== 'taper' && w.cycle === 1
									const rowStart =
										i === 0 || weeks[i - 1]?.phaseId !== w.phaseId
									return (
										<tr
											key={w.index}
											onMouseEnter={() => setInspected(i)}
											className={cn(
												'border-border/60 border-b transition-colors',
												inspected === i ? 'bg-muted' : 'hover:bg-muted/50',
												rowStart && i > 0 ? 'border-t-border border-t-2' : '',
												w.isPast ? 'opacity-55' : '',
											)}
										>
											<Td className="text-muted-foreground tabular-nums">
												{i + 1}
												{w.isCurrent ? (
													<span className="bg-foreground text-background ml-1 rounded px-1 text-[9px]">
														now
													</span>
												) : null}
											</Td>
											<Td className="tabular-nums">
												{formatShortDate(w.startDate)}
											</Td>
											<Td>
												<span className="flex items-center gap-1.5">
													<span
														className="size-2 shrink-0 rounded-sm"
														style={{ background: FOCUS[w.focus].hue }}
													/>
													<span className="truncate">{w.phaseName}</span>
													{w.cycle > 1 ? (
														<span className="bg-muted text-muted-foreground rounded px-1 text-[9px]">
															↻{w.cycle}
														</span>
													) : null}
												</span>
											</Td>
											<Td className="text-muted-foreground">
												{FOCUS[w.focus].label}
											</Td>
											<Td>
												{w.role === 'taper' ? (
													<span className="text-muted-foreground">
														Taper {w.weekInPhase}/{w.phaseWeeks}
													</span>
												) : w.role === 'recovery' ? (
													<span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5">
														Recovery −30%
													</span>
												) : (
													<span className="tabular-nums">
														Load {w.loadNumber}/{w.loadTotal}
													</span>
												)}
											</Td>
											<Td className="text-right">
												{editingCell === cellKey && editable ? (
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
														className="border-primary bg-background w-20 rounded border px-1 py-0.5 text-right tabular-nums"
														aria-label={`Week ${i + 1} target`}
													/>
												) : (
													<button
														type="button"
														disabled={!editable}
														onClick={() => setEditingCell(cellKey)}
														className={cn(
															'w-full rounded px-1 py-0.5 text-right font-medium tabular-nums',
															editable
																? 'hover:bg-background hover:ring-border hover:ring-1'
																: 'text-muted-foreground cursor-default',
														)}
													>
														{w.countsTowardLoad || cur === 'hours'
															? fromHours(w.hours, cur)
															: '—'}
														{w.overridden ? (
															<span
																title="Edited by hand"
																className="text-primary ml-1"
															>
																•
															</span>
														) : null}
													</button>
												)}
											</Td>
											{showConversions
												? CURRENCIES.filter((c) => c !== cur).map((c) => (
														<Td
															key={c}
															className="text-muted-foreground text-right tabular-nums"
														>
															{w.countsTowardLoad || c === 'hours'
																? fromHours(w.hours, c)
																: '—'}
														</Td>
													))
												: null}
											<Td
												className={cn(
													'text-right tabular-nums',
													ramp !== null && ramp > RAMP_HOT
														? 'text-foreground-destructive font-semibold'
														: ramp !== null && ramp > RAMP_WARN
															? 'font-medium text-[var(--zone-4)]'
															: 'text-muted-foreground',
												)}
											>
												{ramp === null ? '—' : `${ramp > 0 ? '+' : ''}${ramp}%`}
												{ramp !== null && ramp > RAMP_WARN ? (
													<Icon
														name="alert-triangle"
														size="xs"
														className="ml-0.5"
													/>
												) : null}
											</Td>
											<Td className="text-muted-foreground text-right tabular-nums">
												{ctl[i]}
											</Td>
											<Td>
												{w.overridden ? (
													<button
														type="button"
														aria-label={`Reset week ${i + 1}`}
														onClick={() =>
															store.clearWeekOverride(w.phaseId, w.weekInPhase)
														}
														className="text-muted-foreground hover:text-foreground"
													>
														<Icon name="reset" size="xs" />
													</button>
												) : null}
											</Td>
										</tr>
									)
								})}
							</tbody>
						</table>
					</section>

					<p className="text-muted-foreground mt-2 flex items-start gap-1.5 text-[11px]">
						<Icon name="info-circle" size="sm" className="mt-0.5 shrink-0" />
						<span>
							Strength blocks carry no TSS, so their km and TSS cells read “—”
							and they contribute nothing to projected CTL — the bar is hatched
							to say so. Conversions use ≈{TSS_PER_ENDURANCE_HOUR} TSS/endurance
							hour and 10 km/h easy pace.
						</span>
					</p>

					{store.whisper ? (
						<p
							key={store.whisper.id}
							role="status"
							className="border-primary/40 bg-primary/5 mt-2 rounded border px-3 py-2 text-[11px]"
						>
							{store.whisper.text}
						</p>
					) : null}
				</main>
			</div>
		</div>
	)
}

function Th({
	children,
	className,
}: {
	children?: React.ReactNode
	className?: string
}) {
	return (
		<th
			className={cn(
				'px-2 py-1.5 text-[10px] font-semibold tracking-wide uppercase',
				className,
			)}
		>
			{children}
		</th>
	)
}

function Td({
	children,
	className,
}: {
	children?: React.ReactNode
	className?: string
}) {
	return <td className={cn('px-2 py-1', className)}>{children}</td>
}

function Inspect({ label, value }: { label: string; value: string }) {
	return (
		<span className="flex flex-col">
			<span className="text-muted-foreground text-[10px] tracking-wide uppercase">
				{label}
			</span>
			<span className="font-medium tabular-nums">{value}</span>
		</span>
	)
}
