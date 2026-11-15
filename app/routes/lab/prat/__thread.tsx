import { useState } from 'react'
import { useNavigate } from 'react-router'
import {
	type ProposalItem,
	type RecordingItem,
	type SessionCard,
	type SessionOutput,
} from '#app/lab/engine/reads.types.ts'
import {
	type AcceptAllProposalsOutput,
	type AnswerProposalOutput,
	type LinkRecordingOutput,
	type SkipSessionOutput,
	type UndoAllChangesOutput,
	type UndoOutput,
	type UnlinkRecordingOutput,
} from '#app/lab/engine/sessions.types.ts'
import { useAsk, useConvo } from './__convo.tsx'
import { BeforeAfter, LiveChange, refOf, useFlows } from './__flows.tsx'
import {
	WEEKDAY_LONG,
	addDays,
	cap,
	daysBetween,
	dur,
	km,
	longDate,
	lower,
	mmss,
	num0,
	relDay,
	weekdayOf,
	greeting,
} from './__fmt.ts'
import { setOrigin } from './__overlay.tsx'
import { VolumeCard } from './__progress.tsx'
import { type ThreadData } from './__types.ts'
import {
	Bubble,
	ChangeCard,
	Chip,
	Chips,
	DayDivider,
	Mine,
	N,
	SportBadge,
	Strip,
	TargetText,
	Turn,
	VerdictTag,
	keyTarget,
} from './__ui.tsx'

// ── the session card, in the thread ─────────────────────────────────────────

export function SessionCardView({
	s,
	detail,
	today,
}: {
	s: SessionCard
	detail?: SessionOutput | null
	today: string
}) {
	const navigate = useNavigate()
	const target = keyTarget(detail?.structure ?? null)
	const planned = s.planned
	const href =
		s.sport === 'strength' && s.status === 'planned'
			? `/lab/prat/styrke/${s.id}`
			: `/lab/prat/okt/${s.id}`
	return (
		<button
			type="button"
			className="prat-card"
			onClick={(e) => {
				setOrigin(e.currentTarget)
				void navigate(href, { preventScrollReset: true })
			}}
			aria-label={`Åpne ${s.title}`}
		>
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
					<span className="prat-card-title">{s.title}</span>
					<span className="prat-card-sub">
						{[
							s.purpose,
							s.sportName,
							s.time ? `kl. ${s.time}` : null,
							s.date !== today ? relDay(s.date, today) : null,
						]
							.filter(Boolean)
							.join(' · ')}
					</span>
				</div>
				{s.status === 'done' ? (
					<span className="prat-tag hit">Gjort</span>
				) : s.status === 'missed' ? (
					<span className="prat-tag">Ikke gjort</span>
				) : s.whose === 'athlete' ? (
					<span className="prat-tag mine">Din</span>
				) : null}
			</div>
			<div
				className="prat-card-row"
				style={{ gap: 14, flexWrap: 'wrap', fontSize: 15 }}
			>
				{s.sport === 'strength' ? (
					<span>
						{detail?.strength ? (
							<>
								<b className="num">{detail.strength.prescribedSets}</b> sett ·{' '}
								{detail.strength.exercises.length} øvelser
							</>
						) : (
							'Styrke'
						)}
					</span>
				) : (
					<>
						<N n={planned.durationS} f={dur} short="tid ukjent" />
						{planned.distanceM.value ? (
							<N n={planned.distanceM} f={km} />
						) : null}
					</>
				)}
			</div>
			<Strip structure={detail?.structure ?? null} />
			{target ? <TargetText t={target} /> : null}
			{s.adjustedBecause ? (
				<span className="prat-note">{s.adjustedBecause}</span>
			) : null}
		</button>
	)
}

/** Planned against actual, as two bars per measure. */
export function CompareMini({ s }: { s: SessionCard }) {
	const rows: {
		label: string
		p: number | null
		a: number | null
		f: (v: number) => string
	}[] = [
		{
			label: 'Tid',
			p: s.planned.durationS.value,
			a: s.actual.durationS.value,
			f: dur,
		},
		{
			label: 'Distanse',
			p: s.planned.distanceM.value,
			a: s.actual.distanceM.value,
			f: km,
		},
		{
			label: 'Belastning',
			p: s.planned.load.value,
			a: s.actual.load.value,
			f: num0,
		},
	].filter((r) => r.p !== null || r.a !== null)
	if (!rows.length) return null
	return (
		<div className="prat-cmp">
			{rows.map((r) => {
				const max = Math.max(r.p ?? 0, r.a ?? 0, 0.0001)
				return (
					<div key={r.label} style={{ display: 'contents' }}>
						<span className="prat-note">{r.label}</span>
						<span className="prat-cmp-bar" aria-hidden="true">
							{r.p !== null ? (
								<i
									className="plan"
									style={{ width: `${(r.p / max) * 100}%` }}
								/>
							) : null}
							{r.a !== null ? (
								<i className="act" style={{ width: `${(r.a / max) * 100}%` }} />
							) : null}
						</span>
						<span
							className="num"
							style={{ fontSize: 14, whiteSpace: 'nowrap' }}
						>
							{r.a !== null ? (
								<b>{r.f(r.a)}</b>
							) : (
								<span className="prat-unknown">ukjent</span>
							)}
							<span className="prat-note">
								{' '}
								/ {r.p !== null ? r.f(r.p) : 'uten plan'}
							</span>
						</span>
					</div>
				)
			})}
		</div>
	)
}

function compareSentence(s: SessionCard) {
	const p = s.planned.durationS.value
	const a = s.actual.durationS.value
	const parts: React.ReactNode[] = []
	if (p !== null && a !== null)
		parts.push(
			<span key="d">
				Planlagt {dur(p)}, du gjorde <b className="num">{dur(a)}</b>.{' '}
			</span>,
		)
	else if (a !== null)
		parts.push(
			<span key="d">
				Du gjorde <b className="num">{dur(a)}</b>.{' '}
			</span>,
		)
	if (s.verdict.sentence) parts.push(<span key="v">{s.verdict.sentence}.</span>)
	else if (s.verdict.why) parts.push(<span key="w">{s.verdict.why}</span>)
	return parts
}

function OpenButton({
	s,
	label = 'Vis økta',
}: {
	s: SessionCard
	label?: string
}) {
	const navigate = useNavigate()
	return (
		<button
			type="button"
			className="prat-chip quiet"
			onClick={(e) => {
				setOrigin(e.currentTarget)
				void navigate(`/lab/prat/okt/${s.id}`, { preventScrollReset: true })
			}}
		>
			<span>{label}</span>
		</button>
	)
}

// ── what happened on past days ──────────────────────────────────────────────

function PastSession({ s, data }: { s: SessionCard; data: ThreadData }) {
	const flows = useFlows()
	const today = data.athlete.today
	const rec = data.recordings.find((r) => r.sessionId === s.id) ?? null
	if (s.status === 'done')
		return (
			<Turn who="partner" id={s.id}>
				<Bubble>
					{rec && rec.linkedToPlan ? <RecordingLead rec={rec} s={s} /> : null}
					<b>{s.title}</b>
					{s.markedDone && !s.hasRecording ? ' (du sa gjort)' : ''}.{' '}
					{compareSentence(s)}
				</Bubble>
				<div className="prat-card" style={{ gap: 8 }}>
					<div
						className="prat-card-row"
						style={{ justifyContent: 'space-between' }}
					>
						<span className="prat-card-label">Planlagt mot gjort</span>
						<VerdictTag v={s.verdict} />
					</div>
					<CompareMini s={s} />
				</div>
				<Chips>
					<OpenButton s={s} />
					{s.rpe === null &&
					daysBetween(s.date, today) <= 6 &&
					s.sport !== 'other' ? (
						<Chip
							onClick={() =>
								flows.start('kjent', refOf(s), 'Hvor tung var den?')
							}
						>
							Si hvordan den kjentes
						</Chip>
					) : s.rpe !== null ? (
						<span className="prat-meta" style={{ alignSelf: 'center' }}>
							Kjentes som <b className="num">{s.rpe}</b> av 10
						</span>
					) : null}
					{rec && rec.linkedToPlan ? <UnlinkChip rec={rec} /> : null}
				</Chips>
			</Turn>
		)
	if (s.status === 'recording-only')
		return <LooseRecording s={s} rec={rec} data={data} />
	if (s.status === 'missed')
		return (
			<Turn who="partner" id={s.id}>
				<Bubble>
					<b>{s.title}</b> ble ikke noe av. Det er greit; planen regner med det.
				</Bubble>
			</Turn>
		)
	// A past day still planned: nobody said.
	const canMark = daysBetween(s.date, today) <= 6
	return (
		<Turn who="partner" id={s.id}>
			<Bubble>
				Ble <b>{lower(s.title)}</b> {relDay(s.date, today)} gjort? Jeg har ikke
				fått noe fra klokka.
			</Bubble>
			{canMark ? <PastAnswer s={s} /> : null}
		</Turn>
	)
}

function RecordingLead({ rec, s }: { rec: RecordingItem; s: SessionCard }) {
	const t = new Date(rec.startedAt)
	const hhmm = Number.isNaN(t.getTime())
		? null
		: t.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })
	return (
		<>
			Fikk {lower(rec.sportName)} fra klokka{hhmm ? ` kl. ${hhmm}` : ''} og
			koblet den til{' '}
			{s.title.toLowerCase() === rec.sportName.toLowerCase()
				? 'planen'
				: 'økta'}
			:{' '}
		</>
	)
}

function UnlinkChip({ rec }: { rec: RecordingItem }) {
	const ask = useAsk()
	const { push, addChange } = useConvo()
	const [done, setDone] = useState(false)
	if (done) return null
	return (
		<Chip
			quiet
			onClick={() => {
				setDone(true)
				push(<Mine fly>Det var ikke den</Mine>)
				void ask<UnlinkRecordingOutput>('unlink_recording', {
					recordingId: rec.id,
				}).then((x) => {
					if (!x.ok) {
						push(
							<Turn who="partner" enter>
								<Bubble>{x.message}</Bubble>
							</Turn>,
						)
						return
					}
					const id = addChange({
						text: `${rec.sportName} koblet fra`,
						token: x.value.undo,
						noUndo: x.value.noUndoBecause,
					})
					push(
						<Turn who="partner" enter>
							<Bubble>
								Koblet fra. Den står nå som en egen økt, og den planlagte er
								ikke gjort lenger.
							</Bubble>
							<LiveChange id={id} />
						</Turn>,
					)
				})
			}}
		>
			Det var ikke den
		</Chip>
	)
}

function LooseRecording({
	s,
	rec,
	data,
}: {
	s: SessionCard
	rec: RecordingItem | null
	data: ThreadData
}) {
	const ask = useAsk()
	const { push, addChange } = useConvo()
	const [answered, setAnswered] = useState(false)
	const options = rec ? (data.linkOptions[rec.id]?.options ?? []) : []
	const today = data.athlete.today
	const d = s.actual.durationS.value
	const candidate = options[0]
	return (
		<Turn who="partner" id={s.id}>
			<Bubble>
				Fikk {lower(s.sportName)}
				{d !== null ? (
					<>
						{' '}
						på <b className="num">{dur(d)}</b>
					</>
				) : null}{' '}
				{relDay(s.date, today)} som ikke sto i planen.
				{candidate && !answered
					? ` Du hadde ${lower(candidate.title ?? 'en økt')} samme dag. Var den i stedet for?`
					: ''}
			</Bubble>
			{candidate && rec && !answered ? (
				<Chips>
					{options.slice(0, 3).map((o) => (
						<Chip
							key={o.id}
							onClick={() => {
								setAnswered(true)
								push(
									<Mine fly>Ja, i stedet for {lower(o.title ?? 'den')}</Mine>,
								)
								void ask<LinkRecordingOutput>('link_recording', {
									recordingId: rec.id,
									sessionId: o.id,
								}).then((x) => {
									if (!x.ok) {
										push(
											<Turn who="partner" enter>
												<Bubble>{x.message}</Bubble>
											</Turn>,
										)
										return
									}
									const id = addChange({
										text: `Koblet til ${o.title ?? 'økta'}`,
										token: x.value.undo,
										noUndo: x.value.noUndoBecause,
									})
									push(
										<Turn who="partner" enter>
											<Bubble>
												Koblet. Den planlagte økta er gjort med tallene fra
												klokka.
											</Bubble>
											<LiveChange id={id} />
										</Turn>,
									)
								})
							}}
						>
							Ja{options.length > 1 ? `: ${o.title}` : ''}
						</Chip>
					))}
					<Chip
						quiet
						onClick={() => {
							setAnswered(true)
							push(<Mine fly>Nei, det var ekstra</Mine>)
							push(
								<Turn who="partner" enter>
									<Bubble>
										Da står den som ekstra, og den teller med i belastningen.
									</Bubble>
								</Turn>,
							)
						}}
					>
						Nei, det var ekstra
					</Chip>
				</Chips>
			) : (
				<Chips>
					<OpenButton s={s} />
				</Chips>
			)}
		</Turn>
	)
}

function PastAnswer({ s }: { s: SessionCard }) {
	const flows = useFlows()
	const ask = useAsk()
	const { push, addChange } = useConvo()
	const [done, setDone] = useState(false)
	if (done) return null
	return (
		<Chips>
			<Chip
				primary
				onClick={() => {
					setDone(true)
					if (s.sport === 'strength')
						flows.start('gjort', refOf(s), 'Ja, den ble gjort')
					else flows.start('gjort', refOf(s), 'Ja, gjort')
				}}
			>
				Ja, gjort
			</Chip>
			<Chip
				quiet
				onClick={() => {
					setDone(true)
					push(<Mine fly>Nei</Mine>)
					void ask<SkipSessionOutput>('skip_session', { sessionId: s.id }).then(
						(x) => {
							if (!x.ok) {
								push(
									<Turn who="partner" enter>
										<Bubble>{x.message}</Bubble>
									</Turn>,
								)
								return
							}
							const id = addChange({
								text: `${s.title}: ikke gjort`,
								token: x.value.undo,
								noUndo: x.value.noUndoBecause,
							})
							push(
								<Turn who="partner" enter>
									<Bubble>Notert. Planen tar hensyn til det.</Bubble>
									<LiveChange id={id} />
								</Turn>,
							)
						},
					)
				}}
			>
				Nei
			</Chip>
		</Chips>
	)
}

// ── proposals ───────────────────────────────────────────────────────────────

function ProposalMsg({ p, today }: { p: ProposalItem; today: string }) {
	const ask = useAsk()
	const { push, addChange } = useConvo()
	const [answered, setAnswered] = useState(false)
	const [factor, setFactor] = useState(p.block?.factor ?? 1)
	const waiting = p.state === 'waiting' && !answered

	const answer = (
		label: string,
		name: 'answer_proposal' | 'accept_round',
		input: Record<string, unknown>,
	) => {
		setAnswered(true)
		push(<Mine fly>{label}</Mine>)
		void ask<AnswerProposalOutput>(name, input).then((x) => {
			if (!x.ok) {
				push(
					<Turn who="partner" enter>
						<Bubble>{x.message}</Bubble>
					</Turn>,
				)
				return
			}
			if (x.value.status === 'declined') {
				push(
					<Turn who="partner" enter>
						<Bubble>Greit, jeg lar det være som det er.</Bubble>
					</Turn>,
				)
				return
			}
			const id = addChange({
				text: p.headline,
				token: x.value.undo,
				noUndo: x.value.noUndoBecause,
			})
			push(
				<Turn who="partner" enter>
					<Bubble>
						{x.value.applied
							? 'Gjort.'
							: 'Notert, men det var ingenting igjen å endre.'}
					</Bubble>
					<LiveChange id={id} />
				</Turn>,
			)
		})
	}

	return (
		<Turn who="partner" id={`forslag-${p.id}`}>
			<Bubble>
				<b>{p.headline}.</b> {p.reason}
				{p.addsLoad
					? ' Det gir deg mer trening, så jeg gjør det bare om du sier ja.'
					: ''}
				{p.touchesOwnSession ? ' Det gjelder en økt du har lagt selv.' : ''}
			</Bubble>
			{p.block && waiting ? (
				<div className="prat-card" style={{ maxWidth: 420 }}>
					<div
						className="prat-card-row"
						style={{ justifyContent: 'space-between' }}
					>
						<span className="prat-card-sub">Mengde i neste blokk</span>
						<b className="num">{Math.round(factor * 100)} %</b>
					</div>
					<input
						type="range"
						className="prat-range"
						min={p.block.min}
						max={p.block.max}
						step={p.block.step}
						value={factor}
						onChange={(e) => setFactor(Number(e.target.value))}
						aria-label="Mengde i neste blokk"
					/>
					<span className="prat-note">100 % er samme mengde som nå.</span>
				</div>
			) : null}
			{waiting ? (
				<Chips>
					{p.block ? (
						<Chip
							primary
							onClick={() =>
								answer(`Ja, ${Math.round(factor * 100)} %`, 'accept_round', {
									proposalId: p.id,
									factor,
								})
							}
						>
							Ja, {Math.round(factor * 100)} %
						</Chip>
					) : p.asksScope ? (
						<>
							<Chip
								primary
								onClick={() =>
									answer('Ja, bare denne uka', 'answer_proposal', {
										proposalId: p.id,
										answer: 'yes',
										scope: 'this-week',
									})
								}
							>
								Ja, bare denne uka
							</Chip>
							<Chip
								onClick={() =>
									answer('Ja, fra nå av', 'answer_proposal', {
										proposalId: p.id,
										answer: 'yes',
										scope: 'from-now-on',
									})
								}
							>
								Ja, fra nå av
							</Chip>
						</>
					) : (
						<Chip
							primary
							onClick={() =>
								answer('Ja', 'answer_proposal', {
									proposalId: p.id,
									answer: 'yes',
								})
							}
						>
							Ja
						</Chip>
					)}
					<Chip
						quiet
						onClick={() =>
							answer('Nei', 'answer_proposal', {
								proposalId: p.id,
								answer: 'no',
							})
						}
					>
						Nei
					</Chip>
				</Chips>
			) : p.stateLabel && !answered ? (
				<span className="prat-meta">{p.stateLabel}</span>
			) : null}
			{p.session && !answered && waiting ? (
				<span className="prat-meta">
					Gjelder {p.session.title ?? 'en økt'} {relDay(p.session.date, today)}
				</span>
			) : null}
		</Turn>
	)
}

function ProposalsBlock({ data }: { data: ThreadData }) {
	const ask = useAsk()
	const { push, addChange } = useConvo()
	const [allDone, setAllDone] = useState(false)
	const pr = data.proposals
	if (!pr) return null
	const today = data.athlete.today
	const list = pr.proposals.filter(
		(p) =>
			p.state === 'waiting' ||
			(p.state === 'applied-silently' && p.kind !== 'keep'),
	)
	const changes = pr.changesMade
	return (
		<>
			{pr.summary && (list.length || changes) ? (
				<Turn who="partner">
					<Bubble>
						{pr.closedWeek
							? `Uka fra ${relDay(pr.closedWeek, today)} er gjort opp. `
							: ''}
						{pr.summary}
					</Bubble>
				</Turn>
			) : null}
			{list.map((p) => (
				<ProposalMsg key={p.id} p={p} today={today} />
			))}
			{pr.waiting > 1 && !allDone ? (
				<Turn who="partner">
					<Chips>
						<Chip
							onClick={() => {
								setAllDone(true)
								push(<Mine fly>Ja til alle</Mine>)
								void ask<AcceptAllProposalsOutput>(
									'accept_all_proposals',
									{},
								).then((x) => {
									if (!x.ok) {
										push(
											<Turn who="partner" enter>
												<Bubble>{x.message}</Bubble>
											</Turn>,
										)
										return
									}
									const id = addChange({
										text: `${x.value.accepted.length} forslag godtatt`,
										token: x.value.undo,
										noUndo: x.value.noUndoBecause,
									})
									push(
										<Turn who="partner" enter>
											<Bubble>
												Gjort. {x.value.failed.map((f) => f.because).join(' ')}
											</Bubble>
											<LiveChange id={id} />
										</Turn>,
									)
								})
							}}
						>
							Ja til alle {pr.waiting}
						</Chip>
					</Chips>
				</Turn>
			) : null}
			{changes && changes.changes.length ? <AutoChanges data={data} /> : null}
			{pr.easedWeek ? (
				<Turn who="partner">
					<Bubble>
						Du gjorde uka fra {relDay(pr.easedWeek.weekKey, today)} lettere:
					</Bubble>
					<BeforeAfter
						volume={pr.easedWeek.sports.map((s) => ({
							sport: s.sport,
							unit: s.unit,
							before: s.before.value,
							after: s.after.value,
						}))}
					/>
				</Turn>
			) : null}
		</>
	)
}

function AutoChanges({ data }: { data: ThreadData }) {
	const ask = useAsk()
	const { push } = useConvo()
	const [undone, setUndone] = useState<string[]>([])
	const [all, setAll] = useState(false)
	const c0 = data.proposals!.changesMade!
	const c = { ...c0, changes: c0.changes.filter((x) => x.kind === 'changed') }
	if (!c.changes.length) return null
	return (
		<Turn who="partner">
			<Bubble>{c.heading}</Bubble>
			{c.changes.map((ch) => (
				<ChangeCard
					key={ch.proposalId}
					text={ch.text}
					detail={ch.about}
					undone={ch.undo === 'undone' || undone.includes(ch.proposalId) || all}
					onUndo={
						ch.undo === 'offered'
							? () => {
									push(<Mine fly>Angre: {ch.text}</Mine>)
									void ask<UndoOutput>('undo_change', {
										proposalId: ch.proposalId,
									}).then((x) => {
										if (x.ok) setUndone((u) => [...u, ch.proposalId])
										push(
											<Turn who="partner" enter>
												<Bubble>{x.ok ? 'Angret.' : x.message}</Bubble>
											</Turn>,
										)
									})
								}
							: undefined
					}
				/>
			))}
			{c.undoable > 1 && !all ? (
				<Chips>
					<Chip
						quiet
						onClick={() => {
							setAll(true)
							push(<Mine fly>Angre alle</Mine>)
							void ask<UndoAllChangesOutput>('undo_all_changes', {}).then(
								(x) => {
									push(
										<Turn who="partner" enter>
											<Bubble>
												{x.ok
													? `Angret ${x.value.count}. ${x.value.kept.join(' ')}`
													: x.message}
											</Bubble>
										</Turn>,
									)
								},
							)
						}}
					>
						Angre alle {c.undoable}
					</Chip>
				</Chips>
			) : null}
		</Turn>
	)
}

// ── today ───────────────────────────────────────────────────────────────────

function TodaySession({
	s,
	detail,
	data,
	first,
}: {
	s: SessionCard
	detail: SessionOutput | null
	data: ThreadData
	first: boolean
}) {
	const flows = useFlows()
	const navigate = useNavigate()
	const [more, setMore] = useState(false)
	const today = data.athlete.today
	const can = detail?.can
	const d = s.planned.durationS.value
	const ref = refOf(s)
	const lead = first
		? `${greeting(data.hour)}${data.athlete.name ? `, ${data.athlete.name}` : ''}. `
		: ''

	if (s.status === 'done')
		return (
			<Turn who="partner" id={s.id}>
				<Bubble>
					{lead}
					{s.hasRecording
						? 'Fikk dagens økt fra klokka: '
						: 'Dagens økt er gjort: '}
					<b>{s.title}</b>. {compareSentence(s)}
				</Bubble>
				<SessionCardView s={s} detail={detail} today={today} />
				{s.actual.durationS.value !== null ? (
					<div className="prat-card" style={{ gap: 8 }}>
						<div
							className="prat-card-row"
							style={{ justifyContent: 'space-between' }}
						>
							<span className="prat-card-label">Planlagt mot gjort</span>
							<VerdictTag v={s.verdict} />
						</div>
						<CompareMini s={s} />
					</div>
				) : null}
				<Chips>
					{s.rpe === null ? (
						<Chip
							primary
							onClick={() => flows.start('kjent', ref, 'Hvor tung var den?')}
						>
							Si hvordan den kjentes
						</Chip>
					) : (
						<span className="prat-meta" style={{ alignSelf: 'center' }}>
							Kjentes som <b className="num">{s.rpe}</b> av 10
						</span>
					)}
				</Chips>
			</Turn>
		)

	if (s.status === 'missed')
		return (
			<Turn who="partner" id={s.id}>
				<Bubble>
					{lead}
					<b>{s.title}</b> i dag er hoppet over.
				</Bubble>
			</Turn>
		)

	const isStrength = s.sport === 'strength'
	const allowed = (k: keyof NonNullable<typeof can>) => !can || can[k].allowed
	return (
		<Turn who="partner" id={s.id}>
			<Bubble>
				{lead}I dag: <b>{lower(s.title)}</b>
				{d !== null && !isStrength ? (
					<>
						, <b className="num">{dur(d)}</b>
					</>
				) : null}
				.{isStrength ? ' Klar for styrke?' : ' Klar?'}
			</Bubble>
			<SessionCardView s={s} detail={detail} today={today} />
			<Chips>
				{isStrength ? (
					<>
						<Chip
							primary
							onClick={() => void navigate(`/lab/prat/styrke/${s.id}`)}
						>
							Start styrke
						</Chip>
						<Chip onClick={() => flows.start('gjort', ref)}>Gjort</Chip>
					</>
				) : (
					<>
						{allowed('markDone') ? (
							<Chip primary onClick={() => flows.start('gjort', ref)}>
								Gjort
							</Chip>
						) : null}
						<OpenButton s={s} label="Vis detaljer" />
					</>
				)}
				{allowed('move') ? (
					<Chip
						onClick={() => flows.start('senere', ref, 'Jeg tar den senere')}
					>
						Jeg tar den senere
					</Chip>
				) : null}
				{allowed('move') ? (
					<Chip onClick={() => flows.start('flytt', ref)}>Flytt</Chip>
				) : null}
				{!more ? (
					<Chip quiet onClick={() => setMore(true)} label="Flere valg">
						Mer …
					</Chip>
				) : (
					<>
						{allowed('shorten') && !isStrength ? (
							<Chip onClick={() => flows.start('kortere', ref)}>Kortere</Chip>
						) : null}
						{allowed('makeEasier') ? (
							<Chip onClick={() => flows.start('lettere', ref)}>Lettere</Chip>
						) : null}
						{allowed('swap') ? (
							<Chip onClick={() => flows.start('bytt', ref)}>Bytt</Chip>
						) : null}
						{allowed('skip') ? (
							<Chip quiet onClick={() => flows.start('hopp', ref)}>
								Hopp over
							</Chip>
						) : null}
					</>
				)}
			</Chips>
			{more && can ? (
				<span className="prat-meta">
					{[can.shorten, can.makeEasier, can.swap, can.skip, can.move]
						.filter((x) => !x.allowed && x.why)
						.map((x) => x.why)
						.filter((x, i, a) => a.indexOf(x) === i)
						.join(' ')}
				</span>
			) : null}
		</Turn>
	)
}

function SelfProposals({ data }: { data: ThreadData }) {
	const flows = useFlows()
	const [closed, setClosed] = useState<string[]>([])
	const { push } = useConvo()
	const week = data.week
	if (!week) return null
	const today = data.athlete.today
	const out: React.ReactNode[] = []

	// Missed: two or more sessions this week behind today, and nothing done since.
	const past = week.days
		.filter((d) => d.date < today)
		.flatMap((d) => d.sessions)
	const missed = past.filter(
		(s) => s.status === 'missed' || s.status === 'planned',
	)
	const lastDone = [...past].reverse().find((s) => s.status === 'done')
	const missedAfter = missed.filter((s) => !lastDone || s.date > lastDone.date)
	if (missedAfter.length >= 2 && !closed.includes('missed')) {
		const since = lastDone ? WEEKDAY_LONG[weekdayOf(lastDone.date)] : null
		out.push(
			<Turn who="partner" key="missed">
				<Bubble>
					Du har ikke fått trent {since ? `siden ${since}` : 'denne uka'}. Skal
					jeg gjøre resten av uka lettere, eller vil du flytte noe?
				</Bubble>
				<Chips>
					<Chip
						onClick={() => {
							setClosed((c) => [...c, 'missed'])
							flows.start('lettere-uke', null, 'Gjør resten av uka lettere')
						}}
					>
						Gjør uka lettere
					</Chip>
					<Chip
						onClick={() => {
							setClosed((c) => [...c, 'missed'])
							flows.start('flytt', null, 'Flytt noe')
						}}
					>
						Flytt noe
					</Chip>
					<Chip
						quiet
						onClick={() => {
							setClosed((c) => [...c, 'missed'])
							push(<Mine fly>Nei, det går fint</Mine>)
							push(
								<Turn who="partner" enter>
									<Bubble>Greit. Jeg lar uka stå.</Bubble>
								</Turn>,
							)
						}}
					>
						Nei, det går fint
					</Chip>
				</Chips>
			</Turn>,
		)
	}

	// Too much: the load done so far against what was planned up to today.
	const upto = week.days
		.filter((d) => d.date <= today)
		.flatMap((d) => d.sessions)
	const plannedSoFar = upto.reduce((s, x) => s + (x.planned.load.value ?? 0), 0)
	const doneSoFar = upto.reduce(
		(s, x) =>
			s +
			(x.status === 'done' || x.status === 'recording-only'
				? (x.actual.load.value ?? 0)
				: 0),
		0,
	)
	const knowsLoad =
		upto.some((x) => x.actual.load.value !== null) && plannedSoFar > 0
	if (
		knowsLoad &&
		doneSoFar > plannedSoFar * 1.3 &&
		(week.load.verdict.call === 'over' ||
			data.today?.readiness.call === 'overreaching') &&
		!closed.includes('over')
	) {
		const pct = Math.round((doneSoFar / plannedSoFar - 1) * 100)
		const next = data.week?.days
			.filter((d) => d.date > today)
			.flatMap((d) => d.sessions)
			.find((s) => s.status === 'planned')
		out.push(
			<Turn who="partner" key="over">
				<Bubble>
					Du har trent <b className="num">{pct} %</b> mer enn planlagt så langt
					denne uka.
					{next
						? ` Jeg foreslår at ${lower(next.title)} ${relDay(next.date, today)} går ut, så du får hvile.`
						: ' Ta det rolig resten av uka.'}
				</Bubble>
				<Chips>
					{next ? (
						<Chip
							primary
							onClick={() => {
								setClosed((c) => [...c, 'over'])
								flows.start(
									'hopp',
									refOf(next),
									`Ja, hopp over ${lower(next.title)}`,
								)
							}}
						>
							Ja, gjør det
						</Chip>
					) : null}
					<Chip
						quiet
						onClick={() => {
							setClosed((c) => [...c, 'over'])
							push(<Mine fly>Nei, jeg kjører på</Mine>)
							push(
								<Turn who="partner" enter>
									<Bubble>
										Greit. Kjenn etter, og si «lettere» om beina protesterer.
									</Bubble>
								</Turn>,
							)
						}}
					>
						Nei, jeg kjører på
					</Chip>
				</Chips>
			</Turn>,
		)
	}

	// A missed week: nothing done last week although something was planned.
	const lw = data.lastWeek
	const wd = weekdayOf(today)
	if (
		lw &&
		lw.counts.done === 0 &&
		lw.counts.planned + lw.counts.missed > 0 &&
		(wd === 'mon' || wd === 'tue') &&
		!closed.includes('week')
	) {
		out.push(
			<Turn who="partner" key="week">
				<Bubble>
					Forrige uke ble det ingen økter. Vil du fortsette der vi var, eller
					gjøre denne uka lettere å komme i gang med?
				</Bubble>
				<VolumeCard sports={lw.sports} title="Forrige uke: plan mot gjort" />
				<Chips>
					<Chip
						onClick={() => {
							setClosed((c) => [...c, 'week'])
							push(<Mine fly>Fortsett der vi var</Mine>)
							push(
								<Turn who="partner" enter>
									<Bubble>Greit. Uka står som planlagt.</Bubble>
								</Turn>,
							)
						}}
					>
						Fortsett der vi var
					</Chip>
					<Chip
						onClick={() => {
							setClosed((c) => [...c, 'week'])
							flows.start('lettere-uke', null, 'Gjør denne uka lettere')
						}}
					>
						Gjør uka lettere
					</Chip>
				</Chips>
			</Turn>,
		)
	}
	return <>{out}</>
}

function RaceEveMsg({ data }: { data: ThreadData }) {
	const r = data.raceEve
	const [open, setOpen] = useState(false)
	const { push } = useConvo()
	if (!r) return null
	if (r.daysToGo === 0)
		return (
			<Turn who="partner">
				<Bubble>
					I dag er det <b>{r.name}</b>. Du har gjort jobben. Start rolig, og
					lykke til.
				</Bubble>
			</Turn>
		)
	return (
		<Turn who="partner">
			<Bubble>
				I morgen er det <b>{r.name}</b>.
				{r.todaySession ? ` I dag: ${lower(r.todaySession)}.` : ''}{' '}
				{r.done !== null && r.planned !== null ? (
					<>
						Du har gjort <b className="num">{r.done}</b> av {r.planned}{' '}
						planlagte økter.
					</>
				) : null}{' '}
				Vil du se en åpningsplan for løpet?
			</Bubble>
			{!open ? (
				<Chips>
					<Chip
						primary
						onClick={() => {
							setOpen(true)
							push(<Mine fly>Ja</Mine>)
							push(<OpeningPlan data={data} />)
						}}
					>
						Ja
					</Chip>
				</Chips>
			) : null}
		</Turn>
	)
}

function OpeningPlan({ data }: { data: ThreadData }) {
	const r = data.raceEve!
	if (!r.pace)
		return (
			<Turn who="partner" enter>
				<Bubble>{r.paceWhy}</Bubble>
			</Turn>
		)
	const p = r.pace.secPerKm
	const rows = [
		{
			k: 'Km 1–2',
			pace: p + 8,
			note: 'Litt roligere enn løpsfart. La de andre gå.',
		},
		{ k: 'Km 3–5', pace: p + 3, note: 'Finn rytmen.' },
		{
			k: 'Resten',
			pace: p,
			note: 'Løpsfart. Øk bare om du har mer igjen etter halvveis.',
		},
	]
	return (
		<Turn who="partner" enter>
			<Bubble>
				Regnet fra {r.pace.from}. Løpsfarten blir{' '}
				<b className="num">{mmss(p)} /km</b>.
			</Bubble>
			<div className="prat-card">
				<span className="prat-card-label">Åpningsplan</span>
				<dl className="prat-kv" style={{ margin: 0 }}>
					{rows.map((x) => (
						<div key={x.k} style={{ display: 'contents' }}>
							<dt>{x.k}</dt>
							<dd>
								<b className="num">{mmss(x.pace)} /km</b>{' '}
								<span className="prat-note">{x.note}</span>
							</dd>
						</div>
					))}
				</dl>
			</div>
		</Turn>
	)
}

function WeekSummary({ data }: { data: ThreadData }) {
	const w = data.week
	if (!w) return null
	const wd = weekdayOf(data.athlete.today)
	if (wd !== 'sun' || data.hour < 18) return null
	const c = w.counts
	if (c.done + c.planned + c.missed + c.recordingOnly === 0) return null
	return (
		<Turn who="partner">
			<Bubble>
				Uka di: <b className="num">{c.done}</b> av{' '}
				{c.done + c.planned + c.missed} økter gjort
				{c.recordingOnly ? `, pluss ${c.recordingOnly} ekstra` : ''}.{' '}
				{w.load.verdict.sentence ?? w.load.verdict.why ?? ''}
			</Bubble>
			<VolumeCard sports={w.sports} title="Uka mot planen" />
		</Turn>
	)
}

// ── the whole derived thread ────────────────────────────────────────────────

export function ThreadView({ data }: { data: ThreadData }) {
	const { changes } = useConvo()
	const today = data.athlete.today
	const [showAll, setShowAll] = useState(false)

	const byDay = new Map<string, SessionCard[]>()
	for (const s of data.recent) {
		const list = byDay.get(s.date) ?? []
		list.push(s)
		byDay.set(s.date, list)
	}
	const oldChanges = changes.filter((c) => !c.fresh)
	for (const c of oldChanges)
		if (c.day < today && !byDay.has(c.day)) byDay.set(c.day, [])
	const days = [...byDay.keys()].filter((d) => d < today).sort()
	const shown = showAll ? days : days.slice(-2)
	const hidden = days.length - shown.length

	const t = data.today
	const details = new Map(data.todayDetails.map((d) => [d.id, d]))

	return (
		<>
			{data.importing ? (
				<div className="prat-banner">
					Henter historikk fra klokka … Tråden fylles på.
				</div>
			) : null}
			{hidden > 0 ? (
				<div style={{ alignSelf: 'center', marginTop: 8 }}>
					<Chip quiet onClick={() => setShowAll(true)}>
						Vis {hidden} {hidden === 1 ? 'dag' : 'dager'} til
					</Chip>
				</div>
			) : null}
			{days.length === 0 ? <DayDivider>Siste sju dager</DayDivider> : null}
			{days.length === 0 ? (
				<Turn who="partner">
					<Bubble>
						Ingenting de siste sju dagene. Det som skjer framover, havner her.
					</Bubble>
				</Turn>
			) : null}
			{shown.map((day) => (
				<div key={day} style={{ display: 'contents' }}>
					<DayDivider>
						{cap(relDay(day, today))} ·{' '}
						{longDate(day).split(' ').slice(1).join(' ')}
					</DayDivider>
					{(byDay.get(day) ?? []).map((s) => (
						<PastSession key={s.id} s={s} data={data} />
					))}
					{oldChanges
						.filter((c) => c.day === day)
						.map((c) => (
							<Turn who="partner" key={c.id}>
								<OldChange id={c.id} />
							</Turn>
						))}
				</div>
			))}

			<DayDivider>I dag · {longDate(today)}</DayDivider>
			<ProposalsBlock data={data} />
			<RaceEveMsg data={data} />
			{!t ? (
				<Turn who="partner">
					<Bubble>
						{data.todayError ?? 'Jeg fikk ikke hentet dagen i dag.'}
					</Bubble>
				</Turn>
			) : t.restDay && !t.sessions.length ? (
				<Turn who="partner" id="i-dag">
					<Bubble>
						{greeting(data.hour)}
						{data.athlete.name ? `, ${data.athlete.name}` : ''}. I dag er
						hviledag. Ikke la deg friste.
					</Bubble>
					{t.next ? (
						<>
							<Bubble>
								Neste: <b>{lower(t.next.title)}</b> {relDay(t.next.date, today)}
								{t.next.planned.durationS.value !== null
									? `, ${dur(t.next.planned.durationS.value)}`
									: ''}
								.
							</Bubble>
							<SessionCardView s={t.next} today={today} />
						</>
					) : null}
				</Turn>
			) : (
				t.sessions.map((s, i) => (
					<TodaySession
						key={s.id}
						s={s}
						detail={details.get(s.id) ?? null}
						data={data}
						first={i === 0}
					/>
				))
			)}
			{t ? (
				<Turn who="partner">
					<Bubble>{t.readiness.sentence}</Bubble>
					{t.readiness.nextSession.outcome === 'eased' &&
					t.readiness.nextSession.sentence ? (
						<Bubble>{t.readiness.nextSession.sentence}</Bubble>
					) : null}
					{t.weather ? (
						<span className="prat-meta">
							{t.weather.label}, {num0(t.weather.temperatureC)}°
							{t.weather.precipitationMm
								? `, ${t.weather.precipitationMm} mm`
								: ''}{' '}
							· {t.weather.credit}
						</span>
					) : null}
				</Turn>
			) : null}
			{t &&
			t.sessions.length > 0 &&
			t.sessions.every((s) => s.status !== 'planned') &&
			t.next ? (
				<Turn who="partner">
					<Bubble>
						Neste: <b>{lower(t.next.title)}</b> {relDay(t.next.date, today)}.
					</Bubble>
				</Turn>
			) : null}
			<SelfProposals data={data} />
			<WeekSummary data={data} />
			{oldChanges
				.filter((c) => c.day === today)
				.map((c) => (
					<Turn who="partner" key={c.id}>
						<OldChange id={c.id} />
					</Turn>
				))}
		</>
	)
}

function OldChange({ id }: { id: string }) {
	return <LiveChange id={id} />
}

export function nextDays(today: string, n: number) {
	return Array.from({ length: n }, (_, i) => addDays(today, i))
}
