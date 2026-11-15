import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useCapability } from '#app/lab/engine/client.ts'
import { runCapability } from '#app/lab/engine/registry.server.ts'
import {
	type ApplyGoalToPlanInput,
	type ApplyGoalToPlanOutput,
	type GoalPlanProposal,
	type RemoveGoalInput,
	type RemoveGoalOutput,
} from '#app/lab/engine/setup.types.ts'
import { GoalForm } from '../__forms.tsx'
import {
	BASE,
	ErrorLine,
	Sheet,
	Spinner,
	fmtDay,
	fmtHours,
	markChange,
	phaseName,
	plural,
} from '../__ui.tsx'
import { type Route } from './+types/flagg.ts'

export async function loader({ request }: Route.LoaderArgs) {
	const [goal, setup] = await Promise.all([
		runCapability(request, 'goal', {}),
		runCapability(request, 'get_setup', {}),
	])
	return {
		goal: goal.ok ? goal.value : null,
		error: goal.ok ? null : goal.message,
		sports: setup.ok ? (setup.value.answers.sports ?? ['run']) : ['run'],
		hasPlan: setup.ok ? setup.value.hasPlan : true,
	}
}

export const meta = () => [{ title: 'Sti · Flagg' }]

export default function SekkFlagg({ loaderData }: Route.ComponentProps) {
	const { goal, error, sports, hasPlan } = loaderData
	const navigate = useNavigate()
	const [editing, setEditing] = useState(!goal?.goal)
	const g = goal?.goal ?? null
	return (
		<Sheet kicker="Sekken" title="Flagg" back={`${BASE}/sekk`}>
			<ErrorLine message={error} />
			{g ? (
				<div className="sti-card" style={{ display: 'grid', gap: 4 }}>
					<div className="caps soft" style={{ fontSize: 12 }}>
						{g.status === 'cancelled'
							? 'Avlyst'
							: g.daysLeft < 0
								? 'Bak deg'
								: `${plural(g.daysLeft, 'dag', 'dager')} igjen`}
					</div>
					<strong style={{ fontSize: 18, overflowWrap: 'anywhere' }}>
						{g.name}
					</strong>
					<span className="soft num">
						{fmtDay(g.date, { weekday: true })}
						{g.distanceKm
							? ` · ${g.distanceKm.toLocaleString('nb-NO')} km`
							: ''}
						{g.targetTime ? ` · mål ${g.targetTime.text}` : ''}
					</span>
					<span className="soft" style={{ fontSize: 14 }}>
						{g.planRunsTowardIt
							? 'Stien går mot dette flagget.'
							: 'Stien går ikke mot dette flagget ennå.'}
					</span>
				</div>
			) : (
				<p className="soft" style={{ marginBottom: 12 }}>
					{goal?.openEnded
						? 'Ingen flagg: stien er en rundløype.'
						: 'Ingen flagg satt.'}
				</p>
			)}
			{goal?.problem ? (
				<div className="sti-fog" style={{ marginTop: 12 }}>
					{goal.problem}
				</div>
			) : null}
			{goal?.proposal ? <ApplyGoal proposal={goal.proposal} /> : null}

			{g && !editing ? (
				<div
					style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}
				>
					<button
						type="button"
						className="sti-btn quiet"
						onClick={() => setEditing(true)}
					>
						Endre flagget
					</button>
					<RemoveGoal planRuns={g.planRunsTowardIt} after={g.daysLeft < 0} />
				</div>
			) : null}

			{editing ? (
				<div style={{ marginTop: 18 }}>
					<GoalForm
						sports={sports}
						goal={goal}
						submitLabel={g ? 'Lagre flagget' : 'Sett flagget'}
						onDone={(out) => {
							setEditing(false)
							if (out?.undo)
								markChange(
									g ? 'Flagget er endret.' : 'Flagget er satt.',
									{ undo: out.undo, noUndoBecause: null },
									[],
									'goal',
								)
							if (!hasPlan) void navigate(`${BASE}/forhandsvisning`)
						}}
					/>
					{g ? (
						<button
							type="button"
							className="sti-link"
							onClick={() => setEditing(false)}
						>
							Avbryt
						</button>
					) : null}
					{g?.planRunsTowardIt ? (
						<p className="soft" style={{ fontSize: 13, marginTop: 8 }}>
							En ny dato flytter ikke fasene på stien du alt går.
						</p>
					) : null}
				</div>
			) : null}
			{!hasPlan ? (
				<Link
					to={`${BASE}/start`}
					className="sti-link"
					style={{ marginTop: 16 }}
				>
					Lag en ny sti
				</Link>
			) : null}
		</Sheet>
	)
}

/** The goal applied to the open-ended path: shown as the alternative path, then a yes. */
function ApplyGoal({ proposal }: { proposal: GoalPlanProposal }) {
	const navigate = useNavigate()
	const apply = useCapability<ApplyGoalToPlanInput, ApplyGoalToPlanOutput>(
		'apply_goal_to_plan',
	)
	const [err, setErr] = useState<string | null>(null)
	const maxH = Math.max(1, ...proposal.outlook.map((w) => w.hours ?? 0))
	return (
		<section
			className="sti-card"
			style={{
				marginTop: 14,
				borderColor: 'var(--alt)',
				display: 'grid',
				gap: 10,
			}}
		>
			<strong>Stien mot flagget</strong>
			<p style={{ fontSize: 15, lineHeight: 1.45 }}>
				{proposal.endsCurrentBlock.name} slutter etter{' '}
				{proposal.endsCurrentBlock.weeksKept} av{' '}
				{proposal.endsCurrentBlock.weeksHad} uker. Så:{' '}
				{proposal.phases
					.map((p) => `${phaseName(p.name)} (${p.weeks})`)
					.join(' → ')}
				.
			</p>
			<svg
				viewBox={`0 0 ${proposal.outlook.length * 14 + 10} 64`}
				style={{ width: '100%', height: 64 }}
				role="img"
				aria-label="Ukene mot flagget, høyde er timer"
			>
				{proposal.outlook.map((w, i) =>
					w.hours === null ? (
						<rect
							key={w.weekStart}
							x={5 + i * 14}
							y={20}
							width={10}
							height={40}
							rx="2"
							fill="var(--fog)"
						/>
					) : (
						<rect
							key={w.weekStart}
							x={5 + i * 14}
							y={60 - (w.hours / maxH) * 52}
							width={10}
							height={(w.hours / maxH) * 52}
							rx="2"
							fill={
								proposal.steepWeeks.some((s) => s.weekStart === w.weekStart)
									? 'var(--warn)'
									: 'var(--alt)'
							}
							opacity={w.role === 'loading' ? 1 : 0.55}
						/>
					),
				)}
			</svg>
			{proposal.steepWeeks.length ? (
				<p style={{ fontSize: 14, color: 'var(--warn)' }}>
					Bratt:{' '}
					{proposal.steepWeeks
						.map(
							(s) =>
								`uka fra ${fmtDay(s.weekStart)} (${fmtHours(s.fromHours)} → ${fmtHours(s.toHours)})`,
						)
						.join(', ')}
					.
				</p>
			) : null}
			<p className="soft" style={{ fontSize: 13 }}>
				{plural(proposal.ownSessionsKept, 'egen økt', 'egne økter')} blir
				liggende. Dette kan ikke angres; å ta ned flagget er veien tilbake.
			</p>
			<ErrorLine message={err} />
			<button
				type="button"
				className="sti-btn alt"
				disabled={apply.pending}
				onClick={async () => {
					const r = await apply.call({
						goalId: proposal.goalId,
						digest: proposal.digest,
					})
					if (!r.ok) return setErr(r.message)
					markChange('Stien går nå mot flagget.', r.value, [])
					void navigate(BASE)
				}}
			>
				{apply.pending ? <Spinner /> : null}
				Gå mot flagget
			</button>
		</section>
	)
}

function RemoveGoal({
	planRuns,
	after,
}: {
	planRuns: boolean
	after: boolean
}) {
	const navigate = useNavigate()
	const remove = useCapability<RemoveGoalInput, RemoveGoalOutput>('remove_goal')
	const [ask, setAsk] = useState(false)
	const [err, setErr] = useState<string | null>(null)
	async function go() {
		setErr(null)
		const r = await remove.call(planRuns ? { stopPlan: true } : {})
		if (!r.ok) return setErr(r.message)
		markChange(
			r.value.planStopped
				? 'Flagget er tatt ned, og stien stoppet.'
				: 'Flagget er tatt ned.',
			{ undo: r.value.undo, noUndoBecause: null },
			[],
			'goal',
		)
		if (r.value.planStopped) void navigate(`${BASE}/start`)
	}
	if (!ask)
		return (
			<button
				type="button"
				className="sti-btn ghost"
				onClick={() => (planRuns ? setAsk(true) : go())}
				disabled={remove.pending}
			>
				{after ? 'Ny sti' : 'Ta ned flagget'}
			</button>
		)
	return (
		<div
			className="sti-card"
			style={{ display: 'grid', gap: 10, width: '100%' }}
		>
			<p>
				Stien er bygd for dette flagget. Tar du det ned, stopper stien også, og
				du lager en ny. Du kan angre så lenge ingen ny sti er lagt.
			</p>
			<ErrorLine message={err} />
			<div style={{ display: 'flex', gap: 8 }}>
				<button
					type="button"
					className="sti-btn danger"
					onClick={go}
					disabled={remove.pending}
				>
					{remove.pending ? <Spinner /> : null}
					Ta ned og stopp stien
				</button>
				<button
					type="button"
					className="sti-btn ghost"
					onClick={() => setAsk(false)}
				>
					Avbryt
				</button>
			</div>
		</div>
	)
}
