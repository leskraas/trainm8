import { Link, useLoaderData } from 'react-router'
import { type PlanOutput } from '#app/lab/engine/reads.types.ts'
import { run } from '../__data.server.ts'
import { shortDate, volume } from '../__fmt.ts'
import { PhaseStrip } from '../__season.tsx'
import { Unknown } from '../__ui.tsx'
import { type Route } from './+types/plan.ts'

export async function loader({ request }: Route.LoaderArgs) {
	const r = await run<PlanOutput>(request, 'plan', {})
	return r.ok
		? { plan: r.value, error: null }
		: { plan: null, error: r.message }
}

const ROLE: Record<string, string> = {
	loading: 'bygger',
	recovery: 'lett uke',
	taper: 'nedtrapping',
}

export default function OppslagPlan() {
	const { plan: out, error } = useLoaderData<typeof loader>()
	if (!out) return <p className="prat-err">{error}</p>
	const p = out.plan
	if (!p)
		return (
			<>
				<h2 className="prat-h2">Planen</h2>
				<p className="prat-note">
					Ingen plan ennå. Svar på spørsmålene i tråden, så legger jeg en.
				</p>
			</>
		)
	const current = p.phases.find((x) => x.isCurrent)?.name ?? null
	return (
		<>
			<div>
				<h2 className="prat-h2">{p.goal.name}</h2>
				<p className="prat-note" style={{ margin: '2px 0 0' }}>
					{p.totalWeeks} uker, {shortDate(p.firstWeek)} til{' '}
					{shortDate(p.lastWeek)}
					{p.currentWeek ? ` · nå uke ${p.currentWeek}` : ''}
					{p.block ? ` · blokk ${p.block}` : ''}
				</p>
			</div>
			{p.phases.length ? (
				<div className="prat-card">
					<PhaseStrip phases={p.phases} current={current} />
					{p.philosophy ? (
						<p className="prat-note" style={{ margin: 0 }}>
							<b style={{ color: 'var(--text)' }}>{p.philosophy.name}.</b>{' '}
							{p.philosophy.description}
						</p>
					) : null}
					<dl className="prat-kv" style={{ margin: 0 }}>
						<dt>Formkurve på dagen</dt>
						<dd>
							{p.projectedFitnessOnGoalDay.value !== null ? (
								<b className="num">
									{Math.round(p.projectedFitnessOnGoalDay.value)}
								</b>
							) : (
								<Unknown why={p.projectedFitnessOnGoalDay.why} />
							)}
						</dd>
					</dl>
				</div>
			) : null}
			<h3 className="prat-h3">Uke for uke</h3>
			<div className="prat-list">
				{p.weeks.map((w) => (
					<Link
						key={w.weekKey}
						to={`/lab/prat/oppslag/uke/${w.weekKey}`}
						className="prat-row"
						preventScrollReset
						replace
						style={
							w.when === 'current'
								? {
										background:
											'color-mix(in srgb, var(--mine) 8%, transparent)',
									}
								: undefined
						}
					>
						<span
							className="num"
							style={{ width: 30, color: 'var(--muted)', fontSize: 14 }}
						>
							{w.number}
						</span>
						<span className="prat-row-main">
							<span className="prat-row-title">
								{w.phase ?? 'Utenfor fase'}
								{w.role ? ` · ${ROLE[w.role] ?? w.role}` : ''}
								{w.when === 'current' ? ' · nå' : ''}
							</span>
							<span className="prat-row-sub">
								{shortDate(w.weekKey)} ·{' '}
								{w.sports.length
									? w.sports
											.map((s) =>
												s.target.value !== null
													? `${s.sportName.toLowerCase()} ${volume(s.target.value, s.unit)}`
													: `${s.sportName.toLowerCase()} ukjent`,
											)
											.join(', ')
									: 'ingen mengde satt'}
							</span>
						</span>
						{w.when === 'past' &&
						w.sports.some((s) => s.actual.value !== null) ? (
							<span className="prat-tag">gjort</span>
						) : null}
					</Link>
				))}
			</div>
			{out.events.length ? (
				<>
					<h3 className="prat-h3">Løp og ritt</h3>
					<div className="prat-list">
						{out.events.map((e) => (
							<div key={e.id} className="prat-row">
								<span className="prat-row-main">
									<span className="prat-row-title">{e.name}</span>
									<span className="prat-row-sub">
										{shortDate(e.date)} · {e.priority}-løp
										{e.isPlanGoal ? ' · planens mål' : ''}
									</span>
								</span>
							</div>
						))}
					</div>
				</>
			) : null}
		</>
	)
}
