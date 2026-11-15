import { Link } from 'react-router'
import { runCapability } from '#app/lab/engine/registry.server.ts'
import { TracksPanel } from '../__forms.tsx'
import {
	BASE,
	ErrorLine,
	Known,
	Sheet,
	fmtDay,
	fmtDuration,
	fmtKm,
} from '../__ui.tsx'
import { type Route } from './+types/spor.ts'

export async function loader({ request }: Route.LoaderArgs) {
	const [c, s, r] = await Promise.all([
		runCapability(request, 'connections', {}),
		runCapability(request, 'import_status', {}),
		runCapability(request, 'recordings', { limit: 15 }),
	])
	return {
		connections: c.ok ? c.value : null,
		connectionsError: c.ok ? null : c.message,
		status: s.ok ? s.value : null,
		recordings: r.ok ? r.value : null,
		recordingsError: r.ok ? null : r.message,
	}
}

export const meta = () => [{ title: 'Sti · Spor' }]

export default function Spor({ loaderData }: Route.ComponentProps) {
	const { connections, connectionsError, status, recordings, recordingsError } =
		loaderData
	return (
		<Sheet kicker="Sekken" title="Spor" back={`${BASE}/sekk`}>
			<TracksPanel
				connections={connections}
				connectionsError={connectionsError}
				status={status}
				showManage
			/>
			<section style={{ marginTop: 24 }}>
				<h2 className="caps" style={{ fontSize: 14, marginBottom: 8 }}>
					Siste spor
				</h2>
				<ErrorLine message={recordingsError} />
				{recordings && recordings.recordings.length === 0 ? (
					<p className="soft">Stien bak deg tegnes når øktene kommer inn.</p>
				) : null}
				<div style={{ display: 'grid' }}>
					{recordings?.recordings.map((r) => (
						<Link
							key={r.id}
							to={
								r.sessionId
									? `${BASE}/steg/${r.date}?okt=${r.sessionId}`
									: `${BASE}/steg/${r.date}`
							}
							style={{
								display: 'flex',
								gap: 10,
								padding: '10px 0',
								borderTop: '1px solid var(--ink-faint)',
								color: 'inherit',
								textDecoration: 'none',
								minHeight: 52,
								alignItems: 'center',
							}}
						>
							<span className="num soft" style={{ width: 84, fontSize: 13 }}>
								{fmtDay(r.date)}
							</span>
							<span style={{ flex: 1, minWidth: 0 }}>
								{r.sportName} · <Known n={r.durationS} fmt={fmtDuration} />
								{r.distanceM.value !== null ? (
									<> · {fmtKm(r.distanceM.value)}</>
								) : null}
							</span>
							<span
								className="soft"
								style={{ fontSize: 12, whiteSpace: 'nowrap' }}
							>
								{r.linkedToPlan ? 'på stien' : 'ekstra'}
							</span>
						</Link>
					))}
				</div>
			</section>
		</Sheet>
	)
}
