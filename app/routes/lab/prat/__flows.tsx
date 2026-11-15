import { createContext, useContext, useState } from 'react'
import { useNavigate } from 'react-router'
import {
	type PlanOutput,
	type ProgressOutput,
	type SessionCard,
} from '#app/lab/engine/reads.types.ts'
import {
	type AddSessionOutput,
	type EaseWeekOutput,
	type FinishStrengthSessionOutput,
	type LogStrengthAsPlannedOutput,
	type MarkDoneOutput,
	type MoveSessionOutput,
	type NoteSessionOutput,
	type RateSessionOutput,
	type ShortenSessionOutput,
	type SkipSessionOutput,
	type SwapSessionsOutput,
} from '#app/lab/engine/sessions.types.ts'
import { type SyncOutput } from '#app/lab/engine/setup.types.ts'
import { useAsk, useCall, useConvo, useOnce } from './__convo.tsx'
import {
	WEEKDAY_LONG,
	addDays,
	cap,
	dur,
	lower,
	minutesText,
	relDay,
	volume,
	weekdayOf,
} from './__fmt.ts'
import {
	FormCard,
	RoadCard,
	VolumeCard,
	WeeksCard,
	formHeadline,
	roadHeadline,
} from './__progress.tsx'
import { type Ref, type ThreadData } from './__types.ts'
import {
	Bubble,
	ChangeCard,
	Chip,
	Chips,
	DayPicker,
	Mine,
	RpePicker,
	Turn,
	type PickDay,
} from './__ui.tsx'

// ── the thread's data, for flows started anywhere ──────────────────────────

export const ThreadCtx = createContext<ThreadData | null>(null)
export function useThreadData() {
	return useContext(ThreadCtx)
}

export function refOf(s: SessionCard): Ref {
	return {
		id: s.id,
		title: s.title,
		date: s.date,
		sport: s.sport,
		seconds: s.planned.durationS.value,
		status: s.status,
	}
}

/** Sessions still to do, from today on: this week and next. */
export function openRefs(data: ThreadData | null): Ref[] {
	if (!data) return []
	const today = data.athlete.today
	const all = [...(data.week?.days ?? []), ...(data.nextWeek?.days ?? [])]
		.flatMap((d) => d.sessions)
		.filter((s) => s.status === 'planned' && s.date >= today)
	const seen = new Set<string>()
	return all
		.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)))
		.map(refOf)
}

function todayRefs(data: ThreadData | null) {
	return (data?.today?.sessions ?? [])
		.filter((s) => s.status === 'planned')
		.map(refOf)
}

function refName(r: Ref, today: string) {
	return `${r.title} ${relDay(r.date, today)}`
}

// ── flows ───────────────────────────────────────────────────────────────────

export type FlowKind =
	| 'flytt'
	| 'senere'
	| 'bytt'
	| 'hopp'
	| 'kortere'
	| 'lettere'
	| 'lettere-uke'
	| 'gjort'
	| 'kjent'
	| 'legg-til'
	| 'form'
	| 'i-dag'
	| 'angre'
	| 'synk'

const LABEL: Record<FlowKind, string> = {
	flytt: 'Flytt',
	senere: 'Jeg tar den senere',
	bytt: 'Bytt',
	hopp: 'Hopp over',
	kortere: 'Kortere',
	lettere: 'Lettere',
	'lettere-uke': 'Lettere uke',
	gjort: 'Gjort',
	kjent: 'Si hvordan den kjentes',
	'legg-til': 'Legg til en økt',
	form: 'Hvordan går det?',
	'i-dag': 'I dag',
	angre: 'Angre',
	synk: 'Hent nye økter',
}

/** Starts a flow: the athlete's words as a bubble, then the partner's turn. */
export function useFlows() {
	const { push } = useConvo()
	const data = useThreadData()
	return {
		start(kind: FlowKind, ref?: Ref | null, said?: string) {
			push(
				<Mine fly>
					{said ?? (ref ? `${LABEL[kind]}: ${ref.title}` : LABEL[kind])}
				</Mine>,
			)
			push(<FlowRoot kind={kind} ref0={ref ?? null} data={data} />)
		},
	}
}

function FlowRoot({
	kind,
	ref0,
	data,
}: {
	kind: FlowKind
	ref0: Ref | null
	data: ThreadData | null
}) {
	const today = data?.athlete.today ?? ''
	const needsRef: FlowKind[] = [
		'flytt',
		'bytt',
		'hopp',
		'senere',
		'kortere',
		'lettere',
		'gjort',
		'kjent',
	]
	const [ref, setRef] = useState<Ref | null>(ref0)
	if (needsRef.includes(kind) && !ref) {
		const onlyToday = ['senere', 'kortere', 'lettere', 'gjort'].includes(kind)
		const candidates =
			kind === 'kjent'
				? [...(data?.today?.sessions ?? []), ...(data?.recent ?? [])]
						.filter((s) => s.status === 'done')
						.map(refOf)
						.reverse()
						.slice(0, 6)
				: onlyToday
					? todayRefs(data)
					: openRefs(data).slice(0, 10)
		if (candidates.length === 1 && onlyToday) {
			return <FlowFor kind={kind} r={candidates[0]!} data={data} />
		}
		return (
			<PickSession
				candidates={candidates}
				today={today}
				question={
					kind === 'kjent'
						? 'Hvilken økt?'
						: onlyToday
							? 'Hvilken av dagens økter?'
							: `Hvilken økt vil du ${kind === 'flytt' ? 'flytte' : kind === 'bytt' ? 'bytte' : 'hoppe over'}?`
				}
				empty={
					kind === 'kjent'
						? 'Du har ingen gjorte økter de siste dagene å si noe om.'
						: onlyToday
							? 'Du har ingen økt igjen i dag.'
							: 'Du har ingen økter igjen å endre de neste to ukene.'
				}
				onPick={setRef}
			/>
		)
	}
	if (ref) return <FlowFor kind={kind} r={ref} data={data} />
	switch (kind) {
		case 'lettere-uke':
			return <EaseWeekFlow data={data} />
		case 'legg-til':
			return <AddFlow data={data} />
		case 'form':
			return <ProgressFlow data={data} />
		case 'i-dag':
			return <TodayRecap data={data} />
		case 'angre':
			return <UndoLatest />
		case 'synk':
			return <SyncFlow />
		default:
			return null
	}
}

function FlowFor({
	kind,
	r,
	data,
}: {
	kind: FlowKind
	r: Ref
	data: ThreadData | null
}) {
	switch (kind) {
		case 'flytt':
			return <MoveFlow r={r} data={data} />
		case 'senere':
			return <LaterFlow r={r} data={data} />
		case 'bytt':
			return <SwapFlow r={r} data={data} />
		case 'hopp':
			return <SkipFlow r={r} data={data} />
		case 'kortere':
			return <ShortenFlow r={r} kind="shorten" data={data} />
		case 'lettere':
			return <ShortenFlow r={r} kind="ease" data={data} />
		case 'gjort':
			return <DoneFlow r={r} data={data} />
		case 'kjent':
			return <FeelingFlow r={r} />
		default:
			return null
	}
}

function PickSession({
	candidates,
	today,
	question,
	empty,
	onPick,
}: {
	candidates: Ref[]
	today: string
	question: string
	empty: string
	onPick: (r: Ref) => void
}) {
	const { push } = useConvo()
	const [picked, setPicked] = useState(false)
	if (!candidates.length)
		return (
			<Turn who="partner" enter>
				<Bubble>{empty}</Bubble>
			</Turn>
		)
	return (
		<Turn who="partner" enter>
			<Bubble>{question}</Bubble>
			{picked ? null : (
				<Chips>
					{candidates.map((c) => (
						<Chip
							key={c.id}
							onClick={() => {
								setPicked(true)
								push(<Mine fly>{refName(c, today)}</Mine>)
								push(<Deferred run={() => onPick(c)} />)
							}}
						>
							{cap(relDay(c.date, today))}: {c.title}
						</Chip>
					))}
				</Chips>
			)}
		</Turn>
	)
}

/** Lets a picked session continue the flow as the next turn. */
function Deferred({ run }: { run: () => void }) {
	useOnce(run)
	return null
}

/** A change card in the live thread, tied to the change log by id. */
export function LiveChange({
	id,
	detail,
}: {
	id: string
	detail?: React.ReactNode
}) {
	const { changes, undoChange, undoBusy, push } = useConvo()
	const c = changes.find((x) => x.id === id)
	if (!c) return null
	return (
		<ChangeCard
			text={c.text}
			detail={detail ?? c.detail}
			undone={c.undone}
			busy={undoBusy === id}
			noUndo={c.token ? null : c.noUndo}
			onUndo={
				c.token
					? () => {
							void undoChange(id).then((r) => {
								if (!r) return
								push(
									<Turn who="partner" enter>
										<Bubble>
											{r.ok
												? r.value.undone
													? 'Angret. Det er som før.'
													: 'Det var alt angret.'
												: r.message}
										</Bubble>
									</Turn>,
								)
							})
						}
					: undefined
			}
		/>
	)
}

function useResult() {
	const { push, addChange } = useConvo()
	return {
		fail(message: string) {
			push(
				<Turn who="partner" enter>
					<Bubble>{message}</Bubble>
				</Turn>,
			)
		},
		change(
			lines: React.ReactNode[],
			change: {
				text: string
				token: string | null
				noUndo: string | null
				detail?: string | null
			},
			extra?: React.ReactNode,
		) {
			const id = addChange(change)
			push(
				<Turn who="partner" enter>
					{lines.map((l, i) => (
						<Bubble key={i}>{l}</Bubble>
					))}
					<LiveChange id={id} />
					{extra}
				</Turn>,
			)
		},
	}
}

function pickDays(
	data: ThreadData | null,
	from: string,
	exclude?: string,
): PickDay[] {
	const ok = data?.athlete.availability.days ?? null
	const all = [...(data?.week?.days ?? []), ...(data?.nextWeek?.days ?? [])]
	const out: PickDay[] = []
	for (let i = 0; i < 14; i++) {
		const date = addDays(from, i)
		const wd = weekdayOf(date)
		const day = all.find((d) => d.date === date)
		const n = day?.sessions.filter((s) => s.status !== 'missed').length ?? 0
		out.push({
			date,
			blocked: ok ? !ok.includes(wd) : false,
			disabled: date === exclude,
			note: n ? `${n} økt${n > 1 ? 'er' : ''} der fra før` : undefined,
		})
	}
	return out
}

function MoveFlow({ r, data }: { r: Ref; data: ThreadData | null }) {
	const ask = useAsk()
	const { push } = useConvo()
	const res = useResult()
	const today = data?.athlete.today ?? r.date
	const [picked, setPicked] = useState<string | null>(null)
	const from = r.date > today ? today : today
	return (
		<Turn who="partner" enter>
			<Bubble>Til hvilken dag? Skraverte dager har du sagt ikke går.</Bubble>
			{picked ? null : (
				<div className="prat-card">
					<DayPicker
						days={pickDays(data, from, r.date)}
						onPick={(date) => {
							setPicked(date)
							push(<Mine fly>{cap(relDay(date, today))}</Mine>)
							void ask<MoveSessionOutput>('move_session', {
								sessionId: r.id,
								date,
							}).then((x) => {
								if (!x.ok) return res.fail(x.message)
								const lines: React.ReactNode[] = [
									<>
										Flyttet til <b>{relDay(date, today)}</b>.
										{x.value.leftItsWeek
											? ' Den havnet i en annen uke, så den uka blir litt tyngre og denne lettere.'
											: ''}
									</>,
								]
								if (x.value.clashes.length)
									lines.push(
										`Merk: ${x.value.clashes.map((c) => c.text).join(', ')}. Den står likevel der.`,
									)
								res.change(lines, {
									text: `${cap(WEEKDAY_LONG[weekdayOf(r.date)])} → ${WEEKDAY_LONG[weekdayOf(date)]}`,
									detail: r.title,
									token: x.value.undo,
									noUndo: x.value.noUndoBecause,
								})
							})
						}}
					/>
				</div>
			)}
		</Turn>
	)
}

function LaterFlow({ r, data }: { r: Ref; data: ThreadData | null }) {
	const ask = useAsk()
	const res = useResult()
	const today = data?.athlete.today ?? r.date
	useOnce(() => {
		void ask<MoveSessionOutput>('move_session', { sessionId: r.id }).then(
			(x) => {
				if (!x.ok) return res.fail(x.message)
				const moves = x.value.moves
				const mine = moves.find((m) => m.sessionId === r.id)
				const other = moves.find((m) => m.sessionId !== r.id)
				res.change(
					[
						<>
							Da tar du den{' '}
							<b>{mine ? relDay(mine.toDate, today) : 'senere'}</b>.
							{other
								? ` Den byttet plass med økta som sto ${relDay(other.fromDate, today)}.`
								: ''}
						</>,
					],
					{
						text: mine
							? `I dag → ${WEEKDAY_LONG[weekdayOf(mine.toDate)]}`
							: 'Flyttet',
						detail: r.title,
						token: x.value.undo,
						noUndo: x.value.noUndoBecause,
					},
				)
			},
		)
	})
	return null
}

function SwapFlow({ r, data }: { r: Ref; data: ThreadData | null }) {
	const ask = useAsk()
	const { push } = useConvo()
	const res = useResult()
	const today = data?.athlete.today ?? r.date
	const [picked, setPicked] = useState(false)
	const others = openRefs(data).filter(
		(o) => o.id !== r.id && o.date !== r.date,
	)
	if (!others.length)
		return (
			<Turn who="partner" enter>
				<Bubble>Det er ingen andre økter å bytte med de neste to ukene.</Bubble>
			</Turn>
		)
	return (
		<Turn who="partner" enter>
			<Bubble>Med hvilken?</Bubble>
			{picked ? null : (
				<Chips>
					{others.slice(0, 10).map((o) => (
						<Chip
							key={o.id}
							onClick={() => {
								setPicked(true)
								push(<Mine fly>{refName(o, today)}</Mine>)
								void ask<SwapSessionsOutput>('swap_sessions', {
									sessionId: r.id,
									otherSessionId: o.id,
								}).then((x) => {
									if (!x.ok) return res.fail(x.message)
									res.change(
										[
											<>
												Byttet. <b>{r.title}</b> er {relDay(o.date, today)}, og{' '}
												<b>{o.title}</b> er {relDay(r.date, today)}.
											</>,
										],
										{
											text: `${cap(WEEKDAY_LONG[weekdayOf(r.date)])} ⇄ ${WEEKDAY_LONG[weekdayOf(o.date)]}`,
											detail: `${r.title} og ${o.title}`,
											token: x.value.undo,
											noUndo: x.value.noUndoBecause,
										},
									)
								})
							}}
						>
							{cap(relDay(o.date, today))}: {o.title}
						</Chip>
					))}
				</Chips>
			)}
		</Turn>
	)
}

function Confirm({
	question,
	yes,
	no = 'Nei, la den stå',
	onYes,
}: {
	question: React.ReactNode
	yes: string
	no?: string
	onYes: () => void
}) {
	const { push } = useConvo()
	const [done, setDone] = useState(false)
	return (
		<Turn who="partner" enter>
			<Bubble>{question}</Bubble>
			{done ? null : (
				<Chips>
					<Chip
						primary
						onClick={() => {
							setDone(true)
							push(<Mine fly>{yes}</Mine>)
							onYes()
						}}
					>
						{yes}
					</Chip>
					<Chip
						quiet
						onClick={() => {
							setDone(true)
							push(<Mine fly>{no}</Mine>)
							push(
								<Turn who="partner" enter>
									<Bubble>Greit, den står som den er.</Bubble>
								</Turn>,
							)
						}}
					>
						{no}
					</Chip>
				</Chips>
			)}
		</Turn>
	)
}

function SkipFlow({ r, data }: { r: Ref; data: ThreadData | null }) {
	const ask = useAsk()
	const res = useResult()
	const today = data?.athlete.today ?? r.date
	return (
		<Confirm
			question={
				<>
					Hoppe over <b>{r.title}</b> {relDay(r.date, today)}? Planen fyller
					ikke inn noe annet, og uka blir lettere.
				</>
			}
			yes="Ja, hopp over"
			onYes={() =>
				void ask<SkipSessionOutput>('skip_session', { sessionId: r.id }).then(
					(x) => {
						if (!x.ok) return res.fail(x.message)
						res.change(
							[
								x.value.state === 'missed'
									? 'Notert som ikke gjort.'
									: 'Hoppet over.',
							],
							{
								text: `${r.title} hoppet over`,
								token: x.value.undo,
								noUndo: x.value.noUndoBecause,
							},
						)
					},
				)
			}
		/>
	)
}

function ShortenFlow({
	r,
	kind,
}: {
	r: Ref
	kind: 'shorten' | 'ease'
	data: ThreadData | null
}) {
	const ask = useAsk()
	const res = useResult()
	const mins = r.seconds !== null ? Math.round(r.seconds / 60) : null
	const question =
		kind === 'shorten' ? (
			<>
				Kortere: jeg gjør <b>{r.title}</b> til{' '}
				<b className="num">{mins !== null && mins <= 30 ? '20' : '30'} min</b>{' '}
				og beholder formålet. {mins !== null ? `Den er ${mins} min nå. ` : ''}
				Ok?
			</>
		) : (
			<>
				Lettere: jeg gjør <b>{r.title}</b> rolig og omtrent 60 % så lang (aldri
				under 20 min). Ok?
			</>
		)
	return (
		<Confirm
			question={question}
			yes={kind === 'shorten' ? 'Ja, kortere' : 'Ja, lettere'}
			onYes={() =>
				void ask<ShortenSessionOutput>(
					kind === 'shorten' ? 'shorten_session' : 'ease_session',
					{ sessionId: r.id },
				).then((x) => {
					if (!x.ok) return res.fail(x.message)
					const b = x.value.minutesBefore
					const a = x.value.minutesAfter
					res.change(
						[
							b !== null && a !== null ? (
								<>
									Fra <b className="num">{b} min</b> til{' '}
									<b className="num">{a} min</b>
									{kind === 'ease' ? ', og rolig' : ''}.
								</>
							) : (
								'Endret.'
							),
						],
						{
							text: `${r.title}: ${b ?? '?'} → ${a ?? '?'} min`,
							token: x.value.undo,
							noUndo: x.value.noUndoBecause,
						},
					)
				})
			}
		/>
	)
}

function EaseWeekFlow({ data }: { data: ThreadData | null }) {
	const ask = useAsk()
	const res = useResult()
	return (
		<Confirm
			question="Lettere uke: jeg gjør hver økt som gjenstår i den kommende uka omtrent 15 % lettere. Det går én gang per uke."
			yes="Ja, gjør den lettere"
			no="Nei takk"
			onYes={() =>
				void ask<EaseWeekOutput>('ease_week', {}).then((x) => {
					if (!x.ok) return res.fail(x.message)
					res.change(
						[
							<>
								Gjort. <b className="num">{x.value.sessionsChanged}</b>{' '}
								{x.value.sessionsChanged === 1 ? 'økt' : 'økter'} er lettere i
								uka fra{' '}
								{relDay(x.value.week, data?.athlete.today ?? x.value.week)}.
							</>,
						],
						{
							text: 'Lettere uke',
							token: x.value.undo,
							noUndo: x.value.noUndoBecause,
						},
						<BeforeAfter volume={x.value.volume} />,
					)
				})
			}
		/>
	)
}

export function BeforeAfter({
	volume: vol,
}: {
	volume: {
		sport: string
		unit: string
		before: number | null
		after: number | null
	}[]
}) {
	const names: Record<string, string> = {
		run: 'Løping',
		bike: 'Sykling',
		swim: 'Svømming',
		strength: 'Styrke',
		other: 'Annet',
	}
	if (!vol.length) return null
	return (
		<div className="prat-card" style={{ maxWidth: 420 }}>
			<div
				style={{
					display: 'grid',
					gridTemplateColumns: '1fr auto auto',
					gap: '6px 14px',
					fontSize: 15,
				}}
			>
				<span className="prat-card-label">Idrett</span>
				<span className="prat-card-label">Før</span>
				<span className="prat-card-label">Etter</span>
				{vol.map((v) => (
					<div key={v.sport} style={{ display: 'contents' }}>
						<span>{names[v.sport] ?? v.sport}</span>
						<span className="num prat-note">
							{v.before !== null ? volume(v.before, v.unit) : 'ukjent'}
						</span>
						<b className="num">
							{v.after !== null ? volume(v.after, v.unit) : 'ukjent'}
						</b>
					</div>
				))}
			</div>
		</div>
	)
}

function DoneFlow({ r }: { r: Ref; data: ThreadData | null }) {
	const navigate = useNavigate()
	if (r.sport === 'strength') {
		return (
			<StrengthChoice
				r={r}
				onOpen={() => void navigate(`/lab/prat/styrke/${r.id}`)}
			/>
		)
	}
	return <MarkDone r={r} />
}

function MarkDone({ r }: { r: Ref }) {
	const ask = useAsk()
	const { push, addChange } = useConvo()
	const res = useResult()
	useOnce(() => {
		void ask<MarkDoneOutput>('mark_done', { sessionId: r.id }).then((x) => {
			if (!x.ok) return res.fail(x.message)
			const id = addChange({
				text: `${r.title}: gjort`,
				token: x.value.undo,
				noUndo: x.value.noUndoBecause,
			})
			push(
				<Turn who="partner" enter>
					<Bubble>
						Registrert. Kommer den fra klokka senere, kobler jeg tallene på
						selv.
					</Bubble>
					<LiveChange id={id} />
				</Turn>,
			)
			push(<FeelingFlow r={r} />)
		})
	})
	return null
}

function StrengthChoice({ r, onOpen }: { r: Ref; onOpen: () => void }) {
	const ask = useAsk()
	const { push } = useConvo()
	const res = useResult()
	const [done, setDone] = useState(false)
	return (
		<Turn who="partner" enter>
			<Bubble>
				Klar for styrke? Jeg kan åpne økta og la deg huke av sett for sett,
				eller føre hele økta som planlagt.
			</Bubble>
			{done ? null : (
				<Chips>
					<Chip primary onClick={onOpen}>
						Start styrke
					</Chip>
					<Chip
						onClick={() => {
							setDone(true)
							push(<Mine fly>Alt gikk som planlagt</Mine>)
							void ask<LogStrengthAsPlannedOutput>('log_strength_as_planned', {
								sessionId: r.id,
							}).then((x) => {
								if (!x.ok) return res.fail(x.message)
								res.change(
									[
										<>
											Ført: <b className="num">{x.value.loggedSets}</b> sett.
											{x.value.lifts.length
												? ` ${x.value.lifts.map((l) => `${l.name}: ${l.reason}`).join(' ')}`
												: ''}
										</>,
									],
									{
										text: `${r.title}: ført som planlagt`,
										token: x.value.undo,
										noUndo: x.value.noUndoBecause,
									},
								)
								push(<FeelingFlow r={r} />)
							})
						}}
					>
						Alt gikk som planlagt
					</Chip>
				</Chips>
			)}
		</Turn>
	)
}

export function LiftsSummary({ out }: { out: FinishStrengthSessionOutput }) {
	if (!out.lifts.length) return null
	return (
		<div className="prat-card" style={{ gap: 6 }}>
			{out.programName ? (
				<span className="prat-card-label">{out.programName}</span>
			) : null}
			{out.lifts.map((l) => (
				<div
					key={l.exerciseId}
					className="prat-card-row"
					style={{ alignItems: 'baseline' }}
				>
					<b style={{ minWidth: 0, flex: 1 }}>{l.name}</b>
					<span className="num">{l.nextKg} kg neste gang</span>
				</div>
			))}
			<span className="prat-note">
				{out.lifts.map((l) => l.reason).join(' ')}
			</span>
		</div>
	)
}

/** How hard was it, then a note. Each answer is kept on its own. */
export function FeelingFlow({ r }: { r: Ref }) {
	const ask = useAsk()
	const { push } = useConvo()
	const res = useResult()
	const [rpe, setRpe] = useState<number | null>(null)
	return (
		<Turn who="partner" enter>
			<Bubble>
				Hvor tung var <b>{lower(r.title)}</b>? 1 er veldig lett, 10 er alt du
				hadde.
			</Bubble>
			{rpe === null ? (
				<RpePicker
					value={null}
					onPick={(n) => {
						setRpe(n)
						push(<Mine fly>{n}</Mine>)
						void ask<RateSessionOutput>('rate_session', {
							sessionId: r.id,
							rpe: n,
						}).then((x) => {
							if (!x.ok) return res.fail(x.message)
							push(<NoteFlow r={r} />)
						})
					}}
				/>
			) : null}
		</Turn>
	)
}

export function NoteFlow({ r }: { r: Ref }) {
	const ask = useAsk()
	const { push } = useConvo()
	const res = useResult()
	const [text, setText] = useState('')
	const [done, setDone] = useState(false)
	return (
		<Turn who="partner" enter>
			<Bubble>Noe å notere?</Bubble>
			{done ? null : (
				<form
					className="prat-card"
					style={{ maxWidth: 420 }}
					onSubmit={(e) => {
						e.preventDefault()
						if (!text.trim()) return
						setDone(true)
						push(<Mine fly>{text.trim()}</Mine>)
						void ask<NoteSessionOutput>('note_session', {
							sessionId: r.id,
							note: text.trim(),
						}).then((x) => {
							if (!x.ok) return res.fail(x.message)
							push(
								<Turn who="partner" enter>
									<Bubble>Lagret, akkurat som du skrev det.</Bubble>
								</Turn>,
							)
						})
					}}
				>
					<textarea
						className="prat-input"
						value={text}
						onChange={(e) => setText(e.target.value)}
						maxLength={2000}
						placeholder="Tunge bein, god flyt, vondt i kneet …"
						aria-label="Notat"
					/>
					<Chips>
						<button
							type="submit"
							className="prat-chip primary"
							disabled={!text.trim()}
						>
							<span>Lagre notat</span>
						</button>
						<Chip
							quiet
							onClick={() => {
								setDone(true)
								push(<Mine fly>Nei</Mine>)
								push(
									<Turn who="partner" enter>
										<Bubble>Greit. Bra jobba.</Bubble>
									</Turn>,
								)
							}}
						>
							Nei
						</Chip>
					</Chips>
				</form>
			)}
		</Turn>
	)
}

function AddFlow({ data }: { data: ThreadData | null }) {
	const ask = useAsk()
	const { push } = useConvo()
	const res = useResult()
	const today = data?.athlete.today ?? ''
	const [text, setText] = useState('')
	const [date, setDate] = useState(today)
	const [already, setAlready] = useState(false)
	const [done, setDone] = useState(false)
	const days: PickDay[] = [-2, -1, 0, 1, 2, 3, 4].map((i) => ({
		date: addDays(today, i),
		label: i === 0 ? 'i dag' : undefined,
	}))
	return (
		<Turn who="partner" enter>
			<Bubble>
				Hva vil du legge til? Skriv det som «45 min rolig», «4x8 min terskel»
				eller «3x10 knebøy 60 kg».
			</Bubble>
			{done ? null : (
				<form
					className="prat-card"
					onSubmit={(e) => {
						e.preventDefault()
						if (!text.trim()) return
						setDone(true)
						push(
							<Mine fly>
								{text.trim()}, {relDay(date, today)}
								{already ? ' (gjort)' : ''}
							</Mine>,
						)
						void ask<AddSessionOutput>('add_session', {
							date,
							sentence: text.trim(),
							...(already && date <= today ? { alreadyDone: true } : {}),
						}).then((x) => {
							if (!x.ok) {
								res.fail(x.message)
								if (x.code === 'not-understood') push(<AddFlow data={data} />)
								return
							}
							const s = x.value.changed[0]
							res.change(
								[
									<>
										Lagt til {relDay(date, today)}
										{s?.title ? (
											<>
												: <b>{s.title}</b>
											</>
										) : (
											''
										)}
										{s?.minutes ? `, ${minutesText(s.minutes)}` : ''}. Den er
										din, så planen endrer den aldri uten å spørre.
									</>,
									...(x.value.notDoneBecause ? [x.value.notDoneBecause] : []),
								],
								{
									text: `Ny økt ${relDay(date, today)}`,
									detail: s?.title ?? text.trim(),
									token: x.value.undo,
									noUndo: x.value.noUndoBecause,
								},
							)
						})
					}}
				>
					<input
						className="prat-input"
						value={text}
						onChange={(e) => setText(e.target.value)}
						placeholder="45 min rolig"
						aria-label="Økta med dine ord"
						autoCapitalize="off"
					/>
					<DayPicker days={days} value={date} onPick={setDate} />
					{date <= today ? (
						<label className="prat-toggle">
							<span>Den er allerede gjort</span>
							<button
								type="button"
								role="switch"
								aria-checked={already}
								className="prat-switch"
								onClick={() => setAlready((v) => !v)}
								aria-label="Allerede gjort"
							/>
						</label>
					) : null}
					<Chips>
						<button
							type="submit"
							className="prat-chip primary"
							disabled={!text.trim()}
						>
							<span>Legg til</span>
						</button>
					</Chips>
				</form>
			)}
		</Turn>
	)
}

function ProgressFlow({ data }: { data: ThreadData | null }) {
	const call = useCall()
	const { push, typing } = useConvo()
	useOnce(() => {
		const stop = typing()
		void Promise.all([
			call<ProgressOutput>('progress', { weeks: 12 }, { revalidate: false }),
			call<PlanOutput>('plan', {}, { revalidate: false }),
		]).then(([p, plan]) => {
			stop()
			if (!p.ok) {
				push(
					<Turn who="partner" enter>
						<Bubble>{p.message}</Bubble>
					</Turn>,
				)
				return
			}
			const pl = plan.ok ? plan.value : null
			const week =
				data?.week?.sports ??
				p.value.weekly[p.value.weekly.length - 1]?.sports ??
				[]
			push(
				<Turn who="partner" enter>
					<Bubble>{formHeadline(p.value)}</Bubble>
					<FormCard p={p.value} />
				</Turn>,
			)
			push(
				<Turn who="partner" enter>
					<Bubble>Ukas mengde, per idrett, mot planen:</Bubble>
					<VolumeCard sports={week} />
					<WeeksCard p={p.value} />
				</Turn>,
			)
			push(
				<Turn who="partner" enter>
					<Bubble>{roadHeadline(p.value, pl)}</Bubble>
					<RoadCard p={p.value} plan={pl} />
				</Turn>,
			)
		})
	})
	return null
}

function TodayRecap({ data }: { data: ThreadData | null }) {
	const t = data?.today
	if (!t)
		return (
			<Turn who="partner" enter>
				<Bubble>
					{data?.todayError ?? 'Jeg fikk ikke hentet dagen i dag.'}
				</Bubble>
			</Turn>
		)
	const open = t.sessions.filter((s) => s.status === 'planned')
	return (
		<Turn who="partner" enter>
			<Bubble>
				{t.restDay
					? `I dag er hviledag.${t.next ? ` Neste: ${lower(t.next.title)} ${relDay(t.next.date, t.date)}.` : ''}`
					: open.length
						? `I dag: ${open.map((s) => `${lower(s.title)}${s.planned.durationS.value ? `, ${dur(s.planned.durationS.value)}` : ''}`).join(' og ')}. Den står lenger opp i tråden.`
						: 'Alt for i dag er gjort.'}
			</Bubble>
		</Turn>
	)
}

function UndoLatest() {
	const { changes } = useConvo()
	const last = [...changes].reverse().find((c) => c.token && !c.undone)
	if (!last)
		return (
			<Turn who="partner" enter>
				<Bubble>Det er ingenting jeg kan angre de siste sju dagene.</Bubble>
			</Turn>
		)
	return (
		<Turn who="partner" enter>
			<Bubble>Den siste endringen var denne. Angre den?</Bubble>
			<LiveChange id={last.id} />
		</Turn>
	)
}

function SyncFlow() {
	const ask = useAsk()
	const res = useResult()
	const { push } = useConvo()
	useOnce(() => {
		void ask<SyncOutput>('sync_sources', {}).then((x) => {
			if (!x.ok) return res.fail(x.message)
			push(
				<Turn who="partner" enter>
					<Bubble>
						{x.value.imported
							? `Hentet ${x.value.imported} ${x.value.imported === 1 ? 'ny økt' : 'nye økter'}.`
							: 'Ingen nye økter.'}
						{x.value.failed.map((f) => ` ${f.message}`).join('')}
					</Bubble>
				</Turn>,
			)
		})
	})
	return null
}
