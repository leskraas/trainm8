import { useEffect, useRef, useState } from 'react'
import {
	Link,
	redirect,
	useNavigate,
	useNavigation,
	useSearchParams,
} from 'react-router'
import { useCapability } from '#app/lab/engine/client.ts'
import { runCapability } from '#app/lab/engine/registry.server.ts'
import {
	type AcceptPlanInput,
	type AcceptPlanOutput,
	type OutlookWeek,
	type PlanPhase,
	type PlanStyle,
	type PreviewWeek,
	type SetCurrentVolumeInput,
	type SetStrengthInput,
	type SetupState,
} from '#app/lab/engine/setup.types.ts'
import { type Route } from './+types/forhandsvisning.ts'
import {
	BASE,
	EmptyTrail,
	ErrorLine,
	Spinner,
	Stone,
	fmtDay,
	fmtDuration,
	fmtHours,
	phaseName,
	phaseWhat,
	plural,
	sportLetter,
	useReducedMotion,
	wdShort,
} from './__ui.tsx'

const STYLES: PlanStyle[] = ['polarized', 'threshold', 'classic', 'big-base']

export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url)
	const wanted = url.searchParams.get('stil')
	const style = STYLES.includes(wanted as PlanStyle)
		? (wanted as PlanStyle)
		: undefined
	const [setup, options] = await Promise.all([
		runCapability(request, 'get_setup', {}),
		runCapability(request, 'start_options', {}),
	])
	if (setup.ok && setup.value.hasPlan) throw redirect(BASE)
	if (!options.ok)
		return {
			setup: setup.ok ? setup.value : null,
			options: null,
			preview: null,
			error: options.message,
			code: options.code,
			style: style ?? null,
		}
	const preview = await runCapability(
		request,
		'plan_preview',
		style ? { style } : {},
	)
	return {
		setup: setup.ok ? setup.value : null,
		options: options.value,
		preview: preview.ok ? preview.value : null,
		error: preview.ok ? null : preview.message,
		code: preview.ok ? null : preview.code,
		style: style ?? null,
	}
}

export const meta = () => [{ title: 'Sti · Forhåndsvisning' }]

export default function Forhandsvisning({ loaderData }: Route.ComponentProps) {
	const { options, preview, error, setup } = loaderData
	const navigate = useNavigate()
	const navigation = useNavigation()
	const [, setParams] = useSearchParams()
	const accept = useCapability<AcceptPlanInput, AcceptPlanOutput>('accept_plan')
	const [adjust, setAdjust] = useState(false)
	const [accepting, setAccepting] = useState<string | null>(null)
	const [acceptError, setAcceptError] = useState<string | null>(null)
	const [lit, setLit] = useState(false)
	const reduce = useReducedMotion()

	if (!options || !preview) {
		return (
			<main
				style={{
					padding: '72px 24px 40px',
					maxWidth: 520,
					margin: '0 auto',
					display: 'grid',
					gap: 16,
					textAlign: 'center',
				}}
			>
				<EmptyTrail height={160} />
				<p style={{ fontSize: 18 }}>Jeg får ikke tegnet stien ennå.</p>
				<ErrorLine message={error} />
				<Link to={`${BASE}/start`} className="sti-btn">
					Tilbake til utrustningen
				</Link>
			</main>
		)
	}

	const style = preview.style
	const goalSide =
		preview.towardGoal && !preview.towardGoal.problem
			? preview.towardGoal
			: null
	const phases = goalSide?.phases ?? preview.phases
	const outlook = goalSide?.outlook ?? preview.outlook
	const option =
		options.options.find((o) => o.style === style) ?? options.options[0]
	const loading = navigation.state === 'loading'

	async function go() {
		setAcceptError(null)
		const r = await accept.call({ style }, { revalidate: false })
		if (!r.ok) return setAcceptError(r.message)
		setAccepting(r.value.goalProblem)
		setLit(true)
		window.setTimeout(() => void navigate(BASE), reduce ? 200 : 900)
	}

	return (
		<main
			style={{
				maxWidth: 640,
				margin: '0 auto',
				padding:
					'calc(env(safe-area-inset-top, 0px) + 14px) 16px calc(env(safe-area-inset-bottom, 0px) + 24px)',
			}}
		>
			<div className="caps soft" style={{ fontSize: 13, paddingRight: 120 }}>
				Forslag · start {fmtDay(preview.startsOn, { weekday: true })}
			</div>
			<h1
				style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, marginTop: 4 }}
			>
				{goalSide ? `Stien til ${goalSide.goal.name}` : 'Stien, runde 1'}
			</h1>
			<p
				className="soft"
				style={{ marginTop: 6, fontSize: 15, lineHeight: 1.45 }}
			>
				<strong style={{ color: 'var(--ink)' }}>{preview.name}.</strong>{' '}
				{preview.why}
			</p>
			{preview.towardGoal?.problem ? (
				<div className="sti-fog" style={{ marginTop: 10 }}>
					{preview.towardGoal.problem}
				</div>
			) : null}
			{!preview.towardGoal ? (
				<div className="sti-fog" style={{ marginTop: 10 }}>
					Uten flagg går stien i runder på fire uker, med litt mer hver runde.{' '}
					<Link to={`${BASE}/start/7`} className="sti-link">
						Sett et flagg
					</Link>
				</div>
			) : null}

			<div
				style={{ opacity: loading ? 0.5 : 1, transition: 'opacity 160ms ease' }}
			>
				<SeasonPath
					phases={phases}
					outlook={outlook}
					goal={goalSide?.goal ?? null}
					lit={lit}
				/>
			</div>

			{adjust ? (
				<Adjust
					setup={setup}
					style={style}
					options={options.options.map((o) => ({
						style: o.style,
						name: o.name,
						badge: o.badge,
						styleName: o.styleName,
					}))}
					onStyle={(s) =>
						setParams(
							(p) => {
								p.set('stil', s)
								return p
							},
							{ preventScrollReset: true, replace: true },
						)
					}
				/>
			) : null}
			<FirstWeek week={preview.weeks[0] ?? option?.firstWeek ?? null} />
			{preview.weeks[1] ? (
				<FirstWeek week={preview.weeks[1]} label="Uka etter" />
			) : null}

			{[
				...options.assumed.map((a) =>
					a.question === 'days'
						? `Dagene er ${a.from === 'history' ? 'hentet fra sporene dine' : 'et forslag fra nivået ditt'}.`
						: `Timene er ${a.from === 'history' ? 'hentet fra sporene dine' : 'et forslag fra nivået ditt'}.`,
				),
				...options.notes,
				...preview.notes,
				...(option?.strengthNotes ?? []),
				...(option?.shortOfHours ? [option.shortOfHours.note] : []),
				...(option?.notFitted ? [option.notFitted] : []),
			].map((n, i) => (
				<p
					key={i}
					className="soft"
					style={{ fontSize: 14, marginTop: 8, lineHeight: 1.4 }}
				>
					{n}
				</p>
			))}

			<ErrorLine message={acceptError} />
			{lit ? (
				<p role="status" style={{ marginTop: 14, fontSize: 16 }}>
					Stien er lagt. {accepting ? accepting : 'God tur.'}
				</p>
			) : null}
			<div
				style={{
					position: 'sticky',
					bottom: 0,
					paddingTop: 12,
					paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 6px)',
					background: 'linear-gradient(to top, var(--sky) 75%, transparent)',
					display: 'flex',
					gap: 10,
					marginTop: 16,
				}}
			>
				<button
					type="button"
					className="sti-btn quiet"
					onClick={() => setAdjust((a) => !a)}
					aria-expanded={adjust}
				>
					{adjust ? 'Ferdig' : 'Juster'}
				</button>
				<button
					type="button"
					className="sti-btn"
					style={{ flex: 1 }}
					onClick={go}
					disabled={accept.pending || lit || loading}
				>
					{accept.pending ? <Spinner /> : null}
					Gå denne stien
				</button>
			</div>
			<p className="soft" style={{ fontSize: 13, marginTop: 6 }}>
				Planen kan ikke angres som helhet, men hvert steg kan flyttes, byttes og
				gjøres lettere etterpå.
			</p>
		</main>
	)
}

/** The whole season, zoomed out: phases as named stretches, steepness as terrain. */
function SeasonPath({
	phases,
	outlook,
	goal,
	lit,
}: {
	phases: PlanPhase[]
	outlook: OutlookWeek[]
	goal: { name: string; date: string } | null
	lit: boolean
}) {
	const box = useRef<HTMLDivElement>(null)
	const [W, setW] = useState(360)
	const [open, setOpen] = useState<number | null>(null)
	useEffect(() => {
		const el = box.current
		if (!el) return
		setW(el.clientWidth)
		const ro = new ResizeObserver(() => setW(el.clientWidth))
		ro.observe(el)
		return () => ro.disconnect()
	}, [])
	if (!goal) return <MiniLoop outlook={outlook} lit={lit} />
	const n = Math.max(outlook.length, 1)
	const ROW = n > 20 ? 26 : 36
	const top = goal ? 110 : 24
	const H = top + n * ROW + 30
	const amp = Math.min(W * 0.16, 60)
	const fx = (y: number) => W * 0.58 + Math.sin(y / 90 + 0.7) * amp
	const yOf = (i: number) => top + (n - 1 - i) * ROW + ROW / 2
	const pts: string[] = []
	for (let y = top - (goal ? 30 : 0); y <= H - 10; y += 5)
		pts.push(`${pts.length ? 'L' : 'M'}${fx(y).toFixed(1)} ${y}`)
	const d = pts.join(' ')
	const hoursKnown = outlook.map((w) => w.hours)
	const steep = (i: number) => {
		const w = outlook[i]!
		if (w.role !== 'loading') return -0.6
		const a = hoursKnown[i]
		const b = hoursKnown[i - 1]
		if (a == null || b == null || !b) return 0.3
		return Math.max(-1, Math.min(1, ((a - b) / b) * 6))
	}
	let wi = 0
	const spans = phases.map((p) => {
		const i0 = wi
		wi += p.weeks
		return { p, i0, i1: Math.min(wi - 1, n - 1) }
	})
	return (
		<div ref={box} style={{ position: 'relative', height: H, marginTop: 18 }}>
			<svg
				width={W}
				height={H}
				aria-hidden
				style={{ position: 'absolute', inset: 0 }}
			>
				{outlook.map((w, i) => {
					const s = steep(i)
					const y = yOf(i)
					const seg: string[] = []
					for (let yy = y - ROW / 2; yy <= y + ROW / 2; yy += 4)
						seg.push(`${seg.length ? 'L' : 'M'}${fx(yy).toFixed(1)} ${yy}`)
					return (
						<path
							key={w.weekStart}
							d={seg.join(' ')}
							fill="none"
							stroke={`color-mix(in oklab, var(--t1) ${Math.round(((s + 1) / 2) * 100)}%, var(--t0))`}
							strokeOpacity=".8"
							strokeWidth={Math.min(90, W * 0.22)}
						/>
					)
				})}
				<path
					d={d}
					fill="none"
					stroke="var(--ink)"
					strokeOpacity=".3"
					strokeWidth="2.5"
					strokeDasharray="1 6"
					strokeLinecap="round"
				/>
				<path
					d={d}
					fill="none"
					stroke="var(--ink)"
					strokeWidth="3.5"
					strokeLinecap="round"
					pathLength={1}
					strokeDasharray="1 1"
					style={{
						strokeDashoffset: lit ? 0 : -1,
						transition:
							'stroke-dashoffset 800ms cubic-bezier(0.77, 0, 0.175, 1)',
					}}
				/>
				{goal ? (
					<g transform={`translate(${fx(top - 30) - 6} ${top - 82})`}>
						<path
							d="M6 54V4"
							stroke="var(--ink)"
							strokeWidth="3"
							strokeLinecap="round"
						/>
						<path d="M6 5h24l-6 7 6 7H6" fill="var(--dot)" />
					</g>
				) : null}
				<circle cx={fx(H - 14)} cy={H - 14} r="6" fill="var(--dot)" />
				<circle
					cx={fx(H - 14)}
					cy={H - 14}
					r="10"
					fill="none"
					stroke="var(--dot)"
					strokeOpacity=".35"
					strokeWidth="2"
				/>
			</svg>
			{goal ? (
				<div
					style={{
						position: 'absolute',
						left: 0,
						top: top - 104,
						width: Math.max(120, fx(top - 30) - 18),
						textAlign: 'right',
					}}
				>
					<div className="caps" style={{ fontSize: 12 }}>
						Målet · {fmtDay(goal.date)}
					</div>
					<div
						style={{
							fontWeight: 700,
							fontSize: 15,
							overflowWrap: 'anywhere',
							display: '-webkit-box',
							WebkitLineClamp: 3,
							WebkitBoxOrient: 'vertical',
							overflow: 'hidden',
						}}
					>
						{goal.name}
					</div>
				</div>
			) : null}
			{spans.map(({ p, i0, i1 }, k) => {
				const yTop = yOf(i1) - ROW / 2
				const yBot = yOf(i0) + ROW / 2
				const hrs = outlook.slice(i0, i1 + 1).map((w) => w.hours)
				const known = hrs.filter((h): h is number => h !== null)
				return (
					<div
						key={p.name + p.from}
						style={{
							position: 'absolute',
							left: 0,
							top: yTop,
							height: yBot - yTop,
							width: Math.max(110, fx((yTop + yBot) / 2) - 46),
							borderLeft: `3px solid ${k % 2 ? 'var(--t1)' : 'var(--ink-faint)'}`,
							paddingLeft: 8,
						}}
					>
						<button
							type="button"
							onClick={() => setOpen(open === k ? null : k)}
							aria-expanded={open === k}
							style={{
								background: 'transparent',
								border: 0,
								padding: 0,
								textAlign: 'left',
								minHeight: 44,
								cursor: 'pointer',
							}}
						>
							<span className="caps" style={{ fontSize: 13 }}>
								{phaseName(p.name)}
							</span>{' '}
							<span
								className="soft num"
								style={{ fontSize: 12, whiteSpace: 'nowrap' }}
							>
								uke {i0 + 1}
								{i1 > i0 ? `–${i1 + 1}` : ''}
							</span>
							{known.length && yBot - yTop > 46 ? (
								<span
									className="soft num"
									style={{ fontSize: 12, display: 'block' }}
								>
									{fmtHours(Math.min(...known))}
									{Math.max(...known) !== Math.min(...known)
										? `–${fmtHours(Math.max(...known))}`
										: ''}{' '}
									i uka
								</span>
							) : null}
						</button>
						{open === k ? (
							<div
								className="sti-card"
								role="note"
								style={{
									position: 'relative',
									zIndex: 5,
									width: Math.min(W - 24, 300),
									fontSize: 14,
									lineHeight: 1.4,
									padding: 12,
									boxShadow: '0 10px 30px rgba(0,0,0,.12)',
								}}
							>
								<strong>
									{phaseName(p.name)}, uke {i0 + 1}
									{i1 > i0 ? `–${i1 + 1}` : ''}:
								</strong>{' '}
								{phaseWhat(p.name) ?? `${plural(p.weeks, 'uke', 'uker')}.`}
								{hrs.some((h) => h === null) ? (
									<span className="soft">
										{' '}
										Noen uker kan ikke prises:{' '}
										{outlook.slice(i0, i1 + 1).find((w) => w.hours === null)
											?.why ?? 'ukjent'}
										.
									</span>
								) : null}
							</div>
						) : null}
					</div>
				)
			})}
		</div>
	)
}

function FirstWeek({
	week,
	label = 'Første uke',
}: {
	week: PreviewWeek | null
	label?: string
}) {
	if (!week) return null
	return (
		<section style={{ marginTop: 20 }}>
			<div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
				<h2 className="caps" style={{ fontSize: 14 }}>
					{label}
				</h2>
				<span className="soft num" style={{ fontSize: 13 }}>
					{fmtDay(week.weekStart)} · {fmtDuration(week.totals.minutes * 60)} ·{' '}
					{plural(week.totals.sessions, 'steg', 'steg')}
					{week.totals.hardSessions
						? ` · ${week.totals.hardSessions} harde`
						: ''}
				</span>
			</div>
			<div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
				{week.days.map((d) => (
					<div
						key={d.date}
						style={{
							display: 'flex',
							gap: 10,
							alignItems: 'flex-start',
							minHeight: 30,
						}}
					>
						<span
							className="soft num"
							style={{ width: 40, fontSize: 13, paddingTop: 4 }}
						>
							{wdShort(d.weekday)} {Number(d.date.slice(8))}.
						</span>
						<div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 4 }}>
							{d.sessions.length === 0 && d.strength.length === 0 ? (
								<span className="soft" style={{ fontSize: 14, paddingTop: 3 }}>
									hvil
								</span>
							) : null}
							{d.sessions.map((s, i) => (
								<div
									key={i}
									style={{ display: 'flex', gap: 8, alignItems: 'center' }}
								>
									<Stone
										sport={s.sport}
										size={26}
										label={sportLetter(s.sport)}
										fill={
											s.effort === 'hard'
												? 'full'
												: s.effort === 'moderate'
													? 'half'
													: 'empty'
										}
									/>
									<span style={{ fontSize: 15, overflowWrap: 'anywhere' }}>
										{s.title} · <span className="num">{s.minutes} min</span>
									</span>
								</div>
							))}
							{d.strength.map((s, i) => (
								<div
									key={`s${i}`}
									style={{ display: 'flex', gap: 8, alignItems: 'center' }}
								>
									<Stone sport="strength" size={24} label="St" />
									<span style={{ fontSize: 15, overflowWrap: 'anywhere' }}>
										{s.title}
										{s.lifts.length ? (
											<span className="soft"> · {s.lifts.join(', ')}</span>
										) : null}
									</span>
								</div>
							))}
						</div>
					</div>
				))}
			</div>
			<p className="soft" style={{ fontSize: 12, marginTop: 6 }}>
				Fylt helle = hard · halvfylt = middels · tom = rolig
			</p>
		</section>
	)
}

function Adjust({
	setup,
	style,
	options,
	onStyle,
}: {
	setup: SetupState | null
	style: PlanStyle
	options: {
		style: PlanStyle
		name: string
		badge: string | null
		styleName: string
	}[]
	onStyle: (s: PlanStyle) => void
}) {
	const volume = useCapability<SetCurrentVolumeInput, SetupState>(
		'set_current_volume',
	)
	const strength = useCapability<SetStrengthInput, SetupState>('set_strength')
	const range = setup?.choices.hoursPerWeek ?? { min: 1, max: 20, step: 0.5 }
	const [hours, setHours] = useState(
		setup?.answers.currentHoursPerWeek ??
			setup?.suggested?.currentHoursPerWeek ??
			4,
	)
	const [err, setErr] = useState<string | null>(null)
	const timer = useRef(0)
	function changeHours(v: number) {
		setHours(v)
		window.clearTimeout(timer.current)
		timer.current = window.setTimeout(async () => {
			const r = await volume.call({ hoursPerWeek: v })
			setErr(r.ok ? null : r.message)
		}, 350)
	}
	const per = setup?.answers.strengthPerWeek ?? 0
	return (
		<section
			className="sti-card"
			style={{ marginTop: 20, display: 'grid', gap: 18 }}
		>
			<div>
				<h2 style={{ fontSize: 16, fontWeight: 700 }}>Hvordan stien går</h2>
				<div
					role="radiogroup"
					aria-label="Stil"
					style={{ display: 'grid', gap: 8, marginTop: 8 }}
				>
					{options.map((o) => (
						<button
							key={o.style}
							type="button"
							role="radio"
							aria-checked={o.style === style}
							className="sti-chip"
							onClick={() => onStyle(o.style)}
							style={{
								borderRadius: 14,
								justifyContent: 'flex-start',
								textAlign: 'left',
								minHeight: 56,
								padding: '8px 14px',
								flexDirection: 'column',
								alignItems: 'flex-start',
								gap: 0,
							}}
						>
							<span style={{ fontWeight: 650 }}>
								{o.name}
								{o.badge ? (
									<span style={{ fontWeight: 400, opacity: 0.75 }}>
										{' '}
										· {o.badge}
									</span>
								) : null}
							</span>
							<span style={{ fontSize: 12, opacity: 0.7 }}>{o.styleName}</span>
						</button>
					))}
				</div>
			</div>
			<div>
				<div style={{ display: 'flex', justifyContent: 'space-between' }}>
					<h2 style={{ fontSize: 16, fontWeight: 700 }}>Startmengde</h2>
					<span className="num">
						{fmtHours(hours)}/uke {volume.pending ? <Spinner /> : null}
					</span>
				</div>
				<input
					type="range"
					aria-label="Timer i uka nå"
					min={range.min}
					max={range.max}
					step={range.step}
					value={hours}
					onChange={(e) => changeHours(Number(e.target.value))}
					style={{ width: '100%', accentColor: 'var(--ink)', height: 44 }}
				/>
				<p className="soft" style={{ fontSize: 13 }}>
					Mer nå gir en brattere start. Stien tegnes på nytt.
				</p>
			</div>
			<div>
				<h2 style={{ fontSize: 16, fontWeight: 700 }}>Styrkedager</h2>
				<div
					role="radiogroup"
					aria-label="Styrkedager"
					style={{ display: 'flex', gap: 8, marginTop: 8 }}
				>
					{[0, 1, 2, 3].map((n) => (
						<button
							key={n}
							type="button"
							role="radio"
							aria-checked={per === n}
							className="sti-chip num"
							disabled={strength.pending}
							onClick={async () => {
								const r = await strength.call({ perWeek: n as 0 | 1 | 2 | 3 })
								setErr(r.ok ? null : r.message)
							}}
							style={{ flex: 1, justifyContent: 'center' }}
						>
							{n === 0 ? 'Ingen' : n}
						</button>
					))}
				</div>
			</div>
			<ErrorLine message={err} />
			<p className="soft" style={{ fontSize: 13 }}>
				Dager og tak på timer endres i utrustningen.{' '}
				<Link className="sti-link" to={`${BASE}/start/4`}>
					Til dagene
				</Link>
			</p>
		</section>
	)
}

/** No flag: the path is a loop of four weeks that comes round a little higher. */
function MiniLoop({ outlook, lit }: { outlook: OutlookWeek[]; lit: boolean }) {
	const W = 340
	const cx = W / 2
	const cy = 130
	const rx = 120
	const ry = 90
	const weeks = outlook.slice(0, 4)
	const pos = (i: number) => {
		const a = Math.PI / 2 + (i / Math.max(weeks.length, 1)) * Math.PI * 2
		return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as const
	}
	return (
		<svg
			viewBox={`0 0 ${W} 260`}
			style={{
				width: '100%',
				maxWidth: 420,
				display: 'block',
				margin: '18px auto 0',
			}}
			role="img"
			aria-label="Rundløype på fire uker"
		>
			<ellipse
				cx={cx}
				cy={cy}
				rx={rx}
				ry={ry}
				fill="none"
				stroke="var(--t0)"
				strokeWidth="56"
			/>
			<ellipse
				cx={cx}
				cy={cy}
				rx={rx}
				ry={ry}
				fill="none"
				stroke="var(--ink)"
				strokeOpacity=".3"
				strokeWidth="2.5"
				strokeDasharray="1 6"
				strokeLinecap="round"
			/>
			<ellipse
				cx={cx}
				cy={cy}
				rx={rx}
				ry={ry}
				fill="none"
				stroke="var(--ink)"
				strokeWidth="3.5"
				pathLength={1}
				strokeDasharray="1 1"
				style={{
					strokeDashoffset: lit ? 0 : 1,
					transition: 'stroke-dashoffset 800ms cubic-bezier(0.77, 0, 0.175, 1)',
				}}
			/>
			{weeks.map((w, i) => {
				const [x, y] = pos(i)
				return (
					<g key={w.weekStart}>
						<rect
							x={x - 30}
							y={y - 13}
							width="60"
							height="26"
							rx="4"
							fill="var(--slab)"
							stroke="var(--ink)"
							strokeWidth="1.5"
						/>
						<text
							x={x}
							y={y + 4.5}
							textAnchor="middle"
							fontSize="12"
							fontWeight="700"
							fill="var(--ink)"
						>
							{w.hours !== null ? `${fmtHours(w.hours)}` : '?'}
						</text>
						<text
							x={x}
							y={y + 28}
							textAnchor="middle"
							fontSize="11"
							fill="var(--ink-soft)"
						>
							{w.role === 'recovery' ? 'lett uke' : `uke ${i + 1}`}
						</text>
					</g>
				)
			})}
			<text
				x={cx}
				y={cy + 4}
				textAnchor="middle"
				fontSize="14"
				fontWeight="700"
				fill="var(--ink)"
				style={{ fontVariantCaps: 'all-small-caps', letterSpacing: '.08em' }}
			>
				Runde 1
			</text>
		</svg>
	)
}
