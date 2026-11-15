import { Link } from 'react-router'
import {
	type PlanOutput,
	type ProgressOutput,
	type SessionCard,
	type TodayOutput,
} from '#app/lab/engine/reads.types.ts'
import { BASE } from './__api.ts'
import { longDate, num, plural, shortDate, unitText } from './__format.ts'
import { verdictWord } from './__session.tsx'
import { cx, Unknown } from './__ui.tsx'

/** Status: one long, read-only screen. The road, form, the week, the sessions. */

function linePath(
	vals: Array<number | null>,
	max: number,
	w: number,
	h: number,
) {
	const n = vals.length
	let d = ''
	let pen = false
	vals.forEach((v, i) => {
		if (v === null) {
			pen = false
			return
		}
		const x = n <= 1 ? 0 : (i / (n - 1)) * w
		const y = h - (Math.max(0, v) / max) * h
		d += `${pen ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)} `
		pen = true
	})
	return d.trim()
}

function FormChart({ p }: { p: ProgressOutput }) {
	const fit = p.days.map((d) => d.fitness.value)
	const fat = p.days.map((d) => d.fatigue.value)
	const known = [...fit, ...fat].filter((v): v is number => v !== null)
	const days = fit.filter((v) => v !== null).length
	if (days < 7 || Math.max(...known) <= 0)
		return (
			<p className="tm-lead">
				Kondisjon{' '}
				{p.current.fitness.value === null ? (
					<Unknown why={p.current.fitness.why} />
				) : (
					<b className="num">{num(p.current.fitness.value)}</b>
				)}
				, slitenhet{' '}
				{p.current.fatigue.value === null ? (
					<Unknown why={p.current.fatigue.why} />
				) : (
					<b className="num">{num(p.current.fatigue.value)}</b>
				)}
				. Kurven tegnes når det er minst en uke med data.
			</p>
		)
	const max = Math.max(...known) * 1.1 || 1
	const W = 320
	const H = 120
	return (
		<>
			<svg
				className="tm-chart"
				viewBox={`0 0 ${W} ${H}`}
				role="img"
				aria-label="Kondisjon og slitenhet over tid"
			>
				<path
					d={linePath(fat, max, W, H)}
					fill="none"
					stroke="var(--muted)"
					strokeWidth="1.5"
					strokeDasharray="4 3"
					vectorEffect="non-scaling-stroke"
				/>
				<path
					d={linePath(fit, max, W, H)}
					fill="none"
					stroke="var(--fg)"
					strokeWidth="2.2"
					vectorEffect="non-scaling-stroke"
				/>
			</svg>
			<div className="tm-legend">
				<span>
					<i /> Kondisjon{' '}
					<b className="num" style={{ color: 'var(--fg)' }}>
						{p.current.fitness.value === null
							? 'ukjent'
							: num(p.current.fitness.value)}
					</b>
				</span>
				<span>
					<i className="dash" /> Slitenhet{' '}
					<b className="num" style={{ color: 'var(--fg)' }}>
						{p.current.fatigue.value === null
							? 'ukjent'
							: num(p.current.fatigue.value)}
					</b>
				</span>
			</div>
		</>
	)
}

function FormLine({ p }: { p: ProgressOutput }) {
	const t = p.formTrust
	if (!t.trusted || p.current.form.value === null) {
		const need = Math.round(t.requiredDays / 7)
		const have =
			t.daysOfHistory === null ? null : Math.floor(t.daysOfHistory / 7)
		return (
			<p className="tm-big-line">
				Form: <Unknown why={t.why} />. Trenger {need} uker
				{have === null ? '.' : `, har ${have}.`}
			</p>
		)
	}
	const f = p.current.form.value
	return (
		<p className="tm-big-line">
			Form: <span className="num">{f > 0 ? `+${num(f)}` : num(f)}</span>.
		</p>
	)
}

function WeekBars({ p }: { p: ProgressOutput }) {
	const vals = p.weekly.map((w) =>
		Math.max(w.actualLoad.value ?? 0, w.plannedLoad.value ?? 0),
	)
	const max = Math.max(1, ...vals)
	return (
		<>
			<div
				className="tm-weekbars"
				role="img"
				aria-label="Belastning per uke, faktisk mot planlagt"
			>
				{p.weekly.map((w) => {
					const a = w.actualLoad.value
					const pl = w.plannedLoad.value
					return (
						<div
							key={w.weekKey}
							className="tm-weekbar"
							title={`${shortDate(w.weekKey)}: ${a === null ? 'ukjent' : num(a)} av ${pl === null ? 'ukjent' : num(pl)}`}
						>
							{a !== null ? (
								<span style={{ height: `${Math.max(2, (a / max) * 100)}%` }} />
							) : null}
							{pl !== null ? (
								<span
									aria-hidden="true"
									style={{
										position: 'absolute',
										left: -1,
										right: -1,
										bottom: `${(pl / max) * 100}%`,
										height: 0,
										background: 'none',
										borderTop: '2px dashed var(--muted)',
									}}
								/>
							) : null}
						</div>
					)
				})}
			</div>
			<div className="tm-legend">
				<span>
					<i /> gjort
				</span>
				<span>
					<i className="dash" /> planlagt
				</span>
				<span>{p.weeks} uker, belastning</span>
			</div>
		</>
	)
}

export function StatusView({
	progress,
	plan,
	today,
	sessions,
	more,
}: {
	progress: ProgressOutput | null
	plan: PlanOutput | null
	today: TodayOutput
	sessions: SessionCard[]
	more?: React.ReactNode
}) {
	const pl = plan?.plan ?? null
	const g = progress?.goal ?? null
	return (
		<>
			<h1>Status</h1>
			<p className="tm-lead">Les bare. Planen endres med kort.</p>

			<h2>Veien</h2>
			{pl ? (
				<>
					<p className="tm-big-line">
						{pl.goal.kind === 'event' ? pl.goal.name : 'Bedre form'}
						{pl.currentWeek ? (
							<>
								: uke <span className="num">{pl.currentWeek}</span> av{' '}
								<span className="num">{pl.totalWeeks}</span>
								{today.phase ? `, ${today.phase.name}` : ''}.
							</>
						) : (
							<>.</>
						)}
					</p>
					<p className="tm-lead" style={{ marginTop: 4 }}>
						{pl.goal.date
							? `${longDate(pl.goal.date)}${pl.goal.daysToGo !== null && pl.goal.daysToGo >= 0 ? `, om ${plural(pl.goal.daysToGo, 'dag', 'dager')}` : ''}.`
							: pl.block
								? `Blokk ${pl.block}, uten sluttdato.`
								: 'Uten sluttdato.'}
						{pl.goal.aim ? ` ${pl.goal.aim}.` : ''}
					</p>
					<div className="tm-bands">
						{pl.phases.map((ph, i) => (
							<div
								key={i}
								className={cx('tm-band', ph.isCurrent && 'current')}
								style={{ flex: ph.weeks }}
							>
								{ph.weeks / pl.totalWeeks >= 0.3 ? ph.name : ''}
							</div>
						))}
					</div>
					<div className="tm-band-legend">
						<span>{pl.phases.map((ph) => ph.name).join(' · ')}</span>
						<Link
							to={`${BASE}/plan`}
							style={{
								textDecoration: 'underline',
								textUnderlineOffset: 3,
								display: 'inline-flex',
								alignItems: 'center',
								minHeight: 44,
								margin: '-12px 0',
								padding: '0 4px',
							}}
						>
							Planarket
						</Link>
					</div>
					{g && g.goal.date ? (
						<p className="tm-lead" style={{ marginTop: 12 }}>
							Kondisjon på løpsdagen hvis du følger planen:{' '}
							{g.projectedFitnessOnGoalDay.value === null ? (
								<Unknown why={g.projectedFitnessOnGoalDay.why} />
							) : (
								<b className="num">{num(g.projectedFitnessOnGoalDay.value)}</b>
							)}
							.
						</p>
					) : null}
				</>
			) : (
				<p className="tm-big-line">Ingen plan ennå.</p>
			)}

			<h2>Form og slitenhet</h2>
			{progress ? (
				<>
					<FormLine p={progress} />
					<p className="tm-lead" style={{ marginTop: 6 }}>
						{today.readiness.sentence}
					</p>
					<div style={{ marginTop: 14 }}>
						<FormChart p={progress} />
					</div>
				</>
			) : (
				<p className="tm-lead">
					<Unknown /> Fikk ikke hentet fremgangen.
				</p>
			)}

			<h2>Denne uka mot plan</h2>
			{today.week.length === 0 ? (
				<p className="tm-lead">Ingen idretter i planen denne uka.</p>
			) : (
				<div className="tm-vol">
					{today.week.map((v) => {
						const a = v.actual.value
						const t = v.target.value ?? v.planned.value
						const max = Math.max(a ?? 0, t ?? 0, 1)
						if (t === 0)
							return (
								<div className="tm-vol-row" key={v.sport}>
									<div className="tm-vol-head">
										<span>{v.sportName}</span>
										<span className="num">
											{a === null ? (
												<Unknown why={v.actual.why} />
											) : (
												unitText(v.unit, a)
											)}
											, ingenting planlagt
										</span>
									</div>
								</div>
							)
						return (
							<div className="tm-vol-row" key={v.sport}>
								<div className="tm-vol-head">
									<span>{v.sportName}</span>
									<span className="num">
										{a === null ? (
											<Unknown why={v.actual.why} />
										) : (
											unitText(v.unit, a)
										)}{' '}
										av{' '}
										{t === null ? (
											<Unknown why={v.target.why ?? v.planned.why} />
										) : (
											unitText(v.unit, t)
										)}
									</span>
								</div>
								<div className="tm-track">
									{a !== null ? (
										<i style={{ width: `${(a / max) * 100}%` }} />
									) : null}
									{t !== null ? (
										<u style={{ left: `calc(${(t / max) * 100}% - 2px)` }} />
									) : null}
								</div>
							</div>
						)
					})}
				</div>
			)}

			{progress &&
			progress.weekly.some(
				(w) => (w.actualLoad.value ?? 0) > 0 || (w.plannedLoad.value ?? 0) > 0,
			) ? (
				<>
					<h2>Uke for uke</h2>
					{progress.trend ? (
						<p className="tm-lead" style={{ marginBottom: 12 }}>
							{plural(progress.trend.weeks, 'uke', 'uker')} på rad{' '}
							{progress.trend.direction === 'under' ? 'under' : 'over'} planen.
						</p>
					) : null}
					<WeekBars p={progress} />
				</>
			) : null}

			<h2>Øktene</h2>
			{sessions.length === 0 ? (
				<p className="tm-lead">Ingen økter de siste fire ukene.</p>
			) : (
				<div className="tm-list">
					{sessions.map((s) => {
						const call = s.verdict.call
						const pending = s.status === 'planned'
						return (
							<Link
								key={s.id}
								to={`${BASE}/kort/okt.${s.id}`}
								className="tm-li"
							>
								<div className="tm-li-main">
									<div className="tm-li-title">{s.title}</div>
									<div className="tm-li-sub">
										{shortDate(s.date)} · {s.sportName}
										{s.rpe ? ` · tyngde ${s.rpe}` : ''}
									</div>
								</div>
								<span className={`tm-word ${call ?? 'none'}`}>
									{s.status === 'missed'
										? 'Ikke gjort'
										: pending
											? 'Ikke registrert'
											: s.status === 'recording-only'
												? 'Ekstra'
												: verdictWord(s.verdict)}
								</span>
							</Link>
						)
					})}
				</div>
			)}
			{more}
		</>
	)
}
