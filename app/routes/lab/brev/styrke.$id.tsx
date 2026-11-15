import { useState } from 'react'
import { Link } from 'react-router'
import {
	type SessionCard,
	type SessionOutput,
} from '#app/lab/engine/reads.types.ts'
import { runCapability } from '#app/lab/engine/registry.server.ts'
import {
	type FinishStrengthSessionOutput,
	type LiftResult,
	type LogStrengthAsPlannedOutput,
	type LogStrengthSetInput,
	type LogStrengthSetOutput,
	type RemoveStrengthSetOutput,
	type StrengthExercise,
	type StrengthLoad,
	type StrengthSessionOutput,
	type StrengthSet,
} from '#app/lab/engine/sessions.types.ts'
import { type Route } from './+types/styrke.$id.ts'
import { Feeling } from './__lapp.tsx'
import { BASE, DAY_NAME, cap, mondayOf, n1, weekdayOf } from './__lib.ts'
import { addPs } from './__ps.ts'
import { ErrorLine, N, useWrite } from './__ui.tsx'

export async function loader({ request, params }: Route.LoaderArgs) {
	const [log, session, athlete] = await Promise.all([
		runCapability(request, 'strength_session', { sessionId: params.id }),
		runCapability(request, 'session', { sessionId: params.id }),
		runCapability(request, 'athlete', {}),
	])
	return {
		log: log.ok ? (log.value as StrengthSessionOutput) : null,
		session: session.ok ? (session.value as SessionOutput) : null,
		today: athlete.ok ? athlete.value.today : null,
		error: log.ok ? null : log.message,
	}
}

export const meta = () => [{ title: 'Brev · treningsdagboka' }]

function loadText(l: StrengthLoad | null | undefined) {
	if (!l) return null
	switch (l.kind) {
		case 'kg':
			return `${n1(l.kg)} kg`
		case 'kg-per-hand':
			return `${n1(l.kg)} kg per hånd`
		case 'bodyweight':
			return 'kroppsvekt'
		case 'bodyweight-plus':
			return `kroppsvekt + ${n1(l.kg)} kg`
		case 'assisted':
			return `${n1(l.kg)} kg hjelp`
		case 'machine-level':
			return `nivå ${l.level}`
		case 'band':
			return `strikk ${l.band}`
		default:
			return 'uten vekt'
	}
}

function kgOf(l: StrengthLoad | null | undefined) {
	if (!l) return null
	return 'kg' in l ? l.kg : null
}

export default function Styrke({ loaderData }: Route.ComponentProps) {
	const { log, session, error, today } = loaderData
	const [started, setStarted] = useState(false)
	const start = useWrite('start_strength_session')
	const finish = useWrite<
		{ sessionId: string; unloggedSets?: 'not-done' },
		FinishStrengthSessionOutput
	>('finish_strength_session')
	const asPlanned = useWrite<{ sessionId: string }, LogStrengthAsPlannedOutput>(
		'log_strength_as_planned',
	)
	const [ask, setAsk] = useState<string | null>(null)
	const [lifts, setLifts] = useState<LiftResult[] | null>(null)

	if (!log) {
		return (
			<main className="b-col">
				<Link to={BASE} className="b-back">
					← Ukas brev
				</Link>
				<div className="b-sheet">
					<p className="b-p">Treningsdagboka kunne ikke åpnes.</p>
					<ErrorLine message={error} />
				</div>
			</main>
		)
	}

	const s = log.session
	const isDone = s.state === 'done'
	const notYet = today !== null && s.date > today

	async function ensureStarted() {
		if (started || log!.loggedWorkingSets > 0) return
		setStarted(true)
		await start.call({ sessionId: s.id }, { revalidate: false })
	}

	async function onFinish(notDone?: boolean) {
		const r = await finish.call({
			sessionId: s.id,
			...(notDone ? { unloggedSets: 'not-done' as const } : {}),
		})
		if (!r.ok && r.code === 'unlogged-sets') {
			finish.setError(null)
			setAsk(r.message)
			return
		}
		if (r.ok) {
			setAsk(null)
			setLifts(r.value.lifts)
			addPs({
				weekKey: mondayOf(s.date),
				text: `Styrkeøkta ${DAY_NAME[weekdayOf(s.date)]} er ført i dagboka.`,
				token: r.value.undo,
				noUndoBecause: r.value.noUndoBecause,
			})
		}
	}

	return (
		<main className="b-col">
			<Link to={`${BASE}/dag/${s.date}`} className="b-back">
				← {cap(DAY_NAME[weekdayOf(s.date)])}ens lapp
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
					Treningsdagboka
				</p>
				<h1 className="b-h" style={{ margin: '4px 0 6px' }}>
					{s.title ?? 'Styrke'}
				</h1>
				<p className="b-small" style={{ marginTop: 0 }}>
					{cap(DAY_NAME[weekdayOf(s.date)])}
					{log.program ? ` · ${log.program.name}` : ''}
					{log.bodyweightKg ? ` · kroppsvekt ${n1(log.bodyweightKg)} kg` : ''}
					{' · '}
					<N>
						{log.loggedWorkingSets} av{' '}
						{log.loggedWorkingSets + log.unloggedWorkingSets}
					</N>{' '}
					sett ført
				</p>
				{notYet ? (
					<p className="b-margin">
						Økta er ikke før {DAY_NAME[weekdayOf(s.date)]}. Du kan se på den,
						men ikke føre den ennå.
					</p>
				) : !log.hasGymOnFile ? (
					<p className="b-small" style={{ fontStyle: 'italic' }}>
						Jeg vet ikke hvilke skiver du har, så jeg regner ikke ut stanga for
						deg.
					</p>
				) : null}

				{log.exercises.length === 0 ? (
					<p className="b-p">Økta har ingen øvelser å føre.</p>
				) : (
					log.exercises.map((ex) => (
						<ExerciseBlock
							key={ex.stepId}
							ex={ex}
							sessionId={s.id}
							disabled={notYet || isDone}
							beforeLog={ensureStarted}
						/>
					))
				)}

				<hr className="b-rule" />
				{lifts ? (
					<div className="b-fade-in" aria-live="polite">
						<p className="b-p">Ført. {lifts.length ? 'Neste gang:' : ''}</p>
						<ul className="b-ps">
							{lifts.map((l) => (
								<li key={l.exerciseId}>
									<strong style={{ fontWeight: 600 }}>{l.name}:</strong>{' '}
									{l.result === 'goes-up'
										? 'opp til '
										: l.result === 'goes-down'
											? 'ned til '
											: 'blir på '}
									<N>{n1(l.nextKg)} kg</N>.{' '}
									<span style={{ color: 'var(--ink-2)' }}>{l.reason}</span>
								</li>
							))}
						</ul>
					</div>
				) : isDone ? (
					<p className="b-p b-ok">Økta er ført.</p>
				) : notYet ? null : (
					<>
						{ask ? (
							<div
								className="b-margin b-fade-in"
								style={{ fontStyle: 'normal' }}
							>
								<p style={{ margin: '0 0 8px' }}>{ask}</p>
								<div className="b-row">
									<button
										type="button"
										className="b-btn b-btn-ghost"
										onClick={() => setAsk(null)}
									>
										Før dem
									</button>
									<button
										type="button"
										className="b-btn"
										disabled={finish.pending}
										onClick={() => void onFinish(true)}
									>
										Avslutt, regn dem som ikke gjort
									</button>
								</div>
							</div>
						) : (
							<div className="b-row">
								<button
									type="button"
									className="b-btn"
									disabled={finish.pending}
									onClick={() => void onFinish()}
								>
									{finish.pending ? 'Fører …' : 'Ferdig'}
								</button>
								{log.loggedWorkingSets === 0 ? (
									<button
										type="button"
										className="b-btn b-btn-ghost"
										disabled={asPlanned.pending}
										onClick={async () => {
											const r = await asPlanned.call({ sessionId: s.id })
											if (r.ok) {
												setLifts(r.value.lifts)
												addPs({
													weekKey: mondayOf(s.date),
													text: `Styrkeøkta ${DAY_NAME[weekdayOf(s.date)]} ført som planlagt (${r.value.loggedSets} sett).`,
													token: r.value.undo,
													noUndoBecause: r.value.noUndoBecause,
												})
											}
										}}
									>
										Alt gikk som planlagt
									</button>
								) : null}
							</div>
						)}
						<ErrorLine
							message={finish.error ?? asPlanned.error ?? start.error}
						/>
					</>
				)}
			</article>
			{session && (isDone || lifts) ? (
				<Feeling card={session as SessionCard} detail={session} />
			) : null}
		</main>
	)
}

function ExerciseBlock({
	ex,
	sessionId,
	disabled,
	beforeLog,
}: {
	ex: StrengthExercise
	sessionId: string
	disabled: boolean
	beforeLog: () => Promise<void>
}) {
	const warm = ex.sets.filter((x) => x.warmup)
	const work = ex.sets.filter((x) => !x.warmup)
	const [showWarm, setShowWarm] = useState(false)
	return (
		<section style={{ marginTop: 22 }} aria-label={ex.name}>
			<h2
				style={{
					fontSize: 20,
					lineHeight: '26px',
					fontWeight: 600,
					margin: '0 0 2px',
					overflowWrap: 'anywhere',
				}}
			>
				{ex.name}
			</h2>
			<p className="b-small" style={{ margin: '0 0 6px' }}>
				{ex.restSeconds
					? `${Math.round(ex.restSeconds / 60) || 1} min pause`
					: ''}
				{ex.oneSideAtATime ? ' · én side om gangen' : ''}
				{ex.defaultLoad === null && ex.defaultLoadUnknownBecause
					? ` · ${ex.defaultLoadUnknownBecause}`
					: ''}
			</p>
			{warm.length ? (
				<button
					type="button"
					className="b-word"
					style={{ fontSize: 15, color: 'var(--pencil)' }}
					onClick={() => setShowWarm((v) => !v)}
					aria-expanded={showWarm}
				>
					{showWarm ? 'Skjul oppvarming' : `${warm.length} oppvarmingssett`}
				</button>
			) : ex.noWarmupBecause ? (
				<p className="b-small" style={{ fontStyle: 'italic', margin: 0 }}>
					{ex.noWarmupBecause}
				</p>
			) : null}
			<ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
				{(showWarm ? warm : []).map((set) => (
					<SetRow
						key={set.setIndex}
						set={set}
						ex={ex}
						sessionId={sessionId}
						disabled={disabled}
						beforeLog={beforeLog}
					/>
				))}
				{work.map((set, i) => (
					<SetRow
						key={set.setIndex}
						n={i + 1}
						set={set}
						ex={ex}
						sessionId={sessionId}
						disabled={disabled}
						beforeLog={beforeLog}
					/>
				))}
			</ol>
		</section>
	)
}

function SetRow({
	set,
	ex,
	sessionId,
	n,
	disabled,
	beforeLog,
}: {
	set: StrengthSet
	ex: StrengthExercise
	sessionId: string
	n?: number
	disabled: boolean
	beforeLog: () => Promise<void>
}) {
	const loadKind =
		set.logged?.load?.kind ??
		ex.defaultLoad?.kind ??
		(set.prescribed.kg !== null ? 'kg' : null)
	const seconds = set.prescribed.seconds
	const isBodyweight =
		loadKind === 'bodyweight' ||
		(loadKind === null && set.prescribed.load?.kind === 'bodyweight')
	const takesKg =
		loadKind === 'kg' ||
		loadKind === 'kg-per-hand' ||
		loadKind === 'bodyweight-plus' ||
		loadKind === 'assisted' ||
		(loadKind === null && !isBodyweight && !seconds)
	const initialKg =
		kgOf(set.logged?.load) ??
		set.prescribed.kg ??
		kgOf(set.lastTime?.load) ??
		kgOf(ex.defaultLoad) ??
		null
	const initialReps =
		set.logged?.reps ?? set.prescribed.reps ?? set.lastTime?.reps ?? null
	const [kg, setKg] = useState<number | null>(initialKg)
	const [reps, setReps] = useState<number | null>(initialReps)
	const logSet = useWrite<LogStrengthSetInput, LogStrengthSetOutput>(
		'log_strength_set',
	)
	const remove = useWrite<
		{ sessionId: string; stepId: string; setIndex: number },
		RemoveStrengthSetOutput
	>('remove_strength_set')
	const [record, setRecord] = useState<string | null>(null)
	const logged = !!set.logged && set.logged.done
	const abandoned = !!set.logged && !set.logged.done
	const needsKg = takesKg && kg === null

	async function tick() {
		if (logged) {
			await remove.call({
				sessionId,
				stepId: ex.stepId,
				setIndex: set.setIndex,
			})
			return
		}
		await beforeLog()
		let load: StrengthLoad | undefined
		if (takesKg && kg !== null) {
			const kind = (loadKind ?? 'kg') as
				| 'kg'
				| 'kg-per-hand'
				| 'bodyweight-plus'
				| 'assisted'
			load = { kind, kg }
		} else if (isBodyweight) load = { kind: 'bodyweight' }
		const r = await logSet.call({
			sessionId,
			stepId: ex.stepId,
			setIndex: set.setIndex,
			...(seconds ? { seconds } : { reps: reps ?? undefined }),
			...(load ? { load } : {}),
		})
		if (r.ok && r.value.records.length) {
			const rec = r.value.records[0]!
			setRecord(
				`Ny rekord: ${rec.kind === 'estimated-1rm' ? 'beregnet 1RM' : rec.kind === 'heaviest' ? 'tyngste' : 'flest reps'} ${n1(rec.value)} ${rec.unit === 'kg' ? 'kg' : ''}${rec.previous !== null ? ` (før ${n1(rec.previous)})` : ''}.`,
			)
		}
	}

	const step = (d: number) =>
		setKg((v) => Math.max(0, Math.round(((v ?? 17.5) + d) * 4) / 4))
	const pending = logSet.pending || remove.pending
	return (
		<li
			style={{
				display: 'grid',
				gridTemplateColumns: '48px minmax(0, 1fr)',
				gap: 10,
				alignItems: 'center',
				padding: '8px 0',
				borderTop: '1px solid var(--rule)',
				color: set.warmup ? 'var(--ink-2)' : undefined,
			}}
		>
			<button
				type="button"
				onClick={() => void tick()}
				disabled={disabled || pending || (needsKg && !logged)}
				aria-pressed={logged}
				aria-label={
					logged
						? `Sett ${n ?? ''} ført. Trykk for å stryke.`
						: `Før sett ${n ?? ''}`
				}
				style={{
					width: 44,
					height: 44,
					borderRadius: 2,
					border: `1.5px solid ${logged ? 'var(--green)' : 'var(--ink-2)'}`,
					background: logged ? 'var(--green)' : 'transparent',
					color: 'var(--paper)',
					fontSize: 22,
					lineHeight: 1,
					cursor: 'pointer',
					transition:
						'background-color 120ms ease, transform 120ms cubic-bezier(0.23, 1, 0.32, 1)',
				}}
				className="b-tick"
			>
				{logged ? '✓' : pending ? '…' : ''}
			</button>
			<div style={{ minWidth: 0 }}>
				<div
					style={{
						display: 'flex',
						flexWrap: 'wrap',
						alignItems: 'center',
						gap: '4px 10px',
					}}
				>
					<span className="b-small" style={{ minWidth: '3.5em' }}>
						{set.warmup ? 'oppv.' : `sett ${n}`}
					</span>
					<span
						className="b-num"
						style={{
							fontSize: 17,
							textDecoration: abandoned ? 'line-through' : undefined,
							whiteSpace: 'normal',
							display: 'inline-flex',
							flexWrap: 'wrap',
							alignItems: 'center',
							gap: '4px 8px',
						}}
					>
						{seconds ? (
							`${seconds} s`
						) : (
							<Stepper
								value={reps}
								onChange={setReps}
								disabled={logged || disabled}
								label="repetisjoner"
								suffix=" ×"
							/>
						)}
						{takesKg ? (
							<>
								{' '}
								<Stepper
									value={kg}
									onChange={(v) => setKg(v)}
									step={(d) => step(d * 2.5)}
									disabled={logged || disabled}
									label="kilo"
									suffix=" kg"
									placeholder="? kg"
								/>
							</>
						) : isBodyweight ? (
							<span> kroppsvekt</span>
						) : loadKind ? (
							<span> {loadText(set.logged?.load ?? ex.defaultLoad)}</span>
						) : set.prescribed.load?.kind === 'reference' ||
						  set.prescribed.load?.kind === 'other' ? (
							<span> {set.prescribed.load.text}</span>
						) : null}
					</span>
				</div>
				{set.prescribed.kg === null &&
				set.prescribed.kgUnknownBecause &&
				!logged ? (
					<p
						className="b-small"
						style={{ margin: '2px 0 0', fontStyle: 'italic' }}
					>
						{set.prescribed.kgUnknownBecause}
						{set.prescribed.kgFix ? ` ${set.prescribed.kgFix}` : ''}
					</p>
				) : null}
				{set.lastTime && !logged ? (
					<p className="b-small" style={{ margin: '2px 0 0' }}>
						Forrige gang: {set.lastTime.reps ?? '–'} ×{' '}
						{loadText(set.lastTime.load)}
					</p>
				) : null}
				{set.plates && !logged ? (
					<p className="b-small" style={{ margin: '2px 0 0' }}>
						Per side: <N>{set.plates.perSide.map((p) => n1(p)).join(' + ')}</N>{' '}
						på {n1(set.plates.barKg)} kg stang
						{!set.plates.exact && set.plates.madeKg !== null
							? ` (blir ${n1(set.plates.madeKg)} kg)`
							: ''}
					</p>
				) : null}
				{record ? (
					<p className="b-small b-hit b-fade-in" style={{ margin: '2px 0 0' }}>
						{record}
					</p>
				) : null}
				<ErrorLine message={logSet.error ?? remove.error} />
			</div>
		</li>
	)
}

function Stepper({
	value,
	onChange,
	step,
	disabled,
	label,
	suffix,
	placeholder,
}: {
	value: number | null
	onChange: (v: number) => void
	step?: (d: number) => void
	disabled?: boolean
	label: string
	suffix: string
	placeholder?: string
}) {
	const btn = {
		width: 44,
		height: 44,
		border: '1px solid var(--rule)',
		borderRadius: 2,
		background: 'transparent',
		color: 'var(--ink)',
		fontSize: 18,
		lineHeight: 1,
		cursor: 'pointer',
	} as const
	if (disabled)
		return (
			<span>
				{value !== null ? n1(value) : (placeholder ?? '?')}
				{value !== null ? suffix : ''}
			</span>
		)
	return (
		<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
			<button
				type="button"
				style={btn}
				aria-label={`Færre ${label}`}
				onClick={() =>
					step ? step(-1) : onChange(Math.max(0, (value ?? 1) - 1))
				}
			>
				−
			</button>
			<span
				aria-live="polite"
				style={{ minWidth: '3.2ch', textAlign: 'center' }}
			>
				{value !== null ? n1(value) : '?'}
				{suffix}
			</span>
			<button
				type="button"
				style={btn}
				aria-label={`Flere ${label}`}
				onClick={() => (step ? step(1) : onChange((value ?? 0) + 1))}
			>
				+
			</button>
		</span>
	)
}
