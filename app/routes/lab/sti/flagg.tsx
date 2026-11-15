import { Link } from 'react-router'
import { runCapability } from '#app/lab/engine/registry.server.ts'
import { type Route } from './+types/flagg.ts'
import {
	BASE,
	ErrorLine,
	Sheet,
	fmtDay,
	fmtDuration,
	fmtPace,
	fmtNumber,
	plural,
} from './__ui.tsx'

export async function loader({ request }: Route.LoaderArgs) {
	const [goal, zones, plan] = await Promise.all([
		runCapability(request, 'goal', {}),
		runCapability(request, 'zones', {}),
		runCapability(request, 'plan', {}),
	])
	return {
		goal: goal.ok ? goal.value : null,
		error: goal.ok ? null : goal.message,
		zones: zones.ok ? zones.value : null,
		plan: plan.ok ? plan.value.plan : null,
	}
}

export const meta = () => [{ title: 'Sti · Flagget' }]

/** The race card: what waits at the end of the path. */
export default function Flagg({ loaderData }: Route.ComponentProps) {
	const { goal, error, zones, plan } = loaderData
	const g = goal?.goal ?? null
	if (!g) {
		return (
			<Sheet
				kicker="Flagget"
				title={goal?.openEnded ? 'Rundløype, uten flagg' : 'Ingen flagg ennå'}
			>
				<ErrorLine message={error} />
				<p style={{ fontSize: 16, lineHeight: 1.5 }}>
					{goal?.openEnded
						? 'Stien går i runder på fire uker, med litt mer hver runde. Sett et flagg, så får den en ende.'
						: 'Sett et løp eller ritt, så tegner jeg stien dit.'}
				</p>
				<Link
					to={`${BASE}/sekk/flagg`}
					className="sti-btn wide"
					style={{ marginTop: 18 }}
				>
					Sett et flagg
				</Link>
			</Sheet>
		)
	}
	const sport = g.sports.find((s) => s !== 'strength') ?? 'run'
	const sz = zones?.sports.find((s) => s.sport === sport)
	const goalPace =
		g.targetTime && g.distanceKm
			? sport === 'swim'
				? g.targetTime.seconds / (g.distanceKm * 10)
				: g.targetTime.seconds / g.distanceKm
			: null
	const threshold =
		sport === 'run'
			? sz?.thresholds.thresholdPace
			: sport === 'swim'
				? sz?.thresholds.css
				: sport === 'bike'
					? sz?.thresholds.ftp
					: null
	const after = g.daysLeft < 0
	return (
		<Sheet
			kicker={
				after
					? 'Flagget · bak deg'
					: `Flagget · ${g.daysLeft === 0 ? 'i dag' : plural(g.daysLeft, 'dag', 'dager') + ' igjen'}`
			}
			title={g.name}
		>
			<svg
				width="64"
				height="74"
				viewBox="0 0 64 74"
				aria-hidden
				style={{ display: 'block', margin: '4px 0 12px' }}
			>
				<path
					d="M14 72V6"
					stroke="var(--ink)"
					strokeWidth="3.5"
					strokeLinecap="round"
				/>
				<path d="M14 7h40l-10 11 10 11H14" fill="var(--dot)" />
			</svg>
			<dl
				style={{
					display: 'grid',
					gridTemplateColumns: 'auto 1fr',
					gap: '10px 18px',
					margin: 0,
					fontSize: 16,
				}}
			>
				<dt className="soft">Start</dt>
				<dd style={{ margin: 0 }}>{fmtDay(g.date, { weekday: true })}</dd>
				<dt className="soft">Distanse</dt>
				<dd style={{ margin: 0 }} className="num">
					{g.distanceKm ? (
						`${fmtNumber(g.distanceKm, 2)} km`
					) : (
						<i className="soft">ukjent: ikke satt</i>
					)}
				</dd>
				<dt className="soft">Måltid</dt>
				<dd style={{ margin: 0 }} className="num">
					{g.targetTime ? (
						g.targetTime.text
					) : (
						<i className="soft">ingen, bare fullføre</i>
					)}
				</dd>
				<dt className="soft">Åpningsfart</dt>
				<dd style={{ margin: 0 }} className="num">
					{goalPace && sport !== 'bike' ? (
						<>
							{fmtPace(goalPace, sport === 'swim' ? '100m' : 'km')}{' '}
							<span className="soft">(jevn fart til måltiden)</span>
						</>
					) : (
						<i className="soft">
							ukjent: {g.targetTime ? 'mangler distanse' : 'mangler måltid'}
						</i>
					)}
				</dd>
				<dt className="soft">
					{sport === 'bike' ? 'FTP' : sport === 'swim' ? 'CSS' : 'Terskelfart'}
				</dt>
				<dd style={{ margin: 0 }} className="num">
					{threshold?.value != null ? (
						sport === 'bike' ? (
							`${Math.round(threshold.value)} W`
						) : (
							fmtPace(threshold.value, sport === 'swim' ? '100m' : 'km')
						)
					) : (
						<i className="soft">ukjent: mangler terskel</i>
					)}
				</dd>
				{plan?.projectedFitnessOnGoalDay ? (
					<>
						<dt className="soft">Form på dagen</dt>
						<dd style={{ margin: 0 }} className="num">
							{plan.projectedFitnessOnGoalDay.value !== null ? (
								`fitness ${fmtNumber(plan.projectedFitnessOnGoalDay.value)} om du følger stien`
							) : (
								<i className="soft">
									{plan.projectedFitnessOnGoalDay.why ?? 'ukjent'}
								</i>
							)}
						</dd>
					</>
				) : null}
			</dl>
			{goalPace && g.targetTime ? (
				<p className="soft" style={{ fontSize: 14, marginTop: 14 }}>
					{fmtDuration(g.targetTime.seconds)} over{' '}
					{fmtNumber(g.distanceKm ?? 0, 2)} km. Start litt roligere enn dette de
					første minuttene, og la det komme.
				</p>
			) : null}
			{!g.planRunsTowardIt ? (
				<div className="sti-fog" style={{ marginTop: 14 }}>
					Stien går ikke mot dette flagget ennå. Det kan du endre i sekken.
				</div>
			) : null}
			{after ? (
				<div style={{ marginTop: 20, display: 'grid', gap: 10 }}>
					<p style={{ fontSize: 18, fontWeight: 650 }}>Du kom fram. Ny sti?</p>
					<Link to={`${BASE}/sekk/flagg`} className="sti-btn alt">
						Sett et nytt flagg
					</Link>
				</div>
			) : (
				<Link
					to={`${BASE}/sekk/flagg`}
					className="sti-btn quiet wide"
					style={{ marginTop: 22 }}
				>
					Endre flagget
				</Link>
			)}
		</Sheet>
	)
}
