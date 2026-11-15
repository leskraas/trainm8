import { useLoaderData } from 'react-router'
import { type ProposalsOutput } from '#app/lab/engine/reads.types.ts'
import { type UndoAllChangesOutput } from '#app/lab/engine/sessions.types.ts'
import { type Route } from './+types/logg.ts'
import { cap } from './__engine.server.ts'
import { dateMedium, isoWeek } from './__format.ts'
import { ErrorBar, Shell, useHb } from './__ui.tsx'

export async function loader({ request }: Route.LoaderArgs) {
	const p = await cap<ProposalsOutput>(request, 'proposals')
	return p.ok
		? { ok: true as const, p: p.value }
		: { ok: false as const, message: p.message }
}

export const meta = () => [{ title: 'Endringslogg · Hovedbok' }]

function when(iso: string) {
	const d = new Date(iso)
	return `${d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}`
}

export default function LogRoute() {
	const d = useLoaderData<typeof loader>()
	const { log, undoEntry, act, busy } = useHb()
	const cm = d.ok ? d.p.changesMade : null
	const answered = d.ok
		? d.p.proposals.filter((p) => p.state !== 'waiting')
		: []
	return (
		<Shell title="Endringslogg" sub={`${log.length} endringer her`}>
			{!d.ok ? <ErrorBar message={d.message} /> : null}
			<div className="hb-page">
				{cm && cm.changes.length ? (
					<>
						<div className="sec">
							Planen selv · {cm.heading} · U{isoWeek(cm.weekKey)}
						</div>
						<table className="sub prose">
							<tbody>
								{cm.changes.map((c) => (
									<tr key={c.proposalId}>
										<td>
											{c.text}
											{c.about ? <div className="mute">{c.about}</div> : null}
										</td>
										<td className="num" style={{ width: 96 }}>
											{c.undo === 'offered' ? (
												<button
													type="button"
													className="btn sm"
													disabled={busy}
													onClick={() =>
														void act(
															'undo_change',
															{ proposalId: c.proposalId },
															() => ({
																what: `Angret planens endring: ${c.text}`,
															}),
														)
													}
												>
													Angre
												</button>
											) : (
												<span className="mute">
													{c.undo === 'undone'
														? 'angret'
														: c.undo === 'closed'
															? 'for sent'
															: ''}
												</span>
											)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
						{cm.undoable > 1 ? (
							<button
								type="button"
								className="btn sm"
								onClick={() =>
									void act<UndoAllChangesOutput>(
										'undo_all_changes',
										{
											closedWeek: d.ok
												? (d.p.closedWeek ?? undefined)
												: undefined,
										},
										(v) => ({
											what: `Angret ${v.count} endringer planen gjorde selv${v.kept.length ? `. Står: ${v.kept.join('; ')}` : ''}`,
										}),
									)
								}
							>
								Angre alle {cm.undoable}
							</button>
						) : null}
					</>
				) : null}
				<div className="sec">Dine endringer · på denne enheten</div>
				{log.length ? (
					<table className="sub prose">
						<thead>
							<tr>
								<th style={{ width: 82 }}>Når</th>
								<th>Endring</th>
								<th className="num" style={{ width: 84 }} />
							</tr>
						</thead>
						<tbody>
							{log.map((e) => (
								<tr
									key={e.id}
									style={e.undone ? { color: 'var(--mute)' } : undefined}
								>
									<td className="mute">{when(e.at)}</td>
									<td style={{ overflowWrap: 'anywhere' }}>
										<span
											style={
												e.undone
													? { textDecoration: 'line-through' }
													: undefined
											}
										>
											{e.what}
										</span>
										{e.before || e.after ? (
											<div className="mute">
												<span className="strike">{e.before || 'tom'}</span> →{' '}
												{e.after || 'tom'}
											</div>
										) : null}
										{e.undoFailed ? (
											<div style={{ color: 'var(--danger)' }}>
												{e.undoFailed}
											</div>
										) : null}
										{!e.token && e.noUndo ? (
											<div className="mute">{e.noUndo}</div>
										) : null}
									</td>
									<td className="num">
										{e.token && !e.undone && !e.undoFailed ? (
											<button
												type="button"
												className="btn sm"
												disabled={busy}
												onClick={() => void undoEntry(e.id)}
											>
												Angre
											</button>
										) : e.undone ? (
											<span className="mute">angret</span>
										) : null}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				) : (
					<p className="why">
						Ingen endringer ennå. Alt du flytter, hopper over eller endrer,
						havner her med angre.
					</p>
				)}
				{answered.length ? (
					<>
						<div className="sec">Forslag du har svart på</div>
						<table className="sub prose">
							<tbody>
								{answered.map((p) => (
									<tr key={p.id}>
										<td>
											{p.headline}
											<div className="mute">{p.reason}</div>
										</td>
										<td className="num mute" style={{ width: 110 }}>
											{p.stateLabel ?? p.state}
											{p.session ? (
												<div>{dateMedium(p.session.date, false)}</div>
											) : null}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</>
				) : null}
				<p className="why" style={{ marginTop: 16 }}>
					Loggen over dine endringer lagres i denne nettleseren. Angre virker så
					lenge det den ville satt tilbake fortsatt står.
				</p>
			</div>
		</Shell>
	)
}
