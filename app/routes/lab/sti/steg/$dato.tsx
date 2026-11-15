import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useCapability } from '#app/lab/engine/client.ts'
import {
	type SessionBlock,
	type SessionOutput,
} from '#app/lab/engine/reads.types.ts'
import { runCapability } from '#app/lab/engine/registry.server.ts'
import {
	type AddSessionInput,
	type AddSessionOutput,
	type DeleteSessionOutput,
	type EaseSessionOutput,
	type LinkRecordingInput,
	type LinkRecordingOutput,
	type MarkDoneOutput,
	type MoveSessionInput,
	type MoveSessionOutput,
	type ReleaseSessionOutput,
	type SessionIdInput,
	type SetCountsTowardPlanInput,
	type SetCountsTowardPlanOutput,
	type ShortenSessionOutput,
	type SkipSessionOutput,
	type UnlinkRecordingOutput,
} from '#app/lab/engine/sessions.types.ts'
import { Feeling } from '../__feeling.tsx'
import {
	BASE,
	ErrorLine,
	Known,
	Sheet,
	Spinner,
	Stone,
	addDays,
	fmtDuration,
	fmtKm,
	fmtNumber,
	fmtPace,
	markChange,
	phaseName,
	relDay,
	rpeColor,
	sportLetter,
	verdictWord,
	wdShort,
} from '../__ui.tsx'
import { type Route } from './+types/$dato.ts'

export async function loader({ request, params }: Route.LoaderArgs) {
	const date = /^\d{4}-\d{2}-\d{2}$/.test(params.dato) ? params.dato : null
	const url = new URL(request.url)
	const [me, week] = await Promise.all([
		runCapability(request, 'athlete', {}),
		date ? runCapability(request, 'week', { date }) : null,
	])
	const today = me.ok ? me.value.today : null
	if (!date || !week)
		return {
			date: null,
			today,
			week: null,
			session: null,
			error: 'Den datoen finnes ikke på stien.',
			link: null,
		}
	if (!week.ok)
		return {
			date,
			today,
			week: null,
			session: null,
			error: week.message,
			link: null,
		}
	const day = week.value.days.find((d) => d.date === date)
	const wanted = url.searchParams.get('okt')
	const pick =
		day?.sessions.find((s) => s.id === wanted) ??
		day?.sessions.find((s) => s.status !== 'recording-only') ??
		day?.sessions[0] ??
		null
	const session = pick
		? await runCapability(request, 'session', { sessionId: pick.id })
		: null
	let link = null
	if (
		session?.ok &&
		session.value.recording &&
		session.value.status === 'recording-only'
	) {
		const l = await runCapability(request, 'link_options', {
			recordingId: session.value.recording.id,
		})
		link = l.ok ? l.value : null
	}
	return {
		date,
		today,
		week: week.value,
		session: session?.ok ? session.value : null,
		error: session && !session.ok ? session.message : null,
		link,
	}
}

export const meta = () => [{ title: 'Sti · Steget' }]

export default function Steg({ loaderData }: Route.ComponentProps) {
	const { date, today, week, session, error, link } = loaderData
	if (!date || !week || !today) {
		return (
			<Sheet title="Fant ikke steget">
				<ErrorLine message={error ?? 'Noe gikk galt.'} />
			</Sheet>
		)
	}
	const day = week.days.find((d) => d.date === date)!
	return (
		<Sheet
			kicker={`${relDay(date, today)}${week.phase ? ` · uke ${week.phase.planWeek} · ${phaseName(week.phase.name)}` : ''}`}
			title={session ? session.title : 'Hvil. Stien venter.'}
		>
			<WeekStrip week={week} date={date} today={today} />
			{day.sessions.length > 1 ? (
				<div
					role="tablist"
					aria-label="Stegene denne dagen"
					style={{
						display: 'flex',
						gap: 8,
						margin: '14px 0',
						overflowX: 'auto',
					}}
				>
					{day.sessions.map((s) => (
						<Link
							key={s.id}
							role="tab"
							aria-selected={s.id === session?.id}
							to={`${BASE}/steg/${date}?okt=${s.id}`}
							replace
							preventScrollReset
							className="sti-chip"
							aria-pressed={s.id === session?.id}
							style={{ flexShrink: 0, textDecoration: 'none' }}
						>
							<span style={{ whiteSpace: 'nowrap' }}>
								{s.status === 'recording-only'
									? `Ekstra: ${s.sportName}`
									: s.title}
							</span>
						</Link>
					))}
				</div>
			) : null}
			<ErrorLine message={error} />
			{session ? (
				<SessionBody key={session.id} s={session} today={today} link={link} />
			) : (
				<RestDay date={date} today={today} />
			)}
			<AddStep date={date} today={today} />
		</Sheet>
	)
}

function WeekStrip({
	week,
	date,
	today,
}: {
	week: NonNullable<Route.ComponentProps['loaderData']['week']>
	date: string
	today: string
}) {
	return (
		<nav
			aria-label="Uka"
			style={{
				display: 'grid',
				gridTemplateColumns: '44px repeat(7, 1fr) 44px',
				gap: 2,
				alignItems: 'center',
			}}
		>
			<Link
				to={`${BASE}/steg/${addDays(week.weekKey, -1)}`}
				aria-label="Forrige uke"
				className="sti-btn ghost small"
				style={{ padding: 0, border: 0 }}
				replace
			>
				‹
			</Link>
			{week.days.map((d) => {
				const main =
					d.sessions.find((s) => s.status !== 'recording-only') ?? d.sessions[0]
				const here = d.date === date
				return (
					<Link
						key={d.date}
						to={`${BASE}/steg/${d.date}`}
						replace
						aria-current={here ? 'date' : undefined}
						style={{
							display: 'grid',
							justifyItems: 'center',
							gap: 2,
							padding: '4px 0',
							minHeight: 56,
							borderRadius: 10,
							color: 'inherit',
							textDecoration: 'none',
							background: here ? 'var(--fog)' : 'transparent',
						}}
					>
						<span
							className="num"
							style={{
								fontSize: 12,
								fontWeight: d.date === today ? 800 : 500,
								color: d.date === today ? 'var(--dot)' : undefined,
							}}
						>
							{wdShort(d.weekday)}
						</span>
						{main ? (
							<Stone
								sport={main.sport}
								size={22}
								label=""
								fill={
									main.status === 'done' || main.status === 'recording-only'
										? 'full'
										: main.status === 'missed'
											? 'struck'
											: 'empty'
								}
							/>
						) : (
							<span
								style={{
									width: 10,
									height: 3,
									marginTop: 8,
									borderRadius: 2,
									background: 'var(--ink-faint)',
								}}
							/>
						)}
					</Link>
				)
			})}
			<Link
				to={`${BASE}/steg/${addDays(week.weekKey, 7)}`}
				aria-label="Neste uke"
				className="sti-btn ghost small"
				style={{ padding: 0, border: 0 }}
				replace
			>
				›
			</Link>
		</nav>
	)
}

function RestDay({ date, today }: { date: string; today: string }) {
	return (
		<div style={{ marginTop: 18 }}>
			<p style={{ fontSize: 17 }}>
				{date < today
					? 'Ingen steg denne dagen.'
					: 'Ingenting lagt her. Hvil er også en del av stien.'}
			</p>
		</div>
	)
}

// ── One session ──────────────────────────────────────────────────────────────

function SessionBody({
	s,
	today,
	link,
}: {
	s: SessionOutput
	today: string
	link: Route.ComponentProps['loaderData']['link']
}) {
	const c = s.comparison
	const word = verdictWord(c.verdict.call)
	const plannedS = c.durationS.planned.value
	const actualS = c.durationS.actual.value
	const isStrength = s.sport === 'strength'
	return (
		<div style={{ display: 'grid', gap: 20, marginTop: 16 }}>
			<div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
				<Stone
					sport={s.sport}
					size={56}
					label={sportLetter(s.sport)}
					border={s.rpe ? rpeColor(s.rpe) : undefined}
					fill={
						s.status === 'done'
							? c.verdict.call === 'under'
								? 'half'
								: 'full'
							: s.status === 'recording-only'
								? 'full'
								: s.status === 'missed'
									? 'struck'
									: 'empty'
					}
				/>
				<div style={{ minWidth: 0 }}>
					<p style={{ fontSize: 19, fontWeight: 700 }}>
						{isStrength
							? s.strength
								? `${s.strength.prescribedSets} sett`
								: 'Styrke'
							: plannedS
								? fmtDuration(plannedS)
								: actualS
									? fmtDuration(actualS)
									: 'Tid ukjent'}
						{s.purpose ? ` · ${s.purpose.toLowerCase()}` : ''}
					</p>
					<p className="soft" style={{ fontSize: 14 }}>
						{s.sportName}
						{s.time ? ` · ${s.time}` : ''}
						{s.whose === 'athlete' ? ' · din egen' : ''}
						{s.status === 'done'
							? ' · gjort'
							: s.status === 'missed'
								? ' · ikke gjort'
								: s.status === 'recording-only'
									? ' · ekstra fra klokka'
									: ''}
						{s.outsideWeeklyCount ? ' · teller ikke i uka' : ''}
					</p>
				</div>
			</div>
			{s.adjustedBecause ? (
				<div className="sti-fog">Justert: {s.adjustedBecause}</div>
			) : null}
			{s.summary || s.description ? (
				<p style={{ fontSize: 15, lineHeight: 1.5 }}>
					{s.description ?? s.summary}
				</p>
			) : null}

			{link && link.options.length ? (
				<LinkQuestion s={s} options={link.options} />
			) : null}

			{s.status === 'done' || s.status === 'recording-only' ? (
				<section>
					<h2 className="caps" style={{ fontSize: 14, marginBottom: 6 }}>
						Hvordan det gikk
					</h2>
					{word ? (
						<p style={{ fontSize: 18, fontWeight: 650 }}>
							{word === 'traff'
								? 'Traff.'
								: word === 'under'
									? 'Under.'
									: 'Over.'}{' '}
							<span style={{ fontWeight: 400 }}>
								{c.verdict.sentence?.replace(/^(Under|Over|I rute)\s*–\s*/, '')}
							</span>
						</p>
					) : (
						<p className="soft">
							{c.verdict.why ?? 'Ingen plan å holde den opp mot.'}
						</p>
					)}
					<p className="num" style={{ fontSize: 15, marginTop: 4 }}>
						{c.structure.call === null || !s.structure ? (
							plannedS && actualS ? (
								<>
									{s.structure
										? 'Ingen rundetider i fila; sammenligner hele økta: '
										: 'Hele økta: '}
									{Math.round(plannedS / 60)} → {Math.round(actualS / 60)} min
									{word ? `, ${word}` : ''}.
								</>
							) : null
						) : (
							<>{c.structure.label}</>
						)}
						{c.structure.why ? (
							<span className="soft"> {c.structure.why}</span>
						) : null}
					</p>
				</section>
			) : null}

			{s.structure && s.structure.length ? (
				<Profile
					blocks={s.structure}
					plannedS={plannedS}
					actualS={s.status === 'done' ? actualS : null}
				/>
			) : null}
			{s.structure && s.structure.length ? (
				<Targets blocks={s.structure} />
			) : null}
			{s.recording ? <RecordingNumbers s={s} /> : null}
			{s.strength ? <StrengthOverview s={s} /> : null}

			{s.status !== 'planned' || s.date <= today ? (
				<section className="sti-card">
					<Feeling
						sessionId={s.id}
						rpe={s.feeling.rpe}
						note={s.feeling.note}
						allowed={s.can.rateFeeling.allowed}
						why={s.can.rateFeeling.why}
					/>
				</section>
			) : null}

			<Actions s={s} today={today} />
		</div>
	)
}

function intensity(
	step: SessionBlock['steps'][number],
	blockName: string | null,
) {
	if (step.kind === 'rest') return 0.18
	const label = `${step.target?.label ?? ''} ${blockName ?? ''}`
	const z = /Z(\d)/i.exec(label)
	if (z) return Math.min(1, Number(z[1]) / 5.2)
	const pct = /(\d{2,3})\s*[–-]?\s*(\d{2,3})?\s*%/.exec(label)
	if (pct) return Math.min(1, Number(pct[2] ?? pct[1]) / 120)
	if (/oppvarm|warm/i.test(label)) return 0.32
	if (/nedjogg|nedkjøl|cool/i.test(label)) return 0.28
	if (/rolig|easy|lett/i.test(label)) return 0.35
	if (/terskel|threshold|tempo/i.test(label)) return 0.72
	if (/interv|vo2|hard|drag/i.test(label)) return 0.88
	return 0.55
}

/** The session drawn as a small elevation profile: height is intensity. */
function Profile({
	blocks,
	plannedS,
	actualS,
}: {
	blocks: SessionBlock[]
	plannedS: number | null
	actualS: number | null
}) {
	const segs: { d: number; h: number; ramp: 'up' | 'down' | null }[] = []
	for (const b of blocks) {
		const reps = Math.min(40, Math.max(1, b.repeat) * Math.max(1, b.series))
		for (let r = 0; r < reps; r++) {
			for (const st of b.steps) {
				const d = st.durationS ?? (st.distanceM ? st.distanceM / 3.3 : 120)
				const ramp = /oppvarm|warm/i.test(b.name ?? '')
					? 'up'
					: /nedjogg|nedkjøl|cool/i.test(b.name ?? '')
						? 'down'
						: null
				segs.push({ d, h: intensity(st, b.name), ramp })
			}
			if (
				b.restBetweenSeriesS &&
				r < reps - 1 &&
				(r + 1) % Math.max(1, b.repeat) === 0
			)
				segs.push({ d: b.restBetweenSeriesS, h: 0.15, ramp: null })
		}
	}
	const total = segs.reduce((a, s) => a + s.d, 0) || 1
	const W = 340
	const H = 110
	let x = 0
	const pts: string[] = [`M0 ${H}`]
	for (const s of segs) {
		const w = (s.d / total) * W
		const y = H - 8 - s.h * (H - 20)
		if (s.ramp === 'up')
			pts.push(
				`L${x.toFixed(1)} ${(H - 10).toFixed(1)} L${(x + w).toFixed(1)} ${y.toFixed(1)}`,
			)
		else if (s.ramp === 'down')
			pts.push(
				`L${x.toFixed(1)} ${y.toFixed(1)} L${(x + w).toFixed(1)} ${(H - 10).toFixed(1)}`,
			)
		else
			pts.push(
				`L${x.toFixed(1)} ${y.toFixed(1)} L${(x + w).toFixed(1)} ${y.toFixed(1)}`,
			)
		x += w
	}
	pts.push(`L${W} ${H}`)
	const d = pts.join(' ')
	return (
		<section>
			<h2 className="caps" style={{ fontSize: 14, marginBottom: 6 }}>
				Profilen
			</h2>
			<svg
				viewBox={`0 0 ${W} ${H}`}
				style={{ width: '100%', height: 'auto', display: 'block' }}
				role="img"
				aria-label="Økta som høydeprofil: høyde er hvor hardt"
			>
				<path d={`${d} Z`} fill="var(--t0)" opacity=".55" />
				<path
					d={d}
					fill="none"
					stroke="var(--ink)"
					strokeWidth="2"
					strokeLinejoin="round"
				/>
				{actualS && plannedS ? (
					<rect
						x="0"
						y={H - 4}
						width={Math.min(W, (actualS / plannedS) * W)}
						height="4"
						fill="var(--dot)"
						rx="2"
					/>
				) : null}
			</svg>
			<div
				className="soft num"
				style={{
					display: 'flex',
					justifyContent: 'space-between',
					fontSize: 12,
				}}
			>
				<span>start</span>
				<span>{plannedS ? fmtDuration(plannedS) : ''}</span>
			</div>
			{actualS && plannedS ? (
				<p className="soft" style={{ fontSize: 12 }}>
					Streken er planen. Den oransje linja under er hvor lenge du faktisk
					gikk.
				</p>
			) : null}
		</section>
	)
}

function Targets({ blocks }: { blocks: SessionBlock[] }) {
	return (
		<section>
			<h2 className="caps" style={{ fontSize: 14, marginBottom: 6 }}>
				Delene og målene
			</h2>
			<div style={{ display: 'grid', gap: 2 }}>
				{blocks.map((b, i) => (
					<div
						key={i}
						style={{
							padding: '10px 0',
							borderTop: i ? '1px solid var(--ink-faint)' : undefined,
						}}
					>
						<div style={{ fontWeight: 650, fontSize: 15 }}>
							{b.name ?? `Del ${i + 1}`}
							{b.series > 1 ? (
								<span className="num"> · {b.series} serier</span>
							) : null}
							{b.repeat > 1 ? (
								<span className="num"> · {b.repeat}×</span>
							) : null}
						</div>
						{b.steps.some((st) => st.target) ? null : (
							<div
								className="soft"
								style={{ fontSize: 14, overflowWrap: 'anywhere' }}
							>
								{b.text}
							</div>
						)}
						{b.steps.map((st, j) =>
							st.target ? (
								<div
									key={j}
									className="num"
									style={{
										fontSize: 14,
										marginTop: 4,
										display: 'flex',
										gap: 8,
										flexWrap: 'wrap',
									}}
								>
									<span style={{ minWidth: 80 }}>
										{st.kind === 'rest' ? 'Pause' : st.text}
									</span>
									<strong>
										{st.target.resolvedText
											? `${st.target.approximate ? '≈ ' : ''}${st.target.resolvedText}`
											: st.target.label}
									</strong>
									{st.target.resolvedText &&
									st.target.label !== st.target.resolvedText ? (
										<span className="soft">({st.target.label})</span>
									) : null}
									{st.target.why ? (
										<span className="soft" style={{ fontStyle: 'italic' }}>
											{st.target.why}
										</span>
									) : null}
								</div>
							) : null,
						)}
					</div>
				))}
			</div>
		</section>
	)
}

function RecordingNumbers({ s }: { s: SessionOutput }) {
	const r = s.recording!
	const rows: [string, React.ReactNode][] = [
		['Tid', <Known key="t" n={r.durationS} fmt={fmtDuration} />],
		['Distanse', <Known key="d" n={r.distanceM} fmt={fmtKm} />],
		[
			'Snittpuls',
			<Known
				key="h"
				n={r.avgHeartRate}
				fmt={(v) => `${Math.round(v)} slag/min`}
			/>,
		],
		...(s.sport === 'bike'
			? ([
					[
						'Snittwatt',
						<Known
							key="w"
							n={
								r.normalizedPower.value !== null
									? r.normalizedPower
									: r.avgPower
							}
							fmt={(v) => `${Math.round(v)} W`}
						/>,
					],
				] as [string, React.ReactNode][])
			: []),
		...(s.sport === 'run'
			? ([
					[
						'Snittfart',
						<Known key="p" n={r.avgPace} fmt={(v) => fmtPace(v)} />,
					],
				] as [string, React.ReactNode][])
			: []),
		[
			'Stigning',
			<Known key="c" n={r.climbM} fmt={(v) => `${Math.round(v)} m`} />,
		],
		['Belastning', <Known key="l" n={r.load} fmt={(v) => fmtNumber(v)} />],
	]
	return (
		<section>
			<h2 className="caps" style={{ fontSize: 14, marginBottom: 6 }}>
				Fra klokka
			</h2>
			<dl
				style={{
					display: 'grid',
					gridTemplateColumns: 'auto 1fr',
					gap: '6px 16px',
					margin: 0,
					fontSize: 15,
				}}
			>
				{rows.map(([k, v]) => (
					<div key={k} style={{ display: 'contents' }}>
						<dt className="soft">{k}</dt>
						<dd style={{ margin: 0 }}>{v}</dd>
					</div>
				))}
			</dl>
			{r.avgHeartRate.value === null && s.feeling.rpe === null ? (
				<p className="soft" style={{ fontSize: 14, marginTop: 8 }}>
					Ingen puls i fila. Hvor hardt det var, vet jeg ikke. Si det med
					tyngden under.
				</p>
			) : null}
			<p className="soft" style={{ fontSize: 12, marginTop: 6 }}>
				Kom fra {r.from}.
			</p>
		</section>
	)
}

function StrengthOverview({ s }: { s: SessionOutput }) {
	const st = s.strength!
	return (
		<section>
			<h2 className="caps" style={{ fontSize: 14, marginBottom: 6 }}>
				Øvelsene ·{' '}
				<span className="num">
					{st.loggedSets} av {st.prescribedSets} sett
				</span>
			</h2>
			{st.exercises.map((e) => (
				<div
					key={e.stepId}
					style={{
						display: 'flex',
						gap: 10,
						alignItems: 'center',
						padding: '6px 0',
					}}
				>
					<span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
						{e.name}
					</span>
					<span
						style={{ display: 'flex', gap: 3 }}
						aria-label={`${e.sets.filter((x) => x.logged).length} av ${e.sets.length} sett`}
					>
						{e.sets.map((x) => (
							<span
								key={x.number}
								style={{
									width: 12,
									height: 12,
									border: '1.5px solid var(--ink)',
									background: x.logged ? 'var(--ink)' : 'transparent',
									opacity: x.role === 'warmup' ? 0.5 : 1,
								}}
							/>
						))}
					</span>
				</div>
			))}
			{s.can.logStrength.allowed ? (
				<Link
					to={`${BASE}/styrke/${s.id}`}
					className="sti-btn wide"
					style={{ marginTop: 10 }}
				>
					Til Styrkeleiren
				</Link>
			) : s.can.logStrength.why ? (
				<p className="soft" style={{ fontSize: 14 }}>
					{s.can.logStrength.why}
				</p>
			) : null}
		</section>
	)
}

function LinkQuestion({
	s,
	options,
}: {
	s: SessionOutput
	options: { id: string; title: string | null; minutes: number | null }[]
}) {
	const navigate = useNavigate()
	const link = useCapability<LinkRecordingInput, LinkRecordingOutput>(
		'link_recording',
	)
	const [err, setErr] = useState<string | null>(null)
	const [dismissed, setDismissed] = useState(false)
	if (dismissed) return null
	return (
		<section
			className="sti-card"
			style={{ borderColor: 'var(--alt)', display: 'grid', gap: 10 }}
		>
			<p style={{ fontSize: 16 }}>
				Fikk en {s.sportName.toLowerCase()}tur. Var den dagens steg?
			</p>
			{options.map((o) => (
				<button
					key={o.id}
					type="button"
					className="sti-btn alt"
					disabled={link.pending}
					onClick={async () => {
						const r = await link.call({
							recordingId: s.recording!.id,
							sessionId: o.id,
						})
						if (!r.ok) return setErr(r.message)
						markChange(
							`Koblet til «${o.title ?? 'steget'}». Hellen er fylt.`,
							r.value,
							[o.id],
						)
						void navigate(`${BASE}/steg/${s.date}?okt=${o.id}`, {
							replace: true,
						})
					}}
				>
					Ja, det var «{o.title ?? 'steget'}»
					{o.minutes ? ` (${o.minutes} min)` : ''}
				</button>
			))}
			<button
				type="button"
				className="sti-btn quiet"
				onClick={() => setDismissed(true)}
			>
				Nei, den var ekstra
			</button>
			<ErrorLine message={err} />
		</section>
	)
}

// ── What can be done to it ───────────────────────────────────────────────────

function Actions({ s, today }: { s: SessionOutput; today: string }) {
	const navigate = useNavigate()
	const done = useCapability<SessionIdInput, MarkDoneOutput>('mark_done')
	const skip = useCapability<SessionIdInput, SkipSessionOutput>('skip_session')
	const shorten = useCapability<SessionIdInput, ShortenSessionOutput>(
		'shorten_session',
	)
	const ease = useCapability<SessionIdInput, EaseSessionOutput>('ease_session')
	const move = useCapability<MoveSessionInput, MoveSessionOutput>(
		'move_session',
	)
	const del = useCapability<SessionIdInput, DeleteSessionOutput>(
		'delete_session',
	)
	const release = useCapability<SessionIdInput, ReleaseSessionOutput>(
		'release_session',
	)
	const counts = useCapability<
		SetCountsTowardPlanInput,
		SetCountsTowardPlanOutput
	>('set_counts_toward_plan')
	const unlink = useCapability<{ recordingId: string }, UnlinkRecordingOutput>(
		'unlink_recording',
	)
	const [err, setErr] = useState<string | null>(null)
	const [moving, setMoving] = useState(false)
	const [confirmDel, setConfirmDel] = useState(false)
	const pending =
		done.pending ||
		skip.pending ||
		shorten.pending ||
		ease.pending ||
		move.pending ||
		del.pending ||
		release.pending ||
		counts.pending ||
		unlink.pending

	async function run<
		T extends { undo: string | null; noUndoBecause: string | null },
	>(
		p: Promise<{ ok: true; value: T } | { ok: false; message: string }>,
		text: (v: T) => string,
	) {
		setErr(null)
		const r = await p
		if (!r.ok) return setErr(r.message)
		markChange(text(r.value), r.value, [s.id])
	}
	const can = s.can
	const disabled = (a: { allowed: boolean }) => !a.allowed || pending
	const why = [
		can.markDone,
		can.move,
		can.skip,
		can.shorten,
		can.makeEasier,
	].find((a) => !a.allowed && a.why)?.why

	return (
		<section style={{ display: 'grid', gap: 10 }}>
			<h2 className="caps" style={{ fontSize: 14 }}>
				Når livet skjer
			</h2>
			<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
				{s.sport === 'strength' && can.logStrength.allowed ? (
					<Link to={`${BASE}/styrke/${s.id}`} className="sti-btn small">
						Logg sett
					</Link>
				) : can.markDone.allowed ? (
					<button
						type="button"
						className="sti-btn small"
						disabled={pending}
						onClick={() =>
							run(
								done.call({ sessionId: s.id }),
								() => 'Gjort. Prikken gikk et steg.',
							)
						}
					>
						Gjort
					</button>
				) : null}
				{can.move.allowed ? (
					<button
						type="button"
						className="sti-btn quiet small"
						disabled={pending}
						aria-expanded={moving}
						onClick={() => setMoving((m) => !m)}
					>
						Flytt
					</button>
				) : null}
				{can.shorten.allowed ? (
					<button
						type="button"
						className="sti-btn quiet small"
						disabled={disabled(can.shorten)}
						onClick={() =>
							run(
								shorten.call({ sessionId: s.id }),
								(v) =>
									`Kortere: ${v.minutesBefore ?? '?'} → ${v.minutesAfter ?? '?'} min.`,
							)
						}
					>
						Kortere
					</button>
				) : null}
				{can.makeEasier.allowed ? (
					<button
						type="button"
						className="sti-btn quiet small"
						disabled={disabled(can.makeEasier)}
						onClick={() =>
							run(
								ease.call({ sessionId: s.id }),
								(v) =>
									`Lettere: ${v.minutesBefore ?? '?'} → ${v.minutesAfter ?? '?'} min, rolig.`,
							)
						}
					>
						For sliten
					</button>
				) : null}
				{can.skip.allowed ? (
					<button
						type="button"
						className="sti-btn quiet small"
						disabled={disabled(can.skip)}
						onClick={() =>
							run(skip.call({ sessionId: s.id }), (v) =>
								v.state === 'skipped' ? 'Hoppet over.' : 'Ført som ikke gjort.',
							)
						}
					>
						Hopp over
					</button>
				) : null}
			</div>
			{moving ? (
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: 'repeat(4, 1fr)',
						gap: 6,
					}}
				>
					{Array.from({ length: 12 }, (_, i) => addDays(today, i))
						.filter((d) => d !== s.date)
						.map((d) => (
							<button
								key={d}
								type="button"
								className="sti-chip num"
								disabled={pending}
								style={{ justifyContent: 'center', padding: 0 }}
								onClick={async () => {
									setErr(null)
									const r = await move.call({ sessionId: s.id, date: d })
									if (!r.ok) return setErr(r.message)
									const warn = r.value.clashes.map((c) => c.text).join(', ')
									markChange(
										`Flyttet til ${relDay(d, today)}.${warn ? ` Obs: ${warn}.` : ''}`,
										r.value,
										[s.id],
									)
									void navigate(`${BASE}/steg/${d}?okt=${s.id}`, {
										replace: true,
									})
								}}
							>
								{wdShort(
									['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][
										new Date(`${d}T12:00:00Z`).getUTCDay()
									]!,
								)}{' '}
								{Number(d.slice(8))}.
							</button>
						))}
				</div>
			) : null}
			{why && !can.markDone.allowed && !can.move.allowed ? (
				<p className="soft" style={{ fontSize: 14 }}>
					{why}
				</p>
			) : null}
			<div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
				{s.recording && s.status === 'done' ? (
					<button
						type="button"
						className="sti-link"
						style={{ fontSize: 14, marginRight: 12 }}
						disabled={pending}
						onClick={() =>
							run(
								unlink.call({ recordingId: s.recording!.id }),
								() => 'Koblet fra. Opptaket står som et ekstra steg.',
							)
						}
					>
						Feil kobling? Koble fra opptaket
					</button>
				) : null}
				<button
					type="button"
					className="sti-link"
					style={{ fontSize: 14, marginRight: 12 }}
					disabled={pending}
					onClick={() =>
						run(
							counts.call({
								sessionId: s.id,
								countsTowardPlan: s.outsideWeeklyCount,
							}),
							(v) =>
								v.changed[0]?.countsTowardPlan
									? 'Teller i uka igjen.'
									: 'Teller ikke i uka lenger (belastningen teller fortsatt).',
						)
					}
				>
					{s.outsideWeeklyCount ? 'La den telle i uka' : 'Ikke tell den i uka'}
				</button>
				{s.whose === 'athlete' && s.status === 'planned' ? (
					<button
						type="button"
						className="sti-link"
						style={{ fontSize: 14, marginRight: 12 }}
						disabled={pending}
						onClick={() =>
							run(release.call({ sessionId: s.id }), (v) =>
								v.released
									? 'Planen kan nå justere den.'
									: 'Den var planens fra før.',
							)
						}
					>
						La planen styre den
					</button>
				) : null}
				{s.whose === 'athlete' ? (
					confirmDel ? (
						<span
							style={{
								display: 'flex',
								gap: 8,
								alignItems: 'center',
								flexWrap: 'wrap',
							}}
						>
							<span style={{ fontSize: 14 }}>
								Slettes for godt. Kan ikke angres.
							</span>
							<button
								type="button"
								className="sti-btn danger small"
								disabled={pending}
								onClick={async () => {
									const r = await del.call({ sessionId: s.id })
									if (!r.ok) return setErr(r.message)
									markChange('Steget er slettet.', r.value, [])
									void navigate(`${BASE}/steg/${s.date}`, { replace: true })
								}}
							>
								Slett
							</button>
							<button
								type="button"
								className="sti-btn ghost small"
								onClick={() => setConfirmDel(false)}
							>
								Avbryt
							</button>
						</span>
					) : (
						<button
							type="button"
							className="sti-link"
							style={{ fontSize: 14, color: 'var(--warn)' }}
							onClick={() => setConfirmDel(true)}
						>
							Slett steget …
						</button>
					)
				) : null}
			</div>
			{pending ? (
				<p className="soft">
					<Spinner /> Legger om stien …
				</p>
			) : null}
			<ErrorLine message={err} />
		</section>
	)
}

function AddStep({ date, today }: { date: string; today: string }) {
	const add = useCapability<AddSessionInput, AddSessionOutput>('add_session')
	const navigate = useNavigate()
	const [open, setOpen] = useState(false)
	const [text, setText] = useState('')
	const [already, setAlready] = useState(date < today)
	const [err, setErr] = useState<string | null>(null)
	if (!open) {
		return (
			<button
				type="button"
				className="sti-link"
				onClick={() => setOpen(true)}
				style={{ marginTop: 24 }}
			>
				+ Legg et ekstra steg {relDay(date, today)}
			</button>
		)
	}
	return (
		<form
			style={{ marginTop: 24, display: 'grid', gap: 10 }}
			onSubmit={async (e) => {
				e.preventDefault()
				setErr(null)
				const r = await add.call({
					date,
					sentence: text.trim(),
					...(date <= today && already ? { alreadyDone: true } : {}),
				})
				if (!r.ok) return setErr(r.message)
				markChange(
					r.value.notDoneBecause
						? `Lagt til. ${r.value.notDoneBecause}`
						: 'Steget er lagt til.',
					r.value,
					[r.value.sessionId],
				)
				setText('')
				setOpen(false)
				void navigate(`${BASE}/steg/${date}?okt=${r.value.sessionId}`, {
					replace: true,
				})
			}}
		>
			<label style={{ display: 'grid', gap: 6 }}>
				<span style={{ fontWeight: 600, fontSize: 14 }}>
					Si det med egne ord
				</span>
				<input
					className="sti-field"
					value={text}
					onChange={(e) => setText(e.target.value)}
					placeholder="45 min rolig · 4x8 min terskel · knebøy 3x10 60 kg"
					enterKeyHint="done"
				/>
			</label>
			{date <= today ? (
				<label
					style={{
						display: 'flex',
						gap: 10,
						alignItems: 'center',
						minHeight: 44,
					}}
				>
					<input
						type="checkbox"
						checked={already}
						onChange={(e) => setAlready(e.target.checked)}
						style={{ width: 22, height: 22, accentColor: 'var(--ink)' }}
					/>
					Det er alt gjort
				</label>
			) : null}
			<ErrorLine message={err} />
			<div style={{ display: 'flex', gap: 8 }}>
				<button
					className="sti-btn"
					type="submit"
					disabled={add.pending || !text.trim()}
				>
					{add.pending ? <Spinner /> : null}
					Legg til
				</button>
				<button
					className="sti-btn ghost"
					type="button"
					onClick={() => setOpen(false)}
				>
					Avbryt
				</button>
			</div>
		</form>
	)
}
