import { useMemo, useState } from 'react'
import { cn } from '#app/utils/misc.tsx'
import {
	DAY_LABELS,
	DISCIPLINE_GLYPH,
	FALLBACK_PLAN,
	SEED_PATTERNS,
	TSS_PER_HOUR,
	formatEventDate,
	type PhaseKind,
	type ProtoPlanInput,
	type ProtoWeek,
	type Rhythm,
} from './__proto-x-model.ts'

// PROTOTYPE variant E — "Builder". The professional, platform-convergent
// shape the #363 research recommends (TrainingPeaks ATP / intervals.icu):
// a settings rail (volume currency, starting volume, progression rate,
// recovery cadence, taper), a season chart (weekly targets colored by
// phase, CTL projection, ramp-rate warnings, race marker), and an editable
// week-by-week table with real Mon–Sun Training Week dates, all anchored
// backward from the Target Event.

const PHASE_HEX: Record<PhaseKind, string> = {
	base: '#0ea5e9',
	build: '#f59e0b',
	peak: '#f43f5e',
	taper: '#8b5cf6',
}

const PHASE_LABEL: Record<PhaseKind, string> = {
	base: 'Base',
	build: 'Build',
	peak: 'Peak',
	taper: 'Taper',
}

type Currency = 'hours' | 'tss'

type BuilderSettings = {
	baseWeeks: number
	buildWeeks: number
	peakWeeks: number
	taperWeeks: number
	startHours: number
	/** % volume added per loading week through Base + Build. */
	rampPct: number
	rhythm: Rhythm
	/** % volume cut on a recovery week. */
	recoveryCutPct: number
	/** % of peak volume the final taper week lands on. */
	taperFloorPct: number
	currency: Currency
}

type BuilderWeek = ProtoWeek & {
	monday: Date
	sunday: Date
	rampWarning: boolean
}

const RAMP_WARN_PCT = 10 // week-over-week loading increase that gets flagged

function startOfTrainingWeek(d: Date): Date {
	const out = new Date(d)
	const day = (out.getUTCDay() + 6) % 7 // 0 = Monday
	out.setUTCDate(out.getUTCDate() - day)
	out.setUTCHours(0, 0, 0, 0)
	return out
}

function deriveBuilderWeeks(
	s: BuilderSettings,
	eventDate: Date,
	overrides: Record<number, number>,
): BuilderWeek[] {
	const spans: Array<[PhaseKind, number]> = [
		['base', s.baseWeeks],
		['build', s.buildWeeks],
		['peak', s.peakWeeks],
		['taper', s.taperWeeks],
	]
	const total = spans.reduce((n, [, w]) => n + w, 0)
	const raceWeekMonday = startOfTrainingWeek(eventDate)
	const cycle = s.rhythm === '3:1' ? 4 : 3

	const weeks: BuilderWeek[] = []
	let index = 0
	let loadingHours = s.startHours
	let peakHours = s.startHours
	for (let p = 0; p < spans.length; p++) {
		const [kind, span] = spans[p]!
		for (let w = 0; w < span; w++) {
			const isRecovery =
				(kind === 'base' || kind === 'build') &&
				span >= cycle &&
				(w + 1) % cycle === 0
			let hours: number
			if (kind === 'base' || kind === 'build') {
				if (isRecovery) {
					hours = loadingHours * (1 - s.recoveryCutPct / 100)
				} else {
					hours = loadingHours
					loadingHours = loadingHours * (1 + s.rampPct / 100)
					peakHours = Math.max(peakHours, hours)
				}
			} else if (kind === 'peak') {
				// Peak holds the highest sustained volume; intensity does the
				// sharpening at the workout level, not here.
				hours = peakHours
			} else {
				// Taper: exponential-ish volume cut from peak toward the floor,
				// intensity held (volume-only taper, ADR 0025 machinery).
				const t = (w + 1) / span
				const floor = s.taperFloorPct / 100
				hours = peakHours * (1 - (1 - floor) * Math.pow(t, 0.7))
			}
			const override = overrides[index]
			const resolved = override ?? hours
			const monday = new Date(raceWeekMonday)
			monday.setUTCDate(monday.getUTCDate() - (total - 1 - index) * 7)
			const sunday = new Date(monday)
			sunday.setUTCDate(sunday.getUTCDate() + 6)
			weeks.push({
				index,
				phaseIndex: p,
				phaseKind: kind,
				phaseName: PHASE_LABEL[kind],
				weekInPhase: w,
				isRecovery,
				isTaper: kind === 'taper',
				hours: Math.round(resolved * 10) / 10,
				tss: Math.round(resolved * TSS_PER_HOUR),
				overridden: override != null,
				monday,
				sunday,
				rampWarning: false,
			})
			index++
		}
	}
	// Ramp-rate check: flag loading weeks that jump too far past the previous
	// loading week (recovery dips are expected and never flagged).
	let prevLoading: number | null = null
	for (const w of weeks) {
		if (w.isRecovery || w.isTaper) continue
		if (
			prevLoading != null &&
			prevLoading > 0 &&
			((w.tss - prevLoading) / prevLoading) * 100 > RAMP_WARN_PCT
		) {
			w.rampWarning = true
		}
		prevLoading = w.tss
	}
	return weeks
}

function projectCtlDaily(weeks: BuilderWeek[], startCtl = 42): number[] {
	const alpha = 1 / 42
	let ctl = startCtl
	return weeks.map((w) => {
		const daily = w.tss / 7
		for (let d = 0; d < 7; d++) ctl = ctl + alpha * (daily - ctl)
		return Math.round(ctl * 10) / 10
	})
}

function fmtRange(monday: Date, sunday: Date): string {
	const f = (d: Date) =>
		d.toLocaleDateString('en-GB', {
			day: 'numeric',
			month: 'short',
			timeZone: 'UTC',
		})
	return `${f(monday)} – ${f(sunday)}`
}

export function BuilderVariant({ plan }: { plan: ProtoPlanInput }) {
	const source = plan ?? FALLBACK_PLAN
	const eventDate = useMemo(
		() => new Date(source.eventDate),
		[source.eventDate],
	)
	const [settings, setSettings] = useState<BuilderSettings>(() => ({
		baseWeeks: source.phases.find((p) => /base/i.test(p.name))?.weeks ?? 4,
		buildWeeks: source.phases.find((p) => /build/i.test(p.name))?.weeks ?? 3,
		peakWeeks: source.phases.find((p) => /peak/i.test(p.name))?.weeks ?? 2,
		taperWeeks: source.phases.find((p) => /taper/i.test(p.name))?.weeks ?? 1,
		startHours: 6,
		rampPct: 5,
		rhythm: '3:1',
		recoveryCutPct: 30,
		taperFloorPct: 50,
		currency: 'hours',
	}))
	const [overrides, setOverrides] = useState<Record<number, number>>({})
	const [phasePatterns, setPhasePatterns] = useState<
		Partial<Record<PhaseKind, string>>
	>({})
	const [expandedWeek, setExpandedWeek] = useState<number | null>(null)

	const weeks = useMemo(
		() => deriveBuilderWeeks(settings, eventDate, overrides),
		[settings, eventDate, overrides],
	)
	const ctl = useMemo(() => projectCtlDaily(weeks), [weeks])
	const maxTss = Math.max(...weeks.map((w) => w.tss), 1)
	const totalHours = Math.round(weeks.reduce((n, w) => n + w.hours, 0))
	const peakWeek = weeks.reduce((a, b) => (b.tss > a.tss ? b : a), weeks[0]!)
	const currency = settings.currency
	const show = (w: { hours: number; tss: number }) =>
		currency === 'hours' ? `${w.hours} h` : `${w.tss} TSS`

	function set<K extends keyof BuilderSettings>(
		key: K,
		value: BuilderSettings[K],
	) {
		setSettings((s) => ({ ...s, [key]: value }))
		setOverrides({})
	}

	// Chart geometry
	const CW = 860
	const CH = 240
	const padL = 36
	const padB = 34
	const padT = 18
	const colW = (CW - padL - 12) / weeks.length
	const maxCtl = Math.max(...ctl) * 1.15
	const yTss = (t: number) => CH - padB - (t / maxTss) * (CH - padB - padT)
	const yCtl = (c: number) => CH - padB - (c / maxCtl) * (CH - padB - padT)

	return (
		<main className="mx-auto max-w-6xl px-4 py-6">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h1 className="text-xl font-bold">Training plan builder</h1>
					<p className="text-muted-foreground text-sm">
						{source.eventName} · A race · {formatEventDate(source.eventDate)} ·
						plan runs{' '}
						{fmtRange(weeks[0]!.monday, weeks[weeks.length - 1]!.sunday)}
					</p>
				</div>
				<dl className="flex gap-5 text-sm">
					<div>
						<dt className="text-muted-foreground text-xs">Weeks</dt>
						<dd className="font-bold tabular-nums">{weeks.length}</dd>
					</div>
					<div>
						<dt className="text-muted-foreground text-xs">Total volume</dt>
						<dd className="font-bold tabular-nums">{totalHours} h</dd>
					</div>
					<div>
						<dt className="text-muted-foreground text-xs">Peak week</dt>
						<dd className="font-bold tabular-nums">{show(peakWeek)}</dd>
					</div>
					<div>
						<dt className="text-muted-foreground text-xs">Race-day CTL</dt>
						<dd className="font-bold tabular-nums">{ctl[ctl.length - 1]}</dd>
					</div>
				</dl>
			</div>

			<div className="mt-4 grid gap-4 lg:grid-cols-[290px_1fr]">
				{/* ── Settings rail ─────────────────────────────────────────── */}
				<aside className="space-y-4 rounded-xl border p-4">
					<Section title="Phases (backward from race)">
						{(
							[
								['baseWeeks', 'base'],
								['buildWeeks', 'build'],
								['peakWeeks', 'peak'],
								['taperWeeks', 'taper'],
							] as const
						).map(([key, kind]) => (
							<div key={key} className="flex items-center gap-2">
								<span
									className="size-2.5 rounded-sm"
									style={{ background: PHASE_HEX[kind] }}
								/>
								<span className="w-12 text-sm">{PHASE_LABEL[kind]}</span>
								<div className="ml-auto flex items-center gap-1">
									<RailButton
										onClick={() =>
											set(
												key,
												Math.max(kind === 'taper' ? 1 : 1, settings[key] - 1),
											)
										}
									>
										−
									</RailButton>
									<span className="w-12 text-center text-sm font-semibold tabular-nums">
										{settings[key]} wk
									</span>
									<RailButton onClick={() => set(key, settings[key] + 1)}>
										＋
									</RailButton>
								</div>
							</div>
						))}
					</Section>

					<Section title="Volume">
						<div className="mb-2 flex gap-1 rounded-lg border p-0.5 text-xs font-semibold">
							{(['hours', 'tss'] as const).map((c) => (
								<button
									key={c}
									type="button"
									onClick={() => set('currency', c)}
									className={cn(
										'flex-1 rounded-md px-2 py-1',
										currency === c && 'bg-foreground text-background',
									)}
								>
									{c === 'hours' ? 'Weekly hours' : 'Weekly TSS'}
								</button>
							))}
						</div>
						<RailSlider
							label={`Starting volume: ${
								currency === 'hours'
									? `${settings.startHours} h/wk`
									: `${Math.round(settings.startHours * TSS_PER_HOUR)} TSS/wk`
							}`}
							min={2}
							max={14}
							step={0.5}
							value={settings.startHours}
							onChange={(v) => set('startHours', v)}
						/>
						<RailSlider
							label={`Progression: +${settings.rampPct}% per loading week`}
							min={0}
							max={12}
							step={1}
							value={settings.rampPct}
							onChange={(v) => set('rampPct', v)}
						/>
					</Section>

					<Section title="Recovery">
						<div className="flex gap-1 rounded-lg border p-0.5 text-xs font-semibold">
							{(['3:1', '2:1'] as const).map((r) => (
								<button
									key={r}
									type="button"
									onClick={() => set('rhythm', r)}
									className={cn(
										'flex-1 rounded-md px-2 py-1',
										settings.rhythm === r && 'bg-foreground text-background',
									)}
								>
									{r} {r === '3:1' ? '(classic)' : '(gentler)'}
								</button>
							))}
						</div>
						<RailSlider
							label={`Recovery week: −${settings.recoveryCutPct}% volume`}
							min={10}
							max={50}
							step={5}
							value={settings.recoveryCutPct}
							onChange={(v) => set('recoveryCutPct', v)}
						/>
					</Section>

					<Section title="Taper (volume only — intensity held)">
						<RailSlider
							label={`Final week lands on ${settings.taperFloorPct}% of peak volume`}
							min={30}
							max={70}
							step={5}
							value={settings.taperFloorPct}
							onChange={(v) => set('taperFloorPct', v)}
						/>
					</Section>

					<Section title="Week patterns">
						<p className="text-muted-foreground mb-2 text-xs">
							Assign a default pattern per phase — applying stamps standalone
							Workout Sessions, no live link back. Strength carries no TSS and
							never counts toward the weekly target.
						</p>
						{(['base', 'build', 'peak'] as const).map((kind) => (
							<div key={kind} className="mb-2">
								<div className="mb-1 flex items-center gap-2 text-sm">
									<span
										className="size-2.5 rounded-sm"
										style={{ background: PHASE_HEX[kind] }}
									/>
									<span>{PHASE_LABEL[kind]}</span>
								</div>
								<div className="flex flex-wrap gap-1">
									{SEED_PATTERNS.map((p) => (
										<button
											key={p.id}
											type="button"
											onClick={() =>
												setPhasePatterns((prev) => ({
													...prev,
													[kind]: prev[kind] === p.id ? undefined : p.id,
												}))
											}
											className={cn(
												'min-h-11 rounded-lg border px-2.5 text-xs font-semibold',
												phasePatterns[kind] === p.id
													? 'bg-foreground text-background'
													: 'hover:bg-muted',
											)}
										>
											{p.name}
										</button>
									))}
								</div>
							</div>
						))}
					</Section>
				</aside>

				{/* ── Chart + table ─────────────────────────────────────────── */}
				<div className="min-w-0 space-y-4">
					<div className="overflow-x-auto rounded-xl border p-3">
						<svg viewBox={`0 0 ${CW} ${CH}`} className="w-full min-w-[640px]">
							{/* y gridlines (TSS) */}
							{[0.25, 0.5, 0.75, 1].map((f) => (
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
							{/* weekly bars */}
							{weeks.map((w, i) => (
								<g key={w.index}>
									<rect
										x={padL + i * colW + 2}
										y={yTss(w.tss)}
										width={colW - 4}
										height={CH - padB - yTss(w.tss)}
										rx={2}
										fill={PHASE_HEX[w.phaseKind]}
										opacity={w.isRecovery ? 0.35 : 0.85}
										stroke={w.overridden ? 'currentColor' : 'none'}
										strokeWidth={1.5}
									>
										<title>
											Week {i + 1} ({fmtRange(w.monday, w.sunday)}) · {w.hours}{' '}
											h ≈ {w.tss} TSS
										</title>
									</rect>
									{w.rampWarning && (
										<text
											x={padL + (i + 0.5) * colW}
											y={yTss(w.tss) - 4}
											textAnchor="middle"
											fontSize={10}
										>
											⚠︎
										</text>
									)}
									<text
										x={padL + (i + 0.5) * colW}
										y={CH - padB + 12}
										textAnchor="middle"
										fontSize={8.5}
										fill="currentColor"
										opacity={0.55}
									>
										{i + 1}
									</text>
								</g>
							))}
							{/* CTL projection */}
							<polyline
								points={weeks
									.map((_, i) => `${padL + (i + 0.5) * colW},${yCtl(ctl[i]!)}`)
									.join(' ')}
								fill="none"
								stroke="currentColor"
								strokeWidth={1.8}
								strokeDasharray="5 3"
								opacity={0.7}
							/>
							<text
								x={padL + (weeks.length - 0.5) * colW - 6}
								y={yCtl(ctl[ctl.length - 1]!) - 6}
								textAnchor="end"
								fontSize={9}
								fill="currentColor"
								opacity={0.7}
							>
								CTL {ctl[ctl.length - 1]}
							</text>
							{/* race marker */}
							<g>
								<line
									x1={padL + weeks.length * colW}
									x2={padL + weeks.length * colW}
									y1={padT}
									y2={CH - padB}
									stroke="#f43f5e"
									strokeWidth={1.5}
								/>
								<text
									x={padL + weeks.length * colW - 4}
									y={padT + 8}
									textAnchor="end"
									fontSize={9}
									fontWeight={700}
									fill="#f43f5e"
								>
									🏁 {formatEventDate(source.eventDate)}
								</text>
							</g>
							{/* phase band along the bottom */}
							{weeks.map((w, i) => (
								<rect
									key={w.index}
									x={padL + i * colW}
									y={CH - padB + 16}
									width={colW}
									height={6}
									fill={PHASE_HEX[w.phaseKind]}
								/>
							))}
						</svg>
						<div className="text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
							{(Object.keys(PHASE_HEX) as PhaseKind[]).map((k) => (
								<span key={k} className="flex items-center gap-1">
									<span
										className="size-2 rounded-sm"
										style={{ background: PHASE_HEX[k] }}
									/>
									{PHASE_LABEL[k]}
								</span>
							))}
							<span>▨ dimmed = recovery week</span>
							<span>┄ projected fitness (CTL), display only</span>
							<span>⚠︎ ramp &gt;{RAMP_WARN_PCT}% week-over-week</span>
						</div>
					</div>

					{/* Week table */}
					<div className="overflow-x-auto rounded-xl border">
						<table className="w-full min-w-[640px] text-sm">
							<thead>
								<tr className="text-muted-foreground border-b text-left text-xs uppercase">
									<th className="px-3 py-2 font-semibold">Wk</th>
									<th className="px-3 py-2 font-semibold">Training Week</th>
									<th className="px-3 py-2 font-semibold">Phase</th>
									<th className="px-3 py-2 font-semibold">Type</th>
									<th className="px-3 py-2 text-right font-semibold">
										Target ({currency === 'hours' ? 'h' : 'TSS'})
									</th>
									<th className="px-3 py-2 text-right font-semibold">
										{currency === 'hours' ? '≈ TSS' : '≈ h'}
									</th>
									<th className="px-3 py-2 text-right font-semibold">CTL</th>
									<th className="px-3 py-2 font-semibold">Sessions</th>
								</tr>
							</thead>
							<tbody>
								{weeks.map((w, i) => {
									const patternId = phasePatterns[w.phaseKind]
									const pattern = patternId
										? SEED_PATTERNS.find((p) => p.id === patternId)
										: null
									return (
										<WeekRow
											key={w.index}
											w={w}
											i={i}
											ctl={ctl[i]!}
											currency={currency}
											pattern={pattern ?? null}
											expanded={expandedWeek === w.index}
											onToggle={() =>
												setExpandedWeek((e) => (e === w.index ? null : w.index))
											}
											onOverride={(hours) =>
												setOverrides((o) =>
													hours == null
														? Object.fromEntries(
																Object.entries(o).filter(
																	([k]) => Number(k) !== w.index,
																),
															)
														: { ...o, [w.index]: hours },
												)
											}
										/>
									)
								})}
								<tr className="bg-rose-500/10 font-semibold">
									<td className="px-3 py-2">🏁</td>
									<td className="px-3 py-2" colSpan={7}>
										{source.eventName} — {formatEventDate(source.eventDate)}
									</td>
								</tr>
							</tbody>
						</table>
					</div>

					<div className="flex justify-end">
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

function WeekRow({
	w,
	i,
	ctl,
	currency,
	pattern,
	expanded,
	onToggle,
	onOverride,
}: {
	w: BuilderWeek
	i: number
	ctl: number
	currency: Currency
	pattern: {
		name: string
		sessions: Array<{
			day: number
			discipline: string
			title: string
			share: number
		}>
	} | null
	expanded: boolean
	onToggle: () => void
	onOverride: (hours: number | null) => void
}) {
	const type = w.isTaper ? 'Taper' : w.isRecovery ? 'Recovery' : 'Loading'
	return (
		<>
			<tr
				className={cn(
					'cursor-pointer border-b transition-colors',
					w.isRecovery ? 'bg-muted/40' : 'hover:bg-muted/30',
				)}
				onClick={onToggle}
			>
				<td className="px-3 py-2 tabular-nums">{i + 1}</td>
				<td className="px-3 py-2 whitespace-nowrap tabular-nums">
					{fmtRange(w.monday, w.sunday)}
				</td>
				<td className="px-3 py-2">
					<span className="flex items-center gap-1.5">
						<span
							className="size-2 rounded-sm"
							style={{ background: PHASE_HEX[w.phaseKind] }}
						/>
						{w.phaseName}
					</span>
				</td>
				<td className="px-3 py-2">
					{type}
					{w.rampWarning && <span title="Steep ramp week-over-week"> ⚠︎</span>}
				</td>
				<td
					className="px-3 py-1.5 text-right tabular-nums"
					onClick={(e) => e.stopPropagation()}
				>
					<input
						type="number"
						step={currency === 'hours' ? 0.5 : 10}
						min={0}
						value={currency === 'hours' ? w.hours : w.tss}
						onChange={(e) => {
							const v = Number(e.target.value)
							onOverride(
								Number.isFinite(v)
									? currency === 'hours'
										? v
										: v / TSS_PER_HOUR
									: null,
							)
						}}
						className={cn(
							'bg-background w-20 rounded-md border px-2 py-1 text-right font-semibold tabular-nums',
							w.overridden && 'border-foreground',
						)}
						aria-label={`Week ${i + 1} target`}
					/>
					{w.overridden && (
						<button
							type="button"
							className="text-muted-foreground ml-1 text-xs underline"
							onClick={() => onOverride(null)}
						>
							reset
						</button>
					)}
				</td>
				<td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
					{currency === 'hours' ? w.tss : w.hours}
				</td>
				<td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
					{ctl}
				</td>
				<td className="text-muted-foreground px-3 py-2 text-xs">
					{pattern ? (
						<span>
							{pattern.sessions.map((s) => (
								<span key={`${s.day}-${s.title}`} title={s.title}>
									{
										DISCIPLINE_GLYPH[
											s.discipline as keyof typeof DISCIPLINE_GLYPH
										]
									}
								</span>
							))}
						</span>
					) : (
						'—'
					)}
				</td>
			</tr>
			{expanded && (
				<tr className="border-b">
					<td colSpan={8} className="bg-muted/20 px-3 py-3">
						{pattern ? (
							<div className="grid grid-cols-7 gap-1.5 text-center text-xs">
								{DAY_LABELS.map((d, day) => {
									const s = pattern.sessions.find((x) => x.day === day)
									return (
										<div
											key={d}
											className="bg-background rounded-md border p-2"
										>
											<div className="text-muted-foreground">{d}</div>
											{s ? (
												<>
													<div className="mt-0.5 font-semibold">{s.title}</div>
													<div className="text-muted-foreground tabular-nums">
														{s.discipline === 'strength'
															? 'no TSS'
															: `${Math.round(w.tss * s.share)} TSS`}
													</div>
												</>
											) : (
												<div className="text-muted-foreground/50 mt-0.5">
													rest
												</div>
											)}
										</div>
									)
								})}
							</div>
						) : (
							<p className="text-muted-foreground text-xs">
								No week pattern assigned to the {w.phaseName} phase — pick one
								in the settings rail to preview this week's sessions.
							</p>
						)}
					</td>
				</tr>
			)}
		</>
	)
}

function Section({
	title,
	children,
}: {
	title: string
	children: React.ReactNode
}) {
	return (
		<section>
			<h3 className="text-muted-foreground mb-2 text-xs font-bold tracking-wide uppercase">
				{title}
			</h3>
			{children}
		</section>
	)
}

function RailButton({
	children,
	onClick,
}: {
	children: React.ReactNode
	onClick: () => void
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="bg-muted hover:bg-muted/70 grid size-6 place-items-center rounded-md text-sm font-bold"
		>
			{children}
		</button>
	)
}

function RailSlider({
	label,
	min,
	max,
	step,
	value,
	onChange,
}: {
	label: string
	min: number
	max: number
	step: number
	value: number
	onChange: (v: number) => void
}) {
	return (
		<label className="mt-2 block text-sm">
			<span className="font-medium">{label}</span>
			<input
				type="range"
				min={min}
				max={max}
				step={step}
				value={value}
				onChange={(e) => onChange(Number(e.target.value))}
				className="mt-1 w-full"
			/>
		</label>
	)
}
