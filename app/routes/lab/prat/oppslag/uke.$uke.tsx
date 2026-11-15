import { Link, useLoaderData, useNavigate } from 'react-router'
import { type WeekOutput } from '#app/lab/engine/reads.types.ts'
import { run } from '../__data.server.ts'
import { WEEKDAY_LONG, addDays, cap, dur, shortDate } from '../__fmt.ts'
import { IconBack } from '../__icons.tsx'
import { setOrigin } from '../__overlay.tsx'
import { VolumeRows } from '../__progress.tsx'
import { SportBadge, VerdictTag } from '../__ui.tsx'
import { type Route } from './+types/uke.$uke.ts'

export async function loader({ request, params }: Route.LoaderArgs) {
	const date = /^\d{4}-\d{2}-\d{2}$/.test(params.uke) ? params.uke : undefined
	const r = await run<WeekOutput>(request, 'week', date ? { date } : {})
	return r.ok
		? { week: r.value, error: null }
		: { week: null, error: r.message }
}

const STATUS: Record<string, string> = {
	done: 'gjort',
	missed: 'ikke gjort',
	'recording-only': 'ekstra',
	planned: '',
}

export default function OppslagUke() {
	const { week: w, error } = useLoaderData<typeof loader>()
	const navigate = useNavigate()
	if (!w) return <p className="prat-err">{error}</p>
	return (
		<>
			<div
				className="prat-card-row"
				style={{ justifyContent: 'space-between' }}
			>
				<Link
					to={`/lab/prat/oppslag/uke/${addDays(w.weekKey, -7)}`}
					className="prat-iconbtn"
					aria-label="Forrige uke"
					preventScrollReset
					replace
				>
					<IconBack />
				</Link>
				<div style={{ textAlign: 'center', minWidth: 0 }}>
					<h2 className="prat-h2" style={{ margin: 0 }}>
						Uke {w.isoWeek}
					</h2>
					<span className="prat-note">
						{shortDate(w.weekKey)}–{shortDate(addDays(w.weekKey, 6))}
						{w.phase
							? ` · ${w.phase.name}, uke ${w.phase.phaseWeek} av ${w.phase.phaseWeeks}`
							: ''}
						{w.eased ? ' · gjort lettere' : ''}
					</span>
				</div>
				<Link
					to={`/lab/prat/oppslag/uke/${addDays(w.weekKey, 7)}`}
					className="prat-iconbtn"
					aria-label="Neste uke"
					preventScrollReset
					replace
					style={{ transform: 'scaleX(-1)' }}
				>
					<IconBack />
				</Link>
			</div>
			<div className="prat-card" style={{ gap: 8 }}>
				<div
					className="prat-card-row"
					style={{ justifyContent: 'space-between' }}
				>
					<span className="num" style={{ fontSize: 15 }}>
						<b>{w.counts.done}</b> gjort · {w.counts.planned} igjen ·{' '}
						{w.counts.missed} ikke gjort
						{w.counts.recordingOnly
							? ` · ${w.counts.recordingOnly} ekstra`
							: ''}
					</span>
					<VerdictTag v={w.load.verdict} />
				</div>
				<VolumeRows sports={w.sports} />
			</div>
			<div className="prat-list">
				{w.days.map((d) => (
					<div
						key={d.date}
						style={{ display: 'flex', flexDirection: 'column' }}
					>
						<div
							className="prat-row"
							style={{
								minHeight: 40,
								paddingBottom: d.sessions.length ? 2 : 10,
							}}
						>
							<span className="prat-row-main">
								<span
									className="prat-row-title"
									style={{
										fontSize: 15,
										color: d.isToday ? 'var(--mine)' : undefined,
									}}
								>
									{cap(WEEKDAY_LONG[d.weekday])} {shortDate(d.date)}
									{d.isToday ? ' · i dag' : ''}
								</span>
								{!d.sessions.length ? (
									<span className="prat-row-sub">
										{d.available === false ? 'Går ikke for deg' : 'Hvile'}
									</span>
								) : null}
							</span>
						</div>
						{d.sessions.map((s) => (
							<button
								key={s.id}
								type="button"
								className="prat-row"
								style={{ borderTop: 0, minHeight: 52, paddingTop: 4 }}
								onClick={(e) => {
									setOrigin(e.currentTarget)
									void navigate(`/lab/prat/okt/${s.id}`)
								}}
							>
								<SportBadge sport={s.sport} />
								<span className="prat-row-main">
									<span className="prat-row-title">{s.title}</span>
									<span className="prat-row-sub">
										{[
											s.planned.durationS.value !== null
												? dur(s.planned.durationS.value)
												: null,
											s.actual.durationS.value !== null &&
											s.status !== 'planned'
												? `gjort ${dur(s.actual.durationS.value)}`
												: null,
											STATUS[s.status] || null,
										]
											.filter(Boolean)
											.join(' · ')}
									</span>
								</span>
								<VerdictTag v={s.verdict} />
							</button>
						))}
					</div>
				))}
			</div>
			{w.proposals.length ? (
				<p className="prat-note" style={{ margin: 0 }}>
					{w.proposals.length} forslag venter på svar for denne uka. De står i
					tråden.
				</p>
			) : null}
		</>
	)
}
