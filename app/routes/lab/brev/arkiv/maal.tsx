import { useState } from 'react'
import { Link } from 'react-router'
import { type PlanOutput } from '#app/lab/engine/reads.types.ts'
import { runCapability } from '#app/lab/engine/registry.server.ts'
import {
	type ApplyGoalToPlanOutput,
	type GoalOutput,
	type GoalWriteOutput,
	type RemoveGoalOutput,
} from '#app/lab/engine/setup.types.ts'
import {
	BASE,
	dateText,
	hoursText,
	mondayOf,
	n1,
	phaseName,
	weekSpan,
} from '../__lib.ts'
import { addPs } from '../__ps.ts'
import { GoalSheet } from '../__sheets.tsx'
import { ErrorLine, N, useWrite } from '../__ui.tsx'
import { type Route } from './+types/maal.ts'

export async function loader({ request }: Route.LoaderArgs) {
	const [goal, plan, athlete] = await Promise.all([
		runCapability(request, 'goal', {}),
		runCapability(request, 'plan', {}),
		runCapability(request, 'athlete', {}),
	])
	if (!athlete.ok) throw new Response(athlete.message, { status: 500 })
	return {
		goal: goal.ok ? (goal.value as GoalOutput) : null,
		plan: plan.ok ? (plan.value as PlanOutput) : null,
		me: athlete.value,
		error: goal.ok ? null : goal.message,
	}
}

export const meta = () => [{ title: 'Brev · mål' }]

export default function Maal({ loaderData }: Route.ComponentProps) {
	const { goal, plan, me, error } = loaderData
	const [sheet, setSheet] = useState(false)
	const [undoToken, setUndoToken] = useState<string | null>(null)
	const [confirmStop, setConfirmStop] = useState(false)
	const remove = useWrite<{ stopPlan?: boolean }, RemoveGoalOutput>(
		'remove_goal',
	)
	const undo = useWrite<{ undo: string }, GoalWriteOutput>('undo_goal_change')
	const apply = useWrite<
		{ goalId: string; digest: string },
		ApplyGoalToPlanOutput
	>('apply_goal_to_plan')
	const g = goal?.goal
	const pr = goal?.proposal
	const thisYear = Number(me.today.slice(0, 4))
	const weekKey = mondayOf(me.today)

	return (
		<main className="b-col">
			<Link to={`${BASE}/arkiv`} className="b-back">
				← Arkivet
			</Link>
			<article className="b-sheet">
				<p
					className="b-small"
					style={{
						margin: 0,
						letterSpacing: '.06em',
						textTransform: 'uppercase',
					}}
				>
					Mål
				</p>
				{g ? (
					<>
						<h1
							className="b-h"
							style={{ marginTop: 6, overflowWrap: 'anywhere' }}
						>
							{g.name}
						</h1>
						<p className="b-p">
							{dateText(g.date, thisYear)}
							{g.distanceKm ? (
								<>
									, <N>{n1(g.distanceKm)} km</N>
								</>
							) : null}
							{g.targetTime ? (
								<>
									, helst på <N>{g.targetTime.text}</N>
								</>
							) : null}
							.{' '}
							{g.daysLeft >= 0 ? (
								<>
									<N>{g.daysLeft}</N> dager igjen.
								</>
							) : (
								'Det har vært.'
							)}{' '}
							{g.planRunsTowardIt
								? 'Planen går mot dette løpet.'
								: 'Planen går ikke mot dette løpet ennå.'}
							{g.status === 'cancelled' ? ' Det er avlyst.' : ''}
						</p>
						{g.targetTime ? (
							<p
								className="b-margin"
								style={{ fontSize: 16, lineHeight: '24px' }}
							>
								Jeg har ikke grunnlag for å si om {g.targetTime.text} er
								realistisk ennå. Når jeg har 6 uker med økter mot planen, sier
								jeg fra.
							</p>
						) : null}
						<div className="b-row">
							<button
								type="button"
								className="b-btn"
								onClick={() => setSheet(true)}
							>
								Skriv om målet
							</button>
							{!confirmStop ? (
								<button
									type="button"
									className="b-btn b-btn-ghost"
									disabled={remove.pending}
									onClick={async () => {
										if (g.planRunsTowardIt) {
											setConfirmStop(true)
											return
										}
										const r = await remove.call({})
										if (r.ok) setUndoToken(r.value.undo)
									}}
								>
									Fjern målet
								</button>
							) : null}
						</div>
						{confirmStop ? (
							<div
								className="b-margin b-fade-in"
								style={{ fontStyle: 'normal' }}
							>
								<p style={{ margin: '0 0 8px' }}>
									Planen er bygd for dette løpet. Fjerner du målet, stopper
									planen også, og du lager en ny i introduksjonsbrevet. Du kan
									angre så lenge du ikke har laget en ny.
								</p>
								<div className="b-row">
									<button
										type="button"
										className="b-btn b-btn-red"
										disabled={remove.pending}
										onClick={async () => {
											const r = await remove.call({ stopPlan: true })
											if (r.ok) {
												setUndoToken(r.value.undo)
												setConfirmStop(false)
											}
										}}
									>
										Fjern mål og stopp planen
									</button>
									<button
										type="button"
										className="b-btn b-btn-ghost"
										onClick={() => setConfirmStop(false)}
									>
										Behold
									</button>
								</div>
							</div>
						) : null}
					</>
				) : (
					<>
						<h1 className="b-h" style={{ marginTop: 6 }}>
							Bare bli i bedre form
						</h1>
						<p className="b-p">
							Du har ikke noe løp. Planen bygger deg opp blokk for blokk, uten
							sluttdato.
						</p>
						<button
							type="button"
							className="b-btn"
							onClick={() => setSheet(true)}
						>
							Legg til et løp
						</button>
					</>
				)}

				{undoToken ? (
					<p className="b-p b-fade-in" style={{ marginTop: 14 }}>
						<strong style={{ fontWeight: 600 }}>PS:</strong> Målet er{' '}
						{remove.result?.ok && remove.result.value.planStopped
							? 'fjernet, og planen stoppet'
							: 'endret'}
						.{' '}
						<button
							type="button"
							className="b-word"
							style={{ color: 'var(--red)' }}
							disabled={undo.pending}
							onClick={async () => {
								const r = await undo.call({ undo: undoToken })
								if (r.ok) setUndoToken(null)
							}}
						>
							Angre
						</button>
					</p>
				) : null}
				<ErrorLine message={error ?? remove.error ?? undo.error} />

				{pr ? (
					<section style={{ marginTop: 24 }}>
						<h2 className="b-h2">Skal planen gå mot løpet?</h2>
						<p className="b-p">
							<span className="b-suggest">
								Jeg avslutter{' '}
								{phaseName(pr.endsCurrentBlock.name).toLowerCase()} etter{' '}
								{pr.endsCurrentBlock.weeksKept} av{' '}
								{pr.endsCurrentBlock.weeksHad} uker
							</span>
							, og legger så:{' '}
							{pr.phases.map((p, i) => (
								<span key={p.from}>
									{i ? ', ' : ''}
									{phaseName(p.name).toLowerCase()} i {p.weeks}{' '}
									{p.weeks === 1 ? 'uke' : 'uker'}
								</span>
							))}
							.{' '}
							{pr.ownSessionsKept
								? `Dine egne ${pr.ownSessionsKept} økter blir stående.`
								: ''}
						</p>
						{pr.steepWeeks.length ? (
							<p className="b-margin">
								Merk:{' '}
								{pr.steepWeeks
									.map(
										(w) =>
											`uka ${weekSpan(w.weekStart)} går fra ${hoursText(w.fromHours)} til ${hoursText(w.toHours)}`,
									)
									.join('; ')}
								. Det er mer enn 10 % opp.
							</p>
						) : null}
						<div className="b-row">
							<button
								type="button"
								className="b-btn"
								disabled={apply.pending}
								onClick={async () => {
									const r = await apply.call({
										goalId: pr.goalId,
										digest: pr.digest,
									})
									if (r.ok)
										addPs({
											weekKey,
											text: `Planen går nå mot ${r.value.goal.name}. ${r.value.endedBlock.name} ble avsluttet.`,
											token: null,
											noUndoBecause: 'fjern målet for å stoppe',
										})
								}}
							>
								Ja, gjør det
							</button>
						</div>
						<ErrorLine message={apply.error} />
					</section>
				) : goal?.problem ? (
					<p className="b-margin" style={{ marginTop: 16 }}>
						{goal.problem}
					</p>
				) : null}

				{plan?.events.length ? (
					<section style={{ marginTop: 24 }}>
						<h2 className="b-h2">Løp du har lagt inn</h2>
						<ul className="b-ps">
							{plan.events.map((e) => (
								<li key={e.id}>
									{e.name}{' '}
									<span className="b-small">
										· {dateText(e.date, thisYear)} · {e.priority}-løp
										{e.isPlanGoal ? ' · planens mål' : ''}
									</span>
								</li>
							))}
						</ul>
					</section>
				) : null}
			</article>
			<GoalSheet
				open={sheet}
				onClose={() => setSheet(false)}
				goal={goal}
				today={me.today}
				onSaved={(t) => {
					setSheet(false)
					setUndoToken(t)
				}}
			/>
		</main>
	)
}
