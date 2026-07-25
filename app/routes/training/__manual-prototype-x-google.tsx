/**
 * PROTOTYPE — throwaway. Variant B: "Google / Material 3". Planning as a
 * conversation — the athlete states intent, the system answers with suggestion
 * chips; editing happens in bottom sheets. Adaptive card grid, data-forward but
 * friendly. Delete with the route.
 */
import { useState } from 'react'
import { Icon } from '#app/components/ui/icon.tsx'
import { cn } from '#app/utils/misc.tsx'
import {
	BLOCK_TEMPLATES,
	CURRENCIES,
	CURRENCY_LABEL,
	CURRENCY_UNIT,
	FOCUS,
	FOCUS_KEYS,
	formatShortDate,
	fromHours,
	type PlannedWeek,
	rampPercent,
	RHYTHM_LABEL,
	RHYTHMS,
	SEASON_TEMPLATES,
	toHours,
	weeksUntil,
} from './__manual-prototype-x-model.ts'
import { type PlanStore } from './__manual-prototype-x-state.ts'

export const GOOGLE_NAME = 'Google — suggested for you'

type Suggestion = {
	id: string
	icon: 'update' | 'plus' | 'alert-triangle' | 'barbell' | 'bar-chart' | 'clock'
	label: string
	why: string
	apply: () => void
}

function buildSuggestions(store: PlanStore): Suggestion[] {
	const { plan, derived } = store
	const out: Suggestion[] = []

	if (plan.anchor.kind === 'ongoing') {
		out.push({
			id: 'attach',
			icon: 'plus',
			label: `Attach ${store.seedEvent.name}`,
			why: 'You can point an endless plan at a race whenever one appears.',
			apply: () =>
				store.attachRace(
					store.seedEvent.name,
					store.seedEvent.date ??
						new Date(Date.now() + 84 * 864e5).toISOString().slice(0, 10),
				),
		})
	} else if (plan.taperWeeks === 0) {
		out.push({
			id: 'taper',
			icon: 'clock',
			label: 'Add a 2-week taper',
			why: 'Volume falls, intensity holds — the shape the evidence supports.',
			apply: () => store.setTaperWeeks(2),
		})
	}

	const straight = plan.phases.find((p) => p.rhythm === 'none' && p.weeks >= 4)
	if (straight) {
		out.push({
			id: `rhythm-${straight.id}`,
			icon: 'update',
			label: `Give ${straight.name} a 3:1 rhythm`,
			why: `${straight.weeks} straight loading weeks is a long time without a down week.`,
			apply: () => store.setPhaseRhythm(straight.id, '3:1'),
		})
	}

	const hot = derived.weeks.findIndex(
		(_, i) => (rampPercent(derived.weeks, i) ?? 0) > 12,
	)
	if (hot > 0) {
		const w = derived.weeks[hot] as PlannedWeek
		out.push({
			id: `ramp-${hot}`,
			icon: 'alert-triangle',
			label: `Ease week ${hot + 1} (+${rampPercent(derived.weeks, hot)}%)`,
			why: 'Week-over-week volume jumps more than 12% here.',
			apply: () =>
				store.setWeekOverride(
					w.phaseId,
					w.weekInPhase,
					fromHours((derived.weeks[hot - 1] as PlannedWeek).hours * 1.06, plan.currency),
				),
		})
	}

	if (!plan.phases.some((p) => p.focus === 'strength')) {
		const strengthTemplate = BLOCK_TEMPLATES.find((t) => t.focus === 'strength')
		if (strengthTemplate) {
			out.push({
				id: 'strength',
				icon: 'barbell',
				label: 'Add a Strength block',
				why: 'Carries no TSS — it will never move your load targets.',
				apply: () => store.appendBlockTemplate(strengthTemplate),
			})
		}
	}

	if (plan.alsoTrack.length === 0) {
		const other = CURRENCIES.find((c) => c !== plan.currency)
		if (other) {
			out.push({
				id: 'also',
				icon: 'bar-chart',
				label: `Also track ${CURRENCY_UNIT[other]}`,
				why: 'Two targets per week, one primary and one you glance at.',
				apply: () => store.toggleAlsoTrack(other),
			})
		}
	}

	return out
}

// ---------------------------------------------------------------------------

function Chip({
	children,
	selected,
	onClick,
	icon,
	tone = 'default',
}: {
	children: React.ReactNode
	selected?: boolean
	onClick?: () => void
	icon?: React.ReactNode
	tone?: 'default' | 'suggest'
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={selected}
			className={cn(
				'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-all duration-200',
				'hover:shadow-sm active:scale-[0.97]',
				selected
					? 'border-transparent bg-primary text-primary-foreground'
					: tone === 'suggest'
						? 'border-transparent bg-accent text-accent-foreground'
						: 'border-border bg-transparent text-foreground',
			)}
		>
			{icon}
			{children}
		</button>
	)
}

function BottomSheet({
	title,
	onClose,
	children,
}: {
	title: string
	onClose: () => void
	children: React.ReactNode
}) {
	return (
		<div className="fixed inset-0 z-40 flex items-end justify-center">
			<button
				type="button"
				aria-label="Close"
				onClick={onClose}
				className="absolute inset-0 bg-black/30"
			/>
			<div className="relative max-h-[86vh] w-full max-w-2xl animate-in slide-in-from-bottom-8 overflow-y-auto rounded-t-[1.75rem] bg-card px-5 pt-3 pb-10 shadow-2xl duration-300">
				<div className="mx-auto mb-4 h-1 w-8 rounded-full bg-muted-foreground/40" />
				<div className="mb-4 flex items-center gap-3">
					<h2 className="flex-1 text-xl font-medium">{title}</h2>
					<button
						type="button"
						onClick={onClose}
						aria-label="Close sheet"
						className="grid size-10 place-items-center rounded-full hover:bg-muted"
					>
						<Icon name="cross-1" size="sm" />
					</button>
				</div>
				{children}
			</div>
		</div>
	)
}

function WeekBars({
	weeks,
	hue,
	ring,
}: {
	weeks: PlannedWeek[]
	hue: string
	ring: string
}) {
	const max = Math.max(...weeks.map((w) => w.hours), 0.1)
	return (
		<div className="flex h-16 items-end gap-1.5" aria-hidden>
			{weeks.map((w) => (
				<div
					key={w.index}
					className="flex-1 rounded-t-md transition-all duration-500"
					style={{
						height: `${Math.max(12, (w.hours / max) * 100)}%`,
						background: w.role === 'load' ? hue : ring,
						opacity: w.overridden ? 1 : 0.9,
						outline: w.overridden ? '2px dashed var(--foreground)' : undefined,
						outlineOffset: '1px',
					}}
					title={`Week ${w.weekInPhase}`}
				/>
			))}
		</div>
	)
}

// ---------------------------------------------------------------------------

export function VariantGoogle({ store }: { store: PlanStore }) {
	const { plan, derived } = store
	const [sheet, setSheet] = useState<
		null | { kind: 'block'; phaseId: string } | { kind: 'templates'; swap: string | null } | { kind: 'season' } | { kind: 'anchor' }
	>(null)
	const [dismissed, setDismissed] = useState<string[]>([])

	const cur = plan.currency
	const suggestions = buildSuggestions(store).filter(
		(s) => !dismissed.includes(s.id),
	)
	const untilRace = weeksUntil(plan.anchor.date, store.today)

	const weeksByPhase = new Map<string, PlannedWeek[]>()
	for (const w of derived.weeks) {
		if (w.cycle !== 1) continue
		const list = weeksByPhase.get(w.phaseId) ?? []
		list.push(w)
		weeksByPhase.set(w.phaseId, list)
	}

	const editing =
		sheet && sheet.kind === 'block'
			? plan.phases.find((p) => p.id === sheet.phaseId)
			: undefined

	return (
		<div className="mx-auto w-full max-w-5xl px-4 pb-40">
			{/* Intent line — the athlete's half of the conversation. */}
			<section className="pt-8">
				<div className="rounded-[1.75rem] bg-accent p-5 md:p-7">
					<p className="text-sm text-muted-foreground">I’m training</p>
					<div className="mt-2 flex flex-wrap items-center gap-2">
						<button
							type="button"
							onClick={() => setSheet({ kind: 'anchor' })}
							className="rounded-xl bg-card px-4 py-2.5 text-xl font-medium shadow-sm transition-transform active:scale-[0.98]"
						>
							{plan.anchor.kind === 'ongoing'
								? 'with no race in mind'
								: `toward ${plan.anchor.name}`}
							<Icon
								name="chevron-down"
								size="sm"
								className="ml-2 text-muted-foreground"
							/>
						</button>
						<span className="text-xl text-muted-foreground">
							{plan.anchor.kind === 'ongoing'
								? `· ${derived.cycleWeeks}-week loop`
								: `· ${untilRace} weeks out`}
						</span>
					</div>

					<p className="mt-6 text-sm text-muted-foreground">
						and the plan should speak
					</p>
					<div className="mt-2 flex flex-wrap items-center gap-2">
						{CURRENCIES.map((c) => (
							<Chip
								key={c}
								selected={cur === c}
								onClick={() => store.setCurrency(c)}
								icon={cur === c ? <Icon name="check" size="sm" /> : undefined}
							>
								{CURRENCY_LABEL[c]}
							</Chip>
						))}
						<span className="mx-1 h-6 w-px bg-border" />
						<span className="text-sm text-muted-foreground">also show</span>
						{CURRENCIES.filter((c) => c !== cur).map((c) => (
							<Chip
								key={c}
								selected={plan.alsoTrack.includes(c)}
								onClick={() => store.toggleAlsoTrack(c)}
							>
								{CURRENCY_UNIT[c]}
							</Chip>
						))}
					</div>
				</div>
			</section>

			{/* Suggested for you — the system's half. */}
			<section className="mt-6">
				<h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
					<Icon name="magnifying-glass" size="sm" />
					Suggested for you
				</h2>
				{suggestions.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						Nothing to suggest — this plan looks coherent.
					</p>
				) : (
					<div className="flex flex-wrap gap-2">
						{suggestions.map((s) => (
							<div key={s.id} className="group relative">
								<Chip
									tone="suggest"
									onClick={s.apply}
									icon={<Icon name={s.icon} size="sm" />}
								>
									{s.label}
								</Chip>
								<button
									type="button"
									aria-label={`Dismiss ${s.label}`}
									onClick={() => setDismissed((d) => [...d, s.id])}
									className="absolute -top-1.5 -right-1.5 hidden size-5 place-items-center rounded-full bg-foreground text-background group-hover:grid"
								>
									<Icon name="cross-1" size="xs" />
								</button>
								<p className="mt-1 max-w-[18rem] text-xs text-muted-foreground">
									{s.why}
								</p>
							</div>
						))}
					</div>
				)}
			</section>

			{/* Season totals as three friendly stat cards. */}
			<section className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
				<Stat
					label={`Season ${CURRENCY_UNIT[cur]}`}
					value={`${fromHours(derived.loadHours, cur)}`}
				/>
				<Stat label="Training weeks" value={`${derived.totalWeeks}`} />
				<Stat label="Blocks" value={`${plan.phases.length}`} />
				<Stat
					label="Untracked hours"
					value={derived.unloadedHours ? `${derived.unloadedHours} h` : '—'}
					hint={
						derived.unloadedHours
							? 'Strength — no TSS'
							: 'No strength blocks yet'
					}
				/>
			</section>

			{/* Adaptive block grid. */}
			<section className="mt-8 grid gap-4 md:grid-cols-2">
				{plan.phases.map((phase, i) => {
					const weeks = weeksByPhase.get(phase.id) ?? []
					const meta = FOCUS[phase.focus]
					const peak = Math.max(...weeks.map((w) => w.hours), 0)
					return (
						<article
							key={phase.id}
							className="overflow-hidden rounded-[1.5rem] bg-card shadow-sm ring-1 ring-border transition-shadow hover:shadow-md"
						>
							<div
								className="flex items-center gap-3 px-5 py-4"
								style={{ background: meta.tint }}
							>
								<span
									className="grid size-10 shrink-0 place-items-center rounded-full text-background"
									style={{ background: meta.hue }}
								>
									<Icon
										name={phase.focus === 'strength' ? 'barbell' : 'clock'}
										size="sm"
									/>
								</span>
								<div className="min-w-0 flex-1">
									<h3 className="truncate text-lg font-medium">{phase.name}</h3>
									<p className="truncate text-xs text-muted-foreground">
										Block {i + 1} · {meta.label} · {RHYTHM_LABEL[phase.rhythm]}
									</p>
								</div>
								<button
									type="button"
									onClick={() => setSheet({ kind: 'block', phaseId: phase.id })}
									aria-label={`Edit ${phase.name}`}
									className="grid size-10 place-items-center rounded-full hover:bg-black/5"
								>
									<Icon name="pencil-1" size="sm" />
								</button>
							</div>

							<div className="px-5 pt-4">
								<WeekBars weeks={weeks} hue={meta.hue} ring={meta.ring} />
								<div className="mt-1.5 flex gap-1.5 text-[10px] text-muted-foreground">
									{weeks.map((w) => (
										<span key={w.index} className="flex-1 text-center">
											{w.role === 'recovery' ? 'R' : w.loadNumber}
										</span>
									))}
								</div>
							</div>

							<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 pt-4 pb-5">
								<span className="text-3xl font-medium tabular-nums">
									{meta.countsTowardLoad || cur === 'hours'
										? fromHours(peak, cur)
										: '—'}
								</span>
								<span className="text-sm text-muted-foreground">
									{CURRENCY_UNIT[cur]} peak week
								</span>
								{plan.alsoTrack.map((c) => (
									<span
										key={c}
										className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground tabular-nums"
									>
										{meta.countsTowardLoad || c === 'hours'
											? `${fromHours(peak, c)} ${CURRENCY_UNIT[c]}`
											: `— ${CURRENCY_UNIT[c]}`}
									</span>
								))}
								{!meta.countsTowardLoad ? (
									<span className="mt-2 flex w-full items-start gap-1.5 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
										<Icon name="info-circle" size="sm" className="mt-0.5" />
										No TSS — this block doesn’t count toward load targets.
									</span>
								) : null}
							</div>
						</article>
					)
				})}

				{plan.anchor.kind === 'ongoing' ? (
					<article className="flex flex-col items-start justify-center gap-3 rounded-[1.5rem] border-2 border-dashed border-border p-6">
						<Icon name="update" size="lg" className="text-muted-foreground" />
						<h3 className="text-lg font-medium">Then it repeats</h3>
						<p className="text-sm text-muted-foreground">
							Cycle {plan.cyclesShown} shown of an endless run —{' '}
							{derived.cycleWeeks} weeks per lap.
						</p>
						<div className="flex items-center gap-2">
							<Chip onClick={() => store.setCyclesShown(plan.cyclesShown - 1)}>
								−1 lap
							</Chip>
							<Chip onClick={() => store.setCyclesShown(plan.cyclesShown + 1)}>
								+1 lap
							</Chip>
						</div>
					</article>
				) : (
					<article className="rounded-[1.5rem] bg-card p-5 shadow-sm ring-1 ring-border">
						<h3 className="text-lg font-medium">Taper</h3>
						<p className="mt-1 text-sm text-muted-foreground">
							{plan.taperWeeks
								? `${plan.taperWeeks} weeks of volume-only reduction into ${plan.anchor.name}.`
								: 'No taper yet.'}
						</p>
						<input
							type="range"
							min={0}
							max={3}
							value={plan.taperWeeks}
							onChange={(e) => store.setTaperWeeks(Number(e.target.value))}
							aria-label="Taper weeks"
							className="mt-4 w-full accent-[var(--primary)]"
						/>
						<div className="mt-2 flex justify-between text-xs text-muted-foreground">
							<span>none</span>
							<span>3 weeks</span>
						</div>
					</article>
				)}
			</section>

			<div className="mt-6 flex flex-wrap gap-2">
				<Chip
					onClick={() => setSheet({ kind: 'templates', swap: null })}
					icon={<Icon name="plus" size="sm" />}
				>
					Add a block
				</Chip>
				<Chip
					onClick={() => setSheet({ kind: 'season' })}
					icon={<Icon name="file-text" size="sm" />}
				>
					Season templates
				</Chip>
				<Chip onClick={store.reset} icon={<Icon name="reset" size="sm" />}>
					Reset
				</Chip>
			</div>

			{store.whisper ? (
				<div
					key={store.whisper.id}
					role="status"
					className="fixed bottom-24 left-1/2 z-30 max-w-[90vw] -translate-x-1/2 rounded-xl bg-foreground px-4 py-3 text-sm text-background shadow-lg"
				>
					{store.whisper.text}
				</div>
			) : null}

			{/* Sheets ------------------------------------------------------ */}
			{editing ? (
				<BottomSheet title={editing.name} onClose={() => setSheet(null)}>
					<div className="space-y-6">
						<div>
							<p className="mb-2 text-sm font-medium">Focus</p>
							<div className="flex flex-wrap gap-2">
								{FOCUS_KEYS.map((f) => (
									<Chip
										key={f}
										selected={editing.focus === f}
										onClick={() => store.setPhaseFocus(editing.id, f)}
									>
										{FOCUS[f].label}
									</Chip>
								))}
							</div>
							<p className="mt-2 text-xs text-muted-foreground">
								{FOCUS[editing.focus].note}
							</p>
						</div>

						<div>
							<p className="mb-2 text-sm font-medium">
								Rhythm — this block only
							</p>
							<div className="flex flex-wrap gap-2">
								{RHYTHMS.map((r) => (
									<Chip
										key={r}
										selected={editing.rhythm === r}
										onClick={() => store.setPhaseRhythm(editing.id, r)}
									>
										{RHYTHM_LABEL[r]}
									</Chip>
								))}
							</div>
						</div>

						<div>
							<p className="mb-2 text-sm font-medium">
								Length — {editing.weeks} weeks
							</p>
							<input
								type="range"
								min={1}
								max={10}
								value={editing.weeks}
								onChange={(e) =>
									store.updatePhase(editing.id, {
										weeks: Number(e.target.value),
									})
								}
								aria-label="Block length in weeks"
								className="w-full accent-[var(--primary)]"
							/>
						</div>

						<div>
							<p className="mb-2 text-sm font-medium">
								Opening week — {fromHours(editing.baseHours, cur)}{' '}
								{CURRENCY_UNIT[cur]}
								{plan.alsoTrack.length ? (
									<span className="ml-2 font-normal text-muted-foreground">
										(
										{plan.alsoTrack
											.map(
												(c) =>
													`${fromHours(editing.baseHours, c)} ${CURRENCY_UNIT[c]}`,
											)
											.join(', ')}
										)
									</span>
								) : null}
							</p>
							<input
								type="range"
								min={1}
								max={fromHours(14, cur)}
								step={cur === 'hours' ? 0.5 : cur === 'km' ? 5 : 30}
								value={fromHours(editing.baseHours, cur)}
								onChange={(e) =>
									store.updatePhase(editing.id, {
										baseHours: toHours(Number(e.target.value), cur),
									})
								}
								aria-label="Opening week volume"
								className="w-full accent-[var(--primary)]"
							/>
						</div>

						<div className="flex flex-wrap gap-2 border-t border-border pt-4">
							<Chip
								onClick={() =>
									setSheet({ kind: 'templates', swap: editing.id })
								}
							>
								Swap for a template
							</Chip>
							<Chip onClick={() => store.movePhase(editing.id, -1)}>
								Move earlier
							</Chip>
							<Chip onClick={() => store.movePhase(editing.id, 1)}>
								Move later
							</Chip>
							<Chip
								onClick={() => {
									store.removePhase(editing.id)
									setSheet(null)
								}}
							>
								Remove block
							</Chip>
						</div>
					</div>
				</BottomSheet>
			) : null}

			{sheet && sheet.kind === 'templates' ? (
				<BottomSheet
					title={sheet.swap ? 'Swap this block' : 'Add a block'}
					onClose={() => setSheet(null)}
				>
					<p className="mb-4 text-sm text-muted-foreground">
						Templates are copied into your plan. Nothing stays linked — edit
						freely.
					</p>
					<ul className="divide-y divide-border">
						{BLOCK_TEMPLATES.map((t) => (
							<li key={t.key}>
								<button
									type="button"
									onClick={() => {
										if (sheet.swap) store.replacePhaseWithTemplate(sheet.swap, t)
										else store.appendBlockTemplate(t)
										setSheet(null)
									}}
									className="flex w-full items-center gap-4 py-4 text-left hover:bg-muted/60"
								>
									<span
										className="grid size-11 shrink-0 place-items-center rounded-full text-background"
										style={{ background: FOCUS[t.focus].hue }}
									>
										<Icon
											name={t.focus === 'strength' ? 'barbell' : 'clock'}
											size="sm"
										/>
									</span>
									<span className="min-w-0 flex-1">
										<span className="block font-medium">{t.name}</span>
										<span className="block text-sm text-muted-foreground">
											{t.blurb}
										</span>
									</span>
									<Icon
										name="chevron-right"
										size="sm"
										className="text-muted-foreground"
									/>
								</button>
							</li>
						))}
					</ul>
				</BottomSheet>
			) : null}

			{sheet && sheet.kind === 'season' ? (
				<BottomSheet title="Season templates" onClose={() => setSheet(null)}>
					<p className="mb-4 text-sm text-muted-foreground">
						A whole macro shape, copied in and yours to edit.
					</p>
					<ul className="divide-y divide-border">
						{SEASON_TEMPLATES.map((t) => (
							<li key={t.key}>
								<button
									type="button"
									onClick={() => {
										store.applySeasonTemplate(t.key)
										setSheet(null)
									}}
									className="flex w-full items-start gap-4 py-4 text-left hover:bg-muted/60"
								>
									<span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent">
										<Icon
											name={t.anchorKind === 'ongoing' ? 'update' : 'file-text'}
											size="sm"
										/>
									</span>
									<span className="min-w-0 flex-1">
										<span className="block font-medium">{t.name}</span>
										<span className="block text-sm text-muted-foreground">
											{t.blurb}
										</span>
										<span className="mt-2 flex flex-wrap gap-1">
											{t.blocks.map((b) => (
												<span
													key={b.name}
													className="rounded-md px-2 py-0.5 text-xs"
													style={{ background: FOCUS[b.focus].tint }}
												>
													{b.name} {b.weeks}w · {b.rhythm}
												</span>
											))}
										</span>
									</span>
								</button>
							</li>
						))}
					</ul>
				</BottomSheet>
			) : null}

			{sheet && sheet.kind === 'anchor' ? (
				<BottomSheet
					title="What are you building toward?"
					onClose={() => setSheet(null)}
				>
					<ul className="divide-y divide-border">
						<AnchorRow
							title={store.seedEvent.name}
							detail={`Race · ${formatShortDate(store.seedEvent.date)}`}
							onClick={() => {
								store.setAnchor({
									kind: 'event',
									name: store.seedEvent.name,
									date: store.seedEvent.date,
								})
								setSheet(null)
							}}
						/>
						<AnchorRow
							title="A fitness goal"
							detail="Creates a fitness-goal Event to anchor the plan"
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
						<AnchorRow
							title="Ongoing — no race"
							detail="Blocks repeat on a loop until you attach one"
							onClick={() => {
								store.goOngoing()
								setSheet(null)
							}}
						/>
					</ul>
				</BottomSheet>
			) : null}

			{/* FAB */}
			<button
				type="button"
				onClick={() => setSheet({ kind: 'templates', swap: null })}
				className="fixed right-5 bottom-24 z-30 flex items-center gap-2 rounded-2xl bg-primary px-5 py-4 text-primary-foreground shadow-xl transition-transform active:scale-95"
			>
				<Icon name="plus" size="md" />
				<span className="font-medium">Block</span>
			</button>
		</div>
	)
}

function Stat({
	label,
	value,
	hint,
}: {
	label: string
	value: string
	hint?: string
}) {
	return (
		<div className="rounded-2xl bg-card p-4 ring-1 ring-border">
			<p className="text-xs text-muted-foreground">{label}</p>
			<p className="mt-1 text-2xl font-medium tabular-nums">{value}</p>
			{hint ? (
				<p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
			) : null}
		</div>
	)
}

function AnchorRow({
	title,
	detail,
	onClick,
}: {
	title: string
	detail: string
	onClick: () => void
}) {
	return (
		<li>
			<button
				type="button"
				onClick={onClick}
				className="flex w-full items-center gap-4 py-4 text-left hover:bg-muted/60"
			>
				<span className="min-w-0 flex-1">
					<span className="block font-medium">{title}</span>
					<span className="block text-sm text-muted-foreground">{detail}</span>
				</span>
				<Icon name="chevron-right" size="sm" className="text-muted-foreground" />
			</button>
		</li>
	)
}
