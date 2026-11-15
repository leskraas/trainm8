import {
	type FormTrust,
	type PlanOutput,
	type ProgressOutput,
	type SportVolume,
} from '#app/lab/engine/reads.types.ts'
import { dur, km, num0, num1, shortDate, volume } from './__fmt.ts'
import { PhaseStrip } from './__season.tsx'
import { Unknown } from './__ui.tsx'

function trustText(t: FormTrust) {
	if (t.trusted) return null
	if (t.daysOfHistory === null)
		return `Formkurva trenger ${t.requiredDays} dager med data. Jeg har ingen ennå.`
	return `Formkurva trenger ${t.requiredDays} dager med data. Du har ${t.daysOfHistory}.`
}

export function formHeadline(p: ProgressOutput) {
	const t = trustText(p.formTrust)
	if (t) return `${t} Til da kan jeg vise mengde.`
	const f = p.current.form.value
	if (f === null) return p.current.form.why ?? 'Formen er ukjent.'
	const fit = p.current.fitness.value
	return `Formen er ${num0(f)}${fit !== null ? `, og formkurva (det du har bygd) står på ${num0(fit)}` : ''}.`
}

/** Fitness, fatigue and form over time. Nulls are gaps, never zero. */
export function FormCard({ p }: { p: ProgressOutput }) {
	const W = 320
	const H = 140
	const days = p.days
	const vals = days.flatMap((d) =>
		[d.fitness.value, d.fatigue.value, d.form.value].filter(
			(v): v is number => v !== null,
		),
	)
	const hasAny = days.some((d) => d.fitness.value !== null)
	if (!hasAny) {
		const why =
			days.find((d) => d.fitness.why)?.fitness.why ??
			trustText(p.formTrust) ??
			'Ingen historikk ennå.'
		return (
			<div className="prat-card">
				<span className="prat-card-label">Form og slitenhet</span>
				<div className="prat-empty-frame">{why}</div>
			</div>
		)
	}
	const lo = Math.min(0, ...vals)
	const hi = Math.max(1, ...vals)
	const x = (i: number) => (i / Math.max(1, days.length - 1)) * W
	const y = (v: number) => H - ((v - lo) / (hi - lo || 1)) * H
	const path = (key: 'fitness' | 'fatigue' | 'form') => {
		let d = ''
		let pen = false
		days.forEach((day, i) => {
			const v = day[key].value
			if (v === null) {
				pen = false
				return
			}
			d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `
			pen = true
		})
		return d
	}
	const formShown = days.some((d) => d.form.value !== null)
	const first = days[0]?.date
	const last = days[days.length - 1]?.date
	return (
		<div className="prat-card">
			<span className="prat-card-label">Form og slitenhet</span>
			<svg
				className="prat-curve"
				viewBox={`0 0 ${W} ${H + 18}`}
				role="img"
				aria-label="Formkurve"
			>
				{lo < 0 ? (
					<line
						x1={0}
						x2={W}
						y1={y(0)}
						y2={y(0)}
						stroke="var(--line-strong)"
						strokeDasharray="3 3"
					/>
				) : null}
				<path
					d={path('fatigue')}
					fill="none"
					stroke="var(--under)"
					strokeWidth={1.6}
					opacity={0.75}
				/>
				<path
					d={path('fitness')}
					fill="none"
					stroke="var(--mine)"
					strokeWidth={2.4}
				/>
				{formShown ? (
					<path
						d={path('form')}
						fill="none"
						stroke="var(--hit)"
						strokeWidth={1.8}
					/>
				) : null}
				{first ? (
					<text x={0} y={H + 15} fontSize={11} fill="var(--muted)">
						{shortDate(first)}
					</text>
				) : null}
				{last ? (
					<text
						x={W}
						y={H + 15}
						fontSize={11}
						fill="var(--muted)"
						textAnchor="end"
					>
						i dag
					</text>
				) : null}
			</svg>
			<div className="prat-legend">
				<span>
					<i style={{ background: 'var(--mine)' }} />
					Formkurve (bygd over tid)
				</span>
				<span>
					<i style={{ background: 'var(--under)' }} />
					Slitenhet
				</span>
				{formShown ? (
					<span>
						<i style={{ background: 'var(--hit)' }} />
						Form
					</span>
				) : (
					<span className="prat-unknown">
						Form:{' '}
						{p.formTrust.daysOfHistory !== null
							? `dag ${p.formTrust.daysOfHistory} av ${p.formTrust.requiredDays}`
							: `trenger ${p.formTrust.requiredDays} dager`}
					</span>
				)}
			</div>
		</div>
	)
}

export function VolumeRows({ sports }: { sports: SportVolume[] }) {
	if (!sports.length)
		return <span className="prat-note">Ingen idretter i planen denne uka.</span>
	return (
		<div className="prat-vol">
			{sports.map((s) => {
				const target = s.target.value ?? s.planned.value
				const act = s.actual.value
				const max = Math.max(target ?? 0, act ?? 0, 0.0001)
				return (
					<div key={s.sport} style={{ display: 'contents' }}>
						<span>{s.sportName}</span>
						{target === null && act === null ? (
							<Unknown why={s.target.why ?? s.actual.why} short="ukjent" />
						) : (
							<span className="prat-vol-bar" aria-hidden="true">
								{act !== null ? (
									<i
										className="act"
										style={{ width: `${Math.min(100, (act / max) * 100)}%` }}
									/>
								) : null}
								{target !== null ? (
									<b style={{ left: `calc(${(target / max) * 100}% - 1px)` }} />
								) : null}
							</span>
						)}
						<span className="num" style={{ whiteSpace: 'nowrap' }}>
							{act !== null ? (
								volume(act, s.unit)
							) : (
								<Unknown why={s.actual.why} short="ukjent" />
							)}
							<span className="prat-note">
								{' '}
								/ {target !== null ? volume(target, s.unit) : 'ukjent'}
							</span>
						</span>
					</div>
				)
			})}
		</div>
	)
}

export function VolumeCard({
	sports,
	title = 'Denne uka mot planen',
}: {
	sports: SportVolume[]
	title?: string
}) {
	return (
		<div className="prat-card">
			<span className="prat-card-label">{title}</span>
			<VolumeRows sports={sports} />
			<span className="prat-note">Streken er målet for uka.</span>
		</div>
	)
}

/** Planned against actual load, week by week. */
export function WeeksCard({ p }: { p: ProgressOutput }) {
	const weeks = p.weekly
	const max = Math.max(
		1,
		...weeks.flatMap((w) => [
			w.plannedLoad.value ?? 0,
			w.actualLoad.value ?? 0,
		]),
	)
	return (
		<div className="prat-card">
			<span className="prat-card-label">Uke for uke</span>
			<div
				style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 72 }}
			>
				{weeks.map((w) => {
					const pl = w.plannedLoad.value
					const ac = w.actualLoad.value
					return (
						<div
							key={w.weekKey}
							title={`${shortDate(w.weekKey)}: ${ac !== null ? num0(ac) : 'ukjent'} av ${pl !== null ? num0(pl) : 'ukjent'}`}
							style={{
								flex: 1,
								height: '100%',
								display: 'flex',
								alignItems: 'flex-end',
								gap: 1,
							}}
						>
							<i
								style={{
									flex: 1,
									height: pl !== null ? `${(pl / max) * 100}%` : '100%',
									background: pl !== null ? 'var(--seg-easy)' : 'none',
									border: pl !== null ? 0 : '1px dashed var(--unknown)',
									borderRadius: '2px 2px 0 0',
									minHeight: 2,
								}}
							/>
							<i
								style={{
									flex: 1,
									height: ac !== null ? `${(ac / max) * 100}%` : '100%',
									background:
										ac === null
											? 'none'
											: w.verdict.call === 'over'
												? 'var(--over)'
												: w.verdict.call === 'under'
													? 'var(--under)'
													: 'var(--mine)',
									border: ac !== null ? 0 : '1px dashed var(--unknown)',
									borderRadius: '2px 2px 0 0',
									minHeight: 2,
								}}
							/>
						</div>
					)
				})}
			</div>
			<div className="prat-legend">
				<span>
					<i style={{ background: 'var(--seg-easy)' }} />
					Planlagt
				</span>
				<span>
					<i style={{ background: 'var(--mine)' }} />
					Gjort
				</span>
				<span>
					<i style={{ background: 'var(--under)' }} />
					Under
				</span>
				<span>
					<i style={{ background: 'var(--over)' }} />
					Over
				</span>
			</div>
			{p.trend ? (
				<span className="prat-note">
					{p.trend.direction === 'over' ? 'Over' : 'Under'} planen{' '}
					{p.trend.weeks} uker på rad.
				</span>
			) : null}
		</div>
	)
}

export function RecordedRows({ p }: { p: ProgressOutput }) {
	const last = p.weekly[p.weekly.length - 1]
	if (!last?.recorded.length) return null
	return (
		<div className="prat-kv">
			{last.recorded.map((r) => (
				<div key={r.sport} style={{ display: 'contents' }}>
					<dt>{r.sportName}</dt>
					<dd className="num">
						{r.sessions} {r.sessions === 1 ? 'økt' : 'økter'} ·{' '}
						{r.durationS.value !== null ? dur(r.durationS.value) : 'tid ukjent'}
						{r.distanceM.value ? ` · ${km(r.distanceM.value)}` : ''}
					</dd>
				</div>
			))}
		</div>
	)
}

export function roadHeadline(p: ProgressOutput, plan: PlanOutput | null) {
	const g = p.goal
	if (!g) {
		const pl = plan?.plan
		if (pl?.currentWeek)
			return `Uke ${pl.currentWeek} av ${pl.totalWeeks} i denne blokka${pl.block ? ` (blokk ${pl.block})` : ''}. Ingen dato å sikte mot, så jeg legger neste blokk når denne er ferdig.`
		return 'Du har ikke noe løp å sikte mot. Skriv «mål» om du vil sette et.'
	}
	const bits: string[] = []
	if (g.planWeek && g.planWeeks)
		bits.push(`Uke ${g.planWeek} av ${g.planWeeks}`)
	if (g.phase) bits.push(`fase: ${g.phase.toLowerCase()}`)
	const lead = bits.length ? `${bits.join(', ')}. ` : ''
	const to =
		g.weeksToGo !== null
			? `${g.weeksToGo} ${g.weeksToGo === 1 ? 'uke' : 'uker'} til ${g.goal.name}.`
			: `${g.goal.name}.`
	return lead + to
}

export function RoadCard({
	p,
	plan,
}: {
	p: ProgressOutput
	plan: PlanOutput | null
}) {
	const g = p.goal
	const pl = plan?.plan
	const current = pl?.phases.find((x) => x.isCurrent)?.name ?? g?.phase ?? null
	return (
		<div className="prat-card">
			<span className="prat-card-label">
				Veien {g ? 'til løpet' : 'videre'}
			</span>
			{pl?.phases.length ? (
				<PhaseStrip phases={pl.phases} current={current} />
			) : null}
			<dl className="prat-kv" style={{ margin: 0 }}>
				{g ? (
					<>
						<dt>Mål</dt>
						<dd>
							<b>{g.goal.name}</b>
							{g.goal.date ? ` · ${shortDate(g.goal.date)}` : ''}
							{g.goal.aim ? ` · ${g.goal.aim}` : ''}
						</dd>
					</>
				) : null}
				<dt>Formkurve i dag</dt>
				<dd>
					{g?.fitnessToday.value != null ? (
						<b className="num">{num1(g.fitnessToday.value)}</b>
					) : p.current.fitness.value !== null ? (
						<b className="num">{num1(p.current.fitness.value)}</b>
					) : (
						<Unknown why={p.current.fitness.why} />
					)}
				</dd>
				{g ? (
					<>
						<dt>På løpsdagen</dt>
						<dd>
							{g.projectedFitnessOnGoalDay.value !== null ? (
								<>
									<b className="num">
										{num1(g.projectedFitnessOnGoalDay.value)}
									</b>{' '}
									<span className="prat-note">om du følger planen</span>
								</>
							) : (
								<Unknown why={g.projectedFitnessOnGoalDay.why} />
							)}
						</dd>
					</>
				) : null}
			</dl>
		</div>
	)
}
