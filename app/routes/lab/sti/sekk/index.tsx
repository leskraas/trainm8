import { Link } from 'react-router'
import { runCapability } from '#app/lab/engine/registry.server.ts'
import { BASE, ErrorLine, Sheet, fmtDay, plural, sportWord } from '../__ui.tsx'
import { type Route } from './+types/index.ts'

export async function loader({ request }: Route.LoaderArgs) {
	const me = await runCapability(request, 'athlete', {})
	return { me: me.ok ? me.value : null, error: me.ok ? null : me.message }
}

export const meta = () => [{ title: 'Sti · Sekken' }]

export default function Sekk({ loaderData }: Route.ComponentProps) {
	const { me, error } = loaderData
	if (!me) {
		return (
			<Sheet title="Sekken">
				<ErrorLine message={error} />
			</Sheet>
		)
	}
	const connected = me.sources.filter((s) => s.status !== 'disconnected')
	const pockets = [
		{
			to: 'utrustning',
			name: 'Utrustning',
			what: [
				me.sports.map(sportWord).join(', ') || 'ingen idretter',
				me.availability.days
					? plural(me.availability.days.length, 'dag', 'dager')
					: 'dager ikke satt',
				me.availability.strengthPerWeek
					? `${me.availability.strengthPerWeek}× styrke`
					: 'ingen styrke',
			].join(' · '),
		},
		{ to: 'kart', name: 'Kart', what: 'Terskler og soner' },
		{
			to: 'flagg',
			name: 'Flagg',
			what: me.goal
				? me.goal.kind === 'event' && me.goal.date
					? `${me.goal.name}, ${fmtDay(me.goal.date)}`
					: 'Rundløype, uten dato'
				: 'Ingen flagg',
		},
		{
			to: 'spor',
			name: 'Spor',
			what: connected.length
				? connected.map((s) => s.name).join(', ')
				: `${plural(me.recordings.count, 'økt', 'økter')}, ingen tjeneste koblet`,
		},
		{
			to: 'konto',
			name: 'Konto',
			what: `${me.name ?? me.username} · eksport og sletting`,
		},
	]
	return (
		<Sheet kicker="Sekken" title="Det du bærer med deg">
			<nav style={{ display: 'grid', gap: 10 }}>
				{pockets.map((p) => (
					<Link
						key={p.to}
						to={`${BASE}/sekk/${p.to}`}
						className="sti-card"
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 12,
							color: 'inherit',
							textDecoration: 'none',
							minHeight: 64,
						}}
					>
						<div style={{ flex: 1, minWidth: 0 }}>
							<div style={{ fontWeight: 700, fontSize: 17 }}>{p.name}</div>
							<div
								className="soft"
								style={{ fontSize: 14, overflowWrap: 'anywhere' }}
							>
								{p.what}
							</div>
						</div>
						<span aria-hidden style={{ fontSize: 20 }}>
							›
						</span>
					</Link>
				))}
			</nav>
		</Sheet>
	)
}
