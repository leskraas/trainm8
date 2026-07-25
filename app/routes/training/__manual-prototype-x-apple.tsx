/**
 * PROTOTYPE — throwaway. Variant A: "Apple". Opinionated simplicity — one thing
 * on screen, the plan as a physical object you thumb through. Blocks are closed
 * spines; opening one turns it into a full page with a segmented ring. Delete
 * with the route.
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
	type Focus,
	formatShortDate,
	fromHours,
	type PlannedWeek,
	RHYTHM_LABEL,
	RHYTHMS,
	SEASON_TEMPLATES,
	weeksUntil,
} from './__manual-prototype-x-model.ts'
import { type PlanStore } from './__manual-prototype-x-state.ts'

export const APPLE_NAME = 'Apple — thumb through it'

// ---------------------------------------------------------------------------

export function Sheet({
	title,
	subtitle,
	onClose,
	children,
}: {
	title: string
	subtitle?: string
	onClose: () => void
	children: React.ReactNode
}) {
	return (
		<div className="fixed inset-0 z-40 flex items-end justify-center">
			<button
				type="button"
				aria-label="Close"
				onClick={onClose}
				className="absolute inset-0 bg-black/40 backdrop-blur-sm"
			/>
			<div className="relative max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-t-[2rem] bg-background px-6 pt-3 pb-10 shadow-2xl">
				<div className="mx-auto mb-6 h-1.5 w-10 rounded-full bg-muted-foreground/30" />
				<h2 className="text-center text-2xl font-semibold tracking-tight">
					{title}
				</h2>
				{subtitle ? (
					<p className="mt-1 mb-6 text-center text-sm text-muted-foreground">
						{subtitle}
					</p>
				) : (
					<div className="mb-6" />
				)}
				{children}
			</div>
		</div>
	)
}

export function Segmented<T extends string>({
	options,
	value,
	onChange,
	label,
}: {
	options: Array<{ key: T; label: string }>
	value: T
	onChange: (v: T) => void
	label: string
}) {
	return (
		<div
			role="group"
			aria-label={label}
			className="flex gap-1 rounded-full bg-muted p-1"
		>
			{options.map((o) => (
				<button
					key={o.key}
					type="button"
					onClick={() => onChange(o.key)}
					aria-pressed={value === o.key}
					className={cn(
						'flex-1 rounded-full px-3 py-2 text-sm font-medium transition-all duration-150 active:scale-[0.97]',
						value === o.key
							? 'bg-background text-foreground shadow-sm'
							: 'text-muted-foreground',
					)}
				>
					{o.label}
				</button>
			))}
		</div>
	)
}

/**
 * The block's weeks as a radial bar ring: segment length is volume, so a 3:1
 * rhythm reads as three tall bars and one short one — the rhythm *is* the
 * texture, not a settings row.
 */
export function WeekRing({
	weeks,
	focus,
	selected,
	onSelect,
	size = 232,
}: {
	weeks: PlannedWeek[]
	focus: Focus
	selected: number
	onSelect: (weekInPhase: number) => void
	size?: number
}) {
	const meta = FOCUS[focus]
	const cx = size / 2
	const cy = size / 2
	const rOuter = size / 2 - 6
	const rInner = size / 2 - 44
	const max = Math.max(...weeks.map((w) => w.hours), 0.1)
	const gap = weeks.length > 8 ? 2.5 : 5
	const step = 360 / Math.max(weeks.length, 1)

	function arc(from: number, to: number, r: number) {
		const a1 = ((from - 90) * Math.PI) / 180
		const a2 = ((to - 90) * Math.PI) / 180
		const large = to - from > 180 ? 1 : 0
		return `M ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)} A ${r} ${r} 0 ${large} 1 ${cx + r * Math.cos(a2)} ${cy + r * Math.sin(a2)}`
	}

	return (
		<svg
			width={size}
			height={size}
			viewBox={`0 0 ${size} ${size}`}
			role="img"
			aria-label={`${weeks.length} training weeks, rhythm shown as ring texture`}
		>
			<circle
				cx={cx}
				cy={cy}
				r={(rOuter + rInner) / 2}
				fill="none"
				stroke="var(--muted)"
				strokeWidth={1}
			/>
			{weeks.map((w, i) => {
				const from = i * step + gap / 2
				const to = (i + 1) * step - gap / 2
				const frac = w.hours / max
				const r = rInner + (rOuter - rInner) * frac
				const isRecovery = w.role === 'recovery' || w.role === 'taper'
				const isSel = w.weekInPhase === selected
				return (
					<g key={w.index}>
						<path
							d={arc(from, to, (rInner + rOuter) / 2)}
							stroke="transparent"
							strokeWidth={rOuter - rInner + 14}
							fill="none"
							className="cursor-pointer"
							onClick={() => onSelect(w.weekInPhase)}
						/>
						<path
							d={arc(from, to, r)}
							stroke={isSel ? meta.hue : isRecovery ? meta.ring : meta.hue}
							strokeWidth={isRecovery ? 7 : 14}
							strokeLinecap="round"
							strokeDasharray={isRecovery ? '1 9' : undefined}
							fill="none"
							opacity={isSel ? 1 : isRecovery ? 0.9 : 0.75}
							className="pointer-events-none transition-all duration-300"
						/>
						{isSel ? (
							<path
								d={arc(from, to, rOuter + 4)}
								stroke={meta.hue}
								strokeWidth={2}
								strokeLinecap="round"
								fill="none"
								className="pointer-events-none"
							/>
						) : null}
					</g>
				)
			})}
		</svg>
	)
}

export function Stepper({
	onDown,
	onUp,
	children,
}: {
	onDown: () => void
	onUp: () => void
	children: React.ReactNode
}) {
	return (
		<div className="flex items-center gap-3">
			<button
				type="button"
				onClick={onDown}
				aria-label="Decrease"
				className="grid size-11 place-items-center rounded-full bg-muted text-foreground transition-transform active:scale-90"
			>
				<Icon name="minus" size="md" />
			</button>
			<div className="min-w-[7rem] text-center">{children}</div>
			<button
				type="button"
				onClick={onUp}
				aria-label="Increase"
				className="grid size-11 place-items-center rounded-full bg-muted text-foreground transition-transform active:scale-90"
			>
				<Icon name="plus" size="md" />
			</button>
		</div>
	)
}

// ---------------------------------------------------------------------------

export function VariantApple({ store }: { store: PlanStore }) {
	const { plan, derived } = store
	const [openPhase, setOpenPhase] = useState<string | null>(
		plan.phases[1]?.id ?? plan.phases[0]?.id ?? null,
	)
	const [selectedWeek, setSelectedWeek] = useState(1)
	const [sheet, setSheet] = useState<
		null | 'anchor' | 'season' | 'block' | { swap: string }
	>(null)

	const cur = plan.currency
	const unit = CURRENCY_UNIT[cur]
	const untilRace = weeksUntil(plan.anchor.date, store.today)

	const weeksByPhase = new Map<string, PlannedWeek[]>()
	for (const w of derived.weeks) {
		if (w.cycle !== 1) continue
		const list = weeksByPhase.get(w.phaseId) ?? []
		list.push(w)
		weeksByPhase.set(w.phaseId, list)
	}

	return (
		<div className="mx-auto w-full max-w-xl px-5 pb-40">
			{/* One question, asked large. */}
			<section className="pt-12 pb-10 text-center">
				<p className="text-[13px] font-medium tracking-widest text-muted-foreground uppercase">
					{plan.anchor.kind === 'ongoing'
						? 'You’re building'
						: 'You’re building toward'}
				</p>
				<h1 className="mt-3 text-[2.6rem] leading-[1.05] font-semibold tracking-tight text-balance">
					{plan.anchor.kind === 'ongoing' ? 'Ongoing fitness' : plan.anchor.name}
				</h1>
				<p className="mt-4 text-lg text-muted-foreground">
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
					className="mt-6 rounded-full bg-muted px-5 py-2.5 text-sm font-medium transition-transform active:scale-95"
				>
					Change what you’re building toward
				</button>
			</section>

			{/* The plan speaks one language; the rest is small print. */}
			<section className="mb-10">
				<Segmented
					label="Volume currency"
					value={cur}
					onChange={store.setCurrency}
					options={CURRENCIES.map((c) => ({
						key: c,
						label: CURRENCY_UNIT[c],
					}))}
				/>
				<p className="mt-3 text-center text-[13px] text-muted-foreground">
					This plan speaks <strong className="text-foreground">{unit}</strong>.
					Everything else is shown small.
				</p>
			</section>

			{/* Season total — one number, big. */}
			<section className="mb-12 text-center">
				<div className="text-mega leading-none font-semibold tracking-tight tabular-nums">
					{fromHours(derived.loadHours, cur)}
				</div>
				<div className="mt-1 text-sm text-muted-foreground">
					{unit} across {derived.totalWeeks} training weeks
				</div>
				{derived.unloadedHours > 0 ? (
					<p className="mx-auto mt-3 max-w-xs text-[13px] text-muted-foreground">
						Plus {derived.unloadedHours} h of strength — no TSS, so it isn’t in
						that number.
					</p>
				) : null}
			</section>

			{/* The plan as a stack of pages: spines closed, one page open. */}
			<div className="space-y-3">
				{plan.phases.map((phase, i) => {
					const weeks = weeksByPhase.get(phase.id) ?? []
					const meta = FOCUS[phase.focus]
					const open = openPhase === phase.id
					const peak = Math.max(...weeks.map((w) => w.hours), 0)
					const sel =
						weeks.find((w) => w.weekInPhase === selectedWeek) ?? weeks[0]

					if (!open) {
						return (
							<button
								key={phase.id}
								type="button"
								onClick={() => {
									setOpenPhase(phase.id)
									setSelectedWeek(1)
								}}
								className="flex w-full items-center gap-4 rounded-2xl border border-border/60 bg-card px-5 py-4 text-left transition-all duration-200 active:scale-[0.99]"
							>
								<span
									className="h-10 w-1.5 shrink-0 rounded-full"
									style={{ background: meta.hue }}
								/>
								<span className="min-w-0 flex-1">
									<span className="block truncate text-base font-medium">
										{phase.name}
									</span>
									<span className="block text-[13px] text-muted-foreground">
										{phase.weeks} weeks · {meta.label}
									</span>
								</span>
								{/* The rhythm, as texture on the spine. */}
								<span className="flex items-end gap-[3px]" aria-hidden>
									{weeks.map((w) => (
										<span
											key={w.index}
											className="w-[5px] rounded-full"
											style={{
												height: `${8 + 22 * (w.hours / (peak || 1))}px`,
												background:
													w.role === 'load' ? meta.hue : meta.ring,
												opacity: w.role === 'load' ? 0.85 : 1,
											}}
										/>
									))}
								</span>
								<Icon
									name="chevron-right"
									size="sm"
									className="shrink-0 text-muted-foreground"
								/>
							</button>
						)
					}

					return (
						<article
							key={phase.id}
							className="overflow-hidden rounded-[1.75rem] border border-border/60 bg-card shadow-sm"
						>
							<header className="flex items-center gap-3 px-6 pt-6">
								<div className="min-w-0 flex-1">
									<h2 className="truncate text-2xl font-semibold tracking-tight">
										{phase.name}
									</h2>
									<p className="text-sm text-muted-foreground">
										Block {i + 1} of {plan.phases.length}
										{phase.origin ? ` · from “${phase.origin}”` : ''}
									</p>
								</div>
								<button
									type="button"
									onClick={() => setOpenPhase(null)}
									aria-label="Close block"
									className="grid size-9 place-items-center rounded-full bg-muted transition-transform active:scale-90"
								>
									<Icon name="chevron-up" size="sm" />
								</button>
							</header>

							<div className="relative mt-4 grid place-items-center">
								<WeekRing
									weeks={weeks}
									focus={phase.focus}
									selected={selectedWeek}
									onSelect={setSelectedWeek}
								/>
								<div className="pointer-events-none absolute grid place-items-center text-center">
									<div className="text-4xl font-semibold tracking-tight tabular-nums">
										{sel
											? sel.countsTowardLoad || cur === 'hours'
												? fromHours(sel.hours, cur)
												: '—'
											: '—'}
									</div>
									<div className="text-xs tracking-wide text-muted-foreground uppercase">
										{unit} · week {selectedWeek}
									</div>
								</div>
							</div>

							{sel ? (
								<div className="px-6 pt-2 pb-6 text-center">
									<p className="text-sm font-medium">
										{sel.role === 'recovery'
											? 'Recovery week'
											: sel.loadNumber
												? `Load week ${sel.loadNumber} of ${sel.loadTotal}`
												: 'Load week'}
										<span className="text-muted-foreground">
											{' '}
											· {formatShortDate(sel.startDate)}
										</span>
									</p>
									<p className="mt-1 text-[13px] text-muted-foreground">
										{sel.countsTowardLoad
											? CURRENCIES.filter((c) => c !== cur)
													.map(
														(c) =>
															`${fromHours(sel.hours, c)} ${CURRENCY_UNIT[c]}`,
													)
													.join('  ·  ')
											: `${fromHours(sel.hours, 'hours')} h in the gym — no TSS, no km`}
									</p>
									<div className="mt-5 flex justify-center">
										<Stepper
											onDown={() =>
												store.setWeekOverride(
													phase.id,
													sel.weekInPhase,
													fromHours(sel.hours, cur) - (cur === 'hours' ? 0.5 : cur === 'km' ? 5 : 30),
												)
											}
											onUp={() =>
												store.setWeekOverride(
													phase.id,
													sel.weekInPhase,
													fromHours(sel.hours, cur) + (cur === 'hours' ? 0.5 : cur === 'km' ? 5 : 30),
												)
											}
										>
											<span className="text-sm text-muted-foreground">
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
											className="mt-3 text-[13px] text-muted-foreground underline underline-offset-4"
										>
											Edited by hand — restore the rhythm
										</button>
									) : null}
								</div>
							) : null}

							{/* Progressive disclosure: the knobs come after the picture. */}
							<div className="divide-y divide-border/60 border-t border-border/60">
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
								{!FOCUS[phase.focus].countsTowardLoad ? (
									<div className="flex items-start gap-2 bg-muted/40 px-6 py-3 text-[13px] text-muted-foreground">
										<Icon name="info-circle" size="sm" className="mt-0.5" />
										<span>
											Strength carries no TSS. These weeks show hours only and
											stay out of every load target.
										</span>
									</div>
								) : null}
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
								<Row label="Peak week">
									<span className="text-lg font-medium tabular-nums">
										{FOCUS[phase.focus].countsTowardLoad || cur === 'hours'
											? `${fromHours(peak, cur)} ${unit}`
											: '—'}
									</span>
								</Row>
								<div className="flex flex-wrap gap-2 px-6 py-4">
									<button
										type="button"
										onClick={() => setSheet({ swap: phase.id })}
										className="rounded-full bg-muted px-4 py-2 text-sm font-medium transition-transform active:scale-95"
									>
										Swap for a block template
									</button>
									<button
										type="button"
										onClick={() => store.movePhase(phase.id, -1)}
										className="rounded-full bg-muted px-4 py-2 text-sm font-medium transition-transform active:scale-95"
									>
										Move earlier
									</button>
									<button
										type="button"
										onClick={() => store.removePhase(phase.id)}
										className="rounded-full px-4 py-2 text-sm font-medium text-foreground-destructive transition-transform active:scale-95"
									>
										Remove
									</button>
								</div>
							</div>
						</article>
					)
				})}

				{/* The end of the book: taper, or the loop mark. */}
				{plan.anchor.kind === 'ongoing' ? (
					<div className="rounded-2xl border border-dashed border-border px-5 py-6 text-center">
						<Icon
							name="update"
							size="lg"
							className="mx-auto mb-2 text-muted-foreground"
						/>
						<p className="text-base font-medium">…and back to the top</p>
						<p className="mt-1 text-[13px] text-muted-foreground">
							These {plan.phases.length} blocks repeat every{' '}
							{derived.cycleWeeks} weeks, indefinitely.
						</p>
						<button
							type="button"
							onClick={() =>
								store.attachRace(
									store.seedEvent.name,
									store.seedEvent.date ??
										new Date(Date.now() + 84 * 864e5).toISOString().slice(0, 10),
								)
							}
							className="mt-4 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-transform active:scale-95"
						>
							Attach a race
						</button>
					</div>
				) : (
					<div className="rounded-2xl border border-border/60 bg-card px-5 py-4">
						<div className="flex items-center gap-4">
							<span className="h-10 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
							<div className="min-w-0 flex-1">
								<p className="text-base font-medium">Taper</p>
								<p className="text-[13px] text-muted-foreground">
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
					className="flex items-center justify-center gap-2 rounded-full bg-foreground px-5 py-3.5 text-base font-medium text-background transition-transform active:scale-[0.98]"
				>
					<Icon name="plus" size="sm" /> Add a block
				</button>
				<button
					type="button"
					onClick={() => setSheet('season')}
					className="rounded-full bg-muted px-5 py-3.5 text-base font-medium transition-transform active:scale-[0.98]"
				>
					Start over from a season template
				</button>
			</div>

			{store.whisper ? (
				<p
					key={store.whisper.id}
					role="status"
					className="mt-6 text-center text-[13px] text-muted-foreground"
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
						<BigChoice
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
						<BigChoice
							title="A fitness goal"
							detail="Sets a date without a start line"
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
						<BigChoice
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
							<BigChoice
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
							<BigChoice
								key={t.key}
								title={t.name}
								detail={t.blurb}
								icon={t.focus === 'strength' ? 'barbell' : 'clock'}
								selected={false}
								onClick={() => {
									if (sheet && typeof sheet === 'object') {
										store.replacePhaseWithTemplate(sheet.swap, t)
									} else {
										store.appendBlockTemplate(t)
									}
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

function Row({
	label,
	children,
}: {
	label: string
	children: React.ReactNode
}) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
			<span className="text-sm font-medium text-muted-foreground">{label}</span>
			{children}
		</div>
	)
}

function BigChoice({
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
			<span className="grid size-11 shrink-0 place-items-center rounded-full bg-muted">
				<Icon name={icon} size="md" />
			</span>
			<span className="min-w-0 flex-1">
				<span className="block text-base font-medium">{title}</span>
				<span className="block text-[13px] text-muted-foreground">{detail}</span>
			</span>
			{selected ? <Icon name="check" size="md" /> : null}
		</button>
	)
}

export { RHYTHM_LABEL }
