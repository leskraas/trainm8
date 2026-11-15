import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useCapability } from '#app/lab/engine/client.ts'
import {
	type ProposalItem,
	type WeekOutput,
} from '#app/lab/engine/reads.types.ts'
import { runCapability } from '#app/lab/engine/registry.server.ts'
import {
	type AcceptAllProposalsOutput,
	type AcceptRoundInput,
	type AnswerProposalInput,
	type AnswerProposalOutput,
	type RefreshAdaptationOutput,
	type UndoAllChangesInput,
	type UndoAllChangesOutput,
	type UndoChangeInput,
	type UndoOutput,
} from '#app/lab/engine/sessions.types.ts'
import {
	BASE,
	ErrorLine,
	Sheet,
	Spinner,
	Stone,
	fmtDay,
	markChange,
	plural,
	setMerke,
	sportLetter,
	useReducedMotion,
	wdShort,
} from '../__ui.tsx'
import { type Route } from './+types/$id.ts'

export async function loader({ request, params }: Route.LoaderArgs) {
	const p = await runCapability(request, 'proposals', {})
	if (!p.ok)
		return {
			proposals: null,
			proposal: null,
			week: null,
			error: p.message,
			id: params.id,
		}
	const proposal = p.value.proposals.find((x) => x.id === params.id) ?? null
	const week = proposal
		? await runCapability(request, 'week', { date: proposal.weekKey })
		: null
	return {
		proposals: p.value,
		proposal,
		week: week?.ok ? week.value : null,
		error: null,
		id: params.id,
	}
}

export const meta = () => [{ title: 'Sti · Veiskilt' }]

export default function Veiskilt({ loaderData }: Route.ComponentProps) {
	const { proposals, proposal, week, error, id } = loaderData
	if (!proposals) {
		return (
			<Sheet title="Veiskilt">
				<ErrorLine message={error} />
			</Sheet>
		)
	}
	if (id === 'endringer' || !proposal)
		return <Changes data={proposals} missing={id !== 'endringer'} />
	const others = proposals.proposals.filter(
		(p) => p.state === 'waiting' && p.id !== proposal.id,
	)
	return (
		<Sheet kicker={proposals.summary ?? 'Veiskilt'} title={proposal.headline}>
			<p style={{ fontSize: 16, lineHeight: 1.5 }}>{proposal.reason}</p>
			{proposal.addsLoad ? (
				<p className="soft" style={{ fontSize: 14, marginTop: 6 }}>
					Dette legger mer på deg. Det skjer bare om du sier ja.
				</p>
			) : null}
			{proposal.touchesOwnSession ? (
				<p className="soft" style={{ fontSize: 14, marginTop: 6 }}>
					Det gjelder en økt du la inn selv.
				</p>
			) : null}
			{week ? <TwoPaths proposal={proposal} week={week} /> : null}
			<Answer proposal={proposal} />
			{others.length ? (
				<section style={{ marginTop: 24 }}>
					<h2 className="caps" style={{ fontSize: 14, marginBottom: 8 }}>
						Flere veiskilt
					</h2>
					<div style={{ display: 'grid', gap: 8 }}>
						{others.map((o) => (
							<Link
								key={o.id}
								to={`${BASE}/veiskilt/${o.id}`}
								replace
								className="sti-chip"
								style={{
									borderRadius: 14,
									justifyContent: 'flex-start',
									minHeight: 52,
									textDecoration: 'none',
								}}
							>
								{o.headline}
							</Link>
						))}
					</div>
					<AcceptAll count={others.length + 1} />
				</section>
			) : null}
		</Sheet>
	)
}

/** The current path and the proposed one, side by side. The new one grows from the dot. */
function TwoPaths({
	proposal,
	week,
}: {
	proposal: ProposalItem
	week: WeekOutput
}) {
	const reduce = useReducedMotion()
	const altRef = useRef<SVGPathElement>(null)
	useEffect(() => {
		const el = altRef.current
		if (!el || reduce) return
		el.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], {
			duration: 500,
			easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
		})
	}, [reduce])
	const ch = proposal.change
	const days = week.days.map((d) => ({
		date: d.date,
		weekday: d.weekday,
		items: d.sessions
			.filter((s) => s.status !== 'recording-only')
			.map((s) => ({
				id: s.id,
				sport: s.sport,
				title: s.title,
				done: s.status === 'done',
			})),
	}))
	type Item = (typeof days)[number]['items'][number] & {
		changed?: boolean
		scale?: number
	}
	const alt: { date: string; weekday: string; items: Item[] }[] = days.map(
		(d) => ({ ...d, items: d.items.map((i) => ({ ...i })) }),
	)
	const sid = proposal.session?.id
	if (ch.kind === 'move' && sid) {
		const item = alt.flatMap((d) => d.items).find((i) => i.id === sid)
		const fromDay = alt.find((d) => d.items.some((i) => i.id === sid))
		const toDay = alt.find((d) => d.date === ch.toDate)
		if (fromDay && !ch.makeUp)
			fromDay.items = fromDay.items.filter((i) => i.id !== sid)
		if (toDay)
			toDay.items.push({
				...(item ?? {
					id: sid,
					sport: proposal.session?.sport ?? 'run',
					title: proposal.session?.title ?? '',
					done: false,
				}),
				changed: true,
			})
	} else if (ch.kind === 'swap' && sid && proposal.otherSession) {
		const a = alt.find((d) => d.items.some((i) => i.id === sid))
		const b = alt.find((d) =>
			d.items.some((i) => i.id === proposal.otherSession!.id),
		)
		if (a && b) {
			const ia = a.items.find((i) => i.id === sid)!
			const ib = b.items.find((i) => i.id === proposal.otherSession!.id)!
			a.items = a.items.map((i) =>
				i.id === sid ? { ...ib, changed: true } : i,
			)
			b.items = b.items.map((i) =>
				i.id === ib.id ? { ...ia, changed: true } : i,
			)
		}
	} else if (ch.kind === 'add') {
		const d = alt.find((x) => x.date === ch.date)
		d?.items.push({
			id: 'new',
			sport: proposal.session?.sport ?? 'run',
			title: proposal.session?.title ?? 'Nytt steg',
			done: false,
			changed: true,
		})
	} else if (ch.kind === 'scale') {
		for (const d of alt)
			d.items = d.items.map((i) =>
				ch.wholeWeek || i.id === sid
					? { ...i, scale: ch.factor, changed: true }
					: i,
			)
	}
	const ROW = 50
	const H = days.length * ROW + 20
	const W = 320
	const xCur = 90
	const xAlt = 230
	const curve = (x0: number) => {
		const pts: string[] = []
		for (let y = H - 10; y >= 10; y -= 6)
			pts.push(
				`${pts.length ? 'L' : 'M'}${(x0 + Math.sin(y / 60) * 14).toFixed(1)} ${y}`,
			)
		return pts.join(' ')
	}
	const yOf = (i: number) => H - 20 - i * ROW
	return (
		<section style={{ marginTop: 18 }}>
			<div
				style={{
					display: 'flex',
					justifyContent: 'space-around',
					fontSize: 13,
				}}
				className="caps"
			>
				<span>Din sti</span>
				<span style={{ color: 'var(--alt)' }}>Snarveien</span>
			</div>
			{ch.kind === 'add-phase' ? (
				<p style={{ marginTop: 10, fontSize: 15 }}>
					Ny runde: <strong>{ch.name}</strong>,{' '}
					{plural(ch.weeks, 'uke', 'uker')},{' '}
					<span className="num">{Math.round(ch.factor * 100)} %</span> av
					mengden nå.
				</p>
			) : null}
			<svg
				viewBox={`0 0 ${W} ${H}`}
				style={{
					width: '100%',
					maxWidth: 420,
					display: 'block',
					margin: '0 auto',
				}}
				role="img"
				aria-label="Din sti og forslaget ved siden av"
			>
				<path
					d={curve(xCur)}
					fill="none"
					stroke="var(--ink)"
					strokeWidth="3"
					strokeLinecap="round"
				/>
				<mask id="sti-grow">
					<path
						ref={altRef}
						d={curve(xAlt)}
						fill="none"
						stroke="#fff"
						strokeWidth="10"
						pathLength={1}
						strokeDasharray="1 1"
						strokeDashoffset={0}
					/>
				</mask>
				<path
					d={curve(xAlt)}
					fill="none"
					stroke="var(--alt)"
					strokeWidth="3"
					strokeDasharray="6 6"
					strokeLinecap="round"
					mask="url(#sti-grow)"
				/>
				{days.map((d, i) => (
					<text
						key={d.date}
						x={W / 2}
						y={yOf(i) + 4}
						textAnchor="middle"
						fontSize="11"
						fill="var(--ink-soft)"
					>
						{wdShort(d.weekday)} {Number(d.date.slice(8))}.
					</text>
				))}
				{[
					{
						list: days as { date: string; items: Item[] }[],
						x: xCur,
						color: 'var(--ink)',
					},
					{ list: alt, x: xAlt, color: 'var(--alt)' },
				].map(({ list, x, color }) =>
					list.map((d, i) =>
						d.items.map((it, k) => {
							const s = 24 * (it.scale ?? 1)
							const cx =
								x +
								Math.sin(yOf(i) / 60) * 14 +
								(k - (d.items.length - 1) / 2) * 28
							return (
								<g
									key={`${x}${d.date}${it.id}${k}`}
									transform={`translate(${cx - s / 2} ${yOf(i) - s / 2})`}
								>
									<rect
										width={s}
										height={s * 0.8}
										rx="3"
										fill={it.done ? color : 'var(--slab)'}
										stroke={it.changed ? 'var(--alt)' : color}
										strokeWidth={it.changed ? 2.5 : 1.5}
									/>
									<text
										x={s / 2}
										y={s * 0.55}
										textAnchor="middle"
										fontSize="9"
										fontWeight="700"
										fill={it.done ? 'var(--sky)' : color}
									>
										{sportLetter(it.sport)}
									</text>
								</g>
							)
						}),
					),
				)}
			</svg>
			<p className="soft" style={{ fontSize: 13, textAlign: 'center' }}>
				Uka fra {fmtDay(week.weekKey)}. Blå kant = det som endres.
			</p>
		</section>
	)
}

function Answer({ proposal }: { proposal: ProposalItem }) {
	const navigate = useNavigate()
	const answer = useCapability<AnswerProposalInput, AnswerProposalOutput>(
		'answer_proposal',
	)
	const round = useCapability<AcceptRoundInput, AnswerProposalOutput>(
		'accept_round',
	)
	const undoChange = useCapability<UndoChangeInput, UndoOutput>('undo_change')
	const [scope, setScope] = useState<'this-week' | 'from-now-on'>('this-week')
	const [factor, setFactor] = useState(proposal.block?.factor ?? 1)
	const [err, setErr] = useState<string | null>(null)
	const pending = answer.pending || round.pending || undoChange.pending

	if (proposal.state !== 'waiting') {
		return (
			<div style={{ marginTop: 20, display: 'grid', gap: 10 }}>
				<p className="sti-fog">{proposal.stateLabel ?? 'Allerede besvart.'}</p>
				{proposal.state === 'accepted' ||
				proposal.state === 'applied-silently' ? (
					<button
						type="button"
						className="sti-btn quiet"
						disabled={pending}
						onClick={async () => {
							const r = await undoChange.call({ proposalId: proposal.id })
							if (!r.ok) return setErr(r.message)
							setMerke({
								text: 'Endringen er tatt tilbake.',
								token: null,
								noUndo: null,
								kind: 'session',
								sessionIds: [],
							})
							void navigate(BASE)
						}}
					>
						Angre endringen
					</button>
				) : null}
				<ErrorLine message={err} />
			</div>
		)
	}

	async function yes() {
		setErr(null)
		const r = proposal.block
			? await round.call({ proposalId: proposal.id, factor })
			: await answer.call({
					proposalId: proposal.id,
					answer: 'yes',
					...(proposal.asksScope ? { scope } : {}),
				})
		if (!r.ok) return setErr(r.message)
		markChange(
			r.value.applied
				? 'Du tok snarveien.'
				: 'Sagt ja; det var ingenting igjen å endre.',
			r.value,
			r.value.changed.map((c) => c.id),
		)
		void navigate(BASE)
	}
	async function no() {
		setErr(null)
		const r = await answer.call({ proposalId: proposal.id, answer: 'no' })
		if (!r.ok) return setErr(r.message)
		setMerke({
			text: 'Du beholdt din sti.',
			token: null,
			noUndo: null,
			kind: 'session',
			sessionIds: [],
		})
		void navigate(BASE)
	}

	return (
		<div style={{ marginTop: 20, display: 'grid', gap: 14 }}>
			{proposal.asksScope ? (
				<div
					role="radiogroup"
					aria-label="Hvor lenge"
					style={{ display: 'flex', gap: 8 }}
				>
					<button
						type="button"
						role="radio"
						aria-checked={scope === 'this-week'}
						className="sti-chip"
						onClick={() => setScope('this-week')}
					>
						Bare denne uka
					</button>
					<button
						type="button"
						role="radio"
						aria-checked={scope === 'from-now-on'}
						className="sti-chip"
						onClick={() => setScope('from-now-on')}
					>
						Fra nå av
					</button>
				</div>
			) : null}
			{proposal.block ? (
				<label style={{ display: 'grid', gap: 4 }}>
					<span style={{ display: 'flex', justifyContent: 'space-between' }}>
						<span style={{ fontWeight: 600 }}>Hvor bratt neste runde</span>
						<span className="num">{Math.round(factor * 100)} %</span>
					</span>
					<input
						type="range"
						min={proposal.block.min}
						max={proposal.block.max}
						step={proposal.block.step}
						value={factor}
						onChange={(e) => setFactor(Number(e.target.value))}
						style={{ width: '100%', accentColor: 'var(--alt)', height: 44 }}
					/>
					<span className="soft" style={{ fontSize: 13 }}>
						100 % holder mengden. Mer er brattere.
						{proposal.block.peak
							? ` Toppuka blir rundt ${Math.round(proposal.block.peak.value * (factor / proposal.block.factor))} ${proposal.block.peak.unit === 'hours' ? 't' : proposal.block.peak.unit}.`
							: ''}
					</span>
				</label>
			) : null}
			<ErrorLine message={err} />
			<div style={{ display: 'flex', gap: 10 }}>
				<button
					type="button"
					className="sti-btn quiet"
					style={{ flex: 1 }}
					onClick={no}
					disabled={pending}
				>
					Behold min
				</button>
				<button
					type="button"
					className="sti-btn alt"
					style={{ flex: 1 }}
					onClick={yes}
					disabled={pending}
				>
					{pending ? <Spinner /> : null}
					Ta den
				</button>
			</div>
		</div>
	)
}

function AcceptAll({ count }: { count: number }) {
	const navigate = useNavigate()
	const all = useCapability<Record<string, never>, AcceptAllProposalsOutput>(
		'accept_all_proposals',
	)
	const [err, setErr] = useState<string | null>(null)
	return (
		<>
			<button
				type="button"
				className="sti-btn quiet wide"
				style={{ marginTop: 12 }}
				disabled={all.pending}
				onClick={async () => {
					const r = await all.call({})
					if (!r.ok) return setErr(r.message)
					markChange(
						`Ja til ${plural(r.value.accepted.length, 'veiskilt', 'veiskilt')}.${r.value.failed.length ? ` ${r.value.failed.map((f) => f.because).join(' ')}` : ''}`,
						r.value,
						r.value.changed.map((c) => c.id),
					)
					void navigate(BASE)
				}}
			>
				Ja til alle {count}
			</button>
			<ErrorLine message={err} />
		</>
	)
}

function Changes({
	data,
	missing,
}: {
	data: NonNullable<Route.ComponentProps['loaderData']['proposals']>
	missing: boolean
}) {
	const undoChange = useCapability<UndoChangeInput, UndoOutput>('undo_change')
	const undoAll = useCapability<UndoAllChangesInput, UndoAllChangesOutput>(
		'undo_all_changes',
	)
	const refresh = useCapability<Record<string, never>, RefreshAdaptationOutput>(
		'refresh_adaptation',
	)
	const [err, setErr] = useState<string | null>(null)
	const [msg, setMsg] = useState<string | null>(null)
	const cm = data.changesMade
	const waiting = data.proposals.filter((p) => p.state === 'waiting')
	return (
		<Sheet
			kicker="Veiskilt"
			title={
				cm ? cm.heading : missing ? 'Veiskiltet er borte' : 'Ingen endringer'
			}
		>
			{missing ? (
				<p className="soft">Det kan være besvart allerede, eller for sent.</p>
			) : null}
			{data.summary ? (
				<p style={{ fontSize: 16, lineHeight: 1.5, marginTop: 6 }}>
					{data.summary}
				</p>
			) : null}
			{data.easedWeek ? (
				<div className="sti-fog" style={{ marginTop: 12 }}>
					Uka fra {fmtDay(data.easedWeek.weekKey)} er gjort lettere:{' '}
					{data.easedWeek.sports
						.map(
							(s) =>
								`${s.sport === 'run' ? 'løp' : s.sport === 'bike' ? 'sykkel' : s.sport} ${s.before.value ?? '?'} → ${s.after.value ?? '?'} ${s.unit === 'hours' ? 't' : s.unit}`,
						)
						.join(', ')}
					.
				</div>
			) : null}
			{cm ? (
				<div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
					{cm.changes.map((c) => (
						<div
							key={c.proposalId}
							className="sti-card"
							style={{ display: 'flex', gap: 10, alignItems: 'center' }}
						>
							<Stone
								sport="run"
								size={22}
								fill={c.kind === 'changed' ? 'full' : 'empty'}
							/>
							<div style={{ flex: 1, minWidth: 0 }}>
								<p style={{ fontSize: 15, overflowWrap: 'anywhere' }}>
									{c.text}
								</p>
								{c.about ? (
									<p className="soft" style={{ fontSize: 13 }}>
										{c.about}
									</p>
								) : null}
							</div>
							{c.undo === 'offered' ? (
								<button
									type="button"
									className="sti-btn quiet small"
									disabled={undoChange.pending}
									onClick={async () => {
										const r = await undoChange.call({
											proposalId: c.proposalId,
										})
										setErr(r.ok ? null : r.message)
									}}
								>
									Angre
								</button>
							) : c.undo === 'undone' ? (
								<span className="soft" style={{ fontSize: 13 }}>
									Angret
								</span>
							) : null}
						</div>
					))}
					{cm.undoable > 1 ? (
						<button
							type="button"
							className="sti-btn quiet"
							disabled={undoAll.pending}
							onClick={async () => {
								const r = await undoAll.call({
									closedWeek: data.closedWeek ?? undefined,
								})
								if (!r.ok) return setErr(r.message)
								setMsg(
									`${plural(r.value.count, 'endring', 'endringer')} tatt tilbake.${r.value.kept.length ? ` Står: ${r.value.kept.join(' ')}` : ''}`,
								)
							}}
						>
							Angre alle
						</button>
					) : null}
				</div>
			) : (
				<p className="soft" style={{ marginTop: 10 }}>
					{data.adjustMode === 'autopilot'
						? 'Planen har ikke endret noe av seg selv denne uka.'
						: 'Planen spør før den endrer noe.'}
				</p>
			)}
			{waiting.length ? (
				<div style={{ display: 'grid', gap: 8, marginTop: 20 }}>
					{waiting.map((w) => (
						<Link
							key={w.id}
							to={`${BASE}/veiskilt/${w.id}`}
							className="sti-chip"
							style={{
								borderRadius: 14,
								minHeight: 52,
								textDecoration: 'none',
							}}
						>
							{w.headline}
						</Link>
					))}
				</div>
			) : null}
			<button
				type="button"
				className="sti-link"
				style={{ marginTop: 20 }}
				disabled={refresh.pending}
				onClick={async () => {
					const r = await refresh.call({})
					if (!r.ok) return setErr(r.message)
					setMsg(
						r.value.waiting
							? `${plural(r.value.waiting, 'veiskilt venter', 'veiskilt venter')}.`
							: 'Ingen nye veiskilt. Stien står.',
					)
				}}
			>
				{refresh.pending ? <Spinner /> : null} Se etter nye veiskilt nå
			</button>
			{msg ? <p role="status">{msg}</p> : null}
			<ErrorLine message={err} />
		</Sheet>
	)
}
