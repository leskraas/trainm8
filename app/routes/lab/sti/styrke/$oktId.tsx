import { useState } from 'react'
import { Link } from 'react-router'
import { useCapability } from '#app/lab/engine/client.ts'
import { runCapability } from '#app/lab/engine/registry.server.ts'
import {
	type FinishStrengthSessionInput,
	type FinishStrengthSessionOutput,
	type LiftResult,
	type LogStrengthAsPlannedInput,
	type LogStrengthAsPlannedOutput,
	type LogStrengthSetInput,
	type LogStrengthSetOutput,
	type RemoveStrengthSetInput,
	type RemoveStrengthSetOutput,
	type StartStrengthSessionOutput,
	type StrengthExercise,
	type StrengthLoad,
	type StrengthSet,
} from '#app/lab/engine/sessions.types.ts'
import { Feeling } from '../__feeling.tsx'
import {
	BASE,
	ErrorLine,
	Sheet,
	Spinner,
	fmtNumber,
	markChange,
	plural,
	setMerke,
} from '../__ui.tsx'
import { type Route } from './+types/$oktId.ts'

export async function loader({ request, params }: Route.LoaderArgs) {
	const r = await runCapability(request, 'strength_session', {
		sessionId: params.oktId,
	})
	const me = await runCapability(request, 'athlete', {})
	return {
		data: r.ok ? r.value : null,
		error: r.ok ? null : r.message,
		today: me.ok ? me.value.today : null,
	}
}

export const meta = () => [{ title: 'Sti · Styrkeleiren' }]

function loadText(l: StrengthLoad | null | undefined) {
	if (!l) return null
	switch (l.kind) {
		case 'kg':
			return `${fmtNumber(l.kg, 1)} kg`
		case 'kg-per-hand':
			return `${fmtNumber(l.kg, 1)} kg per hånd`
		case 'bodyweight':
			return 'kroppsvekt'
		case 'bodyweight-plus':
			return `kroppsvekt + ${fmtNumber(l.kg, 1)} kg`
		case 'assisted':
			return `${fmtNumber(l.kg, 1)} kg hjelp`
		case 'machine-level':
			return l.label ?? `nivå ${l.level}`
		case 'band':
			return `strikk ${l.band}`
		default:
			return 'uten vekt'
	}
}
function prescribedText(s: StrengthSet) {
	const p = s.prescribed
	const count =
		p.reps !== null ? `${p.reps}` : p.seconds !== null ? `${p.seconds} s` : '?'
	const kg =
		p.kg !== null
			? `${fmtNumber(p.kg, 1)} kg`
			: p.load?.kind === 'reference' || p.load?.kind === 'other'
				? p.load.text
				: p.load?.kind === 'bodyweight'
					? 'kroppsvekt'
					: null
	return kg ? `${count} × ${kg}` : count
}
function loggedText(s: StrengthSet) {
	const l = s.logged!
	const count =
		l.reps !== null ? `${l.reps}` : l.seconds !== null ? `${l.seconds} s` : '?'
	const kg = loadText(l.load)
	return kg ? `${count} × ${kg}` : count
}

export default function Styrkeleiren({ loaderData }: Route.ComponentProps) {
	const { data, error, today } = loaderData
	const start = useCapability<
		{ sessionId: string },
		StartStrengthSessionOutput
	>('start_strength_session')
	const finish = useCapability<
		FinishStrengthSessionInput,
		FinishStrengthSessionOutput
	>('finish_strength_session')
	const asPlanned = useCapability<
		LogStrengthAsPlannedInput,
		LogStrengthAsPlannedOutput
	>('log_strength_as_planned')
	const [err, setErr] = useState<string | null>(null)
	const [ask, setAsk] = useState<string | null>(null)
	const [lifts, setLifts] = useState<LiftResult[] | null>(null)
	const [open, setOpen] = useState<string | null>(null)

	if (!data) {
		return (
			<Sheet title="Styrkeleiren">
				<ErrorLine message={error ?? 'Fant ikke økta.'} />
			</Sheet>
		)
	}
	const s = data.session
	const done = s.state === 'done'
	const back = `${BASE}/steg/${s.date}?okt=${s.id}`
	const notYet = today !== null && s.date > today

	async function doFinish(notDone?: boolean) {
		setErr(null)
		const r = await finish.call({
			sessionId: s.id,
			...(notDone ? { unloggedSets: 'not-done' as const } : {}),
		})
		if (!r.ok) {
			if (r.code === 'unlogged-sets') return setAsk(r.message)
			return setErr(r.message)
		}
		setAsk(null)
		setLifts(r.value.lifts)
		markChange('Styrkesteget er fylt.', r.value, [s.id])
	}

	return (
		<Sheet
			kicker={`Styrkeleiren${data.program ? ` · ${data.program.name}` : ''}`}
			title={s.title ?? 'Styrke'}
			back={back}
		>
			<p className="num soft" style={{ fontSize: 15 }}>
				{data.loggedWorkingSets} av{' '}
				{data.loggedWorkingSets + data.unloggedWorkingSets} arbeidssett
				{data.bodyweightKg !== null
					? ` · kroppsvekt ${fmtNumber(data.bodyweightKg, 1)} kg`
					: ''}
				{!data.hasGymOnFile ? ' · ingen skivetelling (gym ikke beskrevet)' : ''}
			</p>
			{notYet ? (
				<div className="sti-fog" style={{ marginTop: 10 }}>
					Dette steget er ikke kommet ennå. Du kan se det, men logge når dagen
					kommer.
				</div>
			) : null}
			{!done && data.loggedWorkingSets === 0 && !notYet ? (
				<div
					style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}
				>
					<button
						type="button"
						className="sti-btn small"
						disabled={start.pending}
						onClick={async () => {
							const r = await start.call({ sessionId: s.id })
							setErr(r.ok ? null : r.message)
						}}
					>
						{start.pending ? <Spinner /> : null}
						Begynn
					</button>
					<button
						type="button"
						className="sti-btn quiet small"
						disabled={asPlanned.pending}
						onClick={async () => {
							setErr(null)
							const r = await asPlanned.call({ sessionId: s.id })
							if (!r.ok) return setErr(r.message)
							setLifts(r.value.lifts)
							markChange(
								`Alt logget som planlagt: ${plural(r.value.loggedSets, 'sett', 'sett')}.`,
								r.value,
								[s.id],
							)
						}}
					>
						{asPlanned.pending ? <Spinner /> : null}
						Gjorde alt som planlagt
					</button>
				</div>
			) : null}
			<p className="soft" style={{ fontSize: 13, marginTop: 12 }}>
				Trykk en rute når settet er tatt. Trykk igjen for å endre reps eller
				vekt.
			</p>
			<div style={{ display: 'grid', gap: 16, marginTop: 14 }}>
				{data.exercises.map((e) => (
					<ExerciseRow
						key={e.stepId}
						sessionId={s.id}
						e={e}
						open={open}
						setOpen={setOpen}
						locked={notYet}
					/>
				))}
				{data.exercises.length === 0 ? (
					<p className="soft">Ingen øvelser i dette steget.</p>
				) : null}
			</div>
			<ErrorLine message={err} />
			{ask ? (
				<div
					className="sti-card"
					style={{ marginTop: 16, display: 'grid', gap: 10 }}
				>
					<p>{ask}</p>
					<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
						<button
							type="button"
							className="sti-btn quiet"
							onClick={() => setAsk(null)}
						>
							Før dem
						</button>
						<button
							type="button"
							className="sti-btn"
							onClick={() => doFinish(true)}
							disabled={finish.pending}
						>
							Avslutt, regn dem som ikke gjort
						</button>
					</div>
				</div>
			) : null}
			{lifts ? (
				<section style={{ marginTop: 20 }}>
					<h2 className="caps" style={{ fontSize: 14 }}>
						Neste gang
					</h2>
					{lifts.length === 0 ? (
						<p className="soft">Ikke del av et program; vektene står.</p>
					) : null}
					{lifts.map((l) => (
						<p key={l.exerciseId} style={{ fontSize: 15, marginTop: 6 }}>
							<strong>{l.name}:</strong>{' '}
							<span className="num">{fmtNumber(l.nextKg, 1)} kg</span>{' '}
							<span className="soft">
								{l.result === 'goes-up'
									? '↑'
									: l.result === 'goes-down'
										? '↓'
										: ''}{' '}
								{l.reason}
							</span>
						</p>
					))}
				</section>
			) : null}
			{!done && !notYet ? (
				<button
					type="button"
					className="sti-btn wide"
					style={{ marginTop: 24 }}
					onClick={() => doFinish()}
					disabled={finish.pending || data.loggedWorkingSets === 0}
				>
					{finish.pending ? <Spinner /> : null}
					Ferdig
				</button>
			) : null}
			{done ? (
				<section className="sti-card" style={{ marginTop: 24 }}>
					<Feeling sessionId={s.id} rpe={s.rpe} note={s.note} />
				</section>
			) : null}
			<Link to={back} className="sti-link" style={{ marginTop: 16 }}>
				Til steget
			</Link>
		</Sheet>
	)
}

function ExerciseRow({
	sessionId,
	e,
	open,
	setOpen,
	locked,
}: {
	sessionId: string
	e: StrengthExercise
	open: string | null
	setOpen: (k: string | null) => void
	locked: boolean
}) {
	const log = useCapability<LogStrengthSetInput, LogStrengthSetOutput>(
		'log_strength_set',
	)
	const [err, setErr] = useState<string | null>(null)
	const [busy, setBusy] = useState<number | null>(null)
	const openSet =
		e.sets.find((x) => `${e.stepId}:${x.setIndex}` === open) ?? null

	async function tap(set: StrengthSet) {
		if (locked) return
		const key = `${e.stepId}:${set.setIndex}`
		if (set.logged) return setOpen(open === key ? null : key)
		setErr(null)
		setBusy(set.setIndex)
		const r = await log.call({
			sessionId,
			stepId: e.stepId,
			setIndex: set.setIndex,
		})
		setBusy(null)
		if (!r.ok) {
			if (r.code === 'needs-load' || r.code === 'no-count') return setOpen(key)
			return setErr(r.message)
		}
		if (r.value.records.length)
			setMerke({
				text: `Ny rekord i ${e.name}!`,
				token: r.value.undo,
				noUndo: null,
				kind: 'session',
				sessionIds: [],
			})
	}

	return (
		<div>
			<div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
				<strong
					style={{
						fontSize: 16,
						flex: 1,
						minWidth: 0,
						overflowWrap: 'anywhere',
					}}
				>
					{e.name}
				</strong>
				{e.restSeconds ? (
					<span
						className="soft num"
						style={{ fontSize: 13, whiteSpace: 'nowrap' }}
					>
						pause {e.restSeconds} s
					</span>
				) : null}
			</div>
			{e.oneSideAtATime ? (
				<p className="soft" style={{ fontSize: 13 }}>
					Én side om gangen.
				</p>
			) : null}
			<div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
				{e.sets.map((set) => {
					const on = !!set.logged
					const abandoned = set.logged && !set.logged.done
					return (
						<button
							key={set.setIndex}
							type="button"
							aria-pressed={on}
							aria-label={`${set.warmup ? 'Oppvarmingssett' : 'Sett'}: ${on ? loggedText(set) : prescribedText(set)}`}
							onClick={() => tap(set)}
							disabled={busy === set.setIndex}
							style={{
								width: set.warmup ? 64 : 76,
								minHeight: 64,
								border: `1.5px ${set.warmup ? 'dashed' : 'solid'} var(--ink)`,
								background: on && !abandoned ? 'var(--ink)' : 'var(--slab)',
								color: on && !abandoned ? 'var(--sky)' : 'var(--ink)',
								cursor: locked ? 'default' : 'pointer',
								display: 'grid',
								placeItems: 'center',
								padding: 4,
								fontSize: 13,
								lineHeight: 1.2,
								textAlign: 'center',
								textDecoration: abandoned ? 'line-through' : undefined,
								outline:
									`${e.stepId}:${set.setIndex}` === open
										? '2px solid var(--alt)'
										: undefined,
								outlineOffset: 2,
								transition:
									'background-color 160ms ease, color 160ms ease, transform 120ms var(--ease-out)',
							}}
							className="sti-set"
						>
							{busy === set.setIndex ? (
								<Spinner />
							) : (
								<span className="num">
									{on ? loggedText(set) : prescribedText(set)}
								</span>
							)}
							{set.warmup ? (
								<span style={{ fontSize: 10, opacity: 0.7 }}>oppvarming</span>
							) : null}
						</button>
					)
				})}
			</div>
			<style>{`.sti-set:active{transform:scale(.96)}`}</style>
			{e.defaultLoadUnknownBecause ? (
				<p className="soft" style={{ fontSize: 13, marginTop: 6 }}>
					{e.defaultLoadUnknownBecause}
				</p>
			) : null}
			{openSet ? (
				<SetEditor
					sessionId={sessionId}
					e={e}
					set={openSet}
					onClose={() => setOpen(null)}
				/>
			) : null}
			<ErrorLine message={err} />
		</div>
	)
}

function SetEditor({
	sessionId,
	e,
	set,
	onClose,
}: {
	sessionId: string
	e: StrengthExercise
	set: StrengthSet
	onClose: () => void
}) {
	const log = useCapability<LogStrengthSetInput, LogStrengthSetOutput>(
		'log_strength_set',
	)
	const remove = useCapability<RemoveStrengthSetInput, RemoveStrengthSetOutput>(
		'remove_strength_set',
	)
	const base = set.logged?.load ?? e.defaultLoad
	const kgOf = (l: StrengthLoad | null | undefined) =>
		l && 'kg' in l ? l.kg : null
	const usesKg =
		!base ||
		base.kind === 'kg' ||
		base.kind === 'kg-per-hand' ||
		base.kind === 'bodyweight-plus' ||
		base.kind === 'assisted'
	const [reps, setReps] = useState<number>(
		set.logged?.reps ?? set.prescribed.reps ?? 8,
	)
	const [kg, setKg] = useState<number>(kgOf(base) ?? set.prescribed.kg ?? 20)
	const [err, setErr] = useState<string | null>(null)
	const timed = set.prescribed.seconds !== null && set.prescribed.reps === null

	async function save(done: boolean) {
		setErr(null)
		const load: StrengthLoad | undefined = usesKg
			? base && base.kind !== 'kg' && 'kg' in base
				? { ...base, kg }
				: { kind: 'kg', kg }
			: undefined
		const r = await log.call({
			sessionId,
			stepId: e.stepId,
			setIndex: set.setIndex,
			...(timed ? { seconds: reps } : { reps }),
			...(load ? { load } : {}),
			done,
		})
		if (!r.ok) {
			if (r.code === 'load-kind-locked') {
				const again = await log.call({
					sessionId,
					stepId: e.stepId,
					setIndex: set.setIndex,
					...(timed ? { seconds: reps } : { reps }),
					...(load ? { load } : {}),
					done,
					changeLoadKind: true,
				})
				if (!again.ok) return setErr(again.message)
			} else return setErr(r.message)
		}
		onClose()
	}

	return (
		<div
			className="sti-card"
			style={{ marginTop: 10, display: 'grid', gap: 12 }}
		>
			<Stepper
				label={timed ? 'Sekunder' : 'Reps'}
				value={reps}
				step={1}
				min={0}
				onChange={setReps}
			/>
			{usesKg ? (
				<Stepper
					label="Kilo"
					value={kg}
					step={2.5}
					min={0}
					onChange={setKg}
					digits={1}
				/>
			) : (
				<p className="soft">Last: {loadText(base) ?? 'ukjent'}</p>
			)}
			{set.plates ? (
				<p className="soft num" style={{ fontSize: 13 }}>
					Skiver per side: {set.plates.perSide.join(' + ') || 'ingen'} på{' '}
					{set.plates.barKg} kg stang
					{!set.plates.exact && set.plates.madeKg !== null
						? ` (blir ${fmtNumber(set.plates.madeKg, 1)} kg)`
						: ''}
				</p>
			) : set.platesUnknownBecause ? (
				<p className="soft" style={{ fontSize: 13 }}>
					{set.platesUnknownBecause}
				</p>
			) : null}
			{set.prescribed.kgUnknownBecause ? (
				<p className="soft" style={{ fontSize: 13 }}>
					{set.prescribed.kgUnknownBecause} {set.prescribed.kgFix ?? ''}
				</p>
			) : null}
			{set.lastTime ? (
				<p className="soft num" style={{ fontSize: 13 }}>
					Sist: {set.lastTime.reps ?? set.lastTime.seconds ?? '?'} ×{' '}
					{loadText(set.lastTime.load)}
				</p>
			) : null}
			<ErrorLine message={err} />
			<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
				<button
					type="button"
					className="sti-btn small"
					disabled={log.pending}
					onClick={() => save(true)}
				>
					{log.pending ? <Spinner /> : null}
					Lagre sett
				</button>
				<button
					type="button"
					className="sti-btn quiet small"
					disabled={log.pending}
					onClick={() => save(false)}
				>
					Klarte det ikke
				</button>
				{set.logged ? (
					<button
						type="button"
						className="sti-btn ghost small"
						disabled={remove.pending}
						onClick={async () => {
							const r = await remove.call({
								sessionId,
								stepId: e.stepId,
								setIndex: set.setIndex,
							})
							if (!r.ok) return setErr(r.message)
							markChange('Settet er fjernet.', r.value, [sessionId])
							onClose()
						}}
					>
						Fjern
					</button>
				) : null}
				<button type="button" className="sti-btn ghost small" onClick={onClose}>
					Lukk
				</button>
			</div>
		</div>
	)
}

function Stepper({
	label,
	value,
	step,
	min,
	onChange,
	digits = 0,
}: {
	label: string
	value: number
	step: number
	min: number
	onChange: (v: number) => void
	digits?: number
}) {
	return (
		<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
			<span style={{ width: 80, fontWeight: 600 }}>{label}</span>
			<button
				type="button"
				className="sti-btn quiet small"
				style={{ width: 48, padding: 0 }}
				aria-label={`${label} ned`}
				onClick={() => onChange(Math.max(min, +(value - step).toFixed(2)))}
			>
				−
			</button>
			<input
				className="sti-field num"
				inputMode="decimal"
				aria-label={label}
				value={fmtNumber(value, digits)}
				onChange={(ev) => {
					const v = Number(ev.target.value.replace(',', '.'))
					if (Number.isFinite(v) && v >= min) onChange(v)
				}}
				style={{ width: 90, textAlign: 'center' }}
			/>
			<button
				type="button"
				className="sti-btn quiet small"
				style={{ width: 48, padding: 0 }}
				aria-label={`${label} opp`}
				onClick={() => onChange(+(value + step).toFixed(2))}
			>
				+
			</button>
		</div>
	)
}
