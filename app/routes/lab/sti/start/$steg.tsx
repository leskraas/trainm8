import { useState } from 'react'
import { Link, redirect, useNavigate } from 'react-router'
import { useCapability } from '#app/lab/engine/client.ts'
import { runCapability } from '#app/lab/engine/registry.server.ts'
import {
	type ConnectionsOutput,
	type ExperienceLevel,
	type GoalOutput,
	type ImportStatusOutput,
	type OtherActivity,
	type SessionPreference,
	type SetAvailabilityInput,
	type SetAvailabilityOutput,
	type SetCurrentVolumeInput,
	type SetLevelInput,
	type SetSessionPreferencesInput,
	type SetSportsInput,
	type SetStrengthInput,
	type SetTimezoneInput,
	type SetupState,
	type Sport,
	type Weekday,
} from '#app/lab/engine/setup.types.ts'
import { GoalForm, TracksPanel } from '../__forms.tsx'
import {
	BASE,
	ErrorLine,
	Spinner,
	Stone,
	WEEKDAY_KEYS,
	fmtHours,
	plural,
	sportLetter,
	wdShort,
} from '../__ui.tsx'
import { type Route } from './+types/$steg.ts'

const STEPS = [
	{ n: 1, word: 'Idretter' },
	{ n: 2, word: 'Erfaring' },
	{ n: 3, word: 'Mengde' },
	{ n: 4, word: 'Dager' },
	{ n: 5, word: 'Styrke' },
	{ n: 6, word: 'Spor' },
	{ n: 7, word: 'Mål' },
] as const

export async function loader({ request, params }: Route.LoaderArgs) {
	const n = Number(params.steg)
	if (!Number.isInteger(n) || n < 1 || n > 7) throw redirect(`${BASE}/start/1`)
	const [setup, me, connections, status, goal] = await Promise.all([
		runCapability(request, 'get_setup', {}),
		runCapability(request, 'athlete', {}),
		n === 6 ? runCapability(request, 'connections', {}) : null,
		n === 6 ? runCapability(request, 'import_status', {}) : null,
		n === 7 ? runCapability(request, 'goal', {}) : null,
	])
	if (setup.ok && setup.value.hasPlan) throw redirect(BASE)
	return {
		step: n,
		setup: setup.ok ? setup.value : null,
		setupError: setup.ok ? null : setup.message,
		timezone: me.ok ? me.value.timezone : null,
		recordings: me.ok ? me.value.recordings : null,
		connections: connections?.ok ? connections.value : null,
		connectionsError:
			connections && !connections.ok ? connections.message : null,
		status: status?.ok ? status.value : null,
		goal: goal?.ok ? goal.value : null,
	}
}

export const meta = () => [{ title: 'Sti · Utrustning' }]

export default function Start({ loaderData }: Route.ComponentProps) {
	const { step, setup } = loaderData
	if (!setup) {
		return (
			<main style={{ padding: 24, paddingTop: 72 }}>
				<ErrorLine
					message={loaderData.setupError ?? 'Fikk ikke hentet svarene dine.'}
				/>
				<Link
					className="sti-btn"
					to={`${BASE}/start/${step}`}
					style={{ marginTop: 16 }}
				>
					Prøv igjen
				</Link>
			</main>
		)
	}
	return (
		<main
			style={{
				minHeight: '100dvh',
				display: 'flex',
				flexDirection: 'column',
				maxWidth: 640,
				margin: '0 auto',
				padding:
					'calc(env(safe-area-inset-top, 0px) + 12px) 16px calc(env(safe-area-inset-bottom, 0px) + 16px)',
			}}
		>
			<Pack setup={setup} />
			<div style={{ display: 'flex', gap: 14, flex: 1, marginTop: 8 }}>
				<Climb step={step} setup={setup} />
				<div
					style={{
						flex: 1,
						minWidth: 0,
						display: 'flex',
						flexDirection: 'column',
					}}
				>
					<StepBody key={step} />
				</div>
			</div>
		</main>
	)

	function StepBody() {
		switch (step) {
			case 1:
				return <StepSports setup={setup!} timezone={loaderData.timezone} />
			case 2:
				return <StepLevel setup={setup!} />
			case 3:
				return <StepVolume setup={setup!} />
			case 4:
				return <StepDays setup={setup!} />
			case 5:
				return <StepStrength setup={setup!} />
			case 6:
				return (
					<StepTracks
						connections={loaderData.connections}
						connectionsError={loaderData.connectionsError}
						status={loaderData.status}
					/>
				)
			default:
				return <StepGoal setup={setup!} goal={loaderData.goal} />
		}
	}
}

// ── The pack: what has been said so far, as small things in a bag ───────────

function Pack({ setup }: { setup: SetupState }) {
	const a = setup.answers
	const items: string[] = []
	const level = setup.choices.levels
		.find((l) => l.id === a.level)
		?.label.split(':')[0]
	if (level) items.push(level)
	if (a.currentHoursPerWeek !== null)
		items.push(`${fmtHours(a.currentHoursPerWeek)}/uke nå`)
	if (a.availability.days)
		items.push(plural(a.availability.days.length, 'dag', 'dager'))
	if (a.strengthPerWeek) items.push(`${a.strengthPerWeek}× styrke`)
	return (
		<div
			aria-label="Sekken"
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 8,
				paddingRight: 120,
				minHeight: 40,
				flexWrap: 'wrap',
			}}
		>
			<svg width="26" height="28" viewBox="0 0 26 28" aria-hidden>
				<path
					d="M5 9c0-4 3.5-7 8-7s8 3 8 7v15a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"
					fill="none"
					stroke="var(--ink)"
					strokeWidth="1.8"
				/>
				<path
					d="M9 14h8"
					stroke="var(--ink)"
					strokeWidth="1.8"
					strokeLinecap="round"
				/>
			</svg>
			{(a.sports ?? []).map((s) => (
				<Pebble key={s} sport={s} letter={sportLetter(s)} />
			))}
			{items.map((t) => (
				<span
					key={t}
					className="num"
					style={{
						fontSize: 13,
						padding: '3px 9px',
						borderRadius: 8,
						background: 'var(--card)',
						border: '1px solid var(--ink-faint)',
						whiteSpace: 'nowrap',
					}}
				>
					{t}
				</span>
			))}
			{!a.sports?.length && !items.length ? (
				<span className="soft" style={{ fontSize: 14 }}>
					Sekken er tom.
				</span>
			) : null}
		</div>
	)
}

function Pebble({
	letter,
	big,
	sport,
}: {
	letter: string
	big?: boolean
	sport?: string
}) {
	return <Stone sport={sport ?? 'run'} size={big ? 56 : 28} label={letter} />
}

// ── The climb: seven steps upward ────────────────────────────────────────────

function answered(setup: SetupState, n: number) {
	const a = setup.answers
	switch (n) {
		case 1:
			return !!a.sports?.length || !!a.otherActivities?.length
		case 2:
			return !!a.level
		case 3:
			return a.currentHoursPerWeek !== null
		case 4:
			return a.availability.days !== null
		case 5:
			return a.strengthPerWeek !== null
		default:
			return false
	}
}

function Climb({ step, setup }: { step: number; setup: SetupState }) {
	const H = 360
	const ys = STEPS.map((_, i) => H - 20 - (i * (H - 40)) / (STEPS.length - 1))
	const xs = STEPS.map((_, i) => 20 + Math.sin(i * 1.1) * 8)
	const d = ys
		.map((y, i) => `${i === 0 ? 'M' : 'L'}${xs[i]!.toFixed(1)} ${y.toFixed(1)}`)
		.join(' ')
	return (
		<nav
			aria-label="Steg"
			style={{ width: 44, flexShrink: 0, position: 'relative' }}
		>
			<svg
				width="44"
				height={H}
				viewBox={`0 0 44 ${H}`}
				aria-hidden
				style={{ position: 'sticky', top: 60 }}
			>
				<path
					d={d}
					fill="none"
					stroke="var(--ink-faint)"
					strokeWidth="2"
					strokeDasharray="2 6"
					strokeLinecap="round"
				/>
				{STEPS.map((s, i) => {
					const done = answered(setup, s.n)
					const here = s.n === step
					return (
						<g key={s.n}>
							<rect
								x={xs[i]! - 8}
								y={ys[i]! - 6}
								width="16"
								height="12"
								rx="2"
								fill={done ? 'var(--ink)' : 'var(--slab)'}
								stroke="var(--ink)"
								strokeWidth="1.5"
							/>
							{here ? (
								<>
									<circle cx={xs[i]! + 14} cy={ys[i]} r="5" fill="var(--dot)" />
									<circle
										cx={xs[i]! + 14}
										cy={ys[i]}
										r="9"
										fill="none"
										stroke="var(--dot)"
										strokeOpacity=".35"
										strokeWidth="2"
									/>
								</>
							) : null}
						</g>
					)
				})}
			</svg>
			<div
				style={{ position: 'absolute', top: 60, left: 0, width: 44, height: H }}
			>
				{STEPS.map((s, i) => (
					<Link
						key={s.n}
						to={`${BASE}/start/${s.n}`}
						aria-label={`Steg ${s.n}: ${s.word}`}
						aria-current={s.n === step ? 'step' : undefined}
						style={{
							position: 'absolute',
							left: 0,
							top: ys[i]! - 22,
							width: 44,
							height: 44,
						}}
					/>
				))}
			</div>
		</nav>
	)
}

// ── Shared step frame ────────────────────────────────────────────────────────

function Frame({
	n,
	question,
	hint,
	children,
	onNext,
	nextLabel = 'Videre',
	pending,
	error,
	canNext = true,
	skip,
}: {
	n: number
	question: string
	hint?: React.ReactNode
	children: React.ReactNode
	onNext: () => void
	nextLabel?: string
	pending?: boolean
	error?: string | null
	canNext?: boolean
	skip?: { label: string; onSkip: () => void }
}) {
	return (
		<>
			<div className="caps soft num" style={{ fontSize: 13, marginTop: 4 }}>
				Steg {n} av 7 · {STEPS[n - 1]!.word}
			</div>
			<h1
				style={{
					fontSize: 28,
					lineHeight: 1.15,
					fontWeight: 700,
					marginTop: 6,
				}}
			>
				{question}
			</h1>
			{hint ? (
				<p
					className="soft"
					style={{ marginTop: 8, fontSize: 15, lineHeight: 1.45 }}
				>
					{hint}
				</p>
			) : null}
			<div style={{ marginTop: 20, flex: 1 }}>{children}</div>
			<ErrorLine message={error} />
			<div
				style={{
					position: 'sticky',
					bottom: 0,
					paddingTop: 12,
					paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 4px)',
					background: 'linear-gradient(to top, var(--sky) 70%, transparent)',
					display: 'flex',
					gap: 10,
					flexWrap: 'wrap',
				}}
			>
				{n > 1 ? (
					<Link
						to={`${BASE}/start/${n - 1}`}
						className="sti-btn quiet"
						aria-label="Ned ett steg"
					>
						<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
							<path
								d="M8 3v10M3 8l5 5 5-5"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
							/>
						</svg>
					</Link>
				) : null}
				{skip ? (
					<button
						type="button"
						className="sti-btn ghost"
						onClick={skip.onSkip}
						disabled={pending}
					>
						{skip.label}
					</button>
				) : null}
				<button
					type="button"
					className="sti-btn"
					style={{ flex: 1, minWidth: 120 }}
					onClick={onNext}
					disabled={pending || !canNext}
				>
					{pending ? <Spinner /> : null}
					{nextLabel}
					<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
						<path
							d="M8 13V3M3 8l5-5 5 5"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
						/>
					</svg>
				</button>
			</div>
		</>
	)
}

// ── 1 Sports ─────────────────────────────────────────────────────────────────

function StepSports({
	setup,
	timezone,
}: {
	setup: SetupState
	timezone: string | null
}) {
	const navigate = useNavigate()
	const write = useCapability<SetSportsInput, SetupState>('set_sports')
	const tz = useCapability<SetTimezoneInput, SetupState>('set_timezone')
	const [sports, setSports] = useState<Sport[]>(setup.answers.sports ?? [])
	const [other, setOther] = useState<OtherActivity[]>(
		setup.answers.otherActivities ?? [],
	)
	const [error, setError] = useState<string | null>(null)
	function toggle<T>(list: T[], v: T) {
		return list.includes(v) ? list.filter((x) => x !== v) : [...list, v]
	}
	async function next() {
		setError(null)
		const res = await write.call(
			{ sports, otherActivities: other },
			{ revalidate: false },
		)
		if (!res.ok) return setError(res.message)
		try {
			const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone
			if (browserTz && browserTz !== timezone)
				await tz.call({ timezone: browserTz }, { revalidate: false })
		} catch {
			// the timezone stays as it was; it can be changed in the pack
		}
		void navigate(`${BASE}/start/2`)
	}
	return (
		<Frame
			n={1}
			question="Hva går du med?"
			hint={
				sports.length
					? `Stien bygges rundt ${setup.choices.sports.find((s) => s.id === sports[0])?.label.toLowerCase() ?? 'den første'}, den du valgte først.`
					: 'Velg det du trener. Det første du velger, bygges stien rundt.'
			}
			onNext={next}
			pending={write.pending}
			error={error}
			canNext={sports.length + other.length > 0}
		>
			<div
				style={{
					display: 'grid',
					gridTemplateColumns: 'repeat(3, 1fr)',
					gap: 10,
				}}
			>
				{setup.choices.sports.map((s) => {
					const on = sports.includes(s.id)
					const order = sports.indexOf(s.id)
					return (
						<button
							key={s.id}
							type="button"
							aria-pressed={on}
							onClick={() => setSports((l) => toggle(l, s.id))}
							className="sti-chip"
							style={{
								flexDirection: 'column',
								height: 112,
								borderRadius: 18,
								justifyContent: 'center',
								position: 'relative',
							}}
						>
							<Pebble sport={s.id} letter={sportLetter(s.id)} big />
							<span style={{ fontWeight: 600 }}>{s.label}</span>
							{order === 0 ? (
								<span
									className="caps"
									style={{
										position: 'absolute',
										top: 6,
										right: 10,
										fontSize: 11,
									}}
								>
									hoved
								</span>
							) : null}
						</button>
					)
				})}
			</div>
			<p
				className="caps soft"
				style={{ fontSize: 13, marginTop: 24, marginBottom: 8 }}
			>
				Annet du gjør
			</p>
			<div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
				{setup.choices.otherActivities.map((o) => (
					<button
						key={o.id}
						type="button"
						className="sti-chip"
						aria-pressed={other.includes(o.id)}
						onClick={() => setOther((l) => toggle(l, o.id))}
					>
						{o.label}
					</button>
				))}
			</div>
			<p className="soft" style={{ fontSize: 13, marginTop: 10 }}>
				Annet får en fast dag, men ingen oppskrift.
			</p>
		</Frame>
	)
}

// ── 2 Level ──────────────────────────────────────────────────────────────────

const LEVEL_HINT: Record<ExperienceLevel, string> = {
	beginner: 'Nytt for deg, eller lenge siden.',
	recreational: 'Trener jevnt, uten å tenke så mye på det.',
	experienced: 'Kjenner terskel, intervaller og nedtrapping.',
	competitive: 'Trener for å vinne, eller nesten.',
}

function StepLevel({ setup }: { setup: SetupState }) {
	const navigate = useNavigate()
	const write = useCapability<SetLevelInput, SetupState>('set_experience_level')
	const [level, setLevel] = useState<ExperienceLevel | null>(
		setup.answers.level,
	)
	const [error, setError] = useState<string | null>(null)
	async function next() {
		if (!level) return
		setError(null)
		const res = await write.call({ level }, { revalidate: false })
		if (!res.ok) return setError(res.message)
		void navigate(`${BASE}/start/3`)
	}
	return (
		<Frame
			n={2}
			question="Hvor vant er du med terrenget?"
			onNext={next}
			pending={write.pending}
			error={error}
			canNext={!!level}
		>
			<div role="radiogroup" style={{ display: 'grid', gap: 10 }}>
				{setup.choices.levels.map((l, i) => (
					<button
						key={l.id}
						type="button"
						role="radio"
						aria-checked={level === l.id}
						className="sti-chip"
						onClick={() => setLevel(l.id)}
						style={{
							borderRadius: 16,
							minHeight: 64,
							justifyContent: 'flex-start',
							textAlign: 'left',
							padding: '10px 16px',
						}}
					>
						<svg
							width="34"
							height="22"
							viewBox="0 0 34 22"
							aria-hidden
							style={{ flexShrink: 0 }}
						>
							<path
								d={`M1 21 L${10 + i * 2} ${18 - i * 5} L${20 + i} ${16 - i * 3} L33 ${15 - i * 4.5}`}
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinejoin="round"
							/>
						</svg>
						<span style={{ display: 'grid' }}>
							<span style={{ fontWeight: 650 }}>{l.label.split(':')[0]}</span>
							<span style={{ fontSize: 14, opacity: 0.75 }}>
								{l.label.includes(':')
									? l.label.slice(l.label.indexOf(':') + 1).trim()
									: LEVEL_HINT[l.id]}
							</span>
						</span>
					</button>
				))}
			</div>
		</Frame>
	)
}

// ── 3 Volume ─────────────────────────────────────────────────────────────────

function StepVolume({ setup }: { setup: SetupState }) {
	const navigate = useNavigate()
	const write = useCapability<SetCurrentVolumeInput, SetupState>(
		'set_current_volume',
	)
	const range = setup.choices.hoursPerWeek
	const fromHistory = setup.fromHistory.hoursPerWeek.value
	const initial =
		setup.answers.currentHoursPerWeek ??
		(fromHistory !== null
			? Math.min(
					range.max,
					Math.max(range.min, Math.round(fromHistory * 2) / 2),
				)
			: null) ??
		setup.suggested?.currentHoursPerWeek ??
		4
	const [hours, setHours] = useState(initial)
	const [error, setError] = useState<string | null>(null)
	async function next() {
		setError(null)
		const res = await write.call({ hoursPerWeek: hours }, { revalidate: false })
		if (!res.ok) return setError(res.message)
		void navigate(`${BASE}/start/4`)
	}
	return (
		<Frame
			n={3}
			question="Hvor mye går du nå?"
			hint="Timer i uka, slik det er nå, ikke slik du skulle ønske. Stien starter der."
			onNext={next}
			pending={write.pending}
			error={error}
			skip={{
				label: 'Vet ikke',
				onSkip: () => void navigate(`${BASE}/start/4`),
			}}
		>
			<div style={{ textAlign: 'center', padding: '12px 0 8px' }}>
				<span
					className="num"
					style={{ fontSize: 56, fontWeight: 700, letterSpacing: '-0.02em' }}
				>
					{hours.toLocaleString('nb-NO')}
				</span>
				<span style={{ fontSize: 20, marginLeft: 6 }}>t / uke</span>
			</div>
			<input
				type="range"
				aria-label="Timer i uka nå"
				min={range.min}
				max={range.max}
				step={range.step}
				value={hours}
				onChange={(e) => setHours(Number(e.target.value))}
				style={{ width: '100%', accentColor: 'var(--ink)', height: 44 }}
			/>
			<div
				className="soft num"
				style={{
					display: 'flex',
					justifyContent: 'space-between',
					fontSize: 13,
				}}
			>
				<span>{range.min} t</span>
				<span>{range.max} t</span>
			</div>
			<div className="sti-fog" style={{ marginTop: 20 }}>
				{setup.fromHistory.note ??
					(fromHistory !== null
						? `Klokka sier rundt ${fmtHours(fromHistory)} i uka.`
						: (setup.fromHistory.hoursPerWeek.why ??
							'Ingen spor ennå, så jeg vet ikke hvor mye du går.'))}
				{setup.answers.currentHoursPerWeek === null &&
				setup.suggested &&
				fromHistory === null ? (
					<>
						{' '}
						Forslaget på {fmtHours(setup.suggested.currentHoursPerWeek)} kommer
						fra nivået ditt.
					</>
				) : null}
			</div>
		</Frame>
	)
}

// ── 4 Days ───────────────────────────────────────────────────────────────────

function StepDays({ setup }: { setup: SetupState }) {
	const navigate = useNavigate()
	const write = useCapability<SetAvailabilityInput, SetAvailabilityOutput>(
		'set_availability',
	)
	const [days, setDays] = useState<Weekday[]>(
		setup.answers.availability.days ??
			setup.suggested?.days ?? ['tue', 'thu', 'sat', 'sun'],
	)
	const [roomOn, setRoomOn] = useState(
		setup.answers.availability.hoursPerWeek !== null,
	)
	const [room, setRoom] = useState(
		setup.answers.availability.hoursPerWeek ??
			setup.answers.currentHoursPerWeek ??
			6,
	)
	const [error, setError] = useState<string | null>(null)
	async function next() {
		setError(null)
		const res = await write.call(
			{ days, hoursPerWeek: roomOn ? room : null },
			{ revalidate: false },
		)
		if (!res.ok) return setError(res.message)
		void navigate(`${BASE}/start/5`)
	}
	const wasSuggested =
		setup.answers.availability.days === null && setup.suggested
	return (
		<Frame
			n={4}
			question="Hvilke dager kan du gå?"
			hint="Trykk bort dagene som ikke går. Stien legger øktene på resten."
			onNext={next}
			pending={write.pending}
			error={error}
			canNext={days.length > 0}
		>
			<div
				role="group"
				aria-label="Ukedager"
				style={{
					display: 'grid',
					gridTemplateColumns: 'repeat(7, 1fr)',
					gap: 6,
				}}
			>
				{WEEKDAY_KEYS.map((d) => {
					const on = days.includes(d)
					return (
						<button
							key={d}
							type="button"
							aria-pressed={on}
							aria-label={`${wdShort(d)}${on ? ', går' : ', går ikke'}`}
							onClick={() =>
								setDays((l) =>
									on
										? l.filter((x) => x !== d)
										: WEEKDAY_KEYS.filter((w) => w === d || l.includes(w)),
								)
							}
							style={{
								height: 72,
								borderRadius: 12,
								border: `1.5px solid ${on ? 'var(--ink)' : 'var(--ink-faint)'}`,
								background: on ? 'var(--ink)' : 'transparent',
								color: on ? 'var(--sky)' : 'var(--ink-soft)',
								display: 'grid',
								placeItems: 'center',
								cursor: 'pointer',
								fontWeight: 650,
								fontSize: 14,
								textDecoration: on ? 'none' : 'line-through',
								transition:
									'background-color 160ms ease, color 160ms ease, transform 120ms var(--ease-out)',
							}}
						>
							{wdShort(d)}
						</button>
					)
				})}
			</div>
			<p className="soft num" style={{ marginTop: 10, fontSize: 14 }}>
				{plural(days.length, 'dag', 'dager')} i uka
				{wasSuggested ? ' · forslag fra nivået ditt' : ''}
			</p>
			<div className="sti-card" style={{ marginTop: 20 }}>
				<label
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 12,
						minHeight: 44,
						cursor: 'pointer',
					}}
				>
					<input
						type="checkbox"
						checked={roomOn}
						onChange={(e) => setRoomOn(e.target.checked)}
						style={{ width: 22, height: 22, accentColor: 'var(--ink)' }}
					/>
					<span style={{ flex: 1 }}>Jeg har plass til høyst …</span>
					{roomOn ? (
						<span className="num" style={{ fontWeight: 700 }}>
							{fmtHours(room)}
						</span>
					) : null}
				</label>
				{roomOn ? (
					<input
						type="range"
						aria-label="Timer i uka du har plass til"
						min={setup.choices.hoursPerWeek.min}
						max={setup.choices.hoursPerWeek.max}
						step={setup.choices.hoursPerWeek.step}
						value={room}
						onChange={(e) => setRoom(Number(e.target.value))}
						style={{ width: '100%', accentColor: 'var(--ink)', height: 44 }}
					/>
				) : (
					<p className="soft" style={{ fontSize: 14 }}>
						Uten tak bygger stien fra det du går nå.
					</p>
				)}
			</div>
		</Frame>
	)
}

// ── 5 Strength ───────────────────────────────────────────────────────────────

function StepStrength({ setup }: { setup: SetupState }) {
	const navigate = useNavigate()
	const write = useCapability<SetStrengthInput, SetupState>('set_strength')
	const prefs = useCapability<SetSessionPreferencesInput, SetupState>(
		'set_session_preferences',
	)
	const [per, setPer] = useState<number>(
		setup.answers.strengthPerWeek ?? setup.suggested?.strengthPerWeek ?? 0,
	)
	const [likes, setLikes] = useState<SessionPreference[]>(
		setup.answers.sessionPreferences ?? [],
	)
	const [error, setError] = useState<string | null>(null)
	async function next() {
		setError(null)
		const res = await write.call(
			{ perWeek: per as 0 | 1 | 2 | 3 },
			{ revalidate: false },
		)
		if (!res.ok) return setError(res.message)
		const p = await prefs.call({ preferences: likes }, { revalidate: false })
		if (!p.ok) return setError(p.message)
		void navigate(`${BASE}/start/6`)
	}
	return (
		<Frame
			n={5}
			question="Vil du løfte?"
			hint="Styrkedagene legges unna de harde øktene. Firkantede heller på stien."
			onNext={next}
			pending={write.pending || prefs.pending}
			error={error}
		>
			<div
				role="radiogroup"
				aria-label="Styrkeøkter i uka"
				style={{
					display: 'grid',
					gridTemplateColumns: 'repeat(4, 1fr)',
					gap: 8,
				}}
			>
				{[0, 1, 2, 3].map((n) => (
					<button
						key={n}
						type="button"
						role="radio"
						aria-checked={per === n}
						className="sti-chip"
						onClick={() => setPer(n)}
						style={{
							height: 88,
							borderRadius: 16,
							flexDirection: 'column',
							justifyContent: 'center',
							gap: 6,
						}}
					>
						<span style={{ display: 'flex', gap: 3 }} aria-hidden>
							{n === 0 ? (
								<span
									style={{
										width: 14,
										height: 14,
										border: '1.5px dashed currentColor',
									}}
								/>
							) : (
								Array.from({ length: n }, (_, i) => (
									<span
										key={i}
										style={{
											width: 14,
											height: 14,
											border: '1.5px solid currentColor',
											background: 'currentColor',
											opacity: 0.85,
										}}
									/>
								))
							)}
						</span>
						<span className="num" style={{ fontWeight: 650 }}>
							{n === 0 ? 'Nei' : `${n}× i uka`}
						</span>
					</button>
				))}
			</div>
			<p
				className="caps soft"
				style={{ fontSize: 13, marginTop: 26, marginBottom: 8 }}
			>
				Hva liker du? (valgfritt)
			</p>
			<div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
				{setup.choices.sessionPreferences.map((p) => (
					<button
						key={p.id}
						type="button"
						className="sti-chip"
						aria-pressed={likes.includes(p.id)}
						onClick={() =>
							setLikes((l) =>
								l.includes(p.id) ? l.filter((x) => x !== p.id) : [...l, p.id],
							)
						}
					>
						{p.label}
					</button>
				))}
			</div>
		</Frame>
	)
}

// ── 6 Tracks: connect the watch ──────────────────────────────────────────────

function StepTracks({
	connections,
	connectionsError,
	status,
}: {
	connections: ConnectionsOutput | null
	connectionsError: string | null
	status: ImportStatusOutput | null
}) {
	const navigate = useNavigate()
	return (
		<Frame
			n={6}
			question="Har du spor fra før?"
			hint="Koble på tjenesten klokka di synker til, eller last opp filer. Da vet jeg hvor du står."
			onNext={() => void navigate(`${BASE}/start/7`)}
			skip={
				status && status.recordings.total > 0
					? undefined
					: {
							label: 'Hopp over',
							onSkip: () => void navigate(`${BASE}/start/7`),
						}
			}
		>
			<TracksPanel
				connections={connections}
				connectionsError={connectionsError}
				status={status}
			/>
		</Frame>
	)
}

// ── 7 Goal ───────────────────────────────────────────────────────────────────

function StepGoal({
	setup,
	goal,
}: {
	setup: SetupState
	goal: GoalOutput | null
}) {
	const navigate = useNavigate()
	return (
		<>
			<div className="caps soft num" style={{ fontSize: 13, marginTop: 4 }}>
				Steg 7 av 7 · Mål
			</div>
			<h1
				style={{
					fontSize: 28,
					lineHeight: 1.15,
					fontWeight: 700,
					marginTop: 6,
				}}
			>
				Hvor skal du?
			</h1>
			<div style={{ marginTop: 18 }}>
				<GoalForm
					sports={setup.answers.sports ?? ['run']}
					goal={goal}
					onDone={() => void navigate(`${BASE}/forhandsvisning`)}
					submitLabel="Vis stien"
				/>
			</div>
			<Link
				to={`${BASE}/start/6`}
				className="sti-link"
				style={{ marginTop: 12 }}
			>
				Ned ett steg
			</Link>
		</>
	)
}
