import { useState } from 'react'
import { useLoaderData, useNavigate } from 'react-router'
import {
	type FinishStrengthSessionOutput,
	type LogStrengthAsPlannedOutput,
	type LogStrengthSetOutput,
	type RemoveStrengthSetOutput,
	type StrengthExercise,
	type StrengthLoad,
	type StrengthSessionOutput,
	type StrengthSet,
} from '#app/lab/engine/sessions.types.ts'
import { type Route } from './+types/styrke.$id.ts'
import { useCall, useConvo } from './__convo.tsx'
import { run } from './__data.server.ts'
import { FeelingFlow, LiftsSummary, LiveChange } from './__flows.tsx'
import { cap, longDate, num1 } from './__fmt.ts'
import { IconCheck } from './__icons.tsx'
import { FocusCard } from './__overlay.tsx'
import { Bubble, Chip, Chips, Turn } from './__ui.tsx'

export async function loader({ request, params }: Route.LoaderArgs) {
	const r = await run<StrengthSessionOutput>(request, 'strength_session', {
		sessionId: params.id,
	})
	return r.ok
		? { data: r.value, error: null }
		: { data: null, error: r.message }
}

export default function StrengthFocus() {
	const { data, error } = useLoaderData<typeof loader>()
	if (!data)
		return (
			<FocusCard title="Styrke">
				<p>{error ?? 'Fant ikke økta.'}</p>
			</FocusCard>
		)
	return (
		<FocusCard title={data.session.title ?? 'Styrke'}>
			<Logger initial={data} />
		</FocusCard>
	)
}

function loadText(l: StrengthLoad | null) {
	if (!l) return null
	switch (l.kind) {
		case 'kg':
			return `${num1(l.kg)} kg`
		case 'kg-per-hand':
			return `${num1(l.kg)} kg per hånd`
		case 'bodyweight':
			return 'kroppsvekt'
		case 'bodyweight-plus':
			return `kroppsvekt + ${num1(l.kg)} kg`
		case 'assisted':
			return `${num1(l.kg)} kg hjelp`
		case 'machine-level':
			return l.label ?? `nivå ${l.level}`
		case 'band':
			return `strikk ${l.band}`
		case 'none':
			return 'uten vekt'
	}
}

/** Whether a set's weight is typed in kilos. */
function kgKind(ex: StrengthExercise, set: StrengthSet) {
	const l = set.logged?.load ?? ex.defaultLoad
	if (l)
		return (
			l.kind === 'kg' ||
			l.kind === 'kg-per-hand' ||
			l.kind === 'bodyweight-plus'
		)
	const p = set.prescribed.load
	return !p || p.kind === 'kg' || p.kind === 'reference'
}

function Logger({ initial }: { initial: StrengthSessionOutput }) {
	const call = useCall()
	const navigate = useNavigate()
	const { push, addChange } = useConvo()
	const [d, setD] = useState(initial)
	const [busy, setBusy] = useState<string | null>(null)
	const [msg, setMsg] = useState<string | null>(null)
	const [askUnlogged, setAskUnlogged] = useState<string | null>(null)
	const [started, setStarted] = useState(initial.loggedWorkingSets > 0)
	const s = d.session
	const allSets = d.exercises.flatMap((e) => e.sets.filter((x) => !x.warmup))
	const ref = {
		id: s.id,
		title: s.title ?? 'Styrke',
		date: s.date,
		sport: 'strength',
		seconds: null,
		status: s.state,
	}

	const updateSet = (
		stepId: string,
		set: StrengthSet | null,
		setIndex: number,
	) =>
		setD((cur) => {
			const exercises = cur.exercises.map((e) =>
				e.stepId !== stepId
					? e
					: {
							...e,
							sets: e.sets.map((x) =>
								x.setIndex === setIndex ? (set ?? { ...x, logged: null }) : x,
							),
						},
			)
			const working = exercises.flatMap((e) => e.sets.filter((x) => !x.warmup))
			return {
				...cur,
				exercises,
				loggedWorkingSets: working.filter((x) => x.logged).length,
				unloggedWorkingSets: working.filter((x) => !x.logged).length,
			}
		})

	const start = async () => {
		setBusy('start')
		const r = await call<StrengthSessionOutput>(
			'start_strength_session',
			{ sessionId: s.id },
			{ revalidate: false },
		)
		setBusy(null)
		if (r.ok) {
			setD(r.value)
			setStarted(true)
		} else setMsg(r.message)
	}

	const finish = async (notDone?: boolean) => {
		setBusy('finish')
		setMsg(null)
		const r = await call<FinishStrengthSessionOutput>(
			'finish_strength_session',
			{
				sessionId: s.id,
				...(notDone ? { unloggedSets: 'not-done' } : {}),
			},
		)
		setBusy(null)
		if (!r.ok) {
			if (r.code === 'unlogged-sets') setAskUnlogged(r.message)
			else setMsg(r.message)
			return
		}
		const id = addChange({
			text: `${ref.title}: ferdig`,
			token: r.value.undo,
			noUndo: r.value.noUndoBecause,
		})
		push(
			<Turn who="partner" enter>
				<Bubble>
					Styrkeøkta er ført:{' '}
					<b className="num">{allSets.filter((x) => x.logged).length}</b> sett.
					{r.value.alreadyFinished ? ' Den var allerede avsluttet.' : ''}
				</Bubble>
				<LiftsSummary out={r.value} />
				<LiveChange id={id} />
			</Turn>,
		)
		push(<FeelingFlow r={ref} />)
		void navigate('/lab/prat', { preventScrollReset: true })
	}

	const asPlanned = async () => {
		setBusy('plan')
		setMsg(null)
		const r = await call<LogStrengthAsPlannedOutput>(
			'log_strength_as_planned',
			{ sessionId: s.id },
		)
		setBusy(null)
		if (!r.ok) return setMsg(r.message)
		const id = addChange({
			text: `${ref.title}: ført som planlagt`,
			token: r.value.undo,
			noUndo: r.value.noUndoBecause,
		})
		push(
			<Turn who="partner" enter>
				<Bubble>
					Ført som planlagt: <b className="num">{r.value.loggedSets}</b> sett.
				</Bubble>
				<LiveChange id={id} />
			</Turn>,
		)
		push(<FeelingFlow r={ref} />)
		void navigate('/lab/prat', { preventScrollReset: true })
	}

	return (
		<>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
				<span className="prat-card-sub">
					{cap(longDate(s.date))}
					{d.program ? ` · ${d.program.name}` : ''}
				</span>
				<span className="num" style={{ fontSize: 15 }}>
					<b>{allSets.filter((x) => x.logged).length}</b> av {allSets.length}{' '}
					sett ført
				</span>
				{!d.hasGymOnFile ? (
					<span className="prat-note">
						Jeg vet ikke hvilke skiver du har, så jeg viser ikke skiver per
						side.
					</span>
				) : null}
			</div>
			{!started && s.state !== 'done' ? (
				<Chips>
					<Chip primary busy={busy === 'start'} onClick={() => void start()}>
						Start økta nå
					</Chip>
					<Chip busy={busy === 'plan'} onClick={() => void asPlanned()}>
						Alt gikk som planlagt
					</Chip>
				</Chips>
			) : null}
			{d.exercises.map((ex) => (
				<ExerciseCard
					key={ex.stepId}
					ex={ex}
					sessionId={s.id}
					onSet={(set, idx) => updateSet(ex.stepId, set, idx)}
					onMessage={setMsg}
				/>
			))}
			{!d.exercises.length ? <p>Økta har ingen øvelser å føre.</p> : null}
			{msg ? (
				<p className="prat-err" style={{ margin: 0 }}>
					{msg}
				</p>
			) : null}
			{askUnlogged ? (
				<div className="prat-card">
					<span>
						{askUnlogged} Før dem, eller avslutt og regn dem som ikke gjort?
					</span>
					<Chips>
						<Chip onClick={() => setAskUnlogged(null)}>Før dem</Chip>
						<Chip
							primary
							busy={busy === 'finish'}
							onClick={() => void finish(true)}
						>
							Avslutt
						</Chip>
					</Chips>
				</div>
			) : null}
			<Chips>
				<Chip primary busy={busy === 'finish'} onClick={() => void finish()}>
					Ferdig
				</Chip>
			</Chips>
		</>
	)
}

function ExerciseCard({
	ex,
	sessionId,
	onSet,
	onMessage,
}: {
	ex: StrengthExercise
	sessionId: string
	onSet: (set: StrengthSet | null, setIndex: number) => void
	onMessage: (m: string | null) => void
}) {
	return (
		<div className="prat-card prat-ex">
			<div
				className="prat-card-row"
				style={{ justifyContent: 'space-between', alignItems: 'baseline' }}
			>
				<span className="prat-card-title">{ex.name}</span>
				{ex.restSeconds ? (
					<span className="prat-note num">
						pause{' '}
						{ex.restSeconds < 60
							? `${ex.restSeconds} s`
							: `${num1(ex.restSeconds / 60)} min`}
					</span>
				) : null}
			</div>
			{ex.oneSideAtATime ? (
				<span className="prat-note">
					Én side om gangen: repetisjoner per side.
				</span>
			) : null}
			{ex.defaultLoad === null && ex.defaultLoadUnknownBecause ? (
				<span className="prat-unknown">{ex.defaultLoadUnknownBecause}</span>
			) : null}
			<div className="prat-set" style={{ fontSize: 12, color: 'var(--muted)' }}>
				<span className="idx">Sett</span>
				<span style={{ textAlign: 'center' }}>Reps</span>
				<span style={{ textAlign: 'center' }}>Kg</span>
				<span />
			</div>
			{ex.sets.map((set, i) => (
				<SetRow
					key={set.setIndex}
					ex={ex}
					set={set}
					n={
						set.warmup
							? 'O'
							: String(ex.sets.filter((x, j) => !x.warmup && j <= i).length)
					}
					sessionId={sessionId}
					onSet={onSet}
					onMessage={onMessage}
				/>
			))}
			{ex.noWarmupBecause ? (
				<span className="prat-note">{ex.noWarmupBecause}</span>
			) : null}
		</div>
	)
}

function SetRow({
	ex,
	set,
	n,
	sessionId,
	onSet,
	onMessage,
}: {
	ex: StrengthExercise
	set: StrengthSet
	n: string
	sessionId: string
	onSet: (set: StrengthSet | null, setIndex: number) => void
	onMessage: (m: string | null) => void
}) {
	const call = useCall()
	const usesKg = kgKind(ex, set)
	const loggedKg =
		set.logged?.load && 'kg' in set.logged.load ? set.logged.load.kg : null
	const [reps, setReps] = useState(
		String(
			set.logged?.reps ?? set.prescribed.reps ?? set.prescribed.seconds ?? '',
		),
	)
	const [kg, setKg] = useState(
		loggedKg !== null
			? String(loggedKg)
			: set.prescribed.kg !== null
				? String(set.prescribed.kg)
				: '',
	)
	const [busy, setBusy] = useState(false)
	const done = !!set.logged?.done
	const timed = set.prescribed.seconds !== null && set.prescribed.reps === null

	const toggle = async () => {
		setBusy(true)
		onMessage(null)
		if (set.logged) {
			const r = await call<RemoveStrengthSetOutput>(
				'remove_strength_set',
				{ sessionId, stepId: ex.stepId, setIndex: set.setIndex },
				{ revalidate: false },
			)
			setBusy(false)
			if (!r.ok) return onMessage(r.message)
			onSet(null, set.setIndex)
			return
		}
		const k = Number(kg.replace(',', '.'))
		const count = Number(reps)
		const load: StrengthLoad | undefined =
			usesKg && kg && k > 0
				? ex.defaultLoad?.kind === 'kg-per-hand'
					? { kind: 'kg-per-hand', kg: k }
					: ex.defaultLoad?.kind === 'bodyweight-plus'
						? { kind: 'bodyweight-plus', kg: k }
						: { kind: 'kg', kg: k }
				: undefined
		const r = await call<LogStrengthSetOutput>(
			'log_strength_set',
			{
				sessionId,
				stepId: ex.stepId,
				setIndex: set.setIndex,
				...(reps && count >= 0
					? timed
						? { seconds: count }
						: { reps: count }
					: {}),
				...(load ? { load } : {}),
			},
			{ revalidate: false },
		)
		setBusy(false)
		if (!r.ok) return onMessage(r.message)
		onSet(r.value.set, set.setIndex)
		if (r.value.records.length)
			onMessage(
				`Ny rekord på ${ex.name}: ${r.value.records.map((x) => `${num1(x.value)} ${x.unit === 'kg' ? 'kg' : 'nivå'}${x.reps ? ` × ${x.reps}` : ''}`).join(', ')}.`,
			)
	}

	const plates = set.plates
	const hint = [
		set.lastTime
			? `Sist: ${set.lastTime.reps ?? set.lastTime.seconds ?? '–'}${set.lastTime.seconds && !set.lastTime.reps ? ' s' : ''} × ${loadText(set.lastTime.load)}`
			: null,
		plates && plates.perSide.length
			? `Skiver per side: ${plates.perSide.join(' + ')} (stang ${plates.barKg} kg)${plates.exact ? '' : `, blir ${plates.madeKg} kg`}`
			: null,
		set.prescribed.kg === null && set.prescribed.kgUnknownBecause
			? `${set.prescribed.kgUnknownBecause}${set.prescribed.kgFix ? ` ${set.prescribed.kgFix}` : ''}`
			: null,
		set.prescribed.load?.kind === 'reference' ? set.prescribed.load.text : null,
	].filter(Boolean)

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
			<div
				className={`prat-set${set.warmup ? 'warm' : ''}${done ? 'done' : ''}`}
			>
				<span className="idx num" title={set.warmup ? 'Oppvarming' : undefined}>
					{n}
				</span>
				<input
					inputMode="numeric"
					value={reps}
					onChange={(e) => setReps(e.target.value.replace(/[^0-9]/g, ''))}
					aria-label={`${timed ? 'Sekunder' : 'Repetisjoner'}, sett ${n}`}
					disabled={done}
					className="num"
				/>
				{usesKg ? (
					<input
						inputMode="decimal"
						value={kg}
						onChange={(e) => setKg(e.target.value.replace(/[^0-9.,]/g, ''))}
						aria-label={`Kilo, sett ${n}`}
						placeholder="kg"
						disabled={done}
						className="num"
					/>
				) : (
					<span className="prat-note" style={{ textAlign: 'center' }}>
						{loadText(set.logged?.load ?? ex.defaultLoad) ?? '–'}
					</span>
				)}
				<button
					type="button"
					className="prat-check"
					aria-pressed={done}
					aria-label={done ? `Angre sett ${n}` : `Sett ${n} gjort`}
					disabled={busy}
					onClick={() => void toggle()}
				>
					<IconCheck />
				</button>
			</div>
			{hint.length ? (
				<span className="prat-note" style={{ paddingLeft: 42, fontSize: 13 }}>
					{hint.join(' · ')}
				</span>
			) : null}
		</div>
	)
}
