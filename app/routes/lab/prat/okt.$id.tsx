import { useState } from 'react'
import { useLoaderData, useNavigate, useRevalidator } from 'react-router'
import { type SessionOutput } from '#app/lab/engine/reads.types.ts'
import {
	type DeleteSessionOutput,
	type ReleaseSessionOutput,
	type SetCountsTowardPlanOutput,
} from '#app/lab/engine/sessions.types.ts'
import { type Route } from './+types/okt.$id.ts'
import { useCall } from './__convo.tsx'
import { run } from './__data.server.ts'
import { refOf, useFlows, type FlowKind } from './__flows.tsx'
import { cap, dur, km, longDate, mmss, num0 } from './__fmt.ts'
import { FocusCard } from './__overlay.tsx'
import { CompareMini } from './__thread.tsx'
import {
	Chip,
	Chips,
	HoldButton,
	N,
	RpePicker,
	SportBadge,
	Strip,
	TargetText,
	Unknown,
	VerdictTag,
} from './__ui.tsx'

export async function loader({ request, params }: Route.LoaderArgs) {
	const r = await run<SessionOutput>(request, 'session', {
		sessionId: params.id,
	})
	return r.ok
		? { session: r.value, error: null }
		: { session: null, error: r.message }
}

export default function SessionFocus() {
	const { session: s, error } = useLoaderData<typeof loader>()
	if (!s)
		return (
			<FocusCard title="Økta">
				<p>{error ?? 'Fant ikke økta. Den kan være slettet.'}</p>
			</FocusCard>
		)
	return (
		<FocusCard title={s.title}>
			<SessionDetail s={s} />
		</FocusCard>
	)
}

function SessionDetail({ s }: { s: SessionOutput }) {
	const flows = useFlows()
	const navigate = useNavigate()
	const call = useCall()
	const revalidator = useRevalidator()
	const [msg, setMsg] = useState<string | null>(null)
	const [rpe, setRpe] = useState<number | null>(s.feeling.rpe)
	const [note, setNote] = useState(s.feeling.note ?? '')
	const [noteSaved, setNoteSaved] = useState(false)
	const [confirmDelete, setConfirmDelete] = useState(false)
	const ref = refOf(s)

	const act = (kind: FlowKind) => {
		flows.start(kind, ref)
		void navigate('/lab/prat', { preventScrollReset: true })
	}
	const can = s.can
	const rec = s.recording
	const c = s.comparison

	return (
		<>
			<div className="prat-card-row">
				<SportBadge sport={s.sport} />
				<div
					style={{
						display: 'flex',
						flexDirection: 'column',
						minWidth: 0,
						flex: 1,
					}}
				>
					<span className="prat-card-title" style={{ fontSize: 20 }}>
						{s.title}
					</span>
					<span className="prat-card-sub">
						{cap(longDate(s.date))}
						{s.time ? ` kl. ${s.time}` : ''} · {s.sportName}
						{s.purpose ? ` · ${s.purpose}` : ''}
					</span>
				</div>
			</div>
			<div className="prat-chips">
				{s.status === 'done' ? (
					<span className="prat-tag hit">Gjort</span>
				) : null}
				{s.status === 'missed' ? (
					<span className="prat-tag">Ikke gjort</span>
				) : null}
				{s.status === 'recording-only' ? (
					<span className="prat-tag">Ekstra, fra klokka</span>
				) : null}
				{s.whose === 'athlete' ? (
					<span className="prat-tag mine">
						Din egen: planen endrer den ikke uten å spørre
					</span>
				) : null}
				{s.outsideWeeklyCount ? (
					<span className="prat-tag">Teller ikke i ukas mengde</span>
				) : null}
			</div>
			{s.summary ? <p style={{ margin: 0 }}>{s.summary}</p> : null}
			{s.description ? (
				<p className="prat-note" style={{ margin: 0 }}>
					{s.description}
				</p>
			) : null}
			{s.adjustedBecause ? (
				<p className="prat-warn" style={{ margin: 0 }}>
					{s.adjustedBecause}
				</p>
			) : null}

			{s.structure ? (
				<div className="prat-card">
					<span className="prat-card-label">Slik er den bygd</span>
					<div className="prat-card-row" style={{ gap: 16, fontSize: 15 }}>
						<N n={s.planned.durationS} f={dur} short="tid ukjent" />
						{s.planned.distanceM.value ? (
							<N n={s.planned.distanceM} f={km} />
						) : null}
						{s.planned.load.value !== null ? (
							<span className="prat-note">
								belastning {num0(s.planned.load.value)}
							</span>
						) : null}
					</div>
					<Strip structure={s.structure} />
					<ol
						style={{
							margin: 0,
							padding: 0,
							listStyle: 'none',
							display: 'flex',
							flexDirection: 'column',
							gap: 12,
						}}
					>
						{s.structure.map((b, i) => (
							<li
								key={i}
								style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
							>
								<b>{b.name ?? `Del ${i + 1}`}</b>
								<span style={{ fontSize: 15 }}>{b.text}</span>
								{b.steps
									.filter((st) => st.target)
									.slice(0, 3)
									.map((st, j) => (
										<span key={j} style={{ fontSize: 15 }}>
											<TargetText t={st.target!} />
										</span>
									))}
								{b.steps
									.filter((st) => st.note)
									.map((st, j) => (
										<span key={`n${j}`} className="prat-note">
											{st.note}
										</span>
									))}
							</li>
						))}
					</ol>
				</div>
			) : null}

			{s.strength ? (
				<div className="prat-card">
					<span className="prat-card-label">
						Styrke · {s.strength.loggedSets} av {s.strength.prescribedSets} sett
						ført
					</span>
					{s.strength.exercises.map((e) => (
						<div
							key={e.stepId}
							style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
						>
							<b>{e.name}</b>
							<span className="prat-note">
								{e.sets
									.filter((x) => x.role !== 'warmup')
									.map((x) =>
										x.logged
											? `${x.logged.reps ?? '–'}×${x.logged.loadText ?? (x.logged.kg !== null ? `${x.logged.kg} kg` : '')}`
											: `${x.prescribed?.reps ?? '–'}×${x.prescribed?.loadText ?? (x.prescribed?.kg.value !== null && x.prescribed?.kg.value !== undefined ? `${x.prescribed.kg.value} kg` : '?')}`,
									)
									.join(' · ')}
							</span>
						</div>
					))}
					{can.logStrength.allowed ? (
						<Chips>
							<Chip
								primary
								onClick={() => void navigate(`/lab/prat/styrke/${s.id}`)}
							>
								{s.strength.loggedSets ? 'Fortsett å føre' : 'Start styrke'}
							</Chip>
						</Chips>
					) : can.logStrength.why ? (
						<span className="prat-note">{can.logStrength.why}</span>
					) : null}
				</div>
			) : null}

			{s.status === 'done' || s.status === 'recording-only' || rec ? (
				<div className="prat-card">
					<div
						className="prat-card-row"
						style={{ justifyContent: 'space-between' }}
					>
						<span className="prat-card-label">Planlagt mot gjort</span>
						<VerdictTag v={c.verdict} />
					</div>
					<p style={{ margin: 0 }}>
						{c.verdict.sentence
							? `${c.verdict.sentence}.`
							: (c.verdict.why ?? '')}
					</p>
					<CompareMini s={s} />
					{c.structure.label || c.structure.why ? (
						<p className="prat-note" style={{ margin: 0 }}>
							{c.structure.label
								? `Dragene: ${c.structure.label.toLowerCase()}. `
								: ''}
							{c.structure.why ?? ''}
						</p>
					) : null}
					{rec ? (
						<dl className="prat-kv" style={{ margin: 0 }}>
							<dt>Snittpuls</dt>
							<dd>
								<N n={rec.avgHeartRate} f={(v) => `${num0(v)} slag/min`} />
							</dd>
							<dt>Makspuls</dt>
							<dd>
								<N n={rec.maxHeartRate} f={(v) => `${num0(v)} slag/min`} />
							</dd>
							{s.sport === 'run' ? (
								<>
									<dt>Snittfart</dt>
									<dd>
										<N n={rec.avgPace} f={(v) => `${mmss(v)} /km`} />
									</dd>
								</>
							) : null}
							{s.sport === 'bike' ? (
								<>
									<dt>Snittwatt</dt>
									<dd>
										<N n={rec.avgPower} f={(v) => `${num0(v)} W`} />
									</dd>
								</>
							) : null}
							<dt>Stigning</dt>
							<dd>
								<N n={rec.climbM} f={(v) => `${num0(v)} m`} />
							</dd>
							<dt>Fra</dt>
							<dd>{rec.from}</dd>
						</dl>
					) : null}
					{c.sinceLast ? (
						<p className="prat-note" style={{ margin: 0 }}>
							Sist du gjorde en slik ({longDate(c.sinceLast.date)}):{' '}
							{c.sinceLast.durationS.value !== null
								? dur(c.sinceLast.durationS.value)
								: 'tid ukjent'}
							{c.sinceLast.load.value !== null
								? `, belastning ${num0(c.sinceLast.load.value)}`
								: ''}
							.
						</p>
					) : null}
				</div>
			) : null}

			{can.rateFeeling.allowed ? (
				<div className="prat-card">
					<span className="prat-card-label">Hvor tung var den?</span>
					<RpePicker
						value={rpe}
						onPick={(n) => {
							setRpe(n)
							void call('rate_session', { sessionId: s.id, rpe: n }).then(
								(r) => {
									if (!r.ok) setMsg(r.message)
								},
							)
						}}
					/>
					<form
						className="prat-field"
						onSubmit={(e) => {
							e.preventDefault()
							void call('note_session', { sessionId: s.id, note }).then((r) => {
								if (!r.ok) setMsg(r.message)
								else setNoteSaved(true)
							})
						}}
					>
						<span>Notat</span>
						<textarea
							className="prat-input"
							value={note}
							maxLength={2000}
							onChange={(e) => {
								setNote(e.target.value)
								setNoteSaved(false)
							}}
							placeholder="Noe å notere?"
						/>
						<Chips>
							<button type="submit" className="prat-chip quiet">
								<span>{noteSaved ? 'Lagret' : 'Lagre notat'}</span>
							</button>
						</Chips>
					</form>
				</div>
			) : can.rateFeeling.why ? (
				<p className="prat-note" style={{ margin: 0 }}>
					{can.rateFeeling.why}
				</p>
			) : null}

			{msg ? (
				<p className="prat-err" style={{ margin: 0 }}>
					{msg}
				</p>
			) : null}

			<div className="prat-card">
				<span className="prat-card-label">Når livet skjer</span>
				<Chips>
					{can.markDone.allowed ? (
						<Chip primary onClick={() => act('gjort')}>
							Gjort
						</Chip>
					) : null}
					{can.move.allowed ? (
						<Chip onClick={() => act('flytt')}>Flytt</Chip>
					) : null}
					{can.swap.allowed ? (
						<Chip onClick={() => act('bytt')}>Bytt</Chip>
					) : null}
					{can.shorten.allowed ? (
						<Chip onClick={() => act('kortere')}>Kortere</Chip>
					) : null}
					{can.makeEasier.allowed ? (
						<Chip onClick={() => act('lettere')}>Lettere</Chip>
					) : null}
					{can.skip.allowed ? (
						<Chip quiet onClick={() => act('hopp')}>
							Hopp over
						</Chip>
					) : null}
				</Chips>
				<span className="prat-note">
					{[
						can.markDone,
						can.move,
						can.swap,
						can.shorten,
						can.makeEasier,
						can.skip,
					]
						.filter((x) => !x.allowed && x.why)
						.map((x) => x.why)
						.filter((x, i, a) => a.indexOf(x) === i)
						.join(' ')}
				</span>
				<div className="prat-toggle">
					<span style={{ fontSize: 15 }}>Teller i ukas mengde</span>
					<button
						type="button"
						role="switch"
						className="prat-switch"
						aria-checked={!s.outsideWeeklyCount}
						aria-label="Teller i ukas mengde"
						onClick={() =>
							void call<SetCountsTowardPlanOutput>('set_counts_toward_plan', {
								sessionId: s.id,
								countsTowardPlan: s.outsideWeeklyCount,
							}).then((r) => {
								if (!r.ok) setMsg(r.message)
							})
						}
					/>
				</div>
				{s.whose === 'athlete' ? (
					<Chips>
						<Chip
							quiet
							onClick={() =>
								void call<ReleaseSessionOutput>('release_session', {
									sessionId: s.id,
								}).then((r) =>
									setMsg(r.ok ? 'Planen kan nå justere den selv.' : r.message),
								)
							}
						>
							Gi den til planen
						</Chip>
						{!s.hasRecording ? (
							<Chip quiet danger onClick={() => setConfirmDelete(true)}>
								Slett økta
							</Chip>
						) : null}
					</Chips>
				) : null}
				{confirmDelete ? (
					<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
						<span>Slette «{s.title}»? Det kan ikke angres.</span>
						<HoldButton
							doneLabel="Sletter …"
							onConfirm={() =>
								void call<DeleteSessionOutput>('delete_session', {
									sessionId: s.id,
								}).then((r) => {
									if (!r.ok) return setMsg(r.message)
									void revalidator.revalidate()
									void navigate('/lab/prat', { preventScrollReset: true })
								})
							}
						>
							Hold for å slette
						</HoldButton>
					</div>
				) : null}
			</div>
			{s.status === 'planned' &&
			s.planned.durationS.value === null &&
			s.sport !== 'strength' ? (
				<Unknown why="Lengden er ukjent for denne økta." />
			) : null}
		</>
	)
}
