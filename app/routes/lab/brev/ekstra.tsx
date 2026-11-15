import { useState } from 'react'
import { Link } from 'react-router'
import {
	type ProposalItem,
	type ProposalsOutput,
	type TodayOutput,
} from '#app/lab/engine/reads.types.ts'
import { runCapability } from '#app/lab/engine/registry.server.ts'
import {
	type AcceptAllProposalsOutput,
	type AnswerProposalOutput,
	type EaseWeekOutput,
	type UndoAllChangesOutput,
	type UndoOutput,
} from '#app/lab/engine/sessions.types.ts'
import { type Route } from './+types/ekstra.ts'
import { ProposalLine } from './__letter.tsx'
import {
	BASE,
	dateText,
	greetingName,
	mondayOf,
	n1,
	unitWord,
	weekSpan,
} from './__lib.ts'
import { addPs } from './__ps.ts'
import { ErrorLine, N, Unknown, useWrite } from './__ui.tsx'

export async function loader({ request }: Route.LoaderArgs) {
	const [athlete, proposals, today] = await Promise.all([
		runCapability(request, 'athlete', {}),
		runCapability(request, 'proposals', {}),
		runCapability(request, 'today', {}),
	])
	if (!athlete.ok) throw new Response(athlete.message, { status: 500 })
	return {
		me: athlete.value,
		proposals: proposals.ok ? (proposals.value as ProposalsOutput) : null,
		today: today.ok ? (today.value as TodayOutput) : null,
		error: proposals.ok ? null : proposals.message,
	}
}

export const meta = () => [{ title: 'Brev · ekstrabrev' }]

export default function Ekstra({ loaderData }: Route.ComponentProps) {
	const { me, proposals, today, error } = loaderData
	const name = greetingName(me.name, me.username)
	const waiting = (proposals?.proposals ?? []).filter(
		(p) => p.state === 'waiting',
	)
	const rounds = waiting.filter((p) => p.block)
	const plain = waiting.filter((p) => !p.block)
	const all = useWrite<Record<string, never>, AcceptAllProposalsOutput>(
		'accept_all_proposals',
	)
	const easeWeek = useWrite<{ week?: string }, EaseWeekOutput>('ease_week')
	const [eased, setEased] = useState<EaseWeekOutput | null>(null)
	const [declinedEase, setDeclinedEase] = useState(false)
	const call = today?.readiness.call
	const acute =
		call === 'drifting' || call === 'overreaching' || call === 'fatigued'
	const changes = proposals?.changesMade
	const nothing =
		!waiting.length && !acute && !(changes && changes.changes.length)

	return (
		<main className="b-col">
			<Link to={BASE} className="b-back">
				← Ukas brev
			</Link>
			<article className="b-sheet b-new-letter">
				<p
					className="b-small"
					style={{
						margin: 0,
						letterSpacing: '.06em',
						textTransform: 'uppercase',
					}}
				>
					Ekstrabrev
				</p>
				<h1 className="b-h" style={{ marginTop: 6 }}>
					Kjære {name},
				</h1>
				{nothing ? (
					<p className="b-p">
						Ingen ekstrabrev nå. Jeg skriver bare midt i uka når noe haster.
						Resten kommer i søndagsbrevet.
					</p>
				) : null}

				{acute && today ? (
					<section>
						<p className="b-p">{today.readiness.sentence}</p>
						{today.readiness.nextSession.sentence ? (
							<p className="b-p">{today.readiness.nextSession.sentence}</p>
						) : null}
						{eased ? (
							<p className="b-p b-ok b-fade-in">
								Gjort. {eased.sessionsChanged}{' '}
								{eased.sessionsChanged === 1 ? 'økt' : 'økter'} i uka fra{' '}
								{dateText(eased.week)} er lettere nå
								{eased.volume.length ? ': ' : '.'}
								{eased.volume.map((v, i) => (
									<span key={v.sport + i}>
										{i ? ', ' : ''}
										{v.before !== null && v.after !== null ? (
											<N>
												{n1(v.before)} → {n1(v.after)} {unitWord(v.unit)}
											</N>
										) : (
											<Unknown>ukjent mengde</Unknown>
										)}
									</span>
								))}
								{eased.volume.length ? '.' : ''}
							</p>
						) : declinedEase ? (
							<p className="b-p b-fade-in">
								Da lar jeg uka stå. Jeg tar det opp igjen søndag.
							</p>
						) : (
							<>
								<p className="b-p">
									<span className="b-suggest">
										Vil du at jeg letter resten av uka?
									</span>
								</p>
								<div className="b-row">
									<button
										type="button"
										className="b-btn"
										disabled={easeWeek.pending}
										onClick={async () => {
											const r = await easeWeek.call({})
											if (r.ok) {
												setEased(r.value)
												addPs({
													weekKey: r.value.week,
													text: `Uka gjort lettere etter ekstrabrevet: ${r.value.sessionsChanged} økter skalert ned.`,
													token: r.value.undo,
													noUndoBecause: r.value.noUndoBecause,
												})
											}
										}}
									>
										Ja
									</button>
									<button
										type="button"
										className="b-btn b-btn-ghost"
										onClick={() => setDeclinedEase(true)}
									>
										Nei
									</button>
								</div>
								<ErrorLine message={easeWeek.error} />
							</>
						)}
					</section>
				) : null}

				{waiting.length ? (
					<section>
						<h2 className="b-h2">
							Forslag for uka{' '}
							{proposals?.forWeek ? weekSpan(proposals.forWeek) : ''}
						</h2>
						{proposals?.summary ? (
							<p className="b-p">{proposals.summary}</p>
						) : null}
						<p className="b-p">
							Ingenting endres før du svarer. Det som er understreket, er
							forslag.
						</p>
						<ul className="b-ps">
							{plain.map((p) => (
								<ProposalLine key={p.id} p={p} />
							))}
						</ul>
						{rounds.map((p) => (
							<RoundLine key={p.id} p={p} />
						))}
						{waiting.length > 1 ? (
							<>
								<button
									type="button"
									className="b-btn b-btn-ghost"
									disabled={all.pending}
									onClick={async () => {
										const r = await all.call({})
										if (r.ok && r.value.accepted.length)
											addPs({
												weekKey: proposals?.forWeek ?? mondayOf(me.today),
												text: `Du sa ja til ${r.value.accepted.length} forslag.`,
												token: r.value.undo,
												noUndoBecause: r.value.noUndoBecause,
											})
									}}
								>
									Ja til alle
								</button>
								{all.result?.ok && all.result.value.failed.length ? (
									<ul className="b-small">
										{all.result.value.failed.map((f) => (
											<li key={f.proposalId}>{f.because}</li>
										))}
									</ul>
								) : null}
								<ErrorLine message={all.error} />
							</>
						) : null}
					</section>
				) : null}

				{changes && changes.changes.length ? (
					<ChangesMade changes={changes} />
				) : null}

				{proposals?.easedWeek ? (
					<p className="b-small" style={{ marginTop: 18 }}>
						Du har gjort uka fra {dateText(proposals.easedWeek.weekKey)}{' '}
						lettere.
					</p>
				) : null}
				<ErrorLine message={error} />
				<p className="b-p" style={{ marginTop: 24, marginBottom: 0 }}>
					Hilsen
					<br />
					<span className="b-sign-name">treningspartneren din</span>
				</p>
			</article>
		</main>
	)
}

function RoundLine({ p }: { p: ProposalItem }) {
	const b = p.block!
	const [f, setF] = useState(b.factor)
	const round = useWrite<
		{ proposalId: string; factor: number },
		AnswerProposalOutput
	>('accept_round')
	const no = useWrite<
		{ proposalId: string; answer: 'no' },
		AnswerProposalOutput
	>('answer_proposal')
	return (
		<div style={{ margin: '12px 0 18px' }}>
			<p className="b-p" style={{ marginBottom: 6 }}>
				<span className="b-suggest">{p.headline}.</span>{' '}
				<span style={{ color: 'var(--ink-2)' }}>{p.reason}</span>
			</p>
			<label className="b-label" htmlFor={`f-${p.id}`}>
				Mengde neste runde: <N>{Math.round(f * 100)} %</N>
				{b.peak ? (
					<>
						{' '}
						(topp rundt{' '}
						<N>
							{n1(b.peak.value * (f / b.factor))} {unitWord(b.peak.unit)}
						</N>
						)
					</>
				) : null}
			</label>
			<input
				id={`f-${p.id}`}
				type="range"
				min={b.min}
				max={b.max}
				step={b.step}
				value={f}
				onChange={(e) => setF(Number(e.target.value))}
				style={{ width: '100%', minHeight: 44, accentColor: 'var(--ink)' }}
			/>
			<div className="b-row">
				<button
					type="button"
					className="b-btn"
					disabled={round.pending}
					onClick={async () => {
						const r = await round.call({ proposalId: p.id, factor: f })
						if (r.ok)
							addPs({
								weekKey: p.weekKey,
								text: `Ny runde på ${Math.round(f * 100)} %.`,
								token: r.value.undo,
								noUndoBecause: r.value.noUndoBecause,
							})
					}}
				>
					Ja, sånn
				</button>
				<button
					type="button"
					className="b-btn b-btn-ghost"
					disabled={no.pending}
					onClick={() => void no.call({ proposalId: p.id, answer: 'no' })}
				>
					Nei
				</button>
			</div>
			<ErrorLine message={round.error ?? no.error} />
		</div>
	)
}

function ChangesMade({
	changes,
}: {
	changes: NonNullable<ProposalsOutput['changesMade']>
}) {
	const undoAll = useWrite<{ closedWeek?: string }, UndoAllChangesOutput>(
		'undo_all_changes',
	)
	const [kept, setKept] = useState<string[] | null>(null)
	return (
		<section>
			<h2 className="b-h2">{changes.heading}</h2>
			<p className="b-p">
				Dette gjorde jeg selv da uka lukket seg. Alt med «Angre» kan tas tilbake
				til uka begynner.
			</p>
			<ul className="b-ps">
				{changes.changes.map((c) => (
					<ChangeLine key={c.proposalId} c={c} />
				))}
			</ul>
			{changes.undoable > 1 ? (
				<button
					type="button"
					className="b-btn b-btn-ghost"
					disabled={undoAll.pending}
					onClick={async () => {
						const r = await undoAll.call({})
						if (r.ok) setKept(r.value.kept)
					}}
				>
					Angre alt
				</button>
			) : null}
			{kept?.length ? (
				<ul className="b-small">
					{kept.map((k) => (
						<li key={k}>{k}</li>
					))}
				</ul>
			) : null}
			<ErrorLine message={undoAll.error} />
		</section>
	)
}

function ChangeLine({
	c,
}: {
	c: NonNullable<ProposalsOutput['changesMade']>['changes'][number]
}) {
	const undo = useWrite<{ proposalId: string }, UndoOutput>('undo_change')
	const undone = c.undo === 'undone'
	return (
		<li>
			<span className={undone ? 'b-strike' : ''}>
				{c.about ? (
					<strong style={{ fontWeight: 600 }}>{c.about}: </strong>
				) : null}
				{c.text}
			</span>{' '}
			{c.undo === 'offered' ? (
				<button
					type="button"
					className="b-word"
					style={{ color: 'var(--red)', fontSize: 16 }}
					disabled={undo.pending}
					onClick={() => void undo.call({ proposalId: c.proposalId })}
				>
					Angre
				</button>
			) : undone ? (
				<span className="b-small" style={{ fontStyle: 'italic' }}>
					Angret.
				</span>
			) : null}
			<ErrorLine message={undo.error} />
		</li>
	)
}
