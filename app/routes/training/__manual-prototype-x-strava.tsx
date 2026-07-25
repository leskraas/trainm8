/**
 * PROTOTYPE — throwaway. Variant C: "Strava". The plan as a route you ride to
 * race day — a course profile where the climbs are loading weeks and the dips
 * are recovery weeks — or, with no race, a closed circuit you lap forever.
 * Milestones, celebration moments, stats as achievements. Delete with the route.
 */
import { useState } from 'react'
import { Icon } from '#app/components/ui/icon.tsx'
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
	RHYTHM_LABEL,
	RHYTHMS,
	SEASON_TEMPLATES,
	weeksUntil,
} from './__manual-prototype-x-model.ts'
import { type PlanStore } from './__manual-prototype-x-state.ts'

export const STRAVA_NAME = 'Strava — the route to race day'

const HOT = 'var(--zone-4)'
const HOTTER = 'var(--zone-5)'

function Label({ children }: { children: React.ReactNode }) {
	return (
		<span className="text-muted-foreground text-[11px] font-bold tracking-[0.14em] uppercase">
			{children}
		</span>
	)
}

function Achievement({
	value,
	label,
	sub,
}: {
	value: string
	label: string
	sub?: string
}) {
	return (
		<div className="border-border bg-card rounded-xl border p-4">
			<div className="text-3xl leading-none font-extrabold tracking-tight tabular-nums">
				{value}
			</div>
			<div className="mt-2">
				<Label>{label}</Label>
			</div>
			{sub ? (
				<div className="text-muted-foreground mt-1 text-xs">{sub}</div>
			) : null}
		</div>
	)
}

/** The season drawn as a course profile: climbs are loading weeks. */
function CourseProfile({
	weeks,
	phaseSpans,
	selected,
	onSelect,
	currency,
	raceName,
	currentIndex,
}: {
	weeks: PlannedWeek[]
	phaseSpans: Array<{
		id: string
		name: string
		from: number
		to: number
		focus: string
	}>
	selected: string | null
	onSelect: (phaseId: string) => void
	currency: 'km' | 'hours' | 'tss'
	raceName: string | null
	currentIndex: number | null
}) {
	const colW = 46
	const H = 210
	const pad = 26
	const W = Math.max(weeks.length * colW + pad * 2, 320)
	const max = Math.max(...weeks.map((w) => w.hours), 0.1)
	const y = (h: number) => H - 34 - (h / max) * (H - 78)
	const x = (i: number) => pad + i * colW + colW / 2

	const line = weeks
		.map((w, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(w.hours)}`)
		.join(' ')
	const area = `${line} L ${x(weeks.length - 1)} ${H - 34} L ${x(0)} ${H - 34} Z`

	return (
		<div className="-mx-4 overflow-x-auto px-4 pb-2">
			<svg
				width={W}
				height={H}
				viewBox={`0 0 ${W} ${H}`}
				role="img"
				aria-label="Season course profile — weekly volume as elevation"
				className="max-w-none"
			>
				<defs>
					<linearGradient id="proto-x-road" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stopColor={HOT} stopOpacity="0.42" />
						<stop offset="100%" stopColor={HOT} stopOpacity="0.02" />
					</linearGradient>
				</defs>

				<path d={area} fill="url(#proto-x-road)" />
				<path
					d={line}
					fill="none"
					stroke={HOT}
					strokeWidth={3.5}
					strokeLinejoin="round"
					strokeLinecap="round"
				/>

				{weeks.map((w, i) => (
					<g key={w.index}>
						<circle
							cx={x(i)}
							cy={y(w.hours)}
							r={w.role === 'recovery' ? 4 : 5.5}
							fill={w.role === 'recovery' ? 'var(--background)' : HOT}
							stroke={HOT}
							strokeWidth={2}
						/>
						<text
							x={x(i)}
							y={y(w.hours) - 12}
							textAnchor="middle"
							className="fill-muted-foreground text-[9px] font-bold tabular-nums"
						>
							{w.countsTowardLoad || currency === 'hours'
								? fromHours(w.hours, currency)
								: '—'}
						</text>
					</g>
				))}

				{/* Phase segments as road surface. */}
				{phaseSpans.map((s) => {
					const x0 = pad + s.from * colW + 2
					const w = (s.to - s.from + 1) * colW - 4
					const focus = FOCUS[s.focus as keyof typeof FOCUS]
					return (
						<g
							key={s.id}
							className="cursor-pointer"
							onClick={() => onSelect(s.id)}
						>
							<rect
								x={x0}
								y={H - 30}
								width={w}
								height={selected === s.id ? 18 : 13}
								rx={6}
								fill={focus.hue}
								opacity={selected === s.id ? 1 : 0.55}
							/>
							<text
								x={x0 + w / 2}
								y={H - 30 + (selected === s.id ? 13 : 10)}
								textAnchor="middle"
								className="fill-background text-[9px] font-extrabold tracking-wider uppercase"
							>
								{w > 58 ? s.name : ''}
							</text>
						</g>
					)
				})}

				{/* You are here. */}
				{currentIndex !== null && weeks[currentIndex] ? (
					<g>
						<line
							x1={x(currentIndex)}
							y1={18}
							x2={x(currentIndex)}
							y2={H - 34}
							stroke="var(--foreground)"
							strokeWidth={1.5}
							strokeDasharray="3 3"
						/>
						<circle
							cx={x(currentIndex)}
							cy={y((weeks[currentIndex] as PlannedWeek).hours)}
							r={8}
							fill="var(--foreground)"
						/>
						<text
							x={x(currentIndex)}
							y={13}
							textAnchor="middle"
							className="fill-foreground text-[9px] font-extrabold tracking-wider uppercase"
						>
							You
						</text>
					</g>
				) : null}

				{/* Finish. */}
				{raceName ? (
					<g>
						<line
							x1={W - pad + 8}
							y1={16}
							x2={W - pad + 8}
							y2={H - 34}
							stroke={HOTTER}
							strokeWidth={3}
						/>
						<rect x={W - pad + 8} y={16} width={14} height={11} fill={HOTTER} />
						<rect
							x={W - pad + 8}
							y={27}
							width={14}
							height={11}
							fill="var(--foreground)"
						/>
					</g>
				) : null}
			</svg>
		</div>
	)
}

/** No race? The route closes into a circuit you lap. */
function Circuit({
	phaseSpans,
	weeksPerLap,
	lap,
	selected,
	onSelect,
}: {
	phaseSpans: Array<{ id: string; name: string; weeks: number; focus: string }>
	weeksPerLap: number
	lap: number
	selected: string | null
	onSelect: (id: string) => void
}) {
	const size = 300
	const cx = size / 2
	const cy = size / 2
	const r = 108
	let acc = 0
	const total = phaseSpans.reduce((a, s) => a + s.weeks, 0) || 1

	function arc(from: number, to: number, radius: number) {
		const a1 = ((from - 90) * Math.PI) / 180
		const a2 = ((to - 90) * Math.PI) / 180
		const large = to - from > 180 ? 1 : 0
		return `M ${cx + radius * Math.cos(a1)} ${cy + radius * Math.sin(a1)} A ${radius} ${radius} 0 ${large} 1 ${cx + radius * Math.cos(a2)} ${cy + radius * Math.sin(a2)}`
	}

	return (
		<svg
			width={size}
			height={size}
			viewBox={`0 0 ${size} ${size}`}
			role="img"
			aria-label="Ongoing plan drawn as a repeating circuit"
			className="mx-auto"
		>
			{phaseSpans.map((s) => {
				const from = (acc / total) * 360 + 2
				acc += s.weeks
				const to = (acc / total) * 360 - 2
				const focus = FOCUS[s.focus as keyof typeof FOCUS]
				return (
					<g
						key={s.id}
						className="cursor-pointer"
						onClick={() => onSelect(s.id)}
					>
						<path
							d={arc(from, to, r)}
							stroke="transparent"
							strokeWidth={40}
							fill="none"
						/>
						<path
							d={arc(from, to, r)}
							stroke={focus.hue}
							strokeWidth={selected === s.id ? 28 : 20}
							strokeLinecap="round"
							fill="none"
							opacity={selected === s.id ? 1 : 0.6}
							className="pointer-events-none transition-all duration-300"
						/>
					</g>
				)
			})}
			<text
				x={cx}
				y={cy - 12}
				textAnchor="middle"
				className="fill-foreground text-[38px] font-extrabold tabular-nums"
			>
				LAP {lap}
			</text>
			<text
				x={cx}
				y={cy + 12}
				textAnchor="middle"
				className="fill-muted-foreground text-[11px] font-bold tracking-[0.2em] uppercase"
			>
				of ∞
			</text>
			<text
				x={cx}
				y={cy + 36}
				textAnchor="middle"
				className="fill-muted-foreground text-[11px] font-bold tracking-wider uppercase"
			>
				{weeksPerLap} weeks per lap
			</text>
		</svg>
	)
}

// ---------------------------------------------------------------------------

export function VariantStrava({ store }: { store: PlanStore }) {
	const { plan, derived } = store
	const [selected, setSelected] = useState<string | null>(
		plan.phases[1]?.id ?? null,
	)
	const [swapping, setSwapping] = useState(false)
	const [seasonOpen, setSeasonOpen] = useState(false)

	const cur = plan.currency
	const lapWeeks = derived.weeks.filter((w) => w.cycle === 1)
	const drawn = plan.anchor.kind === 'ongoing' ? lapWeeks : derived.weeks

	const spans: Array<{
		id: string
		name: string
		from: number
		to: number
		focus: string
		weeks: number
	}> = []
	drawn.forEach((w, i) => {
		const last = spans[spans.length - 1]
		if (last && last.id === w.phaseId) {
			last.to = i
			last.weeks += 1
		} else {
			spans.push({
				id: w.phaseId,
				name: w.phaseName,
				from: i,
				to: i,
				focus: w.focus,
				weeks: 1,
			})
		}
	})

	const phase = plan.phases.find((p) => p.id === selected)
	const phaseWeeks = lapWeeks.filter((w) => w.phaseId === selected)
	const untilRace = weeksUntil(plan.anchor.date, store.today)
	const biggest = [...derived.weeks].sort((a, b) => b.hours - a.hours)[0]

	return (
		<div className="mx-auto w-full max-w-3xl px-4 pb-40">
			{/* Destination banner. */}
			<section
				className="mt-6 overflow-hidden rounded-2xl p-6 text-white"
				style={{
					background: `linear-gradient(135deg, ${HOTTER} 0%, ${HOT} 100%)`,
				}}
			>
				<div className="text-[11px] font-bold tracking-[0.2em] uppercase opacity-80">
					{plan.anchor.kind === 'ongoing' ? 'No finish line' : 'Destination'}
				</div>
				<h1 className="mt-1 text-4xl leading-[1.05] font-extrabold tracking-tight uppercase">
					{plan.anchor.kind === 'ongoing' ? 'Keep rolling' : plan.anchor.name}
				</h1>
				<p className="mt-3 text-lg font-semibold">
					{plan.anchor.kind === 'ongoing' ? (
						<>
							{plan.phases.length} blocks · {derived.cycleWeeks} weeks a lap ·
							repeats
						</>
					) : (
						<>
							{untilRace} weeks out · {formatShortDate(plan.anchor.date)}
						</>
					)}
				</p>
				<div className="mt-5 flex flex-wrap gap-2">
					{plan.anchor.kind === 'ongoing' ? (
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
							className="rounded-full bg-white px-4 py-2 text-sm font-extrabold tracking-wide text-black uppercase"
						>
							Put a race on it
						</button>
					) : (
						<button
							type="button"
							onClick={store.goOngoing}
							className="rounded-full bg-white/20 px-4 py-2 text-sm font-extrabold tracking-wide uppercase ring-1 ring-white/40"
						>
							Drop the race — just keep training
						</button>
					)}
					<button
						type="button"
						onClick={() => setSeasonOpen((v) => !v)}
						className="rounded-full bg-white/20 px-4 py-2 text-sm font-extrabold tracking-wide uppercase ring-1 ring-white/40"
					>
						Season templates
					</button>
				</div>
			</section>

			{seasonOpen ? (
				<section className="mt-4 grid gap-3 sm:grid-cols-2">
					{SEASON_TEMPLATES.map((t) => (
						<button
							key={t.key}
							type="button"
							onClick={() => {
								store.applySeasonTemplate(t.key)
								setSeasonOpen(false)
							}}
							className="border-border hover:border-foreground rounded-xl border-2 p-4 text-left transition-colors"
						>
							<div className="text-base font-extrabold tracking-tight uppercase">
								{t.name}
							</div>
							<p className="text-muted-foreground mt-1 text-sm">{t.blurb}</p>
							<p className="text-muted-foreground mt-2 text-[11px] font-bold tracking-wider uppercase">
								Copies in · yours to edit · no link back
							</p>
						</button>
					))}
				</section>
			) : null}

			{/* Currency — what the route is measured in. */}
			<section className="mt-6 flex flex-wrap items-center gap-2">
				<Label>Measured in</Label>
				{CURRENCIES.map((c) => (
					<button
						key={c}
						type="button"
						onClick={() => store.setCurrency(c)}
						aria-pressed={cur === c}
						className={cn(
							'rounded-full px-3 py-1.5 text-xs font-extrabold tracking-widest uppercase transition-colors',
							cur === c
								? 'text-white'
								: 'bg-muted text-muted-foreground hover:bg-muted/70',
						)}
						style={cur === c ? { background: HOT } : undefined}
					>
						{CURRENCY_UNIT[c]}
					</button>
				))}
				<span className="bg-border mx-1 h-5 w-px" />
				<Label>Also</Label>
				{CURRENCIES.filter((c) => c !== cur).map((c) => (
					<button
						key={c}
						type="button"
						onClick={() => store.toggleAlsoTrack(c)}
						aria-pressed={plan.alsoTrack.includes(c)}
						className={cn(
							'rounded-full border-2 px-3 py-1 text-xs font-bold uppercase',
							plan.alsoTrack.includes(c)
								? 'border-foreground text-foreground'
								: 'border-border text-muted-foreground',
						)}
					>
						{CURRENCY_UNIT[c]}
					</button>
				))}
			</section>

			{/* The route. */}
			<section className="border-border bg-card mt-6 rounded-2xl border p-4">
				<div className="mb-2 flex items-center justify-between">
					<Label>
						{plan.anchor.kind === 'ongoing'
							? 'The circuit'
							: 'The route · tap a segment'}
					</Label>
					<span className="text-muted-foreground text-[11px] font-bold uppercase">
						{drawn.length} weeks
					</span>
				</div>
				{plan.anchor.kind === 'ongoing' ? (
					<>
						<Circuit
							phaseSpans={spans}
							weeksPerLap={derived.cycleWeeks}
							lap={plan.cyclesShown}
							selected={selected}
							onSelect={setSelected}
						/>
						<div className="mt-2 flex items-center justify-center gap-2">
							<button
								type="button"
								onClick={() => store.setCyclesShown(plan.cyclesShown - 1)}
								className="bg-muted rounded-full px-3 py-1 text-xs font-bold uppercase"
							>
								Prev lap
							</button>
							<button
								type="button"
								onClick={() => store.setCyclesShown(plan.cyclesShown + 1)}
								className="bg-muted rounded-full px-3 py-1 text-xs font-bold uppercase"
							>
								Next lap
							</button>
						</div>
					</>
				) : (
					<CourseProfile
						weeks={drawn}
						phaseSpans={spans}
						selected={selected}
						onSelect={setSelected}
						currency={cur}
						raceName={plan.anchor.name}
						currentIndex={derived.currentIndex}
					/>
				)}
			</section>

			{/* Milestones along the way. */}
			<section className="mt-6">
				<Label>Milestones</Label>
				<ul className="mt-3 space-y-2">
					{spans
						.filter((s) => s.id !== 'taper')
						.map((s, i) => {
							const last = lapWeeks.filter((w) => w.phaseId === s.id).at(-1)
							return (
								<li
									key={s.id}
									className="border-border bg-card flex items-center gap-3 rounded-xl border px-4 py-3"
								>
									<span
										className="text-background grid size-9 shrink-0 place-items-center rounded-full text-xs font-extrabold"
										style={{
											background: FOCUS[s.focus as keyof typeof FOCUS].hue,
										}}
									>
										{i + 1}
									</span>
									<div className="min-w-0 flex-1">
										<p className="truncate text-sm font-bold uppercase">
											{s.name} complete
										</p>
										<p className="text-muted-foreground text-xs">
											{s.weeks} weeks ·{' '}
											{formatShortDate(last?.startDate ?? null)}
										</p>
									</div>
									<Icon
										name="circle-check"
										size="md"
										className="text-muted-foreground shrink-0"
									/>
								</li>
							)
						})}
					{plan.anchor.kind === 'ongoing' ? (
						<li className="border-border flex items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3">
							<span className="bg-muted grid size-9 shrink-0 place-items-center rounded-full">
								<Icon name="update" size="sm" />
							</span>
							<div>
								<p className="text-sm font-bold uppercase">Lap it again</p>
								<p className="text-muted-foreground text-xs">
									Same three blocks, a little more each time.
								</p>
							</div>
						</li>
					) : (
						<li
							className="flex items-center gap-3 rounded-xl px-4 py-3 text-white"
							style={{ background: HOTTER }}
						>
							<span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/25">
								<Icon name="check" size="sm" />
							</span>
							<div>
								<p className="text-sm font-extrabold uppercase">
									{plan.anchor.name}
								</p>
								<p className="text-xs opacity-90">
									After a {plan.taperWeeks}-week taper — volume down, intensity
									held.
								</p>
							</div>
						</li>
					)}
				</ul>
			</section>

			{/* Stats as achievements. */}
			<section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
				<Achievement
					value={`${fromHours(derived.loadHours, cur)}`}
					label={`Season ${CURRENCY_UNIT[cur]}`}
					sub={plan.alsoTrack
						.map(
							(c) => `${fromHours(derived.loadHours, c)} ${CURRENCY_UNIT[c]}`,
						)
						.join(' · ')}
				/>
				<Achievement
					value={`${derived.totalWeeks}`}
					label="Weeks planned"
					sub={
						plan.anchor.kind === 'ongoing'
							? `${plan.cyclesShown} laps shown`
							: 'to the finish'
					}
				/>
				<Achievement
					value={
						biggest
							? `${biggest.countsTowardLoad || cur === 'hours' ? fromHours(biggest.hours, cur) : '—'}`
							: '—'
					}
					label="Biggest week"
					sub={biggest ? biggest.phaseName : undefined}
				/>
				<Achievement
					value={derived.unloadedHours ? `${derived.unloadedHours}h` : '0'}
					label="Gym time"
					sub="No TSS — off the load books"
				/>
			</section>

			{/* Segment editor. */}
			{phase ? (
				<section className="border-foreground bg-card mt-6 rounded-2xl border-2 p-5">
					<div className="flex flex-wrap items-center gap-3">
						<span
							className="h-8 w-2 rounded-full"
							style={{ background: FOCUS[phase.focus].hue }}
						/>
						<h2 className="flex-1 text-2xl font-extrabold tracking-tight uppercase">
							{phase.name}
						</h2>
						<span className="text-muted-foreground text-xs font-bold uppercase">
							Segment {spans.findIndex((s) => s.id === phase.id) + 1} of{' '}
							{spans.length}
						</span>
					</div>

					<div className="mt-4 grid gap-4 sm:grid-cols-2">
						<div>
							<Label>Weekly target</Label>
							<div className="mt-2 flex items-center gap-3">
								<button
									type="button"
									onClick={() =>
										store.nudgePhaseVolume(
											phase.id,
											cur === 'hours' ? -0.5 : cur === 'km' ? -5 : -30,
										)
									}
									aria-label="Less volume"
									className="bg-muted grid size-10 place-items-center rounded-full font-bold"
								>
									<Icon name="minus" size="sm" />
								</button>
								<div className="text-3xl font-extrabold tabular-nums">
									{FOCUS[phase.focus].countsTowardLoad || cur === 'hours'
										? fromHours(phase.baseHours, cur)
										: '—'}
									<span className="text-muted-foreground ml-1 text-sm font-bold uppercase">
										{CURRENCY_UNIT[cur]}
									</span>
								</div>
								<button
									type="button"
									onClick={() =>
										store.nudgePhaseVolume(
											phase.id,
											cur === 'hours' ? 0.5 : cur === 'km' ? 5 : 30,
										)
									}
									aria-label="More volume"
									className="bg-muted grid size-10 place-items-center rounded-full font-bold"
								>
									<Icon name="plus" size="sm" />
								</button>
							</div>
							{plan.alsoTrack.length ? (
								<p className="text-muted-foreground mt-1 text-xs">
									{plan.alsoTrack
										.map((c) =>
											FOCUS[phase.focus].countsTowardLoad || c === 'hours'
												? `${fromHours(phase.baseHours, c)} ${CURRENCY_UNIT[c]}`
												: `— ${CURRENCY_UNIT[c]}`,
										)
										.join(' · ')}
								</p>
							) : null}
						</div>

						<div>
							<Label>Length</Label>
							<div className="mt-2 flex items-center gap-3">
								<button
									type="button"
									onClick={() =>
										store.updatePhase(phase.id, {
											weeks: Math.max(1, phase.weeks - 1),
										})
									}
									aria-label="Shorter block"
									className="bg-muted grid size-10 place-items-center rounded-full"
								>
									<Icon name="minus" size="sm" />
								</button>
								<div className="text-3xl font-extrabold tabular-nums">
									{phase.weeks}
									<span className="text-muted-foreground ml-1 text-sm font-bold uppercase">
										wk
									</span>
								</div>
								<button
									type="button"
									onClick={() =>
										store.updatePhase(phase.id, {
											weeks: Math.min(12, phase.weeks + 1),
										})
									}
									aria-label="Longer block"
									className="bg-muted grid size-10 place-items-center rounded-full"
								>
									<Icon name="plus" size="sm" />
								</button>
							</div>
						</div>
					</div>

					<div className="mt-5">
						<Label>Focus</Label>
						<div className="mt-2 flex flex-wrap gap-2">
							{FOCUS_KEYS.map((f) => (
								<button
									key={f}
									type="button"
									onClick={() => store.setPhaseFocus(phase.id, f)}
									aria-pressed={phase.focus === f}
									className={cn(
										'rounded-full px-3 py-1.5 text-xs font-extrabold tracking-wide uppercase',
										phase.focus === f
											? 'text-background'
											: 'bg-muted text-muted-foreground',
									)}
									style={
										phase.focus === f ? { background: FOCUS[f].hue } : undefined
									}
								>
									{FOCUS[f].label}
								</button>
							))}
						</div>
						{!FOCUS[phase.focus].countsTowardLoad ? (
							<p className="bg-muted mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold uppercase">
								<Icon name="barbell" size="sm" />
								No TSS — doesn’t count toward load targets
							</p>
						) : null}
					</div>

					<div className="mt-5">
						<Label>Rhythm — this segment only</Label>
						<div className="mt-2 flex flex-wrap gap-2">
							{RHYTHMS.map((r) => (
								<button
									key={r}
									type="button"
									onClick={() => store.setPhaseRhythm(phase.id, r)}
									aria-pressed={phase.rhythm === r}
									className={cn(
										'flex items-center gap-2 rounded-full border-2 px-3 py-1.5 text-xs font-extrabold uppercase',
										phase.rhythm === r
											? 'border-foreground'
											: 'border-border text-muted-foreground',
									)}
								>
									{r === 'none' ? 'Straight' : r}
									<span className="flex items-end gap-[2px]" aria-hidden>
										{(r === '3:1'
											? [1, 1, 1, 0.55]
											: r === '2:1'
												? [1, 1, 0.55]
												: [1, 1, 1]
										).map((h, k) => (
											<span
												key={k}
												className="w-[3px] rounded-full"
												style={{
													height: `${6 + h * 10}px`,
													background: h === 1 ? HOT : 'var(--muted-foreground)',
												}}
											/>
										))}
									</span>
								</button>
							))}
						</div>
						<div className="mt-3 flex gap-1.5">
							{phaseWeeks.map((w) => (
								<div key={w.index} className="flex-1 text-center">
									<div
										className="rounded-md"
										style={{
											height: `${10 + 34 * (w.hours / Math.max(...phaseWeeks.map((x) => x.hours), 0.1))}px`,
											background:
												w.role === 'load' ? HOT : 'var(--muted-foreground)',
											opacity: w.role === 'load' ? 1 : 0.4,
										}}
									/>
									<div className="text-muted-foreground mt-1 text-[10px] font-bold uppercase">
										{w.role === 'recovery' ? 'rec' : `L${w.loadNumber}`}
									</div>
								</div>
							))}
						</div>
					</div>

					<div className="border-border mt-5 flex flex-wrap gap-2 border-t pt-4">
						<button
							type="button"
							onClick={() => setSwapping((v) => !v)}
							className="bg-foreground text-background rounded-full px-4 py-2 text-xs font-extrabold tracking-wide uppercase"
						>
							Swap segment
						</button>
						<button
							type="button"
							onClick={() => store.movePhase(phase.id, -1)}
							className="bg-muted rounded-full px-4 py-2 text-xs font-extrabold tracking-wide uppercase"
						>
							Earlier
						</button>
						<button
							type="button"
							onClick={() => store.movePhase(phase.id, 1)}
							className="bg-muted rounded-full px-4 py-2 text-xs font-extrabold tracking-wide uppercase"
						>
							Later
						</button>
					</div>

					{swapping ? (
						<ol className="divide-border border-border mt-4 divide-y rounded-xl border">
							{BLOCK_TEMPLATES.map((t, i) => (
								<li key={t.key}>
									<button
										type="button"
										onClick={() => {
											store.replacePhaseWithTemplate(phase.id, t)
											setSwapping(false)
										}}
										className="hover:bg-muted/60 flex w-full items-center gap-3 px-4 py-3 text-left"
									>
										<span className="text-muted-foreground w-5 text-sm font-extrabold tabular-nums">
											{i + 1}
										</span>
										<span className="min-w-0 flex-1">
											<span className="block text-sm font-bold uppercase">
												{t.name}
											</span>
											<span className="text-muted-foreground block text-xs">
												{t.blurb}
											</span>
										</span>
										<Icon name="arrow-right" size="sm" />
									</button>
								</li>
							))}
						</ol>
					) : null}
				</section>
			) : null}

			<button
				type="button"
				onClick={() => {
					const t = BLOCK_TEMPLATES[0]
					if (t) store.appendBlockTemplate(t)
				}}
				className="mt-6 w-full rounded-full py-4 text-sm font-extrabold tracking-widest text-white uppercase"
				style={{ background: HOT }}
			>
				+ Add a segment
			</button>

			{store.whisper ? (
				<div
					key={store.whisper.id}
					role="status"
					className="mt-4 rounded-xl border-2 border-dashed p-4 text-center text-sm font-bold uppercase"
					style={{ borderColor: HOT, color: HOT }}
				>
					{store.whisper.text}
				</div>
			) : null}
		</div>
	)
}

export { RHYTHM_LABEL }
